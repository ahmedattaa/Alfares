// =========================================================
// Finance — اليومية المالية (تقرير يومى + تقرير أسبوعى)
// =========================================================

import { initPage } from "./app.js";
import { icons } from "./icons.js";
import { getAttendance, getPayments, getAllPayments, savePayments, getStudents, saveStudents, getStudentStatuses, getSessionLogs, getGroups, getGrades, getExtraCharges, saveExtraCharges, getWalletTransactions, deductFromWallet, getAcademicYears, getTerms, getAcademicMonths, recordCashCollection, recordLedgerOnly } from "./storage.js";
import { escapeHTML, initials, formatMoney, todayISO, formatDateAr, addDays, startOfWeek, weekdayNameAr, generateId, GROUP_CARD_PALETTE } from "./helpers.js";
import { toast, confirmDialog, formModal, emptyStateHTML } from "./ui.js";
import { groupName, gradeName, groupsForGrade, findGroup, dueAmount } from "./lookups.js";
import { formatTimeAr, weekdayArForDate, isScheduledOnDate } from "./schedule.js";
import { getSessionsForDate } from "./session-overview.js";
import { exportTableToExcel, printTableAsPDF } from "./export-utils.js";
import { computePnL, renderPnLHTML } from "./pnl-report.js";
import { renderStackedBar } from "./charts.js";
import { openCollectionDialog } from "./collection-dialog.js";

const content = await initPage("finance");
let activeTab = "daily";
let selectedDate = todayISO();
let weekStart = startOfWeek(todayISO());

if (content) render();

function render() {
  content.innerHTML = `
    <div class="page__header">
      <div>
        <div class="page__title">التقارير المالية</div>
        <div class="page__subtitle">تقارير يومية وأسبوعية + متأخرات + إيرادات شهرية</div>
      </div>
    </div>

    <div class="tabs" id="financeTabs">
      <button class="tab-btn ${activeTab === "daily" ? "is-active" : ""}" data-tab="daily">${icons.wallet}<span>اليومى</span></button>
      <button class="tab-btn ${activeTab === "weekly" ? "is-active" : ""}" data-tab="weekly">${icons.chart}<span>الأسبوعى</span></button>
      <button class="tab-btn ${activeTab === "late" ? "is-active" : ""}" data-tab="late">${icons.alert}<span>المتأخرات</span></button>
      <button class="tab-btn ${activeTab === "monthly" ? "is-active" : ""}" data-tab="monthly">${icons.shield}<span>الإيرادات الشهرية</span></button>
      <button class="tab-btn ${activeTab === "charges" ? "is-active" : ""}" data-tab="charges">${icons.money}<span>استحقاقات</span></button>
      <button class="tab-btn ${activeTab === "pnl" ? "is-active" : ""}" data-tab="pnl">${icons.chart}<span>التقرير الختامي</span></button>
    </div>

    <div id="tabContent"></div>
  `;

  content.querySelectorAll(".tab-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      content.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === activeTab));
      renderTabContent();
    })
  );

  renderTabContent();
}

function renderTabContent() {
  const box = document.getElementById("tabContent");
  if (activeTab === "daily") return renderDailyTab(box);
  if (activeTab === "weekly") return renderWeeklyTab(box);
  if (activeTab === "late") return renderLateTab(box);
  if (activeTab === "monthly") return renderMonthlyTab(box);
  if (activeTab === "pnl") return renderPnLTab(box);
  return renderChargesTab(box);
}

/* ================= التقرير اليومى ================= */
function renderDailyTab(box) {
  box.innerHTML = `
    <div class="page__header" style="margin-bottom:14px;">
      <div class="page__subtitle" style="margin:0;">ملخص كل مجموعة على حدة ليوم ${formatDateAr(selectedDate)}</div>
      <div style="display:flex; gap:8px; align-items:center;">
        <button class="btn btn-outline btn-sm" id="dailyExportExcelBtn">${icons.download} تصدير Excel</button>
        <button class="btn btn-outline btn-sm" id="dailyExportPdfBtn">${icons.print} طباعة / PDF</button>
        <input class="input" type="date" id="dateFilter" style="max-width:180px;" value="${selectedDate}">
      </div>
    </div>

    <div id="groupsBreakdown" style="margin-bottom:20px;"></div>

    <div class="card card-pad">
      <div class="card__head"><div class="card__title">طلاب بانتظار الدفع</div></div>
      <div id="paymentsTable"></div>
    </div>
  `;

  document.getElementById("dateFilter").addEventListener("change", (e) => {
    selectedDate = e.target.value;
    renderDailyTab(box);
  });

  document.getElementById("dailyExportExcelBtn")?.addEventListener("click", () => exportTableToExcel("#groupsBreakdown table", `التقرير_اليومى_${selectedDate}`));
  document.getElementById("dailyExportPdfBtn")?.addEventListener("click", () => printTableAsPDF("#groupsBreakdown table", `التقرير اليومى — ${formatDateAr(selectedDate)}`));

  renderGroupsBreakdown();
  renderPaymentsTable();
}

function renderGroupsBreakdown() {
  const box = document.getElementById("groupsBreakdown");
  const sessions = getSessionsForDate(selectedDate);

  if (!sessions.length) {
    box.innerHTML = emptyStateHTML({ icon: icons.grid, title: "لا توجد حصص مجدولة فى هذا اليوم" });
    return;
  }

  const allStudents = getStudents();
  const allPayments = getPayments().filter((p) => p.date === selectedDate);
  const allStatuses = getStudentStatuses();
  const allAttendance = getAttendance().filter((a) => a.date === selectedDate && a.category === "attendance");

  const grandTotal = {
    present: sessions.reduce((sum, s) => sum + s.presentCount, 0),
    paid: sessions.reduce((sum, s) => sum + s.paidCount, 0),
    unpaid: sessions.reduce((sum, s) => sum + s.unpaidCount, 0),
    revenue: sessions.reduce((sum, s) => sum + s.collected, 0),
  };

  box.innerHTML = `
    <div style="display:grid; grid-template-columns:1fr; gap:14px; margin-bottom:16px;">
      ${sessions
        .map((s, i) => {
          const palette = GROUP_CARD_PALETTE[i % GROUP_CARD_PALETTE.length];
          const groupStudents = allStudents.filter((st) => st.groupId === s.group.id && st.status === "active");
          const sessionPrice = s.group.sessionPrice || 0;

          const breakdownRows = groupStudents.map((st) => {
            const record = allAttendance.find((a) => a.studentId === st.id);
            const studentDue = dueAmount(st, s.group);
            const discount = Math.min(sessionPrice, Number(st.discount || 0));
            const pay = allPayments.find((p) => p.studentId === st.id);

            let status = "absent";
            let statusLabel = "غائب";
            let paidAmount = 0;

            if (record) {
              const stStatus = allStatuses.find((x) => x.id === record.statusId);
              if (stStatus?.id === "ST-PAID") {
                status = "paid";
                statusLabel = "حضر ودفع";
                paidAmount = pay ? Number(pay.amount || 0) : 0;
              } else if (stStatus?.id === "ST-UNPAID") {
                status = "unpaid";
                statusLabel = "حضر بدون دفع";
              } else if (stStatus?.id === "ST-EXCUSED") {
                status = "excused";
                statusLabel = "غائب بإذن";
              } else if (stStatus?.id === "ST-CALL") {
                status = "called";
                statusLabel = "استدعاء";
              }
            }

            return {
              name: st.name,
              code: st.code || "-",
              discount,
              due: studentDue,
              paid: paidAmount,
              diff: paidAmount - studentDue,
              status,
              statusLabel,
            };
          });

          const sorted = [
            ...breakdownRows.filter((r) => r.status === "unpaid"),
            ...breakdownRows.filter((r) => r.status === "paid" && r.discount > 0),
            ...breakdownRows.filter((r) => r.status === "paid" && r.discount === 0),
            ...breakdownRows.filter((r) => !["unpaid", "paid"].includes(r.status)),
          ];

          const totalExpected = breakdownRows.filter((r) => r.status === "paid" || r.status === "unpaid").reduce((sum, r) => sum + r.due, 0);
          const totalCollected = breakdownRows.filter((r) => r.status === "paid").reduce((sum, r) => sum + r.paid, 0);

          return `
          <div class="finance-group-card finance-group-card--wide" style="background:${palette.bg}; border-color:${palette.border};">
            <div class="finance-group-card__top">
              <div>
                <div class="finance-group-card__name" style="color:${palette.text};">${escapeHTML(s.group.name)}</div>
                <div class="finance-group-card__time">${escapeHTML(s.gradeLabel)} — ${formatTimeAr(s.group.time)}</div>
              </div>
              <div class="finance-group-card__stats">
                <div class="finance-group-card__stat"><span class="finance-group-card__value">${s.presentCount}</span><span class="finance-group-card__label">حضور</span></div>
                <div class="finance-group-card__stat"><span class="finance-group-card__value">${s.paidCount}</span><span class="finance-group-card__label">مدفوع</span></div>
                <div class="finance-group-card__stat"><span class="finance-group-card__value">${s.unpaidCount}</span><span class="finance-group-card__label">غير مدفوع</span></div>
              </div>
            </div>
            <div class="finance-group-card__revenue" style="border-color:${palette.border};">
              <span>إيرادات: <strong>${formatMoney(s.collected)}</strong></span>
              <span style="margin-right:auto; margin-left:0; font-weight:600; font-size:12px; color:var(--muted);">المتوقع: ${formatMoney(totalExpected)}</span>
            </div>
            <div class="sa-breakdown" style="border:none; border-radius:0; margin:0; background:transparent;">
              <button type="button" class="sa-breakdown__toggle" data-group-toggle="${s.group.id}" style="font-size:13px; padding:10px 0;">
                <span style="color:${palette.text};">تفاصيل المبالغ لكل طالب (${sorted.length})</span>
                <span class="sa-breakdown__toggle-arrow" style="color:${palette.text};" data-group-arrow="${s.group.id}">◂</span>
              </button>
              <div class="sa-breakdown__table-wrap" data-group-table="${s.group.id}" style="display:none;">
                <table class="sa-breakdown__table">
                  <thead>
                    <tr>
                      <th>الطالب</th>
                      <th>الحالة</th>
                      <th>الخصم</th>
                      <th>المستحق</th>
                      <th>المدفوع</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${sorted.map((r) => {
                      const statusColor = r.status === "paid" ? "var(--success)" : r.status === "unpaid" ? "var(--danger)" : "var(--muted)";
                      const rowBg = r.status === "paid" ? (r.discount > 0 ? "rgba(102,126,234,.06)" : "") : r.status === "unpaid" ? "rgba(239,68,68,.06)" : "";
                      const diffBadge = r.status === "paid" && r.discount > 0
                        ? `<span style="color:var(--primary); font-size:11px; font-weight:700;">خصم −${formatMoney(r.discount)}</span>`
                        : r.status === "paid" && r.diff !== 0
                          ? `<span style="color:${r.diff > 0 ? "var(--success)" : "var(--danger)"}; font-size:11px; font-weight:700;">${r.diff > 0 ? "+" : ""}${formatMoney(r.diff)}</span>`
                          : "";
                      return `
                      <tr style="background:${rowBg};">
                        <td>
                          <span class="code-pill" style="font-size:10px;">${escapeHTML(r.code)}</span>
                          ${escapeHTML(r.name)}
                          ${diffBadge}
                        </td>
                        <td><span class="badge badge-${r.status === "paid" ? "success" : r.status === "unpaid" ? "danger" : "neutral"}" style="font-size:11px;">${escapeHTML(r.statusLabel)}</span></td>
                        <td>${r.discount > 0 ? `<span style="color:var(--warning); font-weight:700;">−${formatMoney(r.discount)}</span>` : "—"}</td>
                        <td style="font-weight:700;">${formatMoney(r.due)}</td>
                        <td style="font-weight:700; color:${r.paid > 0 ? "var(--success)" : "var(--muted)"};">${r.paid > 0 ? formatMoney(r.paid) : "—"}</td>
                      </tr>`;
                    }).join("")}
                  </tbody>
                </table>
              </div>
            </div>
          </div>`;
        })
        .join("")}
    </div>

    <div class="finance-total-card">
      <div class="finance-total-card__title">${icons.wallet} إجمالى اليومية المالية</div>
      <div class="finance-total-card__grid">
        <div class="finance-total-card__item"><span class="finance-total-card__value">${grandTotal.present}</span><span class="finance-total-card__label">عدد الحضور اليوم</span></div>
        <div class="finance-total-card__item"><span class="finance-total-card__value">${grandTotal.paid}</span><span class="finance-total-card__label">عدد المدفوع</span></div>
        <div class="finance-total-card__item"><span class="finance-total-card__value">${grandTotal.unpaid}</span><span class="finance-total-card__label">عدد غير المدفوع</span></div>
        <div class="finance-total-card__item"><span class="finance-total-card__value">${formatMoney(grandTotal.revenue)}</span><span class="finance-total-card__label">الإيراد اليومى الكامل</span></div>
      </div>
    </div>
  `;

  box.querySelectorAll("[data-group-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const groupId = btn.dataset.groupToggle;
      const table = box.querySelector(`[data-group-table="${groupId}"]`);
      const arrow = box.querySelector(`[data-group-arrow="${groupId}"]`);
      if (!table) return;
      const isVisible = table.style.display !== "none";
      table.style.display = isVisible ? "none" : "block";
      if (arrow) arrow.textContent = isVisible ? "◂" : "▾";
    });
  });
}

function statCard(tone, icon, value, label) {
  return `
    <div class="stat-card">
      <div class="stat-card__icon ${tone}">${icon}</div>
      <div class="stat-card__value">${value}</div>
      <div class="stat-card__label">${label}</div>
    </div>
  `;
}

function renderPaymentsTable() {
  const box = document.getElementById("paymentsTable");
  const students = getStudents();
  const groups = getGroups();
  const payments = getPayments();
  const allStatuses = getStudentStatuses();

  const scheduledGroupIds = new Set(groups.filter((g) => isScheduledOnDate(g, selectedDate)).map((g) => g.id));
  const unpaidPayments = payments
    .filter((p) => p.date === selectedDate && p.status === "unpaid" && scheduledGroupIds.has(p.groupId))
    .sort((a, b) => (a.id < b.id ? 1 : -1));

  if (!unpaidPayments.length) {
    box.innerHTML = emptyStateHTML({ icon: icons.check, title: "لا يوجد طلاب غير مدفوعين فى هذا اليوم" });
    return;
  }

  const studentsMap = {};
  students.forEach((s) => (studentsMap[s.id] = s));

  box.innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>الطالب</th><th>المجموعة</th><th>المبلغ</th><th>الحالة</th><th></th></tr></thead>
        <tbody>
          ${unpaidPayments
            .map((p) => {
              const s = studentsMap[p.studentId];
              const group = findGroup(groups, p.groupId);
              return `
              <tr>
                <td>
                  <div class="cell-user">
                    <div class="avatar-sm">${initials(s?.name || "?")}</div>
                    <div class="cell-user__name">${escapeHTML(s?.name || "طالب محذوف")}</div>
                  </div>
                </td>
                <td class="text-muted">${escapeHTML(group?.name || "-")}</td>
                <td>${formatMoney(p.amount)}</td>
                <td><span class="badge badge-warning">غير مدفوع</span></td>
                <td>
                  <button class="btn btn-outline btn-sm markPaidBtn" data-student-id="${p.studentId}" data-payment-id="${p.id}">تحصيل المبلغ</button>
                </td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  box.querySelectorAll(".markPaidBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      openCollectionDialog(btn.dataset.studentId, {
        onClose: () => { renderGroupsBreakdown(); renderPaymentsTable(); },
      });
    });
  });
}

/* ================= التقرير الأسبوعى ================= */
function renderWeeklyTab(box) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const attendance = getAttendance();
  const payments = getPayments();
  const statuses = getStudentStatuses();
  const sessionLogs = getSessionLogs();
  const groups = getGroups();

  const rows = days.map((date) => {
    const dayAttendance = attendance.filter((a) => a.date === date && a.category === "attendance");
    const present = dayAttendance.filter((a) => statuses.find((s) => s.id === a.statusId)?.presence === "present").length;
    const absent = dayAttendance.filter((a) => statuses.find((s) => s.id === a.statusId)?.presence === "absent").length;
    const dayPayments = payments.filter((p) => p.date === date && p.status === "paid");
    const collected = dayPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const sessionsOpened = sessionLogs.filter((l) => l.date === date);
    return { date, present, absent, collected, sessionsOpened };
  });

  const weekTotal = {
    present: rows.reduce((sum, r) => sum + r.present, 0),
    absent: rows.reduce((sum, r) => sum + r.absent, 0),
    collected: rows.reduce((sum, r) => sum + r.collected, 0),
    sessions: rows.reduce((sum, r) => sum + r.sessionsOpened.length, 0),
  };

  box.innerHTML = `
    <div class="page__header" style="margin-bottom:14px;">
      <div class="flex-gap">
        <button class="btn btn-outline btn-icon" id="prevWeekBtn" title="الأسبوع السابق">${icons.arrowLeft}</button>
        <div class="page__subtitle" style="margin:0; font-weight:700;">من ${formatDateAr(weekStart)} إلى ${formatDateAr(addDays(weekStart, 6))}</div>
        <button class="btn btn-outline btn-icon" id="nextWeekBtn" title="الأسبوع التالى" style="transform:scaleX(-1);">${icons.arrowLeft}</button>
      </div>
      <button class="btn btn-outline btn-sm" id="thisWeekBtn">الأسبوع الحالى</button>
    </div>

    <div class="stat-grid">
      ${statCard("tone-success", icons.check, weekTotal.present, "إجمالى الحضور بالأسبوع")}
      ${statCard("tone-danger", icons.x, weekTotal.absent, "إجمالى الغياب بالأسبوع")}
      ${statCard("tone-primary", icons.grid, weekTotal.sessions, "عدد الحصص المفتوحة")}
      ${statCard("tone-primary", icons.wallet, formatMoney(weekTotal.collected), "إجمالى تحصيل الأسبوع")}
    </div>

    <div class="card card-pad">
      <div class="card__head"><div class="card__title">تفصيل أيام الأسبوع</div></div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>اليوم</th><th>التاريخ</th><th>الحصص المفتوحة</th><th>الحضور</th><th>الغياب</th><th>المحصّل</th></tr></thead>
          <tbody>
            ${rows
              .map(
                (r) => `
              <tr>
                <td style="font-weight:700;">${weekdayNameAr(r.date)}</td>
                <td class="text-muted">${r.date}</td>
                <td>
                  ${
                    r.sessionsOpened.length
                      ? r.sessionsOpened.map((l) => `<span class="badge badge-primary" style="margin-left:4px;">${escapeHTML(groupName(groups, l.groupId))}</span>`).join("")
                      : `<span class="badge badge-neutral">لم تُفتح حصص</span>`
                  }
                </td>
                <td><span class="badge badge-success">${r.present}</span></td>
                <td><span class="badge badge-danger">${r.absent}</span></td>
                <td style="font-weight:700;">${formatMoney(r.collected)}</td>
              </tr>`
              )
              .join("")}
            <tr style="background:var(--bg); font-weight:800;">
              <td colspan="3">إجمالى الأسبوع</td>
              <td><span class="badge badge-success">${weekTotal.present}</span></td>
              <td><span class="badge badge-danger">${weekTotal.absent}</span></td>
              <td>${formatMoney(weekTotal.collected)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById("prevWeekBtn").addEventListener("click", () => {
    weekStart = addDays(weekStart, -7);
    renderWeeklyTab(box);
  });
  document.getElementById("nextWeekBtn").addEventListener("click", () => {
    weekStart = addDays(weekStart, 7);
    renderWeeklyTab(box);
  });
  document.getElementById("thisWeekBtn").addEventListener("click", () => {
    weekStart = startOfWeek(todayISO());
    renderWeeklyTab(box);
  });
}

/* ================= استحقاقات مالية (بنود مسمّاة خارج سعر الحصة) ================= */
function renderChargesTab(box) {
  box.innerHTML = `
    <div class="card card-pad" style="margin-bottom:18px;">
      <div class="card__head">
        <div class="card__title">استحقاقات مالية</div>
        <button class="btn btn-primary btn-sm" id="addChargeBtn">${icons.plus} إضافة استحقاق مالى</button>
      </div>
      <p class="text-muted" style="font-size:13.5px; margin-bottom:0;">
        لأى مبلغ خارج سعر الحصة العادى (زى ملازم أو أوراق امتحان أو مراجعات) — بيُطبَّق على كل طلاب مجموعة معينة،
        ويظهر تلقائيًا للطالب كمبلغ مطلوب لما يحضر فى الاستقبال أو إدارة الحصة، منفصل باسمه عن سعر الحصة.
      </p>
    </div>

    <div class="card card-pad">
      <div class="card__head"><div class="card__title">كل الاستحقاقات المسجّلة</div></div>
      <div id="chargesTable"></div>
    </div>
  `;

  document.getElementById("addChargeBtn").addEventListener("click", () => openChargeForm());
  renderChargesTable();
}

function renderChargesTable() {
  const box = document.getElementById("chargesTable");
  const charges = getExtraCharges().slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const students = getStudents();

  if (!charges.length) {
    box.innerHTML = emptyStateHTML({ icon: icons.money, title: "لا توجد استحقاقات مالية مسجّلة بعد" });
    return;
  }

  // تجميع حسب اسم الاستحقاق + تاريخ الإنشاء (كل دفعة إضافة = صف واحد بالإحصائيات)
  const groupsMap = {};
  charges.forEach((c) => {
    const key = `${c.name}__${c.batchId || c.id}`;
    if (!groupsMap[key]) groupsMap[key] = { name: c.name, amount: c.amount, date: c.date, items: [] };
    groupsMap[key].items.push(c);
  });

  const rows = Object.values(groupsMap);

  box.innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>اسم الاستحقاق</th><th>المبلغ للطالب</th><th>عدد الطلاب</th><th>المحصّل</th><th>المتبقى</th><th>التاريخ</th></tr></thead>
        <tbody>
          ${rows
            .map((r) => {
              const paidCount = r.items.filter((i) => i.status === "paid").length;
              return `
              <tr>
                <td style="font-weight:700;">${escapeHTML(r.name)}</td>
                <td>${formatMoney(r.amount)}</td>
                <td class="text-muted">${r.items.length} طالب</td>
                <td><span class="badge badge-success">${paidCount}</span></td>
                <td><span class="badge ${r.items.length - paidCount > 0 ? "badge-warning" : "badge-neutral"}">${r.items.length - paidCount}</span></td>
                <td class="text-muted">${formatDateAr(r.date)}</td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function openChargeForm() {
  const grades = getGrades();
  const groups = getGroups();

  if (!groups.length) {
    toast("أضف مجموعة واحدة على الأقل من الإعدادات أولًا", "warning");
    return;
  }

  const bodyHTML = `
    <div class="field">
      <label class="field__label">اسم الاستحقاق</label>
      <input class="input" name="name" required placeholder="مثال: ملزمة امتحان الشهر">
    </div>
    <div class="form-grid">
      <div class="field">
        <label class="field__label">المبلغ لكل طالب (ج.م)</label>
        <input class="input" name="amount" type="number" min="1" required value="10">
      </div>
      <div class="field">
        <label class="field__label">المجموعة</label>
        <select class="select" name="groupId" required>
          ${groups.map((g) => `<option value="${g.id}">${escapeHTML(g.name)} (${g.code}) — ${escapeHTML(gradeName(grades, g.gradeId))}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="field__hint">هيتطبّق المبلغ ده على كل طلاب المجموعة المختارة، وهيظهر لهم منفصل عن سعر الحصة لما يحضروا.</div>
  `;

  const data = await formModal({ title: "إضافة استحقاق مالى جديد", bodyHTML, submitText: "تطبيق على المجموعة", wide: true });
  if (!data) return;

  const group = getGroups().find((g) => g.id === data.groupId);
  const groupStudents = getStudents().filter((s) => s.groupId === data.groupId);

  if (!groupStudents.length) {
    toast("المجموعة دى معندهاش طلاب حاليًا", "warning");
    return;
  }

  const ok = await confirmDialog({
    title: "تأكيد التطبيق",
    body: `هيتم تطبيق "<strong>${escapeHTML(data.name)}</strong>" بمبلغ <strong>${formatMoney(data.amount)}</strong> على <strong>${groupStudents.length}</strong> طالب فى مجموعة "${escapeHTML(group?.name || "")}". متأكد؟`,
    confirmText: "تطبيق",
    tone: "success",
  });
  if (!ok) return;

  const batchId = generateId("BATCH");
  const today = todayISO();
  const charges = getExtraCharges();

  groupStudents.forEach((s) => {
    charges.push({
      id: generateId("CHG"),
      batchId,
      studentId: s.id,
      name: data.name,
      amount: Number(data.amount) || 0,
      date: today,
      status: "unpaid",
    });
  });

  saveExtraCharges(charges);
  toast(`تم تطبيق الاستحقاق على ${groupStudents.length} طالب بنجاح`, "success");
  renderChargesTable();
}

/* ================= تقرير المتأخرات المتكرر ================= */
let lateBucket = "all";
let lateTermFilter = "";
let lateMonthFilter = "";

function renderLateTab(box) {
  const years = getAcademicYears();
  const allTerms = getTerms().map((t) => ({ ...t, yearName: years.find((y) => y.id === t.yearId)?.name || "" }));
  const allMonths = getAcademicMonths().map((m) => {
    const term = allTerms.find((t) => t.id === m.termId);
    return { ...m, termName: term?.name || "", yearName: term?.yearName || "" };
  });

  const students = getStudents().filter((s) => (s.status === "active" || s.status === "paused") && Number(s.lateBalance || 0) > 0);
  const groups = getGroups();
  const grades = getGrades();
  const payments = getPayments();
  const extraCharges = getExtraCharges();
  const now = new Date();

  const sorted = [...students].sort((a, b) => Number(b.lateBalance || 0) - Number(a.lateBalance || 0));
  const totalLate = sorted.reduce((sum, s) => sum + Number(s.lateBalance || 0), 0);

  // تصفية حسب الفترة الأكاديمية
  let filteredPayments = payments;
  if (lateTermFilter) filteredPayments = filteredPayments.filter((p) => p.termId === lateTermFilter);
  if (lateMonthFilter) filteredPayments = filteredPayments.filter((p) => p.monthId === lateMonthFilter);

  // تصنيف حسب المدة
  const buckets = {
    fresh: { label: "أقل من أسبوع", color: "var(--warning)", students: [], total: 0 },
    twoWeeks: { label: "أسبوع — أسبوعين", color: "#f97316", students: [], total: 0 },
    month: { label: "أكثر من شهر", color: "var(--danger)", students: [], total: 0 },
  };

  sorted.forEach((s) => {
    const lastPay = filteredPayments
      .filter((p) => p.studentId === s.id && p.status === "paid")
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];

    let daysSince = 999;
    if (lastPay && lastPay.date) {
      daysSince = Math.floor((now - new Date(lastPay.date)) / 86400000);
    } else if (s.joinDate) {
      daysSince = Math.floor((now - new Date(s.joinDate)) / 86400000);
    }

    const amount = Number(s.lateBalance || 0);
    if (daysSince <= 7) {
      buckets.fresh.students.push(s);
      buckets.fresh.total += amount;
    } else if (daysSince <= 14) {
      buckets.twoWeeks.students.push(s);
      buckets.twoWeeks.total += amount;
    } else {
      buckets.month.students.push(s);
      buckets.month.total += amount;
    }
  });

  // الطلاب المعروضين حسب الفلتر
  const shown = lateBucket === "all" ? sorted : (buckets[lateBucket]?.students || []);

  box.innerHTML = `
    <div class="finance-total-card" style="margin-bottom:20px; background: linear-gradient(135deg, #dc2626, #b91c1c);">
      <div class="finance-total-card__title">${icons.alert} إجمالى المتأخرات</div>
      <div class="finance-total-card__grid">
        <div class="finance-total-card__item">
          <span class="finance-total-card__value">${sorted.length}</span>
          <span class="finance-total-card__label">طالب متأخر</span>
        </div>
        <div class="finance-total-card__item">
          <span class="finance-total-card__value">${formatMoney(totalLate)}</span>
          <span class="finance-total-card__label">إجمالى المتأخرات</span>
        </div>
      </div>
    </div>

    <div class="card card-pad" style="margin-bottom:16px;">
      <div class="flex-between" style="flex-wrap:wrap; gap:10px;">
        <div style="font-weight:800; font-size:14px;">اختر الفئة</div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <select class="select" id="lateBucketSelect" style="max-width:240px;">
            <option value="all" ${lateBucket === "all" ? "selected" : ""}>الكل (${sorted.length} طالب — ${formatMoney(totalLate)})</option>
            <option value="fresh" ${lateBucket === "fresh" ? "selected" : ""}>🟡 أقل من أسبوع (${buckets.fresh.students.length} — ${formatMoney(buckets.fresh.total)})</option>
            <option value="twoWeeks" ${lateBucket === "twoWeeks" ? "selected" : ""}>🟠 أسبوع — أسبوعين (${buckets.twoWeeks.students.length} — ${formatMoney(buckets.twoWeeks.total)})</option>
            <option value="month" ${lateBucket === "month" ? "selected" : ""}>🔴 أكثر من شهر (${buckets.month.students.length} — ${formatMoney(buckets.month.total)})</option>
          </select>
          <select class="select" id="lateTermFilterSelect" style="max-width:200px;">
            <option value="">كل الأترام</option>
            ${allTerms.map((t) => `<option value="${t.id}" ${lateTermFilter === t.id ? "selected" : ""}>${escapeHTML(t.name)} (${escapeHTML(t.yearName)})</option>`).join("")}
          </select>
          <select class="select" id="lateMonthFilterSelect" style="max-width:200px;">
            <option value="">كل الشهور</option>
            ${allMonths
              .filter((m) => !lateTermFilter || m.termId === lateTermFilter)
              .map((m) => `<option value="${m.id}" ${lateMonthFilter === m.id ? "selected" : ""}>${escapeHTML(m.name)}</option>`)
              .join("")}
          </select>
        </div>
      </div>
    </div>

    <div style="display:flex; gap:8px; margin-bottom:12px;">
      <button class="btn btn-outline btn-sm" id="lateExportExcelBtn">${icons.download} تصدير Excel</button>
      <button class="btn btn-outline btn-sm" id="lateExportPdfBtn">${icons.print} طباعة / PDF</button>
    </div>

    <div id="lateStudentsList"></div>
  `;

  document.getElementById("lateBucketSelect").addEventListener("change", (e) => {
    lateBucket = e.target.value;
    renderLateStudentsList();
  });

  document.getElementById("lateTermFilterSelect").addEventListener("change", (e) => {
    lateTermFilter = e.target.value;
    lateMonthFilter = "";
    renderLateTab(box);
  });
  document.getElementById("lateMonthFilterSelect").addEventListener("change", (e) => {
    lateMonthFilter = e.target.value;
    renderLateStudentsList();
  });

  document.getElementById("lateExportExcelBtn")?.addEventListener("click", () => exportTableToExcel("#lateStudentsList table", "المتأخرات_المالية"));
  document.getElementById("lateExportPdfBtn")?.addEventListener("click", () => printTableAsPDF("#lateStudentsList table", "المتأخرات المالية"));

  renderLateStudentsList();
}

function renderLateStudentsList() {
  const box = document.getElementById("lateStudentsList");
  if (!box) return;

  const students = getStudents().filter((s) => (s.status === "active" || s.status === "paused") && Number(s.lateBalance || 0) > 0);
  const groups = getGroups();
  const grades = getGrades();
  const payments = getPayments();
  const extraCharges = getExtraCharges();
  const now = new Date();

  const sorted = [...students].sort((a, b) => Number(b.lateBalance || 0) - Number(a.lateBalance || 0));

  // تصفية حسب الفترة الأكاديمية
  let filteredPayments = payments;
  if (lateTermFilter) filteredPayments = filteredPayments.filter((p) => p.termId === lateTermFilter);
  if (lateMonthFilter) filteredPayments = filteredPayments.filter((p) => p.monthId === lateMonthFilter);

  const buckets = {
    fresh: { students: [] },
    twoWeeks: { students: [] },
    month: { students: [] },
  };

  sorted.forEach((s) => {
    const lastPay = filteredPayments
      .filter((p) => p.studentId === s.id && p.status === "paid")
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];

    let daysSince = 999;
    if (lastPay && lastPay.date) {
      daysSince = Math.floor((now - new Date(lastPay.date)) / 86400000);
    } else if (s.joinDate) {
      daysSince = Math.floor((now - new Date(s.joinDate)) / 86400000);
    }

    if (daysSince <= 7) buckets.fresh.students.push(s);
    else if (daysSince <= 14) buckets.twoWeeks.students.push(s);
    else buckets.month.students.push(s);
  });

  const shown = lateBucket === "all" ? sorted : (buckets[lateBucket]?.students || []);

  if (!shown.length) {
    box.innerHTML = emptyStateHTML({ icon: icons.check, title: "لا يوجد طلاب متأخرين في هذه الفئة", text: "كل الطلاب محدّثين." });
    return;
  }

  box.innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>الطالب</th>
            <th>السنة</th>
            <th>المجموعة</th>
            <th>المتأخرات</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${shown.map((s) => {
            const g = findGroup(groups, s.groupId);
            const gr = g ? grades.find((x) => x.id === g.gradeId) : null;
            return `
              <tr>
                <td>
                  <span class="code-pill" style="margin-left:6px;">${escapeHTML(s.code || "-")}</span>
                  ${escapeHTML(s.name)}
                  ${s.status === "paused" ? `<span class="badge badge-neutral" style="font-size:10px; margin-right:4px;">متوقف</span>` : ""}
                </td>
                <td class="text-muted">${escapeHTML(gr?.name || "—")}</td>
                <td class="text-muted">${escapeHTML(g?.name || "—")}</td>
                <td style="font-weight:800; color:var(--danger);">${formatMoney(s.lateBalance)}</td>
                <td>
                  <button class="btn btn-success btn-sm latePayBtn" data-id="${s.id}">${icons.money} تحصيل</button>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;

  box.querySelectorAll(".latePayBtn").forEach((btn) =>
    btn.addEventListener("click", () => {
      openCollectionDialog(btn.dataset.id, {
        onClose: () => renderLateStudentsList(),
      });
    })
  );
}


/* ================= تقرير الإيرادات الشهرية ================= */
let selectedTermId = "";
let selectedMonthId = "";

function renderMonthlyTab(box) {
  const payments = getPayments();
  const walletTxns = getWalletTransactions();
  const years = getAcademicYears();
  const allTerms = getTerms().map((t) => ({ ...t, yearName: years.find((y) => y.id === t.yearId)?.name || "" }));
  const allMonths = getAcademicMonths().map((m) => {
    const term = allTerms.find((t) => t.id === m.termId);
    return { ...m, termName: term?.name || "", yearName: term?.yearName || "" };
  });

  const filteredPayments = payments.filter((p) => {
    if (selectedMonthId && p.monthId !== selectedMonthId) return false;
    if (selectedTermId && p.termId !== selectedTermId) return false;
    return true;
  });
  const filteredWalletTxns = walletTxns; // wallet txns don't have termId

  const months = {};
  filteredPayments.forEach((p) => {
    const month = (p.sessionDate || p.date || "").slice(0, 7);
    if (!month) return;
    if (!months[month]) months[month] = { collected: 0, walletUsed: 0, count: 0 };
    months[month].collected += Number(p.amount || 0);
    months[month].walletUsed += Number(p.walletUsed || 0);
    months[month].count++;
  });

  filteredWalletTxns.forEach((t) => {
    const month = (t.date || "").slice(0, 7);
    if (!month) return;
    if (!months[month]) months[month] = { collected: 0, walletUsed: 0, count: 0, deposits: 0 };
    if (!months[month].deposits) months[month].deposits = 0;
    months[month].deposits += Number(t.amount || 0);
  });

  const sorted = Object.entries(months)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 6);

  const monthNames = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

  function getMonthLabel(ym) {
    const [y, m] = ym.split("-");
    return `${monthNames[Number(m) - 1]} ${y}`;
  }

  const grandTotal = sorted.reduce((sum, [, m]) => sum + m.collected + m.walletUsed, 0);

  // حساب الديون الشهرية للمخطط الشريطي
  const unpaidByMonth = {};
  payments.filter((p) => p.status === "unpaid").forEach((p) => {
    const month = (p.sessionDate || p.date || "").slice(0, 7);
    if (month) unpaidByMonth[month] = (unpaidByMonth[month] || 0) + Number(p.amount || 0) + Number(p.lateBalanceDelta || 0);
  });

  const stackedData = sorted.map(([ym, m]) => ({
    label: getMonthLabel(ym),
    cash: m.collected,
    wallet: m.walletUsed,
    debt: unpaidByMonth[ym] || 0,
  }));

  box.innerHTML = `
    <div class="card card-pad" style="margin-bottom:14px;">
      <div class="flex-between" style="flex-wrap:wrap; gap:10px;">
        <div style="font-weight:800; font-size:14px;">فلترة حسب الفترة الأكاديمية</div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <select class="select" id="termFilterSelect" style="max-width:200px;">
            <option value="">كل الأترام</option>
            ${allTerms.map((t) => `<option value="${t.id}" ${selectedTermId === t.id ? "selected" : ""}>${escapeHTML(t.name)} (${escapeHTML(t.yearName)})</option>`).join("")}
          </select>
          <select class="select" id="monthFilterSelect" style="max-width:200px;">
            <option value="">كل الشهور</option>
            ${allMonths
              .filter((m) => !selectedTermId || m.termId === selectedTermId)
              .map((m) => `<option value="${m.id}" ${selectedMonthId === m.id ? "selected" : ""}>${escapeHTML(m.name)}</option>`)
              .join("")}
          </select>
        </div>
      </div>
    </div>

    <div class="finance-total-card" style="margin-bottom:20px;">
      <div class="finance-total-card__title">${icons.chart} إجمالى الإيرادات (${sorted.length} آخر شهر)</div>
      <div class="finance-total-card__grid">
        <div class="finance-total-card__item">
          <span class="finance-total-card__value">${formatMoney(grandTotal)}</span>
          <span class="finance-total-card__label">إجمالى الإيراد</span>
        </div>
        <div class="finance-total-card__item">
          <span class="finance-total-card__value">${sorted.reduce((s, [, m]) => s + m.count, 0)}</span>
          <span class="finance-total-card__label">عدد المعاملات</span>
        </div>
      </div>
    </div>

    ${renderStackedBar(stackedData, { title: "الإيرادات الشهرية — كاش / محفظة / ديون" })}

    ${sorted.length ? sorted.map(([ym, m]) => {
      const total = m.collected + m.walletUsed;
      const collectedPct = total ? Math.round((m.collected / total) * 100) : 0;
      return `
        <div class="card card-pad" style="margin-bottom:12px;">
          <div class="flex-between" style="margin-bottom:10px;">
            <div style="font-weight:800; font-size:14px;">${getMonthLabel(ym)}</div>
            <span class="badge badge-primary">${m.count} معاملة</span>
          </div>

          <div class="finance-group-card__stats" style="margin-bottom:12px;">
            <div class="finance-group-card__stat">
              <span class="finance-group-card__value" style="color:var(--success);">${formatMoney(m.collected)}</span>
              <span class="finance-group-card__label">تحصيل مباشر</span>
            </div>
            <div class="finance-group-card__stat">
              <span class="finance-group-card__value" style="color:var(--info);">${formatMoney(m.walletUsed)}</span>
              <span class="finance-group-card__label">من المحفظة</span>
            </div>
            <div class="finance-group-card__stat">
              <span class="finance-group-card__value">${formatMoney(total)}</span>
              <span class="finance-group-card__label">الإجمالي</span>
            </div>
          </div>

          <div style="height:8px; background:var(--bg-2); border-radius:4px; overflow:hidden; display:flex;">
            <div style="width:${collectedPct}%; background:var(--success);"></div>
            <div style="width:${100 - collectedPct}%; background:var(--info);"></div>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--muted); margin-top:4px;">
            <span>تحصيل ${collectedPct}%</span>
            <span>محفظة ${100 - collectedPct}%</span>
          </div>
        </div>
      `;
    }).join("") : emptyStateHTML({ icon: icons.chart, title: "لا توجد مدفوعات بعد", text: "ابدأ بتسجيل الحضور والمدفوعات لتظهر التقارير هنا." })}
  `;

  document.getElementById("termFilterSelect").addEventListener("change", (e) => {
    selectedTermId = e.target.value;
    selectedMonthId = "";
    renderMonthlyTab(box);
  });
  document.getElementById("monthFilterSelect").addEventListener("change", (e) => {
    selectedMonthId = e.target.value;
    renderMonthlyTab(box);
  });
}

/* ================= التقرير الختامي P&L ================= */
function renderPnLTab(box) {
  const terms = getTerms().sort((a, b) => b.startDate.localeCompare(a.startDate));
  const months = getAcademicMonths().sort((a, b) => b.startDate.localeCompare(a.startDate));
  const years = getAcademicYears();

  box.innerHTML = `
    <div class="page__header" style="margin-bottom:14px;">
      <div class="page__subtitle" style="margin:0;">التقرير المالي الختامي — إجمالي الإيرادات والديون والمحافظ والورديات</div>
    </div>
    <div class="card card-pad" style="margin-bottom:16px;">
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
          <select class="select" id="pnlPeriodId" style="min-width:220px;"></select>
        </div>
        <button class="btn btn-primary btn-sm" id="generatePnLBtn">${icons.chart} عرض التقرير</button>
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
