import { uid } from "./diary.js";

/* ── palette ──────────────────────────────────────────────── */
export const INK = "#16202B";
export const PAPER = "#F2F3F1";
export const CARD = "#FBFBFA";
export const RULE = "#CBD0CA";
export const MUTED = "#6C7570";
export const ALERT = "#B03A2E";

export const SWATCHES = [
  "#D2542F", "#2E4A7D", "#3E8E7E", "#8A5AA8",
  "#E0A020", "#7C8A7E", "#B03A5B", "#4B7BA8",
  "#6E8B3D", "#A8642A", "#5C5470", "#2F7F6F",
  "#C23B3B", "#3A6EA5", "#5FA8D3", "#9C6ADE",
  "#D98CB3", "#4E9F50", "#B8A13A", "#DE7C3E",
  "#7A7A7A", "#3D3D3D", "#946B4D", "#1E6B5C",
];

/* 名前のあとに付く助詞 */
export const PARTICLES = ["を", "は", "が", "で", "、", ""];
export const SP_PARTICLES = ["に", "から", "、"];
export const EP_PARTICLES = ["に", "まで", ""];
export const NAME_POS = [["head", "文頭"], ["mid", "文中"], ["tail", "文後"], ["none", "入れない"]];

/* 開始の言葉：join=文をつなぐ形、plain/polite=言い切る形 */
export const START_PRESETS = [
  { label: "（言葉なし）", join: "", plain: "", polite: "" },
  { join: "始めて", plain: "始めた", polite: "始めました" },
  { join: "取り掛かり", plain: "取り掛かった", polite: "取り掛かりました" },
  { join: "出発して", plain: "出発した", polite: "出発しました" },
  { join: "出て", plain: "出た", polite: "出ました" },
  { join: "発って", plain: "発った", polite: "発ちました" },
  { join: "寝て", plain: "寝た", polite: "寝ました" },
  { join: "入って", plain: "入った", polite: "入りました" },
];

/* 終了の言葉：言い切る形だけ。文全体の締めにも使う */
export const END_PRESETS = [
  { label: "（言葉なし）", plain: "", polite: "" },
  { plain: "した", polite: "しました" },
  { plain: "とった", polite: "とりました" },
  { plain: "終わらせた", polite: "終わらせました" },
  { plain: "済ませた", polite: "済ませました" },
  { plain: "していた", polite: "していました" },
  { plain: "過ごした", polite: "過ごしました" },
  { plain: "だった", polite: "でした" },
  { plain: "終えた", polite: "終えました" },
  { plain: "到着した", polite: "到着しました" },
  { plain: "着いた", polite: "着きました" },
  { plain: "起きた", polite: "起きました" },
  { plain: "帰宅した", polite: "帰宅しました" },
  { plain: "戻った", polite: "戻りました" },
  { plain: "出た", polite: "出ました" },
];

export const wordKey = (w) => w.label || w.join || w.plain || "none";

/* overlap はここに含めない。base に含めると、古いデータの移行時に
   「未設定」を判定できなくなり、以前の全体設定からの引き継ぎが効かなくなる。
   overlap は normalize() の最後で決める。 */
const base = {
  diary: "time", merge: true, namePos: "head", np: "を",
  sp: "から", ep: "まで",
  startWord: START_PRESETS[0], endWord: END_PRESETS[1],
  showTotal: true, inIntro: true,
};

export const DEFAULT_ACTIVITIES = [
  { ...base, id: "a1", name: "仕事", color: "#D2542F", overlap: "" },
  {
    ...base, id: "a2", name: "睡眠", color: "#2E4A7D", merge: false, namePos: "none",
    sp: "に", ep: "に", startWord: START_PRESETS[6], endWord: END_PRESETS[11], inIntro: false,
  },
  {
    ...base, id: "a3", name: "移動", color: "#3E8E7E", merge: false, namePos: "none",
    sp: "に", ep: "に", startWord: START_PRESETS[3], endWord: END_PRESETS[9],
  },
  { ...base, id: "a4", name: "事務作業", color: "#8A5AA8", endWord: END_PRESETS[3] },
  { ...base, id: "a5", name: "食事", color: "#E0A020", diary: "name", endWord: END_PRESETS[2] },
  { ...base, id: "a6", name: "休憩", color: "#7C8A7E", diary: "name", endWord: END_PRESETS[2] },
];

export const DEFAULT_STYLE = { tone: "polite", timeFmt: "colon", timeSys: "24", weather: true, intro: true, summary: true };
export const OVERLAP_WORDS = ["", "の途中で", "の途中から", "の間に", "をしながら", "と同時に"];
export const DEFAULT_TEMPLATES = [{ id: "t1", label: "締めの一文", text: "今日もおつかれさま。", auto: "none" }];

export const STORE_KEY = "timetrack-v3";
export const FORMS = [
  ["time", "時刻を入れて書く"],
  ["name", "名前だけ"],
  ["off", "載せない"],
];

/* 以前このアプリで使っていた「重なりの書き方（全体でひとつ）」設定から、
   新しい「行動ごとの重なりの言葉」への変換表。 */
export const OVERLAP_STYLE_MIGRATE = { none: "", chu: "中に", tochu: "の途中で", nagara: "をしながら" };

/* 古い保存データの形をいまの形に直す。
   ・とても古い試作（span/points/detail/sleep）
   ・このアプリが以前使っていた形（span/points/name/off ＋ verbPlain/verbPolite/timeFirst/showName など）
   ・すでにいまの形（time/name/off ＋ merge/namePos/np/overlap など）
   のどれが来ても正しく直る。
   globalOverlap … 以前の「重なりの書き方」が全体設定だった名残を、行動ごとの初期値として引き継ぐ。 */
export function normalize(a, globalOverlap) {
  const n = { ...base, ...a };

  if (a.diary === "span" || (!a.diary && a.detail !== "name" && a.detail !== "off" && !a.sleep)) {
    n.diary = "time";
    n.merge = true;
    n.sp = "から";
    n.ep = "まで";
    n.startWord = START_PRESETS[0];
    n.endWord = { plain: a.verbPlain || "した", polite: a.verbPolite || "しました" };
    n.np = a.particle ?? "を";
    n.namePos = a.timeFirst || a.order === "time" ? "tail" : "head";
  } else if (a.diary === "points" || a.sleep) {
    n.diary = "time";
    n.merge = false;
    n.np = a.np ?? "は";
    n.namePos = a.showName === false ? "none" : a.order === "time" ? "mid" : "head";
    if (a.sleep && !a.startWord) { n.startWord = START_PRESETS[6]; n.endWord = END_PRESETS[11]; n.namePos = "none"; n.inIntro = false; }
    if (!n.startWord) n.startWord = START_PRESETS[1];
    if (!n.endWord) n.endWord = END_PRESETS[8];
  } else if (a.diary === "name" || a.detail === "name") {
    n.diary = "name";
    n.np = a.particle ?? a.np ?? "を";
    if (!a.endWord) {
      /* このアプリの「なし」（verbPlain===""）は「（言葉なし）」として引き継ぐ。
         「休憩を。」のように助詞だけ残って不自然にならないよう、助詞も外す。 */
      if (a.verbPlain === "") {
        n.endWord = { plain: "", polite: "" };
        n.np = a.particle ?? a.np ?? "";
      } else {
        n.endWord = { plain: a.verbPlain || "した", polite: a.verbPolite || "しました" };
      }
    }
  } else if (a.diary === "off" || a.detail === "off") {
    n.diary = "off";
  }
  /* それ以外（diary が既に "time"/"name"/"off" で merge 等も揃っている）はそのまま通す */

  if (n.overlap === undefined) n.overlap = globalOverlap ?? "の途中で";
  if (n.namePos === undefined) n.namePos = "head";
  if (n.np === undefined) n.np = "を";
  delete n.detail; delete n.sleep; delete n.particle;
  delete n.verbPlain; delete n.verbPolite; delete n.order; delete n.showName; delete n.timeFirst;
  return n;
}

export { uid };
