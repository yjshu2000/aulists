# Next features & fixes

Distilled from sad-todos-babble.md (2026-08-07). Later entries in that doc supersede earlier ones.

## Remove Set Task section entirely

Set Task is redundant now that activate templates exist. Remove the whole section. The adder in the template sections replaces it. (This supersedes the earlier ideas about adding "clear draft" and "save template" buttons to the Set Task row — those are moot now.)

## Add "by" label beside time dropdown

In the activate template adder, the time dropdown needs a "by" label to its left so it reads as "by [time]" instead of just showing a bare time.

## Remove height limiting / scroll containment in activate

No more internal scrolling in the activate area. No height cap. Just show the full content and let the user scroll past all of it to reach the next section. (This supersedes the earlier scroll-containment bug report and the scroll-jump-on-tap bug — both go away if there's no internal scroll.)

## Active tasks visual redesign

- Wrap the whole active tasks area in a labelled box reading "ACTIVE TASKS", styled like the other section labels.
- Colour: green (the old green, not cornflower/cerulean).
- Items inside get the same outlines and boxes as before, same colour-changing behaviour, but no glow.

## Remove refresh buttons

Removing the swipe-nav stuff also removed the capture of swipe-down-to-reload, which means the browser's native pull-to-refresh works again. The manual refresh buttons are now redundant — kill them.

## Edit templates styling bug

The template rows have basically no gap between the text and the controls row beneath it. It's most visible when editing (because the borders appear and make the collision obvious), but it applies to both the regular rows and the inline edit UI. Just needs slightly more spacing between the two rows.

## Deletable ledger entries with undo

Two parts:
1. Need the ability to delete individual ledger entries (for when the undo history has expired/died).
2. Deleting a ledger entry should itself go into the undo stack.

## Full-template instant activation

If a template has all fields filled (WL/HL, time, text), swiping left (right-to-left) on it should bypass any intermediate step and directly create a new active task. If any field is missing, toast the same refusal message that Set Task would have shown. Time is "next available in next 24h" for the bypassed case.

## Restructure Falsedge into two activate sections

Replace the current linkables concept. The two sections become:

**ACTIVATE (dailies)**
- Time is mandatory.
- Sorts by time.
- --:-- available in dropdown but the add/set button is gated (blocked) if time isn't set.

**ACTIVATE (others)**
- Time is optional; --:-- must remain available as an option.
- Sorts by last-done date (this needs to be tracked now — completion date updates on on-time or late completion, but not on cancel).
- This last-done tracking is independent of Aulists entirely.

Both sections:
- WL/HL optional until trying to set/activate.
- Swipe left directly creates active task (same as "full-template instant activation" above) if all required fields are set.

## Strip down Aulists

- Only lists 1 through 4. Remove list 2.5 and 0.
- Remove auto-move/auto-reprioritize between lists entirely.
- Remove the pencil/edit icon from the main view; move it into the hamburger menu.
- Replace the pencil icon's spot with a copy icon that copies just the item text.
- Keep swipe-between-lists navigation.

## Text fields must line-wrap when editing

Editing text in template fields currently shows as a single-line input that doesn't wrap. It needs to wrap / be multiline.

## Spending timestamps + bulk buy

- Spending entries in the ledger need timestamps (currently missing).
- Buying multiple of the same item should support a quantity multiplier display: text, spend pts, ×count.

## DOLI (Double Or Lose It) mechanism

New mechanic. Once per day, a task can be promoted to DOLI status.

**Visual:**
- Icon: shiny up arrow (flat outline, not filled — like a video game buff icon). Neon, in the task's colour.
- When active, shows an Aventurine icon on the right side of the "by X for X pts" row, vertically centered.

**Points:**
```
minutes past deadline:  0   10   30    60   120   >120
points:               12    6    3     2     0     -6
```
(0 means completed on time / within deadline.)

The key difference from normal: instead of gracefully decaying to 0, there's only a 1-hour window at 0 before it drops to -6.

**Limits:** Max 1 DOLI task per day. Max 4 per week (not 7).

## Bug: pts calculation not inclusive

Reported case:
- Task: "go downstairs after shower", deadline 07:10 (HL)
- Completed at 07:15 → 5 min late
- Got pts = 6+2 = 8, scr = 6+2 = 8

The deadline boundary is supposed to be inclusive (completing at exactly the boundary minute counts as within that tier, not the next one). Something is off with the boundary comparison.

## Bug: ledger export extra line break

When exporting from ledger, code blocks have an extra line break inserted between entries. There's a spurious gap/space being added.

## Complex tasks (exploratory)

Vague idea — support for:
- Multipliers on tasks (conditional?)
- +1 bonuses attached to a task

Not fully fleshed out yet.

## Collapsible activate sections

Both ACTIVATE (dailies) and ACTIVATE (others) should be collapsible.

**When open:**
- Top button: triangle pointing down (indicates "is open"). Tapping it closes.
- Bottom button: triangle pointing up (indicates "to close"). Tapping it also closes.

**When closed:**
- Only the top button visible, triangle pointing down. Tapping opens.

**Button style:** Just a triangle, no outline or border. Button hit area is regular button size but shaped wider (2× width) and shorter (½ height). Buttons sit outside the section boxes, horizontally centered.

## Further task deadlines (up to 1 week)

- Optional "add date" field using the native calendar date picker.
  - this gets unset/cleared after setting a task (swiping left on a template).
- Max range: 1 week out (7×24h). Can't go further.
- Further-off tasks display the day abbreviation beside the time (e.g., TU, WE) — only for tasks beyond today/24h.
- Visual treatment: dimmer than today tasks — less glow, greyer text.
- Horizontal divider line between further tasks and today/next-24h tasks (no line if no further tasks exist).
- These can be completed early (no extra reward for early completion — they're intended to be done whenever).
- Anti-abuse: if a non-daily further task is cancelled, it can't be re-set for 36 hours. This does NOT apply to dailies templates.

## Swap homepage to Falsedge

The index/homepage becomes Falsedge. Aulists becomes the secondary page.

## Add hex game link to Falsedge

At the bottom of Falsedge, two navigation rows:
1. Hex 2^ button — right-aligned, on its own row.
2. Aulists button — next row below, normal/centered (no changes to its existing style).

## Remove swipe-right-to-move-down on templates

Swipe right (left-to-right) on template rows currently moves them down. Remove this behaviour — it's not needed.

## Already done? — Edit active task deadlines

(The commit `19d3bcc` says "Let active tasks change deadline and leniency after being set" — this was requested in the babble but may already be shipped.)
