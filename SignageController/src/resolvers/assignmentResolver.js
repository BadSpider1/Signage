'use strict';

const db = require('../db');
const assignmentService = require('../services/assignmentService');
const contentService = require('../services/contentService');

/**
 * Resolve effective content for a single device.
 * Priority: device > group (first match) > global
 * Returns { content, source } or null.
 */
function resolveForDevice(deviceId) {
  // 1. Device-specific assignment
  const deviceAssignment = assignmentService.getAssignment('device', deviceId);
  if (deviceAssignment) {
    const content = contentService.getContent(deviceAssignment.content_id);
    if (content) return { content, source: 'device' };
  }

  // 2. Group assignments - first group that has one
  const groups = db.prepare(`
    SELECT g.id FROM groups g
    JOIN device_groups dg ON dg.group_id = g.id
    WHERE dg.device_id = ?
    ORDER BY g.created_at
  `).all(deviceId);

  for (const group of groups) {
    const groupAssignment = assignmentService.getAssignment('group', group.id);
    if (groupAssignment) {
      const content = contentService.getContent(groupAssignment.content_id);
      if (content) return { content, source: 'group', groupId: group.id };
    }
  }

  // 3. Global assignment
  const globalAssignment = assignmentService.getGlobalAssignment();
  if (globalAssignment) {
    const content = contentService.getContent(globalAssignment.content_id);
    if (content) return { content, source: 'global' };
  }

  return null;
}

/**
 * Resolve effective content for all devices.
 * Returns a Map of deviceId -> { content, source } | null
 */
function resolveForAllDevices() {
  const devices = db.prepare(`SELECT id FROM devices`).all();
  const result = new Map();
  for (const { id } of devices) {
    result.set(id, resolveForDevice(id));
  }
  return result;
}

module.exports = { resolveForDevice, resolveForAllDevices };
