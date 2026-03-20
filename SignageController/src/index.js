'use strict';

// Load .env BEFORE any config/module imports so env vars are available.
// Precedence: existing process.env vars > .env file > defaults in config.js
require('dotenv').config();

const http = require('http');
const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('./config');

// Init DB first
require('./db');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Rate limit for uploaded static files to prevent abuse
const uploadsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

// Serve uploaded files with cache headers
app.use('/uploads', uploadsLimiter, (req, res, next) => {
  // Allow Pi devices to cache media files for up to 5 minutes
  res.set('Cache-Control', 'public, max-age=300');
  next();
}, express.static(path.resolve(config.uploadDir)));

// Serve static admin UI
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api', require('./api/router'));

// SPA fallback — serve index.html for any non-API, non-file route
app.get(/^(?!\/api\/).*$/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const server = http.createServer(app);

// Init WebSocket gateway on the same server
const gateway = require('./gateway/deviceGateway');
gateway.init(server);

// Heartbeat checker — mark devices offline if they haven't pinged within the timeout.
// Only acts on devices currently marked online; the gateway handles the online->offline
// transition for devices that send no heartbeats at all.
const deviceService = require('./services/deviceService');
setInterval(() => {
  const cutoff = Date.now() - config.heartbeatTimeoutMs;
  const devices = deviceService.getAllDevices();
  for (const device of devices) {
    if (device.online && (device.last_heartbeat === null || device.last_heartbeat < cutoff)) {
      console.log(`[Heartbeat] Marking device offline (no heartbeat): ${device.id} (last: ${device.last_heartbeat})`);
      // Use a dedicated query that does NOT update last_heartbeat so the timestamp
      // reflects when the device was actually last seen.
      deviceService.markOffline(device.id);
    }
  }
}, 15000);

// Start stream monitor if enabled
const streamMonitor = require('./services/streamMonitor');
streamMonitor.start();

server.listen(config.port, () => {
  console.log(`[Server] Signage Controller running on port ${config.port}`);
  console.log(`[Server] Admin UI: http://localhost:${config.port}`);
  console.log(`[Server] API:      http://localhost:${config.port}/api`);
  console.log(`[Server] WS:       ws://localhost:${config.port}`);
});

server.on('error', (err) => {
  console.error('[Server] Fatal error:', err.message);
  process.exit(1);
});
