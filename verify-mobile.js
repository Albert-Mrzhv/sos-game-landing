/* Verifies the mobile newsletter block against the 687x1030 mock @390 CSS
   (scale 1.76). Compares element positions in CSS px with mock/1.76. */
const { chromium } = require('playwright-core');
const fs = require('fs');
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const URL = 'file:///C:/Users/atmur/Documents/Web-site-sos/index.html';
const OUT = '.verify/';

// mock measurements (687x1030 image px) divided by 1.76 -> CSS px at 390
const S = 1.76;
const T = {
  labelX: 258 / S, labelY: 175 / S,
  titleY: 200 / S,
  textY: 320 / S,
  fieldY: 560 / S, fieldR: 640 / S,
  btnY: 660 / S, btnB: 738 / S,
  artTop: 118 / S, artRight: 225 / S, artBottom: 565 / S,
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: exe });
  const page = await browser.newPage({ viewport: { width: 390, height: 1030 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);

  // anchor everything to the top of the newsletter section
  const m = await page.evaluate(() => {
    const s = document.getElementById('subscribe');
    const top = s.getBoundingClientRect().top;
    const r = (sel) => {
      const b = s.querySelector(sel).getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.top - top), r: Math.round(b.right), b: Math.round(b.bottom - top), w: Math.round(b.width), h: Math.round(b.height) };
    };
    return {
      secH: Math.round(s.getBoundingClientRect().height),
      label: r('.newsletter__label'), title: r('.newsletter__title'),
      text: r('.newsletter__text'), field: r('.newsletter__field'),
      btn: r('.newsletter__btn'), art: r('.newsletter__art'),
      scrollW: document.documentElement.scrollWidth, inner: window.innerWidth,
    };
  });

  // the mock crop starts inside the section: find the section-top offset by
  // aligning the plate top to the mock plate top
  const d = (name, got, want, tol = 14) => {
    const diff = got - want;
    const ok = Math.abs(diff) <= tol;
    console.log(`  ${ok ? 'ok  ' : 'DIFF'} ${name.padEnd(12)} got ${String(got).padStart(4)}  mock ${String(Math.round(want)).padStart(4)}  d=${diff > 0 ? '+' : ''}${Math.round(diff)}`);
    return ok;
  };

  console.log('=== 390px vs mock/1.76 (y from section top) ===');
  let bad = 0;
  if (!d('art top', m.art.y, T.artTop)) bad++;
  if (!d('art right', m.art.r, T.artRight)) bad++;
  if (!d('label x', m.label.x, T.labelX)) bad++;
  if (!d('label y', m.label.y, T.labelY)) bad++;
  if (!d('title y', m.title.y, T.titleY)) bad++;
  if (!d('text y', m.text.y, T.textY)) bad++;
  if (!d('field y', m.field.y, T.fieldY)) bad++;
  if (!d('field right', m.field.r, T.fieldR)) bad++;
  if (!d('btn y', m.btn.y, T.btnY)) bad++;
  if (!d('btn bottom', m.btn.b, T.btnB)) bad++;

  const gap = m.label.x - m.art.r;
  console.log(`  skull -> text gap: ${gap}px (mock ~19)`);

  console.log('  section height', m.secH, '| scrollW', m.scrollW, '/', m.inner);
  if (m.scrollW > m.inner) { bad++; console.log('  DIFF horizontal overflow'); }

  await page.locator('#subscribe').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.locator('#subscribe').screenshot({ path: OUT + 'mock390.png' });
  console.log('  shot .verify/mock390.png');

  console.log('\nERRORS:', errs.length ? errs : 'none');
  console.log(bad ? bad + ' problem(s)' : 'all checks passed');
  await browser.close();
})();
