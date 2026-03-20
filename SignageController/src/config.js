'use strict';

const config = {
  port: parseInt(process.env.PORT || '9000', 10),
  adminToken: process.env.ADMIN_TOKEN || 'changeme',
  devicePsk: process.env.SIGNAGE_DEVICE_PSK || '',
  dbPath: process.env.DB_PATH || './data/signage.db',
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  streamMonitorEnabled: process.env.STREAM_MONITOR_ENABLED === 'true',
  streamMonitorIntervalMs: parseInt(process.env.STREAM_MONITOR_INTERVAL_MS || '60000', 10),
  heartbeatTimeoutMs: parseInt(process.env.HEARTBEAT_TIMEOUT_MS || '45000', 10),
  // Full public base URL of this controller (used to build absolute media URLs for devices).
  // Precedence: BASE_URL env > http://localhost:<PORT>
  baseUrl: process.env.BASE_URL || '',
  // How often the server sends PING messages to connected devices (ms). 0 = disabled.
  pingIntervalMs: parseInt(process.env.PING_INTERVAL_MS || '30000', 10),
  // Grace period before marking a device offline after WS close (ms).
  // Allows fast reconnects to not cause a brief offline flash.
  offlineGraceMs: parseInt(process.env.OFFLINE_GRACE_MS || '8000', 10),
};

// Derive base URL from port if not explicitly set
if (!config.baseUrl) {
  config.baseUrl = `http://localhost:${config.port}`;
}

module.exports = config;
