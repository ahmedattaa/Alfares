// =========================================================
// App — نقطة الإقلاع المشتركة لكل الصفحات الداخلية
// =========================================================

import { seedIfNeeded, isLoggedIn, getSession, getCurrentShift, getSettings, openShift, autoCloseShift, needsInitialSetup } from "./storage.js";
import { renderShell } from "./ui.js";
import { canAccessPage, firstAccessiblePage } from "./permissions.js";
import { appPath } from "./paths.js";
import { todayISO } from "./helpers.js";

/** الصفحات التى تتطلب صندوق مفتوح (وردية نشطة) */
const SHIFT_REQUIRED_PAGES = [
  "session",
  "visit",
  "finance",
  "quick-attendance",
];

export async function initPage(activePage) {
  await seedIfNeeded();

  if (!isLoggedIn()) {
    window.location.href = appPath("login.html");
    return null;
  }

  const session = getSession();
  if (!canAccessPage(session, activePage)) {
    window.location.href = firstAccessiblePage(session);
    return null;
  }

  // مشروع فاضي لأول مرة → توجيه المدير لمعالج الإعداد الأول (كل الصفحات ما عدا المعالج نفسه)
  if (activePage !== "setup" && session.role === "admin" && needsInitialSetup()) {
    window.location.href = appPath("staff/setup.html");
    return null;
  }

  // الوضع التلقائي المخفي: افتح وردية بصمت لكل الموظفين بدون عهدة/توجيه،
  // وأغلق أي وردية من يوم سابق تلقائيًا (تسوية = التحصيلات)
  const shiftMode = getSettings().shiftMode || "hidden";
  if (session.role !== "parent" && session.role !== "student" && shiftMode === "hidden") {
    const current = getCurrentShift();
    if (current && current.openedDate !== todayISO()) {
      autoCloseShift(session?.username || "النظام");
    }
    if (!getCurrentShift()) {
      openShift(0, session?.username || "النظام");
    }
  }

  // لو الصفحة تتطلب صندوق مفتوح ومفيش وردية → توجيه لصفحة الصندوق (ما عدا ولي الأمر والطالب)
  if (session.role !== "parent" && session.role !== "student" && SHIFT_REQUIRED_PAGES.includes(activePage) && !getCurrentShift() && shiftMode !== "disabled" && shiftMode !== "hidden") {
    window.location.href = appPath("staff/shift.html");
    return null;
  }

  return renderShell(activePage);
}

/** يستخدم فى صفحة تسجيل الدخول فقط: يمنع الدخول للصفحة لو المستخدم مسجل بالفعل */
export async function redirectIfLoggedIn() {
  await seedIfNeeded();
  if (isLoggedIn()) {
    const session = getSession();
    if (session?.role === "student") {
      window.location.href = appPath("student/");
    } else if (session?.role === "parent") {
      window.location.href = appPath("parent/");
    } else {
      window.location.href = appPath("staff/dashboard.html");
    }
  }
}
