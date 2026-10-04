/* Audit: every url() in style.css and every selector/asset referenced by
   script.js must resolve to a real file / real element in index.html. */
const fs = require('fs');
const path = require('path');
const root = __dirname;
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
let bad = 0;

/* 1. url(...) assets */
const urls = [...new Set([...css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => m[1].trim()))]
  .filter((u) => !u.startsWith('data:'));
console.log('--- style.css url() assets: ' + urls.length + ' ---');
for (const u of urls) {
  const clean = decodeURIComponent(u.split('?')[0]);
  const exists = fs.existsSync(path.join(root, clean.replace(/\//g, path.sep)));
  if (!exists) { console.log('  404: ' + u); bad++; }
}
console.log('  missing files: ' + (bad || 0));

/* 2. css rules for background-image on the elements this markup uses */
console.log('\n--- background-image rules ---');
for (const sel of ['.hero-bg', '.about__slide--1', '.about__slide--2', '.about__slide--3', '.quotes__bg', '.newsletter__art', '.footer']) {
  const re = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'g');
  const blocks = [...css.matchAll(re)].map((m) => m[1]).filter((b) => /background(-image)?\s*:/.test(b));
  const has = blocks.some((b) => /url\(/.test(b));
  console.log(`  ${sel.padEnd(20)} bg-rule=${blocks.length > 0} has-url=${has}`);
  if (!has) bad++;
}

/* 3. script.js selectors vs markup */
console.log('\n--- script.js references ---');
const sels = [...new Set([
  ...js.matchAll(/querySelector(?:All)?\(\s*['"]([^'"]+)['"]|getElementById\(\s*['"]([^'"]+)['"]|classList\.(?:add|remove|toggle|contains)\(\s*['"]([^'"]+)['"]/g)
).map((m) => m[1] || m[2] || m[3])
])];
for (const s of sels) {
  const probe = s.startsWith('#') ? `id="${s.slice(1)}"` : s.startsWith('.') ? s.slice(1).split(/[.\s>]/)[0] : s;
  const inHtml = html.includes(probe);
  if (!inHtml) { console.log('  NOT IN MARKUP: ' + s); bad++; }
}
console.log('  checked ' + sels.length + ' selectors');

/* 4. classes used in JS via createElement / template */
console.log('\n--- classes in HTML missing from CSS ---');
const classes = [...new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)))].filter(Boolean);
for (const c of classes) if (!css.includes('.' + c)) { console.log('  no css: .' + c); }

console.log('\n=== ' + (bad ? bad + ' PROBLEM(S)' : 'assets + js selectors ok') + ' ===');
