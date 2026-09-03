import { h, render } from "./vendor/preact.mjs";
import { useState, useEffect, useRef } from "./vendor/hooks.mjs";
import htmFactory from "./vendor/htm.mjs";
const html = htmFactory.bind(h);

import {
  INK, PAPER, CARD, RULE, MUTED, ALERT, SWATCHES,
  PARTICLES, SP_PARTICLES, EP_PARTICLES, NAME_POS,
  START_PRESETS, END_PRESETS, OVERLAP_WORDS, wordKey,
  DEFAULT_ACTIVITIES, DEFAULT_STYLE, DEFAULT_TEMPLATES, STORE_KEY, FORMS,
  OVERLAP_STYLE_MIGRATE, normalize, uid,
} from "./constants.js";
import {
  DAY, startOfDay, hhmm, clock, dur, WEEK, dateLabel, fullDateLabel, dateKey,
  toTimeInput, onDay, onDate, previewOf, previewHalf, fillPlaceholders, composeDiary, fmtTime,
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

/* 保存データの「終了の言葉」に、あとから追加した「つなげる形」が無ければ
   用意されている言葉から補う（normalize()の行動ごとの補完と同じ考え方）。 */
const backfillEndWordLinks = (words) => words.map((w) => {
  if (w.link) return w;
  const preset = END_PRESETS.find((p) => p.plain === w.plain);
  return preset?.link ? { ...w, link: preset.link } : w;
});

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
  const [startWords, setStartWords] = useState(START_PRESETS);
  const [endWords, setEndWords] = useState(END_PRESETS);
  const [overlapWords, setOverlapWords] = useState(OVERLAP_WORDS);
  const [particles, setParticles] = useState(PARTICLES);
  const [newWord, setNewWord] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [viewDay, setViewDay] = useState(() => startOfDay(Date.now()));
  const [loaded, setLoaded] = useState(false);
  const [panel, setPanel] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(null); // 設定タブ内、開いている小見出し（"diary" | "activities" | "data" | null）
  const [editingActivity, setEditingActivity] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(null);
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
  const [dragging, setDragging] = useState(false);
  const [probe, setProbe] = useState(null);
  const [fixing, setFixing] = useState(null);
  const [lastStopped, setLastStopped] = useState(null); // { sessionId, activityId, at }
  const [probeEditing, setProbeEditing] = useState(null); // session id being edited in the probe panel
  const [probeAdd, setProbeAdd] = useState(null); // { activityId, end } draft for "add a record here"
  const [endDraft, setEndDraft] = useState("");
  const [geoQuery, setGeoQuery] = useState("");
  const [geoResults, setGeoResults] = useState([]);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoMsg, setGeoMsg] = useState("");
  const dirty = useRef(false);
  const tapeRef = useRef(null);
  const areaRef = useRef(null);
  const editSeq = useRef(0); // mutate() のたびに増える。日記が古くなっていないかの判定に使う
  const diaryGenSeq = useRef(null); // 表示中の日記(diary)を作った/開いた時点の editSeq

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  useEffect(() => {
    (async () => {
      const ok = await checkStorage();
      setStorageOK(ok);
      if (ok) {
        try {
          const d = await loadData(STORE_KEY);
          if (d) {
            /* 以前の「重なりの書き方」は日記全体の設定ひとつだったので、
               行動ごとの初期値としてすべての行動に引き継ぐ */
            const migratedOverlap = d.style?.overlapPhrase != null
              ? (OVERLAP_STYLE_MIGRATE[d.style.overlapPhrase] ?? "の途中で")
              : undefined;
            if (d.activities?.length) setActivities(d.activities.map((a) => normalize(a, migratedOverlap)));
            if (d.sessions) setSessions(d.sessions);
            if (d.place) setPlace(d.place);
            if (d.weatherLocation) setWeatherLocation(d.weatherLocation);
            if (d.weather) setWeather(d.weather);
            if (d.diaries) setDiaries(d.diaries);
            if (d.style) setStyle({ ...DEFAULT_STYLE, ...d.style });
            if (d.templates) setTemplates(d.templates);
            if (d.startWords?.length) setStartWords(d.startWords);
            if (d.endWords?.length) setEndWords(backfillEndWordLinks(d.endWords));
            if (d.particles?.length) setParticles(d.particles);
            const baseOverlapWords = d.overlapWords?.length ? d.overlapWords : OVERLAP_WORDS;
            setOverlapWords(migratedOverlap && !baseOverlapWords.includes(migratedOverlap) ? [...baseOverlapWords, migratedOverlap] : baseOverlapWords);
            setRestored(true);
          }
        } catch (e) { /* 初回、または保存データなし */ }
      }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded || !dirty.current) return;
    (async () => {
      try {
        await saveData(STORE_KEY, { activities, sessions, place, weatherLocation, weather, diaries, style, templates, startWords, endWords, overlapWords, particles });
        setStorageOK(true);
      } catch (e) {
        setStorageOK(false);
      }
    })();
  }, [activities, sessions, place, weatherLocation, weather, diaries, style, templates, startWords, endWords, overlapWords, particles, loaded]);

  const mutate = (fn) => { dirty.current = true; editSeq.current += 1; fn(); };

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
  /* うっかりタップしてすぐ止めた（3秒未満）場合は、記録に残さず消す。
     それ以外は普通に終了し、しばらく「元に戻す」を出せるようにする。 */
  const stop = (id) => {
    const target = sessions.find((s) => s.end == null && s.activityId === id);
    if (!target) return;
    const endAt = Date.now();
    if (endAt - target.start < 3000) {
      mutate(() => setSessions((p) => p.filter((s) => s.id !== target.id)));
      setLastStopped(null);
      return;
    }
    mutate(() => setSessions((p) => p.map((s) => (s.id === target.id ? { ...s, end: endAt } : s))));
    setLastStopped({ sessionId: target.id, activityId: id, at: endAt });
  };
  const stopAll = () => {
    const endAt = Date.now();
    mutate(() => setSessions((p) => p
      .filter((s) => !(s.end == null && endAt - s.start < 3000))
      .map((s) => (s.end == null ? { ...s, end: endAt } : s))));
    setLastStopped(null);
  };
  const undoStop = () => {
    if (!lastStopped) return;
    mutate(() => setSessions((p) => p.map((s) => (s.id === lastStopped.sessionId ? { ...s, end: null } : s))));
    setLastStopped(null);
  };
  const tapMain = (id) => (isRunning(id) ? stop(id) : start(id, running.length > 0));

  /* ── record editing ── */
  const setTime = (sid, field, value) =>
    mutate(() => setSessions((p) => p.map((s) => (s.id === sid ? { ...s, [field]: onDay(startOfDay(s[field] ?? viewDay), value) } : s))));
  const nudgeDay = (sid, field, delta) =>
    mutate(() => setSessions((p) => p.map((s) => (s.id === sid ? { ...s, [field]: (s[field] ?? Date.now()) + delta * DAY } : s))));
  const setDate = (sid, field, value) =>
    mutate(() => setSessions((p) => p.map((s) => (s.id === sid ? { ...s, [field]: onDate(s[field] ?? viewDay, value) } : s))));
  const boundaries = (exceptId) => {
    const m = [];
    for (const o of sessions) { if (o.id === exceptId) continue; m.push(o.start); if (o.end != null) m.push(o.end); }
    return m;
  };
  /* 「直前に合わせる」がどこへ合わせるべきか。
     開始時刻そのものが（誤操作などで）何日もずれている記録があるので、
     「s.start からDAY以内か」ではなく「表示中の日（viewDay）以降に終わった記録があるか」で判定する。
     こうすると、開始が壊れている記録でも「直前に合わせる」を押せば当日の0:00まで戻ってこられる。 */
  const anchorFor = (s) => {
    const ends = sessions.filter((o) => o.id !== s.id && o.end != null && o.end <= s.start).map((o) => o.end);
    const best = ends.length ? Math.max(...ends) : null;
    if (best === s.start) return { at: best, aligned: true };
    if (best == null || best < viewDay) return { at: viewDay, aligned: false, fallback: true };
    return { at: best, aligned: false };
  };
  const nextBoundary = (s) => { const e = s.end ?? now; const a = boundaries(s.id).filter((tt) => tt > e && tt <= e + 2 * DAY); return a.length ? Math.min(...a) : null; };
  const snap = (sid, field, value) => mutate(() => setSessions((p) => p.map((s) => (s.id === sid ? { ...s, [field]: value } : s))));
  const fixEnd = (sid) => mutate(() => setSessions((p) => p.map((s) => (s.id === sid && s.end != null ? { ...s, end: s.end + DAY } : s))));
  const removeSession = (id) => mutate(() => setSessions((p) => p.filter((s) => s.id !== id)));
  const setMemo = (sid, memo) => mutate(() => setSessions((p) => p.map((s) => (s.id === sid ? { ...s, memo } : s))));
  const setLinked = (sid, linked) => mutate(() => setSessions((p) => p.map((s) => (s.id === sid ? { ...s, linked } : s))));
  /* 計測中の記録の開始をその場で微調整 */
  const nudgeMinutes = (sid, mins) =>
    mutate(() => setSessions((p) => p.map((s) => (s.id === sid ? { ...s, start: Math.min(Date.now() - 1000, s.start + mins * 60000) } : s))));

  /* ── カラーバーをなぞる ── */
  const updateProbe = (clientX) => {
    const el = tapeRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    setProbe(viewDay + ratio * DAY);
    setProbeEditing(null);
    setProbeAdd(null);
  };
  /* 縦線（probe）を「記録済み⇄未記録」の切り替わり目（区切り）に直接ジャンプさせる。
     points は marks（viewDay・dayEnd・各記録のfrom/to）を並べたもの＝区切りの一覧。 */
  const setProbeAt = (t) => { setProbe(t); setProbeEditing(null); setProbeAdd(null); };
  const jumpProbe = (dir) => {
    const next = dir > 0
      ? points.find((p) => p > (probe ?? -Infinity))
      : [...points].reverse().find((p) => p < (probe ?? Infinity));
    if (next != null) setProbeAt(next);
  };
  const probeHits = probe == null ? [] : day.filter((s) => s.from <= probe && s.to > probe);
  const probeStart = probe == null ? null : Math.round(probe / 60000) * 60000;
  const addAtProbe = () => {
    if (!probeAdd || !probeAdd.activityId || !probeAdd.end) return;
    const st = probeStart;
    let en = onDay(startOfDay(st), probeAdd.end);
    if (en <= st) en += DAY;
    mutate(() => setSessions((p) => [...p, { id: uid(), activityId: probeAdd.activityId, start: st, end: en }]));
    setProbeAdd(null);
  };
  const addRunningAtProbe = () => {
    if (!probeAdd || !probeAdd.activityId) return;
    mutate(() => setSessions((p) => [...p, { id: uid(), activityId: probeAdd.activityId, start: probeStart, end: null }]));
    setProbeAdd(null);
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
  const addWord = () => {
    if (!newWord) return;
    const { kind, join, plain, polite, link, original } = newWord;
    const editing = original != null;
    if (kind === "overlap" || kind === "particle") {
      const w = join.trim();
      if (!w) return setNewWord(null);
      if (editing) {
        mutate(() => {
          if (kind === "overlap") {
            setOverlapWords((p) => p.map((x) => (x === original ? w : x)));
            setActivities((p) => p.map((a) => (a.overlap === original ? { ...a, overlap: w } : a)));
          } else {
            setParticles((p) => p.map((x) => (x === original ? w : x)));
            setActivities((p) => p.map((a) => (a.np === original ? { ...a, np: w } : a)));
          }
        });
        return setNewWord(null);
      }
      const list = kind === "overlap" ? overlapWords : particles;
      if (list.includes(w)) return setNewWord(null);
      mutate(() => (kind === "overlap" ? setOverlapWords((p) => [...p, w]) : setParticles((p) => [...p, w])));
      if (ea) patchActivity(ea.id, kind === "overlap" ? { overlap: w } : { np: w });
      return setNewWord(null);
    }
    if (kind === "start" ? !join.trim() : !plain.trim()) return;
    const w = kind === "start"
      ? { join: join.trim(), plain: plain.trim() || join.trim(), polite: polite.trim() || plain.trim(), custom: editing ? original.custom : true }
      : { plain: plain.trim(), polite: polite.trim() || plain.trim(), ...(link?.trim() ? { link: link.trim() } : {}), custom: editing ? original.custom : true };
    if (editing) {
      const oldKey = wordKey(original);
      mutate(() => {
        if (kind === "start") {
          setStartWords((p) => p.map((x) => (wordKey(x) === oldKey ? w : x)));
          setActivities((p) => p.map((a) => (a.startWord && wordKey(a.startWord) === oldKey ? { ...a, startWord: w } : a)));
        } else {
          setEndWords((p) => p.map((x) => (wordKey(x) === oldKey ? w : x)));
          setActivities((p) => p.map((a) => (a.endWord && wordKey(a.endWord) === oldKey ? { ...a, endWord: w } : a)));
        }
      });
      return setNewWord(null);
    }
    mutate(() => (kind === "start" ? setStartWords((p) => [...p, w]) : setEndWords((p) => [...p, w])));
    if (ea) patchActivity(ea.id, kind === "start" ? { startWord: w } : { endWord: w });
    setNewWord(null);
  };
  const removeWord = (kind, w) =>
    mutate(() => {
      if (kind === "start") setStartWords((p) => p.filter((x) => x.join !== w.join));
      else if (kind === "end") setEndWords((p) => p.filter((x) => x.plain !== w.plain));
      else if (kind === "particle") setParticles((p) => p.filter((x) => x !== w));
      else setOverlapWords((p) => p.filter((x) => x !== w));
    });

  const patchTemplate = (id, patch) => mutate(() => setTemplates((p) => p.map((tp) => (tp.id === id ? { ...tp, ...patch } : tp))));
  const addTemplate = () => { const nt = { id: uid(), label: "新しい定型文", text: "", auto: "none" }; mutate(() => setTemplates((p) => [...p, nt])); setEditingTemplate(nt.id); };
  const removeTemplate = (id) => { setEditingTemplate(null); mutate(() => setTemplates((p) => p.filter((tp) => tp.id !== id))); };

  /* ── diary composition context ── */
  const diaryCtx = { style, templates, place, viewDay, dayEnd, now, day, dayRecords, act };

  const openDiary = async () => {
    const key = dateKey(viewDay);
    if (diaries[key] != null) { setDiary(diaries[key]); setSaved(true); diaryGenSeq.current = editSeq.current; return; }
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
    diaryGenSeq.current = editSeq.current;
  };
  /* 開いている日記が、元になった記録や設定より古くなっていないか
     （＝削除・修正した記録や、変更した重なり設定などがまだ反映されていないか） */
  const diaryStale = diary !== null && diaryGenSeq.current !== null && diaryGenSeq.current !== editSeq.current;
  const insertAtCursor = (piece) => {
    const el = areaRef.current;
    const pos = el && typeof el.selectionStart === "number" ? el.selectionStart : diary.length;
    setDiary(diary.slice(0, pos) + (pos > 0 && diary[pos - 1] !== "\n" ? "\n" : "") + piece + diary.slice(pos));
    setSaved(false);
  };
  const insertTemplate = (tpl) => insertAtCursor(fillPlaceholders(tpl.text, viewDay, weather[dateKey(viewDay)]));
  /* 「日付の下」に入れる（天気用）：1行目の改行の直後 */
  const insertAfterDate = (piece) => {
    const idx = diary.indexOf("\n");
    const pos = idx >= 0 ? idx + 1 : diary.length;
    setDiary(diary.slice(0, pos) + piece + "\n" + diary.slice(pos));
    setSaved(false);
  };
  /* 「本文の前」に入れる（はじめの一文用）：ヘッダー（日付・天気）のあとの最初の空行の直後 */
  const insertAtBodyTop = (piece) => {
    const idx = diary.indexOf("\n\n");
    const pos = idx >= 0 ? idx + 2 : 0;
    setDiary(diary.slice(0, pos) + piece + "\n" + diary.slice(pos));
    setSaved(false);
  };
  /* 「本文の最後」に入れる（締めの一文用）：末尾の改行を整えてから追加 */
  const insertAtEnd = (piece) => {
    setDiary(diary.replace(/\n+$/, "") + "\n\n" + piece);
    setSaved(false);
  };
  /* 「締めの一文」テンプレートの直前に入れる（まとめの一文用）。
     すでに締めの一文が本文中に見つかれば、その直前に。見つからなければ最後に。 */
  const closingTemplate = templates.find((x) => x.label === "締めの一文" && x.text.trim());
  const insertBeforeClosing = (piece) => {
    const closingText = closingTemplate ? fillPlaceholders(closingTemplate.text, viewDay, weather[dateKey(viewDay)]) : null;
    const idx = closingText ? diary.indexOf(closingText) : -1;
    if (idx < 0) return insertAtEnd(piece);
    const before = diary.slice(0, idx).replace(/\n+$/, "");
    setDiary(`${before}\n\n${piece}\n\n${diary.slice(idx)}`);
    setSaved(false);
  };
  /* 「はじめの一文」「まとめの一文」「天気」は、自動で入る場所（先頭・末尾）とは別に、
     決まった位置へも手動で差し込めるようにしたもの。composeDiary の同名ロジックと
     見た目を合わせているが、こちらは「その場に１つだけ挿す」ための簡易版。 */
  const introText = () => {
    const names = byTime.filter((a) => a.diary !== "off" && a.inIntro !== false).map((a) => a.name);
    if (!names.length) return null;
    return `今日は${names.join("、")}${style.tone === "polite" ? "をしました。" : "をした。"}`;
  };
  const summaryText = () => {
    const sp = day.filter((s) => act(s.activityId)?.inIntro !== false);
    if (!sp.length) return null;
    const first = sp[0], last = sp[sp.length - 1];
    return `一日は${fmtTime(style, first.from)}の「${act(first.activityId)?.name}」から始まり、${fmtTime(style, last.to)}の「${act(last.activityId)?.name}」まで${style.tone === "polite" ? "記録しました。" : "記録した。"}`;
  };
  const weatherText = () => {
    const w = weather[dateKey(viewDay)];
    if (!w?.summary) return null;
    const temps = w.high != null && w.low != null ? `　最高${w.high}度・最低${w.low}度` : "";
    return `${place}　${w.summary}${temps}`;
  };
  const saveDiary = () => { mutate(() => setDiaries((p) => ({ ...p, [dateKey(viewDay)]: diary }))); setSaved(true); };
  const copyDiary = async () => {
    try { await navigator.clipboard.writeText(diary); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch (e) { setCopied(false); }
  };
  useEffect(() => { setDiary(null); setSaved(false); setProbe(null); setFixing(null); setProbeEditing(null); }, [viewDay]);

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
  const exportJSON = () => JSON.stringify({ app: "timetrack", version: 3, activities, sessions, place, weatherLocation, weather, diaries, style, templates, startWords, endWords, overlapWords, particles }, null, 2);

  const exportCSV = () => {
    const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [["行動", "開始日", "開始時刻", "終了日", "終了時刻", "分", "メモ"].map(q).join(",")];
    [...sessions].sort((a, b) => a.start - b.start).forEach((s) => {
      const e = s.end;
      rows.push([
        act(s.activityId)?.name ?? "",
        dateKey(s.start), toTimeInput(s.start),
        e ? dateKey(e) : "", e ? toTimeInput(e) : "",
        e ? Math.round((e - s.start) / 60000) : "",
        s.memo || "",
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
      const migratedOverlap = d.style?.overlapPhrase != null
        ? (OVERLAP_STYLE_MIGRATE[d.style.overlapPhrase] ?? "の途中で")
        : undefined;
      mutate(() => {
        if (d.activities?.length) setActivities(d.activities.map((a) => normalize(a, migratedOverlap)));
        setSessions(d.sessions);
        if (d.place) setPlace(d.place);
        if (d.weatherLocation) setWeatherLocation(d.weatherLocation);
        if (d.weather) setWeather(d.weather);
        if (d.diaries) setDiaries(d.diaries);
        if (d.style) setStyle({ ...DEFAULT_STYLE, ...d.style });
        if (d.templates) setTemplates(d.templates);
        if (d.startWords?.length) setStartWords(d.startWords);
        if (d.endWords?.length) setEndWords(backfillEndWordLinks(d.endWords));
        if (d.particles?.length) setParticles(d.particles);
        const baseOverlapWords = d.overlapWords?.length ? d.overlapWords : overlapWords;
        if (migratedOverlap && !baseOverlapWords.includes(migratedOverlap)) setOverlapWords([...baseOverlapWords, migratedOverlap]);
        else if (d.overlapWords?.length) setOverlapWords(d.overlapWords);
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
      const addA = (d.activities || []).filter((a) => !haveA.has(a.id)).map((a) => normalize(a));
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
    sectionTitle: { fontSize: 13, letterSpacing: "0.1em", borderBottom: `2px solid ${INK}`, paddingBottom: 6 },
  };
  const pill = (on) => ({ padding: "7px 12px", fontSize: 12, background: on ? INK : "transparent", color: on ? PAPER : MUTED, border: `1px solid ${on ? INK : RULE}` });

  /* 計測中の記録をその場で直す欄（計測中一覧・カラーバーの詳細から共通で使う） */
  const renderLiveFields = (s, onClose) => {
    const anc = anchorFor(s);
    const nb = nextBoundary(s);
    return html`
      <div style=${{ background: CARD, border: `1px solid ${RULE}`, padding: "12px 12px 14px", marginTop: 8 }}>
        <button
          onClick=${() => !anc.aligned && snap(s.id, "start", anc.at)}
          disabled=${anc.aligned}
          style=${{ width: "100%", padding: 11, marginBottom: 10, background: anc.aligned ? "transparent" : INK, color: anc.aligned ? MUTED : PAPER, border: `1px solid ${anc.aligned ? RULE : INK}`, fontSize: 13 }}
        >${anc.aligned ? "すでに直前の記録に接しています" : anc.fallback ? `直前に合わせる（記録がないので ${hhmm(anc.at)}）` : `直前に合わせる（${hhmm(anc.at)}）`}</button>

        <div style=${{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <span style=${{ fontSize: 11, color: MUTED, width: 28 }}>開始</span>
          <input type="time" value=${toTimeInput(s.start)} onInput=${(e) => setTime(s.id, "start", e.target.value)} style=${S.input} />
          <input type="date" value=${dateKey(s.start)} onInput=${(e) => e.target.value && setDate(s.id, "start", e.target.value)} style=${S.input} />
          <button onClick=${() => nudgeMinutes(s.id, -15)} style=${S.ghost}>−15分</button>
          <button onClick=${() => nudgeMinutes(s.id, -5)} style=${S.ghost}>−5分</button>
          <button onClick=${() => nudgeMinutes(s.id, 5)} style=${S.ghost}>+5分</button>
        </div>

        <div style=${{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <span style=${{ fontSize: 11, color: MUTED, width: 28 }}>終了</span>
          <input type="time" value=${endDraft} onInput=${(e) => setEndDraft(e.target.value)} style=${S.input} />
          <button onClick=${() => setEndDraft(toTimeInput(Date.now()))} style=${S.ghost}>現時刻</button>
          <button
            onClick=${() => { if (endDraft) { snap(s.id, "end", onDay(startOfDay(s.start), endDraft)); onClose(); } }}
            disabled=${!endDraft}
            style=${{ padding: "7px 14px", background: endDraft ? INK : RULE, color: PAPER, border: "none", fontSize: 12 }}
          >この時刻で終了</button>
        </div>

        <button
          onClick=${() => nb != null && snap(s.id, "end", nb)}
          disabled=${nb == null}
          style=${{ width: "100%", padding: 10, background: "transparent", color: nb != null ? INK : MUTED, border: `1px solid ${nb != null ? INK : RULE}`, fontSize: 12, marginBottom: 10 }}
        >${nb != null ? `直後に合わせて終了（${hhmm(nb)}）` : "直後の記録がありません"}</button>

        <div style=${{ fontSize: 11, color: MUTED, marginBottom: 5 }}>メモ</div>
        <input
          value=${s.memo || ""}
          onInput=${(e) => setMemo(s.id, e.target.value)}
          placeholder="日記の文の最後に（　）で入ります"
          style=${{ ...S.input, width: "100%", padding: 8, marginBottom: 10, fontFamily: "'Hiragino Sans','Yu Gothic',system-ui,sans-serif" }}
        />
        <button onClick=${onClose} style=${{ ...S.ghost, width: "100%", padding: 8 }}>閉じる</button>
      </div>`;
  };

  /* 終わった記録をその場で直す欄（カラーバーの詳細から使う） */
  const renderCompletedFields = (s) => {
    const anc = anchorFor(s), nb = nextBoundary(s), broken = !valid(s);
    const linkWord = act(s.activityId)?.endWord?.link;
    return html`
      <div>
        <div style=${{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
          <span style=${{ fontSize: 11, color: MUTED, width: 28 }}>開始</span>
          <input type="time" value=${toTimeInput(s.start)} onInput=${(e) => setTime(s.id, "start", e.target.value)} style=${S.input} />
          <input type="date" value=${dateKey(s.start)} onInput=${(e) => e.target.value && setDate(s.id, "start", e.target.value)} style=${S.input} />
          <button onClick=${() => nudgeDay(s.id, "start", -1)} style=${S.ghost}>−1日</button>
          <button onClick=${() => nudgeDay(s.id, "start", 1)} style=${S.ghost}>+1日</button>
          ${!anc.aligned && html`<button onClick=${() => snap(s.id, "start", anc.at)} style=${{ ...S.ghost, color: INK }}>直前に合わせる（${hhmm(anc.at)}）</button>`}
        </div>
        <div style=${{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style=${{ fontSize: 11, color: MUTED, width: 28 }}>終了</span>
          ${s.end == null ? html`<span style=${{ fontSize: 12, color: MUTED }}>計測中</span>` : html`
            <input type="time" value=${toTimeInput(s.end)} onInput=${(e) => setTime(s.id, "end", e.target.value)} style=${S.input} />
            <input type="date" value=${dateKey(s.end)} onInput=${(e) => e.target.value && setDate(s.id, "end", e.target.value)} style=${S.input} />
            <button onClick=${() => nudgeDay(s.id, "end", -1)} style=${S.ghost}>−1日</button>
            <button onClick=${() => nudgeDay(s.id, "end", 1)} style=${S.ghost}>+1日</button>
            ${nb != null && html`<button onClick=${() => snap(s.id, "end", nb)} style=${{ ...S.ghost, color: INK }}>直後に合わせる（${hhmm(nb)}）</button>`}
          `}
        </div>
        <input
          value=${s.memo || ""}
          onInput=${(e) => setMemo(s.id, e.target.value)}
          placeholder="メモ"
          style=${{ ...S.input, width: "100%", padding: 7, marginTop: 8, fontFamily: "'Hiragino Sans','Yu Gothic',system-ui,sans-serif" }}
        />
        ${linkWord
          ? html`<button onClick=${() => setLinked(s.id, !s.linked)} style=${{ ...pill(!!s.linked), width: "100%", marginTop: 8 }}>次の文につなげる（${linkWord}、）</button>`
          : html`<div style=${{ fontSize: 10, color: MUTED, marginTop: 8, lineHeight: 1.6 }}>この行動の終了の言葉には「つなげる形」が未設定です。設定→行動ボタンの「終了」から追加できます。</div>`}
        ${broken && html`
          <div style=${{ fontSize: 11, color: ALERT, marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
            終了が開始より前です。
            <button onClick=${() => fixEnd(s.id)} style=${{ ...S.ghost, color: ALERT, borderColor: ALERT }}>翌日の終了にする</button>
          </div>`}
        ${s.end != null && html`<button onClick=${() => snap(s.id, "end", null)} style=${{ ...S.ghost, width: "100%", padding: 8, marginTop: 8, color: INK }}>計測中にする（終了を取り消す）</button>`}
      </div>`;
  };

  /* 「＋追加」の新しい言葉フォーム。それぞれの言葉一覧のすぐ下に出したいので、
     呼び出し側で kind を指定して該当箇所に差し込む（共通の1箇所にまとめて出すと、
     どの一覧に追加したのか分かりにくく紛らわしいため）。 */
  const renderNewWordForm = (kind) => {
    if (!newWord || newWord.kind !== kind) return null;
    const editing = newWord.original != null;
    const label = kind === "start" ? "開始の言葉" : kind === "end" ? "終了の言葉" : kind === "particle" ? "助詞" : "重なったときのつなぎ言葉";
    return html`
      <div style=${{ marginTop: 8, padding: 12, background: PAPER, border: `1px solid ${INK}` }}>
        <div style=${{ fontSize: 11, color: MUTED, marginBottom: 8 }}>
          ${editing ? `${label}を編集` : `${label}を作る（ほかの行動でも選べるようになります）`}
        </div>
        <div style=${{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          ${kind === "overlap" && html`
            <label style=${{ fontSize: 10, color: MUTED }}>つなぎ言葉
              <input value=${newWord.join} onInput=${(e) => setNewWord({ ...newWord, join: e.target.value })} placeholder="の合間に" style=${{ ...S.input, display: "block", width: 140, marginTop: 3 }} /></label>
          `}
          ${kind === "particle" && html`
            <label style=${{ fontSize: 10, color: MUTED }}>助詞
              <input value=${newWord.join} onInput=${(e) => setNewWord({ ...newWord, join: e.target.value })} placeholder="へ" style=${{ ...S.input, display: "block", width: 100, marginTop: 3 }} /></label>
          `}
          ${kind === "start" && html`
            <label style=${{ fontSize: 10, color: MUTED }}>つなぐ形
              <input value=${newWord.join} onInput=${(e) => setNewWord({ ...newWord, join: e.target.value })} placeholder="出かけて" style=${{ ...S.input, display: "block", width: 100, marginTop: 3 }} /></label>
          `}
          ${kind !== "overlap" && kind !== "particle" && html`
            <label style=${{ fontSize: 10, color: MUTED }}>〜た形
              <input value=${newWord.plain} onInput=${(e) => setNewWord({ ...newWord, plain: e.target.value })} placeholder="出かけた" style=${{ ...S.input, display: "block", width: 100, marginTop: 3 }} /></label>
            <label style=${{ fontSize: 10, color: MUTED }}>〜ました形
              <input value=${newWord.polite} onInput=${(e) => setNewWord({ ...newWord, polite: e.target.value })} placeholder="出かけました" style=${{ ...S.input, display: "block", width: 110, marginTop: 3 }} /></label>
          `}
          ${kind === "end" && html`
            <label style=${{ fontSize: 10, color: MUTED }}>つなげる形（次の文につなげるとき。例：過ごし）
              <input value=${newWord.link || ""} onInput=${(e) => setNewWord({ ...newWord, link: e.target.value })} placeholder="過ごし" style=${{ ...S.input, display: "block", width: 140, marginTop: 3 }} /></label>
          `}
        </div>
        <div style=${{ display: "flex", gap: 8, marginTop: 10 }}>
          <button onClick=${addWord} style=${{ flex: 1, padding: 9, background: INK, color: PAPER, border: "none", fontSize: 12 }}>${editing ? "保存する" : "追加してこの行動に使う"}</button>
          <button onClick=${() => setNewWord(null)} style=${{ ...S.ghost, padding: 9, fontSize: 12 }}>やめる</button>
        </div>
        ${editing && (kind === "particle" || kind === "overlap" ? !(kind === "particle" ? PARTICLES : OVERLAP_WORDS).includes(newWord.original) : newWord.original.custom) && html`
          <button onClick=${() => { removeWord(kind, newWord.original); setNewWord(null); }} style=${{ ...S.ghost, width: "100%", marginTop: 8, color: ALERT, borderColor: ALERT }}>この言葉を削除</button>
        `}
      </div>`;
  };

  if (!loaded) return html`<div style=${{ ...S.shell, color: MUTED, fontSize: 13 }}>記録を読み込んでいます…</div>`;

  const TABS = [["analysis", "分析"], ["settings", "設定"]];
  const hasSaved = diaries[dateKey(viewDay)] != null;
  const ea = editingActivity ? act(editingActivity) : null;
  const et = editingTemplate ? templates.find((x) => x.id === editingTemplate) : null;
  const introPiece = diary !== null ? introText() : null;
  const summaryPiece = diary !== null ? summaryText() : null;
  const weatherPiece = diary !== null ? weatherText() : null;
  const insertableTemplates = templates.filter((x) => x.text.trim());

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
        <div
          ref=${tapeRef}
          onPointerDown=${(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDragging(true); updateProbe(e.clientX); }}
          onPointerMove=${(e) => { if (dragging) updateProbe(e.clientX); }}
          onPointerUp=${() => setDragging(false)}
          onPointerCancel=${() => setDragging(false)}
          style=${{ position: "relative", height: 78, background: "#E7E9E5", border: `1px solid ${RULE}`, overflow: "hidden", cursor: "pointer", touchAction: "none" }}
        >
          ${Array.from({ length: 25 }, (_, hh) => html`
            <div key=${hh} style=${{ position: "absolute", left: `${(hh / 24) * 100}%`, top: 0, width: 1, height: hh % 6 === 0 ? "100%" : 6, background: hh % 6 === 0 ? "rgba(22,32,43,.16)" : "rgba(22,32,43,.28)" }} />`)}
          ${slices.map(({ t0, t1, live }) => html`
            <div key=${t0} style=${{ position: "absolute", left: `${((t0 - viewDay) / DAY) * 100}%`, width: `${Math.max(((t1 - t0) / DAY) * 100, 0.25)}%`, top: 0, height: "100%", display: "flex", flexDirection: "column" }}>
              ${live.map((s, i) => html`
                <div key=${s.id} title=${`${act(s.activityId)?.name} ${hhmm(s.from)}–${hhmm(s.to)}`} style=${{ flex: 1, background: act(s.activityId)?.color ?? INK, borderTop: i > 0 ? "1px solid rgba(255,255,255,.6)" : "none", opacity: s.end == null ? 1 : 0.9 }} />`)}
            </div>`)}
          ${probe != null && html`
            <div style=${{ position: "absolute", left: `${((probe - viewDay) / DAY) * 100}%`, top: 0, width: 2, height: "100%", background: "repeating-linear-gradient(to bottom, #fff 0 5px, rgba(22,32,43,.85) 5px 10px)" }}>
              <div style=${{ position: "absolute", left: -5, top: -1, width: 12, height: 6, background: INK }} />
              <div style=${{ position: "absolute", left: -5, bottom: -1, width: 12, height: 6, background: INK }} />
            </div>`}
          ${isToday && html`<div style=${{ position: "absolute", left: `${((now - viewDay) / DAY) * 100}%`, top: 0, width: 2, height: "100%", background: INK }} />`}
        </div>
        <div style=${{ display: "flex", justifyContent: "space-between", fontSize: 10, color: MUTED, marginTop: 4, letterSpacing: "0.08em" }}>
          ${[0, 6, 12, 18, 24].map((hh) => html`<span key=${hh}>${hh}</span>`)}
        </div>
        <div style=${{ display: "flex", gap: 6, marginTop: 6 }}>
          <button onClick=${() => jumpProbe(-1)} disabled=${!points.some((p) => p < (probe ?? Infinity))} style=${{ ...S.ghost, flex: 1, padding: 7 }}>◀ 前の区切り</button>
          <button onClick=${() => jumpProbe(1)} disabled=${!points.some((p) => p > (probe ?? -Infinity))} style=${{ ...S.ghost, flex: 1, padding: 7 }}>次の区切り ▶</button>
        </div>

        ${probe != null && html`
          <div style=${{ marginTop: 8, border: `1px solid ${RULE}`, background: CARD, padding: "10px 12px" }}>
            <div style=${{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: probeHits.length ? 8 : 0 }}>
              <span style=${{ fontSize: 18, fontVariantNumeric: "tabular-nums" }}>${hhmm(probe)}</span>
              <button onClick=${() => { setProbe(null); setProbeEditing(null); setProbeAdd(null); }} style=${{ ...S.ghost, border: "none" }}>閉じる</button>
            </div>
            ${probeHits.length === 0 ? html`
              <div style=${{ fontSize: 12, color: MUTED }}>この時刻の記録はありません。</div>` : probeHits.map((s) => {
              const editing = probeEditing === s.id;
              return html`
              <div key=${s.id}>
                <div style=${{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                  <span style=${{ width: 8, height: 18, background: act(s.activityId)?.color, flexShrink: 0 }} />
                  <button onClick=${() => { const next = editing ? null : s.id; setProbeEditing(next); setEndDraft(""); }}
                    style=${{ fontSize: 13, flex: 1, minWidth: 0, textAlign: "left", background: "transparent", border: "none", color: "inherit", textDecoration: editing ? "underline" : "none", padding: "4px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    ${act(s.activityId)?.name}${s.memo && html`<span style=${{ color: MUTED }}>　（${s.memo}）</span>`}
                  </button>
                  <span style=${{ fontSize: 11, color: MUTED, flexShrink: 0 }}>${hhmm(s.from)}〜${s.end == null ? "" : hhmm(s.to)}</span>
                  <span style=${{ fontSize: 13, fontVariantNumeric: "tabular-nums", minWidth: 62, textAlign: "right" }}>${dur(probe - s.from)}</span>
                </div>
                ${editing && html`
                  <div style=${{ marginBottom: 8 }}>
                    ${s.end == null ? renderLiveFields(s, () => setProbeEditing(null)) : renderCompletedFields(s)}
                    <button onClick=${() => { removeSession(s.id); setProbeEditing(null); }} style=${{ ...S.ghost, color: ALERT, borderColor: ALERT, width: "100%", padding: 8, marginTop: 8 }}>この記録を削除</button>
                  </div>`}
              </div>`;
            })}
            ${probeHits.length > 0 && html`<div style=${{ fontSize: 10, color: MUTED, marginTop: 6, marginBottom: 4 }}>右の数字はこの時点までの経過時間。行動名をタップすると時刻を直せます。</div>`}
            ${probeAdd ? html`
              <div style=${{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${RULE}` }}>
                <div style=${{ fontSize: 11, color: MUTED, marginBottom: 6 }}>${hhmm(probeStart)}から記録を追加</div>
                <div style=${{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  ${activities.map((a) => html`
                    <button key=${a.id} onClick=${() => setProbeAdd((d) => ({ ...d, activityId: a.id }))} style=${{ padding: "7px 12px", fontSize: 13, background: probeAdd.activityId === a.id ? a.color : "transparent", color: probeAdd.activityId === a.id ? "#fff" : INK, border: `2px solid ${a.color}` }}>${a.name}</button>`)}
                </div>
                <div style=${{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                  <span style=${{ fontSize: 11, color: MUTED, width: 28 }}>終了</span>
                  <input type="time" value=${probeAdd.end || ""} onInput=${(e) => setProbeAdd((d) => ({ ...d, end: e.target.value }))} style=${S.input} />
                  <button onClick=${addAtProbe} disabled=${!probeAdd.end} style=${{ padding: "7px 14px", background: probeAdd.end ? INK : RULE, color: PAPER, border: "none", fontSize: 12 }}>追加</button>
                </div>
                <div style=${{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <button onClick=${addRunningAtProbe} style=${{ padding: "7px 14px", background: "transparent", color: INK, border: `1px solid ${INK}`, fontSize: 12 }}>計測中のまま追加</button>
                  <button onClick=${() => setProbeAdd(null)} style=${S.ghost}>やめる</button>
                </div>
              </div>` : html`
              <button onClick=${() => setProbeAdd({ activityId: activities[0]?.id, end: "" })} style=${{ ...S.ghost, width: "100%", marginTop: probeHits.length > 0 ? 4 : 10, padding: 8, color: INK }}>＋ここに記録を追加</button>
            `}
          </div>`}
      </div>

      ${lastStopped && now - lastStopped.at < 8000 && html`
        <div style=${{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 12px", marginBottom: 10, background: CARD, border: `1px solid ${RULE}` }}>
          <span style=${{ fontSize: 12 }}>「${act(lastStopped.activityId)?.name}」の記録を止めました。</span>
          <button onClick=${undoStop} style=${{ padding: "6px 12px", background: INK, color: PAPER, border: "none", fontSize: 12, flexShrink: 0 }}>元に戻す</button>
        </div>`}

      ${isToday && running.length > 0 && html`
        <div style=${{ marginBottom: 14 }}>
          ${running.map((s) => {
            const a = act(s.activityId);
            const open = fixing === s.id;
            return html`
              <div key=${s.id} style=${{ borderBottom: `1px solid ${RULE}` }}>
                <div style=${{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                  <span style=${{ width: 8, height: 20, background: a?.color ?? INK, animation: "pulse 2.4s ease-in-out infinite", flexShrink: 0 }} />
                  <span style=${{ fontSize: 13, flex: 1 }}>${a?.name ?? "—"}</span>
                  <button
                    onClick=${() => { setFixing(open ? null : s.id); setEndDraft(""); }}
                    style=${{ fontSize: 12, padding: "4px 8px", background: open ? INK : "transparent", color: open ? PAPER : INK, border: `1px solid ${open ? INK : RULE}` }}
                  >${hhmm(s.start)}〜</button>
                  <span style=${{ fontSize: 18, fontWeight: 300, fontVariantNumeric: "tabular-nums" }}>${clock(now - s.start)}</span>
                </div>
                ${open && renderLiveFields(s, () => setFixing(null))}
              </div>`;
          })}
          ${running.length > 1 && html`<button onClick=${stopAll} style=${{ ...S.ghost, width: "100%", marginTop: 8, padding: 7 }}>すべて終了</button>`}
        </div>`}

      ${isToday ? html`
        <div style=${{ marginBottom: 14, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
          ${activities.map((a) => {
            const on = isRunning(a.id);
            const live = running.find((s) => s.activityId === a.id);
            return html`
              <div key=${a.id} style=${{ display: "flex", background: on ? a.color : CARD, border: `1px solid ${on ? a.color : RULE}`, borderLeft: `6px solid ${a.color}`, color: on ? "#fff" : INK }}>
                <button onClick=${() => tapMain(a.id)} style=${{ flex: 1, minWidth: 0, padding: "17px 10px", textAlign: "left", background: "transparent", border: "none", color: "inherit", fontSize: 15, letterSpacing: "0.04em", overflow: "hidden" }}>
                  ${a.name}
                  <span style=${{ display: "block", fontSize: 10, letterSpacing: "0.1em", marginTop: 3, opacity: on ? 0.85 : 0.45 }}>
                    ${on ? `${hhmm(live.start)}〜 計測中` : running.length ? "押すと切り替え" : "押すと開始"}
                  </span>
                </button>
                ${on ? html`
                  <button onClick=${() => stop(a.id)} aria-label=${`${a.name}を終了`} style=${{ width: 52, flexShrink: 0, background: "rgba(0,0,0,.16)", border: "none", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3 }}>
                    <${IconStop} /><span style=${{ fontSize: 10, letterSpacing: "0.1em" }}>終了</span>
                  </button>` : html`
                  <button onClick=${() => start(a.id, false)} aria-label=${`${a.name}を同時に開始`} title="いまの計測を続けたまま、並行して始める" style=${{ width: 52, flexShrink: 0, background: running.length ? "rgba(22,32,43,.05)" : "transparent", border: "none", borderLeft: `1px solid ${RULE}`, color: INK, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3 }}>
                    <${IconParallel} /><span style=${{ fontSize: 10, letterSpacing: "0.08em", color: MUTED }}>同時</span>
                  </button>`}
              </div>`;
          })}
        </div>` : html`
        <div style=${{ border: `1px dashed ${RULE}`, padding: "14px 12px", fontSize: 12, color: MUTED, marginBottom: 14, lineHeight: 1.7 }}>
          ${isFuture ? "未来の日付です。" : "過去の日付です。"}計測の開始はできません。カラーバーをなぞって出る欄の「＋ここに記録を追加」から手入力で足せます。
        </div>`}

      <button onClick=${openDiary} disabled=${diaryBusy} style=${{ width: "100%", padding: 16, background: diaryBusy ? MUTED : INK, color: PAPER, border: "none", fontSize: 15, letterSpacing: "0.14em", marginBottom: 14 }}>
        ${diaryBusy ? "天気を調べています…" : hasSaved ? "保存した日記を開く" : "日記に変換"}
      </button>

      ${diary !== null && html`
        <div style=${S.card}>
          ${diaryStale && html`
            <div style=${{ border: `1px solid ${ALERT}`, background: "rgba(176,58,46,.06)", color: INK, fontSize: 12, lineHeight: 1.7, padding: "8px 10px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span>この日の記録や設定があとから変わっています。下の内容は古いままかもしれません。</span>
              <button onClick=${regenerate} style=${{ padding: "6px 10px", background: ALERT, color: PAPER, border: "none", fontSize: 12, flexShrink: 0 }}>作り直す</button>
            </div>`}
          <div style=${{ ...S.label, display: "flex", justifyContent: "space-between" }}>
            <span>日記</span>${saved && html`<span style=${{ color: MUTED }}>保存済み</span>`}
          </div>
          <textarea ref=${areaRef} value=${diary} onInput=${(e) => { setDiary(e.target.value); setSaved(false); }} rows=${Math.min(20, diary.split("\n").length + 3)}
            style=${{ width: "100%", border: `1px solid ${RULE}`, background: PAPER, color: INK, padding: 10, fontSize: 14, lineHeight: 1.8, fontFamily: "'Hiragino Sans','Yu Gothic',system-ui,sans-serif", resize: "vertical" }} />
          ${(introPiece || summaryPiece || weatherPiece || insertableTemplates.length > 0) && html`
            <div style=${{ marginTop: 8 }}>
              <div style=${{ fontSize: 10, color: MUTED, marginBottom: 5 }}>文を差し込む</div>
              <div style=${{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                ${weatherPiece && html`<button onClick=${() => insertAfterDate(weatherPiece)} style=${{ ...S.ghost, color: INK }}>＋天気</button>`}
                ${introPiece && html`<button onClick=${() => insertAtBodyTop(introPiece)} style=${{ ...S.ghost, color: INK }}>＋はじめの一文</button>`}
                ${summaryPiece && html`<button onClick=${() => insertBeforeClosing(summaryPiece)} style=${{ ...S.ghost, color: INK }}>＋まとめの一文</button>`}
                ${insertableTemplates.map((x) => html`
                  <button key=${x.id} onClick=${() => (x.label === "締めの一文" ? insertAtEnd(fillPlaceholders(x.text, viewDay, weather[dateKey(viewDay)])) : insertTemplate(x))} style=${{ ...S.ghost, color: INK }}>＋${x.label}</button>`)}
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

      ${panel === "settings" && html`
        <div style=${{ ...S.card, marginTop: 14, padding: "4px 14px 8px" }}>
          <button onClick=${() => setSettingsOpen(settingsOpen === "diary" ? null : "diary")} aria-expanded=${settingsOpen === "diary"}
            style=${{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", background: "transparent", border: "none", borderBottom: `${settingsOpen === "diary" ? 2 : 1}px solid ${settingsOpen === "diary" ? INK : RULE}`, fontSize: 13, letterSpacing: "0.1em", color: INK, cursor: "pointer" }}>
            <span>日記全体の書き方</span><span style=${{ fontSize: 11, color: MUTED }}>${settingsOpen === "diary" ? "▲" : "▼"}</span>
          </button>
          ${settingsOpen === "diary" && html`
          <div style=${{ paddingTop: 16 }}>
          <div style=${S.label}>文体</div>
          <div style=${{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
            <button onClick=${() => mutate(() => setStyle((x) => ({ ...x, tone: "polite" })))} style=${pill(style.tone === "polite")}>〜ました</button>
            <button onClick=${() => mutate(() => setStyle((x) => ({ ...x, tone: "plain" })))} style=${pill(style.tone === "plain")}>〜た</button>
          </div>

          <div style=${S.label}>時間</div>
          <div style=${{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            <button onClick=${() => mutate(() => setStyle((x) => ({ ...x, timeSys: "24" })))} style=${pill((style.timeSys ?? "24") === "24")}>24時間</button>
            <button onClick=${() => mutate(() => setStyle((x) => ({ ...x, timeSys: "12" })))} style=${pill(style.timeSys === "12")}>午前・午後</button>
          </div>
          <div style=${{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            <button onClick=${() => mutate(() => setStyle((x) => ({ ...x, timeFmt: "colon" })))} style=${pill(style.timeFmt === "colon")}>9:30</button>
            <button onClick=${() => mutate(() => setStyle((x) => ({ ...x, timeFmt: "kanji" })))} style=${pill(style.timeFmt === "kanji")}>9時30分</button>
          </div>
          <div style=${{ fontSize: 11, color: MUTED, marginBottom: 20 }}>
            例：${fmtTime(style, viewDay + 9 * 3600000 + 1800000)} / ${fmtTime(style, viewDay + 18 * 3600000)}
          </div>

          <div style=${S.label}>定型文</div>
          <div style=${{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            <button onClick=${() => mutate(() => setStyle((x) => ({ ...x, intro: !x.intro })))} style=${pill(style.intro)}>はじめの一文</button>
            <button onClick=${() => mutate(() => setStyle((x) => ({ ...x, summary: !x.summary })))} style=${pill(style.summary)}>まとめの一文</button>
          </div>
          <div style=${{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            ${templates.map((x) => {
              const open = editingTemplate === x.id;
              return html`
                <button key=${x.id} onClick=${() => setEditingTemplate(open ? null : x.id)} style=${{ padding: "9px 14px", fontSize: 13, background: open ? INK : "transparent", color: open ? PAPER : INK, border: `1px solid ${open ? INK : RULE}` }}>
                  ${x.label}${x.auto !== "none" && html`<span style=${{ fontSize: 10, marginLeft: 6, opacity: 0.7 }}>${x.auto === "top" ? "先頭" : "末尾"}</span>`}
                </button>`;
            })}
            <button onClick=${addTemplate} style=${{ padding: "9px 14px", fontSize: 13, background: "transparent", border: `1px dashed ${MUTED}`, color: MUTED }}>＋追加</button>
          </div>

          ${et && html`
            <div style=${{ marginTop: 14, padding: 12, background: PAPER, border: `1px solid ${RULE}` }}>
              <input value=${et.label} onInput=${(e) => patchTemplate(et.id, { label: e.target.value })} placeholder="呼び名" style=${{ ...S.input, width: "100%", fontSize: 14, padding: 8 }} />
              <textarea value=${et.text} onInput=${(e) => patchTemplate(et.id, { text: e.target.value })} rows="3" placeholder="日記に差し込む文章"
                style=${{ ...S.input, width: "100%", marginTop: 8, fontSize: 14, lineHeight: 1.7, fontFamily: "'Hiragino Sans','Yu Gothic',system-ui,sans-serif", resize: "vertical" }} />
              <div style=${{ fontSize: 10, color: MUTED, marginTop: 6 }}>文中に {"{日付}"} {"{天気}"} {"{曜日}"} と書くと置き換わります。</div>
              <div style=${{ fontSize: 10, color: MUTED, margin: "12px 0 5px" }}>自動で入れる位置</div>
              <div style=${{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                ${[["none", "入れない"], ["top", "先頭"], ["bottom", "末尾"]].map(([k, label]) => html`<button key=${k} onClick=${() => patchTemplate(et.id, { auto: k })} style=${pill(et.auto === k)}>${label}</button>`)}
              </div>
              <div style=${{ display: "flex", gap: 8, marginTop: 14 }}>
                <button onClick=${() => setEditingTemplate(null)} style=${{ ...S.ghost, flex: 1, padding: 9, fontSize: 12 }}>閉じる</button>
                <button onClick=${() => removeTemplate(et.id)} style=${{ ...S.ghost, color: ALERT, borderColor: ALERT, padding: 9, fontSize: 12 }}>削除</button>
              </div>
            </div>`}

          <div style=${{ ...S.label, marginTop: 22 }}>天気</div>
          <button onClick=${() => mutate(() => setStyle((x) => ({ ...x, weather: !x.weather })))} style=${pill(style.weather)}>日記に天気を入れる</button>
          ${style.weather && html`
            <div style=${{ marginTop: 10 }}>
              <div style=${{ fontSize: 10, color: MUTED, marginBottom: 5 }}>日記に載る地名</div>
              <input value=${place} onInput=${(e) => mutate(() => setPlace(e.target.value))} style=${{ ...S.input, width: "100%", fontSize: 14, padding: 9 }} placeholder="例：東京都" />
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
                ${weatherLocation ? html`天気の取得地点：<b>${weatherLocation.label}</b>` : "天気の場所が未設定です。検索して選んでください。"}
              </div>
            </div>`}
          </div>`}

          <button onClick=${() => setSettingsOpen(settingsOpen === "activities" ? null : "activities")} aria-expanded=${settingsOpen === "activities"}
            style=${{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", marginTop: 4, background: "transparent", border: "none", borderBottom: `${settingsOpen === "activities" ? 2 : 1}px solid ${settingsOpen === "activities" ? INK : RULE}`, fontSize: 13, letterSpacing: "0.1em", color: INK, cursor: "pointer" }}>
            <span>行動ボタン</span><span style=${{ fontSize: 11, color: MUTED }}>${settingsOpen === "activities" ? "▲" : "▼"}</span>
          </button>
          ${settingsOpen === "activities" && html`
          <div style=${{ paddingTop: 16 }}>
          <div style=${{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            ${activities.map((a) => {
              const open = editingActivity === a.id;
              return html`<button key=${a.id} onClick=${() => { setEditingActivity(open ? null : a.id); setNewWord(null); }} style=${{ padding: "9px 14px", fontSize: 14, background: open ? a.color : "transparent", color: open ? "#fff" : INK, border: `2px solid ${a.color}`, opacity: a.diary === "off" ? 0.55 : 1 }}>${a.name}</button>`;
            })}
            <button onClick=${addActivity} style=${{ padding: "9px 14px", fontSize: 14, background: "transparent", border: `1px dashed ${MUTED}`, color: MUTED }}>＋追加</button>
          </div>

          ${ea && html`
            <div style=${{ marginTop: 16, borderTop: `1px solid ${RULE}`, paddingTop: 14 }}>
              <input value=${ea.name} onInput=${(e) => patchActivity(ea.id, { name: e.target.value })} style=${{ ...S.input, width: "100%", fontSize: 15, padding: 9 }} />
              <div style=${{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                ${SWATCHES.map((c) => html`<button key=${c} onClick=${() => patchActivity(ea.id, { color: c })} aria-label=${`色を変更 ${c}`} style=${{ width: 28, height: 28, background: c, border: ea.color === c ? `2px solid ${INK}` : "1px solid rgba(0,0,0,.1)" }} />`)}
                <label style=${{ width: 28, height: 28, position: "relative", border: `1px dashed ${MUTED}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }} aria-label="色を自由に選ぶ" title="色を自由に選ぶ">
                  <span style=${{ fontSize: 14, color: MUTED, pointerEvents: "none" }}>＋</span>
                  <input type="color" value=${ea.color} onInput=${(e) => patchActivity(ea.id, { color: e.target.value })} style=${{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, border: "none", padding: 0, cursor: "pointer" }} />
                </label>
              </div>

              <div style=${{ ...S.label, marginTop: 18 }}>日記での書き方</div>
              <div style=${{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                ${FORMS.map(([k, label]) => html`<button key=${k} onClick=${() => patchActivity(ea.id, { diary: k })} style=${pill(ea.diary === k)}>${label}</button>`)}
              </div>

              ${ea.diary !== "off" && html`
                <div style=${{ position: "sticky", top: "max(76px, calc(env(safe-area-inset-top, 0px) + 24px))", zIndex: 5, marginTop: 12, padding: "10px 12px", background: PAPER, border: `2px solid ${INK}`, fontSize: 14, lineHeight: 1.8, fontFamily: "'Hiragino Sans','Yu Gothic',system-ui,sans-serif", boxShadow: "0 2px 6px rgba(22,32,43,.10)" }}>
                  <div style=${{ fontSize: 9, letterSpacing: "0.16em", color: MUTED, marginBottom: 3, fontFamily: "'Oswald',sans-serif" }}>できあがる文</div>
                  ${previewOf(style, ea, viewDay)}
                  ${ea.diary === "time" && ea.merge === false && html`
                    <div style=${{ fontSize: 10, color: MUTED, letterSpacing: "0.1em", marginTop: 8 }}>日をまたいで開始だけの日</div>
                    ${previewHalf(style, ea, viewDay)}
                  `}
                </div>`}

              ${ea.diary === "time" && html`
                <div style=${{ ...S.label, marginTop: 18 }}>まとめ方</div>
                <div style=${{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button onClick=${() => patchActivity(ea.id, { merge: true })} style=${pill(ea.merge !== false)}>1日ぶんをまとめる</button>
                  <button onClick=${() => patchActivity(ea.id, { merge: false })} style=${pill(ea.merge === false)}>1回ずつ書く</button>
                </div>
                <div style=${{ fontSize: 10, color: MUTED, marginTop: 6, lineHeight: 1.6 }}>
                  ${ea.merge !== false
                    ? "何回かに分かれても「9:00から12:00まで、13:00から18:00まで」と1文にします。"
                    : "1回ごとに1文。日をまたぐ記録もそのまま書けます。"}
                </div>

                <div style=${{ ...S.label, marginTop: 18 }}>行動名の位置</div>
                <div style=${{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  ${NAME_POS.map(([k, label]) => html`<button key=${k} onClick=${() => patchActivity(ea.id, { namePos: k })} style=${pill((ea.namePos ?? "head") === k)}>${label}</button>`)}
                </div>
                <div style=${{ fontSize: 10, color: MUTED, marginTop: 6, lineHeight: 1.6, fontFamily: "'Hiragino Sans','Yu Gothic',system-ui,sans-serif" }}>
                  ${NAME_POS.filter(([k]) => k !== "none").map(([k, label]) => html`<div key=${k}>${label}：${previewOf(style, { ...ea, namePos: k }, viewDay)}</div>`)}
                </div>
                ${ea.namePos !== "none" && html`
                  <div style=${{ fontSize: 10, color: MUTED, margin: "10px 0 5px" }}>行動名のあとに付く助詞</div>
                  <div style=${{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    ${particles.map((pp) => html`
                      <span key=${pp || "none"} style=${{ display: "inline-flex" }}>
                        <button onClick=${() => { const sel = (ea.np ?? "を") === pp; sel ? setNewWord({ kind: "particle", join: pp, plain: "", polite: "", original: pp }) : patchActivity(ea.id, { np: pp }); }} style=${pill((ea.np ?? "を") === pp)}>${pp || "なし"}</button>
                        ${pp && !PARTICLES.includes(pp) && html`<button onClick=${() => removeWord("particle", pp)} aria-label="この助詞を削除" style=${{ ...S.ghost, borderLeft: "none", padding: "7px 6px" }}>×</button>`}
                      </span>`)}
                    <button onClick=${() => setNewWord({ kind: "particle", join: "", plain: "", polite: "" })} style=${{ ...S.ghost, padding: "7px 10px", borderStyle: "dashed" }}>＋追加</button>
                  </div>
                  ${renderNewWordForm("particle")}
                `}

                <div style=${{ ...S.label, marginTop: 20 }}>開始</div>
                <div style=${{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                  ${SP_PARTICLES.map((pp) => html`<button key=${pp || "none"} onClick=${() => patchActivity(ea.id, { sp: pp })} style=${pill((ea.sp ?? "に") === pp)}>◯時${pp || "（なし）"}</button>`)}
                </div>
                ${ea.merge !== false ? html`
                  <div style=${{ fontSize: 10, color: MUTED, lineHeight: 1.6 }}>開始の言葉は「1回ずつ書く」にすると選べます。</div>
                  ` : html`
                  <div style=${{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    ${startWords.map((w) => html`
                      <span key=${wordKey(w)} style=${{ display: "inline-flex" }}>
                        <button onClick=${() => { const sel = (ea.startWord?.join ?? "") === (w.join ?? ""); sel ? setNewWord({ kind: "start", join: w.join || "", plain: w.plain || "", polite: w.polite || "", original: w }) : patchActivity(ea.id, { startWord: w }); }} style=${pill((ea.startWord?.join ?? "") === (w.join ?? ""))}>${w.label || w.join}</button>
                        ${w.custom && html`<button onClick=${() => removeWord("start", w)} aria-label="この言葉を削除" style=${{ ...S.ghost, borderLeft: "none", padding: "7px 6px" }}>×</button>`}
                      </span>`)}
                    <button onClick=${() => setNewWord({ kind: "start", join: "", plain: "", polite: "" })} style=${{ ...S.ghost, padding: "7px 10px", borderStyle: "dashed" }}>＋追加</button>
                  </div>
                  ${renderNewWordForm("start")}
                `}

                <div style=${{ ...S.label, marginTop: 20 }}>終了</div>
                <div style=${{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                  ${EP_PARTICLES.map((pp) => html`<button key=${pp || "none"} onClick=${() => patchActivity(ea.id, { ep: pp })} style=${pill((ea.ep ?? "に") === pp)}>◯時${pp || "（なし）"}</button>`)}
                </div>
                <div style=${{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  ${endWords.map((w) => html`
                    <span key=${wordKey(w)} style=${{ display: "inline-flex" }}>
                      <button onClick=${() => { const sel = (ea.endWord?.plain ?? "") === w.plain; sel ? setNewWord({ kind: "end", join: "", plain: w.plain || "", polite: w.polite || "", link: w.link || "", original: w }) : patchActivity(ea.id, { endWord: w }); }} style=${pill((ea.endWord?.plain ?? "") === w.plain)}>${w.label || w.plain}</button>
                      ${w.custom && html`<button onClick=${() => removeWord("end", w)} aria-label="この言葉を削除" style=${{ ...S.ghost, borderLeft: "none", padding: "7px 6px" }}>×</button>`}
                    </span>`)}
                  <button onClick=${() => setNewWord({ kind: "end", join: "", plain: "", polite: "", link: "" })} style=${{ ...S.ghost, padding: "7px 10px", borderStyle: "dashed" }}>＋追加</button>
                </div>
                ${renderNewWordForm("end")}

                ${ea.merge !== false && html`
                  <button onClick=${() => patchActivity(ea.id, { showTotal: ea.showTotal === false })} style=${{ ...pill(ea.showTotal !== false), marginTop: 16 }}>合計を出す</button>
                `}
              `}

              ${ea.diary === "name" && html`
                <div style=${{ ...S.label, marginTop: 18 }}>行動名のあとに付く助詞</div>
                <div style=${{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                  ${particles.map((pp) => html`
                    <span key=${pp || "none"} style=${{ display: "inline-flex" }}>
                      <button onClick=${() => { const sel = (ea.np ?? "を") === pp; sel ? setNewWord({ kind: "particle", join: pp, plain: "", polite: "", original: pp }) : patchActivity(ea.id, { np: pp }); }} style=${pill((ea.np ?? "を") === pp)}>${pp || "なし"}</button>
                      ${pp && !PARTICLES.includes(pp) && html`<button onClick=${() => removeWord("particle", pp)} aria-label="この助詞を削除" style=${{ ...S.ghost, borderLeft: "none", padding: "7px 6px" }}>×</button>`}
                    </span>`)}
                  <button onClick=${() => setNewWord({ kind: "particle", join: "", plain: "", polite: "" })} style=${{ ...S.ghost, padding: "7px 10px", borderStyle: "dashed" }}>＋追加</button>
                </div>
                ${renderNewWordForm("particle")}
                <div style=${S.label}>使う言葉</div>
                <div style=${{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  ${endWords.map((w) => html`
                    <span key=${wordKey(w)} style=${{ display: "inline-flex" }}>
                      <button onClick=${() => { const sel = (ea.endWord?.plain ?? "") === w.plain; sel ? setNewWord({ kind: "end", join: "", plain: w.plain || "", polite: w.polite || "", link: w.link || "", original: w }) : patchActivity(ea.id, { endWord: w }); }} style=${pill((ea.endWord?.plain ?? "") === w.plain)}>${w.label || w.plain}</button>
                      ${w.custom && html`<button onClick=${() => removeWord("end", w)} aria-label="この言葉を削除" style=${{ ...S.ghost, borderLeft: "none", padding: "7px 6px" }}>×</button>`}
                    </span>`)}
                  <button onClick=${() => setNewWord({ kind: "end", join: "", plain: "", polite: "", link: "" })} style=${{ ...S.ghost, padding: "7px 10px", borderStyle: "dashed" }}>＋追加</button>
                </div>
                ${renderNewWordForm("end")}
              `}

              ${ea.diary !== "off" && html`
                <div style=${{ ...S.label, marginTop: 22 }}>ほかの行動と重なったとき</div>
                <div style=${{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  ${overlapWords.map((w) => html`
                    <span key=${w || "none"} style=${{ display: "inline-flex" }}>
                      <button onClick=${() => { const sel = (ea.overlap ?? "") === w; sel ? setNewWord({ kind: "overlap", join: w, plain: "", polite: "", original: w }) : patchActivity(ea.id, { overlap: w }); }} style=${pill((ea.overlap ?? "") === w)}>${w || "分けて書く"}</button>
                      ${w && !OVERLAP_WORDS.includes(w) && html`<button onClick=${() => removeWord("overlap", w)} aria-label="この言葉を削除" style=${{ ...S.ghost, borderLeft: "none", padding: "7px 6px" }}>×</button>`}
                    </span>`)}
                  <button onClick=${() => setNewWord({ kind: "overlap", join: "", plain: "", polite: "" })} style=${{ ...S.ghost, padding: "7px 10px", borderStyle: "dashed" }}>＋追加</button>
                </div>
                ${renderNewWordForm("overlap")}
                <div style=${{ fontSize: 10, color: MUTED, marginTop: 6, lineHeight: 1.7 }}>
                  ${ea.overlap ? `先に始まっていた行動${ea.overlap}…と続けます。` : `${ea.name}は、重なっていても独立した文で書きます。`}
                </div>
                <button onClick=${() => patchActivity(ea.id, { inIntro: ea.inIntro === false })} style=${{ ...pill(ea.inIntro !== false), marginTop: 12 }}>はじめの一文に名前を入れる</button>
              `}

              <div style=${{ display: "flex", gap: 8, marginTop: 16 }}>
                <button onClick=${() => setEditingActivity(null)} style=${{ ...S.ghost, flex: 1, padding: 9, fontSize: 12 }}>閉じる</button>
                <button onClick=${() => removeActivity(ea.id)} style=${{ ...S.ghost, color: ALERT, borderColor: ALERT, padding: 9, fontSize: 12 }}>この行動を削除</button>
              </div>
            </div>`}
          </div>`}

          <button onClick=${() => setSettingsOpen(settingsOpen === "data" ? null : "data")} aria-expanded=${settingsOpen === "data"}
            style=${{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", marginTop: 4, background: "transparent", border: "none", borderBottom: `${settingsOpen === "data" ? 2 : 1}px solid ${settingsOpen === "data" ? INK : RULE}`, fontSize: 13, letterSpacing: "0.1em", color: INK, cursor: "pointer" }}>
            <span>保存とデータ</span><span style=${{ fontSize: 11, color: MUTED }}>${settingsOpen === "data" ? "▲" : "▼"}</span>
          </button>
          ${settingsOpen === "data" && html`
          <div style=${{ paddingTop: 16 }}>
          <div style=${S.label}>保存の状態</div>
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
              <textarea readOnly value=${dataText} rows="8" onFocus=${(e) => e.target.select()}
                style=${{ ...S.input, width: "100%", fontSize: 11, lineHeight: 1.5, fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace", resize: "vertical" }} />
              <div style=${{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                <button onClick=${copyData} style=${{ flex: 1, minWidth: 110, padding: 10, background: dataCopied ? CARD : INK, color: dataCopied ? MUTED : PAPER, border: `1px solid ${dataCopied ? RULE : INK}`, fontSize: 13 }}>
                  ${dataCopied ? "コピーしました" : "すべてコピー"}
                </button>
                <button onClick=${() => setDataText(null)} style=${{ ...S.ghost, padding: "10px 12px", fontSize: 12 }}>閉じる</button>
              </div>
            </div>`}

          <div style=${{ ...S.label, marginTop: 22 }}>書き出したものを読み込む</div>
          <textarea value=${importText} onInput=${(e) => { setImportText(e.target.value); setImportMsg(""); }} rows="3" placeholder="ここに「まるごと書き出す」の中身を貼る"
            style=${{ ...S.input, width: "100%", fontSize: 11, lineHeight: 1.5, fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace", resize: "vertical" }} />
          <div style=${{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            <button onClick=${mergeRecords} disabled=${!importText.trim()} style=${{ ...S.ghost, color: importText.trim() ? INK : MUTED, padding: "9px 12px", fontSize: 12 }}>記録だけ足す</button>
            <button onClick=${replaceAll} disabled=${!importText.trim()} style=${{ ...S.ghost, color: importText.trim() ? ALERT : MUTED, borderColor: importText.trim() ? ALERT : RULE, padding: "9px 12px", fontSize: 12 }}>すべて置き換える</button>
          </div>
          ${importMsg && html`<div style=${{ fontSize: 11, color: MUTED, marginTop: 8 }}>${importMsg}</div>`}
          </div>`}
        </div>`}
    </div>`;
}

render(html`<${App} />`, document.getElementById("root"));

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
