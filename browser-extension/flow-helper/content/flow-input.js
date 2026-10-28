// Talks to Flow's prompt box: finds it, fills it, presses its create button.
(function () {
  'use strict';
  const FH = self.FH;
  const flow = (FH.flow = {});

  const SUBMIT_ICON = /^(arrow_forward|arrow_upward|send|north)$/;
  const SUBMIT_LABEL = /(create|generate|submit|send|buat|hasilkan|kirim)/i;

  function visible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  }

  flow.findPromptBox = function () {
    const known = document.getElementById('PINHOLE_TEXT_AREA_ELEMENT_ID');
    if (known && visible(known)) return known;
    const candidates = [
      ...document.querySelectorAll('textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"]')
    ].filter((el) => visible(el) && !el.closest('#flow-helper-root') && !el.disabled && !el.readOnly);
    if (!candidates.length) return null;
    // The prompt box is the biggest text field on the page.
    return candidates.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return rb.width * rb.height - ra.width * ra.height;
    })[0];
  };

  flow.readPrompt = function (box) {
    box = box || flow.findPromptBox();
    if (!box) return '';
    return ('value' in box && box.tagName === 'TEXTAREA' ? box.value : box.innerText || '').trim();
  };

  flow.setPrompt = function (text, box) {
    box = box || flow.findPromptBox();
    if (!box) throw new Error('Kotak prompt Flow tidak ditemukan.');
    box.focus();
    if (box.tagName === 'TEXTAREA' || box.tagName === 'INPUT') {
      // The prototype setter, so React notices the change.
      const proto = box.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(box, text);
      box.dispatchEvent(new Event('input', { bubbles: true }));
      box.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      // Rich editors (Slate, Lexical) listen for real editing commands.
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(box);
      sel.removeAllRanges();
      sel.addRange(range);
      if (!document.execCommand('insertText', false, text)) {
        box.textContent = text;
        box.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
      }
    }
    return box;
  };

  function iconText(btn) {
    return [...btn.querySelectorAll('i, span, mat-icon')]
      .map((n) => (n.textContent || '').trim())
      .find((t) => SUBMIT_ICON.test(t));
  }

  flow.findSubmit = function (box) {
    box = box || flow.findPromptBox();
    if (!box) return null;
    let scope = box.parentElement;
    for (let depth = 0; depth < 7 && scope; depth++, scope = scope.parentElement) {
      const buttons = [...scope.querySelectorAll('button, [role="button"]')].filter(
        (b) => visible(b) && !b.closest('#flow-helper-root')
      );
      if (!buttons.length) continue;
      const byIcon = buttons.find((b) => iconText(b));
      if (byIcon) return byIcon;
      const byLabel = buttons.find((b) =>
        SUBMIT_LABEL.test((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || ''))
      );
      if (byLabel) return byLabel;
    }
    return null;
  };

  flow.isSubmitButton = function (el) {
    const btn = el && el.closest && el.closest('button, [role="button"]');
    if (!btn) return false;
    const found = flow.findSubmit();
    return !!found && (found === btn || btn.contains(found) || found.contains(btn));
  };

  flow.submit = async function (text) {
    const box = flow.setPrompt(text);
    // Let React re-render and enable the button.
    await FH.sleep(400);
    const btn = flow.findSubmit(box);
    FH.scanner.recordSubmission(text);
    if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') {
      btn.click();
    } else {
      const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
      box.dispatchEvent(new KeyboardEvent('keydown', opts));
      box.dispatchEvent(new KeyboardEvent('keypress', opts));
      box.dispatchEvent(new KeyboardEvent('keyup', opts));
    }
    return true;
  };

  flow.insert = function (text) {
    const box = flow.setPrompt(text);
    box.focus();
  };

  // Notes every prompt the user sends by hand, for naming and history.
  flow.watchSubmissions = function (onSubmit) {
    const capture = () => {
      const text = flow.readPrompt();
      if (text && FH.scanner.recordSubmission(text)) onSubmit(text);
    };
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key !== 'Enter' || e.shiftKey || e.isComposing || !e.isTrusted) return;
        const box = flow.findPromptBox();
        if (box && (e.target === box || box.contains(e.target))) capture();
      },
      true
    );
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (e.isTrusted && flow.isSubmitButton(e.target)) capture();
      },
      true
    );
  };

  FH.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
})();
