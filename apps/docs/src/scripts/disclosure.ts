import { createMorph, type Morph, type MorphOptions } from "@liquid-web/morph";

/**
 * A control that flows into its panel and back: what a menu needs on top of a morph, until the UI
 * layer has it. The control's `aria-expanded`, Escape and a press outside close it, focus goes into
 * the panel as it opens and back to the control as it closes.
 */
export type Disclosure = {
  readonly morph: Morph;
  readonly isOpen: boolean;
  open(): Promise<boolean>;
  close(): Promise<boolean>;
  toggle(): Promise<boolean>;
  destroy(): void;
};

export function disclosure(
  control: HTMLElement,
  panel: HTMLElement,
  options: Omit<MorphOptions, "states" | "initial"> & {
    /** What's marked expanded, if not the control: a button inside it */
    trigger?: HTMLElement;
  } = {},
): Disclosure {
  const { trigger = control, ...rest } = options;
  const morph = createMorph({
    ...rest,
    states: [control, panel],
    onStart(to, from) {
      trigger.setAttribute("aria-expanded", String(to === panel));
      // The panel is itself on its way in, live: focus can go into it at once
      if (to === panel)
        panel.querySelector<HTMLElement>("button, [href], input, [tabindex]")?.focus({ preventScroll: true });
      rest.onStart?.(to, from);
    },
    onRest(at) {
      // Swapped at once (reduced motion), it wasn't in sight to take focus before
      if (at === panel && !panel.contains(document.activeElement))
        panel.querySelector<HTMLElement>("button, [href], input, [tabindex]")?.focus({ preventScroll: true });
      if (at === control && panel.contains(document.activeElement)) trigger.focus({ preventScroll: true });
      rest.onRest?.(at);
    },
  });
  trigger.setAttribute("aria-expanded", "false");
  const open = () => morph.to(panel);
  const close = () => morph.to(control);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && morph.current === panel && !e.defaultPrevented) close();
  };
  // Capturing: a handler that stops the press on its way doesn't keep the panel open
  const onPress = (e: PointerEvent) => {
    if (morph.current !== panel) return;
    const target = e.target as Element | null;
    if (target && (panel.contains(target) || control.contains(target) || target.closest("[data-lw-part]"))) return;
    close();
  };
  document.addEventListener("keydown", onKey);
  document.addEventListener("pointerdown", onPress, true);
  return {
    morph,
    get isOpen() {
      return morph.current === panel;
    },
    open,
    close,
    toggle: () => (morph.current === panel ? close() : open()),
    destroy() {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPress, true);
      trigger.removeAttribute("aria-expanded");
      morph.destroy();
    },
  };
}
