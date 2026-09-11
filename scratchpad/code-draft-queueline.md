# The queue line — code draft

The minimum version: a divider inside ACTIVATE (others). Rows above it are in the queue and take a red border; rows below it grey out. **No new controls.** The chevrons already move a row one position at a time, so moving a row past the line is how it joins or leaves the queue — ordering and membership become the same gesture.

The line is **a fake item sitting in `state.others`** at the divide, so position is the only source of truth. Nothing counts, nothing can desync.

## Open, decide while reading

1. **Where the line lands for data that has no line yet.** Settled: **the bottom**, so every row you already have starts in the queue, all red.
2. **The out-group still hoists above everything.** Rows whose task is currently out sort to the top of the section by deadline, which means one can appear above the line while sitting below it in the array. They are already visually distinct (blue text), so this is left alone rather than reworked — but it does mean the visual order and the array order disagree for those rows.
3. Greying is `.task-further`'s exact treatment — the same dimming, the same softened border, and `--muted` text — since the rows below the line stay fully interactive and anything heavier would read as disabled.
4. Red is `--c-red` at the same 55% mix the other row borders use.
5. The divider is `1px`, `--c-red` fading to transparent, matching `.task-divider`'s treatment in ACTIVE TASKS.

---

### Block 1: Replace [falsedge.js line 360](../falsedge.js#L360)

```js
      others: [],
```

With:

```js
      others: [lineRow()],
```

---

### Block 2: Add at [falsedge.js line 296](../falsedge.js#L296)

Just prior:

```js
  function el(tag, cls, text) {
```

Added — placed above `el` so the storage helpers below can reach it:

```js
  /**
   * The queue line: a fake entry in `state.others`; marks where queue ends
   * @returns {Object} a fresh line entry.
   */
  function lineRow() {
    return { line: true };
  }

  /**
   * @param {*} r - an entry from `state.others`.
   * @returns {boolean} true when it is the line rather than a row.
   */
  function isLine(r) {
    return !!r && r.line === true;
  }

```

---

### Block 3: Replace [falsedge.js line 409](../falsedge.js#L409)

```js
    if (Array.isArray(raw.others)) s.others = raw.others;
```

With:

```js
    if (Array.isArray(raw.others)) s.others = withOneLine(raw.others);
```

---

### Block 4: Add at [falsedge.js line 372](../falsedge.js#L372)

Just prior:

```js
    if (raw.setDraft && typeof raw.setDraft === "object") {
```

Added — as a sibling of `normalise`, above it:

```js
  /**
   * Guarantees exactly one line in an `others` array: extras are dropped, and
   * a list with none gets one at the bottom, so existing rows all start in the
   * queue.
   * @param {Object[]} rows - the parsed array.
   * @returns {Object[]} the same rows with exactly one line.
   */
  function withOneLine(rows) {
    var out = rows.filter(function (r) {
      return !isLine(r);
    });
    var at = rows.findIndex(isLine);
    if (at === -1) {
      at = out.length;
    }
    out.splice(at, 0, lineRow());
    return out;
  }

```

---

### Block 5: Replace [falsedge.js lines 937-954](../falsedge.js#L937-L954)

```js
  function sortedOthers() {
    var out = [];
    var manual = [];
    state.others.forEach(function (r) {
      if (rowIsOut(r.id)) {
        out.push(r);
      } else {
        manual.push(r);
      }
    });
    out.sort(function (a, b) {
      var ta = activeTaskOfRow(a.id);
      var tb = activeTaskOfRow(b.id);
      return new Date(ta.deadline).getTime() -
        new Date(tb.deadline).getTime();
    });
    return out.concat(manual);
  }
```

With:

```js
  function sortedOthers() {
    var out = [];
    var manual = [];
    state.others.forEach(function (r) {
      if (!isLine(r) && rowIsOut(r.id)) {
        out.push(r);
      } else {
        manual.push(r);
      }
    });
    out.sort(function (a, b) {
      var ta = activeTaskOfRow(a.id);
      var tb = activeTaskOfRow(b.id);
      return new Date(ta.deadline).getTime() -
        new Date(tb.deadline).getTime();
    });
    return out.concat(manual);
  }
```

---

### Block 6: Replace [falsedge.js lines 3338-3354](../falsedge.js#L3338-L3354)

```js
  function buildOthers() {
    var section = buildSection("ACTIVATE (others)", "othersCard",
      "sec-others");
    var list = el("div", "tpl-list");
    sortedOthers().forEach(function (r) {
      list.appendChild(buildRow("others", r.id));
    });
    section.card.appendChild(list);
    section.card.appendChild(buildAdder("others"));
    return section.wrap;
  }
```

With:

```js
  function buildOthers() {
    var section = buildSection("ACTIVATE (others)", "othersCard",
      "sec-others");
    var list = el("div", "tpl-list");
    var below = false;
    sortedOthers().forEach(function (r) {
      if (isLine(r)) {
        below = true;
        list.appendChild(el("div", "queue-line"));
        return;
      }
      list.appendChild(buildRow("others", r.id, below));
    });
    section.card.appendChild(list);
    section.card.appendChild(buildAdder("others"));
    return section.wrap;
  }
```

---

### Block 7: Replace [falsedge.js lines 3181-3193](../falsedge.js#L3181-L3193)

```js
  function buildRow(kind, id) {
    var r = findRow(kind, id);
    var now = getNow();
    var row = el("div", "tpl-row");
    if (kind === "others" && rowIsOut(id)) {
      row.classList.add("row-isout");
    }
```

With:

```js
  function buildRow(kind, id, below) {
    var r = findRow(kind, id);
    var now = getNow();
    var row = el("div", "tpl-row");
    if (kind === "others") {
      if (rowIsOut(id)) {
        row.classList.add("row-isout");
      } else if (below) {
        row.classList.add("row-belowline");
      } else {
        row.classList.add("row-queued");
      }
    }
```

---

### Block 8: Replace [falsedge.js line 1911](../falsedge.js#L1911)

```js
      state.others.push({
```

With — a new row joins the queue, so it lands just above the line:

```js
      state.others.splice(state.others.findIndex(isLine), 0, {
```

---

### Block 9: Replace [falsedge.js lines 1993-2000](../falsedge.js#L1993-L2000)

```js
  function moveTargetIndex(id, delta) {
    var at = indexOfRow("others", id);
    if (at === -1) return -1;
    var to = at + delta;
    while (to >= 0 && to < state.others.length &&
      rowIsOut(state.others[to].id)) {
      to = to + delta;
    }
```

With — the line is a valid thing to swap with, since that is how a row crosses it:

```js
  function moveTargetIndex(id, delta) {
    var at = indexOfRow("others", id);
    if (at === -1) return -1;
    var to = at + delta;
    while (to >= 0 && to < state.others.length &&
      !isLine(state.others[to]) && rowIsOut(state.others[to].id)) {
      to = to + delta;
    }
```

---

### Block 10: Add at [style-falsedge.css line 656](../style-falsedge.css#L656)

Just prior:

```css
  .row-isout .tpl-text {
    color: var(--c-sky);
  }
```

Added:

```css
  .row-queued {
    border-color: color-mix(in srgb, var(--c-red) 55%, var(--line-soft));
  }
  .row-belowline {
    opacity: .72;
    border-color: color-mix(in srgb, var(--glow) 16%, var(--line-soft));
  }
  .row-belowline .tpl-text {
    color: var(--muted);
  }
  .queue-line {
    height: 1px;
    margin: 4px 0;
    background: linear-gradient(
      to right,
      color-mix(in srgb, var(--c-red) 45%, transparent),
      transparent);
  }
```

Just after:

```css
  .tpl-adder {
```

---

### Block 11: changelog

increment: +0.1

- Queue line FINALLY ADDED to ACTIVATE (others). Rows above the line are in the queue and take a red border; rows below it grey out but still work exactly the same. Move a row across the line with the existing ▲▼ chevrons (for now) (will be changed later)
- Existing rows all start above the line.
