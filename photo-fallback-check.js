const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

const siteDir = process.env.SITE_DIR || path.resolve(__dirname, "..", "outputs");
const pageUrl = pathToFileURL(path.join(siteDir, "index.html")).href;

(async () => {
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const browser = await chromium.launch({
    executablePath: fs.existsSync(chromePath) ? chromePath : chromium.executablePath(),
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 10000 });
  await page.waitForFunction(() => !document.body.classList.contains("loading"), null, { timeout: 3000 });
  await page.waitForFunction(() => {
    const holders = Array.from(document.querySelectorAll(".photo-card, .memory-thumb"));
    return holders.length === 4 && holders.every((holder) => holder.classList.contains("has-photo"));
  }, null, { timeout: 5000 });

  await page.click(".photo-card");
  await page.waitForSelector("#lightboxDialog[open]", { timeout: 3000 });
  const lightboxLoaded = await page.$eval("#lightboxImage", (image) => !image.hidden && image.currentSrc.startsWith("data:image/jpeg;base64,"));
  if (!lightboxLoaded && !process.env.ALLOW_ASSET_LIGHTBOX) {
    errors.push("Lightbox did not use embedded fallback image.");
  }

  await browser.close();
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  console.log(`Photo fallback check passed: ${pageUrl}`);
})();
