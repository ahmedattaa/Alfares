// =========================================================
// Setup — معالج الإعداد الأول (Onboarding Wizard)
// بيظهر تلقائيًا بعد أول تسجيل دخول للمدير لما النظام يبدأ فاضي
// (المشروع الفاضي الافتراضي)، وبيرشده خطوة بخطوة:
// بيانات السنتر ← العام الدراسي ← المجموعات ← استيراد الطلاب
// =========================================================

import { initPage } from "./app.js";
import { icons } from "./icons.js";
import {
  getSettings,
  saveSettings,
  getGrades,
  getGroups,
  saveGroups,
  getStudents,
  getAcademicYears,
  saveAcademicYears,
  getTerms,
  saveTerms,
  markSetupDone,
  flushPendingWrites,
} from "./storage.js";
import { escapeHTML, generateId } from "./helpers.js";
import { toast, confirmDialog } from "./ui.js";
import { suggestGroupCode, gradeName } from "./lookups.js";
import { WEEKDAY_OPTIONS, formatDaysAr, formatTimeAr } from "./schedule.js";
import { appPath } from "./paths.js";

const content = await initPage("setup");

const STEPS = [
  { title: "أهلًا" },
  { title: "السنتر" },
  { title: "العام الدراسي" },
  { title: "المجموعات" },
  { title: "استيراد الطلاب" },
  { title: "تم" },
];

let step = 0;

if (content) render();

function render() {
  content.innerHTML = `
    <div class="page__header">
      <div>
        <div class="page__title">${icons.rocket || "🚀"} معالج الإعداد الأول</div>
        <div class="page__subtitle">هتجهز سنترك في خطوات بسيطة — تقدر تكمل في أي وقت من الإعدادات</div>
      </div>
      <button class="btn btn-ghost btn-sm" id="wizardSkipBtn">تخطي المعالج</button>
    </div>

    <div style="max-width:860px; margin:0 auto;">
      ${renderProgress()}
      <div class="card card-pad">
        ${renderStep()}
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:18px;">
        ${step > 0 && step < 5 ? `<button class="btn btn-outline" id="wizardPrevBtn">${icons.arrowLeft} السابق</button>` : "<span></span>"}
        ${step < 5 ? `<button class="btn btn-primary" id="wizardNextBtn">${nextLabel()}</button>` : ""}
      </div>
    </div>
  `;

  document.getElementById("wizardSkipBtn")?.addEventListener("click", handleSkip);
  document.getElementById("wizardPrevBtn")?.addEventListener("click", () => {
    step--;
    render();
  });
  document.getElementById("wizardNextBtn")?.addEventListener("click", handleNext);

  bindStepEvents();
}

function nextLabel() {
  if (step === 0) return "ابدأ الإعداد";
  if (step === 1) return "التالي: العام الدراسي";
  if (step === 2) return "التالي: المجموعات";
  if (step === 3) return "التالي: استيراد الطلاب";
  return "التالي";
}

function renderProgress() {
  return `
    <div style="display:flex; align-items:flex-start; justify-content:center; gap:4px; margin-bottom:22px; flex-wrap:wrap;">
      ${STEPS.map((s, i) => {
        const done = i < step;
        const active = i === step;
        return `
          <div style="display:flex; align-items:flex-start; gap:4px;">
            <div style="text-align:center; width:82px;">
              <div style="width:34px;height:34px;margin:0 auto;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;background:${done || active ? "var(--primary)" : "var(--bg-secondary, #f1f5f9)"};color:${done || active ? "#fff" : "var(--muted)"};border:2px solid ${done || active ? "var(--primary)" : "var(--border)"};">${done ? "✓" : i + 1}</div>
              <div style="font-size:11px;font-weight:700;color:${active ? "var(--text)" : "var(--muted)"};margin-top:6px;">${s.title}</div>
            </div>
            ${i < STEPS.length - 1 ? `<div style="width:26px;height:2px;background:${done ? "var(--primary)" : "var(--border)"};margin-top:17px;"></div>` : ""}
          </div>`;
      }).join("")}
    </div>`;
}

function renderStep() {
  switch (step) {
    case 0: return renderWelcome();
    case 1: return renderCenter();
    case 2: return renderYear();
    case 3: return renderGroups();
    case 4: return renderImport();
    case 5: return renderDone();
  }
  return "";
}

/* ---- الخطوة 1: الترحيب ---- */
function renderWelcome() {
  return `
    <div style="text-align:center; padding:26px 10px 10px;">
      <div style="font-size:52px; margin-bottom:10px;">🏫</div>
      <div style="font-size:24px; font-weight:800; margin-bottom:8px;">أهلًا بك في نظام إدارة السنتر</div>
      <div style="color:var(--muted); max-width:540px; margin:0 auto 22px; line-height:1.9; font-size:14px;">
        سنظبط نظامك مع بعض في <strong>4 خطوات بسيطة</strong> — بيانات السنتر، العام الدراسي،
        المجموعات، واستيراد الطلاب. بعدها تدخل لوحة التحكم وتبدأ الشغل فورًا.
      </div>
      <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; max-width:620px; margin:0 auto 10px;">
        ${[
          ["🏫", "بيانات السنتر"],
          ["📅", "العام الدراسي"],
          ["👥", "المجموعات"],
          ["📥", "الطلاب"],
        ].map(([ic, t]) => `
          <div style="background:var(--bg-secondary, #f1f5f9); border-radius:14px; padding:16px 10px; text-align:center; border:1px solid var(--border);">
            <div style="font-size:26px; margin-bottom:6px;">${ic}</div>
            <div style="font-size:12.5px; font-weight:700;">${t}</div>
          </div>`).join("")}
      </div>
    </div>`;
}

/* ---- الخطوة 2: بيانات السنتر ---- */
function renderCenter() {
  const s = getSettings();
  return `
    <div style="padding:6px 6px 2px;">
      <div class="page__subtitle" style="font-size:14px; font-weight:800; margin-bottom:16px;">خطوة 1 من 4 — بيانات السنتر</div>
      <div class="form-grid">
        <div class="field">
          <label class="field__label">اسم السنتر *</label>
          <input class="input" id="centerName" value="${escapeHTML(s.centerName || "")}" placeholder="مثال: سنتر الفارس التعليمي">
        </div>
        <div class="field">
          <label class="field__label">الهاتف</label>
          <input class="input" id="centerPhone" value="${escapeHTML(s.phone || "")}" placeholder="01xxxxxxxxx">
        </div>
        <div class="field">
          <label class="field__label">واتساب (لو مختلف عن الهاتف)</label>
          <input class="input" id="centerWhatsapp" value="${escapeHTML(s.whatsapp || "")}" placeholder="01xxxxxxxxx">
        </div>
        <div class="field">
          <label class="field__label">العنوان</label>
          <input class="input" id="centerAddress" value="${escapeHTML(s.address || "")}" placeholder="الفيوم، مصر">
        </div>
        <div class="field">
          <label class="field__label">العملة</label>
          <input class="input" id="centerCurrency" value="${escapeHTML(s.currency || "ج.م")}">
        </div>
      </div>
      <div class="field__hint" style="margin-top:6px;">كل ده هتعدّله في أي وقت من الإعدادات → بيانات السنتر.</div>
    </div>`;
}

/* ---- الخطوة 3: العام الدراسي ---- */
function renderYear() {
  const years = getAcademicYears();
  const year = years[0] || null;
  const terms = year ? getTerms().filter((t) => t.yearId === year.id).sort((a, b) => a.order - b.order) : [];
  return `
    <div style="padding:6px 6px 2px;">
      <div class="page__subtitle" style="font-size:14px; font-weight:800; margin-bottom:16px;">خطوة 2 من 4 — العام الدراسي</div>
      <div class="field">
        <label class="field__label">اسم العام الدراسي</label>
        <input class="input" id="yearName" value="${escapeHTML(year?.name || "")}" placeholder="مثال: 2026 — 2027">
      </div>
      ${terms.length
        ? terms.map((t, i) => `
          <div style="margin-top:14px; border-top:1px dashed var(--border); padding-top:14px;">
            <div class="field__label" style="margin-bottom:10px;">${escapeHTML(t.name)}</div>
            <div class="form-grid">
              <div class="field">
                <label class="field__label">اسم الترم</label>
                <input class="input" id="termName_${i}" value="${escapeHTML(t.name)}">
              </div>
              <div class="field">
                <label class="field__label">البداية</label>
                <input class="input" type="date" id="termStart_${i}" value="${escapeHTML(t.startDate || "")}">
              </div>
              <div class="field">
                <label class="field__label">النهاية</label>
                <input class="input" type="date" id="termEnd_${i}" value="${escapeHTML(t.endDate || "")}">
              </div>
            </div>
          </div>`).join("")
        : `<div class="field__hint" style="margin-top:14px;">لا توجد أترام لهذه السنة — هتضيفها من الإعدادات → الهيكل الأكاديمي.</div>`}
      <div class="field__hint" style="margin-top:6px;">الصفوف الدراسية (الصف الأول الإعدادي...) موجودة جاهزة وبتتعدل من الإعدادات → السنوات الدراسية.</div>
    </div>`;
}

/* ---- الخطوة 4: المجموعات ---- */
function renderGroups() {
  const groups = getGroups();
  const grades = getGrades();
  const defaultGradeId = grades[0]?.id || "";
  return `
    <div style="padding:6px 6px 2px;">
      <div class="page__subtitle" style="font-size:14px; font-weight:800; margin-bottom:16px;">خطوة 3 من 4 — المجموعات</div>
      <form id="groupQuickForm">
        <div class="form-grid">
          <div class="field">
            <label class="field__label">السنة الدراسية</label>
            <select class="select" id="gGrade">
              ${grades.map((g) => `<option value="${g.id}" ${g.id === defaultGradeId ? "selected" : ""}>${escapeHTML(g.name)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label class="field__label">كود المجموعة</label>
            <input class="input" id="gCode" value="${escapeHTML(suggestGroupCode(grades, groups, defaultGradeId))}">
          </div>
        </div>
        <div class="field">
          <label class="field__label">اسم المجموعة</label>
          <input class="input" id="gName" placeholder="مثال: مجموعة السبت 5م">
        </div>
        <div class="field">
          <label class="field__label">أيام الحصة (اختيار أكثر من يوم)</label>
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(90px,1fr)); gap:8px; margin-top:6px;">
            ${WEEKDAY_OPTIONS.map((w) => `
              <label style="display:flex; align-items:center; gap:6px; font-size:13.5px; font-weight:600; cursor:pointer;">
                <input type="checkbox" id="gday_${w.key}" style="width:16px;height:16px;">
                ${w.ar}
              </label>`).join("")}
          </div>
        </div>
        <div class="form-grid">
          <div class="field">
            <label class="field__label">وقت البداية</label>
            <input class="input" type="time" id="gTime" value="17:00">
          </div>
          <div class="field">
            <label class="field__label">المدة (دقيقة)</label>
            <input class="input" type="number" id="gDuration" min="15" step="15" value="90">
          </div>
          <div class="field">
            <label class="field__label">السعة</label>
            <input class="input" type="number" id="gCapacity" min="1" value="20">
          </div>
          <div class="field">
            <label class="field__label">سعر الحصة (ج.م)</label>
            <input class="input" type="number" id="gSessionPrice" min="0" value="50">
          </div>
        </div>
        <button type="submit" class="btn btn-primary">${icons.plus} إضافة المجموعة</button>
      </form>

      ${groups.length ? `
        <div style="margin-top:18px; border-top:1px dashed var(--border); padding-top:14px;">
          <div class="field__label">المجموعات المضافة (${groups.length})</div>
          <div style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">
            ${groups.map((g) => `
              <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:11px 14px; background:var(--bg-secondary, #f1f5f9); border:1px solid var(--border); border-radius:12px;">
                <div style="min-width:0;">
                  <div style="font-weight:800; font-size:14px;">${escapeHTML(g.name)} <span style="color:var(--muted); font-size:12px;">(كود ${escapeHTML(g.code)})</span></div>
                  <div style="color:var(--muted); font-size:12.5px; margin-top:3px;">${escapeHTML(gradeName(grades, g.gradeId))} · ${escapeHTML(formatDaysAr(g.days))} ${escapeHTML(formatTimeAr(g.time))} · ${escapeHTML(String(g.sessionPrice ?? 0))} ج.م</div>
                </div>
                <button type="button" class="btn btn-ghost btn-sm" data-del-group="${escapeHTML(g.id)}" style="color:var(--danger, #dc2626);">${icons.trash}</button>
              </div>`).join("")}
          </div>
        </div>` : ""}
      <div class="field__hint" style="margin-top:10px;">تابع إضافة المجموعات، أو تدوس "التالي" وتضيفها لاحقًا من الإعدادات → المجموعات.</div>
    </div>`;
}

/* ---- الخطوة 5: استيراد الطلاب ---- */
function renderImport() {
  const students = getStudents().length;
  return `
    <div style="padding:6px 6px 2px; text-align:center;">
      <div class="page__subtitle" style="font-size:14px; font-weight:800; margin-bottom:18px;">خطوة 4 من 4 — استيراد الطلاب</div>
      ${students ? `
        <div style="font-size:18px; font-weight:800; color:var(--success); margin-bottom:6px;">تم استيراد ${students} طالب ✓</div>
        <div style="color:var(--muted); font-size:13px; margin-bottom:18px;">تقدر تضيف المزيد أو تنتقل للتالي.</div>` : `
        <div style="font-size:18px; font-weight:800; margin-bottom:6px;">المشروع فاضي — استورد طلابك دلوقتي</div>
        <div style="color:var(--muted); font-size:13px; max-width:470px; margin:0 auto 20px; line-height:1.8;">
          جهّز ملف إكسل ببيانات الطلاب (كود، اسم، رقم ولي الأمر...) وارفعه هنا — النظام هيربط الأعمدة
          بالحقول تلقائيًا، أو جرّب اللصق المباشر. ولو مش هتستورد دلوقتي سيبها وقول "التالي".
        </div>`}
      <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
        <button class="btn btn-primary" id="importExcelBtn">${icons.download} ${students ? "استيراد المزيد" : "استيراد الطلاب من ملف إكسل"}</button>
        <button class="btn btn-outline" id="importLaterBtn">أضيفهم لاحقًا</button>
      </div>
    </div>`;
}

/* ---- الخطوة 6: تم ---- */
function renderDone() {
  const s = getSettings();
  const students = getStudents().length;
  const groups = getGroups().length;
  const year = getAcademicYears()[0];
  return `
    <div style="padding:6px 6px 2px; text-align:center;">
      <div style="font-size:52px; margin-bottom:10px;">🎉</div>
      <div style="font-size:22px; font-weight:800; margin-bottom:4px;">تم تجهيز سنترك!</div>
      <div style="color:var(--muted); font-size:13.5px; margin-bottom:22px;">دلوقتي تقدر تدخل لوحة التحكم وتبدأ الشغل فورًا.</div>
      <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:10px; max-width:520px; margin:0 auto 24px;">
        ${[
          ["🏫", "بيانات السنتر", s.centerName || "-"],
          ["📅", "العام الدراسي", year?.name || "-"],
          ["👥", "المجموعات", `${groups} مجموعة`],
          ["🎓", "الطلاب", `${students} طالب`],
        ].map(([ic, label, val]) => `
          <div style="background:var(--bg-secondary, #f1f5f9); border:1px solid var(--border); border-radius:14px; padding:14px; text-align:right;">
            <div style="font-size:20px; margin-bottom:6px;">${ic}</div>
            <div style="font-size:11.5px; color:var(--muted); font-weight:700;">${label}</div>
            <div style="font-size:14px; font-weight:800; margin-top:2px;">${escapeHTML(String(val))}</div>
          </div>`).join("")}
      </div>
      <button class="btn btn-primary" id="finishBtn" style="font-size:15px; padding:12px 30px;">${icons.check} إنهاء والدخول للوحة التحكم</button>
    </div>`;
}

/* ---- ربط أحداث كل خطوة ---- */
function bindStepEvents() {
  if (step === 3) bindGroupsStep();
  if (step === 4) bindImportStep();
  if (step === 5) {
    document.getElementById("finishBtn")?.addEventListener("click", finishWizard);
  }
}

/* ---- الحفظ والتقدم ---- */
async function handleNext() {
  const ok = await collectStep();
  if (!ok) return;
  step++;
  render();
}

async function collectStep() {
  if (step === 0) return true;
  if (step === 1) return collectCenter();
  if (step === 2) return collectYear();
  return true; // المجموعات والاستيراد بيتحفظوا فورًا بأزرارهم
}

function collectCenter() {
  const centerName = document.getElementById("centerName")?.value.trim();
  if (!centerName) {
    toast("برجاء إدخال اسم السنتر", "warning");
    return false;
  }
  const phone = document.getElementById("centerPhone")?.value.trim() || "";
  const whatsapp = document.getElementById("centerWhatsapp")?.value.trim() || "";
  const address = document.getElementById("centerAddress")?.value.trim() || "";
  const currency = document.getElementById("centerCurrency")?.value.trim() || "ج.م";
  saveSettings({ ...getSettings(), centerName, phone, whatsapp, address, currency });
  toast("تم حفظ بيانات السنتر ✓", "success");
  return true;
}

function collectYear() {
  const yearName = document.getElementById("yearName")?.value.trim();
  if (!yearName) {
    toast("برجاء إدخال اسم العام الدراسي", "warning");
    return false;
  }
  const years = getAcademicYears();
  const year = years[0] || null;
  if (year) {
    year.name = yearName;
    saveAcademicYears(years);
  } else {
    saveAcademicYears([{ id: generateId("AY"), name: yearName, isCurrent: true }]);
  }
  const terms = year ? getTerms().filter((t) => t.yearId === year.id).sort((a, b) => a.order - b.order) : [];
  if (terms.length) {
    terms.forEach((t, i) => {
      t.name = document.getElementById(`termName_${i}`)?.value.trim() || t.name;
      t.startDate = document.getElementById(`termStart_${i}`)?.value || t.startDate;
      t.endDate = document.getElementById(`termEnd_${i}`)?.value || t.endDate;
    });
    saveTerms(getTerms());
  }
  toast("تم حفظ العام الدراسي ✓", "success");
  return true;
}

/* ---- المجموعات ---- */
function bindGroupsStep() {
  document.getElementById("groupQuickForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    addQuickGroup();
  });
  content.querySelectorAll("[data-del-group]").forEach((btn) => {
    btn.addEventListener("click", () => removeGroup(btn.dataset.delGroup));
  });
}

function addQuickGroup() {
  const gradeId = document.getElementById("gGrade")?.value;
  const name = document.getElementById("gName")?.value.trim();
  const code = document.getElementById("gCode")?.value.trim();
  const time = document.getElementById("gTime")?.value;

  if (!gradeId) return toast("اختر السنة الدراسية", "warning");
  if (!name) return toast("برجاء إدخال اسم المجموعة", "warning");
  if (!code) return toast("برجاء إدخال كود المجموعة", "warning");
  if (!time) return toast("برجاء تحديد وقت الحصة", "warning");

  const days = WEEKDAY_OPTIONS.filter((w) => document.getElementById(`gday_${w.key}`)?.checked).map((w) => w.ar);
  if (!days.length) return toast("اختر يوم واحد على الأقل للحصة", "warning");

  const groups = getGroups();
  if (groups.some((g) => g.code === code)) {
    toast(`يوجد مجموعة بنفس الكود ${code}`, "danger");
    return;
  }

  groups.push({
    id: generateId("GRP"),
    gradeId,
    name,
    code,
    days,
    time,
    duration: Number(document.getElementById("gDuration")?.value) || 90,
    capacity: Number(document.getElementById("gCapacity")?.value) || 20,
    sessionPrice: Number(document.getElementById("gSessionPrice")?.value) || 0,
  });
  saveGroups(groups);
  toast(`تم إضافة المجموعة "${name}" ✓`, "success");
  render();
}

async function removeGroup(id) {
  const groups = getGroups();
  const g = groups.find((x) => x.id === id);
  if (!g) return;
  if (getStudents().some((s) => s.groupId === id)) {
    toast("لا يمكن حذف المجموعة لأنها تحتوي على طلاب — انقلهم أولًا", "danger");
    return;
  }
  const ok = await confirmDialog({
    title: "حذف المجموعة",
    body: `هل تريد حذف <strong>${escapeHTML(g.name)}</strong>؟`,
    confirmText: "حذف",
    tone: "danger",
  });
  if (!ok) return;
  saveGroups(groups.filter((x) => x.id !== id));
  toast("تم حذف المجموعة", "success");
  render();
}

/* ---- استيراد الطلاب ---- */
function bindImportStep() {
  document.getElementById("importExcelBtn")?.addEventListener("click", openImportModal);
  document.getElementById("importLaterBtn")?.addEventListener("click", () => {
    step++;
    render();
  });
}

function openImportModal() {
  import("./bulk-import.js").then((m) => m.openBulkImportModal());
  // لما المستخدم يقفل نافذة الاستيراد نحدّث عدد الطلاب تلقائيًا
  const observer = new MutationObserver(() => {
    if (!document.getElementById("bulkImportOverlay")) {
      observer.disconnect();
      render();
    }
  });
  observer.observe(document.body, { childList: true, subtree: false });
}

/* ---- التخطي والإنهاء ---- */
async function handleSkip() {
  const ok = await confirmDialog({
    title: "تخطي معالج الإعداد",
    body: "تقدر تكمل الإعداد في أي وقت من الإعدادات → معالج الإعداد الأول. هل تريد التخطي الآن؟",
    confirmText: "تخطي",
    cancelText: "رجوع",
    tone: "warning",
  });
  if (!ok) return;
  await finishWizard(false);
}

async function finishWizard(notify = true) {
  markSetupDone();
  await flushPendingWrites();
  if (notify) toast("تم الإعداد الأول — أهلًا بك في لوحة التحكم 🎉", "success");
  window.location.href = appPath("staff/dashboard.html");
}
