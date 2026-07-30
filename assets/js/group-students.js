import { initPage } from "./app.js";
import { icons } from "./icons.js";
import { getStudents, saveStudents, getGroups, getGrades } from "./storage.js";
import { escapeHTML, initials } from "./helpers.js";
import { toast, emptyStateHTML } from "./ui.js";
import { gradeName } from "./lookups.js";

const content = await initPage("students");
if (content) render();

function render() {
  const params = new URLSearchParams(window.location.search);
  const groupId = params.get("groupId");
  const groups = getGroups();
  const group = groups.find((g) => g.id === groupId);

  if (!group) {
    content.innerHTML = `<div class="page__header"><div><div class="page__title">المجموعة غير موجودة</div></div></div>`;
    return;
  }

  const grades = getGrades();
  let students = getStudents().filter((s) => s.groupId === groupId && !s.isGuest);

  const gradeNameStr = gradeName(grades, group.gradeId);

  content.innerHTML = `
    <a href="settings.html" class="btn btn-ghost btn-sm" style="margin-bottom:14px;">${icons.arrowLeft} العودة للإعدادات</a>

    <div class="page__header">
      <div>
        <div class="page__title">${escapeHTML(group.name)}</div>
        <div class="page__subtitle">${escapeHTML(group.code)} — ${escapeHTML(gradeNameStr)} — ${escapeHTML(group.days?.join("، ") || "")} ${group.time ? `— ${escapeHTML(group.time)}` : ""}</div>
      </div>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <a class="btn btn-primary" href="student-form.html?groupId=${groupId}">${icons.plus} إضافة طالب</a>
      </div>
    </div>

    <div class="card card-pad">
      <div class="field__hint" style="margin-bottom:10px;">${students.length} طالب</div>
      <div id="groupStudentsTable"></div>
    </div>
  `;

  renderTable(groupId);
}

function renderTable(groupId) {
  const box = document.getElementById("groupStudentsTable");
  const groups = getGroups();
  const group = groups.find((g) => g.id === groupId);
  let students = getStudents().filter((s) => s.groupId === groupId && !s.isGuest);

  if (!students.length) {
    box.innerHTML = emptyStateHTML({ icon: icons.users, title: "لا يوجد طلاب في هذه المجموعة", text: "يمكنك إضافة طالب جديد من الزر أعلاه." });
    return;
  }

  box.innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>الكود</th>
            <th>الطالب</th>
            <th>الهاتف</th>
            <th>الحالة</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${students
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
              <td class="text-muted" style="direction:ltr;">${escapeHTML(s.parentPhone || "-")}</td>
              <td><span class="badge ${s.status === "active" ? "badge-success" : s.status === "paused" ? "badge-warning" : "badge-danger"}">${s.status === "active" ? "نشط" : s.status === "paused" ? "متوقف" : s.status === "expelled" ? "مطرود" : s.status || "—"}</span></td>
              <td>
                <div class="row-actions">
                  <a class="btn btn-outline btn-icon" href="student-form.html?id=${s.id}" title="تعديل">${icons.edit}</a>
                  <button class="btn btn-outline btn-icon changeStatusBtn" data-id="${s.id}" data-name="${escapeHTML(s.name)}" data-status="${s.status || "active"}" title="تغيير الحالة">${icons.alert}</button>
                </div>
              </td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  box.querySelectorAll(".changeStatusBtn").forEach((btn) =>
    btn.addEventListener("click", () => changeStudentStatus(btn.dataset.id, btn.dataset.name, btn.dataset.status))
  );
}

async function changeStudentStatus(studentId, studentName, currentStatus) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__head">
        <div class="modal__title">تغيير حالة الطالب</div>
      </div>
      <div class="modal__body">
        <p style="margin-bottom:12px;">الطالب: <strong>${escapeHTML(studentName)}</strong></p>
        <div class="field">
          <label class="field__label">الحالة الجديدة</label>
          <select class="select" id="newStatusSelect">
            <option value="active" ${currentStatus === "active" ? "selected" : ""}>نشط</option>
            <option value="paused" ${currentStatus === "paused" ? "selected" : ""}>متوقف</option>
            <option value="expelled" ${currentStatus === "expelled" ? "selected" : ""}>مطرود</option>
          </select>
        </div>
      </div>
      <div class="modal__actions">
        <button type="button" class="btn btn-outline" id="statusCancel">إلغاء</button>
        <button type="button" class="btn btn-primary" id="statusConfirm">${icons.check} حفظ</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.classList.add("is-open");

  const close = () => { overlay.classList.remove("is-open"); overlay.remove(); };
  overlay.querySelector("#statusCancel").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  overlay.querySelector("#statusConfirm").addEventListener("click", () => {
    const newStatus = overlay.querySelector("#newStatusSelect").value;
    const students = getStudents();
    const student = students.find((s) => s.id === studentId);
    if (student) {
      student.status = newStatus;
      saveStudents(students);
      Sounds.save();
      toast("تم تحديث حالة الطالب", "success");
    }
    close();
    renderTable(student.groupId);
  });
}
