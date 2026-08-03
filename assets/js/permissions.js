// =========================================================
// Permissions — نظام الصلاحيات التفصيلي
// كل صفحة لها أكشنات داخلية، والمدير يتحكم في كل واحد
// =========================================================

import { appPath } from "./paths.js";

/** الصفحات القابلة للتحكم — الرئيسية متاحة دائمًا، والإعدادات للمدير فقط */
export const PERMISSION_PAGES = [
  { id: "session", label: "إدارة الحصة", icon: "📋" },
  { id: "visit", label: "لوحة ولي الأمر", icon: "👨‍👩‍👦" },
  { id: "students", label: "الطلاب", icon: "🎓" },
  { id: "followup", label: "المتابعة", icon: "📊" },
  { id: "teacher-insights", label: "لوحة المعلم", icon: "💡" },
  { id: "exams", label: "الامتحانات", icon: "📝" },
  { id: "finance", label: "اليومية المالية", icon: "💰" },
  { id: "shift", label: "الصندوق", icon: "🏦" },
  { id: "rollover", label: "ترحيل الطلاب", icon: "🔄" },
  { id: "attendance-tracker", label: "متابعة الحضور", icon: "📅" },
];

/** أكشنات كل صفحة — (id, label, sensitive) */
export const PAGE_ACTIONS = {
  session: [
    { id: "record_attendance", label: "تسجيل حضور وغياب", sensitive: false },
    { id: "record_action", label: "إجراءات استثنائية", sensitive: false },
    { id: "send_whatsapp", label: "إرسال واتساب فردي", sensitive: false },
    { id: "bulk_whatsapp", label: "إرسال واتساب جماعي", sensitive: false },
    { id: "wallet_deposit", label: "إيداع في المحفظة", sensitive: true },
    { id: "collection", label: "تحصيل الديون", sensitive: false },
  ],
  visit: [
    { id: "view", label: "عرض بيانات الطالب", sensitive: false },
    { id: "record_attendance", label: "تسجيل حضور", sensitive: false },
    { id: "finance", label: "عرض البيانات المالية", sensitive: false },
    { id: "wallet_deposit", label: "إيداع في المحفظة", sensitive: true },
    { id: "send_whatsapp", label: "إرسال واتساب", sensitive: false },
    { id: "add_followup", label: "إضافة ملاحظة متابعة", sensitive: false },
    { id: "advance_permission", label: "إدارة إذن متقدم", sensitive: false },
    { id: "collection", label: "تحصيل الديون", sensitive: false },
  ],
  students: [
    { id: "view", label: "عرض قائمة الطلاب", sensitive: false },
    { id: "add", label: "إضافة طالب جديد", sensitive: false },
    { id: "edit", label: "تعديل بيانات طالب", sensitive: false },
    { id: "delete", label: "حذف طالب", sensitive: true },
    { id: "exceptional_action", label: "إجراءات استثنائية", sensitive: true },
    { id: "export", label: "تصدير بيانات", sensitive: false },
    { id: "collection", label: "تحصيل الديون", sensitive: false },
  ],
  followup: [
    { id: "view", label: "عرض تقارير المتابعة", sensitive: false },
    { id: "export", label: "تصدير التقارير", sensitive: false },
    { id: "send_whatsapp", label: "إرسال تقرير فردي", sensitive: false },
    { id: "bulk_whatsapp", label: "إرسال تقرير جماعي", sensitive: false },
    { id: "add_note", label: "إضافة ملاحظة متابعة", sensitive: false },
    { id: "collection", label: "تحصيل الديون", sensitive: false },
  ],
  "teacher-insights": [
    { id: "view", label: "عرض لوحة المعلم", sensitive: false },
    { id: "send_whatsapp", label: "إرسال واتساب", sensitive: false },
    { id: "bulk_whatsapp", label: "إرسال جماعي", sensitive: false },
    { id: "escalation_override", label: "تجاوز التصعيد", sensitive: true },
    { id: "log_call", label: "تسجيل اتصال هاتفي", sensitive: false },
    { id: "collection", label: "تحصيل الديون", sensitive: false },
  ],
  exams: [
    { id: "view", label: "عرض الامتحانات", sensitive: false },
    { id: "create", label: "إنشاء امتحان", sensitive: false },
    { id: "edit_grades", label: "تعديل الدرجات", sensitive: false },
    { id: "delete", label: "حذف امتحان", sensitive: true },
    { id: "send_whatsapp", label: "إرسال النتائج", sensitive: false },
    { id: "export", label: "تصدير الدرجات", sensitive: false },
  ],
  finance: [
    { id: "view", label: "عرض التقارير المالية", sensitive: false },
    { id: "add_charge", label: "إضافة استحقاق", sensitive: true },
    { id: "send_whatsapp", label: "إرسال تذكير واتساب", sensitive: false },
    { id: "export", label: "تصدير التقارير", sensitive: false },
    { id: "collection", label: "تحصيل الديون", sensitive: false },
  ],
  shift: [
    { id: "view", label: "عرض الصندوق", sensitive: false },
    { id: "open", label: "فتح وردية", sensitive: false },
    { id: "close", label: "إغلاق وردية وتسوية", sensitive: true },
  ],
  rollover: [
    { id: "view", label: "عرض صفحة الترحيل", sensitive: false },
    { id: "execute", label: "تنفيذ الترحيل", sensitive: true },
  ],
  "attendance-tracker": [
    { id: "view", label: "عرض جدول الحضور", sensitive: false },
    { id: "export", label: "تصدير/طباعة", sensitive: false },
  ],
};

/**
 * هل المستخدم مسموح له بهذا الأكشن؟
 * - المدير: كل حاجة مسموحة
 * - المساعد: لازم الصفحة مفعّلة + الأكشن مفعّل (أو مفيش تحديد = كل حاجة)
 */
export function canPerformAction(session, pageId, actionId) {
  if (!session) return false;
  if (session.role === "admin") return true;

  const perms = session.permissions || [];
  if (!perms.includes(pageId)) return false;

  const actions = session.actions || {};
  const pageActions = actions[pageId];

  if (!pageActions || pageActions.length === 0) return true;

  return pageActions.includes(actionId);
}

/** هل المستخدم مسموح له بالوصول لهذه الصفحة؟ */
export function canAccessPage(session, pageId) {
  if (!session) return false;
  if (session.role === "admin") return true;
  if (session.role === "parent") return pageId === "visit" || pageId === "parent";
  if (session.role === "student") return pageId === "visit" || pageId === "parent";
  if (pageId === "dashboard") return true;
  if (pageId === "settings") return false;
  if (pageId === "setup") return false;
  if (pageId === "student" || pageId === "student-form" || pageId === "group-students") return (session.permissions || []).includes("students");
  if (pageId === "quick-attendance") return (session.permissions || []).includes("session");
  if (pageId === "attendance-tracker") return (session.permissions || []).includes("teacher-insights") || (session.permissions || []).includes("session");
  return (session.permissions || []).includes(pageId);
}

/** هل المستخدم الحالي له صلاحية تنفيذ عمليات حساسة — للمدير فقط (legacy) */
export function canPerformSensitiveAction(session) {
  if (!session) return false;
  return session.role === "admin";
}

/** أول صفحة متاحة للمستخدم */
export function firstAccessiblePage(session) {
  if (!session) return appPath("login.html");
  if (session.role === "admin") return appPath("staff/dashboard.html");
  if (session.role === "parent") return appPath("parent/");
  if (session.role === "student") return appPath("student/");
  const allowed = PERMISSION_PAGES.find((p) => (session.permissions || []).includes(p.id));
  return allowed ? appPath(`staff/${allowed.id}.html`) : appPath("staff/dashboard.html");
}
