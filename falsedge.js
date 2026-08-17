(function () {
  "use strict";

  var STORAGE_KEY = "falsedge.data";
  var UNDO_SLOT_PREFIX = "falsedge.undo.slot.";
  var UNDO_INDEX_KEY = "falsedge.undo.index";
  var UNDO_CAP = 60;
  var UNDO_RING_SIZE = UNDO_CAP + 1;
  var UNDO_BYTE_BUDGET = 2 * 1024 * 1024;
  var EXPORT_LIMIT = 2000;
  var COPY_WINDOW_MS = 10 * 60 * 1000;
  var MIN_LEAD_MS = 20 * 60 * 1000;
  var DAY_MS = 24 * 60 * 60 * 1000;
  var WEEK_MS = 7 * DAY_MS;
  // cancelling a dated `others` activation locks that row out this long
  var COOLDOWN_MS = 36 * 60 * 60 * 1000;
  var TIER_POINTS = [6, 3, 2, 1];
  var WL_OFFSETS = [0, 10, 30, 60];
  var HL_OFFSETS = [0, 5, 15, 30];
  var DAY_ABBR = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

  // the active-task stack walks the page ramp's blue stretch backwards
  var TASK_HUE_SOONEST = 224;
  var TASK_HUE_LATEST = 207;

  var COPY_ICON =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="9" y="9" width="11" height="11" rx="2"></rect>' +
    '<path d="M5 15V5a2 2 0 0 1 2-2h10"></path>' +
    '</svg>';

  var state = load();
  var undoRing = new Array(UNDO_RING_SIZE);
  var undoLabels = new Array(UNDO_RING_SIZE);
  var undoSlotBytes = new Array(UNDO_RING_SIZE).fill(0);
  var undoBytesUsed = 0;
  // timeline positions, never wrapped; a position's slot is n % UNDO_RING_SIZE
  var undoOldest = 0;
  var undoPointer = 0;
  var undoNewest = 0;

  // view-only state: deliberately not in `state`, so it never reaches undo
  // and never survives an actual page load.
  var spendOpen = false;
  var scoresOpen = false;
  // id of the active task whose deadline/mode editor is open, if any
  var timeEditId = null;
  // neither ACTIVATE adder is draft-backed in storage, but both do have to
  // survive a re-render triggered from elsewhere on the page.
  var adderDrafts = {
    dailies: { text: "", time: "", mode: null },
    others: { text: "", time: "", mode: null, date: "" }
  };

  // ------------------------------- primitives --------------------------------
  /**
   * Returns the current moment. Falsedge has no debug clock override - every
   * calculation reads this fresh at tap time.
   * @returns {Date} a fresh Date instance.
   */
  function getNow() {
    return new Date();
  }

  /**
   * Generates a short, collision-resistant id for a task or template.
   * @returns {string} an id like "f8k2p3q7x" (timestamp + random, base36).
   */
  function uid() {
    return "f" + Date.now().toString(36) +
      Math.random().toString(36).slice(2, 7);
  }

  /**
   * Zero-pads a number below 10 to two digits.
   * @param {number} n - the number to pad.
   * @returns {string} the padded value, e.g. "05".
   */
  function pad2(n) {
    var prefix = "";
    if (n < 10) {
      prefix = "0";
    }
    return prefix + n;
  }

  /**
   * Formats a Date as a local day key.
   * @param {Date} d - the moment to format.
   * @returns {string} "YYYY-MM-DD".
   */
  function dayKey(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" +
      pad2(d.getDate());
  }

  /**
   * Formats a Date as a bare 24-hour clock time.
   * @param {Date} d - the moment to format.
   * @returns {string} "HH:MM".
   */
  function hhmm(d) {
    return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  /**
   * Formats a Date as a full local date + clock time, for ledger `by` lines.
   * @param {Date} d - the moment to format.
   * @returns {string} "YYYY-MM-DD HH:MM".
   */
  function fmtDateTime(d) {
    return dayKey(d) + " " + hhmm(d);
  }

  /**
   * Adds whole minutes to a moment without mutating the original.
   * @param {Date} d - the base moment.
   * @param {number} m - minutes to add.
   * @returns {Date} the shifted moment.
   */
  function addMinutes(d, m) {
    return new Date(d.getTime() + m * 60000);
  }

  /**
   * Rounds a moment up to the next 10-minute mark, dropping seconds. A moment
   * already sitting exactly on a 10-minute mark is returned unchanged.
   * @param {Date} d - the moment to round.
   * @returns {Date} the rounded moment.
   */
  function ceil10(d) {
    var out = new Date(d.getTime());
    out.setSeconds(0, 0);
    var rem = out.getMinutes() % 10;
    if (rem !== 0) {
      out.setMinutes(out.getMinutes() + (10 - rem));
    }
    return out;
  }

  /**
   * Resolves a bare "HH:MM" clock time to its next occurrence at or after a
   * reference moment - today's if it hasn't passed, tomorrow's if it has.
   * @param {string} t - a clock time, "HH:MM".
   * @param {Date} now - the reference moment.
   * @returns {Date} the resolved absolute instant.
   */
  function resolveClockTime(t, now) {
    var parts = String(t).split(":");
    var d = new Date(now.getTime());
    d.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);
    if (d.getTime() < now.getTime()) {
      d.setDate(d.getDate() + 1);
    }
    return d;
  }

  /**
   * Resolves a stored time plus optional date into an absolute deadline. With
   * no date the clock time takes its next occurrence within 24h; with a date
   * the two pair directly and no next-occurrence rule applies.
   * @param {string} time - a clock time, "HH:MM".
   * @param {string} date - a day key, "YYYY-MM-DD", or "" for none.
   * @param {Date} now - the reference moment.
   * @returns {Date} the resolved absolute instant.
   */
  function resolveDeadline(time, date, now) {
    if (!date) {
      return resolveClockTime(time, now);
    }
    var d = String(date).split("-");
    var t = String(time).split(":");
    return new Date(
      parseInt(d[0], 10), parseInt(d[1], 10) - 1, parseInt(d[2], 10),
      parseInt(t[0], 10), parseInt(t[1], 10), 0, 0);
  }

  /**
   * The date picker's bounds: today through one week out.
   * @param {Date} now - the reference moment.
   * @returns {{min: string, max: string}} two day keys.
   */
  function dateBounds(now) {
    return {
      min: dayKey(now),
      max: dayKey(new Date(now.getTime() + WEEK_MS))
    };
  }

  /**
   * Tests whether a chosen date falls inside the picker's bounds. Checked again
   * here at submit time because `min`/`max` only grey the native picker's days
   * out - they don't make an out-of-range value impossible to hold.
   * @param {string} date - a day key, "YYYY-MM-DD".
   * @param {Date} now - the reference moment.
   * @returns {boolean} true if the date is today through one week out.
   */
  function dateInRange(date, now) {
    var b = dateBounds(now);
    return date >= b.min && date <= b.max;
  }

  /**
   * Tests whether a deadline is far enough out to count as a "further" task.
   * A rolling 24h window, not a calendar-day boundary: at 17:00 today, 09:00
   * tomorrow is 16h out and so is not further, despite being another day.
   * @param {string} deadline - the task's deadline, ISO string.
   * @param {Date} now - the reference moment.
   * @returns {boolean} true if the deadline is more than 24 hours away.
   */
  function isFurther(deadline, now) {
    return new Date(deadline).getTime() - now.getTime() > DAY_MS;
  }

  /**
   * Formats a remaining duration, for an on-cooldown row's inline countdown.
   * @param {number} ms - milliseconds remaining.
   * @returns {string} e.g. "31h 12m", or "44m" once under an hour.
   */
  function fmtLeft(ms) {
    var mins = Math.max(0, Math.ceil(ms / 60000));
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    if (h > 0) {
      return h + "h " + m + "m";
    }
    return m + "m";
  }

  /**
   * Formats a points value. `pts` is always a whole number.
   * @param {number} n - the value to format.
   * @returns {string} the formatted value, e.g. "-5".
   */
  function fmtPts(n) {
    return String(Math.round(n));
  }

  /**
   * Formats a score value, displayed up to one decimal place - 130 renders as
   * "130", 10.9 as "10.9".
   * @param {number} n - the value to format.
   * @returns {string} the formatted value.
   */
  function fmtScr(n) {
    var r = Math.round(n * 10) / 10;
    if (r % 1 === 0) {
      return String(r);
    }
    return r.toFixed(1);
  }

  /**
   * Tests whether a raw input value is a positive whole number.
   * @param {*} v - the raw value (typically an input's string value).
   * @returns {boolean} true if it parses as an integer of 1 or more.
   */
  function positiveInt(v) {
    var s = String(v).trim();
    if (!/^\d+$/.test(s)) {
      return false;
    }
    return parseInt(s, 10) > 0;
  }

  /**
   * Creates an element with an optional class and text content.
   * @param {string} tag - the tag name.
   * @param {string} [cls] - a class name (or a space-separated list).
   * @param {string} [text] - text content.
   * @returns {Element} the new element.
   */
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) {
      node.className = cls;
    }
    if (text !== undefined && text !== null) {
      node.textContent = text;
    }
    return node;
  }

  // -------------------------------- storage ----------------------------------
  /**
   * Builds a brand-new, empty state object - the baseline used on first run,
   * and the starting point `normalise` fills in from parsed JSON.
   *
   * Three things about the shape that the fields themselves don't record:
   *
   * `templates` holds the ACTIVATE (dailies) rows - disposable presets, {id,
   * text, time, mode}. It's called templates bcuz that's what it used to be 
   * called and there's already user data.
   *
   * `others` holds the ACTIVATE (others) rows - persistent records where the
   * row *is* the item, {id, text, time, mode, date, lastDone, cooldownUntil}.
   *
   * An active task is {id, text, deadline, mode, sourceRowId, hadDate}, and
   * `sourceRowId` points at the `others` row it was spawned from. Deleting that
   * row is deliberately never blocked, so the id may point at nothing; a miss
   * is the documented case, not a bug to guard against.
   *
   * @returns {Object} an empty-but-well-formed state object.
   */
  function freshState() {
    return {
      version: 1,
      pts: 0,
      scr: 0,
      highScores: [],
      ledger: [],
      activeTasks: [],
      templates: [],
      others: [],
      setDraft: { text: "", time: null, mode: null, date: "" },
      spendDraft: { text: "", cost: null, count: null, date: "" },
      spendCostCounts: {},
      lastCopyAt: null,
      ledgerCollapsed: true
    };
  }

  /**
   * Copies parsed JSON onto a fresh state field by field, keeping only values
   * of the right type, so malformed or partial data degrades one field at a
   * time instead of taking the whole blob down.
   * @param {*} raw - whatever `JSON.parse` produced.
   * @returns {Object} a fully-formed state object.
   */
  function normalise(raw) {
    var s = freshState();
    if (!raw || typeof raw !== "object") {
      return s;
    }
    if (typeof raw.pts === "number") s.pts = raw.pts;
    if (typeof raw.scr === "number") s.scr = raw.scr;
    if (Array.isArray(raw.highScores)) s.highScores = raw.highScores;
    if (Array.isArray(raw.ledger)) s.ledger = raw.ledger;
    if (Array.isArray(raw.activeTasks)) s.activeTasks = raw.activeTasks;
    if (Array.isArray(raw.templates)) s.templates = raw.templates;
    if (Array.isArray(raw.others)) s.others = raw.others;
    if (raw.setDraft && typeof raw.setDraft === "object") {
      if (typeof raw.setDraft.text === "string") {
        s.setDraft.text = raw.setDraft.text;
      }
      if (typeof raw.setDraft.time === "string") {
        s.setDraft.time = raw.setDraft.time;
      }
      if (raw.setDraft.mode === "WL" || raw.setDraft.mode === "HL") {
        s.setDraft.mode = raw.setDraft.mode;
      }
      if (typeof raw.setDraft.date === "string") {
        s.setDraft.date = raw.setDraft.date;
      }
    }
    if (raw.spendDraft && typeof raw.spendDraft === "object") {
      if (typeof raw.spendDraft.text === "string") {
        s.spendDraft.text = raw.spendDraft.text;
      }
      if (typeof raw.spendDraft.cost === "number") {
        s.spendDraft.cost = raw.spendDraft.cost;
      }
      if (typeof raw.spendDraft.count === "number") {
        s.spendDraft.count = raw.spendDraft.count;
      }
      if (typeof raw.spendDraft.date === "string") {
        s.spendDraft.date = raw.spendDraft.date;
      }
    }
    if (raw.spendCostCounts && typeof raw.spendCostCounts === "object") {
      Object.keys(raw.spendCostCounts).forEach(function (k) {
        var n = raw.spendCostCounts[k];
        if (/^\d+$/.test(k) && typeof n === "number" && n > 0) {
          s.spendCostCounts[k] = n;
        }
      });
    }
    if (typeof raw.lastCopyAt === "string") s.lastCopyAt = raw.lastCopyAt;
    if (typeof raw.ledgerCollapsed === "boolean") {
      s.ledgerCollapsed = raw.ledgerCollapsed;
    }
    return s;
  }

  /**
   * Loads Falsedge's own state from localStorage, falling back to a fresh
   * state if nothing is stored or the stored JSON can't be parsed.
   * @returns {Object} a state object.
   */
  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return freshState();
      return normalise(JSON.parse(raw));
    } catch (e) {
      return freshState();
    }
  }

  /**
   * Persists Falsedge's in-memory state to its own localStorage key, evicting
   * undo history to make room before it gives up.
   */
  function save() {
    while (true) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        return;
      } catch (e) {}
      if (undoOldest >= undoPointer) break;
      dropOldestUndo();
    }
    toast("Could not save to this browser's storage.");
  }

  // ---------------------------------- undo -----------------------------------
  /**
   * Deep-clones the whole state object for the undo ring.
   * @returns {Object} a detached copy of `state`.
   */
  function snapshotState() {
    return JSON.parse(JSON.stringify(state));
  }

  /**
   * localStorage key for a position's ring slot.
   * @param {number} n - timeline position.
   * @returns {string} the slot key.
   */
  function undoSlotKey(n) {
    return UNDO_SLOT_PREFIX + (n % UNDO_RING_SIZE);
  }

  /**
   * Writes a snapshot to a position's slot, updating the byte figures.
   * @param {number} n - timeline position.
   * @param {Object} snapshot - state clone to store.
   * @returns {boolean} false if storage threw.
   */
  function writeUndoSlot(n, snapshot) {
    var slot = n % UNDO_RING_SIZE;
    var raw = JSON.stringify(snapshot);
    try {
      localStorage.setItem(undoSlotKey(n), raw);
    } catch (e) {
      return false;
    }
    undoBytesUsed += raw.length - undoSlotBytes[slot];
    undoSlotBytes[slot] = raw.length;
    return true;
  }

  /**
   * Reads a position's slot back, refreshing its byte figure.
   * @param {number} n - timeline position.
   * @returns {Object|null} the snapshot, or null on a miss.
   */
  function readUndoSlot(n) {
    var slot = n % UNDO_RING_SIZE;
    try {
      var raw = localStorage.getItem(undoSlotKey(n));
      if (raw) {
        var obj = JSON.parse(raw);
        undoBytesUsed += raw.length - undoSlotBytes[slot];
        undoSlotBytes[slot] = raw.length;
        return obj;
      }
    } catch (e) {}
    undoBytesUsed -= undoSlotBytes[slot];
    undoSlotBytes[slot] = 0;
    return null;
  }

  /**
   * Persists the counters and labels.
   * @returns {boolean} false if storage threw.
   */
  function writeUndoIndex() {
    try {
      localStorage.setItem(UNDO_INDEX_KEY, JSON.stringify({
        undoOldest: undoOldest,
        undoPointer: undoPointer,
        undoNewest: undoNewest,
        undoLabels: undoLabels
      }));
    } catch (e) {
      return false;
    }
    return true;
  }

  /**
   * Retires the oldest position. Never drops the one the app sits on.
   */
  function dropOldestUndo() {
    if (undoOldest >= undoPointer) return;
    var slot = undoOldest % UNDO_RING_SIZE;
    undoRing[slot] = null;
    undoLabels[slot] = null;
    undoBytesUsed -= undoSlotBytes[slot];
    undoSlotBytes[slot] = 0;
    try {
      localStorage.removeItem(undoSlotKey(undoOldest));
    } catch (e) {}
    undoOldest += 1;
  }

  /**
   * Clears every slot key and zeroes the byte figures.
   */
  function wipeAllUndoSlots() {
    for (var i = 0; i < UNDO_RING_SIZE; i++) {
      try {
        localStorage.removeItem(UNDO_SLOT_PREFIX + i);
      } catch (e) {}
      undoSlotBytes[i] = 0;
    }
    undoBytesUsed = 0;
  }

  /**
   * Snapshot for a position, from RAM if present, else from disk.
   * @param {number} n - timeline position.
   * @returns {Object|null} the snapshot, or null when neither has it.
   */
  function undoStateAt(n) {
    var cached = undoRing[n % UNDO_RING_SIZE];
    if (cached) return cached;
    return readUndoSlot(n);
  }

  /**
   * Runs a ring write, dropping history and retrying when storage is full.
   * @param {Function} write - returns false if storage threw.
   */
  function undoWriteWithRetry(write) {
    while (!write()) {
      if (undoOldest >= undoPointer) return;
      dropOldestUndo();
    }
  }

  /**
   * Drops history until the ring is back under its byte ceiling.
   */
  function trimUndoToBudget() {
    while (undoBytesUsed > UNDO_BYTE_BUDGET && undoOldest < undoPointer) {
      dropOldestUndo();
    }
  }

  /**
   * @param {*} v - value to test.
   * @returns {boolean} true when `v` is a non-negative integer.
   */
  function isUndoCounter(v) {
    return typeof v === "number" && isFinite(v)
      && Math.floor(v) === v && v >= 0;
  }

  /**
   * Whether a parsed index can be trusted to describe the ring.
   * @param {Object|null} idx - the parsed index.
   * @returns {boolean} true when the counters and labels all check out.
   */
  function undoIndexIsTrusted(idx) {
    if (!idx) return false;
    if (!isUndoCounter(idx.undoOldest)) return false;
    if (!isUndoCounter(idx.undoPointer)) return false;
    if (!isUndoCounter(idx.undoNewest)) return false;
    if (idx.undoOldest > idx.undoPointer) return false;
    if (idx.undoPointer > idx.undoNewest) return false;
    if (idx.undoNewest - idx.undoOldest > UNDO_CAP) return false;
    if (!Array.isArray(idx.undoLabels)) return false;
    return idx.undoLabels.length === UNDO_RING_SIZE;
  }

  /**
   * Records the pre-mutation state. Must be called before the mutation.
   * @param {string} label - the label the toast renders after "Undid: ".
   */
  function pushUndo(label) {
    var snapshot = snapshotState();
    var at = undoPointer;
    undoRing[at % UNDO_RING_SIZE] = snapshot;
    undoLabels[at % UNDO_RING_SIZE] = label;
    trimUndoToBudget();
    undoWriteWithRetry(function () {
      return writeUndoSlot(at, snapshot);
    });
    undoPointer += 1;
    undoNewest = undoPointer;
    if (undoPointer - undoOldest > UNDO_CAP) {
      dropOldestUndo();
    }
    undoWriteWithRetry(writeUndoIndex);
    refreshUndoRedoButtons();
  }

  /**
   * Moves the timeline one position, storing the position being left.
   * @param {number} delta - -1 to undo, +1 to redo.
   * @returns {boolean} false if the target slot was unrecoverable.
   */
  function stepUndoTo(delta) {
    var current = snapshotState();
    var at = undoPointer;
    undoRing[at % UNDO_RING_SIZE] = current;
    undoWriteWithRetry(function () {
      return writeUndoSlot(at, current);
    });
    var target = undoStateAt(undoPointer + delta);
    if (!target) return false;
    undoPointer += delta;
    undoRing[undoPointer % UNDO_RING_SIZE] = target;
    state = JSON.parse(JSON.stringify(target));
    save();
    undoWriteWithRetry(writeUndoIndex);
    render();
    refreshUndoRedoButtons();
    return true;
  }

  /**
   * Rebuilds the ring from localStorage at boot.
   */
  function loadUndoRing() {
    var i;
    for (i = 0; i < UNDO_RING_SIZE; i++) {
      undoRing[i] = null;
      undoLabels[i] = null;
      undoSlotBytes[i] = 0;
    }
    undoBytesUsed = 0;
    undoOldest = 0;
    undoPointer = 0;
    undoNewest = 0;

    var idx = null;
    try {
      var raw = localStorage.getItem(UNDO_INDEX_KEY);
      if (raw) idx = JSON.parse(raw);
    } catch (e) {}

    if (!undoIndexIsTrusted(idx)) {
      wipeAllUndoSlots();
      undoRing[0] = snapshotState();
      return;
    }
    undoOldest = idx.undoOldest;
    undoPointer = idx.undoPointer;
    undoNewest = idx.undoNewest;
    for (i = 0; i < UNDO_RING_SIZE; i++) {
      undoLabels[i] = idx.undoLabels[i];
    }
    for (i = undoOldest; i <= undoNewest; i++) {
      if (i !== undoPointer) {
        undoRing[i % UNDO_RING_SIZE] = readUndoSlot(i);
      }
    }
    undoRing[undoPointer % UNDO_RING_SIZE] = snapshotState();

    // narrow to the contiguous run around the pointer, so no hole is steppable
    var lo = undoPointer;
    while (lo > undoOldest && undoRing[(lo - 1) % UNDO_RING_SIZE]) {
      lo -= 1;
    }
    undoOldest = lo;
    var hi = undoPointer;
    while (hi < undoNewest && undoRing[(hi + 1) % UNDO_RING_SIZE]) {
      hi += 1;
    }
    undoNewest = hi;
  }

  /**
   * Steps one entry backwards.
   */
  function undo() {
    if (undoPointer <= undoOldest) return;
    var label = undoLabels[(undoPointer - 1) % UNDO_RING_SIZE];
    if (stepUndoTo(-1)) {
      toast("Undid: " + label);
    }
  }

  /**
   * Steps one entry forwards.
   */
  function redo() {
    if (undoPointer >= undoNewest) return;
    var label = undoLabels[undoPointer % UNDO_RING_SIZE];
    if (stepUndoTo(1)) {
      toast("Redid: " + label);
    }
  }

  // ------------------------------ state lookups ------------------------------
  /**
   * Finds an active task by id. Handlers must call this inside the callback -
   * an object captured while building an element is a detached orphan after
   * any undo.
   * @param {string} id - the task id.
   * @returns {Object|undefined} the task, if it still exists.
   */
  function findTask(id) {
    return state.activeTasks.find(function (t) {
      return t.id === id;
    });
  }

  /**
   * Finds an active task's index in `state.activeTasks`.
   * @param {string} id - the task id.
   * @returns {number} the index, or -1.
   */
  function indexOfTask(id) {
    var i;
    for (i = 0; i < state.activeTasks.length; i++) {
      if (state.activeTasks[i].id === id) return i;
    }
    return -1;
  }

  /**
   * Returns the array backing one ACTIVATE section.
   * @param {string} kind - "dailies" or "others".
   * @returns {Object[]} the live array, not a copy.
   */
  function rowList(kind) {
    if (kind === "others") {
      return state.others;
    }
    return state.templates;
  }

  /**
   * Finds an ACTIVATE row by id.
   * @param {string} kind - "dailies" or "others".
   * @param {string} id - the row id.
   * @returns {Object|undefined} the row, if it still exists.
   */
  function findRow(kind, id) {
    return rowList(kind).find(function (r) {
      return r.id === id;
    });
  }

  /**
   * Finds an ACTIVATE row's index in its own section's array.
   * @param {string} kind - "dailies" or "others".
   * @param {string} id - the row id.
   * @returns {number} the index, or -1.
   */
  function indexOfRow(kind, id) {
    var list = rowList(kind);
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].id === id) return i;
    }
    return -1;
  }

  /**
   * Resolves a task's `sourceRowId` back to its `others` row. A miss is the
   * normal case rather than an error - deleting a row is never blocked, so a
   * live task routinely outlives the row it was spawned from.
   * @param {Object} task - the active task.
   * @returns {Object|undefined} the row, if there is one and it still exists.
   */
  function sourceRowOf(task) {
    if (!task.sourceRowId) return undefined;
    return findRow("others", task.sourceRowId);
  }

  /**
   * Milliseconds left on an `others` row's cancel cooldown.
   * @param {Object} row - the row.
   * @param {Date} now - the reference moment.
   * @returns {number} the remainder, or 0 if the row isn't on cooldown.
   */
  function cooldownLeft(row, now) {
    if (!row.cooldownUntil) return 0;
    var until = new Date(row.cooldownUntil).getTime();
    if (isNaN(until)) return 0;
    return Math.max(0, until - now.getTime());
  }

  /**
   * Builds a task's four leniency tiers from its stored deadline.
   * @param {Object} task - the active task.
   * @returns {{at: Date, pts: number}[]} the tiers, soonest first.
   */
  function tierList(task) {
    var offsets = WL_OFFSETS;
    if (task.mode === "HL") {
      offsets = HL_OFFSETS;
    }
    var base = new Date(task.deadline).getTime();
    return offsets.map(function (off, i) {
      return { at: new Date(base + off * 60000), pts: TIER_POINTS[i] };
    });
  }

  /**
   * Finds the live tier at a given moment, resolved inclusively - completing
   * at exactly a tier's time (floored to the minute) still awards that tier.
   * @param {{at: Date}[]} tiers - the task's tiers.
   * @param {Date} now - the moment to resolve against.
   * @returns {number} the tier's index, or -1 once every tier has passed.
   */
  function liveTierIndex(tiers, now) {
    var floored = new Date(now.getTime());
    floored.setSeconds(0, 0);
    var i;
    for (i = 0; i < tiers.length; i++) {
      if (tiers[i].at.getTime() >= floored.getTime()) return i;
    }
    return -1;
  }

  /**
   * Returns the dailies rows in display order: purely by clock time, ascending
   * from 00:00. An absolute order, so it never shifts as the day passes.
   * Creation order breaks ties for free, since `sort` is stable.
   * @returns {Object[]} a sorted shallow copy of the dailies array.
   */
  function sortedDailies() {
    return state.templates.slice().sort(function (a, b) {
      if (a.time < b.time) return -1;
      if (a.time > b.time) return 1;
      return 0;
    });
  }

  /**
   * Returns the `others` rows in display order: by `lastDone` descending, most
   * recently completed first. A row that has never been completed carries no
   * `lastDone` at all and pins above everything, so anything new or untouched
   * is the first thing in the section.
   * @returns {Object[]} a sorted shallow copy of `state.others`.
   */
  function sortedOthers() {
    return state.others.slice().sort(function (a, b) {
      var ta = null;
      var tb = null;
      if (a.lastDone) {
        ta = new Date(a.lastDone).getTime();
      }
      if (b.lastDone) {
        tb = new Date(b.lastDone).getTime();
      }
      if (ta === null && tb === null) return 0;
      if (ta === null) return -1;
      if (tb === null) return 1;
      return tb - ta;
    });
  }

  // --------------------------------- ledger ----------------------------------
  /**
   * Pre-renders a resolved task's ledger entry. Built once, at the moment the
   * task resolves, and never recomputed afterwards.
   * @param {Object} task - the task being resolved.
   * @param {string} byText - what the "completed by:" line reads.
   * @param {number} oldPts - `pts` before the award.
   * @param {number} ptsDelta - whole points gained.
   * @param {number} oldScr - `scr` before the award.
   * @param {number} award - the tier award applied to `scr`.
   * @returns {string} the finished entry.
   */
  function taskEntryText(task, byText, oldPts, ptsDelta, oldScr, award) {
    var mode = task.mode;
    if (!mode) {
      mode = "-";
    }
    var lines = [];
    lines.push(task.text);
    lines.push("by " + fmtDateTime(new Date(task.deadline)) +
      " (" + mode + ")");
    lines.push("completed by: " + byText);
    if (award > 0 && ptsDelta === 0) {
      lines.push("pts = " + fmtPts(oldPts));
    } else {
      lines.push("pts = " + fmtPts(oldPts) + " + " + fmtPts(ptsDelta) +
        " = " + fmtPts(oldPts + ptsDelta));
    }
    lines.push("scr = " + fmtScr(oldScr) + " + " + fmtScr(award) +
      " = " + fmtScr(oldScr + award));
    return lines.join("\n");
  }

  /**
   * Pre-renders a spend's ledger entry. No `scr` line, since nothing else
   * moved. The multiplier is omitted entirely at a count of 1.
   * @param {string} text - what the points were spent on.
   * @param {number} cost - points spent per unit.
   * @param {number} count - units bought.
   * @param {string} day - the date the spend is stamped with, "YYYY-MM-DD".
   * @param {number} oldPts - `pts` before the spend.
   * @returns {string} the finished entry.
   */
  function spendEntryText(text, cost, count, day, oldPts) {
    var head = text;
    var owed = cost;
    if (count > 1) {
      head = text + " ×" + count;
      owed = cost + "×" + count;
    }
    return head + "\non " + day + "\npts = " + fmtPts(oldPts) + " - " +
      owed + " = " + fmtPts(oldPts - cost * count);
  }

  /**
   * Fills forward from the oldest ledger entry, adding whole entries until the
   * next one would push the finished clipboard string past 2000 characters.
   * The fences and blank lines count, since 2000 is a limit on what gets
   * pasted somewhere else.
   * @returns {{text: string, count: number}} the batch and its entry count.
   */
  function exportBatch() {
    var out = "";
    var count = 0;
    var i;
    for (i = 0; i < state.ledger.length; i++) {
      var block = "```\n" + state.ledger[i] + "\n```";
      var next = out;
      if (next) {
        next = next + "\n";
      }
      next = next + block;
      if (next.length > EXPORT_LIMIT) break;
      out = next;
      count++;
    }
    return { text: out, count: count };
  }

  /**
   * Whether `[Delete exported]` is currently armed - i.e. a copy landed within
   * the last 10 minutes. Recomputed from `getNow()`, never trusted from the
   * rendered DOM.
   * @returns {boolean} true if a delete is allowed right now.
   */
  function deleteArmed() {
    if (!state.lastCopyAt) return false;
    var t = new Date(state.lastCopyAt).getTime();
    if (isNaN(t)) return false;
    return getNow().getTime() - t <= COPY_WINDOW_MS;
  }

  /**
   * Copies the oldest batch to the clipboard. `lastCopyAt` and the undo entry
   * land in the resolve handler, so a rejected copy writes nothing and arms
   * nothing.
   */
  function copyOldest() {
    var batch = exportBatch();
    if (!navigator.clipboard) {
      toast("copy failed");
      return;
    }
    navigator.clipboard.writeText(batch.text).then(function () {
      pushUndo("copy ledger");
      state.lastCopyAt = getNow().toISOString();
      save();
      render();
      toast("Copied " + batch.count + " entries");
    }).catch(function () {
      toast("copy failed");
    });
  }

  /**
   * Deletes exactly the batch `Copy from oldest` produces, then disarms itself
   * so the rhythm stays copy, delete, copy, delete.
   */
  function deleteExported() {
    if (!deleteArmed()) {
      toast("Delete available after exporting");
      return;
    }
    var batch = exportBatch();
    pushUndo("delete exported");
    state.ledger.splice(0, batch.count);
    state.lastCopyAt = null;
    save();
    render();
    toast("Deleted " + batch.count + " entries");
  }

  /**
   * Flips the ledger's collapsed flag and pays for "growing upward" with
   * scroll: the region's height delta is added to the page scroll, so the
   * toggle stays put and nothing below the ledger visually moves. Writes view
   * state only, so it pushes no undo entry.
   */
  function toggleLedger() {
    var region = document.getElementById("ledgerRegion");
    var before = 0;
    if (region) {
      before = region.getBoundingClientRect().height;
    }
    state.ledgerCollapsed = !state.ledgerCollapsed;
    save();
    render();
    var after = 0;
    region = document.getElementById("ledgerRegion");
    if (region) {
      after = region.getBoundingClientRect().height;
    }
    window.scrollTo(0, Math.max(0, window.scrollY + (after - before)));
  }

  // ------------------------------ scores / spend -----------------------------
  /**
   * Inserts a finished run into the high-scores table, sorted descending and
   * capped at 10. A tie sits above the existing equal entry; a score that
   * doesn't beat the current 10th falls off the end and is discarded.
   * @param {number} score - the score to record.
   * @param {string} date - the day key it was reset on.
   */
  function insertHighScore(score, date) {
    var at = state.highScores.length;
    var i;
    for (i = 0; i < state.highScores.length; i++) {
      if (score >= state.highScores[i].score) {
        at = i;
        break;
      }
    }
    state.highScores.splice(at, 0, { score: score, date: date });
    if (state.highScores.length > 10) {
      state.highScores.length = 10;
    }
  }

  /**
   * Pushes the current run into the high scores and zeroes `scr`. `pts` is
   * untouched. Refuses at zero, since there'd be nothing to record.
   */
  function streakBroke() {
    if (state.scr <= 0) {
      toast("nothing to break");
      return;
    }
    pushUndo("streak broke");
    insertHighScore(state.scr, dayKey(getNow()));
    state.scr = 0;
    save();
    render();
  }

  /**
   * Renders one high-scores line, the same way the panel and its Copy button
   * both need it.
   * @param {Object} h - a `{score, date}` record.
   * @param {number} i - its zero-based rank.
   * @returns {string} the formatted line.
   */
  function highScoreLine(h, i) {
    return (i + 1) + ". " + fmtScr(h.score) + "  " + h.date;
  }

  /**
   * Copies the displayed high-scores list verbatim. The empty placeholder is a
   * rendering of emptiness, not a line of the list, so it's never copied.
   */
  function copyHighScores() {
    var lines = state.highScores.map(highScoreLine);
    if (!navigator.clipboard) {
      toast("copy failed");
      return;
    }
    navigator.clipboard.writeText(lines.join("\n")).then(function () {
      toast("Copied " + lines.length + " scores");
    }).catch(function () {
      toast("copy failed");
    });
  }

  /**
   * Reads a raw `×N` input, treating anything invalid as a single unit.
   * @param {*} raw - the raw input value.
   * @returns {number} the count, at least 1.
   */
  function spendCount(raw) {
    if (!positiveInt(raw)) {
      return 1;
    }
    return parseInt(String(raw).trim(), 10);
  }

  /**
   * Subtracts cost × count from `pts`, leaves `scr` alone, and appends a spend
   * entry to the ledger. `pts` is allowed to go negative. A blank date means
   * today, resolved here rather than when the field was filled in.
   * @param {string} rawText - what the points were spent on.
   * @param {*} rawCost - the raw per-unit cost input value.
   * @param {*} rawCount - the raw `×N` input value.
   * @param {string} rawDate - "YYYY-MM-DD", or "" for today.
   */
  function doSpend(rawText, rawCost, rawCount, rawDate) {
    var text = rawText.trim();
    if (!text) return;
    if (!positiveInt(rawCost)) return;
    var cost = parseInt(String(rawCost).trim(), 10);
    var count = spendCount(rawCount);
    var day = rawDate;
    if (!day) {
      day = dayKey(getNow());
    }
    pushUndo("spend");
    state.ledger.push(spendEntryText(text, cost, count, day, state.pts));
    state.pts = state.pts - cost * count;
    bumpSpendCost(cost);
    state.spendDraft = { text: "", cost: null, count: null, date: "" };
    save();
    render();
  }

  /**
   * Counts one use of a cost value, for the `pts cost` suggestion list.
   * @param {number} cost - the per-unit cost just spent.
   */
  function bumpSpendCost(cost) {
    var key = String(cost);
    if (!state.spendCostCounts[key]) {
      state.spendCostCounts[key] = 0;
    }
    state.spendCostCounts[key] += 1;
  }

  /**
   * The 10 most-used cost values, sorted numerically rather than by frequency.
   * @returns {number[]} the suggestions.
   */
  function topSpendCosts() {
    var keys = Object.keys(state.spendCostCounts);
    keys.sort(function (a, b) {
      return state.spendCostCounts[b] - state.spendCostCounts[a];
    });
    var top = keys.slice(0, 10).map(function (k) {
      return parseInt(k, 10);
    });
    top.sort(function (a, b) {
      return a - b;
    });
    return top;
  }

  /**
   * Wipes all four spend draft fields at once. Undoable, so no confirmation.
   */
  function clearSpendDraft() {
    pushUndo("clear spend draft");
    state.spendDraft = { text: "", cost: null, count: null, date: "" };
    save();
    render();
  }

  /**
   * Writes one field of the SET draft, pushing undo only when the value
   * actually changed - tapping into a field and back out shouldn't burn an
   * undo slot.
   * @param {string} field - "text", "time", "mode" or "date".
   * @param {*} value - the new value.
   */
  function writeSetDraft(field, value) {
    if (state.setDraft[field] === value) return;
    pushUndo("edit SET draft");
    state.setDraft[field] = value;
    save();
  }

  /**
   * Writes one field of the spend draft, on the same changed-only rule as the
   * SET draft.
   * @param {string} field - "text", "cost", "count" or "date".
   * @param {*} value - the new value.
   */
  function writeSpendDraft(field, value) {
    if (state.spendDraft[field] === value) return;
    pushUndo("edit spend draft");
    state.spendDraft[field] = value;
    save();
  }

  /**
   * Saves whatever is currently typed into the two draft-backed text fields.
   * Called on blur and on `visibilitychange`.
   */
  function flushDrafts() {
    var setText = document.getElementById("setText");
    if (setText) {
      writeSetDraft("text", setText.value);
    }
    var spendText = document.getElementById("spendText");
    if (spendText) {
      writeSpendDraft("text", spendText.value);
    }
  }

  // ------------------------------ task lifecycle -----------------------------
  /**
   * Resolves an active task: awards points, writes its ledger entry, drops it
   * from `activeTasks`, and stamps whatever its source `others` row is owed -
   * `lastDone` on any completion, on time or late, and a 36h cancel cooldown
   * on a cancel that was activated with a date. A cancel never stamps
   * `lastDone`, and a source row that has since been deleted takes neither
   * stamp.
   * @param {string} id - the task id.
   * @param {Date} when - the effective completion time.
   * @param {number} award - points awarded (0 for failed and cancelled).
   * @param {string} byText - what the "completed by:" line reads.
   * @param {string} kind - "complete" or "cancel".
   * @param {string} label - the undo label.
   */
  function resolveTask(id, when, award, byText, kind, label) {
    var task = findTask(id);
    if (!task) return;
    pushUndo(label);
    var oldPts = state.pts;
    var oldScr = state.scr;
    var newScr = oldScr + award;
    var delta = Math.floor(newScr) - Math.floor(oldScr);
    state.ledger.push(
      taskEntryText(task, byText, oldPts, delta, oldScr, award));
    state.scr = newScr;
    state.pts = oldPts + delta;
    var row = sourceRowOf(task);
    if (row && kind === "complete") {
      row.lastDone = when.toISOString();
    } else if (row && task.hadDate) {
      row.cooldownUntil =
        new Date(getNow().getTime() + COOLDOWN_MS).toISOString();
    }
    var at = indexOfTask(id);
    if (at !== -1) {
      state.activeTasks.splice(at, 1);
    }
    save();
    render();
  }

  /**
   * Bonus for finishing a further task early: +2 per whole 24h remaining.
   * @param {Object} task - the task.
   * @param {Date} now - the completion moment.
   * @returns {number} the bonus, 0 for anything not further.
   */
  function earlyBonus(task, now) {
    var early = new Date(task.deadline).getTime() - now.getTime();
    if (early <= DAY_MS) return 0;
    return 2 * Math.floor(early / DAY_MS);
  }

  /**
   * The "completed by:" text: a bare clock time, or a full date and time when
   * the completion fell on a different day than the deadline.
   * @param {Object} task - the task being resolved.
   * @param {Date} when - the effective completion moment.
   * @returns {string} the formatted moment.
   */
  function completedByText(task, when) {
    if (dayKey(when) === dayKey(new Date(task.deadline))) {
      return hhmm(when);
    }
    return fmtDateTime(when);
  }

  /**
   * Completes a task at the present moment, awarding whatever tier is live
   * right now - including 0 once every tier has passed.
   * @param {string} id - the task id.
   */
  function completeNow(id) {
    var task = findTask(id);
    if (!task) return;
    var now = getNow();
    var tiers = tierList(task);
    var idx = liveTierIndex(tiers, now);
    var award = 0;
    var byText = "none (failed)";
    if (idx !== -1) {
      award = tiers[idx].pts + earlyBonus(task, now);
      byText = completedByText(task, now);
    }
    resolveTask(id, now, award, byText, "complete", "complete now");
  }

  /**
   * Completes a task against an already-passed tier, for a task finished
   * earlier than it's being reported. The effective completion time is that
   * tier's clock time, not now.
   * @param {string} id - the task id.
   * @param {number} tierIndex - which tier was tapped.
   */
  function completeBefore(id, tierIndex) {
    var task = findTask(id);
    if (!task) return;
    var tier = tierList(task)[tierIndex];
    if (!tier) return;
    resolveTask(id, tier.at, tier.pts, completedByText(task, tier.at),
      "complete", "completed before");
  }

  /**
   * Cancels a task: no points, a "none (cancelled)" ledger entry, no
   * `lastDone`, and - only if it was activated with a date set - a 36h
   * cooldown on the `others` row it came from.
   * @param {string} id - the task id.
   */
  function cancelTask(id) {
    resolveTask(id, getNow(), 0, "none (cancelled)", "cancel", "cancel task");
  }

  /**
   * Renames an active task. An empty value cancels rather than saving an empty
   * name.
   * @param {string} id - the task id.
   * @param {string} raw - the proposed replacement text, untrimmed.
   */
  function editTaskText(id, raw) {
    var task = findTask(id);
    if (!task) return;
    var v = raw.trim();
    if (v === "") {
      render();
      return;
    }
    pushUndo("edit task text");
    task.text = v;
    save();
    render();
  }

  /**
   * Moves an active task's deadline. Validated exactly as SET validates a new
   * one - resolved from `getNow()` at tap time, held to the same 20-minute
   * floor, and refused if another active task already holds that instant. The
   * task's own deadline is excluded from the overlap check, since a task can
   * hardly clash with itself.
   *
   * A further task keeps its day. The editor only offers clock times, so
   * re-resolving one against `now` would silently drag it back inside 24h and
   * strip the very thing that made it further.
   * @param {string} id - the task id.
   * @param {string} clock - the chosen clock time, "HH:MM".
   */
  function editTaskTime(id, clock) {
    var task = findTask(id);
    if (!task) return;
    var now = getNow();
    var deadline;
    if (isFurther(task.deadline, now)) {
      deadline = resolveDeadline(clock, dayKey(new Date(task.deadline)), now);
    } else {
      deadline = resolveClockTime(clock, now);
    }
    if (deadline.getTime() - now.getTime() < MIN_LEAD_MS) {
      toast("refreshed");
      render();
      return;
    }
    var clash = state.activeTasks.some(function (t) {
      return t.id !== id &&
        new Date(t.deadline).getTime() === deadline.getTime();
    });
    if (clash) {
      toast(hhmm(deadline) + " overlaps");
      return;
    }
    var iso = deadline.toISOString();
    if (task.deadline === iso) return;
    pushUndo("edit task time");
    task.deadline = iso;
    save();
    render();
  }

  /**
   * Switches an active task's leniency, which reshapes its tier rows. Unlike
   * SET's toggles this one can't clear back to unset - an active task always
   * has a mode, so tapping the lit one is a no-op.
   * @param {string} id - the task id.
   * @param {string} mode - "WL" or "HL".
   */
  function editTaskMode(id, mode) {
    var task = findTask(id);
    if (!task) return;
    if (task.mode === mode) return;
    pushUndo("edit task mode");
    task.mode = mode;
    save();
    render();
  }

  /**
   * The two stack-level rules any new task has to clear, whichever route it
   * arrives by: no two tasks on the same instant, and nothing new while a
   * day-old task is still sitting unresolved. Toasts the reason on refusal.
   * The 20-minute lead floor is deliberately not here - SET answers a stale
   * dropdown by re-rendering, and a swipe has no dropdown to re-render.
   * @param {Date} deadline - the proposed deadline.
   * @param {Date} now - the reference moment.
   * @returns {boolean} true if a task may be created on that instant.
   */
  function deadlineClear(deadline, now) {
    var clash = state.activeTasks.some(function (t) {
      return new Date(t.deadline).getTime() === deadline.getTime();
    });
    if (clash) {
      toast(hhmm(deadline) + " overlaps");
      return false;
    }
    var stale = state.activeTasks.some(function (t) {
      return now.getTime() - new Date(t.deadline).getTime() > DAY_MS;
    });
    if (stale) {
      toast("clean up old tasks");
      return false;
    }
    return true;
  }

  /**
   * Wipes all four SET draft fields at once - text, time, WL/HL and date. No
   * confirmation step: it pushes onto the undo stack, so a mis-tap is one undo
   * away.
   */
  function clearSetDraft() {
    pushUndo("clear draft");
    state.setDraft = { text: "", time: null, mode: null, date: "" };
    save();
    render();
  }

  /**
   * Validates and commits the SET box. Every failure is a hard block with its
   * own toast; nothing is set and nothing silently defaults.
   */
  function submitSet() {
    var now = getNow();
    var textEl = document.getElementById("setText");
    var selectEl = document.getElementById("setSelect");
    if (!textEl || !selectEl) return;
    var text = textEl.value.trim();
    if (!text) {
      toast("Task needs text");
      return;
    }
    var mode = state.setDraft.mode;
    if (mode !== "WL" && mode !== "HL") {
      toast("Pick WL or HL");
      return;
    }
    var date = state.setDraft.date;
    if (date && !dateInRange(date, now)) {
      toast("date must be within 1 week");
      return;
    }
    var deadline = resolveDeadline(selectEl.value, date, now);
    if (deadline.getTime() - now.getTime() < MIN_LEAD_MS) {
      toast("refreshed");
      render();
      return;
    }
    if (!deadlineClear(deadline, now)) return;
    pushUndo("set task");
    state.activeTasks.push({
      id: uid(),
      text: text,
      deadline: deadline.toISOString(),
      mode: mode
    });
    state.setDraft = { text: "", time: null, mode: null, date: "" };
    save();
    render();
  }

  // ------------------------------ row lifecycle ------------------------------
  /**
   * Adds a row from its section's adder. The dailies adder is gated on text
   * and time together; the `others` adder only on text, since an `others` row
   * is a real record that can sit there half-filled until it's wanted.
   * @param {string} kind - "dailies" or "others".
   */
  function addRow(kind) {
    var draft = adderDrafts[kind];
    var text = draft.text.trim();
    if (!text) return;
    if (kind === "dailies" && !draft.time) return;
    pushUndo("add " + kind + " row");
    if (kind === "others") {
      state.others.push({
        id: uid(),
        text: text,
        time: draft.time,
        mode: draft.mode,
        date: draft.date,
        lastDone: null,
        cooldownUntil: null
      });
      adderDrafts.others = { text: "", time: "", mode: null, date: "" };
    } else {
      state.templates.push({
        id: uid(),
        text: text,
        time: draft.time,
        mode: draft.mode
      });
      adderDrafts.dailies = { text: "", time: "", mode: null };
    }
    save();
    render();
  }

  /**
   * Writes one field of a row.
   * @param {string} kind - "dailies" or "others".
   * @param {string} id - the row id.
   * @param {string} field - "text", "time", "mode" or "date".
   * @param {*} value - the new value.
   */
  function editRow(kind, id, field, value) {
    var row = findRow(kind, id);
    if (!row) return;
    if (row[field] === value) return;
    pushUndo("edit row");
    row[field] = value;
    save();
    render();
  }

  /**
   * Clears an `others` row's stored date and time together. One menu entry
   * rather than two, since a row holding a date but no time can't be activated
   * anyway.
   * @param {string} id - the row id.
   */
  function clearRowDatetime(id) {
    var row = findRow("others", id);
    if (!row) return;
    if (!row.time && !row.date) return;
    pushUndo("clear datetime");
    row.time = "";
    row.date = "";
    save();
    render();
  }

  /**
   * Deletes a row. Never blocked, even on an `others` row with a live task
   * still out: that task keeps running with a `sourceRowId` pointing at
   * nothing, and resolves later without stamping anything.
   * @param {string} kind - "dailies" or "others".
   * @param {string} id - the row id.
   */
  function deleteRow(kind, id) {
    var at = indexOfRow(kind, id);
    if (at === -1) return;
    pushUndo("delete row");
    rowList(kind).splice(at, 1);
    save();
    render();
  }

  /**
   * Prefills SET from a row, leaving the row itself untouched and creating
   * nothing. An `others` row's date rides along with the rest.
   * @param {string} kind - "dailies" or "others".
   * @param {string} id - the row id.
   */
  function prefillFromRow(kind, id) {
    var row = findRow(kind, id);
    if (!row) return;
    pushUndo("edit SET draft");
    state.setDraft.text = row.text;
    state.setDraft.time = row.time;
    state.setDraft.date = row.date || "";
    if (row.mode === "WL" || row.mode === "HL") {
      state.setDraft.mode = row.mode;
    }
    save();
    render();
    scrollToSet();
    toast("prefilled SET");
  }

  /**
   * Creates an active task straight from a row, bypassing SET entirely. Text,
   * WL/HL and a time are all required in both sections; the date is optional
   * and only exists on `others` rows. An `others` row additionally has to be
   * off cooldown and have no live task of its own already out.
   * @param {string} kind - "dailies" or "others".
   * @param {string} id - the row id.
   */
  function activateRow(kind, id) {
    var row = findRow(kind, id);
    if (!row) return;
    var now = getNow();
    var text = String(row.text).trim();
    if (!text) {
      toast("Task needs text");
      return;
    }
    if (row.mode !== "WL" && row.mode !== "HL") {
      toast("Pick WL or HL");
      return;
    }
    if (!row.time) {
      toast("Task needs a time");
      return;
    }
    var date = "";
    if (kind === "others") {
      var left = cooldownLeft(row, now);
      if (left > 0) {
        toast("on cooldown - " + fmtLeft(left) + " left");
        return;
      }
      var out = state.activeTasks.some(function (t) {
        return t.sourceRowId === id;
      });
      if (out) {
        toast("already out as a task");
        return;
      }
      date = row.date || "";
      if (date && !dateInRange(date, now)) {
        toast("date must be within 1 week");
        return;
      }
    }
    var deadline = resolveDeadline(row.time, date, now);
    if (deadline.getTime() - now.getTime() < MIN_LEAD_MS) {
      toast("too soon");
      return;
    }
    if (!deadlineClear(deadline, now)) return;
    var iso = deadline.toISOString();
    pushUndo("activate row");
    var task = {
      id: uid(),
      text: text,
      deadline: iso,
      mode: row.mode
    };
    if (kind === "others") {
      task.sourceRowId = id;
      // the cancel cooldown keys off this, not off the deadline: a dated
      // activation may still land inside 24h and so never look "further"
      task.hadDate = date !== "";
      row.date = "";
    }
    state.activeTasks.push(task);
    save();
    render();
    // the swipe leaves the row where it is and the task appears somewhere
    // further up the page, quite possibly offscreen - so say what happened
    var stamp = hhmm(deadline);
    if (isFurther(iso, now)) {
      stamp = stamp + " (" + DAY_ABBR[deadline.getDay()] + ")";
    }
    toast("task set for " + stamp);
  }

  /**
   * Scrolls the SET box into view. SET sits below both ACTIVATE sections, so
   * on a phone a prefill would otherwise land offscreen and look like nothing
   * happened.
   */
  function scrollToSet() {
    var card = document.getElementById("setCard");
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // --------------------------------- gestures --------------------------------
  /**
   * Attaches the shared horizontal-swipe-to-commit gesture to a row: tracks
   * touch movement, applies a live drag transform/opacity/tint once past a
   * small deadzone, and on release either snaps back or commits (calling
   * `onCommit` with "left"/"right") if the drag passed the commit threshold.
   * @param {Element} node - the row element to attach the gesture to.
   * @param {Function} onCommit - called with `"left"` or `"right"` when a swipe
   *   is committed.
   */
  function swipeCore(node, onCommit) {
    var startX = 0;
    var startY = 0;
    var dx = 0;
    var dy = 0;
    var tracking = false;
    var THRESH = 80;
    var origBg = "";
    node.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1) return;
      if (e.target.closest(".inline-edit")) {
        tracking = false;
        return;
      }
      tracking = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      dx = 0;
      dy = 0;
      origBg = node.style.backgroundColor;
    }, { passive: true });
    node.addEventListener("touchmove", function (e) {
      if (!tracking) return;
      dx = e.touches[0].clientX - startX;
      dy = e.touches[0].clientY - startY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
        node.style.transform = "translateX(" + dx * 0.5 + "px)";
        node.style.opacity = String(Math.max(0.4, 1 - Math.abs(dx) / 300));
        if (Math.abs(dx) > THRESH) {
          node.style.backgroundColor =
            "color-mix(in srgb, var(--c-green) 30%, transparent)";
        } else {
          node.style.backgroundColor = origBg;
        }
      }
    }, { passive: true });
    node.addEventListener("touchend", function (e) {
      if (!tracking) return;
      tracking = false;
      node.style.transform = "";
      node.style.opacity = "";
      node.style.backgroundColor = origBg;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > THRESH) {
        // a real swipe happened: stop the underlying button's click firing
        var btn = e.target.closest("button");
        if (btn) {
          var swallow = function (ev) {
            ev.stopPropagation();
            ev.preventDefault();
            btn.removeEventListener("click", swallow, true);
          };
          btn.addEventListener("click", swallow, true);
          setTimeout(function () {
            btn.removeEventListener("click", swallow, true);
          }, 350);
        }
        var swipeDir = "right";
        if (dx < 0) {
          swipeDir = "left";
        }
        onCommit(swipeDir);
      }
    });
  }

  // ------------------------------- menus / edit ------------------------------
  var menuOpenBtn = null;

  /**
   * Closes any open template hamburger menu. Safe to call when none is open.
   */
  function closeAllMenus() {
    document.querySelectorAll(".item-menu").forEach(function (m) {
      m.remove();
    });
    menuOpenBtn = null;
  }

  /**
   * Removes any open `edit?` overlay sitting on a task's text.
   */
  function closeEditOverlays() {
    document.querySelectorAll(".edit-overlay").forEach(function (o) {
      o.remove();
    });
  }

  /**
   * Resizes a textarea to fit its content. Height is cleared first so the box
   * can shrink as well as grow - scrollHeight never reports less than the
   * height already set.
   * @param {Element} box - the textarea to fit.
   */
  function autoGrow(box) {
    box.style.height = "auto";
    box.style.height = box.scrollHeight + "px";
  }

  /**
   * Builds an auto-growing textarea. Every text field in Falsedge is one of
   * these rather than an <input>, so long text wraps into view instead of
   * scrolling sideways out of it.
   * @param {string} cls - the element's class.
   * @param {string} value - the starting text.
   * @returns {Element} the textarea.
   */
  function buildTextArea(cls, value) {
    var box = el("textarea", cls);
    box.rows = 1;
    box.maxLength = 1000;
    box.value = value;
    box.addEventListener("input", function () {
      autoGrow(box);
    });
    return box;
  }

  /**
   * Swaps a piece of text for an inline textarea, wired to commit on blur.
   * Enter inserts a newline instead of committing, so blur is the only way out.
   * The `committed` flag guards against blur firing more than once.
   * @param {Element} target - the element to replace.
   * @param {string} value - the textarea's starting value.
   * @param {Function} onCommit - called once with the raw value.
   */
  function inlineEdit(target, value, onCommit) {
    var box = buildTextArea("inline-edit", value);
    target.replaceWith(box);
    autoGrow(box);
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
    var committed = false;
    /**
     * Saves the edit exactly once.
     */
    function commit() {
      if (committed) return;
      committed = true;
      onCommit(box.value);
    }
    box.addEventListener("blur", commit);
  }

  // --------------------------------- builders --------------------------------
  /**
   * Builds one ledger entry's outlined box.
   * @param {string} text - the pre-rendered entry.
   * @returns {Element} the entry box.
   */
  function buildLedgerEntry(text) {
    return el("div", "ledger-entry", text);
  }

  /**
   * Builds the data-export block: pinned below the scrolling entries, above
   * the toggle, and only present while the ledger is expanded.
   * @returns {Element} the export block.
   */
  function buildExportBlock() {
    var wrap = el("div", "ledger-export");
    wrap.appendChild(el("div", "export-title",
      "Export data at 2000 char limits:"));
    if (!state.ledger.length) {
      wrap.appendChild(el("div", "export-none", "(nothing to export)"));
    }
    var row = el("div", "export-row");
    var copyBtn = el("button", "btn", "Copy from oldest");
    copyBtn.addEventListener("click", copyOldest);
    row.appendChild(copyBtn);
    var delBtn = el("button", "btn", "Delete exported");
    if (!deleteArmed()) {
      // greyed by class, not `disabled` - a tap still has to toast.
      delBtn.classList.add("off");
    }
    delBtn.addEventListener("click", deleteExported);
    row.appendChild(delBtn);
    wrap.appendChild(row);
    return wrap;
  }

  /**
   * Builds the ledger region: the entry list, the export block, and the
   * bottom toggle that doubles as the region's only label.
   * @returns {Element} the ledger region.
   */
  function buildLedger() {
    var region = el("div", "card ledger-region");
    region.id = "ledgerRegion";
    var list = el("div", "ledger-list");
    if (!state.ledger.length) {
      list.appendChild(el("div", "ledger-empty", "(no entries yet)"));
    } else if (state.ledgerCollapsed) {
      list.appendChild(
        buildLedgerEntry(state.ledger[state.ledger.length - 1]));
    } else {
      state.ledger.forEach(function (text) {
        list.appendChild(buildLedgerEntry(text));
      });
    }
    region.appendChild(list);
    if (!state.ledgerCollapsed) {
      region.appendChild(buildExportBlock());
    }
    var toggle = el("button", "ledger-toggle",
      "ledger (" + state.ledger.length + ")");
    toggle.addEventListener("click", toggleLedger);
    region.appendChild(toggle);
    return region;
  }

  /**
   * Builds the spend row that opens between the two score boxes.
   * @returns {Element} the spend row.
   */
  function buildSpendRow() {
    var row = el("div", "spend-row");
    row.appendChild(el("div", "spend-label", "log spent points"));

    var controls = el("div", "spend-controls");
    var text = buildTextArea("spend-text", state.spendDraft.text);
    text.id = "spendText";
    text.placeholder = "spent on";
    var cost = buildSuggestInput("spend-cost", "pts cost",
      state.spendDraft.cost, topSpendCosts(), "spendCostList", controls);
    var count = buildSuggestInput("spend-count", "×N",
      state.spendDraft.count, [1, 2, 3, 4, 5, 6, 7, 8, 9], "spendCountList",
      controls);
    controls.appendChild(text);
    controls.appendChild(cost);
    controls.appendChild(count);
    row.appendChild(controls);

    var second = el("div", "spend-controls");
    var date = el("input", "spend-date");
    date.type = "date";
    date.max = dayKey(getNow());
    date.value = state.spendDraft.date;
    var clearBtn = el("button", "btn", "clear draft");
    var btn = el("button", "btn", "spend");

    /**
     * Greys `[spend]` unless the row holds text and a positive integer cost.
     * `×N` never gates it - a blank one just means one.
     */
    function refresh() {
      btn.disabled = !(text.value.trim() !== "" && positiveInt(cost.value));
    }
    text.addEventListener("input", refresh);
    cost.addEventListener("input", refresh);
    text.addEventListener("blur", function () {
      writeSpendDraft("text", text.value);
    });
    cost.addEventListener("change", function () {
      writeSpendDraft("cost", intOrNull(cost.value));
    });
    count.addEventListener("change", function () {
      writeSpendDraft("count", intOrNull(count.value));
    });
    date.addEventListener("change", function () {
      writeSpendDraft("date", date.value);
    });
    clearBtn.addEventListener("click", clearSpendDraft);
    btn.addEventListener("click", function () {
      doSpend(text.value, cost.value, count.value, date.value);
    });
    refresh();
    second.appendChild(date);
    second.appendChild(clearBtn);
    second.appendChild(btn);
    row.appendChild(second);
    return row;
  }

  /**
   * Parses an input's value as a positive integer.
   * @param {*} v - the raw value.
   * @returns {number|null} the integer, or null if it isn't one.
   */
  function intOrNull(v) {
    if (!positiveInt(v)) {
      return null;
    }
    return parseInt(String(v).trim(), 10);
  }

  /**
   * Builds a number field backed by a `<datalist>`, so it takes a free-typed
   * value or one picked off the dropdown.
   * @param {string} cls - the input's class.
   * @param {string} placeholder - placeholder text.
   * @param {number|null} value - the starting value.
   * @param {number[]} options - the suggestions, in display order.
   * @param {string} listId - id shared by the input and its datalist.
   * @param {Element} parent - node the datalist is appended to; an <input> is
   *   void and cannot hold it.
   * @returns {Element} the input.
   */
  function buildSuggestInput(cls, placeholder, value, options, listId,
    parent) {
    var box = el("input", cls);
    box.type = "number";
    box.min = "1";
    box.step = "1";
    box.placeholder = placeholder;
    box.setAttribute("list", listId);
    if (value !== null) {
      box.value = value;
    }
    var list = el("datalist");
    list.id = listId;
    options.forEach(function (n) {
      var opt = el("option");
      opt.value = n;
      list.appendChild(opt);
    });
    parent.appendChild(list);
    return box;
  }

  /**
   * Builds the two score boxes and, while it's open, the spend row between
   * them. Both boxes sit in the wrapper's max-content column, so they share
   * the wider one's width and their chevrons line up in a column.
   * @returns {Element} the scores block.
   */
  function buildScores() {
    var wrap = el("div", "scores-wrap");
    var ptsBox = el("button", "score-box");
    ptsBox.appendChild(el("span", "score-label",
      "Current pts: " + fmtPts(state.pts)));
    var ptsChev = ">";
    if (spendOpen) {
      ptsChev = "^";
    }
    ptsBox.appendChild(el("span", "score-chev", ptsChev));
    ptsBox.addEventListener("click", function () {
      spendOpen = !spendOpen;
      render();
    });
    wrap.appendChild(ptsBox);
    if (spendOpen) {
      wrap.appendChild(buildSpendRow());
    }
    var scrBox = el("button", "score-box");
    scrBox.id = "scrBox";
    scrBox.appendChild(el("span", "score-label",
      "Current scr: " + fmtScr(state.scr)));
    scrBox.appendChild(el("span", "score-chev", ">"));
    scrBox.addEventListener("click", function () {
      scoresOpen = true;
      render();
    });
    wrap.appendChild(scrBox);
    return wrap;
  }

  /**
   * Builds and mounts the floating high-scores panel plus its dimming scrim.
   * Both live on `body`, out of document flow, so nothing underneath reflows.
   */
  function openScoresPanel() {
    var scrim = el("div", "hs-scrim");
    scrim.addEventListener("click", function () {
      scoresOpen = false;
      render();
    });
    var panel = el("div", "hs-panel");
    var copyBtn = el("button", "hs-copy");
    copyBtn.setAttribute("aria-label", "Copy high scores");
    copyBtn.innerHTML = COPY_ICON;
    copyBtn.addEventListener("click", copyHighScores);
    panel.appendChild(copyBtn);
    if (!state.highScores.length) {
      panel.appendChild(el("div", "hs-empty", "(no high scores yet)"));
    } else {
      state.highScores.forEach(function (h, i) {
        panel.appendChild(el("div", "hs-row", highScoreLine(h, i)));
      });
    }
    document.body.appendChild(scrim);
    document.body.appendChild(panel);
    var box = document.getElementById("scrBox");
    if (box) {
      var boxRect = box.getBoundingClientRect();
      var colRect = appEl.getBoundingClientRect();
      panel.style.top = Math.max(8, boxRect.top) + "px";
      panel.style.right =
        Math.max(8, window.innerWidth - colRect.right) + "px";
    }
  }

  /**
   * Wires the `edit?` overlay onto an active task's text: tapping the text
   * shows the overlay, tapping the overlay enters edit mode, tapping anywhere
   * else dismisses it.
   * @param {Element} row - the task's text row (the overlay's positioning
   *   parent).
   * @param {string} id - the task id.
   */
  function attachTextEdit(row, id) {
    var textEl = row.querySelector(".task-text");
    textEl.addEventListener("click", function (e) {
      e.stopPropagation();
      closeEditOverlays();
      var overlay = el("button", "edit-overlay", "edit?");
      overlay.addEventListener("click", function (ev) {
        ev.stopPropagation();
        closeEditOverlays();
        var live = row.querySelector(".task-text");
        if (!live) return;
        inlineEdit(live, live.textContent, function (value) {
          editTaskText(id, value);
        });
      });
      row.appendChild(overlay);
    });
  }

  /**
   * Picks an active task block's glow. The stack runs against the page's
   * ramp - the soonest task is the deepest blue and the latest the palest
   * azure - and a lone task sits at the midpoint, so the page stays evenly
   * spaced however many tasks there are.
   * @param {number} i - the block's position in the sorted stack.
   * @param {number} n - how many blocks the stack holds.
   * @returns {string} an `hsl()` colour.
   */
  function taskGlow(i, n) {
    var hue = (TASK_HUE_SOONEST + TASK_HUE_LATEST) / 2;
    if (n > 1) {
      hue = TASK_HUE_SOONEST -
        (TASK_HUE_SOONEST - TASK_HUE_LATEST) * (i / (n - 1));
    }
    return "hsl(" + hue.toFixed(1) + ", 70%, 56%)";
  }

  /**
   * Wires the `edit time?` overlay onto a task's tier rows, the same shape as
   * the `edit?` overlay on its text.
   * @param {Element} wrap - the tier-row wrapper (the positioning parent).
   * @param {string} id - the task id.
   */
  function attachTimeEdit(wrap, id) {
    wrap.addEventListener("click", function (e) {
      e.stopPropagation();
      closeEditOverlays();
      var overlay = el("button", "edit-overlay", "edit time?");
      overlay.addEventListener("click", function (ev) {
        ev.stopPropagation();
        closeEditOverlays();
        timeEditId = id;
        render();
      });
      wrap.appendChild(overlay);
    });
  }

  /**
   * Builds the deadline/leniency editor that replaces a task's tier rows
   * while it's open. Both controls commit on change, and the editor stays
   * open across a commit so time and mode can be changed in one go.
   * @param {string} id - the task id.
   * @param {Date} now - the moment the dropdown is built against.
   * @returns {Element} the editor row.
   */
  function buildTaskTimeEditor(id, now) {
    var task = findTask(id);
    var row = el("div", "task-time-edit");
    var opts = dropdownOptions(now);
    var sel = el("select", "time-select");
    opts.forEach(function (t) {
      var o = el("option", "", t);
      o.value = t;
      sel.appendChild(o);
    });
    // an overdue deadline isn't on offer any more, so fall to the first slot
    var cur = hhmm(new Date(task.deadline));
    if (opts.indexOf(cur) === -1) {
      cur = opts[0];
    }
    sel.value = cur;
    sel.addEventListener("change", function () {
      editTaskTime(id, sel.value);
    });
    row.appendChild(sel);
    row.appendChild(buildModeToggles(function () {
      var live = findTask(id);
      if (!live) return null;
      return live.mode;
    }, function (next) {
      if (!next) return;
      editTaskMode(id, next);
    }));
    return row;
  }

  /**
   * Builds one active task's block: cancel, text, the four tier rows, and the
   * two completion controls.
   * @param {string} id - the task id.
   * @param {number} i - the block's position in the sorted stack.
   * @param {number} n - how many blocks the stack holds.
   * @returns {Element} the task block.
   */
  function buildTaskBlock(id, i, n) {
    var task = findTask(id);
    var block = el("div", "task-block");
    block.style.setProperty("--glow", taskGlow(i, n));
    var top = el("div", "task-top");
    var cancelBtn = el("button", "btn", "cancel task");
    cancelBtn.addEventListener("click", function () {
      cancelTask(id);
    });
    top.appendChild(cancelBtn);
    block.appendChild(top);

    var textRow = el("div", "task-text-row");
    textRow.appendChild(el("span", "task-text", task.text));
    attachTextEdit(textRow, id);
    block.appendChild(textRow);

    var now = getNow();
    var further = isFurther(task.deadline, now);
    if (further) {
      block.classList.add("task-further");
    }
    var tiers = tierList(task);
    var live = liveTierIndex(tiers, now);
    if (timeEditId === id) {
      block.appendChild(buildTaskTimeEditor(id, now));
    } else {
      var tierWrap = el("div", "tier-rows");
      tiers.forEach(function (tier, i) {
        var cls = "tier tier-faint";
        if (i === live) {
          cls = "tier tier-live";
        }
        // a further task's clock time alone is ambiguous - which TU is it?
        var line = el("div", cls);
        line.appendChild(document.createTextNode("by " + hhmm(tier.at)));
        if (further) {
          line.appendChild(document.createTextNode(" "));
          line.appendChild(el("span", "day-tag",
            "(" + DAY_ABBR[tier.at.getDay()] + ")"));
        }
        line.appendChild(document.createTextNode(" for " + tier.pts + " pts"));
        tierWrap.appendChild(line);
      });
      attachTimeEdit(tierWrap, id);
      block.appendChild(tierWrap);
    }

    var actions = el("div", "task-actions");
    var nowBtn = el("button", "btn", "complete now");
    nowBtn.addEventListener("click", function () {
      completeNow(id);
    });
    actions.appendChild(nowBtn);
    block.appendChild(actions);

    var before = el("div", "before-row");
    before.appendChild(el("span", "before-label", "completed before:"));
    tiers.forEach(function (tier, i) {
      if (tier.at.getTime() >= now.getTime()) return;
      var b = el("button", "btn before-btn", hhmm(tier.at));
      b.addEventListener("click", function () {
        completeBefore(id, i);
      });
      before.appendChild(b);
    });
    block.appendChild(before);
    return block;
  }

  /**
   * Builds the ACTIVE TASKS section: a labelled card wrapping the task stack,
   * or the empty state with `[streak broke]`. The card is the only thing that
   * glows - the blocks inside keep their per-position border colour but have no
   * halo of their own.
   *
   * Sorting by deadline puts the further tasks at the end for free, so the
   * divider is simply the seam where the first of them starts. A stack that is
   * all further has no seam to draw, and neither does one with none.
   * @returns {Element} the section wrapper.
   */
  function buildTasks() {
    var section = buildSection("ACTIVE TASKS", "tasksCard", "sec-tasks");
    var wrap = el("div", "tasks");
    section.card.appendChild(wrap);
    if (!state.activeTasks.length) {
      wrap.appendChild(el("div", "empty-tasks", "(no active tasks)"));
      var brk = el("button", "btn streak-btn", "streak broke");
      brk.addEventListener("click", streakBroke);
      wrap.appendChild(brk);
      return section.wrap;
    }
    var now = getNow();
    var sorted = state.activeTasks.slice().sort(function (a, b) {
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    });
    var drawn = false;
    sorted.forEach(function (task, i) {
      if (!drawn && isFurther(task.deadline, now)) {
        drawn = true;
        if (i > 0) {
          wrap.appendChild(el("div", "task-divider"));
        }
      }
      wrap.appendChild(buildTaskBlock(task.id, i, sorted.length));
    });
    return section.wrap;
  }

  /**
   * Builds a section label + card pair, for SET / ACTIVATE / LINK.
   * @param {string} label - the section label, rendered in caps.
   * @param {string} cardId - the card's element id.
   * @param {string} modifier - the section's own class, which is where its
   *   `--glow` colour is set.
   * @returns {{wrap: Element, card: Element}} the wrapper and its card.
   */
  function buildSection(label, cardId, modifier) {
    var wrap = el("div", "fd-section " + modifier);
    wrap.appendChild(el("h2", "fd-label", label));
    var card = el("div", "card");
    card.id = cardId;
    wrap.appendChild(card);
    return { wrap: wrap, card: card };
  }

  /**
   * Builds the five SET time buttons: +30/+40/+50/+60 minutes each rounded up
   * to the next 10-minute mark, then the smallest whole hour strictly after
   * the fourth.
   * @param {Date} now - the reference moment.
   * @returns {string[]} five clock times, "HH:MM".
   */
  function timeButtonTimes(now) {
    var out = [];
    var last = null;
    [30, 40, 50, 60].forEach(function (m) {
      last = ceil10(addMinutes(now, m));
      out.push(hhmm(last));
    });
    var hour = new Date(last.getTime());
    hour.setMinutes(0, 0, 0);
    hour.setHours(hour.getHours() + 1);
    out.push(hhmm(hour));
    return out;
  }

  /**
   * Builds SET's dropdown options: 24 hours forward in 10-minute steps,
   * wrapping past midnight, starting 20 to 29 minutes out. Strictly increasing
   * in real time, so a past deadline is unreachable by construction.
   * @param {Date} now - the reference moment.
   * @returns {string[]} 144 clock times, "HH:MM".
   */
  function dropdownOptions(now) {
    var start = ceil10(addMinutes(now, 20));
    var out = [];
    var i;
    for (i = 0; i < 144; i++) {
      out.push(hhmm(addMinutes(start, i * 10)));
    }
    return out;
  }

  /**
   * Builds a full-day time control: a "by" caption, then a `<select>` of 00:00
   * through 23:50 in 10-minute steps, identical every time and unrelated to
   * `now`. Both ACTIVATE row types and both adders route through here, so the
   * caption reaches all four from this one place.
   * @param {string} value - the currently selected "HH:MM", or "".
   * @param {boolean} withPlaceholder - include a leading "--:--" option.
   * @param {Function} onChange - called with the new value.
   * @returns {Element} the caption and `<select>` in their wrapper.
   */
  function buildDayTimeSelect(value, withPlaceholder, onChange) {
    var wrap = el("div", "field-pair");
    wrap.appendChild(el("span", "field-label", "by"));
    var sel = el("select", "time-select");
    if (withPlaceholder) {
      var ph = el("option", "", "--:--");
      ph.value = "";
      sel.appendChild(ph);
    }
    var h;
    var m;
    for (h = 0; h < 24; h++) {
      for (m = 0; m < 60; m += 10) {
        var t = pad2(h) + ":" + pad2(m);
        var o = el("option", "", t);
        o.value = t;
        sel.appendChild(o);
      }
    }
    sel.value = value;
    sel.addEventListener("change", function () {
      onChange(sel.value);
    });
    wrap.appendChild(sel);
    return wrap;
  }

  /**
   * Builds an optional date control: an "on" caption, then a native date
   * picker bounded to today through one week out. The bounds only grey the
   * picker's own days out, so `dateInRange` re-checks at submit time.
   * @param {string} value - the currently held day key, or "".
   * @param {Date} now - the reference moment, for the bounds.
   * @param {Function} onChange - called with the new value.
   * @returns {Element} the caption and input in their wrapper.
   */
  function buildDateInput(value, now, onChange) {
    var wrap = el("div", "field-pair");
    wrap.appendChild(el("span", "field-label", "on"));
    var input = el("input", "date-input");
    input.type = "date";
    var bounds = dateBounds(now);
    input.min = bounds.min;
    input.max = bounds.max;
    input.value = value || "";
    input.addEventListener("change", function () {
      onChange(input.value);
    });
    wrap.appendChild(input);
    return wrap;
  }

  /**
   * Builds a WL/HL toggle pair. Tapping the lit one deselects it back to
   * unset; unset is neither being lit. 
   * @param {Function} getMode - returns the currently selected mode, or null.
   * @param {Function} onPick - called with the new mode (or null).
   * @returns {Element} the toggle row.
   */
  function buildModeToggles(getMode, onPick) {
    var row = el("div", "mode-row");
    ["WL", "HL"].forEach(function (m) {
      var b = el("button", "mode-btn", m);
      if (getMode() === m) {
        b.classList.add("on");
      }
      b.addEventListener("click", function () {
        var next = m;
        if (getMode() === m) {
          next = null;
        }
        onPick(next);
      });
      row.appendChild(b);
    });
    return row;
  }

  /**
   * Builds the SET box.
   * @returns {Element} the SET section.
   */
  function buildSet() {
    var section = buildSection("SET", "setCard", "sec-set");
    var card = section.card;
    var now = getNow();

    var textRow = el("div", "set-text-row");
    var input = buildTextArea("set-text", state.setDraft.text);
    input.id = "setText";
    input.placeholder = "task text";
    input.addEventListener("blur", function () {
      writeSetDraft("text", input.value);
    });
    textRow.appendChild(input);
    card.appendChild(textRow);

    // Resolved before the buttons are built: the dropdown's value is what
    // lights a time button, so a button is lit only while it agrees with the
    // dropdown, and nothing is lit when the dropdown holds some other time.
    var opts = dropdownOptions(now);
    // A draft time under the 20-minute floor silently lands on the first
    // available option, leaving text and WL/HL intact. The floor is measured
    // against today only, so a date being held exempts the draft time from it -
    // 07:00 is long past by 14:00, but 07:00 three days out plainly isn't.
    var chosen = opts[0];
    if (state.setDraft.time && opts.indexOf(state.setDraft.time) !== -1) {
      if (state.setDraft.date) {
        chosen = state.setDraft.time;
      } else {
        var lead = resolveClockTime(state.setDraft.time, now).getTime() -
          now.getTime();
        if (lead >= MIN_LEAD_MS) {
          chosen = state.setDraft.time;
        }
      }
    }

    var btnRow = el("div", "time-btns");
    btnRow.appendChild(el("span", "time-btns-label", "by"));
    timeButtonTimes(now).forEach(function (t) {
      var b = el("button", "time-btn", t);
      if (t === chosen) {
        b.classList.add("on");
      }
      b.addEventListener("click", function () {
        writeSetDraft("time", t);
        render();
      });
      btnRow.appendChild(b);
    });
    card.appendChild(btnRow);

    var selRow = el("div", "set-select-row");
    selRow.appendChild(el("span", "set-select-label", "or select"));
    var sel = el("select", "set-select");
    sel.id = "setSelect";
    opts.forEach(function (t) {
      var o = el("option", "", t);
      o.value = t;
      sel.appendChild(o);
    });
    sel.value = chosen;
    sel.addEventListener("change", function () {
      writeSetDraft("time", sel.value);
      render();
    });
    selRow.appendChild(sel);
    card.appendChild(selRow);

    // an independent control, not a modifier on the two above it: with no date
    // the time resolves to its next occurrence within 24h exactly as it always
    // has, and with one the two simply pair.
    card.appendChild(buildDateInput(state.setDraft.date, now, function (v) {
      writeSetDraft("date", v);
      render();
    }));

    card.appendChild(buildModeToggles(function () {
      return state.setDraft.mode;
    }, function (next) {
      writeSetDraft("mode", next);
      render();
    }));

    var submitRow = el("div", "set-submit-row");
    var clearBtn = el("button", "btn", "clear draft");
    clearBtn.addEventListener("click", clearSetDraft);
    submitRow.appendChild(clearBtn);
    var setBtn = el("button", "btn", "set task");
    setBtn.addEventListener("click", submitSet);
    submitRow.appendChild(setBtn);
    card.appendChild(submitRow);
    return section.wrap;
  }

  /**
   * Builds a row's hamburger button and its dropdown menu. The menu is built
   * lazily on tap and torn down by `closeAllMenus`. `Activate` and `Prefill
   * SET` duplicate the two swipes so the app is testable on desktop.
   * @param {string} kind - "dailies" or "others".
   * @param {string} id - the row id.
   * @param {Element} row - the row, for the inline text editor.
   * @returns {Element} the `.menu-anchor` wrapper.
   */
  function buildRowMenu(kind, id, row) {
    var wrap = el("div", "menu-anchor");
    var btn = el("button", "mini", "☰");
    btn.setAttribute("aria-label", "More options");
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (menuOpenBtn === btn) {
        closeAllMenus();
        return;
      }
      closeAllMenus();
      menuOpenBtn = btn;
      var menu = el("div", "item-menu");

      var act = el("button", "", "Activate");
      act.addEventListener("click", function () {
        closeAllMenus();
        activateRow(kind, id);
      });
      menu.appendChild(act);

      var pre = el("button", "", "Prefill SET");
      pre.addEventListener("click", function () {
        closeAllMenus();
        prefillFromRow(kind, id);
      });
      menu.appendChild(pre);

      if (kind === "others") {
        var clr = el("button", "", "Clear datetime");
        clr.addEventListener("click", function () {
          closeAllMenus();
          clearRowDatetime(id);
        });
        menu.appendChild(clr);
      }

      var edit = el("button", "", "Edit");
      edit.addEventListener("click", function () {
        closeAllMenus();
        var textEl = row.querySelector(".tpl-text");
        if (!textEl) return;
        inlineEdit(textEl, textEl.textContent, function (value) {
          var v = value.trim();
          if (v === "") {
            render();
            return;
          }
          editRow(kind, id, "text", v);
        });
      });
      menu.appendChild(edit);

      var del = el("button", "danger", "Delete");
      del.addEventListener("click", function () {
        closeAllMenus();
        deleteRow(kind, id);
      });
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
   * Builds one ACTIVATE row: its text, then the control row of time dropdown,
   * optional date picker, WL/HL toggles and hamburger. Swipe left activates it
   * outright, swipe right prefills SET. An `others` row on cooldown dims and
   * carries its remaining time inline, but stays fully editable - only
   * activation is blocked.
   * @param {string} kind - "dailies" or "others".
   * @param {string} id - the row id.
   * @returns {Element} the row.
   */
  function buildRow(kind, id) {
    var r = findRow(kind, id);
    var now = getNow();
    var row = el("div", "tpl-row");
    row.appendChild(el("div", "tpl-text", r.text));
    if (kind === "others") {
      var left = cooldownLeft(r, now);
      if (left > 0) {
        row.classList.add("row-oncooldown");
        row.appendChild(el("div", "row-oncooldown-note",
          "on cooldown - " + fmtLeft(left) + " left"));
      }
    }
    var controls = el("div", "tpl-controls");
    controls.appendChild(buildDayTimeSelect(r.time || "", true, function (v) {
      editRow(kind, id, "time", v);
    }));
    if (kind === "others") {
      controls.appendChild(buildDateInput(r.date || "", now, function (v) {
        editRow(kind, id, "date", v);
      }));
    }
    controls.appendChild(buildModeToggles(function () {
      var live = findRow(kind, id);
      if (!live) return null;
      return live.mode;
    }, function (next) {
      editRow(kind, id, "mode", next);
    }));
    controls.appendChild(buildRowMenu(kind, id, row));
    row.appendChild(controls);
    swipeCore(row, function (dir) {
      if (dir === "left") {
        activateRow(kind, id);
      } else {
        prefillFromRow(kind, id);
      }
    });
    return row;
  }

  /**
   * Builds a section's pinned adder, mirroring that section's row shape.
   * @param {string} kind - "dailies" or "others".
   * @returns {Element} the adder.
   */
  function buildAdder(kind) {
    var draft = adderDrafts[kind];
    var now = getNow();
    var wrap = el("div", "tpl-adder");
    var input = buildTextArea("tpl-adder-text", draft.text);
    input.placeholder = "Add other...";
    if (kind === "dailies") {
      input.placeholder = "Add daily...";
    }
    var controls = el("div", "tpl-controls");
    var sel = buildDayTimeSelect(draft.time, true, function (v) {
      draft.time = v;
      refresh();
    });
    var modes = el("div", "mode-row");
    var addBtn = el("button", "btn", "add");
    /**
     * Greys `[add]` unless the adder holds what its section demands: text
     * alone for `others`, text and a time together for dailies.
     */
    function refresh() {
      var ok = draft.text.trim() !== "";
      if (kind === "dailies" && draft.time === "") {
        ok = false;
      }
      addBtn.disabled = !ok;
    }
    ["WL", "HL"].forEach(function (m) {
      var b = el("button", "mode-btn", m);
      if (draft.mode === m) {
        b.classList.add("on");
      }
      b.addEventListener("click", function () {
        var next = m;
        if (draft.mode === m) {
          next = null;
        }
        draft.mode = next;
        modes.querySelectorAll(".mode-btn").forEach(function (x) {
          x.classList.toggle("on", x.textContent === draft.mode);
        });
      });
      modes.appendChild(b);
    });
    input.addEventListener("input", function () {
      draft.text = input.value;
      refresh();
    });
    addBtn.addEventListener("click", function () {
      addRow(kind);
    });
    refresh();
    controls.appendChild(sel);
    if (kind === "others") {
      controls.appendChild(buildDateInput(draft.date, now, function (v) {
        draft.date = v;
      }));
    }
    controls.appendChild(modes);
    controls.appendChild(addBtn);
    wrap.appendChild(input);
    wrap.appendChild(controls);
    return wrap;
  }

  /**
   * Builds the ACTIVATE (dailies) box: disposable presets, ordered purely by
   * clock time, plus the pinned adder.
   * @returns {Element} the section.
   */
  function buildDailies() {
    var section = buildSection("ACTIVATE (dailies)", "dailiesCard",
      "sec-dailies");
    var list = el("div", "tpl-list");
    sortedDailies().forEach(function (r) {
      list.appendChild(buildRow("dailies", r.id));
    });
    section.card.appendChild(list);
    section.card.appendChild(buildAdder("dailies"));
    return section.wrap;
  }

  /**
   * Builds the ACTIVATE (others) box: persistent records, most recently
   * completed first, plus the pinned adder.
   * @returns {Element} the section.
   */
  function buildOthers() {
    var section = buildSection("ACTIVATE (others)", "othersCard",
      "sec-others");
    var list = el("div", "tpl-list");
    sortedOthers().forEach(function (r) {
      list.appendChild(buildRow("others", r.id));
    });
    section.card.appendChild(list);
    section.card.appendChild(buildAdder("others"));
    return section.wrap;
  }

  // --------------------------------- render ----------------------------------
  var appEl = document.getElementById("app");

  /**
   * Rebuilds the entire #app DOM tree from the current in-memory state, in
   * page order: ledger, scores, active tasks, ACTIVATE (dailies), ACTIVATE
   * (others), SET.
   */
  function render() {
    closeAllMenus();
    document.querySelectorAll(".hs-scrim, .hs-panel").forEach(function (n) {
      n.remove();
    });
    appEl.innerHTML = "";
    appEl.appendChild(buildLedger());
    appEl.appendChild(buildScores());
    appEl.appendChild(buildTasks());
    appEl.appendChild(buildDailies());
    appEl.appendChild(buildOthers());
    appEl.appendChild(buildSet());
    var list = appEl.querySelector(".ledger-list");
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
    if (scoresOpen) {
      openScoresPanel();
    }
    // scrollHeight only reads true once the element is in the document, so
    // every textarea is sized after the tree is built rather than on creation
    appEl.querySelectorAll("textarea").forEach(autoGrow);
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
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("show");
    }, 2200);
  }

  // ----------------------------------- boot ----------------------------------
  var undoBtn = document.getElementById("undoBtn");
  var redoBtn = document.getElementById("redoBtn");

  /**
   * Greys out whichever of the two pill buttons has nothing left to do.
   */
  function refreshUndoRedoButtons() {
    if (!undoBtn) return;
    undoBtn.disabled = undoPointer <= undoOldest;
    redoBtn.disabled = undoPointer >= undoNewest;
  }

  /**
   * Wraps a pill handler in the shared 500ms cooldown: a tap on either button
   * greys both out and swallows further taps, since rapid alternating taps are
   * the same footgun as rapid same-button taps.
   * @param {Function} fn - the handler to wrap.
   * @returns {Function} the wrapped handler.
   */
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

  document.addEventListener("click", function (e) {
    if (!e.target.closest(".menu-anchor")) {
      closeAllMenus();
    }
    if (!e.target.closest(".task-text-row")
      && !e.target.closest(".tier-rows")) {
      closeEditOverlays();
    }
    if (timeEditId && !e.target.closest(".task-time-edit")) {
      timeEditId = null;
      render();
    }
  });

  document.addEventListener("visibilitychange", function () {
    flushDrafts();
    if (document.hidden) {
      return;
    }
    render();
    refreshUndoRedoButtons();
  });

  loadUndoRing();
  render();
  refreshUndoRedoButtons();
})();
