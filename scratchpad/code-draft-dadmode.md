# Dad mode — code draft

A hidden per-device throttle for Hex 2^. Six taps on "shamelessly vibecoded", then a code. `baba` switches it on, `abab` switches it off, both case-insensitive, each only ever moving in its own direction. Toggling reloads the page, which is the only confirmation and reads as nothing.

Everything it changes is read through one `dadMode` flag. A device that has never had it set runs the same code it runs today.

| | normal | dad mode |
|---|---|---|
| break length | 30s | 6 min |
| break starts | only on Falsedge's stamp | on every load |
| ad while backgrounded | restarts on return | keeps counting |
| ad across a page close | rerolled | resumes |
| grass on × | +1 | none |
| `+1 [grass]` label | shown | removed |

**Why the ad persists rather than the break.** The point is pacing, not blocking. If the timer were the thing that survived, opening the app after three days away would greet him with a countdown and he would simply stop opening it. So an ad that was already running resumes where it left off, and anything else — no ad, or one whose time has passed — hands back a fresh six minutes on the board.

**The navaway escape closes itself.** You chose to leave the hole where `.navaway` clears `BREAK_KEY` on the way out. It stops working here anyway: the lockout only shows while a stored ad is live, and that stored ad is what `startSession()` checks, so leaving and returning resumes the ad rather than clearing anything. Reopening it would mean deliberately adding a bypass.

## Open, decide while reading

1. **Six taps within 2s of each other** or the count resets, so six taps spread over an afternoon never add up.
2. **A wrong code, or Cancel, does nothing at all** — no toast, no shake, no second chance. Silence.
3. `hex2.dad`, `hex2.ad.end` and `hex2.ad.total` as the three storage keys.
4. The reload is the only feedback. Nothing on screen ever says dad mode is on.
5. `.earn` is **removed** in dad mode rather than hidden, so nothing promises grass that will not be paid.

---

### Block 1: Add at [hex2-core.js line 41](../hex2-core.js#L41)

Just prior:

```js
  const FAKE_AD_MIN_MS = 30 * 1000;
  const FAKE_AD_MAX_MS = 120 * 1000;
```

Added:

```js
  // hidden per-device throttle; see startSession()
  const DAD_KEY = "hex2.dad";
  const DAD_BREAK_MS = 6 * 60 * 1000;
  const AD_END_KEY = "hex2.ad.end";
  const AD_TOTAL_KEY = "hex2.ad.total";
  const DAD_ON_CODE = "baba";
  const DAD_OFF_CODE = "abab";
  const DAD_TAPS = 6;
  const DAD_TAP_GAP_MS = 2000;
```

Just after:

```js
  const SWIPE_MIN = 22;      // px of travel before a drag counts as a swipe
```

---

### Block 2: Replace [hex2-core.js lines 1431-1441](../hex2-core.js#L1431-L1441)

```js
  function startFakeAd() {
    if (!fakeAd) {
      return;
    }
    const span = FAKE_AD_MAX_MS - FAKE_AD_MIN_MS;
    fakeAdTotal = FAKE_AD_MIN_MS + Math.floor(Math.random() * (span + 1));
    fakeAdReady = false;
    fakeAd.disabled = true;
    fakeAd.classList.remove("ready");
    restartFakeAd();
  }
```

With:

```js
  // Dad mode picks a stored ad back up rather than rolling a fresh one, so
  // closing the page mid-ad costs nothing and gains nothing.
  function startFakeAd() {
    if (!fakeAd) {
      return;
    }
    if (dadMode && resumeStoredAd()) {
      return;
    }
    const span = FAKE_AD_MAX_MS - FAKE_AD_MIN_MS;
    fakeAdTotal = FAKE_AD_MIN_MS + Math.floor(Math.random() * (span + 1));
    fakeAdReady = false;
    fakeAd.disabled = true;
    fakeAd.classList.remove("ready");
    if (dadMode) {
      storeAd(Date.now() + fakeAdTotal, fakeAdTotal);
    }
    restartFakeAd();
  }

  // The total is stored beside the end because the ring's fill is a share of
  // it, and a reload would otherwise have nothing to measure against.
  function storeAd(end, total) {
    store.set(AD_END_KEY, String(end));
    store.set(AD_TOTAL_KEY, String(total));
  }

  function clearStoredAd() {
    store.set(AD_END_KEY, "0");
    store.set(AD_TOTAL_KEY, "0");
  }

  /**
   * Resumes a stored ad, if one is still running.
   * @returns {boolean} false when there is nothing to resume.
   */
  function resumeStoredAd() {
    const end = parseInt(store.get(AD_END_KEY) || "0", 10);
    const total = parseInt(store.get(AD_TOTAL_KEY) || "0", 10);
    if (!end || !total || Date.now() >= end) {
      return false;
    }
    fakeAdTotal = total;
    fakeAdReady = false;
    fakeAd.disabled = true;
    fakeAd.classList.remove("ready");
    fakeAdEnd = end;
    tickFakeAd();
    return true;
  }
```

---

### Block 3: Add at [hex2-core.js line 1494](../hex2-core.js#L1494)

Just prior:

```js
    if (fakeAdRaf) {
      cancelAnimationFrame(fakeAdRaf);
      fakeAdRaf = 0;
    }
```

Added:

```js
    // dad mode pays nothing, so there is no pop to wait out
    if (dadMode) {
      clearStoredAd();
      lockout.classList.remove("show");
      store.set(BREAK_KEY, String(Date.now()));
      startBreakTimer();
      return;
    }
```

Just after:

```js
    payGrass();
```

---

### Block 4: Add at [hex2-core.js line 1518](../hex2-core.js#L1518)

Just prior:

```js
  function endPeek() {
    lockout.classList.remove("peek");
  }
```

Added:

```js
  // Dad mode, set by the hidden toggle in the header. Read once: everything it
  // changes is read through this, and nothing below runs without it, so a
  // device that has never had it set behaves exactly as it always did.
  const dadMode = store.get(DAD_KEY) === "1";

  function breakLength() {
    if (dadMode) {
      return DAD_BREAK_MS;
    }
    return BREAK_MS;
  }

  // What the page opens on. Normally that is Falsedge's stamp and nothing else;
  // arriving straight at the URL is untimed on purpose.
  //
  // Dad mode has no such door, so it opens its own cycle instead, and the ad is
  // what persists rather than the break: an ad still running when the page was
  // closed picks up where it left off, and anything else hands back a fresh six
  // minutes. Coming back days later then opens on the board rather than on a
  // countdown, which is the point of pacing rather than blocking.
  function startSession() {
    if (!dadMode) {
      startBreakTimer();
      return;
    }
    const end = parseInt(store.get(AD_END_KEY) || "0", 10);
    if (end && Date.now() < end) {
      showLockout();
      return;
    }
    clearStoredAd();
    store.set(BREAK_KEY, String(Date.now()));
    startBreakTimer();
  }
```

Just after:

```js
  function startBreakTimer() {
```

---

### Block 5: Replace [hex2-core.js line 1523](../hex2-core.js#L1523)

```js
    const left = started + BREAK_MS - Date.now();
```

With:

```js
    const left = started + breakLength() - Date.now();
```

---

### Block 6: Replace [hex2-core.js line 1732](../hex2-core.js#L1732)

```js
        restartFakeAd();
```

With:

```js
        // dad mode's ad keeps counting while the page is away, so coming back
        // resumes it rather than starting it over
        if (dadMode) {
          if (fakeAdRaf) {
            cancelAnimationFrame(fakeAdRaf);
            fakeAdRaf = 0;
          }
          tickFakeAd();
          return;
        }
        restartFakeAd();
```

---

### Block 7: Add at [hex2-core.js line 1736](../hex2-core.js#L1736)

Just prior:

```js
      });
    }
```

Added:

```js
    // Six taps on the subtitle, then the code. Nothing is marked and nothing
    // reacts until the sixth, so a stray tap costs nothing. The gap resets the
    // count, so six taps spread over an afternoon do not add up.
    //
    // The codes only ever travel in their own direction: baba switches it on,
    // abab - the same word backwards - switches it off. Entering the wrong
    // one, or cancelling, does nothing at all.
    const brandSub = document.querySelector(".brand small");
    let dadTaps = 0;
    let dadLastTap = 0;
    if (brandSub) {
      brandSub.addEventListener("click", function () {
        const now = Date.now();
        if (now - dadLastTap > DAD_TAP_GAP_MS) {
          dadTaps = 0;
        }
        dadLastTap = now;
        dadTaps++;
        if (dadTaps < DAD_TAPS) {
          return;
        }
        dadTaps = 0;
        const typed = String(prompt("enter secret code") || "").toLowerCase();
        if (!dadMode && typed === DAD_ON_CODE) {
          store.set(DAD_KEY, "1");
          location.reload();
          return;
        }
        if (dadMode && typed === DAD_OFF_CODE) {
          store.set(DAD_KEY, "0");
          location.reload();
        }
      });
    }

    // no grass is paid in dad mode, so the promise beside the x would be a lie
    if (dadMode && earn) {
      earn.remove();
    }
```

Just after:

```js
    computeLayout();
```

---

### Block 8: Replace [hex2-core.js line 1746](../hex2-core.js#L1746)

```js
    startBreakTimer();
```

With:

```js
    startSession();
```

---

### Block 9: changelog

`about.html` is public and he can read it. A truthful entry describes the backdoor, so the version bump needs a decision of its own: no entry at all, a deliberately vague one, or the honest one.
