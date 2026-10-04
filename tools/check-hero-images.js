'use strict';
const { chromium } = require('playwright-core');
const fs = require('fs');
const EXE = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('file:///C:/Users/atmur/Documents/Web-site-sos/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(500);

  // Get computed background images for hero slides
  const bg1 = await page.evaluate(() => getComputedStyle(document.querySelector('.hero-bg')).backgroundImage);
  console.log('hero-bg image:', bg1);

  // Check if images exist by trying to load them
  const check = await page.evaluate(async (urls) => {
    const results = [];
    for (const url of urls) {
      try {
        const img = new Image();
        img.src = url;
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
          setTimeout(resolve, 500);
        });
        results.push({ url, ok: img.complete && img.naturalWidth > 0, w: img.naturalWidth, h: img.naturalHeight });
      } catch (e) {
        results.push({ url, error: String(e) });
      }
    }
    return results;
  }, [
    'images-icons/header/bg image 1.jpg',
    'images-icons/main/section-1/bg image 2.jpg',
    'images-icons/main/section-1/screenshot 1.jpg',
    'images-icons/main/section-1/screenshot 2.jpg',
    'images-icons/main/section-1/screenshot 3.jpg',
  ]);
  console.log('Image checks:', JSON.stringify(check, null, 2));

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
