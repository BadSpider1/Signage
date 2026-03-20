'use strict';

const WebSocket = require('ws');
const config = require('../config');
const deviceService = require('../services/deviceService');
const resolver = require('../resolvers/assignmentResolver');

// Map of deviceId -> WebSocket instance
const connectedDevices = new Map();

// Map of deviceId -> setTimeout handle for delayed offline marking.
// Used to implement a grace period that absorbs fast reconnects.
const offlineTimers = new Map();

let wss;
let pingTimer = null;

/**
 * Build the list of WS commands to push to a device given its resolved content.
 * For image type, the path sent to the device is a full HTTP URL so the Pi client
 * can fetch it directly from the controller.
 */
function buildCommand(resolved) {
  if (!resolved) {
    return [{ type: 'CLEAR_STREAM' }];
  }
  const { content } = resolved;
  if (content.type === 'stream' || content.type === 'video') {
    // For video, the url points to the hosted HLS or MP4 file.
    return [{ type: 'SET_STREAM_URL', url: content.url }];
  }
  if (content.type === 'image') {
    // Build an absolute URL the Pi client can fetch over HTTP.
    let mediaUrl = content.url;
    if (!mediaUrl && content.file_path) {
      // file_path is a root-relative path like /uploads/filename
      mediaUrl = `${config.baseUrl}${content.file_path}`;
    }
    return [
      { type: 'SET_FALLBACK_IMAGE', path: mediaUrl },
      { type: 'CLEAR_STREAM' },
    ];
  }
  return [{ type: 'CLEAR_STREAM' }];
}

function sendToDevice(deviceId, msg) {
  const ws = connectedDevices.get(deviceId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
    return true;
  }
  return false;
}

function sendToGroup(groupId, msg) {
  const { getGroupDevices } = require('../services/groupService');
  const devices = getGroupDevices(groupId);
  let sent = 0;
  for (const d of devices) {
    if (sendToDevice(d.id, msg)) sent++;
  }
  return sent;
}

function sendToAll(msg) {
  let sent = 0;
  for (const [deviceId, ws] of connectedDevices.entries()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      sent++;
    }
  }
  return sent;
}

function getConnectedDevices() {
  return Array.from(connectedDevices.keys());
}

/**
 * Cancel any pending offline timer for a device (e.g., when it reconnects
 * within the grace period before we've actually marked it offline).
 */
function cancelOfflineTimer(deviceId) {
  const timer = offlineTimers.get(deviceId);
  if (timer) {
    clearTimeout(timer);
    offlineTimers.delete(deviceId);
  }
}

function handleIdentify(ws, msg) {
  const { deviceId, capabilities, version, token } = msg;

  if (!deviceId) {
    ws.send(JSON.stringify({ type: 'ERROR', message: 'Missing deviceId' }));
    ws.close();
    return;
  }

  // PSK validation
  if (config.devicePsk && token !== config.devicePsk) {
    ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid PSK' }));
    ws.close();
    return;
  }

  // Cancel any pending offline timer — the device reconnected in time.
  cancelOfflineTimer(deviceId);

  // Auto-register / update device
  const name = msg.name || deviceId;
  deviceService.createOrUpdateDevice(deviceId, name);
  deviceService.setDeviceOnline(deviceId, true, 'stream');

  // Track socket
  connectedDevices.set(deviceId, ws);
  ws._deviceId = deviceId;

  console.log(`[Gateway] Device connected: ${deviceId}`);

  // Replay effective content
  const resolved = resolver.resolveForDevice(deviceId);
  const commands = buildCommand(resolved);
  for (const cmd of commands) {
    ws.send(JSON.stringify(cmd));
  }

  // Update device state
  if (resolved) {
    const state = (resolved.content.type === 'stream' || resolved.content.type === 'video')
      ? 'stream'
      : 'fallback';
    deviceService.setDeviceState(deviceId, state, resolved.content.id);
  } else {
    deviceService.setDeviceState(deviceId, 'fallback', null);
  }
}

function handleMessage(ws, data) {
  let msg;
  try {
    msg = JSON.parse(data.toString());
  } catch {
    return;
  }

  switch (msg.type) {
    case 'IDENTIFY':
      handleIdentify(ws, msg);
      break;

    case 'PONG':
      if (msg.deviceId) {
        deviceService.updateHeartbeat(msg.deviceId);
      } else {
        updateHeartbeatForSocket(ws);
      }
      break;

    default:
      break;
  }
}

function updateHeartbeatForSocket(ws) {
  if (ws._deviceId) {
    deviceService.updateHeartbeat(ws._deviceId);
  }
}

/**
 * Start periodic server-initiated PING messages to all connected devices.
 * Devices respond with a PONG message that updates their heartbeat timestamp.
 * This is in addition to the WS protocol-level ping/pong already handled by the ws library.
 */
function startPingScheduler() {
  if (pingTimer) clearInterval(pingTimer);
  if (!config.pingIntervalMs || config.pingIntervalMs <= 0) return;

  pingTimer = setInterval(() => {
    for (const [deviceId, ws] of connectedDevices.entries()) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'PING' }));
          // Also send a WS-level ping frame as a belt-and-suspenders heartbeat
          ws.ping();
        } catch (err) {
          console.error(`[Gateway] Error pinging device ${deviceId}:`, err.message);
        }
      }
    }
  }, config.pingIntervalMs);
}

function init(server) {
  wss = new WebSocket.Server({ server });

  wss.on('connection', (ws, req) => {
    console.log(`[Gateway] New WS connection from ${req.socket.remoteAddress}`);

    ws.on('pong', () => {
      // WS protocol-level pong — update heartbeat
      updateHeartbeatForSocket(ws);
    });

    ws.on('message', (data) => {
      handleMessage(ws, data);
    });

    ws.on('close', () => {
      if (ws._deviceId) {
        const deviceId = ws._deviceId;
        console.log(`[Gateway] Device disconnected: ${deviceId}`);
        connectedDevices.delete(deviceId);

        // Use a grace period before marking offline to absorb fast reconnects.
        // If the device reconnects within offlineGraceMs, cancelOfflineTimer is called
        // in handleIdentify and the device won't be briefly marked offline.
        const timer = setTimeout(() => {
          offlineTimers.delete(deviceId);
          // Only mark offline if the device hasn't reconnected (not in connectedDevices).
          if (!connectedDevices.has(deviceId)) {
            console.log(`[Gateway] Marking device offline after grace period: ${deviceId}`);
            // Use markOffline() so last_heartbeat is preserved (shows real last-seen time).
            deviceService.markOffline(deviceId);
          }
        }, config.offlineGraceMs);

        offlineTimers.set(deviceId, timer);
      }
    });

    ws.on('error', (err) => {
      console.error(`[Gateway] WS error for device ${ws._deviceId || 'unknown'}:`, err.message);
    });
  });

  startPingScheduler();

  console.log('[Gateway] WebSocket server initialized');
}

module.exports = { init, sendToDevice, sendToGroup, sendToAll, getConnectedDevices, buildCommand };
