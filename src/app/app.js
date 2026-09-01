/* これどうする？ 名古屋市版 UIロジック（自治体固有アプリ側） */
(function () {
  const {
    resolveActiveWasteItems,
    searchWasteItems,
    searchProcedures,
    suggestSimilar,
    computeRiskLevel,
    computeFreshness,
    isHighRiskStale,
    sanitizeAsOfDate,
    resolveWasteDeepLink,
    resolveProcedureDeepLink,
    searchLifeEvents,
    suggestSimilarLifeEvents,
    resolveLifeEventDeepLink,
    buildFeedbackMailto,
    buildShareUrl,
    NOT_LISTED_IN_BRANCH,
    wardHasBranch,
    getBranchJurisdiction,
    resolveTownOffice,
  } = window.KoreDousuruCore;

  const DEEPLINK_NOT_FOUND_MESSAGE =
    "指定された情報を確認できませんでした。最新情報は公式案内をご確認ください。";

  // 生活イベントは「該当する可能性がある確認項目」の提示であり、確定判定では
  // ない（section 15）。全イベント共通のため、データ側に重複させず一箇所で持つ。
  const LIFE_EVENT_CAUTION = "状況により必要になる主な手続です。該当する項目をご確認ください。";

  // 曜日・時間帯による取扱差（日曜窓口・昼休み等）はV0.1ではモデル化せず、
  // 通常平日窓口の案内に注意書きを添えるだけにとどめる（設計方針）。
  const OFFICE_HOURS_CAUTION =
    "曜日・時間帯によって取り扱えない業務があります。来庁前に公式ページをご確認ください。";
  const OFFICE_UNKNOWN_TOWN_MESSAGE =
    "この町名では管轄を確認できませんでした。名古屋市公式情報でご確認ください。";
  const OFFICE_SPLIT_TOWN_MESSAGE =
    "この町名は区役所と支所で管轄が分かれています。正確な判定は名古屋市公式の行政管轄表でご確認ください。";

  const state = {
    config: null,
    wasteItemsAll: [],
    procedures: [],
    lifeEvents: [],
    offices: [],
    branchJurisdiction: [],
    asOfDate: new Date().toISOString().slice(0, 10),
    view: "home",
    tab: "gomi",
    detailEvent: null,
    deepLinkError: null,
    // お住まいの地域から管轄窓口を確認するミニウィジェットの選択状態。
    // procId で紐付け、別の手続を開いたら自動的にリセットする
    // （ページ内stateのみ。localStorage等への保存はV0.1では行わない）。
    officeSelection: { procId: null, ward: "", town: "" },
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
        <div class="muni-name">${escapeHtml(state.config.display_name)}版 <span class="unofficial-badge">非公式・実証版</span></div>
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

  function eventResultItem(e) {
    return `
      <div class="result-item event-result-item" data-event="${e.event_id}">
        <div class="name">${escapeHtml(e.display_name)}</div>
        <div class="category">生活イベント・${(e.related_procedures || []).length}件の確認項目</div>
      </div>
    `;
  }

  function renderZeroResult(query) {
    // Fuzzy/typo candidates are suggestions only — clicking one navigates to
    // the normal, officially-confirmed detail card; nothing here is ever
    // shown as an already-decided answer.
    const suggestions = suggestSimilar(query, state.wasteItemsAll, 5);
    const eventSuggestions = suggestSimilarLifeEvents(query, state.lifeEvents, 3);
    const categories = [...new Set(state.wasteItemsAll.map((i) => i.category))].slice(0, 10);
    const feedbackUrl = buildFeedbackMailto(query);
    return `
      <div class="zero-result">
        <div>「${escapeHtml(query)}」に一致する結果が見つかりませんでした。</div>
        ${
          eventSuggestions.length
            ? `<div class="section-title" style="text-align:left;">近い生活イベントの候補があります</div>
              <div class="fuzzy-suggestions">
                ${eventSuggestions
                  .map(
                    (s) => `
                  <button class="fuzzy-candidate" data-event="${s.event_id}">
                    <span class="name">${escapeHtml(s.display_name)}</span>
                  </button>`
                  )
                  .join("")}
              </div>`
            : ""
        }
        ${
          suggestions.length
            ? `<div class="section-title" style="text-align:left;">近い候補があります（似た言葉から探す）</div>
              <div class="fuzzy-suggestions">
                ${suggestions
                  .map(
                    (s) => `
                  <button class="fuzzy-candidate" data-waste="${s.item_id}">
                    <span class="name">${escapeHtml(s.display_name)}</span>
                    <span class="category">${escapeHtml(s.category)}</span>
                  </button>`
                  )
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
        <div class="feedback-box">
          <a class="feedback-link" href="${feedbackUrl}">この検索語を改善候補として知らせる</a>
          <div class="feedback-note">メールアプリが開きます。送信するまで情報は送られません。</div>
          <div class="feedback-note feedback-privacy-note">氏名・住所・電話番号・マイナンバーなどの個人情報は記載しないでください。</div>
        </div>
      </div>
    `;
  }

  // 内部運用ポリシー（名古屋市公式の基準ではない）に基づく情報鮮度判定。
  function freshnessInfoFor(record, { isDateDependent = false } = {}) {
    const riskLevel = computeRiskLevel(record, { isDateDependent });
    const freshness = computeFreshness(record.source_checked_at, riskLevel);
    return { riskLevel, freshness, stale: isHighRiskStale(riskLevel, freshness.status) };
  }

  function freshnessBannerHtml({ riskLevel, freshness }) {
    if (freshness.status !== "REVIEW_DUE") return "";
    return `
      <div class="freshness-banner">
        この情報は再確認期限を過ぎています。最新情報は公式ページでもご確認ください。
        <span class="freshness-policy-note">（最終確認日を基準にした本サービス内部の運用方針による表示です。名古屋市公式の基準ではありません）</span>
      </div>
    `;
  }

  function shareBlockHtml(params) {
    const shareUrl = buildShareUrl(location.origin + location.pathname, params);
    return `
      <div class="share-block">
        <button class="share-btn" data-share-url="${escapeHtml(shareUrl)}">🔗 この情報を共有</button>
        <input class="share-url-fallback" type="text" readonly hidden />
      </div>
    `;
  }

  function renderWasteCard(it) {
    const versionCount = state.wasteItemsAll.filter((x) => x.item_id === it.item_id).length;
    const { riskLevel, freshness, stale } = freshnessInfoFor(it, { isDateDependent: versionCount > 1 });
    const share = shareBlockHtml({ waste: it.item_id, asof: state.asOfDate });

    if (stale) {
      // HIGH risk + past our internal review interval: do not keep asserting
      // a possibly-outdated hazardous disposal method. Fail safe — surface
      // the official source and contact instead of the detailed steps.
      return `
        <a class="back-link" data-back="1">← 検索結果に戻る</a>
        <div class="card stale-highrisk-card">
          <h2>${escapeHtml(it.display_name)} ${statusBadge(it.status)}</h2>
          <div class="stale-highrisk-banner">
            <strong>⚠️ 再確認が必要な情報です</strong>
            <div>この品目は危険物等に関わるため、内部の運用方針上、最終確認から一定期間が過ぎた情報を詳細表示せずお伝えしています。最新の出し方は必ず公式ページでご確認ください。</div>
            <span class="freshness-policy-note">（名古屋市公式の基準ではなく、本サービス内部の運用方針による表示です）</span>
          </div>
          <dl>
            <div class="row"><dt>カテゴリ</dt><dd>${escapeHtml(it.category)}</dd></div>
            <div class="row"><dt>公式情報</dt><dd><a class="official-link" href="${it.official_url}" target="_blank" rel="noopener">${escapeHtml(it.official_page_title)}</a></dd></div>
            <div class="row"><dt>問い合わせ</dt><dd>${escapeHtml(it.department)}<div class="phone-block" style="margin-top:6px;">${it.phone ? `<a href="tel:${it.phone.replace(/[^0-9]/g, "")}">${escapeHtml(it.phone)}</a>` : "未確認"}</div></dd></div>
            <div class="row"><dt>最終確認日</dt><dd>${escapeHtml(it.source_checked_at)}</dd></div>
          </dl>
          ${share}
        </div>
      `;
    }

    return `
      <a class="back-link" data-back="1">← 検索結果に戻る</a>
      <div class="card">
        <h2>${escapeHtml(it.display_name)} ${statusBadge(it.status)}</h2>
        ${freshnessBannerHtml({ riskLevel, freshness })}
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
        ${share}
      </div>
    `;
  }

  function renderProcCard(p) {
    const { riskLevel, freshness } = freshnessInfoFor(p, { isDateDependent: false });
    const share = shareBlockHtml({ procedure: p.procedure_id });
    return `
      <a class="back-link" data-back="1">← 検索結果に戻る</a>
      <div class="card">
        <h2>${escapeHtml(p.name)} ${statusBadge(p.status)}</h2>
        ${freshnessBannerHtml({ riskLevel, freshness })}
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
        ${p.district_dependent ? renderOfficeFinder(p) : ""}
        ${share}
      </div>
    `;
  }

  // ---- お住まいの地域から管轄窓口を確認（住所→区役所・支所ナビゲーション） ----
  // 支所は距離ではなく町名による法定管轄のため、ここでは一切の距離計算・
  // ジオコーディング・現在地取得を行わない。公式データにない町名は
  // 「わからない」ものとして扱い、区役所を推測で埋めない（offices.js参照）。

  function officeMapUrl(office) {
    const q = encodeURIComponent(`${office.official_name} ${office.address}`);
    return `https://www.google.com/maps/search/?api=1&query=${q}`;
  }

  function renderOfficeCard(office, roleLabel) {
    if (!office) {
      return `<div class="office-result-card">窓口情報を確認できませんでした。名古屋市公式情報でご確認ください。</div>`;
    }
    return `
      <div class="office-result-card">
        ${roleLabel ? `<div class="office-role-label">${escapeHtml(roleLabel)}</div>` : ""}
        <div class="office-name">${escapeHtml(office.official_name)}</div>
        <div class="office-address">〒${escapeHtml(office.postal_code)} ${escapeHtml(office.address)}</div>
        <div class="office-phone"><a href="tel:${office.phone.replace(/[^0-9]/g, "")}">${escapeHtml(office.phone)}</a></div>
        <div class="office-hours">${escapeHtml(office.business_hours)}（${escapeHtml(office.closed_days)}）</div>
        <div class="office-links">
          <a class="official-link" href="${officeMapUrl(office)}" target="_blank" rel="noopener">地図・経路を見る</a>
          <a class="official-link" href="${office.official_url}" target="_blank" rel="noopener">名古屋市公式ページ</a>
        </div>
      </div>
    `;
  }

  function renderOfficeResult(sel) {
    if (!sel.ward) return "";
    const hasBranch = wardHasBranch(state.branchJurisdiction, sel.ward);
    if (hasBranch && !sel.town) return ""; // 町名待ち
    const result = resolveTownOffice(state.offices, state.branchJurisdiction, sel.ward, sel.town || null);
    if (result.kind === "UNKNOWN") {
      return `
        <div class="office-result office-result-unknown">
          <p>${escapeHtml(OFFICE_UNKNOWN_TOWN_MESSAGE)}</p>
          <a class="official-link" href="${state.config.jurisdiction_table_url}" target="_blank" rel="noopener">名古屋市公式の行政管轄表（支所管内町名一覧）</a>
        </div>
      `;
    }
    if (result.kind === "SPLIT") {
      return `
        <div class="office-result office-result-split">
          <p>${escapeHtml(OFFICE_SPLIT_TOWN_MESSAGE)}</p>
          <a class="official-link" href="${state.config.jurisdiction_table_url}" target="_blank" rel="noopener">名古屋市公式の行政管轄表（支所管内町名一覧）</a>
          ${renderOfficeCard(result.wardOffice, "区役所")}
          ${renderOfficeCard(result.branchOffice, "支所")}
          <p class="office-hours-caution">${escapeHtml(OFFICE_HOURS_CAUTION)}</p>
        </div>
      `;
    }
    // BRANCH または WARD_OFFICE
    return `
      <div class="office-result">
        <div class="section-title" style="margin:10px 4px 6px;">あなたの管轄窓口</div>
        ${renderOfficeCard(result.office, "")}
        <p class="office-hours-caution">${escapeHtml(OFFICE_HOURS_CAUTION)}</p>
      </div>
    `;
  }

  function renderOfficeFinder(p) {
    if (state.officeSelection.procId !== p.procedure_id) {
      state.officeSelection = { procId: p.procedure_id, ward: "", town: "" };
    }
    const sel = state.officeSelection;
    const wardOffices = state.offices.filter((o) => o.office_type === "WARD_OFFICE");
    const wardOptions = wardOffices
      .map((o) => `<option value="${escapeHtml(o.ward)}" ${sel.ward === o.ward ? "selected" : ""}>${escapeHtml(o.ward)}</option>`)
      .join("");

    let townSelectHtml = "";
    if (sel.ward && wardHasBranch(state.branchJurisdiction, sel.ward)) {
      const jurisdiction = getBranchJurisdiction(state.branchJurisdiction, sel.ward);
      const townOptions = [
        ...jurisdiction.town_names.map(
          (t) => `<option value="${escapeHtml(t)}" ${sel.town === t ? "selected" : ""}>${escapeHtml(t)}</option>`
        ),
        ...jurisdiction.split_jurisdiction_towns.map(
          (t) =>
            `<option value="${escapeHtml(t)}" ${sel.town === t ? "selected" : ""}>${escapeHtml(t)}（区役所・支所で分かれています）</option>`
        ),
        `<option value="${NOT_LISTED_IN_BRANCH}" ${sel.town === NOT_LISTED_IN_BRANCH ? "selected" : ""}>この一覧にない（区役所が管轄です）</option>`,
      ].join("");
      townSelectHtml = `
        <label class="office-finder-field">町名を選ぶ
          <select data-office-town>
            <option value="">町名を選ぶ</option>
            ${townOptions}
          </select>
        </label>
      `;
    }

    const resetHtml =
      sel.ward
        ? `<a class="back-link office-finder-reset" data-office-reset="1">← 地域を選び直す</a>`
        : "";

    return `
      <div class="office-finder">
        <div class="section-title" style="margin:14px 4px 8px;">お住まいの地域から管轄窓口を確認</div>
        <div class="office-finder-controls">
          <label class="office-finder-field">区を選ぶ
            <select data-office-ward>
              <option value="">区を選ぶ</option>
              ${wardOptions}
            </select>
          </label>
          ${townSelectHtml}
        </div>
        ${renderOfficeResult(sel)}
        ${resetHtml}
      </div>
    `;
  }

  // 生活イベントは既存procedureデータへのポインタのみを持ち、期限・電話番号・
  // 必要書類等は複製しない（Single Source of Truth）。表示時に procedure_id で
  // 現在のprocedures配列から都度引く。
  function renderLifeEventCard(e) {
    const share = shareBlockHtml({ event: e.event_id });
    const items = (e.related_procedures || [])
      .map((rel) => {
        const p = state.procedures.find((x) => x.procedure_id === rel.procedure_id);
        if (!p) return "";
        return `
          <div class="related-proc-card">
            <div class="related-proc-name">${escapeHtml(p.name)}</div>
            <div class="related-proc-condition">${escapeHtml(rel.condition_label || "")}</div>
            <div class="related-proc-deadline">期限: ${escapeHtml(p.deadline || "")}</div>
            <button type="button" class="related-proc-confirm" data-proc="${p.procedure_id}">確認する</button>
          </div>
        `;
      })
      .join("");
    const wasteLink = e.show_waste_link
      ? `<button type="button" class="event-waste-link" data-nav="gomi">名古屋市のごみ・資源の出し方を確認</button>`
      : "";
    return `
      <a class="back-link" data-back="1">← 検索結果に戻る</a>
      <div class="card life-event-card">
        <h2>${escapeHtml(e.display_name)}</h2>
        <div class="conclusion">${escapeHtml(LIFE_EVENT_CAUTION)}</div>
        <div class="section-title" style="margin:14px 4px 8px;">まず確認すること</div>
        <div class="related-proc-list">${items}</div>
        ${wasteLink}
        ${share}
      </div>
    `;
  }

  function currentActiveWasteItems() {
    return resolveActiveWasteItems(state.wasteItemsAll, state.asOfDate);
  }

  function render() {
    let body = "";
    const activeItems = currentActiveWasteItems();

    let deepLinkNotice = "";
    if (state.deepLinkError) {
      deepLinkNotice = `<div class="deeplink-error">${escapeHtml(state.deepLinkError)}</div>`;
      state.deepLinkError = null; // show once; do not persist across unrelated re-renders
    }

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
    } else if (state.detailEvent) {
      const e = state.lifeEvents.find((x) => x.event_id === state.detailEvent);
      body = renderLifeEventCard(e);
    } else if (state.query) {
      const eventResults = searchLifeEvents(state.query, state.lifeEvents);
      const wasteResults = searchWasteItems(state.query, activeItems);
      const procResults = searchProcedures(state.query, state.procedures);
      if (eventResults.length === 0 && wasteResults.length === 0 && procResults.length === 0) {
        body = renderZeroResult(state.query);
      } else {
        body = `
          <div class="date-picker-row">
            検索基準日:
            <input type="date" id="as-of-date" value="${state.asOfDate}" />
            <span>（粗大ごみ2026年10月ルール変更の境界確認用）</span>
          </div>
          ${eventResults.length ? `<div class="section-title">生活イベント（${eventResults.length}件）</div><div class="result-list">${eventResults.map(eventResultItem).join("")}</div>` : ""}
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
          <p class="site-copyright">© 2026 これどうする？ project</p>
        </div>
      `;
    } else {
      body = `
        ${renderPriorityNav()}
        <div class="beta-notice">
          <strong>公開実証中</strong>
          <div>検索できなかった言葉や分かりにくい点があれば、下の「問い合わせ」からお知らせください。</div>
        </div>
        ${
          state.lifeEvents.length
            ? `<div class="section-title">生活の出来事から探す</div>
              <div class="event-chip-row">
                ${state.lifeEvents
                  .map((e) => `<button data-event="${e.event_id}">${escapeHtml(e.display_name)}</button>`)
                  .join("")}
              </div>`
            : ""
        }
        <div class="section-title">よく検索される品目</div>
        <div class="result-list">${activeItems.slice(0, 5).map(wasteResultItem).join("")}</div>
      `;
    }

    $app.innerHTML = `
      <div class="app-shell">
        ${renderHeader()}
        <div class="notice-banner">${escapeHtml(state.config.disclaimer)}</div>
        <main>${deepLinkNotice}${body}</main>
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
          state.detailEvent = null;
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
      state.detailEvent = null;
      render();
    });

    document.querySelectorAll("[data-nav]").forEach((el) =>
      el.addEventListener("click", () => {
        const key = el.getAttribute("data-nav");
        state.query = "";
        state.detailWaste = null;
        state.detailProc = null;
        state.detailEvent = null;
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
        state.detailEvent = null;
        state.categoryFilter = null;
        render();
      })
    );

    document.querySelectorAll("[data-category]").forEach((el) =>
      el.addEventListener("click", () => {
        state.query = "";
        state.detailWaste = null;
        state.detailProc = null;
        state.detailEvent = null;
        state.view = "gomi";
        state.categoryFilter = el.getAttribute("data-category");
        render();
      })
    );

    document.querySelectorAll("[data-waste]").forEach((el) =>
      el.addEventListener("click", () => {
        state.detailWaste = el.getAttribute("data-waste");
        state.detailEvent = null;
        render();
      })
    );
    document.querySelectorAll("[data-proc], .related-link[data-proc]").forEach((el) =>
      el.addEventListener("click", () => {
        state.detailProc = el.getAttribute("data-proc");
        state.detailWaste = null;
        state.detailEvent = null;
        render();
      })
    );
    document.querySelectorAll("[data-event]").forEach((el) =>
      el.addEventListener("click", () => {
        state.detailEvent = el.getAttribute("data-event");
        state.detailWaste = null;
        state.detailProc = null;
        render();
      })
    );
    document.querySelectorAll("[data-back]").forEach((el) =>
      el.addEventListener("click", () => {
        state.detailWaste = null;
        state.detailProc = null;
        state.detailEvent = null;
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

    const officeWardSelect = document.querySelector("[data-office-ward]");
    if (officeWardSelect) officeWardSelect.addEventListener("change", () => {
      state.officeSelection.ward = officeWardSelect.value;
      state.officeSelection.town = "";
      render();
    });
    const officeTownSelect = document.querySelector("[data-office-town]");
    if (officeTownSelect) officeTownSelect.addEventListener("change", () => {
      state.officeSelection.town = officeTownSelect.value;
      render();
    });
    document.querySelectorAll("[data-office-reset]").forEach((el) =>
      el.addEventListener("click", () => {
        state.officeSelection.ward = "";
        state.officeSelection.town = "";
        render();
      })
    );

    document.querySelectorAll(".share-btn").forEach((el) =>
      el.addEventListener("click", async () => {
        const url = el.getAttribute("data-share-url");
        const fallback = el.nextElementSibling;
        try {
          if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error("no clipboard api");
          await navigator.clipboard.writeText(url);
          const original = el.textContent;
          el.textContent = "✅ リンクをコピーしました";
          setTimeout(() => { el.textContent = original; }, 2000);
        } catch {
          // Clipboard API unavailable/blocked — fail safe to a visible,
          // selectable URL instead of a silent no-op.
          if (fallback) {
            fallback.hidden = false;
            fallback.value = url;
            fallback.select();
          }
        }
      })
    );
  }

  // 生データ配列を直接拾わず、必ず現在の municipality/asOfDate/valid_from/valid_to
  // を解決したactive recordからDeep Linkを解決する（988903b で修正した詳細画面の
  // バグと同じ種類の再発防止）。不正なID・その日付で有効なレコードが無い場合は
  // 検索画面へのfail-safeに倒し、404や空白は出さない。
  function applyDeepLinkFromLocation(wasteItems, procedures, lifeEvents) {
    const params = new URLSearchParams(window.location.search);
    const todayStr = new Date().toISOString().slice(0, 10);
    state.asOfDate = sanitizeAsOfDate(params.get("asof"), todayStr);

    const wasteId = params.get("waste");
    const procId = params.get("procedure");
    const eventId = params.get("event");
    if (wasteId) {
      const result = resolveWasteDeepLink(wasteItems, wasteId, state.asOfDate);
      if (result.ok) {
        state.detailWaste = wasteId;
      } else {
        state.deepLinkError = DEEPLINK_NOT_FOUND_MESSAGE;
      }
    } else if (procId) {
      const result = resolveProcedureDeepLink(procedures, procId);
      if (result.ok) {
        state.detailProc = procId;
      } else {
        state.deepLinkError = DEEPLINK_NOT_FOUND_MESSAGE;
      }
    } else if (eventId) {
      const result = resolveLifeEventDeepLink(lifeEvents, eventId);
      if (result.ok) {
        state.detailEvent = eventId;
      } else {
        state.deepLinkError = DEEPLINK_NOT_FOUND_MESSAGE;
      }
    }
  }

  async function init() {
    const { config, wasteItems, procedures, lifeEvents, offices, branchJurisdiction } =
      await window.KoreDousuruCore.loadMunicipality("../../municipalities/nagoya/config.json");
    state.config = config;
    state.wasteItemsAll = wasteItems;
    state.procedures = procedures;
    state.lifeEvents = lifeEvents;
    state.offices = offices;
    state.branchJurisdiction = branchJurisdiction;
    applyDeepLinkFromLocation(wasteItems, procedures, lifeEvents);
    render();
  }

  init();
})();
