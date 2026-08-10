(function () {
  "use strict";

  var STORAGE_KEY = "aulists.listdata";
  var UNDO_SESSION_KEY = "aulists.undo";
  var WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  // chain order for movement
  var CHAIN = ["0", "1", "2", "2.5", "3", "4"];
  // stored recurrence dicts against this list
  var RECURRENCE_KINDS = ["daily", "everyNDays", "everyNWeeksOnDays",
    "dayOfMonth", "nthWeekdayOfMonth", "monthOfYear", "yearly"];

  var state = load();
  var undoStack = [];
  var redoStack = [];
  var UNDO_CAP = 60;

  function snapshotState() {
    return JSON.parse(JSON.stringify(state));
  }

  var pendingBoundary = null;

  function pushUndo(label) {
    undoStack.push({
      snapshot: snapshotState(),
      label: label
    });
    if (undoStack.length > UNDO_CAP) {
      undoStack.shift();
    }
    redoStack = [];
    refreshUndoRedoButtons();
  }

  function pushBoundary(label) {
    undoStack.push({
      snapshot: snapshotState(),
      label: label,
      isBoundary: true
    });
    if (undoStack.length > UNDO_CAP) {
      undoStack.shift();
    }
    redoStack = [];
    refreshUndoRedoButtons();
  }

  function step(direction) {
    var from;
    var to;
    var prefix;
    if (direction === "undo") {
      from = undoStack;
      to = redoStack;
      prefix = "Undid: ";
    } else {
      from = redoStack;
      to = undoStack;
      prefix = "Redid: ";
    }
    if (!from.length) return;
    var top = from[from.length - 1];
    if (top.isBoundary &&
      !(pendingBoundary &&
        pendingBoundary.direction === direction)) {
      pendingBoundary = { direction: direction };
      showBoundaryConfirm(direction, top.label);
      return;
    }
    pendingBoundary = null;
    hideBoundaryConfirm();
    var entry = from.pop();
    to.push({
      snapshot: snapshotState(),
      label: entry.label,
      isBoundary: entry.isBoundary
    });
    state = entry.snapshot;
    save();
    syncScheduleInputs();
    updateLastExported();
    render();
    refreshUndoRedoButtons();
    toast(prefix + entry.label);
  }

  function undo() { step("undo"); }
  function redo() { step("redo"); }

  /**
   * Persists both stacks so they survive navigating to Falsedge and back.
   * sessionStorage, not localStorage: the stacks should outlive a navigation
   * but not the app being closed. Written only on the way out, so no action
   * pays the cost of serialising up to 120 whole-state snapshots.
   */
  function saveUndoStacks() {
    try {
      sessionStorage.setItem(UNDO_SESSION_KEY, JSON.stringify({
        undo: undoStack,
        redo: redoStack
      }));
      return;
    } catch (e) {}
    // over quota: keep the newest few steps rather than losing all of them
    try {
      sessionStorage.setItem(UNDO_SESSION_KEY, JSON.stringify({
        undo: undoStack.slice(-10),
        redo: redoStack.slice(-10)
      }));
    } catch (e) {}
  }

  /**
   * Restores both stacks at boot, if this tab left any behind.
   */
  function loadUndoStacks() {
    try {
      var raw = sessionStorage.getItem(UNDO_SESSION_KEY);
      if (!raw) return;
      var obj = JSON.parse(raw);
      if (!obj) return;
      if (Array.isArray(obj.undo)) undoStack = obj.undo;
      if (Array.isArray(obj.redo)) redoStack = obj.redo;
    } catch (e) {}
  }

  var expandedNote = null;
  var editingNote = null;
  var editingNoteMounted = false;
  var randomizer = {
    active: false,
    target: null,
    winnerId: null,
    highlightId: null,
    done: false
  };
  var randomizerGen = 0;

  // TEMP debug override for "now", for testing date-dependent behaviour
  // without waiting real days. getNow() stays permanently. Comment out this
  // block, #debugDatePanel in index.html, and its wiring near the bottom of
  // this file when not actively testing.
  var DEBUG_NOW_KEY = "aulists.debugNow";
  var debugNowOverride = null;

  /**
   * Reads a previously-set debug "now" override out of localStorage on boot, so
   * the override survives a page reload during testing.
   */
  (function loadDebugNow() {
    try {
      var raw = localStorage.getItem(DEBUG_NOW_KEY);
      if (!raw) {
        return;
      }
      var d = new Date(raw);
      if (isNaN(d.getTime())) {
        return;
      }
      debugNowOverride = d;
    } catch (e) {}
  })();

  /**
   * Returns the current moment the app should treat as "now" - either the real
   * clock, or the debug override set via the temp debug panel.
   * @returns {Date} a fresh Date instance (safe for callers to mutate).
   */
  function getNow() {
    if (debugNowOverride) {
      return new Date(debugNowOverride.getTime());
    }
    return new Date();
  }

  /**
   * Sets or clears the debug "now" override and persists the choice to
   * localStorage.
   * @param {Date|null} dateOrNull - the fake "now" to use, or null to resume
   *   using the real clock.
   */
  function setDebugNow(dateOrNull) {
    debugNowOverride = dateOrNull;
    try {
      if (dateOrNull) {
        localStorage.setItem(DEBUG_NOW_KEY, dateOrNull.toISOString());
      } else {
        localStorage.removeItem(DEBUG_NOW_KEY);
      }
    } catch (e) {}
  }

  /**
   * Builds a brand-new, empty state object - the baseline used on first run,
   * and the starting point `normalise` fills in from parsed JSON.
   * @returns {Object} an empty-but-well-formed state object.
   */
  function freshState() {
    return {
      version: 2,
      itemsById: {},
      lists: {
        "0": [], "1": [], "2": [], "2.5": [], "3": [], "4": [],
        trash: []
      },
      collapsed: {
        "3": false, "4": true, completed: true, recurring: true, trash: true
      },
      schedule: { everyDays: 1, atMinutes: 0 },
      lastReturn: null,
      lastExported: null
    };
  }

  /**
   * Generates a short, collision-resistant id for a new item.
   * @returns {string} an id like "i8k2p3q7x" (timestamp + random, base36).
   */
  function uid() {
    return "i" + Date.now().toString(36) +
      Math.random().toString(36).slice(2, 7);
  }

  /**
   * Loads and sanitizes state from localStorage, falling back to a fresh state
   * if nothing is stored or the stored JSON can't be parsed.
   * @returns {Object} a fully-formed state object.
   */
  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return freshState();
      return normalise(JSON.parse(raw));
    } catch (e) { return freshState(); }
  }

  /**
   * Sanitizes an arbitrary parsed-JSON blob (from localStorage or an import)
   * into a fully-formed state object. Anything malformed, partial, or garbage
   * is dropped or defaulted rather than allowed to corrupt `state`.
   * @param {Object} obj - parsed JSON, untrusted.
   * @returns {Object} a complete, safe-to-use state object.
   */
  function normalise(obj) {
    var s = freshState();
    if (obj && typeof obj === "object") {
      var validIds = {};
      if (obj.itemsById && typeof obj.itemsById === "object") {
        Object.keys(obj.itemsById).forEach(function (id) {
          try {
            var it = obj.itemsById[id];
            if (!it || typeof it.text !== "string") return;
            var o = { id: id, text: it.text, isDone: false, lastDone: null };
            if (it.note) o.note = it.note;
            if (typeof it.isDone === "boolean") o.isDone = it.isDone;
            if (typeof it.lastDone === "string") o.lastDone = it.lastDone;
            if (it.recurrence && validateRecurrence(it.recurrence) === null) {
              o.recurrence = it.recurrence;
            }
            s.itemsById[id] = o;
            validIds[id] = true;
          } catch (e) {}
        });
      }
      try {
        if (obj.lists) {
          CHAIN.forEach(function (k) {
            var arr = obj.lists[k];
            if (!Array.isArray(arr)) return;
            arr.forEach(function (id) {
              if (typeof id === "string" && validIds[id]) {
                s.lists[k].push(id);
              }
            });
          });
          if (Array.isArray(obj.lists.trash)) {
            obj.lists.trash.forEach(function (t) {
              if (!t || typeof t.id !== "string" || !validIds[t.id]) return;
              var origin = "3";
              if (CHAIN.indexOf(t.origin) !== -1) {
                origin = t.origin;
              }
              var deletedAt = getNow().toISOString();
              if (typeof t.deletedAt === "string") {
                deletedAt = t.deletedAt;
              }
              s.lists.trash.push({
                id: t.id, origin: origin, deletedAt: deletedAt
              });
            });
          }
        }
      } catch (e) {}
      try {
        if (obj.collapsed) {
          s.collapsed["3"] = !!obj.collapsed["3"];
          if (obj.collapsed["4"] === undefined) {
            s.collapsed["4"] = true;
          } else {
            s.collapsed["4"] = !!obj.collapsed["4"];
          }
          if (obj.collapsed.completed === undefined) {
            s.collapsed.completed = true;
          } else {
            s.collapsed.completed = !!obj.collapsed.completed;
          }
          if (obj.collapsed.recurring === undefined) {
            s.collapsed.recurring = true;
          } else {
            s.collapsed.recurring = !!obj.collapsed.recurring;
          }
          if (obj.collapsed.trash === undefined) {
            s.collapsed.trash = true;
          } else {
            s.collapsed.trash = !!obj.collapsed.trash;
          }
        }
      } catch (e) {}
      try {
        if (obj.schedule) {
          var ed = parseInt(obj.schedule.everyDays, 10);
          var am = parseInt(obj.schedule.atMinutes, 10);
          if (ed >= 1) s.schedule.everyDays = ed;
          if (am >= 0 && am < 1440) s.schedule.atMinutes = am;
        }
      } catch (e) {}
      if (typeof obj.lastReturn === "string") s.lastReturn = obj.lastReturn;
      if (typeof obj.lastExported === "string") {
        s.lastExported = obj.lastExported;
      }
    }
    return s;
  }

  /**
   * Persists the whole in-memory `state` object to localStorage as JSON.
   */
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { toast("Could not save to this browser's storage."); }
  }

  // ----------------------- schedule (compute on open) ------------------------
  /**
   * Returns the schedule boundary (midnight + `atMin` minutes) for a given
   * calendar day, ignoring whatever time-of-day `date` itself carries.
   * @param {Date} date - any moment on the calendar day to anchor to.
   * @param {number} atMin - minutes after midnight the boundary sits at.
   * @returns {Date} the boundary moment on `date`'s calendar day.
   */
  function boundaryAt(date, atMin) {
    var b = new Date(date);
    b.setHours(0, 0, 0, 0);
    b.setMinutes(atMin);
    return b;
  }

  /**
   * Adds (or subtracts) whole days to a date, preserving its time-of-day.
   * @param {Date} date - starting date.
   * @param {number} days - number of days to add; negative to subtract.
   * @returns {Date} a new Date `days` days after `date`.
   */
  function stepDays(date, days) {
    var d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  /**
   * Finds the most recent scheduled return boundary that has already passed,
   * relative to `now` - the moment List 2's contents last should have returned
   * to List 1 (whether or not that return actually ran yet).
   * @param {Date} now - the moment to search backward from.
   * @returns {Date|null} the boundary, or null if `state.lastReturn`'s anchor
   *   is itself still in the future (nothing has passed yet).
   */
  function lastBoundaryBefore(now) {
    var atMin = state.schedule.atMinutes;
    var days = state.schedule.everyDays;
    var c = boundaryAt(now, atMin);

    if (state.lastReturn) {
      var anchor = boundaryAt(new Date(state.lastReturn), atMin);
      if (anchor.getTime() <= now.getTime()) {
        while (stepDays(anchor, days).getTime() <= now.getTime()) {
          anchor = stepDays(anchor, days);
        }
        return anchor;
      }
      return null;
    }
    if (c.getTime() > now.getTime()) return stepDays(c, -days);
    return c;
  }

  /**
   * Finds the next upcoming scheduled return boundary after `now`, for display
   * in the "Next return" note.
   * @param {Date} now - the moment to search forward from.
   * @returns {Date} the next boundary strictly after `now`.
   */
  function nextBoundaryAfter(now) {
    var days = state.schedule.everyDays;
    var last = lastBoundaryBefore(now);
    var next = last || boundaryAt(now, state.schedule.atMinutes);
    while (next.getTime() <= now.getTime()) {
      next = stepDays(next, days);
    }
    return next;
  }

  /**
   * Checks whether a scheduled List 2 -> List 1 return boundary has been
   * crossed since the last check, and if so, performs it: moves everything in
   * List 2 back into List 1 and records the new `lastReturn` anchor. Safe to
   * call repeatedly (e.g. on every app-open/visibility-change) - it's a no-op
   * if no new boundary has been crossed.
   * @returns {boolean} true if items were actually moved this call.
   */
  function applyAutoReturn() {
    var now = getNow();
    var boundary = lastBoundaryBefore(now);
    if (!boundary) return false;
    var crossed;
    if (state.lastReturn) {
      crossed = boundary.getTime() > new Date(state.lastReturn).getTime();
    } else {
      crossed = boundary.getTime() <= now.getTime();
    }

    if (crossed && state.lists["2"].length > 0) {
      pushBoundary("List 2→1 transfer");
      state.lists["1"] = state.lists["1"].concat(state.lists["2"]);
      state.lists["2"] = [];
      state.lastReturn = boundary.toISOString();
      save();
      return true;
    }
    if (crossed) {
      state.lastReturn = boundary.toISOString();
      save();
    }
    return false;
  }

  // ---------------------- trash purge (compute on open) ----------------------
  /**
   * Permanently drops any trash entries older than the 7-day TTL (`WEEK_MS`).
   * Safe to call repeatedly; only saves if something changed.
   */
  function purgeTrash() {
    var now = getNow().getTime();
    var before = state.lists.trash.length;
    var keep = [];
    state.lists.trash.forEach(function (t) {
      if ((now - new Date(t.deletedAt).getTime()) < WEEK_MS) {
        keep.push(t);
      } else {
        delete state.itemsById[t.id];
      }
    });
    state.lists.trash = keep;
    if (keep.length !== before) {
      save();
    }
  }

  // ------------------- recurrence date helpers (compute on open) -------------
  /**
   * Formats a Date as the local "YYYY-MM-DD" key, used by `everyNWeeksOnDays`
   * rule anchors.
   * @param {Date} date - the date to key.
   * @returns {string} the date key.
   */
  function dateKeyFor(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" +
      pad(date.getDate());
  }

  /**
   * Parses a "YYYY-MM-DD" date key back into a local midnight Date.
   * @param {string} key - a date key as produced by `dateKeyFor`.
   * @returns {Date} the corresponding local midnight.
   */
  function parseDateKey(key) {
    var parts = key.split("-");
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1,
      parseInt(parts[2], 10));
  }

  /**
   * Whole number of calendar days from `a` to `b`, ignoring time-of-day.
   * @param {Date} a - start date.
   * @param {Date} b - end date.
   * @returns {number} days between them; negative if `b` is before `a`.
   */
  function daysBetween(a, b) {
    var ms = boundaryAt(b, 0).getTime() - boundaryAt(a, 0).getTime();
    return Math.round(ms / (24 * 60 * 60 * 1000));
  }

  /**
   * Finds the 1-based occurrence of `date`'s weekday within its month, plus
   * whether it's the last such occurrence - the two pieces
   * `nthWeekdayOfMonth` rules need.
   * @param {Date} date - the date to inspect.
   * @returns {{occurrence: number, isLast: boolean}}
   */
  function nthWeekdayInfo(date) {
    var occurrence = Math.floor((date.getDate() - 1) / 7) + 1;
    var lastOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0)
      .getDate();
    return {
      occurrence: occurrence,
      isLast: date.getDate() + 7 > lastOfMonth
    };
  }

  /**
   * Evaluates whether a recurrence rule fires on `date`, per the semantics
   * documented in `RECURRENCE_SCHEMA_TEXT`.
   * @param {Object} rule - the item's `recurrence.rule`.
   * @param {Object} item - the owning item (for `lastDone`, used by
   *   `everyNDays`).
   * @param {Date} date - the calendar day being evaluated.
   * @returns {boolean} true if the rule fires on `date`.
   */
  function ruleFires(rule, item, date) {
    var sinceDone, weeksSince, info;
    switch (rule.type) {
      case "daily":
        return true;
      case "everyNDays":
        if (!item.lastDone) return true;
        sinceDone = daysBetween(new Date(item.lastDone), date);
        return sinceDone >= 0 && sinceDone % rule.everyDays === 0;
      case "dayOfMonth":
        return rule.days.indexOf(date.getDate()) !== -1;
      case "everyNWeeksOnDays":
        if (rule.weekdays.indexOf(date.getDay()) === -1) return false;
        weeksSince = Math.floor(
          daysBetween(parseDateKey(rule.anchorDate), date) / 7);
        return weeksSince >= 0 && weeksSince % rule.everyWeeks === 0;
      case "nthWeekdayOfMonth":
        if (date.getDay() !== rule.weekday) return false;
        info = nthWeekdayInfo(date);
        if (rule.ordinal === -1) return info.isLast;
        return info.occurrence === rule.ordinal;
      case "yearly":
        if (date.getMonth() + 1 !== rule.month ||
          date.getDate() !== rule.day) {
          return false;
        }
        if (!rule.everyYears || rule.everyYears <= 1) return true;
        return (date.getFullYear() - rule.startYear) % rule.everyYears === 0;
      case "monthOfYear":
        return rule.months.indexOf(date.getMonth() + 1) !== -1 &&
          date.getDate() === rule.day;
      default:
        return false;
    }
  }

  /**
   * Links every unpaused, currently-unlinked recurring item whose rule now
   * fires into its `destination` list. Items still linked somewhere (not yet
   * completed since they last fired) are left alone - relinking would
   * duplicate them. Safe to call repeatedly (e.g. on every app-open/
   * visibility-change); only saves if something changed.
   */
  function placeRecurringItems() {
    var now = getNow();
    var changed = false;
    recurringIds().forEach(function (id) {
      var item = state.itemsById[id];
      var rec = item.recurrence;
      if (rec.paused) return;
      if (findItemListKey(id) !== null) return;
      if (!ruleFires(rec.rule, item, now)) return;
      item.isDone = false;
      state.lists[rec.destination].push(id);
      changed = true;
    });
    if (changed) save();
  }

  // ----------------------------- item operations -----------------------------
  /**
   * Finds an id's index within one of the id-array list keys. Safe to call
   * with a null/missing listKey (an unlinked, itemsById-only item) - returns
   * not-found rather than throwing.
   * @param {string|null} listKey - one of the `state.lists` keys (not
   *   "trash"), or null if the item isn't linked into any list.
   * @param {string} id - id of the item to find.
   * @returns {number} the index, or -1 if not present in that list.
   */
  function findIn(listKey, id) {
    if (!listKey || !state.lists[listKey]) return -1;
    return state.lists[listKey].indexOf(id);
  }

  /**
   * Finds a Trash entry's index by item id.
   * @param {string} id - id of the item to find in Trash.
   * @returns {number} the index, or -1 if not present in Trash.
   */
  function findInTrash(id) {
    return state.lists.trash.findIndex(function (t) { return t.id === id; });
  }

  /**
   * Finds which list currently holds an id, checking every real list key.
   * @param {string} id - id of the item to locate.
   * @returns {string|null} the list key it's in, or null if not found.
   */
  function findItemListKey(id) {
    for (var k = 0; k < CHAIN.length; k++) {
      if (state.lists[CHAIN[k]].indexOf(id) !== -1) {
        return CHAIN[k];
      }
    }
    return null;
  }

  /**
   * Collects ids of every item currently shown in the Completed view.
   * @returns {string[]} ids where `isDone` is true and `recurrence` is not
   *   set.
   */
  function completedIds() {
    return Object.keys(state.itemsById).filter(function (id) {
      var item = state.itemsById[id];
      return item.isDone && !item.recurrence && findInTrash(id) === -1;
    });
  }

  /**
   * Collects ids of every item currently shown in the Recurring view.
   * @returns {string[]} ids where `recurrence` is set (non-null).
   */
  function recurringIds() {
    return Object.keys(state.itemsById).filter(function (id) {
      return !!state.itemsById[id].recurrence && findInTrash(id) === -1;
    });
  }

  /**
   * Moves an item one step along the chain (0->1->2->2.5->3->4), in either
   * direction. No-ops if the item isn't found, or the move would fall off
   * either end of the chain.
   * @param {string} fromKey - chain key the item currently lives in.
   * @param {string} id - id of the item to move.
   * @param {number} dir - +1 to move down the chain, -1 to move up.
   */
  function moveChain(fromKey, id, dir) {
    var idx = CHAIN.indexOf(fromKey);
    if (idx === -1) return;
    var toKey = CHAIN[idx + dir];
    if (!toKey) return;
    var i = findIn(fromKey, id);
    if (i === -1) return;
    state.lists[fromKey].splice(i, 1);
    state.lists[toKey].push(id);
    save();
    render();
  }

  /**
   * Marks an item done and immediately unlinks it from its current list. It
   * lives on in `itemsById` only, surfacing through the Completed derived
   * view (or, for recurring items, the Recurring view) until it's placed
   * again.
   * @param {string} fromKey - list key the item currently lives in.
   * @param {string} id - id of the item to complete.
   */
  function completeItem(fromKey, id) {
    var item = state.itemsById[id];
    if (!item) return;
    pushUndo("Complete item");
    item.isDone = true;
    item.lastDone = getNow().toISOString();
    var i = findIn(fromKey, id);
    if (i !== -1) state.lists[fromKey].splice(i, 1);
    save();
    render();
  }

  /**
   * Marks an item not done and links it into list 2, regardless of which
   * list it's currently linked into.
   * @param {string} id - id of the item to uncomplete.
   */
  function uncompleteItem(id) {
    var item = state.itemsById[id];
    if (!item) return;
    pushUndo("Uncomplete item");
    item.isDone = false;
    var fromKey = findItemListKey(id);
    if (fromKey) {
      state.lists[fromKey].splice(findIn(fromKey, id), 1);
    }
    state.lists["2.5"].push(id);
    save();
    render();
  }

  /**
   * Moves an item out of its current list (if it's linked into one) and
   * into Trash, recording where it came from so Recover knows where to put
   * it back. An unlinked, itemsById-only item (fromKey null) has nothing to
   * unlink - it just gets a trash entry with a null origin directly.
   * @param {string|null} fromKey - list key the item currently lives in, or
   *   null if it isn't linked into any list.
   * @param {string} id - id of the item to trash.
   */
  function trashItem(fromKey, id) {
    pushUndo("Trash item");
    if (fromKey) {
      var i = findIn(fromKey, id);
      if (i !== -1) state.lists[fromKey].splice(i, 1);
    }
    state.lists.trash.push({
      id: id, origin: fromKey, deletedAt: getNow().toISOString()
    });
    save();
    render();
  }

  /**
   * Moves an item out of Trash and back into its recorded origin list, falling
   * back to List 3 if that list no longer exists, unless if it was completed 
   * or recurring (CAN be unlinked if it had no origin list)
   * @param {string} id - id of the item to recover.
   */
  function recoverItem(id) {
    var i = findInTrash(id);
    if (i === -1) return;
    pushUndo("Untrash item");
    var t = state.lists.trash.splice(i, 1)[0];
    var item = state.itemsById[t.id];
    if (state.lists[t.origin]) {
      state.lists[t.origin].push(t.id);
    } else if (!(item.isDone || item.recurrence)) {
      state.lists["3"].push(t.id);
    }
    save();
    render();
  }

  /**
   * Removes an item from Trash for good, ahead of its 7-day TTL.
   * @param {string} id - id of the item to permanently delete.
   */
  function permaDelete(id) {
    var i = findInTrash(id);
    if (i === -1) return;
    pushUndo("Permadelete item");
    state.lists.trash.splice(i, 1);
    delete state.itemsById[id];
    save();
    render();
  }

  /**
   * Overwrites an item's text in place, unless the trimmed replacement is empty
   * (treated as a cancel, leaving the original text untouched). Works
   * regardless of whether the item is linked into a list - its existence in
   * `itemsById` is the only thing that matters here.
   * @param {string} id - id of the item to edit.
   * @param {string} newText - proposed replacement text, untrimmed.
   */
  function editItem(id, newText) {
    if (!state.itemsById[id]) return;
    var v = newText.trim();
    if (v === "") return;
    pushUndo("Edit item text");
    state.itemsById[id].text = v;
    save();
    render();
  }

  /**
   * Overwrites (or clears) an item's note. A blank trimmed value deletes the
   * `.note` field entirely rather than storing an empty string. Works
   * regardless of whether the item is linked into a list.
   * @param {string} id - id of the item to edit.
   * @param {string} newNote - proposed replacement note, untrimmed.
   */
  function editNote(id, newNote) {
    if (!state.itemsById[id]) return;
    pushUndo("Edit item note");
    var v = newNote.trim();
    if (v) {
      state.itemsById[id].note = v;
      expandedNote = id;
    } else {
      delete state.itemsById[id].note;
      expandedNote = null;
    }
    save();
    render();
  }

  /**
   * Opens the note editor for a single item, expanding its note area.
   * @param {Object} item - the item object being edited.
   */
  function startNoteEdit(item) {
    editingNote = { id: item.id };
    expandedNote = item.id;
    render();
  }

  // -------------------------------- rendering --------------------------------
  var appEl = document.getElementById("app");

  /**
   * Rebuilds the entire `#app` DOM tree from the current in-memory `state` -
   * List 0, List 1, List 2 (with its two lists, 2 and 2.5), Completed,
   * List 3, List 4, Recurring, and Trash. Called after any state mutation.
   */
  function render() {
    closeAllMenus();
    editingNoteMounted = false;
    appEl.innerHTML = "";

    appEl.appendChild(renderCard("0", "List 0", { fixed: true }));

    appEl.appendChild(renderCard("1", "List 1",
      { fixed: true, randomizerTarget: "1" }));

    // List 2: fixed card, two lists (2 top, 2.5 bottom) split by
    // a divider, with Randomizer on list 2.
    var list2 = document.createElement("section");
    list2.className = "card list fixed";
    list2.appendChild(buildHead("2", "List 2", {
      randomizerTarget: "2",
      countKeys: ["2", "2.5"]
    }));

    list2.appendChild(buildItems("2", {
      randomizerTarget: "2"
    }));

    var div2 = document.createElement("div");
    div2.className = "divider";
    list2.appendChild(div2);

    var list2_5 = document.createElement("ul");
    list2_5.className = "items";
    fillList(list2_5, "2.5", true);
    list2.appendChild(list2_5);

    if (!(randomizer.active
      && randomizer.target === "2")) {
      list2.appendChild(buildAdder("2.5"));
    }
    appEl.appendChild(list2);

    // Completed purgatory (collapsible)
    appEl.appendChild(renderCard("completed", "Completed",
      {collapsible: true, kind: "completed"}));

    // List 3 (single-list, collapsible)
    appEl.appendChild(renderCard("3", "List 3",
      { collapsible: true }));

    appEl.appendChild(renderCard("4", "List 4",
      { collapsible: true }));

    appEl.appendChild(renderCard("recurring", "Recurring",
      {collapsible: true, kind: "recurring"}));

    appEl.appendChild(renderCard("trash", "Trash",
      { collapsible: true, kind: "trash" }));

    updateNextNote();
  }

  /**
   * Fills a list (one of the compartments of a split card) with rows for a
   * list key, or an "(empty)" placeholder if the list is empty.
   * @param {Element} ul - the `<ul class="items">` to fill.
   * @param {string} key - the `state.lists` key to render rows for.
   * @param {boolean} [isRandomizerList] - true for lists that support the
   *   randomizer (list 2.5, sharing List 2's own randomizer target).
   */
  function fillList(ul, key, isRandomizerList) {
    var ids = state.lists[key];
    if (ids.length === 0) {
      var empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = "(empty)";
      ul.appendChild(empty);
      return;
    }
    ids.forEach(function (id) {
      var item = state.itemsById[id];
      if (isRandomizerList && randomizer.active
        && randomizer.target === "2" && !item.isDone) {
        ul.appendChild(buildRandomizerRow(item));
        return;
      }
      ul.appendChild(buildMainRow(key, item));
    });
  }

  /**
   * Builds a single item row for randomizer mode: a plain label (plus a buy
   * tag and/or recurring tag when applicable), with no click handling of its
   * own - the randomizer animation drives highlighting externally.
   * @param {Object} item - the item to render.
   * @returns {Element} the `<li>` row.
   */
  function buildRandomizerRow(item) {
    var li = document.createElement("li");
    li.className = "item rnd-item";
    li.dataset.id = item.id;
    if (isBuyItem(item)) li.appendChild(buildBuyTag());
    if (item.recurrence) li.appendChild(buildRecurringTag());
    var label = document.createElement("span");
    label.className = "label";
    label.textContent = item.text;
    li.appendChild(label);
    return li;
  }

  /**
   * Builds a full list card: head, item rows, and (unless suppressed) an adder
   * row.
   * @param {string} key - the `state.lists` key this card renders.
   * @param {string} titleText - the card's displayed title.
   * @param {Object} [opts] - see `buildHead` and `buildItems` for the full set
   *   of recognized flags (fixed, collapsible, kind, etc.).
   * @returns {Element} the assembled card section.
   */
  function renderCard(key, titleText, opts) {
    opts = opts || {};
    var collapsed = opts.collapsible && state.collapsed[key];
    var card = document.createElement("section");
    var fixedClass = "";
    if (opts.fixed) {
      fixedClass = " fixed";
    }
    var collapsedClass = "";
    if (collapsed) {
      collapsedClass = " collapsed";
    }
    card.className = "card list" + fixedClass + collapsedClass;
    card.appendChild(buildHead(key, titleText, opts));
    card.appendChild(buildItems(key, opts));
    if (opts.kind === "recurring") {
      card.appendChild(buildRecurringAdder());
    } else if (opts.kind !== "trash" && opts.kind !== "completed"
      && !(randomizer.active
      && randomizer.target === opts.randomizerTarget)) {
        card.appendChild(buildAdder(key));
      }
    return card;
  }

  /**
   * Builds a card's header row: the collapse chevron, title, and whatever
   * header actions (Randomizer!/Done) apply given the card's mode and
   * current randomizer state.
   * @param {string} key - the `state.lists` key this header belongs to.
   * @param {string} titleText - the card's displayed title.
   * @param {Object} [opts] - flags: `collapsible`, `randomizerTarget`.
   * @returns {Element} the assembled `.list-head` element.
   */
  function buildHead(key, titleText, opts) {
    opts = opts || {};
    var head = document.createElement("div");
    head.className = "list-head";

    var chev = document.createElement("button");
    chev.className = "chev";
    chev.textContent = "▾";
    if (opts.collapsible) {
      var chevVerb = "Collapse ";
      if (state.collapsed[key]) {
        chevVerb = "Expand ";
      }
      chev.setAttribute("aria-label", chevVerb + titleText);
      chev.addEventListener("click", function () {
        state.collapsed[key] = !state.collapsed[key];
        save();
        render();
      });
    }
    head.appendChild(chev);

    var title = document.createElement("div");
    title.className = "title";
    var tname = document.createElement("span");
    tname.textContent = titleText;
    title.appendChild(tname);
    if (opts.collapsible) {
      title.style.cursor = "pointer";
      title.addEventListener("click", function () {
        state.collapsed[key] = !state.collapsed[key];
        save();
        render();
      });
    }
    head.appendChild(title);

    if (opts.randomizerTarget) {
      var headerActions = document.createElement("div");
      headerActions.className = "head-actions";

      var isThisRandomizer = (randomizer.active 
        && randomizer.target === opts.randomizerTarget);

      if (isThisRandomizer) {
        var doneBtn = document.createElement("button");
        doneBtn.className = "head-btn";
        doneBtn.textContent = "Done";
        doneBtn.addEventListener("click", function () {
          randomizerGen++;
          randomizer = { active: false, target: null, winnerId: null, 
            highlightId: null, done: false };
          render();
        });
        headerActions.appendChild(doneBtn);
      } else {
        if (opts.randomizerTarget) {
          var randBtn = document.createElement("button");
          randBtn.className = "head-btn";
          randBtn.textContent = "Randomizer!";
          randBtn.addEventListener("click", function () {
            var keys = randomizerKeys(opts.randomizerTarget);
            var allItems = [];
            keys.forEach(function (k) {
              state.lists[k].forEach(function (id) {
                var item = state.itemsById[id];
                if (!item.isDone) allItems.push(item);
              });
            });
            if (allItems.length === 0) {
              toast("No items to randomize!");
              return;
            }
            randomizer = { active: true, target: opts.randomizerTarget, 
              winnerId: null, highlightId: null, done: false };
            render();
            setTimeout(function () { runRandomizerAnimation(); }, 100);
          });
          headerActions.appendChild(randBtn);
        }
      }
      head.appendChild(headerActions);
    }

    if (!opts.noCount) {
      var count = document.createElement("span");
      count.className = "count";
      var n;
      if (opts.kind === "completed") {
        n = completedIds().length;
      } else if (opts.kind === "recurring") {
        n = recurringIds().length;
      } else if (opts.countKeys) {
        n = opts.countKeys.reduce(function (sum, k) {
          return sum + state.lists[k].length; }, 0);
      } else {
        n = state.lists[key].length;
      }
      count.textContent = n;
      head.appendChild(count);
    }

    return head;
  }

  /**
   * Builds a card's item list: an "(empty)" placeholder, or one row per item
   * using whichever row builder matches the card's current mode (randomizer,
   * trash, completed, or the default main row).
   * @param {string} key - the `state.lists` key to render rows for.
   * @param {Object} [opts] - flags: `randomizerTarget`, `kind`.
   * @returns {Element} the assembled `<ul class="items">` element.
   */
  function buildItems(key, opts) {
    opts = opts || {};
    var ul = document.createElement("ul");
    ul.className = "items";

    if (opts.kind === "trash") {
      var trashArr = state.lists.trash;
      if (trashArr.length === 0) {
        var emptyTrash = document.createElement("li");
        emptyTrash.className = "empty";
        emptyTrash.textContent = "(empty)";
        ul.appendChild(emptyTrash);
        return ul;
      }
      trashArr.forEach(function (entry) {
        ul.appendChild(buildTrashRow(entry));
      });
      return ul;
    }

    var ids;
    if (opts.kind === "completed") {
      ids = completedIds();
    } else if (opts.kind === "recurring") {
      ids = recurringIds();
    } else {
      ids = state.lists[key];
    }
    if (ids.length === 0) {
      var empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = "(empty)";
      ul.appendChild(empty);
      return ul;
    }

    ids.forEach(function (id) {
      var item = state.itemsById[id];
      if (randomizer.active && randomizer.target === opts.randomizerTarget) {
        ul.appendChild(buildRandomizerRow(item));
      }
      else if (opts.kind === "completed") {
        ul.appendChild(buildCompletedRow(item));
      }
      else if (opts.kind === "recurring") {
        ul.appendChild(buildRecurringRow(item));
      }
      else ul.appendChild(buildMainRow(key, item));
    });
    return ul;
  }

  /**
   * Checks whether an item's text starts with the word "buy" - used to decide
   * whether to show the shopping-cart tag next to it.
   * @param {Object} item - the item to test.
   * @returns {boolean} true if the item's text starts with "buy".
   */
  function isBuyItem(item) {
    return /^buy\b/i.test(item.text);
  }

  /**
   * Builds the shopping-cart emoji tag shown next to "buy"-prefixed items.
   * @returns {Element} the tag `<span>`.
   */
  function buildBuyTag() {
    var tag = document.createElement("span");
    tag.className = "buy-tag";
    tag.textContent = "🛒";
    return tag;
  }

  /**
   * Builds the recurring-loop emoji tag shown next to items with recurrence
   * set, wherever they render.
   * @returns {Element} the tag `<span>`.
   */
  function buildRecurringTag() {
    var tag = document.createElement("span");
    tag.className = "recurring-tag";
    tag.textContent = "🔁";
    return tag;
  }

  /**
   * Builds a standard chain-list row: [check] [cart?] [recur?] [label]
   * [pencil] [hamburger], with swipe gestures attached.
   * @param {string} key - list key the item currently lives in.
   * @param {Object} item - the item to render.
   * @returns {Element} the `<li>` row.
   */
  function buildMainRow(key, item) {
    var li = document.createElement("li");
    li.className = "item";
    if (item.isDone) {
      li.className += " done";
    }
    li.dataset.id = item.id;

    var onToggle;
    if (item.isDone) {
      onToggle = function () { uncompleteItem(item.id); };
    } else {
      onToggle = function () { completeItem(key, item.id); };
    }
    li.appendChild(buildCheck(item.isDone, onToggle));
    if (isBuyItem(item)) li.appendChild(buildBuyTag());
    if (item.recurrence) li.appendChild(buildRecurringTag());
    li.appendChild(buildLabel(item));

    var actions = document.createElement("div");
    actions.className = "row-actions";
    actions.appendChild(buildPencil(item, li));
    actions.appendChild(buildHamburger(key, item));
    li.appendChild(actions);

    attachSwipe(li, key, item.id);
    return li;
  }

  /**
   * Builds a Completed-list row: [ticked check] [grey label] [pencil]
   * [hamburger], with an up-only swipe gesture attached.
   * @param {Object} item - the item to render.
   * @returns {Element} the `<li>` row.
   */
  function buildCompletedRow(item) {
    var li = document.createElement("li");
    li.className = "item done";
    li.dataset.id = item.id;

    var key = findItemListKey(item.id);

    li.appendChild(buildCheck(true, function () { uncompleteItem(item.id); }));
    if (isBuyItem(item)) li.appendChild(buildBuyTag());
    li.appendChild(buildLabel(item));

    var actions = document.createElement("div");
    actions.className = "row-actions";
    actions.appendChild(buildPencil(item, li));
    actions.appendChild(buildHamburger(key, item, true));
    li.appendChild(actions);

    attachSwipeUpOnly(li, item.id);
    return li;
  }

  /**
   * Builds a Recurring-view row: [greyed check] [cart?] [recur] [label]
   * [pencil] [hamburger]. This is a filtered view over live items sitting in
   * their real lists, not a separate list of its own, so there's no move
   * up/down, no swipe gesture, and the checkbox is a non-interactive status
   * display rather than an actionable one - check/uncheck happens from the
   * item's real list instead.
   * @param {Object} item - the item to render.
   * @returns {Element} the `<li>` row.
   */
  function buildRecurringRow(item) {
    var li = document.createElement("li");
    li.className = "item";
    if (item.isDone) {
      li.className += " done";
    }
    li.dataset.id = item.id;

    var key = findItemListKey(item.id);

    li.appendChild(buildCheckDisplay(item.isDone));
    if (isBuyItem(item)) li.appendChild(buildBuyTag());
    li.appendChild(buildRecurringTag());
    li.appendChild(buildLabel(item));

    var actions = document.createElement("div");
    actions.className = "row-actions";
    actions.appendChild(buildPencil(item, li));
    actions.appendChild(buildHamburger(key, item, true));
    li.appendChild(actions);

    return li;
  }

  /**
   * Builds a Trash-list row: [grey label + time-to-live] [Recover] [permanent
   * delete].
   * @param {Object} entry - the trash entry (`{id, origin, deletedAt}`) to
   *   render; its text/note are resolved from `state.itemsById`.
   * @returns {Element} the `<li>` row.
   */
  function buildTrashRow(entry) {
    var item = state.itemsById[entry.id];
    var li = document.createElement("li");
    li.className = "item trash-item";
    li.dataset.id = entry.id;

    var wrap = document.createElement("div");
    wrap.className = "label-wrap";
    var label = document.createElement("span");
    label.className = "label";
    label.textContent = item.text;
    wrap.appendChild(label);

    var days = Math.max(0,
      Math.ceil((WEEK_MS - (getNow().getTime() -
      new Date(entry.deletedAt).getTime())) / (24*60*60*1000)));
    var ttl = document.createElement("div");
    ttl.className = "ttl";
    var dayWord = " days";
    if (days === 1) {
      dayWord = " day";
    }
    ttl.textContent = "deletes in " + days + dayWord;
    wrap.appendChild(ttl);
    li.appendChild(wrap);

    var actions = document.createElement("div");
    actions.className = "row-actions";
    var rec = document.createElement("button");
    rec.className = "recover-btn";
    rec.textContent = "Recover";
    rec.addEventListener("click", function () { recoverItem(entry.id); });
    actions.appendChild(rec);

    var perm = mkMini("✕", "Delete permanently");
    perm.classList.add("trash");
    perm.addEventListener("click", function () { permaDelete(entry.id); });
    actions.appendChild(perm);

    li.appendChild(actions);
    return li;
  }

  // ---------------------------- shared row pieces ----------------------------
  /**
   * Builds the checkbox button shared by main and completed rows.
   * @param {boolean} ticked - whether to render it already checked.
   * @param {Function} onToggle - click handler.
   * @returns {Element} the check `<button>`.
   */
  function buildCheck(ticked, onToggle) {
    var btn = document.createElement("button");
    btn.className = "check";
    var checkLabel = "Mark as done";
    if (ticked) {
      checkLabel = "Mark as not done";
    }
    btn.setAttribute("aria-label", checkLabel);
    var box = document.createElement("span");
    box.className = "box";
    btn.appendChild(box);
    btn.addEventListener("click", onToggle);
    return btn;
  }

  /**
   * Builds a greyed-out, non-interactive stand-in for the checkbox, used
   * where an item's done state should show but not be toggleable
   * @param {boolean} ticked - whether the item is currently done.
   * @returns {Element} the check `<span>`.
   */
  function buildCheckDisplay(ticked) {
    var span = document.createElement("span");
    span.className = "check disabled";
    var statusLabel = "Not done";
    if (ticked) {
      statusLabel = "Done";
    }
    span.setAttribute("aria-label", statusLabel);
    var box = document.createElement("span");
    box.className = "box";
    span.appendChild(box);
    return span;
  }

  /**
   * Builds an item's label area: the text (with a note marker if it has one),
   * an inline note editor when this item's note is being edited, or the
   * expanded note text when tapped open.
   * @param {Object} item - the item to render.
   * @returns {Element} the `.label-wrap` element.
   */
  function buildLabel(item) {
    var wrap = document.createElement("div");
    wrap.className = "label-wrap";

    var label = document.createElement("span");
    label.className = "label";
    label.textContent = item.text;
    if (item.note) {
      var marker = document.createElement("span");
      marker.className = "note-marker";
      marker.textContent = "*";
      label.appendChild(marker);
    }
    wrap.appendChild(label);

    if (editingNote && editingNote.id === item.id && !editingNoteMounted) {
      editingNoteMounted = true;
      var ta = document.createElement("textarea");
      ta.className = "item-note-edit";
      ta.value = item.note || "";
      ta.placeholder = "Add a note...";
      ta.rows = 1;
      wrap.appendChild(ta);
      /**
       * Grows the note textarea to fit its content, since notes have no fixed
       * height.
       */
      function autoSize() {
        ta.style.height = "auto";
        ta.style.height = ta.scrollHeight + "px";
      }
      ta.addEventListener("input", autoSize);
      setTimeout(function () {
        autoSize();
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }, 0);
      var committed = false;
      /**
       * Saves the note edit exactly once (guarded against firing twice from
       * both the Enter keydown and the subsequent blur).
       */
      function commit() {
        if (committed) return;
        committed = true;
        editingNote = null;
        editNote(item.id, ta.value);
      }
      ta.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          committed = true;
          editingNote = null;
          render();
        }
      });
      ta.addEventListener("blur", commit);
    } else if (item.note && expandedNote === item.id) {
      var noteEl = document.createElement("div");
      noteEl.className = "item-note";
      noteEl.textContent = item.note;
      wrap.appendChild(noteEl);
    }

    wrap.addEventListener("click", function (e) {
      if (e.target.closest("button") || e.target.closest(".label-edit") || e.target.closest(".item-note-edit")) return;
      if (!item.note) return;
      if (expandedNote === item.id) {
        expandedNote = null;
      } else {
        expandedNote = item.id;
      }
      render();
    });

    return wrap;
  }

  /**
   * Builds the pencil (edit) button for a row.
   * @param {Object} item - the item this button edits.
   * @param {Element} li - the row's `<li>`, passed through to `startEdit` so it
   *   can be swapped for an inline editor.
   * @returns {Element} the pencil button.
   */
  function buildPencil(item, li) {
    var btn = mkMini("✎", "Edit");
    btn.addEventListener("click", function () { startEdit(li, item); });
    return btn;
  }

  /**
   * Builds a standalone trash (delete) button, used outside the hamburger menu.
   * @param {Function} onClick - click handler.
   * @param {Object} item - the item this button acts on (unused directly here,
   *   kept for signature symmetry with other builders).
   * @returns {Element} the trash button.
   */
  function buildTrashBtn(onClick, item) {
    var btn = mkMini("🗑", "Delete");
    btn.classList.add("trash");
    btn.addEventListener("click", onClick);
    return btn;
  }

  /**
   * Closes any open item hamburger menu and clears the tracked open button.
   * Safe to call when no menu is open.
   */
  var menuOpenBtn = null;
  function closeAllMenus() {
    var open = document.querySelectorAll(".item-menu");
    open.forEach(function (m) { m.remove(); });
    menuOpenBtn = null;
  }
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".menu-anchor")) closeAllMenus();
    if (expandedNote && !editingNote
      && !e.target.closest(
        ".item[data-id=\"" + expandedNote + "\"]"
      )) {
      expandedNote = null;
      render();
    }
  });

  /**
   * Builds a row's hamburger button and its dropdown menu (move up/down, edit
   * note, edit recurrence, delete). The menu itself is built lazily on click
   * and torn down by `closeAllMenus`.
   * @param {string} key - list key the item currently lives in.
   * @param {Object} item - the item this menu acts on.
   * @param {boolean} [hideMove] - suppress the Move up/down entries.
   * @returns {Element} the `.menu-anchor` wrapper containing the button.
   */
  function buildHamburger(key, item, hideMove) {
    var wrap = document.createElement("div");
    wrap.className = "menu-anchor";
    var btn = mkMini("☰", "More options");
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (menuOpenBtn === btn) {
        closeAllMenus();
        return;
      }
      closeAllMenus();
      menuOpenBtn = btn;
      var menu = document.createElement("div");
      var menuTodayClass = "";
      if (key === "0" || key === "1") {
        menuTodayClass = " item-menu-today";
      }
      menu.className = "item-menu" + menuTodayClass;

      var isChain = !hideMove && CHAIN.indexOf(key) !== -1;

      if (isChain) {
        if (key !== "0") {
          var up = document.createElement("button");
          up.textContent = "Move up";
          up.addEventListener("click", function () { 
            moveChain(key, item.id, -1); });
          menu.appendChild(up);
        }

        if (key !== "4") {
          var down = document.createElement("button");
          down.textContent = "Move down";
          down.addEventListener("click", function () { 
            moveChain(key, item.id, 1); });
          menu.appendChild(down);
        }
      }

      var note = document.createElement("button");
      note.textContent = "Edit note";
      note.addEventListener("click", function () {
        closeAllMenus();
        startNoteEdit(item);
      });
      menu.appendChild(note);

      var recurrenceBtn = document.createElement("button");
      recurrenceBtn.textContent = "Edit recurrence";
      recurrenceBtn.addEventListener("click", function () {
        closeAllMenus();
        openRecurrenceEditor(item);
      });
      menu.appendChild(recurrenceBtn);

      var del = document.createElement("button");
      del.className = "danger";
      del.textContent = "Delete";
      del.addEventListener("click", function () { trashItem(key, item.id); });
      menu.appendChild(del);

      var rect = btn.getBoundingClientRect();
      menu.style.top = (rect.bottom + 4) + "px";
      menu.style.right = (window.innerWidth - rect.right) + "px";
      document.body.appendChild(menu);
    });
    wrap.appendChild(btn);
    return wrap;
  }

  /**
   * Builds a small icon-only button (used for pencil, trash, hamburger, and the
   * trash-list permanent-delete button).
   * @param {string} glyph - the button's text content (an icon glyph).
   * @param {string} label - accessible label, also used as the tooltip.
   * @returns {Element} the button.
   */
  function mkMini(glyph, label) {
    var b = document.createElement("button");
    b.className = "mini";
    b.textContent = glyph;
    b.title = label;
    b.setAttribute("aria-label", label);
    return b;
  }

  /**
   * Swaps an item row's label for an inline text input, wired to commit the
   * edit on Enter or blur.
   * @param {Element} li - the row's `<li>`.
   * @param {Object} item - the item being edited.
   */
  function startEdit(li, item) {
    var label = li.querySelector(".label");
    if (!label || li.querySelector(".label-edit")) return;
    var input = document.createElement("input");
    input.className = "label-edit";
    input.type = "text";
    input.value = item.text;
    label.replaceWith(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    var committed = false;
    /**
     * Saves the edit exactly once (guarded against firing twice from both the
     * Enter keydown and the subsequent blur).
     */
    function commit() {
      if (committed) return;
      committed = true;
      editItem(item.id, input.value);  // empty = cancel inside
      if (!input.value.trim()) render();     // restore label on cancel
    }
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        commit();
      }
    });
    input.addEventListener("blur", commit);
  }

  /**
   * Builds the "Add..." input + button row shown at the bottom of a list.
   * @param {string} key - the `state.lists` key new items are added to.
   * @returns {Element} the assembled `.adder` row.
   */
  function buildAdder(key) {
    var adder = document.createElement("div");
    adder.className = "adder";
    var input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Add...";
    input.setAttribute("aria-label", "Add an item");
    var addBtn = document.createElement("button");
    addBtn.className = "primary";
    addBtn.textContent = "Add";
    /**
     * Reads the input, pushes a new item if non-blank, and resets the input.
     */
    function commit() {
      var v = input.value.trim();
      if (!v) return;
      pushUndo("Add item");
      var id = uid();
      state.itemsById[id] = {
        id: id, text: v, isDone: false, lastDone: null
      };
      state.lists[key].push(id);
      input.value = "";
      save();
      render();
    }
    addBtn.addEventListener("click", commit);
    input.addEventListener("keydown", function (e) { 
      if (e.key === "Enter") commit(); });
    adder.appendChild(input);
    adder.appendChild(addBtn);
    return adder;
  }

  /**
   * Builds the Recurring card's adder. Unlike a normal adder, committing
   * doesn't create the item directly - it opens the recurrence editor first,
   * and the item only gets created (not linked to any list) once a valid
   * recurrence dict is saved there.
   * @returns {Element} the assembled `.adder` row.
   */
  function buildRecurringAdder() {
    var adder = document.createElement("div");
    adder.className = "adder";
    var input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Add...";
    input.setAttribute("aria-label", "Add a recurring item");
    var addBtn = document.createElement("button");
    addBtn.className = "primary";
    addBtn.textContent = "Add Rc.";
    /**
     * Reads the input and, if non-blank, opens the recurrence editor for a
     * new item with that text.
     */
    function commit() {
      var v = input.value.trim();
      if (!v) return;
      openNewRecurringItemEditor(v);
    }
    addBtn.addEventListener("click", commit);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") commit(); });
    adder.appendChild(input);
    adder.appendChild(addBtn);
    return adder;
  }

  // -------------------------- randomizer animation ---------------------------
  /**
   * Maps a randomizer target to the list keys it draws from. "today" pools 
   * list 0 and list 1; "2" pools list 2 and list 2.5; anything else is just 
   * itself.
   * @param {string} target - a randomizerTarget value ("today", "2", ...).
   * @returns {string[]} the list keys to pool together.
   */
  function randomizerKeys(target) {
    if (target === "today") return ["0", "1"];
    if (target === "2") return ["2", "2.5"];
    return [target];
  }

  /**
   * Runs the randomizer's slot-machine-style highlight animation: picks a
   * winner up front, then ticks through items with slowing timing until it
   * lands on the winner. A no-op if the target list is empty; skips straight to
   * the winner if it has exactly one item.
   */
  function runRandomizerAnimation() {
    var gen = ++randomizerGen;
    var keys = randomizerKeys(randomizer.target);
    var allItems = [];
    keys.forEach(function (k) {
      state.lists[k].forEach(function (id) {
        var item = state.itemsById[id];
        if (!item.isDone) allItems.push(item);
      });
    });
    if (allItems.length === 0) return;
    if (allItems.length === 1) {
      randomizer.winnerId = allItems[0].id;
      randomizer.highlightId = allItems[0].id;
      randomizer.done = true;
      blinkWinner(gen);
      return;
    }

    var winnerIdx = Math.floor(Math.random() * allItems.length);
    randomizer.winnerId = allItems[winnerIdx].id;

    var cycles = 1 + Math.floor(Math.random() * 3);
    var totalTicks = allItems.length * cycles + winnerIdx;
    var currentTick = 0;

    /**
     * Advances the randomizer highlight by one item and schedules the next tick
     * with slowing delay, until `totalTicks` is reached and the animation lands
     * on the pre-chosen winner. Bails out early if `randomizerGen` has moved on
     * (a newer randomizer run started).
     */
    function tick() {
      if (gen !== randomizerGen) return;
      var itemIdx = currentTick % allItems.length;
      randomizer.highlightId = allItems[itemIdx].id;

      var items = document.querySelectorAll(".rnd-item");
      items.forEach(function (el) {
        el.classList.toggle("rnd-highlight", el.dataset.id === randomizer.highlightId);
      });

      var highlighted = document.querySelector(".rnd-item.rnd-highlight");
      if (highlighted) highlighted.scrollIntoView({ block: "nearest", behavior: "smooth" });

      currentTick++;
      if (currentTick <= totalTicks) {
        var progress = currentTick / totalTicks;
        var delay = 50 + 400 * Math.pow(progress, 3);
        setTimeout(tick, delay);
      } else {
        randomizer.done = true;
        blinkWinner(gen);
      }
    }

    tick();
  }

  /**
   * Blinks the randomizer's winning item 4 times, then leaves it highlighted.
   * Bails out early if `randomizerGen` has moved on (a newer randomizer run
   * started).
   * @param {number} gen - the `randomizerGen` snapshot this run belongs to.
   */
  function blinkWinner(gen) {
    var el = document.querySelector('.rnd-item[data-id="' + randomizer.winnerId + '"]');
    if (!el) return;
    var blinks = 0;
    /**
     * Toggles the winner's highlight class once and reschedules itself, up to 4
     * blinks.
     */
    function blink() {
      if (gen !== randomizerGen) return;
      if (blinks >= 4) {
        el.classList.add("rnd-highlight");
        return;
      }
      el.classList.toggle("rnd-highlight");
      blinks++;
      setTimeout(blink, 250);
    }
    el.classList.remove("rnd-highlight");
    setTimeout(function () { if (gen === randomizerGen) blink(); }, 200);
  }

  // ---------------------------------- swipe ----------------------------------
  /**
   * Wires up a chain-list row's swipe gesture: left moves the item up the
   * chain, right moves it down.
   * @param {Element} el - the row's `<li>`.
   * @param {string} key - list key the item currently lives in.
   * @param {string} id - id of the item to move.
   */
  function attachSwipe(el, key, id) {
    swipeCore(el, function (dir) {
      if (dir === "left") moveChain(key, id, -1);
      else moveChain(key, id, 1);
    });
  }
  /**
   * Wires up a Completed row's swipe gesture: only a left ("up") swipe does
   * anything, reviving the item back to List 2.
   * @param {Element} el - the row's `<li>`.
   * @param {string} id - id of the item to revive.
   */
  function attachSwipeUpOnly(el, id) {
    swipeCore(el, function (dir) {
      if (dir === "left") uncompleteItem(id);
    });
  }

  /**
   * Attaches the shared horizontal-swipe-to-commit gesture to a row: tracks
   * touch movement, applies a live drag transform/opacity/tint once past a
   * small deadzone, and on release either snaps back or commits (calling
   * `onCommit` with "left"/"right") if the drag passed the commit threshold.
   * @param {Element} el - the row element to attach the gesture to.
   * @param {Function} onCommit - called with `"left"` or `"right"` when a swipe
   *   is committed.
   */
  function swipeCore(el, onCommit) {
    var startX = 0;
    var startY = 0;
    var dx = 0;
    var dy = 0;
    var tracking = false;
    var swiped = false;
    var THRESH = 80;
    var origBg = "";
    el.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1) return;
      if (e.target.closest(".label-edit")) {
        tracking = false;
        return;
      }
      tracking = true;
      swiped = false;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      dx = 0;
      dy = 0;
      origBg = el.style.backgroundColor;
    }, { passive: true });
    el.addEventListener("touchmove", function (e) {
      if (!tracking) return;
      dx = e.touches[0].clientX - startX;
      dy = e.touches[0].clientY - startY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
        swiped = true;
        el.style.transform = "translateX(" + dx * 0.5 + "px)";
        el.style.opacity = String(Math.max(0.4, 1 - Math.abs(dx) / 300));
        if (Math.abs(dx) > THRESH) {
          el.style.backgroundColor = "color-mix(in srgb, var(--success) 30%, transparent)";
        } else {
          el.style.backgroundColor = origBg;
        }
      }
    }, { passive: true });
    el.addEventListener("touchend", function (e) {
      if (!tracking) return;
      tracking = false;
      el.style.transform = "";
      el.style.opacity = "";
      el.style.backgroundColor = origBg;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > THRESH) {
        // a real swipe happened: stop the underlying button's click from firing
        var btn = e.target.closest("button");
        if (btn) {
          var swallow = function (ev) {
            ev.stopPropagation();
            ev.preventDefault();
            btn.removeEventListener("click", swallow, true);
          };
          btn.addEventListener("click", swallow, true);
          setTimeout(function () { btn.removeEventListener("click", swallow, true); }, 350);
        }
        var swipeDir = "right";
        if (dx < 0) {
          swipeDir = "left";
        }
        onCommit(swipeDir);
      }
    });
  }

  // ------------------------------- schedule UI -------------------------------
  var everyEl = document.getElementById("every");
  var atHourEl = document.getElementById("atHour");
  var atMinEl = document.getElementById("atMin");
  var nextNote = document.getElementById("nextNote");

  /**
   * Zero-pads a number below 10 to two digits.
   * @param {number} n - the number to pad.
   * @returns {string} the padded value, e.g. "05".
   */
  function pad(n) {
    var prefix = "";
    if (n < 10) {
      prefix = "0";
    }
    return prefix + n;
  }
  /**
   * Populates the schedule inputs (every/hour/minute) from `state`.
   */
  function syncScheduleInputs() {
    everyEl.value = state.schedule.everyDays;
    atHourEl.value = Math.floor(state.schedule.atMinutes / 60);
    atMinEl.value = pad(state.schedule.atMinutes % 60);
  }
  /**
   * Parses and clamps a raw input value into an integer range.
   * @param {*} v - raw input value (typically a string from an input).
   * @param {number} lo - inclusive lower bound, and fallback for NaN.
   * @param {number} hi - inclusive upper bound.
   * @returns {number} the clamped integer.
   */
  function clamp(v, lo, hi) {
    v = parseInt(v, 10);
    if (isNaN(v)) {
      v = lo;
    }
    return Math.max(lo, Math.min(hi, v));
  }
  /**
   * Handles a change on any schedule input: reads and clamps the
   * every/hour/minute fields, writes the new schedule to `state`, and refreshes
   * the "Next return" note.
   */
  function onScheduleChange() {
    pushUndo("Edit return schedule");
    var ed = parseInt(everyEl.value, 10);
    if (!(ed >= 1)) {
      ed = 1;
    }
    state.schedule.everyDays = ed;
    everyEl.value = ed;
    var h = clamp(atHourEl.value, 0, 23);
    var m = clamp(atMinEl.value, 0, 59);
    atHourEl.value = h;
    atMinEl.value = pad(m);
    state.schedule.atMinutes = h * 60 + m;
    save();
    updateNextNote();
  }
  everyEl.addEventListener("change", onScheduleChange);
  atHourEl.addEventListener("change", onScheduleChange);
  atMinEl.addEventListener("change", onScheduleChange);

  /**
   * Refreshes the "Next return" note with the next scheduled boundary.
   */
  function updateNextNote() {
    var next = nextBoundaryAfter(getNow());
    nextNote.textContent = "Next return: " + next.toLocaleString("en-CA",
      { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  }

  // ----------------------------- export / import -----------------------------
  /**
   * Serializes the whole state object for export.
   * @returns {string} pretty-printed JSON of `state`.
   */
  function exportJSON() { return JSON.stringify(state, null, 2); }
  /**
   * Records the current moment as the last export time and refreshes the
   * displayed "last exported" note.
   */
  function markExported() {
    pushUndo("Mark exported");
    state.lastExported = getNow().toISOString();
    save();
    updateLastExported();
  }
  /**
   * Parses and imports a JSON export, after user confirmation, fully replacing
   * the current state on success.
   * @param {string} text - candidate JSON text to import.
   * @returns {boolean} true if the import succeeded.
   */
  function importFromText(text) {
    if (!window.confirm(
      "Import will replace everything currently " +
      "in these lists. Continue?"
    )) return;
    try {
      pushUndo("Import");
      state = normalise(JSON.parse(text));
      save();
      syncScheduleInputs();
      render();
      toast("Imported.");
      return true;
    } catch (e) {
      toast("That text could not be read as valid JSON.");
      return false;
    }
  }

  // modal helpers
  /**
   * Wraps arbitrary content in a modal overlay and appends it to the document,
   * closing on a click outside the modal box.
   * @param {Element} content - the content to place inside the modal.
   * @returns {Element} the overlay element (call `.remove()` to close).
   */
  function showModal(content) {
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    var box = document.createElement("div");
    box.className = "modal-box";
    box.appendChild(content);
    overlay.appendChild(box);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  // ---------------------------- recurrence editor ----------------------------
  var RECURRENCE_SCHEMA_TEXT = [
    "recurrence = null | {",
    "  destination: \"0\" | \"1\" | \"2.5\", paused: boolean,",
    "  rule:",
    "    { type: \"daily\" }",
    "      // fires every single day unconditionally",
    "  | { type: \"everyNDays\", everyDays: int }",
    "      // recurs when (today - item.lastDone) % everyDays == 0",
    "      // anchored to lastDone.",
    "  | { type: \"everyNWeeksOnDays\", everyWeeks: int, weekdays: int[] (0-6),",
    "      anchorDate: \"YYYY-MM-DD\" }",
    "      // recurs when weekday matches AND",
    "      // floor(weeksSince(anchorDate)) % everyWeeks == 0",
    "  | { type: \"dayOfMonth\", days: int[] (each 1-31) }",
    "      // recurs when today's day-of-month is in `days`",
    "  | { type: \"nthWeekdayOfMonth\", ordinal: int (1,2,3,4, or -1=last),",
    "      weekday: int (0-6) }",
    "      // recurs when today is the `ordinal`-th occurrence of",
    "      // `weekday` this month",
    "  | { type: \"monthOfYear\", months: int[] (each 1-12), day: int (1-31) }",
    "      // recurs when today's month is in `months` AND today's",
    "      // day-of-month == day",
    "  | { type: \"yearly\", month: int (1-12), day: int (1-31),",
    "      everyYears: int = 1, startYear?: int (required if",
    "      everyYears > 1) }",
    "      // recurs when month+day match AND (if everyYears>1)",
    "      // (year - startYear) % everyYears == 0",
    "}"
  ].join("\n");

  /**
   * Structurally validates a parsed recurrence dict (does not check
   * per-kind field values like day ranges, only the shape every kind
   * shares).
   * @param {*} r - the parsed value to validate.
   * @returns {string|null} an error message, or null if valid.
   */
  function validateRecurrence(r) {
    if (!r || typeof r !== "object") return "Recurrence must be an object.";
    if (["0", "1", "2.5"].indexOf(r.destination) === -1) {
      return "destination must be \"0\", \"1\", or \"2.5\".";
    }
    if (typeof r.paused !== "boolean") {
      return "paused must be true or false.";
    }
    if (!r.rule || typeof r.rule !== "object") {
      return "rule must be an object.";
    }
    if (RECURRENCE_KINDS.indexOf(r.rule.type) === -1) {
      return "rule.type must be one of: " + RECURRENCE_KINDS.join(", ");
    }
    return null;
  }

  // ---------------- recurrence-editor GUI component builders ----------------

  // per-kind labels shown as the type dropdown's option text
  var TYPE_LABELS = {
    daily:
      "daily",
    everyNDays:
      "every N days",
    everyNWeeksOnDays:
      "specific days of week",
    dayOfMonth:
      "specific days of month",
    nthWeekdayOfMonth:
      "Nth weekday of the month",
    monthOfYear:
      "specific months of year",
    yearly:
      "yearly on date"
  };

  /**
   * Builds a 3-way segmented toggle for the recurrence destination
   * list key ("0", "1", or "2.5").
   * @returns {{el: Element, getValue: function(): (string|null),
   *   setValue: function(string)}} the control.
   */
  function buildDestToggle() {
    var vals = ["0", "1", "2.5"];
    var wrap = document.createElement("div");
    wrap.className = "rec-dest-toggle";
    var btns = [];
    for (var i = 0; i < vals.length; i++) {
      var b = document.createElement(
        "button"
      );
      b.type = "button";
      b.className = "rec-dest-opt";
      b.textContent = vals[i];
      b.dataset.val = vals[i];
      btns.push(b);
      wrap.appendChild(b);
    }
    wrap.addEventListener(
      "click",
      function (e) {
        var opt = e.target.closest(
          ".rec-dest-opt"
        );
        if (!opt) return;
        var wasActive = opt.classList.contains(
          "active"
        );
        btns.forEach(function (b) {
          b.classList.remove("active");
        });
        if (!wasActive) {
          opt.classList.add("active");
        }
      }
    );
    return {
      el: wrap,
      getValue: function () {
        var a =
          wrap.querySelector(".active");
        if (a) return a.dataset.val;
        return null;
      },
      setValue: function (v) {
        var idx = vals.indexOf(v);
        if (idx === -1) return;
        btns.forEach(function (b) {
          b.classList.remove("active");
        });
        btns[idx].classList.add("active");
      }
    };
  }

  /**
   * Builds a toggle button switching a recurrence between "Ongoing"
   * and "Paused" display states.
   * @returns {{el: Element, getValue: function(): boolean,
   *   setValue: function(boolean)}} the control.
   */
  function buildPauseToggle() {
    var btn = document.createElement(
      "button"
    );
    btn.type = "button";
    btn.className =
      "rec-pause-toggle ongoing";
    btn.textContent = "Ongoing";
    var paused = false;
    function refresh() {
      if (paused) {
        btn.className =
          "rec-pause-toggle paused";
        btn.textContent = "Paused";
      } else {
        btn.className =
          "rec-pause-toggle ongoing";
        btn.textContent = "Ongoing";
      }
    }
    btn.addEventListener(
      "click",
      function () {
        paused = !paused;
        refresh();
      }
    );
    return {
      el: btn,
      getValue: function () {
        return paused;
      },
      setValue: function (v) {
        paused = !!v;
        refresh();
      }
    };
  }

  /**
   * Builds a row of Su-Sa weekday buttons, either single-select
   * (radio-like) or multi-select (toggle) depending on `multi`.
   * @param {boolean} multi - true for multi-select, false for
   *   single-select.
   * @returns {{el: Element,
   *   getValue: function(): (number|number[]|null),
   *   setValue: function((number|number[]))}} the control.
   */
  function buildWeekdayPicker(multi) {
    var DAYS = [
      "Su", "Mo", "Tu", "We",
      "Th", "Fr", "Sa"
    ];
    var wrap = document.createElement("div");
    wrap.className = "rec-weekday-slider";
    var btns = [];
    for (var i = 0; i < 7; i++) {
      var b = document.createElement(
        "button"
      );
      b.type = "button";
      b.className = "rec-weekday-opt";
      b.textContent = DAYS[i];
      b.dataset.day = i;
      btns.push(b);
      wrap.appendChild(b);
    }
    wrap.addEventListener(
      "click",
      function (e) {
        var opt = e.target.closest(
          ".rec-weekday-opt"
        );
        if (!opt) return;
        if (multi) {
          opt.classList.toggle("selected");
          return;
        }
        var wasSelected = opt.classList.contains(
          "selected"
        );
        btns.forEach(function (b) {
          b.classList.remove("selected");
        });
        if (!wasSelected) {
          opt.classList.add("selected");
        }
      }
    );
    return {
      el: wrap,
      getValue: function () {
        if (multi) {
          return btns
            .filter(function (b) {
              return b.classList.contains(
                "selected"
              );
            })
            .map(function (b) {
              return parseInt(
                b.dataset.day
              );
            });
        }
        var sel =
          wrap.querySelector(".selected");
        if (!sel) return null;
        return parseInt(sel.dataset.day);
      },
      setValue: function (val) {
        btns.forEach(function (b) {
          b.classList.remove("selected");
        });
        if (multi && Array.isArray(val)) {
          val.forEach(function (d) {
            if (btns[d]) {
              btns[d].classList.add(
                "selected"
              );
            }
          });
        } else if (
          !multi && val != null
        ) {
          if (btns[val]) {
            btns[val].classList.add(
              "selected"
            );
          }
        }
      }
    };
  }

  /**
   * Builds a single-select picker for the ordinal (1st/2nd/3rd/4th/
   * Last) used by the nth-weekday-of-month recurrence rule.
   * @returns {{el: Element, getValue: function(): (number|null),
   *   setValue: function(number)}} the control.
   */
  function buildOrdinalPicker() {
    var LBL = [
      "1st", "2nd", "3rd", "4th", "Last"
    ];
    var VALS = [1, 2, 3, 4, -1];
    var wrap = document.createElement("div");
    wrap.className = "rec-ordinal-slider";
    var btns = [];
    for (var i = 0; i < LBL.length; i++) {
      var b = document.createElement(
        "button"
      );
      b.type = "button";
      b.className = "rec-ordinal-opt";
      b.textContent = LBL[i];
      b.dataset.val = VALS[i];
      btns.push(b);
      wrap.appendChild(b);
    }
    wrap.addEventListener(
      "click",
      function (e) {
        var opt = e.target.closest(
          ".rec-ordinal-opt"
        );
        if (!opt) return;
        var wasSelected = opt.classList.contains(
          "selected"
        );
        btns.forEach(function (b) {
          b.classList.remove("selected");
        });
        if (!wasSelected) {
          opt.classList.add("selected");
        }
      }
    );
    return {
      el: wrap,
      getValue: function () {
        var sel =
          wrap.querySelector(".selected");
        if (!sel) return null;
        return parseInt(sel.dataset.val);
      },
      setValue: function (v) {
        btns.forEach(function (b) {
          b.classList.remove("selected");
        });
        var idx = VALS.indexOf(v);
        if (idx !== -1) {
          btns[idx].classList.add(
            "selected"
          );
        }
      }
    };
  }

  /**
   * Builds a 35-cell calendar-style grid of day-of-month buttons
   * (1-31, with leading/trailing blanks), multi-selectable.
   * @returns {{el: Element, getValue: function(): number[],
   *   setValue: function(number[])}} the control.
   */
  function buildDomGrid() {
    var wrap = document.createElement("div");
    wrap.className = "rec-dom-grid";
    var cells = [];
    for (var i = 0; i < 35; i++) {
      var c = document.createElement(
        "button"
      );
      c.type = "button";
      c.className = "rec-dom-cell";
      if (i < 2 || i > 32) {
        c.classList.add("blank");
      } else {
        var day = i - 1;
        c.textContent = day;
        c.dataset.day = day;
      }
      cells.push(c);
      wrap.appendChild(c);
    }
    wrap.addEventListener(
      "click",
      function (e) {
        var cell = e.target.closest(
          ".rec-dom-cell:not(.blank)"
        );
        if (!cell) return;
        cell.classList.toggle("selected");
      }
    );
    return {
      el: wrap,
      getValue: function () {
        var sel = [];
        cells.forEach(function (c) {
          if (
            c.classList.contains(
              "selected"
            ) && c.dataset.day
          ) {
            sel.push(
              parseInt(c.dataset.day)
            );
          }
        });
        return sel.sort(function (a, b) {
          return a - b;
        });
      },
      setValue: function (days) {
        cells.forEach(function (c) {
          c.classList.remove("selected");
        });
        if (!Array.isArray(days)) return;
        days.forEach(function (d) {
          var idx = d + 1;
          if (cells[idx]) {
            cells[idx].classList.add(
              "selected"
            );
          }
        });
      }
    };
  }

  /**
   * Builds a 12-cell Jan-Dec month grid, either single-select or
   * multi-select depending on `multi`.
   * @param {boolean} multi - true for multi-select, false for
   *   single-select.
   * @returns {{el: Element,
   *   getValue: function(): (number|number[]|null),
   *   setValue: function((number|number[]))}} the control.
   */
  function buildMonthGrid(multi) {
    var MO = [
      "Jan", "Feb", "Mar", "Apr",
      "May", "Jun", "Jul", "Aug",
      "Sep", "Oct", "Nov", "Dec"
    ];
    var wrap = document.createElement("div");
    wrap.className = "rec-month-grid";
    var cells = [];
    for (var i = 0; i < 12; i++) {
      var c = document.createElement(
        "button"
      );
      c.type = "button";
      c.className = "rec-month-cell";
      c.textContent = MO[i];
      c.dataset.month = i + 1;
      cells.push(c);
      wrap.appendChild(c);
    }
    wrap.addEventListener(
      "click",
      function (e) {
        var cell = e.target.closest(
          ".rec-month-cell"
        );
        if (!cell) return;
        if (multi) {
          cell.classList.toggle("selected");
          return;
        }
        var wasSelected = cell.classList.contains(
          "selected"
        );
        cells.forEach(function (c) {
          c.classList.remove("selected");
        });
        if (!wasSelected) {
          cell.classList.add("selected");
        }
      }
    );
    return {
      el: wrap,
      getValue: function () {
        if (multi) {
          return cells
            .filter(function (c) {
              return c.classList.contains(
                "selected"
              );
            })
            .map(function (c) {
              return parseInt(
                c.dataset.month
              );
            });
        }
        var sel =
          wrap.querySelector(".selected");
        if (!sel) return null;
        return parseInt(sel.dataset.month);
      },
      setValue: function (val) {
        cells.forEach(function (c) {
          c.classList.remove("selected");
        });
        if (multi && Array.isArray(val)) {
          val.forEach(function (m) {
            if (cells[m - 1]) {
              cells[m - 1].classList.add(
                "selected"
              );
            }
          });
        } else if (
          !multi && val != null
        ) {
          if (cells[val - 1]) {
            cells[val - 1].classList.add(
              "selected"
            );
          }
        }
      }
    };
  }

  // ------------------- type-specific field-group builders --------------------

  /**
   * Builds the field group for the "everyNDays" recurrence rule: an
   * interval input plus a "last done" date, used to seed/override
   * the item's `lastDone` when the rule is saved.
   * @param {string} [lastDone] - ISO date string to prefill the
   *   "last done" input from.
   * @returns {{el: Element, readRule: function(): (Object|null),
   *   populateRule: function(Object),
   *   getLastDone: function(): (string|null),
   *   setLastDone: function(string)}} the field group.
   */
  function buildDailyFields() {
    var wrap = document.createElement("div");
    wrap.className = "rec-field-group";
    var lbl = document.createElement("span");
    lbl.className = "rec-label";
    lbl.textContent = "daily";
    wrap.appendChild(lbl);
    return {
      el: wrap,
      readRule: function () {
        return { type: "daily" };
      },
      populateRule: function () {}
    };
  }

  function buildEveryNDaysFields(lastDone) {
    var wrap = document.createElement("div");
    wrap.className = "rec-field-group";
    var r1 = document.createElement("div");
    r1.className = "rec-inline";
    var l1 = document.createElement("span");
    l1.className = "rec-label";
    l1.textContent = "Every";
    var inp = document.createElement("input");
    inp.type = "number";
    inp.min = "1";
    inp.max = "99";
    inp.value = "1";
    var l2 = document.createElement("span");
    l2.className = "rec-label";
    l2.textContent = "days";
    r1.appendChild(l1);
    r1.appendChild(inp);
    r1.appendChild(l2);
    wrap.appendChild(r1);
    var r2 = document.createElement("div");
    r2.className = "rec-inline";
    var l3 = document.createElement("span");
    l3.className = "rec-label";
    l3.textContent = "Last done:";
    var dInp = document.createElement(
      "input"
    );
    dInp.type = "date";
    dInp.className = "rec-date-input";
    if (lastDone) {
      dInp.value = lastDone.slice(0, 10);
    }
    r2.appendChild(l3);
    r2.appendChild(dInp);
    wrap.appendChild(r2);
    return {
      el: wrap,
      readRule: function () {
        var v = parseInt(inp.value);
        if (isNaN(v) || v < 1) {
          return null;
        }
        return {
          type: "everyNDays",
          everyDays: v
        };
      },
      populateRule: function (rule) {
        if (rule.everyDays != null) {
          inp.value = rule.everyDays;
        }
      },
      getLastDone: function () {
        if (!dInp.value) return null;
        return dInp.value +
          "T00:00:00.000Z";
      },
      setLastDone: function (ld) {
        if (ld) {
          dInp.value = ld.slice(0, 10);
        }
      }
    };
  }

  /**
   * Builds the field group for the "dayOfMonth" recurrence rule: a
   * day-of-month grid.
   * @returns {{el: Element, readRule: function(): (Object|null),
   *   populateRule: function(Object)}} the field group.
   */
  function buildDayOfMonthFields() {
    var wrap = document.createElement("div");
    wrap.className = "rec-field-group";
    var lbl = document.createElement("span");
    lbl.className = "rec-label";
    lbl.textContent = "Days of month:";
    wrap.appendChild(lbl);
    var grid = buildDomGrid();
    wrap.appendChild(grid.el);
    return {
      el: wrap,
      readRule: function () {
        var days = grid.getValue();
        if (!days.length) return null;
        return {
          type: "dayOfMonth",
          days: days
        };
      },
      populateRule: function (rule) {
        if (rule.days) {
          grid.setValue(rule.days);
        }
      }
    };
  }

  /**
   * Builds the field group for the "everyNWeeksOnDays" recurrence
   * rule: a week interval, a multi-select weekday picker, and an
   * anchor date used to determine which weeks count.
   * @returns {{el: Element, readRule: function(): (Object|null),
   *   populateRule: function(Object)}} the field group.
   */
  function buildEveryNWeeksFields() {
    var wrap = document.createElement("div");
    wrap.className = "rec-field-group";
    var r1 = document.createElement("div");
    r1.className = "rec-inline";
    var l1 = document.createElement("span");
    l1.className = "rec-label";
    l1.textContent = "Every";
    var wInp = document.createElement(
      "input"
    );
    wInp.type = "number";
    wInp.min = "1";
    wInp.max = "99";
    wInp.value = "1";
    var l2 = document.createElement("span");
    l2.className = "rec-label";
    l2.textContent = "weeks on:";
    r1.appendChild(l1);
    r1.appendChild(wInp);
    r1.appendChild(l2);
    wrap.appendChild(r1);
    var picker = buildWeekdayPicker(true);
    wrap.appendChild(picker.el);
    var r2 = document.createElement("div");
    r2.className = "rec-inline";
    var l3 = document.createElement("span");
    l3.className = "rec-label";
    l3.textContent = "Anchor date:";
    var aInp = document.createElement(
      "input"
    );
    aInp.type = "date";
    aInp.className = "rec-date-input";
    aInp.value = dateKeyFor(getNow());
    r2.appendChild(l3);
    r2.appendChild(aInp);
    wrap.appendChild(r2);
    function syncAnchorDisabled() {
      aInp.disabled = parseInt(wInp.value) === 1;
    }
    syncAnchorDisabled();
    wInp.addEventListener("input", syncAnchorDisabled);
    return {
      el: wrap,
      readRule: function () {
        var w = parseInt(wInp.value);
        if (isNaN(w) || w < 1) {
          return null;
        }
        var wds = picker.getValue();
        if (!wds.length) return null;
        if (!aInp.value) return null;
        return {
          type: "everyNWeeksOnDays",
          everyWeeks: w,
          weekdays: wds,
          anchorDate: aInp.value
        };
      },
      populateRule: function (rule) {
        if (rule.everyWeeks != null) {
          wInp.value = rule.everyWeeks;
        }
        if (rule.weekdays) {
          picker.setValue(rule.weekdays);
        }
        if (rule.anchorDate) {
          aInp.value = rule.anchorDate;
        }
        syncAnchorDisabled();
      }
    };
  }

  /**
   * Builds the field group for the "nthWeekdayOfMonth" recurrence
   * rule: an ordinal picker paired with a single-select weekday
   * picker.
   * @returns {{el: Element, readRule: function(): (Object|null),
   *   populateRule: function(Object)}} the field group.
   */
  function buildNthWeekdayFields() {
    var wrap = document.createElement("div");
    wrap.className = "rec-field-group";
    var l1 = document.createElement("span");
    l1.className = "rec-label";
    l1.textContent = "The";
    wrap.appendChild(l1);
    var ord = buildOrdinalPicker();
    wrap.appendChild(ord.el);
    var wd = buildWeekdayPicker(false);
    wrap.appendChild(wd.el);
    var l2 = document.createElement("span");
    l2.className = "rec-label";
    l2.textContent = "of the month";
    wrap.appendChild(l2);
    return {
      el: wrap,
      readRule: function () {
        var o = ord.getValue();
        var w = wd.getValue();
        if (o === null || w === null) {
          return null;
        }
        return {
          type: "nthWeekdayOfMonth",
          ordinal: o,
          weekday: w
        };
      },
      populateRule: function (rule) {
        if (rule.ordinal != null) {
          ord.setValue(rule.ordinal);
        }
        if (rule.weekday != null) {
          wd.setValue(rule.weekday);
        }
      }
    };
  }

  /**
   * Builds the field group for the "yearly" recurrence rule: a year
   * interval, a single-select month, a day-of-month number, and a
   * starting year. `everyYears`/`startYear` are only included in the
   * read rule when the interval is greater than 1.
   * @returns {{el: Element, readRule: function(): (Object|null),
   *   populateRule: function(Object)}} the field group.
   */
  function buildYearlyFields() {
    var wrap = document.createElement("div");
    wrap.className = "rec-field-group";
    var r1 = document.createElement("div");
    r1.className = "rec-inline";
    var l1 = document.createElement("span");
    l1.className = "rec-label";
    l1.textContent = "Every";
    var yrsInp = document.createElement(
      "input"
    );
    yrsInp.type = "number";
    yrsInp.min = "1";
    yrsInp.max = "99";
    yrsInp.value = "1";
    var l2 = document.createElement("span");
    l2.className = "rec-label";
    l2.textContent = "years";
    r1.appendChild(l1);
    r1.appendChild(yrsInp);
    r1.appendChild(l2);
    wrap.appendChild(r1);
    var l3 = document.createElement("span");
    l3.className = "rec-label";
    l3.textContent = "on";
    wrap.appendChild(l3);
    var months = buildMonthGrid(false);
    wrap.appendChild(months.el);
    var r2 = document.createElement("div");
    r2.className = "rec-inline";
    var l4 = document.createElement("span");
    l4.className = "rec-label";
    l4.textContent = "Day:";
    var dayInp = document.createElement(
      "input"
    );
    dayInp.type = "number";
    dayInp.min = "1";
    dayInp.max = "31";
    dayInp.value = "1";
    r2.appendChild(l4);
    r2.appendChild(dayInp);
    wrap.appendChild(r2);
    var r3 = document.createElement("div");
    r3.className = "rec-inline";
    var l5 = document.createElement("span");
    l5.className = "rec-label";
    l5.textContent = "Starting year:";
    var syrInp = document.createElement(
      "input"
    );
    syrInp.type = "number";
    syrInp.value = new Date()
      .getFullYear().toString();
    r3.appendChild(l5);
    r3.appendChild(syrInp);
    wrap.appendChild(r3);
    return {
      el: wrap,
      readRule: function () {
        var m = months.getValue();
        if (m === null) return null;
        var d = parseInt(dayInp.value);
        if (isNaN(d) || d < 1 || d > 31) {
          return null;
        }
        var ey = parseInt(yrsInp.value);
        if (isNaN(ey) || ey < 1) {
          return null;
        }
        var rule = {
          type: "yearly",
          month: m,
          day: d
        };
        if (ey > 1) {
          rule.everyYears = ey;
          var sy = parseInt(syrInp.value);
          if (isNaN(sy)) return null;
          rule.startYear = sy;
        }
        return rule;
      },
      populateRule: function (rule) {
        if (rule.month != null) {
          months.setValue(rule.month);
        }
        if (rule.day != null) {
          dayInp.value = rule.day;
        }
        if (rule.everyYears != null) {
          yrsInp.value = rule.everyYears;
        }
        if (rule.startYear != null) {
          syrInp.value = rule.startYear;
        }
      }
    };
  }

  /**
   * Builds the field group for the "monthOfYear" recurrence rule: a
   * multi-select month grid and a day-of-month number.
   * @returns {{el: Element, readRule: function(): (Object|null),
   *   populateRule: function(Object)}} the field group.
   */
  function buildMonthOfYearFields() {
    var wrap = document.createElement("div");
    wrap.className = "rec-field-group";
    var l1 = document.createElement("span");
    l1.className = "rec-label";
    l1.textContent = "Months:";
    wrap.appendChild(l1);
    var months = buildMonthGrid(true);
    wrap.appendChild(months.el);
    var r1 = document.createElement("div");
    r1.className = "rec-inline";
    var l2 = document.createElement("span");
    l2.className = "rec-label";
    l2.textContent = "on day:";
    var dayInp = document.createElement(
      "input"
    );
    dayInp.type = "number";
    dayInp.min = "1";
    dayInp.max = "31";
    dayInp.value = "1";
    r1.appendChild(l2);
    r1.appendChild(dayInp);
    wrap.appendChild(r1);
    return {
      el: wrap,
      readRule: function () {
        var ms = months.getValue();
        if (!ms.length) return null;
        var d = parseInt(dayInp.value);
        if (isNaN(d) || d < 1 || d > 31) {
          return null;
        }
        return {
          type: "monthOfYear",
          months: ms,
          day: d
        };
      },
      populateRule: function (rule) {
        if (rule.months) {
          months.setValue(rule.months);
        }
        if (rule.day != null) {
          dayInp.value = rule.day;
        }
      }
    };
  }

  // ------------------- GUI panel (assembles all controls) --------------------

  /**
   * Assembles the full GUI recurrence-editing panel: destination
   * toggle, pause toggle, rule-type select, and the matching field
   * group shown/hidden per selected type.
   * @param {Object} [prefillRec] - a validated recurrence dict to
   *   populate the panel from, or null/undefined for a blank panel.
   * @param {string} [ld] - ISO "last done" date to seed the
   *   everyNDays field group's date input from.
   * @returns {{el: Element, read: function(): (Object|null),
   *   populate: function(Object),
   *   getLastDone: function(): (string|null),
   *   setLastDone: function(string)}} the panel.
   */
  function buildGuiPanel(prefillRec, ld) {
    var panel = document.createElement("div");
    panel.className = "rec-gui-panel active";
    var box = document.createElement("div");
    box.className = "rec-form-box";

    var topRow = document.createElement("div");
    topRow.className = "rec-top-row";
    var destGroup = document.createElement(
      "div"
    );
    destGroup.className = "rec-dest-group";
    var destLbl = document.createElement(
      "span"
    );
    destLbl.className = "rec-label";
    destLbl.textContent = "dest:";
    var dest = buildDestToggle();
    destGroup.appendChild(destLbl);
    destGroup.appendChild(dest.el);
    var pause = buildPauseToggle();
    topRow.appendChild(destGroup);
    topRow.appendChild(pause.el);
    box.appendChild(topRow);

    var typeRow = document.createElement(
      "div"
    );
    typeRow.className = "rec-type-row";
    var typeLbl = document.createElement(
      "span"
    );
    typeLbl.className = "rec-label";
    typeLbl.textContent = "type:";
    typeRow.appendChild(typeLbl);
    var tSel = document.createElement(
      "select"
    );
    tSel.className = "rec-type-select";
    var ph = document.createElement("option");
    ph.value = "";
    ph.textContent = "(Select)";
    ph.selected = true;
    tSel.appendChild(ph);
    RECURRENCE_KINDS.forEach(function (k) {
      var o = document.createElement(
        "option"
      );
      o.value = k;
      o.textContent = TYPE_LABELS[k];
      tSel.appendChild(o);
    });
    typeRow.appendChild(tSel);
    box.appendChild(typeRow);

    var fieldsWrap = document.createElement(
      "div"
    );
    fieldsWrap.className = "rec-fields";
    var dly = buildDailyFields();
    var evND = buildEveryNDaysFields(ld);
    var nWk = buildEveryNWeeksFields();
    var domF = buildDayOfMonthFields();
    var nWd = buildNthWeekdayFields();
    var moY = buildMonthOfYearFields();
    var yrF = buildYearlyFields();
    var fMap = {
      daily: dly,
      everyNDays: evND,
      everyNWeeksOnDays: nWk,
      dayOfMonth: domF,
      nthWeekdayOfMonth: nWd,
      monthOfYear: moY,
      yearly: yrF
    };
    RECURRENCE_KINDS.forEach(function (k) {
      fieldsWrap.appendChild(fMap[k].el);
    });
    box.appendChild(fieldsWrap);

    function showKind(kind) {
      RECURRENCE_KINDS.forEach(function (k) {
        if (k === kind) {
          fMap[k].el.classList.add(
            "active"
          );
        } else {
          fMap[k].el.classList.remove(
            "active"
          );
        }
      });
    }
    tSel.addEventListener(
      "change",
      function () { showKind(tSel.value); }
    );

    panel.appendChild(box);

    function populate(rec) {
      if (!rec) return;
      if (rec.destination) {
        dest.setValue(rec.destination);
      }
      if (rec.paused != null) {
        pause.setValue(rec.paused);
      }
      if (rec.rule && rec.rule.type) {
        tSel.value = rec.rule.type;
        showKind(rec.rule.type);
        var fg = fMap[rec.rule.type];
        if (fg && fg.populateRule) {
          fg.populateRule(rec.rule);
        }
      }
    }
    if (prefillRec) populate(prefillRec);

    return {
      el: panel,
      read: function () {
        var kind = tSel.value;
        if (!kind) return null;
        var fg = fMap[kind];
        if (!fg) return null;
        var rule = fg.readRule();
        if (!rule) return null;
        return {
          destination: dest.getValue(),
          paused: pause.getValue(),
          rule: rule
        };
      },
      populate: populate,
      getLastDone: function () {
        return evND.getLastDone();
      },
      setLastDone: function (v) {
        evND.setLastDone(v);
      }
    };
  }

  // ------------------------- tabbed recurrence modal --------------------------

  /**
   * Builds the shared "Edit recurrence" modal with two tabs: a GUI
   * panel (`buildGuiPanel`) and a raw JSON textarea, kept in sync
   * when switching tabs. Parsing/validation is handled here; callers
   * only receive the outcome.
   * @param {Object} opts
   * @param {string} [opts.prefill] - initial JSON textarea contents
   *   / GUI panel prefill source.
   * @param {string} [opts.lastDone] - ISO date to seed the GUI
   *   panel's "last done" input from.
   * @param {function} opts.onBlank - called when Save is hit with
   *   blank JSON input; must perform whatever state change/save/
   *   render blank implies.
   * @param {function(Object, string=)} opts.onSave - called with the
   *   parsed, validated recurrence dict (and, when saved from the
   *   GUI tab, a possibly-updated "last done" ISO date) when Save is
   *   hit with valid input; must perform whatever state change/save/
   *   render applies.
   */
  function buildRecurrenceModal(opts) {
    var frag =
      document.createDocumentFragment();
    var h = document.createElement("h3");
    h.textContent = "Edit recurrence";
    frag.appendChild(h);

    var content = document.createElement(
      "div"
    );
    content.className = "rec-content";

    var prefillRec = null;
    if (opts.prefill) {
      try {
        var p = JSON.parse(opts.prefill);
        if (!validateRecurrence(p)) {
          prefillRec = p;
        }
      } catch (ignore) {}
    }

    var gui = buildGuiPanel(
      prefillRec, opts.lastDone
    );
    content.appendChild(gui.el);

    var jsonPanel = document.createElement(
      "div"
    );
    jsonPanel.className = "rec-json-panel";
    var schemaTa = document.createElement(
      "textarea"
    );
    schemaTa.className = "modal-ta";
    schemaTa.readOnly = true;
    schemaTa.value = RECURRENCE_SCHEMA_TEXT;
    jsonPanel.appendChild(schemaTa);
    var lbl = document.createElement("p");
    lbl.textContent =
      "Paste a recurrence dict below, or " +
      "leave blank to clear recurrence:";
    jsonPanel.appendChild(lbl);
    var inputTa = document.createElement(
      "textarea"
    );
    inputTa.className = "modal-ta";
    inputTa.placeholder =
      "Paste dict here...";
    if (opts.prefill) {
      inputTa.value = opts.prefill;
    }
    jsonPanel.appendChild(inputTa);
    content.appendChild(jsonPanel);
    frag.appendChild(content);

    var bar = document.createElement("div");
    bar.className = "rec-tab-bar";
    var guiTab = document.createElement(
      "button"
    );
    guiTab.type = "button";
    guiTab.className = "rec-tab active";
    guiTab.textContent = "GUI";
    var jsonTab = document.createElement(
      "button"
    );
    jsonTab.type = "button";
    jsonTab.className = "rec-tab";
    jsonTab.textContent = "JSON";
    var spacer = document.createElement(
      "div"
    );
    spacer.className = "spacer";
    var saveBtn = document.createElement(
      "button"
    );
    saveBtn.className = "primary";
    saveBtn.textContent = "Save";
    var cancelBtn = document.createElement(
      "button"
    );
    cancelBtn.textContent = "Cancel";
    bar.appendChild(guiTab);
    bar.appendChild(jsonTab);
    bar.appendChild(spacer);
    bar.appendChild(saveBtn);
    bar.appendChild(cancelBtn);
    frag.appendChild(bar);

    var overlay = showModal(frag);

    guiTab.addEventListener(
      "click",
      function () {
        var txt = inputTa.value.trim();
        if (txt) {
          try {
            var pr = JSON.parse(txt);
            if (!validateRecurrence(pr)) {
              gui.populate(pr);
            }
          } catch (ignore) {}
        }
        guiTab.classList.add("active");
        jsonTab.classList.remove("active");
        gui.el.classList.add("active");
        jsonPanel.classList.remove("active");
      }
    );

    jsonTab.addEventListener(
      "click",
      function () {
        var rec = gui.read();
        if (rec) {
          inputTa.value = JSON.stringify(
            rec, null, 2
          );
        }
        jsonTab.classList.add("active");
        guiTab.classList.remove("active");
        jsonPanel.classList.add("active");
        gui.el.classList.remove("active");
        inputTa.focus();
      }
    );

    saveBtn.addEventListener(
      "click",
      function () {
        var isGui =
          guiTab.classList.contains(
            "active"
          );
        if (isGui) {
          var rec = gui.read();
          if (!rec) {
            toast(
              "Fill in all required " +
              "fields."
            );
            return;
          }
          var err =
            validateRecurrence(rec);
          if (err) {
            toast(err);
            return;
          }
          opts.onSave(
            rec, gui.getLastDone()
          );
          overlay.remove();
          return;
        }
        var text = inputTa.value.trim();
        if (!text) {
          opts.onBlank();
          overlay.remove();
          return;
        }
        var parsed;
        try {
          parsed = JSON.parse(text);
        } catch (e) {
          toast(
            "That's not valid JSON."
          );
          return;
        }
        var jerr =
          validateRecurrence(parsed);
        if (jerr) {
          toast(jerr);
          return;
        }
        opts.onSave(parsed);
        overlay.remove();
      }
    );
    cancelBtn.addEventListener(
      "click",
      function () { overlay.remove(); }
    );
  }

  /**
   * Opens the "Edit recurrence" modal for an existing item. Blank
   * input clears the item's recurrence; valid input replaces it.
   * @param {Object} item - the item whose recurrence is being edited.
   */
  function openRecurrenceEditor(item) {
    var prefill;
    if (item.recurrence) {
      prefill = JSON.stringify(
        item.recurrence, null, 2
      );
    }
    buildRecurrenceModal({
      prefill: prefill,
      lastDone: item.lastDone,
      onBlank: function () {
        pushUndo("Edit recurrence");
        if (
          item.recurrence &&
          findItemListKey(item.id) === null
        ) {
          var d =
            item.recurrence.destination;
          state.lists[d].push(item.id);
        }
        item.recurrence = null;
        save();
        render();
      },
      onSave: function (parsed, newLD) {
        pushUndo("Edit recurrence");
        item.recurrence = parsed;
        if (item.lastDone === null) {
          item.lastDone =
            getNow().toISOString();
        }
        if (newLD) {
          item.lastDone = newLD;
        }
        save();
        render();
      }
    });
  }

  /**
   * Opens the recurrence editor for a brand-new recurring item: the
   * item doesn't exist in `itemsById` yet, and only gets created -
   * unlinked from every list - once a valid recurrence dict is saved
   * here. Leaving the box blank or cancelling discards the typed
   * text entirely; nothing is created.
   * @param {string} text - the new item's text, already
   *   trimmed/non-empty.
   */
  function openNewRecurringItemEditor(text) {
    buildRecurrenceModal({
      lastDone: getNow().toISOString(),
      onBlank: function () {},
      onSave: function (parsed, newLD) {
        pushUndo("Add recurring item");
        var id = uid();
        var ld = newLD ||
          getNow().toISOString();
        state.itemsById[id] = {
          id: id,
          text: text,
          isDone: false,
          lastDone: ld,
          recurrence: parsed
        };
        state.lists[parsed.destination].push(id);
        save();
        render();
      }
    });
  }

  // Export - Copy: show JSON in a readonly textarea for manual selection
  document.getElementById("exportCopyBtn").addEventListener("click", function () {
    var frag = document.createDocumentFragment();
    var h = document.createElement("h3");
    h.textContent = "Export — select and copy";
    frag.appendChild(h);
    var ta = document.createElement("textarea");
    ta.className = "modal-ta";
    ta.readOnly = true;
    ta.value = exportJSON();
    frag.appendChild(ta);
    var row = document.createElement("div");
    row.className = "modal-actions";
    var close = document.createElement("button");
    close.textContent = "Done";
    row.appendChild(close);
    frag.appendChild(row);
    var overlay = showModal(frag);
    ta.focus();
    ta.select();
    markExported();
    close.addEventListener("click", function () { overlay.remove(); });
  });

  // Export - File
  document.getElementById("exportFileBtn").addEventListener("click", function () {
    var blob = new Blob([exportJSON()], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    var d = getNow();
    a.download = "lists-" + d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    markExported();
    toast("Exported.");
  });

  // Export - Share
  document.getElementById("exportShareBtn").addEventListener("click", function () {
    if (!navigator.share) {
      toast("Share not supported in this browser.");
      return;
    }
    navigator.share({ title: "AutoReList backup", text: exportJSON() }).then(function () {
      markExported();
    }).catch(function () {});
  });

  // Import - Paste: show empty textarea for user to paste into
  document.getElementById("importPasteBtn").addEventListener("click", function () {
    var frag = document.createDocumentFragment();
    var h = document.createElement("h3");
    h.textContent = "Import — paste JSON";
    frag.appendChild(h);
    var ta = document.createElement("textarea");
    ta.className = "modal-ta";
    ta.placeholder = "Paste exported JSON here...";
    frag.appendChild(ta);
    var row = document.createElement("div");
    row.className = "modal-actions";
    var imp = document.createElement("button");
    imp.className = "primary";
    imp.textContent = "Import";
    var cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    row.appendChild(imp);
    row.appendChild(cancel);
    frag.appendChild(row);
    var overlay = showModal(frag);
    ta.focus();
    imp.addEventListener("click", function () {
      var text = ta.value.trim();
      if (!text) {
        toast("Nothing to import.");
        return;
      }
      if (importFromText(text)) overlay.remove();
    });
    cancel.addEventListener("click", function () { overlay.remove(); });
  });

  // Import - File
  var fileInput = document.getElementById("fileInput");
  document.getElementById("importFileBtn").addEventListener("click", function () {
    fileInput.value = "";
    fileInput.click();
  });
  fileInput.addEventListener("change", function () {
    var f = fileInput.files && fileInput.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () { importFromText(String(reader.result)); };
    reader.readAsText(f);
  });

  /**
   * Formats an ISO date string for the "Last exported" note.
   * @param {string} iso - ISO date string.
   * @returns {string} the formatted date/time.
   */
  var lastExportedEl = document.getElementById("lastExported");
  function formatExportDate(iso) {
    return new Date(iso).toLocaleString("en-CA",
      { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  }
  /**
   * Refreshes the "Last exported" note. Shows a checkmark once the export has
   * been confirmed; otherwise shows a confirm button (marks this export as
   * confirmed) and a revert button (rolls `lastExported` back to the last
   * confirmed value).
   */
  function updateLastExported() {
    if (state.lastExported) {
      lastExportedEl.textContent =
        "Last exported: " +
        formatExportDate(state.lastExported);
    } else {
      lastExportedEl.textContent = "Never exported";
    }
  }

  // ---------------------------------- toast ----------------------------------
  /**
   * Shows a transient toast message, replacing and resetting the timer on any
   * prior toast still showing.
   * @param {string} msg - the message to display.
   */
  var toastEl = document.getElementById("toast");
  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2200);
  }

  // ---------------------------------- theme ----------------------------------
  var THEME_KEY = "aulists.theme";
  /**
   * Applies a theme preference to the document: sets `data-theme` and the
   * `theme-color` meta tag. "system" resolves against the OS
   * `prefers-color-scheme` media query.
   * @param {string} pref - "dark", "light", or "system".
   */
  function applyTheme(pref) {
    var dark;
    if (pref === "dark") dark = true;
    else if (pref === "light") dark = false;
    else dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var themeAttr = "light";
    var themeColor = "#4a6f8a";
    if (dark) {
      themeAttr = "dark";
      themeColor = "#2c2c2c";
    }
    document.documentElement.setAttribute("data-theme", themeAttr);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", themeColor);
  }
  /**
   * Boots the theme system: applies the stored (or system) preference, wires up
   * the theme switcher buttons, and keeps "system" mode synced to live OS theme
   * changes.
   */
  function initTheme() {
    var pref = localStorage.getItem(THEME_KEY) || "system";
    applyTheme(pref);
    var switcher = document.getElementById("themeSwitcher");
    var btns = switcher.querySelectorAll("button");
    btns.forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.theme === pref);
      btn.addEventListener("click", function () {
        var chosen = btn.dataset.theme;
        localStorage.setItem(THEME_KEY, chosen);
        applyTheme(chosen);
        btns.forEach(function (b) { b.classList.toggle("active", b === btn); });
      });
    });
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
      var cur = localStorage.getItem(THEME_KEY) || "system";
      if (cur === "system") applyTheme("system");
    });
  }

  // TEMP debug panel wiring - comment out along with the override block near
  // the top of this
  // file and #debugDatePanel in index.html when not actively testing.
  /**
   * Fills the debug-panel date and hour inputs from a Date.
   * @param {Element} dateEl - the date `<input>`.
   * @param {Element} hourEl - the hour `<input>`.
   * @param {Date} d - the moment to populate the inputs from.
   */
  function populateDebugNowInputs(dateEl, hourEl, d) {
    dateEl.value = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    hourEl.value = d.getHours();
  }
  /**
   * Updates the debug panel's status line to reflect whether a "now" override
   * is currently active.
   */
  function updateDebugNowStatus() {
    var statusEl = document.getElementById("debugNowStatus");
    if (debugNowOverride) {
      statusEl.textContent = "Overridden to: " + getNow().toLocaleString("en-CA",
        { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "2-digit", hour12: false });
    } else {
      statusEl.textContent = "Using real time.";
    }
  }
  /**
   * Re-runs the effects that depend on "now" after the debug override changes:
   * refreshes the status line, purges stale trash, applies any auto-return
   * whose boundary has passed, and re-renders.
   */
  function applyDebugNowChange() {
    updateDebugNowStatus();
    purgeTrash();
    placeRecurringItems();
    applyAutoReturn();
    render();
  }
  /**
   * Wires up the temp debug "now" panel: populates its inputs, and hooks the
   * Set/Clear buttons to `setDebugNow` + `applyDebugNowChange`.
   */
  function initDebugNowPanel() {
    var dateEl = document.getElementById("debugNowDate");
    var hourEl = document.getElementById("debugNowHour");
    var setBtn = document.getElementById("debugNowSetBtn");
    var clearBtn = document.getElementById("debugNowClearBtn");
    populateDebugNowInputs(dateEl, hourEl, getNow());
    setBtn.addEventListener("click", function () {
      if (!dateEl.value) {
        toast("Pick a date first.");
        return;
      }
      var parts = dateEl.value.split("-");
      var h = clamp(hourEl.value, 0, 23);
      hourEl.value = h;
      var picked = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), h, 0);
      if (isNaN(picked.getTime())) {
        toast("Invalid date.");
        return;
      }
      setDebugNow(picked);
      applyDebugNowChange();
    });
    clearBtn.addEventListener("click", function () {
      setDebugNow(null);
      populateDebugNowInputs(dateEl, hourEl, getNow());
      applyDebugNowChange();
    });
    updateDebugNowStatus();
  }

  // ---------------------------------- boot -----------------------------------
  initTheme();
  initDebugNowPanel();
  purgeTrash();
  placeRecurringItems();
  applyAutoReturn();
  syncScheduleInputs();
  updateLastExported();
  render();

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      saveUndoStacks();
      return;
    }
    purgeTrash();
    placeRecurringItems();
    applyAutoReturn();
    render();
    refreshUndoRedoButtons();
  });

  // pagehide is the one that fires on an actual navigation to Falsedge
  window.addEventListener("pagehide", saveUndoStacks);

  // undo/redo pill wiring
  var undoBtn = document.getElementById("undoBtn");
  var redoBtn = document.getElementById("redoBtn");
  var boundaryConfirmEl =
    document.getElementById("boundaryConfirm");

  function refreshUndoRedoButtons() {
    if (!undoBtn) return;
    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;
  }

  function showBoundaryConfirm(direction, label) {
    var prefix;
    if (direction === "undo") {
      prefix = "Undoing over: ";
    } else {
      prefix = "Redoing over: ";
    }
    boundaryConfirmEl.textContent = prefix + label;
    boundaryConfirmEl.classList.add("show");
    if (direction === "undo") {
      undoBtn.classList.add("confirm-pending");
    } else {
      redoBtn.classList.add("confirm-pending");
    }
    showBoundaryCancelOverlay();
  }

  function hideBoundaryConfirm() {
    boundaryConfirmEl.classList.remove("show");
    undoBtn.classList.remove("confirm-pending");
    redoBtn.classList.remove("confirm-pending");
    removeBoundaryCancelOverlay();
  }

  var boundaryCancelOverlay = null;

  function showBoundaryCancelOverlay() {
    boundaryCancelOverlay = document.createElement("div");
    boundaryCancelOverlay.className = "boundary-overlay";
    boundaryCancelOverlay.addEventListener("click", function () {
      pendingBoundary = null;
      hideBoundaryConfirm();
      removeBoundaryCancelOverlay();
    });
    document.body.appendChild(boundaryCancelOverlay);
  }

  function removeBoundaryCancelOverlay() {
    if (boundaryCancelOverlay) {
      boundaryCancelOverlay.remove();
      boundaryCancelOverlay = null;
    }
  }

  function withCooldown(fn) {
    return function () {
      if (undoBtn.classList.contains("cooldown")) return;
      fn();
      undoBtn.classList.add("cooldown");
      redoBtn.classList.add("cooldown");
      setTimeout(function () {
        undoBtn.classList.remove("cooldown");
        redoBtn.classList.remove("cooldown");
      }, 500);
    };
  }
  undoBtn.addEventListener("click", withCooldown(undo));
  redoBtn.addEventListener("click", withCooldown(redo));

  loadUndoStacks();
  refreshUndoRedoButtons();
})();
