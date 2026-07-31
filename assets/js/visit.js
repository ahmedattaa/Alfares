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
  recordCashCollection, recordLedgerOnly, addLedgerEntry, getCenterName,
  isFeatureEnabled,
  getSystemSettings, getSession,
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
import { openCollectionDialog } from "./collection-dialog.js";
import { canPerformAction } from "./permissions.js";

// ═══════════════════════════════════════════════════════════
//  CSS — كل أنماط الصفحة (تُحقن قبل الـ await عشان تكون جاهزة)
// ═══════════════════════════════════════════════════════════
const style = document.createElement("style");
style.textContent = `@keyframes fadeUp{ from{ opacity:0; transform:translateY(16px) } to{ opacity:1; transform:translateY(0) } }@keyframes scaleIn{ from{ opacity:0; transform:scale(.92) } to{ opacity:1; transform:scale(1) } }`;
document.head.appendChild(style);
// باقي الـ CSS يُلحق في نهاية الملف عبر vstStyles()

const TABS = [
  { id: "timeline",   label: "الخط الزمني",           icon: icons.clock },
  { id: "profile",    label: "ملف الطالب",           icon: icons.users },
  { id: "attendance", label: "تسجيل الحضور",          icon: icons.check },
  { id: "finance",    label: "الإدارة المالية",        icon: icons.wallet },
  { id: "grades",     label: "الدرجات والحضور",       icon: icons.chart },
  { id: "followup",   label: "المتابعة",              icon: icons.clipboard },
  { id: "contact",    label: "التواصل والجدول",       icon: icons.whatsapp },
];

const content = await initPage("visit");
let selectedStudentId = null;
let activeTab = "profile";

// URL param auto-load
const urlParams = new URLSearchParams(window.location.search);
const urlStudentId = urlParams.get("studentId");

// If parent/student role, restrict to linked students only
const session = getSession();
const isParent = session?.role === "parent" || session?.role === "student";
const isStudent = session?.role === "student";
const allowedStudentIds = isParent ? (session?.linkedStudentIds || []) : null;

if (content) {
  // Determine auto-select target BEFORE render to avoid showing the dashboard then switching
  const autoTarget = (urlStudentId && (!allowedStudentIds || allowedStudentIds.includes(urlStudentId)))
    ? urlStudentId
    : (isParent && allowedStudentIds && allowedStudentIds.length === 1 ? allowedStudentIds[0] : null);

  if (autoTarget) selectedStudentId = autoTarget;

  render();

  if (selectedStudentId) selectStudent(selectedStudentId);
}

// ═══════════════════════════════════════════════════════════
//  الرئيسيّة
// ═══════════════════════════════════════════════════════════

function render() {
  // Parent with multiple children and no selection yet → show dashboard
  const showDashboard = isParent && allowedStudentIds && allowedStudentIds.length > 1 && !selectedStudentId;

  content.innerHTML = `
    <div class="page__header">
      <div>
        <div class="page__title">${showDashboard ? icons.grid + " لوحة العائلة" : isStudent ? icons.shield + " ملفي الدراسي" : icons.shield + " لوحة ولي الأمر"}</div>
        <div class="page__subtitle">${showDashboard ? "جميع أبنائك المسجلين في السنتر — اختر أحدهم لعرض تفاصيله" : isStudent ? "متابعة درجاتك وحضورك وملفك الدراسي" : "بحث شامل لكل ما يخص الطالب — ملفه، ماليته، حضوره، درجاته، متابعته"}</div>
      </div>
    </div>

    ${showDashboard ? renderParentDashboardHTML() : `
    <div class="vst-search">
      <div class="vst-search__icon">${icons.search}</div>
      <input type="text" class="vst-search__input" id="vstSearchInput"
             placeholder="ابحث بالاسم أو الكود أو رقم التليفون أو تليفون ولي الأمر..." autofocus>
      <div id="vstSearchResults" class="vst-search__results"></div>
    </div>`}

    <div id="vstStudentZone" style="display:none;"></div>
  `;

  if (!showDashboard) {
    const input = document.getElementById("vstSearchInput");
    if (input) {
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
  } else {
    // Bind click on dashboard cards
    document.querySelectorAll(".ps-card[data-sid]").forEach((el) => {
      el.addEventListener("click", () => selectStudent(el.dataset.sid));
    });
  }
}

function renderParentDashboardHTML() {
  const all = getStudents().filter((s) => allowedStudentIds.includes(s.id));
  const groups = getGroups();
  const walletOn = isFeatureEnabled("wallet");
  const totalWallet = walletOn ? all.reduce((sum, s) => sum + Number(s.walletBalance || 0), 0) : 0;
  const totalDebt = all.reduce((sum, s) => sum + Number(s.lateBalance || 0), 0);
  const activeCount = all.filter((s) => s.status === "active").length;
  const colors = ["#4F6EF7","#F59E0B","#10B981","#EF4444","#8B5CF6","#EC4899","#06B6D4","#F97316"];

  return `
    <div class="parent-dashboard">
      <div class="ps-rail">
        <div class="ps-chip" style="--c:#4F6EF7">
          <div class="ps-chip__n">${all.length}</div>
          <div class="ps-chip__l">${icons.users} عدد الأبناء</div>
        </div>
        ${walletOn ? `
        <div class="ps-chip" style="--c:#10B981">
          <div class="ps-chip__n">${formatMoney(totalWallet)}</div>
          <div class="ps-chip__l">${icons.wallet} إجمالي المحفظة</div>
        </div>` : ""}
        <div class="ps-chip" style="--c:${totalDebt > 0 ? "#EF4444" : "#10B981"}">
          <div class="ps-chip__n">${formatMoney(totalDebt)}</div>
          <div class="ps-chip__l">${icons.money} إجمالي المتأخرات</div>
        </div>
      </div>

      <div class="ps-bento">
        ${all.map((s, i) => {
          const g = groups.find((gr) => gr.id === s.groupId);
          const wallet = Number(s.walletBalance || 0);
          const debt = Number(s.lateBalance || 0);
          const initials = (s.name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2);
          const c = colors[i % colors.length];

          let badges = "";
          if (walletOn && wallet > 0) badges += `<span class="ps-card__badge ps-card__badge--wallet">${icons.wallet} ${formatMoney(wallet)}</span>`;
          if (debt > 0) badges += `<span class="ps-card__badge ps-card__badge--debt">${icons.money} ${formatMoney(debt)}</span>`;
          if (s.status !== "active") badges += `<span class="ps-card__badge ps-card__badge--inactive">غير نشط</span>`;
          if (!badges) badges = `<span class="ps-card__badge ps-card__badge--status">${icons.check} نشط</span>`;

          return `
          <div class="ps-card" data-sid="${s.id}" style="--c:${c}">
            <div class="ps-card__top">
              <div class="ps-card__av" style="background:linear-gradient(135deg,${c},${c}88)">${escapeHTML(initials)}</div>
              <div class="ps-card__info">
                <div class="ps-card__name">${escapeHTML(s.name)}</div>
                <div class="ps-card__meta">${g ? escapeHTML(g.name) : "بدون مجموعة"}</div>
                <div class="ps-card__codes">
                  <span class="ps-card__code">${escapeHTML(s.code || "—")}</span>
                  ${s.phone ? `<span class="ps-card__code">${escapeHTML(s.phone)}</span>` : ""}
                </div>
              </div>
            </div>
            <div class="ps-card__body">${badges}</div>
            <div class="ps-card__footer">
              <span class="hint">${icons.arrowLeft} عرض الملف</span>
              <span class="arrow">‹</span>
            </div>
          </div>`;
        }).join("")}
        ${all.length === 0 ? '<div class="ps-card__empty">لا يوجد أبناء مسجلين</div>' : ""}
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════
//  البحث
// ═══════════════════════════════════════════════════════════

function findSingleMatch(term) {
  const lower = term.toLowerCase();
  const students = allowedStudentIds ? getStudents().filter((s) => allowedStudentIds.includes(s.id)) : getStudents();
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

  const allStudents = allowedStudentIds ? getStudents().filter((s) => allowedStudentIds.includes(s.id)) : getStudents();
  const groups = getGroups();

  const codeMatches = allStudents.filter((s) => (s.code || "").toLowerCase().startsWith(term));
  const nameMatches = allStudents.filter((s) => !codeMatches.includes(s) && (s.name || "").toLowerCase().includes(term));
  const phoneMatches = allStudents.filter((s) =>
    !codeMatches.includes(s) && !nameMatches.includes(s) &&
    ((s.phone || "").toLowerCase().includes(term) || (s.parentPhone || "").toLowerCase().includes(term))
  );
  const allMatches = [...codeMatches, ...nameMatches, ...phoneMatches];
  const matches = allMatches.slice(0, 30);

  if (!matches.length) {
    results.innerHTML = `<div class="vst-search__empty">لا توجد نتائج</div>`;
    results.style.display = "block";
    return;
  }

  const hasMore = allMatches.length > 30;
  results.innerHTML = matches.map((s) => {
    const g = findGroup(groups, s.groupId);
    const wallet = Number(s.walletBalance || 0);
    const debt = Number(s.lateBalance || 0);
    const isActive = s.status === "active";
    const badges = [];
    if (wallet > 0) badges.push(`<span style="color:#fff;">${formatMoney(wallet)}</span>`);
    if (debt > 0) badges.push(`<span style="color:var(--danger);">${formatMoney(debt)} متأخر</span>`);
    if (!isActive) badges.push(`<span style="color:var(--warning);">غير نشط</span>`);
    return `
      <div class="vst-search__item" data-id="${s.id}">
        <div class="vst-search__item-code ${!isActive ? "is-inactive" : ""}">${escapeHTML(s.code || "?")}</div>
        <div class="vst-search__item-info">
          <div class="vst-search__item-name">${escapeHTML(s.name)} ${!isActive ? `<span style="font-size:10px; color:var(--muted);">(غير نشط)</span>` : ""}</div>
          <div class="vst-search__item-meta">${escapeHTML(g?.name || "")} ${badges.length ? `· ${badges.join(" · ")}` : ""}</div>
        </div>
      </div>`;
  }).join("");

  if (hasMore) {
    results.innerHTML += `<div style="text-align:center; padding:8px; font-size:12px; color:var(--muted);">عرض ${matches.length} من ${allMatches.length} نتيجة — حدد أكثر لتحديد طالب</div>`;
  }

  results.style.display = "block";
  results.querySelectorAll(".vst-search__item").forEach((el) =>
    el.addEventListener("click", () => selectStudent(el.dataset.id))
  );
}

function selectStudent(id) {
  if (allowedStudentIds && !allowedStudentIds.includes(id)) {
    toast("لا يمكنك عرض هذا الطالب", "warning");
    return;
  }
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
  const showBack = isParent && allowedStudentIds && allowedStudentIds.length > 1;

  const initials = (student.name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2);

  zone.innerHTML = `
    ${showBack ? `<div style="margin-bottom:12px;"><button class="btn btn-ghost btn-sm" id="backToDashboardBtn" style="gap:4px;font-size:12.5px;"><span style="font-size:18px;">›</span> العودة لجميع الأبناء</button></div>` : ""}
    <div class="vst-profile-card">
      <div class="vst-profile-card__header">
        <div class="vst-profile-card__avatar">${escapeHTML(initials)}</div>
        <div class="vst-profile-card__info">
          <div class="vst-profile-card__name">${escapeHTML(student.name)}</div>
          <div class="vst-profile-card__meta">
            <span>${escapeHTML(group?.name || "")}</span>
            <span class="vst-profile-card__meta-sep">·</span>
            <span>${escapeHTML(grade || "")}</span>
            <span class="vst-profile-card__meta-sep">·</span>
            <span>منذ ${formatDateAr(student.joinDate)}</span>
          </div>
        </div>
        <div class="vst-profile-card__badges">
          ${isFeatureEnabled("wallet") && wallet > 0 ? `<div class="vst-badge vst-badge--success">${icons.wallet} ${formatMoney(wallet)}</div>` : ""}
          ${debt > 0 ? `<div class="vst-badge vst-badge--danger">${icons.money} ${formatMoney(debt)}</div>` : ""}
          ${locked ? `<div class="vst-badge vst-badge--warning">${icons.alert} مقفول</div>` : ""}
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

  const backBtn = document.getElementById("backToDashboardBtn");
  if (backBtn) backBtn.addEventListener("click", () => { selectedStudentId = null; render(); });

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
  const debt = Number(student.lateBalance || 0);

  box.innerHTML = `
    <div class="vst-info-grid">
      <div class="vst-info-card" style="--c:var(--success)">
        <div class="vst-info-card__icon" style="background:color-mix(in srgb, var(--success) 12%, transparent); color:var(--success);">${icons.check}</div>
        <div class="vst-info-card__value">${presentCount}/${totalCount}</div>
        <div class="vst-info-card__label">حضور آخر 30 يوم</div>
      </div>
      <div class="vst-info-card" style="--c:${rate >= 70 ? "var(--success)" : rate >= 40 ? "var(--warning)" : "var(--danger)"}">
        <div class="vst-info-card__icon" style="background:color-mix(in srgb, var(--primary) 12%, transparent); color:var(--primary);">${icons.chart}</div>
        <div class="vst-info-card__value" style="color:${rate >= 70 ? "var(--success)" : rate >= 40 ? "var(--warning)" : "var(--danger)"};">${rate}%</div>
        <div class="vst-info-card__label">نسبة الحضور</div>
      </div>
      <div class="vst-info-card" style="--c:var(--warning)">
        <div class="vst-info-card__icon" style="background:color-mix(in srgb, var(--warning) 12%, transparent); color:var(--warning);">${icons.clock}</div>
        <div class="vst-info-card__value">${unpaidCount}</div>
        <div class="vst-info-card__label">حصص غير مدفوعة</div>
      </div>
      <div class="vst-info-card" style="--c:${debt > 0 ? "var(--danger)" : "var(--success)"}">
        <div class="vst-info-card__icon" style="background:color-mix(in srgb, var(--danger) 12%, transparent); color:var(--danger);">${icons.money}</div>
        <div class="vst-info-card__value" style="color:${debt > 0 ? "var(--danger)" : "var(--success)"};">${formatMoney(Number(student.lateBalance || 0))}</div>
        <div class="vst-info-card__label">المتأخرات المالية</div>
      </div>
    </div>

    <div class="card card-pad" style="margin-top:16px;">
      <div class="card__head"><div class="card__title">${icons.users} بيانات الطالب</div></div>
      <div class="vst-detail-grid">
        ${detailRow("الكود", student.code || "")}
        ${detailRow("الحالة", student.status === "active" ? "نشط" : "غير نشط")}
        ${detailRow("المجموعة", group?.name || "")}
        ${detailRow("السعر", formatMoney(group?.sessionPrice || 0))}
        ${detailRow("السنة", gradeName(getGrades(), student.gradeId) || "")}
        ${detailRow("الخصم", student.discount ? formatMoney(student.discount) : "—")}
        ${detailRow("المواعيد", `${formatDaysAr(group?.days || [])} — ${formatTimeAr(group?.time)}`)}
        ${detailRow("المدرسة", student.school || "—")}
        ${detailRow("تليفون", student.phone || "—")}
        ${detailRow("تليفون ولي الأمر", student.parentPhone || "—")}
        ${detailRow("المهنة", student.fatherJob || "—")}
        ${detailRow("تاريخ الانضمام", formatDateAr(student.joinDate))}
      </div>
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
  const presentIds = new Set(statuses.filter((s) => s.presence === "present").map((s) => s.id));
  const unpaidIds = new Set(statuses.filter((s) => s.payment === "unpaid").map((s) => s.id));

  const today = todayISO();
  const allAtt = getAttendance().filter((a) => a.studentId === student.id && a.category === "attendance");
  const todayRecord = allAtt.find((a) => a.date === today);
  const currentStatus = todayRecord ? statuses.find((s) => s.id === todayRecord.statusId) : null;

  const breakdown = computeFinanceBreakdown(student, group, getExtraCharges());

  // Last 30 days stats
  const last30 = allAtt.filter((a) => (Date.now() - new Date(a.date).getTime()) / 86400000 <= 30);
  const present30 = last30.filter((a) => presentIds.has(a.statusId)).length;
  const absent30 = last30.filter((a) => !presentIds.has(a.statusId)).length;
  const attRate = last30.length ? Math.round((present30 / last30.length) * 100) : 100;
  const unpaid30 = last30.filter((a) => unpaidIds.has(a.statusId)).length;

  // Mini calendar for this month
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(year, month, i + 1);
    const iso = d.toISOString().slice(0, 10);
    const record = allAtt.find((a) => a.date === iso);
    const st = record ? statuses.find((s) => s.id === record.statusId) : null;
    const isPresent = record && presentIds.has(record.statusId);
    const isFuture = d > now;
    return { iso, isPresent, st, record, isFuture, day: i + 1 };
  });

  const dayNames = ["ح","ن","ث","ر","خ","ج","س"];
  const todayName = dayNames[now.getDay()];

  box.innerHTML = `
    <div class="vst-info-grid" style="margin-bottom:16px;">
      <div class="vst-info-card" style="--c:${attRate >= 70 ? "var(--success)" : attRate >= 40 ? "var(--warning)" : "var(--danger)"}">
        <div class="vst-info-card__icon" style="background:color-mix(in srgb, var(--success) 12%, transparent); color:var(--success);">${icons.check}</div>
        <div class="vst-info-card__value">${present30}/${last30.length}</div>
        <div class="vst-info-card__label">حضور (آخر 30 يوم)</div>
      </div>
      <div class="vst-info-card" style="--c:${attRate >= 70 ? "var(--success)" : attRate >= 40 ? "var(--warning)" : "var(--danger)"}">
        <div class="vst-info-card__icon" style="background:color-mix(in srgb, var(--primary) 12%, transparent); color:var(--primary);">${icons.chart}</div>
        <div class="vst-info-card__value" style="color:${attRate >= 70 ? "var(--success)" : attRate >= 40 ? "var(--warning)" : "var(--danger)"};">${attRate}%</div>
        <div class="vst-info-card__label">نسبة الحضور</div>
      </div>
      <div class="vst-info-card" style="--c:${absent30 > 0 ? "var(--danger)" : "var(--success)"}">
        <div class="vst-info-card__icon" style="background:color-mix(in srgb, var(--danger) 12%, transparent); color:var(--danger);">${icons.x}</div>
        <div class="vst-info-card__value" style="color:${absent30 > 0 ? "var(--danger)" : "var(--success)"};">${absent30}</div>
        <div class="vst-info-card__label">غياب</div>
      </div>
      <div class="vst-info-card" style="--c:${unpaid30 > 0 ? "var(--warning)" : "var(--success)"}">
        <div class="vst-info-card__icon" style="background:color-mix(in srgb, var(--warning) 12%, transparent); color:var(--warning);">${icons.clock}</div>
        <div class="vst-info-card__value" style="color:${unpaid30 > 0 ? "var(--warning)" : "var(--success)"};">${unpaid30}</div>
        <div class="vst-info-card__label">حصص غير مدفوعة</div>
      </div>
    </div>

    <div class="card card-pad" style="margin-bottom:16px;">
      <div class="card__head">
        <div class="card__title" style="display:flex; align-items:center; gap:8px;">
          ${icons.calendar} حضور شهر ${["يناير","فبراير","مارس","إبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"][month]} ${year}
        </div>
      </div>
      <div style="display:grid; grid-template-columns:repeat(7,1fr); gap:4px; text-align:center;">
        ${dayNames.map((n) => `<span style="font-size:10px; font-weight:700; color:var(--muted); padding:4px 0;">${n}</span>`).join("")}
        ${Array.from({ length: new Date(year, month, 1).getDay() }, () => `<span></span>`).join("")}
        ${monthDays.map((d) => `
          <div title="${d.isFuture ? "" : d.st ? d.st.name : "لا يوجد تسجيل"}"
               style="padding:4px 0; border-radius:6px; font-size:12px; font-weight:600;
                      ${d.isFuture ? "opacity:.25;" : d.isPresent ? "background:var(--success); color:#fff;" : d.st ? "background:var(--danger); color:#fff;" : "background:var(--bg-2);"}
                      ${d.iso === today && !d.isFuture ? "outline:2px solid var(--primary); outline-offset:-2px;" : ""}">
            ${d.day}
          </div>
        `).join("")}
      </div>
      <div class="vst-att-legend">
        <span><span class="vst-att-legend__dot" style="background:var(--success);"></span>حاضر</span>
        <span><span class="vst-att-legend__dot" style="background:var(--danger);"></span>غائب</span>
        <span><span class="vst-att-legend__dot" style="background:var(--bg-2);"></span>لم يسجل</span>
      </div>
    </div>

    <div class="vst-att-status-bar" style="margin-bottom:16px;">
      ${currentStatus
        ? `<span class="badge badge-${currentStatus.tone}" style="font-size:13px; padding:8px 16px;"><span class="badge-dot"></span>حالة ${todayName}: ${escapeHTML(currentStatus.name)} (${todayRecord.time})</span>`
        : `<span class="badge badge-neutral" style="font-size:13px; padding:8px 16px;">${icons.clock} لم يتم تسجيل حالة ${todayName} بعد</span>`
      }
      ${group ? `<span class="badge badge-neutral" style="font-size:12px; margin-right:8px;">${icons.clock} ${group.days?.join(" - ") || ""} — ${group.time || ""}</span>` : ""}
    </div>

    ${renderFinancePanelHTML(breakdown)}

    ${!isStudent ? `
    <div class="card card-pad" style="margin-bottom:16px;">
      <div class="card__head"><div class="card__title">${icons.check} تسجيل حالة الحضور</div></div>
      <div class="status-btn-grid">
        ${attendanceStatuses.map((s) => `
          <button class="btn btn-${s.tone} vstStatusBtn" data-status="${s.id}"
            style="${currentStatus?.id === s.id ? "outline:2px solid color-mix(in srgb, var(--text) 15%, transparent); box-shadow:0 0 0 3px var(--" + s.tone + ");" : ""}">
            ${icons.check}<span>${escapeHTML(s.name)}</span>
          </button>
        `).join("")}
      </div>
    </div>

    ${actionStatuses.length ? `
    <div class="card card-pad" style="margin-bottom:16px;">
      <div class="card__head"><div class="card__title">${icons.alert} إجراءات استثنائية</div></div>
      <div class="status-btn-grid">
        ${actionStatuses.map((s) => `
          <button class="btn btn-outline vstActionBtn" data-status="${s.id}"
            style="border-color: var(--${s.tone === "danger" ? "danger" : "warning"});">
            ${icons.alert}<span>${escapeHTML(s.name)}</span>
          </button>
        `).join("")}
      </div>
    </div>` : ""}
    ` : ""}

    <div class="card card-pad">
      <div class="card__head"><div class="card__title">${icons.clipboard} آخر 15 حالة مسجلة</div></div>
      ${renderRecentHistory(student.id, 15)}
    </div>
  `;

  box.querySelectorAll(".vstStatusBtn").forEach((btn) =>
    btn.addEventListener("click", () => onStatusClick(student.id, btn.dataset.status))
  );
  box.querySelectorAll(".vstActionBtn").forEach((btn) =>
    btn.addEventListener("click", () => onActionClick(student.id, btn.dataset.status))
  );
}

function renderRecentHistory(studentId, limit) {
  const statuses = getStudentStatuses();
  const records = getAttendance()
    .filter((a) => a.studentId === studentId)
    .sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1))
    .slice(0, limit || 10);

  if (!records.length) return `<div class="text-muted" style="font-size:13px; padding:12px;">لا يوجد سجل سابق</div>`;

  return `
    <div class="vst-history-table">
      <div class="vst-history-header">
        <span>التاريخ</span><span>الحالة</span><span>الوقت</span>
      </div>
      ${records.map((r, ri) => {
        const s = statuses.find((st) => st.id === r.statusId);
        return `
          <div class="vst-history-row" style="animation:fadeUp .25s ease both; animation-delay:${ri * .03}s;">
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

  // صوت حسب نوع الحالة
  if (status.payment === "paid") Sounds.cashRegister();
  else if (status.category === "absent" || status.category === "action") Sounds.warning();
  else Sounds.success();
  if (result.student?.dataStatus === "minimal") Sounds.incompleteAlert();

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
  if (status.tone === "danger") Sounds.urgentAlarm();
  else Sounds.warning();
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
  const walletBalance = isFeatureEnabled("wallet") ? Number(student.walletBalance || 0) : 0;
  const charges = isFeatureEnabled("extraCharges") ? getExtraCharges().filter((c) => c.studentId === student.id && c.status === "unpaid") : [];
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
        <div class="vst-receipt__center">${getCenterName()}</div>
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
  const enableWallet = isFeatureEnabled("wallet");
  const enableCharges = isFeatureEnabled("extraCharges");
  const wallet = enableWallet ? Number(student.walletBalance || 0) : 0;
  const debt = Number(student.lateBalance || 0);
  const charges = enableCharges ? getExtraCharges().filter((c) => c.studentId === student.id && c.status === "unpaid") : [];
  const totalCharges = charges.reduce((sum, c) => sum + Number(c.amount || 0), 0);
  const group = findGroup(getGroups(), student.groupId);
  const sessionPrice = group ? dueAmount(student, group) : 0;
  const payments = getPayments().filter((p) => p.studentId === student.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 25);
  const grandTotal = sessionPrice + debt + totalCharges;
  const netDue = Math.max(0, grandTotal - wallet);
  const totalPaid = payments.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount || 0), 0);
  const progressPct = grandTotal > 0 ? Math.min(100, Math.round((totalPaid / (totalPaid + grandTotal)) * 100)) : 100;

  box.innerHTML = `
    <div class="vst-info-grid" style="margin-bottom:16px;">
      <div class="vst-info-card" style="--c:${netDue > 0 ? "var(--danger)" : "var(--success)"}">
        <div class="vst-info-card__icon" style="background:color-mix(in srgb, var(--danger) 12%, transparent); color:${netDue > 0 ? "var(--danger)" : "var(--success)"};">${icons.money}</div>
        <div class="vst-info-card__value" style="color:${netDue > 0 ? "var(--danger)" : "var(--success)"};">${formatMoney(netDue)}</div>
        <div class="vst-info-card__label">المطلوب سداده</div>
      </div>
      ${enableWallet ? `
      <div class="vst-info-card" style="--c:var(--success)">
        <div class="vst-info-card__icon" style="background:color-mix(in srgb, var(--success) 12%, transparent); color:var(--success);">${icons.wallet}</div>
        <div class="vst-info-card__value">${formatMoney(wallet)}</div>
        <div class="vst-info-card__label">المحفظة</div>
      </div>` : ""}
      <div class="vst-info-card" style="--c:${debt > 0 ? "var(--warning)" : "var(--success)"}">
        <div class="vst-info-card__icon" style="background:color-mix(in srgb, var(--warning) 12%, transparent); color:${debt > 0 ? "var(--warning)" : "var(--success)"};">${icons.clock}</div>
        <div class="vst-info-card__value">${formatMoney(debt)}</div>
        <div class="vst-info-card__label">متأخرات</div>
      </div>
      <div class="vst-info-card" style="--c:var(--primary)">
        <div class="vst-info-card__icon" style="background:color-mix(in srgb, var(--primary) 12%, transparent); color:var(--primary);">${icons.chart}</div>
        <div class="vst-info-card__value">${formatMoney(sessionPrice)}</div>
        <div class="vst-info-card__label">سعر الحصة</div>
      </div>
    </div>

    <!-- Progress bar -->
    ${grandTotal > 0 ? `
    <div class="card card-pad" style="margin-bottom:16px;">
      <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:6px;">
        <span>تم الدفع: ${formatMoney(totalPaid)}</span>
        <span>المتبقي: ${formatMoney(grandTotal)}</span>
      </div>
      <div style="height:8px; background:var(--bg-2); border-radius:99px; overflow:hidden;">
        <div style="height:100%; width:${progressPct}%; background:linear-gradient(90deg,var(--success),color-mix(in srgb, var(--success) 70%, white)); border-radius:99px; transition:width .6s ease;"></div>
      </div>
      <div style="text-align:center; font-size:11px; color:var(--muted); margin-top:4px;">نسبة التسوية: ${progressPct}%</div>
    </div>` : ""}

    ${grandTotal > 0 ? `
    <div class="vst-master-ledger card card-pad">
      <div class="vst-master-ledger__header">
        <div>
          <div class="card__title" style="margin:0; display:flex; align-items:center; gap:6px;">${icons.money} الحساب الشامل — ${escapeHTML(student.name)}</div>
        </div>
      </div>

      <div class="vst-master-ledger__breakdown">
        ${sessionPrice > 0 ? `
          <div class="vst-master-ledger__row">
            <span>سعر الحصة${group ? ` (${escapeHTML(group.name)})` : ""}</span>
            <span class="vst-ledger-amount">${formatMoney(sessionPrice)}</span>
          </div>` : ""}
        ${debt > 0 ? `
          <div class="vst-master-ledger__row vst-master-ledger__row--debt">
            <span>${icons.clock} متأخرات سابقة</span>
            <span class="vst-ledger-amount" style="color:var(--warning);">${formatMoney(debt)}</span>
          </div>` : ""}
        ${charges.length ? charges.map((c) => `
          <div class="vst-master-ledger__row">
            <span>${icons.alert} ${escapeHTML(c.name)}</span>
            <span class="vst-ledger-amount">${formatMoney(c.amount)}</span>
          </div>`).join("") : ""}
        <div class="vst-master-ledger__divider"></div>
        <div class="vst-master-ledger__row vst-master-ledger__row--total">
          <span>الإجمالي المطلوب</span>
          <span class="vst-ledger-amount" style="font-size:18px;">${formatMoney(grandTotal)}</span>
        </div>
        ${wallet > 0 ? `
          <div class="vst-master-ledger__row" style="color:var(--success);">
            <span>${icons.wallet} خصم المحفظة</span>
            <span class="vst-ledger-amount">−${formatMoney(wallet)}</span>
          </div>` : ""}
        <div class="vst-master-ledger__row vst-master-ledger__row--net">
          <span>المطلوب سداده الآن</span>
          <span class="vst-master-ledger__net">${formatMoney(netDue)}</span>
        </div>
      </div>

      <div class="vst-master-ledger__actions">
        ${netDue > 0 ? `
          <div style="display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap;">
            ${canPerformAction(getSession(), "visit", "collection") ? `
            <button class="btn btn-outline" id="vstCollectionDialogBtn" style="font-size:13px; padding:10px 16px;">
              ${icons.money} تحصيل تفصيلي
            </button>
            ` : ""}
          </div>
          <div class="vst-master-ledger__pay-row">
            <input type="number" class="input" id="vstSettleAmount" min="0" step="1" value="${netDue}" style="max-width:180px; font-size:18px; font-weight:800; text-align:center;">
            <button class="btn btn-success btn-lg" id="vstSettleAllBtn" style="font-size:16px; padding:14px 28px;">
              ${icons.check} تسوية شاملة — ${formatMoney(netDue)}
            </button>
          </div>
        ` : `
          <div class="vst-master-ledger__cleared">
            <span style="font-size:28px; opacity:.6;">✓</span>
            <div style="font-weight:700;">لا مبالغ مستحقة — الحساب مصفّى بالكامل</div>
          </div>
        `}
      </div>
    </div>` : `
    <div class="card card-pad" style="text-align:center; padding:30px; margin-bottom:16px;">
      <div style="font-size:28px; opacity:.5; margin-bottom:8px;">✓</div>
      <div style="font-weight:700; font-size:16px;">الحساب مصفّى — لا مبالغ مستحقة</div>
      <div class="text-muted" style="margin-top:4px;">${wallet > 0 ? `رصيد المحفظة: ${formatMoney(wallet)}` : "لا يوجد رصيد في المحفظة"}</div>
    </div>`}

    ${group ? `
    <div class="card card-pad" style="margin-bottom:16px;">
      <div class="card__head"><div class="card__title">${icons.clipboard} معلومات المجموعة</div></div>
      <div class="vst-detail-grid">
        <div class="vst-detail-row"><span>المجموعة</span><span>${escapeHTML(group.name)}</span></div>
        <div class="vst-detail-row"><span>الأيام</span><span>${group.days?.join(" - ") || "—"}</span></div>
        <div class="vst-detail-row"><span>الموعد</span><span>${group.time || "—"}</span></div>
        ${group.startDate ? `<div class="vst-detail-row"><span>تاريخ البداية</span><span>${formatDateAr(group.startDate)}</span></div>` : ""}
        <div class="vst-detail-row"><span>سعر الحصة</span><span class="badge badge-primary">${formatMoney(sessionPrice)}</span></div>
      </div>
    </div>` : ""}

    ${enableWallet && canPerformAction(getSession(), "visit", "wallet_deposit") ? `
    <div class="card card-pad" style="margin-bottom:16px;">
      <div class="card__head"><div class="card__title">${icons.wallet} إيداع في المحفظة</div></div>
      <div class="vst-deposit-form">
        <input type="number" class="input" id="vstDepositInput" min="1" step="1" placeholder="المبلغ (ج.م)" style="max-width:200px;">
        <button class="btn btn-success" id="vstDepositBtn">${icons.wallet} إيداع</button>
      </div>
    </div>
    ` : ""}

    ${charges.length ? `
    <div class="card card-pad" style="margin-bottom:16px;">
      <div class="card__head"><div class="card__title">${icons.alert} مستحقات أخرى</div></div>
      ${charges.map((c) => `
        <div class="vst-detail-row" style="animation:fadeUp .2s ease both;">
          <span>${icons.alert} ${escapeHTML(c.name)} — ${formatMoney(c.amount)}</span>
          <button class="btn btn-success btn-sm vstSettleChargeBtn" data-id="${c.id}">تسوية</button>
        </div>
      `).join("")}
    </div>` : ""}

    <div class="card card-pad">
      <div class="card__head"><div class="card__title">${icons.clipboard} سجل الدفعات (${payments.length})</div></div>
      <div class="vst-history-table">
        <div class="vst-history-header">
          <span>التاريخ</span><span>الملاحظة</span><span>المبلغ</span><span>الحالة</span>
        </div>
        ${payments.length ? payments.map((p, pi) => `
          <div class="vst-history-row" style="animation:fadeUp .2s ease both; animation-delay:${pi * .03}s;">
            <span style="white-space:nowrap;">${formatDateAr(p.date)}${p.sessionDate ? `<br><span style="font-size:10px; color:var(--muted);">حصة ${formatDateAr(p.sessionDate)}</span>` : ""}</span>
            <span style="font-size:13px;">${escapeHTML(p.note || "—")}</span>
            <span style="font-weight:700; color:${p.status === "paid" ? "var(--success)" : "var(--danger)"};">${p.status === "paid" ? "+" : "-"}${formatMoney(p.amount || 0)}${p.walletUsed > 0 ? ` <span style="font-weight:400; font-size:11px; color:var(--muted);">(محفظة ${formatMoney(p.walletUsed)})</span>` : ""}</span>
            <span><span class="badge badge-${p.status === "paid" ? "success" : "danger"}"><span class="badge-dot"></span>${p.status === "paid" ? "مسدد" : "مستحق"}</span></span>
          </div>
        `).join("") : `<div class="text-muted" style="padding:20px; text-align:center;">لا توجد دفعات مسجلة</div>`}
      </div>
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

      Sounds.cashRegister();
      toast(`✅ تم التسوية الشاملة — الإجمالي: ${formatMoney(result.receipt.breakdown.grandTotal)}`, "success");

      // عرض الإيصال
      const receiptZone = document.getElementById("vstReceiptZone");
      if (receiptZone) {
        receiptZone.innerHTML = renderReceiptHTML(result.receipt);
      }

      // إرسال واتساب بالإيصال
      try {
        if (student.parentPhone && getSystemSettings().waReceiptToggle !== false) {
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

  // ═══ زر التحصيل التفصيلي ═══
  const collectionBtn = document.getElementById("vstCollectionDialogBtn");
  if (collectionBtn) {
    collectionBtn.addEventListener("click", () => {
      openCollectionDialog(student.id, { onClose: () => renderStudentZone() });
    });
  }

  // ═══ أزرار تسوية المستحقات الفردية ═══
  box.querySelectorAll(".vstSettleChargeBtn").forEach((btn) =>
    btn.addEventListener("click", () => {
      const charge = settleExtraCharge(btn.dataset.id);
      if (charge) {
        Sounds.coinDrop();
        toast(`تم تسوية "${charge.name}"`, "success");
      }
      renderStudentZone();
    })
  );

  // ═══ زر الإيداع ═══
  document.getElementById("vstDepositBtn")?.addEventListener("click", () => {
    const amount = Number(document.getElementById("vstDepositInput").value || 0);
    if (amount <= 0) { toast("أدخل مبلغ صحيح", "warning"); return; }
    const result = addWalletDeposit(student.id, amount);
    if (!result) { toast("فشلت عملية الإيداع", "error"); return; }
    Sounds.coinDrop();
    let msg = `تم إيداع ${formatMoney(amount)}`;
    if (result.debtCovered > 0) msg += ` — تغطية متأخرات: ${formatMoney(result.debtCovered)}`;
    if (result.walletDeposit > 0) msg += ` — رصيد جديد: ${formatMoney(result.newWalletBalance)}`;
    toast(msg, "success");
    try {
      if (student.parentPhone) openWhatsApp(student.parentPhone, renderTemplate("wallet_deposit_reception", {
        studentName: student.name, amount: formatMoney(amount),
        newWalletBalance: formatMoney(result.newWalletBalance), centerName: getCenterName(),
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

  // متوسط المجموعة (شفاف)
  const groupPolygon = `<polygon points="${buildPolygonPoints(groupValues)}" fill="color-mix(in srgb, var(--primary) 15%, transparent)" stroke="var(--primary)" stroke-width="2" stroke-dasharray="4,3"/>`;

  // درجات الطالب (شفاف)
  const studentPolygon = `<polygon points="${buildPolygonPoints(studentValues)}" fill="color-mix(in srgb, var(--success) 20%, transparent)" stroke="var(--success)" stroke-width="2.5"/>`;

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
  const presentIds = new Set(statuses.filter((s) => s.presence === "present").map((s) => s.id));
  const unpaidIds = new Set(statuses.filter((s) => s.payment === "unpaid").map((s) => s.id));

  const exams = getExams().filter((e) =>
    e.results?.some((r) => r.studentId === student.id)
  ).map((e) => {
    const result = e.results.find((r) => r.studentId === student.id);
    return { ...e, score: result?.score, absent: result?.absent, excused: result?.excused };
  }).sort((a, b) => b.date.localeCompare(a.date));

  const recentAtt = attendance.slice(0, 20);
  const total30 = attendance.filter((a) => (Date.now() - new Date(a.date).getTime()) / 86400000 <= 30);
  const present30 = total30.filter((a) => presentIds.has(a.statusId)).length;
  const attRate = total30.length ? Math.round((present30 / total30.length) * 100) : 0;

  const scored = exams.filter((e) => e.score != null && !e.absent && !e.excused);
  const avg = scored.length ? Math.round(scored.reduce((s, e) => s + (e.score / (e.maxScore || 1)) * 100, 0) / scored.length) : 0;
  const best = scored.length ? Math.max(...scored.map((e) => Math.round((e.score / (e.maxScore || 1)) * 100))) : 0;

  const analytics = computeComparativeAnalytics(student);
  const statements = analytics ? generateComparativeStatements(analytics) : [];
  const radarSVG = analytics ? renderRadarChartSVG(analytics) : null;

  const recentDays = 30;
  const days = Array.from({ length: recentDays }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (recentDays - 1 - i));
    const iso = d.toISOString().slice(0, 10);
    const record = attendance.find((a) => a.date === iso);
    const st = record ? statuses.find((s) => s.id === record.statusId) : null;
    const isPresent = record && presentIds.has(record.statusId);
    const isToday = iso === todayISO();
    return { iso, isPresent, st, record, isToday };
  });

  box.innerHTML = `
    <div class="vst-info-grid" style="margin-bottom:16px;">
      <div class="vst-info-card" style="--c:var(--primary)">
        <div class="vst-info-card__icon" style="background:color-mix(in srgb, var(--primary) 12%, transparent); color:var(--primary);">${icons.chart}</div>
        <div class="vst-info-card__value">${exams.length}</div>
        <div class="vst-info-card__label">إجمالي الامتحانات</div>
      </div>
      <div class="vst-info-card" style="--c:${avg >= 60 ? "var(--success)" : avg >= 40 ? "var(--warning)" : "var(--danger)"}">
        <div class="vst-info-card__icon" style="background:color-mix(in srgb, var(--success) 12%, transparent); color:var(--success);">${icons.check}</div>
        <div class="vst-info-card__value" style="color:${avg >= 60 ? "var(--success)" : avg >= 40 ? "var(--warning)" : "var(--danger)"};">${avg}%</div>
        <div class="vst-info-card__label">المتوسط العام</div>
      </div>
      <div class="vst-info-card" style="--c:var(--success)">
        <div class="vst-info-card__icon" style="background:color-mix(in srgb, var(--success) 12%, transparent); color:var(--success);">${icons.shield}</div>
        <div class="vst-info-card__value">${best}%</div>
        <div class="vst-info-card__label">أعلى درجة</div>
      </div>
      <div class="vst-info-card" style="--c:${attRate >= 70 ? "var(--success)" : attRate >= 40 ? "var(--warning)" : "var(--danger)"}">
        <div class="vst-info-card__icon" style="background:color-mix(in srgb, var(--warning) 12%, transparent); color:var(--warning);">${icons.clock}</div>
        <div class="vst-info-card__value" style="color:${attRate >= 70 ? "var(--success)" : attRate >= 40 ? "var(--warning)" : "var(--danger)"};">${attRate}%</div>
        <div class="vst-info-card__label">نسبة الحضور (30 يوم)</div>
      </div>
    </div>

    ${analytics && statements.length ? `
    <div class="card card-pad vst-analytics-card" style="margin-bottom:16px;">
      <div class="card__head"><div class="card__title">${icons.radar} التحليل المقارن</div></div>
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
          <div class="vst-analytics-kpi__label">الترتيب</div>
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
    <div class="card card-pad" style="margin-bottom:16px;">
      <div class="card__head"><div class="card__title">${icons.radar} مقارنة الأداء</div></div>
      <div class="vst-radar-wrap">${radarSVG}</div>
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

    <div class="card card-pad" style="margin-bottom:16px;">
      <div class="card__head"><div class="card__title">${icons.chart} الدرجات التفصيلية</div></div>
      ${exams.length ? `
        <div class="vst-table">
          <div class="vst-table__header vst-table__row--exams-plus">
            <span>التاريخ</span><span>الامتحان</span><span>النتيجة</span><span>الترتيب</span>
          </div>
          ${exams.map((e) => {
            let scoreDisplay = e.score ?? "—";
            let scoreColor = "";
            let barPct = 0;
            if (e.absent) { scoreDisplay = "غائب"; scoreColor = "var(--danger)"; }
            else if (e.excused) { scoreDisplay = "بعذر"; scoreColor = "var(--warning)"; }
            else if (e.maxScore && e.score != null) {
              const pct = Math.round((e.score / e.maxScore) * 100);
              barPct = pct;
              scoreColor = pct >= 60 ? "var(--success)" : pct >= 40 ? "var(--warning)" : "var(--danger)";
              scoreDisplay = `${e.score}/${e.maxScore}`;
            }
            const examAnalytics = analytics?.examStats.find((a) => a.id === e.id);
            let rankDisplay = "—";
            if (examAnalytics?.percentile != null) {
              const p = examAnalytics.percentile;
              const rank = Math.round((100 - p) / 100 * examAnalytics.totalScored) + 1;
              rankDisplay = `#${rank}`;
            }
            return `
              <div class="vst-table__row vst-table__row--exams-plus" style="position:relative;">
                <span style="font-size:12px;">${formatDateAr(e.date)}</span>
                <span style="font-weight:600;">${escapeHTML(e.title || "")}</span>
                <span style="font-weight:700; color:${scoreColor}; display:flex; align-items:center; gap:8px;">
                  ${barPct > 0 ? `<span style="width:40px; height:6px; background:var(--bg-2); border-radius:3px; display:inline-block; overflow:hidden;"><span style="display:block; height:100%; width:${barPct}%; background:${scoreColor}; border-radius:3px; transition:width .4s ease;"></span></span>` : ""}
                  ${scoreDisplay}
                </span>
                <span style="font-weight:600; font-size:12px;">${rankDisplay}</span>
              </div>`;
          }).join("")}
        </div>` : `<div class="text-muted" style="padding:20px; text-align:center;">لا توجد درجات مسجلة</div>`}
    </div>

    <div class="card card-pad" style="margin-bottom:16px;">
      <div class="card__head"><div class="card__title">${icons.calendar} الحضور — آخر ${recentDays} يوم</div></div>
      <div style="display:flex; gap:4px; flex-wrap:wrap; margin-bottom:12px;">
        ${days.map((d) => {
          let cls = "vst-att-dot";
          if (d.isPresent) cls += " vst-att-dot--present";
          else if (d.st) cls += " vst-att-dot--absent";
          else cls += " vst-att-dot--empty";
          if (d.isToday) cls += " vst-att-dot--today";
          return `<div title="${formatDateAr(d.iso)}${d.st ? ` — ${d.st.name}` : ""}" class="${cls}"></div>`;
        }).join("")}
      </div>
      <div class="vst-att-legend">
        <span><span class="vst-att-legend__dot" style="background:var(--success);"></span>حاضر</span>
        <span><span class="vst-att-legend__dot" style="background:var(--danger);"></span>غائب</span>
        <span><span class="vst-att-legend__dot" style="background:var(--bg-2);"></span>لم يسجل</span>
      </div>
    </div>

    <div class="card card-pad">
      <div class="card__head"><div class="card__title">${icons.clipboard} سجل الحضور (آخر ${recentAtt.length})</div></div>
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
    ${!isStudent ? `
    <div class="vst-followup-actions">
      <button class="btn btn-primary" id="vstAddNoteBtn">${icons.clipboard} إضافة ملاحظة</button>
      <button class="btn btn-success" id="vstSendReportBtn">${icons.whatsapp} إرسال تقرير متابعة شهري</button>
    </div>
    ` : ""}

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

  document.getElementById("vstAddNoteBtn")?.addEventListener("click", () => openAddNoteModal(student));
  document.getElementById("vstSendReportBtn")?.addEventListener("click", () => sendFollowupWhatsApp(student));
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
  Sounds.save();
  toast("تم حفظ الملاحظة بنجاح", "success");
  renderStudentZone();
}

async function sendFollowupWhatsApp(student) {
  if (!student.parentPhone) { toast("لا يوجد تليفون لولي الأمر", "warning"); return; }
  Sounds.messageSent();

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
    centerName: getCenterName(),
  });

  box.innerHTML = `
    <div class="card card-pad">
      <div class="card__head"><div class="card__title">بيانات التواصل</div></div>
      ${detailRow("تليفون الطالب", student.phone || "—")}
      ${detailRow("تليفون ولي الأمر", student.parentPhone || "—")}
      <div style="margin-top:14px; display:flex; flex-direction:column; gap:8px;">
        ${!isStudent ? `
        <button class="btn btn-success" id="vstWaSummaryBtn">${icons.whatsapp} إرسال ملخص واتساب</button>
        <button class="btn btn-outline" id="vstWaCustomBtn">${icons.whatsapp} رسالة مخصصة</button>
        <button class="btn btn-outline" id="vstWaCallBtn">📞 اتصال هاتفي بولي الأمر</button>
        ` : ""}
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

  document.getElementById("vstWaSummaryBtn")?.addEventListener("click", () => {
    if (!student.parentPhone) { toast("لا يوجد تليفون لولي الأمر", "warning"); return; }
    Sounds.messageSent();
    try { openWhatsApp(student.parentPhone, summaryMessage); } catch (e) { /* popup blocker */ }
  });

  document.getElementById("vstWaCustomBtn")?.addEventListener("click", () => {
    if (!student.parentPhone) { toast("لا يوجد تليفون لولي الأمر", "warning"); return; }
    Sounds.messageSent();
    try {
      openWhatsApp(student.parentPhone, renderTemplate("gen_custom_opener", {
        studentName: student.name, centerName: getCenterName(),
      }));
    } catch (e) { /* popup blocker */ }
  });

  document.getElementById("vstWaCallBtn")?.addEventListener("click", () => {
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
    return db.localeCompare(da);
  });

  const grouped = new Map();
  events.forEach((ev) => {
    if (!grouped.has(ev.date)) grouped.set(ev.date, []);
    grouped.get(ev.date).push(ev);
  });

  if (!events.length) {
    box.innerHTML = `
      <div class="card card-pad" style="text-align:center; padding:50px 20px;">
        <div style="font-size:48px; margin-bottom:16px; opacity:.5;">📭</div>
        <div style="font-weight:800; font-size:17px; margin-bottom:4px;">لا توجد أحداث مسجلة</div>
        <div class="text-muted" style="font-size:13px;">لم يُسجَّل أي حدث بعد لهذا الطالب</div>
      </div>`;
    return;
  }

  const attCount   = events.filter((e) => e.type === "attendance").length;
  const examCount  = events.filter((e) => e.type === "exam").length;
  const payCount   = events.filter((e) => e.type === "payment").length;
  const followCount= events.filter((e) => e.type === "followup").length;

  const today = todayISO();
  const monthNames = ["يناير","فبراير","مارس","إبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

  box.innerHTML = `
    <div class="vst-info-grid" style="margin-bottom:16px;">
      <div class="vst-info-card" style="--c:var(--primary)">
        <div class="vst-info-card__icon" style="background:color-mix(in srgb, var(--primary) 12%, transparent); color:var(--primary);">${icons.grid}</div>
        <div class="vst-info-card__value">${events.length}</div>
        <div class="vst-info-card__label">إجمالي الأحداث</div>
      </div>
      <div class="vst-info-card" style="--c:var(--success)">
        <div class="vst-info-card__icon" style="background:color-mix(in srgb, var(--success) 12%, transparent); color:var(--success);">${icons.check}</div>
        <div class="vst-info-card__value">${attCount}</div>
        <div class="vst-info-card__label">حضور</div>
      </div>
      <div class="vst-info-card" style="--c:var(--warning)">
        <div class="vst-info-card__icon" style="background:color-mix(in srgb, var(--warning) 12%, transparent); color:var(--warning);">${icons.chart}</div>
        <div class="vst-info-card__value">${examCount}</div>
        <div class="vst-info-card__label">امتحانات</div>
      </div>
      <div class="vst-info-card" style="--c:var(--primary)">
        <div class="vst-info-card__icon" style="background:color-mix(in srgb, var(--primary) 12%, transparent); color:var(--primary);">${icons.clipboard}</div>
        <div class="vst-info-card__value">${followCount}</div>
        <div class="vst-info-card__label">ملاحظات</div>
      </div>
    </div>

    <div class="vst-timeline">
      ${Array.from(grouped.entries()).map(([date, dayEvents], di) => {
        const dateObj = new Date(date + "T12:00:00");
        const monthKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}`;
        const monthLabel = `${monthNames[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
        const isToday = date === today;

        // حساب أول يوم في الشهر لعرض عنوان الشهر
        const prevDate = di > 0 ? Array.from(grouped.keys())[di - 1] : null;
        const prevMonth = prevDate ? new Date(prevDate + "T12:00:00").getMonth() : -1;
        const showMonth = prevDate ? (dateObj.getMonth() !== prevMonth || dateObj.getFullYear() !== new Date(prevDate + "T12:00:00").getFullYear()) : true;

        return `
          ${showMonth ? `<div class="vst-tl-month">${monthLabel}</div>` : ""}
          <div class="vst-tl-date">
            <span class="vst-tl-date__dot"></span>
            ${formatDateAr(date)}
            ${isToday ? '<span class="badge badge-primary" style="font-size:10px; margin-right:8px;">اليوم</span>' : ""}
          </div>
          ${dayEvents.map((ev) => `
            <div class="vst-tl-event vst-tl-event--${ev.tone}" style="animation-delay:${Math.random() * .15}s;">
              <div class="vst-tl-event__dot"></div>
              <div class="vst-tl-event__card">
                <div class="vst-tl-event__head">
                  ${ev.icon ? `<span class="vst-tl-event__icon">${ev.icon}</span>` : `<span class="vst-tl-event__emoji">${ev.emoji}</span>`}
                  <span class="vst-tl-event__title">${escapeHTML(ev.title)}</span>
                  ${ev.time ? `<span class="vst-tl-event__time">${ev.time}</span>` : ""}
                </div>
                <div class="vst-tl-event__body">${escapeHTML(ev.desc)}</div>
                ${ev.sub ? `<div class="vst-tl-event__sub">${escapeHTML(ev.sub)}</div>` : ""}
              </div>
            </div>
          `).join("")}
        `;
      }).join("")}
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════
//  CSS — يُلحق بالعنصر المُنشأ أعلاه
// ═══════════════════════════════════════════════════════════
style.textContent += `
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
    box-shadow: 0 8px 32px color-mix(in srgb, var(--text) 12%, transparent); max-height: 380px; overflow-y: auto;
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

  /* --- Entrance Animations --- */
  @keyframes fadeUp { from{ opacity:0; transform:translateY(16px) } to{ opacity:1; transform:translateY(0) } }
  @keyframes scaleIn { from{ opacity:0; transform:scale(.92) } to{ opacity:1; transform:scale(1) } }
  .vst-profile-card { animation:fadeUp .35s ease both; }
  .vst-info-card { animation:fadeUp .3s ease both; }
  .vst-info-card:nth-child(1) { animation-delay:.04s; }
  .vst-info-card:nth-child(2) { animation-delay:.08s; }
  .vst-info-card:nth-child(3) { animation-delay:.12s; }
  .vst-info-card:nth-child(4) { animation-delay:.16s; }

  /* --- Profile Card --- */
  .vst-profile-card {
    position:relative; overflow:hidden;
    background: linear-gradient(135deg, var(--primary) 0%, color-mix(in srgb, var(--primary) 70%, black) 100%);
    border-radius: 18px; padding: 24px; color: #fff; margin-bottom: 20px;
    box-shadow: 0 8px 32px color-mix(in srgb, var(--primary) 30%, transparent);
  }
  .vst-profile-card::before {
    content:''; position:absolute; top:-50%; right:-30%; width:300px; height:300px;
    border-radius:50%; background:rgba(255,255,255,.06);
  }
  .vst-profile-card::after {
    content:''; position:absolute; bottom:-40%; left:-20%; width:200px; height:200px;
    border-radius:50%; background:rgba(255,255,255,.04);
  }
  .vst-profile-card__header { display: flex; align-items: center; gap: 16px; position:relative; z-index:1; }
  .vst-profile-card__avatar {
    width: 60px; height: 60px; border-radius: 16px;
    background: rgba(255,255,255,.2);
    backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center;
    font-size: 22px; font-weight: 800; flex-shrink: 0;
    box-shadow: 0 4px 12px color-mix(in srgb, var(--text) 10%, transparent);
  }
  .vst-profile-card__info { flex: 1; min-width:0; }
  .vst-profile-card__name { font-size: 20px; font-weight: 800; letter-spacing:-.3px; }
  .vst-profile-card__meta { font-size: 12px; opacity: .85; margin-top: 3px; display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
  .vst-profile-card__meta-sep { opacity:.4; }
  .vst-profile-card__badges { display: flex; gap: 6px; flex-wrap: wrap; flex-shrink: 0; align-items:flex-start; }
  .vst-badge {
    display: inline-flex; align-items: center; gap: 5px; padding: 5px 12px;
    border-radius: 20px; font-size: 11.5px; font-weight: 700;
    backdrop-filter: blur(4px);
  }
  .vst-badge--success { background: color-mix(in srgb, var(--success) 35%, transparent); }
  .vst-badge--danger { background: color-mix(in srgb, var(--danger) 60%, transparent); }
  .vst-badge--warning { background: color-mix(in srgb, var(--warning) 60%, transparent); }
  .vst-badge svg { width: 13px; height: 13px; }

  /* --- Tabs --- */
  .vst-tabs {
    display: flex; gap: 6px; margin-bottom: 20px; overflow-x: auto; scrollbar-width: none;
    padding:4px; background:var(--bg); border-radius:14px;
    animation:fadeUp .35s ease both;
  }
  .vst-tabs::-webkit-scrollbar { display: none; }
  .vst-tab {
    padding: 10px 18px; border-radius: 10px; border: none; background: transparent;
    font-family: inherit; font-size: 12.5px; font-weight: 700; color: var(--muted);
    cursor: pointer; white-space: nowrap; transition: all .25s ease;
    display: inline-flex; align-items: center; gap: 7px; flex-shrink:0;
  }
  .vst-tab:hover { color: var(--text); background:var(--bg-2); }
  .vst-tab.is-active { background: var(--primary); color: #fff; box-shadow:0 2px 8px color-mix(in srgb, var(--primary) 30%, transparent); }
  .vst-tab__icon { width: 16px; height: 16px; }
  .vst-tab__icon svg { width: 16px; height: 16px; }

  /* --- Info Grid (Profile Tab) --- */
  .vst-info-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(145px, 1fr)); gap: 12px; }
  .vst-info-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
    padding: 18px 14px; text-align: center; box-shadow:var(--shadow-sm);
    transition:transform .2s ease, box-shadow .2s ease;
    position:relative; overflow:hidden;
  }
  .vst-info-card::before { content:""; position:absolute; top:0; right:0; left:0; height:3px; background:var(--c,var(--primary)); }
  .vst-info-card:hover { transform:translateY(-3px); box-shadow:var(--shadow-md); }
  .vst-info-card__icon {
    width: 42px; height: 42px; border-radius: 12px;
    display: flex; align-items: center; justify-content: center; margin: 0 auto 10px;
  }
  .vst-info-card__icon svg { width: 20px; height: 20px; }
  .vst-info-card__value { font-size: 24px; font-weight: 800; letter-spacing:-.5px; }
  .vst-info-card__label { font-size: 11px; color: var(--muted); margin-top: 3px; font-weight:600; }

  /* --- Detail Rows --- */
  .vst-detail-grid { display:grid; grid-template-columns:1fr 1fr; gap:0; }
  .vst-detail-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 14px; font-size: 13px;
    border-bottom: 1px solid var(--border);
  }
  .vst-detail-row:nth-child(odd) { background:var(--bg); }
  .vst-detail-row:last-child { border-bottom: none; }
  .vst-detail-label { color: var(--muted); font-weight: 600; flex-shrink: 0; margin-left: 8px; }

  /* --- Attendance Tab --- */
  .vst-att-status-bar { margin-bottom: 16px; }

  /* --- Finance Tab --- */
  .vst-finance-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(145px, 1fr)); gap: 12px; }
  .vst-finance-box { border-radius: 14px; padding: 20px 16px; text-align: center; color: #fff; position:relative; overflow:hidden; }
  .vst-finance-box::before { content:""; position:absolute; top:-20%; right:-20%; width:100px; height:100px; border-radius:50%; background:rgba(255,255,255,.08); }
  .vst-finance-box--wallet { background: linear-gradient(135deg, color-mix(in srgb, var(--success) 80%, white), color-mix(in srgb, var(--success) 70%, black)); }
  .vst-finance-box--debt { background: linear-gradient(135deg, var(--danger), color-mix(in srgb, var(--danger) 70%, black)); }
  .vst-finance-box--charges { background: linear-gradient(135deg, var(--warning), color-mix(in srgb, var(--warning) 70%, black)); }
  .vst-finance-box--session { background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 60%, black)); }
  .vst-finance-box__icon { width: 36px; height: 36px; margin: 0 auto 8px; }
  .vst-finance-box__icon svg { width: 22px; height: 22px; }
  .vst-finance-box__value { font-size: 20px; font-weight: 800; letter-spacing:-.3px; }
  .vst-finance-box__label { font-size: 11.5px; opacity: .85; font-weight:600; }
  .vst-ledger-amount { font-weight: 700; font-size: 15px; letter-spacing:-.3px; }
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
  .vst-table__row--exams-plus { grid-template-columns: 1fr 1fr 1fr 1fr; }
  .vst-table__header.vst-table__row--exams-plus { grid-template-columns: 1fr 1fr 1fr 1fr; }
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
  .vst-schedule__day.is-active { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 8%, transparent); }
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

  /* --- Timeline Month header --- */
  .vst-tl-month {
    font-size:13px; font-weight:800; color:var(--primary); padding:16px 0 8px 32px;
    text-transform:uppercase; letter-spacing:1px; position:relative;
  }
  .vst-tl-month:first-child { padding-top:4px; }

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
    padding: 12px 14px; transition: transform .15s ease, box-shadow .15s ease;
    animation:fadeUp .3s ease both;
  }
  .vst-tl-event__card:hover { transform: translateX(-2px);     box-shadow: 0 2px 12px color-mix(in srgb, var(--text) 6%, transparent); }

  .vst-tl-event--success .vst-tl-event__card { border-right: 3px solid var(--success); }
  .vst-tl-event--danger  .vst-tl-event__card { border-right: 3px solid var(--danger); }
  .vst-tl-event--warning .vst-tl-event__card { border-right: 3px solid var(--warning); }
  .vst-tl-event--primary .vst-tl-event__card { border-right: 3px solid var(--primary); }

  .vst-tl-event__head { display: flex; align-items: center; gap: 8px; }
  .vst-tl-event__icon { width:20px; height:20px; flex-shrink:0; display:flex; align-items:center; justify-content:center; }
  .vst-tl-event__icon svg { width:18px; height:18px; }
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
  .vst-statement--success { background: color-mix(in srgb, var(--success) 6%, transparent); border-right-color: var(--success); }
  .vst-statement--warning { background: color-mix(in srgb, var(--warning) 6%, transparent); border-right-color: var(--warning); }
  .vst-statement--danger  { background: color-mix(in srgb, var(--danger) 6%, transparent);  border-right-color: var(--danger); }
  .vst-statement--primary { background: color-mix(in srgb, var(--primary) 6%, transparent); border-right-color: var(--primary); }
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

  /* --- Mini attendance calendar --- */
  .vst-att-dot { width:18px; height:18px; border-radius:4px; cursor:pointer; transition:transform .15s ease; position:relative; }
  .vst-att-dot:hover { transform:scale(1.35); z-index:2; }
  .vst-att-dot--present { background:var(--success); }
  .vst-att-dot--absent { background:var(--danger); }
  .vst-att-dot--empty { background:var(--bg-2); }
  .vst-att-dot--today { outline:2px solid var(--primary); outline-offset:2px; }
  .vst-att-legend { display:flex; gap:14px; font-size:11px; color:var(--muted); margin-top:12px; }
  .vst-att-legend__dot { display:inline-block; width:10px; height:10px; border-radius:2px; margin-left:4px; }

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
    text-align: center; padding: 20px; background: color-mix(in srgb, var(--success) 6%, transparent);
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
    .vst-profile-card { padding:18px; }
    .vst-profile-card__header { flex-wrap: wrap; gap:12px; }
    .vst-profile-card__avatar { width:48px; height:48px; font-size:18px; }
    .vst-profile-card__name { font-size:17px; }
    .vst-detail-grid { grid-template-columns:1fr; }
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
    .vst-info-grid { grid-template-columns: repeat(2, 1fr); }
    .vst-schedule { grid-template-columns: repeat(4, 1fr); }
    .vst-history-row { grid-template-columns: 1fr 80px; }
    .vst-history-row > :nth-child(2) { display: none; }
    .vst-history-header { grid-template-columns: 1fr 80px; }
    .vst-history-header > :nth-child(2) { display: none; }
    .vst-tl-stats { grid-template-columns: repeat(2, 1fr); }
    .vst-tl-stat__num { font-size: 18px; }
  }
  @media (max-width: 400px) {
    .vst-schedule { grid-template-columns: repeat(2, 1fr); }
  }
`;
// style already appended above
