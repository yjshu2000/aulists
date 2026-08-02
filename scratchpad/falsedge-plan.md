# Falsedge + Lists rehaul

## Context

The Today-card carousel hasn't helped productivity. It's being stripped out, and the Colourcaln day-colours page is being replaced by Falsedge, a points/deadline tracker. Everything currently in `aulists` gets copied to a sibling `old-aulists` folder first as a reference snapshot.

## Phase 0 — Backup copy

Copy the entire `aulists` folder (including `scratchpad/` with its nested git repo — plain file copy) to `E:\contents\piyopiyo\claudecode\mobile1sts\old-aulists`. This happens before any other change.
*ALREADY DONE*

## Phase 1 — Lists page changes

### Card layout (top to bottom)

- **List 0** — own card, fixed, titled "List 0", own adder.
- **List 1** — own card, fixed, titled "List 1", own adder.
- **List 2** (with 2.5 subsection), **Completed**, **List 3**, **List 4**, **Recurring**, **Trash** — unchanged.

### Completing an item

Completing an item immediately unlinks it from whatever list it's in. The item stays in `itemsById` and surfaces through the Completed derived view (`isDone && !recurrence`).

### Recurring item placement

A live check runs on every render/load: for each recurring item whose rule is due (`ruleFires`) and not already linked anywhere (`findItemListKey` returns null), push it into `state.lists[rec.destination]`. Same pattern as `purgeTrash` — recompute on access.

Recurrence destination enum: `0`/`1`/`2.5` in the three hardcoded spots (`RECURRENCE_SCHEMA_TEXT`, `validateRecurrence`, `buildDestToggle`).

### Removed from `autorelists.js`

Carousel state/functions: `todayCardOffset`, `carouselAnimating`, `CAROUSEL_PEEK`, `CAROUSEL_GAP`, `carouselStepPx`, `formatCardDate`, `buildCardForOffset`, `animateCarousel`, carousel DOM assembly in `render()`.

Past-day system: `buildPastDayCard`, `buildPastItemRow`, `startPastEdit`, `buildPastHamburger`, `buildPastItemAdder`, `addPastItem`, `startPastNoteEdit`, `editPastItemText`, `editPastItemNote`, `deletePastItem`, `togglePastItemDone`, `pastNoteKey`, `snapshotTodayLists`, `sanitizePastDaysByDate`.

Rollover: `rolloverOneDay`, `applyRollover`.

State fields: `state.pastDaysByDate`, `state.todayDateKey`.

List -1: removed from `LIST_KEYS`. `LIST_KEYS` becomes just `CHAIN` (`["0","1","2","2.5","3","4"]`). `PAST_LIST_KEYS` deleted entirely.

### Removed from `style-minim.css`

`--vivid-*` custom properties, `.today-carousel` and children, `.today-carousel-viewport`, `-track`, `.anim`, `.carousel-slide`, `.spacer`, `.today-nav*`, `.item-menu.item-menu-today`.

## Phase 2 — Replace Colourcaln with Falsedge page

`colourcaln.html` and `colourcaln.js` are removed. `style-colourful.css` stays — `about.html` depends on it.

New files: `falsedge.html`, `falsedge.js`, `style-falsedge.css`.

`falsedge.js` is plain closure-style vanilla JS. `points-tracker.jsx` is a React mock from Claude Chat (can't run in this build-tool-free PWA) — reference for feature logic only, not for styling.

`falsedge.html` links `style-colourful.css` directly (reusing its `:root` variables, color palette, `.card`, `.btn`, `.overlay`/`.sheet`, typography). Colourcaln-specific class names/rules (`.dist`, `.cell`, `.ribbon`, `.yesterday-bar`, rating-color `.opt` variants, etc.) get cleaned out of `style-colourful.css`, keeping the palette and generic components. A new `style-falsedge.css` alongside it adds only Falsedge-specific layout rules.

`falsedge.js` owns its own localStorage key (`"falsedge.data"`) and its own undo/redo stack — a copy of the generic engine in `autorelists.js:17-93` (`pushUndo`/`pushBoundary`/`step`/`snapshotState`/`UNDO_CAP`).

### Navigation wiring

- `sw.js` `SHELL` array: drop `colourcaln.html`/`colourcaln.js`, add `falsedge.html`/`falsedge.js`/`style-falsedge.css`, bump `CACHE` version.

### List 0 linking

Falsedge reads Aulists' list 0 by reading the `aulists.listdata` localStorage key directly, filtering `state.lists["0"]` against `state.itemsById`. A Falsedge task created via Link stores `linkedItemId`. While the linked task is active, editing its text in Falsedge does a read-mutate-write cycle on the Aulists blob to update `itemsById[linkedItemId].text`. Once the task is completed and logged to the ledger, the ledger entry is a frozen snapshot.

### Falsedge recurring templates

Completely separate system from Aulists' `item.recurrence`. Own storage, own fields (template text, optional template time, optional default WL/HL).

## Phase 3 — Falsedge layout

Single scrolling page, collapsible sections.

### Top-to-bottom order

1. **Ledger + Data export**
   - 1a. **Ledger** — above everything else. Its own collapse toggle sits at the bottom of the ledger region (opposite every other collapsible section, whose toggle sits at the top) — that's the "header" the rest of this line means. Growing upward: newest entry closest to that toggle, older entries above it, scroll up for history. Collapsed by default. Each entry renders with the same visual layout as a just-completed active task: 
   
   (task text) 
   completed by: (datetime OR "none ()")
   pts = 42 + 6 = 48
   scr = 127 + 6 = 133

      - cancelled tasks get "none (cancelled)". 
      - failed (didn't finish by deadline) tasks get "none (failed)". 
      - datetime format: YYYY-MM-DD HH:MM
      - each entry gets its own round-box outline. 

   - 1b. **Data export** — nested inside the ledger, just below the newest entry. Can be uncollapsed only once the ledger itself is uncollapsed. Markdown export from day one, chunked at 2000 characters, boundaries quantized to whole ledger entries. Additional options (e.g. export + delete) and exact markdown format are TBD.

2. **Current pts / Current scr** — plain text. Tapping either uncollapses a full scores view (current run + high scores) inline.

```
Current pts: 42
Current scr: 127.0
```

3. **Active task** (shown when one is set):

```
do task
by 16:00 for 6 pts                         ← smaller/fainter (passed)
by 16:10 for 3 pts                         ← smaller/fainter (passed)
by 16:30 for 2 pts                         ← normal size (active deadline)
by 17:00 for 1 pts                         ← smaller/fainter (upcoming)
[complete now] or
completed before: [16:00] [16:10]          ← only times already passed
```

As each tier's deadline passes, it goes smaller/fainter and the next tier becomes normal-sized (the active one). 
WL tiers: 0/10/30/60 min after deadline → 6/3/2/1 pts. 
HL tiers: 0/5/15/30 min → 6/3/2/1 pts. 
All tasks are worth 6 pts at the primary deadline. 
`completed before:` shows clickable time buttons, only for tiers whose time has already passed. The purpose is if a task was completed before a time but is being reported later than that time. 

4. **SET** box:

eg, current time 16:23: 
```
[text field                                        ]
by [17:00] [17:10] [17:20] [17:30] [18:00]  or select [dropdown ▾]
[ WL ]  [ HL ]                              ↑ smaller/fainter  (↑ dropdown normal size)
↑ not small
```

Time-template buttons show actual computed clock times (each rounded up to the next 10-min mark), computed from: +30min, +40min, +50min, +1h, at next hour. Clicking a button updates the dropdown to that time. The dropdown is the single source of truth for the selected deadline. Dropdown shows 10-min increments starting at the next-next 10-min mark from now (e.g. 16:27 → starts at 16:40). WL/HL toggle pair: mutually exclusive; can be either or neither (must be either to set the task).

5. **ACTIVATE** box — Falsedge's recurring templates. Timed templates sorted by next-closest occurrence (wrapping around midnight). Untimed templates listed after — sort order TBD.

```
check in after getting home   by 19:00     [ ^ ]
shower                        by 04:40     [ ^ ]
vacuum                                     [ ^ ]
```

`[ ^ ]` copies the template's text and time into the SET box (text field + dropdown) as an editable prefill.

6. **LINK** box — Aulists list-0 items.

```
vacuum                                    [Link]
job search stuff                          [Link]
```

Each item has only a `Link` button (no checkbox, menu, or pencil — those live in Aulists). Clicking Link prefills the SET box's text field with the item's text; time is left blank.

## pts system ACTUALLY EXPLAINED

- points and score are equivalent 1:1. 
- score gets reset sometimes. (streak feature; not in scope yet - a score resetting puts the last score in highscores list)
- points can be spent. also not in scope yet. 
- basically, score only goes up unless reset (never subtracted); points only go up unless subtracted (never reset)

- Leniency:
  - WL = whole leniency. the base: up to 1h leniency from the deadline, in steps of +10, +30, and +60. there is NO MORE LENIENCY AFTER THE FINAL LENIENCY DEADLINE. 
  - HL = half leniency. 
  - NL = no leniency. not in scope yet. 