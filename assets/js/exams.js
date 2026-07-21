// =========================================================
// Exams — إدارة الامتحانات وإدخال الدرجات
// =========================================================

import { initPage } from "./app.js";
import { icons } from "./icons.js";
import { getExams, saveExams, getGroups, getStudents, getSettings } from "./storage.js";
import { escapeHTML, initials, formatDateAr, generateId, todayISO } from "./helpers.js";
import { toast, formModal, emptyStateHTML, whatsappPreviewDialog } from "./ui.js";
import { groupName } from "./lookups.js";
import { openWhatsApp } from "./whatsapp.js";

const content = await initPage("exams");
let selectedExamId = null;

if (content) render();

function render() {
  content.innerHTML = `
    <div class="page__header">
      <div>
        <div class="page__title">الامتحانات</div>
        <div class="page__subtitle">إنشاء امتحانات، إدخال الدرجات، ومتابعة النتائج</div>
      </div>
      <button class="btn btn-primary" id="addExamBtn">${icons.plus} امتحان جديد</button>
    </div>

    <div class="grid-2">
      <div class="card card-pad">
        <div class="card__head"><div class="card__title">قائمة الامتحانات</div></div>
        <div id="examsList"></div>
      </div>
      <div class="card card-pad">
        <div class="card__head"><div class="card__title" id="gradesTitle">درجات الامتحان</div></div>
        <div id="gradesPanel"></div>
      </div>
    </div>
  `;

  document.getElementById("addExamBtn").addEventListener("click", openExamForm);
  renderExamsList();
  renderGradesPanel();
}

function renderExamsList() {
  const box = document.getElementById("examsList");
  const exams = getExams().sort((a, b) => (a.date < b.date ? 1 : -1));
  const groups = getGroups();

  if (!exams.length) {
    box.innerHTML = emptyStateHTML({ icon: icons.chart, title: "لا توجد امتحانات بعد", text: "أنشئ أول امتحان لتبدأ بتسجيل الدرجات." });
    return;
  }

  box.innerHTML = exams
    .map(
      (e) => `
    <div class="flex-between examRow" data-id="${e.id}" style="padding:13px 6px; border-bottom:1px solid var(--border-2); cursor:pointer; ${selectedExamId === e.id ? "background:var(--primary-light); border-radius:10px;" : ""}">
      <div>
        <div style="font-weight:700;">${escapeHTML(e.title)}</div>
        <div class="text-muted" style="font-size:12.5px; margin-top:2px;">${escapeHTML(groupName(groups, e.groupId))} · ${formatDateAr(e.date)}</div>
      </div>
      <span class="badge badge-primary">${e.results.length} نتيجة</span>
    </div>`
    )
    .join("");

  box.querySelectorAll(".examRow").forEach((row) =>
    row.addEventListener("click", () => {
      selectedExamId = row.dataset.id;
      renderExamsList();
      renderGradesPanel();
    })
  );
}

function renderGradesPanel() {
  const panel = document.getElementById("gradesPanel");
  const title = document.getElementById("gradesTitle");
  const exams = getExams();
  const exam = exams.find((e) => e.id === selectedExamId);

  if (!exam) {
    title.textContent = "درجات الامتحان";
    panel.innerHTML = emptyStateHTML({ icon: icons.clipboard, title: "اختر امتحانًا", text: "اختر امتحانًا من القائمة لعرض أو إدخال الدرجات." });
    return;
  }

  title.textContent = `درجات: ${exam.title}`;
  const groupStudents = getStudents().filter((s) => s.groupId === exam.groupId);

  if (!groupStudents.length) {
    panel.innerHTML = emptyStateHTML({ title: "لا يوجد طلاب فى هذه المجموعة" });
    return;
  }

  panel.innerHTML = `
    <form id="gradesForm">
      <div class="table-wrap" style="margin-bottom:16px;">
        <table class="table">
          <thead><tr><th>الطالب</th><th>الدرجة (من ${exam.maxScore})</th><th></th></tr></thead>
          <tbody>
            ${groupStudents
              .map((s) => {
                const existing = exam.results.find((r) => r.studentId === s.id);
                return `
                <tr>
                  <td>
                    <div class="cell-user">
                      <div class="avatar-sm">${initials(s.name)}</div>
                      <div class="cell-user__name">${escapeHTML(s.name)}</div>
                    </div>
                  </td>
                  <td><input class="input" style="max-width:120px;" type="number" min="0" max="${exam.maxScore}" name="${s.id}" value="${existing ? existing.score : ""}" placeholder="-"></td>
                  <td>
                    ${
                      existing
                        ? `<button type="button" class="btn btn-outline btn-icon sendWaBtn" data-student-id="${s.id}" title="إرسال النتيجة لولى الأمر واتساب">${icons.whatsapp}</button>`
                        : ""
                    }
                  </td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>
      <button class="btn btn-primary btn-block" type="submit">${icons.check} حفظ الدرجات</button>
    </form>
  `;

  panel.querySelectorAll(".sendWaBtn").forEach((btn) =>
    btn.addEventListener("click", () => sendExamResultWhatsApp(btn.dataset.studentId, exam))
  );

  document.getElementById("gradesForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const results = [];
    for (const [studentId, score] of formData.entries()) {
      if (score !== "") results.push({ studentId, score: Number(score) });
    }
    exam.results = results;
    saveExams(exams);
    toast("تم حفظ درجات الامتحان بنجاح", "success");
    renderExamsList();
  });
}

async function sendExamResultWhatsApp(studentId, exam) {
  const student = getStudents().find((s) => s.id === studentId);
  const result = exam.results.find((r) => r.studentId === studentId);
  if (!student || !result) return;

  const settings = getSettings();
  const centerName = settings.centerName || "السنتر";
  const defaultMessage = `عزيزى ولى أمر الطالب/ة ${student.name}،

نود إعلامكم بنتيجة "${exam.title}":
الدرجة: ${result.score} من ${exam.maxScore}

مع تحيات ${centerName}`;

  const message = await whatsappPreviewDialog({
    title: "إرسال نتيجة الامتحان",
    recipientLabel: `ولى أمر ${student.name} (${student.parentPhone})`,
    defaultMessage,
  });
  if (!message) return;

  openWhatsApp(student.parentPhone, message);
}

async function openExamForm() {
  const groups = getGroups();
  if (!groups.length) {
    toast("أضف مجموعة واحدة على الأقل من الإعدادات أولًا", "warning");
    return;
  }
  const bodyHTML = `
    <div class="field">
      <label class="field__label">اسم الامتحان</label>
      <input class="input" name="title" required placeholder="مثال: امتحان الشهر الأول">
    </div>
    <div class="form-grid">
      <div class="field">
        <label class="field__label">المجموعة</label>
        <select class="select" name="groupId" required>
          ${groups.map((g) => `<option value="${g.id}">${escapeHTML(g.name)} (${g.code})</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label class="field__label">الدرجة النهائية</label>
        <input class="input" type="number" name="maxScore" min="1" value="50" required>
      </div>
    </div>
    <div class="field">
      <label class="field__label">تاريخ الامتحان</label>
      <input class="input" type="date" name="date" value="${todayISO()}" required>
    </div>
  `;

  const data = await formModal({ title: "إنشاء امتحان جديد", bodyHTML, submitText: "إنشاء الامتحان", wide: true });
  if (!data) return;

  const exams = getExams();
  exams.push({ id: generateId("EXM"), title: data.title, date: data.date, groupId: data.groupId, maxScore: Number(data.maxScore), results: [] });
  saveExams(exams);
  selectedExamId = exams[exams.length - 1].id;
  toast("تم إنشاء الامتحان بنجاح", "success");
  renderExamsList();
  renderGradesPanel();
}
