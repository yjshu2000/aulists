# Mode buttons get their own row — code draft

Last updated: 2026-11-11 23:45

1. **Dailies rows:** the toggles move off the time row onto a second row, with the hamburger beside them. Same two-row shape `others` already has, minus the date.
2. **Dailies adder:** same split. Time alone on the first row; toggles and `[add]` on the second, `[add]` pushed right.
3. **Slimmer:** mode button side padding 12px → 8px, and no space between mode buttons (8px → 0). Both only touch mode buttons, but every set of them: ACTIVATE rows, both adders, SET, and the active-task time editor.
4. **Others:** untouched. Arrows and hamburger stay right. The hamburger most likely dropped a line because the leftover space was a few px short once its 8px gap is counted; the slimming above frees 56px on that row, so it should come back up.

---

### Block 1: Replace [falsedge.js lines 3313–3317](../falsedge.js#L3313-L3317)

```js
   * Builds one ACTIVATE row: its text, then the control row of time dropdown,
   * optional date picker, WL/HL toggles, sort chevrons and hamburger. Swipe
   * left activates it outright, swipe right prefills SET. An `others` row on
   * cooldown dims and carries its remaining time inline, but stays fully
   * editable - only activation is blocked.
```

With:

```js
   * Builds one ACTIVATE row: its text, a control row of time dropdown and
   * optional date picker, then a second of mode toggles, sort chevrons and
   * hamburger. Swipe left activates it outright, swipe right prefills SET. An
   * `others` row on cooldown dims and carries its remaining time inline, but
   * stays fully editable - only activation is blocked.
```

---

### Block 2: Replace [falsedge.js lines 3358–3376](../falsedge.js#L3358-L3376)

```js
    // only `others` splits; dailies doesn't split line
    if (kind === "others") {
      controls.appendChild(buildDateInput(r.date || "", now, function (v) {
        editRow(kind, id, "date", v);
      }));
      if (r.nonRecurring) {
        controls.appendChild(el("span", "row-nonrec", "⊫"));
      }
      row.appendChild(controls);
      if (r.lastDone) {
        var done = new Date(r.lastDone);
        if (!isNaN(done.getTime())) {
          row.appendChild(el("div", "row-lastdone-note",
            "last done: " + formatDateTime(done) + " · " +
            formatAgo(now.getTime() - done.getTime())));
        }
      }
      controls = el("div", "tpl-controls");
    }
```

With:

```js
    // `others` adds its date; either way the toggles get a row of their own
    if (kind === "others") {
      controls.appendChild(buildDateInput(r.date || "", now, function (v) {
        editRow(kind, id, "date", v);
      }));
      if (r.nonRecurring) {
        controls.appendChild(el("span", "row-nonrec", "⊫"));
      }
    }
    row.appendChild(controls);
    if (kind === "others" && r.lastDone) {
      var done = new Date(r.lastDone);
      if (!isNaN(done.getTime())) {
        row.appendChild(el("div", "row-lastdone-note",
          "last done: " + formatDateTime(done) + " · " +
          formatAgo(now.getTime() - done.getTime())));
      }
    }
    controls = el("div", "tpl-controls");
```

---

### Block 3: Replace [falsedge.js lines 3457–3466](../falsedge.js#L3457-L3466)

```js
    controls.appendChild(sel);
    if (kind === "others") {
      controls.appendChild(buildDateInput(draft.date, now, function (v) {
        draft.date = v;
      }));
    }
    controls.appendChild(modes);
    controls.appendChild(addBtn);
    wrap.appendChild(input);
    wrap.appendChild(controls);
```

With:

```js
    controls.appendChild(sel);
    if (kind === "others") {
      controls.appendChild(buildDateInput(draft.date, now, function (v) {
        draft.date = v;
      }));
    }
    wrap.appendChild(input);
    // dailies gives its toggles and [add] a row of their own below the time
    if (kind === "dailies") {
      wrap.appendChild(controls);
      controls = el("div", "tpl-controls");
    }
    controls.appendChild(modes);
    controls.appendChild(addBtn);
    wrap.appendChild(controls);
```

---

### Block 4: Replace [style-falsedge.css lines 580–583](../style-falsedge.css#L580-L583)

```css
  .mode-row {
    display: flex;
    gap: 8px;
  }
```

With:

```css
  .mode-row {
    display: flex;
  }
```

---

### Block 5: Replace [style-falsedge.css lines 587–589](../style-falsedge.css#L587-L589)

```css
  .mode-btn {
    min-height: 40px;
    padding: 0 12px;
```

With:

```css
  .mode-btn {
    min-height: 40px;
    padding: 0 8px;
```

---

### Block 6: changelog

Previous: v2.26 (2026-11-11 23H)

increment: +0.0.1 → **v2.26.1**

- Dailies: the mode buttons and hamburger moved to their own row below the time. Same for the dailies adder, with `[add]` beside the mode buttons.
- Mode buttons are slimmer and sit flush against each other, so the others row fits its hamburger again.
