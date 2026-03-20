# Signage Controller

Backend control plane and admin web UI for the digital signage system.

## Setup

```bash
cd SignageController
cp .env.example .env
# Edit .env as needed (see Environment Variables below)
npm install
npm start
```

Access the admin UI at `http://localhost:9000`.

When prompted, enter the `ADMIN_TOKEN` (default: `changeme`). The token is saved in `localStorage`.

## Seed sample data

```bash
npm run seed
```

Inserts 2 devices, 2 groups, 2 content items, and 1 global assignment.

## Environment Variables

`.env` is loaded automatically at startup before any other module. Precedence:
```
existing process.env vars > .env file > defaults built into config.js
```

| Variable | Default | Description |
|---|---|---|
| `PORT` | `9000` | HTTP + WebSocket port |
| `ADMIN_TOKEN` | `changeme` | Bearer token for admin REST API |
| `SIGNAGE_DEVICE_PSK` | `` | Optional PSK devices must include in IDENTIFY |
| `DB_PATH` | `./data/signage.db` | SQLite database path |
| `UPLOAD_DIR` | `./uploads` | Directory for uploaded files (images + videos) |
| `BASE_URL` | `http://localhost:<PORT>` | Public base URL of this server. **Must be set** to the URL reachable by Pi devices so they can download uploaded images. Example: `https://signage.example.com` |
| `STREAM_MONITOR_ENABLED` | `false` | Enable background HLS stream health checks |
| `STREAM_MONITOR_INTERVAL_MS` | `60000` | Stream check interval in milliseconds |
| `HEARTBEAT_TIMEOUT_MS` | `45000` | Time (ms) before a device without heartbeats is marked offline by the sweeper |
| `PING_INTERVAL_MS` | `30000` | How often the server sends PING messages to connected devices. Set to `0` to disable. |
| `OFFLINE_GRACE_MS` | `8000` | Grace period (ms) after a WS close before marking the device offline. Prevents a brief offline flash during fast reconnects. |

## Media Hosting Endpoints

Uploaded files are served at:
```
GET /uploads/<filename>
GET /uploads/hls/<contentId>/index.m3u8   (HLS output when ffmpeg is available)
GET /uploads/hls/<contentId>/seg000.ts    (HLS segments)
```

Files are served with `Cache-Control: public, max-age=300` for device-side caching.

> **Security note**: The `/uploads` path is publicly accessible without authentication (by design, so Pi devices can fetch media without token management). If you need to restrict access, set `SIGNAGE_DEVICE_PSK` and restrict network access at the firewall level.

## Video Upload & HLS Processing

### With ffmpeg installed (recommended)

Install ffmpeg on the controller server:
```bash
# Ubuntu/Debian
sudo apt install ffmpeg

# macOS
brew install ffmpeg
```

When a video is uploaded via the admin UI (Content Library → Upload Video):
1. The video is stored in `UPLOAD_DIR`.
2. A background job converts it to HLS (`.m3u8` + `.ts` segments) using ffmpeg.
3. Processing status is shown in the UI: **Queued → Processing → Ready / Failed**.
4. When ready, devices assigned this content receive `SET_STREAM_URL` pointing to the HLS manifest.

### Without ffmpeg

If ffmpeg is not installed, the raw MP4 is served directly as a stream URL. The Pi client must support MP4 playback (most HLS-capable players also handle MP4 over HTTP). HLS is strongly recommended for best seek performance and compatibility.

## API Overview

All `/api/*` routes (except `/api/status`) require `Authorization: Bearer <ADMIN_TOKEN>`.

### Health
- `GET /api/status` — public health check

### Devices
- `GET /api/devices` — list all devices with groups
- `GET /api/devices/:id` — get device detail (includes `last_heartbeat` timestamp)
- `PATCH /api/devices/:id` — rename (`{ name }`)
- `POST /api/devices/:id/groups` — add to group (`{ groupId }`)
- `DELETE /api/devices/:id/groups/:groupId` — remove from group
- `POST /api/devices/:id/ping` — send PING
- `POST /api/devices/:id/reload` — send RELOAD
- `POST /api/devices/:id/clear-stream` — clear stream
- `POST /api/devices/:id/stream` — set stream URL (`{ url }`)
- `POST /api/devices/:id/fallback` — set fallback image (`{ path }`)

### Groups
- `GET /api/groups` — list groups
- `GET /api/groups/:id` — get group with members
- `POST /api/groups` — create (`{ name, description }`)
- `PATCH /api/groups/:id` — update
- `DELETE /api/groups/:id` — delete
- `POST /api/groups/:id/stream` — set stream for group (`{ url }` or `{ contentId }`)
- `POST /api/groups/:id/fallback` — assign fallback (`{ contentId }`)
- `POST /api/groups/:id/clear-stream` — clear group assignment

### Content
- `GET /api/content` — list all (includes `processing_status` for video content)
- `GET /api/content/:id` — get single
- `POST /api/content` — create stream entry (`{ name, type: 'stream', url, metadata }`)
- `POST /api/content/upload` — upload image (multipart: `file`, `name`)
- `POST /api/content/upload-video` — upload video (multipart: `file`, `name`); returns `202 Accepted` while processing runs in background
- `PATCH /api/content/:id` — update
- `DELETE /api/content/:id` — delete

### Assignments
- `GET /api/assignments` — all assignments
- `GET /api/assignments/global` — global assignment
- `POST /api/assignments/global` — set global (`{ contentId }`)
- `DELETE /api/assignments/global` — clear global
- `GET /api/assignments/device/:deviceId`
- `POST /api/assignments/device/:deviceId` — `{ contentId }`
- `DELETE /api/assignments/device/:deviceId`
- `GET /api/assignments/group/:groupId`
- `POST /api/assignments/group/:groupId` — `{ contentId }`
- `DELETE /api/assignments/group/:groupId`

### Live Control
- `POST /api/control/broadcast` — `{ command, payload }`
- `POST /api/control/group/:groupId` — `{ command, payload }`
- `POST /api/control/device/:deviceId` — `{ command, payload }`

Allowed commands: `SET_STREAM_URL`, `CLEAR_STREAM`, `SET_FALLBACK_IMAGE`, `RELOAD`, `PING`

### Stream Monitor
- `GET /api/stream-monitor` — stream availability status (requires auth)

## Raspberry Pi Client Compatibility

The WebSocket gateway is fully compatible with the existing Pi client (`controller/src/wsClient.js`):

- **Same port**: WS and HTTP share port 9000
- **IDENTIFY**: auto-registers unknown devices; validates PSK if `SIGNAGE_DEVICE_PSK` is set
- **PING/PONG**: server sends periodic `PING` messages (interval: `PING_INTERVAL_MS`); Pi client responds with `PONG`. WS-level `ping`/`pong` frames are also handled.
- **Commands**: sends `SET_STREAM_URL`, `CLEAR_STREAM`, `SET_FALLBACK_IMAGE`, `PING`, `RELOAD`
- **Reconnect replay**: on connect, pushes the effective content assignment immediately
- **Image delivery**: `SET_FALLBACK_IMAGE` sends a full HTTP URL (using `BASE_URL`) so Pi devices can download the image

### Assignment priority (highest → lowest)
1. Device-specific assignment
2. Group assignment (first group with an assignment)
3. Global default

## Heartbeat & Online Detection

- On connection: `setDeviceOnline(true)` and `last_heartbeat` updated.
- On `PING` → `PONG` exchange or WS-level ping/pong: `last_heartbeat` updated.
- On disconnection: a **grace period** (`OFFLINE_GRACE_MS`, default 8s) starts. If the device reconnects within the grace period, it is **not** marked offline (absorbs fast reconnects).
- A background sweeper runs every 15s: any device marked online with `last_heartbeat` older than `HEARTBEAT_TIMEOUT_MS` is marked offline without modifying `last_heartbeat`, so the UI shows the real time the device was last seen.

## Troubleshooting

**Device shows offline even though it's connected**
- Check `HEARTBEAT_TIMEOUT_MS` — default is 45s. Ensure client sends pings/pongs within that window.
- Verify `PING_INTERVAL_MS` — the server sends periodic PINGs to devices. If set too high, heartbeats may gap.
- Check server logs for `[Gateway] Device connected/disconnected` and `[Heartbeat] Marking device offline` messages.

**Images not showing on Pi devices**
- Set `BASE_URL` to the server's externally accessible URL (e.g. `BASE_URL=http://192.168.1.100:9000`).
- Without `BASE_URL`, image paths default to `http://localhost:9000/uploads/...` which won't resolve on remote Pi devices.

**Video processing fails**
- Install ffmpeg: `sudo apt install ffmpeg`
- Check server logs for `[VideoProcessor]` entries.
- If ffmpeg is unavailable, raw MP4 is served — verify the Pi player supports MP4 over HTTP.

**`.env` not being picked up**
- Ensure `.env` exists in `SignageController/` (copy from `.env.example`).
- `dotenv` is loaded as the very first action in `src/index.js` and `src/db/seed.js`, before any config imports.
- Variables already set in the environment take precedence over `.env` values.

## Quick Local Test

```bash
# Terminal 1 — start server
npm start

# Terminal 2 — check health
curl http://localhost:9000/api/status

# Terminal 3 — test API
TOKEN=changeme
curl -H "Authorization: Bearer $TOKEN" http://localhost:9000/api/devices
curl -H "Authorization: Bearer $TOKEN" http://localhost:9000/api/groups

# Simulate a Pi device connecting (run from SignageController dir)
node -e "
const WS = require('ws');
const ws = new WS('ws://localhost:9000');
ws.on('open', () => ws.send(JSON.stringify({ type: 'IDENTIFY', deviceId: 'test-device-1', capabilities: ['HLS'], version: '1.0.0' })));
ws.on('message', (d) => { const m = JSON.parse(d.toString()); console.log('Server:', m); if (m.type === 'PING') ws.send(JSON.stringify({ type: 'PONG', deviceId: 'test-device-1' })); });
"
```
