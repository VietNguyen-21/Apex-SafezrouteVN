import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";
import { enableAdminRoutes } from "./admin-route-controls.mjs";

console.log("S1 browser: launch");
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox", "--disable-gpu", "--no-first-run"], timeout: 20000 });
const storageKey = "saferoute.phase1.dispatch.v1";
const results = [];
const errors = [];
try {
  const admin = await browser.newPage();
  console.log("S1 browser: Admin page");
  admin.on("pageerror", (error) => errors.push(error.message));
  await admin.setViewport({ width: 1440, height: 900 });
  await admin.goto("http://127.0.0.1:5173/admin", { waitUntil: "domcontentloaded" });
  await admin.evaluate((key) => localStorage.removeItem(key), storageKey);
  await admin.reload({ waitUntil: "domcontentloaded" });
  await admin.waitForSelector(".scenario-collapsible summary");
  await admin.click(".scenario-collapsible summary");
  assert.deepEqual(await admin.$$eval(".scenario-body select option", (options) => options.map((option) => option.value)), ["S0", "S1", "S2", "S3", "S4"]);
  await admin.select(".scenario-body select", "S1");
  console.log("S1 browser: selected S1");
  await admin.waitForFunction((key) => JSON.parse(localStorage.getItem(key))?.snapshot.decisionState.scenarioId === "S1", {}, storageKey);
  const loaded = await admin.evaluate((key) => JSON.parse(localStorage.getItem(key)).snapshot, storageKey);
  assert.equal(loaded.decisionState.orders.length, 8);
  assert.deepEqual(loaded.decisionState.vehicles.map((v) => [v.id, v.capacityKg]), [["V1", 15], ["V2", 15]]);
  assert.deepEqual(loaded.decisionState.events, []);
  assert.deepEqual(loaded.planState.proposedAlternatives, []);
  assert.deepEqual(loaded.planState.acceptedPlans, []);
  assert.equal(loaded.planState.activeAcceptedPlanId, null);
  assert.deepEqual(loaded.executionState, { activePlanId: null, progressByPlanId: {} });
  assert.equal(loaded.demoClock.now, "2026-09-27T21:00:00+07:00");
  assert.deepEqual(await admin.$$eval("#toggle-urgent, #toggle-driver, #toggle-rain", (buttons) => buttons.map((b) => [b.getAttribute("aria-checked"), b.disabled])), [["false", true], ["false", true], ["false", true]]);
  assert.deepEqual(await admin.$$eval('button[aria-label="Show V1 route"], button[aria-label="Show V2 route"]', (buttons) => buttons.map((b) => b.getAttribute("aria-checked"))), ["false", "false"]);
  assert.equal(await admin.$eval(".current-queue-header", (el) => el.textContent.includes("8")), true);
  const kpis = await admin.$$eval(".kpi-card", (cards) => cards.slice(0, 2).map((card) => ({
    label: card.querySelector(".kpi-label").textContent.trim(),
    value: card.querySelector(".kpi-value-row").firstElementChild.textContent.replace(/\s/g, "")
  })));
  assert.deepEqual(kpis, [{ label: "TOTAL ORDERS", value: "8" }, { label: "ACTIVE VEHICLES", value: "2/2" }]);
  results.push({ step: "Load S1", orders: 8, vehicles: 2, capacitiesKg: [15, 15], events: 0, cleanSession: true, routesOff: true, kpis });

  await admin.click('button[aria-label="Optimize"]');
  console.log("S1 browser: Optimize");
  await admin.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).snapshot.planState.proposedAlternatives.length === 3, {}, storageKey);
  const driver = await browser.newPage();
  driver.on("pageerror", (error) => errors.push(error.message));
  await driver.setViewport({ width: 390, height: 844 });
  await driver.goto("http://127.0.0.1:5173/driver", { waitUntil: "domcontentloaded" });
  await driver.waitForSelector(".leaflet-container");
  assert.equal(await driver.$$eval(".leaflet-overlay-pane path", (paths) => paths.length), 0);
  assert.ok((await driver.$eval("body", (el) => el.innerText)).includes("No dispatch plan has been assigned yet."));

  for (const profile of ["FASTEST", "BALANCED", "SAFER"]) {
    console.log(`S1 browser: ${profile}`);
    await admin.bringToFront();
    await admin.click(`button[aria-label="Select ${profile}"]`);
    await admin.waitForFunction((key, profile) => {
      const state = JSON.parse(localStorage.getItem(key)).snapshot.planState;
      return state.proposedAlternatives.find((p) => p.id === state.selectedAlternativeId)?.content.profile === profile;
    }, {}, storageKey, profile);
    console.log(`S1 browser: ${profile} selected`);
    await enableAdminRoutes(admin);
    console.log(`S1 browser: ${profile} routes enabled`);
    const source = await admin.evaluate(async (key) => {
      const snapshot = JSON.parse(localStorage.getItem(key)).snapshot;
      const plan = snapshot.planState.proposedAlternatives.find((p) => p.id === snapshot.planState.selectedAlternativeId).content;
      const { default: bundle } = await import("/src/mocks/data/member2-road-packs.json");
      const witness = bundle.packs.find((p) => p.scenarioId === "S1" && p.phase === "INITIAL").alternatives.find((p) => p.profile === plan.profile);
      return { profile: plan.profile, provenance: plan.provenance, status: witness.status,
        served: witness.served_orders.length, unserved: witness.unserved_orders.length,
        vehicles: plan.vehiclePlans.map((vehicle) => ({ vehicleId: vehicle.vehicleId,
          segments: vehicle.routeSegments.map((segment) => ({ source: segment.geometrySource, coordinates: segment.geometry.coordinates })),
          sourceEdges: witness.vehicle_routes.find((route) => route.vehicle_id === vehicle.vehicleId)?.actions.filter((action) => action.kind === "EDGE").map((action) => action.geometry) ?? [] })) };
    }, storageKey);
    console.log(`S1 browser: ${profile} source read`);
    assert.equal(source.provenance.source, "Member 2 offline runtime");
    assert.equal(source.provenance.scenarioId, "S1");
    assert.equal(source.served + source.unserved, 8);
    for (const vehicle of source.vehicles) {
      assert.ok(vehicle.segments.length > 0);
      assert.ok(vehicle.segments.every((s) => s.source === "MEMBER2_SUPPLIED"));
      assert.deepEqual(vehicle.segments.map((s) => s.coordinates), vehicle.sourceEdges);
    }
    assert.ok(source.vehicles.some((v) => v.segments.some((s) => s.coordinates.length > 2)));
    await admin.waitForSelector(".leaflet-overlay-pane path");
    await new Promise((resolve) => setTimeout(resolve, 600));
    const display = await admin.evaluate(() => {
      const map = document.querySelector(".leaflet-container").getBoundingClientRect();
      const paths = [...document.querySelectorAll(".leaflet-overlay-pane path")];
      const markers = [...document.querySelectorAll(".saferoute-map-marker")];
      return { overflowPx: document.documentElement.scrollWidth - innerWidth, mapWidth: map.width,
        groups: paths.length, colors: paths.map((p) => p.getAttribute("stroke")), markers: markers.length,
        markersFit: markers.every((marker) => { const r = marker.getBoundingClientRect(); return r.right >= map.left && r.left <= map.right && r.bottom >= map.top && r.top <= map.bottom; }),
        routesFit: paths.every((path) => { const r = path.getBoundingClientRect(); return r.left >= map.left - 2 && r.right <= map.right + 2 && r.top >= map.top - 2 && r.bottom <= map.bottom + 2; }),
        schematicWarning: document.body.innerText.includes("Schematic demo routes") };
    });
    assert.equal(display.overflowPx, 0);
    assert.equal(display.schematicWarning, false);
    assert.ok(display.mapWidth > 0 && display.groups > 0 && display.markers > 0 && display.markersFit && display.routesFit);
    assert.ok(display.colors.includes("#2563eb") && display.colors.includes("#16a34a"));
    assert.equal(await driver.$$eval(".leaflet-overlay-pane path", (paths) => paths.length), 0);
    const result = { profile, status: source.status, served: source.served, unserved: source.unserved,
      edgeCount: source.vehicles.reduce((n, vehicle) => n + vehicle.segments.length, 0),
      provenance: source.provenance, exactSuppliedCoordinates: true, geometrySource: "MEMBER2_SUPPLIED", driverBeforeAcceptRoutes: 0, ...display };
    results.push(result);
    console.log(JSON.stringify(result));
    await admin.screenshot({ path: `docs/evidence/s1-admin-${profile.toLowerCase()}.png` });
  }
  await admin.click('button[aria-label="Select FASTEST"]');
  await admin.click('button[aria-label="Accept selected plan"]');
  await admin.waitForFunction((key) => Boolean(JSON.parse(localStorage.getItem(key)).snapshot.planState.activeAcceptedPlanId), {}, storageKey);
  await driver.bringToFront();
  await driver.waitForSelector(".leaflet-overlay-pane path");
  const accepted = await driver.evaluate((key) => {
    const s = JSON.parse(localStorage.getItem(key)).snapshot;
    const plan = s.planState.acceptedPlans.find((p) => p.id === s.planState.activeAcceptedPlanId).plan;
    return { scenarioId: s.decisionState.scenarioId, active: s.executionState.activePlanId,
      planId: s.planState.activeAcceptedPlanId, profile: plan.profile,
      source: plan.provenance.source,
      allSegmentsSupplied: plan.vehiclePlans.every((v) => v.routeSegments.every((r) => r.geometrySource === "MEMBER2_SUPPLIED")),
      renderedRouteGroups: document.querySelectorAll(".leaflet-overlay-pane path").length,
      overflowPx: document.documentElement.scrollWidth - innerWidth,
      schematicWarning: document.body.innerText.includes("Schematic demo routes") };
  }, storageKey);
  assert.equal(accepted.scenarioId, "S1");
  assert.equal(accepted.profile, "FASTEST");
  assert.equal(accepted.active, accepted.planId);
  assert.equal(accepted.source, "Member 2 offline runtime");
  assert.equal(accepted.allSegmentsSupplied, true);
  assert.ok(accepted.renderedRouteGroups > 0);
  assert.equal(accepted.overflowPx, 0);
  assert.equal(accepted.schematicWarning, false);
  await driver.screenshot({ path: "docs/evidence/s1-driver-accepted.png" });
  results.push({ step: "Driver accepted-only cross-tab", ...accepted });
  assert.deepEqual(errors, []);
  await writeFile("docs/evidence/s1-road-results.json", JSON.stringify({ results, errors }, null, 2));
} finally { await browser.close(); }
