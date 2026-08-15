# Undo/redo ring buffer — implementation plan

Target: `falsedge.js`. Undo history moves from sessionStorage to a fixed-size localStorage ring, written on every action.

## Step 1 — constants

Remove `UNDO_SESSION_KEY`. Add:

- `UNDO_SLOT_PREFIX = "falsedge.undo."` — slot keys are prefix + slot number.
- `UNDO_INDEX_KEY = "falsedge.undo.index"`.
- `RING_SIZE = UNDO_CAP + 1` (61) — 60 undo steps plus the current position.
- `UNDO_BYTE_BUDGET = 2 * 1024 * 1024` — hard ceiling so undo can never starve `falsedge.data`.

Keep `UNDO_CAP = 60`.

## Step 2 — replace the RAM state

Delete `undoStack` and `redoStack`. Replace with:

- `ring` — array of length `RING_SIZE`, holds snapshot objects or `null`.
- `labels` — array of length `RING_SIZE`, holds action labels.
- `oldest`, `pointer`, `newest` — monotonically increasing integers, never wrapped.

Slot index is always `n % RING_SIZE`. Because the counters never wrap, all comparisons stay plain `<` and `>`.

Meaning of each:

- `pointer` — timeline position of the current state.
- `oldest` — earliest position still valid. Undo available ⟺ `pointer > oldest`.
- `newest` — latest position still valid. Redo available ⟺ `pointer < newest`.
- `labels[n % RING_SIZE]` — the action that moved the timeline from position `n` to `n + 1`.

## Step 3 — helpers

- `slotKey(n)` — returns `UNDO_SLOT_PREFIX + (n % RING_SIZE)`.
- `writeSlot(n, snapshot)` — `localStorage.setItem(slotKey(n), JSON.stringify(snapshot))`. Returns false on throw.
- `readSlot(n)` — parse it back, return `null` on throw or miss.
- `writeIndex()` — persists `{ oldest, pointer, newest, labels }` to `UNDO_INDEX_KEY`.
- `dropOldest()` — `oldest += 1`, `localStorage.removeItem` on the slot that just left the window.

**Ordering rule, applies everywhere: write the snapshot slot first, then the index.** If the app dies between the two, the index still claims the previous position and the half-written slot is invisible — you lose one undo entry. Doing it in the other order leaves the index pointing at a slot holding a 60-actions-ago snapshot, which silently restores ancient state on the next undo tap.

## Step 4 — rewrite `pushUndo(label)`

Still called before every mutation. New body:

1. `writeSlot(pointer, snapshotState())` — the pre-mutation state becomes a past position.
2. `labels[pointer % RING_SIZE] = label`.
3. `pointer += 1`, `newest = pointer`.
4. If `pointer - oldest > UNDO_CAP`, call `dropOldest()`.
5. `writeIndex()`.
6. `refreshUndoRedoButtons()`.

Setting `newest = pointer` is what invalidates the redo branch. Positions past the new `newest` still physically hold bytes, but the index no longer claims them, so they are unreachable. No deletion needed — the next action overwrites them.

Also mirror steps 1-2 into `ring` and `labels` in RAM so undo never has to hit disk.

## Step 5 — replace `step(direction)`

Delete the stack-shuffling body. Two thin functions instead:

`undo()`
1. Return if `pointer <= oldest`.
2. `writeSlot(pointer, snapshotState())` and mirror into `ring` — preserves the state being left so redo can return to it.
3. `pointer -= 1`.
4. `state = ring[pointer % RING_SIZE]`, falling back to `readSlot(pointer)` if RAM is cold.
5. `save()`, `writeIndex()`, `render()`, `refreshUndoRedoButtons()`.
6. `toast("Undid: " + labels[pointer % RING_SIZE])`.

`redo()`
- Same shape, mirrored: return if `pointer >= newest`, read the label *before* incrementing (`labels[pointer % RING_SIZE]`), then `pointer += 1`.

Cost per tap is one slot write plus one index write, not a re-serialisation of all 60.

## Step 6 — replace `saveUndoStacks` / `loadUndoStacks`

Delete `saveUndoStacks` entirely — persistence now happens inline in steps 4 and 5.

Rewrite `loadUndoStacks` as `loadRing()`:

1. Read `UNDO_INDEX_KEY`. If missing or unparseable, start fresh at `oldest = pointer = newest = 0`.
2. Validate the three counters are integers with `oldest <= pointer <= newest` and `newest - oldest <= UNDO_CAP`. Reset to fresh if not.
3. `readSlot(n)` for every `n` in `[oldest, newest]` except `pointer`, into `ring`.
4. Restore `labels` from the index.
5. Leave `state` alone — the current state comes from `falsedge.data` as it always has. Place it into `ring[pointer % RING_SIZE]`.
6. Drop any position whose slot read came back `null`, narrowing `oldest`/`newest` inward to the contiguous run around `pointer`.

## Step 7 — quota handling

Wrap every `writeSlot` / `writeIndex` in the shared retry:

1. If the write throws, `dropOldest()` and retry.
2. Repeat until it succeeds or `oldest === pointer`, at which point give up silently — the RAM ring still works for the rest of the session.
3. Before writing, if the running byte estimate exceeds `UNDO_BYTE_BUDGET`, `dropOldest()` first.

`save()` (the `falsedge.data` write) must always run **before** any ring write in every code path, so task data gets first claim on quota.

## Step 8 — `refreshUndoRedoButtons`

Replace the length checks:

- `undoBtn.disabled = pointer <= oldest`
- `redoBtn.disabled = pointer >= newest`

## Step 9 — boot wiring

- Delete `window.addEventListener("pagehide", saveUndoStacks)`.
- Delete the `saveUndoStacks()` call inside the `visibilitychange` handler. Keep `flushDrafts()` and the re-render.
- Replace the `loadUndoStacks()` call with `loadRing()`.
- Add a one-time `sessionStorage.removeItem("falsedge.undo")` to clear the retired key.

## Step 10 — changelog

Add a version entry to the "Change logs" section of `about.html`, newest first

## Verification checklist

- Activate a row, kill the app, reopen — undo button is live and reverts the activation.
- Do 3 actions, undo twice, do a new action — redo goes dead, and does not resurrect the abandoned branch.
- Undo 60+ times — stops cleanly at the oldest entry, no wrap-around into garbage.
- Undo repeatedly then redo back to the end — lands on the same state you started from.
- Undo/redo labels in the toast still name the right action.

## Decisions, so they don't get re-argued

- **localStorage, every action** — sessionStorage died on app close, and exit-only writes lost the tail to OS kills.
- **Full snapshots, not diffs** — the problem was per-tap write cost, not size. A ring fixes that for ~10 lines; a differ costs ~70 and corrupts silently when wrong.
- **Many keys, not one blob** — a single blob rewrites all 60 snapshots per tap.
- **One timeline + pointer, not two stacks** — under a ring these are the same structure; two stacks would rewrite slots to express a pointer move.
- **Aulists, Falsedge and Hex 2 share one ~5MB origin budget.** That is why the 2MB ceiling exists, and it is the thing that would eventually justify diffs.