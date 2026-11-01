/**
 * The packages as an app gets them: packed as they'd be published, installed with npm into an app
 * outside the workspace, its React, Vue and Svelte code type-checked against their declarations,
 * built with Vite, and the same scene checked in each framework in Chromium, WebKit and Firefox.
 * What the packages' own tests can't see: their exports, what's in their tarballs, their types as
 * an app reads them, a bundler resolving them.
 *
 *   pnpm --filter @fluidkit/consumer check            all three browsers
 *   pnpm --filter @fluidkit/consumer check webkit     one of them
 *   pnpm --filter @fluidkit/consumer check --keep     the app left in place, its path printed
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "playwright";

const PORT = 4331;
const PACKAGES = ["core", "react", "vue", "svelte"];
const FRAMEWORKS = ["react", "vue", "svelte"];
const BROWSERS = { chromium, webkit, firefox };
const args = process.argv.slice(2);
const asked = args.filter((name) => name in BROWSERS);
const browsers = asked.length ? asked : Object.keys(BROWSERS);
const keep = args.includes("--keep");

const root = fileURLToPath(new URL("../..", import.meta.url));
const work = mkdtempSync(join(tmpdir(), "fluidkit-consumer-"));
const app = join(work, "app");

/** Runs a step quietly, its output shown only when it fails */
function step(title, command, commandArgs, cwd) {
  console.log(`· ${title}`);
  try {
    execFileSync(command, commandArgs, { cwd, stdio: "pipe", encoding: "utf8" });
  } catch (e) {
    console.error(`${e.stdout ?? ""}${e.stderr ?? ""}`.trim());
    throw new Error(`${title} failed`, { cause: e });
  }
}

let failed = false;
try {
  // Packed as published: `prepack` builds each, and workspace ranges become versions
  const tarballs = join(work, "tgz");
  mkdirSync(tarballs);
  for (const name of PACKAGES) {
    step(`pack ${name}`, "pnpm", ["pack", "--pack-destination", tarballs], join(root, "packages", name));
  }
  const files = readdirSync(tarballs);
  const local = Object.fromEntries(
    PACKAGES.map((name) => [
      `@fluidkit/${name}`,
      `file:../tgz/${files.find((file) => file.startsWith(`fluidkit-${name}-`))}`,
    ]),
  );

  // Outside the workspace, so nothing of it is found by walking up
  const source = fileURLToPath(new URL("app", import.meta.url));
  cpSync(source, app, { recursive: true, filter: (path) => !/[/\\](node_modules|dist)$/.test(path) });
  const manifest = JSON.parse(readFileSync(join(app, "package.json"), "utf8"));
  manifest.dependencies = { ...manifest.dependencies, ...local };
  // The packages' own dependency on core, the packed one too
  manifest.overrides = local;
  writeFileSync(join(app, "package.json"), JSON.stringify(manifest, null, 2));
  step("install", "npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], app);

  const bin = (name) => join(app, "node_modules", ".bin", name);
  step("types: react", bin("tsc"), ["-p", "tsconfig.react.json"], app);
  step("types: vue", bin("vue-tsc"), ["-p", "tsconfig.vue.json"], app);
  step("types: svelte", bin("svelte-check"), ["--tsconfig", "tsconfig.svelte.json", "--fail-on-warnings"], app);
  step("build", bin("vite"), ["build"], app);

  failed = !(await checkPages(join(app, "dist")));
} catch (e) {
  console.error(e.message);
  failed = true;
} finally {
  if (keep) console.log(`kept: ${app}`);
  else rmSync(work, { recursive: true, force: true });
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

/** The scene on each framework's page, in each browser: `true` when all of it does what it should */
async function checkPages(dist) {
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
  const server = createServer(async (req, res) => {
    const path = normalize(new URL(req.url ?? "/", "http://x").pathname).replace(/^(\.\.[/\\])+/, "");
    try {
      const body = await readFile(join(dist, path));
      res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(PORT, resolve));

  let ok = true;
  try {
    for (const name of browsers) {
      // Playwright's Firefox looks in the installed Firefox's app data, which macOS 27 keeps from it
      // ("Could not find profile folder"): a folder of its own instead (microsoft/playwright#42768)
      const env =
        name === "firefox" && process.platform === "darwin"
          ? { ...process.env, MOZ_APP_DATA: mkdtempSync(join(tmpdir(), "consumer-firefox-")) }
          : undefined;
      const browser = await BROWSERS[name].launch({ env });
      const warm = await browser.newPage();
      await warmUp(warm);
      await warm.close();
      for (const framework of FRAMEWORKS) {
        const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
        const failures = await checkScene(page, `http://localhost:${PORT}/${framework}.html`, name);
        await page.close();
        if (failures.length) ok = false;
        console.log(`${failures.length ? "✗" : "✓"} ${name} ${framework}`);
        for (const failure of failures) console.log(`    ${failure}`);
      }
      await browser.close();
    }
  } finally {
    server.close();
  }
  return ok;
}

/** What the scene should do, the same in each framework: the failures */
async function checkScene(page, url, browser) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const failures = [];
  const timeout = 5000;
  const id = (name) => `[data-testid="${name}"]`;
  const check = async (title, run) => {
    try {
      await run();
    } catch (e) {
      failures.push(`${title}: ${e.message.split("\n")[0]}`);
    }
  };
  const shows = (name, text) =>
    page.waitForFunction(
      ([selector, text]) => document.querySelector(selector)?.textContent?.trim() === text,
      [id(name), text],
      { timeout },
    );
  const logged = (line) =>
    page.waitForFunction(
      (line) => document.querySelector('[data-testid="log"]')?.textContent?.split("\n").includes(line),
      line,
      {
        timeout,
      },
    );
  // An indicator come to rest over its item
  const over = (thumb, item) =>
    page.waitForFunction(
      ([thumb, item]) => {
        const a = document.querySelector(thumb)?.getBoundingClientRect();
        const b = document.querySelector(item)?.getBoundingClientRect();
        return !!a && !!b && Math.abs(a.left - b.left) < 1.5 && Math.abs(a.width - b.width) < 1.5;
      },
      [thumb, item],
      { timeout },
    );
  // Where it is on screen, scrolled to first: the mouse goes by the viewport, and a page laid out
  // taller (Linux's fonts) has it below the fold
  const place = async (name) => {
    const element = page.locator(id(name));
    await element.scrollIntoViewIfNeeded();
    const box = await element.boundingBox();
    if (!box) throw new Error(`no ${name}`);
    return box;
  };
  const drag = async (name, dx, dy) => {
    const box = await place(name);
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(x + (dx * i) / 10, y + (dy * i) / 10);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
  };

  await page.goto(url);
  await check("mounts", () => page.waitForSelector(`${id("group")}[data-fk-surface]`, { timeout }));

  // Its stylesheet as the app's bundler minified it: a scroll edge's fade follows the scroll
  await check("scroll edge", async () => {
    // Without scroll-driven animations (Firefox) there are no edges, by design
    if (!(await page.evaluate(() => CSS.supports("animation-timeline: scroll()")))) return;
    await page.evaluate(() => {
      const list = document.createElement("ol");
      list.className = "lb-edge";
      list.dataset.testid = "edge";
      list.style.cssText = "height: 100px; overflow: auto";
      list.innerHTML = "<li>Row</li>".repeat(30);
      document.body.append(list);
      list.scrollTop = 60;
    });
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector('[data-testid="edge"]')).getPropertyValue("--_lb-edge-start") === "1",
      null,
      { timeout },
    );
    await page.$eval(id("edge"), (el) => el.remove());
  });

  // Rows the framework put in and took out by their keys: the others move, the one taken out goes
  // out where it was, and at rest nothing of the layout's is left
  await check("layout", async () => {
    const list = id("layout");
    const rest = (count) =>
      page.waitForFunction(
        ([list, count]) => {
          const ul = document.querySelector(list);
          return (
            ul.children.length === count &&
            !ul.querySelector("[data-fk-part]") &&
            [ul, ...ul.children].every((el) => !el.getAttribute("style"))
          );
        },
        [list, count],
        { timeout },
      );
    // What the layout wrote, as it wrote it: a frame can take longer than the whole way (a software
    // renderer compiling its first blur, as on CI), and a poll would find only the end of it
    await page.$eval(list, (ul) => {
      const seen = (window.__layout = { moved: false, blurred: false, out: false });
      new MutationObserver(() => {
        const [first, ...rest] = ul.children;
        seen.moved ||= rest.some((el) => el.style.translate);
        seen.blurred ||= /blur\(/.test(first?.style.filter ?? "");
        seen.out ||= !!ul.querySelector(":scope > [data-fk-part]");
      }).observe(ul, { subtree: true, childList: true, attributes: true });
    });
    const saw = (what) => page.waitForFunction((what) => window.__layout[what], what, { timeout });
    await page.click(id("layout-add"));
    await saw("moved");
    // The new one comes in out of a blur, as `transitions.blurReplace()` has it
    await saw("blurred");
    await rest(4);
    await page.click(id("layout-drop"));
    await saw("out");
    await rest(3);
  });

  // The stylesheet as the app's bundler minified it: shown, the toast comes in on its spring (its
  // opacity transition started, eased by the spring's `linear()`); hidden, it goes out the same way,
  // and is gone. Read as the change is made, not caught half way: a frame can outlast it. Firefox
  // doesn't transition `display` yet: there it's gone at once
  await check("motion", async () => {
    const toast = id("toast");
    const springs = async (hidden) => {
      const on = await page.$eval(
        toast,
        (el, hidden) => {
          el.hidden = hidden;
          // Brings the style up to date, so the transitions are there
          return el
            .getAnimations()
            .filter((a) => a.transitionProperty === "opacity")
            .map((a) => ({ easing: a.effect.getTiming().easing, duration: a.effect.getTiming().duration }));
        },
        hidden,
      );
      if (!on.some((t) => t.duration > 0 && t.easing.startsWith("linear(")))
        throw new Error(`no spring on its opacity: ${JSON.stringify(on).slice(0, 120)}`);
    };
    const style = (prop, value) =>
      page.waitForFunction(
        ([toast, prop, value]) => getComputedStyle(document.querySelector(toast))[prop] === value,
        [toast, prop, value],
        { timeout },
      );
    await springs(false);
    await style("opacity", "1");
    if (browser === "firefox") await page.$eval(toast, (el) => (el.hidden = true));
    else await springs(true);
    await style("display", "none");
  });

  await check("glass", async () => {
    const button = await page.$eval(id("glass-button"), (el) => [el.tagName, ...el.classList]);
    for (const want of ["BUTTON", "lb", "lb-interactive", "lb-tinted", "mine"]) {
      if (!button.includes(want)) throw new Error(`glass-button lacks ${want}: ${button.join(" ")}`);
    }
    const own = await page.$eval(id("own-glass"), (el) => [...el.classList]);
    if (!own.includes("lb") || !own.includes("lb-highlight")) throw new Error(`own-glass: ${own.join(" ")}`);
    const box = await place("glass-button");
    await page.mouse.move(box.x + 10, box.y + 10);
    await page.mouse.down();
    try {
      await page.waitForSelector(`${id("glass-button")}[data-lb-pressed]`, { timeout });
    } finally {
      await page.mouse.up();
    }
  });

  await check("indicator", async () => {
    await page.click(id("tab-releases"));
    await shows("tab", "releases");
    await over(id("thumb"), id("tab-releases"));
    await page.click(id("tab-audience"));
    await shows("tab", "audience");
    await over(id("thumb"), id("tab-audience"));
  });
  await check("indicator, own markup", async () => {
    await page.click(id("own-tab-b"));
    await shows("own-tab", "b");
    await over(id("own-thumb"), id("own-tab-b"));
  });

  await check("morph", async () => {
    if (!(await page.$eval(id("panel"), (el) => el.hasAttribute("data-fk-away"))))
      throw new Error("panel shown at first");
    await page.click(id("more"));
    await logged("rest panel");
    await shows("view", "panel");
    await page.click(id("close"));
    await logged("rest button");
    await shows("view", "button");
  });
  await check("morph, own markup", async () => {
    await page.click(id("own-a"));
    await logged("own rest b");
    await page.click(id("own-back"));
    await logged("own rest a");
  });

  await check("drag", async () => {
    await page.waitForSelector(`${id("sheet")}[data-snap="1"]`, { timeout });
    await page.click(id("snap0"));
    await page.waitForSelector(`${id("sheet")}[data-snap="0"]`, { timeout });
    await drag("grabber", 0, 220);
    await page.waitForFunction(() => document.querySelector('[data-testid="snap"]')?.textContent !== "0", null, {
      timeout,
    });
  });
  await check("drag, own markup", async () => {
    await drag("card", 110, 0);
    await logged("own snap 1").catch(async () => {
      const at = await page.$eval(id("card"), (el) => `snap ${el.dataset.snap}, at ${el.style.translate || "none"}`);
      throw new Error(`not told of snap 1: ${at}`);
    });
  });

  await check("lift", async () => {
    await page.click(id("photo"), { button: "right" });
    await shows("lift-open", "true");
    await page.click(`dialog[data-fk-lift] ${id("lift-copy")}`);
    await logged("select copy");
    await shows("lift-open", "false");
    await page.waitForFunction(() => !document.querySelector("dialog[data-fk-lift][open]"), null, { timeout });
  });
  await check("lift, own markup", async () => {
    await page.click(id("own-lift"), { button: "right" });
    await shows("own-lift-state", "open");
    await page.keyboard.press("Escape");
    await shows("own-lift-state", "closed");
  });

  await check("unmount and mount again", async () => {
    await page.click(id("toggle"));
    await page.waitForSelector(id("sheet"), { state: "detached", timeout });
    const left = await page.$$eval("[data-fk-part], dialog[data-fk-lift]", (els) => els.length);
    if (left) throw new Error(`${left} of its elements left in the page`);
    await page.click(id("toggle"));
    await page.waitForSelector(`${id("group")}[data-fk-surface]`, { timeout });
    await page.waitForSelector(`${id("sheet")}[data-snap]`, { timeout });
  });

  if (errors.length) failures.push(`errors: ${errors.join(" | ")}`);
  return failures;
}
