/**
 * Meeting Voice Intelligence — Thinking sound + echo management for meetings.
 *
 * CORE PROBLEM: BlackHole virtual audio creates a feedback loop.
 * Agent audio → BlackHole → Meet mic → Meet captions agent's own speech.
 * This file manages that reality.
 *
 * SYSTEMS:
 * 1. Thinking Sound — Plays a looping sound effect while LLM processes (NOT TTS)
 * 2. Echo Management — Tracks speech state so the monitor can discard self-echo captions
 * 3. Voice Degradation — Clean transition from voice → chat when TTS fails
 *
 * REMOVED (too fragile with BlackHole echo):
 * - Smart interruption detection (can't distinguish echo from real interruption)
 * - "As I was saying" resume (requires interruption detection)
 * - Apology detection (requires caption analysis during speech)
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const _ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';

// ═══════════════════════════════════════════════════════════
// GLOBAL RESPONSE PLAYER KILL
// ═══════════════════════════════════════════════════════════
function _killResponsePlayer(agentId: string): boolean {
  const players = (globalThis as any).__activeResponsePlayers as Map<string, any> | undefined;
  if (!players) return false;
  const player = players.get(agentId);
  if (!player) return false;
  try { player.kill('SIGTERM'); } catch {}
  players.delete(agentId);
  return true;
}

// Keep exports for backward compat
export function registerResponseKill(_agentId: string, _killFn: () => boolean): void {}
export function unregisterResponseKill(_agentId: string): void {}

// ═══════════════════════════════════════════════════════════
// CONFIG
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

// ═══════════════════════════════════════════════════════════
// AUDIO PLAYBACK CONTROLLER
// ═══════════════════════════════════════════════════════════

class AudioPlaybackController {
  private currentPlayer: ChildProcessWithoutNullStreams | null = null;
  private playing = false;
  private interrupted = false;
  private device: string;

  constructor(device: string) {
    this.device = device;
  }

  async play(audioPath: string, volume = 0.7): Promise<{ completed: boolean; interrupted: boolean }> {
    this.interrupted = false;
    return new Promise((resolve) => {
      const platform = process.platform;
      let cmd: string, args: string[];
      if (platform === 'darwin') {
        cmd = 'sox';
        args = [audioPath, '-t', 'coreaudio', this.device, 'vol', String(volume)];
      } else if (platform === 'linux') {
        cmd = 'paplay';
        args = this.device ? ['--device=' + this.device, audioPath] : [audioPath];
      } else {
        cmd = 'sox';
        args = [audioPath, '-t', 'waveaudio', this.device, 'vol', String(volume)];
      }

      const player = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      this.currentPlayer = player as any;
      this.playing = true;

      player.on('close', (code) => {
        this.currentPlayer = null;
        this.playing = false;
        resolve({ completed: !this.interrupted && (code === 0 || code === null), interrupted: this.interrupted });
      });
      player.on('error', () => {
        this.currentPlayer = null;
        this.playing = false;
        resolve({ completed: false, interrupted: this.interrupted });
      });
    });
  }

  interrupt(): boolean {
    if (!this.currentPlayer || !this.playing) return false;
    this.interrupted = true;
    try { this.currentPlayer.kill('SIGTERM'); } catch {}
    return true;
  }

  get isPlaying(): boolean { return this.playing; }
}

// ═══════════════════════════════════════════════════════════
// SPEECH STATE — Simple state tracking for echo management
// ═══════════════════════════════════════════════════════════

type SpeechState =
  | 'idle'       // Nothing happening — captions are real
  | 'humming'    // Thinking sound playing — captions are real (hum doesn't go through TTS/mic)
  | 'speaking'   // Agent TTS playing through BlackHole — captions are ECHO, discard them
  ;

// ═══════════════════════════════════════════════════════════
// MEETING VOICE INTELLIGENCE
// ═══════════════════════════════════════════════════════════

export class MeetingVoiceIntelligence {
  private config: MeetingVoiceConfig;
  private playback: AudioPlaybackController;
  private audioDir: string;
  private _ready = false;
  private _voiceDegraded = false;
  private generating = false;
  private humPath: string | null = null;
  private _humming = false;

  // ─── Speech state tracking ───
  private _state: SpeechState = 'idle';
  /** When the agent last FINISHED speaking — echo captions linger for ~2s after */
  private lastSpeechEndedAt = 0;
  /** Echo cooldown: how long after speech ends to keep discarding captions */
  private static ECHO_COOLDOWN_MS = 2_000;
  /** Hum cooldown: don't hum again within this window after speaking */
  private static HUM_COOLDOWN_MS = 3_000;

  constructor(config: MeetingVoiceConfig) {
    this.config = config;
    this.playback = new AudioPlaybackController(config.audioDevice);
    this.audioDir = path.join(os.tmpdir(), `agenticmail-voice-${config.agentId}`);
  }

  // ─── Initialization ─────────────────────────────────────

  async initialize(): Promise<{ generated: number; errors: number; durationMs: number }> {
    if (this.generating) return { generated: 0, errors: 0, durationMs: 0 };
    this.generating = true;
    const start = Date.now();

    // ─── Locate bundled thinking sound (plays directly from dist/assets) ───
    try {
      const { fileURLToPath } = await import('url');
      const thisDir = path.dirname(fileURLToPath(import.meta.url));
      const candidates = [
        path.join(thisDir, 'assets', 'thinking-hum.mp3'),
        path.join(thisDir, '..', 'assets', 'thinking-hum.mp3'),
      ];
      for (const p of candidates) {
        try {
          const stat = await fs.stat(p);
          if (stat.size > 500) { this.humPath = p; break; }
        } catch { /* try next */ }
      }
      if (!this.humPath) console.warn(`[voice-intel:${this.config.agentId}] thinking-hum.mp3 not found in assets`);
    } catch (e: any) {
      console.warn(`[voice-intel:${this.config.agentId}] No thinking sound available: ${e.message}`);
    }

    this._ready = this.humPath !== null;
    this.generating = false;
    const duration = Date.now() - start;
    console.log(`[voice-intel:${this.config.agentId}] Initialized: hum=${!!this.humPath} (${duration}ms)`);
    return { generated: this.humPath ? 1 : 0, errors: 0, durationMs: duration };
  }

  // ─── Thinking Sound ─────────────────────────────────────

  async playHum(): Promise<{ played: boolean }> {
    if (!this.humPath) return { played: false };
    if (this._humming) return { played: false };
    if (this._state === 'speaking') return { played: false };
    // Don't hum right after speaking (echo cooldown period)
    if (Date.now() - this.lastSpeechEndedAt < MeetingVoiceIntelligence.HUM_COOLDOWN_MS) return { played: false };

    // Kill any lingering playback before starting hum
    if (this.playback.isPlaying) this.playback.interrupt();

    this._humming = true;
    this._state = 'humming';
    console.log(`[voice-intel:${this.config.agentId}] Playing thinking sound (${this.humPath})`);

    // Loop until stopAll() kills it — resilient to individual play failures
    while (this._humming) {
      try {
        const result = await this.playback.play(this.humPath!, 1.5);
        if (result.interrupted || !this._humming) break;
        // If play completed normally (not interrupted), loop back to replay
      } catch {
        // sox crashed or errored — wait a beat then retry
        if (!this._humming) break;
        await new Promise(r => setTimeout(r, 500));
      }
    }

    this._humming = false;
    if (this._state === 'humming') this._state = 'idle';
    return { played: true };
  }

  // ─── Speech State (called by meeting_speak tool) ────────

  /** Call BEFORE streaming TTS response audio */
  markSpeaking(_text: string): void {
    this._state = 'speaking';
  }

  /** Call AFTER TTS response finishes (or fails) */
  markDoneSpeaking(): void {
    this.lastSpeechEndedAt = Date.now();
    this._state = 'idle';
  }

  // ─── Echo Detection (called by meeting-monitor) ─────────

  /**
   * Should the monitor discard captions right now?
   * TRUE when agent is speaking OR within echo cooldown after speaking.
   * FALSE when idle or humming (those captions are from real humans).
   */
  get shouldDiscardCaptions(): boolean {
    if (this._state === 'speaking') return true;
    // Echo lingers ~2s after speech ends
    if (Date.now() - this.lastSpeechEndedAt < MeetingVoiceIntelligence.ECHO_COOLDOWN_MS) return true;
    return false;
  }

  // ─── Stop All Audio ─────────────────────────────────────

  stopAll(): boolean {
    const wasPlaying = this.playback.isPlaying;
    if (wasPlaying) this.playback.interrupt();
    this._humming = false;
    const killedResponse = _killResponsePlayer(this.config.agentId);
    if (wasPlaying || killedResponse) {
      console.log(`[voice-intel:${this.config.agentId}] Audio stopped (hum=${wasPlaying}, response=${killedResponse})`);
    }
    return wasPlaying || killedResponse;
  }

  // ─── Voice Degradation ──────────────────────────────────

  /** Voice TTS failed — switch to chat mode but KEEP hum working.
   *  Hum is a local audio file (no ElevenLabs needed), so it should
   *  still play during silence while the agent processes via chat. */
  shutdown(): void {
    // Stop any current speech/hum playback
    this.stopAll();
    // Only disable TTS-dependent features, NOT hum
    this._voiceDegraded = true;
    this._state = 'idle';
    this.lastSpeechEndedAt = 0;
    console.log(`[voice-intel:${this.config.agentId}] Voice degraded to chat — hum still active`);
  }

  // ─── Getters ────────────────────────────────────────────

  get isReady(): boolean { return this._ready; }
  get isVoiceDegraded(): boolean { return this._voiceDegraded; }
  get isHumming(): boolean { return this._humming; }
  get isSpeaking(): boolean { return this._state === 'speaking'; }
  get state(): SpeechState { return this._state; }

  // Legacy compat — used by monitor and meeting_speak
  get isPlaying(): boolean { return this.playback.isPlaying || this._state === 'speaking'; }
  get isPlayingOrRecent(): boolean { return this.shouldDiscardCaptions; }

  get stats() {
    return {
      ready: this._ready,
      state: this._state,
      isPlaying: this.playback.isPlaying,
      isHumming: this._humming,
    };
  }

  // ─── Cleanup ────────────────────────────────────────────

  async cleanup(): Promise<void> {
    this.shutdown();
    this.humPath = null;
  }

  // Legacy stubs — interruption system removed
  handleInterruption(_captionText: string) { return { action: 'ignore' as const, reason: 'Interruption system disabled' }; }
  hasPendingResume() { return false; }
  async executeResume() { return { success: false, text: '' }; }
  cancelResume() {}
  markDoneSpeaking_legacy(_completed: boolean) { this.markDoneSpeaking(); }

  // Legacy — decisionEngine stub
  get decisionEngine() {
    return {
      analyze: (_captions: any[]) => ({ shouldSpeak: true, reason: 'Voice active' }),
    };
  }
}

// ═══════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════

const activeInstances = new Map<string, MeetingVoiceIntelligence>();

export function createMeetingVoiceIntelligence(config: MeetingVoiceConfig): MeetingVoiceIntelligence {
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
  if (instance) { instance.cleanup(); activeInstances.delete(agentId); }
}
