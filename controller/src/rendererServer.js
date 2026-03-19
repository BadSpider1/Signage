'use strict';

const EventEmitter = require('events');
const WebSocket = require('ws');
const logger = require('./logger');
const config = require('./config');

class RendererServer extends EventEmitter {
  constructor() {
    super();
    this._wss = null;
    this._clients = new Set();
  }

  start() {
    const port = config.controllerWsPort || 8081;
    this._wss = new WebSocket.Server({ port, host: '127.0.0.1' });

    this._wss.on('listening', () => {
      logger.info(`RendererServer: listening on ws://127.0.0.1:${port}`);
    });

    this._wss.on('connection', (ws, req) => {
      const remoteAddr = req.socket.remoteAddress;
      logger.info('RendererServer: renderer connected', { remoteAddr });
      this._clients.add(ws);

      ws.on('message', (data) => {
        let msg;
        try {
          msg = JSON.parse(data.toString());
        } catch (err) {
          logger.warn('RendererServer: received non-JSON from renderer');
          return;
        }
        this._handleRendererMessage(msg);
      });

      ws.on('close', () => {
        logger.info('RendererServer: renderer disconnected');
        this._clients.delete(ws);
      });

      ws.on('error', (err) => {
        logger.error('RendererServer: client error', { err: err.message });
        this._clients.delete(ws);
      });
    });

    this._wss.on('error', (err) => {
      logger.error('RendererServer: server error', { err: err.message });
    });
  }

  _handleRendererMessage(msg) {
    logger.debug('RendererServer: received from renderer', { type: msg.type });
    switch (msg.type) {
      case 'PROBE_OK':
        this.emit('PROBE_OK', { url: msg.url });
        break;
      case 'PROBE_FAIL':
        this.emit('PROBE_FAIL', { reason: msg.reason, url: msg.url });
        break;
      case 'PLAYBACK_ERROR':
        this.emit('PLAYBACK_ERROR', { reason: msg.reason });
        break;
      case 'PLAYBACK_FROZEN':
        this.emit('PLAYBACK_FROZEN', { reason: msg.reason });
        break;
      case 'HEARTBEAT':
        this.emit('HEARTBEAT', {});
        break;
      default:
        logger.debug('RendererServer: unhandled message from renderer', { type: msg.type });
    }
  }

  broadcast(obj) {
    const payload = JSON.stringify(obj);
    let sent = 0;
    for (const client of this._clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(payload);
          sent++;
        } catch (err) {
          logger.error('RendererServer: broadcast send error', { err: err.message });
        }
      }
    }
    if (sent === 0) {
      logger.warn('RendererServer: no renderer connected, queuing command', { type: obj.type });
    }
    return sent;
  }

  showFallback(imagePath) {
    return this.broadcast({ type: 'SHOW_FALLBACK', path: imagePath });
  }

  probeStream(url, timeoutMs) {
    return this.broadcast({ type: 'PROBE_STREAM', url, timeoutMs });
  }

  playStream(url) {
    return this.broadcast({ type: 'PLAY_STREAM', url });
  }

  stopStream() {
    return this.broadcast({ type: 'STOP_STREAM' });
  }

  clientCount() {
    return this._clients.size;
  }

  close() {
    if (this._wss) {
      this._wss.close();
    }
  }
}

module.exports = RendererServer;
