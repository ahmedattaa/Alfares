// =========================================================
// WhatsApp Notifications — إشعارات واتساب تلقائية لولي الأمر
//
// يُرسل إشعاراً تلقائياً لولي أمر الطالب بمجرد تسجيل حضوره
// (حضر ودفع / حضر بدون دفع) عبر رسالة واتساب جاهزة.
// =========================================================

import { getStudents, getGroups, getSettings, getStudentStatuses, getAttendance, getPayments } from "./storage.js";
import { normalizeEgyptPhone, openWhatsApp } from "./whatsapp.js";
import { findGroup, dueAmount } from "./lookups.js";
import { todayISO, formatDateAr, formatMoney } from "./helpers.js";

/**
 * يرسل إشعار حضور تلقائي لولي أمر الطالب
 * @param {string} studentId - معرف الطالب
 * @param {string} statusId - معرف حالة الحضور
 * @param {string} date - تاريخ الحضور
 * @param {object} financeInfo - معلومات الدفع (اختياري)
 * @returns {object|null} - { sent: true/false, phone, message }
 */
export function sendAttendanceNotification(studentId, statusId, date = todayISO(), financeInfo = null) {
  const student = getStudents().find((s) => s.id === studentId);
  if (!student || !student.parentPhone) return null;

  const status = getStudentStatuses().find((s) => s.id === statusId);
  if (!status) return null;

  // لا نرسل إشعارات لحالات الاستدعاء أو الطرد أو الغياب (حسب الطلب)
  if (status.category === "action") return null;
  if (status.presence === "absent") return null;

  const group = findGroup(getGroups(), student.groupId);
  const settings = getSettings();
  const centerName = settings.centerName || "السنتر التعليمي";

  const message = buildAttendanceMessage({
    studentName: student.name,
    groupName: group?.name || "",
    groupCode: group?.code || "",
    date: date,
    statusName: status.name,
    paymentStatus: status.payment,
    financeInfo,
    centerName,
  });

  const phone = normalizeEgyptPhone(student.parentPhone);
  return {
    sent: true,
    phone,
    message,
    studentName: student.name,
  };
}

/**
 * يرسل إشعار غياب تلقائي لولي أمر الطالب
 * @param {string} studentId - معرف الطالب
 * @param {string} statusId - معرف حالة الغياب
 * @param {string} date - تاريخ الغياب
 * @returns {object|null}
 */
export function sendAbsenceNotification(studentId, statusId, date = todayISO()) {
  const student = getStudents().find((s) => s.id === studentId);
  if (!student || !student.parentPhone) return null;

  const status = getStudentStatuses().find((s) => s.id === statusId);
  if (!status) return null;

  // فقط حالات الغياب
  if (status.presence !== "absent") return null;

  const group = findGroup(getGroups(), student.groupId);
  const settings = getSettings();
  const centerName = settings.centerName || "السنتر التعليمي";

  const message = buildAbsenceMessage({
    studentName: student.name,
    groupName: group?.name || "",
    groupCode: group?.code || "",
    date: date,
    statusName: status.name,
    centerName,
  });

  const phone = normalizeEgyptPhone(student.parentPhone);
  return {
    sent: true,
    phone,
    message,
    studentName: student.name,
  };
}

/**
 * يرسل إشعار نتيجة امتحان لولي أمر الطالب
 * @param {string} studentId - معرف الطالب
 * @param {object} exam - بيانات الامتحان
 * @param {object} result - نتيجة الطالب
 * @returns {object|null}
 */
export function sendExamResultNotification(studentId, exam, result) {
  const student = getStudents().find((s) => s.id === studentId);
  if (!student || !student.parentPhone) return null;

  const settings = getSettings();
  const centerName = settings.centerName || "السنتر التعليمي";

  const message = buildExamResultMessage({
    studentName: student.name,
    examTitle: exam.title,
    examDate: exam.date,
    score: result.score,
    maxScore: exam.maxScore,
    centerName,
  });

  const phone = normalizeEgyptPhone(student.parentPhone);
  return {
    sent: true,
    phone,
    message,
    studentName: student.name,
  };
}

/**
 * يرسل إشعارات جماعية لكل أولياء طلاب المجموعة
 * @param {string} groupId - معرف المجموعة
 * @param {string} date - تاريخ الحضور
 * @returns {array} - قائمة بالرسائل المرسلة
 */
export function sendBulkAttendanceNotifications(groupId, date = todayISO()) {
  const students = getStudents().filter((s) => s.groupId === groupId);
  const attendance = getAttendance().filter(
    (a) => a.date === date && a.category === "attendance" && students.some((s) => s.id === a.studentId)
  );
  const payments = getPayments().filter((p) => p.date === date && p.groupId === groupId);

  const notifications = [];

  students.forEach((student) => {
    const record = attendance.find((a) => a.studentId === student.id);
    if (!record) return;

    const status = getStudentStatuses().find((s) => s.id === record.statusId);
    if (!status) return;

    // حساب معلومات الدفع
    let financeInfo = null;
    if (status.payment === "paid" || status.payment === "unpaid") {
      const payment = payments.find((p) => p.studentId === student.id);
      if (payment) {
        financeInfo = {
          collected: payment.amount,
          remaining: student.lateBalance || 0,
        };
      }
    }

    const notification = sendAttendanceNotification(student.id, record.statusId, date, financeInfo);
    if (notification) {
      notifications.push(notification);
    }
  });

  return notifications;
}

/**
 * يفتح واتساب مع عدة رسائل (للإرسال المتعدد)
 * ملحوظة: لا يمكن فتح عدة نوافذ دفعة واحدة من متصفح واحد
 * لذلك سنفتح رسالة واحدة ونحذف الباقي أو نستخدم طريقة أخرى
 */
export function openWhatsAppBulk(notifications) {
  if (!notifications.length) return;

  // فتح أول رسالة فقط (الباقي يدوياً أو بزراير منفصلة)
  const first = notifications[0];
  openWhatsApp(first.phone, first.message);

  return {
    total: notifications.length,
    first: first.studentName,
  };
}

// ================= دوال بناء الرسائل =================

function buildAttendanceMessage({ studentName, groupName, groupCode, date, statusName, paymentStatus, financeInfo, centerName }) {
  const dateStr = formatDateAr(date);

  let message = `عزيزي ولي أمر الطالب/ة ${studentName}،\n\n`;
  message += `✅ تم تسجيل حضور الطالب/ة في حصة اليوم\n`;
  message += `📅 التاريخ: ${dateStr}\n`;
  message += `📚 المجموعة: ${groupName} - ${groupCode}\n`;

  if (paymentStatus === "paid") {
    message += `💰 حالة الدفع: مدفوع ✅\n`;
    if (financeInfo) {
      message += `💵 المبلغ المدفوع: ${formatMoney(financeInfo.collected)}\n`;
      if (financeInfo.remaining > 0) {
        message += `📊 المتبقي على الطالب: ${formatMoney(financeInfo.remaining)}\n`;
      }
    }
  } else if (paymentStatus === "unpaid") {
    message += `💰 حالة الدفع: مستحق (لم يُدفع بعد)\n`;
    if (financeInfo) {
      message += `📊 المبلغ المستحق: ${formatMoney(financeInfo.collected)}\n`;
    }
  }

  message += `\nنتمنى لكم يوماً سعيداً\n${centerName}`;

  return message;
}

function buildAbsenceMessage({ studentName, groupName, groupCode, date, statusName, centerName }) {
  const dateStr = formatDateAr(date);

  let message = `عزيزي ولي أمر الطالب/ة ${studentName}،\n\n`;
  message += `⚠️ نود إبلاغكم بغياب الطالب/ة عن حصة اليوم\n`;
  message += `📅 التاريخ: ${dateStr}\n`;
  message += `📚 المجموعة: ${groupName} - ${groupCode}\n`;
  message += `📝 الحالة: ${statusName}\n`;
  message += `\nللتواصل والاستفسار\n${centerName}`;

  return message;
}

function buildExamResultMessage({ studentName, examTitle, examDate, score, maxScore, centerName }) {
  const dateStr = formatDateAr(examDate);
  const percentage = Math.round((score / maxScore) * 100);

  let message = `عزيزي ولي أمر الطالب/ة ${studentName}،\n\n`;
  message += `📊 نتيجة الامتحان\n`;
  message += `📝 الامتحان: ${examTitle}\n`;
  message += `📅 التاريخ: ${dateStr}\n`;
  message += `✅ الدرجة: ${score} من ${maxScore}\n`;
  message += `📈 النسبة: ${percentage}%\n`;

  if (percentage >= 80) {
    message += `\n🎉 ممتاز! أداء رائع للطالب/ة\n`;
  } else if (percentage >= 60) {
    message += `\n👍 جيد، но يمكن التحسن أكثر\n`;
  } else {
    message += `\n⚠️ يحتاج الطالب/ة إلى مزيد من المراجعة\n`;
  }

  message += `\nمع تحيات ${centerName}`;

  return message;
}

/**
 * يرسل إشعار مكافأة (نجم الحصة) لولي أمر الطالب
 */
export function sendRewardNotification(studentId, rewardAmount, statusName) {
  const student = getStudents().find((s) => s.id === studentId);
  if (!student) return null;

  const phone = student.parentPhone || student.phone;
  if (!phone) return null;

  const centerName = getSettings().centerName || "السنتر";
  const parentName = student.parentName || "ولي الأمر";

  const message =
    `🌟 *تهنئة خاصة من ${centerName}*\n\n` +
    `家长 ${parentName} المحترم/ة،\n\n` +
    `يسعدنا أن نبلغكم أن نجلكم *${student.name}*\n` +
    ` قد حصل على لقب *"${statusName}"* اليوم! 🏆\n\n` +
    `💰 *مكافأة: ${formatMoney(rewardAmount)}*\n` +
    `تمت إضافتها للمحفظة بنجاح.\n\n` +
    `نتمنى لهم دوام التفوق والنجاح.\n\n` +
    `مع تحيات ${centerName}`;

  openWhatsApp(phone, message);
  return { sent: true, phone, message };
}

/**
 * يُجهز إشعارات واتساب لجميع طلاب الامتحان الذين لديهم درجات (غير غائبين)
 * @param {string} examId - معرف الامتحان
 * @returns {Array} مصفوفة إشعارات [{ studentName, phone, message }]
 */
export function sendBulkExamResults(examId) {
  const exams = getExams();
  const exam = exams.find((e) => e.id === examId);
  if (!exam) return [];

  const settings = getSettings();
  const centerName = settings.centerName || "السنتر";
  const students = getStudents();
  const notifications = [];

  exam.results.forEach((r) => {
    if (r.absent) return;
    const student = students.find((s) => s.id === r.studentId);
    if (!student) return;
    const phone = student.parentPhone || student.phone;
    if (!phone) return;

    const pct = Math.round((r.score / exam.maxScore) * 100);
    const emoji = pct >= 80 ? "🌟" : pct >= 60 ? "✅" : "⚠️";

    const message =
      `${emoji} *نتيجة امتحان — ${centerName}*\n\n` +
      `家长 ولى أمر الطالب/ة *${student.name}*،\n\n` +
      `نتيجة "${exam.title}":\n` +
      `📊 الدرجة: *${r.score} / ${exam.maxScore}*\n` +
      `📈 النسبة: *${pct}%*\n\n` +
      `نتمنى لهم دوام التقدم.\n` +
      `مع تحيات ${centerName}`;

    notifications.push({ studentId: student.id, studentName: student.name, phone, message, score: r.score, maxScore: exam.maxScore, pct });
  });

  return notifications;
}
