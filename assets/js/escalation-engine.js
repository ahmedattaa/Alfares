// =========================================================
// Escalation Engine — نظام تصعيد الإنذارات
// الغياب الأول: رسالة واتساب آلية هادئة
// الغياب الثاني المتتالي: تنبيه برتقالي + اتصال هاتفي
// الغياب الثالث المتتالي: قفل + استدعاء ولي الأمر
// =========================================================

import { getStudents, getAttendance, getStudentStatuses, getSettings, getEscalationLog, addEscalationEntry, saveStudents, saveEscalationLog } from "./storage.js";
import { findGroup } from "./lookups.js";
import { formatDateAr } from "./helpers.js";

const LEVELS = {
  0: { label: "طبيعي", color: "success", icon: "✅", autoAction: null },
  1: { label: "إنذار أول", color: "warning", icon: "🟡", autoAction: "whatsapp" },
  2: { label: "تنبيه — اتصال مطلوب", color: "warning", icon: "🟠", autoAction: "call_required" },
  3: { label: "قفل — استدعاء ولي الأمر", color: "danger", icon: "🔴", autoAction: "locked" },
};

/* ── حساب عدد الغيابات المتتالية (بدون إذن) ── */
export function getConsecutiveAbsences(studentId) {
  const statuses = getStudentStatuses();
  const attendance = getAttendance()
    .filter((a) => a.studentId === studentId && a.category === "attendance")
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  let count = 0;
  for (const record of attendance) {
    const st = statuses.find((s) => s.id === record.statusId);
    if (!st) break;
    const isDangerousAbsence = st.presence === "absent" && st.tone === "danger";
    if (isDangerousAbsence) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

/* ── حساب مستوى التصعيد الحالي ── */
export function getEscalationLevel(studentId) {
  const consecutive = getConsecutiveAbsences(studentId);
  if (consecutive >= 3) return 3;
  if (consecutive >= 2) return 2;
  if (consecutive >= 1) return 1;
  return 0;
}

/* ── معلومات المستوى ── */
export function getLevelMeta(level) {
  return LEVELS[level] || LEVELS[0];
}

/* ── كشف التصعيد بعد تسجيل غياب ── */
export function checkEscalation(studentId, statusId, date) {
  const statuses = getStudentStatuses();
  const status = statuses.find((s) => s.id === statusId);
  if (!status) return null;

  const isDangerousAbsence = status.presence === "absent" && status.tone === "danger";
  if (!isDangerousAbsence) return null;

  const student = getStudents().find((s) => s.id === studentId);
  if (!student) return null;

  const consecutive = getConsecutiveAbsences(studentId);
  const level = getEscalationLevel(studentId);
  const meta = getLevelMeta(level);

  const entry = {
    id: `ESC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    studentId,
    groupId: student.groupId,
    date,
    level,
    consecutiveAbsences: consecutive,
    action: meta.autoAction,
    resolved: false,
    resolvedBy: null,
    resolvedAt: null,
    resolutionNote: null,
    createdAt: new Date().toISOString(),
  };
  addEscalationEntry(entry);

  return { level, consecutive, meta, entry, student };
}

/* ── فتح حساب الطالب (override) ── */
export function overrideEscalation(studentId, resolverName, note) {
  const students = getStudents();
  const student = students.find((s) => s.id === studentId);
  if (!student) return false;

  student.locked = false;
  student.lockReason = null;
  student.lockDate = null;

  const log = getEscalationLog();
  const lastEntry = log.filter((e) => e.studentId === studentId && !e.resolved).pop();
  if (lastEntry) {
    lastEntry.resolved = true;
    lastEntry.resolvedBy = resolverName;
    lastEntry.resolvedAt = new Date().toISOString();
    lastEntry.resolutionNote = note || "فتح استثنائي";
  }

  saveStudents(students);
  saveEscalationLog(log);
  return true;
}

/* ── تسجيل اتصال هاتفي ── */
export function logPhoneCall(studentId, resolverName, note) {
  const log = getEscalationLog();
  const lastEntry = log.filter((e) => e.studentId === studentId && !e.resolved).pop();
  if (lastEntry) {
    lastEntry.action = "call_logged";
    lastEntry.resolutionNote = note || "تم الاتصال";
    lastEntry.resolvedBy = resolverName;
    lastEntry.resolvedAt = new Date().toISOString();
  }
  saveEscalationLog(log);
}

/* ── جلب جميع الطلاب في حالة تصعيد ── */
export function getEscalatedStudents() {
  const students = getStudents().filter((s) => s.status === "active");
  const result = [];

  students.forEach((s) => {
    const level = getEscalationLevel(s.id);
    if (level > 0) {
      result.push({
        ...s,
        escalationLevel: level,
        consecutiveAbsences: getConsecutiveAbsences(s.id),
        meta: getLevelMeta(level),
      });
    }
  });

  return result.sort((a, b) => b.escalationLevel - a.escalationLevel || b.consecutiveAbsences - a.consecutiveAbsences);
}

/* ── عدد المتصاعدين لكل مستوى ── */
export function getEscalationSummary() {
  const all = getEscalatedStudents();
  return {
    level3: all.filter((s) => s.escalationLevel === 3),
    level2: all.filter((s) => s.escalationLevel === 2),
    level1: all.filter((s) => s.escalationLevel === 1),
    total: all.length,
  };
}

/* ── توليد رسالة واتساب حسب المستوى ── */
export function buildEscalationMessage(student, level) {
  const settings = getSettings();
  const centerName = settings?.centerName || "السنتر التعليمي";

  if (level === 1) {
    return `بسم الله، ولى أمر الطالب/ة ${student.name} المحترم/ة،\n\nنود إعلامكم إن الطالب/ة ${student.name} لم يحضر حصة اليوم.\nنتمنى لهم وللطالب/ة صحة وعافية.\n\nللتواصل: ${centerName}`;
  }

  if (level === 2) {
    return `السيد/ة ولى أمر الطالب/ة ${student.name} المحترم/ة،\n\nنلاحظ غياب الطالب/ة ${student.name} بشكل متكرر.\nنرجو منكم التواصل معنا للتحقق من سبب الغياب.\n\nرقم التواصل: ${centerName}\nهذا تنبيه ودي — نهتم على تقدم الطالب/ة.`;
  }

  if (level === 3) {
    return `السيد/ة ولى أمر الطالب/ة ${student.name} المحترم/ة،\n\nإشعار هام: الطالب/ة ${student.name} متغيب عن عدة حصص متتالية.\n\nنرجو حضوركم السنتر في أقرب وقت لمناقشة الموقف.\nحساب الطالب/ة متوقف مؤقتاً حتى حضور ولي الأمر.\n\nمع تحيات ${centerName}`;
  }

  return "";
}
