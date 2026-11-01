/**
 * Checks: what a case says should happen, checked once each step has played out. A case's `check`
 * is called with the step just run (-1 before any) and gives back what's wrong, `null` when nothing
 * is, or `undefined` for a step it doesn't check.
 */
export type Check = (step: number) => string | null | undefined;

/** What's moving: everything on the stage and in a lift's dialog, by its box, opacity and transform */
const snapshot = (scope: Element) => {
  const els = [
    ...scope.querySelectorAll("*"),
    ...(document.querySelector("dialog[data-fk-lift]")?.querySelectorAll("*") ?? []),
  ];
  let s = String(scrollY);
  for (const el of els) {
    const r = el.getBoundingClientRect();
    s += `${r.left.toFixed(1)},${r.top.toFixed(1)},${r.width.toFixed(1)},${r.height.toFixed(1)};`;
    if (el instanceof HTMLElement) s += `${el.style.opacity}${el.style.transform}${el.style.translate}`;
    if (el instanceof HTMLElement && el.scrollTop) s += `^${el.scrollTop}`;
  }
  return s;
};

/**
 * A CSS transition or animation still running on the stage or in a lift's dialog, one that ends:
 * what moves no box (a custom property easing, `--lb-lens` say) shows only here
 */
const animating = (scope: Element) =>
  document.getAnimations().some((a) => {
    // Driven by a scroll (`lb-edge`'s fades), not time: it runs as long as there's a scroll
    if (a.playState !== "running" || a.timeline !== document.timeline) return false;
    const target = (a.effect as KeyframeEffect | null)?.target;
    if (!target || !(scope.contains(target) || target.closest("dialog[data-fk-lift]"))) return false;
    return a.effect?.getComputedTiming().endTime !== Infinity;
  });

/**
 * Until nothing on the stage moves for a few frames, no transition of it runs and no timer of the
 * case is pending; false if it never comes to rest
 */
export async function settle(scope: Element, pending: () => number, max = 5000) {
  const start = performance.now();
  let last = "";
  let still = 0;
  while (performance.now() - start < max) {
    await new Promise(requestAnimationFrame);
    const now = snapshot(scope);
    still = now === last && !pending() && !animating(scope) ? still + 1 : 0;
    last = now;
    if (still >= 6) return true;
  }
  return false;
}

/** How far apart two boxes are, at most, by any edge */
const apart = (a: DOMRect, b: DOMRect) =>
  Math.max(
    Math.abs(a.left - b.left),
    Math.abs(a.top - b.top),
    Math.abs(a.right - b.right),
    Math.abs(a.bottom - b.bottom),
  );

/** Two boxes the same, within `tolerance` px */
export const same = (what: string, a: DOMRect, b: DOMRect, tolerance = 1) => {
  const d = apart(a, b);
  return d > tolerance ? `${what} is ${d.toFixed(1)}px off` : null;
};

/** A box scaled about its center */
export const scaled = (r: DOMRect, s: number) =>
  new DOMRect(r.left - (r.width * (s - 1)) / 2, r.top - (r.height * (s - 1)) / 2, r.width * s, r.height * s);

/** The first thing wrong, or nothing */
export const first = (...results: Array<string | null | undefined | false>) =>
  (results.find((r) => typeof r === "string") as string | undefined) ?? null;

/** `fail` unless `ok` */
export const expect = (ok: boolean, fail: string) => (ok ? null : fail);

/** Unseen: hidden, see-through or gone */
export const unseen = (el: Element) => {
  const s = getComputedStyle(el);
  return s.visibility === "hidden" || s.display === "none" || Number(s.opacity) < 0.01 || !el.getClientRects().length;
};

/** The lift's dialog while one is open */
export const liftLayer = () => document.querySelector<HTMLDialogElement>("dialog[data-fk-lift]");

/** A frame at 60 Hz, ms */
export const FRAME = 1000 / 60;

/**
 * Something sampled every frame until `stop()`: what a check can't see once it has settled (an
 * indicator lagging a tab that grew, a copy landing where the element was). Read once the frame is
 * drawn, not in its animation callbacks: there, what follows by a resize observation (an indicator
 * on a tab that grew) hasn't yet, and would look a frame behind
 */
export function sample<T>(read: () => T) {
  const seen: T[] = [];
  let on = true;
  const tick = () => {
    if (!on) return;
    requestAnimationFrame(() =>
      setTimeout(() => {
        if (!on) return;
        seen.push(read());
        tick();
      }),
    );
  };
  tick();
  return {
    seen,
    stop: () => {
      on = false;
    },
  };
}
