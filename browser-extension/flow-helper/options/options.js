(async function () {
  'use strict';
  const FH = self.FH;
  const $ = (id) => document.getElementById(id);
  let settings = await FH.getSettings();

  let savedTimer;
  async function save(patch) {
    settings = await FH.saveSettings(patch);
    $('saved').hidden = false;
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => ($('saved').hidden = true), 1500);
    renderPreview();
  }

  function renderForm() {
    FH.renderSettingsForm($('settings'), settings, (key, value) => save({ [key]: value }));
  }

  function renderPreview() {
    const name = FH.buildName(settings.nameTemplate, {
      n: 1,
      prompt: 'seekor kucing oranye di atap rumah saat senja',
      project: 'Proyek Saya',
      w: 1024,
      h: 1792,
      key: 'contoh',
      folder: settings.folder,
      promptMaxLen: settings.promptMaxLen
    });
    const ext = settings.format === 'original' ? 'png' : settings.format;
    $('name-preview').textContent = `Downloads/${name}.${ext}`;
  }

  function renderPresets() {
    const box = $('presets');
    box.textContent = '';
    settings.stylePresets.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'preset';
      const name = Object.assign(document.createElement('input'), { type: 'text', value: p.name, placeholder: 'Nama' });
      const text = Object.assign(document.createElement('textarea'), { value: p.text, rows: 1, placeholder: 'Teks yang ditambahkan ke prompt' });
      const del = Object.assign(document.createElement('button'), { className: 'btn danger', textContent: 'Hapus' });
      const commit = () => {
        const list = settings.stylePresets.slice();
        list[i] = { name: name.value.trim() || 'Preset', text: text.value.trim() };
        save({ stylePresets: list });
      };
      name.onchange = commit;
      text.onchange = commit;
      del.onclick = () => {
        save({ stylePresets: settings.stylePresets.filter((_, j) => j !== i) }).then(renderPresets);
      };
      row.append(name, text, del);
      box.append(row);
    });
  }

  $('add-preset').onclick = async () => {
    await save({ stylePresets: settings.stylePresets.concat({ name: 'Preset baru', text: '' }) });
    renderPresets();
  };

  async function renderDataInfo() {
    const data = await chrome.storage.local.get(['library', 'history', 'downloaded']);
    $('data-info').textContent = `${(data.library || []).length} prompt di pustaka · ${(data.history || []).length} di riwayat · ${
      Object.keys(data.downloaded || {}).length
    } gambar ditandai sudah diunduh.`;
  }

  $('export').onclick = async () => {
    const data = await chrome.storage.local.get(['settings', 'library', 'history', 'stats']);
    const blob = new Blob([JSON.stringify({ app: 'flow-helper', version: 1, ...data }, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `flow-helper-cadangan_${FH.today()}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  $('import').onclick = () => $('import-file').click();
  $('import-file').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const patch = {};
      for (const k of ['settings', 'library', 'history', 'stats']) if (data[k]) patch[k] = data[k];
      if (!Object.keys(patch).length) throw new Error('bukan file cadangan Flow Helper');
      await chrome.storage.local.set(patch);
      settings = await FH.getSettings();
      renderForm();
      renderPresets();
      renderPreview();
      renderDataInfo();
      alert('Cadangan dipulihkan.');
    } catch (err) {
      alert('Gagal memulihkan: ' + err.message);
    }
  };

  $('reset-marks').onclick = async () => {
    if (!confirm('Hapus semua tanda "sudah diunduh"?')) return;
    await chrome.storage.local.set({ downloaded: {} });
    renderDataInfo();
  };
  $('clear-history').onclick = async () => {
    if (!confirm('Hapus riwayat prompt?')) return;
    await chrome.storage.local.set({ history: [] });
    renderDataInfo();
  };
  $('reset-settings').onclick = async () => {
    if (!confirm('Kembalikan semua pengaturan ke awal? Pustaka prompt tidak dihapus.')) return;
    await chrome.storage.local.set({ settings: FH.DEFAULTS });
    settings = await FH.getSettings();
    renderForm();
    renderPresets();
    renderPreview();
  };
  $('shortcuts').onclick = () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });

  renderForm();
  renderPresets();
  renderPreview();
  renderDataInfo();
})();
