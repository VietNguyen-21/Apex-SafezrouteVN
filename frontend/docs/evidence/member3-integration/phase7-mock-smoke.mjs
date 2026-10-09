import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
assert(process.env.M3_MOCK_FRONTEND_URL, 'Set explicit M3_MOCK_FRONTEND_URL');
const front = new URL(process.env.M3_MOCK_FRONTEND_URL).origin;
assert(['127.0.0.1','localhost'].includes(new URL(front).hostname));
const graph = JSON.parse(await readFile(new URL('../../../dist-mock/build-graph.json', import.meta.url)));
assert.equal(graph.mode, 'mock', 'Smoke requires an explicit built mock artifact');
assert(graph.modules.some(m => m.id.endsWith('/MockStateEngine.ts')));
assert(!graph.modules.some(m => /member2-(event-)?road-packs|offlineRoadPlans|offlineRoadPackCatalog/.test(m.id)));
const report = { schema_version: 'saferoute-m4-phase7-mock-smoke/1', native: false, mode: 'mock', status: 'IN_PROGRESS', api_requests: [], page_errors: [], assertions: [] };
const output = new URL('phase7-mock-smoke.json', import.meta.url);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox','--disable-gpu','--no-first-run'] });
async function click(page, selector) {
  await page.bringToFront(); await page.waitForFunction(selector => {
    const button = document.querySelector(selector);
    if (!button || button.disabled) return false;
    button.click(); return true;
  }, {}, selector);
}
try {
  const admin = await browser.newPage(), driver = await browser.newPage();
  for (const page of [admin, driver]) {
    page.on('pageerror', e => report.page_errors.push(e.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      if (/^\/(api\/|ready$)/.test(url.pathname)) report.api_requests.push({ origin: url.origin, path: url.pathname, method: request.method() });
      if (url.origin !== front) void request.abort('failed'); else void request.continue();
    });
  }
  await admin.setViewport({ width: 1440, height: 1000 });
  await admin.goto(front + '/admin', { waitUntil: 'networkidle0' });
  await driver.setViewport({ width: 390, height: 950 });
  await driver.goto(front + '/driver', { waitUntil: 'networkidle0' });
  assert.equal(await driver.$$eval('.leaflet-overlay-pane path', elements => elements.length), 0);
  await click(admin, '[aria-label="Optimize"]');
  await click(admin, '[aria-label="Select BALANCED"]');
  const selected = await admin.evaluate(() => JSON.parse(localStorage.getItem('saferoute.phase1.dispatch.v1')).snapshot);
  assert.equal(selected.planState.acceptedPlans.length, 0);
  assert.equal(selected.planState.proposedAlternatives.length, 3);
  assert(selected.planState.proposedAlternatives.every(p => p.content.provenance.source !== 'Member 2 offline runtime'));
  assert(selected.planState.proposedAlternatives.flatMap(p => p.content.vehiclePlans.flatMap(v => v.routeSegments)).every(s => s.geometrySource === 'SCHEMATIC_DEMO'));
  await click(admin, '[aria-label="Accept selected plan"]');
  await driver.reload({ waitUntil: 'networkidle0' });
  await driver.waitForSelector('[aria-label="Accepted route"]');
  assert(await driver.$$eval('.leaflet-overlay-pane path', elements => elements.length > 0));
  await click(driver, '.drv-btn--pickup');
  const onboard = await driver.evaluate(() => JSON.parse(localStorage.getItem('saferoute.phase1.dispatch.v1')).snapshot);
  assert(onboard.decisionState.orders.some(o => o.status === 'ONBOARD'));
  await click(driver, '[aria-label^="Mark delivered for order "]');
  const delivered = await driver.evaluate(() => JSON.parse(localStorage.getItem('saferoute.phase1.dispatch.v1')).snapshot);
  assert(delivered.decisionState.orders.some(o => o.status === 'DELIVERED'));
  assert(!delivered.backend);
  report.assertions = ['Explicit built mock entry loads offline', 'Select leaves Driver unaccepted', 'Three lightweight schematic proposals carry demo provenance', 'Accept/reload/pickup/delivery remain offline', 'Demo identity labels stay available in mock'];
  assert((await driver.$eval('body', body => body.textContent)).includes('Nguy\u1ec5n V\u0103n A'));
  assert.deepEqual(report.api_requests, []); assert.deepEqual(report.page_errors, []);
  report.status = 'PASS'; report.active_mock_plan = delivered.planState.activeAcceptedPlanId;
  report.scope = 'Explicit offline demo only; no native SDK certification or physical delivery claim';
  await writeFile(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, native: false, receipt: fileURLToPath(output) }));
} catch (error) { report.status = 'FAIL'; report.failure = String(error); await writeFile(output, JSON.stringify(report, null, 2)); throw error; }
finally { await browser.close(); }
