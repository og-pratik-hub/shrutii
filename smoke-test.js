const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

const outputDir = process.env.SITE_DIR
  ? path.resolve(process.env.SITE_DIR)
  : path.resolve(__dirname, "..", "outputs");
const pageUrl = pathToFileURL(path.join(outputDir, "index.html")).href;

async function runViewport(browser, name, viewport) {
  const context = await browser.newContext({
    viewport,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const issues = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      issues.push(`[console:${name}] ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    issues.push(`[pageerror:${name}] ${error.message}`);
  });

  await page.goto(pageUrl, { waitUntil: "load" });
  await page.waitForSelector(".loading-screen", { state: "detached", timeout: 3000 }).catch(() => {});

  const title = await page.title();
  if (title !== "To My Shotty ❤") issues.push(`[${name}] Unexpected title: ${title}`);

  const imageState = await page.$$eval("img", (images) => images.map((image) => ({
    alt: image.alt,
    src: image.currentSrc || image.src,
    complete: image.complete,
    width: image.naturalWidth,
    hidden: image.hidden,
  })));
  imageState.forEach((image) => {
    if (!image.hidden && (!image.complete || image.width < 1)) {
      issues.push(`[${name}] Image failed to load: ${image.alt}`);
    }
  });

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  if (hasHorizontalOverflow) issues.push(`[${name}] Horizontal overflow detected`);

  await page.click("#openSurprise");
  await page.waitForTimeout(150);
  const scrolled = await page.evaluate(() => window.scrollY > 20);
  if (!scrolled) issues.push(`[${name}] Surprise button did not scroll`);

  await page.click(".photo-card");
  await page.waitForSelector("#lightboxDialog[open]", { timeout: 1500 });
  await page.click("#lightboxDialog [data-close-dialog]");

  const cardButtons = await page.$$("[data-card-button]");
  for (const button of cardButtons) {
    await button.click();
  }
  const openCards = await page.$$eval("[data-card]", (cards) => cards.filter((card) => card.classList.contains("is-open")).length);
  if (openCards !== 4) issues.push(`[${name}] Expected 4 opened cards, found ${openCards}`);

  await page.click("#tieRakhi");
  const rakhiStatus = await page.textContent("#rakhiStatus");
  if (!rakhiStatus || !rakhiStatus.includes("Bond officially renewed")) {
    issues.push(`[${name}] Rakhi interaction did not update status`);
  }

  await page.click("#unlockSecret");
  await page.waitForSelector("#secretDialog[open]", { timeout: 1500 });
  await page.click("#secretDialog [data-close-dialog]");

  await page.click("#finalSurprise");
  const overlayVisible = await page.locator("#surpriseOverlay").evaluate((node) => node.classList.contains("is-visible"));
  if (!overlayVisible) issues.push(`[${name}] Final surprise overlay did not open`);
  await page.click("#closeOverlay");

  if (viewport.width < 721) {
    await page.click(".nav-toggle");
    const navOpen = await page.locator(".site-header").evaluate((node) => node.classList.contains("nav-open"));
    if (!navOpen) issues.push(`[${name}] Mobile navigation did not open`);
  }

  await page.screenshot({ path: path.join(__dirname, `${name}-smoke.png`), fullPage: true });
  await context.close();
  return issues;
}

(async () => {
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const executablePath = fs.existsSync(chromePath) ? chromePath : chromium.executablePath();
  const browser = await chromium.launch({
    executablePath,
    headless: true,
  });
  const results = [];
  results.push(...await runViewport(browser, "desktop", { width: 1440, height: 1000 }));
  results.push(...await runViewport(browser, "mobile", { width: 390, height: 844 }));
  await browser.close();

  if (results.length) {
    console.error(results.join("\n"));
    process.exit(1);
  }

  console.log("Smoke tests passed for desktop and mobile.");
  console.log(`Opened from: ${pageUrl}`);
})();
