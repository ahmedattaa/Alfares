// =========================================================
// Wallet Reconciliation — تسوية المحافظ عند الترحيل
// ترحيل أرصدة المحافظ كرصيد دائن للعام الجديد
// =========================================================

import {
  getStudents,
  addLedgerEntry,
} from "./storage.js";
import { formatMoney, escapeHTML, todayISO } from "./helpers.js";

/**
 * معاينة ترحيل المحافظ — يُرجع قائمة الطلاب اللي عليهم رصيد محفظة
 * ومعلومات عن المتأخرات.
 */
export function previewWalletReconciliation() {
  const students = getStudents().filter((s) => s.status === "active");
  const walletHolders = students
    .filter((s) => Number(s.walletBalance || 0) > 0)
    .map((s) => ({
      studentId: s.id,
      name: s.name,
      groupId: s.groupId,
      walletBalance: Number(s.walletBalance || 0),
      lateBalance: Number(s.lateBalance || 0),
    }))
    .sort((a, b) => b.walletBalance - a.walletBalance);

  const totalWallet = walletHolders.reduce((s, x) => s + x.walletBalance, 0);
  const totalLate = students.reduce((s, x) => s + Number(x.lateBalance || 0), 0);
  const studentsWithDebt = students.filter((s) => Number(s.lateBalance || 0) > 0).length;

  return {
    walletHolders,
    totalWallet,
    totalLate,
    studentCount: students.length,
    walletHolderCount: walletHolders.length,
    studentsWithDebt,
  };
}

/**
 * تنفيذ ترحيل المحافظ — يُنشئ قيود ledger لكل طالب عليه رصيد محفظة
 * ويترحل الرصيد مع الطالب (walletBalance لا يتغير — الرصيد يفضل معاه).
 *
 * الفكرة: walletBalance على الطالب ثابت (الطالب نفسه بيكمل).
 * اللي يتغير هو ledger — بنفتح قيد افتتاحي للسنة الجديدة.
 *
 * @param {object} options — { termId, executedBy }
 * @returns {object} ملخص التنفيذ
 */
export function executeWalletReconciliation(options = {}) {
  const { termId, executedBy = "النظام" } = options;
  const students = getStudents().filter((s) => s.status === "active");
  let processedCount = 0;
  let totalWalletCarried = 0;
  let totalLateCarried = 0;

  students.forEach((s) => {
    const wallet = Number(s.walletBalance || 0);
    const late = Number(s.lateBalance || 0);
    let changed = false;

    // ترحيل رصيد المحفظة — قيد افتتاحي دائن
    if (wallet > 0) {
      addLedgerEntry({
        studentId: s.id,
        type: "wallet_rollover",
        description: `ترحيل رصيد محفظة — بداية ترم جديد`,
        credit: wallet,
        referenceType: "rollover",
        createdBy: executedBy,
      });
      totalWalletCarried += wallet;
      changed = true;
    }

    // ترحيل المتأخرات — قيد افتتاحي مدين
    if (late > 0) {
      addLedgerEntry({
        studentId: s.id,
        type: "late_rollover",
        description: `ترحيل مديونيات — بداية ترم جديد`,
        debit: late,
        referenceType: "rollover",
        createdBy: executedBy,
      });
      totalLateCarried += late;
      changed = true;
    }

    if (changed) processedCount++;
  });

  return {
    processedCount,
    totalWalletCarried,
    totalLateCarried,
    executedAt: todayISO(),
    executedBy,
  };
}

/**
 * يعرض HTML معاينة ترحيل المحافظ.
 */
export function renderWalletReconciliationHTML() {
  const preview = previewWalletReconciliation();

  if (!preview.walletHolderCount && !preview.studentsWithDebt) {
    return `
      <div class="card card-pad" style="margin-bottom:16px;">
        <div class="card__head"><div class="card__title">🏦 تسوية المحافظ</div></div>
        <div style="color:var(--success); font-size:13px; padding:12px 0;">✓ لا توجد أرصدة محفظة أو مديونيات لترحيلها</div>
      </div>
    `;
  }

  return `
    <div class="card card-pad" style="margin-bottom:16px;">
      <div class="card__head">
        <div class="card__title">🏦 تسوية المحافظ — معاينة</div>
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:12px; margin-bottom:16px;">
        <div class="card" style="padding:12px; text-align:center;">
          <div style="font-size:11px; color:var(--muted);">طلاب عليهم رصيد محفظة</div>
          <div style="font-size:20px; font-weight:800; color:var(--info);">${preview.walletHolderCount}</div>
        </div>
        <div class="card" style="padding:12px; text-align:center;">
          <div style="font-size:11px; color:var(--muted);">إجمالي المحافظ</div>
          <div style="font-size:20px; font-weight:800; color:var(--success);">${formatMoney(preview.totalWallet)}</div>
        </div>
        <div class="card" style="padding:12px; text-align:center;">
          <div style="font-size:11px; color:var(--muted);">طلاب عليهم مديونيات</div>
          <div style="font-size:20px; font-weight:800; color:var(--danger);">${preview.studentsWithDebt}</div>
        </div>
        <div class="card" style="padding:12px; text-align:center;">
          <div style="font-size:11px; color:var(--muted);">إجمالي المديونيات</div>
          <div style="font-size:20px; font-weight:800; color:var(--danger);">${formatMoney(preview.totalLate)}</div>
        </div>
      </div>
      ${preview.walletHolders.length ? `
        <div style="font-size:13px; font-weight:700; margin-bottom:8px;">تفاصيل أرصدة المحافظ:</div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr><th>الطالب</th><th>رصيد المحفظة</th><th>المديونيات</th></tr>
            </thead>
            <tbody>
              ${preview.walletHolders.map((w) => `
                <tr>
                  <td><strong>${escapeHTML(w.name)}</strong></td>
                  <td style="color:var(--success); font-weight:700;">${formatMoney(w.walletBalance)}</td>
                  <td style="color:${w.lateBalance > 0 ? "var(--danger)" : "var(--muted)"};">${w.lateBalance > 0 ? formatMoney(w.lateBalance) : "—"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      ` : ""}
      <div class="field__hint" style="margin-top:12px;">
        💡 سيتم ترحيل أرصدة المحافظ والمديونيات كقيود افتتاحية في دفتر الأستاذ. 
        الرصيد يفضل مع الطالب (لا يتغير).
      </div>
    </div>
  `;
}
