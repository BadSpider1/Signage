'use strict';

const db = require('../db');
const { v4: uuidv4 } = require('uuid');

const VALID_TYPES = new Set(['stream', 'image', 'video']);

function getAllContent() {
  return db.prepare(`SELECT * FROM content ORDER BY name`).all();
}

function getContent(id) {
  return db.prepare(`SELECT * FROM content WHERE id = ?`).get(id) || null;
}

function createContent(name, type, url, filePath, metadata, processingStatus) {
  if (!VALID_TYPES.has(type)) throw new Error(`Invalid content type: ${type}`);
  const id = uuidv4();
  const now = Date.now();
  const status = processingStatus || 'ready';
  db.prepare(`INSERT INTO content (id, name, type, url, file_path, metadata, processing_status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, name, type, url || null, filePath || null, JSON.stringify(metadata || {}), status, now);
  return getContent(id);
}

function updateContent(id, name, url, metadata) {
  const fields = [];
  const values = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (url !== undefined) { fields.push('url = ?'); values.push(url); }
  if (metadata !== undefined) { fields.push('metadata = ?'); values.push(JSON.stringify(metadata)); }
  if (fields.length === 0) return getContent(id);
  values.push(id);
  db.prepare(`UPDATE content SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getContent(id);
}

function setProcessingStatus(id, status, url) {
  const fields = ['processing_status = ?'];
  const values = [status];
  if (url !== undefined) {
    fields.push('url = ?');
    values.push(url);
  }
  values.push(id);
  db.prepare(`UPDATE content SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getContent(id);
}

function deleteContent(id) {
  db.prepare(`DELETE FROM content WHERE id = ?`).run(id);
}

module.exports = {
  getAllContent,
  getContent,
  createContent,
  updateContent,
  setProcessingStatus,
  deleteContent,
  VALID_TYPES,
};
