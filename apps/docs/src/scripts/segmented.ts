import { createIndicator } from "@fluidkit/core";

/**
 * A `.seg`: buttons with `data-value`, one of them `aria-pressed`, and a `.seg__thumb` resting on
 * it. The thumb is an indicator: pressed and dragged across the buttons it follows the pointer, and
 * the one it's released on is chosen. It follows font loading and resizes on its own.
 */
export function segmented(seg: HTMLElement, onChange?: (value: string) => void) {
  const thumb = seg.querySelector<HTMLElement>(".seg__thumb");
  const buttons = [...seg.querySelectorAll<HTMLButtonElement>("button[data-value]")];

  const pressed = () => buttons.find((b) => b.getAttribute("aria-pressed") === "true");

  // The thumb shows the choice, not the focus: keyboard focus keeps its own ring
  const indicator = thumb
    ? createIndicator({
        container: seg,
        indicator: thumb,
        items: "button[data-value]",
        trigger: "press",
        focus: false,
        rest: pressed() ?? null,
      })
    : null;

  const select = (value: string, silent = false) => {
    for (const b of buttons) b.setAttribute("aria-pressed", String(b.dataset.value === value));
    if (indicator) indicator.rest = pressed() ?? null;
    if (!silent) onChange?.(value);
  };

  for (const b of buttons) {
    b.addEventListener("click", () => {
      if (b.getAttribute("aria-pressed") !== "true") select(b.dataset.value!);
    });
  }

  return { select, value: () => pressed()?.dataset.value };
}
