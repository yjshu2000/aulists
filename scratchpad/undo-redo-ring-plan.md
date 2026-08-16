# Undo/redo ring buffer — implementation plan

Target: `falsedge.js`. Undo history moves from sessionStorage to a fixed-size localStorage ring, written on every action.

Every name below is final. They are all prefixed `undo` / `UNDO_` on purpose: `falsedge.js` is ~2500 lines with a lot of other state in scope, and a bare `pointer` or `ring` or `labels` says nothing about what it belongs to.

## Step 1 — constants

Remove `UNDO_SESSION_KEY`. Add:

- `UNDO_SLOT_PREFIX = "falsedge.undo.slot."` — a slot's key is this prefix plus its slot number, e.g. `falsedge.undo.slot.7`.
- `UNDO_INDEX_KEY = "falsedge.undo.index"` — deliberately *not* under `UNDO_SLOT_PREFIX`, so a loop that clears every slot key cannot take the index out with it.
- `UNDO_RING_SIZE = UNDO_CAP + 1` (61) — 60 undo steps plus the position the timeline currently sits on.
- `UNDO_BYTE_BUDGET = 2 * 1024 * 1024` — hard ceiling, so undo history can never starve `falsedge.data`.

Keep `UNDO_CAP = 60`.

## Step 2 — replace the RAM state

Delete `undoStack` and `redoStack`. Replace with:

- `undoRing` — array of length `UNDO_RING_SIZE`, holds snapshot objects or `null`.
- `undoLabels` — array of length `UNDO_RING_SIZE`, holds action labels.
- `undoSlotBytes` — array of length `UNDO_RING_SIZE`, holds each slot's serialized length in characters, or `0` for an empty slot.
- `undoBytesUsed` — running sum of `undoSlotBytes`, so the budget check never has to re-measure anything.
- `undoOldest`, `undoPointer`, `undoNewest` — plain integers that count timeline positions and are never reduced modulo anything. Only `undoOldest` rises and never falls. `undoPointer` moves both ways, one step per undo/redo tap. `undoNewest` falls whenever a new action is taken after undoing, since that abandons the redo branch. Do not assert monotonicity on any of them except `undoOldest`.

One ordering trap: `var undoRing = new Array(UNDO_RING_SIZE)` runs the moment the file loads, so `UNDO_RING_SIZE` has to be declared above it. The constants from Step 1 sit at the top of the IIFE and these arrays go just below `var state = load()`, which satisfies that. Function order does not matter anywhere else in this plan — they are all function declarations, so they hoist.

A position's slot index is always `n % UNDO_RING_SIZE`. Because the counters themselves never wrap, every comparison stays a plain `<` or `>`.

Meaning of each:

- `undoPointer` — timeline position of the current state.
- `undoOldest` — earliest position still valid. Undo available ⟺ `undoPointer > undoOldest`.
- `undoNewest` — latest position still valid. Redo available ⟺ `undoPointer < undoNewest`.
- `undoLabels[n % UNDO_RING_SIZE]` — the action that moved the timeline from position `n` to `n + 1`.

`undoNewest - undoOldest` can never exceed `UNDO_CAP`, so 61 slots is always enough: `pushUndo` is the only thing that grows the window, and it caps itself.

## Step 3 — helpers

- `undoSlotKey(n)` — returns `UNDO_SLOT_PREFIX + (n % UNDO_RING_SIZE)`.
- `writeUndoSlot(n, snapshot)` — `JSON.stringify` the snapshot, `localStorage.setItem` it under `undoSlotKey(n)`, then update `undoSlotBytes[n % UNDO_RING_SIZE]` and `undoBytesUsed` by the difference. Returns false on throw, leaving the byte figures untouched.
- `readUndoSlot(n)` — reads and parses that slot, refreshing that slot's byte figure from the raw string's length. Returns `null` on a miss or a throw, and zeroes that slot's byte figure when it does.
- `writeUndoIndex()` — persists `{ undoOldest, undoPointer, undoNewest, undoLabels }` to `UNDO_INDEX_KEY`. Returns false on throw.
- `dropOldestUndo()` — retires position `undoOldest`: clears its `undoRing` and `undoLabels` entries, subtracts its bytes from `undoBytesUsed`, zeroes its `undoSlotBytes`, `removeItem`s its key, then `undoOldest += 1`. **It must return immediately when `undoOldest >= undoPointer`** — the current position is the one thing that can never be dropped, and without this guard a full-storage retry loop would delete the state the app is sitting on.
- `wipeAllUndoSlots()` — `removeItem` on all `UNDO_RING_SIZE` slot keys, and zero `undoSlotBytes` / `undoBytesUsed`. Only called by `loadUndoRing()` when it starts a fresh timeline.
- `undoStateAt(n)` — returns `undoRing[n % UNDO_RING_SIZE]` when RAM has that position, otherwise falls back to `readUndoSlot(n)`. Returns `null` when neither has it.
- `undoWriteWithRetry(write)` — the shared quota retry wrapper. Defined in Step 7.
- `trimUndoToBudget()` — drops history until the ring is back under `UNDO_BYTE_BUDGET`. Defined in Step 7.

**Ordering rule, applies everywhere: write the snapshot slot first, then the index.** If the app dies between the two, the index still claims the previous position and the half-written slot is invisible — you lose one undo entry. Doing it in the other order leaves the index pointing at a slot holding a 60-actions-ago snapshot, which silently restores ancient state on the next undo tap.

**Aliasing rule, applies everywhere: `state` and an `undoRing` entry must never be the same object.** JS objects are references. Assigning `state = undoRing[i]` makes every later mutation of `state` silently rewrite that stored snapshot, so undoing twice would land on state that has been quietly edited underneath. Anything moving a snapshot *out of* the ring and into `state` goes through `snapshotState()`-style cloning first. Anything moving a snapshot *into* the ring stores a fresh clone, never the live `state` object. (The old stack code got away with this by `pop`ping entries off, which the ring never does.)

## Step 4 — rewrite `pushUndo(label)`

Still called before every mutation. New body:

1. Take `var snapshot = snapshotState()` and `var at = undoPointer` — capture the position now, since the retry helper's callback must not read a counter that has since moved.
2. Mirror into RAM: `undoRing[at % UNDO_RING_SIZE] = snapshot`, `undoLabels[at % UNDO_RING_SIZE] = label`. Undo then never has to hit disk.
3. `trimUndoToBudget()` (Step 7).
4. `writeUndoSlot(at, snapshot)`, through the retry helper.
5. `undoPointer += 1`, then `undoNewest = undoPointer`.
6. If `undoPointer - undoOldest > UNDO_CAP`, call `dropOldestUndo()`.
7. `writeUndoIndex()`, through the retry helper.
8. `refreshUndoRedoButtons()`.

Setting `undoNewest = undoPointer` is what invalidates the redo branch. Positions past the new `undoNewest` still physically hold bytes, but the index no longer claims them, so they are unreachable. No deletion needed — the next few actions overwrite them.

The snapshot handed to the ring here is already a detached clone, so it satisfies the aliasing rule with no extra copy.

## Step 5 — replace `step(direction)`

Delete the stack-shuffling body. One shared mover plus two thin wrappers:

`stepUndoTo(delta)` — `delta` is `-1` for undo, `+1` for redo:

1. `var current = snapshotState()`, `var at = undoPointer`.
2. `undoRing[at % UNDO_RING_SIZE] = current`, and `writeUndoSlot(at, current)` through the retry helper — this is what preserves the position being left, so the opposite direction can come back to it.
3. Fetch the target position through `undoStateAt(undoPointer + delta)`: return `undoRing[n % UNDO_RING_SIZE]` if RAM has it, otherwise `readUndoSlot(n)`.
4. **If that comes back `null`, return `false` without moving `undoPointer`.** The slot is unrecoverable; refusing to move is the only safe answer, since the alternative is restoring `undefined` over live state. Callers toast nothing and the timeline stays put.
5. `undoPointer += delta`.
6. Put `target` itself into `undoRing[undoPointer % UNDO_RING_SIZE]`, and set `state` to a *separate clone* of it. Two distinct objects: the ring keeps one, `state` gets the other. Handing the same object to both is exactly the aliasing bug the rule above forbids.
7. `save()`, then `writeUndoIndex()` through the retry helper, then `render()`, then `refreshUndoRedoButtons()`.
8. Return `true`.

`undo()` — return if `undoPointer <= undoOldest`; read `undoLabels[(undoPointer - 1) % UNDO_RING_SIZE]` *before* moving; call `stepUndoTo(-1)`; toast `"Undid: " + label` only if it returned true.

`redo()` — return if `undoPointer >= undoNewest`; read `undoLabels[undoPointer % UNDO_RING_SIZE]` *before* moving; call `stepUndoTo(1)`; toast `"Redid: " + label` only if it returned true.

Both read the label before the move because `undoLabels[n]` names the action *between* `n` and `n + 1`, so the correct index depends on which direction is being travelled.

Cost per tap is one slot write plus one index write, not a re-serialisation of all 60.

## Step 6 — replace `saveUndoStacks` / `loadUndoStacks`

Delete `saveUndoStacks` entirely — persistence now happens inline in steps 4 and 5.

Rewrite `loadUndoStacks` as `loadUndoRing()`:

1. Zero everything first: `undoRing`, `undoLabels`, `undoSlotBytes` filled, `undoBytesUsed = 0`, `undoOldest = undoPointer = undoNewest = 0`.
2. Read and validate whatever is under `UNDO_INDEX_KEY`. Every check here is against the *parsed object's* fields, not the globals — the globals are still zeroed at this point. It is only trusted if it parses, its three counters are all finite integers, they satisfy `oldest <= pointer <= newest`, `newest - oldest <= UNDO_CAP`, and its `undoLabels` field is an array of length `UNDO_RING_SIZE`.
3. **If it is not trusted, call `wipeAllUndoSlots()` and start a fresh timeline at 0.** Without this the 61 slots keep holding snapshots that nothing can ever read — a slot's number alone does not say which position it holds, so without the index they are anonymous blobs — and worse, their bytes are invisible to `undoBytesUsed`, which would make `UNDO_BYTE_BUDGET` under-count real usage by up to the entire ring.
4. Otherwise adopt the counters and labels, then `readUndoSlot(n)` for every `n` in `[undoOldest, undoNewest]` except `undoPointer`.
5. Leave `state` alone — the current state still comes from `falsedge.data` as it always has. Place a *clone* of it into `undoRing[undoPointer % UNDO_RING_SIZE]` (aliasing rule).
6. Narrow inward to the contiguous run of live slots around `undoPointer`: walk down from `undoPointer` while the position below is present to find the new `undoOldest`, then walk up while the position above is present to find the new `undoNewest`. A hole can then never be stepped into.

## Step 7 — quota handling

Both ring writers go through one shared retry, `undoWriteWithRetry(write)`, where `write` is a callback returning false on throw:

1. Call it. If it returns true, done.
2. Otherwise, if `undoOldest >= undoPointer`, give up silently — the RAM ring still serves undo for the rest of the session.
3. Otherwise `dropOldestUndo()` and try again.

Separately, `trimUndoToBudget()` runs before a `pushUndo` write: while `undoBytesUsed > UNDO_BYTE_BUDGET` and `undoOldest < undoPointer`, call `dropOldestUndo()`. This is why `undoSlotBytes` / `undoBytesUsed` exist at all — the budget check is a comparison against a running total, never a re-measurement of 60 snapshots.

The practical effect: when Falsedge's state is small you get all 60 steps; when the ledger has grown fat you get fewer steps, and `falsedge.data` keeps its claim on the shared quota. The trim runs *before* the new snapshot is written, so the ring can sit one snapshot over budget until the next action trims it back — harmless, and it keeps the check to a single comparison.

**Quota priority rule:** a ring write must never happen while an unsaved mutation to `state` is pending, so `falsedge.data` always gets first claim on storage. This is satisfied in both directions, but for different reasons, and it is worth being explicit because the naive reading — "always `save()` first" — is impossible in `pushUndo`:

- `pushUndo` runs *before* its caller mutates anything, so the snapshot it writes is state that `save()` already committed on the previous action. There is nothing unsaved to protect.
- `stepUndoTo` restores state and must call `save()` before `writeUndoIndex()`, so a full disk can never leave the index pointing at a position whose state never made it to `falsedge.data`.

Two known degradations under full storage, both accepted rather than fixed:

- If `writeUndoIndex()` exhausts its retries in `stepUndoTo`, the in-RAM pointer has moved but the stored index still names the old position. On the next launch the restored state and the index disagree by one step, so the first undo tap looks like it does nothing. Nothing is corrupted, and the tap after it behaves normally.
- After Step 6's narrowing, slots that fell outside the window still count toward `undoBytesUsed` until they are overwritten. That over-counts, which only ever makes the budget stricter, so it needs no correction.

## Step 8 — `refreshUndoRedoButtons`

Replace the length checks:

- `undoBtn.disabled = undoPointer <= undoOldest`
- `redoBtn.disabled = undoPointer >= undoNewest`

## Step 9 — boot wiring

- Delete `window.addEventListener("pagehide", saveUndoStacks)`.
- Delete the `saveUndoStacks()` call inside the `visibilitychange` handler. Keep `flushDrafts()` and the re-render.
- Replace the `loadUndoStacks()` call with `loadUndoRing()`.

## Step 10 — changelog

Add a version entry to the "Change logs" section of `about.html`, newest first.

## Verification checklist

- Activate a row, kill the app, reopen — undo button is live and reverts the activation.
- Do 3 actions, undo twice, do a new action — redo goes dead, and does not resurrect the abandoned branch.
- Undo 60+ times — stops cleanly at the oldest entry, no wrap-around into garbage.
- Undo repeatedly then redo back to the end — lands on the same state you started from.
- Undo twice, then edit something, then undo again — the state restored is the one that was stored, not one mutated afterwards. This is the aliasing rule's test.
- Undo/redo labels in the toast still name the right action, in both directions.

## Decisions, so they don't get re-argued

- **localStorage, every action** — sessionStorage died on app close, and exit-only writes lost the tail to OS kills.
- **Full snapshots, not diffs** — the problem was per-tap write cost, not size. A ring fixes that for ~10 lines; a differ costs ~70 and corrupts silently when wrong.
- **Many keys, not one blob** — a single blob rewrites all 60 snapshots per tap.
- **One timeline + pointer, not two stacks** — under a ring these are the same structure; two stacks would rewrite slots to express a pointer move.
- **Aulists, Falsedge and Hex 2 share one ~5MB origin budget.** That is why the 2MB ceiling exists, and it is the thing that would eventually justify diffs.