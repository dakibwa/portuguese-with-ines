// Screenshots the ten-layouts preview so a change can be checked by eye.
// Run:  node docs/platform/templates/shot.mjs             (every concept, plus a phone-width page)
//       node docs/platform/templates/shot.mjs grid,still  (only those concepts)
// Writes top.png, c-<id>.png and phone-top.png here; they are not committed.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// The repo's own Playwright after `npm install`; the cloud sandbox's global copy otherwise.
const { chromium } = await import('playwright').catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

{
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  let browser;
  try { browser = await chromium.launch({ proxy }); }
  catch (e) { browser = await chromium.launch({ proxy, executablePath: '/opt/pw-browsers/chromium' }); }
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror ' + e.message));
  const url = 'file://' + path.join(here, 'ten-layouts.html');
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  const fonts = await page.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family).filter((v, i, a) => a.indexOf(v) === i));
  console.log('fonts loaded:', fonts.join(', '));
  const which = process.argv[2] ? process.argv[2].split(',') : null;
  await page.screenshot({ path: path.join(here, 'top.png') });
  for (const sec of await page.$$('section.concept')) {
    const id = await sec.getAttribute('id');
    if (which && !which.includes(id)) continue;
    await sec.screenshot({ path: path.join(here, `c-${id}.png`) });
  }
  console.log('page overflow px:', await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));
  console.log('errors:', errs.slice(0, 10));
  if (!which) {
    const p2 = await ctx.newPage();
    await p2.setViewportSize({ width: 390, height: 900 });
    await p2.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
    await p2.waitForTimeout(1200);
    await p2.screenshot({ path: path.join(here, 'phone-top.png') });
    console.log('phone overflow px:', await p2.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));
  }
  await browser.close();
}
