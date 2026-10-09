import { writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:5173/admin", { waitUntil: "domcontentloaded" });
  const worlds = await page.evaluate(async () => {
    const { MockStateEngine } = await import("/src/mocks/engine/MockStateEngine.ts");
    const result = [];
    for (const [scenario, event] of [["S0", "S2-E1"], ["S0", "S3-E1"], ["S0", "S4-E1"], ["S2", "S2-E1"], ["S3", "S3-E1"], ["S4", "S4-E1"]]) {
      const engine = new MockStateEngine();
      engine.loadScenario(scenario);
      const proposed = engine.optimize();
      engine.selectAlternative(proposed.planState.proposedAlternatives[1].id);
      engine.acceptSelectedPlan();
      engine.triggerFixtureEvent(event);
      // Match the forecast time of the first Re-optimize action.
      const snapshot = engine.advanceDemoClock(1);
      result.push({ name: `${scenario}-${event}`, decisionState: snapshot.decisionState, demoClock: snapshot.demoClock });
    }
    return result;
  });
  const path = process.argv[2] ?? "../m2_runtime/outputs/manual-event-worlds.json";
  await writeFile(path, JSON.stringify(worlds, null, 2));
  console.log(JSON.stringify({ output: path, worlds: worlds.map((w) => w.name), storageMutated: false }));
} finally { await browser.close(); }
