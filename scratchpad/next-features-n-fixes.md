- [Next features \& fixes](#next-features--fixes)
  - [Doc rules](#doc-rules)
    - [Block 1: Replace foo.js line 42](#block-1-replace-foojs-line-42)
    - [Block 4: Replace bar.md line 12](#block-4-replace-barmd-line-12)
    - [Block 5: changelog](#block-5-changelog)
  - [Falsedge](#falsedge)
    - [\[i19\] Delete individual ledger entries ⚪ 🟡](#i19-delete-individual-ledger-entries--)
    - [\[i21\] Daily score chart ⬜ 🟡](#i21-daily-score-chart--)
    - [\[i26\] Export all app data ⚪ 🔴](#i26-export-all-app-data--)
    - [\[i26.1\] Rename Activate (daily and others) properly ▫️](#i261-rename-activate-daily-and-others-properly-️)
    - [\[i33\] Rename the failed path ⚪](#i33-rename-the-failed-path-)
      - [\[i33.1\] Late completion pays 0.1 ▫️](#i331-late-completion-pays-01-️)
    - [\[i35\] Custom tasks (CL) ⬜](#i35-custom-tasks-cl-)
    - [\[i47\] late completion backdateable (yellow)](#i47-late-completion-backdateable-yellow)
  - [Aulists](#aulists)
    - [\[i15\] Tear down and rebuild Aulists ⬜ 🟢](#i15-tear-down-and-rebuild-aulists--)
  - [Hex 2^](#hex-2)
    - [\[i24\] Challenge mode v1 ⬜ 🟢 🆗](#i24-challenge-mode-v1---)
      - [\[i24.1\] Challenge v2 ⚪](#i241-challenge-v2-)
      - [\[i24.2\] Challenge Ultra ⚪](#i242-challenge-ultra-)
    - [\[i31\] Mobile landscape-orientation compatibility 🟢](#i31-mobile-landscape-orientation-compatibility-)
    - [\[i38\] Sticky mode ⬜ 🟢](#i38-sticky-mode--)
    - [\[i40\] Fake ad timer freezes on return from Falsedge ⚪ 🐞](#i40-fake-ad-timer-freezes-on-return-from-falsedge--)
    - [\[i43\] Challenge mode has bug due to outline ⚪ 🐞 🟢](#i43-challenge-mode-has-bug-due-to-outline---)
  - [Multi-page items](#multi-page-items)
    - [\[i46\] Grass shop ⬜](#i46-grass-shop-)
    - [\[i27\] (low priority/far future) - Server side ⬜⬜⬜ 🔵](#i27-low-priorityfar-future---server-side--)
  - [Colourcaln?](#colourcaln)
    - [\[i42\] Revive Colourcaln as a vibes tracker ⬜](#i42-revive-colourcaln-as-a-vibes-tracker-)

# Next features & fixes

## Doc rules

**D1. This is the living backlog.** It is the single place pending work is tracked. It gets edited in place as things change — not appended to, not superseded by a newer doc. No Q&A format, no discussion history, no rejected options.

**D2. Shipped items get deleted once committed, not ticked off.** When something lands in the code, its entry is removed from this doc entirely — but only after the entry itself is in a commit, since git history is what makes it findable again. There is no "done" section. The changelog in `about.html` is the record of what shipped; this doc is only what hasn't.
*This also applies to rejected options.*

**D3. One supersection per app page.** Falsedge, Aulists, Hex 2^, possibly more as more are added. Each item is a `###` heading under its page's `##`. An item that spans two pages will go in the "multi-page items" section.

**D4. Every entry describes work that has not been done.** Write each entry as an instruction to carry out, never as a statement of how things are. Where a point is genuinely undecided, say so outright rather than leaving it vague. Mark exploratory ideas as exploratory.

**D5. New input arrives as a dated update line.** Anything added to an existing item that has not yet been folded into its body goes at the end of that item as `Update YY-MM-DD:` followed by the text, verbatim. Every item carries `last consolidated: YY-MM-DD` under its heading, or `none`. Consolidating means Claude rewrites the item body so it says everything the update lines say, then deletes those lines — the user's own included — and stamps that day's date. 

**D6. The bracketed `iN` labels are IDs and nothing else.** Not priority, not chronological, not an ordering — nothing carries any of that, much less the ID. An ID is assigned once and never changes: items keep theirs when reordered or moved between sections, and a deleted item's ID is retired rather than reused. Gaps in the sequence are normal and expected. Sub-items are `iN.1`, `iN.2`, … numbered from `.1`, as `####` headings under their parent, and follow the same rules.
```
LAST USED ID: i50
(update this with every new item)
```

**D7. No backward compatibility for old data, ever.** No migration code, no accounting for old data shapes, in this phase or any future one. If data has to survive a breaking change, it gets exported, updated, and re-imported by hand.

**D8. Every item's heading ends with a tag.** ⬜ big task, ⚪ medium task, ▫️ minor or trivial to implement. 🐞 marks a bug fix rather than new work, and sits alongside a size tag rather than replacing it. Sub-items are tagged on their own merits, independently of their parent. CLAUDE DECIDES THIS TAG. I DON'T KNOW WHAT'S BIG OR SMALL THAT'S THE ENTIRE FVCKING POINT OF THE TAG HELLO????

**D9. 🆗 means buildable as-is, right now.** It is an assertion about the item's completeness — not a priority, and not the user's approval to start. It says the item can be built start to finish with no further questions asked and no assumption made that could turn out wrong: every question that *could* be asked about it has already been asked and answered. It goes last in the heading, after the priority. Its absence says nothing about importance — only that at least one detail would still have to be guessed at. A lack of an `**Undecided:**` block is *not* enough on its own to earn it, since an item can list no open questions and still leave something unwritten. Claude should suggest it if an item looks complete — then the user will demand rechecks until it comes back clean with no questions, before it can be stamped with 🆗.

**D10. Every item also carries a priority, between the size tag and 🆗.** Legend listed below. Priority is the user's call, not Claude's. So is 🆗, which Claude can only ask for (D9). It says nothing about size or readiness: a 🔴 can be ⬜ and unspecced, a 🔵 can be ▫️ and 🆗. So a full heading reads `### [iN] Title ⬜ 🔴 🆗`.

```
🔴 critical
🟠 high/medium
🟡 low but should
🟢 extra/bonus
🔵 far future
```

**D11. Claude states only the final decision about an item, not how it was reached.** This binds Claude's writing — item bodies, and consolidations. The user's own writing is the user's.

**D12. Code changes are drafted before they are written.**

- A change is written into `scratchpad/code-draft-i<N>.md` as a numbered list of blocks before any source file is touched.
- Nothing is applied until the user says to apply it, and then every block lands in one turn, so line numbers stay accurate for the draft's whole life. Whatever is the latest edited version is what's applied.
- Comments run heavy in a draft; the user cuts them there.
- Trivial one-line changes can skip the draft file; use an in-line (in chat convo) version. 
- The file can be flagged for deletion once the change is committed, on the same rule as D2. (ONLY THE USER CAN DELETE FILES)

- Blocks never touch or overlap.
- Changes on adjacent lines merge into one Replace covering them all.
- Every line quoted as context is a line in the file as it stands now, never one another block introduces.
- A horizontal rule separates each block from the next.
- The start of the file should have a last updated timestamp, just after the title, in order to tell if the file has become stale (target files could've been modified in the meantime).

- Each block opens with an `###` heading numbering it, so the draft carries an outline to jump through and a block can be named out loud.
- The file and line range are always a markdown link.
- Source code goes in code blocks; markdown content goes in quote blocks.

Use the replace format, including enough context before AND after any insertions, changes, or deletions:

---

### Block 1: Replace [foo.js line 42](../foo.js#L42)

```js
  var foo = 5;
  var LIMIT = 10;
  var bar = 10;
```

With:

```js
  var foo = 5;
  var LIMIT = 20;
  var bar = 10;
```

---

A block against a markdown file takes quote blocks instead:

---

### Block 4: Replace [bar.md line 12](bar.md#L12)

> **Old heading.** The sentence as it stands today.

With:

> **New heading.** The sentence as it should read instead.

---

The last block of a code draft should be its changelog entry:

---

### Block 5: changelog

increment: +0.0.1

- The limit is 20 now instead of 10.

---

## Falsedge

### [i19] Delete individual ledger entries ⚪ 🟡
last consolidated: 26-08-16

An entry can be deleted on its own. Today the only way anything leaves `state.ledger` is `splice(0, batch.count)` after a copy-export, so a wrong entry is stuck the moment undo can no longer reach back to it.

Deletion runs through `pushUndo()` like every other mutation, so it lands in the undo timeline, which now outlives the session.

**Undecided:** the control's shape and where it hangs off the entry box, and whether it needs a confirm step given deletion is undoable.

### [i21] Daily score chart ⬜ 🟡
last consolidated: 26-08-15

At 00:00 each day, record the day's score into a history array, then draw a line chart over those records.

**Undecided:** whether points are recorded alongside score, how a 00:00 snapshot fires at all given the page only runs while open (most likely: on load, backfill every midnight that has passed since the last record), how far back the chart shows, and whether it lives on the Falsedge page or behind a link.

### [i26] Export all app data ⚪ 🔴
last consolidated: 26-08-15

A full Falsedge state export — templates, ledger, points, scores, the lot — so data survives a device change or a breaking schema change without being retyped. D7 makes this load-bearing rather than a nicety: with no migration code ever, export → hand-edit → re-import is the *only* path through a schema change.

Aulists already has exactly this and is the model to copy: `exportJSON()` (`JSON.stringify(state, null, 2)`), an export-to-textarea button, an export-to-file button, `importFromText()` behind a confirm that replaces state wholesale, and a `lastExported` stamp with a "last exported" note. Falsedge gets the same set, running through its own `normalise()` on import for the same reason Aulists does.

### [i26.1] Rename Activate (daily and others) properly ▫️

26-10-02  
Right now the storage variables can't be renamed or it will orphan the data. once the export is available, we can modify the data directly, then change the current variables "templates" and "others to "dailies" and "queueds"

### [i33] Rename the failed path ⚪
last consolidated: none

update 26-09-11:  
changed from kill to rename. bcuz "failed" doesn't sound right but "late completion" needs better distinguishing from "late but within the leniency" vs "late and outside leniency" and we can't just call it "late and outside leniency" OBVIOUSLY we need an actual TERM HERE.

#### [i33.1] Late completion pays 0.1 ▫️
last consolidated: 26-09-17

Completing a task after its final leniency tier has passed awards **0.1**. Cancelling still awards nothing. That difference is the whole point: the task was done, just too late to score properly.

The 0.1 lands on `scr`, which is a float. `pts` is an integer, so ten of them have to stack before a whole point surfaces — the same carry `awardGoldenSet` already does.

Completing within **24h past the deadline** awards the 0.1. Past 24h, nothing.

### [i35] Custom tasks (CL) ⬜
last consolidated: 26-08-22

A third leniency setting beside WL and HL, on the same row: **CL**, custom leniency. Choosing it creates a *custom task*, which structurally is just the existing Set block with the deadline and leniency requirements dropped.

- The body is a single multiline free-text field. Nothing else is required.
- While active, `complete now` reads **`complete now for [__] pts`**. __ is a suggest field — typed or picked — offering `1 2 3 4 5 6 8 10 12`.
- the [__] defaults to blank. Completing with it blank awards 0. That is almost always a mistake, and undo covers it.
- Cancel behaves normally.
- A date may still be set, but it is **ordering only**: it places the task among the active tasks and drives nothing else. No deadline, no tiers, no scoring. This replaces the earlier pin-to-top / pin-to-bottom idea, which is dropped as strictly more work for the same result.
- `CL` joins the leniency legend comment in `falsedge.js` beside WL, HL, NL.

### [i47] late completion backdateable (yellow)

update 26-09-12  
I just want this for more accurate backdating smh. tapping the small "completed before" text opens a date and time picker.

## Aulists

### [i15] Tear down and rebuild Aulists ⬜ 🟢
last consolidated: 26-08-22

Replaces this item's previous contents wholesale rather than extending them. Recurrence, the list 2 → 1 promotion, `applyAutoReturn()` and all auto-move / auto-reprioritize, and the randomizer are all removed. **List 0 stays** — the earlier plan deleted it.

**The new model is decay, not a to-do list.** Every item enters at list 0. One week after it was added it drops to list 1, and one list further every week after that. The clock is per item, measured from its own add time, and evaluated on page load — no timer, no scheduler.

Swipe up stays: an item that has fallen can be pulled back by hand when it is remembered. Swipe down is removed. Nothing descends except by aging.

"Going going gone" rather than a task list.

Swipe-between-lists navigation stays. So does the boundary mechanism (`pushBoundary`, `isBoundary`, `pendingBoundary`, the boundary-confirm UI), unused, in case it is wanted later.

**Undecided:** the name. This is arguably not Aulists any more, and "falling" shares a stem with Falsedge, but `Fallists` reads as fallacies or worse. It stays Aulists for now on the grounds that something automatic is still happening, so `au-` half-earns itself.

Also undecided: the previous version of this item carried several UI changes that the teardown does not mention either way — the pencil leaving the main view for an "Edit" entry in the hamburger, every `buildPencil()` call site becoming a copy button using Falsedge's `COPY_ICON`, and deleting the dead `buildTrashBtn()`. They were decided, then written over. Unclear whether they survive the rebuild.

update 26-09-13:  
NOTE that aulists as it currently stands is STALE AND DEAD. this proposed version is just a vague 'maybe' and is the only reason Aulists isn't totally disconnected at the moment but CLAUDE SHOULD TREAT AULISTS LIKE IT'S DEAD FOR NOW. PARKED IN THE FRIDGE. Any links or references to it should be ignored, NOT treated as something to consider nor design around nor refer to nor ANYTHING.

## Hex 2^

### [i24] Challenge mode v1 ⬜ 🟢 🆗
last consolidated: 26-08-22

**Shipped.** Deliberately not deleted per D2 — it is kept as the parent for i24.1 and i24.2, which are defined as changes against it. Everything below is the record of what is live, not pending work.

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

#### [i24.1] Challenge v2 ⚪
last consolidated: 26-08-23

v1 with two changes, standing as its own mode rather than an edit to v1. v1 keeps its current behaviour exactly.

**Jostles spawn a `1`.** Every jostle drops a literal `1` tile onto the board — 1 + 1 = 2, so it feeds the normal progression from below instead of sitting outside it. Jostling now costs something, so it no longer needs rate-limiting: the 32-swipe jostle cooldown idea is dropped. v1's no-two-jostles-in-a-row rule still stands — a live swipe is what re-arms the jostle.

**Hearts pay for jostles only.** A regular undo is free and is never blocked, at any heart count. A heart is spent only when the undo steps back *across* a jostle. The undo button is disabled only when hearts are 0 **and** the last move was a jostle. This is the correction to v1, where every undo costs a heart and zero hearts greys the button outright.

**Undecided:** what the spawned `1` does when the board is full.

#### [i24.2] Challenge Ultra ⚪
last consolidated: 26-08-22

v2 with the safety net removed. No hearts and no undo at all. Every jostle spawns a random tile, `1` or `2`, at even odds.

### [i31] Mobile landscape-orientation compatibility 🟢
last consolidated: none

game is broken in landscape right now but like whateverrr i dont play in landscape so who caaaares

### [i38] Sticky mode ⬜ 🟢
last consolidated: 26-08-22

One tile is stuck: it does not move, does not merge, and the rest of the board slides around it.

Rough shape — every 6 swipes a new tile is chosen and holds until the next changeover. The upcoming sticky tile is indicated ahead of the swap.

Deliberately silly.

**Undecided:** whether the interval is really 6, what the indicator looks like, what happens when the stuck tile is the only thing that could have moved, and whether it stacks with any challenge tier.

### [i40] Fake ad timer freezes on return from Falsedge ⚪ 🐞
last consolidated: 26-08-22

Coming back to Hex 2^ from Falsedge leaves the fake ad's countdown stopped — the ring stops filling and the × never arrives, so the lockout has no exit.

**Undecided:** the cause is not diagnosed. Two candidates: the `visibilitychange` handler early-returns on `fakeAdReady || !lockout.classList.contains("show")`, and the countdown rides a `requestAnimationFrame` chain, which a backgrounded page suspends and does not necessarily resume. A plausible fix is driving it from a `setInterval` that recomputes against the stored end time, so a missed tick self-heals — but that is a guess ahead of actually reproducing it.

### [i43] Challenge mode has bug due to outline ⚪ 🐞 🟢  
last consolidated: none

update 26-08-27:  
sent the game to a friend who reported that the challenge mode is broken; tiles don't show up at all. the board is empty. he said there's no red outline. so evidently the outline is breaking things.

## Multi-page items

### [i46] Grass shop ⬜
last consolidated: 26-09-01

A second currency. Grass is earned in Hex 2^ and spent on Falsedge things, so it belongs to neither page alone.

**Earning.** One grass per fake ad waited out. The × only becomes tappable once the countdown finishes, so every × is a completed wait and there is no partial credit.

`+1` and the grass icon sit **beside the ×** for the whole wait, not as a popup afterwards — a promise rather than a receipt, so the notice costs none of the 30 seconds of game that follow. Tapping the × pops the whole `+1 [grass]` as one unit, then lets through to the board.

Use `assets/icon-grass.svg`, already drawn: overlapping blades in five emerald greens rising from a flat bottom edge, back layer darkest.

**Spending.**

- **60 grass buys 1 pt.**
- **Lockdown reduction**, an unset amount of grass per hour taken off. Applies to any lockdown, not one in particular: the 36h streak-break lockdown, the 36h cancel cooldown on a dated `others` row, and whatever else grows one later.
- More exchanges, not yet decided.

Update 26-09-27

grass shop:
- 60 grass -> 1pt
- 60 grass -> bypass a lockdown or cooldown to set 1 task
- (n = 1; for each edit, n++) grass -> modify existing task's deadline or text. (as in, initial edit cost is 1; for each edit, the cost increases by 1, so the cost each time would be 1, then 2, then 3, etc.)

note on grass sources:  
- 'watch' 1 fake-ad, 11/12: +1 grass
- 'watch' 1 fake-ad, 1/12: +2 grass
- reach any 16384 tile: +16 grass

### [i27] (low priority/far future) - Server side ⬜⬜⬜ 🔵
last consolidated: none

Storing data in server instead of locally. Would need to buy/rent server space or something... idk.

two goals, kind of separate priorities - might aim for 1 before 2...

1. cross-device syncing so I can update stuff from my pc instead of always being forced to use phone only
2. commercializing (extremely far future)

## Colourcaln?

### [i42] Revive Colourcaln as a vibes tracker ⬜
last consolidated: 26-08-22

Not the per-day thing it was. Check in at any time, as often as wanted, and log where the vibes sit — positive or negative. Readings drift back toward neutral on their own over a few hours, so what is on screen always reflects something recent rather than a stale entry.

Several independent axes rather than one score: creativity, general mood, anxiety, and others not yet listed.

**Undecided:** essentially all of it — the decay rate and curve, the input control, the full axis list, whether this is a fourth page or lives inside an existing one, and whether the name survives (hence the question mark on the section).
