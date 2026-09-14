# Comment fixes — code draft

Three comment-only fixes found on the post-compaction repo read. No behaviour changes, so there is no changelog block — nothing here is visible from the page.

1. The `ML` legend entry goes, and `NL` becomes `MT`, per [i14.3.1]'s `update 26-09-01`. MT still reads `(not built yet)` because it is not.
2. `editTaskDate`'s JSDoc is sitting above `taskDateCeiling` instead of above `editTaskDate`. It moves down to the function it describes.
3. `buildOthers` still claims the section is sorted "most recently completed first". It has been manual order since v2.20.

---

### Block 1: Replace [falsedge.js lines 31-32](../falsedge.js#L31-L32)

```js
  // NL = no leniency (not built yet)
  // ML = mega leniency (not built yet)
```

With:

```js
  // MT = micro task (not built yet)
```

---

### Block 2: Remove [falsedge.js lines 1709-1715](../falsedge.js#L1709-L1715)

```js
  /**
   * Moves an active task's deadline to a new day, keeping its clock time. An
   * empty date re-resolves to the clock time's next occurrence, which is how
   * a further task is pulled back inside 24h.
   * @param {string} id - the task id.
   * @param {string} date - a day key, "YYYY-MM-DD", or "" for none.
   */
```

---

### Block 3: Add at [falsedge.js line 1734](../falsedge.js#L1734)

Just prior:

```js
    return key;
  }

```

Added:

```js
  /**
   * Moves an active task's deadline to a new day, keeping its clock time. An
   * empty date re-resolves to the clock time's next occurrence, which is how
   * a further task is pulled back inside 24h.
   * @param {string} id - the task id.
   * @param {string} date - a day key, "YYYY-MM-DD", or "" for none.
   */
```

Just after:

```js
  function editTaskDate(id, date) {
```

---

### Block 4: Replace [falsedge.js lines 3443-3444](../falsedge.js#L3443-L3444)

```js
   * Builds the ACTIVATE (others) box: persistent records, most recently
   * completed first, plus the pinned adder.
```

With:

```js
   * Builds the ACTIVATE (others) box: non-daily templates in manual order,
   * the rows currently out as tasks first, plus its own adder 
```
