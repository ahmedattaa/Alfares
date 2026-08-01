// =========================================================
// Paths — مسارات تشتغل من أي مجلد/استضافة فرعية (subpath)
// appPath() بتبني مسار كامل (absolute) من مكان ملف الـ JS نفسه،
// فتشغّل من جذر الدومين أو من مجلد فرعي (زي Live Server أو GitHub Pages).
// =========================================================

const APP_ROOT = new URL("../../", import.meta.url).href;

export function appPath(rel) {
  return new URL(rel, APP_ROOT).href;
}
