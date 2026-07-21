// =========================================================
// Storage — طبقة حفظ البيانات (IndexedDB) + تحميل بيانات Mock
//
// كل البيانات بتتحمّل مرة واحدة فى الذاكرة (cache) عند بداية التطبيق من
// IndexedDB (تخزين محلى ضخم بلا الحد الصغير اللى كان موجود فى LocalStorage
// ~5-10 ميجا بايت بس). كل دوال القراءة/الكتابة (getStudents, saveStudents...)
// فضلت متزامنة (Synchronous) تمامًا زي ما كانت — مفيش أى تعديل مطلوب فى أى
// صفحة تانية فى المشروع، لأن التحميل الأولى بيحصل مرة واحدة قبل أي صفحة
// تعرض نفسها (عن طريق seedIfNeeded اللى كل صفحة بتستناها فى البداية).
// =========================================================

import { idbGet, idbGetAll, idbSet, idbDelete, idbClear } from "./idb.js";

const KEYS = {
  students: "center_students",
  grades: "center_grades",
  groups: "center_groups",
  studentStatuses: "center_student_statuses",
  attendance: "center_attendance",
  payments: "center_payments",
  exams: "center_exams",
  settings: "center_settings",
  session: "center_session",
  sessionLogs: "center_session_logs",
  extraCharges: "center_extra_charges",
  seeded: "center_seeded_v6",
};

const MOCK_BASE = "assets/mock/";

let cache = {};
let cacheLoaded = false;
let loadingPromise = null;
const pendingWrites = new Set();

/** يتتبّع أى كتابة لسه شغالة فى الخلفية، عشان نقدر نستناها قبل أى تنقّل بين الصفحات */
function trackWrite(promise) {
  pendingWrites.add(promise);
  promise.finally(() => pendingWrites.delete(promise));
  return promise;
}

/** يستنى كل الكتابات اللى لسه شغالة فى الخلفية — لازم تتنادى قبل أى window.location.href
 * عشان نضمن إن البيانات اتحفظت فعلًا فى IndexedDB قبل ما نغادر الصفحة (تجنبًا لأى Race Condition) */
export async function flushPendingWrites() {
  await Promise.all(Array.from(pendingWrites));
}

/** يحمّل كل البيانات من IndexedDB للذاكرة مرة واحدة بس، مع ترحيل تلقائى لأى نسخة قديمة من LocalStorage لو موجودة */
function ensureCacheLoaded() {
  if (cacheLoaded) return Promise.resolve();
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      cache = (await idbGetAll()) || {};
    } catch (e) {
      console.error("تعذر تحميل البيانات من IndexedDB:", e);
      cache = {};
    }

    // ترحيل تلقائى (Best-effort) لأى بيانات قديمة كانت محفوظة فى LocalStorage من نسخة سابقة من النظام
    try {
      Object.values(KEYS).forEach((key) => {
        if (cache[key] === undefined) {
          const raw = localStorage.getItem(key);
          if (raw !== null) {
            const parsed = JSON.parse(raw);
            cache[key] = parsed;
            idbSet(key, parsed).catch(() => {});
          }
        }
      });
    } catch (e) {
      // الترحيل اختيارى ومش حرج لو فشل — بنكمل عادى ببيانات فاضية وهتتزرع من الملفات الأصلية
    }

    cacheLoaded = true;
  })();

  return loadingPromise;
}

function readJSON(key, fallback) {
  const value = cache[key];
  return value !== undefined && value !== null ? value : fallback;
}

function writeJSON(key, value) {
  cache[key] = value;
  trackWrite(idbSet(key, value).catch((e) => console.error("IndexedDB write error:", key, e)));
  return true;
}

/** يستبدل التواريخ الوهمية (اليوم / أمس) بتواريخ حقيقية عند التحميل الأول */
function resolvePlaceholders(list) {
  const today = new Date().toISOString().slice(0, 10);
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yesterday = y.toISOString().slice(0, 10);
  return JSON.parse(
    JSON.stringify(list)
      .replaceAll("__TODAY__", today)
      .replaceAll("__YESTERDAY__", yesterday)
  );
}

async function fetchMock(file) {
  const res = await fetch(MOCK_BASE + file, { cache: "no-store" });
  if (!res.ok) throw new Error(`تعذر تحميل ${file}`);
  return res.json();
}

/** تهيئة البيانات لأول مرة فقط من ملفات mock إلى IndexedDB */
export async function seedIfNeeded() {
  await ensureCacheLoaded();
  if (readJSON(KEYS.seeded, false) === true) return;

  try {
    const [students, grades, groups, studentStatuses, attendance, payments, exams, settings] = await Promise.all([
      fetchMock("students.json"),
      fetchMock("grades.json"),
      fetchMock("groups.json"),
      fetchMock("studentStatuses.json"),
      fetchMock("attendance.json"),
      fetchMock("payments.json"),
      fetchMock("exams.json"),
      fetchMock("settings.json"),
    ]);

    writeJSON(KEYS.students, students);
    writeJSON(KEYS.grades, grades);
    writeJSON(KEYS.groups, groups);
    writeJSON(KEYS.studentStatuses, studentStatuses);
    writeJSON(KEYS.attendance, resolvePlaceholders(attendance));
    writeJSON(KEYS.payments, resolvePlaceholders(payments));
    writeJSON(KEYS.exams, resolvePlaceholders(exams));
    writeJSON(KEYS.settings, settings);
    writeJSON(KEYS.seeded, true);
  } catch (e) {
    console.error("فشل تحميل بيانات Mock — تأكد من تشغيل المشروع عبر خادم محلى وليس file://", e);
  }
}

/* ---------------- Students ---------------- */
export const getStudents = () => readJSON(KEYS.students, []);
export const saveStudents = (list) => writeJSON(KEYS.students, list);

/* ---------------- Grades (السنوات الدراسية) ---------------- */
export const getGrades = () => readJSON(KEYS.grades, []);
export const saveGrades = (list) => writeJSON(KEYS.grades, list);

/* ---------------- Groups ---------------- */
export const getGroups = () => readJSON(KEYS.groups, []);
export const saveGroups = (list) => writeJSON(KEYS.groups, list);

/* ---------------- Student Statuses (حالات الطالب) ---------------- */
export const getStudentStatuses = () => readJSON(KEYS.studentStatuses, []);
export const saveStudentStatuses = (list) => writeJSON(KEYS.studentStatuses, list);

/* ---------------- Session Logs (سجل فتح الحصص) ---------------- */
export const getSessionLogs = () => readJSON(KEYS.sessionLogs, []);
export const saveSessionLogs = (list) => writeJSON(KEYS.sessionLogs, list);

/* ---------------- Extra Charges (استحقاقات مالية باسم محدد، خارج سعر الحصة) ---------------- */
export const getExtraCharges = () => readJSON(KEYS.extraCharges, []);
export const saveExtraCharges = (list) => writeJSON(KEYS.extraCharges, list);

/** يسجل فتح حصة جديدة (مجموعة + تاريخ) إن لم تكن مسجلة بالفعل لنفس اليوم */
export function logSessionOpen(groupId, date, openedBy) {
  const logs = getSessionLogs();
  const exists = logs.find((l) => l.groupId === groupId && l.date === date);
  if (exists) return exists;
  const entry = { id: `SES-${Date.now()}`, groupId, date, openedBy, openedAt: Date.now() };
  logs.push(entry);
  saveSessionLogs(logs);
  return entry;
}

/* ---------------- Attendance ---------------- */
export const getAttendance = () => readJSON(KEYS.attendance, []);
export const saveAttendance = (list) => writeJSON(KEYS.attendance, list);

/* ---------------- Payments ---------------- */
export const getPayments = () => readJSON(KEYS.payments, []);
export const savePayments = (list) => writeJSON(KEYS.payments, list);

/* ---------------- Exams ---------------- */
export const getExams = () => readJSON(KEYS.exams, []);
export const saveExams = (list) => writeJSON(KEYS.exams, list);

/* ---------------- Settings ---------------- */
export const getSettings = () => readJSON(KEYS.settings, {});
export const saveSettings = (obj) => writeJSON(KEYS.settings, obj);

/* ---------------- Session / Auth ---------------- */
export function getSession() {
  return readJSON(KEYS.session, null);
}

export function login(username, password) {
  const settings = getSettings();
  const user = (settings.users || []).find(
    (u) => u.username === username && u.password === password
  );
  if (!user) return null;
  const session = {
    username: user.username,
    name: user.name,
    role: user.role || "assistant",
    permissions: user.permissions || [],
    loggedInAt: Date.now(),
  };
  writeJSON(KEYS.session, session);
  return session;
}

export function logout() {
  cache[KEYS.session] = null;
  trackWrite(idbDelete(KEYS.session).catch(() => {}));
}

export function isLoggedIn() {
  return !!getSession();
}

/** إعادة ضبط كامل النظام لحالته الأولى (يستخدم فى الإعدادات) */
export async function resetAllData() {
  await idbClear();
  cache = {};
  cacheLoaded = false;
  try {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  } catch (e) {
    // تجاهل — مش حرج
  }
}
