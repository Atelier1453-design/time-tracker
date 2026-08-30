/* ── 天気（Open-Meteo）─────────────────────────────────────────
   無料・キー不要。地名から緯度経度を引き、過去日も含めて天気を取る。 */

const WMO_JA = {
  0: "快晴", 1: "晴れ", 2: "晴れ時々曇り", 3: "曇り",
  45: "霧", 48: "霧（霜）",
  51: "霧雨", 53: "霧雨", 55: "強い霧雨",
  56: "着氷性の霧雨", 57: "強い着氷性の霧雨",
  61: "小雨", 63: "雨", 65: "強い雨",
  66: "着氷性の雨", 67: "強い着氷性の雨",
  71: "小雪", 73: "雪", 75: "大雪", 77: "霧雪",
  80: "にわか雨", 81: "にわか雨", 82: "激しいにわか雨",
  85: "にわか雪", 86: "激しいにわか雪",
  95: "雷雨", 96: "雷雨（ひょう）", 99: "激しい雷雨（ひょう）",
};

async function searchOnce(query, lang) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=${lang}&format=json`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data.results || [];
}

/* 地名から候補地を探す。日本語でだめなら英語でも試す（Open-Meteo は
   「東京」のような短い日本語表記だと候補が出ないことがあるため）。 */
export async function geocodeCandidates(query) {
  const q = query.trim();
  if (!q) return [];
  let results = await searchOnce(q, "ja");
  if (!results.length) results = await searchOnce(q, "en");
  return results.map((r) => ({
    lat: r.latitude,
    lon: r.longitude,
    label: [r.name, r.admin1, r.country].filter(Boolean).join(" / "),
  }));
}

function daysBetween(dateStr, todayStr) {
  const a = Date.UTC(...dateStr.split("-").map(Number));
  const b = Date.UTC(...todayStr.split("-").map(Number));
  return Math.round((a - b) / 86400000);
}

async function callDaily(base, lat, lon, dateStr) {
  const url = `${base}?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia%2FTokyo&start_date=${dateStr}&end_date=${dateStr}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("weather-http-" + res.status);
  const data = await res.json();
  const code = data?.daily?.weather_code?.[0];
  if (code == null) throw new Error("weather-no-data");
  const high = data?.daily?.temperature_2m_max?.[0];
  const low = data?.daily?.temperature_2m_min?.[0];
  return {
    summary: WMO_JA[code] ?? "不明",
    high: high != null ? Math.round(high) : null,
    low: low != null ? Math.round(low) : null,
  };
}

/* dateStr / todayStr は "YYYY-MM-DD"。
   直近（過去92日〜先16日）は予報API、それより古い過去は履歴APIを使う。
   どちらも失敗したら、もう一方を試してから諦める（日記は天気なしで作る）。 */
export async function fetchWeather(lat, lon, dateStr, todayStr) {
  const diff = daysBetween(dateStr, todayStr);
  const primary = diff < -92 || diff > 16
    ? "https://archive-api.open-meteo.com/v1/archive"
    : "https://api.open-meteo.com/v1/forecast";
  const secondary = primary.includes("archive")
    ? "https://api.open-meteo.com/v1/forecast"
    : "https://archive-api.open-meteo.com/v1/archive";
  try {
    return await callDaily(primary, lat, lon, dateStr);
  } catch (e) {
    return await callDaily(secondary, lat, lon, dateStr);
  }
}
