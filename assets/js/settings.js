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
  getAcademicYears,
  saveAcademicYears,
  getTerms,
  saveTerms,
  getAcademicMonths,
  saveAcademicMonths,
  backfillLedger,
} from "./storage.js";
import { escapeHTML, generateId } from "./helpers.js";
import { toast, confirmDialog, formModal, emptyStateHTML } from "./ui.js";
import { suggestGroupCode, gradeName } from "./lookups.js";
import { PERMISSION_PAGES, canPerformSensitiveAction } from "./permissions.js";
import { WEEKDAY_OPTIONS, formatDaysAr, formatTimeAr } from "./schedule.js";
import { TEMPLATE_REGISTRY, CATEGORIES, getTemplateBody, saveTemplateOverride, resetTemplate, resetAllTemplates, getAllOverrides } from "./whatsapp-templates.js";

const TABS = [
  { id: "center", label: "بيانات السنتر", icon: icons.settings },
  { id: "academic", label: "العام الدراسي", icon: icons.calendar },
  { id: "grades", label: "السنوات الدراسية", icon: icons.clipboard },
  { id: "groups", label: "المجموعات", icon: icons.users },
  { id: "statuses", label: "حالات الطالب", icon: icons.check },
  { id: "whatsapp", label: "رسائل الواتساب", icon: icons.whatsapp || "💬" },
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
  if (activeTab === "academic") return renderAcademicPeriodsTab(box);
  if (activeTab === "team") return renderTeamTab(box);
  if (activeTab === "danger") return renderDangerTab(box);
  if (activeTab === "whatsapp") return renderWhatsAppTemplatesTab(box);
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

      <div>
        <div class="card card-pad" style="margin-bottom:16px;">
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

        <div class="card card-pad">
          <div class="card__head"><div class="card__title">${icons.wallet} إعدادات المحفظة (Center Coin)</div></div>
          <form id="walletForm">
            <div class="field">
              <label style="display:flex; align-items:center; gap:8px; font-size:13.5px; font-weight:600; cursor:pointer;">
                <input type="checkbox" name="autoDeductWallet" ${settings.autoDeductWallet !== false ? "checked" : ""} style="width:16px;height:16px;">
                خصم تلقائي من المحفظة عند تسجيل الحضور
              </label>
              <div class="field__hint">لو مفعّل، النظام بيخصم ثمن الحصة من محفظة الطالب تلقائيًا لما بيتسجل عليه حضور مدفوع.</div>
            </div>
            <div class="field">
              <label style="display:flex; align-items:center; gap:8px; font-size:13.5px; font-weight:600; cursor:pointer;">
                <input type="checkbox" name="autoDeductMaterials" ${settings.autoDeductMaterials ? "checked" : ""} style="width:16px;height:16px;">
                خصم تلقائي من المحفظة للملازم والاستحقاقات
              </label>
              <div class="field__hint">لو مفعّل، أي ملزمة أو استحقاق إضافي هيتخصم من المحفظة لو فيه رصيد كافي.</div>
            </div>
            <button class="btn btn-primary btn-sm" type="submit">${icons.check} حفظ إعدادات المحفظة</button>
          </form>
        </div>
      </div>
    </div>
  `;

  document.getElementById("centerForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    saveSettings({ ...settings, ...data });
    toast("تم حفظ بيانات السنتر بنجاح", "success");
  });

  document.getElementById("walletForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    saveSettings({ ...settings, autoDeductWallet: data.autoDeductWallet === "on", autoDeductMaterials: data.autoDeductMaterials === "on" });
    toast("تم حفظ إعدادات المحفظة بنجاح", "success");
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
          <option value="none" ${editing?.payment == null || editing?.payment === "none" ? "selected" : ""}>لا ينطبق</option>
        </select>
      </div>
    </div>
    <div class="field">
      <label class="field__label">مكافأة (اختياري)</label>
      <input class="input" name="rewardAmount" type="number" min="0" step="1" value="${editing?.rewardAmount || ""}" placeholder="مبلغ مكافأة يُضاف للمحفظة عند التسجيل (0 أو اتركه فارغ = بدون مكافأة)">
      <div class="field__hint">إذا أدخلت مبلغًا، يُضاف تلقائيًا لمحفظة الطالب عند تسجيل هذه الحالة</div>
    </div>
    </div>
  `;

  const data = await formModal({ title: editing ? "تعديل الحالة" : "إضافة حالة جديدة", bodyHTML, submitText: editing ? "حفظ التعديلات" : "إضافة", wide: true });
  if (!data) return;
  data.presence = data.presence === "null" ? null : data.presence;
  data.rewardAmount = data.rewardAmount ? Number(data.rewardAmount) : 0;

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

/* ================= العام الدراسي (Normalized Schema) ================= */
function renderAcademicPeriodsTab(box) {
  box.innerHTML = `
    <div class="card card-pad" style="margin-bottom:18px;">
      <div class="card__head">
        <div class="card__title">العام الدراسي</div>
        <button class="btn btn-primary btn-sm" id="addYearBtn">${icons.plus} إضافة سنة أكاديمية</button>
      </div>
      <p class="field__hint" style="margin-bottom:0;">
        حدد السنة الأكاديمية الحالية ثم الأترام والشهور. كل شهر لازم يكون له تاريخ بداية ونهاية، وده اللى بيساعد النظام يحدد الترم والشهر النشط تلقائيًا.
      </p>
    </div>
    <div id="academicTree"></div>
  `;
  document.getElementById("addYearBtn").addEventListener("click", () => openYearForm());
  renderAcademicTree();
}

function renderAcademicTree() {
  const box = document.getElementById("academicTree");
  const years = getAcademicYears();
  const allTerms = getTerms();
  const allMonths = getAcademicMonths();

  if (!years.length) {
    box.innerHTML = emptyStateHTML({ icon: icons.calendar, title: "لا توجد سنوات أكاديمية بعد", text: "أضف أول سنة أكاديمية لتتمكن من تحديد الأترام والشهور." });
    return;
  }

  box.innerHTML = years.map((year) => {
    const yearTerms = allTerms.filter((t) => t.yearId === year.id).sort((a, b) => a.order - b.order);
    return `
      <div class="ap-year">
        <div class="ap-year__header">
          <div class="ap-year__title">
            ${icons.clipboard}
            <strong>${escapeHTML(year.name)}</strong>
            ${year.isCurrent ? `<span class="badge badge-success" style="font-size:10px;">السنة الحالية</span>` : ""}
          </div>
          <div class="row-actions">
            <button class="btn btn-outline btn-icon addTermBtn" data-year-id="${year.id}" title="إضافة ترم">${icons.plus}</button>
            <button class="btn btn-outline btn-icon editYearBtn" data-year-id="${year.id}" title="تعديل">${icons.edit}</button>
            <button class="btn btn-outline btn-icon deleteYearBtn" data-year-id="${year.id}" title="حذف">${icons.trash}</button>
          </div>
        </div>
        ${yearTerms.length ? yearTerms.map((term) => {
          const termMonths = allMonths.filter((m) => m.termId === term.id);
          return `
            <div class="ap-term">
              <div class="ap-term__header">
                <div class="ap-term__title">
                  ${icons.clipboard}
                  <span>${escapeHTML(term.name)}</span>
                  <span class="text-muted" style="font-size:11px; margin-right:auto; margin-left:10px;">${term.startDate} → ${term.endDate}</span>
                </div>
                <div class="row-actions">
                  <button class="btn btn-outline btn-icon btn-xs addMonthBtn" data-term-id="${term.id}" title="إضافة شهر">${icons.plus}</button>
                  <button class="btn btn-outline btn-icon btn-xs editTermBtn" data-term-id="${term.id}" title="تعديل">${icons.edit}</button>
                  <button class="btn btn-outline btn-icon btn-xs deleteTermBtn" data-term-id="${term.id}" title="حذف">${icons.trash}</button>
                </div>
              </div>
              ${termMonths.length ? `
                <div class="ap-months">
                  ${termMonths.map((m) => `
                    <div class="ap-month">
                      <div class="ap-month__info">
                        <strong>${escapeHTML(m.name)}</strong>
                        <span class="text-muted">${m.startDate} → ${m.endDate}</span>
                      </div>
                      <div class="row-actions">
                        <button class="btn btn-outline btn-icon btn-xs editMonthBtn" data-month-id="${m.id}" title="تعديل">${icons.edit}</button>
                        <button class="btn btn-outline btn-icon btn-xs deleteMonthBtn" data-month-id="${m.id}" title="حذف">${icons.trash}</button>
                      </div>
                    </div>
                  `).join("")}
                </div>
              ` : `<div class="ap-empty">لا توجد شهور بعد</div>`}
            </div>`;
        }).join("") : `<div class="ap-empty" style="margin-left:32px;">لا توجد أترام بعد</div>`}
      </div>`;
  }).join("");

  box.querySelectorAll(".addTermBtn").forEach((btn) => btn.addEventListener("click", () => openTermForm(btn.dataset.yearId)));
  box.querySelectorAll(".editYearBtn").forEach((btn) => btn.addEventListener("click", () => openYearForm(btn.dataset.yearId)));
  box.querySelectorAll(".deleteYearBtn").forEach((btn) => btn.addEventListener("click", () => deleteYear(btn.dataset.yearId)));
  box.querySelectorAll(".addMonthBtn").forEach((btn) => btn.addEventListener("click", () => openMonthForm(btn.dataset.termId)));
  box.querySelectorAll(".editTermBtn").forEach((btn) => btn.addEventListener("click", () => openTermForm(null, btn.dataset.termId)));
  box.querySelectorAll(".deleteTermBtn").forEach((btn) => btn.addEventListener("click", () => deleteTerm(btn.dataset.termId)));
  box.querySelectorAll(".editMonthBtn").forEach((btn) => btn.addEventListener("click", () => openMonthForm(null, btn.dataset.monthId)));
  box.querySelectorAll(".deleteMonthBtn").forEach((btn) => btn.addEventListener("click", () => deleteMonth(btn.dataset.monthId)));
}

/* ── السنة الأكاديمية ── */
async function openYearForm(editId = null) {
  const years = getAcademicYears();
  const editing = editId ? years.find((y) => y.id === editId) : null;

  const bodyHTML = `
    <div class="field">
      <label class="field__label">اسم السنة الأكاديمية</label>
      <input class="input" name="name" required value="${editing ? escapeHTML(editing.name) : ""}" placeholder="مثال: 2026 — 2027">
    </div>
    <div class="field">
      <label style="display:flex; align-items:center; gap:8px; font-size:13.5px; font-weight:600; cursor:pointer;">
        <input type="checkbox" name="isCurrent" ${editing?.isCurrent ? "checked" : ""} style="width:16px;height:16px;">
        جعلها السنة الحالية (نشطة)
      </label>
      <div class="field__hint">سنة واحدة بس ممكن تكون "السنة الحالية" — لو حددت سنة جديدة هتتلغى القديمة تلقائيًا.</div>
    </div>
  `;

  const data = await formModal({ title: editing ? "تعديل السنة الأكاديمية" : "إضافة سنة أكاديمية", bodyHTML, submitText: editing ? "حفظ التعديلات" : "إضافة" });
  if (!data) return;

  const isCurrent = data.isCurrent === "on";

  if (editing) {
    editing.name = data.name;
    editing.isCurrent = isCurrent;
  } else {
    years.push({ id: generateId("AY"), name: data.name, isCurrent });
  }

  if (isCurrent) {
    years.forEach((y) => { if (y.id !== (editing?.id || years[years.length - 1]?.id)) y.isCurrent = false; });
  }

  saveAcademicYears(years);
  toast(editing ? "تم تحديث السنة الأكاديمية" : "تم إضافة السنة الأكاديمية بنجاح", "success");
  renderAcademicTree();
}

async function deleteYear(yearId) {
  const years = getAcademicYears();
  const year = years.find((y) => y.id === yearId);
  const termsCount = getTerms().filter((t) => t.yearId === yearId).length;

  const ok = await confirmDialog({
    title: "حذف السنة الأكاديمية",
    body: `هل أنت متأكد من حذف <strong>${escapeHTML(year?.name || "")}</strong>؟${termsCount ? `<br><br><small>ستحذف ${termsCount} ترم(ات) تابعة لها وجميع شهورها.</small>` : ""}`,
    confirmText: "حذف نهائى",
    tone: "danger",
  });
  if (!ok) return;

  const yearTerms = getTerms().filter((t) => t.yearId === yearId);
  const termIds = yearTerms.map((t) => t.id);

  saveAcademicMonths(getAcademicMonths().filter((m) => !termIds.includes(m.termId)));
  saveTerms(getTerms().filter((t) => t.yearId !== yearId));
  saveAcademicYears(years.filter((y) => y.id !== yearId));
  toast("تم حذف السنة الأكاديمية", "success");
  renderAcademicTree();
}

/* ── الترم ── */
async function openTermForm(yearId, editId = null) {
  const years = getAcademicYears();
  const terms = getTerms();
  const editing = editId ? terms.find((t) => t.id === editId) : null;
  const targetYearId = yearId || editing?.yearId;

  const bodyHTML = `
    <div class="field">
      <label class="field__label">اسم الترم</label>
      <input class="input" name="name" required value="${editing ? escapeHTML(editing.name) : ""}" placeholder="مثال: الترم الأول">
    </div>
    <div class="field">
      <label class="field__label">الترتيب</label>
      <input class="input" name="order" type="number" min="1" required value="${editing ? editing.order : (terms.filter((t) => t.yearId === targetYearId).length + 1)}">
    </div>
    <div class="form-grid">
      <div class="field">
        <label class="field__label">تاريخ البداية</label>
        <input class="input" name="startDate" type="date" required value="${editing?.startDate || ""}">
      </div>
      <div class="field">
        <label class="field__label">تاريخ النهاية</label>
        <input class="input" name="endDate" type="date" required value="${editing?.endDate || ""}">
      </div>
    </div>
  `;

  const data = await formModal({ title: editing ? "تعديل الترم" : "إضافة ترم جديد", bodyHTML, submitText: editing ? "حفظ التعديلات" : "إضافة" });
  if (!data) return;

  if (editing) {
    editing.name = data.name;
    editing.order = Number(data.order) || editing.order;
    editing.startDate = data.startDate;
    editing.endDate = data.endDate;
  } else {
    terms.push({ id: generateId("TR"), yearId: targetYearId, name: data.name, order: Number(data.order) || 1, startDate: data.startDate, endDate: data.endDate });
  }

  saveTerms(terms);
  toast(editing ? "تم تحديث الترم" : "تم إضافة الترم بنجاح", "success");
  renderAcademicTree();
}

async function deleteTerm(termId) {
  const terms = getTerms();
  const term = terms.find((t) => t.id === termId);
  const monthsCount = getAcademicMonths().filter((m) => m.termId === termId).length;

  const ok = await confirmDialog({
    title: "حذف الترم",
    body: `هل أنت متأكد من حذف <strong>${escapeHTML(term?.name || "")}</strong>؟${monthsCount ? `<br><br><small>ستحذف ${monthsCount} شهر(ات) تابعة له.</small>` : ""}`,
    confirmText: "حذف نهائى",
    tone: "danger",
  });
  if (!ok) return;

  saveAcademicMonths(getAcademicMonths().filter((m) => m.termId !== termId));
  saveTerms(terms.filter((t) => t.id !== termId));
  toast("تم حذف الترم", "success");
  renderAcademicTree();
}

/* ── الشهر ── */
async function openMonthForm(termId, editId = null) {
  const months = getAcademicMonths();
  const editing = editId ? months.find((m) => m.id === editId) : null;
  const targetTermId = termId || editing?.termId;

  const bodyHTML = `
    <div class="field">
      <label class="field__label">اسم الشهر</label>
      <input class="input" name="name" required value="${editing ? escapeHTML(editing.name) : ""}" placeholder="مثال: أكتوبر">
    </div>
    <div class="form-grid">
      <div class="field">
        <label class="field__label">تاريخ البداية</label>
        <input class="input" name="startDate" type="date" required value="${editing?.startDate || ""}">
      </div>
      <div class="field">
        <label class="field__label">تاريخ النهاية</label>
        <input class="input" name="endDate" type="date" required value="${editing?.endDate || ""}">
      </div>
    </div>
  `;

  const data = await formModal({ title: editing ? "تعديل الشهر" : "إضافة شهر جديد", bodyHTML, submitText: editing ? "حفظ التعديلات" : "إضافة" });
  if (!data) return;

  if (editing) {
    editing.name = data.name;
    editing.startDate = data.startDate;
    editing.endDate = data.endDate;
  } else {
    months.push({ id: generateId("AM"), termId: targetTermId, name: data.name, startDate: data.startDate, endDate: data.endDate });
  }

  saveAcademicMonths(months);
  toast(editing ? "تم تحديث الشهر" : "تم إضافة الشهر بنجاح", "success");
  renderAcademicTree();
}

async function deleteMonth(monthId) {
  const months = getAcademicMonths();
  const month = months.find((m) => m.id === monthId);

  const ok = await confirmDialog({
    title: "حذف الشهر",
    body: `هل أنت متأكد من حذف شهر <strong>${escapeHTML(month?.name || "")}</strong>؟`,
    confirmText: "حذف نهائى",
    tone: "danger",
  });
  if (!ok) return;

  saveAcademicMonths(months.filter((m) => m.id !== monthId));
  toast("تم حذف الشهر", "success");
  renderAcademicTree();
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
                <div style="display:flex; flex-wrap:wrap; gap:5px;">
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
    <div class="card card-pad" style="border-color: var(--warning); margin-bottom:16px;">
      <div class="card__head"><div class="card__title" style="color:var(--warning);">تهيئة دفتر الأستاذ</div></div>
      <p class="text-muted" style="margin-bottom:14px; font-size:13.5px;">
        لو السيرفر محدّث من نسخة قديمة، ده زر بينشأ قيود افتتاحية لكل الطلاب اللي عليهم متأخرات أو رصيد محفظة.
        <strong>اضغطه مرة واحدة بس.</strong>
      </p>
      <button class="btn btn-warning" id="backfillLedgerBtn">${icons.clipboard} تهيئة دفتر الأستاذ</button>
    </div>
    <div class="card card-pad" style="border-color: var(--danger-light);">
      <div class="card__head"><div class="card__title text-danger">منطقة خطرة</div></div>
      <p class="text-muted" style="margin-bottom:14px; font-size:13.5px;">
        إعادة ضبط النظام تحذف كل التعديلات المحفوظة محليًا وتعيد تحميل بيانات العرض التجريبية الأصلية.
      </p>
      <button class="btn btn-danger" id="resetBtn">${icons.trash} إعادة ضبط النظام بالكامل</button>
    </div>
  `;

  document.getElementById("backfillLedgerBtn").addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "تهيئة دفتر الأستاذ",
      body: "هيتم إنشاء قيود افتتاحية لكل الطلاب اللي عليهم متأخرات أو رصيد محفظة. هل أنت متأكد؟",
      confirmText: "تهيئة",
      tone: "warning",
    });
    if (!ok) return;
    const count = backfillLedger();
    toast(`تم تهيئة ${count} قيد في دفتر الأستاذ ✓`, "success");
  });

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

/* ================= رسائل الواتساب ================= */
function renderWhatsAppTemplatesTab(box) {
  const overrides = getAllOverrides();
  const overriddenCount = Object.keys(overrides).length;

  box.innerHTML = `
    <div class="card card-pad" style="margin-bottom:16px;">
      <div class="card__head">
        <div class="card__title">قوالب رسائل الواتساب</div>
        <div style="display:flex; gap:8px;">
          ${overriddenCount > 0 ? `<button class="btn btn-outline btn-sm" id="resetAllWaBtn">${icons.trash} إعادة الكل للافتراضى (${overriddenCount} معدّل)</button>` : ""}
        </div>
      </div>
      <p class="text-muted" style="font-size:13.5px; margin-bottom:4px;">
        كل رسائل الواتساب المستخدمة فى النظام. اضغط على أي قالب لتعديله. المتغيرات giữa أقواس { } بتتضاف تلقائياً من بيانات الطالب والحصة.
      </p>
    </div>

    <div id="waTemplatesList"></div>
  `;

  renderWhatsAppTemplatesList();

  const resetAllBtn = document.getElementById("resetAllWaBtn");
  if (resetAllBtn) {
    resetAllBtn.addEventListener("click", async () => {
      const ok = await confirmDialog({
        title: "إعادة كل القوالب للافتراضى",
        body: `هل أنت متأكد؟ سيتم مسح ${overriddenCount} قالب معدّل والعودة للنصوص الأصلية.`,
        confirmText: "إعادة الضبط",
        tone: "warning",
      });
      if (!ok) return;
      resetAllTemplates();
      toast("تم إعادة كل القوالب للافتراضى", "success");
      renderWhatsAppTemplatesTab(box);
    });
  }
}

function renderWhatsAppTemplatesList() {
  const list = document.getElementById("waTemplatesList");
  if (!list) return;

  const overrides = getAllOverrides();

  let html = "";
  CATEGORIES.forEach((cat) => {
    const templates = TEMPLATE_REGISTRY.filter((t) => t.category === cat.id);
    if (!templates.length) return;

    html += `
      <div class="card card-pad" style="margin-bottom:16px;">
        <div class="card__head">
          <div class="card__title">${cat.icon} ${cat.label}</div>
          <span class="badge badge-neutral">${templates.length}</span>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${templates
            .map((tpl) => {
              const isEdited = !!overrides[tpl.id];
              const preview = (overrides[tpl.id] || tpl.defaultBody).split("\n").slice(0, 3).join("\n");
              return `
              <div class="wa-tpl-card ${isEdited ? "wa-tpl-card--edited" : ""}" data-id="${tpl.id}" style="cursor:pointer;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                  <div style="min-width:0;">
                    <div style="display:flex; align-items:center; gap:6px; margin-bottom:3px;">
                      <span style="font-weight:700; font-size:14px;">${escapeHTML(tpl.name)}</span>
                      ${isEdited ? '<span class="badge badge-warning" style="font-size:10px;">معدّل</span>' : ""}
                      <span class="badge badge-neutral" style="font-size:10px;">${tpl.recipient === "parent" ? "ولي الأمر" : "الطالب"}</span>
                    </div>
                    <div class="text-muted" style="font-size:12px; direction:ltr; text-align:left; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:500px;">${escapeHTML(preview)}</div>
                  </div>
                  <div style="display:flex; gap:4px; flex-shrink:0;">
                    <button class="btn btn-outline btn-icon btn-sm editWaTplBtn" data-id="${tpl.id}" title="تعديل">${icons.edit}</button>
                    ${isEdited ? `<button class="btn btn-outline btn-icon btn-sm resetWaTplBtn" data-id="${tpl.id}" title="إعادة للافتراضى">${icons.trash}</button>` : ""}
                  </div>
                </div>
              </div>`;
            })
            .join("")}
        </div>
      </div>`;
  });

  list.innerHTML = html;

  list.querySelectorAll(".wa-tpl-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".editWaTplBtn") || e.target.closest(".resetWaTplBtn")) return;
      openTemplateEditor(card.dataset.id);
    });
  });

  list.querySelectorAll(".editWaTplBtn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openTemplateEditor(btn.dataset.id);
    });
  });

  list.querySelectorAll(".resetWaTplBtn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const tpl = TEMPLATE_REGISTRY.find((t) => t.id === btn.dataset.id);
      const ok = await confirmDialog({
        title: "إعادة للافتراضى",
        body: `هل أنت متأكد من إعادة قالب "<strong>${escapeHTML(tpl?.name || "")}</strong>" للنص الافتراضى؟`,
        confirmText: "إعادة",
        tone: "warning",
      });
      if (!ok) return;
      resetTemplate(btn.dataset.id);
      toast("تم إعادة القالب للافتراضى", "success");
      renderWhatsAppTemplatesList();
    });
  });
}

function openTemplateEditor(templateId) {
  const tpl = TEMPLATE_REGISTRY.find((t) => t.id === templateId);
  if (!tpl) return;

  const { body, isDefault } = getTemplateBody(templateId);

  const bodyHTML = `
    <div style="margin-bottom:12px;">
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
        <span class="badge badge-neutral">${tpl.recipient === "parent" ? "ولي الأمر" : "الطالب"}</span>
        <span class="badge badge-neutral">المصدر: ${escapeHTML(tpl.source)}</span>
        ${isDefault ? '<span class="badge badge-primary">الافتراضى</span>' : '<span class="badge badge-warning">معدّل</span>'}
      </div>
      ${tpl.placeholders.length ? `
      <div style="background:var(--bg-secondary, #f5f5f5); border-radius:8px; padding:10px 12px; margin-bottom:12px;">
        <div style="font-size:12px; font-weight:700; margin-bottom:6px; color:var(--text-secondary);">المتغيرات المتاحة:</div>
        <div style="display:flex; flex-wrap:wrap; gap:6px;">
          ${tpl.placeholders.map((p) => `<code style="background:var(--bg, #fff); padding:2px 8px; border-radius:4px; font-size:12px; border:1px solid var(--border, #e0e0e0);">{${p.key}}</code> <span style="font-size:11px; color:var(--text-secondary);">${escapeHTML(p.label)}</span>`).join("")}
        </div>
      </div>
      ` : ""}
    </div>
    <div class="field">
      <label class="field__label">نص الرسالة</label>
      <textarea class="input" name="body" rows="12" style="font-family:monospace; font-size:13px; line-height:1.6; resize:vertical; white-space:pre-wrap; direction:rtl;">${escapeHTML(body)}</textarea>
      <div class="field__hint">استخدم {variable} لأى متغير يتضاف تلقائياً من بيانات الطالب.</div>
    </div>
  `;

  formModal({
    title: `تعديل قالب: ${tpl.name}`,
    bodyHTML,
    submitText: "حفظ التعديلات",
    wide: true,
  }).then((data) => {
    if (!data) return;
    const newBody = (data.body || "").trim();
    if (!newBody) {
      toast("نص الرسالة مش فاضى", "danger");
      return;
    }
    saveTemplateOverride(templateId, newBody);
    toast("تم حفظ التعديلات", "success");
    renderWhatsAppTemplatesList();
  });
}

/* ── btn-xs معرّف في style.css ── */
