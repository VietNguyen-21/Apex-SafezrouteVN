import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";
import { enableAdminRoutes } from "./admin-route-controls.mjs";

const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
const results = [];
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto("http://127.0.0.1:5173/admin", { waitUntil: "domcontentloaded" });
  for (const scenario of ["S0", "S2", "S3", "S4"]) {
    const expected = await page.evaluate(async (scenarioId) => {
      const { MockDispatchApi } = await import("/src/services/api/MockDispatchApi.ts");
      const api = new MockDispatchApi();
      await api.loadScenario(scenarioId);
      const snapshot = await api.optimize();
      const alternatives = snapshot.planState.proposedAlternatives;
      if (alternatives.length !== 3 || alternatives.some((p) => p.content.provenance.source !== "Member 2 offline runtime")) throw new Error("Missing offline profile");
      if (snapshot.demo.availableEvents.some((e) => e.status !== "READY_TO_TRIGGER")) throw new Error("Premature event");
      const plan = alternatives[0].content;
      await api.selectAlternative(alternatives[0].id);
      await api.acceptSelectedPlan();
      const hydrated = await new MockDispatchApi().getSnapshot();
      if (JSON.stringify(hydrated.planState.acceptedPlans[0].plan) !== JSON.stringify(plan)) throw new Error("Hydration changed supplied plan");
      return {
        paths: plan.vehiclePlans.reduce((n, v) => n + new Set(v.routeSegments.filter((s) => !s.toStopId.endsWith("return-depot")).map((s) => JSON.stringify([s.fromStopId, s.toStopId]))).size, 0),
        driverPaths: new Set(plan.vehiclePlans.find((v) => v.vehicleId === "V1").routeSegments.filter((s) => !s.toStopId.endsWith("return-depot")).map((s) => JSON.stringify([s.fromStopId, s.toStopId]))).size,
        suppliedEdges: plan.vehiclePlans.reduce((n, v) => n + v.routeSegments.length, 0)
      };
    }, scenario);
    for (const route of ["admin", "driver"]) {
      await page.goto(`http://127.0.0.1:5173/${route}`, { waitUntil: "domcontentloaded" });
      if (route === "admin") {
        await page.waitForSelector('button[aria-label="Show V1 route"]');
        assert.equal(await page.$$eval(".leaflet-overlay-pane path", (paths) => paths.length), 0);
        await enableAdminRoutes(page);
      }
      await page.waitForSelector(".leaflet-overlay-pane path");
      const paths = route === "admin" ? expected.paths : expected.driverPaths;
      await page.waitForFunction((n) => document.querySelectorAll(".leaflet-overlay-pane path").length === n, {}, paths);
      assert.equal(await page.$(".route-geometry-notice"), null);
      const result = { scenario, route, renderedGroups: paths, suppliedEdges: expected.suppliedEdges, schematicNotice: false };
      results.push(result);
      console.log(JSON.stringify(result));
    }
  }
  await page.goto("http://127.0.0.1:5173/admin", { waitUntil: "domcontentloaded" });
  const fallback = await page.evaluate(async () => {
    const { MockDispatchApi } = await import("/src/services/api/MockDispatchApi.ts");
    const api = new MockDispatchApi();
    await api.loadScenario("S0");
    const initial = await api.optimize();
    await api.selectAlternative(initial.planState.proposedAlternatives[0].id);
    const accepted = await api.acceptSelectedPlan();
    await api.triggerFixtureEvent(accepted.demo.availableEvents.find((e) => e.type === "LOCAL_RAIN_WHAT_IF").id);
    const next = await api.optimize();
    if (next.planState.activeAcceptedPlanId !== accepted.planState.activeAcceptedPlanId) throw new Error("Optimize dispatched");
    if (next.planState.proposedAlternatives.some((p) => p.content.provenance.source === "Member 2 offline runtime")) throw new Error("Initial pack reused after event");
    await api.selectAlternative(next.planState.proposedAlternatives[0].id);
    await api.acceptSelectedPlan();
    return { scenario: "S0 + S4 (unsupported by pinned rain root)", schematicFallback: true, oldRoadPlanRetained: next.planState.acceptedPlans[0].plan.provenance.source === "Member 2 offline runtime" };
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await enableAdminRoutes(page);
  await page.waitForSelector(".route-geometry-notice");
  results.push(fallback);
  assert.equal(errors.length, 0, errors.join(" | "));
  await writeFile("docs/evidence/offline-route-results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(fallback));
} finally {
  await browser.close();
}
