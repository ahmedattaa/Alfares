// =========================================================
// Student Form — فورمة مستقلة وكبيرة لإضافة/تعديل بيانات الطالب
// =========================================================

import { initPage } from "./app.js";
import { icons } from "./icons.js";
import { getStudents, saveStudents, getGrades, getGroups, flushPendingWrites, applyPendingCharges } from "./storage.js";
import { escapeHTML, todayISO, generateId } from "./helpers.js";
import { toast } from "./ui.js";
import { groupsForGrade, suggestStudentCode, findGroup } from "./lookups.js";

const content = await initPage("students");
if (content) render();

function render() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const preselectedGroupId = params.get("groupId");
  const students = getStudents();
  const editing = id ? students.find((s) => s.id === id) : null;
  const grades = getGrades().slice().sort((a, b) => a.order - b.order);
  const groups = getGroups();

  if (!grades.length) {
    content.innerHTML = `
      <div class="page__header"><div><div class="page__title">إضافة طالب</div></div></div>
      <div class="card card-pad">أضف سنة دراسية واحدة على الأقل من الإعدادات أولًا.</div>
    `;
    return;
  }

  const preselectedGroup = preselectedGroupId ? findGroup(groups, preselectedGroupId) : null;
  const defaultGradeId = editing?.gradeId || preselectedGroup?.gradeId || grades[0].id;
  const groupsForDefaultGrade = groupsForGrade(groups, defaultGradeId);
  const defaultGroupId = editing?.groupId || (preselectedGroupId && groupsForDefaultGrade.some((g) => g.id === preselectedGroupId) ? preselectedGroupId : groupsForDefaultGrade[0]?.id) || "";
  const defaultGroup = findGroup(groups, defaultGroupId);
  const suggestedCode = editing ? editing.code : suggestStudentCode(students, defaultGroup);

  content.innerHTML = `
    <a href="students.html" class="btn btn-ghost btn-sm" style="margin-bottom:14px;">${icons.arrowLeft} العودة للطلاب</a>

    <div class="page__header">
      <div>
        <div class="page__title">${editing ? "تعديل بيانات الطالب" : "إضافة طالب جديد"}</div>
        <div class="page__subtitle">${editing ? "عدّل البيانات المطلوبة واحفظ" : "املأ بيانات الطالب خطوة بخطوة"}</div>
      </div>
    </div>

    ${editing?.dataStatus === "minimal" ? `
      <div class="incomplete-banner" style="margin-bottom:14px;">
        <span>📝 بيانات الطالب غير مكتملة — تمت إضافته عن طريق الإدخال السريع، يرجى إكمال البيانات لتفعيل التواصل مع ولي الأمر.</span>
      </div>
    ` : ""}

    <div class="card card-pad" style="max-width:760px;">
      <form id="studentForm">

        <div class="form-section__title">البيانات الأساسية</div>
        <div class="field">
          <label class="field__label">اسم الطالب</label>
          <input class="input" name="name" required autofocus value="${editing ? escapeHTML(editing.name) : ""}" placeholder="الاسم رباعى">
        </div>

        <div class="divider"></div>
        <div class="form-section__title">السنة الدراسية والمجموعة</div>
        <div class="form-grid">
          <div class="field">
            <label class="field__label">السنة الدراسية</label>
            <select class="select" name="gradeId" id="studentGradeSelect" required>
              ${grades.map((g) => `<option value="${g.id}" ${defaultGradeId === g.id ? "selected" : ""}>${escapeHTML(g.name)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label class="field__label">المجموعة</label>
            <select class="select" name="groupId" id="studentGroupSelect" required>
              ${groupsForDefaultGrade.map((g) => `<option value="${g.id}" ${defaultGroupId === g.id ? "selected" : ""}>${escapeHTML(g.name)} (${g.code})</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="field">
          <label class="field__label">كود الطالب</label>
          <input class="input" name="code" id="studentCodeField" required value="${escapeHTML(suggestedCode)}" style="direction:ltr; font-weight:800; max-width:160px;">
          <div class="field__hint">كود مقترح تلقائيًا حسب المجموعة وترتيب الطالب فيها — تقدر تعدّله بحرية.</div>
        </div>

        <div class="divider"></div>
        <div class="form-section__title">بيانات التواصل</div>
        <div class="form-grid">
          <div class="field">
            <label class="field__label">هاتف الطالب</label>
            <input class="input" name="phone" value="${editing ? escapeHTML(editing.phone) : ""}" style="direction:ltr;" placeholder="(اختياري)">
          </div>
          <div class="field">
            <label class="field__label">هاتف ولى الأمر</label>
            <input class="input" name="parentPhone" ${editing?.dataStatus === "minimal" ? "" : "required"} value="${editing ? escapeHTML(editing.parentPhone) : ""}" style="direction:ltr;">
          </div>
        </div>

        <div class="divider"></div>
        <div class="form-section__title">بيانات إضافية</div>
        <div class="form-grid">
          <div class="field">
            <label class="field__label">وظيفة الأب</label>
            <input class="input" name="fatherJob" value="${editing ? escapeHTML(editing.fatherJob || "") : ""}" placeholder="مثال: موظف، تاجر، مهندس...">
          </div>
          <div class="field">
            <label class="field__label">اسم المدرسة</label>
            <input class="input" name="school" value="${editing ? escapeHTML(editing.school || "") : ""}" placeholder="اسم المدرسة الملتحق بها">
          </div>
        </div>

        <div class="divider"></div>
        <div class="form-section__title">الاشتراك</div>
        <div class="form-grid">
          <div class="field">
            <label class="field__label">تاريخ الانضمام</label>
            <input class="input" type="date" name="joinDate" required value="${editing ? editing.joinDate : todayISO()}">
          </div>
          <div class="field">
            <label class="field__label">حالة الاشتراك</label>
            <select class="select" name="status">
              <option value="active" ${editing?.status === "active" || !editing ? "selected" : ""}>نشط</option>
              <option value="paused" ${editing?.status === "paused" ? "selected" : ""}>متوقف</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label class="field__label">خصم على سعر الحصة (ج.م)</label>
          <input class="input" name="discount" type="number" min="0" value="${editing ? editing.discount || 0 : 0}" style="max-width:160px;">
          <div class="field__hint">القيمة الافتراضية صفر لكل الطلاب. هيتخصم أوتوماتيك من سعر الحصة كل مرة يحضر فيها الطالب.</div>
        </div>

        <div style="display:flex; gap:10px; margin-top:22px;">
          <button class="btn btn-primary" type="submit" style="flex:1; justify-content:center;">${icons.check} حفظ بيانات الطالب</button>
          <a class="btn btn-outline" href="students.html" style="flex:1; justify-content:center;">إلغاء</a>
        </div>
      </form>
    </div>
  `;

  const gradeSelect = document.getElementById("studentGradeSelect");
  const groupSelect = document.getElementById("studentGroupSelect");
  const codeField = document.getElementById("studentCodeField");

  gradeSelect.addEventListener("change", (e) => {
    const relevantGroups = groupsForGrade(groups, e.target.value);
    groupSelect.innerHTML = relevantGroups.map((g) => `<option value="${g.id}">${escapeHTML(g.name)} (${g.code})</option>`).join("");
    if (relevantGroups[0]) codeField.value = suggestStudentCode(students, relevantGroups[0]);
  });

  groupSelect.addEventListener("change", (e) => {
    if (editing) return; // ما نغيرش كود طالب موجود بالفعل تلقائيًا عند التعديل
    codeField.value = suggestStudentCode(students, findGroup(groups, e.target.value));
  });

  document.getElementById("studentForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    data.discount = Number(data.discount) || 0;
    data.lateBalance = editing ? editing.lateBalance || 0 : 0;

    if (editing) {
      Object.assign(editing, data);
      if (editing.dataStatus === "minimal") editing.dataStatus = "complete";
      saveStudents(students);
      Sounds.save();
      toast("تم تحديث بيانات الطالب بنجاح", "success");
    } else {
      const newStudent = { id: generateId("STU"), ...data };
      students.push(newStudent);
      saveStudents(students);
      if (data.groupId) applyPendingCharges(newStudent.id, data.groupId);
      Sounds.studentAdded();
      toast("تم إضافة الطالب بنجاح", "success");
    }

    setTimeout(async () => {
      await flushPendingWrites();
      window.location.href = "students.html";
    }, 500);
  });
}
