'use strict';

// ============================================================
// Config & Auth
// ============================================================
let ADMIN_TOKEN = localStorage.getItem('signage_admin_token') || '';

// Track event listeners for controls that get re-registered on view refresh
const controlHandlers = new Map();

function ensureToken() {
  if (!ADMIN_TOKEN) {
    const t = prompt('Enter ADMIN_TOKEN (Bearer token for API access):');
    if (t) {
      ADMIN_TOKEN = t.trim();
      localStorage.setItem('signage_admin_token', ADMIN_TOKEN);
    }
  }
}

document.getElementById('btn-token').addEventListener('click', () => {
  const t = prompt('Enter ADMIN_TOKEN:', ADMIN_TOKEN);
  if (t !== null) {
    ADMIN_TOKEN = t.trim();
    localStorage.setItem('signage_admin_token', ADMIN_TOKEN);
    toast('Token saved', 'success');
    refreshCurrentView();
  }
});

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}` };
}

// ============================================================
// API helpers
// ============================================================
async function api(method, path, body) {
  ensureToken();
  const opts = { method, headers: authHeaders() };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`/api${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

const GET = (p) => api('GET', p);
const POST = (p, b) => api('POST', p, b);
const PATCH = (p, b) => api('PATCH', p, b);
const DELETE = (p) => api('DELETE', p);

// ============================================================
// Toast notifications
// ============================================================
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  el.innerHTML = `<span>${icon}</span> ${msg}`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ============================================================
// Navigation
// ============================================================
let currentView = 'dashboard';
let dashboardRefreshTimer = null;

function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach((l) => l.classList.remove('active'));
  const view = document.getElementById(`view-${name}`);
  if (view) view.classList.add('active');
  const link = document.querySelector(`[data-view="${name}"]`);
  if (link) link.classList.add('active');
  currentView = name;
  clearInterval(dashboardRefreshTimer);
  renderView(name);
  if (name === 'dashboard') {
    dashboardRefreshTimer = setInterval(() => renderView('dashboard'), 10000);
  }
}

function refreshCurrentView() { renderView(currentView); }

function renderView(name) {
  switch (name) {
    case 'dashboard': renderDashboard(); break;
    case 'devices': renderDevices(); break;
    case 'groups': renderGroups(); break;
    case 'content': renderContent(); break;
    case 'control': renderControl(); break;
  }
}

document.querySelectorAll('.nav-link').forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    showView(link.dataset.view);
  });
});

document.getElementById('btn-refresh').addEventListener('click', () => renderDashboard());

// ============================================================
// Modal
// ============================================================
function showModal(title, bodyHtml, footerHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-footer').innerHTML = footerHtml || '';
  document.getElementById('modal-overlay').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
}

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});

// ============================================================
// Helpers
// ============================================================
function statusBadge(online) {
  return `<span class="status-badge ${online ? 'online' : 'offline'}">
    <span class="status-dot"></span>${online ? 'Online' : 'Offline'}
  </span>`;
}

function typeBadge(type) {
  const labels = { stream: '📡 Stream', image: '🖼 Image', video: '🎬 Video' };
  return `<span class="content-card-type ${type}">${labels[type] || type}</span>`;
}

function processingBadge(status) {
  const map = {
    queued:     { cls: 'processing-queued',     icon: '⏳', label: 'Queued' },
    processing: { cls: 'processing-processing', icon: '⚙️', label: 'Processing…' },
    ready:      { cls: 'processing-ready',      icon: '✅', label: 'Ready' },
    failed:     { cls: 'processing-failed',     icon: '❌', label: 'Failed' },
  };
  const s = map[status] || map.ready;
  return `<span class="processing-badge ${s.cls}">${s.icon} ${s.label}</span>`;
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function timeAgo(ts) {
  if (!ts) return 'never';
  const d = Math.floor((Date.now() - ts) / 1000);
  const absolute = new Date(ts).toLocaleString();
  let relative;
  if (d < 60) relative = `${d}s ago`;
  else if (d < 3600) relative = `${Math.floor(d / 60)}m ago`;
  else relative = `${Math.floor(d / 3600)}h ago`;
  return `<span title="${absolute}">${relative}</span>`;
}

// ============================================================
// Dashboard
// ============================================================
async function renderDashboard() {
  try {
    const [devices, status] = await Promise.all([
      GET('/devices'),
      fetch('/api/status').then((r) => r.json()),
    ]);

    const online = devices.filter((d) => d.online).length;
    const offline = devices.length - online;

    document.getElementById('stats-row').innerHTML = `
      <div class="stat-card"><div class="stat-value">${devices.length}</div><div class="stat-label">Total Devices</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--green)">${online}</div><div class="stat-label">Online</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--gray)">${offline}</div><div class="stat-label">Offline</div></div>
      <div class="stat-card"><div class="stat-value">${Math.floor(status.uptime)}s</div><div class="stat-label">Uptime</div></div>
    `;

    if (devices.length === 0) {
      document.getElementById('device-grid').innerHTML = `
        <div class="empty-state"><div class="empty-icon">📺</div><p>No devices registered yet.</p></div>`;
      return;
    }

    document.getElementById('device-grid').innerHTML = devices.map((d) => `
      <div class="device-card">
        <div class="device-card-header">
          <div>
            <div class="device-card-name">${escHtml(d.name)}</div>
            <div class="device-card-id">${escHtml(d.id)}</div>
          </div>
          ${statusBadge(d.online)}
        </div>
        <div class="device-card-meta">
          State: <span class="state-tag">${escHtml(d.current_state)}</span>
          &nbsp; Last seen: ${timeAgo(d.last_heartbeat)}
        </div>
        <div class="device-card-actions">
          <button class="btn btn-sm btn-secondary" onclick="cmdDevice('${escHtml(d.id)}','ping')">Ping</button>
          <button class="btn btn-sm btn-secondary" onclick="cmdDevice('${escHtml(d.id)}','reload')">Reload</button>
          <button class="btn btn-sm btn-danger" onclick="cmdDevice('${escHtml(d.id)}','clear-stream')">Clear</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function cmdDevice(id, action) {
  try {
    const res = await POST(`/devices/${id}/${action}`, {});
    toast(`Command sent (${action}) → ${res.sent ? 'delivered' : 'queued'}`, res.sent ? 'success' : 'info');
    renderDashboard();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ============================================================
// Devices view
// ============================================================
let allGroups = [];

async function renderDevices() {
  const el = document.getElementById('device-list');
  el.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const [devices, groups] = await Promise.all([GET('/devices'), GET('/groups')]);
    allGroups = groups;
    if (devices.length === 0) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">📺</div><p>No devices yet.</p></div>`;
      return;
    }
    el.innerHTML = devices.map((d) => `
      <div class="device-row">
        ${statusBadge(d.online)}
        <div class="device-row-info">
          <div class="device-row-name">${escHtml(d.name)}</div>
          <div class="device-row-meta">ID: ${escHtml(d.id)} &bull; State: ${escHtml(d.current_state)} &bull; Last seen: ${timeAgo(d.last_heartbeat)}</div>
          <div class="device-row-groups">${(d.groups || []).map((g) => `<span class="group-chip">${escHtml(g.name)}</span>`).join('')}</div>
        </div>
        <div class="device-row-actions">
          <button class="btn btn-sm btn-secondary" onclick="openDeviceDetail('${escHtml(d.id)}')">Manage</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    el.innerHTML = '';
    toast(err.message, 'error');
  }
}

async function openDeviceDetail(id) {
  try {
    const [device, groups, content] = await Promise.all([
      GET(`/devices/${id}`),
      GET('/groups'),
      GET('/content'),
    ]);
    const deviceGroups = device.groups.map((g) => g.id);
    const notMember = groups.filter((g) => !deviceGroups.includes(g.id));

    showModal(`Manage Device: ${device.name}`, `
      <div class="form-group">
        <label>Name</label>
        <input id="dev-rename" class="form-control" value="${escHtml(device.name)}" />
      </div>
      <button class="btn btn-primary btn-sm" onclick="renameDevice('${escHtml(id)}')">Save Name</button>
      <hr/>
      <div class="form-group">
        <label>Groups</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
          ${device.groups.map((g) => `
            <span class="group-chip">${escHtml(g.name)}
              <button style="background:none;border:none;cursor:pointer;color:var(--red);margin-left:4px"
                onclick="removeFromGroup('${escHtml(id)}','${escHtml(g.id)}')">✕</button>
            </span>`).join('')}
          ${device.groups.length === 0 ? '<span style="color:var(--text-secondary);font-size:12px">No groups</span>' : ''}
        </div>
        ${notMember.length ? `
          <div style="display:flex;gap:8px">
            <select id="dev-add-group" class="form-control">
              ${notMember.map((g) => `<option value="${escHtml(g.id)}">${escHtml(g.name)}</option>`).join('')}
            </select>
            <button class="btn btn-secondary btn-sm" onclick="addToGroup('${escHtml(id)}')">Add</button>
          </div>` : '<p style="font-size:12px;color:var(--text-secondary)">Member of all groups</p>'}
      </div>
      <hr/>
      <h4 style="margin-bottom:10px">Quick Commands</h4>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-sm btn-secondary" onclick="cmdDevice('${escHtml(id)}','ping');closeModal()">Ping</button>
        <button class="btn btn-sm btn-secondary" onclick="cmdDevice('${escHtml(id)}','reload');closeModal()">Reload</button>
        <button class="btn btn-sm btn-danger" onclick="cmdDevice('${escHtml(id)}','clear-stream');closeModal()">Clear Stream</button>
      </div>
      <hr/>
      <div class="form-group">
        <label>Set Stream URL (override)</label>
        <input id="dev-stream-url" class="form-control" placeholder="https://..." />
      </div>
      <button class="btn btn-primary btn-sm" onclick="setDeviceStream('${escHtml(id)}')">Set Stream</button>
      <hr/>
      <div class="form-group">
        <label>Set Fallback Image (from content)</label>
        <select id="dev-fallback-content" class="form-control">
          ${content.filter((c) => c.type === 'image').map((c) =>
            `<option value="${escHtml(c.file_path || c.url || '')}">${escHtml(c.name)}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="setDeviceFallback('${escHtml(id)}')">Set Fallback</button>
    `);
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function renameDevice(id) {
  const name = document.getElementById('dev-rename').value.trim();
  if (!name) return toast('Name required', 'error');
  try {
    await PATCH(`/devices/${id}`, { name });
    toast('Device renamed', 'success');
    closeModal();
    renderDevices();
  } catch (err) { toast(err.message, 'error'); }
}

async function addToGroup(deviceId) {
  const groupId = document.getElementById('dev-add-group').value;
  try {
    await POST(`/devices/${deviceId}/groups`, { groupId });
    toast('Added to group', 'success');
    openDeviceDetail(deviceId);
  } catch (err) { toast(err.message, 'error'); }
}

async function removeFromGroup(deviceId, groupId) {
  try {
    await DELETE(`/devices/${deviceId}/groups/${groupId}`);
    toast('Removed from group', 'success');
    openDeviceDetail(deviceId);
  } catch (err) { toast(err.message, 'error'); }
}

async function setDeviceStream(id) {
  const url = document.getElementById('dev-stream-url').value.trim();
  if (!url) return toast('URL required', 'error');
  try {
    const res = await POST(`/devices/${id}/stream`, { url });
    toast(`Stream set (${res.sent ? 'delivered' : 'queued'})`, 'success');
    closeModal();
  } catch (err) { toast(err.message, 'error'); }
}

async function setDeviceFallback(id) {
  const path = document.getElementById('dev-fallback-content').value;
  if (!path) return toast('Select an image', 'error');
  try {
    const res = await POST(`/devices/${id}/fallback`, { path });
    toast(`Fallback set (${res.sent ? 'delivered' : 'queued'})`, 'success');
    closeModal();
  } catch (err) { toast(err.message, 'error'); }
}

// ============================================================
// Groups view
// ============================================================
document.getElementById('btn-create-group').addEventListener('click', () => {
  showModal('Create Group', `
    <div class="form-group"><label>Name</label><input id="grp-name" class="form-control" placeholder="Group name" /></div>
    <div class="form-group"><label>Description</label><input id="grp-desc" class="form-control" placeholder="Optional description" /></div>
  `, `
    <button class="btn btn-secondary btn-sm" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary btn-sm" onclick="createGroup()">Create</button>
  `);
});

async function renderGroups() {
  const el = document.getElementById('group-list');
  el.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const groups = await GET('/groups');
    if (groups.length === 0) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">📂</div><p>No groups yet.</p></div>`;
      return;
    }
    const groupDetails = await Promise.all(groups.map((g) => GET(`/groups/${g.id}`)));
    el.innerHTML = groupDetails.map((g) => `
      <div class="group-row">
        <div class="group-row-header">
          <div>
            <div class="group-row-name">${escHtml(g.name)}</div>
            <div class="group-row-meta">${escHtml(g.description || '')} &bull; ${g.devices.length} device(s)</div>
          </div>
          <div class="group-row-actions">
            <button class="btn btn-sm btn-secondary" onclick="openGroupDetail('${escHtml(g.id)}')">Manage</button>
            <button class="btn btn-sm btn-danger" onclick="deleteGroup('${escHtml(g.id)}')">Delete</button>
          </div>
        </div>
        <div class="group-members">
          ${g.devices.length ? g.devices.map((d) => `
            <span class="member-chip">${statusBadge(d.online)} ${escHtml(d.name)}</span>
          `).join('') : '<span style="color:var(--text-secondary);font-size:12px">No members</span>'}
        </div>
      </div>
    `).join('');
  } catch (err) {
    el.innerHTML = '';
    toast(err.message, 'error');
  }
}

async function createGroup() {
  const name = document.getElementById('grp-name').value.trim();
  const description = document.getElementById('grp-desc').value.trim();
  if (!name) return toast('Name required', 'error');
  try {
    await POST('/groups', { name, description });
    toast('Group created', 'success');
    closeModal();
    renderGroups();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteGroup(id) {
  if (!confirm('Delete this group?')) return;
  try {
    await DELETE(`/groups/${id}`);
    toast('Group deleted', 'success');
    renderGroups();
  } catch (err) { toast(err.message, 'error'); }
}

async function openGroupDetail(id) {
  try {
    const [group, content] = await Promise.all([GET(`/groups/${id}`), GET('/content')]);
    const assignment = await GET(`/assignments/group/${id}`).catch(() => null);
    showModal(`Manage Group: ${group.name}`, `
      <div class="form-group">
        <label>Name</label>
        <input id="grp-edit-name" class="form-control" value="${escHtml(group.name)}" />
      </div>
      <div class="form-group">
        <label>Description</label>
        <input id="grp-edit-desc" class="form-control" value="${escHtml(group.description || '')}" />
      </div>
      <button class="btn btn-primary btn-sm" onclick="updateGroup('${escHtml(id)}')">Save</button>
      <hr/>
      <h4 style="margin-bottom:10px">Content Assignment</h4>
      <div style="margin-bottom:8px;font-size:12px;color:var(--text-secondary)">
        Current: ${assignment ? `<strong>${escHtml(assignment.content?.name || assignment.content_id)}</strong>` : '<em>None</em>'}
      </div>
      <div class="form-group">
        <label>Assign Content</label>
        <select id="grp-content" class="form-control">
          <option value="">-- Select content --</option>
          ${content.map((c) => `<option value="${escHtml(c.id)}">${escHtml(c.name)} (${c.type})</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-primary btn-sm" onclick="assignGroupContent('${escHtml(id)}')">Assign</button>
        <button class="btn btn-danger btn-sm" onclick="clearGroupAssignment('${escHtml(id)}')">Clear Assignment</button>
      </div>
    `);
  } catch (err) { toast(err.message, 'error'); }
}

async function updateGroup(id) {
  const name = document.getElementById('grp-edit-name').value.trim();
  const description = document.getElementById('grp-edit-desc').value.trim();
  if (!name) return toast('Name required', 'error');
  try {
    await PATCH(`/groups/${id}`, { name, description });
    toast('Group updated', 'success');
    closeModal();
    renderGroups();
  } catch (err) { toast(err.message, 'error'); }
}

async function assignGroupContent(id) {
  const contentId = document.getElementById('grp-content').value;
  if (!contentId) return toast('Select content', 'error');
  try {
    await POST(`/assignments/group/${id}`, { contentId });
    toast('Content assigned to group', 'success');
    closeModal();
  } catch (err) { toast(err.message, 'error'); }
}

async function clearGroupAssignment(id) {
  try {
    await DELETE(`/assignments/group/${id}`);
    toast('Group assignment cleared', 'success');
    closeModal();
  } catch (err) { toast(err.message, 'error'); }
}

// ============================================================
// Content Library
// ============================================================
document.getElementById('btn-add-stream').addEventListener('click', () => {
  showModal('Add Stream URL', `
    <div class="form-group"><label>Name</label><input id="cnt-name" class="form-control" placeholder="Stream name" /></div>
    <div class="form-group"><label>URL (HLS/m3u8 or direct)</label><input id="cnt-url" class="form-control" placeholder="https://..." /></div>
  `, `
    <button class="btn btn-secondary btn-sm" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary btn-sm" onclick="addStream()">Add Stream</button>
  `);
});

document.getElementById('btn-upload-image').addEventListener('click', () => {
  showModal('Upload Image', `
    <div class="form-group"><label>Name</label><input id="img-name" class="form-control" placeholder="Image name" /></div>
    <div class="form-group"><label>Image File</label><input type="file" id="img-file" class="form-control" accept="image/*" /></div>
  `, `
    <button class="btn btn-secondary btn-sm" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary btn-sm" onclick="uploadImage()">Upload</button>
  `);
});

document.getElementById('btn-upload-video').addEventListener('click', () => {
  showModal('Upload Video', `
    <div class="form-group"><label>Name</label><input id="vid-name" class="form-control" placeholder="Video name" /></div>
    <div class="form-group"><label>Video File</label><input type="file" id="vid-file" class="form-control" accept="video/*" /></div>
    <p style="font-size:12px;color:var(--text-secondary);margin-top:8px">
      After upload, the video will be processed to HLS (if ffmpeg is installed) or served as MP4.
      Processing runs in the background — status shown in the content library.
    </p>
  `, `
    <button class="btn btn-secondary btn-sm" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary btn-sm" onclick="uploadVideo()">Upload</button>
  `);
});

async function renderContent() {
  const el = document.getElementById('content-grid');
  el.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const content = await GET('/content');
    if (content.length === 0) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">🎬</div><p>No content yet. Add a stream, upload an image, or upload a video.</p></div>`;
      return;
    }
    el.innerHTML = content.map((c) => `
      <div class="content-card">
        <div class="content-card-thumb">
          ${c.type === 'image' && c.file_path ? `<img src="${escHtml(c.file_path)}" alt="" />` : (c.type === 'video' ? '🎬' : '📡')}
        </div>
        <div class="content-card-name">${escHtml(c.name)}</div>
        ${typeBadge(c.type)}
        ${c.type === 'video' ? processingBadge(c.processing_status || 'ready') : ''}
        <div class="content-card-url">${escHtml(c.url || c.file_path || '')}</div>
        <div class="content-card-actions">
          <button class="btn btn-sm btn-secondary" onclick="editContent('${escHtml(c.id)}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteContent('${escHtml(c.id)}')">Delete</button>
        </div>
      </div>
    `).join('');
    // Auto-refresh content if any video is still processing
    const processing = content.some((c) => c.type === 'video' && c.processing_status && c.processing_status !== 'ready' && c.processing_status !== 'failed');
    if (processing) {
      setTimeout(() => { if (currentView === 'content') renderContent(); }, 5000);
    }
  } catch (err) {
    el.innerHTML = '';
    toast(err.message, 'error');
  }
}

async function addStream() {
  const name = document.getElementById('cnt-name').value.trim();
  const url = document.getElementById('cnt-url').value.trim();
  if (!name || !url) return toast('Name and URL required', 'error');
  try {
    await POST('/content', { name, type: 'stream', url, metadata: {} });
    toast('Stream added', 'success');
    closeModal();
    renderContent();
  } catch (err) { toast(err.message, 'error'); }
}

async function uploadImage() {
  const nameEl = document.getElementById('img-name');
  const fileEl = document.getElementById('img-file');
  if (!fileEl.files[0]) return toast('Select a file', 'error');
  const fd = new FormData();
  fd.append('file', fileEl.files[0]);
  fd.append('name', nameEl.value.trim() || fileEl.files[0].name);
  try {
    const res = await fetch('/api/content/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      body: fd,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    toast('Image uploaded', 'success');
    closeModal();
    renderContent();
  } catch (err) { toast(err.message, 'error'); }
}

async function uploadVideo() {
  const nameEl = document.getElementById('vid-name');
  const fileEl = document.getElementById('vid-file');
  if (!fileEl.files[0]) return toast('Select a file', 'error');
  const fd = new FormData();
  fd.append('file', fileEl.files[0]);
  fd.append('name', nameEl.value.trim() || fileEl.files[0].name);
  try {
    const res = await fetch('/api/content/upload-video', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      body: fd,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    toast('Video uploaded — processing started', 'success');
    closeModal();
    renderContent();
  } catch (err) { toast(err.message, 'error'); }
}

async function editContent(id) {
  const c = await GET(`/content/${id}`).catch(() => null);
  if (!c) return toast('Content not found', 'error');
  showModal(`Edit: ${c.name}`, `
    <div class="form-group"><label>Name</label><input id="cnt-edit-name" class="form-control" value="${escHtml(c.name)}" /></div>
    ${c.type === 'stream' ? `
    <div class="form-group"><label>URL</label><input id="cnt-edit-url" class="form-control" value="${escHtml(c.url || '')}" /></div>
    ` : c.type === 'video' ? `
    <p style="font-size:12px;color:var(--text-secondary)">
      File: ${escHtml(c.file_path || '')}${c.url ? `<br>Stream URL: ${escHtml(c.url)}` : ''}<br>
      Status: ${processingBadge(c.processing_status || 'ready')}
    </p>
    ` : `<p style="font-size:12px;color:var(--text-secondary)">File: ${escHtml(c.file_path || '')}</p>`}
  `, `
    <button class="btn btn-secondary btn-sm" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary btn-sm" onclick="saveContent('${escHtml(id)}','${c.type}')">Save</button>
  `);
}

async function saveContent(id, type) {
  const name = document.getElementById('cnt-edit-name').value.trim();
  const url = type === 'stream' ? document.getElementById('cnt-edit-url').value.trim() : undefined;
  if (!name) return toast('Name required', 'error');
  try {
    await PATCH(`/content/${id}`, { name, url });
    toast('Content updated', 'success');
    closeModal();
    renderContent();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteContent(id) {
  if (!confirm('Delete this content? Any assignments using it will also be removed.')) return;
  try {
    await DELETE(`/content/${id}`);
    toast('Content deleted', 'success');
    renderContent();
  } catch (err) { toast(err.message, 'error'); }
}

// ============================================================
// Live Control
// ============================================================
async function renderControl() {
  try {
    const [devices, groups] = await Promise.all([GET('/devices'), GET('/groups')]);

    const typeSelect = document.getElementById('ctrl-target-type');
    const idSelect = document.getElementById('ctrl-target-id');
    const selectorDiv = document.getElementById('ctrl-target-selector');
    const label = document.getElementById('ctrl-target-label');

    function updateTargetSelector() {
      const type = typeSelect.value;
      if (type === 'all') {
        selectorDiv.style.display = 'none';
        return;
      }
      selectorDiv.style.display = '';
      label.textContent = type === 'device' ? 'Device' : 'Group';
      const items = type === 'device' ? devices : groups;
      idSelect.innerHTML = items.map((i) => `<option value="${escHtml(i.id)}">${escHtml(i.name)}</option>`).join('');
    }

    if (controlHandlers.has('targetType')) {
      typeSelect.removeEventListener('change', controlHandlers.get('targetType'));
    }
    controlHandlers.set('targetType', updateTargetSelector);
    typeSelect.addEventListener('change', updateTargetSelector);
    updateTargetSelector();

    const cmdSelect = document.getElementById('ctrl-command');
    const urlGroup = document.getElementById('ctrl-url-group');
    const pathGroup = document.getElementById('ctrl-path-group');

    function updateCommandFields() {
      const cmd = cmdSelect.value;
      urlGroup.style.display = cmd === 'SET_STREAM_URL' ? '' : 'none';
      pathGroup.style.display = cmd === 'SET_FALLBACK_IMAGE' ? '' : 'none';
    }

    if (controlHandlers.has('cmdType')) {
      cmdSelect.removeEventListener('change', controlHandlers.get('cmdType'));
    }
    controlHandlers.set('cmdType', updateCommandFields);
    cmdSelect.addEventListener('change', updateCommandFields);
    updateCommandFields();
  } catch (err) {
    toast(err.message, 'error');
  }
}

document.getElementById('btn-send-command').addEventListener('click', async () => {
  const type = document.getElementById('ctrl-target-type').value;
  const command = document.getElementById('ctrl-command').value;
  const payload = {};
  if (command === 'SET_STREAM_URL') payload.url = document.getElementById('ctrl-url').value.trim();
  if (command === 'SET_FALLBACK_IMAGE') payload.path = document.getElementById('ctrl-path').value.trim();

  try {
    let res;
    if (type === 'all') {
      res = await POST('/control/broadcast', { command, payload });
    } else {
      const id = document.getElementById('ctrl-target-id').value;
      res = await POST(`/control/${type}/${id}`, { command, payload });
    }
    toast(`Command sent → ${res.sent} device(s)`, 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
});

// ============================================================
// Bootstrap
// ============================================================
ensureToken();
showView('dashboard');
