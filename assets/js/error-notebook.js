// =========================================================
// Error Notebook — دفتر الأخطاء (مشترك بين بوابة الطالب والعائلة)
// يقيس "رحلة علاج كل خطأ": جديد / متكرر / قيد العلاج / معالج
// البيانات: إجابات الطالب (examAnswers + إجابات التدريب)
// =========================================================

import { getExamAnswersForStudent, getQuestions, getSubjects, getTopics, getExams, getSkillMasteryAllForStudent, getTeachingSubject } from "./storage.js";

/** تاريخ آخر إجابة — يدعم createdAt (التدريب) أو تاريخ الامتحان (mock) */
function answerDate(a) {
  if (a.createdAt) return a.createdAt;
  const ex = getExams().find((e) => e.id === a.examId);
  return ex?.date || "";
}

/**
 * يبني دفتر أخطاء الطالب — إدخال واحد لكل سؤال أخطأ فيه الطالب.
 * الحالة:
 *   healed        = آخر إجابة على السؤال كانت صحيحة → الخطأ تم علاجه
 *   repeated      = أخطأ في نفس السؤال أكثر من مرة وآخر مرة غلط
 *   in-treatment  = غلط مرة وتمت مراجعته لكن آخر إجابة لسه غلط
 *   new           = غلط مرة واحدة ولم تتم مراجعته
 */
export function buildErrorNotebook(studentId) {
  const teaching = getTeachingSubject();
  const allQ = getQuestions();
  const qById = new Map(allQ.map((q) => [q.id, q]));
  const allowedIds = teaching ? new Set(allQ.filter((q) => q.subjectId === teaching.id).map((q) => q.id)) : null;
  const answers = getExamAnswersForStudent(studentId)
    .filter((a) => (allowedIds ? allowedIds.has(a.questionId) : true))
    .sort((a, b) => (answerDate(a) < answerDate(b) ? 1 : -1));
  const tById = new Map(getTopics().map((t) => [t.id, t]));
  const sById = new Map(getSubjects().map((s) => [s.id, s]));
  const skillRecBy = new Map(getSkillMasteryAllForStudent(studentId).map((r) => [r.skillId, r]));

  const byQ = new Map();
  answers.forEach((a) => {
    if (!qById.has(a.questionId)) return;
    if (!byQ.has(a.questionId)) byQ.set(a.questionId, []);
    byQ.get(a.questionId).push(a);
  });

  const entries = [];
  byQ.forEach((list, qid) => {
    const q = qById.get(qid);
    const wrongs = list.filter((a) => !a.isCorrect);
    if (!wrongs.length) return;

    const newest = list[0];
    const count = wrongs.length;
    const healed = !!newest.isCorrect;
    const reviewed = list.some((a) => a.reviewed || a.reviewedAt);
    const skillRec = skillRecBy.get(q.skill);
    const skillStatus = skillRec?.status || null;
    const escalated = skillStatus === "escalated";

    let status;
    if (healed) status = "healed";
    else if (skillStatus === "cured") status = "healed";
    else if (count >= 2) status = "repeated";
    else if (reviewed) status = "in-treatment";
    else status = "new";

    entries.push({
      question: q,
      subject: sById.get(q.subjectId),
      topic: tById.get(q.topicId),
      skill: q.skill || tById.get(q.topicId)?.name || "—",
      count,
      totalAnswers: list.length,
      wrongs,
      lastWrong: wrongs[0],
      lastDate: answerDate(wrongs[0]),
      reviewed,
      status,
      healed,
      escalated,
    });
  });

  const rank = { repeated: 0, new: 1, "in-treatment": 2, healed: 3 };
  entries.sort((a, b) => (rank[a.status] - rank[b.status]) || (b.count - a.count) || (a.lastDate < b.lastDate ? 1 : -1));
  return entries;
}

/** إحصاءات العلاج: جديد / معالج / متكرر / قيد العلاج + نسبة العلاج */
export function notebookStats(entries) {
  const newCount = entries.filter((e) => e.status === "new").length;
  const treated = entries.filter((e) => e.status === "healed").length;
  const repeated = entries.filter((e) => e.status === "repeated").length;
  const inTreatment = entries.filter((e) => e.status === "in-treatment").length;
  const total = entries.length;
  return {
    newCount,
    treated,
    repeated,
    inTreatment,
    total,
    treatmentRate: total ? Math.round((treated / total) * 100) : 0,
  };
}

/** أكثر الأخطاء تكراراً مجمعة حسب المهارة (الأسئلة غير المعالجة) */
export function repeatedSkills(entries, limit = 5) {
  const bySkill = new Map();
  entries
    .filter((e) => e.status !== "healed")
    .forEach((e) => {
      if (!bySkill.has(e.skill)) bySkill.set(e.skill, { skill: e.skill, count: 0, questions: 0 });
      const o = bySkill.get(e.skill);
      o.count += e.count;
      o.questions += 1;
    });
  return [...bySkill.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

/** عدد المرات المتبقية حتى تتأكد — مبسّطة: إدخال واحد لكل خطأ غير معالج */
export function pendingErrors(entries) {
  return entries.filter((e) => e.status !== "healed");
}
