/* Read-only audit of the responsive footer. Renders index.html in headless
   Chromium at several widths and reports concrete geometry problems. */
const os = require('os');
const path = require('path');
const fs = require('fs');

function findChromium() {
  const roots = [
    path.join(os.homedir(), '.cache', 'puppeteer', 'chrome'),
    path.join(os.homedir(), '.cache', 'puppeteer', 'chrome-headless-shell'),
    path.join(process.env.LOCALAPPDATA || '', 'ms-playwright'),
    path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application'),
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application'),
    path.join(process.env.LOCALAPPDATA || '', 'Chromium', 'Application'),
  ].filter(Boolean);
  const out = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const stack = [root];
    while (stack.length) {
      const dir = stack.pop();
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) stack.push(full);
        else if (/^(chrome|chrome-headless-shell|chromium)(\.exe)?$/i.test(e.name)) out.push(full);
      }
    }
    if (out.length) return out[0];
  }
  return null;
}

const exe = findChromium();
if (!exe) { console.log('NO CHROMIUM FOUND'); process.exit(2); }
console.log('using:', exe);

const htmlPath = path.resolve('index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const styleCss = fs.readFileSync(path.resolve('style.css'), 'utf8');

const STYLE = `
:root{--color-accent:#597e34;--color-accent-dark:#3f5c24;--color-accent-light:#7ba34d;--color-dark:#0d1309;--color-dark-2:#080b06;--color-text:rgba(245,244,240,.78);--color-text-light:rgba(245,244,240,.92);--color-white:#f5f4f0;--font-heading:"Bebas Neue",sans-serif;--font-body:"Montserrat",sans-serif;--header-height:110px;--container-max:1440px;--container-padding:110px;--transition:.35s cubic-bezier(.25,.8,.25,1)}
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{font-family:var(--font-body);font-size:16px;line-height:1.6;color:var(--color-text);background:var(--color-dark);overflow-x:hidden}
img,svg{display:block;max-width:100%}
a{text-decoration:none;color:inherit}
ul,ol{list-style:none}
button{border:none;background:none;cursor:pointer;font-family:inherit}
html{font-size:16px}
body{opacity:1!important}
`;

const PROBE = () => {
  const R = (el) => (el ? el.getBoundingClientRect() : null);
  const font = (el) => getComputedStyle(el).fontFamily;
  const out = { problems: [], notes: [] };

  const footer = document.querySelector('.footer, footer');
  if (!footer) { out.problems.push('no .footer element found'); return out; }
  const fbox = R(footer);

  const container = footer.querySelector('.footer__container');
  if (!container) { out.problems.push('no .footer__container found'); return out; }
  const cbox = R(container);

  const logo = footer.querySelector('.footer__logo-img, .footer__logo img, .footer__logo');
  const nav = footer.querySelector('.footer__nav');
  const navLinks = [...footer.querySelectorAll('.footer__nav a, .footer__nav-link')];
  const socials = [...footer.querySelectorAll('.footer__social-link')];
  const divider = footer.querySelector('.footer__divider, hr');
  const bottom = footer.querySelector('.footer__bottom');
  const copyright = footer.querySelector('.footer__copyright');
  const legal = footer.querySelector('.footer__legal');
  const legalLinks = [...footer.querySelectorAll('.footer__legal a, .footer__legal-link')];

  const outside = (name, el) => {
    if (!el) return;
    const r = R(el);
    if (r.width === 0 && r.height === 0) return;
    if (r.right > cbox.right + 1 || r.left < cbox.left - 1) {
      out.problems.push(name + ' escapes .footer__container by ' +
        Math.round(Math.max(r.right - cbox.right, cbox.left - r.left)) + 'px');
    }
  };
  [logo, nav, ...navLinks, ...socials, bottom, copyright, legal, ...legalLinks].forEach(
    (el, i) => outside('footer item #' + i, el));

  const docOv = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  if (docOv > 1) {
    const culprits = [];
    document.querySelectorAll('body *').forEach((el) => {
      const r = R(el);
      if (r.width && (r.right > document.documentElement.clientWidth + 1)) {
        const cls = (el.className && el.className.toString().split(' ')[0]) || '';
        culprits.push(el.tagName.toLowerCase() + (cls ? '.' + cls : '') + '@' + Math.round(r.right));
      }
    });
    out.problems.push('HORIZONTAL OVERFLOW ' + docOv + 'px (' + culprits.slice(0, 8).join(', ') + ')');
  }

  if (logo) {
    const lr = R(logo);
    if (lr.left < cbox.left - 1) out.problems.push('logo not aligned with container padding');
    out.notes.push('logo ' + Math.round(lr.width) + 'x' + Math.round(lr.height) +
      ' natural=' + (logo.naturalWidth ? logo.naturalWidth + 'x' + logo.naturalHeight : 'n/a') +
      ' ratio=' + (lr.width / lr.height).toFixed(3) +
      (logo.naturalWidth ? ' naturalRatio=' + (logo.naturalWidth / logo.naturalHeight).toFixed(3) : '') +
      ' font=' + font(footer));
    if (logo.naturalWidth) {
      const a = lr.width / lr.height, b = logo.naturalWidth / logo.naturalHeight;
      if (Math.abs(a - b) / b > 0.03) out.problems.push('logo is stretched (aspect broken)');
    }
  } else out.problems.push('footer logo missing');

  if (!nav || navLinks.length === 0) out.problems.push('.footer__nav has no links');
  else {
    const nr = R(nav);
    const tops = navLinks.map((l) => Math.round(R(l).top));
    const navRows = new Set(tops).size;
    if (socials.length) {
      const srs = socials.map(R);
      const sr = { left: Math.min(...srs.map((r) => r.left)), right: Math.max(...srs.map((r) => r.right)),
                   top: Math.min(...srs.map((r) => r.top)), bottom: Math.max(...srs.map((r) => r.bottom)) };
      const navBottom = Math.max(...navLinks.map((l) => R(l).bottom));
      const logoTop = R(logo).top;
      if (!(navBottom <= logoTop + 8 || logoTop >= navBottom)) {
        if (navRows > 2) out.problems.push('socials pushed below nav / nav wraps to ' + navRows + ' rows');
      }
      const heights = srs.map((r) => Math.round(r.height));
      if (new Set(heights).size > 1) out.problems.push('social links unequal height ' + heights.join('/'));
      const tops2 = srs.map((r) => Math.round(r.top));
      if (new Set(tops2).size > 1) out.problems.push('social links not on one row, tops ' + tops2.join('/'));
      if (!(R(logo).right <= sr.left)) out.problems.push('socials not after nav in reading order');
      out.notes.push('socials ' + Math.round(sr.width) + 'x' + Math.round(sr.height) +
        ' at x' + Math.round(sr.left) + ' y' + Math.round(sr.top) + ' heights=' + heights.join('/'));
      srs.forEach((r, i) => {
        const img = socials[i].querySelector('img');
        if (img && img.naturalWidth) {
          const ratioX = r.width / img.naturalWidth, ratioY = r.height / img.naturalHeight;
          if (Math.abs(ratioX - ratioY) / ratioY > 0.08) {
            out.problems.push('social icon #' + i + ' stretched (' + img.naturalWidth + 'x' +
              img.naturalHeight + ' -> ' + Math.round(r.width) + 'x' + Math.round(r.height) + ')');
          }
        } else if (img) {
          out.problems.push('social icon #' + i + ' failed to load: ' + img.getAttribute('src'));
        }
      });
    }
    const navRight = Math.max(...navLinks.map((l) => R(l).right));
    if (navRight > cbox.right + 1) out.problems.push('nav overflows container');
    if (navRows > 2) out.notes.push('nav renders in ' + navRows + ' rows');
    void nr;
  }

  if (bottom) {
    const br = R(bottom);
    if (br.right > cbox.right + 1) out.problems.push('bottom row overflows container');
    if (br.bottom > fbox.bottom + 1) out.problems.push('bottom row overflows footer');
    const legalRight = legalLinks.length ? Math.max(...legalLinks.map((l) => R(l).right)) : null;
    const legalLeft = legalLinks.length ? Math.min(...legalLinks.map((l) => R(l).left)) : null;
    const legalTops = legalLinks.length ? new Set(legalLinks.map((l) => Math.round(R(l).top))).size : 0;
    const cr = R(copyright);
    out.notes.push('bottom: copyright@x' + Math.round(cr.left) + ' legal x' + Math.round(legalLeft) +
      '..' + Math.round(legalRight) + ' legalRows=' + legalTops);
    if (legalTops > 2) out.problems.push('legal links wrap to ' + legalTops + ' rows');
  } else out.problems.push('.footer__bottom missing');

  if (divider) {
    const dr = R(divider);
    out.notes.push('divider x' + Math.round(dr.left) + '..' + Math.round(dr.right) +
      ' (container x' + Math.round(cbox.left) + '..' + Math.round(cbox.right) + ')');
    if (dr.right > cbox.right + 1 || dr.left < cbox.left - 1) out.problems.push('divider wider than container');
  } else out.problems.push('divider missing');

  const cs = getComputedStyle(footer);
  out.notes.push('footer bg=' + cs.backgroundColor + ' font=' + cs.fontFamily.split(',')[0]);
  return out;
};

const VIEWPORTS = [
  { name: 'desktop 1440', width: 1440, height: 900 },
  { name: 'laptop 1200', width: 1200, height: 800 },
  { name: 'tablet 1024', width: 1024, height: 768 },
  { name: 'tablet 860', width: 860, height: 700 },
  { name: 'phone 480', width: 480, height: 800 },
  { name: 'phone 375', width: 375, height: 700 },
  { name: 'phone 320', width: 320, height: 700 },
];

async function runCDP() {
  const { spawn } = require('child_process');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'footer-audit-'));
  const port = 9333;
  const proc = spawn(exe, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--hide-scrollbars', '--font-render-hinting=none',
    '--disable-features=TranslateUI', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking',
    '--disable-sync', '--metrics-recording-only', '--safebrowsing-disable-auto-update',
    '--user-data-dir=' + tmp, '--remote-debugging-port=' + port, 'about:blank',
  ], { stdio: 'ignore' });

  const http = (p, method = 'GET', body) => new Promise((res, rej) => {
    const data = body ? JSON.stringify(body) : null;
    const req = require('http').request(
      { host: '127.0.0.1', port, path: p, method, headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {} },
      (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res(b)); });
    req.on('error', rej); if (data) req.write(data); req.end();
  });

  const t0 = Date.now();
  while (Date.now() - t0 < 25000) {
    try { await http('/json/version'); break; } catch { await new Promise((r) => setTimeout(r, 300)); }
  }

  const WebSocket = (await import('node:ws')).default;
  const target = JSON.parse(await http('/json/new?about:blank')).webSocketDebuggerUrl;
  const ws = new WebSocket(target, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });

  let idc = 0; const pending = new Map();
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  const send = (method, params) => new Promise((res) => {
    const id = ++idc; pending.set(id, res); ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) console.log('EVAL ERR', JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    return r.result && r.result.result ? r.result.result.value : null;
  };

  await send('Page.enable', {});
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  const results = [];
  for (const vp of VIEWPORTS) {
    const doc = html.replace('</head>',
      '<style>' + STYLE.replace(/</g, '\\u003c') + '</style><style>' + styleCss.replace(/</g, '\\u003c') + '</style></head>');
    await send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: 'file:///' + htmlPath.replace(/\\/g, '/') });
    await new Promise((r) => setTimeout(r, 2200));
    const inj = await evaluate('(function(){' +
      'document.querySelectorAll("style[data-audit]").forEach(s=>s.remove());' +
      'var a=document.createElement("style");a.setAttribute("data-audit","1");a.textContent=' +
      JSON.stringify(STYLE + styleCss) + ';document.head.appendChild(a);' +
      'document.querySelectorAll("link[rel=stylesheet]").forEach(l=>l.remove());' +
      'return document.fonts ? document.fonts.status : "n/a";})()');
    await new Promise((r) => setTimeout(r, 1000));
    await evaluate('new Promise(r=>{var n=0;var iv=setInterval(()=>{if(++n>12){clearInterval(iv);r(1)}else{requestAnimationFrame(()=>window.scrollTo(0,document.body.scrollHeight))}},260)})');
    await new Promise((r) => setTimeout(r, 900));
    const res = await evaluate('(' + PROBE.toString() + ')()');
    results.push({ vp, res, fonts: inj });
  }

  ws.close(); proc.kill();
  return results;
}

(async () => {
  const results = await runCDP();
  let total = 0;
  for (const { vp, res, fonts } of results) {
    console.log('\n===== ' + vp.name + ' (' + vp.width + 'x' + vp.height + ') fonts=' + fonts + ' =====');
    if (!res) { console.log('  probe failed'); continue; }
    res.notes.forEach((n) => console.log('  . ' + n));
    if (res.problems.length === 0) console.log('  OK — проблем нет');
    else res.problems.forEach((p) => console.log('  X ' + p));
    total += res.problems.length;
  }
  console.log('\nTOTAL PROBLEMS: ' + total);
  process.exit(0);
})().catch((e) => { console.log('FAILED:', e && e.message); process.exit(3); });
