#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="/opt/signage"
CONFIG_DIR="/etc/signage"
LOG_DIR="/var/log/signage"
LIB_DIR="/var/lib/signage"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Signage Kiosk Installation Script"
echo "    Repository: $REPO_DIR"
echo "    Install dir: $INSTALL_DIR"

# Check running as root
if [[ $EUID -ne 0 ]]; then
  echo "ERROR: This script must be run as root (sudo)." >&2
  exit 1
fi

# Create directories
echo "==> Creating directories..."
mkdir -p "$INSTALL_DIR" "$CONFIG_DIR" "$LOG_DIR" "$LIB_DIR"
chown -R pi:pi "$LOG_DIR" "$LIB_DIR"

# Copy files
echo "==> Copying application files..."
rsync -av --delete \
  --exclude='node_modules' \
  --exclude='.git' \
  "$REPO_DIR/controller/" "$INSTALL_DIR/controller/"

rsync -av --delete \
  --exclude='node_modules' \
  "$REPO_DIR/renderer/" "$INSTALL_DIR/renderer/"

rsync -av "$REPO_DIR/config/" "$INSTALL_DIR/config/"

# Copy default config if none exists
if [[ ! -f "$CONFIG_DIR/config.json" ]]; then
  echo "==> Installing default config to $CONFIG_DIR/config.json..."
  cp "$REPO_DIR/config/default.json" "$CONFIG_DIR/config.json"
fi

# Install Node.js dependencies
echo "==> Installing controller dependencies..."
cd "$INSTALL_DIR/controller" || { echo "ERROR: $INSTALL_DIR/controller not found"; exit 1; }
npm install --omit=dev

echo "==> Installing renderer dependencies..."
cd "$INSTALL_DIR/renderer" || { echo "ERROR: $INSTALL_DIR/renderer not found"; exit 1; }
npm install --omit=dev

# Create default fallback image placeholder if not exists
if [[ ! -f "$INSTALL_DIR/default.jpg" ]]; then
  echo "==> Creating placeholder fallback image..."
  node -e "
    const buf = Buffer.from(
      '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U' +
      'HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgN' +
      'DRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy' +
      'MjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAA' +
      'AAAAAAAAAAAAAP/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA' +
      '/9oADAMBAAIRAxEAPwCwABmX/9k=',
      'base64'
    );
    require('fs').writeFileSync('$INSTALL_DIR/default.jpg', buf);
  "
fi

# Set up logrotate
echo "==> Configuring logrotate..."
cat > /etc/logrotate.d/signage << 'LOGROTATE'
/var/log/signage/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 0640 pi pi
    sharedscripts
    postrotate
        systemctl reload-or-restart signage-controller.service 2>/dev/null || true
    endscript
}
LOGROTATE

# Install systemd services
echo "==> Installing systemd services..."
cp "$REPO_DIR/systemd/signage-controller.service" /etc/systemd/system/
cp "$REPO_DIR/systemd/signage-kiosk.service" /etc/systemd/system/
systemctl daemon-reload

# Enable and start services
echo "==> Enabling services..."
systemctl enable signage-controller.service
systemctl enable signage-kiosk.service

echo "==> Starting signage-controller..."
systemctl start signage-controller.service || true

echo ""
echo "==> Installation complete!"
echo "    Start kiosk manually: sudo systemctl start signage-kiosk.service"
echo "    View logs: journalctl -u signage-controller -f"
echo "    Log files: $LOG_DIR"
