// =========================================================
// Helpers — دوال مساعدة عامة يستخدمها كل المشروع
// =========================================================

export const qs = (sel, ctx = document) => ctx.querySelector(sel);
export const qsa = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

/** ISO date (YYYY-MM-DD) لتاريخ اليوم */
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** ISO date لتاريخ الأمس */
export function yesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** تحويل تاريخ ISO لصيغة عربية مقروءة */
export function formatDateAr(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
}

/** إضافة (أو طرح) عدد أيام لتاريخ ISO، ويرجع ISO جديد */
export function addDays(iso, days) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** بداية الأسبوع (يوم السبت) الذى يقع فيه هذا التاريخ — الأسبوع فى مصر يبدأ بالسبت */
export function startOfWeek(iso) {
  const d = new Date(iso);
  const dow = d.getDay(); // الأحد=0 ... السبت=6
  const daysSinceSaturday = (dow + 1) % 7;
  return addDays(iso, -daysSinceSaturday);
}

/** اسم اليوم بالعربى لتاريخ ISO معين */
export function weekdayNameAr(iso) {
  return new Date(iso).toLocaleDateString("ar-EG", { weekday: "long" });
}

/** التاريخ + اليوم بالعربي لأعلى الهيدر */
export function formatHeaderDate() {
  const d = new Date();
  return d.toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

/** تنسيق المبالغ المالية */
export function formatMoney(amount, currency = "ج.م") {
  const n = Number(amount || 0);
  return `${n.toLocaleString("ar-EG")} ${currency}`;
}

/** توليد معرف فريد بسيط */
export function generateId(prefix = "ID") {
  return `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

/** دالة تأخير لتقليل عدد استدعاءات البحث */
export function debounce(fn, delay = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/** استخراج الحرف الأول من اسم الطالب/المستخدم لعرضه فى Avatar */
export function initials(name = "") {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] || "?") + (parts[1]?.[0] || "");
}

/** تأخير وهمى لمحاكاة التحميل (Loading States) */
export function fakeDelay(ms = 350) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** حماية النصوص من الحقن عند إدراجها فى HTML */
export function escapeHTML(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
