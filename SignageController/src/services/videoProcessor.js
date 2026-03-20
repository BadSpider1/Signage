'use strict';

/**
 * Video processing service.
 *
 * When a video is uploaded the workflow is:
 *   1. Content record is created with type='video', processing_status='queued'.
 *   2. processVideo() is called asynchronously.
 *   3. If ffmpeg is available → generate HLS (.m3u8 + .ts segments) in
 *      <uploadDir>/hls/<contentId>/. Set processing_status='ready' and url pointing
 *      to the served HLS manifest.
 *   4. If ffmpeg is NOT available → the raw MP4 is served directly. The url is set to
 *      the direct MP4 path and processing_status='ready'.
 *   5. On completion the affected devices (if any) receive updated SET_STREAM_URL commands.
 *
 * ffmpeg requirement:
 *   Install ffmpeg on the server (e.g. `apt install ffmpeg`). If not present, the
 *   system falls back to serving the raw MP4 file over HTTP as a stream URL.
 */

const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const config = require('../config');
const contentService = require('./contentService');

/**
 * Check if ffmpeg is available on PATH.
 * Returns a Promise<boolean>.
 */
function isFfmpegAvailable() {
  return new Promise((resolve) => {
    execFile('ffmpeg', ['-version'], { timeout: 5000 }, (err) => {
      resolve(!err);
    });
  });
}

/**
 * Run ffmpeg to convert an input video file to HLS.
 * Returns a Promise that resolves when conversion is done.
 */
function convertToHls(inputPath, outputDir) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(outputDir, { recursive: true });
    const playlistPath = path.join(outputDir, 'index.m3u8');
    const segmentPattern = path.join(outputDir, 'seg%03d.ts');

    const args = [
      '-y',
      '-i', inputPath,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-hls_time', '6',
      '-hls_list_size', '0',
      '-hls_segment_filename', segmentPattern,
      playlistPath,
    ];

    execFile('ffmpeg', args, { timeout: 1800000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`ffmpeg failed: ${stderr || err.message}`));
      } else {
        resolve(playlistPath);
      }
    });
  });
}

/**
 * Process an uploaded video file asynchronously.
 *
 * @param {string} contentId  - The content record id.
 * @param {string} inputPath  - Absolute filesystem path to the uploaded video file.
 * @param {string} fileName   - Original file name (used to derive the served path).
 */
async function processVideo(contentId, inputPath, fileName) {
  console.log(`[VideoProcessor] Starting processing for content ${contentId}`);
  contentService.setProcessingStatus(contentId, 'processing');

  try {
    const ffmpegAvailable = await isFfmpegAvailable();

    if (ffmpegAvailable) {
      // Convert to HLS
      const hlsDir = path.resolve(config.uploadDir, 'hls', contentId);
      await convertToHls(inputPath, hlsDir);

      const hlsUrl = `${config.baseUrl}/uploads/hls/${contentId}/index.m3u8`;
      contentService.setProcessingStatus(contentId, 'ready', hlsUrl);
      console.log(`[VideoProcessor] HLS ready for ${contentId}: ${hlsUrl}`);
    } else {
      // Fallback: serve the raw MP4
      console.warn('[VideoProcessor] ffmpeg not found; serving raw MP4 as stream URL');
      const rawUrl = `${config.baseUrl}/uploads/${path.basename(inputPath)}`;
      contentService.setProcessingStatus(contentId, 'ready', rawUrl);
      console.log(`[VideoProcessor] MP4 ready for ${contentId}: ${rawUrl}`);
    }

    // Push updated content to any devices that have this content assigned.
    _pushToAffectedDevices(contentId);
  } catch (err) {
    console.error(`[VideoProcessor] Processing failed for ${contentId}:`, err.message);
    contentService.setProcessingStatus(contentId, 'failed');
  }
}

/**
 * After processing completes, push the updated stream URL to devices
 * that currently have this content assigned.
 */
function _pushToAffectedDevices(contentId) {
  try {
    const db = require('../db');
    const gateway = require('../gateway/deviceGateway');
    const resolver = require('../resolvers/assignmentResolver');
    const deviceService = require('./deviceService');

    // Only look at devices that have an assignment pointing to this contentId
    // (directly or via group/global) rather than scanning all devices.
    const directDeviceIds = db.prepare(`
      SELECT target_id as device_id FROM assignments
      WHERE target_type = 'device' AND content_id = ?
    `).all(contentId).map((r) => r.device_id);

    const groupIds = db.prepare(`
      SELECT target_id as group_id FROM assignments
      WHERE target_type = 'group' AND content_id = ?
    `).all(contentId).map((r) => r.group_id);

    const groupDeviceIds = groupIds.length
      ? db.prepare(`SELECT DISTINCT device_id FROM device_groups WHERE group_id IN (${groupIds.map(() => '?').join(',')})`)
          .all(...groupIds).map((r) => r.device_id)
      : [];

    const hasGlobal = !!db.prepare(`
      SELECT id FROM assignments WHERE target_type = 'global' AND content_id = ?
    `).get(contentId);

    const globalDeviceIds = hasGlobal
      ? db.prepare(`SELECT id FROM devices`).all().map((r) => r.id)
      : [];

    const affectedIds = new Set([...directDeviceIds, ...groupDeviceIds, ...globalDeviceIds]);

    for (const deviceId of affectedIds) {
      const resolved = resolver.resolveForDevice(deviceId);
      if (resolved && resolved.content.id === contentId) {
        const commands = gateway.buildCommand(resolved);
        for (const cmd of commands) {
          gateway.sendToDevice(deviceId, cmd);
        }
        deviceService.setDeviceState(deviceId, 'stream', contentId);
      }
    }
  } catch (err) {
    console.error('[VideoProcessor] Error pushing to devices:', err.message);
  }
}

module.exports = { processVideo, isFfmpegAvailable };
