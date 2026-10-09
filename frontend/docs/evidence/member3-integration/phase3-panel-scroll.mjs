// CSS/browser interaction regression using synthetic HTML and real app CSS.
// This does not run the native app or M3 and is not native acceptance evidence.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";
const css = await readFile(new URL("../../../src/styles/global.css", import.meta.url), "utf8");
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox", "--disable-gpu"] });
try {
  const page = await browser.newPage();
  await page.setContent(`<style>${css}</style><main class="admin-page" data-dispatch-source="MEMBER3_HTTP"><section class="panel-di" style="flex:none;width:300px;height:120px;position:absolute;left:20px;top:20px"><div style="height:400px;flex-shrink:0">Native cards and provenance</div><button style="flex-shrink:0">Route visibility</button></section></main>`);
  await page.mouse.move(100, 70); await page.mouse.wheel({ deltaY: 400 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert(await page.$eval('.panel-di', el => el.scrollTop > 0), "Native panel must scroll to reach route controls");
  console.log(JSON.stringify({ status: "M3_PHASE3_PANEL_SCROLL_PASS" }));
} finally { await browser.close(); }
