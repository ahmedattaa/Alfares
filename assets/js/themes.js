// =========================================================
// Themes — السيمز (المظهر) الخاصة بكل حساب على حدة
// =========================================================

import { getSettings, saveSettings, getSession } from "./storage.js";

/** السيمز المتاحة، بألوانها الأساسية لعرضها كمعاينة صغيرة (Swatch) */
export const THEMES = [
  { id: "default", name: "الافتراضى", swatch: "#2563EB" },
  { id: "dark-mode", name: "الوضع الداكن", swatch: "#3B82F6" },
  { id: "nature-green", name: "أخضر طبيعى", swatch: "#059669" },
  { id: "royal-purple", name: "بنفسجى ملكى", swatch: "#6D28D9" },
];

/** ثيم المستخدم الحالى (افتراضيًا "default" لو مفيش تفضيل محفوظ) */
export function getCurrentTheme() {
  const session = getSession();
  if (!session) return "default";
  const settings = getSettings();
  const user = (settings.users || []).find((u) => u.username === session.username);
  return user?.theme || "default";
}

/** يطبّق الثيم الحالى على الصفحة فورًا (بدون إعادة تحميل)، ويحدّث نسخة صغيرة فى LocalStorage
 * (اسم الثيم بس — مش أى بيانات كبيرة) عشان تُقرأ فورًا ومتزامنة أول ما الصفحة تفتح قبل حتى
 * ما IndexedDB (غير المتزامنة بطبيعتها) تخلّص التحميل، فمنعًا لأى وميض بثيم غلط للحظة */
export function applyCurrentTheme() {
  const theme = getCurrentTheme();
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem("center_active_theme", theme);
  } catch (e) {
    // مش حرج لو فشل — الثيم هيتطبق برضه بس ممكن يحصل وميض بسيط أول تحميل
  }
  return theme;
}

/** يحفظ اختيار ثيم جديد لحساب المستخدم الحالى، ويسجّل التغيير، ويطبّقه فورًا */
export function setCurrentTheme(themeId) {
  const session = getSession();
  if (!session) return;

  const settings = getSettings();
  const user = (settings.users || []).find((u) => u.username === session.username);
  if (!user) return;

  const previousTheme = user.theme || "default";
  user.theme = themeId;

  const log = settings.themeChangeLog || [];
  log.push({ username: session.username, from: previousTheme, to: themeId, changedAt: Date.now() });
  settings.themeChangeLog = log;

  saveSettings(settings);
  applyCurrentTheme();
}
