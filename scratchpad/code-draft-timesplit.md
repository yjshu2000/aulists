# Time dropdowns split into H : M — code draft

Every time dropdown in Falsedge becomes two: hours `0–23`, a `:`, and minutes `00 10 20 30 40 50`. Plain absolute order everywhere — no dropdown is ever built relative to `now` again.

Settled: both boxes start at `--` on any new time. Picking an hour fills minutes to `00` **only if they are still blank**, so minutes chosen first survive. Minutes can be picked first. A row has a time once the **hour** is set — `-- : 30` is not a time. SET still *seeds* its initial value from now (next 10-minute mark past the 20-minute floor); only the seeding knows what time it is, never the list. The five quick `by` buttons in SET are untouched.

**Two builders collapse into one.** `dropdownOptions(now)` fed SET and the active-task editor; `buildDayTimeSelect()` fed both ACTIVATE row types and both adders. Once the first stops being now-relative they are the same control, so `dropdownOptions` is deleted outright.

**One property is deliberately given up.** `dropdownOptions`' comment reads *"strictly increasing in real time, so a past deadline is unreachable by construction."* That goes. Past clock times become selectable, and the 20-minute floor moves from impossible-to-express to checked at submit: a **dateless** past time already rolls to tomorrow through `resolveClockTime`, and a **dated** one is refused with a toast.

**One limitation worth knowing.** Choosing minutes before an hour reports nothing upward, which is what stops a half-built time reaching `editRow` and burning an undo slot. The minute sits in the live `<select>` instead. So if something else re-renders the page in between — another row edited, or the tab coming back into focus — that lone minute is lost and the box returns to `--`. Storing partial times in `state` is the only way around it, and it would mean `"-- : 30"` becoming a persistable value.

## Open, decide while reading

1. Hours are **zero-padded**, `00`–`23`, so the pair reads `09 : 30` exactly as `09:30` does today. Unpadded `0`–`23` is the alternative.
2. The separator is a plain `:` between the two boxes, same size and colour as the labels.
3. The active-task editor drops its "overdue deadline falls back to the first slot" behaviour, since every clock time is now offerable — an overdue task simply shows its own time.
4. `#setSelect` stops existing. `submitSet()` reads the draft through the same helper the dropdown uses, so the two cannot disagree.

---

### Block 1: Replace [falsedge.js lines 1779-1780](../falsedge.js#L1779-L1780)

```js
    var selectEl = document.getElementById("setSelect");
    if (!textEl || !selectEl) return;
```

With:

```js
    if (!textEl) return;
```

---

### Block 2: Replace [falsedge.js line 1796](../falsedge.js#L1796)

```js
    var deadline = resolveDeadline(selectEl.value, date, now);
```

With:

```js
    var deadline = resolveDeadline(setChosenTime(now), date, now);
```

---

### Block 3: Replace [falsedge.js lines 2535-2551](../falsedge.js#L2535-L2551)

```js
    var opts = dropdownOptions(now);
    var sel = el("select", "time-select");
    opts.forEach(function (t) {
      var o = el("option", "", t);
      o.value = t;
      sel.appendChild(o);
    });
    // an overdue deadline isn't on offer any more, so fall to the first slot
    var cur = hhmm(new Date(task.deadline));
    if (opts.indexOf(cur) === -1) {
      cur = opts[0];
    }
    sel.value = cur;
    sel.addEventListener("change", function () {
      editTaskTime(id, sel.value);
    });
    row.appendChild(sel);
```

With:

```js
    // every clock time is offerable now, so an overdue deadline shows its own
    // rather than falling back to a slot it never held
    row.appendChild(buildTimeSelects(hhmm(new Date(task.deadline)),
      function (v) {
        if (!v) return;
        editTaskTime(id, v);
      }));
```

---

### Block 4: Remove [falsedge.js lines 2729-2745](../falsedge.js#L2729-L2745)

```js

  /**
   * Builds SET's dropdown options: 24 hours forward in 10-minute steps,
   * wrapping past midnight, starting 20 to 29 minutes out. Strictly increasing
   * in real time, so a past deadline is unreachable by construction.
   * @param {Date} now - the reference moment.
   * @returns {string[]} 144 clock times, "HH:MM".
   */
  function dropdownOptions(now) {
    var start = ceil10(addMinutes(now, 20));
    var out = [];
    var i;
    for (i = 0; i < 144; i++) {
      out.push(hhmm(addMinutes(start, i * 10)));
    }
    return out;
  }
```

---

### Block 5: Replace [falsedge.js lines 2747-2782](../falsedge.js#L2747-L2782)

```js
  /**
   * Builds a full-day time control: a "by" caption, then a `<select>` of 00:00
   * through 23:50 in 10-minute steps, identical every time and unrelated to
   * `now`. Both ACTIVATE row types and both adders route through here, so the
   * caption reaches all four from this one place.
   * @param {string} value - the currently selected "HH:MM", or "".
   * @param {boolean} withPlaceholder - include a leading "--:--" option.
   * @param {Function} onChange - called with the new value.
   * @returns {Element} the caption and `<select>` in their wrapper.
   */
  function buildDayTimeSelect(value, withPlaceholder, onChange) {
    var wrap = el("div", "field-pair");
    wrap.appendChild(el("span", "field-label", "by"));
    var sel = el("select", "time-select");
    if (withPlaceholder) {
      var ph = el("option", "", "--:--");
      ph.value = "";
      sel.appendChild(ph);
    }
    var h;
    var m;
    for (h = 0; h < 24; h++) {
      for (m = 0; m < 60; m += 10) {
        var t = pad2(h) + ":" + pad2(m);
        var o = el("option", "", t);
        o.value = t;
        sel.appendChild(o);
      }
    }
    sel.value = value;
    sel.addEventListener("change", function () {
      onChange(sel.value);
    });
    wrap.appendChild(sel);
    return wrap;
  }
```

With:

```js
  /**
   * Builds one half of an H : M pair: a "--" placeholder, then zero-padded
   * numbers from 0 up to `limit` in steps of `step`.
   * @param {string} cls - a second class, naming which half this is.
   * @param {number} limit - one past the highest value.
   * @param {number} step - the gap between options.
   * @param {string} value - the held value, or "".
   * @returns {Element} the select.
   */
  function buildTimeUnit(cls, limit, step, value) {
    var sel = el("select", "time-select " + cls);
    var ph = el("option", "", "--");
    ph.value = "";
    sel.appendChild(ph);
    var n;
    for (n = 0; n < limit; n += step) {
      var o = el("option", "", pad2(n));
      o.value = pad2(n);
      sel.appendChild(o);
    }
    sel.value = value;
    return sel;
  }

  /**
   * Builds an H : M pair covering the whole day, unrelated to `now`. Both
   * halves start at "--" when there is no time. Picking an hour fills the
   * minutes to "00" only when they are still blank, so minutes chosen first
   * are kept.
   *
   * `onChange` fires with "HH:MM" once an hour is set, or "" when the hour is
   * cleared. A minute on its own reports nothing, because a lone minute is not
   * a time and the callers turn every report into an undo entry.
   * @param {string} value - the held "HH:MM", or "".
   * @param {Function} onChange - called with the new value.
   * @returns {Element} the two selects and their separator, in a wrapper.
   */
  function buildTimeSelects(value, onChange) {
    var wrap = el("div", "time-pair");
    var parts = String(value || "").split(":");
    var hSel = buildTimeUnit("hour-select", 24, 1, parts[0] || "");
    var mSel = buildTimeUnit("min-select", 60, 10, parts[1] || "");
    /**
     * Reports the pair's combined value, or "" when no hour is set.
     */
    function report() {
      if (!hSel.value) {
        onChange("");
        return;
      }
      onChange(hSel.value + ":" + mSel.value);
    }
    hSel.addEventListener("change", function () {
      if (hSel.value && !mSel.value) {
        mSel.value = "00";
      }
      report();
    });
    mSel.addEventListener("change", function () {
      if (!hSel.value) return;
      report();
    });
    wrap.appendChild(hSel);
    wrap.appendChild(el("span", "time-colon", ":"));
    wrap.appendChild(mSel);
    return wrap;
  }

  /**
   * The same pair behind a "by" caption. Both ACTIVATE row types and both
   * adders route through here, so the caption reaches all four from one place.
   * @param {string} value - the held "HH:MM", or "".
   * @param {Function} onChange - called with the new value.
   * @returns {Element} the caption and the pair in their wrapper.
   */
  function buildByTime(value, onChange) {
    var wrap = el("div", "field-pair");
    wrap.appendChild(el("span", "field-label", "by"));
    wrap.appendChild(buildTimeSelects(value, onChange));
    return wrap;
  }

  /**
   * The clock time SET is working with: the draft's own, while it still clears
   * the 20-minute floor or is paired with a date, and otherwise the next
   * 10-minute mark past that floor. The floor is measured against today only,
   * so holding a date exempts the draft time from it - 07:00 is long past by
   * 14:00, but 07:00 three days out plainly is not. The dropdown and the
   * submit both read this, so the two cannot disagree.
   * @param {Date} now - the reference moment.
   * @returns {string} a clock time, "HH:MM".
   */
  function setChosenTime(now) {
    var held = state.setDraft.time;
    if (held) {
      if (state.setDraft.date) {
        return held;
      }
      var lead = resolveClockTime(held, now).getTime() - now.getTime();
      if (lead >= MIN_LEAD_MS) {
        return held;
      }
    }
    return hhmm(ceil10(addMinutes(now, 20)));
  }
```

---

### Block 6: Replace [falsedge.js lines 2858-2877](../falsedge.js#L2858-L2877)

```js
    // Resolved before the buttons are built: the dropdown's value is what
    // lights a time button, so a button is lit only while it agrees with the
    // dropdown, and nothing is lit when the dropdown holds some other time.
    var opts = dropdownOptions(now);
    // A draft time under the 20-minute floor silently lands on the first
    // available option, leaving text and WL/HL intact. The floor is measured
    // against today only, so a date being held exempts the draft time from it -
    // 07:00 is long past by 14:00, but 07:00 three days out plainly isn't.
    var chosen = opts[0];
    if (state.setDraft.time && opts.indexOf(state.setDraft.time) !== -1) {
      if (state.setDraft.date) {
        chosen = state.setDraft.time;
      } else {
        var lead = resolveClockTime(state.setDraft.time, now).getTime() -
          now.getTime();
        if (lead >= MIN_LEAD_MS) {
          chosen = state.setDraft.time;
        }
      }
    }
```

With:

```js
    // Resolved before the buttons are built: the pair's value is what lights a
    // time button, so a button is lit only while it agrees with the pair, and
    // nothing is lit when the pair holds some other time.
    var chosen = setChosenTime(now);
```

---

### Block 7: Replace [falsedge.js lines 2894-2908](../falsedge.js#L2894-L2908)

```js
    var selRow = el("div", "set-select-row");
    selRow.appendChild(el("span", "set-select-label", "or select"));
    var sel = el("select", "set-select");
    sel.id = "setSelect";
    opts.forEach(function (t) {
      var o = el("option", "", t);
      o.value = t;
      sel.appendChild(o);
    });
    sel.value = chosen;
    sel.addEventListener("change", function () {
      writeSetDraft("time", sel.value);
      render();
    });
    selRow.appendChild(sel);
```

With:

```js
    var selRow = el("div", "set-select-row");
    selRow.appendChild(el("span", "set-select-label", "or select"));
    selRow.appendChild(buildTimeSelects(chosen, function (v) {
      if (!v) return;
      writeSetDraft("time", v);
      render();
    }));
```

---

### Block 8: Replace [falsedge.js lines 3064-3066](../falsedge.js#L3064-L3066)

```js
    controls.appendChild(buildDayTimeSelect(r.time || "", true, function (v) {
      editRow(kind, id, "time", v);
    }));
```

With:

```js
    controls.appendChild(buildByTime(r.time || "", function (v) {
      editRow(kind, id, "time", v);
    }));
```

---

### Block 9: Replace [falsedge.js lines 3121-3124](../falsedge.js#L3121-L3124)

```js
    var sel = buildDayTimeSelect(draft.time, true, function (v) {
      draft.time = v;
      refresh();
    });
```

With:

```js
    var sel = buildByTime(draft.time, function (v) {
      draft.time = v;
      refresh();
    });
```

---

### Block 10: Add at [style-falsedge.css line 612](../style-falsedge.css#L612)

Just prior:

```css
  .time-select {
    min-height: 40px;
    padding: 0 8px;
  }
```

Added:

```css
  .time-pair {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .time-colon {
    font-size: 13px;
    color: var(--faint);
  }
```

Just after:

```css
  .date-input {
```

---

### Block 11: changelog

A version entry for `about.html`, drafted and approved before anything is pushed.
