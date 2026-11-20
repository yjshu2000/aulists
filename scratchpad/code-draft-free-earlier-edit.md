# Code draft: moving a deadline earlier is free

Last updated: 2026-11-20 10:52

- A time edit that moves the deadline earlier costs nothing, whatever the mode change does (A1).
- Free edits don't bump `edits`, so the next paid edit's price is unchanged (B1).
- The `edit time? (N grass)` overlay and its can-afford gate stay as they are (C2).
- Text edits stay paid (D).

---

### Block 1: Replace [falsedge.js lines 1701-1705](../falsedge.js#L1701-L1705)

```js
  /**
   * Closes the time editor and commits its draft as one paid edit. A draft that
   * changes nothing closes for free; one that's invalid toasts why and is
   * thrown away, also for free.
   */
```

With:

```js
  /**
   * Closes the time editor and commits its draft as one edit, paid unless it
   * moves the deadline earlier. A draft that changes nothing closes for free;
   * one that's invalid toasts why and is thrown away, also for free.
   */
```

---

### Block 2: Replace [falsedge.js lines 1745-1752](../falsedge.js#L1745-L1752)

`earlier` compares against the deadline as it stands before this edit. Skipping `chargeEdit` skips both the grass and the `edits` bump. Undo still works: `pushUndo` snapshots state either way, and there's simply nothing to refund.

```js
    }
    if (!canAffordEdit(task)) {
      render();
      return;
    }
    pushUndo("edit task time");
    chargeEdit(task);
    task.deadline = iso;
```

With:

```js
    }
    var earlier = deadline.getTime() < new Date(task.deadline).getTime();
    if (!earlier && !canAffordEdit(task)) {
      render();
      return;
    }
    pushUndo("edit task time");
    if (!earlier) {
      chargeEdit(task);
    }
    task.deadline = iso;
```

---

### Block 3: Replace [falsedge.js lines 2837-2839](../falsedge.js#L2837-L2839)

```js
   * Builds the deadline/leniency editor that replaces a task's tier rows while
   * it's open. Every control writes to the unsaved draft, which only commits as
   * one paid edit once the editor closes.
```

With:

```js
   * Builds the deadline/leniency editor that replaces a task's tier rows while
   * it's open. Every control writes to the unsaved draft, which only commits as
   * one edit once the editor closes, free if it moves the deadline earlier.
```

---

### Block 4: changelog

increment: +0.0.1 (v2.27 → v2.27.1)

- Moving a task's deadline earlier is free now, whatever happens to its mode. It doesn't raise the price of the next paid edit either.

---
