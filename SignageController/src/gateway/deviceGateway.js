'use strict';

const WebSocket = require('ws');
const config = require('../config');
const deviceService = require('../services/deviceService');
const resolver = require('../resolvers/assignmentResolver');

// Map of deviceId -> WebSocket instance
const connectedDevices = new Map();

let wss;

function buildCommand(resolved) {
  if (!resolved) {
    return [{ type: 'CLEAR_STREAM' }];
  }
  const { content } = resolved;
  if (content.type === 'stream') {
    return [{ type: 'SET_STREAM_URL', url: content.url }];
  }
  if (content.type === 'image') {
    return [
      { type: 'SET_FALLBACK_IMAGE', path: content.file_path || content.url },
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
    const state = resolved.content.type === 'stream' ? 'stream' : 'fallback';
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
      } else if (ws._deviceId) {
        deviceService.updateHeartbeat(ws._deviceId);
      }
      break;

    default:
      break;
  }
}

function init(server) {
  wss = new WebSocket.Server({ server });

  wss.on('connection', (ws, req) => {
    console.log(`[Gateway] New WS connection from ${req.socket.remoteAddress}`);

    ws.on('pong', () => {
      if (ws._deviceId) {
        deviceService.updateHeartbeat(ws._deviceId);
      }
    });

    ws.on('message', (data) => {
      handleMessage(ws, data);
    });

    ws.on('close', () => {
      if (ws._deviceId) {
        console.log(`[Gateway] Device disconnected: ${ws._deviceId}`);
        connectedDevices.delete(ws._deviceId);
        deviceService.setDeviceOnline(ws._deviceId, false, 'fallback');
      }
    });

    ws.on('error', (err) => {
      console.error(`[Gateway] WS error for device ${ws._deviceId || 'unknown'}:`, err.message);
    });
  });

  console.log('[Gateway] WebSocket server initialized');
}

module.exports = { init, sendToDevice, sendToGroup, sendToAll, getConnectedDevices, buildCommand };
