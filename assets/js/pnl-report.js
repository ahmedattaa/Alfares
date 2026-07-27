// =========================================================
// P&L Report — محرك حساب التقرير الختامي (ميزانية الترم/الشهر/السنة)
// يُستخدم لعرض P&L في صفحةاليومية المالية + كـ data source لأي تقرير
// =========================================================

import {
  getAllPayments,
  getWalletTransactions,
  getShifts,
  getExtraCharges,
  getStudents,
  getGroups,
  getAttendance,
  getAcademicMonths,
  getTerms,
  getAcademicYears,
} from "./storage.js";
import { formatMoney, escapeHTML, todayISO } from "./helpers.js";

/* ================= helpers ================= */

/** يُرجع نطاق التاريخ من الفترة الأكاديمية */
function getPeriodRange(periodType, periodId) {
  if (periodType === "month") {
    const m = getAcademicMonths().find((x) => x.id === periodId);
    return m ? { start: m.startDate, end: m.endDate, name: m.name, type: "شهر" } : null;
  }
  if (periodType === "term") {
    const t = getTerms().find((x) => x.id === periodId);
    return t ? { start: t.startDate, end: t.endDate, name: t.name, type: "ترم" } : null;
  }
  if (periodType === "year") {
    const y = getAcademicYears().find((x) => x.id === periodId);
    return y ? { start: y.startDate, end: y.endDate, name: y.name, type: "سنة" } : null;
  }
  return null;
}

/** يُرجع تاريخ بداية الترم السابق (ل追踪 الديون: الترم الحالي + اللي قبله) */
function getPreviousTermStart(currentTermId) {
  const terms = getTerms().sort((a, b) => a.startDate.localeCompare(b.startDate));
  const idx = terms.findIndex((t) => t.id === currentTermId);
  if (idx > 0) return terms[idx - 1].startDate;
  return null;
}

/** حساب إجمالي عدد الحصص المتوقعة لمجموعة في فترة معينة */
function countScheduledSessions(group, start, end) {
  if (!group.schedule || !group.schedule.days) return 0;
  const dayMap = { "الأحد": 0, "الاثنين": 1, "الثلاثاء": 2, "الأربعاء": 3, "الخميس": 4, "الجمعة": 5, "السبت": 6 };
  const days = group.schedule.days.map((d) => dayMap[d]).filter((d) => d !== undefined);
  if (!days.length) return 0;
  const s = new Date(start);
  const e = new Date(end);
  let count = 0;
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    if (days.includes(d.getDay())) count++;
  }
  return count;
}

/* ================= الحساب الرئيسي ================= */

/**
 * حساب P&L لفترة معينة.
 * @param {"month"|"term"|"year"} periodType
 * @param {string} periodId — معرف الفترة الأكاديمية
 * @returns {object|null} بيانات P&L الكاملة
 */
export function computePnL(periodType, periodId) {
  const range = getPeriodRange(periodType, periodId);
  if (!range) return null;

  const { start, end, name, type } = range;
  const groups = getGroups();
  const students = getStudents().filter((s) => s.status === "active");
  const settings = getSettings();

  // ---Payments---
  const allPayments = getAllPayments();
  const periodPayments = allPayments.filter((p) => p.date >= start && p.date <= end);
  const paidPayments = periodPayments.filter((p) => p.status === "paid");
  const unpaidPayments = periodPayments.filter((p) => p.status === "unpaid");

  const totalCollected = paidPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalWalletUsed = paidPayments.reduce((s, p) => s + Number(p.walletUsed || 0), 0);
  const totalPending = unpaidPayments.reduce((s, p) => s + Number(p.amount || 0), 0);

  // ---Wallet---
  const walletTxns = getWalletTransactions().filter((t) => t.date >= start && t.date <= end);
  const walletDeposits = walletTxns.filter((t) => t.type === "deposit").reduce((s, t) => s + Number(t.amount || 0), 0);
  const walletDeductions = walletTxns.filter((t) => t.type === "deduction").reduce((s, t) => s + Number(t.amount || 0), 0);

  // ---Shifts---
  const periodShifts = getShifts().filter((s) => s.openedDate >= start && s.openedDate <= end && s.status === "closed");
  const shiftExpected = periodShifts.reduce((s, sh) => s + Number(sh.expectedCash || 0), 0);
  const shiftActual = periodShifts.reduce((s, sh) => s + Number(sh.closingCash || 0), 0);
  const shiftVariance = shiftActual - shiftExpected;

  // ---Extra Charges---
  const periodCharges = getExtraCharges().filter((c) => c.date >= start && c.date <= end);
  const chargesCollected = periodCharges.filter((c) => c.status === "paid").reduce((s, c) => s + Number(c.amount || 0), 0);
  const chargesPending = periodCharges.filter((c) => c.status === "unpaid").reduce((s, c) => s + Number(c.amount || 0), 0);

  // ---Attendance summary---
  const periodAttendance = getAttendance().filter((a) => a.category === "attendance" && a.date >= start && a.date <= end);
  const attCount = periodAttendance.length;
  const paidCount = periodAttendance.filter((a) => a.statusId === "ST-PAID").length;
  const unpaidCount = periodAttendance.filter((a) => a.statusId === "ST-UNPAID").length;
  const excusedCount = periodAttendance.filter((a) => a.statusId === "ST-EXCUSED").length;
  const absentCount = periodAttendance.filter((a) => a.statusId === "ST-ABSENT").length;

  // ---Revenue target (إيراد متوقع)---
  let totalExpectedSessions = 0;
  let totalRevenueTarget = 0;
  groups.forEach((g) => {
    const sessionCount = countScheduledSessions(g, start, end);
    totalExpectedSessions += sessionCount;
    totalRevenueTarget += sessionCount * students.filter((s) => s.groupId === g.id).length * Number(g.sessionPrice || 0);
  });

  // ---Debt tracking: الترم الحالي + اللي قبله---
  let debtBreakdown = { currentTerm: 0, previousTerm: 0, older: 0 };
  if (periodType === "term" || periodType === "year") {
    const prevStart = getPreviousTermStart(periodId);
    const unpaidAll = allPayments.filter((p) => p.status === "unpaid");
    unpaidAll.forEach((p) => {
      if (p.date >= start && p.date <= end) debtBreakdown.currentTerm += Number(p.amount || 0);
      else if (prevStart && p.date >= prevStart && p.date < start) debtBreakdown.previousTerm += Number(p.amount || 0);
      else debtBreakdown.older += Number(p.amount || 0);
    });
  } else {
    debtBreakdown.currentTerm = totalPending;
  }

  // ---Current balances snapshot---
  let totalWalletBalance = 0;
  let totalLateBalance = 0;
  students.forEach((s) => {
    totalWalletBalance += Number(s.walletBalance || 0);
    totalLateBalance += Number(s.lateBalance || 0);
  });

  // ---Per-group breakdown---
  const groupBreakdown = groups.map((g) => {
    const gStudents = students.filter((s) => s.groupId === g.id);
    const gPayments = periodPayments.filter((p) => p.groupId === g.id);
    const gPaid = gPayments.filter((p) => p.status === "paid");
    const gUnpaid = gPayments.filter((p) => p.status === "unpaid");
    return {
      groupId: g.id,
      groupName: g.name,
      groupCode: g.code,
      studentCount: gStudents.length,
      collected: gPaid.reduce((s, p) => s + Number(p.amount || 0), 0),
      pending: gUnpaid.reduce((s, p) => s + Number(p.amount || 0), 0),
      walletUsed: gPaid.reduce((s, p) => s + Number(p.walletUsed || 0), 0),
      expectedSessions: countScheduledSessions(g, start, end),
    };
  });

  // ---Top debtors---
  const debtorMap = {};
  allPayments.filter((p) => p.status === "unpaid").forEach((p) => {
    if (!debtorMap[p.studentId]) debtorMap[p.studentId] = 0;
    debtorMap[p.studentId] += Number(p.amount || 0);
  });
  const topDebtors = Object.entries(debtorMap)
    .map(([studentId, amount]) => {
      const s = students.find((x) => x.id === studentId) || getStudents().find((x) => x.id === studentId);
      return { studentId, name: s?.name || studentId, amount, groupId: s?.groupId };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  const collectionRate = totalRevenueTarget > 0 ? ((totalCollected / totalRevenueTarget) * 100).toFixed(1) : 0;
  const shiftVarianceRate = shiftExpected > 0 ? (((shiftVariance) / shiftExpected) * 100).toFixed(1) : 0;

  return {
    period: { type: periodType, id: periodId, name, typeName: type, start, end },
    revenue: {
      totalExpectedSessions,
      totalRevenueTarget,
      sessionCollected: totalCollected,
      sessionWalletUsed: totalWalletUsed,
      extraCollected: chargesCollected,
      totalActual: totalCollected + chargesCollected,
      collectionRate,
    },
    debts: {
      totalPending,
      chargesPending,
      totalOutstanding: totalLateBalance,
      breakdown: debtBreakdown,
    },
    wallet: {
      deposits: walletDeposits,
      used: walletDeductions,
      netFlow: walletDeposits - walletDeductions,
      currentBalance: totalWalletBalance,
    },
    shifts: {
      count: periodShifts.length,
      expected: shiftExpected,
      actual: shiftActual,
      variance: shiftVariance,
      varianceRate: shiftVarianceRate,
    },
    attendance: {
      total: attCount,
      paid: paidCount,
      unpaid: unpaidCount,
      excused: excusedCount,
      absent: absentCount,
    },
    groupBreakdown,
    topDebtors,
  };
}

/* ================= عرض HTML ================= */

export function renderPnLHTML(data) {
  if (!data) return `<div class="empty-state">لا توجد بيانات لهذه الفترة</div>`;

  const { period, revenue, debts, wallet, shifts, attendance, groupBreakdown, topDebtors } = data;

  const varianceColor = shifts.variance >= 0 ? "var(--success)" : "var(--danger)";
  const varianceSign = shifts.variance >= 0 ? "+" : "";

  return `
    <div class="pnl-report">
      <!-- Header -->
      <div class="pnl-header" style="text-align:center; margin-bottom:20px; padding:16px; background:var(--card); border-radius:12px; border:1px solid var(--border);">
        <div style="font-size:18px; font-weight:800;">📊 التقرير الختامي — ${escapeHTML(period.name)}</div>
        <div style="color:var(--muted); font-size:13px; margin-top:4px;">${escapeHTML(period.typeName)}: ${period.start} → ${period.end}</div>
      </div>

      <!-- KPI Cards -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:20px;">
        ${kpiCard("💰", "إجمالي الإيرادات الفعلية", formatMoney(revenue.totalActual), "var(--success)")}
        ${kpiCard("📈", "الإيراد المتوقع", formatMoney(revenue.totalRevenueTarget), "var(--info)")}
        ${kpiCard("📊", "نسبة التحصيل", revenue.collectionRate + "%", Number(revenue.collectionRate) >= 80 ? "var(--success)" : "var(--warning)")}
        ${kpiCard("⚠️", "ديون معلقة", formatMoney(debts.totalOutstanding), "var(--danger)")}
        ${kpiCard("🏦", "رصيد المحافظ", formatMoney(wallet.currentBalance), "var(--info)")}
        ${kpiCard("📉", "عجز/زيادة الورديات", varianceSign + formatMoney(shifts.variance), varianceColor)}
      </div>

      <!-- Two-column layout -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px;">
        <!-- Revenue Breakdown -->
        <div class="card card-pad">
          <div class="card__head"><div class="card__title">💰 تفصيل الإيرادات</div></div>
          <div class="finance-panel">
            ${financeRow("تحصيل جلسات (نقدي)", formatMoney(revenue.sessionCollected))}
            ${financeRow("محفظة (محصّل من المحافظ)", formatMoney(revenue.sessionWalletUsed))}
            ${financeRow("استحقاقات إضافية", formatMoney(revenue.extraCollected))}
            <div class="finance-panel__divider"></div>
            ${financeRow("إجمالي الإيرادات الفعلية", formatMoney(revenue.totalActual), true)}
            ${financeRow("الإيراد المتوقع", formatMoney(revenue.totalRevenueTarget))}
            ${financeRow("نسبة التحصيل", revenue.collectionRate + "%")}
          </div>
        </div>

        <!-- Debts Breakdown -->
        <div class="card card-pad">
          <div class="card__head"><div class="card__title">⚠️ تفصيل الديون</div></div>
          <div class="finance-panel">
            ${financeRow("ديون من هذه الفترة", formatMoney(debts.breakdown.currentTerm))}
            ${debts.breakdown.previousTerm > 0 ? financeRow("ديون من الفترة السابقة", formatMoney(debts.breakdown.previousTerm)) : ""}
            ${debts.breakdown.older > 0 ? financeRow("ديون أقدم", formatMoney(debts.breakdown.older)) : ""}
            ${financeRow("استحقاقات إضافية غير مدفوعة", formatMoney(debts.chargesPending))}
            <div class="finance-panel__divider"></div>
            ${financeRow("إجمالي الديون المعلقة", formatMoney(debts.totalOutstanding), true)}
          </div>
        </div>

        <!-- Wallet -->
        <div class="card card-pad">
          <div class="card__head"><div class="card__title">🏦 المحافظ</div></div>
          <div class="finance-panel">
            ${financeRow("إيداعات جديدة في المحافظ", formatMoney(wallet.deposits))}
            ${financeRow("خصومات من المحافظ", formatMoney(wallet.used))}
            ${financeRow("صافي التدفق", formatMoney(wallet.netFlow), false, wallet.netFlow >= 0 ? "var(--success)" : "var(--danger)")}
            <div class="finance-panel__divider"></div>
            ${financeRow("إجمالي أرصدة المحافظ الحالية", formatMoney(wallet.currentBalance), true)}
          </div>
        </div>

        <!-- Shifts -->
        <div class="card card-pad">
          <div class="card__head"><div class="card__title">🏪 الورديات</div></div>
          <div class="finance-panel">
            ${financeRow("عدد الورديات", shifts.count)}
            ${financeRow("إجمالي التحصيل الفعلي", formatMoney(shifts.actual))}
            ${financeRow("إجمالي المتوقع", formatMoney(shifts.expected))}
            <div class="finance-panel__divider"></div>
            ${financeRow("عجز / زيادة", varianceSign + formatMoney(shifts.variance), true, varianceColor)}
            ${financeRow("نسبة العجز", shifts.varianceRate + "%")}
          </div>
        </div>
      </div>

      <!-- Attendance Summary -->
      <div class="card card-pad" style="margin-bottom:20px;">
        <div class="card__head"><div class="card__title">📋 ملخص الحضور</div></div>
        <div style="display:flex; gap:16px; flex-wrap:wrap; font-size:13px;">
          <span>إجمالي السجلات: <strong>${attendance.total}</strong></span>
          <span style="color:var(--success);">حضور + دفع: <strong>${attendance.paid}</strong></span>
          <span style="color:var(--warning);">حضور بدون دفع: <strong>${attendance.unpaid}</strong></span>
          <span style="color:var(--info);">غياب بإذن: <strong>${attendance.excused}</strong></span>
          <span style="color:var(--danger);">غياب بدون إذن: <strong>${attendance.absent}</strong></span>
        </div>
      </div>

      <!-- Group Breakdown -->
      <div class="card card-pad" style="margin-bottom:20px;">
        <div class="card__head"><div class="card__title">📁 الكسر حسب المجموعات</div></div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>المجموعة</th>
                <th>الطلاب</th>
                <th>التحصيل</th>
                <th>الديون</th>
                <th>محفظة</th>
                <th>حصص متوقعة</th>
              </tr>
            </thead>
            <tbody>
              ${groupBreakdown.map((g) => `
                <tr>
                  <td><strong>${escapeHTML(g.groupName)}</strong> <span class="text-muted">(${escapeHTML(g.groupCode)})</span></td>
                  <td>${g.studentCount}</td>
                  <td style="color:var(--success);">${formatMoney(g.collected)}</td>
                  <td style="color:${g.pending > 0 ? "var(--danger)" : "var(--muted)"};">${g.pending > 0 ? formatMoney(g.pending) : "—"}</td>
                  <td style="color:var(--info);">${g.walletUsed > 0 ? formatMoney(g.walletUsed) : "—"}</td>
                  <td>${g.expectedSessions}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Top Debtors -->
      ${topDebtors.length ? `
      <div class="card card-pad">
        <div class="card__head"><div class="card__title">🚨 أكبر المديونين (أعلى 10)</div></div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr><th>#</th><th>الطالب</th><th>المجموعة</th><th>المبلغ المستحق</th></tr>
            </thead>
            <tbody>
              ${topDebtors.map((d, i) => {
                const g = getGroups().find((x) => x.id === d.groupId);
                return `
                <tr>
                  <td>${i + 1}</td>
                  <td><strong>${escapeHTML(d.name)}</strong></td>
                  <td class="text-muted">${escapeHTML(g?.name || "—")}</td>
                  <td style="color:var(--danger); font-weight:700;">${formatMoney(d.amount)}</td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>` : ""}
    </div>
  `;
}

/* ================= small HTML helpers ================= */

function kpiCard(icon, label, value, color) {
  return `
    <div class="card" style="padding:14px; text-align:center;">
      <div style="font-size:20px; margin-bottom:4px;">${icon}</div>
      <div style="font-size:11px; color:var(--muted); margin-bottom:4px;">${label}</div>
      <div style="font-size:18px; font-weight:800; color:${color};">${value}</div>
    </div>
  `;
}

function financeRow(label, value, bold = false, color = "") {
  return `
    <div class="finance-panel__row" style="${bold ? "font-weight:800;" : ""}">
      <span>${label}</span>
      <span style="${color ? "color:" + color + ";" : ""}">${value}</span>
    </div>
  `;
}
