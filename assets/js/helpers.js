// =========================================================
// Helpers — دوال مساعدة عامة يستخدمها كل المشروع
// =========================================================

/** ISO date (YYYY-MM-DD) لتاريخ اليوم */
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
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
/** لوحة ألوان متنوعة لبطاقات المجموعات (تُستخدم فى الحضور السريع واليومية المالية) */
export const GROUP_CARD_PALETTE = [
  { bg: "#EEF2FF", border: "#6366F1", text: "#4338CA" },
  { bg: "#ECFDF5", border: "#10B981", text: "#047857" },
  { bg: "#FFF7ED", border: "#F97316", text: "#C2410C" },
  { bg: "#FDF2F8", border: "#EC4899", text: "#BE185D" },
  { bg: "#F0F9FF", border: "#0EA5E9", text: "#0369A1" },
  { bg: "#FEFCE8", border: "#EAB308", text: "#A16207" },
];

export function escapeHTML(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** ضغط صورة محلية إلى Data URL صغير (JPEG) — للحفظ في قاعدة البيانات المحلية */
export function compressImage(file, maxDim = 480, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("file-read"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("image-load"));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/** أفتار طالب: صورة حقيقية لو موجودة، وإلا initials كبديل — يُستخدم في كل البوابة */
export function studentAvatar(student, size = 40) {
  if (!student) return "";
  const style = `width:${size}px;height:${size}px;font-size:${Math.max(12, Math.round(size * 0.32))}px;`;
  if (student.photo) {
    return `<img class="sv-photo sv-photo--img" src="${escapeHTML(student.photo)}" alt="${escapeHTML(student.name || "")}" style="${style}">`;
  }
  return `<div class="sv-photo sv-photo--ini" style="${style}">${escapeHTML(initials(student.name || "?"))}</div>`;
}
