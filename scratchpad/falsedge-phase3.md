# Falsedge — Phase 3

Falsedge is a points/deadline tracker at `falsedge.html` + `falsedge.js` + `style-falsedge.css`, sharing `style-colourful.css` with `about.html`. It has its own localStorage key and its own undo engine, and it reads and writes Aulists' storage for linked tasks.

Phase 3 builds the entire page. Phase 2 left a scaffold: the three files exist, `readAulistsListZero()` reads List 0, and `freshState()` returns `{version, ledger: []}`.

---

## State schema

```js
{
  version: 1,
  pts: 0,
  scr: 0,
  highScores: [],              // [{score, date}], top 10, sorted desc
  ledger: [],                  // pre-rendered strings, oldest first
  activeTasks: [],             // [{id, text, deadline, mode, linkedItemId}]
  templates: [],               // [{id, text, time, mode, lap}]
  rotationDate: null,          // day key; laps reset when it isn't today
  setDraft: {text: "", time: null, mode: null, linkedItemId: null},
  spendDraft: {text: "", cost: null},
  lastCopyAt: null,            // ISO string, gates [Delete exported]
  ledgerCollapsed: true
}
```

`version` is written and never read. It exists bcuz claude dumdum.

`pts` is a whole-number counter. `scr` is fractional, displayed up to one decimal place — `130` renders as `130`, `10.9` as `10.9`. `pts` ticks up by one for each whole number `scr` crosses, tracked incrementally, never derived as `floor(scr)`. Nothing currently awards a fraction, so awards move the two in lockstep.

Spending is the one thing that moves them apart, and it is why `pts` cannot be derived. A spend subtracts from `pts` and leaves `scr` alone. `pts` is allowed to go negative and is not floored at zero.

| | goes up | goes down | resets |
|---|---|---|---|
| `pts` | task awards | spending, without limit | never |
| `scr` | task awards | never | `[streak broke]` |

Templates and active tasks carry a `uid()`. Ledger entries do not — they are bare strings addressed by array position, appended at the newest end and deleted in batches from the oldest end.

Field formats, following Aulists' existing conventions:

| field | format | example |
|---|---|---|
| `activeTasks[].deadline` | ISO string, like Aulists' `lastDone` and `deletedAt` | `"2026-08-03T16:00:00.000Z"` |
| `activeTasks[].mode` | `"WL"`, `"HL"`, or `null` | `"WL"` |
| `templates[].time` | `"HH:MM"`, 24-hour, always two digits | `"04:40"` |
| `setDraft.time` | `"HH:MM"`, same format as `templates[].time` | `"17:20"` |
| `templates[].mode` | same as `activeTask.mode` | `null` |
| `templates[].lap` | integer, starts at `0` | `2` |
| `highScores[].date` | day key, `"YYYY-MM-DD"` | `"2026-07-14"` |
| `rotationDate` | day key, same format | `"2026-08-03"` |
| `lastCopyAt` | ISO string | `"2026-08-03T21:47:00.000Z"` |

`templates[].time` being a zero-padded `"HH:MM"` string is what makes the `(lap, time)` sort work on plain string comparison.

## Storage

`STORAGE_KEY` is `"falsedge.data"`.

`load()` reads the key, `JSON.parse`s it, and passes the result to `normalise()`, all inside one try/catch that falls back to `freshState()`.

`normalise()` starts from `freshState()` and copies each field across only if it is the right type, so malformed or partial data degrades field by field. No per-field try/catch — every field is a flat value or array with no logic capable of throwing. No corrupt-blob backup key.

`save()` writes `JSON.stringify(state)` back to the key.

`getNow()` returns `new Date()`. There is no debug clock override.

## Undo

Copy the generic engine already in `falsedge.js` — `pushUndo`, `step`, `snapshotState`, `UNDO_CAP = 60`. Delete `pushBoundary`, `isBoundary`, `pendingBoundary` and any boundary-confirm UI; Falsedge has no clock-driven state changes, so nothing would ever push a boundary.

Every state change pushes undo: `set task`, `complete now`, `completed before:`, `cancel task`, editing the active task's text, `[streak broke]`, `[spend]`, template add / edit / delete / skip, `[Copy from oldest]`, `[Delete exported]`, and writes to `setDraft` and `spendDraft`. `[Copy from oldest]` is on that list because it writes `lastCopyAt`, which is what arms `[Delete exported]`.

Two writes are exempt. The ledger's collapse toggle writes `ledgerCollapsed`, and the render-time lap reset writes `rotationDate` and zeroes every `lap`. The first is view state. The second fires on a passive re-render, where pushing undo would poison the stack without the user having done anything.

The spend row's open/closed state and the high-scores panel's are not in `state` at all — they live in closure variables — so they never reach undo in the first place.

The undo/redo pill is a copy of Aulists' markup ([index.html:77-81](../index.html#L77-L81)) minus the boundary-confirm div — same shape, layout and geometry, restyled in `style-falsedge.css` off the `style-colourful.css` palette, colourful and glowy.

Every undo and redo toasts the label it just reversed or reapplied — `Undid: set task`, `Redid: spend` — the same as Aulists. The label rides along with the snapshot onto the opposite stack in both directions, so nothing extra needs looking up.

The pill also copies Aulists' 500ms tap cooldown: a tap on either button greys both out and swallows further taps for 500ms, since rapid alternating taps are the same footgun as rapid same-button taps. The toast still fires on every tap regardless of cooldown.

None of the pill exists yet. Phase 2 left the engine only — `falsedge.html` has no pill markup and no `.toast` div, and `falsedge.js` looks up `undoBtn`/`redoBtn` but never attaches a click listener to either, so both currently resolve to `null` and the whole block is dead code behind its own guard. Phase 3 adds the markup, the wiring and the cooldown.

### Handler rule

Event handlers must resolve state inside the callback, never capture it when building the element.

```js
// wrong
var task = state.activeTasks[i];
btn.addEventListener("click", function () { completeTask(task); });

// right
btn.addEventListener("click", function () {
  var task = state.activeTasks.find(function (t) { return t.id === id; });
  if (!task) return;
  completeTask(task);
});
```

Same for templates: capture the `id` string, then `templates.find(t => t.id === id)` inside the callback. Never index into `activeTasks` or `templates` to mutate one — the displayed order is not the array order.

`step()` replaces the whole state with `JSON.parse(JSON.stringify(snapshot))`, so any object captured before an undo is a detached orphan. `save()` only serialises `state`, so writes to such an object vanish with no error.

## Aulists interop

Aulists' key is `"aulists.listdata"`. `readAulistsListZero()` already reads `lists["0"]` and resolves each id against `itemsById`. It is called fresh on every render, so the LINK list is never stale.

A task created via `[Link]` carries `linkedItemId`. Text edits and completion both propagate into the Aulists blob.

### Text write-back

Editing a linked **active** task's text does a read-mutate-write on `aulists.listdata`, setting `itemsById[linkedItemId].text`. Editing the SET **draft** writes nothing — the rename lands at `set task`, and live propagation starts from there.

### Completion write-back

Both completion paths write back, including the 0-pt failed one. `cancel task` writes nothing.

One read-mutate-write, mirroring what Aulists' own `completeItem` does:

- `itemsById[id].isDone = true`
- `itemsById[id].lastDone = <effective completion time>.toISOString()`
- splice `id` out of `lists["0"]`

The effective completion time is `getNow()` for `complete now`, or the tier's clock time for a `completed before:` button.

### Drift

- **Item exists** → set `isDone` and `lastDone`. Splice from `lists["0"]` only if the id is actually there; if it has moved elsewhere, skip the splice and leave every list array alone.
- **Item gone** → skip the Aulists write entirely.

Either way the Falsedge task resolves and its ledger entry is written normally. The link never blocks anything.

### Undo across the boundary

Falsedge's state snapshot does not cover `aulists.listdata`, so undo must reverse those writes explicitly.

- An undo entry for a linked completion carries a side-snapshot of the affected item: `{id, isDone, lastDone, indexInList0}`. Undoing restores those fields and re-inserts the id into `lists["0"]` at its recorded index.
- An undo entry for a text edit on a linked task carries the previous `text` and restores it. The rename that lands at `set task` counts as one of these — undoing that `set task` reverts the Aulists rename as well as removing the task.
- Best-effort, same drift rules: if the item no longer exists, skip silently. If `lists["0"]` is shorter than the recorded index, append instead.
- Redo is symmetric. `step()` already snapshots Falsedge state onto the opposite stack before restoring; the side-snapshot works the same way. Undoing a linked completion reads the item's current post-write values into the entry it pushes onto the redo stack, then restores the pre-write ones — so redoing re-applies `isDone`, `lastDone` and the splice out of `lists["0"]`. Same for a text edit: redo re-applies the new text. Drift rules apply in both directions.

---

## Page order

```
Falsedge                                    [Refresh]

┌──────────────────────────────────────┐
│ (newest entry)                       │
|──────────────────────────────────────|
│             ledger (48)              │
└──────────────────────────────────────┘

┌────────────────────┐
│ Current pts: 42  > │
└────────────────────┘
┌────────────────────┐
│ Current scr: 127 > │
└────────────────────┘

                  [cancel task]
do task
by 16:00 for 6 pts
...

SET
┌──────────────────────────────────────┐
└──────────────────────────────────────┘

ACTIVATE
┌──────────────────────────────────────┐
└──────────────────────────────────────┘

LINK
┌──────────────────────────────────────┐
└──────────────────────────────────────┘

              [↓ Go to Lists ↓]
```

Section labels `SET`, `ACTIVATE` and `LINK` render in caps, above and outside their boxes. `.card-title h2` in `style-colourful.css` lowercases its text, so these need their own rule.

There are no timers of any kind. The page re-renders on `visibilitychange` when not hidden, and the header's `Refresh` button calls `location.reload()`. Every calculation reads `getNow()` at tap time, so a stale screen can never produce a wrong result.

Falsedge needs `.toast` markup and the `toast()` helper copied from Aulists ([autorelists.js:3506](../autorelists.js#L3506)), with its own CSS in `style-falsedge.css` — Aulists styles `.toast` in `style-minim.css`.

No theme toggle. Falsedge uses `style-colourful.css`'s palette as-is and never reads `aulists.theme`.

## Header

A flex row, same shape as Aulists' header: `Falsedge` title left, `Refresh` button right.

## Ledger

The only collapsible region on the page, collapsed by default. Its toggle sits at the **bottom** of the region, not the top.

The ledger has no section label. Unlike SET, ACTIVATE and LINK, nothing renders above its box — the lowercase toggle at its bottom IS its label.

### Collapsed

The newest entry renders in full above the toggle; everything older is hidden, **and so is the data export block**. Collapsed, the region is exactly two things: the newest entry, and the toggle. The toggle reads `ledger (48)`, lowercase, with the total entry count.

With no entries at all, `(no entries yet)` renders where the newest entry would sit and the toggle reads `ledger (0)`.

### Expanded

The region grows upward, revealing history above the newest entry. It opens scrolled to the bottom, with the newest entry visible; scroll up for history.

The scrolling entry list has `max-height: 66vh` and scrolls internally past that. `66vh` is a maximum — a short ledger renders only as tall as its entries. Data export and the toggle sit outside that cap, so the region as a whole can exceed `66vh`.

"Grows upward" is literal, and it has to be paid for with scroll, because the ledger is the topmost element on the page. On expand, measure the region's height before and after and add the delta to `window.scrollY`. The toggle stays at the same screen position, the revealed history appears above it, and everything below the ledger — scores, active tasks, SET, ACTIVATE, LINK — does not visually move. Collapsing subtracts the same delta. Scrolling inside the entry list never scrolls the page.

```
┌────────────────────────┐
│ (older entries)      ▲ │
│ ...                    │  ← scrolls, max-height 66vh
│ newest entry         ▼ │
├────────────────────────┤
│ Export data at 2000... │  ← pinned
│ [Copy from oldest]     │
│ [Delete exported]      │
├────────────────────────┤
│      ledger (48)       │  ← toggle
└────────────────────────┘
```

### Entry format

Each entry is a pre-rendered string, built once at the moment the task resolves, in its own round-box outline. Nothing about a past entry is ever recomputed or reformatted — a later change to the display format leaves existing entries exactly as written.

```
do task
by 2026-08-02 16:00 (WL)
completed by: 16:08
pts = 42 + 3 = 45
scr = 127 + 3 = 130
```

- The `by` line carries the full deadline date and the leniency mode.
- `completed by:` is always a bare `HH:MM`, even when the completion crossed midnight — the deadline line carries the date.
- Cancelled tasks read `completed by: none (cancelled)`. Failed tasks read `completed by: none (failed)`.
- On a step where `scr` moves but crosses no whole number, the `pts` line renders as a bare value with no arithmetic: `pts = 20`.

A spend writes a two-line entry — the text and the `pts` line, and nothing else. There is no `by` line, no `completed by:` line and no `scr` line, because none of those moved. 

```
new headphones
pts = 45 - 50 = -5
```

Spend entries are ledger entries like any other: they count toward the `ledger (48)` total, they export in their own fenced block, and `[Delete exported]` removes them from the oldest end alongside task entries. No special casing anywhere.

### Data export

Inside the ledger region, pinned below the scrolling entries and above the toggle. It does not scroll with history and has no toggle of its own. It is hidden whenever the ledger is collapsed and appears only when the ledger is expanded.

```
Export data at 2000 char limits:
[Copy from oldest]    [Delete exported]
```

`Copy from oldest` fills forward from the oldest entry, adding whole entries until the next would exceed 2000 characters, and copies the result to the clipboard. Each entry is wrapped in its own fenced code block; nothing wraps the whole batch.

The 2000 characters are measured on the finished clipboard string, not on the entry text alone — the fences, the newlines and the blank lines between blocks all count, because 2000 is a limit on what gets pasted somewhere else.

````
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
````

The button is stateless — repeated taps produce the same batch. `[Delete exported]` is what advances it.

Copying is a real clipboard write — `navigator.clipboard.writeText()`, toasting `copy failed` if the promise rejects. This is deliberately not what Aulists does: its `Export - Copy` opens a readonly `<textarea>` for manual selection ([autorelists.js:3380](../autorelists.js#L3380)) and never touches the clipboard. Falsedge's two copy controls, here and in the scores panel, both write directly.

`[Copy from oldest]` toasts `Copied 13 entries`. The count matters because the cut point isn't visible. There is no special case for an empty ledger: it stays live, copies an empty string, and toasts `Copied 0 entries`. With an empty ledger the export block also shows `(nothing to export)` as its own line, directly above the two buttons, which stay live and normal-looking.

`[Delete exported]` removes exactly the batch `Copy from oldest` produces — the oldest entries. It is always visible and greyed out until you have copied within the last 10 minutes. Tapping it while greyed toasts `Delete available after exporting`. The copy timestamp is `lastCopyAt`, plain wall-clock, surviving reload and app close. Deleting clears `lastCopyAt`, so the button greys again immediately: the rhythm is copy, delete, copy, delete.

Every text input on the page carries `maxlength="1000"` — the SET text field, the template adder, the spend row's text field, and both inline editors (the active task's `edit?` editor and the template hamburger's `Edit`) — so a single entry tops out around 1100 characters and can never exceed the batch limit on its own.

## Scores

Two separate boxes, stacked, each its own tap target with its own chevron immediately to the right of its value.

```
┌────────────────────┐
│ Current pts: 42  > │
└────────────────────┘
┌────────────────────┐
│ Current scr: 127 > │
└────────────────────┘
```

Each box is rounded, a slightly different colour from the page background, sized to the wider of the two's contents and left-aligned — not stretched across the content column. The two are NOT sized independently, so their right edges MUST line up. The empty space to their right is where the high-scores panel opens.

Each chevron is pinned to its own box's right edge, and since both boxes share that edge the two chevrons line up in a column. Because the shared width comes from the wider box's contents, the shorter value is never more than a character or two off its chevron — right-pinned and "beside the value" are the same position here.

- `Current scr:` opens the high-scores panel.
- `Current pts:` toggles the spend row.

### Spend row

Tapping `Current pts:` opens a row directly below that box and above the `Current scr:` box, in normal flow — the scr box and everything under it shift down. Tapping `Current pts:` again closes it. While it is open the box's `>` becomes `^`; the glyph is a chevron in both states purely for symmetry with the scr box, even though the motion it describes is vertical.

```
┌────────────────────┐
│ Current pts: 42  ^ │
└────────────────────┘
log spent points
[ text field    ]  [ pts cost ]  [spend]
┌────────────────────┐
│ Current scr: 127 > │
└────────────────────┘
```

`pts cost` accepts a positive integer and nothing else. `[spend]` subtracts it from `pts`, leaves `scr` untouched, and appends a spend entry to the ledger.

The row spans the full content column; the two score boxes stay narrow. Because the boxes are sized to their own widest content and the row sits between them in normal flow, the row has to be kept out of that intrinsic sizing or it would drag both boxes wide and swallow the gap the high-scores panel opens into. `width: 0; min-width: 100%` on the row does it: zero contribution to the shared max-content width, full width when actually laid out.

`[spend]` is greyed and inert until the row holds non-empty text and a positive integer cost, mirroring ACTIVATE's `[add]`. The greyed button is the entire refusal — no toast on either condition. Both fields clear on a successful spend and `[spend]` greys again.

Open/closed is a closure variable, not a state field. It survives the `visibilitychange` re-render — that rebuilds the DOM, not the variable — and is lost only on an actual page load: reload, `Refresh`, or app restart, all of which start closed. The high-scores panel works the same way.

The row's contents are draft-backed in `state.spendDraft`, on the same rules as `setDraft`: text saves on `blur` and `visibilitychange`, `cost` saves on change, both writes push undo, and closing the row does not clear them. A draft left in the row is still there after a reload, with the row itself closed.

### Panel

Tapping `Current scr:` opens a panel that floats on top of the page — out of document flow, `position: fixed`, high `z-index`. Nothing reflows, the scores boxes do not shrink, and whatever is underneath is simply covered.

The panel is right-aligned, sized to its contents, top-aligned with the `Current scr:` box, and semi-transparent over a darker fill. Where it is wider than the gap beside the box it covers the box's right side. A dimming scrim sits behind it, reusing `.overlay`'s `rgba(8,9,13,.6)` + `blur(3px)` from `style-colourful.css` — that rule is laid out for bottom sheets, so the panel needs its own positioning.

Dismissed by tapping anywhere outside it.

The panel and the spend row are independent — opening either one does not close the other, and the panel simply top-aligns to wherever the `Current scr:` box currently sits, which is one row lower while the spend row is open. In practice the panel is the transient one: its scrim swallows the first tap and dismisses it, so reaching into the spend row underneath takes a second tap, and the row is still open when you get there.

Contents are the top-10 high scores and nothing else. No current run, no derived stats.

```
1.  312   2026-07-14
2.  287   2026-06-02
3.  190   2026-05-28
```

With none stored, `(no high scores yet)`.

A Copy icon sits top-right and copies the displayed list verbatim as plain text, toasting `Copied 7 scores`. The icon is the standard copy glyph — two overlapping rounded rectangles — drawn as inline SVG. The page loads no icon font and the emoji clipboard is not it.

With no scores stored the icon stays live and copies an empty string, toasting `Copied 0 scores` — the same shape as `[Copy from oldest]` on an empty ledger. The `(no high scores yet)` placeholder is a rendering of emptiness, not a line of the list, so it is never copied.

### highScores

Sorted descending, hard cap at 10. On a reset, insert `{score, date}` in sorted position and trim to 10. A score that doesn't beat the current 10th is discarded entirely. On a tie the new entry sits above the existing equal one.

## Active tasks

Unlimited. `state.activeTasks` is an array, sorted by deadline soonest-first on every render. An overdue task stays at the top; nothing sinks when it fails.

Every task renders in full — no cap, no collapsing, no separate scroll region. Each is a rounded block with a flat background colour distinct from the page: filled, not outlined, deliberately different from ledger entries.

```
┌──────────────────────────────────────┐
│                        [cancel task] │
│ do task                              │
│ by 16:00 for 6 pts                   │
│ by 16:10 for 3 pts                   │
│ by 16:30 for 2 pts                   │
│ by 17:00 for 1 pts                   │
│ [complete now]                       │
│ completed before: [16:00] [16:10]    │
└──────────────────────────────────────┘
┌──────────────────────────────────────┐
│                        [cancel task] │
│ vacuum                            🔗 │
│ by 19:00 for 6 pts                   │
│ ...                                  │
└──────────────────────────────────────┘
```

`[cancel task]` is a normal `.btn` on its own row in each block's top-right corner, above that task's text.

A linked task shows 🔗 beside its text. There is no unlink control.

Every control — cancel, complete, `completed before:`, the `edit?` overlay — is per task and affects only its own block.

### Tier rows

All tasks are worth 6 pts at the primary deadline.

- **WL** — offsets 0/10/30/60 minutes after the deadline → 6/3/2/1 pts.
- **HL** — offsets 0/5/15/30 minutes → 6/3/2/1 pts.

Rows read `by HH:MM for N pts`. No leniency marker, no dates — a `23:50` deadline shows `23:50 / 00:00 / 00:20 / 00:50`, and the rows being in order makes the rollover self-evident.

Because `activeTasks` can span more than a day, two blocks can render the same `by 17:00` row while holding deadlines on different days. That is accepted and gets no date marker. The stored deadlines are distinct instants, so nothing downstream is ambiguous, and the soonest-first sort is the only ordering signal the page needs.

Passed rows and upcoming rows render smaller and fainter. The live tier renders at normal size. Once the final tier has passed every row is faint and none is normal-sized; the absence of a normal row is the signal that all deadlines are gone.

### Completing

`complete now` awards the live tier's points, resolved inclusively — `by 16:10` means at or before 16:10, so completing at exactly 16:10 awards that tier. Past the final tier it awards 0 and logs `completed by: none (failed)`.

`completed before:` shows one button per tier whose time has already passed. Each awards its own tier's points and sets the effective completion time to that clock time rather than to now. Before any tier has passed, the label renders with nothing after it.

Nothing fails automatically. There is no timer, no auto-fail and no dismiss button — a task sits active indefinitely until `complete now`, `completed before:` or `cancel task`.

### Cancelling

`cancel task` removes that task from `activeTasks` and writes a ledger entry reading `completed by: none (cancelled)` with no points. It is distinct from undo: undo erases a mis-set task, cancel records that you meant it and changed your mind.

### Editing the text

Tapping the task text shows an `edit?` overlay on top of it. Tapping `edit?` turns the text into an inline input; tapping anywhere else dismisses the overlay without entering edit mode.

The input commits on Enter or blur, following Aulists' `startEdit` ([autorelists.js:1560](../autorelists.js#L1560)). Keep the `committed` flag — Enter commits, then the input blurs and would otherwise commit a second time. An empty value cancels rather than saving an empty name. One commit is one undo step; the edit is never written per keystroke. There is no discard control — undo is the discard.

### No active tasks

Rendered only when `activeTasks` is empty. Breaking a streak therefore means completing or cancelling everything first.

```
(no active tasks)
[streak broke]
```

`[streak broke]` pushes `scr` into `highScores` and zeroes `scr`, immediately and silently. `pts` is untouched, and a reset never decrements it. No confirm sheet, no ledger entry; undo covers misfires. With `scr` already at 0 it refuses — nothing is pushed, and it toasts `nothing to break`.

## SET

```
SET
┌──────────────────────────────────────────────────┐
│ [ text field                                   ] │
│                                                  │
│ by [17:00] [17:10] [17:20] [17:30] [18:00]       │ ← smaller / fainter
│ or select [16:50 ▾]                              │ ← normal size
│                                                  │
│ [ WL ]  [ HL ]                                   │ ← normal size
│                                                  │
│                                     [set task]   │ ← right-aligned
└──────────────────────────────────────────────────┘
```

### Time buttons

Buttons 1–4 are `now +30 / +40 / +50 / +60` minutes, each rounded up to the next 10-minute mark. Button 5 is the smallest whole hour strictly greater than button 4 — defining it off button 4 rather than off `now` means it can never duplicate it. Buttons 1–4 are always 10 minutes apart and rounding preserves that.

| now | +30 | +40 | +50 | +1h | next hour |
|---|---|---|---|---|---|
| 16:00 | 16:30 | 16:40 | 16:50 | 17:00 | 18:00 |
| 16:23 | 17:00 | 17:10 | 17:20 | 17:30 | 18:00 |
| 16:50 | 17:20 | 17:30 | 17:40 | 17:50 | 18:00 |
| 16:55 | 17:30 | 17:40 | 17:50 | 18:00 | 19:00 |

Tapping a button sets the dropdown. The dropdown is the single source of truth for the selected deadline.

### Dropdown

A `<select>` running 24 hours forward in 10-minute steps, wrapping past midnight, with bare `HH:MM` labels and no date marker. The first option is `ceil10(now + 20min)` — always 20 to 29 minutes out. Options are strictly increasing in real time, so a past deadline is unreachable by construction.

### WL / HL

Two toggles, mutually exclusive. Tapping the selected one deselects it back to unset. Unset is neither being lit; there is no third button.

### Submit

`[set task]` on its own line at the bottom, regular button size, right-aligned. Each failure is a hard block with its own toast:

- Empty text → `Task needs text`
- Neither WL nor HL selected → `Pick WL or HL`
- Deadline less than 20 minutes away, or already past → `refreshed`; the dropdown never offers either, so this only fires on a stale page, and the toast is naming the re-render that follows rather than reporting a mistake
- Deadline already held by an active task → `18:00 overlaps`, regardless of the modes involved. The comparison is on the exact stored instant, not the clock time — `17:00` today and `17:00` two days out are different deadlines, and both are settable
- Any active task more than 24 hours past its own deadline → `clean up old tasks`

Nothing is set in any of those cases. No silent defaulting.

Nothing auto-fails, so an unresolved task sits in `activeTasks` indefinitely; once one is more than 24 hours past its own primary deadline, SET refuses every submit until that task is completed, `completed before:`'d or cancelled. Measured against the primary deadline, not the final leniency tier, and recomputed from `getNow()` at tap time like every other check. Prefilling is unaffected — a swipe-left from ACTIVATE or a `Link` from LINK writes `setDraft`, not `activeTasks`, so only the submit is blocked.

SET never locks. A successful submit appends to `activeTasks`, which re-sorts on render.

### Draft

`state.setDraft` holds `{text, time, mode, linkedItemId}` and is restored on render. Text saves on `blur` and `visibilitychange`; the dropdown, WL/HL and `linkedItemId` save on change. The whole draft is cleared on a successful SET, with `linkedItemId` moving onto the new task first.

`setDraft.time` is a bare `"HH:MM"` clock time, not an instant — the same format as `templates[].time`. It resolves to a real deadline at restore and again at submit: the next occurrence of that clock time at or after `getNow()`, which is today's if it hasn't passed and tomorrow's if it has. That is exactly what the dropdown's midnight wrap already means, so the draft stores what the dropdown displays and nothing more.

On restore the resolved instant is re-checked against the 20-minute floor, and if it falls under it the dropdown silently lands on its first available option, leaving text and WL/HL intact. There is no separate already-past case — a clock time always has a next occurrence — so the 20-minute check is the whole check.

`set task` resolves the same way and stores the result as `activeTasks[].deadline`, an absolute ISO instant. From that point the task never reconsults the clock time; the overlap check and the tier rows both work off the stored instant.

A draft carrying a link shows 🔗 outside the text field, right-aligned on that row, and the source row stays visually marked in LINK for as long as its id is in `setDraft`.

```
[ vacuum                                        ] 🔗
```

## ACTIVATE

A template is a pure preset: `text`, a required `time` (time-of-day only), and an optional default WL/HL. Templates are always listed, never expire, and have no dates or recurrence rules.

```
ACTIVATE
┌────────────────────────────────┐
│ check in after getting home    │
│ [19:00 ▾]  [WL] [HL]  [☰]      │
│                                │
│ shower                         │
│ [04:40 ▾]  [WL] [HL]  [☰]      │
├────────────────────────────────┤
│ [ text field                 ] │  ← pinned
│ [--:-- ▾]  [WL] [HL]     [add] │
└────────────────────────────────┘
```

Rows are two-line: text on its own line, then a control row of `[time dropdown] [WL] [HL] [hambugu]`. The row always displays the real time.

The row list has `max-height: 40vh` and scrolls internally past that. The adder is pinned below the scroll region so it stays reachable however many templates exist.

### Ordering

Base order is plain ascending clock time, `00:00` at the top through `23:59` at the bottom. It does not reference `now`.

Each template carries a `lap` counter. Sort by `(lap, time)` — everything on lap 0 sits above everything on lap 1. Ties fall to creation order for free: new templates are pushed onto the end of `templates` and `Array.prototype.sort` is stable, so no third comparison term is needed.

**Swipe right** (left→right) on any row increments that template's `lap`, sending it to the bottom. The hamburger's `Skip` does the same thing. On a row that is already last, either one bumps the lap but produces no visible movement. Because any row can be bumped, laps drift more than one apart and the order is not a strict rotation; whenever every template happens to share a lap, ties fall back to time and the order is plain ascending again.

A newly added template gets `lap: 0` and slots into the un-bumped group by its time.

All laps reset to `0` when the day changes. `rotationDate` holds a day key; on render, if it isn't today, reset every `lap` and update the key. Evaluated on render rather than at midnight, since there are no timers. This is visual only.

### Controls

**Swipe left** (right→left) on any row prefills SET — every row, unlike swipe-right.

The prefill carries text, time and WL/HL, but WL/HL only when the template has one set; a template with neither leaves SET's existing selection alone rather than clearing it. If the template's time is less than 20 minutes away, text and WL/HL prefill as normal and the dropdown lands on its first available option instead.

The prefill overwrites the draft's text outright, so it also clears `setDraft.linkedItemId`. The replaced text no longer came from the linked item, and the 🔗 and the green LINK row go with it.

A prefill scrolls SET into view and toasts `prefilled SET`. SET sits above both ACTIVATE and LINK, so on a phone the write lands offscreen and a successful prefill would otherwise look like nothing happened. This applies for any prefill action. 

Both gestures come from Aulists' `swipeCore` ([autorelists.js:1804](../autorelists.js#L1804)), copied as-is except for one thing: its drag tint references `--success`, which `style-colourful.css` does not define. Use `--c-green`.

**Hamgur** at the end of the control row. Menu is `Activate` / `Skip` / `Edit` / `Delete`. No pencil icon. `Activate` duplicates swipe-left and `Skip` duplicates swipe-right, both so the app is testable on desktop.

**Time** is edited by tapping the row's dropdown — a native `<select>` listing the full day, `00:00` through `23:50` in 10-minute steps, 144 options, identical every time and unrelated to `now`. The current value scrolls into view, so earlier times sit above it and later ones below. Not circular.

**WL/HL** is two toggles, mutually exclusive, same as SET's. Unset is neither being lit.

### Adder

Pinned at the bottom, mirroring the full row shape: text field, then time dropdown and WL/HL toggles. The dropdown starts on a `--:--` placeholder option, which is not a valid time.

`[add]` is greyed and inert until the adder holds both a time and non-empty text. The greyed button is the entire refusal — no toast on either condition.

After adding, every field clears — text empties, the dropdown returns to `--:--`, both toggles go unset, and `[add]` greys again.

## LINK

Aulists' List 0, re-read from `aulists.listdata` on every render.

```
LINK
┌────────────────────────────────┐
│ vacuum                [Link]   │
│ job search stuff      [Link]   │
└────────────────────────────────┘
```

Each row has only a `Link` button — no checkbox, menu or pencil; those live in Aulists. The list has `max-height: 40vh` and scrolls internally past that.

Tapping `Link` prefills SET's text field with the item's text and stores its id as `setDraft.linkedItemId`. The time is left alone. Editing the text afterwards does not break the link — the Aulists item gets renamed to match at `set task`. Like ACTIVATE's swipe-left, it scrolls SET into view and toasts `prefilled SET`.

A row has three visual states, driven purely by where its id currently is:

- **plain** — the id is in neither `setDraft` nor any active task. `[Link]` is live.
- **green** — a low-alpha `--c-green` wash across the whole row, while `setDraft.linkedItemId` holds the id. Green means *in the draft*. It clears the moment the id leaves the draft, whether by a successful `set task` or by a template prefill overwriting the text.
- **yellow** — a low-alpha `--c-yellow` wash across the whole row, while any active task holds the id as its `linkedItemId`. Yellow means *already an active task*. `[Link]` on that row is greyed and inert.

The two washes are mutually exclusive by construction, not by a check. A yellow row's `[Link]` is dead, so a yellow id can never enter the draft; and a green id only turns yellow at `set task`, which clears the draft in the same step. `set task` therefore needs no duplicate-link guard of its own — the greyed button is the entire gate, and tapping it does nothing and toasts nothing, matching ACTIVATE's `[add]` and the spend row's `[spend]`.

Yellow clears when the task resolves. `cancel task` writes nothing back to Aulists, so the item stays in `lists["0"]` and its row goes back to plain and live. Both completion paths splice the id out of `lists["0"]`, so the row leaves LINK entirely.

With List 0 empty, `(no linkables)`.

## Footer

`↓ Go to Lists ↓` as the last element in `<body>`, in normal flow, centred, styled as a plain `.btn` from `style-colourful.css`. It scrolls with the page and is not fixed. Remove the `.page-nav-top` rule from `style-falsedge.css`; Aulists' own top pill is styled in `style-minim.css` and is unaffected.

## Stale interactions

The rendered DOM is never trusted. Every handler recomputes from `getNow()` at tap time.

- `[Delete exported]` past its 10 minutes → toast, nothing deleted.
- `complete now` after a tier boundary passed since render → proceeds silently with the correct present value, including the 0-pt failed case. Tier rows are deadline statements, not claims about the current award, so nothing on screen was contradicted.
- `completed before:` missing buttons for newly-passed tiers → nothing special. Buttons can only ever be missing, never wrong.
- `set task` with a now-past or under-20-minute deadline → refuses, toasts `refreshed`, re-renders with a corrected dropdown.

## Service worker

Nothing to change. `sw.js` is network-first: the fetch handler tries the network, caches the fresh response on the way through, and falls back to the cache only when the network fails, so every successful load overwrites the stored copy. `CACHE` only names the bucket `install` precaches `SHELL` into and `activate` keeps. `falsedge.html`, `falsedge.js` and `style-falsedge.css` are already in `SHELL`, and Phase 3 adds no files.
