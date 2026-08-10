# Falsedge Phase 4 — Q&A

Working record of every question asked and answered while spec'ing Phase 4. This is NOT the deliverable. The deliverable will be `falsedge-phase4.md`, containing finalized decisions only — no questions, no rejected options, no discussion history, no rationale drawn from discussion. It gets handed to an instance of Claude with zero memory of this conversation.

## Setup decisions

**S1. Source material.** Distilled from `scratchpad/next-features-n-fixes.md`, itself distilled from `scratchpad/sad-todos-babble.md`. Latest statements in the babble supersede earlier ones on the same topic.

**S2. Current implementation baseline.** Phase 3 is live in code (`falsedge.html`, `falsedge.js`, `style-falsedge.css`, `19d3bcc`/`505a7ea`). `scratchpad/falsedge-phase3.md` describes it in full and is the baseline this doc's questions assume unless a next-features item says otherwise.

**S3. Ask style.** Over-ask, never under-ask. One question at a time. Enumerate every possible interpretation, never assume anything is obvious.

**S4. Doc rule.** The deliverable (`falsedge-phase4.md`) is finalized decisions only, stated as fact — same rule as Phase 3.

**S5. No backward compatibility for old Aulists data, ever.** No migration code, no accounting for old data shapes, in this phase or any future one. If the user needs to carry data across a breaking change, they export, update, and re-import manually.

## Q1 — What are the page's top-level sections after Phase 4, and does LINK / Aulists-linking survive at all?

**Aulists-linking is removed entirely — no connection to `aulists.listdata` at all, in any form.** No `🔗`, no `linkedItemId`, no propagation.

**`SET` stays on the page, unchanged in appearance and behaviour, except its submit button is disabled.** Text field, time quick-buttons, dropdown, and WL/HL toggles all remain fully live and draft-backed exactly as they are today. The "set task" button itself is inert (greyed, unclickable) — nothing can actually be submitted through it. This is a holding pattern pending a final decision on what role `SET` plays now that both `ACTIVATE` sections can spawn active tasks directly. All of `SET`'s code (`buildSet()`, `submitSet()`, the draft-saving wiring) stays exactly as written — only the button gets disabled.

**`ACTIVATE (others)` rows are no longer disposable presets — they're persistent records with their own identity, because two things need to be tracked per-row across its lifecycle:**

- `lastDone` — needed for `ACTIVATE (others)`'s sort-by-last-done ordering.
- a cancel-cooldown timestamp — needed for the 36h re-set block on "further" tasks (see the further-task-deadlines item in `next-features-n-fixes.md`).

The word "template" no longer fits `ACTIVATE (others)` rows — a row effectively *is* the item now, not a preset that spawns disposable copies. Whether this also applies to `ACTIVATE (dailies)` rows is still open — see Q2.

## Q2 — Where does the "further task deadlines" feature (dates up to 1 week out) fit into the new two-section model?

**It's a property of `ACTIVATE (others)` rows specifically.**

- Each `ACTIVATE (others)` row optionally carries a target date (up to 1 week out), alongside its optional time.
- The `ACTIVATE (others)` adder carries the same optional date field, alongside its optional time. (This adder doesn't exist yet in the current code and needs to be built — Phase 3 only ever built a dailies-shaped ACTIVATE adder.)
- `ACTIVATE (dailies)` rows and their adder never get a date field.

## Q3 — Is a "further task" an `ACTIVATE (others)` row with its date set, becoming an active task with that date as its deadline once activated?

**Yes.**

- An `ACTIVATE (others)` row with a date set, once activated (by swiping left on it), becomes an active task whose deadline is that specific date + time.
- The dimmer / day-of-week-label / divider-line treatment happens in the **active tasks stack**, separating near-term active tasks from far-off ones — not in the `ACTIVATE (others)` row list.

## Q4 — For `ACTIVATE (others)` rows, what counts as "fully filled" for swipe-left instant-activation to succeed?

**Text, WL/HL, and time are all required — same as `ACTIVATE (dailies)`. Date is the only optional field.**

A dateless `ACTIVATE (others)` row still needs a time set before swipe-left will activate it. If text, WL/HL, or time is missing, swipe-left refuses with the same toast `SET` used to show on refusal.

## Q5 — Does the 36-hour re-set cooldown after cancelling apply only to "further" (dated) `ACTIVATE (others)` rows, or to any cancelled `ACTIVATE (others)` active task?

**Only rows that had a date set when activated (i.e. "further" tasks) trigger the 36h cooldown on cancel.** A dateless `ACTIVATE (others)` row that gets cancelled can be re-set immediately.

## Q6 — Does `SET` also gain the optional date field that `ACTIVATE (others)` now has?

**Yes.** `SET` gains the same optional date field (up to 1 week out), so a one-off far-future task doesn't need to be parked in `ACTIVATE (others)` at all. `SET` never gets the persistent-identity/last-done/cooldown machinery `ACTIVATE (others)` rows carry — a `SET` task is still a one-shot write straight into `activeTasks`, nothing survives it afterward.

## Q7 — With the date field added, does `SET`'s time-selection UI change shape?

**No — the date field is a separate, independent control alongside the existing time dropdown + quick-time buttons.** When no date is picked, behaviour is unchanged from today (deadline resolves to the next occurrence of the chosen time within 24h). When a date is picked, the chosen time pairs with that specific date directly, with no "next occurrence" resolution.

## Q8 — Is `SET`'s submission currently live, given Q6/Q7 describe a fully-built-out `SET` box with the date field?

**No — submission is disabled right now** (see Q1's correction: the "set task" button is inert). Q6 and Q7 describe what `SET` looks like and how it behaves as a design — text field, time buttons, dropdown, WL/HL, and the new date field are all still fully specified and should be built exactly as described. The only thing not yet decided is when/whether submission gets turned back on, which is a separate, still-open decision.

## Q9 — Do `ACTIVATE (dailies)` rows need the same persistent-identity treatment as `ACTIVATE (others)` (a `lastDone` field, a cooldown), or do they stay pure disposable presets like today's templates?

**`ACTIVATE (dailies)` rows stay pure disposable presets, exactly like today's templates.** No `lastDone`, no cooldown, no persistent-identity tracking. Only `ACTIVATE (others)` rows carry that.

## Q10 — How does a task actually get promoted to DOLI status, and which tasks are eligible? **NOT SURE YET.**

Build the DOLI mechanics — state schema, scoring curve, per-day/per-week limits — now, but leave no UI control to actually trigger a promotion. Revisit once there's a concrete UI to look at.

## Q11 — What happens to items already in Aulists' List 0 or List 2.5 when Phase 4 ships?

**Nothing. No migration code gets written, ever (see S5).** Current chain is `["0", "1", "2", "2.5", "3", "4"]`; removing `"0"` and `"2.5"` leaves `["1", "2", "3", "4"]`, already sequential. Whatever was sitting in List 0 or List 2.5 at upgrade time is simply no longer read or written by anything; if the user wants to keep it, they export beforehand and re-import manually.

## Q12 — With `applyAutoReturn()` removed, should Aulists' whole boundary mechanism (`pushBoundary`, `isBoundary`, `pendingBoundary`, the boundary-confirm UI) come out too, since `applyAutoReturn()`'s call was its only call site?

**No — keep the boundary mechanism in Aulists even though nothing calls it anymore, in case something needs it later.**

## Q13 — Spend row: multiline text field + backdateable spend date

**Two changes to the spend row:**

- The spend row's text field needs to line-wrap / be multiline, same as every other text field in the app (see the "text fields must line-wrap when editing" item in `next-features-n-fixes.md` — this extends that same requirement to the spend row specifically, which was missed).
- Spend entries become backdateable. A spend still gets *appended* to the ledger at the position corresponding to when it was logged (creation order, same as today), but the date stamped on the entry itself can be set to a point in the past — recording when the money was actually spent, not when it was logged. This means a spend entry's stamped date and its position in the ledger array can disagree (an entry near the end of the ledger can carry an earlier date than one before it).

### Q13.1 — How does the backdated date show up in the spend entry's ledger text?

**A new second line, e.g.:**

```
new headphones
on 2026-08-03
pts = 45 - 50 = -5
```

The date line sits between the text and the `pts` line — the same position a task entry's `by` line occupies.

### Q13.2 — What's the UI for picking the spend's backdate?

**A native date-picker input, on its own new line, defaulting to today.** It sits between the "log spent points" label and the row's existing controls (text field, cost field, `[spend]` button) — not merged into that controls row.

```
┌────────────────────┐
│ Current pts: 42  ^ │
└────────────────────┘
log spent points
[ 2026-08-03 📅 ]
[ text field         ]  [cost▾]  [spend]
┌────────────────────┐
│ Current scr: 127 > │
└────────────────────┘
```

### Q13.3 — The `pts cost` field becomes a combined dropdown + text input (via `<input list>` + `<datalist>`), and shrinks in width. What values populate the dropdown's suggestions?

**Derived from history — the most frequently-used cost values, sorted by numerical value (not by frequency) in the dropdown list itself.** Top 10.

### Q13.4 — Where does the frequency data for the top-10 dropdown come from?

**A new field in state — a `spendCostCounts` map of `{cost: timesUsed}`, incremented every time `[spend]` is tapped.** Grows only with the number of *distinct* cost values ever used, not with total spend count — a repeated cost increments its existing counter rather than adding a new entry. Not derived by re-parsing ledger entry strings, consistent with how the rest of Falsedge avoids re-deriving things from pre-rendered ledger text.

## Q14 — Does the "ACTIVE TASKS" redesign wrap all task blocks in one new outer card, labelled "ACTIVE TASKS" in caps above it, with the individual task blocks nested inside losing their own glow but keeping their own border/background/colour-shifting?

**Yes.** A new outer `.card`-family wrapper (green `--glow`, halo+sheen, matching `SET`/`ACTIVATE`/`LINK`'s existing visual treatment) gets added around `.tasks`, labelled "ACTIVE TASKS" above it the same way those sections are labelled. Individual `.task-block`s stay nested inside, keep their border/background/per-position colour, but lose their own `box-shadow` glow — only the outer wrapper glows now.

### Q14.1 — Does the "(no active tasks) / `[streak broke]`" empty state render inside the new wrapper card, or does it stay outside/above it?

**Inside the wrapper card.** The wrapper always renders; when there are no active tasks, its contents are just the empty-state message + `[streak broke]` button instead of task blocks.

## Q15 — Do the refresh buttons get removed from just Falsedge, or Aulists too?

**Both.** Falsedge's header `[Refresh]` button and Aulists' own refresh button both get removed — native pull-to-refresh covers both pages now that swipe-nav capture is gone everywhere.

## Q16 — Deletable individual ledger entries. **NOT IN SCOPE FOR NOW.**

## Q17 — How should the homepage swap actually happen at the file level?

**File rename.** Current `index.html` (Aulists) is renamed to `aulists.html`, and `falsedge.html` is renamed to `index.html`. Cross-links, `manifest.json`'s `start_url`, and `sw.js`'s `SHELL` list all get updated to match the new filenames.

### Q17.1 — Two follow-ups on the file rename

- The renamed Aulists file is `aulists.html`.
- `manifest.json`'s `name`/`short_name` stay `"Aulists"` — it remains the overall umbrella app name, unchanged by which page is the entry point.

## Q18 — Swipe direction meanings on `ACTIVATE` rows (both `dailies` and `others`)

**Swipe left** (right→left) directly creates the active task, bypassing `SET` entirely, gated on all required fields being filled (see Q3/Q4 — text, WL/HL, time required; date optional for `others`). Refuses with a toast if a required field is missing.

**Swipe right** (left→right) prefills `SET` with the row's text/time/WL/HL (and date, for `others` rows), without touching the row itself or creating an active task. (This is just like the old swipe-left from phase 3.)

There is no lap/skip mechanic. No swipe bumps a row's position, no hamburger `Skip` entry, no `lap` field. `ACTIVATE (dailies)` rows sort purely by time.

## Q19 — Does the "by" label go on both the row's own time control and the adder's time control?

**Yes, both.** Same placement style as `SET`'s existing "by" label — to the left of the control. Both currently route through the shared `buildDayTimeSelect()`, so both get the label.

## Q20 — Scroll containment removal: `ACTIVATE`'s height cap, and a separate ledger scroll-lock bug

**Two distinct changes:**

- `ACTIVATE (dailies)` and `ACTIVATE (others)` both lose their internal scroll region entirely — no `max-height: 40vh`, no `overflow-y`, no `overscroll-behavior`. The section just renders at full height and the page scrolls past it.
- The ledger keeps its own internal scroll region (`max-height: 66vh` when expanded) — that part is unchanged. But `.ledger-list`'s `overscroll-behavior: contain` gets removed. That property currently blocks scroll chaining: a touch-drag starting inside the ledger list can't fall through to scroll the outer page even when the ledger has nothing left to scroll (e.g. only one entry) — the gesture just freezes instead of moving anything. Removing it restores the browser's default scroll-chaining behaviour.

## Q21 — Collapsible `ACTIVATE` sections. **NOT IN SCOPE — dropped.**

Neither `ACTIVATE (dailies)` nor `ACTIVATE (others)` gets a collapse control. Both sections always render fully expanded.

## Q22 — Does a DOLI task keep WL/HL as a leniency-scale state, applied to DOLI's own offset schedule?

**Yes.** WL/HL is a general ½-scale state, not two fixed unrelated arrays (`HL_OFFSETS` is `WL_OFFSETS` halved: `[0,10,30,60]` → `[0,5,15,30]`). DOLI defines its own whole (WL) schedule — `0/10/30/60/120/>120` minutes → `12/6/3/2/0/-6` pts — and the same halving rule applies when a DOLI task is set to HL: `0/5/15/30/60/>60` minutes, same points.

## Q23 — link to Hex2^ game? 

Already implemented. Ignore this.

## Q24 — How are the "max 1 DOLI per day / max 4 per week" limits tracked? **NOT SURE YET — the limits themselves (1/day, 4/week) aren't finalized either.**

## Q25 — DOLI's Aventurine icon

**Four chibi images, one picked at random per page load (stable through re-renders until an actual reload — not re-randomized on every `render()` call):**

- `aven-play-cards.png`
- `aven-cool.png`
- `aven-cheers.png`
- `aven-throw-money.png`

All four already sit at the project root, alongside `icon.svg`.

## Q26 — Aulists: pencil → hamburger menu, replaced with a copy-text icon

**Add an "Edit" entry to the hamburger's dropdown menu, calling the same `startEdit(li, item)` the pencil currently calls.** Replace every current `buildPencil()` call site (main list rows, Completed-list rows, and any other row type it appears on) with a new standalone copy button in that same visual slot, copying the item's text to the clipboard. Uses Falsedge's existing `COPY_ICON` SVG (the two-overlapping-rectangles glyph already used for the ledger and high-scores copy buttons) as the icon, and toasts success/failure the same way Falsedge's copy actions already do. `buildPencil()` gets renamed to something like `buildCopyBtn()` to match what it now builds — not left with a misleading name.

`buildTrashBtn()` (defined but never called anywhere — dead code from an earlier, since-abandoned refactor) gets deleted entirely while touching this area.

## Q27 — Line-wrap scope for all Falsedge text fields

**All of them.** Every single-line `<input type="text">` in Falsedge becomes multiline: `SET`'s text field, the `ACTIVATE` adder's text field, the spend row's text field, and the inline-edit inputs (active task text edit, template hamburger edit).

## Q28 — Bulk-buy in the spend row

**Row becomes `[text field] [pts cost] [×N] [spend]`.** `×N` is a new field, same combined dropdown+text-input shape as `pts cost` (via `<input list>` + `<datalist>`, per Q13.3) but with its own fixed suggestion range, 1–9, defaulting to 1. `pts cost` is per-unit; total deducted = cost × N.

