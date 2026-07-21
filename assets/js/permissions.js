// =========================================================
// Permissions — صلاحيات المدرسين المساعدين (أى صفحات مسموح لهم بيها)
// =========================================================

/** الصفحات القابلة للتحكم فى صلاحياتها (الرئيسية متاحة دائمًا، والإعدادات للمدير فقط) */
export const PERMISSION_PAGES = [
  { id: "session", label: "إدارة الحصة" },
  { id: "reception", label: "استقبال الطلاب" },
  { id: "students", label: "الطلاب" },
  { id: "followup", label: "المتابعة" },
  { id: "exams", label: "الامتحانات" },
  { id: "finance", label: "اليومية المالية" },
];

/** هل المستخدم الحالى مسموح له بالوصول لهذه الصفحة؟ */
export function canAccessPage(session, pageId) {
  if (!session) return false;
  if (session.role === "admin") return true;
  if (pageId === "dashboard") return true;
  if (pageId === "settings") return false;
  if (pageId === "student" || pageId === "student-form") return (session.permissions || []).includes("students");
  return (session.permissions || []).includes(pageId);
}

/** أول صفحة متاحة للمستخدم (تستخدم لإعادة التوجيه بدل الصفحة الممنوعة) */
export function firstAccessiblePage(session) {
  if (!session) return "login.html";
  if (session.role === "admin") return "dashboard.html";
  const allowed = PERMISSION_PAGES.find((p) => (session.permissions || []).includes(p.id));
  return allowed ? `${allowed.id}.html` : "dashboard.html";
}
