(function () {
  'use strict';

  const CONTROLLER_WS_URL = 'ws://127.0.0.1:8081';
  const RECONNECT_BASE_MS = 1000;
  const RECONNECT_MAX_MS = 15000;
  const HEARTBEAT_INTERVAL_MS = 10000;

  const fallbackImg = document.getElementById('fallback-img');
  const streamVideo = document.getElementById('stream-video');

  let ws = null;
  let reconnectAttempt = 0;
  let reconnectTimer = null;
  let heartbeatTimer = null;
  let freezeCheckTimer = null;
  let lastPlaybackTime = null;
  let freezeTimeoutMs = 6000;
  let hls = null;
  let currentProbeUrl = null;
  let probeTimeoutTimer = null;
  let isProbing = false;

  // ---- Utility ----
  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(obj));
      } catch (e) {
        console.error('[app] send error:', e);
      }
    }
  }

  // ---- UI helpers ----
  function showFallback() {
    streamVideo.classList.remove('visible');
    fallbackImg.style.opacity = '1';
    stopFreezeCheck();
  }

  function showStream() {
    fallbackImg.style.opacity = '0';
    streamVideo.classList.add('visible');
  }

  // ---- HLS / Video helpers ----
  function destroyHls() {
    if (hls) {
      hls.destroy();
      hls = null;
    }
  }

  function resetVideo() {
    destroyHls();
    streamVideo.pause();
    streamVideo.removeAttribute('src');
    streamVideo.load();
    streamVideo.classList.remove('visible');
    stopFreezeCheck();
  }

  function isNativeHlsSupported() {
    return streamVideo.canPlayType('application/vnd.apple.mpegurl') !== '';
  }

  function isHlsUrl(url) {
    return url && (url.endsWith('.m3u8') || url.includes('.m3u8?'));
  }

  // ---- Freeze detection ----
  function stopFreezeCheck() {
    if (freezeCheckTimer) {
      clearInterval(freezeCheckTimer);
      freezeCheckTimer = null;
    }
    lastPlaybackTime = null;
  }

  function startFreezeCheck(url) {
    stopFreezeCheck();
    let frozenMs = 0;
    const checkInterval = 2000;
    lastPlaybackTime = streamVideo.currentTime;

    freezeCheckTimer = setInterval(() => {
      const current = streamVideo.currentTime;
      if (streamVideo.paused || streamVideo.ended) {
        frozenMs = 0;
        lastPlaybackTime = current;
        return;
      }
      if (current === lastPlaybackTime) {
        frozenMs += checkInterval;
        if (frozenMs >= freezeTimeoutMs) {
          console.warn('[app] Playback frozen, reporting');
          stopFreezeCheck();
          send({ type: 'PLAYBACK_FROZEN', reason: 'currentTime unchanged' });
        }
      } else {
        frozenMs = 0;
        lastPlaybackTime = current;
      }
    }, checkInterval);
  }

  // ---- Probe ----
  function probeStream(url, timeoutMs) {
    if (isProbing) {
      clearProbeTimeout();
    }
    isProbing = true;
    currentProbeUrl = url;
    freezeTimeoutMs = timeoutMs || 6000;

    console.log('[app] Probing stream:', url);
    resetVideo();

    const probeVideo = document.createElement('video');
    probeVideo.muted = true;
    probeVideo.autoplay = false;
    probeVideo.style.display = 'none';
    document.body.appendChild(probeVideo);

    let probeHls = null;
    let settled = false;

    function cleanup() {
      clearProbeTimeout();
      if (probeHls) {
        probeHls.destroy();
        probeHls = null;
      }
      try { probeVideo.pause(); } catch(_) {}
      probeVideo.removeAttribute('src');
      try { probeVideo.load(); } catch(_) {}
      if (probeVideo.parentNode) probeVideo.parentNode.removeChild(probeVideo);
    }

    function succeed() {
      if (settled) return;
      settled = true;
      isProbing = false;
      cleanup();
      send({ type: 'PROBE_OK', url });
    }

    function fail(reason) {
      if (settled) return;
      settled = true;
      isProbing = false;
      cleanup();
      send({ type: 'PROBE_FAIL', reason, url });
    }

    probeTimeoutTimer = setTimeout(() => {
      fail('probe timeout');
    }, timeoutMs || 8000);

    if (isHlsUrl(url) && !isNativeHlsSupported()) {
      if (typeof Hls === 'undefined' || !Hls.isSupported()) {
        fail('HLS.js not available');
        return;
      }
      probeHls = new Hls({ maxBufferLength: 5, maxMaxBufferLength: 10 });
      probeHls.loadSource(url);
      probeHls.attachMedia(probeVideo);
      probeHls.on(Hls.Events.MANIFEST_PARSED, () => succeed());
      probeHls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) fail('HLS fatal error: ' + data.type);
      });
    } else {
      probeVideo.src = url;
      probeVideo.oncanplay = () => succeed();
      probeVideo.onerror = () => fail('video error: ' + (probeVideo.error ? probeVideo.error.message : 'unknown'));
      probeVideo.load();
    }
  }

  function clearProbeTimeout() {
    if (probeTimeoutTimer) {
      clearTimeout(probeTimeoutTimer);
      probeTimeoutTimer = null;
    }
  }

  // ---- Play stream ----
  function playStream(url) {
    console.log('[app] Playing stream:', url);
    resetVideo();

    if (isHlsUrl(url) && !isNativeHlsSupported()) {
      if (typeof Hls === 'undefined' || !Hls.isSupported()) {
        send({ type: 'PLAYBACK_ERROR', reason: 'HLS.js not available' });
        return;
      }
      hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60, enableWorker: true });
      hls.loadSource(url);
      hls.attachMedia(streamVideo);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        streamVideo.play().then(() => {
          showStream();
          startFreezeCheck(url);
        }).catch((err) => {
          send({ type: 'PLAYBACK_ERROR', reason: err.message });
        });
      });
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          const reason = 'HLS fatal: ' + data.type + ' / ' + data.details;
          send({ type: 'PLAYBACK_ERROR', reason });
        }
      });
    } else {
      streamVideo.src = url;
      streamVideo.load();
      streamVideo.play().then(() => {
        showStream();
        startFreezeCheck(url);
      }).catch((err) => {
        send({ type: 'PLAYBACK_ERROR', reason: err.message });
      });
    }

    streamVideo.onerror = function () {
      const msg = streamVideo.error ? streamVideo.error.message : 'unknown video error';
      send({ type: 'PLAYBACK_ERROR', reason: msg });
    };
  }

  // ---- Controller WS ----
  function handleMessage(msg) {
    console.log('[app] Received command:', msg.type);
    switch (msg.type) {
      case 'SHOW_FALLBACK':
        isProbing = false;
        clearProbeTimeout();
        resetVideo();
        if (msg.path) {
          fallbackImg.src = msg.path;
        }
        showFallback();
        break;

      case 'PROBE_STREAM':
        freezeTimeoutMs = msg.timeoutMs || 6000;
        probeStream(msg.url, msg.timeoutMs || 8000);
        break;

      case 'PLAY_STREAM':
        playStream(msg.url);
        break;

      case 'STOP_STREAM':
        resetVideo();
        showFallback();
        break;

      default:
        console.warn('[app] Unknown command:', msg.type);
    }
  }

  // ---- Heartbeat ----
  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      send({ type: 'HEARTBEAT' });
    }, HEARTBEAT_INTERVAL_MS);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  // ---- WS connection ----
  function connect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    console.log('[app] Connecting to controller:', CONTROLLER_WS_URL);
    try {
      ws = new WebSocket(CONTROLLER_WS_URL);
    } catch (e) {
      console.error('[app] WebSocket construction error:', e);
      scheduleReconnect();
      return;
    }

    ws.onopen = function () {
      console.log('[app] Connected to controller');
      reconnectAttempt = 0;
      startHeartbeat();
    };

    ws.onmessage = function (event) {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (e) {
        console.warn('[app] Non-JSON message from controller');
        return;
      }
      handleMessage(msg);
    };

    ws.onclose = function (event) {
      console.warn('[app] Disconnected from controller', event.code);
      stopHeartbeat();
      ws = null;
      scheduleReconnect();
    };

    ws.onerror = function (err) {
      console.error('[app] WebSocket error', err);
    };
  }

  function scheduleReconnect() {
    reconnectAttempt++;
    const exp = Math.min(RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt - 1), RECONNECT_MAX_MS);
    const delay = Math.floor(Math.random() * exp) + RECONNECT_BASE_MS;
    console.log('[app] Reconnecting in', delay, 'ms (attempt', reconnectAttempt, ')');
    reconnectTimer = setTimeout(connect, delay);
  }

  // ---- Init ----
  connect();
})();
