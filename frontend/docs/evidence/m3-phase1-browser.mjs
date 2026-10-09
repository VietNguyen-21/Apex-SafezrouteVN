import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const credentialsFile = process.env.M3_ACCESS_FILE;
assert(credentialsFile, "Set M3_ACCESS_FILE to the private native installation's dev_access.json (never copy it into the repo)");
const access = JSON.parse(await readFile(credentialsFile, "utf8"));
const token = access.credentials.find((item) => item.actor_id === "member4").token;
const base = "http://127.0.0.1:8000";
const responses = [], responseTasks = [], requests = [], errors = [];
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: !process.argv.includes("--show"), args: ["--no-sandbox", "--disable-gpu", "--no-first-run"], timeout: 20000 });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument((bearer) => { sessionStorage.setItem("saferoute.member3.bearer", bearer); }, token);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().startsWith(base)) requests.push({ method: request.method(), path: new URL(request.url()).pathname });
  });
  page.on("response", (response) => {
    if (response.url().startsWith(base)) responseTasks.push((async () => {
      if (response.request().method() === "OPTIONS") return;
      responses.push({ path: new URL(response.url()).pathname, status: response.status(), envelope: await response.json() });
    })());
  });
  await page.goto("http://127.0.0.1:5173/admin", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector('.admin-page[data-dispatch-source="MEMBER3_HTTP"]') || document.querySelector('[role="alert"]'));
  assert.equal(await page.$eval("body", (body) => body.querySelector('[role="alert"]')?.textContent ?? null), null);
  await page.click(".scenario-collapsible summary");
  await page.waitForFunction(() => !document.querySelector(".scenario-body select").disabled);
  await page.select(".scenario-body select", "S1");
  await page.waitForFunction(() => document.querySelector(".scenario-body select")?.value === "S1" && document.querySelectorAll(".order-queue .order-row").length === 8 && !document.querySelector(".scenario-body select").disabled);
  const snapshot = await page.evaluate(async () => {
    const { BackendDispatchApi } = await import("/src/services/api/BackendDispatchApi.ts");
    return new BackendDispatchApi().getSnapshot();
  });
  assert.equal(snapshot.decisionState.scenarioId, "S1");
  assert.equal(snapshot.decisionState.orders.length, 8);
  assert.equal(snapshot.decisionState.vehicles.length, 2);
  assert.equal(snapshot.decisionState.locations.length, 9);
  assert.equal(snapshot.backend.executionMode, "SIMULATED_REPLAY");
  assert.equal(snapshot.backend.realWorldObservation, false);
  assert.equal(snapshot.demoClock.now, "2026-09-27T21:00:00+07:00");
  assert.equal(snapshot.backend.executionView.accepted_trajectory, null);
  assert.deepEqual(snapshot.planState.acceptedPlans, []);
  assert.deepEqual(snapshot.planState.proposedAlternatives, []);
  const dom = await page.evaluate(() => ({ sessionId: document.querySelector(".admin-page").dataset.sessionId,
    source: document.querySelector(".admin-page").dataset.dispatchSource,
    orderIds: [...document.querySelectorAll(".order-id-badge")].map((item) => item.textContent),
    vehicles: [...document.querySelectorAll(".fleet-tbody .veh-cell")].map((item) => item.textContent.trim()),
    markerCount: document.querySelectorAll(".saferoute-map-marker").length,
    time: document.querySelector(".clock-display").textContent.trim(),
    acceptedRoutes: document.querySelectorAll('[aria-label="Accepted route"]').length,
    proposedRoutes: document.querySelectorAll('[aria-label="Proposed — not dispatched"]').length }));
  assert.equal(dom.sessionId, snapshot.decisionState.sessionId);
  assert.deepEqual(dom.orderIds, ["O001", "O002", "O003", "O004", "O005", "O006", "O007", "O008"]);
  assert.deepEqual(dom.vehicles, ["V1", "V2"]);
  assert.equal(dom.markerCount, 11);
  assert.equal(dom.acceptedRoutes + dom.proposedRoutes, 0);
  await page.screenshot({ path: "docs/evidence/m3-phase1-s1-admin.png" });

  // Poison with a VALID legacy MockDispatchApi world: S0, three orders, old mock session and a fake clock.
  const mockPoison = await page.evaluate(async () => {
    const { MockDispatchApi } = await import("/src/services/api/MockDispatchApi.ts");
    const mock = await new MockDispatchApi({ storage: { getItem: () => null, setItem: () => {} } }).getSnapshot();
    mock.decisionState.sessionId = "old-mock-physical-authority";
    mock.demoClock.now = "2026-09-27T22:22:00+07:00";
    const stored = JSON.stringify({ schemaVersion: 1, snapshot: mock });
    localStorage.setItem("saferoute.phase1.dispatch.v1", stored);
    return { bytes: stored.length, scenarioId: mock.decisionState.scenarioId, orders: mock.decisionState.orders.length };
  });
  assert.equal(mockPoison.orders, 3);
  const beforeRefresh = requests.length;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('.admin-page[data-dispatch-source="MEMBER3_HTTP"]');
  const refreshed = await page.evaluate(() => ({ sessionId: document.querySelector(".admin-page").dataset.sessionId,
    orders: document.querySelectorAll(".order-queue .order-row").length, vehicles: document.querySelectorAll(".fleet-tbody .fleet-row").length,
    time: document.querySelector(".clock-display").textContent, storedMock: JSON.parse(localStorage.getItem("saferoute.phase1.dispatch.v1")) }));
  assert.equal(refreshed.sessionId, snapshot.decisionState.sessionId);
  assert.equal(refreshed.orders, 8);
  assert.equal(refreshed.vehicles, 2);
  assert(refreshed.time.includes(snapshot.demoClock.now));
  assert.equal(refreshed.storedMock.snapshot.decisionState.sessionId, "old-mock-physical-authority");
  assert.equal(requests.slice(beforeRefresh).filter((item) => item.method === "POST").length, 0);
  assert(requests.slice(beforeRefresh).some((item) => item.path.endsWith("/state")));
  await page.screenshot({ path: "docs/evidence/m3-phase1-s1-refreshed.png" });
  await Promise.all(responseTasks);
  assert.deepEqual(errors, []);
  const sid = snapshot.decisionState.sessionId;
  const latest = (suffix) => responses.filter((item) => item.path === `/api/sessions/${sid}/${suffix}`).at(-1).envelope.data;
  assert.deepEqual(latest("state").basis, snapshot.backend.basis);
  assert.deepEqual(latest("orders").orders.map((item) => item.order_id), dom.orderIds);
  assert.deepEqual(latest("vehicles").vehicles.map((item) => item.vehicle_id), dom.vehicles);
  assert.deepEqual(latest("locations").locations.map((item) => [item.location_id, item.coordinates]),
    snapshot.decisionState.locations.map((item) => [item.id, [item.longitude, item.latitude]]));
  const report = { status: "M3_PHASE1_BROWSER_PASS", nativeBackend: true, source: "MEMBER3_HTTP", sessionId: sid,
    scenarioId: "S1", orderCount: 8, vehicleCount: 2, locationCount: 9, markerCount: 11, currentTime: snapshot.demoClock.now,
    executionMode: snapshot.backend.executionMode, realWorldObservation: false, buildSha256: snapshot.backend.basis.build_sha256,
    basis: snapshot.backend.basis, dom, refresh: { sameSession: true, rereadM3: true, noNewLoadPost: true, oldMockIgnored: true, oldMockPreserved: true },
    acceptedPlanCount: 0, proposedPlanCount: 0, routeCount: 0, browserErrors: errors, requests };
  await writeFile("docs/evidence/m3-phase1-browser-results.json", JSON.stringify(report, null, 2));
  await writeFile("docs/evidence/m3-phase1-http-responses.json", JSON.stringify(responses, null, 2));
  await writeFile("docs/evidence/m3-phase1-snapshot.json", JSON.stringify(snapshot, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
