// =========================================================
// Dashboard — حصص اليوم + صحة الطلاب
// =========================================================

import { initPage } from "./app.js";
import { icons } from "./icons.js";
import { todayISO, escapeHTML } from "./helpers.js";
import { emptyStateHTML } from "./ui.js";
import { formatTimeAr } from "./schedule.js";
import { getSessionsForDate } from "./session-overview.js";
import { getHealthSummary, healthScoreHTML, healthBarHTML, healthStudentRowHTML } from "./health-score.js";
import { getEscalationSummary, getLevelMeta } from "./escalation-engine.js";
import { getGroups, getGrades } from "./storage.js";

const content = await initPage("dashboard");
if (content) render();

function render() {
  const today = todayISO();
  const sessions = getSessionsForDate(today);
  const summary = getHealthSummary();
  const groups = getGroups();
  const grades = getGrades();

  const escalation = getEscalationSummary();

  content.innerHTML = `
    <div class="page__header">
      <div>
        <div class="page__title">حصص اليوم</div>
        <div class="page__subtitle">${new Date().toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
      </div>
    </div>

    ${summary.danger.length > 0 ? renderDangerZone(summary, groups, grades) : ""}
    ${escalation.total > 0 ? renderEscalationCard(escalation, groups) : ""}

    <div id="todaySessions"></div>
  `;

  renderTodaySessions(sessions, today);
}

/* ── منطقة الخطر ── */
function renderDangerZone(summary, groups, grades) {
  const top5 = summary.danger.slice(0, 5);
  const hasWarning = summary.warning.length > 0;

  return `
    <div class="card card-pad" style="margin-bottom:20px; border:2px solid var(--danger); border-right:6px solid var(--danger);">
      <div class="card__head">
        <div class="card__title" style="color:var(--danger);">${icons.alert} منطقة الخطر — صحة الطلاب</div>
        <a href="teacher-insights.html" style="font-size:12px; color:var(--primary); text-decoration:none;">عرض الكل ←</a>
      </div>
      <div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:14px;">
        <div style="display:flex; align-items:center; gap:6px; font-size:13px;">
          <span style="width:10px; height:10px; border-radius:50%; background:var(--danger);"></span>
          <strong style="color:var(--danger);">${summary.danger.length}</strong>
          <span class="text-muted">في الخطر</span>
        </div>
        ${hasWarning ? `
        <div style="display:flex; align-items:center; gap:6px; font-size:13px;">
          <span style="width:10px; height:10px; border-radius:50%; background:var(--warning);"></span>
          <strong style="color:var(--warning);">${summary.warning.length}</strong>
          <span class="text-muted">محتاج متابعة</span>
        </div>
        ` : ""}
        <div style="display:flex; align-items:center; gap:6px; font-size:13px;">
          <span style="width:10px; height:10px; border-radius:50%; background:var(--success);"></span>
          <strong style="color:var(--success);">${summary.healthy.length}</strong>
          <span class="text-muted">صحي</span>
        </div>
      </div>
      <div id="dangerList">
        ${top5.map((s) => healthStudentRowHTML(s, groups, grades)).join("")}
      </div>
      ${summary.danger.length > 5 ? `<div style="text-align:center; margin-top:8px;"><a href="teacher-insights.html" style="font-size:13px; color:var(--primary); text-decoration:none; font-weight:700;">+${summary.danger.length - 5} طالب آخرين ←</a></div>` : ""}
    </div>
  `;
}

/* ── ملخص التصعيد ── */
function renderEscalationCard(escalation, groups) {
  const l3 = escalation.level3.slice(0, 3);
  const l2 = escalation.level2.slice(0, 3);
  const l1 = escalation.level1.slice(0, 3);

  function studentLink(s) {
    const g = groups.find((gr) => gr.id === s.groupId);
    return `<a href="student.html?id=${s.id}" style="color:inherit; text-decoration:none; font-weight:700;">${escapeHTML(s.name)}</a> <span style="font-size:11px; color:var(--muted);">${escapeHTML(g?.name || "")}</span>`;
  }

  return `
    <div class="card card-pad" style="margin-bottom:20px; border:2px solid var(--warning); border-right:6px solid var(--warning);">
      <div class="card__head">
        <div class="card__title" style="color:var(--warning);">${icons.alert} تصعيد الإنذارات</div>
        <a href="teacher-insights.html" style="font-size:12px; color:var(--primary); text-decoration:none;">عرض الكل ←</a>
      </div>
      <div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:12px;">
        ${escalation.level3.length ? `<div style="display:flex; align-items:center; gap:6px; font-size:13px;"><span style="width:10px; height:10px; border-radius:50%; background:var(--danger);"></span><strong style="color:var(--danger);">${escalation.level3.length}</strong><span class="text-muted">قفل + استدعاء</span></div>` : ""}
        ${escalation.level2.length ? `<div style="display:flex; align-items:center; gap:6px; font-size:13px;"><span style="width:10px; height:10px; border-radius:50%; background:var(--warning);"></span><strong style="color:var(--warning);">${escalation.level2.length}</strong><span class="text-muted">اتصال مطلوب</span></div>` : ""}
        ${escalation.level1.length ? `<div style="display:flex; align-items:center; gap:6px; font-size:13px;"><span style="width:10px; height:10px; border-radius:50%; background:var(--info);"></span><strong style="color:var(--info);">${escalation.level1.length}</strong><span class="text-muted">إنذار أول</span></div>` : ""}
      </div>
      <div style="display:flex; flex-direction:column; gap:4px;">
        ${l3.map((s) => `<div style="display:flex; align-items:center; gap:8px; padding:6px 0; font-size:13px;"><span>🔴</span>${studentLink(s)}<span style="margin-right:auto; font-size:11px; color:var(--danger);">${s.consecutiveAbsences} غيابات متتالية</span></div>`).join("")}
        ${l2.map((s) => `<div style="display:flex; align-items:center; gap:8px; padding:6px 0; font-size:13px;"><span>🟠</span>${studentLink(s)}<span style="margin-right:auto; font-size:11px; color:var(--warning);">${s.consecutiveAbsences} غيابات متتالية</span></div>`).join("")}
        ${l1.map((s) => `<div style="display:flex; align-items:center; gap:8px; padding:6px 0; font-size:13px;"><span>🟡</span>${studentLink(s)}<span style="margin-right:auto; font-size:11px; color:var(--info);">${s.consecutiveAbsences} غيابات متتالية</span></div>`).join("")}
      </div>
      ${escalation.total > 9 ? `<div style="text-align:center; margin-top:8px;"><a href="teacher-insights.html" style="font-size:13px; color:var(--primary); text-decoration:none; font-weight:700;">+${escalation.total - 9} طالب آخرين ←</a></div>` : ""}
    </div>
  `;
}

function renderTodaySessions(sessions, today) {
  const box = document.getElementById("todaySessions");

  if (!sessions.length) {
    box.innerHTML = emptyStateHTML({ icon: icons.grid, title: "لا توجد حصص مجدولة النهاردة" });
    return;
  }

  const statusMeta = {
    upcoming: { label: "لسه معادها ما جاش", tone: "neutral" },
    ongoing: { label: "جارية الآن", tone: "success" },
    ended: { label: "انتهت", tone: "primary" },
  };

  box.innerHTML = sessions
    .map((s) => {
      const meta = statusMeta[s.timeStatus];
      const isOngoing = s.timeStatus === "ongoing";
      const isEnded = s.timeStatus === "ended";
      const clickable = isOngoing || isEnded;

      let cardStyle = "border:1px solid var(--border); cursor:pointer; transition: transform .12s, box-shadow .12s;";
      if (isOngoing) cardStyle = "border:2px solid var(--success); background: var(--success-light); cursor:pointer; transition: transform .12s, box-shadow .12s;";

      return `
        <div class="card card-pad dashboard-session-card" style="margin-bottom:12px; ${cardStyle}" data-group-id="${s.group.id}" data-clickable="${clickable}">
          <div class="flex-between" style="flex-wrap:wrap; gap:10px;">
            <div style="display:flex; align-items:center; gap:12px;">
              <div style="width:48px; height:48px; border-radius:var(--r-md); background:${isOngoing ? "var(--success)" : isEnded ? "var(--primary)" : "var(--surface)"}; color:#fff; display:flex; align-items:center; justify-content:center; font-size:20px; flex-shrink:0;">
                ${isOngoing ? icons.check : isEnded ? icons.grid : icons.clock}
              </div>
              <div>
                <div style="font-weight:800; font-size:15px;">${escapeHTML(s.group.name)}</div>
                <div class="text-muted" style="font-size:12.5px; margin-top:2px;">${escapeHTML(s.gradeLabel)} — ${formatTimeAr(s.group.time)}</div>
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="badge badge-${meta.tone}">${isOngoing ? `<span class="badge-dot" style="animation: pulse 1.4s infinite;"></span>` : `<span class="badge-dot"></span>`}${meta.label}</span>
              ${clickable ? `<span style="color:var(--muted); font-size:18px;">${icons.arrowLeft}</span>` : ""}
            </div>
          </div>

          ${
            s.timeStatus === "upcoming"
              ? `<div class="field__hint" style="margin-top:10px;">هتفتح للتسجيل قبلها بساعة (معادها ${formatTimeAr(s.group.time)})</div>`
              : `
          <div class="divider"></div>
          <div class="quick-stats-bar" style="margin-bottom:0;">
            <div class="quick-stats-bar__item"><span class="quick-stats-bar__value">${s.presentCount}</span><span class="quick-stats-bar__label">حضور</span></div>
            <div class="quick-stats-bar__item"><span class="quick-stats-bar__value" style="color:${s.absentCount ? "var(--danger)" : "inherit"};">${s.absentCount}</span><span class="quick-stats-bar__label">غياب</span></div>
          </div>`
          }
        </div>
      `;
    })
    .join("");

  box.querySelectorAll(".dashboard-session-card").forEach((card) => {
    if (card.dataset.clickable === "true") {
      card.addEventListener("click", () => {
        const groupId = card.dataset.groupId;
        window.location.href = `quick-attendance.html?groupId=${groupId}&date=${today}`;
      });

      card.addEventListener("mouseenter", () => {
        card.style.transform = "translateY(-2px)";
        card.style.boxShadow = "var(--shadow-md)";
      });
      card.addEventListener("mouseleave", () => {
        card.style.transform = "";
        card.style.boxShadow = "";
      });
    }
  });
}
