import { describe, expect, it } from 'vitest';
import { assertNativeMatrix, assertNativeScenarioMatrix, isHeldStateResponse, completeNativeReport, assertCleanupAuthorization, requiredFailureBranches, readOnlyContinuationWorld, adminRouteRequired, pendingS4ContinuationWorld } from './phase7-evidence.mjs';
const basis={session_id:'s',head_version:'1',generation:'0',build_sha256:'b',root_sha256:'r',head_sha256:'h',source_sha256:'source',context_version:'ctx',overlay_sha256:null};
const report=()=>({stage:'pre-cleanup',native:true,status:'PASS',cases:['S0','S1','S2','S3','S4'].map(scenario=>({scenario,status:'PASS',session:{session_id:'s'},initial:{basis},accepted:{basis},final:{basis},comparisons:[{group:{status:'COMPLETED',input_basis:basis,jobs:['FASTEST','BALANCED','SAFER'].map(profile=>({job_id:profile,profile}))},forecasts:['FASTEST','BALANCED','SAFER'].map(profile=>({job_id:profile,profile,input_basis:basis,metric_scope:'FORECAST_ONLY',real_world_observation:false,units:{geometry_order:'longitude_latitude'}}))}],assertions:['load','compare','select','accept','driver','reload']})),layouts:['S0','S1','S2','S3','S4'].flatMap(scenario=>[['Admin',1280],['Admin',1440],['Driver',360],['Driver',390],['Driver',430]].map(([tab,width])=>({scenario,tab,width,routes:1,tilesUnavailable:true,client:width,scroll:width}))),page_errors:[]});
describe('Phase 7 cleanup authorization evidence',()=>{
 it('rejects a matrix with a missing native scenario',()=>{const r=report();r.cases.pop();expect(()=>assertNativeMatrix(r,'pre-cleanup')).toThrow(/S0.*S4|scenario/)});
 it('rejects historical or synthetic evidence as cleanup authorization',()=>{const r=report();r.native=false;expect(()=>assertNativeMatrix(r,'pre-cleanup')).toThrow(/native/);const p=report();p.stage='post-cleanup';expect(()=>assertNativeMatrix(p,'pre-cleanup')).toThrow(/stage/)});
 it('rejects a case whose physical basis belongs to another session',()=>{const r=report();r.cases[0].initial.basis={...basis,session_id:'foreign'};expect(()=>assertNativeMatrix(r,'pre-cleanup')).toThrow(/binding/)});
 it('rejects incomplete or errored cases and accepts complete scoped native cases',()=>{const r=report();r.cases[0].status='IN_PROGRESS';expect(()=>assertNativeMatrix(r,'pre-cleanup')).toThrow(/PASS/);expect(()=>assertNativeMatrix(report(),'pre-cleanup')).not.toThrow()});
 it('rejects assertion labels without real comparison/forecast witnesses',()=>{const r=report();r.cases[0].comparisons=[];expect(()=>assertNativeMatrix(r,'pre-cleanup')).toThrow(/comparison/)});
 it('rejects accepted world binding and forecast provenance corruption',()=>{const r=report();r.cases[0].accepted.basis={...basis,session_id:'foreign'};expect(()=>assertNativeMatrix(r,'pre-cleanup')).toThrow(/binding/);const p=report();p.cases[0].comparisons[0].forecasts[0].real_world_observation=true;expect(()=>assertNativeMatrix(p,'pre-cleanup')).toThrow(/observation/)});
 it('requires all responsive widths with actual route retention',()=>{const r=report();r.layouts.pop();expect(()=>assertNativeMatrix(r,'pre-cleanup')).toThrow(/layout/);const p=report();p.layouts[0].routes=0;expect(()=>assertNativeMatrix(p,'pre-cleanup')).toThrow(/route/)});
});

it('does not authorize cleanup from native scenario witnesses alone',()=>{
 expect(()=>assertCleanupAuthorization(report(),'pre-cleanup')).toThrow(/failure matrix/);
});
it('keeps synthetic failure evidence separate from native cleanup authorization',()=>{
 const r={...report(),failure_matrix:requiredFailureBranches.map(branch=>({branch,native:true,status:'PASS',evidence:['unit candidate witness']}))};
 expect(()=>assertCleanupAuthorization(r,'pre-cleanup')).not.toThrow();
 r.failure_matrix[0].native=false;
 expect(()=>assertCleanupAuthorization(r,'pre-cleanup')).toThrow(/failure matrix/);
});

import { spawnSync } from 'node:child_process';
it('completes reporting only after every native scenario and fault witness passes',()=>{
 const r={...report(),status:'IN_PROGRESS',failure_matrix:requiredFailureBranches.map(branch=>({branch,native:true,status:'PASS',evidence:['validator unit fixture']}))};
 expect(completeNativeReport(r,'pre-cleanup')).toMatchObject({status:'PASS',cleanup_authorized:true});
 expect(r.status).toBe('IN_PROGRESS');r.failure_matrix.pop();
 expect(()=>completeNativeReport(r,'pre-cleanup')).toThrow(/failure matrix/);
 expect(r.status).toBe('IN_PROGRESS');
});
it('holds only the real GET state response and ignores CORS OPTIONS',()=>{
 const url='http://127.0.0.1:8005/api/sessions/s/state';
 const event={responseStatusCode:200,request:{method:'GET',url}};
 expect(isHeldStateResponse(event,url)).toBe(true);
 expect(isHeldStateResponse({...event,request:{method:'OPTIONS',url}},url)).toBe(false);
 expect(isHeldStateResponse({...event,responseStatusCode:403},url)).toBe(false);
});
it('can validate preserved completed native cases while failure checks are interrupted without authorizing cleanup',()=>{
 const r={...report(),status:'FAIL',failure:'fault harness interrupted'};
 expect(()=>assertNativeScenarioMatrix(r,'pre-cleanup')).not.toThrow();
 expect(()=>assertCleanupAuthorization(r,'pre-cleanup')).toThrow(/PASS/);
 r.cases[4].status='IN_PROGRESS';
 expect(()=>assertNativeScenarioMatrix(r,'pre-cleanup')).toThrow(/PASS/);
});
it('keeps Admin return-only geometry hidden while Driver retains its actual EDGE',()=>{
 const trajectory={vehicle_routes:[{vehicle_id:'V1',actions:[{kind:'EDGE'}]}]};
 expect(adminRouteRequired(trajectory)).toBe(false);
 trajectory.vehicle_routes[0].actions.push({kind:'SERVICE'});
 expect(adminRouteRequired(trajectory)).toBe(true);
 const r=report();r.cases[4].final.accepted_trajectory={vehicle_routes:[{vehicle_id:'V1',actions:[{kind:'EDGE'}]}]};
 for(const l of r.layouts.filter(l=>l.scenario==='S4'&&l.tab==='Admin'))l.routes=0;
 expect(()=>assertNativeMatrix(r,'pre-cleanup')).not.toThrow();
 r.layouts.find(l=>l.scenario==='S4'&&l.tab==='Admin').routes=1;
 expect(()=>assertNativeMatrix(r,'pre-cleanup')).toThrow(/route/i);
});
it('continues an S4 preview interruption only on the exact applied world and completed current comparison',()=>{
 const c={scenario:'S4',session:{session_id:'s'},accepted:{basis},applied:{execution_view:{basis}},comparisons:report().cases[0].comparisons.concat(report().cases[0].comparisons)};
 expect(pendingS4ContinuationWorld(c)).toBe(c.applied.execution_view);
 expect(()=>pendingS4ContinuationWorld({...c,reaccepted:{basis}})).toThrow();
 expect(()=>pendingS4ContinuationWorld({...c,comparisons:[c.comparisons[0],{...c.comparisons[1],group:{...c.comparisons[1].group,input_basis:{...basis,head_version:'2'}}}]})).toThrow(/basis/i);
});
it('continues only fully committed event cases and preserves their exact final native world',()=>{
 const c={scenario:'S3',session:{session_id:'s'},accepted:{basis},applied:{execution_view:{basis}},reaccepted:{basis,active_job_id:'FASTEST'},comparisons:report().cases[0].comparisons.concat(report().cases[0].comparisons)};
 expect(readOnlyContinuationWorld(c)).toBe(c.reaccepted);
 expect(()=>readOnlyContinuationWorld({...c,reaccepted:undefined})).toThrow();
 expect(()=>readOnlyContinuationWorld({...c,reaccepted:{...c.reaccepted,basis:{...basis,session_id:'foreign'}}})).toThrow(/binding/);
 expect(()=>readOnlyContinuationWorld({...c,scenario:'S4'})).toThrow(/expiry/);
});
it('requires actual tile-failure evidence at every responsive width',()=>{
 const r=report();r.layouts[0].tilesUnavailable=false;
 expect(()=>assertNativeMatrix(r,'pre-cleanup')).toThrow(/tile/i);
});
it('requires post-cleanup browser asset requests and refuses mock chunks',()=>{
 const r={...report(),stage:'post-cleanup',frontend_artifact:{status:'PASS',mode:'backend',graph_sha256:'a'.repeat(64),entry_chunks:['assets/index.js']},frontend_requests:[{path:'/assets/index.js'}]};
 expect(()=>assertNativeMatrix(r,'post-cleanup')).not.toThrow();
 r.frontend_requests.push({path:'/assets/mockEntry.js'});
 expect(()=>assertNativeMatrix(r,'post-cleanup')).toThrow(/mock/i);
 r.frontend_requests=[];
 expect(()=>assertNativeMatrix(r,'post-cleanup')).toThrow(/browser|asset/i);
});
it('requires post-cleanup served build audit and the browser to load its exact entry chunk',()=>{
 const r={...report(),stage:'post-cleanup',frontend_requests:[{path:'/assets/index.js'}]};
 expect(()=>assertNativeMatrix(r,'post-cleanup')).toThrow(/artifact|build/i);
 r.frontend_artifact={status:'PASS',mode:'backend',graph_sha256:'a'.repeat(64),entry_chunks:['assets/different.js']};
 expect(()=>assertNativeMatrix(r,'post-cleanup')).toThrow(/entry/i);
});
it('accepts zero Driver paths only when the actual accepted trajectory has no EDGE for V1',()=>{
 const r=report(); const c=r.cases.find(c=>c.scenario==='S3');
 c.final.accepted_trajectory={vehicle_routes:[{vehicle_id:'V1',actions:[]},{vehicle_id:'V2',actions:[{kind:'EDGE'},{kind:'SERVICE'}]}]};
 for(const l of r.layouts.filter(l=>l.scenario==='S3'&&l.tab==='Driver')) l.routes=0;
 expect(()=>assertNativeMatrix(r,'pre-cleanup')).not.toThrow();
 c.final.accepted_trajectory.vehicle_routes[0].actions.push({kind:'EDGE'});
 expect(()=>assertNativeMatrix(r,'pre-cleanup')).toThrow(/route/);
});
it('routes --all to native Phase 7 and demands credentials before any network call',()=>{const r=spawnSync(process.execPath,['docs/evidence/member3-integration/browser.mjs','--all'],{cwd:process.cwd(),encoding:'utf8',env:{...process.env,M3_ACCESS_FILE:''}});expect(r.status).not.toBe(0);expect(r.stderr).toContain('Set private M3_ACCESS_FILE');expect(r.stderr).not.toContain('--all requires implemented');});
