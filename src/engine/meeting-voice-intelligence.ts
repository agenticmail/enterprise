/**
 * Meeting Voice Intelligence — Natural conversational presence for AI agents.
 *
 * DESIGN PHILOSOPHY: Make the agent feel like a human participant.
 * Humans don't go silent for 5-10 seconds when thinking — they say
 * "hmm", "let me think about that", "actually..." while processing.
 *
 * SYSTEMS:
 * 1. Pre-generated Audio Bank — On meeting join, generate introduction +
 *    filler phrases + interruption acknowledgments in the agent's voice
 * 2. Response Time Predictor — Estimate LLM + TTS latency, select
 *    appropriate fillers to cover the gap naturally
 * 3. Context-Aware Speaking — Know when to speak vs. listen in group meetings
 * 4. Interruption Handler — Detect when someone talks over the agent,
 *    stop playback, acknowledge gracefully
 * 5. Audio Playback Controller — Queue management, interruption, streaming
 *
 * LATENCY MODEL (physics-based):
 *   T_total = T_llm + T_tts_first_byte + T_tts_stream
 *   T_llm ≈ f(input_tokens, model_speed) → typically 1.5-8s
 *   T_tts_first_byte ≈ 300-800ms (ElevenLabs turbo)
 *   T_tts_stream ≈ proportional to text length
 *
 * The filler system bridges T_llm + T_tts_first_byte (~2-9s gap).
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface FillerAudio {
  id: string;
  category: FillerCategory;
  text: string;
  /** Pre-generated audio file path */
  audioPath: string;
  /** Estimated duration in ms */
  durationMs: number;
  /** Context tags for smart selection */
  tags: string[];
  /** How many times used this session (avoid repetition) */
  usageCount: number;
}

export type FillerCategory =
  | 'thinking'       // "hmm", "let me think about that"
  | 'processing'     // "let me check that", "pulling up the data"
  | 'transition'     // "actually", "so", "well"
  | 'acknowledgment' // "good question", "that's interesting"
  | 'introduction'   // "hey everyone, I'm Fola..."
  | 'interruption'   // "oh sorry, go ahead", "you were saying?"
  | 'resumption'     // "as I was saying", "anyway, back to my point"
  | 'agreement'      // "right", "exactly", "yeah"
  | 'stalling'       // longer fillers for big responses
  ;

export interface ResponseTimePrediction {
  /** Estimated total time until audio starts playing (ms) */
  estimatedLatencyMs: number;
  /** Breakdown */
  llmEstimateMs: number;
  ttsFirstByteMs: number;
  /** Recommended filler strategy */
  strategy: 'none' | 'short' | 'medium' | 'long' | 'chain';
  /** Specific fillers to play (in order) */
  fillerIds: string[];
  /** Total filler duration (ms) */
  fillerDurationMs: number;
}

export interface SpeakingContext {
  /** What was said (caption text) */
  captionText: string;
  /** Who said it */
  speaker: string;
  /** Is this directed at the agent? */
  directedAtAgent: boolean;
  /** Question complexity (affects LLM time) */
  complexity: 'simple' | 'moderate' | 'complex';
  /** Number of participants */
  participantCount: number;
  /** Is the agent the one being asked? */
  isQuestion: boolean;
}

// ═══════════════════════════════════════════════════════════
// FILLER PHRASES — Categorized and tagged
// ═══════════════════════════════════════════════════════════

const FILLER_PHRASES: Array<{ text: string; category: FillerCategory; tags: string[]; estimatedMs: number }> = [
  // ─── Thinking (short, 0.5-1.5s) ───
  { text: 'Hmm.', category: 'thinking', tags: ['short', 'universal'], estimatedMs: 600 },
  { text: 'Hmm, let me think about that.', category: 'thinking', tags: ['medium', 'question'], estimatedMs: 1800 },
  { text: 'That is a great question.', category: 'thinking', tags: ['medium', 'question'], estimatedMs: 1500 },
  { text: 'Hmm, interesting.', category: 'thinking', tags: ['short', 'discussion'], estimatedMs: 1000 },
  { text: 'Let me think about that more carefully.', category: 'thinking', tags: ['medium', 'complex'], estimatedMs: 2000 },

  // ─── Processing (1-3s) ───
  { text: 'Let me check on that real quick.', category: 'processing', tags: ['medium', 'data'], estimatedMs: 1800 },
  { text: 'Give me one second.', category: 'processing', tags: ['short', 'universal'], estimatedMs: 1200 },
  { text: 'Let me pull that up.', category: 'processing', tags: ['medium', 'data'], estimatedMs: 1200 },
  { text: 'Let me look into that.', category: 'processing', tags: ['medium', 'research'], estimatedMs: 1500 },
  { text: 'One moment, let me check.', category: 'processing', tags: ['medium', 'universal'], estimatedMs: 1500 },

  // ─── Transition (short, 0.5-1s) ───
  { text: 'So,', category: 'transition', tags: ['short', 'start'], estimatedMs: 400 },
  { text: 'Actually,', category: 'transition', tags: ['short', 'start'], estimatedMs: 500 },
  { text: 'Well,', category: 'transition', tags: ['short', 'start'], estimatedMs: 400 },
  { text: 'Right, so', category: 'transition', tags: ['short', 'start'], estimatedMs: 600 },
  { text: 'OK so,', category: 'transition', tags: ['short', 'start'], estimatedMs: 500 },

  // ─── Acknowledgment (1-2s) ───
  { text: 'Good question.', category: 'acknowledgment', tags: ['short', 'question'], estimatedMs: 900 },
  { text: 'Yeah, that is a really good point.', category: 'acknowledgment', tags: ['medium', 'discussion'], estimatedMs: 1800 },
  { text: 'I hear you on that.', category: 'acknowledgment', tags: ['short', 'empathy'], estimatedMs: 1200 },
  { text: 'Absolutely.', category: 'acknowledgment', tags: ['short', 'agreement'], estimatedMs: 700 },
  { text: 'That makes total sense.', category: 'acknowledgment', tags: ['medium', 'agreement'], estimatedMs: 1200 },

  // ─── Interruption recovery ───
  { text: 'Oh sorry, go ahead.', category: 'interruption', tags: ['short', 'polite'], estimatedMs: 1200 },
  { text: 'Go ahead, I will wait.', category: 'interruption', tags: ['short', 'polite'], estimatedMs: 1200 },
  { text: 'No worries, finish your thought.', category: 'interruption', tags: ['medium', 'polite'], estimatedMs: 1500 },

  // ─── Resumption (after interruption) ───
  { text: 'As I was saying,', category: 'resumption', tags: ['short', 'continue'], estimatedMs: 1000 },
  { text: 'Anyway, back to what I was saying,', category: 'resumption', tags: ['medium', 'continue'], estimatedMs: 1500 },
  { text: 'So where was I, right,', category: 'resumption', tags: ['medium', 'continue'], estimatedMs: 1200 },

  // ─── Stalling (longer, for complex questions 3-5s) ───
  { text: 'OK so that is actually a really interesting question. Let me think about the best way to explain this.', category: 'stalling', tags: ['long', 'complex'], estimatedMs: 4500 },
  { text: 'Hmm, there is actually a few things to unpack there. Let me organize my thoughts.', category: 'stalling', tags: ['long', 'complex'], estimatedMs: 4000 },
  { text: 'That is a great point. Let me think about how to approach that from the right angle.', category: 'stalling', tags: ['long', 'complex'], estimatedMs: 3500 },
  { text: 'Let me check on a couple things and I will get back to you on that in just a second.', category: 'stalling', tags: ['long', 'data'], estimatedMs: 4000 },

  // ─── Agreement (very short, casual) ───
  { text: 'Right.', category: 'agreement', tags: ['short', 'casual'], estimatedMs: 400 },
  { text: 'Exactly.', category: 'agreement', tags: ['short', 'casual'], estimatedMs: 500 },
  { text: 'Yeah, for sure.', category: 'agreement', tags: ['short', 'casual'], estimatedMs: 800 },
  { text: 'Mm-hmm.', category: 'agreement', tags: ['short', 'casual'], estimatedMs: 500 },
];

// ─── Introduction templates (personalized per agent) ───
const INTRO_TEMPLATES = [
  'Hey everyone, I am {name}. Nice to join you all.',
  'Hi, {name} here. Thanks for having me.',
  'Hey, this is {name}. Great to be here.',
  'Hi everyone, I am {name}. Looking forward to the discussion.',
  'Hey, {name} joining. Happy to be here.',
];

// ═══════════════════════════════════════════════════════════
// AUDIO PLAYBACK CONTROLLER
// ═══════════════════════════════════════════════════════════

class AudioPlaybackController {
  private currentPlayer: ChildProcessWithoutNullStreams | null = null;
  private queue: Array<{ audioPath: string; resolve: () => void; reject: (e: Error) => void }> = [];
  private playing = false;
  private interrupted = false;
  private device: string;

  constructor(device: string) {
    this.device = device;
  }

  /** Play audio file. Returns when playback finishes or is interrupted. */
  async play(audioPath: string): Promise<{ completed: boolean; interrupted: boolean }> {
    this.interrupted = false;

    return new Promise((resolve) => {
      const platform = process.platform;
      let cmd: string;
      let args: string[];

      if (platform === 'darwin') {
        cmd = 'sox';
        args = [audioPath, '-t', 'coreaudio', this.device];
      } else if (platform === 'linux') {
        cmd = 'paplay';
        args = this.device ? ['--device=' + this.device, audioPath] : [audioPath];
      } else {
        cmd = 'sox';
        args = [audioPath, '-t', 'waveaudio', this.device];
      }

      const player = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      this.currentPlayer = player;
      this.playing = true;

      player.on('close', (code) => {
        this.currentPlayer = null;
        this.playing = false;
        resolve({
          completed: !this.interrupted && (code === 0 || code === null),
          interrupted: this.interrupted,
        });
      });

      player.on('error', () => {
        this.currentPlayer = null;
        this.playing = false;
        resolve({ completed: false, interrupted: this.interrupted });
      });
    });
  }

  /** Stream from ElevenLabs directly to audio device */
  async streamToDevice(
    apiKey: string, text: string, voiceId: string,
    options?: { model?: string; stability?: number; similarity?: number }
  ): Promise<{ completed: boolean; interrupted: boolean; durationMs: number }> {
    this.interrupted = false;
    const start = Date.now();

    const model = options?.model || 'eleven_turbo_v2_5';
    const res = await fetch(`${ELEVENLABS_BASE}/text-to-speech/${voiceId}/stream`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: { stability: options?.stability ?? 0.5, similarity_boost: options?.similarity ?? 0.75, style: 0.0, use_speaker_boost: true },
        output_format: 'mp3_22050_32',
        optimize_streaming_latency: 4,
      }),
    });

    if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text().catch(() => '')}`);

    const platform = process.platform;
    let cmd: string, args: string[];
    if (platform === 'darwin') { cmd = 'sox'; args = ['-t', 'mp3', '-', '-t', 'coreaudio', this.device]; }
    else if (platform === 'linux') { cmd = 'paplay'; args = ['--raw']; }
    else { cmd = 'sox'; args = ['-t', 'mp3', '-', '-t', 'waveaudio', this.device]; }

    const player = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'pipe'] });
    this.currentPlayer = player;
    this.playing = true;

    const reader = res.body!.getReader();
    try {
      while (true) {
        if (this.interrupted) { reader.cancel(); break; }
        const { done, value } = await reader.read();
        if (done) break;
        const canWrite = player.stdin!.write(Buffer.from(value));
        if (!canWrite) await new Promise<void>(r => player.stdin!.once('drain', r));
      }
      player.stdin!.end();
    } catch { player.kill(); }

    return new Promise((resolve) => {
      player.on('close', () => {
        this.currentPlayer = null;
        this.playing = false;
        resolve({ completed: !this.interrupted, interrupted: this.interrupted, durationMs: Date.now() - start });
      });
      player.on('error', () => {
        this.currentPlayer = null;
        this.playing = false;
        resolve({ completed: false, interrupted: this.interrupted, durationMs: Date.now() - start });
      });
    });
  }

  /** Immediately stop current playback (for interruptions) */
  interrupt(): boolean {
    if (!this.currentPlayer || !this.playing) return false;
    this.interrupted = true;
    this.currentPlayer.kill('SIGTERM');
    return true;
  }

  get isPlaying(): boolean { return this.playing; }
}

// ═══════════════════════════════════════════════════════════
// RESPONSE TIME PREDICTOR
// ═══════════════════════════════════════════════════════════

interface LatencyHistory {
  llmLatencies: number[];
  ttsLatencies: number[];
}

class ResponseTimePredictor {
  private history: LatencyHistory = { llmLatencies: [], ttsLatencies: [] };
  private readonly maxHistory = 20;

  /** Record actual latency for adaptive prediction */
  record(llmMs: number, ttsFirstByteMs: number) {
    this.history.llmLatencies.push(llmMs);
    this.history.ttsLatencies.push(ttsFirstByteMs);
    if (this.history.llmLatencies.length > this.maxHistory) this.history.llmLatencies.shift();
    if (this.history.ttsLatencies.length > this.maxHistory) this.history.ttsLatencies.shift();
  }

  /** Predict response latency based on question complexity and history */
  predict(context: SpeakingContext, modelSpeed: 'fast' | 'medium' | 'slow' = 'medium'): ResponseTimePrediction {
    // ─── LLM latency estimation ───
    // Base latencies by model speed tier
    const baseLlm: Record<string, Record<string, number>> = {
      fast:   { simple: 1200, moderate: 2000, complex: 3500 },
      medium: { simple: 2000, moderate: 4000, complex: 7000 },
      slow:   { simple: 3500, moderate: 6000, complex: 10000 },
    };
    let llmEstimate = baseLlm[modelSpeed][context.complexity];

    // Adaptive: use exponential moving average of actual latencies
    if (this.history.llmLatencies.length >= 3) {
      const recent = this.history.llmLatencies.slice(-5);
      const ema = recent.reduce((acc, v, i) => {
        const weight = Math.pow(0.7, recent.length - 1 - i);
        return acc + v * weight;
      }, 0) / recent.reduce((_, __, i) => _ + Math.pow(0.7, recent.length - 1 - i), 0);
      // Blend model-based estimate with actual history (60% history, 40% model)
      llmEstimate = ema * 0.6 + llmEstimate * 0.4;
    }

    // ─── TTS first-byte latency ───
    let ttsFirstByte = 500; // ElevenLabs turbo typical
    if (this.history.ttsLatencies.length >= 3) {
      const recent = this.history.ttsLatencies.slice(-5);
      ttsFirstByte = recent.reduce((a, b) => a + b, 0) / recent.length;
    }

    const totalLatency = llmEstimate + ttsFirstByte;
    return this.selectFillerStrategy(totalLatency, context);
  }

  /** Select fillers to cover the estimated gap */
  private selectFillerStrategy(gapMs: number, context: SpeakingContext): ResponseTimePrediction {
    if (gapMs < 800) {
      // Very fast — no filler needed
      return { estimatedLatencyMs: gapMs, llmEstimateMs: gapMs - 500, ttsFirstByteMs: 500, strategy: 'none', fillerIds: [], fillerDurationMs: 0 };
    }

    if (gapMs < 2000) {
      // Short gap — single short filler
      return { estimatedLatencyMs: gapMs, llmEstimateMs: gapMs - 500, ttsFirstByteMs: 500, strategy: 'short', fillerIds: [], fillerDurationMs: 0 };
    }

    if (gapMs < 4000) {
      // Medium gap — acknowledgment + thinking filler
      return { estimatedLatencyMs: gapMs, llmEstimateMs: gapMs - 500, ttsFirstByteMs: 500, strategy: 'medium', fillerIds: [], fillerDurationMs: 0 };
    }

    if (gapMs < 7000) {
      // Long gap — stalling phrase
      return { estimatedLatencyMs: gapMs, llmEstimateMs: gapMs - 500, ttsFirstByteMs: 500, strategy: 'long', fillerIds: [], fillerDurationMs: 0 };
    }

    // Very long — chain multiple fillers
    return { estimatedLatencyMs: gapMs, llmEstimateMs: gapMs - 500, ttsFirstByteMs: 500, strategy: 'chain', fillerIds: [], fillerDurationMs: 0 };
  }
}

// ═══════════════════════════════════════════════════════════
// CONTEXT-AWARE SPEAKING DECISION ENGINE
// ═══════════════════════════════════════════════════════════

export class SpeakingDecisionEngine {
  private agentName: string;
  private agentAliases: string[];
  /** Track conversation to know when agent should contribute */
  private recentCaptions: Array<{ speaker: string; text: string; ts: number }> = [];
  private lastAgentSpokeAt = 0;
  private noteBuffer: string[] = [];

  constructor(agentName: string, aliases: string[] = []) {
    this.agentName = agentName;
    this.agentAliases = [agentName.toLowerCase(), ...aliases.map(a => a.toLowerCase())];
  }

  /** Analyze caption context and decide: speak, listen, or take notes */
  analyze(captions: Array<{ speaker: string; text: string }>): {
    shouldSpeak: boolean;
    reason: string;
    directedAtAgent: boolean;
    isQuestion: boolean;
    complexity: 'simple' | 'moderate' | 'complex';
  } {
    const now = Date.now();
    const fullText = captions.map(c => c.text).join(' ').toLowerCase();
    const lastCaption = captions[captions.length - 1];

    // Track recent captions
    for (const c of captions) {
      this.recentCaptions.push({ speaker: c.speaker, text: c.text, ts: now });
    }
    // Keep last 2 minutes
    this.recentCaptions = this.recentCaptions.filter(c => now - c.ts < 120_000);

    // ─── Check if directed at agent ───
    const directedAtAgent = this.agentAliases.some(alias =>
      fullText.includes(alias) ||
      fullText.includes(`@${alias}`) ||
      fullText.includes(`hey ${alias}`) ||
      fullText.includes(`${alias},`)
    );

    // ─── Question detection ───
    const questionPatterns = [
      /\?$/, /what do you think/i, /can you/i, /could you/i, /would you/i,
      /do you know/i, /any thoughts/i, /what about/i, /how about/i,
      /anyone.*thoughts/i, /does anyone/i, /let's hear from/i,
    ];
    const isQuestion = questionPatterns.some(p => p.test(fullText));

    // ─── Complexity estimation ───
    const wordCount = fullText.split(/\s+/).length;
    const complexity: 'simple' | 'moderate' | 'complex' =
      wordCount < 15 ? 'simple' :
      wordCount < 40 ? 'moderate' : 'complex';

    // ─── Decision: should the agent speak? ───

    // Always speak if directly addressed
    if (directedAtAgent) {
      return { shouldSpeak: true, reason: 'Directly addressed', directedAtAgent: true, isQuestion, complexity };
    }

    // Speak if asked a general question and agent hasn't spoken recently
    if (isQuestion && now - this.lastAgentSpokeAt > 15_000) {
      // In group meetings, only respond to general questions sometimes
      const recentSpeakers = new Set(this.recentCaptions.filter(c => now - c.ts < 30_000).map(c => c.speaker));
      if (recentSpeakers.size <= 2) {
        // Small meeting — more likely the question is for the agent
        return { shouldSpeak: true, reason: 'Question in small meeting', directedAtAgent: false, isQuestion: true, complexity };
      }
      // Larger meeting — stay quiet unless directly asked
      return { shouldSpeak: false, reason: 'Question in group meeting, not directly addressed', directedAtAgent: false, isQuestion: true, complexity };
    }

    // Agent has relevant expertise and wants to contribute
    // (This would be enhanced with the agent's knowledge graph)
    if (now - this.lastAgentSpokeAt > 60_000 && this.recentCaptions.length > 10) {
      // Been silent for a minute with active discussion — maybe contribute
      return { shouldSpeak: false, reason: 'Active discussion, taking notes', directedAtAgent: false, isQuestion: false, complexity };
    }

    // Default: listen and take notes
    return { shouldSpeak: false, reason: 'Listening', directedAtAgent: false, isQuestion, complexity };
  }

  recordAgentSpoke() {
    this.lastAgentSpokeAt = Date.now();
  }

  addNote(note: string) {
    this.noteBuffer.push(note);
  }

  getNotes(): string[] {
    return [...this.noteBuffer];
  }

  clearNotes() {
    this.noteBuffer = [];
  }
}

// ═══════════════════════════════════════════════════════════
// MEETING VOICE INTELLIGENCE — Main orchestrator
// ═══════════════════════════════════════════════════════════

export interface MeetingVoiceConfig {
  agentId: string;
  agentName: string;
  agentAliases?: string[];
  voiceId: string;
  voiceName?: string;
  audioDevice: string;
  apiKey: string;
  modelSpeed?: 'fast' | 'medium' | 'slow';
}

export class MeetingVoiceIntelligence {
  private config: MeetingVoiceConfig;
  private audioBank: Map<string, FillerAudio> = new Map();
  private playback: AudioPlaybackController;
  private predictor: ResponseTimePredictor;
  private speakingEngine: SpeakingDecisionEngine;
  private audioDir: string;
  private ready = false;
  private generating = false;
  /** Track what was interrupted for resumption */
  private interruptedText: string | null = null;
  /** Currently playing filler sequence (for interruption tracking) */
  private currentFillerSequence: string[] = [];

  constructor(config: MeetingVoiceConfig) {
    this.config = config;
    this.playback = new AudioPlaybackController(config.audioDevice);
    this.predictor = new ResponseTimePredictor();
    this.speakingEngine = new SpeakingDecisionEngine(config.agentName, config.agentAliases);
    this.audioDir = path.join(os.tmpdir(), `agenticmail-voice-${config.agentId}`);
  }

  // ─── Initialization (call on meeting join) ──────────────

  /**
   * Pre-generate the audio bank for this meeting.
   * Call this when the agent joins a meeting — generates all fillers
   * in the agent's configured voice so they're ready instantly.
   *
   * Takes ~15-30 seconds total (parallelized). Non-blocking.
   */
  async initialize(): Promise<{ generated: number; errors: number; durationMs: number }> {
    if (this.generating) return { generated: 0, errors: 0, durationMs: 0 };
    this.generating = true;
    const start = Date.now();

    await fs.mkdir(this.audioDir, { recursive: true });

    // Generate introductions
    const introTexts = INTRO_TEMPLATES.map(t => t.replace('{name}', this.config.agentName));

    // All phrases to generate
    const allPhrases = [
      ...introTexts.map((text, i) => ({ id: `intro-${i}`, text, category: 'introduction' as FillerCategory, tags: ['intro'], estimatedMs: 2500 })),
      ...FILLER_PHRASES,
    ];

    let generated = 0;
    let errors = 0;

    // Generate in parallel batches of 5 (don't overwhelm ElevenLabs)
    const batchSize = 5;
    for (let i = 0; i < allPhrases.length; i += batchSize) {
      const batch = allPhrases.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (phrase) => {
          const id = phrase.id || `${phrase.category}-${phrase.text.slice(0, 20).replace(/\W/g, '_')}`;
          const audioPath = path.join(this.audioDir, `${id}.mp3`);

          // Skip if already generated (e.g., rejoin)
          try {
            await fs.access(audioPath);
            const stat = await fs.stat(audioPath);
            if (stat.size > 1000) {
              // Already exists and non-empty
              this.audioBank.set(id, {
                id, category: phrase.category, text: phrase.text,
                audioPath, durationMs: phrase.estimatedMs, tags: phrase.tags, usageCount: 0,
              });
              generated++;
              return;
            }
          } catch {} // File doesn't exist — generate it

          // Generate TTS
          const res = await fetch(`${ELEVENLABS_BASE}/text-to-speech/${this.config.voiceId}`, {
            method: 'POST',
            headers: { 'xi-api-key': this.config.apiKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
            body: JSON.stringify({
              text: phrase.text,
              model_id: 'eleven_turbo_v2_5',
              voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
              output_format: 'mp3_22050_32',
            }),
          });

          if (!res.ok) throw new Error(`ElevenLabs ${res.status}`);

          const buffer = Buffer.from(await res.arrayBuffer());
          await fs.writeFile(audioPath, buffer);

          // Estimate actual duration from file size (mp3 @ 32kbps ≈ 4KB/s)
          const estimatedDuration = Math.round((buffer.length / 4000) * 1000);

          this.audioBank.set(id, {
            id, category: phrase.category, text: phrase.text,
            audioPath, durationMs: estimatedDuration, tags: phrase.tags, usageCount: 0,
          });
          generated++;
        })
      );

      for (const r of results) {
        if (r.status === 'rejected') {
          errors++;
          console.warn(`[voice-intel:${this.config.agentId}] Failed to generate filler: ${r.reason}`);
        }
      }
    }

    this.ready = generated > 0;
    this.generating = false;
    const duration = Date.now() - start;
    console.log(`[voice-intel:${this.config.agentId}] Audio bank ready: ${generated} clips (${errors} errors) in ${duration}ms`);
    return { generated, errors, durationMs: duration };
  }

  get isReady(): boolean { return this.ready; }

  // ─── Core: Handle incoming speech and respond naturally ──

  /**
   * Called when captions are flushed from the meeting monitor.
   * Decides whether to speak, plays fillers while LLM thinks,
   * then streams the actual response.
   */
  async handleCaptions(
    captions: Array<{ speaker: string; text: string }>,
    generateResponse: (context: SpeakingContext) => Promise<string>,
  ): Promise<{
    action: 'spoke' | 'listened' | 'noted';
    reason: string;
    responseText?: string;
    fillersPlayed?: string[];
    totalLatencyMs?: number;
  }> {
    const decision = this.speakingEngine.analyze(captions);

    if (!decision.shouldSpeak) {
      // Take notes silently
      const noteText = captions.map(c => `${c.speaker}: ${c.text}`).join('\n');
      this.speakingEngine.addNote(noteText);
      return { action: decision.isQuestion ? 'noted' : 'listened', reason: decision.reason };
    }

    // ─── Agent should speak — predict latency and select fillers ───
    const context: SpeakingContext = {
      captionText: captions.map(c => c.text).join(' '),
      speaker: captions[captions.length - 1]?.speaker || 'Unknown',
      directedAtAgent: decision.directedAtAgent,
      complexity: decision.complexity,
      participantCount: new Set(captions.map(c => c.speaker)).size,
      isQuestion: decision.isQuestion,
    };

    const prediction = this.predictor.predict(context, this.config.modelSpeed);
    const start = Date.now();
    const fillersPlayed: string[] = [];

    // ─── Play fillers while waiting for LLM ───
    const fillerPromise = this.playFillers(prediction, context);
    const responsePromise = generateResponse(context);

    // Race: LLM response vs filler exhaustion
    let responseText: string;
    try {
      responseText = await responsePromise;
      const llmLatency = Date.now() - start;
      this.predictor.record(llmLatency, 500); // Record for adaptive prediction
    } catch (e: any) {
      // LLM failed — stop fillers
      this.playback.interrupt();
      return { action: 'listened', reason: `LLM error: ${e.message}` };
    }

    // Stop any remaining fillers
    this.playback.interrupt();
    const fillerResult = await fillerPromise;
    fillersPlayed.push(...fillerResult);

    // ─── Stream the actual response ───
    try {
      const result = await this.playback.streamToDevice(
        this.config.apiKey, responseText, this.config.voiceId
      );
      this.speakingEngine.recordAgentSpoke();

      return {
        action: 'spoke',
        reason: decision.reason,
        responseText,
        fillersPlayed,
        totalLatencyMs: Date.now() - start,
      };
    } catch (e: any) {
      console.error(`[voice-intel:${this.config.agentId}] Speech failed: ${e.message}`);
      return { action: 'listened', reason: `Speech failed: ${e.message}`, responseText };
    }
  }

  // ─── Filler playback ────────────────────────────────────

  private async playFillers(
    prediction: ResponseTimePrediction,
    context: SpeakingContext,
  ): Promise<string[]> {
    if (prediction.strategy === 'none' || !this.ready) return [];

    const played: string[] = [];
    const fillers = this.selectFillers(prediction, context);

    for (const filler of fillers) {
      if (this.playback.isPlaying) break; // Main response started streaming

      const result = await this.playback.play(filler.audioPath);
      filler.usageCount++;
      played.push(filler.text);

      if (result.interrupted) break; // Interrupted by main response or user
    }

    return played;
  }

  /** Select appropriate fillers based on strategy and context */
  private selectFillers(prediction: ResponseTimePrediction, context: SpeakingContext): FillerAudio[] {
    const available = Array.from(this.audioBank.values());
    const result: FillerAudio[] = [];
    let totalDuration = 0;
    const targetDuration = prediction.estimatedLatencyMs - 500; // Leave 500ms buffer

    // ─── Strategy-based selection ───
    switch (prediction.strategy) {
      case 'short': {
        // One short filler: transition or thinking
        const candidates = available.filter(f =>
          (f.category === 'transition' || f.category === 'thinking') &&
          f.tags.includes('short')
        );
        const pick = this.pickLeastUsed(candidates);
        if (pick) result.push(pick);
        break;
      }

      case 'medium': {
        // Acknowledgment (if question) + thinking
        if (context.isQuestion) {
          const ack = this.pickLeastUsed(available.filter(f =>
            f.category === 'acknowledgment' && f.tags.includes('question')
          ));
          if (ack) { result.push(ack); totalDuration += ack.durationMs; }
        }
        const think = this.pickLeastUsed(available.filter(f =>
          f.category === 'thinking' && f.durationMs + totalDuration < targetDuration
        ));
        if (think) result.push(think);
        break;
      }

      case 'long': {
        // Stalling phrase
        const stall = this.pickLeastUsed(available.filter(f =>
          f.category === 'stalling'
        ));
        if (stall) result.push(stall);
        break;
      }

      case 'chain': {
        // Chain: acknowledgment → thinking → processing/stalling
        if (context.isQuestion) {
          const ack = this.pickLeastUsed(available.filter(f => f.category === 'acknowledgment'));
          if (ack) { result.push(ack); totalDuration += ack.durationMs; }
        }

        const think = this.pickLeastUsed(available.filter(f =>
          f.category === 'thinking' && f.tags.includes('medium')
        ));
        if (think) { result.push(think); totalDuration += think.durationMs; }

        if (totalDuration < targetDuration - 1000) {
          const stall = this.pickLeastUsed(available.filter(f =>
            f.category === 'stalling' || f.category === 'processing'
          ));
          if (stall) result.push(stall);
        }
        break;
      }
    }

    return result;
  }

  /** Pick the least-used filler from candidates (avoid repetition) */
  private pickLeastUsed(candidates: FillerAudio[]): FillerAudio | null {
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.usageCount - b.usageCount);
    // Pick randomly from the least-used tier (all with same minimum count)
    const minCount = candidates[0].usageCount;
    const tier = candidates.filter(c => c.usageCount === minCount);
    return tier[Math.floor(Math.random() * tier.length)];
  }

  // ─── Interruption handling ──────────────────────────────

  /**
   * Called when new captions arrive while the agent is speaking.
   * Someone is talking over the agent — handle gracefully.
   */
  async handleInterruption(interrupterText: string): Promise<{
    interrupted: boolean;
    acknowledgmentPlayed: boolean;
  }> {
    if (!this.playback.isPlaying) return { interrupted: false, acknowledgmentPlayed: false };

    // Stop current playback
    const wasInterrupted = this.playback.interrupt();
    if (!wasInterrupted) return { interrupted: false, acknowledgmentPlayed: false };

    this.interruptedText = interrupterText;

    // Play an interruption acknowledgment
    const ack = this.pickLeastUsed(
      Array.from(this.audioBank.values()).filter(f => f.category === 'interruption')
    );

    if (ack) {
      await this.playback.play(ack.audioPath);
      ack.usageCount++;
      return { interrupted: true, acknowledgmentPlayed: true };
    }

    return { interrupted: true, acknowledgmentPlayed: false };
  }

  /**
   * Resume speaking after an interruption.
   * Plays a resumption phrase then continues with the response.
   */
  async resumeAfterInterruption(responseText: string): Promise<void> {
    // Play resumption filler
    const resumption = this.pickLeastUsed(
      Array.from(this.audioBank.values()).filter(f => f.category === 'resumption')
    );

    if (resumption) {
      await this.playback.play(resumption.audioPath);
      resumption.usageCount++;
    }

    // Stream the actual response
    await this.playback.streamToDevice(
      this.config.apiKey, responseText, this.config.voiceId
    );
    this.speakingEngine.recordAgentSpoke();
    this.interruptedText = null;
  }

  // ─── Introduction ───────────────────────────────────────

  /** Play a pre-generated introduction. Call when joining a meeting. */
  async introduce(): Promise<boolean> {
    const intros = Array.from(this.audioBank.values()).filter(f => f.category === 'introduction');
    if (intros.length === 0) return false;

    const intro = intros[Math.floor(Math.random() * intros.length)];
    const result = await this.playback.play(intro.audioPath);
    intro.usageCount++;
    this.speakingEngine.recordAgentSpoke();
    return result.completed;
  }

  // ─── Cleanup ────────────────────────────────────────────

  async cleanup(): Promise<void> {
    this.playback.interrupt();
    // Don't delete audio files — reuse across meetings if voice hasn't changed
    this.audioBank.clear();
    this.ready = false;
  }

  // ─── Getters ────────────────────────────────────────────

  get stats() {
    return {
      audioBankSize: this.audioBank.size,
      ready: this.ready,
      categories: Object.fromEntries(
        Array.from(this.audioBank.values()).reduce((acc, f) => {
          acc.set(f.category, (acc.get(f.category) || 0) + 1);
          return acc;
        }, new Map<string, number>())
      ),
    };
  }

  get decisionEngine(): SpeakingDecisionEngine { return this.speakingEngine; }
  get audioController(): AudioPlaybackController { return this.playback; }
}

// ═══════════════════════════════════════════════════════════
// FACTORY — Create per-meeting instance
// ═══════════════════════════════════════════════════════════

const activeInstances = new Map<string, MeetingVoiceIntelligence>();

export function createMeetingVoiceIntelligence(config: MeetingVoiceConfig): MeetingVoiceIntelligence {
  // Clean up any existing instance for this agent
  const existing = activeInstances.get(config.agentId);
  if (existing) existing.cleanup();

  const instance = new MeetingVoiceIntelligence(config);
  activeInstances.set(config.agentId, instance);
  return instance;
}

export function getActiveVoiceIntelligence(agentId: string): MeetingVoiceIntelligence | undefined {
  return activeInstances.get(agentId);
}

export function removeVoiceIntelligence(agentId: string): void {
  const instance = activeInstances.get(agentId);
  if (instance) {
    instance.cleanup();
    activeInstances.delete(agentId);
  }
}
