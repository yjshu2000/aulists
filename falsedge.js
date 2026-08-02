(function () {
  "use strict";

  var STORAGE_KEY = "falsedge.data";
  var AULISTS_STORAGE_KEY = "aulists.listdata";

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
    if (direction === "undo") {
      from = undoStack;
      to = redoStack;
    } else {
      from = redoStack;
      to = undoStack;
    }
    if (!from.length) return;
    var top = from[from.length - 1];
    if (top.isBoundary &&
      !(pendingBoundary &&
        pendingBoundary.direction === direction)) {
      pendingBoundary = { direction: direction };
      return;
    }
    pendingBoundary = null;
    var entry = from.pop();
    to.push({
      snapshot: snapshotState(),
      label: entry.label,
      isBoundary: entry.isBoundary
    });
    state = entry.snapshot;
    save();
    render();
    refreshUndoRedoButtons();
  }

  function undo() { step("undo"); }
  function redo() { step("redo"); }

  /**
   * Builds a brand-new, empty state object - the baseline used on first run.
   * Fields get filled in as Phase 3 defines Falsedge's actual feature set
   * (ledger entries, active task, points/score, recurring templates).
   * @returns {Object} an empty-but-well-formed state object.
   */
  function freshState() {
    return {
      version: 1,
      ledger: []
    };
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
      var obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return freshState();
      return obj;
    } catch (e) { return freshState(); }
  }

  /**
   * Persists Falsedge's in-memory state to its own localStorage key.
   */
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) {}
  }

  /**
   * Reads Aulists' List 0 directly out of its own localStorage blob, for
   * the LINK box to list as linkable items.
   * @returns {{id: string, text: string}[]} List 0's items, in list order.
   */
  function readAulistsListZero() {
    try {
      var raw = localStorage.getItem(AULISTS_STORAGE_KEY);
      if (!raw) return [];
      var obj = JSON.parse(raw);
      if (!obj || !obj.lists || !Array.isArray(obj.lists["0"])
        || !obj.itemsById) {
        return [];
      }
      var out = [];
      obj.lists["0"].forEach(function (id) {
        var item = obj.itemsById[id];
        if (item && typeof item.text === "string") {
          out.push({ id: id, text: item.text });
        }
      });
      return out;
    } catch (e) {
      return [];
    }
  }

  var appEl = document.getElementById("app");

  /**
   * Rebuilds the entire #app DOM tree from the current in-memory state.
   * Placeholder until Phase 3 builds the real Ledger / Current pts+scr /
   * Active task / SET / ACTIVATE / LINK layout.
   */
  function render() {
    appEl.innerHTML = "";
    var placeholder = document.createElement("p");
    placeholder.textContent = "Falsedge - under construction.";
    appEl.appendChild(placeholder);
  }

  // undo/redo wiring - no visible pill yet, Phase 3 builds the real UI
  var undoBtn = document.getElementById("undoBtn");
  var redoBtn = document.getElementById("redoBtn");

  function refreshUndoRedoButtons() {
    if (!undoBtn) return;
    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;
  }

  render();
  refreshUndoRedoButtons();
})();
