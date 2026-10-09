import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const phase = option("--phase", "2"), scenario = option("--scenario", "S1");
if (args.includes("--all") || phase === "7") {
  await import("./phase7-browser.mjs");
  process.exit(0);
}
if (phase === "6" && !args.includes("--all")) {
  await import("./phase6-browser.mjs");
  process.exit(0);
}
if (phase === "5" && !args.includes("--all")) {
  await import("./phase5-browser.mjs");
  process.exit(0);
}
if (phase === "4" && !args.includes("--all")) {
  assert.equal(scenario, "S1", "Phase 4 native gate currently covers S1 only");
  await import("./phase4-browser.mjs");
  process.exit(0);
}
assert(!args.includes("--all"), "--all requires implemented Phase 3–7 gates; no full-migration acceptance is claimed by this harness.");
assert.equal(phase, "2", "This release implements the Phase 2 gate only.");
assert(/^S[0-4]$/.test(scenario), "Supported scenarios: S0–S4");
assert(process.env.M3_ACCESS_FILE, "Set M3_ACCESS_FILE to the private native installation's dev_access.json");
const access = JSON.parse(await readFile(process.env.M3_ACCESS_FILE, "utf8"));
const token = access.credentials.find(c => c.actor_id === "member4")?.token;
assert(token, "An owned member4 dispatcher credential is required");
const base = process.env.M3_BASE_URL ?? "http://127.0.0.1:8000";
const front = process.env.M3_FRONTEND_URL ?? "http://127.0.0.1:5173";
const ready = await (await fetch(`${base}/ready`)).json(); assert.equal(ready.data.ready, true);
const out = new URL("./", import.meta.url); await mkdir(out, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const responses = [], requests = [], responseTasks = [], errors = [];
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox", "--disable-gpu", "--no-first-run"] });
try {
  const page = await browser.newPage(); page.setDefaultTimeout(125000); await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(bearer => sessionStorage.setItem("saferoute.member3.bearer", bearer), token);
  page.on("pageerror", e => errors.push(e.message));
  page.on("request", r => {
    if (r.url().startsWith(base)) requests.push({ path: new URL(r.url()).pathname, method: r.method(), body: r.method() === "POST" ? JSON.parse(r.postData() ?? "null") : undefined });
  });
  page.on("response", r => {
    if (r.url().startsWith(base) && r.request().method() !== "OPTIONS") responseTasks.push((async () => {
      responses.push({ path: new URL(r.url()).pathname, httpStatus: r.status(), envelope: await r.json() });
    })());
  });
  await page.goto(`${front}/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('.admin-page[data-dispatch-source="MEMBER3_HTTP"]');
  await page.click(".scenario-collapsible summary");
  await page.waitForFunction(() => !document.querySelector(".scenario-body select").disabled);
  await page.select(".scenario-body select", scenario);
  await page.waitForFunction(s => document.querySelector(".scenario-body select")?.value === s && !document.querySelector(".scenario-body select").disabled, {}, scenario);
  const before = await page.evaluate(async () => { const { BackendDispatchApi } = await import("/src/services/api/BackendDispatchApi.ts"); return new BackendDispatchApi().getSnapshot(); });
  const sid = before.decisionState.sessionId;
  await page.waitForFunction(() => !document.querySelector('[aria-label="Optimize"]').disabled);
  await page.click('[aria-label="Optimize"]');
  const deadline = Date.now() + 620000;
  let terminal;
  while (Date.now() < deadline) {
    terminal = await page.evaluate(() => { const el = document.querySelector(".admin-page"); return { cid: el?.dataset.comparisonId, status: el?.dataset.comparisonStatus }; });
    if (["COMPLETED", "FAILED", "CANCELLED"].includes(terminal.status)) break;
    const alert = await page.$eval("body", el => el.querySelector('[role="alert"]')?.textContent ?? null);
    assert.equal(alert, null, `Native watch failed: ${alert}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.equal(terminal.status, "COMPLETED", "Native comparison must reach its real completed group outcome");
  const snapshot = await page.evaluate(async () => { const { BackendDispatchApi } = await import("/src/services/api/BackendDispatchApi.ts"); return new BackendDispatchApi().getSnapshot(); });
  const group = snapshot.backend.comparison;
  assert.equal(group.jobs.length, 3); assert.deepEqual(group.jobs.map(j => j.profile), ["FASTEST", "BALANCED", "SAFER"]);
  assert.equal(new Set(group.jobs.map(j => j.job_id)).size, 3);
  assert.deepEqual(group.input_basis, before.backend.basis);
  for (const child of group.jobs) { assert(child.job_id); assert(child.view); assert.deepEqual(child.view.input_basis, group.input_basis); }
  assert(group.outcome); // Do not infer a witness or comparison verdict from COMPLETED.
  assert.deepEqual(snapshot.backend.basis, before.backend.basis);
  assert.deepEqual(snapshot.decisionState, before.decisionState);
  assert.equal(snapshot.backend.executionView.active_job_id, null); assert.equal(snapshot.backend.executionView.accepted_trajectory, null);
  assert.deepEqual(snapshot.planState.proposedAlternatives, []); assert.deepEqual(snapshot.planState.acceptedPlans, []);
  assert.equal(await page.$$eval('[aria-label="Proposed — not dispatched"]', els => els.length), 0);
  const posts = requests.filter(r => r.method === "POST" && r.path.endsWith("/profiles/compare")); assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].body.expected_revision, { head_version: before.backend.basis.head_version, generation: before.backend.basis.generation });
  assert(!("job_ids" in posts[0].body));
  const beforeRefresh = requests.length; await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(cid => document.querySelector(".admin-page")?.dataset.comparisonId === cid && document.querySelector(".admin-page")?.dataset.comparisonStatus === "COMPLETED", {}, group.comparison_id);
  assert.equal(requests.slice(beforeRefresh).filter(r => r.method === "POST").length, 0);
  assert.equal(await page.$eval(".admin-page", el => el.dataset.sessionId), sid);
  const pollCount = requests.filter(r => r.path.endsWith(`/comparisons/${group.comparison_id}`)).length;
  await new Promise(resolve => setTimeout(resolve, 3500));
  assert.equal(requests.filter(r => r.path.endsWith(`/comparisons/${group.comparison_id}`)).length, pollCount, "Terminal comparison must stop polling");
  // Real HTTP rejection matrix; no synthetic browser responses or mutations.
  const authRead = async (bearer, path) => { const r = await fetch(`${base}${path}`, { headers: bearer ? { Authorization: `Bearer ${bearer}` } : {} }); return { httpStatus: r.status, envelope: await r.json() }; };
  const unauthorized = await authRead(null, `/api/sessions/${sid}/state`); assert.equal(unauthorized.httpStatus, 401);
  const staleRequest = { request_id: `m4-stale-${crypto.randomUUID()}`, expected_revision: { head_version: before.backend.basis.head_version, generation: "9223372036854775807" } };
  const stale = await fetch(`${base}/api/sessions/${sid}/profiles/compare`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(staleRequest) });
  const staleEvidence = { httpStatus: stale.status, envelope: await stale.json() }; assert.equal(stale.status, 409);
  assert(staleEvidence.envelope.diagnostics.some(d => d.code === "STALE_HEAD"));
  await page.screenshot({ path: new URL(`phase2-${scenario}-${stamp}.png`, out).pathname.replace(/^\/([A-Za-z]:)/, "$1") });
  await Promise.all(responseTasks); assert.deepEqual(errors, []);
  assert.equal(requests.filter(r => r.method === "POST" && !r.path.includes("/load") && !r.path.endsWith("/profiles/compare")).length, 0);
  const evidence = { status: "M3_PHASE2_NATIVE_PASS", recordedAt: new Date().toISOString(), nativeBackend: true, ready, scenario, sessionId: sid,
    source: "MEMBER3_HTTP", inputBasis: before.backend.basis, comparison: group, frontendSnapshot: snapshot, requests, responses,
    errors: { unauthorized, stale: staleEvidence }, assertions: { threeBoundProfileJobs: true, worldUnchanged: true, noAcceptOrOfflinePlanningCall: true, terminalPollingStopped: true, refreshReadOnly: true },
    limitations: ["Phase 3 public proposal geometry and metrics adaptation pending", "Phase 4 Select/Accept pending", "Full --all migration acceptance unavailable"] };
  const serialized = JSON.stringify(evidence, null, 2); assert(!serialized.includes(token));
  await writeFile(new URL(`phase2-${scenario}-${stamp}.json`, out), serialized);
  await writeFile(new URL("phase2-latest.json", out), serialized);
  console.log(JSON.stringify({ status: evidence.status, sessionId: sid, comparisonId: group.comparison_id, verdict: group.outcome.comparison?.status ?? null, jobIds: group.jobs.map(j => j.job_id) }));
} finally { await browser.close(); }
