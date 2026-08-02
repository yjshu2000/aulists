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

**A pure preset — `text` + optional `time` (time-of-day only) + optional default WL/HL.**

- Always listed, never expires, no dates, no recurrence rules.
- Sorted by time-of-day ascending from now, wrapping past midnight.

## Q4 — How do templates get created, edited, and deleted?

- **Swipe left** (right→left) on a template row prefills SET. No `[^]` button.
- **Hamburger** on the right; menu is `Edit` / `Delete`. No pencil icon.
- **Time** edited by tapping the inline dropdown on the row.
- **Adder** at the bottom of the ACTIVATE box, Aulists-style.

### Q4.1 — What's the exact row format, what does the adder create, and where does the WL/HL default live?

**OPEN — PARKED.** Row sketch is `[text] [time dropdown] [hambugu]` with no room for a WL/HL control. Nothing about the ACTIVATE box gets written to the deliverable until this closes.

## Q5 — Where do high scores come from, and what's in the expanded scores view?

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

24 hours forward, starting at the next-next 10-min mark, wrapping past midnight. Bare `HH:MM` labels, no date marker.

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

**Only the Ledger collapses.**

- Its toggle sits at the *bottom* of its region, collapsed by default, Data export nested inside it.
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

**OPEN.** The sketch has a text field, five time-template buttons, a dropdown, and the WL/HL pair, and nothing to press.

## Still unasked

- `sw.js` `SHELL` array + cache version bump.
- `about.html` changelog entry.
- SET validation rules — empty text, neither WL nor HL selected.
- Falsedge state schema, consolidated.
- Falsedge header layout (title + Refresh button placement).
