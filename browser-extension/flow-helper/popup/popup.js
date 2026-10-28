(async function () {
  'use strict';
  const FH = self.FH;
  const $ = (id) => document.getElementById(id);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const onFlow = tab && /^https:\/\/labs\.google\/fx\//.test(tab.url || '');
  const toTab = (msg) => chrome.tabs.sendMessage(tab.id, msg);

  $('on-flow').hidden = !onFlow;
  $('off-flow').hidden = onFlow;
  $('where').textContent = onFlow ? 'Google Flow terbuka' : 'Bukan halaman Flow';

  if (onFlow) {
    try {
      const st = await toTab({ type: 'get-status' });
      const parts = [`${st.count} gambar terdeteksi`, `proyek "${st.project}"`];
      if (st.selected) parts.push(`${st.selected} dipilih`);
      if (st.queue && st.queue.state !== 'idle') parts.push(`antrean ${st.queue.index}/${st.queue.total}`);
      $('tab-status').textContent = parts.join(' · ');
    } catch (e) {
      $('tab-status').textContent = 'Muat ulang tab Flow agar Flow Helper aktif.';
    }
  }

  $('b-panel').onclick = () => toTab({ type: 'show-panel' }).finally(() => window.close());
  $('b-dl').onclick = () => toTab({ type: 'download-selected' }).finally(() => window.close());
  $('b-zip').onclick = () => toTab({ type: 'download-zip' }).finally(() => window.close());
  $('b-open').onclick = () => chrome.runtime.sendMessage({ type: 'open-flow' }).finally(() => window.close());
  $('b-options').onclick = () => chrome.runtime.openOptionsPage();
  $('b-keys').onclick = () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });

  const settings = await FH.getSettings();
  $('t-auto').checked = settings.autoDownload;
  $('t-tiles').checked = settings.showTileButtons;
  $('t-auto').onchange = (e) => FH.saveSettings({ autoDownload: e.target.checked });
  $('t-tiles').onchange = (e) => FH.saveSettings({ showTileButtons: e.target.checked });

  const { stats } = await chrome.storage.local.get('stats');
  const s = stats || { days: {}, total: {} };
  const today = s.days[FH.today()] || {};
  $('s-today-dl').textContent = today.downloads || 0;
  $('s-today-pr').textContent = today.prompts || 0;
  $('s-total-dl').textContent = (s.total && s.total.downloads) || 0;

  // Downloads per day over the last two weeks.
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({ day: FH.today(d), n: (s.days[FH.today(d)] || {}).downloads || 0 });
  }
  const max = Math.max(1, ...days.map((d) => d.n));
  for (const d of days) {
    const bar = document.createElement('div');
    bar.style.height = `${Math.round((d.n / max) * 100)}%`;
    bar.title = `${d.day}: ${d.n} unduhan`;
    $('spark').append(bar);
  }
})();
