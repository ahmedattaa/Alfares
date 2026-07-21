// =========================================================
// Finance — اليومية المالية (تقرير يومى + تقرير أسبوعى)
// =========================================================

import { initPage } from "./app.js";
import { icons } from "./icons.js";
import { getAttendance, getPayments, savePayments, getStudents, saveStudents, getStudentStatuses, getSessionLogs, getGroups, getGrades, getExtraCharges, saveExtraCharges } from "./storage.js";
import { escapeHTML, initials, formatMoney, todayISO, formatDateAr, addDays, startOfWeek, weekdayNameAr, generateId } from "./helpers.js";
import { toast, confirmDialog, formModal, emptyStateHTML } from "./ui.js";
import { groupName, gradeName, groupsForGrade } from "./lookups.js";

const content = await initPage("finance");
let activeTab = "daily";
let selectedDate = todayISO();
let weekStart = startOfWeek(todayISO());

if (content) render();

function render() {
  content.innerHTML = `
    <div class="page__header">
      <div>
        <div class="page__title">اليومية المالية</div>
        <div class="page__subtitle">تقرير يومى وتقرير أسبوعى للحضور والمدفوعات</div>
      </div>
    </div>

    <div class="tabs" id="financeTabs">
      <button class="tab-btn ${activeTab === "daily" ? "is-active" : ""}" data-tab="daily">${icons.wallet}<span>التقرير اليومى</span></button>
      <button class="tab-btn ${activeTab === "weekly" ? "is-active" : ""}" data-tab="weekly">${icons.chart}<span>التقرير الأسبوعى</span></button>
      <button class="tab-btn ${activeTab === "charges" ? "is-active" : ""}" data-tab="charges">${icons.money}<span>استحقاقات مالية</span></button>
    </div>

    <div id="tabContent"></div>
  `;

  content.querySelectorAll(".tab-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      content.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === activeTab));
      renderTabContent();
    })
  );

  renderTabContent();
}

function renderTabContent() {
  const box = document.getElementById("tabContent");
  if (activeTab === "daily") return renderDailyTab(box);
  if (activeTab === "weekly") return renderWeeklyTab(box);
  return renderChargesTab(box);
}

/* ================= التقرير اليومى ================= */
function renderDailyTab(box) {
  box.innerHTML = `
    <div class="page__header" style="margin-bottom:14px;">
      <div class="page__subtitle" style="margin:0;">ملخص الحضور والمدفوعات ليوم ${formatDateAr(selectedDate)}</div>
      <input class="input" type="date" id="dateFilter" style="max-width:180px;" value="${selectedDate}">
    </div>

    <div class="stat-grid" id="statsGrid"></div>

    <div class="card card-pad">
      <div class="card__head"><div class="card__title">عمليات الدفع</div></div>
      <div id="paymentsTable"></div>
    </div>
  `;

  document.getElementById("dateFilter").addEventListener("change", (e) => {
    selectedDate = e.target.value;
    renderDailyTab(box);
  });

  renderStats();
  renderPaymentsTable();
}

function renderStats() {
  const box = document.getElementById("statsGrid");
  const attendance = getAttendance().filter((a) => a.date === selectedDate && a.category === "attendance");
  const payments = getPayments().filter((p) => p.date === selectedDate);
  const students = getStudents();
  const statuses = getStudentStatuses();

  const presentCount = attendance.filter((a) => statuses.find((s) => s.id === a.statusId)?.presence === "present").length;
  const paidCount = payments.filter((p) => p.status === "paid").length;
  const unpaidCount = payments.filter((p) => p.status === "unpaid").length;
  const totalRevenue = payments.filter((p) => p.status === "paid").reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const totalDues = students.reduce((sum, s) => sum + Number(s.lateBalance || 0), 0);

  box.innerHTML = `
    ${statCard("tone-success", icons.check, presentCount, "عدد الحضور")}
    ${statCard("tone-primary", icons.money, paidCount, "عدد المدفوع")}
    ${statCard("tone-warning", icons.clock, unpaidCount, "عدد غير المدفوع")}
    ${statCard("tone-primary", icons.wallet, formatMoney(totalRevenue), "إيرادات اليوم")}
    ${statCard("tone-danger", icons.alert, formatMoney(totalDues), "إجمالى المتأخرات")}
  `;
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

function renderPaymentsTable() {
  const box = document.getElementById("paymentsTable");
  const students = getStudents();
  const payments = getPayments()
    .filter((p) => p.date === selectedDate)
    .sort((a, b) => (a.id < b.id ? 1 : -1));

  if (!payments.length) {
    box.innerHTML = emptyStateHTML({ icon: icons.wallet, title: "لا توجد عمليات دفع فى هذا اليوم" });
    return;
  }

  box.innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>الطالب</th><th>المبلغ</th><th>البيان</th><th>الحالة</th><th></th></tr></thead>
        <tbody>
          ${payments
            .map((p) => {
              const s = students.find((st) => st.id === p.studentId);
              return `
              <tr>
                <td>
                  <div class="cell-user">
                    <div class="avatar-sm">${initials(s?.name || "?")}</div>
                    <div class="cell-user__name">${escapeHTML(s?.name || "طالب محذوف")}</div>
                  </div>
                </td>
                <td>${formatMoney(p.amount)}</td>
                <td class="text-muted">${escapeHTML(p.note || "-")}</td>
                <td>${p.status === "paid" ? `<span class="badge badge-success">مدفوع</span>` : `<span class="badge badge-warning">غير مدفوع</span>`}</td>
                <td>
                  ${
                    p.status === "unpaid"
                      ? `<button class="btn btn-outline btn-sm markPaidBtn" data-id="${p.id}">تحصيل المبلغ</button>`
                      : ""
                  }
                </td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  box.querySelectorAll(".markPaidBtn").forEach((btn) => btn.addEventListener("click", () => markPaid(btn.dataset.id)));
}

async function markPaid(paymentId) {
  const payments = getPayments();
  const payment = payments.find((p) => p.id === paymentId);
  if (!payment) return;

  const students = getStudents();
  const student = students.find((s) => s.id === payment.studentId);

  const ok = await confirmDialog({
    title: "تأكيد التحصيل",
    body: `هل تم تحصيل مبلغ ${formatMoney(payment.amount)} من الطالب <strong>${escapeHTML(student?.name || "")}</strong>؟`,
    confirmText: "تم التحصيل",
    tone: "success",
  });
  if (!ok) return;

  payment.status = "paid";
  savePayments(payments);

  if (student) {
    student.lateBalance = Math.max(0, (student.lateBalance || 0) - Number(payment.amount || 0));
    saveStudents(students);
  }

  toast("تم تسجيل تحصيل المبلغ بنجاح", "success");
  renderStats();
  renderPaymentsTable();
}

/* ================= التقرير الأسبوعى ================= */
function renderWeeklyTab(box) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const attendance = getAttendance();
  const payments = getPayments();
  const statuses = getStudentStatuses();
  const sessionLogs = getSessionLogs();
  const groups = getGroups();

  const rows = days.map((date) => {
    const dayAttendance = attendance.filter((a) => a.date === date && a.category === "attendance");
    const present = dayAttendance.filter((a) => statuses.find((s) => s.id === a.statusId)?.presence === "present").length;
    const absent = dayAttendance.filter((a) => statuses.find((s) => s.id === a.statusId)?.presence === "absent").length;
    const dayPayments = payments.filter((p) => p.date === date && p.status === "paid");
    const collected = dayPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const sessionsOpened = sessionLogs.filter((l) => l.date === date);
    return { date, present, absent, collected, sessionsOpened };
  });

  const weekTotal = {
    present: rows.reduce((sum, r) => sum + r.present, 0),
    absent: rows.reduce((sum, r) => sum + r.absent, 0),
    collected: rows.reduce((sum, r) => sum + r.collected, 0),
    sessions: rows.reduce((sum, r) => sum + r.sessionsOpened.length, 0),
  };

  box.innerHTML = `
    <div class="page__header" style="margin-bottom:14px;">
      <div class="flex-gap">
        <button class="btn btn-outline btn-icon" id="prevWeekBtn" title="الأسبوع السابق">${icons.arrowLeft}</button>
        <div class="page__subtitle" style="margin:0; font-weight:700;">من ${formatDateAr(weekStart)} إلى ${formatDateAr(addDays(weekStart, 6))}</div>
        <button class="btn btn-outline btn-icon" id="nextWeekBtn" title="الأسبوع التالى" style="transform:scaleX(-1);">${icons.arrowLeft}</button>
      </div>
      <button class="btn btn-outline btn-sm" id="thisWeekBtn">الأسبوع الحالى</button>
    </div>

    <div class="stat-grid">
      ${statCard("tone-success", icons.check, weekTotal.present, "إجمالى الحضور بالأسبوع")}
      ${statCard("tone-danger", icons.x, weekTotal.absent, "إجمالى الغياب بالأسبوع")}
      ${statCard("tone-primary", icons.grid, weekTotal.sessions, "عدد الحصص المفتوحة")}
      ${statCard("tone-primary", icons.wallet, formatMoney(weekTotal.collected), "إجمالى تحصيل الأسبوع")}
    </div>

    <div class="card card-pad">
      <div class="card__head"><div class="card__title">تفصيل أيام الأسبوع</div></div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>اليوم</th><th>التاريخ</th><th>الحصص المفتوحة</th><th>الحضور</th><th>الغياب</th><th>المحصّل</th></tr></thead>
          <tbody>
            ${rows
              .map(
                (r) => `
              <tr>
                <td style="font-weight:700;">${weekdayNameAr(r.date)}</td>
                <td class="text-muted">${r.date}</td>
                <td>
                  ${
                    r.sessionsOpened.length
                      ? r.sessionsOpened.map((l) => `<span class="badge badge-primary" style="margin-left:4px;">${escapeHTML(groupName(groups, l.groupId))}</span>`).join("")
                      : `<span class="badge badge-neutral">لم تُفتح حصص</span>`
                  }
                </td>
                <td><span class="badge badge-success">${r.present}</span></td>
                <td><span class="badge badge-danger">${r.absent}</span></td>
                <td style="font-weight:700;">${formatMoney(r.collected)}</td>
              </tr>`
              )
              .join("")}
            <tr style="background:var(--bg); font-weight:800;">
              <td colspan="3">إجمالى الأسبوع</td>
              <td><span class="badge badge-success">${weekTotal.present}</span></td>
              <td><span class="badge badge-danger">${weekTotal.absent}</span></td>
              <td>${formatMoney(weekTotal.collected)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById("prevWeekBtn").addEventListener("click", () => {
    weekStart = addDays(weekStart, -7);
    renderWeeklyTab(box);
  });
  document.getElementById("nextWeekBtn").addEventListener("click", () => {
    weekStart = addDays(weekStart, 7);
    renderWeeklyTab(box);
  });
  document.getElementById("thisWeekBtn").addEventListener("click", () => {
    weekStart = startOfWeek(todayISO());
    renderWeeklyTab(box);
  });
}

/* ================= استحقاقات مالية (بنود مسمّاة خارج سعر الحصة) ================= */
function renderChargesTab(box) {
  box.innerHTML = `
    <div class="card card-pad" style="margin-bottom:18px;">
      <div class="card__head">
        <div class="card__title">استحقاقات مالية</div>
        <button class="btn btn-primary btn-sm" id="addChargeBtn">${icons.plus} إضافة استحقاق مالى</button>
      </div>
      <p class="text-muted" style="font-size:13.5px; margin-bottom:0;">
        لأى مبلغ خارج سعر الحصة العادى (زى ملازم أو أوراق امتحان أو مراجعات) — بيُطبَّق على كل طلاب مجموعة معينة،
        ويظهر تلقائيًا للطالب كمبلغ مطلوب لما يحضر فى الاستقبال أو إدارة الحصة، منفصل باسمه عن سعر الحصة.
      </p>
    </div>

    <div class="card card-pad">
      <div class="card__head"><div class="card__title">كل الاستحقاقات المسجّلة</div></div>
      <div id="chargesTable"></div>
    </div>
  `;

  document.getElementById("addChargeBtn").addEventListener("click", () => openChargeForm());
  renderChargesTable();
}

function renderChargesTable() {
  const box = document.getElementById("chargesTable");
  const charges = getExtraCharges().slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const students = getStudents();

  if (!charges.length) {
    box.innerHTML = emptyStateHTML({ icon: icons.money, title: "لا توجد استحقاقات مالية مسجّلة بعد" });
    return;
  }

  // تجميع حسب اسم الاستحقاق + تاريخ الإنشاء (كل دفعة إضافة = صف واحد بالإحصائيات)
  const groupsMap = {};
  charges.forEach((c) => {
    const key = `${c.name}__${c.batchId || c.id}`;
    if (!groupsMap[key]) groupsMap[key] = { name: c.name, amount: c.amount, date: c.date, items: [] };
    groupsMap[key].items.push(c);
  });

  const rows = Object.values(groupsMap);

  box.innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>اسم الاستحقاق</th><th>المبلغ للطالب</th><th>عدد الطلاب</th><th>المحصّل</th><th>المتبقى</th><th>التاريخ</th></tr></thead>
        <tbody>
          ${rows
            .map((r) => {
              const paidCount = r.items.filter((i) => i.status === "paid").length;
              return `
              <tr>
                <td style="font-weight:700;">${escapeHTML(r.name)}</td>
                <td>${formatMoney(r.amount)}</td>
                <td class="text-muted">${r.items.length} طالب</td>
                <td><span class="badge badge-success">${paidCount}</span></td>
                <td><span class="badge ${r.items.length - paidCount > 0 ? "badge-warning" : "badge-neutral"}">${r.items.length - paidCount}</span></td>
                <td class="text-muted">${formatDateAr(r.date)}</td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function openChargeForm() {
  const grades = getGrades();
  const groups = getGroups();

  if (!groups.length) {
    toast("أضف مجموعة واحدة على الأقل من الإعدادات أولًا", "warning");
    return;
  }

  const bodyHTML = `
    <div class="field">
      <label class="field__label">اسم الاستحقاق</label>
      <input class="input" name="name" required placeholder="مثال: ملزمة امتحان الشهر">
    </div>
    <div class="form-grid">
      <div class="field">
        <label class="field__label">المبلغ لكل طالب (ج.م)</label>
        <input class="input" name="amount" type="number" min="1" required value="10">
      </div>
      <div class="field">
        <label class="field__label">المجموعة</label>
        <select class="select" name="groupId" required>
          ${groups.map((g) => `<option value="${g.id}">${escapeHTML(g.name)} (${g.code}) — ${escapeHTML(gradeName(grades, g.gradeId))}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="field__hint">هيتطبّق المبلغ ده على كل طلاب المجموعة المختارة، وهيظهر لهم منفصل عن سعر الحصة لما يحضروا.</div>
  `;

  const data = await formModal({ title: "إضافة استحقاق مالى جديد", bodyHTML, submitText: "تطبيق على المجموعة", wide: true });
  if (!data) return;

  const group = getGroups().find((g) => g.id === data.groupId);
  const groupStudents = getStudents().filter((s) => s.groupId === data.groupId);

  if (!groupStudents.length) {
    toast("المجموعة دى معندهاش طلاب حاليًا", "warning");
    return;
  }

  const ok = await confirmDialog({
    title: "تأكيد التطبيق",
    body: `هيتم تطبيق "<strong>${escapeHTML(data.name)}</strong>" بمبلغ <strong>${formatMoney(data.amount)}</strong> على <strong>${groupStudents.length}</strong> طالب فى مجموعة "${escapeHTML(group?.name || "")}". متأكد؟`,
    confirmText: "تطبيق",
    tone: "success",
  });
  if (!ok) return;

  const batchId = generateId("BATCH");
  const today = todayISO();
  const charges = getExtraCharges();

  groupStudents.forEach((s) => {
    charges.push({
      id: generateId("CHG"),
      batchId,
      studentId: s.id,
      name: data.name,
      amount: Number(data.amount) || 0,
      date: today,
      status: "unpaid",
    });
  });

  saveExtraCharges(charges);
  toast(`تم تطبيق الاستحقاق على ${groupStudents.length} طالب بنجاح`, "success");
  renderChargesTable();
}
