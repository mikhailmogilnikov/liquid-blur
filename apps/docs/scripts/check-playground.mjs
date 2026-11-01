/**
 * Runs the playground's checks in Chromium, WebKit and Firefox, on a desktop's screen and a phone's,
 * against the built site, and fails if any case doesn't do what it should, or the page scrolls
 * sideways. Build the site first (`pnpm --filter docs build`); the
 * browsers come from `playwright install chromium webkit firefox`.
 *
 *   pnpm --filter docs check:playground            all three
 *   pnpm --filter docs check:playground webkit     one of them
 */
import { mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "playwright";

const PORT = 4329;
const BROWSERS = { chromium, webkit, firefox };
/** A desktop's window, and a phone's: narrow, and short enough that the stage starts below the fold */
const SCREENS = {
  desktop: { viewport: { width: 1280, height: 900 } },
  phone: { viewport: { width: 390, height: 664 }, hasTouch: true },
};
const asked = process.argv.slice(2).filter((name) => name in BROWSERS);
const browsers = asked.length ? asked : Object.keys(BROWSERS);

// The built site, served as it would be: a folder's index.html for its path
const DIST = fileURLToPath(new URL("../dist", import.meta.url));
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".woff2": "font/woff2",
};
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  const file = join(DIST, path, path.endsWith("/") ? "index.html" : "");
  try {
    const body = await readFile(extname(file) ? file : join(file, "index.html"));
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "text/html" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(PORT, resolve));
const url = `http://localhost:${PORT}/playground/`;

let failed = false;
try {
  for (const name of browsers) {
    // Playwright's Firefox looks in the installed Firefox's app data, which macOS 27 keeps from it
    // ("Could not find profile folder"): a folder of its own instead (microsoft/playwright#42768)
    const env =
      name === "firefox" && process.platform === "darwin"
        ? { ...process.env, MOZ_APP_DATA: mkdtempSync(join(tmpdir(), "playground-firefox-")) }
        : undefined;
    const browser = await BROWSERS[name].launch({ env });
    for (const [screen, options] of Object.entries(SCREENS)) {
      const page = await browser.newPage(options);
      await warmUp(page);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(url);
      await page.waitForFunction(() => "__playground" in window);
      // Its fonts in: text that reflows as they swap in moves everything
      await page.evaluate(() => document.fonts.ready);
      const first = await page.evaluate(() => window.__playground.checkAll());
      // A failure is checked once more before it counts: a slow machine (CI's) can be slow to come
      // to rest once. Failing twice, it's real; passing the second time, it's told as flaky
      const again = first.filter((r) => r.failures.length).map((r) => r.id);
      const retried = again.length ? await page.evaluate((ids) => window.__playground.checkAll(ids), again) : [];
      const flaky = retried.filter((r) => !r.failures.length).map((r) => r.id);
      const results = first.map((r) => retried.find((x) => x.id === r.id) ?? r);
      // After a run too: what it shows then (its count) mustn't widen the page
      const wide = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      await page.close();

      const checked = results.filter((r) => r.checked);
      const failing = checked.filter((r) => r.failures.length);
      console.log(`${name}, ${screen}: ${checked.length - failing.length} / ${checked.length} passing`);
      for (const r of failing) {
        console.log(`  ✗ ${r.id}`);
        for (const f of r.failures) console.log(`      ${f}`);
      }
      for (const id of flaky) console.log(`  ⚠ ${id} failed once, passed checked again`);
      if (wide > 0) console.log(`  ✗ the page scrolls sideways by ${wide}px after the run`);
      for (const e of errors) console.log(`  page error: ${e}`);
      if (failing.length || errors.length || wide > 0) failed = true;
    }
    await browser.close();
  }
} finally {
  server.close();
}
process.exit(failed ? 1 : 0);

/**
 * What a software renderer compiles the first time it draws it, drawn once before anything is timed.
 * WebKit on Linux without a GPU (CI's) holds every frame for seconds the first time it blurs a layer
 * of its own, and a spring on its way stops dead meanwhile: a blur coming in, glass, a fade
 */
async function warmUp(page) {
  await page.setContent(`
    <div id="a" style="width: 160px; height: 80px; background: #0a84ff; will-change: filter;
      transition: filter 0.3s, opacity 0.3s, scale 0.3s, translate 0.3s"></div>
    <div style="width: 160px; height: 80px; margin-top: -40px; backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px)"></div>`);
  await page.evaluate(async () => {
    const el = document.getElementById("a");
    const frames = (n) =>
      new Promise((done) => requestAnimationFrame(() => (n > 1 ? frames(n - 1).then(done) : done())));
    await frames(2);
    Object.assign(el.style, { filter: "blur(8px)", opacity: "0.5", scale: "0.9", translate: "0 12px" });
    await frames(2);
    Object.assign(el.style, { filter: "blur(0px)", opacity: "1", scale: "1", translate: "0 0" });
    await new Promise((done) => setTimeout(done, 400));
    await frames(3);
  });
}
