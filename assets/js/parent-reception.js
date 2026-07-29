// =========================================================
// استقبال ولي الأمر — صفحة شاملة لكل ما يحتاجه ولي الأمر
// ملف الطالب · الإدارة المالية · المتابعة · التواصل · الجدول
// =========================================================

import { initPage } from "./app.js";
import { icons } from "./icons.js";
import {
  getStudents,
  getGroups,
  getGrades,
  getAttendance,
  getPayments,
  getExtraCharges,
  getStudentStatuses,
  getExams,
  getWalletTransactions,
  addWalletDeposit,
  getCenterName,
} from "./storage.js";
import { escapeHTML, formatMoney, todayISO, formatDateAr } from "./helpers.js";
import { toast } from "./ui.js";
import { findGroup, gradeName, dueAmount } from "./lookups.js";
import { openWhatsApp } from "./whatsapp.js";
import { formatTimeAr, formatDaysAr, WEEKDAY_OPTIONS } from "./schedule.js";
import { isStudentLocked, settleExtraCharge } from "./attendance-service.js";
import { renderTemplate } from "./whatsapp-templates.js";

const content = await initPage("parent-reception");
let selectedStudentId = null;
let activeTab = "profile";

if (content) render();

function render() {
  content.innerHTML = `
    <div class="page__header">
      <div>
        <div class="page__title">استقبال ولي الأمر</div>
        <div class="page__subtitle">بحث عن الطالب وعرض ملفه الكامل</div>
      </div>
    </div>

    <div class="pr-search">
      <div class="pr-search__icon">${icons.search}</div>
      <input type="text" class="pr-search__input" id="searchInput" placeholder="ابحث بالاسم أو الكود أو رقم التليفون..." autofocus>
      <div id="searchResults" class="pr-search__results"></div>
    </div>

    <div id="studentZone" style="display:none;"></div>
  `;

  const input = document.getElementById("searchInput");
  input.addEventListener("input", onSearch);
  input.addEventListener("focus", onSearch);
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".pr-search")) {
      document.getElementById("searchResults").style.display = "none";
    }
  });
}

function onSearch() {
  const term = document.getElementById("searchInput").value.trim().toLowerCase();
  const results = document.getElementById("searchResults");
  if (term.length < 1) { results.style.display = "none"; return; }

  const students = getStudents().filter((s) => s.status === "active");
  const groups = getGroups();
  const matches = students.filter((s) => {
    const name = (s.name || "").toLowerCase();
    const code = (s.code || "").toLowerCase();
    const phone = (s.phone || "").toLowerCase();
    const parentPhone = (s.parentPhone || "").toLowerCase();
    return name.includes(term) || code.includes(term) || phone.includes(term) || parentPhone.includes(term);
  }).slice(0, 12);

  if (!matches.length) {
    results.innerHTML = `<div class="pr-search__empty">لا يوجد نتائج</div>`;
    results.style.display = "block";
    return;
  }

  results.innerHTML = matches.map((s) => {
    const g = findGroup(groups, s.groupId);
    const wallet = Number(s.walletBalance || 0);
    return `
      <div class="pr-search__item" data-id="${s.id}">
        <div class="pr-search__item-code">${escapeHTML(s.code || "")}</div>
        <div class="pr-search__item-info">
          <div class="pr-search__item-name">${escapeHTML(s.name)}</div>
          <div class="pr-search__item-meta">${escapeHTML(g?.name || "")} ${wallet > 0 ? `· <span style="color:var(--success);">${formatMoney(wallet)}</span>` : ""}</div>
        </div>
      </div>`;
  }).join("");

  results.style.display = "block";
  results.querySelectorAll(".pr-search__item").forEach((el) =>
    el.addEventListener("click", () => selectStudent(el.dataset.id))
  );
}

function selectStudent(id) {
  selectedStudentId = id;
  document.getElementById("searchResults").style.display = "none";
  const student = getStudents().find((s) => s.id === id);
  if (student) document.getElementById("searchInput").value = student.name;
  renderStudentZone();
}

function renderStudentZone() {
  const zone = document.getElementById("studentZone");
  zone.style.display = "block";
  const student = getStudents().find((s) => s.id === selectedStudentId);
  if (!student) { zone.innerHTML = ""; return; }

  const group = findGroup(getGroups(), student.groupId);
  const grade = gradeName(getGrades(), student.gradeId);
  const wallet = Number(student.walletBalance || 0);
  const debt = Number(student.lateBalance || 0);

  zone.innerHTML = `
    <div class="pr-profile-card">
      <div class="pr-profile-card__header">
        <div class="pr-profile-card__avatar">${escapeHTML(student.code || "?")}</div>
        <div class="pr-profile-card__info">
          <div class="pr-profile-card__name">${escapeHTML(student.name)}</div>
          <div class="pr-profile-card__meta">${escapeHTML(group?.name || "")} · ${escapeHTML(grade || "")}</div>
          <div class="pr-profile-card__meta">تاريخ الانضمام: ${formatDateAr(student.joinDate)}</div>
        </div>
        <div class="pr-profile-card__badges">
          ${wallet > 0 ? `<div class="pr-badge pr-badge--success">${icons.wallet} ${formatMoney(wallet)}</div>` : ""}
          ${debt > 0 ? `<div class="pr-badge pr-badge--danger">${icons.money} ${formatMoney(debt)}</div>` : ""}
          ${isStudentLocked(student) ? `<div class="pr-badge pr-badge--warning">${icons.lock || "🔒"} مقفول</div>` : ""}
        </div>
      </div>
    </div>

    <div class="pr-tabs">
      <button class="pr-tab ${activeTab === "profile" ? "is-active" : ""}" data-tab="profile">ملف الطالب</button>
      <button class="pr-tab ${activeTab === "finance" ? "is-active" : ""}" data-tab="finance">الإدارة المالية</button>
      <button class="pr-tab ${activeTab === "academic" ? "is-active" : ""}" data-tab="academic">المتابعة الدراسية</button>
      <button class="pr-tab ${activeTab === "schedule" ? "is-active" : ""}" data-tab="schedule">الجدول</button>
      <button class="pr-tab ${activeTab === "contact" ? "is-active" : ""}" data-tab="contact">التواصل</button>
    </div>

    <div id="tabContent"></div>
  `;

  zone.querySelectorAll(".pr-tab").forEach((btn) =>
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      renderStudentZone();
    })
  );

  renderTabContent();
}

function renderTabContent() {
  const box = document.getElementById("tabContent");
  const student = getStudents().find((s) => s.id === selectedStudentId);
  if (!student || !box) return;

  if (activeTab === "profile") return renderProfileTab(box, student);
  if (activeTab === "finance") return renderFinanceTab(box, student);
  if (activeTab === "academic") return renderAcademicTab(box, student);
  if (activeTab === "schedule") return renderScheduleTab(box, student);
  if (activeTab === "contact") return renderContactTab(box, student);
}

/* ═══════════════════════════════════════════════════════════
   تبويب ملف الطالب
   ═══════════════════════════════════════════════════════════ */

function renderProfileTab(box, student) {
  const attendance = getAttendance().filter((a) => a.studentId === student.id && a.category === "attendance");
  const statuses = getStudentStatuses();
  const presentStatuses = new Set(statuses.filter((s) => s.presence === "present").map((s) => s.id));

  const last30 = attendance.filter((a) => {
    const d = new Date(a.date);
    const now = new Date();
    const diff = (now - d) / (1000 * 60 * 60 * 24);
    return diff <= 30;
  });
  const presentCount = last30.filter((a) => presentStatuses.has(a.statusId)).length;
  const totalCount = last30.length;
  const rate = totalCount ? Math.round((presentCount / totalCount) * 100) : 0;

  const unpaidCount = last30.filter((a) => {
    const st = statuses.find((s) => s.id === a.statusId);
    return st?.payment === "unpaid";
  }).length;

  box.innerHTML = `
    <div class="pr-info-grid">
      <div class="pr-info-card">
        <div class="pr-info-card__icon" style="background:rgba(16,185,129,.1); color:var(--success);">${icons.check}</div>
        <div class="pr-info-card__value">${presentCount}/${totalCount}</div>
        <div class="pr-info-card__label">حضور آخر 30 يوم</div>
      </div>
      <div class="pr-info-card">
        <div class="pr-info-card__icon" style="background:rgba(102,126,234,.1); color:var(--primary);">${icons.chart}</div>
        <div class="pr-info-card__value" style="color:${rate >= 70 ? "var(--success)" : rate >= 40 ? "var(--warning)" : "var(--danger)"};">${rate}%</div>
        <div class="pr-info-card__label">نسبة الحضور</div>
      </div>
      <div class="pr-info-card">
        <div class="pr-info-card__icon" style="background:rgba(245,158,11,.1); color:var(--warning);">${icons.clock}</div>
        <div class="pr-info-card__value">${unpaidCount}</div>
        <div class="pr-info-card__label">حصص غير مدفوعة</div>
      </div>
    </div>

    <div class="card card-pad" style="margin-top:16px;">
      <div class="card__head"><div class="card__title">معلومات الطالب</div></div>
      <div class="pr-detail-row"><span class="pr-detail-label">الكود</span><span>${escapeHTML(student.code || "")}</span></div>
      <div class="pr-detail-row"><span class="pr-detail-label">المجموعة</span><span>${escapeHTML(group?.name || "")}</span></div>
      <div class="pr-detail-row"><span class="pr-detail-label">السنة الدراسية</span><span>${escapeHTML(gradeName(getGrades(), student.gradeId) || "")}</span></div>
      <div class="pr-detail-row"><span class="pr-detail-label">المواعيد</span><span>${formatDaysAr(group?.days || [])} — ${formatTimeAr(group?.time)}</span></div>
      <div class="pr-detail-row"><span class="pr-detail-label">سعر الحصة</span><span>${formatMoney(group?.sessionPrice || 0)}</span></div>
      <div class="pr-detail-row"><span class="pr-detail-label">الخصم</span><span>${student.discount ? formatMoney(student.discount) : "—"}</span></div>
      <div class="pr-detail-row"><span class="pr-detail-label">تليفون الطالب</span><span>${escapeHTML(student.phone || "")}</span></div>
      <div class="pr-detail-row"><span class="pr-detail-label">تليفون ولي الأمر</span><span>${escapeHTML(student.parentPhone || "")}</span></div>
      <div class="pr-detail-row"><span class="pr-detail-label">المهنة</span><span>${escapeHTML(student.fatherJob || "")}</span></div>
      <div class="pr-detail-row"><span class="pr-detail-label">المدرسة</span><span>${escapeHTML(student.school || "")}</span></div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════
   تبويب الإدارة المالية
   ═══════════════════════════════════════════════════════════ */

function renderFinanceTab(box, student) {
  const wallet = Number(student.walletBalance || 0);
  const debt = Number(student.lateBalance || 0);
  const charges = getExtraCharges().filter((c) => c.studentId === student.id && c.status === "unpaid");
  const totalCharges = charges.reduce((sum, c) => sum + Number(c.amount || 0), 0);
  const group = findGroup(getGroups(), student.groupId);
  const sessionPrice = group ? dueAmount(student, group) : 0;

  const payments = getPayments().filter((p) => p.studentId === student.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);

  box.innerHTML = `
    <div class="pr-finance-summary">
      <div class="pr-finance-box pr-finance-box--wallet">
        <div class="pr-finance-box__icon">${icons.wallet}</div>
        <div class="pr-finance-box__value">${formatMoney(wallet)}</div>
        <div class="pr-finance-box__label">الرصيد المتاح</div>
      </div>
      <div class="pr-finance-box pr-finance-box--debt">
        <div class="pr-finance-box__icon">${icons.money}</div>
        <div class="pr-finance-box__value">${formatMoney(debt)}</div>
        <div class="pr-finance-box__label">المتأخرات</div>
      </div>
      <div class="pr-finance-box pr-finance-box--charges">
        <div class="pr-finance-box__icon">${icons.alert}</div>
        <div class="pr-finance-box__value">${formatMoney(totalCharges)}</div>
        <div class="pr-finance-box__label">مستحقات أخرى</div>
      </div>
      <div class="pr-finance-box pr-finance-box--session">
        <div class="pr-finance-box__icon">${icons.clipboard}</div>
        <div class="pr-finance-box__value">${formatMoney(sessionPrice)}</div>
        <div class="pr-finance-box__label">سعر الحصة</div>
      </div>
    </div>

    <div class="card card-pad" style="margin-top:16px;">
      <div class="card__head">
        <div class="card__title">إيداع في المحفظة</div>
      </div>
      <div class="pr-deposit-form">
        <input type="number" class="input" id="depositInput" min="1" step="1" placeholder="المبلغ (ج.م)" style="max-width:200px;">
        <button class="btn btn-success" id="depositBtn">${icons.wallet} إيداع</button>
      </div>
      <div class="field__hint" id="depositHint"></div>
    </div>

    ${charges.length ? `
    <div class="card card-pad" style="margin-top:16px;">
      <div class="card__head"><div class="card__title">مستحقات أخرى</div></div>
      ${charges.map((c) => `
        <div class="pr-detail-row">
          <span>${escapeHTML(c.name)} — ${formatMoney(c.amount)}</span>
          <button class="btn btn-success btn-sm settleChargeBtn" data-id="${c.id}">تسوية</button>
        </div>
      `).join("")}
    </div>` : ""}

    <div class="card card-pad" style="margin-top:16px;">
      <div class="card__head"><div class="card__title">سجل الدفعات</div></div>
      ${payments.length ? payments.map((p) => `
        <div class="pr-payment-row ${p.status === "paid" ? "is-paid" : "is-unpaid"}">
          <div class="pr-payment-row__info">
            <div class="pr-payment-row__note">${escapeHTML(p.note || "")}</div>
            <div class="pr-payment-row__date">${formatDateAr(p.date)} ${p.sessionDate ? `(حصة ${formatDateAr(p.sessionDate)})` : ""}</div>
          </div>
          <div class="pr-payment-row__amount">
            ${p.status === "paid" ? `<span style="color:var(--success);">+${formatMoney(p.amount)}</span>` : `<span style="color:var(--danger);">-${formatMoney(p.amount || 0)}</span>`}
            ${p.walletUsed > 0 ? `<span class="pr-payment-row__wallet">${icons.wallet} ${formatMoney(p.walletUsed)}</span>` : ""}
          </div>
        </div>
      `).join("") : `<div class="text-muted" style="padding:20px; text-align:center;">لا توجد دفعات مسجلة</div>`}
    </div>
  `;

  // إيداع
  document.getElementById("depositBtn").addEventListener("click", () => {
    const amount = Number(document.getElementById("depositInput").value || 0);
    if (amount <= 0) { toast("أدخل مبلغ صحيح", "warning"); return; }
    const result = addWalletDeposit(student.id, amount);
    if (!result) { toast("فشلت عملية الإيداع", "error"); return; }
    let msg = `تم إيداع ${formatMoney(amount)}`;
    if (result.debtCovered > 0) msg += ` — تغطية متأخرات: ${formatMoney(result.debtCovered)}`;
    if (result.walletDeposit > 0) msg += ` — رصيد جديد: ${formatMoney(result.newWalletBalance)}`;
    toast(msg, "success");
    try {
      if (student.parentPhone) openWhatsApp(student.parentPhone, renderTemplate("wallet_deposit_reception", {
        studentName: student.name,
        amount: formatMoney(amount),
        newWalletBalance: formatMoney(result.newWalletBalance),
        centerName: getCenterName(),
      }));
    } catch (e) { /* popup blocker */ }
    renderStudentZone();
  });

  // تسوية مستحق
  box.querySelectorAll(".settleChargeBtn").forEach((btn) =>
    btn.addEventListener("click", () => {
      const charge = settleExtraCharge(btn.dataset.id);
      if (charge) toast(`تم تسوية "${charge.name}"`, "success");
      renderStudentZone();
    })
  );
}

/* ═══════════════════════════════════════════════════════════
   تبويب المتابعة الدراسية
   ═══════════════════════════════════════════════════════════ */

function renderAcademicTab(box, student) {
  const attendance = getAttendance().filter((a) => a.studentId === student.id && a.category === "attendance").sort((a, b) => b.date.localeCompare(a.date));
  const statuses = getStudentStatuses();
  const exams = getExams().filter((e) => e.studentId === student.id).sort((a, b) => b.date.localeCompare(a.date));

  const recent = attendance.slice(0, 15);

  box.innerHTML = `
    <div class="card card-pad">
      <div class="card__head"><div class="card__title">سجل الحضور الأخير</div></div>
      ${recent.length ? `
        <div class="pr-attendance-table">
          <div class="pr-attendance-header">
            <span>التاريخ</span><span>الحالة</span><span>الوقت</span>
          </div>
          ${recent.map((a) => {
            const st = statuses.find((s) => s.id === a.statusId);
            return `
              <div class="pr-attendance-row">
                <span>${formatDateAr(a.date)}</span>
                <span class="pr-attendance-status pr-attendance-status--${st?.tone || 'neutral'}">${escapeHTML(st?.name || "—")}</span>
                <span>${a.time || "—"}</span>
              </div>`;
          }).join("")}
        </div>` : `<div class="text-muted" style="padding:20px; text-align:center;">لا توجد سجلات حضور</div>`}
    </div>

    <div class="card card-pad" style="margin-top:16px;">
      <div class="card__head"><div class="card__title">الدرجات</div></div>
      ${exams.length ? `
        <div class="pr-attendance-table">
          <div class="pr-attendance-header">
            <span>التاريخ</span><span>الامتحان</span><span>الدرجة</span>
          </div>
          ${exams.map((e) => `
            <div class="pr-attendance-row">
              <span>${formatDateAr(e.date)}</span>
              <span>${escapeHTML(e.name || "")}</span>
              <span style="font-weight:700;">${e.score ?? "—"}</span>
            </div>`).join("")}
        </div>` : `<div class="text-muted" style="padding:20px; text-align:center;">لا توجد درجات مسجلة</div>`}
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════
   تبويب الجدول
   ═══════════════════════════════════════════════════════════ */

function renderScheduleTab(box, student) {
  const group = findGroup(getGroups(), student.groupId);
  if (!group) { box.innerHTML = `<div class="text-muted" style="padding:20px; text-align:center;">لا توجد بيانات للمجموعة</div>`; return; }

  const days = group.days || [];
  const weekdays = WEEKDAY_OPTIONS;

  box.innerHTML = `
    <div class="card card-pad">
      <div class="card__head"><div class="card__title">جدول حصص الطالب</div></div>
      <div class="pr-schedule">
        ${weekdays.map((w) => {
          const isScheduled = days.includes(w.ar);
          return `
            <div class="pr-schedule__day ${isScheduled ? "is-active" : ""}">
              <div class="pr-schedule__day-name">${w.ar}</div>
              ${isScheduled ? `<div class="pr-schedule__day-time">${formatTimeAr(group.time)}</div>` : `<div class="pr-schedule__day-time" style="color:var(--muted);">—</div>`}
            </div>`;
        }).join("")}
      </div>
      <div style="margin-top:12px;">
        <div class="pr-detail-row"><span class="pr-detail-label">المدة</span><span>${group.duration || 90} دقيقة</span></div>
        <div class="pr-detail-row"><span class="pr-detail-label">السعر</span><span>${formatMoney(group.sessionPrice || 0)}</span></div>
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════
   تبويب التواصل
   ═══════════════════════════════════════════════════════════ */

function renderContactTab(box, student) {
  const wallet = Number(student.walletBalance || 0);
  const debt = Number(student.lateBalance || 0);

  const summaryMessage = renderTemplate("gen_summary", {
    studentName: student.name,
    wallet: formatMoney(wallet),
    debt: formatMoney(debt),
    groupName: findGroup(getGroups(), student.groupId)?.name || "—",
    centerName: getCenterName(),
  });

  box.innerHTML = `
    <div class="card card-pad">
      <div class="card__head"><div class="card__title">التواصل مع ولي الأمر</div></div>
      <div style="display:flex; flex-direction:column; gap:10px;">
        <div class="pr-detail-row"><span class="pr-detail-label">تليفون الطالب</span><span>${escapeHTML(student.phone || "—")}</span></div>
        <div class="pr-detail-row"><span class="pr-detail-label">تليفون ولي الأمر</span><span>${escapeHTML(student.parentPhone || "—")}</span></div>
      </div>
      <div style="margin-top:16px; display:flex; flex-direction:column; gap:8px;">
        <button class="btn btn-success" id="waSummaryBtn">${icons.whatsapp} إرسال ملخص واتساب</button>
        <button class="btn btn-outline" id="waCustomBtn">${icons.whatsapp} رسالة مخصصة</button>
      </div>
    </div>
  `;

  document.getElementById("waSummaryBtn").addEventListener("click", () => {
    if (!student.parentPhone) { toast("لا يوجد تليفون لولي الأمر", "warning"); return; }
    try { openWhatsApp(student.parentPhone, summaryMessage); } catch (e) { /* popup blocker */ }
  });

  document.getElementById("waCustomBtn").addEventListener("click", () => {
    if (!student.parentPhone) { toast("لا يوجد تليفون لولي الأمر", "warning"); return; }
    try { openWhatsApp(student.parentPhone, renderTemplate("gen_custom_opener", { studentName: student.name, centerName: getCenterName() })); } catch (e) { /* popup blocker */ }
  });
}

/* ═══════════════════════════════════════════════════════════
   CSS
   ═══════════════════════════════════════════════════════════ */

const style = document.createElement("style");
style.textContent = `
  .pr-search { position: relative; margin-bottom: 20px; }
  .pr-search__icon { position: absolute; right: 16px; top: 50%; transform: translateY(-50%); color: var(--muted); width: 20px; height: 20px; }
  .pr-search__input {
    width: 100%; padding: 14px 44px 14px 16px; border-radius: 12px; border: 2px solid var(--border);
    background: var(--bg); font-size: 16px; font-family: inherit; color: var(--text); outline: none;
    transition: border-color .2s;
  }
  .pr-search__input:focus { border-color: var(--primary); }
  .pr-search__results {
    position: absolute; top: 100%; right: 0; left: 0; z-index: 100;
    background: var(--bg); border: 1px solid var(--border); border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,.12); max-height: 320px; overflow-y: auto;
    display: none;
  }
  .pr-search__empty { padding: 16px; text-align: center; color: var(--muted); font-size: 13px; }
  .pr-search__item {
    display: flex; align-items: center; gap: 12px; padding: 12px 16px; cursor: pointer;
    border-bottom: 1px solid var(--border); transition: background .15s;
  }
  .pr-search__item:last-child { border-bottom: none; }
  .pr-search__item:hover { background: var(--bg-2); }
  .pr-search__item-code {
    width: 36px; height: 36px; border-radius: 50%; background: var(--bg-2);
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; flex-shrink: 0;
  }
  .pr-search__item-info { flex: 1; }
  .pr-search__item-name { font-weight: 700; font-size: 14px; }
  .pr-search__item-meta { font-size: 12px; color: var(--muted); }

  .pr-profile-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px; padding: 20px; color: #fff; margin-bottom: 16px; }
  .pr-profile-card__header { display: flex; align-items: center; gap: 14px; }
  .pr-profile-card__avatar {
    width: 56px; height: 56px; border-radius: 50%; background: rgba(255,255,255,.2);
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; font-weight: 800; flex-shrink: 0;
  }
  .pr-profile-card__info { flex: 1; }
  .pr-profile-card__name { font-size: 18px; font-weight: 800; }
  .pr-profile-card__meta { font-size: 12px; opacity: .85; margin-top: 2px; }
  .pr-profile-card__badges { display: flex; flex-direction: column; gap: 4px; }
  .pr-badge {
    display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px;
    border-radius: 20px; font-size: 11px; font-weight: 700;
  }
  .pr-badge--success { background: rgba(255,255,255,.2); }
  .pr-badge--danger { background: rgba(239,68,68,.8); }
  .pr-badge--warning { background: rgba(245,158,11,.8); }
  .pr-badge svg { width: 12px; height: 12px; }

  .pr-tabs { display: flex; gap: 4px; margin-bottom: 16px; overflow-x: auto; }
  .pr-tab {
    padding: 10px 16px; border-radius: 10px; border: none; background: var(--bg-2);
    font-family: inherit; font-size: 13px; font-weight: 700; color: var(--muted);
    cursor: pointer; white-space: nowrap; transition: all .2s;
  }
  .pr-tab:hover { color: var(--text); }
  .pr-tab.is-active { background: var(--primary); color: #fff; }

  .pr-info-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
  .pr-info-card {
    background: var(--bg); border: 1px solid var(--border); border-radius: 12px;
    padding: 16px; text-align: center;
  }
  .pr-info-card__icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; margin: 0 auto 8px; }
  .pr-info-card__icon svg { width: 20px; height: 20px; }
  .pr-info-card__value { font-size: 22px; font-weight: 800; }
  .pr-info-card__label { font-size: 11px; color: var(--muted); margin-top: 2px; }

  .pr-detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
  .pr-detail-row:last-child { border-bottom: none; }
  .pr-detail-label { color: var(--muted); font-weight: 600; }

  .pr-finance-summary { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
  .pr-finance-box {
    border-radius: 12px; padding: 16px; text-align: center; color: #fff;
  }
  .pr-finance-box--wallet { background: linear-gradient(135deg, #10b981, #059669); }
  .pr-finance-box--debt { background: linear-gradient(135deg, #ef4444, #dc2626); }
  .pr-finance-box--charges { background: linear-gradient(135deg, #f59e0b, #d97706); }
  .pr-finance-box--session { background: linear-gradient(135deg, #667eea, #764ba2); }
  .pr-finance-box__icon { width: 32px; height: 32px; margin: 0 auto 6px; }
  .pr-finance-box__icon svg { width: 20px; height: 20px; }
  .pr-finance-box__value { font-size: 18px; font-weight: 800; }
  .pr-finance-box__label { font-size: 11px; opacity: .85; }

  .pr-deposit-form { display: flex; gap: 10px; align-items: center; }

  .pr-payment-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 0; border-bottom: 1px solid var(--border);
  }
  .pr-payment-row:last-child { border-bottom: none; }
  .pr-payment-row__note { font-size: 13px; font-weight: 600; }
  .pr-payment-row__date { font-size: 11px; color: var(--muted); }
  .pr-payment-row__amount { font-size: 13px; font-weight: 700; text-align: left; }
  .pr-payment-row__wallet { display: inline-flex; align-items: center; gap: 3px; font-size: 10px; color: var(--success); margin-right: 6px; }
  .pr-payment-row__wallet svg { width: 10px; height: 10px; }

  .pr-attendance-table { width: 100%; }
  .pr-attendance-header {
    display: grid; grid-template-columns: 1fr 1fr 80px; padding: 8px 0;
    border-bottom: 2px solid var(--border); font-size: 12px; font-weight: 700; color: var(--muted);
  }
  .pr-attendance-row {
    display: grid; grid-template-columns: 1fr 1fr 80px; padding: 8px 0;
    border-bottom: 1px solid var(--border); font-size: 13px;
  }
  .pr-attendance-row:last-child { border-bottom: none; }
  .pr-attendance-status { font-weight: 700; font-size: 12px; }

  .pr-schedule { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
  .pr-schedule__day {
    text-align: center; padding: 12px 4px; border-radius: 10px;
    background: var(--bg-2); border: 2px solid transparent;
  }
  .pr-schedule__day.is-active { border-color: var(--primary); background: rgba(102,126,234,.08); }
  .pr-schedule__day-name { font-size: 11px; font-weight: 700; color: var(--muted); margin-bottom: 4px; }
  .pr-schedule__day.is-active .pr-schedule__day-name { color: var(--primary); }
  .pr-schedule__day-time { font-size: 12px; font-weight: 700; }

  @media (max-width: 560px) {
    .pr-search__input { font-size: 14px; padding: 12px 40px 12px 14px; }
    .pr-profile-card { padding: 14px; border-radius: 12px; }
    .pr-profile-card__avatar { width: 44px; height: 44px; font-size: 15px; }
    .pr-profile-card__name { font-size: 15px; }
    .pr-tabs { gap: 2px; }
    .pr-tab { padding: 8px 12px; font-size: 12px; }
    .pr-schedule { grid-template-columns: repeat(4, 1fr); }
    .pr-attendance-row { grid-template-columns: 1fr 60px; }
    .pr-attendance-row > :nth-child(2) { display: none; }
  }
`;
document.head.appendChild(style);
