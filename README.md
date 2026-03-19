# Raspberry Pi Digital Signage Kiosk

A production-ready digital signage kiosk system for Raspberry Pi. Displays HLS video streams in fullscreen kiosk mode, with automatic fallback to a static image when no stream is available.

## Architecture

The system uses a **two-process architecture** communicating over a local WebSocket connection:

```
Central Server (remote)
        │  WebSocket (ws://...)
        ▼
┌─────────────────────────────────┐
│        Controller Process        │
│  (controller/src/index.js)       │
│                                  │
│  ┌──────────────┐                │
│  │ State Machine │ FALLBACK /    │
│  │              │ PROBING_STREAM │
│  │              │ / STREAM       │
│  └──────────────┘                │
│  ┌──────────────┐                │
│  │  WS Client   │ ← Central WS  │
│  └──────────────┘                │
│  ┌──────────────┐                │
│  │ Passive Poll │ ← HTTP endpoint│
│  └──────────────┘                │
│  ┌──────────────┐                │
│  │ Renderer WS  │ → ws://127.0.0.1:8081
│  │   Server     │                │
│  └──────────────┘                │
└─────────────────────────────────┘
        │  WebSocket (127.0.0.1:8081)
        ▼
┌─────────────────────────────────┐
│        Renderer Process          │
│  (renderer/server.js)            │
│                                  │
│  Express static → public/        │
│  ┌──────────────────────────┐    │
│  │  Browser (Chromium Kiosk) │    │
│  │  app.js ↔ WS controller  │    │
│  │  HLS.js / native HLS     │    │
│  │  Freeze detection        │    │
│  └──────────────────────────┘    │
└─────────────────────────────────┘
```

### State Machine

```
         ┌─────────────────┐
    ┌────▶│    FALLBACK     │◀────┐
    │     └────────┬────────┘     │
    │              │ stream URL   │
    │              ▼              │ max retries / CLEAR_STREAM
    │     ┌────────────────┐      │
    │     │ PROBING_STREAM │──────┤
    │     └────────┬───────┘      │
    │              │ PROBE_OK     │
    │              ▼              │
    │     ┌────────────────┐      │
    └─────│     STREAM     │──────┘
          └────────────────┘
           PLAYBACK_ERROR / FROZEN
```

### Key Features

- **Automatic reconnection** to central WebSocket server with exponential backoff and jitter
- **Stream probing** before switching — avoids showing broken streams
- **Freeze detection** — detects stalled `currentTime` and reports to controller
- **Passive polling** — optional HTTP endpoint polling when no WS stream command is active
- **Stream URL caching** — persists last working URL to survive restarts
- **HLS.js** for non-native HLS browsers; native HLS fallback for Safari/iOS
- **systemd** service units for both processes
- **Log rotation** via logrotate

---

## Directory Structure

```
├── controller/           # Node.js controller process
│   ├── package.json
│   └── src/
│       ├── index.js          # Main entry point, orchestration
│       ├── config.js         # Config loading + env overrides
│       ├── logger.js         # Winston logger with daily rotation
│       ├── stateMachine.js   # FALLBACK / PROBING_STREAM / STREAM
│       ├── wsClient.js       # WebSocket client to central server
│       ├── rendererServer.js # WebSocket server for renderer
│       └── passivePoller.js  # HTTP endpoint poller
├── renderer/             # Express + browser renderer
│   ├── package.json
│   ├── server.js             # Express static server
│   └── public/
│       ├── index.html
│       ├── style.css
│       └── app.js            # Fullscreen kiosk app + WS client
├── config/
│   └── default.json          # Default configuration
├── systemd/
│   ├── signage-controller.service
│   └── signage-kiosk.service
├── scripts/
│   ├── install.sh            # Full installation script
│   └── start-kiosk.sh        # Manual kiosk launch script
└── README.md
```

---

## Configuration

Configuration is loaded in priority order (highest wins):
1. Environment variables
2. `/etc/signage/config.json` (system config)
3. `config/default.json` (bundled defaults)

### Configuration Reference

| Field | Default | Env Variable | Description |
|---|---|---|---|
| `deviceId` | *(auto)* | `SIGNAGE_DEVICE_ID` | Unique device identifier. Auto-generated UUID persisted to `/var/lib/signage/device-id`, or falls back to hostname. |
| `wsUrl` | `ws://localhost:9000` | `SIGNAGE_WS_URL` | WebSocket URL of the central signage server. |
| `fallbackImagePath` | `/opt/signage/default.jpg` | `SIGNAGE_FALLBACK_IMAGE` | Absolute path to the fallback image displayed when no stream is active. |
| `passiveEndpoint` | `null` | `SIGNAGE_PASSIVE_ENDPOINT` | Optional HTTP endpoint to poll for stream availability. JSON response with `{url}` field, or a direct stream URL for non-JSON responses. |
| `passivePollIntervalMs` | `20000` | `SIGNAGE_PASSIVE_POLL_MS` | Interval between passive polls in milliseconds. |
| `probeTimeoutMs` | `8000` | `SIGNAGE_PROBE_TIMEOUT_MS` | How long to wait for a stream probe to succeed before declaring failure. |
| `freezeTimeoutMs` | `6000` | `SIGNAGE_FREEZE_TIMEOUT_MS` | Duration of frozen `currentTime` before reporting `PLAYBACK_FROZEN`. |
| `maxStreamRetries` | `3` | `SIGNAGE_MAX_STREAM_RETRIES` | Number of probe/playback retries before falling back to the fallback image. |
| `rendererPort` | `8080` | `SIGNAGE_RENDERER_PORT` | TCP port for the renderer HTTP server (Express). |
| `controllerWsPort` | `8081` | `SIGNAGE_CONTROLLER_WS_PORT` | TCP port for the controller's local WebSocket server (renderer connects here). |
| `logDir` | `/var/log/signage` | `SIGNAGE_LOG_DIR` | Directory for log files. |
| `logLevel` | `info` | `SIGNAGE_LOG_LEVEL` | Winston log level: `error`, `warn`, `info`, `debug`. |
| `cacheFile` | `/var/lib/signage/last-stream.json` | `SIGNAGE_CACHE_FILE` | Path to persist the last successfully played stream URL. |
| `wsReconnectBaseMs` | `1000` | `SIGNAGE_WS_RECONNECT_BASE_MS` | Base delay (ms) for exponential backoff reconnection to central server. |
| `wsReconnectMaxMs` | `30000` | `SIGNAGE_WS_RECONNECT_MAX_MS` | Maximum reconnection delay (ms). |

### System Config Example (`/etc/signage/config.json`)

```json
{
  "wsUrl": "ws://signage-server.example.com:9000",
  "fallbackImagePath": "/opt/signage/default.jpg",
  "passiveEndpoint": "http://signage-server.example.com/api/stream",
  "logLevel": "info"
}
```

---

## Central Server WebSocket Protocol

The controller connects to the central server and exchanges JSON messages.

### Controller → Server

| Message | Fields | Description |
|---|---|---|
| `IDENTIFY` | `deviceId`, `capabilities`, `version` | Sent on connect to register this device. |
| `PONG` | `deviceId` | Response to server `PING`. |

### Server → Controller

| Message | Fields | Description |
|---|---|---|
| `SET_STREAM_URL` | `url` | Play the given HLS stream URL. Triggers probe → play flow. |
| `CLEAR_STREAM` | — | Stop stream and show fallback image. |
| `SET_FALLBACK_IMAGE` | `path` | Update the fallback image path. Applied immediately if currently in FALLBACK state. |
| `PING` | — | Server-initiated keepalive ping. |

---

## Installation

### Prerequisites

- Raspberry Pi running Raspberry Pi OS (64-bit recommended)
- Node.js 18+ (`curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs`)
- Chromium browser (`sudo apt-get install -y chromium-browser`)
- `rsync` (`sudo apt-get install -y rsync`)
- A display connected and X11/Wayland running (for `graphical.target`)

### Step-by-Step Installation

1. **Clone the repository** to a working directory:
   ```bash
   git clone <repo-url> /home/pi/signage-repo
   cd /home/pi/signage-repo
   ```

2. **Run the installation script** as root:
   ```bash
   sudo bash scripts/install.sh
   ```

   This will:
   - Create `/opt/signage/`, `/etc/signage/`, `/var/log/signage/`, `/var/lib/signage/`
   - Copy application files to `/opt/signage/`
   - Run `npm install --omit=dev` for both controller and renderer
   - Install a default config at `/etc/signage/config.json` (if not present)
   - Create a placeholder fallback image at `/opt/signage/default.jpg`
   - Configure logrotate at `/etc/logrotate.d/signage`
   - Install and enable systemd services
   - Start the controller service

3. **Edit system config** with your server details:
   ```bash
   sudo nano /etc/signage/config.json
   ```

4. **Place your fallback image**:
   ```bash
   sudo cp /path/to/your/fallback.jpg /opt/signage/default.jpg
   ```

5. **Start the kiosk browser service**:
   ```bash
   sudo systemctl start signage-kiosk.service
   ```

---

## systemd Service Management

### Controller Service (`signage-controller.service`)

```bash
# Status
sudo systemctl status signage-controller

# Start / Stop / Restart
sudo systemctl start signage-controller
sudo systemctl stop signage-controller
sudo systemctl restart signage-controller

# Follow logs
sudo journalctl -u signage-controller -f

# Enable/disable on boot
sudo systemctl enable signage-controller
sudo systemctl disable signage-controller
```

### Kiosk Browser Service (`signage-kiosk.service`)

```bash
# Status
sudo systemctl status signage-kiosk

# Start / Stop / Restart
sudo systemctl start signage-kiosk
sudo systemctl stop signage-kiosk
sudo systemctl restart signage-kiosk

# Follow logs
sudo journalctl -u signage-kiosk -f
```

### Manual Kiosk Launch (for testing)

```bash
# Start renderer server manually
cd /opt/signage/renderer && node server.js &

# Start controller manually
cd /opt/signage/controller && node src/index.js &

# Launch browser manually
bash /opt/signage/scripts/start-kiosk.sh
```

---

## Log Locations

| Log | Location | Notes |
|---|---|---|
| Controller stdout | `/var/log/signage/controller-stdout.log` | Via systemd `StandardOutput` |
| Controller stderr | `/var/log/signage/controller-stderr.log` | Via systemd `StandardError` |
| Rotating log files | `/var/log/signage/client-YYYY-MM-DD.log` | Daily rotation, 5 days retained, 10 MB max |
| systemd journal | `journalctl -u signage-controller` | Also available via journald |

---

## Troubleshooting

### Controller won't connect to central server
- Check `wsUrl` in `/etc/signage/config.json`
- Check firewall: `sudo ufw status`
- Watch logs: `sudo journalctl -u signage-controller -f`
- The controller will retry with exponential backoff — this is expected on startup

### Browser shows blank screen
- Verify renderer is running: `curl http://127.0.0.1:8080`
- Check renderer port isn't blocked: `ss -tlnp | grep 8080`
- Check controller WS port: `ss -tlnp | grep 8081`

### Stream not playing
- Check the stream URL is reachable from the Pi: `curl -I <stream-url>`
- Increase `logLevel` to `debug` in `/etc/signage/config.json` and restart
- Check for HLS.js errors in Chromium DevTools (launch without `--kiosk` temporarily)

### Fallback image not showing
- Ensure `fallbackImagePath` points to an existing, readable file
- Check: `ls -la /opt/signage/default.jpg`

### Services not starting on boot
- Verify services are enabled: `sudo systemctl is-enabled signage-controller signage-kiosk`
- Check `graphical.target` is reached: `sudo systemctl status graphical.target`

---

## Acceptance Checklist

- [ ] Controller starts and logs device ID on first run
- [ ] Controller connects to central WebSocket server and sends `IDENTIFY`
- [ ] Controller reconnects automatically after central server disconnect
- [ ] Renderer HTTP server serves `index.html` on port 8080
- [ ] Browser app connects to controller WebSocket on port 8081
- [ ] `SHOW_FALLBACK` command displays fallback image
- [ ] `PROBE_STREAM` → `PROBE_OK` → `PLAY_STREAM` flow works end-to-end
- [ ] `PROBE_STREAM` → `PROBE_FAIL` triggers retry with backoff
- [ ] Exceeding `maxStreamRetries` falls back to fallback image
- [ ] Frozen playback is detected and `PLAYBACK_FROZEN` is sent
- [ ] `CLEAR_STREAM` command returns to fallback state
- [ ] `SET_FALLBACK_IMAGE` updates the displayed image
- [ ] Last working stream URL is cached and probed on restart
- [ ] Passive poller (if configured) probes HTTP endpoint and triggers stream
- [ ] Both systemd services start on boot and restart on crash
- [ ] Logs are written to `/var/log/signage/` and rotated daily

