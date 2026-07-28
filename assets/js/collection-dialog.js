// =========================================================
// Collection Dialog v3 — نموذج التحصيل الموحد
// تصميم سلس وبسيط — البنود واضحة دائماً — دفع فردى
// =========================================================

import { icons } from "./icons.js";
import { getStudents, saveStudents, getAllPayments, savePayments, getExtraCharges, saveExtraCharges, recordCashCollection, getGroups } from "./storage.js";
import { escapeHTML, formatMoney, todayISO } from "./helpers.js";
import { findGroup, dueAmount } from "./lookups.js";
import { toast } from "./ui.js";

/* ── بناء بنود التحصيل ── */

function buildCollectionItems(student) {
  const group = findGroup(getGroups(), student.groupId);
  const items = [];

  const unpaidPayments = getAllPayments()
    .filter((p) => p.studentId === student.id && p.status === "unpaid")
    .sort((a, b) => (a.sessionDate || a.date || "").localeCompare(b.sessionDate || b.date || ""));

  unpaidPayments.forEach((p) => {
    const amount = Number(p.amount || 0) || (group ? dueAmount(student, group) : 0);
    if (amount <= 0) return;
    const sessionDate = p.sessionDate || p.date || "";
    items.push({
      type: "session",
      id: p.id,
      label: `حصة ${sessionDate}`,
      detail: group?.name || "",
      amount,
      paymentRef: p,
    });
  });

  const unpaidCharges = getExtraCharges().filter((c) => c.studentId === student.id && c.status === "unpaid");
  unpaidCharges.forEach((c) => {
    items.push({
      type: "charge",
      id: c.id,
      label: c.name || "مستحق",
      detail: c.date || "",
      amount: Number(c.amount || 0),
    });
  });

  const lateBalance = Number(student.lateBalance || 0);
  const accountedFor = items.reduce((sum, i) => sum + i.amount, 0);
  if (lateBalance > accountedFor) {
    items.unshift({
      type: "late",
      id: null,
      label: "متأخرات عامة سابقة",
      detail: "",
      amount: lateBalance - accountedFor,
    });
  }

  return items;
}

/* ── النموذج الرئيسي ── */

export function openCollectionDialog(studentId, options = {}) {
  const students = getStudents();
  const student = students.find((s) => s.id === studentId);
  if (!student) return;

  const items = buildCollectionItems(student);
  if (!items.length) {
    toast("لا يوجد بنود مستحقة لهذا الطالب", "success");
    return;
  }

  const group = findGroup(getGroups(), student.groupId);
  const totalDue = items.reduce((sum, i) => sum + i.amount, 0);
  let collectedTotal = 0;
  let closed = false;

  const existing = document.getElementById("unifiedCollectionOverlay");
  if (existing) existing.remove();

  const ov = document.createElement("div");
  ov.id = "unifiedCollectionOverlay";
  ov.style.cssText = `
    position:fixed; inset:0; z-index:9999;
    display:flex; align-items:center; justify-content:center;
    padding:16px;
    background:rgba(15,23,42,0.55);
    backdrop-filter:blur(6px);
    animation: ucdFadeIn 0.2s ease;
  `;
  document.body.appendChild(ov);

  const paidCount = () => items.filter((i) => i._paid).length;
  const unpaidCount = () => items.filter((i) => !i._paid).length;
  const allPaid = () => unpaidCount() === 0;

  function render() {
    const remaining = totalDue - collectedTotal;

    ov.innerHTML = `
      <div style="
        background:var(--surface, #fff); border-radius:16px; width:100%; max-width:420px;
        max-height:85vh; overflow:hidden;
        box-shadow: 0 24px 60px rgba(0,0,0,0.3);
        animation: ucdSlideUp 0.25s cubic-bezier(0.16,1,0.3,1);
        display:flex; flex-direction:column;
      ">
        <!-- ====== HEADER ====== -->
        <div style="
          flex:0 0 auto; padding:14px 16px;
          background:linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 60%, #4338CA));
          color:#fff;
        ">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:20px;">💰</span>
            <div style="flex:1; min-width:0;">
              <div style="font-size:15px; font-weight:800;">${escapeHTML(student.name)}</div>
              <div style="font-size:11px; opacity:0.8; margin-top:1px;">${group ? escapeHTML(group.name) : ""}</div>
            </div>
            <div style="text-align:left;">
              <div style="font-size:18px; font-weight:800; color:#fef08a;">${formatMoney(remaining)}</div>
              <div style="font-size:9px; opacity:0.8;">متبقى من ${formatMoney(totalDue)}</div>
            </div>
          </div>
          ${!allPaid() ? `
            <!-- شريط التقدم -->
            <div style="margin-top:10px; height:6px; background:rgba(255,255,255,0.2); border-radius:3px; overflow:hidden;">
              <div style="width:${(paidCount() / items.length) * 100}%; height:100%; background:#fef08a; border-radius:3px; transition:width 0.4s ease;"></div>
            </div>
            <div style="display:flex; justify-content:space-between; margin-top:4px; font-size:10px; opacity:0.8;">
              <span>${paidCount()} / ${items.length} بنود</span>
              <span>${formatMoney(collectedTotal)} تم تحصيله</span>
            </div>
          ` : ""}
        </div>

        <!-- ====== ITEMS — دائماً ظاهر ====== -->
        <div style="max-height:50vh; overflow-y:auto; padding:8px 12px;">
          ${allPaid() ? `
            <div style="text-align:center; padding:24px 0;">
              <div style="font-size:36px; margin-bottom:8px; animation:ucdPop 0.3s cubic-bezier(0.34,1.56,0.64,1);">✅</div>
              <div style="font-size:15px; font-weight:800; color:var(--success);">تم التحصيل بنجاح</div>
              <div style="font-size:12px; color:var(--muted); margin-top:2px;">${formatMoney(collectedTotal)} — ${paidCount()} بنود</div>
            </div>
          ` : items.map((item, idx) => {
            const paid = item._paid;
            const icon = item.type === "session" ? "📅" : item.type === "charge" ? "📋" : "⚠️";
            const typeLabel = item.type === "session" ? "حصة" : item.type === "charge" ? "مستحق" : "متأخرات";
            return `
            <div style="
              display:flex; align-items:center; gap:10px;
              padding:10px 12px; margin-bottom:4px;
              border-radius:12px; border:1.5px solid ${paid ? "#bbf7d0" : "var(--border, #E4E7EC)"};
              background:${paid ? "#f0fdf4" : "#fff"};
              ${paid ? "opacity:0.6;" : ""}
              transition: all 0.3s ease;
            ">
              <!-- أيقونة النوع -->
              <div style="
                width:34px; height:34px; border-radius:10px; flex-shrink:0;
                display:flex; align-items:center; justify-content:center; font-size:15px;
                background:${paid ? "#dcfce7" : item.type === "session" ? "var(--primary-light, #EEF2FF)" : item.type === "charge" ? "var(--warning-light, #FEF3C7)" : "var(--danger-light, #FEE2E2)"};
              ">${paid ? "✓" : icon}</div>

              <!-- الاسم والتفاصيل -->
              <div style="flex:1; min-width:0;">
                <div style="font-size:13px; font-weight:700; color:var(--text, #1B2333); ${paid ? "text-decoration:line-through; color:var(--muted, #6B7280);" : ""}">
                  ${escapeHTML(item.label)}
                </div>
                <div style="font-size:10px; color:var(--muted, #6B7280); margin-top:1px;">
                  ${typeLabel}${item.detail ? " — " + escapeHTML(item.detail) : ""}
                </div>
              </div>

              <!-- المبلغ والزرار -->
              <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                <span style="font-size:14px; font-weight:800; color:${paid ? "var(--success, #1FA37C)" : "var(--danger, #E5484D)"};">
                  ${paid ? "✓ تم" : formatMoney(item.amount)}
                </span>
                ${!paid ? `
                  <button class="ucd-pay-btn" data-idx="${idx}" style="
                    padding:6px 16px; border-radius:8px; border:none;
                    background:var(--success, #1FA37C); color:#fff;
                    font-size:12px; font-weight:700; cursor:pointer;
                    white-space:nowrap;
                    box-shadow:0 2px 8px rgba(16,185,129,0.25);
                  ">دفع</button>
                ` : ""}
              </div>
            </div>
          `;}).join("")}
        </div>

        <!-- ====== FOOTER ====== -->
        <div style="flex:0 0 auto; padding:10px 12px; border-top:1px solid var(--border, #E4E7EC); background:var(--surface, #fff);">
          ${allPaid() ? `
            <button class="ucd-confirm" style="
              width:100%; padding:12px; border-radius:10px; border:none;
              background:var(--success, #1FA37C); color:#fff;
              font-size:14px; font-weight:700; cursor:pointer;
            ">✓ تأكيد التحصيل</button>
          ` : `
            <button class="ucd-pay-all" style="
              width:100%; padding:10px; border-radius:10px; border:none;
              background:var(--success, #1FA37C); color:#fff;
              font-size:13px; font-weight:700; cursor:pointer;
              display:flex; align-items:center; justify-content:center; gap:6px;
            ">${icons.check} دفع الكل — ${formatMoney(remaining)}</button>
          `}
        </div>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    ov.addEventListener("click", (e) => {
      if (e.target === ov) close();
    });

    ov.querySelectorAll(".ucd-pay-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        payItem(Number(btn.dataset.idx));
      });
    });

    const payAllBtn = ov.querySelector(".ucd-pay-all");
    if (payAllBtn) {
      payAllBtn.addEventListener("click", () => {
        items.forEach((item, idx) => {
          if (!item._paid) payItem(idx, true);
        });
        render();
      });
    }

    const confirmBtn = ov.querySelector(".ucd-confirm");
    if (confirmBtn) {
      confirmBtn.addEventListener("click", close);
    }
  }

  function payItem(idx, silent = false) {
    const item = items[idx];
    if (!item || item._paid) return;

    processPayment(item);
    item._paid = true;
    collectedTotal += item.amount;

    if (!silent) {
      toast(`✓ ${item.label} — ${formatMoney(item.amount)}`, "success");
      render();
    }
  }

  function processPayment(item) {
    const freshStudents = getStudents();
    const freshStudent = freshStudents.find((s) => s.id === student.id);
    if (!freshStudent) return;

    freshStudent.lateBalance = Math.max(0, (freshStudent.lateBalance || 0) - item.amount);

    if (item.type === "session" && item.paymentRef) {
      const freshPayments = getAllPayments();
      const payRecord = freshPayments.find((p) => p.id === item.id);
      if (payRecord) {
        payRecord.status = "paid";
        payRecord.amount = item.amount;
        payRecord.date = todayISO();
        payRecord.walletUsed = 0;
        payRecord.note = "تحصيل كاش";
      }
      savePayments(freshPayments);
      recordCashCollection(student.id, item.amount, "late", `تحصيل — ${item.label}`, { referenceId: item.id, referenceType: "payment" });
    } else if (item.type === "charge") {
      const charges = getExtraCharges();
      const chg = charges.find((c) => c.id === item.id);
      if (chg) { chg.status = "paid"; }
      saveExtraCharges(charges);
      recordCashCollection(student.id, item.amount, "extra_charge", `تحصيل — ${item.label}`, { referenceId: item.id, referenceType: "charge" });
    } else {
      recordCashCollection(student.id, item.amount, "late", `تحصيل — ${item.label}`, { referenceType: "general_late" });
    }

    saveStudents(freshStudents);
  }

  function close() {
    if (closed) return;
    closed = true;
    ov.style.animation = "ucdFadeOut 0.15s ease forwards";
    setTimeout(() => {
      ov.remove();
      if (options.onClose) options.onClose();
    }, 150);
  }

  render();
}
