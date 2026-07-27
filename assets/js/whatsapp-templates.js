// =========================================================
// WhatsApp Templates — سجل قوالب رسائل الواتساب
//
// كل قوالب الرسائل المستخدمة فى النظام (لولي الأمر / للطالب / غيره)
// مسجّلة هنا مع النص الافتراضى والمتغيرات القابلة للتعديل.
// المستخدم يقدر يعدّل أى قالب من الإعدادات.
// =========================================================

import { getSettings } from "./storage.js";

/**
 * سجل القوالب — كل قالب ليه:
 *   id            — معرف فريد
 *   name          — اسم عربى للعرض
 *   category      — التصنيف (attendance, absence, exam, escalation, achievement, wallet, general)
 *   recipient     — المتلقى (parent, student)
 *   defaultBody   — النص الافتراضى مع متغيرات {placeholder}
 *   placeholders  — قائمة المتغيرات [{key, label}]
 *   source        — الملف المصدر
 */
export const TEMPLATE_REGISTRY = [
  // ────── الحضور ──────
  {
    id: "att_paid",
    name: "إشعار حضور (مدفوع)",
    category: "attendance",
    recipient: "parent",
    source: "whatsapp-notifications.js",
    placeholders: [
      { key: "studentName", label: "اسم الطالب" },
      { key: "dateStr", label: "التاريخ" },
      { key: "groupName", label: "اسم المجموعة" },
      { key: "groupCode", label: "كود المجموعة" },
      { key: "collected", label: "المبلغ المدفوع" },
      { key: "remaining", label: "المتبقي" },
      { key: "centerName", label: "اسم السنتر" },
    ],
    defaultBody: `عزيزي ولي أمر الطالب/ة {studentName}،

✅ تم تسجيل حضور الطالب/ة في حصة اليوم
📅 التاريخ: {dateStr}
📚 المجموعة: {groupName} - {groupCode}
💰 حالة الدفع: مدفوع ✅
💵 المبلغ المدفوع: {collected}
📊 المتبقي على الطالب: {remaining}

نتمنى لكم يوماً سعيداً
{centerName}`,
  },
  {
    id: "att_unpaid",
    name: "إشعار حضور (غير مدفوع)",
    category: "attendance",
    recipient: "parent",
    source: "whatsapp-notifications.js",
    placeholders: [
      { key: "studentName", label: "اسم الطالب" },
      { key: "dateStr", label: "التاريخ" },
      { key: "groupName", label: "اسم المجموعة" },
      { key: "groupCode", label: "كود المجموعة" },
      { key: "collected", label: "المبلغ المستحق" },
      { key: "centerName", label: "اسم السنتر" },
    ],
    defaultBody: `عزيزي ولي أمر الطالب/ة {studentName}،

✅ تم تسجيل حضور الطالب/ة في حصة اليوم
📅 التاريخ: {dateStr}
📚 المجموعة: {groupName} - {groupCode}
💰 حالة الدفع: مستحق (لم يُدفع بعد)
📊 المبلغ المستحق: {collected}

نتمنى لكم يوماً سعيداً
{centerName}`,
  },

  // ────── الغياب ──────
  {
    id: "absence_notification",
    name: "إشعار غياب",
    category: "absence",
    recipient: "parent",
    source: "whatsapp-notifications.js",
    placeholders: [
      { key: "studentName", label: "اسم الطالب" },
      { key: "dateStr", label: "التاريخ" },
      { key: "groupName", label: "اسم المجموعة" },
      { key: "groupCode", label: "كود المجموعة" },
      { key: "statusName", label: "اسم الحالة" },
      { key: "centerName", label: "اسم السنتر" },
    ],
    defaultBody: `عزيزي ولي أمر الطالب/ة {studentName}،

⚠️ نود إبلاغكم بغياب الطالب/ة عن حصة اليوم
📅 التاريخ: {dateStr}
📚 المجموعة: {groupName} - {groupCode}
📝 الحالة: {statusName}

للتواصل والاستفسار
{centerName}`,
  },
  {
    id: "absence_without_permission",
    name: "تنبيه غياب بدون إذن (سريع)",
    category: "absence",
    recipient: "parent",
    source: "quick-attendance.js",
    placeholders: [
      { key: "studentName", label: "اسم الطالب" },
      { key: "dateStr", label: "التاريخ" },
      { key: "centerName", label: "اسم السنتر" },
    ],
    defaultBody: `مرحباً، أنا مستر فارس من {centerName}. الطالب/ة {studentName} غاب اليوم {dateStr} بدون إذن. يرجى المتابعة.`,
  },
  {
    id: "absence_with_permission",
    name: "تنبيه غياب بإذن (سريع)",
    category: "absence",
    recipient: "parent",
    source: "quick-attendance.js",
    placeholders: [
      { key: "studentName", label: "اسم الطالب" },
      { key: "dateStr", label: "التاريخ" },
      { key: "centerName", label: "اسم السنتر" },
    ],
    defaultBody: `مرحباً، أنا مستر فارس من {centerName}. الطالب/ة {studentName} غاب اليوم {dateStr} بإذن. شكراً لكم.`,
  },
  {
    id: "absence_general",
    name: "تنبيه غياب عام (سريع)",
    category: "absence",
    recipient: "parent",
    source: "quick-attendance.js",
    placeholders: [
      { key: "studentName", label: "اسم الطالب" },
      { key: "dateStr", label: "التاريخ" },
      { key: "centerName", label: "اسم السنتر" },
    ],
    defaultBody: `مرحباً، أنا مستر فارس من {centerName}. الطالب/ة {studentName} غاب اليوم {dateStr}. يرجى المتابعة.`,
  },

  // ────── الامتحانات ──────
  {
    id: "exam_result",
    name: "نتيجة امتحان (فردى)",
    category: "exam",
    recipient: "parent",
    source: "whatsapp-notifications.js",
    placeholders: [
      { key: "studentName", label: "اسم الطالب" },
      { key: "examTitle", label: "اسم الامتحان" },
      { key: "dateStr", label: "التاريخ" },
      { key: "score", label: "الدرجة" },
      { key: "maxScore", label: "أعلى درجة" },
      { key: "percentage", label: "النسبة" },
      { key: "gradeComment", label: "تعليق على الدرجة" },
      { key: "centerName", label: "اسم السنتر" },
    ],
    defaultBody: `عزيزي ولي أمر الطالب/ة {studentName}،

📊 نتيجة الامتحان
📝 الامتحان: {examTitle}
📅 التاريخ: {dateStr}
✅ الدرجة: {score} من {maxScore}
📈 النسبة: {percentage}%

{gradeComment}

مع تحيات {centerName}`,
  },
  {
    id: "exam_absent_notification",
    name: "غياب عن امتحان",
    category: "exam",
    recipient: "parent",
    source: "exams.js",
    placeholders: [
      { key: "studentName", label: "اسم الطالب" },
      { key: "examTitle", label: "اسم الامتحان" },
      { key: "dateStr", label: "التاريخ" },
      { key: "centerName", label: "اسم السنتر" },
    ],
    defaultBody: `عزيزي ولي أمر الطالب/ة {studentName}،

❌ إشعار غياب عن امتحان
📝 الامتحان: {examTitle}
📅 التاريخ: {dateStr}
❌ الحالة: غائب عن الامتحان

يرجى المتابعة مع الطالب.

{centerName}`,
  },
  {
    id: "exam_bulk",
    name: "نتائج امتحان (جماعى)",
    category: "exam",
    recipient: "parent",
    source: "whatsapp-notifications.js",
    placeholders: [
      { key: "emoji", label: "إيموجى الحالة" },
      { key: "studentName", label: "اسم الطالب" },
      { key: "examTitle", label: "اسم الامتحان" },
      { key: "score", label: "الدرجة" },
      { key: "maxScore", label: "أعلى درجة" },
      { key: "pct", label: "النسبة" },
      { key: "centerName", label: "اسم السنتر" },
    ],
    defaultBody: `{emoji} *نتيجة امتحان — {centerName}*

ولي أمر الطالب/ة *{studentName}*،

نتيجة "{examTitle}":
📊 الدرجة: *{score} / {maxScore}*
📈 النسبة: *{pct}%*

نتمنى لهم دوام التقدم.
مع تحيات {centerName}`,
  },
  {
    id: "exam_result_simple",
    name: "نتيجة امتحان (بسيطة — من صفحة الامتحانات)",
    category: "exam",
    recipient: "parent",
    source: "exams.js",
    placeholders: [
      { key: "studentName", label: "اسم الطالب" },
      { key: "examTitle", label: "اسم الامتحان" },
      { key: "score", label: "الدرجة" },
      { key: "maxScore", label: "أعلى درجة" },
      { key: "centerName", label: "اسم السنتر" },
    ],
    defaultBody: `عزيزى ولى أمر الطالب/ة {studentName}،

نود إعلامكم بنتيجة "{examTitle}":
الدرجة: {score} من {maxScore}

مع تحيات {centerName}`,
  },

  // ────── التصعيد ──────
  {
    id: "esc_level1",
    name: "تنبيه المستوى الأول (غياب أول)",
    category: "escalation",
    recipient: "parent",
    source: "escalation-engine.js",
    placeholders: [
      { key: "studentName", label: "اسم الطالب" },
      { key: "centerName", label: "اسم السنتر" },
    ],
    defaultBody: `بسم الله، ولى أمر الطالب/ة {studentName} المحترم/ة،

نود إعلامكم إن الطالب/ة {studentName} لم يحضر حصة اليوم.
نتمنى لهم وللطالب/ة صحة وعافية.

للتواصل: {centerName}`,
  },
  {
    id: "esc_level2",
    name: "تنبيه المستوى التانى (غياب متكرر)",
    category: "escalation",
    recipient: "parent",
    source: "escalation-engine.js",
    placeholders: [
      { key: "studentName", label: "اسم الطالب" },
      { key: "centerName", label: "اسم السنتر" },
    ],
    defaultBody: `السيد/ة ولى أمر الطالب/ة {studentName} المحترم/ة،

نلاحظ غياب الطالب/ة {studentName} بشكل متكرر.
نرجو منكم التواصل معنا للتحقق من سبب الغياب.

رقم التواصل: {centerName}
هذا تنبيه ودي — نهتم على تقدم الطالب/ة.`,
  },
  {
    id: "esc_level3",
    name: "تنبيه المستوى التالت (قفل الحساب)",
    category: "escalation",
    recipient: "parent",
    source: "escalation-engine.js",
    placeholders: [
      { key: "studentName", label: "اسم الطالب" },
      { key: "centerName", label: "اسم السنتر" },
    ],
    defaultBody: `السيد/ة ولى أمر الطالب/ة {studentName} المحترم/ة،

إشعار هام: الطالب/ة {studentName} متغيب عن عدة حصص متتالية.

نرجو حضوركم السنتر في أقرب وقت لمناقشة الموقف.
حساب الطالب/ة متوقف مؤقتاً حتى حضور ولي الأمر.

مع تحيات {centerName}`,
  },

  // ────── الإنجازات ──────
  {
    id: "ach_perfect",
    name: "إنجاز: درجة كاملة",
    category: "achievement",
    recipient: "parent",
    source: "achievement-engine.js",
    placeholders: [
      { key: "studentName", label: "اسم الطالب" },
      { key: "teacherName", label: "اسم المدرس" },
      { key: "newScore", label: "الدرجة الجديدة" },
      { key: "maxScore", label: "أعلى درجة" },
      { key: "examTitle", label: "اسم الامتحان" },
    ],
    defaultBody: `🏆 درجة كاملة! برافو {studentName}!

مستر {teacherName} فخور جداً بحصولك على {newScore} من {maxScore} في امتحان "{examTitle}" — درجة كاملة ومجهود يستحق التقدير.

أدام الله تقدمك ونجاحك 💪`,
  },
  {
    id: "ach_jump",
    name: "إنجاز: قفزة أكاديمية",
    category: "achievement",
    recipient: "parent",
    source: "achievement-engine.js",
    placeholders: [
      { key: "studentName", label: "اسم الطالب" },
      { key: "teacherName", label: "اسم المدرس" },
      { key: "examTitle", label: "اسم الامتحان" },
      { key: "newPct", label: "النسبة الجديدة" },
      { key: "oldAvg", label: "المتوسط السابق" },
      { key: "improvement", label: "نسبة التحسن" },
    ],
    defaultBody: `🚀 قفزة أكاديمية مذهلة!

برافو {studentName}! مستر {teacherName} لاحظ تقدمك الملموس في امتحان "{examTitle}" — حصلت على {newPct}% ومتوسطه كان {oldAvg}%.

ده تحسن {improvement}% ودليل واضح على جهدك. كمّل كده! ⭐`,
  },
  {
    id: "ach_excellence",
    name: "إنجاز: تميز أكاديمي",
    category: "achievement",
    recipient: "parent",
    source: "achievement-engine.js",
    placeholders: [
      { key: "studentName", label: "اسم الطالب" },
      { key: "teacherName", label: "اسم المدرس" },
      { key: "examTitle", label: "اسم الامتحان" },
      { key: "newPct", label: "النسبة الجديدة" },
      { key: "oldAvg", label: "المتوسط السابق" },
    ],
    defaultBody: `⭐ تميّز أكاديمي!

{studentName} حصل على {newPct}% في امتحان "{examTitle}" — تقدم ملحوظ عن متوسطه السابق ({oldAvg}%).

مستر {teacherName} فخور جداً بتطورك. استمر يا بطل! 🌟`,
  },
  {
    id: "ach_recovery",
    name: "إنجاز: تعافي وتطور",
    category: "achievement",
    recipient: "parent",
    source: "achievement-engine.js",
    placeholders: [
      { key: "studentName", label: "اسم الطالب" },
      { key: "teacherName", label: "اسم المدرس" },
      { key: "examTitle", label: "اسم الامتحان" },
      { key: "oldAvg", label: "المتوسط السابق" },
      { key: "newPct", label: "النسبة الجديدة" },
    ],
    defaultBody: `💪 تعافي وتطور رائع!

خبر سعيد {studentName}! مستر {teacherName} يلاحظ تحسنك الكبير في امتحان "{examTitle}" — من {oldAvg}% إلى {newPct}%.

ده تأكد إنك في الطريق الصح. نفوس عليك! 🎯`,
  },
  {
    id: "ach_consistent",
    name: "إنجاز: تحسن مستمر",
    category: "achievement",
    recipient: "parent",
    source: "achievement-engine.js",
    placeholders: [
      { key: "studentName", label: "اسم الطالب" },
      { key: "teacherName", label: "اسم المدرس" },
      { key: "examTitle", label: "اسم الامتحان" },
      { key: "newPct", label: "النسبة الأخيرة" },
    ],
    defaultBody: `📈 تحسن مستمر وملحوظ!

{studentName} بيظهر تقدماً مستمراً في كل امتحان. آخر نتيجة في "{examTitle}" كانت {newPct}%.

مستر {teacherName} يشجعك على الاستمرار — الإصرار والجهد مفتاح النجاح! 🔑`,
  },
  {
    id: "ach_default",
    name: "إنجاز: افتراضى",
    category: "achievement",
    recipient: "parent",
    source: "achievement-engine.js",
    placeholders: [
      { key: "studentName", label: "اسم الطالب" },
      { key: "teacherName", label: "اسم المدرس" },
      { key: "examTitle", label: "اسم الامتحان" },
      { key: "newPct", label: "النسبة" },
    ],
    defaultBody: `🎉 إنجاز أكاديمي!

{studentName} حصل على نتيجة ممتازة في امتحان "{examTitle}" — {newPct}%.

مستر {teacherName} فخور بيك! كمّل التقدم 💪`,
  },
  {
    id: "ach_batch",
    name: "إنجازات مجمّعة (متعددة)",
    category: "achievement",
    recipient: "parent",
    source: "achievement-engine.js",
    placeholders: [
      { key: "studentName", label: "اسم الطالب" },
      { key: "teacherName", label: "اسم المدرس" },
      { key: "achievementsList", label: "قائمة الإنجازات" },
    ],
    defaultBody: `🎉 إنجازات {studentName} الأخيرة:

{achievementsList}

مستر {teacherName} فخور جداً بتقدمك. كمّل كده! 💪`,
  },

  // ────── المحفظة ──────
  {
    id: "wallet_deposit",
    name: "تأكيد إيداع المحفظة (حصة سريعة)",
    category: "wallet",
    recipient: "parent",
    source: "quick-attendance.js",
    placeholders: [
      { key: "studentName", label: "اسم الطالب" },
      { key: "amount", label: "المبلغ" },
      { key: "debtCovered", label: "نص تغطية المتأخرات (فارغ لو لا يوجد)" },
      { key: "newWalletBalance", label: "الرصيد المتاح" },
      { key: "centerName", label: "اسم السنتر" },
    ],
    defaultBody: `تم استلام {amount} لحساب {studentName}{debtCovered}. الرصيد المتاح: {newWalletBalance}. شكراً لكم — {centerName}`,
  },
  {
    id: "wallet_deposit_reception",
    name: "تأكيد إيداع المحفظة (استقبال ولي أمر)",
    category: "wallet",
    recipient: "parent",
    source: "parent-reception.js",
    placeholders: [
      { key: "studentName", label: "اسم الطالب" },
      { key: "amount", label: "المبلغ" },
      { key: "newWalletBalance", label: "الرصيد المتاح" },
      { key: "centerName", label: "اسم السنتر" },
    ],
    defaultBody: `تم استلام {amount} لحساب {studentName}. الرصيد المتاح: {newWalletBalance}. شكراً لكم — {centerName}`,
  },

  // ────── عامة ──────
  {
    id: "gen_teacher_contact",
    name: "تواصل المدرس مع ولي الأمر",
    category: "general",
    recipient: "parent",
    source: "teacher-insights.js",
    placeholders: [
      { key: "studentName", label: "اسم الطالب" },
      { key: "centerName", label: "اسم السنتر" },
    ],
    defaultBody: `مرحباً، أنا مستر فارس من {centerName}. أردت التواصل بخصوص أداء {studentName}.`,
  },
  {
    id: "gen_disengaged_alert",
    name: "إنذار انقطاع عاجل",
    category: "general",
    recipient: "parent",
    source: "teacher-insights.js",
    placeholders: [
      { key: "studentName", label: "اسم الطالب" },
      { key: "groupName", label: "اسم المجموعة" },
      { key: "reason", label: "سبب الإنذار" },
      { key: "centerName", label: "اسم السنتر" },
    ],
    defaultBody: `⚠️ *إنذار عاجل — {centerName}*

الطالب/ة: *{studentName}*
المجموعة: {groupName}
السبب: {reason}

نود إخطاركم بأن الطالب/ة يتعرض لخطر الانقطاع التام عن الحصص التعليمية. نطلب منكم المتابعة العاجلة والتواصل مع الإدارة لتجنب اتخاذ إجراءات إضافية.

مع تحيات إدارة السنتر`,
  },
  {
    id: "gen_summary",
    name: "ملخص حالة الطالب",
    category: "general",
    recipient: "parent",
    source: "parent-reception.js",
    placeholders: [
      { key: "studentName", label: "اسم الطالب" },
      { key: "wallet", label: "الرصيد المتاح" },
      { key: "debt", label: "المتأخرات" },
      { key: "groupName", label: "اسم المجموعة" },
      { key: "centerName", label: "اسم السنتر" },
    ],
    defaultBody: `مرحباً، هذا ملخص حالة {studentName} في {centerName}:
• الرصيد المتاح: {wallet}
• المتأخرات: {debt}
• المجموعة: {groupName}`,
  },
  {
    id: "gen_custom_opener",
    name: "رسالة مفتوحة (بداية)",
    category: "general",
    recipient: "parent",
    source: "parent-reception.js",
    placeholders: [
      { key: "studentName", label: "اسم الطالب" },
      { key: "centerName", label: "اسم السنتر" },
    ],
    defaultBody: `مرحباً، أنا مستر فارس من {centerName}. بخصوص {studentName}...`,
  },
  {
    id: "reward_notification",
    name: "تهنئة مكافأة (نجم الحصة)",
    category: "achievement",
    recipient: "parent",
    source: "whatsapp-notifications.js",
    placeholders: [
      { key: "studentName", label: "اسم الطالب" },
      { key: "parentName", label: "اسم ولي الأمر" },
      { key: "statusName", label: "لقب المكافأة" },
      { key: "rewardAmount", label: "المبلغ المكافأة" },
      { key: "centerName", label: "اسم السنتر" },
    ],
    defaultBody: `🌟 *تهنئة خاصة من {centerName}*

{parentName} المحترم/ة،

يسعدنا أن نبلغكم أن نجلكم *{studentName}*
 قد حصل على لقب *"{statusName}"* اليوم! 🏆

💰 *مكافأة: {rewardAmount}*
تمت إضافتها للمحفظة بنجاح.

نتمنى لهم دوام التفوق والنجاح.

مع تحيات {centerName}`,
  },
  {
    id: "gen_student_contact",
    name: "تواصل مع ولي أمر (من صفحة الطالب)",
    category: "general",
    recipient: "parent",
    source: "student.js",
    placeholders: [
      { key: "studentName", label: "اسم الطالب" },
    ],
    defaultBody: `عزيزى ولى أمر الطالب/ة {studentName}،`,
  },
  {
    id: "gen_monthly_report",
    name: "تقرير المتابعة الشهرية",
    category: "general",
    recipient: "parent",
    source: "reports.js",
    placeholders: [
      { key: "studentName", label: "اسم الطالب" },
      { key: "period", label: "الفترة" },
      { key: "reportBody", label: "نص التقرير" },
      { key: "centerName", label: "اسم السنتر" },
    ],
    defaultBody: `تقرير متابعة حالة الطالب: {studentName}
عن الفترة من {period}

{reportBody}

مع تحيات {centerName}`,
  },
];

/** قائمة التصنيفات مع أسمائها وأيقوناتها */
export const CATEGORIES = [
  { id: "attendance", label: "الحضور", icon: "✅" },
  { id: "absence", label: "الغياب", icon: "⚠️" },
  { id: "exam", label: "الامتحانات", icon: "📊" },
  { id: "escalation", label: "التصعيد", icon: "🔔" },
  { id: "achievement", label: "الإنجازات", icon: "🏆" },
  { id: "wallet", label: "المحفظة", icon: "💳" },
  { id: "general", label: "عامة", icon: "💬" },
];

/**
 * يجلب نص القالب المعدّل (لو موجود) أو الافتراضى.
 * @param {string} templateId
 * @returns {{ body: string, isDefault: boolean }}
 */
export function getTemplateBody(templateId) {
  const tpl = TEMPLATE_REGISTRY.find((t) => t.id === templateId);
  if (!tpl) return { body: "", isDefault: true };

  // يقرأ من التخزين المحلى (التعديلات اللى حفظها المستخدم)
  try {
    const overrides = JSON.parse(localStorage.getItem("wa_template_overrides") || "{}");
    if (overrides[templateId]) {
      return { body: overrides[templateId], isDefault: false };
    }
  } catch (_) {}

  return { body: tpl.defaultBody, isDefault: true };
}

/**
 * يحفظ تعديل المستخدم على قالب معين.
 * @param {string} templateId
 * @param {string} newBody
 */
export function saveTemplateOverride(templateId, newBody) {
  try {
    const overrides = JSON.parse(localStorage.getItem("wa_template_overrides") || "{}");
    overrides[templateId] = newBody;
    localStorage.setItem("wa_template_overrides", JSON.stringify(overrides));
  } catch (_) {}
}

/**
 * يمسح تعديل المستخدم على قالب معين (يعيد للنص الافتراضى).
 * @param {string} templateId
 */
export function resetTemplate(templateId) {
  try {
    const overrides = JSON.parse(localStorage.getItem("wa_template_overrides") || "{}");
    delete overrides[templateId];
    localStorage.setItem("wa_template_overrides", JSON.stringify(overrides));
  } catch (_) {}
}

/**
 * يمسح كل التعديلات ويعيد كل القوالب للنصوص الافتراضية.
 */
export function resetAllTemplates() {
  localStorage.removeItem("wa_template_overrides");
}

/**
 * يRender template by replacing {key} placeholders with actual values.
 * @param {string} templateId
 * @param {Object} values — { key: value, ... }
 * @returns {string} — the rendered message
 */
export function renderTemplate(templateId, values = {}) {
  const { body } = getTemplateBody(templateId);
  if (!body) return "";
  return body.replace(/\{(\w+)\}/g, (match, key) => {
    return values[key] !== undefined ? String(values[key]) : match;
  });
}

/**
 * يجلب كل التعديلات المحفوظة.
 * @returns {Object} — { templateId: modifiedBody, ... }
 */
export function getAllOverrides() {
  try {
    return JSON.parse(localStorage.getItem("wa_template_overrides") || "{}");
  } catch (_) {
    return {};
  }
}
