# @liquid-web/core

What the [liquid-web](../../README.md) packages share: the spring every moving part runs on, and the
DOM attributes they recognize each other by. Nothing here touches the page by itself.

You get it with [`@liquid-web/blur`](../blur/README.md) or [`@liquid-web/morph`](../morph/README.md);
install it directly for the spring alone.

```bash
npm install @liquid-web/core
```

## API

| Export | What |
| --- | --- |
| `SpringAnimator` | The spring; types `SpringConfig`, `SpringParams` |
| `AWAY`, `PART`, `SURFACE` | The contract's attribute names |

### `SpringAnimator`

The interruptible spring that drives press and
morph, exported for your own animations.
Animates several numeric channels at once; retargeting keeps the current velocity, so reversing
mid-flight stays smooth — which CSS transitions can't do.

```ts
import { SpringAnimator, type SpringParams } from "@liquid-web/core";

const spring = new SpringAnimator(
  { width: 100, radius: 12 },
  { duration: 0.4, bounce: 0.2 }, // SwiftUI-style: perceptual duration in seconds, bounce 0..1
  ({ width, radius }) => {
    el.style.width = `${width}px`;
    el.style.borderRadius = `${radius}px`;
  },
  () => console.log("at rest"), // optional
);

spring.to({ width: 240, radius: 24 });
spring.to({ width: 100, radius: 12 }, { duration: 0.6, bounce: 0 }); // new params are optional
spring.retarget({ width: 110, radius: 12 }); // a correction of the flight under way: no new bounce
spring.values(); // current values
spring.stop();
```

Channels can also have springs of their own:

```ts
new SpringAnimator(
  { opacity: 0, scale: 1 },
  { opacity: { duration: 0.15, bounce: 0 }, scale: { duration: 0.45, bounce: 0.3 } },
  ({ opacity, scale }) => { /* … */ },
);
```

`SpringParams` is `{ duration: number; bounce: number; settle?: number }`. `duration` is a positive
perceptual duration in seconds, not a fixed completion deadline. `bounce` ranges from `0` (no
overshoot) to `1`; use a value below `1` for a spring that settles. `settle` changes the bounce
after the first reversal and defaults to `bounce`.

## Contract

The liquid-web packages never import each other. Where two meet, each marks what it does in the DOM
and reads what the others mark, so any one works alone and any two work together. The names are
exported as constants, and change only with a major version of every package.

| Attribute | Constant | Set by | Meaning |
| --- | --- | --- | --- |
| `data-lw-surface` | `SURFACE` | Melt (blur), on a group's root while it runs | Its children share one surface: a morph from one of them lifts its glass over the others or melts with them |
| `data-lw-part` | `PART` | Melt and morph, on elements they create | Not content: morph doesn't count it as a neighbor, press doesn't press it |
| `data-lw-away` | `AWAY` | Morph, on the control while its panel is out | Unseen but still focusable; melt leaves it out |

## License

MIT © Mikhail Mogilnikov. See [LICENSE](LICENSE).
