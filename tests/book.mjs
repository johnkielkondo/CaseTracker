import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
await mkdir('.preview-tests', { recursive:true });
const browser = await chromium.launch({ channel:'chrome', headless:true, args:['--enable-unsafe-swiftshader','--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport:{ width:1440, height:1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto('http://127.0.0.1:8080/', { waitUntil:'networkidle' });
  await page.locator('#book-viewport.webgl-ready').waitFor();
  await page.screenshot({ path:'.preview-tests/closed.png' });
  assert.equal(await page.locator('#study-details').evaluate(el => el.inert), true);
  async function scroll(progress) {
    await page.evaluate(p => {
      const screen = document.querySelector('#auth-screen');
      screen.scrollTo({ top:(document.querySelector('.book-scroll').offsetHeight-screen.clientHeight)*p, behavior:'instant' });
    }, progress);
    await page.waitForTimeout(1100);
  }
  await scroll(.36);
  await page.screenshot({ path:'.preview-tests/turning.png' });
  assert.equal(await page.locator('#study-details').evaluate(el => el.inert), true);
  await scroll(1);
  await page.screenshot({ path:'.preview-tests/open.png' });
  assert.equal(await page.locator('#study-details').evaluate(el => el.inert), false);
  await page.locator('.skip-book').click();
  await page.waitForTimeout(400);
  assert.equal(await page.locator('#login-email').evaluate(el => document.activeElement === el), true);
  await page.screenshot({ path:'.preview-tests/details.png' });
  await scroll(0);
  assert.equal(await page.locator('#study-details').evaluate(el => el.inert), true);
  await page.setViewportSize({ width:390, height:844 });
  await page.waitForTimeout(700);
  await page.screenshot({ path:'.preview-tests/mobile.png' });
  await scroll(.4);
  await page.screenshot({ path:'.preview-tests/mobile-turn.png' });
  assert.equal(await page.evaluate(() => document.querySelector('#auth-screen').scrollWidth <= innerWidth), true);
  await page.emulateMedia({ reducedMotion:'reduce' });
  await page.waitForTimeout(400);
  assert.equal(await page.locator('#study-details').evaluate(el => el.inert), false);
  for (const route of ['about.html','developer.html']) {
    const response = await page.goto(`http://127.0.0.1:8080/${route}`);
    assert.equal(response.status(), 200);
    await page.locator('main h1').waitFor();
  }
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      if (type === 'webgl' || type === 'webgl2') return null;
      return original.call(this, type, ...args);
    };
  });
  await page.goto('http://127.0.0.1:8080/');
  await page.waitForTimeout(500);
  assert.equal(await page.locator('#study-details').evaluate(el => el.inert), false);
  assert.equal(await page.locator('.book-fallback').isVisible(), true);
  await page.locator('.skip-book').click();
  assert.equal(await page.locator('#login-email').evaluate(el => document.activeElement === el), true);
  assert.deepEqual(errors, []);
  console.log('PASS: WebGL, scroll, final reveal, reverse scroll, skip/focus, mobile, reduced motion, About, Developer, no-WebGL fallback; no page errors.');
} finally { await browser.close(); }
