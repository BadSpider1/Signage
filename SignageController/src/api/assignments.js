'use strict';

const express = require('express');
const router = express.Router();
const assignmentService = require('../services/assignmentService');
const contentService = require('../services/contentService');
const deviceService = require('../services/deviceService');
const groupService = require('../services/groupService');
const gateway = require('../gateway/deviceGateway');
const resolver = require('../resolvers/assignmentResolver');

function pushToAffectedDevices(deviceIds) {
  for (const deviceId of deviceIds) {
    const resolved = resolver.resolveForDevice(deviceId);
    const commands = gateway.buildCommand(resolved);
    for (const cmd of commands) {
      gateway.sendToDevice(deviceId, cmd);
    }
    if (resolved) {
      const state = resolved.content.type === 'stream' ? 'stream' : 'fallback';
      deviceService.setDeviceState(deviceId, state, resolved.content.id);
    } else {
      deviceService.setDeviceState(deviceId, 'fallback', null);
    }
  }
}

function allDeviceIds() {
  return deviceService.getAllDevices().map((d) => d.id);
}

// GET /api/assignments - list all with resolved content
router.get('/', (req, res) => {
  const assignments = assignmentService.getAllAssignments();
  const enriched = assignments.map((a) => ({
    ...a,
    content: contentService.getContent(a.content_id),
  }));
  res.json(enriched);
});

// --- Global ---
router.get('/global', (req, res) => {
  const a = assignmentService.getGlobalAssignment();
  if (!a) return res.json(null);
  res.json({ ...a, content: contentService.getContent(a.content_id) });
});

router.post('/global', (req, res) => {
  const { contentId } = req.body;
  if (!contentId) return res.status(400).json({ error: 'contentId is required' });
  if (!contentService.getContent(contentId)) return res.status(404).json({ error: 'Content not found' });
  const a = assignmentService.setAssignment('global', null, contentId);
  pushToAffectedDevices(allDeviceIds());
  res.json({ ...a, content: contentService.getContent(contentId) });
});

router.delete('/global', (req, res) => {
  assignmentService.clearAssignment('global', null);
  pushToAffectedDevices(allDeviceIds());
  res.json({ ok: true });
});

// --- Device ---
router.get('/device/:deviceId', (req, res) => {
  const a = assignmentService.getAssignment('device', req.params.deviceId);
  if (!a) return res.json(null);
  res.json({ ...a, content: contentService.getContent(a.content_id) });
});

router.post('/device/:deviceId', (req, res) => {
  const { contentId } = req.body;
  if (!contentId) return res.status(400).json({ error: 'contentId is required' });
  if (!contentService.getContent(contentId)) return res.status(404).json({ error: 'Content not found' });
  const a = assignmentService.setAssignment('device', req.params.deviceId, contentId);
  pushToAffectedDevices([req.params.deviceId]);
  res.json({ ...a, content: contentService.getContent(contentId) });
});

router.delete('/device/:deviceId', (req, res) => {
  assignmentService.clearAssignment('device', req.params.deviceId);
  pushToAffectedDevices([req.params.deviceId]);
  res.json({ ok: true });
});

// --- Group ---
router.get('/group/:groupId', (req, res) => {
  const a = assignmentService.getAssignment('group', req.params.groupId);
  if (!a) return res.json(null);
  res.json({ ...a, content: contentService.getContent(a.content_id) });
});

router.post('/group/:groupId', (req, res) => {
  const { contentId } = req.body;
  if (!contentId) return res.status(400).json({ error: 'contentId is required' });
  if (!contentService.getContent(contentId)) return res.status(404).json({ error: 'Content not found' });
  const a = assignmentService.setAssignment('group', req.params.groupId, contentId);
  const devices = groupService.getGroupDevices(req.params.groupId);
  pushToAffectedDevices(devices.map((d) => d.id));
  res.json({ ...a, content: contentService.getContent(contentId) });
});

router.delete('/group/:groupId', (req, res) => {
  assignmentService.clearAssignment('group', req.params.groupId);
  const devices = groupService.getGroupDevices(req.params.groupId);
  pushToAffectedDevices(devices.map((d) => d.id));
  res.json({ ok: true });
});

module.exports = router;
