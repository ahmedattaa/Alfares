// =========================================================
// Schedule — دوال مساعدة لجدولة الحصص (الأيام والأوقات وحالة الحصة الآن)
// =========================================================

import { todayISO } from "./helpers.js";

/** أسماء أيام الأسبوع بالعربى بترتيب يطابق Date.getDay() (الأحد=0 ... السبت=6) */
export const WEEKDAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/** خيارات أيام الأسبوع بمفاتيح ثابتة (تستخدم فى أسماء حقول الفورم) مرتبة من السبت */
export const WEEKDAY_OPTIONS = [
  { key: "sat", ar: "السبت" },
  { key: "sun", ar: "الأحد" },
  { key: "mon", ar: "الاثنين" },
  { key: "tue", ar: "الثلاثاء" },
  { key: "wed", ar: "الأربعاء" },
  { key: "thu", ar: "الخميس" },
  { key: "fri", ar: "الجمعة" },
];

/** اسم اليوم الحالى بالعربى */
export function todayWeekdayAr(date = new Date()) {
  return WEEKDAYS_AR[date.getDay()];
}

/** هل هذه المجموعة من المفروض أن تُعقد النهاردة؟ */
export function isScheduledToday(group, date = new Date()) {
  return (group.days || []).includes(todayWeekdayAr(date));
}

/** تحويل وقت 24 ساعة "17:00" لصيغة عربية 12 ساعة "05:00 م" */
export function formatTimeAr(time24) {
  if (!time24) return "-";
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "م" : "ص";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
}

/** تجميع أيام المجموعة فى نص واحد مقروء */
export function formatDaysAr(days = []) {
  return days.length ? days.join(" و ") : "-";
}

/**
 * حالة الحصة الآن بالنسبة لتاريخ محدد:
 * - لتواريخ غير اليوم الحالى: الماضى يُعتبر "ended" دائمًا (يسمح بالمراجعة)، والمستقبل "upcoming" دائمًا
 * - لتاريخ اليوم: تُحسب فعليًا حسب وقت المجموعة ومدتها مقارنة بالوقت الحالى
 * ترجع: 'upcoming' | 'ongoing' | 'ended'
 */
export function sessionTimeStatus(group, dateStr, now = new Date()) {
  const today = todayISO();
  if (dateStr < today) return "ended";
  if (dateStr > today) return "upcoming";

  const [h, m] = (group.time || "00:00").split(":").map(Number);
  const start = new Date(now);
  start.setHours(h, m, 0, 0);
  const end = new Date(start.getTime() + (Number(group.duration) || 90) * 60000);

  if (now < start) return "upcoming";
  if (now <= end) return "ongoing";
  return "ended";
}
