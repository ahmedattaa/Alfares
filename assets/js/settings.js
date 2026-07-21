// =========================================================
// Settings — إعدادات السنتر + الجداول الأساسية (Lookup Tables)
// السنوات الدراسية / المجموعات / حالات الطالب / بيانات الحساب
// =========================================================

import { initPage } from "./app.js";
import { icons } from "./icons.js";
import {
  getSettings,
  saveSettings,
  resetAllData,
  getSession,
  getGrades,
  saveGrades,
  getGroups,
  saveGroups,
  getStudentStatuses,
  saveStudentStatuses,
  getStudents,
} from "./storage.js";
import { escapeHTML, generateId } from "./helpers.js";
import { toast, confirmDialog, formModal, emptyStateHTML } from "./ui.js";
import { suggestGroupCode, gradeName } from "./lookups.js";
import { PERMISSION_PAGES } from "./permissions.js";
import { WEEKDAY_OPTIONS, formatDaysAr, formatTimeAr } from "./schedule.js";

const TABS = [
  { id: "center", label: "بيانات السنتر", icon: icons.settings },
  { id: "grades", label: "السنوات الدراسية", icon: icons.clipboard },
  { id: "groups", label: "المجموعات", icon: icons.users },
  { id: "statuses", label: "حالات الطالب", icon: icons.check },
  { id: "team", label: "إدارة", icon: icons.shield },
  { id: "danger", label: "منطقة خطرة", icon: icons.alert },
];

const content = await initPage("settings");
let activeTab = "center";

if (content) render();

function render() {
  content.innerHTML = `
    <div class="page__header">
      <div>
        <div class="page__title">الإعدادات</div>
        <div class="page__subtitle">البيانات الأساسية للسنتر وكل ما هو قابل للتعديل والتظبيط</div>
      </div>
    </div>

    <div class="tabs" id="settingsTabs">
      ${TABS.map(
        (t) => `<button class="tab-btn ${t.id === activeTab ? "is-active" : ""}" data-tab="${t.id}">${t.icon}<span>${t.label}</span></button>`
      ).join("")}
    </div>

    <div id="tabContent"></div>
  `;

  content.querySelectorAll(".tab-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      content.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === activeTab));
      renderTabContent();
    })
  );

  renderTabContent();
}

function renderTabContent() {
  const box = document.getElementById("tabContent");
  if (activeTab === "center") return renderCenterTab(box);
  if (activeTab === "grades") return renderGradesTab(box);
  if (activeTab === "groups") return renderGroupsTab(box);
  if (activeTab === "statuses") return renderStatusesTab(box);
  if (activeTab === "team") return renderTeamTab(box);
  if (activeTab === "danger") return renderDangerTab(box);
}

/* ================= بيانات السنتر ================= */
function renderCenterTab(box) {
  const settings = getSettings();
  const session = getSession();

  box.innerHTML = `
    <div class="grid-2">
      <div class="card card-pad">
        <div class="card__head"><div class="card__title">بيانات السنتر</div></div>
        <form id="centerForm">
          <div class="field">
            <label class="field__label">اسم السنتر</label>
            <input class="input" name="centerName" value="${escapeHTML(settings.centerName || "")}" required>
          </div>
          <div class="field">
            <label class="field__label">العنوان</label>
            <input class="input" name="address" value="${escapeHTML(settings.address || "")}">
          </div>
          <div class="form-grid">
            <div class="field">
              <label class="field__label">رقم الهاتف</label>
              <input class="input" name="phone" value="${escapeHTML(settings.phone || "")}">
            </div>
            <div class="field">
              <label class="field__label">العملة</label>
              <input class="input" name="currency" value="${escapeHTML(settings.currency || "ج.م")}">
            </div>
          </div>
          <button class="btn btn-primary" type="submit">${icons.check} حفظ التغييرات</button>
        </form>
      </div>

      <div class="card card-pad">
        <div class="card__head"><div class="card__title">الحساب الحالى</div></div>
        <div class="field">
          <label class="field__label">الاسم</label>
          <input class="input" value="${escapeHTML(session?.name || "")}" disabled>
        </div>
        <div class="field">
          <label class="field__label">اسم المستخدم</label>
          <input class="input" value="${escapeHTML(session?.username || "")}" disabled>
        </div>
        <div class="field">
          <label class="field__label">الصلاحية</label>
          <input class="input" value="${session?.role === "admin" ? "مدير" : "مدرس مساعد"}" disabled>
        </div>
        <div class="field__hint">لتغيير كلمة المرور تواصل مع مدير النظام (سيتم دعم ذلك لاحقًا).</div>
      </div>
    </div>
  `;

  document.getElementById("centerForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    saveSettings({ ...settings, ...data });
    toast("تم حفظ بيانات السنتر بنجاح", "success");
  });
}

/* ================= السنوات الدراسية ================= */
function renderGradesTab(box) {
  const grades = getGrades().slice().sort((a, b) => a.order - b.order);

  box.innerHTML = `
    <div class="card card-pad">
      <div class="card__head">
        <div class="card__title">السنوات الدراسية</div>
        <button class="btn btn-primary btn-sm" id="addGradeBtn">${icons.plus} إضافة سنة دراسية</button>
      </div>
      <div id="gradesTable"></div>
    </div>
  `;

  document.getElementById("addGradeBtn").addEventListener("click", () => openGradeForm());
  renderGradesTable();
}

function renderGradesTable() {
  const box = document.getElementById("gradesTable");
  const grades = getGrades().slice().sort((a, b) => a.order - b.order);
  const groups = getGroups();

  if (!grades.length) {
    box.innerHTML = emptyStateHTML({ icon: icons.clipboard, title: "لا توجد سنوات دراسية بعد", text: "أضف أول سنة دراسية لتتمكن من إضافة مجموعات تابعة لها." });
    return;
  }

  box.innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>الترتيب</th><th>اسم السنة الدراسية</th><th>عدد المجموعات التابعة</th><th></th></tr></thead>
        <tbody>
          ${grades
            .map(
              (g) => `
            <tr>
              <td><span class="badge badge-neutral">${g.order}</span></td>
              <td style="font-weight:700;">${escapeHTML(g.name)}</td>
              <td class="text-muted">${groups.filter((gr) => gr.gradeId === g.id).length} مجموعة</td>
              <td>
                <div class="row-actions">
                  <button class="btn btn-outline btn-icon editGradeBtn" data-id="${g.id}" title="تعديل">${icons.edit}</button>
                  <button class="btn btn-outline btn-icon deleteGradeBtn" data-id="${g.id}" title="حذف">${icons.trash}</button>
                </div>
              </td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  box.querySelectorAll(".editGradeBtn").forEach((btn) => btn.addEventListener("click", () => openGradeForm(btn.dataset.id)));
  box.querySelectorAll(".deleteGradeBtn").forEach((btn) => btn.addEventListener("click", () => deleteGrade(btn.dataset.id)));
}

async function openGradeForm(editId = null) {
  const grades = getGrades();
  const editing = editId ? grades.find((g) => g.id === editId) : null;
  const nextOrder = editing ? editing.order : (Math.max(0, ...grades.map((g) => g.order)) + 1);

  const bodyHTML = `
    <div class="field">
      <label class="field__label">اسم السنة الدراسية</label>
      <input class="input" name="name" required value="${editing ? escapeHTML(editing.name) : ""}" placeholder="مثال: الصف الرابع الابتدائي">
    </div>
    <div class="field">
      <label class="field__label">الترتيب</label>
      <input class="input" name="order" type="number" min="1" required value="${nextOrder}">
      <div class="field__hint">الترتيب بيدخل فى تكوين كود المجموعات التابعة لهذه السنة.</div>
    </div>
  `;

  const data = await formModal({ title: editing ? "تعديل السنة الدراسية" : "إضافة سنة دراسية", bodyHTML, submitText: editing ? "حفظ التعديلات" : "إضافة" });
  if (!data) return;
  data.order = Number(data.order) || nextOrder;

  if (editing) {
    Object.assign(editing, data);
    saveGrades(grades);
    toast("تم تحديث السنة الدراسية", "success");
  } else {
    grades.push({ id: generateId("GR"), ...data });
    saveGrades(grades);
    toast("تم إضافة السنة الدراسية بنجاح", "success");
  }
  renderGradesTable();
}

async function deleteGrade(id) {
  const grades = getGrades();
  const g = grades.find((x) => x.id === id);
  const groupsUsingIt = getGroups().filter((gr) => gr.gradeId === id).length;

  if (groupsUsingIt > 0) {
    toast(`لا يمكن حذف السنة الدراسية لأنها مرتبطة بـ ${groupsUsingIt} مجموعة. احذف المجموعات أولًا.`, "danger");
    return;
  }

  const ok = await confirmDialog({
    title: "حذف السنة الدراسية",
    body: `هل أنت متأكد من حذف <strong>${escapeHTML(g?.name || "")}</strong>؟`,
    confirmText: "حذف نهائى",
    tone: "danger",
  });
  if (!ok) return;

  saveGrades(grades.filter((x) => x.id !== id));
  toast("تم حذف السنة الدراسية", "success");
  renderGradesTable();
}

/* ================= المجموعات ================= */
function renderGroupsTab(box) {
  const grades = getGrades();

  box.innerHTML = `
    <div class="card card-pad">
      <div class="card__head">
        <div class="card__title">المجموعات</div>
        <button class="btn btn-primary btn-sm" id="addGroupBtn" ${grades.length ? "" : "disabled"}>${icons.plus} إضافة مجموعة</button>
      </div>
      ${!grades.length ? `<div class="field__hint" style="margin-bottom:14px;">أضف سنة دراسية أولًا من تبويب "السنوات الدراسية" قبل إضافة مجموعات.</div>` : ""}
      <div id="groupsTable"></div>
    </div>
  `;

  document.getElementById("addGroupBtn")?.addEventListener("click", () => openGroupForm());
  renderGroupsTable();
}

function renderGroupsTable() {
  const box = document.getElementById("groupsTable");
  const groups = getGroups();
  const grades = getGrades();
  const students = getStudents();

  if (!groups.length) {
    box.innerHTML = emptyStateHTML({ icon: icons.users, title: "لا توجد مجموعات بعد" });
    return;
  }

  box.innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>الكود</th><th>اسم المجموعة</th><th>السنة الدراسية</th><th>المعاد</th><th>سعر الحصة</th><th>عدد الطلاب</th><th></th></tr></thead>
        <tbody>
          ${groups
            .map(
              (g) => `
            <tr>
              <td><span class="code-pill">${escapeHTML(g.code)}</span></td>
              <td style="font-weight:700;">${escapeHTML(g.name)}</td>
              <td class="text-muted">${escapeHTML(gradeName(grades, g.gradeId))}</td>
              <td class="text-muted">${escapeHTML(formatDaysAr(g.days))} — ${escapeHTML(formatTimeAr(g.time))}</td>
              <td>${g.sessionPrice} ج.م</td>
              <td class="text-muted">${students.filter((s) => s.groupId === g.id).length} / ${g.capacity}</td>
              <td>
                <div class="row-actions">
                  <button class="btn btn-outline btn-icon editGroupBtn" data-id="${g.id}" title="تعديل">${icons.edit}</button>
                  <button class="btn btn-outline btn-icon deleteGroupBtn" data-id="${g.id}" title="حذف">${icons.trash}</button>
                </div>
              </td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  box.querySelectorAll(".editGroupBtn").forEach((btn) => btn.addEventListener("click", () => openGroupForm(btn.dataset.id)));
  box.querySelectorAll(".deleteGroupBtn").forEach((btn) => btn.addEventListener("click", () => deleteGroup(btn.dataset.id)));
}

async function openGroupForm(editId = null) {
  const groups = getGroups();
  const grades = getGrades();
  const editing = editId ? groups.find((g) => g.id === editId) : null;
  const defaultGradeId = editing?.gradeId || grades[0]?.id || "";

  const bodyHTML = `
    <div class="form-grid">
      <div class="field">
        <label class="field__label">السنة الدراسية</label>
        <select class="select" name="gradeId" id="gradeSelectField" required>
          ${grades.map((g) => `<option value="${g.id}" ${defaultGradeId === g.id ? "selected" : ""}>${escapeHTML(g.name)}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label class="field__label">كود المجموعة</label>
        <input class="input" name="code" id="groupCodeField" required value="${editing ? escapeHTML(editing.code) : suggestGroupCode(grades, groups, defaultGradeId)}">
        <div class="field__hint">كود مقترح تلقائيًا — تقدر تعدّله بحرية بما يوافق نظامك الحالى.</div>
      </div>
    </div>
    <div class="field">
      <label class="field__label">اسم المجموعة</label>
      <input class="input" name="name" required value="${editing ? escapeHTML(editing.name) : ""}" placeholder="مثال: مجموعة السبت 5م">
    </div>
    <div class="field">
      <label class="field__label">أيام الحصة (يمكن اختيار أكتر من يوم)</label>
      <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-top:6px;">
        ${WEEKDAY_OPTIONS.map(
          (w) => `
          <label style="display:flex; align-items:center; gap:6px; font-size:13.5px; font-weight:600; cursor:pointer;">
            <input type="checkbox" name="day_${w.key}" ${editing?.days?.includes(w.ar) ? "checked" : ""} style="width:16px;height:16px;">
            ${w.ar}
          </label>`
        ).join("")}
      </div>
    </div>
    <div class="form-grid">
      <div class="field">
        <label class="field__label">وقت بداية الحصة</label>
        <input class="input" type="time" name="time" required value="${editing ? editing.time : "17:00"}">
      </div>
      <div class="field">
        <label class="field__label">مدة الحصة (بالدقائق)</label>
        <input class="input" type="number" name="duration" min="15" step="15" required value="${editing ? editing.duration || 90 : 90}">
      </div>
    </div>
    <div class="form-grid">
      <div class="field">
        <label class="field__label">سعة المجموعة</label>
        <input class="input" name="capacity" type="number" min="1" required value="${editing ? editing.capacity : 20}">
      </div>
      <div class="field">
        <label class="field__label">سعر الحصة (ج.م)</label>
        <input class="input" name="sessionPrice" type="number" min="0" required value="${editing ? editing.sessionPrice : 50}">
      </div>
    </div>
  `;

  const promise = formModal({ title: editing ? "تعديل المجموعة" : "إضافة مجموعة جديدة", bodyHTML, submitText: editing ? "حفظ التعديلات" : "إضافة", wide: true });

  // تحديث اقتراح الكود تلقائيًا عند تغيير السنة الدراسية (يبقى قابل للتعديل اليدوى دائمًا)
  document.getElementById("gradeSelectField")?.addEventListener("change", (e) => {
    if (editing) return; // فى وضع التعديل ما نغيرش الكود تلقائى عشان منكسرش كود موجود فعلاً
    const codeField = document.getElementById("groupCodeField");
    codeField.value = suggestGroupCode(grades, groups, e.target.value);
  });

  const data = await promise;
  if (!data) return;
  data.capacity = Number(data.capacity) || 20;
  data.sessionPrice = Number(data.sessionPrice) || 0;
  data.duration = Number(data.duration) || 90;
  data.days = WEEKDAY_OPTIONS.filter((w) => data[`day_${w.key}`] === "on").map((w) => w.ar);
  WEEKDAY_OPTIONS.forEach((w) => delete data[`day_${w.key}`]);

  if (editing) {
    Object.assign(editing, data);
    saveGroups(groups);
    toast("تم تحديث بيانات المجموعة", "success");
  } else {
    groups.push({ id: generateId("GRP"), ...data });
    saveGroups(groups);
    toast("تم إضافة المجموعة بنجاح", "success");
  }
  renderGroupsTable();
}

async function deleteGroup(id) {
  const groups = getGroups();
  const g = groups.find((x) => x.id === id);
  const studentsUsingIt = getStudents().filter((s) => s.groupId === id).length;

  if (studentsUsingIt > 0) {
    toast(`لا يمكن حذف المجموعة لأنها تحتوى على ${studentsUsingIt} طالب. انقل الطلاب أولًا.`, "danger");
    return;
  }

  const ok = await confirmDialog({
    title: "حذف المجموعة",
    body: `هل أنت متأكد من حذف <strong>${escapeHTML(g?.name || "")}</strong>؟`,
    confirmText: "حذف نهائى",
    tone: "danger",
  });
  if (!ok) return;

  saveGroups(groups.filter((x) => x.id !== id));
  toast("تم حذف المجموعة", "success");
  renderGroupsTable();
}

/* ================= حالات الطالب ================= */
const TONE_LABELS = { success: "أخضر", info: "أزرق", warning: "برتقالى", danger: "أحمر" };
const CATEGORY_LABELS = { attendance: "حضور يومى", action: "إجراء استثنائى" };
const PRESENCE_LABELS = { present: "حاضر", absent: "غائب", null: "-" };
const PAYMENT_LABELS = { paid: "دفع", unpaid: "لم يدفع", none: "لا ينطبق" };

function renderStatusesTab(box) {
  box.innerHTML = `
    <div class="card card-pad">
      <div class="card__head">
        <div class="card__title">حالات الطالب</div>
        <button class="btn btn-primary btn-sm" id="addStatusBtn">${icons.plus} إضافة حالة</button>
      </div>
      <div class="field__hint" style="margin-bottom:14px;">
        هذه الحالات هى اللى بتظهر كأزرار فى صفحة "استقبال الطلاب" عند تسجيل حضور أى طالب.
      </div>
      <div id="statusesTable"></div>
    </div>
  `;
  document.getElementById("addStatusBtn").addEventListener("click", () => openStatusForm());
  renderStatusesTable();
}

function renderStatusesTable() {
  const box = document.getElementById("statusesTable");
  const statuses = getStudentStatuses();

  if (!statuses.length) {
    box.innerHTML = emptyStateHTML({ title: "لا توجد حالات معرّفة" });
    return;
  }

  box.innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>الحالة</th><th>النوع</th><th>يحسب حضور/غياب</th><th>الدفع</th><th>اللون</th><th></th></tr></thead>
        <tbody>
          ${statuses
            .map(
              (s) => `
            <tr>
              <td><span class="badge badge-${s.tone}"><span class="badge-dot"></span>${escapeHTML(s.name)}</span></td>
              <td class="text-muted">${CATEGORY_LABELS[s.category] || s.category}</td>
              <td class="text-muted">${PRESENCE_LABELS[s.presence]}</td>
              <td class="text-muted">${PAYMENT_LABELS[s.payment]}</td>
              <td class="text-muted">${TONE_LABELS[s.tone] || s.tone}</td>
              <td>
                <div class="row-actions">
                  <button class="btn btn-outline btn-icon editStatusBtn" data-id="${s.id}" title="تعديل">${icons.edit}</button>
                  <button class="btn btn-outline btn-icon deleteStatusBtn" data-id="${s.id}" title="حذف">${icons.trash}</button>
                </div>
              </td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  box.querySelectorAll(".editStatusBtn").forEach((btn) => btn.addEventListener("click", () => openStatusForm(btn.dataset.id)));
  box.querySelectorAll(".deleteStatusBtn").forEach((btn) => btn.addEventListener("click", () => deleteStatus(btn.dataset.id)));
}

async function openStatusForm(editId = null) {
  const statuses = getStudentStatuses();
  const editing = editId ? statuses.find((s) => s.id === editId) : null;

  const bodyHTML = `
    <div class="field">
      <label class="field__label">اسم الحالة</label>
      <input class="input" name="name" required value="${editing ? escapeHTML(editing.name) : ""}" placeholder="مثال: خصم نصف الحصة">
    </div>
    <div class="form-grid">
      <div class="field">
        <label class="field__label">نوع الحالة</label>
        <select class="select" name="category">
          <option value="attendance" ${editing?.category === "attendance" ? "selected" : ""}>حضور يومى (تظهر كزر رئيسى)</option>
          <option value="action" ${editing?.category === "action" ? "selected" : ""}>إجراء استثنائى (تظهر فى قسم منفصل)</option>
        </select>
      </div>
      <div class="field">
        <label class="field__label">لون العرض</label>
        <select class="select" name="tone">
          <option value="success" ${editing?.tone === "success" ? "selected" : ""}>أخضر</option>
          <option value="info" ${editing?.tone === "info" ? "selected" : ""}>أزرق</option>
          <option value="warning" ${editing?.tone === "warning" ? "selected" : ""}>برتقالى</option>
          <option value="danger" ${editing?.tone === "danger" ? "selected" : ""}>أحمر</option>
        </select>
      </div>
    </div>
    <div class="form-grid">
      <div class="field">
        <label class="field__label">هل تحسب حضور أم غياب؟</label>
        <select class="select" name="presence">
          <option value="present" ${editing?.presence === "present" ? "selected" : ""}>حضور</option>
          <option value="absent" ${editing?.presence === "absent" ? "selected" : ""}>غياب</option>
          <option value="null" ${editing?.presence == null ? "selected" : ""}>لا ينطبق</option>
        </select>
      </div>
      <div class="field">
        <label class="field__label">هل ترتبط بدفع؟</label>
        <select class="select" name="payment">
          <option value="paid" ${editing?.payment === "paid" ? "selected" : ""}>يسجل دفع فورى</option>
          <option value="unpaid" ${editing?.payment === "unpaid" ? "selected" : ""}>يسجل مستحق (لم يدفع بعد)</option>
          <option value="none" ${editing?.payment === "none" ? "selected" : ""}>لا ينطبق</option>
        </select>
      </div>
    </div>
  `;

  const data = await formModal({ title: editing ? "تعديل الحالة" : "إضافة حالة جديدة", bodyHTML, submitText: editing ? "حفظ التعديلات" : "إضافة", wide: true });
  if (!data) return;
  data.presence = data.presence === "null" ? null : data.presence;

  if (editing) {
    Object.assign(editing, data);
    saveStudentStatuses(statuses);
    toast("تم تحديث الحالة", "success");
  } else {
    statuses.push({ id: generateId("ST"), ...data });
    saveStudentStatuses(statuses);
    toast("تم إضافة الحالة بنجاح", "success");
  }
  renderStatusesTable();
}

async function deleteStatus(id) {
  const statuses = getStudentStatuses();
  const s = statuses.find((x) => x.id === id);

  const ok = await confirmDialog({
    title: "حذف الحالة",
    body: `هل أنت متأكد من حذف حالة <strong>${escapeHTML(s?.name || "")}</strong>؟ السجلات القديمة التى استخدمتها ستظل محفوظة لكنها لن تظهر بشكل صحيح.`,
    confirmText: "حذف نهائى",
    tone: "danger",
  });
  if (!ok) return;

  saveStudentStatuses(statuses.filter((x) => x.id !== id));
  toast("تم حذف الحالة", "success");
  renderStatusesTable();
}

/* ================= إدارة (المدرسون المساعدون والصلاحيات) ================= */
function renderTeamTab(box) {
  box.innerHTML = `
    <div class="card card-pad">
      <div class="card__head">
        <div class="card__title">المدرسون المساعدون</div>
        <button class="btn btn-primary btn-sm" id="addAssistantBtn">${icons.plus} إضافة مدرس مساعد</button>
      </div>
      <div class="field__hint" style="margin-bottom:14px;">
        حدد لكل مدرس مساعد الصفحات اللى يقدر يشوفها ويشتغل عليها فقط. صفحة "الرئيسية" متاحة دائمًا، و"الإعدادات" للمدير فقط.
      </div>
      <div id="teamTable"></div>
    </div>
  `;
  document.getElementById("addAssistantBtn").addEventListener("click", () => openAssistantForm());
  renderTeamTable();
}

function renderTeamTable() {
  const box = document.getElementById("teamTable");
  const settings = getSettings();
  const assistants = (settings.users || []).filter((u) => u.role !== "admin");

  if (!assistants.length) {
    box.innerHTML = emptyStateHTML({ icon: icons.shield, title: "لا يوجد مدرسون مساعدون بعد" });
    return;
  }

  box.innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>الاسم</th><th>اسم المستخدم</th><th>كلمة المرور</th><th>الصلاحيات</th><th></th></tr></thead>
        <tbody>
          ${assistants
            .map(
              (u, idx) => `
            <tr>
              <td style="font-weight:700;">${escapeHTML(u.name)}</td>
              <td class="text-muted" style="direction:ltr; text-align:left;">${escapeHTML(u.username)}</td>
              <td>
                <span class="text-muted pwMask" data-idx="${idx}" style="direction:ltr;">••••••</span>
                <button type="button" class="btn btn-outline btn-icon btn-sm togglePwBtn" data-idx="${idx}" data-pw="${escapeHTML(u.password)}" title="إظهار/إخفاء" style="width:26px;height:26px;">${icons.info}</button>
              </td>
              <td>
                <div style="display:flex; flex-wrap:wrap; gap:5px; max-width:280px;">
                  ${
                    (u.permissions || []).length
                      ? u.permissions.map((p) => `<span class="badge badge-primary">${escapeHTML(PERMISSION_PAGES.find((pp) => pp.id === p)?.label || p)}</span>`).join("")
                      : `<span class="badge badge-neutral">بدون صلاحيات</span>`
                  }
                </div>
              </td>
              <td>
                <div class="row-actions">
                  <button class="btn btn-outline btn-icon editAssistantBtn" data-username="${escapeHTML(u.username)}" title="تعديل">${icons.edit}</button>
                  <button class="btn btn-outline btn-icon deleteAssistantBtn" data-username="${escapeHTML(u.username)}" title="حذف">${icons.trash}</button>
                </div>
              </td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  box.querySelectorAll(".togglePwBtn").forEach((btn) =>
    btn.addEventListener("click", () => {
      const span = box.querySelector(`.pwMask[data-idx="${btn.dataset.idx}"]`);
      const isHidden = span.textContent.includes("•");
      span.textContent = isHidden ? btn.dataset.pw : "••••••";
    })
  );
  box.querySelectorAll(".editAssistantBtn").forEach((btn) => btn.addEventListener("click", () => openAssistantForm(btn.dataset.username)));
  box.querySelectorAll(".deleteAssistantBtn").forEach((btn) => btn.addEventListener("click", () => deleteAssistant(btn.dataset.username)));
}

async function openAssistantForm(editUsername = null) {
  const settings = getSettings();
  const users = settings.users || [];
  const editing = editUsername ? users.find((u) => u.username === editUsername) : null;

  const bodyHTML = `
    <div class="field">
      <label class="field__label">الاسم</label>
      <input class="input" name="name" required value="${editing ? escapeHTML(editing.name) : ""}" placeholder="مثال: أ. أحمد سامي">
    </div>
    <div class="form-grid">
      <div class="field">
        <label class="field__label">اسم المستخدم</label>
        <input class="input" name="username" required value="${editing ? escapeHTML(editing.username) : ""}" ${editing ? "disabled" : ""} style="direction:ltr;">
      </div>
      <div class="field">
        <label class="field__label">كلمة المرور</label>
        <input class="input" name="password" required value="${editing ? escapeHTML(editing.password) : ""}" style="direction:ltr;">
      </div>
    </div>
    <div class="field">
      <label class="field__label">الصفحات المسموح بالوصول لها</label>
      <div style="display:grid; grid-template-columns:repeat(2,1fr); gap:8px; margin-top:6px;">
        ${PERMISSION_PAGES.map(
          (p) => `
          <label style="display:flex; align-items:center; gap:8px; font-size:13.5px; font-weight:600; cursor:pointer;">
            <input type="checkbox" name="perm_${p.id}" ${editing?.permissions?.includes(p.id) ? "checked" : ""} style="width:16px;height:16px;">
            ${escapeHTML(p.label)}
          </label>`
        ).join("")}
      </div>
    </div>
  `;

  const data = await formModal({ title: editing ? "تعديل مدرس مساعد" : "إضافة مدرس مساعد", bodyHTML, submitText: editing ? "حفظ التعديلات" : "إضافة", wide: true });
  if (!data) return;

  const username = editing ? editing.username : data.username.trim();
  if (!editing && users.some((u) => u.username === username)) {
    toast("اسم المستخدم ده مستخدم بالفعل، اختر اسم آخر", "danger");
    return;
  }

  const permissions = PERMISSION_PAGES.filter((p) => data[`perm_${p.id}`] === "on").map((p) => p.id);
  const record = { username, password: data.password, name: data.name, role: "assistant", permissions };

  if (editing) {
    Object.assign(editing, record);
  } else {
    users.push(record);
  }
  saveSettings({ ...settings, users });
  toast(editing ? "تم تحديث بيانات المدرس المساعد" : "تم إضافة المدرس المساعد بنجاح", "success");
  renderTeamTable();
}

async function deleteAssistant(username) {
  const settings = getSettings();
  const users = settings.users || [];
  const u = users.find((x) => x.username === username);

  const ok = await confirmDialog({
    title: "حذف المدرس المساعد",
    body: `هل أنت متأكد من حذف <strong>${escapeHTML(u?.name || "")}</strong>؟ لن يقدر يسجل الدخول بعد كده.`,
    confirmText: "حذف نهائى",
    tone: "danger",
  });
  if (!ok) return;

  saveSettings({ ...settings, users: users.filter((x) => x.username !== username) });
  toast("تم حذف المدرس المساعد", "success");
  renderTeamTable();
}

/* ================= منطقة خطرة ================= */
function renderDangerTab(box) {
  box.innerHTML = `
    <div class="card card-pad" style="border-color: var(--danger-light);">
      <div class="card__head"><div class="card__title text-danger">منطقة خطرة</div></div>
      <p class="text-muted" style="margin-bottom:14px; font-size:13.5px;">
        إعادة ضبط النظام تحذف كل التعديلات المحفوظة محليًا وتعيد تحميل بيانات العرض التجريبية الأصلية.
      </p>
      <button class="btn btn-danger" id="resetBtn">${icons.trash} إعادة ضبط النظام بالكامل</button>
    </div>
  `;

  document.getElementById("resetBtn").addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "إعادة ضبط النظام",
      body: "سيتم حذف كل البيانات المحفوظة والعودة للبيانات التجريبية الأصلية. هل أنت متأكد؟",
      confirmText: "إعادة الضبط",
      tone: "danger",
    });
    if (!ok) return;
    await resetAllData();
    toast("تم إعادة ضبط النظام، جارٍ إعادة التحميل...", "success");
    setTimeout(() => (window.location.href = "login.html"), 1000);
  });
}
