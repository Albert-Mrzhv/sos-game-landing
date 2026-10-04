/* Footer layout verification via Chrome DevTools Protocol (no npm deps).
   Usage: node footer-check.js [width] [height] */
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

const WIDTH = parseInt(process.argv[2], 10) || 1440;
const HEIGHT = parseInt(process.argv[3], 10) || 900;
const PORT = 9400 + (WIDTH % 100);
const profile = path.join(os.tmpdir(), 'chrome-ftr-' + PORT);

let msgId = 0;
const pending = new Map();

function send(ws, method, params) {
    return new Promise((resolve, reject) => {
        const mid = ++msgId;
        pending.set(mid, { resolve, reject });
        ws.send(JSON.stringify({ id: mid, method, params }));
    });
}

(async () => {
    const chrome = spawn(CHROME, [
        '--headless=new', '--disable-gpu', '--no-sandbox',
        '--hide-scrollbars', '--force-device-scale-factor=1',
        `--remote-debugging-port=${PORT}`,
        `--window-size=${WIDTH},${HEIGHT}`,
        `--user-data-dir=${profile}`,
        'about:blank',
    ], { stdio: 'ignore' });

    const stop = () => { try { chrome.kill('SIGKILL'); } catch (_) {} };
    process.on('exit', stop);

    let target = null;
    for (let i = 0; i < 80; i++) {
        await new Promise(r => setTimeout(r, 250));
        try {
            const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
            const list = await res.json();
            target = list.find(t => t.type === 'page');
            if (target) break;
        } catch (_) { /* not up yet */ }
    }
    if (!target) throw new Error('Chrome DevTools endpoint not reachable');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = () => reject(new Error('ws connect failed'));
        ws.onmessage = (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.id && pending.has(msg.id)) {
                const { resolve: r, reject: j } = pending.get(msg.id);
                pending.delete(msg.id);
                msg.error ? j(new Error(JSON.stringify(msg.error))) : r(msg.result);
            }
        };
    });

    await send(ws, 'Page.enable');
    await send(ws, 'Runtime.enable');
    await send(ws, 'Emulation.setDeviceMetricsOverride', {
        width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: WIDTH < 600,
    });

    const url = 'file:///' + path.join(__dirname, 'footer.html').replace(/\\/g, '/');
    await send(ws, 'Page.navigate', { url });
    await new Promise(r => setTimeout(r, 900));

    const res = await send(ws, 'Runtime.evaluate', {
        expression: `
            (function () {
                const W = ${WIDTH};
                const q = (s) => document.querySelector(s);
                const f = q('.footer'), c = q('.footer__container'), t = q('.footer__top');
                const logo = q('.footer__logo-img'), nav = q('.footer__nav');
                const links = Array.from(document.querySelectorAll('.footer__nav-link'));
                const soc = q('.footer__socials'), dv = q('.footer__divider');
                const bot = q('.footer__bottom'), cr = q('.footer__copyright'), lg = q('.footer__legal');

                const R = (el) => el ? el.getBoundingClientRect() : null;
                const fc = R(f), cc = R(c), tc = R(t), lc = R(logo), nc = R(nav);
                const sc = R(soc), dc = R(dv), bc = R(bot), crc = R(cr), lgc = R(lg);

                const rows = []; let ct = -1, cur = [];
                links.forEach((el, i) => {
                    const top = Math.round(el.getBoundingClientRect().top);
                    if (ct === -1 || Math.abs(top - ct) > 4) { if (cur.length) rows.push(cur); ct = top; cur = [i]; }
                    else cur.push(i);
                });
                if (cur.length) rows.push(cur);

                const socLinks = Array.from(document.querySelectorAll('.footer__social-link'));

                return {
                    width: W,
                    scrollW: document.documentElement.scrollWidth,
                    innerW: window.innerWidth,
                    footerH: Math.round(fc.height),
                    containerL: Math.round(cc.left), containerR: Math.round(cc.right),
                    containerW: Math.round(cc.width),
                    topH: Math.round(tc.height),
                    logoH: lc ? Math.round(lc.height) : null,
                    logoW: lc ? Math.round(lc.width) : null,
                    logoLeft: lc ? Math.round(lc.left) : null,
                    navH: nc ? Math.round(nc.height) : null,
                    navW: nc ? Math.round(nc.width) : null,
                    navLeft: nc ? Math.round(nc.left) : null,
                    socW: sc ? Math.round(sc.width) : null,
                    socLeft: sc ? Math.round(sc.left) : null,
                    socCount: socLinks.length,
                    socImgH: socLinks.length ? Math.round(socLinks[0].querySelector('img').getBoundingClientRect().height) : null,
                    dividerL: Math.round(dc.left), dividerR: Math.round(dc.right),
                    bottomH: Math.round(bc.height),
                    copyrightText: cr.textContent.trim(),
                    legalText: lg.textContent.trim().replace(/\s+/g, ' '),
                    rows: rows.map((r, i) => ({ n: i + 1, count: r.length, items: r.map(j => links[j].textContent) })),
                    containerCenter: Math.round(cc.left + cc.width / 2),
                    navCenter: nc ? Math.round(nc.left + nc.width / 2) : null,
                    gapLogoNav: (nc && lc) ? Math.round(nc.left - lc.right) : null,
                    gapNavSoc: (sc && nc) ? Math.round(sc.left - nc.right) : null,
                };
            })()
        `,
        returnByValue: true,
    });

    stop();

    if (res.exceptionDetails) {
        console.log('EXCEPTION: ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text));
        process.exit(1);
    }
    const m = res.result.value;

    let bad = 0;
    const check = (name, cond, detail) => {
        if (cond) { console.log('ok    ' + name); }
        else { bad++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
    };

    console.log('');
    console.log('=== footer @ ' + WIDTH + 'x' + HEIGHT + ' ===');
    console.log('    footer height ' + m.footerH + ', top row ' + m.topH + ', bottom row ' + m.bottomH);
    console.log('    container ' + m.containerL + '..' + m.containerR + ' (w=' + m.containerW + ')');
    console.log('    logo ' + m.logoW + 'x' + m.logoH + '  nav w=' + m.navW + ' h=' + m.navH + '  soc w=' + m.socW + ' icon h=' + m.socImgH);
    console.log('    rows: ' + m.rows.map(r => '[' + r.items.join(' | ') + ']').join('  '));

    check('no horizontal overflow', m.scrollW <= m.innerW + 1, `scrollW=${m.scrollW} innerW=${m.innerW}`);
    check('container width <= 1440', m.containerW <= 1442, `w=${m.containerW}`);
    check('logo rendered', m.logoH > 0, `h=${m.logoH}`);
    check('logo square (180x180 asset)', Math.abs(m.logoW - m.logoH) / m.logoH < 0.12, `${m.logoW}x${m.logoH}`);
    check('social icons rendered (4)', m.socCount === 4 && m.socImgH > 0, `count=${m.socCount} h=${m.socImgH}`);
    check('divider spans container', Math.abs(m.dividerL - m.containerL) < 20 && Math.abs(m.dividerR - m.containerR) < 20,
          `div ${m.dividerL}..${m.dividerR} vs cont ${m.containerL}..${m.containerR}`);
    check('copyright text', m.copyrightText.includes('Outpost Games'), `"${m.copyrightText}"`);
    check('legal links', m.legalText.includes('PRIVACY POLICY') && m.legalText.includes('TERMS OF SERVICES') && m.legalText.includes('CODE OF CONDUCT'),
          `"${m.legalText}"`);

    if (WIDTH >= 1024) {
        check('nav wraps to 2 rows', m.rows.length === 2, `rows=${m.rows.length}`);
        check('row 1: MAIN ABOUT GAME FEATURES', m.rows[0] && m.rows[0].items.join(' ') === 'MAIN ABOUT GAME FEATURES',
              m.rows[0] && m.rows[0].items.join(' '));
        check('row 2: SYSTEM REQUIREMENTS QUOTES', m.rows[1] && m.rows[1].items.join(' ') === 'SYSTEM REQUIREMENTS QUOTES',
              m.rows[1] && m.rows[1].items.join(' '));
        check('nav centered in container (<=14px)', Math.abs(m.navCenter - m.containerCenter) <= 14,
              `nav=${m.navCenter} ctr=${m.containerCenter}`);
        check('logo left of nav', m.gapLogoNav > 0, `gap=${m.gapLogoNav}`);
        check('socials right of nav', m.gapNavSoc > 0, `gap=${m.gapNavSoc}`);
    } else {
        check('nav wraps (1-2 rows)', m.rows.length >= 1 && m.rows.length <= 2, `rows=${m.rows.length}`);
    }

    console.log(bad ? '\n' + bad + ' check(s) FAILED' : '\nall checks passed');
    process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('ERR: ' + e.message); process.exit(1); });
