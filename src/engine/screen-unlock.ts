/**
 * Screen Unlock & Machine Access Utilities
 *
 * Provides auto-unlock functionality for macOS and Linux.
 * Called by the heartbeat system, agent startup, and browser automation
 * when the screen is detected as locked.
 */

import { execSync } from 'child_process';

let _caffeinate: any = null;

/**
 * Check if the screen is currently locked.
 */
export function isScreenLocked(): boolean {
  try {
    if (process.platform === 'darwin') {
      try {
        const out = execSync('python3 -c "import Quartz; d=Quartz.CGSessionCopyCurrentDictionary(); print(d.get(\'CGSSessionScreenIsLocked\', 0))"', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 3000 }).trim();
        return out === '1' || out === 'True';
      } catch {
        try {
          const out = execSync('osascript -e \'tell application "System Events" to get name of first application process whose frontmost is true\'', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 3000 }).trim();
          return out === 'loginwindow' || out === 'ScreenSaverEngine';
        } catch { return false; }
      }
    } else if (process.platform === 'linux') {
      try {
        const out = execSync('loginctl show-session $(loginctl list-sessions --no-legend | head -1 | awk \'{print $1}\') -p LockedHint --value', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 3000 }).trim();
        return out === 'yes';
      } catch { return false; }
    }
  } catch {}
  return false;
}

/**
 * Attempt to unlock the screen with the given password.
 * Returns true if successful.
 */
export async function unlockScreen(password: string): Promise<{ success: boolean; message: string }> {
  if (!password) return { success: false, message: 'No password provided' };

  try {
    if (process.platform === 'darwin') {
      // Wake the display first
      try { execSync('caffeinate -u -t 2', { stdio: 'pipe', timeout: 5000 }); } catch {}
      await new Promise(r => setTimeout(r, 500));

      if (!isScreenLocked()) {
        return { success: true, message: 'Screen is already unlocked' };
      }

      // Type password using AppleScript
      const escaped = password.replace(/["\\]/g, '\\$&');
      execSync(`osascript -e 'tell application "System Events" to keystroke "${escaped}"' -e 'delay 0.3' -e 'tell application "System Events" to key code 36'`, {
        stdio: 'pipe', timeout: 10000
      });

      // Wait and verify
      await new Promise(r => setTimeout(r, 2000));
      if (isScreenLocked()) {
        return { success: false, message: 'Failed to unlock — password may be incorrect' };
      }
      return { success: true, message: 'Screen unlocked successfully' };
    } else if (process.platform === 'linux') {
      // Try loginctl first
      try {
        execSync('loginctl unlock-session $(loginctl list-sessions --no-legend | head -1 | awk \'{print $1}\')', { stdio: 'pipe', timeout: 5000 });
        return { success: true, message: 'Session unlocked via loginctl' };
      } catch {}
      // Try xdotool
      try {
        const escaped = password.replace(/["\\]/g, '\\$&');
        execSync(`xdotool key --clearmodifiers super; sleep 0.5; xdotool type --clearmodifiers "${escaped}"; xdotool key Return`, { stdio: 'pipe', timeout: 10000 });
        return { success: true, message: 'Unlock attempted via xdotool' };
      } catch {}
      return { success: false, message: 'Could not unlock Linux session' };
    }
    return { success: false, message: `Unsupported platform: ${process.platform}` };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

/**
 * Ensure the screen is unlocked. Uses the security config to get the password.
 * Call this before any operation that requires screen access (browser, desktop automation).
 */
export async function ensureScreenUnlocked(getSecurityConfig: () => Promise<any>): Promise<boolean> {
  if (!isScreenLocked()) return true;

  try {
    const config = await getSecurityConfig();
    const screenAccess = config?.screenAccess;
    if (!screenAccess?.enabled || !screenAccess?.autoUnlock) return false;
    if (!screenAccess?.systemPassword) return false;

    const result = await unlockScreen(screenAccess.systemPassword);
    return result.success;
  } catch {
    return false;
  }
}

/**
 * Start caffeinate to prevent system sleep. Call once at server startup if configured.
 */
export function startPreventSleep(): void {
  if (_caffeinate) return; // Already running
  if (process.platform !== 'darwin' && process.platform !== 'linux') return;

  try {
    const { spawn } = require('child_process');
    if (process.platform === 'darwin') {
      // caffeinate -d prevents display sleep, -i prevents idle sleep
      _caffeinate = spawn('caffeinate', ['-d', '-i'], { stdio: 'ignore', detached: true });
      _caffeinate.unref();
    } else {
      // Linux: systemd-inhibit
      _caffeinate = spawn('systemd-inhibit', ['--what=idle:sleep', '--who=agenticmail', '--why=Agent activity', 'sleep', 'infinity'], { stdio: 'ignore', detached: true });
      _caffeinate.unref();
    }
  } catch {}
}

/**
 * Stop preventing system sleep.
 */
export function stopPreventSleep(): void {
  if (_caffeinate) {
    try { _caffeinate.kill(); } catch {}
    _caffeinate = null;
  }
}
