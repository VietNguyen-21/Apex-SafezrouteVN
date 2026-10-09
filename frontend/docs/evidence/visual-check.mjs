import puppeteer from "puppeteer-core";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { enableAdminRoutes } from "./admin-route-controls.mjs";

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--no-sandbox"]
});

try {
  const results = [];
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:5173/admin", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    const { MockDispatchApi } = await import("/src/services/api/MockDispatchApi.ts");
    const api = new MockDispatchApi();
    await api.loadScenario("S0");
    const optimized = await api.optimize();
    await api.selectAlternative(optimized.planState.proposedAlternatives[0].id);
    await api.acceptSelectedPlan();
  });
  for (const [route, widths] of [["admin", [1280, 1440]], ["driver", [360, 390, 430]]]) {
    for (const width of widths) {
      await page.setViewport({ width, height: route === "admin" ? 900 : 844, deviceScaleFactor: 1 });
      await page.goto(`http://127.0.0.1:5173/${route}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".leaflet-container");
      await page.waitForFunction(() => (document.querySelector(".leaflet-container")?.getBoundingClientRect().width ?? 0) > 0);
      if (route === "admin") {
        await page.waitForSelector('button[aria-label="Show V1 route"]');
        assert.equal(await page.$$eval(".leaflet-overlay-pane path", (paths) => paths.length), 0);
        await page.screenshot({ path: `docs/evidence/admin-${width}-default.png` });
        await enableAdminRoutes(page);
      }
      await new Promise((resolve) => setTimeout(resolve, 900));
      try {
        await page.waitForFunction(() => (document.querySelector(".leaflet-container")?.getBoundingClientRect().width ?? 0) > 0 && document.querySelectorAll(".leaflet-overlay-pane path").length > 0, { timeout: 5000 });
      } catch (error) {
        await writeFile("docs/evidence/viewport-diagnostic.html", await page.content());
        await page.screenshot({ path: "docs/evidence/viewport-diagnostic.png" });
        console.log(JSON.stringify({ url: page.url(), body: await page.evaluate(() => document.body.innerText.slice(0, 1000)) }));
        console.log(JSON.stringify({ route, width, errors, diagnostics: await page.evaluate(() => [...document.querySelectorAll(".leaflet-container")].map((el) => ({ className: el.className, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height, parent: el.parentElement.className, parentWidth: el.parentElement.getBoundingClientRect().width, parentHeight: el.parentElement.getBoundingClientRect().height, display: getComputedStyle(el).display, position: getComputedStyle(el).position, inset: getComputedStyle(el).inset }))) }));
        throw error;
      }
      const status = await page.evaluate(() => ({
        overflowPx: document.documentElement.scrollWidth - window.innerWidth,
        mapWidth: Math.round(document.querySelector(".leaflet-container")?.getBoundingClientRect().width ?? 0),
        routePaths: document.querySelectorAll(".leaflet-overlay-pane path").length,
        markers: document.querySelectorAll(".saferoute-map-marker").length,
        tileWarning: Boolean(document.querySelector(".tile-warning, .drv-tile-warning")),
        schematicNotice: document.querySelector(".route-geometry-notice")?.textContent.trim(),
        pageText: document.body.innerText.includes("Demo time")
      }));
      assert.equal(status.overflowPx, 0);
      assert.ok(status.mapWidth > 0 && status.routePaths > 0 && status.markers > 0);
      assert.equal(status.schematicNotice, undefined);
      await page.screenshot({ path: `docs/evidence/${route}-${width}.png`, fullPage: false });
      console.log(JSON.stringify({ route, width, ...status }));
      results.push({ route, width, ...status });
    }
  }
  const fallbackPage = await browser.newPage();
  await fallbackPage.setCacheEnabled(false);
  await fallbackPage.setRequestInterception(true);
  fallbackPage.on("request", (request) => {
    if (request.url().startsWith("https://tile.openstreetmap.org/")) void request.abort();
    else void request.continue();
  });
  await fallbackPage.setViewport({ width: 1440, height: 900 });
  await fallbackPage.goto("http://127.0.0.1:5173/admin", { waitUntil: "domcontentloaded" });
  await enableAdminRoutes(fallbackPage);
  await fallbackPage.waitForSelector(".tile-warning", { timeout: 10000 });
  const fallback = await fallbackPage.evaluate(() => ({
    warning: document.querySelector(".tile-warning")?.textContent,
    routePaths: document.querySelectorAll(".leaflet-overlay-pane path").length,
    markers: document.querySelectorAll(".saferoute-map-marker").length
  }));
  await fallbackPage.screenshot({ path: "docs/evidence/admin-tile-fallback.png", fullPage: false });
  console.log(JSON.stringify({ route: "admin", tileFailure: true, ...fallback }));
  assert.equal(fallback.routePaths, 3);
  assert.equal(fallback.markers, 6);
  results.push({ route: "admin", tileFailure: true, ...fallback });
  if (errors.length) throw new Error(`Browser errors: ${errors.join(" | ")}`);
  await writeFile("docs/evidence/visual-results.json", JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
