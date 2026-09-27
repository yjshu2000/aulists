# Hex 2^ fake ad lockout persistence — code draft

Last updated: 2026-09-26 21:18

Persists the Hex 2^ ad lockout across page reloads and direct URL visits, enforces the 30s break timer on any entry when Falsedge data exists, ensures launching from Falsedge's "Go to Hex 2^" button always starts a fresh break, and pauses/resets the ad timer on desktop window blur.

1. `index.html`: Clears `hex2.ad.active` on `#hexLink` click so launching from Falsedge always wipes any prior ad lockout and starts a fresh 30s.
2. `hex2-core.js`: Adds `AD_KEY` ("hex2.ad.active"), `FALSEDGE_KEY` ("falsedge.data"), and `store.remove()`.
3. `hex2-core.js`: `showLockout` sets `AD_KEY` to `"1"`.
4. `hex2-core.js`: `closeFakeAd` removes `AD_KEY` when the fake ad is sat through and completed.
5. `hex2-core.js`: `startBreakTimer` gates break timing on `FALSEDGE_KEY`, restores the ad lockout immediately if `AD_KEY` is active, and arms a 30s timer on fresh entry.
6. `hex2-core.js`: Adds `window` `blur` and `focus` listeners alongside `visibilitychange` so clicking off-window on desktop also pauses/resets the ad timer.

---

### Block 1: Replace [index.html lines 32-35](../index.html#L32-L35)

```html
  try {
    localStorage.setItem("hex2.break.start", String(Date.now()));
  } catch (e) {
```

With:

```html
  try {
    localStorage.setItem("hex2.break.start", String(Date.now()));
    localStorage.removeItem("hex2.ad.active");
  } catch (e) {
```

---

### Block 2: Replace [hex2-core.js lines 28-29](../hex2-core.js#L28-L29)

```js
  const BREAK_KEY = "hex2.break.start";
  const GRASS_KEY = "grass.count";
```

With:

```js
  const BREAK_KEY = "hex2.break.start";
  const AD_KEY = "hex2.ad.active";
  const FALSEDGE_KEY = "falsedge.data";
  const GRASS_KEY = "grass.count";
```

---

### Block 3: Add at [hex2-core.js line 94](../hex2-core.js#L94)

Just prior:

```js
    set(k, v) {
      try {
        localStorage.setItem(k, v);
      } catch (e) {
        // private mode or a full quota; the game just stops persisting
      }
    },
```

Added:

```js
    remove(k) {
      try {
        localStorage.removeItem(k);
      } catch (e) {}
    },
```

---

### Block 4: Replace [hex2-core.js line 1560](../hex2-core.js#L1560)

```js
    lockout.classList.add("show");
    startFakeAd();
```

With:

```js
    lockout.classList.add("show");
    store.set(AD_KEY, "1");
    startFakeAd();
```

---

### Block 5: Replace [hex2-core.js line 1630](../hex2-core.js#L1630)

```js
    payGrass();
    // the pop plays over the lockout, so the break's 30s starts after it
```

With:

```js
    payGrass();
    store.remove(AD_KEY);
    // the pop plays over the lockout, so the break's 30s starts after it
```

---

### Block 6: Replace [hex2-core.js lines 1654-1665](../hex2-core.js#L1654-L1665)

```js
  function startBreakTimer() {
    const started = parseInt(store.get(BREAK_KEY) || "0", 10);
    if (!started) {
      return;
    }
    const left = started + BREAK_MS - Date.now();
    if (left <= 0) {
      showLockout();
      return;
    }
    setTimeout(showLockout, left);
  }
```

With:

```js
  let breakTimer = 0;

  function startBreakTimer() {
    const hasFalsedge = Boolean(store.get(FALSEDGE_KEY));
    if (!hasFalsedge) {
      return;
    }
    if (store.get(AD_KEY) === "1") {
      showLockout();
      return;
    }
    let started = parseInt(store.get(BREAK_KEY) || "0", 10);
    if (!started) {
      started = Date.now();
      store.set(BREAK_KEY, String(started));
    }
    const left = started + BREAK_MS - Date.now();
    if (breakTimer) {
      clearTimeout(breakTimer);
      breakTimer = 0;
    }
    if (left <= 0) {
      showLockout();
      return;
    }
    breakTimer = setTimeout(showLockout, left);
  }
```

---

### Block 7: Add at [hex2-core.js line 1891](../hex2-core.js#L1891)

Just prior:

```js
        restartFakeAd();
      });
    }
```

Added:

```js
      window.addEventListener("blur", function () {
        if (fakeAdReady || !lockout.classList.contains("show")) {
          return;
        }
        if (fakeAdRaf) {
          cancelAnimationFrame(fakeAdRaf);
          fakeAdRaf = 0;
        }
      });
      window.addEventListener("focus", function () {
        if (fakeAdReady || !lockout.classList.contains("show")) {
          return;
        }
        restartFakeAd();
      });
```
