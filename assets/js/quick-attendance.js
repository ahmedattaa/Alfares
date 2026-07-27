// =========================================================
// حضور الطلاب — شاشة مسح سريع لكل طلاب المجموعة
// (تصميم جديد: مجموعات أولاً + فلترة + بحث + دفع منفصل)
// =========================================================

import { initPage } from "./app.js";
import { icons } from "./icons.js";
import {
  getStudents,
  getGroups,
  getGrades,
  getAttendance,
  getPayments,
  getAllPayments,
  getExtraCharges,
  getStudentStatuses,
  saveAttendance,
  savePayments,
  saveStudents,
  saveExtraCharges,
  addWalletDeposit,
  recordCashCollection,
} from "./storage.js";
import { escapeHTML, formatMoney, todayISO, formatDateAr, generateId, GROUP_CARD_PALETTE } from "./helpers.js";
import { toast, confirmDialog, menuDialog, formModal, emptyStateHTML, ensureOverlay } from "./ui.js";
import { findGroup, statusesByCategory, dueAmount } from "./lookups.js";
import { recordAttendanceStatus, recordActionStatus, settleLateBalance, settleExtraCharge, isStudentLocked, unlockStudent } from "./attendance-service.js";
import { getSessionsForDate } from "./session-overview.js";
import { sendAttendanceNotification, sendBulkAttendanceNotifications, openWhatsAppBulk, sendRewardNotification } from "./whatsapp-notifications.js";
import { openWhatsApp } from "./whatsapp.js";
import { getEscalationLevel, getLevelMeta } from "./escalation-engine.js";

const content = await initPage("quick-attendance");

let selectedGroupId = null;
let selectedDate = todayISO();
let currentFilter = "all"; // all | paid | unpaid
let searchTerm = "";

if (content) init();

function init() {
  const params = new URLSearchParams(window.location.search);
  const urlGroupId = params.get("groupId");
  const urlDate = params.get("date");
  if (urlGroupId) selectedGroupId = urlGroupId;
  if (urlDate) selectedDate = urlDate;
  render();
}

function render() {
  content.innerHTML = `
    <div class="sa-topbar">
      <div class="sa-topbar__right">
        <div class="sa-topbar__title">حضور الطلاب</div>
        <div class="sa-topbar__subtitle">سجّل حضور الطلاب بسرعة</div>
      </div>
      <div class="sa-topbar__left">
        <div class="sa-date-picker">
          <span class="sa-date-picker__icon">${icons.clock || "📅"}</span>
          <input type="date" class="sa-date-picker__input" id="datePicker" value="${selectedDate}">
          <span class="sa-date-picker__label" id="dateLabel">${formatDateAr(selectedDate)}</span>
        </div>
        <button class="btn btn-success btn-sm" id="bulkNotifyBtn">${icons.whatsapp} إشعارات جماعية</button>
      </div>
    </div>

    <div id="sessionSummary"></div>

    <div id="groupsRow" style="margin-bottom:20px;"></div>
    <div id="rosterZone"></div>
    <div id="absenceManagement" style="margin-top:24px;"></div>
  `;

  document.getElementById("bulkNotifyBtn").addEventListener("click", onBulkNotify);
  document.getElementById("datePicker").addEventListener("change", (e) => {
    selectedDate = e.target.value;
    document.getElementById("dateLabel").textContent = formatDateAr(selectedDate);
    renderGroupCards();
    refreshUI();
  });
  renderGroupCards();
  refreshUI();
}

/* ================= ملخص الحصة: شريط تقدم + ملخص مالي ================= */
function renderSessionSummary() {
  const box = document.getElementById("sessionSummary");
  if (!selectedGroupId) {
    box.innerHTML = "";
    return;
  }

  const group = findGroup(getGroups(), selectedGroupId);
  if (!group) { box.innerHTML = ""; return; }

  const allStudents = getStudents().filter((s) => s.groupId === selectedGroupId && s.status === "active");
  const total = allStudents.length;
  const attendance = getAttendance().filter((a) => a.date === selectedDate && a.category === "attendance");
  const statuses = getStudentStatuses();
  const payments = getPayments().filter((p) => p.date === selectedDate);
  const sessionPrice = group.sessionPrice || 0;

  let paidCount = 0, unpaidCount = 0, absentCount = 0, excusedCount = 0, calledCount = 0;
  let collected = 0, expected = 0;
  const breakdownRows = [];

  allStudents.forEach((s) => {
    const record = attendance.find((a) => a.studentId === s.id);
    const studentDue = dueAmount(s, group);
    const discount = Math.min(sessionPrice, Number(s.discount || 0));

    if (!record) {
      absentCount++;
      return;
    }
    const st = statuses.find((x) => x.id === record.statusId);
    if (st?.id === "ST-PAID") {
      paidCount++;
      const pay = payments.find((p) => p.studentId === s.id);
      const payAmount = pay ? Number(pay.amount || 0) : 0;
      collected += payAmount;
      expected += studentDue;
      const diff = payAmount - studentDue;
      breakdownRows.push({
        name: s.name,
        code: s.code || "-",
        discount,
        due: studentDue,
        paid: payAmount,
        diff,
        status: "paid",
        statusLabel: st.name,
      });
    } else if (st?.id === "ST-UNPAID") {
      unpaidCount++;
      expected += studentDue;
      breakdownRows.push({
        name: s.name,
        code: s.code || "-",
        discount,
        due: studentDue,
        paid: 0,
        diff: -studentDue,
        status: "unpaid",
        statusLabel: st.name,
      });
    } else if (st?.id === "ST-EXCUSED") {
      excusedCount++;
      breakdownRows.push({
        name: s.name,
        code: s.code || "-",
        discount,
        due: studentDue,
        paid: 0,
        diff: 0,
        status: "excused",
        statusLabel: st.name,
      });
    } else if (st?.id === "ST-CALL") {
      calledCount++;
      breakdownRows.push({
        name: s.name,
        code: s.code || "-",
        discount,
        due: studentDue,
        paid: 0,
        diff: 0,
        status: "called",
        statusLabel: st.name,
      });
    }
  });

  const presentCount = paidCount + unpaidCount;
  const percent = total ? Math.round((presentCount / total) * 100) : 0;
  const remaining = expected - collected;
  const studentsWithDiscount = breakdownRows.filter((r) => r.discount > 0);
  const studentsWithDiff = breakdownRows.filter((r) => r.status === "paid" && r.diff !== 0);

  box.innerHTML = `
    <div class="sa-summary">
      <div class="sa-summary__progress-section">
        <div class="sa-summary__progress-header">
          <span class="sa-summary__progress-title">الحضور</span>
          <span class="sa-summary__progress-count">${presentCount} / ${total}</span>
          <span class="sa-summary__progress-percent">${percent}%</span>
        </div>
        <div class="sa-summary__progress-bar">
          <div class="sa-summary__progress-fill" style="width:${percent}%;"></div>
        </div>
        <div class="sa-summary__progress-legend">
          <span class="sa-summary__legend-item" style="color:var(--success);">● حضر ودفع (${paidCount})</span>
          <span class="sa-summary__legend-item" style="color:var(--info);">● حضر بدون دفع (${unpaidCount})</span>
          <span class="sa-summary__legend-item" style="color:var(--warning);">● بإذن (${excusedCount})</span>
          <span class="sa-summary__legend-item" style="color:var(--danger);">● غائب (${absentCount})</span>
          <span class="sa-summary__legend-item" style="color:var(--muted);">● استدعاء (${calledCount})</span>
        </div>
      </div>
      <div class="sa-summary__finance-section">
        <div class="sa-summary__finance-row">
          <span class="sa-summary__finance-label">سعر الحصة</span>
          <span class="sa-summary__finance-value">${formatMoney(sessionPrice)}</span>
        </div>
        <div class="sa-summary__finance-row">
          <span class="sa-summary__finance-label">المتوقع</span>
          <span class="sa-summary__finance-value">${formatMoney(expected)}</span>
        </div>
        <div class="sa-summary__finance-row">
          <span class="sa-summary__finance-label">تم التحصيل</span>
          <span class="sa-summary__finance-value sa-summary__finance-value--collected">${formatMoney(collected)}</span>
        </div>
        ${remaining > 0 ? `
        <div class="sa-summary__finance-row">
          <span class="sa-summary__finance-label">المتبقي</span>
          <span class="sa-summary__finance-value sa-summary__finance-value--remaining">${formatMoney(remaining)}</span>
        </div>` : ""}
        ${studentsWithDiscount.length ? `
        <div class="sa-summary__finance-row" style="margin-top:6px; border-top:1px dashed var(--border);">
          <span class="sa-summary__finance-label" style="color:var(--warning);">طلاب بخصم</span>
          <span class="sa-summary__finance-value" style="color:var(--warning);">${studentsWithDiscount.length} طالب</span>
        </div>` : ""}
      </div>
    </div>

    ${breakdownRows.length ? `
    <div class="sa-breakdown" id="breakdownSection">
      <button type="button" class="sa-breakdown__toggle" id="breakdownToggle">
        <span>تفاصيل المبالغ لكل طالب</span>
        <span class="sa-breakdown__toggle-arrow" id="breakdownArrow">◂</span>
      </button>
      <div class="sa-breakdown__table-wrap" id="breakdownTable" style="display:none;">
        <table class="sa-breakdown__table">
          <thead>
            <tr>
              <th>الطالب</th>
              <th>الحالة</th>
              <th>الخصم</th>
              <th>المستحق</th>
              <th>المدفوع</th>
              <th>الفرق</th>
            </tr>
          </thead>
          <tbody>
            ${breakdownRows.map((r) => {
              const statusColor = r.status === "paid" ? "var(--success)" : r.status === "unpaid" ? "var(--danger)" : "var(--muted)";
              const diffText = r.status === "paid" ? (r.diff > 0 ? `+${formatMoney(r.diff)}` : r.diff < 0 ? formatMoney(r.diff) : "—") : r.status === "unpaid" ? formatMoney(r.diff) : "—";
              const diffColor = r.status === "paid" ? (r.diff > 0 ? "var(--success)" : r.diff < 0 ? "var(--danger)" : "var(--muted)") : "var(--muted)";
              const rowBg = r.status === "paid" ? (r.diff < 0 ? "rgba(239,68,68,.06)" : r.diff > 0 ? "rgba(16,185,129,.06)" : "") : r.status === "unpaid" ? "rgba(245,158,11,.06)" : "";
              return `
              <tr style="background:${rowBg};">
                <td><span class="code-pill" style="font-size:11px;">${escapeHTML(r.code)}</span> ${escapeHTML(r.name)}</td>
                <td><span class="badge badge-${r.status === "paid" ? "success" : r.status === "unpaid" ? "danger" : "neutral"}" style="font-size:11px;">${escapeHTML(r.statusLabel)}</span></td>
                <td>${r.discount > 0 ? `<span style="color:var(--warning); font-weight:700;">−${formatMoney(r.discount)}</span>` : "—"}</td>
                <td style="font-weight:700;">${formatMoney(r.due)}</td>
                <td style="font-weight:700; color:${r.paid > 0 ? "var(--success)" : "var(--muted)"};">${r.paid > 0 ? formatMoney(r.paid) : "—"}</td>
                <td style="font-weight:700; color:${diffColor};">${diffText}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>` : ""}
  `;

  const toggleBtn = document.getElementById("breakdownToggle");
  const tableEl = document.getElementById("breakdownTable");
  const arrowEl = document.getElementById("breakdownArrow");
  if (toggleBtn && tableEl) {
    toggleBtn.addEventListener("click", () => {
      const isVisible = tableEl.style.display !== "none";
      tableEl.style.display = isVisible ? "none" : "block";
      if (arrowEl) arrowEl.textContent = isVisible ? "◂" : "▾";
    });
  }
}

/* ================= صف مجموعات اليوم الملوّن ================= */
function renderGroupCards() {
  const box = document.getElementById("groupsRow");
  const sessions = getSessionsForDate(selectedDate);

  if (!sessions.length) {
    box.innerHTML = emptyStateHTML({ icon: icons.grid, title: "لا توجد حصص مجدولة لهذا التاريخ" });
    return;
  }

  const grades = getGrades().sort((a, b) => a.order - b.order);
  const gradesMap = {};
  grades.forEach((g) => (gradesMap[g.id] = g));

  const sortedSessions = sessions.slice().sort((a, b) => {
    const timeA = a.group.time || "00:00";
    const timeB = b.group.time || "00:00";
    return timeA.localeCompare(timeB);
  });

  box.innerHTML = `
    <div style="display:flex; flex-wrap:wrap; gap:10px; direction:rtl;">
      ${sortedSessions
        .map((s) => {
          const g = s.group;
          const grade = gradesMap[g.gradeId];
          const isActive = g.id === selectedGroupId;
          let palette;
          if (s.timeStatus === "ongoing") {
            palette = { bg: "#ECFDF5", border: "#10B981", text: "#047857" };
          } else if (s.timeStatus === "upcoming") {
            palette = { bg: "#2E1065", border: "#7C3AED", text: "#EDE9FE" };
          } else {
            palette = { bg: "var(--bg-2)", border: "var(--border)", text: "var(--muted)" };
          }
          const statusDot = s.timeStatus === "ongoing" ? "🟢" : s.timeStatus === "upcoming" ? "🟣" : "⚫";
          return `
            <button type="button" class="qa-group-card ${isActive ? "is-active" : ""}" data-group-id="${g.id}"
              style="background:${palette.bg}; border-color:${palette.border}; color:${palette.text}; ${isActive ? "outline:3px solid " + palette.border + ";" : ""}">
              <div class="qa-group-card__name">${statusDot} ${escapeHTML(g.name)}</div>
              <div class="qa-group-card__code">${escapeHTML(g.code)}</div>
            </button>
          `;
        })
        .join("")}
    </div>
  `;

  box.querySelectorAll(".qa-group-card").forEach((btn) =>
    btn.addEventListener("click", () => {
      selectedGroupId = btn.dataset.groupId;
      currentFilter = "all";
      searchTerm = "";
      renderGroupCards();
      refreshUI();
    })
  );
}

/* ================= إدارة الغيابات — قسم داخلي في الصفحة ================= */
function getUnregisteredStudents() {
  const allStudents = getStudents();
  const attendance = getAttendance().filter((a) => a.date === selectedDate && a.category === "attendance");
  const attendedIds = new Set(attendance.map((a) => a.studentId));

  return allStudents
    .filter((s) => s.status === "active" && !attendedIds.has(s.id))
    .sort((a, b) => (a.code || "").localeCompare(b.code || "", "en", { numeric: true }));
}

function renderAbsenceSection() {
  const box = document.getElementById("absenceManagement");
  if (!box) return;

  const sessions = getSessionsForDate(selectedDate);
  if (!sessions.length) { box.innerHTML = ""; return; }

  const allEnded = sessions.every((s) => s.timeStatus === "ended");
  const unregistered = getUnregisteredStudents();

  if (!unregistered.length) {
    if (!allEnded) { box.innerHTML = ""; return; }
    box.innerHTML = `
      <div class="card card-pad" style="border-right:3px solid var(--success); text-align:center; padding:24px;">
        <div style="font-size:32px; margin-bottom:8px;">✅</div>
        <div style="font-weight:700; color:var(--success);">تم تسجيل حضور كل الطلاب</div>
      </div>`;
    return;
  }

  if (!allEnded) {
    box.innerHTML = `
      <div class="card card-pad" style="border-right:3px solid var(--muted);">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:24px;">⏳</span>
          <div style="flex:1;">
            <div style="font-weight:700; font-size:14px;">إدارة الغيابات</div>
            <div style="font-size:12px; color:var(--muted);">هتظهر بعد انتهاء كل الحصص — فيه <strong>${unregistered.length}</strong> طالب لسه متسجلوش</div>
          </div>
        </div>
      </div>`;
    return;
  }

  const groups = getGroups();
  const grades = getGrades();

  const byGroup = {};
  unregistered.forEach((s) => {
    const gid = s.groupId || "unknown";
    if (!byGroup[gid]) byGroup[gid] = [];
    byGroup[gid].push(s);
  });

  let groupsHTML = "";
  Object.keys(byGroup).forEach((gid) => {
    const groupStudents = byGroup[gid];
    const group = findGroup(groups, gid);
    const grade = group ? grades.find((g) => g.id === group.gradeId) : null;
    const groupName = group ? `${group.name} (${group.code})` : "مجموعة محذوفة";
    const gradeNameStr = grade ? grade.name : "";

    groupsHTML += `
      <div style="margin-bottom:16px;">
        <div class="absence-group-header" style="display:flex; align-items:center; gap:8px; padding:8px 12px; background:var(--bg); border-radius:var(--r-sm); margin-bottom:8px;">
          <span>${icons.users}</span>
          <span style="font-weight:800; font-size:14px;">${escapeHTML(groupName)}</span>
          ${gradeNameStr ? `<span style="font-size:11px; color:var(--muted); font-weight:600;">${escapeHTML(gradeNameStr)}</span>` : ""}
          <span class="badge badge-danger" style="margin-right:auto;">${groupStudents.length}</span>
        </div>
        ${groupStudents.map((s) => {
          const phone = s.parentPhone || s.phone;
          return `
            <div class="absent-row" data-student-id="${s.id}" data-group-id="${gid}" style="display:flex; align-items:center; gap:8px; padding:8px 10px; border:1px solid var(--border); border-radius:8px; margin-bottom:6px;">
              <span class="code-pill" style="font-size:11px;">${escapeHTML(s.code || "-")}</span>
              <div style="flex:1; min-width:0;">
                <div style="font-weight:700; font-size:13px;">${escapeHTML(s.name)}</div>
              </div>
              <button type="button" class="btn btn-outline btn-xs absentWaBtn" data-phone="${escapeHTML(phone || "")}" data-name="${escapeHTML(s.name)}" title="إرسال لولي الأمر">${icons.whatsapp}</button>
              <button type="button" class="btn btn-danger btn-xs excuseOffBtn" data-student-id="${s.id}" data-phone="${escapeHTML(phone || "")}" data-name="${escapeHTML(s.name)}">🚫 بدون إذن</button>
              <button type="button" class="btn btn-warning btn-xs excuseOnBtn" data-student-id="${s.id}" data-phone="${escapeHTML(phone || "")}" data-name="${escapeHTML(s.name)}">📋 بإذن</button>
            </div>`;
        }).join("")}
      </div>`;
  });

  box.innerHTML = `
    <div class="card card-pad" style="border:2px solid var(--danger); margin-top:16px;">
      <div class="card__head" style="flex-wrap:wrap; gap:8px;">
        <div class="card__title" style="color:var(--danger);">إدارة الغيابات — ${formatDateAr(selectedDate)}</div>
        <span class="badge badge-danger">${unregistered.length} لم يسجّلوا</span>
        <button class="btn btn-success btn-sm" id="bulkAbsentNotifyBtn" style="margin-right:auto;">${icons.whatsapp} إرسال جماعي (${unregistered.length})</button>
      </div>
      <div style="font-size:12px; color:var(--muted); margin-bottom:12px;">
        اختار حالة كل طالب: غياب بدون إذن (هيتقفل) أو غياب بإذن
      </div>
      <div id="absenceGroupList">${groupsHTML}</div>
    </div>`;

  bindAbsenceEvents(box);
}

function bindAbsenceEvents(box) {
  box.querySelector("#bulkAbsentNotifyBtn")?.addEventListener("click", () => {
    const rows = box.querySelectorAll(".absent-row");
    const notifications = [];
    rows.forEach((row) => {
      const phone = row.querySelector(".absentWaBtn")?.dataset.phone;
      const name = row.querySelector(".absentWaBtn")?.dataset.name;
      if (phone) {
        notifications.push({
          phone,
          message: `مرحباً، أنا مستر فارس من سنتر الفارس التعليمي. الطالب/ة ${name} غاب اليوم ${formatDateAr(selectedDate)}. يرجى المتابعة.`,
          studentName: name,
        });
      }
    });
    if (notifications.length) {
      try { openWhatsAppBulk(notifications); } catch (e) { /* popup blocker */ }
      toast(`تم فتح واتساب لإرسال ${notifications.length} إشعار`, "success");
    } else {
      toast("لا أرقام هواتف متاحة", "warning");
    }
  });

  box.querySelectorAll(".excuseOffBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const studentId = btn.dataset.studentId;
      const name = btn.dataset.name;
      const phone = btn.dataset.phone;

      recordAttendanceStatus(studentId, "ST-ABSENT", selectedDate);

      if (phone) {
        try {
          openWhatsApp(phone, `مرحباً، أنا مستر فارس من سنتر الفارس التعليمي. الطالب/ة ${name} غاب اليوم ${formatDateAr(selectedDate)} بدون إذن. يرجى المتابعة.`);
        } catch (e) { /* popup blocker */ }
      }

      toast(`تم تسجيل غياب ${name} بدون إذن`, "warning");
      const row = btn.closest(".absent-row");
      const groupList = row?.closest("#absenceGroupList");
      row?.remove();
      cleanEmptyGroups(groupList);
      refreshStats();
    });
  });

  box.querySelectorAll(".excuseOnBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const studentId = btn.dataset.studentId;
      const name = btn.dataset.name;
      const phone = btn.dataset.phone;

      recordAttendanceStatus(studentId, "ST-EXCUSED", selectedDate);

      if (phone) {
        try {
          openWhatsApp(phone, `مرحباً، أنا مستر فارس من سنتر الفارس التعليمي. الطالب/ة ${name} غاب اليوم ${formatDateAr(selectedDate)} بإذن. شكراً لكم.`);
        } catch (e) { /* popup blocker */ }
        toast(`تم إرسال إشعار لولي أمر ${name}`, "success");
      }

      toast(`تم تسجيل غياب ${name} بإذن`, "success");
      const row = btn.closest(".absent-row");
      const groupList = row?.closest("#absenceGroupList");
      row?.remove();
      cleanEmptyGroups(groupList);
      refreshStats();
    });
  });

  box.querySelectorAll(".absentWaBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const phone = btn.dataset.phone;
      const name = btn.dataset.name;
      if (!phone) { toast("لا يوجد رقم هاتف", "warning"); return; }
      try { openWhatsApp(phone, `مرحباً، أنا مستر فارس من سنتر الفارس التعليمي. الطالب/ة ${name} غاب اليوم ${formatDateAr(selectedDate)}. يرجى المتابعة.`); } catch (e) { /* popup blocker */ }
    });
  });
}

function cleanEmptyGroups(groupList) {
  if (!groupList) return;
  groupList.querySelectorAll(".absence-group-header").forEach((header) => {
    const groupDiv = header.closest("div[style]");
    const rows = groupDiv?.querySelectorAll(".absent-row");
    if (!rows || rows.length === 0) groupDiv?.remove();
  });
}

function refreshStats() {
  const badge = document.querySelector("#absenceManagement .badge-danger");
  const btn = document.getElementById("bulkAbsentNotifyBtn");
  const rows = document.querySelectorAll("#absenceGroupList .absent-row");
  const count = rows.length;
  if (badge) badge.textContent = `${count} لم يسجّلوا`;
  if (btn) {
    btn.innerHTML = `${icons.whatsapp} إرسال جماعي (${count})`;
    if (count === 0) btn.style.display = "none";
  }
}

/** يرسل إشعارات واتساب جماعية لولياء طلاب المجموعة المحددة */
async function onBulkNotify() {
  if (!selectedGroupId) {
    toast("اختر مجموعة أولاً", "warning");
    return;
  }

  const group = findGroup(getGroups(), selectedGroupId);
  if (!group) return;

  const ok = await confirmDialog({
    title: "إرسال إشعارات جماعية",
    body: `هل تريد إرسال إشعار حضور لولياء طلاب "<strong>${escapeHTML(group.name)}</strong>"؟<br><br><small>سيتم إرسال رسالة لكل ولي أمر باسم طالبه وبياناته.</small>`,
    confirmText: "إرسال الإشعارات",
    tone: "success",
  });
  if (!ok) return;

  const notifications = sendBulkAttendanceNotifications(selectedGroupId, selectedDate);
  if (notifications.length === 0) {
    toast("لا توجد إشعارات مرسلة (تأكد من تسجيل الحضور أولاً)", "warning");
    return;
  }

  try {
    const result = openWhatsAppBulk(notifications);
    if (result) {
      toast(`تم فتح واتساب لإرسال ${result.total} إشعار (أول إشعار: ${result.first})`, "success");
    }
  } catch (e) { /* popup blocker */ }
}

/* ================= قائمة طلاب المجموعة المختارة ================= */

function renderRoster() {
  const box = document.getElementById("rosterZone");

  if (!selectedGroupId) {
    box.innerHTML = emptyStateHTML({ icon: icons.users, title: "اختر مجموعة من الأعلى للبدء" });
    return;
  }

  const group = findGroup(getGroups(), selectedGroupId);
  if (!group) {
    box.innerHTML = "";
    return;
  }

  let roster = getStudents()
    .filter((s) => s.groupId === selectedGroupId && s.status === "active")
    .sort((a, b) => (a.code || "").localeCompare(b.code || "", "en", { numeric: true }));

  const attendance = getAttendance().filter((a) => a.date === selectedDate && a.category === "attendance");
  const payments = getPayments().filter((p) => p.date === selectedDate);
  const charges = getExtraCharges();
  const statuses = getStudentStatuses();

  const studentData = roster.map((s) => {
    const record = attendance.find((a) => a.studentId === s.id);
    const status = record ? statuses.find((st) => st.id === record.statusId) : null;
    const payment = payments.find((p) => p.studentId === s.id);
    const hasOtherDues = studentHasOtherDues(s, charges);
    return { student: s, record, status, payment, hasOtherDues };
  });

  let filtered = studentData;
  if (currentFilter === "paid") {
    filtered = studentData.filter((d) => d.record?.statusId === "ST-PAID");
  } else if (currentFilter === "unpaid") {
    filtered = studentData.filter((d) => d.record?.statusId === "ST-UNPAID");
  } else if (currentFilter === "absent") {
    filtered = studentData.filter((d) => d.record?.statusId === "ST-ABSENT");
  } else if (currentFilter === "excused") {
    filtered = studentData.filter((d) => d.record?.statusId === "ST-EXCUSED");
  } else if (currentFilter === "not-registered") {
    filtered = studentData.filter((d) => !d.record);
  }

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filtered = filtered.filter((d) => {
      const fullCode = (d.student.code || "").toLowerCase();
      const withinGroupCode = fullCode.startsWith(group.code.toLowerCase()) ? fullCode.slice(group.code.length) : fullCode;
      return withinGroupCode.includes(term) || d.student.name.toLowerCase().includes(term);
    });
  }

  const totalStudents = studentData.length;
  const paidCount = studentData.filter((d) => d.record?.statusId === "ST-PAID").length;
  const unpaidCount = studentData.filter((d) => d.record?.statusId === "ST-UNPAID").length;
  const absentCount = studentData.filter((d) => d.record?.statusId === "ST-ABSENT").length;
  const excusedCount = studentData.filter((d) => d.record?.statusId === "ST-EXCUSED").length;
  const notRegistered = totalStudents - paidCount - unpaidCount - absentCount - excusedCount;

  box.innerHTML = `
    <div class="roster-header">
      <div class="roster-header__name">${escapeHTML(group.name)}</div>
      <div class="roster-header__code">${escapeHTML(group.code)}</div>
    </div>

    <div class="roster-controls">
      <div class="roster-controls__search">
        <span class="roster-controls__search-icon">${icons.search}</span>
        <input class="input input--roster" id="searchInput" inputmode="none" placeholder="اكتب كود الطالب..." value="${escapeHTML(searchTerm)}">
        <button type="button" class="numpad__toggle" id="numpadToggle" title="البحث بالاسم">أب</button>
      </div>
      <div class="roster-controls__filter">
        <select class="select select--roster" id="filterSelect">
          <option value="all" ${currentFilter === "all" ? "selected" : ""}>جميع الطلاب (${totalStudents})</option>
          <option value="paid" ${currentFilter === "paid" ? "selected" : ""}>✓ تم الدفع (${paidCount})</option>
          <option value="unpaid" ${currentFilter === "unpaid" ? "selected" : ""}>✗ حضر بدون دفع (${unpaidCount})</option>
          <option value="absent" ${currentFilter === "absent" ? "selected" : ""}>🚫 غياب (${absentCount})</option>
          <option value="excused" ${currentFilter === "excused" ? "selected" : ""}>📋 غياب بإذن (${excusedCount})</option>
          <option value="not-registered" ${currentFilter === "not-registered" ? "selected" : ""}>— لم يتم التسجيل (${notRegistered})</option>
        </select>
      </div>
    </div>

    <div class="numpad" id="numpad">
      <div class="numpad__grid">
        <button type="button" class="numpad__key" data-key="1">1</button>
        <button type="button" class="numpad__key" data-key="2">2</button>
        <button type="button" class="numpad__key" data-key="3">3</button>
        <button type="button" class="numpad__key" data-key="4">4</button>
        <button type="button" class="numpad__key" data-key="5">5</button>
        <button type="button" class="numpad__key" data-key="6">6</button>
        <button type="button" class="numpad__key" data-key="7">7</button>
        <button type="button" class="numpad__key" data-key="8">8</button>
        <button type="button" class="numpad__key" data-key="9">9</button>
        <button type="button" class="numpad__key numpad__key--back" data-key="back">⌫</button>
        <button type="button" class="numpad__key" data-key="0">0</button>
        <button type="button" class="numpad__key numpad__key--enter" data-key="enter">↵</button>
      </div>
    </div>

    <div class="quick-stats-bar" style="margin-bottom:16px;">
      <div class="quick-stats-bar__item"><span class="quick-stats-bar__value">${totalStudents}</span><span class="quick-stats-bar__label">إجمالى</span></div>
      <div class="quick-stats-bar__item"><span class="quick-stats-bar__value" style="color:var(--success);">${paidCount}</span><span class="quick-stats-bar__label">دفعوا</span></div>
      <div class="quick-stats-bar__item"><span class="quick-stats-bar__value" style="color:var(--warning);">${unpaidCount}</span><span class="quick-stats-bar__label">لم يدفعوا</span></div>
      <div class="quick-stats-bar__item"><span class="quick-stats-bar__value" style="color:var(--danger);">${absentCount}</span><span class="quick-stats-bar__label">غياب</span></div>
      <div class="quick-stats-bar__item"><span class="quick-stats-bar__value" style="color:var(--muted);">${excusedCount}</span><span class="quick-stats-bar__label">بإذن</span></div>
      <div class="quick-stats-bar__item"><span class="quick-stats-bar__value" style="color:var(--text); opacity:.5;">${notRegistered}</span><span class="quick-stats-bar__label">لم يُسجَّل</span></div>
    </div>

    <div id="studentsList"></div>
  `;

  document.getElementById("filterSelect").addEventListener("change", (e) => {
    currentFilter = e.target.value;
    renderRoster();
  });

  document.getElementById("searchInput").addEventListener("input", (e) => {
    searchTerm = e.target.value.trim();
    renderFilteredStudents();
  });

  // نumpad — ربط الأزرار
  const searchInput = document.getElementById("searchInput");
  const numpadEl = document.getElementById("numpad");
  let numpadMode = true; // الوضع الافتراضي: لوحة أرقام

  // زر التبديل بين لوحة الأرقام ولوحة المفاتيح
  document.getElementById("numpadToggle")?.addEventListener("click", () => {
    numpadMode = !numpadMode;
    const toggleBtn = document.getElementById("numpadToggle");
    if (numpadMode) {
      searchInput.setAttribute("inputmode", "none");
      searchInput.placeholder = "اكتب كود الطالب...";
      numpadEl.style.display = "";
      toggleBtn.textContent = "أب";
      toggleBtn.title = "البحث بالاسم";
      searchInput.blur();
    } else {
      searchInput.removeAttribute("inputmode");
      searchInput.placeholder = "اكتب اسم الطالب...";
      numpadEl.style.display = "none";
      toggleBtn.textContent = "١٢٣";
      toggleBtn.title = "لوحة أرقام";
      searchInput.focus();
    }
  });

  document.getElementById("numpad")?.addEventListener("click", (e) => {
    const key = e.target.closest("[data-key]")?.dataset.key;
    if (!key) return;
    e.preventDefault();

    if (key === "back") {
      searchInput.value = searchInput.value.slice(0, -1);
    } else if (key === "enter") {
      // ترك الرقم كما هو — المستخدم يديل رقم واحد بس للطالب اللي بعده
    } else {
      // إضافة رقم
      searchInput.value += key;
    }

    searchTerm = searchInput.value.trim();
    renderFilteredStudents();
  });

  renderStudentsList(filtered);
}

function renderFilteredStudents() {
  if (!selectedGroupId) return;
  const group = findGroup(getGroups(), selectedGroupId);
  if (!group) return;

  let roster = getStudents()
    .filter((s) => s.groupId === selectedGroupId && s.status === "active")
    .sort((a, b) => (a.code || "").localeCompare(b.code || "", "en", { numeric: true }));

  const attendance = getAttendance().filter((a) => a.date === selectedDate && a.category === "attendance");
  const charges = getExtraCharges();
  const statuses = getStudentStatuses();
  const payments = getAllPayments();

  const studentData = roster.map((s) => {
    const record = attendance.find((a) => a.studentId === s.id);
    const status = record ? statuses.find((st) => st.id === record.statusId) : null;
    const hasOtherDues = studentHasOtherDues(s, charges);

    let stillUnpaid = false;
    if (record && status?.payment === "unpaid") {
      const paid = payments.some(
        (p) => p.studentId === s.id && p.attendanceId === record.id && p.status === "paid"
      );
      stillUnpaid = !paid;
    }

    const hasCollectionDues = stillUnpaid || Number(s.lateBalance || 0) > 0;

    return { student: s, record, status, hasOtherDues, stillUnpaid, hasCollectionDues };
  });

  let filtered = studentData;
  if (currentFilter === "paid") {
    filtered = studentData.filter((d) => d.record?.statusId === "ST-PAID");
  } else if (currentFilter === "unpaid") {
    filtered = studentData.filter((d) => d.record?.statusId === "ST-UNPAID");
  } else if (currentFilter === "absent") {
    filtered = studentData.filter((d) => d.record?.statusId === "ST-ABSENT");
  } else if (currentFilter === "excused") {
    filtered = studentData.filter((d) => d.record?.statusId === "ST-EXCUSED");
  } else if (currentFilter === "not-registered") {
    filtered = studentData.filter((d) => !d.record);
  }

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filtered = filtered.filter((d) => {
      const fullCode = (d.student.code || "").toLowerCase();
      const withinGroupCode = fullCode.startsWith(group.code.toLowerCase()) ? fullCode.slice(group.code.length) : fullCode;
      return withinGroupCode.includes(term) || d.student.name.toLowerCase().includes(term);
    });
  }

  renderStudentsList(filtered);
}

function studentHasOtherDues(student, charges) {
  const unpaid = charges.filter((c) => c.studentId === student.id && c.status === "unpaid");
  return unpaid.length > 0 || Number(student.lateBalance || 0) > 0;
}

function renderStudentsList(data) {
  const box = document.getElementById("studentsList");

  if (!data.length) {
    box.innerHTML = emptyStateHTML({ icon: icons.users, title: "لا يوجد طلاب مطابقين" });
    return;
  }

  box.innerHTML = data
    .map(({ student: s, record, status, hasOtherDues, stillUnpaid, hasCollectionDues }) => {
      const isPaid = record?.statusId === "ST-PAID";
      const isUnpaid = record?.statusId === "ST-UNPAID" && stillUnpaid;
      const isAbsent = record?.statusId === "ST-ABSENT";
      const isExcused = record?.statusId === "ST-EXCUSED";
      const hasRecord = !!record;
      const isLocked = isStudentLocked(s);
      const escLevel = getEscalationLevel(s.id);
      const escMeta = getLevelMeta(escLevel);

      return `
        <div class="qa-row ${hasRecord ? "is-processed" : ""} ${isPaid ? "is-paid" : ""} ${isUnpaid ? "is-unpaid" : ""} ${isAbsent ? "is-absent" : ""} ${isExcused ? "is-excused" : ""} ${isLocked ? "is-locked" : ""}" data-student-id="${s.id}">
          <span class="code-pill">${escapeHTML(s.code || "-")}</span>
          <span class="qa-row__name">${escapeHTML(s.name)}</span>
          ${(s.walletBalance || 0) > 0 ? `<span class="badge badge-success" style="font-size:10px;">${icons.wallet} ${formatMoney(s.walletBalance)}</span>` : ""}
          ${escLevel > 0 ? `<span class="badge badge-${escMeta.color}" style="font-size:10px;">${escMeta.icon} تصعيد ${escLevel}</span>` : ""}
          ${isLocked ? `<span class="badge badge-danger" style="margin-right:auto;">مقفول: ${escapeHTML(s.lockReason || "")}</span>` : ""}
          ${
            hasRecord
              ? `
                <span class="badge badge-${status?.tone || "neutral"}" style="margin-right:auto;">${escapeHTML(status?.name || "-")}</span>
                <button type="button" class="btn btn-outline btn-sm editRowBtn" data-id="${s.id}">${icons.edit}</button>
                ${hasCollectionDues ? `<button type="button" class="btn btn-success btn-sm collectBtn" data-id="${s.id}">${icons.money} تحصيل</button>` : ""}
              `
              : isLocked
              ? `<button type="button" class="btn btn-warning btn-sm unlockBtn" data-id="${s.id}" style="margin-right:auto;">${icons.unlock} فتح القفل</button>`
              : `
                <button type="button" class="btn btn-success btn-sm paidBtn" data-id="${s.id}" style="margin-right:auto;">${icons.check} حضر ودفع</button>
                <button type="button" class="btn btn-info btn-sm unpaidBtn" data-id="${s.id}">${icons.clock} حضر بدون دفع</button>
              `
          }
          ${hasOtherDues ? `<button type="button" class="btn btn-warning btn-sm otherDuesBtn" data-id="${s.id}" title="مستحقات أخرى">${icons.money}</button>` : ""}
        </div>
      `;
    })
    .join("");

  // ربط الأحداث
  box.querySelectorAll(".paidBtn").forEach((btn) => btn.addEventListener("click", () => quickMark(btn.dataset.id, "ST-PAID")));
  box.querySelectorAll(".unpaidBtn").forEach((btn) => btn.addEventListener("click", () => quickMark(btn.dataset.id, "ST-UNPAID")));
  box.querySelectorAll(".editRowBtn").forEach((btn) => btn.addEventListener("click", () => openEditMenu(btn.dataset.id)));
  box.querySelectorAll(".collectBtn").forEach((btn) => btn.addEventListener("click", () => openCollectDialog(btn.dataset.id)));
  box.querySelectorAll(".otherDuesBtn").forEach((btn) => btn.addEventListener("click", () => openOtherDuesPopup(btn.dataset.id)));
  box.querySelectorAll(".unlockBtn").forEach((btn) => btn.addEventListener("click", () => handleUnlock(btn.dataset.id)));
}

function refreshUI() {
  renderSessionSummary();
  renderRoster();
  renderAbsenceSection();
}

function quickMark(studentId, statusId) {
  const result = recordAttendanceStatus(studentId, statusId, selectedDate);

  if (!result) return;

  // لو الطالب مقفول
  if (result.locked) {
    toast(`الطالب ${result.student.name} مقفول (${result.reason}) — لا يمكن تسجيل حضوره إلا بفتح القفل`, "warning");
    return;
  }

  let message = `${result.status.name}: ${result.student.name}`;
  if (result.financeInfo) message += ` — ${formatMoney(result.financeInfo.collected)}`;
  toast(message, "success");

  // إرسال إشعار واتساب تلقائي لولي الأمر (للحضور فقط)
  try {
    const status = getStudentStatuses().find((s) => s.id === statusId);
    if (status && status.presence === "present" && status.payment) {
      const notification = sendAttendanceNotification(studentId, statusId, selectedDate, result.financeInfo);
      if (notification) {
        openWhatsApp(notification.phone, notification.message);
        toast(`تم إرسال إشعار لولي أمر ${notification.studentName}`, "success");
      }
    }
  } catch (e) { /* popup blocker — تجاهل */ }

  refreshUI();
}

async function openEditMenu(studentId) {
  const student = getStudents().find((s) => s.id === studentId);
  const statuses = getStudentStatuses();
  const attendanceStatuses = statusesByCategory(statuses, "attendance");
  const actionStatuses = statusesByCategory(statuses, "action");

  const chosen = await menuDialog({
    title: `${student?.name || ""} — ${student?.code || ""}`,
    bodyHTML: `<div class="field__hint" style="margin-bottom:4px;">اختر الحالة الصحيحة</div>`,
    buttons: [...attendanceStatuses, ...actionStatuses].map((s) => ({ id: s.id, label: s.name, tone: s.tone })),
  });
  if (!chosen) return;

  const status = statuses.find((s) => s.id === chosen);
  let result;

  if (status.category === "action") {
    const ok = await confirmDialog({
      title: `تأكيد: ${status.name}`,
      body: `هل أنت متأكد من تسجيل "<strong>${escapeHTML(status.name)}</strong>" للطالب <strong>${escapeHTML(student?.name || "")}</strong>؟`,
      confirmText: "تأكيد",
      tone: status.tone === "danger" ? "danger" : "warning",
    });
    if (!ok) return;
    result = recordActionStatus(studentId, chosen, selectedDate);
  } else {
    result = recordAttendanceStatus(studentId, chosen, selectedDate);
  }

  if (result?.locked) {
    toast(`الطالب ${result.student.name} مقفول (${result.reason}) — لا يمكن تسجيل حالة جديدة`, "warning");
    return;
  }

  // إشعار مكافأة (نجم الحصة)
  if (result?.rewardResult && status.rewardAmount > 0) {
    sendRewardNotification(studentId, status.rewardAmount, status.name);
    const debtMsg = result.rewardResult.debtCovered > 0 ? ` — تم سداد ${formatMoney(result.rewardResult.debtCovered)} من المتأخرات` : "";
    toast(`مكافأة ${formatMoney(status.rewardAmount)} تمت إضافة محفظة ${student?.name || ""}${debtMsg}`, "success");
  }

  toast(`تم تحديث حالة ${student?.name || ""}`, "success");
  refreshUI();
}

async function handleUnlock(studentId) {
  const student = getStudents().find((s) => s.id === studentId);
  if (!student) return;

  const ok = await confirmDialog({
    title: "فتح القفل",
    body: `هل تريد فتح القفل على الطالب <strong>${escapeHTML(student.name)}</strong>؟<br><br><small>السبب الحالي: ${escapeHTML(student.lockReason || "")}</small>`,
    confirmText: "فتح القفل",
    tone: "success",
  });
  if (!ok) return;

  unlockStudent(studentId);
  toast(`تم فتح القفل على ${student.name}`, "success");
  refreshUI();
}

/**
 * شاشة تحصيل المتأخرات — كل حصة زرار ملون، اضغط للتحصيل
 */
async function openCollectDialog(studentId) {
  const student = getStudents().find((s) => s.id === studentId);
  if (!student) return;

  const group = findGroup(getGroups(), student.groupId);
  if (!group) return;

  const statuses = getStudentStatuses();

  function getUnpaidItems() {
    const st = getStudents().find((s) => s.id === studentId);
    const attendance = getAttendance().filter(
      (a) => a.studentId === studentId && a.category === "attendance"
    );
    const payments = getAllPayments();

    const items = [];
    attendance.forEach((record) => {
      const status = statuses.find((s) => s.id === record.statusId);
      if (status && status.payment === "unpaid") {
        const alreadyPaid = payments.some(
          (p) => p.studentId === studentId && p.attendanceId === record.id && p.status === "paid"
        );
        if (alreadyPaid) return;
        items.push({
          id: record.id,
          date: record.date,
          amount: dueAmount(st || student, group),
          statusId: record.statusId,
          type: "session",
        });
      }
    });

    if (Number((st || student).lateBalance || 0) > 0) {
      items.push({
        id: "late-balance",
        date: "متأخرات سابقة",
        amount: (st || student).lateBalance,
        statusId: null,
        type: "late",
      });
    }
    return items;
  }

  let unpaidItems = getUnpaidItems();
  if (!unpaidItems.length) {
    toast("لا توجد مستحقات على هذا الطالب", "success");
    return;
  }

  const overlay = ensureOverlay();

  function renderList() {
    unpaidItems = getUnpaidItems();
    if (!unpaidItems.length) {
      overlay.innerHTML = `
        <div class="modal" style="max-width:480px;">
          <div class="modal__head">
            <div class="modal__title">تحصيل — ${escapeHTML(student.name)}</div>
          </div>
          <div class="modal__body" style="text-align:center; padding:32px;">
            <div style="font-size:32px; margin-bottom:8px;">✅</div>
            <div style="font-weight:700; color:var(--success);">تم تحصيل كل المستحقات</div>
          </div>
          <div class="modal__actions">
            <button class="btn btn-primary" id="modalDone">تم</button>
          </div>
        </div>`;
      overlay.querySelector("#modalDone")?.addEventListener("click", () => overlay.classList.remove("is-open"));
      return;
    }

    const total = unpaidItems.reduce((sum, i) => sum + i.amount, 0);

    const itemsHTML = unpaidItems.map((item, idx) => {
      const isLate = item.type === "late";
      const label = isLate ? item.date : "حصة — " + formatDateAr(item.date);
      const color = isLate ? "var(--danger)" : "var(--warning)";
      const bg = isLate ? "rgba(239,68,68,0.08)" : "rgba(245,158,11,0.08)";
      const border = isLate ? "rgba(239,68,68,0.25)" : "rgba(245,158,11,0.25)";

      return `
        <button type="button" class="collect-item-btn" data-index="${idx}"
          style="width:100%; display:flex; align-items:center; gap:12px; padding:14px 16px;
                 background:${bg}; border:2px solid ${border}; border-radius:var(--r-md);
                 cursor:pointer; text-align:right; transition:all 0.15s;">
          <div style="width:40px; height:40px; border-radius:var(--r-sm); background:${color}; color:#fff;
                      display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0;">
            ${icons.money}
          </div>
          <div style="flex:1;">
            <div style="font-weight:700; font-size:14px; color:${color};">${label}</div>
            <div style="font-size:12px; color:var(--muted);">اضغط للتحصيل</div>
          </div>
          <div style="font-weight:800; font-size:16px; color:${color};">${formatMoney(item.amount)}</div>
        </button>`;
    }).join("");

    overlay.innerHTML = `
      <div class="modal" style="max-width:480px;">
        <div class="modal__head">
          <div class="modal__title">تحصيل — ${escapeHTML(student.name)}</div>
        </div>
        <div class="modal__body">
          <div style="margin-bottom:12px; padding:10px; background:var(--bg); border-radius:var(--r-sm); font-size:12px; color:var(--muted);">
            اضغط على الحصة لتأكيد تحصيلها
          </div>
          <div style="display:flex; flex-direction:column; gap:8px;">${itemsHTML}</div>
          <div style="margin-top:16px; padding-top:12px; border-top:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:700;">الإجمالى المتبقي:</span>
            <span style="font-weight:800; font-size:18px; color:var(--danger);">${formatMoney(total)}</span>
          </div>
        </div>
        <div class="modal__actions">
          <button class="btn btn-primary" id="modalDone">تم</button>
        </div>
      </div>`;

    overlay.querySelector("#modalDone")?.addEventListener("click", () => overlay.classList.remove("is-open"));

    overlay.querySelectorAll(".collect-item-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const idx = Number(btn.dataset.index);
        const item = unpaidItems[idx];
        if (!item) return;

        const label = item.type === "late" ? item.date : "حصة " + formatDateAr(item.date);
        const ok = await confirmDialog({
          title: "تأكيد التحصيل",
          body: `هل تم تحصيل <strong>${formatMoney(item.amount)}</strong> (${label}) من <strong>${escapeHTML(student.name)}</strong>؟`,
          confirmText: "تم التحصيل",
          tone: "success",
        });
        if (!ok) return;

        if (item.type === "late") {
          const students = getStudents();
          const si = students.findIndex((s) => s.id === studentId);
          if (si >= 0) {
            students[si].lateBalance = Math.max(0, (students[si].lateBalance || 0) - item.amount);
            saveStudents(students);
          }
          const payments = getAllPayments();
          payments.push({
            id: generateId("PAY"),
            studentId,
            groupId: student.groupId,
            attendanceId: null,
            date: todayISO(),
            sessionDate: "متأخرات سابقة",
            amount: item.amount,
            status: "paid",
            lateBalanceDelta: -item.amount,
            note: "تحصيل متأخرات سابقة",
          });
          savePayments(payments);
          recordCashCollection(studentId, item.amount, "late", "تحصيل متأخرات سابقة", { referenceId: payments[payments.length - 1].id, referenceType: "payment" });
        } else {
          const payments = getAllPayments();
          payments.push({
            id: generateId("PAY"),
            studentId,
            groupId: student.groupId,
            attendanceId: item.id,
            date: todayISO(),
            sessionDate: item.date,
            amount: item.amount,
            status: "paid",
            lateBalanceDelta: -item.amount,
            note: `حصة (${formatDateAr(item.date)})`,
          });
          savePayments(payments);
          recordCashCollection(studentId, item.amount, "session", `حصة (${formatDateAr(item.date)})`, { referenceId: payments[payments.length - 1].id, referenceType: "payment" });
        }

        toast(`تم تحصيل ${formatMoney(item.amount)} من ${student.name}`, "success");
        renderList();
        overlay.classList.add("is-open");
        refreshUI();
      });
    });
  }

  overlay.classList.add("is-open");
  renderList();
}

async function openOtherDuesPopup(studentId) {
  const student = getStudents().find((s) => s.id === studentId);
  const charges = getExtraCharges().filter((c) => c.studentId === studentId && c.status === "unpaid");

  const buttons = charges.map((c) => ({ id: `charge:${c.id}`, label: `${c.name} — ${formatMoney(c.amount)}`, tone: "warning" }));
  if (Number(student?.lateBalance || 0) > 0) {
    buttons.push({ id: "lateBalance", label: `متأخرات سابقة — ${formatMoney(student.lateBalance)}`, tone: "danger" });
  }

  if (!buttons.length) {
    toast("لا توجد مستحقات أخرى على هذا الطالب", "success");
    return;
  }

  const chosen = await menuDialog({
    title: `مستحقات أخرى — ${student?.name || ""}`,
    bodyHTML: `<div class="field__hint">اضغط على البند لتأكيد تحصيله</div>`,
    buttons,
  });
  if (!chosen) return;

  if (chosen === "lateBalance") {
    const result = settleLateBalance(studentId);
    if (result) toast(`تم تحصيل المتأخرات (${formatMoney(result.amount)})`, "success");
  } else if (chosen.startsWith("charge:")) {
    const chargeId = chosen.slice(7);
    const charge = settleExtraCharge(chargeId);
    if (charge) toast(`تم تحصيل "${charge.name}"`, "success");
  }

  refreshUI();
}

async function openDepositDialog(studentId) {
  const student = getStudents().find((s) => s.id === studentId);
  if (!student) return;

  const currentWallet = Number(student.walletBalance || 0);
  const currentDebt = Number(student.lateBalance || 0);

  const html = `
    <div style="margin-bottom:12px;">
      <div style="font-size:13px; color:var(--muted); margin-bottom:4px;">الرصيد الحالي</div>
      <div style="font-size:18px; font-weight:800; color:var(--success);">${formatMoney(currentWallet)}</div>
    </div>
    ${currentDebt > 0 ? `<div style="margin-bottom:12px;"><div style="font-size:13px; color:var(--muted);">المتأخرات: <strong style="color:var(--danger);">${formatMoney(currentDebt)}</strong></div><div class="field__hint">أول حاجة هتتغطى من المتأخرات، والباقي يروح للمحفظة</div></div>` : ""}
    <label class="field__label">المبلغ المدفوع (ج.م)</label>
    <input type="number" class="input" name="amount" min="1" step="1" placeholder="0" autofocus required>
  `;

  const data = await formModal({
    title: `إيداع — ${student.name}`,
    bodyHTML: html,
    submitText: "إيداع",
  });
  if (!data) return;

  const amount = Number(data.amount || 0);
  if (amount <= 0) { toast("أدخل مبلغ صحيح", "warning"); return; }

  const result = addWalletDeposit(studentId, amount);
  if (!result) { toast("فشلت عملية الإيداع", "error"); return; }

  let msg = `تم إيداع ${formatMoney(amount)}`;
  if (result.debtCovered > 0) msg += ` — تغطية متأخرات: ${formatMoney(result.debtCovered)}`;
  if (result.walletDeposit > 0) msg += ` — رصيد جديد: ${formatMoney(result.newWalletBalance)}`;
  toast(msg, "success");

  try {
    if (student.parentPhone) {
      openWhatsApp(student.parentPhone, `تم استلام ${formatMoney(amount)} لحساب ${student.name}${result.debtCovered > 0 ? ` (تغطية متأخرات: ${formatMoney(result.debtCovered)})` : ""}. الرصيد المتاح: ${formatMoney(result.newWalletBalance)}. شكراً لكم — سنتر الفارس التعليمي`);
    }
  } catch (e) { /* popup blocker */ }

  refreshUI();
}

// ================= CSS إضافي للتصميم الجديد =================
const style = document.createElement("style");
style.textContent = `
  .qa-group-card {
    border: 2px solid;
    border-radius: 12px;
    padding: 12px;
    cursor: pointer;
    text-align: center;
    transition: all 0.2s;
    font-family: inherit;
    min-width: 140px;
    flex: 0 0 auto;
  }
  .qa-group-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  }
  .qa-group-card.is-active {
    outline: 3px solid currentColor;
    transform: translateY(-2px);
  }
  .qa-group-card__name {
    font-weight: 700;
    font-size: 14px;
  }
  .qa-group-card__code {
    font-size: 12px;
    opacity: 0.8;
    margin-top: 4px;
  }
  .qa-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    transition: all 0.2s;
  }
  .qa-row:hover {
    background: var(--bg-2);
  }
  .qa-row.is-paid {
    background: rgba(16, 185, 129, 0.1);
    border-left: 3px solid var(--success);
  }
  .qa-row.is-unpaid {
    background: rgba(245, 158, 11, 0.1);
    border-left: 3px solid var(--warning);
  }
  .qa-row.is-absent {
    background: rgba(239, 68, 68, 0.08);
    border-left: 3px solid var(--danger);
  }
  .qa-row.is-excused {
    background: rgba(107, 114, 128, 0.08);
    border-left: 3px solid var(--muted);
  }
  .qa-row.is-processed {
    opacity: 0.7;
  }
  .qa-row.is-locked {
    background: rgba(239, 68, 68, 0.08);
    border-left: 3px solid var(--danger);
  }
  .qa-row__name {
    flex: 1;
    font-weight: 600;
  }
  .qa-checkbox-row:hover {
    background: var(--bg-2);
  }
  .qa-checkbox-row input:checked + div {
    color: var(--success);
  }
  .roster-header {
    text-align: center;
    padding: 24px 16px;
    margin-bottom: 16px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 16px;
    color: #fff;
    box-shadow: 0 4px 15px rgba(102,126,234,.4);
  }
  .roster-header__name {
    font-size: 24px;
    font-weight: 800;
    color: #fff;
    margin-bottom: 6px;
  }
  .roster-header__code {
    font-size: 13px;
    font-weight: 600;
    color: rgba(255,255,255,.85);
    background: rgba(255,255,255,.2);
    display: inline-block;
    padding: 3px 14px;
    border-radius: 20px;
    border: 1px solid rgba(255,255,255,.3);
  }
  .roster-controls {
    display: flex;
    gap: 10px;
    margin-bottom: 16px;
    align-items: stretch;
  }
  .roster-controls__search {
    flex: 1;
    position: relative;
  }
  .roster-controls__search-icon {
    position: absolute;
    right: 16px;
    top: 50%;
    transform: translateY(-50%);
    color: #999;
    pointer-events: none;
    z-index: 1;
  }
  .roster-controls__filter {
    flex: 0 0 180px;
  }
  .select--roster {
    width: 100%;
    height: 100%;
    padding: 8px 10px;
    font-size: 12px;
    font-weight: 600;
    border-radius: 10px;
    border: 2px solid var(--border);
    background: var(--bg);
    cursor: pointer;
  }
  .input--roster {
    width: 100%;
    padding: 16px 16px 16px 52px;
    font-size: 18px;
    font-weight: 700;
    border-radius: 14px;
    border: 3px solid #e0e0e0;
    background: #fff;
    color: #222;
    box-shadow: 0 2px 8px rgba(0,0,0,.06);
    transition: border-color .2s, box-shadow .2s;
  }
  .input--roster::placeholder {
    color: #bbb;
    font-weight: 500;
    font-size: 16px;
  }
  .input--roster:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 4px rgba(102,126,234,.18);
  }

  /* ── Top Bar ── */
  .sa-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 20px;
    margin-bottom: 16px;
    background: var(--bg-2);
    border-radius: 14px;
    border: 1px solid var(--border);
    flex-wrap: wrap;
  }
  .sa-topbar__right {
    display: flex;
    flex-direction: column;
  }
  .sa-topbar__title {
    font-size: 20px;
    font-weight: 800;
    color: var(--text);
  }
  .sa-topbar__subtitle {
    font-size: 13px;
    color: var(--muted);
    margin-top: 2px;
  }
  .sa-topbar__left {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  /* ── Date Picker ── */
  .sa-date-picker {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #fff;
    border: 2px solid var(--border);
    border-radius: 10px;
    padding: 8px 12px;
    cursor: pointer;
    transition: border-color .2s;
  }
  .sa-date-picker:hover {
    border-color: var(--primary);
  }
  .sa-date-picker__icon {
    font-size: 16px;
    color: var(--primary);
  }
  .sa-date-picker__input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
    pointer-events: none;
  }
  .sa-date-picker__label {
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
    white-space: nowrap;
  }

  /* ── Session Summary ── */
  .sa-summary {
    display: flex;
    gap: 16px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
  .sa-summary__progress-section {
    flex: 2;
    min-width: 280px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 18px 20px;
  }
  .sa-summary__progress-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }
  .sa-summary__progress-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--text);
  }
  .sa-summary__progress-count {
    font-size: 14px;
    font-weight: 700;
    color: var(--muted);
    margin-right: auto;
  }
  .sa-summary__progress-percent {
    font-size: 20px;
    font-weight: 800;
    color: var(--primary);
  }
  .sa-summary__progress-bar {
    width: 100%;
    height: 14px;
    background: var(--border);
    border-radius: 10px;
    overflow: hidden;
    margin-bottom: 12px;
  }
  .sa-summary__progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
    border-radius: 10px;
    transition: width .4s ease;
  }
  .sa-summary__progress-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
  }
  .sa-summary__legend-item {
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }

  /* ── Finance Section ── */
  .sa-summary__finance-section {
    flex: 1;
    min-width: 200px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .sa-summary__finance-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 0;
  }
  .sa-summary__finance-row + .sa-summary__finance-row {
    border-top: 1px solid var(--border);
  }
  .sa-summary__finance-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
  }
  .sa-summary__finance-value {
    font-size: 15px;
    font-weight: 800;
    color: var(--text);
  }
  .sa-summary__finance-value--collected {
    color: var(--success);
  }
  .sa-summary__finance-value--remaining {
    color: var(--danger);
  }

  /* ── Breakdown Table ── */
  .sa-breakdown {
    margin-bottom: 16px;
    border: 1px solid var(--border);
    border-radius: 14px;
    overflow: hidden;
    background: var(--bg-2);
  }
  .sa-breakdown__toggle {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    background: var(--bg-2);
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
    transition: background .15s;
  }
  .sa-breakdown__toggle:hover {
    background: var(--border);
  }
  .sa-breakdown__toggle-arrow {
    font-size: 14px;
    color: var(--muted);
    transition: transform .2s;
  }
  .sa-breakdown__table-wrap {
    overflow-x: auto;
    border-top: 1px solid var(--border);
  }
  .sa-breakdown__table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .sa-breakdown__table th {
    background: var(--bg);
    padding: 10px 12px;
    text-align: right;
    font-weight: 700;
    color: var(--muted);
    font-size: 12px;
    border-bottom: 2px solid var(--border);
    white-space: nowrap;
  }
  .sa-breakdown__table td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
    white-space: nowrap;
  }
  .sa-breakdown__table tr:last-child td {
    border-bottom: none;
  }
  .sa-breakdown__table tr:hover {
    background: var(--bg);
  }

  /* ── Responsive ── */
  @media (max-width: 768px) {
    .roster-controls { flex-wrap: wrap; gap: 8px; }
    .roster-controls__filter { flex: 1 1 100%; }
    .input--roster { font-size: 16px; }
    .sa-summary__progress-section { min-width: 0; }
    .sa-summary__finance-section { min-width: 0; }
  }
  @media (max-width: 560px) {
    .sa-topbar { flex-direction: column; align-items: stretch; padding: 12px; gap: 10px; }
    .sa-topbar__left { justify-content: stretch; }
    .sa-topbar__title { font-size: 16px; }
    .sa-date-picker { width: 100%; justify-content: center; }
    .sa-summary { flex-direction: column; }
    .sa-summary__progress-section, .sa-summary__finance-section { min-width: 0; flex: auto; }
    .sa-summary__finance-row { font-size: 12px; }
    .sa-summary__progress-legend { gap: 6px; font-size: 11px; }
    .sa-breakdown__table { font-size: 12px; }
    .sa-breakdown__table th, .sa-breakdown__table td { padding: 8px 6px; }
  }

  /* ── Numpad ── */
  .numpad{
    margin-bottom:16px;
  }
  .numpad__grid{
    display:flex;
    flex-wrap:wrap;
    gap:8px;
  }
  .numpad__key{
    width:52px; height:52px;
    border-radius:var(--r-md);
    border:1px solid var(--border);
    background:var(--bg-2);
    font-family:inherit;
    font-size:22px;
    font-weight:700;
    color:var(--text);
    cursor:pointer;
    display:flex; align-items:center; justify-content:center;
    transition:background .1s, transform .1s;
    -webkit-tap-highlight-color:transparent;
    user-select:none;
    touch-action:manipulation;
    flex:0 0 52px;
  }
  .numpad__key:active{
    background:var(--border);
    transform:scale(0.95);
  }
  .numpad__key--back{
    background:rgba(239,68,68,.08);
    color:var(--danger);
    border-color:rgba(239,68,68,.2);
    font-size:18px;
  }
  .numpad__key--back:active{
    background:rgba(239,68,68,.18);
  }
  .numpad__key--enter{
    background:var(--primary);
    color:#fff;
    border-color:var(--primary);
    font-size:18px;
  }
  .numpad__key--enter:active{
    background:var(--primary-dark);
  }
  .numpad__toggle{
    position:absolute;
    left:10px; top:50%; transform:translateY(-50%);
    width:36px; height:36px;
    border-radius:var(--r-md);
    border:1px solid var(--border);
    background:var(--bg);
    color:var(--muted);
    font-family:inherit;
    font-size:13px; font-weight:700;
    cursor:pointer;
    display:flex; align-items:center; justify-content:center;
    z-index:2;
    transition:background .15s, color .15s;
  }
  .numpad__toggle:hover{
    background:var(--primary-light);
    color:var(--primary);
  }
  .roster-controls__search{ position:relative; }
  @media (max-width:400px){
    .numpad__key{
      width:46px; height:46px; flex:0 0 46px;
      font-size:19px;
    }
  }
`;
document.head.appendChild(style);
