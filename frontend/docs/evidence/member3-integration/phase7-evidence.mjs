import assert from 'node:assert/strict';
export const requiredFailureBranches = ['401', '403', 'unavailable', 'invalid_schema_binding', 'busy_retry_bound', 'stale_accept', 'ambiguous_retry', 'cancel_timeout', 'missing_geometry_null_metrics', 'late_session_response'];
export function isHeldStateResponse(event,url){return event.responseStatusCode===200&&event.request?.method==='GET'&&event.request.url===url;}
export function adminRouteRequired(trajectory) {
  if (!trajectory) return true;
  const routes=trajectory.vehicle_routes;
  assert(Array.isArray(routes)&&routes.every(r=>Array.isArray(r.actions)), 'Invalid Admin route witness');
  return routes.some(r=>r.actions.some((a,i)=>a.kind==='EDGE'&&r.actions.slice(i+1).some(a=>a.kind==='SERVICE')));
}
export function pendingS4ContinuationWorld(c) {
  assert(c.scenario==='S4'&&c.accepted&&c.applied&&!c.reaccepted&&!c.expiry&&c.comparisons?.length===2, 'Only S4 interrupted before re-Accept can continue pending actions');
  const world=c.applied.execution_view;
  assert(world?.basis?.session_id===c.session.session_id&&Object.keys(world.basis).length===9, 'Continuation world binding mismatch');
  assert.deepEqual(c.comparisons[1].group.input_basis,world.basis,'Pending comparison basis mismatch');
  assert.equal(c.comparisons[1].group.status,'COMPLETED');
  assert.equal(c.comparisons[1].forecasts.length,3);
  return world;
}
export function readOnlyContinuationWorld(c) {
  assert(['S3', 'S4'].includes(c.scenario) && c.accepted && c.applied && c.reaccepted && c.comparisons?.length === 2, 'Only a fully committed event case can continue read-only');
  if (c.scenario === 'S4') assert(c.expiry?.reply?.execution_view, 'S4 expiry must already be committed');
  const view = c.expiry?.reply?.execution_view ?? c.reaccepted;
  for (const world of [c.accepted, c.applied.execution_view, c.reaccepted, view]) {
    assert(world?.basis?.session_id === c.session.session_id && Object.keys(world.basis).length === 9, 'Continuation world binding mismatch');
  }
  assert(c.comparisons[1].group.jobs.some(j => j.job_id === view.active_job_id), 'Continuation active job mismatch');
  return view;
}
export function driverRouteRequired(view) {
  // The production Driver context is V1. PARTIAL/immobilized worlds can
  // legitimately supply no route for it; never demand invented geometry.
  if (!view?.accepted_trajectory) return true;
  const routes = view.accepted_trajectory.vehicle_routes;
  assert(Array.isArray(routes) && routes.every(r => Array.isArray(r.actions)), 'Invalid accepted route witness');
  return routes.some(r => r.vehicle_id === 'V1' && r.actions.some(a => a.kind === 'EDGE'));
}
export function assertCleanupAuthorization(report, stage) {
  assertNativeMatrix(report, stage);
  for (const branch of requiredFailureBranches) {
    assert(report.failure_matrix?.some(row => row.branch === branch && row.native === true && row.status === 'PASS' && row.evidence?.length), `Native failure matrix incomplete: ${branch}`);
  }
}
export function completeNativeReport(report,stage){
  const completed={...report,status:'PASS',cleanup_authorized:true};
  assertCleanupAuthorization(completed,stage);
  return completed;
}
export function assertNativeMatrix(report, stage) {
  assert.equal(report.status, 'PASS', 'Matrix must PASS');
  assertNativeScenarioMatrix(report,stage);
}
export function assertNativeScenarioMatrix(report, stage) {
  assert.equal(report.native, true, 'Only native evidence authorizes cleanup');
  assert.equal(report.stage, stage, 'Evidence stage mismatch');
  assert.deepEqual(report.page_errors, []);
  if (stage === 'post-cleanup') {
    assert(report.frontend_requests?.length, 'Actual browser asset requests required');
    assert(report.frontend_requests.every(r => !/mockEntry|mockUnavailable|MockDispatchApi|MockStateEngine|\/mocks\/|fixtureCatalog|decisionPacks|offlineRoad|member2-(?:event-)?road-packs/i.test(r.path)), 'Backend browser must not load mock chunks or assets');
    const artifact=report.frontend_artifact;
    assert(artifact?.status==='PASS'&&artifact.mode==='backend'&&/^[a-f0-9]{64}$/.test(artifact.graph_sha256), 'Audited served backend build artifact required');
    assert(artifact.entry_chunks?.length&&artifact.entry_chunks.every(file=>report.frontend_requests.some(r=>r.path==='/'+file)), 'Browser must load the audited build entry chunks');
  }
  assert.deepEqual(report.cases.map(c => c.scenario).sort(), ['S0','S1','S2','S3','S4'], 'Native scenarios S0 through S4 required');
  for (const c of report.cases) {
    assert.equal(c.status, 'PASS', `${c.scenario} must PASS`);
    assert.equal(c.initial.basis.session_id, c.session.session_id, 'Physical session binding mismatch');
    assert.equal(Object.keys(c.initial.basis).length, 9, 'Full basis required');
    assert(c.assertions.length >= 6, 'Case gates incomplete');
    for (const view of [c.accepted, c.final]) {
      assert(view?.basis && view.basis.session_id === c.session.session_id, 'Accepted/final physical session binding mismatch');
      assert.equal(Object.keys(view.basis).length, 9, 'Full physical basis required');
    }
    assert(c.comparisons?.length, 'Real comparison witnesses required');
    for (const { group, forecasts } of c.comparisons) {
      assert.equal(group.status, 'COMPLETED');
      assert.equal(group.input_basis.session_id, c.session.session_id, 'Comparison binding mismatch');
      assert.deepEqual(group.jobs.map(j => j.profile).sort(), ['BALANCED', 'FASTEST', 'SAFER']);
      assert.equal(new Set(group.jobs.map(j => j.job_id)).size, 3);
      assert.equal(forecasts.length, 3);
      for (const f of forecasts) {
        assert(group.jobs.some(j => j.job_id === f.job_id && j.profile === f.profile), 'Forecast job/profile binding mismatch');
        assert.deepEqual(f.input_basis, group.input_basis);
        assert.equal(f.metric_scope, 'FORECAST_ONLY');
        assert.equal(f.real_world_observation, false, 'Forecast cannot claim real-world observation');
        assert.equal(f.units.geometry_order, 'longitude_latitude');
      }
    }
    for (const [tab, width] of [['Admin', 1280], ['Admin', 1440], ['Driver', 360], ['Driver', 390], ['Driver', 430]]) {
      const layout = report.layouts?.find(l => l.scenario === c.scenario && l.tab === tab && l.width === width);
      assert(layout, `${c.scenario} missing layout ${tab}/${width}`);
      assert.equal(layout.tilesUnavailable, true, 'Actual tile-failure evidence required');
      const required=tab==='Driver'?driverRouteRequired(c.final):adminRouteRequired(c.final.accepted_trajectory);
      if (!required) assert.equal(layout.routes, 0, 'No displayed native EDGE must not create a route');
      else assert(layout.routes > 0, 'Layout must retain actual routes');
      assert(layout.scroll <= layout.client + 1, 'Layout must not overflow');
    }
  }
}
