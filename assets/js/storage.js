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
  subjects: "center_subjects",
  topics: "center_topics",
  questions: "center_questions",
  examAnswers: "center_exam_answers",
  users: "center_users",
  seeded: "center_seeded_v12",
};

const MOCK_BASE = new URL("../assets/mock/", import.meta.url).href;

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

  // بيانات تجريبية — تتأكد من وجودها دائماً (حتى لو الـ seed شغال قبل كده)
  seedTestData();

  // تأكد من وجود طالب برقم ولي أمر معروف للاختبار
  ensureDemoParentPhone();

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

  // تأكد من وجود طالب برقم ولي أمر معروف للاختبار
  ensureDemoParentPhone();
}

function ensureDemoParentPhone() {
  const students = getStudents();
  if (!students.length) return;
  if (students.some((s) => s.parentPhone && s.parentPhone.replace(/[\s\-\(\)]/g, "") === "01000000000")) return;
  students[0].parentPhone = "01000000000";
  saveStudents(students);
  console.log("✅ Demo parentPhone set on", students[0].name);
}

/** بيانات تجريبية — كل الأيام × 3 سنوات دراسية × 52+ طالب × كل الحالات */
function seedTestData() {
  const existingGroups = readJSON(KEYS.groups, []);
  // لو البيانات اتعملت قبل كده (فى أى يوم) نتخطى
  if (existingGroups.some((g) => g.days?.length && g.name?.includes("تست"))) return;

  let _c = 0;
  const uid = (p) => `${p}-t${Date.now().toString(36)}${(++_c).toString(36)}`;
  const today = new Date().toISOString().slice(0, 10);

  // ── أسماء عشوائية ──
  const fn = ["محمد","أحمد","علي","حسن","حسين","عمر","إبراهيم","إسماعيل","يوسف","خالد","عبدالله","مصطفى","ياسر","طارق","منصور","كمال","سعيد","سامي","هاني","وليد","ماجد","ناصر","بلال","رامي","أشرف","هشام","تامر","كريم","شريف","محمود","فاطمة","عائشة","مريم","خديجة","نورة","سارة","منى","هدى","زينب","ياسمين","سلمى","نادى","ريم"];
  const ln = ["محمد","أحمد","علي","حسن","حسين","عبدالله","Saleh","Hassan","Ibrahim","Youssef","Khaled","Mahmoud","Farouk","Nasser","Adel","Fathy","Sayed","Mansour","Gamal","Reda","Zaki","Nabil","Taha"];
  const rn = () => `${fn[~~(Math.random()*fn.length)]} ${ln[~~(Math.random()*ln.length)]}`;
  const rp = () => `01${[1,2,5][~~(Math.random()*3)]}${~~(1e7+Math.random()*9e7)}`;

  // ── توزيع الحالات (52 طالب) ──
  const DIST = [
    { id: "ST-PAID",       n: 14 },
    { id: "ST-UNPAID",     n: 10 },
    { id: "ST-EXCUSED",    n: 7  },
    { id: "ST-ABSENT",     n: 5  },
    { id: "ST-CALL",       n: 3  },
    { id: "ST-EXPEL",      n: 2  },
    { id: "ST-ACA-WARN",   n: 2  },
    { id: "ST-SUSPEND",    n: 2  },
    { id: "ST-CONFISCATE", n: 2  },
    { id: "ST-ONLINE",     n: 2  },
  ];
  const ACTIONS = new Set(["ST-CALL","ST-EXPEL","ST-ACA-WARN","ST-SUSPEND","ST-CONFISCATE","ST-ONLINE"]);
  const CHARGE_NAMES = ["ملزمة امتحان","قلم رصاص","copie","رسوم نشاط","بروشورة"];

  // ── 7 أيام × 3 مجموعات (أولى — تانية — تالتة) ──
  const DAYS = ["السبت","الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة"];
  const GRADES = [
    { gradeId: "GR1", prefix: "أ", price: 50, times: ["09:00","10:30","12:00"] },
    { gradeId: "GR2", prefix: "ب", price: 60, times: ["09:00","10:30","12:00"] },
    { gradeId: "GR3", prefix: "ت", price: 70, times: ["09:00","10:30","12:00"] },
  ];
  const DAY_CODES = ["Sa","Su","Mo","Tu","We","Th","Fr"];

  const newGroups = [], newStudents = [], newAtt = [], newPay = [], newChg = [];
  let gIdx = 0;

  for (let di = 0; di < DAYS.length; di++) {
    const day = DAYS[di];
    const dc = DAY_CODES[di];

    for (const gr of GRADES) {
      gIdx++;
      const gid = uid("GRP");
      const time = gr.times[di % 3];
      const code = `${dc}${gr.prefix}`;
      const timeLabel = time.replace(":",".");
      newGroups.push({
        id: gid, code, gradeId: gr.gradeId,
        name: `${day} ${gr.prefix === "أ" ? "أوائل" : gr.prefix === "ب" ? "متوسط" : "أعدادي"} ${timeLabel} ص — تست`,
        days: [day], time, duration: 60, capacity: 55, sessionPrice: gr.price,
      });

      let si = 0;
      for (const d of DIST) {
        for (let i = 0; i < d.n; i++) {
          si++;
          const sid = uid("STU");
          const hasDiscount = Math.random() > 0.7;
          const discount = hasDiscount ? [5,10,15][~~(Math.random()*3)] : 0;
          const wallet = Math.random() > 0.8 ? ~~(Math.random()*200)+20 : 0;
          const late = d.id === "ST-UNPAID" && Math.random() > 0.4 ? gr.price * (~~(Math.random()*4)+1) : 0;

          newStudents.push({
            id: sid, code: `${code}${String(si).padStart(2,"0")}`, name: rn(),
            gradeId: gr.gradeId, groupId: gid,
            phone: rp(), parentPhone: si === 1 ? "01000000000" : rp(), fatherJob: "", school: "",
            joinDate: today, status: "active", discount, lateBalance: late, walletBalance: wallet,
            locked: d.id === "ST-SUSPEND", lockReason: d.id === "ST-SUSPEND" ? "إيقاف مؤقت" : null,
            lockDate: d.id === "ST-SUSPEND" ? today : null,
          });

          const isAction = ACTIONS.has(d.id);
          newAtt.push({
            id: uid("ATT"), studentId: sid, date: today,
            time: isAction ? "-" : time, statusId: d.id,
            category: isAction ? "action" : "attendance", note: "", termId: null, monthId: null,
          });

          if (d.id === "ST-PAID") {
            newPay.push({
              id: uid("PAY"), studentId: sid, groupId: gid, attendanceId: uid("ATT"),
              date: today, sessionDate: today, amount: gr.price - discount,
              walletUsed: 0, status: "paid", lateBalanceDelta: late > 0 ? -late : 0,
              note: "تست", termId: null, monthId: null,
            });
          }
          if (d.id === "ST-UNPAID") {
            newPay.push({
              id: uid("PAY"), studentId: sid, groupId: gid, attendanceId: uid("ATT"),
              date: today, sessionDate: today, amount: gr.price,
              walletUsed: 0, status: "unpaid", lateBalanceDelta: gr.price,
              note: "تست", termId: null, monthId: null,
            });
          }
          if (Math.random() > 0.85 && (d.id === "ST-PAID" || d.id === "ST-UNPAID")) {
            newChg.push({
              id: uid("CHG"), batchId: uid("B"), studentId: sid,
              name: CHARGE_NAMES[~~(Math.random()*CHARGE_NAMES.length)],
              amount: [10,15,20,25,30][~~(Math.random()*5)],
              date: today, status: Math.random() > 0.5 ? "paid" : "unpaid",
            });
          }
        }
      }
    }
  }

  // ── ادمج مع البيانات الموجودة واحفظ ──
  writeJSON(KEYS.groups,       [...readJSON(KEYS.groups, []), ...newGroups]);
  writeJSON(KEYS.students,     [...readJSON(KEYS.students, []), ...newStudents]);
  writeJSON(KEYS.attendance,   [...readJSON(KEYS.attendance, []), ...newAtt]);
  writeJSON(KEYS.payments,     [...readJSON(KEYS.payments, []), ...newPay]);
  writeJSON(KEYS.extraCharges, [...readJSON(KEYS.extraCharges, []), ...newChg]);

  console.log(`🧪 Test data: ${newGroups.length} groups, ${newStudents.length} students, ${newAtt.length} attendance, ${newPay.length} payments`);
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
  const sys = getSystemSettings();

  // حسب أولوية الخصم: debt_first = المتأخرات أولاً، session_first = المحفظة أولاً
  let debtCovered, remaining;
  if (sys.deductionPriority === "session_first") {
    debtCovered = 0;
    remaining = amount;
    student.lateBalance = lateBalance;
    student.walletBalance = walletBalance + amount;
  } else {
    debtCovered = Math.min(lateBalance, amount);
    remaining = amount - debtCovered;
    student.lateBalance = Math.max(0, lateBalance - debtCovered);
    student.walletBalance = walletBalance + remaining;
  }

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

const SYSTEM_SETTINGS_DEFAULTS = {
  healthWeightAttendance: 40,
  healthWeightExams: 40,
  healthWeightBehavior: 20,
  healthColorGreen: 60,
  healthColorYellow: 40,
  defaultPassPercentage: 50,
  autoLockThreshold: 3,
  makeupGracePeriod: 48,
  financialLockEnabled: true,
  financialLockThreshold: 150,
  overdraftLimit: 0,
  deductionPriority: "session_first",
  guestStudentFee: 0,
  strictShiftClosing: false,
  sessionLockoutMinutes: 15,
  maxCapacityBufferPercent: 10,
  gateAudioFeedback: true,
  waSilentMode: false,
  waAbsenceBatching: false,
  waAbsenceBatchTime: "22:00",
  waReceiptToggle: true,
  rewardEnabled: true,
  rewardAmount: 10,
  eliteBadgeThreshold: 95,
  eliteBadgeConsecutiveExams: 3,
  parentPortalEnabled: true,
  studentPortalEnabled: true,
  bookingEnabled: true,
};

export const getSystemSettings = () => {
  const saved = readJSON(KEYS.settings, {});
  const merged = { ...SYSTEM_SETTINGS_DEFAULTS };
  const boolKeys = new Set(["financialLockEnabled", "strictShiftClosing", "gateAudioFeedback", "waSilentMode", "waAbsenceBatching", "waReceiptToggle", "rewardEnabled", "parentPortalEnabled", "studentPortalEnabled", "bookingEnabled"]);
  for (const key of Object.keys(SYSTEM_SETTINGS_DEFAULTS)) {
    if (saved[key] !== undefined) {
      if (boolKeys.has(key)) merged[key] = saved[key] === true || saved[key] === "true";
      else merged[key] = saved[key];
    }
  }
  return merged;
};
export const getCenterName = () => getSettings().centerName || "سنتر الفارس التعليمي";
export const getWhatsApp = () => getSettings().whatsapp || "";
export const getSocialLinks = () => getSettings().socialLinks || {};

export const isFeatureEnabled = (feature) => {
  const s = getSettings();
  if (feature === "wallet") return s.enableWallet !== false;
  if (feature === "extraCharges") return s.enableExtraCharges !== false;
  return true;
};

export const isParentPortalEnabled = () => {
  const s = getSystemSettings();
  return s.parentPortalEnabled !== false;
};

export const isStudentPortalEnabled = () => {
  const s = getSystemSettings();
  return s.studentPortalEnabled !== false;
};

export const isBookingEnabled = () => {
  const s = getSystemSettings();
  return s.bookingEnabled !== false;
};

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
    actions: user.actions || {},
    loggedInAt: Date.now(),
  };
  writeJSON(KEYS.session, session);
  return session;
}

export function logout() {
  cache[KEYS.session] = null;
  trackWrite(idbDelete(KEYS.session).catch(() => {}));
}

/**
 * Parent login by phone number.
 * Looks up students whose `parentPhone` matches.
 * Returns { session, students: [...] } or null.
 * Creates a restricted session with role="parent" + linked student IDs.
 */
export function parentLogin(phone) {
  const normalized = phone.replace(/[\s\-\(\)]/g, "");
  const students = getStudents().filter(
    (s) => s.parentPhone && s.parentPhone.replace(/[\s\-\(\)]/g, "") === normalized && s.status !== "graduated"
  );

  // Fallback: search by student phone too
  const fallback = !students.length ? getStudents().filter(
    (s) => s.phone && s.phone.replace(/[\s\-\(\)]/g, "") === normalized && s.status !== "graduated"
  ) : [];

  const matched = students.length ? students : fallback;
  if (!matched.length) return null;

  const groups = readJSON(KEYS.groups, []);
  const enriched = matched.map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    groupName: (groups.find((g) => g.id === s.groupId) || {}).name || "",
  }));

  const session = {
    username: "parent_" + normalized,
    name: "ولي أمر",
    role: "parent",
    permissions: ["visit"],
    actions: {},
    parentPhone: normalized,
    linkedStudentIds: enriched.map((s) => s.id),
    loggedInAt: Date.now(),
  };
  writeJSON(KEYS.session, session);
  return { session, students: enriched };
}

/**
 * Student login by student code.
 * Looks up an active student whose `code` matches.
 * Returns { session, students: [...] } or null.
 * Creates a restricted view-only session with role="student".
 */
export function studentLogin(code) {
  const normalized = String(code || "").trim();
  if (!normalized) return null;

  const student = getStudents().find(
    (s) => s.status !== "graduated" && String(s.code).trim() === normalized
  );
  if (!student) return null;

  const session = {
    username: "student_" + student.code,
    name: student.name,
    role: "student",
    permissions: ["visit"],
    actions: { visit: ["view"] },
    studentId: student.id,
    linkedStudentIds: [student.id],
    loggedInAt: Date.now(),
  };
  writeJSON(KEYS.session, session);

  const groups = readJSON(KEYS.groups, []);
  return {
    session,
    students: [{
      id: student.id,
      name: student.name,
      code: student.code,
      groupName: (groups.find((g) => g.id === student.groupId) || {}).name || "",
    }],
  };
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

/** يُرجع الترم النشط حالياً:
 *  1) الترم المُعلّم بـ isCurrent === true داخل السنة النشطة (إن وُجد)
 *  2) وإلا الترم الذي يقع تاريخ اليوم بين startDate و endDate
 *  أو null إن لم يُعثَر */
export function getActiveAcademicTerm() {
  const today = todayISO();
  const years = getAcademicYears();
  const terms = getTerms();

  const activeYear = years.find((y) => y.isCurrent);
  const currentTerm = terms.find((t) => t.isCurrent && (activeYear ? t.yearId === activeYear.id : true));
  if (currentTerm) {
    const year = years.find((y) => y.id === currentTerm.yearId);
    return { ...currentTerm, yearName: year?.name || "" };
  }

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

/* ═══════════════════════════════════════════════════════════
   المواد الدراسية (Subjects)
   ═══════════════════════════════════════════════════════════ */

export const getSubjects = () => readJSON(KEYS.subjects, []);
export const saveSubjects = (list) => writeJSON(KEYS.subjects, list);

export function addSubject({ name, gradeIds = [], icon = "📚", color = "#6c5ce7" }) {
  const list = getSubjects();
  const subject = {
    id: generateId("SUB"),
    name,
    gradeIds,
    icon,
    color,
    active: true,
    createdAt: todayISO(),
  };
  list.push(subject);
  saveSubjects(list);
  return subject;
}

export function updateSubject(id, updates) {
  const list = getSubjects();
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...updates };
  saveSubjects(list);
  return list[idx];
}

export function deleteSubject(id) {
  saveSubjects(getSubjects().filter((s) => s.id !== id));
}

export function getSubjectsForGrade(gradeId) {
  return getSubjects().filter((s) => s.active && (s.gradeIds || []).includes(gradeId));
}

/* ═══════════════════════════════════════════════════════════
   الدروس / الموضوعات (Topics)
   ═══════════════════════════════════════════════════════════ */

export const getTopics = () => readJSON(KEYS.topics, []);
export const saveTopics = (list) => writeJSON(KEYS.topics, list);

export function addTopic({ subjectId, name, order = 0, parentId = null }) {
  const list = getTopics();
  const topic = {
    id: generateId("TPC"),
    subjectId,
    name,
    order,
    parentId,
    active: true,
    createdAt: todayISO(),
  };
  list.push(topic);
  saveTopics(list);
  return topic;
}

export function updateTopic(id, updates) {
  const list = getTopics();
  const idx = list.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...updates };
  saveTopics(list);
  return list[idx];
}

export function deleteTopic(id) {
  saveTopics(getTopics().filter((t) => t.id !== id));
}

export function getTopicsForSubject(subjectId) {
  return getTopics()
    .filter((t) => t.subjectId === subjectId && t.active)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

/* ═══════════════════════════════════════════════════════════
   بنك الأسئلة (Question Bank)
   ═══════════════════════════════════════════════════════════ */

export const getQuestions = () => readJSON(KEYS.questions, []);
export const saveQuestions = (list) => writeJSON(KEYS.questions, list);

/**
 * أنواع الأسئلة:
 *  mcq   — اختيار من متعدد
 *  tf    — صح/خطأ
 *  essay — مقالي (يحتاج تصحيح يدوي)
 */
export function addQuestion({ subjectId, topicId = null, type = "mcq", text, options = [], correctAnswer, difficulty = "medium", marks = 1, explanation = "" }) {
  const list = getQuestions();
  const question = {
    id: generateId("QST"),
    subjectId,
    topicId,
    type,
    text,
    options: type === "mcq" ? options : type === "tf" ? ["صح", "خطأ"] : [],
    correctAnswer,
    difficulty,
    marks: Number(marks) || 1,
    explanation,
    active: true,
    createdAt: todayISO(),
  };
  list.push(question);
  saveQuestions(list);
  return question;
}

export function updateQuestion(id, updates) {
  const list = getQuestions();
  const idx = list.findIndex((q) => q.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...updates };
  saveQuestions(list);
  return list[idx];
}

export function deleteQuestion(id) {
  saveQuestions(getQuestions().filter((q) => q.id !== id));
}

export function getQuestionsForSubject(subjectId) {
  return getQuestions().filter((q) => q.subjectId === subjectId && q.active);
}

export function getQuestionsForTopic(topicId) {
  return getQuestions().filter((q) => q.topicId === topicId && q.active);
}

export function getQuestionsByDifficulty(subjectId, difficulty) {
  return getQuestions().filter((q) => q.subjectId === subjectId && q.difficulty === difficulty && q.active);
}

export function getQuestionStats() {
  const questions = getQuestions();
  return {
    total: questions.length,
    byType: {
      mcq: questions.filter((q) => q.type === "mcq").length,
      tf: questions.filter((q) => q.type === "tf").length,
      essay: questions.filter((q) => q.type === "essay").length,
    },
    byDifficulty: {
      easy: questions.filter((q) => q.difficulty === "easy").length,
      medium: questions.filter((q) => q.difficulty === "medium").length,
      hard: questions.filter((q) => q.difficulty === "hard").length,
    },
  };
}

/* ═══════════════════════════════════════════════════════════
   نتائج الامتحانات سؤال بسؤال (Exam Answers)
   ═══════════════════════════════════════════════════════════ */

export const getExamAnswers = () => readJSON(KEYS.examAnswers, []);
export const saveExamAnswers = (list) => writeJSON(KEYS.examAnswers, list);

export function addExamAnswer({ examId, studentId, questionId, studentAnswer, isCorrect, marksAwarded = 0 }) {
  const list = getExamAnswers();
  const answer = {
    id: generateId("EAN"),
    examId,
    studentId,
    questionId,
    studentAnswer,
    isCorrect: !!isCorrect,
    marksAwarded: Number(marksAwarded) || 0,
    createdAt: todayISO(),
  };
  list.push(answer);
  saveExamAnswers(list);
  return answer;
}

export function getExamAnswersForExam(examId) {
  return getExamAnswers().filter((a) => a.examId === examId);
}

export function getExamAnswersForStudent(studentId) {
  return getExamAnswers().filter((a) => a.studentId === studentId);
}

export function getExamAnswersForQuestion(questionId) {
  return getExamAnswers().filter((a) => a.questionId === questionId);
}

/**
 * تحليل أداء السؤال — كام طالب حلوا صح وكام غلط
 */
export function getQuestionPerformance(questionId) {
  const answers = getExamAnswers().filter((a) => a.questionId === questionId);
  const total = answers.length;
  const correct = answers.filter((a) => a.isCorrect).length;
  return {
    questionId,
    total,
    correct,
    incorrect: total - correct,
    accuracy: total ? Math.round((correct / total) * 100) : 0,
  };
}

/**
 * تحليل أداء الطالب حسب المادة
 */
export function getStudentSubjectPerformance(studentId, subjectId) {
  const questions = getQuestionsForSubject(subjectId);
  const questionIds = new Set(questions.map((q) => q.id));
  const answers = getExamAnswers().filter((a) => a.studentId === studentId && questionIds.has(a.questionId));

  if (!answers.length) return null;

  const total = answers.length;
  const correct = answers.filter((a) => a.isCorrect).length;
  const totalMarks = answers.reduce((s, a) => s + (questions.find((q) => q.id === a.questionId)?.marks || 1), 0);
  const earnedMarks = answers.reduce((s, a) => s + a.marksAwarded, 0);

  return {
    studentId,
    subjectId,
    totalQuestions: total,
    correct,
    incorrect: total - correct,
    accuracy: Math.round((correct / total) * 100),
    totalMarks,
    earnedMarks,
  };
}

/**
 * أكثر الأسئلة خطأً في مادة معينة
 */
export function getMostMissedQuestions(subjectId, limit = 5) {
  const questions = getQuestionsForSubject(subjectId);
  return questions
    .map((q) => ({ ...q, perf: getQuestionPerformance(q.id) }))
    .filter((q) => q.perf.total > 0)
    .sort((a, b) => a.perf.accuracy - b.perf.accuracy)
    .slice(0, limit);
}

/**
 * أكثر الدروس صعوبة لطالب معين
 */
export function getWeakestTopics(studentId, subjectId, limit = 5) {
  const topics = getTopicsForSubject(subjectId);
  return topics
    .map((t) => {
      const topicQuestions = getQuestionsForTopic(t.id);
      const questionIds = new Set(topicQuestions.map((q) => q.id));
      const answers = getExamAnswers().filter((a) => a.studentId === studentId && questionIds.has(a.questionId));
      const total = answers.length;
      const correct = answers.filter((a) => a.isCorrect).length;
      return {
        ...t,
        total,
        correct,
        accuracy: total ? Math.round((correct / total) * 100) : 0,
      };
    })
    .filter((t) => t.total > 0)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, limit);
}

/* ═══════════════════════════════════════════════════════════
   المستخدمون (لـ Auth)
   ═══════════════════════════════════════════════════════════ */

export const getUsers = () => readJSON(KEYS.users, []);
export const saveUsers = (list) => writeJSON(KEYS.users, list);
