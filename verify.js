/* Opening-page verification: console errors, missing files, broken images,
   horizontal overflow, and real gallery/hero behaviour at each breakpoint. */
const { chromium } = require('playwright-core');
const fs = require('fs');

const exe = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));

const URL = 'file:///C:/Users/atmur/Documents/Web-site-sos/index.html';
const WIDTHS = [1920, 1440, 1024, 768, 414, 390, 320];

(async () => {
  if (!exe) { console.log('NO BROWSER FOUND'); process.exit(1); }
  const browser = await chromium.launch({ executablePath: exe });
  let bad = 0;

  /* ---------- pass 1: load errors + overflow + broken assets ---------- */
  for (const w of WIDTHS) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 } });
    const problems = [];
    page.on('pageerror', (e) => problems.push('JS: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    page.on('requestfailed', (r) => problems.push('FAILED: ' + r.url().split('/').slice(-2).join('/') + ' (' + (r.failure() || {}).errorText + ')'));

    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForTimeout(600);

    const r = await page.evaluate(() => {
      const imgs = [...document.images].map((i) => ({
        src: i.currentSrc.split('/').pop(),
        broken: i.complete && i.naturalWidth === 0,
      }));
      const wide = [...document.querySelectorAll('body *')]
        .filter((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + 2)
        .slice(0, 5)
        .map((e) => e.className || e.tagName);
      const hero = document.querySelector('.hero__bg img');
      const heroBox = hero ? hero.getBoundingClientRect() : null;
      return {
        doc: document.documentElement.scrollWidth,
        inner: window.innerWidth,
        total: imgs.length,
        broken: imgs.filter((i) => i.broken).map((i) => i.src),
        overflowing: wide,
        hero: heroBox ? `${Math.round(heroBox.width)}x${Math.round(heroBox.height)} @${Math.round(heroBox.left)},${Math.round(heroBox.top)}` : 'none',
        sections: ['home', 'about', 'gallery', 'subscribe', 'faq'].every((id) => document.getElementById(id)),
      };
    });

    if (r.doc > r.inner + 1) problems.push(`H-OVERFLOW ${r.doc} > ${r.inner} -> ${r.overflowing.join(', ')}`);
    if (r.broken.length) problems.push('BROKEN IMAGES: ' + r.broken.join(', '));
    if (!r.sections) problems.push('MISSING SECTION ANCHOR');

    console.log(`${String(w).padStart(4)}px | imgs=${r.total} broken=${r.broken.length} | hero=${r.hero} | ${problems.length ? 'PROBLEMS' : 'ok'}`);
    problems.forEach((p) => console.log('        ' + p));
    bad += problems.length;
    await page.close();
  }

  /* ---------- pass 2: gallery actually switches + cover geometry ---------- */
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  await page.locator('#gallery').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);

  const geom = await page.evaluate(() => {
    const frame = document.querySelector('.gallery__frame').getBoundingClientRect();
    return [...document.querySelectorAll('.gallery__slide')].map((s, i) => {
      const img = s.querySelector('img');
      const r = img.getBoundingClientRect();
      return {
        i,
        active: s.classList.contains('is-active'),
        display: getComputedStyle(s).display,
        img: `${Math.round(r.width)}x${Math.round(r.height)}`,
        covers: r.width >= frame.width - 1 && r.height >= frame.height - 1,
        loaded: img.naturalWidth > 0,
      };
    });
  });
  console.log('\ngallery frame 1440px:');
  geom.forEach((g) => console.log(`  slide${g.i} active=${g.active} display=${g.display} img=${g.img} covers=${g.covers} loaded=${g.loaded}`));
  if (geom.some((g) => g.active && (!g.covers || !g.loaded))) { console.log('  -> ACTIVE SLIDE NOT COVERING'); bad++; }

  for (const idx of [1, 2, 0]) {
    await page.locator('.gallery__tab').nth(idx).click();
    await page.waitForTimeout(300);
    const st = await page.evaluate(() => {
      const s = document.querySelector('.gallery__slide.is-active');
      const img = s.querySelector('img');
      const r = img.getBoundingClientRect();
      const f = document.querySelector('.gallery__frame').getBoundingClientRect();
      return { idx: [...document.querySelectorAll('.gallery__slide')].indexOf(s), w: Math.round(r.width), h: Math.round(r.height), fw: Math.round(f.width), fh: Math.round(f.height), loaded: img.naturalWidth };
    });
    const ok = st.idx === idx && st.w >= st.fw && st.h >= st.fh && st.loaded > 0;
    console.log(`  click tab${idx} -> active=${st.idx} img=${st.w}x${st.h} frame=${st.fw}x${st.fh} nat=${st.loaded} ${ok ? 'ok' : 'BAD'}`);
    if (!ok) bad++;
  }

  /* mobile: menu + gallery */
  const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const merr = [];
  m.on('pageerror', (e) => merr.push(e.message));
  await m.goto(URL, { waitUntil: 'load' });
  await m.waitForTimeout(500);
  await m.locator('.nav__toggle').click();
  await m.waitForTimeout(300);
  const menuOpen = await m.evaluate(() => document.querySelector('.nav__menu').classList.contains('is-open'));
  await m.locator('.nav__link').nth(2).click();
  await m.waitForTimeout(600);
  const menuClosed = await m.evaluate(() => !document.querySelector('.nav__menu').classList.contains('is-open'));
  await m.locator('#gallery').scrollIntoViewIfNeeded();
  await m.waitForTimeout(400);
  await m.locator('.gallery__tab').nth(1).click();
  await m.waitForTimeout(300);
  const mg = await m.evaluate(() => {
    const s = document.querySelector('.gallery__slide.is-active img');
    const r = s.getBoundingClientRect();
    const f = document.querySelector('.gallery__frame').getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), fw: Math.round(f.width), fh: Math.round(f.height), nat: s.naturalWidth };
  });
  const mobOk = menuOpen && menuClosed && mg.w >= mg.fw && mg.h >= mg.fh && mg.nat > 0 && merr.length === 0;
  console.log(`\n390px | menu opens=${menuOpen} closes=${menuClosed} | gallery img=${mg.w}x${mg.h} frame=${mg.fw}x${mg.fh} nat=${mg.nat} | jsErrors=${merr.length} ${mobOk ? 'ok' : 'BAD'}`);
  merr.forEach((e) => console.log('   JS: ' + e));
  if (!mobOk) bad++;

  await browser.close();
  console.log('\n=== ' + (bad ? bad + ' PROBLEM(S)' : 'ALL CHECKS PASSED') + ' ===');
  process.exit(bad ? 1 : 0);
})();
