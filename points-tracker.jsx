import { useState, useEffect } from "react";

// ─────────────────────────────────────────────
//  THEMES — swap T at the bottom of this block
// ─────────────────────────────────────────────

// T0 — original dark purple (v1 vibe, named-color approximation)
const T0 = {
  pageBg:            "black",
  headerBg:          "indigo",
  cellBg:            "darkslateblue",
  tabBarBg:          "indigo",
  borderStrong:      "slateblue",
  borderSoft:        "slateblue",
  borderAccent:      "cornflowerblue",
  textPrimary:       "lavender",
  textLabel:         "mediumpurple",
  textMuted:         "rebeccapurple",
  ptsColor:          "plum",
  scoreColor:        "aquamarine",
  milestoneColor:    "khaki",
  immediateColor:    "powderblue",
  immediateDeadline: "khaki",
  recurringName:     "plum",
  progressBar:       "blueviolet",
  streakActiveBg:    "darkgreen",
  streakActiveFg:    "lime",
  streakActiveBorder:"green",
  streakBrokenBg:    "darkred",
  streakBrokenFg:    "tomato",
  streakBrokenBorder:"red",
  positive:          "plum",
  positiveScore:     "aquamarine",
  negative:          "tomato",
  zero:              "rebeccapurple",
  tabActive:         "plum",
  tabInactive:       "rebeccapurple",
  tabIndicator:      "blueviolet",
  rank1:             "khaki",
  rank2:             "silver",
  rank3:             "peru",
  rankOther:         "rebeccapurple",
  tagRecurringBg:    "indigo",        tagRecurringFg:    "lavender",
  tagImmediateBg:    "darkslateblue", tagImmediateFg:    "lightcyan",
  tagRetroactiveBg:  "saddlebrown",   tagRetroactiveFg:  "wheat",
  tagPurchaseBg:     "darkred",       tagPurchaseFg:     "mistyrose",
  tagMilestoneBg:    "darkgoldenrod", tagMilestoneFg:    "lightyellow",
  tagSystemBg:       "darkslategray", tagSystemFg:       "lightsteelblue",
};

// T1 — second iteration (deep navy + teal accents)
const T1 = {
  pageBg:            "black",
  headerBg:          "darkslateblue",
  cellBg:            "darkslateblue",
  tabBarBg:          "darkslateblue",
  borderStrong:      "navy",
  borderSoft:        "navy",
  borderAccent:      "cadetblue",
  textPrimary:       "white",
  textLabel:         "cornflowerblue",
  textMuted:         "steelblue",
  ptsColor:          "thistle",
  scoreColor:        "paleturquoise",
  milestoneColor:    "palegoldenrod",
  immediateColor:    "paleturquoise",
  immediateDeadline: "palegoldenrod",
  recurringName:     "thistle",
  progressBar:       "cadetblue",
  streakActiveBg:    "darkgreen",
  streakActiveFg:    "lime",
  streakActiveBorder:"green",
  streakBrokenBg:    "darkred",
  streakBrokenFg:    "tomato",
  streakBrokenBorder:"red",
  positive:          "thistle",
  positiveScore:     "paleturquoise",
  negative:          "tomato",
  zero:              "steelblue",
  tabActive:         "thistle",
  tabInactive:       "steelblue",
  tabIndicator:      "cadetblue",
  rank1:             "palegoldenrod",
  rank2:             "silver",
  rank3:             "peru",
  rankOther:         "steelblue",
  tagRecurringBg:    "midnightblue",  tagRecurringFg:    "lavender",
  tagImmediateBg:    "teal",          tagImmediateFg:    "lightcyan",
  tagRetroactiveBg:  "saddlebrown",   tagRetroactiveFg:  "wheat",
  tagPurchaseBg:     "darkred",       tagPurchaseFg:     "mistyrose",
  tagMilestoneBg:    "darkgoldenrod", tagMilestoneFg:    "lightyellow",
  tagSystemBg:       "darkslategray", tagSystemFg:       "lightsteelblue",
};

// T2 — current interstellar (black + violet/skyblue)
const T2 = {
  pageBg:            "black",
  headerBg:          "midnightblue",
  cellBg:            "midnightblue",
  tabBarBg:          "midnightblue",
  borderStrong:      "navy",
  borderSoft:        "navy",
  borderAccent:      "steelblue",
  textPrimary:       "white",
  textLabel:         "slateblue",
  textMuted:         "slateblue",
  ptsColor:          "violet",
  scoreColor:        "skyblue",
  milestoneColor:    "gold",
  immediateColor:    "skyblue",
  immediateDeadline: "gold",
  recurringName:     "violet",
  progressBar:       "mediumpurple",
  streakActiveBg:    "darkgreen",
  streakActiveFg:    "lime",
  streakActiveBorder:"green",
  streakBrokenBg:    "darkred",
  streakBrokenFg:    "tomato",
  streakBrokenBorder:"red",
  positive:          "violet",
  positiveScore:     "skyblue",
  negative:          "tomato",
  zero:              "slateblue",
  tabActive:         "violet",
  tabInactive:       "slateblue",
  tabIndicator:      "mediumpurple",
  rank1:             "gold",
  rank2:             "silver",
  rank3:             "peru",
  rankOther:         "slateblue",
  tagRecurringBg:    "midnightblue",  tagRecurringFg:    "lavender",
  tagImmediateBg:    "darkslateblue", tagImmediateFg:    "lightcyan",
  tagRetroactiveBg:  "saddlebrown",   tagRetroactiveFg:  "wheat",
  tagPurchaseBg:     "darkred",       tagPurchaseFg:     "mistyrose",
  tagMilestoneBg:    "darkgoldenrod", tagMilestoneFg:    "lightyellow",
  tagSystemBg:       "darkslategray", tagSystemFg:       "lightsteelblue",
};

// TM — monochrome
// #f5f5f5  textPrimary / bright fg
// #a0a0a0  textLabel / secondary fg
// #606060  borders / dividers / progress
// #2a2a2a  cellBg / tabBarBg
// #1a1a1a  headerBg
// #000000  pageBg
const TM = {
  pageBg:            "#000000",
  headerBg:          "#1a1a1a",
  cellBg:            "#2a2a2a",
  tabBarBg:          "#2a2a2a",
  borderStrong:      "#606060",
  borderSoft:        "#606060",
  borderAccent:      "#606060",
  textPrimary:       "#f5f5f5",
  textLabel:         "#a0a0a0",
  textMuted:         "#a0a0a0",
  ptsColor:          "#f5f5f5",
  scoreColor:        "#f5f5f5",
  milestoneColor:    "#f5f5f5",
  immediateColor:    "#f5f5f5",
  immediateDeadline: "#a0a0a0",
  recurringName:     "#f5f5f5",
  progressBar:       "#606060",
  streakActiveBg:    "#2a2a2a",
  streakActiveFg:    "#f5f5f5",
  streakActiveBorder:"#606060",
  streakBrokenBg:    "#000000",
  streakBrokenFg:    "#a0a0a0",
  streakBrokenBorder:"#606060",
  positive:          "#f5f5f5",
  positiveScore:     "#f5f5f5",
  negative:          "#a0a0a0",
  zero:              "#606060",
  tabActive:         "#f5f5f5",
  tabInactive:       "#a0a0a0",
  tabIndicator:      "#606060",
  rank1:             "#f5f5f5",
  rank2:             "#f5f5f5",
  rank3:             "#a0a0a0",
  rankOther:         "#a0a0a0",
  tagRecurringBg:    "#2a2a2a",  tagRecurringFg:    "#f5f5f5",
  tagImmediateBg:    "#2a2a2a",  tagImmediateFg:    "#f5f5f5",
  tagRetroactiveBg:  "#2a2a2a",  tagRetroactiveFg:  "#f5f5f5",
  tagPurchaseBg:     "#1a1a1a",  tagPurchaseFg:     "#a0a0a0",
  tagMilestoneBg:    "#2a2a2a",  tagMilestoneFg:    "#f5f5f5",
  tagSystemBg:       "#1a1a1a",  tagSystemFg:       "#a0a0a0",
};

// ── ACTIVE THEME ──
const T = TM;
// ─────────────────────────────────────────────

const STORAGE_KEY = "points-tracker-v5";

const DEFAULT_STATE = {
  pts: 0,
  score: 0.0,
  streak: true,
  highScores: [],
  ledger: [],
  currentImmediate: null,
  lastImmediateGoal: null,
};

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function Tag({ type }) {
  const bg = T[`tag${cap(type)}Bg`] || T.tagSystemBg;
  const fg = T[`tag${cap(type)}Fg`] || T.tagSystemFg;
  return (
    <span style={{
      background: bg, color: fg,
      fontSize: "0.6rem", fontWeight: 700,
      padding: "2px 7px", borderRadius: 3,
      textTransform: "uppercase", letterSpacing: "0.08em",
      fontFamily: "monospace", whiteSpace: "nowrap",
      border: `1px solid ${fg}`,
    }}>{type}</span>
  );
}

const cell = {
  background: T.cellBg,
  borderRadius: 7,
  padding: "10px 13px",
  marginBottom: 8,
  border: `1px solid ${T.borderSoft}`,
};

export default function PointsTracker() {
  const [state, setState] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [exported, setExported] = useState(false);

  const handleExport = () => {
    const json = JSON.stringify(state);
    navigator.clipboard.writeText(json).then(() => {
      setExported(true);
      setTimeout(() => setExported(false), 2000);
    });
  };

  const handleImport = () => {
    try {
      const parsed = JSON.parse(importText.trim());
      if (typeof parsed.pts === "undefined") throw new Error("invalid");
      window.__trackerUpdate(parsed);
      setImportText("");
      setImportError("");
    } catch {
      setImportError("invalid JSON — paste the full exported blob");
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(STORAGE_KEY);
        setState(r ? JSON.parse(r.value) : DEFAULT_STATE);
      } catch { setState(DEFAULT_STATE); }
    })();
  }, []);

  useEffect(() => {
    window.__trackerUpdate = async (newState) => {
      setState(newState);
      try { await window.storage.set(STORAGE_KEY, JSON.stringify(newState)); } catch {}
    };
    window.__trackerGet = () => state;
  }, [state]);

  if (!state) return (
    <div style={{ background: T.pageBg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: T.textLabel, fontFamily: "monospace", letterSpacing: "0.2em" }}>
      LOADING...
    </div>
  );

  const nextMilestone = Math.ceil(Math.max(state.score + 0.001, 1) / 200) * 200;
  const milestoneProgress = ((state.score % 200) / 200) * 100;
  const tabs = ["dashboard", "ledger", "scores", "data"];

  return (
    <div style={{ background: T.pageBg, minHeight: "100vh", color: T.textPrimary, fontFamily: "monospace", paddingBottom: 40 }}>

      {/* HEADER */}
      <div style={{ background: T.headerBg, padding: "18px 16px 14px", borderBottom: `2px solid ${T.borderStrong}` }}>
        <div style={{ fontSize: "0.55rem", color: T.textLabel, letterSpacing: "0.25em", textTransform: "uppercase", marginBottom: 10 }}>✦ POINTS TRACKER ✦</div>

        <div style={{ display: "flex", marginBottom: 14 }}>
          <div style={{ flex: 1, paddingRight: 16, borderRight: `1px solid ${T.borderStrong}` }}>
            <div style={{ fontSize: "0.55rem", color: T.textLabel, letterSpacing: "0.15em", marginBottom: 3 }}>POINTS</div>
            <div style={{ fontSize: "3rem", fontWeight: 700, color: T.ptsColor, lineHeight: 1 }}>{state.pts}</div>
          </div>
          <div style={{ flex: 1, paddingLeft: 16 }}>
            <div style={{ fontSize: "0.55rem", color: T.textLabel, letterSpacing: "0.15em", marginBottom: 3 }}>SCORE</div>
            <div style={{ fontSize: "3rem", fontWeight: 700, color: T.scoreColor, lineHeight: 1 }}>{state.score.toFixed(1)}</div>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: "0.55rem", color: T.textLabel, letterSpacing: "0.1em" }}>NEXT MILESTONE</span>
            <span style={{ fontSize: "0.6rem", color: T.milestoneColor }}>{nextMilestone} → ×1.1 pts</span>
          </div>
          <div style={{ height: 3, background: T.borderStrong, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${milestoneProgress}%`, background: T.progressBar, borderRadius: 2 }} />
          </div>
          <div style={{ fontSize: "0.55rem", color: T.textMuted, marginTop: 3 }}>{state.score.toFixed(1)} / {nextMilestone}</div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{
            fontSize: "0.6rem", padding: "3px 10px", borderRadius: 20,
            background: state.streak ? T.streakActiveBg : T.streakBrokenBg,
            color: state.streak ? T.streakActiveFg : T.streakBrokenFg,
            border: `1px solid ${state.streak ? T.streakActiveBorder : T.streakBrokenBorder}`,
            letterSpacing: "0.1em",
          }}>
            {state.streak ? "● STREAK ACTIVE" : "✕ STREAK BROKEN"}
          </div>
          {state.currentImmediate && (
            <div style={{ fontSize: "0.6rem", padding: "3px 10px", borderRadius: 20, background: T.cellBg, color: T.immediateColor, border: `1px solid ${T.borderAccent}`, maxWidth: "60%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              🎯 {state.currentImmediate.name}{state.currentImmediate.deadline ? ` · ${state.currentImmediate.deadline}` : ""}
            </div>
          )}
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: "flex", borderBottom: `1px solid ${T.borderStrong}`, background: T.tabBarBg }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: "9px 0", background: "none", border: "none",
            borderBottom: tab === t ? `2px solid ${T.tabIndicator}` : "2px solid transparent",
            color: tab === t ? T.tabActive : T.tabInactive,
            fontFamily: "monospace", fontSize: "0.65rem",
            textTransform: "uppercase", letterSpacing: "0.12em", cursor: "pointer",
          }}>{t}</button>
        ))}
      </div>

      <div style={{ padding: "14px 16px" }}>

        {/* DASHBOARD */}
        {tab === "dashboard" && (
          <div>
            <div style={{ fontSize: "0.55rem", color: T.textLabel, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 7 }}>IMMEDIATE GOAL</div>
            {state.currentImmediate ? (
              <div style={{ ...cell, border: `1px solid ${T.borderAccent}` }}>
                <div style={{ color: T.immediateColor, fontWeight: 700, fontSize: "0.9rem" }}>{state.currentImmediate.name}</div>
                {state.currentImmediate.deadline && <div style={{ color: T.immediateDeadline, fontSize: "0.7rem", marginTop: 3 }}>by {state.currentImmediate.deadline}</div>}
              </div>
            ) : (
              <div style={{ ...cell, border: `1px dashed ${T.borderStrong}`, color: T.textMuted, fontSize: "0.72rem", textAlign: "center" }}>none set</div>
            )}

            <div style={{ fontSize: "0.55rem", color: T.textLabel, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 7, marginTop: 12 }}>RECURRING</div>
            {[
              { name: "Morning Genshin", desc: "Genshin >30 min", deadline: "06:00" },
              { name: "Anti-Liminal", desc: "Kitchen / rollerblade / store", deadline: "18:00" },
            ].map(g => (
              <div key={g.name} style={{ ...cell, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ color: T.recurringName, fontSize: "0.82rem", fontWeight: 700 }}>{g.name}</div>
                  <div style={{ color: T.textMuted, fontSize: "0.65rem", marginTop: 2 }}>{g.desc}</div>
                </div>
                <div style={{ color: T.milestoneColor, fontSize: "0.7rem" }}>{g.deadline}</div>
              </div>
            ))}

            <div style={{ fontSize: "0.55rem", color: T.textLabel, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 7, marginTop: 12 }}>RECENT</div>
            {state.ledger.length === 0 ? (
              <div style={{ color: T.textMuted, fontSize: "0.72rem", textAlign: "center", padding: "18px 0" }}>no activity yet</div>
            ) : state.ledger.slice(0, 6).map((e, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${T.borderStrong}` }}>
                <div style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
                  <div style={{ fontSize: "0.78rem", color: T.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.desc}</div>
                  <div style={{ fontSize: "0.58rem", color: T.textMuted, marginTop: 1 }}>{e.ts}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  {e.ptsDelta !== 0 && <div style={{ fontSize: "0.72rem", color: e.ptsDelta > 0 ? T.positive : T.negative, fontWeight: 700 }}>{e.ptsDelta > 0 ? "+" : ""}{e.ptsDelta} pts</div>}
                  {e.scoreDelta !== 0 && <div style={{ fontSize: "0.68rem", color: e.scoreDelta > 0 ? T.positiveScore : T.negative }}>{e.scoreDelta > 0 ? "+" : ""}{e.scoreDelta.toFixed(1)} sc</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* LEDGER */}
        {tab === "ledger" && (
          <div>
            <div style={{ fontSize: "0.55rem", color: T.textLabel, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 10 }}>ALL ENTRIES — {state.ledger.length}</div>
            {state.ledger.length === 0 && <div style={{ color: T.textMuted, fontSize: "0.75rem", textAlign: "center", padding: "40px 0" }}>empty</div>}
            {state.ledger.map((e, i) => (
              <div key={i} style={cell}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                  <span style={{ fontSize: "0.6rem", color: T.textMuted }}>{e.ts}</span>
                  <Tag type={e.type} />
                </div>
                <div style={{ fontSize: "0.82rem", color: T.textPrimary, marginBottom: 6, lineHeight: 1.35 }}>{e.desc}</div>
                <div style={{ display: "flex", gap: 14, fontSize: "0.7rem" }}>
                  <span style={{ color: e.ptsDelta > 0 ? T.positive : e.ptsDelta < 0 ? T.negative : T.zero, fontWeight: e.ptsDelta !== 0 ? 700 : 400 }}>
                    {e.ptsDelta > 0 ? "+" : ""}{e.ptsDelta} pts
                  </span>
                  <span style={{ color: e.scoreDelta > 0 ? T.positiveScore : e.scoreDelta < 0 ? T.negative : T.zero }}>
                    {e.scoreDelta > 0 ? "+" : ""}{e.scoreDelta.toFixed(1)} sc
                  </span>
                  <span style={{ color: T.textMuted }}>→ {e.pts} pts · {e.score.toFixed(1)} sc</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* SCORES */}
        {tab === "scores" && (
          <div>
            <div style={{ fontSize: "0.55rem", color: T.textLabel, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 8 }}>CURRENT RUN</div>
            <div style={{ fontSize: "2.6rem", fontWeight: 700, color: T.scoreColor, marginBottom: 14 }}>{Math.floor(state.score)}</div>
            <div style={{ fontSize: "0.55rem", color: T.textLabel, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 8 }}>HIGH SCORES</div>
            <div style={{ ...cell }}>
              {state.highScores.length === 0 ? (
                <div style={{ color: T.textMuted, fontSize: "0.75rem" }}>no high scores yet</div>
              ) : (
                <pre style={{ margin: 0, fontFamily: "monospace", fontSize: "0.85rem", color: T.textPrimary, lineHeight: 1.7, userSelect: "text" }}>
                  {state.highScores.map((s, i) => `${i + 1}. ${Math.round(s)}`).join("\n")}
                </pre>
              )}
            </div>
          </div>
        )}

        {/* DATA */}
        {tab === "data" && (
          <div>
            <div style={{ fontSize: "0.55rem", color: T.textLabel, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 10 }}>EXPORT</div>
            <div style={{ ...cell, marginBottom: 14 }}>
              <div style={{ fontSize: "0.72rem", color: T.textPrimary, marginBottom: 8, lineHeight: 1.4 }}>Copy your full data as JSON. Paste it back here in a new conversation to restore.</div>
              <button onClick={handleExport} style={{ width: "100%", padding: "9px", background: T.progressBar, color: T.textPrimary, border: "none", borderRadius: 5, fontFamily: "monospace", fontWeight: 700, fontSize: "0.8rem", cursor: "pointer" }}>
                {exported ? "✓ COPIED TO CLIPBOARD" : "COPY JSON TO CLIPBOARD"}
              </button>
            </div>

            <div style={{ fontSize: "0.55rem", color: T.textLabel, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 10 }}>IMPORT</div>
            <div style={cell}>
              <div style={{ fontSize: "0.72rem", color: T.textPrimary, marginBottom: 8, lineHeight: 1.4 }}>Paste a previously exported JSON blob to restore your data.</div>
              <textarea
                value={importText}
                onChange={e => { setImportText(e.target.value); setImportError(""); }}
                placeholder="paste JSON here..."
                rows={5}
                style={{ width: "100%", background: T.pageBg, border: `1px solid ${T.borderStrong}`, color: T.textPrimary, padding: "8px 10px", borderRadius: 5, fontFamily: "monospace", fontSize: "0.72rem", resize: "vertical", boxSizing: "border-box", marginBottom: 8 }}
              />
              {importError && <div style={{ color: T.negative, fontSize: "0.68rem", marginBottom: 8 }}>{importError}</div>}
              <button onClick={handleImport} style={{ width: "100%", padding: "9px", background: T.borderAccent, color: T.textPrimary, border: "none", borderRadius: 5, fontFamily: "monospace", fontWeight: 700, fontSize: "0.8rem", cursor: "pointer" }}>
                IMPORT & RESTORE
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
