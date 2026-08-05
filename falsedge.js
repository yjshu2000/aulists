(function () {
  "use strict";

  var STORAGE_KEY = "falsedge.data";
  var AULISTS_STORAGE_KEY = "aulists.listdata";
  var UNDO_SESSION_KEY = "falsedge.undo";
  var UNDO_CAP = 60;
  var EXPORT_LIMIT = 2000;
  var COPY_WINDOW_MS = 10 * 60 * 1000;
  var MIN_LEAD_MS = 20 * 60 * 1000;
  var DAY_MS = 24 * 60 * 60 * 1000;
  var TIER_POINTS = [6, 3, 2, 1];
  var WL_OFFSETS = [0, 10, 30, 60];
  var HL_OFFSETS = [0, 5, 15, 30];

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
  var undoStack = [];
  var redoStack = [];

  // view-only state: deliberately not in `state`, so it never reaches undo
  // and never survives an actual page load.
  var spendOpen = false;
  var scoresOpen = false;
  // the ACTIVATE adder is not draft-backed in storage, but it does have to
  // survive a re-render triggered from elsewhere on the page.
  var adderDraft = { text: "", time: "", mode: null };

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
      rotationDate: null,
      setDraft: { text: "", time: null, mode: null, linkedItemId: null },
      spendDraft: { text: "", cost: null },
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
    if (typeof raw.rotationDate === "string") {
      s.rotationDate = raw.rotationDate;
    }
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
      if (typeof raw.setDraft.linkedItemId === "string") {
        s.setDraft.linkedItemId = raw.setDraft.linkedItemId;
      }
    }
    if (raw.spendDraft && typeof raw.spendDraft === "object") {
      if (typeof raw.spendDraft.text === "string") {
        s.spendDraft.text = raw.spendDraft.text;
      }
      if (typeof raw.spendDraft.cost === "number") {
        s.spendDraft.cost = raw.spendDraft.cost;
      }
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
   * Persists Falsedge's in-memory state to its own localStorage key.
   */
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  // ----------------------------- Aulists interop -----------------------------
  /**
   * Reads and validates Aulists' whole storage blob.
   * @returns {Object|null} the parsed blob, or null if it's missing or
   *   unusable.
   */
  function readAulists() {
    try {
      var raw = localStorage.getItem(AULISTS_STORAGE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return null;
      if (!obj.itemsById || typeof obj.itemsById !== "object") return null;
      if (!obj.lists || !Array.isArray(obj.lists["0"])) return null;
      return obj;
    } catch (e) {
      return null;
    }
  }

  /**
   * Writes a mutated Aulists blob back to Aulists' own storage key.
   * @param {Object} blob - the blob to persist.
   */
  function writeAulists(blob) {
    try {
      localStorage.setItem(AULISTS_STORAGE_KEY, JSON.stringify(blob));
    } catch (e) {}
  }

  /**
   * Reads Aulists' List 0 directly out of its own localStorage blob, for
   * the LINK box to list as linkable items. Called fresh on every render, so
   * the LINK list is never stale.
   * @returns {{id: string, text: string}[]} List 0's items, in list order.
   */
  function readAulistsListZero() {
    var blob = readAulists();
    if (!blob) return [];
    var out = [];
    blob.lists["0"].forEach(function (id) {
      var item = blob.itemsById[id];
      if (item && typeof item.text === "string") {
        out.push({ id: id, text: item.text });
      }
    });
    return out;
  }

  /**
   * Renames a linked Aulists item, read-mutate-write. Silently does nothing
   * if the item has since been deleted.
   * @param {string} id - the Aulists item id.
   * @param {string} text - the new text.
   */
  function aulistsSetText(id, text) {
    var blob = readAulists();
    if (!blob) return;
    var item = blob.itemsById[id];
    if (!item) return;
    item.text = text;
    writeAulists(blob);
  }

  /**
   * Completes a linked Aulists item the same way Aulists' own `completeItem`
   * does: marks it done, stamps `lastDone`, and unlinks it from List 0. If the
   * id has drifted out of List 0 it's left in whatever list it moved to.
   * @param {string} id - the Aulists item id.
   * @param {string} iso - the effective completion time, ISO string.
   */
  function aulistsComplete(id, iso) {
    var blob = readAulists();
    if (!blob) return;
    var item = blob.itemsById[id];
    if (!item) return;
    item.isDone = true;
    item.lastDone = iso;
    var at = blob.lists["0"].indexOf(id);
    if (at !== -1) {
      blob.lists["0"].splice(at, 1);
    }
    writeAulists(blob);
  }

  /**
   * Snapshots the Aulists-side fields an undo entry has to restore, since
   * Falsedge's own state snapshot doesn't cover Aulists' storage.
   * @param {string} type - "text" or "complete".
   * @param {string} id - the Aulists item id.
   * @returns {Object|null} the side snapshot, or null if the item is gone.
   */
  function captureAulistsSide(type, id) {
    var blob = readAulists();
    if (!blob) return null;
    var item = blob.itemsById[id];
    if (!item) return null;
    if (type === "text") {
      return { type: "text", id: id, text: item.text };
    }
    return {
      type: "complete",
      id: id,
      isDone: !!item.isDone,
      lastDone: item.lastDone || null,
      indexInList0: blob.lists["0"].indexOf(id)
    };
  }

  /**
   * Restores a side snapshot onto Aulists' storage. Best-effort: a deleted
   * item is skipped silently, and a recorded index past the end of List 0
   * appends instead.
   * @param {Object|null} side - the side snapshot to apply.
   */
  function applyAulistsSide(side) {
    if (!side) return;
    var blob = readAulists();
    if (!blob) return;
    var item = blob.itemsById[side.id];
    if (!item) return;
    if (side.type === "text") {
      item.text = side.text;
    } else {
      item.isDone = side.isDone;
      item.lastDone = side.lastDone;
      var list = blob.lists["0"];
      var at = list.indexOf(side.id);
      if (side.indexInList0 === -1) {
        if (at !== -1) {
          list.splice(at, 1);
        }
      } else if (at === -1) {
        list.splice(Math.min(side.indexInList0, list.length), 0, side.id);
      }
    }
    writeAulists(blob);
  }

  // ---------------------------------- undo -----------------------------------
  /**
   * Deep-clones the whole state object for the undo/redo stacks.
   * @returns {Object} a detached copy of `state`.
   */
  function snapshotState() {
    return JSON.parse(JSON.stringify(state));
  }

  /**
   * Records the pre-mutation state (and, for linked writes, the pre-mutation
   * Aulists fields) on the undo stack. Must be called before the mutation.
   * @param {string} label - the label the toast renders after "Undid: ".
   * @param {Object} [side] - an Aulists side snapshot, if the action also
   *   writes into Aulists' storage.
   */
  function pushUndo(label, side) {
    undoStack.push({
      snapshot: snapshotState(),
      label: label,
      side: side || null
    });
    if (undoStack.length > UNDO_CAP) {
      undoStack.shift();
    }
    redoStack = [];
    refreshUndoRedoButtons();
  }

  /**
   * Moves one step along the undo/redo stacks, swapping the current state onto
   * the opposite stack on the way. Aulists side snapshots ride along
   * symmetrically: the entry pushed onto the opposite stack captures Aulists'
   * current (post-write) values before the recorded ones are restored.
   * @param {string} direction - "undo" or "redo".
   */
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
    var entry = from.pop();
    var counter = null;
    if (entry.side) {
      counter = captureAulistsSide(entry.side.type, entry.side.id);
    }
    to.push({
      snapshot: snapshotState(),
      label: entry.label,
      side: counter
    });
    applyAulistsSide(entry.side);
    state = entry.snapshot;
    save();
    render();
    refreshUndoRedoButtons();
    toast(prefix + entry.label);
  }

  /**
   * Persists both stacks so they survive navigating to Aulists and back.
   * sessionStorage, not localStorage: the stacks should outlive a navigation
   * but not the app being closed. Written only on the way out, so an action
   * never pays the cost of serialising 60 whole-state snapshots.
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

  /**
   * Steps one entry backwards.
   */
  function undo() {
    step("undo");
  }

  /**
   * Steps one entry forwards.
   */
  function redo() {
    step("redo");
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
   * Finds a template by id.
   * @param {string} id - the template id.
   * @returns {Object|undefined} the template, if it still exists.
   */
  function findTemplate(id) {
    return state.templates.find(function (t) {
      return t.id === id;
    });
  }

  /**
   * Finds a template's index in `state.templates`.
   * @param {string} id - the template id.
   * @returns {number} the index, or -1.
   */
  function indexOfTemplate(id) {
    var i;
    for (i = 0; i < state.templates.length; i++) {
      if (state.templates[i].id === id) return i;
    }
    return -1;
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
   * at exactly a tier's time still awards that tier.
   * @param {{at: Date}[]} tiers - the task's tiers.
   * @param {Date} now - the moment to resolve against.
   * @returns {number} the tier's index, or -1 once every tier has passed.
   */
  function liveTierIndex(tiers, now) {
    var i;
    for (i = 0; i < tiers.length; i++) {
      if (tiers[i].at.getTime() >= now.getTime()) return i;
    }
    return -1;
  }

  /**
   * Returns the templates in display order: by lap, then by clock time.
   * Creation order breaks remaining ties for free, since `sort` is stable.
   * @returns {Object[]} a sorted shallow copy of `state.templates`.
   */
  function sortedTemplates() {
    return state.templates.slice().sort(function (a, b) {
      var la = a.lap || 0;
      var lb = b.lap || 0;
      if (la !== lb) return la - lb;
      if (a.time < b.time) return -1;
      if (a.time > b.time) return 1;
      return 0;
    });
  }

  /**
   * Resets every template's lap counter when the day has changed since the
   * last render. Evaluated on render rather than at midnight, since Falsedge
   * has no timers. Deliberately pushes no undo entry - it fires on passive
   * re-renders, where an undo entry would be poison.
   */
  function applyLapReset() {
    var key = dayKey(getNow());
    if (state.rotationDate === key) return;
    state.rotationDate = key;
    state.templates.forEach(function (t) {
      t.lap = 0;
    });
    save();
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
   * Pre-renders a spend's ledger entry: the text and the `pts` line only,
   * since nothing else moved.
   * @param {string} text - what the points were spent on.
   * @param {number} cost - points spent.
   * @param {number} oldPts - `pts` before the spend.
   * @returns {string} the finished entry.
   */
  function spendEntryText(text, cost, oldPts) {
    return text + "\npts = " + fmtPts(oldPts) + " - " + cost +
      " = " + fmtPts(oldPts - cost);
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
        next = next + "\n\n";
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
   * Subtracts a cost from `pts`, leaves `scr` alone, and appends a spend entry
   * to the ledger. `pts` is allowed to go negative.
   * @param {string} rawText - what the points were spent on.
   * @param {*} rawCost - the raw cost input value.
   */
  function doSpend(rawText, rawCost) {
    var text = rawText.trim();
    if (!text) return;
    if (!positiveInt(rawCost)) return;
    var cost = parseInt(String(rawCost).trim(), 10);
    pushUndo("spend");
    state.ledger.push(spendEntryText(text, cost, state.pts));
    state.pts = state.pts - cost;
    state.spendDraft = { text: "", cost: null };
    save();
    render();
  }

  /**
   * Writes one field of the SET draft, pushing undo only when the value
   * actually changed - tapping into a field and back out shouldn't burn an
   * undo slot.
   * @param {string} field - "text", "time", "mode" or "linkedItemId".
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
   * @param {string} field - "text" or "cost".
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
   * from `activeTasks` and, for a linked task, propagates the completion into
   * Aulists' storage.
   * @param {string} id - the task id.
   * @param {Date} when - the effective completion time.
   * @param {number} award - points awarded (0 for failed and cancelled).
   * @param {string} byText - what the "completed by:" line reads.
   * @param {boolean} writeBack - whether to write into Aulists' storage.
   * @param {string} label - the undo label.
   */
  function resolveTask(id, when, award, byText, writeBack, label) {
    var task = findTask(id);
    if (!task) return;
    var linkId = task.linkedItemId;
    var side = null;
    if (writeBack && linkId) {
      side = captureAulistsSide("complete", linkId);
    }
    pushUndo(label, side);
    var oldPts = state.pts;
    var oldScr = state.scr;
    var newScr = oldScr + award;
    var delta = Math.floor(newScr) - Math.floor(oldScr);
    state.ledger.push(
      taskEntryText(task, byText, oldPts, delta, oldScr, award));
    state.scr = newScr;
    state.pts = oldPts + delta;
    var at = indexOfTask(id);
    if (at !== -1) {
      state.activeTasks.splice(at, 1);
    }
    if (writeBack && linkId) {
      aulistsComplete(linkId, when.toISOString());
    }
    save();
    render();
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
      award = tiers[idx].pts;
      byText = hhmm(now);
    }
    resolveTask(id, now, award, byText, true, "complete now");
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
    resolveTask(id, tier.at, tier.pts, hhmm(tier.at), true,
      "completed before");
  }

  /**
   * Cancels a task: no points, a "none (cancelled)" ledger entry, and nothing
   * written back to Aulists - a cancelled linked item stays in List 0.
   * @param {string} id - the task id.
   */
  function cancelTask(id) {
    resolveTask(id, getNow(), 0, "none (cancelled)", false, "cancel task");
  }

  /**
   * Renames an active task, propagating the rename into Aulists' storage if
   * the task is linked. An empty value cancels rather than saving an empty
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
    var side = null;
    if (task.linkedItemId) {
      side = captureAulistsSide("text", task.linkedItemId);
    }
    pushUndo("edit task text", side);
    task.text = v;
    if (task.linkedItemId) {
      aulistsSetText(task.linkedItemId, v);
    }
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
    var deadline = resolveClockTime(selectEl.value, now);
    if (deadline.getTime() - now.getTime() < MIN_LEAD_MS) {
      toast("refreshed");
      render();
      return;
    }
    var clash = state.activeTasks.some(function (t) {
      return new Date(t.deadline).getTime() === deadline.getTime();
    });
    if (clash) {
      toast(hhmm(deadline) + " overlaps");
      return;
    }
    var stale = state.activeTasks.some(function (t) {
      return now.getTime() - new Date(t.deadline).getTime() > DAY_MS;
    });
    if (stale) {
      toast("clean up old tasks");
      return;
    }
    var linkId = state.setDraft.linkedItemId;
    var side = null;
    if (linkId) {
      side = captureAulistsSide("text", linkId);
    }
    pushUndo("set task", side);
    state.activeTasks.push({
      id: uid(),
      text: text,
      deadline: deadline.toISOString(),
      mode: mode,
      linkedItemId: linkId
    });
    if (linkId) {
      aulistsSetText(linkId, text);
    }
    state.setDraft = { text: "", time: null, mode: null, linkedItemId: null };
    save();
    render();
  }

  // ---------------------------- template lifecycle ---------------------------
  /**
   * Adds a template from the pinned adder's current contents.
   */
  function addTemplate() {
    var text = adderDraft.text.trim();
    if (!text) return;
    if (!adderDraft.time) return;
    pushUndo("add template");
    state.templates.push({
      id: uid(),
      text: text,
      time: adderDraft.time,
      mode: adderDraft.mode,
      lap: 0
    });
    adderDraft = { text: "", time: "", mode: null };
    save();
    render();
  }

  /**
   * Writes one field of a template.
   * @param {string} id - the template id.
   * @param {string} field - "text", "time" or "mode".
   * @param {*} value - the new value.
   */
  function editTemplate(id, field, value) {
    var t = findTemplate(id);
    if (!t) return;
    if (t[field] === value) return;
    pushUndo("edit template");
    t[field] = value;
    save();
    render();
  }

  /**
   * Deletes a template.
   * @param {string} id - the template id.
   */
  function deleteTemplate(id) {
    var at = indexOfTemplate(id);
    if (at === -1) return;
    pushUndo("delete template");
    state.templates.splice(at, 1);
    save();
    render();
  }

  /**
   * Bumps a template's lap counter, sending it to the bottom of the list. On a
   * row that's already last this changes nothing visible.
   * @param {string} id - the template id.
   */
  function skipTemplate(id) {
    var t = findTemplate(id);
    if (!t) return;
    pushUndo("skip template");
    t.lap = (t.lap || 0) + 1;
    save();
    render();
  }

  /**
   * Prefills SET from a template. The prefill overwrites the draft's text
   * outright, so it also clears any link the draft was carrying.
   * @param {string} id - the template id.
   */
  function prefillFromTemplate(id) {
    var t = findTemplate(id);
    if (!t) return;
    pushUndo("edit SET draft");
    state.setDraft.text = t.text;
    state.setDraft.linkedItemId = null;
    state.setDraft.time = t.time;
    if (t.mode === "WL" || t.mode === "HL") {
      state.setDraft.mode = t.mode;
    }
    save();
    render();
    scrollToSet();
    toast("prefilled SET");
  }

  /**
   * Prefills SET from an Aulists List 0 item, carrying the link. The time is
   * left alone.
   * @param {string} id - the Aulists item id.
   * @param {string} text - the item's text.
   */
  function linkItem(id, text) {
    pushUndo("edit SET draft");
    state.setDraft.text = text;
    state.setDraft.linkedItemId = id;
    save();
    render();
    scrollToSet();
    toast("prefilled SET");
  }

  /**
   * Scrolls the SET box into view. SET sits above both ACTIVATE and LINK, so
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
   * Swaps a piece of text for an inline input, wired to commit on Enter or
   * blur. The `committed` flag matters because Enter commits and then the
   * input blurs, which would otherwise commit a second time.
   * @param {Element} target - the element to replace.
   * @param {string} value - the input's starting value.
   * @param {Function} onCommit - called once with the input's raw value.
   */
  function inlineEdit(target, value, onCommit) {
    var input = el("input", "inline-edit");
    input.type = "text";
    input.maxLength = 1000;
    input.value = value;
    target.replaceWith(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    var committed = false;
    /**
     * Saves the edit exactly once.
     */
    function commit() {
      if (committed) return;
      committed = true;
      onCommit(input.value);
    }
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        commit();
      }
    });
    input.addEventListener("blur", commit);
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
    var text = el("input", "spend-text");
    text.type = "text";
    text.id = "spendText";
    text.maxLength = 1000;
    text.placeholder = "spent on";
    text.value = state.spendDraft.text;
    var cost = el("input", "spend-cost");
    cost.type = "number";
    cost.min = "1";
    cost.step = "1";
    cost.placeholder = "pts cost";
    if (state.spendDraft.cost !== null) {
      cost.value = state.spendDraft.cost;
    }
    var btn = el("button", "btn", "spend");
    /**
     * Greys `[spend]` unless the row holds text and a positive integer cost.
     */
    function refresh() {
      var ok = text.value.trim() !== "" && positiveInt(cost.value);
      btn.disabled = !ok;
    }
    text.addEventListener("input", refresh);
    cost.addEventListener("input", refresh);
    text.addEventListener("blur", function () {
      writeSpendDraft("text", text.value);
    });
    cost.addEventListener("change", function () {
      var v = null;
      if (positiveInt(cost.value)) {
        v = parseInt(cost.value.trim(), 10);
      }
      writeSpendDraft("cost", v);
    });
    btn.addEventListener("click", function () {
      doSpend(text.value, cost.value);
    });
    refresh();
    controls.appendChild(text);
    controls.appendChild(cost);
    controls.appendChild(btn);
    row.appendChild(controls);
    return row;
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
    if (task.linkedItemId) {
      textRow.appendChild(el("span", "task-link", "🔗"));
    }
    attachTextEdit(textRow, id);
    block.appendChild(textRow);

    var now = getNow();
    var tiers = tierList(task);
    var live = liveTierIndex(tiers, now);
    tiers.forEach(function (tier, i) {
      var cls = "tier tier-faint";
      if (i === live) {
        cls = "tier tier-live";
      }
      block.appendChild(el("div", cls,
        "by " + hhmm(tier.at) + " for " + tier.pts + " pts"));
    });

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
   * Builds the active-tasks region, or the empty state with `[streak broke]`.
   * @returns {Element} the tasks region.
   */
  function buildTasks() {
    var wrap = el("div", "tasks");
    if (!state.activeTasks.length) {
      wrap.appendChild(el("div", "empty-tasks", "(no active tasks)"));
      var brk = el("button", "btn streak-btn", "streak broke");
      brk.addEventListener("click", streakBroke);
      wrap.appendChild(brk);
      return wrap;
    }
    var sorted = state.activeTasks.slice().sort(function (a, b) {
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    });
    sorted.forEach(function (task, i) {
      wrap.appendChild(buildTaskBlock(task.id, i, sorted.length));
    });
    return wrap;
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
   * Builds a full-day time `<select>`: 00:00 through 23:50 in 10-minute steps,
   * identical every time and unrelated to `now`.
   * @param {string} value - the currently selected "HH:MM", or "".
   * @param {boolean} withPlaceholder - include a leading "--:--" option.
   * @param {Function} onChange - called with the new value.
   * @returns {Element} the `<select>`.
   */
  function buildDayTimeSelect(value, withPlaceholder, onChange) {
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
    return sel;
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
    var input = el("input", "set-text");
    input.type = "text";
    input.id = "setText";
    input.maxLength = 1000;
    input.placeholder = "task text";
    input.value = state.setDraft.text;
    input.addEventListener("blur", function () {
      writeSetDraft("text", input.value);
    });
    textRow.appendChild(input);
    if (state.setDraft.linkedItemId) {
      textRow.appendChild(el("span", "set-link", "🔗"));
    }
    card.appendChild(textRow);

    // Resolved before the buttons are built: the dropdown's value is what
    // lights a time button, so a button is lit only while it agrees with the
    // dropdown, and nothing is lit when the dropdown holds some other time.
    var opts = dropdownOptions(now);
    // A draft time under the 20-minute floor silently lands on the first
    // available option, leaving text and WL/HL intact.
    var chosen = opts[0];
    if (state.setDraft.time && opts.indexOf(state.setDraft.time) !== -1) {
      var lead = resolveClockTime(state.setDraft.time, now).getTime() -
        now.getTime();
      if (lead >= MIN_LEAD_MS) {
        chosen = state.setDraft.time;
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

    card.appendChild(buildModeToggles(function () {
      return state.setDraft.mode;
    }, function (next) {
      writeSetDraft("mode", next);
      render();
    }));

    var submitRow = el("div", "set-submit-row");
    var setBtn = el("button", "btn", "set task");
    setBtn.addEventListener("click", submitSet);
    submitRow.appendChild(setBtn);
    card.appendChild(submitRow);
    return section.wrap;
  }

  /**
   * Builds a template row's hamburger button and its dropdown menu. The menu
   * is built lazily on tap and torn down by `closeAllMenus`. `Activate` and
   * `Skip` duplicate the two swipes so the app is testable on desktop.
   * @param {string} id - the template id.
   * @param {Element} row - the template's row, for the inline text editor.
   * @returns {Element} the `.menu-anchor` wrapper.
   */
  function buildTemplateMenu(id, row) {
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
        prefillFromTemplate(id);
      });
      menu.appendChild(act);

      var skip = el("button", "", "Skip");
      skip.addEventListener("click", function () {
        closeAllMenus();
        skipTemplate(id);
      });
      menu.appendChild(skip);

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
          editTemplate(id, "text", v);
        });
      });
      menu.appendChild(edit);

      var del = el("button", "danger", "Delete");
      del.addEventListener("click", function () {
        closeAllMenus();
        deleteTemplate(id);
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
   * Builds one template row: its text, then the control row of time dropdown,
   * WL/HL toggles and hamburger. Swipe left prefills SET, swipe right skips.
   * @param {string} id - the template id.
   * @returns {Element} the row.
   */
  function buildTemplateRow(id) {
    var t = findTemplate(id);
    var row = el("div", "tpl-row");
    row.appendChild(el("div", "tpl-text", t.text));
    var controls = el("div", "tpl-controls");
    controls.appendChild(buildDayTimeSelect(t.time, false, function (v) {
      editTemplate(id, "time", v);
    }));
    controls.appendChild(buildModeToggles(function () {
      var live = findTemplate(id);
      if (!live) return null;
      return live.mode;
    }, function (next) {
      editTemplate(id, "mode", next);
    }));
    controls.appendChild(buildTemplateMenu(id, row));
    row.appendChild(controls);
    swipeCore(row, function (dir) {
      if (dir === "left") {
        prefillFromTemplate(id);
      } else {
        skipTemplate(id);
      }
    });
    return row;
  }

  /**
   * Builds the pinned template adder, mirroring the full row shape.
   * @returns {Element} the adder.
   */
  function buildTemplateAdder() {
    var wrap = el("div", "tpl-adder");
    var input = el("input", "tpl-adder-text");
    input.type = "text";
    input.maxLength = 1000;
    input.placeholder = "Add template...";
    input.value = adderDraft.text;
    var controls = el("div", "tpl-controls");
    var sel = buildDayTimeSelect(adderDraft.time, true, function (v) {
      adderDraft.time = v;
      refresh();
    });
    var modes = el("div", "mode-row");
    var addBtn = el("button", "btn", "add");
    /**
     * Greys `[add]` unless the adder holds both a time and non-empty text.
     */
    function refresh() {
      var ok = adderDraft.text.trim() !== "" && adderDraft.time !== "";
      addBtn.disabled = !ok;
    }
    ["WL", "HL"].forEach(function (m) {
      var b = el("button", "mode-btn", m);
      if (adderDraft.mode === m) {
        b.classList.add("on");
      }
      b.addEventListener("click", function () {
        var next = m;
        if (adderDraft.mode === m) {
          next = null;
        }
        adderDraft.mode = next;
        modes.querySelectorAll(".mode-btn").forEach(function (x) {
          x.classList.toggle("on", x.textContent === adderDraft.mode);
        });
      });
      modes.appendChild(b);
    });
    input.addEventListener("input", function () {
      adderDraft.text = input.value;
      refresh();
    });
    addBtn.addEventListener("click", addTemplate);
    refresh();
    controls.appendChild(sel);
    controls.appendChild(modes);
    controls.appendChild(addBtn);
    wrap.appendChild(input);
    wrap.appendChild(controls);
    return wrap;
  }

  /**
   * Builds the ACTIVATE box: the scrolling template list plus the pinned
   * adder.
   * @returns {Element} the ACTIVATE section.
   */
  function buildActivate() {
    var section = buildSection("ACTIVATE", "activateCard", "sec-activate");
    var list = el("div", "tpl-list");
    sortedTemplates().forEach(function (t) {
      list.appendChild(buildTemplateRow(t.id));
    });
    section.card.appendChild(list);
    section.card.appendChild(buildTemplateAdder());
    return section.wrap;
  }

  /**
   * Builds the LINK box from Aulists' List 0, re-read fresh on every render.
   * A row's wash is driven purely by where its id currently is: green while
   * it's in the SET draft, yellow while an active task holds it.
   * @returns {Element} the LINK section.
   */
  function buildLink() {
    var section = buildSection("LINK", "linkCard", "sec-link");
    var items = readAulistsListZero();
    if (!items.length) {
      section.card.appendChild(el("div", "link-empty", "(no linkables)"));
      return section.wrap;
    }
    var list = el("div", "link-list");
    items.forEach(function (item) {
      var row = el("div", "link-row");
      row.appendChild(el("div", "link-text", item.text));
      var taken = state.activeTasks.some(function (t) {
        return t.linkedItemId === item.id;
      });
      var btn = el("button", "btn", "Link");
      if (taken) {
        row.classList.add("link-yellow");
        btn.disabled = true;
      } else if (state.setDraft.linkedItemId === item.id) {
        row.classList.add("link-green");
      }
      btn.addEventListener("click", function () {
        linkItem(item.id, item.text);
      });
      row.appendChild(btn);
      list.appendChild(row);
    });
    section.card.appendChild(list);
    return section.wrap;
  }

  // --------------------------------- render ----------------------------------
  var appEl = document.getElementById("app");

  /**
   * Rebuilds the entire #app DOM tree from the current in-memory state, in
   * page order: ledger, scores, active tasks, SET, ACTIVATE, LINK.
   */
  function render() {
    applyLapReset();
    closeAllMenus();
    document.querySelectorAll(".hs-scrim, .hs-panel").forEach(function (n) {
      n.remove();
    });
    appEl.innerHTML = "";
    appEl.appendChild(buildLedger());
    appEl.appendChild(buildScores());
    appEl.appendChild(buildTasks());
    appEl.appendChild(buildSet());
    appEl.appendChild(buildActivate());
    appEl.appendChild(buildLink());
    var list = appEl.querySelector(".ledger-list");
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
    if (scoresOpen) {
      openScoresPanel();
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
    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;
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

  document.getElementById("refreshBtn").addEventListener("click", function () {
    location.reload();
  });

  document.addEventListener("click", function (e) {
    if (!e.target.closest(".menu-anchor")) {
      closeAllMenus();
    }
    if (!e.target.closest(".task-text-row")) {
      closeEditOverlays();
    }
  });

  document.addEventListener("visibilitychange", function () {
    flushDrafts();
    if (document.hidden) {
      saveUndoStacks();
      return;
    }
    render();
    refreshUndoRedoButtons();
  });

  // pagehide is the one that fires on an actual navigation to Aulists
  window.addEventListener("pagehide", saveUndoStacks);

  loadUndoStacks();
  render();
  refreshUndoRedoButtons();
})();
