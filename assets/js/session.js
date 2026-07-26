// =========================================================
// Session — إدارة الحصة (نفس شكل ومنطق "استقبال الطلاب" تمامًا،
// لكن البحث هنا بالكود أو الاسم داخل طلاب هذه الحصة فقط، ومعاها Pager
// للتنقل عبر كل طلاب المجموعة بالترتيب)
// =========================================================

import { initPage } from "./app.js";
import { icons } from "./icons.js";
import { getStudents, getGrades, getGroups, getStudentStatuses, getAttendance, getPayments, getSession, logSessionOpen, closeSession, getExtraCharges, saveExtraCharges, addWalletDeposit } from "./storage.js";
import { escapeHTML, formatMoney, todayISO, debounce } from "./helpers.js";
import { toast, confirmDialog, emptyStateHTML, formModal } from "./ui.js";
import { gradeName, groupName, groupsForGrade, statusesByCategory, findGroup } from "./lookups.js";
import { recordAttendanceStatus, recordActionStatus } from "./attendance-service.js";
import { formatTimeAr, sessionTimeStatus } from "./schedule.js";
import { computeFinanceBreakdown, renderFinancePanelHTML } from "./finance-panel.js";
import { sendRewardNotification } from "./whatsapp-notifications.js";
import { getSessionsForDate, nextReadySession } from "./session-overview.js";
import { sendAttendanceNotification, sendBulkAttendanceNotifications, openWhatsAppBulk } from "./whatsapp-notifications.js";
import { openWhatsApp } from "./whatsapp.js";
import { canPerformSensitiveAction } from "./permissions.js";

const content = await initPage("session");

let selectedGroupId = null;
let selectedDate = todayISO();
let currentIndex = 0; // موضع الطالب الحالى داخل قائمة طلاب المجموعة المرتبة
let tempMakeupStudents = []; // طلاب التعويض المؤقتين للحصة الحالية

if (content) init();

/** يفتح الصفحة مباشرة على مجموعة معينة لو جاءت فى الرابط (مثلاً من رابط "الحصة الجارية" فى الرئيسية) */
function init() {
  const params = new URLSearchParams(window.location.search);
  const urlGroupId = params.get("groupId");
  const urlDate = params.get("date") || todayISO();

  if (urlGroupId) {
    const group = getGroups().find((g) => g.id === urlGroupId);

    if (group) {
      selectedGroupId = urlGroupId;
      selectedDate = urlDate;
      logSessionOpen(selectedGroupId, selectedDate, getSession()?.username || "unknown");
    }
  }

  render();
}

function render() {
  if (!selectedGroupId) return renderSelector();
  return renderWorkspace();
}

/* ================= شاشة تصفح حصص تاريخ معين ================= */
function renderSelector() {
  content.innerHTML = `
    <div class="page__header">
      <div>
        <div class="page__title">إدارة الحصة</div>
        <div class="page__subtitle">اختر تاريخًا لعرض حصصه، وافتح أى حصة لتسجيل حضورها ومتابعة موقفها المالى</div>
      </div>
    </div>

    <div class="card card-pad" style="margin-bottom:20px; max-width:320px;">
      <div class="field" style="margin-bottom:0;">
        <label class="field__label">التاريخ</label>
        <input class="input" type="date" id="browseDateInput" value="${selectedDate}">
      </div>
    </div>

    <div id="sessionsListZone"></div>
  `;

  document.getElementById("browseDateInput").addEventListener("change", (e) => {
    selectedDate = e.target.value || todayISO();
    renderSessionsList();
  });

  renderSessionsList();
}

function renderSessionsList() {
  const box = document.getElementById("sessionsListZone");
  const sessions = getSessionsForDate(selectedDate);

  if (!sessions.length) {
    box.innerHTML = emptyStateHTML({ icon: icons.grid, title: "لا توجد حصص مجدولة فى هذا التاريخ" });
    return;
  }

  const statusMeta = {
    upcoming: { label: "قادمة", tone: "info" },
    ongoing: { label: "جارية الآن", tone: "success" },
    ended: { label: "منتهية", tone: "primary" },
  };

  box.innerHTML = sessions
    .map((s) => {
      const meta = statusMeta[s.timeStatus];
      const highlight = s.timeStatus === "ongoing" ? "border:2px solid var(--success); background: var(--success-light);" : "border:1px solid var(--border);";

      return `
        <div class="card card-pad" style="margin-bottom:12px; ${highlight}">
          <div class="flex-between" style="flex-wrap:wrap; gap:10px;">
            <div>
              <div style="font-weight:800; font-size:15px;">${escapeHTML(s.group.name)} <span class="code-pill" style="margin-right:6px;">${escapeHTML(s.group.code)}</span></div>
              <div class="text-muted" style="font-size:12.5px; margin-top:3px;">${escapeHTML(s.gradeLabel)} — ${formatTimeAr(s.group.time)}</div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              ${s.closed ? `<span class="badge badge-neutral">مقفولة</span>` : s.opened ? `<span class="badge badge-primary">مفتوحة</span>` : ""}
              <span class="badge badge-${meta.tone}"><span class="badge-dot"></span>${meta.label}</span>
            </div>
          </div>

          ${
            true
              ? `
            <div class="divider"></div>
            <div class="quick-stats-bar" style="margin-bottom:12px;">
              <div class="quick-stats-bar__item"><span class="quick-stats-bar__value">${s.presentCount}</span><span class="quick-stats-bar__label">حضور</span></div>
              <div class="quick-stats-bar__item"><span class="quick-stats-bar__value" style="color:${s.absentCount ? "var(--danger)" : "inherit"};">${s.absentCount}</span><span class="quick-stats-bar__label">غياب</span></div>
              <div class="quick-stats-bar__item"><span class="quick-stats-bar__value">${s.registeredCount}/${s.enrolledCount}</span><span class="quick-stats-bar__label">تم تسجيلهم</span></div>
              <div class="quick-stats-bar__item"><span class="quick-stats-bar__value" style="color:${s.dues < 0 ? "var(--danger)" : "var(--success)"};">${formatMoney(s.dues)}</span><span class="quick-stats-bar__label">الاستحقاقات</span></div>
            </div>
            <button type="button" class="btn ${s.timeStatus === "ongoing" ? "btn-success" : "btn-outline"} btn-sm openSessionCardBtn" data-group-id="${s.group.id}" style="width:100%; justify-content:center;">
              ${icons.grid} ${s.opened ? "متابعة الحصة" : "فتح الحصة"}
            </button>`
              : ``
          }
        </div>
      `;
    })
    .join("");

  box.querySelectorAll(".openSessionCardBtn").forEach((btn) =>
    btn.addEventListener("click", () => openSessionFromCard(btn.dataset.groupId))
  );
}

function openSessionFromCard(groupId) {
  const group = getGroups().find((g) => g.id === groupId);

  selectedGroupId = groupId;
  currentIndex = 0;
  tempMakeupStudents = [];
  logSessionOpen(selectedGroupId, selectedDate, getSession()?.username || "unknown");
  render();
}

/* ================= تسجيل طالب تعويض ================= */
function openMakeupModal(group) {
  const allStudents = getStudents().filter((s) => s.status === "active");
  const existingIds = new Set(
    getStudents().filter((s) => s.groupId === selectedGroupId).map((s) => s.id).concat(tempMakeupStudents.map((s) => s.id))
  );

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <div class="modal__head">
        <div class="modal__title">${icons.users} تسجيل طالب تعويض — ${escapeHTML(group.name)}</div>
      </div>
      <div class="modal__body">
        <p style="font-size:13px; color:var(--muted); margin-bottom:12px;">اختر طالبًا من مجموعة أخرى لتسجيل حضوره ك تعويض فى هذه الحصة</p>
        <div class="search-hero" style="position:relative;">
          <input class="input" id="makeupSearchInput" placeholder="اكتب كود الطالب أو اسمه..." autocomplete="off" autofocus>
          <span class="input-icon">${icons.search}</span>
          <div class="search-results" id="makeupSearchResults" style="position:absolute; top:100%; left:0; right:0; z-index:10;"></div>
        </div>
      </div>
      <div class="modal__actions">
        <button type="button" class="btn btn-outline" id="makeupCancel">إغلاق</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.classList.add("is-open");

  const close = () => { overlay.classList.remove("is-open"); overlay.remove(); };
  overlay.querySelector("#makeupCancel").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  const input = overlay.querySelector("#makeupSearchInput");
  const results = overlay.querySelector("#makeupSearchResults");

  function renderMakeupResults(term) {
    if (!term) { results.classList.remove("is-open"); results.innerHTML = ""; return; }
    const lower = term.toLowerCase();
    const matches = allStudents
      .filter((s) => !existingIds.has(s.id))
      .filter((s) => (s.code || "").toLowerCase().startsWith(lower) || s.name.toLowerCase().includes(lower))
      .slice(0, 10);

    if (!matches.length) {
      results.innerHTML = `<div class="search-result-item"><div class="search-result-item__meta">لا يوجد طالب مطابق</div></div>`;
      results.classList.add("is-open");
      return;
    }

    const grades = getGrades();
    const groups = getGroups();
    results.innerHTML = matches.map((s) => {
      const gName = findGroup(groups, s.groupId)?.name || "—";
      const grName = gradeName(grades, s.gradeId) || "—";
      return `
        <div class="search-result-item" data-id="${s.id}" style="cursor:pointer;">
          <div class="search-result-item__name">${escapeHTML(s.name)}</div>
          <div style="display:flex; gap:6px; align-items:center;">
            <span class="code-pill">${escapeHTML(s.code || "-")}</span>
            <span style="font-size:11px; color:var(--muted);">${escapeHTML(grName)} — ${escapeHTML(gName)}</span>
          </div>
        </div>`;
    }).join("");
    results.classList.add("is-open");

    results.querySelectorAll(".search-result-item[data-id]").forEach((el) =>
      el.addEventListener("click", () => {
        const studentId = el.dataset.id;
        const student = allStudents.find((s) => s.id === studentId);
        if (!student) return;

        const statuses = getStudentStatuses();
        const paidStatus = statuses.find((s) => s.id === "ST-PAID") || statuses.find((s) => s.payment === "paid");
        if (!paidStatus) { toast("لم يتم العثور على حالة الدفع", "error"); return; }

        recordAttendanceStatus(student.id, paidStatus.id, selectedDate, { sessionGroupId: selectedGroupId });

        if (!tempMakeupStudents.some((s) => s.id === student.id)) {
          tempMakeupStudents.push(student);
        }

        toast(`تم تسجيل ${student.name} كطالب تعويض`, "success");
        close();
        renderStats(getRoster());
        renderPager(getRoster());
        renderStudentZone(getRoster());
      })
    );
  }

  input.addEventListener("input", debounce((e) => renderMakeupResults(e.target.value.trim()), 150));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const term = input.value.trim();
      if (term) renderMakeupResults(term);
    }
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-hero")) results.classList.remove("is-open");
  });
}

/* ================= شاشة إدارة الحصة (بعد الفتح) ================= */
function getRoster() {
  const regular = getStudents()
    .filter((s) => s.groupId === selectedGroupId)
    .sort((a, b) => (a.code || "").localeCompare(b.code || "", "en", { numeric: true }));
  const makeupIds = new Set(tempMakeupStudents.map((s) => s.id));
  const makeup = tempMakeupStudents.filter((s) => !regular.some((r) => r.id === s.id));
  return [...regular, ...makeup];
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

  const timeStatus = sessionTimeStatus(group, selectedDate);

  content.innerHTML = `
    <div class="page__header">
      <div>
        <div class="page__title">إدارة الحصة</div>
        <div class="page__subtitle">${escapeHTML(group.name)} (${escapeHTML(group.code)}) · ${escapeHTML(gradeName(grades, group.gradeId))} · ${selectedDate}</div>
      </div>
      <div class="flex-gap" style="flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm" id="makeupBtn">${icons.users} تسجيل طالب تعويض</button>
        <a class="btn btn-outline btn-sm" href="quick-attendance.html?groupId=${group.id}&date=${selectedDate}">${icons.grid} حضور الطلاب</a>
        <a class="btn btn-outline btn-sm" href="attendance-tracker.html?groupId=${group.id}&mode=filter">${icons.clipboard} متابعة الغياب</a>
        <button class="btn btn-outline btn-sm" id="closeSessionBtn">${icons.check} قفل الحصة</button>
        <button class="btn btn-outline btn-sm" id="changeSessionBtn">${icons.arrowLeft} قائمة الحصص</button>
      </div>
    </div>

    <div class="quick-stats-bar" id="statsBar" style="margin-bottom:18px;"></div>

    <div class="card card-pad" style="margin-bottom:12px;">
      <div class="flex-between" style="flex-wrap:wrap; gap:10px;">
        <div style="font-weight:700; font-size:14px;">${icons.whatsapp} إرسال إشعارات واتساب</div>
        <button class="btn btn-success btn-sm" id="bulkNotifyBtn">${icons.whatsapp} إرسال للولياء</button>
      </div>
      <div class="field__hint" style="margin-top:8px;">إرسال إشعار حضور لولياء طلاب هذه المجموعة دفعة واحدة</div>
    </div>

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
    tempMakeupStudents = [];
    render();
  });

  document.getElementById("makeupBtn").addEventListener("click", () => openMakeupModal(group));

  document.getElementById("closeSessionBtn").addEventListener("click", () => onCloseSession(group));
  document.getElementById("bulkNotifyBtn").addEventListener("click", () => onBulkNotify(group));

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

/** يرسل إشعارات واتساب جماعية لولياء طلاب المجموعة */
async function onBulkNotify(group) {
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

  // فتح أول رسالة
  const result = openWhatsAppBulk(notifications);
  if (result) {
    toast(`تم فتح واتساب لإرسال ${result.total} إشعار (أول إشعار: ${result.first})`, "success");
  }
}
async function onCloseSession(group) {
  const ok = await confirmDialog({
    title: "قفل الحصة",
    body: `هل أنت متأكد من قفل حصة "<strong>${escapeHTML(group.name)}</strong>"؟`,
    confirmText: "قفل الحصة",
    tone: "success",
  });
  if (!ok) return;

  closeSession(selectedGroupId, selectedDate, getSession()?.username || "unknown");
  toast("تم قفل الحصة بنجاح", "success");

  tempMakeupStudents = [];

  const next = nextReadySession(selectedDate, selectedGroupId);
  if (next) {
    const openNext = await confirmDialog({
      title: "حصة تانية جاهزة دلوقتى",
      body: `حصة "<strong>${escapeHTML(next.group.name)}</strong>" (${formatTimeAr(next.group.time)}) جاهزة تُفتح دلوقتى. تحب تفتحها على طول؟`,
      confirmText: "فتح الحصة التالية",
      tone: "success",
    });
    if (openNext) {
      selectedGroupId = next.group.id;
      currentIndex = 0;
      logSessionOpen(selectedGroupId, selectedDate, getSession()?.username || "unknown");
      render();
      return;
    }
  }

  selectedGroupId = null;
  render();
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
    <span class="pager__label">${currentIndex + 1} من ${roster.length}${tempMakeupStudents.length ? ` (${tempMakeupStudents.length} تعويض)` : ""}</span>
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
  const rosterIds = new Set(roster.map((s) => s.id));
  const attendance = getAttendance().filter((a) => a.date === selectedDate && a.category === "attendance" && rosterIds.has(a.studentId));
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
  const isMakeup = tempMakeupStudents.some((s) => s.id === student.id);

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
            ${isMakeup ? `<span class="badge badge-primary" style="margin-right:8px;">${icons.users} تعويض</span>` : ""}
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

      ${canPerformSensitiveAction(getSession()) ? `
        <div class="divider"></div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn btn-success btn-sm" id="depositBtn">${icons.wallet} إيداع في المحفظة</button>
        </div>
      ` : ""}
    </div>
  `;

  zone.querySelectorAll(".statusBtn").forEach((btn) =>
    btn.addEventListener("click", () => onStatusClick(student.id, btn.dataset.status, roster))
  );
  zone.querySelectorAll(".actionBtn").forEach((btn) =>
    btn.addEventListener("click", () => onActionClick(student.id, btn.dataset.status, roster))
  );

  if (canPerformSensitiveAction(getSession())) {
    const depositBtnEl = document.getElementById("depositBtn");
    if (depositBtnEl) depositBtnEl.addEventListener("click", () => openDepositDialog(student.id));
  }
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

  if (tempMakeupStudents.some((s) => s.id === studentId)) {
    options.sessionGroupId = selectedGroupId;
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

  // إرسال إشعار واتساب تلقائي لولي الأمر (للحضور فقط)
  if (status.presence === "present" && status.payment) {
    const notification = sendAttendanceNotification(studentId, statusId, selectedDate, result.financeInfo);
    if (notification) {
      openWhatsApp(notification.phone, notification.message);
      toast(`تم إرسال إشعار لولي أمر ${notification.studentName}`, "success");
    }
  }

  // الانتقال التلقائى للطالب التالى (لو موجود) لتسريع تسجيل باقى الفصل
  if (currentIndex < roster.length - 1) currentIndex++;

  renderStats(roster);
  renderPager(roster);
  renderStudentZone(roster);
}

async function openDepositDialog(studentId) {
  const student = getStudents().find((s) => s.id === studentId);
  if (!student) return;

  const group = findGroup(getGroups(), student.groupId);
  const currentWallet = Number(student.walletBalance || 0);
  const currentDebt = Number(student.lateBalance || 0);

  const amount = await formModal({
    title: `إيداع — ${student.name}`,
    fields: [
      {
        name: "amount",
        label: "المبلغ (ج.م)",
        type: "number",
        placeholder: "0",
        min: 1,
        required: true,
        hint: currentDebt > 0
          ? `المتأخرات: ${formatMoney(currentDebt)} — أول حاجة هتتغطى من المتأخرات، والباقي يروح للمحفظة`
          : `الرصيد الحالي: ${formatMoney(currentWallet)}`,
      },
      { name: "note", label: "ملاحظة (اختياري)", placeholder: "إيداع ولي أمر" },
    ],
    submitText: "إيداع",
  });

  if (!amount) return;

  const result = addWalletDeposit(studentId, amount.amount, amount.note || "إيداع ولي أمر");
  if (!result) { toast("فشلت عملية الإيداع", "error"); return; }

  let msg = `تم إيداع ${formatMoney(amount.amount)}`;
  if (result.debtCovered > 0) msg += ` — تغطية متأخرات: ${formatMoney(result.debtCovered)}`;
  if (result.walletDeposit > 0) msg += ` — رصيد جديد: ${formatMoney(result.newWalletBalance)}`;
  toast(msg, "success");

  renderStats(getRoster());
  renderStudentZone(getRoster());
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

  // إشعار مكافأة
  if (status.rewardAmount > 0) {
    sendRewardNotification(studentId, status.rewardAmount, status.name);
    toast(`مكافأة ${formatMoney(status.rewardAmount)} تمت إضافة المحفظة`, "success");
  }

  renderStats(roster);
  renderStudentZone(roster);
}
