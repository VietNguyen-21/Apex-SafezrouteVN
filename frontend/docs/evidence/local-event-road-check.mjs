import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";
import { enableAdminRoutes } from "./admin-route-controls.mjs";

const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
const results = [];
try {
  console.log("Browser started");
  const admin = await browser.newPage();
  const driver = await browser.newPage();
  const errors = [];
  for (const page of [admin, driver]) page.on("pageerror", (e) => errors.push(e.message));
  await admin.setViewport({ width: 1440, height: 900 });
  await driver.setViewport({ width: 390, height: 844 });
  for (const [scenario, event] of [["S0", "S2-E1"], ["S0", "S3-E1"], ["S2", "S2-E1"], ["S3", "S3-E1"], ["S4", "S4-E1"]]) {
    console.log(JSON.stringify({ scenario, event, step: "initial" }));
    await admin.bringToFront();
    await admin.goto("http://127.0.0.1:5173/admin", { waitUntil: "domcontentloaded" });
    const oldId = await admin.evaluate(async (scenario) => {
      const { MockDispatchApi } = await import("/src/services/api/MockDispatchApi.ts");
      const api = new MockDispatchApi();
      await api.loadScenario(scenario);
      const before = await api.optimize();
      await api.selectAlternative(before.planState.proposedAlternatives[1].id);
      return (await api.acceptSelectedPlan()).planState.activeAcceptedPlanId;
    }, scenario);
    await driver.bringToFront();
    await driver.goto("http://127.0.0.1:5173/driver", { waitUntil: "domcontentloaded" });
    await driver.waitForSelector(".leaflet-container");
    console.log(JSON.stringify({ scenario, event, step: "trigger" }));
    const proposed = await admin.evaluate(async (event) => {
      const { MockDispatchApi } = await import("/src/services/api/MockDispatchApi.ts");
      const api = new MockDispatchApi();
      const accepted = await api.getSnapshot();
      await api.triggerFixtureEvent(event);
      const result = await api.optimize();
      const proposal = result.planState.proposedAlternatives[0];
      if (proposal.content.provenance.integrationMode !== "LOCAL_MANUAL_ANCHOR") throw new Error("No matched manual event pack");
      if (JSON.stringify(result.planState.acceptedPlans) !== JSON.stringify(accepted.planState.acceptedPlans)) throw new Error("History changed before Accept");
      if (result.planState.activeAcceptedPlanId !== accepted.planState.activeAcceptedPlanId) throw new Error("Optimize dispatched");
      const selected = await api.selectAlternative(proposal.id);
      const { createAdminMapPresentation } = await import("/src/admin/adminMapPresentation.ts");
      const presentation = createAdminMapPresentation(selected, proposal, ["V1", "V2"]);
      return { oldId: accepted.planState.activeAcceptedPlanId, groups: presentation.legs.length + (presentation.scene.rain ? 1 : 0),
        orders: result.decisionState.orders.length, unserved: proposal.content.unserved,
        edges: proposal.content.vehiclePlans.reduce((n, v) => n + v.routeSegments.length, 0) };
    }, event);
    assert.equal(proposed.oldId, oldId);
    await driver.waitForFunction((id) => JSON.parse(localStorage.getItem("saferoute.phase1.dispatch.v1")).snapshot.planState.activeAcceptedPlanId === id, {}, oldId);
    assert.equal(await driver.$(".drv-banner--update"), null);
    await admin.bringToFront();
    await admin.reload({ waitUntil: "domcontentloaded" });
    console.log(JSON.stringify({ scenario, event, step: "preview", groups: proposed.groups }));
    await enableAdminRoutes(admin);
    console.log(JSON.stringify(await admin.evaluate(() => ({ paths: document.querySelectorAll(".leaflet-overlay-pane path").length, source: document.querySelector('[aria-label="Route visibility"]')?.textContent }))));
    await admin.waitForFunction((n) => document.querySelectorAll(".leaflet-overlay-pane path").length === n, { timeout: 5000 }, proposed.groups);
    assert.equal(await admin.$(".route-geometry-notice"), null);
    assert.equal(await admin.$(".di-provenance"), null);
    assert.equal(await admin.$$eval(".di-card", (cards) => cards.some((c) => /Plan Accepted|Dispatched to drivers/.test(c.innerText))), false);
    if (scenario === "S0" && event === "S2-E1") await admin.screenshot({ path: "docs/evidence/admin-urgent-roads.png" });
    const newId = await admin.evaluate(async () => {
      const { MockDispatchApi } = await import("/src/services/api/MockDispatchApi.ts");
      const api = new MockDispatchApi();
      return (await api.acceptSelectedPlan()).planState.activeAcceptedPlanId;
    });
    assert.notEqual(newId, oldId);
    await driver.bringToFront();
    await driver.waitForSelector(".drv-banner--update");
    assert.equal(await driver.$eval(".drv-banner--update", (e) => e.textContent.includes("Route has been updated.")), true);
    assert.equal(await driver.$(".route-geometry-notice"), null);
    for (const page of [admin, driver]) assert.equal(await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth)), 0);
    if (scenario === "S0" && event === "S2-E1") await driver.screenshot({ path: "docs/evidence/driver-urgent-roads.png" });
    const result = { scenario, event, ...proposed, crossTabUpdatesOnlyAfterAccept: true, overflowPx: 0, schematic: false };
    results.push(result);
    console.log(JSON.stringify(result));
  }
  assert.deepEqual(errors, []);
  await writeFile("docs/evidence/local-event-road-results.json", JSON.stringify(results, null, 2));
} finally {
  const closed = await Promise.race([browser.close().then(() => true), new Promise((resolve) => setTimeout(() => resolve(false), 3000))]);
  if (!closed) browser.process()?.kill();
}
