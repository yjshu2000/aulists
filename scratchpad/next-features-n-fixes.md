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

### [i0] SET (set task section) modifications ⚪

`SET` stays fully functional. Do not disable any parts of it; it only gets some updates and changes.

#### [i0.1] Clear-draft button ▫️

`SET`'s bottom row becomes `[clear draft]` left-aligned and `[set task]` right-aligned, on the same row.

`[clear draft]` wipes all four draft fields at once — text, time, WL/HL, and the date from [i0.3] — with no confirmation step. It pushes onto the existing undo stack, so a mis-tap is one undo away.

There is no `[save template]` button. That idea only existed as a replacement for the `ACTIVATE` adder, and the adder is being kept.

#### [i0.2] Move SET to the bottom ▫️

`SET` moves to the very bottom of the page, below both `ACTIVATE` sections. The full render order becomes ledger → scores → active tasks → `ACTIVATE (dailies)` → `ACTIVATE (others)` → `SET`, replacing today's ledger → scores → tasks → `SET` → `ACTIVATE` → `LINK`.

#### [i0.3] Optional date field ⚪

`SET` gains the same optional date field `ACTIVATE (others)` has (up to 1 week out — see [i3]), as a separate independent control alongside the existing time dropdown + quick buttons. When no date is picked, behaviour is unchanged: the deadline resolves to the next occurrence of the chosen time within 24h. When a date is picked, the chosen time pairs with that date directly, with no next-occurrence resolution.

### [i1] Restructure Falsedge into two activate sections ⬜

Aulists-linking is removed entirely — no connection to `aulists.listdata` in any form. No `🔗`, no `linkedItemId`, no propagation. The `LINK` section goes, along with `buildLink()`, `readAulistsListZero()`, and the `.link-*` CSS. The two sections that replace the linkables concept:

**ACTIVATE (dailies)**
- Every template that exists today becomes a `dailies` row. They all already carry a time, since the current adder requires one, so they satisfy the dailies rules unchanged. `ACTIVATE (others)` starts empty and gets populated by hand.
- Rows stay pure disposable presets, exactly like today's templates. No `lastDone`, no cooldown, no persistent identity.
- Time is mandatory. `--:--` stays available in the dropdown, but the add button is gated (blocked) when time isn't set.
- Sorts purely by time, ascending from `00:00` — an absolute order that never shifts with the current time. (this is already what it currently does. unchanged)
- Never gets a date field, and never gets the 36h cancel cooldown.

**ACTIVATE (others)**
- Rows are persistent records with their own identity, not disposable presets. The word "template" no longer fits — a row effectively *is* the item now, not a preset that spawns disposable copies.
- Two things are tracked per row across its lifecycle: `lastDone`, and a cancel-cooldown timestamp (see [i3]).
- `lastDone` updates on completion, on-time or late — but not on cancel. It is independent of Aulists entirely.
- Sorts by `lastDone`, descending — most recently completed at the top. A row that has never been completed has no `lastDone` and pins above everything, so anything new or untouched is the first thing in this section.
- Time is optional to store, and `--:--` must remain available. Time is still required to activate (see [i2]).
- Carries an optional date, up to 1 week out (see [i3]).
- Its adder does not exist yet and has to be built — Phase 3 only ever built a dailies-shaped `ACTIVATE` adder.
- Its hamburger gains a `Clear datetime` entry, clearing the row's stored date and time together.
- An active task spawned from an `others` row stores that row's id in a `sourceRowId` field, taking over the slot `linkedItemId` vacates. `dailies`-spawned tasks carry no such field and are fully detached the moment they're created. `sourceRowId` is what makes the rest of this section work: it's how completion knows which row to stamp `lastDone` on, how cancelling knows which row to put on cooldown, and how a row with a live task already out refuses a second swipe-left (with a toast).
- Deleting an `others` row is never blocked, even while a task it spawned is still live. That task keeps running with a `sourceRowId` pointing at nothing: completing it stamps no `lastDone`, cancelling it sets no cooldown. Every `sourceRowId` lookup has to tolerate a missing row.

Both sections:
- WL/HL is optional to store, required to activate.
- Swipe left (right→left) directly creates the active task, bypassing `SET` (see [i2]).
- Swipe right (left→right) prefills `SET` with the row's text, time, and WL/HL — plus date, for `others` rows — without touching the row or creating an active task. This is what Phase 3's swipe-left used to do.
- There is no lap/skip mechanic anywhere: no swipe bumps a row's position, no hamburger `Skip` entry, no `lap` field.

### [i2] Full-template instant activation ⚪

Swiping left on an `ACTIVATE` row, in either section, bypasses `SET` entirely and directly creates a new active task.

Required in both sections: text, WL/HL, and time. Date is the only optional field, and only exists on `others` rows. If any required field is missing, the swipe refuses with the same toast `SET` showed on refusal — a dateless `ACTIVATE (others)` row still needs a time before swipe-left will do anything.

For a row with no date, the time resolves the same way `SET`'s does: the next occurrence of that time within the next 24h. For an `others` row with a date, the time pairs with that date directly.

### [i3] Further task deadlines (up to 1 week) ⬜

A "further task" is an `ACTIVATE (others)` row with its date set. Once activated, it becomes an active task whose deadline is that specific date + time.

- Optional date field, using the native calendar date picker. It lives on `ACTIVATE (others)` rows and on the `others` adder, and on `SET` ([i0]). `ACTIVATE (dailies)` rows and their adder never get one.
- Max range is 1 week out (7×24h). Can't go further. Enforced twice: `min`/`max` attributes on the input so the native picker greys out anything past 7 days, plus a submit-time check that refuses with a toast.
- The date clears after a task is set from it (swipe-left).
- A task counts as **further** when its deadline is more than 24 hours away. This is a rolling window, not a calendar-day boundary: at 17:00 today, a deadline of 09:00 tomorrow is only 16h out and is therefore not further, despite falling on a different day.
- The display treatment happens in the **active tasks stack**, separating near-term active tasks from far-off ones — not in the `ACTIVATE (others)` row list. Further tasks are dimmer (less glow, greyer text) and show the day abbreviation beside the time (TU, WE, …). A horizontal divider line separates further tasks from the rest, with no line when no further tasks exist.
- Further tasks can be completed early, with no extra reward for doing so — they're intended to be done whenever.
- Anti-abuse: cancelling an active task that was activated **with a date set** blocks re-setting that row for 36 hours. A dateless `ACTIVATE (others)` row that gets cancelled can be re-set immediately. This never applies to `ACTIVATE (dailies)`.
- A row on cooldown dims and shows its remaining time inline, so the block is visible without having to swipe at it. The row stays fully interactive otherwise — editing its text and fields still works; only activation is blocked.

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

### [i9] Add "by" label beside time dropdown ▫️

Both the `ACTIVATE` row's own time control and the adder's time control get a "by" label to their left, so each reads "by [time]" instead of showing a bare time. Same placement style as `SET`'s existing "by" label. Both already route through the shared `buildDayTimeSelect()`, so one change covers both.

### [i11] Edit templates styling bug 🐞 ▫️

The template rows have basically no gap between the text and the controls row beneath it. It's most visible when editing (because the borders appear and make the collision obvious), but it applies to both the regular rows and the inline edit UI. Just needs slightly more spacing between the two rows.

### [i12] Swipe-right on templates stops moving rows down ▫️

Swipe right (left-to-right) on template rows currently moves them down. That behaviour is removed — swipe right now prefills `SET` instead (see [i1]). Nothing bumps a row's position any more.

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
