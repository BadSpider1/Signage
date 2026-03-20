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

const ALLOWED_IMAGE_TYPES = /^image\//;
const ALLOWED_VIDEO_TYPES = /^video\//;

const imageUpload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.test(file.mimetype)) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  },
});

const videoUpload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (ALLOWED_VIDEO_TYPES.test(file.mimetype)) return cb(null, true);
    cb(new Error('Only video files are allowed'));
  },
});

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

// POST /api/content - create from JSON body (stream or image with URL)
router.post('/', (req, res) => {
  const { name, type, url, metadata } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!type || !contentService.VALID_TYPES.has(type)) {
    return res.status(400).json({ error: `type must be one of: ${[...contentService.VALID_TYPES].join(', ')}` });
  }
  if (type === 'stream' && !url) return res.status(400).json({ error: 'url is required for stream' });
  try {
    const content = contentService.createContent(name, type, url || null, null, metadata || {});
    res.status(201).json(content);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/content/upload - upload image file
router.post('/upload', imageUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const name = req.body.name || req.file.originalname;
  const filePath = `/uploads/${path.basename(req.file.path)}`;
  const content = contentService.createContent(name, 'image', null, filePath, {});
  res.status(201).json(content);
});

// POST /api/content/upload-video - upload video file for processing
router.post('/upload-video', videoUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const name = req.body.name || req.file.originalname;
  const filePath = `/uploads/${path.basename(req.file.path)}`;

  // Create content record in 'queued' state
  const content = contentService.createContent(name, 'video', null, filePath, {}, 'queued');

  // Start processing asynchronously (non-blocking)
  const { processVideo } = require('../services/videoProcessor');
  processVideo(content.id, req.file.path, req.file.originalname).catch((err) => {
    console.error('[Content] Video processing error:', err.message);
  });

  res.status(202).json(content);
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

// Multer error handler
router.use((err, req, res, next) => {
  if (err && err.message) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
