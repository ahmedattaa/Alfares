// =========================================================
// Lookups — دوال مساعدة لربط البيانات الأساسية (Lookup Tables)
// السنوات الدراسية / المجموعات / حالات الطالب
// =========================================================

/** إيجاد سنة دراسية بمعرفها */
export function findGrade(grades, gradeId) {
  return grades.find((g) => g.id === gradeId) || null;
}

/** إيجاد مجموعة بمعرفها */
export function findGroup(groups, groupId) {
  return groups.find((g) => g.id === groupId) || null;
}

/** إيجاد حالة طالب بمعرفها */
function findStatus(statuses, statusId) {
  return statuses.find((s) => s.id === statusId) || null;
}

/** اسم السنة الدراسية لعرضه فى الجداول */
export function gradeName(grades, gradeId) {
  return findGrade(grades, gradeId)?.name || "-";
}

/** اسم المجموعة لعرضه فى الجداول */
export function groupName(groups, groupId) {
  return findGroup(groups, groupId)?.name || "-";
}

/** المجموعات التابعة لسنة دراسية معينة فقط */
export function groupsForGrade(groups, gradeId) {
  return groups.filter((g) => g.gradeId === gradeId);
}

/**
 * اقتراح كود تلقائى للمجموعة الجديدة = ترتيب السنة الدراسية + ترتيب المجموعة داخلها
 * مثال: سنة أولى (ترتيب 1) + ثانى مجموعة فيها => "12"
 * الكود هنا اقتراح فقط، والمستخدم حر فى تعديله بالكامل قبل الحفظ
 */
export function suggestGroupCode(grades, groups, gradeId) {
  const grade = findGrade(grades, gradeId);
  if (!grade) return "";
  const siblingCount = groupsForGrade(groups, gradeId).length;
  return `${grade.order}${siblingCount + 1}`;
}

/**
 * اقتراح كود تلقائى للطالب = كود المجموعة متبوعًا بترتيبه داخلها مباشرة (بدون فواصل)
 * مثال: مجموعة كودها "11" وهو خامس طالب فيها => "115"
 * الكود هنا اقتراح فقط، والمستخدم حر فى تعديله بالكامل قبل الحفظ
 */
export function suggestStudentCode(students, group) {
  if (!group) return "";
  const countInGroup = students.filter((s) => s.groupId === group.id).length;
  return `${group.code}${countInGroup + 1}`;
}

/** المبلغ المطلوب فعليًا من الطالب لهذه الحصة بعد خصم قيمة خصمه الشخصى (إن وجد) */
export function dueAmount(student, group) {
  const fullPrice = group?.sessionPrice || 0;
  const discount = Math.min(fullPrice, Number(student?.discount || 0));
  return Math.max(0, fullPrice - discount);
}

/** تصنيف حالات الطالب حسب النوع: حضور/غياب يومى، أو إجراء استثنائى (استدعاء/طرد) */
export function statusesByCategory(statuses, category) {
  return statuses.filter((s) => s.category === category);
}
