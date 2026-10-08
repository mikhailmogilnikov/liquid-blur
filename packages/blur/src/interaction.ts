import { PART, SpringAnimator, type SpringParams } from "@liquid-web/core";

/**
 * Press behaviors for glass: `.lb-highlight`, `.lb-swell`, `.lb-stretch`, in any combination, or
 * `.lb-interactive` for all three.
 * One delegated listener for the whole document, so the material stays plain classes and elements
 * mounted later work without registration. Installing twice returns the first install.
 *
 * Pressed state (highlight, swell): while a pointer is down the element gets `data-lb-pressed`.
 * Touch shows it after a short delay: a finger that lands to scroll fires pointercancel first, so
 * nothing flashes; a tap shorter than the delay still gets a brief flash on release. Keyboard
 * presses (Enter, Space) on the focused glass itself light the center until that key comes up.
 *
 * The light and the swell run on springs, written inline: the light's strength as `--_lb-pressed`,
 * the swell as `scale`, multiplied with the element's own. No `transition` is set, so the page's
 * stays its own. When they come to rest, the inline values are removed again.
 *
 * Highlight also gets the press point as `--lb-press-x` / `--lb-press-y` (percent of its box,
 * registered as non-inherited, so moving it restyles only the element), at most once per frame,
 * clamped to the box. Its reach follows the element's size, written once per press as
 * `--_lb-press-r`: a small button fills with light, a big card gets a broad glow, never a flood.
 *
 * Stretch: dragging pulls the glass toward the finger with rubber-band resistance and stretches it
 * along the drag, keeping its area; on release it springs back. Per frame only `transform` is
 * written — no layout, no inherited custom properties. The element's own transform is kept: the
 * stretch is appended to it, and its inline `transform` / `will-change` are restored afterwards.
 * Strength comes from the inherited `--lb-stretch` (0 = off, 2 = default), read once per press.
 * Size counts too, like mass: a big panel gives less, follows slower and barely bounces back; a
 * small chip gives more and springs back livelier.
 * Swell scale comes from `--lb-swell` the same way, and size counts the same way too: `--lb-swell`
 * is the scale at the reference size; a small button grows more and bouncier, a big card barely.
 * Reduced motion turns off swell and stretch.
 *
 * The box is measured once per press, without our own offset and scale, and again if anything
 * scrolls. The element's own scale and transform count, so the light lands under the finger on a
 * scaled element too; our swell and stretch are applied to it per frame, without layout reads.
 * The press stays on while the pointer is down, however far it goes. Releasing outside the element
 * (plus a margin) cancels the click, as on iOS.
 *
 * Works for the document of an iframe too: pass it as `root`. Without a DOM (server rendering)
 * it does nothing. Returns a cleanup function.
 */

/** What a module made (a morph's copy, say) only looks pressable: the element it stands in for is */
const SELECTOR = `:is(.lb-highlight, .lb-swell, .lb-stretch, .lb-interactive):not([${PART}])`;
/** Whether a behavior is on: its own class, or `lb-interactive`, which is all of them */
const has = (el: Element, behavior: "highlight" | "swell" | "stretch") =>
  el.classList.contains(`lb-${behavior}`) || el.classList.contains("lb-interactive");
const PRESSED = "data-lb-pressed";
const TOUCH_DELAY = 70;
/** How long a tap shorter than TOUCH_DELAY stays lit, ms */
const TAP_FLASH = 120;
/** How far outside the element a press still counts, px */
const SLOP = 32;
/** Rubber band: the offset approaches MAX_OFFSET px; at SOFTNESS px of drag it's halfway there */
const MAX_OFFSET = 10;
const SOFTNESS = 48;
/** Stretch along the drag at full offset, before keeping the area */
const MAX_STRETCH = 0.12;

/** Swell scale when --lb-swell is unset */
const SWELL = 1.1;

const FOLLOW: SpringParams = { duration: 0.22, bounce: 0 };
const SETTLE: SpringParams = { duration: 0.5, bounce: 0.5 };
/** Size the stretch is tuned at: about a 44 × 120 button, as the geometric mean of the sides, px */
const REFERENCE_SIZE = 72;
/** How far size moves the stretch: a huge panel still gives a little, a tiny chip doesn't fly off */
const MIN_GIVE = 0.3;
const MAX_GIVE = 1.4;
/** The swell leans on size harder: a small icon grows a lot, a big card hardly at all */
const MIN_SWELL_GIVE = 0.15;
const MAX_SWELL_GIVE = 2.2;
/** Highlight reach: this many times the element's size (geometric mean of its sides), within px */
const LIGHT_REACH = 1.1;
const MIN_LIGHT_REACH = 48;
const MAX_LIGHT_REACH = 220;
/** The light comes on fast and fades slowly; the swell is the same spring both ways */
const SWELL_SPRING: SpringParams = { duration: 0.42, bounce: 0.22 };
const LIGHT_IN: SpringParams = { duration: 0.12, bounce: 0 };
const LIGHT_OUT: SpringParams = { duration: 0.42, bounce: 0 };

type Offset = { x: number; y: number };
type Scale = { x: number; y: number };
/** The element's box on screen as if our offset and scale weren't there: center and size */
type Box = { cx: number; cy: number; width: number; height: number };

/** A running stretch on one element: its spring and what to restore when it rests. */
type Stretch = {
  spring: SpringAnimator<keyof Offset>;
  /** The element's computed transform before the gesture; the stretch goes after it */
  base: string;
  inlineTransform: string;
  inlineWillChange: string;
};

/** Light and swell of one element, from the first press until they come to rest. */
type Feedback = {
  spring: SpringAnimator<"light" | "swell">;
  inlineScale: string;
  /** Swell scale minus 1, for this element's size; 0 when the element doesn't swell */
  grow: number;
  /** Springs in and out: the light's are fixed, the swell's depend on size */
  pressIn: Record<"light" | "swell", SpringParams>;
  pressOut: Record<"light" | "swell", SpringParams>;
};

type Press = {
  el: HTMLElement;
  pointerId: number;
  box: Box;
  startX: number;
  startY: number;
  inside: boolean;
  /** Whether the pressed state is on yet (touch turns it on after a delay) */
  shown: boolean;
  /** Whether to track the press point for the light */
  light: boolean;
  /** Rubber-band limit for this press, px; 0 when the element doesn't stretch */
  maxOffset: number;
  /** Springs for this element's size: following the finger, and settling back on release */
  follow: SpringParams;
  settle: SpringParams;
  stretch: Stretch | null;
};

const ZERO: Offset = { x: 0, y: 0 };
const ONE: Scale = { x: 1, y: 1 };

/**
 * How readily an element gives to the finger: 1 at the reference size, less when bigger, more
 * when smaller. The square root of the size ratio, so it changes gently across sizes.
 */
function giveOf(box: { width: number; height: number }) {
  return Math.min(MAX_GIVE, Math.max(MIN_GIVE, Math.sqrt(sizeRatio(box))));
}

/** How much a swell grows relative to the reference: the size ratio itself, not its root. */
function swellGiveOf(box: { width: number; height: number }) {
  return Math.min(MAX_SWELL_GIVE, Math.max(MIN_SWELL_GIVE, sizeRatio(box)));
}

/**
 * Reach of the highlight for this element, px. From the layout size, not the box on screen: the
 * gradient is drawn before any scale applies, so a scaled element would otherwise count it twice.
 */
function lightReachOf(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const size = Math.sqrt((el.offsetWidth || r.width) * (el.offsetHeight || r.height));
  return Math.min(MAX_LIGHT_REACH, Math.max(MIN_LIGHT_REACH, LIGHT_REACH * size));
}

/** Reference size over the element's, as the geometric mean of its sides. */
const sizeRatio = ({ width, height }: { width: number; height: number }) => REFERENCE_SIZE / Math.sqrt(width * height);

/** A spring for heavier glass: slower, and bouncing less. */
const weigh = ({ duration, bounce }: SpringParams, give: number): SpringParams => ({
  duration: duration * give ** -0.25,
  bounce: Math.min(0.7, bounce * give),
});

function springsFor(give: number) {
  return { follow: weigh(FOLLOW, give), settle: weigh(SETTLE, give) };
}

/**
 * The pressable glass under the event, looking through open shadow roots too. Checks the node
 * type rather than `instanceof HTMLElement`: elements of an iframe come from another realm.
 */
const CONTROL = "a[href], button, input, select, textarea, label, summary, [role='button'], [role='tab'], [onclick]";

function findGlass(event: Event): HTMLElement | null {
  for (const node of event.composedPath()) {
    if ((node as Node).nodeType === 1 && (node as Element).matches(SELECTOR)) return node as HTMLElement;
  }
  return null;
}

/** A control between the event target and the glass, such as a button in a glass toolbar. */
function innerControl(event: Event, glass: HTMLElement): boolean {
  for (const node of event.composedPath()) {
    if (node === glass) return false;
    if ((node as Node).nodeType === 1 && (node as Element).matches(CONTROL)) return true;
  }
  return false;
}

/** The element's own `scale` as x and y factors. */
function parseScale(value: string): [number, number] {
  if (!value || value === "none") return [1, 1];
  const [x, y = x] = value.split(" ").map(Number.parseFloat);
  return [Number.isFinite(x) ? x : 1, Number.isFinite(y) ? y : 1];
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const rubber = (d: number, max: number) => (max * d) / (Math.abs(d) + SOFTNESS);

/** Stretched along the pull, with the area kept. */
function stretchScale({ x, y }: Offset): Scale {
  const sx = 1 + (MAX_STRETCH * Math.abs(x)) / MAX_OFFSET;
  const sy = 1 + (MAX_STRETCH * Math.abs(y)) / MAX_OFFSET;
  const n = Math.sqrt(sx * sy);
  return { x: sx / n, y: sy / n };
}

/** Pulled toward the finger and stretched along the pull. */
function stretchTransform(base: string, offset: Offset) {
  const { x, y } = offset;
  const s = stretchScale(offset);
  // 2D on purpose: translate3d would add a layer per element for no gain
  const own = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${s.x.toFixed(4)}, ${s.y.toFixed(4)})`;
  return base ? `${base} ${own}` : own;
}

/**
 * The element's box on screen without our offset and scale. Both work around the center, so the
 * center minus the offset and the size divided by the scale are exact.
 */
function measure(el: HTMLElement, offset: Offset, scale: Scale): Box {
  const r = el.getBoundingClientRect();
  return {
    cx: r.left + r.width / 2 - offset.x,
    cy: r.top + r.height / 2 - offset.y,
    width: r.width / scale.x,
    height: r.height / scale.y,
  };
}

const installed = new WeakMap<Document, () => void>();

export function installPress(root?: Document): () => void {
  root ??= typeof document === "undefined" ? undefined : document;
  const win = root?.defaultView;
  if (!root || !win) return () => {};
  const doc: Document = root;
  const existing = installed.get(doc);
  if (existing) return existing;

  const html = doc.documentElement;
  const reducedMotion = win.matchMedia("(prefers-reduced-motion: reduce)");
  let press: Press | null = null;
  /** Glass pressed with Enter or Space, lit until that key comes up */
  let keyPress: { el: HTMLElement; key: string } | null = null;
  let timer = 0;
  let lightFrame = 0;
  let lightX = 0;
  let lightY = 0;
  let suppressClick: HTMLElement | null = null;
  let suppressTimer = 0;
  /** Stretches still settling after release, so a new press on the same element takes them over */
  const settling = new Map<HTMLElement, Stretch>();
  /** Lights and swells until they rest */
  const feedback = new Map<HTMLElement, Feedback>();

  const clearFeedback = (el: HTMLElement, { inlineScale }: Feedback) => {
    feedback.delete(el);
    el.style.removeProperty("--_lb-pressed");
    el.style.removeProperty("--lb-press-x");
    el.style.removeProperty("--lb-press-y");
    el.style.removeProperty("--_lb-press-r");
    el.style.scale = inlineScale;
  };

  const feedbackFor = (el: HTMLElement): Feedback | null => {
    const running = feedback.get(el);
    if (running) return running;
    const light = has(el, "highlight");
    const swell = has(el, "swell") && !reducedMotion.matches;
    if (!light && !swell) return null;

    const style = win.getComputedStyle(el);
    // Our stretch keeps the area, so the size it gives is the element's own even mid-gesture
    const r = el.getBoundingClientRect();
    const give = giveOf(r);
    const grow = swell ? ((Number.parseFloat(style.getPropertyValue("--lb-swell")) || SWELL) - 1) * swellGiveOf(r) : 0;
    const swellSpring = weigh(SWELL_SPRING, give);
    const [sx, sy] = parseScale(style.scale);
    const inlineScale = el.style.scale;
    // As with the stretch, the callbacks must not depend on the object being built here
    const spring = new SpringAnimator(
      { light: 0, swell: 0 },
      { light: LIGHT_OUT, swell: swellSpring },
      (v) => {
        if (light) el.style.setProperty("--_lb-pressed", v.light.toFixed(4));
        if (grow) {
          const k = 1 + grow * v.swell;
          el.style.scale = `${(sx * k).toFixed(4)} ${(sy * k).toFixed(4)}`;
        }
      },
      () => {
        // Resting while still held is not the end of the press
        const running = feedback.get(el);
        if (running && !el.hasAttribute(PRESSED)) clearFeedback(el, running);
      },
    );
    const created: Feedback = {
      spring,
      inlineScale,
      grow,
      pressIn: { light: LIGHT_IN, swell: swellSpring },
      pressOut: { light: LIGHT_OUT, swell: swellSpring },
    };
    feedback.set(el, created);
    return created;
  };

  const setPressed = (el: HTMLElement, on: boolean) => {
    if (on) el.setAttribute(PRESSED, "");
    else el.removeAttribute(PRESSED);
    const running = on ? feedbackFor(el) : feedback.get(el);
    running?.spring.to({ light: on ? 1 : 0, swell: on ? 1 : 0 }, on ? running.pressIn : running.pressOut);
  };

  const endKeyPress = () => {
    if (!keyPress) return;
    setPressed(keyPress.el, false);
    keyPress = null;
  };

  const offsetOf = (p: Press): Offset => (p.stretch ? p.stretch.spring.values() : ZERO);

  /** Our scale on the element right now: the swell times the stretch */
  const scaleOf = (el: HTMLElement, stretch: Stretch | null): Scale => {
    const running = feedback.get(el);
    const k = running?.grow ? 1 + running.grow * running.spring.values().swell : 1;
    const s = stretch ? stretchScale(stretch.spring.values()) : ONE;
    return { x: s.x * k, y: s.y * k };
  };

  const paintLight = () => {
    lightFrame = 0;
    if (!press?.light) return;
    const { el, box } = press;
    const offset = offsetOf(press);
    const scale = scaleOf(el, press.stretch);
    const x = clamp01((lightX - box.cx - offset.x) / (box.width * scale.x) + 0.5);
    const y = clamp01((lightY - box.cy - offset.y) / (box.height * scale.y) + 0.5);
    el.style.setProperty("--lb-press-x", `${(x * 100).toFixed(2)}%`);
    el.style.setProperty("--lb-press-y", `${(y * 100).toFixed(2)}%`);
  };
  const moveLight = (x: number, y: number) => {
    lightX = x;
    lightY = y;
    if (!lightFrame) lightFrame = win.requestAnimationFrame(paintLight);
  };

  const restore = (el: HTMLElement, stretch: Stretch) => {
    el.style.transform = stretch.inlineTransform;
    el.style.willChange = stretch.inlineWillChange;
  };

  const stretchFor = (el: HTMLElement): Stretch => {
    const running = settling.get(el);
    if (running) {
      settling.delete(el);
      return running;
    }
    const computed = win.getComputedStyle(el).transform;
    const base = computed && computed !== "none" ? computed : "";
    const inlineTransform = el.style.transform;
    const inlineWillChange = el.style.willChange;
    el.style.willChange = "transform";
    // The animator paints its initial value from the constructor, so the callbacks must not
    // depend on the object being built here
    const spring = new SpringAnimator<keyof Offset>(
      { x: 0, y: 0 },
      FOLLOW,
      (offset) => {
        el.style.transform = stretchTransform(base, offset);
      },
      () => {
        // Resting under a still finger is not the end of the gesture
        if (press?.el === el) return;
        settling.delete(el);
        el.style.transform = inlineTransform;
        el.style.willChange = inlineWillChange;
      },
    );
    return { spring, base, inlineTransform, inlineWillChange };
  };

  const release = (cancelled: boolean) => {
    win.clearTimeout(timer);
    win.cancelAnimationFrame(lightFrame);
    lightFrame = 0;
    if (!press) return;
    const { el, inside, shown, stretch, settle } = press;
    press = null;

    if (!shown && !cancelled) {
      // A tap shorter than the touch delay: flash the pressed state so it still answers
      setPressed(el, true);
      win.setTimeout(() => press?.el !== el && setPressed(el, false), TAP_FLASH);
    } else {
      setPressed(el, false);
    }

    if (stretch) {
      settling.set(el, stretch);
      stretch.spring.to({ x: 0, y: 0 }, settle);
    }
    // A press that ended outside doesn't activate. The click, if any, follows pointerup right away.
    if (!cancelled && !inside) {
      suppressClick = el;
      win.clearTimeout(suppressTimer);
      suppressTimer = win.setTimeout(() => (suppressClick = null), 400);
    }
  };

  const onDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const el = findGlass(event);
    if (!el) return;
    release(true);
    endKeyPress();
    suppressClick = null;

    const strength =
      has(el, "stretch") && !reducedMotion.matches
        ? Number.parseFloat(win.getComputedStyle(el).getPropertyValue("--lb-stretch")) || 0
        : 0;
    const stretch = strength > 0 ? stretchFor(el) : null;
    const box = measure(el, stretch ? stretch.spring.values() : ZERO, scaleOf(el, stretch));
    if (!box.width || !box.height) return;
    const give = giveOf(box);

    press = {
      el,
      pointerId: event.pointerId,
      box,
      startX: event.clientX,
      startY: event.clientY,
      inside: true,
      shown: false,
      light: has(el, "highlight"),
      maxOffset: MAX_OFFSET * strength * give,
      ...springsFor(give),
      stretch,
    };
    // Keep getting moves after the mouse leaves the element; touch is captured implicitly. Not when
    // the press is on a control inside the glass: capture would send its click to the glass instead
    if (event.pointerType === "mouse" && !innerControl(event, el)) el.setPointerCapture(event.pointerId);
    if (press.light) el.style.setProperty("--_lb-press-r", `${lightReachOf(el).toFixed(1)}px`);

    lightX = event.clientX;
    lightY = event.clientY;
    paintLight();
    const show = () => {
      if (press?.el !== el) return;
      press.shown = true;
      setPressed(el, true);
    };
    if (event.pointerType === "touch") timer = win.setTimeout(show, TOUCH_DELAY);
    else show();
  };

  const onMove = (event: PointerEvent) => {
    if (!press || event.pointerId !== press.pointerId) return;
    const { box, startX, startY, maxOffset, stretch, follow } = press;

    // Only decides whether the release activates; the press itself stays on however far the
    // pointer goes, the light waiting at the nearest edge
    press.inside =
      Math.abs(event.clientX - box.cx) < box.width / 2 + SLOP &&
      Math.abs(event.clientY - box.cy) < box.height / 2 + SLOP;

    stretch?.spring.to(
      { x: rubber(event.clientX - startX, maxOffset), y: rubber(event.clientY - startY, maxOffset) },
      follow,
    );
    if (press.light) moveLight(event.clientX, event.clientY);
  };

  const onUp = (event: PointerEvent) => {
    if (press && event.pointerId === press.pointerId) release(event.type === "pointercancel");
  };

  // Something scrolled under a held press (a wheel, a scripted scroll): the box moved with it
  const onScroll = () => {
    if (!press) return;
    press.box = measure(press.el, offsetOf(press), scaleOf(press.el, press.stretch));
    if (press.light) moveLight(lightX, lightY);
  };

  // Capture phase on the document: runs before any click handler of the page
  const onClick = (event: MouseEvent) => {
    const el = suppressClick;
    suppressClick = null;
    if (el && event.composedPath().includes(el)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.repeat || (event.key !== "Enter" && event.key !== " ")) return;
    const el = findGlass(event);
    // Only the focused glass itself, not a field or a button inside it
    if (!el || event.composedPath()[0] !== el) return;
    release(true);
    endKeyPress();
    if (has(el, "highlight")) {
      el.style.setProperty("--lb-press-x", "50%");
      el.style.setProperty("--lb-press-y", "50%");
      el.style.setProperty("--_lb-press-r", `${lightReachOf(el).toFixed(1)}px`);
    }
    keyPress = { el, key: event.key };
    setPressed(el, true);
  };

  // Only the key that pressed releases: a modifier or another key on the way doesn't
  const onKeyUp = (event: KeyboardEvent) => {
    if (keyPress && event.key === keyPress.key) endKeyPress();
  };

  // The window lost focus: the matching pointerup or keyup will never come
  const onBlur = () => {
    release(true);
    endKeyPress();
  };

  const listeners = [
    ["pointerdown", onDown],
    ["pointermove", onMove],
    ["pointerup", onUp],
    ["pointercancel", onUp],
    ["scroll", onScroll],
    ["keydown", onKeyDown],
    ["keyup", onKeyUp],
  ] as const;

  // Capture phase: a component that stops propagation can't hide the press from us, and scroll
  // events of any container reach the document only while capturing
  for (const [type, listener] of listeners) {
    doc.addEventListener(type, listener as EventListener, { capture: true, passive: true });
  }
  doc.addEventListener("click", onClick, { capture: true });
  win.addEventListener("blur", onBlur);
  html.setAttribute("data-lb-interaction", "");

  const cleanup = () => {
    release(true);
    endKeyPress();
    win.clearTimeout(suppressTimer);
    for (const [el, stretch] of settling) {
      stretch.spring.stop();
      restore(el, stretch);
    }
    settling.clear();
    for (const [el, running] of feedback) {
      running.spring.stop();
      el.removeAttribute(PRESSED);
      clearFeedback(el, running);
    }
    for (const [type, listener] of listeners) {
      doc.removeEventListener(type, listener as EventListener, { capture: true });
    }
    doc.removeEventListener("click", onClick, { capture: true });
    win.removeEventListener("blur", onBlur);
    html.removeAttribute("data-lb-interaction");
    installed.delete(doc);
  };
  installed.set(doc, cleanup);
  return cleanup;
}
