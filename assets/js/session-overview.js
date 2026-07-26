// =========================================================
// Session Overview — كل الحصص المجدولة فى تاريخ معين مع إحصائياتها الحية
// وحدة مشتركة بين الصفحة الرئيسية وإدارة الحصة لمنع تكرار الكود
// =========================================================

import { getStudents, getGroups, getGrades, getAttendance, getPayments, getStudentStatuses, getSessionLogs } from "./storage.js";
import { isScheduledOnDate, sessionTimeStatus } from "./schedule.js";
import { gradeName } from "./lookups.js";

/**
 * يرجع كل المجموعات المجدولة فى تاريخ معين (حسب يوم الأسبوع)، مرتبة بالوقت،
 * مع حالة كل حصة (upcoming/ongoing/ended) وإحصائيات الحضور والمالية والقفل اليدوى
 */
export function getSessionsForDate(dateStr) {
  const groups = getGroups().filter((g) => isScheduledOnDate(g, dateStr));
  const grades = getGrades();
  const students = getStudents();
  const attendance = getAttendance();
  const payments = getPayments();
  const statuses = getStudentStatuses();
  const sessionLogs = getSessionLogs();

  return groups
    .slice()
    .sort((a, b) => (a.time < b.time ? -1 : 1))
    .map((group) => {
      const timeStatus = sessionTimeStatus(group, dateStr);
      const enrolled = students.filter((s) => s.groupId === group.id);
      const enrolledIds = new Set(enrolled.map((s) => s.id));

      const dayRecords = attendance.filter((a) => a.date === dateStr && a.category === "attendance" && enrolledIds.has(a.studentId));
      const presentRecords = dayRecords.filter((a) => statuses.find((s) => s.id === a.statusId)?.presence === "present");
      const absentRecords = dayRecords.filter((a) => statuses.find((s) => s.id === a.statusId)?.presence === "absent");
      const paidRecords = dayRecords.filter((a) => a.statusId === "ST-PAID");
      const unpaidRecords = dayRecords.filter((a) => a.statusId === "ST-UNPAID");
      const absentNames = absentRecords.map((a) => enrolled.find((s) => s.id === a.studentId)?.name || "طالب محذوف");

      const expected = enrolled.length * (group.sessionPrice || 0);
      const collected = payments
        .filter((p) => p.date === dateStr && p.groupId === group.id && p.status === "paid")
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const dues = collected - expected;

      const log = sessionLogs.find((l) => l.groupId === group.id && l.date === dateStr);

      return {
        group,
        gradeLabel: gradeName(grades, group.gradeId),
        timeStatus,
        enrolledCount: enrolled.length,
        registeredCount: dayRecords.length,
        presentCount: presentRecords.length,
        absentCount: absentRecords.length,
        paidCount: paidRecords.length,
        unpaidCount: unpaidRecords.length,
        absentNames,
        collected,
        dues,
        opened: !!log,
        closed: !!log?.closed,
      };
    });
}

/** أول حصة "جاهزة تُفتح دلوقتى" (ongoing) بعد حصة معينة فى نفس اليوم — تُستخدم لاقتراح "فتح الحصة القادمة" */
export function nextReadySession(dateStr, afterGroupId) {
  const sessions = getSessionsForDate(dateStr);
  const idx = sessions.findIndex((s) => s.group.id === afterGroupId);
  const rest = idx >= 0 ? sessions.slice(idx + 1) : sessions;
  return rest.find((s) => s.timeStatus === "ongoing") || null;
}
