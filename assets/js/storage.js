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
  skillMastery: "center_skill_mastery",
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
  parentAccounts: "center_parent_accounts",
  studentAccounts: "center_student_accounts",
  expenses: "center_expenses",
  seeded: "center_seeded_v12",
  freshStart: "center_fresh_start",
};

const MOCK_BASE = new URL("../mock/", import.meta.url).href;

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

/** مستخدمو الاختبار — ضمانة للدخول (admin / 1234) لو فشل تحميل الإعدادات أو البيانات قديمة */
const FALLBACK_DEMO_USERS = [
  { username: "admin", password: "1234", name: "مدير النظام", role: "admin", permissions: [], theme: "default" },
  { username: "assist1", password: "1234", name: "أ. حسن حسن", role: "assistant", permissions: ["session", "reception", "students", "followup"], theme: "default" },
];

/** رقم نسخة بيانات التجربة — لو اتغير يتعاد ترقيم (بذر) بيانات الموك مرة واحدة للنسخ القائمة */
const SEED_VERSION = "v4-mastery";

/** تهيئة البيانات لأول مرة فقط من ملفات mock إلى IndexedDB */
export async function seedIfNeeded() {
  await ensureCacheLoaded();

  // بيانات تجريبية — تتأكد من وجودها دائماً (حتى لو الـ seed شغال قبل كده)
  seedTestData();

  // تأكد من وجود طالب برقم ولي أمر معروف للاختبار
  await ensureDemoParentPhone();

  // ترحيل بيانات دخول أولياء الأمور القديمة (مستوى الطالب) لحسابات لكل رقم تليفون
  migrateParentAccounts();

  // حساب دخول تجريبي للطالب (الكود / 1234)
  await ensureDemoStudentAuth();

  // تأكد من وجود مادة التدريس (مادة واحدة لكل السنتر) حتى للبيانات القديمة
  ensureTeachingSubject();

  // ضمان وجود مستخدم الـ admin التجريبي (admin / 1234) مهما كان مصدر البيانات
  ensureAdminUser();

  if (readJSON(KEYS.seeded, false) === SEED_VERSION) return;

  try {
    const [students, grades, groups, studentStatuses, attendance, payments, exams, settings, academicPeriods, academicYears, terms, academicMonths, subjects, topics, questions, examAnswers] = await Promise.all([
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
      fetchMock("subjects.json"),
      fetchMock("topics.json"),
      fetchMock("questions.json"),
      fetchMock("examAnswers.json"),
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
    writeJSON(KEYS.subjects, subjects);
    writeJSON(KEYS.topics, topics);
    writeJSON(KEYS.questions, questions);
    writeJSON(KEYS.examAnswers, resolvePlaceholders(examAnswers));
    writeJSON(KEYS.seeded, SEED_VERSION);
  } catch (e) {
    console.error("فشل تحميل بيانات Mock — تأكد من تشغيل المشروع عبر خادم محلى وليس file://", e);
    // لو فشل تحميل الإعدادات، نضمن وجود المستخدمين التجريبيين عشان الدخول يشتغل
    if (!Array.isArray(getSettings().users) || getSettings().users.length === 0) {
      writeJSON(KEYS.settings, { ...getSettings(), users: FALLBACK_DEMO_USERS.map((u) => ({ ...u })) });
    }
  }

  // ضمان وجود مستخدم الـ admin التجريبي (admin / 1234) مهما كان مصدر البيانات
  ensureAdminUser();

  // تأكد من وجود طالب برقم ولي أمر معروف للاختبار
  await ensureDemoParentPhone();

  // بيانات تجريبية لبوابة العائلة (متابعة + إنجاز) للطالب التجريبي
  ensureDemoFamilyData();
}

/** بيانات تجريبية لبوابة العائلة — متابعة + إنجاز للطالب التجريبي */
function ensureDemoFamilyData() {
  const demo = getStudents().find((s) => s.parentPhone && s.parentPhone.replace(/[\s\-\(\)]/g, "") === "01000000000");
  if (!demo) return;
  const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

  let logs = getFollowupLogs();
  if (!logs.some((l) => l.studentId === demo.id)) {
    logs = logs.concat([
      { id: "FUL-DEMO-1", studentId: demo.id, date: daysAgo(2), time: "09:45", writtenBy: "أ. حسن حسن", text: "بدأنا خطة علاجية لمادة العلوم: جلسة مراجعة أسبوعية + متابعة أسبوعية لواجب المنهج." },
      { id: "FUL-DEMO-2", studentId: demo.id, date: daysAgo(4), time: "11:20", writtenBy: "أ. حسن حسن", text: "لاحظنا ضعفاً في مادة العلوم — تم تكليف الطالب بمراجعة موضوع «الفيزياء والطاقة» وحل أسئلة إضافية." },
      { id: "FUL-DEMO-3", studentId: demo.id, date: daysAgo(9), time: "10:10", writtenBy: "السكرتارية", text: "أداء جيد في مادة الرياضيات — نشجع الطالب على الاستمرار." },
    ]);
    saveFollowupLogs(logs);
  }

  let ach = getAchievements();
  if (!ach.some((a) => a.studentId === demo.id)) {
    ach = ach.concat([
      { id: "ACH-DEMO-1", type: "excellence", studentId: demo.id, examId: "EXM-1", examTitle: "امتحان الشهر الأول — الفصل الأول", date: daysAgo(36), newScore: 41, maxScore: 50, newPct: 82, oldAvg: 55, sent: true, sentAt: new Date().toISOString(), createdAt: new Date().toISOString() },
    ]);
    saveAchievements(ach);
  }
}

/** يضمن وجود مستخدمي الاختبار في الإعدادات — بيفضل أي بيانات حقيقية ولا يعيد ضبط كلمات مرور موجودة */
/** مادة التدريس الافتراضية — مادة واحدة لكل السنتر (حالياً الإنجليزي) */
const DEFAULT_TEACHING_SUBJECT_ID = "SUB-2";

/** لو الإعدادات القديمة مش فيها subjectId، نضبطها على المادة الافتراضية */
function ensureTeachingSubject() {
  const settings = getSettings();
  if (settings.subjectId) return;
  writeJSON(KEYS.settings, { ...settings, subjectId: DEFAULT_TEACHING_SUBJECT_ID });
  console.log("✅ teaching subjectId set to", DEFAULT_TEACHING_SUBJECT_ID);
}

function ensureAdminUser() {
  const settings = getSettings();
  const users = Array.isArray(settings.users) ? settings.users : [];
  if (users.length === 0) {
    writeJSON(KEYS.settings, { ...settings, users: FALLBACK_DEMO_USERS.map((u) => ({ ...u })) });
    return;
  }
  const hasAdmin = users.some((u) => u && u.username === "admin");
  if (!hasAdmin) {
    writeJSON(KEYS.settings, { ...settings, users: [...users, { ...FALLBACK_DEMO_USERS[0] }] });
  }
}

async function ensureDemoParentPhone() {
  const students = getStudents();
  if (!students.length) return;
  let demo = students.find((s) => normalizeParentPhone(s.parentPhone) === "01000000000");
  if (!demo) {
    if (!students[0].parentPhone) {
      demo = students[0];
      demo.parentPhone = "01000000000";
      saveStudents(students);
      console.log("✅ Demo parentPhone set on", demo.name);
    } else {
      return;
    }
  }
  const account = ensureParentAccount("01000000000");
  if (account && !account.parentPassHash && !account.parentActivationHash) {
    account.parentActivationHash = await hashSecret("123456", account.id);
    saveParentAccounts(getParentAccounts());
    console.log("✅ Demo parent activation code (123456) set on", demo.name);
  }
}

/** حساب دخول تجريبي للطالب — اليوزر نيم = كود الطالب، الباسورد 1234 */
async function ensureDemoStudentAuth() {
  const students = getStudents();
  if (!students.length) return;
  const demo = students.find((s) => String(s.code).trim() === "101") || students[0];
  const account = ensureStudentAccount(demo.id);
  if (!account.username) account.username = String(demo.code || "").trim();
  if (!account.passwordHash) {
    account.passwordHash = await hashSecret("1234", demo.id);
    console.log("✅ Demo student auth (" + account.username + " / 1234) set on", demo.name);
  }
  saveStudentAccounts(getStudentAccounts());
}

/** بيانات تجريبية — كل الأيام × 3 سنوات دراسية × 52+ طالب × كل الحالات */
function seedTestData() {
  // بعد "مسح بيانات الطلاب" لا نعيد زرع البيانات التجريبية إطلاقًا
  if (readJSON(KEYS.freshStart, false) === true) return;

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

/* ---------------- Expenses (المصاريف التشغيلية) ---------------- */
/** فئات المصاريف الثابتة — للتوزيع في التقارير */
export const EXPENSE_CATEGORIES = [
  { id: "rent", label: "إيجار المكان", icon: "🏠" },
  { id: "utilities", label: "فواتير (كهرباء / ماء / نت)", icon: "💡" },
  { id: "staff", label: "مرتبات / مساعدين", icon: "👥" },
  { id: "printing", label: "طباعة / مستلزمات تعليمية", icon: "📄" },
  { id: "marketing", label: "تسويق / دعاية", icon: "📣" },
  { id: "maintenance", label: "صيانة / أجهزة", icon: "🛠️" },
  { id: "other", label: "أخرى", icon: "📦" },
];

export const getExpenses = () => readJSON(KEYS.expenses, []);
export const saveExpenses = (list) => writeJSON(KEYS.expenses, list);

/** إضافة مصروف جديد — { date, category, amount, note } */
export function addExpense({ date, category, amount, note = "" }) {
  const list = getExpenses();
  const entry = {
    id: generateId("EXP"),
    date: date || todayISO(),
    category: EXPENSE_CATEGORIES.some((c) => c.id === category) ? category : "other",
    amount: Math.max(0, Number(amount) || 0),
    note: String(note || "").trim(),
    createdAt: Date.now(),
  };
  list.push(entry);
  saveExpenses(list);
  return entry;
}

/** تعديل مصروف — يعمل تحديث جزئي على الحقول المعطاة */
export function updateExpense(id, patch = {}) {
  const list = getExpenses();
  const entry = list.find((x) => x.id === id);
  if (!entry) return null;
  if (patch.date) entry.date = patch.date;
  if (patch.category) entry.category = EXPENSE_CATEGORIES.some((c) => c.id === patch.category) ? patch.category : entry.category;
  if (patch.amount !== undefined) entry.amount = Math.max(0, Number(patch.amount) || 0);
  if (patch.note !== undefined) entry.note = String(patch.note || "").trim();
  saveExpenses(list);
  return entry;
}

/** حذف مصروف بالمعرف */
export function deleteExpense(id) {
  saveExpenses(getExpenses().filter((x) => x.id !== id));
}/**
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

/** مادة التدريس (مادة واحدة لكل السنتر) — إن لم تُضبط نرجع null */
export function getTeachingSubject() {
  const sid = getSettings().subjectId;
  if (!sid) return null;
  return getSubjects().find((s) => s.id === sid) || null;
}

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
  const users = Array.isArray(settings.users) && settings.users.length
    ? settings.users
    : FALLBACK_DEMO_USERS;
  const user = users.find(
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

/* ---------------- Parent Auth (حساب لكل رقم تليفون) ---------------- */
export const MAX_PARENT_FAILS = 5;
export const PARENT_LOCK_MS = 10 * 60 * 1000;

/** تجزئة احتياطية (بلا crypto.subtle) لمنع تخزين الأكواد/كلمات المرور كنص صريح */
function fallbackHash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** تجزئة السر مع salt خاص بالحساب — SHA-256 إن توفر (https/localhost) وإلا تجزئة احتياطية */
export async function hashSecret(secret, salt) {
  const text = `${salt}::${String(secret || "").trim()}`;
  try {
    if (typeof crypto !== "undefined" && crypto.subtle) {
      return "sha256:" + await sha256Hex(text);
    }
  } catch (e) { /* نكمل بالتجزئة الاحتياطية */ }
  return "cyrb53:" + fallbackHash(text);
}

const normalizeParentPhone = (p) => String(p || "").replace(/[\s\-\(\)]/g, "");

export const getParentAccounts = () => readJSON(KEYS.parentAccounts, []);
export const saveParentAccounts = (list) => writeJSON(KEYS.parentAccounts, list);

/** حساب ولي الأمر برقم التليفون — حساب واحد لكل رقم مهما عدد الأبناء */
export function findParentAccount(phone) {
  const norm = normalizeParentPhone(phone);
  if (!norm) return null;
  return getParentAccounts().find((a) => a.phone === norm) || null;
}

/** يهيّئ حساب جديد لرقم معين لو مش موجود */
function ensureParentAccount(phone) {
  const norm = normalizeParentPhone(phone);
  if (!norm) return null;
  const accounts = getParentAccounts();
  let account = accounts.find((a) => a.phone === norm);
  if (!account) {
    account = { id: generateId("PAR"), phone: norm, createdAt: Date.now() };
    accounts.push(account);
    saveParentAccounts(accounts);
  }
  return account;
}

/**
 * Parent login by phone number + secret (كلمة المرور أو كود التفعيل لأول مرة).
 * الكود/كلمة المرور على رقم التليفون — يصلح لكل الأبناء المسجلين بنفس الرقم.
 * يمنع الدخول برقم الهاتف فقط — لازم رقم + سر صحيح.
 * Returns:
 *   { ok:true, session, students, needsPassword }
 *   { ok:false, reason:"not-found" }
 *   { ok:false, reason:"no-auth" }              // السنتر ماضبطش كود/كلمة مرور
 *   { ok:false, reason:"locked", lockUntil }
 *   { ok:false, reason:"bad-secret", fails, locked, lockUntil }
 */
export async function parentLogin(phone, secret) {
  const normalized = normalizeParentPhone(phone);
  if (!normalized) return { ok: false, reason: "not-found" };

  const students = getStudents().filter(
    (s) => s.parentPhone && normalizeParentPhone(s.parentPhone) === normalized && s.status !== "graduated"
  );

  const account = findParentAccount(normalized);

  if (!account) {
    if (!students.length) return { ok: false, reason: "not-found" };
    return { ok: false, reason: "no-auth" };
  }

  if (account.parentLockUntil && Date.now() < account.parentLockUntil) {
    return { ok: false, reason: "locked", lockUntil: account.parentLockUntil };
  }

  const validHash = account.parentPassHash || account.parentActivationHash;
  if (!validHash) return { ok: false, reason: "no-auth" };

  const h = await hashSecret(secret, account.id);
  if (h !== validHash) {
    account.parentFails = (account.parentFails || 0) + 1;
    let locked = false;
    if (account.parentFails >= MAX_PARENT_FAILS) {
      account.parentLockUntil = Date.now() + PARENT_LOCK_MS;
      account.parentFails = 0;
      locked = true;
    }
    saveParentAccounts(getParentAccounts());
    return {
      ok: false,
      reason: "bad-secret",
      fails: locked ? 0 : account.parentFails,
      locked,
      lockUntil: account.parentLockUntil || 0,
    };
  }

  account.parentFails = 0;
  account.parentLockUntil = 0;
  saveParentAccounts(getParentAccounts());

  const groups = readJSON(KEYS.groups, []);
  const enriched = students.map((s) => ({
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
  return { ok: true, session, students: enriched, needsPassword: !account.parentPassHash };
}

/** ولي الأمر يختار كلمة مروره بعد أول دخول ناجح بكود التفعيل */
export async function setParentPassword(phone, password) {
  const p = String(password || "").trim();
  if (p.length < 4 || p.length > 8) return false;
  const account = ensureParentAccount(phone);
  if (!account) return false;
  account.parentPassHash = await hashSecret(p, account.id);
  account.parentActivationHash = null;
  account.parentFails = 0;
  account.parentLockUntil = 0;
  saveParentAccounts(getParentAccounts());
  return true;
}

/** السنتر يضع (أو يصفّر) كود التفعيل — أول دخول فقط، وبعدها ولي الأمر يختار كلمة مروره */
export async function setParentActivationCode(phone, code) {
  const c = String(code || "").trim();
  if (!c) return false;
  const account = ensureParentAccount(phone);
  if (!account) return false;
  account.parentActivationHash = await hashSecret(c, account.id);
  account.parentPassHash = null;
  account.parentFails = 0;
  account.parentLockUntil = 0;
  saveParentAccounts(getParentAccounts());
  return true;
}

/** ترحيل بيانات الدخول القديمة (على مستوى الطالب) إلى حسابات على مستوى رقم التليفون */
function migrateParentAccounts() {
  const students = getStudents();
  const accounts = getParentAccounts();
  let changed = false;

  for (const s of students) {
    const norm = normalizeParentPhone(s.parentPhone);
    if (!norm) continue;
    const hasLegacy = s.parentPassHash || s.parentActivationHash || s.parentFails || s.parentLockUntil;
    if (hasLegacy) {
      let account = accounts.find((a) => a.phone === norm);
      if (!account) {
        account = { id: generateId("PAR"), phone: norm, createdAt: Date.now() };
        accounts.push(account);
      }
      if (!account.parentPassHash && !account.parentActivationHash) {
        if (s.parentActivationHash) account.parentActivationHash = s.parentActivationHash;
        if (s.parentPassHash) account.parentPassHash = s.parentPassHash;
        if (s.parentFails) account.parentFails = s.parentFails;
        if (s.parentLockUntil) account.parentLockUntil = s.parentLockUntil;
      }
    }
    if ("parentPassHash" in s || "parentActivationHash" in s || "parentFails" in s || "parentLockUntil" in s) {
      delete s.parentPassHash;
      delete s.parentActivationHash;
      delete s.parentFails;
      delete s.parentLockUntil;
      changed = true;
    }
  }

  if (changed) {
    saveParentAccounts(accounts);
    saveStudents(students);
    console.log("✅ parent accounts migrated");
  }
}

/* ---------------- Student Auth (حساب لكل طالب: يوزر نيم + باسورد) ---------------- */
export const MAX_STUDENT_FAILS = 5;
export const STUDENT_LOCK_MS = 10 * 60 * 1000;

export const getStudentAccounts = () => readJSON(KEYS.studentAccounts, []);
export const saveStudentAccounts = (list) => writeJSON(KEYS.studentAccounts, list);

/** حساب الطالب حسب رقم الطالب الداخلي */
export function findStudentAccount(studentId) {
  return getStudentAccounts().find((a) => a.studentId === studentId) || null;
}

/** البحث عن حساب الطالب باسم المستخدم */
export function findStudentAccountByUsername(username) {
  const norm = String(username || "").trim();
  if (!norm) return null;
  return getStudentAccounts().find((a) => a.username === norm) || null;
}

/** يهيّئ حساب طالب لو مش موجود (اليوزر نيم الافتراضي = كود الطالب) */
function ensureStudentAccount(studentId) {
  const accounts = getStudentAccounts();
  let account = accounts.find((a) => a.studentId === studentId);
  if (!account) {
    account = { studentId, username: "", passwordHash: null, fails: 0, lockUntil: 0, createdAt: Date.now() };
    accounts.push(account);
    saveStudentAccounts(accounts);
  }
  return account;
}

/** السنتر يضع (أو يصفّر) باسورد الطالب — اليوزر نيم يفضل الكود ما لم يتغير */
export async function setStudentPassword(studentId, password) {
  const p = String(password || "").trim();
  if (!p) return false;
  const account = ensureStudentAccount(studentId);
  if (!account.username) {
    const student = getStudents().find((s) => s.id === studentId);
    account.username = student ? String(student.code || "").trim() : "";
  }
  account.passwordHash = await hashSecret(p, studentId);
  account.fails = 0;
  account.lockUntil = 0;
  saveStudentAccounts(getStudentAccounts());
  return true;
}

/** السنتر/ولي الأمر يغيّر اسم مستخدم الطالب */
export function setStudentUsername(studentId, username) {
  const u = String(username || "").trim();
  if (!u) return { ok: false, reason: "empty" };
  const taken = getStudentAccounts().find((a) => a.username === u && a.studentId !== studentId);
  if (taken) return { ok: false, reason: "taken" };
  const account = ensureStudentAccount(studentId);
  account.username = u;
  saveStudentAccounts(getStudentAccounts());
  return { ok: true };
}

/**
 * Student login by username + password.
 * اليوزر نيم الافتراضي = كود الطالب، والباسورد بيضعه السنتر من صفحة الإدارة.
 * Returns:
 *   { ok:true, session, students }
 *   { ok:false, reason:"not-found" }
 *   { ok:false, reason:"no-auth" }
 *   { ok:false, reason:"locked", lockUntil }
 *   { ok:false, reason:"bad-secret", fails, locked, lockUntil }
 */
export async function studentLogin(username, password) {
  const u = String(username || "").trim();
  const p = String(password || "");
  if (!u || !p) return { ok: false, reason: "not-found" };

  const account = findStudentAccountByUsername(u);
  if (!account) return { ok: false, reason: "not-found" };

  const student = getStudents().find((s) => s.id === account.studentId && s.status !== "graduated");
  if (!student) return { ok: false, reason: "not-found" };

  if (account.lockUntil && Date.now() < account.lockUntil) {
    return { ok: false, reason: "locked", lockUntil: account.lockUntil };
  }

  if (!account.passwordHash) return { ok: false, reason: "no-auth" };

  const h = await hashSecret(p, account.studentId);
  if (h !== account.passwordHash) {
    account.fails = (account.fails || 0) + 1;
    let locked = false;
    if (account.fails >= MAX_STUDENT_FAILS) {
      account.lockUntil = Date.now() + STUDENT_LOCK_MS;
      account.fails = 0;
      locked = true;
    }
    saveStudentAccounts(getStudentAccounts());
    return { ok: false, reason: "bad-secret", fails: locked ? 0 : account.fails, locked, lockUntil: account.lockUntil || 0 };
  }

  account.fails = 0;
  account.lockUntil = 0;
  saveStudentAccounts(getStudentAccounts());

  const session = {
    username: account.username,
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
    ok: true,
    session,
    students: [{
      id: student.id,
      name: student.name,
      code: student.code,
      username: account.username,
      groupName: (groups.find((g) => g.id === student.groupId) || {}).name || "",
    }],
  };
}

/** تغيير كلمة مرور الطالب من داخل البوابة بعد تأكيد الباسورد الحالي */
export async function changeStudentPassword(studentId, currentPassword, newPassword) {
  const p = String(newPassword || "").trim();
  if (p.length < 4 || p.length > 8) return { ok: false, reason: "weak" };
  const account = findStudentAccount(studentId);
  if (!account?.passwordHash) return { ok: false, reason: "no-auth" };
  const cur = await hashSecret(String(currentPassword || ""), studentId);
  if (cur !== account.passwordHash) return { ok: false, reason: "bad-current" };
  account.passwordHash = await hashSecret(p, studentId);
  account.fails = 0;
  account.lockUntil = 0;
  saveStudentAccounts(getStudentAccounts());
  return { ok: true };
}

/** تغيير يوزر نيم الطالب من داخل البوابة بعد تأكيد الباسورد */
export async function changeStudentUsername(studentId, currentPassword, newUsername) {
  const u = String(newUsername || "").trim();
  if (!u) return { ok: false, reason: "empty" };
  if (u.length < 3) return { ok: false, reason: "short" };
  const account = findStudentAccount(studentId);
  if (!account?.passwordHash) return { ok: false, reason: "no-auth" };
  const cur = await hashSecret(String(currentPassword || ""), studentId);
  if (cur !== account.passwordHash) return { ok: false, reason: "bad-current" };
  const taken = getStudentAccounts().find((a) => a.username === u && a.studentId !== studentId);
  if (taken) return { ok: false, reason: "taken" };
  account.username = u;
  saveStudentAccounts(getStudentAccounts());
  return { ok: true };
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

/** مسح بيانات الطلاب والتشغيلية — المشروع يظهر فاضي مع الحفاظ على الأساسيات:
 *  الإعدادات (المستخدمون/حسابات الدخول، اسم السنتر، المادة، إعدادات النظام)،
 *  السنوات الدراسية، حالات الطالب، الهيكل الأكاديمي (سنوات/أترام/شهور)،
 *  المواد والدروس وبنك الأسئلة. ويمنع إعادة زرع البيانات التجريبية بعد المسح. */
export async function clearStudentData() {
  const keep = {
    [KEYS.settings]: readJSON(KEYS.settings, {}),
    [KEYS.grades]: readJSON(KEYS.grades, []),
    [KEYS.studentStatuses]: readJSON(KEYS.studentStatuses, []),
    [KEYS.academicPeriods]: readJSON(KEYS.academicPeriods, []),
    [KEYS.academicYears]: readJSON(KEYS.academicYears, []),
    [KEYS.terms]: readJSON(KEYS.terms, []),
    [KEYS.academicMonths]: readJSON(KEYS.academicMonths, []),
    [KEYS.subjects]: readJSON(KEYS.subjects, []),
    [KEYS.topics]: readJSON(KEYS.topics, []),
    [KEYS.questions]: readJSON(KEYS.questions, []),
    [KEYS.users]: readJSON(KEYS.users, []),
    [KEYS.session]: readJSON(KEYS.session, null),
  };

  const wipeKeys = [
    KEYS.students,
    KEYS.groups,
    KEYS.attendance,
    KEYS.payments,
    KEYS.exams,
    KEYS.examAnswers,
    KEYS.extraCharges,
    KEYS.walletTransactions,
    KEYS.ledger,
    KEYS.shifts,
    KEYS.sessionLogs,
    KEYS.followupLogs,
    KEYS.skillMastery,
    KEYS.achievements,
    KEYS.escalationLogs,
    KEYS.advancePermissions,
    KEYS.termSnapshots,
    KEYS.rolloverLogs,
    KEYS.expenses,
    KEYS.parentAccounts,
    KEYS.studentAccounts,
  ];

  for (const k of wipeKeys) {
    cache[k] = [];
    trackWrite(idbDelete(k).catch(() => {}));
  }

  // علامة تمنع زرع البيانات التجريبية في الزيارات القادمة + تثبيت رقم النسخة حتى لا يعيد التحميل من mock
  cache[KEYS.freshStart] = true;
  trackWrite(idbSet(KEYS.freshStart, true).catch(() => {}));
  cache[KEYS.seeded] = SEED_VERSION;
  trackWrite(idbSet(KEYS.seeded, SEED_VERSION).catch(() => {}));

  Object.entries(keep).forEach(([k, v]) => writeJSON(k, v));
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

/** إغلاق الوردية المفتوحة تلقائيًا (تسوية = التحصيلات، عجز صفر) — يستخدم في الوضع التلقائي المخفي */
export function autoCloseShift(closedBy) {
  const shifts = getShifts();
  const shift = shifts.find((s) => s.status === "open");
  if (!shift) return null;
  const expected = computeExpectedCash(shift);
  shift.closedBy = closedBy || "النظام";
  shift.closedAt = Date.now();
  shift.closedDate = todayISO();
  shift.closingCash = expected;
  shift.expectedCash = expected;
  shift.variance = 0;
  shift.status = "closed";
  shift.autoClosed = true;
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

/**
 * إجابة تدريبية من مركز قيادة الطالب — تُسجل في نفس مخزن الإجابات مع بيانات
 * الجلسة (attemptId) والوقت والثقة — أساس دفتر الأخطاء وسجل المحاولات ومؤشر السرعة.
 */
export function addPracticeAnswer({ studentId, questionId, studentAnswer, isCorrect, attemptId, timeTaken, confidence, reason, mode = "practice", score }) {
  const list = getExamAnswers();
  const answer = {
    id: generateId("EAN"),
    examId: "practice",
    mode: mode || "practice",
    studentId,
    questionId,
    studentAnswer,
    isCorrect: !!isCorrect,
    marksAwarded: isCorrect ? 1 : 0,
    score: typeof score === "number" ? score : null,
    attemptId: attemptId || null,
    timeTaken: Number(timeTaken) || null,
    confidence: confidence || null,
    reason: reason || null,
    reviewed: false,
    reviewedAt: null,
    createdAt: todayISO(),
  };
  list.push(answer);
  saveExamAnswers(list);
  return answer;
}

/** بمناسبة مراجعة خطأ — تُحفظ في سجل الإجابة نفسها (دفتر الأخطاء يقرأها) */
export function markAnswerReviewed(answerId) {
  const list = getExamAnswers();
  const item = list.find((a) => a.id === answerId);
  if (!item) return false;
  item.reviewed = true;
  item.reviewedAt = todayISO();
  saveExamAnswers(list);
  return true;
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

/* ═══════════════════════════════════════════════════════════
   إتقان المهارات (Skill Mastery) — نموذج 72 ساعة بسيط
   الخطأ → حالة "قيد العلاج" → بعد 72 ساعة يفتح التأكيد
   نجاح التأكيد → "معالَج" · فشل التأكيد مرتين → "بحاجة تدخل"
   ═══════════════════════════════════════════════════════════ */

export const RETEST_HOURS = 72;
export const SKILL_STATUS = { TREATING: "treating", CURED: "cured", ESCALATED: "escalated" };

export const getSkillMastery = () => readJSON(KEYS.skillMastery, []);
export const saveSkillMastery = (list) => writeJSON(KEYS.skillMastery, list);

function skillMasteryId(studentId, skillId) {
  return `SM-${studentId}-${skillId}`;
}

function answerDateOr(a) {
  return a.createdAt || getExams().find((e) => e.id === a.examId)?.date || "";
}

function hoursFromNowDate(days) {
  return addDaysToIso(todayISO(), days);
}

/** يرجع (ويجهّز) سجل إتقان لمهارة الطالب — ينشئه من الإجابات لو مش موجود */
export function getSkillMasteryForStudent(studentId, skillId) {
  const list = getSkillMastery();
  let rec = list.find((r) => r.studentId === studentId && r.skillId === skillId);
  if (rec) return rec;

  // إنشاء من تاريخ الإجابات لو ليه سجل أصلاً (بيانات قديمة/Seed)
  const answers = getExamAnswersForStudent(studentId);
  const skillAnswers = answers.filter((a) => {
    const q = getQuestions().find((x) => x.id === a.questionId);
    return q?.skill === skillId;
  });
  if (!skillAnswers.length) return null;

  skillAnswers.sort((a, b) => (answerDateOr(a) < answerDateOr(b) ? -1 : 1));
  const wrongs = skillAnswers.filter((a) => !a.isCorrect);
  const lastWrong = wrongs[wrongs.length - 1];
  const cured = skillAnswers.some((a) => a.mode === "retest" && a.isCorrect);

  rec = {
    id: skillMasteryId(studentId, skillId),
    studentId,
    skillId,
    status: cured ? SKILL_STATUS.CURED : lastWrong ? SKILL_STATUS.TREATING : SKILL_STATUS.CURED,
    firstErrorAt: wrongs[0]?.createdAt || (lastWrong ? todayISO() : null),
    lastErrorAt: lastWrong ? answerDateOr(lastWrong) : null,
    retestDue: lastWrong ? addDaysToIso(answerDateOr(lastWrong), 3) : null,
    retestCount: skillAnswers.filter((a) => a.mode === "retest").length,
    successCount: skillAnswers.filter((a) => a.isCorrect).length,
    failCount: wrongs.length,
    lastRetestAt: null,
  };
  list.push(rec);
  saveSkillMastery(list);
  return rec;
}

export function getSkillMasteryAllForStudent(studentId) {
  const list = getSkillMastery().filter((r) => r.studentId === studentId);
  if (list.length) return list;
  // تهيئة من الإجابات القديمة
  const skills = new Set(getQuestions().filter((q) => getExamAnswersForStudent(studentId).some((a) => a.questionId === q.id)).map((q) => q.skill));
  skills.forEach((sk) => getSkillMasteryForStudent(studentId, sk));
  return getSkillMastery().filter((r) => r.studentId === studentId);
}

/**
 * قلب نظام الإتقان — يُستدعى عند كل إجابة تدريبية.
 * attemptKind: "first" (أول مرة) | "learned" (خطأ ثم فهمت) | "retest" (تأكيد 72 ساعة)
 */
export function advanceSkillMastery(studentId, skillId, correct, attemptKind = "first") {
  let rec = getSkillMasteryForStudent(studentId, skillId);

  // صحيحة من أول مرة بدون أخطاء سابقة → لا حاجة لسجل
  if (correct && attemptKind !== "retest" && !rec) return null;

  if (!rec) {
    rec = {
      id: skillMasteryId(studentId, skillId),
      studentId,
      skillId,
      status: SKILL_STATUS.TREATING,
      firstErrorAt: null,
      lastErrorAt: null,
      retestDue: null,
      retestCount: 0,
      successCount: 0,
      failCount: 0,
      lastRetestAt: null,
    };
    const list = getSkillMastery();
    list.push(rec);
    saveSkillMastery(list);
  }

  const list = getSkillMastery();
  const idx = list.findIndex((r) => r.id === rec.id);
  const updated = { ...rec };

  if (correct) {
    updated.successCount += 1;
    if (attemptKind === "retest") {
      updated.status = SKILL_STATUS.CURED;
      updated.lastRetestAt = todayISO();
      updated.retestDue = null;
    }
  } else {
    updated.failCount += 1;
    updated.lastErrorAt = todayISO();
    updated.firstErrorAt = updated.firstErrorAt || todayISO();
    if (attemptKind === "retest") {
      updated.retestCount += 1;
      updated.lastRetestAt = todayISO();
      if (updated.retestCount >= 2) updated.status = SKILL_STATUS.ESCALATED;
      else updated.status = SKILL_STATUS.TREATING;
    } else {
      // خطأ عادي (أول مرة أو بعد فهمت) → تبدأ ساعة الـ 72 ساعة
      updated.status = SKILL_STATUS.TREATING;
    }
    updated.retestDue = hoursFromNowDate(3);
  }

  list[idx] = updated;
  saveSkillMastery(list);
  return updated;
}

/** التأكيدات المستحقة: قيد العلاج وانتهت الـ 72 ساعة */
export function getDueSkillReviews(studentId) {
  const today = todayISO();
  return getSkillMasteryAllForStudent(studentId).filter((r) => r.status === SKILL_STATUS.TREATING && r.retestDue && r.retestDue <= today);
}

/** المهارات المطلوب تدخل المعلم فيها (تصعيد) — قواعد واضحة بلا تكرار لا نهائي */
export function computeSkillEscalations() {
  const students = getStudents();
  const qBySkill = new Map();
  getQuestions().forEach((q) => {
    if (!qBySkill.has(q.skill)) qBySkill.set(q.skill, []);
    qBySkill.get(q.skill).push(q);
  });
  const out = [];
  students.forEach((st) => {
    const recs = getSkillMasteryAllForStudent(st.id);
    recs.forEach((r) => {
      const qs = qBySkill.get(r.skillId) || [];
      const reason =
        r.status === SKILL_STATUS.ESCALATED
          ? "فشل التأكيد مرتين"
          : r.failCount >= 3
            ? "أخطأ 3+ مرات"
            : null;
      if (!reason) return;
      out.push({
        studentId: st.id,
        studentName: st.name,
        studentCode: st.code,
        skillId: r.skillId,
        skillName: r.skillId,
        questionCount: qs.length,
        failCount: r.failCount,
        successCount: r.successCount,
        status: r.status,
        lastErrorAt: r.lastErrorAt,
        reason,
      });
    });
  });
  out.sort((a, b) => b.failCount - a.failCount);
  return out;
}

/** KPI — المهارة اتأكدت (معالجة) */
export function isSkillMastered(studentId, skillId) {
  const rec = getSkillMasteryForStudent(studentId, skillId);
  return rec ? rec.status === SKILL_STATUS.CURED : false;
}

/** عند "أنا فهمت" — يعلّم الخطأ كمُتعلَّم ويحفظ نقط التعلم عليه */
export function markAnswerLearned(answerId, score) {
  const list = getExamAnswers();
  const item = list.find((a) => a.id === answerId);
  if (!item) return false;
  item.reviewed = true;
  item.reviewedAt = todayISO();
  if (typeof score === "number") item.score = score;
  saveExamAnswers(list);
  return true;
}

function addDaysToIso(iso, days) {
  if (!days) return iso;
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
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
