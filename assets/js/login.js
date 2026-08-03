// =========================================================
// Login — منطق صفحة تسجيل الدخول
// =========================================================

import { seedIfNeeded, login, parentLogin, studentLogin, setParentPassword, MAX_PARENT_FAILS, MAX_STUDENT_FAILS, getSettings, getStudents, flushPendingWrites, isParentPortalEnabled, isStudentPortalEnabled, needsInitialSetup } from "./storage.js";
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
    fields: ["parentPhone", "parentSecret"],
    subtitle: "تسجيل الدخول لمتابعة أبنائك",
    hint: "أدخل رقم هاتف ولي الأمر المسجل + كود الدخول (أول مرة: كود التفعيل من السنتر)",
  },
  student: {
    label: "طالب",
    fields: ["studentUsername", "studentPassword"],
    subtitle: "دخول الطالب لمتابعة الدرجات والحضور",
    hint: "اسم المستخدم = كود الطالب + كلمة المرور من السنتر — للاختبار: 101 / 1234",
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
  updateHint(currentMode);

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
  updateHint(mode);

  // تصفير مسار "أول مرة — اختيار كلمة المرور" عند تغيير التبويب
  resetParentFlow();
}

function updateHint(mode) {
  if (mode === "parent") {
    const samples = sampleParentPhones();
    hint.textContent = samples.length
      ? `أدخل رقم الهاتف المسجل + كود الدخول — للاختبار: ${samples.join(" · ")}`
      : MODES.parent.hint;
  } else {
    hint.textContent = MODES[mode].hint;
  }
}

let pendingParentSession = null;

function resetParentFlow() {
  pendingParentSession = null;
  const wrap = document.getElementById("setPassWrap");
  if (wrap) wrap.style.display = "none";
  const secretField = document.getElementById("parentSecretField");
  if (secretField) secretField.style.display = "";
  loginBtn.style.display = "";
  const h = document.getElementById("parentHint");
  if (h) h.textContent = "أدخل رقم الهاتف المسجل + كود الدخول (أول مرة استخدم كود التفعيل اللي أرسله لك السنتر)";
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchMode(tab.dataset.role));
});

/* ---- Login ---- */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBox.classList.remove("is-open");

  if (pendingParentSession) {
    await handleSetParentPass();
    return;
  }

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
  const secret = document.getElementById("parentSecret").value.trim();

  if (!phone) {
    showError("برجاء إدخال رقم هاتف ولي الأمر");
    return;
  }
  if (!secret) {
    showError("برجاء إدخال كود الدخول — أول مرة استخدم كود التفعيل من السنتر");
    return;
  }

  // Normalize phone
  const normalized = phone.replace(/[\s\-\(\)]/g, "");

  setLoading(true);
  await fakeDelay(400);

  const result = await parentLogin(normalized, secret);
  setLoading(false);

  if (!result?.ok) {
    handleParentLoginFailure(result);
    return;
  }

  const { session, students } = result;

  // أول مرة ناجحة بكود التفعيل — إجبار ولي الأمر على اختيار كلمة مرور
  if (result.needsPassword) {
    showSetPasswordStep(session, students);
    return;
  }

  toast(students.length === 1
    ? `مرحبًا بعودتك ولي أمر ${students[0].name}`
    : `مرحبًا بعودتك، لديك ${students.length} أبناء مسجلين`, "success");
  finalizeLogin(session);
}

function handleParentLoginFailure(result) {
  const reason = result?.reason;

  if (reason === "locked") {
    const mins = Math.ceil((result.lockUntil - Date.now()) / 60000);
    const msg = `تم قفل الدخول مؤقتًا بعد عدة محاولات خاطئة — حاول بعد ${mins} دقيقة`;
    showError(msg);
    toast(msg, "danger");
    return;
  }

  if (reason === "no-auth") {
    const msg = "لم يتم تفعيل دخول ولي الأمر لهذا الرقم بعد — تواصل مع السنتر لاستلام كود التفعيل";
    showError(msg);
    toast(msg, "warning");
    return;
  }

  if (reason === "bad-secret") {
    let msg;
    if (result.locked) {
      const mins = Math.ceil((result.lockUntil - Date.now()) / 60000);
      msg = `كود الدخول غير صحيح — تم قفل الدخول، حاول بعد ${mins} دقيقة`;
    } else {
      msg = `كود الدخول غير صحيح — المحاولات المتبقية: ${Math.max(0, MAX_PARENT_FAILS - result.fails)}`;
    }
    showError(msg);
    toast(msg, "danger");
    return;
  }

  const samples = sampleParentPhones();
  const msg = samples.length
    ? `لم يتم العثور على ولي أمر بهذا الرقم — الرقم لازم يكون المسجل في بيانات الطالب. للاختبار جرّب: ${samples.join("، ")}`
    : "لم يتم العثور على طالب بهذا الرقم";
  showError(msg);
  toast(msg, "warning");
}

function showSetPasswordStep(session, students) {
  pendingParentSession = session;
  document.getElementById("setPassWrap").style.display = "block";
  loginBtn.style.display = "none";
  document.getElementById("parentSecretField").style.display = "none";
  const hintEl = document.getElementById("parentHint");
  hintEl.textContent = `أهلًا ولي أمر ${students[0].name} — لأول مرة فقط، اختر كلمة مرور خاصة بيك هتستخدمها في الدخول من دلوقتي.`;
  errorBox.classList.remove("is-open");
  document.getElementById("newParentPass").focus();
}

async function handleSetParentPass() {
  if (!pendingParentSession) return;
  const pass = document.getElementById("newParentPass").value.trim();
  if (!pass || pass.length < 4 || pass.length > 8) {
    showError("كلمة المرور لازم تكون من 4 إلى 8 أرقام");
    return;
  }

  setLoading(true);
  await fakeDelay(300);
  const ok = await setParentPassword(pendingParentSession.parentPhone, pass);
  setLoading(false);

  if (!ok) {
    showError("تعذر حفظ كلمة المرور، حاول مرة أخرى");
    return;
  }

  toast("تم إنشاء كلمة المرور بنجاح — استخدمها من الآن للدخول", "success");
  finalizeLogin(pendingParentSession);
}

document.getElementById("setPassBtn").addEventListener("click", handleSetParentPass);

async function handleStudentLogin() {
  const username = document.getElementById("studentUsername").value.trim();
  const password = document.getElementById("studentPassword").value.trim();

  if (!username || !password) {
    showError("برجاء إدخال اسم المستخدم وكلمة المرور");
    return;
  }

  setLoading(true);
  await fakeDelay(400);

  const result = await studentLogin(username, password);
  setLoading(false);

  if (!result?.ok) {
    handleStudentLoginFailure(result);
    return;
  }

  const { session, students } = result;
  toast(`مرحبًا بعودتك، ${students[0].name}`, "success");
  finalizeLogin(session);
}

function handleStudentLoginFailure(result) {
  const reason = result?.reason;

  if (reason === "locked") {
    const mins = Math.ceil((result.lockUntil - Date.now()) / 60000);
    const msg = `تم قفل الدخول مؤقتًا بعد عدة محاولات خاطئة — حاول بعد ${mins} دقيقة`;
    showError(msg);
    toast(msg, "danger");
    return;
  }

  if (reason === "no-auth") {
    const msg = "لم يتم تفعيل دخول الطالب بعد — تواصل مع السنتر لاستلام كلمة المرور";
    showError(msg);
    toast(msg, "warning");
    return;
  }

  if (reason === "bad-secret") {
    let msg;
    if (result.locked) {
      const mins = Math.ceil((result.lockUntil - Date.now()) / 60000);
      msg = `كلمة المرور غير صحيحة — تم قفل الدخول، حاول بعد ${mins} دقيقة`;
    } else {
      msg = `كلمة المرور غير صحيحة — المحاولات المتبقية: ${Math.max(0, MAX_STUDENT_FAILS - result.fails)}`;
    }
    showError(msg);
    toast(msg, "danger");
    return;
  }

  const msg = "لم يتم العثور على حساب طالب بهذا الاسم — اسم المستخدم = كود الطالب (مثال: 101)";
  showError(msg);
  toast(msg, "warning");
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
  const passBtn = document.getElementById("setPassBtn");
  if (passBtn) {
    passBtn.disabled = on;
    passBtn.innerHTML = on ? `<span class="spinner"></span>` : "حفظ كلمة المرور والدخول";
  }
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
  if (session?.role === "admin" && needsInitialSetup()) return appPath("staff/setup.html");
  return appPath("staff/dashboard.html");
}

bootstrap();
