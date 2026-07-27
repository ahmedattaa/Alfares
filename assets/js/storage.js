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
import { generateId, todayISO } from "./helpers.js";

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
  walletTransactions: "center_wallet_transactions",
  followupLogs: "center_followup_logs",
  academicPeriods: "center_academic_periods",
  academicYears: "center_academic_years",
  terms: "center_terms",
  academicMonths: "center_academic_months",
  shifts: "center_shifts",
  ledger: "center_ledger",
  achievements: "center_achievements",
  escalationLogs: "center_escalation_logs",
  advancePermissions: "center_advance_permissions",
  termSnapshots: "center_term_snapshots",
  rolloverLogs: "center_rollover_logs",
  seeded: "center_seeded_v12",
};

const MOCK_BASE = "assets/mock/";

let cache = {};
let cacheLoaded = false;
let loadingPromise = null;
const pendingWrites = new Set();

// تزامن النوافذ: لما أى نافذة بتحفظ، النوافذ التانية بترجع تقرأ من IndexedDB
const _syncChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("center_storage_sync") : null;
if (_syncChannel) {
  _syncChannel.onmessage = () => { cache = {}; cacheLoaded = false; loadingPromise = null; };
}

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
  if (_syncChannel) _syncChannel.postMessage({ key, ts: Date.now() });
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
    const [students, grades, groups, studentStatuses, attendance, payments, exams, settings, academicPeriods, academicYears, terms, academicMonths] = await Promise.all([
      fetchMock("students.json"),
      fetchMock("grades.json"),
      fetchMock("groups.json"),
      fetchMock("studentStatuses.json"),
      fetchMock("attendance.json"),
      fetchMock("payments.json"),
      fetchMock("exams.json"),
      fetchMock("settings.json"),
      fetchMock("academicPeriods.json"),
      fetchMock("academicYears.json"),
      fetchMock("terms.json"),
      fetchMock("academicMonths.json"),
    ]);

    writeJSON(KEYS.students, students);
    writeJSON(KEYS.grades, grades);
    writeJSON(KEYS.groups, groups);
    writeJSON(KEYS.studentStatuses, studentStatuses);
    writeJSON(KEYS.attendance, resolvePlaceholders(attendance));
    writeJSON(KEYS.payments, resolvePlaceholders(payments));
    writeJSON(KEYS.exams, resolvePlaceholders(exams));
    writeJSON(KEYS.settings, settings);
    writeJSON(KEYS.academicPeriods, academicPeriods);
    writeJSON(KEYS.academicYears, academicYears);
    writeJSON(KEYS.terms, terms);
    writeJSON(KEYS.academicMonths, academicMonths);
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

/**
 * تطبيق الاستحقاقات المالية المعلقة على طالب جديد (أو طالب انتقل لمجموعة جديدة).
 * بتجيب كل الـ batches اللى ليها طلاب فى نفس المجموعة وبنفس الاسم والمبلغ،
 * وبتشوف لو الطالب ده ناقصه سجل ليها — لو ناقص بتسجله تلقائيًا.
 */
export function applyPendingCharges(studentId, groupId) {
  const charges = getExtraCharges();
  const students = getStudents();
  const groupStudents = students.filter((s) => s.groupId === groupId && s.id !== studentId);
  if (!groupStudents.length) return;

  // بناء خريطة: batchId → { name, amount, date } من طلاب المجموعة
  const batchMap = {};
  charges.forEach((c) => {
    if (groupStudents.some((s) => s.id === c.studentId) && c.batchId) {
      if (!batchMap[c.batchId]) batchMap[c.batchId] = { name: c.name, amount: c.amount, date: c.date };
    }
  });

  // بناء قائمة الـ batchIds اللى الطالب عنده فيها سجل
  const studentBatchIds = new Set(
    charges.filter((c) => c.studentId === studentId).map((c) => c.batchId)
  );

  let added = 0;
  Object.entries(batchMap).forEach(([batchId, info]) => {
    if (studentBatchIds.has(batchId)) return;
    charges.push({
      id: generateId("CHG"),
      batchId,
      studentId,
      name: info.name,
      amount: info.amount,
      date: info.date,
      status: "unpaid",
    });
    added++;
  });

  if (added > 0) saveExtraCharges(charges);
  return added;
}

/* ---------------- Wallet Transactions (سجل إيداعات المحفظة) ---------------- */
export const getWalletTransactions = () => readJSON(KEYS.walletTransactions, []);
export const saveWalletTransactions = (list) => writeJSON(KEYS.walletTransactions, list);

/**
 * خصم مبلغ من محفظة الطالب مع تسجيل الحركة في walletTransactions.
 * يُرجع المبلغ الفعلي المُخصَّم (قد يكون أقل لو الرصيد مش كفاية).
 */
export function deductFromWallet(studentId, amount, note = "خصم من المحفظة") {
  if (amount <= 0) return 0;
  const students = getStudents();
  const s = students.find((x) => x.id === studentId);
  if (!s) return 0;
  const actual = Math.min(amount, Number(s.walletBalance || 0));
  if (actual <= 0) return 0;
  s.walletBalance = Math.max(0, Number(s.walletBalance || 0) - actual);
  saveStudents(students);
  const txns = getWalletTransactions();
  const txnId = generateId("WLT");
  txns.push({
    id: txnId,
    studentId,
    groupId: s.groupId,
    amount: actual,
    type: "deduction",
    note,
    date: todayISO(),
  });
  saveWalletTransactions(txns);

  // تسجيل الخصم في دفتر الأستاذ (مش تحصيل نقدي — خصم من المحفظة)
  recordLedgerOnly(studentId, "wallet_payment", note, 0, actual, { referenceId: txnId, referenceType: "wallet" });

  return actual;
}

/**
 * إيداع مبلغ في محفظة الطالب.
 * يُغطّى المتأخرات (lateBalance) أولاً، والباقي يُضاف إلى walletBalance.
 * يُرجع ملخص العملية: { walletDeposit, debtCovered, newWalletBalance, newLateBalance }.
 */
export function addWalletDeposit(studentId, amount, note = "إيداع ولي أمر") {
  const students = getStudents();
  const student = students.find((s) => s.id === studentId);
  if (!student || amount <= 0) return null;

  const lateBalance = Number(student.lateBalance || 0);
  const walletBalance = Number(student.walletBalance || 0);

  // أول حاجة نغطّى المتأخرات
  const debtCovered = Math.min(lateBalance, amount);
  const remaining = amount - debtCovered;

  student.lateBalance = Math.max(0, lateBalance - debtCovered);
  student.walletBalance = walletBalance + remaining;

  // تسجيل المعاملة
  const txns = getWalletTransactions();
  const txnId = generateId("WLT");
  txns.push({
    id: txnId,
    studentId,
    groupId: student.groupId,
    amount,
    debtCovered,
    walletAdded: remaining,
    note,
    date: todayISO(),
  });
  saveWalletTransactions(txns);
  saveStudents(students);

  // تسجيل الإيداع النقدي في الوردية + دفتر الأستاذ
  recordCashCollection(studentId, amount, "wallet_deposit", note, { referenceId: txnId, referenceType: "wallet" });

  return {
    walletDeposit: remaining,
    debtCovered,
    newWalletBalance: student.walletBalance,
    newLateBalance: student.lateBalance,
  };
}

/** يسجل فتح حصة جديدة (مجموعة + تاريخ) إن لم تكن مسجلة بالفعل لنفس اليوم */
export function logSessionOpen(groupId, date, openedBy) {
  const logs = getSessionLogs();
  const exists = logs.find((l) => l.groupId === groupId && l.date === date);
  if (exists) return exists;
  const entry = { id: `SES-${Date.now()}`, groupId, date, openedBy, openedAt: Date.now(), closed: false };
  logs.push(entry);
  saveSessionLogs(logs);
  return entry;
}

/** يقفل حصة مفتوحة يدويًا (بعد ما المدرس يخلّص تسجيلها) */
export function closeSession(groupId, date, closedBy) {
  const logs = getSessionLogs();
  const entry = logs.find((l) => l.groupId === groupId && l.date === date);
  if (entry) {
    entry.closed = true;
    entry.closedBy = closedBy;
    entry.closedAt = Date.now();
    saveSessionLogs(logs);
  }
  return entry;
}

/* ---------------- Attendance ---------------- */
export const getAttendance = () => readJSON(KEYS.attendance, []);
export const saveAttendance = (list) => writeJSON(KEYS.attendance, list);

/* ---------------- Payments ---------------- */
export const getPayments = () => readJSON(KEYS.payments, []).filter((p) => !p.isVoided);
export const getAllPayments = () => readJSON(KEYS.payments, []);
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

/* ---------------- Followup Logs (سجل ملاحظات المتابعة) ---------------- */
export const getFollowupLogs = () => readJSON(KEYS.followupLogs, []);
export const saveFollowupLogs = (list) => writeJSON(KEYS.followupLogs, list);

/**
 * إضافة ملاحظة متابعة لطالب.
 * @returns السجل الجديد
 */
export function addFollowupLog(studentId, text, options = {}) {
  const logs = getFollowupLogs();
  const entry = {
    id: generateId("FUL"),
    studentId,
    text,
    date: options.date || todayISO(),
    time: options.time || new Date().toTimeString().slice(0, 5),
    writtenBy: options.writtenBy || "السكرتارية",
  };
  logs.push(entry);
  saveFollowupLogs(logs);
  return entry;
}

/**
 * آخر ملاحظة متابعة لطالب معين.
 * @returns السجل الأحدث أو null
 */
export function getLastFollowupLog(studentId) {
  const logs = getFollowupLogs().filter((l) => l.studentId === studentId);
  return logs.length ? logs[logs.length - 1] : null;
}

/* ---------------- Academic Periods (الأترام والشهور الأكاديمية) ---------------- */
export const getAcademicPeriods = () => readJSON(KEYS.academicPeriods, []);
export const saveAcademicPeriods = (list) => writeJSON(KEYS.academicPeriods, list);

/**
 * يبحث عن الشهر الأكاديمى الذى يقع فيه تاريخ معين.
 * يُرجع كائن الشهر ( مع termId و yearId و termName و yearName) أو null.
 * الشهر يُعتبر "مطابق" لو التاريخ >= startDate && التاريخ <= endDate.
 */
export function findAcademicMonth(dateStr) {
  if (!dateStr) return null;
  const periods = getAcademicPeriods();
  for (const year of periods) {
    for (const term of (year.terms || [])) {
      for (const month of (term.months || [])) {
        if (dateStr >= month.startDate && dateStr <= month.endDate) {
          return { ...month, termId: term.id, termName: term.name, yearId: year.id, yearName: year.name };
        }
      }
    }
  }
  return null;
}

/**
 * يبحث عن الترم الذى يقع فيه تاريخ معين.
 * يُرجع كائن الترم (مع yearId و yearName) أو null.
 */
export function findAcademicTerm(dateStr) {
  if (!dateStr) return null;
  const periods = getAcademicPeriods();
  for (const year of periods) {
    for (const term of (year.terms || [])) {
      if (dateStr >= term.startDate && dateStr <= term.endDate) {
        return { ...term, yearId: year.id, yearName: year.name };
      }
    }
  }
  return null;
}

/**
 * يُرجع الترم النشط حالياً (اللى تاريخ اليوم مقعده فيه) أو null.
 */
export function getActiveTerm() {
  return findAcademicTerm(todayISO());
}

/**
 * يُرجع الشهر الأكاديمى النشط حالياً (اللى تاريخ اليوم مقعده فيه) أو null.
 */
export function getActiveMonth() {
  return findAcademicMonth(todayISO());
}

/**
 * يُرجع كل الأترام كمصفوفة مسطحة (مع yearName) لسهولة العرض فى القوائم المنسدلة.
 */
export function getAllTermsFlat() {
  const result = [];
  for (const year of getAcademicPeriods()) {
    for (const term of (year.terms || [])) {
      result.push({ ...term, yearId: year.id, yearName: year.name });
    }
  }
  return result;
}

/**
 * يُرجع كل الشهور كمصفوفة مسطحة (مع termName و yearName) لسهولة العرض.
 */
export function getAllMonthsFlat(termId) {
  const result = [];
  for (const year of getAcademicPeriods()) {
    for (const term of (year.terms || [])) {
      if (termId && term.id !== termId) continue;
      for (const month of (term.months || [])) {
        result.push({ ...month, termId: term.id, termName: term.name, yearId: year.id, yearName: year.name });
      }
    }
  }
  return result;
}

/* =================== الكيانات الجديدة (Normalized Schema) =================== */

/* ---- Academic Years (السنوات الأكاديمية) ---- */
export const getAcademicYears = () => readJSON(KEYS.academicYears, []);
export const saveAcademicYears = (list) => writeJSON(KEYS.academicYears, list);

/* ---- Terms (الأترام) ---- */
export const getTerms = () => readJSON(KEYS.terms, []);
export const saveTerms = (list) => writeJSON(KEYS.terms, list);

/* ---- Academic Months (الشهور الأكاديمية) ---- */
export const getAcademicMonths = () => readJSON(KEYS.academicMonths, []);
export const saveAcademicMonths = (list) => writeJSON(KEYS.academicMonths, list);

/* ---- Helper Functions ---- */

/** يُرجع السنة الأكاديمية النشطة (isCurrent === true) أو null */
export function getActiveAcademicYear() {
  return getAcademicYears().find((y) => y.isCurrent) || null;
}

/** يُرجع الترم النشط حالياً (تاريخ اليوم مقعده بين startDate و endDate) أو null */
export function getActiveAcademicTerm() {
  const today = todayISO();
  const years = getAcademicYears();
  const terms = getTerms();
  for (const term of terms) {
    if (today >= term.startDate && today <= term.endDate) {
      const year = years.find((y) => y.id === term.yearId);
      return { ...term, yearName: year?.name || "" };
    }
  }
  return null;
}

/** يُرجع الشهر الأكاديمى النشط حالياً (تاريخ اليوم مقعده بين startDate و endDate) أو null */
export function getActiveAcademicMonth() {
  const today = todayISO();
  const months = getAcademicMonths();
  const terms = getTerms();
  const years = getAcademicYears();
  for (const m of months) {
    if (today >= m.startDate && today <= m.endDate) {
      const term = terms.find((t) => t.id === m.termId);
      const year = years.find((y) => y.id === term?.yearId);
      return { ...m, termId: term?.id, termName: term?.name, yearId: year?.id, yearName: year?.name };
    }
  }
  return null;
}

/** يبحث عن الشهر الأكاديمى الذى يقع فيه تاريخ معين */
export function findAcademicMonthById(dateStr) {
  if (!dateStr) return null;
  const months = getAcademicMonths();
  const terms = getTerms();
  const years = getAcademicYears();
  for (const m of months) {
    if (dateStr >= m.startDate && dateStr <= m.endDate) {
      const term = terms.find((t) => t.id === m.termId);
      const year = years.find((y) => y.id === term?.yearId);
      return { ...m, termId: term?.id, termName: term?.name, yearId: year?.id, yearName: year?.name };
    }
  }
  return null;
}

/** يبحث عن الترم الذى يقع فيه تاريخ معين */
export function findAcademicTermById(dateStr) {
  if (!dateStr) return null;
  const terms = getTerms();
  const years = getAcademicYears();
  for (const term of terms) {
    if (dateStr >= term.startDate && dateStr <= term.endDate) {
      const year = years.find((y) => y.id === term.yearId);
      return { ...term, yearName: year?.name || "" };
    }
  }
  return null;
}

/** يُرجع كل الأترام لسنة أكاديمية معينة مرتبة حسب order */
export function getTermsForYear(yearId) {
  return getTerms()
    .filter((t) => t.yearId === yearId)
    .sort((a, b) => a.order - b.order);
}

/** يُرجع كل الشهور لترم معين */
export function getMonthsForTerm(termId) {
  return getAcademicMonths().filter((m) => m.termId === termId);
}

/** يُرجع كل الأترام كمصفوفة مسطحة (مع yearName) لسهولة العرض فى القوائم المنسدلة */
export function getAllTermsFlatNew() {
  const years = getAcademicYears();
  return getTerms().map((t) => {
    const year = years.find((y) => y.id === t.yearId);
    return { ...t, yearName: year?.name || "" };
  });
}

/** يُرجع كل الشهور كمصفوفة مسطحة (مع termName و yearName) لسهولة العرض */
export function getAllMonthsFlatNew(termId) {
  const years = getAcademicYears();
  const terms = getTerms();
  return getAcademicMonths()
    .filter((m) => !termId || m.termId === termId)
    .map((m) => {
      const term = terms.find((t) => t.id === m.termId);
      const year = years.find((y) => y.id === term?.yearId);
      return { ...m, termId: term?.id, termName: term?.name, yearId: year?.id, yearName: year?.name };
    });
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

/* =========================================================
   SHIFT RECONCILIATION — تقفيل الوردية الأعمى
   ========================================================= */
export const getShifts = () => readJSON(KEYS.shifts, []);
export const saveShifts = (list) => writeJSON(KEYS.shifts, list);

/** يفتح وردية جديدة (يُرجع كائن الوردية) */
export function openShift(openingCash, openedBy) {
  const shifts = getShifts();
  const existing = shifts.find((s) => s.status === "open");
  if (existing) return existing;
  const shift = {
    id: generateId("SHF"),
    openedBy,
    openedAt: Date.now(),
    openedDate: todayISO(),
    openingCash: Number(openingCash) || 0,
    status: "open",
    collections: [],
  };
  shifts.push(shift);
  saveShifts(shifts);
  return shift;
}

/** يُرجع الوردية المفتوحة حالياً أو null */
export function getCurrentShift() {
  return getShifts().find((s) => s.status === "open") || null;
}

/** تسجيل تحصيل داخل الوردية المفتوحة */
export function recordShiftCollection(studentId, amount, type, note = "") {
  const shift = getCurrentShift();
  if (!shift || amount <= 0) return;
  shift.collections.push({
    id: generateId("COL"),
    studentId,
    amount: Number(amount),
    type, // "session" | "late" | "wallet_deposit" | "extra_charge"
    note,
    recordedAt: Date.now(),
    date: todayISO(),
  });
  saveShifts(getShifts());
}

/** حساب إجمالي التحصيلات المتوقعة من سجلات الوردية */
function computeExpectedCash(shift) {
  return (shift.collections || []).reduce((sum, c) => sum + Number(c.amount || 0), 0);
}

/** تقفيل الوردية (Blind Reconciliation) */
export function closeShift(closingCash, closedBy) {
  const shifts = getShifts();
  const shift = shifts.find((s) => s.status === "open");
  if (!shift) return null;
  const expected = computeExpectedCash(shift);
  const actual = Number(closingCash) || 0;
  shift.closedBy = closedBy;
  shift.closedAt = Date.now();
  shift.closedDate = todayISO();
  shift.closingCash = actual;
  shift.expectedCash = expected;
  shift.variance = actual - expected;
  shift.status = "closed";
  saveShifts(shifts);
  return shift;
}

/** إحصائيات يوم محدد */
export function getShiftStatsForDate(dateStr) {
  const shifts = getShifts().filter((s) => s.openedDate === dateStr || s.closedDate === dateStr);
  return shifts.map((s) => ({
    id: s.id,
    openedBy: s.openedBy,
    closedBy: s.closedBy || "—",
    openingCash: s.openingCash,
    expectedCash: s.expectedCash ?? computeExpectedCash(s),
    closingCash: s.closingCash,
    variance: s.variance,
    status: s.status,
    collectionCount: (s.collections || []).length,
    totalCollected: (s.collections || []).reduce((sum, c) => sum + Number(c.amount || 0), 0),
  }));
}

/* =========================================================
   STUDENT GENERAL LEDGER — دفتر الأستاذ
   ========================================================= */
export const getLedgerAll = () => readJSON(KEYS.ledger, []);
export const saveLedgerAll = (list) => writeJSON(KEYS.ledger, list);

/** يُرجع قيود دفتر أستاذ طالب معين */
export function getLedgerEntries(studentId) {
  return getLedgerAll().filter((e) => e.studentId === studentId);
}

/** إضافة قيد جديد في دفتر الأستاذ */
export function addLedgerEntry({ studentId, type, description, debit = 0, credit = 0, referenceId = "", referenceType = "", createdBy = "النظام" }) {
  const entries = getLedgerAll();
  const prevEntries = entries.filter((e) => e.studentId === studentId);
  const prevBalance = prevEntries.reduce((sum, e) => sum + Number(e.debit || 0) - Number(e.credit || 0), 0);
  const newBalance = prevBalance + Number(debit) - Number(credit);
  const entry = {
    id: generateId("LED"),
    studentId,
    date: todayISO(),
    time: new Date().toTimeString().slice(0, 5),
    type,
    description,
    debit: Number(debit) || 0,
    credit: Number(credit) || 0,
    balance: newBalance,
    referenceId,
    referenceType,
    createdBy,
  };
  entries.push(entry);
  saveLedgerAll(entries);
  return entry;
}

/** إنشاء قيد افتتاحي لطالب جديد */
export function initStudentLedger(studentId, openingBalance = 0) {
  if (openingBalance <= 0) return;
  addLedgerEntry({
    studentId,
    type: "opening_balance",
    description: "رصيد افتتاحي",
    debit: openingBalance,
    referenceType: "system",
  });
}

/**
 * تهيئة دفتر الأستاذ لكل الطلاب现有的 (Backfill).
 * يقرأ المدفوعات والمحفظةexisting وينشأ قيود افتتاحية لكل طالب عليه رصيد.
 */
export function backfillLedger() {
  const students = getStudents();
  const existing = getLedgerAll();
  const existingStudentIds = new Set(existing.map((e) => e.studentId));
  let added = 0;

  students.forEach((s) => {
    if (existingStudentIds.has(s.id)) return;
    const lateBalance = Number(s.lateBalance || 0);
    const walletBalance = Number(s.walletBalance || 0);
    if (lateBalance > 0) {
      addLedgerEntry({
        studentId: s.id,
        type: "session_fee",
        description: "رصيد متأخرات (تهيئة)",
        debit: lateBalance,
        referenceType: "system",
      });
      added++;
    }
    if (walletBalance > 0) {
      addLedgerEntry({
        studentId: s.id,
        type: "wallet_deposit",
        description: "رصيد محفظة (تهيئة)",
        credit: walletBalance,
        referenceType: "system",
      });
      added++;
    }
  });
  return added;
}

/* =========================================================
   COLLECTION TRACKING — تتبع التحصيلات للصندوق
   ========================================================= */

/**
 * تسجيل أي تحصيل نقدي في الوردية الحالية + دفتر الأستاذ.
 * يُستدعى من كل نقطة تحصيل في النظام.
 */
export function recordCashCollection(studentId, amount, type, description, options = {}) {
  if (!amount || amount <= 0) return;
  recordShiftCollection(studentId, amount, type, description);
  addLedgerEntry({
    studentId,
    type,
    description,
    credit: amount,
    referenceId: options.referenceId || "",
    referenceType: options.referenceType || "",
    createdBy: options.createdBy || "النظام",
  });
}

/**
 * تسجيل قيد مالي في دفتر الأستاذ فقط (بدون صندوق).
 * يُستخدم للمتأخرات المستحقة (debts) والخصومات من المحفظة.
 */
export function recordLedgerOnly(studentId, type, description, debit = 0, credit = 0, options = {}) {
  addLedgerEntry({
    studentId,
    type,
    description,
    debit,
    credit,
    referenceId: options.referenceId || "",
    referenceType: options.referenceType || "",
    createdBy: options.createdBy || "النظام",
  });
}

/* =========================================================
   Achievements — إنجازات الطلاب
   ========================================================= */
export const getAchievements = () => readJSON(KEYS.achievements, []);
export const saveAchievements = (list) => writeJSON(KEYS.achievements, list);

export function addAchievement(achievement) {
  const list = getAchievements();
  list.push(achievement);
  saveAchievements(list);
}

export function markAchievementSent(id) {
  const list = getAchievements();
  const item = list.find((a) => a.id === id);
  if (item) {
    item.sent = true;
    item.sentAt = new Date().toISOString();
    saveAchievements(list);
  }
}

export function getUnsentAchievements() {
  return getAchievements().filter((a) => !a.sent);
}

export function getAchievementsForStudent(studentId) {
  return getAchievements().filter((a) => a.studentId === studentId).sort((a, b) => (a.date < b.date ? 1 : -1));
}

/* =========================================================
   Escalation Logs — سجل تصعيد الإنذارات
   ========================================================= */
export const getEscalationLog = () => readJSON(KEYS.escalationLogs, []);
export const saveEscalationLog = (list) => writeJSON(KEYS.escalationLogs, list);

export function addEscalationEntry(entry) {
  const list = getEscalationLog();
  list.push(entry);
  saveEscalationLog(list);
}

export function getEscalationLogsForStudent(studentId) {
  return getEscalationLog().filter((e) => e.studentId === studentId).sort((a, b) => (a.date < b.date ? 1 : -1));
}

/* =========================================================
   إذن مسبق — Advance Permissions
   يسجّل الطالب إذن غياب مسبق لتاريخ مستقبلي
   ========================================================= */
export const getAdvancePermissions = () => readJSON(KEYS.advancePermissions, []);
export const saveAdvancePermissions = (list) => writeJSON(KEYS.advancePermissions, list);

export function addAdvancePermission(perm) {
  const list = getAdvancePermissions();
  list.push(perm);
  saveAdvancePermissions(list);
}

export function deleteAdvancePermission(id) {
  const list = getAdvancePermissions().filter((p) => p.id !== id);
  saveAdvancePermissions(list);
}

export function getAdvancePermissionForStudent(studentId, date) {
  return getAdvancePermissions().find((p) => p.studentId === studentId && p.date === date && !p.used);
}

export function getAdvancePermissionsForStudent(studentId) {
  return getAdvancePermissions().filter((p) => p.studentId === studentId).sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function markAdvancePermissionUsed(id) {
  const list = getAdvancePermissions();
  const item = list.find((p) => p.id === id);
  if (item) {
    item.used = true;
    saveAdvancePermissions(list);
  }
}

/* =========================================================
   TERM SNAPSHOTS — لقطة أرصدة الطلاب عند بداية كل ترم
   ========================================================= */
export const getTermSnapshots = () => readJSON(KEYS.termSnapshots, []);
export const saveTermSnapshots = (list) => writeJSON(KEYS.termSnapshots, list);

/** يُنشئ لقطة أرصدة لكل الطلاب النشطين لترم معين */
export function createTermSnapshot(termId) {
  const students = getStudents().filter((s) => s.status === "active");
  const snapshot = {
    id: generateId("SNP"),
    termId,
    date: todayISO(),
    students: students.map((s) => ({
      studentId: s.id,
      name: s.name,
      groupId: s.groupId,
      gradeId: s.gradeId,
      walletBalance: Number(s.walletBalance || 0),
      lateBalance: Number(s.lateBalance || 0),
    })),
  };
  const snapshots = getTermSnapshots();
  const existing = snapshots.findIndex((sn) => sn.termId === termId);
  if (existing >= 0) snapshots[existing] = snapshot;
  else snapshots.push(snapshot);
  saveTermSnapshots(snapshots);
  return snapshot;
}

/** يُرجع لقطة أرصدة لترم معين أو null */
export function getTermSnapshotForTerm(termId) {
  return getTermSnapshots().find((sn) => sn.termId === termId) || null;
}

/** هل يوجد لقطة أرصدة لترم معين؟ */
export function hasTermSnapshot(termId) {
  return getTermSnapshots().some((sn) => sn.termId === termId);
}

/* =========================================================
   ROLLOVER LOGS — سجل عمليات الترحيل
   ========================================================= */
export const getRolloverLogs = () => readJSON(KEYS.rolloverLogs, []);
export const saveRolloverLogs = (list) => writeJSON(KEYS.rolloverLogs, list);

export function addRolloverLog(entry) {
  const logs = getRolloverLogs();
  logs.push({ id: generateId("ROL"), date: todayISO(), time: new Date().toTimeString().slice(0, 5), ...entry });
  saveRolloverLogs(logs);
}

/** يُرجع آخر سجل ترحيل */
export function getLastRolloverLog() {
  const logs = getRolloverLogs();
  return logs.length ? logs[logs.length - 1] : null;
}
