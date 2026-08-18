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

**D9. 🆗 means buildable as-is, right now.** It is Claude's assertion about the item's completeness — not a priority, and not the user's approval to start. It says the item can be built start to finish with no further questions asked and no assumption made that could turn out wrong: every question that *could* be asked about it has already been asked and answered. It goes last in the heading, after the priority. Its absence says nothing about importance — only that at least one detail would still have to be guessed at. A lack of an `**Undecided:**` block is *not* enough on its own to earn it, since an item can list no open questions and still leave something unwritten. Claude adds it; anything that raises a new question about the item strips it again.

**D10. Every item also carries a priority, between the size tag and 🆗.** Legend listed below. Priority is the user's call, not Claude's — Claude assigns 🆗, the user assigns the colour. It says nothing about size or readiness: a 🔴 can be ⬜ and unspecced, a 🔵 can be ▫️ and 🆗. So a full heading reads `### [iN] Title ⬜ 🔴 🆗`.
🔴 critical
🟠 high/medium
🟡 low but should
🟢 extra/bonus
🔵 far future

## Falsedge

### [i5] DOLI (Double Or Lose It) mechanism ⬜ 🔴

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

A promoted task is frozen. Neither edit overlay is attached to it: not `edit time?` on `.tier-rows`, which also carries the date row, and not the text editor on `.task-text-row`. Text, clock time, date and WL/HL are all fixed at the moment of promotion. Without that, a promoted task could have its deadline pushed out and collect 12 points for nothing.

**Limits.** Promoting costs nothing — there is no cooldown on *setting* a DOLI task. Two limiters instead:

- **Concurrent cap.** At most `floor(doliLimit)` DOLI tasks may be active at once. `doliLimit` starts at `1`, floors at `1`, and has no ceiling. A completed DOLI adds `+0.2`; a cancelled or failed one subtracts `-0.5`.
- **Cancel cooldown.** Cancelling/failing a DOLI task starts a **6 hour** cooldown during which nothing can be promoted. Completing a DOLI task immediately clears a running cooldown.

A DOLI task cancelled from a dated `others` row takes **both** penalties: the existing 36h `COOLDOWN_MS` lock on that row, and the 6h DOLI cooldown. They are different scopes — the row lock stops re-activating that row, the DOLI cooldown stops promoting anything at all.

The square is inert while a cooldown is running or the concurrent cap is already met, so at rest it sits permanently fully lit — a closed ring is the normal state, not a special one.

**Undecided:** the tier system only has four rungs. `tierList()` zips `WL_OFFSETS`/`HL_OFFSETS` against `TIER_POINTS`, all length four, and `liveTierIndex()` returns `-1` past the last one, which every caller reads as "failed, award 0". DOLI's table needs six rungs and a `-6`, so both functions need a second shape and `-1` stops meaning what it means today.

Negative awards have never run through `resolveTask()`. `taskEntryText()` branches on `award > 0 && ptsDelta === 0` and has no case for a negative, so the ledger line for a `-6` is unwritten.

### [i13] Swap homepage to Falsedge ⚪ 🟡 🆗

Done as a file rename. The current `index.html` (Aulists) becomes `aulists.html`, and `falsedge.html` becomes `index.html`. Cross-links, `manifest.json`'s `start_url`, and `sw.js`'s `SHELL` list all get updated to match the new filenames.

`manifest.json`'s `name` and `short_name` stay `"Aulists"` — it remains the overall umbrella app name, unchanged by which page is the entry point.

### [i14] Complex tasks ⬜

#### [i14.1] Multipliers and bonuses (exploratory) ⬜ 🟢

Vague idea — support for multipliers on tasks, conditional on something unspecified. Not fleshed out.

#### [i14.2] Event-anchored deadlines ⬜ 🟡

A task can be set whose deadline isn't known at set time, because it hangs off an event that hasn't happened yet — "within 1h of check phone after wake", "within 1h of getting home (chimer resumes)". The event's real time is entered manually later, and the deadline is computed from it: enter `19:37` and the deadline resolves to `20:40`.

**Undecided:** nearly all of it. The `19:37` → `20:40` example is +1h and then rounded up to the next 10-minute mark, which matches the app's existing 10-minute offset granularity, but that rounding rule was never stated outright. Also open: where the anchor phrase is authored, what the task displays before its event time is entered, whether the offset is fixed at 1h or configurable per task, whether scoring runs from the resolved deadline exactly as a normal task's does, and what happens if the event time is never entered at all.

### [i16] Micro tasks (NL) ⬜ 🟠

A second, smaller class of task. `NL` (no leniency) *is* the micro-task marker — tagging an item NL hands it the whole package rather than only switching leniency off, so there is no separate "micro" toggle to set.

- Worth +1 point, flat.
- One hard deadline. No WL/HL ladder, no offsets, no partial credit: on time or 0.
- Can come as a set sharing a single deadline, each member checked off individually.
- Can live in templates, dailies and others alike.
- Can be attached to another item. Swiping that item into an active task activates its whole micro-task set alongside it — and that is the *only* link between them. Cancelling or editing the parent afterwards does nothing to the set; the attachment is a swiping convenience, not a dependency.
- Cancelling works at either granularity: one micro task on its own, or the whole set at once.
- DOLI does not apply to micro tasks — a +1 task is not worth a gamble slot.

### [i17] Time since last active task ⚪ 🟠

A readout of how long there has been nothing active at all. It counts from the last task's *deadline*, not from when that task was resolved: a task due at 0:00 that went uncancelled until 8:00 shows `8h` the moment it clears, not `0h`.

Computed at render and refreshed only by a page refresh. Deliberately allowed to go stale in between — no `setInterval`, no live ticking.

**Undecided:** where on the page it sits, and its exact wording.

### [i19] Delete individual ledger entries ⚪ 🟡

An entry can be deleted on its own. Today the only way anything leaves `state.ledger` is `splice(0, batch.count)` after a copy-export, so a wrong entry is stuck the moment undo can no longer reach back to it.

Deletion runs through `pushUndo()` like every other mutation, so it lands in the undo timeline, which now outlives the session.

**Undecided:** the control's shape and where it hangs off the entry box, and whether it needs a confirm step given deletion is undoable.

### [i21] Daily score chart ⬜ 🟡

At 00:00 each day, record the day's score into a history array, then draw a line chart over those records.

**Undecided:** whether points are recorded alongside score, how a 00:00 snapshot fires at all given the page only runs while open (most likely: on load, backfill every midnight that has passed since the last record), how far back the chart shows, and whether it lives on the Falsedge page or behind a link.

### [i26] Export all app data ⚪ 🔴

A full Falsedge state export — templates, ledger, points, scores, the lot — so data survives a device change or a breaking schema change without being retyped. D7 makes this load-bearing rather than a nicety: with no migration code ever, export → hand-edit → re-import is the *only* path through a schema change.

Aulists already has exactly this and is the model to copy: `exportJSON()` (`JSON.stringify(state, null, 2)`), an export-to-textarea button, an export-to-file button, `importFromText()` behind a confirm that replaces state wholesale, and a `lastExported` stamp with a "last exported" note. Falsedge gets the same set, running through its own `normalise()` on import for the same reason Aulists does.


## Aulists

### [i15] Strip down Aulists ⬜ 🟡

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

### [i24] Challenge mode ⬜ 🟢 🆗

A third mode alongside normal and jiggly, in a new `hex2-challenge.js`. Branches off normal in the code sense — it copies `hex2-base.js`'s slide-then-pop animation model, not jiggly's continuous wobble. Own save key (`hex2.challenge.save`, matching the naming the rename settles on rather than the `hexadecimal.*` keys it replaces), shares the high score table with the other modes.

The mode button cycles normal → challenge → jiggly → normal.

**The jostle.** A swipe where `applyMove().moved === false` jostles the board: one explosion-like jolt, a white flash that fades out, and **every tile is shuffled into a new cell**. The multiset is untouched — positions only, no spawn, no score change.

A jostle pushes an undo snapshot. This is the one place in the codebase where something other than `commit()` snapshots.

**Hearts.** Three to start. Nothing else in the mode costs a heart — **only undo does, at 1 heart per use**. The jostle is free; undoing it is what you pay for. That is the whole tension: flailing costs nothing directly, but the board it leaves you is bad enough that you buy your way back, and the buying is finite. At zero hearts the undo button simply greys out. Hearts are undo currency, not a life bar — challenge mode adds no new way to die beyond a jostle that scrambles the board dead.

A merge that lands on a **2048** tile grants +1 heart, up to a hard cap of 5. A 2048 earned at 5 grants nothing. Detected off `mergedDests` at commit time, so there is no counter to persist — a 2048 exists only because two 1024s merged.

Hearts sit outside the undo snapshot. They must not rewind, or undo would refund its own cost. They *are* written to the save blob, so a run survives the app closing exactly as the board and score do. `reset()` puts them back to three.

**Display.** A box on the undo button's row, left of the button and also right aligned (slight gap in between undo and itself).

The box carries no label, only the glyphs, and is **fixed size** — wide enough for five, with the glyphs **left aligned** inside it, so it never resizes or shifts the undo button as hearts come and go. It takes the panel styling the rest of the header uses: `--hex-panel-2` fill, `--hex-line` border, the same 12px radius and 40px min-height as `.hexbtn`, so it sits level with the button beside it.

The glyphs are the text characters **♥ (U+2665)** filled and **♡ (U+2661)** empty — not emoji. Both states are `var(--hex-accent)`. They sit a little larger than the button text, around 16px against `.hexbtn`'s 13px, with the box's vertical padding reduced to match, so the glyphs fill it without making it taller than its neighbour.

Three base slots are always drawn, filling with ♡ as they empty; hearts above three appear as extra ♥ on the end. 

It updates instantly on gain or loss, with no animation. It does not exist at all in normal or jiggly mode — not greyed, not empty, absent.

```
0  ♡ ♡ ♡
1  ♥ ♡ ♡
2  ♥ ♥ ♡
3  ♥ ♥ ♥      start
4  ♥ ♥ ♥ ♥
5  ♥ ♥ ♥ ♥ ♥  cap
```

**The shuffle uses the existing seeded `rng`,** not `Math.random`, so it snapshots with everything else.

**No two jostles in a row.** A jostle disarms itself: the next dead swipe is a silent no-op, exactly as in normal mode. Any live swipe re-arms it.

**The jolt is an impact, not a wobble.** One large displacement, one much smaller counter-swing, over in about 250ms. No sustained oscillation, no squash, no rotation. Do not reuse jiggly's `BLOCK_*` curve — that is a 520ms damped quiver with `BLOCK_SQUASH` and `BLOCK_ROT` on top, and copying it gives jiggly with a flash on it.

The white flash covers the canvas only, not the whole viewport.

**A jostle re-runs the game-over check.** A shuffle can scramble a live board into one with no legal moves, and with consecutive jostles blocked there is no way out of that, so the run has to end there. Reaching it is very unlikely — a full board is hard to get to in this game at all — but without the check the run would neither end nor continue.

**This is not only a new file — `hex2-core.js` needs three changes.** `snapshot()` is not on the `Hex2` export list and has to be, or a jostle cannot push an undo entry. `updateUndo()` is `undoBtn.disabled = history.length === 0` and has to consult `mode.canUndo` too, or at zero hearts the button looks live and silently does nothing. `save()` and `load()` write a fixed field list and need a way to carry hearts. `mode.onUndo` and `mode.onReset` already exist and fire where hearts need to change.

### [i31] Mobile landscape-orientation compatibility 🟢
game is broken in landscape right now but like whateverrr i dont play in landscape so who caaaares

## Multi-page items

### [i30] A Falsedge action clears the ad ⬜

**The link is never locked.** "Go to Hex 2^" always works and is never greyed. No counter on it, no currency, no stacks, no spending.

**The rule.** Falsedge snapshots `undoPointer` on page load and compares it when the Hex 2^ button is tapped. If it changed, an existing lockout is cleared. If it did not, nothing happens.

```
mid-play, no lockout -> Falsedge -> back: fresh 30s, nothing carried
lockout already up   -> Falsedge -> back: still locked, ad restarted (unless it's been >10 mins)
lockout already up   -> Falsedge -> did something -> back: cleared
```

It only ever dismisses a lockout that already existed when you left. It is not credit against a future one, and leaving mid-play still costs nothing — the break resets exactly as it does today.

`undoPointer` is the counter because `pushUndo` increments it and `undo` decrements it, so an action that gets undone nets zero. It never wraps — only the slot index does, via `n % UNDO_RING_SIZE`.

**Closing the navaway loophole.** Today `.navaway` sets `BREAK_KEY` to `"0"`, which clears a live lockout outright, so walking out of one and straight back in grants a clean 30s. That stops working: a lockout that was up when you left is still up when you return, with its ad restarted. Walking out of a lockout is no longer an escape from it. Walking out mid-play is unaffected.

**Or wait it out.** Staying in Falsedge until a timer expires also clears the ad. The timer restarts from scratch on every page load, so it only rewards one continuous sitting. It is deliberately **not** displayed in Falsedge — no countdown, no ring, no animation. Falsedge stays quiet.

**The 10-minute mercy.** If the app was hidden for 10 minutes or more, the fake ad is skipped entirely: the lockout still appears, but with the × available immediately. Flat rate, measured from the moment the page was hidden, and it applies no matter what state things were in — whether an ad was already on screen when you left, or the break only expired while you were gone. Under 10 minutes the current behaviour stands, and the same roll restarts from the top.

**Undecided:** the wait-it-out timer's length, and whether that path survives at all now that a single action is enough. Also open: whether a redo should count, since it moves the pointer forward too.

### [i27] (low priority/far future) - Server side ⬜⬜⬜ 🔵

Storing data in server instead of locally. Would need to buy/rent server space or something... idk