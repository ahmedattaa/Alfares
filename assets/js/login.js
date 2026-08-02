// =========================================================
// Login — منطق صفحة تسجيل الدخول
// =========================================================

import { seedIfNeeded, login, parentLogin, studentLogin, getSettings, getStudents, flushPendingWrites, isParentPortalEnabled, isStudentPortalEnabled } from "./storage.js";
import { redirectIfLoggedIn } from "./app.js";
import { toast } from "./ui.js";
import { initials, fakeDelay } from "./helpers.js";
import { applyCurrentTheme } from "./themes.js";
import { appPath } from "./paths.js";

/* ---- Modes ---- */
const MODES = {
  admin: {
    label: "إدارة",
    fields: ["username", "password"],
    subtitle: "تسجيل الدخول للوحة التحكم",
    hint: "بيانات تجريبية: admin / 1234",
  },
  parent: {
    label: "ولي أمر",
    fields: ["parentPhone"],
    subtitle: "تسجيل الدخول لمتابعة أبنائك",
    hint: "أدخل رقم هاتف ولي الأمر المسجل في بيانات الطالب",
  },
  student: {
    label: "طالب",
    fields: ["studentCode"],
    subtitle: "دخول الطالب لمتابعة الدرجات والحضور",
    hint: "أدخل كود الطالب المسجل في السنتر — للاختبار: 101",
  },
};

let currentMode = "admin";

/* ---- Refs ---- */
const form = document.getElementById("loginForm");
const errorBox = document.getElementById("authError");
const subtitle = document.getElementById("authSubtitle");
const loginBtn = document.getElementById("loginBtn");
const loginBtnText = document.getElementById("loginBtnText");
const hint = document.getElementById("authHint");
const tabs = document.querySelectorAll(".auth-tab");
const fieldGroups = document.querySelectorAll(".auth-fields");

/* ---- Bootstrap ---- */
async function bootstrap() {
  await seedIfNeeded();
  await redirectIfLoggedIn();

  const settings = getSettings();
  if (settings.centerName) {
    document.getElementById("authCenterName").textContent = settings.centerName;
    document.getElementById("authLogo").textContent = initials(settings.centerName);
  }

  // أرقام ولي أمر تجريبية جاهزة للاختبار (أول 3 طلاب مسجلين)
  if (currentMode === "parent" || MODES.parent) {
    const samples = sampleParentPhones();
    if (samples.length) {
      hint.textContent = `أدخل رقم هاتف ولي الأمر المسجل في بيانات الطالب — للاختبار: ${samples.join(" · ")}`;
    }
  }

  // بوابات الدخول حسب إعدادات السنتر
  const parentEnabled = isParentPortalEnabled();
  const parentTab = [...tabs].find((t) => t.dataset.role === "parent");
  if (!parentEnabled && parentTab) {
    parentTab.classList.add("is-disabled");
    parentTab.dataset.disabled = "true";
    if (currentMode === "parent") switchMode("admin");
  }

  const studentEnabled = isStudentPortalEnabled();
  const studentTab = [...tabs].find((t) => t.dataset.role === "student");
  if (!studentEnabled && studentTab) {
    studentTab.classList.add("is-disabled");
    studentTab.dataset.disabled = "true";
    if (currentMode === "student") switchMode("admin");
  }

  // دعم ?role= من الصفحة الرئيسية
  const requestedRole = new URLSearchParams(location.search).get("role");
  if (requestedRole && MODES[requestedRole] && !MODES[requestedRole].disabled) {
    const rTab = [...tabs].find((t) => t.dataset.role === requestedRole);
    const ok = !(rTab?.dataset.disabled === "true");
    if (ok) switchMode(requestedRole);
  }
}

/* ---- Tab switching ---- */
function switchMode(mode) {
  if (mode === currentMode) return;
  if (MODES[mode]?.disabled) return;
  const tab = [...tabs].find((t) => t.dataset.role === mode);
  if (tab?.dataset.disabled === "true") return;

  currentMode = mode;
  errorBox.classList.remove("is-open");

  // Update tabs
  tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.role === mode));

  // Show/hide field groups
  fieldGroups.forEach((g) => {
    g.style.display = g.dataset.mode === mode ? "" : "none";
  });

  // Update subtitle + hint
  subtitle.textContent = MODES[mode].subtitle;
  hint.textContent = MODES[mode].hint;

}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchMode(tab.dataset.role));
});

/* ---- Login ---- */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBox.classList.remove("is-open");

  if (currentMode === "admin") {
    await handleAdminLogin();
  } else if (currentMode === "parent") {
    await handleParentLogin();
  } else if (currentMode === "student") {
    await handleStudentLogin();
  }
});

async function handleAdminLogin() {
  await seedIfNeeded();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!username || !password) {
    showError("برجاء إدخال اسم المستخدم وكلمة المرور");
    return;
  }

  setLoading(true);
  await fakeDelay(400);

  const session = login(username, password);
  setLoading(false);

  if (!session) {
    showError("اسم المستخدم أو كلمة المرور غير صحيحة");
    toast("فشل تسجيل الدخول، برجاء التأكد من البيانات", "danger");
    return;
  }

  toast(`مرحبًا بعودتك، ${session.name}`, "success");
  finalizeLogin(session);
}

async function handleParentLogin() {
  const phone = document.getElementById("parentPhone").value.trim();

  if (!phone) {
    showError("برجاء إدخال رقم هاتف ولي الأمر");
    return;
  }

  // Normalize phone
  const normalized = phone.replace(/[\s\-\(\)]/g, "");

  setLoading(true);
  await fakeDelay(400);

  const result = parentLogin(normalized);
  setLoading(false);

  if (!result) {
    const samples = sampleParentPhones();
    const msg = samples.length
      ? `لم يتم العثور على ولي أمر بهذا الرقم — الرقم لازم يكون المسجل في بيانات الطالب. للاختبار جرّب: ${samples.join("، ")}`
      : "لم يتم العثور على طالب بهذا الرقم";
    showError(msg);
    toast(msg, "warning");
    return;
  }

  const { session, students } = result;

  toast(students.length === 1
    ? `مرحبًا بعودتك ولي أمر ${students[0].name}`
    : `مرحبًا بعودتك، لديك ${students.length} أبناء مسجلين`, "success");
  finalizeLogin(session);
}

async function handleStudentLogin() {
  const code = document.getElementById("studentCode").value.trim();

  if (!code) {
    showError("برجاء إدخال كود الطالب");
    return;
  }

  setLoading(true);
  await fakeDelay(400);

  const result = studentLogin(code);
  setLoading(false);

  if (!result) {
    showError("لم يتم العثور على طالب بهذا الكود");
    toast("لم يتم العثور على طالب بهذا الكود", "warning");
    return;
  }

  const { students } = result;
  toast(`مرحبًا بعودتك، ${students[0].name}`, "success");
  finalizeLogin(result.session);
}

/* ---- Helpers ---- */
function sampleParentPhones() {
  try {
    return [...new Set(getStudents().map((s) => s.parentPhone).filter(Boolean))].slice(0, 3);
  } catch (e) {
    return [];
  }
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.add("is-open");
}

function setLoading(on) {
  loginBtn.disabled = on;
  loginBtnText.innerHTML = on ? `<span class="spinner"></span>` : "تسجيل الدخول";
}

async function finalizeLogin(session, redirectUrl) {
  applyCurrentTheme();
  await fakeDelay(300);
  await flushPendingWrites();
  window.location.href = redirectUrl || portalTargetFor(session);
}

function portalTargetFor(session) {
  if (session?.role === "student") return appPath("student/");
  if (session?.role === "parent") return appPath("parent/");
  return appPath("staff/dashboard.html");
}

bootstrap();
