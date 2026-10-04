/* Temporary diagnostic: what actually renders inside .hero at desktop + phone */
'use strict';
const { chromium } = require('playwright-core');
const fs = require('fs');
const URL = 'file:///C:/Users/atmur/Documents/Web-site-sos/index.html';

const EXE = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter((p) => p && fs.existsSync(p))[0];
console.log('using browser:', EXE);

const probe = () => {
  const hero = document.querySelector('.hero');
  const bg = document.querySelector('.hero-bg');
  const cs = getComputedStyle(bg);
  const heroCs = getComputedStyle(hero);
  const pg = document.querySelector('.hero__pagination');
  const pgCs = getComputedStyle(pg);
  const next = document.querySelector('.hero__next');
  const nextCs = getComputedStyle(next);
  return {
    hero: { pos: heroCs.position, zIndex: heroCs.zIndex, h: Math.round(hero.getBoundingClientRect().height) },
    bg: { image: cs.backgroundImage, zIndex: cs.zIndex, pos: cs.position, rect: bg.getBoundingClientRect().toJSON() },
    pagination: { display: pgCs.display, rect: pg.getBoundingClientRect().toJSON() },
    next: { display: nextCs.display, pointerEvents: nextCs.pointerEvents, rect: next.getBoundingClientRect().toJSON() },
  };
};

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport: vp });
    const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    page.on('requestfailed', (r) => errs.push('requestfailed: ' + r.url() + ' ' + (r.failure() && r.failure().errorText)));
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForTimeout(600);
    console.log('\n=== viewport ' + vp.width + 'x' + vp.height + ' ===');
    console.log(JSON.stringify(await page.evaluate(probe), null, 2));
    const broken = await page.evaluate(() => Array.from(document.images)
      .filter((i) => !i.complete || i.naturalWidth === 0)
      .map((i) => ({ src: i.getAttribute('src'), complete: i.complete, nw: i.naturalWidth })));
    console.log('broken <img>:', broken.length ? JSON.stringify(broken) : 'none');
    const bgCheck = await page.evaluate(async () => {
      const raw = getComputedStyle(document.querySelector('.hero-bg')).backgroundImage;
      const url = raw.slice(raw.indexOf('"') + 1, raw.lastIndexOf('"'));
      try {
        const r = await fetch(url, { method: 'GET' });
        return { url, status: r.status, ok: r.ok };
      } catch (e) { return { url, error: String(e) }; }
    });
    console.log('hero-bg fetch:', JSON.stringify(bgCheck));
    await page.screenshot({ path: 'tools/hero-' + vp.width + '.png' });
    console.log('errors:', errs.length ? errs : 'none');
    await page.close();
  }
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
