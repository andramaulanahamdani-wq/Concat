// Sends a list of prompts to Flow one after another.
//
// The remaining prompts are kept in storage after every step, so a reload
// or a crashed tab can pick the run up where it stopped.
(function () {
  'use strict';
  const FH = self.FH;

  class PromptQueue {
    constructor() {
      this.items = [];
      this.index = 0;
      this.state = 'idle'; // idle | running | paused
      this.listeners = new Set();
      this.log = [];
    }

    on(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }

    emit() {
      for (const fn of this.listeners) fn(this);
    }

    addLog(text) {
      const t = new Date();
      this.log.unshift(`${FH.timeStamp(t).replace(/-/g, ':')}  ${text}`);
      this.log.length = Math.min(this.log.length, 100);
      this.emit();
    }

    async persist() {
      if (this.state === 'idle' || this.index >= this.items.length) {
        await chrome.storage.local.remove('pendingQueue');
      } else {
        await chrome.storage.local.set({ pendingQueue: { items: this.items, index: this.index, at: Date.now() } });
      }
    }

    // Builds the prompt list: variants expanded, style appended, repeated.
    static build(raw, opts) {
      const style = (opts.style || '').trim();
      const repeat = Math.max(1, Math.min(20, opts.repeat || 1));
      const out = [];
      for (const p of FH.parsePromptList(raw)) {
        for (const v of FH.expandVariants(p)) {
          const full = style ? `${v.replace(/[\s,.]+$/, '')}, ${style}` : v;
          for (let i = 0; i < repeat; i++) out.push(full);
        }
      }
      return out.slice(0, 1000);
    }

    async start(items, startAt) {
      if (this.state === 'running') return;
      this.items = items;
      this.index = startAt || 0;
      this.state = 'running';
      this.addLog(`Antrean dimulai: ${items.length - this.index} prompt.`);
      await this.persist();
      this.run();
    }

    pause() {
      if (this.state !== 'running') return;
      this.state = 'paused';
      this.addLog('Dijeda.');
    }

    resume() {
      if (this.state !== 'paused') return;
      this.state = 'running';
      this.addLog('Dilanjutkan.');
      this.run();
    }

    async stop() {
      const wasActive = this.state !== 'idle';
      this.state = 'idle';
      this.runId = null;
      await chrome.storage.local.remove('pendingQueue');
      if (wasActive) this.addLog('Dihentikan.');
      this.emit();
    }

    // Waits in small steps so pause and stop take effect quickly; a pause
    // holds the countdown where it is. False when the run was stopped.
    async wait(ms, runId) {
      let left = ms;
      for (;;) {
        if (this.runId !== runId || this.state === 'idle') return false;
        if (this.state === 'paused') {
          await FH.sleep(300);
          continue;
        }
        if (left <= 0) break;
        const secs = Math.ceil(left / 1000);
        if (secs !== this.remaining) {
          this.remaining = secs;
          this.emit();
        }
        await FH.sleep(250);
        left -= 250;
      }
      if (this.remaining) {
        this.remaining = 0;
        this.emit();
      }
      return true;
    }

    async run() {
      const runId = (this.runId = FH.uid());
      const settings = await FH.getSettings();
      while (this.index < this.items.length) {
        if (!(await this.wait(0, runId))) return;
        const prompt = this.items[this.index];
        const before = FH.scanner.scan(settings).length;
        try {
          await FH.flow.submit(prompt);
          FH.onPromptSent && FH.onPromptSent(prompt);
          this.addLog(`#${this.index + 1} terkirim: ${prompt.slice(0, 70)}`);
        } catch (e) {
          this.addLog(`#${this.index + 1} gagal: ${e.message}`);
          this.state = 'paused';
          this.emit();
          if (!(await this.wait(0, runId))) return;
          continue;
        }
        this.index++;
        await this.persist();
        this.emit();
        if (this.index >= this.items.length) break;

        if (settings.queueWaitForResult) {
          const end = Date.now() + settings.queueMaxWait * 1000;
          let appeared = false;
          while (Date.now() < end) {
            if (!(await this.wait(1000, runId))) return;
            if (FH.scanner.scan(settings).length > before) {
              appeared = true;
              break;
            }
          }
          if (!appeared) this.addLog('Hasil belum terlihat, lanjut ke prompt berikutnya.');
        }
        if (!(await this.wait(settings.queueDelay * 1000, runId))) return;
      }
      this.state = 'idle';
      await this.persist();
      this.addLog('Antrean selesai.');
      if (settings.notifyDone) {
        chrome.runtime.sendMessage({
          type: 'notify',
          title: 'Antrean prompt selesai',
          message: `${this.items.length} prompt sudah dikirim ke Flow.`
        });
      }
      this.emit();
    }
  }

  FH.PromptQueue = PromptQueue;
  FH.queue = new PromptQueue();
})();
