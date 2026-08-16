# Next features & fixes

## Doc rules

**D1. This is the living backlog.** It is the single place pending work is tracked. It gets edited in place as things change — not appended to, not superseded by a newer doc. No Q&A format, no discussion history, no rejected options.

**D2. Shipped items get deleted, not ticked off.** When something lands in the code, its entry is removed from this doc entirely. There is no "done" section. The changelog in `about.html` is the record of what shipped; this doc is only what hasn't.
*This also applies to rejected options.*

**D3. Three supersections, one per app page.** Falsedge, Aulists, Hex 2^. Each item is a `###` heading under its page's `##`. An item that spans two pages will go in the "multi-page items" section.

**D4. Items are written as decisions, not questions.** If something is genuinely undecided, it says so explicitly in the item rather than being left vague. Exploratory ideas are marked exploratory.

**D5. Source lineage.** Continuously distilled from `scratchpad/sad-todos-babble.md`. New babbles are distinguished from old ones with a `^ all items above are added to doc ^` line. 

**D6. The bracketed `iN` labels are IDs and nothing else.** Not priority, not chronological, not an ordering — nothing carries any of that, much less the ID. An ID is assigned once and never changes: items keep theirs when reordered or moved between sections, and a deleted item's ID is retired rather than reused. Gaps in the sequence are normal and expected. Sub-items are `iN.1`, `iN.2`, … numbered from `.1`, as `####` headings under their parent, and follow the same rules.

**D7. No backward compatibility for old data, ever.** No migration code, no accounting for old data shapes, in this phase or any future one. If data has to survive a breaking change, it gets exported, updated, and re-imported by hand.

**D8. Every item's heading ends with a tag.** ⬜ big task, ⚪ medium task, ▫️ minor or trivial to implement. 🐞 marks a bug fix rather than new work, and sits alongside a size tag rather than replacing it. Sub-items are tagged on their own merits, independently of their parent.

**D9. 🆗 means buildable as-is, right now.** It is Claude's assertion about the item's completeness — not a priority, and not the user's approval to start. It says the item can be built start to finish with no further questions asked and no assumption made that could turn out wrong: every question that *could* be asked about it has already been asked and answered. It goes last in the heading, after the size tag. Its absence says nothing about importance — only that at least one detail would still have to be guessed at. A lack of an `**Undecided:**` block is *not* enough on its own to earn it, since an item can list no open questions and still leave something unwritten. Claude adds it; anything that raises a new question about the item strips it again.

## Falsedge

### [i5] DOLI (Double Or Lose It) mechanism ⬜

Ships complete: state schema, scoring curve, limits, and the promotion control itself.

**Scoring.** WL/HL is a general ½-scale state, not two fixed unrelated arrays (`HL_OFFSETS` is `WL_OFFSETS` halved: `[0,10,30,60]` → `[0,5,15,30]`). DOLI defines its own whole (WL) schedule, and the same halving rule applies when a DOLI task is set to HL:

```
WL  minutes past deadline:  0   10   30   60   120   >120
HL  minutes past deadline:  0    5   15   30    60    >60
    points:                12    6    3    2     0     -6
```

(0 means completed on time / within deadline.) The key difference from a normal task: instead of just becoming 0, there's only a 1-hour window at 0 before it drops straight to -6.

**Visual.** A promoted task shows a 64px Aventurine chibi in its own block, in the empty space to the right of the `by X for X pts` lines, vertically centred against that whole group of rows. Four images, one picked at random per page load and stable through re-renders until an actual reload: `assets/aven-play-cards.png`, `assets/aven-cool.png`, `assets/aven-cheers.png`, `assets/aven-throw-money.png`.

**Promotion control.** A 32px rounded square, 10px radius, containing `assets/arrow-promo.svg` at 20px. It exists exactly once on the page, in the `ACTIVE TASKS` wrapper header (`#tasksCard`).


The square carries no CSS border. Its outline is an SVG rounded rect drawn twice: a flat grey base ring, and a glowing ring over it carrying `pathLength="100"` with a `stroke-dasharray` driven by cooldown progress, so the outline traces itself clockwise from the top-left corner as the cooldown elapses. The glowing stroke takes the wrapper's `--glow`, which is `var(--c-green)`. A closed loop means ready, a partial arc means still cooling, and there is no interior fill at any point.

Tapping the square enters pick mode: every active task block gets a full-block overlay reading `select` — the existing `.edit-overlay` treatment reparented to `.task-block`, which is already `position: relative` and so needs no other change. Tapping a block promotes it. Tapping the square again, or anywhere that isn't a task block, leaves pick mode without promoting anything.

Promotion is irreversible. Undo is the only way back, and otherwise the only exit is cancelling the task outright — the mechanic is a gamble on commitment, so there is no un-promote.

**Limits.** Promoting costs nothing — there is no cooldown on *setting* a DOLI task. Two limiters instead:

- **Concurrent cap.** At most `floor(doliLimit)` DOLI tasks may be active at once. `doliLimit` starts at `1`. Every completed DOLI raises it; every cancelled or failed one lowers it. The fractional part is the point: several successes in a row are what eventually buy a second simultaneous DOLI.
- **Cancel cooldown.** Cancelling a DOLI task starts a cooldown during which nothing can be promoted. Completing a DOLI task immediately clears a running cooldown; failing one (letting it run past the deadline) has no effect on it either way.

**Undecided:** the raise step (`0.1` or `0.2` per success), whether the penalty step is the same size, whether `doliLimit` has a ceiling or a floor at 1, whether a *failed* DOLI counts as a cancel for the penalty step, and the cancel cooldown's length. Also open: whether this cooldown is redundant with the existing 36h `others`-row cancel cooldown (`COOLDOWN_MS`) when the DOLI task was activated from an `others` row.

The square is inert while a cooldown is running or the concurrent cap is already met, so at rest it sits permanently fully lit — a closed ring is the normal state, not a special one.

### [i8] Spend row: backdating, bulk buy, multiline ⬜

The row becomes `[text field] [pts cost] [×N] [spend]`, with a date picker on its own line above it.

**Backdating.** A spend is still *appended* to the ledger at the position corresponding to when it was logged (creation order, same as today), but the date stamped on the entry can be set into the past — recording when the money was actually spent, not when it was logged. A spend entry's stamped date and its position in the ledger array can therefore disagree: an entry near the end of the ledger can carry an earlier date than one before it.

**UI.** A native date-picker input on its own new line, defaulting to today, sitting between the "log spent points" label and the row's existing controls — not merged into that controls row.

```
┌────────────────────┐
│ Current pts: 42  ^ │
└────────────────────┘
log spent points
[ 2026-08-03 📅 ]
[ text field         ]  [cost▾]  [×N▾]  [spend]
┌────────────────────┐
│ Current scr: 127 > │
└────────────────────┘
```

**Ledger text.** The date becomes a new second line, sitting between the text and the `pts` line — the same position a task entry's `by` line occupies:

```
new headphones
on 2026-08-03
pts = 45 - 50 = -5
```

**`pts cost`** becomes a combined dropdown + text input (`<input list>` + `<datalist>`) and shrinks in width. Its suggestions are the 10 most-frequently-used cost values, sorted by numerical value in the dropdown itself, not by frequency.

**Frequency data** comes from a new `spendCostCounts` map in state, `{cost: timesUsed}`, incremented every time `[spend]` is tapped. It must be a plain object, not a `Map` — a `Map` serializes to `{}` and would be silently emptied by `save()`. It grows only with the number of *distinct* cost values ever used, not with total spend count — a repeated cost increments its existing counter. It is not derived by re-parsing ledger entry strings, consistent with how the rest of Falsedge avoids re-deriving things from pre-rendered ledger text.

**`×N`** is a new field, the same combined dropdown + text input shape as `pts cost`, but with its own fixed suggestion range of 1–9, defaulting to 1. `pts cost` is per-unit; the total deducted is cost × N.

A bulk buy shows the count in both the text line and the `pts` line, so the unit cost stays visible and the total stays checkable:

```
chips ×3
on 2026-08-03
pts = 45 - 10×3 = 15
```

### [i13] Swap homepage to Falsedge ⚪ 🆗

Done as a file rename. The current `index.html` (Aulists) becomes `aulists.html`, and `falsedge.html` becomes `index.html`. Cross-links, `manifest.json`'s `start_url`, and `sw.js`'s `SHELL` list all get updated to match the new filenames.

`manifest.json`'s `name` and `short_name` stay `"Aulists"` — it remains the overall umbrella app name, unchanged by which page is the entry point.

### [i14] Complex tasks ⬜

#### [i14.1] Multipliers and bonuses (exploratory) ⬜

Vague idea — support for multipliers on tasks, conditional on something unspecified. Not fleshed out.

#### [i14.2] Event-anchored deadlines ⬜

Needed ASAP. A task can be set whose deadline isn't known at set time, because it hangs off an event that hasn't happened yet — "within 1h of check phone after wake", "within 1h of getting home (chimer resumes)". The event's real time is entered manually later, and the deadline is computed from it: enter `19:37` and the deadline resolves to `20:40`.

**Undecided:** nearly all of it. The `19:37` → `20:40` example is +1h and then rounded up to the next 10-minute mark, which matches the app's existing 10-minute offset granularity, but that rounding rule was never stated outright. Also open: where the anchor phrase is authored, what the task displays before its event time is entered, whether the offset is fixed at 1h or configurable per task, whether scoring runs from the resolved deadline exactly as a normal task's does, and what happens if the event time is never entered at all.

### [i16] Micro tasks (NL) ⬜

A second, smaller class of task. `NL` (no leniency) *is* the micro-task marker — tagging an item NL hands it the whole package rather than only switching leniency off, so there is no separate "micro" toggle to set.

- Worth +1 point, flat.
- One hard deadline. No WL/HL ladder, no offsets, no partial credit: on time or 0.
- Can come as a set sharing a single deadline, each member checked off individually.
- Can live in templates, dailies and others alike.
- Can be attached to another item. Swiping that item into an active task activates its whole micro-task set alongside it — and that is the *only* link between them. Cancelling or editing the parent afterwards does nothing to the set; the attachment is a swiping convenience, not a dependency.
- Cancelling works at either granularity: one micro task on its own, or the whole set at once.
- DOLI does not apply to micro tasks — a +1 task is not worth a gamble slot.

### [i17] Time since last active task ⚪

A readout of how long there has been nothing active at all. It counts from the last task's *deadline*, not from when that task was resolved: a task due at 0:00 that went uncancelled until 8:00 shows `8h` the moment it clears, not `0h`.

Computed at render and refreshed only by a page refresh. Deliberately allowed to go stale in between — no `setInterval`, no live ticking.

**Undecided:** where on the page it sits, and its exact wording.

### [i19] Delete individual ledger entries ⚪

An entry can be deleted on its own. Today the only way anything leaves `state.ledger` is `splice(0, batch.count)` after a copy-export, so a wrong entry is stuck the moment undo can no longer reach back to it.

Deletion runs through `pushUndo()` like every other mutation, so it lands in the undo timeline, which now outlives the session.

**Undecided:** the control's shape and where it hangs off the entry box, and whether it needs a confirm step given deletion is undoable.

### [i20] Date picker on further tasks ⚪

A further task shows a weekday (`TU`, `WE`) next to its clock time, and that day currently cannot be changed: `applyTaskEdit()` deliberately preserves the existing date because the editor only offers clock times (`falsedge.js:1047`). Add a native date input to the edit flow so the day itself can be moved.

Same 1-week ceiling that applies to setting a further task in the first place. Pulling the date back into the next 24h must work too, since that is what un-further-ing a task means.

### [i21] Daily score chart ⬜

At 00:00 each day, record the day's score into a history array, then draw a line chart over those records.

**Undecided:** whether points are recorded alongside score, how a 00:00 snapshot fires at all given the page only runs while open (most likely: on load, backfill every midnight that has passed since the last record), how far back the chart shows, and whether it lives on the Falsedge page or behind a link.

### [i26] Export all app data ⚪

A full Falsedge state export — templates, ledger, points, scores, the lot — so data survives a device change or a breaking schema change without being retyped. D7 makes this load-bearing rather than a nicety: with no migration code ever, export → hand-edit → re-import is the *only* path through a schema change.

Aulists already has exactly this and is the model to copy: `exportJSON()` (`JSON.stringify(state, null, 2)`), an export-to-textarea button, an export-to-file button, `importFromText()` behind a confirm that replaces state wholesale, and a `lastExported` stamp with a "last exported" note. Falsedge gets the same set, running through its own `normalise()` on import for the same reason Aulists does.


## Aulists

### [i15] Strip down Aulists ⬜

- Lists become `["1", "2", "3", "4"]`. List 0 and list 2.5 are removed; the current chain is `["0", "1", "2", "2.5", "3", "4"]`, so dropping them leaves a sequence that is already in order.
- No migration code, ever (D7). Whatever sits in list 0 or list 2.5 at upgrade time simply stops being read or written by anything.
- `applyAutoReturn()` and all auto-move / auto-reprioritize between lists is removed entirely.
- List 2's randomizer stays, but pools from List 2 alone. It currently also draws from List 2.5, which no longer exists.
- The boundary mechanism `applyAutoReturn()` used to call — `pushBoundary`, `isBoundary`, `pendingBoundary`, the boundary-confirm UI — **stays**, even though nothing calls it any more, in case something needs it later.
- The pencil/edit icon leaves the main view. An "Edit" entry is added to the hamburger dropdown, calling the same `startEdit(li, item)` the pencil calls today.
- Every `buildPencil()` call site — main list rows, Completed-list rows, and any other row type it appears on — gets a copy button in that same visual slot instead, copying the item's text to the clipboard. It uses Falsedge's existing `COPY_ICON` SVG (the two-overlapping-rectangles glyph already used by the ledger and high-scores copy buttons) and toasts success/failure the way Falsedge's copy actions already do. `buildPencil()` gets renamed to `buildCopyBtn()` rather than left with a misleading name.
- `buildTrashBtn()` — defined but never called anywhere, dead code from an earlier abandoned refactor — gets deleted while this area is being touched.
- Swipe-between-lists navigation stays.


## Hex 2^

### [i24] Focused mode ⬜

A third mode alongside normal and jiggly, branching off normal. It keeps its own save data, but shares the high-score table the other modes already write to.

The hook: a swipe in a direction that can't merge anything has a consequence instead of being a silent no-op. On such a swipe the whole board shakes — a single explosion-like jolt, not jiggly's continuous wobble — flashes white and fades that flash out, and a life is lost.

**Undecided:** the life system. Three hearts to start is the working assumption. Regaining them is open: either one every N swipes, or hearts spawning on the board to be collected — which amount to nearly the same thing.


## Multi-page items

### [i100] (low priority/far future) - Server side ⬜⬜⬜

Storing data in server instead of locally. Would need to buy/rent server space or something... idk