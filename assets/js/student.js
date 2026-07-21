// =========================================================
// Student Detail — تفاصيل الطالب الكاملة + السجل الزمنى لكل حالاته
// =========================================================

import { initPage } from "./app.js";
import { icons } from "./icons.js";
import { getStudents, getAttendance, getPayments, getExams, getGrades, getGroups, getStudentStatuses, getExtraCharges } from "./storage.js";
import { escapeHTML, initials, formatMoney, formatDateAr } from "./helpers.js";
import { emptyStateHTML, whatsappPreviewDialog } from "./ui.js";
import { gradeName, groupName, findGroup } from "./lookups.js";
import { openWhatsApp } from "./whatsapp.js";
import { buildMonthlyFollowupMessage } from "./reports.js";

const content = await initPage("student");
if (content) render();

function render() {
  const id = new URLSearchParams(window.location.search).get("id");
  const student = getStudents().find((s) => s.id === id);

  if (!student) {
    content.innerHTML = `
      <div class="card card-pad">
        ${emptyStateHTML({
          icon: icons.users,
          title: "الطالب غير موجود",
          text: "قد يكون الطالب تم حذفه أو الرابط غير صحيح.",
        })}
        <div style="text-align:center;"><a class="btn btn-primary" href="students.html">${icons.arrowLeft} العودة لقائمة الطلاب</a></div>
      </div>
    `;
    return;
  }

  const grades = getGrades();
  const groups = getGroups();
  const statuses = getStudentStatuses();
  const group = findGroup(groups, student.groupId);

  const attendance = getAttendance().filter((a) => a.studentId === id).sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1));
  const payments = getPayments().filter((p) => p.studentId === id).sort((a, b) => (a.date < b.date ? 1 : -1));
  const exams = getExams()
    .flatMap((e) => e.results.filter((r) => r.studentId === id).map((r) => ({ ...r, title: e.title, date: e.date, maxScore: e.maxScore })))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const extraCharges = getExtraCharges()
    .filter((c) => c.studentId === id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const countByStatus = (statusId) => attendance.filter((a) => a.statusId === statusId).length;
  const presentCount = attendance.filter((a) => {
    const st = statuses.find((s) => s.id === a.statusId);
    return st?.presence === "present";
  }).length;
  const absentCount = attendance.filter((a) => {
    const st = statuses.find((s) => s.id === a.statusId);
    return st?.presence === "absent";
  }).length;
  const lastAttendance = attendance.find((a) => a.category === "attendance");
  const lastExam = exams[0];

  content.innerHTML = `
    <a href="students.html" class="btn btn-ghost btn-sm" style="margin-bottom:14px;">${icons.arrowLeft} العودة للطلاب</a>

    <div class="card card-pad" style="margin-bottom:22px;">
      <div class="flex-between" style="flex-wrap:wrap; gap:16px;">
        <div class="flex-gap">
          <div class="avatar-sm" style="width:58px;height:58px;font-size:18px;">${initials(student.name)}</div>
          <div>
            <div style="font-weight:800; font-size:19px;">${escapeHTML(student.name)}</div>
            <div class="text-muted" style="font-size:13.5px; margin-top:3px;">
              ${escapeHTML(gradeName(grades, student.gradeId))} · ${escapeHTML(groupName(groups, student.groupId))} ·
              <span class="code-pill">${escapeHTML(student.code || "-")}</span>
            </div>
          </div>
        </div>
        <div class="flex-gap" style="flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" id="contactParentBtn">${icons.whatsapp} مراسلة ولى الأمر</button>
          <button class="btn btn-success btn-sm" id="monthlyReportBtn">${icons.whatsapp} المتابعة الشهرية</button>
          <span class="badge ${student.status === "active" ? "badge-success" : "badge-neutral"}">${student.status === "active" ? "نشط" : "متوقف"}</span>
        </div>
      </div>
      <div class="divider"></div>
      <div class="grid-3">
        <div><div class="text-muted" style="font-size:12.5px;">هاتف الطالب</div><div style="font-weight:700; margin-top:3px;">${escapeHTML(student.phone)}</div></div>
        <div><div class="text-muted" style="font-size:12.5px;">هاتف ولى الأمر</div><div style="font-weight:700; margin-top:3px;">${escapeHTML(student.parentPhone)}</div></div>
        <div><div class="text-muted" style="font-size:12.5px;">تاريخ الانضمام</div><div style="font-weight:700; margin-top:3px;">${formatDateAr(student.joinDate)}</div></div>
        <div><div class="text-muted" style="font-size:12.5px;">وظيفة الأب</div><div style="font-weight:700; margin-top:3px;">${escapeHTML(student.fatherJob || "-")}</div></div>
        <div><div class="text-muted" style="font-size:12.5px;">اسم المدرسة</div><div style="font-weight:700; margin-top:3px;">${escapeHTML(student.school || "-")}</div></div>
      </div>
      ${group ? `<div class="field__hint" style="margin-top:14px;">سعر الحصة فى مجموعته: <strong>${formatMoney(group.sessionPrice)}</strong></div>` : ""}
    </div>

    <div class="stat-grid">
      ${statCard("tone-success", icons.check, presentCount, "مرات الحضور")}
      ${statCard("tone-danger", icons.x, absentCount, "مرات الغياب")}
      ${statCard("tone-warning", icons.alert, countByStatus("ST-CALL"), "استدعاءات ولى الأمر")}
      ${statCard("tone-primary", icons.money, formatMoney(student.lateBalance || 0), "متأخرات مالية")}
    </div>

    <div class="grid-2">
      <div class="card card-pad">
        <div class="card__head"><div class="card__title">السجل الزمنى الكامل (حضور / غياب / إجراءات)</div></div>
        ${
          attendance.length
            ? simpleTable(
                ["التاريخ", "الحالة", "الوقت"],
                attendance.slice(0, 12).map((a) => [formatDateAr(a.date), badgeFor(a, statuses), a.time])
              )
            : emptyStateHTML({ title: "لا يوجد سجل حضور" })
        }
      </div>

      <div class="card card-pad">
        <div class="card__head"><div class="card__title">سجل المدفوعات</div></div>
        ${
          payments.length
            ? simpleTable(
                ["التاريخ", "المبلغ", "الحالة"],
                payments.slice(0, 12).map((p) => [formatDateAr(p.date), formatMoney(p.amount), p.status === "paid" ? `<span class="badge badge-success">مدفوع</span>` : `<span class="badge badge-warning">غير مدفوع</span>`])
              )
            : emptyStateHTML({ title: "لا يوجد سجل مدفوعات" })
        }
      </div>
    </div>

    <div class="card card-pad" style="margin-top:18px;">
      <div class="card__head">
        <div class="card__title">نتائج الامتحانات</div>
        ${lastExam ? `<span class="badge badge-primary">آخر امتحان: ${escapeHTML(lastExam.title)}</span>` : ""}
      </div>
      ${
        exams.length
          ? simpleTable(
              ["الامتحان", "التاريخ", "الدرجة"],
              exams.map((e) => [escapeHTML(e.title), formatDateAr(e.date), `${e.score} / ${e.maxScore}`])
            )
          : emptyStateHTML({ icon: icons.chart, title: "لا توجد نتائج امتحانات بعد" })
      }
    </div>

    <div class="card card-pad" style="margin-top:18px;">
      <div class="card__head"><div class="card__title">استحقاقات مالية إضافية (خارج سعر الحصة)</div></div>
      ${
        extraCharges.length
          ? simpleTable(
              ["البند", "المبلغ", "التاريخ", "الحالة"],
              extraCharges.map((c) => [
                escapeHTML(c.name),
                formatMoney(c.amount),
                formatDateAr(c.date),
                c.status === "paid" ? `<span class="badge badge-success">مدفوع</span>` : `<span class="badge badge-warning">غير مدفوع</span>`,
              ])
            )
          : emptyStateHTML({ title: "لا توجد استحقاقات مالية إضافية" })
      }
    </div>
  `;

  document.getElementById("monthlyReportBtn").addEventListener("click", () => sendMonthlyReport(student, attendance, exams, extraCharges));
  document.getElementById("contactParentBtn").addEventListener("click", () => contactParent(student));
}

function statCard(tone, icon, value, label) {
  return `
    <div class="stat-card">
      <div class="stat-card__icon ${tone}">${icon}</div>
      <div class="stat-card__value">${value}</div>
      <div class="stat-card__label">${label}</div>
    </div>
  `;
}

function badgeFor(record, statuses) {
  const st = statuses.find((s) => s.id === record.statusId);
  return `<span class="badge badge-${st?.tone || "neutral"}"><span class="badge-dot"></span>${escapeHTML(st?.name || "-")}</span>`;
}

function simpleTable(headers, rows) {
  return `
    <div class="table-wrap">
      <table class="table">
        <thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

/** يبنى ويرسل تقرير المتابعة الشهرية (نفس الصيغة المستخدمة فى صفحة المتابعة بالظبط) عبر واتساب */
async function sendMonthlyReport(student, attendance, exams, extraCharges) {
  const defaultMessage = buildMonthlyFollowupMessage({ student, attendance, exams, extraCharges });

  const message = await whatsappPreviewDialog({
    title: "إرسال المتابعة الشهرية",
    recipientLabel: `ولى أمر ${student.name} (${student.parentPhone})`,
    defaultMessage,
  });
  if (!message) return;

  openWhatsApp(student.parentPhone, message);
}

/** مراسلة حرة لولى الأمر — نص مفتوح تمامًا، يكتب المستخدم أى رسالة يريدها */
async function contactParent(student) {
  const message = await whatsappPreviewDialog({
    title: "مراسلة ولى الأمر",
    recipientLabel: `ولى أمر ${student.name} (${student.parentPhone})`,
    defaultMessage: `عزيزى ولى أمر الطالب/ة ${student.name}،\n\n`,
  });
  if (!message) return;

  openWhatsApp(student.parentPhone, message);
}
