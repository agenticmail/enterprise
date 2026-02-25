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
async function generateSpeech(
  apiKey: string,
  text: string,
  voiceId: string,
  options?: { stability?: number; similarity?: number; model?: string }
): Promise<Buffer> {
  const model = options?.model || 'eleven_turbo_v2_5'; // Fastest model for real-time
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
      output_format: 'mp3_44100_128', // High quality MP3
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`ElevenLabs API ${res.status}: ${err}`);
  }

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
        // Fallback: try afplay (plays to default output — user must set BlackHole as default)
        console.warn(`[meeting-voice] sox failed for device "${device}", falling back to afplay`);
      }
    }
    // Default macOS playback
    await exec(`afplay "${audioPath}"`, { timeout: 30000 });
  } else if (process.platform === 'linux') {
    // Linux: use paplay with PulseAudio sink
    if (device) {
      await exec(`paplay --device="${device}" "${audioPath}"`, { timeout: 30000 });
    } else {
      await exec(`paplay "${audioPath}"`, { timeout: 30000 });
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
    // Check for BlackHole
    try {
      const { stdout } = await exec('system_profiler SPAudioDataType 2>/dev/null');
      hasBlackHole = stdout.includes('BlackHole');
      // Parse device names
      const lines = stdout.split('\n');
      for (const line of lines) {
        const match = line.match(/^\s+(BlackHole|Built-in|External|USB|Aggregate)/);
        if (match) devices.push(line.trim());
      }
    } catch {}

    // Check for sox
    try { await exec('which sox'); hasSox = true; } catch {}
  } else if (platform === 'linux') {
    // Check PulseAudio virtual sinks
    try {
      const { stdout } = await exec('pactl list short sinks 2>/dev/null');
      devices = stdout.split('\n').filter(Boolean);
      hasBlackHole = devices.some(d => d.includes('virtual') || d.includes('null'));
    } catch {}
  }

  return { hasBlackHole, hasSox, devices, platform };
}


export function createMeetingVoiceTools(
  config: { elevenLabsApiKey?: string; voiceId?: string; voiceName?: string; audioDevice?: string },
  _options?: ToolCreationOptions
): AnyAgentTool[] {
  const agentId = (_options as any)?.agentId || 'default';

  return [
    // ─── Speak in Meeting ──────────────────────────────
    {
      name: 'meeting_speak',
      description: `Speak in a meeting by converting text to speech and playing it through the virtual microphone. The meeting participants will hear your voice. Use this after joining a meeting with meeting_join.

Requirements: ElevenLabs API key + BlackHole virtual audio driver (macOS) or PulseAudio virtual sink (Linux).

Tips:
- Keep messages concise (1-3 sentences) for natural conversation flow
- Wait for others to finish speaking (check captions) before speaking
- Use a warm, professional tone appropriate for the meeting context`,
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
          const apiKey = config.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY;
          if (!apiKey) {
            return errorResult('ElevenLabs API key not configured. Set ELEVENLABS_API_KEY env var or configure in agent settings.');
          }

          const text = params.text;
          if (!text || text.trim().length === 0) {
            return errorResult('No text to speak.');
          }

          // Resolve voice
          let voiceId = config.voiceId || DEFAULT_VOICES['rachel'];
          if (params.voice) {
            // Check if it's a built-in voice name
            const lower = params.voice.toLowerCase();
            if (DEFAULT_VOICES[lower]) {
              voiceId = DEFAULT_VOICES[lower];
            } else if (params.voice.length > 10) {
              // Assume it's an ElevenLabs voice ID
              voiceId = params.voice;
            }
          }

          // Generate speech
          const audioBuffer = await generateSpeech(apiKey, text, voiceId, {
            model: params.model,
          });

          // Save to temp file
          const audioDir = path.join(os.tmpdir(), 'agenticmail-voice');
          await fs.mkdir(audioDir, { recursive: true });
          const audioFile = path.join(audioDir, `speak-${Date.now()}.mp3`);
          await fs.writeFile(audioFile, audioBuffer);

          // Play through virtual audio device
          const device = config.audioDevice || 'BlackHole 2ch';
          try {
            await playAudioToDevice(audioFile, device);
          } catch (playErr: any) {
            // If playback fails, still return success with the file path
            // The agent can use the browser tool to play it another way
            return jsonResult({
              action: 'meeting_speak',
              status: 'audio_generated',
              text,
              audioFile,
              audioSize: audioBuffer.length,
              playbackError: playErr.message,
              hint: 'Audio file generated but playback failed. Check that BlackHole is installed (brew install blackhole-2ch) and sox is available (brew install sox). You can also manually play the file.',
            });
          }

          return jsonResult({
            action: 'meeting_speak',
            status: 'spoken',
            text,
            voiceId,
            audioFile,
            audioSize: audioBuffer.length,
            durationEstimate: Math.round(text.length / 15) + 's', // ~15 chars/sec speech
          });
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
          const apiKey = config.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY;

          const issues: string[] = [];
          if (!apiKey) issues.push('ElevenLabs API key not configured (set ELEVENLABS_API_KEY)');
          if (!setup.hasBlackHole && setup.platform === 'darwin') issues.push('BlackHole virtual audio not found (install: brew install blackhole-2ch)');
          if (!setup.hasSox && setup.platform === 'darwin') issues.push('sox not found (install: brew install sox) — needed to route audio to BlackHole');

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
            configuredDevice: config.audioDevice || 'BlackHole 2ch (default)',
            availableVoices: Object.keys(DEFAULT_VOICES),
            setupInstructions: issues.length > 0 ? [
              'macOS: brew install blackhole-2ch sox',
              'Linux: sudo apt install pulseaudio-utils sox',
              'Then set ELEVENLABS_API_KEY in your agent environment',
              'Optionally configure voice and audio device in agent settings',
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
            const apiKey = config.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY;
            if (!apiKey) return jsonResult({ voices: builtIn, note: 'Set ELEVENLABS_API_KEY to see custom voices' });

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
