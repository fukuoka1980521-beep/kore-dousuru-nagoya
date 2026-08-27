/**
 * これどうする？ 共通ロジック（自治体非依存）
 * UI/検索/日付ルール解決を自治体設定・データから分離する。
 */

// カタカナ→ひらがな正規化（簡易生活者語マッチ用）
function normalize(s) {
  if (!s) return "";
  return s
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/\s+/g, "");
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

function scoreMatch(query, displayName, aliases) {
  const q = normalize(query);
  if (!q) return 0;
  const name = normalize(displayName);
  if (name === q) return 100;
  if (name.startsWith(q)) return 80;
  if (name.includes(q)) return 60;
  for (const a of aliases || []) {
    const na = normalize(a);
    if (na === q) return 90;
    if (na.includes(q) || q.includes(na)) return 50;
  }
  // 部分一致（生活者語の中の単語が品目名/aliasesに含まれるか）
  return 0;
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

function suggestSimilar(query, items, limit = 6) {
  const q = normalize(query);
  if (!q) return [];
  const candidates = items
    .map((it) => {
      const name = normalize(it.display_name);
      let dist = 0;
      for (let i = 0; i < Math.min(q.length, name.length); i++) {
        if (q[i] === name[i]) dist++;
      }
      return { it, dist };
    })
    .sort((a, b) => b.dist - a.dist)
    .slice(0, limit)
    .map((x) => x.it);
  return candidates;
}

async function loadMunicipality(configPath) {
  const config = await (await fetch(configPath)).json();
  const [wasteItems, procedures] = await Promise.all([
    fetch(config.data.waste_items).then((r) => r.json()),
    fetch(config.data.procedures).then((r) => r.json()),
  ]);
  return { config, wasteItems, procedures };
}

if (typeof window !== "undefined") {
  window.KoreDousuruCore = {
    normalize,
    resolveActiveWasteItems,
    searchWasteItems,
    searchProcedures,
    suggestSimilar,
    loadMunicipality,
  };
}
