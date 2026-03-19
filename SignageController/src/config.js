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
};

module.exports = config;
