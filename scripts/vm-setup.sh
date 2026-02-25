#!/bin/bash
# ─────────────────────────────────────────────────────────────
# AgenticMail Enterprise — VM Setup Script
#
# Sets up a Linux VM (Ubuntu 22.04/24.04) with everything needed
# for full enterprise agent capabilities including:
# - Node.js 22
# - Chromium (headed via Xvfb virtual display)
# - PulseAudio (virtual audio for meetings)
# - v4l2loopback (virtual camera)
# - FFmpeg (recording/transcoding)
# - PostgreSQL client
# - Systemd service for auto-start
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/agenticmail/enterprise/main/scripts/vm-setup.sh | bash
#   # or
#   bash vm-setup.sh
#
# Tested on: Ubuntu 22.04 LTS, Ubuntu 24.04 LTS, Debian 12
# Recommended: Hetzner CPX31 (4 vCPU, 8GB RAM) — $15/mo
# ─────────────────────────────────────────────────────────────

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*"; exit 1; }
step() { echo -e "\n${BLUE}━━━ $* ━━━${NC}"; }

# Must be root or sudo
if [ "$(id -u)" -ne 0 ]; then
  err "Run as root: sudo bash vm-setup.sh"
fi

AGENT_USER="${AGENT_USER:-agenticmail}"
AGENT_HOME="/home/${AGENT_USER}"
AGENT_PORT="${AGENT_PORT:-8080}"
NODE_VERSION="22"

step "1/8 — System Update"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
log "System updated"

step "2/8 — Install Core Dependencies"
apt-get install -y -qq \
  curl wget git unzip jq \
  build-essential \
  ca-certificates gnupg \
  fonts-liberation fonts-noto-color-emoji \
  libatk-bridge2.0-0 libatk1.0-0 libcups2 libdrm2 \
  libgbm1 libgtk-3-0 libnss3 libxcomposite1 libxdamage1 \
  libxfixes3 libxrandr2 libxss1 libpango-1.0-0 \
  xdg-utils libasound2 \
  > /dev/null
log "Core dependencies installed"

step "3/8 — Node.js ${NODE_VERSION}"
if ! command -v node &>/dev/null || ! node -v | grep -q "v${NODE_VERSION}"; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs > /dev/null
fi
log "Node.js $(node -v) installed"

step "4/8 — Chromium + Xvfb (Virtual Display)"
apt-get install -y -qq chromium-browser xvfb > /dev/null 2>&1 || \
  apt-get install -y -qq chromium xvfb > /dev/null 2>&1
CHROMIUM_PATH=$(which chromium-browser 2>/dev/null || which chromium 2>/dev/null || echo "")
if [ -z "$CHROMIUM_PATH" ]; then
  warn "Chromium not found in repos, trying snap..."
  snap install chromium 2>/dev/null || true
  CHROMIUM_PATH="/snap/bin/chromium"
fi
log "Chromium installed at: $CHROMIUM_PATH"
log "Xvfb installed"

step "5/8 — PulseAudio + Virtual Audio"
apt-get install -y -qq pulseaudio pulseaudio-utils > /dev/null
log "PulseAudio installed"

# v4l2loopback for virtual camera
apt-get install -y -qq v4l2loopback-dkms v4l2loopback-utils > /dev/null 2>&1 || \
  warn "v4l2loopback not available (kernel headers may be needed). Virtual camera skipped."
log "Virtual audio + camera setup complete"

step "6/8 — FFmpeg"
apt-get install -y -qq ffmpeg > /dev/null
log "FFmpeg $(ffmpeg -version 2>&1 | head -1 | awk '{print $3}') installed"

step "7/8 — Create Agent User + Application"
# Create user if doesn't exist
if ! id "$AGENT_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$AGENT_USER"
  log "Created user: $AGENT_USER"
else
  log "User $AGENT_USER already exists"
fi

# Create app directory
mkdir -p "${AGENT_HOME}/app" "${AGENT_HOME}/data" "${AGENT_HOME}/recordings"
chown -R "${AGENT_USER}:${AGENT_USER}" "${AGENT_HOME}"

# Install enterprise package
cat > "${AGENT_HOME}/app/package.json" << 'PKGJSON'
{
  "name": "agenticmail-enterprise-vm",
  "private": true,
  "type": "module",
  "dependencies": {
    "@agenticmail/enterprise": "0.5.84",
    "pg": "^8.18.0",
    "playwright-core": "^1.50.0",
    "ws": "^8.18.0",
    "imapflow": "^1.0.171",
    "nodemailer": "^6.10.0"
  }
}
PKGJSON

cat > "${AGENT_HOME}/app/entrypoint.mjs" << 'ENTRY'
import { createServer, startServer } from '@agenticmail/enterprise';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const db = { query: (sql, params) => pool.query(sql, params) };

const server = createServer({ db, port: parseInt(process.env.PORT || '8080') });
await startServer(server);
console.log(`[enterprise] Running on port ${process.env.PORT || 8080} | VM deployment`);
ENTRY

cd "${AGENT_HOME}/app"
su - "$AGENT_USER" -c "cd ~/app && npm install --production" 2>/dev/null
log "Enterprise application installed"

step "8/8 — Systemd Services"

# Xvfb service (virtual display)
cat > /etc/systemd/system/xvfb.service << EOF
[Unit]
Description=Xvfb Virtual Display
After=network.target

[Service]
Type=simple
User=${AGENT_USER}
ExecStart=/usr/bin/Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset
Environment=DISPLAY=:99
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# PulseAudio service (virtual audio)
cat > /etc/systemd/system/pulseaudio-virtual.service << EOF
[Unit]
Description=PulseAudio Virtual Audio
After=xvfb.service
Requires=xvfb.service

[Service]
Type=simple
User=${AGENT_USER}
Environment=HOME=${AGENT_HOME}
ExecStartPre=/bin/bash -c 'mkdir -p ${AGENT_HOME}/.config/pulse'
ExecStart=/usr/bin/pulseaudio --daemonize=no --exit-idle-time=-1 --log-level=notice
ExecStartPost=/bin/bash -c 'sleep 2 && pactl load-module module-null-sink sink_name=virtual_speaker sink_properties=device.description="Virtual_Speaker" && pactl load-module module-virtual-source source_name=virtual_mic master=virtual_speaker.monitor source_properties=device.description="Virtual_Microphone"'
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# v4l2loopback (virtual camera)
cat > /etc/systemd/system/v4l2loopback.service << EOF
[Unit]
Description=v4l2loopback Virtual Camera
After=network.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/sbin/modprobe v4l2loopback devices=1 video_nr=10 card_label="Virtual_Camera" exclusive_caps=1
ExecStop=/sbin/modprobe -r v4l2loopback

[Install]
WantedBy=multi-user.target
EOF

# Main enterprise agent service
cat > /etc/systemd/system/agenticmail.service << EOF
[Unit]
Description=AgenticMail Enterprise Agent
After=network.target xvfb.service pulseaudio-virtual.service
Wants=xvfb.service pulseaudio-virtual.service

[Service]
Type=simple
User=${AGENT_USER}
WorkingDirectory=${AGENT_HOME}/app
EnvironmentFile=${AGENT_HOME}/.env
Environment=NODE_ENV=production
Environment=DISPLAY=:99
Environment=PULSE_SERVER=unix:/run/user/$(id -u ${AGENT_USER})/pulse/native
Environment=PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=${CHROMIUM_PATH}
Environment=PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
Environment=XDG_RUNTIME_DIR=/run/user/$(id -u ${AGENT_USER})
ExecStart=/usr/bin/node entrypoint.mjs
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=agenticmail

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=${AGENT_HOME} /tmp
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

# Create .env template
if [ ! -f "${AGENT_HOME}/.env" ]; then
  cat > "${AGENT_HOME}/.env" << 'ENVFILE'
# AgenticMail Enterprise — Environment Configuration
# Edit these values before starting the service.

# Required: PostgreSQL connection string
DATABASE_URL=postgresql://user:password@host:5432/dbname?sslmode=require

# Required: JWT secret for API authentication
JWT_SECRET=change-me-to-a-random-string

# Optional: Port (default 8080)
PORT=8080

# These are auto-set by systemd, but can be overridden:
# DISPLAY=:99
# PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENVFILE
  chown "${AGENT_USER}:${AGENT_USER}" "${AGENT_HOME}/.env"
  chmod 600 "${AGENT_HOME}/.env"
fi

# Enable services
systemctl daemon-reload
systemctl enable xvfb.service
systemctl enable pulseaudio-virtual.service
systemctl enable agenticmail.service
# Don't enable v4l2loopback by default (may not have kernel module)
systemctl enable v4l2loopback.service 2>/dev/null || true

log "Systemd services created and enabled"

# ─── Summary ──────────────────────────────────────────────

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  AgenticMail Enterprise — VM Setup Complete${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Installed:"
echo "    Node.js   $(node -v)"
echo "    Chromium  ${CHROMIUM_PATH}"
echo "    Xvfb      Virtual display :99 (1920x1080)"
echo "    Pulse     Virtual audio (speaker + mic)"
echo "    FFmpeg    $(ffmpeg -version 2>&1 | head -1 | awk '{print $3}')"
echo ""
echo "  Next steps:"
echo ""
echo "    1. Edit the .env file with your database and secrets:"
echo "       ${YELLOW}sudo nano ${AGENT_HOME}/.env${NC}"
echo ""
echo "    2. Start all services:"
echo "       ${YELLOW}sudo systemctl start xvfb${NC}"
echo "       ${YELLOW}sudo systemctl start pulseaudio-virtual${NC}"
echo "       ${YELLOW}sudo systemctl start agenticmail${NC}"
echo ""
echo "    3. Check status:"
echo "       ${YELLOW}sudo systemctl status agenticmail${NC}"
echo "       ${YELLOW}sudo journalctl -u agenticmail -f${NC}"
echo ""
echo "    4. Update to latest version:"
echo "       ${YELLOW}cd ${AGENT_HOME}/app && npm update @agenticmail/enterprise && sudo systemctl restart agenticmail${NC}"
echo ""
echo "  Capabilities on this VM:"
echo "    ✓ Headless + headed browser (via Xvfb)"
echo "    ✓ Video meetings (Google Meet, Zoom, Teams)"
echo "    ✓ Meeting recording (ffmpeg)"
echo "    ✓ Google Workspace (Calendar, Drive, Docs, Sheets, Gmail)"
echo "    ✓ Persistent storage"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
