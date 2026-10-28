// Service worker: owns the downloads API, the offscreen worker document,
// context menus, keyboard commands, notifications and statistics.
importScripts('lib/common.js');

const OFFSCREEN_URL = 'offscreen/offscreen.html';
const FLOW_URL = 'https://labs.google/fx/tools/flow';
const FLOW_PATTERNS = ['https://labs.google/fx/*'];

// ---------- offscreen worker ----------

let offscreenReady = null;
let resolveReady = null;

async function hasOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  return contexts.length > 0;
}

async function ensureOffscreen() {
  if (await hasOffscreen()) {
    if (offscreenReady) await offscreenReady;
    return;
  }
  if (!offscreenReady) {
    offscreenReady = new Promise((resolve) => {
      resolveReady = resolve;
      // A document that loaded before this worker restarted never says
      // hello again; do not wait on it forever.
      setTimeout(resolve, 3000);
    });
    try {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_URL,
        reasons: ['BLOBS'],
        justification: 'Mengambil, mengonversi dan membungkus gambar Flow menjadi file/ZIP sebelum diunduh.'
      });
    } catch (e) {
      if (!/single offscreen/i.test(e.message)) {
        offscreenReady = null;
        throw e;
      }
    }
  }
  await offscreenReady;
}

async function closeOffscreenIfIdle() {
  if (jobs.size) return;
  const prefix = `blob:chrome-extension://${chrome.runtime.id}/`;
  const running = await chrome.downloads.search({ state: 'in_progress' });
  if (running.some((d) => (d.url || '').startsWith(prefix))) return;
  if (await hasOffscreen()) {
    await chrome.offscreen.closeDocument().catch(() => {});
    offscreenReady = null;
  }
}

// ---------- jobs ----------

// jobId -> { tabId, quiet }
const jobs = new Map();
// downloadId -> { blobUrl, keys, jobId }, mirrored to session storage so a
// restarted worker still knows what finished.
const tracked = new Map();

async function saveTracked() {
  await chrome.storage.session.set({ tracked: [...tracked] });
}

async function loadTracked() {
  const { tracked: saved } = await chrome.storage.session.get('tracked');
  for (const [id, v] of saved || []) tracked.set(id, v);
}
const trackedLoaded = loadTracked();

function toTab(jobId, payload) {
  const job = jobs.get(jobId);
  if (!job || job.tabId == null) return;
  chrome.tabs.sendMessage(job.tabId, Object.assign({}, payload, { type: 'job-progress', target: undefined, jobId, quiet: job.quiet })).catch(() => {});
}

async function startJob(job, tabId) {
  jobs.set(job.id, { tabId, quiet: !!job.quiet });
  await ensureOffscreen();
  await chrome.runtime.sendMessage({ target: 'offscreen', type: 'job', job });
}

async function downloadFile(msg) {
  await trackedLoaded;
  let id;
  try {
    id = await chrome.downloads.download({ url: msg.url, filename: msg.filename, conflictAction: 'uniquify', saveAs: false });
  } catch (e) {
    // A name the OS refused: keep the extension, drop the rest.
    const ext = (/\.[a-z0-9]{2,5}$/i.exec(msg.filename) || ['.bin'])[0];
    id = await chrome.downloads.download({ url: msg.url, filename: `Flow/flow-${FH.uid()}${ext}`, conflictAction: 'uniquify', saveAs: false });
  }
  tracked.set(id, { blobUrl: msg.blob ? msg.url : null, keys: msg.keys || [], jobId: msg.jobId, aux: !!msg.aux });
  await saveTracked();
}

// Downloads finish together; their storage writes must not overlap.
let markChain = Promise.resolve();
function markDownloaded(keys) {
  if (!keys.length) return markChain;
  markChain = markChain.then(() => writeDownloaded(keys)).catch(() => {});
  return markChain;
}

async function writeDownloaded(keys) {
  const { downloaded = {} } = await chrome.storage.local.get('downloaded');
  const now = Date.now();
  for (const k of keys) downloaded[k] = now;
  const entries = Object.entries(downloaded);
  if (entries.length > 5000) {
    entries.sort((a, b) => b[1] - a[1]);
    entries.length = 5000;
    await chrome.storage.local.set({ downloaded: Object.fromEntries(entries) });
  } else {
    await chrome.storage.local.set({ downloaded });
  }
}

// Statistics are written from one place, one at a time.
let statChain = Promise.resolve();
function bumpStat(field, by) {
  statChain = statChain.then(() => FH.bumpStat(field, by)).catch(() => {});
  return statChain;
}

chrome.downloads.onChanged.addListener(async (delta) => {
  if (!delta.state || delta.state.current === 'in_progress') return;
  await trackedLoaded;
  const t = tracked.get(delta.id);
  if (!t) return;
  tracked.delete(delta.id);
  await saveTracked();
  if (t.blobUrl) chrome.runtime.sendMessage({ target: 'offscreen', type: 'revoke', url: t.blobUrl }).catch(() => {});
  if (delta.state.current === 'complete') {
    await markDownloaded(t.keys);
    if (t.keys.length) bumpStat('downloads', t.keys.length);
  }
  closeOffscreenIfIdle();
});

// ---------- messages ----------

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.target === 'offscreen') return;

  if (msg.target === 'background') {
    switch (msg.type) {
      case 'offscreen-ready':
        if (resolveReady) resolveReady();
        break;
      case 'file':
        downloadFile(msg).catch((e) => toTab(msg.jobId, { phase: 'done', ok: false, failed: 1, message: 'Gagal menyimpan: ' + e.message }));
        break;
      case 'progress':
        toTab(msg.jobId, msg);
        break;
      case 'done':
        toTab(msg.jobId, Object.assign({}, msg, { phase: 'done' }));
        jobs.delete(msg.jobId);
        setTimeout(closeOffscreenIfIdle, 2000);
        break;
    }
    return;
  }

  switch (msg.type) {
    case 'job':
      startJob(msg.job, sender.tab && sender.tab.id).then(
        () => reply({ ok: true, jobId: msg.job.id }),
        (e) => {
          jobs.delete(msg.job.id);
          reply({ error: e.message });
        }
      );
      return true;
    case 'count':
      if (sender.tab) {
        chrome.action.setBadgeText({ tabId: sender.tab.id, text: msg.count ? String(Math.min(msg.count, 999)) : '' });
        chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: '#3367d6' });
      }
      break;
    case 'stat':
      bumpStat(msg.field, msg.by);
      break;
    case 'notify':
      chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon128.png', title: msg.title, message: msg.message || '' });
      break;
    case 'open-options':
      chrome.runtime.openOptionsPage();
      break;
    case 'open-flow':
      chrome.tabs.create({ url: FLOW_URL });
      break;
  }
});

// ---------- context menus & commands ----------

chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings) await chrome.storage.local.set({ settings: FH.DEFAULTS });
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'fh-download-image', title: 'Unduh gambar ini (Flow Helper)', contexts: ['image'], documentUrlPatterns: FLOW_PATTERNS });
    chrome.contextMenus.create({ id: 'fh-save-prompt', title: 'Simpan "%s" ke Pustaka Prompt', contexts: ['selection'], documentUrlPatterns: FLOW_PATTERNS });
    chrome.contextMenus.create({ id: 'fh-queue-prompt', title: 'Tambahkan "%s" ke Antrean', contexts: ['selection'], documentUrlPatterns: FLOW_PATTERNS });
    chrome.contextMenus.create({ id: 'fh-toggle-panel', title: 'Tampilkan / sembunyikan Flow Helper', contexts: ['page'], documentUrlPatterns: FLOW_PATTERNS });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || tab.id == null) return;
  const send = (m) => chrome.tabs.sendMessage(tab.id, m).catch(() => {});
  switch (info.menuItemId) {
    case 'fh-download-image':
      send({ type: 'context-download', srcUrl: info.srcUrl });
      break;
    case 'fh-save-prompt':
      send({ type: 'add-library', text: info.selectionText });
      break;
    case 'fh-queue-prompt':
      send({ type: 'add-queue', text: info.selectionText });
      break;
    case 'fh-toggle-panel':
      send({ type: 'toggle-panel' });
      break;
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  tab = tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!tab || !/^https:\/\/labs\.google\/fx\//.test(tab.url || '')) return;
  chrome.tabs.sendMessage(tab.id, { type: command }).catch(() => {});
});
