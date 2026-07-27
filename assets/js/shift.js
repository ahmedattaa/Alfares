// =========================================================
// Shift — الصندوق / تقفيل الوردية الأعمى (Blind Shift Reconciliation)
// السكرتير بيدخل الفلوس بالفئات (200، 100، 50...) واللة يحسب
// النظام مش بيعرض الإجمالي المتوقع — أنت من يدخل الفلوس الفعلية
// =========================================================

import { initPage } from "./app.js";
import { icons } from "./icons.js";
import {
  getSession,
  getShifts,
  openShift,
  getCurrentShift,
  closeShift,
  getStudents,
  getSettings,
} from "./storage.js";
import { escapeHTML, formatMoney, todayISO } from "./helpers.js";
import { toast, confirmDialog, emptyStateHTML } from "./ui.js";

const DENOMINATIONS = [200, 100, 50, 20, 10, 5, 1];

const content = await initPage("shift");
if (content) render();

function render() {
  const session = getSession();
  const shift = getCurrentShift();
  const shiftMode = getSettings().shiftMode || "mandatory";

  content.innerHTML = `
    <div class="page__header">
      <div>
        <div class="page__title">${icons.wallet} الصندوق — تقفيل الوردية</div>
        <div class="page__subtitle">${shiftMode === "no_custody" ? "وضع بدون عهدة — افتح الوردية بدون عد فلوس" : shiftMode === "disabled" ? "الوردية معطّلة — انتبه: لن يتم تسجيل التحصيلات بالصندوق" : "لا يعرض الإجمالي على السكرتير — أنت من يدخل الفلوس بالفئات"}</div>
      </div>
    </div>

    ${shift ? renderOpenShift(shift) : renderOpeningPage(shiftMode)}
    ${shift ? renderShiftHistory() : ""}
  `;

  if (shift) bindOpenShiftEvents(shift);
  else bindOpeningPageEvents(shiftMode);
}

/* ================= الوردية المفتوحة ================= */
function renderOpenShift(shift) {
  const totalCollected = (shift.collections || []).reduce((sum, c) => sum + Number(c.amount || 0), 0);
  const sessionCount = (shift.collections || []).filter((c) => c.type === "session").length;
  const lateCount = (shift.collections || []).filter((c) => c.type === "late").length;
  const depositCount = (shift.collections || []).filter((c) => c.type === "wallet_deposit").length;
  const chargeCount = (shift.collections || []).filter((c) => c.type === "extra_charge").length;

  const openedTime = shift.openedAt ? new Date(shift.openedAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }) : "";

  return `
    <div class="card card-pad" style="margin-bottom:20px;">
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <span class="badge badge-success" style="font-size:13px; padding:6px 14px;">🟢 وردية مفتوحة</span>
          <span class="text-muted" style="font-size:13px;">فتحها: <strong>${escapeHTML(shift.openedBy)}</strong> ${openedTime}</span>
        </div>
        <div style="font-size:14px; color:var(--muted);">
          رصيد الافتتاح: <strong style="color:var(--text);">${formatMoney(shift.openingCash)}</strong>
        </div>
      </div>
    </div>

    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:12px; margin-bottom:20px;">
      <div class="card card-pad">
        <div style="font-size:12px; color:var(--muted); margin-bottom:4px;">الإجمالي المحصّل</div>
        <div style="font-size:22px; font-weight:800; color:var(--primary);">${formatMoney(totalCollected)}</div>
        <div style="font-size:11px; color:var(--muted); margin-top:4px;">
          ${shift.collections?.length || 0} تحصيل
        </div>
      </div>
      <div class="card card-pad">
        <div style="font-size:12px; color:var(--muted); margin-bottom:4px;">التحصيلات</div>
        <div style="font-size:13px; margin-top:4px; line-height:1.8;">
          حصص: <strong>${sessionCount}</strong><br>
          متأخرات: <strong>${lateCount}</strong><br>
          إيداعات: <strong>${depositCount}</strong>
          ${chargeCount > 0 ? `<br>استحقاقات: <strong>${chargeCount}</strong>` : ""}
        </div>
      </div>
    </div>

    <div class="card card-pad" style="margin-bottom:20px;">
      <div class="card__head">
        <div class="card__title">سجل التحصيلات</div>
        <button class="btn btn-outline btn-xs" id="refreshShiftBtn">${icons.reload} تحديث</button>
      </div>
      ${(shift.collections || []).length === 0
        ? `<div style="padding:24px; text-align:center; color:var(--muted); font-size:13px;">لا توجد تحصيلات بعد — الوردية مفتوحة بانتظار التحصيلات</div>`
        : `<div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>الطالب</th>
                  <th>المبلغ</th>
                  <th>النوع</th>
                  <th>الوقت</th>
                </tr>
              </thead>
              <tbody>
                ${shift.collections.slice().reverse().map((c, idx) => {
                  const student = getStudents().find((s) => s.id === c.studentId);
                  const time = c.recordedAt ? new Date(c.recordedAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }) : "";
                  return `
                    <tr>
                      <td class="text-muted" style="font-size:12px;">${(shift.collections.length - idx)}</td>
                      <td>${student ? escapeHTML(student.name) : c.studentId}</td>
                      <td style="font-weight:700; color:var(--success);">${formatMoney(c.amount)}</td>
                      <td>${typeLabel(c.type)}</td>
                      <td class="text-muted" style="font-size:12px;">${time}</td>
                    </tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>`
      }
    </div>

    <div class="card card-pad" style="border:2px solid var(--danger); border-radius:var(--r-lg);">
      <div class="card__head">
        <div class="card__title" style="color:var(--danger);">${icons.alert} تقفيل الوردية</div>
      </div>
      <p style="font-size:13px; color:var(--muted); margin-bottom:16px; line-height:1.7;">
        عدّ الفلوس اللي في الدرج فعليًا بالفئات. النظام <u>مش بيعرضلك</u> الإجمالي المتوقع.
      </p>
      <div id="denominationFields">
        ${renderDenominationInputs()}
      </div>
      <div style="display:flex; align-items:center; justify-content:space-between; margin-top:16px; padding-top:16px; border-top:1px solid var(--border);">
        <div style="font-size:13px; color:var(--muted);">الإجمالي المحسوب:</div>
        <div id="closingTotalDisplay" style="font-size:22px; font-weight:800; color:var(--text);">٠ ج.م</div>
      </div>
      <div style="margin-top:16px;">
        <button class="btn btn-danger btn-lg btn-block" id="closeShiftBtn">${icons.check} تقفيل الوردية</button>
      </div>
    </div>
  `;
}

function renderDenominationInputs() {
  return `
    <div class="denomination-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(130px, 1fr)); gap:10px;">
      ${DENOMINATIONS.map((d) => `
        <div class="denom-field">
          <label class="field__label" style="margin-bottom:4px; font-size:12px;">فئة ${formatMoney(d)}</label>
          <div class="denomination-row" style="display:flex; align-items:center; gap:6px;">
            <input class="input denom-input" type="number" min="0" step="1" value="0"
              data-denom="${d}" placeholder="0" inputmode="numeric"
              style="font-size:16px; font-weight:700; text-align:center; padding:10px 4px;">
            <span style="font-size:12px; color:var(--muted); white-space:nowrap;">×</span>
            <span class="denom-subtotal text-muted" data-denom-subtotal="${d}" style="font-size:12px; min-width:50px; text-align:left;">٠</span>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function bindOpenShiftEvents(shift) {
  document.getElementById("refreshShiftBtn")?.addEventListener("click", () => render());

  // تحديث الإجمالي عند تغيير أي فئة
  const container = document.getElementById("denominationFields");
  if (container) {
    container.addEventListener("input", updateClosingTotal);
  }

  document.getElementById("closeShiftBtn")?.addEventListener("click", async () => {
    const closingCash = getDenominationTotal();
    if (closingCash < 0) {
      toast("من فضلك أدخل أعداد صحيحة", "warning");
      return;
    }

    const totalCollected = (shift.collections || []).reduce((sum, c) => sum + Number(c.amount || 0), 0);
    const expected = shift.openingCash + totalCollected;
    const variance = closingCash - expected;

    const varianceText = variance === 0
      ? "الدرج متطابق تمامًا"
      : variance > 0
        ? `زيادة ${formatMoney(variance)} ج.م`
        : `عجز ${formatMoney(Math.abs(variance))} ج.م`;

    const ok = await confirmDialog({
      title: "تأكيد تقفيل الوردية",
      body: `
        <div style="text-align:right;">
          <div style="margin-bottom:10px; padding:12px; background:var(--bg); border-radius:var(--r-md);">
            <div style="font-size:12px; color:var(--muted); margin-bottom:4px;">الفلوس اللي عدّيتها</div>
            <div style="font-size:20px; font-weight:800;">${formatMoney(closingCash)} ج.م</div>
          </div>
          <div style="margin-bottom:10px; padding:12px; background:var(--bg); border-radius:var(--r-md);">
            <div style="font-size:12px; color:var(--muted); margin-bottom:4px;">النتيجة</div>
            <div style="font-size:18px; font-weight:800; color:${variance === 0 ? "var(--success)" : "var(--danger)"};">${varianceText}</div>
          </div>
          <div style="font-size:12px; color:var(--muted);">
            افتتاح: ${formatMoney(shift.openingCash)} + تحصيلات: ${formatMoney(totalCollected)} = المتوقع: ${formatMoney(expected)}
          </div>
        </div>
      `,
      confirmText: "تقفيل الوردية",
      tone: variance === 0 ? "success" : "warning",
    });
    if (!ok) return;

    const closed = closeShift(closingCash, getSession()?.username || "النظام");
    if (closed) {
      if (variance !== 0) {
        toast(`تم التقفيل — ${variance > 0 ? "زيادة" : "عجز"} ${formatMoney(Math.abs(variance))} ج.م`, "warning");
      } else {
        toast("تم التقفيل بنجاح — الدرج متطابق ✓", "success");
      }
      render();
    }
  });
}

function getDenominationTotal() {
  let total = 0;
  document.querySelectorAll(".denom-input").forEach((input) => {
    const count = parseInt(input.value) || 0;
    const denom = Number(input.dataset.denom);
    total += count * denom;
  });
  return total;
}

function updateClosingTotal() {
  let total = 0;
  document.querySelectorAll(".denom-input").forEach((input) => {
    const count = parseInt(input.value) || 0;
    const denom = Number(input.dataset.denom);
    const subtotal = count * denom;
    total += subtotal;
    const subEl = document.querySelector(`[data-denom-subtotal="${denom}"]`);
    if (subEl) subEl.textContent = subtotal > 0 ? `${count} × ${formatMoney(denom)} = ${formatMoney(subtotal)}` : "—";
  });
  const display = document.getElementById("closingTotalDisplay");
  if (display) display.textContent = total > 0 ? `${formatMoney(total)} ج.م` : "٠ ج.م";
}

/* ================= فتح وردية — صفحه كامله ================= */
function renderOpeningPage(shiftMode = "mandatory") {
  const shifts = getShifts().filter((s) => s.status === "closed");
  const lastShift = shifts.length ? shifts[shifts.length - 1] : null;

  if (shiftMode === "no_custody") {
    return `
      ${lastShift ? `
        <div style="font-size:13px; color:var(--muted); margin-bottom:16px; line-height:1.7;">
          آخر تقفيل: <strong>${lastShift.closedDate}</strong> —
          الحالة: ${lastShift.variance === 0 ? "✅ متطابق" : `⚠️ ${lastShift.variance > 0 ? "زيادة" : "عجز"} ${formatMoney(Math.abs(lastShift.variance))} ج.م`}
        </div>
      ` : ""}

      <div class="card card-pad" style="border:2px solid var(--primary);">
        <div class="card__head">
          <div class="card__title" style="color:var(--primary);">${icons.wallet} فتح الوردية — بدون عهدة</div>
        </div>
        <p style="font-size:13px; color:var(--muted); margin-bottom:16px; line-height:1.7;">
          هتفتح الوردية <strong>من غير ما تعدّ فلوس الصندوق</strong>. كل التحصيلات هتتسجل عادي والتدقيق هيشتغل — بس مفيش عهدة افتتاحية.
        </p>
        <div style="background:var(--primary-bg, rgba(59,130,246,0.08)); border:1px solid var(--primary-border, rgba(59,130,246,0.2)); border-radius:var(--r-md); padding:12px; font-size:12px; line-height:1.7;">
          <strong>📋 ملاحظة:</strong> عند التقليل، النظام هيساوي العهدة (صفر) بالفعلى. لو لقى فلوس — كلها هتتسجل كـ "ربح صندوق". لو ناقصة — هتتسجل كعجز.
        </div>
      </div>

      <div style="margin-top:16px;">
        <button class="btn btn-primary btn-lg btn-block" id="openingConfirmBtn">${icons.check} فتح الوردية بدون عهدة</button>
      </div>
    `;
  }

  // default: mandatory mode (denomination form)

  return `
    ${lastShift ? `
      <div style="font-size:13px; color:var(--muted); margin-bottom:16px; line-height:1.7;">
        آخر تقفيل: <strong>${lastShift.closedDate}</strong> —
        الحالة: ${lastShift.variance === 0 ? "✅ متطابق" : `⚠️ ${lastShift.variance > 0 ? "زيادة" : "عجز"} ${formatMoney(Math.abs(lastShift.variance))} ج.م`}
      </div>
    ` : ""}

    <div class="card card-pad" style="border:2px solid var(--primary);">
      <div class="card__head">
        <div class="card__title" style="color:var(--primary);">${icons.wallet} العهدة الافتتاحية</div>
      </div>
      <p style="font-size:13px; color:var(--muted); margin-bottom:16px; line-height:1.7;">
        عدّ الفلوس اللي في الدرج دلوقتي بالفئات واكتب العدد بتاع كل فئة.
      </p>
      <div class="denomination-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(130px, 1fr)); gap:10px;">
        ${DENOMINATIONS.map((d) => `
          <div class="denom-field" style="padding:8px; background:var(--bg); border-radius:var(--r-sm); border:1px solid var(--border);">
            <label class="field__label" style="margin-bottom:4px; font-size:12px;">فئة ${formatMoney(d)}</label>
            <div class="denomination-row" style="display:flex; align-items:center; gap:6px;">
              <input class="input opening-denom-input" type="number" min="0" step="1" value="0"
                data-denom="${d}" placeholder="0" inputmode="numeric"
                style="font-size:16px; font-weight:700; text-align:center; padding:10px 4px; width:100%;">
              <span style="font-size:12px; color:var(--muted); white-space:nowrap;">×</span>
              <span class="text-muted" style="font-size:12px; min-width:50px; text-align:left;" data-opening-subtotal="${d}">—</span>
            </div>
          </div>
        `).join("")}
      </div>
      <div style="display:flex; align-items:center; justify-content:space-between; margin-top:16px; padding-top:12px; border-top:1px solid var(--border);">
        <span style="font-size:13px; color:var(--muted);">إجمالي العهدة:</span>
        <span id="openingTotalDisplay" style="font-size:22px; font-weight:800; color:var(--primary);">٠ ج.م</span>
      </div>
    </div>

    <div style="margin-top:16px;">
      <button class="btn btn-primary btn-lg btn-block" id="openingConfirmBtn">${icons.check} فتح الوردية</button>
    </div>
  `;
}

function bindOpeningPageEvents(shiftMode = "mandatory") {
  document.getElementById("openingConfirmBtn")?.addEventListener("click", () => {
    const session = getSession();
    let total = 0;

    if (shiftMode === "no_custody") {
      total = 0;
    } else {
      document.querySelectorAll(".opening-denom-input").forEach((input) => {
        const count = parseInt(input.value) || 0;
        const denom = Number(input.dataset.denom);
        total += count * denom;
      });
    }

    const shift = openShift(total, session?.username || "النظام");
    if (shift) {
      toast(shiftMode === "no_custody" ? "تم فتح الوردية بدون عهدة ✓" : `تم فتح الوردية — العهدة: ${formatMoney(total)} ✓`, "success");
      render();
    }
  });

  if (shiftMode === "no_custody") return;

  const updateOpeningTotal = () => {
    let total = 0;
    document.querySelectorAll(".opening-denom-input").forEach((input) => {
      const count = parseInt(input.value) || 0;
      const denom = Number(input.dataset.denom);
      const subtotal = count * denom;
      total += subtotal;
      const subEl = document.querySelector(`[data-opening-subtotal="${denom}"]`);
      if (subEl) subEl.textContent = subtotal > 0 ? `${count} × ${formatMoney(denom)} = ${formatMoney(subtotal)}` : "—";
    });
    const display = document.getElementById("openingTotalDisplay");
    if (display) display.textContent = total > 0 ? `${formatMoney(total)} ج.م` : "٠ ج.م";
  };

  document.querySelectorAll(".opening-denom-input").forEach((input) => {
    input.addEventListener("input", updateOpeningTotal);
  });
}

/* ================= سجل الورديات ================= */
function renderShiftHistory() {
  const shifts = getShifts().filter((s) => s.status === "closed").slice().reverse();

  if (!shifts.length) return "";

  return `
    <div class="card card-pad">
      <div class="card__head">
        <div class="card__title">سجل الورديات المقفولة</div>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>فتحها</th>
              <th>أقفلها</th>
              <th>الافتتاح</th>
              <th>التحصيلات</th>
              <th>المتوقع</th>
              <th>الفعلي</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            ${shifts.map((s) => {
              const totalCollected = (s.collections || []).reduce((sum, c) => sum + Number(c.amount || 0), 0);
              const expected = (s.openingCash || 0) + totalCollected;
              return `
                <tr>
                  <td>${s.openedDate}</td>
                  <td class="text-muted">${escapeHTML(s.openedBy)}</td>
                  <td class="text-muted">${escapeHTML(s.closedBy || "—")}</td>
                  <td>${formatMoney(s.openingCash)}</td>
                  <td>${formatMoney(totalCollected)} <span class="text-muted" style="font-size:11px;">(${s.collections?.length || 0})</span></td>
                  <td style="font-weight:700;">${formatMoney(expected)}</td>
                  <td style="font-weight:700;">${formatMoney(s.closingCash)}</td>
                  <td>
                    ${s.variance === 0
                      ? `<span class="badge badge-success">متطابق</span>`
                      : `<span class="badge badge-danger">${s.variance > 0 ? "زيادة" : "عجز"} ${formatMoney(Math.abs(s.variance))}</span>`
                    }
                  </td>
                </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/* ================= Helpers ================= */
function typeLabel(type) {
  const labels = {
    session: "حصة",
    late: "متأخرات",
    wallet_deposit: "إيداع محفظة",
    extra_charge: "استحقاق",
  };
  return labels[type] || type;
}
