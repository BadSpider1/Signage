'use strict';

const EventEmitter = require('events');
const WebSocket = require('ws');
const logger = require('./logger');
const config = require('./config');

class WsClient extends EventEmitter {
  constructor() {
    super();
    this._ws = null;
    this._reconnectTimer = null;
    this._reconnectAttempt = 0;
    this._pingInterval = null;
    this._connected = false;
    this._destroyed = false;
  }

  connect() {
    if (this._destroyed) return;
    this._clearReconnectTimer();

    logger.info(`WsClient: connecting to ${config.wsUrl}`);
    let ws;
    try {
      ws = new WebSocket(config.wsUrl);
    } catch (err) {
      logger.error('WsClient: failed to create WebSocket', { err: err.message });
      this._scheduleReconnect();
      return;
    }
    this._ws = ws;

    ws.on('open', () => {
      this._connected = true;
      this._reconnectAttempt = 0;
      logger.info('WsClient: connected');
      this.emit('connected');
      this._sendIdentify();
      this._startPing();
    });

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch (err) {
        logger.warn('WsClient: received non-JSON message', { data: data.toString() });
        return;
      }
      this._handleMessage(msg);
    });

    ws.on('pong', () => {
      logger.debug('WsClient: pong received');
    });

    ws.on('close', (code, reason) => {
      this._connected = false;
      this._stopPing();
      logger.warn('WsClient: disconnected', { code, reason: reason?.toString() });
      this.emit('disconnected', { code, reason: reason?.toString() });
      if (!this._destroyed) {
        this._scheduleReconnect();
      }
    });

    ws.on('error', (err) => {
      logger.error('WsClient: WebSocket error', { err: err.message });
      this.emit('error', err);
    });
  }

  _sendIdentify() {
    this._send({
      type: 'IDENTIFY',
      deviceId: config.deviceId,
      capabilities: ['HLS', 'FALLBACK_IMAGE'],
      version: '1.0.0',
    });
  }

  _startPing() {
    this._stopPing();
    this._pingInterval = setInterval(() => {
      if (this._ws && this._ws.readyState === WebSocket.OPEN) {
        this._ws.ping();
      }
    }, 15000);
  }

  _stopPing() {
    if (this._pingInterval) {
      clearInterval(this._pingInterval);
      this._pingInterval = null;
    }
  }

  _handleMessage(msg) {
    logger.debug('WsClient: received message', { type: msg.type });
    switch (msg.type) {
      case 'SET_STREAM_URL':
        this.emit('SET_STREAM_URL', { url: msg.url });
        break;
      case 'CLEAR_STREAM':
        this.emit('CLEAR_STREAM', {});
        break;
      case 'SET_FALLBACK_IMAGE':
        this.emit('SET_FALLBACK_IMAGE', { path: msg.path });
        break;
      case 'PING':
        this._send({ type: 'PONG', deviceId: config.deviceId });
        break;
      default:
        logger.debug('WsClient: unhandled message type', { type: msg.type });
    }
  }

  _send(obj) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      try {
        this._ws.send(JSON.stringify(obj));
      } catch (err) {
        logger.error('WsClient: send error', { err: err.message });
      }
    }
  }

  _scheduleReconnect() {
    this._reconnectAttempt++;
    const base = config.wsReconnectBaseMs || 1000;
    const max = config.wsReconnectMaxMs || 30000;
    // Exponential backoff with full jitter
    const expDelay = Math.min(base * Math.pow(2, this._reconnectAttempt - 1), max);
    const delay = Math.floor(Math.random() * expDelay);
    logger.info(`WsClient: reconnecting in ${delay}ms (attempt ${this._reconnectAttempt})`);
    this._reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  _clearReconnectTimer() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  isConnected() {
    return this._connected;
  }

  destroy() {
    this._destroyed = true;
    this._clearReconnectTimer();
    this._stopPing();
    if (this._ws) {
      this._ws.terminate();
      this._ws = null;
    }
  }
}

module.exports = WsClient;
