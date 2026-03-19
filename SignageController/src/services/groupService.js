'use strict';

const db = require('../db');
const { v4: uuidv4 } = require('uuid');

function getAllGroups() {
  const groups = db.prepare(`SELECT * FROM groups ORDER BY name`).all();
  return groups.map((g) => {
    const count = db.prepare(`SELECT COUNT(*) as c FROM device_groups WHERE group_id = ?`).get(g.id);
    return { ...g, deviceCount: count.c };
  });
}

function getGroup(id) {
  const g = db.prepare(`SELECT * FROM groups WHERE id = ?`).get(id);
  if (!g) return null;
  const devices = db.prepare(`
    SELECT d.* FROM devices d
    JOIN device_groups dg ON dg.device_id = d.id
    WHERE dg.group_id = ?
    ORDER BY d.name
  `).all(id);
  return { ...g, devices: devices.map((d) => ({ ...d, online: !!d.online })) };
}

function createGroup(name, description) {
  const id = uuidv4();
  const now = Date.now();
  db.prepare(`INSERT INTO groups (id, name, description, created_at) VALUES (?, ?, ?, ?)`)
    .run(id, name, description || '', now);
  return getGroup(id);
}

function updateGroup(id, name, description) {
  const fields = [];
  const values = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (description !== undefined) { fields.push('description = ?'); values.push(description); }
  if (fields.length === 0) return getGroup(id);
  values.push(id);
  db.prepare(`UPDATE groups SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getGroup(id);
}

function deleteGroup(id) {
  db.prepare(`DELETE FROM groups WHERE id = ?`).run(id);
}

function getGroupDevices(groupId) {
  return db.prepare(`
    SELECT d.* FROM devices d
    JOIN device_groups dg ON dg.device_id = d.id
    WHERE dg.group_id = ?
    ORDER BY d.name
  `).all(groupId).map((d) => ({ ...d, online: !!d.online }));
}

module.exports = {
  getAllGroups,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
  getGroupDevices,
};
