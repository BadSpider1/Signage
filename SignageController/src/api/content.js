'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const contentService = require('../services/contentService');
const config = require('../config');

const storage = multer.diskStorage({
  destination: config.uploadDir,
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

// GET /api/content
router.get('/', (req, res) => {
  res.json(contentService.getAllContent());
});

// GET /api/content/:id
router.get('/:id', (req, res) => {
  const content = contentService.getContent(req.params.id);
  if (!content) return res.status(404).json({ error: 'Content not found' });
  res.json(content);
});

// POST /api/content - create from JSON body
router.post('/', (req, res) => {
  const { name, type, url, metadata } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!type || !['stream', 'image'].includes(type)) {
    return res.status(400).json({ error: 'type must be stream or image' });
  }
  if (type === 'stream' && !url) return res.status(400).json({ error: 'url is required for stream' });
  const content = contentService.createContent(name, type, url || null, null, metadata || {});
  res.status(201).json(content);
});

// POST /api/content/upload - upload image file
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const name = req.body.name || req.file.originalname;
  const filePath = `/uploads/${path.basename(req.file.path)}`;
  const content = contentService.createContent(name, 'image', null, filePath, {});
  res.status(201).json(content);
});

// PATCH /api/content/:id
router.patch('/:id', (req, res) => {
  const content = contentService.getContent(req.params.id);
  if (!content) return res.status(404).json({ error: 'Content not found' });
  const { name, url, metadata } = req.body;
  res.json(contentService.updateContent(req.params.id, name, url, metadata));
});

// DELETE /api/content/:id
router.delete('/:id', (req, res) => {
  const content = contentService.getContent(req.params.id);
  if (!content) return res.status(404).json({ error: 'Content not found' });
  contentService.deleteContent(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
