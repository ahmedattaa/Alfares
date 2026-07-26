// =========================================================
// App — نقطة الإقلاع المشتركة لكل الصفحات الداخلية
// =========================================================

import { seedIfNeeded, isLoggedIn, getSession, getCurrentShift } from "./storage.js";
import { renderShell } from "./ui.js";
import { canAccessPage, firstAccessiblePage } from "./permissions.js";

/** الصفحات التى تتطلب صندوق مفتوح (وردية نشطة) */
const SHIFT_REQUIRED_PAGES = [
  "session",
  "reception",
  "parent-reception",
  "finance",
  "quick-attendance",
];

export async function initPage(activePage) {
  await seedIfNeeded();

  if (!isLoggedIn()) {
    window.location.href = "login.html";
    return null;
  }

  const session = getSession();
  if (!canAccessPage(session, activePage)) {
    window.location.href = firstAccessiblePage(session);
    return null;
  }

  // لو الصفحة تتطلب صندوق مفتوح ومفيش وردية → توجيه لصفحة الصندوق
  if (SHIFT_REQUIRED_PAGES.includes(activePage) && !getCurrentShift()) {
    window.location.href = "shift.html";
    return null;
  }

  return renderShell(activePage);
}

/** يستخدم فى صفحة تسجيل الدخول فقط: يمنع الدخول للصفحة لو المستخدم مسجل بالفعل */
export async function redirectIfLoggedIn() {
  await seedIfNeeded();
  if (isLoggedIn()) {
    window.location.href = "dashboard.html";
  }
}
