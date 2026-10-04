const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'), { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo(0, document.querySelector('.gallery').getBoundingClientRect().top + window.scrollY - 100));
  await page.waitForTimeout(2000);

  const geo = await page.evaluate(() => {
    const out = {};
    out.track = { w: Math.round(document.querySelector('.gallery__track').getBoundingClientRect().width) };
    out.cards = [...document.querySelectorAll('.gallery__card')].map((c) => {
      const r = c.getBoundingClientRect();
      const m = c.querySelector('.gallery__media').getBoundingClientRect();
      const i = c.querySelector('img').getBoundingClientRect();
      const b = c.querySelector('.gallery__body').getBoundingClientRect();
      return {
        card: [Math.round(r.width), Math.round(r.height)],
        media: [Math.round(m.width), Math.round(m.height)],
        img: [Math.round(i.width), Math.round(i.height)],
        body: [Math.round(b.width), Math.round(b.height)],
        bottom: Math.round(r.bottom),
      };
    });
    return out;
  });
  console.log('GALLERY', JSON.stringify(geo, null, 2));

  // hero geometry
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1200);
  const hero = await page.evaluate(() => {
    return {
      media: (() => { const r = document.querySelector('.hero__media').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), Math.round(r.top)]; })(),
      slides: [...document.querySelectorAll('.hero__slide')].map((s) => {
        const r = s.getBoundingClientRect(); const i = s.querySelector('img').getBoundingClientRect();
        return { card: [Math.round(r.width), Math.round(r.height)], img: [Math.round(i.width), Math.round(i.height)] };
      }),
    };
  });
  console.log('HERO', JSON.stringify(hero, null, 2));

  await browser.close();
})();
