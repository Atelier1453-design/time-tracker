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
/* 文末の形。linked（次の文につなげる）が立っていて、かつ「つなげる形」が
   その言葉に用意されていれば、それ＋「、」。それ以外は通常どおり言い切り＋「。」。 */
export const endingOf = (style, w, linked) =>
  linked && w?.link ? { word: w.link, punct: "、" } : { word: finalOf(style, w), punct: "。" };
export const nameChunk = (a) => `${a.name}${a.np ?? "を"}`;
const strip = (x) => x.replace(/。$/, "");
export const memoOf = (segs) => {
  const notes = segs.map((x) => (x.memo || "").trim()).filter(Boolean);
  return notes.length ? `（${[...new Set(notes)].join("、")}）` : "";
};

/* 1つの記録から1文：名前 / 開始時刻+助詞+言葉 / 終了時刻+助詞+言葉
   linked … 次の文につなげるかどうか（trueなら終了の言葉を「つなげる形」＋「、」にする） */
export const oneSentence = (style, a, st, en, hasStart, hasEnd, memo = "", linked = false) => {
  const fmt = (ms) => fmtTime(style, ms);
  const sw = a.startWord || {}, ew = a.endWord || {};
  const sp = a.sp ?? "に", ep = a.ep ?? "に";
  const pos = a.namePos ?? "head";
  const N = pos === "none" ? "" : nameChunk(a);
  const sFin = finalOf(style, sw);
  const { word: eFin, punct } = endingOf(style, ew, linked);

  if (hasStart && hasEnd) {
    const S = `${fmt(st)}${sp}`;
    const E = a.showEndTime === false ? "" : `${fmt(en)}${ep}`;
    const J = sw.join ? `${sw.join}、` : "";
    if (pos === "mid") return `${S}${N}${J}${E}${eFin}${memo}${punct}`;
    if (pos === "tail") return `${S}${J}${E}${N}${eFin}${memo}${punct}`;
    return `${N}${S}${J}${E}${eFin}${memo}${punct}`;
  }
  if (hasStart) {
    const w = sFin || eFin;
    if (pos === "head") return `${N}${fmt(st)}${sp}${w}${memo}${punct}`;
    return `${fmt(st)}${sp}${N}${w}${memo}${punct}`;
  }
  if (pos === "head") return `${N}${fmt(en)}${ep}${eFin}${memo}${punct}`;
  return `${fmt(en)}${ep}${N}${eFin}${memo}${punct}`;
};

/* 同じ行動の複数区間を1文にまとめる */
export const mergedSentence = (style, a, segs, linked = false) => {
  const fmt = (ms) => fmtTime(style, ms);
  const sp = a.sp ?? "から", ep = a.ep ?? "まで";
  const pos = a.namePos ?? "head";
  const N = pos === "none" ? "" : nameChunk(a);
  const { word: eFin, punct } = endingOf(style, a.endWord, linked);
  /* 文中は、最初の時刻のすぐあとに行動名を置く */
  const spans = segs
    .map((x, i) => `${fmt(x.from)}${sp}${pos === "mid" && i === 0 ? N : ""}${a.showEndTime === false ? "" : `${fmt(x.to)}${ep}`}`)
    .join("、");
  const memo = memoOf(segs);
  if (pos === "head") return `${N}${spans}${eFin}${memo}${punct}`;
  if (pos === "mid") return `${spans}${eFin}${memo}${punct}`;
  return `${spans}${N}${eFin}${memo}${punct}`;
};

/* この区間が「重なり」の相手を持つか。持つなら、先に始まっていた方（＝主）を返す。 */
const hostOf = (ctx, seg, a) => {
  if (!a.overlap) return null;
  const cands = ctx.day.filter((o) => o.activityId !== seg.activityId && o.from < seg.from && o.to > seg.from);
  if (!cands.length) return null;
  return ctx.act(cands.sort((x, y) => x.from - y.from)[0].activityId);
};

const valid = (s) => s.end == null || s.end > s.start;

/* それぞれの文に「並べる基準の時刻」を付けて返す（{time, text}の配列）。
   前日から続く記録はその日の0:00にクリップされるので、行動ごとの
   「その日はじめて」の時刻ではなく、文ごとの実際の時刻で全体を並べ替える。
   そうしないと、前夜から続く記録の存在だけで、その行動の別の（本来もっと
   遅い）記録までもが他の行動より不自然に早く書かれてしまう。 */
/* 重なりで従になった文は、まだ「◯◯の間に」などのホストの文言を付けず
   {time, kind:"nested", hostId, hostName, overlap, inner} のまま返す。
   すぐ後で同じホスト・同じ重なりの言葉が連続していたら、composeDiary側で
   1文にまとめてから、はじめてホストの文言を付ける。 */
const nestedEntry = (time, host, overlap, inner) => ({ time, kind: "nested", hostId: host.id, hostName: host.name, overlap, inner });
/* linked … このplainの文が次の文につながっているか（composeDiary側で改行せずくっつける） */
const plainEntry = (time, text, linked) => ({ time, kind: "plain", text, linked: !!linked });

export const sentencesFor = (ctx, a) => {
  const { style, viewDay, dayEnd, now, day, dayRecords } = ctx;

  if (a.diary === "off") return [];

  if (a.diary === "name") {
    const segs = day.filter((s) => s.activityId === a.id);
    if (!segs.length) return [];
    const out = [];
    const nested = [], plainSegs = [];
    segs.forEach((s) => { const h = hostOf(ctx, s, a); if (h) nested.push({ seg: s, host: h }); else plainSegs.push(s); });
    if (plainSegs.length) {
      /* 複数の区間を1文にまとめる場合、「つなげる」かどうかは一番最後の区間のもの（＝文末に来る）で決める */
      const last = plainSegs[plainSegs.length - 1];
      const { word: eFin, punct } = endingOf(style, a.endWord, !!last.linked);
      out.push(plainEntry(plainSegs[0].from, `${nameChunk(a)}${eFin}${memoOf(plainSegs)}${punct}`, last.linked));
    }
    nested.forEach(({ seg, host }) => out.push(nestedEntry(seg.from, host, a.overlap, `${nameChunk(a)}${finalOf(style, a.endWord)}${memoOf([seg])}`)));
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
      const last = plainSegs[plainSegs.length - 1];
      out.push(plainEntry(plainSegs[0].from, `${mergedSentence(style, a, plainSegs, !!last.linked)}${a.showTotal === false ? "" : `（合計${dur(ms)}）`}`, last.linked));
    }
    nested.forEach(({ seg, host }) => out.push(nestedEntry(seg.from, host, a.overlap, strip(mergedSentence(style, a, [seg])))));
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
    const body = oneSentence(style, a, s.start, end, hasStart, hasEnd, memoOf([s]), !!s.linked);
    const time = clipped ? clipped.from : s.start;
    out.push(host ? nestedEntry(time, host, a.overlap, strip(body)) : plainEntry(time, body, s.linked));
  });
  return out;
};

const cleanPunct = (text) => text.replace(/、+(?=。)/g, "");

export const previewOf = (style, a, viewDay) => {
  const st = viewDay + 9 * 3600000, en = viewDay + 18 * 3600000;
  if (a.diary === "off") return "（日記には出ません）";
  if (a.diary === "name") return cleanPunct(`${nameChunk(a)}${finalOf(style, a.endWord)}。`);
  if (a.merge !== false)
    return cleanPunct(`${mergedSentence(style, a, [{ from: st, to: en }])}${a.showTotal === false ? "" : "（合計9時間）"}`);
  return cleanPunct(oneSentence(style, a, st, en, true, true));
};
/* 日をまたいで開始だけがその日に入っている例 */
export const previewHalf = (style, a, viewDay) => cleanPunct(oneSentence(style, a, viewDay + 23 * 3600000, viewDay + 30 * 3600000, true, false));

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

    /* 全ての行動の文を集めて、文ごとの実際の時刻で並べ替える */
    const timed = [];
    for (const a of listed) {
      for (const entry of sentencesFor(ctx, a)) timed.push({ ...entry, activityId: a.id, activityName: a.name, inIntro: a.inIntro });
    }
    timed.sort((x, y) => x.time - y.time);

    if (style.intro) {
      const seen = new Set();
      const names = [];
      for (const t of timed) {
        if (t.inIntro === false || seen.has(t.activityId)) continue;
        seen.add(t.activityId);
        names.push(t.activityName);
      }
      if (names.length) body.push(`今日は${names.join("、")}${t_(style, "をしました。", "をした。")}`);
    }
    /* 同じホスト・同じ重なりの言葉の「従」の文が連続していたら、
       ホストの文言（「◯◯の間に」）を繰り返さず1文にまとめる。
       例：「朝時間の間に食事をとった、プライベートな時間をとった。」 */
    const merged = [];
    for (const t of timed) {
      const last = merged[merged.length - 1];
      if (t.kind === "nested" && last?.kind === "nested" && last.hostId === t.hostId && last.overlap === t.overlap) {
        last.inner += `、${t.inner}`;
      } else {
        merged.push({ ...t });
      }
    }
    /* 行動名の助詞に「、」を選んだ時、文末の「。」の直前に来ると
       「、。」と詰まってしまうことがあるので、その場合だけ「、」を外す。
       linked（次の文につなげる）が立っている文は、改行せず次の文の頭にそのままくっつける。 */
    let carryLinked = false;
    for (const t of merged) {
      const text = t.kind === "nested" ? `${t.hostName}${t.overlap}${t.inner}。` : t.text;
      const cleaned = text.replace(/、+(?=。)/g, "");
      if (carryLinked && body.length) body[body.length - 1] += cleaned;
      else body.push(cleaned);
      carryLinked = t.kind === "plain" && !!t.linked;
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
