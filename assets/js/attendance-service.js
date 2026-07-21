// =========================================================
// Attendance Service — منطق تسجيل حضور/غياب ودفع الطالب
// (مشترك بين صفحة الاستقبال وصفحة إدارة الحصة لمنع تكرار الكود)
//
// نظام المتأخرات: كل دفعة بتخزن "lateBalanceDelta" (مقدار التغيير اللى
// أحدثته فى رصيد متأخرات الطالب). ده بيخلّى التراجع عن حالة سابقة (لو
// المستخدم غيّر رأيه أو صحّح غلط) دقيق 100% مهما تكررت التصحيحات.
// =========================================================

import { getAttendance, saveAttendance, getPayments, savePayments, getStudents, saveStudents, getGroups, getStudentStatuses } from "./storage.js";
import { generateId, todayISO, formatMoney } from "./helpers.js";
import { findGroup, dueAmount } from "./lookups.js";

function nowTime() {
  return new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
}

/**
 * تسجيل حالة حضور/غياب يومية عادية لطالب معين (يستبدل حالة نفس اليوم لو مسجلة بالفعل،
 * ويعكس بدقة أى أثر مالى لحالة قديمة قبل تطبيق الجديدة).
 *
 * options.collectedAmount (اختيارى، لحالات الدفع فقط): المبلغ الفعلى المُحصَّل الآن.
 * لو مش محدد، الافتراضى = سعر الحصة (بعد الخصم) + أى مستحقات سابقة على الطالب (تحصيل كامل).
 * لو المبلغ المحدد أقل من الإجمالى المطلوب، الفرق يفضل مسجلًا كمتأخرات.
 */
export function recordAttendanceStatus(studentId, statusId, date = todayISO(), options = {}) {
  const statuses = getStudentStatuses();
  const status = statuses.find((s) => s.id === statusId);
  if (!status) return null;

  const students = getStudents();
  const student = students.find((s) => s.id === studentId);
  const attendance = getAttendance();
  const payments = getPayments();
  const now = nowTime();

  let record = attendance.find((a) => a.studentId === studentId && a.date === date && a.category === "attendance");

  // نتراجع أولًا عن أى أثر مالى لحالة سابقة مسجلة لنفس اليوم (لو بيصحح المستخدم غلط)
  if (record) {
    const oldPayment = payments.find((p) => p.attendanceId === record.id);
    if (oldPayment && student) {
      student.lateBalance = Math.max(0, (student.lateBalance || 0) - Number(oldPayment.lateBalanceDelta || 0));
    }
    if (oldPayment) payments.splice(payments.indexOf(oldPayment), 1);
    record.statusId = status.id;
    record.time = now;
  } else {
    record = { id: generateId("ATT"), studentId, date, time: now, statusId: status.id, category: "attendance" };
    attendance.push(record);
  }

  let financeInfo = null;

  if (status.payment === "paid" || status.payment === "unpaid") {
    const group = findGroup(getGroups(), student?.groupId);
    const sessionDue = dueAmount(student, group);
    const priorBalance = Number(student?.lateBalance || 0); // الرصيد الحقيقى بعد التراجع فوق

    let collected, delta, note;

    if (status.payment === "unpaid") {
      collected = 0;
      delta = sessionDue; // يُضاف سعر هذه الحصة كاملًا للمتأخرات
      note = "قيمة حصة (غير مدفوعة)";
    } else {
      const totalDue = sessionDue + priorBalance;
      // بدون تحديد صريح للمبلغ (زى التسجيل الجماعى السريع فى إدارة الحصة)، نحصّل سعر
      // هذه الحصة بس ولا نلمس أى متأخرات قديمة، حفاظًا على الأمان لأنه مفيش حوار مالى
      // حقيقى بيحصل وقتها. خانة الاستقبال هى اللى بتحدد المبلغ الكامل صراحةً لو فيه تحصيل فعلى.
      collected = options.collectedAmount != null ? Math.max(0, Number(options.collectedAmount)) : sessionDue;
      const newBalance = Math.max(0, totalDue - collected);
      delta = newBalance - priorBalance;
      note = collected > sessionDue && priorBalance > 0 ? `حصة (${formatMoney(sessionDue)}) + مستحقات سابقة` : "قيمة حصة";
    }

    payments.push({
      id: generateId("PAY"),
      studentId,
      groupId: student?.groupId,
      attendanceId: record.id,
      date,
      amount: collected,
      status: status.payment,
      lateBalanceDelta: delta,
      note,
    });

    if (student) student.lateBalance = Math.max(0, priorBalance + delta);

    financeInfo = { sessionDue, priorBalance, collected, remaining: student ? student.lateBalance : 0 };
  }

  saveAttendance(attendance);
  savePayments(payments);
  saveStudents(students);

  return { record, status, student, financeInfo };
}

/** تسجيل إجراء استثنائى (استدعاء ولى أمر / طرد) — يُضاف كسجل جديد دائمًا ولا يستبدل حضور اليوم */
export function recordActionStatus(studentId, statusId, date = todayISO()) {
  const statuses = getStudentStatuses();
  const status = statuses.find((s) => s.id === statusId);
  if (!status) return null;

  const attendance = getAttendance();
  const record = { id: generateId("ATT"), studentId, date, time: nowTime(), statusId: status.id, category: "action" };
  attendance.push(record);
  saveAttendance(attendance);

  return { record, status };
}

/** سجل حضور اليوم العادى لطالب معين (بدون الإجراءات الاستثنائية) */
export function todayAttendanceRecord(studentId, date = todayISO()) {
  return getAttendance().find((a) => a.studentId === studentId && a.date === date && a.category === "attendance");
}
