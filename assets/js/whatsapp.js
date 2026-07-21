// =========================================================
// WhatsApp — إرسال تقارير/نتائج لولى الأمر عبر واتساب
//
// ملحوظة تقنية مهمة: من موقع ثابت (بدون سيرفر) مفيش طريقة نرسل بيها رسالة
// واتساب تلقائيًا فى الخلفية. اللي ممكن نعمله هو نفتح واتساب (تطبيق أو ويب)
// مع تجهيز الرسالة كاملة جاهزة، والمستخدم نفسه يدوس "إرسال" جوه واتساب.
// =========================================================

/** ينظّف رقم الهاتف المصرى ليكون بصيغة دولية مناسبة لرابط واتساب (20xxxxxxxxxx) */
export function normalizeEgyptPhone(phone) {
  let digits = (phone || "").replace(/\D/g, "");
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (!digits.startsWith("20")) digits = "20" + digits;
  return digits;
}

/** يبنى رابط واتساب (wa.me) برسالة جاهزة مُجهّزة مسبقًا */
export function buildWhatsAppLink(phone, message) {
  const normalized = normalizeEgyptPhone(phone);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

/** يفتح واتساب فى تاب جديد بالرسالة الجاهزة */
export function openWhatsApp(phone, message) {
  window.open(buildWhatsAppLink(phone, message), "_blank");
}
