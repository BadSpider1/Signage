'use strict';

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');
const config = require('./config');

// Ensure log directory exists
try {
  fs.mkdirSync(config.logDir, { recursive: true });
} catch (err) {
  console.error(`Warning: Could not create log directory ${config.logDir}:`, err.message);
}

const transports = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
        return `${timestamp} [${level}] ${message}${metaStr}`;
      })
    ),
  }),
];

try {
  transports.push(
    new DailyRotateFile({
      filename: path.join(config.logDir, 'client-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: 5,
      maxSize: '10m',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.json()
      ),
    })
  );
} catch (err) {
  console.error('Warning: Could not create file log transport:', err.message);
}

const logger = winston.createLogger({
  level: config.logLevel || 'info',
  transports,
});

module.exports = logger;
