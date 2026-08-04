# Falsedge Phase 3 — Q&A

Working record of every question asked and answered while spec'ing Phase 3. This is NOT the deliverable. The deliverable is `falsedge-phase3.md`, which contains finalized decisions only — no questions, no rejected options, no discussion history.

## Setup decisions

**S1. Where does the Phase 3 doc go?** → New file `scratchpad/falsedge-phase3.md`. `falsedge-plan.md` keeps a one-line pointer to it.

**S2. How are the open TBDs handled?** → Ask everything first, write nothing until answered.

**S3. Doc rule.** The deliverable is finalized decisions only. It gets handed to an instance of Claude with zero memory of this conversation. No questions, no open TBDs, no "instead of X do Y", no "make sure this isn't Z", no rationale drawn from discussion, no narration of how a decision was reached. Just the spec, stated as fact.

**S4. Phase 2 vs Phase 3.** List-0 linking and Falsedge recurring templates move out of Phase 2 into Phase 3. Phase 2 is complete in code (`falsedge.html`, `falsedge.js`, `style-falsedge.css` exist; colourcaln deleted; `style-colourful.css` trimmed to palette + `.card`/`.btn`/`.overlay`/`.sheet`). Neither of those two features was ever implemented — `readAulistsListZero()` is a stub and `freshState()` is just `{version, ledger: []}`.

**S5. Ask style.** Over-ask, never under-ask. One question at a time. Enumerate every possible interpretation, never assume anything is obvious.

**S6. Naming.** ACTIVATE is the section label — the verb. The things in it are **templates**. LINK is the section label. The things in it are **linkables**.

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

## Q3 — What is a template?

**A pure preset — `text` + required `time` (time-of-day only) + optional default WL/HL.**

- Always listed, never expires, no dates, no recurrence rules.
- Every template must have a time. The adder refuses to create one without it, and the row's time control has no empty state.
- The row always displays the real time, e.g. `by 19:00`.

### Q3.1 — How are templates ordered?

**Manually, by lap counter. The list never moves on its own.**

- Base order is plain ascending clock time, `00:00` at the top through `23:59` at the bottom. It does not reference `now`.
- Each template carries a `lap` counter. Sort by `(lap, time)` — everything on lap 0 sits above everything on lap 1.
- **Swipe right** (left→right) on the **first row only** increments that template's `lap`, sending it to the bottom. Rows below the first are not swipe-right-able. The hamburger's `Skip` does the same thing and is available on every row.
- Because `Skip` works anywhere, laps can drift more than one apart and the order stops being a strict rotation. That is fine — the daily reset is what restores plain ascending order.
- Wrap-around is free: whenever every template shares a lap, ties fall back to time and the order is plain ascending again.
- A newly added template gets `lap: 0`, so it slots into the un-bumped group by its time with no special handling.
- Ties on `(lap, time)` fall to creation order. New templates are pushed onto the end of `templates`, and `Array.prototype.sort` is stable, so equal elements keep their array order with no third comparison term.
- All laps reset to `0` when the day changes. State stores a `rotationDate` day key; on render, if it isn't today, reset every `lap` and update the key. Evaluated on render rather than at midnight, since there are no timers.
- This is visual only. It is not a boundary and does not interact with undo.

## Q4 — How do templates get created, edited, and deleted?

- Rows are two-line: text on its own line, controls on a row beneath it.

```
check in after getting home
[19:00 ▾]  [WL] [HL]  [☰]
```

- **Swipe left** (right→left) on any template row prefills SET. Every row, unlike swipe-right. No `[^]` button.
- **Hamgur** at the end of the control row; menu is `Activate` / `Skip` / `Edit` / `Delete`. No pencil icon. `Activate` does the same thing as swipe left, `Skip` the same thing as swipe right (both for desktop testing compatibility).
- `Skip` is enabled on **every** row, not just the first. On a row that is already last it bumps the lap but produces no visible movement.
- **Time** edited by tapping the inline dropdown on the row. A native `<select>` listing the full day, `00:00` through `23:50` in 10-minute steps — 144 options, identical every time, unrelated to `now`. The current value scrolls into view, so earlier times sit above it and later ones below. Not circular; a circular picker wheel is a later enhancement, not part of this phase.
- **Adder** at the bottom of the ACTIVATE box, Aulists-style.

### Q4.1 — Which fields does the prefill carry into SET?

**Text, time, and WL/HL — but WL/HL only when the template has one set.**

- A template with `WL` set arrives in SET with `WL` lit.
- A template with neither set leaves SET's existing WL/HL selection alone rather than clearing it.

### Q4.2 — What's the exact row format, and what does the adder create?

Two lines: text on its own line, then a control row of `[time dropdown] [WL] [HL] [hambugu]`.

The adder mirrors the full row shape: text field, then time dropdown + WL/HL toggles.

After adding, every field clears — text empties, the dropdown returns to its default, both WL/HL toggles go unset.

### Q4.3 — How does the row's WL/HL control work?

**Two toggles, `[WL] [HL]`, matching the SET box.**

- Mutually exclusive. Tapping the selected one deselects it back to unset.
- Unset is represented by neither being lit. There is no third button for it.

### Q4.4 — How tall are the ACTIVATE and LINK sections?

**Max-height `40vh` on each section's row list, scrolling internally past that.**

- `40vh` is a maximum, not a fixed height. A section with three rows renders three rows tall.
- A row list only scrolls within itself once its content would exceed 40% of the viewport.
- ACTIVATE's adder is pinned below its scroll region, not inside it, so it stays reachable however many templates exist. The cap applies to the template rows only.
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
- With `scr` already at 0 it refuses: nothing is pushed, and it toasts `nothing to break`.

### Q5.2 — What are the exact top-10 semantics for `highScores`?

**Sorted descending, hard cap at 10.**

- On `[streak broke]`, insert `{score, date}` in sorted position and trim to 10.
- A score that doesn't beat the current 10th is discarded entirely — never stored.
- Ties: the new entry sits *above* the existing equal one.

## Q6 — Does Falsedge get a visible undo/redo pill?

**Yes — a copy of Aulists' pill, restyled, without the boundary mechanism.**

- Pill markup into `falsedge.html`. Same shape, layout and geometry.
- Restyled in `style-falsedge.css` off the `style-colourful.css` palette — colourful, glowy.
- No boundaries. `pushBoundary`, `isBoundary`, `pendingBoundary` and the confirm UI are all removed from `falsedge.js`. See Q31.

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

### Q7.4 — Where does a pending link live between `[Link]` and `set task`?

**In the draft, and it survives text edits.**

- Tapping `[Link]` prefills SET's text field and stores the item's id as `setDraft.linkedItemId`. Persisted with the rest of the draft.
- Editing the text does not break the link. Retyping `vacuum` as `do laundry` still points at the same Aulists item, which gets renamed to match.
- Nothing is written to `aulists.listdata` while drafting. The rename lands at `set task`, and Q7's live propagation takes over from there.
- `linkedItemId` moves onto the task at `set task` and is cleared with the draft.

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

The SET text field and the template adder both carry `maxlength="1000"`. A single entry therefore tops out around 1100 characters including its fence, so it can never exceed the batch limit on its own and the batching rule needs no floor case.

### Q10.1.1 — Does the copy button advance on repeated taps?

No — it's stateless. `[Delete exported]` is what removes the copied batch so the next tap surfaces the next one.

### Q10.1.2 — What exactly does `[Delete exported]` delete?

The oldest batch — exactly the set `Copy from oldest` produces. Availability gated to 10 minutes after a copy tap.

### Q10.1.2.1 — How does the 10-minute gate behave?

**Always visible, greyed out when unavailable, gate persisted.**

- Tapping it while greyed shows a toast: `Delete available after exporting`.
- Copy timestamp persisted in Falsedge state. Plain wall-clock 10 minutes, surviving reload and app close.
- Falsedge therefore needs the `.toast` element and `toast()` helper copied from Aulists, with its own CSS in `style-falsedge.css` — Aulists styles `.toast` in `style-minim.css`.
- Deleting clears `lastCopyAt`, so the button greys again immediately. The rhythm is copy, delete, copy, delete.

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
- A template prefill whose time is less than 20 minutes away → text and WL/HL prefill as normal, and the dropdown lands on its first available option instead.

## Q13 — Which regions collapse, and does collapse state persist?

**Only the Ledger.**

- The Ledger's toggle sits at the *bottom* of its region. Collapsed by default.
- Data export sits below the scrolling entries and above the toggle, pinned. It does not scroll with history, has no toggle of its own, and is always reachable once the ledger is expanded.
- Active task, SET, ACTIVATE and LINK are always fully rendered. No toggles, no persisted collapse state.
- Scores is not a collapsible region at all — see Q13.1.

### Q13.1 — How is the scores view presented, and what's in it?

**A floating panel, holding high scores only.**

- `Current pts: x` / `Current scr: x` sits in its own rounded box, a slightly different colour from the page background.
- The box is sized to its contents and left-aligned, not stretched across the content column. The empty space to its right is where the panel opens.
- The whole box is one tap target, with a `>` glyph at middle-right.
- Tapping opens a panel that floats on top of the page — out of document flow, `position: fixed`, high `z-index`. Nothing reflows and the scores box does not shrink.
- The panel is right-aligned, sized to its contents, top-aligned with the scores box, and semi-transparent over a darker fill. Where it is wider than the gap beside the box, it simply covers the box's right side.
- A dimming scrim sits behind it, reusing `.overlay`'s `rgba(8,9,13,.6)` + `blur(3px)` from `style-colourful.css`. That rule is laid out for bottom sheets, so the panel needs its own positioning rather than inheriting it.
- Dismissed by tapping anywhere outside it.
- Contents are the top-10 high scores and nothing else — no current run, no derived stats.
- Copy icon top-right copies the displayed list verbatim, as a numbered list, in plain text.

## Q14 — What persists in the SET box, and when?

**All three fields — text, deadline, WL/HL — plus any pending link.**

- `state.setDraft` holds `{text, time, mode, linkedItemId}`, restored on render.
- Text saves on `blur` and `visibilitychange`. Dropdown, WL/HL and `linkedItemId` save on change.
- On restore, if the saved deadline is no longer selectable — past, or now under 20 minutes away — it silently falls back to the dropdown's first available option. Text and WL/HL survive intact.
- Cleared on successful SET.

## Q15 — What is the SET box's submit control?

**A `[set task]` button on its own line at the bottom of the SET box.**

- Regular button size, not full width.
- Right-aligned.

## Q16 — What blocks a task from being set?

**Each failure is a hard block with its own toast.**

- Empty text → `Task needs text`.
- Neither WL nor HL selected → `Pick WL or HL`.
- Deadline less than 20 minutes from now → rejected. The dropdown never offers one, so this only fires on a stale page.
- Nothing is set in any case. No silent defaulting.
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

- Templates are displayed sorted by `(lap, time)`, so a row's visual position is not its array index. Look templates up with `templates.find(t => t.id === id)`. Never index into the array to mutate one.
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
  templates: [],               // [{id, text, time, mode, lap}]
  rotationDate: null,          // day key; laps reset when it isn't today
  setDraft: {text: "", time: null, mode: null, linkedItemId: null},
  lastCopyAt: null,            // ISO string, gates [Delete exported]
  ledgerCollapsed: true
}
```

**`load()` runs a field-by-field `normalise()` behind a single outer try/catch.**

- `normalise()` starts from `freshState()` and copies each field across only if it is the right type, so malformed or partial data degrades per field instead of wiping everything.
- No per-field try/catch. Falsedge's fields are flat values and arrays with no logic capable of throwing.
- No corrupt-blob backup key.
- `version` is written but never read, matching Aulists. It exists only bcuz claude is silly and dumdum

## Q23 — What does the ledger look like collapsed?

**The newest entry stays visible, above a toggle carrying the entry count.**

- The single newest entry renders in full above the toggle. Everything older is hidden.
- The toggle shows the total number of entries, e.g. `ledger (48)`.
- Expanding grows the region upward, revealing history above the newest entry.

## Q24 — Does the expanded ledger scroll inside itself, or push the page?

**Max-height `66vh` on the scrolling entries, scrolling internally past that.**

- `66vh` is a maximum, not a fixed height. A short ledger renders only as tall as its entries.
- The cap applies to the scrolling entry list only. Data export and the toggle sit outside it, so the region as a whole is taller than `66vh`.
- History scrolls within that list. The rest of the page does not move.

## Q25 — Is `scr` an integer or a decimal?

**Fractional, displayed up to one decimal place. `pts` is a whole-number counter.**

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

A `[cancel task]` button styled as a normal `.btn`, in the top-right corner of the active task area, above the task text.

## Q27 — How do you edit an active task's text?

**Tap the text, then confirm through an `edit?` overlay.**

- Tapping the task text shows an `edit?` overlay on top of it.
- Tapping `edit?` turns the text into an inline input in the active task block.
- Tapping anywhere else dismisses the overlay without entering edit mode.

### Q27.1 — How does an inline edit commit?

**Enter or blur commits. Undo is the discard.**

Applies to the active task's `edit?` editor and to the template hamburger's `Edit`.

- Copy Aulists' `startEdit` structure ([autorelists.js:1560](autorelists.js#L1560)).
- Keep the `committed` flag. Pressing Enter commits, then the input blurs and would otherwise commit a second time.
- An empty value cancels rather than saving an empty name — bail and re-render to restore the label.
- One commit is one undo step. The edit is never written per keystroke.

## Q28 — Is a linked task marked as linked?

A small chain-link emoji [🔗] beside the task text, rendered only when `linkedItemId` is set. No unlink control.

### Q28.1 — How does the SET box show the draft is linked?

**🔗 to the right of the text field, plus the source row highlighted in LINK.**

- The glyph sits outside the text field, right-aligned on that row.
- The linkable row the link came from stays visually marked in the LINK section for as long as its id is in `setDraft`.
- Both appear only while `setDraft.linkedItemId` is set.

```
[ vacuum                                        ] 🔗
```

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

## Q30 — Does Falsedge get a theme toggle?

**No. Themes are out of scope.**

- Falsedge uses `style-colourful.css`'s palette as-is. No toggle, no alternate palettes, no reading of `aulists.theme`.
- Lists keeps its own switcher, unchanged.
- Future themes will be named variants rather than a light/dark pair. Not in scope yet.

## Q31 — What does Falsedge do with boundaries, and how does undo cover Aulists writes?

**No boundaries. Undo reverses the Aulists write instead.**

Boundaries are dropped entirely. In Aulists, `pushBoundary` has exactly one call site — the scheduled List 2→1 transfer in `applyAutoReturn` — and it exists to flag a state change the *clock* made rather than the user. Falsedge has no clock-driven state changes at all: tier decay, template sorting and the delete gate are display-only, there is no auto-fail, and there are no timers. Every mutation comes from a tap. So `pushBoundary` would have no call site. Remove it, `isBoundary`, `pendingBoundary` and the confirm UI from `falsedge.js`.

Completing a linked task writes into `aulists.listdata`, which Falsedge's own state snapshot does not cover. Undo must reverse that write too, or the Lists item stays completed with no way back.

- An undo entry for a linked completion carries a side-snapshot of just the affected item: `{id, isDone, lastDone, indexInList0}`.
- Undoing restores those fields in the Aulists blob and re-inserts the id into `lists["0"]` at its recorded index.
- Best-effort, same drift rules as Q7.2: if the item no longer exists, skip the restore silently. If `lists["0"]` is shorter than the recorded index, append instead.
- The same applies to the text write-back — an undo entry for a text edit on a linked task carries the previous `text` and restores it.

## Q32 — What do empty sections look like?

**Placeholder text everywhere. Nothing is hidden.**

- Ledger with no entries → `(no entries yet)` where the newest entry would sit, and the toggle reads `ledger (0)`.
- Data export with an empty ledger → `(nothing to export)`.
- Scores panel with no high scores → `(no high scores yet)`.
- LINK with an empty List 0 → `(no linkables)`.
- Every section still renders. Buttons stay live — see Q32.2.

### Q32.1 — Do the copy actions toast?

**Yes, both, with counts.**

- `Copy from oldest` → `Copied 13 entries`. The count matters because the 2000-char cut point isn't visible.
- Scores panel Copy icon → `Copied 7 scores`.
- No special case for empty. The same message renders with a count of zero: `Copied 0 entries`, `Copied 0 scores`.

### Q32.2 — Is `[Copy from oldest]` greyed on an empty ledger?

**No, it stays live.**

- Looks and behaves normally, copies an empty string to the clipboard, and toasts `Copied 0 entries`.
- Only `[Delete exported]` is ever greyed, and only by its 10-minute gate.

## Q33 — Which actions push undo?

**Everything that changes state.**

`set task`, `complete now`, `completed before:`, `cancel`, editing the active task's text, `[streak broke]`, template add / edit / delete, template skip and swipe-right, `[Delete exported]`, and writes to `setDraft`.

## Q34 — How is SET locked while a task is active?

**Fully usable, but `set task` refuses.**

- Fields stay live. You can type, pick a time, toggle WL/HL, and the draft saves as normal.
- Tapping `set task` toasts `locked` and does nothing.

## Q35 — What shows in `completed before:` when no tier has passed?

The `completed before:` label renders with nothing after it until at least one tier's time has gone by.

## Q36 — How are tier rows styled once the final tier has passed?

All of them render faint. There is no normal-sized row, and the absence of one is the signal that every deadline is gone.

### Q36.1 — Do tier rows show WL/HL or dates?

Neither. Rows are bare `by HH:MM for N pts`.

- No leniency marker. The tier spacing already distinguishes WL from HL, and the ledger entry records it.
- No dates, even when the tiers cross midnight. A `23:50` deadline shows `23:50 / 00:00 / 00:20 / 00:50`; the rows are in order, so the rollover is self-evident.

## Q37 — Where does the expanded ledger start scrolled?

At the bottom, newest entry visible. Matches the collapsed state, where the newest entry is the one on screen. Scroll up for history.

## Q38 — How does `complete now` resolve tier boundaries?

Inclusive. `by 16:10` means at or before 16:10, so completing at exactly 16:10 awards that tier's points.

## Q39 — How are the section labels rendered?

`SET`, `ACTIVATE` and `LINK` render in caps, above and outside their boxes — not as card titles inside them.

`.card-title h2` in `style-colourful.css` lowercases its text, so these need their own rule rather than reusing it.
