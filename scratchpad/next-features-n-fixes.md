- [Next features \& fixes](#next-features--fixes)
  - [Doc rules](#doc-rules)
    - [Block 1: Replace foo.js line 42](#block-1-replace-foojs-line-42)
    - [Block 2: Remove foo.js lines 55-57](#block-2-remove-foojs-lines-55-57)
    - [Block 3: Add at foo.js line 88](#block-3-add-at-foojs-line-88)
    - [Block 4: Replace bar.md line 12](#block-4-replace-barmd-line-12)
    - [Block 5: changelog](#block-5-changelog)
  - [Falsedge](#falsedge)
    - [\[i5\] DOLI (Double Or Lose It) mechanism ⬜ 🟢](#i5-doli-double-or-lose-it-mechanism--)
    - [\[i14\] Complex tasks ⬜](#i14-complex-tasks-)
      - [\[i14.1\] Multipliers and bonuses (exploratory) ⬜ 🟢](#i141-multipliers-and-bonuses-exploratory--)
      - [\[i14.2\] Event-anchored deadlines ⬜ 🟡](#i142-event-anchored-deadlines--)
      - [\[i14.3\] Micro tasks (NL) ⬜ 🟠](#i143-micro-tasks-nl--)
        - [\[i14.3.1\] Micro tasks - beta/simplified version](#i1431-micro-tasks---betasimplified-version)
      - [\[i14.4\] Tasks with secondary/minor (name/vocab uncertain) tasks ⬜](#i144-tasks-with-secondaryminor-namevocab-uncertain-tasks-)
    - [\[i19\] Delete individual ledger entries ⚪ 🟡](#i19-delete-individual-ledger-entries--)
    - [\[i21\] Daily score chart ⬜ 🟡](#i21-daily-score-chart--)
    - [\[i26\] Export all app data ⚪ 🔴](#i26-export-all-app-data--)
    - [\[i33\] Rename the failed path ⚪](#i33-rename-the-failed-path-)
    - [\[i35\] Custom tasks (CL) ⬜](#i35-custom-tasks-cl-)
    - [\[i45\] Queue ⬜ 🔴](#i45-queue--)
    - [\[i47\] new 0.1 pts scoring ▫️ 🟡](#i47-new-01-pts-scoring--)
  - [Aulists](#aulists)
    - [\[i15\] Tear down and rebuild Aulists ⬜ 🟡](#i15-tear-down-and-rebuild-aulists--)
  - [Hex 2^](#hex-2)
    - [\[i24\] Challenge mode v1 ⬜ 🟢 🆗](#i24-challenge-mode-v1---)
      - [\[i24.1\] Challenge v2 ⚪](#i241-challenge-v2-)
      - [\[i24.2\] Challenge Ultra ⚪](#i242-challenge-ultra-)
    - [\[i31\] Mobile landscape-orientation compatibility 🟢](#i31-mobile-landscape-orientation-compatibility-)
    - [\[i38\] Sticky mode ⬜ 🟢](#i38-sticky-mode--)
    - [\[i40\] Fake ad timer freezes on return from Falsedge ⚪ 🐞](#i40-fake-ad-timer-freezes-on-return-from-falsedge--)
    - [\[i43\] Challenge mode has bug due to outline ⚪ 🐞 🟢](#i43-challenge-mode-has-bug-due-to-outline---)
  - [Multi-page items](#multi-page-items)
    - [\[i41\] Cooldown on the Go to Hex 2^ button ⚪](#i41-cooldown-on-the-go-to-hex-2-button-)
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
LAST USED ID: i47
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

**D12. Code changes are drafted before they are written.** A change is written into `scratchpad/code-draft-i<N>.md` as a numbered list of blocks before any source file is touched. Nothing is applied until the user says to apply it, and then every block lands in one turn, so line numbers stay accurate for the draft's whole life. Comments run heavy in a draft; the user cuts them there. The draft file is what gets applied, whoever last edited it. Trivial one-line changes skip this. The file is deleted once the change is committed, on the same rule as D2.

Blocks never touch or overlap. Changes on adjacent lines merge into one Replace covering them all. Every line quoted as context is a line in the file as it stands now, never one another block introduces. A horizontal rule separates each block from the next.

Each block opens with an `###` heading numbering it, so the draft carries an outline to jump through and a block can be named out loud. The file and line range are always a markdown link. Source code goes in code blocks; markdown content goes in quote blocks. Three block shapes:

---

### Block 1: Replace [foo.js line 42](../foo.js#L42)

```js
  var LIMIT = 10;
```

With:

```js
  var LIMIT = 20;
```

---

### Block 2: Remove [foo.js lines 55-57](../foo.js#L55-L57)

```js
  if (!widget) {
    return null;
  }
```

---

### Block 3: Add at [foo.js line 88](../foo.js#L88)

Just prior:

```js
  save();
```

Added:

```js
  render();
```

Just after:

```js
  toast("done");
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

### [i5] DOLI (Double Or Lose It) mechanism ⬜ 🟢
last consolidated: 26-08-22

Ships complete: state schema, scoring curve, limits, and the promotion control itself.

**Scoring.** WL/HL is a general ½-scale state, not two fixed unrelated arrays (`HL_OFFSETS` is `WL_OFFSETS` halved: `[0,10,30,60]` → `[0,5,15,30]`). DOLI defines its own whole (WL) schedule, and the same halving rule applies when a DOLI task is set to HL:

```
WL  minutes past deadline:  0   10   30   60   120   >120
HL  minutes past deadline:  0    5   15   30    60    >60
    points:                12    6    3    2     0     -6
```

(0 means completed on time / within deadline.) The key difference from a normal task: instead of just becoming 0, there's only a 1-hour window at 0 before it drops straight to -6.

**Early bonus.** A DOLI task completed early awards **+1** per whole 24h ahead of its deadline, against a normal task's +2. The base 12 is high enough that the normal rate compounds too fast on top of it.

**Visual.** A promoted task shows a 64px Aventurine chibi in its own block, in the empty space to the right of the `by X for X pts` lines, vertically centred against that whole group of rows. Four images, one picked at random per page load and stable through re-renders until an actual reload: `assets/aven-play-cards.png`, `assets/aven-cool.png`, `assets/aven-cheers.png`, `assets/aven-throw-money.png`.

**Promotion control.** A 32px rounded square, 10px radius, containing `assets/arrow-promo.svg` at 20px. It exists exactly once on the page, in the `ACTIVE TASKS` wrapper header (`#tasksCard`).


The square carries no CSS border. Its outline is an SVG rounded rect drawn twice: a flat grey base ring, and a glowing ring over it carrying `pathLength="100"` with a `stroke-dasharray` driven by cooldown progress, so the outline traces itself clockwise from the top-left corner as the cooldown elapses. The glowing stroke takes the wrapper's `--glow`, which is `var(--c-green)`. A closed loop means ready, a partial arc means still cooling, and there is no interior fill at any point.

Tapping the square enters pick mode: every active task block gets a full-block overlay reading `select` — the existing `.edit-overlay` treatment reparented to `.task-block`, which is already `position: relative` and so needs no other change. Tapping a block promotes it. Tapping the square again, or anywhere that isn't a task block, leaves pick mode without promoting anything.

Promotion is irreversible. Undo is the only way back, and otherwise the only exit is cancelling the task outright — the mechanic is a gamble on commitment, so there is no un-promote.

A promoted task is frozen. Neither edit overlay is attached to it: not `edit time?` on `.tier-rows`, which also carries the date row, and not the text editor on `.task-text-row`. Text, clock time, date and WL/HL are all fixed at the moment of promotion. Without that, a promoted task could have its deadline pushed out and collect 12 points for nothing.

**Limits.** Promoting costs nothing at the moment of promotion. Two limiters instead:

- **One per calendar day.** At most one task may be promoted per calendar day. What becomes of it afterwards does not matter — completing, cancelling or failing it does not buy the day back.
- **Concurrent cap.** At most `floor(doliLimit)` DOLI tasks may be active at once. `doliLimit` starts at `1`, floors at `1`, and has no ceiling. A completed DOLI adds `+0.2`; a cancelled or failed one subtracts `-0.5`.

A DOLI task cancelled from a dated `others` row still takes the existing 36h `COOLDOWN_MS` lock on that row. Different scope — the row lock stops re-activating that row, the daily limit stops promoting anything at all.

The square is inert once the day's promotion is spent or the concurrent cap is met.

**Undecided:** the tier system only has four rungs. `tierList()` zips `WL_OFFSETS`/`HL_OFFSETS` against `TIER_POINTS`, all length four, and `liveTierIndex()` returns `-1` past the last one, which every caller reads as "failed, award 0". DOLI's table needs six rungs and a `-6`, so both functions need a second shape and `-1` stops meaning what it means today.

Negative awards have never run through `resolveTask()`. `taskEntryText()` branches on `award > 0 && ptsDelta === 0` and has no case for a negative, so the ledger line for a `-6` is unwritten.


### [i14] Complex tasks ⬜

#### [i14.1] Multipliers and bonuses (exploratory) ⬜ 🟢
last consolidated: 26-08-15

Vague idea — support for multipliers on tasks, conditional on something unspecified. Not fleshed out.

#### [i14.2] Event-anchored deadlines ⬜ 🟡
last consolidated: 26-08-16

A task can be set whose deadline isn't known at set time, because it hangs off an event that hasn't happened yet — "within 1h of check phone after wake", "within 1h of getting home (chimer resumes)". The event's real time is entered manually later, and the deadline is computed from it: enter `19:37` and the deadline resolves to `20:40`.

**Undecided:** nearly all of it. The `19:37` → `20:40` example is +1h and then rounded up to the next 10-minute mark, which matches the app's existing 10-minute offset granularity, but that rounding rule was never stated outright. Also open: where the anchor phrase is authored, what the task displays before its event time is entered, whether the offset is fixed at 1h or configurable per task, whether scoring runs from the resolved deadline exactly as a normal task's does, and what happens if the event time is never entered at all.

#### [i14.3] Micro tasks (NL) ⬜ 🟠
last consolidated: 26-08-15

A second, smaller class of task. `NL` (no leniency) *is* the micro-task marker — tagging an item NL hands it the whole package rather than only switching leniency off, so there is no separate "micro" toggle to set.

- Worth +1 point, flat.
- One hard deadline. No WL/HL ladder, no offsets, no partial credit: on time or 0.
- Can come as a set sharing a single deadline, each member checked off individually.
- Can live in templates, dailies and others alike.
- Can be attached to another item. Swiping that item into an active task activates its whole micro-task set alongside it — and that is the *only* link between them. Cancelling or editing the parent afterwards does nothing to the set; the attachment is a swiping convenience, not a dependency.
- Cancelling works at either granularity: one micro task on its own, or the whole set at once.
- DOLI does not apply to micro tasks — a +1 task is not worth a gamble slot.

##### [i14.3.1] Micro tasks - beta/simplified version

update 26-08-30

Keeping only the "NL" and 1 pt part, the rest of the task looks exactly the same as other tasks. Thus, selecting "NL" (with the buttons being WL | HL | NL) would simply have a task with only 1 deadline (no leniency) and 1 pt score.

...actually no wait now I can't decide if I want this to be "2 pts / 1 pts leniency" but idk what I'd call that... ugh.

update 26-09-01

2 pts at deadline. 1 pts for 1h late. the button is changed from NL to MT (micro task). also, is there still a comment somewhere about ML (mega leniency)? get rid of that... delete that and update with the new MT.

#### [i14.4] Tasks with secondary/minor (name/vocab uncertain) tasks ⬜
last consolidated: 26-08-26

Completing the second task of a main task within the deadline awards 4pts. does not stack with completing the main task. the second task must always be a subset of the main task: eg, if the main task is "vacuum and mop the floors" the 2nd task would be "vacuumed floor" or smth. I don't know if "second" makes sense as a name though.

2nd task completion has no leniency. The main task still has regular leniency, whatever was selected (WL, HL, etc). eg, just vacuumed floor but later than deadline -> no pts. vacuumed and mopped later than deadline but within leniency -> some pts. only vacuumed floor but before deadline and then ALSO didn't mop (or forfeiting/giving up on that) before the final leniency time -> 4pts.

**Undecided: the scoring does not hold together yet.** `TIER_POINTS` is `[6, 3, 2, 1]`, so a flat 4 for the second task sits above three of the four tiers. Once the 4 is banked, finishing the main task late pays *less* than not finishing it at all — vacuum on time, mop ten minutes late, and 4 points becomes 3. The rule that has to hold is that **every main-task tier must be worth more than the second task's award**, and no arrangement of "which one you get" can deliver that while the numbers stay as they are. Either the award comes down or the ladder goes up.

Two families of fix, neither chosen:

**Additive.** The second task's award stacks on top of whatever the main task scores, and `TIER_POINTS` is left alone. Finishing then always adds the tier, so doing more is always worth more at every point on the clock. This drops the "does not stack" rule above, which is the price of the pull it buys.

```
                    +2   +3   +4
second task only     2    3    4
full, on time        8    9   10
full, +10           5    6    7
full, +30           4    5    6
full, +60           3    4    5
```

**A dedicated ladder.** Two-objective tasks get their own `TIER_POINTS` whose lowest rung clears the second task's award — `[10, 8, 6, 5]` against an award of 4, for instance. "Does not stack" survives, and the higher pay justifies itself on the grounds that a two-objective task is more work. The difficulty is shape rather than arithmetic: `[6, 3, 2, 1]` halves and then crawls, so any scalar multiple of it inherits that cliff, and candidates like `[8, 4, 3, 2]` or `[9, 6, 4, 3]` scale unevenly rung to rung.

**This collides with [i5].** A promoted DOLI task is worth 12 on time. An additive `+4` puts a two-objective task at 10 with no gamble and no downside, which leaves DOLI very little room; `+2` tops out at 8 and does not.

**Also undecided:** when the 4 is actually awarded, given nothing in Falsedge resolves on its own — whether `cancel task` pays it out once the second task is ticked, or a separate forfeit control is needed. How the second task is ticked off and whether that tick is timestamped, since "before the deadline" has to be judged later and a task resolved at 23:00 cannot otherwise prove the vacuuming happened at 19:00. Whether a second task can be authored on dailies and `others` rows or only in SET. Whether there can be more than one. And the name: **sub-task**, **partial**, **minimum**, **fallback** and **milestone** are all candidates, with "minimum" reading closest to the mechanic.

update 26-08-27:  
just realized omg. we don't need separate custom tasks. *every* task can have option to become custom task. which is basically just an option of "complete now for x pts". in fact those fields can be hidden normally unless you tap the space next to the button or smth... anyway this isn't concrete or anything yet idk.

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

### [i33] Rename the failed path ⚪
last consolidated: none

update 26-09-11:  
changed from kill to rename. bcuz "failed" doesn't sound right but "late completion" needs better distinguishing from "late but within the leniency" vs "late and outside leniency" and we can't just call it "late and outside leniency" OBVIOUSLY we need an actual TERM HERE.

### [i35] Custom tasks (CL) ⬜
last consolidated: 26-08-22

A third leniency setting beside WL and HL, on the same row: **CL**, custom leniency. Choosing it creates a *custom task*, which structurally is just the existing Set block with the deadline and leniency requirements dropped.

- The body is a single multiline free-text field. Nothing else is required.
- While active, `complete now` reads **`complete now for X pts`**. X is a suggest field — typed or picked — offering `1 2 3 4 5 6 8 10 12`.
- X defaults to blank. Completing with it blank awards 0. That is almost always a mistake, and undo covers it.
- Cancel behaves normally.
- A date may still be set, but it is **ordering only**: it places the task among the active tasks and drives nothing else. No deadline, no tiers, no scoring. This replaces the earlier pin-to-top / pin-to-bottom idea, which is dropped as strictly more work for the same result.
- `CL` joins the leniency legend comment in `falsedge.js` beside WL, HL, NL and ML.

**Undecided:** CL strictly dominates DOLI. DOLI's 12 points cost a deadline and a -6 downside; CL's 12 points cost typing `12`. More broadly it is an unbounded self-award available on any task, so it undercuts the whole scoring economy rather than just DOLI. No limiter has been chosen.

### [i45] Queue ⬜ 🔴
last consolidated: 26-09-05

**ACTIVATE (others) becomes ACTIVATE (QUEUE).** No new section is added — the existing one is repurposed. Manual ordering was the only thing a separate Queue would have had that others lacked, and others has it now.

**The line.** A divider inside the section. Rows above it are the **active queue**; rows below it are the **inactive queue**, greyed the way a `further` active task is. The greying is purely visual — every action still works on an inactive-queue row. Moving a row across the line is how it joins or leaves the active queue.

**Row colours.** A row in the queue takes a red border. A row currently out as a task keeps its blue text. The section's own border stays indigo.

**Ordering is by drag.** The ▲▼ chevrons are replaced by a `Move ↕` handle — touching it starts a vertical drag, and the rest of the row keeps its swipe actions. **Long-pressing the handle** opens a position picker: a native `<select>` of positions 1 to n, which renders as a popup on mobile.

**Every row carries its position number**, always shown, to the left of the row and **outside** its box, so the boxes' left border shifts right slightly. Small, vertically centred against the row, sized and coloured like the `by` / `on` labels.

**Rows are marked recurring or not**, shown by an icon on the row.
- **Recurring** — completing sends it to the inactive queue. Cancelling returns it to the position it came from.
- **Not recurring** — completing **deletes it outright**. Cancelling returns it to the position it came from *and* applies the 36h cooldown; tracking one-shots in the queue is largely what buys that.

**A new row is added at the bottom of the active queue.**

**The section is collapsible.**

**"Fail" is a misnomer and needs renaming.** It means *completed, too late to score* — the item was done. It therefore belongs on the complete path, and [i33]'s plan to collapse it into cancel is wrong.

**Undecided:**
- Whether the section reads **QUEUE** or **QUEUED**.
- Whether a completed **recurring** row lands at the **top or the bottom** of the inactive queue.
- **What the recurring icon is.**
- **What replaces the word "fail".**
- **How the line is stored.** Either an index — `state.others` stays a clean array of rows, but the count is a second source of truth every mutation has to maintain — or a sentinel object sitting in the array at the divide, which makes position the only source of truth and gives a draggable line for free, at the cost of a skip in `sortedOthers`, `buildOthers`, `addRow`, and a `normalise()` rule guaranteeing exactly one. A per-row boolean is **not** an option: it breaks the premise, since position is what defines membership and a flag lets `false` rows sit above `true` ones with no line to draw.


Update 26-09-06:  
- nvm on several features
- nvm the numbers 
- nvm the jump to position thing (can't decide how to UI anyway)
- queue is just anything above the line is red and anything below isnt. 
- actually no wait. there's the Move | button, but also 1 chevron to the left of it, ...oh gods im not sure if there will be room for it TwT we're so running out of space.... y'know what, the WL/HL buttons can afford to be smaller!! there's a heckton of margin on those things! 
- anyway. so eventually it will look like 
[WL] [HL] [MT] (<left vs right align>) [^/v] [Move |] [hambugu]
- the chevron button is only 1 bcuz it either moves it into or out of queue. 
- actually I'm debating on the move dragger... maybe we only need "move to top of queue" or "move to bottom of queue"...? idk
- wait no just, let's go with just like, simplest path... repurpose existing chevron buttons. now there's essentially two hamburger menus but the other one is specifically for queue positions. so the chevron buttons become. [X][Y] where X is either up or down depending on whether item is in queue (point down for move out of queue) or vice versa. Y is the queue position menu but I'm not sure of the symbol yet... honestly might just use literal Q lol. opens a menu that says "move to top of queue" "move to bottom of queue" "..... wait no that's not the idea. hold on. what am I doing. no.
- no we need to keep both chevron buttons for fine positioning (I don't want the drag anymore) and then we're bringing back the numbers but also the menu thing is actually gonna  just be from long press on the chevron buttons and... 
- OH MY GODS FORGET ALL OF THAT CAN WE ADD LIKE. PURE CSS LOGIC. ZERO BUTTON CHANGES. JUST THE DIVIDER LINE AND THE LOGIC OF "ABOVE LINE IS RED, BELOW LINE IS GREY"

### [i47] new 0.1 pts scoring ▫️ 🟡
last consolidated: none

ALL tasks, no matter the leniency, will award 0.1 pts on completing past the final leniency time. 

## Aulists

### [i15] Tear down and rebuild Aulists ⬜ 🟡
last consolidated: 26-08-22

Replaces this item's previous contents wholesale rather than extending them. Recurrence, the list 2 → 1 promotion, `applyAutoReturn()` and all auto-move / auto-reprioritize, and the randomizer are all removed. **List 0 stays** — the earlier plan deleted it.

**The new model is decay, not a to-do list.** Every item enters at list 0. One week after it was added it drops to list 1, and one list further every week after that. The clock is per item, measured from its own add time, and evaluated on page load — no timer, no scheduler.

Swipe up stays: an item that has fallen can be pulled back by hand when it is remembered. Swipe down is removed. Nothing descends except by aging.

"Going going gone" rather than a task list.

Swipe-between-lists navigation stays. So does the boundary mechanism (`pushBoundary`, `isBoundary`, `pendingBoundary`, the boundary-confirm UI), unused, in case it is wanted later.

**Undecided:** the name. This is arguably not Aulists any more, and "falling" shares a stem with Falsedge, but `Fallists` reads as fallacies or worse. It stays Aulists for now on the grounds that something automatic is still happening, so `au-` half-earns itself.

Also undecided: the previous version of this item carried several UI changes that the teardown does not mention either way — the pencil leaving the main view for an "Edit" entry in the hamburger, every `buildPencil()` call site becoming a copy button using Falsedge's `COPY_ICON`, and deleting the dead `buildTrashBtn()`. They were decided, then written over. Unclear whether they survive the rebuild.


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

### [i41] Cooldown on the Go to Hex 2^ button ⚪
last consolidated: 26-08-22

Falsedge's "Go to Hex 2^" button is inert for **10 seconds** after the page loads. Long enough to force a pause, far shorter than the minimums for staying inside the game.

Shown as a filling bar, never as numbers. Ticking once a second is acceptable; a smooth fill is preferred only if it costs nothing structurally — this is one small bar, not a reason to restructure how the page draws.

The clock runs from page load, so it applies once per visit and cannot be banked.

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

**Undecided:** where grass is stored, which is the load-bearing question — Falsedge keeps its state in `falsedge.data` and Hex 2^ keeps its own under `hex2.*`, and the two share nothing today. Also open: where the shop's UI lives, the grass-per-hour rate for lockdown reduction, whether a streak break costs grass or leaves it alone, and what else grass can be spent on.

### [i27] (low priority/far future) - Server side ⬜⬜⬜ 🔵
last consolidated: none

Storing data in server instead of locally. Would need to buy/rent server space or something... idk

## Colourcaln?

### [i42] Revive Colourcaln as a vibes tracker ⬜
last consolidated: 26-08-22

Not the per-day thing it was. Check in at any time, as often as wanted, and log where the vibes sit — positive or negative. Readings drift back toward neutral on their own over a few hours, so what is on screen always reflects something recent rather than a stale entry.

Several independent axes rather than one score: creativity, general mood, anxiety, and others not yet listed.

**Undecided:** essentially all of it — the decay rate and curve, the input control, the full axis list, whether this is a fourth page or lives inside an existing one, and whether the name survives (hence the question mark on the section).
