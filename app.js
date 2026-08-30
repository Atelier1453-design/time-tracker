import { h, render } from "./vendor/preact.mjs";
import { useState, useEffect, useRef } from "./vendor/hooks.mjs";
import htmFactory from "./vendor/htm.mjs";
const html = htmFactory.bind(h);

import {
  INK, PAPER, CARD, RULE, MUTED, ALERT, SWATCHES,
  VERB_PRESETS, START_PRESETS, END_PRESETS,
  DEFAULT_ACTIVITIES, DEFAULT_STYLE, DEFAULT_TEMPLATES, STORE_KEY, FORMS,
  normalize, uid,
} from "./constants.js";
import {
  DAY, startOfDay, hhmm, clock, dur, WEEK, dateLabel, fullDateLabel, dateKey,
  toTimeInput, onDay, previewOf, fillPlaceholders, composeDiary,
} from "./diary.js";
import { checkStorage, storageBackend, saveData, loadData } from "./storage.js";
import { geocodeCandidates, fetchWeather } from "./weather.js";

/* ── icons ────────────────────────────────────────────────── */
const IconParallel = () => html`
  <svg width="20" height="16" viewBox="0 0 20 16" aria-hidden="true">
    <rect x="1" y="2" width="13" height="4.6" fill="currentColor" opacity="0.4" />
    <rect x="6" y="9.4" width="13" height="4.6" fill="currentColor" />
  </svg>`;
const IconStop = () => html`
  <svg width="20" height="16" viewBox="0 0 20 16" aria-hidden="true">
    <rect x="5.5" y="3" width="9" height="10" fill="currentColor" />
  </svg>`;

/* ── app ──────────────────────────────────────────────────── */
function App() {
  const [activities, setActivities] = useState(DEFAULT_ACTIVITIES);
  const [sessions, setSessions] = useState([]);
  const [place, setPlace] = useState("東京都");
  const [weatherLocation, setWeatherLocation] = useState(null); // {lat, lon, label}
  const [weather, setWeather] = useState({});
  const [diaries, setDiaries] = useState({});
  const [style, setStyle] = useState(DEFAULT_STYLE);
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);
  const [now, setNow] = useState(Date.now());
  const [viewDay, setViewDay] = useState(() => startOfDay(Date.now()));
  const [loaded, setLoaded] = useState(false);
  const [panel, setPanel] = useState(null);
  const [editingActivity, setEditingActivity] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [showWords, setShowWords] = useState(false);
  const [draft, setDraft] = useState({ activityId: "", start: "", end: "", parallel: false, manual: false });
  const [diary, setDiary] = useState(null);
  const [diaryBusy, setDiaryBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dataText, setDataText] = useState(null);
  const [dataMode, setDataMode] = useState("json");
  const [dataCopied, setDataCopied] = useState(false);
  const [importText, setImportText] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [storageOK, setStorageOK] = useState(null);
  const [restored, setRestored] = useState(false);
  const [geoQuery, setGeoQuery] = useState("");
  const [geoResults, setGeoResults] = useState([]);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoMsg, setGeoMsg] = useState("");
  const [barTip, setBarTip] = useState(null); // { id, left, text }
  const dirty = useRef(false);
  const areaRef = useRef(null);

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  useEffect(() => {
    (async () => {
      const ok = await checkStorage();
      setStorageOK(ok);
      if (ok) {
        try {
          const d = await loadData(STORE_KEY);
          if (d?.activities?.length) setActivities(d.activities.map(normalize));
          if (d?.sessions) setSessions(d.sessions);
          if (d?.place) setPlace(d.place);
          if (d?.weatherLocation) setWeatherLocation(d.weatherLocation);
          if (d?.weather) setWeather(d.weather);
          if (d?.diaries) setDiaries(d.diaries);
          if (d?.style) setStyle({ ...DEFAULT_STYLE, ...d.style });
          if (d?.templates) setTemplates(d.templates);
          if (d) setRestored(true);
        } catch (e) { /* 初回、または保存データなし */ }
      }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded || !dirty.current) return;
    (async () => {
      try {
        await saveData(STORE_KEY, { activities, sessions, place, weatherLocation, weather, diaries, style, templates });
        setStorageOK(true);
      } catch (e) {
        setStorageOK(false);
      }
    })();
  }, [activities, sessions, place, weatherLocation, weather, diaries, style, templates, loaded]);

  const mutate = (fn) => { dirty.current = true; fn(); };

  /* ── derived ── */
  const todayStart = startOfDay(now);
  const isToday = viewDay === todayStart;
  const isFuture = viewDay > todayStart;
  const dayEnd = viewDay + DAY;
  const running = sessions.filter((s) => s.end == null);
  const isRunning = (id) => running.some((s) => s.activityId === id);
  const act = (id) => activities.find((a) => a.id === id);
  const valid = (s) => s.end == null || s.end > s.start;

  const day = sessions.filter(valid)
    .map((s) => ({ ...s, from: Math.max(s.start, viewDay), to: Math.min(s.end ?? now, dayEnd) }))
    .filter((s) => s.to > s.from)
    .sort((a, b) => a.from - b.from);

  const dayRecords = sessions.filter((s) => {
    const e = s.end ?? now;
    return s.start < dayEnd && Math.max(e, s.start) >= viewDay;
  }).sort((a, b) => a.start - b.start);

  const marks = new Set([viewDay, dayEnd]);
  day.forEach((s) => { marks.add(s.from); marks.add(s.to); });
  const points = [...marks].sort((a, b) => a - b);
  const slices = [];
  for (let i = 0; i < points.length - 1; i++) {
    const t0 = points[i], t1 = points[i + 1];
    if (t1 <= t0) continue;
    const live = day.filter((s) => s.from <= t0 && s.to >= t1).sort((a, b) => a.start - b.start);
    if (live.length) slices.push({ t0, t1, live });
  }

  const totals = activities
    .map((a) => {
      const segs = day.filter((s) => s.activityId === a.id);
      return { ...a, ms: segs.reduce((n, s) => n + (s.to - s.from), 0), first: segs.length ? segs[0].from : Infinity };
    })
    .filter((t) => t.ms > 0);
  const byTime = [...totals].sort((a, b) => a.first - b.first);
  const byLength = [...totals].sort((a, b) => b.ms - a.ms);
  const maxTotal = Math.max(1, ...totals.map((t) => t.ms));

  const weekTotals = activities.map((a) => {
    let ms = 0;
    for (let i = 0; i < 7; i++) {
      const d0 = viewDay - i * DAY;
      for (const s of sessions) {
        if (s.activityId !== a.id || !valid(s)) continue;
        const from = Math.max(s.start, d0), to = Math.min(s.end ?? now, d0 + DAY);
        if (to > from) ms += to - from;
      }
    }
    return { ...a, ms };
  }).filter((t) => t.ms > 0).sort((a, b) => b.ms - a.ms);
  const maxWeek = Math.max(1, ...weekTotals.map((t) => t.ms));

  /* ── tracking ── */
  const start = (id, exclusive) =>
    mutate(() => setSessions((prev) => {
      const t = Date.now();
      const b = exclusive ? prev.map((s) => (s.end == null ? { ...s, end: t } : s)) : prev;
      return [...b, { id: uid(), activityId: id, start: t, end: null }];
    }));
  const stop = (id) => mutate(() => setSessions((p) => p.map((s) => (s.end == null && s.activityId === id ? { ...s, end: Date.now() } : s))));
  const stopAll = () => mutate(() => setSessions((p) => p.map((s) => (s.end == null ? { ...s, end: Date.now() } : s))));
  const tapMain = (id) => (isRunning(id) ? stop(id) : start(id, running.length > 0));

  /* ── record editing ── */
  const setTime = (sid, field, value) =>
    mutate(() => setSessions((p) => p.map((s) => (s.id === sid ? { ...s, [field]: onDay(startOfDay(s[field] ?? viewDay), value) } : s))));
  const nudgeDay = (sid, field, delta) =>
    mutate(() => setSessions((p) => p.map((s) => (s.id === sid ? { ...s, [field]: (s[field] ?? Date.now()) + delta * DAY } : s))));
  const boundaries = (exceptId) => {
    const m = [];
    for (const o of sessions) { if (o.id === exceptId) continue; m.push(o.start); if (o.end != null) m.push(o.end); }
    return m;
  };
  const prevBoundary = (s) => { const b = boundaries(s.id).filter((tt) => tt < s.start && tt >= s.start - 2 * DAY); return b.length ? Math.max(...b) : null; };
  const nextBoundary = (s) => { const e = s.end ?? now; const a = boundaries(s.id).filter((tt) => tt > e && tt <= e + 2 * DAY); return a.length ? Math.min(...a) : null; };
  const snap = (sid, field, value) => mutate(() => setSessions((p) => p.map((s) => (s.id === sid ? { ...s, [field]: value } : s))));
  const fixEnd = (sid) => mutate(() => setSessions((p) => p.map((s) => (s.id === sid && s.end != null ? { ...s, end: s.end + DAY } : s))));
  const removeSession = (id) => mutate(() => setSessions((p) => p.filter((s) => s.id !== id)));

  const chainStart = (() => {
    const ends = dayRecords.filter(valid).map((s) => s.end ?? now).filter((tt) => tt > viewDay && tt <= dayEnd);
    return ends.length ? Math.max(...ends) : null;
  })();
  const draftActivity = draft.activityId || activities[0]?.id;
  const useChain = chainStart != null && !draft.manual && !draft.parallel;
  const effectiveStart = useChain ? chainStart : onDay(viewDay, draft.start || "09:00");
  const addManual = () => {
    if (!draftActivity || !draft.end) return;
    const st = effectiveStart;
    let en = onDay(startOfDay(st), draft.end);
    if (en <= st) en += DAY;
    mutate(() => setSessions((p) => [...p, { id: uid(), activityId: draftActivity, start: st, end: en }]));
    setDraft((d) => ({ ...d, end: "", manual: false, parallel: false }));
  };

  /* ── activities & templates ── */
  const patchActivity = (id, patch) => mutate(() => setActivities((p) => p.map((a) => (a.id === id ? { ...a, ...patch } : a))));
  const addActivity = () => {
    const na = normalize({ id: uid(), name: "新しい行動", color: SWATCHES[activities.length % SWATCHES.length] });
    mutate(() => setActivities((p) => [...p, na]));
    setEditingActivity(na.id);
  };
  const removeActivity = (id) => {
    setEditingActivity(null);
    mutate(() => { setActivities((p) => p.filter((a) => a.id !== id)); setSessions((p) => p.filter((s) => s.activityId !== id)); });
  };
  const patchTemplate = (id, patch) => mutate(() => setTemplates((p) => p.map((tp) => (tp.id === id ? { ...tp, ...patch } : tp))));
  const addTemplate = () => { const nt = { id: uid(), label: "新しい定型文", text: "", auto: "none" }; mutate(() => setTemplates((p) => [...p, nt])); setEditingTemplate(nt.id); };
  const removeTemplate = (id) => { setEditingTemplate(null); mutate(() => setTemplates((p) => p.filter((tp) => tp.id !== id))); };

  /* ── diary composition context ── */
  const diaryCtx = { style, templates, place, viewDay, dayEnd, now, day, dayRecords, act };

  const openDiary = async () => {
    const key = dateKey(viewDay);
    if (diaries[key] != null) { setDiary(diaries[key]); setSaved(true); return; }
    await regenerate();
  };
  const regenerate = async () => {
    setDiaryBusy(true); setSaved(false); setCopied(false);
    const key = dateKey(viewDay);
    let w = weather[key];
    if (style.weather && !w) {
      try {
        if (!weatherLocation) throw new Error("no-location");
        const got = await fetchWeather(weatherLocation.lat, weatherLocation.lon, key, dateKey(Date.now()));
        if (got) { w = got; mutate(() => setWeather((prev) => ({ ...prev, [key]: got }))); }
      } catch (e) { w = null; }
    }
    let text = composeDiary(diaryCtx, byTime, w);
    if (style.weather && !w?.summary) text += "\n\n※天気は取得できませんでした。";
    setDiary(text); setDiaryBusy(false);
  };
  const insertTemplate = (tpl) => {
    const piece = fillPlaceholders(tpl.text, viewDay, weather[dateKey(viewDay)]);
    const el = areaRef.current;
    const pos = el && typeof el.selectionStart === "number" ? el.selectionStart : diary.length;
    setDiary(diary.slice(0, pos) + (pos > 0 && diary[pos - 1] !== "\n" ? "\n" : "") + piece + diary.slice(pos));
    setSaved(false);
  };
  const saveDiary = () => { mutate(() => setDiaries((p) => ({ ...p, [dateKey(viewDay)]: diary }))); setSaved(true); };
  const copyDiary = async () => {
    try { await navigator.clipboard.writeText(diary); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch (e) { setCopied(false); }
  };
  useEffect(() => { setDiary(null); setSaved(false); setBarTip(null); }, [viewDay]);

  /* ── weather location search ── */
  const runGeoSearch = async () => {
    const q = geoQuery.trim() || place.trim();
    if (!q) return;
    setGeoBusy(true); setGeoMsg(""); setGeoResults([]);
    try {
      const results = await geocodeCandidates(q);
      setGeoResults(results);
      if (!results.length) setGeoMsg("見つかりませんでした。別の書き方（例：東京都、大阪府）で試してください。");
    } catch (e) {
      setGeoMsg("検索に失敗しました。通信状況を確認してください。");
    }
    setGeoBusy(false);
  };
  const pickGeo = (r) => {
    mutate(() => setWeatherLocation({ lat: r.lat, lon: r.lon, label: r.label }));
    setGeoResults([]); setGeoMsg(`「${r.label}」を設定しました。`);
  };

  /* ── export / import ── */
  const exportJSON = () => JSON.stringify({ app: "timetrack", version: 3, activities, sessions, place, weatherLocation, weather, diaries, style, templates }, null, 2);

  const exportCSV = () => {
    const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [["行動", "開始日", "開始時刻", "終了日", "終了時刻", "分"].map(q).join(",")];
    [...sessions].sort((a, b) => a.start - b.start).forEach((s) => {
      const e = s.end;
      rows.push([
        act(s.activityId)?.name ?? "",
        dateKey(s.start), toTimeInput(s.start),
        e ? dateKey(e) : "", e ? toTimeInput(e) : "",
        e ? Math.round((e - s.start) / 60000) : "",
      ].map(q).join(","));
    });
    return rows.join("\n");
  };

  const exportDiaries = () =>
    Object.keys(diaries).sort().map((k) => diaries[k]).join("\n\n────────\n\n");

  const showData = (mode) => {
    setDataMode(mode);
    setDataCopied(false);
    setDataText(mode === "json" ? exportJSON() : mode === "csv" ? exportCSV() : exportDiaries());
  };

  const copyData = async () => {
    try { await navigator.clipboard.writeText(dataText); setDataCopied(true); setTimeout(() => setDataCopied(false), 1800); }
    catch (e) { setDataCopied(false); }
  };

  const parseImport = () => {
    const d = JSON.parse(importText);
    if (!d || !Array.isArray(d.sessions)) throw new Error("shape");
    return d;
  };

  const replaceAll = () => {
    try {
      const d = parseImport();
      mutate(() => {
        if (d.activities?.length) setActivities(d.activities.map(normalize));
        setSessions(d.sessions);
        if (d.place) setPlace(d.place);
        if (d.weatherLocation) setWeatherLocation(d.weatherLocation);
        if (d.weather) setWeather(d.weather);
        if (d.diaries) setDiaries(d.diaries);
        if (d.style) setStyle({ ...DEFAULT_STYLE, ...d.style });
        if (d.templates) setTemplates(d.templates);
      });
      setImportMsg("すべて読み込みました。");
      setImportText("");
    } catch (e) {
      setImportMsg("読み取れませんでした。書き出したJSONをそのまま貼ってください。");
    }
  };

  const mergeRecords = () => {
    try {
      const d = parseImport();
      const haveS = new Set(sessions.map((s) => s.id));
      const addS = d.sessions.filter((s) => !haveS.has(s.id));
      const haveA = new Set(activities.map((a) => a.id));
      const addA = (d.activities || []).filter((a) => !haveA.has(a.id)).map(normalize);
      mutate(() => {
        if (addA.length) setActivities((p) => [...p, ...addA]);
        setSessions((p) => [...p, ...addS]);
      });
      setImportMsg(`記録を${addS.length}件足しました。${addA.length ? `行動も${addA.length}件追加。` : ""}`);
      setImportText("");
    } catch (e) {
      setImportMsg("読み取れませんでした。書き出したJSONをそのまま貼ってください。");
    }
  };

  /* ── styles ── */
  const S = {
    shell: { background: PAPER, color: INK, minHeight: "100%", padding: "18px 16px 40px", fontFamily: "'Oswald','Hiragino Sans','Hiragino Kaku Gothic ProN','Yu Gothic',system-ui,sans-serif", maxWidth: 560, margin: "0 auto" },
    card: { background: CARD, border: `1px solid ${RULE}`, padding: "14px 14px 16px", marginBottom: 14 },
    label: { fontSize: 11, letterSpacing: "0.18em", color: MUTED, marginBottom: 10 },
    ghost: { background: "transparent", border: `1px solid ${RULE}`, color: MUTED, fontSize: 11, padding: "5px 8px" },
    input: { border: `1px solid ${RULE}`, padding: 6, fontSize: 13, background: PAPER, color: INK, fontFamily: "inherit" },
    divider: { borderTop: `1px solid ${RULE}`, marginTop: 26 },
  };
  const pill = (on) => ({ padding: "7px 12px", fontSize: 12, background: on ? INK : "transparent", color: on ? PAPER : MUTED, border: `1px solid ${on ? INK : RULE}` });

  if (!loaded) return html`<div style=${{ ...S.shell, color: MUTED, fontSize: 13 }}>記録を読み込んでいます…</div>`;

  const TABS = [["analysis", "分析"], ["records", "時間を修正"], ["settings", "設定"]];
  const hasSaved = diaries[dateKey(viewDay)] != null;
  const ea = editingActivity ? act(editingActivity) : null;
  const et = editingTemplate ? templates.find((x) => x.id === editingTemplate) : null;

  return html`
    <div style=${S.shell}>
      ${storageOK === false && html`
        <div style=${{ border: `2px solid ${ALERT}`, background: "rgba(176,58,46,.06)", padding: "12px 12px", marginBottom: 14, fontSize: 12, lineHeight: 1.7, color: INK }}>
          <b style=${{ color: ALERT }}>保存が効いていません。</b><br />
          この画面を閉じると記録が消えます。設定の「まるごと書き出す」でコピーして、メモアプリなどに残してください。次に開いたとき、貼り付けて戻せます。
        </div>`}

      <div style=${{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `2px solid ${INK}`, paddingBottom: 8, marginBottom: 14, gap: 8 }}>
        <button onClick=${() => setViewDay((d) => d - DAY)} style=${S.ghost} aria-label="前の日">◀</button>
        <div style=${{ textAlign: "center", flex: 1 }}>
          <div style=${{ fontSize: 15, letterSpacing: "0.04em" }}>${dateLabel(viewDay)}</div>
          ${!isToday && html`<button onClick=${() => setViewDay(todayStart)} style=${{ ...S.ghost, border: "none", padding: 0, marginTop: 2 }}>今日に戻る</button>`}
        </div>
        ${isToday ? html`<div style=${{ fontSize: 22, fontWeight: 300 }}>${hhmm(now)}</div>` : html`<button onClick=${() => setViewDay((d) => d + DAY)} style=${S.ghost} aria-label="次の日">▶</button>`}
      </div>

      <div style=${{ marginBottom: 16 }}>
        <div style=${{ position: "relative" }}>
          <div style=${{ position: "relative", height: 78, background: "#E7E9E5", border: `1px solid ${RULE}`, overflow: "hidden" }} onClick=${() => setBarTip(null)}>
            ${Array.from({ length: 25 }, (_, hh) => html`
              <div key=${hh} style=${{ position: "absolute", left: `${(hh / 24) * 100}%`, top: 0, width: 1, height: hh % 6 === 0 ? "100%" : 6, background: hh % 6 === 0 ? "rgba(22,32,43,.16)" : "rgba(22,32,43,.28)" }} />`)}
            ${slices.map(({ t0, t1, live }) => html`
              <div key=${t0} style=${{ position: "absolute", left: `${((t0 - viewDay) / DAY) * 100}%`, width: `${Math.max(((t1 - t0) / DAY) * 100, 0.25)}%`, top: 0, height: "100%", display: "flex", flexDirection: "column" }}>
                ${live.map((s, i) => html`
                  <div key=${s.id} onClick=${(e) => {
                      e.stopPropagation();
                      const a2 = act(s.activityId);
                      const durText = s.end == null ? "計測中" : dur(s.to - s.from);
                      const left = ((s.from + s.to) / 2 - viewDay) / DAY * 100;
                      setBarTip((prev) => (prev?.id === s.id ? null : { id: s.id, left, text: `${a2?.name ?? "—"}、${hhmm(s.from)}〜${hhmm(s.to)}（${durText}）` }));
                    }} style=${{ flex: 1, background: act(s.activityId)?.color ?? INK, borderTop: i > 0 ? "1px solid rgba(255,255,255,.6)" : "none", opacity: s.end == null ? 1 : 0.9 }} />`)}
              </div>`)}
            ${isToday && html`<div style=${{ position: "absolute", left: `${((now - viewDay) / DAY) * 100}%`, top: 0, width: 2, height: "100%", background: INK }} />`}
          </div>
          ${barTip && html`
            <div style=${{ position: "absolute", left: `${barTip.left}%`, transform: "translateX(-50%)", top: "100%", marginTop: 6, background: INK, color: PAPER, fontSize: 11, padding: "6px 10px", whiteSpace: "nowrap", zIndex: 5, fontVariantNumeric: "tabular-nums" }}>
              ${barTip.text}
            </div>`}
        </div>
        <div style=${{ display: "flex", justifyContent: "space-between", fontSize: 10, color: MUTED, marginTop: 4, letterSpacing: "0.08em" }}>
          ${[0, 6, 12, 18, 24].map((hh) => html`<span key=${hh}>${hh}</span>`)}
        </div>
      </div>

      ${isToday && running.length > 0 && html`
        <div style=${{ marginBottom: 14 }}>
          ${running.map((s) => {
            const a = act(s.activityId);
            return html`
              <div key=${s.id} style=${{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${RULE}` }}>
                <span style=${{ width: 8, height: 20, background: a?.color ?? INK, animation: "pulse 2.4s ease-in-out infinite", flexShrink: 0 }} />
                <span style=${{ fontSize: 13, flex: 1 }}>${a?.name ?? "—"}</span>
                <span style=${{ fontSize: 11, color: MUTED }}>${hhmm(s.start)}〜</span>
                <span style=${{ fontSize: 18, fontWeight: 300, fontVariantNumeric: "tabular-nums" }}>${clock(now - s.start)}</span>
              </div>`;
          })}
          ${running.length > 1 && html`<button onClick=${stopAll} style=${{ ...S.ghost, width: "100%", marginTop: 8, padding: 7 }}>すべて終了</button>`}
        </div>`}

      ${isToday ? html`
        <div style=${{ marginBottom: 14 }}>
          ${activities.map((a) => {
            const on = isRunning(a.id);
            return html`
              <div key=${a.id} style=${{ display: "flex", marginBottom: 8, background: on ? a.color : CARD, border: `1px solid ${on ? a.color : RULE}`, borderLeft: `6px solid ${a.color}`, color: on ? "#fff" : INK }}>
                <button onClick=${() => tapMain(a.id)} style=${{ flex: 1, padding: "17px 12px", textAlign: "left", background: "transparent", border: "none", color: "inherit", fontSize: 15, letterSpacing: "0.04em" }}>
                  ${a.name}
                  <span style=${{ display: "block", fontSize: 10, letterSpacing: "0.12em", marginTop: 3, opacity: on ? 0.85 : 0.45 }}>
                    ${on ? "計測中 — 押すと終了" : running.length ? "押すと切り替え" : "押すと開始"}
                  </span>
                </button>
                ${on ? html`
                  <button onClick=${() => stop(a.id)} aria-label=${`${a.name}を終了`} style=${{ width: 62, background: "rgba(0,0,0,.16)", border: "none", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3 }}>
                    <${IconStop} /><span style=${{ fontSize: 10, letterSpacing: "0.1em" }}>終了</span>
                  </button>` : html`
                  <button onClick=${() => start(a.id, false)} aria-label=${`${a.name}を同時に開始`} title="いまの計測を続けたまま、並行して始める" style=${{ width: 62, background: running.length ? "rgba(22,32,43,.05)" : "transparent", border: "none", borderLeft: `1px solid ${RULE}`, color: INK, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3 }}>
                    <${IconParallel} /><span style=${{ fontSize: 10, letterSpacing: "0.08em", color: MUTED }}>同時</span>
                  </button>`}
              </div>`;
          })}
        </div>` : html`
        <div style=${{ border: `1px dashed ${RULE}`, padding: "14px 12px", fontSize: 12, color: MUTED, marginBottom: 14, lineHeight: 1.7 }}>
          ${isFuture ? "未来の日付です。" : "過去の日付です。"}計測の開始はできません。記録は「時間を修正」から手入力で足せます。
        </div>`}

      <button onClick=${openDiary} disabled=${diaryBusy} style=${{ width: "100%", padding: 16, background: diaryBusy ? MUTED : INK, color: PAPER, border: "none", fontSize: 15, letterSpacing: "0.14em", marginBottom: 14 }}>
        ${diaryBusy ? "天気を調べています…" : hasSaved ? "保存した日記を開く" : "日記に変換"}
      </button>

      ${diary !== null && html`
        <div style=${S.card}>
          <div style=${{ ...S.label, display: "flex", justifyContent: "space-between" }}>
            <span>日記</span>${saved && html`<span style=${{ color: MUTED }}>保存済み</span>`}
          </div>
          <textarea ref=${areaRef} value=${diary} onInput=${(e) => { setDiary(e.target.value); setSaved(false); }} rows=${Math.min(20, diary.split("\n").length + 3)}
            style=${{ width: "100%", border: `1px solid ${RULE}`, background: PAPER, color: INK, padding: 10, fontSize: 14, lineHeight: 1.8, fontFamily: "'Hiragino Sans','Yu Gothic',system-ui,sans-serif", resize: "vertical" }} />
          ${templates.filter((x) => x.text.trim()).length > 0 && html`
            <div style=${{ marginTop: 8 }}>
              <div style=${{ fontSize: 10, color: MUTED, marginBottom: 5 }}>カーソルの位置に差し込む</div>
              <div style=${{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                ${templates.filter((x) => x.text.trim()).map((x) => html`
                  <button key=${x.id} onClick=${() => insertTemplate(x)} style=${{ ...S.ghost, color: INK }}>＋${x.label}</button>`)}
              </div>
            </div>`}
          <div style=${{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            <button onClick=${saveDiary} style=${{ flex: 1, minWidth: 100, padding: 10, background: saved ? CARD : INK, color: saved ? MUTED : PAPER, border: `1px solid ${saved ? RULE : INK}`, fontSize: 13 }}>${saved ? "保存されています" : "保存"}</button>
            <button onClick=${copyDiary} style=${{ padding: "10px 14px", background: CARD, border: `1px solid ${INK}`, fontSize: 13 }}>${copied ? "コピーしました" : "コピー"}</button>
            <button onClick=${regenerate} style=${{ ...S.ghost, padding: "10px 12px", fontSize: 12 }}>作り直す</button>
            <button onClick=${() => setDiary(null)} style=${{ ...S.ghost, padding: "10px 12px", fontSize: 12 }}>閉じる</button>
          </div>
        </div>`}

      <div style=${{ display: "flex", gap: 6, marginTop: 20 }}>
        ${TABS.map(([k, label]) => {
          const open = panel === k;
          return html`<button key=${k} onClick=${() => setPanel(open ? null : k)} aria-expanded=${open} style=${{ flex: 1, padding: "10px 6px", background: open ? INK : "transparent", color: open ? PAPER : MUTED, border: `1px solid ${open ? INK : RULE}`, fontSize: 12, letterSpacing: "0.08em" }}>${label} ${open ? "▲" : "▼"}</button>`;
        })}
      </div>

      ${panel === "analysis" && html`
        <div style=${{ ...S.card, marginTop: 14 }}>
          <div style=${S.label}>${dateLabel(viewDay)}の合計</div>
          ${byLength.length === 0 ? html`<div style=${{ fontSize: 13, color: MUTED }}>記録がありません。</div>` : byLength.map((x) => html`
            <div key=${x.id} style=${{ marginBottom: 10 }}>
              <div style=${{ display: "flex", fontSize: 13, marginBottom: 3 }}>
                <span style=${{ flex: 1 }}>${x.name}</span>
                <span style=${{ color: MUTED, fontVariantNumeric: "tabular-nums" }}>${dur(x.ms)}</span>
              </div>
              <div style=${{ height: 8, background: "#E7E9E5" }}><div style=${{ width: `${(x.ms / maxTotal) * 100}%`, height: "100%", background: x.color }} /></div>
            </div>`)}
          <div style=${{ ...S.label, marginTop: 22 }}>この日までの7日間</div>
          ${weekTotals.length === 0 ? html`<div style=${{ fontSize: 13, color: MUTED }}>記録がありません。</div>` : weekTotals.map((x) => html`
            <div key=${x.id} style=${{ marginBottom: 10 }}>
              <div style=${{ display: "flex", fontSize: 13, marginBottom: 3 }}>
                <span style=${{ flex: 1 }}>${x.name}</span>
                <span style=${{ color: MUTED, fontVariantNumeric: "tabular-nums" }}>${dur(x.ms)}　<span style=${{ fontSize: 11 }}>（1日平均 ${dur(x.ms / 7)}）</span></span>
              </div>
              <div style=${{ height: 8, background: "#E7E9E5" }}><div style=${{ width: `${(x.ms / maxWeek) * 100}%`, height: "100%", background: x.color }} /></div>
            </div>`)}
        </div>`}

      ${panel === "records" && html`
        <div style=${{ ...S.card, marginTop: 14 }}>
          <div style=${S.label}>記録を足す</div>
          <div style=${{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            ${activities.map((a) => {
              const on = draftActivity === a.id;
              return html`<button key=${a.id} onClick=${() => setDraft((d) => ({ ...d, activityId: a.id }))} style=${{ padding: "8px 13px", fontSize: 13, background: on ? a.color : "transparent", color: on ? "#fff" : INK, border: `2px solid ${a.color}` }}>${a.name}</button>`;
            })}
          </div>
          <div style=${{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <span style=${{ fontSize: 11, color: MUTED, width: 28 }}>開始</span>
            ${useChain ? html`
              <span style=${{ fontSize: 15, fontVariantNumeric: "tabular-nums" }}>${hhmm(chainStart)}</span>
              <span style=${{ fontSize: 11, color: MUTED }}>直前の記録の続き</span>
              <button onClick=${() => setDraft((d) => ({ ...d, manual: true, start: toTimeInput(chainStart) }))} style=${S.ghost}>時刻を変える</button>
              ` : html`
              <input type="time" value=${draft.start || "09:00"} onInput=${(e) => setDraft((d) => ({ ...d, start: e.target.value }))} style=${S.input} />
              ${chainStart != null && !draft.parallel && html`<button onClick=${() => setDraft((d) => ({ ...d, manual: false }))} style=${S.ghost}>直前の続きに戻す</button>`}
              `}
          </div>
          <div style=${{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <span style=${{ fontSize: 11, color: MUTED, width: 28 }}>終了</span>
            <input type="time" value=${draft.end} onInput=${(e) => setDraft((d) => ({ ...d, end: e.target.value }))} style=${S.input} />
            <button onClick=${addManual} disabled=${!draft.end} style=${{ padding: "9px 18px", background: draft.end ? INK : RULE, color: PAPER, border: "none", fontSize: 13 }}>追加</button>
          </div>
          <button onClick=${() => setDraft((d) => ({ ...d, parallel: !d.parallel, manual: !d.parallel }))} style=${pill(draft.parallel)}>同時進行の記録として足す</button>
          <div style=${{ fontSize: 10, color: MUTED, marginTop: 8, lineHeight: 1.6 }}>終了が開始より前なら、翌日にまたがる記録として追加します。<br />続けて足していくと、そのつど直前の終了時刻から始まります。</div>

          <div style=${{ ...S.label, marginTop: 24 }}>${dateLabel(viewDay)}の記録</div>
          ${dayRecords.length === 0 && html`<div style=${{ fontSize: 13, color: MUTED }}>記録がありません。</div>`}
          ${dayRecords.map((s) => {
            const pb = prevBoundary(s), nb = nextBoundary(s), broken = !valid(s);
            return html`
              <div key=${s.id} style=${{ padding: "10px 0", borderBottom: `1px solid ${RULE}`, background: broken ? "rgba(176,58,46,.06)" : "transparent" }}>
                <div style=${{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style=${{ width: 8, height: 20, background: act(s.activityId)?.color, flexShrink: 0 }} />
                  <span style=${{ fontSize: 14, flex: 1 }}>${act(s.activityId)?.name}</span>
                  <button onClick=${() => removeSession(s.id)} style=${S.ghost}>削除</button>
                </div>
                <div style=${{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                  <span style=${{ fontSize: 11, color: MUTED, width: 28 }}>開始</span>
                  <input type="time" value=${toTimeInput(s.start)} onInput=${(e) => setTime(s.id, "start", e.target.value)} style=${S.input} />
                  <span style=${{ fontSize: 10, color: MUTED }}>${dateLabel(s.start)}</span>
                  <button onClick=${() => nudgeDay(s.id, "start", -1)} style=${S.ghost}>−1日</button>
                  ${pb != null && html`<button onClick=${() => snap(s.id, "start", pb)} style=${{ ...S.ghost, color: INK }}>直前に合わせる（${hhmm(pb)}）</button>`}
                </div>
                <div style=${{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <span style=${{ fontSize: 11, color: MUTED, width: 28 }}>終了</span>
                  ${s.end == null ? html`<span style=${{ fontSize: 12, color: MUTED }}>計測中</span>` : html`
                    <input type="time" value=${toTimeInput(s.end)} onInput=${(e) => setTime(s.id, "end", e.target.value)} style=${S.input} />
                    <span style=${{ fontSize: 10, color: MUTED }}>${dateLabel(s.end)}</span>
                    <button onClick=${() => nudgeDay(s.id, "end", -1)} style=${S.ghost}>−1日</button>
                    <button onClick=${() => nudgeDay(s.id, "end", 1)} style=${S.ghost}>+1日</button>
                    ${nb != null && html`<button onClick=${() => snap(s.id, "end", nb)} style=${{ ...S.ghost, color: INK }}>直後に合わせる（${hhmm(nb)}）</button>`}
                  `}
                </div>
                ${broken && html`
                  <div style=${{ fontSize: 11, color: ALERT, marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
                    終了が開始より前です。
                    <button onClick=${() => fixEnd(s.id)} style=${{ ...S.ghost, color: ALERT, borderColor: ALERT }}>翌日の終了にする</button>
                  </div>`}
              </div>`;
          })}
        </div>`}

      ${panel === "settings" && html`
        <div style=${{ ...S.card, marginTop: 14 }}>
          <div style=${S.label}>行動ボタン（タップで編集）</div>
          <div style=${{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            ${activities.map((a) => {
              const on = editingActivity === a.id;
              return html`<button key=${a.id} onClick=${() => { setEditingActivity(on ? null : a.id); setShowWords(false); }} style=${{ padding: "9px 14px", fontSize: 14, background: on ? a.color : "transparent", color: on ? "#fff" : INK, border: `2px solid ${a.color}`, opacity: a.diary === "off" ? 0.55 : 1 }}>${a.name}</button>`;
            })}
            <button onClick=${addActivity} style=${{ padding: "9px 14px", fontSize: 14, background: "transparent", border: `1px dashed ${MUTED}`, color: MUTED }}>＋追加</button>
          </div>

          ${ea && html`
            <div style=${{ marginTop: 16, borderTop: `1px solid ${RULE}`, paddingTop: 14 }}>
              <input value=${ea.name} onInput=${(e) => patchActivity(ea.id, { name: e.target.value })} style=${{ ...S.input, width: "100%", fontSize: 15, padding: 9 }} />
              <div style=${{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                ${SWATCHES.map((c) => html`<button key=${c} onClick=${() => patchActivity(ea.id, { color: c })} aria-label=${`色を変更 ${c}`} style=${{ width: 28, height: 28, background: c, border: ea.color === c ? `2px solid ${INK}` : "1px solid rgba(0,0,0,.1)" }} />`)}
              </div>

              <div style=${{ ...S.label, marginTop: 18 }}>日記での書き方</div>
              <div style=${{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                ${FORMS.map(([k, label]) => html`<button key=${k} onClick=${() => patchActivity(ea.id, { diary: k })} style=${pill(ea.diary === k)}>${label}</button>`)}
              </div>

              <div style=${{ marginTop: 12, padding: "10px 12px", background: PAPER, border: `1px solid ${RULE}`, fontSize: 14, lineHeight: 1.7, fontFamily: "'Hiragino Sans','Yu Gothic',system-ui,sans-serif" }}>
                ${previewOf(style, ea, viewDay)}
              </div>

              ${ea.diary === "span" && html`
                <div style=${{ ...S.label, marginTop: 18 }}>使う言葉</div>
                <div style=${{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  ${VERB_PRESETS.map((v) => html`<button key=${v.plain} onClick=${() => patchActivity(ea.id, { verbPlain: v.plain, verbPolite: v.polite })} style=${pill(ea.verbPlain === v.plain)}>${v.plain}</button>`)}
                </div>
                <div style=${{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <label style=${{ fontSize: 10, color: MUTED }}>〜た形<input value=${ea.verbPlain || ""} onInput=${(e) => patchActivity(ea.id, { verbPlain: e.target.value })} style=${{ ...S.input, display: "block", width: 120, marginTop: 3 }} /></label>
                  <label style=${{ fontSize: 10, color: MUTED }}>〜ました形<input value=${ea.verbPolite || ""} onInput=${(e) => patchActivity(ea.id, { verbPolite: e.target.value })} style=${{ ...S.input, display: "block", width: 120, marginTop: 3 }} /></label>
                </div>
                <div style=${{ display: "flex", gap: 6, marginTop: 12 }}>
                  <button onClick=${() => patchActivity(ea.id, { showTotal: ea.showTotal === false })} style=${pill(ea.showTotal !== false)}>合計を出す</button>
                  <button onClick=${() => patchActivity(ea.id, { timeFirst: !ea.timeFirst })} style=${pill(!!ea.timeFirst)}>時間を先に書く</button>
                </div>
              `}

              ${ea.diary === "points" && html`
                <div style=${{ ...S.label, marginTop: 18 }}>開始の言葉</div>
                <div style=${{ display: "flex", gap: 6, marginBottom: 8 }}>
                  ${["に", "から"].map((p) => html`<button key=${p} onClick=${() => patchActivity(ea.id, { sp: p })} style=${pill((ea.sp || "に") === p)}>◯時${p}</button>`)}
                </div>
                <div style=${{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  ${START_PRESETS.map((w) => html`<button key=${w.join} onClick=${() => patchActivity(ea.id, { startWord: w })} style=${pill(ea.startWord?.join === w.join)}>${w.join}</button>`)}
                </div>

                <div style=${{ ...S.label, marginTop: 18 }}>終了の言葉</div>
                <div style=${{ display: "flex", gap: 6, marginBottom: 8 }}>
                  ${["に", "まで"].map((p) => html`<button key=${p} onClick=${() => patchActivity(ea.id, { ep: p })} style=${pill((ea.ep || "に") === p)}>◯時${p}</button>`)}
                </div>
                <div style=${{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  ${END_PRESETS.map((w) => html`<button key=${w.plain} onClick=${() => patchActivity(ea.id, { endWord: w })} style=${pill(ea.endWord?.plain === w.plain)}>${w.plain}</button>`)}
                </div>

                <button onClick=${() => patchActivity(ea.id, { showName: !ea.showName })} style=${{ ...pill(!!ea.showName), marginTop: 12 }}>文の頭に「${ea.name}は」を付ける</button>

                <button onClick=${() => setShowWords(!showWords)} style=${{ ...S.ghost, display: "block", marginTop: 12 }}>${showWords ? "言葉の細かい設定を閉じる" : "言葉を自分で書く"}</button>
                ${showWords && html`
                  <div style=${{ marginTop: 10, padding: 12, background: PAPER, border: `1px solid ${RULE}` }}>
                    <div style=${{ fontSize: 10, color: MUTED, lineHeight: 1.7, marginBottom: 8 }}>
                      つなぐ形は「9時に<b>出発して</b>、10時に到着した」の部分。<br />
                      言い切る形は、その日に片方しか記録がないとき（「9時に<b>出発した</b>」）に使います。
                    </div>
                    <div style=${{ fontSize: 11, color: MUTED, marginBottom: 4 }}>開始</div>
                    <div style=${{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                      <label style=${{ fontSize: 10, color: MUTED }}>つなぐ形<input value=${ea.startWord?.join || ""} onInput=${(e) => patchActivity(ea.id, { startWord: { ...ea.startWord, join: e.target.value } })} style=${{ ...S.input, display: "block", width: 100, marginTop: 3 }} /></label>
                      <label style=${{ fontSize: 10, color: MUTED }}>〜た形<input value=${ea.startWord?.plain || ""} onInput=${(e) => patchActivity(ea.id, { startWord: { ...ea.startWord, plain: e.target.value } })} style=${{ ...S.input, display: "block", width: 100, marginTop: 3 }} /></label>
                      <label style=${{ fontSize: 10, color: MUTED }}>〜ました形<input value=${ea.startWord?.polite || ""} onInput=${(e) => patchActivity(ea.id, { startWord: { ...ea.startWord, polite: e.target.value } })} style=${{ ...S.input, display: "block", width: 100, marginTop: 3 }} /></label>
                    </div>
                    <div style=${{ fontSize: 11, color: MUTED, marginBottom: 4 }}>終了</div>
                    <div style=${{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <label style=${{ fontSize: 10, color: MUTED }}>〜た形<input value=${ea.endWord?.plain || ""} onInput=${(e) => patchActivity(ea.id, { endWord: { ...ea.endWord, plain: e.target.value } })} style=${{ ...S.input, display: "block", width: 100, marginTop: 3 }} /></label>
                      <label style=${{ fontSize: 10, color: MUTED }}>〜ました形<input value=${ea.endWord?.polite || ""} onInput=${(e) => patchActivity(ea.id, { endWord: { ...ea.endWord, polite: e.target.value } })} style=${{ ...S.input, display: "block", width: 100, marginTop: 3 }} /></label>
                    </div>
                  </div>`}
              `}

              ${ea.diary === "name" && html`
                <div style=${{ ...S.label, marginTop: 18 }}>使う言葉</div>
                <div style=${{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  <button onClick=${() => patchActivity(ea.id, { verbPlain: "", verbPolite: "" })} style=${pill(!ea.verbPlain)}>なし</button>
                  ${VERB_PRESETS.map((v) => html`<button key=${v.plain} onClick=${() => patchActivity(ea.id, { verbPlain: v.plain, verbPolite: v.polite })} style=${pill(ea.verbPlain === v.plain)}>${v.plain}</button>`)}
                </div>
                <div style=${{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <label style=${{ fontSize: 10, color: MUTED }}>〜た形<input value=${ea.verbPlain || ""} onInput=${(e) => patchActivity(ea.id, { verbPlain: e.target.value })} style=${{ ...S.input, display: "block", width: 120, marginTop: 3 }} /></label>
                  <label style=${{ fontSize: 10, color: MUTED }}>〜ました形<input value=${ea.verbPolite || ""} onInput=${(e) => patchActivity(ea.id, { verbPolite: e.target.value })} style=${{ ...S.input, display: "block", width: 120, marginTop: 3 }} /></label>
                </div>
              `}

              ${ea.diary !== "off" && html`
                <button onClick=${() => patchActivity(ea.id, { inIntro: ea.inIntro === false })} style=${{ ...pill(ea.inIntro !== false), marginTop: 12 }}>はじめの一文に名前を入れる</button>
              `}

              <div style=${{ display: "flex", gap: 8, marginTop: 16 }}>
                <button onClick=${() => setEditingActivity(null)} style=${{ ...S.ghost, flex: 1, padding: 9, fontSize: 12 }}>閉じる</button>
                <button onClick=${() => removeActivity(ea.id)} style=${{ ...S.ghost, color: ALERT, borderColor: ALERT, padding: 9, fontSize: 12 }}>この行動を削除</button>
              </div>
            </div>`}

          <div style=${S.divider} />
          <div style=${{ ...S.label, marginTop: 18 }}>定型文</div>
          <div style=${{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            ${templates.map((x) => {
              const on = editingTemplate === x.id;
              return html`
                <button key=${x.id} onClick=${() => setEditingTemplate(on ? null : x.id)} style=${{ padding: "9px 14px", fontSize: 13, background: on ? INK : "transparent", color: on ? PAPER : INK, border: `1px solid ${on ? INK : RULE}` }}>
                  ${x.label}${x.auto !== "none" && html`<span style=${{ fontSize: 10, marginLeft: 6, opacity: 0.7 }}>${x.auto === "top" ? "先頭" : "末尾"}</span>`}
                </button>`;
            })}
            <button onClick=${addTemplate} style=${{ padding: "9px 14px", fontSize: 13, background: "transparent", border: `1px dashed ${MUTED}`, color: MUTED }}>＋追加</button>
          </div>

          ${et && html`
            <div style=${{ marginTop: 14, borderTop: `1px solid ${RULE}`, paddingTop: 14 }}>
              <input value=${et.label} onInput=${(e) => patchTemplate(et.id, { label: e.target.value })} placeholder="呼び名" style=${{ ...S.input, width: "100%", fontSize: 14, padding: 8 }} />
              <textarea value=${et.text} onInput=${(e) => patchTemplate(et.id, { text: e.target.value })} rows="3" placeholder="日記に差し込む文章"
                style=${{ ...S.input, width: "100%", marginTop: 8, fontSize: 14, lineHeight: 1.7, fontFamily: "'Hiragino Sans','Yu Gothic',system-ui,sans-serif", resize: "vertical" }} />
              <div style=${{ fontSize: 10, color: MUTED, marginTop: 6 }}>文中に {"{日付}"} {"{天気}"} {"{曜日}"} と書くと置き換わります。</div>
              <div style=${{ ...S.label, marginTop: 14 }}>自動で入れる位置</div>
              <div style=${{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                ${[["none", "入れない"], ["top", "先頭"], ["bottom", "末尾"]].map(([k, label]) => html`<button key=${k} onClick=${() => patchTemplate(et.id, { auto: k })} style=${pill(et.auto === k)}>${label}</button>`)}
              </div>
              <div style=${{ display: "flex", gap: 8, marginTop: 14 }}>
                <button onClick=${() => setEditingTemplate(null)} style=${{ ...S.ghost, flex: 1, padding: 9, fontSize: 12 }}>閉じる</button>
                <button onClick=${() => removeTemplate(et.id)} style=${{ ...S.ghost, color: ALERT, borderColor: ALERT, padding: 9, fontSize: 12 }}>削除</button>
              </div>
            </div>`}

          <div style=${S.divider} />
          <div style=${{ ...S.label, marginTop: 18 }}>日記全体の書き方</div>
          <div style=${{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
            <button onClick=${() => mutate(() => setStyle((s) => ({ ...s, tone: "polite" })))} style=${pill(style.tone === "polite")}>〜ました</button>
            <button onClick=${() => mutate(() => setStyle((s) => ({ ...s, tone: "plain" })))} style=${pill(style.tone === "plain")}>〜た</button>
          </div>
          <div style=${{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
            <button onClick=${() => mutate(() => setStyle((s) => ({ ...s, timeFmt: "colon" })))} style=${pill(style.timeFmt === "colon")}>9:30</button>
            <button onClick=${() => mutate(() => setStyle((s) => ({ ...s, timeFmt: "kanji" })))} style=${pill(style.timeFmt === "kanji")}>9時30分</button>
          </div>
          <div style=${{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick=${() => mutate(() => setStyle((s) => ({ ...s, weather: !s.weather })))} style=${pill(style.weather)}>天気</button>
            <button onClick=${() => mutate(() => setStyle((s) => ({ ...s, intro: !s.intro })))} style=${pill(style.intro)}>はじめの一文</button>
            <button onClick=${() => mutate(() => setStyle((s) => ({ ...s, summary: !s.summary })))} style=${pill(style.summary)}>まとめの一文</button>
          </div>

          <div style=${{ fontSize: 10, color: MUTED, marginTop: 18, marginBottom: 6 }}>同時進行だった記録の書き方（片方がもう片方にすっぽり収まっている時だけ）</div>
          <div style=${{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick=${() => mutate(() => setStyle((s) => ({ ...s, overlapPhrase: "none" })))} style=${pill((style.overlapPhrase || "none") === "none")}>そのまま別々に書く</button>
            <button onClick=${() => mutate(() => setStyle((s) => ({ ...s, overlapPhrase: "chu" })))} style=${pill(style.overlapPhrase === "chu")}>◯◯中に◯◯</button>
            <button onClick=${() => mutate(() => setStyle((s) => ({ ...s, overlapPhrase: "tochu" })))} style=${pill(style.overlapPhrase === "tochu")}>◯◯の途中で◯◯</button>
            <button onClick=${() => mutate(() => setStyle((s) => ({ ...s, overlapPhrase: "nagara" })))} style=${pill(style.overlapPhrase === "nagara")}>◯◯をしながら◯◯</button>
          </div>

          <div style=${S.divider} />
          <div style=${{ ...S.label, marginTop: 18 }}>天気を調べる場所</div>
          <input value=${place} onInput=${(e) => mutate(() => setPlace(e.target.value))} style=${{ ...S.input, width: "100%", fontSize: 14, padding: 9 }} placeholder="日記に載る地名（例：東京都）" />
          <div style=${{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <input value=${geoQuery} onInput=${(e) => setGeoQuery(e.target.value)} style=${{ ...S.input, flex: 1, minWidth: 140 }} placeholder="検索する地名（例：東京都、大阪府）" />
            <button onClick=${runGeoSearch} disabled=${geoBusy} style=${{ padding: "9px 16px", background: INK, color: PAPER, border: "none", fontSize: 13 }}>${geoBusy ? "検索中…" : "検索"}</button>
          </div>
          ${geoResults.length > 0 && html`
            <div style=${{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              ${geoResults.map((r, i) => html`
                <button key=${i} onClick=${() => pickGeo(r)} style=${{ ...S.ghost, textAlign: "left", color: INK, padding: "8px 10px" }}>${r.label}</button>`)}
            </div>`}
          ${geoMsg && html`<div style=${{ fontSize: 11, color: MUTED, marginTop: 6 }}>${geoMsg}</div>`}
          <div style=${{ fontSize: 12, marginTop: 10, padding: "8px 10px", border: `1px solid ${RULE}`, background: PAPER }}>
            ${weatherLocation ? html`現在の設定：<b>${weatherLocation.label}</b>` : "天気の場所が未設定です。検索して選んでください。"}
          </div>

          <div style=${{ ...S.label, marginTop: 26 }}>保存の状態</div>
          <div style=${{ fontSize: 12, color: storageOK === false ? ALERT : INK, lineHeight: 1.7, border: `1px solid ${RULE}`, padding: "10px 12px", background: PAPER }}>
            ${storageOK === false
              ? "保存できていません。閉じると消えます。"
              : restored
              ? `前回の記録を読み込みました。保存は効いています。（${storageBackend() === "indexeddb" ? "端末内データベース" : "端末内ストレージ"}）`
              : "新しく始めました。次に開いたときここに「読み込みました」と出れば、保存できています。"}
          </div>

          <div style=${{ ...S.label, marginTop: 26 }}>記録の持ち出し</div>
          <div style=${{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick=${() => showData("json")} style=${pill(dataText !== null && dataMode === "json")}>まるごと書き出す</button>
            <button onClick=${() => showData("csv")} style=${pill(dataText !== null && dataMode === "csv")}>表計算用（CSV）</button>
            <button onClick=${() => showData("diary")} style=${pill(dataText !== null && dataMode === "diary")}>日記だけ</button>
          </div>

          ${dataText !== null && html`
            <div style=${{ marginTop: 10 }}>
              <textarea
                readOnly
                value=${dataText}
                rows="8"
                onFocus=${(e) => e.target.select()}
                style=${{ ...S.input, width: "100%", fontSize: 11, lineHeight: 1.5, fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace", resize: "vertical" }}
              />
              <div style=${{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                <button onClick=${copyData} style=${{ flex: 1, minWidth: 110, padding: 10, background: dataCopied ? CARD : INK, color: dataCopied ? MUTED : PAPER, border: `1px solid ${dataCopied ? RULE : INK}`, fontSize: 13 }}>
                  ${dataCopied ? "コピーしました" : "すべてコピー"}
                </button>
                <button onClick=${() => setDataText(null)} style=${{ ...S.ghost, padding: "10px 12px", fontSize: 12 }}>閉じる</button>
              </div>
              <div style=${{ fontSize: 10, color: MUTED, marginTop: 6, lineHeight: 1.6 }}>
                ${dataMode === "json"
                  ? "コピーしてメモアプリなどに貼っておけば、別の場所へ移すときに丸ごと戻せます。"
                  : dataMode === "csv"
                  ? "表計算アプリに貼ると、そのまま表になります。戻すことはできません。"
                  : "保存した日記をまとめて書き出します。"}
              </div>
            </div>`}

          <div style=${{ ...S.label, marginTop: 22 }}>書き出したものを読み込む</div>
          <textarea
            value=${importText}
            onInput=${(e) => { setImportText(e.target.value); setImportMsg(""); }}
            rows="3"
            placeholder="ここに「まるごと書き出す」の中身を貼る"
            style=${{ ...S.input, width: "100%", fontSize: 11, lineHeight: 1.5, fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace", resize: "vertical" }}
          />
          <div style=${{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            <button onClick=${mergeRecords} disabled=${!importText.trim()} style=${{ ...S.ghost, color: importText.trim() ? INK : MUTED, padding: "9px 12px", fontSize: 12 }}>記録だけ足す</button>
            <button onClick=${replaceAll} disabled=${!importText.trim()} style=${{ ...S.ghost, color: importText.trim() ? ALERT : MUTED, borderColor: importText.trim() ? ALERT : RULE, padding: "9px 12px", fontSize: 12 }}>すべて置き換える</button>
          </div>
          ${importMsg && html`<div style=${{ fontSize: 11, color: MUTED, marginTop: 8 }}>${importMsg}</div>`}
          <div style=${{ fontSize: 10, color: MUTED, marginTop: 6, lineHeight: 1.6 }}>
            「すべて置き換える」は、いまの記録と設定を消して入れ替えます。先に書き出してから使ってください。
          </div>
        </div>`}
    </div>`;
}

render(html`<${App} />`, document.getElementById("root"));

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
