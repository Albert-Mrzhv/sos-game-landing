'use strict';
const { openBrowser } = require('./cdp');
(async () => {
  console.log('launching...');
  const br = await openBrowser();
  console.log('opened, getting page...');
  const page = await br.newPage();
  console.log('got page, navigating...');
  const url = require('url').pathToFileURL(require('path').resolve('index.html')).href;
  await page.send('Page.enable');
  await page.send('Page.navigate', { url });
  let st = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 400));
    st = await page.evaluate('document.readyState');
    if (st === 'complete' || st === 'interactive') break;
  }
  console.log('readyState:', st);
  console.log('navigated, measuring...');
  const m = await page.evaluate('document.querySelector("footer") ? "footer found" : "no footer"');
  console.log('result:', m);
  const ss = await page.screenshot();
  require('fs').writeFileSync('foot-1440.png', ss);
  console.log('saved foot-1440.png (' + ss.length + ' bytes)');
  await page.close();
  await br.close();
  console.log('done');
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
