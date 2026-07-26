// =========================================================
// متابعة الحضور والغياب — جدول متابعة شامل لكل الطلاب
// يُستخدم من لوحة المعلم (أداء المجموعات) وإدارة الحصة
// =========================================================

import { initPage } from "./app.js";
import { icons } from "./icons.js";
import { getStudents, getGroups, getGrades, getAttendance, getStudentStatuses } from "./storage.js";
import { escapeHTML, formatMoney, formatDateAr } from "./helpers.js";
import { toast } from "./ui.js";
import { findGroup, gradeName } from "./lookups.js";
import { WEEKDAY_OPTIONS, weekdayArForDate } from "./schedule.js";
import { printTableAsPDF } from "./export-utils.js";

const content = await initPage("attendance-tracker");

let params = new URLSearchParams(window.location.search);
let groupId = params.get("groupId");
let mode = params.get("mode") || "group"; // group | filter

if (content) render();

function render() {
  if (!groupId) { content.innerHTML = `<div class="text-muted" style="padding:40px; text-align:center;">لم يتم تحديد مجموعة</div>`; return; }

  const group = findGroup(getGroups(), groupId);
  if (!group) { content.innerHTML = `<div class="text-muted" style="padding:40px; text-align:center;">المجموعة غير موجودة</div>`; return; }

  const grade = gradeName(getGrades(), group.gradeId);
  const students = getStudents().filter((s) => s.groupId === groupId && s.status === "active").sort((a, b) => (a.code || "").localeCompare(b.code || "", "ar", { numeric: true }));

  content.innerHTML = `
    <div class="page__header">
      <div>
        <div class="page__title">متابعة الحضور والغياب</div>
        <div class="page__subtitle">${escapeHTML(grade)} — ${escapeHTML(group.name)}</div>
      </div>
      <button class="btn btn-outline btn-sm" id="printAttendanceBtn">${icons.print} طباعة</button>
    </div>

    <div class="at-info-bar">
      <span class="at-info-bar__item">${icons.users} ${students.length} طالب</span>
      <span class="at-info-bar__item">${icons.clock} ${(group.days || []).join(" و ")} — ${group.time || "—"}</span>
      <span class="at-info-bar__item">${icons.clipboard} ${grade}</span>
    </div>

    ${mode === "filter" ? `
    <div class="at-filters">
      <button class="btn btn-outline btn-sm at-filter-btn is-active" data-filter="all">الكل</button>
      <button class="btn btn-outline btn-sm at-filter-btn" data-filter="code">${icons.search} ترتيب بالكود</button>
      <button class="btn btn-outline btn-sm at-filter-btn" data-filter="absent">${icons.alert} أعلى نسبة غياب</button>
      <button class="btn btn-outline btn-sm at-filter-btn" data-filter="present">${icons.check} أعلى نسبة حضور</button>
    </div>
    ` : ""}

    <div id="gridContainer" class="at-grid-container"></div>
  `;

  if (mode === "filter") {
    content.querySelectorAll(".at-filter-btn").forEach((btn) =>
      btn.addEventListener("click", () => {
        content.querySelectorAll(".at-filter-btn").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        renderGrid(students, group, btn.dataset.filter);
      })
    );
  }

  document.getElementById("printAttendanceBtn")?.addEventListener("click", () => {
    printTableAsPDF("#attendanceGridTable", `شبكة الحضور — ${group.name}`, { landscape: true });
  });

  renderGrid(students, group, "code");
}

function renderGrid(students, group, sortBy) {
  const box = document.getElementById("gridContainer");
  const statuses = getStudentStatuses();
  const presentStatuses = new Set(statuses.filter((s) => s.presence === "present").map((s) => s.id));
  const attendance = getAttendance().filter((a) => a.category === "attendance");

  // بناء قائمة الحصص لكل شهر
  const months = buildMonths(group);
  const sessionDates = [];
  months.forEach((m) => {
    m.dates.forEach((d) => {
      if (!sessionDates.includes(d)) sessionDates.push(d);
    });
  });

  // بناء خريطة الحضور: studentId -> date -> status
  const attendanceMap = {};
  attendance.forEach((a) => {
    if (!attendanceMap[a.studentId]) attendanceMap[a.studentId] = {};
    const st = statuses.find((s) => s.id === a.statusId);
    attendanceMap[a.studentId][a.date] = {
      statusId: a.statusId,
      isPresent: presentStatuses.has(a.statusId),
      name: st?.name || "—",
    };
  });

  // حساب نسب الحضور والغياب لكل طالب
  const studentStats = students.map((s) => {
    const records = attendanceMap[s.id] || {};
    const total = sessionDates.length;
    const present = sessionDates.filter((d) => records[d]?.isPresent).length;
    const absent = total - present;
    const rate = total ? Math.round((present / total) * 100) : 0;
    return { student: s, total, present, absent, rate };
  });

  // ترتيب
  let sorted;
  if (sortBy === "code") {
    sorted = [...studentStats].sort((a, b) => (a.student.code || "").localeCompare(b.student.code || "", "ar", { numeric: true }));
  } else if (sortBy === "absent") {
    sorted = [...studentStats].sort((a, b) => b.absent - a.absent || (a.student.code || "").localeCompare(b.student.code || "", "ar", { numeric: true }));
  } else if (sortBy === "present") {
    sorted = [...studentStats].sort((a, b) => b.rate - a.rate || (a.student.code || "").localeCompare(b.student.code || "", "ar", { numeric: true }));
  } else {
    sorted = studentStats;
  }

  // بناء HTML
  box.innerHTML = `
    <div class="at-scroll-wrap">
      <table class="at-table" id="attendanceGridTable">
        <thead>
          <tr>
            <th class="at-th-name">الطالب</th>
            <th class="at-th-code">الكود</th>
            ${months.map((m) =>
              `<th colspan="${m.dates.length}" class="at-th-month">${escapeHTML(m.label)}</th>`
            ).join("")}
          </tr>
          <tr>
            <th></th><th></th>
            ${months.map((m) =>
              m.dates.map((d, i) => `<th class="at-th-session">${i + 1}</th>`).join("")
            ).join("")}
          </tr>
        </thead>
        <tbody>
          ${sorted.map(({ student: s, total, present, absent, rate }) => {
            const records = attendanceMap[s.id] || {};
            return `
              <tr>
                <td class="at-td-name">${escapeHTML(s.name)}</td>
                <td class="at-td-code">${escapeHTML(s.code || "")}</td>
                ${months.map((m) =>
                  m.dates.map((d) => {
                    const rec = records[d];
                    const isPresent = rec?.isPresent;
                    const hasRecord = !!rec;
                    return `<td class="at-cell ${hasRecord ? (isPresent ? "at-cell--present" : "at-cell--absent") : "at-cell--empty"}">${hasRecord ? (isPresent ? "✓" : "✗") : ""}</td>`;
                  }).join("")
                ).join("")}
              </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>

    <div class="at-legend">
      <div class="at-legend__item"><span class="at-cell at-cell--present" style="display:inline-flex; width:24px; height:24px; font-size:14px;">✓</span> حضور</div>
      <div class="at-legend__item"><span class="at-cell at-cell--absent" style="display:inline-flex; width:24px; height:24px; font-size:14px;">✗</span> غياب</div>
      <div class="at-legend__item"><span class="at-cell at-cell--empty" style="display:inline-flex; width:24px; height:24px;"></span> لم تُسجَّل</div>
    </div>
  `;
}

function buildMonths(group) {
  const today = new Date();
  const months = [];
  const monthNames = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

  for (let i = 0; i < 5; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const dates = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dayName = weekdayArForDate(dateStr);
      if ((group.days || []).includes(dayName)) {
        dates.push(dateStr);
      }
    }

    if (dates.length > 0) {
      months.push({
        label: `${monthNames[month]} ${year}`,
        dates: dates.slice(0, 8),
      });
    }
  }

  return months.reverse();
}

const style = document.createElement("style");
style.textContent = `
  .at-info-bar {
    display: flex; gap: 16px; margin-bottom: 16px; flex-wrap: wrap;
  }
  .at-info-bar__item {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 14px; border-radius: 8px;
    background: var(--bg-2); font-size: 13px; font-weight: 600; color: var(--muted);
  }
  .at-info-bar__item svg { width: 14px; height: 14px; }

  .at-filters { display: flex; gap: 6px; margin-bottom: 16px; flex-wrap: wrap; }
  .at-filter-btn.is-active { background: var(--primary); color: #fff; border-color: var(--primary); }

  .at-scroll-wrap {
    overflow-x: auto; border: 1px solid var(--border); border-radius: 12px;
    background: var(--bg);
  }
  .at-table {
    border-collapse: collapse; width: 100%; min-width: 600px; font-size: 12px;
  }
  .at-table th, .at-table td { padding: 6px 4px; text-align: center; border: 1px solid var(--border); }
  .at-th-month {
    background: var(--primary); color: #fff; font-weight: 700; font-size: 11px;
    padding: 6px 4px;
  }
  .at-th-session {
    background: rgba(102,126,234,.08); font-weight: 700; font-size: 11px;
    color: var(--primary); min-width: 28px; width: 28px;
  }
  .at-th-name {
    position: sticky; right: 0; background: var(--bg); z-index: 2;
    font-weight: 700; min-width: 120px; text-align: right; padding-right: 10px;
  }
  .at-th-code {
    position: sticky; right: 120px; background: var(--bg); z-index: 2;
    font-weight: 700; min-width: 40px;
  }
  .at-td-name {
    position: sticky; right: 0; background: var(--bg); z-index: 1;
    font-weight: 600; text-align: right; padding-right: 10px; white-space: nowrap;
  }
  .at-td-code {
    position: sticky; right: 120px; background: var(--bg); z-index: 1;
    font-weight: 700; font-size: 11px;
  }

  .at-cell {
    width: 28px; min-width: 28px; height: 28px;
    font-weight: 900; font-size: 14px;
    border-radius: 0;
  }
  .at-cell--present {
    background: rgba(16,185,129,.15); color: var(--success);
  }
  .at-cell--absent {
    background: rgba(239,68,68,.15); color: var(--danger);
  }
  .at-cell--empty {
    background: var(--bg-2); color: transparent;
  }

  .at-legend {
    display: flex; gap: 16px; margin-top: 12px; padding: 10px 16px;
    background: var(--bg-2); border-radius: 8px; font-size: 12px; font-weight: 600;
  }
  .at-legend__item { display: flex; align-items: center; gap: 6px; }
`;
document.head.appendChild(style);
