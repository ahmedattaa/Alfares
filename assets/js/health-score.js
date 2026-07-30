// =========================================================
// Health Score — مؤشر صحة الطالب الأكاديمية (0–100)
// المعادلة: الالتزام بالحضور (40%) + متوسط الدرجات (40%) + السجل السلوكي (20%)
// بدون امتحانات: الحضور (60%) + السلوكي (40%)
// =========================================================

import { getStudents, getAttendance, getExams, getStudentStatuses, getGroups, getGrades, getSystemSettings } from "./storage.js";
import { findGroup, gradeName, groupName } from "./lookups.js";

const LOOKBACK_DAYS = 30;

/* ── حساب درجة الطالب ── */
export function computeHealthScore(studentId) {
  const sys = getSystemSettings();
  const statuses = getStudentStatuses();
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - LOOKBACK_DAYS);
  const cutoff = thirtyDaysAgo.toISOString().slice(0, 10);

  const wAtt = Number(sys.healthWeightAttendance) / 100;
  const wExam = Number(sys.healthWeightExams) / 100;
  const wBeh = Number(sys.healthWeightBehavior) / 100;

  /* ── 1. الحضور ── */
  const allAttendance = getAttendance().filter((a) => a.studentId === studentId && a.category === "attendance");
  const recentAttendance = allAttendance.filter((a) => a.date >= cutoff);
  const attendanceSource = recentAttendance.length >= 2 ? recentAttendance : allAttendance;

  let attendanceRate = 0;
  if (attendanceSource.length > 0) {
    const presentCount = attendanceSource.filter((a) => {
      const st = statuses.find((s) => s.id === a.statusId);
      return st?.presence === "present";
    }).length;
    attendanceRate = Math.round((presentCount / attendanceSource.length) * 100);
  }

  /* ── 2. الدرجات ── */
  const exams = getExams();
  const examPercentages = [];
  exams.forEach((exam) => {
    const result = (exam.results || []).find((r) => r.studentId === studentId && !r.absent && r.score != null);
    if (result) {
      examPercentages.push(Math.round((result.score / exam.maxScore) * 100));
    }
  });

  const hasExams = examPercentages.length > 0;
  const examAvg = hasExams
    ? Math.round(examPercentages.reduce((sum, p) => sum + p, 0) / examPercentages.length)
    : 0;

  /* ── 3. السجل السلوكي ── */
  let behaviorDeductions = 0;
  const negativeStatuses = statuses.filter((s) => s.category === "action" && (s.tone === "warning" || s.tone === "danger"));
  const negativeIds = new Set(negativeStatuses.map((s) => s.id));

  const recentActions = getAttendance().filter(
    (a) => a.studentId === studentId && a.category === "action" && a.date >= cutoff && negativeIds.has(a.statusId)
  );
  const dangerPenalty = Math.round(wBeh > 0 ? (8 / 0.2) * wBeh : 0);
  const warningPenalty = Math.round(wBeh > 0 ? (3 / 0.2) * wBeh : 0);
  recentActions.forEach((a) => {
    const st = statuses.find((s) => s.id === a.statusId);
    if (st?.tone === "danger") behaviorDeductions += dangerPenalty;
    else if (st?.tone === "warning") behaviorDeductions += warningPenalty;
  });
  const maxBehaviorScore = Math.round(wBeh * 100);
  const behaviorScore = Math.max(0, maxBehaviorScore - behaviorDeductions);

  /* ── 4. النتيجة النهائية ── */
  let total;
  if (hasExams && wExam > 0) {
    total = Math.round(attendanceRate * wAtt + examAvg * wExam + (wBeh > 0 ? behaviorScore : 0));
  } else if (!hasExams && wExam > 0) {
    const remaining = wAtt + wBeh;
    const adjAtt = remaining > 0 ? wAtt / remaining : 0.5;
    const adjBeh = remaining > 0 ? wBeh / remaining : 0.5;
    total = Math.round(attendanceRate * adjAtt + (wBeh > 0 ? behaviorScore : 0));
  } else {
    total = Math.round(attendanceRate * (wAtt + wExam > 0 ? wAtt / (wAtt + wExam) : 1));
  }
  total = Math.min(100, Math.max(0, total));

  return {
    total,
    attendanceRate,
    examAvg,
    behaviorScore,
    hasExams,
    examCount: examPercentages.length,
    recentActions: recentActions.length,
    attendanceDays: attendanceSource.length,
  };
}

/* ── حساب كل الطلاب دفعة واحدة ── */
export function computeAllHealthScores() {
  const students = getStudents().filter((s) => s.status === "active");
  return students
    .map((s) => ({ ...s, health: computeHealthScore(s.id) }))
    .sort((a, b) => a.health.total - b.health.total);
}

/* ── تصنيف اللون ── */
export function getHealthColor(score) {
  const sys = getSystemSettings();
  const green = Number(sys.healthColorGreen);
  const yellow = Number(sys.healthColorYellow);
  if (score >= green) return "success";
  if (score >= yellow) return "warning";
  return "danger";
}

/* ── تصنيف النص ── */
export function getHealthLabel(score) {
  const sys = getSystemSettings();
  const green = Number(sys.healthColorGreen);
  const yellow = Number(sys.healthColorYellow);
  if (score >= green) return "ممتاز";
  if (score >= yellow) return "جيد";
  if (score >= yellow * 0.6) return "محتاج متابعة";
  return "في خطر";
}

/* ── طلاب في منطقة الخطر ── */
function getDangerStudents() {
  const sys = getSystemSettings();
  const yellow = Number(sys.healthColorYellow);
  return computeAllHealthScores().filter((s) => s.health.total < yellow);
}

/* ── طلاب محتاجين متابعة ── */
function getWarningStudents() {
  const sys = getSystemSettings();
  const green = Number(sys.healthColorGreen);
  const yellow = Number(sys.healthColorYellow);
  return computeAllHealthScores().filter((s) => s.health.total >= yellow && s.health.total < green);
}

/* ── طلاب أصحاء ── */
function getHealthyStudents() {
  const sys = getSystemSettings();
  const green = Number(sys.healthColorGreen);
  return computeAllHealthScores().filter((s) => s.health.total >= green);
}

/* ── ملخص الألوان للداشبورد ── */
export function getHealthSummary() {
  const all = computeAllHealthScores();
  const sys = getSystemSettings();
  const green = Number(sys.healthColorGreen);
  const yellow = Number(sys.healthColorYellow);
  const danger = all.filter((s) => s.health.total < yellow);
  const warning = all.filter((s) => s.health.total >= yellow && s.health.total < green);
  const healthy = all.filter((s) => s.health.total >= green);
  return { danger, warning, healthy, total: all.length };
}

/* ── HTML: دائرة النتيجة ── */
export function healthScoreHTML(score, size = 48) {
  const color = getHealthColor(score);
  const colorVar = `var(--${color})`;
  const fontSize = Math.round(size * 0.32);
  return `
    <div style="width:${size}px; height:${size}px; border-radius:50%; display:flex; align-items:center; justify-content:center;
      background:color-mix(in srgb, ${colorVar} 15%, transparent); border:2.5px solid ${colorVar}; flex-shrink:0;">
      <span style="font-size:${fontSize}px; font-weight:800; color:${colorVar};">${score}</span>
    </div>
  `;
}

/* ── HTML: شريط التقدم ── */
export function healthBarHTML(score, height = 6) {
  const color = getHealthColor(score);
  return `
    <div style="width:100%; height:${height}px; background:var(--border); border-radius:99px; overflow:hidden;">
      <div style="width:${score}%; height:100%; background:var(--${color}); border-radius:99px; transition:width .4s;"></div>
    </div>
  `;
}

/* ── HTML: بطاقة طالب واحدة في الداشبورد ── */
export function healthStudentRowHTML(student, groups, grades) {
  const group = findGroup(groups, student.groupId);
  const grade = gradeName(grades, student.groupId ? group?.gradeId : student.gradeId);
  const groupNameStr = group?.name || "";
  const h = student.health;
  const reason = [];
  if (h.attendanceRate < 60) reason.push(`حضور ${h.attendanceRate}%`);
  if (h.hasExams && h.examAvg < 50) reason.push(`درجات ${h.examAvg}%`);
  if (h.recentActions > 0) reason.push(`${h.recentActions} إجراء سلوكي`);

  return `
    <a href="student.html?id=${student.id}" class="health-row" style="display:flex; align-items:center; gap:12px; padding:10px 14px; border-radius:var(--r-md); text-decoration:none; color:var(--text); transition:background .15s; border:1px solid var(--border); margin-bottom:8px;">
      ${healthScoreHTML(h.total, 42)}
      <div style="flex:1; min-width:0;">
        <div style="font-weight:700; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${student.name}</div>
        <div style="font-size:12px; color:var(--muted); margin-top:1px;">${grade} · ${groupNameStr}</div>
      </div>
      ${reason.length ? `<div style="font-size:11px; color:var(--danger); text-align:left; max-width:120px;">${reason.join(" · ")}</div>` : ""}
    </a>
  `;
}
