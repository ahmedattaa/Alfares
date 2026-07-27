// =========================================================
// Term Snapshot — لقطة أرصدة الطلاب عند بداية كل ترم
// يُستخدم كنقطة مرجعية لحساب التغير في الأرصدة خلال الترم
// =========================================================

import {
  getStudents,
  getTerms,
  getAcademicYears,
  createTermSnapshot as storageCreateSnapshot,
  getTermSnapshotForTerm,
} from "./storage.js";
import { formatMoney, escapeHTML } from "./helpers.js";

/**
 * يُنشئ لقطة أرصدة لكل الطلاب النشطين لترم معين.
 * لو كانت اللقطة موجودة بالفعل، بتتحدث.
 * @returns {object} اللقطة الجديدة
 */
export function createSnapshot(termId) {
  return storageCreateSnapshot(termId);
}

/**
 * يحسب التغير في أرصدة الطلاب بين لقطتين (أو بين لقطة ووضع حالي).
 * @param {string} termId — الترم اللي عايز تقاربه
 * @returns {object} ملخص التغيرات
 */
export function computeChanges(termId) {
  const snapshot = getTermSnapshotForTerm(termId);
  if (!snapshot) return null;

  const currentStudents = getStudents().filter((s) => s.status === "active");
  const changes = [];

  snapshot.students.forEach((snap) => {
    const current = currentStudents.find((s) => s.id === snap.studentId);
    if (!current) return;

    const walletDelta = Number(current.walletBalance || 0) - snap.walletBalance;
    const lateDelta = Number(current.lateBalance || 0) - snap.lateBalance;

    if (walletDelta !== 0 || lateDelta !== 0) {
      changes.push({
        studentId: snap.studentId,
        name: snap.name,
        snapWallet: snap.walletBalance,
        currentWallet: Number(current.walletBalance || 0),
        walletDelta,
        snapLate: snap.lateBalance,
        currentLate: Number(current.lateBalance || 0),
        lateDelta,
      });
    }
  });

  const totalWalletDelta = changes.reduce((s, c) => s + c.walletDelta, 0);
  const totalLateDelta = changes.reduce((s, c) => s + c.lateDelta, 0);

  return {
    snapshot,
    changes,
    totalWalletDelta,
    totalLateDelta,
    snapshotDate: snapshot.date,
    studentCount: snapshot.students.length,
  };
}

/**
 * يعرض HTML ملخص اللقطة والتعديلات اللي حصلت عليها.
 */
export function renderSnapshotSummaryHTML(termId) {
  const snapshot = getTermSnapshotForTerm(termId);
  if (!snapshot) return null;

  const changes = computeChanges(termId);
  if (!changes) return null;

  const term = getTerms().find((t) => t.id === termId);
  const year = getAcademicYears().find((y) => y.id === term?.yearId);

  return `
    <div class="card card-pad" style="margin-bottom:16px;">
      <div class="card__head">
        <div class="card__title">📸 لقطة الأرصدة — ${escapeHTML(term?.name || termId)}</div>
        <span class="text-muted" style="font-size:12px;">تم الإنشاء: ${snapshot.date}</span>
      </div>
      <div style="font-size:13px; color:var(--muted); margin-bottom:12px;">
        عدد الطلاب: ${snapshot.studentCount} | 
        إجمالي المحافظ عند اللقطة: ${formatMoney(changes.snapshot.students.reduce((s, st) => s + st.walletBalance, 0))} |
        إجمالي المتأخرات عند اللقطة: ${formatMoney(changes.snapshot.students.reduce((s, st) => s + st.lateBalance, 0))}
      </div>
      ${changes.changes.length ? `
        <div style="font-size:13px; font-weight:700; margin-bottom:8px;">التغييرات منذ اللقطة:</div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>الطالب</th>
                <th>محفظة (لقطة → حالي)</th>
                <th>ال变了</th>
                <th>متأخرات (لقطة → حالي)</th>
                <th>الت变了</th>
              </tr>
            </thead>
            <tbody>
              ${changes.changes.slice(0, 20).map((c) => `
                <tr>
                  <td>${escapeHTML(c.name)}</td>
                  <td>${formatMoney(c.snapWallet)} → ${formatMoney(c.currentWallet)}</td>
                  <td style="color:${c.walletDelta >= 0 ? "var(--success)" : "var(--danger)"}; font-weight:700;">
                    ${c.walletDelta >= 0 ? "+" : ""}${formatMoney(c.walletDelta)}
                  </td>
                  <td>${formatMoney(c.snapLate)} → ${formatMoney(c.currentLate)}</td>
                  <td style="color:${c.lateDelta <= 0 ? "var(--success)" : "var(--danger)"}; font-weight:700;">
                    ${c.lateDelta >= 0 ? "+" : ""}${formatMoney(c.lateDelta)}
                  </td>
                </tr>
              `).join("")}
              ${changes.changes.length > 20 ? `<tr><td colspan="5" class="text-muted">... و ${changes.changes.length - 20} طالب آخر</td></tr>` : ""}
            </tbody>
          </table>
        </div>
      ` : `<div style="color:var(--success); font-size:13px;">✓ لم يحدث أي تغير في الأرصدة منذ اللقطة</div>`}
      <div style="margin-top:12px; font-size:12px; color:var(--muted);">
        صافي تغير المحافظ: <strong style="color:${changes.totalWalletDelta >= 0 ? "var(--success)" : "var(--danger)"};">${changes.totalWalletDelta >= 0 ? "+" : ""}${formatMoney(changes.totalWalletDelta)}</strong> |
        صافي تغير المتأخرات: <strong style="color:${changes.totalLateDelta <= 0 ? "var(--success)" : "var(--danger)"};">${changes.totalLateDelta >= 0 ? "+" : ""}${formatMoney(changes.totalLateDelta)}</strong>
      </div>
    </div>
  `;
}
