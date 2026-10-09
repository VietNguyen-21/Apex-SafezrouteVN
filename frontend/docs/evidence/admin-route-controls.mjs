export async function enableAdminRoutes(page, vehicleIds = ["V1", "V2"]) {
  for (const id of vehicleIds) {
    const selector = `button[role="switch"][aria-label="Show ${id} route"]`;
    await page.waitForSelector(selector);
    if (await page.$eval(selector, (button) => button.getAttribute("aria-checked") !== "true")) await page.click(selector);
    await page.waitForFunction((selector) => document.querySelector(selector)?.getAttribute("aria-checked") === "true", {}, selector);
  }
}
