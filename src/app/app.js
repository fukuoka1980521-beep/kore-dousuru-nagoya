/* これどうする？ 名古屋市版 UIロジック（自治体固有アプリ側） */
(function () {
  const { resolveActiveWasteItems, searchWasteItems, searchProcedures, suggestSimilar } =
    window.KoreDousuruCore;

  const state = {
    config: null,
    wasteItemsAll: [],
    procedures: [],
    asOfDate: new Date().toISOString().slice(0, 10),
    view: "home",
    tab: "gomi",
  };

  const $app = document.getElementById("app");

  function statusBadge(status) {
    const cls = status === "CONFIRMED_OFFICIAL" ? "confirmed" : status === "PARTIAL" ? "partial" : "unconfirmed";
    const label = status === "CONFIRMED_OFFICIAL" ? "公式確認済" : status === "PARTIAL" ? "一部要確認" : "要確認";
    return `<span class="status-badge ${cls}">${label}</span>`;
  }

  function escapeHtml(s) {
    return (s ?? "").toString().replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  // Escapes text, then wraps http(s) URLs as clickable links. Safe because
  // escaping runs first, so the regex only ever sees already-neutralized text.
  function escapeHtmlLinkify(s) {
    return escapeHtml(s).replace(
      /(https?:\/\/[^\s<]+)/g,
      (url) => `<a class="official-link" href="${url}" target="_blank" rel="noopener">${url}</a>`
    );
  }

  function renderHeader() {
    return `
      <header class="app-header">
        <div class="muni-name">${escapeHtml(state.config.display_name)}版</div>
        <div class="app-title">${escapeHtml(state.config.app_title)}</div>
        <div class="search-box">
          <input id="search-input" type="search" inputmode="search" placeholder="品目名・手続き名・「引っ越した」など" value="${escapeHtml(state.query || "")}" />
          <button id="search-btn" aria-label="検索">🔍</button>
        </div>
      </header>
    `;
  }

  function renderPriorityNav() {
    return `
      <div class="priority-nav">
        ${state.config.priority_nav
          .map(
            (n) => `<button data-nav="${n.key}"><span class="icon">${n.icon}</span>${escapeHtml(n.label)}</button>`
          )
          .join("")}
      </div>
    `;
  }

  function renderFooter() {
    const tabs = [
      { key: "home", label: "ホーム", icon: "🏠" },
      { key: "gomi", label: "ごみ", icon: "🗑️" },
      { key: "procedures", label: "手続き", icon: "📋" },
      { key: "contact", label: "問い合わせ", icon: "☎️" },
    ];
    return `
      <footer class="app-footer">
        ${tabs
          .map(
            (t) => `<button data-tab="${t.key}" class="${state.view === t.key ? "active" : ""}">
              <span class="icon">${t.icon}</span>${t.label}
            </button>`
          )
          .join("")}
      </footer>
    `;
  }

  function wasteResultItem(it) {
    return `
      <div class="result-item" data-waste="${it.item_id}">
        <div class="name">${escapeHtml(it.display_name)} ${statusBadge(it.status)}</div>
        <div class="category">${escapeHtml(it.category)}</div>
      </div>
    `;
  }

  function procResultItem(p) {
    return `
      <div class="result-item" data-proc="${p.procedure_id}">
        <div class="name">${escapeHtml(p.name)} ${statusBadge(p.status)}</div>
        <div class="category">行政手続</div>
      </div>
    `;
  }

  function renderZeroResult(query) {
    const suggestions = suggestSimilar(query, state.wasteItemsAll, 6);
    const categories = [...new Set(state.wasteItemsAll.map((i) => i.category))].slice(0, 10);
    return `
      <div class="zero-result">
        <div>「${escapeHtml(query)}」に一致する結果が見つかりませんでした。</div>
        ${
          suggestions.length
            ? `<div class="section-title" style="text-align:left;">似ている品目名から探す</div>
              <div class="suggestions">
                ${suggestions
                  .map((s) => `<button data-waste="${s.item_id}">${escapeHtml(s.display_name)}</button>`)
                  .join("")}
              </div>`
            : ""
        }
        <div class="section-title" style="text-align:left;">カテゴリから探す</div>
        <div class="suggestions">
          ${categories.map((c) => `<button data-category="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join("")}
        </div>
        <div class="official-box">
          <strong>見つからない場合は、公式窓口へ</strong>
          <div class="phone-block" style="margin-top:8px;">
            ${escapeHtml(state.config.contact.name)}<br />
            <a href="tel:${state.config.contact.phone.replace(/[^0-9]/g, "")}">${escapeHtml(state.config.contact.phone)}</a>
            （${escapeHtml(state.config.contact.hours)}）
          </div>
          <a class="official-link" href="${state.config.contact.url}" target="_blank" rel="noopener">公式ページを見る</a>
        </div>
      </div>
    `;
  }

  function renderWasteCard(it) {
    return `
      <a class="back-link" data-back="1">← 検索結果に戻る</a>
      <div class="card">
        <h2>${escapeHtml(it.display_name)} ${statusBadge(it.status)}</h2>
        <div class="conclusion"><strong>${escapeHtml(it.category)}</strong>として出してください。${escapeHtml(it.conditions || "")}</div>
        <dl>
          <div class="row"><dt>出し方</dt><dd>${escapeHtml(it.how_to_dispose)}</dd></div>
          <div class="row"><dt>収集/持込み</dt><dd>${escapeHtml(it.collection_or_dropoff)}</dd></div>
          <div class="row"><dt>事前申込</dt><dd>${it.application_required ? "必要（粗大ごみ受付センター等）" : "不要"}</dd></div>
          <div class="row"><dt>費用</dt><dd>${escapeHtml(it.fee)}</dd></div>
          ${it.danger_notes && it.danger_notes !== "該当なし" ? `<div class="row"><dt>注意事項</dt><dd class="danger-notes">⚠️ ${escapeHtml(it.danger_notes)}</dd></div>` : ""}
          ${it.battery_notes && it.battery_notes !== "該当なし" ? `<div class="row"><dt>電池関連</dt><dd>${escapeHtml(it.battery_notes)}</dd></div>` : ""}
          <div class="row"><dt>サイズ基準</dt><dd>${escapeHtml(it.size_rule)}<br /><span style="color:var(--text-sub);font-size:12px;">${escapeHtml(it.effective_rule)}</span></dd></div>
          <div class="row"><dt>適用期間</dt><dd>${escapeHtml(it.valid_from || "")} 〜 ${escapeHtml(it.valid_to || "現在も継続")}（${escapeHtml(it.rule_version)}）</dd></div>
          <div class="row"><dt>担当</dt><dd>${escapeHtml(it.department)}<div class="phone-block" style="margin-top:6px;">${it.phone ? `<a href="tel:${it.phone.replace(/[^0-9]/g, "")}">${escapeHtml(it.phone)}</a>` : "未確認"}</div></dd></div>
          <div class="row"><dt>公式情報</dt><dd><a class="official-link" href="${it.official_url}" target="_blank" rel="noopener">${escapeHtml(it.official_page_title)}</a></dd></div>
          <div class="row"><dt>確認日</dt><dd>${escapeHtml(it.source_checked_at)}</dd></div>
          ${it.notes ? `<div class="row"><dt>備考</dt><dd>${escapeHtml(it.notes)}</dd></div>` : ""}
        </dl>
      </div>
    `;
  }

  function renderProcCard(p) {
    return `
      <a class="back-link" data-back="1">← 検索結果に戻る</a>
      <div class="card">
        <h2>${escapeHtml(p.name)} ${statusBadge(p.status)}</h2>
        <div class="conclusion">${escapeHtml(p.conclusion)}</div>
        <dl>
          <div class="row"><dt>期限</dt><dd>${escapeHtml(p.deadline)}</dd></div>
          <div class="row"><dt>手続方法</dt><dd>${escapeHtml(p.how_to)}</dd></div>
          <div class="row"><dt>必要書類</dt><dd>${(p.required_documents || []).map(escapeHtml).join("<br />")}</dd></div>
          <div class="row"><dt>費用</dt><dd>${escapeHtml(p.fee)}</dd></div>
          <div class="row"><dt>窓口</dt><dd>${escapeHtml(p.window_office)}${p.district_dependent ? `<br /><a class="official-link" href="${state.config.ward_list_url}" target="_blank" rel="noopener">区役所一覧を見る（区により窓口が異なります）</a>` : ""}</dd></div>
          <div class="row"><dt>電話番号</dt><dd><div class="phone-block">${escapeHtml(p.department_name)}<br />${escapeHtmlLinkify(p.phone)}</div></dd></div>
          <div class="row"><dt>受付時間</dt><dd>${escapeHtml(p.business_hours)}</dd></div>
          <div class="row"><dt>オンライン可否</dt><dd>${p.online_available ? "オンライン申請/申込に対応する方法があります" : "窓口・郵送が基本です"}</dd></div>
          <div class="row"><dt>関連手続</dt><dd>${(p.related_procedures || [])
            .map((rid) => {
              const rp = state.procedures.find((x) => x.procedure_id === rid);
              return rp ? `<span class="related-link" data-proc="${rid}" style="color:var(--brand);text-decoration:underline;cursor:pointer;">${escapeHtml(rp.name)}</span>` : "";
            })
            .join("　")}</dd></div>
          <div class="row"><dt>公式情報</dt><dd><a class="official-link" href="${p.official_url}" target="_blank" rel="noopener">${escapeHtml(p.official_page_title)}</a></dd></div>
          <div class="row"><dt>確認日</dt><dd>${escapeHtml(p.source_checked_at)}</dd></div>
          ${p.notes ? `<div class="row"><dt>注意事項</dt><dd>${escapeHtml(p.notes)}</dd></div>` : ""}
        </dl>
      </div>
    `;
  }

  function currentActiveWasteItems() {
    return resolveActiveWasteItems(state.wasteItemsAll, state.asOfDate);
  }

  function render() {
    let body = "";
    const activeItems = currentActiveWasteItems();

    if (state.detailWaste) {
      // Look up within the date-resolved active set, not the raw multi-version array —
      // otherwise a multi-version item_id (e.g. pre/post 2026-10-01 rule change) always
      // renders whichever record happens to appear first, ignoring state.asOfDate.
      const it =
        activeItems.find((x) => x.item_id === state.detailWaste) ||
        state.wasteItemsAll.find((x) => x.item_id === state.detailWaste);
      body = renderWasteCard(it);
    } else if (state.detailProc) {
      const p = state.procedures.find((x) => x.procedure_id === state.detailProc);
      body = renderProcCard(p);
    } else if (state.query) {
      const wasteResults = searchWasteItems(state.query, activeItems);
      const procResults = searchProcedures(state.query, state.procedures);
      if (wasteResults.length === 0 && procResults.length === 0) {
        body = renderZeroResult(state.query);
      } else {
        body = `
          <div class="date-picker-row">
            検索基準日:
            <input type="date" id="as-of-date" value="${state.asOfDate}" />
            <span>（粗大ごみ2026年10月ルール変更の境界確認用）</span>
          </div>
          ${wasteResults.length ? `<div class="section-title">ごみ・資源（${wasteResults.length}件）</div><div class="result-list">${wasteResults.map(wasteResultItem).join("")}</div>` : ""}
          ${procResults.length ? `<div class="section-title">行政手続（${procResults.length}件）</div><div class="result-list">${procResults.map(procResultItem).join("")}</div>` : ""}
        `;
      }
    } else if (state.view === "gomi") {
      const filtered = state.categoryFilter
        ? activeItems.filter((i) => i.category === state.categoryFilter)
        : activeItems;
      const allCategories = [...new Set(state.wasteItemsAll.map((i) => i.category))];
      body = `
        <div class="date-picker-row">
          検索基準日:
          <input type="date" id="as-of-date" value="${state.asOfDate}" />
        </div>
        <div class="category-chip-row">
          <button data-category="" class="${!state.categoryFilter ? "active" : ""}">すべて</button>
          ${allCategories
            .map(
              (c) =>
                `<button data-category="${escapeHtml(c)}" class="${state.categoryFilter === c ? "active" : ""}">${escapeHtml(c)}</button>`
            )
            .join("")}
        </div>
        ${
          state.categoryFilter
            ? `<div class="section-title">カテゴリ: ${escapeHtml(state.categoryFilter)}（${filtered.length}件） <a class="back-link" data-clear-category="1">すべて表示</a></div>`
            : `<div class="section-title">ごみ・資源 品目一覧（${filtered.length}件）</div>`
        }
        <div class="result-list">${filtered.map(wasteResultItem).join("")}</div>
      `;
    } else if (state.view === "procedures") {
      body = `
        <div class="section-title">行政手続（${state.procedures.length}件）</div>
        <div class="result-list">${state.procedures.map(procResultItem).join("")}</div>
      `;
    } else if (state.view === "contact") {
      body = `
        <div class="card">
          <h2>公式問い合わせ先</h2>
          <div class="phone-block">
            ${escapeHtml(state.config.contact.name)}<br />
            <a href="tel:${state.config.contact.phone.replace(/[^0-9]/g, "")}">${escapeHtml(state.config.contact.phone)}</a>
            （${escapeHtml(state.config.contact.hours)}）
          </div>
          <a class="official-link" href="${state.config.contact.url}" target="_blank" rel="noopener">公式ページ</a>
          <p style="font-size:12px;color:var(--text-sub);margin-top:16px;">${escapeHtml(state.config.disclaimer)}</p>
        </div>
      `;
    } else {
      body = `
        ${renderPriorityNav()}
        <div class="section-title">よく検索される品目</div>
        <div class="result-list">${activeItems.slice(0, 5).map(wasteResultItem).join("")}</div>
      `;
    }

    $app.innerHTML = `
      <div class="app-shell">
        ${renderHeader()}
        <div class="notice-banner">${escapeHtml(state.config.disclaimer)}</div>
        <main>${body}</main>
        ${renderFooter()}
      </div>
    `;
    bindEvents();
  }

  function bindEvents() {
    const input = document.getElementById("search-input");
    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          state.query = input.value;
          state.detailWaste = null;
          state.detailProc = null;
          render();
        }
      });
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
    const btn = document.getElementById("search-btn");
    if (btn) btn.addEventListener("click", () => {
      state.query = input.value;
      state.detailWaste = null;
      state.detailProc = null;
      render();
    });

    document.querySelectorAll("[data-nav]").forEach((el) =>
      el.addEventListener("click", () => {
        const key = el.getAttribute("data-nav");
        state.query = "";
        state.detailWaste = null;
        state.detailProc = null;
        state.categoryFilter = null;
        if (key === "gomi") state.view = "gomi";
        else if (key === "hikkoshi") { state.view = "procedures"; state.query = "転入"; }
        else if (key === "juminhyo") { state.view = "procedures"; state.query = "住民票"; }
        else if (key === "kosodate") { state.view = "procedures"; state.query = "児童手当"; }
        render();
      })
    );

    document.querySelectorAll("[data-tab]").forEach((el) =>
      el.addEventListener("click", () => {
        state.view = el.getAttribute("data-tab");
        state.query = "";
        state.detailWaste = null;
        state.detailProc = null;
        state.categoryFilter = null;
        render();
      })
    );

    document.querySelectorAll("[data-category]").forEach((el) =>
      el.addEventListener("click", () => {
        state.query = "";
        state.detailWaste = null;
        state.detailProc = null;
        state.view = "gomi";
        state.categoryFilter = el.getAttribute("data-category");
        render();
      })
    );

    document.querySelectorAll("[data-waste]").forEach((el) =>
      el.addEventListener("click", () => {
        state.detailWaste = el.getAttribute("data-waste");
        render();
      })
    );
    document.querySelectorAll("[data-proc], .related-link[data-proc]").forEach((el) =>
      el.addEventListener("click", () => {
        state.detailProc = el.getAttribute("data-proc");
        state.detailWaste = null;
        render();
      })
    );
    document.querySelectorAll("[data-back]").forEach((el) =>
      el.addEventListener("click", () => {
        state.detailWaste = null;
        state.detailProc = null;
        render();
      })
    );
    document.querySelectorAll("[data-clear-category]").forEach((el) =>
      el.addEventListener("click", () => {
        state.categoryFilter = null;
        render();
      })
    );
    const dateInput = document.getElementById("as-of-date");
    if (dateInput) dateInput.addEventListener("change", () => {
      state.asOfDate = dateInput.value;
      render();
    });
  }

  async function init() {
    const { config, wasteItems, procedures } = await window.KoreDousuruCore.loadMunicipality(
      "../../municipalities/nagoya/config.json"
    );
    state.config = config;
    state.wasteItemsAll = wasteItems;
    state.procedures = procedures;
    render();
  }

  init();
})();
