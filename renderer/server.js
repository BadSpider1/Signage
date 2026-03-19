'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');

const PORT = process.env.SIGNAGE_RENDERER_PORT
  ? parseInt(process.env.SIGNAGE_RENDERER_PORT, 10)
  : 8080;

const app = express();

// Rate limit: this server is localhost-only, but guard against runaway requests
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.use(express.static(path.join(__dirname, 'public')));

// Fallback to index.html for SPA
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`Signage renderer server listening on http://127.0.0.1:${PORT}`);
});

server.on('error', (err) => {
  console.error('Renderer server error:', err.message);
  process.exit(1);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
