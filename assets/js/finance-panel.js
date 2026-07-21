// =========================================================
// Finance Panel — حساب وعرض المطلوب من الطالب (سعر الحصة + الخصم +
// المستحقات القديمة + الاستحقاقات المالية الإضافية باسمها)
// وحدة مشتركة بين الاستقبال وإدارة الحصة لمنع تكرار الكود
// =========================================================

import { escapeHTML, formatMoney } from "./helpers.js";
import { dueAmount } from "./lookups.js";

/** كل الاستحقاقات الإضافية غير المدفوعة لطالب معين (خارج سعر الحصة) */
export function unpaidExtraCharges(charges, studentId) {
  return charges.filter((c) => c.studentId === studentId && c.status === "unpaid");
}

/** يحسب كل تفاصيل المطلوب من الطالب فى لحظة معينة */
export function computeFinanceBreakdown(student, group, extraCharges) {
  const sessionPrice = group?.sessionPrice || 0;
  const discount = Math.min(sessionPrice, Number(student.discount || 0));
  const sessionDue = dueAmount(student, group);
  const priorBalance = Number(student.lateBalance || 0);
  const charges = unpaidExtraCharges(extraCharges, student.id);
  const extraTotal = charges.reduce((sum, c) => sum + Number(c.amount || 0), 0);
  const grandTotal = sessionDue + priorBalance + extraTotal;

  return { sessionPrice, discount, sessionDue, priorBalance, charges, extraTotal, grandTotal };
}

/** يبنى الـ HTML الكامل للوحة المالية (نفس الشكل بالظبط فى الاستقبال وإدارة الحصة) */
export function renderFinancePanelHTML(breakdown) {
  const { sessionPrice, discount, sessionDue, priorBalance, charges, grandTotal } = breakdown;

  return `
    <div class="finance-panel">
      <div class="finance-panel__row">
        <span>سعر الحصة</span>
        <span>${discount > 0 ? `<span class="og-price">${formatMoney(sessionPrice)}</span>` : ""}${formatMoney(sessionPrice)}</span>
      </div>
      ${
        discount > 0
          ? `
        <div class="finance-panel__row is-discount">
          <span>خصم الطالب الشخصى</span>
          <span>−${formatMoney(discount)}</span>
        </div>
        <div class="finance-panel__row" style="font-weight:800;">
          <span>المطلوب لهذه الحصة (بعد الخصم)</span>
          <span>${formatMoney(sessionDue)}</span>
        </div>`
          : ""
      }
      ${
        priorBalance > 0
          ? `
        <div class="finance-panel__row is-due">
          <span>مستحقات سابقة</span>
          <span>${formatMoney(priorBalance)}</span>
        </div>`
          : ""
      }
      ${charges
        .map(
          (c) => `
        <div class="finance-panel__row is-due">
          <span>${escapeHTML(c.name)}</span>
          <span>${formatMoney(c.amount)}</span>
        </div>`
        )
        .join("")}
      <div class="finance-panel__divider"></div>
      <div class="finance-panel__total-row">
        <label>الإجمالى المطلوب تحصيله الآن</label>
        <div class="finance-panel__input-wrap">
          <input type="number" id="collectAmountInput" min="0" value="${grandTotal}">
          <span>ج.م</span>
        </div>
      </div>
      <div class="field__hint" style="margin-top:8px;">لو الطالب هيدفع جزء بس، عدّل الرقم فوق قبل الضغط على "حضر ودفع" — والباقى هيتسجل تلقائيًا كمتأخرات.</div>
    </div>
  `;
}
