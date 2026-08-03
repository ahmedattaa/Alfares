// =========================================================
// بوابة العائلة — Family Portal
// صفحة خارجية بعد تسجيل الدخول — وضع العرض فقط
// نظرة عامة · آخر التحديثات (فيد موحد) · التفاصيل (حضور · مالية · درجات) · ملف الطالب
// لا تحتوي على أي إجراءات تحصيل أو تعديل — إدارة كاملة داخل السنتر
// =========================================================

import { icons } from "./icons.js";
import {
  seedIfNeeded, getSession, logout, flushPendingWrites,
  getStudents, getGroups, getGrades, getStudentStatuses,
  getAttendance, getPayments, getExams, getExtraCharges,
  getWalletTransactions, getFollowupLogs, getLastFollowupLog,
  getSubjects, getTopics, getQuestions, getExamAnswersForStudent,
  getAchievementsForStudent, getEscalationLogsForStudent,
  getSettings, getWhatsApp, isFeatureEnabled,
  isParentPortalEnabled, isStudentPortalEnabled, getTeachingSubject,
  findStudentAccount, setStudentPassword, setStudentUsername,
} from "./storage.js";
import { escapeHTML, formatMoney, todayISO, formatDateAr, initials, addDays, studentAvatar } from "./helpers.js";
import { gradeName, findGroup, dueAmount } from "./lookups.js";
import { computeHealthScore, getHealthColor, getHealthLabel } from "./health-score.js";
import { isStudentLocked } from "./attendance-service.js";
import { parentUpdate } from "./remediation-service.js";
import { computeFinanceBreakdown } from "./finance-panel.js";
import { toast } from "./ui.js";
import { formatTimeAr, formatDaysAr, WEEKDAY_OPTIONS } from "./schedule.js";
import { buildWhatsAppLink } from "./whatsapp.js";
import { appPath } from "./paths.js";

const TABS = [
  { id: "overview", label: "نظرة عامة",      icon: icons.radar },
  { id: "updates",  label: "آخر التحديثات",   icon: icons.clock },
  { id: "details",  label: "التفاصيل",        icon: icons.chart },
  { id: "profile",  label: "ملف الطالب",      icon: icons.users },
];

// ═══════════════════════════════════════════════════════════
//  البوابة — تحقق من الدخول + بناء الهيكل الخارجي
// ═══════════════════════════════════════════════════════════

async function initPortal() {
  await seedIfNeeded();
  const session = getSession();
  if (!session) {
    window.location.href = appPath("login.html");
    return null;
  }
  if (session.role !== "parent" && session.role !== "student") {
    window.location.href = appPath("staff/dashboard.html");
    return null;
  }
  if (session.role === "parent" && !isParentPortalEnabled()) {
    logout();
    await flushPendingWrites();
    window.location.href = appPath("login.html");
    return null;
  }
  if (session.role === "student" && !isStudentPortalEnabled()) {
    logout();
    await flushPendingWrites();
    window.location.href = appPath("login.html");
    return null;
  }
  return renderShell();
}

function renderShell() {
  const settings = getSettings();
  const session = getSession();
  const centerName = settings.centerName || "سنتر تعليمي";
  const isStudent = session?.role === "student";

  document.body.insertAdjacentHTML("afterbegin", `
    <div class="pp-shell">
      <header class="pp-header">
        <div class="pp-header__inner">
          <div class="pp-brand">
            <div class="pp-brand__mark">${initials(centerName)}</div>
            <div style="min-width:0">
              <div class="pp-brand__name">${escapeHTML(centerName)}</div>
              <div class="pp-brand__sub">${isStudent ? "بوابة الطالب" : "بوابة العائلة · Family Portal"}</div>
            </div>
          </div>
          <div class="pp-header__user">
            <div class="pp-user-chip">
              <div class="pp-user-chip__avatar">${initials(session?.name || "م")}</div>
              <div style="text-align:right">
                <div class="pp-user-chip__name">${escapeHTML(session?.name || "")}</div>
                <div class="pp-user-chip__role">${isStudent ? "طالب" : "ولي أمر"}</div>
              </div>
            </div>
            <button class="btn btn-outline btn-sm" id="ppLogoutBtn" style="gap:6px;">${icons.logout} خروج</button>
          </div>
        </div>
      </header>
      <main class="pp-main" id="ppMain"></main>
    </div>
    <div class="toast-stack" id="toastStack"></div>
  `);

  document.getElementById("ppLogoutBtn").addEventListener("click", async () => {
    logout();
    await flushPendingWrites();
    window.location.href = appPath("login.html");
  });

  return document.getElementById("ppMain");
}

const content = await initPortal();

let selectedStudentId = null;
let activeTab = "overview";

const session = getSession();
const isStudent = session?.role === "student";
const allowedStudentIds = isStudent
  ? [session?.studentId].filter(Boolean)
  : (session?.linkedStudentIds || []);

if (content) {
  const urlParams = new URLSearchParams(window.location.search);
  const urlStudentId = urlParams.get("studentId");
  const autoTarget = (urlStudentId && allowedStudentIds.includes(urlStudentId))
    ? urlStudentId
    : (allowedStudentIds.length === 1 ? allowedStudentIds[0] : null);

  if (autoTarget) selectedStudentId = autoTarget;

  render();
}

// ═══════════════════════════════════════════════════════════
//  الرئيسية
// ═══════════════════════════════════════════════════════════

function render() {
  const showDashboard = !selectedStudentId && allowedStudentIds.length !== 1;
  const headStudent = !showDashboard ? getStudents().find((s) => s.id === selectedStudentId) : null;

  content.innerHTML = `
    <div class="pp-page-head">
      <div class="pp-page-head__top">
        <div class="pp-page-head__main">
          <div class="pp-page-title">${showDashboard ? icons.grid + " لوحة العائلة" : isStudent ? icons.shield + " ملفي الدراسي" : icons.shield + " متابعة ابنك"}</div>
          <div class="pp-page-subtitle">${showDashboard ? "جميع أبنائك المسجلين في السنتر — اختر أحدهم لعرض تفاصيله" : isStudent ? "متابعة درجاتك وحضورك وملفك الدراسي وترتيبك" : "نظرة عامة على وضع ابنك في دقيقة — الصحة، الحضور، الدرجات، والمتابعة"}</div>
        </div>
        ${headStudent ? `<div class="pp-page-head__photo" title="${escapeHTML(headStudent.name || "")}"><span class="pp-photo-frame">${studentAvatar(headStudent, 84)}</span></div>` : ""}
      </div>
      ${!showDashboard ? `<div class="pp-tagline"><span class="pp-tagline__star">✦</span> مركز الفارس للمتابعة الدقيقة — نرصد الأداء لنصنع التفوق</div>` : ""}
    </div>
    ${showDashboard ? renderFamilyDashboardHTML() : `<div id="ppStudentZone"></div>`}
  `;

  if (showDashboard) {
    content.querySelectorAll(".ps-card[data-sid]").forEach((el) =>
      el.addEventListener("click", () => selectStudent(el.dataset.sid))
    );
  } else {
    renderStudentZone();
  }
}

function renderFamilyDashboardHTML() {
  const all = getStudents().filter((s) => allowedStudentIds.includes(s.id));
  const groups = getGroups();
  const walletOn = isFeatureEnabled("wallet");
  const totalWallet = walletOn ? all.reduce((sum, s) => sum + Number(s.walletBalance || 0), 0) : 0;
  const totalDebt = all.reduce((sum, s) => sum + Number(s.lateBalance || 0), 0);
  const colors = ["#4F6EF7", "#F59E0B", "#10B981", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316"];

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
          const c = colors[i % colors.length];

          let badges = "";
          if (walletOn && wallet > 0) badges += `<span class="ps-card__badge ps-card__badge--wallet">${icons.wallet} ${formatMoney(wallet)}</span>`;
          if (debt > 0) badges += `<span class="ps-card__badge ps-card__badge--debt">${icons.money} ${formatMoney(debt)}</span>`;
          if (s.status !== "active") badges += `<span class="ps-card__badge ps-card__badge--inactive">غير نشط</span>`;
          if (!badges) badges = `<span class="ps-card__badge ps-card__badge--status">${icons.check} نشط</span>`;

          return `
          <div class="ps-card" data-sid="${s.id}" style="--c:${c}">
              <div class="ps-card__top">
              ${studentAvatar(s, 46)}
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
        ${all.length === 0 ? `
        <div class="ps-card__empty">
          <div style="font-size:40px; margin-bottom:8px;">${icons.users}</div>
          <div style="font-weight:700;">لا يوجد أبناء مسجلين</div>
          <div class="text-muted" style="font-size:12px; margin-top:4px;">تواصل مع إدارة السنتر لربط ملف ابنك بحسابك</div>
        </div>` : ""}
      </div>
    </div>`;
}

function selectStudent(id) {
  if (!allowedStudentIds.includes(id)) {
    toast("لا يمكنك عرض هذا الطالب", "warning");
    return;
  }
  selectedStudentId = id;
  activeTab = "overview";
  render();
}

// ═══════════════════════════════════════════════════════════
//  كارت الطالب + التبويبات
// ═══════════════════════════════════════════════════════════

function renderStudentZone() {
  const zone = document.getElementById("ppStudentZone");
  const student = getStudents().find((s) => s.id === selectedStudentId);
  if (!student) {
    zone.innerHTML = `<div class="text-muted" style="padding:40px; text-align:center;">لم يتم العثور على الطالب</div>`;
    return;
  }

  const group = findGroup(getGroups(), student.groupId);
  const grade = gradeName(getGrades(), student.gradeId);
  const wallet = Number(student.walletBalance || 0);
  const debt = Number(student.lateBalance || 0);
  const locked = isStudentLocked(student);
  const showBack = allowedStudentIds.length > 1;

  zone.innerHTML = `
    ${showBack ? `<div style="margin-bottom:14px;"><button class="pp-back-btn" id="ppBackBtn"><span class="pp-back-btn__arrow">›</span> العودة لجميع الأبناء</button></div>` : ""}
    <div class="vst-profile-card">
      <div class="vst-profile-card__header">
        ${studentAvatar(student, 56)}
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

    <div class="vst-layout">
      <div class="vst-tabs">
        ${TABS.map((t) => `
          <button class="vst-tab ${activeTab === t.id ? "is-active" : ""}" data-tab="${t.id}">
            ${t.icon ? `<span class="vst-tab__icon">${t.icon}</span>` : ""}${t.label}
          </button>
        `).join("")}
      </div>

      <div id="ppTabContent"></div>
    </div>
  `;

  zone.querySelectorAll(".vst-tab").forEach((btn) =>
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      renderStudentZone();
    })
  );

  const backBtn = document.getElementById("ppBackBtn");
  if (backBtn) backBtn.addEventListener("click", () => { selectedStudentId = null; render(); });

  renderTabContent();
}

function renderTabContent() {
  const box = document.getElementById("ppTabContent");
  const student = getStudents().find((s) => s.id === selectedStudentId);
  if (!student || !box) return;

  if (activeTab === "overview") return renderOverviewTab(box, student);
  if (activeTab === "updates")  return renderUpdatesTab(box, student);
  if (activeTab === "details")  return renderDetailsTab(box, student);
  if (activeTab === "profile")  return renderProfileTab(box, student);
}

// آخر التحديثات — فيد موحد: تواصل + متابعة الإدارة + الخط الزمني بفلاتر
function renderUpdatesTab(box, student) {
  const followups = getFollowupLogs().filter((l) => l.studentId === student.id).reverse().slice(0, 30);
  const escalations = getEscalationLogsForStudent(student.id).slice(-5).reverse();
  const achievements = getAchievementsForStudent(student.id).slice(-5).reverse();

  const settings = getSettings();
  const centerName = settings.centerName || "سنتر تعليمي";
  const centerPhone = settings.phone || "";
  const waPhone = getWhatsApp() || centerPhone;
  const waMessage = `السلام عليكم ورحمة الله،\nأنا ${isStudent ? "الطالب" : "ولي أمر"} ${student.name} (كود: ${student.code || "—"})\nأود التواصل بخصوص ${isStudent ? "ملفي" : "ملف"} الدراسي.`;

  const events = buildTimelineEvents(student);
  events.sort((a, b) => ((b.date || "") + (b.time || "99:99")).localeCompare((a.date || "") + (a.time || "99:99")));

  box.innerHTML = `
    <div class="card card-pad">
      <div class="card__head"><div class="card__title">${icons.whatsapp} تواصل مع المستر</div></div>
      ${waPhone ? `
      <div class="pp-contact-grid">
        <a class="pp-contact-card pp-contact-card--wa" href="${buildWhatsAppLink(waPhone, waMessage)}" target="_blank" rel="noopener">
          <div class="pp-contact-card__icon">${icons.whatsapp}</div>
          <div>
            <div class="pp-contact-card__title">واتساب — ${escapeHTML(centerName)}</div>
            <div class="pp-contact-card__sub">${escapeHTML(waPhone)} · رسالة جاهزة باسم الطالب</div>
          </div>
          <span class="pp-contact-card__go">${icons.arrowLeft}</span>
        </a>
        ${centerPhone ? `
        <a class="pp-contact-card pp-contact-card--call" href="tel:${encodeURIComponent(centerPhone)}">
          <div class="pp-contact-card__icon">${icons.phone}</div>
          <div>
            <div class="pp-contact-card__title">اتصال هاتفي بالسنتر</div>
            <div class="pp-contact-card__sub">${escapeHTML(centerPhone)}</div>
          </div>
          <span class="pp-contact-card__go">${icons.arrowLeft}</span>
        </a>` : ""}
      </div>
      <div class="pp-note-hint">${icons.info} يتواصل معك فريق السنتر لمعرفة آخر المستجدات على مدار العام</div>
      ` : `<div class="text-muted" style="padding:16px; text-align:center;">لم تُسجَّل بيانات تواصل للسنتر — اسأل الإدارة داخل السنتر</div>`}
    </div>

    <div class="card card-pad" style="margin-top:16px;">
      <div class="card__head"><div class="card__title">${icons.users} ماذا تفعل الإدارة؟</div></div>
      ${fpTreatmentBlock(followups, escalations, achievements)}
    </div>

    <div class="pp-feed-head" style="margin-top:16px;">
      <div class="pp-feed-title">${icons.clock} آخر التحديثات</div>
      <div class="pp-feed-filters">
        <button class="pp-filter-btn is-active" data-filter="all">الكل</button>
        <button class="pp-filter-btn" data-filter="attendance">الحضور</button>
        <button class="pp-filter-btn" data-filter="exam">الامتحانات</button>
        <button class="pp-filter-btn" data-filter="finance">المالية</button>
        <button class="pp-filter-btn" data-filter="followup">المتابعة</button>
      </div>
    </div>
    <div id="ppFeedBox"></div>
  `;

  const feedBox = document.getElementById("ppFeedBox");
  if (feedBox) renderTimelineFeed(feedBox, events, "all");

  box.querySelectorAll(".pp-filter-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      box.querySelectorAll(".pp-filter-btn").forEach((b) => b.classList.toggle("is-active", b === btn));
      if (feedBox) renderTimelineFeed(feedBox, events, btn.dataset.filter);
    })
  );
}

// التفاصيل — ثلاثة أقسام قابلة للطي (الحضور / الدرجات والترتيب / المالية)
let ppOpenSection = null;

function renderDetailsTab(box, student) {
  box.innerHTML = `
    <div class="pp-acc">
      <details class="pp-acc__item" ${ppOpenSection === "attendance" ? "open" : ""}>
        <summary class="pp-acc__head">
          <span class="pp-acc__icon" style="color:var(--success);">${icons.check}</span>
          <span class="pp-acc__title">الحضور والسجل</span>
          <span class="pp-acc__chev">▾</span>
        </summary>
        <div class="pp-acc__body" id="ppDetAttendance"></div>
      </details>
      <details class="pp-acc__item" ${ppOpenSection === "grades" ? "open" : ""}>
        <summary class="pp-acc__head">
          <span class="pp-acc__icon" style="color:var(--warning);">${icons.chart}</span>
          <span class="pp-acc__title">الدرجات والترتيب</span>
          <span class="pp-acc__chev">▾</span>
        </summary>
        <div class="pp-acc__body" id="ppDetGrades"></div>
      </details>
      <details class="pp-acc__item" ${ppOpenSection === "finance" ? "open" : ""}>
        <summary class="pp-acc__head">
          <span class="pp-acc__icon" style="color:var(--danger);">${icons.wallet}</span>
          <span class="pp-acc__title">المالية والمستحقات</span>
          <span class="pp-acc__chev">▾</span>
        </summary>
        <div class="pp-acc__body" id="ppDetFinance"></div>
      </details>
    </div>
  `;

  const att = document.getElementById("ppDetAttendance");
  const gra = document.getElementById("ppDetGrades");
  const fin = document.getElementById("ppDetFinance");
  if (att) renderAttendanceTab(att, student);
  if (gra) renderGradesTab(gra, student);
  if (fin) renderFinanceTab(fin, student);
}

function detailRow(label, value) {
  return `<div class="vst-detail-row"><span class="vst-detail-label">${escapeHTML(label)}</span><span>${escapeHTML(String(value))}</span></div>`;
}

// ═══════════════════════════════════════════════════════════
//  تبويب ٠ — نظرة عامة (Family Overview) — فحص الدقيقة الواحدة
// ═══════════════════════════════════════════════════════════

function renderOverviewTab(box, student) {
  const h = computeHealthScore(student.id);
  const healthColor = getHealthColor(h.total);
  const healthLabel = getHealthLabel(h.total);
  const analytics = computeComparativeAnalytics(student);
  const rank = computeStudentRank(student);
  const narrative = fpNarrative(student, h, analytics);
  const practiceEnabled = isStudentPortalEnabled();
  const mastery = practiceEnabled ? masteryBySubject(student.id) : null;
  const mistakeT = practiceEnabled ? mistakeTopics(student.id) : [];
  const weekEvents = fpWeekEvents(student).slice(0, 3);
  const followups = getFollowupLogs().filter((l) => l.studentId === student.id).reverse().slice(0, 4);
  const escalations = getEscalationLogsForStudent(student.id).slice(-3).reverse();
  const achievements = getAchievementsForStudent(student.id).slice(-3).reverse();
  const debt = Number(student.lateBalance || 0);
  const locked = isStudentLocked(student);
  const wallet = isFeatureEnabled("wallet") ? Number(student.walletBalance || 0) : 0;
  const netDue = Math.max(0, debt - wallet);

  box.innerHTML = `
    <div class="card card-pad fp-card-health">
      <div class="card__head">
        <div class="card__title">${icons.radar} مؤشر صحة الطالب التعليمية</div>
        ${fpHealthChip(h.total, healthColor, healthLabel)}
      </div>
      ${healthIndicatorHTML(h, healthColor, healthLabel)}
    </div>

    ${narrative.length ? `
    <div class="card card-pad fp-narrative" style="margin-top:16px;">
      <div class="card__head"><div class="card__title">${icons.radar} ملخص ذكي</div></div>
      <div class="vst-statements">
        ${narrative.map((s) => `
          <div class="vst-statement vst-statement--${s.tone}">
            <span class="vst-statement__emoji">${s.emoji}</span>
            <span>${escapeHTML(s.text)}</span>
          </div>
        `).join("")}
      </div>
    </div>` : ""}

    ${(() => { try { const up = parentUpdate(student.id); return `
      <div class="card card-pad" style="margin-top:16px; border-right:3px solid var(--primary);">
        <div class="card__head"><div class="card__title">💬 رسالة داعمة</div></div>
        <div style="font-size:14.5px; font-weight:800; margin-bottom:8px;">${escapeHTML(up.headline)}</div>
        <ul style="margin:0; padding-right:18px; line-height:1.9; font-size:13.5px; color:var(--text);">
          ${up.messageLines.map((l) => `<li>${escapeHTML(l)}</li>`).join("")}
        </ul>
      </div>`; } catch (e) { console.error(e); return ""; } })()}

    <div class="fp-cards" style="margin-top:16px;">
      ${fpStatusCards(student, h, rank, analytics)}
    </div>

    ${fpFinanceStripHTML(student, locked, netDue)}

    ${fpQuickActionsHTML()}

    <div class="fp-grid-2" style="margin-top:16px;">
      <div class="card card-pad">
        <div class="card__head">
          <div class="card__title">${icons.clipboard} ماذا حدث هذا الأسبوع؟</div>
          <button class="pp-goto-btn pp-goto-btn--link" data-goto="updates">عرض الكل</button>
        </div>
        ${fpWeekTimelineHTML(weekEvents)}
      </div>
      ${practiceEnabled ? `<div>${fpSkillsBlock(mastery, mistakeT)}</div>` : ""}
    </div>

    <div class="card card-pad" style="margin-top:16px;">
      <div class="card__head">
        <div class="card__title">${icons.users} ماذا تفعل الإدارة؟</div>
        <button class="pp-goto-btn pp-goto-btn--link" data-goto="updates">التفاصيل</button>
      </div>
      ${fpTreatmentShort(escalations, followups, achievements)}
    </div>
  `;

  box.querySelectorAll("[data-goto]").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (btn.dataset.open) ppOpenSection = btn.dataset.open;
      activeTab = btn.dataset.goto;
      renderStudentZone();
    })
  );
}

function fpHealthChip(score, color, label) {
  const isOrange = label === "محتاج متابعة";
  const css = isOrange ? "var(--warning)" : color === "success" ? "var(--success)" : "var(--danger)";
  const emoji = color === "success" ? "🟢" : isOrange ? "🟠" : "🔴";
  return `<span class="fp-health-chip" style="background:color-mix(in srgb, ${css} 12%, transparent); color:${css};"><span style="font-size:14px;">${emoji}</span> ${label}</span>`;
}

function healthIndicatorHTML(h, color, label) {
  const isOrange = label === "محتاج متابعة";
  const css = isOrange ? "var(--warning)" : color === "success" ? "var(--success)" : "var(--danger)";
  const emoji = color === "success" ? "🟢" : isOrange ? "🟠" : "🔴";
  const msg = color === "success"
    ? "ابنك ماشي كويس — واصلوا على نفس المستوى"
    : isOrange
      ? "ابنك محتاج شوية متابعة — لسه في الحلبة"
      : "ابنك في خطر — لازم تدخل سريع من الإدارة";
  const deg = Math.max(0, Math.min(100, h.total)) * 3.6;
  return `
    <div class="fp-health">
      <div class="fp-health__gauge">
        <svg viewBox="0 0 120 120" class="fp-health__svg">
          <defs>
            <linearGradient id="hpGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:${css}"/>
              <stop offset="100%" style="stop-color:${color === "success" ? "var(--secondary)" : "var(--primary)"}"/>
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r="50" fill="none" stroke="var(--border)" stroke-width="11"/>
          <circle cx="60" cy="60" r="50" fill="none" stroke="url(#hpGrad)" stroke-width="11" stroke-linecap="round"
                  stroke-dasharray="${(deg / 360) * (2 * Math.PI * 50)} ${2 * Math.PI * 50}"
                  transform="rotate(-90 60 60)"/>
        </svg>
        <div class="fp-health__gauge-inner">
          <div class="fp-health__score" style="color:${css};">${h.total}</div>
          <div class="fp-health__max">/100</div>
        </div>
      </div>
      <div class="fp-health__info">
        <div class="fp-health__emoji">${emoji}</div>
        <div class="fp-health__label" style="color:${css};">${label}</div>
        <div class="fp-health__sub">${msg}</div>
        <div class="fp-health__break">
          <div class="fp-health__b"><span>الحضور</span><b>${h.attendanceRate}%</b></div>
          <div class="fp-health__b"><span>الدرجات</span><b>${h.hasExams ? h.examAvg + "%" : "—"}</b></div>
          <div class="fp-health__b"><span>السلوك</span><b>${h.behaviorScore}/20</b></div>
        </div>
      </div>
    </div>`;
}

function fpAttendanceWindow(studentId) {
  const all = getAttendance().filter((a) => a.studentId === studentId && a.category === "attendance");
  const last30 = all.filter((a) => (Date.now() - new Date(a.date).getTime()) / 86400000 <= 30);
  return last30.length >= 2 ? last30 : all;
}

function fpStatusCards(student, h, rank, analytics) {
  const statuses = getStudentStatuses();
  const presentIds = new Set(statuses.filter((s) => s.presence === "present").map((s) => s.id));
  const last30 = fpAttendanceWindow(student.id);
  const present = last30.filter((a) => presentIds.has(a.statusId)).length;
  const absent = last30.length - present;
  const attRate = last30.length ? Math.round((present / last30.length) * 100) : 0;

  const avg = analytics?.overallStudentAvg ?? h.examAvg;
  const practiceEnabled = isStudentPortalEnabled();
  const answers = practiceEnabled ? getExamAnswersForStudent(student.id) : [];
  const correct = answers.filter((a) => a.isCorrect).length;
  const accuracy = answers.length ? Math.round((correct / answers.length) * 100) : null;

  const rankText = qualifyRankText(rank);

  const items = [
    { icon: icons.check, value: `${attRate}%`, label: "نسبة الحضور", sub: `${present} حضور من ${last30.length}${last30.length < 10 ? " سجل" : ""}`, tone: attRate >= 70 ? "success" : attRate >= 40 ? "warning" : "danger" },
    { icon: icons.x, value: `${absent}`, label: "أيام الغياب", sub: "إجمالي الغياب المسجل", tone: absent === 0 ? "success" : absent <= 2 ? "warning" : "danger" },
    { icon: icons.chart, value: avg != null ? `${avg}%` : "—", label: "متوسط الامتحانات", sub: analytics ? `المجموعة ${analytics.overallGroupAvg}%` : "", tone: avg == null ? "muted" : avg >= 60 ? "success" : avg >= 40 ? "warning" : "danger" },
    { icon: icons.grid, value: rankText, label: "الترتيب", sub: "داخل مجموعته", tone: rank?.group ? (rank.group.percentile >= 75 ? "success" : rank.group.percentile >= 40 ? "warning" : "danger") : "muted" },
  ];
  if (accuracy != null) items.push({ icon: icons.shield, value: `${accuracy}%`, label: "دقة التدريب", sub: `${correct}/${answers.length} سؤال`, tone: accuracy >= 60 ? "success" : accuracy >= 40 ? "warning" : "danger" });

  return items.map((it) => `
    <div class="fp-card" style="--c:var(--${it.tone});">
      <div class="fp-card__icon">${it.icon}</div>
      <div class="fp-card__body">
        <div class="fp-card__value">${it.value}</div>
        <div class="fp-card__label">${escapeHTML(it.label)}</div>
        ${it.sub ? `<div class="fp-card__sub">${escapeHTML(it.sub)}</div>` : ""}
      </div>
    </div>`).join("");
}

function qualifyRankText(rank) {
  if (!rank?.group) return "—";
  const p = rank.group.percentile;
  if (p >= 85) return "من الأوائل";
  if (p >= 60) return "فوق المتوسط";
  if (p >= 40) return "حول المتوسط";
  return "محتاج مجهود";
}

function fpFinanceStripHTML(student, locked, netDue) {
  const state = locked || netDue > 0 ? "debt" : "cleared";
  const icon = locked || netDue > 0 ? icons.alert : icons.check;
  const title = locked ? "الطالب مقفول حالياً" : netDue > 0 ? "عليه مبلغ مستحق" : "الحساب المالي سليم";
  const sub = locked
    ? "مقفول بسبب غياب متكرر — يرجى التواصل مع الإدارة لفك القفل"
    : netDue > 0
      ? `المطلوب حالياً ${formatMoney(netDue)} — تواصل مع الإدارة للتسوية`
      : "لا توجد مستحقات عليه الآن";
  const amount = netDue > 0
    ? `<div class="pp-due__amount">${formatMoney(netDue)}</div>`
    : `<div class="pp-due__amount is-zero">${icons.check} مصفّى</div>`;
  return `
    <div class="pp-due ${state === "debt" ? "pp-due--debt" : "pp-due--cleared"}" style="margin-top:16px;">
      <div class="pp-due__head">
        <div class="pp-due__icon">${icon}</div>
        <div class="pp-due__info">
          <div class="pp-due__title">${title}</div>
          <div class="pp-due__sub">${sub}</div>
        </div>
        ${amount}
      </div>
      <div style="padding:12px 18px 16px;">
        <button class="btn btn-outline btn-sm pp-goto-btn" data-goto="details" data-open="finance">${icons.wallet} عرض كل الحركات</button>
      </div>
    </div>`;
}

function fpQuickActionsHTML() {
  return `
    <div class="fp-quick-actions">
      <button class="pp-goto-btn" data-goto="updates">${icons.clock}<span>آخر التحديثات</span></button>
      <button class="pp-goto-btn" data-goto="details">${icons.chart}<span>التفاصيل</span></button>
      <button class="pp-goto-btn" data-goto="profile">${icons.users}<span>ملف الطالب</span></button>
    </div>`;
}

function fpTreatmentShort(escalations, followups, achievements) {
  const total = escalations.length + followups.length + achievements.length;
  if (!total) {
    return `<div class="text-muted" style="padding:16px; text-align:center; font-size:13px;">لا توجد متابعة مسجلة بعد — سجلها المدرس أو الإدارة أثناء الجلسات</div>`;
  }
  const parts = [];
  if (escalations.length) parts.push("🚨 تنبيه تصعيد");
  if (followups.length) parts.push(`📝 ${followups.length} ملاحظة متابعة`);
  if (achievements.length) parts.push("🏆 إنجاز");
  const last = [...escalations, ...followups, ...achievements]
    .sort((a, b) => ((b.date || "") + (b.time || "")).localeCompare((a.date || "") + (a.time || "")))[0];
  const lastText = last.text || last.reason || (last.examTitle ? `تحسّن في ${last.examTitle}` : "إجراء إداري");
  return `
    <div class="fp-treat-short">
      <div class="fp-treat-short__line">${parts.join(" · ")}</div>
      <div class="fp-treat-short__last">آخرها: ${escapeHTML(String(lastText).slice(0, 140))} — ${last.date ? formatDateAr(String(last.date).slice(0, 10)) : ""}</div>
    </div>`;
}

function fpNarrative(student, h, analytics) {
  const out = [];
  const statuses = getStudentStatuses();
  const presentIds = new Set(statuses.filter((s) => s.presence === "present").map((s) => s.id));
  const attWin = fpAttendanceWindow(student.id);
  const absent = attWin.filter((a) => !presentIds.has(a.statusId)).length;

  const answers = getExamAnswersForStudent(student.id);
  const practiceEnabled = isStudentPortalEnabled();
  const mastery = practiceEnabled ? masteryBySubject(student.id) : null;

  if (h.hasExams && analytics) {
    const gAvg = analytics.overallGroupAvg;
    const sAvg = analytics.overallStudentAvg;
    if (sAvg >= gAvg + 5) out.push({ tone: "success", emoji: "📈", text: `متوسط درجات ${h.examCount} امتحان ${sAvg}% أعلى من متوسط المجموعة (${gAvg}%)` });
    else if (sAvg <= gAvg - 5) out.push({ tone: "warning", emoji: "📉", text: `متوسط درجات ${h.examCount} امتحان ${sAvg}% أقل من متوسط المجموعة (${gAvg}%)` });
    else out.push({ tone: "primary", emoji: "📊", text: `متوسط درجات ${h.examCount} امتحان ${sAvg}% قريب من متوسط المجموعة (${gAvg}%)` });
  }
  if (h.attendanceRate >= 85) out.push({ tone: "success", emoji: "✅", text: `الالتزام بالحضور ممتاز (${h.attendanceRate}%)${absent ? ` — ${absent} غياب فقط` : ""}` });
  else if (absent > 0) out.push({ tone: "warning", emoji: "⚠️", text: `سُجّل ${absent} غياب${attWin.length < 10 ? " في السجل" : " خلال آخر 30 يوم"} — الالتزام بالحضور أساس التحسن` });

  if (practiceEnabled && answers.length) {
    const correct = answers.filter((a) => a.isCorrect).length;
    const acc = Math.round((correct / answers.length) * 100);
    out.push({ tone: acc >= 60 ? "primary" : "warning", emoji: "🎯", text: `حلّ ${answers.length} سؤالاً في بنك الأسئلة بدقة ${acc}% — التدريب العملي يبني الثقة` });
  }
  if (practiceEnabled && mastery?.length) {
    const weak = [...mastery].sort((a, b) => a.pct - b.pct)[0];
    if (weak && weak.pct < 60) out.push({ tone: "danger", emoji: "🎯", text: `أضعف مادة: ${weak.sub.name} (${weak.pct}%) — ننصح بمراجعة مواضيعها هذا الأسبوع` });
  }
  const ach = getAchievementsForStudent(student.id);
  if (ach.length) {
    const last = ach[0];
    out.push({ tone: "success", emoji: "🏆", text: last.examTitle ? `إنجاز حديث: ${last.examTitle} — وصل إلى ${last.newPct}%` : `حقق إنجازاً حديثاً (${last.newPct}%)` });
  }
  return out;
}

function fpWeekEvents(student) {
  const cutoff = addDays(todayISO(), -7);
  return buildTimelineEvents(student)
    .filter((e) => e.date >= cutoff)
    .sort((a, b) => (a.date + (a.time || "") < b.date + (b.time || "") ? 1 : -1))
    .slice(0, 12);
}

function fpWeekTimelineHTML(events) {
  if (!events.length) {
    return `<div class="text-muted" style="padding:16px; text-align:center; font-size:13px;">لا توجد أحداث خلال الأسبوع الأخير</div>`;
  }
  const today = todayISO();
  return `
    <div class="fp-week">
      ${events.map((ev) => `
        <div class="fp-week__row">
          <div class="fp-week__dot" style="background:${ev.tone === "success" ? "var(--success)" : ev.tone === "danger" ? "var(--danger)" : ev.tone === "warning" ? "var(--warning)" : "var(--primary)"};"></div>
          <div class="fp-week__body">
            <div class="fp-week__title">${ev.emoji || ev.icon || ""} ${escapeHTML(ev.title)}</div>
            <div class="fp-week__desc">${escapeHTML(ev.desc)}</div>
          </div>
          <div class="fp-week__date">${ev.date === today ? "اليوم" : formatDateAr(ev.date)}</div>
        </div>`).join("")}
    </div>`;
}

function masteryBySubject(studentId) {
  const answers = getExamAnswersForStudent(studentId);
  if (!answers.length) return null;
  const allQuestions = getQuestions();
  const teaching = getTeachingSubject();
  const teachingQids = teaching ? new Set(allQuestions.filter((q) => q.subjectId === teaching.id).map((q) => q.id)) : null;
  const bySub = new Map();
  answers.forEach((a) => {
    const q = allQuestions.find((x) => x.id === a.questionId);
    if (!q) return;
    if (teachingQids && !teachingQids.has(q.id)) return;
    if (!bySub.has(q.subjectId)) bySub.set(q.subjectId, { correct: 0, total: 0 });
    const e = bySub.get(q.subjectId);
    e.total++;
    if (a.isCorrect) e.correct++;
  });
  const subjects = teaching ? getSubjects().filter((s) => s.id === teaching.id) : getSubjects();
  return subjects
    .map((sub) => {
      const e = bySub.get(sub.id);
      if (!e) return null;
      return { sub, total: e.total, correct: e.correct, pct: Math.round((e.correct / e.total) * 100) };
    })
    .filter(Boolean);
}

function mistakeTopics(studentId) {
  const answers = getExamAnswersForStudent(studentId).filter((a) => !a.isCorrect);
  if (!answers.length) return [];
  const allQuestions = getQuestions();
  const teaching = getTeachingSubject();
  const teachingQids = teaching ? new Set(allQuestions.filter((q) => q.subjectId === teaching.id).map((q) => q.id)) : null;
  const byTopic = new Map();
  answers.forEach((a) => {
    const q = allQuestions.find((x) => x.id === a.questionId);
    if (!q) return;
    if (teachingQids && !teachingQids.has(q.id)) return;
    const t = getTopics().find((x) => x.id === q.topicId);
    const key = t?.id || "unknown";
    if (!byTopic.has(key)) byTopic.set(key, { topic: t, sub: (teaching || getSubjects().find((s) => s.id === q.subjectId)), count: 0 });
    byTopic.get(key).count++;
  });
  return [...byTopic.values()].sort((a, b) => b.count - a.count).slice(0, 5);
}

function fpSkillsBlock(mastery, mistakeT) {
  const strengths = mastery ? [...mastery].filter((m) => m.pct >= 60).sort((a, b) => b.pct - a.pct).slice(0, 3) : [];
  const weaknesses = mastery ? [...mastery].filter((m) => m.pct < 60).sort((a, b) => a.pct - b.pct).slice(0, 3) : [];

  let html = "";
  html += `
    <div class="card card-pad">
      <div class="card__head"><div class="card__title">${icons.shield} نقاط القوة</div></div>
      ${strengths.length ? strengths.map((m) => skillBar(m.sub.icon, m.sub.name, m.pct, "success")).join("") : `<div class="text-muted" style="padding:12px; text-align:center; font-size:13px;">${mastery ? "لا توجد نقاط قوة مسجلة بعد" : "ابدأ التدريب على بنك الأسئلة لنكتشف نقاط القوة"}</div>`}
    </div>
    <div class="card card-pad" style="margin-top:16px;">
      <div class="card__head"><div class="card__title">${icons.alert} نقاط الضعف</div></div>
      ${weaknesses.length ? weaknesses.map((m) => skillBar(m.sub.icon, m.sub.name, m.pct, "danger")).join("") : `<div class="text-muted" style="padding:12px; text-align:center; font-size:13px;">${mastery ? "لا توجد نقاط ضعف ملحوظة 🎉" : "لا توجد بيانات تدريب بعد"}</div>`}
      ${mistakeT.length ? `
        <div class="fp-mistakes">
          <div style="font-size:12px; font-weight:700; color:var(--muted); margin:10px 0 6px;">أخطاء متكررة حسب الموضوع:</div>
          ${mistakeT.map((m) => `
            <span class="fp-mistake" title="${escapeHTML(m.topic?.name || "غير محدد")}">${escapeHTML(m.topic?.name || "غير محدد")} <b>×${m.count}</b></span>`).join("")}
        </div>` : ""}
    </div>`;
  return html;
}

function skillBar(icon, name, pct, tone) {
  const cls = tone === "success" ? "skill-bar__fill--success" : "skill-bar__fill--danger";
  return `
    <div class="skill-bar">
      <div class="skill-bar__head">
        <span>${escapeHTML(icon || "📚")} ${escapeHTML(name)}</span>
        <span class="skill-bar__pct">${pct}%</span>
      </div>
      <div class="skill-bar__track">
        <div class="skill-bar__fill ${cls}" style="width:${pct}%;"></div>
      </div>
    </div>`;
}

function fpTreatmentBlock(followups, escalations, achievements) {
  const rows = [];
  escalations.forEach((es) => rows.push({
    tone: "danger", emoji: "🚨", title: "تنبيه تصعيد", desc: es.reason || "تم رفع تنبيه للطالب", date: (es.date || "").slice(0, 10),
  }));
  followups.forEach((f) => rows.push({
    tone: "primary", emoji: "📝", title: `ملاحظة متابعة ${f.writtenBy ? `— ${f.writtenBy}` : ""}`, desc: f.text, date: f.date || "",
  }));
  achievements.forEach((a) => rows.push({
    tone: "success", emoji: "🏆", title: a.examTitle ? `تحسّن في ${a.examTitle}` : "إنجاز", desc: `${a.newPct}%${a.oldAvg ? ` (كان ${a.oldAvg}%)` : ""}`, date: a.date || "",
  }));

  if (!rows.length) {
    return `<div class="text-muted" style="padding:16px; text-align:center; font-size:13px;">لا توجد متابعة مسجلة بعد — سجلها المدرس أو الإدارة أثناء الجلسات</div>`;
  }
  return `
    <div class="fp-week">
      ${rows.map((r) => `
        <div class="fp-week__row">
          <div class="fp-week__dot" style="background:${r.tone === "success" ? "var(--success)" : r.tone === "danger" ? "var(--danger)" : "var(--primary)"};"></div>
          <div class="fp-week__body">
            <div class="fp-week__title">${r.emoji} ${escapeHTML(r.title)}</div>
            <div class="fp-week__desc">${escapeHTML(r.desc)}</div>
          </div>
          <div class="fp-week__date">${r.date ? formatDateAr(r.date.slice(0, 10)) : ""}</div>
        </div>`).join("")}
    </div>`;
}

// ═══════════════════════════════════════════════════════════
//  تبويب ١ — ملف الطالب
// ═══════════════════════════════════════════════════════════

function fpScheduleHTML(group) {
  if (!group) return `<div class="text-muted" style="padding:20px; text-align:center;">لا توجد بيانات للمجموعة</div>`;
  return `
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
    </div>`;
}

function renderProfileTab(box, student) {
  const attendance = getAttendance().filter((a) => a.studentId === student.id && a.category === "attendance");
  const statuses = getStudentStatuses();
  const presentStatuses = new Set(statuses.filter((s) => s.presence === "present").map((s) => s.id));

  const last30 = fpAttendanceWindow(student.id);
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
        <div class="vst-info-card__label">${totalCount < 10 ? "حضور السجل" : "حضور آخر 30 يوم"}</div>
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

    ${!isStudent && isStudentPortalEnabled() ? renderParentStudentAccountCard(student) : ""}

    <div class="card card-pad" style="margin-top:16px;">
      <div class="card__head"><div class="card__title">${icons.clock} جدول حصص الطالب</div></div>
      ${fpScheduleHTML(group)}
    </div>

    ${lastLog ? `
    <div class="card card-pad" style="margin-top:16px;">
      <div class="card__head"><div class="card__title">آخر ملاحظة متابعة</div></div>
      <div style="font-size:12px; color:var(--muted); margin-bottom:4px;">${formatDateAr(lastLog.date)} — ${lastLog.time} <span style="color:var(--muted); font-size:11px;">${escapeHTML(lastLog.writtenBy || "")}</span></div>
      <div style="font-size:13px;">${escapeHTML(lastLog.text)}</div>
    </div>` : ""}
  `;

  box.querySelector("#ppStudentPassBtn")?.addEventListener("click", () => openParentStudentAccountModal(student, "pass"));
  box.querySelector("#ppStudentUserBtn")?.addEventListener("click", () => openParentStudentAccountModal(student, "username"));
}

/* ── إدارة بيانات دخول الطالب (من بوابة ولي الأمر) ── */
function renderParentStudentAccountCard(student) {
  const account = findStudentAccount(student.id);
  const username = account?.username || String(student.code || "").trim() || "—";
  const hasPass = !!account?.passwordHash;

  const statusBadge = hasPass
    ? `<span class="badge badge-success"><span class="badge-dot"></span>مفعّل</span>`
    : `<span class="badge badge-neutral"><span class="badge-dot"></span>غير مفعّل</span>`;

  return `
    <div class="card card-pad" style="margin-top:16px;">
      <div class="card__head">
        <div class="card__title">${icons.shield} بيانات دخول الطالب (بوابة الطالب)</div>
        ${statusBadge}
      </div>
      <div style="font-size:12.5px; color:var(--muted); margin-bottom:12px;">
        اسم المستخدم الحالي: <strong dir="ltr" style="unicode-bidi:embed; color:var(--text);">${escapeHTML(username)}</strong>${hasPass ? " — الطالب بيدخل بيه وباسوره مباشرة." : " — الطالب مش هيدخل لحد ما تضع كلمة مرور."}
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm" id="ppStudentPassBtn">${icons.unlock} ${hasPass ? "تغيير كلمة المرور" : "ضبط كلمة المرور"}</button>
        <button class="btn btn-outline btn-sm" id="ppStudentUserBtn">${icons.users} تغيير اسم المستخدم</button>
      </div>
    </div>
  `;
}

function openParentStudentAccountModal(student, mode) {
  const isPass = mode === "pass";
  const account = findStudentAccount(student.id);
  const username = account?.username || String(student.code || "").trim() || "";

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__head"><div class="modal__title">${isPass ? `${icons.unlock} كلمة مرور ${escapeHTML(student.name)}` : `${icons.users} اسم المستخدم — ${escapeHTML(student.name)}`}</div></div>
      <div class="modal__body">
        ${isPass ? `
          <div class="field">
            <label class="field__label">كلمة المرور الجديدة</label>
            <input class="input ltr" type="password" id="ppAccNewPass" dir="ltr" inputmode="numeric" maxlength="8" placeholder="4–8 أرقام" autocomplete="new-password">
          </div>
          <p style="font-size:12px; color:var(--muted); margin-top:10px;">تُحفظ كرمز مشفر — الطالب يغيّرها بعد أول دخول من بوابة الطالب.</p>
        ` : `
          <div class="field">
            <label class="field__label">اسم المستخدم الجديد</label>
            <input class="input ltr" type="text" id="ppAccNewUser" dir="ltr" minlength="3" value="${escapeHTML(username)}" autocomplete="off">
          </div>
          <p style="font-size:12px; color:var(--muted); margin-top:10px;">يظهر في شاشة دخول الطالب بدلًا من كود الطالب.</p>
        `}
      </div>
      <div class="modal__actions">
        <button type="button" class="btn btn-outline" id="ppAccCancel">إلغاء</button>
        <button type="button" class="btn btn-primary" id="ppAccConfirm">${icons.check} حفظ</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.classList.add("is-open");

  const close = () => { overlay.classList.remove("is-open"); overlay.remove(); };
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.querySelector("#ppAccCancel").addEventListener("click", close);

  overlay.querySelector("#ppAccConfirm").addEventListener("click", async (e) => {
    e.currentTarget.disabled = true;
    if (isPass) {
      const p = overlay.querySelector("#ppAccNewPass").value.trim();
      if (!p || p.length < 4 || p.length > 8) {
        toast("كلمة المرور من 4 إلى 8 أرقام", "warning");
        e.currentTarget.disabled = false;
        return;
      }
      const ok = await setStudentPassword(student.id, p);
      if (!ok) { toast("تعذر الحفظ", "danger"); e.currentTarget.disabled = false; return; }
      toast("تم حفظ كلمة المرور — الطالب يدخل بها الآن", "success");
    } else {
      const u = overlay.querySelector("#ppAccNewUser").value.trim();
      const res = setStudentUsername(student.id, u);
      if (!res?.ok) {
        toast(res?.reason === "taken" ? "اسم المستخدم هذا مستخدم لطالب آخر" : "اسم المستخدم غير صالح", "danger");
        e.currentTarget.disabled = false;
        return;
      }
      toast("تم تغيير اسم المستخدم ✓", "success");
    }
    close();
    render();
  });
}

// ═══════════════════════════════════════════════════════════
//  تبويب التفاصيل · قسم الحضور (عرض فقط + المبلغ المستحق)
// ═══════════════════════════════════════════════════════════

function renderAttendanceTab(box, student) {
  const statuses = getStudentStatuses();
  const group = findGroup(getGroups(), student.groupId);
  const presentIds = new Set(statuses.filter((s) => s.presence === "present").map((s) => s.id));
  const unpaidIds = new Set(statuses.filter((s) => s.payment === "unpaid").map((s) => s.id));

  const today = todayISO();
  const allAtt = getAttendance().filter((a) => a.studentId === student.id && a.category === "attendance");
  const todayRecord = allAtt.find((a) => a.date === today);
  const currentStatus = todayRecord ? statuses.find((s) => s.id === todayRecord.statusId) : null;

  const breakdown = computeFinanceBreakdown(student, group, getExtraCharges());

  const last30 = allAtt.filter((a) => (Date.now() - new Date(a.date).getTime()) / 86400000 <= 30);
  const present30 = last30.filter((a) => presentIds.has(a.statusId)).length;
  const absent30 = last30.filter((a) => !presentIds.has(a.statusId)).length;
  const attRate = last30.length ? Math.round((present30 / last30.length) * 100) : 100;
  const unpaid30 = last30.filter((a) => unpaidIds.has(a.statusId)).length;

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

  const dayNames = ["ح", "ن", "ث", "ر", "خ", "ج", "س"];
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

    ${renderDueNoticeHTML(student, breakdown, isFeatureEnabled("wallet") ? Number(student.walletBalance || 0) : 0)}

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

    <div class="pp-note-hint">${icons.info} يتم تسجيل الحضور وإدارة المدفوعات من إدارة السنتر فقط</div>

    <div class="card card-pad">
      <div class="card__head"><div class="card__title">${icons.clipboard} آخر 15 حالة مسجلة</div></div>
      ${renderRecentHistory(student.id, 15)}
    </div>
  `;
}

function renderDueNoticeHTML(student, breakdown, wallet) {
  const grandTotal = breakdown.grandTotal;
  const netDue = Math.max(0, grandTotal - wallet);
  const group = findGroup(getGroups(), student.groupId);

  if (grandTotal <= 0) {
    return `
      <div class="pp-due pp-due--cleared" style="margin-bottom:16px;">
        <div class="pp-due__icon">${icons.check}</div>
        <div class="pp-due__info">
          <div class="pp-due__title">الحساب مصفّى بالكامل</div>
          <div class="pp-due__sub">لا توجد مبالغ مستحقة على الطالب</div>
        </div>
      </div>`;
  }

  const rows = [];
  if (breakdown.sessionDue > 0) rows.push({ label: `سعر الحصة${group ? ` (${escapeHTML(group.name)})` : ""}`, value: breakdown.sessionDue });
  if (breakdown.priorBalance > 0) rows.push({ label: "متأخرات سابقة", value: breakdown.priorBalance, cls: "pp-due__row--debt" });
  if (breakdown.extraTotal > 0) rows.push({ label: "مستحقات أخرى", value: breakdown.extraTotal });

  return `
    <div class="pp-due" style="margin-bottom:16px;">
      <div class="pp-due__head">
        <div class="pp-due__icon">${icons.money}</div>
        <div class="pp-due__info">
          <div class="pp-due__title">عليه مبلغ مستحق</div>
          <div class="pp-due__sub">تتراكم على الطالب مستحقات مالية في السنتر</div>
        </div>
        <div class="pp-due__amount">${formatMoney(netDue)}</div>
      </div>
      <div class="pp-due__rows">
        ${rows.map((r) => `<div class="pp-due__row ${r.cls || ""}"><span>${r.label}</span><span>${formatMoney(r.value)}</span></div>`).join("")}
        <div class="pp-due__row pp-due__row--total"><span>الإجمالي المطلوب</span><span>${formatMoney(grandTotal)}</span></div>
        ${wallet > 0 ? `<div class="pp-due__row pp-due__row--wallet"><span>${icons.wallet} خصم المحفظة</span><span>−${formatMoney(wallet)}</span></div>` : ""}
        <div class="pp-due__row pp-due__row--net"><span>المطلوب سداده الآن</span><span>${formatMoney(netDue)}</span></div>
      </div>
      <div class="pp-due__foot">${icons.info} المدفوعات والتحصيل تتم داخل السنتر فقط — للتواصل استخدم تبويب «آخر التحديثات»</div>
    </div>`;
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

// ═══════════════════════════════════════════════════════════
//  تبويب التفاصيل · قسم المالية (عرض فقط — بدون تحصيل أو إيداع)
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

    ${renderDueNoticeHTML(student, computeFinanceBreakdown(student, group, getExtraCharges()), wallet)}

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
        <div class="pp-note-hint">${icons.info} تحصيل المدفوعات يتم داخل السنتر فقط</div>
      </div>
    </div>` : ""}

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

    ${charges.length ? `
    <div class="card card-pad" style="margin-bottom:16px;">
      <div class="card__head"><div class="card__title">${icons.alert} مستحقات أخرى</div></div>
      ${charges.map((c) => `
        <div class="vst-detail-row" style="animation:fadeUp .2s ease both;">
          <span>${icons.alert} ${escapeHTML(c.name)} — ${formatMoney(c.amount)}</span>
          <span class="badge badge-warning"><span class="badge-dot"></span>غير مسددة</span>
        </div>
      `).join("")}
    </div>` : ""}

    <div class="card card-pad">
      <div class="card__head"><div class="card__title">${icons.clipboard} سجل الدفعات (${payments.length})</div></div>
      <div class="vst-history-table">
        <div class="vst-history-header vst-history-header--4">
          <span>التاريخ</span><span>الملاحظة</span><span>المبلغ</span><span>الحالة</span>
        </div>
        ${payments.length ? payments.map((p, pi) => `
          <div class="vst-history-row vst-history-row--4" style="animation:fadeUp .2s ease both; animation-delay:${pi * .03}s;">
            <span style="white-space:nowrap;">${formatDateAr(p.date)}${p.sessionDate ? `<br><span style="font-size:10px; color:var(--muted);">حصة ${formatDateAr(p.sessionDate)}</span>` : ""}</span>
            <span style="font-size:13px;">${escapeHTML(p.note || "—")}</span>
            <span style="font-weight:700; color:${p.status === "paid" ? "var(--success)" : "var(--danger)"};">${p.status === "paid" ? "+" : "-"}${formatMoney(p.amount || 0)}${p.walletUsed > 0 ? ` <span style="font-weight:400; font-size:11px; color:var(--muted);">(محفظة ${formatMoney(p.walletUsed)})</span>` : ""}</span>
            <span><span class="badge badge-${p.status === "paid" ? "success" : "danger"}"><span class="badge-dot"></span>${p.status === "paid" ? "مسدد" : "مستحق"}</span></span>
          </div>
        `).join("") : `<div class="text-muted" style="padding:20px; text-align:center;">لا توجد دفعات مسجلة</div>`}
      </div>
    </div>
  `;
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

  const scoredExams = examStats.filter((e) => e.studentPct != null);
  const overallStudentAvg = scoredExams.length
    ? Math.round(scoredExams.reduce((s, e) => s + e.studentPct, 0) / scoredExams.length)
    : 0;
  const overallGroupAvg = scoredExams.length
    ? Math.round(scoredExams.reduce((s, e) => s + e.groupAvgPct, 0) / scoredExams.length)
    : 0;

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

/**
 * الترتيب المزدوج للطالب: داخل مجموعته + داخل سنته الدراسية كلها.
 * يعتمد على متوسط نسبة الطالب ((score/maxScore)*100) عبر امتحاناته المصحّحة
 * داخل كل نطاق، مع dense rank (المتوسطات المتساوية = ترتيب متساوٍ).
 */
function computeStudentRank(student) {
  if (!student) return { group: null, grade: null };
  const allStudents = getStudents();
  const groups = getGroups();
  const allExams = getExams();
  const studentId = student.id;

  const isScored = (r) => r && !r.absent && !r.excused && r.score != null;
  const pctOf = (score, max) => (max > 0 ? (score / max) * 100 : 0);
  const myScoreOf = (e) => {
    const r = e.results?.find((x) => x.studentId === studentId);
    return isScored(r) ? pctOf(r.score, e.maxScore) : null;
  };

  function rankWithinRange(examsInRange, inRange) {
    const myScored = examsInRange
      .filter((e) => isScored(e.results?.find((x) => x.studentId === studentId)))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!myScored.length) return null;

    const myAvg = myScored.reduce((s, e) => s + myScoreOf(e), 0) / myScored.length;
    const avgs = [];
    for (const s of allStudents) {
      if (s.status !== "active" || !inRange(s)) continue;
      let sum = 0, cnt = 0;
      for (const e of examsInRange) {
        const r = e.results?.find((x) => x.studentId === s.id);
        if (isScored(r)) { sum += pctOf(r.score, e.maxScore); cnt++; }
      }
      if (cnt) avgs.push({ sid: s.id, avg: sum / cnt });
    }

    const total = avgs.length;
    const better = new Set(avgs.filter((a) => a.avg > myAvg).map((a) => a.avg));
    const rank = better.size + 1;
    const percentile = Math.round(((total - rank + 1) / total) * 100);
    return { rank, total, percentile, myScored };
  }

  const groupRange = allExams.filter((e) => e.groupId === student.groupId);
  const gradeRange = allExams.filter((e) => {
    const g = findGroup(groups, e.groupId);
    return g && g.gradeId === student.gradeId;
  });

  const groupRank = rankWithinRange(groupRange, (s) => s.groupId === student.groupId);
  const gradeRank = rankWithinRange(gradeRange, (s) => s.gradeId === student.gradeId);

  let group = null;
  if (groupRank) {
    const last = groupRank.myScored[groupRank.myScored.length - 1];
    const prev = groupRank.myScored[groupRank.myScored.length - 2];
    let trend = null;
    let lastExamTitle = last?.title ?? null;
    if (prev) {
      const rankInExam = (exam) => {
        const my = exam.results?.find((x) => x.studentId === studentId);
        const myScore = my?.score ?? -1;
        const better = new Set(exam.results.filter(isScored).filter((x) => x.score > myScore).map((x) => x.score));
        return better.size + 1;
      };
      trend = rankInExam(prev) - rankInExam(last);
    }
    group = { rank: groupRank.rank, total: groupRank.total, percentile: groupRank.percentile, trend, lastExamTitle };
  }

  let grade = null;
  if (gradeRank) {
    grade = { rank: gradeRank.rank, total: gradeRank.total, percentile: gradeRank.percentile, examsConsidered: gradeRank.myScored.length };
  }

  return { group, grade };
}

const rankPercentileBadge = (p) => (p >= 75 ? "vst-rank-badge--success" : p >= 40 ? "vst-rank-badge--warning" : "vst-rank-badge--danger");

function renderRankTrackHTML(percentile) {
  const clamped = Math.max(3, Math.min(97, percentile));
  return `
    <div class="vst-rank-track">
      <div class="vst-rank-marker" style="--marker-right: ${clamped}%;">
        <span class="vst-rank-marker__label">أنت</span>
      </div>
    </div>`;
}

function renderRankTrendHTML(trend, lastExamTitle) {
  if (trend == null) return "";
  if (trend > 0) return `<div class="vst-rank-delta vst-rank-delta--up">▲ صعدت ${trend} مراكز عن ${escapeHTML(lastExamTitle || "الامتحان السابق")}</div>`;
  if (trend < 0) return `<div class="vst-rank-delta vst-rank-delta--down">▼ تراجعت ${Math.abs(trend)} مراكز</div>`;
  return `<div class="vst-rank-delta vst-rank-delta--flat">ثابت</div>`;
}

function renderRankEmptyHTML(title) {
  return `
    <div class="vst-rank-card vst-rank-card--empty">
      <div class="vst-rank-card__title">${escapeHTML(title)}</div>
      <div class="vst-rank-empty">
        <span class="vst-rank-empty__icon">${icons.chart}</span>
        <span class="vst-rank-empty__text">لا توجد امتحانات بعد لحساب الترتيب</span>
      </div>
    </div>`;
}

function renderRankPairHTML(rank, student) {
  const gradeTitle = gradeName(getGrades(), student?.gradeId);
  const groupCard = rank?.group ? `
    <div class="vst-rank-card">
      <div class="vst-rank-card__title">داخل المجموعة</div>
      <div class="vst-rank-num">${rank.group.rank}</div>
      <div class="vst-rank-of">من ${rank.group.total} طالب</div>
      <span class="vst-rank-badge ${rankPercentileBadge(rank.group.percentile)}">أفضل ${rank.group.percentile}%</span>
      ${renderRankTrackHTML(rank.group.percentile)}
      ${renderRankTrendHTML(rank.group.trend, rank.group.lastExamTitle)}
    </div>` : renderRankEmptyHTML("داخل المجموعة");

  const gradeCard = rank?.grade ? `
    <div class="vst-rank-card">
      <div class="vst-rank-card__title">داخل السنة الدراسية (${escapeHTML(gradeTitle)})</div>
      <div class="vst-rank-num">${rank.grade.rank}</div>
      <div class="vst-rank-of">من ${rank.grade.total} طالب</div>
      <span class="vst-rank-badge ${rankPercentileBadge(rank.grade.percentile)}">أفضل ${rank.grade.percentile}%</span>
      ${renderRankTrackHTML(rank.grade.percentile)}
      <div class="vst-rank-delta vst-rank-delta--flat" style="font-weight:600;">محسوب على ${rank.grade.examsConsidered} ${rank.grade.examsConsidered === 1 ? "امتحان" : "امتحانات"} لك</div>
    </div>` : renderRankEmptyHTML(`داخل السنة الدراسية (${escapeHTML(gradeTitle)})`);

  return `
    <div class="card card-pad vst-rank-pair">
      <div class="card__head"><div class="card__title">🏅 ترتيبك</div></div>
      <div class="vst-rank-grid">
        ${groupCard}
        ${gradeCard}
      </div>
    </div>`;
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

  const scored = analytics.examStats.filter((e) => e.studentPct != null);
  if (scored.length >= 2) {
    const best = scored.reduce((a, b) => a.studentPct > b.studentPct ? a : b);
    const worst = scored.reduce((a, b) => a.studentPct < b.studentPct ? a : b);
    if (best.id !== worst.id) {
      stmts.push({ tone: "primary", emoji: "🎯", text: `أفضل درجة: ${best.title} (${best.studentPct}%) — وأسوأ: ${worst.title} (${worst.studentPct}%)` });
    }
  }

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

function renderRadarChartSVG(analytics, size = 280) {
  const exams = analytics.examStats.filter((e) => e.studentPct != null);
  if (exams.length < 3) return null;

  const cx = size / 2, cy = size / 2, r = size / 2 - 36;
  const n = exams.length;
  const angleStep = (2 * Math.PI) / n;
  const startAngle = -Math.PI / 2;
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

  const axesHTML = exams.map((_, i) => {
    const angle = startAngle + i * angleStep;
    const end = polarToCartesian(angle, r);
    return `<line x1="${cx}" y1="${cy}" x2="${end.x}" y2="${end.y}" stroke="var(--border)" stroke-width="1"/>`;
  }).join("");

  const ringsHTML = rings.map((pct) => {
    const dist = (pct / 100) * r;
    const points = Array.from({ length: n }, (_, i) => {
      const angle = startAngle + i * angleStep;
      const pt = polarToCartesian(angle, dist);
      return `${pt.x},${pt.y}`;
    }).join(" ");
    return `<polygon points="${points}" fill="none" stroke="var(--border)" stroke-width="0.5" stroke-dasharray="3,3"/>`;
  }).join("");

  const labelsHTML = exams.map((e, i) => {
    const angle = startAngle + i * angleStep;
    const labelR = r + 22;
    const pt = polarToCartesian(angle, labelR);
    const shortTitle = e.title.length > 16 ? e.title.slice(0, 14) + "…" : e.title;
    const anchor = pt.x < cx - 5 ? "end" : pt.x > cx + 5 ? "start" : "middle";
    return `<text x="${pt.x}" y="${pt.y}" text-anchor="${anchor}" dominant-baseline="middle" fill="var(--muted)" font-size="10" font-weight="600">${escapeHTML(shortTitle)}</text>`;
  }).join("");

  const groupPolygon = `<polygon points="${buildPolygonPoints(groupValues)}" fill="color-mix(in srgb, var(--primary) 15%, transparent)" stroke="var(--primary)" stroke-width="2" stroke-dasharray="4,3"/>`;
  const studentPolygon = `<polygon points="${buildPolygonPoints(studentValues)}" fill="color-mix(in srgb, var(--success) 20%, transparent)" stroke="var(--success)" stroke-width="2.5"/>`;

  const studentDots = studentValues.map((v, i) => {
    const angle = startAngle + i * angleStep;
    const dist = (v / 100) * r;
    const pt = polarToCartesian(angle, dist);
    return `<circle cx="${pt.x}" cy="${pt.y}" r="4" fill="var(--success)" stroke="#fff" stroke-width="2"/>`;
  }).join("");

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
//  تبويب التفاصيل · قسم الدرجات والترتيب + التحليل المقارن
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
  const rank = computeStudentRank(student);

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

    ${renderRankPairHTML(rank, student)}

    ${analytics && statements.length ? `
    <div class="card card-pad vst-analytics-card" style="margin-bottom:16px;">
      <div class="card__head"><div class="card__title">${icons.radar} التحليل المقارن</div></div>
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
//  الخط الزمني (Story Timeline) — موحّد داخل «آخر التحديثات»
// ═══════════════════════════════════════════════════════════

function buildTimelineEvents(student) {
  const events = [];
  const statuses = getStudentStatuses();
  const statusMap = new Map(statuses.map((s) => [s.id, s]));

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

function renderTimelineFeed(box, events, filter) {
  const list = (filter && filter !== "all")
    ? events.filter((e) => (filter === "finance" ? ["payment", "wallet", "charge"].includes(e.type) : e.type === filter))
    : events;

  const grouped = new Map();
  list.forEach((ev) => {
    if (!grouped.has(ev.date)) grouped.set(ev.date, []);
    grouped.get(ev.date).push(ev);
  });

  if (!list.length) {
    box.innerHTML = `
      <div class="card card-pad" style="text-align:center; padding:50px 20px;">
        <div style="font-size:48px; margin-bottom:16px; opacity:.5;">📭</div>
        <div style="font-weight:800; font-size:17px; margin-bottom:4px;">لا توجد أحداث مسجلة</div>
        <div class="text-muted" style="font-size:13px;">لم يُسجَّل أي حدث بعد لهذا الطالب</div>
      </div>`;
    return;
  }

  const attCount   = list.filter((e) => e.type === "attendance").length;
  const examCount  = list.filter((e) => e.type === "exam").length;
  const followCount= list.filter((e) => e.type === "followup").length;

  const today = todayISO();
  const monthNames = ["يناير","فبراير","مارس","إبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

  box.innerHTML = `
    <div class="vst-info-grid" style="margin-bottom:16px;">
      <div class="vst-info-card" style="--c:var(--primary)">
        <div class="vst-info-card__icon" style="background:color-mix(in srgb, var(--primary) 12%, transparent); color:var(--primary);">${icons.grid}</div>
        <div class="vst-info-card__value">${list.length}</div>
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
        const monthNamesLocal = monthNames;
        const monthLabel = `${monthNamesLocal[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
        const isToday = date === today;

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
