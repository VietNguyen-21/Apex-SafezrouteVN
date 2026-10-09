import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
const results = [];
try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:5173/admin", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    const { MockDispatchApi } = await import("/src/services/api/MockDispatchApi.ts");
    const api = new MockDispatchApi();
    await api.loadScenario("S0");
    const snapshot = await api.optimize();
    await api.selectAlternative(snapshot.planState.proposedAlternatives[0].id);
    await api.acceptSelectedPlan();
  });
  for (const width of [1280, 1440]) {
    await page.setViewport({ width, height: 900 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('button[aria-label="Show V1 route"]');
    const stored = await page.evaluate(() => JSON.stringify(localStorage));
    for (const ids of [[], ["V1"], ["V2"], ["V1", "V2"], []]) {
      for (const id of ["V1", "V2"]) {
        const selector = `button[aria-label="Show ${id} route"]`;
        if (await page.$eval(selector, (el) => el.getAttribute("aria-checked")) !== String(ids.includes(id))) await page.click(selector);
      }
      const layout = await page.evaluate(() => {
        const section = document.querySelector(".route-visibility").getBoundingClientRect();
        const panel = document.querySelector(".panel-di").getBoundingClientRect();
        const heading = document.querySelector(".route-visibility h3").getBoundingClientRect();
        return {
          headingVisible: heading.top >= section.top && heading.bottom <= panel.bottom,
          switchesVisible: [...document.querySelectorAll('.route-visibility [role="switch"]')].every((el) => {
            const r = el.getBoundingClientRect();
            return r.top >= section.top && r.bottom <= panel.bottom && r.width >= 30;
          }),
          paths: document.querySelectorAll(".leaflet-overlay-pane path").length,
          legendHeight: document.querySelector(".route-visibility-legends")?.getBoundingClientRect().height ?? 0,
          markers: document.querySelectorAll(".saferoute-map-marker").length,
          overflowPx: document.documentElement.scrollWidth - innerWidth
        };
      });
      assert.equal(layout.headingVisible, true, `${width}: heading hidden with ${ids}`);
      assert.equal(layout.switchesVisible, true, `${width}: switches hidden with ${ids}`);
      if (ids.length) assert.ok(layout.legendHeight >= 25, `${width}: no visible leg legend (${JSON.stringify(layout)})`);
      assert.equal(layout.paths, (ids.includes("V1") ? 1 : 0) + (ids.includes("V2") ? 2 : 0));
      const strokes = await page.$$eval(".leaflet-overlay-pane path", (paths) => paths.map((p) => p.getAttribute("stroke")));
      assert.deepEqual(strokes, [...(ids.includes("V1") ? ["#2563eb"] : []), ...(ids.includes("V2") ? ["#16a34a", "#14532d"] : [])]);
      assert.equal(await page.$eval(".route-visibility", (el) => el.textContent.includes("Return to depot")), false);
      assert.equal(layout.markers, 6);
      assert.equal(layout.overflowPx, 0);
      assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), stored);
      results.push({ width, enabled: ids, ...layout });
    }
  }
  await writeFile("docs/evidence/admin-map-ux-results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
