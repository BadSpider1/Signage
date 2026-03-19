# Signage Controller

Backend control plane and admin web UI for the digital signage system.

## Setup

```bash
cd SignageController
cp .env.example .env
# Edit .env as needed
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

| Variable | Default | Description |
|---|---|---|
| `PORT` | `9000` | HTTP + WebSocket port |
| `ADMIN_TOKEN` | `changeme` | Bearer token for admin REST API |
| `SIGNAGE_DEVICE_PSK` | `` | Optional PSK devices must include in IDENTIFY |
| `DB_PATH` | `./data/signage.db` | SQLite database path |
| `UPLOAD_DIR` | `./uploads` | Directory for uploaded images |
| `STREAM_MONITOR_ENABLED` | `false` | Enable background HLS stream health checks |
| `STREAM_MONITOR_INTERVAL_MS` | `60000` | Stream check interval in milliseconds |
| `HEARTBEAT_TIMEOUT_MS` | `45000` | Time before device marked offline |

## API Overview

All `/api/*` routes (except `/api/status`) require `Authorization: Bearer <ADMIN_TOKEN>`.

### Health
- `GET /api/status` — public health check

### Devices
- `GET /api/devices` — list all devices with groups
- `GET /api/devices/:id` — get device detail
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
- `GET /api/content` — list all
- `GET /api/content/:id` — get single
- `POST /api/content` — create stream (`{ name, type, url, metadata }`)
- `POST /api/content/upload` — upload image (multipart: `file`, `name`)
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
- **PING/PONG**: responds to WS-level `pong` frames and JSON `{ type: 'PONG' }` messages for heartbeat
- **Commands**: sends `SET_STREAM_URL`, `CLEAR_STREAM`, `SET_FALLBACK_IMAGE`, `PING`, `RELOAD`
- **Reconnect replay**: on connect, pushes the effective content assignment immediately

### Assignment priority (highest → lowest)
1. Device-specific assignment
2. Group assignment (first group with an assignment)
3. Global default

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

# Simulate a Pi device connecting
node -e "
const WS = require('ws');
const ws = new WS('ws://localhost:9000');
ws.on('open', () => ws.send(JSON.stringify({ type: 'IDENTIFY', deviceId: 'test-device-1', capabilities: ['HLS'], version: '1.0.0' })));
ws.on('message', (d) => console.log('Server:', d.toString()));
"
```
