// =========================================================
// Reports — بناء رسائل تقارير المتابعة (كلها تقارير شهرية بصيغة موحّدة)
// وحدة مشتركة بين صفحة المتابعة وصفحة تفاصيل الطالب لمنع تكرار الكود
// =========================================================

import { getSettings } from "./storage.js";
import { formatMoney, todayISO } from "./helpers.js";

/** أول وآخر يوم فى شهر معين (Date objects) */
function monthBounds(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { start, end };
}

function formatArDate(d) {
  return d.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
}

/**
 * يبنى نص تقرير المتابعة الشهرية الكامل لطالب معين — نفس الصيغة بالظبط
 * أينما استُخدمت (من صفحة المتابعة أو من صفحة تفاصيل الطالب).
 *
 * month: "YYYY-MM" — افتراضيًا الشهر الحالى
 */
export function buildMonthlyFollowupMessage({ student, attendance, exams, extraCharges, month = todayISO().slice(0, 7) }) {
  const { start, end } = monthBounds(month);

  const monthAttendance = attendance.filter((a) => a.category === "attendance" && a.date.startsWith(month));
  const paidCount = monthAttendance.filter((a) => a.statusId === "ST-PAID").length;
  const unpaidCount = monthAttendance.filter((a) => a.statusId === "ST-UNPAID").length;
  const excusedCount = monthAttendance.filter((a) => a.statusId === "ST-EXCUSED").length;
  const absentCount = monthAttendance.filter((a) => a.statusId === "ST-ABSENT").length;
  const callCount = attendance.filter((a) => a.category === "action" && a.statusId === "ST-CALL" && a.date.startsWith(month)).length;
  const expelCount = attendance.filter((a) => a.category === "action" && a.statusId === "ST-EXPEL" && a.date.startsWith(month)).length;

  const monthExams = exams.filter((e) => e.date.startsWith(month));
  const unpaidCharges = (extraCharges || []).filter((c) => c.status === "unpaid");
  const settings = getSettings();
  const centerName = settings.centerName || "السنتر";

  const lines = [
    `تقرير متابعة حالة الطالب: ${student.name}`,
    `عن الفترة من ${formatArDate(start)} إلى ${formatArDate(end)}`,
    ``,
    `- عدد مرات الحضور والدفع: ${paidCount}`,
    `- عدد مرات الحضور بدون دفع: ${unpaidCount}`,
    `- عدد مرات الغياب بإذن: ${excusedCount}`,
    `- عدد مرات الغياب بدون إذن: ${absentCount}`,
  ];

  if (callCount > 0) lines.push(`- عدد مرات استدعاء ولى الأمر: ${callCount}`);
  if (expelCount > 0) lines.push(`- عدد مرات الطرد: ${expelCount}`);

  if (monthExams.length) {
    lines.push(`- نتائج امتحانات الشهر:`);
    monthExams.forEach((e) => lines.push(`  • ${e.title}: ${e.absent ? "غائب" : `${e.score} من ${e.maxScore}`}`));
  }

  if (student.lateBalance > 0) lines.push(`- متأخرات مالية مستحقة: ${formatMoney(student.lateBalance)}`);
  if (unpaidCharges.length) {
    lines.push(`- استحقاقات إضافية غير مدفوعة:`);
    unpaidCharges.forEach((c) => lines.push(`  • ${c.name}: ${formatMoney(c.amount)}`));
  }

  lines.push(``, `مع تحيات ${centerName}`);
  return lines.join("\n");
}
