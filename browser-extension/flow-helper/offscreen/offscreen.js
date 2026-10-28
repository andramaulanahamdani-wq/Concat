// Runs in the extension's offscreen document: fetches the pictures (the
// extension's host permissions get past CORS here), converts them, packs
// ZIPs and draws contact sheets, then hands blob: URLs to the service
// worker, which owns the downloads API.
(function () {
  'use strict';
  const FH = self.FH;

  const send = (msg) => chrome.runtime.sendMessage(Object.assign({ target: 'background' }, msg)).catch(() => {});

  const EXT = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
    'image/heic': 'heic',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov'
  };
  const FORMAT_MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

  // The file's real type from its first bytes; servers often say
  // application/octet-stream.
  async function sniff(blob) {
    const b = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    const ascii = (from, to) => String.fromCharCode(...b.slice(from, to));
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
    if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
    if (ascii(0, 3) === 'GIF') return 'image/gif';
    if (ascii(4, 8) === 'ftyp') {
      const brand = ascii(8, 12);
      if (/^avi[fs]$/.test(brand)) return 'image/avif';
      if (/^(heic|heix|mif1)$/.test(brand)) return 'image/heic';
      if (brand === 'qt  ') return 'video/quicktime';
      return 'video/mp4';
    }
    if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'video/webm';
    return '';
  }

  async function fetchMedia(item) {
    let lastError = new Error('tidak ada URL');
    const urls = [item.url, item.fallbackUrl].filter((u, i, a) => u && a.indexOf(u) === i);
    for (const url of urls) {
      try {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        let blob = await res.blob();
        const mime = (await sniff(blob)) || (blob.type || '').split(';')[0];
        if (!/^(image|video)\//.test(mime)) throw new Error('bukan gambar/video (' + (mime || 'tidak dikenal') + ')');
        if (mime !== blob.type) blob = new Blob([blob], { type: mime });
        return { blob, mime };
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError;
  }

  async function convert(blob, mime, format, quality) {
    const target = FORMAT_MIME[format];
    if (!target || target === mime || !mime.startsWith('image/') || mime === 'image/gif') return { blob, mime };
    const bmp = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = canvas.getContext('2d');
    if (target === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    const out = await canvas.convertToBlob({ type: target, quality: Number(quality) || 0.92 });
    return { blob: out, mime: target };
  }

  // Runs `fn` over `list`, `limit` at a time, in order of completion.
  async function pool(list, limit, fn) {
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
      while (next < list.length) {
        const i = next++;
        await fn(list[i], i);
      }
    });
    await Promise.all(workers);
  }

  function guessExt(item) {
    const m = /\.(png|jpe?g|webp|gif|avif|mp4|webm|mov)(\?|#|$)/i.exec(item.url || '');
    if (m) return m[1].toLowerCase().replace('jpeg', 'jpg');
    return item.type === 'video' ? 'mp4' : 'png';
  }

  function csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  async function runDownload(job) {
    const total = job.items.length;
    let done = 0;
    let failed = 0;
    const zipEntries = [];
    const manifest = [];
    const usedNames = new Set();
    const okKeys = [];
    const unique = (name) => {
      let n = name;
      for (let i = 2; usedNames.has(n.toLowerCase()); i++) n = name.replace(/(\.[^./]+)$/, `-${i}$1`);
      usedNames.add(n.toLowerCase());
      return n;
    };

    send({ type: 'progress', jobId: job.id, phase: 'fetch', done, total, failed });
    await pool(job.items, 3, async (item) => {
      try {
        const got = await fetchMedia(item);
        const { blob, mime } = await convert(got.blob, got.mime, job.format, job.quality);
        const filename = unique(`${item.name}.${EXT[mime] || guessExt(item)}`);
        manifest.push({ file: filename, item });
        if (job.zip) {
          zipEntries.push({ name: filename, blob });
          okKeys.push(item.key);
          if (job.savePromptTxt && item.prompt) {
            zipEntries.push({ name: filename.replace(/\.[^.]+$/, '.txt'), blob: new Blob([item.prompt + '\n'], { type: 'text/plain' }) });
          }
        } else {
          send({ type: 'file', jobId: job.id, filename, url: URL.createObjectURL(blob), keys: [item.key], blob: true });
          if (job.savePromptTxt && item.prompt) {
            const txt = new Blob([item.prompt + '\n'], { type: 'text/plain' });
            send({ type: 'file', jobId: job.id, filename: filename.replace(/\.[^.]+$/, '.txt'), url: URL.createObjectURL(txt), keys: [], blob: true, aux: true });
          }
        }
      } catch (e) {
        failed++;
        console.warn('[Flow Helper] gagal mengambil', item.url, e);
        // Let the browser try it the ordinary way, with its own cookies.
        if (/^https?:/.test(item.url)) {
          send({ type: 'file', jobId: job.id, filename: `${job.zip ? job.zipName.replace(/\.zip$/, '') + '/' : ''}${item.name}.${guessExt(item)}`, url: item.url, keys: [item.key], direct: true });
        }
      }
      done++;
      send({ type: 'progress', jobId: job.id, phase: 'fetch', done, total, failed });
    });

    if (job.zip && zipEntries.length) {
      send({ type: 'progress', jobId: job.id, phase: 'pack', done, total, failed });
      if (job.saveManifest) {
        manifest.sort((a, b) => a.file.localeCompare(b.file));
        const rows = [['file', 'prompt', 'width', 'height', 'type', 'source_url']].concat(
          manifest.map(({ file, item }) => [file, item.prompt, item.w, item.h, item.type, item.url.startsWith('data:') ? '' : item.url])
        );
        // The BOM lets Excel read the UTF-8 correctly.
        const csv = '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
        zipEntries.push({ name: 'prompts.csv', blob: new Blob([csv], { type: 'text/csv' }) });
      }
      const zip = await FH.makeZip(zipEntries);
      send({ type: 'file', jobId: job.id, filename: job.zipName, url: URL.createObjectURL(zip), keys: okKeys, blob: true });
    }

    const okCount = total - failed;
    let message = job.zip ? `ZIP berisi ${okCount} file sedang disimpan.` : `${okCount} file sedang disimpan.`;
    if (failed) message += ` ${failed} gagal diambil langsung, dicoba lewat unduhan biasa.`;
    send({ type: 'done', jobId: job.id, ok: okCount > 0, failed, message });
  }

  function wrapLines(ctx, text, maxWidth, maxLines) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width <= maxWidth) {
        line = test;
        continue;
      }
      if (line) lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    }
    if (line && lines.length < maxLines) lines.push(line);
    if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
      let last = lines[maxLines - 1];
      while (last && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
      lines[maxLines - 1] = last + '…';
    }
    return lines;
  }

  async function runSheet(job) {
    const total = job.items.length;
    let done = 0;
    let failed = 0;
    const bitmaps = new Array(total);
    send({ type: 'progress', jobId: job.id, phase: 'fetch', done, total, failed, label: 'Mengambil' });
    await pool(job.items, 3, async (item, i) => {
      try {
        const { blob, mime } = await fetchMedia(item);
        if (!mime.startsWith('image/')) throw new Error('bukan gambar');
        bitmaps[i] = await createImageBitmap(blob);
      } catch (e) {
        failed++;
      }
      done++;
      send({ type: 'progress', jobId: job.id, phase: 'fetch', done, total, failed, label: 'Mengambil' });
    });
    if (failed === total) {
      send({ type: 'done', jobId: job.id, ok: false, failed, message: 'Lembar kontak gagal: tidak ada gambar yang bisa diambil.' });
      return;
    }
    send({ type: 'progress', jobId: job.id, phase: 'pack', done, total, failed });

    const cols = Math.max(1, Math.min(10, job.columns || 4, total));
    const rows = Math.ceil(total / cols);
    const ratios = bitmaps.filter(Boolean).map((b) => b.height / b.width).sort((a, b) => a - b);
    const ratio = ratios[Math.floor(ratios.length / 2)] || 1;
    const pad = 16;
    const headerH = 64;
    const captionH = job.captions ? 52 : 0;
    let cellW = Math.min(640, Math.floor((4096 - pad * (cols + 1)) / cols));
    // Keep the sheet inside what a canvas can hold.
    const heightFor = (w) => headerH + rows * (Math.round(w * ratio) + captionH + pad) + pad;
    while (heightFor(cellW) > 16000 && cellW > 80) cellW = Math.floor(cellW * 0.9);
    const cellH = Math.round(cellW * ratio);
    const width = pad * (cols + 1) + cellW * cols;
    const height = heightFor(cellW);

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#121316';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#e8eaed';
    ctx.font = '600 26px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(job.title || 'Lembar kontak', pad, headerH / 2);

    for (let i = 0; i < total; i++) {
      const x = pad + (i % cols) * (cellW + pad);
      const y = headerH + Math.floor(i / cols) * (cellH + captionH + pad);
      ctx.fillStyle = '#1f2126';
      ctx.fillRect(x, y, cellW, cellH);
      const bmp = bitmaps[i];
      if (bmp) {
        const s = Math.min(cellW / bmp.width, cellH / bmp.height);
        const w = bmp.width * s;
        const hgt = bmp.height * s;
        ctx.drawImage(bmp, x + (cellW - w) / 2, y + (cellH - hgt) / 2, w, hgt);
        bmp.close();
      } else {
        ctx.fillStyle = '#9aa0a6';
        ctx.font = '16px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('gagal dimuat', x + cellW / 2, y + cellH / 2);
        ctx.textAlign = 'left';
      }
      const label = job.items[i].label;
      ctx.font = '700 18px system-ui, sans-serif';
      const lw = ctx.measureText(label).width + 14;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(x + 8, y + 8, lw, 26);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, x + 15, y + 21);
      if (captionH) {
        ctx.fillStyle = '#9aa0a6';
        ctx.font = '14px system-ui, sans-serif';
        const lines = wrapLines(ctx, job.items[i].caption || '', cellW, 2);
        lines.forEach((l, li) => ctx.fillText(l, x, y + cellH + 16 + li * 18));
      }
    }
    const png = await canvas.convertToBlob({ type: 'image/png' });
    send({ type: 'file', jobId: job.id, filename: job.filename, url: URL.createObjectURL(png), keys: [], blob: true, aux: true });
    send({
      type: 'done',
      jobId: job.id,
      ok: true,
      failed,
      message: `Lembar kontak (${total - failed} gambar) sedang disimpan.` + (failed ? ` ${failed} gagal dimuat.` : '')
    });
  }

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (msg.target !== 'offscreen') return;
    reply({ ok: true });
    if (msg.type === 'job') {
      const run = msg.job.kind === 'sheet' ? runSheet : runDownload;
      run(msg.job).catch((e) => send({ type: 'done', jobId: msg.job.id, ok: false, failed: msg.job.items.length, message: 'Gagal: ' + e.message }));
    } else if (msg.type === 'revoke') {
      URL.revokeObjectURL(msg.url);
    }
  });

  send({ type: 'offscreen-ready' });
})();
