// =========================================================
// Rollover — معالج ترحيل الطلاب (ترحيل لعام جديد / ترحيل للترم الثاني / تسوية مالية)
// =========================================================

import { initPage } from "./app.js";
import { icons } from "./icons.js";
import {
  getStudents,
  saveStudents,
  getGrades,
  getGroups,
  getAcademicYears,
  getTerms,
  getAcademicMonths,
  getPayments,
  getAllPayments,
  savePayments,
  getAttendance,
  saveAttendance,
  getStudentStatuses,
  addRolloverLog,
  getRolloverLogs,
  getActiveAcademicTerm,
} from "./storage.js";
import { escapeHTML, formatMoney, todayISO, generateId } from "./helpers.js";
import { toast, confirmDialog, emptyStateHTML } from "./ui.js";
import { gradeName, groupName, findGroup, dueAmount } from "./lookups.js";
import { createSnapshot, renderSnapshotSummaryHTML } from "./term-snapshot.js";
import { renderWalletReconciliationHTML, executeWalletReconciliation } from "./wallet-reconciliation.js";
import { computePnL, renderPnLHTML } from "./pnl-report.js";
import { canPerformAction } from "./permissions.js";
import { getSession } from "./storage.js";

const content = await initPage("rollover");
let rolloverMode = "year"; // "year" | "term" | "financial"
let financialStep = 1; // 1=snapshot, 2=wallet, 3=pnl, 4=execute
let previewData = [];

if (content) render();

function render() {
  content.innerHTML = `
    <div class="page__header">
      <div>
        <div class="page__title">${icons.calendar} ترحيل الطلاب</div>
        <div class="page__subtitle">نقل الطلاب + تسوية المحافظ + التقارير المالية الختامية</div>
      </div>
      <button class="btn btn-outline btn-sm" id="bulkImportRolloverBtn" style="color:var(--success);border-color:var(--success);">🚀 إدخال سريع لطلبة لمجموعة</button>
    </div>

    <div class="rollover-modes">
      <label class="rollover-mode-card ${rolloverMode === "year" ? "is-active" : ""}">
        <input type="radio" name="rolloverMode" value="year" ${rolloverMode === "year" ? "checked" : ""}>
        <div class="rollover-mode-card__icon" style="background:#6366f1;">📅</div>
        <div class="rollover-mode-card__content">
          <div class="rollover-mode-card__title">ترحيل لعام جديد</div>
          <div class="rollover-mode-card__desc">تغيير السنة الدراسية + المجموعة + ترحيل المديونيات كرصيد افتتاحي</div>
        </div>
        <div class="rollover-mode-card__check">${rolloverMode === "year" ? icons.check : ""}</div>
      </label>
      <label class="rollover-mode-card ${rolloverMode === "term" ? "is-active" : ""}">
        <input type="radio" name="rolloverMode" value="term" ${rolloverMode === "term" ? "checked" : ""}>
        <div class="rollover-mode-card__icon" style="background:#059669;">🔄</div>
        <div class="rollover-mode-card__content">
          <div class="rollover-mode-card__title">ترحيل للترم الثاني</div>
          <div class="rollover-mode-card__desc">نفس السنة + نقل الطلاب من مجموعات الترم الأول للترم الثاني</div>
        </div>
        <div class="rollover-mode-card__check">${rolloverMode === "term" ? icons.check : ""}</div>
      </label>
      <label class="rollover-mode-card ${rolloverMode === "financial" ? "is-active" : ""}">
        <input type="radio" name="rolloverMode" value="financial" ${rolloverMode === "financial" ? "checked" : ""}>
        <div class="rollover-mode-card__icon" style="background:#f59e0b;">💰</div>
        <div class="rollover-mode-card__content">
          <div class="rollover-mode-card__title">تسوية مالية + تقرير ختامي</div>
          <div class="rollover-mode-card__desc">لقطة أرصدة + تسوية المحافظ + التقرير المالي الختامي</div>
        </div>
        <div class="rollover-mode-card__check">${rolloverMode === "financial" ? icons.check : ""}</div>
      </label>
    </div>

    <div id="rolloverContent"></div>
  `;

  content.querySelectorAll('input[name="rolloverMode"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      rolloverMode = e.target.value;
      financialStep = 1;
      previewData = [];
      render();
    });
  });

  document.getElementById("bulkImportRolloverBtn")?.addEventListener("click", () => import("./bulk-import.js").then((m) => m.openBulkImportModal()));

  renderRolloverContent();
}

function renderRolloverContent() {
  const box = document.getElementById("rolloverContent");
  if (!box) return;

  if (rolloverMode === "year") {
    renderYearRollover(box);
  } else if (rolloverMode === "term") {
    renderTermRollover(box);
  } else if (rolloverMode === "financial") {
    renderFinancialReconciliation(box);
  }
}

/* ================= تسوية مالية + تقرير ختامي ================= */
function renderFinancialReconciliation(box) {
  const steps = [
    { num: 1, label: "📸 لقطة الأرصدة" },
    { num: 2, label: "🏦 تسوية المحافظ" },
    { num: 3, label: "📊 التقرير الختامي" },
    { num: 4, label: "✅ التنفيذ" },
  ];

  box.innerHTML = `
    <div class="card card-pad" style="margin-bottom:16px;">
      <div class="card__head">
        <div class="card__title">💰 معالج التسوية المالية</div>
      </div>
      <div style="display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap;">
        ${steps.map((s) => `
          <button class="btn btn-sm ${financialStep === s.num ? "btn-primary" : financialStep > s.num ? "btn-success" : "btn-outline"}" 
                  data-step="${s.num}" ${financialStep > s.num ? "disabled" : ""}>
            ${financialStep > s.num ? "✓ " : ""}${s.label}
          </button>
        `).join("")}
      </div>
      <div id="financialStepContent"></div>
    </div>
  `;

  box.querySelectorAll("button[data-step]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const step = Number(e.target.dataset.step);
      if (step <= financialStep) financialStep = step;
      renderFinancialReconciliation(box);
    });
  });

  const stepBox = document.getElementById("financialStepContent");
  if (financialStep === 1) renderSnapshotStep(stepBox);
  else if (financialStep === 2) renderWalletStep(stepBox);
  else if (financialStep === 3) renderPnLStep(stepBox);
  else if (financialStep === 4) renderExecuteStep(box);
}

function renderSnapshotStep(box) {
  const terms = getTerms().sort((a, b) => b.startDate.localeCompare(a.startDate));
  const currentTerm = getActiveAcademicTerm();

  box.innerHTML = `
    <div style="margin-bottom:12px;">
      <div style="font-weight:700; margin-bottom:8px;">📸 إنشاء لقطة أرصدة</div>
      <div style="font-size:13px; color:var(--muted); margin-bottom:12px;">
        اللقطة بتحفظ أرصدة المحافظ والمتأخرات لكل الطلاب النشطين كنقطة مرجعية.
      </div>
      <div style="display:flex; gap:12px; align-items:end; flex-wrap:wrap;">
        <div>
          <label class="label" style="font-size:12px;">الترم</label>
          <select class="select" id="snapshotTermSelect" style="min-width:0; max-width:100%;">
            ${terms.map((t) => `<option value="${t.id}" ${t.id === currentTerm?.id ? "selected" : ""}>${escapeHTML(t.name)} (${t.startDate} → ${t.endDate})</option>`).join("")}
          </select>
        </div>
        <button class="btn btn-primary btn-sm" id="createSnapshotBtn">${icons.check} إنشاء اللقطة</button>
      </div>
    </div>
    <div id="snapshotSummary"></div>
  `;

  document.getElementById("createSnapshotBtn").addEventListener("click", () => {
    const termId = document.getElementById("snapshotTermSelect").value;
    createSnapshot(termId);
    toast("تم إنشاء لقطة الأرصدة بنجاح ✓", "success");
    document.getElementById("snapshotSummary").innerHTML = renderSnapshotSummaryHTML(termId) || "";
  });

  const selectedTerm = terms[0]?.id;
  if (selectedTerm) {
    const existing = renderSnapshotSummaryHTML(selectedTerm);
    if (existing) document.getElementById("snapshotSummary").innerHTML = existing;
  }
}

function renderWalletStep(box) {
  box.innerHTML = renderWalletReconciliationHTML();
}

function renderPnLStep(box) {
  const terms = getTerms().sort((a, b) => b.startDate.localeCompare(a.startDate));
  const months = getAcademicMonths().sort((a, b) => b.startDate.localeCompare(a.startDate));
  const years = getAcademicYears();

  box.innerHTML = `
    <div style="margin-bottom:12px;">
      <div style="font-weight:700; margin-bottom:8px;">📊 التقرير الختامي</div>
      <div style="display:flex; gap:12px; align-items:end; flex-wrap:wrap; margin-bottom:16px;">
        <div>
          <label class="label" style="font-size:12px;">نوع الفترة</label>
          <select class="select" id="pnlPeriodType" style="min-width:120px;">
            <option value="month">شهر</option>
            <option value="term" selected>ترم</option>
            <option value="year">سنة</option>
          </select>
        </div>
        <div>
          <label class="label" style="font-size:12px;">الفترة</label>
          <select class="select" id="pnlPeriodId" style="min-width:0; max-width:100%;"></select>
        </div>
        <button class="btn btn-primary btn-sm" id="generatePnLBtn">${icons.chart || "📊"} عرض التقرير</button>
      </div>
    </div>
    <div id="pnlReportContent"></div>
  `;

  function updatePeriodOptions() {
    const type = document.getElementById("pnlPeriodType").value;
    const sel = document.getElementById("pnlPeriodId");
    if (type === "month") sel.innerHTML = months.map((m) => `<option value="${m.id}">${escapeHTML(m.name)} (${m.startDate})</option>`).join("");
    else if (type === "term") sel.innerHTML = terms.map((t) => `<option value="${t.id}">${escapeHTML(t.name)} (${t.startDate})</option>`).join("");
    else sel.innerHTML = years.map((y) => `<option value="${y.id}">${escapeHTML(y.name)} (${y.startDate})</option>`).join("");
  }

  document.getElementById("pnlPeriodType").addEventListener("change", updatePeriodOptions);
  updatePeriodOptions();

  document.getElementById("generatePnLBtn").addEventListener("click", () => {
    const type = document.getElementById("pnlPeriodType").value;
    const id = document.getElementById("pnlPeriodId").value;
    const data = computePnL(type, id);
    document.getElementById("pnlReportContent").innerHTML = renderPnLHTML(data);
  });
}

function renderExecuteStep(box) {
  const logs = getRolloverLogs();
  const lastLog = logs.length ? logs[logs.length - 1] : null;

  box.innerHTML = `
    <div style="margin-bottom:12px;">
      <div style="font-weight:700; margin-bottom:8px;">✅ تنفيذ التسوية المالية</div>
      <div style="font-size:13px; color:var(--muted); margin-bottom:16px;">
        هيتم تنفيذ التغييرات المالية التالية:
      </div>
      <ul style="font-size:13px; line-height:2; margin-bottom:16px; padding-right:20px;">
        <li>📸 إنشاء/تحديث لقطة الأرصدة للترم الحالي</li>
        <li>🏦 ترحيل أرصدة المحافظ كقيود افتتاحية في دفتر الأستاذ</li>
        <li>📋 ترحيل المديونيات كقيود افتتاحية</li>
        <li>📝 تسجيل العملية في سجل الترحيل</li>
      </ul>
      ${canPerformAction(getSession(), "rollover", "execute") ? `<button class="btn btn-success" id="executeFinancialBtn">${icons.check} تنفيذ التسوية المالية</button>` : ""}
    </div>
    ${lastLog ? `
      <div class="card card-pad" style="margin-top:16px;">
        <div class="card__head"><div class="card__title">📝 آخر عملية ترحيل</div></div>
        <div style="font-size:13px;">
          <div>التاريخ: ${lastLog.date} ${lastLog.time}</div>
          <div>النوع: ${escapeHTML(lastLog.type || "—")}</div>
          ${lastLog.walletCarried != null ? `<div>ترحيل المحافظ: ${formatMoney(lastLog.walletCarried)}</div>` : ""}
          ${lastLog.lateCarried != null ? `<div>ترحيل المديونيات: ${formatMoney(lastLog.lateCarried)}</div>` : ""}
          ${lastLog.studentsProcessed != null ? `<div>عدد الطلاب: ${lastLog.studentsProcessed}</div>` : ""}
        </div>
      </div>
    ` : ""}
  `;

  document.getElementById("executeFinancialBtn").addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "تأكيد التسوية المالية",
      body: `هيتم تنفيذ التسوية المالية:<br>• ترحيل أرصدة المحافظ والمديونيات<br>• تسجيل قيود افتتاحية في دفتر الأستاذ<br><br>هل أنت متأكد؟`,
      confirmText: "تنفيذ التسوية",
      tone: "warning",
    });
    if (!ok) return;

    const currentTerm = getActiveAcademicTerm();
    if (currentTerm) createSnapshot(currentTerm.id);

    const result = executeWalletReconciliation({ termId: currentTerm?.id, executedBy: "النظام" });

    addRolloverLog({
      type: "financial_reconciliation",
      termId: currentTerm?.id,
      termName: currentTerm?.name || "—",
      studentsProcessed: result.processedCount,
      walletCarried: result.totalWalletCarried,
      lateCarried: result.totalLateCarried,
    });

    toast(`تم التسوية المالية ✓ — ${result.processedCount} طالب | محافظ: ${formatMoney(result.totalWalletCarried)} | ديون: ${formatMoney(result.totalLateCarried)}`, "success");
    financialStep = 1;
    render();
  });
}

/* ================= ترحيل لعام جديد ================= */
function renderYearRollover(box) {
  const allStudents = getStudents().filter((s) => s.status === "active");
  const grades = getGrades().sort((a, b) => a.order - b.order);
  const groups = getGroups();

  if (!allStudents.length) {
    box.innerHTML = emptyStateHTML({ icon: icons.users, title: "لا يوجد طلاب نشطون للترحيل" });
    return;
  }

  let gradeFilter = "";
  let groupFilter = "";
  const filteredForDisplay = () => allStudents.filter((s) => {
    if (gradeFilter && s.gradeId !== gradeFilter) return false;
    if (groupFilter && s.groupId !== groupFilter) return false;
    return true;
  });

  function buildDisplayRows(students) {
    return students.map((s) => {
      const currentGrade = grades.find((g) => g.id === s.gradeId);
      const currentGroup = findGroup(groups, s.groupId);
      const nextGrade = grades.find((g) => g.order === (currentGrade?.order || 0) + 1);
      const nextGroups = nextGrade ? groups.filter((g) => g.gradeId === nextGrade.id) : [];
      const lateBalance = Number(s.lateBalance || 0);
      return { student: s, currentGrade, currentGroup, nextGrade, nextGroups, selectedGroupId: nextGroups[0]?.id || "", lateBalance };
    });
  }

  const allRows = buildDisplayRows(allStudents);
  previewData = allRows;

  function build() {
    const displayStudents = filteredForDisplay();
    const displayRows = buildDisplayRows(displayStudents);
    const totalLate = allRows.reduce((sum, r) => sum + r.lateBalance, 0);

    box.innerHTML = `
      <div class="card card-pad" style="margin-bottom:16px;">
        <div class="flex-between" style="flex-wrap:wrap; gap:10px; margin-bottom:14px; padding:12px; background:var(--bg-2); border-radius:8px;">
          <div style="font-weight:700; font-size:14px;">${icons.filter} فلترة للمعاينة فقط — الترحيل يشمل كل الطلاب النشطاء</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <select id="rGradeFilter" class="select" style="max-width:200px;">
              <option value="">كل السنوات</option>
              ${grades.map((g) => `<option value="${g.id}" ${g.id === gradeFilter ? "selected" : ""}>${escapeHTML(g.name)}</option>`).join("")}
            </select>
            <select id="rGroupFilter" class="select" style="max-width:220px;">
              <option value="">كل المجموعات</option>
              ${groups.filter((g) => !gradeFilter || g.gradeId === gradeFilter).map((g) => `<option value="${g.id}" ${g.id === groupFilter ? "selected" : ""}>${escapeHTML(g.name)} (${g.code})</option>`).join("")}
            </select>
          </div>
        </div>

        <div class="card__head">
          <div class="card__title">معاينة الترحيل (${allRows.length} طالب إجمالًا — عرض ${displayRows.length})</div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-outline btn-sm" id="selectAllBtn">تحديد الكل في المعاينة</button>
            ${canPerformAction(getSession(), "rollover", "execute") ? `<button class="btn btn-primary btn-sm" id="executeYearBtn">${icons.check} تنفيذ الترحيل (${allRows.length} طالب)</button>` : ""}
          </div>
        </div>
        ${totalLate > 0 ? `<div class="field__hint" style="margin-bottom:12px; color:var(--warning);">⚠️ يوجد ${formatMoney(totalLate)} متأخرات سيتم ترحيلها كرصيد افتتاحي لـ ${allRows.length} طالب</div>` : ""}
        ${!displayRows.length ? emptyStateHTML({ icon: icons.users, title: "لا يوجد طلاب مطابقين للفلتر", text: "حاول تغيير فلتر السنة أو المجموعة." }) : `
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th style="width:36px;"><input type="checkbox" id="selectAllCb" style="width:16px;height:16px;cursor:pointer;"></th>
                <th>الطالب</th>
                <th>السنة الحالية</th>
                <th>المجموعة الحالية</th>
                <th>→</th>
                <th>السنة التالية</th>
                <th>المجموعة الجديدة</th>
                <th>المتأخرات</th>
              </tr>
            </thead>
            <tbody>
              ${displayRows.map((r, idx) => `
                <tr data-sid="${r.student.id}">
                  <td><input type="checkbox" class="rolloverCb" data-sid="${r.student.id}" checked style="width:16px;height:16px;cursor:pointer;"></td>
                  <td>
                    <div class="cell-user">
                      <div class="avatar-sm">${escapeHTML((r.student.name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2))}</div>
                      <div class="cell-user__name">${escapeHTML(r.student.name)}</div>
                    </div>
                  </td>
                  <td><span class="badge badge-primary">${escapeHTML(r.currentGrade?.name || "—")}</span></td>
                  <td class="text-muted">${escapeHTML(r.currentGroup?.name || "—")}</td>
                  <td style="font-size:18px;">→</td>
                  <td>${r.nextGrade ? `<span class="badge badge-success">${escapeHTML(r.nextGrade.name)}</span>` : `<span class="badge badge-danger">آخر سنة</span>`}</td>
                  <td>${r.nextGroups.length ? `<select class="select groupSelect" data-sid="${r.student.id}" style="max-width:200px; font-size:12px;">${r.nextGroups.map((g) => `<option value="${g.id}" ${g.id === r.selectedGroupId ? "selected" : ""}>${escapeHTML(g.name)} (${g.code})</option>`).join("")}</select>` : `<span class="text-muted">—</span>`}</td>
                  <td style="font-weight:700; ${r.lateBalance > 0 ? "color:var(--danger);" : ""}">${r.lateBalance > 0 ? formatMoney(r.lateBalance) : "—"}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>`}
      </div>`;

    document.getElementById("rGradeFilter")?.addEventListener("change", (e) => { gradeFilter = e.target.value; groupFilter = ""; build(); });
    document.getElementById("rGroupFilter")?.addEventListener("change", (e) => { groupFilter = e.target.value; build(); });

    document.getElementById("selectAllCb")?.addEventListener("change", (e) => {
      document.querySelectorAll(".rolloverCb").forEach((cb) => (cb.checked = e.target.checked));
    });
    document.getElementById("selectAllBtn")?.addEventListener("click", () => {
      document.querySelectorAll(".rolloverCb").forEach((cb) => (cb.checked = true));
      document.getElementById("selectAllCb") && (document.getElementById("selectAllCb").checked = true);
    });
    box.querySelectorAll(".groupSelect").forEach((sel) => {
      sel.addEventListener("change", (e) => {
        const sid = e.target.dataset.sid;
        const row = previewData.find((r) => r.student.id === sid);
        if (row) row.selectedGroupId = e.target.value;
      });
    });
    document.getElementById("executeYearBtn")?.addEventListener("click", executeYearRollover);
  }

  build();
}

async function executeYearRollover() {
  const rows = previewData;
  if (!rows.length) { toast("لا يوجد طلاب للترحيل", "warning"); return; }

  const totalStudents = rows.length;
  const totalLate = rows.reduce((sum, r) => sum + r.lateBalance, 0);

  const ok = await confirmDialog({
    title: "تأكيد ترحيل الطلاب لعام جديد",
    body: `هيتم ترحيل جميع الطلاب النشطاء (${totalStudents}) للسنة الأكاديمية التالية دفعة واحدة.<br><br>• أولى ← تانية • تانية ← تالتة • وهكذا<br>${totalLate > 0 ? `<br>⚠️ سيتم ترحيل <strong>${formatMoney(totalLate)}</strong> متأخرات كرصيد افتتاحي.` : ""}<br><br>هل أنت متأكد؟`,
    confirmText: "تنفيذ الترحيل (الكل)",
    tone: "success",
  });
  if (!ok) return;

  const students = getStudents();
  let updatedCount = 0;

  rows.forEach((row) => {
    const student = students.find((s) => s.id === row.student.id);
    if (!student) return;

    if (row.nextGrade) student.gradeId = row.nextGrade.id;
    if (row.selectedGroupId) student.groupId = row.selectedGroupId;

    if (row.lateBalance > 0) {
      student.lateBalance = row.lateBalance;
      student.openingBalance = (student.openingBalance || 0) + row.lateBalance;
      student.openingBalanceNote = `ترحيل من ${row.currentGrade?.name || ""} — ${todayISO()}`;
    }
    updatedCount++;
  });

  saveStudents(students);
  addRolloverLog({ type: "year_rollover", studentsProcessed: updatedCount, lateCarried: totalLate });
  toast(`تم ترحيل ${updatedCount} طالب بنجاح ✓`, "success");
  render();
}

/* ================= ترحيل للترم الثاني ================= */
function renderTermRollover(box) {
  const allStudents = getStudents().filter((s) => s.status === "active");
  const grades = getGrades().sort((a, b) => a.order - b.order);
  const groups = getGroups();

  if (!allStudents.length) {
    box.innerHTML = emptyStateHTML({ icon: icons.users, title: "لا يوجد طلاب نشطون للترحيل" });
    return;
  }

  let gradeFilter = "";
  let groupFilter = "";

  function buildDisplayRows(students) {
    const allTerms = getTerms();
    const years = getAcademicYears();
    const currentYear = years.find((y) => y.isCurrent);

    const gradeGroupsMap = {};
    grades.forEach((g) => { gradeGroupsMap[g.id] = { term1Groups: groups.filter((grp) => grp.gradeId === g.id), term2Groups: [] }; });

    return students.map((s) => {
      const currentGrade = grades.find((g) => g.id === s.gradeId);
      const currentGroup = findGroup(groups, s.groupId);
      const gradeGroups = gradeGroupsMap[s.gradeId] || { term1Groups: [], term2Groups: [] };
      let matchedGroupId = "";
      if (currentGroup) {
        const match = gradeGroups.term1Groups.find((g) => g.id !== s.groupId && g.time === currentGroup.time);
        matchedGroupId = match?.id || gradeGroups.term1Groups.find((g) => g.id !== s.groupId)?.id || "";
      }
      return { student: s, currentGrade, currentGroup, matchedGroupId, allGroups: gradeGroups.term1Groups.filter((g) => g.id !== s.groupId) };
    });
  }

  const allRows = buildDisplayRows(allStudents);
  previewData = allRows;

  function build() {
    const displayStudents = allStudents.filter((s) => {
      if (gradeFilter && s.gradeId !== gradeFilter) return false;
      if (groupFilter && s.groupId !== groupFilter) return false;
      return true;
    });
    const displayRows = buildDisplayRows(displayStudents);

    box.innerHTML = `
      <div class="card card-pad" style="margin-bottom:16px;">
        <div class="flex-between" style="flex-wrap:wrap; gap:10px; margin-bottom:14px; padding:12px; background:var(--bg-2); border-radius:8px;">
          <div style="font-weight:700; font-size:14px;">${icons.filter} فلترة الطلاب</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <select id="trGradeFilter" class="select" style="max-width:200px;">
              <option value="">كل السنوات</option>
              ${grades.map((g) => `<option value="${g.id}" ${g.id === gradeFilter ? "selected" : ""}>${escapeHTML(g.name)}</option>`).join("")}
            </select>
            <select id="trGroupFilter" class="select" style="max-width:220px;">
              <option value="">كل المجموعات</option>
              ${groups.filter((g) => !gradeFilter || g.gradeId === gradeFilter).map((g) => `<option value="${g.id}" ${g.id === groupFilter ? "selected" : ""}>${escapeHTML(g.name)} (${g.code})</option>`).join("")}
            </select>
          </div>
        </div>

        <div class="card__head">
          <div class="card__title">معاينة الترحيل للترم الثاني (${allRows.length} طالب إجمالًا — عرض ${displayRows.length})</div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-outline btn-sm" id="selectAllBtn">تحديد الكل</button>
            ${canPerformAction(getSession(), "rollover", "execute") ? `<button class="btn btn-primary btn-sm" id="executeTermBtn">${icons.check} تنفيذ الترحيل على المعروضين (${displayRows.length})</button>` : ""}
          </div>
        </div>
        <div class="field__hint" style="margin-bottom:12px;">
          هتنقل الطلاب من مجموعاتهم الحالية (الترم الأول) لمجموعات مناظرة بنفس السنة الدراسية.
          <strong style="color:var(--warning);">المتأخرات مش هتتغير</strong> — لو الطالب مش هيكمل، الغِ تحديده وهيتوقف تلقائيًا.
        </div>
        ${!displayRows.length ? emptyStateHTML({ icon: icons.users, title: "لا يوجد طلاب مطابقين للفلتر" }) : `
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th style="width:36px;"><input type="checkbox" id="selectAllCb" style="width:16px;height:16px;cursor:pointer;"></th>
                <th>الطالب</th>
                <th>المجموعة الحالية</th>
                <th>→</th>
                <th>المجموعة الجديدة (الترم الثاني)</th>
                <th>المتأخرات</th>
              </tr>
            </thead>
            <tbody>
              ${displayRows.map((r, idx) => {
                const debt = Number(r.student.lateBalance || 0);
                return `<tr data-sid="${r.student.id}">
                  <td><input type="checkbox" class="rolloverCb" data-sid="${r.student.id}" checked style="width:16px;height:16px;cursor:pointer;"></td>
                  <td><div class="cell-user"><div class="avatar-sm">${escapeHTML((r.student.name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2))}</div><div class="cell-user__name">${escapeHTML(r.student.name)}</div></div></td>
                  <td class="text-muted">${escapeHTML(r.currentGroup?.name || "—")}</td>
                  <td style="font-size:18px;">→</td>
                  <td>${r.allGroups.length ? `<select class="select groupSelect" data-sid="${r.student.id}" style="max-width:220px; font-size:12px;"><option value="">— بدون تغيير —</option>${r.allGroups.map((g) => `<option value="${g.id}" ${g.id === r.matchedGroupId ? "selected" : ""}>${escapeHTML(g.name)} (${g.code})</option>`).join("")}</select>` : `<span class="text-muted">لا توجد مجموعات أخرى</span>`}</td>
                  <td style="font-weight:700; ${debt > 0 ? "color:var(--danger);" : ""}">${debt > 0 ? formatMoney(debt) : "—"}</td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>`}
      </div>`;

    document.getElementById("trGradeFilter")?.addEventListener("change", (e) => { gradeFilter = e.target.value; groupFilter = ""; build(); });
    document.getElementById("trGroupFilter")?.addEventListener("change", (e) => { groupFilter = e.target.value; build(); });

    document.getElementById("selectAllCb")?.addEventListener("change", (e) => {
      document.querySelectorAll(".rolloverCb").forEach((cb) => (cb.checked = e.target.checked));
    });
    document.getElementById("selectAllBtn")?.addEventListener("click", () => {
      document.querySelectorAll(".rolloverCb").forEach((cb) => (cb.checked = true));
      const allCb = document.getElementById("selectAllCb");
      if (allCb) allCb.checked = true;
    });
    box.querySelectorAll(".groupSelect").forEach((sel) => {
      sel.addEventListener("change", (e) => {
        const sid = e.target.dataset.sid;
        const row = previewData.find((r) => r.student.id === sid);
        if (row) row.matchedGroupId = e.target.value;
      });
    });
    document.getElementById("executeTermBtn")?.addEventListener("click", executeTermRollover);
  }

  build();
}

async function executeTermRollover() {
  const checkedSids = new Set([...document.querySelectorAll(".rolloverCb:checked")].map((cb) => cb.dataset.sid));
  if (!checkedSids.size) { toast("لم تحدد أي طالب للترحيل", "warning"); return; }

  const selectedRows = previewData.filter((r) => checkedSids.has(r.student.id) && r.matchedGroupId);
  const skippedRows = previewData.filter((r) => checkedSids.has(r.student.id) && !r.matchedGroupId);
  const uncheckedRows = previewData.filter((r) => !checkedSids.has(r.student.id));

  if (!selectedRows.length && !uncheckedRows.length) {
    toast("لم تحدد أي طالب لمجموعة جديدة", "warning");
    return;
  }

  // بناء رسالة التأكيد
  let bodyParts = [];
  if (selectedRows.length) {
    bodyParts.push(`هيتم ترحيل <strong>${selectedRows.length}</strong> طالب لمجموعات الترم الثاني.`);
  }
  if (skippedRows.length) {
    bodyParts.push(`<span style="color:var(--warning);">(${skippedRows.length} طالب مش هيتم ترحيلهم لأنهم لم يحددوا مجموعة جديدة)</span>`);
  }
  if (uncheckedRows.length) {
    bodyParts.push(`<br>⚠️ <strong>${uncheckedRows.length}</strong> طالب هيتحول حالتهم لـ <strong>"متوقف"</strong> (تصفية حسابات):`);
    bodyParts.push(`<div style="margin:8px 16px; padding:10px 14px; background:var(--bg); border-radius:8px; font-size:12.5px; line-height:1.8;">`);
    uncheckedRows.forEach((r) => {
      const debt = Number(r.student.lateBalance || 0);
      const name = escapeHTML(r.student.name);
      bodyParts.push(debt > 0
        ? `${name} — متأخرات: <strong style="color:var(--danger);">${formatMoney(debt)}</strong> ج.م`
        : `${name} — لا يوجد متأخرات`
      );
    });
    bodyParts.push(`</div>`);
    bodyParts.push(`<small style="color:var(--muted);">مديونياتهم هتفضل ظاهرة في شاشة "المتأخرات" للضغط عليهم للدفع.</small>`);
  }

  const hasDropouts = uncheckedRows.length > 0;
  const ok = await confirmDialog({
    title: "تأكيد ترحيل الطلاب للترم الثاني",
    body: bodyParts.join("<br>"),
    confirmText: hasDropouts ? "تنفيذ الترحيل + توقف الملغين" : "تنفيذ الترحيل",
    tone: hasDropouts ? "warning" : "success",
  });
  if (!ok) return;

  const students = getStudents();
  let movedCount = 0;
  let pausedCount = 0;

  // نقل الطلاب للمجموعات الجديدة (ترحيل للترم الثاني)
  selectedRows.forEach((row) => {
    const student = students.find((s) => s.id === row.student.id);
    if (!student) return;
    student.groupId = row.matchedGroupId;
    movedCount++;
  });

  // إيقاف الطلاب الملغي تحديدهم (تصفية حسابات)
  uncheckedRows.forEach((row) => {
    const student = students.find((s) => s.id === row.student.id);
    if (!student) return;
    student.status = "paused";
    pausedCount++;
  });

  saveStudents(students);
  addRolloverLog({ type: "term_rollover", studentsProcessed: movedCount, studentsPaused: pausedCount });
  let successMsg = "";
  if (movedCount) successMsg += `تم ترحيل ${movedCount} طالب للترم الثاني`;
  if (pausedCount) successMsg += `${successMsg ? " • " : ""}تم إيقاف ${pausedCount} طالب (تصفية حسابات)`;
  toast(`${successMsg} ✓`, "success");
  render();
}
