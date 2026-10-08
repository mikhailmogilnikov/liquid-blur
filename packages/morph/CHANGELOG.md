# Changelog

## 1.0.0

First release.

- A control grows into a panel and shrinks back: one shape the whole way, with independent springs for center, size and progress, interruptible in either direction with its velocity kept.
- Works on any element: the shape is a copy of the control. With `@liquid-web/blur` it's the same glass, and inside a glass group it lifts over the group or melts with it, through the liquid-web DOM contract.
- Each corner goes from the control's radius to the panel's, circular all the way; corner shapes interpolate as a superellipse where `corner-shape` is supported.
- Open, the glass follows the panel when its content or the window resizes; `update()` for any other move.
- The control stays focusable and readable while its panel is out (`opacity: 0`, `data-lw-away`).
- `phase`, and promises from `open()`, `close()` and `toggle()`; `{ instant: true }`; `initialOpen`; `dismiss` for Escape and outside presses; `onStart` and `onRest`; partial spring settings; a `container` for the glass out of a clipping parent.
- Keeps a translation of the panel's own (`translate: -50% -50%`) under its own.
- ESM with TypeScript declarations. Depends on `@liquid-web/core`.

### Compatibility

- Create morphs after mounting or hydration. Rotated or scaled ancestors aren't supported, nor a panel transform other than a translation.
