# Falsedge Phase 3 — Q&A

Working record of every question asked and answered while spec'ing Phase 3. This is NOT the deliverable. The deliverable is `falsedge-phase3.md`, which contains finalized decisions only — no questions, no rejected options, no discussion history.

## Setup decisions

**S1. Where does the Phase 3 doc go?** → New file `scratchpad/falsedge-phase3.md`. `falsedge-plan.md` keeps a one-line pointer to it.

**S2. How are the open TBDs handled?** → Ask everything first, write nothing until answered.

**S3. Doc rule.** The deliverable is finalized decisions only. It gets handed to an instance of Claude with zero memory of this conversation. No questions, no open TBDs, no "instead of X do Y", no "make sure this isn't Z", no rationale drawn from discussion, no narration of how a decision was reached. Just the spec, stated as fact.

**S4. Phase 2 vs Phase 3.** List-0 linking and Falsedge recurring templates move out of Phase 2 into Phase 3. Phase 2 is complete in code (`falsedge.html`, `falsedge.js`, `style-falsedge.css` exist; colourcaln deleted; `style-colourful.css` trimmed to palette + `.card`/`.btn`/`.overlay`/`.sheet`). Neither of those two features was ever implemented — `readAulistsListZero()` is a stub and `freshState()` is just `{version, ledger: []}`.

**S5. Ask style.** Over-ask, never under-ask. One question at a time. Enumerate every possible interpretation, never assume anything is obvious.

## Q1 — How many active tasks can exist at once?

**Exactly one.**

- SET is locked while a task is active.
- **Cancel** unlocks SET. Distinct from undo: undo = "I mis-set this, erase it"; cancel = "I meant it, I changed my mind" and produces a ledger entry.
- Cancelled entries read `completed by: none (cancelled)`.

## Q2 — What triggers the `failed` state, and what happens?

**Nothing triggers it automatically.**

- No timer, no auto-fail, no dismiss button. A task sits active indefinitely until acted on.
- Exits: `complete now`, `completed before: [time]`, `cancel`.
- `complete now` after the final leniency tier awards 0 pts and logs as `none (failed)`.

## Q3 — What is an ACTIVATE template?

**A pure preset — `text` + required `time` (time-of-day only) + optional default WL/HL.**

- Always listed, never expires, no dates, no recurrence rules.
- Every template must have a time. The adder refuses to create one without it, and the row's time control has no empty state.
- The row always displays the real time, e.g. `by 19:00`.
- **Sort order is still being worked out.** The current direction is a sort key of `time - 1h`, ascending from now with midnight wraparound, so a template surfaces about an hour before its time and sits at the top whenever nothing else is closer. Not final.

## Q4 — How do templates get created, edited, and deleted?

- Rows are two-line: text on its own line, controls on a row beneath it.

```
check in after getting home
[19:00 ▾]  [WL] [HL]  [☰]
```

- **Swipe left** (right→left) on a template row prefills SET. No `[^]` button.
- **Hamgur** at the end of the control row; menu is `Activate` / `Edit` / `Delete`. No pencil icon. Activate does the same thing as swipe left (for desktop testing compatibility).
- **Time** edited by tapping the inline dropdown on the row.
- **Adder** at the bottom of the ACTIVATE box, Aulists-style.

### Q4.0 — Which fields does the prefill carry into SET?

**Text, time, and WL/HL — but WL/HL only when the template has one set.**

- A template with `WL` set arrives in SET with `WL` lit.
- A template with neither set leaves SET's existing WL/HL selection alone rather than clearing it.

### Q4.1 — What's the exact row format, what does the adder create, and where does the WL/HL default live?

Two lines: text on its own line, then a control row of `[time dropdown] [WL] [HL] [hambugu]`.

The adder mirrors the full row shape: text field, then time dropdown + WL/HL toggles.

### Q4.2 — How does the row's WL/HL control work?

**Two toggles, `[WL] [HL]`, matching the SET box.**

- Mutually exclusive. Tapping the selected one deselects it back to unset.
- Unset is represented by neither being lit. There is no third button for it.

### Q4.3 — How tall are the ACTIVATE and LINK sections?

**Max-height `40vh` each, scrolling internally past that.**

- `40vh` is a maximum, not a fixed height. A section with three rows renders three rows tall.
- A section only scrolls within itself once its content would exceed 40% of the viewport.
- Neither section can grow unbounded, so vertical space is never contested and controls can take a full row.

## Q5 — Where do high scores come from?

**A `highScores` array in state, fed by a manual reset button.**

- `[streak broke]` lives in the active task area, rendered only when no task is active:

```
(no active tasks)
[streak broke]
```

- Tapping it pushes `scr` into `highScores` and zeroes `scr`.
- `pts` is untouched — score resets, points never reset.

### Q5.1 — What exactly happens when you tap `[streak broke]`?

**Immediate and silent.**

- `highScores` gets `{score, date}`.
- No confirm sheet, no ledger entry. Undo covers misfires.

### Q5.2 — What are the exact top-10 semantics for `highScores`?

**Sorted descending, hard cap at 10.**

- On `[streak broke]`, insert `{score, date}` in sorted position and trim to 10.
- A score that doesn't beat the current 10th is discarded entirely — never stored.
- Ties: the new entry sits *above* the existing equal one.

## Q6 — Does Falsedge get a visible undo/redo pill?

**Yes — a full copy of Aulists' pill, restyled.**

- Pill markup into `falsedge.html`, including the two-tap boundary-confirm mechanism (`pushBoundary` / `pendingBoundary` already exist in `falsedge.js`).
- Same shape, layout and geometry.
- Restyled in `style-falsedge.css` off the `style-colourful.css` palette — colourful, glowy.

## Q7 — What does `[Link]` actually do to the Aulists item?

**Stores a link, and both text edits and completion propagate.**

- `linkedItemId` stored on the Falsedge task.
- Text edits on a linked active task write into `itemsById[linkedItemId].text` in the Aulists blob.
- Completion propagates too.

### Q7.1 — What exactly does Falsedge write when a linked task completes?

**One read-mutate-write on `aulists.listdata`, mirroring Aulists' own completion.**

- `itemsById[id].isDone = true`
- `itemsById[id].lastDone = <effective completion time>.toISOString()` — a backdated `completed before:` tier writes that tier's clock time, not now
- splice `id` out of `lists["0"]`

### Q7.2 — What if the linked Aulists item has drifted?

**Skip whatever no longer applies; never block.**

- **Item exists** → set `isDone` and `lastDone`. Splice from `lists["0"]` only if actually present; if it moved elsewhere, skip the splice and leave every list array alone.
- **Item gone** → skip the Aulists write entirely.
- Either way the Falsedge task resolves and the ledger entry is written normally.

### Q7.3 — Which task exits write back to Aulists?

Both completion paths, including the 0-pt failed one. `cancel` writes nothing.

## Q8 — How far does the SET dropdown run, and can a deadline cross midnight?

**24 hours forward, in 10-minute steps, wrapping past midnight. Bare `HH:MM` labels, no date marker.**

- First option is `ceil10(now + 20min)` — always 20 to 29 minutes out.
- A deadline must be at least 20 minutes from now, so the dropdown never offers one the submit check would reject.

## Q9 — What's in a ledger entry?

**Task text, a deadline line carrying the full date and leniency mode, a time-only completion line, and running totals.**

```
do task
by 2026-08-02 16:00 (WL)
completed by: 16:08
pts = 42 + 3 = 45
scr = 127 + 3 = 130
```

```
vacuum
by 2026-08-02 19:00 (HL)
completed by: none (cancelled)
pts = 45 + 0 = 45
scr = 130 + 0 = 130
```

### Q9.1 — What does `completed by:` show when the completion crosses midnight?

Always bare `HH:MM`. The deadline line carries the date.

## Q10 — What's the markdown export format?

Verbatim mirror of the on-screen entry, each entry in its own fenced code block. Nothing wraps the whole batch.

### Q10.1 — How do you get the export text out of the app?

```
Export data at 2000 char limits:
[Copy from oldest]    [Delete exported]
```

`Copy from oldest` fills forward from the oldest entry, adding whole entries until the next would exceed 2000 chars.

### Q10.1.1 — Does the copy button advance on repeated taps?

No — it's stateless. `[Delete exported]` is what removes the copied batch so the next tap surfaces the next one.

### Q10.1.2 — What exactly does `[Delete exported]` delete?

The oldest batch — exactly the set `Copy from oldest` produces. Availability gated to 10 minutes after a copy tap.

### Q10.1.2.1 — How does the 10-minute gate behave?

**Always visible, greyed out when unavailable, gate persisted.**

- Tapping it while greyed shows a toast: `Delete available after exporting`.
- Copy timestamp persisted in Falsedge state. Plain wall-clock 10 minutes, surviving reload and app close.
- Falsedge therefore needs the `.toast` element and `toast()` helper copied from Aulists.

## Q11 — Does Falsedge get a debug clock override?

No. `getNow()` just returns `new Date()`.

## Q12 — Does the page update itself as time passes?

**No timers of any kind.**

- Re-render on `visibilitychange` when not hidden.
- `Refresh` button in the Falsedge header calling `location.reload()`, same as Aulists.
- Point calculations read `getNow()` at tap time, so a stale screen can never award wrong points.

### Q12.1 — What happens on a stale tap?

**Everything computes from `getNow()` at tap time; the rendered DOM is never trusted.**

- `[Delete exported]` past its 10 minutes → toast, nothing deleted.
- `[complete now]` after any tier boundary passed since render → proceeds silently with the correct present value, including the 0-pt `none (failed)` case. The tier rows are deadline statements (`by 17:00 for 1 pts`), not a claim about the current award, so nothing on screen was ever contradicted.
- `completed before:` with newly-passed tiers missing from the button row → nothing special. Buttons can only ever be missing, never wrong. Refresh to see more.
- `SET` with a now-past deadline → validation refuses on submit, toast, re-render with a corrected dropdown.
- A template's prefill time can never be stale. It is a bare time-of-day with no date, and the SET dropdown spans a full 24 hours, so every time-of-day is always selectable.

## Q13 — Which regions collapse, and does collapse state persist?

**The Ledger, and Data export nested inside it. Nothing else.**

- The Ledger's toggle sits at the *bottom* of its region. Collapsed by default.
- Data export sits inside the ledger region with its own toggle, collapsed by default, only reachable once the ledger is expanded.
- Active task, SET, ACTIVATE and LINK are always fully rendered. No toggles, no persisted collapse state.
- Scores is not a collapsible region at all — see Q13.1.

### Q13.1 — How is the scores view presented, and what's in it?

**A floating panel, holding high scores only.**

- `Current pts: x` / `Current scr: x` sits in its own rounded box, a slightly different colour from the page background.
- The whole box is one tap target, with a `>` glyph at middle-right.
- Tapping opens a panel to the right that floats on top of the page, darker than the background.
- Dismissed by tapping anywhere outside it.
- Contents are the top-10 high scores and nothing else — no current run, no derived stats.
- Copy icon top-right copies the displayed list verbatim, as a numbered list, in plain text.

## Q14 — What persists in the SET box, and when?

**All three fields — text, deadline, WL/HL.**

- `state.setDraft` holds `{text, time, mode}`, written on every change, restored on render.
- On restore, if the saved deadline is now in the past it silently falls back to the dropdown's first available option; text and WL/HL survive intact.
- Cleared on successful SET.

## Q15 — What is the SET box's submit control?

**A `[set task]` button on its own line at the bottom of the SET box.**

- Regular button size, not full width.
- Right-aligned.

## Q16 — What blocks a task from being set?

**Both missing-field cases are hard blocks, each with its own toast.**

- Empty text → `Task needs text`.
- Neither WL nor HL selected → `Pick WL or HL`.
- Deadline less than 20 minutes from now → rejected. The dropdown never offers one, so this only fires on a stale page.
- Nothing is set in either case. No silent defaulting.
- A now-past deadline is handled separately, see Q12.1.

## Q17 — What is the Falsedge header layout?

A flex row, same shape as Aulists' header: `Falsedge` title left, `Refresh` button right.

## Q18 — How does `Go to Lists` move to the bottom?

**In-flow, centred, styled as a plain `.btn`.**

- Last element in `<body>`, scrolls with the page. No `position: fixed`.
- Reuses `.btn` from `style-colourful.css` rather than the pill shape.
- The old `.page-nav-top` rule comes out of `style-falsedge.css`. Aulists' own top pill is styled in `style-minim.css` and is unaffected.

## Q19 — Does `sw.js` need anything for Phase 3?

**No. `sw.js` is network-first, so `CACHE` never gates content updates.**

- The fetch handler tries the network, caches the fresh response on the way through, and falls back to the cache only when the network fails. Every successful load overwrites the stored copy.
- `CACHE` only names the bucket that `install` precaches `SHELL` into and that `activate` keeps while deleting all others.
- `falsedge.html`, `falsedge.js` and `style-falsedge.css` are already in `SHELL`. Phase 3 adds no files.
- `CACHE` was bumped `aulists-v3` → `aulists-v4` once, to drop orphaned `colourcaln.*` responses left in the old bucket. No routine bumping after that.

## Q20 — How does a ledger entry store its numbers?

**It doesn't. An entry is one pre-rendered string.**

- The whole entry, including the `pts = 42 + 3 = 45` and `scr = 127 + 3 = 130` lines, is built once at the moment the task resolves and stored as text.
- Rendering prints it. Exporting wraps it in a fence and concatenates.
- Nothing about a past entry is ever recomputed or reformatted. A later change to the display format leaves existing entries exactly as they were written.

## Q21 — What carries a `uid()`?

**Templates and the active task. Nothing else.**

- Templates are displayed sorted by time-of-day from now, wrapping midnight, so a row's visual position is not its array index. Look templates up with `templates.find(t => t.id === id)`. Never index into the array to mutate one.
- The active task gets an id so that allowing several simultaneous active tasks later needs no migration.
- Ledger entries stay bare strings in an array, addressed by position. Append at one end, delete in batches from the other.

### Handler rule

Event handlers must resolve state inside the callback, never capture it when building the element.

```js
// wrong
var task = state.activeTask;
btn.addEventListener("click", function () { completeTask(task); });

// right
btn.addEventListener("click", function () {
  var task = state.activeTask;
  if (!task) return;
  completeTask(task);
});
```

Same for templates: capture the `id` string, then `templates.find(...)` inside the callback.

Undo does `state = JSON.parse(JSON.stringify(snapshot))`, replacing every object in the tree. Anything captured before that points at an object no longer reachable from `state`, and `save()` only serialises `state`, so writes to it vanish silently with no error.

## Q22 — What is the Falsedge state schema, and how does `load()` handle a bad blob?

```js
{
  version: 1,
  pts: 0,
  scr: 0,
  highScores: [],              // [{score, date}], top 10, sorted desc
  ledger: [],                  // bare strings, oldest first
  activeTask: null,            // {id, text, deadline, mode, linkedItemId}
  templates: [],               // [{id, text, time, mode}]
  setDraft: {text: "", time: null, mode: null},
  lastCopyAt: null,            // ISO string, gates [Delete exported]
  ledgerCollapsed: true
}
```

**`load()` runs a field-by-field `normalise()` behind a single outer try/catch.**

- `normalise()` starts from `freshState()` and copies each field across only if it is the right type, so malformed or partial data degrades per field instead of wiping everything.
- No per-field try/catch. Falsedge's fields are flat values and arrays with no logic capable of throwing.
- No corrupt-blob backup key.

## Q23 — What does the ledger look like collapsed?

**The newest entry stays visible, above a toggle carrying the entry count.**

- The single newest entry renders in full above the toggle. Everything older is hidden.
- The toggle shows the total number of entries, e.g. `ledger (48)`.
- Expanding grows the region upward, revealing history above the newest entry.

## Q24 — Does the expanded ledger scroll inside itself, or push the page?

**Max-height `66vh`, scrolling internally past that.**

- `66vh` is a maximum, not a fixed height. A short ledger renders only as tall as its entries.
- The region never exceeds two thirds of the viewport, however many entries exist.
- History scrolls within the region. The rest of the page does not move.

## Q25 — Is `scr` an integer or a decimal?

**Fractional, displayed to one decimal place. `pts` is a whole-number counter.**

- `pts` ticks up by one for each whole number `scr` crosses. It is tracked incrementally, never derived as `floor(scr)`.
- `[streak broke]` zeroes `scr` and discards whatever fraction it held. `pts` is untouched, and a reset never decrements it on the way down.
- Nothing currently awards a fraction — every tier is 6/3/2/1 — so today the two move in lockstep. The rule only matters once fractional awards exist.
- On a step where `scr` moves but crosses no boundary, the ledger shows the `pts` line as a bare value with no arithmetic:

```
do task
by 2026-08-03 16:00 (WL)
completed by: 16:08
pts = 20
scr = 10.1 + 0.8 = 10.9
```

## Q26 — Where is the cancel control?

Top-right corner of the active task area, above the task text.

## Q27 — How do you edit an active task's text?

**Tap the text, then confirm through an `edit?` overlay.**

- Tapping the task text shows an `edit?` overlay on top of it.
- Tapping `edit?` turns the text into an inline input in the active task block.
- Tapping anywhere else dismisses the overlay without entering edit mode.

## Q28 — Is a linked task marked as linked?

A small chain-link emoji [🔗] beside the task text, rendered only when `linkedItemId` is set. No unlink control.

## Q29 — What do the five SET time buttons compute?

**Buttons 1-4 are `now +30 / +40 / +50 / +60` minutes, each rounded up to the next 10-minute mark. Button 5 is the smallest whole hour strictly greater than button 4.**

- Defining button 5 off button 4 rather than off `now` means it can never duplicate button 4.
- Buttons 1-4 are always 10 minutes apart and rounding preserves that, so they can never collide with each other either.

| now | +30 | +40 | +50 | +1h | next hour |
|---|---|---|---|---|---|
| 16:00 | 16:30 | 16:40 | 16:50 | 17:00 | 18:00 |
| 16:23 | 17:00 | 17:10 | 17:20 | 17:30 | 18:00 |
| 16:50 | 17:20 | 17:30 | 17:40 | 17:50 | 18:00 |
| 16:55 | 17:30 | 17:40 | 17:50 | 18:00 | 19:00 |
