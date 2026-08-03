// =========================================================
// Student Detail — تفاصيل الطالب الكاملة + السجل الزمنى لكل حالاته
// =========================================================

import { initPage } from "./app.js";
import { icons } from "./icons.js";
import { getStudents, saveStudents, getAttendance, getPayments, getExams, getGrades, getGroups, getStudentStatuses, getExtraCharges, getLedgerEntries, getWalletTransactions, getAchievementsForStudent, getAdvancePermissionsForStudent, addAdvancePermission, deleteAdvancePermission, getSession, isFeatureEnabled, getSkillMasteryAllForStudent, findParentAccount, setParentActivationCode, getSettings, isStudentPortalEnabled, isParentPortalEnabled, findStudentAccount, setStudentPassword, setStudentUsername } from "./storage.js";
import { escapeHTML, initials, formatMoney, formatDateAr, todayISO, generateId, compressImage, studentAvatar } from "./helpers.js";
import { emptyStateHTML, toast, whatsappPreviewDialog, formModal, confirmDialog } from "./ui.js";
import { gradeName, groupName, findGroup, statusesByCategory } from "./lookups.js";
import { openWhatsApp } from "./whatsapp.js";
import { buildMonthlyFollowupMessage } from "./reports.js";
import { recordActionStatus } from "./attendance-service.js";
import { computeHealthScore, getHealthColor, getHealthLabel, healthScoreHTML, healthBarHTML } from "./health-score.js";
import { getTypeMeta } from "./achievement-engine.js";
import { renderTemplate } from "./whatsapp-templates.js";
import { openCollectionDialog } from "./collection-dialog.js";
import { canPerformAction } from "./permissions.js";
import { buildErrorNotebook, notebookStats } from "./error-notebook.js";

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
          <div class="std-photo-wrap">
            ${studentAvatar(student, 64)}
            <button class="std-photo-btn" id="photoBtn" title="تغيير صورة الطالب">${icons.edit}</button>
            <input type="file" id="photoInput" accept="image/*" hidden>
          </div>
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
          ${student.parentPhone ? `<a class="btn btn-outline btn-sm" href="tel:${student.parentPhone}" style="text-decoration:none;">${icons.phone} اتصال بولي الأمر</a>` : ""}
          ${canPerformAction(getSession(), "students", "exceptional_action") ? `<button class="btn btn-danger btn-sm" id="actionBtn">${icons.alert} اتخاذ إجراء استثنائى</button>` : ""}
          <span class="badge ${student.status === "active" ? "badge-success" : "badge-neutral"}">${student.status === "active" ? "نشط" : "متوقف"}</span>
        </div>
      </div>
      ${student.dataStatus === "minimal" ? `
        <div class="divider"></div>
        <div class="incomplete-banner">
          <span>📝 بيانات الطالب غير مكتملة — أضيف عن طريق الإدخال السريع. <a href="student-form.html?id=${id}" style="color:#92400e;font-weight:800;">اضغط هنا لإكمال البيانات</a></span>
        </div>
      ` : ""}
      ${renderAdvancePermissions(id)}
      <div class="divider"></div>
      <div class="grid-3">
        <div><div class="text-muted" style="font-size:12.5px;">هاتف الطالب</div><div style="font-weight:700; margin-top:3px;">${escapeHTML(student.phone)}</div></div>
        <div><div class="text-muted" style="font-size:12.5px;">هاتف ولى الأمر</div><div style="font-weight:700; margin-top:3px;">${escapeHTML(student.parentPhone)}</div></div>
        <div><div class="text-muted" style="font-size:12.5px;">تاريخ الانضمام</div><div style="font-weight:700; margin-top:3px;">${formatDateAr(student.joinDate)}</div></div>
        <div><div class="text-muted" style="font-size:12.5px;">وظيفة الأب</div><div style="font-weight:700; margin-top:3px;">${escapeHTML(student.fatherJob || "-")}</div></div>
        <div><div class="text-muted" style="font-size:12.5px;">اسم المدرسة</div><div style="font-weight:700; margin-top:3px;">${escapeHTML(student.school || "-")}</div></div>
      </div>
      ${isParentPortalEnabled() ? renderParentAuthCard(student) : ""}
      ${isStudentPortalEnabled() ? renderStudentAuthCard(student) : ""}
      ${group ? `<div class="field__hint" style="margin-top:14px;">سعر الحصة فى مجموعته: <strong>${formatMoney(group.sessionPrice)}</strong></div>` : ""}
    </div>

    <div class="stat-grid">
      ${(() => { const h = computeHealthScore(id); const color = getHealthColor(h.total); return `
        <div class="stat-card" style="grid-column:1/-1; display:flex; align-items:center; gap:16px; padding:16px 20px; border:2px solid var(--${color}); background:color-mix(in srgb, var(--${color}) 6%, transparent);">
          ${healthScoreHTML(h.total, 56)}
          <div style="flex:1;">
            <div style="font-weight:800; font-size:16px; color:var(--${color});">صحة الطالب — ${getHealthLabel(h.total)}</div>
            <div style="margin-top:6px;">${healthBarHTML(h.total, 8)}</div>
            <div style="display:flex; gap:16px; margin-top:8px; font-size:12px; color:var(--muted); flex-wrap:wrap;">
              <span>حضور: <strong style="color:var(--text);">${h.attendanceRate}%</strong></span>
              ${h.hasExams ? `<span>درجات: <strong style="color:var(--text);">${h.examAvg}%</strong> <span class="text-muted">(${h.examCount} امتحان)</span></span>` : `<span class="text-muted">بدون امتحانات</span>`}
              <span>سلوكي: <strong style="color:var(--text);">${h.behaviorScore}/20</strong></span>
            </div>
          </div>
        </div>
      `; })()}
      ${statCard("tone-success", icons.check, presentCount, "مرات الحضور")}
      ${statCard("tone-danger", icons.x, absentCount, "مرات الغياب")}
      ${statCard("tone-warning", icons.alert, countByStatus("ST-CALL"), "استدعاءات ولى الأمر")}
      ${(student.lateBalance || 0) > 0 && canPerformAction(getSession(), "students", "collection") ? `
      <div class="stat-card" style="cursor:pointer;" id="collectDebtBtn">
        <div class="stat-card__icon tone-primary">${icons.money}</div>
        <div class="stat-card__value">${formatMoney(student.lateBalance || 0)}</div>
        <div class="stat-card__label">متأخرات مالية — اضغط للتحصيل</div>
      </div>` : statCard("tone-primary", icons.money, formatMoney(student.lateBalance || 0), "متأخرات مالية")}
      ${(student.walletBalance || 0) > 0 ? statCard("tone-success", icons.wallet, formatMoney(student.walletBalance), "رصيد المحفظة") : ""}
    </div>

    ${renderMasteryCard(id)}

    <div class="grid-2">
      <div class="card card-pad">
        <div class="card__head"><div class="card__title">السجل الزمنى الكامل (حضور / غياب / إجراءات)</div></div>
        ${
          attendance.length
            ? `<div class="table-wrap"><table class="table">
                <thead><tr><th>التاريخ</th><th>الحالة</th><th>الوقت</th><th>ملاحظة</th></tr></thead>
                <tbody>${attendance.slice(0, 12).map((a) => {
                  const st = statuses.find((s) => s.id === a.statusId);
                  const isAction = a.category === "action";
                  return `<tr>
                    <td>${formatDateAr(a.date)}</td>
                    <td><span class="badge badge-${st?.tone || "neutral"}"><span class="badge-dot"></span>${escapeHTML(st?.name || "-")}</span></td>
                    <td>${a.time}</td>
                    <td>${isAction && a.note ? `<span style="font-size:12px; color:var(--muted);">${escapeHTML(a.note)}</span>` : ""}</td>
                  </tr>`;
                }).join("")}</tbody>
              </table></div>`
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
              exams.map((e) => [escapeHTML(e.title), formatDateAr(e.date), e.absent ? `<span class="badge ${e.excused ? "badge-primary" : "badge-neutral"}">${e.excused ? "📋 غائب بإذن" : "غائب"}</span>` : `${e.score} / ${e.maxScore}`])
            )
          : emptyStateHTML({ icon: icons.chart, title: "لا توجد نتائج امتحانات بعد" })
      }
    </div>

    ${(() => {
      const achievements = getAchievementsForStudent(id);
      if (!achievements.length) return "";
      return `
        <div class="card card-pad" style="margin-top:18px; border:2px solid var(--success);">
          <div class="card__head">
            <div class="card__title" style="color:var(--success);">${icons.shield} الإنجازات الأكاديمية</div>
            <span class="badge badge-success">${achievements.length} إنجاز</span>
          </div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${achievements.map((a) => {
              const meta = getTypeMeta(a.type);
              return `
                <div style="display:flex; align-items:center; gap:10px; padding:10px 12px; background:var(--bg); border-radius:var(--r-md); border:1px solid var(--border);">
                  <span style="font-size:20px;">${meta.icon}</span>
                  <div style="flex:1;">
                    <div style="font-weight:700; font-size:13px;">${meta.label} — ${escapeHTML(a.examTitle || "")}</div>
                    <div style="font-size:12px; color:var(--muted);">${formatDateAr(a.date)}${a.oldAvg ? ` · كان ${a.nowAbove || a.oldAvg}% → ${a.newPct}%` : ""}</div>
                  </div>
                  <span class="badge badge-${meta.color}">${a.newPct}%</span>
                  ${a.sent ? `<span style="font-size:11px; color:var(--success);">${icons.check} مرسل</span>` : ""}
                </div>
              `;
            }).join("")}
          </div>
        </div>
      `;
    })()}

    ${isFeatureEnabled("extraCharges") ? `
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
    </div>` : ""}

    ${renderStudentLedger(student)}
  `;

  document.getElementById("monthlyReportBtn").addEventListener("click", () => sendMonthlyReport(student, attendance, exams, extraCharges));
  document.getElementById("contactParentBtn").addEventListener("click", () => contactParent(student));
  document.getElementById("parentAuthBtn")?.addEventListener("click", () => openParentAuthModal(student));
  document.getElementById("studentAuthBtn")?.addEventListener("click", () => openStudentAuthModal(student));

  const photoBtn = document.getElementById("photoBtn");
  const photoInput = document.getElementById("photoInput");
  if (photoBtn) photoBtn.addEventListener("click", () => photoInput?.click());
  if (photoInput) {
    photoInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const dataUrl = await compressImage(file);
        const students = getStudents();
        const st = students.find((s) => s.id === id);
        if (!st) { toast("تعذر تحديث الصورة", "danger"); return; }
        st.photo = dataUrl;
        saveStudents(students);
        toast("تم تحديث صورة الطالب ✓", "success");
        render();
      } catch (err) {
        toast("تعذر قراءة الصورة — جرّب صورة أصغر", "danger");
      }
    });
  }
  if (canPerformAction(getSession(), "students", "exceptional_action")) {
    document.getElementById("actionBtn")?.addEventListener("click", () => openActionModal(student));
  }

  document.getElementById("addAdvancePermBtn")?.addEventListener("click", () => openAdvancePermForm(student));
  if (canPerformAction(getSession(), "students", "collection")) {
    document.getElementById("collectDebtBtn")?.addEventListener("click", () => openCollectionDialog(student.id, { onClose: render }));
  }
  document.querySelectorAll(".deleteAdvancePermBtn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const ok = await confirmDialog({ title: "حذف إذن مسبق", body: "هل أنت متأكد من حذف هذا الإذن؟", confirmText: "حذف", tone: "danger" });
      if (!ok) return;
      deleteAdvancePermission(btn.dataset.id);
      toast("تم حذف الإذن المسبق", "success");
      render();
    });
  });
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

/* ── علاج الأخطاء — مهارات الطالب ── */
function renderMasteryCard(studentId) {
  // بوابة الطالب مقفولة → الطالب مش بيحل → الكارت بالكامل مش منطقي
  if (!isStudentPortalEnabled()) return "";
  const nb = buildErrorNotebook(studentId);
  const st = notebookStats(nb);
  const recs = getSkillMasteryAllForStudent(studentId)
    .slice()
    .sort((a, b) => {
      const o = { cured: 3, treating: 1, escalated: 0 };
      return (o[b.status] ?? 1) - (o[a.status] ?? 1);
    });

  if (!recs.length && !nb.length) return "";

  const statusMeta = {
    cured: { label: "متقنة ✓", tone: "success", dot: "✅" },
    treating: { label: "قيد العلاج", tone: "warning", dot: "🔄" },
    escalated: { label: "محتاجة تدخل", tone: "danger", dot: "🔴" },
  };

  const rows = recs
    .map((r) => {
      const m = statusMeta[r.status] || statusMeta.treating;
      const due = r.status === "treating" && r.retestDue ? `<span style="font-size:11px; color:var(--muted);">تأكيد ${formatDateAr(r.retestDue)}</span>` : "";
      return `
        <div style="display:flex; align-items:center; gap:8px; padding:7px 0; font-size:13px; border-bottom:1px dashed var(--border);">
          <span>${m.dot}</span>
          <strong>${escapeHTML(r.skillId)}</strong>
          <span class="badge badge-${m.tone}" style="margin-right:auto;"><span class="badge-dot"></span>${m.label}</span>
          ${due}
        </div>`;
    })
    .join("");

  return `
    <div class="card card-pad" style="margin-top:22px; border:2px solid var(--primary); border-right:6px solid var(--primary);">
      <div class="card__head">
        <div class="card__title">🧠 علاج الأخطاء — إتقان المهارات</div>
        <span style="font-size:12px; color:var(--muted);">${st.total} خطأ · نسبة العلاج ${st.treatmentRate}%</span>
      </div>
      <div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:12px;">
        ${st.newCount ? `<div style="display:flex; align-items:center; gap:6px; font-size:13px;"><span style="width:10px; height:10px; border-radius:50%; background:var(--info);"></span><strong style="color:var(--info);">${st.newCount}</strong><span class="text-muted">جديد</span></div>` : ""}
        ${st.inTreatment ? `<div style="display:flex; align-items:center; gap:6px; font-size:13px;"><span style="width:10px; height:10px; border-radius:50%; background:var(--warning);"></span><strong style="color:var(--warning);">${st.inTreatment}</strong><span class="text-muted">قيد العلاج</span></div>` : ""}
        ${st.repeated ? `<div style="display:flex; align-items:center; gap:6px; font-size:13px;"><span style="width:10px; height:10px; border-radius:50%; background:var(--danger);"></span><strong style="color:var(--danger);">${st.repeated}</strong><span class="text-muted">متكرر</span></div>` : ""}
        ${st.treated ? `<div style="display:flex; align-items:center; gap:6px; font-size:13px;"><span style="width:10px; height:10px; border-radius:50%; background:var(--success);"></span><strong style="color:var(--success);">${st.treated}</strong><span class="text-muted">معالَج</span></div>` : ""}
      </div>
      <div>${rows || emptyStateHTML({ icon: icons.check, title: "لا توجد مهارات في خطة العلاج", text: "الطالب بيجاوب صح من أول مرة — ممتاز!" })}</div>
    </div>
  `;
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

/* ── بوابة ولي الأمر — كود التفعيل / تصفير ── */
function renderParentAuthCard(student) {
  if (!student.parentPhone) {
    return `
      <div style="margin-top:16px; padding:14px; background:var(--bg); border:1px solid var(--border); border-radius:var(--r-md); display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
        <span style="font-size:18px;">🔑</span>
        <div style="flex:1; min-width:180px;">
          <div style="font-weight:700; font-size:13.5px; display:flex; align-items:center; gap:8px;">بوابة ولي الأمر <span class="badge badge-neutral">بدون رقم</span></div>
          <div style="font-size:12.5px; color:var(--muted); margin-top:3px;">مفيش رقم ولي أمر مسجل — عدّل بيانات الطالب لتفعيل البوابة.</div>
        </div>
      </div>
    `;
  }

  const account = findParentAccount(student.parentPhone);
  let statusBadge, statusText, btnLabel;
  if (account?.parentPassHash) {
    statusBadge = `<span class="badge badge-success"><span class="badge-dot"></span>كلمة مرور مفعّلة</span>`;
    statusText = "ولى الأمر اختار كلمة مروره — بيدخل برقم الهاتف + كلمته مباشرة. التصفير يرجع البوابة لأول مرة (كود تفعيل جديد).";
    btnLabel = "تصفير وإعادة كود التفعيل";
  } else if (account?.parentActivationHash) {
    statusBadge = `<span class="badge badge-warning"><span class="badge-dot"></span>كود تفعيل مفعّل</span>`;
    statusText = "أول دخول: رقم الهاتف + الكود → يختار ولي الأمر كلمة مروره. الكود على الرقم ويصلح لكل الأبناء المسجلين عليه.";
    btnLabel = "تجديد الكود";
  } else {
    statusBadge = `<span class="badge badge-neutral"><span class="badge-dot"></span>غير مفعّل</span>`;
    statusText = "ولى الأمر مش هيقدر يدخل البوابة لحد ما تولّد كود تفعيل وتوصله.";
    btnLabel = "توليد كود الدخول";
  }

  return `
    <div style="margin-top:16px; padding:14px; background:var(--bg); border:1px solid var(--border); border-radius:var(--r-md); display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
      <span style="font-size:18px;">🔑</span>
      <div style="flex:1; min-width:180px;">
        <div style="font-weight:700; font-size:13.5px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">بوابة ولي الأمر ${statusBadge}</div>
        <div style="font-size:12.5px; color:var(--muted); margin-top:3px;">${statusText}</div>
      </div>
      <button class="btn btn-outline btn-sm" id="parentAuthBtn">${icons.shield} ${btnLabel}</button>
    </div>
  `;
}

async function openParentAuthModal(student) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const centerName = getSettings().centerName || "السنتر";
  const whatsappMsg = `أهلاً ولي أمر ${student.name} 👋\n\nتفعيل بوابة المتابعة على ${centerName}:\n\n• رقم الهاتف: ${student.parentPhone}\n• كود الدخول المبدئي: ${code}\n\nأول مرة بيدخل بالكود ده وبعدها يختار كلمة مروره.\n\n${centerName}`;

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__head"><div class="modal__title">${icons.shield} كود دخول ولي الأمر — ${escapeHTML(student.name)}</div></div>
      <div class="modal__body">
        <p style="font-size:13px; color:var(--muted); line-height:1.7;">الكود على رقم التليفون ويصلح لكل الأبناء المسجلين عليه. أول دخول بالكود ده، وبعدها يختار ولي الأمر كلمة مروره.</p>
        <div style="display:flex; align-items:center; justify-content:center; gap:12px; margin:16px 0; flex-wrap:wrap;">
          <code style="font-size:30px; font-weight:800; letter-spacing:8px; direction:ltr; background:var(--surface); padding:12px 20px; border-radius:var(--r-md); border:1px dashed var(--primary);">${code}</code>
          <button type="button" class="btn btn-outline btn-sm" id="copyParentCodeBtn" style="flex-shrink:0;">📋 نسخ</button>
        </div>
      </div>
      <div class="modal__actions" style="flex-wrap:wrap;">
        <button type="button" class="btn btn-outline" id="parentCodeCancel">إلغاء</button>
        <button type="button" class="btn btn-success" id="parentCodeWhatsappBtn">${icons.whatsapp} إرسال واتساب</button>
        <button type="button" class="btn btn-primary" id="parentCodeConfirm">${icons.check} تم — حفظ الكود</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.classList.add("is-open");

  const close = () => { overlay.classList.remove("is-open"); overlay.remove(); };
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.querySelector("#parentCodeCancel").addEventListener("click", close);

  overlay.querySelector("#copyParentCodeBtn").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(code); toast("تم نسخ الكود ✓", "success"); }
    catch (e) { toast("تعذر النسخ — انسخ الكود يدويًا", "warning"); }
  });

  // حفظ الكود (hash فقط) — لازم يتحفظ قبل ما الكود يبقي صالح للدخول
  const saveCode = async (btn) => {
    if (btn) btn.disabled = true;
    const ok = await setParentActivationCode(student.parentPhone, code);
    if (!ok) {
      if (btn) btn.disabled = false;
      toast("تعذر حفظ الكود — تأكد من وجود رقم ولي أمر", "danger");
      return false;
    }
    return true;
  };

  overlay.querySelector("#parentCodeWhatsappBtn").addEventListener("click", async (e) => {
    e.stopPropagation();
    const ok = await saveCode(e.currentTarget);
    if (!ok) return;
    close();
    toast("تم حفظ كود الدخول وإرسال واتساب — أول دخول بالكود ثم يختار كلمة المرور", "success");
    openWhatsApp(student.parentPhone, whatsappMsg);
  });

  overlay.querySelector("#parentCodeConfirm").addEventListener("click", async (e) => {
    e.stopPropagation();
    const ok = await saveCode(e.currentTarget);
    if (!ok) return;
    close();
    toast("تم حفظ كود الدخول — أول دخول بالكود ثم يختار كلمة المرور", "success");
    render();
  });
}

/* ── بوابة الطالب — يوزر نيم + باسورد ── */
function renderStudentAuthCard(student) {
  const account = findStudentAccount(student.id);
  const username = account?.username || String(student.code || "").trim() || "-";
  const hasPass = !!account?.passwordHash;

  const statusBadge = hasPass
    ? `<span class="badge badge-success"><span class="badge-dot"></span>باسورد مفعّل</span>`
    : `<span class="badge badge-neutral"><span class="badge-dot"></span>غير مفعّل</span>`;

  const statusText = hasPass
    ? `اليوزر نيم: <strong dir="ltr">${escapeHTML(username)}</strong> — الطالب بيدخل بيه وباسوره مباشرة من بوابة الطالب.`
    : `الطالب مش هيقدر يدخل بوابة الطالب لحد ما تضع كلمة مرور له. اليوزر نيم الافتراضي = كود الطالب.`;

  return `
    <div style="margin-top:16px; padding:14px; background:var(--bg); border:1px solid var(--border); border-radius:var(--r-md); display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
      <span style="font-size:18px;">👤</span>
      <div style="flex:1; min-width:180px;">
        <div style="font-weight:700; font-size:13.5px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">بوابة الطالب ${statusBadge}</div>
        <div style="font-size:12.5px; color:var(--muted); margin-top:3px;">${statusText}</div>
      </div>
      <button class="btn btn-outline btn-sm" id="studentAuthBtn">${icons.shield} ${hasPass ? "تغيير كلمة المرور" : "ضبط كلمة المرور"}</button>
    </div>
  `;
}

async function openStudentAuthModal(student) {
  const account = findStudentAccount(student.id);
  const username = account?.username || String(student.code || "").trim() || "";
  const centerName = getSettings().centerName || "السنتر";
  const hasPass = !!account?.passwordHash;

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__head"><div class="modal__title">${icons.shield} بيانات دخول الطالب — ${escapeHTML(student.name)}</div></div>
      <div class="modal__body">
        <p style="font-size:13px; color:var(--muted); line-height:1.7;">اليوزر نيم الافتراضي = كود الطالب (${escapeHTML(username) || "—"}). ضع كلمة مرور (4–8 أرقام) — الطالب يغيّرها بعد أول دخول من بوابة الطالب.</p>
        <div class="field">
          <label class="field__label">اسم المستخدم</label>
          <input class="input ltr" type="text" id="studentAuthUsername" value="${escapeHTML(username)}" dir="ltr" autocomplete="off">
        </div>
        <div class="field">
          <label class="field__label">كلمة المرور</label>
          <input class="input ltr" type="password" id="studentAuthPassword" placeholder="4–8 أرقام" dir="ltr" inputmode="numeric" maxlength="8" autocomplete="new-password">
        </div>
        <p style="font-size:12px; color:var(--muted);">تُحفظ كلمة المرور كرمز مشفر — لا يُظهرها أحد بعد الحفظ.</p>
      </div>
      <div class="modal__actions" style="flex-wrap:wrap;">
        <button type="button" class="btn btn-outline" id="studentAuthCancel">إلغاء</button>
        <button type="button" class="btn btn-success" id="studentAuthWhatsappBtn">${icons.whatsapp} حفظ وإرسال واتساب</button>
        <button type="button" class="btn btn-primary" id="studentAuthConfirm">${icons.check} تم — الحفظ</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.classList.add("is-open");

  const close = () => { overlay.classList.remove("is-open"); overlay.remove(); };
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.querySelector("#studentAuthCancel").addEventListener("click", close);

  const collect = () => {
    const u = overlay.querySelector("#studentAuthUsername").value.trim();
    const p = overlay.querySelector("#studentAuthPassword").value.trim();
    if (!u) { toast("أدخل اسم المستخدم", "warning"); return null; }
    if (!p || p.length < 4) { toast("كلمة المرور من 4 إلى 8 أرقام", "warning"); return null; }
    return { u, p };
  };

  const save = async (btn) => {
    const data = collect();
    if (!data) return false;
    if (btn) btn.disabled = true;
    const userRes = setStudentUsername(student.id, data.u);
    if (!userRes?.ok) {
      if (btn) btn.disabled = false;
      toast(userRes?.reason === "taken" ? "اسم المستخدم هذا مستخدم لطالب آخر" : "تعذر حفظ اسم المستخدم", "danger");
      return false;
    }
    const ok = await setStudentPassword(student.id, data.p);
    if (!ok) {
      if (btn) btn.disabled = false;
      toast("تعذر حفظ كلمة المرور", "danger");
      return false;
    }
    return true;
  };

  overlay.querySelector("#studentAuthWhatsappBtn").addEventListener("click", async (e) => {
    e.stopPropagation();
    const data = collect();
    if (!data) return;
    const ok = await save(e.currentTarget);
    if (!ok) return;
    const whatsappMsg = `أهلاً ${student.name} 👋\n\nبيانات دخولك بوابة المتابعة على ${centerName}:\n\n• اسم المستخدم: ${data.u}\n• كلمة المرور: ${data.p}\n\nتقدر تغيّرهم بعد أول دخول من داخل البوابة.\n\n${centerName}`;
    close();
    toast("تم حفظ بيانات الدخول وإرسال واتساب", "success");
    openWhatsApp(student.phone || student.parentPhone, whatsappMsg);
  });

  overlay.querySelector("#studentAuthConfirm").addEventListener("click", async (e) => {
    e.stopPropagation();
    const ok = await save(e.currentTarget);
    if (!ok) return;
    close();
    toast(hasPass ? "تم تحديث بيانات الدخول" : "تم تفعيل دخول الطالب", "success");
    render();
  });
}

function renderAdvancePermissions(studentId) {
  const perms = getAdvancePermissionsForStudent(studentId);
  const today = todayISO();

  return `
    <div style="margin-top:16px; padding:14px; background:var(--bg); border:1px solid var(--border); border-radius:var(--r-md);">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:18px;">📋</span>
          <span style="font-weight:700; font-size:14px;">إذن مسبق — غياب مستقبلي</span>
          ${perms.filter((p) => !p.used && p.date >= today).length ? `<span class="badge badge-primary">${perms.filter((p) => !p.used && p.date >= today).length} نشط</span>` : ""}
        </div>
        ${canPerformAction(getSession(), "visit", "advance_permission") ? `<button class="btn btn-outline btn-sm" id="addAdvancePermBtn">${icons.plus} إضافة إذن</button>` : ""}
      </div>
      ${perms.length ? `
        <div style="display:flex; flex-direction:column; gap:6px;">
          ${perms.map((p) => {
            const isPast = p.date < today;
            const isUsed = p.used;
            const isUpcoming = p.date >= today && !isUsed;
            let statusBadge = "";
            if (isUsed) statusBadge = `<span class="badge badge-success" style="font-size:10px;">✅ تم استخدامه</span>`;
            else if (isPast) statusBadge = `<span class="badge badge-neutral" style="font-size:10px;">⏰ منتهى</span>`;
            else statusBadge = `<span class="badge badge-primary" style="font-size:10px;">📅 قادم</span>`;
            return `
              <div style="display:flex; align-items:center; gap:10px; padding:10px 12px; background:var(--surface); border:1px solid var(--border); border-radius:var(--r-sm); ${isUpcoming ? "border-right:3px solid var(--primary);" : isUsed ? "border-right:3px solid var(--success); opacity:0.7;" : "border-right:3px solid var(--muted); opacity:0.5;"}">
                <div style="flex:1; min-width:0;">
                  <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <span style="font-weight:700; font-size:13px;">📅 ${formatDateAr(p.date)}</span>
                    ${statusBadge}
                  </div>
                  <div style="font-size:12px; color:var(--muted); margin-top:3px;">${escapeHTML(p.reason)}</div>
                  <div style="font-size:11px; color:var(--muted); margin-top:2px;">سجّله: ${escapeHTML(p.grantedBy)} · ${formatDateAr(p.createdAt?.slice(0, 10) || "")}</div>
                </div>
                ${isUpcoming ? `<button class="btn btn-outline btn-icon btn-sm deleteAdvancePermBtn" data-id="${p.id}" title="حذف" style="color:var(--danger); flex-shrink:0;">${icons.trash}</button>` : ""}
              </div>
            `;
          }).join("")}
        </div>
      ` : `
        <div style="text-align:center; padding:16px; color:var(--muted); font-size:13px;">لا يوجد إذن مسبق مسجل</div>
      `}
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

  Sounds.messageSent();
  openWhatsApp(student.parentPhone, message);
}

/** مراسلة حرة لولى الأمر — نص مفتوح تمامًا، يكتب المستخدم أى رسالة يريدها */
async function contactParent(student) {
  const message = await whatsappPreviewDialog({
    title: "مراسلة ولى الأمر",
    recipientLabel: `ولى أمر ${student.name} (${student.parentPhone})`,
    defaultMessage: renderTemplate("gen_student_contact", { studentName: student.name }),
  });
  if (!message) return;

  Sounds.messageSent();
  openWhatsApp(student.parentPhone, message);
}

/* ── نافذة الإجراء الاستثنائى ── */
function openActionModal(student) {
  const statuses = getStudentStatuses();
  const actionStatuses = statusesByCategory(statuses, "action");
  if (!actionStatuses.length) { toast("لا توجد إجراءات استثنائية معرّفة", "warning"); return; }

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__head">
        <div class="modal__title" style="color:var(--warning);">${icons.alert} إجراء استثنائى — ${escapeHTML(student.name)}</div>
      </div>
      <div class="modal__body">
        <div class="field">
          <label class="field__label">نوع الإجراء</label>
          <select class="select" id="actionTypeSelect">
            <option value="">— اختر نوع الإجراء —</option>
            ${actionStatuses.map((s) => `<option value="${s.id}">${escapeHTML(s.name)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label class="field__label">سبب / ملاحظة <span style="color:var(--danger);">*</span></label>
          <textarea class="input" id="actionNoteInput" rows="3" placeholder="اكتب سبب الإجراء..." required style="resize:vertical;"></textarea>
        </div>
      </div>
      <div class="modal__actions">
        <button type="button" class="btn btn-outline" id="actionCancel">إلغاء</button>
        <button type="button" class="btn btn-danger" id="actionConfirm">${icons.alert} تأكيد وتسجيل</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.classList.add("is-open");

  const close = () => { overlay.classList.remove("is-open"); overlay.remove(); };
  overlay.querySelector("#actionCancel").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  overlay.querySelector("#actionConfirm").addEventListener("click", () => {
    const statusId = overlay.querySelector("#actionTypeSelect").value;
    const note = overlay.querySelector("#actionNoteInput").value.trim();

    if (!statusId) { toast("اختر نوع الإجراء أولاً", "warning"); return; }
    if (!note) { toast("اكتب سبب الإجراء", "warning"); return; }

    const result = recordActionStatus(student.id, statusId, undefined, note);
    if (!result) { toast("فشلت العملية", "error"); return; }
    if (result.locked) { toast(`الطالب مقفول: ${result.reason}`, "warning"); close(); return; }

    toast(`تم تسجيل: ${result.status.name} — ${student.name}`, result.status.tone === "danger" ? "danger" : "success");
    close();
    render();
  });
}

/* ── إذن مسبق — غياب مستقبلي ── */
function openAdvancePermForm(student) {
  const today = todayISO();
  const bodyHTML = `
    <div style="margin-bottom:14px; padding:12px; background:var(--primary-bg, rgba(59,130,246,0.08)); border:1px solid var(--primary-border, rgba(59,130,246,0.2)); border-radius:var(--r-md); font-size:13px; line-height:1.7;">
      <strong>📋 إذن مسبق:</strong> حدد تاريخ الغياب المتوقع وسببه. لما الطالب مش بيحضر في التاريخ ده، النظام هيسجله تلقائياً <strong>غياب بإذن</strong> — مش هيبعت رسالة تصعيد ومش هيأثر على التصعيد.
    </div>
    <div class="field">
      <label class="field__label">تاريخ الغياب المتوقع</label>
      <input class="input" type="date" name="permDate" min="${today}" required style="font-size:15px;">
    </div>
    <div class="field">
      <label class="field__label">سبب الغياب</label>
      <textarea class="input" name="permReason" rows="3" placeholder="مثال: والدي هيعمل عملية جراحية وأكون مرافق معاه" required style="resize:vertical;"></textarea>
    </div>
  `;

  formModal({
    title: `إذن مسبق — ${student.name}`,
    bodyHTML,
    submitText: "حفظ الإذن",
  }).then((data) => {
    if (!data) return;
    if (!data.permDate) { toast("حدد تاريخ الغياب", "warning"); return; }
    if (!data.permReason?.trim()) { toast("اكتب سبب الغياب", "warning"); return; }

    const session = getSession();
    addAdvancePermission({
      id: generateId(),
      studentId: student.id,
      date: data.permDate,
      reason: data.permReason.trim(),
      grantedBy: session?.username || "المست فارس",
      createdAt: new Date().toISOString(),
      used: false,
    });
    toast("تم حفظ الإذن المسبق ✓", "success");
    render();
  });
}

/* ── دفتر الأستاذ (General Ledger) ── */
function renderStudentLedger(student) {
  const entries = getLedgerEntries(student.id).sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1));
  const walletTxns = getWalletTransactions().filter((t) => t.studentId === student.id);

  if (!entries.length && !walletTxns.length) return "";

  const debitTotal = entries.reduce((sum, e) => sum + Number(e.debit || 0), 0);
  const creditTotal = entries.reduce((sum, e) => sum + Number(e.credit || 0), 0);

  return `
    <div class="card card-pad" style="margin-top:18px;">
      <div class="card__head">
        <div class="card__title">${icons.clipboard} دفتر الأستاذ — كشف حساب مالي شامل</div>
      </div>
      <p style="font-size:12px; color:var(--muted); margin-bottom:12px;">
        كل حركة مالية مسجلة هنا — مفيش حاجة اسمها "مسح دفعة". أي تعديل بيعمل قيد عكسي (Compensating Transaction).
      </p>

      ${entries.length ? `
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>النوع</th>
                <th>البيان</th>
                <th>مدين</th>
                <th>دائن</th>
                <th>الرصيد</th>
              </tr>
            </thead>
            <tbody>
              ${entries.map((e) => `
                <tr>
                  <td style="font-size:12px;">${formatDateAr(e.date)} <span class="text-muted">${e.time || ""}</span></td>
                  <td><span class="badge badge-${typeTone(e.type)}" style="font-size:10px;">${typeLabel(e.type)}</span></td>
                  <td style="font-size:12px;">${escapeHTML(e.description)}</td>
                  <td style="font-weight:700; ${e.debit > 0 ? "color:var(--danger);" : ""}">${e.debit > 0 ? formatMoney(e.debit) : "—"}</td>
                  <td style="font-weight:700; ${e.credit > 0 ? "color:var(--success);" : ""}">${e.credit > 0 ? formatMoney(e.credit) : "—"}</td>
                  <td style="font-weight:800;">${formatMoney(e.balance)}</td>
                </tr>
              `).join("")}
            </tbody>
            <tfoot>
              <tr style="font-weight:800; background:var(--bg);">
                <td colspan="3" style="text-align:left;">الإجمالي</td>
                <td style="color:var(--danger);">${formatMoney(debitTotal)}</td>
                <td style="color:var(--success);">${formatMoney(creditTotal)}</td>
                <td>${formatMoney(debitTotal - creditTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ` : emptyStateHTML({ title: "لا توجد قيود في دفتر الأستاذ" })}

      ${walletTxns.length ? `
        <div style="margin-top:16px; padding-top:16px; border-top:1px solid var(--border);">
          <div style="font-weight:700; font-size:13px; margin-bottom:8px;">${icons.wallet} حركات المحفظة</div>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>النوع</th>
                  <th>المبلغ</th>
                  <th>ملاحظة</th>
                </tr>
              </thead>
              <tbody>
                ${walletTxns.slice().reverse().map((t) => `
                  <tr>
                    <td style="font-size:12px;">${t.date}</td>
                    <td>
                      ${t.type === "deduction"
                        ? `<span class="badge badge-danger" style="font-size:10px;">خصم</span>`
                        : `<span class="badge badge-success" style="font-size:10px;">إيداع</span>`
                      }
                    </td>
                    <td style="font-weight:700; ${t.type === "deduction" ? "color:var(--danger);" : "color:var(--success);"}">
                      ${t.type === "deduction" ? "-" : "+"}${formatMoney(t.amount)}
                      ${t.debtCovered > 0 ? `<span class="text-muted" style="font-size:10px;"> (غطى ${formatMoney(t.debtCovered)} متأخرات)</span>` : ""}
                    </td>
                    <td style="font-size:12px; color:var(--muted);">${escapeHTML(t.note || "")}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      ` : ""}
    </div>
  `;
}

function typeLabel(type) {
  const labels = {
    opening_balance: "رصيد افتتاحي",
    session_fee: "مستحق حصة",
    material_fee: "مستحق ملزمة",
    cash_payment: "سداد كاش",
    wallet_payment: "سداد محفظة",
    wallet_deposit: "إيداع محفظة",
    adjustment: "تعديل يدوي",
  };
  return labels[type] || type;
}

function typeTone(type) {
  const tones = {
    opening_balance: "warning",
    session_fee: "danger",
    material_fee: "danger",
    cash_payment: "success",
    wallet_payment: "info",
    wallet_deposit: "success",
    adjustment: "neutral",
  };
  return tones[type] || "neutral";
}
