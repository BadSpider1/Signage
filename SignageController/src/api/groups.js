'use strict';

const express = require('express');
const router = express.Router();
const groupService = require('../services/groupService');
const assignmentService = require('../services/assignmentService');
const contentService = require('../services/contentService');
const gateway = require('../gateway/deviceGateway');
const deviceService = require('../services/deviceService');

function pushContentToGroup(groupId) {
  const resolver = require('../resolvers/assignmentResolver');
  const devices = groupService.getGroupDevices(groupId);
  for (const device of devices) {
    const resolved = resolver.resolveForDevice(device.id);
    const commands = gateway.buildCommand(resolved);
    for (const cmd of commands) {
      gateway.sendToDevice(device.id, cmd);
    }
    if (resolved) {
      const state = resolved.content.type === 'stream' ? 'stream' : 'fallback';
      deviceService.setDeviceState(device.id, state, resolved.content.id);
    } else {
      deviceService.setDeviceState(device.id, 'fallback', null);
    }
  }
}

// GET /api/groups
router.get('/', (req, res) => {
  res.json(groupService.getAllGroups());
});

// GET /api/groups/:id
router.get('/:id', (req, res) => {
  const group = groupService.getGroup(req.params.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  res.json(group);
});

// POST /api/groups
router.post('/', (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  res.status(201).json(groupService.createGroup(name, description));
});

// PATCH /api/groups/:id
router.patch('/:id', (req, res) => {
  const group = groupService.getGroup(req.params.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  res.json(groupService.updateGroup(req.params.id, req.body.name, req.body.description));
});

// DELETE /api/groups/:id
router.delete('/:id', (req, res) => {
  const group = groupService.getGroup(req.params.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  groupService.deleteGroup(req.params.id);
  res.json({ ok: true });
});

// POST /api/groups/:id/stream
router.post('/:id/stream', (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });

  // Create or reuse a stream content entry for direct overrides
  const contentId = req.body.contentId;
  if (contentId) {
    const content = contentService.getContent(contentId);
    if (!content) return res.status(404).json({ error: 'Content not found' });
    assignmentService.setAssignment('group', req.params.id, contentId);
  } else {
    // Create a transient content record
    const content = contentService.createContent(`Group stream (${req.params.id})`, 'stream', url, null, {});
    assignmentService.setAssignment('group', req.params.id, content.id);
  }

  pushContentToGroup(req.params.id);
  res.json({ ok: true });
});

// POST /api/groups/:id/fallback
router.post('/:id/fallback', (req, res) => {
  const { contentId } = req.body;
  if (!contentId) return res.status(400).json({ error: 'contentId is required' });
  const content = contentService.getContent(contentId);
  if (!content) return res.status(404).json({ error: 'Content not found' });
  assignmentService.setAssignment('group', req.params.id, contentId);
  pushContentToGroup(req.params.id);
  res.json({ ok: true });
});

// POST /api/groups/:id/clear-stream
router.post('/:id/clear-stream', (req, res) => {
  assignmentService.clearAssignment('group', req.params.id);
  const devices = groupService.getGroupDevices(req.params.id);
  for (const device of devices) {
    gateway.sendToDevice(device.id, { type: 'CLEAR_STREAM' });
    deviceService.setDeviceState(device.id, 'fallback', null);
  }
  res.json({ ok: true });
});

module.exports = router;
