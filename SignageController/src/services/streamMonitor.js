'use strict';

const config = require('../config');

// in-memory stream status: url -> { available: bool, lastChecked: number, error: string|null }
const streamStatus = new Map();
let monitorInterval = null;

async function checkStream(url) {
  // Lazily import node-fetch (ESM-only package) on first use
  const { default: fetch } = await import('node-fetch');
  try {
    // Use GET with Range header to fetch only the first byte — more reliable than HEAD
    // for HLS servers that may not implement HEAD correctly.
    const res = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      signal: AbortSignal.timeout(10000),
    });
    // 200 OK or 206 Partial Content both indicate the stream endpoint is reachable
    const available = res.ok || res.status === 206;
    streamStatus.set(url, { available, lastChecked: Date.now(), error: null });
  } catch (err) {
    streamStatus.set(url, { available: false, lastChecked: Date.now(), error: err.message });
  }
}

async function runChecks() {
  const db = require('../db');
  const streams = db.prepare(`SELECT DISTINCT url FROM content WHERE type = 'stream' AND url IS NOT NULL`).all();
  await Promise.all(streams.map((s) => checkStream(s.url)));
}

function start() {
  if (!config.streamMonitorEnabled) return;
  runChecks();
  monitorInterval = setInterval(runChecks, config.streamMonitorIntervalMs);
}

function isStreamAvailable(url) {
  const status = streamStatus.get(url);
  if (!status) return null; // unknown
  return status.available;
}

function getStatus() {
  const result = {};
  for (const [url, status] of streamStatus.entries()) {
    result[url] = status;
  }
  return result;
}

module.exports = { start, isStreamAvailable, getStatus };
