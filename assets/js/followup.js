// =========================================================
// Followup — متابعة شاملة لكل حالات الطالب (حضور / دفع / إجراءات)
// =========================================================

import { initPage } from "./app.js";
import { icons } from "./icons.js";
import { getStudents, getAttendance, getGrades, getGroups, getStudentStatuses, getExams, getExtraCharges } from "./storage.js";
import { escapeHTML, initials, formatMoney, formatDateAr, debounce } from "./helpers.js";
import { emptyStateHTML, whatsappPreviewDialog } from "./ui.js";
import { gradeName, groupName, groupsForGrade } from "./lookups.js";
import { openWhatsApp } from "./whatsapp.js";
import { buildMonthlyFollowupMessage } from "./reports.js";

const content = await initPage("followup");
let searchTerm = "";
let gradeFilter = "";
let groupFilter = "";
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

  renderTable();
}

function fillFilterOptions() {
  const grades = getGrades().slice().sort((a, b) => a.order - b.order);
  const select = document.getElementById("gradeFilterSelect");
  grades.forEach((g) => select.insertAdjacentHTML("beforeend", `<option value="${g.id}">${escapeHTML(g.name)}</option>`));
  updateGroupFilterOptions();
}

function updateGroupFilterOptions() {
  const groups = getGroups();
  const select = document.getElementById("groupFilterSelect");
  const relevant = gradeFilter ? groupsForGrade(groups, gradeFilter) : groups;
  select.innerHTML = `<option value="">كل المجموعات</option>` + relevant.map((g) => `<option value="${g.id}">${escapeHTML(g.name)} (${g.code})</option>`).join("");
}

function renderTable() {
  const box = document.getElementById("followupTable");
  const attendance = getAttendance();
  const statuses = getStudentStatuses();
  const grades = getGrades();
  const groups = getGroups();
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

  // ملحوظة: حضر ودفع / حضر بدون دفع / غياب بإذن مش ظاهرين كأعمدة فى الجدول (بناءً على طلب صريح)
  // لكن لسه بيتحسبوا هنا لأنهم موجودين فى رسالة تقرير المتابعة المُرسلة لولى الأمر
  const rows = pageStudents.map((s) => {
    const own = attendance.filter((a) => a.studentId === s.id).sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1));

    const countByStatus = (statusId) => own.filter((a) => a.statusId === statusId).length;
    const lastOfCategory = (category) => own.find((a) => a.category === category);

    const lastAttendance = lastOfCategory("attendance");
    const callCount = countByStatus("ST-CALL");
    const expelCount = countByStatus("ST-EXPEL");

    const examScores = getExams()
      .flatMap((e) => e.results.filter((r) => r.studentId === s.id).map((r) => (r.score / e.maxScore) * 100))
      .filter((v) => !isNaN(v));
    const examAverage = examScores.length ? Math.round(examScores.reduce((sum, v) => sum + v, 0) / examScores.length) : null;

    return {
      s,
      absentCount: countByStatus("ST-ABSENT"),
      callCount,
      expelCount,
      lastAttendance,
      examAverage,
    };
  });

  box.innerHTML = `
    <div class="field__hint" style="margin-bottom:10px;">${students.length} طالب إجمالًا</div>
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>الطالب</th>
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
              return `
            <tr>
              <td>
                <a class="cell-user" href="student.html?id=${r.s.id}">
                  <div class="avatar-sm">${initials(r.s.name)}</div>
                  <div>
                    <div class="cell-user__name">${escapeHTML(r.s.name)}</div>
                    <div class="cell-user__meta">${escapeHTML(gradeName(grades, r.s.gradeId))} · ${escapeHTML(groupName(groups, r.s.groupId))}</div>
                  </div>
                </a>
              </td>
              <td><span class="badge badge-danger">${r.absentCount}</span></td>
              <td>${r.callCount > 0 ? `<span class="badge badge-warning">${r.callCount}</span>` : `<span class="badge badge-neutral">0</span>`}</td>
              <td>${r.expelCount > 0 ? `<span class="badge badge-danger">${r.expelCount}</span>` : `<span class="badge badge-neutral">0</span>`}</td>
              <td>${r.examAverage != null ? `<span class="badge ${r.examAverage >= 50 ? "badge-success" : "badge-danger"}">${r.examAverage}%</span>` : `<span class="text-muted">-</span>`}</td>
              <td class="text-muted">
                ${lastStatus ? `<span class="badge badge-${lastStatus.tone}"><span class="badge-dot"></span>${escapeHTML(lastStatus.name)}</span> — ${formatDateAr(r.lastAttendance.date)}` : "-"}
              </td>
              <td>${r.s.lateBalance > 0 ? `<span class="badge badge-warning">${formatMoney(r.s.lateBalance)}</span>` : `<span class="badge badge-neutral">لا يوجد</span>`}</td>
              <td><button class="btn btn-outline btn-icon sendFollowupWaBtn" data-id="${r.s.id}" title="إرسال تقرير متابعة شهرية واتساب">${icons.whatsapp}</button></td>
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
