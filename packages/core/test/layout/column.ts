import { vi } from "vite-plus/test";

const pixels = (v: string) => parseFloat(v) || 0;
/** The layout's translation on an element, px */
export const offset = (el: Element) => {
  const [x = "0", y = "0"] = (el as HTMLElement).style.translate.split(" ");
  return { x: parseFloat(x) || 0, y: parseFloat(y) || 0 };
};
const heightOf = (el: HTMLElement) => (el.style.height ? pixels(el.style.height) : Number(el.dataset.h ?? 40));
const inFlow = (el: HTMLElement) => el.style.position !== "absolute";

/**
 * Laid out as a column, as a browser would (happy-dom lays nothing out): the children of an element
 * marked `data-root` one under the other, each as tall as its `data-h` (40 unless given), the root
 * as tall as all of them unless held
 */
export function column() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.hasAttribute("data-root")) {
      const kids = [...this.children].filter((el) => inFlow(el as HTMLElement)) as HTMLElement[];
      const total = kids.reduce((sum, el) => sum + heightOf(el), 0);
      return new DOMRect(0, 0, 300, this.style.height ? pixels(this.style.height) : total);
    }
    const root = this.parentElement;
    if (root?.hasAttribute("data-root")) {
      const { x, y } = offset(this);
      if (!inFlow(this))
        return new DOMRect(pixels(this.style.left) + x, pixels(this.style.top) + y, 300, heightOf(this));
      let top = 0;
      for (const el of root.children) {
        if (el === this) break;
        if (inFlow(el as HTMLElement)) top += heightOf(el as HTMLElement);
      }
      return new DOMRect(x, top + y, 300, heightOf(this));
    }
    return new DOMRect(0, 0, 0, 0);
  });
}

/** Nothing of the layout's on them */
export const bare = (...els: Element[]) => els.every((el) => !(el.getAttribute("style") ?? ""));
