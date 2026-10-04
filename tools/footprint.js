#!/usr/bin/env node
'use strict';
/* Footer verification harness.
   Renders index.html at 1440px and 320px, captures screenshots,
   measures element geometry, and reports problems.

   Usage:
     node tools/footprint.js               — run both viewports
     node tools/footprint.js --viewport=320 — run only 320px
     node tools/footprint.js --update      — save baseline screenshots
*/
const { openBrowser } = require('./cdp');
const fs = require('fs');
const path = require('path');

const URL = 'file://' + path.resolve('index.html').replace(/\\/g, '/');
const OUT = path.resolve('.footprint');

const VIEWPORTS = [
  { name: 'desktop 1440', width: 1440, height: 900 },
  { name: 'phone 320',   width: 320,   height: 700 },
];

/* ── assertion helpers ── */

function near(a, b, tol = 4) {
  return Math.abs(a - b) <= tol;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/* ── core measurement ── */

async function measurePage(page) {
  const m = await page.evaluate(() => {
    const f = document.querySelector('.footer');
    if (!f) return { error: 'no .footer element' };
    const fb = f.getBoundingClientRect();
    const c = f.querySelector('.footer__container');
    const cb = c ? c.getBoundingClientRect() : null;
    const log = f.querySelector('.footer__logo-img') || f.querySelector('.footer__logo');
    const lb = log ? log.getBoundingClientRect() : null;
    const nav = f.querySelector('.footer__nav');
    const navLinks = [...(nav ? nav.querySelectorAll('a') : [])];
    const nbr = navLinks.map((l) => l.getBoundingClientRect());
    const tops = nbr.map((r) => Math.round(r.top));
    const rows = new Set(tops);
    const socs = [...f.querySelectorAll('.footer__social-link')];
    const sbr = socs.map((s) => {
      const img = s.querySelector('img');
      const b = s.getBoundingClientRect();
      return { w: Math.round(b.width), h: Math.round(b.height),
               ix: img ? img.naturalWidth : null, iy: img ? img.naturalHeight : null };
    });
    const div = f.querySelector('.footer__divider, hr');
    const dbr = div ? div.getBoundingClientRect() : null;
    const bot = f.querySelector('.footer__bottom');
    const bbr = bot ? bot.getBoundingClientRect() : null;
    const cop = f.querySelector('.footer__copyright');
    const copb = cop ? cop.getBoundingClientRect() : null;
    const leg = f.querySelector('.footer__legal');
    const legb = leg ? leg.getBoundingClientRect() : null;
    const legLinks = leg ? [...leg.querySelectorAll('a')] : [];
    const legbr = legLinks.map((l) => l.getBoundingClientRect());
    const legRows = new Set(legbr.map((r) => Math.round(r.top)));
    return {
      fb: { x: Math.round(fb.left), y: Math.round(fb.top), w: Math.round(fb.width), h: Math.round(fb.height) },
      cb: cb ? { x: Math.round(cb.left), w: Math.round(cb.width) } : null,
      lb: lb ? { x: Math.round(lb.left), y: Math.round(lb.top), w: Math.round(lb.width), h: Math.round(lb.height) } : null,
      navLinks: navLinks.length,
      navRows: rows.size,
      navBWidth: nav ? Math.round(nav.getBoundingClientRect().width) : null,
      navItems: nbr.map((r) => ({ w: Math.round(r.width), h: Math.round(r.height),
                                  top: Math.round(r.top), left: Math.round(r.left) })),
      socs: sbr,
      dbr: dbr ? { x: Math.round(dbr.left), r: Math.round(dbr.right), w: Math.round(dbr.width) } : null,
      bbr: bbr ? { x: Math.round(bbr.left), w: Math.round(bbr.width), y: Math.round(bbr.top) } : null,
      copb: copb ? { x: Math.round(copb.left), w: Math.round(copb.width) } : null,
      legb: legb ? { x: Math.round(legb.left), w: Math.round(legb.width) } : null,
      legbr: legbr.map((r) => ({ w: Math.round(r.width) })),
      legRows: legRows.size,
      scrollW: document.documentElement.scrollWidth,
      inner: window.innerWidth,
    };
  });
  return m;
}

/* ── assertions ── */

function assert(w, m) {
  const issues = [];

  // overflow
  if (m.scrollW > m.inner + 1) {
    issues.push('HORIZONTAL OVERFLOW: scrollW=' + m.scrollW + ' inner=' + m.inner);
  }

  // footer exists
  if (m.error) { issues.push(m.error); return issues; }

  // footer height sanity
  if (m.fb.h < 80) issues.push('footer too short: ' + m.fb.h + 'px');
  if (m.fb.h > 250) issues.push('footer too tall: ' + m.fb.h + 'px');

  // container alignment
  if (m.cb) {
    const gap = m.cb.x - (m.fb.x + 0);
    if (gap < 0) issues.push('container left edge outside footer by ' + Math.abs(gap) + 'px');
  }

  // logo
  if (m.lb) {
    if (m.lb.w > m.lb.h * 1.5 && m.lb.h > m.lb.w * 1.5) {
      issues.push('logo is stretched (aspect ratio broken)');
    }
  } else {
    issues.push('footer logo missing');
  }

  // nav
  if (m.navLinks < 3) issues.push('footer nav has too few links: ' + m.navLinks);
  if (m.navRows > 2) issues.push('nav wraps to ' + m.navRows + ' rows (max 2)');
  if (m.navBWidth && m.cb && m.navBWidth > m.cb.w - 20) {
    issues.push('nav width ' + m.navBWidth + 'px too close to container width ' + m.cb.w + 'px');
  }

  // socials — equal height
  if (m.socs.length > 0) {
    const heights = m.socs.map((s) => s.h);
    const minH = Math.min(...heights);
    const maxH = Math.max(...heights);
    if (maxH - minH > 3) {
      issues.push('social links unequal height: ' + heights.join(', ') + ' (spread ' + (maxH - minH) + 'px)');
    }
  }

  // divider
  if (m.dbr) {
    if (m.cb && m.dbr.w < m.cb.w - 20) {
      issues.push('divider too narrow: ' + m.dbr.w + ' vs container ' + m.cb.w);
    }
    if (m.dbr.x < m.fb.x) issues.push('divider extends left of footer');
  }

  // legal links
  if (m.legRows > 2) issues.push('legal links wrap to ' + m.legRows + ' rows');

  // copyright text presence
  if (!m.copb) issues.push('footer__copyright element missing');

  return issues;
}

/* ── main ── */

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await openBrowser();
  const close = () => browser.close();

  const update = process.argv.includes('--update');
  const vpArg = process.argv.find((a) => a.startsWith('--viewport='));
  const vp = vpArg ? parseInt(vpArg.split('=')[1]) : null;
  const vps = VIEWPORTS.filter((v) => !vp || v.width === vp);

  const { decode, compare, encode } = require('./png');
  for (const { name, width, height } of vps) {
    const slug = name.replace(/\s+/g, '_');
    console.log('\n▶ ' + name + ' (' + width + '×' + height + ')');
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    await page.goto(URL);
    const m = await measurePage(page);

    // screenshot
    const ss = await page.screenshot();
    const ssPath = path.join(OUT, slug + '.png');
    fs.writeFileSync(ssPath, ss);
    console.log('  screenshot → ' + ssPath);

    // baseline compare
    const basePath = path.join(OUT, slug + '_base.png');
    if (update || !fs.existsSync(basePath)) {
      fs.writeFileSync(basePath, ss);
      console.log('  baseline ' + (update ? 'updated' : 'created') + ' → ' + basePath);
    } else {
      const d = compare(decode(fs.readFileSync(basePath)), decode(ss));
      console.log('  diff vs baseline: ' + (d.diffRatio * 100).toFixed(2) + '% pixels (' +
        d.diffPixels + '/' + d.total + '), maxΔ=' + d.maxDelta);
      fs.writeFileSync(path.join(OUT, slug + '_diff.png'), encode(d.diffImage));
    }

    // assertions
    const issues = assert(name, m);
    if (issues.length === 0) {
      console.log('  ✓ all checks passed');
    } else {
      console.log('  ✗ ' + issues.length + ' issue(s):');
      issues.forEach((i) => console.log('    - ' + i));
    }

    // dump measurements
    console.log('  measurements:', JSON.stringify(m, null, 2).slice(0, 600) + '...');

    await page.close();
  }

  await close();
  console.log('\nDone. Screenshots in ' + OUT);
}

main().catch((e) => {
  console.error('HARNESS FAILED:', e.message);
  if (e.stack) console.error(e.stack.split('\n').slice(0, 4).join('\n'));
  process.exit(1);
});
