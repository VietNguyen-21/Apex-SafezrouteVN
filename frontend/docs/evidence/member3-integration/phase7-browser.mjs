// Fresh Phase 7 matrix on real M3/M2; works against dev and built frontend.
// HTTP setup/boundary positioning is explicit; application actions use real UI.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { summarizeResponse } from './phase4-evidence.mjs';
import { expiryOracle } from './phase5-evidence.mjs';
import { installFetchProbe } from './phase6-evidence.mjs';
import { assertNativeMatrix, assertCleanupAuthorization, driverRouteRequired, adminRouteRequired, readOnlyContinuationWorld, pendingS4ContinuationWorld } from './phase7-evidence.mjs';
import { runFailureMatrix } from './phase7-native-failures.mjs';
const stage=process.env.M3_PHASE7_STAGE??'pre-cleanup'; assert(['pre-cleanup','post-cleanup'].includes(stage));
assert(process.env.M3_ACCESS_FILE,'Set private M3_ACCESS_FILE');
const access=JSON.parse(await readFile(process.env.M3_ACCESS_FILE,'utf8'));
const token=access.credentials.find(c=>c.actor_id==='member4')?.token;assert(token);
const foreign=access.credentials.find(c=>c.actor_id!=='member4'&&c.role==='dispatcher')?.token;
const base=process.env.M3_BASE_URL??'http://127.0.0.1:8004',front=process.env.M3_FRONTEND_URL??'http://127.0.0.1:5174';
const build='d99f034a897b5c41f5b1c53efe32e57f62607072b237e858a6e1e3e11e68d756';
const report={schema_version:'saferoute-m4-phase7-native/1',stage,native:true,status:'IN_PROGRESS',started_at:new Date().toISOString(),base_url:base,frontend_url:front,build_sha256:build,cases:[],page_errors:[],requests:[],frontend_requests:[],responses:[],failures:[],layouts:[],polling:[],limitations:['Manual touch/WebView not run','Native assertions use actual server responses. Synthetic parser/polling failure branches are unit evidence, not native E2E','HTTP scenario load and exact boundary/expiry replay are labeled harness prerequisites; no frontend local physics']};
const output=new URL(`phase7-${stage}-native.json`,import.meta.url);
let browser,quietPage,current;
let continued;
if(process.env.M3_PHASE7_CONTINUE_REPORT){
 const bytes=await readFile(process.env.M3_PHASE7_CONTINUE_REPORT);continued=JSON.parse(bytes);
 assert(continued.native&&continued.status==='FAIL'&&continued.stage===stage&&continued.build_sha256===build&&continued.base_url===base&&continued.frontend_url===front);
 assert(!process.env.M3_PHASE7_RESUME_REPORT);
 for(const key of ['requests','responses','failures','polling','frontend_requests'])report[key].push(...(continued[key]??[]));
 report.cases.push(...continued.cases.filter(c=>c.status==='PASS'));
 report.layouts.push(...continued.layouts.filter(l=>report.cases.some(c=>c.scenario===l.scenario)));
 report.continuation={parent_receipt_sha256:createHash('sha256').update(bytes).digest('hex'),previous_failure:continued.failure,scope:'Preserved complete cases; exact read-only world equality before continuation. Already committed commands/comparisons are never resubmitted; pending S4 Accept/expiry run once if absent from the parent receipt.'};
}
const trace=step=>console.log(JSON.stringify({stage,scenario:current?.scenario,step,at:new Date().toISOString()}));
async function save(status=report.status){report.status=status;report.recorded_at=new Date().toISOString();const s=JSON.stringify(report);for(const c of access.credentials)if(c.token)assert(!s.includes(c.token));await writeFile(output,s)}
const revision=b=>({head_version:b.head_version,generation:b.generation});
async function quiet(){if(quietPage)await quietPage.bringToFront()}
async function http(path,body,status=200,bearer=token){
 if(!path.includes('/profiles/comparisons/'))await quiet();
 for(let attempt=1;attempt<=3;attempt++){
 const r=await fetch(base+path,{method:body?'POST':'GET',headers:{...(bearer?{Authorization:`Bearer ${bearer}`}:{ }),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(240000)}),envelope=await r.json();
 report.requests.push({origin:'HTTP prerequisite/assertion',path,method:body?'POST':'GET',...(body?{body}:{}),attempt});report.responses.push(summarizeResponse({path,status:r.status,envelope}));
 if(!body&&status===200&&r.status===503&&envelope.diagnostics?.some(d=>['RUNTIME_BUSY','RUNTIME_TIMEOUT'].includes(d.code))&&attempt<3)continue;
 assert.equal(r.status,status,`${path}: ${JSON.stringify(envelope.diagnostics)}`);return status<400?envelope.data:envelope;
 }
}
async function button(page,selector){await page.bringToFront();await page.waitForFunction(s=>{const b=document.querySelector(s);if(!b||b.disabled)return false;b.click();return true},{polling:1000},selector)}
async function textButton(page,label){await page.bringToFront();await page.waitForFunction(t=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===t);if(!b||b.disabled)return false;b.click();return true},{polling:1000},label)}
async function converge(pages,view){for(const page of pages){await page.bringToFront();await page.waitForFunction(({basis,time,job})=>{const e=document.querySelector('main'),b=JSON.parse(e?.dataset.basis??'null');return e?.dataset.stale==='false'&&b&&Object.keys(basis).every(k=>b[k]===basis[k])&&e.dataset.currentTime===time&&(e.dataset.activeJobId||null)===job},{polling:1000},{basis:view.basis,time:view.current_time,job:view.active_job_id})}}
async function uiMutation(page,selector,suffix){const response=page.waitForResponse(r=>r.url().endsWith(suffix)&&r.request().method()==='POST');await button(page,selector);const r=await response;assert.equal(r.status(),200);return(await r.json()).data}
async function optimize(page,prefix,basis,resumeId){
 let cid=resumeId;
 if(!cid){const submitted=page.waitForResponse(r=>r.url().endsWith('/profiles/compare')&&r.request().method()==='POST');await button(page,'[aria-label="Optimize"]');const response=await submitted;assert.equal(response.status(),202);cid=(await response.json()).data.comparison_id;}
 // Keep the actual application foreground and its normal polls active during solve.
 await page.bringToFront();let observed;const deadline=Date.now()+660000;
 do{observed=await http(prefix+`/profiles/comparisons/${cid}`);if(['COMPLETED','FAILED','CANCELLED'].includes(observed.status))break;await new Promise(r=>setTimeout(r,5000))}while(Date.now()<deadline);
 assert.equal(observed.status,'COMPLETED');await page.bringToFront();
 await page.waitForFunction(id=>document.querySelector('main')?.dataset.comparisonId===id&&document.querySelector('main')?.dataset.comparisonStatus==='COMPLETED',{polling:1000},cid);
 const id=await page.$eval('main',e=>e.dataset.comparisonId),group=await http(prefix+`/profiles/comparisons/${id}`);
 assert.equal(group.status,'COMPLETED');assert.deepEqual(group.input_basis,basis);assert.equal(new Set(group.jobs.map(j=>j.job_id)).size,3);
 // Use the exact real forecast responses consumed by the application rather
 // than issuing three duplicate SDK reads from the harness.
 const forecastDeadline=Date.now()+660000;
 while(!group.jobs.every(row=>current.browser_forecasts?.[row.job_id])){
  assert(Date.now()<forecastDeadline,'Actual browser forecast responses required');
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 const forecasts=group.jobs.map(row=>{
  assert(row.view);assert.deepEqual(row.view.input_basis,basis);
  const f=current.browser_forecasts[row.job_id];
  assert.deepEqual(f.input_basis,basis);assert.equal(f.job_id,row.job_id);assert.equal(f.profile,row.profile);
  assert.equal(f.metric_scope,'FORECAST_ONLY');assert.equal(f.units.geometry_order,'longitude_latitude');assert.equal(f.real_world_observation,false);
  return f;
 });

 const witness=group.jobs.find(j=>j.profile==='BALANCED'&&j.view.plan_available&&j.view.validation?.valid)??group.jobs.find(j=>j.view.plan_available&&j.view.validation?.valid);assert(witness,'Native case needs a certified witness');
 await page.bringToFront();await page.waitForFunction(p=>document.querySelector(`[aria-label="Select ${p}"]`)?.disabled===false,{polling:1000},witness.profile);
 current.comparisons??=[];current.comparisons.push({group,forecasts});return witness;
}
async function selectAccept(admin,prefix,job,before){
 const n=report.requests.length;await button(admin,`[aria-label="Select ${job.profile}"]`);assert.equal(report.requests.slice(n).filter(r=>r.origin==='Admin browser'&&r.method==='POST').length,0);
 await admin.evaluate(()=>{for(const b of document.querySelectorAll('[role="switch"][aria-label^="Show "]'))if(b.getAttribute('aria-checked')==='false')b.click()});
 const forecast=current.comparisons.at(-1).forecasts.find(f=>f.job_id===job.job_id);assert(forecast);
 if(adminRouteRequired(forecast.trajectory))await admin.waitForSelector('[aria-label="Proposed — not dispatched"]');
 else assert.equal(await admin.$$eval('.leaflet-overlay-pane path',e=>e.length),0,'Return-only forecast must stay hidden by the Admin filter');
 const response=await uiMutation(admin,'[aria-label="Accept selected plan"]',`/jobs/${job.job_id}/accept`);assert.equal(response.execution_view.active_job_id,job.job_id);assert.deepEqual(response.execution_view.delivered_prefix,before.delivered_prefix);
 current.assertions.push('Select is local; actual UI Accept binds certified current job without delivery-on-accept');return response.execution_view;
}
async function layouts(admin,driver,world){
 await admin.bringToFront();
 await admin.evaluate(()=>{for(const b of document.querySelectorAll('[role="switch"][aria-label^="Show "]'))if(b.getAttribute('aria-checked')==='false')b.click()});
 for(const[name,page,widths]of[['Admin',admin,[1280,1440]],['Driver',driver,[360,390,430]]])for(const width of widths){
  await page.bringToFront();await page.setViewport({width,height:name==='Admin'?1000:950});
  const required=name==='Driver'?driverRouteRequired(world):adminRouteRequired(world.accepted_trajectory);
  if(required)await page.waitForFunction(()=>document.querySelectorAll('.leaflet-overlay-pane path').length>0);
  const measurements=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,routes:document.querySelectorAll('.leaflet-overlay-pane path').length,tilesUnavailable:document.body.textContent.includes('Map tiles unavailable')}));
  assert(measurements.scroll<=measurements.client+1,`${name} overflow at ${width}`);
  if(required)assert(measurements.routes>0);else assert.equal(measurements.routes,0);
  const image=`phase7-${stage}-${current.scenario}-${name.toLowerCase()}-${width}.png`;
  await page.screenshot({path:fileURLToPath(new URL(image,import.meta.url)),fullPage:true});
  report.layouts.push({scenario:current.scenario,tab:name,width,...measurements,route_expectation:required?'RETAIN_NATIVE_EDGE':'NO_NATIVE_EDGE',screenshot:image});
 }
}
try{
 if(stage==='post-cleanup'){
  const {auditBackendBuild}=await import('../../../scripts/audit-backend-build.mjs');
  const local=new URL('../../../dist/',import.meta.url),audit=await auditBackendBuild(fileURLToPath(local));
  const served=await fetch(front+'/build-graph.json');assert.equal(served.status,200,'Built frontend manifest must be served');
  const bytes=Buffer.from(await served.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),audit.graph_sha256,'Served artifact differs from audited build');
  const graph=JSON.parse(bytes);report.frontend_artifact={...audit,entry_chunks:graph.chunks.filter(c=>c.entry).map(c=>c.file)};
 }
 const ready=await http('/ready');assert(ready.ready);report.ready=ready;assert.equal((await http('/api/runtime/capabilities')).build_sha256,build);
 browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,protocolTimeout:660000,args:['--no-sandbox','--disable-gpu','--no-first-run']});quietPage=await browser.newPage();
 for(const scenario of ['S0','S1','S2','S3','S4']){
  if(report.cases.some(c=>c.scenario===scenario&&c.status==='PASS'))continue;
  const resumedCase=continued?.cases.find(c=>c.scenario===scenario);
  current=undefined;trace(resumedCase?'read-only committed case continuation':'fresh native load');let loaded,resumeId,resumeBasis;
  if(resumedCase){const expected=resumedCase.reaccepted?readOnlyContinuationWorld(resumedCase):pendingS4ContinuationWorld(resumedCase);loaded={session:resumedCase.session,execution_view:await http(`/api/sessions/${resumedCase.session.session_id}/state`)};assert.deepEqual(loaded.execution_view,expected);const previous=resumedCase.comparisons.at(-1).group;resumeId=previous.comparison_id;resumeBasis=previous.input_basis;}
  else if(scenario==='S0'&&process.env.M3_PHASE7_RESUME_REPORT){const bytes=await readFile(process.env.M3_PHASE7_RESUME_REPORT);const prior=JSON.parse(bytes);assert(prior.native&&prior.status==='FAIL'&&prior.stage===stage);report.requests.push(...prior.requests);report.responses.push(...prior.responses);const original=prior.cases[0];assert(original.scenario==='S0'&&!original.accepted);assert(!prior.requests.some(r=>r.method==='POST'&&/\/accept$|\/apply$|\/replay\//.test(r.path)));resumeId=prior.requests.filter(r=>r.path.includes('/profiles/comparisons/')).at(-1).path.split('/').at(-1);
   const prefix=`/api/sessions/${original.session.session_id}`;let group;const deadline=Date.now()+660000;do{group=await http(prefix+`/profiles/comparisons/${resumeId}`);if(['COMPLETED','FAILED','CANCELLED'].includes(group.status))break;await new Promise(r=>setTimeout(r,5000))}while(Date.now()<deadline);assert.equal(group.status,'COMPLETED');
   loaded={session:await http(prefix),execution_view:await http(prefix+'/state')};assert.deepEqual(loaded.execution_view,original.initial);report.continuation={prior_sha256:createHash('sha256').update(bytes).digest('hex'),prior_failure:prior.failure,scope:'Original fresh S0 load and UI Optimize retained; official startup recovery after SDK validation; no Optimize/physical command replayed; remaining assertions on unchanged world'};
  }else loaded=await http(`/api/scenarios/${scenario}/load`,{request_id:`p7-${stage}-load-${randomUUID()}`},201);assert.equal(loaded.session.build_sha256,build);
  current=resumedCase??{scenario,session:loaded.session,initial:loaded.execution_view,assertions:[]};current.status='IN_PROGRESS';report.cases.push(current);await save();
  const sid=loaded.session.session_id,prefix=`/api/sessions/${sid}`,context=await browser.createBrowserContext(),admin=await context.newPage(),driver=await context.newPage(),responseTasks=[];
  const observedCase=current;
  let lostResponse;
  for(const[name,page,width]of[['Admin',admin,1440],['Driver',driver,390]]){
   await page.setViewport({width,height:1000});page.setDefaultTimeout(660000);
   await page.evaluateOnNewDocument(({token})=>sessionStorage.setItem('saferoute.member3.bearer',token),{token});await page.evaluateOnNewDocument(installFetchProbe,base);
   page.on('pageerror',e=>report.page_errors.push(e.message));
   await page.setRequestInterception(true);page.on('request',r=>{
    if(r.url().startsWith(front))report.frontend_requests.push({scenario,tab:name,path:new URL(r.url()).pathname,type:r.resourceType()});
    if(r.url().startsWith(base)&&r.method()!=='OPTIONS')report.requests.push({origin:`${name} browser`,path:new URL(r.url()).pathname,method:r.method(),...(r.method()==='POST'?{body:JSON.parse(r.postData())}:{})});
    if(lostResponse?.pending&&r.url()===lostResponse.url&&r.method()==='POST'){
     lostResponse.pending=false;
     lostResponse.task=(async()=>{const response=await fetch(r.url(),{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:r.postData(),signal:AbortSignal.timeout(240000)});const envelope=await response.json();assert.equal(response.status,200);lostResponse.reply=envelope.data;report.responses.push(summarizeResponse({path:new URL(r.url()).pathname,status:200,envelope,reply_deliberately_lost:true}));await r.abort('failed')})().catch(e=>{lostResponse.error=e;void r.abort('failed')});
    }else if(r.url().includes('tile.openstreetmap.org'))void r.abort('failed');else void r.continue();
   });
   page.on('response',r=>{if(r.url().startsWith(base)&&r.request().method()!=='OPTIONS')responseTasks.push((async()=>{
    const envelope=await r.json(),path=new URL(r.url()).pathname;
    report.responses.push(summarizeResponse({origin:`${name} browser`,path,status:r.status(),envelope}));
    if(path.endsWith('/forecast')&&r.status()===200){observedCase.browser_forecasts??={};observedCase.browser_forecasts[envelope.data.job_id]=envelope.data;}
   })().catch(()=>{}))});
  }
  await admin.evaluateOnNewDocument(({base,session,resumeId,basis})=>{localStorage.setItem(`saferoute.member3.session.v1:${base}`,JSON.stringify({schemaVersion:1,session,...(resumeId?{comparison:{id:resumeId,inputBasis:basis}}:{})}));localStorage.setItem('saferoute.phase1.dispatch.v1',JSON.stringify({decisionState:{scenarioId:'S0',orders:[{id:'old-mock-order'}]}}))},{base,session:loaded.session,resumeId,basis:resumeBasis??loaded.execution_view.basis});
  await admin.bringToFront();await admin.goto(front+'/admin',{waitUntil:'domcontentloaded'});await converge([admin],loaded.execution_view);current.assertions.push(resumedCase?'Read-only committed world rendered with full nine-field basis and server time':'Fresh native baseline rendered with full nine-field basis and server time');
  let world;
  if(resumedCase){await driver.goto(front+'/driver',{waitUntil:'domcontentloaded'});world=loaded.execution_view;await converge([admin,driver],world);current.assertions.push('Continuation verifies exact committed world before remaining assertions');
   if(!resumedCase.reaccepted){
    const group=current.comparisons.at(-1).group;
    const next=group.jobs.find(j=>j.profile==='BALANCED'&&j.view.plan_available&&j.view.validation?.valid)??group.jobs.find(j=>j.view.plan_available&&j.view.validation?.valid);assert(next);
    trace('remaining actual S4 Select/Accept');world=await selectAccept(admin,prefix,next,world);current.reaccepted=world;await converge([admin,driver],world);
    assert(process.env.M3_S4_FIXTURE);const oracle=expiryOracle(await readFile(process.env.M3_S4_FIXTURE),loaded.session,current.event.event_id);
    const expired=await http(prefix+'/replay/step',{request_id:`p7-expiry-${randomUUID()}`,expected_revision:revision(world.basis),target_time:oracle.end_time});assert.equal(expired.execution_view.current_time,oracle.end_time);
    current.expiry={oracle,reply:expired};world=expired.execution_view;await converge([admin,driver],world);current.assertions.push('Actual native replay reaches pinned server expiry; geometry/metric scopes remain authoritative');
   }
  }
  else {
  if(scenario==='S1'){const[o,v,l]=[await http(prefix+'/orders'),await http(prefix+'/vehicles'),await http(prefix+'/locations')];assert.equal(o.orders.length,8);assert.equal(v.vehicles.length,2);assert.equal(l.locations.length,9);current.projections={orders:o,vehicles:v,locations:l};current.assertions.push('S1 8 orders/2 vehicles/9 locations; old mock world ignored')}
  trace('actual Admin Optimize');const job=await optimize(admin,prefix,loaded.execution_view.basis,resumeId);current.assertions.push('Three real jobs and certified public EDGE/KPI/profile/basis forecasts; no implied profile differences');
  await driver.bringToFront();await driver.goto(front+'/driver',{waitUntil:'domcontentloaded'});await converge([driver],loaded.execution_view);assert.equal(await driver.$$eval('[aria-label^="Mark delivered for order "]',e=>e.length),0);assert.equal(await driver.$$eval('.leaflet-overlay-pane path',e=>e.length),0);current.assertions.push('Driver has no accepted route before Accept and no manual physical controls');
  trace('local Select and actual Accept');world=await selectAccept(admin,prefix,job,loaded.execution_view);await converge([admin,driver],world);current.accepted=world;
  const stale=await http(prefix+`/jobs/${job.job_id}/accept`,{request_id:`p7-stale-${randomUUID()}`,expected_revision:revision(loaded.execution_view.basis)},409);assert(stale.diagnostics.some(d=>d.code==='STALE_HEAD'));report.failures.push({scenario,branch:'stale Accept',native:true,status:'PASS',diagnostics:stale.diagnostics});
  if(['S2','S3','S4'].includes(scenario)){
   const events=await http(prefix+'/events');assert.equal(events.events.length,1);const event=events.events[0];current.event=event;assert(!event.apply_allowed);
   const notDue=await http(prefix+`/events/${event.event_id}/apply`,{request_id:`p7-not-due-${randomUUID()}`,expected_revision:revision(world.basis)},409);assert(notDue.diagnostics.some(d=>d.code==='EVENT_NOT_DUE'));
   trace('native boundary prerequisite');const boundary=await http(prefix+'/replay/step',{request_id:`p7-barrier-${randomUUID()}`,expected_revision:revision(world.basis),target_time:event.timestamp});world=boundary.execution_view;current.barrier=boundary;assert.equal(world.current_time,event.timestamp);await converge([admin,driver],world);
   trace('actual Admin Apply');let applied;
   if(scenario==='S2'){
    lostResponse={pending:true,url:base+prefix+`/events/${event.event_id}/apply`};await button(admin,`button[data-event-id="${event.event_id}"]`);
    await admin.waitForFunction(()=>document.querySelector('[role="alert"]')?.textContent.includes('NETWORK_ERROR'),{polling:1000});await lostResponse.task;assert.ifError(lostResponse.error);assert(lostResponse.reply);
    await textButton(admin,'Refresh backend');
    await admin.waitForFunction(id=>document.querySelector(`button[data-event-id="${id}"]`)?.textContent==='Applied',{polling:1000},event.event_id);
    applied={receipt:lostResponse.reply.receipt,execution_view:await http(prefix+'/state')};
    const posts=report.requests.filter(r=>r.origin==='Admin browser'&&r.method==='POST'&&r.path===prefix+`/events/${event.event_id}/apply`);assert(posts.length>=2);assert(posts.every(r=>JSON.stringify(r.body)===JSON.stringify(posts[0].body)));
    const history=await http(prefix+'/replay/history');assert.equal(history.history.filter(r=>r.operation==='apply_event'&&r.event_id===event.event_id).length,1);
    report.failures.push({scenario,branch:'ambiguous command retry',native:true,status:'PASS',scope:'Actual M3 commit forwarded unchanged; browser response aborted; UI Refresh retries same ID/body once, one receipt',request:posts[0].body,receipt:applied.receipt});
   }else applied=await uiMutation(admin,`button[data-event-id="${event.event_id}"]`,`/events/${event.event_id}/apply`);
   current.applied=applied;assert.deepEqual(applied.execution_view.delivered_prefix,world.delivered_prefix);assert.deepEqual(applied.execution_view.vehicles.map(v=>[v.vehicle_id,v.position,v.current_load_kg,v.onboard_order_ids]),world.vehicles.map(v=>[v.vehicle_id,v.position,v.current_load_kg,v.onboard_order_ids]));world=applied.execution_view;await converge([admin,driver],world);
   const twice=await http(prefix+`/events/${event.event_id}/apply`,{request_id:`p7-twice-${randomUUID()}`,expected_revision:revision(world.basis)},409);assert(twice.diagnostics.some(d=>d.code==='EVENT_ALREADY_APPLIED'));
   current.assertions.push('Exact native barrier enables one-way Apply; event cannot duplicate; delivered prefix/custody/position preserved');
   if(scenario==='S2'){const orders=await http(prefix+'/orders');current.after_event_orders=orders;assert(orders.orders.length>loaded.execution_view.order_ids.length);current.assertions.push('Urgent orders come from server projection')}
   if(scenario==='S3'){const stopped=world.vehicles.filter(v=>v.activity==='IMMOBILIZED');assert(stopped.some(v=>v.onboard_order_ids.length));current.assertions.push('Unavailable owner retains onboard custody; no delivered order reassigned')}
   if(scenario==='S4'){assert(world.basis.overlay_sha256);assert.equal(await admin.$$eval('[aria-label="Simulated rain area"]',e=>e.length),0);current.assertions.push('Rain overlay provenance server-owned; no mock polygon')}
   trace('actual post-event Optimize and re-Accept');const next=await optimize(admin,prefix,world.basis);world=await selectAccept(admin,prefix,next,world);current.reaccepted=world;await converge([admin,driver],world);
   if(scenario==='S4'){assert(process.env.M3_S4_FIXTURE,'Set pinned S4 fixture path for test-only expiry oracle');const oracle=expiryOracle(await readFile(process.env.M3_S4_FIXTURE),loaded.session,event.event_id);const expired=await http(prefix+'/replay/step',{request_id:`p7-expiry-${randomUUID()}`,expected_revision:revision(world.basis),target_time:oracle.end_time});assert.equal(expired.execution_view.current_time,oracle.end_time);current.expiry={oracle,reply:expired};world=expired.execution_view;await converge([admin,driver],world);current.assertions.push('Actual native replay reaches pinned server expiry; geometry/metric scopes remain authoritative')}
  }else{
   trace('actual Driver Step');await driver.bringToFront();const response=driver.waitForResponse(r=>r.url().endsWith('/replay/step')&&r.request().method()==='POST');await textButton(driver,'Step');const r=await response;assert.equal(r.status(),200);const step=(await r.json()).data;assert.equal(BigInt(step.execution_view.basis.head_version),BigInt(world.basis.head_version)+1n);world=step.execution_view;current.driver_step=step;await converge([admin,driver],world);current.assertions.push('Driver Step uses server replay and both tabs converge without local clock');
  }
  }
  trace('layout and reload assertions');await layouts(admin,driver,world);current.assertions.push('Admin1280/1440 Driver360/390/430 retain displayed native routes despite real OSM tile-request failure; absent or Admin-filtered EDGE stays route-free');
  const n=report.requests.length;await driver.bringToFront();await driver.reload({waitUntil:'domcontentloaded'});await converge([admin,driver],world);assert.equal(report.requests.slice(n).filter(r=>r.origin.endsWith('browser')&&r.method==='POST').length,0);assert(await driver.evaluate(()=>localStorage.getItem('saferoute.phase1.dispatch.v1')!==null));current.assertions.push('GET-only reload and cross-tab physical basis/time/job convergence; old mock key preserved');
  for(const[name,page]of[['Admin',admin],['Driver',driver]]){const probe=await page.evaluate(()=>window.__phase6FetchProbe);assert(Object.keys(probe.maxima).length);assert(Object.values(probe.maxima).every(n=>n===1));report.polling.push({scenario,tab:name,...probe})}
  assert(!report.requests.some(r=>/pickup|deliver|advanceDemoClock|offlineRoad/.test(r.path)));await Promise.allSettled(responseTasks);assert.deepEqual(report.page_errors,[]);current.final=world;delete current.browser_forecasts;current.status='PASS';await context.close();await save();trace('case PASS');
 }
 current=undefined;trace('native auth/input/binding rejection matrix');const c=report.cases[0],p=`/api/sessions/${c.session.session_id}`;
 const unauthorized=await http(p+'/state',undefined,401,null);assert(unauthorized.diagnostics.some(d=>d.code==='UNAUTHORIZED'));report.failures.push({branch:'401',native:true,status:'PASS',diagnostics:unauthorized.diagnostics});
 if(foreign){const forbidden=await http(p+'/state',undefined,403,foreign);report.failures.push({branch:'403 foreign owner',native:true,status:'PASS',diagnostics:forbidden.diagnostics})}else{const observer=access.credentials.find(x=>x.actor_id!=='member4')?.token;assert(observer,'Need real other actor credential');const forbidden=await http(p+'/state',undefined,403,observer);report.failures.push({branch:'403 foreign owner',native:true,status:'PASS',diagnostics:forbidden.diagnostics})}
 const invalid=await http(p+'/replay/step',{request_id:`p7-invalid-${randomUUID()}`,expected_revision:{head_version:'1e0',generation:'0'}},422);report.failures.push({branch:'invalid wire request schema',native:true,status:'PASS',diagnostics:invalid.diagnostics});
 report.status='PASS';assertNativeMatrix(report,stage);
 await runFailureMatrix({browser,report,base,front,token,access});
 assertCleanupAuthorization(report,stage);report.cleanup_authorized=true;
 await save('PASS');console.log(JSON.stringify({status:'PASS',stage,cases:report.cases.map(c=>c.scenario),receipt:fileURLToPath(output)}));
}catch(e){report.failure=String(e);await save('FAIL');throw e}finally{await browser?.close()}
