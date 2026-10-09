import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { writeFile } from "node:fs/promises";

const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto("http://127.0.0.1:5173/admin", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    const { MockDispatchApi } = await import("/src/services/api/MockDispatchApi.ts");
    const api = new MockDispatchApi();
    await api.loadScenario("S0");
    const snapshot = await api.optimize();
    await api.selectAlternative(snapshot.planState.proposedAlternatives[0].id);
    await api.acceptSelectedPlan();
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".saferoute-marker--vehicle");
  const rectangles = await page.$$eval(".saferoute-map-marker", (elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { label: element.innerText, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  }));
  const v1 = rectangles.find((r) => r.label === "V1");
  const v2 = rectangles.find((r) => r.label === "V2");
  console.log(JSON.stringify({ v1, v2, overlap: v1.left < v2.right && v2.left < v1.right && v1.top < v2.bottom && v2.top < v1.bottom }));
  assert.ok(v1 && v2);
  assert.ok(v1.right < v2.left || v2.right < v1.left, "Coincident vehicle badges overlap");
  await page.screenshot({ path: "docs/evidence/admin-vehicle-markers.png" });
  await writeFile("docs/evidence/vehicle-marker-results.json", JSON.stringify(rectangles, null, 2));
} finally {
  await browser.close();
}
