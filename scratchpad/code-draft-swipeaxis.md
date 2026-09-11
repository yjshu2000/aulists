# Swipes stop firing off scrolls — code draft

`swipeCore` currently declares both its touch listeners `{ passive: true }`, which is a promise to the browser that it will never call `preventDefault`. So the browser scrolls freely and never waits, and the row's own gesture logic runs beside it with no way to claim a gesture. There is also no `touch-action` anywhere in Falsedge's CSS, so the browser is told nothing about which directions belong to whom.

The result is two systems guessing independently, and `swipeCore` decides at `touchend` using `dx`/`dy` — the straight-line offset from where the finger landed, with the path thrown away. Scroll down 300 and back up 300 and `dy` cancels to about zero while sideways drift from two thumb arcs accumulates, so a long vertical scroll reads as a horizontal swipe.

The fix is to use the browser's own arbitration instead of racing it:

- `touch-action: pan-y` on the row — vertical belongs to the browser, horizontal belongs to us
- the axis is decided **once**, in the first few pixels, and then frozen
- a gesture that locks to vertical stops being tracked at all
- a gesture that locks to horizontal calls `preventDefault`, so the page cannot also scroll

## Open, decide while reading

1. **10px deadzone** before the axis locks — about 1.8mm, less than a fingertip's contact patch, and in the same range as the `8` the code already uses for its preview threshold.
2. **1.5× bias toward vertical.** Horizontal has to beat vertical by half again to claim the gesture, so an ambiguous diagonal start falls through to scrolling. A missed swipe costs one retry; a false swipe activates a task.
3. `touchmove` stops being passive. With `touch-action: pan-y` declared, the browser still doesn't wait on us for vertical scrolling, so this costs nothing.

---

### Block 1: Add at [style-falsedge.css line 591](../style-falsedge.css#L591)

Just prior:

```css
    border: 1px solid color-mix(in srgb, var(--glow) 55%, var(--line-soft));
```

Added:

```css
    touch-action: pan-y;
```

Just after:

```css
  }
```

---

### Block 2: Replace [falsedge.js lines 2062-2125](../falsedge.js#L2062-L2125)

```js
  function swipeCore(node, onCommit) {
    var startX = 0;
    var startY = 0;
    var dx = 0;
    var dy = 0;
    var tracking = false;
    var THRESH = 80;
    var origBg = "";
    node.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1) return;
      if (e.target.closest(".inline-edit")) {
        tracking = false;
        return;
      }
      tracking = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      dx = 0;
      dy = 0;
      origBg = node.style.backgroundColor;
    }, { passive: true });
    node.addEventListener("touchmove", function (e) {
      if (!tracking) return;
      dx = e.touches[0].clientX - startX;
      dy = e.touches[0].clientY - startY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
        node.style.transform = "translateX(" + dx * 0.5 + "px)";
        node.style.opacity = String(Math.max(0.4, 1 - Math.abs(dx) / 300));
        if (Math.abs(dx) > THRESH) {
          node.style.backgroundColor =
            "color-mix(in srgb, var(--c-green) 30%, transparent)";
        } else {
          node.style.backgroundColor = origBg;
        }
      }
    }, { passive: true });
    node.addEventListener("touchend", function (e) {
      if (!tracking) return;
      tracking = false;
      node.style.transform = "";
      node.style.opacity = "";
      node.style.backgroundColor = origBg;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > THRESH) {
        // a real swipe happened: stop the underlying button's click firing
        var btn = e.target.closest("button");
        if (btn) {
          var swallow = function (ev) {
            ev.stopPropagation();
            ev.preventDefault();
            btn.removeEventListener("click", swallow, true);
          };
          btn.addEventListener("click", swallow, true);
          setTimeout(function () {
            btn.removeEventListener("click", swallow, true);
          }, 350);
        }
        var swipeDir = "right";
        if (dx < 0) {
          swipeDir = "left";
        }
        onCommit(swipeDir);
      }
    });
  }
```

With:

```js
  function swipeCore(node, onCommit) {
    var startX = 0;
    var startY = 0;
    var dx = 0;
    var dy = 0;
    var tracking = false;
    var axis = null;
    var THRESH = 80;
    var DEADZONE = 10;
    var BIAS = 1.5;
    var origBg = "";
    node.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1) return;
      if (e.target.closest(".inline-edit")) {
        tracking = false;
        return;
      }
      tracking = true;
      axis = null;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      dx = 0;
      dy = 0;
      origBg = node.style.backgroundColor;
    }, { passive: true });
    node.addEventListener("touchmove", function (e) {
      if (!tracking) return;
      dx = e.touches[0].clientX - startX;
      dy = e.touches[0].clientY - startY;
      if (!axis) {
        if (Math.hypot(dx, dy) < DEADZONE) return;
        if (Math.abs(dx) <= Math.abs(dy) * BIAS) {
          tracking = false;
          return;
        }
        axis = "x";
      }
      // the row owns the gesture now, so the page must not scroll under it
      e.preventDefault();
      node.style.transform = "translateX(" + dx * 0.5 + "px)";
      node.style.opacity = String(Math.max(0.4, 1 - Math.abs(dx) / 300));
      if (Math.abs(dx) > THRESH) {
        node.style.backgroundColor =
          "color-mix(in srgb, var(--c-green) 30%, transparent)";
      } else {
        node.style.backgroundColor = origBg;
      }
    });
    node.addEventListener("touchend", function (e) {
      if (!tracking) return;
      tracking = false;
      node.style.transform = "";
      node.style.opacity = "";
      node.style.backgroundColor = origBg;
      if (axis !== "x" || Math.abs(dx) <= THRESH) return;
      // a real swipe happened: stop the underlying button's click firing
      var btn = e.target.closest("button");
      if (btn) {
        var swallow = function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
          btn.removeEventListener("click", swallow, true);
        };
        btn.addEventListener("click", swallow, true);
        setTimeout(function () {
          btn.removeEventListener("click", swallow, true);
        }, 350);
      }
      var swipeDir = "right";
      if (dx < 0) {
        swipeDir = "left";
      }
      onCommit(swipeDir);
    });
  }
```

---

### Block 3: changelog

increment: +0.0.1

- fix stupid scroll bug (vertical scrolling kept wrongly triggering horizontal swipes)
