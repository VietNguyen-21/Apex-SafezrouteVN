// Phase 5 only: real native barriers, UI Apply/recovery and UI reoptimization.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import puppeteer from 'puppeteer-core';
import { summarizeResponse } from './phase4-evidence.mjs';
import { acceptanceVisible, expiryOracle, requireCurrentBasis } from './phase5-evidence.mjs';

assert(process.env.M3_ACCESS_FILE, 'Set the private installation M3_ACCESS_FILE');
const access = JSON.parse(await readFile(process.env.M3_ACCESS_FILE, 'utf8'));
const token = access.credentials.find(c => c.actor_id === 'member4')?.token;
assert(token, 'An owned dispatcher credential is required');
const base = process.env.M3_BASE_URL ?? 'http://127.0.0.1:8004';
const front = process.env.M3_FRONTEND_URL ?? 'http://127.0.0.1:5174';
const build = 'd99f034a897b5c41f5b1c53efe32e57f62607072b237e858a6e1e3e11e68d756';
const option = name => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
const scenarios = [option('--scenario') ?? 'S2'];
assert(scenarios.every(s => ['S2', 'S3', 'S4'].includes(s)), 'Phase 5 supports S2/S3/S4');
const requests = [], responses = [], errors = [], responseTasks = [], cases = [];
const startedAt = new Date().toISOString();
const out = name => new URL(name, import.meta.url);
const revision = basis => ({ head_version: basis.head_version, generation: basis.generation });
async function http(path, body, expected = 200) {
  const res = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`,
    ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(240000) });
  const envelope = await res.json();
  requests.push({ origin: 'HTTP prerequisite/assertion', path, method: body ? 'POST' : 'GET', ...(body ? { body } : {}) });
  responses.push(summarizeResponse({ path, status: res.status, envelope }));
  assert.equal(res.status, expected, `${path}: ${JSON.stringify(envelope.diagnostics)}`);
  return expected < 400 ? envelope.data : envelope;
}
async function checkpoint(scenario, status, extra = {}) {
  await Promise.allSettled(responseTasks);
  const report = { schema_version: 'saferoute-m4-phase5-native/1', phase: 5, native: true, status, started_at: startedAt,
    recorded_at: new Date().toISOString(), base_url: base, frontend_url: front, build_sha256: build,
    prerequisite: 'Initial single BALANCED solve and Accept use real public HTTP; typed replay/step is test-only. Apply and three-profile Optimize use Admin UI.',
    coverage: scenarios, cases, requests, responses, page_errors: errors, ...extra };
  const serialized = JSON.stringify(report, null, 2);
  assert(!serialized.includes(token), 'Evidence must not contain bearer');
  await writeFile(out(`phase5-native-${scenario}.json`), serialized);
}
assert((await http('/ready')).ready); assert.equal((await http('/api/runtime/capabilities')).build_sha256, build);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true, protocolTimeout: 660000, args: ['--no-sandbox', '--disable-gpu', '--no-first-run'] });
let current;
try {
  if (process.env.M3_PHASE5_CONTINUE_REPORT) {
    // Continue assertions after a harness-only failure; never resubmit Apply or Optimize.
    const prior = JSON.parse(await readFile(process.env.M3_PHASE5_CONTINUE_REPORT));
    const scenario = scenarios[0]; assert(['S2', 'S4'].includes(scenario));
    assert.deepEqual(prior.coverage, [scenario]); assert.equal(prior.status, 'FAIL');
    assert.deepEqual(prior.page_errors, []);
    current = prior.cases[0]; assert(current.apply_receipt && current.samples.after_apply && current.assertions.length >= 4);
    cases.push(current); requests.push(...prior.requests); responses.push(...prior.responses);
    const sid = current.session.session_id, prefix = `/api/sessions/${sid}`;
    const poll = prior.requests.filter(r => r.path.includes('/profiles/comparisons/')).at(-1).path;
    const comparison = await http(poll); assert.equal(comparison.status, 'COMPLETED');
    requireCurrentBasis(comparison.input_basis, current.samples.after_apply.basis);
    for (const row of comparison.jobs) { assert(row.view); requireCurrentBasis(row.view.input_basis, current.samples.after_apply.basis); }
    const page = await browser.newPage(); page.setDefaultTimeout(240000); await page.setViewport({ width: 1440, height: 1000 });
    await page.evaluateOnNewDocument(({ token, base, session, comparison }) => {
      sessionStorage.setItem('saferoute.member3.bearer', token);
      localStorage.setItem(`saferoute.member3.session.v1:${base}`, JSON.stringify({ schemaVersion: 1, session,
        comparison: { id: comparison.comparison_id, inputBasis: comparison.input_basis } }));
    }, { token, base, session: current.session, comparison });
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => {
      if (r.url().startsWith(base) && r.method() !== 'OPTIONS') requests.push({origin:'Admin browser continuation',path:new URL(r.url()).pathname,
        method:r.method(),...(r.method()==='POST'?{body:JSON.parse(r.postData())}:{})});
    });
    page.on('response', r => {
      if (r.url().startsWith(base) && r.request().method() !== 'OPTIONS') responseTasks.push((async()=>{
        responses.push(summarizeResponse({path:new URL(r.url()).pathname,status:r.status(),envelope:await r.json()}));
      })().catch(()=>{}));
    });
    await page.goto(front + '/admin', { waitUntil: 'domcontentloaded' });
    async function explicitRefresh() {
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Refresh backend' && !b.disabled));
      await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Refresh backend').click());
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Refresh backend' && !b.disabled));
    }
    if (scenario === 'S4') {
      await page.waitForSelector('.admin-page[data-dispatch-source="MEMBER3_HTTP"]');
      console.log(JSON.stringify({stage:'s4-explicit-fresh-restore'})); await explicitRefresh();
    }
    await page.waitForFunction(() => document.querySelector('.admin-page')?.dataset.comparisonStatus === 'COMPLETED' && !document.querySelector('[aria-label="Select BALANCED"]')?.disabled);
    assert(await page.$eval(`button[data-event-id="${current.event.event_id}"]`, b => b.disabled && b.textContent === 'Applied'));
    if (scenario === 'S4') {
      assert(current.comparison && current.expiry_oracle && current.proposal_ids.length > 0, 'Only a completed S4 comparison can continue to expiry');
      requireCurrentBasis(await http(prefix + '/state').then(v => v.basis), current.samples.after_apply.basis);
      const oracle = expiryOracle(await readFile(process.env.M3_S4_FIXTURE), current.session, current.event.event_id);
      assert.deepEqual(oracle, current.expiry_oracle);
      const balanced = comparison.jobs.find(j => j.profile === 'BALANCED').job_id;
      await page.waitForFunction(() => !document.querySelector('[aria-label="Select BALANCED"]')?.disabled);
      await page.click('[aria-label="Select BALANCED"]');
      await page.waitForFunction(() => document.querySelector('[aria-label="Accept selected plan"]')?.disabled === false);
      await page.click('[aria-label="Accept selected plan"]'); await page.waitForFunction(acceptanceVisible, {}, balanced);
      const accepted = await http(prefix + '/state'); assert.equal(accepted.active_job_id, balanced);
      console.log(JSON.stringify({stage:'s4-expiry-replay',time:oracle.end_time}));
      const body = {request_id:`p5-expiry-${randomUUID()}`,expected_revision:revision(accepted.basis),target_time:oracle.end_time};
      const expired = await page.evaluate(async ({base,sid,body}) => {const {Member3Client}=await import('/src/integrations/member3/client.ts');
        return new Member3Client({baseUrl:base}).step(sid,body);}, {base,sid,body});
      assert.equal(expired.execution_view.current_time, oracle.end_time);
      assert.equal(expired.execution_view.basis.overlay_sha256,current.samples.after_apply.basis.overlay_sha256);
      await explicitRefresh();
      await page.waitForFunction(time => document.body.textContent.includes(`Demo time: ${time}`), {}, oracle.end_time);
      assert(await page.$eval(`button[data-event-id="${current.event.event_id}"]`,b=>b.disabled&&b.textContent==='Applied'));
      assert(await page.$$eval('[aria-label^="Select "]',bs=>bs.every(b=>b.disabled)), 'Pre-expiry comparison is stale after accepted replay');
      current.samples.at_expiry=expired.execution_view; current.expiry_receipt=expired.receipt;
      current.assertions.push('Explicit UI Refresh clears transient stale gate; native replay reaches pinned expiry, UI follows server time, old proposals are disabled and provenance overlay hash remains authoritative');
      current.status='PASS'; assert.deepEqual(errors,[]);
      await checkpoint('S4','PASS',{continuation:{original_started_at:prior.started_at,reason:prior.failure,
        behavior:'Completed real UI Apply/Optimize retained; fresh UI restored after runtime-busy stale gate, then UI Accept and typed native expiry replay. No Apply/Optimize resubmitted.'}});
      console.log(JSON.stringify({stage:'phase5-native-pass',scenario:'S4',session_id:sid,comparison_id:comparison.comparison_id,continuation:true}));
    } else {
    const preview = await page.evaluate(async base => { const { BackendDispatchApi } = await import('/src/services/api/BackendDispatchApi.ts');
      const { Member3Client } = await import('/src/integrations/member3/client.ts');
      return new BackendDispatchApi({ client: new Member3Client({ baseUrl: base }) }).getSnapshot(); }, base);
    assert(preview.planState.proposedAlternatives.length > 0);
    for (const proposal of preview.planState.proposedAlternatives) requireCurrentBasis(proposal.origin.inputBasis, current.samples.after_apply.basis);
    requireCurrentBasis(preview.backend.basis, current.samples.after_apply.basis);
    const audit = await http(prefix + '/replay/history');
    assert.equal(audit.history.filter(r => r.operation === 'apply_event' && r.event_id === current.event.event_id).length, 1);
    current.comparison = comparison; current.proposal_ids = preview.planState.proposedAlternatives.map(p => p.id);
    current.assertions.push('UI Optimize three native profiles; comparison and proposals bind all nine fields of the post-event basis');
    current.status = 'PASS'; assert.deepEqual(errors, []);
    await checkpoint('S2', 'PASS', { continuation: { original_started_at: prior.started_at, reason: prior.failure,
      behavior: 'Read-only continuation of completed real UI Apply/Optimize; no command resubmitted.' } });
    console.log(JSON.stringify({ stage: 'phase5-native-pass', scenario: 'S2', session_id: sid, comparison_id: comparison.comparison_id, continuation: true }));
    }
  } else {
  for (const scenario of scenarios) {
    const resumedSid = process.env.M3_PHASE5_SESSION;
    const loaded = resumedSid ? { session: await http(`/api/sessions/${resumedSid}`), execution_view: await http(`/api/sessions/${resumedSid}/state`) }
      : await http(`/api/scenarios/${scenario}/load`, { request_id: `p5-load-${randomUUID()}` }, 201);
    assert.equal(loaded.session.scenario_id, scenario);
    assert.equal(loaded.session.build_sha256, build);
    const session = loaded.session, sid = session.session_id, prefix = `/api/sessions/${sid}`;
    current = { scenario, session, assertions: [], samples: { initial: loaded.execution_view } }; cases.push(current);
    const initialEvents = await http(prefix + '/events'); assert.equal(initialEvents.events.length, 1);
    const event = initialEvents.events[0]; assert.equal(event.apply_allowed, false);
    current.event = event;
    await checkpoint(scenario, 'IN_PROGRESS');
    console.log(JSON.stringify({ stage: 'initial-solve', scenario, session_id: sid, event_id: event.event_id }));
    let initialAccept;
    if (resumedSid && loaded.execution_view.active_job_id) {
      const acceptances = await http(prefix + '/acceptances');
      const receipt = acceptances.acceptances.find(r => r.job_id === loaded.execution_view.active_job_id); assert(receipt);
      initialAccept = { receipt, execution_view: loaded.execution_view };
      current.prerequisite_resumed = true;
    } else {
    const submission = await http(prefix + '/optimize', { request_id: `p5-initial-solve-${randomUUID()}`, profile: 'BALANCED', expected_revision: revision(loaded.execution_view.basis) }, 202);
    let job;
    const deadline = Date.now() + 660000;
    do {
      job = await http(prefix + `/jobs/${submission.job_id}`);
      if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.job_status)) break;
      await new Promise(resolve => setTimeout(resolve, 4000));
    } while (Date.now() < deadline);
    assert.equal(job.job_status, 'COMPLETED'); assert(job.plan_available && job.validation.valid);
    const stateForAccept = await http(prefix + '/state');
    initialAccept = await http(prefix + `/jobs/${job.job_id}/accept`, { request_id: `p5-initial-accept-${randomUUID()}`, expected_revision: revision(stateForAccept.basis) });
    }
    current.initial_acceptance = initialAccept.receipt;
    const context = await browser.createBrowserContext(), page = await context.newPage();
    page.setDefaultTimeout(240000); await page.setViewport({ width: 1440, height: 1000 });
    await page.evaluateOnNewDocument(({ token, base, session }) => {
      sessionStorage.setItem('saferoute.member3.bearer', token);
      localStorage.setItem(`saferoute.member3.session.v1:${base}`, JSON.stringify({ schemaVersion: 1, session }));
    }, { token, base, session });
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => {
      if (r.url().startsWith(base) && r.method() !== 'OPTIONS') requests.push({ origin: 'Admin browser', path: new URL(r.url()).pathname,
        method: r.method(), ...(r.method() === 'POST' ? { body: JSON.parse(r.postData()) } : {}) });
    });
    page.on('response', r => {
      if (r.url().startsWith(base) && r.request().method() !== 'OPTIONS') responseTasks.push((async () => {
        responses.push(summarizeResponse({ path: new URL(r.url()).pathname, status: r.status(), envelope: await r.json() }));
      })().catch(() => {})); // Aborted reply intentionally has no JSON.
    });
    async function refresh() {
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Refresh backend' && !b.disabled));
      await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Refresh backend').click());
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Refresh backend' && !b.disabled));
    }
    async function snapshot() {
      return page.evaluate(async base => { const { BackendDispatchApi } = await import('/src/services/api/BackendDispatchApi.ts');
        const { Member3Client } = await import('/src/integrations/member3/client.ts');
        return new BackendDispatchApi({ client: new Member3Client({ baseUrl: base }) }).getSnapshot(); }, base);
    }
    async function step(basis, target) {
      return page.evaluate(async ({ base, sid, body }) => { const { Member3Client } = await import('/src/integrations/member3/client.ts');
        return new Member3Client({ baseUrl: base }).step(sid, body); }, { base, sid,
        body: { request_id: `p5-step-${randomUUID()}`, expected_revision: revision(basis), target_time: target } });
    }
    await page.goto(front + '/admin', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(`button[data-event-id="${event.event_id}"]`);
    assert(await page.$eval(`button[data-event-id="${event.event_id}"]`, b => b.disabled && b.textContent === 'Not due'));
    const notDue = await http(prefix + `/events/${event.event_id}/apply`, { request_id: `p5-not-due-${randomUUID()}`, expected_revision: revision(initialAccept.execution_view.basis) }, 409);
    assert.equal(notDue.diagnostics[0].code, 'EVENT_NOT_DUE');
    current.assertions.push('Server not-due diagnostic; Admin Apply disabled before observed barrier');
    const advance = await step(initialAccept.execution_view.basis, event.timestamp);
    assert.equal(advance.execution_view.current_time, event.timestamp); assert(advance.execution_view.observed_metrics);
    const atBarrier = await http(prefix + '/events'); assert.equal(atBarrier.events[0].apply_allowed, true);
    current.samples.barrier = advance.execution_view; current.barrier_receipt = advance.receipt;
    current.barrier_events = atBarrier;
    await refresh(); await page.waitForFunction(eid => !document.querySelector(`button[data-event-id="${eid}"]`).disabled, {}, event.event_id);
    current.assertions.push('Typed native step reaches exact event timestamp; server apply_allowed enables UI');
    console.log(JSON.stringify({ stage: 'barrier-ready', scenario, time: event.timestamp, basis: atBarrier.basis }));
    let lostReceipt, interceptedFailure;
    if (scenario === 'S2') {
      await page.setRequestInterception(true); let loseOnce = true;
      page.on('request', r => {
        if (loseOnce && r.url().startsWith(base) && r.method() === 'POST' && r.url().endsWith('/apply')) {
          loseOnce = false;
          void (async () => {
            const response = await fetch(r.url(), { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: r.postData(), signal: AbortSignal.timeout(240000) });
            const envelope = await response.json(); assert.equal(response.status, 200);
            lostReceipt = envelope.data.receipt;
            responses.push(summarizeResponse({ path: new URL(r.url()).pathname, status: 200, envelope, reply_deliberately_lost: true }));
            await r.abort('failed');
          })().catch(e => { interceptedFailure = e; void r.abort('failed'); });
        } else void r.continue();
      });
    }
    await page.click(`button[data-event-id="${event.event_id}"]`);
    if (scenario === 'S2') {
      await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent.includes('NETWORK_ERROR'));
      assert.ifError(interceptedFailure); assert(lostReceipt);
      await refresh();
    }
    await page.waitForFunction(eid => document.querySelector(`button[data-event-id="${eid}"]`)?.textContent === 'Applied', {}, event.event_id);
    const after = await http(prefix + '/state'), orders = await http(prefix + '/orders'), audit = await http(prefix + '/replay/history');
    const appliedReceipts = audit.history.filter(r => r.operation === 'apply_event' && r.event_id === event.event_id);
    assert.equal(appliedReceipts.length, 1); const receipt = appliedReceipts[0];
    assert.equal(BigInt(after.basis.head_version), BigInt(advance.execution_view.basis.head_version) + 1n);
    assert.equal(after.basis.generation, advance.execution_view.basis.generation);
    assert.equal(after.current_time, advance.execution_view.current_time); assert.deepEqual(after.delivered_prefix, advance.execution_view.delivered_prefix);
    assert.deepEqual(after.vehicles.map(v => [v.vehicle_id, v.position, v.current_load_kg, v.onboard_order_ids]), advance.execution_view.vehicles.map(v => [v.vehicle_id, v.position, v.current_load_kg, v.onboard_order_ids]));
    assert.equal(after.active_job_id, null); assert.equal(after.accepted_trajectory, null);
    assert(await page.$eval(`button[data-event-id="${event.event_id}"]`, b => b.disabled));
    if (scenario === 'S2') {
      const newIds = after.order_ids.filter(id => !advance.execution_view.order_ids.includes(id)); assert.deepEqual(newIds, ['O009']);
      assert.equal(orders.orders.filter(o => o.order_id === 'O009').length, 1);
      const applyPosts = requests.filter(r => r.origin === 'Admin browser' && r.method === 'POST' && r.path === prefix + `/events/${event.event_id}/apply`);
      assert(applyPosts.length >= 2); assert(applyPosts.every(r => JSON.stringify(r.body) === JSON.stringify(applyPosts[0].body)));
      current.assertions.push('Reply lost after real commit: retry original request ID/body, one APPLIED receipt and one O009');
    } else if (scenario === 'S3') {
      const immobilized = after.vehicles.filter(v => v.availability === 'UNAVAILABLE'); assert.equal(immobilized.length, 1);
      assert.equal(immobilized[0].activity, 'IMMOBILIZED');
      assert(immobilized[0].onboard_order_ids.length > 0, 'S3 native custody proof must include onboard orders on the unavailable owner');
      current.custody = orders.orders.filter(o => o.status === 'ONBOARD').map(o => ({ order_id: o.order_id, owner_vehicle_id: o.owner_vehicle_id }));
      current.assertions.push('Unavailable vehicle immobilized; all physical positions/load/custody and delivered prefix preserved');
    } else assert(after.basis.overlay_sha256);
    const fresh = await snapshot(); assert(fresh.backend.needsReoptimization); assert.equal(fresh.decisionState.context.rain, null);
    current.samples.after_apply = after; current.samples.after_apply_orders = orders; current.apply_receipt = receipt;
    await checkpoint(scenario, 'IN_PROGRESS');
    console.log(JSON.stringify({ stage: 'apply-confirmed', scenario, mutation_id: receipt.mutation_id, basis: after.basis }));
    const already = await http(prefix + `/events/${event.event_id}/apply`, { request_id: `p5-new-apply-${randomUUID()}`, expected_revision: revision(after.basis) }, 409);
    assert.equal(already.diagnostics[0].code, 'EVENT_ALREADY_APPLIED');
    current.assertions.push('Apply advances head once, keeps generation/prefix/custody, suspends plan; confirmed history shows Applied with no OFF or mock rain geometry');
    await page.screenshot({ path: out(`phase5-${scenario}-applied.png`).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
    await page.waitForFunction(() => !document.querySelector('.cta-optimize').disabled); await page.click('.cta-optimize');
    console.log(JSON.stringify({ stage: 'ui-reoptimization-started', scenario }));
    await page.waitForFunction(() => ['COMPLETED', 'FAILED', 'CANCELLED'].includes(document.querySelector('.admin-page')?.dataset.comparisonStatus), { timeout: 660000, polling: 1500 });
    const cid = await page.$eval('.admin-page', el => el.dataset.comparisonId);
    const comparison = await http(prefix + `/profiles/comparisons/${cid}`);
    assert.equal(comparison.status, 'COMPLETED'); assert.deepEqual(comparison.input_basis, after.basis);
    for (const row of comparison.jobs) { assert(row.view); requireCurrentBasis(row.view.input_basis, after.basis); }
    const preview = await snapshot();
    for (const proposal of preview.planState.proposedAlternatives) requireCurrentBasis(proposal.origin.inputBasis, after.basis);
    assert(preview.planState.proposedAlternatives.length > 0);
    current.comparison = comparison; current.proposal_ids = preview.planState.proposedAlternatives.map(p => p.id);
    current.assertions.push('UI Optimize three native profiles; comparison and proposals bind all nine fields of the post-event basis');
    if (scenario === 'S4') {
      assert(process.env.M3_S4_FIXTURE, 'Provide pinned M1 S4 fixture for the test-only expiry oracle');
      current.expiry_oracle = expiryOracle(await readFile(process.env.M3_S4_FIXTURE), session, event.event_id);
      await refresh(); // A transient read error leaves actions fenced until explicit fresh recovery.
      await page.waitForFunction(() => !document.querySelector('[aria-label="Select BALANCED"]')?.disabled);
      await page.click('[aria-label="Select BALANCED"]'); await page.click('[aria-label="Accept selected plan"]');
      const balancedJob = comparison.jobs.find(j => j.profile === 'BALANCED').job_id;
      await page.waitForFunction(acceptanceVisible, {}, balancedJob);
      const accepted = await http(prefix + '/state'); assert.equal(accepted.active_job_id, balancedJob);
      const expired = await step(accepted.basis, current.expiry_oracle.end_time);
      assert.equal(expired.execution_view.current_time, current.expiry_oracle.end_time); assert.equal(expired.execution_view.basis.overlay_sha256, after.basis.overlay_sha256);
      await refresh(); const expiredSnapshot = await snapshot();
      assert.equal(expiredSnapshot.demoClock.now, current.expiry_oracle.end_time); assert.equal(expiredSnapshot.decisionState.context.rain, null);
      assert.equal(expiredSnapshot.backend.basis.overlay_sha256, expired.execution_view.basis.overlay_sha256);
      current.samples.at_expiry = expired.execution_view; current.expiry_receipt = expired.receipt;
      current.assertions.push('Native replay reaches pinned half-open rain expiry; UI follows server time and retains provenance overlay hash without fabricating a polygon or clearing server context');
    }
    assert.deepEqual(errors, []); current.status = 'PASS';
    await checkpoint(scenario, 'PASS');
    console.log(JSON.stringify({ stage: 'phase5-native-pass', scenario, session_id: sid, comparison_id: cid, assertions: current.assertions.length }));
    await context.close();
  }
  }
} catch (error) {
  await checkpoint(current?.scenario ?? scenarios[0], 'FAIL', { failure: error.message }); throw error;
} finally { await browser.close(); }
