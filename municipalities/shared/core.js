/**
 * これどうする？ 共通ロジック（自治体非依存）
 * UI/検索/日付ルール解決を自治体設定・データから分離する。
 *
 * 同等ロジックのESモジュール版が src/lib/{search,rules,freshness,deeplink}.js
 * にある（tests/*.test.js から node:test で直接importするため）。ブラウザの
 * <script> 非モジュール読み込みと Node ESMテストを両立するため、意図的に
 * 2箇所に軽量な複製がある（municipalities/obu/README.md 参照）。
 */

// カタカナ→ひらがな正規化（簡易生活者語マッチ用）
function normalize(s) {
  if (!s) return "";
  return s
    .toString()
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/\s+/g, "");
}

// 長音符・中黒・句読点などの表記揺れを吸収する緩い正規化（意味を変えない差異のみ）。
function normalizeLoose(s) {
  return normalize(s)
    .replace(/[ー\-‐‑‒–—―]/g, "")
    .replace(/[・･]/g, "")
    .replace(/[。、！？「」『』（）()]/g, "");
}

// 決定論的・依存ライブラリなしのLevenshtein編集距離（誤字候補検出用）。
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * 同一 display_name で複数の valid_from/valid_to レコードを持つ品目群から、
 * 指定日時点で有効なレコードだけを残す。
 * @param {Array} items
 * @param {string} onDateStr YYYY-MM-DD
 */
function resolveActiveWasteItems(items, onDateStr) {
  const onDate = onDateStr ? new Date(onDateStr) : new Date();
  return items.filter((it) => {
    const from = it.valid_from ? new Date(it.valid_from) : null;
    const to = it.valid_to ? new Date(it.valid_to) : null;
    if (from && onDate < from) return false;
    if (to && onDate > to) return false;
    return true;
  });
}

function haystacksOf(name, aliases) {
  return [name, ...(aliases || [])];
}

// 優先順位: ①正規名称完全一致 ②alias完全一致 ③正規化(緩)後完全一致 ④部分一致
// ⑤(別関数 suggestSimilar) fuzzy/誤字候補。ここでは⑤は返さない — 低信頼一致を
// 確定回答として混ぜないため。
function scoreMatch(query, displayName, aliases) {
  const q = normalize(query);
  const qLoose = normalizeLoose(query);
  if (!q) return 0;
  let score = 0;
  let isName = true;
  for (const raw of haystacksOf(displayName, aliases)) {
    const h = normalize(raw);
    if (h) {
      if (h === q) {
        score = Math.max(score, isName ? 100 : 90); // ① / ②
      } else if (qLoose && normalizeLoose(raw) === qLoose) {
        score = Math.max(score, 85); // ③
      } else if (h.startsWith(q) || h.includes(q) || q.includes(h)) {
        score = Math.max(score, isName ? 60 : 50); // ④
      }
    }
    isName = false;
  }
  return score;
}

function searchWasteItems(query, items) {
  const scored = items
    .map((it) => ({ it, score: scoreMatch(query, it.display_name, it.aliases) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.map((x) => x.it);
}

function searchProcedures(query, procedures) {
  const scored = procedures
    .map((p) => ({ p, score: scoreMatch(query, p.name, p.aliases) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.map((x) => x.p);
}

// Tier⑤: 誤字・表記揺れ候補（Levenshtein距離ベース）。「もしかして」候補として
// 提示するためだけの関数で、確定回答には絶対に使わない。呼び出し側は必ず
// ユーザーのクリック等の明示操作を経てから通常の詳細カードを開くこと。
function suggestSimilar(query, items, limit = 6) {
  const q = normalizeLoose(query);
  if (!q || q.length < 2) return [];
  const scored = [];
  for (const it of items) {
    let best = null;
    for (const raw of haystacksOf(it.display_name, it.aliases)) {
      const c = normalizeLoose(raw);
      if (!c) continue;
      const dist = levenshtein(q, c);
      const maxLen = Math.max(q.length, c.length);
      const ratio = maxLen ? dist / maxLen : 1;
      if (!best || ratio < best.ratio) best = { dist, ratio };
    }
    if (best && best.ratio <= 0.45 && best.dist <= 3) scored.push({ it, ...best });
  }
  scored.sort((a, b) => a.ratio - b.ratio || a.dist - b.dist);
  return scored.slice(0, limit).map((x) => x.it);
}

// ---- 情報鮮度（内部運用ポリシー。名古屋市公式の基準ではない） ----

const REVIEW_INTERVAL_DAYS = Object.freeze({ HIGH: 30, MEDIUM: 90, LOW: 365 });
const HIGH_RISK_CATEGORIES = new Set(["電池類", "発火性危険物"]);

function computeRiskLevel(item, { isDateDependent = false } = {}) {
  if (item?.danger_notes && item.danger_notes !== "該当なし") return "HIGH";
  if (HIGH_RISK_CATEGORIES.has(item?.category)) return "HIGH";
  if (isDateDependent) return "HIGH";
  if (item?.application_required || item?.category === "粗大ごみ") return "MEDIUM";
  return "LOW";
}

function computeFreshness(sourceCheckedAt, riskLevel, now = new Date()) {
  const checked = new Date(`${sourceCheckedAt}T00:00:00+09:00`);
  const intervalDays = REVIEW_INTERVAL_DAYS[riskLevel] ?? REVIEW_INTERVAL_DAYS.MEDIUM;
  const nextReviewAt = new Date(checked.getTime() + intervalDays * 86400000);
  const nowDate = now instanceof Date ? now : new Date(now);
  const status = nowDate.getTime() > nextReviewAt.getTime() ? "REVIEW_DUE" : "CONFIRMED";
  const daysOverdue = status === "REVIEW_DUE" ? Math.floor((nowDate - nextReviewAt) / 86400000) : 0;
  return { status, nextReviewAt, daysOverdue, riskLevel, intervalDays };
}

function isHighRiskStale(riskLevel, freshnessStatus) {
  return riskLevel === "HIGH" && freshnessStatus === "REVIEW_DUE";
}

// ---- Deep Link ----

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateString(s) {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function sanitizeAsOfDate(raw, todayStr) {
  return isValidDateString(raw) ? raw : todayStr;
}

// 生データ配列を直接拾わない：必ず日付解決済みのactive setから探す。
// activeにレコードが無い場合（未知ID、またはそのasof時点で有効なレコードが
// 存在しない）は同じfail-safe（ok:false）として扱う。
function resolveWasteDeepLink(wasteItemsAll, itemId, asOfDate) {
  if (!itemId) return { ok: false, reason: "MISSING_ID" };
  const exists = wasteItemsAll.some((it) => it.item_id === itemId);
  if (!exists) return { ok: false, reason: "UNKNOWN_ID" };
  const active = resolveActiveWasteItems(wasteItemsAll, asOfDate);
  const record = active.find((it) => it.item_id === itemId);
  if (!record) return { ok: false, reason: "NO_ACTIVE_RECORD_FOR_DATE" };
  return { ok: true, item: record };
}

function resolveProcedureDeepLink(procedures, procedureId) {
  if (!procedureId) return { ok: false, reason: "MISSING_ID" };
  const record = procedures.find((p) => p.procedure_id === procedureId);
  if (!record) return { ok: false, reason: "UNKNOWN_ID" };
  return { ok: true, item: record };
}

// ---- 生活イベント（既存の手続を「何が起きたか」で束ねるだけの索引層） ----
// display_name/aliasesの形は品目・手続と同じなので、既存のscoreMatch/
// suggestSimilarをそのまま再利用する（別ロジックを作らない）。

function searchLifeEvents(query, events) {
  const scored = events
    .map((e) => ({ e, score: scoreMatch(query, e.display_name, e.aliases) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.map((x) => x.e);
}

function suggestSimilarLifeEvents(query, events, limit = 5) {
  return suggestSimilar(query, events, limit);
}

function resolveLifeEventDeepLink(events, eventId) {
  if (!eventId) return { ok: false, reason: "MISSING_ID" };
  const record = events.find((e) => e.event_id === eventId);
  if (!record) return { ok: false, reason: "UNKNOWN_ID" };
  return { ok: true, item: record };
}

// ---- 住所（町名）→管轄窓口の解決 ----
// 名古屋市の支所は距離ではなく町名による法定管轄のため、公式データ
// （municipalities/nagoya/data/branch_jurisdiction.json）に明示的に存在する
// 町名との完全一致でのみ判定する。推測・あいまい一致・距離計算は行わない。
// ESモジュール版: src/lib/offices.js（同一ロジック）。

const NOT_LISTED_IN_BRANCH = "__NOT_LISTED_IN_BRANCH__";

function getWardOffice(offices, ward) {
  return offices.find((o) => o.office_type === "WARD_OFFICE" && o.ward === ward) || null;
}

function getOfficeById(offices, officeId) {
  return offices.find((o) => o.office_id === officeId) || null;
}

function getBranchJurisdiction(branchJurisdiction, ward) {
  return branchJurisdiction.find((b) => b.ward === ward) || null;
}

function wardHasBranch(branchJurisdiction, ward) {
  return getBranchJurisdiction(branchJurisdiction, ward) !== null;
}

function resolveTownOffice(offices, branchJurisdiction, ward, town) {
  const jurisdiction = getBranchJurisdiction(branchJurisdiction, ward);
  if (!jurisdiction) {
    return { kind: "WARD_OFFICE", office: getWardOffice(offices, ward) };
  }
  if (jurisdiction.town_names.includes(town)) {
    return { kind: "BRANCH", office: getOfficeById(offices, jurisdiction.branch_office_id) };
  }
  if (jurisdiction.split_jurisdiction_towns.includes(town)) {
    return {
      kind: "SPLIT",
      town,
      wardOffice: getWardOffice(offices, ward),
      branchOffice: getOfficeById(offices, jurisdiction.branch_office_id),
    };
  }
  if (town === NOT_LISTED_IN_BRANCH) {
    return { kind: "WARD_OFFICE", office: getWardOffice(offices, ward) };
  }
  return { kind: "UNKNOWN" };
}

// ---- ゼロ件時の改善フィードバック（静的サイト・自動送信なし） ----
// mailto: を開くだけ。押した時点では何も送信されない — 送信するかどうか、
// 何を書くかは利用者がメールアプリ側で決める。

const FEEDBACK_OPERATOR_EMAIL = "koide@imagine-seek.co.jp";

function buildFeedbackMailto(query, operatorEmail = FEEDBACK_OPERATOR_EMAIL) {
  const subject = `[これどうする？名古屋市版] 検索改善候補: ${query}`;
  const body = [
    "検索してヒットしなかった語句:",
    query,
    "",
    "（このメールはこのまま送信するまで送信されません。差し支えなければ、探していたもの・地域などを補足してください）",
  ].join("\n");
  return `mailto:${operatorEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ---- Deep Link共有URL ----

function buildShareUrl(basePath, params) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== "") qs.set(k, v);
  }
  const query = qs.toString();
  return query ? `${basePath}?${query}` : basePath;
}

async function loadMunicipality(configPath) {
  const config = await (await fetch(configPath)).json();
  const [wasteItems, procedures, lifeEvents, offices, branchJurisdiction] = await Promise.all([
    fetch(config.data.waste_items).then((r) => r.json()),
    fetch(config.data.procedures).then((r) => r.json()),
    config.data.life_events ? fetch(config.data.life_events).then((r) => r.json()) : Promise.resolve([]),
    config.data.offices ? fetch(config.data.offices).then((r) => r.json()) : Promise.resolve([]),
    config.data.branch_jurisdiction
      ? fetch(config.data.branch_jurisdiction).then((r) => r.json())
      : Promise.resolve([]),
  ]);
  return { config, wasteItems, procedures, lifeEvents, offices, branchJurisdiction };
}

if (typeof window !== "undefined") {
  window.KoreDousuruCore = {
    normalize,
    normalizeLoose,
    levenshtein,
    resolveActiveWasteItems,
    searchWasteItems,
    searchProcedures,
    suggestSimilar,
    computeRiskLevel,
    computeFreshness,
    isHighRiskStale,
    REVIEW_INTERVAL_DAYS,
    isValidDateString,
    sanitizeAsOfDate,
    resolveWasteDeepLink,
    resolveProcedureDeepLink,
    searchLifeEvents,
    suggestSimilarLifeEvents,
    resolveLifeEventDeepLink,
    buildFeedbackMailto,
    buildShareUrl,
    loadMunicipality,
    NOT_LISTED_IN_BRANCH,
    getWardOffice,
    getOfficeById,
    getBranchJurisdiction,
    wardHasBranch,
    resolveTownOffice,
  };
}
