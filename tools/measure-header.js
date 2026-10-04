/* Measures the header against the reference mock (1024px wide capture).
   Prints every position as a % of viewport width so the comparison is
   independent of the mock's export scale. */
const { chromium } = require('playwright-core');
const fs = require('fs');

const exe = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));

const URL = 'file:///C:/Users/atmur/Documents/Web-site-sos/index.html';

// Reference values read off the mock, as % of viewport width.
const MOCK = {
  logoLeft: 8.1, logoRight: 12.4, logoTopPctH: 1.0, logoHPx: 54,
  navFirstLeft: 23.7, navLastRight: 67.4,
  langLeft: 78.9, socialRight: 91.6,
  contentCenterYPx: 40, socialDxPct: 2.54,
};

(async () => {
  const browser = await chromium.launch({ executablePath: exe });

  for (const w of [1024, 1440]) {
    const page = await browser.newPage({ viewport: { width: w, height: 768 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForTimeout(400);

    const m = await page.evaluate(() => {
      const r = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, w: b.width, h: b.height, cy: b.top + b.height / 2 }; };
      const q = (s) => document.querySelector(s);
      const links = [...document.querySelectorAll('.nav__link')];
      const socials = [...document.querySelectorAll('.social__link img')];
      const hcs = getComputedStyle(q('.header'));
      return {
        W: innerWidth,
        headerH: q('.header').getBoundingClientRect().height,
        headerBg: hcs.backgroundColor,
        containerPad: getComputedStyle(q('.header__container')).paddingLeft,
        logo: r(q('.header__logo img')),
        logoNat: (() => { const i = q('.header__logo img'); return i.naturalWidth + 'x' + i.naturalHeight; })(),
        logoBroken: q('.header__logo img').naturalWidth === 0,
        navFirst: r(links[0]),
        navLast: r(links[links.length - 1]),
        navFont: getComputedStyle(links[0]).fontSize,
        navColor: getComputedStyle(links[0]).color,
        navGap: getComputedStyle(q('.nav__list')).gap,
        lang: r(q('.lang-selector__btn')),
        socials: socials.map((s) => r(s)),
        socialBroken: socials.filter((s) => s.naturalWidth === 0).length,
        // how dark is the strip behind the header?
        scrim: (() => {
          const el = document.elementFromPoint(innerWidth / 2, 20);
          return el ? el.className || el.tagName : null;
        })(),
      };
    });

    const pct = (v) => ((v / m.W) * 100).toFixed(1);
    console.log('\n===== ' + m.W + 'px =====');
    console.log('  header height      ' + m.headerH + 'px   (' + pct(m.headerH) + '% W)   mock 7.8%');
    console.log('  header background  ' + m.headerBg + '   mock: transparent');
    console.log('  container padding  ' + m.containerPad + '   mock ' + pct(85) + '% = ' + Math.round(0.0833 * m.W) + 'px');
    console.log('  logo               left ' + pct(m.logo.l) + '% (mock 8.1)  right ' + pct(m.logo.r) + '% (mock 12.4)  h ' + m.logo.h.toFixed(0) + 'px (mock 54)  cy ' + m.logo.cy.toFixed(0) + 'px');
    console.log('  logo natural       ' + m.logoNat + (m.logoBroken ? '  *** BROKEN ***' : ''));
    console.log('  nav first left     ' + pct(m.navFirst.l) + '% (mock 23.7)   nav last right ' + pct(m.navLast.r) + '% (mock 67.4)');
    console.log('  nav font/gap       ' + m.navFont + ' / ' + m.navGap + '   color ' + m.navColor);
    console.log('  lang left          ' + pct(m.lang.l) + '% (mock 78.9)');
    console.log('  social right       ' + pct(m.socials[1].r) + '% (mock 91.6)   icon ' + m.socials[0].w.toFixed(0) + 'px (' + pct(m.socials[0].w) + '%, mock 2.54)');
    console.log('  social broken      ' + m.socialBroken);
    console.log('  element at y=20    ' + m.scrim);
    if (errs.length) console.log('  ERRORS: ' + errs.join(' | '));
    await page.close();
  }
  await browser.close();
})();
