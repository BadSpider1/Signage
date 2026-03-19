'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');
const StateMachine = require('./stateMachine');
const WsClient = require('./wsClient');
const RendererServer = require('./rendererServer');
const PassivePoller = require('./passivePoller');

// Global error resilience
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { err: err.message, stack: err.stack });
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: String(reason) });
});

// State
const sm = new StateMachine();
const wsClient = new WsClient();
const rendererServer = new RendererServer();
const passivePoller = new PassivePoller();

let currentStreamUrl = null;
let pendingStreamUrl = null;
let retryCount = 0;
let retryTimer = null;
let fallbackImagePath = config.fallbackImagePath;

// Cache helpers
function cacheStreamUrl(url) {
  try {
    fs.mkdirSync(path.dirname(config.cacheFile), { recursive: true });
    fs.writeFileSync(config.cacheFile, JSON.stringify({ url, cachedAt: Date.now() }), 'utf8');
  } catch (err) {
    logger.warn('Failed to cache stream URL', { err: err.message });
  }
}

function loadCachedStreamUrl() {
  try {
    const raw = fs.readFileSync(config.cacheFile, 'utf8');
    const data = JSON.parse(raw);
    return data.url || null;
  } catch (_) {
    return null;
  }
}

function jitterDelay(attempt) {
  const base = 500;
  const max = 10000;
  const exp = Math.min(base * Math.pow(2, attempt), max);
  return Math.floor(Math.random() * exp) + 500;
}

function clearRetryTimer() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

// Probe flow
function startProbe(url) {
  pendingStreamUrl = url;
  retryCount = 0;
  doProbe(url);
}

function doProbe(url) {
  const state = sm.getState();
  if (state !== StateMachine.STATES.PROBING_STREAM) {
    sm.transition(StateMachine.STATES.PROBING_STREAM, `probing ${url}`);
  }
  logger.info('Starting probe', { url });
  rendererServer.probeStream(url, config.probeTimeoutMs);
}

function handleProbeSuccess(url) {
  clearRetryTimer();
  retryCount = 0;
  currentStreamUrl = url;
  pendingStreamUrl = null;
  sm.transition(StateMachine.STATES.STREAM, `probe ok for ${url}`);
  rendererServer.playStream(url);
  cacheStreamUrl(url);
  passivePoller.pause();
}

function handleProbeOrPlaybackFailure(reason) {
  logger.warn('Probe/playback failure', { reason, retryCount, maxRetries: config.maxStreamRetries });
  if (retryCount < config.maxStreamRetries) {
    retryCount++;
    const delay = jitterDelay(retryCount);
    logger.info(`Scheduling retry ${retryCount}/${config.maxStreamRetries} in ${delay}ms`);
    clearRetryTimer();
    retryTimer = setTimeout(() => {
      if (pendingStreamUrl) {
        doProbe(pendingStreamUrl);
      }
    }, delay);
  } else {
    logger.warn('Max retries reached, falling back');
    clearRetryTimer();
    retryCount = 0;
    currentStreamUrl = null;
    pendingStreamUrl = null;
    sm.transition(StateMachine.STATES.FALLBACK, 'max retries reached');
    rendererServer.showFallback(fallbackImagePath);
    passivePoller.resume();
  }
}

// Wire up WS client events
wsClient.on('connected', () => {
  logger.info('Central server connected');
});

wsClient.on('disconnected', () => {
  logger.warn('Central server disconnected - maintaining current state');
});

wsClient.on('SET_STREAM_URL', ({ url }) => {
  logger.info('Received SET_STREAM_URL', { url });
  if (url === currentStreamUrl && sm.getState() === StateMachine.STATES.STREAM) {
    logger.info('Already streaming this URL, ignoring');
    return;
  }
  startProbe(url);
});

wsClient.on('CLEAR_STREAM', () => {
  logger.info('Received CLEAR_STREAM');
  clearRetryTimer();
  currentStreamUrl = null;
  pendingStreamUrl = null;
  retryCount = 0;
  sm.transition(StateMachine.STATES.FALLBACK, 'CLEAR_STREAM command');
  rendererServer.showFallback(fallbackImagePath);
  passivePoller.resume();
});

wsClient.on('SET_FALLBACK_IMAGE', ({ path: imgPath }) => {
  logger.info('Received SET_FALLBACK_IMAGE', { path: imgPath });
  fallbackImagePath = imgPath;
  if (sm.getState() === StateMachine.STATES.FALLBACK) {
    rendererServer.showFallback(fallbackImagePath);
  }
});

// Wire up renderer server events
rendererServer.on('PROBE_OK', ({ url }) => {
  logger.info('Renderer: PROBE_OK', { url });
  handleProbeSuccess(url || pendingStreamUrl);
});

rendererServer.on('PROBE_FAIL', ({ reason }) => {
  logger.warn('Renderer: PROBE_FAIL', { reason });
  handleProbeOrPlaybackFailure(reason);
});

rendererServer.on('PLAYBACK_ERROR', ({ reason }) => {
  logger.warn('Renderer: PLAYBACK_ERROR', { reason });
  pendingStreamUrl = currentStreamUrl;
  currentStreamUrl = null;
  handleProbeOrPlaybackFailure(reason);
});

rendererServer.on('PLAYBACK_FROZEN', ({ reason }) => {
  logger.warn('Renderer: PLAYBACK_FROZEN', { reason });
  pendingStreamUrl = currentStreamUrl;
  currentStreamUrl = null;
  handleProbeOrPlaybackFailure('frozen');
});

rendererServer.on('HEARTBEAT', () => {
  logger.debug('Renderer: heartbeat received');
});

// Wire up passive poller events
passivePoller.on('stream-available', ({ url }) => {
  if (sm.getState() !== StateMachine.STATES.FALLBACK) {
    logger.debug('PassivePoller: stream available but not in FALLBACK state, ignoring');
    return;
  }
  logger.info('PassivePoller: stream available, probing', { url });
  startProbe(url);
});

passivePoller.on('stream-unavailable', () => {
  logger.debug('PassivePoller: stream unavailable');
});

async function main() {
  logger.info('Signage controller starting', {
    deviceId: config.deviceId,
    wsUrl: config.wsUrl,
    rendererPort: config.rendererPort,
    controllerWsPort: config.controllerWsPort,
  });

  // Start renderer WebSocket server
  rendererServer.start();

  // Connect to central WebSocket server
  wsClient.connect();

  // Start passive poller if configured
  passivePoller.start();

  // Send initial SHOW_FALLBACK
  // Wait a moment for renderer to connect
  setTimeout(() => {
    logger.info('Sending initial SHOW_FALLBACK', { path: fallbackImagePath });
    rendererServer.showFallback(fallbackImagePath);

    // Optionally try cached stream URL
    const cached = loadCachedStreamUrl();
    if (cached) {
      logger.info('Found cached stream URL, probing', { url: cached });
      startProbe(cached);
    }
  }, 2000);

  // Handle shutdown
  const shutdown = (signal) => {
    logger.info(`Received ${signal}, shutting down`);
    wsClient.destroy();
    passivePoller.stop();
    rendererServer.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Fatal error in main', { err: err.message, stack: err.stack });
  process.exit(1);
});
