# MT, late 0.1, and the edit lock — code draft

Covers [i14.3.1], [i33.1], [i49], and the three comment fixes from `code-draft-comments.md`.

Decisions: early bonus applies to MT (A1). No CSS change (B1). Lock toast is `too late >:p` (D1). The lock reads `task.deadline` itself, so the deadline can be pushed indefinitely while it's still ahead (E). A 0.1 completion always prints its full date and time (F).

One addition no item asked for: `roundScr`. Ten float 0.1s sum to `0.9999999999999999`, so `Math.floor` carries a point short into `pts`. `awardGoldenSet` has had this since v2.22; [i33.1] would hit it on every late completion.

---

### Block 1: Replace [falsedge.js lines 31-34](../falsedge.js#L31-L34)

```js
  // NL = no leniency (not built yet)
  // ML = mega leniency (not built yet)
  var WL_OFFSETS = [0, 10, 30, 60];
  var HL_OFFSETS = [0, 5, 15, 30];
```

With:

```js
  // MT = micro task
  var WL_OFFSETS = [0, 10, 30, 60];
  var HL_OFFSETS = [0, 5, 15, 30];
  var MT_OFFSETS = [0, 60];
  var MT_POINTS = [2, 1];
  var MODES = ["WL", "HL", "MT"];
  // completing past the last tier but within 24h of the deadline pays this
  var DAYLATE_AWARD = 0.1;
```

---

### Block 2: Add at [falsedge.js line 287](../falsedge.js#L287)

Just prior:

```js
    return r.toFixed(1);
  }
```

Added:

```js

  /**
   * Rounds `scr` to one decimal, since ten float 0.1s sum to 0.9999...
   * @param {number} n - the raw sum.
   * @returns {number} the rounded sum.
   */
  function roundScr(n) {
    return Math.round(n * 10) / 10;
  }
```

---

### Block 3: Add at [falsedge.js line 316](../falsedge.js#L316)

Just prior:

```js
  function isLine(r) {
    return !!r && r.line === true;
  }
```

Added:

```js

  /**
   * @param {*} m - a stored or proposed mode.
   * @returns {boolean} true for "WL", "HL" or "MT".
   */
  function isMode(m) {
    return MODES.indexOf(m) !== -1;
  }
```

---

### Block 4: Replace [falsedge.js line 421](../falsedge.js#L421)

```js
      if (raw.setDraft.mode === "WL" || raw.setDraft.mode === "HL") {
```

With:

```js
      if (isMode(raw.setDraft.mode)) {
```

---

### Block 5: Replace [falsedge.js lines 889-903](../falsedge.js#L889-L903)

```js
  /**
   * Builds a task's four leniency tiers from its stored deadline.
   * @param {Object} task - the active task.
   * @returns {{at: Date, pts: number}[]} the tiers, soonest first.
   */
  function tierList(task) {
    var offsets = WL_OFFSETS;
    if (task.mode === "HL") {
      offsets = HL_OFFSETS;
    }
    var base = new Date(task.deadline).getTime();
    return offsets.map(function (off, i) {
      return { at: new Date(base + off * 60000), pts: TIER_POINTS[i] };
    });
  }
```

With:

```js
  /**
   * Builds a task's leniency tiers from its stored deadline
   * @param {Object} task - the active task.
   * @returns {{at: Date, pts: number}[]} the tiers, soonest first.
   */
  function tierList(task) {
    var offsets = WL_OFFSETS;
    var points = TIER_POINTS;
    if (task.mode === "HL") {
      offsets = HL_OFFSETS;
    } else if (task.mode === "MT") {
      offsets = MT_OFFSETS;
      points = MT_POINTS;
    }
    var base = new Date(task.deadline).getTime();
    return offsets.map(function (off, i) {
      return { at: new Date(base + off * 60000), pts: points[i] };
    });
  }
```

---

### Block 6: Add at [falsedge.js line 921](../falsedge.js#L921)

Just prior:

```js
      if (tiers[i].at.getTime() >= floored.getTime()) return i;
    }
    return -1;
  }
```

Added:

```js

  /**
   * Whether a task's deadline has passed, which shuts its time editor.
   * @param {Object} task - the active task.
   * @param {Date} now - the reference moment.
   * @returns {boolean} true once the deadline is behind `now`.
   */
  function deadlinePassed(task, now) {
    return new Date(task.deadline).getTime() <= now.getTime();
  }

  /**
   * Answers a tap on a shut time editor, closing it if it was open.
   */
  function refuseTimeEdit() {
    toast("too late >:p");
    timeEditId = null;
    render();
  }
```

---

### Block 7: Replace [falsedge.js line 1532](../falsedge.js#L1532)

```js
   * @param {number} award - points awarded (0 for failed and cancelled).
```

With:

```js
   * @param {number} award - points awarded (0 for cancelled, and for
   *   anything more than 24h late).
```

---

### Block 8: Replace [falsedge.js line 1543](../falsedge.js#L1543)

```js
    var newScr = oldScr + award;
```

With:

```js
    var newScr = roundScr(oldScr + award);
```

---

### Block 9: Replace [falsedge.js lines 1600-1618](../falsedge.js#L1600-L1618)

```js
  /**
   * Completes a task at the present moment, awarding whatever tier is live
   * right now - including 0 once every tier has passed.
   * @param {string} id - the task id.
   */
  function completeNow(id) {
    var task = findTask(id);
    if (!task) return;
    var now = getNow();
    var tiers = tierList(task);
    var idx = liveTierIndex(tiers, now);
    var award = 0;
    var byText = "none (failed)";
    if (idx !== -1) {
      award = tiers[idx].pts + earlyBonus(task, now);
      byText = completedByText(task, now);
    }
    resolveTask(id, now, award, byText, "complete", "complete now");
  }
```

With:

```js
  /**
   * Completes a task at the present moment, awarding whatever tier is live
   * right now. Past every tier it still pays 0.1 within 24h of the deadline.
   * @param {string} id - the task id.
   */
  function completeNow(id) {
    var task = findTask(id);
    if (!task) return;
    var now = getNow();
    var tiers = tierList(task);
    var idx = liveTierIndex(tiers, now);
    var award = 0;
    var byText = "none (failed)";
    var late = now.getTime() - new Date(task.deadline).getTime();
    if (idx !== -1) {
      award = tiers[idx].pts + earlyBonus(task, now);
      byText = completedByText(task, now);
    } else if (late <= DAY_MS) {
      award = DAYLATE_AWARD;
      byText = formatDateTime(now);
    }
    resolveTask(id, now, award, byText, "complete", "complete now");
  }
```

---

### Block 10: Remove [falsedge.js lines 1666-1672](../falsedge.js#L1666-L1672)

```js
  /**
   * Moves an active task's deadline to a new day, keeping its clock time. An
   * empty date re-resolves to the clock time's next occurrence, which is how
   * a further task is pulled back inside 24h.
   * @param {string} id - the task id.
   * @param {string} date - a day key, "YYYY-MM-DD", or "" for none.
   */
```

---

### Block 11: Add at [falsedge.js line 1691](../falsedge.js#L1691)

Just prior:

```js
    return key;
  }

```

Added:

```js
  /**
   * Moves an active task's deadline to a new day, keeping its clock time. An
   * empty date re-resolves to the clock time's next occurrence, which is how
   * a further task is pulled back inside 24h.
   * @param {string} id - the task id.
   * @param {string} date - a day key, "YYYY-MM-DD", or "" for none.
   */
```

Just after:

```js
  function editTaskDate(id, date) {
```

---

### Block 12: Replace [falsedge.js lines 1732-1743](../falsedge.js#L1732-L1743)

```js
   * Holds a proposed deadline to the 20-minute floor and the overlap rule,
   * then commits it. The task's own deadline is excluded from the overlap
   * check, since a task can hardly clash with itself.
   * @param {string} id - the task id.
   * @param {Date} deadline - the proposed replacement.
   * @param {Date} now - the reference moment.
   * @param {string} label - the undo label.
   * @param {string} tooSoon - toast for a deadline under the floor.
   */
  function commitTaskDeadline(id, deadline, now, label, tooSoon) {
    var task = findTask(id);
    if (!task) return;
```

With:

```js
   * Holds a proposed deadline to the 20-minute floor and the overlap rule,
   * then commits it. The task's own deadline is excluded from the overlap
   * check, since a task can hardly clash with itself. Refused outright once
   * that deadline has passed.
   * @param {string} id - the task id.
   * @param {Date} deadline - the proposed replacement.
   * @param {Date} now - the reference moment.
   * @param {string} label - the undo label.
   * @param {string} tooSoon - toast for a deadline under the floor.
   */
  function commitTaskDeadline(id, deadline, now, label, tooSoon) {
    var task = findTask(id);
    if (!task) return;
    if (deadlinePassed(task, now)) {
      refuseTimeEdit();
      return;
    }
```

---

### Block 13: Replace [falsedge.js lines 1759-1762](../falsedge.js#L1759-L1762)

A committed deadline no longer re-sorts the stack while that task's editor is open. It's saved either way; the block only moves once the editor closes.

```js
    pushUndo(label);
    task.deadline = iso;
    save();
    render();
```

With:

```js
    pushUndo(label);
    task.deadline = iso;
    save();
    // re-sorting under an open editor would move the block mid-edit
    if (timeEditId === id) return;
    render();
```

---

### Block 14: Replace [falsedge.js lines 1765-1780](../falsedge.js#L1765-L1780)

```js
  /**
   * Switches an active task's leniency, which reshapes its tier rows. Unlike
   * SET's toggles this one can't clear back to unset - an active task always
   * has a mode, so tapping the lit one is a no-op.
   * @param {string} id - the task id.
   * @param {string} mode - "WL" or "HL".
   */
  function editTaskMode(id, mode) {
    var task = findTask(id);
    if (!task) return;
    if (task.mode === mode) return;
    pushUndo("edit task mode");
    task.mode = mode;
    save();
    render();
  }
```

With:

```js
  /**
   * Switches an active task's leniency, which reshapes its tier rows. Unlike
   * SET's toggles this one can't clear back to unset - an active task always
   * has a mode, so tapping the lit one is a no-op. Refused once the deadline
   * has passed.
   * @param {string} id - the task id.
   * @param {string} mode - "WL", "HL" or "MT".
   */
  function editTaskMode(id, mode) {
    var task = findTask(id);
    if (!task) return;
    if (task.mode === mode) return;
    if (deadlinePassed(task, getNow())) {
      refuseTimeEdit();
      return;
    }
    pushUndo("edit task mode");
    task.mode = mode;
    save();
    render();
  }
```

---

### Block 15: Replace [falsedge.js line 1867](../falsedge.js#L1867)

```js
    state.scr = state.scr + GOLDEN_SET_AWARD;
```

With:

```js
    state.scr = roundScr(state.scr + GOLDEN_SET_AWARD);
```

---

### Block 16: Replace [falsedge.js lines 1886-1887](../falsedge.js#L1886-L1887)

```js
    if (mode !== "WL" && mode !== "HL") {
      toast("Pick WL or HL");
```

With:

```js
    if (!isMode(mode)) {
      toast("Pick leniency mode");
```

---

### Block 17: Replace [falsedge.js line 2103](../falsedge.js#L2103)

```js
    if (row.mode === "WL" || row.mode === "HL") {
```

With:

```js
    if (isMode(row.mode)) {
```

---

### Block 18: Replace [falsedge.js lines 2130-2131](../falsedge.js#L2130-L2131)

```js
    if (row.mode !== "WL" && row.mode !== "HL") {
      toast("Pick WL or HL");
```

With:

```js
    if (!isMode(row.mode)) {
      toast("Pick WL, HL or MT");
```

---

### Block 19: Replace [falsedge.js lines 2622-2647](../falsedge.js#L2622-L2647)

`attachTextEdit` stops being task-only, so rows can use it too.

```js
  /**
   * Wires the `edit?` overlay onto an active task's text: tapping the text
   * shows the overlay, tapping the overlay enters edit mode, tapping anywhere
   * else dismisses it.
   * @param {Element} row - the task's text row (the overlay's positioning
   *   parent).
   * @param {string} id - the task id.
   */
  function attachTextEdit(row, id) {
    var textEl = row.querySelector(".task-text");
    textEl.addEventListener("click", function (e) {
      e.stopPropagation();
      closeEditOverlays();
      var overlay = el("button", "edit-overlay", "edit?");
      overlay.addEventListener("click", function (ev) {
        ev.stopPropagation();
        closeEditOverlays();
        var live = row.querySelector(".task-text");
        if (!live) return;
        inlineEdit(live, live.textContent, function (value) {
          editTaskText(id, value);
        });
      });
      row.appendChild(overlay);
    });
  }
```

With:

```js
  /**
   * Wires the `edit?` overlay onto a piece of text: tapping the text shows the
   * overlay, tapping the overlay swaps it for an inline editor, and tapping
   * anywhere else dismisses it.
   * @param {Element} host - the text's positioning parent, which the overlay
   *   is appended to.
   * @param {string} sel - selector for the text element inside `host`.
   * @param {Function} onCommit - called once with the raw edited value.
   */
  function attachTextEdit(host, sel, onCommit) {
    var textEl = host.querySelector(sel);
    textEl.addEventListener("click", function (e) {
      e.stopPropagation();
      closeEditOverlays();
      var overlay = el("button", "edit-overlay", "edit?");
      overlay.addEventListener("click", function (ev) {
        ev.stopPropagation();
        closeEditOverlays();
        var live = host.querySelector(sel);
        if (!live) return;
        inlineEdit(live, live.textContent, onCommit);
      });
      host.appendChild(overlay);
    });
  }
```

---

### Block 20: Replace [falsedge.js lines 2667-2686](../falsedge.js#L2667-L2686)

```js
  /**
   * Wires the `edit time?` overlay onto a task's tier rows, the same shape as
   * the `edit?` overlay on its text.
   * @param {Element} wrap - the tier-row wrapper (the positioning parent).
   * @param {string} id - the task id.
   */
  function attachTimeEdit(wrap, id) {
    wrap.addEventListener("click", function (e) {
      e.stopPropagation();
      closeEditOverlays();
      var overlay = el("button", "edit-overlay", "edit time?");
      overlay.addEventListener("click", function (ev) {
        ev.stopPropagation();
        closeEditOverlays();
        timeEditId = id;
        render();
      });
      wrap.appendChild(overlay);
    });
  }
```

With:

```js
  /**
   * Wires the `edit time?` overlay onto a task's tier rows, the same shape as
   * the `edit?` overlay on its text. Once the deadline has passed, tapping it
   * toasts instead of opening the editor.
   * @param {Element} wrap - the tier-row wrapper (the positioning parent).
   * @param {string} id - the task id.
   */
  function attachTimeEdit(wrap, id) {
    wrap.addEventListener("click", function (e) {
      e.stopPropagation();
      closeEditOverlays();
      var overlay = el("button", "edit-overlay", "edit time?");
      overlay.addEventListener("click", function (ev) {
        ev.stopPropagation();
        closeEditOverlays();
        var task = findTask(id);
        if (!task) return;
        if (deadlinePassed(task, getNow())) {
          refuseTimeEdit();
          return;
        }
        timeEditId = id;
        render();
      });
      wrap.appendChild(overlay);
    });
  }
```

---

### Block 21: Replace [falsedge.js line 2750](../falsedge.js#L2750)

The task call site, now that the helper takes a selector and a callback.

```js
    attachTextEdit(textRow, id);
```

With:

```js
    attachTextEdit(textRow, ".task-text", function (value) {
      editTaskText(id, value);
    });
```

---

### Block 22: Replace [falsedge.js line 2760](../falsedge.js#L2760)

An editor left open as the deadline passes shuts on the next render.

```js
    if (timeEditId === id) {
```

With:

```js
    if (timeEditId === id && !deadlinePassed(task, now)) {
```

---

### Block 23: Replace [falsedge.js lines 3039-3047](../falsedge.js#L3039-L3047)

```js
   * Builds a WL/HL toggle pair. Tapping the lit one deselects it back to
   * unset; unset is neither being lit. 
   * @param {Function} getMode - returns the currently selected mode, or null.
   * @param {Function} onPick - called with the new mode (or null).
   * @returns {Element} the toggle row.
   */
  function buildModeToggles(getMode, onPick) {
    var row = el("div", "mode-row");
    ["WL", "HL"].forEach(function (m) {
```

With:

```js
   * Builds the WL/HL/MT toggle row. Tapping the lit one deselects it back to
   * unset; unset is none being lit.
   * @param {Function} getMode - returns the currently selected mode, or null.
   * @param {Function} onPick - called with the new mode (or null).
   * @returns {Element} the toggle row.
   */
  function buildModeToggles(getMode, onPick) {
    var row = el("div", "mode-row");
    MODES.forEach(function (m) {
```

---

### Block 24: Replace [falsedge.js line 3280](../falsedge.js#L3280)

The row's text gets a wrapper, so the overlay covers the text rather than the whole row.

```js
    row.appendChild(el("div", "tpl-text", r.text));
```

With:

```js
    var textRow = el("div", "tpl-text-row");
    textRow.appendChild(el("div", "tpl-text", r.text));
    attachTextEdit(textRow, ".tpl-text", function (value) {
      var v = value.trim();
      if (v === "") {
        render();
        return;
      }
      editRow(kind, id, "text", v);
    });
    row.appendChild(textRow);
```

---

### Block 25: Replace [falsedge.js line 3367](../falsedge.js#L3367)

```js
    ["WL", "HL"].forEach(function (m) {
```

With:

```js
    MODES.forEach(function (m) {
```

---

### Block 26: Replace [falsedge.js lines 3423-3424](../falsedge.js#L3423-L3424)

```js
   * Builds the ACTIVATE (others) box: persistent records, most recently
   * completed first, plus the pinned adder.
```

With:

```js
   * Builds the ACTIVATE (others) box: persistent records, rows currently out as
   * tasks first, the rest in manual order, plus the pinned adder.
```

---

### Block 27: Replace [falsedge.js lines 3535-3536](../falsedge.js#L3535-L3536)

A tap outside the row's text dismisses its overlay, the same as a task's.

```js
    if (!e.target.closest(".task-text-row")
      && !e.target.closest(".tier-rows")) {
```

With:

```js
    if (!e.target.closest(".task-text-row")
      && !e.target.closest(".tpl-text-row")
      && !e.target.closest(".tier-rows")) {
```

---

### Block 28: Replace [style-falsedge.css lines 610-611](../style-falsedge.css#L610-L611)

The inline editor now sits inside the wrapper, not directly in the row.

```css
  .tpl-text,
  .tpl-row > .inline-edit {
```

With:

```css
  .tpl-text,
  .tpl-text-row > .inline-edit {
```

---

### Block 29: Add at [style-falsedge.css line 616](../style-falsedge.css#L616)

Just prior:

```css
    margin-bottom: 14px;
    word-break: break-word;
  }
```

Added:

```css
  /* the overlay covers the text, not the whole row */
  .tpl-text-row {
    position: relative;
  }
```

Just after:

```css
  .tpl-controls {
```

---

### Block 30: `[i50]`

`LAST USED ID` would go to `i50`.

> ### [i50] Tap row text to edit it ⚪ 🟡
> last consolidated: 26-09-20
>
> An ACTIVATE row's text is edited the same way an active task's is: tap the text for an `edit?` overlay, tap the overlay for the inline editor. Both sections, dailies and others.

---

### Block 31: changelog

Previous: v2.23.2 (2026-09-17 09H).

> **v2.24** 2026-09-20 22H
> - Added micro tasks: a third mode button, MT, beside WL and HL. 2 pts on time, 1 pt up to an hour late.
> - Completing a task after every tier has passed now pays 0.1 instead of nothing, as long as it's within 24 hours of the deadline.
> - A task's time, date and mode can only be edited before its deadline. After that, tapping `edit time?` says `too late >:p`.
> - Tapping a row's text in either ACTIVATE box now offers `edit?`, the same as an active task's text.
