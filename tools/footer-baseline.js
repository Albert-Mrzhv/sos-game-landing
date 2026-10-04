#!/usr/bin/env node
/* Footer geometry baseline.
   Renders index.html at several viewports, measures the footer, and writes
   a screenshot of the footer region so visual changes can be checked.

   Usage:
     node tools/footer-baseline.js              measure + screenshot
     node tools/footer-baseline.js --viewport=320
*/
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { openBrowser } = require('./cdp');

const URL = pathToFileURL(path.resolve('index.html')).href;
const OUT = path.resolve('.footprint');

/* cdp.goto() waits for the load event, which never arrives when a stylesheet
   or font request stalls. Navigate anyway and poll readyState instead. */
async function navigate(page, url) {
  await page.session.send('Page.navigate', { url });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const state = await page.evaluate('document.readyState').catch(() => null);
    if (state === 'complete' || state === 'interactive') break;
    await new Promise((r) => setTimeout(r, 150));
  }
  await page.evaluate(
    'document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))'
  ).catch(() => {});
  await new Promise((r) => setTimeout(r, 400));
}


const VIEWPORTS = [
  { name: 'desktop 1440', width: 1440, height: 900 },
  { name: 'tablet 768', width: 768, height: 900 },
  { name: 'phone 375', width: 375, height: 700, mobile: true },
  { name: 'phone 320', width: 320, height: 700, mobile: true },
];

/* Runs in the page. Must stay a string: cdp.evaluate() takes an expression. */
const MEASURE = `(() => {
  const r = (n) => Math.round(n);
  const box = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: r(b.left), y: r(b.top), w: r(b.width), h: r(b.height), right: r(b.right), bottom: r(b.bottom) };
  };
  const rows = (els) => new Set(els.map((e) => r(e.getBoundingClientRect().top))).size;

  const f = document.querySelector('.footer');
  if (!f) return { error: 'no .footer element in the page' };

  const q = (s) => f.querySelector(s);
  const qa = (s) => Array.from(f.querySelectorAll(s));

  const container = q('.footer__container');
  const navLinks = qa('.footer__nav a');
  const socials = qa('.footer__social-link');
  const legal = qa('.footer__legal a');

  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    overflow: { scrollW: document.documentElement.scrollWidth, inner: window.innerWidth },
    footer: box(f),
    container: box(container),
    top: box(q('.footer__top')),
    logo: box(q('.footer__logo')),
    nav: box(q('.footer__nav')),
    navLinks: navLinks.map((a) => ({ text: a.textContent.trim(), box: box(a) })),
    navRows: rows(navLinks),
    socials: socials.map((a) => {
      const img = a.querySelector('img');
      return {
        label: a.getAttribute('aria-label'),
        box: box(a),
        natural: img ? { w: img.naturalWidth, h: img.naturalHeight, complete: img.complete } : null,
      };
    }),
    divider: box(q('.footer__divider')),
    bottom: box(q('.footer__bottom')),
    copyright: box(q('.footer__copyright')),
    legal: legal.map((a) => ({ text: a.textContent.trim(), box: box(a) })),
    legalRows: rows(legal),
  };
})()`;

function check(m) {
  const issues = [];
  if (m.error) return [m.error];

  if (m.overflow.scrollW > m.overflow.inner + 1) {
    issues.push('horizontal overflow: scrollWidth ' + m.overflow.scrollW + ' > viewport ' + m.overflow.inner);
  }
  if (m.footer.h < 80) issues.push('footer suspiciously short: ' + m.footer.h + 'px');
  if (m.footer.h > 600) issues.push('footer suspiciously tall: ' + m.footer.h + 'px');

  if (!m.container) {
    issues.push('footer__container missing');
  } else if (m.footer.w - m.container.w < 0) {
    issues.push('container wider than footer');
  }

  if (!m.logo) issues.push('footer logo missing');

  if (m.navLinks.length < 3) issues.push('footer nav has only ' + m.navLinks.length + ' links');
  if (m.navRows > 4) issues.push('nav wraps to ' + m.navRows + ' rows');

  const heights = m.socials.map((s) => s.box.h);
  if (heights.length && Math.max(...heights) - Math.min(...heights) > 2) {
    issues.push('social icons unequal height: ' + heights.join(', '));
  }
  const broken = m.socials.filter((s) => s.natural && (!s.natural.complete || !s.natural.w));
  if (broken.length) issues.push('social icon(s) failed to load: ' + broken.map((b) => b.label).join(', '));

  if (!m.divider) issues.push('footer divider missing');
  if (!m.copyright) issues.push('footer copyright missing');
  if (m.legal.length && m.legalRows > 3) issues.push('legal links wrap to ' + m.legalRows + ' rows');

  // nothing may stick out past the footer box
  const parts = [['container', m.container], ['top', m.top], ['divider', m.divider], ['bottom', m.bottom]];
  for (const [name, b] of parts) {
    if (b && (b.x < m.footer.x - 1 || b.right > m.footer.right + 1)) {
      issues.push(name + ' overflows footer horizontally (' + b.x + '..' + b.right + ' vs ' + m.footer.x + '..' + m.footer.right + ')');
    }
  }
  return issues;
}

async function main() {
  const only = process.argv.find((a) => a.startsWith('--viewport='));
  const want = only ? parseInt(only.split('=')[1], 10) : null;
  const viewports = VIEWPORTS.filter((v) => !want || v.width === want);

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await openBrowser();
  let failed = 0;

  for (const vp of viewports) {
    const slug = vp.name.replace(/\s+/g, '_');
    const page = await browser.newPage();
    await navigate(page, URL);
    await page.setViewport({ width: vp.width, height: vp.height, mobile: !!vp.mobile });
    const m = await page.evaluate(MEASURE);

    console.log('\n\u25b6 ' + vp.name);
    if (m.error) {
      console.log('  ' + m.error);
      failed++;
      await page.close();
      continue;
    }
    console.log('  footer  ' + m.footer.w + '\u00d7' + m.footer.h + ' at y=' + m.footer.y);
    console.log('  parts   top=' + (m.top ? m.top.h : '-') + '  bottom=' + (m.bottom ? m.bottom.h : '-') +
      '  nav rows=' + m.navRows + '  legal rows=' + m.legalRows);
    console.log('  socials ' + m.socials.map((s) => s.box.w + '\u00d7' + s.box.h).join(' '));

    if (m.footer.bottom <= m.viewport.h) {
      const png = await page.screenshot({
        x: 0, y: Math.max(0, m.footer.y - 8), width: vp.width, height: Math.min(vp.height, m.footer.h + 8),
      });
      const p = path.join(OUT, 'footer_' + slug + '.png');
      fs.writeFileSync(p, png);
      console.log('  shot    ' + p);
    } else {
      console.log('  shot    skipped (footer below the fold at this height)');
    }

    const issues = check(m);
    if (issues.length) {
      failed++;
      console.log('  \u2717 ' + issues.length + ' issue(s)');
      issues.forEach((i) => console.log('     - ' + i));
    } else {
      console.log('  \u2713 no issues');
    }
    fs.writeFileSync(path.join(OUT, 'footer_' + slug + '.json'), JSON.stringify(m, null, 2));
    await page.close();
  }

  await browser.close();
  console.log('\n' + (failed ? failed + ' viewport(s) with issues' : 'all viewports clean'));
  process.exitCode = failed ? 1 : 0;
}

main().catch((e) => {
  console.error('HARNESS FAILED: ' + e.message);
  process.exitCode = 2;
});
