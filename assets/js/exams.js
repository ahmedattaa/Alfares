// =========================================================
// Exams — إدارة الامتحانات وإدخال الدرجات
// =========================================================

import { initPage } from "./app.js";
import { icons } from "./icons.js";
import { getExams, saveExams, getGroups, getStudents, getGrades, getSettings } from "./storage.js";
import { escapeHTML, initials, formatDateAr, generateId, todayISO } from "./helpers.js";
import { toast, formModal, emptyStateHTML, whatsappPreviewDialog, confirmDialog } from "./ui.js";
import { groupName, gradeName, findGroup } from "./lookups.js";
import { openWhatsApp } from "./whatsapp.js";
import { sendBulkExamResults } from "./whatsapp-notifications.js";
import { exportTableToExcel, printTableAsPDF } from "./export-utils.js";
import { detectAchievements, saveDetectedAchievements, generateMessage, getTypeMeta } from "./achievement-engine.js";

const content = await initPage("exams");
let selectedExamId = null;
let filterGradeId = "";
let filterGroupId = "";
let sortBy = "code"; // code | name | score

if (content) {
  window.__updateExamGroups = updateGroupOptions;
  render();
}

function render() {
  content.innerHTML = `
    <div class="page__header">
      <div>
        <div class="page__title">الامتحانات</div>
        <div class="page__subtitle">إنشاء امتحانات، إدخال الدرجات، ومتابعة النتائج</div>
      </div>
      <button class="btn btn-primary" id="addExamBtn">${icons.plus} امتحان جديد</button>
    </div>

    <div class="grid-2">
      <div class="card card-pad">
        <div class="card__head"><div class="card__title">قائمة الامتحانات</div></div>
        <div id="examsFilters"></div>
        <div id="examsList"></div>
      </div>
      <div class="card card-pad">
        <div class="card__head"><div class="card__title" id="gradesTitle">درجات الامتحان</div></div>
        <div id="gradesPanel"></div>
      </div>
    </div>
  `;

  document.getElementById("addExamBtn").addEventListener("click", openExamForm);
  renderExamsFilters();
  renderExamsList();
  renderGradesPanel();
}

/* ================= فلترة الامتحانات ================= */
function renderExamsFilters() {
  const box = document.getElementById("examsFilters");
  const grades = getGrades().sort((a, b) => a.order - b.order);
  const groups = getGroups();

  const filteredGroups = filterGradeId ? groups.filter((g) => g.gradeId === filterGradeId) : groups;

  box.innerHTML = `
    <div style="display:flex; gap:10px; margin-bottom:14px; flex-wrap:wrap;">
      <select class="select" id="filterGrade" style="max-width:200px;">
        <option value="">كل السنوات الدراسية</option>
        ${grades.map((g) => `<option value="${g.id}" ${filterGradeId === g.id ? "selected" : ""}>${escapeHTML(g.name)}</option>`).join("")}
      </select>
      <select class="select" id="filterGroup" style="max-width:200px;">
        <option value="">كل المجموعات</option>
        ${filteredGroups.map((g) => `<option value="${g.id}" ${filterGroupId === g.id ? "selected" : ""}>${escapeHTML(g.name)} (${g.code})</option>`).join("")}
      </select>
    </div>
  `;

  document.getElementById("filterGrade").addEventListener("change", (e) => {
    filterGradeId = e.target.value;
    filterGroupId = "";
    renderExamsFilters();
    renderExamsList();
  });

  document.getElementById("filterGroup").addEventListener("change", (e) => {
    filterGroupId = e.target.value;
    renderExamsList();
  });
}

/* ================= قائمة الامتحانات ================= */
function renderExamsList() {
  const box = document.getElementById("examsList");
  let exams = getExams().sort((a, b) => (a.date < b.date ? 1 : -1));
  const groups = getGroups();
  const grades = getGrades();

  if (filterGradeId) {
    const gradeGroupIds = new Set(groups.filter((g) => g.gradeId === filterGradeId).map((g) => g.id));
    exams = exams.filter((e) => gradeGroupIds.has(e.groupId));
  }
  if (filterGroupId) {
    exams = exams.filter((e) => e.groupId === filterGroupId);
  }

  if (!exams.length) {
    box.innerHTML = emptyStateHTML({ icon: icons.chart, title: "لا توجد امتحانات", text: filterGradeId || filterGroupId ? "لا توجد امتحانات تطابق الفلتر المحدد." : "أنشئ أول امتحان لتبدأ بتسجيل الدرجات." });
    return;
  }

  box.innerHTML = exams
    .map(
      (e) => {
        const g = findGroup(groups, e.groupId);
        const gr = grades.find((gr) => gr.id === g?.gradeId);
        return `
        <div class="flex-between examRow" data-id="${e.id}" style="padding:13px 6px; border-bottom:1px solid var(--border-2); cursor:pointer; ${selectedExamId === e.id ? "background:var(--primary-light); border-radius:10px;" : ""}">
          <div>
            <div style="font-weight:700;">${escapeHTML(e.title)}</div>
            <div class="text-muted" style="font-size:12.5px; margin-top:2px;">${escapeHTML(g?.name || "")} · ${formatDateAr(e.date)}</div>
            ${gr ? `<div class="text-muted" style="font-size:11px; margin-top:1px;">${escapeHTML(gr.name)}</div>` : ""}
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span class="badge badge-primary">${e.results.length} نتيجة</span>
            <div class="row-actions" style="opacity:0.6;">
              <button class="btn btn-outline btn-icon editExamBtn" data-id="${e.id}" title="تعديل الامتحان">${icons.edit}</button>
              <button class="btn btn-outline btn-icon deleteExamBtn" data-id="${e.id}" title="حذف الامتحان">${icons.trash}</button>
            </div>
          </div>
        </div>`;
      }
    )
    .join("");

  box.querySelectorAll(".examRow").forEach((row) =>
    row.addEventListener("click", () => {
      selectedExamId = row.dataset.id;
      renderExamsList();
      renderGradesPanel();
    })
  );

  box.querySelectorAll(".editExamBtn").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openEditExamForm(btn.dataset.id);
    })
  );

  box.querySelectorAll(".deleteExamBtn").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteExam(btn.dataset.id);
    })
  );
}

/* ================= لوحة درجات الامتحان ================= */
function renderGradesPanel() {
  const panel = document.getElementById("gradesPanel");
  const title = document.getElementById("gradesTitle");
  const exams = getExams();
  const exam = exams.find((e) => e.id === selectedExamId);

  if (!exam) {
    title.textContent = "درجات الامتحان";
    panel.innerHTML = emptyStateHTML({ icon: icons.clipboard, title: "اختر امتحانًا", text: "اختر امتحانًا من القائمة لعرض أو إدخال الدرجات." });
    return;
  }

  title.textContent = `درجات: ${exam.title}`;
  let groupStudents = getStudents().filter((s) => s.groupId === exam.groupId && s.status === "active");

  if (!groupStudents.length) {
    panel.innerHTML = emptyStateHTML({ title: "لا يوجد طلاب فى هذه المجموعة" });
    return;
  }

  const resultsMap = {};
  exam.results.forEach((r) => (resultsMap[r.studentId] = { score: r.score, absent: !!r.absent }));

  // حساب الإحصائيات
  const scored = groupStudents.filter((s) => {
    const r = resultsMap[s.id];
    return r && !r.absent && r.score != null;
  });
  const scores = scored.map((s) => resultsMap[s.id].score);
  const statsHTML = scores.length ? buildStatsBar(scores, exam.maxScore) : "";

  groupStudents = sortStudents(groupStudents, resultsMap, exam.maxScore);

  const scoredCount = exam.results.filter((r) => !r.absent && r.score != null).length;

  panel.innerHTML = `
    ${statsHTML}
    <div style="display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap; align-items:center;">
      <button class="btn btn-sm ${sortBy === "code" ? "btn-primary" : "btn-outline"}" data-sort="code">ترتيب بالكود</button>
      <button class="btn btn-sm ${sortBy === "name" ? "btn-primary" : "btn-outline"}" data-sort="name">ترتيب بالاسم</button>
      <button class="btn btn-sm ${sortBy === "score" ? "btn-primary" : "btn-outline"}" data-sort="score">ترتيب بالدرجة</button>
      <div style="flex:1;"></div>
      <button class="btn btn-outline btn-sm" id="examExportExcelBtn">${icons.download} تصدير Excel</button>
      <button class="btn btn-outline btn-sm" id="examExportPdfBtn">${icons.print} طباعة / PDF</button>
      ${scoredCount > 0 ? `<button class="btn btn-sm btn-success" id="bulkSendWaBtn">${icons.whatsapp} إرسال النتائج للكل (${scoredCount})</button>` : ""}
    </div>
    <form id="gradesForm">
      <div class="table-wrap" style="margin-bottom:16px;">
        <table class="table" id="examGradesTable">
          <thead><tr><th>#</th><th>الطالب</th><th>الكود</th><th>الدرجة (من ${exam.maxScore})</th><th>غائب</th><th>النسبة</th><th></th></tr></thead>
          <tbody>
            ${groupStudents
              .map((s, i) => {
                const r = resultsMap[s.id];
                const score = r?.score;
                const isAbsent = r?.absent || false;
                const pct = !isAbsent && score != null ? Math.round((score / exam.maxScore) * 100) : null;

                // تمييز الأوائل عند فرز بالدرجة
                const isTopScore = sortBy === "score" && !isAbsent && score != null && i < 3;
                const medals = ["🥇", "🥈", "🥉"];
                const medal = isTopScore ? medals[i] : "";
                const rowBg = isTopScore ? "background:rgba(46,204,113,0.08);" : "";

                return `
                <tr style="${rowBg}">
                  <td class="text-muted" style="font-size:12px;">${isTopScore ? `<span style="font-size:16px;">${medal}</span>` : i + 1}</td>
                  <td>
                    <div class="cell-user">
                      <div class="avatar-sm">${initials(s.name)}</div>
                      <div class="cell-user__name">${escapeHTML(s.name)}</div>
                    </div>
                  </td>
                  <td><span class="code-pill">${escapeHTML(s.code || "-")}</span></td>
                  <td style="display:flex; gap:6px; align-items:center;">
                    <input class="input scoreInput" style="max-width:100px;" type="number" min="0" max="${exam.maxScore}" name="${s.id}" value="${score != null ? score : ""}" placeholder="-" data-student-id="${s.id}" ${isAbsent ? "disabled" : ""}>
                  </td>
                  <td><input type="checkbox" class="absentCheckbox" data-student-id="${s.id}" ${isAbsent ? "checked" : ""} style="width:16px;height:16px;cursor:pointer;" title="غائب عن الامتحان"></td>
                  <td>${isAbsent ? `<span class="badge badge-neutral">غائب</span>` : pct != null ? `<span class="badge ${pct >= 60 ? "badge-success" : pct >= 40 ? "badge-warning" : "badge-danger"}">${pct}%</span>` : `<span class="text-muted">—</span>`}</td>
                  <td>
                    ${
                      !isAbsent && score != null
                        ? `<button type="button" class="btn btn-outline btn-icon sendWaBtn" data-student-id="${s.id}" title="إرسال النتيجة لولى الأمر واتساب">${icons.whatsapp}</button>`
                        : ""
                    }
                  </td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>
      <button class="btn btn-primary btn-block" type="submit">${icons.check} حفظ الدرجات</button>
    </form>
  `;

  panel.querySelectorAll('[data-sort]').forEach((btn) =>
    btn.addEventListener("click", () => {
      sortBy = btn.dataset.sort;
      renderGradesPanel();
    })
  );

  // أزرار التصدير
  document.getElementById("examExportExcelBtn")?.addEventListener("click", () => exportTableToExcel("#examGradesTable", `درجات_${exam.title}`));
  document.getElementById("examExportPdfBtn")?.addEventListener("click", () => printTableAsPDF("#examGradesTable", `درجات الامتحان: ${exam.title}`));

  panel.querySelectorAll(".sendWaBtn").forEach((btn) =>
    btn.addEventListener("click", () => sendExamResultWhatsApp(btn.dataset.studentId, exam))
  );

  panel.querySelectorAll(".absentCheckbox").forEach((cb) =>
    cb.addEventListener("change", () => {
      const studentId = cb.dataset.studentId;
      const scoreInput = panel.querySelector(`.scoreInput[data-student-id="${studentId}"]`);
      if (scoreInput) {
        scoreInput.disabled = cb.checked;
        if (cb.checked) scoreInput.value = "";
      }
    })
  );

  // إرسال واتساب جماعي
  const bulkBtn = panel.querySelector("#bulkSendWaBtn");
  if (bulkBtn) {
    bulkBtn.addEventListener("click", () => openBulkExamWhatsApp(exam.id));
  }

  // إدخال سريع بالكيبورد: Arrow Down / Enter ينتقل للطالب التالي
  const scoreInputs = [...panel.querySelectorAll(".scoreInput:not([disabled])")];
  scoreInputs.forEach((input, idx) => {
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        const next = scoreInputs[idx + 1];
        if (next) next.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = scoreInputs[idx - 1];
        if (prev) prev.focus();
      }
    });
  });

  document.getElementById("gradesForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const absentIds = new Set();
    panel.querySelectorAll(".absentCheckbox").forEach((cb) => {
      if (cb.checked) absentIds.add(cb.dataset.studentId);
    });

    const results = [];
    for (const [studentId, score] of formData.entries()) {
      if (absentIds.has(studentId)) {
        results.push({ studentId, score: 0, absent: true });
      } else if (score !== "") {
        results.push({ studentId, score: Number(score) });
      }
    }
    exam.results = results;
    saveExams(exams);
    toast("تم حفظ درجات الامتحان بنجاح", "success");

    /* ── كشف الإنجازات ── */
    const allDetected = [];
    results.forEach((r) => {
      if (r.absent || r.score == null) return;
      const detected = detectAchievements(r.studentId, exam.id, r.score, exam.maxScore);
      if (detected.length) {
        saveDetectedAchievements(detected);
        allDetected.push(...detected);
      }
    });

    if (allDetected.length) {
      const students = getStudents();
      const summary = allDetected.map((a) => {
        const st = students.find((s) => s.id === a.studentId);
        const meta = getTypeMeta(a.type);
        return `${meta.icon} ${st?.name || ""} — ${meta.label}`;
      }).join("\n");
      toast(`🎉 تم اكتشاف ${allDetected.length} إنجاز:\n${summary}`, "success", 6000);
    }

    renderExamsList();
    renderGradesPanel();
  });
}

function buildStatsBar(scores, maxScore) {
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const high = Math.max(...scores);
  const low = Math.min(...scores);
  const passCount = scores.filter((s) => s >= maxScore * 0.5).length;
  const failCount = scores.length - passCount;
  const passPct = Math.round((passCount / scores.length) * 100);

  const avgPct = Math.round((avg / maxScore) * 100);
  const highPct = Math.round((high / maxScore) * 100);

  return `
    <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:16px;">
      <div style="background:var(--primary-light); border-radius:10px; padding:12px 14px; text-align:center;">
        <div style="font-size:11px; color:var(--muted); margin-bottom:4px;">متوسط المجموعة</div>
        <div style="font-size:22px; font-weight:800; color:var(--primary);">${avg}<span style="font-size:13px; font-weight:400; color:var(--muted);"> / ${maxScore}</span></div>
        <div style="font-size:11px; color:var(--muted);">${avgPct}%</div>
      </div>
      <div style="background:rgba(46,204,113,0.08); border-radius:10px; padding:12px 14px; text-align:center;">
        <div style="font-size:11px; color:var(--muted); margin-bottom:4px;">أعلى درجة</div>
        <div style="font-size:22px; font-weight:800; color:var(--success);">${high}<span style="font-size:13px; font-weight:400; color:var(--muted);"> / ${maxScore}</span></div>
        <div style="font-size:11px; color:var(--muted);">${highPct}%</div>
      </div>
      <div style="background:rgba(231,76,60,0.06); border-radius:10px; padding:12px 14px; text-align:center;">
        <div style="font-size:11px; color:var(--muted); margin-bottom:4px;">أقل درجة</div>
        <div style="font-size:22px; font-weight:800; color:var(--danger);">${low}<span style="font-size:13px; font-weight:400; color:var(--muted);"> / ${maxScore}</span></div>
        <div style="font-size:11px; color:var(--muted);">${Math.round((low / maxScore) * 100)}%</div>
      </div>
      <div style="background:var(--bg-secondary, #f8f9fa); border-radius:10px; padding:12px 14px; text-align:center;">
        <div style="font-size:11px; color:var(--muted); margin-bottom:4px;">النجاح / الرسوب</div>
        <div style="display:flex; align-items:center; justify-content:center; gap:8px;">
          <span style="font-size:22px; font-weight:800; color:var(--success);">${passCount}</span>
          <span style="color:var(--muted); font-size:16px;">/</span>
          <span style="font-size:22px; font-weight:800; color:var(--danger);">${failCount}</span>
        </div>
        <div style="margin-top:6px; background:var(--border-2, #e0e0e0); border-radius:6px; height:6px; overflow:hidden;">
          <div style="height:100%; width:${passPct}%; background:var(--success); border-radius:6px; transition:width 0.3s;"></div>
        </div>
        <div style="font-size:11px; color:var(--muted); margin-top:3px;">${passPct}% نجاح</div>
      </div>
    </div>
  `;
}

async function openBulkExamWhatsApp(examId) {
  const notifications = sendBulkExamResults(examId);
  if (!notifications.length) {
    toast("لا توجد درجات مرسلة (أدخل الدرجات أولًا)", "warning");
    return;
  }

  // فتح أول رسالة
  const first = notifications[0];
  openWhatsApp(first.phone, first.message);

  if (notifications.length === 1) {
    toast(`تم فتح واتساب لإرسال نتيجة ${first.studentName}`, "success");
    return;
  }

  // باقى الطلاب: فتح تلقائى متتال مع تأخير
  let idx = 1;
  const ok = await confirmDialog({
    title: `إرسال ${notifications.length} نتيجة عبر واتساب`,
    body: `تم فتح أول رسالة (${first.studentName}).<br>هل تريد فتح باقى الرسائل تباعاً (كل ${0.5} ثانية)؟<br><br><span class="text-muted" style="font-size:12px;">سيتم فتح ${notifications.length - 1} رسالة إضافية. تأكد من أن واتساب مفتوح.</span>`,
    confirmText: `فتح باقى الرسائل (${notifications.length - 1})`,
    tone: "success",
  });
  if (!ok) return;

  const interval = setInterval(() => {
    if (idx >= notifications.length) {
      clearInterval(interval);
      toast(`تم فتح جميع الرسائل (${notifications.length} طالب)`, "success");
      return;
    }
    const n = notifications[idx];
    openWhatsApp(n.phone, n.message);
    idx++;
  }, 500);
}

function sortStudents(students, resultsMap, maxScore) {
  const sorted = [...students];
  if (sortBy === "code") {
    sorted.sort((a, b) => (a.code || "").localeCompare(b.code || "", "en", { numeric: true }));
  } else if (sortBy === "name") {
    sorted.sort((a, b) => a.name.localeCompare(b.name, "ar"));
  } else if (sortBy === "score") {
    sorted.sort((a, b) => {
      const ra = resultsMap[a.id];
      const rb = resultsMap[b.id];
      const sa = ra?.absent ? -2 : (ra?.score ?? -1);
      const sb = rb?.absent ? -2 : (rb?.score ?? -1);
      return sb - sa;
    });
  }
  return sorted;
}

async function sendExamResultWhatsApp(studentId, exam) {
  const student = getStudents().find((s) => s.id === studentId);
  const result = exam.results.find((r) => r.studentId === studentId);
  if (!student || !result) return;

  const settings = getSettings();
  const centerName = settings.centerName || "السنتر";
  const defaultMessage = `عزيزى ولى أمر الطالب/ة ${student.name}،

نود إعلامكم بنتيجة "${exam.title}":
الدرجة: ${result.score} من ${exam.maxScore}

مع تحيات ${centerName}`;

  const message = await whatsappPreviewDialog({
    title: "إرسال نتيجة الامتحان",
    recipientLabel: `ولى أمر ${student.name} (${student.parentPhone})`,
    defaultMessage,
  });
  if (!message) return;

  openWhatsApp(student.parentPhone, message);
}

async function openExamForm() {
  const grades = getGrades().sort((a, b) => a.order - b.order);
  const groups = getGroups();

  if (!groups.length) {
    toast("أضف مجموعة واحدة على الأقل من الإعدادات أولًا", "warning");
    return;
  }

  const bodyHTML = `
    <div class="field">
      <label class="field__label">اسم الامتحان</label>
      <input class="input" name="title" required placeholder="مثال: امتحان الشهر الأول">
    </div>
    <div class="form-grid">
      <div class="field">
        <label class="field__label">السنة الدراسية</label>
        <select class="select" name="gradeId" id="examGradeSelect" required onchange="window.__updateExamGroups && window.__updateExamGroups(this.value)">
          <option value="">اختر السنة الدراسية</option>
          ${grades.map((g) => `<option value="${g.id}">${escapeHTML(g.name)}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label class="field__label">المجموعة</label>
        <select class="select" name="groupId" id="examGroupSelect" required>
          <option value="">اختر السنة أولاً</option>
        </select>
      </div>
    </div>
    <div class="form-grid">
      <div class="field">
        <label class="field__label">الدرجة النهائية</label>
        <input class="input" type="number" name="maxScore" min="1" value="50" required>
      </div>
      <div class="field">
        <label class="field__label">تاريخ الامتحان</label>
        <input class="input" type="date" name="date" value="${todayISO()}" required>
      </div>
    </div>
  `;

  const result = await formModal({ title: "إنشاء امتحان جديد", bodyHTML, submitText: "إنشاء الامتحان", wide: true });
  if (!result) return;

  const exams = getExams();
  exams.push({
    id: generateId("EXM"),
    title: result.title,
    date: result.date,
    gradeId: result.gradeId,
    groupId: result.groupId,
    maxScore: Number(result.maxScore),
    results: [],
  });
  saveExams(exams);
  selectedExamId = exams[exams.length - 1].id;
  toast("تم إنشاء الامتحان بنجاح", "success");
  renderExamsFilters();
  renderExamsList();
  renderGradesPanel();
}

async function openEditExamForm(examId) {
  const exams = getExams();
  const exam = exams.find((e) => e.id === examId);
  if (!exam) return;

  const grades = getGrades().sort((a, b) => a.order - b.order);
  const groups = getGroups();
  const currentGroup = findGroup(groups, exam.groupId);
  const currentGradeId = currentGroup?.gradeId || "";
  const matchingGroups = currentGradeId ? groups.filter((g) => g.gradeId === currentGradeId) : [];

  const bodyHTML = `
    <div class="field">
      <label class="field__label">اسم الامتحان</label>
      <input class="input" name="title" required value="${escapeHTML(exam.title)}" placeholder="مثال: امتحان الشهر الأول">
    </div>
    <div class="form-grid">
      <div class="field">
        <label class="field__label">السنة الدراسية</label>
        <select class="select" name="gradeId" id="examGradeSelect" required onchange="window.__updateExamGroups && window.__updateExamGroups(this.value)">
          <option value="">اختر السنة الدراسية</option>
          ${grades.map((g) => `<option value="${g.id}" ${g.id === currentGradeId ? "selected" : ""}>${escapeHTML(g.name)}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label class="field__label">المجموعة</label>
        <select class="select" name="groupId" id="examGroupSelect" required>
          ${matchingGroups.length
            ? `<option value="">اختر المجموعة</option>` + matchingGroups.map((g) => `<option value="${g.id}" ${g.id === exam.groupId ? "selected" : ""}>${escapeHTML(g.name)} (${g.code})</option>`).join("")
            : `<option value="">لا توجد مجموعات لهذه السنة</option>`}
        </select>
      </div>
    </div>
    <div class="form-grid">
      <div class="field">
        <label class="field__label">الدرجة النهائية</label>
        <input class="input" type="number" name="maxScore" min="1" value="${exam.maxScore}" required>
      </div>
      <div class="field">
        <label class="field__label">تاريخ الامتحان</label>
        <input class="input" type="date" name="date" value="${exam.date}" required>
      </div>
    </div>
  `;

  const result = await formModal({ title: "تعديل الامتحان", bodyHTML, submitText: "حفظ التعديلات", wide: true });
  if (!result) return;

  exam.title = result.title;
  exam.date = result.date;
  exam.gradeId = result.gradeId;
  exam.groupId = result.groupId;
  exam.maxScore = Number(result.maxScore);

  saveExams(exams);
  toast("تم تحديث الامتحان بنجاح", "success");
  renderExamsList();
  renderGradesPanel();
}

async function deleteExam(examId) {
  const exams = getExams();
  const exam = exams.find((e) => e.id === examId);
  if (!exam) return;

  const ok = await confirmDialog({
    title: "حذف الامتحان",
    body: `هل أنت متأكد من حذف "<strong>${escapeHTML(exam.title)}</strong>"؟<br>سيتم حذف جميع الدرجات المرتبطة به بشكل نهائى.`,
    confirmText: "حذف نهائى",
    tone: "danger",
  });
  if (!ok) return;

  saveExams(exams.filter((e) => e.id !== examId));
  if (selectedExamId === examId) {
    selectedExamId = null;
    renderGradesPanel();
  }
  toast("تم حذف الامتحان", "success");
  renderExamsList();
}

function updateGroupOptions(gradeId, selectedGroupId) {
  const groupSelect = document.getElementById("examGroupSelect");
  if (!groupSelect) return;
  const groups = getGroups();
  const filtered = gradeId ? groups.filter((g) => g.gradeId === gradeId) : [];
  groupSelect.innerHTML = filtered.length
    ? `<option value="">اختر المجموعة</option>` + filtered.map((g) => `<option value="${g.id}" ${g.id === selectedGroupId ? "selected" : ""}>${escapeHTML(g.name)} (${g.code})</option>`).join("")
    : `<option value="">لا توجد مجموعات لهذه السنة</option>`;
}
