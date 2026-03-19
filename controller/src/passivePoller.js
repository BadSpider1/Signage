'use strict';

const EventEmitter = require('events');
const logger = require('./logger');
const config = require('./config');

class PassivePoller extends EventEmitter {
  constructor() {
    super();
    this._timer = null;
    this._active = false;
    this._paused = false;
  }

  start() {
    if (!config.passiveEndpoint) {
      logger.info('PassivePoller: no endpoint configured, disabled');
      return;
    }
    this._active = true;
    logger.info('PassivePoller: started', { endpoint: config.passiveEndpoint, intervalMs: config.passivePollIntervalMs });
    this._schedule();
  }

  pause() {
    this._paused = true;
  }

  resume() {
    this._paused = false;
  }

  stop() {
    this._active = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  _schedule() {
    if (!this._active) return;
    this._timer = setTimeout(() => this._poll(), config.passivePollIntervalMs || 20000);
  }

  async _poll() {
    if (!this._active) return;
    if (this._paused) {
      this._schedule();
      return;
    }
    try {
      // Dynamically import node-fetch (ESM) via require workaround
      const fetch = (await import('node-fetch')).default;
      const endpoint = config.passiveEndpoint;
      logger.debug('PassivePoller: polling', { endpoint });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      let response;
      try {
        response = await fetch(endpoint, { signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        logger.debug('PassivePoller: endpoint returned non-OK', { status: response.status });
        this.emit('stream-unavailable', {});
        this._schedule();
        return;
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await response.json();
        if (json && json.url) {
          logger.debug('PassivePoller: stream URL found', { url: json.url });
          this.emit('stream-available', { url: json.url });
        } else {
          logger.debug('PassivePoller: JSON response has no url field');
          this.emit('stream-unavailable', {});
        }
      } else {
        // HEAD or non-JSON OK response means stream is available but no URL
        // Only emit if we have a url in config or it's a direct stream URL
        logger.debug('PassivePoller: endpoint responded OK (non-JSON)');
        this.emit('stream-available', { url: endpoint });
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        logger.warn('PassivePoller: poll timed out');
      } else {
        logger.warn('PassivePoller: poll error', { err: err.message });
      }
      this.emit('stream-unavailable', {});
    }
    this._schedule();
  }
}

module.exports = PassivePoller;
