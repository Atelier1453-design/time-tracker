/* ── 日記の文章生成（仕様書 5章）──────────────────────────────
   ここは試作版（time-tracker.jsx）のロジックをそのまま移植したもの。
   変えていません。 */

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
export const uid = () => Math.random().toString(36).slice(2, 9);

/* ctx = { style, templates, place, viewDay, dayEnd, now, day, dayRecords, act }
   day        … その日のバー表示用に切り出された区間（{activityId, from, to}）
   dayRecords … その日にかかっている生の記録（{id, activityId, start, end}）
   act(id)    … 行動IDから行動オブジェクトを引く関数 */

export const t_ = (style, polite, plain) => (style.tone === "polite" ? polite : plain);

export const fmtTime = (style, ms) => {
  const d = new Date(ms);
  if (style.timeFmt === "colon") return hhmm(ms);
  const m = d.getMinutes();
  return m === 0 ? `${d.getHours()}時` : `${d.getHours()}時${m}分`;
};

/* 「」（空文字＝なし）は正規の値として扱い、フォールバックしない。
   フォールバックするのは値が未設定（null/undefined）のときだけ。 */
export const verbOf = (style, a) => {
  const v = style.tone === "polite" ? a.verbPolite : a.verbPlain;
  if (v != null) return v;
  return style.tone === "polite" ? "しました" : "した";
};
export const finalOf = (style, w) => (style.tone === "polite" ? w?.polite || w?.plain || "" : w?.plain || "");

export const pointsSentence = (style, a, st, en, hasStart, hasEnd) => {
  const fmt = (ms) => fmtTime(style, ms);
  const prefix = a.showName ? `${a.name}は` : "";
  const sp = a.sp || "に", ep = a.ep || "に";
  if (hasStart && hasEnd)
    return `${prefix}${fmt(st)}${sp}${a.startWord?.join || ""}、${fmt(en)}${ep}${finalOf(style, a.endWord)}。`;
  if (hasStart) return `${prefix}${fmt(st)}${sp}${finalOf(style, a.startWord)}。`;
  return `${prefix}${fmt(en)}${ep}${finalOf(style, a.endWord)}。`;
};

const valid = (s) => s.end == null || s.end > s.start;

/* 「名前だけ」型の文。verb が空（「なし」を選んだ）なら動詞なしで名前だけ言い切る。 */
const nameSentence = (style, a) => {
  const verb = verbOf(style, a);
  return verb ? `${a.name}を${verb}。` : `${a.name}。`;
};

/* 「期間で書く」型の文。timeFirst なら時間を先に、名前をあとに言う。
   「名前だけ」型でだけ選べる「なし」を、型を切り替えたあとに引き継いでいた
   場合は、動詞なしの文にならないようふつうの言い方に戻す。 */
const spanSentence = (style, a, spans, ms) => {
  const verb = verbOf(style, a) || (style.tone === "polite" ? "しました" : "した");
  const total = a.showTotal === false ? "" : `（合計${dur(ms)}）`;
  return a.timeFirst
    ? `${spans}${a.name}を${verb}。${total}`
    : `${a.name}を${spans}${verb}。${total}`;
};

export const sentencesFor = (ctx, a) => {
  const { style, viewDay, dayEnd, now, day, dayRecords } = ctx;
  const fmt = (ms) => fmtTime(style, ms);
  if (a.diary === "off") return [];
  if (a.diary === "name") return [nameSentence(style, a)];
  if (a.diary === "points") {
    return dayRecords.filter((s) => s.activityId === a.id && valid(s)).map((s) => {
      const end = s.end ?? now;
      const hasStart = s.start >= viewDay && s.start < dayEnd;
      const hasEnd = end > viewDay && end <= dayEnd;
      if (!hasStart && !hasEnd) return null;
      return pointsSentence(style, a, s.start, end, hasStart, hasEnd);
    }).filter(Boolean);
  }
  const segs = day.filter((s) => s.activityId === a.id);
  if (!segs.length) return [];
  const spans = segs.map((s) => `${fmt(s.from)}から${fmt(s.to)}まで`).join("、");
  const ms = segs.reduce((n, s) => n + (s.to - s.from), 0);
  return [spanSentence(style, a, spans, ms)];
};

export const previewOf = (style, a, viewDay) => {
  const st = viewDay + 9 * 3600000, en = viewDay + 18 * 3600000;
  const fmt = (ms) => fmtTime(style, ms);
  if (a.diary === "off") return "（日記には出ません）";
  if (a.diary === "name") return nameSentence(style, a);
  if (a.diary === "points") return pointsSentence(style, a, st, en, true, true);
  return spanSentence(style, a, `${fmt(st)}から${fmt(en)}まで`, 9 * 3600000);
};

/* ── 同時進行の記録を1文にまとめる（例：「仕事中に休憩をとった。」）──
   短い方の記録が長い方の記録にすっぽり収まっている（入れ子になっている）
   場合だけ対象にする。またがっているだけの記録は今まで通り別々に書く。 */
const OVERLAP_JOIN = {
  chu: (outerName) => `${outerName}中に`,
  tochu: (outerName) => `${outerName}の途中で`,
  nagara: (outerName) => `${outerName}をしながら`,
};

const innerPhrase = (style, a, seg) => {
  if (a.diary === "name") {
    const verb = verbOf(style, a);
    return verb ? `${a.name}を${verb}` : a.name;
  }
  const fmt = (ms) => fmtTime(style, ms);
  const verb = verbOf(style, a) || (style.tone === "polite" ? "しました" : "した");
  return `${a.name}を${fmt(seg.from)}から${fmt(seg.to)}まで${verb}`;
};

function findOverlapCombos(day, listed) {
  const combos = new Map(); // outerActivityId -> { text, innerId }
  const eligible = listed.filter((a) => a.diary === "span" || a.diary === "name");
  for (const outer of eligible) {
    const outerSegs = day.filter((s) => s.activityId === outer.id);
    if (outerSegs.length !== 1 || outer.diary !== "span") continue;
    const outerSeg = outerSegs[0];
    let best = null;
    for (const inner of eligible) {
      if (inner.id === outer.id) continue;
      const innerSegs = day.filter((s) => s.activityId === inner.id);
      if (innerSegs.length !== 1) continue;
      const innerSeg = innerSegs[0];
      const innerLen = innerSeg.to - innerSeg.from, outerLen = outerSeg.to - outerSeg.from;
      if (innerSeg.from >= outerSeg.from && innerSeg.to <= outerSeg.to && innerLen < outerLen) {
        if (!best || innerLen < best.len) best = { inner, seg: innerSeg, len: innerLen };
      }
    }
    if (best) combos.set(outer.id, { innerId: best.inner.id, seg: best.seg, innerAct: best.inner, outerSeg });
  }
  return combos;
}

export const composeOverlapSentence = (style, overlapPhrase, outerAct, combo) => {
  const join = OVERLAP_JOIN[overlapPhrase];
  if (!join) return null;
  return `${join(outerAct.name)}${innerPhrase(style, combo.innerAct, combo.seg)}。`;
};

export const fillPlaceholders = (text, viewDay, w) =>
  text.replace(/\{日付\}/g, fullDateLabel(viewDay)).replace(/\{天気\}/g, w?.summary ?? "").replace(/\{曜日\}/g, WEEK[new Date(viewDay).getDay()]);

/* ctx に加えて weather(その日の天気 or null)、activities(byTime順に並べたもの)を渡す */
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
    const overlapPhrase = style.overlapPhrase || "none";
    const combos = overlapPhrase !== "none" ? findOverlapCombos(day, listed) : new Map();
    const consumedIds = new Set();
    combos.forEach((combo) => consumedIds.add(combo.innerId));
    for (const a of listed) {
      if (combos.has(a.id)) {
        const sentence = composeOverlapSentence(style, overlapPhrase, a, combos.get(a.id));
        if (sentence) { body.push(sentence); continue; }
      }
      if (consumedIds.has(a.id)) continue;
      body.push(...sentencesFor(ctx, a));
    }
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
