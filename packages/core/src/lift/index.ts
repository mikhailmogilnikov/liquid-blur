import { SpringAnimator, holdSelection, px, still, swallowClick, type SpringParams } from "../base.js";

/**
 * Lift: a long press (or a right click, or the menu key) lifts an element above everything, the page
 * dimmed and blurred behind it, and opens a menu of yours beside it, as iOS's context menus do.
 *
 * What's lifted is a copy of the element, dressed as it's drawn (every computed style written on it,
 * so it looks the same out of its place), over the element, which is hidden where it is and keeps
 * its room: moved, a frame would reload and a video stop. The copy is a picture: its frames are
 * empty boxes, its videos their frame as it was, its form controls in no form or group. For something
 * live, or a bigger preview as iOS shows, give `preview` an element of your own instead: it keeps
 * its own size, centered on the element, and goes back where it was after. They sit in a modal
 * `<dialog>`, in the top layer over any `overflow`, `z-index` and transform: the rest of the page is
 * inert meanwhile and doesn't scroll by wheel, touch or keys, Escape closes it and focus goes back,
 * the arrow keys go through the items. The dialog is the dim and the blur itself; the menu, yours,
 * is moved into it while it's open and put back after, its listeners kept. One lift is open at a
 * time in a page: another opening closes it at once.
 *
 * The menu opens under the element, or over it with no room under, its side by the element's side
 * of the screen, kept in from the edges; with room neither way the element moves up for it, as in
 * iOS. The same finger that lifted it can slide onto an item and let go there to choose it; let go
 * without moving, the menu stays open. Each item it's over is marked `data-highlighted` and handed
 * to `onHighlight`, for an indicator, say. A choice clicks the item, then the menu closes.
 *
 * The press: held still for `delay`, it opens; moved more than a few pixels, or taken by a scroll,
 * it doesn't. While it's held the element is marked `data-lifting` (for the page to show it giving a
 * little), lifted `data-lifted`; no text is selected and iOS shows no callout. The click a long
 * press would end in is dropped.
 *
 * Springs: the copy rises from where the element is drawn, a little bigger, the dim and the menu
 * coming in with it; closing, it settles exactly back on the element, wherever the element is by
 * then (its page scrolled by a scrollbar, say), before the element is shown. With reduced motion
 * it's all at once.
 */

export type LiftPlacement = "auto" | "below" | "above";

export type LiftOptions = {
  /** What's held and lifted */
  element: HTMLElement;
  /** Your menu, opened beside it; without one, only the element is lifted */
  menu?: HTMLElement;
  /** Its items, as a selector in the menu: `[role="menuitem"], button, a[href]` unless given */
  items?: string;
  /**
   * What's lifted instead of a copy: an element, or one made from the element. It keeps its own
   * size, centered on the element and kept on screen; one from the page goes back there after
   */
  preview?: HTMLElement | ((element: HTMLElement) => HTMLElement);
  /** How long a press is held to lift it, ms: 500 unless given */
  delay?: number;
  /** How much bigger it's lifted: 1.04 unless given */
  scale?: number;
  /** How dark the page goes behind it, 0..1: 0.2 unless given */
  dim?: number;
  /** How blurred the page goes behind it, px: 12 unless given */
  blur?: number;
  /** Where the menu goes: under it or over it by the room there (`auto`), or one of them */
  placement?: LiftPlacement;
  /** The spring it rises on; `defaultLiftSpring` unless given */
  spring?: SpringParams;
  onOpen?: () => void;
  /** Called once it's closed, back in place */
  onClose?: () => void;
  /** Called with the item a finger is over while it slides on the menu, `null` off them */
  onHighlight?: (item: HTMLElement | null) => void;
  /** Called with the item chosen, before the menu closes; `false` keeps it open */
  onSelect?: (item: HTMLElement) => void | boolean;
};

/** What a lift can be told again once made: all but its element and its menu */
export type LiftSettings = Omit<LiftOptions, "element" | "menu">;

export type Lift = {
  /** Lifted, its menu open */
  readonly opened: boolean;
  /** Lifts it and opens the menu, its first item focused */
  open(): void;
  close(): void;
  /**
   * Takes new settings, the rest kept: a component's props as they change, without a lift made
   * again. Open, it takes them as it goes (its dim, blur, callbacks) or the next time it opens
   */
  set(settings: Partial<LiftSettings>): void;
  destroy(): void;
};

/** A lift that rises a little past its height and settles: alive, not jelly */
export const defaultLiftSpring: SpringParams = { duration: 0.42, bounce: 0.18 };
/** Closing, it settles straight back */
const SETTLE: SpringParams = { duration: 0.32, bounce: 0 };

const DELAY = 500;
const SCALE = 1.04;
const DIM = 0.2;
const BLUR = 12;
/** How far a press moves before it's not a long press, px */
const SLOP = 8;
/** Kept between the menu, the element and the screen's edges, px */
const GAP = 10;
const MARGIN = 12;
const ITEMS = "[role='menuitem'], button, a[href]";
const DISABLED = ":disabled, [aria-disabled='true']";
/** Form controls: a copy's are in no form and no radio group, so it changes nothing of the page's */
const CONTROLS = "input, select, textarea, button, fieldset, output, object";
/** Keys that scroll a page, kept from the page under it */
const SCROLL_KEYS = new Set(["PageUp", "PageDown", "ArrowLeft", "ArrowRight", " "]);
/** Not copied onto a copy's root: where it is and how it moves are the lift's */
const NOT_ROOT = new Set([
  "position",
  "inset",
  "top",
  "right",
  "bottom",
  "left",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "transform",
  "translate",
  "scale",
  "rotate",
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "z-index",
  "visibility",
  "will-change",
  "transition",
  "animation",
  "inset-block",
  "inset-inline",
  "margin-block",
  "margin-inline",
  // Aligned in its grid or flex box, it would be aligned in the dialog too: abspos boxes align
  "justify-self",
  "align-self",
  "place-self",
  "float",
  "inset-block-start",
  "inset-block-end",
  "inset-inline-start",
  "inset-inline-end",
  // A focus ring is the element's, focused: the copy isn't
  "outline",
  "outline-color",
  "outline-style",
  "outline-width",
  "outline-offset",
]);
/** Not copied anywhere: a copy doesn't animate */
const NEVER = /^(transition|animation)/;
const ZERO = { x: 0, y: 0, s: 1, p: 0 };

/** The lift open in each page, closed at once by another opening */
const active = new WeakMap<Document, () => void>();

/** The rule a modal dialog's own backdrop needs to be clear, once per document */
const styled = new WeakSet<Document>();
const style = (doc: Document) => {
  if (styled.has(doc)) return;
  styled.add(doc);
  const rule = "dialog[data-fk-lift]::backdrop { background: transparent; }";
  const win = doc.defaultView;
  if (win && "adoptedStyleSheets" in doc && typeof win.CSSStyleSheet === "function") {
    const sheet = new win.CSSStyleSheet();
    sheet.replaceSync(rule);
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
    return;
  }
  const el = doc.createElement("style");
  el.textContent = rule;
  doc.head.append(el);
};

/** Every computed style of `from` written on `to`, and so down their trees: it looks the same anywhere */
function dress(from: Element, to: Element, root: boolean) {
  const win = from.ownerDocument.defaultView ?? window;
  if (from instanceof win.HTMLElement && to instanceof win.HTMLElement) {
    const computed = win.getComputedStyle(from);
    // Written at once: one parse per element, not one per property, for a few hundred of them
    let css = "";
    for (let i = 0; i < computed.length; i++) {
      const name = computed[i];
      if (NEVER.test(name) || (root && NOT_ROOT.has(name))) continue;
      css += `${name}:${computed.getPropertyValue(name)};`;
    }
    to.style.cssText = `${css}transition:none;animation:none;`;
  }
  // A canvas's picture isn't in the copy: drawn again
  if (from instanceof win.HTMLCanvasElement && to instanceof win.HTMLCanvasElement) {
    to.getContext("2d")?.drawImage(from, 0, 0);
  }
  const a = from.children;
  const b = to.children;
  for (let i = 0; i < a.length && i < b.length; i++) dress(a[i], b[i], false);
}

/**
 * Whether something from `target` up to `root` scrolls by this much (content px, down and right
 * positive) and isn't at its end that way. Anything else a gesture there moves is the page, which
 * iOS scrolls when nothing inside can
 */
function scrollsWithin(target: EventTarget | null, root: Element, dx: number, dy: number) {
  const win = root.ownerDocument.defaultView;
  if (!win || !(target instanceof win.Node) || !root.contains(target)) return false;
  for (let el = target instanceof win.Element ? target : target.parentElement; el; el = el.parentElement) {
    const { overflowX, overflowY } = win.getComputedStyle(el);
    const y =
      /auto|scroll/.test(overflowY) &&
      (dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : dy < 0 && el.scrollTop > 0);
    const x =
      /auto|scroll/.test(overflowX) &&
      (dx > 0 ? el.scrollLeft + el.clientWidth < el.scrollWidth - 1 : dx < 0 && el.scrollLeft > 0);
    if (x || y) return true;
    if (el === root) break;
  }
  return false;
}

/**
 * A copy made a picture of the element: no ids, its form controls in no form or group (a checked
 * radio in a group of the page's would uncheck its original), its frames empty boxes rather than
 * loaded again, its videos their frame as it is. Before it's in the page, so nothing of it loads
 */
function picture(from: HTMLElement, to: HTMLElement) {
  const doc = from.ownerDocument;
  const all = (el: HTMLElement, selector: string) => [
    ...(el.matches(selector) ? [el] : []),
    ...el.querySelectorAll(selector),
  ];
  for (const el of all(to, "[id]")) el.removeAttribute("id");
  for (const el of all(to, CONTROLS)) {
    el.removeAttribute("name");
    el.removeAttribute("form");
  }
  for (const frame of all(to, "iframe, embed")) frame.replaceWith(doc.createElement("div"));
  const videos = all(from, "video") as HTMLVideoElement[];
  all(to, "video").forEach((video, i) => {
    const source = videos[i];
    const frame = doc.createElement("canvas");
    frame.width = source.videoWidth;
    frame.height = source.videoHeight;
    if (source.readyState >= 2) frame.getContext("2d")?.drawImage(source, 0, 0);
    video.replaceWith(frame);
  });
}

export function createLift(options: LiftOptions): Lift {
  const { element, menu } = options;
  let { onOpen, onClose, onHighlight, onSelect, preview } = options;
  const doc = element.ownerDocument;
  const win = doc.defaultView ?? window;
  let items = options.items ?? ITEMS;
  let delay = options.delay ?? DELAY;
  let scale = options.scale ?? SCALE;
  let dim = options.dim ?? DIM;
  let blur = options.blur ?? BLUR;
  let placement = options.placement ?? "auto";
  let rise = options.spring ?? defaultLiftSpring;
  const reduced = win.matchMedia("(prefers-reduced-motion: reduce)");
  const own = { callout: element.style.getPropertyValue("-webkit-touch-callout") };
  // A long press is the lift's, not iOS's callout
  element.style.setProperty("-webkit-touch-callout", "none");

  let opened = false;
  let closing = false;
  let destroyed = false;

  /** While open: the dialog, the dim in it, what's lifted, and how to put everything back */
  let layer: HTMLDialogElement | null = null;
  let shade: HTMLElement | null = null;
  let copy: HTMLElement | null = null;
  let restore: (() => void) | null = null;
  /** Where what's lifted is laid out in the dialog, unscaled: the element's box for a copy */
  let laid = { left: 0, top: 0, width: 0, height: 0 };
  /** The window's width as it opened: a narrower or wider one closes it, a shorter one doesn't */
  let openWidth = 0;
  /** Where the menu's growth comes from, for its scale */
  let menuOrigin = "50% 0";

  const draw = ({ x, y, s, p }: typeof ZERO) => {
    if (copy) copy.style.transform = `translate(${px(x)}, ${px(y)}) scale(${s.toFixed(4)})`;
    // The dim and blur themselves, not the opacity of what blurs: Safari draws a fading backdrop
    // filter in squares
    if (shade) {
      const q = Math.max(0, Math.min(1, p));
      shade.style.backgroundColor = `rgb(0 0 0 / ${(dim * q).toFixed(4)})`;
      const filter = q > 0 ? `blur(${(blur * q).toFixed(2)}px)` : "none";
      shade.style.setProperty("-webkit-backdrop-filter", filter);
      shade.style.backdropFilter = filter;
    }
    if (menu && layer?.contains(menu)) {
      menu.style.opacity = String(Math.max(0, Math.min(1, p)));
      menu.style.transform = `scale(${(0.6 + 0.4 * p).toFixed(4)})`;
      menu.style.transformOrigin = menuOrigin;
    }
  };
  const spring = new SpringAnimator(ZERO, rise, draw, () => {
    if (closing) teardown();
  });

  /** The press under way, until it lifts, is let go or given up */
  let press: { id: number; x: number; y: number; timer: number; unhold: () => void } | null = null;
  /** The finger that lifted it, followed onto the menu until it's let go; no text selected meanwhile */
  let finger: { id: number; x: number; y: number; moved: boolean; unhold: () => void } | null = null;
  let highlighted: HTMLElement | null = null;
  /** Where a touch on the open lift last was, for which way it scrolls */
  let touchAt: { x: number; y: number } | null = null;
  /** The menu key or Shift+F10 just pressed: the context menu that follows is the keyboard's */
  let byKeyboard = false;

  const endPress = () => {
    if (!press) return;
    win.clearTimeout(press.timer);
    press.unhold();
    press = null;
    element.removeAttribute("data-lifting");
    win.removeEventListener("pointermove", pressMoved, true);
    win.removeEventListener("pointerup", pressEnded, true);
    win.removeEventListener("pointercancel", pressEnded, true);
  };

  const down = (e: PointerEvent) => {
    if (destroyed || opened || press || !e.isPrimary) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    press = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      timer: win.setTimeout(() => lift(e.pointerId), delay),
      unhold: holdSelection(doc),
    };
    element.setAttribute("data-lifting", "");
    win.addEventListener("pointermove", pressMoved, true);
    win.addEventListener("pointerup", pressEnded, true);
    win.addEventListener("pointercancel", pressEnded, true);
  };
  const pressMoved = (e: PointerEvent) => {
    if (!press || e.pointerId !== press.id) return;
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP) endPress();
  };
  const pressEnded = (e: PointerEvent) => {
    if (press && e.pointerId === press.id) endPress();
  };

  /** Lifted by a long press: the finger is followed onto the menu */
  const lift = (id: number) => {
    const at = press;
    if (!at) return;
    // The selection stays held while the finger slides onto the menu, its text unselected
    const unhold = at.unhold;
    at.unhold = () => {};
    endPress();
    open(false);
    finger = { id, x: at.x, y: at.y, moved: false, unhold };
    // Hit-tested from here on, not kept by the element: what's under it now is the menu
    try {
      element.releasePointerCapture(id);
    } catch {
      // Never captured
    }
    win.addEventListener("pointermove", fingerMoved, true);
    win.addEventListener("pointerup", fingerUp, true);
    win.addEventListener("pointercancel", fingerUp, true);
  };

  const itemAt = (x: number, y: number) => {
    if (!menu) return null;
    const hit = doc.elementFromPoint(x, y)?.closest<HTMLElement>(items) ?? null;
    return hit && menu.contains(hit) && !hit.matches(DISABLED) ? hit : null;
  };
  const highlight = (item: HTMLElement | null) => {
    if (item === highlighted) return;
    highlighted?.removeAttribute("data-highlighted");
    highlighted = item;
    item?.setAttribute("data-highlighted", "");
    onHighlight?.(item);
  };

  const fingerMoved = (e: PointerEvent) => {
    if (!finger || e.pointerId !== finger.id) return;
    if (!finger.moved && Math.hypot(e.clientX - finger.x, e.clientY - finger.y) > SLOP) finger.moved = true;
    if (finger.moved) highlight(itemAt(e.clientX, e.clientY));
  };
  const endFinger = () => {
    finger?.unhold();
    finger = null;
    win.removeEventListener("pointermove", fingerMoved, true);
    win.removeEventListener("pointerup", fingerUp, true);
    win.removeEventListener("pointercancel", fingerUp, true);
  };
  const fingerUp = (e: PointerEvent) => {
    if (!finger || e.pointerId !== finger.id) return;
    const item = e.type === "pointerup" && finger.moved ? itemAt(e.clientX, e.clientY) : null;
    endFinger();
    // The click this release would make on its own is dropped: on the element it lifted, or on the
    // dim, which would close it. A chosen item gets its click from us
    swallowClick(doc, item);
    if (item) item.click();
    else highlight(null);
  };

  const contextMenu = (e: MouseEvent) => {
    if (destroyed) return;
    e.preventDefault();
    const keyboard = byKeyboard;
    byKeyboard = false;
    if (opened) return;
    // A browser's own long press, ahead of ours: the finger is still followed
    if (press) return lift(press.id);
    open(keyboard);
  };
  /** The finger that lifted it doesn't scroll the page: its touches are the element's, wherever it goes */
  const stillFinger = (e: TouchEvent) => {
    if (finger && e.cancelable) e.preventDefault();
  };
  const keyDown = (e: KeyboardEvent) => {
    byKeyboard = e.key === "ContextMenu" || (e.shiftKey && e.key === "F10");
  };

  /** A choice: told, then closed. Its own click has run by then */
  const chosen = (e: MouseEvent) => {
    const item = (e.target as Element | null)?.closest<HTMLElement>(items);
    if (!item || !menu?.contains(item) || item.matches(DISABLED)) return;
    // `false` from the page: chosen, but the menu stays open (a toggle in it, say)
    if (onSelect?.(item) === false) return;
    close();
  };

  /**
   * Where everything goes: the lifted thing's shift, the menu's place and where it grows from.
   * `lifted` is where it shows once lifted, before any shift
   */
  const place = (
    lifted: { left: number; top: number; width: number; height: number },
    menuSize: { w: number; h: number },
  ) => {
    const vw = win.innerWidth;
    const vh = win.innerHeight;
    const { left, width: w, height: h } = lifted;
    let top = lifted.top;
    let dy = 0;
    let menuTop = 0;
    let above = false;
    if (menu) {
      const roomBelow = vh - MARGIN - (top + h + GAP);
      const roomAbove = top - GAP - MARGIN;
      above = placement === "above" || (placement === "auto" && roomBelow < menuSize.h && roomAbove >= menuSize.h);
      if (above) {
        menuTop = top - GAP - menuSize.h;
        if (menuTop < MARGIN) dy = MARGIN - menuTop;
      } else {
        menuTop = top + h + GAP;
        // No room under: it moves up for the menu, as far as the top allows
        const over = menuTop + menuSize.h - (vh - MARGIN);
        if (over > 0) dy = -Math.min(over, Math.max(0, top - MARGIN));
      }
      menuTop += dy;
      top += dy;
    }
    // Its side by the element's side of the screen, kept in from the edges
    const leftAligned = left + w / 2 < vw / 2;
    const menuLeft = Math.min(Math.max(MARGIN, leftAligned ? left : left + w - menuSize.w), vw - MARGIN - menuSize.w);
    const originX = Math.min(Math.max(0, left + w / 2 - menuLeft), menuSize.w);
    return { dy, menuTop, menuLeft, origin: `${px(originX)} ${above ? "100%" : "0"}` };
  };

  /**
   * The element's box as laid out: its transitions off for the read, or a press's scale still easing
   * back would make it smaller
   */
  const measure = () => {
    const ownTransition = element.style.transition;
    element.style.transition = "none";
    const box = still(element, () => element.getBoundingClientRect(), "none");
    element.style.transition = ownTransition;
    return box;
  };
  /** The springs' values that put what's lifted exactly over a box of the element's */
  const over = (box: { left: number; top: number; width: number; height: number }) => ({
    x: box.left + box.width / 2 - (laid.left + laid.width / 2),
    y: box.top + box.height / 2 - (laid.top + laid.height / 2),
    s: laid.width ? box.width / laid.width : 1,
  });

  const open = (focusFirst = true) => {
    if (destroyed || opened) return;
    // One at a time: another lift open in this page closes at once
    active.get(doc)?.();
    active.set(doc, teardown);
    opened = true;
    closing = false;
    openWidth = win.innerWidth;
    style(doc);

    // Its box as drawn now (giving a little under the press, say), and as laid out
    const drawn = element.getBoundingClientRect();
    const box = measure();

    layer = doc.createElement("dialog");
    layer.setAttribute("data-fk-lift", "");
    layer.setAttribute("aria-label", menu?.getAttribute("aria-label") ?? "Menu");
    if (!focusFirst) layer.autofocus = true;
    // Written whole, so no rule of the page's reaches it: a focused dialog's rounded corners, say,
    // would clip the dim to them
    layer.style.cssText =
      "position: fixed; inset: 0; width: 100%; height: 100%; max-width: none; max-height: none; " +
      "margin: 0; padding: 0; border: 0; border-radius: 0; background: transparent; overflow: hidden; " +
      "outline: none; box-shadow: none; opacity: 1; transform: none; filter: none; clip-path: none; " +
      "mask: none; color: inherit; font: inherit; overscroll-behavior: contain;";
    shade = doc.createElement("div");
    shade.style.cssText = "position: absolute; inset: 0;";
    layer.append(shade);

    // What's lifted: a preview of yours, kept to put back where it was, or a copy made a picture
    const given = typeof preview === "function" ? preview(element) : preview;
    let putPreview = () => {};
    if (given) {
      copy = given;
      const home = { parent: given.parentNode, next: given.nextSibling, style: given.getAttribute("style") };
      const attrs = ["aria-hidden", "inert", "data-lifted"].map((name) => [name, given.getAttribute(name)] as const);
      putPreview = () => {
        if (home.parent) home.parent.insertBefore(given, home.next?.parentNode === home.parent ? home.next : null);
        else given.remove();
        if (home.style === null) given.removeAttribute("style");
        else given.setAttribute("style", home.style);
        for (const [name, value] of attrs) {
          if (value === null) given.removeAttribute(name);
          else given.setAttribute(name, value);
        }
      };
    } else {
      copy = element.cloneNode(true) as HTMLElement;
      picture(element, copy);
      dress(element, copy, true);
      copy.removeAttribute("data-lifting");
      copy.style.width = px(box.width);
      copy.style.height = px(box.height);
      copy.style.boxSizing = "border-box";
    }
    copy.setAttribute("aria-hidden", "true");
    copy.inert = true;
    copy.setAttribute("data-lifted", "");
    copy.style.position = "absolute";
    copy.style.left = px(box.left);
    copy.style.top = px(box.top);
    copy.style.margin = "0";
    copy.style.transformOrigin = "50% 50%";
    copy.style.pointerEvents = "none";
    layer.append(copy);

    // The menu, moved in, hidden until it's placed
    let putBack = () => {};
    if (menu) {
      const mark = doc.createComment("lift");
      menu.before(mark);
      const ownMenu = { style: menu.getAttribute("style"), hidden: menu.hidden };
      menu.hidden = false;
      menu.style.position = "absolute";
      menu.style.margin = "0";
      menu.style.transition = "none";
      menu.style.opacity = "0";
      layer.append(menu);
      putBack = () => {
        mark.replaceWith(menu);
        if (ownMenu.style === null) menu.removeAttribute("style");
        else menu.setAttribute("style", ownMenu.style);
        menu.hidden = ownMenu.hidden;
      };
    }
    // Open before anything's measured: a closed dialog isn't laid out. Nothing shows yet: the copy is
    // over the element, the dim and the menu not there, all in this task
    doc.body.append(layer);
    layer.showModal();

    // Laid out: a copy on the element's box, a preview at its own size centered on it, on screen
    const vw = win.innerWidth;
    const vh = win.innerHeight;
    let liftScale = scale;
    if (given) {
      const w = given.offsetWidth;
      const h = given.offsetHeight;
      const clamp = (v: number, size: number, room: number) =>
        Math.min(Math.max(MARGIN, v), Math.max(MARGIN, room - MARGIN - size));
      laid = {
        left: clamp(box.left + box.width / 2 - w / 2, w, vw),
        top: clamp(box.top + box.height / 2 - h / 2, h, vh),
        width: w,
        height: h,
      };
      copy.style.left = px(laid.left);
      copy.style.top = px(laid.top);
      liftScale = 1;
    } else {
      laid = { left: box.left, top: box.top, width: box.width, height: box.height };
    }
    const lifted = {
      left: laid.left - (laid.width * (liftScale - 1)) / 2,
      top: laid.top - (laid.height * (liftScale - 1)) / 2,
      width: laid.width * liftScale,
      height: laid.height * liftScale,
    };
    const at = place(lifted, menu ? { w: menu.offsetWidth, h: menu.offsetHeight } : { w: 0, h: 0 });
    if (menu) {
      menu.style.left = px(at.menuLeft);
      menu.style.top = px(at.menuTop);
      menuOrigin = at.origin;
    }

    const ownVisibility = element.style.visibility;
    element.style.visibility = "hidden";
    element.setAttribute("data-lifted", "");

    layer.addEventListener("cancel", cancelled);
    layer.addEventListener("close", closedNatively);
    layer.addEventListener("click", clickedLayer);
    layer.addEventListener("keydown", keyed);
    layer.addEventListener("wheel", stillPage, { passive: false });
    layer.addEventListener("touchstart", touched, { passive: true });
    layer.addEventListener("touchmove", stillPage, { passive: false });
    menu?.addEventListener("click", chosen);
    win.addEventListener("resize", resized);
    doc.addEventListener("scroll", scrolled, { capture: true, passive: true });

    restore = () => {
      putBack();
      putPreview();
      element.style.visibility = ownVisibility;
      element.removeAttribute("data-lifted");
    };

    if (focusFirst) itemsOf()[0]?.focus();

    // From over the element as it's drawn now, up to lifted
    const from = { ...over(drawn), p: 0 };
    const to = { x: 0, y: at.dy, s: liftScale, p: 1 };
    spring.stop();
    spring.jump(from, { x: 0, y: 0, s: 0, p: 0 });
    draw(from);
    if (reduced.matches) {
      spring.jump(to, { x: 0, y: 0, s: 0, p: 0 });
      draw(to);
    } else spring.to(to, rise);
    onOpen?.();
  };

  const close = () => {
    if (!opened || closing) return;
    closing = true;
    endFinger();
    highlight(null);
    if (reduced.matches) {
      teardown();
      return;
    }
    // Back over the element where it is now: its page may have scrolled (a scrollbar dragged)
    spring.to({ ...over(measure()), p: 0 }, SETTLE);
  };

  const teardown = () => {
    spring.stop();
    closing = false;
    if (!opened) return;
    opened = false;
    if (active.get(doc) === teardown) active.delete(doc);
    layer?.removeEventListener("cancel", cancelled);
    layer?.removeEventListener("close", closedNatively);
    layer?.removeEventListener("click", clickedLayer);
    layer?.removeEventListener("keydown", keyed);
    layer?.removeEventListener("wheel", stillPage);
    layer?.removeEventListener("touchstart", touched);
    layer?.removeEventListener("touchmove", stillPage);
    touchAt = null;
    menu?.removeEventListener("click", chosen);
    win.removeEventListener("resize", resized);
    doc.removeEventListener("scroll", scrolled, { capture: true });
    restore?.();
    restore = null;
    if (layer?.open) layer.close();
    layer?.remove();
    layer = shade = copy = null;
    // Focus back where it was before, as a closed dialog does
    onClose?.();
  };

  /** Escape: closed with the springs, not at once as a dialog closes */
  const cancelled = (e: Event) => {
    e.preventDefault();
    close();
  };
  /**
   * Closed by the browser after all (a second Escape it doesn't let a page keep open): what was in
   * the dialog is gone at once, so the element is shown at once
   */
  const closedNatively = () => {
    if (opened) teardown();
  };
  /** A press on the dim, anywhere but the menu, closes it */
  const clickedLayer = (e: MouseEvent) => {
    if (menu?.contains(e.target as Node)) return;
    close();
  };
  /**
   * The page doesn't scroll under it; a menu that scrolls may, until its end. Anything else lets the
   * gesture through to the page, which iOS scrolls even under a modal dialog
   */
  const touched = (e: TouchEvent) => {
    const touch = e.touches[0];
    touchAt = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const stillPage = (e: WheelEvent | TouchEvent) => {
    let dx = 0;
    let dy = 0;
    if ("deltaY" in e) {
      dx = e.deltaX;
      dy = e.deltaY;
    } else {
      const touch = e.touches[0];
      if (touch && touchAt) {
        dx = touchAt.x - touch.clientX;
        dy = touchAt.y - touch.clientY;
      }
      touched(e);
    }
    if (menu && scrollsWithin(e.target, menu, dx, dy)) return;
    if (e.cancelable) e.preventDefault();
  };
  /** The items that can be chosen, in order */
  const itemsOf = () =>
    menu
      ? [...menu.querySelectorAll<HTMLElement>(items)].filter((i) => !i.matches(DISABLED) && i.getClientRects().length)
      : [];
  /** The arrow keys, Home and End go through the items; keys that scroll a page don't scroll this one */
  const keyed = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const typing = target.matches("input, textarea, select, [contenteditable]:not([contenteditable='false'])");
    const list = itemsOf();
    const at = list.indexOf(doc.activeElement as HTMLElement);
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    let next = -1;
    if (step && !typing) next = at < 0 ? (step > 0 ? 0 : list.length - 1) : (at + step + list.length) % list.length;
    else if (e.key === "Home" && !typing) next = 0;
    else if (e.key === "End" && !typing) next = list.length - 1;
    if (next >= 0 && list[next]) {
      e.preventDefault();
      list[next].focus();
      return;
    }
    // Space presses a focused button or link; anywhere else, as PageDown, it would scroll the page
    const pressable = target.matches("button, a[href], [role='menuitem'], summary, input, textarea, select");
    if (SCROLL_KEYS.has(e.key) && !typing && !(e.key === " " && pressable)) e.preventDefault();
  };
  /** Closing while its page still scrolls (a smooth scroll running on): it lands where the element goes */
  const scrolled = () => {
    if (closing) spring.retarget({ ...over(measure()), p: 0 });
  };
  /** A narrower or wider window closes it; a shorter one (a phone's bars, its keyboard) doesn't */
  const resized = () => {
    if (win.innerWidth !== openWidth) close();
  };

  element.addEventListener("pointerdown", down);
  element.addEventListener("contextmenu", contextMenu);
  element.addEventListener("touchmove", stillFinger, { passive: false });
  element.addEventListener("keydown", keyDown);

  return {
    get opened() {
      return opened;
    },
    open: () => open(true),
    close,
    set(next) {
      if ("items" in next) items = next.items ?? ITEMS;
      if ("preview" in next) preview = next.preview;
      if ("delay" in next) delay = next.delay ?? DELAY;
      if ("scale" in next) scale = next.scale ?? SCALE;
      if ("dim" in next) dim = next.dim ?? DIM;
      if ("blur" in next) blur = next.blur ?? BLUR;
      if ("placement" in next) placement = next.placement ?? "auto";
      if ("spring" in next) rise = next.spring ?? defaultLiftSpring;
      if ("onOpen" in next) onOpen = next.onOpen;
      if ("onClose" in next) onClose = next.onClose;
      if ("onHighlight" in next) onHighlight = next.onHighlight;
      if ("onSelect" in next) onSelect = next.onSelect;
      // Open, the dim and blur show the new ones at once
      if (opened && !closing) draw(spring.values());
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      endPress();
      endFinger();
      teardown();
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("contextmenu", contextMenu);
      element.removeEventListener("touchmove", stillFinger);
      element.removeEventListener("keydown", keyDown);
      element.style.setProperty("-webkit-touch-callout", own.callout);
    },
  };
}
