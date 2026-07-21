// =========================================================
// Session — إدارة الحصة (نفس شكل ومنطق "استقبال الطلاب" تمامًا،
// لكن البحث هنا بالكود أو الاسم داخل طلاب هذه الحصة فقط، ومعاها Pager
// للتنقل عبر كل طلاب المجموعة بالترتيب)
// =========================================================

import { initPage } from "./app.js";
import { icons } from "./icons.js";
import { getStudents, getGrades, getGroups, getStudentStatuses, getAttendance, getPayments, getSession, logSessionOpen, getExtraCharges, saveExtraCharges } from "./storage.js";
import { escapeHTML, formatMoney, todayISO, debounce } from "./helpers.js";
import { toast, confirmDialog, emptyStateHTML } from "./ui.js";
import { gradeName, groupName, groupsForGrade, statusesByCategory, findGroup } from "./lookups.js";
import { recordAttendanceStatus, recordActionStatus } from "./attendance-service.js";
import { sessionTimeStatus, formatTimeAr } from "./schedule.js";
import { computeFinanceBreakdown, renderFinancePanelHTML } from "./finance-panel.js";

const content = await initPage("session");

let selectedGroupId = null;
let selectedDate = todayISO();
let currentIndex = 0; // موضع الطالب الحالى داخل قائمة طلاب المجموعة المرتبة

if (content) init();

/** يفتح الصفحة مباشرة على مجموعة معينة لو جاءت فى الرابط (مثلاً من رابط "الحصة الجارية" فى الرئيسية) */
function init() {
  const params = new URLSearchParams(window.location.search);
  const urlGroupId = params.get("groupId");
  const urlDate = params.get("date") || todayISO();

  if (urlGroupId) {
    const group = getGroups().find((g) => g.id === urlGroupId);
    const timeStatus = group ? sessionTimeStatus(group, urlDate) : null;

    if (group && timeStatus !== "upcoming") {
      selectedGroupId = urlGroupId;
      selectedDate = urlDate;
      logSessionOpen(selectedGroupId, selectedDate, getSession()?.username || "unknown");
    } else if (group && timeStatus === "upcoming") {
      toast(`لسه معاد الحصة (${formatTimeAr(group.time)}) ما جاش`, "warning");
    }
  }

  render();
}

function render() {
  if (!selectedGroupId) return renderSelector();
  return renderWorkspace();
}

/* ================= شاشة اختيار الحصة ================= */
function renderSelector() {
  const grades = getGrades().slice().sort((a, b) => a.order - b.order);

  content.innerHTML = `
    <div class="page__header">
      <div>
        <div class="page__title">إدارة الحصة</div>
        <div class="page__subtitle">افتح حصة لتسجيل حضور كل طلاب المجموعة بسرعة فى مكان واحد</div>
      </div>
    </div>

    <div class="card card-pad" style="max-width:560px;">
      <div class="card__head"><div class="card__title">فتح حصة جديدة</div></div>
      ${
        !grades.length
          ? emptyStateHTML({ title: "لا توجد سنوات دراسية أو مجموعات بعد", text: "أضفها من الإعدادات أولًا." })
          : `
        <div class="field">
          <label class="field__label">السنة الدراسية</label>
          <select class="select" id="selGrade">
            ${grades.map((g) => `<option value="${g.id}">${escapeHTML(g.name)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label class="field__label">المجموعة</label>
          <select class="select" id="selGroup"></select>
        </div>
        <div class="field">
          <label class="field__label">التاريخ</label>
          <input class="input" type="date" id="selDate" value="${selectedDate}">
        </div>
        <button class="btn btn-primary" id="openSessionBtn" style="width:100%; justify-content:center;">${icons.grid} فتح الحصة</button>
      `
      }
    </div>
  `;

  if (!grades.length) return;

  const gradeSelect = document.getElementById("selGrade");
  const groupSelect = document.getElementById("selGroup");

  function fillGroups(gradeId) {
    const groups = groupsForGrade(getGroups(), gradeId);
    groupSelect.innerHTML = groups.length
      ? groups.map((g) => `<option value="${g.id}">${escapeHTML(g.name)} (${g.code}) — ${formatTimeAr(g.time)} — ${getStudents().filter((s) => s.groupId === g.id).length} طالب</option>`).join("")
      : `<option value="">لا توجد مجموعات لهذه السنة</option>`;
  }

  fillGroups(gradeSelect.value);
  gradeSelect.addEventListener("change", (e) => fillGroups(e.target.value));

  document.getElementById("openSessionBtn").addEventListener("click", () => {
    if (!groupSelect.value) {
      toast("اختر مجموعة أولًا", "warning");
      return;
    }
    const group = getGroups().find((g) => g.id === groupSelect.value);
    const date = document.getElementById("selDate").value || todayISO();
    const timeStatus = sessionTimeStatus(group, date);

    if (timeStatus === "upcoming") {
      toast(`لسه معاد الحصة (${formatTimeAr(group.time)}) ما جاش، هتقدر تفتحها فى معادها`, "warning");
      return;
    }

    selectedGroupId = groupSelect.value;
    selectedDate = date;
    currentIndex = 0;
    logSessionOpen(selectedGroupId, selectedDate, getSession()?.username || "unknown");
    render();
  });
}

/* ================= شاشة إدارة الحصة (بعد الفتح) ================= */
function getRoster() {
  return getStudents()
    .filter((s) => s.groupId === selectedGroupId)
    .sort((a, b) => (a.code || "").localeCompare(b.code || "", "en", { numeric: true }));
}

function renderWorkspace() {
  const groups = getGroups();
  const grades = getGrades();
  const group = groups.find((g) => g.id === selectedGroupId);

  if (!group) {
    selectedGroupId = null;
    return render();
  }

  const roster = getRoster();
  if (currentIndex >= roster.length) currentIndex = Math.max(0, roster.length - 1);

  content.innerHTML = `
    <div class="page__header">
      <div>
        <div class="page__title">إدارة الحصة</div>
        <div class="page__subtitle">${escapeHTML(group.name)} (${escapeHTML(group.code)}) · ${escapeHTML(gradeName(grades, group.gradeId))} · ${selectedDate}</div>
      </div>
      <button class="btn btn-outline btn-sm" id="changeSessionBtn">${icons.arrowLeft} تغيير الحصة</button>
    </div>

    <div class="quick-stats-bar" id="statsBar" style="margin-bottom:18px;"></div>

    <div class="card card-pad" style="margin-bottom:22px;">
      <div class="search-hero">
        <input class="input" id="searchInput" placeholder="اكتب كود الطالب أو اسمه (داخل هذه المجموعة)..." autofocus autocomplete="off">
        <span class="input-icon">${icons.search}</span>
        <div class="search-results" id="searchResults"></div>
      </div>

      <div class="pager" id="pager"></div>
    </div>

    <div id="studentZone"></div>
  `;

  document.getElementById("changeSessionBtn").addEventListener("click", () => {
    selectedGroupId = null;
    render();
  });

  const input = document.getElementById("searchInput");
  const results = document.getElementById("searchResults");

  input.addEventListener(
    "input",
    debounce((e) => handleSearch(e.target.value.trim(), roster, input, results), 120)
  );
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const term = input.value.trim();
    if (!term) return;
    const lower = term.toLowerCase();
    const matches = roster.filter((s) => (s.code || "").toLowerCase().startsWith(lower) || s.name.toLowerCase().includes(lower));
    if (matches.length === 1) selectByStudentId(matches[0].id, roster, input, results);
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-hero")) results.classList.remove("is-open");
  });

  renderStats(roster);
  renderPager(roster);
  renderStudentZone(roster);
}

function handleSearch(term, roster, input, results) {
  if (!term) {
    results.classList.remove("is-open");
    results.innerHTML = "";
    return;
  }
  const lower = term.toLowerCase();
  const codeMatches = roster.filter((s) => (s.code || "").toLowerCase().startsWith(lower));
  const nameMatches = roster.filter((s) => !codeMatches.includes(s) && s.name.toLowerCase().includes(lower));
  const matches = [...codeMatches, ...nameMatches].slice(0, 8);

  if (matches.length === 1) {
    selectByStudentId(matches[0].id, roster, input, results);
    return;
  }
  if (!matches.length) {
    results.innerHTML = `<div class="search-result-item"><div class="search-result-item__meta">لا يوجد طالب مطابق فى هذه المجموعة</div></div>`;
    results.classList.add("is-open");
    return;
  }
  results.innerHTML = matches
    .map(
      (s) => `
      <div class="search-result-item" data-id="${s.id}">
        <div class="search-result-item__name">${escapeHTML(s.name)}</div>
        <span class="code-pill">${escapeHTML(s.code || "-")}</span>
      </div>`
    )
    .join("");
  results.classList.add("is-open");
  results.querySelectorAll(".search-result-item[data-id]").forEach((el) =>
    el.addEventListener("click", () => selectByStudentId(el.dataset.id, roster, input, results))
  );
}

function selectByStudentId(studentId, roster, input, results) {
  const idx = roster.findIndex((s) => s.id === studentId);
  if (idx >= 0) currentIndex = idx;
  results.classList.remove("is-open");
  results.innerHTML = "";
  input.value = "";
  renderPager(roster);
  renderStudentZone(roster);
}

function renderPager(roster) {
  const box = document.getElementById("pager");
  if (!roster.length) {
    box.innerHTML = "";
    return;
  }
  box.innerHTML = `
    <button type="button" class="btn btn-outline btn-icon" id="pagerPrev" ${currentIndex <= 0 ? "disabled" : ""} title="السابق">${icons.arrowLeft}</button>
    <span class="pager__label">${currentIndex + 1} من ${roster.length}</span>
    <button type="button" class="btn btn-outline btn-icon" id="pagerNext" ${currentIndex >= roster.length - 1 ? "disabled" : ""} title="التالى" style="transform:scaleX(-1);">${icons.arrowLeft}</button>
  `;
  document.getElementById("pagerPrev")?.addEventListener("click", () => {
    if (currentIndex > 0) currentIndex--;
    renderPager(roster);
    renderStudentZone(roster);
  });
  document.getElementById("pagerNext")?.addEventListener("click", () => {
    if (currentIndex < roster.length - 1) currentIndex++;
    renderPager(roster);
    renderStudentZone(roster);
  });
}

function renderStats(roster) {
  const box = document.getElementById("statsBar");
  const attendance = getAttendance().filter((a) => a.date === selectedDate && a.category === "attendance" && roster.some((s) => s.id === a.studentId));
  const payments = getPayments().filter((p) => p.date === selectedDate && p.groupId === selectedGroupId);

  const countStatus = (id) => attendance.filter((a) => a.statusId === id).length;
  const registered = attendance.length;
  const collected = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  box.innerHTML = `
    <div class="quick-stats-bar__item"><span class="quick-stats-bar__value">${roster.length}</span><span class="quick-stats-bar__label">إجمالى الطلاب</span></div>
    <div class="quick-stats-bar__item"><span class="quick-stats-bar__value">${registered}</span><span class="quick-stats-bar__label">تم تسجيلهم</span></div>
    <div class="quick-stats-bar__item"><span class="quick-stats-bar__value">${roster.length - registered}</span><span class="quick-stats-bar__label">متبقى</span></div>
    <div class="quick-stats-bar__item"><span class="quick-stats-bar__value">${countStatus("ST-PAID")}</span><span class="quick-stats-bar__label">حضر ودفع</span></div>
    <div class="quick-stats-bar__item"><span class="quick-stats-bar__value">${countStatus("ST-UNPAID")}</span><span class="quick-stats-bar__label">حضر بدون دفع</span></div>
    <div class="quick-stats-bar__item"><span class="quick-stats-bar__value">${countStatus("ST-EXCUSED") + countStatus("ST-ABSENT")}</span><span class="quick-stats-bar__label">غياب</span></div>
    <div class="quick-stats-bar__item"><span class="quick-stats-bar__value">${formatMoney(collected)}</span><span class="quick-stats-bar__label">إجمالى المحصل</span></div>
  `;
}

function renderStudentZone(roster) {
  const zone = document.getElementById("studentZone");
  const student = roster[currentIndex];

  if (!student) {
    zone.innerHTML = emptyStateHTML({ icon: icons.users, title: "لا يوجد طلاب فى هذه المجموعة" });
    return;
  }

  const grades = getGrades();
  const groups = getGroups();
  const statuses = getStudentStatuses();
  const attendanceStatuses = statusesByCategory(statuses, "attendance");
  const actionStatuses = statusesByCategory(statuses, "action");
  const group = findGroup(groups, student.groupId);

  const today = selectedDate;
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
    </div>
  `;

  zone.querySelectorAll(".statusBtn").forEach((btn) =>
    btn.addEventListener("click", () => onStatusClick(student.id, btn.dataset.status, roster))
  );
  zone.querySelectorAll(".actionBtn").forEach((btn) =>
    btn.addEventListener("click", () => onActionClick(student.id, btn.dataset.status, roster))
  );
}

/** تسجيل حالة حضور/غياب — ثم الانتقال التلقائى للطالب التالى فى القائمة لتسريع المسح الجماعى */
function onStatusClick(studentId, statusId, roster) {
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

  const result = recordAttendanceStatus(studentId, statusId, selectedDate, options);
  if (!result) return;

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

  let message = `${result.status.name}: ${result.student.name}`;
  if (result.financeInfo) {
    message += ` — تم تحصيل ${formatMoney(result.financeInfo.collected)}`;
    if (result.financeInfo.remaining > 0) message += `، باقى عليه ${formatMoney(result.financeInfo.remaining)}`;
  }
  toast(message, result.status.tone === "danger" ? "danger" : "success");

  // الانتقال التلقائى للطالب التالى (لو موجود) لتسريع تسجيل باقى الفصل
  if (currentIndex < roster.length - 1) currentIndex++;

  renderStats(roster);
  renderPager(roster);
  renderStudentZone(roster);
}

async function onActionClick(studentId, statusId, roster) {
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

  recordActionStatus(studentId, statusId, selectedDate);
  toast(`تم تسجيل: ${status.name}`, status.tone === "danger" ? "danger" : "warning");
  renderStats(roster);
  renderStudentZone(roster);
}
