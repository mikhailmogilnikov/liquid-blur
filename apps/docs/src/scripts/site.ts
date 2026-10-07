import { installLiquidBlur } from "liquid-blur";
import { segmented } from "./segmented";

installLiquidBlur();

const root = document.documentElement;

// ── Theme: auto follows the system; light and dark are remembered ──

const THEMES = ["auto", "light", "dark"] as const;
const THEME_LABELS = { auto: "match system", light: "light", dark: "dark" };
type Theme = (typeof THEMES)[number];

const themeControls = [...document.querySelectorAll<HTMLElement>("[data-theme-switch]")].map((seg) =>
  segmented(seg, (value) => setTheme(value as Theme)),
);
const themeCycles = [...document.querySelectorAll<HTMLButtonElement>("[data-theme-cycle]")];

/** One theme for the page, mirrored on every switch: the segmented one and the phone's cycle button */
function setTheme(theme: Theme) {
  if (theme === "auto") delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    if (theme === "auto") localStorage.removeItem("lb-theme");
    else localStorage.setItem("lb-theme", theme);
  } catch {}
  for (const control of themeControls) control.select(theme, true);
  for (const button of themeCycles) {
    button.dataset.current = theme;
    button.setAttribute("aria-label", `Theme: ${THEME_LABELS[theme]}`);
  }
}

for (const button of themeCycles) {
  button.addEventListener("click", () => {
    const current = (root.dataset.theme ?? "auto") as Theme;
    setTheme(THEMES[(THEMES.indexOf(current) + 1) % THEMES.length]);
  });
}
setTheme((root.dataset.theme ?? "auto") as Theme);

// ── Install command, per package manager ──

const COMMANDS: Record<string, [string, string]> = {
  pnpm: ["pnpm", "add liquid-blur"],
  npm: ["npm", "install liquid-blur"],
  yarn: ["yarn", "add liquid-blur"],
  bun: ["bun", "add liquid-blur"],
};

for (const block of document.querySelectorAll<HTMLElement>("[data-install]")) {
  const out = block.querySelector<HTMLElement>("code")!;
  const show = (pm: string) => {
    const [cmd, rest] = COMMANDS[pm] ?? COMMANDS.pnpm;
    out.innerHTML = `<span class="tk-cmd">${cmd}</span> ${rest}`;
  };
  let saved = "pnpm";
  try {
    saved = localStorage.getItem("lb-pm") ?? saved;
  } catch {}
  const control = segmented(block.querySelector<HTMLElement>(".seg")!, (pm) => {
    show(pm);
    try {
      localStorage.setItem("lb-pm", pm);
    } catch {}
  });
  control.select(saved in COMMANDS ? saved : "pnpm", true);
  show(control.value() ?? "pnpm");
}

// ── Copy buttons ──

document.addEventListener("click", async (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>("[data-copy]");
  if (!button) return;
  const text = button.dataset.copy || button.closest(".code")?.querySelector("pre")?.textContent || "";
  try {
    await navigator.clipboard.writeText(text.trim());
  } catch {
    return;
  }
  const label = button.getAttribute("aria-label");
  button.classList.add("is-copied");
  button.setAttribute("aria-label", "Copied");
  window.setTimeout(() => {
    button.classList.remove("is-copied");
    if (label) button.setAttribute("aria-label", label);
  }, 1600);
});

// ── Reveal on scroll ──

const reveal = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-in");
      reveal.unobserve(entry.target);
    }
  },
  { rootMargin: "0px 0px -8% 0px" },
);
for (const el of document.querySelectorAll(".reveal, .mark--on-reveal")) reveal.observe(el);

// ── Moving backdrops: animate only while on screen ──

const live = new IntersectionObserver((entries) => {
  for (const entry of entries) entry.target.classList.toggle("is-live", entry.isIntersecting);
});
for (const el of document.querySelectorAll(".bd-aurora, .bd-stripes")) live.observe(el);

// ── Contents: the section being read ──

const links = [...document.querySelectorAll<HTMLAnchorElement>(".toc a[href^='#']")];
const sections = links
  .map((a) => document.getElementById(a.hash.slice(1)))
  .filter((el): el is HTMLElement => el !== null);

let tocFrame = 0;
const markCurrent = () => {
  tocFrame = 0;
  const line = window.innerHeight * 0.3;
  let current = sections[0];
  for (const section of sections) {
    if (section.getBoundingClientRect().top <= line) current = section;
  }
  // At the very bottom the last short sections can't reach the line
  if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
    current = sections[sections.length - 1];
  }
  for (const a of links) a.setAttribute("aria-current", String(a.hash === `#${current?.id}`));
};
if (sections.length) {
  window.addEventListener(
    "scroll",
    () => {
      if (!tocFrame) tocFrame = requestAnimationFrame(markCurrent);
    },
    { passive: true },
  );
  markCurrent();
}
