# Next features & fixes

## Doc rules

**D1. This is the living backlog.** It is the single place pending work is tracked. It gets edited in place as things change — not appended to, not superseded by a newer doc. No Q&A format, no discussion history, no rejected options.

**D2. Shipped items get deleted, not ticked off.** When something lands in the code, its entry is removed from this doc entirely. There is no "done" section. The changelog in `about.html` is the record of what shipped; this doc is only what hasn't.
*This also applies to rejected options.*

**D3. Three supersections, one per app page.** Falsedge, Aulists, Hex 2^. Each item is a `###` heading under its page's `##`. An item that spans two pages will go in the "multi-page items" section.

**D4. Items are written as decisions, not questions.** If something is genuinely undecided, it says so explicitly in the item rather than being left vague. Exploratory ideas are marked exploratory.

**D5. Source lineage.** Distilled from `scratchpad/sad-todos-babble.md` and `scratchpad/falsedge-phase4-qna.md`. Both were fully folded in on 2026-08-09 and are obsolete from here on. `scratchpad/falsedge-phase3.md` is not a source — it describes the live Phase 3 baseline every item here builds on.

**D6. The bracketed `iN` labels are IDs and nothing else.** Not priority, not chronological, not an ordering — nothing carries any of that, much less the ID. An ID is assigned once and never changes: items keep theirs when reordered or moved between sections, and a deleted item's ID is retired rather than reused. Gaps in the sequence are normal and expected. Sub-items are `iN.1`, `iN.2`, … numbered from `.1`, as `####` headings under their parent, and follow the same rules.

**D7. No backward compatibility for old data, ever.** No migration code, no accounting for old data shapes, in this phase or any future one. If data has to survive a breaking change, it gets exported, updated, and re-imported by hand.

**D8. Every item's heading ends with a tag.** ⬜ big task, ⚪ medium task, ▫️ minor or trivial to implement. 🐞 marks a bug fix rather than new work, and sits alongside a size tag rather than replacing it. Sub-items are tagged on their own merits, independently of their parent.

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


The square carries no CSS border. Its outline is an SVG rounded rect drawn twice: a flat grey base ring, and a glowing ring over it carrying `pathLength="100"` with a `stroke-dasharray` driven by cooldown progress, so the outline traces itself clockwise from the top-left corner as the 30h elapses. The glowing stroke takes the wrapper's `--glow`, which is `var(--c-green)`. A closed loop means ready, a partial arc means still cooling, and there is no interior fill at any point.

Tapping the square enters pick mode: every active task block gets a full-block overlay reading `select` — the existing `.edit-overlay` treatment reparented to `.task-block`, which is already `position: relative` and so needs no other change. Tapping a block promotes it. Tapping the square again, or anywhere that isn't a task block, leaves pick mode without promoting anything.

Promotion is irreversible. Undo is the only way back, and otherwise the only exit is cancelling the task outright — the mechanic is a gamble on commitment, so there is no un-promote.

**Limits.** One promotion per 30 hours — a rolling cooldown measured from the last promotion. That's the only limiter. Cancelling a DOLI task does not hand the promotion back: the 30h runs from the promotion regardless of what becomes of the task.

The square is inert until its ring closes, so at rest it sits permanently fully lit — a closed ring is the normal state, not a special one.

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

### [i13] Swap homepage to Falsedge ⚪

Done as a file rename. The current `index.html` (Aulists) becomes `aulists.html`, and `falsedge.html` becomes `index.html`. Cross-links, `manifest.json`'s `start_url`, and `sw.js`'s `SHELL` list all get updated to match the new filenames.

`manifest.json`'s `name` and `short_name` stay `"Aulists"` — it remains the overall umbrella app name, unchanged by which page is the entry point.

### [i14] Complex tasks ⬜

#### [i14.1] Multipliers and bonuses (exploratory) ⬜

Vague idea — support for multipliers on tasks (conditional?) and +1 bonuses attached to a task. Not fleshed out.

#### [i14.2] Event-anchored deadlines ⬜

Needed ASAP. A task can be set whose deadline isn't known at set time, because it hangs off an event that hasn't happened yet — "within 1h of check phone after wake", "within 1h of getting home (chimer resumes)". The event's real time is entered manually later, and the deadline is computed from it: enter `19:37` and the deadline resolves to `20:40`.

**Undecided:** nearly all of it. The `19:37` → `20:40` example is +1h and then rounded up to the next 10-minute mark, which matches the app's existing 10-minute offset granularity, but that rounding rule was never stated outright. Also open: where the anchor phrase is authored, what the task displays before its event time is entered, whether the offset is fixed at 1h or configurable per task, whether scoring runs from the resolved deadline exactly as a normal task's does, and what happens if the event time is never entered at all.


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

(nothing pending)


## Multi-page items

(nothing pending)
