// The in-page interface: floating button, side panel (download grid,
// prompt queue, prompt library, settings), controls drawn over Flow's own
// tiles, a lightbox and toasts. Everything lives in one shadow root so
// Flow's styles and ours never meet, and Flow's DOM is never touched.
(function () {
  'use strict';
  const FH = self.FH;

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (typeof v !== 'string' && k in el) el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  const LIB_LIMIT = 2000;
  const HISTORY_LIMIT = 300;

  class Panel {
    constructor() {
      this.items = [];
      this.selected = new Set();
      this.downloaded = {};
      this.filter = 'all';
      this.tab = 'download';
      this.libView = 'saved';
      this.libQuery = '';
      this.library = [];
      this.history = [];
      this.queueStyles = new Set();
      this.lastIndex = -1;
      this.hoverKey = null;
      this.tileNodes = new Map();
    }

    async init(settings) {
      this.settings = settings;
      const host = h('div', { id: 'flow-helper-root' });
      host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483646;visibility:hidden;';
      document.documentElement.append(host);
      const root = (this.root = host.attachShadow({ mode: 'open' }));
      const css = h('link', { rel: 'stylesheet', href: chrome.runtime.getURL('content/panel.css') });
      css.addEventListener('load', () => (host.style.visibility = 'visible'));
      root.append(css);

      this.overlay = h('div', { class: 'overlay' });
      this.toasts = h('div', { class: 'toasts' });
      root.append(this.overlay, this.buildFab(), this.buildPanel(), this.buildLightbox(), this.toasts);

      const data = await chrome.storage.local.get(['downloaded', 'library', 'history', 'pendingQueue', 'queueDraft']);
      this.downloaded = data.downloaded || {};
      this.library = data.library || [];
      this.history = data.history || [];
      if (data.queueDraft) this.qText.value = data.queueDraft;
      this.showPending(data.pendingQueue);
      this.updateQueuePreview();
      this.renderLibrary();

      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.downloaded) {
          this.downloaded = changes.downloaded.newValue || {};
          this.renderGrid();
          this.scheduleOverlay();
        }
        if (changes.library) {
          this.library = changes.library.newValue || [];
          this.renderLibrary();
        }
        if (changes.history) {
          this.history = changes.history.newValue || [];
          if (this.libView === 'history') this.renderLibrary();
        }
      });

      FH.queue.on(() => this.renderQueue());
      this.renderQueue();

      const onMove = () => this.scheduleOverlay();
      window.addEventListener('scroll', onMove, { capture: true, passive: true });
      window.addEventListener('resize', onMove, { passive: true });
      document.addEventListener('mousemove', (e) => this.onMouseMove(e), { passive: true });
      document.addEventListener('keydown', (e) => this.onKey(e), true);

      this.panel.classList.toggle('left', settings.panelSide === 'left');
      this.setOpen(!!settings.panelOpen, false);
    }

    // ---------- shared bits ----------

    toast(text, isError) {
      const t = h('div', { class: 'toast' + (isError ? ' err' : '') }, text);
      this.toasts.append(t);
      setTimeout(() => t.remove(), isError ? 6000 : 3200);
    }

    async copy(text) {
      try {
        await navigator.clipboard.writeText(text);
        this.toast('Disalin ke clipboard.');
      } catch (e) {
        const ta = h('textarea', {}, text);
        this.root.append(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        this.toast('Disalin ke clipboard.');
      }
    }

    applySettings(settings) {
      this.settings = settings;
      this.fabAuto.hidden = !settings.autoDownload;
      this.autoSwitch.checked = !!settings.autoDownload;
      this.qDelay.value = settings.queueDelay;
      this.qRepeat.value = settings.queueRepeat;
      this.qWait.checked = !!settings.queueWaitForResult;
      this.renderStyleChips();
      this.panel.classList.toggle('left', settings.panelSide === 'left');
      if (this.tab === 'settings' && !this.root.activeElement) this.renderSettings();
      this.scheduleOverlay();
    }

    // ---------- floating button & frame ----------

    buildFab() {
      this.fabBadge = h('span', { class: 'badge', hidden: true });
      this.fabAuto = h('span', { class: 'auto-dot', title: 'Auto-unduh aktif', hidden: !this.settings.autoDownload });
      this.fab = h(
        'button',
        {
          class: 'fab',
          title: 'Flow Helper (Alt+Shift+F) · seret untuk memindahkan',
          onclick: () => {
            if (!this.fabDragged) this.toggle();
          }
        },
        h('img', { src: chrome.runtime.getURL('icons/icon48.png'), alt: '', draggable: false }),
        this.fabBadge,
        this.fabAuto
      );
      this.placeFab(this.settings.fabPos);
      this.fab.addEventListener('pointerdown', (e) => this.dragFab(e));
      return this.fab;
    }

    placeFab(pos) {
      pos = pos || { right: 20, bottom: 20 };
      const right = Math.min(Math.max(4, pos.right), innerWidth - 52);
      const bottom = Math.min(Math.max(4, pos.bottom), innerHeight - 52);
      Object.assign(this.fab.style, { right: right + 'px', bottom: bottom + 'px' });
    }

    // The button can sit on top of something Flow needs; let it be moved.
    dragFab(e) {
      if (e.button !== 0) return;
      const start = { x: e.clientX, y: e.clientY };
      const rect = this.fab.getBoundingClientRect();
      const origin = { right: innerWidth - rect.right, bottom: innerHeight - rect.bottom };
      let pos = null;
      this.fabDragged = false;
      const move = (ev) => {
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        if (!this.fabDragged && Math.hypot(dx, dy) < 5) return;
        this.fabDragged = true;
        pos = { right: origin.right - dx, bottom: origin.bottom - dy };
        this.placeFab(pos);
      };
      const up = () => {
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', up, true);
        if (pos) FH.saveSettings({ fabPos: pos });
        // The click that follows a drag must not open the panel.
        setTimeout(() => (this.fabDragged = false), 0);
      };
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', up, true);
    }

    buildPanel() {
      const tabs = [
        ['download', 'Unduh'],
        ['queue', 'Antrean'],
        ['library', 'Pustaka'],
        ['settings', 'Atur']
      ];
      this.tabButtons = {};
      this.sections = {};
      const nav = h(
        'nav',
        {},
        tabs.map(([id, label]) => (this.tabButtons[id] = h('button', { onclick: () => this.setTab(id) }, label)))
      );
      this.panel = h(
        'aside',
        { class: 'panel', hidden: true },
        h(
          'header',
          {},
          h('img', { src: chrome.runtime.getURL('icons/icon48.png'), alt: '' }),
          h('div', { class: 'title' }, 'Flow Helper'),
          h(
            'button',
            {
              class: 'icon-btn',
              title: 'Pindah ke sisi lain layar',
              onclick: () => FH.saveSettings({ panelSide: this.panel.classList.contains('left') ? 'right' : 'left' })
            },
            '⇆'
          ),
          h('button', { class: 'icon-btn', title: 'Tutup (Esc)', onclick: () => this.setOpen(false) }, '✕')
        ),
        nav,
        (this.sections.download = this.buildDownloadTab()),
        (this.sections.queue = this.buildQueueTab()),
        (this.sections.library = this.buildLibraryTab()),
        (this.sections.settings = h('section', { class: 'tab' }, (this.settingsBox = h('div', { class: 'scroll' }))))
      );
      this.setTab('download');
      return this.panel;
    }

    setTab(id) {
      this.tab = id;
      for (const [k, b] of Object.entries(this.tabButtons)) b.classList.toggle('active', k === id);
      for (const [k, s] of Object.entries(this.sections)) s.classList.toggle('active', k === id);
      if (id === 'settings') this.renderSettings();
      if (id === 'library') this.renderLibrary();
    }

    setOpen(open, remember = true) {
      this.panel.hidden = !open;
      if (open) {
        FH.rescan && FH.rescan();
        this.renderGrid();
      }
      if (remember) FH.saveSettings({ panelOpen: open });
    }

    toggle() {
      this.setOpen(this.panel.hidden);
    }

    // ---------- download tab ----------

    buildDownloadTab() {
      this.summary = h('span', { class: 'muted small' });
      this.filterSelect = h(
        'select',
        {
          onchange: () => {
            this.filter = this.filterSelect.value;
            this.renderGrid();
          }
        },
        h('option', { value: 'all' }, 'Semua'),
        h('option', { value: 'new' }, 'Belum diunduh'),
        h('option', { value: 'image' }, 'Gambar saja'),
        h('option', { value: 'video' }, 'Video saja')
      );
      this.autoSwitch = h('input', {
        type: 'checkbox',
        checked: !!this.settings.autoDownload,
        onchange: () => {
          FH.saveSettings({ autoDownload: this.autoSwitch.checked });
          this.toast(this.autoSwitch.checked ? 'Auto-unduh aktif untuk hasil baru.' : 'Auto-unduh dimatikan.');
        }
      });
      this.grid = h('div', { class: 'grid' });
      this.gridEmpty = h(
        'div',
        { class: 'empty' },
        'Belum ada gambar terdeteksi.',
        h('br'),
        'Buka proyek Flow dan tunggu hasilnya tampil, lalu tekan ⟳.'
      );
      this.progressBar = h('div');
      this.progressText = h('span', { class: 'muted small' });
      this.progressRow = h('div', { hidden: true }, h('div', { class: 'progress' }, this.progressBar), this.progressText);

      this.btnDownload = h('button', { class: 'btn primary', onclick: () => this.doDownload(false) }, 'Unduh');
      this.btnZip = h('button', { class: 'btn', onclick: () => this.doDownload(true) }, 'ZIP');
      this.btnSheet = h(
        'button',
        { class: 'btn', title: 'Gabungkan menjadi satu gambar grid bernomor', onclick: () => this.doSheet() },
        'Lembar kontak'
      );
      this.btnCopy = h('button', { class: 'btn', title: 'Salin prompt gambar terpilih', onclick: () => this.doCopyPrompts() }, 'Salin prompt');

      return h(
        'section',
        { class: 'tab' },
        h(
          'div',
          { class: 'scroll' },
          h(
            'div',
            { class: 'row spread' },
            h('label', { class: 'switch' }, this.autoSwitch, h('span', { class: 'track' }), 'Auto-unduh hasil baru'),
            h('button', { class: 'btn sm', title: 'Pindai ulang halaman', onclick: () => (FH.rescan(), this.toast('Halaman dipindai ulang.')) }, '⟳ Pindai')
          ),
          h(
            'div',
            { class: 'row' },
            h('button', { class: 'btn sm', onclick: () => this.selectAll() }, 'Pilih semua'),
            h('button', { class: 'btn sm', onclick: () => this.selectNone() }, 'Kosongkan'),
            h('button', { class: 'btn sm', onclick: () => this.invert() }, 'Balik'),
            h('button', { class: 'btn sm', onclick: () => this.selectNew() }, 'Yang baru'),
            this.filterSelect
          ),
          h('div', { class: 'row' }, this.summary),
          this.grid,
          this.gridEmpty,
          h('div', { class: 'hint' }, 'Klik = pilih · Shift+klik = pilih rentang · Klik ganda = perbesar. Di halaman Flow, arahkan kursor ke gambar untuk tombol ☐ dan ⬇.')
        ),
        h(
          'footer',
          {},
          this.progressRow,
          h('div', { class: 'row', style: 'margin:0' }, this.btnDownload, this.btnZip, this.btnSheet, this.btnCopy)
        )
      );
    }

    setItems(items) {
      this.items = items;
      const keys = new Set(items.map((i) => i.key));
      for (const k of [...this.selected]) if (!keys.has(k)) this.selected.delete(k);
      this.fabBadge.hidden = !items.length;
      this.fabBadge.textContent = items.length > 999 ? '999+' : String(items.length);
      if (!this.panel.hidden) this.renderGrid();
      this.scheduleOverlay();
    }

    visibleItems() {
      switch (this.filter) {
        case 'new':
          return this.items.filter((i) => !this.downloaded[i.key]);
        case 'image':
          return this.items.filter((i) => i.type === 'image');
        case 'video':
          return this.items.filter((i) => i.type === 'video');
        default:
          return this.items;
      }
    }

    // Selected items in screen order, or every visible item when nothing
    // is selected. `explicit` says which it was.
    targets() {
      const list = this.visibleItems();
      const sel = this.items.filter((i) => this.selected.has(i.key));
      return sel.length ? { items: sel, explicit: true } : { items: list, explicit: false };
    }

    renderGrid() {
      if (!this.grid) return;
      const list = this.visibleItems();
      const sig = list.map((i) => i.key + '@' + i.thumb).join('|');
      if (sig !== this.gridSig) {
        this.gridSig = sig;
        this.grid.textContent = '';
        list.forEach((it, idx) => {
          const media =
            it.type === 'video' && !it.thumb
              ? h('div', { class: 'video-ph' }, '▶')
              : h('img', { src: it.thumb || it.url, loading: 'lazy', alt: '' });
          const cell = h(
            'div',
            {
              class: 'cell',
              'data-key': it.key,
              title: `${it.w}×${it.h}`,
              onclick: (e) => this.onCellClick(e, idx),
              ondblclick: () => this.openLightbox(it.key)
            },
            media,
            h('span', { class: 'tick' }),
            h('span', { class: 'num' }, String(idx + 1).padStart(3, '0')),
            it.type === 'video' ? h('span', { class: 'kind' }, 'VIDEO') : null
          );
          this.grid.append(cell);
        });
      }
      for (const cell of this.grid.children) {
        const key = cell.dataset.key;
        cell.classList.toggle('sel', this.selected.has(key));
        let done = cell.querySelector('.done');
        if (this.downloaded[key] && !done) cell.append(h('span', { class: 'done', title: 'Sudah diunduh' }, '✓'));
        else if (!this.downloaded[key] && done) done.remove();
      }
      this.gridEmpty.hidden = list.length > 0;
      const n = this.selected.size;
      const doneCount = this.items.filter((i) => this.downloaded[i.key]).length;
      this.summary.textContent = `${this.items.length} ditemukan · ${n} dipilih · ${doneCount} sudah diunduh`;
      const { items } = this.targets();
      const label = n ? `(${items.length})` : `semua (${items.length})`;
      this.btnDownload.textContent = `Unduh ${label}`;
      this.btnZip.textContent = `ZIP ${n ? '(' + items.length + ')' : ''}`.trim();
      for (const b of [this.btnDownload, this.btnZip, this.btnSheet, this.btnCopy]) b.disabled = !items.length || this.busy;
    }

    onCellClick(e, idx) {
      const list = this.visibleItems();
      const it = list[idx];
      if (!it) return;
      if (e.shiftKey && this.lastIndex >= 0) {
        const [a, b] = [Math.min(this.lastIndex, idx), Math.max(this.lastIndex, idx)];
        const on = !this.selected.has(it.key);
        for (let i = a; i <= b; i++) on ? this.selected.add(list[i].key) : this.selected.delete(list[i].key);
      } else {
        this.toggleSelect(it.key);
      }
      this.lastIndex = idx;
      this.renderGrid();
      this.scheduleOverlay();
    }

    toggleSelect(key) {
      this.selected.has(key) ? this.selected.delete(key) : this.selected.add(key);
    }

    selectAll() {
      for (const i of this.visibleItems()) this.selected.add(i.key);
      this.afterSelect();
    }
    selectNone() {
      this.selected.clear();
      this.afterSelect();
    }
    invert() {
      for (const i of this.visibleItems()) this.toggleSelect(i.key);
      this.afterSelect();
    }
    selectNew() {
      this.selected.clear();
      for (const i of this.items) if (!this.downloaded[i.key]) this.selected.add(i.key);
      this.afterSelect();
    }
    afterSelect() {
      this.renderGrid();
      this.scheduleOverlay();
    }

    async doDownload(zip) {
      let { items, explicit } = this.targets();
      if (!explicit && this.settings.skipDownloaded) {
        const fresh = items.filter((i) => !this.downloaded[i.key]);
        if (!fresh.length) return this.toast('Semua gambar sudah pernah diunduh. Pilih manual untuk mengunduh ulang.');
        if (fresh.length < items.length) this.toast(`${items.length - fresh.length} gambar dilewati (sudah diunduh).`);
        items = fresh;
      }
      await this.runJob(() => FH.actions.download(items, { zip }));
    }

    async doSheet() {
      const { items } = this.targets();
      const images = items.filter((i) => i.type === 'image');
      if (!images.length) return this.toast('Pilih minimal satu gambar.', true);
      await this.runJob(() => FH.actions.contactSheet(images));
    }

    doCopyPrompts() {
      const { items } = this.targets();
      const lines = items.map((i, idx) => `${String(idx + 1).padStart(3, '0')}. ${FH.scanner.promptFor(i) || '(prompt tidak ditemukan)'}`);
      this.copy(lines.join('\n'));
    }

    async runJob(fn) {
      if (this.busy) return;
      this.busy = true;
      this.showProgress(0, 1, 'Menyiapkan…');
      this.renderGrid();
      try {
        const res = await fn();
        if (res && res.error) throw new Error(res.error);
      } catch (e) {
        this.toast('Gagal: ' + e.message, true);
        this.endJob();
      }
    }

    showProgress(done, total, text) {
      this.progressRow.hidden = false;
      this.progressBar.style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
      this.progressText.textContent = text;
    }

    endJob() {
      this.busy = false;
      setTimeout(() => {
        if (!this.busy) this.progressRow.hidden = true;
      }, 2500);
      this.renderGrid();
    }

    // Progress reported by the service worker.
    onJobProgress(p) {
      if (p.quiet) {
        if (p.phase === 'done' && p.failed) this.toast(`Auto-unduh: ${p.failed} gagal.`, true);
        return;
      }
      if (p.phase === 'fetch') {
        this.showProgress(p.done, p.total, `${p.label || 'Mengambil'} ${p.done}/${p.total}${p.failed ? ` · ${p.failed} gagal` : ''}`);
      } else if (p.phase === 'pack') {
        this.showProgress(p.total, p.total, 'Membuat file…');
      } else if (p.phase === 'done') {
        this.showProgress(1, 1, p.message || 'Selesai.');
        this.toast(p.message || 'Selesai.', !!p.failed && !p.ok);
        this.endJob();
      }
    }

    // ---------- tile controls over Flow's own pictures ----------

    onMouseMove(e) {
      this.mouse = { x: e.clientX, y: e.clientY };
      this.scheduleOverlay();
    }

    scheduleOverlay() {
      if (this.overlayQueued) return;
      this.overlayQueued = true;
      requestAnimationFrame(() => {
        this.overlayQueued = false;
        this.renderOverlay();
      });
    }

    renderOverlay() {
      const show = this.settings.showTileButtons;
      const vw = innerWidth;
      const vh = innerHeight;
      const live = new Set();
      let hover = null;
      for (const it of show ? this.items : []) {
        if (!it.el.isConnected) continue;
        const r = it.el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw || r.width < 60) continue;
        const m = this.mouse;
        if (m && m.x >= r.left && m.x <= r.right && m.y >= r.top && m.y <= r.bottom) hover = it.key;
        const sel = this.selected.has(it.key);
        const done = !!this.downloaded[it.key];
        if (!sel && !done && this.hoverKey !== it.key) continue;
        live.add(it.key);
        const nodes = this.tileNodesFor(it);
        nodes.ring.hidden = !sel;
        Object.assign(nodes.ring.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
        nodes.done.hidden = !done;
        Object.assign(nodes.done.style, { left: r.right - 30 + 'px', top: r.top + 8 + 'px' });
        nodes.ctrl.hidden = !(sel || this.hoverKey === it.key);
        Object.assign(nodes.ctrl.style, { left: r.left + 8 + 'px', top: r.top + 8 + 'px' });
        nodes.selBtn.classList.toggle('sel', sel);
        nodes.selBtn.textContent = sel ? '✓' : '';
      }
      for (const [key, nodes] of this.tileNodes) {
        if (!live.has(key)) {
          nodes.ring.remove();
          nodes.done.remove();
          nodes.ctrl.remove();
          this.tileNodes.delete(key);
        }
      }
      if (hover !== this.hoverKey) {
        this.hoverKey = hover;
        this.scheduleOverlay();
      }
    }

    tileNodesFor(it) {
      let nodes = this.tileNodes.get(it.key);
      if (nodes) return nodes;
      const key = it.key;
      const selBtn = h('button', {
        title: 'Pilih',
        onclick: (e) => {
          e.stopPropagation();
          this.toggleSelect(key);
          this.afterSelect();
        }
      });
      const dlBtn = h(
        'button',
        {
          title: 'Unduh gambar ini',
          onclick: async (e) => {
            e.stopPropagation();
            const item = this.items.find((i) => i.key === key);
            if (item) {
              const res = await FH.actions.download([item], { zip: false, quiet: true });
              this.toast(res && res.error ? 'Gagal: ' + res.error : 'Mengunduh…', !!(res && res.error));
            }
          }
        },
        '⬇'
      );
      const zoomBtn = h(
        'button',
        {
          title: 'Perbesar & detail prompt',
          onclick: (e) => {
            e.stopPropagation();
            this.openLightbox(key);
          }
        },
        '⤢'
      );
      nodes = {
        ring: h('div', { class: 'tile-ring' }),
        done: h('div', { class: 'tile-done' }, '✓'),
        ctrl: h('div', { class: 'tile-ctrl' }, selBtn, dlBtn, zoomBtn),
        selBtn
      };
      this.overlay.append(nodes.ring, nodes.done, nodes.ctrl);
      this.tileNodes.set(key, nodes);
      return nodes;
    }

    // ---------- lightbox ----------

    buildLightbox() {
      this.lbMedia = h('div', { style: 'display:flex;justify-content:center' });
      this.lbPrompt = h('div', { class: 'prompt' });
      this.lbInfo = h('span', { class: 'muted small' });
      const act = (label, fn, cls) => h('button', { class: 'btn ' + (cls || ''), onclick: fn }, label);
      this.lightbox = h(
        'div',
        {
          class: 'lightbox',
          hidden: true,
          onclick: (e) => {
            if (e.target === this.lightbox) this.closeLightbox();
          }
        },
        h(
          'div',
          { class: 'box' },
          this.lbMedia,
          this.lbPrompt,
          h(
            'div',
            { class: 'row', style: 'margin:0' },
            act('‹', () => this.stepLightbox(-1)),
            act('›', () => this.stepLightbox(1)),
            this.lbInfo,
            h('span', { style: 'flex:1' }),
            act('Salin prompt', () => this.copy(this.lbPrompt.textContent)),
            act('Simpan ke pustaka', () => this.addToLibrary(this.lbPrompt.textContent)),
            act('Pakai lagi', () => {
              try {
                FH.flow.insert(this.lbPrompt.textContent);
                this.closeLightbox();
                this.toast('Prompt dimasukkan ke kotak Flow.');
              } catch (e) {
                this.toast(e.message, true);
              }
            }),
            act(
              'Unduh',
              () => {
                const it = this.items.find((i) => i.key === this.lbKey);
                if (it) FH.actions.download([it], { zip: false, quiet: true }).then(() => this.toast('Mengunduh…'));
              },
              'primary'
            ),
            act('✕', () => this.closeLightbox())
          )
        )
      );
      return this.lightbox;
    }

    openLightbox(key) {
      const it = this.items.find((i) => i.key === key);
      if (!it) return;
      this.lbKey = key;
      this.lbMedia.textContent = '';
      if (it.type === 'video') {
        this.lbMedia.append(h('video', { src: it.url, controls: true, autoplay: true, loop: true }));
      } else {
        const img = h('img', { src: it.url, alt: '' });
        img.addEventListener('error', () => (img.src = it.thumb), { once: true });
        this.lbMedia.append(img);
      }
      const prompt = FH.scanner.promptFor(it);
      this.lbPrompt.textContent = prompt || '';
      this.lbPrompt.hidden = !prompt;
      const idx = this.items.indexOf(it);
      this.lbInfo.textContent = `${idx + 1}/${this.items.length} · ${it.w}×${it.h}`;
      this.lightbox.hidden = false;
    }

    stepLightbox(d) {
      const idx = this.items.findIndex((i) => i.key === this.lbKey);
      const next = this.items[(idx + d + this.items.length) % this.items.length];
      if (next) this.openLightbox(next.key);
    }

    closeLightbox() {
      this.lightbox.hidden = true;
      this.lbMedia.textContent = '';
      this.lbKey = null;
    }

    onKey(e) {
      if (this.lightbox && !this.lightbox.hidden) {
        if (e.key === 'Escape') this.closeLightbox();
        else if (e.key === 'ArrowLeft') this.stepLightbox(-1);
        else if (e.key === 'ArrowRight') this.stepLightbox(1);
        else return;
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === 'Escape' && !this.panel.hidden && e.composedPath().includes(this.panel)) {
        this.setOpen(false);
      }
    }

    // ---------- prompt queue ----------

    buildQueueTab() {
      this.qText = h('textarea', {
        rows: 8,
        placeholder: 'Satu prompt per baris…\n\nseekor kucing {oranye|hitam} di {atap|jendela}, golden hour\nrumah tua di tengah kabut, malam hari',
        oninput: () => {
          this.updateQueuePreview();
          clearTimeout(this.draftTimer);
          this.draftTimer = setTimeout(() => chrome.storage.local.set({ queueDraft: this.qText.value }), 500);
        }
      });
      this.qChips = h('div', { class: 'chips' });
      this.qRepeat = h('input', { type: 'number', min: '1', max: '20', value: String(this.settings.queueRepeat), onchange: () => this.saveQueueOpts() });
      this.qDelay = h('input', { type: 'number', min: '0', max: '3600', value: String(this.settings.queueDelay), onchange: () => this.saveQueueOpts() });
      this.qWait = h('input', { type: 'checkbox', checked: !!this.settings.queueWaitForResult, onchange: () => this.saveQueueOpts() });
      this.qCount = h('span', { class: 'muted small' });
      this.qPreview = h('ol', { class: 'preview-list', hidden: true });
      this.qPending = h('div', { class: 'banner', hidden: true });
      this.qStatus = h('div', { class: 'small', style: 'margin-bottom:6px' });
      this.qBar = h('div');
      this.qLog = h('div', { class: 'log' });
      this.qStart = h('button', { class: 'btn primary', onclick: () => this.startQueue() }, '▶ Mulai');
      this.qPause = h('button', { class: 'btn', onclick: () => (FH.queue.state === 'paused' ? FH.queue.resume() : FH.queue.pause()) }, '⏸ Jeda');
      this.qStop = h('button', { class: 'btn danger', onclick: () => FH.queue.stop() }, '■ Stop');

      return h(
        'section',
        { class: 'tab' },
        h(
          'div',
          { class: 'scroll' },
          this.qPending,
          this.qText,
          h(
            'div',
            { class: 'hint' },
            'Satu prompt per baris (atau pisahkan dengan baris kosong untuk prompt panjang). ',
            h('code', {}, '{a|b|c}'),
            ' membuat variasi otomatis. Baris berawalan ',
            h('code', {}, '#'),
            ' diabaikan.'
          ),
          h('div', { class: 'row' }, h('b', {}, 'Tambahkan gaya:')),
          h('div', { class: 'row' }, this.qChips),
          h(
            'div',
            { class: 'row' },
            'Ulangi',
            this.qRepeat,
            '× · Jeda',
            this.qDelay,
            'dtk',
            h('label', { class: 'check' }, this.qWait, 'Tunggu hasil')
          ),
          h(
            'div',
            { class: 'row spread' },
            this.qCount,
            h(
              'span',
              {},
              h('button', { class: 'btn sm', onclick: () => (this.qPreview.hidden = !this.qPreview.hidden) }, 'Lihat daftar'),
              ' ',
              h('button', { class: 'btn sm', onclick: () => this.fillFromFavorites() }, '★ Isi dari favorit')
            )
          ),
          this.qPreview,
          h('div', { class: 'row' }, this.qStart, this.qPause, this.qStop),
          this.qStatus,
          h('div', { class: 'progress', style: 'margin-bottom:8px' }, this.qBar),
          this.qLog
        )
      );
    }

    renderStyleChips() {
      this.qChips.textContent = '';
      for (const p of this.settings.stylePresets || []) {
        const chip = h(
          'button',
          {
            class: 'chip' + (this.queueStyles.has(p.name) ? ' on' : ''),
            title: p.text,
            onclick: () => {
              this.queueStyles.has(p.name) ? this.queueStyles.delete(p.name) : this.queueStyles.add(p.name);
              this.renderStyleChips();
              this.updateQueuePreview();
            }
          },
          p.name
        );
        this.qChips.append(chip);
      }
      this.qChips.append(h('button', { class: 'chip', title: 'Atur preset gaya', onclick: () => chrome.runtime.sendMessage({ type: 'open-options' }) }, '+ Atur'));
    }

    queueStyleText() {
      return (this.settings.stylePresets || [])
        .filter((p) => this.queueStyles.has(p.name))
        .map((p) => p.text)
        .join(', ');
    }

    buildQueueItems() {
      return FH.PromptQueue.build(this.qText.value, {
        style: this.queueStyleText(),
        repeat: Number(this.qRepeat.value) || 1
      });
    }

    updateQueuePreview() {
      const items = this.buildQueueItems();
      this.qCount.textContent = `→ ${items.length} prompt akan dikirim`;
      this.qPreview.textContent = '';
      for (const p of items.slice(0, 100)) this.qPreview.append(h('li', {}, p));
      if (items.length > 100) this.qPreview.append(h('li', { class: 'muted' }, `…dan ${items.length - 100} lagi`));
    }

    saveQueueOpts() {
      FH.saveSettings({
        queueRepeat: Math.max(1, Math.min(20, Number(this.qRepeat.value) || 1)),
        queueDelay: Math.max(0, Number(this.qDelay.value) || 0),
        queueWaitForResult: this.qWait.checked
      });
      this.updateQueuePreview();
    }

    startQueue() {
      const items = this.buildQueueItems();
      if (!items.length) return this.toast('Tulis minimal satu prompt.', true);
      if (!FH.flow.findPromptBox()) return this.toast('Kotak prompt Flow tidak ditemukan. Buka sebuah proyek dulu.', true);
      this.qPending.hidden = true;
      FH.queue.start(items);
    }

    renderQueue() {
      const q = FH.queue;
      const running = q.state === 'running';
      const paused = q.state === 'paused';
      this.qStart.disabled = running || paused;
      this.qPause.disabled = !(running || paused);
      this.qPause.textContent = paused ? '▶ Lanjut' : '⏸ Jeda';
      this.qStop.disabled = !(running || paused);
      const total = q.items.length;
      this.qBar.style.width = total ? `${Math.round((q.index / total) * 100)}%` : '0';
      let status = '';
      if (running || paused) {
        status = `${q.index}/${total} terkirim`;
        if (paused) status += ' · dijeda';
        else if (q.remaining) status += ` · prompt berikutnya dalam ${q.remaining} dtk`;
      } else if (total && q.index >= total) {
        status = `Selesai: ${total} prompt terkirim.`;
      }
      this.qStatus.textContent = status;
      this.qLog.textContent = q.log.join('\n');
      this.qLog.hidden = !q.log.length;
    }

    showPending(pending) {
      if (!pending || !pending.items || pending.index >= pending.items.length) return;
      const left = pending.items.length - pending.index;
      this.qPending.textContent = '';
      this.qPending.append(
        `Ada antrean yang terhenti: ${left} prompt tersisa. `,
        h('button', { class: 'btn sm', onclick: () => ((this.qPending.hidden = true), FH.queue.start(pending.items, pending.index)) }, 'Lanjutkan'),
        ' ',
        h('button', { class: 'btn sm', onclick: () => ((this.qPending.hidden = true), chrome.storage.local.remove('pendingQueue')) }, 'Buang')
      );
      this.qPending.hidden = false;
    }

    addToQueue(...texts) {
      const lines = texts.map((t) => t.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
      const cur = this.qText.value.trim();
      // Blank-line separated text keeps its format, so a new prompt does
      // not get glued to the last block.
      const sep = /\n\s*\n/.test(cur) ? '\n\n' : '\n';
      this.qText.value = [cur, ...lines].filter(Boolean).join(sep);
      this.qText.dispatchEvent(new Event('input'));
      this.setOpen(true);
      this.setTab('queue');
      this.toast(lines.length > 1 ? `${lines.length} prompt ditambahkan ke antrean.` : 'Ditambahkan ke antrean.');
    }

    fillFromFavorites() {
      const favs = this.library.filter((p) => p.fav);
      if (!favs.length) return this.toast('Belum ada prompt favorit (★) di Pustaka.', true);
      this.addToQueue(...favs.map((p) => p.text));
    }

    // ---------- prompt library ----------

    buildLibraryTab() {
      this.libInput = h('textarea', { rows: 3, placeholder: 'Tulis atau tempel prompt untuk disimpan…' });
      this.libList = h('div');
      this.libSearch = h('input', {
        type: 'search',
        placeholder: 'Cari prompt…',
        style: 'flex:1',
        oninput: () => {
          this.libQuery = this.libSearch.value.toLowerCase();
          this.renderLibrary();
        }
      });
      this.libTabs = {
        saved: h('button', { class: 'btn sm', onclick: () => ((this.libView = 'saved'), this.renderLibrary()) }, 'Tersimpan'),
        history: h('button', { class: 'btn sm', onclick: () => ((this.libView = 'history'), this.renderLibrary()) }, 'Riwayat')
      };
      this.libImport = h('input', { type: 'file', accept: '.json,.txt', hidden: true, onchange: () => this.importLibrary() });
      return h(
        'section',
        { class: 'tab' },
        h(
          'div',
          { class: 'scroll' },
          this.libInput,
          h(
            'div',
            { class: 'row', style: 'margin-top:6px' },
            h('button', { class: 'btn primary sm', onclick: () => this.addToLibrary(this.libInput.value, true) }, 'Simpan'),
            h(
              'button',
              {
                class: 'btn sm',
                title: 'Ambil teks yang sedang ada di kotak prompt Flow',
                onclick: () => {
                  const t = FH.flow.readPrompt();
                  if (t) this.libInput.value = t;
                  else this.toast('Kotak prompt Flow kosong.', true);
                }
              },
              'Ambil dari Flow'
            )
          ),
          h('div', { class: 'subnav' }, this.libTabs.saved, this.libTabs.history, this.libSearch),
          this.libList
        ),
        h(
          'footer',
          {},
          h(
            'div',
            { class: 'row', style: 'margin:0' },
            h('button', { class: 'btn sm', onclick: () => this.exportLibrary() }, 'Ekspor'),
            h('button', { class: 'btn sm', onclick: () => this.libImport.click() }, 'Impor'),
            this.libImport,
            h('span', { class: 'muted small' }, 'JSON atau .txt (satu prompt per baris)')
          )
        )
      );
    }

    async addToLibrary(text, clearInput) {
      text = (text || '').trim();
      if (!text) return this.toast('Prompt kosong.', true);
      const { library = [] } = await chrome.storage.local.get('library');
      if (library.some((p) => p.text === text)) return this.toast('Prompt ini sudah ada di pustaka.');
      library.unshift({ id: FH.uid(), text, fav: false, created: Date.now(), uses: 0 });
      library.length = Math.min(library.length, LIB_LIMIT);
      await chrome.storage.local.set({ library });
      if (clearInput) this.libInput.value = '';
      this.toast('Disimpan ke pustaka.');
    }

    async updateLibrary(fn) {
      const { library = [] } = await chrome.storage.local.get('library');
      await chrome.storage.local.set({ library: fn(library) });
    }

    renderLibrary() {
      if (!this.libList) return;
      for (const [k, b] of Object.entries(this.libTabs)) b.classList.toggle('on', k === this.libView);
      const q = this.libQuery;
      this.libList.textContent = '';
      const btn = (label, title, fn, cls) => h('button', { class: 'btn sm ' + (cls || ''), title, onclick: fn }, label);
      const use = (p) => {
        try {
          FH.flow.insert(p.text);
          this.toast('Dimasukkan ke kotak prompt Flow.');
          if (p.id) this.updateLibrary((lib) => lib.map((x) => (x.id === p.id ? { ...x, uses: (x.uses || 0) + 1 } : x)));
        } catch (e) {
          this.toast(e.message, true);
        }
      };
      let list;
      if (this.libView === 'saved') {
        list = this.library
          .filter((p) => !q || p.text.toLowerCase().includes(q))
          .sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || b.created - a.created);
      } else {
        list = this.history.filter((p) => !q || p.text.toLowerCase().includes(q));
      }
      if (!list.length) {
        this.libList.append(
          h('div', { class: 'empty' }, this.libView === 'saved' ? 'Pustaka masih kosong. Simpan prompt favoritmu di sini.' : 'Prompt yang kamu kirim ke Flow akan tercatat di sini.')
        );
        return;
      }
      for (const p of list.slice(0, 300)) {
        const when = new Date(p.created || p.t).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
        const meta =
          this.libView === 'saved'
            ? [
                h(
                  'button',
                  {
                    class: 'icon-btn star' + (p.fav ? ' on' : ''),
                    title: 'Favorit',
                    onclick: () => this.updateLibrary((lib) => lib.map((x) => (x.id === p.id ? { ...x, fav: !x.fav } : x)))
                  },
                  '★'
                ),
                h('span', { class: 'muted' }, `${when}${p.uses ? ` · dipakai ${p.uses}×` : ''}`),
                btn('Pakai', 'Masukkan ke kotak prompt Flow', () => use(p)),
                btn('+Antrean', 'Tambahkan ke antrean', () => this.addToQueue(p.text)),
                btn('Salin', 'Salin', () => this.copy(p.text)),
                btn('✕', 'Hapus', () => this.updateLibrary((lib) => lib.filter((x) => x.id !== p.id)), 'danger')
              ]
            : [
                h('span', { class: 'muted' }, when),
                btn('Pakai', 'Masukkan ke kotak prompt Flow', () => use(p)),
                btn('+Antrean', 'Tambahkan ke antrean', () => this.addToQueue(p.text)),
                btn('Simpan', 'Simpan ke pustaka', () => this.addToLibrary(p.text)),
                btn('Salin', 'Salin', () => this.copy(p.text))
              ];
        this.libList.append(h('div', { class: 'lib-item' }, h('div', { class: 'text', title: p.text }, p.text), h('div', { class: 'meta' }, meta)));
      }
    }

    exportLibrary() {
      const blob = new Blob([JSON.stringify({ app: 'flow-helper', version: 1, library: this.library }, null, 2)], { type: 'application/json' });
      const a = h('a', { href: URL.createObjectURL(blob), download: `flow-helper-pustaka_${FH.today()}.json` });
      this.root.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }

    async importLibrary() {
      const file = this.libImport.files[0];
      this.libImport.value = '';
      if (!file) return;
      const text = await file.text();
      let incoming = [];
      try {
        const data = JSON.parse(text);
        const arr = Array.isArray(data) ? data : data.library || [];
        incoming = arr.map((p) => (typeof p === 'string' ? { text: p } : p)).filter((p) => p && p.text);
      } catch (e) {
        incoming = FH.parsePromptList(text).map((t) => ({ text: t }));
      }
      const { library = [] } = await chrome.storage.local.get('library');
      const have = new Set(library.map((p) => p.text));
      let added = 0;
      for (const p of incoming) {
        const t = String(p.text).trim();
        if (!t || have.has(t)) continue;
        have.add(t);
        library.push({ id: FH.uid(), text: t, fav: !!p.fav, created: p.created || Date.now(), uses: p.uses || 0 });
        added++;
      }
      library.length = Math.min(library.length, LIB_LIMIT);
      await chrome.storage.local.set({ library });
      this.toast(`${added} prompt diimpor.`);
    }

    // ---------- settings ----------

    renderSettings() {
      FH.renderSettingsForm(this.settingsBox, this.settings, (key, value) => FH.saveSettings({ [key]: value }));
      this.settingsBox.append(
        h(
          'div',
          { class: 'row', style: 'margin-top:12px' },
          h('button', { class: 'btn', onclick: () => chrome.runtime.sendMessage({ type: 'open-options' }) }, 'Pengaturan lengkap & preset gaya'),
          h(
            'button',
            {
              class: 'btn danger',
              onclick: async () => {
                await chrome.storage.local.set({ downloaded: {} });
                this.toast('Tanda "sudah diunduh" dihapus.');
              }
            },
            'Reset tanda unduhan'
          )
        )
      );
    }
  }

  Panel.HISTORY_LIMIT = HISTORY_LIMIT;
  FH.Panel = Panel;
  FH.h = h;
})();
