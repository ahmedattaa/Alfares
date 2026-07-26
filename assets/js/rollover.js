// =========================================================
// Rollover — معالج ترحيل الطلاب (ترحيل لعام جديد / ترحيل للترم الثاني)
// =========================================================

import { initPage } from "./app.js";
import { icons } from "./icons.js";
import {
  getStudents,
  saveStudents,
  getGrades,
  getGroups,
  getAcademicYears,
  getTerms,
  getAcademicMonths,
  getPayments,
  getAllPayments,
  savePayments,
  getAttendance,
  saveAttendance,
  getStudentStatuses,
} from "./storage.js";
import { escapeHTML, formatMoney, todayISO, generateId } from "./helpers.js";
import { toast, confirmDialog, emptyStateHTML } from "./ui.js";
import { gradeName, groupName, findGroup, dueAmount } from "./lookups.js";

const content = await initPage("rollover");
let rolloverMode = "year"; // "year" or "term"
let previewData = [];

if (content) render();

function render() {
  content.innerHTML = `
    <div class="page__header">
      <div>
        <div class="page__title">${icons.calendar} ترحيل الطلاب</div>
        <div class="page__subtitle">نقل الطلاب لمجموعات جديدة مع ترحيل المديونيات</div>
      </div>
    </div>

    <div class="rollover-modes">
      <label class="rollover-mode-card ${rolloverMode === "year" ? "is-active" : ""}">
        <input type="radio" name="rolloverMode" value="year" ${rolloverMode === "year" ? "checked" : ""}>
        <div class="rollover-mode-card__icon" style="background:#6366f1;">📅</div>
        <div class="rollover-mode-card__content">
          <div class="rollover-mode-card__title">ترحيل لعام جديد</div>
          <div class="rollover-mode-card__desc">تغيير السنة الدراسية + المجموعة + ترحيل المديونيات كرصيد افتتاحي</div>
        </div>
        <div class="rollover-mode-card__check">${rolloverMode === "year" ? icons.check : ""}</div>
      </label>
      <label class="rollover-mode-card ${rolloverMode === "term" ? "is-active" : ""}">
        <input type="radio" name="rolloverMode" value="term" ${rolloverMode === "term" ? "checked" : ""}>
        <div class="rollover-mode-card__icon" style="background:#059669;">🔄</div>
        <div class="rollover-mode-card__content">
          <div class="rollover-mode-card__title">ترحيل للترم الثاني</div>
          <div class="rollover-mode-card__desc">نفس السنة + نقل الطلاب من مجموعات الترم الأول للترم الثاني</div>
        </div>
        <div class="rollover-mode-card__check">${rolloverMode === "term" ? icons.check : ""}</div>
      </label>
    </div>

    <div id="rolloverContent"></div>
  `;

  content.querySelectorAll('input[name="rolloverMode"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      rolloverMode = e.target.value;
      previewData = [];
      render();
    });
  });

  renderRolloverContent();
}

function renderRolloverContent() {
  const box = document.getElementById("rolloverContent");
  if (!box) return;

  if (rolloverMode === "year") {
    renderYearRollover(box);
  } else {
    renderTermRollover(box);
  }
}

/* ================= ترحيل لعام جديد ================= */
function renderYearRollover(box) {
  const students = getStudents().filter((s) => s.status === "active");
  const grades = getGrades().sort((a, b) => a.order - b.order);
  const groups = getGroups();

  if (!students.length) {
    box.innerHTML = emptyStateHTML({ icon: icons.users, title: "لا يوجد طلاب نشطون للترحيل" });
    return;
  }

  // بناء خريطة الدرجات
  const gradeOrder = {};
  grades.forEach((g) => (gradeOrder[g.id] = g.order));

  // تحديد السنة التالية لكل طالب
  const rows = students.map((s) => {
    const currentGrade = grades.find((g) => g.id === s.gradeId);
    const currentGroup = findGroup(groups, s.groupId);
    const nextGrade = grades.find((g) => g.order === (currentGrade?.order || 0) + 1);
    const nextGroups = nextGrade ? groups.filter((g) => g.gradeId === nextGrade.id) : [];
    const lateBalance = Number(s.lateBalance || 0);

    return {
      student: s,
      currentGrade,
      currentGroup,
      nextGrade,
      nextGroups,
      selectedGroupId: nextGroups[0]?.id || "",
      lateBalance,
    };
  });

  const totalLate = rows.reduce((sum, r) => sum + r.lateBalance, 0);

  box.innerHTML = `
    <div class="card card-pad" style="margin-bottom:16px;">
      <div class="card__head">
        <div class="card__title">معاينة الترحيل (${rows.length} طالب)</div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-outline btn-sm" id="selectAllBtn">تحديد الكل</button>
          <button class="btn btn-primary btn-sm" id="executeYearBtn">${icons.check} تنفيذ الترحيل</button>
        </div>
      </div>
      ${totalLate > 0 ? `<div class="field__hint" style="margin-bottom:12px; color:var(--warning);">⚠️ يوجد ${formatMoney(totalLate)} متأخرات سيتم ترحيلها كرصيد افتتاحي</div>` : ""}
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th style="width:36px;"><input type="checkbox" id="selectAllCb" style="width:16px;height:16px;cursor:pointer;"></th>
              <th>الطالب</th>
              <th>السنة الحالية</th>
              <th>المجموعة الحالية</th>
              <th>→</th>
              <th>السنة التالية</th>
              <th>المجموعة الجديدة</th>
              <th>المتأخرات</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r, idx) => `
              <tr data-idx="${idx}">
                <td><input type="checkbox" class="rolloverCb" data-idx="${idx}" checked style="width:16px;height:16px;cursor:pointer;"></td>
                <td>
                  <div class="cell-user">
                    <div class="avatar-sm">${escapeHTML((r.student.name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2))}</div>
                    <div class="cell-user__name">${escapeHTML(r.student.name)}</div>
                  </div>
                </td>
                <td><span class="badge badge-primary">${escapeHTML(r.currentGrade?.name || "—")}</span></td>
                <td class="text-muted">${escapeHTML(r.currentGroup?.name || "—")}</td>
                <td style="font-size:18px;">→</td>
                <td>
                  ${r.nextGrade
                    ? `<span class="badge badge-success">${escapeHTML(r.nextGrade.name)}</span>`
                    : `<span class="badge badge-danger">آخر سنة</span>`
                  }
                </td>
                <td>
                  ${r.nextGroups.length
                    ? `<select class="select groupSelect" data-idx="${idx}" style="max-width:200px; font-size:12px;">
                        ${r.nextGroups.map((g) => `<option value="${g.id}" ${g.id === r.selectedGroupId ? "selected" : ""}>${escapeHTML(g.name)} (${g.code})</option>`).join("")}
                       </select>`
                    : `<span class="text-muted">—</span>`
                  }
                </td>
                <td style="font-weight:700; ${r.lateBalance > 0 ? "color:var(--danger);" : ""}">${r.lateBalance > 0 ? formatMoney(r.lateBalance) : "—"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // حفظ بيانات المعاينة
  previewData = rows;

  // أحداث التحديد
  document.getElementById("selectAllCb").addEventListener("change", (e) => {
    document.querySelectorAll(".rolloverCb").forEach((cb) => (cb.checked = e.target.checked));
  });

  document.getElementById("selectAllBtn").addEventListener("click", () => {
    document.querySelectorAll(".rolloverCb").forEach((cb) => (cb.checked = true));
    document.getElementById("selectAllCb").checked = true;
  });

  // تحديث المجموعة المحددة
  box.querySelectorAll(".groupSelect").forEach((sel) => {
    sel.addEventListener("change", (e) => {
      const idx = Number(e.target.dataset.idx);
      previewData[idx].selectedGroupId = e.target.value;
    });
  });

  // زر التنفيذ
  document.getElementById("executeYearBtn").addEventListener("click", executeYearRollover);
}

async function executeYearRollover() {
  const selectedIdxs = [...document.querySelectorAll(".rolloverCb:checked")].map((cb) => Number(cb.dataset.idx));
  if (!selectedIdxs.length) {
    toast("لم تحدد أي طالب للترحيل", "warning");
    return;
  }

  const selectedRows = selectedIdxs.map((i) => previewData[i]);
  const totalStudents = selectedRows.length;
  const totalLate = selectedRows.reduce((sum, r) => sum + r.lateBalance, 0);

  const ok = await confirmDialog({
    title: "تأكيد ترحيل الطلاب لعام جديد",
    body: `هيتم ترحيل <strong>${totalStudents}</strong> طالب للسنة الأكاديمية التالية.${totalLate > 0 ? `<br><br>⚠️ سيتم ترحيل <strong>${formatMoney(totalLate)}</strong> متأخرات كرصيد افتتاحي.` : ""}<br><br>هل أنت متأكد؟`,
    confirmText: "تنفيذ الترحيل",
    tone: "success",
  });
  if (!ok) return;

  const students = getStudents();
  let updatedCount = 0;

  selectedRows.forEach((row) => {
    const student = students.find((s) => s.id === row.student.id);
    if (!student) return;

    // تغيير السنة الدراسية والمجموعة
    if (row.nextGrade) {
      student.gradeId = row.nextGrade.id;
    }
    if (row.selectedGroupId) {
      student.groupId = row.selectedGroupId;
    }

    // ترحيل المديونيات كرصيد افتتاحي
    if (row.lateBalance > 0) {
      student.lateBalance = row.lateBalance;
      student.openingBalance = (student.openingBalance || 0) + row.lateBalance;
      student.openingBalanceNote = `ترحيل من ${row.currentGrade?.name || ""} — ${todayISO()}`;
    }

    updatedCount++;
  });

  saveStudents(students);
  toast(`تم ترحيل ${updatedCount} طالب بنجاح ✓`, "success");
  render();
}

/* ================= ترحيل للترم الثاني ================= */
function renderTermRollover(box) {
  const students = getStudents().filter((s) => s.status === "active");
  const grades = getGrades().sort((a, b) => a.order - b.order);
  const groups = getGroups();

  // التحقق من وجود الترم الثاني
  const allTerms = getTerms();
  const years = getAcademicYears();
  const currentYear = years.find((y) => y.isCurrent);
  const term2 = allTerms.find((t) => t.yearId === currentYear?.id && t.order === 2);

  if (!students.length) {
    box.innerHTML = emptyStateHTML({ icon: icons.users, title: "لا يوجد طلاب نشطون للترحيل" });
    return;
  }

  // بناء خريطة المجموعات: gradeId → { term1Groups, term2Groups }
  const gradeGroupsMap = {};
  grades.forEach((g) => {
    gradeGroupsMap[g.id] = {
      term1Groups: groups.filter((grp) => grp.gradeId === g.id),
      term2Groups: [], // هتتملأ لو فيه مجموعات للترم الثاني
    };
  });

  // تحديد المجموعات المناظرة (نفس السنة + نفس الوقت تقريبًا)
  const rows = students.map((s) => {
    const currentGrade = grades.find((g) => g.id === s.gradeId);
    const currentGroup = findGroup(groups, s.groupId);
    const gradeGroups = gradeGroupsMap[s.gradeId] || { term1Groups: [], term2Groups: [] };

    // المجموعة المناظرة: نفس الوقت أو الأقرب
    let matchedGroupId = "";
    if (currentGroup) {
      const match = gradeGroups.term1Groups.find(
        (g) => g.id !== s.groupId && g.time === currentGroup.time
      );
      matchedGroupId = match?.id || gradeGroups.term1Groups.find((g) => g.id !== s.groupId)?.id || "";
    }

    return {
      student: s,
      currentGrade,
      currentGroup,
      matchedGroupId,
      allGroups: gradeGroups.term1Groups.filter((g) => g.id !== s.groupId),
    };
  });

  box.innerHTML = `
    <div class="card card-pad" style="margin-bottom:16px;">
      <div class="card__head">
        <div class="card__title">معاينة الترحيل للترم الثاني (${rows.length} طالب)</div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-outline btn-sm" id="selectAllBtn">تحديد الكل</button>
          <button class="btn btn-primary btn-sm" id="executeTermBtn">${icons.check} تنفيذ الترحيل</button>
        </div>
      </div>
      <div class="field__hint" style="margin-bottom:12px;">
        هتنقل الطلاب من مجموعاتهم الحالية (الترم الأول) لمجموعات مناظرة بنفس السنة الدراسية.
        <strong style="color:var(--warning);">المتأخرات مش هتتzer</strong> — لو الطالب مش هيكمل، الغِ تحديده وهيتوقف تلقائيًا.
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th style="width:36px;"><input type="checkbox" id="selectAllCb" style="width:16px;height:16px;cursor:pointer;"></th>
              <th>الطالب</th>
              <th>المجموعة الحالية</th>
              <th>→</th>
              <th>المجموعة الجديدة (الترم الثاني)</th>
              <th>المتأخرات</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r, idx) => {
              const debt = Number(r.student.lateBalance || 0);
              return `
              <tr data-idx="${idx}">
                <td><input type="checkbox" class="rolloverCb" data-idx="${idx}" checked style="width:16px;height:16px;cursor:pointer;"></td>
                <td>
                  <div class="cell-user">
                    <div class="avatar-sm">${escapeHTML((r.student.name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2))}</div>
                    <div class="cell-user__name">${escapeHTML(r.student.name)}</div>
                  </div>
                </td>
                <td class="text-muted">${escapeHTML(r.currentGroup?.name || "—")}</td>
                <td style="font-size:18px;">→</td>
                <td>
                  ${r.allGroups.length
                    ? `<select class="select groupSelect" data-idx="${idx}" style="max-width:220px; font-size:12px;">
                        <option value="">— بدون تغيير —</option>
                        ${r.allGroups.map((g) => `<option value="${g.id}" ${g.id === r.matchedGroupId ? "selected" : ""}>${escapeHTML(g.name)} (${g.code})</option>`).join("")}
                       </select>`
                    : `<span class="text-muted">لا توجد مجموعات أخرى</span>`
                  }
                </td>
                <td style="font-weight:700; ${debt > 0 ? "color:var(--danger);" : ""}">${debt > 0 ? formatMoney(debt) : "—"}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  previewData = rows;

  document.getElementById("selectAllCb").addEventListener("change", (e) => {
    document.querySelectorAll(".rolloverCb").forEach((cb) => (cb.checked = e.target.checked));
  });

  document.getElementById("selectAllBtn").addEventListener("click", () => {
    document.querySelectorAll(".rolloverCb").forEach((cb) => (cb.checked = true));
    document.getElementById("selectAllCb").checked = true;
  });

  box.querySelectorAll(".groupSelect").forEach((sel) => {
    sel.addEventListener("change", (e) => {
      const idx = Number(e.target.dataset.idx);
      previewData[idx].matchedGroupId = e.target.value;
    });
  });

  document.getElementById("executeTermBtn").addEventListener("click", executeTermRollover);
}

async function executeTermRollover() {
  const selectedIdxs = [...document.querySelectorAll(".rolloverCb:checked")].map((cb) => Number(cb.dataset.idx));
  if (!selectedIdxs.length) {
    toast("لم تحدد أي طالب للترحيل", "warning");
    return;
  }

  const selectedRows = selectedIdxs.filter((i) => previewData[i].matchedGroupId).map((i) => previewData[i]);
  const skippedRows = selectedIdxs.filter((i) => !previewData[i].matchedGroupId);

  // الطلاب اللي اتلغى تحديدهم = تصفية حسابات (Drop-out)
  const allIdxs = previewData.map((_, i) => i);
  const uncheckedIdxs = allIdxs.filter((i) => !selectedIdxs.includes(i));
  const uncheckedRows = uncheckedIdxs.map((i) => previewData[i]);

  if (!selectedRows.length && !uncheckedRows.length) {
    toast("لم تحدد أي طالب لمجموعة جديدة", "warning");
    return;
  }

  // بناء رسالة التأكيد
  let bodyParts = [];
  if (selectedRows.length) {
    bodyParts.push(`هيتم ترحيل <strong>${selectedRows.length}</strong> طالب لمجموعات الترم الثاني.`);
  }
  if (skippedRows.length) {
    bodyParts.push(`<span style="color:var(--warning);">(${skippedRows.length} طالب مش هيتم ترحيلهم لأنهم لم يحددوا مجموعة جديدة)</span>`);
  }
  if (uncheckedRows.length) {
    bodyParts.push(`<br>⚠️ <strong>${uncheckedRows.length}</strong> طالب هيتحول حالتهم لـ <strong>"متوقف"</strong> (تصفية حسابات):`);
    bodyParts.push(`<div style="margin:8px 16px; padding:10px 14px; background:var(--bg); border-radius:8px; font-size:12.5px; line-height:1.8;">`);
    uncheckedRows.forEach((r) => {
      const debt = Number(r.student.lateBalance || 0);
      const name = escapeHTML(r.student.name);
      bodyParts.push(debt > 0
        ? `${name} — متأخرات: <strong style="color:var(--danger);">${formatMoney(debt)}</strong> ج.م`
        : `${name} — لا يوجد متأخرات`
      );
    });
    bodyParts.push(`</div>`);
    bodyParts.push(`<small style="color:var(--muted);">مديونياتهم هتفضل ظاهرة في شاشة "المتأخرات" للضغط عليهم للدفع.</small>`);
  }

  const hasDropouts = uncheckedRows.length > 0;
  const ok = await confirmDialog({
    title: "تأكيد ترحيل الطلاب للترم الثاني",
    body: bodyParts.join("<br>"),
    confirmText: hasDropouts ? "تنفيذ الترحيل + توقف الملغين" : "تنفيذ الترحيل",
    tone: hasDropouts ? "warning" : "success",
  });
  if (!ok) return;

  const students = getStudents();
  let movedCount = 0;
  let pausedCount = 0;

  // نقل الطلاب للمجموعات الجديدة (ترحيل للترم الثاني)
  selectedRows.forEach((row) => {
    const student = students.find((s) => s.id === row.student.id);
    if (!student) return;
    student.groupId = row.matchedGroupId;
    movedCount++;
  });

  // إيقاف الطلاب الملغي تحديدهم (تصفية حسابات)
  uncheckedRows.forEach((row) => {
    const student = students.find((s) => s.id === row.student.id);
    if (!student) return;
    student.status = "paused";
    pausedCount++;
  });

  saveStudents(students);

  // رسالة النجاح
  let successMsg = "";
  if (movedCount) successMsg += `تم ترحيل ${movedCount} طالب للترم الثاني`;
  if (pausedCount) successMsg += `${successMsg ? " • " : ""}تم إيقاف ${pausedCount} طالب (تصفية حسابات)`;
  toast(`${successMsg} ✓`, "success");
  render();
}
