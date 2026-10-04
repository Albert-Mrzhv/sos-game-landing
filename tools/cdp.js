/* Minimal Chrome DevTools Protocol client with zero npm dependencies.
   Talks to a system Chrome over its remote-debugging port using Node's
   built-in global WebSocket, so it works offline with no install step. */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

function findChrome() {
  for (const p of CHROME_CANDIDATES) {
    if (p && fs.existsSync(p)) return p;
  }
  throw new Error('no Chrome/Edge found — set CHROME_PATH');
}

function httpJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Session {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.waiters = [];
    ws.onmessage = (m) => {
      let msg;
      try {
        msg = JSON.parse(m.data);
      } catch {
        return;
      }
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
        this.waiters = this.waiters.filter((w) => {
          if (w.method === msg.method) {
            clearTimeout(w.timer);
            w.resolve(msg.params);
            return false;
          }
          return true;
        });
      }
    };
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  waitEvent(method, timeoutMs = 30000) {
    const seen = this.events.find((e) => e.method === method);
    if (seen) return Promise.resolve(seen.params);
    return new Promise((resolve, reject) => {
      const w = { method, resolve };
      w.timer = setTimeout(() => reject(new Error('timeout waiting for ' + method)), timeoutMs);
      this.waiters.push(w);
    });
  }

  reset() {
    this.events = [];
  }

  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('ws connect failed: ' + url));
  });
  return new Session(ws);
}

async function openBrowser() {
  const exe = findChrome();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-profile-'));
  const args = [
    '--headless=new',
    '--remote-debugging-port=0',
    '--remote-debugging-addr=127.0.0.1',
    '--user-data-dir=' + profile,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-component-update',
    '--disable-background-networking',
    '--disable-sync',
    '--metrics-recording-only',
    '--mute-audio',
    '--hide-scrollbars',
    '--default-background-color=FFFFFFFF',
    '--force-device-scale-factor=1',
    '--allow-file-access-from-files',
    '--disable-features=Translate',
    'about:blank',
  ];
  const proc = spawn(exe, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (d) => (stderr += d.toString()));

  const versionUrlFromStderr = () => {
    const m = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
    return m ? m[1] : null;
  };

  let browserWs = null;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    browserWs = versionUrlFromStderr();
    if (!browserWs) {
      const portFile = path.join(profile, 'DevToolsActivePort');
      if (fs.existsSync(portFile)) {
        try {
          const port = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();
          if (port) {
            const v = await httpJson('http://127.0.0.1:' + port + '/json/version').catch(() => null);
            if (v && v.webSocketDebuggerUrl) browserWs = v.webSocketDebuggerUrl;
          }
        } catch {}
      }
    }
    if (browserWs) break;
    await sleep(150);
  }
  if (!browserWs) throw new Error('chrome did not expose a debugging endpoint\n' + stderr);

  const browser = await connect(browserWs);
  const portFromWs = browserWs.match(/:(\d+)\//);
  const base = 'http://127.0.0.1:' + (portFromWs ? portFromWs[1] : '');
  return {
    exe,
    proc,
    profile,
    browser,
    async newPage() {
      const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
      let info = null;
      for (let i = 0; i < 60; i++) {
        const list = await httpJson(base + '/json/list').catch(() => []);
        info = list.find((t) => t.id === targetId && t.webSocketDebuggerUrl);
        if (info) break;
        await sleep(100);
      }
      if (!info) throw new Error('target never appeared');
      const page = await connect(info.webSocketDebuggerUrl);
      await page.send('Page.enable');
      await page.send('Runtime.enable');
      return {
        session: page,
        targetId,
        async goto(url, { waitMs = 700 } = {}) {
          page.reset();
          await page.send('Page.navigate', { url });
          await page.waitEvent('Page.loadEventFired', 30000);
          // let webfonts + layout settle
          await page.send('Runtime.evaluate', {
            expression:
              "document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))",
            awaitPromise: true,
          }).catch(() => {});
          await sleep(waitMs);
        },
        async setViewport({ width, height, deviceScaleFactor = 1, mobile = false, mobileEmulation = false }) {
          await page.send('Emulation.setDeviceMetricsOverride', {
            width,
            height,
            deviceScaleFactor,
            mobile: mobile || mobileEmulation,
          });
          await page.send('Runtime.evaluate', {
            expression: 'new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))',
            awaitPromise: true,
          }).catch(() => {});
          await sleep(120);
        },
        async evaluate(expression) {
          const r = await page.send('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true,
          });
          if (r.exceptionDetails) {
            throw new Error('page eval error: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
          }
          return r.result.value;
        },
        async screenshot(clip) {
          const params = { format: 'png', captureBeyondViewport: true };
          if (clip) params.clip = { ...clip, scale: 1 };
          const { data } = await page.send('Page.captureScreenshot', params);
          return Buffer.from(data, 'base64');
        },
        async close() {
          page.close();
          await browser.send('Target.closeTarget', { targetId }).catch(() => {});
        },
      };
    },
    async close() {
      browser.close();
      // Chrome runs as a process tree; proc.kill() alone orphans the real
      // browser process, which keeps the temp profile locked forever.
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        proc.kill('SIGKILL');
      }
      setTimeout(() => {
        try {
          fs.rmSync(profile, { recursive: true, force: true });
        } catch {}
      }, 1500);
    },
  };
}

process.once('exit', () => {});

module.exports = { openBrowser, findChrome, sleep };
