// Independent Phase 3 KPI gate. This deliberately cannot claim forecast geometry acceptance.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

assert(process.env.M3_ACCESS_FILE, "M3_ACCESS_FILE must name the private native credential file");
const access = JSON.parse(await readFile(process.env.M3_ACCESS_FILE, "utf8"));
const token = access.credentials.find(c => c.actor_id === "member4")?.token;
assert(token);
const base = process.env.M3_BASE_URL ?? "http://127.0.0.1:8000";
const front = process.env.M3_FRONTEND_URL ?? "http://127.0.0.1:5173";
const previous = JSON.parse(await readFile(new URL("./phase2-latest.json", import.meta.url), "utf8"));
const session = previous.responses.find(r => r.path.endsWith("/load") && r.envelope.data.session.session_id === previous.sessionId).envelope.data.session;
const pointer = { schemaVersion: 1, session, comparison: { id: previous.comparison.comparison_id, inputBasis: previous.inputBasis } };
const get = async path => {
  const response = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(125000) });
  assert(response.ok); const envelope = await response.json(); assert.equal(envelope.status, "OK"); return envelope;
};
const ready = await get("/ready"); assert.equal(ready.data.ready, true); assert.equal(ready.data.checks.worker, "PASS");
const before = await get(`/api/sessions/${session.session_id}/state`);
const comparison = await get(`/api/sessions/${session.session_id}/profiles/comparisons/${pointer.comparison.id}`);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox", "--disable-gpu", "--no-first-run"] });
try {
  const page = await browser.newPage(); page.setDefaultTimeout(125000); await page.setViewport({ width: 1440, height: 1100 });
  const requests = [], errors = [];
  await page.evaluateOnNewDocument(({ token, base, pointer }) => {
    sessionStorage.setItem("saferoute.member3.bearer", token);
    localStorage.setItem(`saferoute.member3.session.v1:${base}`, JSON.stringify(pointer));
  }, { token, base, pointer });
  page.on("request", r => { if (r.url().startsWith(base)) requests.push({ path: new URL(r.url()).pathname, method: r.method() }); });
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${front}/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(id => document.querySelector(".admin-page")?.dataset.comparisonId === id, {}, pointer.comparison.id);
  const projected = await page.evaluate(async () => {
    const { BackendDispatchApi } = await import("/src/services/api/BackendDispatchApi.ts");
    const { comparisonMetrics, formatMetric } = await import("/src/integrations/member3/metricsAdapter.ts");
    const snapshot = await new BackendDispatchApi().getSnapshot();
    return { snapshot, expected: snapshot.backend.comparison.jobs.map(child => {
      const metrics = comparisonMetrics(snapshot.backend.comparison, child.profile, snapshot.backend.basis);
      return { profile: child.profile, metrics, text: metrics && [formatMetric(metrics, "total_travel_time_s", "min"), formatMetric(metrics, "total_cost_vnd"), formatMetric(metrics, "total_exposure")] };
    }) };
  });
  assert.deepEqual(projected.snapshot.backend.basis, before.data.basis);
  for (const item of projected.expected) {
    assert(item.metrics); const wire = comparison.data.outcome.comparison.jobs.find(j => j.profile === item.profile);
    for (const [key, value] of Object.entries(wire.metrics)) assert.equal(item.metrics.values[key], value);
    const card = await page.$eval(`.alt-card:has(.alt-title-${item.profile.toLowerCase()})`, el => el.textContent);
    for (const text of item.text) assert(card.includes(text));
    assert(card.includes("MEMBER3_HTTP · FORECAST_ONLY")); assert(card.includes("Fuel cost: —"));
  }
  assert.equal(projected.snapshot.planState.acceptedExecution, null);
  assert.deepEqual(projected.snapshot.planState.proposedAlternatives, []);
  assert.equal(projected.snapshot.backend.metrics.observed.values.distance_m, null);
  for (const width of [1280, 1440, 1920]) {
    await page.setViewport({ width, height: 1100 });
    const overflow = await page.$$eval('[data-metric-scope="FORECAST_ONLY"] .alt-metric-item', els => els.filter(el => {
      const card = el.closest('.alt-card').getBoundingClientRect();
      const value = el.querySelector('strong').getBoundingClientRect();
      return el.scrollWidth > el.clientWidth + 1 || value.right > card.right + 1 || value.left < card.left - 1;
    }).map(el => el.textContent));
    assert.deepEqual(overflow, [], `KPI overflow at ${width}px`);
  }
  await page.setViewport({ width: 1440, height: 1100 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(id => document.querySelector(".admin-page")?.dataset.comparisonId === id, {}, pointer.comparison.id);
  const after = await get(`/api/sessions/${session.session_id}/state`);
  assert.deepEqual(after.data, before.data);
  assert(requests.every(r => ["GET", "OPTIONS"].includes(r.method))); assert.deepEqual(errors, []);
  await page.screenshot({ path: new URL("./phase3-scopes-native.png", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), fullPage: true });
  const receipt = { status: "M3_PHASE3_SCOPED_KPI_NATIVE_PASS", phase3Complete: false, recordedAt: new Date().toISOString(), ready, sessionId: session.session_id,
    before, comparison, projected, after, requests, errors,
    assertions: ["API and worker ready", "public comparison metrics equal adapter and rendered cards", "separate execution scopes with null observed values", "native KPI bounds fit cards at 1280/1440/1920px", "refresh preserves session and comparison", "read-only GET/OPTIONS only", "world unchanged"],
    limitations: ["Forecast geometry public contract pending; full Phase 3 is not accepted", "Accepted geometry tested with public contract fixtures, not a new native Accept/replay run"] };
  await writeFile(new URL("./phase3-scopes-native.json", import.meta.url), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ status: receipt.status, phase3Complete: false, sessionId: session.session_id }));
} finally { await browser.close(); }
