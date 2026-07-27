// =========================================================
// Followup — متابعة شاملة لكل حالات الطالب (حضور / دفع / إجراءات)
// =========================================================

import { initPage } from "./app.js";
import { icons } from "./icons.js";
import { getStudents, getAttendance, getGrades, getGroups, getStudentStatuses, getExams, getExtraCharges, getFollowupLogs, addFollowupLog, getLastFollowupLog, getSettings, getAcademicYears, getTerms, getAcademicMonths } from "./storage.js";
import { escapeHTML, initials, formatMoney, formatDateAr, debounce, todayISO } from "./helpers.js";
import { emptyStateHTML, whatsappPreviewDialog, formModal, toast, confirmDialog } from "./ui.js";
import { gradeName, groupName, groupsForGrade } from "./lookups.js";
import { openWhatsApp } from "./whatsapp.js";
import { buildMonthlyFollowupMessage } from "./reports.js";

const content = await initPage("followup");
let searchTerm = "";
let gradeFilter = "";
let groupFilter = "";
let termFilter = "";
let monthFilter = "";
let currentPage = 0;
const PAGE_SIZE = 25;

if (content) render();

function render() {
  content.innerHTML = `
    <div class="page__header">
      <div>
        <div class="page__title">متابعة الطلاب</div>
        <div class="page__subtitle">نظرة شاملة على كل حالات الحضور والدفع والإجراءات لكل طالب</div>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-outline btn-sm" id="exportExcelBtn">📊 تصدير Excel</button>
        <button class="btn btn-outline btn-sm" id="exportPdfBtn">📄 طباعة / PDF</button>
      </div>
    </div>

    <div class="card card-pad">
      <div class="table-toolbar">
        <div class="input-group" style="max-width:280px; flex:1;">
          <input class="input" id="searchInput" placeholder="ابحث بالاسم أو الكود...">
          <span class="input-icon">${icons.search}</span>
        </div>
        <select class="select" id="gradeFilterSelect" style="max-width:200px;">
          <option value="">كل السنوات الدراسية</option>
        </select>
        <select class="select" id="groupFilterSelect" style="max-width:200px;">
          <option value="">كل المجموعات</option>
        </select>
        <select class="select" id="termFilterSelect" style="max-width:200px;">
          <option value="">كل الأترام</option>
        </select>
        <select class="select" id="monthFilterSelect" style="max-width:200px;">
          <option value="">كل الشهور</option>
        </select>
      </div>
      <div id="followupTable"></div>
    </div>
  `;

  fillFilterOptions();

  document.getElementById("searchInput").addEventListener(
    "input",
    debounce((e) => {
      searchTerm = e.target.value.trim();
      currentPage = 0;
      renderTable();
    }, 200)
  );
  document.getElementById("gradeFilterSelect").addEventListener("change", (e) => {
    gradeFilter = e.target.value;
    updateGroupFilterOptions();
    groupFilter = "";
    currentPage = 0;
    renderTable();
  });
  document.getElementById("groupFilterSelect").addEventListener("change", (e) => {
    groupFilter = e.target.value;
    currentPage = 0;
    renderTable();
  });
  document.getElementById("termFilterSelect").addEventListener("change", (e) => {
    termFilter = e.target.value;
    monthFilter = "";
    currentPage = 0;
    updateMonthFilterOptions();
    renderTable();
  });
  document.getElementById("monthFilterSelect").addEventListener("change", (e) => {
    monthFilter = e.target.value;
    currentPage = 0;
    renderTable();
  });

  renderTable();

  // أزرار التصدير
  document.getElementById("exportExcelBtn")?.addEventListener("click", exportToExcel);
  document.getElementById("exportPdfBtn")?.addEventListener("click", exportToPdf);
}

function fillFilterOptions() {
  const grades = getGrades().slice().sort((a, b) => a.order - b.order);
  const select = document.getElementById("gradeFilterSelect");
  grades.forEach((g) => select.insertAdjacentHTML("beforeend", `<option value="${g.id}">${escapeHTML(g.name)}</option>`));

  // ملء قائمة الأترام
  const years = getAcademicYears();
  const allTerms = getTerms();
  const termSelect = document.getElementById("termFilterSelect");
  allTerms.forEach((t) => {
    const year = years.find((y) => y.id === t.yearId);
    termSelect.insertAdjacentHTML("beforeend", `<option value="${t.id}">${escapeHTML(t.name)} (${escapeHTML(year?.name || "")})</option>`);
  });

  updateGroupFilterOptions();
  updateMonthFilterOptions();
}

function updateGroupFilterOptions() {
  const groups = getGroups();
  const select = document.getElementById("groupFilterSelect");
  const relevant = gradeFilter ? groupsForGrade(groups, gradeFilter) : groups;
  select.innerHTML = `<option value="">كل المجموعات</option>` + relevant.map((g) => `<option value="${g.id}">${escapeHTML(g.name)} (${g.code})</option>`).join("");
}

function updateMonthFilterOptions() {
  const select = document.getElementById("monthFilterSelect");
  const allMonths = getAcademicMonths();
  const relevant = termFilter ? allMonths.filter((m) => m.termId === termFilter) : allMonths;
  select.innerHTML = `<option value="">كل الشهور</option>` + relevant.map((m) => `<option value="${m.id}">${escapeHTML(m.name)}</option>`).join("");
}

function renderTable() {
  const box = document.getElementById("followupTable");
  const attendance = getAttendance();
  const statuses = getStudentStatuses();
  const grades = getGrades();
  const groups = getGroups();
  const followupLogs = getFollowupLogs();
  let students = getStudents();

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    students = students.filter((s) => s.name.toLowerCase().includes(term) || (s.code || "").toLowerCase().includes(term));
  }
  if (gradeFilter) students = students.filter((s) => s.gradeId === gradeFilter);
  if (groupFilter) students = students.filter((s) => s.groupId === groupFilter);

  if (!students.length) {
    box.innerHTML = emptyStateHTML({ icon: icons.clipboard, title: "لا يوجد طلاب مطابقين" });
    return;
  }

  const totalPages = Math.max(1, Math.ceil(students.length / PAGE_SIZE));
  if (currentPage >= totalPages) currentPage = totalPages - 1;
  const pageStudents = students.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  const now = new Date();

  const rows = pageStudents.map((s) => {
    let own = attendance.filter((a) => a.studentId === s.id);
    if (termFilter) own = own.filter((a) => a.termId === termFilter);
    if (monthFilter) own = own.filter((a) => a.monthId === monthFilter);
    own = own.sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1));

    const countByStatus = (statusId) => own.filter((a) => a.statusId === statusId).length;
    const lastOfCategory = (category) => own.find((a) => a.category === category);

    const lastAttendance = lastOfCategory("attendance");
    const absentCount = countByStatus("ST-ABSENT");
    const callCount = countByStatus("ST-CALL");
    const expelCount = countByStatus("ST-EXPEL");

    const examScores = getExams()
      .flatMap((e) => e.results.filter((r) => r.studentId === s.id && !r.absent).map((r) => (r.score / e.maxScore) * 100))
      .filter((v) => !isNaN(v));
    const examAverage = examScores.length ? Math.round(examScores.reduce((sum, v) => sum + v, 0) / examScores.length) : null;

    // آخر ملاحظة متابعة
    const lastLog = getLastFollowupLog(s.id);
    const hasRecentLog = lastLog ? (now - new Date(lastLog.date)) / 86400000 <= 7 : false;

    // مؤشر الخطر المدمج
    const riskAbsent = Math.min(absentCount, 5); // 3 نقاط لكل غياب (حد أقصى 15)
    const riskFail = examAverage !== null && examAverage < 50 ? 2 : 0; // رسوب = 2 نقاط
    const riskLate = (s.lateBalance || 0) >= 200 ? 1 : 0; // متأخرات ضخمة = 1 نقطة
    const riskScore = riskAbsent + riskFail + riskLate;

    return {
      s,
      absentCount,
      callCount,
      expelCount,
      lastAttendance,
      examAverage,
      lastLog,
      hasRecentLog,
      riskScore,
    };
  }).sort((a, b) => b.riskScore - a.riskScore); // الأعلى خطرًا أولًا

  box.innerHTML = `
    <div class="field__hint" style="margin-bottom:10px;">${students.length} طالب إجمالًا</div>
    <div id="bulkActionsBar" style="display:none; margin-bottom:10px; padding:8px 12px; background:var(--primary-light); border-radius:8px; align-items:center; gap:10px;">
      <span id="selectedCount" style="font-weight:700; font-size:13px;"></span>
      <div style="flex:1;"></div>
      <button class="btn btn-sm btn-success" id="bulkSendFollowupBtn">${icons.whatsapp} إرسال التقارير للمحددين</button>
    </div>
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th style="width:36px;"><input type="checkbox" id="selectAllCb" style="width:16px;height:16px;cursor:pointer;"></th>
            <th>الطالب</th>
            <th>الخطر</th>
            <th>غياب بدون إذن</th>
            <th>استدعاءات</th>
            <th>طرد</th>
            <th>متوسط الامتحانات</th>
            <th>آخر حالة حضور</th>
            <th>المتأخرات</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((r) => {
              const lastStatus = r.lastAttendance ? statuses.find((st) => st.id === r.lastAttendance.statusId) : null;
              const recentDot = r.hasRecentLog ? `<span title="ملاحظة خلال أسبوع" style="display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--success); margin-right:4px; vertical-align:middle;"></span>` : "";
              const logTooltip = r.lastLog ? `آخر ملاحظة: ${formatDateAr(r.lastLog.date)} — ${escapeHTML(r.lastLog.text.slice(0, 60))}${r.lastLog.text.length > 60 ? "…" : ""}` : "لا توجد ملاحظات";
              const hasPhone = !!(r.s.parentPhone || r.s.phone);
              return `
            <tr>
              <td><input type="checkbox" class="studentCb" data-id="${r.s.id}" data-has-phone="${hasPhone}" style="width:16px;height:16px;cursor:pointer;"></td>
              <td>
                <a class="cell-user" href="student.html?id=${r.s.id}">
                  <div class="avatar-sm">${initials(r.s.name)}</div>
                  <div>
                    <div class="cell-user__name">${escapeHTML(r.s.name)}</div>
                    <div class="cell-user__meta">${escapeHTML(gradeName(grades, r.s.gradeId))} · ${escapeHTML(groupName(groups, r.s.groupId))}</div>
                  </div>
                </a>
              </td>
              <td>${r.riskScore > 0 ? `<span class="badge badge-${r.riskScore >= 5 ? "danger" : r.riskScore >= 3 ? "warning" : "info"}">${r.riskScore}</span>` : `<span class="badge badge-neutral">0</span>`}</td>
              <td><span class="badge badge-danger">${r.absentCount}</span></td>
              <td>${r.callCount > 0 ? `<span class="badge badge-warning">${r.callCount}</span>` : `<span class="badge badge-neutral">0</span>`}</td>
              <td>${r.expelCount > 0 ? `<span class="badge badge-danger">${r.expelCount}</span>` : `<span class="badge badge-neutral">0</span>`}</td>
              <td>${r.examAverage != null ? `<span class="badge ${r.examAverage >= 50 ? "badge-success" : "badge-danger"}">${r.examAverage}%</span>` : `<span class="text-muted">-</span>`}</td>
              <td class="text-muted">
                ${lastStatus ? `<span class="badge badge-${lastStatus.tone}"><span class="badge-dot"></span>${escapeHTML(lastStatus.name)}</span> — ${formatDateAr(r.lastAttendance.date)}` : "-"}
              </td>
              <td>${r.s.lateBalance > 0 ? `<span class="badge badge-warning">${formatMoney(r.s.lateBalance)}</span>` : `<span class="badge badge-neutral">لا يوجد</span>`}</td>
              <td style="white-space:nowrap;">
                <button class="btn btn-outline btn-icon addNoteBtn" data-id="${r.s.id}" title="${logTooltip}">${recentDot}${icons.edit}</button>
                <button class="btn btn-outline btn-icon sendFollowupWaBtn" data-id="${r.s.id}" title="إرسال تقرير متابعة شهرية واتساب">${icons.whatsapp}</button>
                ${r.s.parentPhone ? `<a class="btn btn-outline btn-icon" href="tel:${escapeHTML(r.s.parentPhone)}" title="اتصال بولي الأمر" style="text-decoration:none;">${icons.phone}</a>` : ""}
              </td>
            </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>
    ${
      totalPages > 1
        ? `
      <div class="pager">
        <button type="button" class="btn btn-outline btn-icon" id="followupPagerPrev" ${currentPage <= 0 ? "disabled" : ""} title="السابق">${icons.arrowLeft}</button>
        <span class="pager__label">صفحة ${currentPage + 1} من ${totalPages}</span>
        <button type="button" class="btn btn-outline btn-icon" id="followupPagerNext" ${currentPage >= totalPages - 1 ? "disabled" : ""} title="التالى" style="transform:scaleX(-1);">${icons.arrowLeft}</button>
      </div>`
        : ""
    }
  `;

  document.getElementById("followupPagerPrev")?.addEventListener("click", () => {
    currentPage--;
    renderTable();
  });
  document.getElementById("followupPagerNext")?.addEventListener("click", () => {
    currentPage++;
    renderTable();
  });

  box.querySelectorAll(".sendFollowupWaBtn").forEach((btn) =>
    btn.addEventListener("click", () => sendFollowupWhatsApp(btn.dataset.id))
  );
  box.querySelectorAll(".addNoteBtn").forEach((btn) =>
    btn.addEventListener("click", () => openAddNoteModal(btn.dataset.id))
  );

  // تحديد الكل
  const selectAllCb = document.getElementById("selectAllCb");
  if (selectAllCb) {
    selectAllCb.addEventListener("change", () => {
      box.querySelectorAll(".studentCb").forEach((cb) => (cb.checked = selectAllCb.checked));
      updateBulkBar();
    });
  }

  // تحديث شريط الإجراءات الجماعية عند تغيير أي checkbox
  box.querySelectorAll(".studentCb").forEach((cb) =>
    cb.addEventListener("change", updateBulkBar)
  );

  // إرسال جماعي
  document.getElementById("bulkSendFollowupBtn")?.addEventListener("click", bulkSendFollowup);
}

function updateBulkBar() {
  const box = document.getElementById("followupTable");
  const bar = document.getElementById("bulkActionsBar");
  const countEl = document.getElementById("selectedCount");
  if (!bar || !countEl) return;

  const checked = [...box.querySelectorAll(".studentCb:checked")];
  const withPhone = checked.filter((cb) => cb.dataset.hasPhone === "true");

  if (withPhone.length > 0) {
    bar.style.display = "flex";
    countEl.textContent = `${withPhone.length} طالب محدد` + (withPhone.length < checked.length ? ` (${checked.length - withPhone.length} بدون هاتف)` : "");
  } else {
    bar.style.display = "none";
  }
}

async function bulkSendFollowup() {
  const box = document.getElementById("followupTable");
  const checked = [...box.querySelectorAll(".studentCb:checked")].filter((cb) => cb.dataset.hasPhone === "true");
  if (!checked.length) {
    toast("لم يتم تحديد أي طالب له رقم هاتف", "warning");
    return;
  }

  const studentIds = checked.map((cb) => cb.dataset.id);
  const students = getStudents();
  const attendance = getAttendance();
  const exams = getExams();
  const extraCharges = getExtraCharges();
  const settings = getSettings();

  const messages = studentIds
    .map((id) => {
      const student = students.find((s) => s.id === id);
      if (!student) return null;
      const phone = student.parentPhone || student.phone;
      if (!phone) return null;

      const stuAttendance = attendance.filter((a) => a.studentId === id);
      const stuExams = exams
        .flatMap((e) => e.results.filter((r) => r.studentId === id).map((r) => ({ ...r, title: e.title, date: e.date, maxScore: e.maxScore })));
      const stuCharges = extraCharges.filter((c) => c.studentId === id);

      const message = buildMonthlyFollowupMessage({ student, attendance: stuAttendance, exams: stuExams, extraCharges: stuCharges });
      return { studentId: id, studentName: student.name, phone, message };
    })
    .filter(Boolean);

  if (!messages.length) {
    toast("لا توجد رسائل جاهزة للإرسال", "warning");
    return;
  }

  // فتح أول رسالة
  const first = messages[0];
  openWhatsApp(first.phone, first.message);

  if (messages.length === 1) {
    toast(`تم فتح واتساب لإرسال تقرير ${first.studentName}`, "success");
    return;
  }

  // باقى الطلاب: فتح تلقائى متتال
  let idx = 1;
  const ok = await confirmDialog({
    title: `إرسال ${messages.length} تقرير متابعة عبر واتساب`,
    body: `تم فتح أول رسالة (${first.studentName}).<br>هل تريد فتح باقى الرسائل تباعاً (كل 0.5 ثانية)؟<br><br><span class="text-muted" style="font-size:12px;">سيتم فتح ${messages.length - 1} رسالة إضافية. تأكد من فتح واتساب على جهازك.</span>`,
    confirmText: `فتح باقى الرسائل (${messages.length - 1})`,
    tone: "success",
  });
  if (!ok) return;

  const interval = setInterval(() => {
    if (idx >= messages.length) {
      clearInterval(interval);
      toast(`تم فتح جميع التقارير (${messages.length} طالب)`, "success");
      return;
    }
    const n = messages[idx];
    openWhatsApp(n.phone, n.message);
    idx++;
  }, 500);
}

/** يفتح نافذة إضافة ملاحظة متابعة لطالب */
async function openAddNoteModal(studentId) {
  const student = getStudents().find((s) => s.id === studentId);
  if (!student) return;

  const lastLog = getLastFollowupLog(studentId);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const currentTime = now.toTimeString().slice(0, 5);

  const bodyHTML = `
    ${lastLog ? `
      <div style="margin-bottom:14px; padding:10px; background:var(--bg); border-radius:var(--r-sm); font-size:13px;">
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

  addFollowupLog(studentId, result.text.trim(), {
    date: result.date,
    time: result.time,
  });

  toast("تم حفظ الملاحظة بنجاح", "success");
  renderTable();
}

/** يبنى ويرسل تقرير المتابعة الشهرية — نفس الصيغة الموحّدة المستخدمة فى صفحة تفاصيل الطالب بالظبط */
async function sendFollowupWhatsApp(studentId) {
  const student = getStudents().find((s) => s.id === studentId);
  if (!student) return;

  const attendance = getAttendance().filter((a) => a.studentId === studentId);
  const exams = getExams()
    .flatMap((e) => e.results.filter((r) => r.studentId === studentId).map((r) => ({ ...r, title: e.title, date: e.date, maxScore: e.maxScore })));
  const extraCharges = getExtraCharges().filter((c) => c.studentId === studentId);

  const defaultMessage = buildMonthlyFollowupMessage({ student, attendance, exams, extraCharges });

  const message = await whatsappPreviewDialog({
    title: "إرسال تقرير متابعة شهرية",
    recipientLabel: `ولى أمر ${student.name} (${student.parentPhone})`,
    defaultMessage,
  });
  if (!message) return;

  openWhatsApp(student.parentPhone, message);
}

/* ================= تصدير Excel ================= */
function exportToExcel() {
  const students = getFilteredStudents();
  if (!students.length) {
    toast("لا توجد بيانات للتصدير", "warning");
    return;
  }

  const attendance = getAttendance();
  const statuses = getStudentStatuses();
  const grades = getGrades();
  const groups = getGroups();
  const followupLogs = getFollowupLogs();

  const rows = buildRowData(students, attendance, statuses, grades, groups, followupLogs);

  const headers = ["الطالب", "الكود", "السنة الدراسية", "المجموعة", "غياب بدون إذن", "استدعاءات", "طرد", "متوسط الامتحانات", "المتأخرات", "مؤشر الخطر"];
  const excelRows = rows.map((r) => [
    r.s.name,
    r.s.code || "",
    gradeName(grades, r.s.gradeId),
    groupName(groups, r.s.groupId),
    r.absentCount,
    r.callCount,
    r.expelCount,
    r.examAverage != null ? r.examAverage + "%" : "-",
    r.s.lateBalance > 0 ? r.s.lateBalance : 0,
    r.riskScore,
  ]);

  const tableHTML = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" dir="rtl">
    <head><meta charset="UTF-8"></head>
    <body>
    <table border="1">
      <thead><tr>${headers.map((h) => `<th style="background:#2c3e50; color:white; font-weight:bold; padding:8px;">${h}</th>`).join("")}</tr></thead>
      <tbody>
        ${excelRows
          .map(
            (row, i) =>
              `<tr>${row.map((cell) => `<td style="padding:6px; ${i % 2 === 0 ? "background:#f9f9f9;" : ""}">${cell}</td>`).join("")}</tr>`
          )
          .join("")}
      </tbody>
    </table>
    </body></html>`;

  const blob = new Blob(["\ufeff" + tableHTML], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `متابعة_الطلاب_${todayISO()}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast("تم تحميل ملف Excel بنجاح", "success");
}

/* ================= طباعة / PDF ================= */
function exportToPdf() {
  const students = getFilteredStudents();
  if (!students.length) {
    toast("لا توجد بيانات للطباعة", "warning");
    return;
  }

  const attendance = getAttendance();
  const statuses = getStudentStatuses();
  const grades = getGrades();
  const groups = getGroups();
  const followupLogs = getFollowupLogs();
  const settings = getSettings();
  const centerName = settings.centerName || "السنتر";

  const rows = buildRowData(students, attendance, statuses, grades, groups, followupLogs);

  const printWindow = window.open("", "_blank");
  printWindow.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>تقرير المتابعة — ${centerName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Cairo',sans-serif; direction:rtl; padding:20px; color:#333; font-size:12px; }
    h1 { text-align:center; font-size:18px; margin-bottom:4px; }
    .subtitle { text-align:center; color:#888; font-size:12px; margin-bottom:16px; }
    .filters { text-align:center; font-size:11px; color:#666; margin-bottom:12px; padding:6px 12px; background:#f5f5f5; border-radius:6px; display:inline-block; }
    table { width:100%; border-collapse:collapse; margin-top:8px; }
    th { background:#2c3e50; color:white; padding:8px 6px; font-size:11px; text-align:center; }
    td { padding:6px; border-bottom:1px solid #eee; text-align:center; font-size:11px; }
    tr:nth-child(even) { background:#f9f9f9; }
    .badge { padding:2px 8px; border-radius:10px; font-size:10px; font-weight:600; display:inline-block; }
    .badge-danger { background:#fdecea; color:#e74c3c; }
    .badge-warning { background:#fef5e7; color:#f39c12; }
    .badge-success { background:#eafaf1; color:#27ae60; }
    .badge-info { background:#eaf2f8; color:#2980b9; }
    .badge-neutral { background:#f0f0f0; color:#888; }
    .footer { text-align:center; margin-top:20px; font-size:10px; color:#aaa; border-top:1px solid #eee; padding-top:8px; }
    @media print {
      body { padding:10px; }
      @page { margin:1cm; size:landscape; }
    }
  </style>
</head>
<body>
  <h1>تقرير متابعة الطلاب</h1>
  <div class="subtitle">${centerName} — ${todayISO()}</div>
  <div class="filters">${students.length} طالب${gradeFilter ? " • فلتر: سنة دراسية" : ""}${groupFilter ? " • مجموعة محددة" : ""}${searchTerm ? ` • بحث: "${searchTerm}"` : ""}</div>
  <table>
    <thead>
      <tr>
        <th>#</th><th>الطالب</th><th>الكود</th><th>المجموعة</th>
        <th>غياب</th><th>استدعاءات</th><th>طرد</th>
        <th>متوسط الامتحانات</th><th>المتأخرات</th><th>الخطر</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map(
          (r, i) => `
        <tr>
          <td>${i + 1}</td>
          <td style="text-align:right; font-weight:600;">${escapeHTML(r.s.name)}</td>
          <td>${escapeHTML(r.s.code || "-")}</td>
          <td>${escapeHTML(groupName(groups, r.s.groupId))}</td>
          <td>${r.absentCount > 0 ? `<span class="badge badge-danger">${r.absentCount}</span>` : `<span class="badge badge-neutral">0</span>`}</td>
          <td>${r.callCount > 0 ? `<span class="badge badge-warning">${r.callCount}</span>` : `<span class="badge badge-neutral">0</span>`}</td>
          <td>${r.expelCount > 0 ? `<span class="badge badge-danger">${r.expelCount}</span>` : `<span class="badge badge-neutral">0</span>`}</td>
          <td>${r.examAverage != null ? `<span class="badge ${r.examAverage >= 50 ? "badge-success" : "badge-danger"}">${r.examAverage}%</span>` : `<span class="badge badge-neutral">-</span>`}</td>
          <td>${r.s.lateBalance > 0 ? `<span class="badge badge-warning">${r.s.lateBalance} ج.م</span>` : `<span class="badge badge-neutral">0</span>`}</td>
          <td>${r.riskScore > 0 ? `<span class="badge ${r.riskScore >= 5 ? "badge-danger" : r.riskScore >= 3 ? "badge-warning" : "badge-info"}">${r.riskScore}</span>` : `<span class="badge badge-neutral">0</span>`}</td>
        </tr>`
        )
        .join("")}
    </tbody>
  </table>
  <div class="footer">تم إنشاء التقرير بتاريخ ${todayISO()} — ${centerName}</div>
</body>
</html>`);
  printWindow.document.close();
  setTimeout(() => {
    printWindow.print();
  }, 400);
  toast("تم فتح نافذة الطباعة (يمكنك حفظها كـ PDF)", "info");
}

/* ================= دوال مساعدة ================= */
function getFilteredStudents() {
  let students = getStudents();
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    students = students.filter((s) => s.name.toLowerCase().includes(term) || (s.code || "").toLowerCase().includes(term));
  }
  if (gradeFilter) students = students.filter((s) => s.gradeId === gradeFilter);
  if (groupFilter) students = students.filter((s) => s.groupId === groupFilter);
  return students;
}

function buildRowData(students, attendance, statuses, grades, groups, followupLogs) {
  const now = new Date();
  return students.map((s) => {
    const own = attendance.filter((a) => a.studentId === s.id);
    const countByStatus = (statusId) => own.filter((a) => a.statusId === statusId).length;
    const absentCount = countByStatus("ST-ABSENT");
    const callCount = countByStatus("ST-CALL");
    const expelCount = countByStatus("ST-EXPEL");

    const examScores = getExams()
      .flatMap((e) => e.results.filter((r) => r.studentId === s.id && !r.absent).map((r) => (r.score / e.maxScore) * 100))
      .filter((v) => !isNaN(v));
    const examAverage = examScores.length ? Math.round(examScores.reduce((sum, v) => sum + v, 0) / examScores.length) : null;

    const riskAbsent = Math.min(absentCount, 5);
    const riskFail = examAverage !== null && examAverage < 50 ? 2 : 0;
    const riskLate = (s.lateBalance || 0) >= 200 ? 1 : 0;

    return { s, absentCount, callCount, expelCount, examAverage, riskScore: riskAbsent + riskFail + riskLate };
  }).sort((a, b) => b.riskScore - a.riskScore);
}
