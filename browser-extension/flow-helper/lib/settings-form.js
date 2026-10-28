// The settings both the in-page panel and the options page show, and the
// form that edits them. One list, so the two never disagree.
(function (root) {
  'use strict';
  const FH = (root.FH = root.FH || {});

  FH.SETTING_GROUPS = [
    {
      title: 'Unduhan',
      fields: [
        { key: 'folder', type: 'text', label: 'Folder di dalam Downloads' },
        {
          key: 'nameTemplate',
          type: 'text',
          label: 'Pola nama file',
          help: 'Token: {project} {date} {time} {n} {prompt} {w} {h} {id} {type}. Pakai / untuk subfolder.'
        },
        {
          key: 'format',
          type: 'select',
          label: 'Format gambar',
          options: [
            ['original', 'Asli (tanpa konversi)'],
            ['png', 'PNG'],
            ['jpg', 'JPG'],
            ['webp', 'WebP']
          ]
        },
        { key: 'quality', type: 'number', label: 'Kualitas JPG/WebP (0.1 - 1)', min: 0.1, max: 1, step: 0.01 },
        { key: 'promptMaxLen', type: 'number', label: 'Panjang maksimal {prompt} di nama file', min: 10, max: 120 },
        { key: 'skipDownloaded', type: 'switch', label: 'Lewati gambar yang sudah pernah diunduh (saat "unduh semua")' },
        { key: 'saveManifest', type: 'switch', label: 'Sertakan prompts.csv di dalam ZIP' },
        { key: 'savePromptTxt', type: 'switch', label: 'Simpan prompt sebagai .txt di samping tiap gambar' }
      ]
    },
    {
      title: 'Pemindaian',
      fields: [
        { key: 'minSize', type: 'number', label: 'Ukuran minimum gambar (px sisi terpanjang)', min: 0, max: 4096 },
        { key: 'includeVideos', type: 'switch', label: 'Sertakan video' },
        { key: 'reverseOrder', type: 'switch', label: 'Balik urutan (nomor 001 = paling bawah / paling lama)' }
      ]
    },
    {
      title: 'Halaman Flow',
      fields: [
        { key: 'autoDownload', type: 'switch', label: 'Auto-unduh setiap hasil baru' },
        { key: 'showTileButtons', type: 'switch', label: 'Tombol pilih & unduh di atas tiap gambar' }
      ]
    },
    {
      title: 'Antrean prompt',
      fields: [
        { key: 'queueDelay', type: 'number', label: 'Jeda antar prompt (detik)', min: 0, max: 3600 },
        { key: 'queueWaitForResult', type: 'switch', label: 'Tunggu hasil muncul sebelum prompt berikutnya' },
        { key: 'queueMaxWait', type: 'number', label: 'Batas tunggu hasil (detik)', min: 10, max: 3600 },
        { key: 'notifyDone', type: 'switch', label: 'Notifikasi saat antrean selesai' }
      ]
    },
    {
      title: 'Lembar kontak',
      fields: [
        { key: 'sheetColumns', type: 'number', label: 'Jumlah kolom', min: 1, max: 10 },
        { key: 'sheetCaptions', type: 'switch', label: 'Tulis prompt di bawah tiap gambar' }
      ]
    }
  ];

  // Renders the groups into `container`. `onChange(key, value)` is called
  // for every edit; `only` limits it to some group titles.
  FH.renderSettingsForm = function (container, settings, onChange, only) {
    const doc = container.ownerDocument;
    const el = (tag, props, ...kids) => {
      const n = doc.createElement(tag);
      Object.assign(n, props || {});
      n.append(...kids.filter((k) => k != null));
      return n;
    };
    container.textContent = '';
    for (const group of FH.SETTING_GROUPS) {
      if (only && !only.includes(group.title)) continue;
      container.append(el('h3', { className: 'group-title' }, group.title));
      for (const f of group.fields) {
        const value = settings[f.key];
        const wrap = el('div', { className: 'field' });
        if (f.type === 'switch') {
          const input = el('input', { type: 'checkbox', checked: !!value });
          input.addEventListener('change', () => onChange(f.key, input.checked));
          wrap.append(el('label', { className: 'switch' }, input, el('span', { className: 'track' }), el('span', {}, f.label)));
        } else if (f.type === 'select') {
          const select = el('select', {});
          for (const [v, label] of f.options) select.append(el('option', { value: v, selected: v === value }, label));
          select.addEventListener('change', () => onChange(f.key, select.value));
          wrap.append(el('label', {}, f.label), select);
        } else {
          const input = el('input', { type: f.type, value: value == null ? '' : String(value) });
          if (f.type === 'number') Object.assign(input, { min: f.min, max: f.max, step: f.step || 1 });
          input.addEventListener('change', () => {
            let v = input.value;
            if (f.type === 'number') {
              v = Number(v);
              if (!Number.isFinite(v)) v = FH.DEFAULTS[f.key];
              v = Math.min(f.max, Math.max(f.min, v));
              input.value = v;
            }
            onChange(f.key, v);
          });
          wrap.append(el('label', {}, f.label), input);
        }
        if (f.help) wrap.append(el('div', { className: 'hint' }, f.help));
        container.append(wrap);
      }
    }
  };
})(typeof self !== 'undefined' ? self : this);
