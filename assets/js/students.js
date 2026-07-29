// =========================================================
// Students — إدارة بيانات الطلاب (جدول + بحث + فلترة + CRUD)
// =========================================================

import { initPage } from "./app.js";
import { icons } from "./icons.js";
import { getStudents, saveStudents, getGrades, getGroups, getStudentStatuses, getSession } from "./storage.js";
import { escapeHTML, initials, formatMoney, debounce } from "./helpers.js";
import { toast, confirmDialog, emptyStateHTML, skeletonRows } from "./ui.js";
import { gradeName, groupName, groupsForGrade, statusesByCategory } from "./lookups.js";
import { canPerformAction } from "./permissions.js";
import { recordActionStatus } from "./attendance-service.js";
import { openCollectionDialog } from "./collection-dialog.js";
import { exportTableToExcel, printTableAsPDF } from "./export-utils.js";

const content = await initPage("students");
let searchTerm = "";
let gradeFilter = "";
let groupFilter = "";
let statusFilter = "";
let currentPage = 0;
const PAGE_SIZE = 25;

if (content) render();

function render() {
  content.innerHTML = `
    <div class="page__header">
      <div>
        <div class="page__title">الطلاب</div>
        <div class="page__subtitle">إدارة كاملة لبيانات الطلاب المسجلين</div>
      </div>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <button class="btn btn-outline btn-sm" id="exportExcelBtn">📊 تصدير Excel</button>
        <button class="btn btn-outline btn-sm" id="exportPdfBtn">📄 طباعة / PDF</button>
        <button class="btn btn-outline btn-sm" id="bulkImportStudentsBtn" style="color:var(--success);border-color:var(--success);">🚀 إدخال سريع</button>
        <a class="btn btn-primary" id="addStudentBtn" href="student-form.html">${icons.plus} إضافة طالب</a>
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
        <select class="select" id="statusFilterSelect" style="max-width:180px;">
          <option value="">كل الحالات</option>
          <option value="active">نشط</option>
          <option value="paused">متوقف</option>
          <option value="expelled">مطرود</option>
        </select>
      </div>
      <div id="studentsTable">${skeletonRows(5)}</div>
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
  document.getElementById("statusFilterSelect").addEventListener("change", (e) => {
    statusFilter = e.target.value;
    currentPage = 0;
    renderTable();
  });

  renderTable();

  document.getElementById("exportExcelBtn")?.addEventListener("click", () => exportTableToExcel("#studentsTable table", `الطلاب`));
  document.getElementById("exportPdfBtn")?.addEventListener("click", () => printTableAsPDF("#studentsTable table", `الطلاب`));
  document.getElementById("bulkImportStudentsBtn")?.addEventListener("click", () => import("./bulk-import.js").then((m) => m.openBulkImportModal()));
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
  const box = document.getElementById("studentsTable");
  const grades = getGrades();
  const groups = getGroups();
  let students = getStudents().filter((s) => !s.isGuest);

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    students = students.filter((s) => s.name.toLowerCase().includes(term) || (s.code || "").toLowerCase().includes(term));
  }
  if (gradeFilter) students = students.filter((s) => s.gradeId === gradeFilter);
  if (groupFilter) students = students.filter((s) => s.groupId === groupFilter);
  if (statusFilter) students = students.filter((s) => s.status === statusFilter);

  if (!students.length) {
    box.innerHTML = emptyStateHTML({ icon: icons.users, title: "لا يوجد طلاب مطابقين", text: "جرب تعديل كلمة البحث أو الفلاتر." });
    return;
  }

  const totalPages = Math.max(1, Math.ceil(students.length / PAGE_SIZE));
  if (currentPage >= totalPages) currentPage = totalPages - 1;
  const pageStudents = students.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  box.innerHTML = `
    <div class="field__hint" style="margin-bottom:10px;">${students.length} طالب إجمالًا</div>
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>الكود</th>
            <th>الطالب</th>
            <th>السنة الدراسية</th>
            <th>المجموعة</th>
            <th>المتأخرات</th>
            <th>المحفظة</th>
            <th>الخصم</th>
            <th>الحالة</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${pageStudents
            .map(
              (s) => `
            <tr>
              <td><span class="code-pill">${escapeHTML(s.code || "-")}</span></td>
              <td>
                <a class="cell-user" href="student.html?id=${s.id}">
                  <div class="avatar-sm">${initials(s.name)}</div>
                  <div class="cell-user__name">${escapeHTML(s.name)}</div>
                </a>
              </td>
              <td class="text-muted">${escapeHTML(gradeName(grades, s.gradeId))}</td>
              <td class="text-muted">${escapeHTML(groupName(groups, s.groupId))}</td>
              <td>${s.lateBalance > 0 ? `<span class="badge badge-warning" style="cursor:pointer;" data-collect-id="${s.id}">${formatMoney(s.lateBalance)} 💰</span>` : `<span class="badge badge-neutral">لا يوجد</span>`}</td>
              <td>${(s.walletBalance || 0) > 0 ? `<span class="badge badge-success">${icons.wallet} ${formatMoney(s.walletBalance)}</span>` : `<span class="text-muted">-</span>`}</td>
              <td>${s.discount > 0 ? `<span class="badge badge-info">${formatMoney(s.discount)}</span>` : `<span class="text-muted">-</span>`}</td>
              <td><span class="badge ${s.status === "active" ? "badge-success" : s.status === "paused" ? "badge-warning" : "badge-danger"}">${s.status === "active" ? "نشط" : s.status === "paused" ? "متوقف" : s.status === "expelled" ? "مطرود" : s.status || "—"}</span></td>
              <td>
                <div class="row-actions">
                  <a class="btn btn-outline btn-icon" href="student-form.html?id=${s.id}" title="تعديل">${icons.edit}</a>
                  ${canPerformAction(getSession(), "students", "exceptional_action") ? `<button class="btn btn-outline btn-icon actionStudentBtn" data-id="${s.id}" data-name="${escapeHTML(s.name)}" title="إجراء استثنائي" style="border-color:var(--warning);color:var(--warning);">${icons.alert}</button>` : ""}
                  ${canPerformAction(getSession(), "students", "delete") ? `<button class="btn btn-outline btn-icon deleteStudentBtn" data-id="${s.id}" title="حذف">${icons.trash}</button>` : ""}
                </div>
              </td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
    ${
      totalPages > 1
        ? `
      <div class="pager">
        <button type="button" class="btn btn-outline btn-icon" id="studentsPagerPrev" ${currentPage <= 0 ? "disabled" : ""} title="السابق">${icons.arrowLeft}</button>
        <span class="pager__label">صفحة ${currentPage + 1} من ${totalPages}</span>
        <button type="button" class="btn btn-outline btn-icon" id="studentsPagerNext" ${currentPage >= totalPages - 1 ? "disabled" : ""} title="التالى" style="transform:scaleX(-1);">${icons.arrowLeft}</button>
      </div>`
        : ""
    }
  `;

  document.getElementById("studentsPagerPrev")?.addEventListener("click", () => {
    currentPage--;
    renderTable();
  });
  document.getElementById("studentsPagerNext")?.addEventListener("click", () => {
    currentPage++;
    renderTable();
  });

  box.querySelectorAll(".deleteStudentBtn").forEach((btn) => btn.addEventListener("click", () => deleteStudent(btn.dataset.id)));
  box.querySelectorAll(".actionStudentBtn").forEach((btn) => btn.addEventListener("click", () => openActionModal(btn.dataset.id, btn.dataset.name)));
  box.querySelectorAll("[data-collect-id]").forEach((el) => el.addEventListener("click", () => openCollectionDialog(el.dataset.collectId, { onClose: renderTable })));
}

async function deleteStudent(id) {
  const students = getStudents();
  const s = students.find((x) => x.id === id);

  const ok = await confirmDialog({
    title: "حذف الطالب",
    body: `هل أنت متأكد من حذف <strong>${escapeHTML(s?.name || "")}</strong>؟ لن يتم حذف سجلات الحضور والمدفوعات القديمة الخاصة به.`,
    confirmText: "حذف نهائى",
    tone: "danger",
  });
  if (!ok) return;

  saveStudents(students.filter((x) => x.id !== id));
  Sounds.delete();
  toast("تم حذف الطالب", "success");
  renderTable();
}

/* ── نافذة الإجراء الاستثنائى ── */
function openActionModal(studentId, studentName) {
  const statuses = getStudentStatuses();
  const actionStatuses = statusesByCategory(statuses, "action");
  if (!actionStatuses.length) { toast("لا توجد إجراءات استثنائية معرّفة", "warning"); return; }

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__head">
        <div class="modal__title" style="color:var(--warning);">${icons.alert} إجراء استثنائى — ${escapeHTML(studentName)}</div>
      </div>
      <div class="modal__body">
        <div class="field">
          <label class="field__label">نوع الإجراء</label>
          <select class="select" id="actionTypeSelect">
            <option value="">— اختر نوع الإجراء —</option>
            ${actionStatuses.map((s) => `<option value="${s.id}">${escapeHTML(s.name)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label class="field__label">سبب / ملاحظة <span style="color:var(--danger);">*</span></label>
          <textarea class="input" id="actionNoteInput" rows="3" placeholder="اكتب سبب الإجراء..." required style="resize:vertical;"></textarea>
        </div>
      </div>
      <div class="modal__actions">
        <button type="button" class="btn btn-outline" id="actionCancel">إلغاء</button>
        <button type="button" class="btn btn-danger" id="actionConfirm">${icons.alert} تأكيد وتسجيل</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.classList.add("is-open");

  const close = () => { overlay.classList.remove("is-open"); overlay.remove(); };
  overlay.querySelector("#actionCancel").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  overlay.querySelector("#actionConfirm").addEventListener("click", () => {
    const statusId = overlay.querySelector("#actionTypeSelect").value;
    const note = overlay.querySelector("#actionNoteInput").value.trim();

    if (!statusId) { toast("اختر نوع الإجراء أولاً", "warning"); return; }
    if (!note) { toast("اكتب سبب الإجراء", "warning"); return; }

    const result = recordActionStatus(studentId, statusId, undefined, note);
    if (!result) { toast("فشلت العملية", "error"); return; }
    if (result.locked) { toast(`الطالب مقفول: ${result.reason}`, "warning"); close(); return; }

    toast(`تم تسجيل: ${result.status.name} — ${studentName}`, result.status.tone === "danger" ? "danger" : "success");
    close();
    renderTable();
  });
}
