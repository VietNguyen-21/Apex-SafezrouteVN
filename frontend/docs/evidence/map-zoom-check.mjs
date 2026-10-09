import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";
import { enableAdminRoutes } from "./admin-route-controls.mjs";

const output = process.argv[2] ?? "docs/evidence/map-zoom-results.json";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 900 });
  // Isolate route rendering from remote tile loading.
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (request.url().startsWith("https://tile.openstreetmap.org/")) void request.abort();
    else void request.continue();
  });
  await page.goto("http://127.0.0.1:5173/admin", { waitUntil: "domcontentloaded" });
  const results = [];
  for (const scenario of ["S0", "S2"]) {
    await page.evaluate(async (scenario) => {
      const { MockDispatchApi } = await import("/src/services/api/MockDispatchApi.ts");
      const api = new MockDispatchApi();
      await api.loadScenario(scenario);
      const snapshot = await api.optimize();
      await api.selectAlternative(snapshot.planState.proposedAlternatives[0].id);
      await api.acceptSelectedPlan();
      const proposals = await api.optimize();
      await api.selectAlternative(proposals.planState.proposedAlternatives[1].id);
    }, scenario);
    await page.reload({ waitUntil: "domcontentloaded" });
    await enableAdminRoutes(page);
    await page.waitForSelector(".leaflet-overlay-pane path");
    const client = await page.createCDPSession();
    await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const result = await page.evaluate(async () => {
      const map = document.querySelector(".leaflet-container");
      const frames = [];
      const longTasks = [];
      const observer = new PerformanceObserver((list) => longTasks.push(...list.getEntries().map((e) => e.duration)));
      observer.observe({ type: "longtask", buffered: false });
      let running = true;
      let previous;
      const frame = (now) => {
        if (previous != null) frames.push(now - previous);
        previous = now;
        if (running) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      const zoomIn = document.querySelector('button[aria-label="Zoom in"]');
      const zoomOut = document.querySelector('button[aria-label="Zoom out"]');
      const syncZoomMs = [];
      for (let i = 0; i < 8; i++) {
        const start = performance.now();
        (i % 2 ? zoomOut : zoomIn).click();
        syncZoomMs.push(performance.now() - start);
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      running = false;
      observer.disconnect();
      frames.sort((a, b) => a - b);
      return {
        svgPaths: map.querySelectorAll("path").length,
        canvasCount: map.querySelectorAll("canvas").length,
        p95FrameMs: frames[Math.floor(frames.length * 0.95)],
        worstFrameMs: Math.max(...frames),
        longTaskCount: longTasks.length,
        longestTaskMs: Math.max(0, ...longTasks),
        maxSyncZoomMs: Math.max(...syncZoomMs)
      };
    });
    await client.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    results.push({ scenario, cpuSlowdown: 4, ...result });
    console.log(JSON.stringify(results.at(-1)));
  }
  assert.deepEqual(errors, []);
  await writeFile(output, JSON.stringify(results, null, 2));
  if (process.env.ASSERT_FAST_ZOOM === "1") {
    for (const result of results) {
      assert.ok(result.p95FrameMs < 25, `${result.scenario}: p95 frame gap ${result.p95FrameMs} ms`);
      assert.ok(result.maxSyncZoomMs < 100, `${result.scenario}: zoom handler blocked for ${result.maxSyncZoomMs} ms`);
      assert.ok(result.worstFrameMs < 150, `${result.scenario}: ${result.worstFrameMs} ms frame gap`);
    }
  }
} finally {
  await browser.close();
}
