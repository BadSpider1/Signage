'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

const SYSTEM_CONFIG_PATH = '/etc/signage/config.json';
const DEFAULT_CONFIG_PATH = path.resolve(__dirname, '../../config/default.json');
const DEVICE_ID_PATH = '/var/lib/signage/device-id';

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function resolveDeviceId(configDeviceId) {
  if (configDeviceId) return configDeviceId;
  if (process.env.SIGNAGE_DEVICE_ID) return process.env.SIGNAGE_DEVICE_ID;
  try {
    const stored = fs.readFileSync(DEVICE_ID_PATH, 'utf8').trim();
    if (stored) return stored;
  } catch (_) {}
  // Try to persist a new UUID
  const newId = uuidv4();
  try {
    fs.mkdirSync(path.dirname(DEVICE_ID_PATH), { recursive: true });
    fs.writeFileSync(DEVICE_ID_PATH, newId, 'utf8');
  } catch (_) {}
  return newId || os.hostname();
}

function loadConfig() {
  const defaults = readJsonFile(DEFAULT_CONFIG_PATH) || {};
  const system = readJsonFile(SYSTEM_CONFIG_PATH) || {};
  const merged = { ...defaults, ...system };

  // Apply environment variable overrides
  const envMap = {
    SIGNAGE_WS_URL: 'wsUrl',
    SIGNAGE_FALLBACK_IMAGE: 'fallbackImagePath',
    SIGNAGE_PASSIVE_ENDPOINT: 'passiveEndpoint',
    SIGNAGE_PASSIVE_POLL_MS: 'passivePollIntervalMs',
    SIGNAGE_PROBE_TIMEOUT_MS: 'probeTimeoutMs',
    SIGNAGE_FREEZE_TIMEOUT_MS: 'freezeTimeoutMs',
    SIGNAGE_MAX_STREAM_RETRIES: 'maxStreamRetries',
    SIGNAGE_RENDERER_PORT: 'rendererPort',
    SIGNAGE_CONTROLLER_WS_PORT: 'controllerWsPort',
    SIGNAGE_LOG_DIR: 'logDir',
    SIGNAGE_LOG_LEVEL: 'logLevel',
    SIGNAGE_CACHE_FILE: 'cacheFile',
    SIGNAGE_WS_RECONNECT_BASE_MS: 'wsReconnectBaseMs',
    SIGNAGE_WS_RECONNECT_MAX_MS: 'wsReconnectMaxMs',
  };

  for (const [envKey, configKey] of Object.entries(envMap)) {
    if (process.env[envKey] !== undefined) {
      const val = process.env[envKey];
      // Coerce numeric fields
      const numericFields = ['passivePollIntervalMs', 'probeTimeoutMs', 'freezeTimeoutMs',
        'maxStreamRetries', 'rendererPort', 'controllerWsPort', 'wsReconnectBaseMs', 'wsReconnectMaxMs'];
      merged[configKey] = numericFields.includes(configKey) ? Number(val) : val;
    }
  }

  merged.deviceId = resolveDeviceId(merged.deviceId);

  return Object.freeze(merged);
}

module.exports = loadConfig();
