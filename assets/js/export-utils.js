// =========================================================
// Export Utilities — أدوات تصدير Excel و PDF/طباعة
// =========================================================

import { escapeHTML, todayISO } from "./helpers.js";
import { getSettings } from "./storage.js";

/**
 * يقرأ جدول HTML من الصفحة ويُصدّره كملف Excel (.xlsx) باستخدام SheetJS
 * @param {string} tableSelector - CSS selector للجدول (مثلاً "#gradesForm table" أو "#lateStudentsList table")
 * @param {string} filename - اسم الملف بدون امتداد
 */
export function exportTableToExcel(tableSelector, filename) {
  const table = document.querySelector(tableSelector);
  if (!table) {
    console.warn("exportTableToExcel: table not found for selector:", tableSelector);
    return;
  }

  if (typeof XLSX === "undefined") {
    console.error("SheetJS (XLSX) is not loaded. Add the CDN script to your HTML.");
    return;
  }

  const wb = XLSX.utils.book_new();

  // نسخ الجدول مع دعم RTL
  const clone = table.cloneNode(true);

  // إزالة أعمدة الإجراءات (الزرار الأخيرة) إن وُجدت
  clone.querySelectorAll("th:last-child, td:last-child").forEach((cell) => {
    const headerCells = clone.querySelectorAll("thead th");
    if (headerCells.length > 0 && cell === headerCells[headerCells.length - 1]) return;
    // لا نحذف العمود الأخير إذا كان فيه بيانات حقيقية
  });

  // تحويل HTML Table إلى array
  const ws = XLSX.utils.table_to_sheet(clone, { raw: false });

  // ضبط عرض الأعمدة تلقائيًا
  const colWidths = [];
  if (ws["!cols"]) {
    ws["!cols"].forEach((col) => {
      colWidths.push({ wch: Math.max(col.wch || 10, 12) });
    });
  }
  if (colWidths.length) ws["!cols"] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

  const settings = getSettings();
  const centerName = settings.centerName || "";
  const fullName = `${filename}_${todayISO()}${centerName ? "_" + centerName : ""}.xlsx`;

  XLSX.writeFile(wb, fullName);
}

/**
 * يفتح نافذة طباعة مخصصة للجدول المحدد (مع إمكانية الحفظ كـ PDF)
 * @param {string} tableSelector - CSS selector للجدول
 * @param {string} title - عنوان التقرير
 * @param {object} options - خيارات إضافية
 * @param {boolean} options.landscape - اتجاه أفقي (للجداول العريضة)
 * @param {string} options.orientation - "landscape" أو "portrait"
 */
export function printTableAsPDF(tableSelector, title, options = {}) {
  const table = document.querySelector(tableSelector);
  if (!table) {
    console.warn("printTableAsPDF: table not found for selector:", tableSelector);
    return;
  }

  const settings = getSettings();
  const centerName = settings.centerName || "السنتر";
  const isLandscape = options.landscape || options.orientation === "landscape";

  const printWindow = window.open("", "_blank");
  printWindow.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>${title} — ${centerName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Cairo',sans-serif; direction:rtl; padding:16px; color:#333; font-size:12px; }

    /* عنوان التقرير */
    .report-header { text-align:center; margin-bottom:14px; }
    .report-header h1 { font-size:18px; margin-bottom:2px; }
    .report-header .subtitle { color:#888; font-size:12px; }
    .report-header .date { color:#aaa; font-size:11px; margin-top:2px; }

    /* الجدول */
    table { width:100%; border-collapse:collapse; margin-top:6px; }
    th { background:#2c3e50; color:white; padding:7px 6px; font-size:11px; text-align:center; white-space:nowrap; }
    td { padding:5px 6px; border-bottom:1px solid #eee; text-align:center; font-size:11px; }
    tr:nth-child(even) { background:#f9f9f9; }
    td:first-child, th:first-child { text-align:right; }

    /* البادجات */
    .badge { padding:2px 8px; border-radius:10px; font-size:10px; font-weight:600; display:inline-block; }
    .badge-danger { background:#fdecea; color:#e74c3c; }
    .badge-warning { background:#fef5e7; color:#f39c12; }
    .badge-success { background:#eafaf1; color:#27ae60; }
    .badge-info { background:#eaf2f8; color:#2980b9; }
    .badge-neutral { background:#f0f0f0; color:#888; }
    .badge-primary { background:#eaf2f8; color:#2c3e50; }

    /* الفوتر */
    .footer { text-align:center; margin-top:16px; font-size:10px; color:#aaa; border-top:1px solid #eee; padding-top:6px; }

    /* طباعة */
    @media print {
      body { padding:8px; font-size:10px; }
      @page { margin:1cm; ${isLandscape ? "size:A4 landscape;" : ""} }
      th { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      tr:nth-child(even) { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      .no-print { display:none !important; }
    }
  </style>
</head>
<body>
  <div class="report-header">
    <h1>${escapeHTML(title)}</h1>
    <div class="subtitle">${escapeHTML(centerName)}</div>
    <div class="date">${todayISO()}</div>
  </div>
  ${table.outerHTML}
  <div class="footer">تم إنشاء التقرير بتاريخ ${todayISO()} — ${escapeHTML(centerName)}</div>
</body>
</html>`);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 350);
}
