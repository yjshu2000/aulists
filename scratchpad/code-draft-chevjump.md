# Chevrons jump to the ends; a broken streak says so — code draft

Two unrelated changes in one pass.

**The chevrons.** ▲▼ stop being one-step nudges and become queue membership controls:

- **▲** sends the row to the **top of the queue** — index 0, above the line.
- **▼** sends it to the **bottom of the inactive queue** — the last index, below the line.
- Each is **greyed only when it would do nothing** — ▲ on the row already at index 0, ▼ on the row already last. Sitting in the queue is not the same as sitting at the top of it, so a queued row keeps a live ▲ until it reaches the head.

The one-step move keeps working, moved into the hamburger as **Shift up** / **Shift down**. `moveRow` and `moveTargetIndex` are untouched — only their caller changes.

**The indicator.** `streakIndicatorText` returns `""` for a confirmed break, so once the red toast fades nothing on the page says the streak is gone — the provisional state gets a permanent marker and the real one gets 2.2 seconds. A lockdown branch goes in above the tentative one, reading `streak broken. (34h)`, deliberately near-identical to `streak broke? (24)`. Floored hours, so the last hour reads `(0h)`.

## Open, decide while reading

1. **Chevrons still only render on rows that are not out as a task** (`buildRow` gates on `!rowIsOut(id)`). A row that is out sits in the hoisted deadline-sorted group, so moving it changes nothing on screen until it comes back. Left as-is. Say if the chevrons should show on out rows too.
2. **The two aria-labels are invented copy** — currently "Move to top of queue" and "Move to bottom". Say what they should read.
3. **Both chevrons and both menu entries push the undo label "move row".** Say if they should read differently in the toast.
4. **▼ crosses the line in one press** when the row starts above it. That is the point, but it means a single tap can take a row from the top of the queue to the very bottom with no intermediate state.
5. **The lockdown indicator only refreshes when the page redraws**, same as the `24/48h` window counters beside ACTIVE TASKS, so the hour it shows can sit stale until something else happens.

---

### Block 1: Replace [falsedge.js lines 1349-1360](../falsedge.js#L1349-L1360)

```js
  /**
   * The red indicator's text, worked out fresh at every draw.
   * @param {Date} now - the reference moment.
   * @returns {string} the text, or "" when nothing is provisionally lapsed.
   */
  function streakIndicatorText(now) {
    var tentative = streakStatus(now).tentative;
    if (!tentative.length) {
      return "";
    }
    return "streak broke? (" + tentative.join(", ") + ")";
  }
```

With:

```js
  /**
   * The red indicator's text, worked out fresh at every draw.
   * @param {Date} now - the reference moment.
   * @returns {string} the text, or "" when the streak is neither broken nor
   *   provisionally lapsed.
   */
  function streakIndicatorText(now) {
    var left = lockdownLeft(now);
    if (left > 0) {
      return "streak broken. (" + Math.floor(left / (60 * 60 * 1000)) + "h)";
    }
    var tentative = streakStatus(now).tentative;
    if (!tentative.length) {
      return "";
    }
    return "streak broke? (" + tentative.join(", ") + ")";
  }
```

---

### Block 2: Replace [falsedge.js lines 1985-1988](../falsedge.js#L1985-L1988)

```js
   * The array index a chevron would move a row to: the nearest neighbour in
   * that direction that is not currently out as a task. Rows that are out sit
   * in their own deadline-sorted group, so swapping with one would move
   * nothing anybody can see.
```

With:

```js
   * The array index Shift up / Shift down would move a row to: the nearest
   * neighbour in that direction that is not currently out as a task. Rows
   * that are out sit in their own deadline-sorted group, so swapping with one
   * would move nothing anybody can see.
```

---

### Block 3: Add at [falsedge.js line 2024](../falsedge.js#L2024)

Just prior:

```js
    render();
  }
```

Added:

```js

  /**
   * @param {string} id - the row id.
   * @param {string} end - "top" or "bottom".
   * @returns {boolean} true when the row already sits at that end.
   */
  function rowAtEnd(id, end) {
    var at = indexOfRow("others", id);
    if (at === -1) return true;
    if (end === "bottom") {
      return at === state.others.length - 1;
    }
    return at === 0;
  }

  /**
   * Sends an `others` row to one end of the list.
   * @param {string} id - the row id.
   * @param {string} end - "top" for the head of the queue, "bottom" for the
   *   last place below the line.
   */
  function moveRowToEnd(id, end) {
    if (rowAtEnd(id, end)) return;
    var at = indexOfRow("others", id);
    pushUndo("move row");
    var moved = state.others.splice(at, 1)[0];
    if (end === "bottom") {
      state.others.push(moved);
    } else {
      state.others.unshift(moved);
    }
    save();
    render();
  }
```

Just after:

```js
  /**
   * Prefills SET from a row, leaving the row itself untouched and creating
```

---

### Block 4: Replace [falsedge.js lines 3108-3115](../falsedge.js#L3108-L3115)

```js
      if (kind === "others") {
        var clr = el("button", "", "Clear datetime");
        clr.addEventListener("click", function () {
          closeAllMenus();
          clearRowDatetime(id);
        });
        menu.appendChild(clr);
      }
```

With:

```js
      if (kind === "others") {
        [["Shift up", -1], ["Shift down", 1]].forEach(function (spec) {
          var s = el("button", "", spec[0]);
          s.addEventListener("click", function () {
            closeAllMenus();
            moveRow(id, spec[1]);
          });
          menu.appendChild(s);
        });

        var clr = el("button", "", "Clear datetime");
        clr.addEventListener("click", function () {
          closeAllMenus();
          clearRowDatetime(id);
        });
        menu.appendChild(clr);
      }
```

---

### Block 5: Replace [falsedge.js lines 3149-3169](../falsedge.js#L3149-L3169)

```js
  /**
   * Builds the up/down chevrons that move an `others` row inside the manual
   * group. Each press moves it one visible place. Items at the top/bottom
   * boundary have their chev greyed out.
   * @param {string} id - the row id.
   * @returns {Element} the chevron pair in their wrapper.
   */
  function buildRowChevrons(id) {
    var wrap = el("div", "row-chevs");
    var specs = [["▲", -1, "Move up"], ["▼", 1, "Move down"]];
    specs.forEach(function (spec) {
      var b = el("button", "mini", spec[0]);
      b.setAttribute("aria-label", spec[2]);
      b.disabled = moveTargetIndex(id, spec[1]) === -1;
      b.addEventListener("click", function () {
        moveRow(id, spec[1]);
      });
      wrap.appendChild(b);
    });
    return wrap;
  }
```

With:

```js
  /**
   * Builds the chevrons that throw an `others` row to one end of the list.
   * Greyed only on the row already at that end.
   * @param {string} id - the row id.
   * @returns {Element} the chevron pair in their wrapper.
   */
  function buildRowChevrons(id) {
    var wrap = el("div", "row-chevs");
    var specs = [
      ["▲", "top", "Move to top of queue"],
      ["▼", "bottom", "Move to bottom"]
    ];
    specs.forEach(function (spec) {
      var b = el("button", "mini", spec[0]);
      b.setAttribute("aria-label", spec[2]);
      b.disabled = rowAtEnd(id, spec[1]);
      b.addEventListener("click", function () {
        moveRowToEnd(id, spec[1]);
      });
      wrap.appendChild(b);
    });
    return wrap;
  }
```

---

### Block 6: changelog

increment: +0.0.1

- The ▲▼ chevrons now throw a row straight to the top of the queue or the bottom below the line, instead of nudging it one place. Each greys out only when it would do nothing — ▲ on the top row, ▼ on the last one.
- One-place nudging moved into the row's hamburger menu as "Shift up" and "Shift down".
- A broken streak now says so on the page — `streak broken. (34h)` under the score boxes, counting the lockdown down — instead of vanishing the moment the red toast fades.
