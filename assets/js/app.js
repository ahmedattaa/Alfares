// =========================================================
// App — نقطة الإقلاع المشتركة لكل الصفحات الداخلية
// =========================================================

import { seedIfNeeded, isLoggedIn, getSession } from "./storage.js";
import { renderShell } from "./ui.js";
import { canAccessPage, firstAccessiblePage } from "./permissions.js";

/**
 * يجهز الصفحة: تحميل البيانات، التحقق من تسجيل الدخول، التحقق من الصلاحية، بناء الهيكل العام
 * يرجع عنصر #pageContent لكى تضيف عليه كل صفحة محتواها الخاص
 */
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

  return renderShell(activePage);
}

/** يستخدم فى صفحة تسجيل الدخول فقط: يمنع الدخول للصفحة لو المستخدم مسجل بالفعل */
export async function redirectIfLoggedIn() {
  await seedIfNeeded();
  if (isLoggedIn()) {
    window.location.href = "dashboard.html";
  }
}
