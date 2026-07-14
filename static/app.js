// ============================================================
// Test Stabilization Tracker - Frontend logic
// ============================================================
const state = {
  models: [],
  owners: [],
  scripts: [],
  priority: [],
  failingScripts: [],
  fixTracking: [],
  cycleMatrix: { cycles: [], scripts: [] },
  newScripts: [],
  newScriptItems: [],
  prioritySort: { key: "rank", dir: 1 },
  priorityColumnFilters: {},
  priorityPage: 1,
  charts: {},
  currentUser: localStorage.getItem("tracker_user") || "",
  me: null,   // {username, role, permissions} - phien dang nhap hien tai
  lastReport: "",
  lastReportParams: {},
  rootCauseGroups: [],
  leaderboard: { scope: "cumulative", date: "", week: "" },
};

const TREND_BADGE = {
  regressed:          { label: "🔻 Giảm sút",        bg: "#e74c3c" },
  improved:           { label: "🔺 Cải thiện",        bg: "#2ecc71" },
  unchanged:          { label: "➖ Không đổi",         bg: "#95a5a6" },
  insufficient_data:  { label: "❔ Chưa đủ dữ liệu",   bg: "#bdc3c7" },
};

const FIX_STATUS_STYLE = {
  verified:      { label: "✅ Đã hết lỗi",       color: "#2ecc71" },
  regressed:     { label: "⚠️ Hết rồi fail lại",  color: "#e67e22" },
  still_failing: { label: "❌ Chưa hết lỗi",       color: "#e74c3c" },
  pending:       { label: "⏳ Chờ dữ liệu",        color: "#95a5a6" },
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || ("HTTP " + res.status));
  }
  return res.json();
}

// ---------------- Tabs ----------------
function initTabs() {
  $$(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".tab-btn").forEach((b) => b.classList.remove("active"));
      $$(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      $("#tab-" + btn.dataset.tab).classList.add("active");
      if (btn.dataset.tab === "priority") { renderPriorityTableHead(); renderPriorityTable(); }
      if (btn.dataset.tab === "cycle-compare") { loadCycleMatrix(); }
      if (btn.dataset.tab === "fix-tracking") { loadFixTracking(); }
      if (btn.dataset.tab === "input-fix") { loadFailingScripts(); }
      if (btn.dataset.tab === "new-scripts") { loadNewScripts(); }
      if (btn.dataset.tab === "integrations") { loadIntegrationsStatus(); }
    });
  });
}

// ---------------- Auth / phân quyền ----------------
// Lấy thông tin phiên đăng nhập. Trả về null nếu chưa đăng nhập (401).
async function fetchMe() {
  try {
    const res = await fetch("/api/me");
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

// Ẩn/hiện các tab theo quyền của user hiện tại. Nếu tab đang active bị ẩn thì
// chuyển sang tab đầu tiên được phép.
function applyPermissions() {
  const perms = (state.me && state.me.permissions) || [];
  let activeStillVisible = false;
  let firstVisibleBtn = null;
  $$(".tab-btn").forEach((btn) => {
    const tab = btn.dataset.tab;
    const allowed = perms.includes(tab);
    btn.style.display = allowed ? "" : "none";
    const panel = $("#tab-" + tab);
    if (!allowed && panel) panel.classList.remove("active");
    if (allowed && !firstVisibleBtn) firstVisibleBtn = btn;
    if (allowed && btn.classList.contains("active")) activeStillVisible = true;
  });
  if (!activeStillVisible && firstVisibleBtn) {
    $$(".tab-btn").forEach((b) => b.classList.remove("active"));
    $$(".tab-panel").forEach((p) => p.classList.remove("active"));
    firstVisibleBtn.classList.add("active");
    const panel = $("#tab-" + firstVisibleBtn.dataset.tab);
    if (panel) panel.classList.add("active");
  }
  // Topbar: tên user + link quản trị (chỉ admin).
  const userBox = $("#userBox");
  if (userBox && state.me) {
    userBox.style.display = "";
    $("#userName").textContent = `👤 ${state.me.username} (${state.me.role})`;
    $("#adminLink").style.display = state.me.role === "admin" ? "" : "none";
  }
}

function initAuthUI() {
  $("#btnLogout")?.addEventListener("click", async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location = "/login";
  });
  $("#btnChangePw")?.addEventListener("click", () => {
    $("#cpCurrent").value = ""; $("#cpNew").value = "";
    $("#cpMsg").textContent = "";
    $("#changePwModal").style.display = "flex";
  });
  $("#btnDoChangePw")?.addEventListener("click", async () => {
    const msg = $("#cpMsg");
    const current = $("#cpCurrent").value;
    const newPw = $("#cpNew").value;
    if (!newPw) { msg.textContent = "Nhập mật khẩu mới."; msg.className = "msg-err"; return; }
    try {
      await api("/api/auth/change-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, new: newPw }),
      });
      msg.textContent = "✅ Đã đổi mật khẩu."; msg.className = "msg-ok";
      setTimeout(() => { $("#changePwModal").style.display = "none"; }, 900);
    } catch (e) {
      msg.textContent = e.message; msg.className = "msg-err";
    }
  });
}

// ---------------- Reference data ----------------
function isInputFixTabActive() {
  return $("#tab-input-fix")?.classList.contains("active") || false;
}

async function fetchReferenceData() {
  const [models, owners, scripts, latest, lists] = await Promise.all([
    api("/api/models"),
    api("/api/owners"),
    api("/api/scripts"),
    api("/api/cycles/latest"),
    api("/api/lists"),
  ]);
  state.models = models;
  state.owners = owners;
  state.scripts = scripts;
  state.lists = lists;
  state.rootCauseGroups = lists.root_cause_groups || [];
  return { models, owners, scripts, latest, lists };
}

function renderReferenceData({ models, owners, scripts, latest, lists }) {
  const modelSel = $("#fModel");
  const prevModelValue = modelSel.value; // giu lai lua chon hien tai cua nguoi dung truoc khi rebuild
  modelSel.innerHTML = models.map((m) => `<option value="${m}">${m}</option>`).join("") +
    `<option value="All Models">All Models (sua loi chung)</option>`;
  if (prevModelValue && [...modelSel.options].some((o) => o.value === prevModelValue)) {
    modelSel.value = prevModelValue;
  }

  $("#ownerList").innerHTML = owners.map((o) => `<option value="${o.name}">`).join("");
  const suites = [...new Set([...lists.test_suites, ...scripts.map((s) => s.test_suite)])];
  $("#suiteList").innerHTML = suites.map((s) => `<option value="${s}">`).join("");
  $("#caseList").innerHTML = scripts.map((s) => `<option value="${s.test_case}">`).join("");

  // Fixed_after_cycle mặc định = cycle gần nhất (sẽ được ghi đè khi chọn script fail).
  if ($("#fCycle")) $("#fCycle").value = latest.latest_cycle || 1;

  // Dropdown nhóm nguyên nhân gốc (chuẩn hoá A3) — giữ lựa chọn hiện tại khi rebuild.
  const rcSel = $("#fRootCauseGroup");
  if (rcSel && state.rootCauseGroups.length) {
    const prev = rcSel.value;
    rcSel.innerHTML = `<option value="">— Chọn nhóm nguyên nhân —</option>` +
      state.rootCauseGroups.map((g) => `<option value="${g}">${g}</option>`).join("");
    if (prev && state.rootCauseGroups.includes(prev)) rcSel.value = prev;
  }

  const today = new Date().toISOString().slice(0, 10);
  if (!$("#fDate").value) $("#fDate").value = today;
  if ($("#rDate") && !$("#rDate").value) $("#rDate").value = today;
  if ($("#nsDate") && !$("#nsDate").value) $("#nsDate").value = today;
  nsSyncWeekFromDate(false); // điền Week theo ngày mặc định (không đè giá trị đã sửa tay)

  renderNewScriptForm(); // đồng bộ Member/model checkbox của tab Script viết mới
}

async function loadReferenceData() {
  const data = await fetchReferenceData();
  renderReferenceData(data);
}

// ---------------- Dashboard ----------------
function fmtPct(x) {
  return x === null || x === undefined ? "—" : (x * 100).toFixed(1) + "%";
}

function kpiCard(label, value, cls) {
  return `<div class="kpi ${cls || ""}"><div class="label">${label}</div><div class="value">${value}</div></div>`;
}

function renderKPIs(d) {
  const k = d.kpi;
  let html = "";
  html += kpiCard("Current Pass Rate", fmtPct(k.current_pass_rate));
  if (k.current_pass_rate_adjusted !== null && k.current_pass_rate_adjusted !== undefined) {
    html += kpiCard("Pass Rate (excl. new scripts)", fmtPct(k.current_pass_rate_adjusted));
  }
  html += kpiCard("Target", fmtPct(k.target_pass_rate));
  html += kpiCard("Total Scripts", k.total_scripts);
  html += kpiCard("Still Failing", k.still_failing, k.still_failing > 0 ? "warn" : "good");
  if (d.tier_counts && d.tier_counts.Verify) {
    html += kpiCard("Verifying", d.tier_counts.Verify, "warn");
  }
  if (k.flaky_count !== null && k.flaky_count !== undefined) {
    html += kpiCard("🌀 Flaky", `${k.flaky_count} (${fmtPct(k.flaky_rate)})`, k.flaky_count > 0 ? "warn" : "good");
  }
  html += kpiCard("Current Cycle", k.latest_cycle);
  if (k.days_remaining !== null && k.days_remaining !== undefined) {
    html += kpiCard("Days Remaining", k.days_remaining, k.days_remaining < 7 ? "bad" : "");
  }
  if (k.required_rate_per_day !== null && k.required_rate_per_day !== undefined) {
    html += kpiCard("Required Fixes / Day", k.required_rate_per_day.toFixed(1), "warn");
  }
  $("#kpiRow").innerHTML = html;
}

// ---------------- Dashboard: coverage (company system) + fix-group Pareto ----------------
function renderCoverage(cov) {
  const box = $("#coverageBox");
  const table = $("#coverageTable");
  if (!box) return;
  if (!cov || !cov.configured) {
    box.innerHTML = `<span style="color:#e67e22">⚠️ Company system not synced — total required TCs unknown.</span>
      ${cov && cov.done_recorded ? `<br><span class="hint">Currently recorded <b>${cov.done_recorded}</b> DONE scripts in the system.</span>` : ""}`;
    if (table) table.style.display = "none";
    return;
  }
  const color = cov.pct >= 0.85 ? "#1e8449" : (cov.pct >= 0.5 ? "#e67e22" : "#c0392b");
  box.innerHTML = `<div style="font-size:20px; font-weight:bold; color:${color}">
      ${cov.done} / ${cov.total_needed} (${fmtPct(cov.pct)})</div>
    <span class="hint">SKIP on company side: ${cov.skip} (excluded from total)${cov.out_of_plan ? ` · DONE outside plan: ${cov.out_of_plan}` : ""} · Synced: ${cov.synced_at || "—"}</span>`;
  if (table) {
    table.style.display = "";
    const rowsHtml = (cov.by_item || []).map((it) => `
      <tr><td>${it.item}</td><td>${it.needed}</td><td>${it.done}</td><td><b>${fmtPct(it.pct)}</b></td></tr>
    `).join("") || `<tr><td colspan="4" style="color:#999">—</td></tr>`;
    const totalRow = `<tr class="total-row"><td>Total</td><td>${cov.total_needed}</td><td>${cov.done}</td><td>${fmtPct(cov.pct)}</td></tr>`;
    table.querySelector("tbody").innerHTML = rowsHtml + totalRow;
  }
}

function renderFixPareto(rows) {
  const tbody = $("#fixParetoTable tbody");
  if (!tbody) return;
  if (!rows || !rows.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="color:#999">No fix has recorded a root cause group yet.</td></tr>`;
    return;
  }
  const body = rows.map((g) => `
    <tr><td>${g.group}</td><td>${g.count}</td><td>${fmtPct(g.pct)}</td><td>${fmtPct(g.cum_pct)}</td></tr>
  `).join("");
  const total = rows.reduce((a, g) => a + (g.count || 0), 0);
  tbody.innerHTML = body + `<tr class="total-row"><td>Total</td><td>${total}</td><td>—</td><td>—</td></tr>`;
}

function renderInsights(insights) {
  if (!insights.length) {
    $("#insightsList").innerHTML = "<li>Not enough data yet to generate insights.</li>";
    return;
  }
  $("#insightsList").innerHTML = insights.map((i) => `<li>${i}</li>`).join("");
}

function destroyChart(key) {
  if (state.charts[key]) {
    state.charts[key].destroy();
    delete state.charts[key];
  }
}

function renderCharts(d) {
  // Trend: pass rate
  destroyChart("trend");
  state.charts.trend = new Chart($("#chartTrend"), {
    type: "line",
    data: {
      labels: d.trend.map((t) => "C" + t.cycle),
      datasets: [{
        label: "Pass Rate",
        data: d.trend.map((t) => t.pass_rate === null ? null : (t.pass_rate * 100).toFixed(1)),
        borderColor: "#2E6DA4",
        backgroundColor: "rgba(46,109,164,0.1)",
        tension: 0.25,
        fill: true,
      }],
    },
    options: { scales: { y: { min: 0, max: 100, ticks: { callback: (v) => v + "%" } } }, plugins: { legend: { display: false } } },
  });

  // Fail count trend
  destroyChart("fail");
  state.charts.fail = new Chart($("#chartFail"), {
    type: "bar",
    data: {
      labels: d.trend.map((t) => "C" + t.cycle),
      datasets: [{
        label: "Fail Count",
        data: d.trend.map((t) => t.fail_count),
        backgroundColor: "#e74c3c",
      }],
    },
    options: { plugins: { legend: { display: false } } },
  });

  // Model pass rate
  destroyChart("model");
  const models = Object.keys(d.model_pass_rate);
  state.charts.model = new Chart($("#chartModel"), {
    type: "bar",
    data: {
      labels: models,
      datasets: [{
        label: "Pass Rate",
        data: models.map((m) => d.model_pass_rate[m] === null ? 0 : (d.model_pass_rate[m] * 100).toFixed(1)),
        backgroundColor: "#3498db",
      }],
    },
    options: { scales: { y: { min: 0, max: 100, ticks: { callback: (v) => v + "%" } } }, plugins: { legend: { display: false } } },
  });

  // Tier distribution
  destroyChart("tier");
  const tierLabels = ["P0", "P1", "P2", "P3", "Verify", "Done"];
  const tierColors = ["#e74c3c", "#e67e22", "#f1c40f", "#3498db", "#9b59b6", "#2ecc71"];
  state.charts.tier = new Chart($("#chartTier"), {
    type: "doughnut",
    data: {
      labels: tierLabels,
      datasets: [{ data: tierLabels.map((t) => d.tier_counts[t] || 0), backgroundColor: tierColors }],
    },
    options: { plugins: { legend: { position: "right" } } },
  });

  // Pareto (label is now the GROUPED root cause — truncate X axis, full text on hover)
  destroyChart("pareto");
  state.charts.pareto = new Chart($("#chartPareto"), {
    data: {
      labels: d.root_causes.map((r) => r.description.length > 22 ? r.description.slice(0, 22) + "…" : r.description),
      datasets: [
        { type: "bar", label: "Fail Count", data: d.root_causes.map((r) => r.count), backgroundColor: "#e67e22", yAxisID: "y" },
        { type: "line", label: "Cumulative %", data: d.root_causes.map((r) => (r.cum_pct * 100).toFixed(1)), borderColor: "#1F4E78", yAxisID: "y1" },
      ],
    },
    options: {
      plugins: { tooltip: { callbacks: { title: (items) => d.root_causes[items[0].dataIndex].description } } },
      scales: {
        y: { position: "left", title: { display: true, text: "Fail Count" } },
        y1: { position: "right", min: 0, max: 100, grid: { drawOnChartArea: false }, ticks: { callback: (v) => v + "%" } },
      },
    },
  });

  // Owner resolution rate comparison
  destroyChart("owner");
  const ownersWithRate = d.owner_stats.filter((o) => o.resolution_rate !== null);
  state.charts.owner = new Chart($("#chartOwner"), {
    type: "bar",
    data: {
      labels: ownersWithRate.map((o) => o.owner),
      datasets: [{ label: "Resolution Rate", data: ownersWithRate.map((o) => (o.resolution_rate * 100).toFixed(1)), backgroundColor: "#2ecc71" }],
    },
    options: { indexAxis: "y", scales: { x: { min: 0, max: 100, ticks: { callback: (v) => v + "%" } } }, plugins: { legend: { display: false } } },
  });

  // Suite completion comparison
  destroyChart("suite");
  state.charts.suite = new Chart($("#chartSuite"), {
    type: "bar",
    data: {
      labels: d.suite_stats.map((s) => s.test_suite),
      datasets: [{ label: "Completion %", data: d.suite_stats.map((s) => (s.done_pct * 100).toFixed(1)), backgroundColor: "#3498db" }],
    },
    options: { indexAxis: "y", scales: { x: { min: 0, max: 100, ticks: { callback: (v) => v + "%" } } }, plugins: { legend: { display: false } } },
  });
}

function renderPassRateTable(trend) {
  const tbody = $("#passRateTable tbody");
  if (!tbody) return;
  if (!trend || !trend.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="color:#999">No data yet.</td></tr>`;
    return;
  }
  const body = trend.map((t) => {
    const rateStr = t.pass_rate === null ? "—" : (t.pass_rate * 100).toFixed(1) + "%";
    let deltaStr = "—";
    if (t.delta_rate !== null && t.delta_rate !== undefined) {
      const pct = (t.delta_rate * 100).toFixed(1);
      const sign = t.delta_rate > 0 ? "+" : "";
      const color = t.delta_rate >= 0 ? "#1e8449" : "#c0392b";
      deltaStr = `<span style="color:${color}">${sign}${pct}%</span>`;
    }
    return `
    <tr>
      <td>${t.cycle}</td>
      <td>${t.cycle_date || "—"}</td>
      <td>${t.total}</td>
      <td>${t.pass_count}</td>
      <td>${t.na_count}</td>
      <td>${t.fail_count}</td>
      <td><b>${rateStr}</b></td>
      <td>${deltaStr}</td>
    </tr>`;
  }).join("");
  const sum = (k) => trend.reduce((a, t) => a + (t[k] || 0), 0);
  const sTotal = sum("total"), sPass = sum("pass_count"), sNa = sum("na_count"), sFail = sum("fail_count");
  const denom = sTotal - sNa;
  const overallRate = denom > 0 ? ((sPass / denom) * 100).toFixed(1) + "%" : "—";
  const totalRow = `
    <tr class="total-row">
      <td colspan="2">Total</td>
      <td>${sTotal}</td><td>${sPass}</td><td>${sNa}</td><td>${sFail}</td>
      <td><b>${overallRate}</b></td><td>—</td>
    </tr>`;
  tbody.innerHTML = body + totalRow;
}

// ---------------- Dashboard: Suite × Model × Cycle matrix ----------------
async function loadSuiteModelMatrix() {
  state.suiteModel = await api("/api/suite-model-matrix");
  // Mặc định chọn tất cả cycle nếu chưa chọn gì (hoặc lần đầu).
  if (!state.smSelected) {
    state.smSelected = new Set((state.suiteModel.cycles || []).map((c) => c.cycle));
  } else {
    // Giữ lựa chọn cũ, chỉ bỏ những cycle không còn tồn tại.
    const valid = new Set((state.suiteModel.cycles || []).map((c) => c.cycle));
    state.smSelected = new Set([...state.smSelected].filter((c) => valid.has(c)));
    if (!state.smSelected.size) state.smSelected = new Set([...valid]);
  }
  renderSmChooser();
  renderSuiteModelHead();
  renderSuiteModelMatrix();
  renderSmOverall();
}

function smSelectedCyclesList() {
  return (state.suiteModel.cycles || []).filter((c) => state.smSelected.has(c.cycle));
}

function renderSmChooser() {
  const box = $("#smCycleChooser");
  if (!box) return;
  const cycles = state.suiteModel.cycles || [];
  box.innerHTML = `
    <span style="font-size:13px; color:var(--muted)">Select cycles:</span>
    <div class="ms-dropdown" id="smMs">
      <button type="button" class="ms-toggle" id="smMsToggle" aria-expanded="false"></button>
      <div class="ms-panel" id="smMsPanel" hidden>
        <div class="ms-actions">
          <button type="button" data-act="all">All</button>
          <button type="button" data-act="recent5">Last 5</button>
          <button type="button" data-act="none">Clear</button>
        </div>
        <div class="ms-options">
          ${cycles.map((c) => `
            <label>
              <input type="checkbox" class="sm-cyc-cb" value="${c.cycle}" ${state.smSelected.has(c.cycle) ? "checked" : ""}>
              Cycle ${c.cycle} <span class="ms-date">${c.cycle_date || ""}</span>
            </label>`).join("")}
        </div>
      </div>
    </div>`;

  updateSmToggleLabel();

  const toggle = $("#smMsToggle");
  const panel = $("#smMsPanel");
  const setOpen = (open) => {
    state._smPanelOpen = open;
    if (open) { panel.removeAttribute("hidden"); toggle.setAttribute("aria-expanded", "true"); }
    else { panel.setAttribute("hidden", ""); toggle.setAttribute("aria-expanded", "false"); }
  };
  // Giữ trạng thái mở qua các lần refresh dashboard (~15s) để không đóng ngang khi đang chọn.
  if (state._smPanelOpen) setOpen(true);
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(panel.hasAttribute("hidden"));
  });
  // Đóng panel khi click ra ngoài. Gắn 1 lần duy nhất (renderSmChooser chạy lại mỗi
  // lần refresh dashboard ~15s nên không được add listener lặp lại → rò rỉ).
  if (!state._smDocClickBound) {
    document.addEventListener("click", (e) => {
      const ms = $("#smMs");
      if (!ms || ms.contains(e.target)) return;
      state._smPanelOpen = false;
      const p = $("#smMsPanel"), t = $("#smMsToggle");
      if (p) p.setAttribute("hidden", "");
      if (t) t.setAttribute("aria-expanded", "false");
    });
    state._smDocClickBound = true;
  }

  const applySelection = () => {
    if (!state.smSelected.size && cycles.length) state.smSelected.add(cycles[cycles.length - 1].cycle); // luôn còn ít nhất 1
    // Đồng bộ lại các checkbox theo state (cho các nút preset).
    $$(".sm-cyc-cb").forEach((cb) => { cb.checked = state.smSelected.has(parseInt(cb.value, 10)); });
    updateSmToggleLabel();
    renderSuiteModelHead();
    renderSuiteModelMatrix();
    renderSmOverall();
  };

  $$(".sm-cyc-cb").forEach((cb) => cb.addEventListener("change", () => {
    const cyc = parseInt(cb.value, 10);
    if (cb.checked) state.smSelected.add(cyc); else state.smSelected.delete(cyc);
    applySelection();
  }));

  $$("#smMsPanel .ms-actions button").forEach((btn) => btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const act = btn.dataset.act;
    if (act === "all") state.smSelected = new Set(cycles.map((c) => c.cycle));
    else if (act === "none") state.smSelected = new Set();
    else if (act === "recent5") state.smSelected = new Set(cycles.slice(-5).map((c) => c.cycle));
    applySelection();
  }));
}

function updateSmToggleLabel() {
  const toggle = $("#smMsToggle");
  if (!toggle) return;
  const sel = smSelectedCyclesList();
  const label = sel.length ? sel.map((c) => "C" + c.cycle).join(", ") : "No cycle selected";
  toggle.innerHTML = `<span class="ms-count">${sel.length} cycle</span> ${label} <span class="ms-caret">▾</span>`;
}

// Màu heatmap theo pass rate 0..1: đỏ (0) → vàng (0.5) → xanh (1). Nền nhạt, chữ đậm dễ đọc.
function heatColor(rate) {
  const hue = Math.round(rate * 120); // 0 = đỏ, 120 = xanh lá
  return `hsl(${hue}, 62%, 86%)`;
}

function smCellHtml(cell) {
  if (!cell) return `<td class="cyc-cell cyc-none" data-sortval="-1" title="Did not run in this cycle">—</td>`;
  const { pass_rate, fail_count, total, na_count } = cell;
  let main = "—", sv = -1, style = "";
  if (pass_rate !== null && pass_rate !== undefined) {
    main = (pass_rate * 100).toFixed(0) + "%"; sv = pass_rate;
    style = ` style="background:${heatColor(pass_rate)}"`;
  }
  const detail = `${fail_count}F / ${total}T${na_count ? " / " + na_count + "NA" : ""}`;
  return `<td class="cyc-cell"${style} data-sortval="${sv}" title="${detail}"><b>${main}</b><br><span class="cyc-detail">${detail}</span></td>`;
}

function renderSuiteModelHead() {
  const sel = smSelectedCyclesList();
  let h = `<tr><th class="sm-col-item">Item (Test suite)</th><th class="sm-col-model">Model</th>`;
  for (const c of sel) {
    h += `<th>Cycle ${c.cycle}<br><span style="font-weight:400;font-size:11px;color:#888">${c.cycle_date || ""}</span></th>`;
  }
  h += `</tr>`;
  $("#suiteModelHead").innerHTML = h;
}

function renderSuiteModelMatrix() {
  const sel = smSelectedCyclesList();
  const rows = state.suiteModel.rows || [];
  const overall = state.suiteModel.overall_by_cycle || {};

  // OVERALL row (all scripts) at the top of the table.
  let overallRow = `<tr class="sm-overall-row">
    <td class="sm-col-item" colspan="2">OVERALL — all scripts</td>`;
  for (const c of sel) overallRow += smCellHtml(overall[c.cycle]);
  overallRow += `</tr>`;

  // Gom nhóm theo Item: cột Item chỉ hiện 1 lần (rowspan) cho tất cả model của item đó.
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.test_suite)) groups.set(r.test_suite, []);
    groups.get(r.test_suite).push(r);
  }

  let bodyRows = "";
  for (const [suite, items] of groups) {
    items.forEach((r, idx) => {
      const cells = sel.map((c) => smCellHtml(r.by_cycle[c.cycle])).join("");
      const itemCell = idx === 0
        ? `<td class="sm-col-item sm-group-item" rowspan="${items.length}">${suite}</td>`
        : "";
      bodyRows += `<tr class="${idx === 0 ? "sm-group-start" : ""}">
        ${itemCell}
        <td class="sm-col-model"><span class="tag" style="background:#3498db">${r.model}</span></td>
        ${cells}
      </tr>`;
    });
  }

  $("#suiteModelTable tbody").innerHTML = overallRow + bodyRows;
}

function renderSmOverall() {
  const box = $("#smOverallBox");
  if (!box) return;
  const sel = smSelectedCyclesList();
  const overall = state.suiteModel.overall_by_cycle || {};
  // Gộp các cycle được chọn: rate = Σpass / (Σtotal − Σna).
  let total = 0, pass = 0, na = 0;
  for (const c of sel) {
    const o = overall[c.cycle];
    if (!o) continue;
    total += o.total; pass += o.pass_count; na += o.na_count;
  }
  const denom = total - na;
  const rate = denom > 0 ? (pass / denom) : null;
  const label = sel.map((c) => "C" + c.cycle).join(", ");
  box.innerHTML = `📊 <b>Overall pass rate</b> for selected cycles (${label}):
    <b style="color:${rate !== null && rate >= 0.88 ? "#1e8449" : "#c0392b"}; font-size:16px;">${rate === null ? "—" : (rate * 100).toFixed(1) + "%"}</b>
    <span style="color:#888; font-size:12px;">(${pass} pass-like / ${denom} counted — excludes ${na} NA, ${total} total runs)</span>`;
}

function exportSmMatrixExcel() {
  const sel = smSelectedCyclesList();
  const cycles = sel.map((c) => c.cycle).join(",");
  window.location.href = "/api/export/excel/suite-model-matrix" + (cycles ? `?cycles=${cycles}` : "");
}

function renderOwnerTable(rows, totals) {
  const tbody = $("#ownerTable tbody");
  if (!rows || !rows.length) {
    tbody.innerHTML = `<tr><td colspan="11" style="color:#999">No data in the selected range.</td></tr>`;
    if ($("#lbProductivity")) $("#lbProductivity").textContent = "";
    return;
  }
  const body = rows.map((o) => `
    <tr>
      <td>${o.rank ?? ""}</td>
      <td>${o.owner}</td>
      <td>${o.scripts_written ?? 0}</td>
      <td>${o.fixes_logged ?? 0}</td>
      <td>${o.distinct_scripts_fixed ?? 0}</td>
      <td>${o.distinct_scripts_fully_resolved ?? 0}</td>
      <td><b>${fmtPct(o.resolution_rate)}</b></td>
      <td>${o.verified ?? 0}</td>
      <td>${o.reopened ?? 0}</td>
      <td>${fmtPct(o.verification_rate)}</td>
      <td>${o.open_workload ?? 0}</td>
    </tr>
  `).join("");
  const sum = (k) => rows.reduce((a, o) => a + (o[k] || 0), 0);
  const totalRow = `
    <tr class="total-row">
      <td></td><td>Total</td>
      <td>${sum("scripts_written")}</td>
      <td>${sum("fixes_logged")}</td>
      <td>${sum("distinct_scripts_fixed")}</td>
      <td>${sum("distinct_scripts_fully_resolved")}</td>
      <td>—</td>
      <td>${sum("verified")}</td>
      <td>${sum("reopened")}</td>
      <td>—</td>
      <td>${sum("open_workload")}</td>
    </tr>`;
  tbody.innerHTML = body + totalRow;

  const prod = $("#lbProductivity");
  if (prod && totals) {
    const w = totals.avg_write_per_person_day, f = totals.avg_fix_per_person_day;
    prod.innerHTML = `📊 Productivity avg (over ${totals.days || 0} active day(s), ${totals.people || 0} active people): ` +
      `<b>${w != null ? w.toFixed(2) : "—"}</b> scripts written / person / day · ` +
      `<b>${f != null ? f.toFixed(2) : "—"}</b> fixes / person / day`;
  }
}

async function loadLeaderboard() {
  const lb = state.leaderboard;
  let url = `/api/leaderboard?scope=${encodeURIComponent(lb.scope)}`;
  if (lb.scope === "day" && lb.date) url += `&date=${encodeURIComponent(lb.date)}`;
  if (lb.scope === "week" && lb.week) url += `&week=${encodeURIComponent(lb.week)}`;
  try {
    const res = await api(url);
    renderOwnerTable(res.rows, res.totals);
    reapplyAllTableFilters();
  } catch (e) {
    if ($("#lbMsg")) { $("#lbMsg").textContent = "Error: " + e.message; $("#lbMsg").className = "msg-err"; }
  }
}

function initLeaderboard() {
  const scopeSel = $("#lbScope");
  if (!scopeSel) return;
  if ($("#lbDate") && !$("#lbDate").value) $("#lbDate").value = new Date().toISOString().slice(0, 10);
  const syncWraps = () => {
    $("#lbDateWrap").style.display = scopeSel.value === "day" ? "" : "none";
    $("#lbWeekWrap").style.display = scopeSel.value === "week" ? "" : "none";
  };
  const apply = () => {
    state.leaderboard = { scope: scopeSel.value, date: $("#lbDate").value, week: $("#lbWeek").value };
    if ($("#lbMsg")) $("#lbMsg").textContent = "";
    loadLeaderboard();
  };
  scopeSel.addEventListener("change", () => { syncWraps(); apply(); });
  $("#lbDate").addEventListener("change", apply);
  $("#lbWeek").addEventListener("change", apply);
  syncWraps();
}

function renderSuiteTable(suite_stats) {
  const tbody = $("#suiteTable tbody");
  if (!suite_stats.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:#999">No data yet.</td></tr>`;
    return;
  }
  const body = suite_stats.map((s) => `
    <tr>
      <td>${s.test_suite}</td>
      <td>${s.total_scripts}</td>
      <td>${s.done}</td>
      <td>${s.verify ?? 0}</td>
      <td>${s.still_failing}</td>
      <td>${fmtPct(s.done_pct)}</td>
    </tr>
  `).join("");
  const sum = (k) => suite_stats.reduce((a, s) => a + (s[k] || 0), 0);
  const tTot = sum("total_scripts"), tDone = sum("done");
  const totalRow = `
    <tr class="total-row">
      <td>Total</td><td>${tTot}</td><td>${tDone}</td><td>${sum("verify")}</td><td>${sum("still_failing")}</td>
      <td>${fmtPct(tTot ? tDone / tTot : null)}</td>
    </tr>`;
  tbody.innerHTML = body + totalRow;
}

async function refreshDashboard() {
  try {
    const d = await api("/api/dashboard");
    renderKPIs(d);
    renderInsights(d.insights);
    renderCoverage(d.coverage);
    renderFixPareto(d.fix_root_causes);
    // Biểu đồ tách riêng: nếu Chart.js lỗi cũng KHÔNG chặn bảng số liệu bên dưới render.
    try { renderCharts(d); } catch (e) { console.error("Chart render failed:", e); }
    await loadLeaderboard();
    renderSuiteTable(d.suite_stats);
    renderPassRateTable(d.trend);
    try { await loadSuiteModelMatrix(); } catch (e) { console.error("Suite-model matrix failed:", e); }
    reapplyAllTableFilters();
    setConn(true);
    $("#lastRefresh").textContent = "Cập nhật: " + new Date().toLocaleTimeString("vi-VN");
  } catch (e) {
    setConn(false);
    console.error(e);
  }
}

// ============================================================
// Generic Table Tools: sort theo cột (click header) + ô filter cho mỗi cột
// + nút xuất Excel/CSV. Áp dụng cho MỌI bảng data-table (kể cả bảng có header
// động như matrix). Tự re-apply sau mỗi lần render lại tbody (MutationObserver).
// ============================================================
const TT = {}; // tableId -> { sortCol, sortDir, filters:{colIdx:val}, globalSearch, page, allRows, _obs }

// ---- Phan trang (client-side) dung chung cho moi bang data-table ----
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];
const PAGE_SIZE_DEFAULT = 50;

function ttPageSizeRaw(id) {
  const raw = localStorage.getItem("pgsize:" + id);
  if (raw === "all") return "all";
  const n = parseInt(raw, 10);
  return (n && n > 0) ? String(n) : String(PAGE_SIZE_DEFAULT);
}
function ttPageSize(id) {
  const raw = ttPageSizeRaw(id);
  return raw === "all" ? Infinity : parseInt(raw, 10);
}

// Dung thanh dieu khien phan trang trong `bar`. info={total,start,end,page,totalPages}.
// onGo(pageNumber), onSize(rawValue). An hoan toan khi it dong (1 trang & <= muc nho nhat).
function ttBuildPagerBar(bar, id, info, onGo, onSize) {
  const smallest = PAGE_SIZE_OPTIONS[0];
  const sizeRaw = ttPageSizeRaw(id);
  if (info.totalPages <= 1 && info.total <= smallest && sizeRaw !== "all") {
    bar.style.display = "none";
    bar.innerHTML = "";
    return;
  }
  bar.style.display = "flex";
  const opts = PAGE_SIZE_OPTIONS.map((n) =>
    `<option value="${n}"${sizeRaw === String(n) ? " selected" : ""}>${n}/trang</option>`).join("") +
    `<option value="all"${sizeRaw === "all" ? " selected" : ""}>Tất cả</option>`;
  const showFrom = info.total === 0 ? 0 : info.start + 1;
  bar.innerHTML =
    `<select class="tt-pgsize" title="Số dòng mỗi trang">${opts}</select>` +
    `<button class="tt-pg-first" ${info.page <= 1 ? "disabled" : ""} title="Trang đầu">⏮</button>` +
    `<button class="tt-pg-prev" ${info.page <= 1 ? "disabled" : ""} title="Trang trước">◀</button>` +
    `<span class="tt-pg-label">${showFrom}–${info.end} / ${info.total}</span>` +
    `<button class="tt-pg-next" ${info.page >= info.totalPages ? "disabled" : ""} title="Trang sau">▶</button>` +
    `<button class="tt-pg-last" ${info.page >= info.totalPages ? "disabled" : ""} title="Trang cuối">⏭</button>` +
    `<span class="tt-pg-pages">Trang ${info.page}/${info.totalPages}</span>`;
  bar.querySelector(".tt-pgsize").onchange = (e) => { localStorage.setItem("pgsize:" + id, e.target.value); onSize(e.target.value); };
  bar.querySelector(".tt-pg-first").onclick = () => onGo(1);
  bar.querySelector(".tt-pg-prev").onclick = () => onGo(info.page - 1);
  bar.querySelector(".tt-pg-next").onclick = () => onGo(info.page + 1);
  bar.querySelector(".tt-pg-last").onclick = () => onGo(info.totalPages);
}

// Tinh thong tin trang tu tong so dong da loc + trang hien tai + id (de doc pageSize).
function ttPageInfo(id, total, page) {
  const pageSize = ttPageSize(id);
  const totalPages = pageSize === Infinity ? 1 : Math.max(1, Math.ceil(total / pageSize));
  let p = page || 1;
  if (p > totalPages) p = totalPages;
  if (p < 1) p = 1;
  const start = pageSize === Infinity ? 0 : (p - 1) * pageSize;
  const end = pageSize === Infinity ? total : Math.min(total, start + pageSize);
  return { total, start, end, page: p, totalPages, pageSize };
}

function ttEnsurePager(table) {
  if (table._ttPager) return table._ttPager;
  const bar = document.createElement("div");
  bar.className = "tt-pager";
  bar.style.display = "none";
  table.parentNode.insertBefore(bar, table);
  table._ttPager = bar;
  return bar;
}

function ttClean(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function ttSortKey(row, idx) {
  // Tra ve {t:'num'|'str'|'empty', v}. Empty ("—"/rong) luon xuong cuoi khi sort.
  const cell = row.cells[idx];
  if (!cell) return { t: "empty" };
  if (cell.dataset && cell.dataset.sortval !== undefined) {
    const v = parseFloat(cell.dataset.sortval);
    if (!isNaN(v)) return { t: "num", v };
  }
  const raw = ttClean(cell.textContent);
  if (raw === "" || raw === "—" || raw === "(chưa gán)") return { t: "empty" };
  const cleaned = raw.replace(/[,%\s]/g, "");
  if (cleaned !== "" && /^[+\-]?\d*\.?\d+$/.test(cleaned)) return { t: "num", v: parseFloat(cleaned) };
  return { t: "str", v: raw.toLowerCase() };
}

function ttCompare(a, b, idx, dir) {
  const ka = ttSortKey(a, idx), kb = ttSortKey(b, idx);
  const ae = ka.t === "empty", be = kb.t === "empty";
  if (ae && be) return 0;
  if (ae) return 1;   // empty luôn xuống cuối (bất kể chiều sort)
  if (be) return -1;
  if (ka.t === "num" && kb.t === "num") return (ka.v - kb.v) * dir;
  const as = String(ka.v), bs = String(kb.v);
  return (as < bs ? -1 : as > bs ? 1 : 0) * dir;
}

function ttHeaderRow(table) {
  const rows = Array.from(table.tHead ? table.tHead.rows : []).filter((r) => !r.classList.contains("tt-filter-row"));
  return rows[rows.length - 1] || null;
}

function ttEnsureFilterRow(table) {
  const st = TT[table.id];
  const headerRow = ttHeaderRow(table);
  if (!headerRow) return;
  const nCols = headerRow.cells.length;
  let fr = table.tHead.querySelector(".tt-filter-row");
  if (fr && fr.cells.length === nCols) {
    // đồng bộ lại value từ state (giữ nguyên khi header động bị dựng lại)
    Array.from(fr.cells).forEach((th, i) => {
      const inp = th.querySelector("input");
      if (inp) inp.value = st.filters[i] || "";
    });
    return;
  }
  if (fr) fr.remove();
  fr = document.createElement("tr");
  fr.className = "tt-filter-row";
  for (let i = 0; i < nCols; i++) {
    const th = document.createElement("th");
    const inp = document.createElement("input");
    inp.type = "text";
    inp.className = "col-filter";
    inp.placeholder = "Lọc...";
    inp.value = st.filters[i] || "";
    inp.addEventListener("click", (e) => e.stopPropagation());
    inp.addEventListener("input", () => { st.filters[i] = inp.value; st.page = 1; ttApply(table); });
    th.appendChild(inp);
    fr.appendChild(th);
  }
  table.tHead.appendChild(fr);
}

function ttWireSort(table) {
  const headerRow = ttHeaderRow(table);
  if (!headerRow) return;
  Array.from(headerRow.cells).forEach((th, i) => {
    if (th.dataset.ttSort) return;
    th.dataset.ttSort = "1";
    th.style.cursor = "pointer";
    th.title = "Bấm để sắp xếp";
    th.addEventListener("click", () => {
      const st = TT[table.id];
      if (st.sortCol === i) st.sortDir *= -1; else { st.sortCol = i; st.sortDir = 1; }
      st.page = 1;
      ttApply(table);
    });
  });
}

// Loc mang dong theo global-search + filter tung cot (khong sort, khong phan trang).
function ttFilterRows(st, rows) {
  const gs = (st.globalSearch || "").toLowerCase().trim();
  const active = Object.entries(st.filters).filter(([, v]) => v);
  if (!gs && !active.length) return rows.slice();
  return rows.filter((r) => {
    if (gs && !r.textContent.toLowerCase().includes(gs)) return false;
    for (const [col, val] of active) {
      const cell = r.cells[col];
      const text = ttClean(cell ? cell.textContent : "").toLowerCase();
      if (!text.includes(val.toLowerCase())) return false;
    }
    return true;
  });
}

// Mo hinh "kho dong day du + chi render trang hien tai vao DOM" (giam that so node DOM):
// - Thu hoach (harvest) toan bo dong data khi tbody vua bi render lai tu ben ngoai
//   (phat hien qua tham chieu node: dong moi khong nam trong kho cu -> la noi dung moi).
// - Loc + sort + phan trang tren mang JS day du (st.allRows), roi chi gan lat-cat trang
//   hien tai vao DOM. Total-row luon o cuoi & phan anh TOAN BO du lieu (khong theo loc).
function ttApply(table) {
  const st = TT[table.id];
  const headerRow = ttHeaderRow(table);
  const tbody = table.tBodies[0];
  if (!st || !headerRow || !tbody) return;
  const nCols = headerRow.cells.length;

  const curData = Array.from(tbody.rows).filter((r) => r.cells.length === nCols && !r.classList.contains("total-row"));
  const known = st._allSet || new Set();
  const isFresh = !st.allRows || curData.some((r) => !known.has(r));
  if (isFresh) {
    st.allRows = curData;
    st._allSet = new Set(curData);
    st.totalRows = Array.from(tbody.rows).filter((r) => r.classList.contains("total-row"));
    st.otherRows = Array.from(tbody.rows).filter((r) => r.cells.length !== nCols && !r.classList.contains("total-row"));
    // Giu nguyen st.page qua cac lan render lai (polling) -> clamp o duoi neu vuot pham vi.
  }

  const anyFilter = !!(st.globalSearch || "").trim() || Object.values(st.filters).some((v) => v);
  let visible = ttFilterRows(st, st.allRows);
  if (st.sortCol != null) {
    visible = visible.slice().sort((a, b) => ttCompare(a, b, st.sortCol, st.sortDir));
  }

  const info = ttPageInfo(table.id, visible.length, st.page);
  st.page = info.page;
  const slice = visible.slice(info.start, info.end);

  // Ngat observer khi tu dung lai DOM (tranh vong lap MutationObserver bat dong bo).
  if (st._obs) st._obs.disconnect();
  st.allRows.forEach((r) => { if (r.parentNode) r.parentNode.removeChild(r); });
  st.otherRows.forEach((r) => { if (r.parentNode) r.parentNode.removeChild(r); });
  st.totalRows.forEach((r) => { if (r.parentNode) r.parentNode.removeChild(r); });
  // Placeholder ("khong co du lieu"/colspan): chi hien khi khong co dong data nao va
  // khong co bo loc dang bat (giu dung hanh vi cu).
  if (visible.length === 0 && !anyFilter) {
    st.otherRows.forEach((r) => { r.style.display = ""; tbody.appendChild(r); });
  }
  slice.forEach((r) => { r.style.display = ""; tbody.appendChild(r); });
  st.totalRows.forEach((r) => { r.style.display = ""; tbody.appendChild(r); });
  if (st._obs) { st._obs.takeRecords(); st._obs.observe(tbody, { childList: true }); }

  ttBuildPagerBar(ttEnsurePager(table), table.id, info,
    (p) => { st.page = p; ttApply(table); },
    () => { st.page = 1; ttApply(table); });
}

function ttExport(table) {
  const headerRow = ttHeaderRow(table);
  if (!headerRow) return;
  const nCols = headerRow.cells.length;
  const headers = Array.from(headerRow.cells).map((th) => ttClean(th.textContent));
  const tbody = table.tBodies[0];
  // Xuat TOAN BO dong da loc (theo bo loc/tim kiem hien hanh) - KHONG chi trang hien tai.
  // Uu tien kho dong day du st.allRows; fallback ve DOM neu bang chua duoc TT quan ly.
  const st = TT[table.id];
  let rows;
  if (st && st.allRows) {
    let filtered = ttFilterRows(st, st.allRows);
    if (st.sortCol != null) filtered = filtered.slice().sort((a, b) => ttCompare(a, b, st.sortCol, st.sortDir));
    rows = filtered;
  } else {
    rows = Array.from(tbody.rows).filter((r) => r.cells.length === nCols && r.style.display !== "none");
  }
  const esc = (s) => {
    s = ttClean(s);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.map(esc).join(",")];
  for (const r of rows) lines.push(Array.from(r.cells).map((c) => esc(c.textContent)).join(","));
  const csv = "﻿" + lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (table.id || "table") + "_" + new Date().toISOString().slice(0, 10) + ".csv";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function ttAddExportButton(table) {
  if (table.dataset.ttExport) return;
  table.dataset.ttExport = "1";
  const btn = document.createElement("button");
  btn.className = "btn-tiny rename tt-export-btn";
  btn.textContent = "⬇️ Xuất Excel (CSV)";
  btn.style.marginBottom = "6px";
  btn.addEventListener("click", () => ttExport(table));
  table.parentNode.insertBefore(btn, table);
}

// Gọi lại sau khi header động được dựng lại (matrix) để tái tạo filter row + wiring sort.
function ttRefresh(table) {
  if (!TT[table.id]) return;
  ttEnsureFilterRow(table);
  ttWireSort(table);
  ttApply(table);
}

function ttSetup(table) {
  if (!table || !table.tHead || !table.tBodies[0]) return;
  if (!TT[table.id]) TT[table.id] = { sortCol: null, sortDir: 1, filters: {}, globalSearch: "", _obs: null, page: 1, allRows: null };
  ttAddExportButton(table);
  ttEnsureFilterRow(table);
  ttWireSort(table);
  if (!table.dataset.ttObserved) {
    table.dataset.ttObserved = "1";
    const obs = new MutationObserver(() => {
      // header có thể đã bị dựng lại (bảng động) -> đảm bảo filter row + sort còn nguyên
      ttEnsureFilterRow(table);
      ttWireSort(table);
      ttApply(table);
    });
    obs.observe(table.tBodies[0], { childList: true });
    TT[table.id]._obs = obs;
  }
  ttApply(table);
}

// Lưu ý: KHÔNG đưa "suiteModelTable" vào đây. Bảng đó dùng bố cục gom nhóm (rowspan cột
// Item + dòng OVERALL colspan) nên không tương thích với hệ sort/filter dùng chung (vốn giả
// định mọi dòng phẳng, cùng số cột). Cần lọc/sắp xếp chi tiết thì dùng tab "So sánh Cycle".
const ENHANCED_TABLE_IDS = [
  "passRateTable", "ownerTable", "suiteTable",
  "cycleMatrixTable", "fixTrackingTable", "newScriptsTable",
  "suiteListTable", "modelListTable", "ownerListTable",
  "reconcileTable",
];

function initTableTools() {
  ENHANCED_TABLE_IDS.forEach((id) => {
    const t = document.getElementById(id);
    if (t) ttSetup(t);
  });
}

// ---------------- Legacy single-box filter -> delegate sang TT nếu bảng đã enhanced ----------------
function applyTableFilter(input) {
  const id = input.dataset.target;
  const table = document.getElementById(id);
  if (!table) return;
  if (TT[id]) { TT[id].globalSearch = input.value; TT[id].page = 1; ttApply(table); return; }
  const q = input.value.toLowerCase().trim();
  table.querySelectorAll("tbody tr").forEach((tr) => {
    tr.style.display = (!q || tr.textContent.toLowerCase().includes(q)) ? "" : "none";
  });
}
function wireTableFilters() {
  $$(".table-filter").forEach((inp) => inp.addEventListener("input", () => applyTableFilter(inp)));
}
function reapplyAllTableFilters() {
  $$(".table-filter").forEach((inp) => { if (inp.value) applyTableFilter(inp); });
}

function setConn(ok) {
  const el = $("#connStatus");
  el.textContent = ok ? "● Đã kết nối" : "● Mất kết nối";
  el.className = ok ? "conn-ok" : "conn-bad";
}

// ---------------- Input Results ----------------
// Parser theo dang TSV/CSV, ton trong quoted field co the xuong dong nhieu dong
// (kieu Excel export: field bao trong "..." va "" la dau nhay kep thoat).
function tokenizeDelimited(text, delim) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"' && field === "") {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field); field = "";
    } else if (c === "\r") {
      // bo qua
    } else if (c === "\n") {
      row.push(field); field = "";
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Nhan 2 dinh dang:
//  - Cu (6 cot): Test ID, Model, Test suite, Test Case, State, Description
//  - Moi (8 cot): Request ID, Model, Test Suite, Test Case, State, Description, Author, Team
// test_suite/test_case gui len o dang tho, server se tu trich xuat/chuan hoa ten.
function parsePaste(text) {
  if (!text || !text.trim()) return [];
  const delim = text.includes("\t") ? "\t" : ",";
  const tokenRows = tokenizeDelimited(text, delim);
  const rows = [];
  for (const parts of tokenRows) {
    const trimmed = parts.map((p) => p.trim());
    if (!trimmed.some((p) => p.length)) continue; // dong trong
    if (trimmed.length < 6) continue;
    if (/^(test\s*id|request\s*id|sdf\s*id)$/i.test(trimmed[0]) || /^model$/i.test(trimmed[1])) continue; // header row

    let row;
    if (trimmed.length >= 8) {
      const test_id = trimmed[0], model = trimmed[1], test_suite = trimmed[2], test_case = trimmed[3], state = trimmed[4];
      const team = trimmed[trimmed.length - 1];
      const author = trimmed[trimmed.length - 2];
      const description = trimmed.slice(5, trimmed.length - 2).join(" ");
      row = { test_id, model, test_suite, test_case, state, description, author, team };
    } else {
      const [test_id, model, test_suite, test_case, state, ...descParts] = trimmed;
      row = { test_id, model, test_suite, test_case, state, description: descParts.join(" ") || "" };
    }
    rows.push(row);
  }
  return rows;
}

function initInputResults() {
  $("#btnParsePreview").addEventListener("click", () => {
    const rows = parsePaste($("#pasteArea").value);
    if (!rows.length) {
      $("#previewBox").innerHTML = "<p style='color:#999'>Không nhận diện được dòng dữ liệu nào.</p>";
      return;
    }
    let html = `<p>Nhận diện <b>${rows.length}</b> dòng (Test suite/Test case sẽ được server tự chuẩn hoá tên khi lưu):</p><table class="data-table"><thead><tr>
      <th>Test ID</th><th>Model</th><th>Suite (thô)</th><th>Case (thô)</th><th>State</th><th>Description</th><th>Author</th><th>Team</th></tr></thead><tbody>`;
    rows.slice(0, 20).forEach((r) => {
      html += `<tr><td>${r.test_id}</td><td>${r.model}</td><td>${r.test_suite}</td><td>${r.test_case}</td><td>${r.state}</td><td>${r.description}</td><td>${r.author || ""}</td><td>${r.team || ""}</td></tr>`;
    });
    html += "</tbody></table>";
    if (rows.length > 20) html += `<p style="color:#999">... và ${rows.length - 20} dòng khác</p>`;
    $("#previewBox").innerHTML = html;
  });

  $("#btnSubmitResults").addEventListener("click", async () => {
    const rows = parsePaste($("#pasteArea").value);
    const msg = $("#resultsMsg");
    if (!rows.length) {
      msg.textContent = "Không có dữ liệu hợp lệ để gửi.";
      msg.className = "msg-err";
      return;
    }

    // Cycle được server tự suy từ ngày trong Test ID; chỉ gửi kèm ngày chạy thủ công
    // để làm fallback cho các dòng có Test ID không mã hoá ngày.
    const cycle_date = $("#rDate").value;
    const payload = {
      rows: rows.map((r) => ({ ...r, cycle_date })),
    };
    try {
      const res = await api("/api/results", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      let extra = "";
      if (res.skipped_running) extra += ` (${res.skipped_running} dòng RUNNING bị bỏ qua)`;
      if (res.skipped_duplicate) extra += ` (${res.skipped_duplicate} dòng trùng lặp bị bỏ qua — đã có sẵn cùng Test ID/Test Case/Model/State/Description)`;
      if (res.errors.length) extra += ` (${res.errors.length} dòng lỗi)`;
      msg.textContent = `✅ Đã lưu ${res.inserted} dòng.` + extra;
      msg.className = res.errors.length ? "msg-err" : "msg-ok";
      $("#pasteArea").value = "";
      if (res.duplicates && res.duplicates.length) {
        const dupList = res.duplicates.slice(0, 15).map((d) =>
          `<tr><td>${d.test_id}</td><td>${d.model}</td><td>${d.test_suite}</td><td>${d.test_case}</td><td>${d.state}</td></tr>`
        ).join("");
        $("#previewBox").innerHTML = `<p style="color:#e67e22">⚠️ ${res.duplicates.length} dòng bị bỏ qua vì đã trùng dữ liệu có sẵn:</p>
          <table class="data-table"><thead><tr><th>Test ID</th><th>Model</th><th>Suite</th><th>Case</th><th>State</th></tr></thead>
          <tbody>${dupList}</tbody></table>
          ${res.duplicates.length > 15 ? `<p style="color:#999">... và ${res.duplicates.length - 15} dòng khác</p>` : ""}`;
      } else {
        $("#previewBox").innerHTML = "";
      }
      await loadReferenceData();
      await refreshDashboard();
    } catch (e) {
      msg.textContent = "Lỗi: " + e.message;
      msg.className = "msg-err";
    }
  });
}

// ---------------- Input Fix ----------------
async function fetchFailingScripts() {
  state.failingScripts = await api("/api/failing-scripts");
}

async function loadFailingScripts() {
  await fetchFailingScripts();
  renderFailingScriptOptions();
}

function renderFailingScriptOptions() {
  const sel = $("#fFailingScript");
  if (!sel) return;
  const q = ($("#fFailSearch")?.value || "").toLowerCase();
  const list = (state.failingScripts || []).filter((s) =>
    !q || s.test_suite.toLowerCase().includes(q) || s.test_case.toLowerCase().includes(q)
  );
  if (!list.length) {
    sel.innerHTML = `<option value="">— Không có script fail nào khớp —</option>`;
    return;
  }
  sel.innerHTML = list.map((s, i) => {
    const models = (s.failing_models || []).join(", ") || "—";
    return `<option value="${i}">[${s.priority_tier}] ${s.test_suite} / ${s.test_case} — fail model: ${models} (tổng ${s.fail_count} fail)</option>`;
  }).join("");
  // Lưu list đã lọc để lấy đúng object khi chọn
  sel._filtered = list;
}

function fillFixFormFromScript(s) {
  $("#fSuite").value = s.test_suite;
  $("#fCase").value = s.test_case;
  // Model đã fix: ưu tiên các model đang fail + "All Models"
  const failing = s.failing_models || [];
  const opts = [...failing, ...state.models.filter((m) => !failing.includes(m))];
  $("#fModel").innerHTML = opts.map((m) => {
    const isFailing = failing.includes(m);
    return `<option value="${m}">${m}${isFailing ? " (đang fail)" : ""}</option>`;
  }).join("") + `<option value="All Models">All Models (sửa lỗi chung)</option>`;
  // Fixed after cycle = cycle gần nhất script này chạy
  if (s.last_updated_cycle) $("#fCycle").value = s.last_updated_cycle;
  // Gợi ý owner = người đang phụ trách (nếu có)
  if (s.current_owner && !$("#fOwner").value) $("#fOwner").value = s.current_owner;
}

function resetFixModelSelect() {
  $("#fModel").innerHTML = state.models.map((m) => `<option value="${m}">${m}</option>`).join("") +
    `<option value="All Models">All Models (sửa lỗi chung)</option>`;
}

function initInputFix() {
  // Lọc nhanh danh sách script fail
  $("#fFailSearch")?.addEventListener("input", renderFailingScriptOptions);

  // Chọn script fail -> tự điền form
  $("#fFailingScript")?.addEventListener("change", (e) => {
    const sel = e.target;
    const idx = parseInt(sel.value, 10);
    const list = sel._filtered || state.failingScripts || [];
    if (!isNaN(idx) && list[idx]) fillFixFormFromScript(list[idx]);
  });

  // Nút "Nhập tay (bỏ chọn)" -> cho phép gõ tự do
  $("#btnClearFixForm")?.addEventListener("click", () => {
    $("#fSuite").value = ""; $("#fSuite").removeAttribute("readonly");
    $("#fCase").value = ""; $("#fCase").removeAttribute("readonly");
    $("#fSuite").placeholder = "VD: WiFi"; $("#fCase").placeholder = "VD: TC002";
    resetFixModelSelect();
    if ($("#fFailingScript")) $("#fFailingScript").value = "";
  });

  $("#btnSubmitFix").addEventListener("click", async () => {
    const payload = {
      fix_date: $("#fDate").value,
      owner: $("#fOwner").value.trim(),
      test_suite: $("#fSuite").value.trim(),
      test_case: $("#fCase").value.trim(),
      model_fixed: $("#fModel").value,
      fixed_after_cycle: parseInt($("#fCycle").value, 10),
      root_cause_group: $("#fRootCauseGroup") ? $("#fRootCauseGroup").value : "",
      root_cause_detail: $("#fRootCause").value.trim(),
      note: $("#fNote").value.trim(),
    };
    const msg = $("#fixMsg");
    if (!payload.owner || !payload.test_suite || !payload.test_case) {
      msg.textContent = "Vui lòng chọn script đang fail (hoặc bấm 'Nhập tay') và điền Owner.";
      msg.className = "msg-err";
      return;
    }
    if (!payload.root_cause_group) {
      msg.textContent = "⚠️ Bắt buộc chọn Nhóm nguyên nhân gốc trước khi ghi nhận fix.";
      msg.className = "msg-err";
      $("#fRootCauseGroup").focus();
      return;
    }
    if (!payload.root_cause_detail) {
      msg.textContent = "⚠️ Bắt buộc nhập Chi tiết nguyên nhân (mô tả cụ thể) trước khi ghi nhận fix.";
      msg.className = "msg-err";
      $("#fRootCause").focus();
      return;
    }
    try {
      const res = await api("/api/fixes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.status === "updated") {
        msg.textContent = "ℹ️ " + (res.message || "Fix này đã có — đã cập nhật thay vì tạo dòng trùng.");
      } else {
        msg.textContent = "✅ Đã ghi nhận fix. Xem tab '🔬 Theo dõi Fix' để kiểm tra kết quả lần chạy sau.";
      }
      msg.className = "msg-ok";
      if ($("#fRootCauseGroup")) $("#fRootCauseGroup").value = "";
      $("#fRootCause").value = "";
      $("#fNote").value = "";
      await loadReferenceData();
      await loadFailingScripts();
      await loadFixTracking();
      await refreshDashboard();
    } catch (e) {
      msg.textContent = "Lỗi: " + e.message;
      msg.className = "msg-err";
    }
  });
}

// ---------------- New Scripts (Script viết mới) ----------------
// Suy Item từ TC ID theo đúng tiền tố server trả về (một nguồn sự thật với backend).
function nsDeriveItem(tcId) {
  const lower = String(tcId || "").trim().toLowerCase();
  if (!lower) return null;
  for (const r of state.newScriptItems) {
    for (const p of r.prefixes) {
      const seps = (r.separators && r.separators[p]) || ["_"];
      if (seps.some((sep) => lower.startsWith(p + sep))) return r.item;
    }
  }
  return null;
}

function nsIsoWeek(dateStr) {
  // Tuần ISO của 1 ngày (khớp date.isocalendar()[1] phía Python).
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d)) return null;
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7; // Mon=0..Sun=6
  target.setDate(target.getDate() - dayNr + 3); // đến thứ Năm cùng tuần
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const firstDayNr = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNr + 3);
  return 1 + Math.round((target - firstThursday) / (7 * 24 * 3600 * 1000));
}

// Cac ham *For(prefix) dung chung giua form tao (prefix "ns") va modal sua (prefix "nsEdit"),
// tranh copy-paste logic UI/validate giua 2 noi.
function nsSelectedStatusFor(prefix) {
  const el = document.querySelector(`input[name="${prefix}Status"]:checked`);
  return el ? el.value : "";
}
function nsSelectedStatus() {
  return nsSelectedStatusFor("ns");
}

// Điền Assign Week theo Completed date. force=false: chỉ điền khi ô Week đang trống
// (giữ giá trị người dùng đã sửa tay); force=true: luôn tính lại (khi đổi ngày / xoá form).
function nsSyncWeekFromDateFor(prefix, force) {
  const dEl = $(`#${prefix}Date`), wEl = $(`#${prefix}Week`);
  if (!dEl || !wEl) return;
  if (!force && wEl.value) return;
  const wk = dEl.value ? nsIsoWeek(dEl.value) : null;
  if (wk) wEl.value = wk;
}
function nsSyncWeekFromDate(force) {
  nsSyncWeekFromDateFor("ns", force);
}
function nsEditSyncWeekFromDate(force) {
  nsSyncWeekFromDateFor("nsEdit", force);
}

// Render checkbox danh sách model vào 1 container (dùng chung cho #nsModels và #nsEditModels).
// checkedValues: mang gia tri can tick san; neu bo qua, giu nguyen lua chon dang co trong DOM
// (dung khi refresh form tao ma khong muon mat lua chon nguoi dung dang chon).
function renderModelCheckboxes(containerSelector, checkedValues) {
  const box = $(containerSelector);
  if (!box) return;
  const checked = checkedValues
    ? new Set(checkedValues)
    : new Set($$(`${containerSelector} input:checked`).map((cb) => cb.value));
  box.innerHTML = (state.models || []).map((m) => `
    <label class="ns-inline"><input type="checkbox" class="ns-model-cb" value="${m}" ${checked.has(m) ? "checked" : ""}> ${m}</label>`).join("")
    || `<span class="hint">Chưa có model nào trong hệ thống. Thêm ở tab Cài đặt.</span>`;
}

// Đổ danh sách Member (datalist) + checkbox model theo dữ liệu tham chiếu hiện tại.
function renderNewScriptForm() {
  const memberList = $("#nsMemberList");
  if (memberList) {
    memberList.innerHTML = (state.owners || []).map((o) => `<option value="${o.name}">`).join("");
  }
  renderModelCheckboxes("#nsModels");
}

function nsUpdateTcIdFeedback() {
  const raw = ($("#nsTcId")?.value || "").trim();
  const hint = $("#nsTcIdHint");
  const itemInput = $("#nsItem");
  if (!raw) { if (hint) hint.innerHTML = ""; if (itemInput) itemInput.value = ""; return; }
  const item = nsDeriveItem(raw);
  if (itemInput) itemInput.value = item || "";
  if (!hint) return;
  if (!item) {
    hint.innerHTML = `<span style="color:#e74c3c">⚠ Không nhận diện được Item — sai định dạng TC ID.</span>`;
    return;
  }
  // Cảnh báo trùng ngay (đối chiếu danh sách đã tải).
  const dup = (state.newScripts || []).some((s) => (s.tc_id || "").toLowerCase() === raw.toLowerCase());
  if (dup) {
    hint.innerHTML = `<span style="color:#e74c3c">⛔ TC ID này đã được nhập trước đó — không thể nhập trùng.</span>`;
  } else {
    hint.innerHTML = `<span style="color:#1e8449">✓ Item: <b>${item}</b></span>`;
  }
}

function nsUpdateStatusUIFor(prefix) {
  const status = nsSelectedStatusFor(prefix);
  const req = $(`#${prefix}RemarkReq`);
  if (req) req.style.display = status === "SKIP" ? "" : "none";
  const modelsWrap = $(`#${prefix}ModelsWrap`);
  if (modelsWrap) modelsWrap.style.opacity = status === "DONE" ? "1" : "0.5";
}
function nsUpdateStatusUI() {
  nsUpdateStatusUIFor("ns");
}
function nsEditUpdateStatusUI() {
  nsUpdateStatusUIFor("nsEdit");
}

function nsIsAdminOrMod() {
  return !!(state.me && (state.me.role === "admin" || state.me.role === "moderator"));
}

// Cross-field validate dung chung cho ca form tao va modal sua (DONE => bat buoc models,
// SKIP => bat buoc remark). Tra ve chuoi loi hoac null neu hop le.
function nsValidatePayload(payload) {
  if (!["DONE", "SKIP", "ASSIGNED"].includes(payload.status)) return "Vui lòng chọn Status (DONE, SKIP hoặc ASSIGNED).";
  if (payload.status === "DONE" && !payload.models_written.length) return "⚠️ Bắt buộc chọn ít nhất 1 model đã viết khi Status = DONE.";
  if (payload.status === "SKIP" && !payload.remark) return "Bắt buộc nhập Remark khi Status = SKIP.";
  return null;
}

// Hien/an cac phan chi danh cho nguoi co quyen assign (Status=Assigned, bulk-assign) hoac
// quyen sua dong da ghi nhan - goi lai moi khi state.me duoc lam moi (polling) de phan anh
// dung khi admin doi quyen.
function nsApplyExtraPerms() {
  const perms = (state.me && state.me.permissions) || [];
  const canAssign = perms.includes("ns-assign");
  const canEdit = perms.includes("ns-edit");
  const assignedWrap = $("#nsStatusAssignedWrap");
  if (assignedWrap) assignedWrap.style.display = canAssign ? "" : "none";
  const bulkCard = $("#nsBulkAssignCard");
  if (bulkCard) bulkCard.style.display = canAssign ? "" : "none";
  const editAssignedWrap = $("#nsEditStatusAssignedWrap");
  if (editAssignedWrap) editAssignedWrap.style.display = canAssign ? "" : "none";
  state.nsCanEdit = canEdit;
  if (!canAssign && nsSelectedStatus() === "ASSIGNED") {
    $$('input[name="nsStatus"]:checked').forEach((r) => r.checked = false);
    nsUpdateStatusUI();
  }
}

function nsClearForm() {
  ["#nsTcId", "#nsItem", "#nsMember", "#nsTeam", "#nsSdfId", "#nsWeek", "#nsRemark"].forEach((s) => { const el = $(s); if (el) el.value = ""; });
  $$("#nsModels input:checked").forEach((cb) => cb.checked = false);
  $$('input[name="nsStatus"]:checked').forEach((r) => r.checked = false);
  nsUpdateStatusUI();
  nsSyncWeekFromDate(true); // ngày vẫn giữ -> điền lại Week
  const hint = $("#nsTcIdHint"); if (hint) hint.innerHTML = "";
}

async function loadNewScripts() {
  state.newScripts = await api("/api/new-scripts");
  renderNewScriptsTable();
  nsUpdateTcIdFeedback(); // cập nhật lại cảnh báo trùng theo dữ liệu mới
}

function renderNewScriptsTable() {
  const rows = state.newScripts || [];
  const cnt = $("#nsCount"); if (cnt) cnt.textContent = rows.length;
  const tbody = $("#newScriptsTable tbody");
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="11" style="color:#999">Chưa ghi nhận script viết mới nào.</td></tr>`;
    return;
  }
  const statusTag = (s) => {
    if (s === "DONE") return `<span class="tag" style="background:#2ecc71">DONE</span>`;
    if (s === "ASSIGNED") return `<span class="tag" style="background:#3498db">ASSIGNED</span>`;
    return `<span class="tag" style="background:#95a5a6">SKIP</span>`;
  };
  const isAdminOrMod = nsIsAdminOrMod();
  const myUsername = state.me && state.me.username;
  const body = rows.map((r) => {
    const canEditRow = isAdminOrMod || state.nsCanEdit || (myUsername && r.member === myUsername);
    return `
    <tr>
      <td>${r.item || ""}</td>
      <td><b>${r.tc_id || ""}</b></td>
      <td>${r.member || '<span style="color:#bbb">—</span>'}</td>
      <td>${r.team ? `<span class="tag" style="background:#8e44ad">${r.team}</span>` : '<span style="color:#bbb">—</span>'}</td>
      <td>${r.assign_week ?? "—"}</td>
      <td>${r.completed_date || "—"}</td>
      <td>${statusTag(r.status)}</td>
      <td style="font-size:12px">${r.models_written || '<span style="color:#bbb">—</span>'}</td>
      <td style="font-size:12px">${r.sdf_id || '<span style="color:#bbb">—</span>'}</td>
      <td class="ns-remark-cell" title="${escAttr(r.remark || "")}">${r.remark || '<span style="color:#bbb">—</span>'}</td>
      <td>${canEditRow ? `<button class="btn-tiny rename" data-action="ns-edit" data-id="${r.id}">✏️ Sửa</button>` : ""}</td>
    </tr>`;
  }).join("");
  const nDone = rows.filter((r) => r.status === "DONE").length;
  const nAssigned = rows.filter((r) => r.status === "ASSIGNED").length;
  const nSkip = rows.filter((r) => r.status === "SKIP").length;
  const totalRow = `
    <tr class="total-row">
      <td colspan="6">Total: ${rows.length} script</td>
      <td>${nDone} DONE / ${nAssigned} ASSIGNED / ${nSkip} SKIP</td>
      <td colspan="4"></td>
    </tr>`;
  tbody.innerHTML = body + totalRow;
}

function initNewScripts() {
  const tcId = $("#nsTcId");
  tcId?.addEventListener("input", nsUpdateTcIdFeedback);

  $("#nsMember")?.addEventListener("input", () => {
    const name = ($("#nsMember").value || "").trim();
    const owner = (state.owners || []).find((o) => o.name === name);
    $("#nsTeam").value = owner && owner.team ? owner.team : "";
  });

  $("#nsDate")?.addEventListener("change", () => nsSyncWeekFromDate(true));

  $$('input[name="nsStatus"]').forEach((r) => r.addEventListener("change", nsUpdateStatusUI));
  nsUpdateStatusUI();
  nsApplyExtraPerms();

  $("#nsEditDate")?.addEventListener("change", () => nsEditSyncWeekFromDate(true));
  $$('input[name="nsEditStatus"]').forEach((r) => r.addEventListener("change", nsEditUpdateStatusUI));

  $("#btnClearNewScript")?.addEventListener("click", nsClearForm);
  $("#btnExportNewScripts")?.addEventListener("click", () => {
    window.location.href = "/api/export/excel/new-scripts";
  });

  $("#newScriptsTable")?.addEventListener("click", (e) => {
    const btn = e.target.closest('button[data-action="ns-edit"]');
    if (!btn) return;
    const row = (state.newScripts || []).find((s) => String(s.id) === btn.dataset.id);
    if (!row) return;
    state.nsEditingId = row.id;
    $("#nsEditTcId").textContent = row.tc_id || "";
    $("#nsEditItem").value = row.item || "";
    $("#nsEditMember").value = row.member || "";
    $("#nsEditTeam").value = row.team || "";
    $("#nsEditDate").value = row.completed_date || "";
    $("#nsEditWeek").value = row.assign_week ?? "";
    $("#nsEditSdfId").value = row.sdf_id || "";
    $("#nsEditRemark").value = row.remark || "";
    $$('input[name="nsEditStatus"]').forEach((r) => { r.checked = r.value === (row.status || "DONE"); });
    renderModelCheckboxes("#nsEditModels", (row.models_written || "").split(",").map((s) => s.trim()).filter(Boolean));
    nsEditUpdateStatusUI();
    // Member (reassign) chi sua duoc boi admin/moderator/ns-edit; self-edit (chi trung
    // member) chi duoc cap nhat ket qua/trang thai cua chinh minh, khong tu reassign di nguoi khac.
    const perms = (state.me && state.me.permissions) || [];
    const canReassign = nsIsAdminOrMod() || perms.includes("ns-edit");
    $("#nsEditMember").readOnly = !canReassign;
    $("#nsEditMsg").textContent = "";
    $("#nsEditModal").style.display = "flex";
  });

  $("#btnSaveNsEdit")?.addEventListener("click", async () => {
    const msg = $("#nsEditMsg");
    const sid = state.nsEditingId;
    if (!sid) return;
    const payload = {
      member: ($("#nsEditMember").value || "").trim(),
      status: nsSelectedStatusFor("nsEdit"),
      models_written: $$("#nsEditModels input:checked").map((cb) => cb.value),
      completed_date: $("#nsEditDate").value || "",
      assign_week: ($("#nsEditWeek").value || "").trim(),
      sdf_id: ($("#nsEditSdfId").value || "").trim(),
      remark: ($("#nsEditRemark").value || "").trim(),
    };
    const err = nsValidatePayload(payload);
    if (err) { msg.textContent = err; msg.className = "msg-err"; return; }
    try {
      await api(`/api/new-scripts/${sid}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      $("#nsEditModal").style.display = "none";
      await loadReferenceData();
      await loadNewScripts();
    } catch (e) {
      msg.textContent = "Lỗi: " + e.message;
      msg.className = "msg-err";
    }
  });

  $("#btnBulkAssign")?.addEventListener("click", async () => {
    const msg = $("#nsBulkAssignMsg");
    const errBox = $("#nsBulkAssignErrors");
    errBox.innerHTML = "";
    const text = $("#nsBulkAssignArea").value || "";
    const pairs = [];
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const [tc_id, member] = line.split("\t").map((p) => (p || "").trim());
      if (!tc_id) continue;
      pairs.push({ tc_id, member: member || "" });
    }
    if (!pairs.length) { msg.textContent = "Chưa có dòng nào để assign."; msg.className = "msg-err"; return; }
    try {
      const res = await api("/api/new-scripts/bulk-assign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pairs }) });
      msg.textContent = `✅ Đã assign ${res.inserted}/${pairs.length} dòng.` + (res.errors.length ? ` (${res.errors.length} dòng lỗi bên dưới)` : "");
      msg.className = "msg-ok";
      if (res.errors.length) {
        errBox.innerHTML = res.errors.map((e) => `<div style="color:#d32f2f">Dòng ${e.row_index + 1} (${e.tc_id || "?"}): ${e.error}</div>`).join("");
      }
      $("#nsBulkAssignArea").value = "";
      await loadReferenceData();
      await loadNewScripts();
    } catch (e) {
      msg.textContent = "Lỗi: " + e.message;
      msg.className = "msg-err";
    }
  });

  $("#btnSubmitNewScript")?.addEventListener("click", async () => {
    const msg = $("#nsMsg");
    const payload = {
      tc_id: ($("#nsTcId").value || "").trim(),
      member: ($("#nsMember").value || "").trim(),
      team: ($("#nsTeam").value || "").trim(),
      status: nsSelectedStatus(),
      models_written: $$("#nsModels input:checked").map((cb) => cb.value),
      completed_date: $("#nsDate").value || "",
      assign_week: ($("#nsWeek").value || "").trim(),
      sdf_id: ($("#nsSdfId").value || "").trim(),
      remark: ($("#nsRemark").value || "").trim(),
    };
    // Kiểm tra nhanh phía client trước khi gửi (server vẫn validate lại).
    if (!payload.tc_id) { msg.textContent = "Vui lòng nhập TC ID."; msg.className = "msg-err"; return; }
    if (!nsDeriveItem(payload.tc_id)) { msg.textContent = "TC ID sai định dạng — không nhận diện được Item."; msg.className = "msg-err"; return; }
    if ((state.newScripts || []).some((s) => (s.tc_id || "").toLowerCase() === payload.tc_id.toLowerCase())) {
      msg.textContent = "⛔ TC ID này đã được nhập trước đó — không thể nhập trùng."; msg.className = "msg-err"; return;
    }
    const err = nsValidatePayload(payload);
    if (err) {
      msg.textContent = err; msg.className = "msg-err";
      if (payload.status === "SKIP" && !payload.remark) $("#nsRemark").focus();
      return;
    }
    try {
      const res = await api("/api/new-scripts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      msg.textContent = `✅ Đã ghi nhận: ${res.item} / ${res.tc_id} (tuần ${res.assign_week ?? "—"}).`;
      msg.className = "msg-ok";
      nsClearForm();
      await loadReferenceData(); // member mới có thể vừa được thêm vào owners
      renderNewScriptForm();
      await loadNewScripts();
    } catch (e) {
      msg.textContent = "Lỗi: " + e.message;
      msg.className = "msg-err";
    }
  });
}

// ---------------- Fix Tracking ----------------
async function loadFixTracking() {
  state.fixTracking = await api("/api/fix-tracking");
  renderFixTracking();
}

function renderFixKpis() {
  const rows = state.fixTracking || [];
  const counts = { verified: 0, regressed: 0, still_failing: 0, pending: 0 };
  for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
  const box = $("#fixKpiRow");
  if (!box) return;
  box.innerHTML =
    kpiCard("Tổng lần fix", rows.length) +
    kpiCard("✅ Đã hết lỗi", counts.verified, counts.verified ? "good" : "") +
    kpiCard("⚠️ Hết rồi fail lại", counts.regressed, counts.regressed ? "warn" : "") +
    kpiCard("❌ Chưa hết lỗi", counts.still_failing, counts.still_failing ? "bad" : "") +
    kpiCard("⏳ Chờ dữ liệu", counts.pending);
}

function renderFixTracking() {
  renderFixKpis();
  const tbody = $("#fixTrackingTable tbody");
  if (!tbody) return;
  const q = ($("#fixTrackSearch")?.value || "").toLowerCase();
  const statusFilter = $("#fixStatusFilter")?.value || "";
  const rows = (state.fixTracking || []).filter((r) => {
    const matchQ = !q || r.owner.toLowerCase().includes(q) ||
      r.test_case.toLowerCase().includes(q) || r.test_suite.toLowerCase().includes(q) ||
      (r.model_fixed || "").toLowerCase().includes(q) ||
      (r.root_cause || "").toLowerCase().includes(q) ||
      (r.team || "").toLowerCase().includes(q);
    const matchS = !statusFilter || r.status === statusFilter;
    return matchQ && matchS;
  });
  tbody.innerHTML = rows.map((r) => {
    const st = FIX_STATUS_STYLE[r.status] || { label: r.status, color: "#999" };
    return `
    <tr>
      <td><span class="tag" style="background:${st.color}">${st.label}</span></td>
      <td>${r.owner}</td>
      <td>${r.team || '<span style="color:#bbb">—</span>'}</td>
      <td>${r.test_suite}</td>
      <td>${r.test_case}</td>
      <td>${r.model_fixed}</td>
      <td style="max-width:220px; word-break:break-word; font-size:11px; color:#444">${r.root_cause || '<span style="color:#bbb">—</span>'}</td>
      <td>${r.fixed_after_cycle}</td>
      <td>${r.next_cycle_after_fix ?? "—"}</td>
      <td>${r.runs_after}</td>
      <td>${r.fails_after > 0 ? `<b style="color:#e74c3c">${r.fails_after}</b>` : r.fails_after}</td>
      <td>${r.fix_date}</td>
      <td style="max-width:200px; word-break:break-word; font-size:11px; color:#666">${r.note || "—"}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="13" style="color:#999">Chưa có lần fix nào khớp.</td></tr>`;
}

function initFixTracking() {
  $("#fixTrackSearch")?.addEventListener("input", renderFixTracking);
  $("#fixStatusFilter")?.addEventListener("change", renderFixTracking);
}

// ---------------- Priority table ----------------
async function loadPriority() {
  state.priority = await api("/api/priority");
}

function renderPriorityTableHead() {
  const baseCols = [
    ["rank", "#", "Thứ hạng theo điểm ưu tiên"],
    ["test_suite", "Test suite", "Item / test suite chứa script này"],
    ["test_case", "Test Case", "Tên test case / script"],
    ["priority_tier", "Tier", "P0-P3 = còn lỗi (mức độ ưu tiên); Verify = hết lỗi nhưng chưa đủ cycle xác nhận; Done = đã xác nhận ổn định"],
    ["is_flaky", "Flaky", "Script đổi kết quả pass/fail nhiều lần trong các cycle gần nhất"],
    ["reopen_count", "Reopen", "Số lần script đã fix xong nhưng fail lại (toàn bộ lịch sử)"],
    ["priority_score", "Điểm ưu tiên", "fail_count × số model fail — điểm càng cao càng cần ưu tiên fix"],
    ["fail_count", "Tổng Fail", "Tổng số lượt fail qua tất cả cycle và model"],
    ["fail_model_breadth", "Số model fail", "Số model khác nhau từng fail script này"],
    ["current_owner", "Đang phụ trách", "Người đang được gán xử lý script này"],
    ["team", "Team", "Team của người đang phụ trách"],
    ["pass_count", "Pass hiện tại", "Số model đang pass ở trạng thái mới nhất"],
    ["not_run_count", "NotRun", "Số model chưa từng chạy script này"],
    ["last_updated_cycle", "Cycle cuối", "Cycle gần nhất có kết quả cho script này"],
  ];
  const allCols = [...baseCols, ...state.models.map((m) => [`model_${m}`, m, `Kết quả lần chạy mới nhất trên model ${m}`])];

  let headRow = "<tr>";
  for (const [key, label, tooltip] of allCols) headRow += `<th data-key="${key}"${tooltip ? ` title="${tooltip}"` : ""}>${label}</th>`;
  headRow += `<th>Hành động</th></tr>`;

  // Hang filter rieng cho tung cot - go text vao o duoi ten cot de loc.
  let filterRow = `<tr class="filter-row">`;
  for (const [key] of allCols) {
    filterRow += `<th><input type="text" class="col-filter" data-key="${key}" placeholder="Lọc..."></th>`;
  }
  filterRow += `<th></th></tr>`;

  $("#priorityTableHead").innerHTML = headRow + filterRow;

  $$("#priorityTableHead th[data-key]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.key;
      if (state.prioritySort.key === key) state.prioritySort.dir *= -1;
      else state.prioritySort = { key, dir: 1 };
      state.priorityPage = 1;
      renderPriorityTable();
    });
  });

  $$("#priorityTableHead .col-filter").forEach((inp) => {
    inp.value = state.priorityColumnFilters[inp.dataset.key] || "";
    inp.addEventListener("click", (e) => e.stopPropagation());
    inp.addEventListener("input", () => {
      state.priorityColumnFilters[inp.dataset.key] = inp.value;
      state.priorityPage = 1;
      renderPriorityTable();
    });
  });
}

function modelBadge(result) {
  if (result === "Pass") return `<span class="tag" style="background:#2ecc71">Pass</span>`;
  if (result === "Fail") return `<span class="tag" style="background:#e74c3c">Fail</span>`;
  return `<span class="tag" style="background:#bbb">—</span>`;
}

function priorityCellValue(r, key) {
  if (key.startsWith("model_")) return r.model_detail[key.slice(6)] || "—";
  if (key === "current_owner") return r.current_owner || "(chưa gán)";
  if (key === "is_flaky") return r.is_flaky ? "Flaky" : "";
  return r[key];
}

function renderPriorityTable() {
  const search = $("#prioSearch").value.toLowerCase();
  const tierFilter = $("#prioTierFilter").value;
  const colFilters = state.priorityColumnFilters || {};
  let rows = state.priority.filter((r) => {
    const matchSearch = !search || r.test_suite.toLowerCase().includes(search) || r.test_case.toLowerCase().includes(search);
    const matchTier = !tierFilter || r.priority_tier === tierFilter;
    if (!matchSearch || !matchTier) return false;
    for (const [key, val] of Object.entries(colFilters)) {
      if (!val) continue;
      const cellVal = priorityCellValue(r, key);
      if (!String(cellVal ?? "").toLowerCase().includes(val.toLowerCase())) return false;
    }
    return true;
  });
  const { key, dir } = state.prioritySort;
  rows = rows.slice().sort((a, b) => {
    let av = key.startsWith("model_") ? (a.model_detail[key.slice(6)] || "") : a[key];
    let bv = key.startsWith("model_") ? (b.model_detail[key.slice(6)] || "") : b[key];
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
  const ncols = 14 + state.models.length + 1;
  // Phan trang phia client: chi render dong cua trang hien tai (giam so node DOM -> chua lag).
  // Loc + sort van tren TOAN BO state.priority o tren; chi cat-lat de hien thi.
  const info = ttPageInfo("priorityTable", rows.length, state.priorityPage);
  state.priorityPage = info.page;
  const pageRows = rows.slice(info.start, info.end);
  const prioTable = $("#priorityTable");
  ttBuildPagerBar(ttEnsurePager(prioTable), "priorityTable", info,
    (p) => { state.priorityPage = p; renderPriorityTable(); },
    () => { state.priorityPage = 1; renderPriorityTable(); });
  $("#priorityTable tbody").innerHTML = pageRows.map((r) => {
    let modelCells = state.models.map((m) => `<td>${modelBadge(r.model_detail[m])}</td>`).join("");
    return `
    <tr>
      <td><b>${r.rank}</b></td>
      <td>${r.test_suite}</td>
      <td>${r.test_case}</td>
      <td><span class="tag tag-${r.priority_tier}">${r.priority_tier}</span></td>
      <td>${r.is_flaky ? `<span class="tag tag-flaky" title="Đổi pass/fail ${r.flip_count} lần trong cửa sổ cycle gần nhất">🌀 Flaky</span>` : '<span style="color:#bbb">—</span>'}</td>
      <td>${r.reopen_count > 0 ? `<b style="color:#e67e22">${r.reopen_count}</b>` : (r.reopen_count ?? 0)}</td>
      <td><b style="color:#c0392b">${r.priority_score}</b></td>
      <td>${r.fail_count}</td>
      <td>${r.fail_model_breadth}</td>
      <td>${r.current_owner || '<span style="color:#bbb">(chưa gán)</span>'}</td>
      <td>${r.team ? `<span class="tag" style="background:#8e44ad">${r.team}</span>` : '<span style="color:#bbb">—</span>'}</td>
      <td>${r.pass_count}</td>
      <td>${r.not_run_count}</td>
      <td>${r.last_updated_cycle ?? "—"}</td>
      ${modelCells}
      <td>
        <button class="btn-tiny rename" data-action="assign" data-suite="${r.test_suite}" data-case="${r.test_case}" data-owner="${r.current_owner || ""}">Gán người</button>
        ${r.fail_count > 0 ? `<button class="btn-tiny btn-fail-details" style="background:#e74c3c" data-suite="${r.test_suite}" data-case="${r.test_case}">🔍 ${r.fail_count} Fail</button>` : ""}
      </td>
    </tr>
  `;
  }).join("") || `<tr><td colspan="${ncols}" style="color:#999">Không có script nào khớp.</td></tr>`;
}

async function handleAssign(suite, testCase, currentOwner) {
  const name = prompt(`Gán "${suite} / ${testCase}" cho ai phụ trách?`, currentOwner || "");
  if (name === null) return;
  try {
    await api("/api/assignments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ test_suite: suite, test_case: testCase, owner: name.trim() }),
    });
    await loadReferenceData();
    await loadPriority();
    renderPriorityTable();
  } catch (e) {
    alert("Lỗi: " + e.message);
  }
}

function escAttr(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function showFailDetails(suite, testCase) {
  try {
    const fails = await api(`/api/script-fail-details/${encodeURIComponent(suite)}/${encodeURIComponent(testCase)}`);
    let html = `<table style="width:100%; border-collapse:collapse; font-size:13px;">
      <thead><tr style="background:#f5f5f5;">
        <th style="border:1px solid #ddd; padding:10px; text-align:left;">Cycle</th>
        <th style="border:1px solid #ddd; padding:10px; text-align:left;">Test ID</th>
        <th style="border:1px solid #ddd; padding:10px; text-align:left;">Model</th>
        <th style="border:1px solid #ddd; padding:10px; text-align:left;">State</th>
        <th style="border:1px solid #ddd; padding:10px; text-align:left;">Description</th>
      </tr></thead>
      <tbody>`;
    for (const f of fails) {
      html += `<tr style="border-bottom:1px solid #eee;">
        <td style="border:1px solid #ddd; padding:10px;">${f.cycle}</td>
        <td style="border:1px solid #ddd; padding:10px; font-family:monospace; color:#2196F3; font-weight:bold; cursor:pointer; user-select:all;" title="Click to copy" onclick="navigator.clipboard.writeText('${f.test_id}'); this.style.background='#d4edda'; setTimeout(() => this.style.background='', 500);">${f.test_id}</td>
        <td style="border:1px solid #ddd; padding:10px;">${f.model}</td>
        <td style="border:1px solid #ddd; padding:10px;"><span style="color:#fff; background:#e74c3c; padding:4px 8px; border-radius:3px; font-weight:bold;">${f.state}</span></td>
        <td style="border:1px solid #ddd; padding:10px; max-width:350px; word-break:break-word; font-size:12px; color:#555; cursor:help;" title="${escAttr(f.description || "")}">${escAttr((f.description || "—").length > 200 ? (f.description || "").slice(0, 200) + "…" : (f.description || "—"))}</td>
      </tr>`;
    }
    html += `</tbody></table>
      <p style="margin-top:15px; padding:10px; background:#e3f2fd; border-radius:4px; font-size:12px; color:#555; border-left:3px solid #2196F3;">
        💡 <strong>Tip:</strong> Click trên Test ID để copy. Dùng khi kiểm tra chi tiết trên hệ thống test farm.
      </p>`;

    $("#failDetailsTitle").textContent = suite + " / " + testCase + " — " + fails.length + " lần Fail";
    $("#failDetailsContent").innerHTML = html;
    $("#failDetailsModal").style.display = "flex";
  } catch (e) {
    alert("Lỗi tải chi tiết: " + e.message);
  }
}

// ---------------- Cycle comparison (pass rate per script per cycle) ----------------
async function loadCycleMatrix() {
  const byModel = $("#cycmByModel")?.checked || false;
  state.cycleMatrix = await api("/api/script-cycle-matrix" + (byModel ? "?by_model=1" : ""));
  state.cycleMatrix.groupByModel = byModel;

  const modelSel = $("#cycmModelFilter");
  if (modelSel) {
    modelSel.style.display = byModel ? "" : "none";
    if (byModel && !modelSel.dataset.filled) {
      modelSel.innerHTML = `<option value="">Tất cả model</option>` +
        state.models.map((m) => `<option value="${m}">${m}</option>`).join("");
      modelSel.dataset.filled = "1";
    }
  }
  if ($("#cycmModeHint")) {
    $("#cycmModeHint").textContent = byModel ? ", tách riêng theo từng model" : ", gộp mọi model đã chạy";
  }

  renderCycleMatrixHead();
  renderCycleMatrix();
}

function renderCycleMatrixHead() {
  const cycles = state.cycleMatrix.cycles || [];
  const byModel = state.cycleMatrix.groupByModel;
  let headRow = `<tr><th title="Item / test suite chứa script này">Test suite</th><th title="Tên test case / script">Test Case</th>` +
    `${byModel ? `<th title="Model điện thoại">Model</th>` : ""}` +
    `<th title="Người đang được gán xử lý script này">Đang phụ trách</th><th title="Team của người đang phụ trách">Team</th>` +
    `<th title="P0-P3 = còn lỗi; Verify = hết lỗi nhưng chưa đủ cycle xác nhận; Done = ổn định">Tier</th>`;
  for (const c of cycles) {
    headRow += `<th title="Kết quả (verdict) lần chạy cuối trong cycle này">Cycle ${c.cycle}<br><span style="font-weight:400;font-size:11px;color:#888">${c.cycle_date || ""}</span></th>`;
  }
  headRow += `<th title="Xu hướng pass rate qua các cycle đã chọn">Xu hướng</th></tr>`;
  $("#cycleMatrixHead").innerHTML = headRow;
}

function cycleCellHtml(cell) {
  if (!cell) return `<td class="cyc-cell cyc-none" data-sortval="-1" title="Script không chạy ở cycle này">—</td>`;
  const { pass_rate, fail_count, total, na_count, verdict } = cell;
  let cls = "cyc-none";
  let mainText = "—";
  let sv = -1;
  if (pass_rate !== null && pass_rate !== undefined) {
    mainText = (pass_rate * 100).toFixed(0) + "%";
    sv = pass_rate;
    if (pass_rate === 1) cls = "cyc-pass";
    else if (pass_rate === 0) cls = "cyc-fail";
    else cls = "cyc-mixed";
  }
  let arrow = "";
  if (verdict === "improved") arrow = ` <span style="color:#1e8449">▲</span>`;
  else if (verdict === "regressed") arrow = ` <span style="color:#c0392b">▼</span>`;
  else if (verdict === "unchanged") arrow = ` <span style="color:#888">=</span>`;
  const detail = `${fail_count}F / ${total}T${na_count ? " / " + na_count + "NA" : ""}`;
  return `<td class="cyc-cell ${cls}" data-sortval="${sv}" title="${detail}"><b>${mainText}</b>${arrow}<br><span class="cyc-detail">${detail}</span></td>`;
}

function renderCycleMatrix() {
  const cycles = state.cycleMatrix.cycles || [];
  const byModel = state.cycleMatrix.groupByModel;
  const search = ($("#cycmSearch")?.value || "").toLowerCase();
  const tierFilter = $("#cycmTierFilter")?.value || "";
  const trendFilter = $("#cycmTrendFilter")?.value || "";
  const modelFilter = byModel ? ($("#cycmModelFilter")?.value || "") : "";
  const rows = (state.cycleMatrix.scripts || []).filter((s) => {
    const matchSearch = !search || s.test_suite.toLowerCase().includes(search) ||
      s.test_case.toLowerCase().includes(search) || (s.current_owner || "").toLowerCase().includes(search);
    const matchTier = !tierFilter || s.priority_tier === tierFilter;
    const matchTrend = !trendFilter || s.overall_trend === trendFilter;
    const matchModel = !modelFilter || s.model === modelFilter;
    return matchSearch && matchTier && matchTrend && matchModel;
  });
  const ncols = 5 + (byModel ? 1 : 0) + cycles.length + 1;
  $("#cycleMatrixTable tbody").innerHTML = rows.map((s) => {
    const cycleCells = cycles.map((c) => cycleCellHtml(s.by_cycle[c.cycle])).join("");
    const badge = TREND_BADGE[s.overall_trend] || { label: s.overall_trend, bg: "#999" };
    return `<tr>
      <td>${s.test_suite}</td>
      <td>${s.test_case}</td>
      ${byModel ? `<td><span class="tag" style="background:#3498db">${s.model}</span></td>` : ""}
      <td>${s.current_owner || '<span style="color:#bbb">(chưa gán)</span>'}</td>
      <td>${s.team ? `<span class="tag" style="background:#8e44ad">${s.team}</span>` : '<span style="color:#bbb">—</span>'}</td>
      <td><span class="tag tag-${s.priority_tier || "Done"}">${s.priority_tier || "—"}</span></td>
      ${cycleCells}
      <td><span class="tag" style="background:${badge.bg}">${badge.label}</span></td>
    </tr>`;
  }).join("") || `<tr><td colspan="${ncols}" style="color:#999">Không có script nào khớp.</td></tr>`;
}

function initCycleMatrix() {
  $("#cycmSearch")?.addEventListener("input", renderCycleMatrix);
  $("#cycmTierFilter")?.addEventListener("change", renderCycleMatrix);
  $("#cycmTrendFilter")?.addEventListener("change", renderCycleMatrix);
  $("#cycmModelFilter")?.addEventListener("change", renderCycleMatrix);
  $("#cycmByModel")?.addEventListener("change", loadCycleMatrix);
}

function initPriorityTable() {
  renderPriorityTableHead();
  $("#prioSearch").addEventListener("input", () => { state.priorityPage = 1; renderPriorityTable(); });
  $("#prioTierFilter").addEventListener("change", () => { state.priorityPage = 1; renderPriorityTable(); });
  $("#priorityTable").addEventListener("click", (e) => {
    const assignBtn = e.target.closest('button[data-action="assign"]');
    if (assignBtn) {
      handleAssign(assignBtn.dataset.suite, assignBtn.dataset.case, assignBtn.dataset.owner);
      return;
    }

    const failBtn = e.target.closest('button.btn-fail-details');
    if (failBtn) {
      showFailDetails(failBtn.dataset.suite, failBtn.dataset.case);
      return;
    }
  });
  $("#btnExportExcel").addEventListener("click", () => window.location.href = "/api/export/excel");
  $("#btnExportCsvResults").addEventListener("click", () => window.location.href = "/api/export/csv/results");
  $("#btnExportCsvFixes").addEventListener("click", () => window.location.href = "/api/export/csv/fixes");
}

// ---------------- Settings & Master Lists ----------------
async function loadLists() {
  const lists = await api("/api/lists");
  state.rootCauseGroups = lists.root_cause_groups || [];
  renderSuiteList(lists.test_suites_detail || (lists.test_suites || []).map((n) => ({ name: n, script_path: "" })));
  renderModelList(lists.models);
  renderOwnerList(lists.owners);
  renderGroupList(state.rootCauseGroups);
  reapplyAllTableFilters();
}

function renderGroupList(groups) {
  const tbody = $("#groupListTable tbody");
  if (!tbody) return;
  if (!groups.length) {
    tbody.innerHTML = `<tr><td colspan="2" style="color:#999">Chưa có nhóm nào.</td></tr>`;
    return;
  }
  tbody.innerHTML = groups.map((g) => `
    <tr>
      <td>${escAttr(g)}</td>
      <td>
        <button class="btn-tiny rename" data-action="rename-group" data-name="${escAttr(g)}">Đổi tên</button>
        <button class="btn-tiny danger" data-action="delete-group" data-name="${escAttr(g)}">Xoá</button>
      </td>
    </tr>
  `).join("");
}

function renderSuiteList(suites) {
  const tbody = $("#suiteListTable tbody");
  if (!suites.length) {
    tbody.innerHTML = `<tr><td colspan="3" style="color:#999">Chưa có test suite nào.</td></tr>`;
    return;
  }
  tbody.innerHTML = suites.map((s) => `
    <tr>
      <td>${s.name}</td>
      <td>${s.script_path ? `<code>${escAttr(s.script_path)}</code>` : '<span style="color:#bbb">(toàn repo)</span>'}</td>
      <td>
        <button class="btn-tiny rename" data-action="set-suite-path" data-name="${s.name}" data-path="${escAttr(s.script_path || "")}">Đổi đường dẫn</button>
        <button class="btn-tiny rename" data-action="rename-suite" data-name="${s.name}">Đổi tên</button>
        <button class="btn-tiny danger" data-action="delete-suite" data-name="${s.name}">Xoá</button>
      </td>
    </tr>
  `).join("");
}

function renderModelList(models) {
  const tbody = $("#modelListTable tbody");
  if (!models.length) {
    tbody.innerHTML = `<tr><td colspan="2" style="color:#999">Chưa có model nào.</td></tr>`;
    return;
  }
  tbody.innerHTML = models.map((m) => `
    <tr>
      <td>${m}</td>
      <td>
        <button class="btn-tiny rename" data-action="rename-model" data-name="${m}">Đổi tên</button>
        <button class="btn-tiny danger" data-action="delete-model" data-name="${m}">Xoá</button>
      </td>
    </tr>
  `).join("");
}

function renderOwnerList(owners) {
  const tbody = $("#ownerListTable tbody");
  if (!owners.length) {
    tbody.innerHTML = `<tr><td colspan="3" style="color:#999">Chưa có owner nào.</td></tr>`;
    return;
  }
  tbody.innerHTML = owners.map((o) => `
    <tr>
      <td>${o.name}${o.active ? "" : ' <span style="color:#999">(đã ngừng hoạt động)</span>'}</td>
      <td>${o.team ? `<span class="tag" style="background:#8e44ad">${o.team}</span>` : '<span style="color:#bbb">(chưa có)</span>'}</td>
      <td>
        <button class="btn-tiny rename" data-action="set-team" data-name="${o.name}" data-team="${o.team || ""}">Đổi Team</button>
        <button class="btn-tiny rename" data-action="rename-owner" data-name="${o.name}">Đổi tên</button>
        ${o.active ? `<button class="btn-tiny danger" data-action="deactivate-owner" data-name="${o.name}">Ngừng hoạt động</button>` : ""}
      </td>
    </tr>
  `).join("");
}

async function handleListAction(action, name, extra) {
  try {
    if (action === "set-team") {
      const nt = prompt(`Đặt Team cho "${name}" (nhóm nhỏ, VD tên team-lead). Để trống = xoá team:`, extra || "");
      if (nt === null) return;
      await api(`/api/lists/owners/${encodeURIComponent(name)}/team`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ team: nt.trim() }) });
    } else if (action === "set-suite-path") {
      const np = prompt(`Đường dẫn thư mục script của Item "${name}" trên repo GitHub (nhánh main).\nVD: Internet/scripts — để trống = tìm file trên toàn repo:`, extra || "");
      if (np === null) return;
      await api(`/api/lists/test_suites/${encodeURIComponent(name)}/path`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ script_path: np.trim() }) });
    } else if (action === "rename-suite") {
      const nn = prompt(`Đổi tên test suite "${name}" thành:`, name);
      if (!nn || nn === name) return;
      await api(`/api/lists/test_suites/${encodeURIComponent(name)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ new_name: nn }) });
    } else if (action === "delete-suite") {
      if (!confirm(`Xoá test suite "${name}"? (chỉ xoá được nếu chưa có kết quả nào dùng tên này)`)) return;
      await api(`/api/lists/test_suites/${encodeURIComponent(name)}`, { method: "DELETE" });
    } else if (action === "rename-model") {
      const nn = prompt(`Đổi tên model "${name}" thành (VD: model mới thay thế):`, name);
      if (!nn || nn === name) return;
      await api(`/api/lists/models/${encodeURIComponent(name)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ new_name: nn }) });
    } else if (action === "delete-model") {
      if (!confirm(`Xoá model "${name}"? (chỉ xoá được nếu chưa có kết quả nào dùng model này)`)) return;
      await api(`/api/lists/models/${encodeURIComponent(name)}`, { method: "DELETE" });
    } else if (action === "rename-owner") {
      const nn = prompt(`Đổi tên owner "${name}" thành (lịch sử fix sẽ tự chuyển sang tên mới):`, name);
      if (!nn || nn === name) return;
      await api(`/api/lists/owners/${encodeURIComponent(name)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ new_name: nn }) });
    } else if (action === "deactivate-owner") {
      if (!confirm(`Đánh dấu "${name}" ngừng hoạt động? (vẫn giữ lịch sử fix, chỉ ẩn khỏi danh sách chọn)`)) return;
      await api(`/api/lists/owners/${encodeURIComponent(name)}`, { method: "DELETE" });
    } else if (action === "rename-group") {
      const nn = prompt(`Đổi tên nhóm nguyên nhân "${name}" thành (toàn bộ fix log cũ sẽ tự chuyển sang tên mới):`, name);
      if (!nn || nn.trim() === name) return;
      await api(`/api/lists/root_cause_groups/${encodeURIComponent(name)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ new_name: nn.trim() }) });
    } else if (action === "delete-group") {
      if (!confirm(`Xoá nhóm nguyên nhân "${name}"? (chỉ xoá được nếu chưa có fix nào dùng nhóm này)`)) return;
      await api(`/api/lists/root_cause_groups/${encodeURIComponent(name)}`, { method: "DELETE" });
    }
    await loadLists();
    await loadReferenceData();
    await refreshDashboard();
  } catch (e) {
    alert("Lỗi: " + e.message);
  }
}

function initListsManagement() {
  $("#btnAddSuite").addEventListener("click", async () => {
    const name = $("#newSuiteName").value.trim();
    const msg = $("#suiteListMsg");
    if (!name) { msg.textContent = "Nhập tên test suite."; return; }
    try {
      await api("/api/lists/test_suites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      $("#newSuiteName").value = "";
      msg.textContent = "";
      await loadLists();
    } catch (e) { msg.textContent = "Lỗi: " + e.message; }
  });

  $("#btnAddModel").addEventListener("click", async () => {
    const name = $("#newModelName").value.trim();
    const msg = $("#modelListMsg");
    if (!name) { msg.textContent = "Nhập tên model."; return; }
    try {
      await api("/api/lists/models", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      $("#newModelName").value = "";
      msg.textContent = "";
      await loadLists();
      await loadReferenceData();
    } catch (e) { msg.textContent = "Lỗi: " + e.message; }
  });

  $("#btnAddGroup").addEventListener("click", async () => {
    const name = $("#newGroupName").value.trim();
    const msg = $("#groupListMsg");
    if (!name) { msg.textContent = "Nhập tên nhóm."; return; }
    try {
      await api("/api/lists/root_cause_groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      $("#newGroupName").value = "";
      msg.textContent = "";
      await loadLists();
    } catch (e) { msg.textContent = "Lỗi: " + e.message; }
  });

  $("#btnAddOwner").addEventListener("click", async () => {
    const name = $("#newOwnerName").value.trim();
    const team = $("#newOwnerTeam").value.trim();
    const msg = $("#ownerListMsg");
    if (!name) { msg.textContent = "Nhập tên owner."; return; }
    try {
      await api("/api/lists/owners", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, team }) });
      $("#newOwnerName").value = "";
      $("#newOwnerTeam").value = "";
      msg.textContent = "";
      await loadLists();
      await loadReferenceData();
    } catch (e) { msg.textContent = "Lỗi: " + e.message; }
  });

  document.body.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    handleListAction(btn.dataset.action, btn.dataset.name, btn.dataset.team ?? btn.dataset.path);
  });
}

async function initHandover() {
  const owners = await api("/api/owners");
  $("#handoverFrom").innerHTML = owners.map((o) => `<option value="${o.name}">${o.name}</option>`).join("");

  $("#btnHandover").addEventListener("click", async () => {
    const fromOwner = $("#handoverFrom").value;
    const toOwner = $("#handoverTo").value.trim();
    const msg = $("#handoverMsg");
    if (!fromOwner || !toOwner) {
      msg.textContent = "Chọn người cũ và nhập tên người mới.";
      msg.className = "msg-err";
      return;
    }
    if (!confirm(`Chuyển giao toàn bộ script đang còn lỗi của "${fromOwner}" sang "${toOwner}"?\n\nLịch sử fix đã ghi nhận trước đó của "${fromOwner}" sẽ KHÔNG bị thay đổi.`)) return;
    try {
      const res = await api("/api/handover", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from_owner: fromOwner, to_owner: toOwner, only_open: true }),
      });
      msg.textContent = `Đã chuyển giao ${res.reassigned_count} script sang "${toOwner}".`;
      msg.className = "msg-ok";
      $("#handoverTo").value = "";
      await loadReferenceData();
      await loadPriority();
      await refreshDashboard();
      if ($("#tab-priority").classList.contains("active")) renderPriorityTable();
    } catch (e) {
      msg.textContent = "Lỗi: " + e.message;
      msg.className = "msg-err";
    }
  });
}

async function initSettings() {
  const s = await api("/api/settings");
  $("#sTarget").value = Math.round(parseFloat(s.target_pass_rate || 0.88) * 100);
  $("#sDeadline").value = s.deadline_date || "";

  $("#btnSaveSettings").addEventListener("click", async () => {
    const payload = {
      target_pass_rate: (parseFloat($("#sTarget").value) / 100).toString(),
      deadline_date: $("#sDeadline").value,
    };
    const msg = $("#settingsMsg");
    try {
      await api("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      msg.textContent = "Đã lưu cài đặt.";
      msg.className = "msg-ok";
      await refreshDashboard();
    } catch (e) {
      msg.textContent = "Lỗi: " + e.message;
      msg.className = "msg-err";
    }
  });

  // ----- Tiêu chí & KPI (exit criteria / flaky / loại script mới) -----
  if ($("#sExitCriteria")) {
    $("#sExitCriteria").value = s.exit_criteria_cycles || "2";
    $("#sFlakyWindow").value = s.flaky_window || "5";
    $("#sFlakyFlips").value = s.flaky_min_flips || "2";
    $("#sExcludeNew").value = s.exclude_new_scripts_cycles || "0";
    $("#btnSaveCriteria")?.addEventListener("click", async () => {
      const msg = $("#criteriaMsg");
      try {
        await api("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          exit_criteria_cycles: $("#sExitCriteria").value || "2",
          flaky_window: $("#sFlakyWindow").value || "5",
          flaky_min_flips: $("#sFlakyFlips").value || "2",
          exclude_new_scripts_cycles: $("#sExcludeNew").value || "0",
        }) });
        msg.textContent = "Đã lưu — Dashboard/Bảng ưu tiên sẽ tính lại theo tiêu chí mới.";
        msg.className = "msg-ok";
        await loadPriority();
        renderPriorityTable();
        await refreshDashboard();
      } catch (e) { msg.textContent = "Lỗi: " + e.message; msg.className = "msg-err"; }
    });
  }

  // ----- Tích hợp & API (token đã set hiển thị ******** — giữ nguyên = không đổi) -----
  if ($("#sFarmUrl")) {
    $("#sFarmUrl").value = s.farm_api_url || "";
    $("#sFarmToken").value = s.farm_api_token || "";
    $("#sCompanyUrl").value = s.company_api_url || "";
    $("#sCompanyToken").value = s.company_api_token || "";
    $("#sGithubRepo").value = s.github_repo || "";
    $("#sGithubBranch").value = s.github_branch || "main";
    $("#sGithubToken").value = s.github_token || "";
    $("#sGithubApiBase").value = s.github_api_base || "https://api.github.com";
    $("#sImportToken").value = s.import_token || "";
    $("#btnSaveIntegrations")?.addEventListener("click", async () => {
      const msg = $("#integrationsMsg");
      try {
        await api("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          farm_api_url: $("#sFarmUrl").value.trim(),
          farm_api_token: $("#sFarmToken").value.trim(),
          company_api_url: $("#sCompanyUrl").value.trim(),
          company_api_token: $("#sCompanyToken").value.trim(),
          github_repo: $("#sGithubRepo").value.trim(),
          github_branch: $("#sGithubBranch").value.trim() || "main",
          github_token: $("#sGithubToken").value.trim(),
          github_api_base: $("#sGithubApiBase").value.trim() || "https://api.github.com",
          import_token: $("#sImportToken").value.trim(),
        }) });
        msg.textContent = "Đã lưu cấu hình tích hợp.";
        msg.className = "msg-ok";
      } catch (e) { msg.textContent = "Lỗi: " + e.message; msg.className = "msg-err"; }
    });
  }

  // ----- Backup -----
  if ($("#sBackupEnabled")) {
    $("#sBackupEnabled").value = (s.backup_enabled || "1") === "0" ? "0" : "1";
    $("#sBackupRetention").value = s.backup_retention || "30";
    loadBackupStatus();
    $("#btnSaveBackupCfg")?.addEventListener("click", async () => {
      const msg = $("#backupMsg");
      try {
        await api("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          backup_enabled: $("#sBackupEnabled").value,
          backup_retention: $("#sBackupRetention").value || "30",
        }) });
        msg.textContent = "Đã lưu cấu hình backup.";
        msg.className = "msg-ok";
        loadBackupStatus();
      } catch (e) { msg.textContent = "Lỗi: " + e.message; msg.className = "msg-err"; }
    });
    $("#btnBackupNow")?.addEventListener("click", async () => {
      const msg = $("#backupMsg");
      msg.textContent = "Đang backup..."; msg.className = "";
      try {
        const res = await api("/api/backup/run", { method: "POST" });
        msg.textContent = `✅ Đã backup vào ${res.backup_dir} (${(res.files || []).length} file).`;
        msg.className = "msg-ok";
        loadBackupStatus();
      } catch (e) { msg.textContent = "Lỗi: " + e.message; msg.className = "msg-err"; }
    });
  }

  initListsManagement();
  await loadLists();
  await initHandover();
}

async function loadBackupStatus() {
  const box = $("#backupStatusBox");
  if (!box) return;
  try {
    const st = await api("/api/backup/status");
    const n = (st.backups || []).length;
    const latest = n ? st.backups[0].dir : "—";
    box.innerHTML = `Trạng thái: <b>${st.enabled ? "🟢 Bật" : "🔴 Tắt"}</b> · Backup gần nhất: <b>${st.last_backup_date || "chưa có"}</b> · Đang giữ <b>${n}</b> bản (mới nhất: ${latest}) · Giữ tối đa ${st.retention} bản.`;
  } catch (e) {
    box.textContent = "Không tải được trạng thái backup: " + e.message;
  }
}

// ---------------- Reports (📤 Báo cáo) ----------------
function initReports() {
  const typeSel = $("#rpType");
  if (!typeSel) return;
  if ($("#rpDate") && !$("#rpDate").value) $("#rpDate").value = new Date().toISOString().slice(0, 10);
  typeSel.addEventListener("change", () => {
    const weekly = typeSel.value === "weekly";
    $("#rpDateWrap").style.display = weekly ? "none" : "";
    $("#rpWeekWrap").style.display = weekly ? "" : "none";
  });

  $("#btnGenReport").addEventListener("click", async () => {
    const msg = $("#rpMsg");
    msg.textContent = "Đang tạo báo cáo..."; msg.className = "";
    try {
      let url;
      if (typeSel.value === "weekly") {
        const wk = $("#rpWeek").value;
        url = "/api/report/weekly" + (wk ? `?week=${encodeURIComponent(wk)}` : "");
      } else {
        const d = $("#rpDate").value;
        url = "/api/report/daily" + (d ? `?date=${encodeURIComponent(d)}` : "");
      }
      const res = await api(url);
      state.lastReport = res.markdown;
      state.lastReportParams = { type: typeSel.value, date: $("#rpDate").value, week: $("#rpWeek").value };
      const pre = $("#reportPreview");
      pre.textContent = res.markdown;
      pre.style.display = "";
      $("#btnCopyReport").style.display = "";
      $("#btnExportReport").style.display = "";
      msg.textContent = "✅ Đã tạo báo cáo — bấm Copy markdown rồi dán vào chat/email, hoặc Tải xuống Excel.";
      msg.className = "msg-ok";
    } catch (e) {
      msg.textContent = "Lỗi: " + e.message;
      msg.className = "msg-err";
      $("#reportPreview").style.display = "none";
      $("#btnCopyReport").style.display = "none";
      $("#btnExportReport").style.display = "none";
    }
  });

  $("#btnCopyReport").addEventListener("click", async () => {
    const text = state.lastReport || "";
    const msg = $("#rpMsg");
    let ok = false;
    // navigator.clipboard chỉ có ở secure context (localhost/https) — LAN HTTP phải fallback.
    try {
      if (navigator.clipboard) { await navigator.clipboard.writeText(text); ok = true; }
    } catch (e) { ok = false; }
    if (!ok) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      ta.remove();
    }
    msg.textContent = ok ? "📋 Đã copy markdown vào clipboard." : "Không copy tự động được — bôi đen nội dung bên dưới và Ctrl+C.";
    msg.className = ok ? "msg-ok" : "msg-err";
  });

  $("#btnExportReport").addEventListener("click", async () => {
    const msg = $("#rpMsg");
    const params = state.lastReportParams || {};
    msg.textContent = "Đang tải xuống..."; msg.className = "";
    try {
      let url;
      if (params.type === "weekly") {
        url = "/api/report/weekly/export" + (params.week ? `?week=${encodeURIComponent(params.week)}` : "");
      } else {
        url = "/api/report/daily/export" + (params.date ? `?date=${encodeURIComponent(params.date)}` : "");
      }
      const link = document.createElement("a");
      link.href = url;
      link.download = params.type === "weekly" ? `weekly_${params.week || 'current'}.xlsx` : `daily_${params.date || 'latest'}.xlsx`;
      link.click();
      msg.textContent = "✅ Đã tải xuống file Excel.";
      msg.className = "msg-ok";
    } catch (e) {
      msg.textContent = "Lỗi: " + e.message;
      msg.className = "msg-err";
    }
  });
}

// ---------------- Integrations (🔗 Đồng bộ) ----------------
async function loadIntegrationsStatus() {
  try {
    const st = await api("/api/integrations/status");
    const farm = $("#intFarmStatus");
    if (farm) farm.innerHTML = st.farm_configured
      ? "🟢 Farm API: đã cấu hình URL."
      : "🟡 Farm API: <b>chưa cấu hình</b> — điền URL/token ở tab ⚙️ Cài đặt (mục Tích hợp & API).";
    const comp = $("#intCompanyStatus");
    if (comp) comp.innerHTML =
      (st.company_configured ? "🟢 API công ty: đã cấu hình. " : "🟡 API công ty: <b>chưa cấu hình</b> — dùng paste tay bên dưới. ") +
      (st.company_cache.rows
        ? `Cache hiện có <b>${st.company_cache.rows}</b> TC (nguồn: ${st.company_cache.source}, lúc: ${st.company_cache.synced_at}).`
        : "Cache đang trống.");
    const gh = $("#intGithubStatus");
    if (gh) gh.innerHTML =
      (st.github_configured ? "🟢 GitHub: đã cấu hình repo. " : "🟡 GitHub: <b>chưa cấu hình repo</b> — dùng paste tay bên dưới. ") +
      (st.github_cache.files
        ? `Cache hiện có <b>${st.github_cache.files}</b> file (nguồn: ${st.github_cache.source}, lúc: ${st.github_cache.synced_at}).`
        : "Cache đang trống.");
  } catch (e) {
    console.error("integrations status:", e);
  }
}

// Parse paste hệ thống công ty: mỗi dòng "TC_ID⇥Status" hoặc "TC_ID⇥Status⇥Item" (tab/phẩy).
function parseCompanyPaste(text) {
  const rows = [];
  for (const line of (text || "").split(/\r?\n/)) {
    const parts = line.split(/\t|,/).map((p) => p.trim());
    if (!parts[0]) continue;
    if (/^(tc\s*.?id|test\s*case)/i.test(parts[0])) continue; // header
    rows.push({ tc_id: parts[0], status: parts[1] || "", item: parts[2] || "" });
  }
  return rows;
}

function renderReconcile() {
  const data = state.reconcile;
  if (!data) return;
  const s = data.summary;
  $("#reconcileKpiRow").innerHTML =
    kpiCard("Script DONE", s.total_done) +
    kpiCard("✅ Khớp cả 3 chiều", s.ok_all, s.ok_all === s.total_done ? "good" : "") +
    (s.has_company_data
      ? kpiCard("⚠️ Không có bên công ty", s.missing_company, s.missing_company ? "warn" : "good") +
        kpiCard("⚠️ Chưa Performed", s.wrong_company_status, s.wrong_company_status ? "warn" : "good")
      : kpiCard("Công ty", "chưa có dữ liệu")) +
    (s.has_github_data
      ? kpiCard("❌ Thiếu file GitHub", s.missing_github, s.missing_github ? "bad" : "good")
      : kpiCard("GitHub", "chưa có dữ liệu"));

  const onlyDiff = $("#reconcileOnlyDiff")?.checked;
  const rows = (data.rows || []).filter((r) => !onlyDiff || !r.ok);
  $("#reconcileTable tbody").innerHTML = rows.map((r) => {
    const okTag = r.ok
      ? `<span class="tag" style="background:#2ecc71">✅ OK</span>`
      : `<span class="tag" style="background:#e74c3c">✗ Lệch</span>`;
    let compCell;
    if (!s.has_company_data) compCell = '<span style="color:#bbb">(chưa có dữ liệu)</span>';
    else if (r.company_status === null || r.company_status === undefined) compCell = '<span class="tag" style="background:#e74c3c">không có trong DS</span>';
    else if (r.company_ok) compCell = `<span class="tag" style="background:#2ecc71">${escAttr(r.company_status)}</span>`;
    else compCell = `<span class="tag" style="background:#e67e22">${escAttr(r.company_status)}</span>`;
    let ghCell;
    if (!s.has_github_data) ghCell = '<span style="color:#bbb">(chưa có dữ liệu)</span>';
    else if (r.github_ok) ghCell = `<span class="tag" style="background:#2ecc71" title="${escAttr(r.matched_path || "")}">✅ có file</span> <span class="hint">${escAttr(r.matched_path || "")}</span>`;
    else ghCell = `<span class="tag" style="background:#e74c3c">❌ thiếu file</span>${r.path_configured ? "" : ' <span class="hint">(Item chưa cấu hình đường dẫn — tìm toàn repo)</span>'}`;
    return `<tr>
      <td>${okTag}</td>
      <td>${escAttr(r.tc_id)}</td>
      <td>${escAttr(r.item)}</td>
      <td>${escAttr(r.member)}</td>
      <td>${escAttr(r.completed_date)}</td>
      <td>${compCell}</td>
      <td>${ghCell}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="7" style="color:#999">${onlyDiff ? "Không có dòng lệch nào 🎉" : "Chưa có script DONE nào."}</td></tr>`;

  const rev = $("#reconcileReverse");
  if (rev) {
    const list = data.company_performed_not_done || [];
    rev.innerHTML = list.length
      ? `⚠️ <b>Chiều ngược</b>: ${list.length}${list.length >= 50 ? "+" : ""} TC bên công ty đã <b>Performed</b> nhưng hệ thống này chưa ghi DONE: <code>${list.slice(0, 15).map(escAttr).join(", ")}</code>${list.length > 15 ? " …" : ""}`
      : (s.has_company_data ? "✅ Không có TC nào Performed bên công ty mà thiếu DONE ở đây." : "");
  }
}

function initIntegrations() {
  if (!$("#btnFarmFetch")) return;

  $("#btnFarmFetch").addEventListener("click", async () => {
    const msg = $("#farmFetchMsg");
    const ids = $("#farmTestIds").value.trim();
    if (!ids) { msg.textContent = "Nhập ít nhất 1 Test ID."; msg.className = "msg-err"; return; }
    msg.textContent = "Đang fetch từ farm..."; msg.className = "";
    $("#farmFetchErrors").innerHTML = "";
    try {
      const res = await api("/api/integrations/farm/fetch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test_ids: ids }),
      });
      let text = `✅ Fetch OK ${res.fetched_ok} Test ID — đã lưu ${res.inserted} dòng kết quả.`;
      if (res.skipped_duplicate) text += ` (${res.skipped_duplicate} dòng trùng bỏ qua)`;
      if (res.warnings && res.warnings.length) text += " ⚠️ " + res.warnings.join(" ");
      msg.textContent = text;
      msg.className = (res.fetch_errors || []).length ? "msg-err" : "msg-ok";
      if ((res.fetch_errors || []).length) {
        $("#farmFetchErrors").innerHTML = `<p class="hint" style="color:#c0392b">Lỗi theo Test ID:</p><ul class="hint">` +
          res.fetch_errors.map((e) => `<li><code>${escAttr(e.test_id)}</code>: ${escAttr(e.error)}</li>`).join("") + "</ul>";
      }
      if (res.inserted) { await loadReferenceData(); await refreshDashboard(); }
    } catch (e) {
      msg.textContent = "Lỗi: " + e.message; msg.className = "msg-err";
    }
  });

  $("#btnCompanySync").addEventListener("click", async () => {
    const msg = $("#companySyncMsg");
    msg.textContent = "Đang sync..."; msg.className = "";
    try {
      const res = await api("/api/integrations/company/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      msg.textContent = `✅ Đã đồng bộ ${res.synced} TC từ hệ thống công ty.`;
      msg.className = "msg-ok";
      await loadIntegrationsStatus();
      await refreshDashboard();
    } catch (e) { msg.textContent = "Lỗi: " + e.message; msg.className = "msg-err"; }
  });

  $("#btnCompanyManual").addEventListener("click", async () => {
    const msg = $("#companyManualMsg");
    const rows = parseCompanyPaste($("#companyPasteArea").value);
    if (!rows.length) { msg.textContent = "Không nhận diện được dòng nào."; msg.className = "msg-err"; return; }
    if (!confirm(`Thay TOÀN BỘ danh sách TC công ty trong cache bằng ${rows.length} dòng vừa dán?`)) return;
    try {
      const res = await api("/api/integrations/company/manual", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, mode: "replace" }),
      });
      msg.textContent = `✅ Đã nhập ${res.imported} TC (thay toàn bộ cache).`;
      msg.className = "msg-ok";
      $("#companyPasteArea").value = "";
      await loadIntegrationsStatus();
      await refreshDashboard();
    } catch (e) { msg.textContent = "Lỗi: " + e.message; msg.className = "msg-err"; }
  });

  $("#btnGithubSync").addEventListener("click", async () => {
    const msg = $("#githubSyncMsg");
    msg.textContent = "Đang sync từ GitHub..."; msg.className = "";
    try {
      const res = await api("/api/integrations/github/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      msg.textContent = `✅ Đã đồng bộ ${res.files} file script từ GitHub.` + (res.warning ? " ⚠️ " + res.warning : "");
      msg.className = "msg-ok";
      await loadIntegrationsStatus();
    } catch (e) { msg.textContent = "Lỗi: " + e.message; msg.className = "msg-err"; }
  });

  $("#btnGithubManual").addEventListener("click", async () => {
    const msg = $("#githubManualMsg");
    const paths = $("#githubPasteArea").value.split(/\r?\n/).map((p) => p.trim()).filter(Boolean);
    if (!paths.length) { msg.textContent = "Không có đường dẫn nào."; msg.className = "msg-err"; return; }
    if (!confirm(`Thay TOÀN BỘ danh sách file GitHub trong cache bằng ${paths.length} file vừa dán?`)) return;
    try {
      const res = await api("/api/integrations/github/manual", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths }),
      });
      msg.textContent = `✅ Đã nhập ${res.imported} file (thay toàn bộ cache).`;
      msg.className = "msg-ok";
      $("#githubPasteArea").value = "";
      await loadIntegrationsStatus();
    } catch (e) { msg.textContent = "Lỗi: " + e.message; msg.className = "msg-err"; }
  });

  $("#btnReconcile").addEventListener("click", async () => {
    const msg = $("#reconcileMsg");
    msg.textContent = "Đang đối chiếu..."; msg.className = "";
    try {
      state.reconcile = await api("/api/integrations/reconcile");
      renderReconcile();
      msg.textContent = "✅ Đã đối chiếu xong.";
      msg.className = "msg-ok";
    } catch (e) { msg.textContent = "Lỗi: " + e.message; msg.className = "msg-err"; }
  });
  $("#reconcileOnlyDiff")?.addEventListener("change", renderReconcile);
}

// ---------------- Init ----------------
async function init() {
  // Kiểm tra đăng nhập trước tiên. Chưa đăng nhập -> về trang login.
  state.me = await fetchMe();
  if (!state.me) { window.location = "/login"; return; }
  state.currentUser = state.me.username;

  initTabs();
  initAuthUI();
  initInputResults();
  initInputFix();
  initFixTracking();
  initCycleMatrix();
  state.newScriptItems = await api("/api/new-scripts/items").catch(() => []);
  initNewScripts();
  wireTableFilters();
  $("#btnExportSmMatrix")?.addEventListener("click", exportSmMatrixExcel);
  await loadReferenceData();
  initPriorityTable();
  await initSettings();
  initReports();
  initIntegrations();
  initLeaderboard();
  await loadPriority();
  await loadFailingScripts();
  renderPriorityTableHead();
  renderPriorityTable();
  await refreshDashboard();
  initTableTools();  // sort + filter mỗi cột + xuất Excel cho mọi bảng data-table
  applyPermissions();  // ẩn tab không có quyền + hiển thị topbar user (sau khi tab đã init)

  setInterval(async () => {
    // Đồng bộ phân quyền: admin đổi role/quyền hoặc vô hiệu hoá -> phản ánh sau ≤15s.
    const me = await fetchMe();
    if (!me) { window.location = "/login"; return; }  // bị vô hiệu hoá/xoá -> đá về login
    const changed = JSON.stringify(me) !== JSON.stringify(state.me);
    state.me = me;
    state.currentUser = me.username;
    if (changed) { applyPermissions(); nsApplyExtraPerms(); }

    // Tab "Ghi nhận Fix" đang mở -> chỉ lấy dữ liệu mới ở nền, không rebuild
    // dropdown/field đang thao tác dở (tránh làm gián đoạn form đang điền).
    const inputFixActive = isInputFixTabActive();
    const refData = await fetchReferenceData();
    if (!inputFixActive) renderReferenceData(refData);
    await loadPriority();
    await fetchFailingScripts();
    if (!inputFixActive) renderFailingScriptOptions();
    await refreshDashboard();
    if ($("#tab-priority").classList.contains("active")) { renderPriorityTableHead(); renderPriorityTable(); }
    if ($("#tab-cycle-compare").classList.contains("active")) { await loadCycleMatrix(); }
    if ($("#tab-fix-tracking").classList.contains("active")) { await loadFixTracking(); }
    if ($("#tab-new-scripts").classList.contains("active")) { await loadNewScripts(); }
  }, 15000);
}

init();
