// =========================================================
// استقبال زوار السنتر — الصفحة الموحّدة
// ملف الطالب · تسجيل الحضور · الإدارة المالية · الدرجات · المتابعة · التواصل
// اندمجت صفحتا "استقبال الطلاب" و"استقبال ولي الأمر" هنا
// =========================================================

import { initPage } from "./app.js";
import { icons } from "./icons.js";
import {
  getStudents, saveStudents, getGroups, getGrades, getStudentStatuses,
  getAttendance, getExtraCharges, saveExtraCharges,
  getPayments, savePayments, getExams,
  getWalletTransactions, saveWalletTransactions,
  addWalletDeposit, getFollowupLogs, addFollowupLog, getLastFollowupLog,
  recordCashCollection, recordLedgerOnly, addLedgerEntry,
} from "./storage.js";
import { escapeHTML, formatMoney, todayISO, formatDateAr, debounce } from "./helpers.js";
import { toast, confirmDialog, formModal, whatsappPreviewDialog } from "./ui.js";
import { gradeName, groupName, findGroup, statusesByCategory, dueAmount } from "./lookups.js";
import { recordAttendanceStatus, recordActionStatus, isStudentLocked, settleExtraCharge } from "./attendance-service.js";
import { computeFinanceBreakdown, renderFinancePanelHTML } from "./finance-panel.js";
import { sendRewardNotification } from "./whatsapp-notifications.js";
import { openWhatsApp } from "./whatsapp.js";
import { formatTimeAr, formatDaysAr, WEEKDAY_OPTIONS } from "./schedule.js";
import { renderTemplate } from "./whatsapp-templates.js";
import { buildMonthlyFollowupMessage } from "./reports.js";

const content = await initPage("visit");
let selectedStudentId = null;
let activeTab = "profile";

if (content) render();

// ═══════════════════════════════════════════════════════════
//  الرئيسيّة
// ═══════════════════════════════════════════════════════════

function render() {
  content.innerHTML = `
    <div class="page__header">
      <div>
        <div class="page__title">لوحة ولي الأمر</div>
        <div class="page__subtitle">بحث شامل لكل ما يخص الطالب — ملفه، ماليته، حضوره، درجاته، متابعته</div>
      </div>
    </div>

    <div class="vst-search">
      <div class="vst-search__icon">${icons.search}</div>
      <input type="text" class="vst-search__input" id="vstSearchInput"
             placeholder="ابحث بالاسم أو الكود أو رقم التليفون أو تليفون ولي الأمر..." autofocus>
      <div id="vstSearchResults" class="vst-search__results"></div>
    </div>

    <div id="vstStudentZone" style="display:none;"></div>
  `;

  const input = document.getElementById("vstSearchInput");
  input.addEventListener("input", debounce(onSearch, 120));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const term = input.value.trim();
      if (!term) return;
      const match = findSingleMatch(term);
      if (match) selectStudent(match.id);
    }
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".vst-search")) {
      document.getElementById("vstSearchResults").style.display = "none";
    }
  });
  input.focus();
}

// ═══════════════════════════════════════════════════════════
//  البحث
// ═══════════════════════════════════════════════════════════

function findSingleMatch(term) {
  const lower = term.toLowerCase();
  const students = getStudents();
  const matches = students.filter((s) => {
    const name = (s.name || "").toLowerCase();
    const code = (s.code || "").toLowerCase();
    const phone = (s.phone || "").toLowerCase();
    const parentPhone = (s.parentPhone || "").toLowerCase();
    return code.startsWith(lower) || name.includes(lower) || phone.includes(lower) || parentPhone.includes(lower);
  });
  return matches.length === 1 ? matches[0] : null;
}

function onSearch() {
  const term = document.getElementById("vstSearchInput").value.trim().toLowerCase();
  const results = document.getElementById("vstSearchResults");
  if (term.length < 1) { results.style.display = "none"; return; }

  const allStudents = getStudents();
  const groups = getGroups();

  const codeMatches = allStudents.filter((s) => (s.code || "").toLowerCase().startsWith(term));
  const nameMatches = allStudents.filter((s) => !codeMatches.includes(s) && (s.name || "").toLowerCase().includes(term));
  const phoneMatches = allStudents.filter((s) =>
    !codeMatches.includes(s) && !nameMatches.includes(s) &&
    ((s.phone || "").toLowerCase().includes(term) || (s.parentPhone || "").toLowerCase().includes(term))
  );
  const matches = [...codeMatches, ...nameMatches, ...phoneMatches].slice(0, 12);

  if (!matches.length) {
    results.innerHTML = `<div class="vst-search__empty">لا توجد نتائج</div>`;
    results.style.display = "block";
    return;
  }

  results.innerHTML = matches.map((s) => {
    const g = findGroup(groups, s.groupId);
    const wallet = Number(s.walletBalance || 0);
    const debt = Number(s.lateBalance || 0);
    const isActive = s.status === "active";
    const badges = [];
    if (wallet > 0) badges.push(`<span style="color:#fff;">${formatMoney(wallet)}</span>`);
    if (debt > 0) badges.push(`<span style="color:#fca5a5;">${formatMoney(debt)} متأخر</span>`);
    if (!isActive) badges.push(`<span style="color:#fde68a;">غير نشط</span>`);
    return `
      <div class="vst-search__item" data-id="${s.id}">
        <div class="vst-search__item-code ${!isActive ? "is-inactive" : ""}">${escapeHTML(s.code || "?")}</div>
        <div class="vst-search__item-info">
          <div class="vst-search__item-name">${escapeHTML(s.name)} ${!isActive ? `<span style="font-size:10px; color:var(--muted);">(غير نشط)</span>` : ""}</div>
          <div class="vst-search__item-meta">${escapeHTML(g?.name || "")} ${badges.length ? `· ${badges.join(" · ")}` : ""}</div>
        </div>
      </div>`;
  }).join("");

  results.style.display = "block";
  results.querySelectorAll(".vst-search__item").forEach((el) =>
    el.addEventListener("click", () => selectStudent(el.dataset.id))
  );
}

function selectStudent(id) {
  selectedStudentId = id;
  activeTab = "profile";
  document.getElementById("vstSearchResults").style.display = "none";
  const student = getStudents().find((s) => s.id === id);
  if (student) document.getElementById("vstSearchInput").value = student.name;
  renderStudentZone();
}

// ═══════════════════════════════════════════════════════════
//  كارت الطالب + التبويبات
// ═══════════════════════════════════════════════════════════

const TABS = [
  { id: "timeline",   label: "الخط الزمني",           icon: icons.clock },
  { id: "profile",    label: "ملف الطالب",           icon: icons.users },
  { id: "attendance", label: "تسجيل الحضور",          icon: icons.check },
  { id: "finance",    label: "الإدارة المالية",        icon: icons.wallet },
  { id: "grades",     label: "الدرجات والحضور",       icon: icons.chart },
  { id: "followup",   label: "المتابعة",              icon: icons.clipboard },
  { id: "contact",    label: "التواصل والجدول",       icon: icons.whatsapp },
];

function renderStudentZone() {
  const zone = document.getElementById("vstStudentZone");
  zone.style.display = "block";
  const student = getStudents().find((s) => s.id === selectedStudentId);
  if (!student) { zone.innerHTML = ""; return; }

  const group = findGroup(getGroups(), student.groupId);
  const grade = gradeName(getGrades(), student.gradeId);
  const wallet = Number(student.walletBalance || 0);
  const debt = Number(student.lateBalance || 0);
  const locked = isStudentLocked(student);

  zone.innerHTML = `
    <div class="vst-profile-card">
      <div class="vst-profile-card__header">
        <div class="vst-profile-card__avatar">${escapeHTML(student.code || "?")}</div>
        <div class="vst-profile-card__info">
          <div class="vst-profile-card__name">${escapeHTML(student.name)}</div>
          <div class="vst-profile-card__meta">${escapeHTML(group?.name || "")} · ${escapeHTML(grade || "")}</div>
          <div class="vst-profile-card__meta">تاريخ الانضمام: ${formatDateAr(student.joinDate)}</div>
        </div>
        <div class="vst-profile-card__badges">
          ${wallet > 0 ? `<div class="vst-badge vst-badge--success">${icons.wallet} ${formatMoney(wallet)}</div>` : ""}
          ${debt > 0 ? `<div class="vst-badge vst-badge--danger">${icons.money} ${formatMoney(debt)}</div>` : ""}
          ${locked ? `<div class="vst-badge vst-badge--warning">🔒 مقفول</div>` : ""}
        </div>
      </div>
    </div>

    <div class="vst-tabs">
      ${TABS.map((t) => `
        <button class="vst-tab ${activeTab === t.id ? "is-active" : ""}" data-tab="${t.id}">
          ${t.icon ? `<span class="vst-tab__icon">${t.icon}</span>` : ""}${t.label}
        </button>
      `).join("")}
    </div>

    <div id="vstTabContent"></div>
  `;

  zone.querySelectorAll(".vst-tab").forEach((btn) =>
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      renderStudentZone();
    })
  );

  renderTabContent();
}

function renderTabContent() {
  const box = document.getElementById("vstTabContent");
  const student = getStudents().find((s) => s.id === selectedStudentId);
  if (!student || !box) return;

  if (activeTab === "timeline") return renderTimelineTab(box, student);
  if (activeTab === "profile") return renderProfileTab(box, student);
  if (activeTab === "attendance") return renderAttendanceTab(box, student);
  if (activeTab === "finance") return renderFinanceTab(box, student);
  if (activeTab === "grades") return renderGradesTab(box, student);
  if (activeTab === "followup") return renderFollowupTab(box, student);
  if (activeTab === "contact") return renderContactTab(box, student);
}

// ═══════════════════════════════════════════════════════════
//  تبويب ١ — ملف الطالب
// ═══════════════════════════════════════════════════════════

function renderProfileTab(box, student) {
  const attendance = getAttendance().filter((a) => a.studentId === student.id && a.category === "attendance");
  const statuses = getStudentStatuses();
  const presentStatuses = new Set(statuses.filter((s) => s.presence === "present").map((s) => s.id));

  const last30 = attendance.filter((a) => {
    const diff = (Date.now() - new Date(a.date).getTime()) / 86400000;
    return diff <= 30;
  });
  const presentCount = last30.filter((a) => presentStatuses.has(a.statusId)).length;
  const totalCount = last30.length;
  const rate = totalCount ? Math.round((presentCount / totalCount) * 100) : 0;
  const unpaidCount = last30.filter((a) => {
    const st = statuses.find((s) => s.id === a.statusId);
    return st?.payment === "unpaid";
  }).length;

  const lastLog = getLastFollowupLog(student.id);
  const group = findGroup(getGroups(), student.groupId);

  box.innerHTML = `
    <div class="vst-info-grid">
      <div class="vst-info-card">
        <div class="vst-info-card__icon" style="background:rgba(16,185,129,.1); color:var(--success);">${icons.check}</div>
        <div class="vst-info-card__value">${presentCount}/${totalCount}</div>
        <div class="vst-info-card__label">حضور آخر 30 يوم</div>
      </div>
      <div class="vst-info-card">
        <div class="vst-info-card__icon" style="background:rgba(102,126,234,.1); color:var(--primary);">${icons.chart}</div>
        <div class="vst-info-card__value" style="color:${rate >= 70 ? "var(--success)" : rate >= 40 ? "var(--warning)" : "var(--danger)"};">${rate}%</div>
        <div class="vst-info-card__label">نسبة الحضور</div>
      </div>
      <div class="vst-info-card">
        <div class="vst-info-card__icon" style="background:rgba(245,158,11,.1); color:var(--warning);">${icons.clock}</div>
        <div class="vst-info-card__value">${unpaidCount}</div>
        <div class="vst-info-card__label">حصص غير مدفوعة</div>
      </div>
      <div class="vst-info-card">
        <div class="vst-info-card__icon" style="background:rgba(239,68,68,.1); color:var(--danger);">${icons.money}</div>
        <div class="vst-info-card__value">${formatMoney(Number(student.lateBalance || 0))}</div>
        <div class="vst-info-card__label">المتأخرات المالية</div>
      </div>
    </div>

    <div class="card card-pad" style="margin-top:16px;">
      <div class="card__head"><div class="card__title">بيانات الطالب</div></div>
      ${detailRow("الكود", student.code || "")}
      ${detailRow("المجموعة", group?.name || "")}
      ${detailRow("السنة الدراسية", gradeName(getGrades(), student.gradeId) || "")}
      ${detailRow("المواعيد", `${formatDaysAr(group?.days || [])} — ${formatTimeAr(group?.time)}`)}
      ${detailRow("سعر الحصة", formatMoney(group?.sessionPrice || 0))}
      ${detailRow("الخصم", student.discount ? formatMoney(student.discount) : "—")}
      ${detailRow("تليفون الطالب", student.phone || "—")}
      ${detailRow("تليفون ولي الأمر", student.parentPhone || "—")}
      ${detailRow("المهنة", student.fatherJob || "—")}
      ${detailRow("المدرسة", student.school || "—")}
      ${detailRow("الحالة", student.status === "active" ? "نشط" : "غير نشط")}
    </div>

    ${lastLog ? `
    <div class="card card-pad" style="margin-top:16px;">
      <div class="card__head"><div class="card__title">آخر ملاحظة متابعة</div></div>
      <div style="font-size:12px; color:var(--muted); margin-bottom:4px;">${formatDateAr(lastLog.date)} — ${lastLog.time}</div>
      <div style="font-size:13px;">${escapeHTML(lastLog.text)}</div>
    </div>` : ""}
  `;
}

function detailRow(label, value) {
  return `<div class="vst-detail-row"><span class="vst-detail-label">${escapeHTML(label)}</span><span>${escapeHTML(String(value))}</span></div>`;
}

// ═══════════════════════════════════════════════════════════
//  تبويب ٢ — تسجيل الحضور
// ═══════════════════════════════════════════════════════════

function renderAttendanceTab(box, student) {
  const statuses = getStudentStatuses();
  const attendanceStatuses = statusesByCategory(statuses, "attendance");
  const actionStatuses = statusesByCategory(statuses, "action");
  const group = findGroup(getGroups(), student.groupId);

  const today = todayISO();
  const todayRecord = getAttendance().find(
    (a) => a.studentId === student.id && a.date === today && a.category === "attendance"
  );
  const currentStatus = todayRecord ? statuses.find((s) => s.id === todayRecord.statusId) : null;

  const breakdown = computeFinanceBreakdown(student, group, getExtraCharges());

  box.innerHTML = `
    <div class="vst-att-status-bar">
      ${currentStatus
        ? `<span class="badge badge-${currentStatus.tone}"><span class="badge-dot"></span>حالة اليوم: ${escapeHTML(currentStatus.name)} (${todayRecord.time})</span>`
        : `<span class="badge badge-neutral">لم يتم تسجيل حالة اليوم بعد</span>`
      }
    </div>

    ${renderFinancePanelHTML(breakdown)}

    <div class="card card-pad" style="margin-top:16px;">
      <div class="card__head"><div class="card__title">تسجيل حالة الحضور</div></div>
      <div class="status-btn-grid">
        ${attendanceStatuses.map((s) => `
          <button class="btn btn-${s.tone} vstStatusBtn" data-status="${s.id}"
            style="${currentStatus?.id === s.id ? "outline:2px solid rgba(0,0,0,.15);" : ""}">
            ${icons.check}<span>${escapeHTML(s.name)}</span>
          </button>
        `).join("")}
      </div>
    </div>

    ${actionStatuses.length ? `
    <div class="card card-pad" style="margin-top:16px;">
      <div class="card__head"><div class="card__title">إجراءات استثنائية</div></div>
      <div class="status-btn-grid">
        ${actionStatuses.map((s) => `
          <button class="btn btn-outline vstActionBtn" data-status="${s.id}"
            style="border-color: var(--${s.tone === "danger" ? "danger" : "warning"});">
            ${icons.alert}<span>${escapeHTML(s.name)}</span>
          </button>
        `).join("")}
      </div>
    </div>` : ""}

    <div class="card card-pad" style="margin-top:16px; border-style:dashed;">
      <div class="card__head"><div class="card__title" style="font-size:14px;">آخر 10 حالات مسجلة</div></div>
      ${renderRecentHistory(student.id)}
    </div>
  `;

  box.querySelectorAll(".vstStatusBtn").forEach((btn) =>
    btn.addEventListener("click", () => onStatusClick(student.id, btn.dataset.status))
  );
  box.querySelectorAll(".vstActionBtn").forEach((btn) =>
    btn.addEventListener("click", () => onActionClick(student.id, btn.dataset.status))
  );
}

function renderRecentHistory(studentId) {
  const statuses = getStudentStatuses();
  const records = getAttendance()
    .filter((a) => a.studentId === studentId)
    .sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1))
    .slice(0, 10);

  if (!records.length) return `<div class="text-muted" style="font-size:13px; padding:12px;">لا يوجد سجل سابق</div>`;

  return `
    <div class="vst-history-table">
      <div class="vst-history-header">
        <span>التاريخ</span><span>الحالة</span><span>الوقت</span>
      </div>
      ${records.map((r) => {
        const s = statuses.find((st) => st.id === r.statusId);
        return `
          <div class="vst-history-row">
            <span>${formatDateAr(r.date)}</span>
            <span class="badge badge-${s?.tone || "neutral"}"><span class="badge-dot"></span>${escapeHTML(s?.name || "—")}</span>
            <span>${r.time || "—"}</span>
          </div>`;
      }).join("")}
    </div>
  `;
}

function onStatusClick(studentId, statusId) {
  const statuses = getStudentStatuses();
  const status = statuses.find((s) => s.id === statusId);
  if (!status) return;

  const options = {};
  let collectedForCharges = 0;
  if (status.payment === "paid") {
    const input = document.getElementById("collectAmountInput");
    collectedForCharges = input ? Number(input.value) || 0 : 0;
    options.collectedAmount = collectedForCharges;
  }

  const result = recordAttendanceStatus(studentId, statusId, todayISO(), options);
  if (!result) return;

  if (status.payment === "paid") {
    const student = getStudents().find((s) => s.id === studentId);
    const group = findGroup(getGroups(), student?.groupId);
    const breakdown = computeFinanceBreakdown(student, group, getExtraCharges());
    if (collectedForCharges >= breakdown.grandTotal && breakdown.charges.length) {
      const charges = getExtraCharges();
      charges.forEach((c) => {
        if (c.studentId === studentId && c.status === "unpaid") c.status = "paid";
      });
      saveExtraCharges(charges);
    }
  }

  let message = `${result.status.name}: ${result.student.name}`;
  if (result.financeInfo) {
    message += ` — تم تحصيل ${formatMoney(result.financeInfo.collected)}`;
    if (result.financeInfo.remaining > 0) message += `، باقى عليه ${formatMoney(result.financeInfo.remaining)}`;
  }
  toast(message, result.status.tone === "danger" ? "danger" : "success");
  renderStudentZone();
}

async function onActionClick(studentId, statusId) {
  const statuses = getStudentStatuses();
  const status = statuses.find((s) => s.id === statusId);
  if (!status) return;
  const student = getStudents().find((s) => s.id === studentId);

  const ok = await confirmDialog({
    title: `تأكيد: ${status.name}`,
    body: `هل أنت متأكد من تسجيل "<strong>${escapeHTML(status.name)}</strong>" للطالب <strong>${escapeHTML(student?.name || "")}</strong>؟`,
    confirmText: "تأكيد التسجيل",
    tone: status.tone === "danger" ? "danger" : "warning",
  });
  if (!ok) return;

  const result = recordActionStatus(studentId, statusId);
  toast(`تم تسجيل: ${status.name}`, status.tone === "danger" ? "danger" : "warning");

  if (result?.rewardResult && status.rewardAmount > 0) {
    sendRewardNotification(studentId, status.rewardAmount, status.name);
    toast(`مكافأة ${formatMoney(status.rewardAmount)} تمت إضافة المحفظة`, "success");
  }

  renderStudentZone();
}

// ═══════════════════════════════════════════════════════════
//  آلة تصفية الحسابات الذكية (One-Click Settlement)
// ═══════════════════════════════════════════════════════════

/**
 * يحسب الإجمالي المطلوب تخصيصه لطالب
 */
function computeTotalDue(student) {
  const group = findGroup(getGroups(), student.groupId);
  const sessionDue = group ? dueAmount(student, group) : 0;
  const priorBalance = Number(student.lateBalance || 0);
  const walletBalance = Number(student.walletBalance || 0);
  const charges = getExtraCharges().filter((c) => c.studentId === student.id && c.status === "unpaid");
  const chargesTotal = charges.reduce((sum, c) => sum + Number(c.amount || 0), 0);
  const grandTotal = sessionDue + priorBalance + chargesTotal;
  const netDue = Math.max(0, grandTotal - walletBalance);
  return { sessionDue, priorBalance, chargesTotal, grandTotal, walletBalance, netDue, charges };
}

/**
 * التسوية الشاملة — يخصم كل شيء في ضربة واحدة
 * @param {string} studentId
 * @param {number} cashPaid — المبلغ المدفوع كاش
 * @returns {{ receipt, student }}
 */
function settleAllDebts(studentId, cashPaid) {
  const students = getStudents();
  const student = students.find((s) => s.id === studentId);
  if (!student) return null;

  const group = findGroup(getGroups(), student.groupId);
  const { sessionDue, priorBalance, chargesTotal, grandTotal, walletBalance, charges } = computeTotalDue(student);

  if (grandTotal <= 0) return null;

  const totalPaid = cashPaid + walletBalance;
  const effectivePayment = Math.min(totalPaid, grandTotal);
  const excess = Math.max(0, totalPaid - grandTotal);

  // ═══ 1. خصم المحفظة أولاً ═══
  let walletUsed = 0;
  let debtCoveredFromWallet = 0;
  if (walletBalance > 0) {
    walletUsed = Math.min(walletBalance, grandTotal);
    debtCoveredFromWallet = Math.min(priorBalance, walletUsed);
    student.walletBalance = walletBalance - walletUsed;
    student.lateBalance = Math.max(0, priorBalance - debtCoveredFromWallet);
    // سجل حركة محفظة
    const txns = getWalletTransactions();
    txns.push({
      id: `WLT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      studentId, groupId: student.groupId,
      amount: walletUsed, type: "deduction",
      note: "تسوية شاملة — خصم من المحفظة",
      date: todayISO(),
    });
    saveWalletTransactions(txns);
    // ledger entry
    if (walletUsed > 0) {
      addLedgerEntry({
        studentId, type: "wallet_payment",
        description: "تسوية شاملة — خصم من المحفظة",
        debit: 0, credit: walletUsed,
        referenceType: "settlement",
      });
    }
  }

  // ═══ 2. تسجيل الكاش المدفوع ═══
  if (cashPaid > 0) {
    // الحصة
    if (sessionDue > 0) {
      const sessionCash = Math.min(cashPaid, sessionDue);
      recordCashCollection(studentId, sessionCash, "session", `تسوية شاملة — حصة ${group?.name || ""}`, {
        referenceType: "settlement",
      });
    }
    // المتأخرات المتبقية
    const remainingForDebts = Math.max(0, cashPaid - sessionDue);
    const debtRemainder = Math.max(0, priorBalance - debtCoveredFromWallet);
    if (remainingForDebts > 0 && debtRemainder > 0) {
      const debtCash = Math.min(remainingForDebts, debtRemainder);
      recordCashCollection(studentId, debtCash, "late", "تسوية شاملة — متأخرات سابقة", {
        referenceType: "settlement",
      });
      student.lateBalance = Math.max(0, student.lateBalance - debtCash);
    }
    // المستحقات
    const remainingForCharges = Math.max(0, cashPaid - sessionDue - debtRemainder);
    if (remainingForCharges > 0 && chargesTotal > 0) {
      recordCashCollection(studentId, Math.min(remainingForCharges, chargesTotal), "extra_charge", "تسوية شاملة — مستحقات أخرى", {
        referenceType: "settlement",
      });
    }
  }

  // ═══ 3. تصفير المستحقات ═══
  const allCharges = getExtraCharges();
  let settledChargeNames = [];
  charges.forEach((c) => {
    const ch = allCharges.find((x) => x.id === c.id);
    if (ch) { ch.status = "paid"; settledChargeNames.push(ch.name); }
  });
  saveExtraCharges(allCharges);

  // ═══ 4. تسجيل سجل الدفع ═══
  const payments = getPayments();
  payments.push({
    id: `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    studentId, groupId: student.groupId,
    date: todayISO(), sessionDate: todayISO(),
    amount: cashPaid, walletUsed,
    status: "paid",
    lateBalanceDelta: -(priorBalance + sessionDue),
    note: "تسوية شاملة",
    termId: "", monthId: "",
  });
  savePayments(payments);

  // ═══ 5. تصفير متأخرات الحصة (السعر بعد الخصم) ═══
  if (sessionDue > 0) {
    recordLedgerOnly(studentId, "session_fee", `تسوية شاملة — حصة ${group?.name || ""}`, sessionDue, sessionDue + walletUsed, {
      referenceType: "settlement",
    });
  }

  // ═══ 6. فائض → محفظة ═══
  let excessToWallet = 0;
  if (excess > 0) {
    excessToWallet = excess;
    student.walletBalance = (student.walletBalance || 0) + excess;
    const txns = getWalletTransactions();
    txns.push({
      id: `WLT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      studentId, groupId: student.groupId,
      amount: excess, debtCovered: 0, walletAdded: excess,
      note: "فائض من التسوية الشاملة",
      date: todayISO(),
    });
    saveWalletTransactions(txns);
    addLedgerEntry({
      studentId, type: "wallet_deposit",
      description: "فائض من التسوية الشاملة",
      debit: 0, credit: excess,
      referenceType: "settlement",
    });
  }

  // ═══ 7. حفظ الطالب ═══
  const allStudents = getStudents();
  const idx = allStudents.findIndex((s) => s.id === studentId);
  if (idx !== -1) allStudents[idx] = student;
  saveStudents(allStudents);

  // ═══ 8. إنشاء الإيصال ═══
  const receipt = {
    studentName: student.name,
    studentCode: student.code,
    groupName: group?.name || "—",
    date: todayISO(),
    time: new Date().toTimeString().slice(0, 5),
    breakdown: {
      sessionDue, priorBalance, chargesTotal, grandTotal,
      walletUsed, cashPaid, excessToWallet,
    },
    settledCharges: settledChargeNames,
  };

  return { receipt, student };
}

/** يبني HTML الإيصال التفصيلي */
function renderReceiptHTML(receipt) {
  const { studentName, studentCode, groupName, date, time, breakdown, settledCharges } = receipt;
  return `
    <div class="vst-receipt">
      <div class="vst-receipt__header">
        <div class="vst-receipt__center">سنتر الفارس التعليمي</div>
        <div class="vst-receipt__title">إيصال تسوية شاملة</div>
        <div class="vst-receipt__date">${formatDateAr(date)} — ${time}</div>
      </div>
      <div class="vst-receipt__student">
        <strong>${escapeHTML(studentName)}</strong> — <span style="color:var(--muted);">${escapeHTML(studentCode || "")}</span>
        <div style="font-size:12px; color:var(--muted);">${escapeHTML(groupName)}</div>
      </div>
      <div class="vst-receipt__body">
        ${breakdown.sessionDue > 0 ? `
          <div class="vst-receipt__row">
            <span>سعر الحصة</span><span>${formatMoney(breakdown.sessionDue)}</span>
          </div>` : ""}
        ${breakdown.priorBalance > 0 ? `
          <div class="vst-receipt__row">
            <span>متأخرات سابقة</span><span>${formatMoney(breakdown.priorBalance)}</span>
          </div>` : ""}
        ${breakdown.chargesTotal > 0 ? `
          <div class="vst-receipt__row">
            <span>مستحقات أخرى (${settledCharges.length})</span><span>${formatMoney(breakdown.chargesTotal)}</span>
          </div>` : ""}
        <div class="vst-receipt__divider"></div>
        <div class="vst-receipt__row vst-receipt__row--total">
          <span>الإجمالي المطلوب</span><span>${formatMoney(breakdown.grandTotal)}</span>
        </div>
        ${breakdown.walletUsed > 0 ? `
          <div class="vst-receipt__row" style="color:var(--success);">
            <span>خصم من المحفظة</span><span>−${formatMoney(breakdown.walletUsed)}</span>
          </div>` : ""}
        <div class="vst-receipt__row vst-receipt__row--paid">
          <span>المبلغ المدفوع (كاش)</span><span>${formatMoney(breakdown.cashPaid)}</span>
        </div>
        ${breakdown.excessToWallet > 0 ? `
          <div class="vst-receipt__row" style="color:var(--primary);">
            <span>فائض أُضيف للمحفظة</span><span>+${formatMoney(breakdown.excessToWallet)}</span>
          </div>` : ""}
      </div>
      <div class="vst-receipt__footer">
        <div>✅ تم التسوية بنجاح — لا مبالغ مستحقة</div>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════
//  تبويب ٣ — الإدارة المالية + آلة التسوية الذكية
// ═══════════════════════════════════════════════════════════

function renderFinanceTab(box, student) {
  const wallet = Number(student.walletBalance || 0);
  const debt = Number(student.lateBalance || 0);
  const charges = getExtraCharges().filter((c) => c.studentId === student.id && c.status === "unpaid");
  const totalCharges = charges.reduce((sum, c) => sum + Number(c.amount || 0), 0);
  const group = findGroup(getGroups(), student.groupId);
  const sessionPrice = group ? dueAmount(student, group) : 0;
  const payments = getPayments().filter((p) => p.studentId === student.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 25);
  const grandTotal = sessionPrice + debt + totalCharges;
  const netDue = Math.max(0, grandTotal - wallet);

  box.innerHTML = `
    ${grandTotal > 0 ? `
    <div class="vst-master-ledger card card-pad">
      <div class="vst-master-ledger__header">
        <div>
          <div class="card__title" style="margin:0;">💰 الحساب الشامل — ما عليه ${escapeHTML(student.name)}</div>
          <div class="text-muted" style="font-size:12px; margin-top:2px;">تسوية شاملة في ضربة واحدة</div>
        </div>
      </div>

      <div class="vst-master-ledger__breakdown">
        ${sessionPrice > 0 ? `
          <div class="vst-master-ledger__row">
            <span>سعر الحصة${group ? ` (${escapeHTML(group.name)})` : ""}</span>
            <span>${formatMoney(sessionPrice)}</span>
          </div>` : ""}
        ${debt > 0 ? `
          <div class="vst-master-ledger__row vst-master-ledger__row--debt">
            <span>متأخرات سابقة</span>
            <span>${formatMoney(debt)}</span>
          </div>` : ""}
        ${charges.length ? charges.map((c) => `
          <div class="vst-master-ledger__row">
            <span>📋 ${escapeHTML(c.name)}</span>
            <span>${formatMoney(c.amount)}</span>
          </div>`).join("") : ""}
        <div class="vst-master-ledger__divider"></div>
        <div class="vst-master-ledger__row vst-master-ledger__row--total">
          <span>الإجمالي المطلوب</span>
          <span>${formatMoney(grandTotal)}</span>
        </div>
        ${wallet > 0 ? `
          <div class="vst-master-ledger__row" style="color:var(--success);">
            <span>💚 رصيد المحفظة المتاح</span>
            <span>−${formatMoney(wallet)}</span>
          </div>` : ""}
        <div class="vst-master-ledger__row vst-master-ledger__row--net">
          <span>المطلوب سداده الآن</span>
          <span class="vst-master-ledger__net">${formatMoney(netDue)}</span>
        </div>
      </div>

      <div class="vst-master-ledger__actions">
        ${netDue > 0 ? `
          <div class="vst-master-ledger__pay-row">
            <input type="number" class="input" id="vstSettleAmount" min="0" step="1" value="${netDue}" style="max-width:180px; font-size:18px; font-weight:800; text-align:center;">
            <button class="btn btn-success btn-lg" id="vstSettleAllBtn" style="font-size:16px; padding:14px 28px;">
              ✅ تسوية شاملة — ${formatMoney(netDue)}
            </button>
          </div>
          <div class="field__hint" style="margin-top:8px;">ادفع المبلغ المطلوب وسجّله هنا — النظام يصفّي كل المستحقات تلقائياً</div>
        ` : `
          <div class="vst-master-ledger__cleared">
            <span style="font-size:24px;">🎉</span>
            <div style="font-weight:700;">لا مبالغ مستحقة — الحساب مصفّى بالكامل</div>
          </div>
        `}
      </div>
    </div>` : `
    <div class="card card-pad" style="text-align:center; padding:30px;">
      <div style="font-size:36px; margin-bottom:8px;">🎉</div>
      <div style="font-weight:700; font-size:16px;">الحساب مصفّى — لا مبالغ مستحقة</div>
      <div class="text-muted" style="margin-top:4px;">${wallet > 0 ? `رصيد المحفظة: ${formatMoney(wallet)}` : "لا يوجد رصيد في المحفظة"}</div>
    </div>`}

    <div class="vst-finance-grid" style="margin-top:16px;">
      <div class="vst-finance-box vst-finance-box--wallet">
        <div class="vst-finance-box__icon">${icons.wallet}</div>
        <div class="vst-finance-box__value">${formatMoney(wallet)}</div>
        <div class="vst-finance-box__label">الرصيد المتاح</div>
      </div>
      <div class="vst-finance-box vst-finance-box--debt">
        <div class="vst-finance-box__icon">${icons.money}</div>
        <div class="vst-finance-box__value">${formatMoney(debt)}</div>
        <div class="vst-finance-box__label">المتأخرات</div>
      </div>
      <div class="vst-finance-box vst-finance-box--charges">
        <div class="vst-finance-box__icon">${icons.alert}</div>
        <div class="vst-finance-box__value">${formatMoney(totalCharges)}</div>
        <div class="vst-finance-box__label">مستحقات أخرى</div>
      </div>
      <div class="vst-finance-box vst-finance-box--session">
        <div class="vst-finance-box__icon">${icons.clipboard}</div>
        <div class="vst-finance-box__value">${formatMoney(sessionPrice)}</div>
        <div class="vst-finance-box__label">سعر الحصة</div>
      </div>
    </div>

    <div class="card card-pad" style="margin-top:16px;">
      <div class="card__head"><div class="card__title">إيداع في المحفظة</div></div>
      <div class="vst-deposit-form">
        <input type="number" class="input" id="vstDepositInput" min="1" step="1" placeholder="المبلغ (ج.م)" style="max-width:200px;">
        <button class="btn btn-success" id="vstDepositBtn">${icons.wallet} إيداع</button>
      </div>
    </div>

    ${charges.length ? `
    <div class="card card-pad" style="margin-top:16px;">
      <div class="card__head"><div class="card__title">مستحقات أخرى</div></div>
      ${charges.map((c) => `
        <div class="vst-detail-row">
          <span>${escapeHTML(c.name)} — ${formatMoney(c.amount)}</span>
          <button class="btn btn-success btn-sm vstSettleChargeBtn" data-id="${c.id}">تسوية</button>
        </div>
      `).join("")}
    </div>` : ""}

    <div class="card card-pad" style="margin-top:16px;">
      <div class="card__head"><div class="card__title">سجل الدفعات (${payments.length})</div></div>
      ${payments.length ? payments.map((p) => `
        <div class="vst-payment-row ${p.status === "paid" ? "is-paid" : "is-unpaid"}">
          <div class="vst-payment-row__info">
            <div class="vst-payment-row__note">${escapeHTML(p.note || "")}</div>
            <div class="vst-payment-row__date">${formatDateAr(p.date)} ${p.sessionDate ? `(حصة ${formatDateAr(p.sessionDate)})` : ""}</div>
          </div>
          <div class="vst-payment-row__amount">
            ${p.status === "paid" ? `<span style="color:var(--success);">+${formatMoney(p.amount)}</span>` : `<span style="color:var(--danger);">-${formatMoney(p.amount || 0)}</span>`}
            ${p.walletUsed > 0 ? `<span class="vst-payment-row__wallet">${icons.wallet} ${formatMoney(p.walletUsed)}</span>` : ""}
          </div>
        </div>
      `).join("") : `<div class="text-muted" style="padding:20px; text-align:center;">لا توجد دفعات مسجلة</div>`}
    </div>

    <div id="vstReceiptZone"></div>
  `;

  // ═══ زر التسوية الشاملة ═══
  const settleBtn = document.getElementById("vstSettleAllBtn");
  if (settleBtn) {
    settleBtn.addEventListener("click", async () => {
      const amount = Number(document.getElementById("vstSettleAmount").value || 0);
      if (amount <= 0) { toast("أدخل مبلغ صحيح", "warning"); return; }

      const ok = await confirmDialog({
        title: "تأكيد التسوية الشاملة",
        body: `هل تريد تسجيل <strong>${formatMoney(amount)}</strong> كتسوية شاملة لحساب <strong>${escapeHTML(student.name)}</strong>؟<br><br>سيتم: خصم من المحفظة → سداد المستحقات → سداد المتأخرات → سداد الحصة${amount > netDue ? `<br><span style="color:var(--primary);">الفائض ${formatMoney(amount - netDue)} سيُضاف للمحفظة</span>` : ""}`,
        confirmText: `تأكيد — ${formatMoney(amount)}`,
        tone: "success",
      });
      if (!ok) return;

      const result = settleAllDebts(student.id, amount);
      if (!result) { toast("فشلت عملية التسوية", "error"); return; }

      toast(`✅ تم التسوية الشاملة — الإجمالي: ${formatMoney(result.receipt.breakdown.grandTotal)}`, "success");

      // عرض الإيصال
      const receiptZone = document.getElementById("vstReceiptZone");
      if (receiptZone) {
        receiptZone.innerHTML = renderReceiptHTML(result.receipt);
      }

      // إرسال واتساب بالإيصال
      try {
        if (student.parentPhone) {
          const r = result.receipt;
          const waMsg = [
            `✅ *إيصال تسوية شاملة*`,
            `الطالب: ${r.studentName} (${r.studentCode})`,
            `المجموعة: ${r.groupName}`,
            `التاريخ: ${r.date} — ${r.time}`,
            ``,
            r.breakdown.sessionDue > 0 ? `سعر الحصة: ${formatMoney(r.breakdown.sessionDue)}` : "",
            r.breakdown.priorBalance > 0 ? `متأخرات سابقة: ${formatMoney(r.breakdown.priorBalance)}` : "",
            r.breakdown.chargesTotal > 0 ? `مستحقات أخرى: ${formatMoney(r.breakdown.chargesTotal)}` : "",
            `━━━━━━━━━━`,
            `الإجمالي: ${formatMoney(r.breakdown.grandTotal)}`,
            r.breakdown.walletUsed > 0 ? `خصم محفظة: ${formatMoney(r.breakdown.walletUsed)}` : "",
            `المدفوع كاش: ${formatMoney(r.breakdown.cashPaid)}`,
            r.breakdown.excessToWallet > 0 ? `فائض للمحفظة: ${formatMoney(r.breakdown.excessToWallet)}` : "",
            ``,
            `✅ لا مبالغ مستحقة`,
          ].filter(Boolean).join("\n");
          openWhatsApp(student.parentPhone, waMsg);
        }
      } catch (e) { /* popup blocker */ }

      renderStudentZone();
    });
  }

  // ═══ أزرار تسوية المستحقات الفردية ═══
  box.querySelectorAll(".vstSettleChargeBtn").forEach((btn) =>
    btn.addEventListener("click", () => {
      const charge = settleExtraCharge(btn.dataset.id);
      if (charge) toast(`تم تسوية "${charge.name}"`, "success");
      renderStudentZone();
    })
  );

  // ═══ زر الإيداع ═══
  document.getElementById("vstDepositBtn")?.addEventListener("click", () => {
    const amount = Number(document.getElementById("vstDepositInput").value || 0);
    if (amount <= 0) { toast("أدخل مبلغ صحيح", "warning"); return; }
    const result = addWalletDeposit(student.id, amount);
    if (!result) { toast("فشلت عملية الإيداع", "error"); return; }
    let msg = `تم إيداع ${formatMoney(amount)}`;
    if (result.debtCovered > 0) msg += ` — تغطية متأخرات: ${formatMoney(result.debtCovered)}`;
    if (result.walletDeposit > 0) msg += ` — رصيد جديد: ${formatMoney(result.newWalletBalance)}`;
    toast(msg, "success");
    try {
      if (student.parentPhone) openWhatsApp(student.parentPhone, renderTemplate("wallet_deposit_reception", {
        studentName: student.name, amount: formatMoney(amount),
        newWalletBalance: formatMoney(result.newWalletBalance), centerName: "سنتر الفارس التعليمي",
      }));
    } catch (e) { /* popup blocker */ }
    renderStudentZone();
  });
}

// ═══════════════════════════════════════════════════════════
//  تحليل مقارن (Comparative Analytics + Radar Chart)
// ═══════════════════════════════════════════════════════════

function computeComparativeAnalytics(student) {
  const allExams = getExams();
  const studentExams = allExams.filter((e) =>
    e.results?.some((r) => r.studentId === student.id)
  );

  if (!studentExams.length) return null;

  // حساب الإحصائيات لكل امتحان
  const examStats = studentExams.map((exam) => {
    const scored = exam.results.filter((r) => !r.absent && r.score != null);
    const allScores = scored.map((r) => r.score).sort((a, b) => a - b);
    const studentResult = exam.results.find((r) => r.studentId === student.id);
    const studentScore = studentResult?.score ?? null;
    const isAbsent = studentResult?.absent || false;

    const groupAvg = allScores.length
      ? allScores.reduce((s, v) => s + v, 0) / allScores.length
      : 0;
    const groupAvgPct = Math.round((groupAvg / exam.maxScore) * 100);
    const highest = allScores.length ? Math.max(...allScores) : 0;
    const lowest = allScores.length ? Math.min(...allScores) : 0;

    let percentile = null;
    let studentPct = null;
    if (!isAbsent && studentScore != null) {
      studentPct = Math.round((studentScore / exam.maxScore) * 100);
      const rank = allScores.filter((s) => s <= studentScore).length;
      percentile = Math.round((rank / allScores.length) * 100);
    }

    return {
      id: exam.id, title: exam.title, date: exam.date,
      maxScore: exam.maxScore,
      studentScore, studentPct, isAbsent,
      groupAvg: Math.round(groupAvg), groupAvgPct,
      highest, lowest,
      totalScored: scored.length,
      percentile,
    };
  }).sort((a, b) => a.date.localeCompare(b.date));

  // الترتيب العام (متوسط النسب المئوية)
  const scoredExams = examStats.filter((e) => e.studentPct != null);
  const overallStudentAvg = scoredExams.length
    ? Math.round(scoredExams.reduce((s, e) => s + e.studentPct, 0) / scoredExams.length)
    : 0;
  const overallGroupAvg = scoredExams.length
    ? Math.round(scoredExams.reduce((s, e) => s + e.groupAvgPct, 0) / scoredExams.length)
    : 0;

  // حساب الترتيب العام (ما مجموع كل الدرجات المئوية للاعبين الآخرين)
  let overallPercentile = null;
  if (scoredExams.length) {
    const allStudentIds = new Set();
    scoredExams.forEach((es) => {
      const exam = allExams.find((e) => e.id === es.id);
      if (exam) exam.results.filter((r) => !r.absent).forEach((r) => allStudentIds.add(r.studentId));
    });
    let wins = 0, total = 0;
    allStudentIds.forEach((sid) => {
      if (sid === student.id) return;
      let myTotal = 0, otherTotal = 0, cnt = 0;
      scoredExams.forEach((es) => {
        const exam = allExams.find((e) => e.id === es.id);
        const other = exam?.results.find((r) => r.studentId === sid);
        if (other && !other.absent && other.score != null) {
          myTotal += es.studentPct;
          otherTotal += Math.round((other.score / es.maxScore) * 100);
          cnt++;
        }
      });
      if (cnt > 0) {
        total++;
        if (myTotal >= otherTotal) wins++;
      }
    });
    overallPercentile = total > 0 ? Math.round((wins / total) * 100) : null;
  }

  return { examStats, overallStudentAvg, overallGroupAvg, overallPercentile };
}

function generateComparativeStatements(analytics) {
  if (!analytics) return [];
  const stmts = [];

  if (analytics.overallPercentile != null) {
    const p = analytics.overallPercentile;
    if (p >= 90)      stmts.push({ tone: "success", emoji: "🏆", text: `ابنك يتفوق على ${p}% من زملائه — مستوى ممتاز` });
    else if (p >= 75) stmts.push({ tone: "success", emoji: "🌟", text: `ابنك يتفوق على ${p}% من زملائه — مستوى جيد جداً` });
    else if (p >= 50) stmts.push({ tone: "primary", emoji: "📊", text: `ابنك في المرتبة ${p}% — مستوى جيد` });
    else if (p >= 25) stmts.push({ tone: "warning", emoji: "⚠️", text: `ابنك يتفوق على ${p}% فقط من زملائه — يحتاج متابعة` });
    else              stmts.push({ tone: "danger",  emoji: "🔴", text: `ابنك في آخر ${100 - p}% — يحتاج تدخل عاجل` });
  }

  if (analytics.overallStudentAvg > analytics.overallGroupAvg + 10) {
    stmts.push({ tone: "success", emoji: "📈", text: `متوسط درجات ابنك (${analytics.overallStudentAvg}%) أعلى من متوسط المجموعة (${analytics.overallGroupAvg}%)` });
  } else if (analytics.overallStudentAvg < analytics.overallGroupAvg - 10) {
    stmts.push({ tone: "warning", emoji: "📉", text: `متوسط درجات ابنك (${analytics.overallStudentAvg}%) أقل من متوسط المجموعة (${analytics.overallGroupAvg}%)` });
  }

  // أفضل وأسوأ امتحان
  const scored = analytics.examStats.filter((e) => e.studentPct != null);
  if (scored.length >= 2) {
    const best = scored.reduce((a, b) => a.studentPct > b.studentPct ? a : b);
    const worst = scored.reduce((a, b) => a.studentPct < b.studentPct ? a : b);
    if (best.id !== worst.id) {
      stmts.push({ tone: "primary", emoji: "🎯", text: `أفضل درجة: ${best.title} (${best.studentPct}%) — وأسوأ: ${worst.title} (${worst.studentPct}%)` });
    }
  }

  // تطور الأداء
  if (scored.length >= 2) {
    const recent = scored.slice(-1)[0];
    const prev = scored.slice(-2, -1)[0];
    if (recent.studentPct > prev.studentPct) {
      stmts.push({ tone: "success", emoji: "⬆️", text: `تحسن في آخر امتحان: ${prev.studentPct}% → ${recent.studentPct}%` });
    } else if (recent.studentPct < prev.studentPct) {
      stmts.push({ tone: "danger", emoji: "⬇️", text: `انخفاض في آخر امتحان: ${prev.studentPct}% → ${recent.studentPct}%` });
    }
  }

  return stmts;
}

/** رسم Radar Chart بـ SVG خالص — بدون مكتبات خارجية */
function renderRadarChartSVG(analytics, size = 280) {
  const exams = analytics.examStats.filter((e) => e.studentPct != null);
  if (exams.length < 3) return null; // Radar مش معقول لأقل من 3 محاور

  const cx = size / 2, cy = size / 2, r = size / 2 - 36;
  const n = exams.length;
  const angleStep = (2 * Math.PI) / n;
  const startAngle = -Math.PI / 2; // يبدأ من الأعلى

  // نقاط الشبكة (حلقات 25%, 50%, 75%, 100%)
  const rings = [25, 50, 75, 100];

  function polarToCartesian(angle, radius) {
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  }

  function buildPolygonPoints(values) {
    return values.map((v, i) => {
      const angle = startAngle + i * angleStep;
      const dist = (v / 100) * r;
      const pt = polarToCartesian(angle, dist);
      return `${pt.x},${pt.y}`;
    }).join(" ");
  }

  const studentValues = exams.map((e) => e.studentPct);
  const groupValues = exams.map((e) => e.groupAvgPct);

  // خطوط المحاور
  const axesHTML = exams.map((_, i) => {
    const angle = startAngle + i * angleStep;
    const end = polarToCartesian(angle, r);
    return `<line x1="${cx}" y1="${cy}" x2="${end.x}" y2="${end.y}" stroke="var(--border)" stroke-width="1"/>`;
  }).join("");

  // حلقات الشبكة
  const ringsHTML = rings.map((pct) => {
    const dist = (pct / 100) * r;
    const points = Array.from({ length: n }, (_, i) => {
      const angle = startAngle + i * angleStep;
      const pt = polarToCartesian(angle, dist);
      return `${pt.x},${pt.y}`;
    }).join(" ");
    return `<polygon points="${points}" fill="none" stroke="var(--border)" stroke-width="0.5" stroke-dasharray="3,3"/>`;
  }).join("");

  // تسميات المحاور (عناوين الامتحانات — اختصار)
  const labelsHTML = exams.map((e, i) => {
    const angle = startAngle + i * angleStep;
    const labelR = r + 22;
    const pt = polarToCartesian(angle, labelR);
    const shortTitle = e.title.length > 16 ? e.title.slice(0, 14) + "…" : e.title;
    const anchor = pt.x < cx - 5 ? "end" : pt.x > cx + 5 ? "start" : "middle";
    return `<text x="${pt.x}" y="${pt.y}" text-anchor="${anchor}" dominant-baseline="middle" fill="var(--muted)" font-size="10" font-weight="600">${escapeHTML(shortTitle)}</text>`;
  }).join("");

  // متوسط المجموعة (أزرق شفاف)
  const groupPolygon = `<polygon points="${buildPolygonPoints(groupValues)}" fill="rgba(102,126,234,0.15)" stroke="var(--primary)" stroke-width="2" stroke-dasharray="4,3"/>`;

  // درجات الطالب (أخضر متدرج)
  const studentPolygon = `<polygon points="${buildPolygonPoints(studentValues)}" fill="rgba(16,185,129,0.2)" stroke="var(--success)" stroke-width="2.5"/>`;

  // نقاط الطالب
  const studentDots = studentValues.map((v, i) => {
    const angle = startAngle + i * angleStep;
    const dist = (v / 100) * r;
    const pt = polarToCartesian(angle, dist);
    return `<circle cx="${pt.x}" cy="${pt.y}" r="4" fill="var(--success)" stroke="#fff" stroke-width="2"/>`;
  }).join("");

  // نقاط المجموعة
  const groupDots = groupValues.map((v, i) => {
    const angle = startAngle + i * angleStep;
    const dist = (v / 100) * r;
    const pt = polarToCartesian(angle, dist);
    return `<circle cx="${pt.x}" cy="${pt.y}" r="3" fill="var(--primary)" stroke="#fff" stroke-width="1.5"/>`;
  }).join("");

  return `
    <svg viewBox="0 0 ${size} ${size}" class="vst-radar-svg">
      ${ringsHTML}
      ${axesHTML}
      ${groupPolygon}
      ${studentPolygon}
      ${studentDots}
      ${groupDots}
      ${labelsHTML}
    </svg>
    <div class="vst-radar-legend">
      <span class="vst-radar-legend__item"><span class="vst-radar-legend__dot" style="background:var(--success);"></span> ابنك</span>
      <span class="vst-radar-legend__item"><span class="vst-radar-legend__dot" style="background:var(--primary);"></span> متوسط المجموعة</span>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════
//  تبويب ٤ — الدرجات والحضور + التحليل المقارن
// ═══════════════════════════════════════════════════════════

function renderGradesTab(box, student) {
  const attendance = getAttendance()
    .filter((a) => a.studentId === student.id && a.category === "attendance")
    .sort((a, b) => b.date.localeCompare(a.date));
  const statuses = getStudentStatuses();

  const exams = getExams().filter((e) =>
    e.results?.some((r) => r.studentId === student.id)
  ).map((e) => {
    const result = e.results.find((r) => r.studentId === student.id);
    return { ...e, score: result?.score, absent: result?.absent, excused: result?.excused };
  }).sort((a, b) => b.date.localeCompare(a.date));

  const recentAtt = attendance.slice(0, 20);

  // ═══ التحليل المقارن ═══
  const analytics = computeComparativeAnalytics(student);
  const statements = analytics ? generateComparativeStatements(analytics) : [];
  const radarSVG = analytics ? renderRadarChartSVG(analytics) : null;

  box.innerHTML = `
    ${analytics && statements.length ? `
    <div class="card card-pad vst-analytics-card">
      <div class="card__head"><div class="card__title">📊 التحليل المقارن — كيف يتفوق ابنك مقارنة بزملائه</div></div>

      <div class="vst-analytics-summary">
        <div class="vst-analytics-kpi">
          <div class="vst-analytics-kpi__value" style="color:${analytics.overallStudentAvg >= analytics.overallGroupAvg ? "var(--success)" : "var(--danger)"};">${analytics.overallStudentAvg}%</div>
          <div class="vst-analytics-kpi__label">متوسط ابنك</div>
        </div>
        <div class="vst-analytics-kpi">
          <div class="vst-analytics-kpi__value">${analytics.overallGroupAvg}%</div>
          <div class="vst-analytics-kpi__label">متوسط المجموعة</div>
        </div>
        <div class="vst-analytics-kpi">
          <div class="vst-analytics-kpi__value" style="color:${(analytics.overallPercentile || 0) >= 50 ? "var(--success)" : "var(--warning)"};">${analytics.overallPercentile != null ? `#${Math.round((100 - analytics.overallPercentile) / 100 * exams.length) + 1}` : "—"}</div>
          <div class="vst-analytics-kpi__label">الترتيب من ${exams.length} طالب</div>
        </div>
      </div>

      <div class="vst-statements">
        ${statements.map((s) => `
          <div class="vst-statement vst-statement--${s.tone}">
            <span class="vst-statement__emoji">${s.emoji}</span>
            <span>${escapeHTML(s.text)}</span>
          </div>
        `).join("")}
      </div>
    </div>` : ""}

    ${radarSVG ? `
    <div class="card card-pad" style="margin-top:16px;">
      <div class="card__head"><div class="card__title">🎯 مقارنة أداء ابنك بمتوسط المجموعة</div></div>
      <div class="vst-radar-wrap">
        ${radarSVG}
      </div>
      <div class="vst-radar-details">
        ${analytics.examStats.filter((e) => e.studentPct != null).map((e) => {
          const diff = e.studentPct - e.groupAvgPct;
          const diffColor = diff > 0 ? "var(--success)" : diff < 0 ? "var(--danger)" : "var(--muted)";
          const diffSign = diff > 0 ? "+" : "";
          return `
            <div class="vst-radar-detail">
              <span class="vst-radar-detail__title">${escapeHTML(e.title)}</span>
              <span class="vst-radar-detail__scores">
                <strong>${e.studentPct}%</strong> <span style="color:var(--muted);">vs</span> <span style="color:var(--primary);">${e.groupAvgPct}%</span>
                <span style="color:${diffColor}; font-weight:700; margin-right:4px;">(${diffSign}${diff}%)</span>
              </span>
            </div>`;
        }).join("")}
      </div>
    </div>` : ""}

    <div class="card card-pad" style="margin-top:16px;">
      <div class="card__head"><div class="card__title">الدرجات التفصيلية</div></div>
      ${exams.length ? `
        <div class="vst-table">
          <div class="vst-table__header vst-table__row--exams-plus">
            <span>التاريخ</span><span>الامتحان</span><span>النتيجة</span><span>الترتيب</span>
          </div>
          ${exams.map((e) => {
            let scoreDisplay = e.score ?? "—";
            let scoreColor = "";
            if (e.absent) { scoreDisplay = "غائب"; scoreColor = "var(--danger)"; }
            else if (e.excused) { scoreDisplay = "بعذر"; scoreColor = "var(--warning)"; }
            else if (e.maxScore && e.score != null) {
              const pct = Math.round((e.score / e.maxScore) * 100);
              scoreColor = pct >= 60 ? "var(--success)" : pct >= 40 ? "var(--warning)" : "var(--danger)";
              scoreDisplay = `${e.score}/${e.maxScore} (${pct}%)`;
            }
            const examAnalytics = analytics?.examStats.find((a) => a.id === e.id);
            let rankDisplay = "—";
            if (examAnalytics?.percentile != null) {
              const p = examAnalytics.percentile;
              const rank = Math.round((100 - p) / 100 * examAnalytics.totalScored) + 1;
              rankDisplay = `#${rank}/${examAnalytics.totalScored}`;
            }
            return `
              <div class="vst-table__row vst-table__row--exams-plus">
                <span>${formatDateAr(e.date)}</span>
                <span>${escapeHTML(e.title || "")}</span>
                <span style="font-weight:700; color:${scoreColor};">${scoreDisplay}</span>
                <span style="font-weight:600; font-size:12px;">${rankDisplay}</span>
              </div>`;
          }).join("")}
        </div>` : `<div class="text-muted" style="padding:20px; text-align:center;">لا توجد درجات مسجلة</div>`}
    </div>

    <div class="card card-pad" style="margin-top:16px;">
      <div class="card__head"><div class="card__title">سجل الحضور (${recentAtt.length} آخر)</div></div>
      ${recentAtt.length ? `
        <div class="vst-table">
          <div class="vst-table__header vst-table__row--att">
            <span>التاريخ</span><span>الحالة</span><span>الوقت</span>
          </div>
          ${recentAtt.map((a) => {
            const st = statuses.find((s) => s.id === a.statusId);
            return `
              <div class="vst-table__row vst-table__row--att">
                <span>${formatDateAr(a.date)}</span>
                <span class="badge badge-${st?.tone || "neutral"}" style="font-size:11px;"><span class="badge-dot"></span>${escapeHTML(st?.name || "—")}</span>
                <span>${a.time || "—"}</span>
              </div>`;
          }).join("")}
        </div>` : `<div class="text-muted" style="padding:20px; text-align:center;">لا توجد سجلات حضور</div>`}
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════
//  تبويب ٥ — المتابعة
// ═══════════════════════════════════════════════════════════

function renderFollowupTab(box, student) {
  const logs = getFollowupLogs().filter((l) => l.studentId === student.id).reverse().slice(0, 30);

  box.innerHTML = `
    <div class="vst-followup-actions">
      <button class="btn btn-primary" id="vstAddNoteBtn">${icons.clipboard} إضافة ملاحظة</button>
      <button class="btn btn-success" id="vstSendReportBtn">${icons.whatsapp} إرسال تقرير متابعة شهري</button>
    </div>

    <div class="card card-pad" style="margin-top:16px;">
      <div class="card__head"><div class="card__title">سجل ملاحظات المتابعة (${logs.length})</div></div>
      ${logs.length ? logs.map((l) => `
        <div class="vst-followup-log">
          <div class="vst-followup-log__date">${formatDateAr(l.date)} — ${l.time} <span style="color:var(--muted); font-size:11px;">${escapeHTML(l.writtenBy || "")}</span></div>
          <div class="vst-followup-log__text">${escapeHTML(l.text)}</div>
        </div>
      `).join("") : `<div class="text-muted" style="padding:20px; text-align:center;">لا توجد ملاحظات متابعة مسجلة</div>`}
    </div>
  `;

  document.getElementById("vstAddNoteBtn").addEventListener("click", () => openAddNoteModal(student));
  document.getElementById("vstSendReportBtn").addEventListener("click", () => sendFollowupWhatsApp(student));
}

async function openAddNoteModal(student) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const currentTime = now.toTimeString().slice(0, 5);

  const lastLog = getLastFollowupLog(student.id);

  const bodyHTML = `
    ${lastLog ? `
      <div style="margin-bottom:14px; padding:10px; background:var(--bg); border-radius:8px; font-size:13px;">
        <div style="font-weight:700; margin-bottom:4px;">آخر ملاحظة — ${formatDateAr(lastLog.date)} ${lastLog.time}</div>
        <div style="color:var(--muted);">${escapeHTML(lastLog.text)}</div>
      </div>
    ` : ""}
    <div class="field">
      <label class="field__label">تاريخ الاتصال</label>
      <input class="input" type="date" name="date" value="${today}" required>
    </div>
    <div class="field">
      <label class="field__label">وقت الاتصال</label>
      <input class="input" type="time" name="time" value="${currentTime}" required>
    </div>
    <div class="field">
      <label class="field__label">نتيجة الاتصال / الملاحظة</label>
      <textarea class="input" name="text" rows="4" required placeholder="مثال: تم التواصل مع ولي أمر الطالب، أبلغ عن سبب الغياب..."></textarea>
    </div>
  `;

  const result = await formModal({
    title: `ملاحظة متابعة — ${student.name}`,
    bodyHTML,
    submitText: "حفظ الملاحظة",
  });

  if (!result || !result.text.trim()) return;

  addFollowupLog(student.id, result.text.trim(), { date: result.date, time: result.time });
  toast("تم حفظ الملاحظة بنجاح", "success");
  renderStudentZone();
}

async function sendFollowupWhatsApp(student) {
  if (!student.parentPhone) { toast("لا يوجد تليفون لولي الأمر", "warning"); return; }

  const attendance = getAttendance().filter((a) => a.studentId === student.id);
  const exams = getExams()
    .flatMap((e) => e.results.filter((r) => r.studentId === student.id).map((r) => ({ ...r, title: e.title, date: e.date, maxScore: e.maxScore })));
  const extraCharges = getExtraCharges().filter((c) => c.studentId === student.id);

  const defaultMessage = buildMonthlyFollowupMessage({ student, attendance, exams, extraCharges });

  const message = await whatsappPreviewDialog({
    title: "إرسال تقرير متابعة شهرية",
    recipientLabel: `ولى أمر ${student.name} (${student.parentPhone})`,
    defaultMessage,
  });
  if (!message) return;

  openWhatsApp(student.parentPhone, message);
}

// ═══════════════════════════════════════════════════════════
//  تبويب ٦ — التواصل والجدول
// ═══════════════════════════════════════════════════════════

function renderContactTab(box, student) {
  const wallet = Number(student.walletBalance || 0);
  const debt = Number(student.lateBalance || 0);
  const group = findGroup(getGroups(), student.groupId);

  const summaryMessage = renderTemplate("gen_summary", {
    studentName: student.name, wallet: formatMoney(wallet),
    debt: formatMoney(debt), groupName: group?.name || "—",
    centerName: "سنتر الفارس التعليمي",
  });

  box.innerHTML = `
    <div class="card card-pad">
      <div class="card__head"><div class="card__title">بيانات التواصل</div></div>
      ${detailRow("تليفون الطالب", student.phone || "—")}
      ${detailRow("تليفون ولي الأمر", student.parentPhone || "—")}
      <div style="margin-top:14px; display:flex; flex-direction:column; gap:8px;">
        <button class="btn btn-success" id="vstWaSummaryBtn">${icons.whatsapp} إرسال ملخص واتساب</button>
        <button class="btn btn-outline" id="vstWaCustomBtn">${icons.whatsapp} رسالة مخصصة</button>
        <button class="btn btn-outline" id="vstWaCallBtn">📞 اتصال هاتفي بولي الأمر</button>
      </div>
    </div>

    <div class="card card-pad" style="margin-top:16px;">
      <div class="card__head"><div class="card__title">جدول حصص الطالب</div></div>
      ${group ? `
        <div class="vst-schedule">
          ${WEEKDAY_OPTIONS.map((w) => {
            const isScheduled = (group.days || []).includes(w.ar);
            return `
              <div class="vst-schedule__day ${isScheduled ? "is-active" : ""}">
                <div class="vst-schedule__day-name">${w.ar}</div>
                ${isScheduled
                  ? `<div class="vst-schedule__day-time">${formatTimeAr(group.time)}</div>`
                  : `<div class="vst-schedule__day-time" style="color:var(--muted);">—</div>`}
              </div>`;
          }).join("")}
        </div>
        <div style="margin-top:12px;">
          ${detailRow("المدة", `${group.duration || 90} دقيقة`)}
          ${detailRow("السعر", formatMoney(group.sessionPrice || 0))}
        </div>
      ` : `<div class="text-muted" style="padding:20px; text-align:center;">لا توجد بيانات للمجموعة</div>`}
    </div>
  `;

  document.getElementById("vstWaSummaryBtn").addEventListener("click", () => {
    if (!student.parentPhone) { toast("لا يوجد تليفون لولي الأمر", "warning"); return; }
    try { openWhatsApp(student.parentPhone, summaryMessage); } catch (e) { /* popup blocker */ }
  });

  document.getElementById("vstWaCustomBtn").addEventListener("click", () => {
    if (!student.parentPhone) { toast("لا يوجد تليفون لولي الأمر", "warning"); return; }
    try {
      openWhatsApp(student.parentPhone, renderTemplate("gen_custom_opener", {
        studentName: student.name, centerName: "سنتر الفارس التعليمي",
      }));
    } catch (e) { /* popup blocker */ }
  });

  document.getElementById("vstWaCallBtn").addEventListener("click", () => {
    if (student.parentPhone) {
      window.open(`tel:${student.parentPhone}`, "_self");
    } else {
      toast("لا يوجد تليفون لولي الأمر", "warning");
    }
  });
}

// ═══════════════════════════════════════════════════════════
//  تبويب ٧ — الخط الزمني (Story Timeline)
// ═══════════════════════════════════════════════════════════

function buildTimelineEvents(student) {
  const events = [];
  const statuses = getStudentStatuses();
  const statusMap = new Map(statuses.map((s) => [s.id, s]));

  // --- 1. سجلات الحضور ---
  getAttendance()
    .filter((a) => a.studentId === student.id)
    .forEach((a) => {
      const st = statusMap.get(a.statusId);
      if (!st) return;
      const isPaid = st.payment === "paid";
      const isExcused = st.presence === "excused";
      const isAbsent = st.presence === "absent";
      let tone = "primary", emoji = "📋";
      if (isPaid)      { tone = "success"; emoji = "🟢"; }
      else if (isExcused) { tone = "warning"; emoji = "🟡"; }
      else if (isAbsent)  { tone = "danger";  emoji = "🔴"; }
      events.push({
        date: a.date, time: a.time || "",
        type: "attendance", tone, emoji,
        icon: isPaid ? icons.check : isExcused ? icons.info : icons.x,
        title: st.name,
        desc: isPaid
          ? `حضر وسجّل دفع${a.amount ? ` (${formatMoney(a.amount)})` : ""}`
          : isExcused ? "حضر بإذن مسبق"
          : isAbsent ? "غاب من الحصة" : st.name,
      });
    });

  // --- 2. الدفعات ---
  getPayments()
    .filter((p) => p.studentId === student.id)
    .forEach((p) => {
      const isPaid = p.status === "paid";
      events.push({
        date: p.date, time: "",
        type: "payment", tone: isPaid ? "success" : "danger",
        emoji: isPaid ? "💰" : "💸",
        icon: isPaid ? icons.wallet : icons.money,
        title: isPaid ? "دفعة" : "مبلغ غير مدفوع",
        desc: `${isPaid ? "دفع" : "لم يدفع"} ${formatMoney(p.amount || 0)}${p.sessionDate ? ` (حصة ${formatDateAr(p.sessionDate)})` : ""}${p.note ? ` — ${p.note}` : ""}`,
      });
    });

  // --- 3. الامتحانات ---
  getExams()
    .filter((e) => e.results?.some((r) => r.studentId === student.id))
    .forEach((e) => {
      const r = e.results.find((res) => res.studentId === student.id);
      if (!r) return;
      let tone = "primary", emoji = "📝", desc = "";
      if (r.absent) {
        tone = "danger"; emoji = "🔴"; desc = `غائب عن ${e.title}`;
      } else if (r.excused) {
        tone = "warning"; emoji = "🟡"; desc = `بعذر من ${e.title}`;
      } else if (r.score != null && e.maxScore) {
        const pct = Math.round((r.score / e.maxScore) * 100);
        if (pct >= 80)      { tone = "success"; emoji = "🏆"; }
        else if (pct >= 60) { tone = "primary"; emoji = "📝"; }
        else if (pct >= 40) { tone = "warning"; emoji = "⚠️"; }
        else                { tone = "danger";  emoji = "❌"; }
        desc = `${e.title}: ${r.score}/${e.maxScore} (${pct}%)`;
      } else {
        desc = `${e.title}: ${r.score ?? "—"}`;
      }
      events.push({ date: e.date, time: "", type: "exam", tone, emoji, icon: icons.chart, title: `امتحان: ${e.title}`, desc });
    });

  // --- 4. ملاحظات المتابعة ---
  getFollowupLogs()
    .filter((l) => l.studentId === student.id)
    .forEach((l) => {
      events.push({
        date: l.date, time: l.time || "",
        type: "followup", tone: "primary", emoji: "💬",
        icon: icons.clipboard, title: "ملاحظة متابعة",
        desc: l.text, sub: l.writtenBy ? `بواسطة: ${l.writtenBy}` : "",
      });
    });

  // --- 5. حركات المحفظة ---
  getWalletTransactions()
    .filter((t) => t.studentId === student.id)
    .forEach((t) => {
      const isDeposit = (t.amount || 0) > 0;
      events.push({
        date: t.date || todayISO(), time: t.time || "",
        type: "wallet", tone: isDeposit ? "success" : "warning",
        emoji: isDeposit ? "🏦" : "📤",
        icon: icons.wallet,
        title: isDeposit ? "إيداع في المحفظة" : "خصم من المحفظة",
        desc: `${isDeposit ? "إيداع" : "خصم"} ${formatMoney(Math.abs(t.amount || 0))}${t.note ? ` — ${t.note}` : ""}`,
      });
    });

  // --- 6. المستحقات المالية ---
  getExtraCharges()
    .filter((c) => c.studentId === student.id)
    .forEach((c) => {
      const isSettled = c.status === "paid";
      events.push({
        date: c.date || todayISO(), time: "",
        type: "charge", tone: isSettled ? "success" : "warning",
        emoji: isSettled ? "✅" : "💲",
        icon: isSettled ? icons.check : icons.alert,
        title: `مستحق: ${c.name}`,
        desc: `${formatMoney(c.amount)} — ${isSettled ? "تمت التسوية" : "لم تُسَوَّ بعد"}`,
      });
    });

  // --- 7. حالة القفل ---
  if (isStudentLocked(student)) {
    events.push({
      date: todayISO(), time: "",
      type: "lock", tone: "danger", emoji: "🔒",
      icon: icons.alert,
      title: "الطالب مقفول حالياً",
      desc: "مقفول بسبب غياب متكرر — لا يمكن تسجيل حضور حتى الفك",
    });
  }

  return events;
}

function renderTimelineTab(box, student) {
  const events = buildTimelineEvents(student);
  events.sort((a, b) => {
    const da = a.date + (a.time || "99:99");
    const db = b.date + (b.time || "99:99");
    return db.localeCompare(da);  // الأحدث أولاً
  });

  // تجميع بالتاريخ
  const grouped = new Map();
  events.forEach((ev) => {
    if (!grouped.has(ev.date)) grouped.set(ev.date, []);
    grouped.get(ev.date).push(ev);
  });

  if (!events.length) {
    box.innerHTML = `
      <div class="card card-pad" style="text-align:center; padding:40px;">
        <div style="font-size:48px; margin-bottom:12px;">📭</div>
        <div style="font-weight:700; font-size:16px; margin-bottom:4px;">لا توجد أحداث مسجلة</div>
        <div class="text-muted">لم يُسجَّل أي حدث بعد لهذا الطالب</div>
      </div>`;
    return;
  }

  // إحصائيات سريعة
  const attCount   = events.filter((e) => e.type === "attendance").length;
  const examCount  = events.filter((e) => e.type === "exam").length;
  const payCount   = events.filter((e) => e.type === "payment").length;
  const followCount= events.filter((e) => e.type === "followup").length;

  box.innerHTML = `
    <div class="vst-tl-stats">
      <div class="vst-tl-stat">
        <div class="vst-tl-stat__num">${events.length}</div>
        <div class="vst-tl-stat__label">إجمالي الأحداث</div>
      </div>
      <div class="vst-tl-stat">
        <div class="vst-tl-stat__num">${attCount}</div>
        <div class="vst-tl-stat__label">حدث حضور</div>
      </div>
      <div class="vst-tl-stat">
        <div class="vst-tl-stat__num">${examCount}</div>
        <div class="vst-tl-stat__label">امتحان</div>
      </div>
      <div class="vst-tl-stat">
        <div class="vst-tl-stat__num">${followCount}</div>
        <div class="vst-tl-stat__label">ملاحظة</div>
      </div>
    </div>

    <div class="vst-timeline">
      ${Array.from(grouped.entries()).map(([date, dayEvents]) => `
        <div class="vst-tl-date">
          <span class="vst-tl-date__dot"></span>
          ${formatDateAr(date)}
        </div>
        ${dayEvents.map((ev) => `
          <div class="vst-tl-event vst-tl-event--${ev.tone}">
            <div class="vst-tl-event__dot"></div>
            <div class="vst-tl-event__card">
              <div class="vst-tl-event__head">
                <span class="vst-tl-event__emoji">${ev.emoji}</span>
                <span class="vst-tl-event__title">${escapeHTML(ev.title)}</span>
                ${ev.time ? `<span class="vst-tl-event__time">${ev.time}</span>` : ""}
              </div>
              <div class="vst-tl-event__body">${escapeHTML(ev.desc)}</div>
              ${ev.sub ? `<div class="vst-tl-event__sub">${escapeHTML(ev.sub)}</div>` : ""}
            </div>
          </div>
        `).join("")}
      `).join("")}
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════
//  CSS — كل أنماط الصفحة
// ═══════════════════════════════════════════════════════════

const style = document.createElement("style");
style.textContent = `
  /* --- Search --- */
  .vst-search { position: relative; margin-bottom: 20px; }
  .vst-search__icon { position: absolute; right: 16px; top: 50%; transform: translateY(-50%); color: var(--muted); width: 20px; height: 20px; pointer-events: none; }
  .vst-search__input {
    width: 100%; padding: 14px 44px 14px 16px; border-radius: 12px; border: 2px solid var(--border);
    background: var(--bg); font-size: 16px; font-family: inherit; color: var(--text); outline: none;
    transition: border-color .2s;
  }
  .vst-search__input:focus { border-color: var(--primary); }
  .vst-search__results {
    position: absolute; top: calc(100% + 4px); right: 0; left: 0; z-index: 100;
    background: var(--bg); border: 1px solid var(--border); border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,.12); max-height: 380px; overflow-y: auto;
    display: none;
  }
  .vst-search__empty { padding: 20px; text-align: center; color: var(--muted); font-size: 13px; }
  .vst-search__item {
    display: flex; align-items: center; gap: 12px; padding: 12px 16px; cursor: pointer;
    border-bottom: 1px solid var(--border); transition: background .15s;
  }
  .vst-search__item:last-child { border-bottom: none; }
  .vst-search__item:hover { background: var(--bg-2); }
  .vst-search__item-code {
    width: 40px; height: 40px; border-radius: 50%; background: var(--bg-2);
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 800; flex-shrink: 0; color: var(--primary);
  }
  .vst-search__item-code.is-inactive { opacity: .5; }
  .vst-search__item-info { flex: 1; min-width: 0; }
  .vst-search__item-name { font-weight: 700; font-size: 14px; }
  .vst-search__item-meta { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* --- Profile Card --- */
  .vst-profile-card {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 16px; padding: 20px; color: #fff; margin-bottom: 16px;
    box-shadow: 0 4px 20px rgba(102,126,234,.3);
  }
  .vst-profile-card__header { display: flex; align-items: center; gap: 14px; }
  .vst-profile-card__avatar {
    width: 56px; height: 56px; border-radius: 50%; background: rgba(255,255,255,.2);
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; font-weight: 800; flex-shrink: 0;
  }
  .vst-profile-card__info { flex: 1; }
  .vst-profile-card__name { font-size: 18px; font-weight: 800; }
  .vst-profile-card__meta { font-size: 12px; opacity: .85; margin-top: 2px; }
  .vst-profile-card__badges { display: flex; flex-direction: column; gap: 4px; flex-shrink: 0; }
  .vst-badge {
    display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px;
    border-radius: 20px; font-size: 11px; font-weight: 700;
  }
  .vst-badge--success { background: rgba(255,255,255,.2); }
  .vst-badge--danger { background: rgba(239,68,68,.8); }
  .vst-badge--warning { background: rgba(245,158,11,.8); }
  .vst-badge svg { width: 12px; height: 12px; }

  /* --- Tabs --- */
  .vst-tabs { display: flex; gap: 4px; margin-bottom: 16px; overflow-x: auto; scrollbar-width: none; }
  .vst-tabs::-webkit-scrollbar { display: none; }
  .vst-tab {
    padding: 10px 16px; border-radius: 10px; border: none; background: var(--bg-2);
    font-family: inherit; font-size: 13px; font-weight: 700; color: var(--muted);
    cursor: pointer; white-space: nowrap; transition: all .2s;
    display: inline-flex; align-items: center; gap: 6px;
  }
  .vst-tab:hover { color: var(--text); }
  .vst-tab.is-active { background: var(--primary); color: #fff; }
  .vst-tab__icon { width: 14px; height: 14px; }
  .vst-tab__icon svg { width: 14px; height: 14px; }

  /* --- Info Grid (Profile Tab) --- */
  .vst-info-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
  .vst-info-card {
    background: var(--bg); border: 1px solid var(--border); border-radius: 12px;
    padding: 16px; text-align: center;
  }
  .vst-info-card__icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; margin: 0 auto 8px; }
  .vst-info-card__icon svg { width: 20px; height: 20px; }
  .vst-info-card__value { font-size: 22px; font-weight: 800; }
  .vst-info-card__label { font-size: 11px; color: var(--muted); margin-top: 2px; }

  /* --- Detail Rows --- */
  .vst-detail-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
  .vst-detail-row:last-child { border-bottom: none; }
  .vst-detail-label { color: var(--muted); font-weight: 600; flex-shrink: 0; margin-left: 8px; }

  /* --- Attendance Tab --- */
  .vst-att-status-bar { margin-bottom: 16px; }

  /* --- Finance Tab --- */
  .vst-finance-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
  .vst-finance-box { border-radius: 12px; padding: 16px; text-align: center; color: #fff; }
  .vst-finance-box--wallet { background: linear-gradient(135deg, #10b981, #059669); }
  .vst-finance-box--debt { background: linear-gradient(135deg, #ef4444, #dc2626); }
  .vst-finance-box--charges { background: linear-gradient(135deg, #f59e0b, #d97706); }
  .vst-finance-box--session { background: linear-gradient(135deg, #667eea, #764ba2); }
  .vst-finance-box__icon { width: 32px; height: 32px; margin: 0 auto 6px; }
  .vst-finance-box__icon svg { width: 20px; height: 20px; }
  .vst-finance-box__value { font-size: 18px; font-weight: 800; }
  .vst-finance-box__label { font-size: 11px; opacity: .85; }
  .vst-deposit-form { display: flex; gap: 10px; align-items: center; }

  /* --- Payment Rows --- */
  .vst-payment-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 0; border-bottom: 1px solid var(--border); gap: 8px;
  }
  .vst-payment-row:last-child { border-bottom: none; }
  .vst-payment-row__info { flex: 1; min-width: 0; }
  .vst-payment-row__note { font-size: 13px; font-weight: 600; }
  .vst-payment-row__date { font-size: 11px; color: var(--muted); }
  .vst-payment-row__amount { font-size: 13px; font-weight: 700; white-space: nowrap; }
  .vst-payment-row__wallet { display: inline-flex; align-items: center; gap: 3px; font-size: 10px; color: var(--success); margin-right: 6px; }
  .vst-payment-row__wallet svg { width: 10px; height: 10px; }

  /* --- Tables (Grades Tab) --- */
  .vst-table { width: 100%; }
  .vst-table__header {
    display: grid; padding: 8px 0;
    border-bottom: 2px solid var(--border); font-size: 12px; font-weight: 700; color: var(--muted);
  }
  .vst-table__row {
    display: grid; padding: 10px 0;
    border-bottom: 1px solid var(--border); font-size: 13px; align-items: center;
  }
  .vst-table__row:last-child { border-bottom: none; }
  .vst-table__row--exams { grid-template-columns: 1fr 1fr 1fr; }
  .vst-table__header.vst-table__row--exams { grid-template-columns: 1fr 1fr 1fr; }
  .vst-table__row--att { grid-template-columns: 1fr 1fr 80px; }
  .vst-table__header.vst-table__row--att { grid-template-columns: 1fr 1fr 80px; }

  /* --- History (Attendance Tab) --- */
  .vst-history-table { width: 100%; }
  .vst-history-header {
    display: grid; grid-template-columns: 1fr 1fr 80px; padding: 8px 0;
    border-bottom: 2px solid var(--border); font-size: 12px; font-weight: 700; color: var(--muted);
  }
  .vst-history-row {
    display: grid; grid-template-columns: 1fr 1fr 80px; padding: 8px 0;
    border-bottom: 1px solid var(--border); font-size: 13px; align-items: center;
  }
  .vst-history-row:last-child { border-bottom: none; }

  /* --- Follow-up Tab --- */
  .vst-followup-actions { display: flex; gap: 10px; flex-wrap: wrap; }
  .vst-followup-log { padding: 12px 0; border-bottom: 1px solid var(--border); }
  .vst-followup-log:last-child { border-bottom: none; }
  .vst-followup-log__date { font-size: 11px; color: var(--muted); font-weight: 700; margin-bottom: 4px; }
  .vst-followup-log__text { font-size: 13px; }

  /* --- Schedule (Contact Tab) --- */
  .vst-schedule { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
  .vst-schedule__day {
    text-align: center; padding: 12px 4px; border-radius: 10px;
    background: var(--bg-2); border: 2px solid transparent;
  }
  .vst-schedule__day.is-active { border-color: var(--primary); background: rgba(102,126,234,.08); }
  .vst-schedule__day-name { font-size: 11px; font-weight: 700; color: var(--muted); margin-bottom: 4px; }
  .vst-schedule__day.is-active .vst-schedule__day-name { color: var(--primary); }
  .vst-schedule__day-time { font-size: 12px; font-weight: 700; }

  /* --- Timeline Stats --- */
  .vst-tl-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
  .vst-tl-stat {
    background: var(--bg); border: 1px solid var(--border); border-radius: 12px;
    padding: 14px 8px; text-align: center;
  }
  .vst-tl-stat__num { font-size: 24px; font-weight: 800; color: var(--primary); }
  .vst-tl-stat__label { font-size: 11px; color: var(--muted); margin-top: 2px; }

  /* --- Timeline Line --- */
  .vst-timeline { position: relative; padding-right: 32px; }
  .vst-timeline::before {
    content: ''; position: absolute; right: 11px; top: 0; bottom: 0;
    width: 2px; background: var(--border);
  }

  /* --- Timeline Date Separator --- */
  .vst-tl-date {
    position: relative; padding: 8px 0 12px; font-weight: 800; font-size: 14px;
    color: var(--primary); display: flex; align-items: center; gap: 10px;
  }
  .vst-tl-date__dot {
    position: absolute; right: -32px; top: 50%; transform: translateY(-50%);
    width: 12px; height: 12px; border-radius: 50%;
    background: var(--primary); border: 2px solid var(--bg);
    box-shadow: 0 0 0 3px var(--primary);
  }

  /* --- Timeline Event --- */
  .vst-tl-event { position: relative; margin-bottom: 10px; }
  .vst-tl-event__dot {
    position: absolute; right: -28px; top: 14px;
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--border); border: 2px solid var(--bg);
    z-index: 1;
  }
  .vst-tl-event--success .vst-tl-event__dot { background: var(--success); }
  .vst-tl-event--danger  .vst-tl-event__dot { background: var(--danger); }
  .vst-tl-event--warning .vst-tl-event__dot { background: var(--warning); }
  .vst-tl-event--primary .vst-tl-event__dot { background: var(--primary); }

  .vst-tl-event__card {
    background: var(--bg); border: 1px solid var(--border); border-radius: 10px;
    padding: 12px 14px; transition: transform .15s, box-shadow .15s;
  }
  .vst-tl-event__card:hover { transform: translateX(-2px); box-shadow: 0 2px 12px rgba(0,0,0,.06); }

  .vst-tl-event--success .vst-tl-event__card { border-right: 3px solid var(--success); }
  .vst-tl-event--danger  .vst-tl-event__card { border-right: 3px solid var(--danger); }
  .vst-tl-event--warning .vst-tl-event__card { border-right: 3px solid var(--warning); }
  .vst-tl-event--primary .vst-tl-event__card { border-right: 3px solid var(--primary); }

  .vst-tl-event__head { display: flex; align-items: center; gap: 8px; }
  .vst-tl-event__emoji { font-size: 16px; flex-shrink: 0; }
  .vst-tl-event__title { font-weight: 700; font-size: 13px; }
  .vst-tl-event__time { font-size: 11px; color: var(--muted); margin-right: auto; }
  .vst-tl-event__body { font-size: 12px; color: var(--text); margin-top: 4px; line-height: 1.5; }
  .vst-tl-event__sub  { font-size: 11px; color: var(--muted); margin-top: 3px; }

  /* --- Comparative Analytics --- */
  .vst-analytics-card { border-top: 3px solid var(--primary); }
  .vst-analytics-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
  .vst-analytics-kpi { text-align: center; padding: 12px; background: var(--bg-2); border-radius: 10px; }
  .vst-analytics-kpi__value { font-size: 28px; font-weight: 800; }
  .vst-analytics-kpi__label { font-size: 11px; color: var(--muted); margin-top: 2px; }

  /* --- Statements --- */
  .vst-statements { display: flex; flex-direction: column; gap: 8px; }
  .vst-statement {
    display: flex; align-items: center; gap: 10px; padding: 10px 14px;
    border-radius: 8px; font-size: 13px; font-weight: 600;
    border-right: 3px solid var(--border);
  }
  .vst-statement--success { background: rgba(16,185,129,.06); border-right-color: var(--success); }
  .vst-statement--warning { background: rgba(245,158,11,.06); border-right-color: var(--warning); }
  .vst-statement--danger  { background: rgba(239,68,68,.06);  border-right-color: var(--danger); }
  .vst-statement--primary { background: rgba(102,126,234,.06); border-right-color: var(--primary); }
  .vst-statement__emoji { font-size: 18px; flex-shrink: 0; }

  /* --- Radar Chart --- */
  .vst-radar-wrap { display: flex; justify-content: center; padding: 16px 0; }
  .vst-radar-svg { max-width: 300px; width: 100%; }
  .vst-radar-legend { display: flex; justify-content: center; gap: 20px; margin-top: 8px; }
  .vst-radar-legend__item { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--muted); }
  .vst-radar-legend__dot { width: 10px; height: 10px; border-radius: 50%; }
  .vst-radar-details { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); }
  .vst-radar-detail { display: flex; justify-content: space-between; align-items: center; font-size: 12px; padding: 6px 0; }
  .vst-radar-detail__title { color: var(--muted); font-weight: 600; }
  .vst-radar-detail__scores { font-size: 12px; display: flex; align-items: center; gap: 4px; }

  /* --- Master Ledger Card --- */
  .vst-master-ledger { border: 2px solid var(--primary); border-top: 4px solid var(--success); }
  .vst-master-ledger__header { margin-bottom: 16px; }
  .vst-master-ledger__breakdown { display: flex; flex-direction: column; gap: 0; }
  .vst-master-ledger__row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 0; font-size: 14px; border-bottom: 1px solid var(--border);
  }
  .vst-master-ledger__row:last-child { border-bottom: none; }
  .vst-master-ledger__row--debt { color: var(--danger); font-weight: 600; }
  .vst-master-ledger__row--total {
    font-size: 16px; font-weight: 800; padding: 14px 0;
    border-bottom: 2px solid var(--primary); border-top: 2px solid var(--primary);
    margin: 4px 0;
  }
  .vst-master-ledger__row--net {
    font-size: 18px; font-weight: 800; padding: 14px 0;
    border-bottom: 3px solid var(--success);
  }
  .vst-master-ledger__net { color: var(--success); font-size: 22px; }
  .vst-master-ledger__divider { height: 0; }
  .vst-master-ledger__actions { margin-top: 16px; }
  .vst-master-ledger__pay-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .vst-master-ledger__cleared {
    text-align: center; padding: 20px; background: rgba(16,185,129,.06);
    border-radius: 12px; color: var(--success);
  }

  /* --- Receipt --- */
  .vst-receipt {
    background: var(--bg); border: 2px solid var(--border); border-radius: 12px;
    padding: 20px; margin-top: 20px;
  }
  .vst-receipt__header { text-align: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px dashed var(--border); }
  .vst-receipt__center { font-size: 18px; font-weight: 800; color: var(--primary); }
  .vst-receipt__title { font-size: 14px; font-weight: 700; margin-top: 4px; }
  .vst-receipt__date { font-size: 11px; color: var(--muted); margin-top: 2px; }
  .vst-receipt__student { text-align: center; font-size: 15px; margin-bottom: 14px; }
  .vst-receipt__body { font-size: 13px; }
  .vst-receipt__row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border); }
  .vst-receipt__row:last-child { border-bottom: none; }
  .vst-receipt__row--total { font-weight: 800; font-size: 15px; border-bottom: 2px solid var(--primary); padding: 10px 0; }
  .vst-receipt__row--paid { font-weight: 800; font-size: 16px; color: var(--success); border-bottom: 2px solid var(--success); padding: 10px 0; }
  .vst-receipt__divider { height: 0; border-bottom: 2px dashed var(--border); margin: 8px 0; }
  .vst-receipt__footer { text-align: center; margin-top: 14px; padding-top: 12px; border-top: 2px dashed var(--border); font-weight: 700; color: var(--success); font-size: 13px; }

  /* --- Responsive --- */
  @media (max-width: 700px) {
    .vst-profile-card__header { flex-wrap: wrap; }
    .vst-profile-card__badges { flex-direction: row; flex-wrap: wrap; gap: 4px; }
    .vst-info-grid { grid-template-columns: repeat(2, 1fr); }
    .vst-finance-grid { grid-template-columns: repeat(2, 1fr); }
    .vst-table__row--att { grid-template-columns: 1fr 80px; }
    .vst-table__row--att > :nth-child(2) { display: none; }
    .vst-table__header.vst-table__row--att { grid-template-columns: 1fr 80px; }
    .vst-table__header.vst-table__row--att > :nth-child(2) { display: none; }
    .vst-tl-stats { grid-template-columns: repeat(2, 1fr); }
    .vst-analytics-summary { grid-template-columns: 1fr; }
    .vst-analytics-kpi__value { font-size: 22px; }
    .vst-table__row--exams-plus { grid-template-columns: 1fr 1fr; }
    .vst-table__header.vst-table__row--exams-plus { grid-template-columns: 1fr 1fr; }
    .vst-table__row--exams-plus > :nth-child(3),
    .vst-table__row--exams-plus > :nth-child(4) { display: none; }
    .vst-table__header.vst-table__row--exams-plus > :nth-child(3),
    .vst-table__header.vst-table__row--exams-plus > :nth-child(4) { display: none; }
    .vst-master-ledger__pay-row { flex-direction: column; align-items: stretch; }
    .vst-master-ledger__net { font-size: 18px; }
  }
  @media (max-width: 560px) {
    .vst-search__input { font-size: 14px; padding: 12px 40px 12px 14px; }
    .vst-profile-card { padding: 14px; border-radius: 12px; }
    .vst-profile-card__avatar { width: 44px; height: 44px; font-size: 15px; }
    .vst-profile-card__name { font-size: 15px; }
    .vst-tabs { gap: 2px; }
    .vst-tab { padding: 8px 12px; font-size: 12px; }
    .vst-schedule { grid-template-columns: repeat(4, 1fr); }
    .vst-history-row { grid-template-columns: 1fr 80px; }
    .vst-history-row > :nth-child(2) { display: none; }
    .vst-history-header { grid-template-columns: 1fr 80px; }
    .vst-history-header > :nth-child(2) { display: none; }
    .vst-tl-stats { grid-template-columns: repeat(2, 1fr); }
    .vst-tl-stat__num { font-size: 18px; }
  }
`;
document.head.appendChild(style);
