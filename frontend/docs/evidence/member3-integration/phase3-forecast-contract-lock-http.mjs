// Native extension gate. Explicit Accept/replay is a separate scope test after read-only preview proof.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

assert(process.env.M3_ACCESS_FILE, 'Private credential file required');
const access = JSON.parse(await readFile(process.env.M3_ACCESS_FILE, 'utf8'));
const token = access.credentials.find(c => c.actor_id === 'member4')?.token;
const other = access.credentials.find(c => c.actor_id === 'forecast-reviewer')?.token;
assert(token && other);
const base = process.env.M3_BASE_URL ?? 'http://127.0.0.1:8004';
const responses = [];
async function request(path, body, bearer = token, expected = 200) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(base + path, { method: body ? 'POST' : 'GET',
      headers: { Accept: 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body && JSON.stringify(body), signal: AbortSignal.timeout(125000) });
    const envelope = await response.json();
    const error = envelope.diagnostics?.[0]?.code;
    if (expected < 400 && response.status === 503 && ['RUNTIME_BUSY', 'RUNTIME_TIMEOUT'].includes(error) && attempt < 3) {
      await new Promise(r => setTimeout(r, 1000 * 2 ** attempt)); continue;
    }
    assert.equal(response.status, expected, `${path}: ${response.status} ${error ?? ''}`);
    responses.push({ path, method: body ? 'POST' : 'GET', httpStatus: response.status, envelope });
    return envelope;
  }
}
const ready = await request('/ready', undefined, null);
assert(ready.data.ready && ready.data.checks.worker === 'PASS');
const loaded = await request('/api/scenarios/S1/load', { request_id: randomUUID() }, token, 201);
const session = loaded.data.session;
assert.equal(session.build_sha256, 'd99f034a897b5c41f5b1c53efe32e57f62607072b237e858a6e1e3e11e68d756');
const prefix = `/api/sessions/${session.session_id}`;
const initial = (await request(prefix + '/state')).data;
assert.equal(initial.active_job_id, null);
assert.equal(initial.order_ids.length, 8); assert.equal(initial.vehicles.length, 2);
const revision = v => ({ head_version: v.basis.head_version, generation: v.basis.generation });
const submission = (await request(prefix + '/profiles/compare', { request_id: randomUUID(), expected_revision: revision(initial) }, token, 202)).data;
let comparison;
const deadline = Date.now() + 600000;
while (Date.now() < deadline) {
  comparison = (await request(prefix + `/profiles/comparisons/${submission.comparison_id}`)).data;
  console.log(JSON.stringify({ stage: 'native-comparison', status: comparison.status, children: comparison.jobs.map(j => ({ profile: j.profile, status: j.view?.job_status ?? null })) }));
  if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(comparison.status)) break;
  await new Promise(r => setTimeout(r, 5000));
}
assert.equal(comparison.status, 'COMPLETED');
assert.equal(comparison.outcome.comparison?.status, 'COMPARABLE');
const before = (await request(prefix + '/state')).data;
assert.deepEqual(before, initial, 'Compute cannot change physical world');
const forecasts = [];
for (const row of comparison.jobs) {
  assert(row.view.plan_available && row.view.validation.valid === true);
  const forecast = (await request(prefix + `/jobs/${row.job_id}/forecast`)).data;
  assert.equal(forecast.schema_version, 'task02-m2-job-forecast/1');
  assert.deepEqual(forecast.input_basis, before.basis);
  assert.equal(forecast.profile, row.profile); assert.equal(forecast.job_id, row.job_id);
  assert.equal(forecast.build_sha256, before.basis.build_sha256);
  assert.equal(forecast.metric_scope, 'FORECAST_ONLY'); assert(forecast.trajectory);
  assert.deepEqual(forecast.metrics, comparison.outcome.comparison.jobs.find(j => j.job_id === row.job_id).metrics);
  forecasts.push(forecast);
}
await request(prefix + `/jobs/${comparison.jobs[0].job_id}/forecast`, undefined, null, 401);
await request(prefix + `/jobs/${comparison.jobs[0].job_id}/forecast`, undefined, other, 403);
await request(prefix + '/jobs/job-unknown/forecast', undefined, token, 404);
const after = (await request(prefix + '/state')).data;
assert.deepEqual(after, before, 'Forecast reads cannot change head/generation/orders/custody/active_job');
const previewReceipt = { status: 'M3_FORECAST_HTTP_NATIVE_PASS', recordedAt: new Date().toISOString(),
  phase3Complete: false, session, ready, comparison, forecasts, before, after,
  previewReadOnly: true, explicitAcceptDuringPreview: false, responses: [...responses],
  assertions: ['S1 native 8 orders/2 vehicles', 'three certified current forecasts', 'same full basis/build/profile/job',
    'native metrics equal comparison', 'world exactly unchanged after compute and forecast reads', '401/403/404'],
  limitations: ['Browser/map and non-null accepted/replay scopes gate not yet run'] };
await writeFile(new URL('./phase3-forecast-contract-lock-http-native.json', import.meta.url), JSON.stringify(previewReceipt, null, 2));
console.log(JSON.stringify({ status: previewReceipt.status, sessionId: session.session_id }));

// Separate explicit native scope test. This is not part of forecast retrieval or frontend implicit Accept.
const selected = comparison.jobs.find(j => j.profile === 'BALANCED');
const accepted = (await request(prefix + `/jobs/${selected.job_id}/accept`, { request_id: randomUUID(), expected_revision: revision(after) })).data;
const acceptedView = (await request(prefix + '/state')).data;
assert.equal(acceptedView.active_job_id, selected.job_id);
assert(acceptedView.accepted_trajectory && acceptedView.planned_suffix_metrics && acceptedView.projected_whole_metrics);
const stepped = (await request(prefix + '/replay/step', { request_id: randomUUID(), expected_revision: revision(acceptedView) })).data;
const replayView = (await request(prefix + '/state')).data;
assert(replayView.observed_metrics && replayView.planned_suffix_metrics && replayView.projected_whole_metrics);
assert.equal(replayView.metric_scope, 'OBSERVED_PREFIX_ONLY');
const receipt = { status: 'M3_FORECAST_AND_EXPLICIT_SCOPES_HTTP_NATIVE_PASS', recordedAt: new Date().toISOString(),
  session, comparisonId: comparison.comparison_id, previewProof: { before, after, unchanged: true },
  accepted, acceptedView, stepped, replayView, responses,
  explicitAcceptanceScopeTest: true, implicitAcceptForForecast: false,
  limitations: ['Accept/replay performed explicitly by acceptance harness; frontend operational controls remain future phases', 'Browser/map/scope rendering gate must be recorded separately'] };
await writeFile(new URL('./phase3-forecast-contract-lock-scopes-native.json', import.meta.url), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ status: receipt.status, sessionId: session.session_id }));
