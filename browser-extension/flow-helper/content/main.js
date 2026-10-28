// Wires the pieces together on a Flow page: scanning, auto-download,
// download actions and the messages from the service worker.
(async function () {
  'use strict';
  const FH = self.FH;
  if (window.__flowHelperLoaded) return;
  window.__flowHelperLoaded = true;

  let settings = await FH.getSettings();
  const panel = (FH.panel = new FH.Panel());
  await panel.init(settings);

  FH.projectName = function () {
    let t = document.title.replace(/\s*[-|–—]\s*(Google\s+)?(Labs\s+)?Flow\b.*$/i, '').trim();
    if (!t || /^(google\s+)?(labs\s+)?flow$/i.test(t)) {
      const m = location.pathname.match(/project\/([^/?#]+)/);
      t = m ? 'proyek-' + m[1].slice(0, 8) : 'flow';
    }
    return FH.cleanSegment(t) || 'flow';
  };

  // Running numbers per project and day, so auto-downloaded files keep
  // counting up instead of all being 001.
  async function takeSeq(project, count) {
    const k = project + '|' + FH.today();
    const { seq = {} } = await chrome.storage.local.get('seq');
    const start = (seq[k] || 0) + 1;
    seq[k] = start + count - 1;
    for (const key of Object.keys(seq)) if (!key.endsWith(FH.today())) delete seq[key];
    await chrome.storage.local.set({ seq });
    return start;
  }

  FH.actions = {
    async download(items, opts = {}) {
      if (!items.length) return { error: 'Tidak ada gambar.' };
      const s = settings;
      const project = FH.projectName();
      const date = new Date();
      const zip = !!opts.zip && items.length > 0;
      const first = opts.quiet || opts.auto ? await takeSeq(project, items.length) : 1;
      const jobItems = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const prompt = it.el ? FH.scanner.promptFor(it) : '';
        const name = FH.buildName(s.nameTemplate, {
          n: first + i,
          prompt,
          project,
          date,
          w: it.w,
          h: it.h,
          key: it.key,
          type: it.type,
          folder: zip ? '' : s.folder,
          promptMaxLen: s.promptMaxLen
        });
        let url = it.url;
        try {
          url = (await FH.scanner.toPortable(url)).url;
        } catch (e) {
          /* the service worker reports what it cannot fetch */
        }
        jobItems.push({
          key: it.key,
          url,
          fallbackUrl: it.thumb && it.thumb !== it.url && !it.thumb.startsWith('blob:') ? it.thumb : '',
          name,
          prompt,
          type: it.type,
          w: it.w,
          h: it.h
        });
      }
      const job = {
        id: FH.uid(),
        kind: 'download',
        items: jobItems,
        zip,
        zipName: FH.cleanPath(`${s.folder}/${project}_${FH.today(date)}_${FH.timeStamp(date)}.zip`),
        format: s.format,
        quality: s.quality,
        saveManifest: s.saveManifest,
        savePromptTxt: s.savePromptTxt,
        quiet: !!opts.quiet
      };
      return chrome.runtime.sendMessage({ type: 'job', job });
    },

    async contactSheet(items) {
      const s = settings;
      const project = FH.projectName();
      const date = new Date();
      const job = {
        id: FH.uid(),
        kind: 'sheet',
        title: `${project} · ${FH.today(date)} · ${items.length} gambar`,
        columns: s.sheetColumns,
        captions: s.sheetCaptions,
        filename: FH.cleanPath(`${s.folder}/${project}/lembar-kontak_${FH.today(date)}_${FH.timeStamp(date)}.png`),
        items: []
      };
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        let url = it.url;
        try {
          url = (await FH.scanner.toPortable(url)).url;
        } catch (e) {
          /* reported by the sheet builder */
        }
        job.items.push({
          url,
          fallbackUrl: it.thumb && !it.thumb.startsWith('blob:') ? it.thumb : '',
          label: String(i + 1).padStart(3, '0'),
          caption: FH.scanner.promptFor(it)
        });
      }
      return chrome.runtime.sendMessage({ type: 'job', job });
    }
  };

  // ---------- scanning ----------

  let autoSeen = null; // keys that existed before auto-download was on
  const autoPending = new Map();

  function rescan() {
    const items = FH.scanner.scan(settings);
    panel.setItems(items);
    chrome.runtime.sendMessage({ type: 'count', count: items.length }).catch(() => {});
    handleAuto(items);
    return items;
  }
  FH.rescan = rescan;

  function handleAuto(items) {
    if (!settings.autoDownload) {
      autoSeen = null;
      return;
    }
    if (!autoSeen) {
      // Only what appears from now on: switching it on must not download
      // a whole project in one go.
      autoSeen = new Set(items.map((i) => i.key));
      return;
    }
    for (const it of items) {
      if (autoSeen.has(it.key)) continue;
      autoSeen.add(it.key);
      if (panel.downloaded[it.key] || autoPending.has(it.key)) continue;
      // A finished picture can be swapped once more for its final
      // version; give it a moment to settle.
      autoPending.set(
        it.key,
        setTimeout(() => {
          autoPending.delete(it.key);
          const current = panel.items.find((i) => i.key === it.key);
          if (current && !panel.downloaded[it.key]) FH.actions.download([current], { quiet: true, auto: true });
        }, 1500)
      );
    }
  }

  let scanTimer = null;
  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      rescan();
    }, 400);
  }

  new MutationObserver((records) => {
    for (const r of records) {
      // Our own shadow root changes all the time; it is not Flow's content.
      if (r.target.id === 'flow-helper-root') continue;
      scheduleScan();
      return;
    }
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'srcset', 'style', 'poster']
  });
  // Images that finish loading change size without changing the DOM.
  document.addEventListener('load', (e) => e.target.tagName === 'IMG' && scheduleScan(), true);
  setInterval(scheduleScan, 4000);
  rescan();

  // ---------- prompt history ----------

  FH.onPromptSent = async function (text) {
    const { history = [] } = await chrome.storage.local.get('history');
    if (history[0] && history[0].text === text) return;
    history.unshift({ text, t: Date.now() });
    history.length = Math.min(history.length, FH.Panel.HISTORY_LIMIT);
    await chrome.storage.local.set({ history });
    chrome.runtime.sendMessage({ type: 'stat', field: 'prompts' }).catch(() => {});
  };
  FH.flow.watchSubmissions((text) => FH.onPromptSent(text));

  // ---------- settings & messages ----------

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) {
      const prev = settings;
      settings = Object.assign({}, FH.DEFAULTS, changes.settings.newValue || {});
      panel.applySettings(settings);
      if (prev.minSize !== settings.minSize || prev.includeVideos !== settings.includeVideos || prev.reverseOrder !== settings.reverseOrder || prev.autoDownload !== settings.autoDownload) {
        rescan();
      }
    }
  });

  function findBySrc(src) {
    const key = FH.scanner.keyFor(FH.scanner.upgradeUrl(src));
    return panel.items.find((i) => i.key === key || i.thumb === src || i.url === src);
  }

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    switch (msg.type) {
      case 'toggle-panel':
        panel.toggle();
        break;
      case 'show-panel':
        panel.setOpen(true);
        break;
      case 'download-selected':
      case 'download-zip':
        rescan();
        panel.doDownload(msg.type === 'download-zip');
        break;
      case 'context-download': {
        const item = findBySrc(msg.srcUrl) || {
          type: 'image',
          url: FH.scanner.upgradeUrl(msg.srcUrl),
          thumb: msg.srcUrl,
          key: FH.scanner.keyFor(msg.srcUrl),
          w: 0,
          h: 0
        };
        FH.actions.download([item], { quiet: true }).then(() => panel.toast('Mengunduh…'));
        break;
      }
      case 'add-library':
        panel.addToLibrary(msg.text);
        break;
      case 'add-queue':
        panel.addToQueue(msg.text);
        break;
      case 'job-progress':
        panel.onJobProgress(msg);
        break;
      case 'get-status':
        reply({
          ok: true,
          count: panel.items.length,
          selected: panel.selected.size,
          project: FH.projectName(),
          queue: { state: FH.queue.state, index: FH.queue.index, total: FH.queue.items.length }
        });
        break;
    }
  });
})();
