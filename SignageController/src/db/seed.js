'use strict';

// Seed script - run with: node src/db/seed.js
// Sets up sample data for development

const db = require('./index');
const { v4: uuidv4 } = require('uuid');

const now = Date.now();

// Devices
const device1Id = 'device-lobby-001';
const device2Id = 'device-hallway-002';

db.prepare(`INSERT OR IGNORE INTO devices (id, name, online, current_state, created_at)
  VALUES (?, ?, 0, 'fallback', ?)`).run(device1Id, 'Lobby Display', now);

db.prepare(`INSERT OR IGNORE INTO devices (id, name, online, current_state, created_at)
  VALUES (?, ?, 0, 'fallback', ?)`).run(device2Id, 'Hallway Display', now);

// Groups
const group1Id = uuidv4();
const group2Id = uuidv4();

db.prepare(`INSERT OR IGNORE INTO groups (id, name, description, created_at)
  VALUES (?, ?, ?, ?)`).run(group1Id, 'Main Floor', 'Displays on the main floor', now);

db.prepare(`INSERT OR IGNORE INTO groups (id, name, description, created_at)
  VALUES (?, ?, ?, ?)`).run(group2Id, 'Reception', 'Reception area displays', now);

// Add devices to groups
db.prepare(`INSERT OR IGNORE INTO device_groups (device_id, group_id) VALUES (?, ?)`)
  .run(device1Id, group1Id);
db.prepare(`INSERT OR IGNORE INTO device_groups (device_id, group_id) VALUES (?, ?)`)
  .run(device2Id, group1Id);
db.prepare(`INSERT OR IGNORE INTO device_groups (device_id, group_id) VALUES (?, ?)`)
  .run(device1Id, group2Id);

// Content
const content1Id = uuidv4();
const content2Id = uuidv4();

db.prepare(`INSERT OR IGNORE INTO content (id, name, type, url, file_path, metadata, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
  content1Id,
  'Welcome Stream',
  'stream',
  'https://stream.example.com/welcome.m3u8',
  null,
  JSON.stringify({ description: 'Main welcome stream' }),
  now
);

db.prepare(`INSERT OR IGNORE INTO content (id, name, type, url, file_path, metadata, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
  content2Id,
  'Fallback Logo',
  'image',
  null,
  '/uploads/logo.png',
  JSON.stringify({ description: 'Company logo fallback' }),
  now
);

// Assignment
const assignmentId = uuidv4();
db.prepare(`INSERT OR IGNORE INTO assignments (id, target_type, target_id, content_id, created_at)
  VALUES (?, ?, ?, ?, ?)`).run(assignmentId, 'global', null, content1Id, now);

console.log('Seed complete.');
console.log('  Devices:', device1Id, device2Id);
console.log('  Groups:', group1Id, group2Id);
console.log('  Content:', content1Id, content2Id);
console.log('  Global assignment -> content:', content1Id);
