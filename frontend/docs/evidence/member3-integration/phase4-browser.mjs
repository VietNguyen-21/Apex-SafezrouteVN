// Phase 4 native S1: real UI Select/Accept, lost reply, two-tab CAS race and historical retry.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { summarizeResponse } from './phase4-evidence.mjs';
import puppeteer from 'puppeteer-core';

assert(process.env.M3_ACCESS_FILE, 'Provide the private installation access file through M3_ACCESS_FILE');
const credentials = JSON.parse(await readFile(process.env.M3_ACCESS_FILE, 'utf8'));
const token = credentials.credentials.find(c => c.actor_id === 'member4')?.token;
assert(token, 'Owned dispatcher credential required');
const base = process.env.M3_BASE_URL ?? 'http://127.0.0.1:8004';
const front = process.env.M3_FRONTEND_URL ?? 'http://127.0.0.1:5174';
const build = 'd99f034a897b5c41f5b1c53efe32e57f62607072b237e858a6e1e3e11e68d756';
const requests = [], responses = [], errors = [], responseTasks = [];
async function bounded(promise, stage) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Native gate timed out: ${stage}`)), 125000); })]); }
  finally { clearTimeout(timer); }
}
async function http(path, body) {
  const response = await fetch(base + path, { method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(125000) });
  const envelope = await response.json();
  assert(response.ok, `${path}: ${envelope.diagnostics?.[0]?.code}`);
  return envelope.data;
}
const ready = await http('/ready'); assert(ready.ready && ready.checks.worker === 'PASS');
assert.equal((await http('/api/runtime/capabilities')).build_sha256, build);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true, protocolTimeout: 660000, args: ['--no-sandbox', '--disable-gpu', '--no-first-run'] });
let heldRace, admin;
const resumeSid = process.env.M3_PHASE4_SESSION;
const resumeCid = process.env.M3_PHASE4_COMPARISON;
const resumeSession = resumeSid ? await http(`/api/sessions/${resumeSid}`) : null;
const resumeComparison = resumeSid && resumeCid ? await http(`/api/sessions/${resumeSid}/profiles/comparisons/${resumeCid}`) : null;
try {
  async function newPage() {
    const page = await browser.newPage(); page.setDefaultTimeout(125000); await page.setViewport({ width: 1440, height: 1000 });
    await page.evaluateOnNewDocument(bearer => sessionStorage.setItem('saferoute.member3.bearer', bearer), token);
    if (resumeSession && resumeComparison) await page.evaluateOnNewDocument(({ base, session, comparison }) => {
      const key = `saferoute.member3.session.v1:${base}`;
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ schemaVersion: 1, session,
        comparison: { id: comparison.comparison_id, inputBasis: comparison.input_basis } }));
    }, { base, session: resumeSession, comparison: resumeComparison });
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (request.url().startsWith(base) && request.method() !== 'OPTIONS') requests.push({ tab: page === admin ? 'admin' : 'race',
        path: new URL(request.url()).pathname, method: request.method(), ...(request.method() === 'POST' ? { body: JSON.parse(request.postData()) } : {}) });
    });
    page.on('response', response => {
      if (response.url().startsWith(base) && response.request().method() !== 'OPTIONS') responseTasks.push((async () => {
        responses.push({ path: new URL(response.url()).pathname, status: response.status(), envelope: await response.json() });
      })().catch(() => {})); // Deliberately aborted response has no JSON body.
    });
    return page;
  }
  admin = await newPage();
  await admin.goto(front + '/admin', { waitUntil: 'domcontentloaded' });
  await admin.waitForSelector('.admin-page[data-dispatch-source="MEMBER3_HTTP"]');
  if (!resumeSession) {
  await admin.click('.scenario-collapsible summary');
  await admin.waitForFunction(() => !document.querySelector('.scenario-body select').disabled);
  await admin.select('.scenario-body select', 'S1');
  await admin.waitForFunction(() => document.querySelector('.scenario-body select')?.value === 'S1' && !document.querySelector('.scenario-body select').disabled);
  }
  const sid = await admin.$eval('.admin-page', el => el.dataset.sessionId), prefix = `/api/sessions/${sid}`;
  const before = await http(prefix + '/state'); assert.equal(before.active_job_id, null); assert.deepEqual(before.delivered_prefix, []);
  console.log(JSON.stringify({ stage: resumeComparison ? 'native-owned-comparison-resume' : 'native-optimize', session_id: sid, build }));
  if (!resumeComparison) await admin.click('.cta-optimize');
  await admin.waitForFunction(() => document.querySelector('.admin-page')?.dataset.comparisonStatus === 'COMPLETED' && !document.querySelector('[aria-label="Select BALANCED"]')?.disabled,
    { timeout: 600000, polling: 1000 }).catch(async error => {
      console.log(JSON.stringify({ stage: 'preview-wait-failed', ui: await admin.evaluate(() => ({ status: document.querySelector('.admin-page')?.dataset.comparisonStatus,
        alert: document.querySelector('[role="alert"]')?.textContent, select: document.querySelector('[aria-label="Select BALANCED"]')?.outerHTML })) }));
      throw error;
    });
  const cid = await admin.$eval('.admin-page', el => el.dataset.comparisonId);
  const comparison = await http(prefix + `/profiles/comparisons/${cid}`);
  const balanced = comparison.jobs.find(j => j.profile === 'BALANCED').job_id;
  const safer = comparison.jobs.find(j => j.profile === 'SAFER').job_id;
  const selectionStart = requests.length;
  for (const profile of ['FASTEST', 'SAFER', 'BALANCED']) await admin.click(`[aria-label="Select ${profile}"]`);
  assert.equal(requests.slice(selectionStart).filter(r => r.method === 'POST').length, 0);
  assert.deepEqual(await http(prefix + '/state'), before);
  assert(await admin.$eval('[aria-label="Accept selected plan"]', el => !el.disabled));
  console.log(JSON.stringify({ stage: 'select-read-only-pass', comparison_id: cid, selected_job: balanced }));

  const race = await newPage(); await race.goto(front + '/admin', { waitUntil: 'domcontentloaded' });
  await race.waitForFunction(() => document.querySelector('[aria-label="Select SAFER"]')?.disabled === false);
  await race.click('[aria-label="Select SAFER"]');
  await race.setRequestInterception(true);
  let raceStarted;
  const raceReady = new Promise(resolve => { raceStarted = resolve; });
  race.on('request', request => {
    if (request.url().startsWith(base) && request.method() === 'POST' && request.url().endsWith('/accept')) { heldRace = request; raceStarted(); }
    else void request.continue();
  });
  await race.click('[aria-label="Accept selected plan"]'); await bounded(raceReady, 'race command reached HTTP');
  console.log(JSON.stringify({ stage: 'race-post-held' }));

  // Send the first UI command to the real server, then lose its HTTP reply after commit.
  await admin.setRequestInterception(true);
  let loseOnce = true, lostResult, committed;
  const lostCommitted = new Promise(resolve => { committed = resolve; });
  admin.on('request', request => {
    if (loseOnce && request.url().startsWith(base) && request.method() === 'POST' && request.url().endsWith('/accept')) {
      loseOnce = false;
      void (async () => {
        const response = await fetch(request.url(), { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: request.postData(), signal: AbortSignal.timeout(125000) });
        const envelope = await response.json(); assert.equal(response.status, 200);
        lostResult = envelope.data; responses.push({ path: new URL(request.url()).pathname, status: 200, envelope, reply_deliberately_lost: true });
        await request.abort('failed'); committed();
      })().catch(error => { errors.push(error.message); committed(); });
    } else void request.continue();
  });
  await admin.bringToFront();
  assert(await admin.$eval('[aria-label="Accept selected plan"]', el => !el.disabled), 'Winner Accept must remain enabled before CAS');
  await admin.click('[aria-label="Accept selected plan"]'); await bounded(lostCommitted, 'winner committed and reply lost');
  await admin.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent.includes('NETWORK_ERROR'));
  assert(lostResult);
  assert.equal(lostResult.receipt.job_id, balanced);
  const accepted = await http(prefix + '/state');
  assert.equal(accepted.active_job_id, balanced); assert.equal(accepted.basis.generation, lostResult.receipt.basis.generation);
  assert.equal(BigInt(accepted.basis.generation), BigInt(before.basis.generation) + 1n);
  assert.deepEqual(accepted.delivered_prefix, before.delivered_prefix);
  assert.equal(accepted.current_time, before.current_time);
  assert.deepEqual(accepted.vehicles.map(v => [v.position, v.current_load_kg, v.onboard_order_ids]), before.vehicles.map(v => [v.position, v.current_load_kg, v.onboard_order_ids]));
  const orders = await http(prefix + '/orders'); assert.equal(orders.orders.filter(o => o.status === 'DELIVERED').length, 0);

  await heldRace.continue(); heldRace = null;
  await race.bringToFront();
  await race.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent.includes('STALE_HEAD'));
  await race.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Refresh backend').click());
  await race.waitForFunction(jid => document.body.textContent.includes(`Accepted ${jid}`), {}, balanced);
  assert(await race.evaluate(() => !document.querySelector('[aria-label="Accept selected plan"]') || document.querySelector('[aria-label="Accept selected plan"]').disabled));
  console.log(JSON.stringify({ stage: 'native-accept-lost-reply-and-stale-race-pass', accepted_job: balanced, rejected_job: safer }));

  // Explicit test-only replay proves that an old receipt does not replace newer world state.
  const replay = await http(prefix + '/replay/step', { request_id: `m4-p4-step-${crypto.randomUUID()}`,
    expected_revision: { head_version: accepted.basis.head_version, generation: accepted.basis.generation } });
  const advanced = await http(prefix + '/state'); assert.notDeepEqual(advanced.basis, accepted.basis);
  await admin.bringToFront();
  await admin.reload({ waitUntil: 'domcontentloaded' });
  await admin.waitForFunction(jid => document.body.textContent.includes(`Accepted ${jid}`) && !document.querySelector('[role="alert"]'), {}, balanced);
  const restored = await admin.evaluate(async base => {
    const [{ BackendDispatchApi }, { Member3Client }] = await Promise.all([import('/src/services/api/BackendDispatchApi.ts'), import('/src/integrations/member3/client.ts')]);
    return new BackendDispatchApi({ client: new Member3Client({ baseUrl: base }) }).getSnapshot();
  }, base);
  assert.deepEqual(restored.backend.executionView, advanced);
  assert.equal(restored.planState.acceptedExecution.jobId, balanced);
  assert.deepEqual(restored.planState.acceptedExecution.segments.map(s => s.coordinates),
    advanced.accepted_trajectory.vehicle_routes.flatMap(r => r.actions.filter(a => a.kind === 'EDGE').map(a => a.geometry)));
  assert.deepEqual(restored.planState.acceptedPlans, []);
  assert.equal(restored.backend.acceptances.length, 1);
  assert.deepEqual(restored.backend.acceptances[0], lostResult.receipt);
  const winnerPosts = requests.filter(r => r.tab === 'admin' && r.path.endsWith(`/jobs/${balanced}/accept`));
  assert(winnerPosts.length >= 2, 'Reload must retry the original lost request');
  for (const retry of winnerPosts.slice(1)) assert.deepEqual(retry.body, winnerPosts[0].body);
  assert.equal(requests.filter(r => r.path.endsWith(`/jobs/${safer}/accept`)).length, 1);
  assert.deepEqual(await http(prefix + '/state'), advanced);
  await admin.goto(front + '/driver', { waitUntil: 'domcontentloaded' });
  await admin.waitForFunction(() => document.body.textContent.includes('Accepted route') && document.body.textContent.includes('BALANCED'));
  assert.equal(await admin.$('[aria-label="Confirm Pickup"]'), null);
  await admin.screenshot({ path: new URL('./phase4-driver-native.png', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), fullPage: true });
  await Promise.all(responseTasks); assert.deepEqual(errors, []);
  const receipt = { schema_version: 'saferoute-member3-phase4-browser/1', recorded_at: new Date().toISOString(), status: 'PHASE4_NATIVE_S1_PASS',
    runtime_build_sha256: build, session_id: sid, comparison_id: cid, selected_job_id: balanced, race_job_id: safer,
    comparison_source: resumeComparison ? 'OWNED_PUBLIC_COMPARISON_RESUME' : 'FRESH_UI_OPTIMIZE',
    original_accept_posts: winnerPosts.length,
    checks: { select_zero_post: true, accept_exact_selected_job: true, generation_from_server: true, no_delivery_on_accept: true,
      durable_retry_same_body_id_after_reload: true, historical_receipt_does_not_rewind: true, stale_two_tab_race_rejected_and_refreshed: true,
      exact_accepted_edge_geometry: true, driver_accepted_only: true, backend_dispatch_source: true },
    before, accepted, advanced, acceptance: lostResult.receipt, replay, requests, responses: responses.map(summarizeResponse),
    response_evidence: 'Response summaries plus SHA256 of JSON.stringify(parsed envelope); full current world samples retained separately.',
    limitations: ['Local browser/native verification; no GitHub CI or reviewer Phase 3 sign-off claimed',
      'Replay step is an explicit test prerequisite, not frontend Phase 6 implementation', 'S1 only; default mock/offline preserved'] };
  const serialized = JSON.stringify(receipt, null, 2) + '\n'; assert(!serialized.includes(token), 'Evidence must not contain credentials');
  await writeFile(new URL('./phase4-native.json', import.meta.url), serialized);
  console.log(JSON.stringify({ status: receipt.status, checks: receipt.checks }));
} catch (error) {
  console.log(JSON.stringify({ stage: 'native-gate-failed', message: error.message, cause: error.cause?.message, errors }));
  if (admin && !admin.isClosed()) console.log(JSON.stringify(await admin.evaluate(() => ({ alert: document.querySelector('[role="alert"]')?.textContent,
    source: document.querySelector('.admin-page')?.dataset, selected: document.querySelector('[aria-label="Accept selected plan"]')?.outerHTML })).catch(() => null)));
  throw error;
} finally {
  if (heldRace) await heldRace.abort('failed').catch(() => {});
  await browser.close();
}
