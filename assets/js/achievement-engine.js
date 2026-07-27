// =========================================================
// Achievement Engine — صائد التفوق (Automated Positive Reinforcement)
// يكشف التحسن الأكاديمي ويولّد رسائل واتساب جاهزة لولى الأمر
// =========================================================

import { getExams, getStudents, addAchievement, getAchievementsForStudent, getAchievements } from "./storage.js";
import { getSession } from "./storage.js";
import { escapeHTML } from "./helpers.js";

/* ── أنواع الإنجازات ── */
const TYPES = {
  academic_jump: {
    label: "قفزة أكاديمية",
    icon: "🚀",
    color: "primary",
    threshold: 25,
  },
  excellence: {
    label: "تميّز",
    icon: "⭐",
    color: "success",
    minScore: 85,
    minImprovement: 15,
  },
  recovery: {
    label: "تعافي",
    icon: "💪",
    color: "warning",
    wasBelow: 50,
    nowAbove: 70,
  },
  perfect: {
    label: "درجة كاملة",
    icon: "🏆",
    color: "success",
  },
  consistent: {
    label: "تحسن مستمر",
    icon: "📈",
    color: "primary",
    minExams: 3,
  },
};

/* ── كشف الإنجازات لطالب بعد امتحان جديد ── */
export function detectAchievements(studentId, examId, newScore, maxScore) {
  const exams = getExams().slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const student = getStudents().find((s) => s.id === studentId);
  if (!student) return [];

  const exam = exams.find((e) => e.id === examId);
  if (!exam) return [];

  const newPct = Math.round((newScore / maxScore) * 100);

  /* نجيب كل امتحانات الطالب قبل ده */
  const previousResults = [];
  exams.forEach((e) => {
    if (e.id === examId) return;
    const r = (e.results || []).find((res) => res.studentId === studentId && !res.absent && res.score != null);
    if (r) previousResults.push({ exam: e, score: r.score, maxScore: e.maxScore, pct: Math.round((r.score / e.maxScore) * 100) });
  });

  /* نتحقق من الإنجازات القديمة عشان منكررهاش */
  const existing = getAchievementsForStudent(studentId);
  const existingExamTypes = new Set(existing.filter((a) => a.examId === examId).map((a) => a.type));

  const detected = [];

  /* ── 1. درجة كاملة ── */
  if (newScore === maxScore && !existingExamTypes.has("perfect")) {
    detected.push({
      type: "perfect",
      studentId,
      examId,
      examTitle: exam.title,
      examDate: exam.date,
      groupId: exam.groupId,
      newScore,
      maxScore,
      newPct,
      oldAvg: previousResults.length ? Math.round(previousResults.reduce((s, r) => s + r.pct, 0) / previousResults.length) : 0,
    });
  }

  if (!previousResults.length) return detected;

  /* حساب المتوسط السابق */
  const prevAvg = Math.round(previousResults.reduce((s, r) => s + r.pct, 0) / previousResults.length);
  const improvement = newPct - prevAvg;

  /* ── 2. قفزة أكاديمية (تحسن 25% أو أكتر) ── */
  if (improvement >= TYPES.academic_jump.threshold && !existingExamTypes.has("academic_jump")) {
    detected.push({
      type: "academic_jump",
      studentId,
      examId,
      examTitle: exam.title,
      examDate: exam.date,
      groupId: exam.groupId,
      newScore,
      maxScore,
      newPct,
      oldAvg: prevAvg,
      improvement,
    });
  }

  /* ── 3. تميّز (درجة 85%+ وتحسن 15%+) ── */
  if (newPct >= TYPES.excellence.minScore && improvement >= TYPES.excellence.minImprovement && !existingExamTypes.has("excellence")) {
    detected.push({
      type: "excellence",
      studentId,
      examId,
      examTitle: exam.title,
      examDate: exam.date,
      groupId: exam.groupId,
      newScore,
      maxScore,
      newPct,
      oldAvg: prevAvg,
      improvement,
    });
  }

  /* ── 4. تعافي (كان تحت 50% ووصل فوق 70%) ── */
  if (prevAvg < TYPES.recovery.wasBelow && newPct >= TYPES.recovery.nowAbove && !existingExamTypes.has("recovery")) {
    detected.push({
      type: "recovery",
      studentId,
      examId,
      examTitle: exam.title,
      examDate: exam.date,
      groupId: exam.groupId,
      newScore,
      maxScore,
      newPct,
      oldAvg: prevAvg,
      improvement,
    });
  }

  /* ── 5. تحسن مستمر (آخر 3 امتحانات في تزايد) ── */
  if (previousResults.length >= 2) {
    const lastThree = previousResults.slice(-2);
    const isConsistent = lastThree.every((r, i) => i === 0 || r.pct > lastThree[i - 1].pct) && newPct > lastThree[lastThree.length - 1].pct;
    if (isConsistent && !existingExamTypes.has("consistent")) {
      detected.push({
        type: "consistent",
        studentId,
        examId,
        examTitle: exam.title,
        examDate: exam.date,
        groupId: exam.groupId,
        newScore,
        maxScore,
        newPct,
        oldAvg: prevAvg,
        improvement,
      });
    }
  }

  return detected;
}

/* ── حفظ الإنجازات المكتشفة ── */
export function saveDetectedAchievements(achievements) {
  achievements.forEach((a) => {
    addAchievement({
      id: `ACH-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ...a,
      date: a.examDate || new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
      sent: false,
      sentAt: null,
    });
  });
}

/* ── توليد رسالة واتساب ── */
export function generateMessage(achievement, teacherName) {
  const student = getStudents().find((s) => s.id === achievement.studentId);
  const studentName = student?.name || "الطالب/ة";
  const t = teacherName || "المستمر";

  switch (achievement.type) {
    case "perfect":
      return `🏆 درجة كاملة! برافو ${studentName}!\n\nمستر ${t} فخور جداً بحصولك على ${achievement.newScore} من ${achievement.maxScore} في امتحان "${achievement.examTitle}" — درجة كاملة ومجهود يستحق التقدير.\n\nأدام الله تقدمك ونجاحك 💪`;

    case "academic_jump":
      return `🚀 قفزة أكاديمية مذهلة!\n\nبرافو ${studentName}! مستر ${t} لاحظ تقدمك الملموس في امتحان "${achievement.examTitle}" — حصلت على ${achievement.newPct}% ومتوسطه كان ${achievement.oldAvg}%.\n\nده تحسن ${achievement.improvement}% ودليل واضح على جهدك. كمّل كده! ⭐`;

    case "excellence":
      return `⭐ تميّز أكاديمي!\n\n${studentName} حصل على ${achievement.newPct}% في امتحان "${achievement.examTitle}" — تقدم ملحوظ عن متوسطه السابق (${achievement.oldAvg}%).\n\nمستر ${t} فخور جداً بتطورك. استمر يا بطل! 🌟`;

    case "recovery":
      return `💪 تعافي وتطور رائع!\n\nخبر سعيد ${studentName}! مستر ${t} يلاحظ تحسنك الكبير في امتحان "${achievement.examTitle}" — من ${achievement.oldAvg}% إلى ${achievement.newPct}%.\n\nده تأكد إنك في الطريق الصح. نفوس عليك! 🎯`;

    case "consistent":
      return `📈 تحسن مستمر وملحوظ!\n\n${studentName} بيظهر تقدماً مستمراً في كل امتحان. آخر نتيجة في "${achievement.examTitle}" كانت ${achievement.newPct}%.\n\nمستر ${t} يشجعك على الاستمرار — الإصرار والجهد مفتاح النجاح! 🔑`;

    default:
      return `🎉 إنجاز أكاديمي!\n\n${studentName} حصل على نتيجة ممتازة في امتحان "${achievement.examTitle}" — ${achievement.newPct}%.\n\nمستر ${t} فخور بيك! كمّل التقدم 💪`;
  }
}

/* ── توليد رسالة مجمّعة (إنجازات متعددة لطالب واحد) ── */
export function generateBatchMessage(achievements, teacherName) {
  if (!achievements.length) return "";
  if (achievements.length === 1) return generateMessage(achievements[0], teacherName);

  const student = getStudents().find((s) => s.id === achievements[0].studentId);
  const studentName = student?.name || "الطالب/ة";
  const t = teacherName || "المستمر";

  let msg = `🎉 إنجازات ${studentName} الأخيرة:\n\n`;
  achievements.forEach((a) => {
    const meta = TYPES[a.type] || {};
    msg += `${meta.icon || "⭐"} ${meta.label || "إنجاز"}: "${a.examTitle}" — ${a.newPct}%\n`;
  });
  msg += `\nمستر ${t} فخور جداً بتقدمك. كمّل كده! 💪`;
  return msg;
}

/* ── Helpers ── */
export function getTypeMeta(type) {
  return TYPES[type] || { label: type, icon: "⭐", color: "primary" };
}

export function getUnsentForStudent(studentId) {
  return getAchievementsForStudent(studentId).filter((a) => !a.sent);
}

export function getAllUnsent() {
  return getAchievements().filter((a) => !a.sent).sort((a, b) => (a.date < b.date ? 1 : -1));
}
