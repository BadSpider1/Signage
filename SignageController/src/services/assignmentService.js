'use strict';

const db = require('../db');
const { v4: uuidv4 } = require('uuid');

function getAssignment(targetType, targetId) {
  if (targetType === 'global') {
    return db.prepare(`SELECT * FROM assignments WHERE target_type = 'global'`).get() || null;
  }
  return db.prepare(`SELECT * FROM assignments WHERE target_type = ? AND target_id = ?`)
    .get(targetType, targetId) || null;
}

function setAssignment(targetType, targetId, contentId) {
  const existing = getAssignment(targetType, targetId);
  if (existing) {
    db.prepare(`UPDATE assignments SET content_id = ? WHERE id = ?`).run(contentId, existing.id);
    return { ...existing, content_id: contentId };
  }
  const id = uuidv4();
  const now = Date.now();
  db.prepare(`INSERT INTO assignments (id, target_type, target_id, content_id, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(id, targetType, targetId || null, contentId, now);
  return getAssignment(targetType, targetId);
}

function clearAssignment(targetType, targetId) {
  if (targetType === 'global') {
    db.prepare(`DELETE FROM assignments WHERE target_type = 'global'`).run();
  } else {
    db.prepare(`DELETE FROM assignments WHERE target_type = ? AND target_id = ?`)
      .run(targetType, targetId);
  }
}

function getAllAssignments() {
  return db.prepare(`SELECT * FROM assignments ORDER BY created_at`).all();
}

function getGlobalAssignment() {
  return db.prepare(`SELECT * FROM assignments WHERE target_type = 'global'`).get() || null;
}

module.exports = {
  getAssignment,
  setAssignment,
  clearAssignment,
  getAllAssignments,
  getGlobalAssignment,
};
