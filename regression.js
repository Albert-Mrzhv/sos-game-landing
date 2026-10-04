/* Full regression: overflow + console errors at all breakpoints, newsletter
   geometry at 1440 (desktop mock) and 390 (mobile mock /1.76). */
const { chromium } = require('playwright-core');
const fs = require('fs');
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const URL = 'file:///C:/Users/atmur/Documents/Web-site-sos/index.html';

(async () => {
  const browser = await chromium.launch({ executablePath: exe });
  let bad = 0;

  for (const w of [1920, 1440, 1240, 1024, 900, 860, 768, 640, 480, 414, 390, 360, 320]) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const o = await page.evaluate(() => {
      const s = document.getElementById('subscribe');
      const q = (x) => s.querySelector(x).getBoundingClientRect();
      const a = q('.newsletter__art'), t = q('.newsletter__label'), f = q('.newsletter__form');
      return { doc: document.documentElement.scrollWidth, inner: window.innerWidth,
        secH: Math.round(s.getBoundingClientRect().height),
        art: Math.round(a.left) + '..' + Math.round(a.right),
        labelX: Math.round(t.left), formW: Math.round(f.width) };
    });
    const over = o.doc > o.inner;
    const err = errs.length > 0;
    if (over || err) bad++;
    console.log(`${over || err ? 'FAIL' : 'ok  '} ${String(w).padStart(4)} secH=${String(o.secH).padStart(4)} art=${o.art.padEnd(10)} labelX=${String(o.labelX).padStart(3)} form=${o.formW}` + (over ? ' OVERFLOW' : '') + (err ? ' ' + errs[0] : ''));
    await page.close();
  }

  console.log(bad ? bad + ' problem(s)' : 'all clean');
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
