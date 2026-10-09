// Real transport faults and public M3 rejections; no synthetic HTTP envelopes.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, access as fileAccess } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { summarizeResponse } from './phase4-evidence.mjs';
import { isHeldStateResponse } from './phase7-evidence.mjs';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, label, duration = 660000) {
  const deadline = Date.now() + duration;
  while (Date.now() < deadline) { if (await predicate()) return; await wait(500); }
  throw new Error(`Timed out: ${label}`);
}

export async function runFailureMatrix({ browser, report, base, front, token, access }) {
  assert(report.native && report.cases.length === 5 && report.cases.every(c => c.status === 'PASS'));
  const rows = report.failure_matrix = [];
  const record = (branch, evidence, scope) => {rows.push({ branch, native: true, status: 'PASS', evidence, scope });console.log(JSON.stringify({stage:report.stage,step:'native failure branch PASS',branch,at:new Date().toISOString()}));};
  const first = report.cases.find(c => c.scenario === 'S0'), second = report.cases.find(c => c.scenario === 'S1');
  const prefix = `/api/sessions/${first.session.session_id}`;
  const revision = b => ({ head_version: b.head_version, generation: b.generation });
  async function http(path, body, expected = 200, bearer = token) {
    const response = await fetch(base + path, { method: body ? 'POST' : 'GET',
      headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(240000) });
    const envelope = await response.json();
    report.requests.push({ origin: 'Native failure prerequisite/assertion', path, method: body ? 'POST' : 'GET', ...(body ? { body } : {}) });
    const proof = summarizeResponse({ path, status: response.status, envelope }); report.responses.push(proof);
    assert.equal(response.status, expected, `${path}: ${JSON.stringify(envelope.diagnostics)}`);
    return { data: envelope.data, envelope, proof };
  }
  const unauthorized = await http(prefix + '/state', undefined, 401, null);
  record('401', [unauthorized.proof], 'Real unauthenticated request');
  const foreign = access.credentials.find(c => c.actor_id !== 'member4'); assert(foreign);
  const forbidden = await http(prefix + '/state', undefined, 403, foreign.token);
  record('403', [forbidden.proof], 'Real other actor; owner isolation');
  const invalid = await http(prefix + '/replay/step', { request_id: `p7-invalid-${randomUUID()}`,
    expected_revision: { head_version: '1e0', generation: '0' } }, 422);
  const foreignJob = second.comparisons[0].group.jobs[0].job_id;
  const wrongBinding = await http(prefix + `/jobs/${foreignJob}/accept`, { request_id: `p7-binding-${randomUUID()}`,
    expected_revision: revision(first.final.basis) }, 404);
  record('invalid_schema_binding', [invalid.proof, wrongBinding.proof], 'Real wire-schema and job/session request rejection. Malformed response envelopes are separately unit-tested; no malformed server response is fabricated.');
  const stale = await http(prefix + `/jobs/${first.comparisons[0].group.jobs[0].job_id}/accept`, {
    request_id: `p7-stale-${randomUUID()}`, expected_revision: revision(first.initial.basis) }, 409);
  assert(stale.envelope.diagnostics.some(d => d.code === 'STALE_HEAD'));
  record('stale_accept', [stale.proof], 'Real stale CAS rejected');
  const lost = report.failures.find(f => f.branch === 'ambiguous command retry' && f.native && f.status === 'PASS');
  assert(lost, 'Actual lost S2 response/retry proof required'); record('ambiguous_retry', [lost], lost.scope);
  assert.equal(first.initial.accepted_trajectory, null);
  assert.equal(first.initial.projected_whole_metrics, null);
  record('missing_geometry_null_metrics', [{ scenario: 'S0', sample: 'initial', basis: first.initial.basis,
    accepted_trajectory: null, projected_whole_metrics: null }], 'Actual unaccepted native world; Driver initial no-route assertion from case receipt. No fallback geometry or invented metrics.');

  const context = await browser.createBrowserContext(), page = await context.newPage();
  const browserPosts = [], browserReplies = [], tasks = [];
  await page.setViewport({ width: 1440, height: 1000 }); page.setDefaultTimeout(660000);
  await page.evaluateOnNewDocument(({ token, base, session }) => {
    sessionStorage.setItem('saferoute.member3.bearer', token);
    localStorage.setItem(`saferoute.member3.session.v1:${base}`, JSON.stringify({ schemaVersion: 1, session }));
  }, { token, base, session: first.session });
  page.on('pageerror', error => report.page_errors.push(error.message));
  page.on('request', request => {
    if(request.url().startsWith(front)){report.frontend_requests??=[];report.frontend_requests.push({scenario:'failure_matrix',tab:'Admin',path:new URL(request.url()).pathname,type:request.resourceType()});}
    if (request.url().startsWith(base) && request.method() === 'POST') browserPosts.push({ path: new URL(request.url()).pathname, body: JSON.parse(request.postData()) });
  });
  page.on('response', response => {
    if (response.url().startsWith(base) && response.request().method() !== 'OPTIONS') tasks.push((async () => {
      const proof = summarizeResponse({ origin: 'Native failure browser', path: new URL(response.url()).pathname,
        status: response.status(), envelope: await response.json() }); browserReplies.push(proof); report.responses.push(proof);
    })().catch(() => {}));
  });
  async function click(label) {
    await page.bringToFront(); await page.waitForFunction(label => {
      const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === label || b.getAttribute('aria-label') === label);
      if (!button || button.disabled) return false; button.click(); return true;
    }, { polling: 500 }, label);
  }
  async function fresh(view) {
    await page.waitForFunction(({ basis, time, job }) => { const main = document.querySelector('main');
      const actual = JSON.parse(main?.dataset.basis ?? 'null'); return actual && main.dataset.stale === 'false' &&
        Object.keys(basis).every(k => actual[k] === basis[k]) && main.dataset.currentTime === time && (main.dataset.activeJobId || null) === job;
    }, { polling: 1000 }, { basis: view.basis, time: view.current_time, job: view.active_job_id });
  }
  let operator, control, cdp;
  try {
    await page.goto(front + '/admin', { waitUntil: 'domcontentloaded' }); await fresh(first.final);
    await page.setOfflineMode(true); await click('Refresh backend');
    await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent.includes('NETWORK_ERROR'));
    assert(await page.$eval('main', main => main.dataset.stale === 'true'));
    record('unavailable', [{ transport: 'Browser offline mode', stale: true }], 'Real failed API transport; cached data stays stale and no mock fallback. SDK-unavailable readiness is also captured below.');
    await page.setOfflineMode(false); await click('Refresh backend'); await fresh(first.final);

    // Pause an actual completed response at CDP; never replace its headers/body.
    cdp = await page.createCDPSession(); let held;
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: base + prefix + '/state', requestStage: 'Response' }] });
    cdp.on('Fetch.requestPaused', event => { if (!held && isHeldStateResponse(event,base+prefix+'/state')) held = event; else void cdp.send('Fetch.continueRequest', { requestId: event.requestId }); });
    await click('Refresh backend'); await until(() => Boolean(held), 'real old-session response');
    const actualBody = await cdp.send('Fetch.getResponseBody', { requestId: held.requestId });
    const bytes = actualBody.base64Encoded ? Buffer.from(actualBody.body, 'base64') : Buffer.from(actualBody.body);
    assert.equal(JSON.parse(bytes).data.basis.session_id, first.session.session_id);
    await page.evaluate(({ base, session }) => { const key = `saferoute.member3.session.v1:${base}`;
      const oldValue = localStorage.getItem(key), newValue = JSON.stringify({ schemaVersion: 1, session });
      localStorage.setItem(key, newValue); window.dispatchEvent(new StorageEvent('storage', { key, oldValue, newValue, storageArea: localStorage }));
    }, { base, session: second.session });
    await cdp.send('Fetch.continueRequest', { requestId: held.requestId }); await cdp.send('Fetch.disable'); await cdp.detach(); cdp = undefined;
    await fresh(second.final);
    record('late_session_response', [{ old_session: first.session.session_id, new_session: second.session.session_id,
      original_response_sha256: createHash('sha256').update(bytes).digest('hex'), final_basis: second.final.basis }],
    'Actual server response delayed unchanged; metadata-only pointer notification switches owner session, late old response cannot restore the old world.');

    // Induce real SDK contention through M3's own OS lock, with bounded release.
    assert(process.env.M3_OPERATOR_PYTHON && process.env.M3_SOURCE_ROOT && process.env.M3_INSTALLATION_CONFIG,
      'Set native operator Python/source/config paths for actual bounded SDK contention');
    control = await mkdtemp(join(tmpdir(), 'saferoute-m4-phase7-lock-'));
    let armed = true;
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (armed && request.method() === 'POST' && request.url().endsWith('/profiles/compare')) {
        armed = false;
        operator = spawn(process.env.M3_OPERATOR_PYTHON, ['-B', fileURLToPath(new URL('./hold-native-sdk-access.py', import.meta.url)),
          '--source-root', process.env.M3_SOURCE_ROOT, '--installation-config', process.env.M3_INSTALLATION_CONFIG,
          '--control-dir', control, '--expected-build', report.build_sha256], { cwd: process.env.M3_SOURCE_ROOT, windowsHide: true, stdio: 'ignore' });
        void until(async () => { try { await fileAccess(join(control, 'ready.json')); return true; } catch { assert(operator.exitCode === null, 'SDK lock operator exited'); return false; } }, 'SDK contention acquired', 95000)
          .then(() => request.continue()).catch(error => { report.operator_failure = String(error); void request.abort('failed'); });
      } else void request.continue();
    });
    const start = browserPosts.length; await click('Optimize');
    await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent.includes('RUNTIME_BUSY'));
    const retried = browserPosts.slice(start).filter(p => p.path.endsWith('/profiles/compare'));
    assert.equal(retried.length, 4); assert(retried.every(p => JSON.stringify(p.body) === JSON.stringify(retried[0].body)));
    const busyReady = await http('/ready', undefined, 503);
    record('busy_retry_bound', [{ attempts: retried, replies: browserReplies.filter(r => r.path.endsWith('/profiles/compare') && r.status === 503) }], 'Four actual frontend POST attempts with unchanged durable request ID/body under bounded real SDK contention.');
    rows.find(r => r.branch === 'unavailable').evidence.push(busyReady.proof);
    await writeFile(join(control, 'stop.request'), '');
    await until(() => operator.exitCode !== null, 'SDK contention released', 10000); assert.equal(operator.exitCode, 0); operator = undefined;
    await click('Refresh backend');
    await page.waitForFunction(() => ['QUEUED', 'RUNNING'].includes(document.querySelector('main')?.dataset.comparisonStatus));
    await click('Cancel comparison');
    await page.waitForFunction(() => document.querySelector('main')?.dataset.comparisonStatus === 'CANCELLED');
    const unchanged = (await http(`/api/sessions/${second.session.session_id}/state`)).data;
    assert.deepEqual(unchanged, second.final);
    // A real read deadline abort is distinct from cancelling an optimization job.
    const timeout = await page.evaluate(async ({ base, sid }) => { const controller = new AbortController();
      const started = performance.now(); setTimeout(() => controller.abort(new DOMException('Native read deadline', 'TimeoutError')), 1);
      try { await fetch(`${base}/api/sessions/${sid}/state`, { headers: { Authorization: `Bearer ${sessionStorage.getItem('saferoute.member3.bearer')}` }, signal: controller.signal }); return { aborted: false }; }
      catch { return { aborted: controller.signal.aborted, elapsed_ms: performance.now() - started }; }
    }, { base, sid: second.session.session_id });
    assert(timeout.aborted);
    record('cancel_timeout', [{ cancellation: browserPosts.filter(p => p.path.endsWith('/cancel')), timeout, unchanged_basis: unchanged.basis }],
    'Actual UI comparison cancellation; separate real fetch deadline abort never claims server cancellation or local physics.');
    await Promise.allSettled(tasks); report.requests.push(...browserPosts.map(p => ({ origin: 'Native failure browser', method: 'POST', ...p })));
    assert.deepEqual(report.page_errors, []);
  } finally {
    if (control) await writeFile(join(control, 'stop.request'), '');
    if (operator) await until(() => operator.exitCode !== null, 'owned contention operator stopped', 10000);
    await cdp?.detach().catch(() => {}); await context.close();
  }
  return rows;
}
