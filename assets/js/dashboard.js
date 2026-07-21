// =========================================================
// Dashboard — ملخص أداء السنتر وحصص اليوم
// =========================================================

import { initPage } from "./app.js";
import { icons } from "./icons.js";
import { getStudents, getAttendance, getPayments, getStudentStatuses, getGroups, getGrades } from "./storage.js";
import { todayISO, formatMoney, escapeHTML } from "./helpers.js";
import { emptyStateHTML } from "./ui.js";
import { gradeName } from "./lookups.js";
import { isScheduledToday, sessionTimeStatus, formatTimeAr } from "./schedule.js";
import { THEMES, getCurrentTheme, setCurrentTheme } from "./themes.js";

const content = await initPage("dashboard");
if (content) render();

function render() {
  const students = getStudents();
  const attendance = getAttendance();
  const statuses = getStudentStatuses();
  const today = todayISO();

  const todayAttendance = attendance.filter((a) => a.date === today && a.category === "attendance");
  const presentToday = todayAttendance.filter((a) => statuses.find((s) => s.id === a.statusId)?.presence === "present").length;
  const absentToday = todayAttendance.filter((a) => statuses.find((s) => s.id === a.statusId)?.presence === "absent").length;
  const lateStudents = students.filter((s) => (s.lateBalance || 0) > 0).length;

  content.innerHTML = `
    <div class="page__header">
      <div>
        <div class="page__title">نظرة عامة</div>
        <div class="page__subtitle">ملخص أداء السنتر اليوم</div>
      </div>
    </div>

    <div class="stat-grid">
      ${statCard("tone-primary", icons.users, students.length, "إجمالى عدد الطلاب")}
      ${statCard("tone-success", icons.check, presentToday, "الحضور اليوم")}
      ${statCard("tone-danger", icons.x, absentToday, "الغياب اليوم")}
      ${statCard("tone-warning", icons.clock, lateStudents, "الطلاب المتأخرين فى السداد")}
    </div>

    <div class="card card-pad" style="margin-bottom:22px;">
      <div class="card__head"><div class="card__title">مظهر السنتر (السيم)</div></div>
      <div class="field__hint" style="margin-bottom:12px;">اختر شكل الألوان اللي بتفضّله — بيتحفظ لحسابك أنت بس، وممكن تغيّره فى أى وقت.</div>
      <div id="themePicker" style="display:flex; flex-wrap:wrap; gap:12px;"></div>
    </div>

    <div class="card card-pad">
      <div class="card__head"><div class="card__title">حصص اليوم</div></div>
      <div id="todaySessions"></div>
    </div>
  `;

  renderThemePicker();
  renderTodaySessions();
}

function renderThemePicker() {
  const box = document.getElementById("themePicker");
  const current = getCurrentTheme();

  box.innerHTML = THEMES.map(
    (t) => `
    <button type="button" class="theme-pick-card ${current === t.id ? "is-active" : ""}" data-theme-id="${t.id}">
      <span class="theme-pick-card__swatch" style="background:${t.swatch};"></span>
      <span class="theme-pick-card__name">${t.name}</span>
      ${current === t.id ? `<span class="theme-pick-card__check">${icons.check}</span>` : ""}
    </button>`
  ).join("");

  box.querySelectorAll(".theme-pick-card").forEach((btn) =>
    btn.addEventListener("click", () => {
      setCurrentTheme(btn.dataset.themeId);
      renderThemePicker();
    })
  );
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

function renderTodaySessions() {
  const box = document.getElementById("todaySessions");
  const groups = getGroups()
    .filter((g) => isScheduledToday(g))
    .sort((a, b) => (a.time < b.time ? -1 : 1));

  if (!groups.length) {
    box.innerHTML = emptyStateHTML({ icon: icons.grid, title: "لا توجد حصص مجدولة النهاردة" });
    return;
  }

  const grades = getGrades();
  const students = getStudents();
  const attendance = getAttendance();
  const payments = getPayments();
  const statuses = getStudentStatuses();
  const today = todayISO();

  box.innerHTML = groups
    .map((group) => {
      const timeStatus = sessionTimeStatus(group, today);
      const enrolled = students.filter((s) => s.groupId === group.id);
      const groupIds = new Set(enrolled.map((s) => s.id));

      const todayRecords = attendance.filter((a) => a.date === today && a.category === "attendance" && groupIds.has(a.studentId));
      const presentRecords = todayRecords.filter((a) => statuses.find((s) => s.id === a.statusId)?.presence === "present");
      const absentRecords = todayRecords.filter((a) => statuses.find((s) => s.id === a.statusId)?.presence === "absent");
      const absentNames = absentRecords.map((a) => enrolled.find((s) => s.id === a.studentId)?.name || "طالب محذوف");

      const expected = enrolled.length * (group.sessionPrice || 0);
      const collected = payments
        .filter((p) => p.date === today && p.groupId === group.id && p.status === "paid")
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const dues = collected - expected;

      const statusMeta = {
        upcoming: { label: "لسه معادها ما جاش", tone: "neutral" },
        ongoing: { label: "جارية الآن", tone: "success" },
        ended: { label: "انتهت", tone: "primary" },
      }[timeStatus];

      const isOngoing = timeStatus === "ongoing";
      const cardHighlight = isOngoing ? "border:2px solid var(--success); background: var(--success-light);" : "border:1px solid var(--border);";

      return `
        <div class="card card-pad" style="margin-bottom:12px; ${cardHighlight}">
          <div class="flex-between" style="flex-wrap:wrap; gap:10px;">
            <div>
              <div style="font-weight:800; font-size:15px;">${escapeHTML(group.name)} <span class="code-pill" style="margin-right:6px;">${escapeHTML(group.code)}</span></div>
              <div class="text-muted" style="font-size:12.5px; margin-top:3px;">${escapeHTML(gradeName(grades, group.gradeId))} — ${formatTimeAr(group.time)}</div>
            </div>
            <span class="badge badge-${statusMeta.tone}">${isOngoing ? `<span class="badge-dot" style="animation: pulse 1.4s infinite;"></span>` : `<span class="badge-dot"></span>`}${statusMeta.label}</span>
          </div>

          ${
            timeStatus === "upcoming"
              ? `<div class="field__hint" style="margin-top:10px;">هتفتح الساعة ${formatTimeAr(group.time)}</div>`
              : `
            <div class="divider"></div>
            <div class="quick-stats-bar" style="margin-bottom:0;">
              <div class="quick-stats-bar__item"><span class="quick-stats-bar__value">${presentRecords.length}</span><span class="quick-stats-bar__label">عدد الحضور</span></div>
              <div class="quick-stats-bar__item">
                <button type="button" class="absentToggleBtn" data-id="${group.id}" style="background:none; border:none; cursor:pointer; display:flex; align-items:center; gap:6px; font-family:inherit;">
                  <span class="quick-stats-bar__value" style="color:${absentRecords.length ? "var(--danger)" : "inherit"};">${absentRecords.length}</span>
                  <span class="quick-stats-bar__label" style="text-decoration:underline;">عدد الغياب</span>
                </button>
              </div>
              <div class="quick-stats-bar__item"><span class="quick-stats-bar__value" style="color:${dues < 0 ? "var(--danger)" : "var(--success)"};">${formatMoney(dues)}</span><span class="quick-stats-bar__label">الاستحقاقات</span></div>
            </div>
            <div id="absentList-${group.id}" style="display:none; margin-top:10px; padding-top:10px; border-top:1px dashed var(--border);">
              ${
                absentNames.length
                  ? `<div style="display:flex; flex-wrap:wrap; gap:6px;">${absentNames.map((n) => `<span class="badge badge-danger">${escapeHTML(n)}</span>`).join("")}</div>`
                  : `<div class="text-muted" style="font-size:13px;">لا يوجد غياب مسجل لحد دلوقتى</div>`
              }
            </div>
            <a class="btn ${isOngoing ? "btn-success" : "btn-outline"} btn-sm" href="session.html?groupId=${group.id}&date=${today}" style="margin-top:12px; width:100%; justify-content:center;">
              ${icons.grid} ${isOngoing ? "الدخول لتسجيل الحضور" : "مراجعة / تصحيح الحصة"}
            </a>`
          }
        </div>
      `;
    })
    .join("");

  box.querySelectorAll(".absentToggleBtn").forEach((btn) =>
    btn.addEventListener("click", () => {
      const list = document.getElementById(`absentList-${btn.dataset.id}`);
      if (list) list.style.display = list.style.display === "none" ? "block" : "none";
    })
  );
}
