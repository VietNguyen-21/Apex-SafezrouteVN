// Continue confirmed S2 Reset evidence after a post-receipt observation failure.
// This creates one ADDITIONAL intentional Reset on the already-created session;
// it never replays the acknowledged original command.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import puppeteer from 'puppeteer-core';
import { summarizeResponse } from './phase4-evidence.mjs';
import { installFetchProbe } from './phase6-evidence.mjs';
assert(process.env.M3_ACCESS_FILE && process.env.M3_PHASE6_RESET_REPORT);
const bytes = await readFile(process.env.M3_PHASE6_RESET_REPORT);
const prior = JSON.parse(bytes), access = JSON.parse(await readFile(process.env.M3_ACCESS_FILE, 'utf8'));
const token = access.credentials.find(c => c.actor_id === 'member4')?.token;
assert(token && prior.native && prior.status === 'FAIL' && prior.scenario === 'S2');
assert(prior.samples.after_apply && prior.samples.reset_receipt && prior.samples.reset_state);
assert.deepEqual(prior.page_errors, []);
const base = process.env.M3_BASE_URL ?? 'http://127.0.0.1:8004', front = process.env.M3_FRONTEND_URL ?? 'http://127.0.0.1:5174';
const report = { ...prior, status: 'IN_PROGRESS', failure: undefined, failed_stage: undefined, diagnostics: undefined,
  reset_continuation: { started_at: new Date().toISOString(), prior_failure: prior.failure, prior_sha256: createHash('sha256').update(bytes).digest('hex'),
    scope: 'Original playback/Apply and original Reset receipts retained; verify source world unchanged, then exercise an additional intentional Reset from its already-created session using final source. Polling proof covers this fresh browser only.',
    prior_poll_maxima: prior.max_same_endpoint_in_flight, original_reset_receipt: prior.samples.reset_receipt, original_reset_state: prior.samples.reset_state },
  max_same_endpoint_in_flight: {}, polling_gate: { status: 'IN_PROGRESS', measure: 'Uncancelled GET fetches, excluding requests whose AbortSignal has fired; raw Chrome transport maxima retained separately', scope: 'Fresh reset-continuation browser, including both tabs, intentional Reset and Driver reload', captures: [] } };
async function save(status) { report.status = status; report.recorded_at = new Date().toISOString(); const text = JSON.stringify(report, null, 2); assert(!text.includes(token)); await writeFile(new URL('phase6-native-S2.json', import.meta.url), text); }
async function http(path) {
  const r = await fetch(base + path, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(240000) });
  const envelope = await r.json(); report.requests.push({ origin: 'HTTP reset continuation assertion', path, method: 'GET' });
  report.responses.push(summarizeResponse({ path, status: r.status, envelope })); assert.equal(r.status, 200); return envelope.data;
}
let browser, stage = 'read-only Reset revalidation';
const trace = name => { stage = name; console.log(JSON.stringify({ stage, scenario: 'S2', at: new Date().toISOString() })); };
try {
  assert.equal((await http('/api/runtime/capabilities')).build_sha256, prior.build_sha256);
  const original = `/api/sessions/${prior.samples.session.session_id}`;
  report.samples.source_after_original_reset = await http(original + '/state');
  assert.deepEqual(report.samples.source_after_original_reset, prior.samples.after_apply);
  const source = prior.samples.reset_state, sid = source.basis.session_id, prefix = `/api/sessions/${sid}`;
  assert.deepEqual(await http(prefix + '/state'), source);
  const session = await http(prefix), controller = await http(prefix + '/replay/playback');
  assert(controller.fully_paused && !controller.in_flight);
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, protocolTimeout: 660000, args: ['--no-sandbox', '--disable-gpu', '--no-first-run'] });
  const context = await browser.createBrowserContext(), admin = await context.newPage(), driver = await context.newPage(), responseTasks = [];
  for (const [name, page, width] of [['Admin', admin, 1440], ['Driver', driver, 390]]) {
    await page.setViewport({ width, height: 950 }); page.setDefaultTimeout(660000);
    await page.evaluateOnNewDocument(({ token }) => sessionStorage.setItem('saferoute.member3.bearer', token), { token });
    await page.evaluateOnNewDocument(installFetchProbe, base);
    page.on('pageerror', e => report.page_errors.push(e.message));
    const tracked = new Map(), active = new Map();
    page.on('request', r => {
      if (!r.url().startsWith(base) || r.method() === 'OPTIONS') return;
      const path = new URL(r.url()).pathname; report.requests.push({ origin: `${name} reset-continuation browser`, path, method: r.method(), ...(r.method() === 'POST' ? { body: JSON.parse(r.postData()) } : {}) });
      if (r.method() === 'GET') { const key = `${name}:${path}`; active.set(key, (active.get(key) ?? 0) + 1); tracked.set(r, key); report.max_same_endpoint_in_flight[key] = Math.max(report.max_same_endpoint_in_flight[key] ?? 0, active.get(key)); }
    });
    const finish = r => { const key = tracked.get(r); if (key) { active.set(key, active.get(key) - 1); tracked.delete(r); } };
    page.on('requestfinished', finish); page.on('requestfailed', finish);
    page.on('response', r => { if (r.url().startsWith(base) && r.request().method() !== 'OPTIONS') responseTasks.push((async () => report.responses.push(summarizeResponse({ origin: `${name} reset-continuation browser`, path: new URL(r.url()).pathname, status: r.status(), envelope: await r.json() })))().catch(() => {})); });
  }
  await admin.evaluateOnNewDocument(({ base, session }) => { localStorage.setItem(`saferoute.member3.session.v1:${base}`, JSON.stringify({ schemaVersion: 1, session })); localStorage.setItem('saferoute.phase1.dispatch.v1', 'phase6-old-mock-preserved'); }, { base, session });
  async function converge(view) {
    for (const page of [admin, driver]) {
      await page.bringToFront();
      await page.waitForFunction(({ basis, time, job }) => { const e = document.querySelector('main'); const b = JSON.parse(e?.dataset.basis ?? 'null'); return e?.dataset.stale === 'false' && b && Object.keys(basis).every(k => b[k] === basis[k]) && e.dataset.currentTime === time && (e.dataset.activeJobId || null) === job; }, { polling: 1000 }, { basis: view.basis, time: view.current_time, job: view.active_job_id });
    }
  }
  trace('Fresh Admin and Driver on confirmed Reset destination');
  await admin.bringToFront(); await admin.goto(front + '/admin', { waitUntil: 'domcontentloaded' });
  await admin.waitForFunction(() => document.querySelector('main')?.dataset.stale === 'false', { polling: 1000 });
  await driver.bringToFront(); await driver.goto(front + '/driver', { waitUntil: 'domcontentloaded' }); await converge(source);
  trace('Additional intentional Reset using final source');
  await driver.bringToFront();
  const reply = driver.waitForResponse(r => r.url().endsWith('/replay/reset') && r.request().method() === 'POST');
  await driver.waitForFunction(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Reset session'); if (!b || b.disabled) return false; b.click(); return true; }, { polling: 1000 });
  const response = await reply; assert.equal(response.status(), 200); const reset = (await response.json()).data;
  assert.notEqual(reset.session.session_id, sid); report.samples.reset_receipt = reset.receipt;
  await converge(reset.execution_view); const destination = await http(`/api/sessions/${reset.session.session_id}/state`); assert.deepEqual(destination, reset.execution_view); report.samples.reset_state = destination;
  assert.deepEqual(await http(prefix + '/state'), source); report.samples.additional_reset_source_retained = source;
  assert.deepEqual(await http(original + '/state'), prior.samples.after_apply); report.samples.source_after_reset = prior.samples.after_apply;
  const pointer = await driver.evaluate(base => JSON.parse(localStorage.getItem(`saferoute.member3.session.v1:${base}`)), base);
  assert.equal(pointer.session.session_id, reset.session.session_id); assert.deepEqual(Object.keys(pointer).sort(), ['schemaVersion', 'session']); report.samples.reset_pointer = pointer;
  const capture = async label => { for (const [name, page] of [['Admin', admin], ['Driver', driver]]) { const probe = await page.evaluate(() => window.__phase6FetchProbe); assert(Object.values(probe.maxima).every(n => n === 1)); report.polling_gate.captures.push({ label, tab: name, ...probe }); } };
  await capture('before Driver reload'); const reloadStart = report.requests.length;
  trace('GET-only Driver reload and final convergence');
  await driver.reload({ waitUntil: 'domcontentloaded' }); await converge(destination);
  assert.equal(report.requests.slice(reloadStart).filter(r => r.origin.endsWith('reset-continuation browser') && r.method === 'POST').length, 0);
  assert.equal(await driver.evaluate(() => localStorage.getItem('saferoute.phase1.dispatch.v1')), 'phase6-old-mock-preserved');
  await capture('after Driver reload'); await Promise.allSettled(responseTasks);
  assert.equal(report.requests.filter(r => r.origin.endsWith('reset-continuation browser') && r.method === 'POST').length, 1);
  assert(!report.requests.some(r => /pickup|deliver|advanceDemoClock/.test(r.path)));
  assert.deepEqual(report.page_errors, []); report.polling_gate.status = 'PASS';
  report.assertions.push('Final-source additional intentional Reset creates a new session; both tabs converge, both source worlds preserved, metadata pointer clears and Driver reload sends zero POSTs', 'Fresh Reset-continuation browser has no overlapping uncancelled same-endpoint GET; aborted transport requests are measured separately');
  await save('PASS'); console.log(JSON.stringify({ scenario: 'S2', status: 'PASS', final_reset_session: reset.session.session_id }));
} catch (error) { report.failure = String(error); report.failed_stage = stage; await save('FAIL'); throw error; }
finally { await browser?.close(); }
