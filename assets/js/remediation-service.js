// =========================================================
// Remediation Service — خدمة علاج الأخطاء (قواعد فقط، بلا AI)
// لِكل حلقة: سؤال بديل بنفس المهارة + تأكيد بالمسافة + تصعيد
// تعمل محلياً بالكامل على IndexedDB
// =========================================================

import {
  getQuestions, getExamAnswersForStudent,
  getDueSkillReviews, getSkillMasteryForStudent, getStudents,
} from "./storage.js";
import { buildErrorNotebook, notebookStats } from "./error-notebook.js";

/* ═══════════════════════════════════════════════════════════
   النقط الديناميكية — أرقام صغيرة تتناسب مع بنك 20 ألف سؤال
   نقاط السؤال = وزن نوع السؤال × مضاعف الصعوبة × معامل المحاولة × تعزيز الضعف
   ═══════════════════════════════════════════════════════════ */
export const QUESTION_TYPE_WEIGHTS = {
  vocab: 1,        // كلمات — وزن منخفض (كثيرة وتتكرر)
  grammar: 2,      // قواعد — أعلى
  reading: 3,      // قراءة/قطع
  comprehension: 3,
  listening: 3,
  writing: 4,      // كتابة — الأعلى
  speaking: 4,
};
export const QUESTION_TYPE_LABELS = {
  vocab: "كلمات",
  grammar: "قواعد",
  reading: "قراءة",
  comprehension: "استيعاب",
  listening: "استماع",
  writing: "كتابة",
  speaking: "تحدث",
};
const DIFFICULTY_MULT = { easy: 1, medium: 1.25, hard: 1.5 };
const ATTEMPT_FACTORS = { first: 1.0, retest: 0.6, learned: 0.3 };

export function questionTypeLabel(type) {
  return QUESTION_TYPE_LABELS[type] || "أسئلة";
}

function isWeakSkill(studentId, skillId) {
  const rec = getSkillMasteryForStudent(studentId, skillId);
  return !!(rec && rec.status !== "cured");
}

/**
 * نقط إجابة سؤال تدريبي — ديناميكية حسب الطالب.
 * attemptKind: first (أول مرة) | retest (تأكيد 72 ساعة) | learned (خطأ ثم فهمت)
 * الإجابة الغلط = 0 نقط.
 */
export function computeAnswerScore(studentId, question, isCorrect, attemptKind = "first") {
  if (!isCorrect) return 0;
  const typeWeight = QUESTION_TYPE_WEIGHTS[question.qtype] || 1;
  const diffMult = DIFFICULTY_MULT[question.difficulty] || 1;
  const attemptFactor = ATTEMPT_FACTORS[attemptKind] ?? 1;
  const weaknessBoost = isWeakSkill(studentId, question.skill) ? 1.5 : 1;
  return Math.max(1, Math.round(typeWeight * diffMult * attemptFactor * weaknessBoost));
}

/** تاريخ الإجابة — createdAt للتدريب أو تاريخ الامتحان للمواد القديمة */
function answerDate(a) {
  if (a.createdAt) return a.createdAt;
  return "";
}

function daysSince(iso) {
  if (!iso) return 999;
  const d1 = new Date(iso + "T00:00:00").getTime();
  if (isNaN(d1)) return 999;
  return Math.floor((Date.now() - d1) / 86400000);
}

/**
 * سؤال بديل يختبر نفس (skill + difficulty) فعلاً
 * — يستبعد السؤال نفسه والأسئلة المتعرض لها خلال آخر 7 أيام (منع الحفظ)
 * — يفضّل الأسئلة اللي لم تُجاب إطلاقاً ثم الأقل إجابةً
 */
export function pickAlternative(studentId, questionId) {
  const q = getQuestions().find((x) => x.id === questionId);
  if (!q) return null;
  const answers = getExamAnswersForStudent(studentId);
  const seenRecently = new Set(
    answers.filter((a) => daysSince(answerDate(a)) <= 7).map((a) => a.questionId)
  );
  const candidates = getQuestions().filter(
    (x) => x.skill === q.skill && x.id !== questionId && !seenRecently.has(x.id)
  );
  const sameDiff = candidates.filter((x) => x.difficulty === q.difficulty);
  const pool = sameDiff.length ? sameDiff : candidates;
  if (!pool.length) return null;

  const scored = pool
    .map((x) => ({ q: x, n: answers.filter((a) => a.questionId === x.id).length }))
    .sort((a, b) => a.n - b.n || (a.q.id < b.q.id ? -1 : 1));
  return scored[0].q;
}

/**
 * قائمة مراجعة الطالب الآن:
 * 1) تأكيدات الاستحقاق (قيد العلاج وانتهت الـ 72 ساعة) — إعادة اختبار
 * 2) أخطاء غير معالجة لم تدخل الاستحقاق بعد — مراجعة مباشرة
 * كل عنصر بيُفضَّل فيه السؤال البديل (نفس المهارة) على نفس السؤال القديم
 */
export function getRemediationReviewList(studentId, limit = 10) {
  const nb = buildErrorNotebook(studentId);
  const entryBySkill = new Map(nb.map((e) => [e.skill, e]));
  const due = getDueSkillReviews(studentId);
  const list = [];
  const seenSkills = new Set();

  due.forEach((r) => {
    if (seenSkills.has(r.skillId)) return;
    seenSkills.add(r.skillId);
    const entry = entryBySkill.get(r.skillId);
    const base = entry?.question || getQuestions().find((x) => x.skill === r.skillId);
    if (!base) return;
    list.push({
      mode: "retest",
      skillId: r.skillId,
      status: r.status,
      question: pickAlternative(studentId, base.id) || base,
      entry: entry || null,
    });
  });

  nb
    .filter((e) => e.status !== "healed" && !seenSkills.has(e.skill))
    .forEach((e) => {
      seenSkills.add(e.skill);
      list.push({
        mode: "review",
        skillId: e.skill,
        status: "treating",
        question: pickAlternative(studentId, e.question.id) || e.question,
        entry: e,
      });
    });

  return list.slice(0, limit);
}

/**
 * تحديث داعم لولي الأمر — لغة إنسانية مبسطة، بلا مصطلحات تقنية،
 * بلا مقارنة بأي طالب/أخ، ومبنية على القوة + خطوة واحدة قادمة
 */
export function parentUpdate(studentId) {
  const nb = buildErrorNotebook(studentId);
  const st = notebookStats(nb);
  const due = getDueSkillReviews(studentId);
  const pending = nb.filter((e) => e.status !== "healed");

  const strengths = nb
    .filter((e) => e.status === "healed")
    .map((e) => e.skill);
  const strongest = nb.filter((e) => e.status === "healed").slice(0, 2).map((e) => e.skill);

  const head = pending.length === 0
    ? "خطواته الطيبة ثابتة وممتازة 🌟"
    : st.treatmentRate >= 50
      ? "بيتقدم بشكل ملحوظ ومستمر"
      : "شغّال على خطوة جديدة ومحتاج دعمكم فيها";

  const step =
    pending.length > 0
      ? `الأسبوع الجاي هنتدرب على مهارة «${pending[0].skill}» مع بعض ونجاوب شوية أسئلة بديلة عنها.`
      : "هنكمّل تعزيز المهارات اللي اتقنها بمراجعات سريعة كل فترة.";

  return {
    headline: head,
    messageLines: [
      strengths.length
        ? `اتقن حتى الآن: ${[...new Set(strengths)].slice(0, 2).join("، ")}.`
        : "لسه في بداية الطريق — طبيعي جداً، والتعلم بياخد وقته.",
      step,
      due.length > 0 ? "في مراجعة صغيرة مستنية، خليها معاه في وقت هادي." : "",
    ].filter(Boolean),
    tone: "supportive",
  };
}

/** أسماء الطلاب لجدول التصعيد */
export function studentNamesById() {
  return new Map(getStudents().map((s) => [s.id, s.name]));
}
