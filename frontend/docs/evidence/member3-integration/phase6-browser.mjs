// Real native Phase 6 gate; no HTTP interception or local physical state.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import puppeteer from 'puppeteer-core';
import { summarizeResponse } from './phase4-evidence.mjs';
import { enabledSelector, installFetchProbe } from './phase6-evidence.mjs';

assert(process.env.M3_ACCESS_FILE, 'Set private M3_ACCESS_FILE');
const access = JSON.parse(await readFile(process.env.M3_ACCESS_FILE, 'utf8'));
const token = access.credentials.find(c => c.actor_id === 'member4')?.token;
assert(token, 'Owned dispatcher credential required');
const base = process.env.M3_BASE_URL ?? 'http://127.0.0.1:8004', front = process.env.M3_FRONTEND_URL ?? 'http://127.0.0.1:5174';
const option = name => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
const scenario = option('--scenario') ?? 'S2'; assert(['S0', 'S2'].includes(scenario));
const build = 'd99f034a897b5c41f5b1c53efe32e57f62607072b237e858a6e1e3e11e68d756';
const requests = [], responses = [], errors = [], responseTasks = [], samples = {}, assertions = [], layouts = [], maxInFlight = {};
const started = new Date().toISOString(), out = name => new URL(name, import.meta.url);
let prerequisiteResume, continuation = false;
const pollingGate = { status: 'IN_PROGRESS', measure: 'Uncancelled same-endpoint GET fetches; aborted Chrome transport requests measured separately', captures: [] };
const revision = b => ({ head_version: b.head_version, generation: b.generation });
const delay = ms => new Promise(r => setTimeout(r, ms));
async function http(path, body, status = 200) {
  const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(240000) });
  const envelope = await r.json(); requests.push({ origin: 'HTTP prerequisite/assertion', path, method: body ? 'POST' : 'GET', ...(body ? { body } : {}) });
  responses.push(summarizeResponse({ path, status: r.status, envelope })); assert.equal(r.status, status, `${path}: ${JSON.stringify(envelope.diagnostics)}`); return envelope.data;
}
async function checkpoint(status, extra = {}) {
  await Promise.allSettled(responseTasks);
  const report = { schema_version: 'saferoute-m4-phase6-native/1', phase: 6, native: true, scenario, status, started_at: started, recorded_at: new Date().toISOString(), base_url: base, frontend_url: front, build_sha256: build,
    prerequisite: 'Native HTTP creates session and comparison. Actual Admin Select/Accept, Driver Step/Play/Speed/Pause/Reset and Admin Apply. Explicit HTTP step positions near barrier/final return only as labeled harness prerequisite.',
    assertions, samples, layouts, requests, responses, page_errors: errors, max_same_endpoint_in_flight: maxInFlight, polling_gate: pollingGate, prerequisite_resume: prerequisiteResume, ...extra };
  const bytes = JSON.stringify(report, null, 2); assert(!bytes.includes(token)); await writeFile(out(`phase6-native-${scenario}.json`), bytes);
}
let browser;
let stage = "prerequisites";
const pages = [];
function trace(next) { stage = next; console.log(JSON.stringify({ stage, scenario, at: new Date().toISOString() })); }
try {
  assert((await http('/ready')).ready); assert.equal((await http('/api/runtime/capabilities')).build_sha256, build);
  let prior, loaded;
  if (process.env.M3_PHASE6_PREREQUISITE_REPORT) {
    prior = JSON.parse(await readFile(process.env.M3_PHASE6_PREREQUISITE_REPORT, 'utf8'));
    assert.equal(prior.schema_version, 'saferoute-m4-phase6-native/1'); assert.equal(prior.native, true);
    assert.equal(prior.status, 'FAIL'); assert.equal(prior.scenario, scenario); assert.equal(prior.build_sha256, build);
    assert.deepEqual(prior.page_errors, []);
    continuation = Boolean(prior.samples.server_stop);
    if (continuation) {
      assert.equal(scenario, 'S2'); assert(prior.samples.accepted && prior.samples.after_step && prior.samples.pause_settled);
      assert(prior.samples.server_stop.fully_paused && prior.samples.server_stop.reason === 'EVENT_BARRIER' && !prior.samples.after_apply);
      assert(!prior.requests.some(r => r.method === 'POST' && /\/events\/.*\/apply$|\/replay\/reset$/.test(r.path)));
      Object.assign(samples, prior.samples); assertions.push(...prior.assertions);
    } else assert(prior.samples.comparison && !prior.samples.accepted && !prior.requests.some(r => r.origin.endsWith('browser') && r.method === 'POST'));
    requests.push(...prior.requests); responses.push(...prior.responses);
    const current = await http(`/api/sessions/${prior.samples.session.session_id}/state`);
    loaded = { session: await http(`/api/sessions/${prior.samples.session.session_id}`), execution_view: prior.samples.initial };
    assert.deepEqual(current, continuation ? prior.samples.server_stop.execution_view : prior.samples.initial);
    if (!continuation) assert.equal(current.active_job_id, null);
    prerequisiteResume = { prior_failure: prior.failure, prior_recorded_at: prior.recorded_at,
      scope: continuation ? 'Continue only Apply/layout/Reset/reload after exact read-only revalidation of the confirmed native barrier; retain original UI command evidence, never resubmit prior physical commands' : 'Read-only revalidation of completed native load/comparison; no prior browser mutation',
      confirmed_commands_retained: continuation,
      prior_poll_maxima: prior.max_same_endpoint_in_flight,
      poll_gate_scope: 'Fresh browser only; inherited physical receipts do not certify polling in the interrupted prior browser',
      ...(continuation ? { reason: 'Prior pointer click did not issue Apply; diagnostic connection altered viewport. Fresh browser uses configured viewports and React DOM click.' } : {}) };
  } else loaded = await http(`/api/scenarios/${scenario}/load`, { request_id: `p6-load-${randomUUID()}` }, 201);
  samples.session = loaded.session; samples.initial = loaded.execution_view;
  const sid = loaded.session.session_id, prefix = `/api/sessions/${sid}`;
  await checkpoint('IN_PROGRESS'); console.log(JSON.stringify({ stage: 'comparison', scenario, session_id: sid }));
  const submission = prior ? { comparison_id: prior.samples.comparison.comparison_id } : await http(prefix + '/profiles/compare', { request_id: `p6-compare-${randomUUID()}`, expected_revision: revision(loaded.execution_view.basis) }, 202);
  let group; const deadline = Date.now() + 660000;
  do { group = await http(prefix + `/profiles/comparisons/${submission.comparison_id}`); if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(group.status)) break; await delay(5000); } while (Date.now() < deadline);
  assert.equal(group.status, 'COMPLETED'); const job = group.jobs.find(j => j.profile === 'BALANCED'); assert(job?.view?.plan_available && job.view.validation.valid);
  assert.deepEqual(group.input_basis, loaded.execution_view.basis);
  samples.comparison = group;
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, protocolTimeout: 660000, args: ['--no-sandbox', '--disable-gpu', '--no-first-run'] });
  const context = await browser.createBrowserContext(), admin = await context.newPage(), driver = await context.newPage();
  pages.push(admin, driver);
  await admin.setViewport({ width: 1440, height: 1000 }); await driver.setViewport({ width: 390, height: 950 });
  for (const [name, page] of [['Admin', admin], ['Driver', driver]]) {
    page.setDefaultTimeout(660000);
    await page.evaluateOnNewDocument(({ token }) => sessionStorage.setItem('saferoute.member3.bearer', token), { token });
    await page.evaluateOnNewDocument(installFetchProbe, base);
    page.on('pageerror', e => errors.push(e.message)); const active = new Map(), tracked = new Map();
    page.on('request', r => {
      if (!r.url().startsWith(base) || r.method() === 'OPTIONS') return;
      const path = new URL(r.url()).pathname; requests.push({ origin: `${name} browser`, path, method: r.method(), ...(r.method() === 'POST' ? { body: JSON.parse(r.postData()) } : {}) });
      if (r.method() === 'GET') { const key = `${name}:${path}`, count = (active.get(key) ?? 0) + 1; active.set(key, count); tracked.set(r, key); maxInFlight[key] = Math.max(maxInFlight[key] ?? 0, count); }
    });
    const finish = r => { const key = tracked.get(r); if (key) { active.set(key, active.get(key) - 1); tracked.delete(r); } };
    page.on('requestfinished', finish); page.on('requestfailed', finish);
    page.on('response', r => { if (r.url().startsWith(base) && r.request().method() !== 'OPTIONS') responseTasks.push((async () => { responses.push(summarizeResponse({ origin: `${name} browser`, path: new URL(r.url()).pathname, status: r.status(), envelope: await r.json() })); })().catch(() => {})); });
  }
  await admin.evaluateOnNewDocument(({ base, session, comparison }) => {
    localStorage.setItem(`saferoute.member3.session.v1:${base}`, JSON.stringify({ schemaVersion: 1, session, comparison: { id: comparison.comparison_id, inputBasis: comparison.input_basis } }));
    localStorage.setItem('saferoute.phase1.dispatch.v1', 'phase6-old-mock-preserved');
  }, { base, session: loaded.session, comparison: group });
  // Hydrate the three immutable forecasts before opening the second tab. The
  // native SDK serializes bridge access; simultaneous cold hydration can exhaust
  // its bounded read budget. Both tabs stay open; hidden tabs resume on activation.
  await admin.bringToFront();
  await admin.goto(front + '/admin', { waitUntil: 'domcontentloaded' });
  trace('Admin cold hydration');
  if (!continuation) await admin.waitForFunction(enabledSelector, { polling: 1000 }, '[aria-label="Select BALANCED"]');
  else await admin.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Refresh backend' && !b.disabled) && document.querySelector('.admin-page')?.dataset.stale === 'false', { polling: 1000 });
  trace('Driver cold hydration');
  await driver.bringToFront();
  await driver.goto(front + '/driver', { waitUntil: 'domcontentloaded' });
  async function click(page, name) {
    await page.bringToFront();
    await page.waitForFunction(label => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === label); if (!b || b.disabled) return false; b.click(); return true; }, { polling: 1000 }, name);
  }
  async function converge(view) {
    for (const [page, selector] of [[admin, '.admin-page'], [driver, '.drv-page']]) {
      await page.bringToFront();
      await page.waitForFunction(({ selector, basis, time, jid }) => { const e = document.querySelector(selector); if (!e || e.dataset.stale === 'true') return false; const b = JSON.parse(e.dataset.basis ?? 'null'); return b && Object.keys(basis).every(k => basis[k] === b[k]) && e.dataset.currentTime === time && (e.dataset.activeJobId ?? '') === (jid ?? ''); }, { polling: 1000 }, { selector, basis: view.basis, time: view.current_time, jid: view.active_job_id });
    }
  }
  async function driverCommand(name) {
    const path = name === 'Step' ? '/replay/step' : name === 'Play' ? '/replay/start' : name === 'Pause' ? '/replay/playback/pause' : '/replay/reset';
    const reply = driver.waitForResponse(r => r.url().endsWith(path) && r.request().method() === 'POST'); await click(driver, name); const r = await reply; assert.equal(r.status(), 200); return (await r.json()).data;
  }
  async function speed(value) {
    await driver.bringToFront();
    await driver.waitForFunction(enabledSelector, { polling: 1000 }, '[aria-label="Replay speed"]');
    const reply = driver.waitForResponse(r => r.url().endsWith('/replay/speed') && r.request().method() === 'POST'); await driver.select('[aria-label="Replay speed"]', String(value)); const r = await reply; assert.equal(r.status(), 200); return (await r.json()).data;
  }
  let stopped = continuation ? prior.samples.server_stop : undefined;
  if (!continuation) {
  await driver.waitForFunction(() => document.body.textContent.includes('No dispatch plan has been assigned yet.'), { polling: 1000 });
  await driver.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Refresh server' && !b.disabled), { polling: 1000 });
  trace('Select and Accept');
  assert(await driver.$$eval('button', bs => bs.find(b => b.textContent === 'Step').disabled));
  await admin.bringToFront();
  await admin.waitForFunction(enabledSelector, { polling: 1000 }, '[aria-label="Select BALANCED"]'); await admin.click('[aria-label="Select BALANCED"]');
  await admin.waitForFunction(enabledSelector, { polling: 1000 }, '[aria-label="Accept selected plan"]');
  const acceptReply = admin.waitForResponse(r => r.url().endsWith(`/jobs/${job.job_id}/accept`) && r.request().method() === 'POST'); await admin.click('[aria-label="Accept selected plan"]'); assert.equal((await acceptReply).status(), 200);
  const accepted = await http(prefix + '/state'); assert.equal(accepted.active_job_id, job.job_id); assert.deepEqual(accepted.delivered_prefix, loaded.execution_view.delivered_prefix); samples.accepted = accepted; await converge(accepted);
  assertions.push('Actual Admin Select/Accept; Driver accepted-only route and both tabs converge on all nine basis fields, time and job without delivered-on-accept');
  let settled;
  if (scenario === 'S2') {
  trace('Driver Step');
  const stepped = await driverCommand('Step'); samples.driver_step_receipt = stepped.receipt;
  const afterStep = await http(prefix + '/state'); samples.after_step = afterStep; await converge(afterStep); assert(afterStep.observed_metrics); assert.equal(BigInt(afterStep.basis.head_version), BigInt(accepted.basis.head_version) + 1n);
  assertions.push('Actual Driver Step advances server once; Admin observes the same physical world');
  trace('Driver speed Play Pause');
  const pausedSpeed = await speed(4); assert(pausedSpeed.controller.paused); samples.paused_speed = pausedSpeed;
  samples.started = await driverCommand('Play'); samples.pause = await driverCommand('Pause');
  const pauseDeadline = Date.now() + 240000;
  do { settled = await http(prefix + '/replay/playback'); if (settled.fully_paused) break; await delay(1000); } while (Date.now() < pauseDeadline);
  assert(settled.fully_paused && !settled.in_flight && settled.paused); samples.pause_settled = settled; await converge(settled.execution_view);
  assertions.push('Speed while paused does not resume; actual Play/Pause use server controller, wait fully_paused and never claim immediate freeze');
  } else {
    settled = await http(prefix + '/replay/playback');
    assert(settled.fully_paused && !settled.in_flight);
    assertions.push('S0 focuses on final-return autoplay and Reset; Step/Pause/paused-speed controls are exercised in S2');
  }
  trace('Server barrier or final return');
  let target;
  if (scenario === 'S2') {
    const events = await http(prefix + '/events'); assert.equal(events.events.length, 1); samples.event = events.events[0];
    target = new Date(Date.parse(samples.event.timestamp) - 60000 + 7 * 3600000).toISOString().replace('Z', '+07:00');
  } else {
    const catalog = await http('/api/scenarios'), start = Date.parse(catalog.scenarios.find(s => s.scenario_id === scenario).initial_time);
    const endUs = settled.execution_view.accepted_trajectory.vehicle_routes.map(r => BigInt(r.return_us)).reduce((a, b) => a > b ? a : b, 0n);
    const end = start + Number(endUs / 1000n); samples.final_return_oracle = { initial_time: new Date(start).toISOString(), return_us: endUs.toString(), source: 'public accepted trajectory; harness prerequisite only' };
    const clock = new Date(end - 60000 + 7 * 3600000).toISOString().replace('Z', '+07:00'); target = clock;
    samples.expected_final_time = new Date(end + 7 * 3600000).toISOString().replace('Z', '+07:00');
  }
  const beforeTarget = await http(prefix + '/state');
  assert(Date.parse(target) >= Date.parse(beforeTarget.current_time));
  samples.near_stop_prerequisite = await http(prefix + '/replay/step', { request_id: `p6-near-stop-${randomUUID()}`, expected_revision: revision(beforeTarget.basis), target_time: target });
  await converge(samples.near_stop_prerequisite.execution_view);
  await speed(8); await driverCommand('Play');
  const stopDeadline = Date.now() + 360000;
  do { stopped = await http(prefix + '/replay/playback'); if (stopped.fully_paused && ['EVENT_BARRIER', 'PLAN_COMPLETE'].includes(stopped.reason)) break; await delay(1000); } while (Date.now() < stopDeadline);
  assert(stopped.fully_paused && !stopped.in_flight); assert.equal(stopped.reason, scenario === 'S2' ? 'EVENT_BARRIER' : 'PLAN_COMPLETE'); samples.server_stop = stopped; await converge(stopped.execution_view);
  } else {
    await driver.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Refresh server' && !b.disabled), { polling: 1000 });
    const controller = await http(prefix + '/replay/playback');
    assert(controller.fully_paused && !controller.in_flight && controller.reason === 'EVENT_BARRIER');
    assert.deepEqual(controller.execution_view, stopped.execution_view); await converge(controller.execution_view);
    assertions.push('Native continuation preserves confirmed original UI commands; exact server barrier revalidated read-only before remaining gates');
  }
  if (scenario === 'S2') {
    assert.equal(stopped.execution_view.current_time, samples.event.timestamp);
    await admin.bringToFront();
    await admin.waitForFunction(enabledSelector, { polling: 1000 }, `button[data-event-id="${samples.event.event_id}"]`);
    assert(await driver.$$eval('button', bs => bs.find(b => b.textContent === 'Play').disabled));
    trace('Admin Apply');
    const reply = admin.waitForResponse(r => r.url().endsWith(`/events/${samples.event.event_id}/apply`) && r.request().method() === 'POST');
    // Check and click in one browser task: tab activation can disable the node
    // between a separate enabled wait and a later click.
    await admin.waitForFunction(selector => { const b = document.querySelector(selector); if (!b || b.disabled) return false; b.click(); return true; }, { polling: 1000 }, `button[data-event-id="${samples.event.event_id}"]`);
    assert.equal((await reply).status(), 200);
    const afterApply = await http(prefix + '/state'); samples.after_apply = afterApply; await converge(afterApply); assert.equal(afterApply.active_job_id, null); assert.deepEqual(afterApply.delivered_prefix, stopped.execution_view.delivered_prefix);
    assert.deepEqual(afterApply.vehicles.map(v => [v.position, v.current_load_kg, v.onboard_order_ids]), stopped.execution_view.vehicles.map(v => [v.position, v.current_load_kg, v.onboard_order_ids]));
    assertions.push('Server autoplay stops at exact event barrier; requires Admin Apply, preserves prefix/custody and Driver sees suspended suffix');
  } else {
    assert.equal(Date.parse(stopped.execution_view.current_time), Date.parse(samples.expected_final_time)); assertions.push('Server autoplay stops at public final return, not a browser timer or inferred local completion');
  }
  for (const width of [360, 390, 430]) {
    await driver.setViewport({ width, height: 950 });
    const layout = await driver.evaluate(() => ({ viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth, buttons: [...document.querySelectorAll('[aria-label="Simulated replay controls"] button, [aria-label="Replay speed"]')].map(e => { const r = e.getBoundingClientRect(); return { label: e.textContent, left: r.left, right: r.right }; }) }));
    assert(layout.scrollWidth <= width); assert(layout.buttons.every(b => b.left >= 0 && b.right <= width)); layouts.push(layout);
    await driver.screenshot({ path: out(`phase6-${scenario}-driver-${width}.png`).pathname.replace(/^\//, ''), fullPage: true });
  }
  trace('Reset and cross-tab convergence');
  const beforeReset = await http(prefix + '/state'), reset = await driverCommand('Reset session'); samples.reset_receipt = reset.receipt; assert.notEqual(reset.session.session_id, sid);
  await converge(reset.execution_view); const resetState = await http(`/api/sessions/${reset.session.session_id}/state`); assert.deepEqual(resetState, reset.execution_view); samples.reset_state = resetState;
  const sourceState = await http(prefix + '/state'); assert.deepEqual(sourceState, beforeReset); samples.source_after_reset = sourceState;
  const pointer = await driver.evaluate(base => JSON.parse(localStorage.getItem(`saferoute.member3.session.v1:${base}`)), base);
  assert.equal(pointer.session.session_id, reset.session.session_id); assert.deepEqual(Object.keys(pointer).sort(), ['schemaVersion', 'session']);
  assert.equal(await driver.evaluate(() => localStorage.getItem('saferoute.phase1.dispatch.v1')), 'phase6-old-mock-preserved'); samples.reset_pointer = pointer;
  const capture = async label => { for (const [name, page] of [['Admin', admin], ['Driver', driver]]) { const probe = await page.evaluate(() => window.__phase6FetchProbe); assert(Object.values(probe.maxima).every(n => n === 1)); pollingGate.captures.push({ label, tab: name, ...probe }); } };
  await capture('before Driver reload');
  const reloadStart = requests.length; await driver.reload({ waitUntil: 'domcontentloaded' }); await converge(resetState);
  assert.equal(requests.slice(reloadStart).filter(r => r.origin === 'Driver browser' && r.method === 'POST').length, 0);
  assertions.push('Actual Driver Reset creates new session, both tabs follow pointer through fresh GET; old world/history retained, UI pointers clear and reload has no POST');
  await capture('after Driver reload'); pollingGate.status = 'PASS';
  assert(!requests.some(r => /pickup|deliver|advanceDemoClock/.test(r.path))); assert.deepEqual(errors, []);
  assertions.push('No local physical endpoints, no uncancelled same-endpoint overlapping GET per tab, old Mock key preserved; Driver 360/390/430 no overflow');
  await checkpoint('PASS'); console.log(JSON.stringify({ status: 'PASS', scenario, session_id: sid, reset_session_id: reset.session.session_id, assertions: assertions.length }));
} catch (error) {
  const diagnostics = await Promise.all(pages.map(page => page.evaluate(() => ({ path: location.pathname,
    text: document.body.innerText, buttons: [...document.querySelectorAll('button')].map(b => ({ label: b.textContent.trim(), disabled: b.disabled })) })).catch(() => null)));
  await checkpoint('FAIL', { failure: String(error), failed_stage: stage, diagnostics }); throw error;
}
finally { await browser?.close(); }
