# Undo/redo for aulists

## Context

Every mutating action in the app is currently permanent — a mis-tap on delete, permanent-delete, or a bad JSON import has no way back. The goal is a session-wide undo/redo covering the 18 action types agreed on (see hook-point table below), surfaced as a small persistent bottom-anchored control, without corrupting the existing daily-rollover mechanism (`applyRollover`/`state.todayDateKey`) when undo steps across a day boundary.

Design decisions already locked in from discussion:
- **Snapshot-based**, not per-action inverse functions: each undo entry is a full clone of `state` taken right before a mutation. This makes JSON import undoable for free, with no bespoke inverse logic.
- **In-memory only** — the stacks are plain JS arrays, not persisted to `localStorage`. They start empty on every page load/refresh (refresh already always applies a silent rollover if one's due, so a fresh session starting with a clean stack is intentional, not a gap).
- **Depth cap: 60** entries, oldest evicted first.
- Rollover and auto-return fire unconditionally and silently, on boot and on every `visibilitychange`. Each pushes its own **boundary entry** onto the undo stack, the same stack regular actions use; see "Boundary entries" below.
- Crossing a boundary entry with undo/redo — stepping back past a rollover or auto-return, or forward across one again — requires a lightweight inline confirm, gated separately per entry; see "Boundary entries" below for the mechanics.
- confirmed not part of undo stack: move an item up/down in the lists chain. trivial; not worth undoing.
- **Every undo/redo tap shows a toast** naming the action it just reversed/reapplied (e.g. "Undid: Delete item"), so it's never a silent, disorienting change.
- `state.lastExportedConfirmed` and its dedicated confirm/revert UI get **removed** — it was a hand-rolled, one-level undo built specifically for the export timestamp (see the "Export tracking simplification" section below), made fully redundant by the real undo stack.
- A separate small feature: a manual refresh button, since this PWA has no pull-to-refresh (overridden) and no browser chrome in standalone mode to reload from.

## Undo/redo engine

All state lives in [autorelists.js](autorelists.js). `state` is a single closure-scoped `var` (declared at line 17, reassigned wholesale by `importFromText`), so snapshotting is just `JSON.parse(JSON.stringify(state))` — the same serialization `save()` already uses, no need for `structuredClone` or a diffing library.

Add near the top, alongside `state`:
```js
var undoStack = [];
var redoStack = [];
var UNDO_CAP = 60;
var pendingBoundary = null; // { direction: "undo" | "redo" }

function snapshotState() { return JSON.parse(JSON.stringify(state)); }

function pushUndo(label) {
  undoStack.push({ snapshot: snapshotState(), label: label });
  if (undoStack.length > UNDO_CAP) undoStack.shift();
  redoStack = [];
  refreshUndoRedoButtons();
}

function pushBoundary(label) {
  undoStack.push({ snapshot: snapshotState(), label: label, isBoundary: true });
  if (undoStack.length > UNDO_CAP) undoStack.shift();
  redoStack = [];
  refreshUndoRedoButtons();
}

function undo() {
  if (!undoStack.length) return;
  if (pendingBoundary && pendingBoundary.direction !== "undo") {
    pendingBoundary = null;
    hideBoundaryConfirm();
    return;
  }
  var top = undoStack[undoStack.length - 1];
  if (top.isBoundary && !(pendingBoundary && pendingBoundary.direction === "undo")) {
    pendingBoundary = { direction: "undo" };
    showBoundaryConfirm("undo", top.label);
    return;
  }
  pendingBoundary = null;
  hideBoundaryConfirm();
  var entry = undoStack.pop();
  redoStack.push({ snapshot: snapshotState(), label: entry.label, isBoundary: entry.isBoundary });
  state = entry.snapshot;
  save();
  syncScheduleInputs();
  updateLastExported();
  render();
  refreshUndoRedoButtons();
  toast("Undid: " + entry.label);
}

function redo() {
  if (!redoStack.length) return;
  if (pendingBoundary && pendingBoundary.direction !== "redo") {
    pendingBoundary = null;
    hideBoundaryConfirm();
    return;
  }
  var top = redoStack[redoStack.length - 1];
  if (top.isBoundary && !(pendingBoundary && pendingBoundary.direction === "redo")) {
    pendingBoundary = { direction: "redo" };
    showBoundaryConfirm("redo", top.label);
    return;
  }
  pendingBoundary = null;
  hideBoundaryConfirm();
  var entry = redoStack.pop();
  undoStack.push({ snapshot: snapshotState(), label: entry.label, isBoundary: entry.isBoundary });
  state = entry.snapshot;
  save();
  syncScheduleInputs();
  updateLastExported();
  render();
  refreshUndoRedoButtons();
  toast("Redid: " + entry.label);
}
```
`refreshUndoRedoButtons()` toggles `disabled` on the two buttons based on stack emptiness (independent of the tap-cooldown state below).

Each `pushUndo()`/`pushBoundary()` call site passes a short label describing the action about to happen. On undo, that label describes what's being reversed (it's attached to the pre-action snapshot); on redo, the same label rides along onto the redo stack and describes what's being reapplied — no separate lookup needed, the label is just carried with its snapshot both directions.

A stack entry with `isBoundary: true` is a rollover or auto-return rather than a user action (see "Boundary entries" below). Stepping onto one — either popping it off the top of `undoStack` in `undo()`, or off `redoStack` in `redo()` — requires a confirm: the first tap sets `pendingBoundary` and shows the inline confirm instead of acting, and only a matching second tap in the same direction actually pops the entry and applies it. A tap in the other direction, or any tap elsewhere, clears `pendingBoundary` via a document-level click listener and hides the confirm without touching the stack.

### Hook points

Call `pushUndo(label)` right before the first `state` mutation, after existing guard clauses so no-op calls don't pollute the stack:

| # | Action | Label | Function | Line |
|---|---|---|---|---|
| 1 | Add item | "Add item" | `buildAdder` → `commit()` | ~2276 |
| 2 | Complete item | "Complete item" | `completeItem` | 693 |
| 3 | Uncomplete item | "Uncomplete item" | `uncompleteItem` | 712 |
| 4 | Edit item text | "Edit item text" | `editItem` | 788 |
| 5 | Edit item note | "Edit item note" | `editNote` | 804 |
| 6 | Delete item → trash | "Trash item" | `trashItem` | 734 |
| 7 | Recover from trash | "Untrash item" | `recoverItem` | 752 |
| 8 | Permanent delete | "Permadelete item" | `permaDelete` | 770 |
| 9 | Add recurring item | "Add recurring item" | `openNewRecurringItemEditor` → `onSave` | ~3990 |
| 10 | Edit recurrence (save or clear-to-blank) | "Edit recurrence" | `openRecurrenceEditor` → `onSave` and `onBlank` | 3949, 3962 |
| 11 | Add past item | "Add past item" | `addPastItem` | 917 |
| 12 | Edit past item text | "Edit past item text" | `editPastItemText` | 861 |
| 13 | Edit past item note | "Edit past item note" | `editPastItemNote` | 879 |
| 14 | Toggle past item done | "Toggle past item done" | `togglePastItemDone` | 845 |
| 15 | Delete past item | "Delete past item" | `deletePastItem` | 902 |
| 16 | Import JSON | "Import" | `importFromText` | 2623 (after the `window.confirm` guard) |
| 17 | Edit return schedule | "Edit return schedule" | `onScheduleChange` | 2574 |
| 18 | Mark exported | "Mark exported" | `markExported` | 2612 |

Every one of these already follows guard-clauses → mutate `state` → `save(); render();` — `pushUndo(label)` slots in as one line right before the mutation in each, no restructuring needed.

Note on #17: `onScheduleChange` is wired to all three schedule inputs' `change` events independently ([autorelists.js:2589-2591](autorelists.js#L2589)), so editing "every N days" then the hour then the minute in one sitting produces three separate undo entries, not one combined edit. That matches how every other field-level edit in this list is tracked (one entry per commit), so it's consistent, just worth knowing.

Note on scope bleed: because entries are whole-`state` snapshots, an undo also silently rewinds any other field that happened to change since that snapshot even though it wasn't the action being undone. That's inherent to whole-object snapshotting, not a bug — noting it so it's not a surprise later.

## Export tracking simplification

Currently `updateLastExported()` ([autorelists.js:4121](autorelists.js#L4121)) hand-rolls a one-level undo just for the export timestamp: a ✓ button sets `state.lastExportedConfirmed = state.lastExported`, and a ✕ button reverts with `state.lastExported = state.lastExportedConfirmed`. With `markExported()` becoming a tracked action (#18 above), the real undo stack already covers "undo my last export-mark" — and covers it better, going back multiple exports deep instead of one.

Remove:
- `lastExportedConfirmed: null` from `freshState()` ([autorelists.js:115](autorelists.js#L115)).
- The `lastExportedConfirmed` parsing block in `normalise()` ([autorelists.js:232-234](autorelists.js#L232)).
- The `confirmed` check, the ✓ confirm button, and the ✕ revert button in `updateLastExported()` ([autorelists.js:4121-4165](autorelists.js#L4121)) — left with just the plain "Last exported: `<date>`" / "Never exported" text.

## Boundary entries: rollover & auto-return

Rollover and auto-return fire unconditionally and silently, on boot and on every `visibilitychange`. Both are safe to step across with undo/redo, per the actual mutation code:
- `snapshotTodayZones()` (autorelists.js:514) overwrites `state.pastDaysByDate[dateKey]` outright, doesn't append — safe to re-run.
- `placeRecurringItems()` guards on `findItemListKey(id) !== null`, so it's safe to re-run.
- `applyAutoReturn()`'s list-2-to-list-1 move is a plain concat-and-clear, safe to re-run.

Each pushes its own boundary entry via `pushBoundary()` (defined in "Undo/redo engine" above), right before applying its mutation:
- Inside `applyRollover()`'s while-loop, once per day actually rolled over. A multi-day catch-up (after being away a while) produces one boundary entry per day — each needs its own confirm to undo through, per the decisions below.
- Inside `applyAutoReturn()`, only in the branch that actually moves items (`crossed && state.lists["2"].length > 0`), not the bookkeeping-only branch.

`applyRollover()` and `applyAutoReturn()` run unconditionally on boot and on every `visibilitychange`:
```js
document.addEventListener("visibilitychange", function () {
  if (!document.hidden) {
    purgeTrash();
    applyRollover();
    applyAutoReturn();
    render();
  }
});
```

### Decisions locked in for the confirm gate

- Redo mirrors undo: crossing a boundary entry forward also requires the confirm, not just crossing one backward.
- Each boundary entry requires its own separate confirm — confirming one does not let you blow through further boundary entries in the same run.
- The confirm tap (the second press) still goes through the normal 500ms cooldown like any other tap on the pill — no exemption.
- Confirm is the same button, tapped a second time. Anything else — the other button, or any other tap on screen — cancels the pending confirm and does nothing further. The boundary entry stays on the stack, untouched.

### UI: inline confirm + button highlight

Not a modal. A small element pops up from the bottom, attached above the undo/redo pill (same fixed-position family as `.undo-redo-pill`, see "UI: undo/redo pill" below), showing text like:
- "Undoing over a rollover"
- "Redoing over a rollover"
- "Undoing over a list 2→1 transfer"
- "Redoing over a list 2→1 transfer"

While a confirm is pending, the triggering button's border switches from the normal grey to the text-color variable (white in dark mode, black in light mode) instead of the default border color.

## UI: undo/redo pill

Static markup in [index.html](index.html), placed as a sibling of `#toast` so it survives scroll the same way:
```html
<div class="undo-redo-pill" id="undoRedoPill">
  <button id="undoBtn" class="ur-btn" aria-label="Undo" disabled>&#8630;</button>
  <button id="redoBtn" class="ur-btn" aria-label="Redo" disabled>&#8631;</button>
</div>
```

CSS in [style-minim.css](style-minim.css), following the `.toast` pattern (fixed, bottom-anchored, translateX(-50%) centering) but as a small tab poking up rather than a full-width bar — square buttons, gap between them, `z-index` between toast (50) and modal (100) so it's covered while a modal is open:
```css
.undo-redo-pill {
  position: fixed; left: 50%; bottom: 0; transform: translateX(-50%);
  display: flex; gap: 10px; padding: 6px 10px 4px;
  background: var(--surface); border: 1px solid var(--line);
  border-bottom: none; border-radius: 10px 10px 0 0;
  box-shadow: 0 -2px 10px var(--shadow); z-index: 60;
}
.ur-btn {
  width: 40px; height: 40px; padding: 0; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.2rem;
}
.ur-btn:disabled { opacity: 0.35; }
.ur-btn.cooldown { opacity: 0.35; pointer-events: none; }
```

Wiring (near the boot sequence at the bottom of autorelists.js):
```js
var undoBtn = document.getElementById("undoBtn");
var redoBtn = document.getElementById("redoBtn");

function refreshUndoRedoButtons() {
  undoBtn.disabled = undoStack.length === 0;
  redoBtn.disabled = redoStack.length === 0;
}

function withCooldown(fn) {
  return function () {
    if (undoBtn.classList.contains("cooldown")) return;
    fn();
    undoBtn.classList.add("cooldown");
    redoBtn.classList.add("cooldown");
    setTimeout(function () {
      undoBtn.classList.remove("cooldown");
      redoBtn.classList.remove("cooldown");
    }, 500);
  };
}
undoBtn.addEventListener("click", withCooldown(undo));
redoBtn.addEventListener("click", withCooldown(redo));
refreshUndoRedoButtons();
```
The cooldown applies to both buttons together on any tap (undo *or* redo), since rapid alternating taps are the same footgun as rapid same-button taps. The toast from `undo()`/`redo()` fires on every tap regardless of cooldown, since it's the whole point of the tap.

## Refresh button

Service worker ([sw.js](sw.js)) is network-first (tries fetch, only falls back to cache on failure), so a plain `location.reload()` is sufficient — no cache-busting or `skipWaiting` dance needed.

Placement: top header, next to the "Lists" title in [index.html:17-19](index.html#L17), since it's a rare page-level action (distinct from the frequent-tap undo/redo controls at the bottom) and the header currently has nothing else in it:
```html
<header class="app">
  <h1>Lists</h1>
  <button id="refreshBtn" class="mini" aria-label="Refresh">&#8635;</button>
</header>
```
Wired with a single `addEventListener("click", function () { location.reload(); })`.

## Verification (manual — you test in-browser per your usual workflow)

- Do each of the 18 actions once, confirm the undo button enables, the toast names the right action, and undo reverts exactly that action; confirm redo re-applies it with a matching toast.
- Chain several different action types, undo/redo through the whole run, watching the toast track each step.
- Import a JSON blob, confirm one undo fully reverts to pre-import state.
- Push past 60 actions, confirm the oldest stops being reachable.
- Use the debug "now" panel to cross a day boundary, then tap undo enough times to reach the rollover's boundary entry — confirm the inline confirm shows instead of undoing straight through, a second same-button tap actually undoes it, and a tap on the other button or elsewhere cancels the confirm and leaves the entry on the stack.
- Do the same for redo across the same boundary entry, and separately for an auto-return (list 2→1 transfer) boundary entry.
- Trigger a multi-day catch-up (away for several days) and confirm it produces one boundary entry per day, each requiring its own separate confirm to undo through — no blowing through several at once off a single confirm.
- Tap undo/redo rapidly — confirm the 500ms greyout blocks the extra taps, including the confirm tap itself.
- Tap the new refresh button — confirm it reloads and (if a boundary is pending) applies rollover silently per the reload rule.
- Export via each of the three export buttons, confirm the "Last exported" note updates with no confirm/revert buttons present, and confirm undo reverts it.
