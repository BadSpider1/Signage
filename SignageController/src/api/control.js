'use strict';

const express = require('express');
const router = express.Router();
const gateway = require('../gateway/deviceGateway');
const groupService = require('../services/groupService');

const ALLOWED_COMMANDS = new Set(['SET_STREAM_URL', 'CLEAR_STREAM', 'SET_FALLBACK_IMAGE', 'RELOAD', 'PING']);

function buildMsg(command, payload) {
  return { type: command, ...payload };
}

// POST /api/control/broadcast
router.post('/broadcast', (req, res) => {
  const { command, payload } = req.body;
  if (!command || !ALLOWED_COMMANDS.has(command)) {
    return res.status(400).json({ error: `Invalid command. Allowed: ${[...ALLOWED_COMMANDS].join(', ')}` });
  }
  const sent = gateway.sendToAll(buildMsg(command, payload || {}));
  res.json({ sent });
});

// POST /api/control/group/:groupId
router.post('/group/:groupId', (req, res) => {
  const { command, payload } = req.body;
  if (!command || !ALLOWED_COMMANDS.has(command)) {
    return res.status(400).json({ error: `Invalid command. Allowed: ${[...ALLOWED_COMMANDS].join(', ')}` });
  }
  const group = groupService.getGroup(req.params.groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const sent = gateway.sendToGroup(req.params.groupId, buildMsg(command, payload || {}));
  res.json({ sent });
});

// POST /api/control/device/:deviceId
router.post('/device/:deviceId', (req, res) => {
  const { command, payload } = req.body;
  if (!command || !ALLOWED_COMMANDS.has(command)) {
    return res.status(400).json({ error: `Invalid command. Allowed: ${[...ALLOWED_COMMANDS].join(', ')}` });
  }
  const sent = gateway.sendToDevice(req.params.deviceId, buildMsg(command, payload || {}));
  res.json({ sent });
});

module.exports = router;
