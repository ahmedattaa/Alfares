// =========================================================
// Dashboard — حصص اليوم فقط
// =========================================================

import { initPage } from "./app.js";
import { icons } from "./icons.js";
import { todayISO, escapeHTML } from "./helpers.js";
import { emptyStateHTML } from "./ui.js";
import { formatTimeAr } from "./schedule.js";
import { getSessionsForDate } from "./session-overview.js";

const content = await initPage("dashboard");
if (content) render();

function render() {
  const today = todayISO();
  const sessions = getSessionsForDate(today);

  content.innerHTML = `
    <div class="page__header">
      <div>
        <div class="page__title">حصص اليوم</div>
        <div class="page__subtitle">${new Date().toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
      </div>
    </div>

    <div id="todaySessions"></div>
  `;

  renderTodaySessions(sessions, today);
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
