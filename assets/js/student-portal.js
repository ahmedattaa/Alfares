// ═══════════════════════════════════════════════════════════
// Student Command Center — مركز قيادة الطالب (Mini OS)
// واجهة الطالب الكاملة: مركز التعلم · المنهج · الامتحانات ·
// مركز الأخطاء · التقدم · التقويم · المحفوظات · الإشعارات ·
// الملف الشخصي · الإعدادات — مبنية على بيانات النظام الفعلية
// ═══════════════════════════════════════════════════════════

import { icons } from "./icons.js";
import {
  seedIfNeeded, getSession, logout, flushPendingWrites,
  getStudents, getGroups, getGrades, getStudentStatuses,
  getAttendance, getPayments, getExams,
  getSubjects, getTopics, getQuestions, getExamAnswersForStudent,
  addPracticeAnswer, markAnswerReviewed, markAnswerLearned,
  getAchievementsForStudent, getFollowupLogs, getEscalationLogsForStudent,
  getSettings, isStudentPortalEnabled, getTeachingSubject,
  advanceSkillMastery, getDueSkillReviews,
} from "./storage.js";
import { escapeHTML, formatMoney, todayISO, formatDateAr, initials, addDays, weekdayNameAr } from "./helpers.js";
import { findGroup, gradeName } from "./lookups.js";
import { computeHealthScore, getHealthColor, getHealthLabel } from "./health-score.js";
import { getTypeMeta } from "./achievement-engine.js";
import { buildErrorNotebook, notebookStats, repeatedSkills } from "./error-notebook.js";
import { getRemediationReviewList, computeAnswerScore, questionTypeLabel } from "./remediation-service.js";
import { THEMES } from "./themes.js";
import { appPath } from "./paths.js";

const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const CUR = () => getSettings().currency || "ج.م";

/* ── تخزين محلي (محفوظات · مراجعة · إشعارات مقروءة · نقطة استكمال) ── */
function lsKey(name) {
  return `sc_${name}_${(getSession()?.studentId || "x")}`;
}
function lsGet(name, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(lsKey(name)));
    return v ?? fallback;
  } catch (e) {
    return fallback;
  }
}
function lsSet(name, value) {
  try {
    localStorage.setItem(lsKey(name), JSON.stringify(value));
  } catch (e) {}
}

const S = {};

/* ═══════════════════════════════════════════════════════════
   Boot — التحقق من الدخول + بناء الهيكل
   ═══════════════════════════════════════════════════════════ */

async function boot() {
  await seedIfNeeded();

  const session = getSession();
  if (!session || session.role !== "student") {
    window.location.href = appPath("login.html");
    return;
  }
  if (!isStudentPortalEnabled()) {
    logout();
    await flushPendingWrites();
    window.location.href = appPath("login.html");
    return;
  }

  const student = getStudents().find((s) => s.id === session.studentId);
  if (!student) {
    window.location.href = appPath("login.html");
    return;
  }

  S.session = session;
  S.student = student;
  S.group = findGroup(getGroups(), student.groupId);
  S.gradeName = gradeName(getGrades(), student.gradeId);
  S.statuses = getStudentStatuses();
  const teaching = getTeachingSubject();
  S.subjects = teaching ? getSubjects().filter((s) => s.id === teaching.id) : getSubjects();
  S.topics = teaching ? getTopics().filter((t) => t.subjectId === teaching.id) : getTopics();
  S.questions = teaching ? getQuestions().filter((q) => q.subjectId === teaching.id) : getQuestions();
  S.questionsById = new Map(S.questions.map((q) => [q.id, q]));

  document.title = `مركز قيادة الطالب — ${student.name}`;
  renderShell();
  applyTheme();
  navigate("home");
}

function renderShell() {
  const settings = getSettings();
  const centerName = settings.centerName || "السنتر";
  const name = S.student.name;

  document.body.insertAdjacentHTML("afterbegin", `
    <div class="sc-app">
      <header class="sc-topbar">
        <div class="sc-brand">
          <div class="sc-brand__mark">${initials(centerName)}</div>
          <div style="min-width:0">
            <div class="sc-brand__name">${escapeHTML(centerName)}</div>
            <div class="sc-brand__sub">مركز قيادة الطالب</div>
          </div>
        </div>
        <div class="sc-top-actions">
          <button class="sc-icon-btn" data-sc-action="open-search" title="بحث">${icons.search}</button>
          <button class="sc-icon-btn" data-sc-action="toggle-notif" title="الإشعارات">
            ${icons.inbox}
            <span class="sc-badge-dot" id="scNotifBadge" style="display:none;"></span>
          </button>
          <button class="sc-icon-btn" data-sc-action="toggle-theme" title="المظهر">${icons.palette}</button>
          <div class="sc-user-chip" data-sc-action="user-menu" title="القائمة">
            <div class="sc-user-chip__avatar">${initials(name)}</div>
            <div>
              <div class="sc-user-chip__name">${escapeHTML(name)}</div>
              <div class="sc-user-chip__role">طالب</div>
            </div>
            <span class="sc-user-chip__caret">▾</span>
          </div>
        </div>
      </header>

      <aside class="sc-sidebar">
        <nav class="sc-nav" id="scNav"></nav>
        <div class="sc-sidebar__foot">${escapeHTML(centerName)} · مركز قيادة الطالب</div>
      </aside>

      <main class="sc-main" id="scMain"></main>

      <nav class="sc-dock" id="scDock"></nav>
    </div>
    <div class="sc-toasts" id="scToasts"></div>
  `);

  document.addEventListener("click", onAppClick);
  document.addEventListener("input", onAppInput);
  updateNotifBadge();
}

const NAV = [
  { id: "learning", label: "مركز التعلم", icon: icons.radar, hero: true },
  { id: "home", label: "الرئيسية", icon: icons.home },
  { id: "learn", label: "المنهج", icon: icons.grid },
  { id: "exams", label: "الامتحانات", icon: icons.chart },
];

const DOCK = ["home", "learning", "learn", "exams"];

const LEARN_TABS = [
  { id: "today", label: "اليوم", icon: icons.radar },
  { id: "errors", label: "دفتر الأخطاء", icon: icons.alert },
  { id: "progress", label: "أدائي", icon: icons.clipboard },
];

/* المسارات القديمة (mistakes / progress) → تبويب داخل مركز التعلم */
function resolveView(view) {
  if (view === "mistakes") { S.learnTab = "errors"; return "learning"; }
  if (view === "progress") { S.learnTab = "progress"; return "learning"; }
  return view;
}

function renderNav(activeId) {
  const active = activeId === "mistakes" || activeId === "progress" ? "learning" : activeId;
  const mistakesCount = mistakes().length;

  document.getElementById("scNav").innerHTML = NAV.map((item) => `
    <button class="sc-nav__item ${item.hero ? "sc-nav__item--hero" : ""} ${active === item.id ? "is-active" : ""}"
            data-sc-action="nav" data-view="${item.id}">
      ${item.icon}
      <span>${item.label}</span>
      ${item.id === "learning" && mistakesCount ? `<span class="sc-nav-count">${mistakesCount}</span>` : ""}
    </button>
  `).join("");

  document.getElementById("scDock").innerHTML = DOCK.map((id) => {
    const item = NAV.find((n) => n.id === id);
    return `
      <button class="sc-dock__item ${active === id ? "is-active" : ""}" data-sc-action="nav" data-view="${id}">
        ${item.icon}
        <span>${item.label}</span>
      </button>
    `;
  }).join("");
}

function navigate(view, params) {
  const target = resolveView(view);
  S.view = target;
  S.params = params || {};
  if (S.params.tab) S.learnTab = S.params.tab;
  renderNav(target);

  const main = document.getElementById("scMain");
  const render = VIEWS[target] || VIEWS.home;
  main.innerHTML = `<div class="sc-page">${render()}</div>`;
  window.scrollTo({ top: 0 });
}

const VIEWS = {
  home: homeView,
  learning: learningView,
  learn: learnView,
  exams: examsView,
  calendar: calendarView,
  saved: savedView,
  notifications: notificationsView,
  profile: profileView,
  settings: settingsView,
};

/* ═══════════════════════════════════════════════════════════
   بنّاءات البيانات الفعلية
   ═══════════════════════════════════════════════════════════ */

function ownExams() {
  return getExams()
    .flatMap((ex) => {
      const r = (ex.results || []).find((x) => x.studentId === S.student.id);
      if (!r) return [];
      const scores = (ex.results || []).filter((x) => !x.absent && x.score != null).map((x) => x.score).sort((a, b) => b - a);
      const my = r.absent ? null : r.score;
      const rank = my == null ? null : scores.indexOf(my) + 1;
      const pct = ex.maxScore && my != null ? Math.round((my / ex.maxScore) * 100) : null;
      return [{ exam: ex, result: r, pct, rank, of: scores.length }];
    })
    .sort((a, b) => (a.exam.date < b.exam.date ? 1 : -1));
}

function attStats() {
  const att = getAttendance().filter((a) => a.studentId === S.student.id);
  const present = att.filter((a) => S.statuses.find((s) => s.id === a.statusId)?.presence === "present").length;
  const absent = att.filter((a) => S.statuses.find((s) => s.id === a.statusId)?.presence === "absent").length;
  const total = present + absent;
  return { present, absent, total, rate: total ? Math.round((present / total) * 100) : 0 };
}

function payStats() {
  const pays = getPayments().filter((p) => p.studentId === S.student.id);
  const totalPaid = pays.reduce((s, p) => s + Number(p.amount || 0), 0);
  const paidCount = pays.filter((p) => p.status === "paid").length;
  const late = Number(S.student.lateBalance || 0);
  const wallet = Number(S.student.walletBalance || 0);
  return { totalPaid, paidCount, late, wallet, net: Math.max(0, late - wallet) };
}

function examAverage() {
  const ex = ownExams().filter((e) => e.pct != null);
  if (!ex.length) return null;
  return Math.round(ex.reduce((s, e) => s + e.pct, 0) / ex.length);
}

function mistakes() {
  const seen = new Set();
  return getExamAnswersForStudent(S.student.id)
    .filter((a) => !a.isCorrect)
    .sort((a, b) => ((a.examId || "") < (b.examId || "") ? 1 : -1))
    .filter((a) => {
      if (seen.has(a.questionId)) return false;
      seen.add(a.questionId);
      return true;
    })
    .map((a) => ({
      answer: a,
      question: S.questionsById.get(a.questionId),
      topic: S.questionsById.get(a.questionId) ? S.topics.find((t) => t.id === S.questionsById.get(a.questionId).topicId) : null,
      subject: S.questionsById.get(a.questionId) ? S.subjects.find((s) => s.id === S.questionsById.get(a.questionId).subjectId) : null,
      exam: getExams().find((e) => e.id === a.examId),
    }));
}

function perSubject() {
  const answers = getExamAnswersForStudent(S.student.id);
  return S.subjects.map((sub) => {
    const qids = new Set(S.questions.filter((q) => q.subjectId === sub.id).map((q) => q.id));
    const subAnswers = answers.filter((a) => qids.has(a.questionId));
    const correct = subAnswers.filter((a) => a.isCorrect).length;
    return {
      subject: sub,
      total: subAnswers.length,
      correct,
      pct: subAnswers.length ? Math.round((correct / subAnswers.length) * 100) : null,
    };
  });
}

function weakestSubject() {
  const withData = perSubject().filter((p) => p.total > 0);
  if (!withData.length) return null;
  return withData.reduce((a, b) => (b.pct < a.pct ? b : a));
}

function bookmarks() {
  return lsGet("bookmarks", []);
}
function isBookmarked(qid) {
  return bookmarks().includes(qid);
}
function toggleBookmark(qid) {
  const list = bookmarks();
  const idx = list.indexOf(qid);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(qid);
  lsSet("bookmarks", list);
  return idx < 0;
}

function reviewedSet() {
  return new Set(lsGet("reviewed", []));
}
function markReviewed(ansId) {
  const s = new Set(lsGet("reviewed", []));
  s.add(ansId);
  lsSet("reviewed", [...s]);
}

function continueId() {
  return lsGet("continue", null) || lastAnsweredQuestionId();
}
function lastAnsweredQuestionId() {
  const answers = getExamAnswersForStudent(S.student.id).sort((a, b) => (a.examId < b.examId ? 1 : -1));
  return answers.length ? answers[0].questionId : null;
}
function setContinue(qid) {
  lsSet("continue", qid);
}

function unreadNotifCount() {
  return notifications().filter((n) => !readNotifs().has(n.key)).length;
}
function readNotifs() {
  return new Set(lsGet("readNotifs", []));
}
function markNotifsRead() {
  lsSet("readNotifs", notifications().map((n) => n.key));
  updateNotifBadge();
}

function notifications() {
  const out = [];
  const st = attStats();
  const att = getAttendance()
    .filter((a) => a.studentId === S.student.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 8);

  att.forEach((a) => {
    const s = S.statuses.find((x) => x.id === a.statusId);
    if (!s) return;
    if (s.presence === "absent") {
      out.push({ key: `att-${a.id}`, date: a.date, icon: "🔴", tone: "danger", title: `غياب — ${formatDateAr(a.date)}`, body: `تم تسجيل غيابك في هذه الحصة${s.name ? ` (${s.name})` : ""}.` });
    } else if (s.presence === "present") {
      out.push({ key: `att-${a.id}`, date: a.date, icon: "🟢", tone: "success", title: `حضور — ${formatDateAr(a.date)}`, body: "تم تسجيل حضورك ✓" });
    }
  });

  ownExams().forEach((e) => {
    if (e.result.absent) {
      out.push({ key: `ex-${e.exam.id}`, date: e.exam.date, icon: "📋", tone: "danger", title: `غائب عن امتحان: ${e.exam.title}`, body: "لم يتم تسجيل درجتك في هذا الامتحان." });
    } else {
      out.push({
        key: `ex-${e.exam.id}`, date: e.exam.date, icon: "🏆", tone: "success",
        title: `نتيجة: ${e.exam.title}`,
        body: `حصلت على ${e.result.score} من ${e.exam.maxScore} (${e.pct}%)${e.rank ? ` — ترتيبك ${e.rank} من ${e.of}` : ""}.`,
      });
    }
  });

  getPayments()
    .filter((p) => p.studentId === S.student.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 6)
    .forEach((p) => {
      out.push({
        key: `pay-${p.id}`, date: p.date, icon: "💰", tone: p.status === "paid" ? "success" : "warning",
        title: p.status === "paid" ? "تم سداد" : "دفعة مستحقة",
        body: `${formatMoney(p.amount, CUR())} — ${p.note || "دفعة حصة"}`,
      });
    });

  getFollowupLogs().filter((f) => f.studentId === S.student.id).slice(-5).forEach((f) => {
    out.push({ key: `fu-${f.id}`, date: (f.date || "").slice(0, 10), icon: "📝", tone: "primary", title: "متابعة من الإدارة", body: f.text });
  });

  getEscalationLogsForStudent(S.student.id).slice(-5).forEach((es) => {
    out.push({ key: `es-${es.id}`, date: (es.date || "").slice(0, 10), icon: "🚨", tone: "danger", title: "تنبيه تصعيد", body: es.reason || "تم رفع تنبيه لك" });
  });

  if (st.total && st.rate < 60) {
    out.push({ key: "att-low", date: todayISO(), icon: "⚠️", tone: "warning", title: "نسبة حضور منخفضة", body: `نسبة حضورك الحالية ${st.rate}%. حاول الالتزام للحفاظ على مستواك.` });
  }
  const ps = payStats();
  if (ps.net > 0) {
    out.push({ key: "pay-due", date: todayISO(), icon: "💳", tone: "warning", title: "مستحقات مالية", body: `لديك متأخرات بقيمة ${formatMoney(ps.net, CUR())}. يرجى التواصل مع الإدارة.` });
  }

  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

function last7() {
  const att = getAttendance().filter((a) => a.studentId === S.student.id);
  const exams = ownExams();
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(todayISO(), -i);
    const dayAtt = att.filter((a) => a.date === d);
    const present = dayAtt.some((a) => S.statuses.find((s) => s.id === a.statusId)?.presence === "present");
    const absent = dayAtt.some((a) => S.statuses.find((s) => s.id === a.statusId)?.presence === "absent");
    out.push({ date: d, label: weekdayNameAr(d), present, absent, hasExam: exams.some((e) => e.exam.date === d) });
  }
  return out;
}

function upcomingEvents(days = 30) {
  const events = [];
  const today = new Date();
  const groupDays = new Set((S.group?.days || []).map((d) => d));

  for (let i = 1; i <= days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const wname = WEEKDAYS[d.getDay()];
    if (groupDays.has(wname)) {
      events.push({ date: iso, title: "حصة", time: S.group?.time || "", tone: "primary", type: "session" });
    }
  }

  const gradeId = S.student.gradeId;
  getExams().forEach((ex) => {
    if (ex.date < todayISO()) return;
    if (ex.gradeId && ex.gradeId !== gradeId) return;
    events.push({ date: ex.date, title: `امتحان: ${ex.title}`, time: "", tone: "warning", type: "exam" });
  });

  return events.sort((a, b) => (a.date < b.date ? 1 : -1));
}

function achievements() {
  return getAchievementsForStudent(S.student.id);
}

function health() {
  return computeHealthScore(S.student.id);
}

/* ═══════════════════════════════════════════════════════════
   مكوّنات مشتركة
   ═══════════════════════════════════════════════════════════ */

function pageHead(title, sub) {
  return `
    <div class="sc-page-head">
      <div class="sc-page-title">${title}</div>
      ${sub ? `<div class="sc-page-sub">${sub}</div>` : ""}
    </div>`;
}

function emptyState(icon, title, text) {
  return `
    <div class="sc-empty">
      <div class="sc-empty__ic">${icon}</div>
      <div class="sc-empty__t">${title}</div>
      ${text ? `<div class="sc-empty__s">${text}</div>` : ""}
    </div>`;
}

function statTile(tone, value, label, sub) {
  return `
    <div class="sc-tile" style="--c:var(--${tone});">
      <div class="sc-tile__n">${value}</div>
      <div class="sc-tile__l">${label}</div>
      ${sub ? `<div class="sc-tile__sub">${sub}</div>` : ""}
    </div>`;
}

function barRow(label, pct, tone, right) {
  const c = tone ? `var(--${tone})` : "var(--primary)";
  return `
    <div style="margin-bottom:12px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <span style="font-size:12.5px; font-weight:700;">${label}</span>
        <span style="font-size:12px; font-weight:800; color:var(--${tone || "muted"});">${right ?? (pct == null ? "—" : `${pct}%`)}</span>
      </div>
      <div class="sc-bar"><div class="sc-bar__fill" style="width:${Math.max(0, Math.min(100, pct || 0))}%; --c:${c};"></div></div>
    </div>`;
}

function healthCard() {
  const h = health();
  const color = getHealthColor(h.total);
  return `
    <div class="sc-card">
      <div class="sc-card__head"><div class="sc-card__title">${icons.shield} صحة الطالب</div>
        <span class="sc-chip" style="margin-right:auto;">${getHealthLabel(h.total)}</span></div>
      <div style="font-size:40px; font-weight:800; color:var(--${color});">${h.total}<span style="font-size:15px; color:var(--muted);">/100</span></div>
      <div class="sc-bar sc-mt"><div class="sc-bar__fill" style="width:${h.total}%; --c:var(--${color});"></div></div>
      <div style="display:flex; gap:18px; margin-top:12px; font-size:12px; color:var(--muted); flex-wrap:wrap;">
        <span>حضور: <strong style="color:var(--text);">${h.attendanceRate}%</strong></span>
        ${h.hasExams ? `<span>درجات: <strong style="color:var(--text);">${h.examAvg}%</strong></span>` : `<span>بدون امتحانات</span>`}
        <span>سلوكي: <strong style="color:var(--text);">${h.behaviorScore}/20</strong></span>
      </div>
    </div>`;
}

function weekStrip(showExam = true) {
  const week = last7();
  const today = todayISO();
  return `
    <div class="sc-week">
      ${week.map((d) => `
        <div class="sc-week__day ${d.date === today ? "is-today" : ""}">
          <div class="sc-week__d">${d.label}</div>
          <div class="sc-week__n">${d.date.slice(8)}</div>
          <div class="sc-week__dot">
            ${d.present ? `<span class="sc-week__dot--present"></span>` : ""}
            ${d.absent ? `<span class="sc-week__dot--absent"></span>` : ""}
            ${d.hasExam && showExam ? `<span class="sc-week__dot--exam"></span>` : ""}
          </div>
        </div>
      `).join("")}
    </div>`;
}

/* ═══════════════════════════════════════════════════════════
   1. الرئيسية
   ═══════════════════════════════════════════════════════════ */

function heroHTML() {
  const st = attStats();
  const avg = examAverage();
  const lastEx = ownExams()[0];
  return `
    <div class="sc-hero">
      <div class="sc-hero__row">
        <div class="sc-hero__avatar">${initials(S.student.name)}</div>
        <div style="flex:1; min-width:220px;">
          <div class="sc-hero__greet" style="font-size:12px; opacity:.85; font-weight:700;">أهلاً بعودتك 👋</div>
          <div class="sc-hero__name">${escapeHTML(S.student.name)}</div>
          <div class="sc-hero__meta">
            <span class="sc-hero__chip">${escapeHTML(S.gradeName || "—")}</span>
            <span class="sc-hero__chip">${escapeHTML(S.group?.name || "بدون مجموعة")}</span>
            <span class="sc-hero__chip">${escapeHTML(S.student.school || "—")}</span>
            <span class="sc-hero__chip">كود: <span style="direction:ltr; unicode-bidi:embed;">${escapeHTML(S.student.code || "")}</span></span>
          </div>
        </div>
        <div class="sc-hero__stats">
          <div class="sc-hero__stat"><span class="sc-hero__stat-n">${st.rate}%</span><span class="sc-hero__stat-l">الحضور</span></div>
          <div class="sc-hero__stat"><span class="sc-hero__stat-n">${avg != null ? avg + "%" : "—"}</span><span class="sc-hero__stat-l">متوسط الامتحانات</span></div>
          <div class="sc-hero__stat"><span class="sc-hero__stat-n">${lastEx && lastEx.rank ? `${lastEx.rank}<span style="font-size:13px;">/${lastEx.of}</span>` : "—"}</span><span class="sc-hero__stat-l">آخر ترتيب</span></div>
        </div>
      </div>
    </div>`;
}

function homeView() {
  const st = attStats();
  const avg = examAverage();
  const ps = payStats();
  const mk = mistakes();
  const nb = buildErrorNotebook(S.student.id);
  const nbStats = notebookStats(nb);
  const pendingMistakes = nb.filter((e) => e.status !== "healed");
  const dueReviews = getDueSkillReviews(S.student.id);
  const cid = continueId();
  const continueQ = cid ? S.questionsById.get(cid) : null;
  const acc = perSubject().filter((p) => p.total > 0);
  const accPct = acc.length ? Math.round(acc.reduce((s, p) => s + p.correct, 0) / acc.reduce((s, p) => s + p.total, 0) * 100) : null;

  return `
    ${pageHead(`${icons.home} الرئيسية`, "نظرة سريعة على كل ما يخصك اليوم")}
    ${heroHTML()}

    ${dueReviews.length ? `
      <div class="sc-card sc-mb" style="border-color:var(--warning);">
        <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
          <div style="flex:1; min-width:180px;">
            <div style="font-weight:800; font-size:15px;">${dueReviews.length} مراجعة مستحقة اليوم</div>
            <div style="font-size:12.5px; color:var(--muted);">إعادة اختبار بعد فترة — هي اللي بتثبّت المهارة في الذاكرة</div>
          </div>
          <button class="sc-btn sc-btn--warning" data-sc-action="practice-mistakes">${icons.check} راجعها دلوقتي</button>
        </div>
      </div>` : ""}

    <div class="sc-qa-grid">
      <div class="sc-qa" data-sc-action="nav" data-view="learning"><div class="sc-qa__ic">${icons.radar}</div>مركز التعلم</div>
      <div class="sc-qa" data-sc-action="nav" data-view="learn"><div class="sc-qa__ic">${icons.grid}</div>المنهج</div>
      <div class="sc-qa" data-sc-action="nav" data-view="exams"><div class="sc-qa__ic">${icons.chart}</div>الامتحانات</div>
      <div class="sc-qa" data-sc-action="nav" data-view="calendar"><div class="sc-qa__ic">${icons.calendar}</div>التقويم</div>
    </div>

    <div class="sc-grid-3 sc-mb">
      ${statTile("success", `${st.rate}%`, "نسبة الحضور", `${st.present} حضور · ${st.absent} غياب`)}
      ${statTile("primary", avg != null ? `${avg}%` : "—", "متوسط الامتحانات", `${ownExams().length} امتحان`)}
      ${statTile("warning", accPct != null ? `${accPct}%` : "—", "دقة الإجابات", "من أسئلة التدريب")}
    </div>

    <div class="sc-grid-2">
      <div class="sc-card">
        <div class="sc-card__head">
          <div class="sc-card__title">${icons.alert} دفتر الأخطاء</div>
          <span class="sc-card__more" data-sc-action="nav" data-view="mistakes">الكل ←</span>
        </div>
        ${nb.length ? `
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
            <span class="sc-chip sc-chip--danger">${nbStats.newCount} جديدة</span>
            <span class="sc-chip sc-chip--warning">${nbStats.repeated} متكررة</span>
            <span class="sc-chip sc-chip--success">${nbStats.treated} معالجة</span>
            <span class="sc-chip sc-chip--primary">${nbStats.treatmentRate}% نسبة العلاج</span>
          </div>
          <div class="sc-list">
            ${pendingMistakes.slice(0, 3).map((e) => `
              <div class="sc-row sc-row--danger">
                <div class="sc-row__ic">${e.status === "repeated" ? "🔁" : "❌"}</div>
                <div class="sc-row__body">
                  <div class="sc-row__t">${escapeHTML(e.question?.text || "سؤال")}</div>
                  <div class="sc-row__s">${escapeHTML(e.skill)} · ${escapeHTML(e.topic?.name || "—")} · أخطأ ${e.count} مرة</div>
                </div>
                <span class="sc-chip sc-chip--danger">${e.status === "repeated" ? "متكرر" : "غير مُراجع"}</span>
              </div>
            `).join("")}
          </div>
          <div class="sc-mt" style="display:flex; gap:8px; flex-wrap:wrap;">
            ${pendingMistakes.length ? `<button class="sc-btn sc-btn--primary sc-btn--sm" data-sc-action="practice-mistakes">راجع أخطائي (${pendingMistakes.length})</button>` : `<button class="sc-btn sc-btn--success sc-btn--sm" data-sc-action="practice-mistakes">🎉 الكل معالج — أعد التدريب</button>`}
          </div>
        ` : emptyState("🎯", "لا توجد أخطاء مسجلة", "عندما تخطئ في سؤال، يظهر هنا تلقائياً ليتابع دفتر الأخطاء رحلة علاجه.")}
      </div>

      <div class="sc-card">
        <div class="sc-card__head">
          <div class="sc-card__title">${icons.radar} استكمل من نقطة الوقوف</div>
          <span class="sc-card__more" data-sc-action="nav" data-view="learning">مركز التعلم ←</span>
        </div>
        ${continueQ ? `
          <div class="sc-focus">
            <div class="sc-focus__ic" style="--c-bg:var(--primary-light);">📌</div>
            <div class="sc-focus__body">
              <div class="sc-focus__t">${escapeHTML(continueQ.text)}</div>
              <div class="sc-focus__s">${escapeHTML(S.subjects.find((s) => s.id === continueQ.subjectId)?.name || "")} · ${escapeHTML(S.topics.find((t) => t.id === continueQ.topicId)?.name || "")}</div>
            </div>
          </div>
          <button class="sc-btn sc-btn--primary" data-sc-action="practice" data-qid="${continueQ.id}">${icons.check} أكمل التدريب</button>
        ` : emptyState("📚", "ابدأ رحلتك التدريبية", "اختر سؤالاً من المنهج أو راجع أخطاءك وسنواصل من حيث توقفت.")}
      </div>
    </div>

    <div class="sc-grid-2 sc-mt">
      <div class="sc-card">
        <div class="sc-card__head"><div class="sc-card__title">${icons.calendar} آخر 7 أيام</div></div>
        ${weekStrip()}
      </div>
      <div class="sc-card">
        <div class="sc-card__head"><div class="sc-card__title">${icons.wallet} الاشتراك</div>
          <span class="sc-card__more" data-sc-action="nav" data-view="profile">الملف ←</span></div>
        <div class="sc-list">
          <div class="sc-row">
            <div class="sc-row__ic sc-row--success" style="background:var(--success-light); color:var(--success);">${icons.check}</div>
            <div class="sc-row__body">
              <div class="sc-row__t">مدفوع</div>
              <div class="sc-row__s">${ps.paidCount} دفعة · إجمالي ${formatMoney(ps.totalPaid, CUR())}</div>
            </div>
          </div>
          <div class="sc-row ${ps.net > 0 ? "sc-row--danger" : "sc-row--success"}">
            <div class="sc-row__ic">${ps.net > 0 ? icons.alert : icons.shield}</div>
            <div class="sc-row__body">
              <div class="sc-row__t">${ps.net > 0 ? "متأخرات مالية" : "لا توجد متأخرات"}</div>
              <div class="sc-row__s">${ps.net > 0 ? `المتبقي ${formatMoney(ps.net, CUR())} — تواصل مع الإدارة` : "اشتراكك مكتمل ✓"}</div>
            </div>
            <div class="sc-row__end"><span class="sc-chip ${ps.net > 0 ? "sc-chip--danger" : "sc-chip--success"}">${formatMoney(ps.net, CUR())}</span></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════
   2. مركز التعلم — مساعد الدراسة اليومي
   ═══════════════════════════════════════════════════════════ */

function learnTabHTML(active) {
  return `
    <div class="sc-tabs sc-mb">
      ${LEARN_TABS.map((t) => `
        <button class="sc-tab ${active === t.id ? "is-active" : ""}" data-sc-action="learn-tab" data-tab="${t.id}">
          ${t.icon} ${t.label}
        </button>`).join("")}
    </div>`;
}

function learningView() {
  const tab = S.learnTab || "today";

  if (tab === "errors") {
    return `
      ${pageHead(`${icons.radar} مركز التعلم`, "كل خطأ فرصة — نتابع رحلة علاجه حتى يختفي")}
      ${learnTabHTML("errors")}
      ${mistakesSection()}
    `;
  }

  if (tab === "progress") {
    return `
      ${pageHead(`${icons.radar} مركز التعلم`, "إحصاءات أدائك الكاملة")}
      ${learnTabHTML("progress")}
      ${progressSection()}
    `;
  }

  const mk = mistakes();
  const unreviewed = mk.filter((m) => !reviewedSet().has(m.answer.id));
  const cid = continueId();
  const continueQ = cid ? S.questionsById.get(cid) : null;
  const weak = weakestSubject();
  const week = last7();
  const daysAttended = week.filter((d) => d.present).length;
  const upcoming = upcomingEvents(14).filter((e) => e.type === "exam");
  const st = attStats();
  const todayName = weekdayNameAr(todayISO());
  const todaySession = (S.group?.days || []).includes(todayName);

  const focusCards = `
    <div class="sc-focus">
      <div class="sc-focus__ic" style="--c-bg:var(--primary-light);">📌</div>
      <div class="sc-focus__body">
        <div class="sc-focus__t">أكمل من نقطة الوقوف ${continueQ ? `<span class="sc-chip sc-chip--primary">جاهز</span>` : ""}</div>
        <div class="sc-focus__s">${continueQ ? escapeHTML(continueQ.text) : "ابدأ بالتدريب وسنكمل تلقائياً من آخر سؤال أجبته."}</div>
      </div>
      ${continueQ ? `<button class="sc-focus__go" data-sc-action="practice" data-qid="${continueQ.id}">تابع ←</button>` : `<button class="sc-focus__go" data-sc-action="nav" data-view="learn">ابدأ ←</button>`}
    </div>

    <div class="sc-focus">
      <div class="sc-focus__ic" style="--c-bg:var(--danger-light);">❌</div>
      <div class="sc-focus__body">
        <div class="sc-focus__t">أخطاء غير مُراجعة <span class="sc-chip ${unreviewed.length ? "sc-chip--danger" : "sc-chip--success"}">${unreviewed.length}</span></div>
        <div class="sc-focus__s">${unreviewed.length ? `لديك ${unreviewed.length} أخطاء تنتظر مراجعة — كل دقيقة مراجعة تمنع الخطأ نفسه في الامتحان.` : "لا توجد أخطاء غير مُراجعة — عمل رائع 🎉"}</div>
      </div>
      ${unreviewed.length ? `<button class="sc-focus__go" data-sc-action="practice-mistakes">راجع الآن ←</button>` : ""}
    </div>

    <div class="sc-focus">
      <div class="sc-focus__ic" style="--c-bg:var(--success-light);">🗓️</div>
      <div class="sc-focus__body">
        <div class="sc-focus__t">حصة اليوم <span class="sc-chip ${todaySession ? "sc-chip--success" : "sc-chip--warning"}">${todaySession ? "لديك حصة" : "لا توجد حصة"}</span></div>
        <div class="sc-focus__s">${todaySession ? `حصتك اليوم ${todayName} الساعة <strong>${escapeHTML(S.group?.time || "")}</strong>${S.group?.name ? ` — ${escapeHTML(S.group.name)}` : ""}.` : `لا توجد حصة اليوم (${todayName})${S.group?.days?.length ? ` — أيام مجموعتك: ${S.group.days.join("، ")}` : ""}.`}</div>
      </div>
      ${todaySession ? `<button class="sc-focus__go" data-sc-action="nav" data-view="calendar">جدول الحصص ←</button>` : ""}
    </div>

    <div class="sc-focus">
      <div class="sc-focus__ic" style="--c-bg:var(--warning-light);">📝</div>
      <div class="sc-focus__body">
        <div class="sc-focus__t">الامتحان القادم <span class="sc-chip ${upcoming.length ? "sc-chip--warning" : "sc-chip--success"}">${upcoming.length ? upcoming.length + " قادم" : "لا شيء"}</span></div>
        <div class="sc-focus__s">${upcoming.length ? upcoming.map((e) => `📅 ${formatDateAr(e.date)} — ${escapeHTML(e.title)}`).join("<br>") : "لا توجد امتحانات قادمة — استخدم الوقت للمراجعة والتدريب."}</div>
      </div>
      ${upcoming.length ? `<button class="sc-focus__go" data-sc-action="nav" data-view="calendar">التقويم ←</button>` : ""}
    </div>
  `;

  const weakBlock = weak
    ? `
      <div class="sc-card">
        <div class="sc-card__head"><div class="sc-card__title">${icons.alert} مهارة تحتاج تقوية</div></div>
        <div style="display:flex; align-items:center; gap:14px;">
          <div style="font-size:34px;">${escapeHTML(weak.subject.icon || "📚")}</div>
          <div style="flex:1;">
            <div style="font-weight:800; font-size:14px;">${escapeHTML(weak.subject.name)}</div>
            <div style="font-size:12px; color:var(--muted); margin-top:3px;">${weak.correct} إجابة صحيحة من ${weak.total} سؤال</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:22px; font-weight:800; color:var(--danger);">${weak.pct}%</div>
            <div class="sc-bar" style="width:90px;"><div class="sc-bar__fill" style="width:${weak.pct}%; --c:var(--danger);"></div></div>
          </div>
        </div>
        <button class="sc-btn sc-btn--primary sc-mt" data-sc-action="nav" data-view="learn" data-subject="${weak.subject.id}">${icons.grid} تدريب على ${escapeHTML(weak.subject.name)}</button>
      </div>`
    : emptyState("💪", "لا توجد بيانات مهارات بعد", "عند تدريبك على الأسئلة سنحدد أضعف مهاراتك تلقائياً.");

  const summary = `
    <div class="sc-card">
      <div class="sc-card__head"><div class="sc-card__title">${icons.clipboard} ملخص آخر 7 أيام</div></div>
      <div style="display:flex; gap:22px; margin-bottom:14px; flex-wrap:wrap;">
        <div><div style="font-size:22px; font-weight:800;">${daysAttended}<span style="font-size:12px; color:var(--muted);"> /7</span></div><div style="font-size:11px; color:var(--muted);">أيام حضور</div></div>
        <div><div style="font-size:22px; font-weight:800; color:var(--warning);">${week.filter((d) => d.absent).length}</div><div style="font-size:11px; color:var(--muted);">أيام غياب</div></div>
        <div><div style="font-size:22px; font-weight:800; color:var(--primary);">${ownExams().filter((e) => e.exam.date >= addDays(todayISO(), -7)).length}</div><div style="font-size:11px; color:var(--muted);">امتحانات</div></div>
        <div><div style="font-size:22px; font-weight:800; color:var(--danger);">${mk.length}</div><div style="font-size:11px; color:var(--muted);">أخطاء للمراجعة</div></div>
      </div>
      ${weekStrip()}
      <div style="font-size:11.5px; color:var(--muted); margin-top:10px;">
        ${st.total ? `نسبة حضورك الإجمالية: <strong style="color:var(--text);">${st.rate}%</strong>` : "لا توجد سجلات حضور بعد."}
      </div>
    </div>`;

  return `
    ${pageHead(`${icons.radar} مركز التعلم`, "مساعدك اليومي: اعرف بالظبط تذاكر إيه دلوقتي")}
    ${learnTabHTML("today")}
    <div class="sc-learn-hero">
      <div class="sc-learn-hero__em">🎯</div>
      <div style="flex:1; min-width:200px;">
        <div class="sc-learn-hero__t">ماذا أذاكر الآن؟</div>
        <div class="sc-learn-hero__s">كل صباح، يجمع لك المركز المهام الأهم: أكمل من آخر نقطة، راجع أخطاءك غير المُنقّحة، استعد لأي امتحان قادم، وقوِّ أضعف مهارة عندك.</div>
      </div>
      <button class="sc-learn-hero__cta" data-sc-action="nav" data-view="learn">${continueQ ? "أكمل من نقطة الوقوف" : "ابدأ التدريب"} ←</button>
    </div>
    ${focusCards}
    <div class="sc-grid-2 sc-mt">
      ${weakBlock}
      ${summary}
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════
   3. المنهج — المواد ← المواضيع ← الأسئلة
   ═══════════════════════════════════════════════════════════ */

function learnView() {
  const sub = S.params.subject ? S.subjects.find((s) => s.id === S.params.subject) : null;
  const topic = S.params.topic ? S.topics.find((t) => t.id === S.params.topic) : null;

  if (!S.subjects.length) {
    return `
      ${pageHead(`${icons.grid} المنهج`, "موادك الدراسية")}
      ${emptyState("📚", "المنهج لم يُنشر بعد", "عندما يضيف الأستاذ المواد والأسئلة، تظهر هنا تلقائياً لتتدرب عليها. راجع أخطاءك في مركز الأخطاء حتى ذلك الحين.")}
    `;
  }

  if (!sub) {
    const ps = perSubject();
    return `
      ${pageHead(`${icons.grid} المنهج`, "اختر مادة لتبدأ التدريب")}
      <div class="sc-subject-grid">
        ${S.subjects.map((s) => {
          const p = ps.find((x) => x.subject.id === s.id);
          const count = S.questions.filter((q) => q.subjectId === s.id).length;
          return `
            <div class="sc-subject" style="--c:${s.color || "var(--primary)"};" data-sc-action="nav" data-view="learn" data-subject="${s.id}">
              <div class="sc-subject__top">
                <div class="sc-subject__em">${escapeHTML(s.icon || "📚")}</div>
                <div>
                  <div class="sc-subject__name">${escapeHTML(s.name)}</div>
                  <div style="font-size:11px; color:var(--muted);">${count} سؤال</div>
                </div>
              </div>
              <div class="sc-subject__meta">
                ${p && p.total ? `<span class="sc-chip ${p.pct >= 60 ? "sc-chip--success" : "sc-chip--danger"}">دقة ${p.pct}%</span>` : `<span class="sc-chip">لم تتدرب بعد</span>`}
              </div>
            </div>`;
        }).join("")}
      </div>
    `;
  }

  if (!topic) {
    const topics = S.topics.filter((t) => t.subjectId === sub.id);
    return `
      ${pageHead(`${escapeHTML(sub.icon || "")} ${escapeHTML(sub.name)}`, "اختر موضوعاً")}
      <button class="sc-btn sc-btn--ghost sc-btn--sm sc-mb" data-sc-action="nav" data-view="learn" style="display:inline-flex;">${icons.arrowLeft} كل المواد</button>
      <div class="sc-grid-2">
        ${topics.length ? topics.map((t) => {
          const qs = S.questions.filter((q) => q.topicId === t.id);
          const correct = qs.filter((q) => getExamAnswersForStudent(S.student.id).some((a) => a.questionId === q.id && a.isCorrect)).length;
          return `
            <div class="sc-card" data-sc-action="nav" data-view="learn" data-subject="${sub.id}" data-topic="${t.id}" style="cursor:pointer;">
              <div class="sc-card__head">
                <div class="sc-card__title">${escapeHTML(t.name)}</div>
                <span class="sc-chip" style="margin-right:auto;">${qs.length} سؤال</span>
              </div>
              <div style="font-size:12px; color:var(--muted);">أجبت صحيحاً على ${correct} من ${qs.length}</div>
              <div class="sc-bar sc-mt"><div class="sc-bar__fill" style="width:${qs.length ? (correct / qs.length) * 100 : 0}%;"></div></div>
              <div style="margin-top:10px; font-size:12px; font-weight:800; color:var(--primary);">ابدأ التدريب ←</div>
            </div>`;
        }).join("") : emptyState("📂", "لا توجد مواضيع في هذه المادة")}
      </div>
    `;
  }

  const qs = S.questions.filter((q) => q.topicId === topic.id);
  return `
    ${pageHead(`${escapeHTML(topic.name)}`, `${escapeHTML(sub.icon || "")} ${escapeHTML(sub.name)}`)}
    <button class="sc-btn sc-btn--ghost sc-btn--sm sc-mb" data-sc-action="nav" data-view="learn" data-subject="${sub.id}" style="display:inline-flex;">${icons.arrowLeft} المواضيع</button>
    ${qs.length ? `
      <button class="sc-btn sc-btn--primary sc-mb" data-sc-action="practice-topic" data-topic="${topic.id}">${icons.check} ابدأ التدريب على الموضوع</button>
      <div class="sc-list">
        ${qs.map((q) => questionRow(q)).join("")}
      </div>` : emptyState("🗒️", "لا توجد أسئلة في هذا الموضوع")}
  `;
}

function questionRow(q) {
  const isWrong = getExamAnswersForStudent(S.student.id).some((a) => a.questionId === q.id && !a.isCorrect);
  const isRight = getExamAnswersForStudent(S.student.id).some((a) => a.questionId === q.id && a.isCorrect);
  return `
    <div class="sc-row">
      <div class="sc-row__ic ${isWrong ? "sc-row--danger" : isRight ? "sc-row--success" : ""}">${isWrong ? icons.x : isRight ? icons.check : icons.grid}</div>
      <div class="sc-row__body">
        <div class="sc-row__t">${escapeHTML(q.text)}</div>
        <div class="sc-row__s">
          ${q.difficulty === "easy" ? "سهل" : q.difficulty === "hard" ? "صعب" : "متوسط"}
          ${isBookmarked(q.id) ? " · ⭐ محفوظ" : ""}
        </div>
      </div>
      <div style="display:flex; gap:6px; flex-shrink:0;">
        <button class="sc-btn sc-btn--ghost sc-btn--sm" data-sc-action="bookmark" data-qid="${q.id}">${isBookmarked(q.id) ? "★" : "☆"}</button>
        <button class="sc-btn sc-btn--primary sc-btn--sm" data-sc-action="practice" data-qid="${q.id}">تدريب</button>
      </div>
    </div>`;
}

/* ═══════════════════════════════════════════════════════════
   4. الامتحانات — النتائج · الترتيب · الاتجاه
   ═══════════════════════════════════════════════════════════ */

function examsView() {
  const ex = ownExams();
  const avg = examAverage();
  const best = ex.filter((e) => e.pct != null).reduce((a, b) => (b.pct > a.pct ? b : a), null);
  const worst = ex.filter((e) => e.pct != null).reduce((a, b) => (b.pct < a.pct ? b : a), null);
  const present = ex.filter((e) => !e.result.absent);

  const trend = present.slice().sort((a, b) => (a.exam.date > b.exam.date ? 1 : -1)).slice(-8);
  const trendMax = Math.max(100, ...trend.map((t) => t.pct));

  return `
    ${pageHead(`${icons.chart} الامتحانات`, "نتائجك وترتيبك في كل امتحان")}
    <div class="sc-grid-3 sc-mb">
      ${statTile("primary", avg != null ? `${avg}%` : "—", "المتوسط العام", `${ex.length} امتحان`)}
      ${statTile("success", best ? `${best.pct}%` : "—", "الأفضل", best ? best.exam.title : "" )}
      ${statTile("danger", worst ? `${worst.pct}%` : "—", "الأقل", worst ? worst.exam.title : "")}
    </div>

    ${present.length > 1 ? `
      <div class="sc-card sc-mb">
        <div class="sc-card__head"><div class="sc-card__title">${icons.chart} اتجاه الدرجات</div></div>
        <div class="sc-trend">
          ${trend.map((t) => `
            <div class="sc-trend__col">
              <div class="sc-trend__bar" style="--c:${t.pct >= 60 ? "var(--success)" : t.pct >= 40 ? "var(--warning)" : "var(--danger)"}; height:${Math.max(6, (t.pct / trendMax) * 100)}%;">
                <span>${t.pct}%</span>
              </div>
              <div class="sc-trend__l">${t.exam.date.slice(5).replace("-", "/")}</div>
            </div>`).join("")}
        </div>
      </div>` : ""}

    <div class="sc-card">
      <div class="sc-card__head"><div class="sc-card__title">قائمة الامتحانات</div></div>
      ${ex.length ? `
        <div class="sc-list">
          ${ex.map((e) => `
            <div class="sc-row ${e.result.absent ? "" : e.pct >= 60 ? "sc-row--success" : e.pct >= 40 ? "sc-row--warning" : "sc-row--danger"}">
              <div class="sc-row__ic">${e.result.absent ? icons.x : e.pct >= 60 ? icons.shield : icons.chart}</div>
              <div class="sc-row__body">
                <div class="sc-row__t">${escapeHTML(e.exam.title)}</div>
                <div class="sc-row__s">${formatDateAr(e.exam.date)}${e.rank ? ` · ترتيبك ${e.rank} من ${e.of}` : ""}</div>
              </div>
              <div class="sc-row__end">
                ${e.result.absent
                  ? `<span class="sc-chip sc-chip--danger">غائب</span>`
                  : `<span class="sc-chip ${e.pct >= 60 ? "sc-chip--success" : e.pct >= 40 ? "sc-chip--warning" : "sc-chip--danger"}">${e.result.score} / ${e.exam.maxScore} (${e.pct}%)</span>`}
              </div>
            </div>`).join("")}
        </div>` : emptyState("📝", "لا توجد نتائج امتحانات بعد", "عندما تُعتمد نتائجك، تظهر هنا مع ترتيبك داخل مجموعتك.")}
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════
   5. مركز الأخطاء
   ═══════════════════════════════════════════════════════════ */

function pendingErrorQuestionIds() {
  return buildErrorNotebook(S.student.id)
    .filter((e) => e.status !== "healed")
    .map((e) => e.question.id);
}

function mistakesSection() {
  const nb = buildErrorNotebook(S.student.id);
  const st = notebookStats(nb);
  const skills = repeatedSkills(nb);
  const filter = S.mistakeFilter || "all";
  const filtered = nb.filter((e) => filter === "all" || e.status === filter);

  const statusMeta = {
    new: { label: "جديدة", cls: "sc-chip--danger" },
    repeated: { label: "متكررة", cls: "sc-chip--warning" },
    "in-treatment": { label: "قيد العلاج", cls: "sc-chip--primary" },
    healed: { label: "معالجة", cls: "sc-chip--success" },
  };
  const statusIcon = { new: "🆕", repeated: "🔁", "in-treatment": "⏳", healed: "✅" };

  const filters = [
    ["all", "الكل"],
    ["new", "جديدة"],
    ["repeated", "متكررة"],
    ["in-treatment", "قيد العلاج"],
    ["healed", "معالجة"],
  ];
  const counts = { all: st.total, new: st.newCount, repeated: st.repeated, "in-treatment": st.inTreatment, healed: st.treated };
  const pending = st.total - st.treated;

  return `
    <div class="sc-grid-3 sc-mb">
      ${statTile("danger", st.total, "إجمالي الأخطاء", `${st.newCount} جديدة لم تُراجع`)}
      ${statTile("warning", st.repeated, "متكررة", `${st.inTreatment} قيد العلاج`)}
      ${statTile("success", `${st.treatmentRate}%`, "نسبة العلاج", `${st.treated} معالجة من ${st.total}`)}
    </div>

    ${pending ? `
      <div class="sc-card sc-mb" style="border-color:var(--danger);">
        <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
          <div style="flex:1; min-width:180px;">
            <div style="font-weight:800; font-size:15px;">${pending} خطأ يحتاج مراجعة</div>
            <div style="font-size:12.5px; color:var(--muted);">أعد حلها حتى تظهر في "معالجة"</div>
          </div>
          <button class="sc-btn sc-btn--danger" data-sc-action="practice-mistakes">${icons.check} راجع أخطائي</button>
        </div>
      </div>` : ""}

    ${skills.length ? `
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
        <span style="font-size:12.5px; font-weight:800; color:var(--muted); align-self:center;">الأكثر تكراراً:</span>
        ${skills.map((s) => `<span class="sc-chip sc-chip--warning">${escapeHTML(s.skill)} ×${s.count}</span>`).join("")}
      </div>` : ""}

    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
      ${filters.map(([f, label]) => `
        <button class="sc-chip ${filter === f ? "sc-chip--primary" : ""}" data-sc-action="nb-filter" data-filter="${f}" style="cursor:pointer; border:0; font:inherit;">
          ${label} (${counts[f]})
        </button>`).join("")}
    </div>

    ${filtered.length ? `
      <div class="sc-list">
        ${filtered.map((e) => {
          const sm = statusMeta[e.status];
          const q = e.question;
          const reviewed = e.reviewed && e.status !== "healed";
          return `
            <div class="sc-card sc-mb">
              <div class="sc-card__top" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
                <span class="sc-chip ${sm.cls}">${statusIcon[e.status]} ${sm.label}</span>
                <span class="sc-chip sc-chip--primary">${escapeHTML(e.skill)}</span>
                <span class="sc-chip">${escapeHTML(e.topic?.name || "—")}</span>
                <span style="font-size:11.5px; color:var(--muted); margin-right:auto;">آخر خطأ: ${formatDateAr(e.lastDate)}</span>
              </div>
              <div style="font-size:14.5px; font-weight:700; line-height:1.8;">${escapeHTML(q?.text || "سؤال غير موجود")}</div>
              <div style="font-size:12.5px; color:var(--muted); margin-top:6px;">
                إجابتك: <span style="color:var(--danger); font-weight:700;">${escapeHTML(e.lastWrong?.studentAnswer || "—")}</span>
                · الصحيحة: <span style="color:var(--success); font-weight:800;">${escapeHTML(q?.correctAnswer || "—")}</span>
              </div>
              ${q?.explanation ? `<div class="sc-explain">💡 ${escapeHTML(q.explanation)}</div>` : ""}
              <div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap; align-items:center;">
                <span class="sc-chip" style="font-size:11.5px;">أخطأت فيه ${e.count} ${e.count === 1 ? "مرة" : "مرات"} · ${e.totalAnswers} محاولة</span>
                <button class="sc-btn sc-btn--primary sc-btn--sm" data-sc-action="practice" data-qid="${q?.id || ""}" style="margin-right:auto;">أعد الحل</button>
                ${reviewed ? "" : `<button class="sc-btn sc-btn--success sc-btn--sm" data-sc-action="mark-reviewed" data-aid="${e.lastWrong?.id || ""}">✓ تمت المراجعة</button>`}
              </div>
            </div>`;
        }).join("")}
      </div>` : emptyState("🎉", filter === "all" ? "لا توجد أخطاء!" : "لا شيء في هذا التصنيف", filter === "all" ? "أنت ممتاز — لم تسجل أي إجابة خاطئة." : "غيّر التصنيف لعرض بقية الأخطاء.")}
  `;
}

/* ═══════════════════════════════════════════════════════════
   6. تقدمي — الإحصاءات
   ═══════════════════════════════════════════════════════════ */

function progressSection() {
  const st = attStats();
  const avg = examAverage();
  const ps = perSubject();
  const acc = ps.filter((p) => p.total > 0);
  const accPct = acc.length ? Math.round(acc.reduce((s, p) => s + p.correct, 0) / acc.reduce((s, p) => s + p.total, 0) * 100) : null;
  const mk = mistakes();
  const week = last7();

  return `
    <div class="sc-grid-3 sc-mb">
      ${statTile("success", `${st.rate}%`, "نسبة الحضور", `${st.present} حضور من ${st.total}`)}
      ${statTile("primary", avg != null ? `${avg}%` : "—", "متوسط الامتحانات", `${ownExams().length} امتحان`)}
      ${statTile("warning", accPct != null ? `${accPct}%` : "—", "دقة التدريب", `${mk.length} خطأ للمراجعة`)}
    </div>

    <div class="sc-grid-2">
      <div class="sc-card">
        <div class="sc-card__head"><div class="sc-card__title">${icons.grid} الأداء حسب المادة</div></div>
        ${ps.length ? ps.map((p) => {
          if (!p.total) return barRow(escapeHTML(p.subject.name), 0, "muted", "لم تتدرب");
          const tone = p.pct >= 60 ? "success" : p.pct >= 40 ? "warning" : "danger";
          return barRow(`${escapeHTML(p.subject.icon || "")} ${escapeHTML(p.subject.name)}`, p.pct, tone, `${p.correct}/${p.total}`);
        }).join("") : emptyState("📚", "لا توجد مواد", "عند إضافة المنهج ستظهر هنا.")
        }
      </div>
      <div class="sc-card">
        <div class="sc-card__head"><div class="sc-card__title">${icons.calendar} آخر 7 أيام</div></div>
        ${weekStrip()}
        <div style="font-size:12px; color:var(--muted); margin-top:10px;">
          🟢 حضور · 🔴 غياب · 🟡 امتحان
        </div>
      </div>
    </div>

    <div class="sc-grid-2 sc-mt">
      ${healthCard()}
      <div class="sc-card">
        <div class="sc-card__head"><div class="sc-card__title">${icons.shield} الإنجازات</div></div>
        ${renderAchievements()}
      </div>
    </div>
  `;
}

function renderAchievements() {
  const ach = achievements();
  if (!ach.length) {
    return emptyState("🏅", "لا توجد إنجازات بعد", "الإنجازات تُمنح تلقائياً عند تحسن درجاتك أو تحقيق تفوق.");
  }
  return `
    <div class="sc-list">
      ${ach.map((a) => {
        const meta = getTypeMeta(a.type);
        return `
          <div class="sc-row">
            <div class="sc-row__ic" style="font-size:20px;">${meta.icon}</div>
            <div class="sc-row__body">
              <div class="sc-row__t">${escapeHTML(meta.label)}</div>
              <div class="sc-row__s">${a.examTitle ? escapeHTML(a.examTitle) + " · " : ""}${formatDateAr(a.date)}${a.oldAvg ? ` · ${a.oldAvg}% → ${a.newPct}%` : ""}</div>
            </div>
            <span class="sc-chip sc-chip--success">${a.newPct}%</span>
          </div>`;
      }).join("")}
    </div>`;
}

/* ═══════════════════════════════════════════════════════════
   7. التقويم
   ═══════════════════════════════════════════════════════════ */

function calendarView() {
  const g = S.group;
  const events = upcomingEvents(30);
  const today = todayISO();

  return `
    ${pageHead(`${icons.calendar} التقويم`, "جدول الحصص والامتحانات")}
    <div class="sc-card sc-mb">
      <div class="sc-card__head">
        <div class="sc-card__title">${icons.clock} جدول الحصص الأسبوعي</div>
        <span class="sc-chip sc-chip--primary" style="margin-right:auto;">${escapeHTML(g?.name || "بدون مجموعة")}</span>
      </div>
      ${g?.days?.length ? `
        <div class="vst-schedule">
          ${WEEKDAYS.map((d) => {
            const has = (g.days || []).includes(d);
            const isToday = d === weekdayNameAr(todayISO());
            return `
              <div class="vst-schedule__day ${has ? "is-active" : ""}" style="${isToday ? "outline:2px solid var(--primary); outline-offset:2px;" : ""}">
                <div class="vst-schedule__day-name">${d}</div>
                <div class="vst-schedule__day-time">${has ? escapeHTML(g.time || "—") : "—"}</div>
              </div>`;
          }).join("")}
        </div>
        <div style="font-size:11.5px; color:var(--muted); margin-top:10px;">مدة الحصة: ${escapeHTML(String(g.duration || "") + " دقيقة")} · سعر الحصة: ${formatMoney(g.sessionPrice, CUR())}</div>
      ` : emptyState("🗓️", "لا يوجد جدول", "لم يتم ربطك بمجموعة بعد.")}
    </div>

    <div class="sc-card">
      <div class="sc-card__head"><div class="sc-card__title">${icons.calendar} الأحداث القادمة (30 يوم)</div></div>
      ${events.length ? `
        <div class="sc-list">
          ${events.slice(0, 15).map((e) => `
            <div class="sc-row ${e.type === "exam" ? "sc-row--warning" : "sc-row--primary"}">
              <div class="sc-row__ic">${e.type === "exam" ? "📝" : "🗓️"}</div>
              <div class="sc-row__body">
                <div class="sc-row__t">${escapeHTML(e.title)}</div>
                <div class="sc-row__s">${weekdayNameAr(e.date)} · ${formatDateAr(e.date)}${e.time ? ` · ${escapeHTML(e.time)}` : ""}</div>
              </div>
              <div class="sc-row__end"><span class="sc-chip ${e.type === "exam" ? "sc-chip--warning" : "sc-chip--primary"}">${e.date === today ? "اليوم" : e.date.slice(5)}</span></div>
            </div>`).join("")}
        </div>` : emptyState("📅", "لا توجد أحداث قادمة", "سجل حضورك ومواعيد الحصص ستظهر هنا.")}
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════
   8. المحفوظات
   ═══════════════════════════════════════════════════════════ */

function savedView() {
  const bms = bookmarks();
  const qs = bms.map((id) => S.questionsById.get(id)).filter(Boolean);

  return `
    ${pageHead(`${icons.shield} المحفوظات`, "أسئلتك المفضلة للمراجعة السريعة")}
    ${qs.length ? `
      <button class="sc-btn sc-btn--primary sc-mb" data-sc-action="practice-ids" data-ids="${qs.map((q) => q.id).join(",")}">${icons.check} ابدأ مراجعة الكل</button>
      <div class="sc-list">
        ${qs.map((q) => questionRow(q)).join("")}
      </div>` : emptyState("⭐", "لا توجد محفوظات", "اضغط على نجمة ☆ بجانب أي سؤال ليظهر هنا للمراجعة السريعة.")}
  `;
}

/* ═══════════════════════════════════════════════════════════
   9. الإشعارات
   ═══════════════════════════════════════════════════════════ */

function notificationsView() {
  const items = notifications();
  const read = readNotifs();

  return `
    ${pageHead(`${icons.inbox} الإشعارات`, "كل ما يخصك من حضور ودرجات ومدفوعات")}
    ${items.length ? `
      <button class="sc-btn sc-btn--ghost sc-btn--sm sc-mb" data-sc-action="mark-all-read">✓ تحديد الكل كمقروء</button>
      <div class="sc-tl">
        ${items.map((n) => `
          <div class="sc-tl__item" style="--c:var(--${n.tone === "primary" ? "primary" : n.tone});">
            <div class="sc-tl__date">${formatDateAr(n.date)} ${read.has(n.key) ? "" : "· جديد"}</div>
            <div class="sc-tl__card">
              <div class="sc-tl__t">${n.icon} ${escapeHTML(n.title)}</div>
              <div class="sc-tl__s">${escapeHTML(n.body)}</div>
            </div>
          </div>`).join("")}
      </div>` : emptyState("🔔", "لا توجد إشعارات", "ستصلك إشعارات الحضور والنتائج والمدفوعات هنا.")}
  `;
}

/* ═══════════════════════════════════════════════════════════
   10. الملف الشخصي
   ═══════════════════════════════════════════════════════════ */

function profileView() {
  const st = S.student;
  const ps = payStats();
  const g = S.group;

  const details = [
    ["هاتف الطالب", st.phone || "—", icons.phone],
    ["هاتف ولي الأمر", st.parentPhone || "—", icons.phone],
    ["اسم المدرسة", st.school || "—", icons.users],
    ["وظيفة الأب", st.fatherJob || "—", icons.users],
    ["تاريخ الانضمام", formatDateAr(st.joinDate), icons.calendar],
    ["الصف", S.gradeName || "—", icons.grid],
    ["المجموعة", g?.name || "—", icons.users],
    ["كود الطالب", `<span class="sc-code">${escapeHTML(st.code || "")}</span>`, icons.grid],
  ];

  return `
    ${pageHead(`${icons.users} ملفي الشخصي`, "بياناتك واشتراكك")}
    ${heroHTML()}

    <div class="sc-grid-2">
      <div class="sc-card">
        <div class="sc-card__head"><div class="sc-card__title">${icons.users} البيانات الأساسية</div></div>
        <div class="sc-detail-grid">
          ${details.map(([l, v, ic]) => `
            <div class="sc-detail-row">
              <span class="sc-detail-row__l">${ic} ${l}</span>
              <span class="sc-detail-row__v">${v}</span>
            </div>`).join("")}
        </div>
      </div>

      <div style="display:flex; flex-direction:column; gap:14px;">
        <div class="sc-card">
          <div class="sc-card__head"><div class="sc-card__title">${icons.wallet} الاشتراك</div></div>
          <div class="sc-detail-grid">
            <div class="sc-detail-row"><span class="sc-detail-row__l">سعر الحصة</span><span class="sc-detail-row__v">${formatMoney(g?.sessionPrice || 0, CUR())}</span></div>
            <div class="sc-detail-row"><span class="sc-detail-row__l">الخصم</span><span class="sc-detail-row__v">${st.discount ? `${st.discount}%` : "—"}</span></div>
            <div class="sc-detail-row"><span class="sc-detail-row__l">المدفوع إجمالاً</span><span class="sc-detail-row__v" style="color:var(--success);">${formatMoney(ps.totalPaid, CUR())}</span></div>
            <div class="sc-detail-row"><span class="sc-detail-row__l">المتبقي</span><span class="sc-detail-row__v" style="color:${ps.net > 0 ? "var(--danger)" : "var(--success)"};">${formatMoney(ps.net, CUR())}</span></div>
            <div class="sc-detail-row"><span class="sc-detail-row__l">رصيد المحفظة</span><span class="sc-detail-row__v">${formatMoney(ps.wallet, CUR())}</span></div>
          </div>
          ${ps.net > 0 ? `<div class="sc-explain" style="margin-top:12px;">💳 لديك متأخرات بقيمة <strong>${formatMoney(ps.net, CUR())}</strong> — يرجى التواصل مع إدارة السنتر لتسويتها.</div>` : `<div class="sc-explain" style="margin-top:12px; background:var(--success-light); border-right-color:var(--success);">✓ اشتراكك مكتمل — لا توجد متأخرات.</div>`}
        </div>
        ${healthCard()}
      </div>
    </div>

    <div class="sc-card sc-mt">
      <div class="sc-card__head"><div class="sc-card__title">${icons.shield} الإنجازات الأكاديمية</div></div>
      ${renderAchievements()}
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════
   11. الإعدادات
   ═══════════════════════════════════════════════════════════ */

function settingsView() {
  const current = portalTheme();
  return `
    ${pageHead(`${icons.settings} الإعدادات`, "تخصيص تجربتك")}

    <div class="sc-card sc-mb">
      <div class="sc-set">
        <div class="sc-set__ic">${icons.palette}</div>
        <div class="sc-set__body">
          <div class="sc-set__t">المظهر</div>
          <div class="sc-set__s">الثيم المفضل لديك يُحفظ على حسابك.</div>
        </div>
      </div>
      <div class="sc-themes" style="padding:0 4px 14px;">
        ${THEMES.map((t) => `
          <button class="sc-theme ${current === t.id ? "is-active" : ""}" data-sc-action="theme" data-theme="${t.id}"
                  style="background:${t.swatch};" title="${escapeHTML(t.name)}">
            ${current === t.id ? icons.check : ""}
          </button>`).join("")}
      </div>
    </div>

    <div class="sc-card sc-mb">
      <div class="sc-set">
        <div class="sc-set__ic">${icons.whatsapp}</div>
        <div class="sc-set__body">
          <div class="sc-set__t">التواصل مع السنتر</div>
          <div class="sc-set__s">${escapeHTML(getSettings().address || "")} ${escapeHTML(getSettings().phone ? "· " + getSettings().phone : "")}</div>
        </div>
        ${getSettings().phone ? `<a class="sc-btn sc-btn--ghost sc-btn--sm" href="tel:${escapeHTML(getSettings().phone)}">اتصال</a>` : ""}
      </div>
      <div class="sc-set">
        <div class="sc-set__ic">${icons.info}</div>
        <div class="sc-set__body">
          <div class="sc-set__t">حول التطبيق</div>
          <div class="sc-set__s">مركز قيادة الطالب — نسخة المعاينة التجريبية</div>
        </div>
      </div>
      <div class="sc-set">
        <div class="sc-set__ic" style="color:var(--danger);">${icons.logout}</div>
        <div class="sc-set__body">
          <div class="sc-set__t">تسجيل الخروج</div>
          <div class="sc-set__s">الخروج من حساب الطالب.</div>
        </div>
        <button class="sc-btn sc-btn--danger sc-btn--sm" data-sc-action="logout">خروج</button>
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════
   نافذة التدريب (Practice Modal)
   ═══════════════════════════════════════════════════════════ */

function openPractice(qids, opts = {}) {
  const list = qids.map((id) => S.questionsById.get(id)).filter(Boolean);
  if (!list.length) {
    toast("لا توجد أسئلة متاحة", "warning");
    return;
  }
  S.practice = {
    list,
    idx: opts.startIndex ?? 0,
    answered: null,
    phase: "answer",
    mode: opts.mode || "practice",
    origin: opts.origin || "",
    attemptId: "P-" + Date.now(),
    t0: Date.now(),
    lastResult: null,
    lastAnswerId: null,
    deferred: [],
    deferredNotice: false,
  };
  renderPractice();
}

function practiceNext() {
  const p = S.practice;
  p.idx++;
  p.answered = null;
  p.phase = "answer";
  p.lastAnswerId = null;
  p.deferredNotice = false;
  renderPractice();
}

function renderPractice() {
  const p = S.practice;
  const q = p.list[p.idx];
  if (!q) { closePractice(); return; }
  p.t0 = Date.now();

  let wrap = document.getElementById("scPracticeModal");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "scPracticeModal";
    document.body.appendChild(wrap);
  }

  const answered = p.answered;
  const phase = p.phase;
  const retestMode = p.mode === "retest";
  const bm = isBookmarked(q.id);
  const subj = S.subjects.find((s) => s.id === q.subjectId);
  const topic = S.topics.find((t) => t.id === q.topicId);
  const correct = answered != null && answered === q.correctAnswer;
  const done = phase === "feedback" || phase === "learned" || phase === "retest-done";
  const explainText = phase === "learned"
    ? (q.explanationLong || q.explanation)
    : (q.explanationShort || q.explanation);

  wrap.innerHTML = `
    <div class="sc-modal-wrap">
      <div class="sc-modal">
        <div class="sc-modal__head">
          <button class="sc-modal__x" data-sc-action="close-practice">${icons.x}</button>
          <div class="sc-modal__title">سؤال ${p.idx + 1} من ${p.list.length}</div>
          <button class="sc-modal__x" data-sc-action="bookmark" data-qid="${q.id}" title="حفظ">${bm ? "★" : "☆"}</button>
        </div>

        ${p.deferredNotice ? `<div class="sc-explain" style="background:#e3f2fd; border-right-color:#0ea5e9;">⏳ خلصنا الأسئلة الأصلية — دي باقي الأسئلة اللي أجّلتها.</div>` : ""}

        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
          <span class="sc-chip sc-chip--primary">${escapeHTML(subj?.name || "")}</span>
          <span class="sc-chip">${escapeHTML(topic?.name || "")}</span>
          <span class="sc-chip">${q.difficulty === "easy" ? "سهل" : q.difficulty === "hard" ? "صعب" : "متوسط"}</span>
          <span class="sc-chip">${escapeHTML(questionTypeLabel(q.qtype))}</span>
          ${retestMode ? `<span class="sc-chip sc-chip--warning">تأكيد بعد 72 ساعة</span>` : ""}
        </div>

        <div class="sc-qcard__text">${escapeHTML(q.text)}</div>

        <div class="sc-options">
          ${q.options.map((o) => {
            let cls = "";
            let disabled = "";
            if (done) {
              disabled = "disabled";
              if (o === q.correctAnswer) cls = "is-correct";
              else if (o === answered) cls = "is-wrong";
            }
            return `
              <button class="sc-opt ${cls}" data-sc-action="answer" data-opt="${escapeHTML(o)}" ${disabled}>
                <span class="sc-opt__mark">${cls === "is-correct" ? "✓" : cls === "is-wrong" ? "✗" : ""}</span>
                <span>${escapeHTML(o)}</span>
              </button>`;
          }).join("")}
        </div>

        ${phase === "feedback" ? `
          <div class="sc-explain" style="background:var(--success-light); border-right-color:var(--success);">
            ✅ إجابة صحيحة — ممتاز!
            ${explainText ? `<div style="margin-top:6px;">💡 ${escapeHTML(explainText)}</div>` : ""}
          </div>
          <div style="display:flex; gap:8px; margin-top:14px; flex-wrap:wrap;">
            ${p.idx > 0 ? `<button class="sc-btn sc-btn--ghost" data-sc-action="practice-prev">السابق</button>` : ""}
            ${p.idx < p.list.length - 1
              ? `<button class="sc-btn sc-btn--primary" data-sc-action="practice-next">السؤال التالي ←</button>`
              : `<button class="sc-btn sc-btn--primary" data-sc-action="close-practice">${icons.check} إنهاء التدريب</button>`}
          </div>` : ""}

        ${phase === "learned" ? `
          <div class="sc-explain" style="background:var(--warning-light); border-right-color:var(--warning);">
            ❌ إجابتك غير صحيحة. الإجابة الصحيحة: <strong>${escapeHTML(q.correctAnswer)}</strong>.
            ${explainText ? `<div style="margin-top:8px;">📖 <strong>الشرح المفصل:</strong> ${escapeHTML(explainText)}</div>` : ""}
            <div style="margin-top:8px; font-size:12.5px; opacity:.85;">ضغطك على "فهمت" هيحط السؤال ده في "أخطائي"، وهنراجع عليك سؤال بديل لنفس المهارة بعد 72 ساعة للتأكيد.</div>
          </div>
          <div style="display:flex; gap:8px; margin-top:14px; flex-wrap:wrap;">
            <button class="sc-btn sc-btn--success" data-sc-action="understood">👍 فهمت — للسؤال الجاي</button>
            <button class="sc-btn sc-btn--ghost" data-sc-action="postpone">⏳ أجّل السؤال ده</button>
          </div>` : ""}

        ${phase === "retest-done" ? `
          <div class="sc-explain" style="${correct ? "background:var(--success-light); border-right-color:var(--success);" : "background:var(--warning-light); border-right-color:var(--warning);"}">
            ${correct
              ? `✅ تأكيد ناجح — المهارة دي اتأكدت واتعلجت! 🎉`
              : `❌ لسه في الخطأ — هتتراجع عليها تاني، وإن اتكرر هتتحط عند الأستاذ للتدخل.`}
            ${explainText ? `<div style="margin-top:6px;">💡 ${escapeHTML(explainText)}</div>` : ""}
          </div>
          <div style="display:flex; gap:8px; margin-top:14px; flex-wrap:wrap;">
            ${p.idx > 0 ? `<button class="sc-btn sc-btn--ghost" data-sc-action="practice-prev">السابق</button>` : ""}
            ${p.idx < p.list.length - 1
              ? `<button class="sc-btn sc-btn--primary" data-sc-action="practice-next">السؤال التالي ←</button>`
              : `<button class="sc-btn sc-btn--primary" data-sc-action="close-practice">${icons.check} إنهاء المراجعة</button>`}
          </div>` : ""}
      </div>
    </div>`;
}

function submitAnswer(opt) {
  const p = S.practice;
  if (!p || p.answered != null) return;
  const q = p.list[p.idx];
  const isCorrect = opt === q.correctAnswer;
  const retestMode = p.mode === "retest";
  const attemptKind = retestMode ? "retest" : isCorrect ? "first" : "error";
  p.answered = opt;

  try {
    const ans = addPracticeAnswer({
      studentId: S.student.id,
      questionId: q.id,
      studentAnswer: opt,
      isCorrect,
      attemptId: p.attemptId,
      timeTaken: p.t0 ? Math.max(0, Math.round((Date.now() - p.t0) / 1000)) : null,
      mode: p.mode,
      score: computeAnswerScore(S.student.id, q, isCorrect, retestMode ? "retest" : "first"),
    });
    p.lastAnswerId = ans.id;
  } catch (e) {
    console.error("تعذر حفظ إجابة التدريب", e);
  }

  // إتقان المهارة: التأكيد يدير الصندوق · الخطأ العادي يبدأ من "أنا فهمت"
  if (q.skill && retestMode) {
    advanceSkillMastery(S.student.id, q.skill, isCorrect, "retest");
  } else if (q.skill && isCorrect) {
    advanceSkillMastery(S.student.id, q.skill, true, "first");
  }

  setContinue(q.id);

  if (retestMode) {
    p.phase = "retest-done";
    renderPractice();
    toast(isCorrect ? "تأكيد ناجح ✓" : "لسه في الخطأ — هتتراجع تاني", isCorrect ? "success" : "warning");
  } else if (isCorrect) {
    p.phase = "feedback";
    renderPractice();
    toast("إجابة صحيحة ✓", "success");
  } else {
    p.phase = "learned";
    renderPractice();
    toast("اقرأ الشرح المفصل ثم اضغط فهمت", "warning");
  }
}

/** "أنا فهمت" — يسجّل الخطأ كمُتعلَّم ويبدأ ساعة الـ 72 ساعة */
function markUnderstood() {
  const p = S.practice;
  if (!p) return;
  const q = p.list[p.idx];
  const aid = p.lastAnswerId;
  if (aid) {
    try {
      markAnswerLearned(aid, computeAnswerScore(S.student.id, q, true, "learned"));
      markReviewed(aid);
    } catch (e) {
      console.error("تعذر حفظ التعلم", e);
    }
  }
  if (q.skill) advanceSkillMastery(S.student.id, q.skill, false, "learned");
  practiceNext();
  toast("تمام — السؤال ده اتسجل في أخطائك وهيتراجع بعد 72 ساعة ✓", "success");
}

/** "أجّل" — يحذف السؤال من الدور ويضعه في آخر القائمة */
function postponeQuestion() {
  const p = S.practice;
  if (!p) return;
  const q = p.list[p.idx];
  p.deferred.push(q.id);
  p.list.splice(p.idx, 1);
  if (!p.list.length && p.deferred.length) {
    p.list = p.deferred.map((id) => S.questionsById.get(id)).filter(Boolean);
    p.deferred = [];
    p.deferredNotice = true;
    p.idx = 0;
  } else {
    p.idx = Math.min(p.idx, p.list.length - 1);
  }
  p.answered = null;
  p.phase = "answer";
  p.lastAnswerId = null;
  renderPractice();
  toast("اتأجل — هيترجع في آخر القايمة", "warning");
}

/* ═══════════════════════════════════════════════════════════
   البحث
   ═══════════════════════════════════════════════════════════ */

function openSearch() {
  let wrap = document.getElementById("scSearchOverlay");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "scSearchOverlay";
    document.body.appendChild(wrap);
  }
  wrap.innerHTML = `
    <div class="sc-search" data-sc-close>
      <div class="sc-search__box">
        <div class="sc-search__input-row">
          ${icons.search}
          <input class="sc-search__input" id="scSearchInput" type="text" placeholder="ابحث عن سؤال، مادة، موضوع، امتحان..." autocomplete="off">
          <button class="sc-modal__x" data-sc-action="close-search">${icons.x}</button>
        </div>
        <div class="sc-search__results" id="scSearchResults"></div>
      </div>
    </div>`;
  const input = wrap.querySelector("#scSearchInput");
  input.focus();
  input.addEventListener("input", () => renderSearch(input.value));
  renderSearch("");
}

function renderSearch(query) {
  const q = String(query || "").trim().toLowerCase();
  const box = document.getElementById("scSearchResults");
  if (!box) return;
  if (!q) {
    box.innerHTML = `<div class="sc-search__group">اكتب كلمة للبحث في الأسئلة والمواد والمواضيع</div>`;
    return;
  }

  const groups = [];

  const qMatches = S.questions.filter((x) => x.text.toLowerCase().includes(q));
  if (qMatches.length) groups.push({ label: "الأسئلة", items: qMatches.map((x) => ({ html: `${escapeHTML(x.text)} <span class="em">${escapeHTML(S.subjects.find((s) => s.id === x.subjectId)?.name || "")}</span>`, action: "practice", qid: x.id })) });

  const subjMatches = S.subjects.filter((x) => x.name.toLowerCase().includes(q));
  if (subjMatches.length) groups.push({ label: "المواد", items: subjMatches.map((x) => ({ html: `${escapeHTML(x.icon || "📚")} ${escapeHTML(x.name)}`, action: "nav", view: "learn", subject: x.id })) });

  const topicMatches = S.topics.filter((x) => x.name.toLowerCase().includes(q));
  if (topicMatches.length) groups.push({ label: "المواضيع", items: topicMatches.map((x) => ({ html: `${escapeHTML(x.name)}`, action: "nav", view: "learn", subject: x.subjectId, topic: x.id })) });

  const examMatches = getExams().filter((x) => x.title.toLowerCase().includes(q));
  if (examMatches.length) groups.push({ label: "الامتحانات", items: examMatches.map((x) => ({ html: `${escapeHTML(x.title)} <span class="em">${formatDateAr(x.date)}</span>`, action: "nav", view: "exams" })) });

  if (!groups.length) {
    box.innerHTML = `<div class="sc-empty"><div class="sc-empty__t">لا توجد نتائج</div></div>`;
    return;
  }

  box.innerHTML = groups.map((g) => `
    <div class="sc-search__group">${g.label}</div>
    ${g.items.map((it) => `
      <div class="sc-search__item" data-sc-action="${it.action}" ${it.view ? `data-view="${it.view}"` : ""} ${it.subject ? `data-subject="${it.subject}"` : ""} ${it.topic ? `data-topic="${it.topic}"` : ""} ${it.qid ? `data-qid="${it.qid}"` : ""}>
        ${it.html}
      </div>`).join("")}
  `).join("");
}

/* ═══════════════════════════════════════════════════════════
   قائمة الأفتار — الملف · المحفوظات · الإعدادات · الخروج
   ═══════════════════════════════════════════════════════════ */

function toggleUserMenu() {
  const existing = document.getElementById("scUserMenu");
  if (existing) { existing.remove(); return; }

  const menu = document.createElement("div");
  menu.id = "scUserMenu";
  menu.className = "sc-user-menu";
  menu.innerHTML = `
    <button class="sc-user-menu__item" data-sc-action="nav" data-view="profile">${icons.users} ملفي</button>
    <button class="sc-user-menu__item" data-sc-action="nav" data-view="saved">${icons.shield} المحفوظات</button>
    <button class="sc-user-menu__item" data-sc-action="nav" data-view="settings">${icons.settings} الإعدادات</button>
    <div class="sc-user-menu__sep"></div>
    <button class="sc-user-menu__item sc-user-menu__item--danger" data-sc-action="logout">${icons.logout} تسجيل الخروج</button>
  `;
  document.body.appendChild(menu);
}

/* ═══════════════════════════════════════════════════════════
   الإشعارات — درج جانبي
   ═══════════════════════════════════════════════════════════ */

function toggleNotifDrawer() {
  const existing = document.getElementById("scNotifDrawer");
  if (existing) { existing.remove(); return; }

  const items = notifications().slice(0, 8);
  const drawer = document.createElement("div");
  drawer.id = "scNotifDrawer";
  drawer.className = "sc-drawer";
  drawer.innerHTML = `
    <div style="display:flex; align-items:center; margin-bottom:10px;">
      <div style="font-size:14px; font-weight:800;">الإشعارات</div>
      <button class="sc-btn sc-btn--ghost sc-btn--sm" data-sc-action="mark-all-read" style="margin-right:auto;">تحديد الكل مقروء</button>
    </div>
    ${items.length ? `
      <div class="sc-list">
        ${items.map((n) => `
          <div class="sc-row">
            <div class="sc-row__ic" style="font-size:16px;">${n.icon}</div>
            <div class="sc-row__body">
              <div class="sc-row__t">${escapeHTML(n.title)}</div>
              <div class="sc-row__s">${escapeHTML(n.body)}</div>
            </div>
          </div>`).join("")}
      </div>
      <button class="sc-btn sc-btn--primary sc-btn--sm" data-sc-action="nav" data-view="notifications" style="width:100%; margin-top:8px;">عرض كل الإشعارات ←</button>
    ` : emptyState("🔔", "لا توجد إشعارات")}
  `;
  document.body.appendChild(drawer);
  markNotifsRead();
}

function updateNotifBadge() {
  const n = unreadNotifCount();
  const badge = document.getElementById("scNotifBadge");
  if (badge) {
    badge.style.display = n ? "flex" : "none";
    badge.textContent = n;
  }
  renderNav(S.view);
}

function applyTheme() {
  try {
    document.documentElement.setAttribute("data-theme", portalTheme());
  } catch (e) {}
}
function portalTheme() {
  try {
    return localStorage.getItem(lsKey("theme")) || "default";
  } catch (e) {
    return "default";
  }
}
function setPortalTheme(themeId) {
  try {
    localStorage.setItem(lsKey("theme"), themeId);
    localStorage.setItem("center_active_theme", themeId);
    document.documentElement.setAttribute("data-theme", themeId);
  } catch (e) {}
}
function toggleTheme() {
  const themes = THEMES.map((t) => t.id);
  const next = themes[(themes.indexOf(portalTheme()) + 1) % themes.length];
  setPortalTheme(next);
  toast(`تم تطبيق الثيم: ${THEMES.find((t) => t.id === next)?.name || ""}`, "success");
}

function logoutNow() {
  logout();
  flushPendingWrites().then(() => {
    window.location.href = appPath("login.html");
  });
}

/* ═══════════════════════════════════════════════════════════
   Toast
   ═══════════════════════════════════════════════════════════ */

function toast(message, type = "success") {
  const stack = document.getElementById("scToasts");
  if (!stack) return;
  const tone = { success: "var(--success)", warning: "var(--warning)", danger: "var(--danger)", error: "var(--danger)", info: "var(--primary)" }[type] || "var(--success)";
  const el = document.createElement("div");
  el.className = "sc-toast";
  el.style.setProperty("--c", tone);
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .3s"; setTimeout(() => el.remove(), 320); }, 2600);
}

/* ═══════════════════════════════════════════════════════════
   الأحداث — تفويض على مستوى المستند
   ═══════════════════════════════════════════════════════════ */

function onAppClick(e) {
  const searchClose = e.target.closest("[data-sc-close]");
  if (searchClose) {
    document.getElementById("scSearchOverlay")?.remove();
    return;
  }
  const inUserMenu = e.target.closest("#scUserMenu");
  if (!inUserMenu && !e.target.closest("[data-sc-action='user-menu']")) {
    document.getElementById("scUserMenu")?.remove();
  }
  const el = e.target.closest("[data-sc-action]");
  if (!el) return;
  const action = el.dataset.scAction;

  switch (action) {
    case "nav": {
      document.getElementById("scNotifDrawer")?.remove();
      document.getElementById("scUserMenu")?.remove();
      closePractice();
      navigate(el.dataset.view, {
        subject: el.dataset.subject || undefined,
        topic: el.dataset.topic || undefined,
      });
      break;
    }
    case "user-menu":
      toggleUserMenu();
      break;
    case "learn-tab":
      S.learnTab = el.dataset.tab;
      navigate("learning");
      break;
    case "open-search":
      openSearch();
      break;
    case "close-search":
      document.getElementById("scSearchOverlay")?.remove();
      break;
    case "toggle-notif":
      toggleNotifDrawer();
      break;
    case "toggle-theme":
      toggleTheme();
      break;
    case "theme":
      setPortalTheme(el.dataset.theme);
      toast("تم تحديث المظهر ✓", "success");
      break;
    case "logout":
      logoutNow();
      break;
    case "practice":
      openPractice([el.dataset.qid]);
      break;
    case "practice-topic": {
      const qs = S.questions.filter((q) => q.topicId === el.dataset.topic).map((q) => q.id);
      openPractice(qs);
      break;
    }
    case "practice-mistakes": {
      const list = getRemediationReviewList(S.student.id);
      const qs = list.map((it) => it.question.id);
      openPractice(qs, { origin: "mistakes", mode: list.some((it) => it.mode === "retest") ? "retest" : "practice" });
      break;
    }
    case "practice-ids": {
      openPractice(el.dataset.ids.split(","));
      break;
    }
    case "answer":
      submitAnswer(el.dataset.opt);
      break;
    case "understood":
      markUnderstood();
      break;
    case "postpone":
      postponeQuestion();
      break;
    case "practice-next":
      practiceNext();
      break;
    case "practice-prev":
      S.practice.idx--;
      S.practice.answered = null;
      S.practice.phase = "answer";
      S.practice.lastAnswerId = null;
      renderPractice();
      break;
    case "close-practice":
      closePractice();
      break;
    case "bookmark": {
      const added = toggleBookmark(el.dataset.qid);
      toast(added ? "تمت الحفظ ⭐" : "تمت الإزالة من المحفوظات", added ? "success" : "warning");
      renderPractice();
      if (S.view === "saved" || S.view === "learn") navigate(S.view, S.params);
      break;
    }
    case "mark-reviewed": {
      markReviewed(el.dataset.aid);
      markAnswerReviewed(el.dataset.aid);
      toast("تم تحديده كمُراجع ✓", "success");
      navigate("mistakes");
      break;
    }
    case "nb-filter": {
      S.mistakeFilter = el.dataset.filter;
      navigate("mistakes");
      break;
    }
    case "mark-all-read": {
      markNotifsRead();
      toast("تم تحديد الكل كمقروء ✓", "success");
      document.getElementById("scNotifDrawer")?.remove();
      navigate("notifications");
      break;
    }
  }
}

function closePractice() {
  const wrap = document.getElementById("scPracticeModal");
  if (wrap) wrap.remove();
  S.practice = null;
}

function onAppInput(e) {
  const input = document.getElementById("scSearchInput");
  if (e.target === input) renderSearch(input.value);
}

boot();
