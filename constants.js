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
];

export const VERB_PRESETS = [
  { plain: "した", polite: "しました" },
  { plain: "とった", polite: "とりました" },
  { plain: "終わらせた", polite: "終わらせました" },
  { plain: "過ごした", polite: "過ごしました" },
  { plain: "済ませた", polite: "済ませました" },
  { plain: "だった", polite: "でした" },
];

export const START_PRESETS = [
  { join: "始めて", plain: "始めた", polite: "始めました" },
  { join: "取り掛かり", plain: "取り掛かった", polite: "取り掛かりました" },
  { join: "出発して", plain: "出発した", polite: "出発しました" },
  { join: "出て", plain: "出た", polite: "出ました" },
  { join: "発って", plain: "発った", polite: "発ちました" },
  { join: "寝て", plain: "寝た", polite: "寝ました" },
  { join: "入って", plain: "入った", polite: "入りました" },
];

export const END_PRESETS = [
  { plain: "終えた", polite: "終えました" },
  { plain: "終わらせた", polite: "終わらせました" },
  { plain: "到着した", polite: "到着しました" },
  { plain: "着いた", polite: "着きました" },
  { plain: "起きた", polite: "起きました" },
  { plain: "帰宅した", polite: "帰宅しました" },
  { plain: "戻った", polite: "戻りました" },
  { plain: "出た", polite: "出ました" },
];

const base = { diary: "span", verbPlain: "した", verbPolite: "しました", showTotal: true, timeFirst: false, inIntro: true, sp: "に", ep: "に" };

export const DEFAULT_ACTIVITIES = [
  { ...base, id: "a1", name: "仕事", color: "#D2542F" },
  {
    ...base, id: "a2", name: "睡眠", color: "#2E4A7D", diary: "points", inIntro: false, showName: false,
    startWord: START_PRESETS[5], endWord: END_PRESETS[4],
  },
  {
    ...base, id: "a3", name: "移動", color: "#3E8E7E", diary: "points", showName: false,
    startWord: START_PRESETS[2], endWord: END_PRESETS[2],
  },
  { ...base, id: "a4", name: "事務作業", color: "#8A5AA8", verbPlain: "終わらせた", verbPolite: "終わらせました" },
  { ...base, id: "a5", name: "食事", color: "#E0A020", diary: "name", verbPlain: "とった", verbPolite: "とりました" },
  { ...base, id: "a6", name: "休憩", color: "#7C8A7E", diary: "name", verbPlain: "とった", verbPolite: "とりました" },
];

export const DEFAULT_STYLE = { tone: "polite", timeFmt: "colon", weather: true, intro: true, summary: true, overlapPhrase: "none" };
export const DEFAULT_TEMPLATES = [{ id: "t1", label: "締めの一文", text: "今日もおつかれさま。", auto: "none" }];

export const STORE_KEY = "timetrack-v3";
export const FORMS = [
  ["span", "期間で書く"],
  ["points", "開始と終了で書く"],
  ["name", "名前だけ"],
  ["off", "載せない"],
];

/* 古い形の保存データを今の形に直す */
export function normalize(a) {
  const n = { ...base, ...a };
  if (!a.diary) {
    if (a.detail === "off") n.diary = "off";
    else if (a.detail === "name") n.diary = "name";
    else if (a.sleep) n.diary = "points";
    else n.diary = "span";
  }
  if (a.sleep && !a.startWord) { n.startWord = START_PRESETS[5]; n.endWord = END_PRESETS[4]; n.inIntro = false; n.showName = false; }
  if (n.diary === "points" && !n.startWord) { n.startWord = START_PRESETS[0]; n.endWord = END_PRESETS[0]; }
  if (n.showName === undefined) n.showName = n.diary === "points" ? true : false;
  delete n.detail;
  delete n.sleep;
  return n;
}

export { uid };
