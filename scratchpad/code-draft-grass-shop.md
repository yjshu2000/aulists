# Code draft: grass shop items

Last updated: 2026-11-20 00:44

## How it hangs together

- **Grass spent in the shop** comes straight off `grass.count`. Undo never touches that key, and Falsedge's and Hex 2^'s balance maths keep working unchanged.
- **Bought pts** go in a new key `grass.shop.pts`. Falsedge shows `state.pts` + that key everywhere pts are shown or used in ledger maths. (Writing them into `state.pts` would get them wiped the next time anything earlier is undone, since undo restores the whole snapshot.)
- **Bypassers** are split in two, same trick as grass:
  - bought → `grass.shop.bypassers` (outside `state`, undo can't touch)
  - spent → `state.bypassUsed` (inside `state`, so undoing the activation refunds it)
  - on hand = bought − spent
- **Spending a bypasser** happens only once every other check has passed (text, mode, time, date, deadline), so a refused activation never eats one. It's spent right after the activation's own `pushUndo`, so that undo entry refunds it.
- An `others` row that's both on cooldown *and* under lockdown costs **one** bypasser, not two.
- Shop purchases take **two taps**: first tap arms the item ("buy +1 pts?"), second tap within 3s buys.

---

### Block 1: Replace [falsedge.js lines 27-30](../falsedge.js#L27-L30)

```js
  var STREAK_LOCKDOWN_MS = 36 * 60 * 60 * 1000;
  // grass on hand is this stored count less `state.grassSpent`
  var GRASS_KEY = "grass.count";
  var TIER_POINTS = [6, 3, 2, 1];
```

With:

```js
  var STREAK_LOCKDOWN_MS = 36 * 60 * 60 * 1000;
  // grass on hand is this stored count less `state.grassSpent`
  var GRASS_KEY = "grass.count";
  // Grass Shop's purchases. Kept outside `state` so undo never touches them;
  // pts on hand add the bought ones, bypassers less `state.bypassUsed`.
  var SHOP_PTS_KEY = "grass.shop.pts";
  var SHOP_BYPASS_KEY = "grass.shop.bypassers";
  var TIER_POINTS = [6, 3, 2, 1];
```

---

### Block 2: Replace [falsedge.js lines 382-385](../falsedge.js#L382-L385)

```js
   * `edits` counts an active task's paid edits; the next one costs edits + 1
   * grass. `grassSpent` totals every such payment, inside `state` so that undo
   * refunds it.
   *
```

With:

```js
   * `edits` counts an active task's paid edits; the next one costs edits + 1
   * grass. `grassSpent` totals every such payment, inside `state` so that undo
   * refunds it. `bypassUsed` counts bypassers spent, for the same reason.
   *
```

---

### Block 3: Replace [falsedge.js lines 403-406](../falsedge.js#L403-L406)

```js
      lockdownEnd: null,
      streak: null,
      grassSpent: 0
    };
```

With:

```js
      lockdownEnd: null,
      streak: null,
      grassSpent: 0,
      bypassUsed: 0
    };
```

---

### Block 4: Replace [falsedge.js lines 495-498](../falsedge.js#L495-L498)

```js
    if (typeof raw.grassSpent === "number") {
      s.grassSpent = raw.grassSpent;
    }
    return s;
```

With:

```js
    if (typeof raw.grassSpent === "number") {
      s.grassSpent = raw.grassSpent;
    }
    if (typeof raw.bypassUsed === "number") {
      s.bypassUsed = raw.bypassUsed;
    }
    return s;
```

---

### Block 5: Replace [falsedge.js lines 1230-1245](../falsedge.js#L1230-L1245)

`lockdownClear` used to toast and refuse in one go. Now the refusal depends on whether a bypasser is on hand, so it just hands back the message and the callers decide.

```js

  /**
   * Refuses task creation while a lockdown is running. Every route that makes
   * an active task calls this first.
   * @param {Date} now - the reference moment.
   * @returns {boolean} true if a task may be created right now.
   */
  function lockdownClear(now) {
    var left = lockdownLeft(now);
    if (left > 0) {
      toast("streak broke lockdown - " + formatLeft(left) + " left");
      return false;
    }
    return true;
  }

```

With:

```js

  /**
   * The toast a running lockdown refuses task creation with. Every route that
   * makes an active task checks this first.
   * @param {Date} now - the reference moment.
   * @returns {string} the message, or "" when no lockdown is running.
   */
  function lockdownMsg(now) {
    var left = lockdownLeft(now);
    if (left > 0) {
      return "streak broke lockdown - " + formatLeft(left) + " left";
    }
    return "";
  }

```

---

### Block 6: Replace [falsedge.js lines 1390-1392](../falsedge.js#L1390-L1392)

```js
    pushUndo("spend");
    state.ledger.push(spendEntryText(text, cost, count, day, state.pts));
    state.pts = state.pts - cost * count;
```

With:

```js
    pushUndo("spend");
    state.ledger.push(spendEntryText(text, cost, count, day, ptsOnHand()));
    state.pts = state.pts - cost * count;
```

---

### Block 7: Replace [falsedge.js lines 1504-1512](../falsedge.js#L1504-L1512)

Ledger maths shows the on-hand figure; only `state.pts` itself takes the delta.

```js
    pushUndo(label);
    var oldPts = state.pts;
    var oldScr = state.scr;
    var newScr = roundScr(oldScr + award);
    var delta = Math.floor(newScr) - Math.floor(oldScr);
    state.ledger.push(
      taskEntryText(task, byText, oldPts, delta, oldScr, award));
    state.scr = newScr;
    state.pts = oldPts + delta;
```

With:

```js
    pushUndo(label);
    var oldPts = ptsOnHand();
    var oldScr = state.scr;
    var newScr = roundScr(oldScr + award);
    var delta = Math.floor(newScr) - Math.floor(oldScr);
    state.ledger.push(
      taskEntryText(task, byText, oldPts, delta, oldScr, award));
    state.scr = newScr;
    state.pts = state.pts + delta;
```

---

### Block 8: Replace [falsedge.js lines 1834-1839](../falsedge.js#L1834-L1839)

```js
  function chargeEdit(task) {
    state.grassSpent += editCost(task);
    task.edits += 1;
  }

  // ------------------------------ streak window ------------------------------
```

With:

```js
  function chargeEdit(task) {
    state.grassSpent += editCost(task);
    task.edits += 1;
  }

  /**
   * Reads one of Grass Shop's purchase counters.
   * @param {string} key - the storage key.
   * @returns {number} the count, or 0 if unset or unreadable.
   */
  function shopCount(key) {
    try {
      return parseInt(localStorage.getItem(key) || "0", 10) || 0;
    } catch (e) {
      return 0;
    }
  }

  /**
   * Pts on hand: `state.pts` plus those bought in Grass Shop.
   * @returns {number}
   */
  function ptsOnHand() {
    return state.pts + shopCount(SHOP_PTS_KEY);
  }

  /**
   * Bypassers on hand: those bought in Grass Shop less those spent.
   * @returns {number} the count, which a redo can leave negative.
   */
  function bypassersLeft() {
    return shopCount(SHOP_BYPASS_KEY) - state.bypassUsed;
  }

  /**
   * Whether a blocked activation has a bypasser to spend. Toasts the block
   * when it doesn't.
   * @param {string} msg - the block's own toast.
   * @returns {boolean} true if a bypasser is on hand.
   */
  function canBypass(msg) {
    if (bypassersLeft() > 0) {
      return true;
    }
    toast(msg);
    return false;
  }

  // ------------------------------ streak window ------------------------------
```

---

### Block 9: Replace [falsedge.js lines 1929-1933](../falsedge.js#L1929-L1933)

```js
  function submitSet() {
    var now = getNow();
    confirmStreakBreak();
    if (!lockdownClear(now)) return;
    var textEl = document.getElementById("setText");
```

With:

```js
  function submitSet() {
    var now = getNow();
    confirmStreakBreak();
    // non-empty means a lockdown is running and a bypasser pays for this set
    var bypass = lockdownMsg(now);
    if (bypass && !canBypass(bypass)) return;
    var textEl = document.getElementById("setText");
```

---

### Block 10: Replace [falsedge.js lines 1956-1969](../falsedge.js#L1956-L1969)

```js
    if (!deadlineClear(deadline, now)) return;
    pushUndo("set task");
    awardStreakSet(now);
    state.activeTasks.push({
      id: uid(),
      text: text,
      deadline: deadline.toISOString(),
      mode: mode,
      edits: 0
    });
    state.setDraft = { text: "", time: null, mode: null, date: "" };
    save();
    render();
  }
```

With:

```js
    if (!deadlineClear(deadline, now)) return;
    pushUndo("set task");
    if (bypass) {
      state.bypassUsed += 1;
    }
    awardStreakSet(now);
    state.activeTasks.push({
      id: uid(),
      text: text,
      deadline: deadline.toISOString(),
      mode: mode,
      edits: 0
    });
    state.setDraft = { text: "", time: null, mode: null, date: "" };
    save();
    render();
    if (bypass) {
      toast("bypassed - " + bypassersLeft() + " left");
    }
  }
```

---

### Block 11: Replace [falsedge.js lines 2179-2182](../falsedge.js#L2179-L2182)

```js
    var now = getNow();
    confirmStreakBreak();
    if (!lockdownClear(now)) return;
    var text = String(row.text).trim();
```

With:

```js
    var now = getNow();
    confirmStreakBreak();
    // non-empty means a lockdown or cooldown is running and a bypasser pays
    var bypass = lockdownMsg(now);
    if (bypass && !canBypass(bypass)) return;
    var text = String(row.text).trim();
```

---

### Block 12: Replace [falsedge.js lines 2196-2202](../falsedge.js#L2196-L2202)

```js
    if (kind === "others") {
      var left = cooldownLeft(row, now);
      if (left > 0) {
        toast("on cooldown - " + formatLeft(left) + " left");
        return;
      }
      if (rowIsOut(id)) {
```

With:

```js
    if (kind === "others") {
      var left = cooldownLeft(row, now);
      // a lockdown's bypasser already covers the cooldown too
      if (left > 0 && !bypass) {
        bypass = "on cooldown - " + formatLeft(left) + " left";
        if (!canBypass(bypass)) return;
      }
      if (rowIsOut(id)) {
```

---

### Block 13: Replace [falsedge.js lines 2218-2220](../falsedge.js#L2218-L2220)

```js
    var iso = deadline.toISOString();
    pushUndo("activate row");
    awardStreakSet(now);
```

With:

```js
    var iso = deadline.toISOString();
    pushUndo("activate row");
    if (bypass) {
      state.bypassUsed += 1;
    }
    awardStreakSet(now);
```

---

### Block 14: Replace [falsedge.js lines 2242-2247](../falsedge.js#L2242-L2247)

```js
    var stamp = hhmm(deadline);
    if (isFurther(iso, now)) {
      stamp = stamp + " (" + DAY_ABBR[deadline.getDay()] + ")";
    }
    toast("task set for " + stamp);
  }
```

With:

```js
    var stamp = hhmm(deadline);
    if (isFurther(iso, now)) {
      stamp = stamp + " (" + DAY_ABBR[deadline.getDay()] + ")";
    }
    if (bypass) {
      stamp = stamp + " - bypassed, " + bypassersLeft() + " left";
    }
    toast("task set for " + stamp);
  }
```

---

### Block 15: Replace [falsedge.js lines 2609-2610](../falsedge.js#L2609-L2610)

```js
    ptsBox.appendChild(el("span", "score-label",
      "Current pts: " + formatPts(state.pts)));
```

With:

```js
    ptsBox.appendChild(el("span", "score-label",
      "Current pts: " + formatPts(ptsOnHand())));
```

---

### Block 16: Replace [grass.html lines 23-50](../grass.html#L23-L50)

```html
<div class="fd-section sec-grass">
  <div class="card" id="grassCard">
    <img class="grass-icon" src="assets/icon-grass.svg" alt="grass">
    <span class="grass-count">Touched grass: <span id="grassCount">0</span></span>
  </div>
</div>

<script>
// Grass lives under its own key rather than inside falsedge.data, so
// Falsedge's undo ring can never rewind grass earned in Hex 2^. What Falsedge
// spends on edits is kept in falsedge.data instead, so its undo can refund it;
// the balance on hand is the one less the other.
(function () {
  "use strict";
  var GRASS_KEY = "grass.count";
  var n = 0;
  try {
    n = parseInt(localStorage.getItem(GRASS_KEY) || "0", 10) || 0;
    var data = JSON.parse(localStorage.getItem("falsedge.data"));
    if (data && typeof data.grassSpent === "number") {
      n -= data.grassSpent;
    }
  } catch (e) {
    // storage blocked or unreadable; the count stays at what was read
  }
  document.getElementById("grassCount").textContent = n;
})();
</script>
```

With:

```html
<div class="fd-section sec-grass">
  <div class="card" id="grassCard">
    <img class="grass-icon" src="assets/icon-grass.svg" alt="grass">
    <span class="grass-count">Touched grass: <span id="grassCount">0</span></span>
  </div>
  <div class="card shop-card">
    <span class="grass-count">Bypassers: <span id="bypassCount">0</span></span>
  </div>
  <div class="card shop-card shop-items">
    <button class="btn shop-item" id="buyPts" type="button">
      <span class="shop-price">[30 <img class="shop-grass" src="assets/icon-grass.svg" alt="grass">]</span>
      <span class="shop-what">+1 pts</span>
    </button>
    <button class="btn shop-item" id="buyBypass" type="button">
      <span class="shop-price">[60 <img class="shop-grass" src="assets/icon-grass.svg" alt="grass">]</span>
      <span class="shop-what">+1 bypasser</span>
    </button>
  </div>
</div>

<div class="toast" id="toast" role="status" aria-live="polite"></div>

<script>
// Grass lives under its own key rather than inside falsedge.data, so
// Falsedge's undo ring can never rewind grass earned in Hex 2^. What Falsedge
// spends on edits is kept in falsedge.data instead, so its undo can refund it;
// the balance on hand is the one less the other.
//
// Shop purchases are final: the price comes straight off grass.count and the
// item lands under its own key, so no undo anywhere reaches either. Falsedge
// counts the bypassers it spends in its own data, so its undo refunds those.
(function () {
  "use strict";
  var GRASS_KEY = "grass.count";
  var ITEMS = {
    buyPts: { cost: 30, key: "grass.shop.pts", what: "+1 pts" },
    buyBypass: {
      cost: 60,
      key: "grass.shop.bypassers",
      what: "+1 bypasser"
    }
  };
  // a purchase takes two taps: the first arms the item, the second buys it
  var ARM_MS = 3000;
  var armed = null;
  var armTimer = null;
  var toastTimer = null;
  var toastEl = document.getElementById("toast");

  /**
   * Reads an integer counter from storage.
   * @param {string} key - the storage key.
   * @returns {number} the count, or 0 if unset or unreadable.
   */
  function readInt(key) {
    try {
      return parseInt(localStorage.getItem(key) || "0", 10) || 0;
    } catch (e) {
      return 0;
    }
  }

  /**
   * Reads a number Falsedge keeps in its own data.
   * @param {string} field - the field name.
   * @returns {number} its value, or 0 if missing or unreadable.
   */
  function falsedgeCount(field) {
    try {
      var data = JSON.parse(localStorage.getItem("falsedge.data"));
      if (data && typeof data[field] === "number") {
        return data[field];
      }
    } catch (e) {
      // unreadable Falsedge data has spent nothing
    }
    return 0;
  }

  /**
   * @returns {number} grass on hand.
   */
  function grassBalance() {
    return readInt(GRASS_KEY) - falsedgeCount("grassSpent");
  }

  /**
   * @returns {number} bypassers on hand.
   */
  function bypassersLeft() {
    return readInt(ITEMS.buyBypass.key) - falsedgeCount("bypassUsed");
  }

  /**
   * Redraws both counts.
   */
  function show() {
    document.getElementById("grassCount").textContent = grassBalance();
    document.getElementById("bypassCount").textContent = bypassersLeft();
  }

  /**
   * Shows a transient toast, replacing any still showing.
   * @param {string} msg - the message.
   */
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("show");
    }, 2200);
  }

  /**
   * Puts every item back to its unarmed label.
   */
  function disarm() {
    if (armTimer) {
      clearTimeout(armTimer);
    }
    armTimer = null;
    armed = null;
    Object.keys(ITEMS).forEach(function (id) {
      var btn = document.getElementById(id);
      btn.classList.remove("armed");
      btn.querySelector(".shop-what").textContent = ITEMS[id].what;
    });
  }

  /**
   * Arms an item, so the next tap on it buys.
   * @param {string} id - the item's button id.
   */
  function arm(id) {
    disarm();
    armed = id;
    var btn = document.getElementById(id);
    btn.classList.add("armed");
    btn.querySelector(".shop-what").textContent =
      "buy " + ITEMS[id].what + "?";
    armTimer = setTimeout(disarm, ARM_MS);
  }

  /**
   * Refuses an item the balance can't cover, toasting the price.
   * @param {string} id - the item's button id.
   * @returns {boolean} true if it can be bought.
   */
  function canAfford(id) {
    var cost = ITEMS[id].cost;
    if (grassBalance() < cost) {
      toast("need " + cost + " grass");
      return false;
    }
    return true;
  }

  /**
   * Buys one of an item: its price comes off grass.count and its own counter
   * goes up by one. Puts the grass back if the second write fails.
   * @param {string} id - the item's button id.
   */
  function buy(id) {
    var item = ITEMS[id];
    var grass = readInt(GRASS_KEY);
    var owned = readInt(item.key);
    try {
      localStorage.setItem(GRASS_KEY, String(grass - item.cost));
      localStorage.setItem(item.key, String(owned + 1));
    } catch (e) {
      try {
        localStorage.setItem(GRASS_KEY, String(grass));
      } catch (e2) {
        // storage is gone entirely; nothing left to put back
      }
      toast("could not save");
      return;
    }
    toast("bought " + item.what);
    show();
  }

  Object.keys(ITEMS).forEach(function (id) {
    document.getElementById(id).addEventListener("click", function () {
      if (!canAfford(id)) {
        disarm();
        return;
      }
      if (armed !== id) {
        arm(id);
        return;
      }
      disarm();
      buy(id);
    });
  });
  show();
})();
</script>
```

---

### Block 17: Replace [style-falsedge.css lines 802-807](../style-falsedge.css#L802-L807)

`.fd-section .card` zeroes card margins, so the shop cards need the same weight of selector to get their gap back.

```css
  .grass-count {
    font-size: 22px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .page-nav-bottom {
```

With:

```css
  .grass-count {
    font-size: 22px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .fd-section .shop-card {
    margin-top: 14px;
  }
  .shop-items {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .shop-item {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    text-align: left;
  }
  .shop-price {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-variant-numeric: tabular-nums;
  }
  .shop-grass {
    width: 16px;
    height: 16px;
  }
  .shop-item.armed {
    border-color: var(--c-green);
  }
  .page-nav-bottom {
```

---

### Block 18: changelog

previous: v2.26.3 · increment: +0.1 → v2.27

- Grass Shop is open for business!! 🌿
  - [30 grass] +1 pts
  - [60 grass] +1 bypasser
- Purchases take two taps (tap, then tap again to confirm) and are final: no refunds, and undo doesn't touch them.
- A bypasser lets one task through a streak-break lockdown or a row's cancel cooldown. It's only spent when the task actually gets set, and undoing that set refunds it.
- Grass Shop now shows how many bypassers you have.

---
