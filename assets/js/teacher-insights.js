// =========================================================
// Teacher Insights — لوحة المعلم
// 5 أقسام: الدفع · المتابعة · صحة الطلاب · المجموعات · الإنجازات
// =========================================================

import { initPage } from "./app.js";
import { icons } from "./icons.js";
import { getStudents, getGroups, getGrades, getAttendance, getStudentStatuses, getExams, getSession, getAchievements, markAchievementSent, getCenterName } from "./storage.js";
import { formatMoney, escapeHTML, formatDateAr } from "./helpers.js";
import { toast, confirmDialog } from "./ui.js";
import { gradeName, findGroup } from "./lookups.js";
import { openWhatsApp } from "./whatsapp.js";
import { computeAllHealthScores, getHealthColor, healthScoreHTML, healthBarHTML } from "./health-score.js";
import { generateMessage, getTypeMeta, getAllUnsent } from "./achievement-engine.js";
import { getEscalationSummary, overrideEscalation, logPhoneCall, buildEscalationMessage } from "./escalation-engine.js";
import { renderBellCurve, renderDistributionBar } from "./charts.js";
import { renderTemplate } from "./whatsapp-templates.js";
import { openCollectionDialog } from "./collection-dialog.js";
import { canPerformAction } from "./permissions.js";

const content = await initPage("teacher-insights");
let activeSection = null;
let followupSubTab = "escalation";
let disengagedGradeFilter = "all";
let disengagedMode = "more2";

if (content) render();

function render() {
  const students = getStudents().filter((s) => s.status === "active");
  const attendance = getAttendance();
  const statuses = getStudentStatuses();
  const groups = getGroups();
  const grades = getGrades();

  const latePayers = students.filter((s) => (s.lateBalance || 0) > 0);
  const atRiskCount = calcAtRiskStudents(students, groups).length;
  const troublemakersCount = calcTroublemakers(students, attendance, statuses, groups).length;
  const unsentAchievements = getAllUnsent().length;
  const escalationSummary = getEscalationSummary();
  const followupTotal = escalationSummary.total + troublemakersCount + atRiskCount;

  content.innerHTML = `
    <div class="page__header">
      <div>
        <div class="page__title">لوحة المعلم</div>
        <div class="page__subtitle">نظرة شاملة على أداء الطلاب والمجموعات</div>
      </div>
    </div>

    <div class="ti-actions">
      <button class="ti-action-btn ti-action-btn--danger ${activeSection === "late" ? "is-active" : ""}" data-section="late">
        <span class="ti-action-btn__icon">${icons.wallet}</span>
        <span class="ti-action-btn__text">
          <span class="ti-action-btn__title">💰 الدفع</span>
          <span class="ti-action-btn__count">${latePayers.length} طالب متأخر</span>
        </span>
      </button>
      <button class="ti-action-btn ti-action-btn--warning ${activeSection === "followup" ? "is-active" : ""}" data-section="followup">
        <span class="ti-action-btn__icon">${icons.alert}</span>
        <span class="ti-action-btn__text">
          <span class="ti-action-btn__title">🔔 المتابعة</span>
          <span class="ti-action-btn__count">${followupTotal} طالب يحتاج متابعة</span>
        </span>
      </button>
      <button class="ti-action-btn ti-action-btn--success ${activeSection === "health" ? "is-active" : ""}" data-section="health">
        <span class="ti-action-btn__icon">${icons.shield}</span>
        <span class="ti-action-btn__text">
          <span class="ti-action-btn__title">💚 صحة الطلاب</span>
          <span class="ti-action-btn__count">${calcStudentHealthCount()} طالب تحت الخطر</span>
        </span>
      </button>
      <button class="ti-action-btn ti-action-btn--primary ${activeSection === "groups" ? "is-active" : ""}" data-section="groups">
        <span class="ti-action-btn__icon">${icons.chart}</span>
        <span class="ti-action-btn__text">
          <span class="ti-action-btn__title">📊 المجموعات</span>
          <span class="ti-action-btn__count">${groups.length} مجموعة</span>
        </span>
      </button>
      <button class="ti-action-btn ti-action-btn--success ${activeSection === "achievements" ? "is-active" : ""}" data-section="achievements">
        <span class="ti-action-btn__icon">${icons.shield}</span>
        <span class="ti-action-btn__text">
          <span class="ti-action-btn__title">🏅 الإنجازات</span>
          <span class="ti-action-btn__count">${unsentAchievements} إنجاز جديد</span>
        </span>
      </button>
    </div>

    <div id="sectionContent"></div>
  `;

  content.querySelectorAll(".ti-action-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      const section = btn.dataset.section;
      activeSection = activeSection === section ? null : section;
      render();
    })
  );

  renderSection();
}

/* ═══════════════════════════════════════════════════════════
   حسابات البيانات
   ═══════════════════════════════════════════════════════════ */

function calcDisengaged(students, attendance, statuses, groups, exams, opts = {}) {
  const { gradeId = "all", mode = "more2" } = opts;
  const absentStatuses = new Set(statuses.filter((s) => s.presence === "absent").map((s) => s.id));

  let filtered = students;
  if (gradeId !== "all") {
    const gradeGroups = groups.filter((g) => g.gradeId === gradeId).map((g) => g.id);
    filtered = filtered.filter((s) => gradeGroups.includes(s.groupId));
  }

  const disengagedStudents = [];

  if (mode === "exam") {
    const examAbsentIds = new Set();
    exams.forEach((ex) => {
      (ex.results || []).forEach((r) => {
        if (r.absent) examAbsentIds.add(r.studentId);
      });
    });
    filtered.forEach((s) => {
      if (examAbsentIds.has(s.id)) {
        disengagedStudents.push({
          student: s,
          group: findGroup(groups, s.groupId),
          lastDates: [],
          consecutiveAbsences: 0,
          examAbsent: true,
        });
      }
    });
  } else {
    const minDays = mode === "2" ? 2 : 3;
    filtered.forEach((s) => {
      const groupRecords = attendance
        .filter((a) => a.studentId === s.id && a.category === "attendance")
        .sort((a, b) => b.date.localeCompare(a.date));

      const lastN = groupRecords.slice(0, minDays);
      if (lastN.length < minDays) return;

      const allAbsent = lastN.every((r) => absentStatuses.has(r.statusId));
      if (!allAbsent) return;

      disengagedStudents.push({
        student: s,
        group: findGroup(groups, s.groupId),
        lastDates: lastN.map((r) => r.date),
        consecutiveAbsences: lastN.length,
      });
    });
  }

  return disengagedStudents.sort((a, b) => {
    if (a.examAbsent && !b.examAbsent) return 1;
    if (!a.examAbsent && b.examAbsent) return -1;
    return (a.lastDates[0] || "").localeCompare(b.lastDates[0] || "");
  });
}

function calcWeakestExam(exams, groups) {
  if (!exams.length) return null;

  let weakest = null;
  let weakestAvg = Infinity;

  exams.forEach((exam) => {
    const validResults = (exam.results || []).filter((r) => !r.absent && r.score != null);
    if (!validResults.length) return;

    const avg = validResults.reduce((sum, r) => sum + Math.round((r.score / exam.maxScore) * 100), 0) / validResults.length;
    if (avg < weakestAvg) {
      weakestAvg = avg;
      weakest = {
        exam,
        avgPct: Math.round(avg),
        totalStudents: (exam.results || []).length,
        gradedStudents: validResults.length,
        group: findGroup(groups, exam.groupId),
      };
    }
  });

  return weakest;
}

function calcAtRiskStudents(students, groups) {
  const exams = getExams().slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  if (exams.length < 2) return [];

  const studentExamData = {};
  students.forEach((s) => (studentExamData[s.id] = []));

  exams.forEach((exam) => {
    (exam.results || []).forEach((r) => {
      if (!studentExamData[r.studentId] || r.absent) return;
      const pct = Math.round((r.score / exam.maxScore) * 100);
      studentExamData[r.studentId].push({ examId: exam.id, date: exam.date, pct, title: exam.title, maxScore: exam.maxScore, score: r.score });
    });
  });

  const atRisk = [];
  students.forEach((s) => {
    const scores = studentExamData[s.id];
    if (!scores || scores.length < 2) return;

    let maxDrop = 0;
    let worstPair = null;
    for (let i = 1; i < scores.length; i++) {
      const drop = scores[i - 1].pct - scores[i].pct;
      if (drop > maxDrop) {
        maxDrop = drop;
        worstPair = { prev: scores[i - 1], curr: scores[i] };
      }
    }

    const last = scores[scores.length - 1];
    const prev = scores.slice(0, -1);
    const avgPrev = Math.round(prev.reduce((sum, x) => sum + x.pct, 0) / prev.length);
    const overallDrop = avgPrev - last.pct;

    if (maxDrop >= 15 || overallDrop >= 15) {
      atRisk.push({
        student: s,
        group: findGroup(groups, s.groupId),
        worstPair,
        maxDrop,
        lastExam: last,
        avgPrev,
        overallDrop,
        totalExams: scores.length,
        scores,
      });
    }
  });

  return atRisk.sort((a, b) => b.maxDrop - a.maxDrop);
}

function calcStudentHealthCount() {
  return computeAllHealthScores().filter((s) => s.health.total < 60).length;
}

function calcTroublemakers(students, attendance, statuses, groups) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString().slice(0, 10);

  const negativeActions = new Set(
    statuses.filter((s) => s.category === "action" && (s.tone === "warning" || s.tone === "danger")).map((s) => s.id)
  );

  const recentActions = attendance.filter(
    (a) => a.date >= cutoff && a.category === "action" && negativeActions.has(a.statusId)
  );

  const studentMap = {};
  recentActions.forEach((a) => {
    if (!studentMap[a.studentId]) {
      studentMap[a.studentId] = { count: 0, actions: [], lastDate: a.date };
    }
    studentMap[a.studentId].count++;
    const status = statuses.find((s) => s.id === a.statusId);
    studentMap[a.studentId].actions.push({ date: a.date, statusName: status?.name || a.statusId });
    if (a.date > studentMap[a.studentId].lastDate) studentMap[a.studentId].lastDate = a.date;
  });

  return Object.entries(studentMap)
    .map(([studentId, data]) => {
      const student = students.find((s) => s.id === studentId);
      if (!student) return null;
      return {
        student,
        group: findGroup(groups, student.groupId),
        count: data.count,
        actions: data.actions,
        lastDate: data.lastDate,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.count - a.count);
}

function calcGroupPerformance(students, attendance, statuses, groups, grades) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString().slice(0, 10);
  const recent = attendance.filter((a) => a.date >= cutoff && a.category === "attendance");

  return groups.map((g) => {
    const enrolled = students.filter((s) => s.groupId === g.id);
    const enrolledIds = new Set(enrolled.map((s) => s.id));
    const records = recent.filter((a) => enrolledIds.has(a.studentId));

    const presentCount = records.filter((a) => statuses.find((s) => s.id === a.statusId)?.presence === "present").length;
    const totalPossible = enrolled.length * 30;
    const avgAttendance = totalPossible ? Math.round((presentCount / totalPossible) * 100) : 0;

    const paidCount = records.filter((a) => a.statusId === "ST-PAID").length;
    const unpaidCount = records.filter((a) => a.statusId === "ST-UNPAID").length;
    const paymentRate = presentCount ? Math.round((paidCount / presentCount) * 100) : 0;

    return {
      group: g,
      grade: gradeName(grades, g.gradeId),
      enrolled: enrolled.length,
      presentCount,
      paidCount,
      unpaidCount,
      avgAttendance: Math.min(100, avgAttendance),
      paymentRate,
    };
  }).sort((a, b) => b.avgAttendance - a.avgAttendance);
}

function calcCenterHealth(students, attendance, statuses, groups) {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;

  const allStudents = getStudents();
  const activeStudents = allStudents.filter((s) => s.status === "active");
  const pausedStudents = allStudents.filter((s) => s.status === "paused");

  const newThisMonth = allStudents.filter((s) => (s.joinDate || "").startsWith(thisMonth));
  const newLastMonth = allStudents.filter((s) => (s.joinDate || "").startsWith(lastMonthStr));

  const pausedThisMonth = pausedStudents.filter((s) => (s.joinDate || "").startsWith(thisMonth));

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString().slice(0, 10);
  const recent = attendance.filter((a) => a.date >= cutoff && a.category === "attendance");

  const presentCount = recent.filter((a) => statuses.find((x) => x.id === a.statusId)?.presence === "present").length;
  const totalRecords = recent.length;
  const attendanceRate = totalRecords ? Math.round((presentCount / totalRecords) * 100) : 0;

  const paidCount = recent.filter((a) => a.statusId === "ST-PAID").length;
  const paymentRate = presentCount ? Math.round((paidCount / presentCount) * 100) : 0;

  const avgBalance = activeStudents.length
    ? Math.round(activeStudents.reduce((sum, s) => sum + (s.lateBalance || 0), 0) / activeStudents.length)
    : 0;

  const totalLateBalance = activeStudents.reduce((sum, s) => sum + (s.lateBalance || 0), 0);

  const churnRate = activeStudents.length
    ? Math.round((pausedStudents.length / (activeStudents.length + pausedStudents.length)) * 100)
    : 0;

  const growthTrend = newThisMonth.length - newLastMonth.length;

  return {
    totalActive: activeStudents.length,
    totalPaused: pausedStudents.length,
    totalAll: allStudents.length,
    newThisMonth: newThisMonth.length,
    newLastMonth: newLastMonth.length,
    pausedThisMonth: pausedThisMonth.length,
    attendanceRate,
    paymentRate,
    avgBalance,
    totalLateBalance,
    churnRate,
    growthTrend,
    groupsCount: groups.length,
  };
}

/* ═══════════════════════════════════════════════════════════
   عرض الأقسام
   ═══════════════════════════════════════════════════════════ */

function renderSection() {
  const box = document.getElementById("sectionContent");
  if (!activeSection) { box.innerHTML = `<div class="ti-empty">اختر قسماً من الأزرار أعلاه</div>`; return; }
  if (activeSection === "late") return renderLatePayersSection(box);
  if (activeSection === "followup") return renderFollowupSection(box);
  if (activeSection === "health") return renderStudentHealthSection(box);
  if (activeSection === "groups") return renderGroupsSection(box);
  if (activeSection === "achievements") return renderAchievementsSection(box);
}

/* ── متأخرون في الدفع ── */
function renderLatePayersSection(box) {
  const students = getStudents().filter((s) => s.status === "active" && (s.lateBalance || 0) > 0);
  const groups = getGroups();
  const grades = getGrades();

  const sorted = [...students].sort((a, b) => (b.lateBalance || 0) - (a.lateBalance || 0));
  const gradeOptions = grades.sort((a, b) => a.order - b.order);

  box.innerHTML = `
    <div class="card card-pad">
      <div class="card__head">
        <div class="card__title" style="color:var(--danger);">💰 متأخرون في الدفع</div>
        <span class="badge badge-danger">${sorted.length} طالب — ${formatMoney(sorted.reduce((s, st) => s + (st.lateBalance || 0), 0))}</span>
      </div>
      <div class="ti-filters">
        <select class="select" id="lateGradeFilter" style="max-width:180px;">
          <option value="">كل السنوات</option>
          ${gradeOptions.map((g) => `<option value="${g.id}">${escapeHTML(g.name)}</option>`).join("")}
        </select>
        <select class="select" id="lateGroupFilter" style="max-width:220px;">
          <option value="">كل المجموعات</option>
        </select>
        <select class="select" id="lateAmountFilter" style="max-width:180px;">
          <option value="">كل المبالغ</option>
          <option value="50+">50 ج.م فأكثر</option>
          <option value="100+">100 ج.م فأكثر</option>
          <option value="200+">200 ج.م فأكثر</option>
          <option value="500+">500 ج.م فأكثر</option>
        </select>
      </div>
      <div id="lateList"></div>
    </div>
  `;

  const gradeSelect = document.getElementById("lateGradeFilter");
  const groupSelect = document.getElementById("lateGroupFilter");
  const amountSelect = document.getElementById("lateAmountFilter");

  function updateGroups() {
    const gid = gradeSelect.value;
    const filtered = gid ? groups.filter((g) => g.gradeId === gid) : groups;
    groupSelect.innerHTML = `<option value="">كل المجموعات</option>` +
      filtered.map((g) => `<option value="${g.id}">${escapeHTML(g.name)}</option>`).join("");
  }

  function renderList() {
    const gid = gradeSelect.value;
    const groupId = groupSelect.value;
    const amountVal = amountSelect.value;

    let data = sorted;
    if (gid) data = data.filter((s) => {
      const g = findGroup(groups, s.groupId);
      return g?.gradeId === gid;
    });
    if (groupId) data = data.filter((s) => s.groupId === groupId);
    if (amountVal) {
      const min = parseInt(amountVal);
      data = data.filter((s) => (s.lateBalance || 0) >= min);
    }

    const totalDue = data.reduce((s, st) => s + (st.lateBalance || 0), 0);
    const list = document.getElementById("lateList");
    if (!data.length) {
      list.innerHTML = `<div class="text-muted" style="padding:20px; text-align:center;">لا يوجد طلاب متأخرين في الدفع</div>`;
      return;
    }

    list.innerHTML = `
      <div style="padding:10px 0; font-size:13px; color:var(--muted); border-bottom:1px solid var(--border);">
        ${data.length} طالب — إجمالى المتأخرات: <strong style="color:var(--danger);">${formatMoney(totalDue)}</strong>
      </div>
      ${data.map((s) => {
        const group = findGroup(groups, s.groupId);
        return `
        <div class="ti-student-row">
          <div class="ti-student-row__avatar">${escapeHTML(s.code || "?")}</div>
          <div class="ti-student-row__info">
            <div class="ti-student-row__name">${escapeHTML(s.name)}</div>
            <div class="ti-student-row__meta">${escapeHTML(group?.name || "")} · ${escapeHTML(group?.code || "")}</div>
          </div>
          <div class="ti-student-row__amount">${formatMoney(s.lateBalance || 0)}</div>
          ${canPerformAction(getSession(), "teacher-insights", "collection") ? `<button type="button" class="btn btn-outline btn-sm ti-collect-btn" data-id="${s.id}" title="تحصيل المتأخرات" style="color:var(--success); border-color:var(--success);">💰</button>` : ""}
          <button type="button" class="btn btn-outline btn-sm ti-wa-btn" data-phone="${escapeHTML(s.parentPhone || s.phone || "")}" data-name="${escapeHTML(s.name)}">${icons.whatsapp}</button>
          ${s.parentPhone || s.phone ? `<a class="btn btn-outline btn-sm" href="tel:${escapeHTML(s.parentPhone || s.phone || "")}" title="اتصال بولي الأمر" style="text-decoration:none;">${icons.phone}</a>` : ""}
          <a class="btn btn-outline btn-sm" href="student.html?id=${s.id}">${icons.arrowLeft}</a>
        </div>`;
      }).join("")}
    `;
    bindWhatsAppButtons(list);
    list.querySelectorAll(".ti-collect-btn").forEach((btn) => {
      btn.addEventListener("click", () => openCollectionDialog(btn.dataset.id, { onClose: renderList }));
    });
  }

  gradeSelect.addEventListener("change", () => { updateGroups(); renderList(); });
  groupSelect.addEventListener("change", renderList);
  amountSelect.addEventListener("change", renderList);

  updateGroups();
  renderList();
}

/* ═══════════════════════════════════════════════════════════
   🔔 المتابعة — قسم موحد (تصعيد + منقطون + مشاغلون + يتأخرون)
   ═══════════════════════════════════════════════════════════ */
function renderFollowupSection(box) {
  const students = getStudents().filter((s) => s.status === "active");
  const groups = getGroups();
  const grades = getGrades();
  const attendance = getAttendance();
  const statuses = getStudentStatuses();
  const exams = getExams();
  const session = getSession();
  const escalationSummary = getEscalationSummary();

  const tabs = [
    { id: "escalation", label: "التصعيد", count: escalationSummary.total, color: "danger" },
    { id: "disengaged", label: "المنقطعون", count: calcDisengaged(students, attendance, statuses, groups, exams, { mode: disengagedMode }).length, color: "warning" },
    { id: "troublemakers", label: "المشاغلون", count: calcTroublemakers(students, attendance, statuses, groups).length, color: "danger" },
    { id: "declining", label: "يتأخرون", count: calcAtRiskStudents(students, groups).length, color: "warning" },
  ];

  box.innerHTML = `
    <div class="card card-pad">
      <div class="card__head">
        <div class="card__title" style="color:var(--warning);">${icons.alert} المتابعة</div>
      </div>
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:16px;">
        ${tabs.map((t) => `<button class="btn btn-sm ${followupSubTab === t.id ? "btn-primary" : "btn-outline"} followup-tab-btn" data-tab="${t.id}">${t.label} (${t.count})</button>`).join("")}
      </div>
      <div id="followupContent"></div>
    </div>
  `;

  box.querySelectorAll(".followup-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      followupSubTab = btn.dataset.tab;
      renderFollowupSection(box);
    });
  });

  const inner = document.getElementById("followupContent");
  if (followupSubTab === "escalation") renderFollowupEscalation(inner, escalationSummary, groups, grades, session);
  else if (followupSubTab === "disengaged") renderFollowupDisengaged(inner, students, attendance, statuses, groups, exams);
  else if (followupSubTab === "troublemakers") renderFollowupTroublemakers(inner, students, attendance, statuses, groups);
  else if (followupSubTab === "declining") renderFollowupDeclining(inner, students, groups, exams);
}

/* ── التصعيد (داخل المتابعة) ── */
function renderFollowupEscalation(inner, summary, groups, grades, session) {
  const allEscalated = [
    ...summary.level3.map((s) => ({ ...s, levelTag: "🔴 قفل — استدعاء", levelBadge: "danger" })),
    ...summary.level2.map((s) => ({ ...s, levelTag: "🟠 اتصال مطلوب", levelBadge: "warning" })),
    ...summary.level1.map((s) => ({ ...s, levelTag: "🟡 إنذار أول", levelBadge: "info" })),
  ];

  inner.innerHTML = `
    <p style="font-size:12px; color:var(--muted); margin-bottom:12px; line-height:1.7;">
      الغياب الأول المتتالي (بدون إذن): رسالة واتساب آلية هادئة · الثاني: اتصال هاتفي مطلوب · الثالث: قفل + استدعاء ولي الأمر
    </p>
    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px;">
      ${summary.level3.length ? `<span style="display:flex; align-items:center; gap:4px; font-size:12px; font-weight:700; color:var(--danger);">🔴 ${summary.level3.length} قفل</span>` : ""}
      ${summary.level2.length ? `<span style="display:flex; align-items:center; gap:4px; font-size:12px; font-weight:700; color:var(--warning);">🟠 ${summary.level2.length} اتصال مطلوب</span>` : ""}
      ${summary.level1.length ? `<span style="display:flex; align-items:center; gap:4px; font-size:12px; font-weight:700; color:var(--info);">🟡 ${summary.level1.length} إنذار أول</span>` : ""}
    </div>
    <div id="escList"></div>
  `;

  const listEl = document.getElementById("escList");
  if (!allEscalated.length) {
    listEl.innerHTML = `<div class="ti-empty">لا يوجد طلاب في حالة تصعيد — الكل طبيعي 👍</div>`;
    return;
  }

  listEl.innerHTML = allEscalated.map((s) => {
    const group = findGroup(groups, s.groupId);
    const grade = gradeName(grades, group?.gradeId);
    return `
      <div class="ti-student-row ti-student-row--${s.levelBadge}">
        <div class="ti-student-row__avatar">${escapeHTML(s.code || "?")}</div>
        <div class="ti-student-row__info">
          <div class="ti-student-row__name">${escapeHTML(s.name)}</div>
          <div class="ti-student-row__meta">${escapeHTML(group?.name || "")} · ${escapeHTML(grade || "")} · ${s.consecutiveAbsences} غيابات متتالية</div>
        </div>
        <span class="badge badge-${s.levelBadge}" style="font-size:11px; white-space:nowrap;">${s.levelTag}</span>
        <div class="ti-student-row__actions" style="gap:4px;">
          ${s.escalationLevel === 1 || s.escalationLevel === 2 ? `<button type="button" class="btn btn-success btn-sm escWaBtn" data-id="${s.id}" data-name="${escapeHTML(s.name)}" data-phone="${escapeHTML(s.parentPhone || "")}" data-level="${s.escalationLevel}">${icons.whatsapp}</button>` : ""}
          ${s.escalationLevel === 1 || s.escalationLevel === 2 ? (s.parentPhone ? `<a class="btn btn-outline btn-sm" href="tel:${escapeHTML(s.parentPhone)}" title="اتصال بولي الأمر" style="text-decoration:none;">${icons.phone}</a>` : "") : ""}
          ${s.escalationLevel === 2 ? `<button type="button" class="btn btn-warning btn-sm escCallBtn" data-id="${s.id}" data-name="${escapeHTML(s.name)}">✓ تم الاتصال</button>` : ""}
          ${s.escalationLevel === 3 && canPerformAction(getSession(), "teacher-insights", "escalation_override") ? `<button type="button" class="btn btn-danger btn-sm escOverrideBtn" data-id="${s.id}" data-name="${escapeHTML(s.name)}">فتح القفل</button>` : ""}
          <a class="btn btn-outline btn-sm" href="student.html?id=${s.id}">${icons.arrowLeft}</a>
        </div>
      </div>
    `;
  }).join("");

  listEl.querySelectorAll(".escWaBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const phone = btn.dataset.phone;
      const name = btn.dataset.name;
      const level = parseInt(btn.dataset.level);
      if (!phone) { toast("لا يوجد هاتف لولى الأمر", "warning"); return; }
      const msg = buildEscalationMessage({ name }, level);
      if (msg) openWhatsApp(phone, msg);
    });
  });

  listEl.querySelectorAll(".escCallBtn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const studentId = btn.dataset.id;
      const name = btn.dataset.name;
      const ok = await confirmDialog({
        title: `تأكيد اتصال هاتفي`,
        body: `تم الاتصال بولي أمر الطالب <strong>${name}</strong>؟`,
        confirmText: "نعم، تم الاتصال",
        tone: "warning",
      });
      if (!ok) return;
      logPhoneCall(studentId, session?.username || "المستخدم");
      toast(`تم تسجيل الاتصال بنجاح`, "success");
      render();
    });
  });

  listEl.querySelectorAll(".escOverrideBtn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const studentId = btn.dataset.id;
      const name = btn.dataset.name;
      const note = await prompt(`فتح القفل — ${name}\nملاحظة (اختياري):`);
      if (note === null) return;
      overrideEscalation(studentId, session?.username || "المستخدم", note || "فتح استثنائي");
      toast(`تم فتح القفل على ${name}`, "success");
      render();
    });
  });
}

/* ── المنقطعون (داخل المتابعة) ── */
function renderFollowupDisengaged(inner, students, attendance, statuses, groups, exams) {
  function renderInner() {
    const data = calcDisengaged(students, attendance, statuses, groups, exams, {
      gradeId: disengagedGradeFilter,
      mode: disengagedMode,
    });

    inner.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
        <button type="button" class="btn btn-danger btn-sm" id="bulkDisengagedAlert" ${data.length ? "" : "disabled"}>${icons.whatsapp} إرسال إنذار جماعي</button>
        <span class="badge badge-warning">${data.length} طالب</span>
        <select id="disGradeFilter" class="select" style="max-width:180px;">
          <option value="all">كل السنوات الدراسية</option>
          ${getGrades().map((g) => `<option value="${g.id}" ${disengagedGradeFilter === g.id ? "selected" : ""}>${escapeHTML(g.name)}</option>`).join("")}
        </select>
        <select id="disDaysFilter" class="select" style="max-width:200px;">
          <option value="2" ${disengagedMode === "2" ? "selected" : ""}>يومان متتاليان</option>
          <option value="more2" ${disengagedMode === "more2" ? "selected" : ""}>أكثر من يومان</option>
          <option value="exam" ${disengagedMode === "exam" ? "selected" : ""}>غياب أيام الامتحانات</option>
        </select>
      </div>
      <div id="disengagedList"></div>
    `;

    const list = document.getElementById("disengagedList");
    if (!data.length) {
      list.innerHTML = `<div class="text-muted" style="padding:20px; text-align:center;">لا يوجد طلاب منقطعين</div>`;
    } else {
      list.innerHTML = data.map((item) => {
        const s = item.student;
        const meta = item.examAbsent
          ? `${escapeHTML(item.group?.name || "")} · غائب عن امتحان`
          : `${escapeHTML(item.group?.name || "")} · آخر حضور: ${formatDateAr(item.lastDates[0])}`;
        const badge = item.examAbsent
          ? `<span class="badge badge-secondary">غياب امتحان</span>`
          : `<span class="badge badge-danger">${item.consecutiveAbsences} غياب</span>`;
        return `
        <div class="ti-student-row ti-student-row--warning">
          <div class="ti-student-row__avatar">${escapeHTML(s.code || "?")}</div>
          <div class="ti-student-row__info">
            <div class="ti-student-row__name">${escapeHTML(s.name)}</div>
            <div class="ti-student-row__meta">${meta}</div>
          </div>
          ${badge}
          <div class="ti-student-row__actions">
            <button type="button" class="btn btn-outline btn-sm ti-wa-btn" data-phone="${escapeHTML(s.parentPhone || s.phone || "")}" data-name="${escapeHTML(s.name)}">${icons.whatsapp}</button>
            ${(s.parentPhone || s.phone) ? `<a class="btn btn-outline btn-sm" href="tel:${escapeHTML(s.parentPhone || s.phone || "")}" title="اتصال بولي الأمر" style="text-decoration:none;">${icons.phone}</a>` : ""}
            <a class="btn btn-outline btn-sm" href="student.html?id=${s.id}">${icons.arrowLeft}</a>
          </div>
        </div>`;
      }).join("");
    }
    bindWhatsAppButtons(list);
  }

  renderInner();

  document.getElementById("bulkDisengagedAlert")?.addEventListener("click", () => {
    const currentData = calcDisengaged(students, attendance, statuses, groups, exams, {
      gradeId: disengagedGradeFilter,
      mode: disengagedMode,
    });
    sendBulkDisengagedAlert(currentData);
  });
  document.getElementById("disGradeFilter")?.addEventListener("change", (e) => { disengagedGradeFilter = e.target.value; renderInner(); });
  document.getElementById("disDaysFilter")?.addEventListener("change", (e) => { disengagedMode = e.target.value; renderInner(); });
}

/* ── المشاغلون (داخل المتابعة) ── */
function renderFollowupTroublemakers(inner, students, attendance, statuses, groups) {
  const data = calcTroublemakers(students, attendance, statuses, groups);

  inner.innerHTML = `
    <div class="field__hint" style="margin-bottom:12px;">الطلاب الذين سُجّلت لهم إجراءات استثنائية سلبية (استدعاء ولي أمر، طرد، أو غيرها) في آخر 30 يوم</div>
    <div id="troublemakersList"></div>
  `;

  const list = document.getElementById("troublemakersList");
  if (!data.length) {
    list.innerHTML = `<div class="text-muted" style="padding:20px; text-align:center;">لا يوجد مشاغلون حالياً</div>`;
    return;
  }

  list.innerHTML = data.map((item) => {
    const s = item.student;
    const lastAction = item.actions[item.actions.length - 1];
    return `
    <div class="ti-student-row ti-student-row--danger">
      <div class="ti-student-row__avatar">${escapeHTML(s.code || "?")}</div>
      <div class="ti-student-row__info">
        <div class="ti-student-row__name">${escapeHTML(s.name)}</div>
        <div class="ti-student-row__meta">${escapeHTML(item.group?.name || "")} · آخر إجراء: ${lastAction?.statusName || ""} (${formatDateAr(item.lastDate)})</div>
      </div>
      <div style="text-align:center; margin:0 8px;">
        <div style="font-size:11px; color:var(--muted);">الإجراءات</div>
        <div style="font-size:18px; font-weight:800; color:var(--danger);">${item.count}</div>
      </div>
      <div class="ti-student-row__actions">
        <button type="button" class="btn btn-outline btn-sm ti-wa-btn" data-phone="${escapeHTML(s.parentPhone || s.phone || "")}" data-name="${escapeHTML(s.name)}">${icons.whatsapp}</button>
        ${(s.parentPhone || s.phone) ? `<a class="btn btn-outline btn-sm" href="tel:${escapeHTML(s.parentPhone || s.phone || "")}" title="اتصال بولي الأمر" style="text-decoration:none;">${icons.phone}</a>` : ""}
        <a class="btn btn-outline btn-sm" href="student.html?id=${s.id}">${icons.arrowLeft}</a>
      </div>
    </div>`;
  }).join("");
  bindWhatsAppButtons(list);
}

/* ── يتأخرون / الرادار الأكاديمي (داخل المتابعة) ── */
function renderFollowupDeclining(inner, students, groups, exams) {
  const atRisk = calcAtRiskStudents(students, groups);
  const weakest = calcWeakestExam(exams, groups);

  inner.innerHTML = `
    ${weakest ? `
    <div class="card card-pad" style="margin-bottom:14px; border:1px solid var(--border);">
      <div class="card__head">
        <div class="card__title" style="color:var(--danger);">🎯 أضعف امتحان</div>
      </div>
      <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap; padding:8px 0;">
        <div style="flex:1; min-width:200px;">
          <div style="font-weight:700; font-size:15px; margin-bottom:4px;">${escapeHTML(weakest.exam.title)}</div>
          <div style="font-size:13px; color:var(--muted);">${escapeHTML(weakest.group?.name || "")} · ${formatDateAr(weakest.exam.date)}</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:12px; color:var(--muted);">المتوسط العام</div>
          <div style="font-size:28px; font-weight:800; color:var(--danger);">${weakest.avgPct}%</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:12px; color:var(--muted);">عدد الممتحنين</div>
          <div style="font-size:20px; font-weight:700;">${weakest.gradedStudents} / ${weakest.totalStudents}</div>
        </div>
      </div>
      <div class="field__hint" style="margin-top:8px;">هذا الامتحان حقق أقل متوسط درجات على مستوى السنتر — قد يكون المنهج فيه صعب ويحتاج حصة مراجعة</div>
    </div>
    ` : ""}

    <div class="field__hint" style="margin-bottom:10px;">طلاب انخفضت درجاتهم بشكل ملحوظ (15% أو أكثر) بين امتحانين — يحتاجون تدخل فوري</div>
    <div id="atRiskList"></div>
  `;

  const list = document.getElementById("atRiskList");
  if (!atRisk.length) {
    list.innerHTML = `<div class="text-muted" style="padding:20px; text-align:center;">لا يوجد طلاب يتأخرون حالياً</div>`;
    return;
  }

  list.innerHTML = atRisk.map((item) => {
    const s = item.student;
    const wp = item.worstPair;
    return `
    <div class="ti-student-row ti-student-row--warning">
      <div class="ti-student-row__avatar">${escapeHTML(s.code || "?")}</div>
      <div class="ti-student-row__info">
        <div class="ti-student-row__name">${escapeHTML(s.name)}</div>
        <div class="ti-student-row__meta">${escapeHTML(item.group?.name || "")} · ${item.totalExams} امتحانات</div>
      </div>
      ${wp ? `
        <div style="text-align:center; margin:0 8px;">
          <div style="font-size:11px; color:var(--muted);">${escapeHTML(wp.prev.title)}</div>
          <div style="font-weight:800; font-size:15px; color:var(--success);">${wp.prev.pct}%</div>
        </div>
        <span style="color:var(--danger); font-weight:700; font-size:18px;">→</span>
        <div style="text-align:center; margin:0 8px;">
          <div style="font-size:11px; color:var(--muted);">${escapeHTML(wp.curr.title)}</div>
          <div style="font-weight:800; font-size:15px; color:var(--danger);">${wp.curr.pct}%</div>
        </div>
        <span class="badge badge-danger" style="margin:0 8px;">- ${item.maxDrop}%</span>
      ` : `
        <div style="text-align:center; margin:0 8px;">
          <div style="font-size:11px; color:var(--muted);">المتوسط السابق</div>
          <div style="font-weight:800; font-size:15px;">${item.avgPrev}%</div>
        </div>
        <div style="text-align:center; margin:0 8px;">
          <div style="font-size:11px; color:var(--muted);">آخر درجة</div>
          <div style="font-weight:800; font-size:15px; color:var(--danger);">${item.lastExam.pct}%</div>
        </div>
        <span class="badge badge-danger" style="margin:0 8px;">- ${item.overallDrop}%</span>
      `}
      <div class="ti-student-row__actions">
        <button type="button" class="btn btn-outline btn-sm ti-wa-btn" data-phone="${escapeHTML(s.parentPhone || s.phone || "")}" data-name="${escapeHTML(s.name)}">${icons.whatsapp}</button>
        ${(s.parentPhone || s.phone) ? `<a class="btn btn-outline btn-sm" href="tel:${escapeHTML(s.parentPhone || s.phone || "")}" title="اتصال بولي الأمر" style="text-decoration:none;">${icons.phone}</a>` : ""}
        <a class="btn btn-outline btn-sm" href="student.html?id=${s.id}">${icons.arrowLeft}</a>
      </div>
    </div>`;
  }).join("");
  bindWhatsAppButtons(list);
}

/* ── المنقطعون ── */
async function sendBulkDisengagedAlert(data) {
  const notifications = data
    .filter((item) => item.student.parentPhone || item.student.phone)
    .map((item) => {
      const s = item.student;
      const phone = s.parentPhone || s.phone;
      const groupName = item.group?.name || "";
      const reason = item.examAbsent
        ? "غياب عن امتحان"
        : `${item.consecutiveAbsences} حصص متتالية غياب`;
      const message = renderTemplate("gen_disengaged_alert", {
        studentName: s.name,
        groupName,
        reason,
        centerName: getCenterName(),
      });
      return { phone, message, studentName: s.name };
    });

  if (!notifications.length) {
    toast("لا أرقام هواتف متاحة لدى الطلاب المنقطعين", "warning");
    return;
  }

  const first = notifications[0];
  openWhatsApp(first.phone, first.message);

  if (notifications.length === 1) {
    toast(`تم فتح واتساب لإرسال إنذار لـ ${first.studentName}`, "success");
    return;
  }

  const ok = await confirmDialog({
    title: `إرسال ${notifications.length} إنذار عبر واتساب`,
    body: `تم فتح أول رسالة (${first.studentName}).<br>هل تريد فتح باقى الرسائل تباعاً (كل ثانية)؟<br><br><span style="font-size:12px; color:var(--muted);">سيتم فتح ${notifications.length - 1} رسالة إضافية. تأكد من أن واتساب مفتوح.</span>`,
    confirmText: `فتح باقى الرسائل (${notifications.length - 1})`,
    tone: "danger",
  });
  if (!ok) return;

  let idx = 1;
  const interval = setInterval(() => {
    if (idx >= notifications.length) {
      clearInterval(interval);
      toast(`تم فتح جميع الإنذارات (${notifications.length} طالب)`, "success");
      return;
    }
    const n = notifications[idx];
    openWhatsApp(n.phone, n.message);
    idx++;
  }, 1000);
}

/* ── أداء المجموعات ── */
function renderGroupsSection(box) {
  const allStudents = getStudents();
  const students = allStudents.filter((s) => s.status === "active");
  const pausedStudents = allStudents.filter((s) => s.status === "paused");
  const groups = getGroups();
  const grades = getGrades();
  const attendance = getAttendance();
  const statuses = getStudentStatuses();
  const data = calcGroupPerformance(students, attendance, statuses, groups, grades);
  const centerHealth = calcCenterHealth(students, attendance, statuses, groups);

  const gradeGroups = {};
  data.forEach((g) => {
    if (!gradeGroups[g.grade]) gradeGroups[g.grade] = [];
    gradeGroups[g.grade].push(g);
  });

  const now = new Date();
  const monthNames = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const currentMonth = monthNames[now.getMonth()];
  const growthColor = centerHealth.growthTrend > 0 ? "var(--success)" : centerHealth.growthTrend < 0 ? "var(--danger)" : "var(--muted)";
  const growthIcon = centerHealth.growthTrend > 0 ? "📈" : centerHealth.growthTrend < 0 ? "📉" : "➡️";
  const growthText = centerHealth.growthTrend > 0 ? `+${centerHealth.growthTrend} عن الشهر الماضى` : centerHealth.growthTrend < 0 ? `${centerHealth.growthTrend} عن الشهر الماضى` : "مثل الشهر الماضى";

  box.innerHTML = `
    <div class="card card-pad" style="margin-bottom:16px;">
      <div class="card__head">
        <div class="card__title" style="color:var(--primary);">📊 صحة السنتر — ${escapeHTML(currentMonth)} ${now.getFullYear()}</div>
      </div>
      <div class="ti-health-grid">
        <div class="ti-health-card ti-health-card--primary">
          <div class="ti-health-card__icon">${icons.users}</div>
          <div class="ti-health-card__value">${centerHealth.totalActive}</div>
          <div class="ti-health-card__label">طالب نشط</div>
        </div>
        <div class="ti-health-card ti-health-card--success">
          <div class="ti-health-card__icon">${icons.plus}</div>
          <div class="ti-health-card__value">${centerHealth.newThisMonth}</div>
          <div class="ti-health-card__label">تسجيل جديد هذا الشهر</div>
          <div class="ti-health-card__sub" style="color:${growthColor}">${growthIcon} ${growthText}</div>
        </div>
        <div class="ti-health-card ti-health-card--danger">
          <div class="ti-health-card__icon">${icons.alert}</div>
          <div class="ti-health-card__value">${centerHealth.totalPaused}</div>
          <div class="ti-health-card__label">طالب متوقف</div>
          <div class="ti-health-card__sub">${centerHealth.pausedThisMonth} توقف هذا الشهر</div>
        </div>
        <div class="ti-health-card ti-health-card--warning">
          <div class="ti-health-card__icon">${icons.chart}</div>
          <div class="ti-health-card__value">${centerHealth.churnRate}%</div>
          <div class="ti-health-card__label">معدل التسرب</div>
        </div>
        <div class="ti-health-card ti-health-card--success">
          <div class="ti-health-card__icon">${icons.check}</div>
          <div class="ti-health-card__value">${centerHealth.attendanceRate}%</div>
          <div class="ti-health-card__label">نسبة الحضور (30 يوم)</div>
          <div class="ti-health-card__bar"><div class="ti-health-card__bar-fill" style="width:${centerHealth.attendanceRate}%; background:var(--success);"></div></div>
        </div>
        <div class="ti-health-card ti-health-card--primary">
          <div class="ti-health-card__icon">${icons.wallet}</div>
          <div class="ti-health-card__value">${centerHealth.paymentRate}%</div>
          <div class="ti-health-card__label">نسبة الدفع</div>
          <div class="ti-health-card__bar"><div class="ti-health-card__bar-fill" style="width:${centerHealth.paymentRate}%; background:var(--primary);"></div></div>
        </div>
        <div class="ti-health-card ti-health-card--danger">
          <div class="ti-health-card__icon">${icons.money}</div>
          <div class="ti-health-card__value">${formatMoney(centerHealth.totalLateBalance)}</div>
          <div class="ti-health-card__label">إجمالى المتأخرات</div>
        </div>
      </div>
    </div>

    <div class="card card-pad">
      <div class="card__head">
        <div class="card__title" style="color:var(--primary);">📊 أداء المجموعات (آخر 30 يوم)</div>
      </div>
      <div class="field__hint" style="margin-bottom:12px;">مقارنة أداء كل مجموعة — نسبة الحضور ونسبة التحصيل</div>
      <div id="groupsList"></div>
    </div>
  `;

  const list = document.getElementById("groupsList");
  if (!Object.keys(gradeGroups).length) {
    list.innerHTML = `<div class="text-muted" style="padding:20px; text-align:center;">لا توجد بيانات كافية</div>`;
    return;
  }

  list.innerHTML = Object.entries(gradeGroups).map(([gradeName, gData]) => {
    return `
    <div style="margin-bottom:20px;">
      <div class="ti-group-header">
        <span class="ti-group-header__name">📊 ${escapeHTML(gradeName)}</span>
        <span class="ti-group-header__count">${gData.length} مجموعة</span>
      </div>
      ${gData.map((g) => {
        const attColor = g.avgAttendance >= 70 ? "var(--success)" : g.avgAttendance >= 40 ? "var(--warning)" : "var(--danger)";
        const payColor = g.paymentRate >= 80 ? "var(--success)" : g.paymentRate >= 50 ? "var(--warning)" : "var(--danger)";
        return `
        <div class="ti-group-card">
          <div class="ti-group-card__header">
            <div class="ti-group-card__name">${escapeHTML(g.group.name)}</div>
            <div class="ti-group-card__meta">${g.enrolled} طالب</div>
          </div>
          <div class="ti-group-card__bars">
            <div class="ti-group-card__bar-item">
              <div class="ti-group-card__bar-label">
                <span>الحضور</span>
                <span style="font-weight:700; color:${attColor};">${g.avgAttendance}%</span>
              </div>
              <div class="ti-group-card__bar">
                <div class="ti-group-card__bar-fill" style="width:${g.avgAttendance}%; background:${attColor};"></div>
              </div>
            </div>
            <div class="ti-group-card__bar-item">
              <div class="ti-group-card__bar-label">
                <span>التحصيل</span>
                <span style="font-weight:700; color:${payColor};">${g.paymentRate}%</span>
              </div>
              <div class="ti-group-card__bar">
                <div class="ti-group-card__bar-fill" style="width:${g.paymentRate}%; background:${payColor};"></div>
              </div>
            </div>
          </div>
          <div class="ti-group-card__summary">
            <span style="color:var(--success);">✓ ${g.paidCount} مدفوع</span>
            <span style="color:var(--danger);">✗ ${g.unpaidCount} غير مدفوع</span>
            <a class="btn btn-outline btn-sm" href="attendance-tracker.html?groupId=${g.group.id}&mode=group" style="margin-right:auto;">${icons.clipboard} تفاصيل الحضور</a>
            <button class="btn btn-outline btn-sm ti-exam-detail-btn" data-group-id="${g.group.id}">${icons.chart} تفاصيل الامتحانات</button>
          </div>
        </div>`;
      }).join("")}
    </div>`;
  }).join("");

  list.querySelectorAll(".ti-exam-detail-btn").forEach((btn) => {
    btn.addEventListener("click", () => renderExamDetailsPage(btn.dataset.groupId));
  });
}

/* ── تفاصيل الامتحانات (صفحة كاملة داخل #sectionContent) ── */
function renderExamDetailsPage(groupId) {
  const box = document.getElementById("sectionContent");
  const groups = getGroups();
  const students = getStudents().filter((s) => s.groupId === groupId && s.status === "active");
  const exams = getExams()
    .filter((e) => e.groupId === groupId)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  const group = groups.find((g) => g.id === groupId);

  if (!exams.length) {
    box.innerHTML = `
      <div class="card card-pad">
        <div class="flex-between" style="margin-bottom:16px;">
          <div class="card__title" style="color:var(--primary);">${icons.chart} نتائج الامتحانات — ${escapeHTML(group?.name || "")}</div>
          <button class="btn btn-outline btn-sm ti-exam-back-btn">${icons.arrowLeft} العودة</button>
        </div>
        <div class="ti-empty">لا توجد امتحانات لهذه المجموعة</div>
      </div>`;
    box.querySelector(".ti-exam-back-btn").addEventListener("click", () => { activeSection = "groups"; render(); });
    return;
  }

  const examsHeader = exams.map((e) => `<th class="ti-exam-th">${escapeHTML(e.title)}<br><span class="ti-exam-max">الدرجة: ${e.maxScore}</span></th>`).join("");

  const rows = students.map((s) => {
    const cells = exams.map((e) => {
      const result = e.results.find((r) => r.studentId === s.id);
      if (!result || result.absent) {
        return `<td class="ti-exam-cell ti-exam-cell--absent">غائب</td>`;
      }
      const pct = e.maxScore ? (result.score / e.maxScore) * 100 : 0;
      const cls = pct < 70 ? "ti-exam-cell ti-exam-cell--fail" : "ti-exam-cell";
      return `<td class="${cls}">${result.score}</td>`;
    }).join("");
    return `
      <tr>
        <td class="ti-exam-student-code">${escapeHTML(s.code || "—")}</td>
        <td class="ti-exam-student-name">${escapeHTML(s.name)}</td>
        ${cells}
      </tr>`;
  }).join("");

  const avgPerExam = exams.map((e) => {
    const scored = e.results.filter((r) => !r.absent);
    const avg = scored.length ? scored.reduce((s, r) => s + r.score, 0) / scored.length : 0;
    const pct = e.maxScore ? (avg / e.maxScore) * 100 : 0;
    return { title: e.title, avg: avg.toFixed(1), pct: pct.toFixed(0), maxScore: e.maxScore, absentCount: e.results.filter((r) => r.absent).length };
  });

  box.innerHTML = `
    <div class="card card-pad" style="margin-bottom:16px;">
      <div class="flex-between" style="flex-wrap:wrap; gap:10px; margin-bottom:16px;">
        <div>
          <div class="card__title" style="color:var(--primary);">${icons.chart} نتائج الامتحانات — ${escapeHTML(group?.name || "")}</div>
          <div class="field__hint" style="margin-top:4px;">${students.length} طالب · ${exams.length} امتحان</div>
        </div>
        <button class="btn btn-outline btn-sm ti-exam-back-btn">${icons.arrowLeft} العودة</button>
      </div>

      <div class="ti-exam-summary-bar" style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:18px;">
        ${avgPerExam.map((e) => `
          <div class="ti-exam-summary-card">
            <div class="ti-exam-summary-card__title">${escapeHTML(e.title)}</div>
            <div class="ti-exam-summary-card__value" style="color:${e.pct >= 70 ? "var(--success)" : "var(--danger)"};">${e.avg} / ${e.maxScore}</div>
            <div class="ti-exam-summary-card__sub">${e.pct}% — ${e.absentCount ? e.absentCount + " غائب" : "الجميع حاضر"}</div>
          </div>
        `).join("")}
      </div>

      <div class="ch-charts-row" style="display:flex; gap:14px; flex-wrap:wrap; margin-bottom:14px;">
        ${exams.map((e) => {
          const scored = e.results.filter((r) => !r.absent && r.score != null).map((r) => r.score);
          return renderBellCurve(scored, e.maxScore, { title: `المنحنى الجرسي — ${e.title}` });
        }).join("")}
      </div>

      <div class="ch-charts-row" style="display:flex; gap:14px; flex-wrap:wrap; margin-bottom:14px;">
        ${exams.map((e) => renderDistributionBar(e, students, { title: `توزيع الدرجات — ${e.title}` })).join("")}
      </div>

      <div style="overflow-x:auto;">
        <table class="ti-exam-table">
          <thead>
            <tr>
              <th class="ti-exam-th ti-exam-th--fixed">كود الطالب</th>
              <th class="ti-exam-th ti-exam-th--fixed">اسم الطالب</th>
              ${examsHeader}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;

  box.querySelector(".ti-exam-back-btn").addEventListener("click", () => { activeSection = "groups"; render(); });
}

/* ═══════════════════════════════════════════════════════════
   مساعدين
   ═══════════════════════════════════════════════════════════ */

function bindWhatsAppButtons(container) {
  container.querySelectorAll(".ti-wa-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const phone = btn.dataset.phone;
      const name = btn.dataset.name;
      if (!phone) { toast("لا يوجد رقم هاتف لهذا الطالب", "warning"); return; }
      try {
        openWhatsApp(phone, renderTemplate("gen_teacher_contact", { studentName: name, centerName: getCenterName() }));
      } catch (e) { /* popup blocker */ }
    });
  });
}

/* ═══════════════════════════════════════════════════════════
   CSS
   ═══════════════════════════════════════════════════════════ */

/* ── صحة الطلاب ── */
function renderStudentHealthSection(box) {
  const all = computeAllHealthScores();
  const groups = getGroups();
  const grades = getGrades();
  const gradeList = grades.sort((a, b) => a.order - b.order);

  const danger = all.filter((s) => s.health.total < 40);
  const warning = all.filter((s) => s.health.total >= 40 && s.health.total < 60);
  const healthy = all.filter((s) => s.health.total >= 60);
  const topStars = all.filter((s) => s.health.total >= 80);

  let filterGradeId = "all";
  let filterGroupId = "all";
  let filterColor = "all";

  function getFiltered() {
    let list = all;
    if (filterGradeId !== "all") {
      const gIds = groups.filter((g) => g.gradeId === filterGradeId).map((g) => g.id);
      list = list.filter((s) => gIds.includes(s.groupId));
    }
    if (filterGroupId !== "all") {
      list = list.filter((s) => s.groupId === filterGroupId);
    }
    if (filterColor === "danger") list = list.filter((s) => s.health.total < 40);
    else if (filterColor === "warning") list = list.filter((s) => s.health.total >= 40 && s.health.total < 60);
    else if (filterColor === "success") list = list.filter((s) => s.health.total >= 60);
    else if (filterColor === "top") list = list.filter((s) => s.health.total >= 80);
    return list.sort((a, b) => b.health.total - a.health.total);
  }

  function renderList() {
    const filtered = getFiltered();
    const listEl = box.querySelector("#shList");
    if (!listEl) return;

    if (!filtered.length) {
      listEl.innerHTML = `<div style="padding:32px; text-align:center; color:var(--muted);">لا يوجد طلاب يطابقون الفلتر</div>`;
      return;
    }

    listEl.innerHTML = filtered.map((s) => {
      const h = s.health;
      const group = findGroup(groups, s.groupId);
      const grade = gradeName(grades, group?.gradeId);
      const color = getHealthColor(h.total);
      const reasons = [];
      if (h.attendanceRate < 60) reasons.push(`حضور ${h.attendanceRate}%`);
      if (h.hasExams && h.examAvg < 50) reasons.push(`درجات ${h.examAvg}%`);
      if (h.recentActions > 0) reasons.push(`${h.recentActions} إجراء سلوكي`);

      const badges = [];
      if (h.total >= 90) badges.push(`<span class="badge badge-success" style="font-size:10px;">ممتاز</span>`);
      if (h.total >= 80 && h.total < 90) badges.push(`<span class="badge badge-info" style="font-size:10px;">جيد جداً</span>`);
      if (h.behaviorScore >= 18) badges.push(`<span class="badge badge-info" style="font-size:10px;">سجل نظيف</span>`);

      return `
        <a href="student.html?id=${s.id}" class="ti-student-row ti-student-row--${color}" style="text-decoration:none;">
          <div style="flex-shrink:0;">${healthScoreHTML(h.total, 40)}</div>
          <div class="ti-student-row__info">
            <div class="ti-student-row__name">${escapeHTML(s.name)}</div>
            <div class="ti-student-row__meta">${grade} · ${group?.name || ""}</div>
            ${badges.length ? `<div style="display:flex; gap:4px; flex-wrap:wrap; margin-top:2px;">${badges.join("")}</div>` : ""}
          </div>
          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:3px; flex-shrink:0;">
            ${reasons.length ? `<div style="font-size:11px; color:var(--danger);">${reasons.join(" · ")}</div>` : ""}
            <div style="width:80px;">${healthBarHTML(h.total, 5)}</div>
            <div style="font-size:11px; color:var(--muted);">حضور ${h.attendanceRate}%${h.hasExams ? ` · درجات ${h.examAvg}%` : ""} · سلوكي ${h.behaviorScore}/20</div>
          </div>
        </a>
      `;
    }).join("");
  }

  box.innerHTML = `
    <div class="card card-pad" style="border:2px solid var(--danger); border-right:6px solid var(--danger);">
      <div class="card__head">
        <div class="card__title" style="color:var(--danger);">${icons.radar} صحة الطلاب — المؤشر الأكاديمي</div>
      </div>
      <p style="font-size:12px; color:var(--muted); margin-bottom:14px; line-height:1.7;">
        كل طالب يحصل على درجة من 100 بناءً على: <strong>الحضور (40%)</strong> + <strong>الدرجات (40%)</strong> + <strong>السلوك (20%)</strong>.
        الطلاب في منطقة الخطر (أقل من 40) معرضون لترك السنتر.
      </p>

      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px;">
        <div style="display:flex; align-items:center; gap:6px; font-size:13px; padding:6px 12px; border-radius:var(--r-md); background:color-mix(in srgb, var(--danger) 8%, transparent); border:1px solid color-mix(in srgb, var(--danger) 20%, transparent);">
          <span style="width:8px; height:8px; border-radius:50%; background:var(--danger);"></span>
          <strong style="color:var(--danger);">${danger.length}</strong>
          <span class="text-muted">في الخطر</span>
        </div>
        <div style="display:flex; align-items:center; gap:6px; font-size:13px; padding:6px 12px; border-radius:var(--r-md); background:color-mix(in srgb, var(--warning) 8%, transparent); border:1px solid color-mix(in srgb, var(--warning) 20%, transparent);">
          <span style="width:8px; height:8px; border-radius:50%; background:var(--warning);"></span>
          <strong style="color:var(--warning);">${warning.length}</strong>
          <span class="text-muted">محتاج متابعة</span>
        </div>
        <div style="display:flex; align-items:center; gap:6px; font-size:13px; padding:6px 12px; border-radius:var(--r-md); background:color-mix(in srgb, var(--success) 8%, transparent); border:1px solid color-mix(in srgb, var(--success) 20%, transparent);">
          <span style="width:8px; height:8px; border-radius:50%; background:var(--success);"></span>
          <strong style="color:var(--success);">${healthy.length}</strong>
          <span class="text-muted">صحي</span>
        </div>
        <div style="display:flex; align-items:center; gap:6px; font-size:13px; padding:6px 12px; border-radius:var(--r-md); background:color-mix(in srgb, var(--success) 8%, transparent); border:1px solid color-mix(in srgb, var(--success) 20%, transparent);">
          <span style="width:8px; height:8px; border-radius:50%; background:var(--success);"></span>
          <strong style="color:var(--success);">🏆 ${topStars.length}</strong>
          <span class="text-muted">متفوقون</span>
        </div>
      </div>

      <div class="ti-filters">
        <select class="select" id="shGradeFilter" style="max-width:160px;">
          <option value="all">كل المراحل</option>
          ${gradeList.map((g) => `<option value="${g.id}">${escapeHTML(g.name)}</option>`).join("")}
        </select>
        <select class="select" id="shGroupFilter" style="max-width:160px;">
          <option value="all">كل المجموعات</option>
        </select>
        <select class="select" id="shColorFilter" style="max-width:160px;">
          <option value="all">كل الطلاب</option>
          <option value="top">🏆 المتفوقون (80+)</option>
          <option value="success">🟢 صحي (60+)</option>
          <option value="warning">🟡 محتاج متابعة</option>
          <option value="danger">🔴 في الخطر</option>
        </select>
      </div>

      <div id="shList"></div>
    </div>
  `;

  const gradeSelect = box.querySelector("#shGradeFilter");
  const groupSelect = box.querySelector("#shGroupFilter");
  const colorSelect = box.querySelector("#shColorFilter");

  gradeSelect.addEventListener("change", () => {
    filterGradeId = gradeSelect.value;
    filterGroupId = "all";
    const gradeGroups = filterGradeId === "all" ? groups : groups.filter((g) => g.gradeId === filterGradeId);
    groupSelect.innerHTML = `<option value="all">كل المجموعات</option>` + gradeGroups.map((g) => `<option value="${g.id}">${escapeHTML(g.name)}</option>`).join("");
    renderList();
  });

  groupSelect.addEventListener("change", () => {
    filterGroupId = groupSelect.value;
    renderList();
  });

  colorSelect.addEventListener("change", () => {
    filterColor = colorSelect.value;
    renderList();
  });

  renderList();
}

/* ── إنجازات الطلاب ── */
function renderAchievementsSection(box) {
  const allAchievements = getAchievements().sort((a, b) => (a.date < b.date ? 1 : -1));
  const unsent = allAchievements.filter((a) => !a.sent);
  const sent = allAchievements.filter((a) => a.sent);
  const students = getStudents();
  const groups = getGroups();
  const grades = getGrades();
  const session = getSession();

  function renderList(filter) {
    const list = filter === "unsent" ? unsent : sent;
    const listEl = box.querySelector("#achList");
    if (!listEl) return;

    if (!list.length) {
      listEl.innerHTML = `<div style="padding:32px; text-align:center; color:var(--muted);">
        ${filter === "unsent" ? "لا يوجد إنجازات جديدة — الامتحانات هي اللي بتكتشف الإنجازات تلقائياً" : "لم يتم إرسال أي إنجازات بعد"}
      </div>`;
      return;
    }

    listEl.innerHTML = list.map((a) => {
      const student = students.find((s) => s.id === a.studentId);
      const meta = getTypeMeta(a.type);
      const group = findGroup(groups, a.groupId);
      const grade = gradeName(grades, group?.gradeId);
      const msg = generateMessage(a, session?.username || "المستمر");
      const shortMsg = msg.length > 100 ? msg.slice(0, 100) + "..." : msg;

      return `
        <div class="ti-student-row" style="border:1px solid var(--border); border-radius:var(--r-md); padding:14px; margin-bottom:10px; display:flex; flex-direction:column; gap:10px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:24px;">${meta.icon}</span>
            <div style="flex:1; min-width:0;">
              <div style="font-weight:700; font-size:14px;">${student ? escapeHTML(student.name) : a.studentId}</div>
              <div style="font-size:12px; color:var(--muted);">${grade} · ${group?.name || ""} · ${a.examTitle || ""}</div>
            </div>
            <div style="text-align:center;">
              <div style="font-weight:800; font-size:18px; color:var(--${meta.color});">${a.newPct}%</div>
              <div style="font-size:11px; color:var(--muted);">${a.oldAvg ? `كان ${a.oldAvg}%` : ""}</div>
            </div>
            <span class="badge badge-${meta.color}" style="font-size:11px;">${meta.label}</span>
          </div>
          <div style="background:var(--bg); border-radius:var(--r-sm); padding:10px; font-size:12px; line-height:1.7; color:var(--text); white-space:pre-wrap; max-height:80px; overflow-y:auto;">${shortMsg}</div>
          ${!a.sent ? `
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-success btn-sm ach-send-btn" data-id="${a.id}" data-student-id="${a.studentId}">
              ${icons.whatsapp} إرسال لولى الأمر
            </button>
            <button class="btn btn-outline btn-sm ach-preview-btn" data-id="${a.id}" data-student-id="${a.studentId}">
              معاينة الرسالة
            </button>
          </div>
          ` : `
          <div style="font-size:11px; color:var(--success); display:flex; align-items:center; gap:4px;">
            ${icons.check} تم الإرسال ${a.sentAt ? new Date(a.sentAt).toLocaleDateString("ar-EG") : ""}
          </div>
          `}
        </div>
      `;
    }).join("");

    /* أزرار الإرسال */
    listEl.querySelectorAll(".ach-send-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const achId = btn.dataset.id;
        const studentId = btn.dataset.studentId;
        const achievement = allAchievements.find((a) => a.id === achId);
        const student = students.find((s) => s.id === studentId);
        if (!achievement || !student) return;

        const message = generateMessage(achievement, session?.username || "المستمر");
        const phone = student.parentPhone;
        if (!phone) { toast("لا يوجد هاتف لولى الأمر", "warning"); return; }

        openWhatsApp(phone, message);
        markAchievementSent(achId);
        toast("تم الإرسال وتسجيل الإنجاز ✓", "success");
        render();
      });
    });

    listEl.querySelectorAll(".ach-preview-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const achId = btn.dataset.id;
        const achievement = allAchievements.find((a) => a.id === achId);
        if (!achievement) return;
        const message = generateMessage(achievement, session?.username || "المستمر");
        toast(message, "info", 8000);
      });
    });
  }

  let activeFilter = "unsent";

  box.innerHTML = `
    <div class="card card-pad">
      <div class="card__head">
        <div class="card__title" style="color:var(--success);">${icons.shield} إنجازات الطلاب — صائد التفوق</div>
      </div>
      <p style="font-size:12px; color:var(--muted); margin-bottom:14px; line-height:1.7;">
        النظام يكشف الإنجازات تلقائياً عند إدخال درجات الامتحانات. الإنجازات بتولد رسالة واتساب جاهزة لولى الأمر — كل اللي عليك تضغط "إرسال".
      </p>

      <div style="display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap;">
        <button class="btn btn-sm ${activeFilter === "unsent" ? "btn-primary" : "btn-outline"}" data-filter="unsent">📥 جديد (${unsent.length})</button>
        <button class="btn btn-sm ${activeFilter === "sent" ? "btn-primary" : "btn-outline"}" data-filter="sent">📤 مرسل (${sent.length})</button>
      </div>

      <div id="achList"></div>
    </div>
  `;

  box.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeFilter = btn.dataset.filter;
      box.querySelectorAll("[data-filter]").forEach((b) => {
        b.className = `btn btn-sm ${b.dataset.filter === activeFilter ? "btn-primary" : "btn-outline"}`;
      });
      renderList(activeFilter);
    });
  });

  renderList(activeFilter);
}

/* ═══════════════════════════════════════════════════════════
   Styles
   ═══════════════════════════════════════════════════════════ */

const style = document.createElement("style");
style.textContent = `
  .ti-actions {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
    margin-bottom: 20px;
  }
  .ti-action-btn {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 18px 20px;
    border-radius: 14px;
    border: 2px solid var(--border);
    background: var(--bg);
    cursor: pointer;
    font-family: inherit;
    text-align: right;
    transition: all .2s;
    box-shadow: 0 2px 8px rgba(0,0,0,.04);
  }
  .ti-action-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0,0,0,.08);
  }
  .ti-action-btn.is-active {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0,0,0,.12);
  }
  .ti-action-btn--danger { border-color: #fecaca; }
  .ti-action-btn--danger:hover, .ti-action-btn--danger.is-active { border-color: var(--danger); background: rgba(239,68,68,.06); }
  .ti-action-btn--warning { border-color: #fde68a; }
  .ti-action-btn--warning:hover, .ti-action-btn--warning.is-active { border-color: var(--warning); background: rgba(245,158,11,.06); }
  .ti-action-btn--success { border-color: #a7f3d0; }
  .ti-action-btn--success:hover, .ti-action-btn--success.is-active { border-color: var(--success); background: rgba(16,185,129,.06); }
  .ti-action-btn--primary { border-color: #c7d2fe; }
  .ti-action-btn--primary:hover, .ti-action-btn--primary.is-active { border-color: var(--primary); background: rgba(102,126,234,.06); }
  .ti-action-btn__icon {
    width: 44px; height: 44px;
    border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .ti-action-btn--danger .ti-action-btn__icon { background: rgba(239,68,68,.1); color: var(--danger); }
  .ti-action-btn--warning .ti-action-btn__icon { background: rgba(245,158,11,.1); color: var(--warning); }
  .ti-action-btn--success .ti-action-btn__icon { background: rgba(16,185,129,.1); color: var(--success); }
  .ti-action-btn--primary .ti-action-btn__icon { background: rgba(102,126,234,.1); color: var(--primary); }
  .ti-action-btn__icon svg { width: 22px; height: 22px; }
  .ti-action-btn__text { display: flex; flex-direction: column; gap: 2px; }
  .ti-action-btn__title { font-weight: 800; font-size: 14px; color: var(--text); }
  .ti-action-btn__count { font-size: 12px; font-weight: 600; color: var(--muted); }
  .ti-action-btn.is-active .ti-action-btn__title { color: inherit; }
  .ti-action-btn--danger.is-active .ti-action-btn__title { color: var(--danger); }
  .ti-action-btn--warning.is-active .ti-action-btn__title { color: var(--warning); }
  .ti-action-btn--success.is-active .ti-action-btn__title { color: var(--success); }
  .ti-action-btn--primary.is-active .ti-action-btn__title { color: var(--primary); }

  .ti-empty { text-align: center; padding: 40px; color: var(--muted); font-size: 14px; }
  .ti-filters { display: flex; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }

  .ti-student-row {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 0; border-bottom: 1px solid var(--border);
  }
  .ti-student-row:last-child { border-bottom: none; }
  .ti-student-row__avatar {
    width: 38px; height: 38px; border-radius: 50%;
    background: var(--bg-2); display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700; color: var(--text); flex-shrink: 0;
  }
  .ti-student-row--warning .ti-student-row__avatar { background: rgba(245,158,11,.1); color: var(--warning); }
  .ti-student-row--success .ti-student-row__avatar { background: rgba(16,185,129,.1); color: var(--success); }
  .ti-student-row--danger .ti-student-row__avatar { background: rgba(239,68,68,.1); color: var(--danger); }
  .ti-student-row__info { flex: 1; min-width: 0; }
  .ti-student-row__name { font-weight: 700; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ti-student-row__meta { font-size: 11px; color: var(--muted); }
  .ti-student-row__amount { font-weight: 800; font-size: 14px; color: var(--danger); white-space: nowrap; }
  .ti-student-row__rate { font-weight: 800; font-size: 15px; color: var(--success); white-space: nowrap; min-width: 50px; text-align: center; }
  .ti-student-row__medal { font-size: 18px; min-width: 28px; text-align: center; }
  .ti-student-row__actions { display: flex; gap: 6px; }

  .ti-group-header {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 0 8px; border-bottom: 2px solid var(--border); margin-bottom: 8px;
  }
  .ti-group-header__name { font-weight: 800; font-size: 15px; }
  .ti-group-header__grade { font-size: 12px; font-weight: 600; color: var(--muted); background: var(--bg-2); padding: 2px 8px; border-radius: 6px; }
  .ti-group-header__count { margin-right: auto; font-size: 12px; color: var(--muted); }

  .ti-group-card {
    background: var(--bg); border: 1px solid var(--border); border-radius: 12px;
    padding: 16px; margin-bottom: 10px;
  }
  .ti-group-card__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .ti-group-card__name { font-weight: 800; font-size: 14px; }
  .ti-group-card__meta { font-size: 12px; color: var(--muted); }
  .ti-group-card__bars { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
  .ti-group-card__bar-item {}
  .ti-group-card__bar-label { display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; margin-bottom: 4px; }
  .ti-group-card__bar { height: 8px; background: var(--bg-2); border-radius: 4px; overflow: hidden; }
  .ti-group-card__bar-fill { height: 100%; border-radius: 4px; transition: width .4s; }
  .ti-group-card__summary { display: flex; gap: 16px; font-size: 12px; font-weight: 600; }

  @media (max-width: 560px) {
    .ti-actions { grid-template-columns: 1fr 1fr; gap: 8px; }
    .ti-action-btn { padding: 12px; gap: 10px; }
    .ti-action-btn__icon { width: 36px; height: 36px; }
    .ti-action-btn__icon svg { width: 18px; height: 18px; }
    .ti-action-btn__title { font-size: 12px; }
    .ti-action-btn__count { font-size: 11px; }
    .ti-group-card__summary { flex-wrap: wrap; gap: 8px; }
    .ti-group-card__summary .btn { flex: 1; justify-content: center; }
  }
  @media (max-width: 380px) {
    .ti-actions { grid-template-columns: 1fr; }
  }

  .ti-health-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
    padding: 8px 0;
  }
  .ti-health-card {
    background: var(--bg-2, #f5f5f5);
    border-radius: 12px;
    padding: 16px;
    text-align: center;
    border: 1px solid var(--border);
    transition: transform .15s;
  }
  .ti-health-card:hover { transform: translateY(-2px); }
  .ti-health-card__icon { width: 40px; height: 40px; margin: 0 auto 8px; }
  .ti-health-card__icon svg { width: 100%; height: 100%; }
  .ti-health-card__value { font-size: 24px; font-weight: 800; line-height: 1.2; }
  .ti-health-card__label { font-size: 12px; color: var(--muted); margin-top: 2px; font-weight: 600; }
  .ti-health-card__sub { font-size: 11px; color: var(--muted); margin-top: 4px; }
  .ti-health-card__bar { height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; margin-top: 8px; }
  .ti-health-card__bar-fill { height: 100%; border-radius: 3px; transition: width .4s; }

  .ti-health-card--primary .ti-health-card__value { color: var(--primary); }
  .ti-health-card--success .ti-health-card__value { color: var(--success); }
  .ti-health-card--danger .ti-health-card__value { color: var(--danger); }
  .ti-health-card--warning .ti-health-card__value { color: var(--warning); }

  .ti-exam-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    direction: rtl;
    text-align: center;
  }
  .ti-exam-table th,
  .ti-exam-table td {
    border: 1px solid var(--border, #e5e7eb);
    padding: 8px 10px;
  }
  .ti-exam-th {
    background: var(--bg-2, #f5f5f5);
    font-weight: 700;
    font-size: 12px;
    white-space: nowrap;
  }
  .ti-exam-th--fixed {
    position: sticky;
    background: var(--bg-2, #f5f5f5);
    z-index: 1;
  }
  .ti-exam-max {
    font-weight: 500;
    font-size: 11px;
    color: var(--muted);
  }
  .ti-exam-student-code {
    font-weight: 700;
    font-size: 12px;
    color: var(--muted);
    background: var(--bg-2, #f5f5f5);
    white-space: nowrap;
  }
  .ti-exam-student-name {
    font-weight: 700;
    text-align: right;
    white-space: nowrap;
  }
  .ti-exam-cell {
    font-weight: 600;
    font-size: 13px;
  }
  .ti-exam-cell--fail {
    background: rgba(239, 68, 68, 0.12);
    color: var(--danger, #ef4444);
    font-weight: 800;
  }
  .ti-exam-cell--absent {
    color: var(--muted);
    font-style: italic;
  }
  .ti-exam-summary-bar {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }
  .ti-exam-summary-card {
    background: var(--bg-2, #f5f5f5);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px 16px;
    min-width: 140px;
    flex: 1;
    text-align: center;
  }
  .ti-exam-summary-card__title {
    font-size: 12px;
    font-weight: 700;
    color: var(--muted);
    margin-bottom: 4px;
  }
  .ti-exam-summary-card__value {
    font-size: 18px;
    font-weight: 800;
  }
  .ti-exam-summary-card__sub {
    font-size: 11px;
    color: var(--muted);
    margin-top: 2px;
  }
`;
document.head.appendChild(style);
