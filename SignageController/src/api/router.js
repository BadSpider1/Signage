'use strict';

const express = require('express');
const router = express.Router();
const { requireAdminAuth } = require('../middleware/auth');
const streamMonitor = require('../services/streamMonitor');
const gateway = require('../gateway/deviceGateway');

// Public health check
router.get('/status', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    connectedDevices: gateway.getConnectedDevices().length,
    timestamp: Date.now(),
  });
});

// All /api/* routes require admin auth
router.use(requireAdminAuth);

router.use('/devices', require('./devices'));
router.use('/groups', require('./groups'));
router.use('/content', require('./content'));
router.use('/assignments', require('./assignments'));
router.use('/control', require('./control'));

// Stream monitor status (auth required)
router.get('/stream-monitor', (req, res) => {
  res.json(streamMonitor.getStatus());
});

module.exports = router;
