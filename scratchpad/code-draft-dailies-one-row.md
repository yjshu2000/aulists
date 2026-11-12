# Dailies back to one row — code draft

Last updated: 2026-11-12 00:38

Reverts the falsedge.js half of v2.26.1 (blocks 1–3 of `code-draft-mode-row-fit.md`): dailies rows and the dailies adder go back to time, toggles and hamburger / `[add]` on one row. The CSS half (8px padding, flush pills) stays.

---

### Block 1: Replace [falsedge.js lines 3313–3317](../falsedge.js#L3313-L3317)

```js
   * Builds one ACTIVATE row: its text, a control row of time dropdown and
   * optional date picker, then a second of mode toggles, sort chevrons and
   * hamburger. Swipe left activates it outright, swipe right prefills SET. An
   * `others` row on cooldown dims and carries its remaining time inline, but
   * stays fully editable - only activation is blocked.
```

With:

```js
   * Builds one ACTIVATE row: its text, then the control row of time dropdown,
   * optional date picker, mode toggles, sort chevrons and hamburger. Swipe left
   * activates it outright, swipe right prefills SET. An `others` row on
   * cooldown dims and carries its remaining time inline, but stays fully
   * editable - only activation is blocked.
```

The old wording said `WL/HL toggles`, which was already stale, so it now says `mode toggles` instead of going back to that.

---

### Block 2: Replace [falsedge.js lines 3358–3376](../falsedge.js#L3358-L3376)

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

With:

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

---

### Block 3: Replace [falsedge.js lines 3457–3471](../falsedge.js#L3457-L3471)

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

With:

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

---

### Block 4: changelog

Previous: v2.26.1 (2026-11-11 23H)

increment: +0.0.1 → **v2.26.2**

- Dailies are back to one row: the slimmer, flush mode buttons fit beside the time after all.
