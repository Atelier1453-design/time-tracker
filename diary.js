/* ── 日記の文章生成 ────────────────────────────────────────────
   「動くお手本」time-tracker.jsx のロジックを移植したもの。 */

export const DAY = 86400000;

export const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const hhmm = (t) => { const d = new Date(t); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; };
export const clock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
export const dur = (ms) => {
  const m = Math.round(ms / 60000), h = Math.floor(m / 60), mm = m % 60;
  if (h === 0) return `${mm}分`;
  return mm === 0 ? `${h}時間` : `${h}時間${mm}分`;
};
export const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
export const dateLabel = (t) => { const d = new Date(t); return `${d.getMonth() + 1}月${d.getDate()}日（${WEEK[d.getDay()]}）`; };
export const fullDateLabel = (t) => { const d = new Date(t); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WEEK[d.getDay()]}）`; };
export const dateKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const toTimeInput = (t) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
export const onDay = (dayMs, value) => { const [h, m] = String(value).split(":").map(Number); const d = new Date(dayMs); d.setHours(h || 0, m || 0, 0, 0); return d.getTime(); };
/* 時刻はそのままに、日付だけを "YYYY-MM-DD" に差し替える */
export const onDate = (t, value) => { const [y, m, day] = String(value).split("-").map(Number); const d = new Date(t); if (y) d.setFullYear(y, (m || 1) - 1, day || 1); return d.getTime(); };
export const uid = () => Math.random().toString(36).slice(2, 9);

/* ctx = { style, viewDay, dayEnd, now, day, dayRecords, act }
   day        … その日のバー表示用に切り出された区間（{activityId, from, to, memo}）
   dayRecords … その日にかかっている生の記録（{id, activityId, start, end, memo}）
   act(id)    … 行動IDから行動オブジェクトを引く関数 */

export const t_ = (style, polite, plain) => (style.tone === "polite" ? polite : plain);

export const fmtTime = (style, ms) => {
  const d = new Date(ms);
  let h = d.getHours();
  const m = d.getMinutes();
  let head = "";
  if (style.timeSys === "12") { head = h < 12 ? "午前" : "午後"; h = h % 12 || 12; }
  if (style.timeFmt === "colon") return `${head}${h}:${String(m).padStart(2, "0")}`;
  return `${head}${h}時${m ? `${m}分` : ""}`;
};

/* 「」（空文字）は「（言葉なし）」を選んだという正規の値。
   フォールバックするのは値が未設定（null/undefined）のときだけ。 */
export const finalOf = (style, w) => (style.tone === "polite" ? w?.polite ?? w?.plain ?? "" : w?.plain ?? "");
export const nameChunk = (a) => `${a.name}${a.np ?? "を"}`;
const strip = (x) => x.replace(/。$/, "");
export const memoOf = (segs) => {
  const notes = segs.map((x) => (x.memo || "").trim()).filter(Boolean);
  return notes.length ? `（${[...new Set(notes)].join("、")}）` : "";
};

/* 1つの記録から1文：名前 / 開始時刻+助詞+言葉 / 終了時刻+助詞+言葉 */
export const oneSentence = (style, a, st, en, hasStart, hasEnd, memo = "") => {
  const fmt = (ms) => fmtTime(style, ms);
  const sw = a.startWord || {}, ew = a.endWord || {};
  const sp = a.sp ?? "に", ep = a.ep ?? "に";
  const pos = a.namePos ?? "head";
  const N = pos === "none" ? "" : nameChunk(a);
  const sFin = finalOf(style, sw), eFin = finalOf(style, ew);

  if (hasStart && hasEnd) {
    const S = `${fmt(st)}${sp}`;
    const E = `${fmt(en)}${ep}`;
    const J = sw.join ? `${sw.join}、` : "";
    if (pos === "mid") return `${S}${N}${J}${E}${eFin}${memo}。`;
    if (pos === "tail") return `${S}${J}${E}${N}${eFin}${memo}。`;
    return `${N}${S}${J}${E}${eFin}${memo}。`;
  }
  if (hasStart) {
    const w = sFin || eFin;
    if (pos === "head") return `${N}${fmt(st)}${sp}${w}${memo}。`;
    return `${fmt(st)}${sp}${N}${w}${memo}。`;
  }
  if (pos === "head") return `${N}${fmt(en)}${ep}${eFin}${memo}。`;
  return `${fmt(en)}${ep}${N}${eFin}${memo}。`;
};

/* 同じ行動の複数区間を1文にまとめる */
export const mergedSentence = (style, a, segs) => {
  const fmt = (ms) => fmtTime(style, ms);
  const sp = a.sp ?? "から", ep = a.ep ?? "まで";
  const pos = a.namePos ?? "head";
  const N = pos === "none" ? "" : nameChunk(a);
  const eFin = finalOf(style, a.endWord);
  /* 文中は、最初の時刻のすぐあとに行動名を置く */
  const spans = segs
    .map((x, i) => `${fmt(x.from)}${sp}${pos === "mid" && i === 0 ? N : ""}${fmt(x.to)}${ep}`)
    .join("、");
  const memo = memoOf(segs);
  if (pos === "head") return `${N}${spans}${eFin}${memo}。`;
  if (pos === "mid") return `${spans}${eFin}${memo}。`;
  return `${spans}${N}${eFin}${memo}。`;
};

/* この区間が「重なり」の相手を持つか。持つなら、先に始まっていた方（＝主）を返す。 */
const hostOf = (ctx, seg, a) => {
  if (!a.overlap) return null;
  const cands = ctx.day.filter((o) => o.activityId !== seg.activityId && o.from < seg.from && o.to > seg.from);
  if (!cands.length) return null;
  return ctx.act(cands.sort((x, y) => x.from - y.from)[0].activityId);
};

const valid = (s) => s.end == null || s.end > s.start;

export const sentencesFor = (ctx, a) => {
  const { style, viewDay, dayEnd, now, day, dayRecords } = ctx;

  if (a.diary === "off") return [];

  if (a.diary === "name") {
    const segs = day.filter((s) => s.activityId === a.id);
    if (!segs.length) return [];
    const out = [];
    const nested = [], plainSegs = [];
    segs.forEach((s) => { const h = hostOf(ctx, s, a); if (h) nested.push({ seg: s, host: h }); else plainSegs.push(s); });
    if (plainSegs.length) out.push(`${nameChunk(a)}${finalOf(style, a.endWord)}${memoOf(plainSegs)}。`);
    nested.forEach(({ seg, host }) => out.push(`${host.name}${a.overlap}${nameChunk(a)}${finalOf(style, a.endWord)}${memoOf([seg])}。`));
    return out;
  }

  const out = [];

  if (a.merge !== false) {
    const segs = day.filter((s) => s.activityId === a.id);
    if (!segs.length) return [];
    const nested = [], plainSegs = [];
    segs.forEach((s) => { const h = hostOf(ctx, s, a); if (h) nested.push({ seg: s, host: h }); else plainSegs.push(s); });
    if (plainSegs.length) {
      const ms = plainSegs.reduce((n, x) => n + (x.to - x.from), 0);
      out.push(`${mergedSentence(style, a, plainSegs)}${a.showTotal === false ? "" : `（合計${dur(ms)}）`}`);
    }
    nested.forEach(({ seg, host }) => out.push(`${host.name}${a.overlap}${strip(mergedSentence(style, a, [seg]))}。`));
    return out;
  }

  /* 1回ずつ書く：実際の時刻を使うので日をまたいでも正しく動く */
  dayRecords.filter((s) => s.activityId === a.id && valid(s)).forEach((s) => {
    const end = s.end ?? now;
    const hasStart = s.start >= viewDay && s.start < dayEnd;
    const hasEnd = end > viewDay && end <= dayEnd;
    if (!hasStart && !hasEnd) return;
    const clipped = day.find((x) => x.id === s.id);
    const host = clipped ? hostOf(ctx, clipped, a) : null;
    const body = oneSentence(style, a, s.start, end, hasStart, hasEnd, memoOf([s]));
    out.push(host ? `${host.name}${a.overlap}${strip(body)}。` : body);
  });
  return out;
};

export const previewOf = (style, a, viewDay) => {
  const st = viewDay + 9 * 3600000, en = viewDay + 18 * 3600000;
  if (a.diary === "off") return "（日記には出ません）";
  if (a.diary === "name") return `${nameChunk(a)}${finalOf(style, a.endWord)}。`;
  if (a.merge !== false)
    return `${mergedSentence(style, a, [{ from: st, to: en }])}${a.showTotal === false ? "" : "（合計9時間）"}`;
  return oneSentence(style, a, st, en, true, true);
};
/* 日をまたいで開始だけがその日に入っている例 */
export const previewHalf = (style, a, viewDay) => oneSentence(style, a, viewDay + 23 * 3600000, viewDay + 30 * 3600000, true, false);

export const fillPlaceholders = (text, viewDay, w) =>
  text.replace(/\{日付\}/g, fullDateLabel(viewDay)).replace(/\{天気\}/g, w?.summary ?? "").replace(/\{曜日\}/g, WEEK[new Date(viewDay).getDay()]);

/* ctx に加えて weather(その日の天気 or null)、activitiesByTime(byTime順に並べたもの) */
export const composeDiary = (ctx, activitiesByTime, w) => {
  const { style, templates, place, viewDay, day, act } = ctx;
  const head = [fullDateLabel(viewDay)];
  if (style.weather && w?.summary) {
    const temps = w.high != null && w.low != null ? `　最高${w.high}度・最低${w.low}度` : "";
    head.push(`${place}　${w.summary}${temps}`);
  }
  head.push("");

  const body = [];
  if (day.length === 0) {
    body.push(t_(style, "この日の記録はありません。", "この日の記録はない。"));
  } else {
    const listed = activitiesByTime.filter((a) => a.diary !== "off");
    if (style.intro) {
      const names = listed.filter((a) => a.inIntro !== false).map((a) => a.name);
      if (names.length) body.push(`今日は${names.join("、")}${t_(style, "をしました。", "をした。")}`);
    }
    for (const a of listed) body.push(...sentencesFor(ctx, a));
    if (style.summary) {
      const sp = day.filter((s) => act(s.activityId)?.inIntro !== false);
      if (sp.length) {
        const first = sp[0], last = sp[sp.length - 1];
        body.push("");
        body.push(`一日は${fmtTime(style, first.from)}の「${act(first.activityId)?.name}」から始まり、${fmtTime(style, last.to)}の「${act(last.activityId)?.name}」まで${t_(style, "記録しました。", "記録した。")}`);
      }
    }
  }

  const top = templates.filter((x) => x.auto === "top" && x.text.trim()).map((x) => fillPlaceholders(x.text, viewDay, w));
  const bottom = templates.filter((x) => x.auto === "bottom" && x.text.trim()).map((x) => fillPlaceholders(x.text, viewDay, w));
  return [...head, ...top, ...(top.length ? [""] : []), ...body, ...(bottom.length ? ["", ...bottom] : [])].join("\n");
};
