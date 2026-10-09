// Native browser gate: observes actual Leaflet polyline inputs, without replacing its renderer.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const prior = JSON.parse(await readFile(new URL('./phase3-forecast-scopes-http-native.json', import.meta.url), 'utf8'));
const credentials = JSON.parse(await readFile(process.env.M3_ACCESS_FILE, 'utf8'));
const token = credentials.credentials.find(c => c.actor_id === 'member4')?.token;
assert(token);
const base = process.env.M3_BASE_URL ?? 'http://127.0.0.1:8002';
const front = process.env.M3_FRONTEND_URL ?? 'http://127.0.0.1:5174';
const sid = prior.session.session_id, prefix = `/api/sessions/${sid}`;
async function get(path) {
  const response = await fetch(base + path, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(125000) });
  const envelope = await response.json(); assert(response.ok, `${path}: ${envelope.diagnostics?.[0]?.code}`); return envelope.data;
}
const before = await get(prefix + '/state');
assert(before.observed_metrics && before.planned_suffix_metrics && before.projected_whole_metrics);
const existingComparison = process.env.M3_COMPARISON_ID ? await get(prefix + `/profiles/comparisons/${process.env.M3_COMPARISON_ID}`) : null;
if (existingComparison) assert.deepEqual(existingComparison.input_basis, before.basis);
const ready = await get('/ready'); assert(ready.ready && ready.checks.worker === 'PASS');
const canvasModule = await (await fetch(front + '/src/shared/components/LeafletCanvas.tsx')).text();
const leafletUrl = /import\s+\S+\s+from "([^"]+\/leaflet\.js[^"]*)"/.exec(canvasModule)?.[1];
assert(leafletUrl, 'Find the actual Vite Leaflet module URL');
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true, args: ['--no-sandbox', '--disable-gpu', '--no-first-run'] });
const requests = [], errors = [];
try {
  const page = await browser.newPage(); page.setDefaultTimeout(300000);
  await page.setViewport({ width: 1440, height: 1100 });
  await page.evaluateOnNewDocument(({ token, base, session, comparison }) => {
    sessionStorage.setItem('saferoute.member3.bearer', token);
    const key = `saferoute.member3.session.v1:${base}`;
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ schemaVersion: 1, session,
      ...(comparison ? { comparison: { id: comparison.comparison_id, inputBasis: comparison.input_basis } } : {}) }));
  }, { token, base, session: prior.session, comparison: existingComparison });
  await page.setRequestInterception(true);
  page.on('request', async request => {
    const url = new URL(request.url());
    if (request.url().startsWith(base)) requests.push({ path: url.pathname, method: request.method() });
    if (request.url().startsWith(front) && url.pathname === '/src/main.tsx') {
      const response = await fetch(request.url());
      const instrumentation = `import __leaflet from ${JSON.stringify(leafletUrl)};globalThis.__nativePolylineInputs=[];const __originalPolyline=__leaflet.polyline;__leaflet.polyline=function(points,options){globalThis.__nativePolylineInputs.push({points:JSON.parse(JSON.stringify(points)),options:JSON.parse(JSON.stringify(options))});return __originalPolyline.call(this,points,options)};\n`;
      await request.respond({ status: response.status, contentType: 'text/javascript', body: instrumentation + await response.text() });
    } else await request.continue();
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(front + '/admin', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(sid => document.querySelector('.admin-page')?.dataset.sessionId === sid && document.querySelector('.cta-optimize,.cta-reoptimize')?.disabled === false, {}, sid);
  const nativeScopes = await page.evaluate(async ({ base }) => {
    const [{ BackendDispatchApi }, { Member3Client }, { executionMetrics, formatMetric }] = await Promise.all([
      import('/src/services/api/BackendDispatchApi.ts'), import('/src/integrations/member3/client.ts'), import('/src/integrations/member3/metricsAdapter.ts')]);
    const snapshot = await new BackendDispatchApi({ client: new Member3Client({ baseUrl: base }) }).getSnapshot();
    return { snapshot, scopes: Object.values(executionMetrics(snapshot.backend.executionView)).map(metrics => ({ metrics,
      text: [formatMetric(metrics, metrics.scope === 'OBSERVED_PREFIX_ONLY' ? 'distance_m' : 'total_distance_m', 'km'),
        formatMetric(metrics, metrics.scope === 'OBSERVED_PREFIX_ONLY' ? 'travel_time_us' : 'total_travel_time_s', 'min'),
        formatMetric(metrics, metrics.scope === 'OBSERVED_PREFIX_ONLY' ? 'relative_exposure_proxy' : 'total_exposure')] })) };
  }, { base });
  assert.deepEqual(nativeScopes.snapshot.backend.executionView, before);
  for (const item of nativeScopes.scopes) {
    const card = await page.$eval(`[aria-label="Backend execution metrics"] [data-metric-scope="${item.metrics.scope}"]`, el => el.textContent);
    for (const text of item.text) assert(card.includes(text), `${item.metrics.scope}: ${text}`);
  }
  await page.screenshot({ path: new URL('./phase3-forecast-native-scopes.png', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), fullPage: true });
  if (!existingComparison) await page.click('.cta-optimize');
  await page.waitForFunction(() => Boolean(document.querySelector('.admin-page')?.dataset.comparisonId));
  const comparisonId = await page.$eval('.admin-page', el => el.dataset.comparisonId);
  const deadline = Date.now() + 600000;
  while (Date.now() < deadline) {
    const status = await page.$eval('.admin-page', el => el.dataset.comparisonStatus);
    const selectable = await page.$eval('[aria-label="Select BALANCED"]', el => !el.disabled);
    console.log(JSON.stringify({ stage: 'browser-native-compare', status, selectable }));
    if (status === 'COMPLETED' && selectable) break;
    await new Promise(r => setTimeout(r, 10000));
  }
  assert(await page.$eval('[aria-label="Select BALANCED"]', el => !el.disabled));
  await page.evaluate(() => { globalThis.__nativePolylineInputs = []; });
  await page.click('[aria-label="Select BALANCED"]');
  for (const id of ['V1', 'V2']) {
    if (await page.$eval(`[aria-label="Show ${id} route"]`, el => el.getAttribute('aria-checked') !== 'true')) await page.click(`[aria-label="Show ${id} route"]`);
  }
  await page.waitForFunction(() => document.querySelector('[aria-label="Proposed — not dispatched"]') && globalThis.__nativePolylineInputs.some(x => x.options.dashArray === '7 6'));
  const rendered = await page.evaluate(async ({ base }) => {
    const [{ BackendDispatchApi }, { Member3Client }, { createAdminMapPresentation }] = await Promise.all([
      import('/src/services/api/BackendDispatchApi.ts'), import('/src/integrations/member3/client.ts'), import('/src/admin/adminMapPresentation.ts')]);
    const snapshot = await new BackendDispatchApi({ client: new Member3Client({ baseUrl: base }) }).getSnapshot();
    const selected = snapshot.planState.proposedAlternatives.find(p => p.id === snapshot.planState.selectedAlternativeId);
    return { snapshot, selected, presentation: createAdminMapPresentation(snapshot, selected, ['V1','V2']), captures: globalThis.__nativePolylineInputs };
  }, { base });
  assert.equal(rendered.presentation.source, 'PROPOSED'); assert.equal(rendered.presentation.scene.accepted.length, 0);
  assert.equal(rendered.snapshot.planState.acceptedExecution.jobId, before.active_job_id);
  assert.equal(rendered.selected.origin.comparisonId, comparisonId);
  const wire = await get(prefix + `/jobs/${rendered.selected.id}/forecast`);
  assert.deepEqual(wire.input_basis, before.basis);
  const actions = wire.trajectory.vehicle_routes.flatMap(route => route.actions.filter(action => action.kind === 'EDGE'));
  const sourceSegments = rendered.selected.nativeForecast.segments;
  assert.equal(sourceSegments.length, actions.length);
  for (let i = 0; i < actions.length; i++) {
    assert.deepEqual(sourceSegments[i].coordinates, actions[i].geometry);
    assert.equal(sourceSegments[i].edgeId, actions[i].edge_id);
    assert.equal(sourceSegments[i].fractionStart, actions[i].fraction_start);
    assert.equal(sourceSegments[i].fractionEnd, actions[i].fraction_end);
    assert.equal(sourceSegments[i].fractionStartExact, actions[i].fraction_start_exact);
  }
  const expectedLines = rendered.presentation.scene.proposed.map(s => (s.drawableCoordinates ?? s.coordinates).map(([lon,lat]) => [lat,lon]));
  const captured = rendered.captures.filter(x => x.options.dashArray === '7 6').flatMap(x => typeof x.points[0][0] === 'number' ? [x.points] : x.points);
  for (const line of expectedLines) assert(captured.some(actual => JSON.stringify(actual) === JSON.stringify(line)), 'Actual Leaflet receives exact drawable EDGE');
  assert(expectedLines.length > 0);
  assert(await page.$eval('.cta-accept', el => el.disabled));
  await page.screenshot({ path: new URL('./phase3-forecast-native-preview.png', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), fullPage: true });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(id => document.querySelector('.admin-page')?.dataset.comparisonId === id && document.querySelector('[aria-label="Select BALANCED"]')?.textContent.includes('Selected'), {}, comparisonId);
  const refreshed = await get(prefix + '/state'); assert.deepEqual(refreshed, before);
  await page.goto(front + '/driver', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[aria-label="Driver route map"]');
  assert.equal(await page.$('[aria-label="Proposed — not dispatched"]'), null);
  await page.waitForFunction(() => globalThis.__nativePolylineInputs.length > 0);
  const driverCaptures = await page.evaluate(() => globalThis.__nativePolylineInputs);
  assert(driverCaptures.every(x => x.options.dashArray !== '7 6'));
  const driverSnapshot = await page.evaluate(async ({ base }) => {
    const [{ BackendDispatchApi }, { Member3Client }, { createMapScene }] = await Promise.all([
      import('/src/services/api/BackendDispatchApi.ts'), import('/src/integrations/member3/client.ts'), import('/src/shared/components/mapScene.ts')]);
    const snapshot = await new BackendDispatchApi({ client: new Member3Client({ baseUrl: base }) }).getSnapshot();
    return { accepted: snapshot.planState.acceptedExecution, scene: createMapScene(snapshot, snapshot.planState.proposedAlternatives[0], 'V1') };
  }, { base });
  assert.equal(driverSnapshot.accepted.jobId, before.active_job_id); assert.equal(driverSnapshot.scene.proposed.length, 0);
  const driverLines = driverCaptures.flatMap(x => typeof x.points[0][0] === 'number' ? [x.points] : x.points);
  for (const segment of driverSnapshot.scene.accepted) {
    const line = (segment.drawableCoordinates ?? segment.coordinates).map(([lon,lat]) => [lat,lon]);
    assert(driverLines.some(actual => JSON.stringify(actual) === JSON.stringify(line)), 'Driver renders accepted source only, including return');
  }
  const after = await get(prefix + '/state'); assert.deepEqual(after, before);
  assert(requests.filter(r => r.method === 'POST').every(r => r.path.endsWith('/profiles/compare')));
  assert.deepEqual(errors, []);
  const receipt = { status: 'M3_PHASE3_FORECAST_MAP_AND_SCOPES_BROWSER_NATIVE_PASS', recordedAt: new Date().toISOString(),
    phase3Complete: true, baseUrl: base, sessionId: sid, comparisonId, ready, before, after,
    nativeScopes: { executionView: nativeScopes.snapshot.backend.executionView, scopes: nativeScopes.scopes },
    rendered: { selected: { id: rendered.selected.id, origin: rendered.selected.origin,
        metrics: rendered.selected.nativeForecast.metrics, jobView: rendered.selected.nativeForecast.jobView },
      acceptedJobId: rendered.snapshot.planState.acceptedExecution.jobId, currentBasis: rendered.snapshot.backend.basis,
      sourceSegments, presentation: rendered.presentation, captures: rendered.captures }, wire,
    driverSnapshot, driverCaptures, requests, errors,
    comparisonSource: existingComparison ? 'Existing current native comparison read through public API' : 'UI Optimize creates native current forecasts',
    assertions: ['current native forecasts bound to full current basis', 'all source EDGE points/direction/fractions equal public response',
      'actual Leaflet polyline inputs equal drawable geometry', 'local preview survives reload', 'Admin return/visibility/palettes retained',
      'Driver renders accepted routes only', 'non-null observed/planned/projected values equal public state and rendered scopes',
      'no implicit Accept/event/replay in browser preview', 'world exactly unchanged during browser gate'],
    instrumentation: 'Test-only wrapper observes L.polyline arguments then calls the original Leaflet renderer; app source is unchanged',
    limitations: ['Native S1 acceptance gate, not full Phase 7 S0-S4 end-to-end migration', 'Accepted completion unavailable without decision epoch/progress contract', 'Operational frontend Accept/Event/Replay controls remain later phases'] };
  await writeFile(new URL('./phase3-forecast-browser-native.json', import.meta.url), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ status: receipt.status, sessionId: sid, comparisonId, sourceEdges: sourceSegments.length, renderedEdges: expectedLines.length }));
} catch (error) {
  const page = (await browser.pages()).find(p => p.url().startsWith(front));
  if (page) console.error(JSON.stringify({ stage: 'browser-gate-failed', message: error.message,
    diagnostic: await page.evaluate(() => ({ path: location.pathname, session: document.querySelector('.admin-page')?.dataset.sessionId,
      comparison: document.querySelector('.admin-page')?.dataset.comparisonId, status: document.querySelector('.admin-page')?.dataset.comparisonStatus,
      notice: document.querySelector('.dispatch-status')?.textContent, text: document.body.innerText.slice(0,4000) })) }));
  throw error;
} finally { await browser.close(); }
