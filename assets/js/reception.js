// =========================================================
// Reception — استقبال الطلاب (بحث موحّد بالكود أو الاسم + معاينة مالية فورية)
// يُستخدم لحالة فردية خارج سياق حصة جماعية مفتوحة (طالب جاء بمفرده مثلًا)
// =========================================================

import { initPage } from "./app.js";
import { icons } from "./icons.js";
import { getStudents, getGrades, getGroups, getStudentStatuses, getAttendance, getExtraCharges, saveExtraCharges } from "./storage.js";
import { escapeHTML, formatMoney, todayISO, debounce } from "./helpers.js";
import { toast, confirmDialog } from "./ui.js";
import { gradeName, groupName, findGroup, statusesByCategory } from "./lookups.js";
import { recordAttendanceStatus, recordActionStatus } from "./attendance-service.js";
import { computeFinanceBreakdown, renderFinancePanelHTML } from "./finance-panel.js";
import { sendRewardNotification } from "./whatsapp-notifications.js";

const content = await initPage("reception");
let selectedStudentId = null;

if (content) render();

function render() {
  content.innerHTML = `
    <div class="page__header">
      <div>
        <div class="page__title">استقبال الطلاب</div>
        <div class="page__subtitle">اكتب كود الطالب أو اسمه لتسجيل حالته وحساب المطلوب منه فورًا</div>
      </div>
    </div>

    <div class="card card-pad" style="margin-bottom:22px;">
      <div class="search-hero">
        <input class="input" id="searchInput" placeholder="اكتب كود الطالب أو اسمه..." autofocus autocomplete="off">
        <span class="input-icon">${icons.search}</span>
        <div class="search-results" id="searchResults"></div>
      </div>
    </div>

    <div id="studentZone"></div>
  `;

  const input = document.getElementById("searchInput");
  const results = document.getElementById("searchResults");

  input.addEventListener(
    "input",
    debounce((e) => handleSearch(e.target.value.trim(), input, results), 120)
  );

  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const term = input.value.trim();
    if (!term) return;
    const match = findSingleMatch(term);
    if (match) {
      selectStudent(match.id, input, results);
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-hero")) results.classList.remove("is-open");
  });

  input.focus();
}

/** تطابق واحد ووحيد (بالكود أو الاسم) - يُستخدم عند الضغط على Enter */
function findSingleMatch(term) {
  const students = getStudents();
  const lower = term.toLowerCase();
  const matches = students.filter((s) => (s.code || "").toLowerCase().startsWith(lower) || s.name.toLowerCase().includes(lower));
  return matches.length === 1 ? matches[0] : null;
}

/** بحث موحّد: كود أو جزء من الاسم فى نفس الخانة */
function handleSearch(term, input, results) {
  if (!term) {
    results.classList.remove("is-open");
    results.innerHTML = "";
    return;
  }

  const students = getStudents();
  const grades = getGrades();
  const groups = getGroups();
  const lower = term.toLowerCase();

  const codeMatches = students.filter((s) => (s.code || "").toLowerCase().startsWith(lower));
  const nameMatches = students.filter((s) => !codeMatches.includes(s) && s.name.toLowerCase().includes(lower));
  const matches = [...codeMatches, ...nameMatches].slice(0, 8);

  // تطابق وحيد -> اختيار فورى بدون انتظار Enter
  if (matches.length === 1) {
    selectStudent(matches[0].id, input, results);
    return;
  }

  if (!matches.length) {
    results.innerHTML = `<div class="search-result-item"><div class="search-result-item__meta">لا يوجد طالب مطابق</div></div>`;
    results.classList.add("is-open");
    return;
  }

  results.innerHTML = matches
    .map(
      (s) => `
      <div class="search-result-item" data-id="${s.id}">
        <div>
          <div class="search-result-item__name">${escapeHTML(s.name)}</div>
          <div class="search-result-item__meta">${escapeHTML(gradeName(grades, s.gradeId))} · ${escapeHTML(groupName(groups, s.groupId))}</div>
        </div>
        <span class="code-pill">${escapeHTML(s.code || "-")}</span>
      </div>`
    )
    .join("");
  results.classList.add("is-open");

  results.querySelectorAll(".search-result-item[data-id]").forEach((el) =>
    el.addEventListener("click", () => selectStudent(el.dataset.id, input, results))
  );
}

function selectStudent(id, input, results) {
  selectedStudentId = id;
  results.classList.remove("is-open");
  results.innerHTML = "";
  input.value = "";
  input.focus();
  renderStudentZone();
}

function renderStudentZone() {
  const zone = document.getElementById("studentZone");
  const student = getStudents().find((s) => s.id === selectedStudentId);

  if (!student) {
    zone.innerHTML = "";
    return;
  }

  const grades = getGrades();
  const groups = getGroups();
  const statuses = getStudentStatuses();
  const attendanceStatuses = statusesByCategory(statuses, "attendance");
  const actionStatuses = statusesByCategory(statuses, "action");
  const group = findGroup(groups, student.groupId);

  const today = todayISO();
  const todayRecord = getAttendance().find((a) => a.studentId === student.id && a.date === today && a.category === "attendance");
  const currentStatus = todayRecord ? statuses.find((s) => s.id === todayRecord.statusId) : null;

  const breakdown = computeFinanceBreakdown(student, group, getExtraCharges());

  zone.innerHTML = `
    <div class="card card-pad">
      <div class="flex-between" style="flex-wrap:wrap; gap:14px;">
        <div>
          <div style="font-weight:800; font-size:19px;">${escapeHTML(student.name)}</div>
          <div class="text-muted" style="font-size:13.5px; margin-top:4px;">
            ${escapeHTML(gradeName(grades, student.gradeId))} · ${escapeHTML(groupName(groups, student.groupId))} ·
            <span class="code-pill">${escapeHTML(student.code || "-")}</span>
          </div>
        </div>
        ${
          currentStatus
            ? `<span class="badge badge-${currentStatus.tone}"><span class="badge-dot"></span>حالة اليوم: ${escapeHTML(currentStatus.name)} (${todayRecord.time})</span>`
            : `<span class="badge badge-neutral">لم يتم تسجيل حالة اليوم بعد</span>`
        }
      </div>

      ${renderFinancePanelHTML(breakdown)}
      <div class="status-btn-grid">
        ${attendanceStatuses
          .map(
            (s) => `
          <button class="btn btn-${s.tone} statusBtn" data-status="${s.id}" style="${currentStatus?.id === s.id ? "outline:2px solid rgba(0,0,0,.15);" : ""}">
            ${icons.check}<span>${escapeHTML(s.name)}</span>
          </button>`
          )
          .join("")}
      </div>

      ${
        actionStatuses.length
          ? `
        <div class="action-zone">
          <div class="action-zone__label">إجراءات استثنائية</div>
          <div class="status-btn-grid">
            ${actionStatuses
              .map(
                (s) => `
              <button class="btn btn-outline actionBtn" data-status="${s.id}" style="border-color: var(--${s.tone === "danger" ? "danger" : "warning"});">
                ${icons.alert}<span>${escapeHTML(s.name)}</span>
              </button>`
              )
              .join("")}
          </div>
        </div>`
          : ""
      }

      <div class="card card-pad" style="margin-top:18px; background: var(--bg); border-style:dashed;">
        <div class="card__head"><div class="card__title" style="font-size:14px;">آخر 5 حالات مسجلة لهذا الطالب</div></div>
        ${renderRecentHistory(student.id)}
      </div>
    </div>
  `;

  zone.querySelectorAll(".statusBtn").forEach((btn) =>
    btn.addEventListener("click", () => onStatusClick(student.id, btn.dataset.status))
  );
  zone.querySelectorAll(".actionBtn").forEach((btn) =>
    btn.addEventListener("click", () => onActionClick(student.id, btn.dataset.status))
  );
}

function renderRecentHistory(studentId) {
  const statuses = getStudentStatuses();
  const records = getAttendance()
    .filter((a) => a.studentId === studentId)
    .sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1))
    .slice(0, 5);

  if (!records.length) return `<div class="text-muted" style="font-size:13px;">لا يوجد سجل سابق</div>`;

  return `
    <div class="table-wrap" style="border:none; background:transparent;">
      <table class="table">
        <tbody>
          ${records
            .map((r) => {
              const s = statuses.find((st) => st.id === r.statusId);
              return `<tr>
                <td class="text-muted" style="white-space:nowrap;">${r.date}</td>
                <td><span class="badge badge-${s?.tone || "neutral"}"><span class="badge-dot"></span>${escapeHTML(s?.name || "-")}</span></td>
                <td class="text-muted" style="white-space:nowrap;">${r.time}</td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

/** تسجيل حالة حضور/غياب يومية — لو الحالة "حضر ودفع" بيستخدم المبلغ المُعدَّل فى خانة التحصيل */
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

  // لو المبلغ المُحصَّل غطى كل حاجة (حصة + مستحقات + استحقاقات إضافية)، نعتبر الاستحقاقات المسماة اتسددت
  if (status.payment === "paid") {
    const group = findGroup(getGroups(), result.student?.groupId);
    const breakdown = computeFinanceBreakdown(getStudents().find((s) => s.id === studentId) || result.student, group, getExtraCharges());
    if (collectedForCharges >= breakdown.grandTotal && breakdown.charges.length) {
      const charges = getExtraCharges();
      charges.forEach((c) => {
        if (c.studentId === studentId && c.status === "unpaid") c.status = "paid";
      });
      saveExtraCharges(charges);
    }
  }

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

/** تسجيل إجراء استثنائى (استدعاء ولى أمر / طرد) — يتطلب تأكيد صريح */
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

  // إشعار مكافأة
  if (result?.rewardResult && status.rewardAmount > 0) {
    sendRewardNotification(studentId, status.rewardAmount, status.name);
    toast(`مكافأة ${formatMoney(status.rewardAmount)} تمت إضافة المحفظة`, "success");
  }

  renderStudentZone();
}
