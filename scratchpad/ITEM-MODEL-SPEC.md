# Item / List data model spec

Status: implementation partially started. See checkpoints doc. 

CONTEXT FOR APP: this app is being designed by and for exactly ONE USER. At this stage, everything is local. This is NOT an app to be shipped, this is not a product, this is not something to be sold, this is not something to publish, do NOT treat it like a commercial item with overly cautious bullshjt like "existing users may be affected". 
IN PARTICULAR, git branch "crazies" is for TESTING ONLY. IT IS NOT THE MAIN BRANCH. EVERYTHING HAPPENING HERE IS PURELY A TEST ENVIRONMENT. THERE IS NO REAL DATA HERE. 

## Data model

- `itemsById = { [id]: Item }`, one canonical record per item, ever.
- `Item = { id, text, note?, isDone, lastDone, recurrence? }`. If no recurrence, `recurrence` is null. See Recurrence schema section for the full shape.
- The different types of lists are as follows:
  - today card: lists -1, 0, 1. Affected by daily rollover, and copied into past cards.
    - list -1 is also known as "basics". basics contains only recurring items.
    - all items completed on a certain day must be in list -1 or 0. items not in list -1 or 0 will be moved into list 0. if they already are in list -1 or 0, they stay there.
    - the general word for day card lists is zones. for example, zone -1/0/1 refers to the list -1/0/1 of any day card (today card or past day card) in general.
  - list 2, 2.5, 3, 4: regular lists. not affected by daily rollover. 
  - Lists `"2"` and `"2.5"` share one card (List 2), with `"2.5"` rendered as a subsection within it; List 3 and List 4 are each their own card.
  - completed items list and recurring items list: these are derived filtered views over `itemsById`. all other lists are arrays of ids into `itemsById`. no lists ever store actual Item objects, except past item lists.
  - past item lists: see Rollover section and PastItem section.
- The same id can sit in more than one list's array at once — that is linking, not copying, since both arrays resolve to the same object in `itemsById`.
- Ids can also be in no lists or arrays, and only in `itemsById`.
- Why ids instead of shared JS object references: this app persists via `localStorage.setItem(JSON.stringify(state))`. `JSON.stringify` does not preserve shared identity — the same object in two arrays serializes twice and comes back as two independent objects on reload. ids are plain strings and round-trip fine.

## Recurrence schema

```
recurrence = null | {
  destination: "-1" | "1" | "2.5", paused: boolean,
  rule:
    { type: "daily" }
      // fires every single day unconditionally
  | { type: "everyNDays", everyDays: int }
      // recurs when (today - item.lastDone) % everyDays == 0
      // anchored to lastDone.
  | { type: "everyNWeeksOnDays", everyWeeks: int, weekdays: int[] (0-6),
      anchorDate: "YYYY-MM-DD" }
      // recurs when weekday matches AND
      // floor(weeksSince(anchorDate)) % everyWeeks == 0
  | { type: "dayOfMonth", days: int[] (each 1-31) }
      // recurs when today's day-of-month is in `days`
  | { type: "nthWeekdayOfMonth", ordinal: int (1,2,3,4, or -1=last),
      weekday: int (0-6) }
      // recurs when today is the `ordinal`-th occurrence of
      // `weekday` this month
  | { type: "monthOfYear", months: int[] (each 1-12), day: int (1-31) }
      // recurs when today's month is in `months` AND today's
      // day-of-month == day
  | { type: "yearly", month: int (1-12), day: int (1-31),
      everyYears: int = 1, startYear?: int (required if
      everyYears > 1) }
      // recurs when month+day match AND (if everyYears>1)
      // (year - startYear) % everyYears == 0
}
```

- `destination` is the list a fired recurrence links the item into.
- `paused` suppresses firing without clearing the rule.

## Recurring items

- The "Recurring" view is a derived filter: all items in `itemsById` where `recurrence !== null`.
- A recurring item can simultaneously be linked into a list array (e.g. list -1 for Basics) AND visible in the Recurring view — these don't conflict since the view is derived, not a stored array.
- Recurring items never appear in the Completed view (the Completed filter explicitly excludes them: `isDone && !recurrence`). Checking a recurring item just flips `isDone`.
- `lastDone` is written on every check-off, recurring or not — some recurring items may need it for recurrence scheduling math.
- Delete works the same as for any other item (see Deletion section).

## Completing items

- Checking off an item flips `isDone = true` and records `lastDone`.
- If the item is not already in zone -1 or 0, also unlink it from its current list and link it into today's zone 0.
- The "Completed" view is derived, not stored: filter `itemsById` for `isDone === true && recurrence === null`. Non-recurring items must have `recurrence` set to `null`, not `{}` (empty object is truthy in JS).
- Unchecking an item flips `isDone = false` and moves it to list `"2.5"`, regardless of where it currently sits.
- Retroactively logging a live item into a past day is done via an explicit "Send to past" hamburger action on the item. This opens a day-picker; picking a day creates a new PastItem (linked to this item, marked done) in that day's zone 0, and unlinks the original item from its current list. It is now unlinked from all stored arrays but still shows in the Completed filter (or Recurring view if recurring).

## Rollover

- Today-card is 3 zone-arrays: -1 (Basics), 0, 1. Not one list.
- Day-grouping/date storage: `state.pastDaysByDate = { "2026-07-05": { "-1": [PastItem, ...], "0": [...], "1": [...] } }`. A "past card" in the UI = one entry in this map; the carousel's day-offset resolves to a date string and looks this up.
- At rollover, for every id still linked in a zone -1/0/1 array (both done and not-done), build a frozen PastItem (`ogItemId` = that id, plus text/isDone snapshot, minus recurrence) and push it inline into that day's past List for that zone.
- Zone **-1** (Basics): fully cleared and rebuilt fresh for the new day — safe because Basics is regenerated from the Recurring filter; nothing unique to the zone array is lost.
- Zones **0 and 1**: only unlink ids that are `isDone: true`; they've been copied into the past card so they aren't needed anymore. Ids that are `isDone: false` stay linked to its today lists and carry forward into the new day untouched, still live and actionable. Rollover never removes incomplete items from today's 0/1.
- Past lists also get their own adder for typing a new PastItem directly into a specific past day (`ogItemId: null`); inserts into that past day's list 0. 

## PastItem (separate type from Item)

- `{ ogItemId | null, text, note?, isDone }`. Shallow copy/snapshot; never synced to the live item afterward.
- Lives inline inside exactly one past-day list's array.
- Dangling `ogItemId` (item later deleted) or `ogItemId: null` (typed directly into a past list) both resolve the same way: toast "item was deleted" / render as gone. "Edit recurrence" on a PastItem jumps to the live item via this link.
- If a dangling `ogItemId` is found, rewrite it to `null` on detection (normalize once, don't re-check every render).
- PastItems can still be checked/unchecked, toggling their own `isDone` state independently of the live item.
- PastItems are fully mutable: all fields can be edited; the entire point is that changes don't affect the og Item and ogItem doesn't affect it. 
- Deleting a PastItem removes it from its past day list and does not affect its og Item.

## Delete / Trash lifecycle

- Hamburger -> Delete: unlinks the id from its current list(s), adds an entry to Trash. Trash is also just an id-referencing list: `{ id, origin, deletedAt }` — not a copy of the item's content.
- `itemsById` record is untouched and fully intact the whole time it sits in Trash — that's what makes Recover trivial: relink the id back into `origin`.
- 7-day TTL, or explicit permanent-delete from the Trash menu, is the ONLY point the record actually leaves `itemsById`. After that, any dangling `ogItemId` elsewhere resolves to nothing, same handling as always.

## Undo

- Implemented as whole-state snapshotting, not per-field diffs: `pushUndo(label)` deep-clones the entire `state` (`JSON.parse(JSON.stringify(state))`) onto `undoStack` before a mutation is applied. Undo pops that snapshot and replaces `state` wholesale; redo works the same way off a parallel `redoStack`.
- `undoStack`/`redoStack` are in-memory only (not persisted); cap is 60 entries each (`UNDO_CAP`), oldest dropped first.
- Any action that calls `pushUndo` first is undoable: check/uncheck, edit text/note, trash/untrash/permanent-delete, edit recurrence, send-to-past, etc.
- Rollover pushes a `pushBoundary` entry instead of a plain `pushUndo` entry. Undo/redo can step through same-day actions freely, but crossing a boundary (i.e. undoing past a day rollover) requires a confirm step first (`showBoundaryConfirm`) before it's allowed to proceed.
