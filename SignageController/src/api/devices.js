'use strict';

const express = require('express');
const router = express.Router();
const deviceService = require('../services/deviceService');
const gateway = require('../gateway/deviceGateway');

// GET /api/devices
router.get('/', (req, res) => {
  res.json(deviceService.getAllDevices());
});

// GET /api/devices/:id
router.get('/:id', (req, res) => {
  const device = deviceService.getDevice(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  res.json(device);
});

// PATCH /api/devices/:id - rename
router.patch('/:id', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const device = deviceService.getDevice(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  res.json(deviceService.renameDevice(req.params.id, name));
});

// POST /api/devices/:id/groups - add to group
router.post('/:id/groups', (req, res) => {
  const { groupId } = req.body;
  if (!groupId) return res.status(400).json({ error: 'groupId is required' });
  const device = deviceService.getDevice(req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  deviceService.addDeviceToGroup(req.params.id, groupId);
  res.json(deviceService.getDevice(req.params.id));
});

// DELETE /api/devices/:id/groups/:groupId
router.delete('/:id/groups/:groupId', (req, res) => {
  deviceService.removeDeviceFromGroup(req.params.id, req.params.groupId);
  res.json({ ok: true });
});

// POST /api/devices/:id/ping
router.post('/:id/ping', (req, res) => {
  const sent = gateway.sendToDevice(req.params.id, { type: 'PING' });
  res.json({ sent });
});

// POST /api/devices/:id/reload
router.post('/:id/reload', (req, res) => {
  const sent = gateway.sendToDevice(req.params.id, { type: 'RELOAD' });
  res.json({ sent });
});

// POST /api/devices/:id/clear-stream
router.post('/:id/clear-stream', (req, res) => {
  const sent = gateway.sendToDevice(req.params.id, { type: 'CLEAR_STREAM' });
  if (sent) deviceService.setDeviceState(req.params.id, 'fallback', null);
  res.json({ sent });
});

// POST /api/devices/:id/stream - set stream URL override
router.post('/:id/stream', (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });
  const sent = gateway.sendToDevice(req.params.id, { type: 'SET_STREAM_URL', url });
  if (sent) deviceService.setDeviceState(req.params.id, 'stream', null);
  res.json({ sent });
});

// POST /api/devices/:id/fallback - set fallback image
router.post('/:id/fallback', (req, res) => {
  const { path: imgPath } = req.body;
  if (!imgPath) return res.status(400).json({ error: 'path is required' });
  const sent = gateway.sendToDevice(req.params.id, { type: 'SET_FALLBACK_IMAGE', path: imgPath });
  if (sent) deviceService.setDeviceState(req.params.id, 'fallback', null);
  res.json({ sent });
});

module.exports = router;
