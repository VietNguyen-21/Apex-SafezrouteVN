import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
const key = "saferoute.phase1.dispatch.v1";
const results = [];
try {
  const admin = await browser.newPage();
  const driver = await browser.newPage();
  const errors = [];
  for (const page of [admin, driver]) page.on("pageerror", (error) => errors.push(error.message));
  await admin.setViewport({ width: 1440, height: 900 });
  await driver.setViewport({ width: 390, height: 844 });
  await admin.bringToFront();
  await admin.goto("http://127.0.0.1:5173/admin", { waitUntil: "domcontentloaded" });
  const accepted = await admin.evaluate(async () => {
    const { MockDispatchApi } = await import("/src/services/api/MockDispatchApi.ts");
    const api = new MockDispatchApi();
    const fresh = await api.resetDemoSession();
    if (fresh.decisionState.orders.length !== 3 || fresh.demo.availableEvents[0].status !== "READY_TO_TRIGGER") throw new Error("Fresh round is not S0 OFF");
    const proposals = await api.optimize();
    await api.selectAlternative(proposals.planState.proposedAlternatives[0].id);
    return api.acceptSelectedPlan();
  });
  await admin.reload({ waitUntil: "domcontentloaded" });
  await admin.waitForSelector("#toggle-urgent");
  assert.equal(await admin.$eval("#toggle-urgent", (el) => el.getAttribute("aria-checked")), "false");
  await driver.bringToFront();
  await driver.goto("http://127.0.0.1:5173/driver", { waitUntil: "domcontentloaded" });
  await driver.waitForSelector(".leaflet-container");
  for (const [on, orders] of [[true, 4], [false, 3], [true, 4], [false, 3]]) {
    await admin.bringToFront();
    await admin.click("#toggle-urgent");
    await admin.waitForFunction((on) => document.querySelector("#toggle-urgent")?.getAttribute("aria-checked") === String(on), {}, on);
    const snapshot = await admin.evaluate((key) => JSON.parse(localStorage.getItem(key)).snapshot, key);
    assert.equal(snapshot.decisionState.orders.length, orders);
    assert.equal(snapshot.planState.activeAcceptedPlanId, accepted.planState.activeAcceptedPlanId);
    assert.deepEqual(snapshot.planState.acceptedPlans, accepted.planState.acceptedPlans);
    assert.equal(await admin.$eval("#toggle-urgent", (el) => el.disabled), false);
    assert.equal(await admin.$eval("#toggle-driver", (el) => el.disabled), true);
    await driver.bringToFront();
    await driver.waitForSelector(".drv-banner--warn");
    assert.equal(await driver.$(".drv-banner--update"), null);
    results.push({ urgentOn: on, orders, activePlanUnchanged: true, crossTabStale: true });
  }
  await admin.bringToFront();
  await admin.reload({ waitUntil: "domcontentloaded" });
  await admin.waitForSelector("#toggle-urgent");
  assert.equal(await admin.$eval("#toggle-urgent", (el) => el.getAttribute("aria-checked")), "false");
  // Show V2's two accepted delivery legs through the actual development Settings control.
  await driver.bringToFront();
  await driver.click(".drv-bottom-nav button:last-child");
  await driver.waitForSelector("#drv-demo-vehicle");
  await driver.select("#drv-demo-vehicle", "V2");
  await driver.click(".drv-bottom-nav button:first-child");
  await driver.waitForSelector('[aria-label="Route legs"]');
  const colors = () => driver.$$eval(".leaflet-overlay-pane path", (paths) => paths.map((p) => [p.getAttribute("stroke"), p.getAttribute("stroke-opacity")]));
  assert.deepEqual(await colors(), [["#16a34a", "0.9"], ["#14532d", "0.9"]]);
  for (const width of [360, 390, 430]) {
    await driver.setViewport({ width, height: 844 });
    await driver.waitForFunction(() => Math.round(document.querySelector(".drv-map-card").getBoundingClientRect().width) > 0);
    const overflowPx = await driver.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth));
    assert.equal(overflowPx, 0);
    const legend = await driver.$eval('[aria-label="Route legs"]', (el) => el.textContent);
    assert.ok(legend.includes("O003") && legend.includes("O001"));
    await driver.screenshot({ path: `docs/evidence/driver-v2-legs-${width}.png` });
    results.push({ driverWidth: width, colors: await colors(), overflowPx });
  }
  await admin.evaluate(async () => {
    const { MockDispatchApi } = await import("/src/services/api/MockDispatchApi.ts");
    const api = new MockDispatchApi();
    const snapshot = await api.getSnapshot();
    const route = snapshot.planState.acceptedPlans[0].plan.vehiclePlans.find((v) => v.vehicleId === "V2");
    for (const id of route.orderedStops[0].orderIds) await api.pickupOrder({ vehicleId: "V2", orderId: id });
    const stop = route.orderedStops.find((s) => s.kind === "DELIVERY");
    for (const id of stop.orderIds) await api.deliverOrder({ vehicleId: "V2", orderId: id });
  });
  await driver.waitForFunction(() => document.querySelector(".leaflet-overlay-pane path.completed"));
  assert.deepEqual(await colors(), [["#16a34a", "0.35"], ["#14532d", "0.9"]]);
  results.push({ afterFirstDelivery: await colors(), stableLegColors: true });
  assert.deepEqual(errors, []);
  await writeFile("docs/evidence/urgent-driver-results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
