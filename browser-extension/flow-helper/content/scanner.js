// Finds the generated images (and optionally videos) on a Flow page.
//
// Flow's markup changes often, so nothing here depends on its class names:
// every <img>, <video> and inline background image is a candidate, and the
// size filter is what separates results from icons and avatars.
(function () {
  'use strict';
  const FH = self.FH;
  const scanner = (FH.scanner = {});

  // Prompts the user sent in this tab, newest last, so a picture that
  // appears after a submission can be named after it.
  scanner.submissions = [];
  // key -> time the item was first seen in this tab.
  scanner.firstSeen = new Map();

  function absolute(url) {
    try {
      return new URL(url, location.href).href;
    } catch (e) {
      return '';
    }
  }

  // Thumbnails are often scaled copies; ask for the original instead.
  scanner.upgradeUrl = function (url) {
    if (!url) return url;
    try {
      const u = new URL(url, location.href);
      // Next.js image optimiser: /_next/image?url=<original>&w=640&q=75
      if (u.pathname.endsWith('/_next/image') && u.searchParams.get('url')) {
        return scanner.upgradeUrl(absolute(u.searchParams.get('url')));
      }
      // googleusercontent sizing suffix: ...=w400-h300-c -> ...=s0 (original)
      if (/googleusercontent\.com$/.test(u.hostname) && /=[swh]\d+[^/]*$/.test(u.pathname + u.search)) {
        return u.href.replace(/=[swh]\d+[^/?#]*$/, '=s0');
      }
      return u.href;
    } catch (e) {
      return url;
    }
  };

  // The same picture can come back with a fresh signature in its query
  // string, so the key keeps only what identifies the file.
  scanner.keyFor = function (url) {
    if (!url) return '';
    if (url.startsWith('data:')) return 'data:' + FH.shortHash(url);
    try {
      const u = new URL(url);
      for (const p of ['name', 'mediaGenerationId', 'id', 'mediaKey']) {
        if (u.searchParams.get(p)) return u.origin + u.pathname + '?' + p + '=' + u.searchParams.get(p);
      }
      if (/googleapis\.com$|googleusercontent\.com$/.test(u.hostname)) return u.origin + u.pathname;
      return u.href;
    } catch (e) {
      return url;
    }
  };

  function bestFromSrcset(img) {
    const set = img.getAttribute('srcset');
    if (!set) return '';
    let best = '';
    let bestW = -1;
    for (const part of set.split(',')) {
      const [u, d] = part.trim().split(/\s+/);
      const w = parseFloat(d) || 1;
      if (u && w > bestW) {
        bestW = w;
        best = u;
      }
    }
    return best ? absolute(best) : '';
  }

  const ICON_WORD = /^[a-z0-9]+(_[a-z0-9]+)*$/;

  // The longest line of text near the picture that is not an icon name or
  // a button label: on most tiles that is the prompt.
  function nearbyText(el) {
    let node = el;
    for (let depth = 0; depth < 5 && node; depth++) {
      node = node.parentElement;
      if (!node || node === document.body) break;
      // Past the tile: this container holds other pictures and their text.
      if (node.querySelectorAll('img, video').length > 1) break;
      const text = (node.innerText || '').trim();
      if (text.length > 4000) break;
      const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length >= 15 && !ICON_WORD.test(l) && l.split(' ').length >= 3);
      if (lines.length) return lines.sort((a, b) => b.length - a.length)[0];
    }
    return '';
  }

  function attrPrompt(el) {
    for (const v of [el.getAttribute('alt'), el.getAttribute('title'), el.getAttribute('aria-label')]) {
      const t = (v || '').trim();
      if (t.length >= 15 && t.split(' ').length >= 3) return t;
    }
    return '';
  }

  function sessionPrompt(key) {
    const seen = scanner.firstSeen.get(key);
    if (!seen) return '';
    for (let i = scanner.submissions.length - 1; i >= 0; i--) {
      const s = scanner.submissions[i];
      // A generation takes seconds to minutes; anything older than 15
      // minutes is not what this picture came from.
      if (s.t <= seen && seen - s.t < 15 * 60 * 1000) return s.text;
    }
    return '';
  }

  scanner.promptFor = function (item) {
    return attrPrompt(item.el) || sessionPrompt(item.key) || nearbyText(item.el) || '';
  };

  function isExcludedUrl(url) {
    if (!url) return true;
    if (/^data:image\/svg|\.svg(\?|$)/i.test(url)) return true;
    try {
      const u = new URL(url);
      // Profile pictures.
      if (/googleusercontent\.com$/.test(u.hostname) && /^\/(a|a-)\//.test(u.pathname)) return true;
      if (/gstatic\.com$/.test(u.hostname)) return true;
    } catch (e) {
      return !url.startsWith('blob:') && !url.startsWith('data:');
    }
    return false;
  }

  function visibleRect(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? r : null;
  }

  scanner.scan = function (settings) {
    const minSize = settings.minSize || 0;
    const found = new Map();
    const add = (item) => {
      if (!item.url || isExcludedUrl(item.url)) return;
      item.key = scanner.keyFor(item.url);
      const prev = found.get(item.key);
      if (prev && prev.w * prev.h >= item.w * item.h) return;
      found.set(item.key, item);
    };

    for (const img of document.images) {
      if (img.closest('#flow-helper-root')) continue;
      if (!img.complete || !img.naturalWidth) continue;
      if (Math.max(img.naturalWidth, img.naturalHeight) < minSize) continue;
      const rect = visibleRect(img);
      if (!rect || Math.max(rect.width, rect.height) < 48) continue;
      const src = bestFromSrcset(img) || img.currentSrc || img.src;
      add({
        type: 'image',
        el: img,
        thumb: img.currentSrc || img.src,
        url: scanner.upgradeUrl(src),
        w: img.naturalWidth,
        h: img.naturalHeight
      });
    }

    if (settings.includeVideos) {
      for (const v of document.querySelectorAll('video')) {
        const rect = visibleRect(v);
        if (!rect || Math.max(rect.width, rect.height) < 48) continue;
        const src = v.currentSrc || v.src || (v.querySelector('source[src]') || {}).src;
        if (!src) continue;
        add({
          type: 'video',
          el: v,
          thumb: v.poster || '',
          url: absolute(src),
          w: v.videoWidth || Math.round(rect.width),
          h: v.videoHeight || Math.round(rect.height)
        });
      }
    }

    // Tiles drawn as CSS backgrounds instead of <img>.
    for (const el of document.querySelectorAll('[style*="background-image"]')) {
      if (el.closest('#flow-helper-root')) continue;
      const m = /url\(["']?([^"')]+)["']?\)/.exec(el.style.backgroundImage || '');
      if (!m) continue;
      const rect = visibleRect(el);
      if (!rect || Math.max(rect.width, rect.height) < Math.max(120, minSize / 2)) continue;
      const url = scanner.upgradeUrl(absolute(m[1]));
      add({ type: 'image', el, thumb: url, url, w: Math.round(rect.width), h: Math.round(rect.height) });
    }

    const now = Date.now();
    const items = [...found.values()];
    // Reading order: top to bottom, then left to right.
    const pos = new Map(items.map((it) => [it, it.el.getBoundingClientRect()]));
    items.sort((a, b) => {
      const ra = pos.get(a);
      const rb = pos.get(b);
      if (Math.abs(ra.top - rb.top) > 8) return ra.top - rb.top;
      return ra.left - rb.left;
    });
    for (const it of items) {
      if (!scanner.firstSeen.has(it.key)) scanner.firstSeen.set(it.key, now);
    }
    if (settings.reverseOrder) items.reverse();
    return items;
  };

  scanner.recordSubmission = function (text) {
    text = (text || '').trim();
    if (!text) return;
    const last = scanner.submissions[scanner.submissions.length - 1];
    // A click and an Enter can report the same submission.
    if (last && last.text === text && Date.now() - last.t < 3000) return;
    scanner.submissions.push({ text, t: Date.now() });
    if (scanner.submissions.length > 200) scanner.submissions.shift();
    return true;
  };

  // Reads blob: and data: URLs here, in the page, where they resolve; the
  // extension's own pages cannot open a page's blob: URL.
  scanner.toPortable = async function (url) {
    if (!url.startsWith('blob:')) return { url };
    const blob = await (await fetch(url)).blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
    return { url: dataUrl };
  };
})();
