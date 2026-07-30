// =========================================================
// Attendance Service — منطق تسجيل حضور/غياب ودفع الطالب
// (مشترك بين صفحة الاستقبال وصفحة إدارة الحصة لمنع تكرار الكود)
//
// نظام المتأخرات: كل دفعة بتخزن "lateBalanceDelta" (مقدار التغيير اللى
// أحدثته فى رصيد متأخرات الطالب). ده بيخلّى التراجع عن حالة سابقة (لو
// المستخدم غيّر رأيه أو صحّح غلط) دقيق 100% مهما تكررت التصحيحات.
//
// نظام القفل: الطالب اللى يُسجل عليه غياب بدون إذن أو استدعاء ولى أمر
// بيتقفل تلقائيًا ومبيحضرش الحصة الجاية غير لما المستير يفتح القفل.
// =========================================================

import { getAttendance, saveAttendance, getPayments, getAllPayments, savePayments, getStudents, saveStudents, getGroups, getStudentStatuses, getExtraCharges, saveExtraCharges, getWalletTransactions, saveWalletTransactions, addWalletDeposit, findAcademicMonthById, recordCashCollection, recordLedgerOnly, getSettings, getAdvancePermissionForStudent, markAdvancePermissionUsed, getSystemSettings } from "./storage.js";
import { generateId, todayISO, formatMoney } from "./helpers.js";
import { findGroup, dueAmount } from "./lookups.js";
import { checkEscalation, buildEscalationMessage } from "./escalation-engine.js";
import { openWhatsApp } from "./whatsapp.js";

function nowTime() {
  return new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
}

/** هل الطالب مقفول (محظور من الحضور للحصة الجاية)؟ */
export function isStudentLocked(student) {
  return student?.locked === true;
}

/** فتح القفل على الطالب (السماح بالحضور مرة تانية) */
export function unlockStudent(studentId) {
  const students = getStudents();
  const student = students.find((s) => s.id === studentId);
  if (!student) return null;
  student.locked = false;
  student.lockReason = null;
  student.lockDate = null;
  saveStudents(students);
  return student;
}

/** قفل الطالب (منع الحضور للحصة الجاية) */
function lockStudent(studentId, reason) {
  const students = getStudents();
  const student = students.find((s) => s.id === studentId);
  if (!student) return null;
  student.locked = true;
  student.lockReason = reason;
  student.lockDate = todayISO();
  saveStudents(students);
  return student;
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
  const payments = getAllPayments();
  const now = nowTime();

  // فحص القفل: لو الطالب مقفول ومفيش option يسمح بالتجاوز
  if (student && isStudentLocked(student) && !options.forceUnlock) {
    return { locked: true, student, reason: student.lockReason };
  }

  // ── إذن مسبق: لو الطالب مسجل عليه ST-ABSENT وفيه إذن مسبق لهذا التاريخ ──
  if (statusId === "ST-ABSENT" && student) {
    const advancePerm = getAdvancePermissionForStudent(studentId, date);
    if (advancePerm) {
      const excusedStatus = statuses.find((s) => s.id === "ST-EXCUSED");
      if (excusedStatus) {
        statusId = "ST-EXCUSED";
        status = excusedStatus;
        markAdvancePermissionUsed(advancePerm.id);
      }
    }
  }

  // تحديد الفترة الأكاديمية تلقائيًا
  const monthInfo = findAcademicMonthById(date);
  const termId = monthInfo?.termId || null;
  const monthId = monthInfo?.id || null;

  let record = attendance.find((a) => a.studentId === studentId && a.date === date && a.category === "attendance");

  // نتراجع أولًا عن أى أثر مالى لحالة سابقة مسجلة لنفس اليوم (لو بيصحح المستخدم غلط)
  if (record) {
    const oldPayment = payments.find((p) => p.attendanceId === record.id);
    if (oldPayment && student) {
      student.lateBalance = Math.max(0, (student.lateBalance || 0) - Number(oldPayment.lateBalanceDelta || 0));
      // إعادة رصيد المحفظة لو كان اتحسب من المحفظة
      if (oldPayment.walletUsed > 0) {
        student.walletBalance = (student.walletBalance || 0) + Number(oldPayment.walletUsed);
      }
    }
    if (oldPayment) {
      oldPayment.isVoided = true;
      oldPayment.voidedAt = todayISO();
    }
    record.statusId = status.id;
    record.time = now;
    record.termId = termId;
    record.monthId = monthId;
  } else {
    record = { id: generateId("ATT"), studentId, date, time: now, statusId: status.id, category: "attendance", termId, monthId };
    attendance.push(record);
  }

  let financeInfo = null;

  if (status.payment === "paid" || status.payment === "unpaid") {
    const group = findGroup(getGroups(), student?.groupId);
    const sessionDue = dueAmount(student, group);
    const priorBalance = Number(student?.lateBalance || 0); // الرصيد الحقيقى بعد التراجع فوق

    let collected, delta, note, walletUsed = 0;

    if (status.payment === "unpaid") {
      collected = 0;
      delta = sessionDue; // يُضاف سعر هذه الحصة كاملًا للمتأخرات
      note = "قيمة حصة (غير مدفوعة)";
    } else {
      const totalDue = sessionDue + priorBalance;

      // لو المستخدم محددش مبلغ (التسجيل السريع من إدارة الحصة)، نستخدم المحفظة أولًا لو الإعداد مفعّل
      const settings = getSettings();
      const sys = getSystemSettings();
      let walletUsed = 0;
      let walletToDebt = 0;
      if (settings.autoDeductWallet !== false && options.collectedAmount == null && (student.walletBalance || 0) > 0) {
        const wBal = student.walletBalance;
        if (sys.deductionPriority === "debt_first" && priorBalance > 0) {
          walletToDebt = Math.min(wBal, priorBalance);
          walletUsed = Math.min(wBal - walletToDebt, sessionDue);
        } else {
          walletUsed = Math.min(wBal, sessionDue);
          walletToDebt = Math.min(wBal - walletUsed, priorBalance);
        }
        student.walletBalance = Math.max(0, wBal - walletUsed - walletToDebt);
        const totalWalletDeduction = walletUsed + walletToDebt;
        if (totalWalletDeduction > 0) {
          const wtxns = getWalletTransactions();
          wtxns.push({
            id: generateId("WLT"),
            studentId,
            groupId: student.groupId,
            amount: totalWalletDeduction,
            type: "deduction",
            note: walletToDebt > 0 ? `خصم تلقائى — ${formatMoney(walletToDebt)} دين + ${formatMoney(walletUsed)} حصة` : "خصم تلقائى — تسجيل حضور",
            date: todayISO(),
          });
          saveWalletTransactions(wtxns);
        }
      }

      // بدون تحديد صريح للمبلغ (زى التسجيل الجماعى السريع)، نحصّل سعر هذه الحصة
      // بس ولا نلمس أى متأخرات قديمة، حفاظًا على الأمان لأنه مفيش حوار مالى حقيقى
      const explicitAmount = options.collectedAmount != null ? Math.max(0, Number(options.collectedAmount)) : 0;
      collected = explicitAmount > 0 ? explicitAmount : sessionDue;
      const effectiveCollected = collected + walletUsed;
      const debtCoveredByWallet = walletToDebt;
      const newBalance = Math.max(0, totalDue - effectiveCollected - debtCoveredByWallet);
      delta = newBalance - priorBalance;
      note = effectiveCollected > sessionDue && priorBalance > 0 ? `حصة (${formatMoney(sessionDue)}) + مستحقات سابقة` : "قيمة حصة";
      if (walletUsed > 0) note += ` (محفظة: ${formatMoney(walletUsed)})`;
    }

    payments.push({
      id: generateId("PAY"),
      studentId,
      groupId: options.sessionGroupId || student?.groupId,
      attendanceId: record.id,
      date: todayISO(), // تاريخ الدفعة دايمًا النهاردة الحقيقى (وقت استلام الفلوس فعليًا)، مش تاريخ الحصة اللى بيتصحح
      sessionDate: date, // نحتفظ بتاريخ الحصة نفسها للمرجعية لو احتجناها
      amount: collected,
      walletUsed: walletUsed || 0,
      status: status.payment,
      lateBalanceDelta: delta,
      note,
      termId,
      monthId,
    });

    // تسجيل التحصيل النقدي في الوردية + دفتر الأستاذ
    if (collected > 0) {
      recordCashCollection(studentId, collected, "session", `حصة ${date}`, { referenceId: payments[payments.length - 1].id, referenceType: "payment" });
    }
    if (delta > 0) {
      recordLedgerOnly(studentId, "session_fee", `مستحق حصة ${date} (غير مدفوع)`, delta, 0, { referenceId: payments[payments.length - 1].id, referenceType: "payment" });
    } else if (delta < 0 && collected === 0 && walletUsed > 0) {
      recordLedgerOnly(studentId, "wallet_payment", `سداد من المحفظة — حصة ${date}`, 0, walletUsed, { referenceType: "wallet" });
    }

    if (student) student.lateBalance = Math.max(0, priorBalance + delta);

    financeInfo = { sessionDue, priorBalance, collected, remaining: student ? student.lateBalance : 0 };
  }

  // تطبيق القفل التلقائى: غياب بدون إذن أو استدعاء ولى أمر
  if (student && (statusId === "ST-ABSENT" || statusId === "ST-CALL")) {
    student.locked = true;
    student.lockReason = statusId === "ST-ABSENT" ? "غياب بدون إذن" : "استدعاء ولى أمر";
    student.lockDate = date;
  }

  // فتح القفل تلقائى: لو الحضور (مدفوع أو غير مدفوع)
  if (student && (statusId === "ST-PAID" || statusId === "ST-UNPAID")) {
    student.locked = false;
    student.lockReason = null;
    student.lockDate = null;
  }

  // الحظر المالي التلقائي: لو فُعِّل وتجاوزت الديون الحد المقرر
  if (student && !student.locked) {
    const sys = getSystemSettings();
    if (sys.financialLockEnabled !== false && (student.lateBalance || 0) > Number(sys.financialLockThreshold || 150)) {
      student.locked = true;
      student.lockReason = `تجاوز حد الديون (${formatMoney(student.lateBalance)})`;
      student.lockDate = date;
    }
  }

  saveAttendance(attendance);
  savePayments(payments);
  saveStudents(students);

  // ── تصعيد الإنذارات: بعد تسجيل غياب بدون إذن ──
  let escalationResult = null;
  if (statusId === "ST-ABSENT" && student) {
    escalationResult = checkEscalation(studentId, statusId, date);
    if (escalationResult && escalationResult.level >= 1) {
      try {
        const phone = student.parentPhone || student.phone;
        const waSettings = getSystemSettings();
        if (phone && escalationResult.level <= 2 && getSettings().waAutoSend === true && !waSettings.waSilentMode) {
          const msg = buildEscalationMessage(student, escalationResult.level);
          if (msg) openWhatsApp(phone, msg);
        }
      } catch (e) { /* popup blocker */ }
    }
  }

  return { record, status, student, financeInfo, escalationResult };
}

/**
 * تسجيل إجراء استثنائى — يُضاف كسجل جديد دائمًا ولا يستبدل حضور اليوم.
 * @param {string} note - ملاحظة نصية إجبارية توضح سبب الإجراء.
 */
export function recordActionStatus(studentId, statusId, date = todayISO(), note = "") {
  const statuses = getStudentStatuses();
  const status = statuses.find((s) => s.id === statusId);
  if (!status) return null;

  const students = getStudents();
  const student = students.find((s) => s.id === studentId);

  // فحص القفل
  if (student && isStudentLocked(student)) {
    return { locked: true, student, reason: student.lockReason };
  }

  // تحديد الفترة الأكاديمية تلقائيًا
  const monthInfo = findAcademicMonthById(date);
  const termId = monthInfo?.termId || null;
  const monthId = monthInfo?.id || null;

  const attendance = getAttendance();
  const record = { id: generateId("ATT"), studentId, date, time: nowTime(), statusId: status.id, category: "action", note: note || "", termId, monthId };
  attendance.push(record);
  saveAttendance(attendance);

  // === أتمتة القفل والطرد ===

  // استدعاء ولى أمر = قفل
  if (student && statusId === "ST-CALL") {
    student.locked = true;
    student.lockReason = "استدعاء ولى أمر";
    student.lockDate = date;
  }

  // إيقاف مؤقت (autoLock) = قفل الحساب
  if (student && status.autoLock) {
    student.locked = true;
    student.lockReason = status.name;
    student.lockDate = date;
  }

  // طرد أو فصل نهائى (ST-EXPEL أو autoExpel) = تغيير الحالة إلى expelled
  if (student && (statusId === "ST-EXPEL" || status.autoExpel)) {
    student.status = "expelled";
  }

  // حفظ تغييرات الطالب لو اتغير
  if (student && (statusId === "ST-CALL" || status.autoLock || statusId === "ST-EXPEL" || status.autoExpel)) {
    saveStudents(students);
  }

  // مكافأة: إذا الحالة فيها rewardAmount > 0، نضيف للمحفظة
  let rewardResult = null;
  if (student && status.rewardAmount > 0 && getSystemSettings().rewardEnabled !== false) {
    rewardResult = addWalletDeposit(studentId, status.rewardAmount, `مكافأة: ${status.name}`);
    const updatedStudents = getStudents();
    const updatedStudent = updatedStudents.find((s) => s.id === studentId);
    if (updatedStudent) {
      student.walletBalance = updatedStudent.walletBalance;
      student.lateBalance = updatedStudent.lateBalance;
    }
  }

  return { record, status, rewardResult };
}

/** تسوية كل المتأخرات القديمة على الطالب دفعة واحدة (مستقلة عن حصة اليوم) — تُستخدم فى "مستحقات أخرى" */
function settleLateBalance(studentId) {
  const students = getStudents();
  const student = students.find((s) => s.id === studentId);
  if (!student || !(student.lateBalance > 0)) return null;

  const amount = student.lateBalance;
  const payments = getAllPayments();

  // تحديد الفترة الأكاديمية تلقائيًا
  const monthInfo = findAcademicMonthById(todayISO());

  payments.push({
    id: generateId("PAY"),
    studentId,
    groupId: student.groupId,
    attendanceId: null,
    date: todayISO(),
    amount,
    status: "paid",
    lateBalanceDelta: -amount,
    note: "تحصيل متأخرات سابقة",
    termId: monthInfo?.termId || null,
    monthId: monthInfo?.id || null,
  });
  student.lateBalance = 0;

  savePayments(payments);
  saveStudents(students);

  // تسجيل التحصيل النقدي في الوردية + دفتر الأستاذ
  recordCashCollection(studentId, amount, "late", "تحصيل متأخرات سابقة", { referenceId: payments[payments.length - 1].id, referenceType: "payment" });
  return { student, amount };
}

/** تسوية استحقاق مالى مسمّى واحد بعينه (زى "ملزمة امتحان الشهر") */
export function settleExtraCharge(chargeId) {
  const charges = getExtraCharges();
  const charge = charges.find((c) => c.id === chargeId);
  if (!charge || charge.status === "paid") return null;
  charge.status = "paid";
  saveExtraCharges(charges);

  const amount = Number(charge.amount) || 0;
  if (amount > 0) {
    recordCashCollection(charge.studentId, amount, "extra-charge", `تحصيل: ${charge.label || "بند إضافي"}`, {
      referenceId: charge.id,
      referenceType: "extra-charge",
    });
  }

  return charge;
}
