// =========================================================
// Permissions — صلاحيات المدرسين المساعدين (أى صفحات مسموح لهم بيها)
// =========================================================

/** الصفحات القابلة للتحكم فى صلاحياتها (الرئيسية متاحة دائمًا، والإعدادات للمدير فقط) */
export const PERMISSION_PAGES = [
  { id: "session", label: "إدارة الحصة" },
  { id: "reception", label: "استقبال الطلاب" },
  { id: "parent-reception", label: "استقبال ولي الأمر" },
  { id: "attendance-tracker", label: "متابعة الحضور والغياب" },
  { id: "students", label: "الطلاب" },
  { id: "followup", label: "المتابعة" },
  { id: "teacher-insights", label: "لوحة المعلم" },
  { id: "exams", label: "الامتحانات" },
  { id: "finance", label: "اليومية المالية" },
  { id: "shift", label: "الصندوق" },
  { id: "rollover", label: "ترحيل الطلاب" },
];

/** هل المستخدم الحالى مسموح له بالوصول لهذه الصفحة؟ */
export function canAccessPage(session, pageId) {
  if (!session) return false;
  if (session.role === "admin") return true;
  if (pageId === "dashboard") return true;
  if (pageId === "settings") return false;
  if (pageId === "student" || pageId === "student-form") return (session.permissions || []).includes("students");
  if (pageId === "quick-attendance") return (session.permissions || []).includes("session");
  if (pageId === "attendance-tracker") return (session.permissions || []).includes("teacher-insights") || (session.permissions || []).includes("session");
  return (session.permissions || []).includes(pageId);
}

/** هل المستخدم الحالي له صلاحية تنفيذ عمليات حساسة (إيداع / حذف)؟ — المدير فقط */
export function canPerformSensitiveAction(session) {
  if (!session) return false;
  return session.role === "admin";
}

/** أول صفحة متاحة للمستخدم (تستخدم لإعادة التوجيه بدل الصفحة الممنوعة) */
export function firstAccessiblePage(session) {
  if (!session) return "login.html";
  if (session.role === "admin") return "dashboard.html";
  const allowed = PERMISSION_PAGES.find((p) => (session.permissions || []).includes(p.id));
  return allowed ? `${allowed.id}.html` : "dashboard.html";
}
