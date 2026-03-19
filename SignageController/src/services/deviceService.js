'use strict';

const db = require('../db');
const { v4: uuidv4 } = require('uuid');

function getAllDevices() {
  const devices = db.prepare(`SELECT * FROM devices ORDER BY name`).all();
  return devices.map((d) => {
    const groups = db.prepare(`
      SELECT g.id, g.name FROM groups g
      JOIN device_groups dg ON dg.group_id = g.id
      WHERE dg.device_id = ?
    `).all(d.id);
    return { ...d, online: !!d.online, groups };
  });
}

function getDevice(id) {
  const d = db.prepare(`SELECT * FROM devices WHERE id = ?`).get(id);
  if (!d) return null;
  const groups = db.prepare(`
    SELECT g.id, g.name FROM groups g
    JOIN device_groups dg ON dg.group_id = g.id
    WHERE dg.device_id = ?
  `).all(d.id);
  return { ...d, online: !!d.online, groups };
}

function createOrUpdateDevice(id, name) {
  const now = Date.now();
  const existing = db.prepare(`SELECT id FROM devices WHERE id = ?`).get(id);
  if (existing) {
    db.prepare(`UPDATE devices SET name = ? WHERE id = ?`).run(name, id);
  } else {
    db.prepare(`INSERT INTO devices (id, name, online, current_state, created_at) VALUES (?, ?, 0, 'fallback', ?)`)
      .run(id, name, now);
  }
  return getDevice(id);
}

function setDeviceOnline(id, online, state) {
  db.prepare(`UPDATE devices SET online = ?, current_state = ?, last_heartbeat = ? WHERE id = ?`)
    .run(online ? 1 : 0, state || 'fallback', Date.now(), id);
}

function updateHeartbeat(id) {
  db.prepare(`UPDATE devices SET last_heartbeat = ? WHERE id = ?`).run(Date.now(), id);
}

function renameDevice(id, name) {
  db.prepare(`UPDATE devices SET name = ? WHERE id = ?`).run(name, id);
  return getDevice(id);
}

function addDeviceToGroup(deviceId, groupId) {
  db.prepare(`INSERT OR IGNORE INTO device_groups (device_id, group_id) VALUES (?, ?)`)
    .run(deviceId, groupId);
}

function removeDeviceFromGroup(deviceId, groupId) {
  db.prepare(`DELETE FROM device_groups WHERE device_id = ? AND group_id = ?`)
    .run(deviceId, groupId);
}

function setDeviceState(id, state, contentId) {
  db.prepare(`UPDATE devices SET current_state = ?, current_content_id = ? WHERE id = ?`)
    .run(state, contentId || null, id);
}

module.exports = {
  getAllDevices,
  getDevice,
  createOrUpdateDevice,
  setDeviceOnline,
  updateHeartbeat,
  renameDevice,
  addDeviceToGroup,
  removeDeviceFromGroup,
  setDeviceState,
};
