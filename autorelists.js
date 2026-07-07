(function () {
  "use strict";

  var STORAGE_KEY = "fourlist.v1";
  var WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  // chain order for movement
  var CHAIN = ["0", "1", "2", "3", "3.5", "4"];

  var state = load();
  var selectToKeep = { active: false, selected: {} };
  var expandedNote = null;
  var editingNote = null;
  var randomizer = { active: false, target: null, winnerId: null, highlightId: null, done: false };
  var randomizerGen = 0;
  var todayCardOffset = 0; // 0 = today; negative = carousel test steps into the past
  var carouselAnimating = false;
  var CAROUSEL_PEEK = 20; // must match .today-nav width / left/right in style-minim.css
  var CAROUSEL_GAP = 8;   // must match .today-carousel-track gap in style-minim.css

  // TEMP debug override for "now", for testing date-dependent behaviour without waiting real days.
  // getNow() stays permanently. Comment out this block, #debugDatePanel in index.html, and its
  // wiring near the bottom of this file when not actively testing.
  var DEBUG_NOW_KEY = "aulists.debugNow";
  var debugNowOverride = null;
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
  function getNow() {
    if (debugNowOverride) {
      return new Date(debugNowOverride.getTime());
    }
    return new Date();
  }
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

  function freshState() {
    return {
      version: 1,
      items: { "0": [], "1": [], "2": [], "3": [], "3.5": [], "4": [], completed: [], trash: [] },
      collapsed: { "3": false, "4": true, completed: true, trash: true },
      schedule: { everyDays: 1, atMinutes: 0 },
      lastReturn: null,
      lastExported: null,
      lastExportedConfirmed: null
    };
  }

  function uid() {
    return "i" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return freshState();
      return normalise(JSON.parse(raw));
    } catch (e) { return freshState(); }
  }

  function cleanItems(arr) {
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(function (it) { return it && typeof it.text === "string"; })
      .map(function (it) {
        var o = { id: it.id || uid(), text: it.text };
        if (it.note) o.note = it.note;
        return o;
      });
  }

  function normalise(obj) {
    var s = freshState();
    if (obj && typeof obj === "object") {
      if (obj.items) {
        ["0","1","2","3","3.5","4","completed"].forEach(function (k) {
          s.items[k] = cleanItems(obj.items[k]);
        });
        if (Array.isArray(obj.items.trash)) {
          s.items.trash = obj.items.trash
            .filter(function (it) { return it && typeof it.text === "string"; })
            .map(function (it) {
              var origin = "3";
              if (CHAIN.indexOf(it.origin) !== -1 || it.origin === "completed") {
                origin = it.origin;
              }
              var deletedAt = getNow().toISOString();
              if (typeof it.deletedAt === "string") {
                deletedAt = it.deletedAt;
              }
              var o = {
                id: it.id || uid(),
                text: it.text,
                origin: origin,
                deletedAt: deletedAt
              };
              if (it.note) o.note = it.note;
              return o;
            });
        }
      }
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
        if (obj.collapsed.trash === undefined) {
          s.collapsed.trash = true;
        } else {
          s.collapsed.trash = !!obj.collapsed.trash;
        }
      }
      if (obj.schedule) {
        var ed = parseInt(obj.schedule.everyDays, 10);
        var am = parseInt(obj.schedule.atMinutes, 10);
        if (ed >= 1) s.schedule.everyDays = ed;
        if (am >= 0 && am < 1440) s.schedule.atMinutes = am;
      }
      if (typeof obj.lastReturn === "string") s.lastReturn = obj.lastReturn;
      if (typeof obj.lastExported === "string") s.lastExported = obj.lastExported;
      if (typeof obj.lastExportedConfirmed === "string") s.lastExportedConfirmed = obj.lastExportedConfirmed;
    }
    return s;
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { toast("Could not save to this browser's storage."); }
  }

  // ---------- schedule (compute on open) ----------
  function boundaryAt(date, atMin) {
    var b = new Date(date); b.setHours(0,0,0,0);
    b.setMinutes(atMin);
    return b;
  }

  function stepDays(date, days) {
    var d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

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

  function nextBoundaryAfter(now) {
    var days = state.schedule.everyDays;
    var last = lastBoundaryBefore(now);
    var next = last || boundaryAt(now, state.schedule.atMinutes);
    while (next.getTime() <= now.getTime()) {
      next = stepDays(next, days);
    }
    return next;
  }

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

    if (crossed && state.items["2"].length > 0) {
      state.items["1"] = state.items["1"].concat(state.items["2"]);
      state.items["2"] = [];
      state.lastReturn = boundary.toISOString();
      save();
      return true;
    }
    if (crossed) { state.lastReturn = boundary.toISOString(); save(); }
    return false;
  }

  // ---------- trash purge (compute on open) ----------
  function purgeTrash() {
    var now = getNow().getTime();
    var before = state.items.trash.length;
    state.items.trash = state.items.trash.filter(function (t) {
      return (now - new Date(t.deletedAt).getTime()) < WEEK_MS;
    });
    if (state.items.trash.length !== before) save();
  }

  // ---------- item operations ----------
  function findIn(listKey, id) {
    return state.items[listKey].findIndex(function (i) { return i.id === id; });
  }

  function moveChain(fromKey, id, dir) {
    var idx = CHAIN.indexOf(fromKey);
    if (idx === -1) return;
    var toKey = CHAIN[idx + dir];
    if (!toKey) return;
    var i = findIn(fromKey, id);
    if (i === -1) return;
    var moved = state.items[fromKey].splice(i, 1)[0];
    state.items[toKey].push(moved);
    save(); render();
  }

  function completeItem(fromKey, id) {
    var i = findIn(fromKey, id);
    if (i === -1) return;
    var moved = state.items[fromKey].splice(i, 1)[0];
    state.items.completed.push(moved);
    save(); render();
  }

  function uncompleteItem(id) {
    var i = findIn("completed", id);
    if (i === -1) return;
    var moved = state.items.completed.splice(i, 1)[0];
    state.items["2"].push(moved);   // one-way back to list 2
    save(); render();
  }

  function trashItem(fromKey, id) {
    var i = findIn(fromKey, id);
    if (i === -1) return;
    var moved = state.items[fromKey].splice(i, 1)[0];
    var trashed = {
      id: moved.id, text: moved.text,
      origin: fromKey, deletedAt: getNow().toISOString()
    };
    if (moved.note) trashed.note = moved.note;
    state.items.trash.push(trashed);
    save(); render();
  }

  function recoverItem(id) {
    var i = findIn("trash", id);
    if (i === -1) return;
    var t = state.items.trash.splice(i, 1)[0];
    var dest = "3";
    if (state.items[t.origin]) {
      dest = t.origin;
    }
    var recovered = { id: t.id, text: t.text };
    if (t.note) recovered.note = t.note;
    state.items[dest].push(recovered);
    save(); render();
  }

  function permaDelete(id) {
    var i = findIn("trash", id);
    if (i === -1) return;
    state.items.trash.splice(i, 1);
    save(); render();
  }

  function editItem(listKey, id, newText) {
    var i = findIn(listKey, id);
    if (i === -1) return;
    var v = newText.trim();
    if (v === "") return;            // empty = cancel, keep original
    state.items[listKey][i].text = v;
    save(); render();
  }

  function editNote(listKey, id, newNote) {
    var i = findIn(listKey, id);
    if (i === -1) return;
    var v = newNote.trim();
    if (v) {
      state.items[listKey][i].note = v;
      expandedNote = id;
    } else {
      delete state.items[listKey][i].note;
      expandedNote = null;
    }
    save(); render();
  }

  function startNoteEdit(key, item) {
    editingNote = { key: key, id: item.id };
    expandedNote = item.id;
    render();
  }

  // ---------- rendering ----------
  var appEl = document.getElementById("app");

  function render() {
    closeAllMenus();
    appEl.innerHTML = "";

    // Today carousel: a 3-slide track (prev/current/next) always centered on
    // the current slide, so neighbour cards peek in at the edges.
    var todayWrap = document.createElement("div");
    todayWrap.className = "today-carousel";

    var prevBtn = document.createElement("button");
    prevBtn.className = "today-nav today-nav-prev";
    prevBtn.textContent = "<";
    prevBtn.setAttribute("aria-label", "Previous day");
    prevBtn.addEventListener("click", function () {
      if (carouselAnimating) return;
      animateCarousel(-1);
    });
    todayWrap.appendChild(prevBtn);

    var viewport = document.createElement("div");
    viewport.className = "today-carousel-viewport";

    var track = document.createElement("div");
    track.className = "today-carousel-track";

    var prevSlide = buildCardForOffset(todayCardOffset - 1);
    prevSlide.classList.add("carousel-slide");
    track.appendChild(prevSlide);

    var currentSlide = buildCardForOffset(todayCardOffset);
    currentSlide.classList.add("carousel-slide");
    track.appendChild(currentSlide);

    var nextSlide;
    if (todayCardOffset < 0) {
      nextSlide = buildCardForOffset(todayCardOffset + 1);
      nextSlide.classList.add("carousel-slide");
    } else {
      nextSlide = document.createElement("div");
      nextSlide.className = "carousel-slide spacer";
    }
    track.appendChild(nextSlide);

    viewport.appendChild(track);
    todayWrap.appendChild(viewport);

    var nextBtn = document.createElement("button");
    nextBtn.className = "today-nav today-nav-next";
    nextBtn.textContent = ">";
    nextBtn.setAttribute("aria-label", "Next day");
    nextBtn.disabled = todayCardOffset === 0;
    nextBtn.addEventListener("click", function () {
      if (carouselAnimating || todayCardOffset === 0) return;
      animateCarousel(1);
    });
    todayWrap.appendChild(nextBtn);

    appEl.appendChild(todayWrap);
    track.style.transform = "translateX(" + (CAROUSEL_PEEK - carouselStepPx(viewport)) + "px)";

    var currentHeight = currentSlide.getBoundingClientRect().height;
    prevSlide.style.maxHeight = currentHeight + "px";
    prevSlide.style.overflow = "hidden";
    if (todayCardOffset < 0) {
      nextSlide.style.maxHeight = currentHeight + "px";
      nextSlide.style.overflow = "hidden";
    }

    // List 2 (own card, fixed)
    appEl.appendChild(renderCard("2", "List 2", { fixed: true, randomizerTarget: "2" }));

    // Completed purgatory (collapsible)
    appEl.appendChild(renderCard("completed", "Completed", { collapsible: true, kind: "completed" }));

    // List 3: collapsible card, two zones split by a divider.
    // Above the divider = backend "3" (closer to list 2), below = backend "3.5" (further, but not list 4 far).
    var collapsed3 = state.collapsed["3"];
    var list3 = document.createElement("section");
    var list3CollapsedClass = "";
    if (collapsed3) {
      list3CollapsedClass = " collapsed";
    }
    list3.className = "card list" + list3CollapsedClass;
    list3.appendChild(buildHead("3", "List 3", { collapsible: true, countKeys: ["3", "3.5"] }));

    var zone3Top = document.createElement("ul");
    zone3Top.className = "items";
    fillZone(zone3Top, "3");
    list3.appendChild(zone3Top);

    var div3 = document.createElement("div");
    div3.className = "divider";
    list3.appendChild(div3);

    var zone3Bot = document.createElement("ul");
    zone3Bot.className = "items";
    fillZone(zone3Bot, "3.5");
    list3.appendChild(zone3Bot);

    list3.appendChild(buildAdder("3.5"));
    appEl.appendChild(list3);

    // List 4
    appEl.appendChild(renderCard("4", "List 4", { collapsible: true }));

    // Trash (collapsible, no count)
    appEl.appendChild(renderCard("trash", "Trash", { collapsible: true, kind: "trash" }));

    updateNextNote();
  }

  // translate() percentages resolve against the track's own width, not the
  // viewport, so the per-slide step has to be computed from a real measurement.
  function carouselStepPx(viewportEl) {
    var cw = viewportEl.getBoundingClientRect().width;
    return (cw - 2 * CAROUSEL_PEEK) + CAROUSEL_GAP;
  }

  var CARD_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var CARD_DOWS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function formatCardDate(offset) {
    var d = getNow();
    d.setDate(d.getDate() + offset);
    var day = String(d.getDate());
    if (day.length < 2) day = "0" + day;
    return CARD_MONTHS[d.getMonth()] + " " + day + " " + CARD_DOWS[d.getDay()];
  }

  function buildCardForOffset(offset) {
    if (offset === 0) return buildTodayRealCard();
    return buildPlaceholderDayCard(offset);
  }

  function buildTodayRealCard() {
    var today = document.createElement("section");
    today.className = "card today-card list fixed";
    today.appendChild(buildHead("today", "Today | " + formatCardDate(0), { fixed: true, countKeys: ["0", "1"], selectToKeep: true, randomizerTarget: "today" }));

    var zoneTop = document.createElement("ul");
    zoneTop.className = "items";
    fillZone(zoneTop, "0", true);
    today.appendChild(zoneTop);

    var div = document.createElement("div");
    div.className = "divider";
    today.appendChild(div);

    var zoneBot = document.createElement("ul");
    zoneBot.className = "items";
    fillZone(zoneBot, "1", true);
    today.appendChild(zoneBot);

    if (!selectToKeep.active && !(randomizer.active && randomizer.target === "today")) today.appendChild(buildAdder("1"));

    return today;
  }

  // slides one step in the given direction, then swaps the underlying day and
  // snaps the track back to its resting (centered) transform with no transition.
  function animateCarousel(step) {
    var track = appEl.querySelector(".today-carousel-track");
    if (!track) return;
    var stepPx = carouselStepPx(track.parentElement);
    carouselAnimating = true;
    track.classList.add("anim");
    void track.offsetWidth;
    var targetPx;
    if (step < 0) {
      targetPx = CAROUSEL_PEEK;
    } else {
      targetPx = CAROUSEL_PEEK - 2 * stepPx;
    }
    track.style.transform = "translateX(" + targetPx + "px)";
    setTimeout(function () {
      todayCardOffset += step;
      carouselAnimating = false;
      render();
    }, 280);
  }

  // fill a zone (one of the two halves of a split card) with rows for a key.
  // scoped = true only for the Today card's zones, which support select-to-keep / randomizer.
  function fillZone(ul, key, scoped) {
    var arr = state.items[key];
    if (arr.length === 0) {
      var empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = "(empty)";
      ul.appendChild(empty);
      return;
    }
    arr.forEach(function (item) {
      if (scoped && randomizer.active && randomizer.target === "today") {
        ul.appendChild(buildRandomizerRow(item));
        return;
      }
      if (scoped && selectToKeep.active) {
        ul.appendChild(buildSelectRow(item));
      } else {
        ul.appendChild(buildMainRow(key, item));
      }
    });
  }

  // placeholder for carousel testing only: a bare, always-empty day card, no data behind it yet.
  function buildPlaceholderDayCard(offset) {
    var card = document.createElement("section");
    card.className = "card today-card list fixed";
    card.appendChild(buildHead("todayPlaceholder", formatCardDate(offset), { fixed: true, noCount: true }));

    for (var i = 0; i < 3; i++) {
      if (i > 0) {
        var div = document.createElement("div");
        div.className = "divider";
        card.appendChild(div);
      }
      var ul = document.createElement("ul");
      ul.className = "items";
      var empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = "(empty)";
      ul.appendChild(empty);
      card.appendChild(ul);
    }

    return card;
  }

  function buildSelectRow(item) {
    var li = document.createElement("li");
    var stkOnClass = "";
    if (selectToKeep.selected[item.id]) {
      stkOnClass = " stk-on";
    }
    li.className = "item stk-mode" + stkOnClass;
    li.dataset.id = item.id;

    var wrap = document.createElement("div");
    wrap.className = "label-wrap";
    var label = document.createElement("span");
    label.className = "label";
    label.textContent = item.text;
    wrap.appendChild(label);
    li.appendChild(wrap);

    var box = document.createElement("span");
    box.className = "stk-box";
    li.appendChild(box);

    li.addEventListener("click", function () {
      if (selectToKeep.selected[item.id]) {
        delete selectToKeep.selected[item.id];
      } else {
        selectToKeep.selected[item.id] = true;
      }
      render();
    });

    return li;
  }

  function buildRandomizerRow(item) {
    var li = document.createElement("li");
    li.className = "item rnd-item";
    li.dataset.id = item.id;
    if (isBuyItem(item)) li.appendChild(buildBuyTag());
    var label = document.createElement("span");
    label.className = "label";
    label.textContent = item.text;
    li.appendChild(label);
    return li;
  }

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
    if (opts.kind !== "trash" && !(randomizer.active && randomizer.target === opts.randomizerTarget)) card.appendChild(buildAdder(key));
    return card;
  }

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
        state.collapsed[key] = !state.collapsed[key]; save(); render();
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
        state.collapsed[key] = !state.collapsed[key]; save(); render();
      });
    }
    head.appendChild(title);

    if (opts.selectToKeep || opts.randomizerTarget) {
      var headerActions = document.createElement("div");
      headerActions.className = "head-actions";

      var isThisRandomizer = randomizer.active && randomizer.target === opts.randomizerTarget;

      if (isThisRandomizer) {
        var doneBtn = document.createElement("button");
        doneBtn.className = "head-btn";
        doneBtn.textContent = "Done";
        doneBtn.addEventListener("click", function () {
          randomizerGen++;
          randomizer = { active: false, target: null, winnerId: null, highlightId: null, done: false };
          render();
        });
        headerActions.appendChild(doneBtn);
      } else if (selectToKeep.active) {
        var selCount = Object.keys(selectToKeep.selected).length;

        var moveBtn = document.createElement("button");
        moveBtn.className = "head-btn primary";
        moveBtn.textContent = "Move unselected ↓";
        moveBtn.disabled = selCount === 0;
        moveBtn.addEventListener("click", function () {
          ["0", "1"].forEach(function (k) {
            var keep = [];
            state.items[k].forEach(function (item) {
              if (selectToKeep.selected[item.id]) {
                keep.push(item);
              } else {
                state.items["2"].push(item);
              }
            });
            state.items[k] = keep;
          });
          selectToKeep.active = false;
          selectToKeep.selected = {};
          save(); render();
        });
        headerActions.appendChild(moveBtn);

        var cancelBtn = document.createElement("button");
        cancelBtn.className = "head-btn";
        cancelBtn.textContent = "Cancel";
        cancelBtn.addEventListener("click", function () {
          selectToKeep.active = false;
          selectToKeep.selected = {};
          render();
        });
        headerActions.appendChild(cancelBtn);
      } else {
        if (opts.randomizerTarget) {
          var randBtn = document.createElement("button");
          randBtn.className = "head-btn";
          randBtn.textContent = "Randomizer!";
          randBtn.addEventListener("click", function () {
            var keys;
            if (opts.randomizerTarget === "today") {
              keys = ["0", "1"];
            } else {
              keys = [opts.randomizerTarget];
            }
            var allItems = [];
            keys.forEach(function (k) {
              state.items[k].forEach(function (item) { allItems.push(item); });
            });
            if (allItems.length === 0) { toast("No items to randomize!"); return; }
            randomizer = { active: true, target: opts.randomizerTarget, winnerId: null, highlightId: null, done: false };
            render();
            setTimeout(function () { runRandomizerAnimation(); }, 100);
          });
          headerActions.appendChild(randBtn);
        }
        if (opts.selectToKeep) {
          var enterBtn = document.createElement("button");
          enterBtn.className = "head-btn";
          enterBtn.textContent = "Select to keep";
          enterBtn.style.display = "none";
          enterBtn.addEventListener("click", function () {
            selectToKeep.active = true;
            selectToKeep.selected = {};
            render();
          });
          headerActions.appendChild(enterBtn);
        }
      }
      head.appendChild(headerActions);
    }

    if (!opts.noCount) {
      var count = document.createElement("span");
      count.className = "count";
      var n;
      if (opts.countKeys) {
        n = opts.countKeys.reduce(function (sum, k) { return sum + state.items[k].length; }, 0);
      } else {
        n = state.items[key].length;
      }
      count.textContent = n;
      head.appendChild(count);
    }

    return head;
  }

  function buildItems(key, opts) {
    opts = opts || {};
    var ul = document.createElement("ul");
    ul.className = "items";
    var arr = state.items[key];

    if (arr.length === 0) {
      var empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = "(empty)";
      ul.appendChild(empty);
      return ul;
    }

    arr.forEach(function (item) {
      if (randomizer.active && randomizer.target === opts.randomizerTarget) ul.appendChild(buildRandomizerRow(item));
      else if (opts.kind === "trash") ul.appendChild(buildTrashRow(item));
      else if (opts.kind === "completed") ul.appendChild(buildCompletedRow(item));
      else ul.appendChild(buildMainRow(key, item));
    });
    return ul;
  }

  function isBuyItem(item) {
    return /^buy\b/i.test(item.text);
  }

  function buildBuyTag() {
    var tag = document.createElement("span");
    tag.className = "buy-tag";
    tag.textContent = "🛒";
    return tag;
  }

  // main-chain row: [check] [cart?] [label] [pencil] [hamburger]
  function buildMainRow(key, item) {
    var li = document.createElement("li");
    li.className = "item";
    li.dataset.id = item.id;

    li.appendChild(buildCheck(false, function () { completeItem(key, item.id); }));
    if (isBuyItem(item)) li.appendChild(buildBuyTag());
    li.appendChild(buildLabel(item));

    var actions = document.createElement("div");
    actions.className = "row-actions";
    actions.appendChild(buildPencil(key, item, li));
    actions.appendChild(buildHamburger(key, item));
    li.appendChild(actions);

    attachSwipe(li, key, item.id);
    return li;
  }

  // completed row: [ticked check] [grey label] [pencil] [hamburger]
  function buildCompletedRow(item) {
    var li = document.createElement("li");
    li.className = "item done";
    li.dataset.id = item.id;

    li.appendChild(buildCheck(true, function () { uncompleteItem(item.id); }));
    if (isBuyItem(item)) li.appendChild(buildBuyTag());
    li.appendChild(buildLabel(item));

    var actions = document.createElement("div");
    actions.className = "row-actions";
    actions.appendChild(buildPencil("completed", item, li));
    actions.appendChild(buildHamburger("completed", item));
    li.appendChild(actions);

    attachSwipeUpOnly(li, item.id);
    return li;
  }

  // trash row: [grey label + ttl] [Recover] [permanent x]
  function buildTrashRow(item) {
    var li = document.createElement("li");
    li.className = "item trash-item";
    li.dataset.id = item.id;

    var wrap = document.createElement("div");
    wrap.className = "label-wrap";
    var label = document.createElement("span");
    label.className = "label";
    label.textContent = item.text;
    wrap.appendChild(label);

    var days = Math.max(0, Math.ceil((WEEK_MS - (getNow().getTime() - new Date(item.deletedAt).getTime())) / (24*60*60*1000)));
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
    rec.addEventListener("click", function () { recoverItem(item.id); });
    actions.appendChild(rec);

    var perm = mkMini("✕", "Delete permanently");
    perm.classList.add("trash");
    perm.addEventListener("click", function () { permaDelete(item.id); });
    actions.appendChild(perm);

    li.appendChild(actions);
    return li;
  }

  // ---- shared row pieces ----
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

    if (editingNote && editingNote.id === item.id) {
      var ta = document.createElement("textarea");
      ta.className = "item-note-edit";
      ta.value = item.note || "";
      ta.placeholder = "Add a note…";
      ta.rows = 1;
      wrap.appendChild(ta);
      function autoSize() { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; }
      ta.addEventListener("input", autoSize);
      setTimeout(function () {
        autoSize();
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }, 0);
      var committed = false;
      function commit() {
        if (committed) return;
        committed = true;
        var eKey = editingNote.key;
        editingNote = null;
        editNote(eKey, item.id, ta.value);
      }
      ta.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit(); }
        else if (e.key === "Escape") { committed = true; editingNote = null; render(); }
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

  function buildPencil(key, item, li) {
    var btn = mkMini("✎", "Edit");
    btn.addEventListener("click", function () { startEdit(li, key, item); });
    return btn;
  }

  function buildTrashBtn(onClick, item) {
    var btn = mkMini("🗑", "Delete");
    btn.classList.add("trash");
    btn.addEventListener("click", onClick);
    return btn;
  }

  var menuOpenBtn = null;
  function closeAllMenus() {
    var open = document.querySelectorAll(".item-menu");
    open.forEach(function (m) { m.remove(); });
    menuOpenBtn = null;
  }
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".menu-anchor")) closeAllMenus();
    if (expandedNote && !editingNote && !e.target.closest(".item[data-id=\"" + expandedNote + "\"]")) {
      expandedNote = null;
      render();
    }
  });

  function buildHamburger(key, item) {
    var wrap = document.createElement("div");
    wrap.className = "menu-anchor";
    var btn = mkMini("☰", "More options");
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (menuOpenBtn === btn) { closeAllMenus(); return; }
      closeAllMenus();
      menuOpenBtn = btn;
      var menu = document.createElement("div");
      var menuTodayClass = "";
      if (key === "0" || key === "1") {
        menuTodayClass = " item-menu-today";
      }
      menu.className = "item-menu" + menuTodayClass;

      var isChain = CHAIN.indexOf(key) !== -1;

      if (isChain) {
        if (key !== "0") {
          var up = document.createElement("button");
          up.textContent = "Move up";
          up.addEventListener("click", function () { moveChain(key, item.id, -1); });
          menu.appendChild(up);
        }

        if (key !== "4") {
          var down = document.createElement("button");
          down.textContent = "Move down";
          down.addEventListener("click", function () { moveChain(key, item.id, 1); });
          menu.appendChild(down);
        }
      }

      var note = document.createElement("button");
      note.textContent = "Edit note";
      note.addEventListener("click", function () {
        closeAllMenus();
        startNoteEdit(key, item);
      });
      menu.appendChild(note);

      var recurrence = document.createElement("button");
      recurrence.textContent = "Edit recurrence";
      menu.appendChild(recurrence);

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

  function mkMini(glyph, label) {
    var b = document.createElement("button");
    b.className = "mini";
    b.textContent = glyph;
    b.title = label;
    b.setAttribute("aria-label", label);
    return b;
  }

  function startEdit(li, key, item) {
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
    function commit() {
      if (committed) return;
      committed = true;
      editItem(key, item.id, input.value);  // empty = cancel inside
      if (!input.value.trim()) render();     // restore label on cancel
    }
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") commit();
      else if (e.key === "Escape") { committed = true; render(); }
    });
    input.addEventListener("blur", commit);
  }

  function buildAdder(key) {
    var adder = document.createElement("div");
    adder.className = "adder";
    var input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Add…";
    input.setAttribute("aria-label", "Add an item");
    var addBtn = document.createElement("button");
    addBtn.className = "primary";
    addBtn.textContent = "Add";
    function commit() {
      var v = input.value.trim();
      if (!v) return;
      state.items[key].push({ id: uid(), text: v });
      input.value = "";
      save(); render();
    }
    addBtn.addEventListener("click", commit);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") commit(); });
    adder.appendChild(input);
    adder.appendChild(addBtn);
    return adder;
  }

  // ---------- randomizer animation ----------
  function runRandomizerAnimation() {
    var gen = ++randomizerGen;
    var keys;
    if (randomizer.target === "today") {
      keys = ["0", "1"];
    } else {
      keys = [randomizer.target];
    }
    var allItems = [];
    keys.forEach(function (k) {
      state.items[k].forEach(function (item) { allItems.push(item); });
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

  function blinkWinner(gen) {
    var el = document.querySelector('.rnd-item[data-id="' + randomizer.winnerId + '"]');
    if (!el) return;
    var blinks = 0;
    function blink() {
      if (gen !== randomizerGen) return;
      if (blinks >= 4) { el.classList.add("rnd-highlight"); return; }
      el.classList.toggle("rnd-highlight");
      blinks++;
      setTimeout(blink, 250);
    }
    el.classList.remove("rnd-highlight");
    setTimeout(function () { if (gen === randomizerGen) blink(); }, 200);
  }

  // ---------- swipe ----------
  // swipe left -> up the chain ; swipe right -> down the chain
  function attachSwipe(el, key, id) {
    swipeCore(el, function (dir) {
      if (dir === "left") moveChain(key, id, -1);
      else moveChain(key, id, 1);
    });
  }
  // purgatory: only up-swipe (left) revives to list 2
  function attachSwipeUpOnly(el, id) {
    swipeCore(el, function (dir) {
      if (dir === "left") uncompleteItem(id);
    });
  }

  function swipeCore(el, onCommit) {
    var startX = 0, startY = 0, dx = 0, dy = 0, tracking = false, swiped = false;
    var THRESH = 80;
    var origBg = "";
    el.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1) return;
      if (e.target.closest(".label-edit")) { tracking = false; return; }
      tracking = true; swiped = false;
      startX = e.touches[0].clientX; startY = e.touches[0].clientY; dx = 0; dy = 0;
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
      el.style.transform = ""; el.style.opacity = "";
      el.style.backgroundColor = origBg;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > THRESH) {
        // a real swipe happened: stop the underlying button's click from firing
        var btn = e.target.closest("button");
        if (btn) {
          var swallow = function (ev) { ev.stopPropagation(); ev.preventDefault(); btn.removeEventListener("click", swallow, true); };
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

  // ---------- schedule UI ----------
  var everyEl = document.getElementById("every");
  var atHourEl = document.getElementById("atHour");
  var atMinEl = document.getElementById("atMin");
  var nextNote = document.getElementById("nextNote");

  function pad(n) {
    var prefix = "";
    if (n < 10) {
      prefix = "0";
    }
    return prefix + n;
  }
  function syncScheduleInputs() {
    everyEl.value = state.schedule.everyDays;
    atHourEl.value = Math.floor(state.schedule.atMinutes / 60);
    atMinEl.value = pad(state.schedule.atMinutes % 60);
  }
  function clamp(v, lo, hi) { v = parseInt(v, 10); if (isNaN(v)) v = lo; return Math.max(lo, Math.min(hi, v)); }
  function onScheduleChange() {
    var ed = parseInt(everyEl.value, 10); if (!(ed >= 1)) ed = 1;
    state.schedule.everyDays = ed; everyEl.value = ed;
    var h = clamp(atHourEl.value, 0, 23);
    var m = clamp(atMinEl.value, 0, 59);
    atHourEl.value = h; atMinEl.value = pad(m);
    state.schedule.atMinutes = h * 60 + m;
    save(); updateNextNote();
  }
  everyEl.addEventListener("change", onScheduleChange);
  atHourEl.addEventListener("change", onScheduleChange);
  atMinEl.addEventListener("change", onScheduleChange);

  function updateNextNote() {
    var next = nextBoundaryAfter(getNow());
    nextNote.textContent = "Next return: " + next.toLocaleString("en-CA",
      { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  }

  // ---------- export / import ----------
  function exportJSON() { return JSON.stringify(state, null, 2); }
  function markExported() {
    state.lastExported = getNow().toISOString();
    save(); updateLastExported();
  }
  function importFromText(text) {
    if (!window.confirm("Import will replace everything currently in these lists. Continue?")) return;
    try {
      state = normalise(JSON.parse(text));
      save(); syncScheduleInputs(); render();
      toast("Imported.");
      return true;
    } catch (e) { toast("That text could not be read as valid JSON."); return false; }
  }

  // modal helpers
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

  // Export - Copy: show JSON in a readonly textarea for manual selection
  document.getElementById("exportCopyBtn").addEventListener("click", function () {
    var frag = document.createDocumentFragment();
    var h = document.createElement("h3"); h.textContent = "Export — select and copy"; frag.appendChild(h);
    var ta = document.createElement("textarea");
    ta.className = "modal-ta"; ta.readOnly = true; ta.value = exportJSON();
    frag.appendChild(ta);
    var row = document.createElement("div"); row.className = "modal-actions";
    var close = document.createElement("button"); close.textContent = "Done";
    row.appendChild(close);
    frag.appendChild(row);
    var overlay = showModal(frag);
    ta.focus(); ta.select();
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
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    markExported();
    toast("Exported.");
  });

  // Export - Share
  document.getElementById("exportShareBtn").addEventListener("click", function () {
    if (!navigator.share) { toast("Share not supported in this browser."); return; }
    navigator.share({ title: "AutoReList backup", text: exportJSON() }).then(function () {
      markExported();
    }).catch(function () {});
  });

  // Import - Paste: show empty textarea for user to paste into
  document.getElementById("importPasteBtn").addEventListener("click", function () {
    var frag = document.createDocumentFragment();
    var h = document.createElement("h3"); h.textContent = "Import — paste JSON"; frag.appendChild(h);
    var ta = document.createElement("textarea");
    ta.className = "modal-ta"; ta.placeholder = "Paste exported JSON here…";
    frag.appendChild(ta);
    var row = document.createElement("div"); row.className = "modal-actions";
    var imp = document.createElement("button"); imp.className = "primary"; imp.textContent = "Import";
    var cancel = document.createElement("button"); cancel.textContent = "Cancel";
    row.appendChild(imp); row.appendChild(cancel);
    frag.appendChild(row);
    var overlay = showModal(frag);
    ta.focus();
    imp.addEventListener("click", function () {
      var text = ta.value.trim();
      if (!text) { toast("Nothing to import."); return; }
      if (importFromText(text)) overlay.remove();
    });
    cancel.addEventListener("click", function () { overlay.remove(); });
  });

  // Import - File
  var fileInput = document.getElementById("fileInput");
  document.getElementById("importFileBtn").addEventListener("click", function () {
    fileInput.value = ""; fileInput.click();
  });
  fileInput.addEventListener("change", function () {
    var f = fileInput.files && fileInput.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () { importFromText(String(reader.result)); };
    reader.readAsText(f);
  });

  var lastExportedEl = document.getElementById("lastExported");
  function formatExportDate(iso) {
    return new Date(iso).toLocaleString("en-CA",
      { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  }
  function updateLastExported() {
    lastExportedEl.innerHTML = "";
    var text = document.createElement("span");
    var confirmed = state.lastExported && state.lastExported === state.lastExportedConfirmed;

    if (state.lastExported) {
      text.textContent = "Last exported: " + formatExportDate(state.lastExported);
    } else {
      text.textContent = "Never exported";
    }
    lastExportedEl.appendChild(text);

    if (state.lastExported && confirmed) {
      var check = document.createElement("span");
      check.className = "export-confirmed";
      check.textContent = "✓";
      lastExportedEl.appendChild(check);
    }

    if (state.lastExported && !confirmed) {
      var confirmBtn = document.createElement("button");
      confirmBtn.className = "export-action confirm";
      confirmBtn.textContent = "✓";
      confirmBtn.setAttribute("aria-label", "Confirm this export");
      confirmBtn.addEventListener("click", function () {
        state.lastExportedConfirmed = state.lastExported;
        save(); updateLastExported();
      });
      lastExportedEl.appendChild(confirmBtn);

      var revertBtn = document.createElement("button");
      revertBtn.className = "export-action revert";
      revertBtn.textContent = "✕";
      revertBtn.setAttribute("aria-label", "Revert to last confirmed export");
      revertBtn.addEventListener("click", function () {
        state.lastExported = state.lastExportedConfirmed;
        save(); updateLastExported();
      });
      lastExportedEl.appendChild(revertBtn);
    }
  }

  // ---------- toast ----------
  var toastEl = document.getElementById("toast");
  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2200);
  }

  // ---------- theme ----------
  var THEME_KEY = "fourlist.theme";
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

  // TEMP debug panel wiring — comment out along with the override block near the top of this
  // file and #debugDatePanel in index.html when not actively testing.
  function populateDebugNowInputs(dateEl, hourEl, d) {
    dateEl.value = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    hourEl.value = d.getHours();
  }
  function updateDebugNowStatus() {
    var statusEl = document.getElementById("debugNowStatus");
    if (debugNowOverride) {
      statusEl.textContent = "Overridden to: " + getNow().toLocaleString("en-CA",
        { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "2-digit", hour12: false });
    } else {
      statusEl.textContent = "Using real time.";
    }
  }
  function applyDebugNowChange() {
    updateDebugNowStatus();
    purgeTrash();
    applyAutoReturn();
    render();
  }
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

  // ---------- boot ----------
  initTheme();
  initDebugNowPanel();
  purgeTrash();
  applyAutoReturn();
  syncScheduleInputs();
  updateLastExported();
  render();

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) {
      purgeTrash();
      var moved = applyAutoReturn();
      render();
    }
  });
})();
