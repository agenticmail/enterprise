/**
 * Meeting Voice — Text-to-Speech for Meeting Participation
 *
 * Enables agents to speak in meetings by:
 * 1. Converting text to speech via ElevenLabs API
 * 2. Playing audio through a virtual audio device (BlackHole)
 * 3. Browser picks up BlackHole as microphone → meeting hears the agent
 *
 * Requirements:
 * - ElevenLabs API key (set in agent config or env: ELEVENLABS_API_KEY)
 * - BlackHole virtual audio driver (macOS: brew install blackhole-2ch)
 * - sox or afplay for audio playback routing
 *
 * Enterprise Architecture:
 * - Each agent can have their own voice (configured per-agent)
 * - Voice selection via ElevenLabs voice library
 * - Audio output device configurable per-deployment
 * - Works on any machine with a virtual audio driver (macOS, Linux with PulseAudio)
 */

import type { AnyAgentTool, ToolCreationOptions } from '../../types.js';
import { jsonResult, errorResult } from '../../common.js';
import * as path from 'node:path';
import * as os from 'node:os';
import { promises as fs } from 'node:fs';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';

// ════════════════════════════════════════════════════════════
// VOICE CAPABILITY MANAGER — Singleton per agent
// ════════════════════════════════════════════════════════════

export interface VoiceStatus {
  available: boolean;
  mode: 'voice' | 'chat-only';
  hasApiKey: boolean;
  hasVirtualAudio: boolean;
  hasSox: boolean;
  platform: string;
  voiceName: string;
  voiceId: string;
  audioDevice: string;
  issues: string[];
  lastCheck: number;
  lastSpeakSuccess: number | null;
  lastSpeakFailure: number | null;
  consecutiveFailures: number;
  /** If true, voice was working but started failing — in degraded mode */
  degraded: boolean;
}

/**
 * Manages voice capability state per agent. Provides:
 * - Preflight checks before meetings
 * - Runtime health monitoring during meetings
 * - Auto-degradation: voice → chat fallback after consecutive failures
 * - Auto-recovery: periodic re-check to restore voice after transient failures
 */
class VoiceCapabilityManager {
  private statusByAgent = new Map<string, VoiceStatus>();
  private static instance: VoiceCapabilityManager;

  static getInstance(): VoiceCapabilityManager {
    if (!this.instance) this.instance = new VoiceCapabilityManager();
    return this.instance;
  }

  /** Full preflight check — call before/during meeting join */
  async preflight(
    agentId: string,
    getApiKey: () => Promise<string | null>,
    voiceId?: string,
    voiceName?: string,
    audioDevice?: string,
  ): Promise<VoiceStatus> {
    const setup = await checkAudioSetup();
    const apiKey = await getApiKey();
    const issues: string[] = [];

    if (!apiKey) issues.push('No ElevenLabs API key');
    if (!setup.hasBlackHole) issues.push('No virtual audio device');
    if (!setup.hasSox) issues.push('sox not installed');

    // Quick connectivity check: ping ElevenLabs using /voices (works with any valid key)
    if (apiKey) {
      try {
        const res = await fetch(`${ELEVENLABS_BASE}/voices?page_size=1`, {
          headers: { 'xi-api-key': apiKey },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          issues.push(`ElevenLabs API error: ${res.status} — ${body.slice(0, 100)}`);
        }
      } catch (e: any) {
        issues.push(`ElevenLabs unreachable: ${e.message}`);
      }
    }

    const prev = this.statusByAgent.get(agentId);
    const resolvedVoiceId = voiceId || DEFAULT_VOICES['rachel'];
    const defaultDevice = setup.platform === 'darwin' ? 'BlackHole 2ch'
      : setup.platform === 'win32' ? 'CABLE Input (VB-Audio Virtual Cable)' : 'virtual';

    const status: VoiceStatus = {
      available: issues.length === 0,
      mode: issues.length === 0 ? 'voice' : 'chat-only',
      hasApiKey: !!apiKey,
      hasVirtualAudio: setup.hasBlackHole,
      hasSox: setup.hasSox,
      platform: setup.platform,
      voiceName: voiceName || 'rachel',
      voiceId: resolvedVoiceId,
      audioDevice: audioDevice || defaultDevice,
      issues,
      lastCheck: Date.now(),
      lastSpeakSuccess: prev?.lastSpeakSuccess || null,
      lastSpeakFailure: prev?.lastSpeakFailure || null,
      consecutiveFailures: prev?.consecutiveFailures || 0,
      degraded: false,
    };

    this.statusByAgent.set(agentId, status);
    return status;
  }

  /** Get cached status (or run preflight if stale / missing) */
  async getStatus(
    agentId: string,
    getApiKey: () => Promise<string | null>,
    voiceId?: string,
    voiceName?: string,
    audioDevice?: string,
  ): Promise<VoiceStatus> {
    const cached = this.statusByAgent.get(agentId);
    // Re-check every 5 minutes, or if never checked
    if (cached && Date.now() - cached.lastCheck < 300_000) return cached;
    return this.preflight(agentId, getApiKey, voiceId, voiceName, audioDevice);
  }

  /** Record a successful speak */
  recordSuccess(agentId: string): void {
    const s = this.statusByAgent.get(agentId);
    if (!s) return;
    s.lastSpeakSuccess = Date.now();
    s.consecutiveFailures = 0;
    s.degraded = false;
    s.mode = 'voice';
  }

  /** Record a failed speak — auto-degrade after 3 consecutive failures */
  recordFailure(agentId: string): void {
    const s = this.statusByAgent.get(agentId);
    if (!s) return;
    s.lastSpeakFailure = Date.now();
    s.consecutiveFailures++;
    if (s.consecutiveFailures >= 3) {
      s.degraded = true;
      s.mode = 'chat-only';
      console.warn(`[voice:${agentId}] Degraded to chat-only after ${s.consecutiveFailures} consecutive failures`);
    }
  }

  /** Force re-check (e.g., after recovery attempt) */
  invalidate(agentId: string): void {
    this.statusByAgent.delete(agentId);
  }

  /** Check if voice should be attempted (respects degradation) */
  shouldUseVoice(agentId: string): boolean {
    const s = this.statusByAgent.get(agentId);
    if (!s) return false;
    if (s.mode === 'chat-only') {
      // Auto-recovery: try voice again every 2 minutes after degradation
      if (s.degraded && s.lastSpeakFailure && Date.now() - s.lastSpeakFailure > 120_000) {
        console.log(`[voice:${agentId}] Attempting voice recovery...`);
        return true; // Let it try once
      }
      return false;
    }
    return s.available;
  }

  /** Build a system prompt block describing voice status */
  buildPromptBlock(agentId: string): string {
    const s = this.statusByAgent.get(agentId);
    if (!s) return `\n## Voice Status\nVoice not checked yet. Use meeting_speak to talk — it will fall back to chat if voice is unavailable.\n`;

    if (s.available && !s.degraded) {
      return `
## Voice: ENABLED
You CAN speak in this meeting using your voice (${s.voiceName}).
- Use meeting_speak(text: "...") to talk — participants will HEAR you
- Use meeting_action(action: "chat", message: "...") for text chat
- PREFER voice for important points, questions, and responses
- Use chat for links, code snippets, or long lists
- Keep spoken messages concise (1-3 sentences) for natural conversation
- Wait for others to finish (check captions) before speaking`;
    }

    if (s.degraded) {
      return `
## Voice: DEGRADED — Using Chat Fallback
Voice was working but has failed ${s.consecutiveFailures} times. Automatically switched to chat.
- Use meeting_action(action: "chat", message: "...") to communicate
- meeting_speak will auto-retry voice periodically — if it works, voice is restored
- Issues: ${s.issues.join(', ') || 'transient playback failures'}`;
    }

    return `
## Voice: UNAVAILABLE — Chat Only
Voice is not available for this meeting. Communicate via chat only.
- Use meeting_action(action: "chat", message: "...") for all communication
- Issues: ${s.issues.join(', ')}
- To enable voice: Dashboard → Settings → Integrations → ElevenLabs, then select a voice in agent profile`;
  }
}

/** Exported singleton */
export const voiceCapability = VoiceCapabilityManager.getInstance();

// Default voices — high quality, low latency
const DEFAULT_VOICES: Record<string, string> = {
  'rachel': '21m00Tcm4TlvDq8ikWAM',     // Female, warm
  'drew': '29vD33N1CtxCmqQRPOHJ',         // Male, confident
  'clyde': '2EiwWnXFnvU5JabPnv8n',        // Male, deep
  'domi': 'AZnzlk1XvdvUeBnXmlld',         // Female, strong
  'dave': 'CYw3kZ02Hs0563khs1Fj',         // Male, conversational
  'fin': 'D38z5RcWu1voky8WS1ja',          // Male, British
  'sarah': 'EXAVITQu4vr4xnSDxMaL',        // Female, soft
  'antoni': 'ErXwobaYiN019PkySvjV',        // Male, well-rounded
  'elli': 'MF3mGyEYCl7XYWbV9V6O',         // Female, youthful
  'josh': 'TxGEqnHWrfWFTfGW9XjX',         // Male, deep, narrative
  'arnold': 'VR6AewLTigWG4xSOukaG',        // Male, crisp
  'adam': 'pNInz6obpgDQGcFmaJgB',          // Male, deep
  'sam': 'yoZ06aMxZJJ28mfd3POQ',           // Male, raspy
};

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Generate speech audio from text using ElevenLabs
 */
/**
 * Generate speech and return full buffer (used for file save).
 */
async function generateSpeech(
  apiKey: string,
  text: string,
  voiceId: string,
  options?: { stability?: number; similarity?: number; model?: string }
): Promise<Buffer> {
  const res = await _fetchTTSStream(apiKey, text, voiceId, options);
  const chunks: Uint8Array[] = [];
  const reader = res.body!.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Stream TTS directly to audio device — near-zero latency.
 * Pipes ElevenLabs stream → sox stdin → virtual audio device.
 * Audio starts playing within ~200ms of first chunk.
 */
async function streamSpeechToDevice(
  apiKey: string,
  text: string,
  voiceId: string,
  device: string,
  options?: { stability?: number; similarity?: number; model?: string }
): Promise<{ audioSize: number; durationMs: number }> {
  const { spawn } = await import('child_process');
  const platform = process.platform;
  const startTime = Date.now();

  // Start sox/player process that reads from stdin
  let playerArgs: string[];
  let playerCmd: string;

  if (platform === 'darwin') {
    // sox reads mp3 from stdin, outputs to coreaudio device
    playerCmd = 'sox';
    playerArgs = ['-t', 'mp3', '-', '-t', 'coreaudio', device];
  } else if (platform === 'linux') {
    // paplay reads from stdin
    playerCmd = 'paplay';
    playerArgs = device ? ['--device=' + device, '--raw'] : ['--raw'];
  } else if (platform === 'win32') {
    playerCmd = 'sox';
    playerArgs = ['-t', 'mp3', '-', '-t', 'waveaudio', device];
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const player = spawn(playerCmd, playerArgs, {
    stdio: ['pipe', 'ignore', 'pipe'],
    timeout: 60_000,
  });

  // Fetch TTS stream
  const fetchStart = Date.now();
  const res = await _fetchTTSStream(apiKey, text, voiceId, options);
  console.log(`[voice] TTS API responded in ${Date.now() - fetchStart}ms`);
  const reader = res.body!.getReader();
  let totalBytes = 0;
  let firstChunk = true;

  // Pipe stream chunks directly to sox stdin
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (firstChunk) {
        console.log(`[voice] First audio chunk in ${Date.now() - fetchStart}ms (${value.length} bytes)`);
        firstChunk = false;
      }
      totalBytes += value.length;
      const canWrite = player.stdin!.write(Buffer.from(value));
      if (!canWrite) {
        // Backpressure — wait for drain
        await new Promise<void>(resolve => player.stdin!.once('drain', resolve));
      }
    }
    player.stdin!.end();
  } catch (e: any) {
    player.kill();
    throw new Error(`Stream pipe failed: ${e.message}`);
  }

  // Wait for playback to finish
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      player.kill();
      reject(new Error('Playback timed out'));
    }, 60_000);
    player.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0 || code === null) resolve();
      else reject(new Error(`Player exited with code ${code}`));
    });
    player.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  return { audioSize: totalBytes, durationMs: Date.now() - startTime };
}

/** Internal: fetch the ElevenLabs TTS streaming response */
async function _fetchTTSStream(
  apiKey: string,
  text: string,
  voiceId: string,
  options?: { stability?: number; similarity?: number; model?: string }
): Promise<Response> {
  const model = options?.model || 'eleven_turbo_v2_5';
  const url = `${ELEVENLABS_BASE}/text-to-speech/${voiceId}/stream`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: {
        stability: options?.stability ?? 0.5,
        similarity_boost: options?.similarity ?? 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
      output_format: 'mp3_22050_32', // Lower bitrate = smaller chunks = faster first-byte
      optimize_streaming_latency: 4, // Maximum latency optimization (may reduce quality slightly)
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`ElevenLabs API ${res.status}: ${err}`);
  }

  return res;
}

/**
 * Play audio through a specific output device.
 * On macOS, uses `afplay` with device routing via SwitchAudioSource or sox.
 * Falls back to system default if no virtual device specified.
 */
async function playAudioToDevice(
  audioPath: string,
  device?: string
): Promise<void> {
  const { exec: execCb } = await import('child_process');
  const { promisify } = await import('util');
  const exec = promisify(execCb);

  if (process.platform === 'darwin') {
    if (device) {
      // Use sox to play to specific device (requires `brew install sox`)
      try {
        await exec(`sox "${audioPath}" -t coreaudio "${device}"`, { timeout: 30000 });
        return;
      } catch {
        console.warn(`[meeting-voice] sox failed for device "${device}", falling back to afplay`);
      }
    }
    await exec(`afplay "${audioPath}"`, { timeout: 30000 });
  } else if (process.platform === 'linux') {
    if (device) {
      // Try PulseAudio first, then ALSA
      try {
        await exec(`paplay --device="${device}" "${audioPath}"`, { timeout: 30000 });
      } catch {
        await exec(`aplay -D "${device}" "${audioPath}"`, { timeout: 30000 });
      }
    } else {
      try {
        await exec(`paplay "${audioPath}"`, { timeout: 30000 });
      } catch {
        await exec(`aplay "${audioPath}"`, { timeout: 30000 });
      }
    }
  } else if (process.platform === 'win32') {
    if (device) {
      // sox on Windows can target specific audio devices
      try {
        await exec(`sox "${audioPath}" -t waveaudio "${device}"`, { timeout: 30000 });
        return;
      } catch {
        console.warn(`[meeting-voice] sox device routing failed on Windows, using default playback`);
      }
    }
    // PowerShell fallback: play through default device
    // Use SoundPlayer for WAV or ffplay for mp3
    try {
      await exec(`powershell -Command "(New-Object System.Media.SoundPlayer '${audioPath}').PlaySync()"`, { timeout: 30000 });
    } catch {
      // Last resort: ffplay
      await exec(`ffplay -nodisp -autoexit "${audioPath}"`, { timeout: 30000 });
    }
  } else {
    throw new Error(`Unsupported platform for audio playback: ${process.platform}`);
  }
}

/**
 * Check if virtual audio device is available
 */
async function checkAudioSetup(): Promise<{
  hasBlackHole: boolean;
  hasSox: boolean;
  devices: string[];
  platform: string;
}> {
  const { exec: execCb } = await import('child_process');
  const { promisify } = await import('util');
  const exec = promisify(execCb);

  const platform = process.platform;
  let hasBlackHole = false;
  let hasSox = false;
  let devices: string[] = [];

  if (platform === 'darwin') {
    // Check for BlackHole — multiple detection methods
    try {
      const { stdout } = await exec('system_profiler SPAudioDataType 2>/dev/null');
      if (stdout.includes('BlackHole')) hasBlackHole = true;
      const lines = stdout.split('\n');
      for (const line of lines) {
        const match = line.match(/^\s+(BlackHole|Built-in|External|USB|Aggregate|DELL|Mac mini)/);
        if (match) devices.push(line.trim());
      }
    } catch {}
    // Fallback: check HAL plugin directory (works even if coreaudiod hasn't loaded it yet)
    if (!hasBlackHole) {
      try {
        const { existsSync } = await import('fs');
        if (existsSync('/Library/Audio/Plug-Ins/HAL/BlackHole2ch.driver')) {
          hasBlackHole = true;
          devices.push('BlackHole 2ch (driver installed, may need coreaudiod restart)');
        }
      } catch {}
    }
    // Fallback: check SwitchAudioSource
    if (!hasBlackHole) {
      try {
        const { stdout } = await exec('SwitchAudioSource -a -t output 2>/dev/null');
        if (stdout.includes('BlackHole')) {
          hasBlackHole = true;
          devices.push('BlackHole 2ch');
        }
      } catch {}
    }
    // If driver file exists but audio system doesn't see it, try to restart coreaudiod
    if (!hasBlackHole) {
      try {
        const { existsSync } = await import('fs');
        if (existsSync('/Library/Audio/Plug-Ins/HAL/BlackHole2ch.driver')) {
          console.log('[audio] BlackHole driver installed but not loaded — attempting coreaudiod restart...');
          try {
            await exec('sudo launchctl kickstart -kp system/com.apple.audio.coreaudiod 2>/dev/null', { timeout: 10_000 });
            // Wait for audio system to reinitialize
            await new Promise(r => setTimeout(r, 3000));
            // Re-check
            try {
              const { stdout } = await exec('SwitchAudioSource -a -t output 2>/dev/null');
              if (stdout.includes('BlackHole')) {
                hasBlackHole = true;
                devices.push('BlackHole 2ch (loaded after coreaudiod restart)');
                console.log('[audio] ✅ BlackHole now available after coreaudiod restart');
              }
            } catch {}
          } catch {
            // sudo not available — just note the driver is there
            console.warn('[audio] BlackHole driver exists but coreaudiod restart needs sudo. Run: sudo launchctl kickstart -kp system/com.apple.audio.coreaudiod');
          }
        }
      } catch {}
    }
    try { await exec('which sox'); hasSox = true; } catch {}
  } else if (platform === 'linux') {
    // Check PulseAudio / PipeWire virtual sinks
    try {
      const { stdout } = await exec('pactl list short sinks 2>/dev/null');
      devices = stdout.split('\n').filter(Boolean);
      hasBlackHole = devices.some(d => d.includes('virtual') || d.includes('null') || d.includes('pipewire'));
    } catch {}
    try { await exec('which sox'); hasSox = true; } catch {}
  } else if (platform === 'win32') {
    // Check for VB-CABLE or other virtual audio
    try {
      const { stdout } = await exec('powershell -Command "Get-AudioDevice -List 2>$null | Select-Object -ExpandProperty Name"', { timeout: 10000 });
      devices = stdout.split('\n').map(d => d.trim()).filter(Boolean);
      hasBlackHole = devices.some(d => /cable|virtual|vb-audio/i.test(d));
    } catch {
      // Fallback: check via sox
      try {
        const { stdout } = await exec('sox --help 2>&1');
        if (stdout.includes('waveaudio')) hasSox = true;
      } catch {}
    }
    try { await exec('where sox'); hasSox = true; } catch {}
  }

  return { hasBlackHole, hasSox, devices, platform };
}


export function createMeetingVoiceTools(
  config: {
    elevenLabsApiKey?: string;
    elevenLabsKeyResolver?: () => Promise<string | null>;
    voiceId?: string;
    voiceName?: string;
    audioDevice?: string;
  },
  _options?: ToolCreationOptions
): AnyAgentTool[] {
  const agentId = (_options as any)?.agentId || 'default';

  /** Resolve ElevenLabs API key: env var → vault → null */
  const getApiKey = async (): Promise<string | null> => {
    if (config.elevenLabsApiKey) return config.elevenLabsApiKey;
    if (config.elevenLabsKeyResolver) {
      try { return await config.elevenLabsKeyResolver(); } catch { return null; }
    }
    return process.env.ELEVENLABS_API_KEY || null;
  };

  return [
    // ─── Speak in Meeting ──────────────────────────────
    {
      name: 'meeting_speak',
      description: `Speak in a meeting using your voice. Participants will HEAR you through the virtual microphone. Audio streams in real-time (near-zero latency). Auto-falls back to meeting chat if voice fails.

IMPORTANT: When meeting_speak succeeds (status: "spoken"), DO NOT also send the same message via chat. That would duplicate your message. Only use meeting chat for links, code, or data that's better as text.

Tips:
- Keep messages SHORT: 1-2 sentences per turn, like a real conversation
- Wait for others to finish (check captions) before speaking
- For long content, break it into multiple short meeting_speak calls`,
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          text: { type: 'string', description: 'Text to speak in the meeting' },
          voice: { type: 'string', description: 'Voice name or ElevenLabs voice ID. Built-in voices: rachel (female, warm), drew (male, confident), sarah (female, soft), josh (male, deep), adam (male, deep), sam (male, raspy). Default: agent\'s configured voice.' },
          model: { type: 'string', description: 'ElevenLabs model: "eleven_turbo_v2_5" (fastest, default), "eleven_multilingual_v2" (best quality, supports 29 languages)' },
        },
        required: ['text'],
      },
      async execute(_id: string, params: any) {
        try {
          const text = params.text;
          if (!text || text.trim().length === 0) {
            return errorResult('No text to speak.');
          }

          const vcm = voiceCapability;
          const status = await vcm.getStatus(agentId, getApiKey, config.voiceId, config.voiceName, config.audioDevice);

          // ─── Chat fallback helper ───────────────────────
          const fallbackToChat = async (reason: string): Promise<any> => {
            console.log(`[voice:${agentId}] Falling back to chat: ${reason}`);
            vcm.recordFailure(agentId);

            // Try to send via meeting chat using the browser
            try {
              const { ensureBrowser, sendChatMessage } = await import('./meetings.js');
              const { page } = await ensureBrowser(false, agentId, false);
              const chatResult = await sendChatMessage(page, text);
              if (chatResult.sent) {
                return jsonResult({
                  action: 'meeting_speak',
                  status: 'sent_as_chat',
                  method: 'chat_fallback',
                  text,
                  reason,
                  chatMethod: chatResult.method,
                  note: 'Voice unavailable — message sent as meeting chat instead.',
                });
              }
            } catch (chatErr: any) {
              console.error(`[voice:${agentId}] Chat fallback also failed: ${chatErr.message}`);
            }

            // Both voice and chat failed
            return jsonResult({
              action: 'meeting_speak',
              status: 'failed',
              text,
              reason,
              hint: 'Both voice and chat failed. Check meeting connection and audio setup.',
            });
          };

          // ─── Check if voice should be attempted ─────────
          if (!vcm.shouldUseVoice(agentId)) {
            return fallbackToChat(status.degraded
              ? `Voice degraded (${status.consecutiveFailures} consecutive failures)`
              : `Voice unavailable: ${status.issues.join(', ')}`);
          }

          // ─── Attempt voice ──────────────────────────────
          const apiKey = await getApiKey();
          if (!apiKey) {
            return fallbackToChat('No ElevenLabs API key');
          }

          // Resolve voice
          let voiceId = config.voiceId || DEFAULT_VOICES['rachel'];
          if (params.voice) {
            const lower = params.voice.toLowerCase();
            if (DEFAULT_VOICES[lower]) {
              voiceId = DEFAULT_VOICES[lower];
            } else if (params.voice.length > 10) {
              voiceId = params.voice;
            }
          }

          // ─── Stream TTS directly to audio device (near-zero latency) ───
          const device = config.audioDevice || status.audioDevice || 'BlackHole 2ch';
          try {
            const result = await streamSpeechToDevice(apiKey, text, voiceId, device, {
              model: params.model,
            });

            // ─── Success! ──────────────────────────────────
            vcm.recordSuccess(agentId);
            return jsonResult({
              action: 'meeting_speak',
              status: 'spoken',
              method: 'voice',
              text,
              voiceId,
              voiceName: config.voiceName || Object.entries(DEFAULT_VOICES).find(([, id]) => id === voiceId)?.[0] || 'custom',
              audioSize: result.audioSize,
              durationMs: result.durationMs,
              streaming: true,
            });
          } catch (streamErr: any) {
            // Streaming failed — try file-based fallback before chat
            console.warn(`[voice:${agentId}] Streaming failed (${streamErr.message}), trying file-based playback...`);
            try {
              const audioBuffer = await generateSpeech(apiKey, text, voiceId, { model: params.model });
              const audioDir = path.join(os.tmpdir(), 'agenticmail-voice');
              await fs.mkdir(audioDir, { recursive: true });
              const audioFile = path.join(audioDir, `speak-${Date.now()}.mp3`);
              await fs.writeFile(audioFile, audioBuffer);
              await playAudioToDevice(audioFile, device);
              vcm.recordSuccess(agentId);
              return jsonResult({
                action: 'meeting_speak',
                status: 'spoken',
                method: 'voice',
                text,
                voiceId,
                voiceName: config.voiceName || Object.entries(DEFAULT_VOICES).find(([, id]) => id === voiceId)?.[0] || 'custom',
                audioFile,
                audioSize: audioBuffer.length,
                streaming: false,
              });
            } catch (fileErr: any) {
              return fallbackToChat(`Voice failed: ${streamErr.message}, file fallback: ${fileErr.message}`);
            }
          }
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Check Audio Setup ─────────────────────────────
    {
      name: 'meeting_audio_setup',
      description: 'Check if the machine has the required audio setup for meeting voice (virtual audio device, sox, etc.). Run this before using meeting_speak to verify the setup.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
      async execute(_id: string, _params: any) {
        try {
          const setup = await checkAudioSetup();
          const apiKey = await getApiKey();

          const issues: string[] = [];
          if (!apiKey) issues.push('ElevenLabs API key not configured. Add it in Dashboard → Settings → Integrations (key name: "elevenlabs"), or set ELEVENLABS_API_KEY env var.');
          if (!setup.hasBlackHole) {
            if (setup.platform === 'darwin') issues.push('BlackHole virtual audio not found (install: brew install blackhole-2ch)');
            else if (setup.platform === 'linux') issues.push('No virtual audio sink found (create one: pactl load-module module-null-sink sink_name=virtual)');
            else if (setup.platform === 'win32') issues.push('No virtual audio cable found (install VB-CABLE from https://vb-audio.com/Cable/ or choco install vb-cable)');
          }
          if (!setup.hasSox) {
            if (setup.platform === 'darwin') issues.push('sox not found (install: brew install sox)');
            else if (setup.platform === 'linux') issues.push('sox not found (install: sudo apt install sox)');
            else if (setup.platform === 'win32') issues.push('sox not found (install: choco install sox.portable or winget install sox.sox)');
          }

          const defaultDevice = setup.platform === 'darwin' ? 'BlackHole 2ch'
            : setup.platform === 'win32' ? 'CABLE Input (VB-Audio Virtual Cable)' : 'virtual';

          return jsonResult({
            action: 'meeting_audio_setup',
            ready: issues.length === 0,
            issues,
            platform: setup.platform,
            hasElevenLabsKey: !!apiKey,
            hasVirtualAudio: setup.hasBlackHole,
            hasSox: setup.hasSox,
            audioDevices: setup.devices,
            configuredVoice: config.voiceName || config.voiceId || 'rachel (default)',
            configuredDevice: config.audioDevice || `${defaultDevice} (default)`,
            availableVoices: Object.keys(DEFAULT_VOICES),
            setupInstructions: issues.length > 0 ? [
              'macOS: brew install blackhole-2ch sox',
              'Linux: sudo apt install pulseaudio-utils sox && pactl load-module module-null-sink sink_name=virtual',
              'Windows: choco install sox.portable vb-cable (or winget install sox.sox + VB-CABLE from vb-audio.com)',
              'Then add ElevenLabs API key in Dashboard → Settings → Integrations',
              'Optionally select a voice in agent profile → Personal Details → Voice',
            ] : ['All good — meeting voice is ready to use.'],
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── List Available Voices ──────────────────────────
    {
      name: 'meeting_voices',
      description: 'List available ElevenLabs voices for meeting speech. Shows built-in voices and optionally fetches your custom voices from ElevenLabs.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          includeCustom: { type: 'string', description: '"true" to fetch custom voices from your ElevenLabs account' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const builtIn = Object.entries(DEFAULT_VOICES).map(([name, id]) => ({ name, id, source: 'built-in' }));

          if (params.includeCustom === 'true') {
            const apiKey = await getApiKey();
            if (!apiKey) return jsonResult({ voices: builtIn, note: 'Add ElevenLabs key in Dashboard → Settings → Integrations to see custom voices' });

            try {
              const res = await fetch(`${ELEVENLABS_BASE}/voices`, {
                headers: { 'xi-api-key': apiKey },
              });
              if (res.ok) {
                const data = await res.json() as any;
                const custom = (data.voices || []).map((v: any) => ({
                  name: v.name,
                  id: v.voice_id,
                  category: v.category,
                  source: 'elevenlabs',
                }));
                return jsonResult({ voices: [...builtIn, ...custom] });
              }
            } catch {}
          }

          return jsonResult({ voices: builtIn, currentVoice: config.voiceName || config.voiceId || 'rachel' });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
