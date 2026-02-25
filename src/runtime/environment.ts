/**
 * Enterprise Deployment Environment Detection
 *
 * Detects the deployment environment (container vs VM vs local dev)
 * and available system capabilities (browser, audio, video, display).
 * Tools use this to gracefully degrade or provide helpful error messages.
 */

import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

export type DeploymentType = 'container' | 'vm' | 'local' | 'unknown' | 'Fly.io (container)' | 'Railway (container)' | 'Render (container)' | `Local (${string})`;

export interface SystemCapabilities {
  /** Deployment type detected */
  deployment: DeploymentType;
  /** Browser available (Chromium/Chrome installed) */
  hasBrowser: boolean;
  /** Browser executable path (if found) */
  browserPath: string | null;
  /** Display server available (X11/Wayland/macOS) */
  hasDisplay: boolean;
  /** Audio subsystem available (PulseAudio/PipeWire/ALSA/macOS CoreAudio) */
  hasAudio: boolean;
  /** Virtual camera available (v4l2loopback or macOS) */
  hasVirtualCamera: boolean;
  /** Can run headed browser (display + browser) */
  canRunHeadedBrowser: boolean;
  /** Can join video calls (display + browser + audio) — may be observer-only on containers */
  canJoinMeetings: boolean;
  /** Can join with full media (real audio/video, not container fake media) */
  canJoinMeetingsFullMedia: boolean;
  /** Can record meetings (display + browser + audio + ffmpeg) */
  canRecordMeetings: boolean;
  /** Container deployment with Xvfb+PulseAudio but fake media (observer-only) */
  isContainerWithFakeMedia: boolean;
  /** ffmpeg available */
  hasFfmpeg: boolean;
  /** Persistent filesystem (not ephemeral container) */
  hasPersistentDisk: boolean;
  /** GPU available */
  hasGpu: boolean;
  /** Platform details */
  platform: {
    os: string;
    arch: string;
    isDocker: boolean;
    isFlyio: boolean;
    isRailway: boolean;
    isRender: boolean;
    isAWS: boolean;
    isGCP: boolean;
    isHetzner: boolean;
  };
}

/** Cached result */
let _cachedCapabilities: SystemCapabilities | null = null;

function commandExists(cmd: string): boolean {
  try {
    execSync(`which ${cmd} 2>/dev/null`, { encoding: 'utf-8', timeout: 3000 });
    return true;
  } catch { return false; }
}

function envSet(key: string): boolean {
  return !!process.env[key];
}

function detectDeploymentType(): DeploymentType {
  // Fly.io
  if (envSet('FLY_APP_NAME') || envSet('FLY_MACHINE_ID')) return 'container';
  // Railway
  if (envSet('RAILWAY_ENVIRONMENT') || envSet('RAILWAY_SERVICE_ID')) return 'container';
  // Render
  if (envSet('RENDER_SERVICE_ID') || envSet('RENDER')) return 'container';
  // Generic Docker
  if (existsSync('/.dockerenv') || existsSync('/run/.containerenv')) return 'container';
  // Kubernetes
  if (envSet('KUBERNETES_SERVICE_HOST')) return 'container';
  // AWS ECS
  if (envSet('ECS_CONTAINER_METADATA_URI')) return 'container';

  // VM indicators
  if (envSet('SSH_CONNECTION') || envSet('SSH_CLIENT')) return 'vm';
  // systemd on Linux without Docker = likely VM
  if (process.platform === 'linux' && existsSync('/run/systemd/system') && !existsSync('/.dockerenv')) return 'vm';

  // macOS / Windows with display = local dev
  if (process.platform === 'darwin' || process.platform === 'win32') return 'local';

  // Linux with DISPLAY or Wayland = probably local or VM with desktop
  if (process.platform === 'linux' && (envSet('DISPLAY') || envSet('WAYLAND_DISPLAY'))) return 'vm';

  return 'unknown';
}

function findBrowser(): string | null {
  // Check env var first (set in Docker)
  const envPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || process.env.CHROME_PATH;
  if (envPath && existsSync(envPath)) return envPath;

  const candidates = [
    // Linux
    '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    // Snap
    '/snap/bin/chromium',
  ];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  // Try which
  try {
    const path = execSync('which chromium || which chromium-browser || which google-chrome 2>/dev/null', {
      encoding: 'utf-8', timeout: 3000,
    }).trim();
    if (path) return path;
  } catch { /* ignore */ }

  return null;
}

function hasDisplayServer(): boolean {
  if (process.platform === 'darwin' || process.platform === 'win32') return true;
  if (envSet('DISPLAY') || envSet('WAYLAND_DISPLAY')) return true;
  // Check for Xvfb
  if (commandExists('Xvfb') || commandExists('xvfb-run')) return true;
  // Check if Xvfb is running
  try {
    execSync('pgrep -x Xvfb', { encoding: 'utf-8', timeout: 2000 });
    return true;
  } catch { /* not running */ }
  return false;
}

function hasAudioSystem(): boolean {
  if (process.platform === 'darwin') return true; // CoreAudio always available
  // PulseAudio
  if (commandExists('pulseaudio') || commandExists('pactl')) {
    try {
      execSync('pactl info 2>/dev/null', { encoding: 'utf-8', timeout: 3000 });
      return true;
    } catch { /* not running */ }
  }
  // PipeWire
  if (commandExists('pw-cli')) {
    try {
      execSync('pw-cli info 2>/dev/null', { encoding: 'utf-8', timeout: 3000 });
      return true;
    } catch { /* not running */ }
  }
  return false;
}

function hasVCam(): boolean {
  if (process.platform === 'darwin') return false; // Need OBS virtual cam or similar
  // v4l2loopback
  try {
    execSync('ls /dev/video* 2>/dev/null', { encoding: 'utf-8', timeout: 2000 });
    return true;
  } catch { return false; }
}

/**
 * Detect system capabilities. Results are cached after first call.
 */
export function detectCapabilities(): SystemCapabilities {
  if (_cachedCapabilities) return _cachedCapabilities;

  const deployment = detectDeploymentType();
  const browserPath = findBrowser();
  const hasBrowser = !!browserPath;
  const hasDisplay = hasDisplayServer();
  const hasAudio = hasAudioSystem();
  const hasVirtualCamera = hasVCam();
  const hasFfmpeg = commandExists('ffmpeg');

  // Persistent disk: containers are typically ephemeral
  const hasPersistentDisk = deployment !== 'container' || envSet('FLY_VOLUME_NAME') || envSet('RAILWAY_VOLUME_MOUNT_PATH');

  // GPU check
  let hasGpu = false;
  try {
    if (commandExists('nvidia-smi')) { execSync('nvidia-smi', { timeout: 3000 }); hasGpu = true; }
  } catch { /* no GPU */ }

  // On containers with fake media, meetings work but only as observer (no real audio/video)
  const isContainerWithFakeMedia = deployment === 'container' && hasBrowser && hasDisplay && hasAudio;

  const caps: SystemCapabilities = {
    deployment,
    hasBrowser,
    browserPath,
    hasDisplay,
    hasAudio,
    hasVirtualCamera,
    canRunHeadedBrowser: hasBrowser && hasDisplay,
    canJoinMeetings: hasBrowser && hasDisplay && hasAudio,
    canJoinMeetingsFullMedia: hasBrowser && hasDisplay && hasAudio && !isContainerWithFakeMedia,
    canRecordMeetings: hasBrowser && hasDisplay && hasAudio && hasFfmpeg,
    isContainerWithFakeMedia,
    hasFfmpeg,
    hasPersistentDisk: !!hasPersistentDisk,
    hasGpu,
    platform: {
      os: process.platform,
      arch: process.arch,
      isDocker: existsSync('/.dockerenv') || existsSync('/run/.containerenv'),
      isFlyio: envSet('FLY_APP_NAME'),
      isRailway: envSet('RAILWAY_ENVIRONMENT'),
      isRender: envSet('RENDER'),
      isAWS: envSet('AWS_REGION') || envSet('ECS_CONTAINER_METADATA_URI'),
      isGCP: envSet('GOOGLE_CLOUD_PROJECT') || envSet('GCP_PROJECT'),
      isHetzner: false, // No standard env var
    },
  };

  _cachedCapabilities = caps;
  return caps;
}

/** Reset cache (for testing) */
export function resetCapabilitiesCache(): void {
  _cachedCapabilities = null;
}

/**
 * Get a human-readable summary of what this deployment can and cannot do.
 * Used in tool error messages and dashboard status.
 */
export function getCapabilitySummary(caps?: SystemCapabilities): {
  deployment: string;
  available: string[];
  unavailable: string[];
  recommendations: string[];
} {
  const c = caps || detectCapabilities();
  const available: string[] = [];
  const unavailable: string[] = [];
  const recommendations: string[] = [];

  if (c.hasBrowser) available.push('Browser (headless)');
  else unavailable.push('Browser — no Chromium/Chrome found');

  if (c.canRunHeadedBrowser) available.push('Browser (headed/visible)');
  else if (c.hasBrowser) unavailable.push('Headed browser — no display server (install Xvfb)');

  if (c.canJoinMeetingsFullMedia) available.push('Video meetings — full media (Google Meet, Zoom, Teams)');
  else if (c.canJoinMeetings && c.isContainerWithFakeMedia) available.push('Video meetings — observer only (container: no real audio/video, can read chat + take notes)');
  else unavailable.push('Video meetings — requires display + browser + audio');

  if (c.canRecordMeetings) available.push('Meeting recording');
  else if (c.canJoinMeetings) unavailable.push('Meeting recording — install ffmpeg');

  if (c.hasAudio) available.push('Audio subsystem');
  else unavailable.push('Audio — no PulseAudio/PipeWire');

  if (c.hasVirtualCamera) available.push('Virtual camera');
  else unavailable.push('Virtual camera — no v4l2loopback');

  if (c.hasFfmpeg) available.push('FFmpeg (video/audio processing)');
  else unavailable.push('FFmpeg — install for recording/transcoding');

  if (c.hasPersistentDisk) available.push('Persistent storage');
  else unavailable.push('Persistent storage — ephemeral container filesystem');

  // Recommendations based on deployment
  if (c.deployment === 'container' && !c.canJoinMeetings) {
    recommendations.push(
      'This is a container deployment. For video meetings, deploy on a VM instead.',
      'Recommended: Hetzner CPX31 ($15/mo) or GCP e2-standard-2 ($50/mo) with the VM setup script.',
      'Container deployments work great for API-only tasks: email, calendar, docs, drive, sheets.'
    );
  }

  if (c.deployment === 'vm' && !c.hasDisplay) {
    recommendations.push('Install Xvfb for virtual display: apt install xvfb');
  }
  if (c.deployment === 'vm' && !c.hasAudio) {
    recommendations.push('Install PulseAudio for audio: apt install pulseaudio');
  }
  if (c.deployment === 'vm' && !c.hasBrowser) {
    recommendations.push('Install Chromium: apt install chromium-browser');
  }

  let deployLabel = c.deployment;
  if (c.platform.isFlyio) deployLabel = 'Fly.io (container)';
  else if (c.platform.isRailway) deployLabel = 'Railway (container)';
  else if (c.platform.isRender) deployLabel = 'Render (container)';
  else if (c.deployment === 'local') deployLabel = `Local (${c.platform.os})`;

  return { deployment: deployLabel, available, unavailable, recommendations };
}
