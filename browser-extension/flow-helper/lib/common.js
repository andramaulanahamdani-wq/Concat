// Shared by the content script, popup, options page and service worker:
// default settings, storage helpers, file naming and prompt expansion.
(function (root) {
  'use strict';
  const FH = (root.FH = root.FH || {});

  FH.DEFAULTS = {
    // Downloads
    folder: 'Flow',
    nameTemplate: '{project}/{date}_{n}_{prompt}',
    format: 'original', // original | png | jpg | webp
    quality: 0.92,
    minSize: 256,
    includeVideos: false,
    reverseOrder: false,
    saveManifest: true,
    savePromptTxt: false,
    skipDownloaded: true,
    promptMaxLen: 60,
    // Page helpers
    autoDownload: false,
    showTileButtons: true,
    panelOpen: false,
    panelSide: 'right',
    fabPos: null,
    // Prompt queue
    queueDelay: 15,
    queueWaitForResult: true,
    queueMaxWait: 180,
    queueRepeat: 1,
    notifyDone: true,
    // Contact sheet
    sheetColumns: 4,
    sheetCaptions: true,
    stylePresets: [
      { name: 'Sinematik', text: 'cinematic lighting, shallow depth of field, 35mm film grain' },
      { name: 'Horor', text: 'dark eerie atmosphere, low key lighting, fog, unsettling mood' },
      { name: 'Anime', text: 'anime style, clean line art, vibrant colors' },
      { name: 'Fotoreal', text: 'photorealistic, ultra detailed, natural lighting, 8k' },
      { name: 'Vertikal 9:16', text: 'vertical 9:16 composition' },
      { name: 'Latar hijau', text: 'isolated on a flat chroma key green background' }
    ]
  };

  FH.getSettings = async function () {
    const { settings } = await chrome.storage.local.get('settings');
    return Object.assign({}, FH.DEFAULTS, settings || {});
  };

  FH.saveSettings = async function (patch) {
    const current = await FH.getSettings();
    const next = Object.assign(current, patch);
    await chrome.storage.local.set({ settings: next });
    return next;
  };

  FH.today = function (d) {
    d = d || new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  FH.timeStamp = function (d) {
    d = d || new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  };

  // A short, stable id for a media key, used by {id} in names.
  FH.shortHash = function (str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36).padStart(7, '0').slice(0, 7);
  };

  FH.slug = function (text, maxLen) {
    if (!text) return '';
    let s = String(text)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    if (maxLen && s.length > maxLen) s = s.slice(0, maxLen).replace(/-[^-]*$/, '') || s.slice(0, maxLen);
    return s;
  };

  // One path segment that every OS accepts.
  FH.cleanSegment = function (seg) {
    return String(seg)
      .replace(/[<>:"\\|?*\u0000-\u001f]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/^[\s.]+|[\s.]+$/g, '')
      .slice(0, 120);
  };

  FH.cleanPath = function (path) {
    const segs = String(path)
      .split('/')
      .map(FH.cleanSegment)
      .filter((s) => s && s !== '..');
    return segs.join('/');
  };

  // Fills the name template for one item. The extension is added later,
  // once the real file type is known.
  FH.buildName = function (template, ctx) {
    const d = ctx.date || new Date();
    const vals = {
      n: String(ctx.n || 1).padStart(3, '0'),
      prompt: FH.slug(ctx.prompt, ctx.promptMaxLen || 60) || 'flow',
      project: ctx.project || 'flow',
      date: FH.today(d),
      time: FH.timeStamp(d),
      w: ctx.w || 0,
      h: ctx.h || 0,
      id: FH.shortHash(ctx.key || ctx.url || String(Math.random())),
      type: ctx.type || 'image'
    };
    const filled = String(template || FH.DEFAULTS.nameTemplate).replace(/\{(\w+)\}/g, (m, k) =>
      Object.prototype.hasOwnProperty.call(vals, k) ? String(vals[k]) : m
    );
    const prefix = ctx.folder ? ctx.folder + '/' : '';
    return FH.cleanPath(prefix + filled) || 'Flow/flow-' + vals.id;
  };

  // "a {red|blue} car in {rain|snow}" -> four prompts. Braces without a
  // "|" are left as they are.
  FH.expandVariants = function (text, limit) {
    limit = limit || 500;
    const m = /\{([^{}]*\|[^{}]*)\}/.exec(text);
    if (!m) return [text];
    const out = [];
    for (const opt of m[1].split('|')) {
      const next = text.slice(0, m.index) + opt.trim() + text.slice(m.index + m[0].length);
      for (const v of FH.expandVariants(next, limit)) {
        out.push(v.replace(/\s{2,}/g, ' ').trim());
        if (out.length >= limit) return out;
      }
    }
    return out;
  };

  // Queue text -> prompts. Blank-line separated blocks when there are any
  // (so a prompt can span lines), otherwise one prompt per line. Lines
  // starting with "#" are comments.
  FH.parsePromptList = function (raw) {
    const lines = String(raw || '').replace(/\r/g, '').split('\n').filter((l) => !/^\s*#/.test(l));
    const text = lines.join('\n').trim();
    if (!text) return [];
    const blocks = /\n\s*\n/.test(text) ? text.split(/\n\s*\n/) : text.split('\n');
    return blocks.map((b) => b.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
  };

  FH.bumpStat = async function (field, by) {
    const { stats } = await chrome.storage.local.get('stats');
    const s = stats || { days: {}, total: {} };
    const day = FH.today();
    s.days[day] = s.days[day] || {};
    s.days[day][field] = (s.days[day][field] || 0) + (by || 1);
    s.total[field] = (s.total[field] || 0) + (by || 1);
    // Keep 60 days of history.
    const keys = Object.keys(s.days).sort();
    while (keys.length > 60) delete s.days[keys.shift()];
    await chrome.storage.local.set({ stats: s });
  };

  FH.uid = function () {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  };
})(typeof self !== 'undefined' ? self : this);
