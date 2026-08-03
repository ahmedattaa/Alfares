/* ──────────────────────────────────────────────
   bulk-import.js — إضافة جماعية للطلاب من ملف
   مع ربط الأعمدة بالحقول (Column Mapping) يدويًا
   ────────────────────────────────────────────── */
import { icons } from "./icons.js";
import { getStudents, saveStudents, getGrades, getGroups, getSettings } from "./storage.js";
import { escapeHTML, generateId } from "./helpers.js";
import { toast } from "./ui.js";
import { findGroup } from "./lookups.js";
import { appPath } from "./paths.js";

const BI_MAP_CACHE_KEY = "bulkImportMapCache_v1";

export function openBulkImportModal(preselectedGroupId) {
  if (document.getElementById("bulkImportOverlay")) return;

  const groups = getGroups();
  const grades = getGrades();

  const ov = document.createElement("div");
  ov.id = "bulkImportOverlay";
  ov.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:12px;padding-top:24px;background:rgba(15,23,42,0.55);backdrop-filter:blur(6px);animation:ucdFadeIn .2s ease;overflow-y:auto;";
  document.body.appendChild(ov);

  const validGroups = groups.filter((g) => g.gradeId && grades.find((gr) => gr.id === g.gradeId));
  const defaultGradeId = preselectedGroupId
    ? (groups.find((g) => g.id === preselectedGroupId)?.gradeId || grades[0]?.id)
    : grades[0]?.id;
  const groupsForDefaultGrade = validGroups.filter((g) => g.gradeId === defaultGradeId);
  const defaultGroup = preselectedGroupId ? validGroups.find((g) => g.id === preselectedGroupId) : groupsForDefaultGrade[0];

  let parsedRows = [];
  let addedIds = new Set();
  let biFileState = null;
  let biGradeId = defaultGradeId;
  let biGroupId = defaultGroup?.id || "";
  let biGrid = [];
  let biMapping = { code: -1, name: -1, phone: -1, skipHeader: false };
  let biState = "input"; // input | mapping | preview
  let biPastedText = "";
  let biSignature = "";
  let biMapError = "";

  const mappingCache = loadMappingCache();

  function close() { ov.remove(); }

  /* ── دخول بيانات جديدة (لصق أو ملف) → تلقائي أو شاشة ربط ── */
  function handleNewData(grid, text, fileMeta, emptyMsg) {
    biGrid = grid;
    biFileState = fileMeta && grid.length ? { ...fileMeta, text } : null;

    if (!grid.length) {
      parsedRows = [];
      biState = "input";
      biMapError = "";
      render();
      toast(emptyMsg || "لا توجد بيانات صالحة", "warning");
      return;
    }

    const auto = autoDetectMapping(grid);
    biSignature = makeSignature(grid, auto);
    const cached = mappingCache[biSignature];
    biMapping = cached || auto || { code: -1, name: -1, phone: -1, skipHeader: false };
    biMapError = "";

    if (biMapping.name >= 0) {
      biState = "preview";
      parsedRows = parseGrid(biGrid, biMapping, groups);
      addedIds = new Set();
    } else {
      biState = "mapping";
    }
    render();
  }

  function applyMapping() {
    if (biMapping.name < 0) {
      biMapError = "عمود اسم الطالب لازم يتعيّن — بدونه مش هتتقدر تضيف أي طالب.";
      render();
      return;
    }
    mappingCache[biSignature] = { ...biMapping };
    saveMappingCache(mappingCache);
    biState = "preview";
    parsedRows = parseGrid(biGrid, biMapping, groups);
    addedIds = new Set();
    biMapError = "";
    render();
  }

  /* ── شاشة ربط الأعمدة ── */
  function mappingPanelHTML() {
    const maxCols = biGrid.reduce((m, r) => Math.max(m, (r || []).length), 0);
    const start = biMapping.skipHeader ? 1 : 0;

    if (!maxCols) {
      return `<div style="padding:14px;color:var(--muted);font-size:13px;">لا توجد أعمدة للربط — جرب رفع ملف تاني أو لصق البيانات.</div>`;
    }

    const cols = [];
    for (let c = 0; c < maxCols; c++) {
      const label = biMapping.skipHeader
        ? (cleanCell(biGrid[0]?.[c]) || `العمود ${c + 1}`)
        : `العمود ${c + 1}`;
      const samples = [];
      for (let r = start; r < biGrid.length && samples.length < 3; r++) {
        const v = cleanCell(biGrid[r]?.[c]);
        if (v) samples.push(v);
      }
      cols.push({ label, samples, c });
    }

    return `
      <div style="margin-bottom:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
          <label style="font-weight:700;font-size:14px;">❸ اربط الأعمدة بالحقول</label>
          <span style="font-size:12px;color:var(--muted);">أي عمود مش بتعينه هيتجاهل تلقائيًا</span>
        </div>
        <div class="table-wrap" style="max-height:300px;overflow-y:auto;margin-bottom:10px;">
          <table class="table" style="font-size:13px;">
            <thead><tr>
              <th>العمود</th>
              <th>عينة من البيانات</th>
              <th>دوره</th>
            </tr></thead>
            <tbody>
              ${cols.map((col) => `
                <tr>
                  <td><strong>${escapeHTML(col.label)}</strong></td>
                  <td dir="ltr" style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);">${col.samples.length ? escapeHTML(col.samples.join(" ، ")) : "<span class='text-muted'>فارغ</span>"}</td>
                  <td>
                    <select class="select bi-col-role" data-col="${col.c}" style="max-width:175px;">
                      <option value="" ${biMapping.code !== col.c && biMapping.name !== col.c && biMapping.phone !== col.c ? "selected" : ""}>— تجاهل —</option>
                      <option value="code" ${biMapping.code === col.c ? "selected" : ""}>كود الطالب</option>
                      <option value="name" ${biMapping.name === col.c ? "selected" : ""}>اسم الطالب</option>
                      <option value="phone" ${biMapping.phone === col.c ? "selected" : ""}>تلفون ولي الأمر</option>
                    </select>
                  </td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:10px;">
          <input type="checkbox" id="biSkipHeaderChk" ${biMapping.skipHeader ? "checked" : ""} style="width:16px;height:16px;">
          الصف الأول ترويسة (يتخطاه عند القراءة)
        </label>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-primary btn-sm" id="biApplyMappingBtn">${icons.check} تطبيق الربط</button>
          <span class="text-muted" style="font-size:12px;">هتظهر معاينة نهائية قبل إضافة أي طالب</span>
        </div>
        ${biMapError ? `<div style="color:var(--danger);font-size:13px;margin-top:8px;">⚠️ ${escapeHTML(biMapError)}</div>` : ""}
      </div>`;
  }

  function render() {
    const hasData = parsedRows.length > 0;
    const pending = parsedRows.filter((r) => !addedIds.has(r._key));
    const done = parsedRows.filter((r) => addedIds.has(r._key));
    const showMapping = biState === "mapping";
    const showPreview = biState === "preview";

    ov.innerHTML = `
      <div class="bulk-modal" style="background:var(--surface,#fff);border-radius:16px;margin-bottom:40px;box-shadow:0 24px 60px rgba(0,0,0,.3);animation:ucdSlideUp .25s cubic-bezier(.16,1,.3,1);display:flex;flex-direction:column;max-width:860px;width:100%;">
        <!-- HEADER -->
        <div style="flex:0 0 auto;padding:18px 22px;border-bottom:1px solid var(--border);">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:24px;">🚀</span>
            <div style="flex:1;">
              <div style="font-size:17px;font-weight:800;">إدخال سريع لطلبة لمجموعة</div>
              <div style="font-size:12px;color:var(--muted);">أضف عدد كبير من الطلاب دفعة واحدة من ملف Excel / Word أو لصق مباشر</div>
            </div>
            <button class="bi-close-x" style="background:var(--bg);border:none;border-radius:10px;width:34px;height:34px;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;">✕</button>
          </div>
        </div>

        <!-- BODY -->
        <div style="flex:1;overflow-y:auto;padding:18px 22px;" id="bulkImportBody">

          <!-- STEP 1: Grade + Group -->
          <div style="margin-bottom:16px;">
            <label style="font-weight:700;font-size:14px;display:block;margin-bottom:6px;">❶ السنة الدراسية والمجموعة</label>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              <select id="biGradeSelect" class="select" style="max-width:240px;">
                ${grades.map((g) => `<option value="${g.id}" ${g.id === biGradeId ? "selected" : ""}>${escapeHTML(g.name)}</option>`).join("")}
              </select>
              <select id="biGroupSelect" class="select" style="max-width:300px;">
                ${validGroups.filter((g) => g.gradeId === biGradeId).map((g) => {
                  return `<option value="${g.id}" ${g.id === biGroupId ? "selected" : ""}>${escapeHTML(g.name)} (${escapeHTML(g.code)})</option>`;
                }).join("")}
              </select>
            </div>
          </div>

          <!-- STEP 2: Data Input -->
          <div style="margin-bottom:14px;">
            <label style="font-weight:700;font-size:14px;display:block;margin-bottom:6px;">❷ أدخل البيانات</label>
            <div style="display:flex;gap:10px;margin-bottom:8px;flex-wrap:wrap;">
              <button class="btn btn-outline btn-sm" id="biPasteTabBtn" style="color:var(--primary);">📋 لصق من الحافظة</button>
              <button class="btn btn-outline btn-sm" id="biUploadBtn" style="color:var(--primary);">📂 رفع ملف</button>
              <input type="file" id="biFileInput" accept=".xlsx,.xls,.docx,.csv,.tsv" style="display:none;">
              <span class="text-muted" style="font-size:12px;align-self:center;">يدعم Excel (.xlsx) و Word (.docx)</span>
            </div>
            <div id="biPasteArea" style="display:none;">
              <textarea id="biTextArea" class="input" rows="4" dir="ltr" style="font-size:12px;font-family:monospace;width:100%;direction:ltr;" placeholder="${"كود الطالب\tاسم الطالب\tتلفون ولي الأمر\nSTU001\tأحمد علي\t01234567890\nSTU002\tمحمد حسن\t01123456789"}">${escapeHTML(biPastedText)}</textarea>
              <div style="display:flex;gap:8px;margin-top:6px;">
                <button class="btn btn-primary btn-sm" id="biParseBtn">🔍 معاينة البيانات</button>
                <span class="text-muted" style="font-size:11px;align-self:center;">افصل بين الأعمدة بـ Tab أو Comma — ولو الأعمدة ملغبطة هتسألك تربطها بنفسك</span>
              </div>
            </div>
            ${biFileState ? `
            <div style="padding:10px;background:var(--bg);border-radius:var(--r-sm);font-size:13px;margin-top:8px;">📄 ${escapeHTML(biFileState.name)} — تم استخراج ${biFileState.rows} صف</div>
            ${biFileState.text ? `
            <details style="margin-top:8px;">
              <summary style="cursor:pointer;font-size:12px;color:var(--muted);">📄 النص المستخرج من الملف</summary>
              <pre style="font-size:11px;font-family:monospace;direction:ltr;text-align:left;background:var(--bg);padding:10px;border-radius:8px;max-height:200px;overflow:auto;margin-top:6px;white-space:pre-wrap;">${escapeHTML(biFileState.text)}</pre>
            </details>` : ""}
            ` : ""}
          </div>

          <!-- STEP 2.5: Column Mapping -->
          ${showMapping ? mappingPanelHTML() : ""}

          <!-- STEP 3: Preview -->
          ${showPreview ? `
          <div style="margin-bottom:14px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px;">
              <label style="font-weight:700;font-size:14px;">❹ معاينة — راجع البيانات قبل الإضافة</label>
              <div style="display:flex;gap:8px;align-items:center;">
                <button class="btn btn-outline btn-sm" id="biEditMappingBtn" title="تغيير أي عمود بيشير لإيه" style="color:var(--primary);">🎯 إعادة الربط</button>
                ${pending.length ? `<button class="btn btn-success btn-sm" id="biAddAllBtn">${icons.plus} إضافة الكل (${pending.length})</button>` : ""}
              </div>
            </div>
            ${hasData ? `
            <div class="table-wrap" style="max-height:340px;overflow-y:auto;">
              <table class="table" style="font-size:13px;">
                <thead><tr>
                  <th></th>
                  <th>كود الطالب</th>
                  <th>اسم الطالب</th>
                  <th>المجموعة</th>
                  <th>تلفون ولي الأمر</th>
                  <th></th>
                </tr></thead>
                <tbody>
                  ${parsedRows.map((r, idx) => {
                    const isDone = addedIds.has(r._key);
                    const err = r._error;
                    return `
                  <tr class="bi-row ${isDone ? "bi-row-done" : ""}" data-key="${r._key}">
                    <td style="text-align:center;">${isDone ? `<span style="color:var(--success);font-weight:700;">✓</span>` : `<span class="text-muted">${idx + 1}</span>`}</td>
                    <td style="font-weight:${err ? "400" : "700"}; color:${err ? "var(--danger)" : "inherit"};">${err ? `<span title="${escapeHTML(err)}">⚠️</span> ` : ""}${escapeHTML(r.code || "—")}</td>
                    <td>${escapeHTML(r.name || "—")}</td>
                    <td class="text-muted">${escapeHTML(r.groupName)}</td>
                    <td dir="ltr">${r._phoneNote ? `<span title="${escapeHTML(r._phoneNote)}" style="cursor:help;">⚠️</span> ` : ""}${escapeHTML(r.phone || "—")}</td>
                    <td>${!isDone && !err ? `<button class="btn btn-outline btn-sm bi-add-one" data-key="${r._key}" title="إضافة هذا الطالب" style="color:var(--success);border-color:var(--success);min-width:36px;">${icons.plus}</button>` : ""}</td>
                  </tr>`;
                  }).join("")}
                </tbody>
              </table>
            </div>
            ` : `
            <div style="padding:20px 0;text-align:center;color:var(--muted);">
              <div style="font-size:14px;">لا توجد صفوف صالحة بعد الربط — تأكد من اختيار أعمدة صح ووجود بيانات فعلية</div>
            </div>`}
          </div>
          ` : `
          ${biState === "input" ? `
          <div style="padding:30px 0;text-align:center;color:var(--muted);">
            <div style="font-size:40px;margin-bottom:10px;">📋</div>
            <div style="font-size:14px;">الصق البيانات أو ارفع ملف Excel/Word لبدء المعاينة</div>
            <div style="font-size:12px;margin-top:4px;">3 أعمدة: كود الطالب، اسم الطالب، تلفون ولي الأمر — أو أي ترتيب، النظام هيسألك تربطه</div>
          </div>` : ""}
          `}
        </div>

        <!-- FOOTER -->
        <div style="flex:0 0 auto;padding:12px 22px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <span class="text-muted" style="font-size:12px;">لما تضغط ${icons.plus} بيطلع صوت تأكيد — كمراجعة قبل إضافة كل طالب</span>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-outline btn-sm" id="biCloseBtn">إغلاق</button>
          </div>
        </div>
      </div>
    `;

    ov.querySelector(".bi-close-x")?.addEventListener("click", close);
    ov.querySelector("#biCloseBtn")?.addEventListener("click", close);

    const biGradeSel = ov.querySelector("#biGradeSelect");
    const biGroupSel = ov.querySelector("#biGroupSelect");
    biGradeSel?.addEventListener("change", () => {
      biGradeId = biGradeSel.value;
      const relevant = validGroups.filter((g) => g.gradeId === biGradeId);
      biGroupId = relevant.some((g) => g.id === biGroupId) ? biGroupId : (relevant[0]?.id || "");
      updateGroupNames();
      render();
    });
    biGroupSel?.addEventListener("change", () => {
      biGroupId = biGroupSel.value;
      updateGroupNames();
      render();
    });

    const pasteBtn = ov.querySelector("#biPasteTabBtn");
    const pasteArea = ov.querySelector("#biPasteArea");
    if (pasteBtn) {
      pasteBtn.addEventListener("click", () => {
        pasteArea.style.display = pasteArea.style.display === "none" ? "block" : "none";
      });
    }

    ov.querySelector("#biParseBtn")?.addEventListener("click", () => {
      const text = ov.querySelector("#biTextArea")?.value || "";
      biPastedText = text;
      handleNewData(extractGridFromText(text), text, null, "لا توجد بيانات صالحة للمعاينة — تأكد من الصيغة");
    });

    ov.querySelector("#biUploadBtn")?.addEventListener("click", () => {
      ov.querySelector("#biFileInput")?.click();
    });

    ov.querySelector("#biFileInput")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const result = await parseFile(file);
      handleNewData(result.grid, result.text, { name: file.name, rows: result.grid.length }, "لم نتمكن من استخراج بيانات من الملف — جرب اللصق المباشر");
    });

    /* ── ربط الأعمدة ── */
    ov.querySelectorAll(".bi-col-role").forEach((sel) => {
      sel.addEventListener("change", () => {
        const col = Number(sel.dataset.col);
        const role = sel.value;
        if (biMapping.code === col) biMapping.code = -1;
        if (biMapping.name === col) biMapping.name = -1;
        if (biMapping.phone === col) biMapping.phone = -1;
        if (role === "code") biMapping.code = col;
        else if (role === "name") biMapping.name = col;
        else if (role === "phone") biMapping.phone = col;
        biMapError = "";
        render();
      });
    });

    ov.querySelector("#biSkipHeaderChk")?.addEventListener("change", (e) => {
      biMapping.skipHeader = e.target.checked;
      biMapError = "";
      render();
    });

    ov.querySelector("#biApplyMappingBtn")?.addEventListener("click", applyMapping);
    ov.querySelector("#biEditMappingBtn")?.addEventListener("click", () => {
      biState = "mapping";
      render();
    });

    ov.querySelectorAll(".bi-add-one").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.key;
        const row = parsedRows.find((r) => r._key === key);
        if (!row || addedIds.has(key)) return;
        addStudent(row);
        addedIds.add(key);
        Sounds.studentAdded();
        toast(`✓ تم إضافة ${row.name}`, "success");
        render();
      });
    });

    ov.querySelector("#biAddAllBtn")?.addEventListener("click", () => {
      const pending = parsedRows.filter((r) => !addedIds.has(r._key) && !r._error);
      if (!pending.length) return;
      pending.forEach((r) => {
        addStudent(r);
        addedIds.add(r._key);
      });
      Sounds.success();
      toast(`✓ تم إضافة ${pending.length} طالب للمجموعة`, "success");
      render();
    });
  }

  function addStudent(row) {
    const selectedGroupId = ov.querySelector("#biGroupSelect")?.value || biGroupId || defaultGroup?.id || "";
    const grp = groups.find((g) => g.id === selectedGroupId);
    const student = {
      id: generateId("STU"),
      name: row.name,
      code: row.code || "",
      gradeId: grp?.gradeId || "",
      groupId: selectedGroupId,
      parentPhone: row.phone || "",
      phone: "",
      fatherJob: "",
      school: "",
      joinDate: todayISO(),
      status: "active",
      discount: 0,
      lateBalance: 0,
      walletBalance: 0,
      dataStatus: "minimal",
    };
    const allStudents = getStudents();
    allStudents.push(student);
    saveStudents(allStudents);
  }

  function updateGroupNames() {
    const sel = ov.querySelector("#biGroupSelect");
    if (!sel) return;
    parsedRows.forEach((r) => {
      const grp = groups.find((g) => g.id === sel.value);
      r.groupName = grp ? grp.name : "—";
    });
  }

  render();
}

/* ═══════════════════ Parsing & Mapping ═══════════════════ */

/** تحويل نص خام إلى شبكة أعمدة (خلايا محفوظة — الفارغ في المنتصف لا يزيح الأعمدة) */
function extractGridFromText(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const sep = detectSeparator(lines);
  return lines.map((l) => splitRow(l, sep));
}

/** يكتشف الفاصل بين الأعمدة: Tab → فاصلة منقوطة → فاصلة → مسافتان فأكثر */
function detectSeparator(lines) {
  if (lines.some((l) => l.includes("\t"))) return "\t";
  if (lines.some((l) => l.includes(";"))) return ";";
  if (lines.some((l) => l.includes(","))) return ",";
  if (lines.some((l) => l.match(/\s{2,}/))) return /\s{2,}/;
  return "\t";
}

/** تقسيم سطر لأعمدة مع الحفاظ على الخلايا الفارغة في المنتصف (للفواصل الصريحة) */
function splitRow(line, sep) {
  if (sep instanceof RegExp) return line.split(sep).map((c) => c.trim()).filter(Boolean);
  let parts = line.split(sep).map((c) => c.trim());
  while (parts.length && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

function cleanCell(value) {
  return String(value ?? "").trim();
}

/** تنظيف الاسم: إزالة المسافات الزائدة وتوحيد الفواصل بين الكلمات */
function normalizeName(raw) {
  return String(raw ?? "").trim().replace(/\s+/g, " ");
}

/** توحيد صيغة رقم التليفون المصرى: إزالة الشَرطات والمسافات وتحويل +20/0020
 *  يرجع { value, note } — note فيها تنبيه لو الرقم غير صالح، بدون منع الإضافة */
function normalizePhone(raw) {
  const original = String(raw ?? "").trim();
  if (!original) return { value: "", note: "" };

  let p = original.replace(/[\s\-()./]+/g, "");
  if (p.startsWith("+20")) p = "0" + p.slice(3);
  else if (p.startsWith("0020")) p = "0" + p.slice(4);
  else if (p.startsWith("002")) p = "0" + p.slice(3);
  else if (p.startsWith("+")) p = p.slice(1);
  else if (/^20\d{10}$/.test(p)) p = "0" + p.slice(2);

  if (/^01\d{9}$/.test(p)) return { value: p, note: "" };
  return { value: original, note: "رقم التليفون غير صالح (يُقبل 11 رقمًا يبدأ بـ 01)" };
}

/** قراءة الشبكة حسب الربط الحالي → صفوف جاهزة للمعاينة */
function parseGrid(grid, mapping, groups) {
  const sel = document.getElementById("biGroupSelect");
  const grpId = sel?.value || groups[0]?.id || "";
  const grp = findGroup(groups, grpId);
  const existingCount = getStudents().filter((s) => s.groupId === grpId).length;
  const usedCodes = new Set(getStudents().map((s) => s.code));
  let autoCode = 1;
  const rows = [];
  const start = mapping.skipHeader ? 1 : 0;

  for (let i = start; i < grid.length; i++) {
    const parts = grid[i] || [];
    if (!parts.some((c) => cleanCell(c))) continue;

    let code = mapping.code >= 0 ? cleanCell(parts[mapping.code]) : "";
    let name = mapping.name >= 0 ? cleanCell(parts[mapping.name]) : "";
    let phone = mapping.phone >= 0 ? cleanCell(parts[mapping.phone]) : "";

    name = normalizeName(name);

    const phoneInfo = normalizePhone(phone);
    phone = phoneInfo.value;
    const phoneNote = phoneInfo.note;

    if (!code) {
      code = grp?.code ? `${grp.code}${existingCount + autoCode}` : `${generateId("STU")}_${autoCode}`;
      autoCode++;
    }

    const errors = [];
    if (!name) errors.push("الاسم فارغ");
    if (usedCodes.has(code)) errors.push("الكود موجود بالفعل");

    rows.push({
      _key: code || `_${i}`,
      code,
      name,
      phone,
      groupName: grp?.name || "—",
      _phoneNote: phoneNote,
      _error: errors.length ? errors.join("، ") : null,
    });
    if (!errors.length && code) usedCodes.add(code);
  }

  return rows;
}

/** اكتشاف الربط تلقائيًا: ترويسة أولًا، ثم شكل الأعمدة */
function autoDetectMapping(grid) {
  if (!grid.length) return { code: -1, name: -1, phone: -1, skipHeader: false };

  const row0 = (grid[0] || []).map((c) => cleanCell(c).toLowerCase());
  const roles = row0.map(classifyHeader);

  if (roles.some((r) => r !== null)) {
    let code = -1, name = -1, phone = -1;
    roles.forEach((r, idx) => {
      if (r === "code" && code === -1) code = idx;
      else if (r === "name" && name === -1) name = idx;
      else if (r === "phone" && phone === -1) phone = idx;
    });
    return { code, name, phone, skipHeader: true };
  }

  const prof = analyzeColumns(grid);
  return { code: prof.code, name: prof.name, phone: prof.phone, skipHeader: false };
}

/** تصنيف خلية الترويسة لدور (كود/اسم/تلفون) أو null */
function classifyHeader(cell) {
  if (!cell) return null;
  if (cell.includes("كود") || cell.includes("رقم الطالب") || /^(code|id|student\s*code|student\s*id)$/.test(cell)) return "code";
  if (cell.includes("اسم") || cell.includes("الطالب") || /^(name|student\s*name)$/.test(cell)) return "name";
  if (cell.includes("تلفون") || cell.includes("تليفون") || cell.includes("هاتف") || cell.includes("موبايل") || cell.includes("جوال") || /(phone|mobile)/.test(cell)) return "phone";
  return null;
}

/** تحليل شكل الأعمدة (بدون ترويسة) لتخمين أدوارها من البيانات */
function analyzeColumns(grid) {
  const maxCols = Math.max(...grid.map((r) => (r ? r.length : 0)));
  let code = -1, name = -1, phone = -1;

  for (let c = 0; c < maxCols; c++) {
    let codeLike = 0, nameLike = 0, phoneLike = 0, total = 0;
    for (let r = 0; r < grid.length && r <= 6; r++) {
      const cell = cleanCell(grid[r]?.[c]);
      if (!cell) continue;
      total++;
      const phoneRes = normalizePhone(cell);
      if (phoneRes.value && !phoneRes.note) phoneLike++;
      else if (/^[0-9][0-9\s\-()./]{8,}$/.test(cell)) phoneLike++;
      if (/^[A-Za-z0-9_/-]{2,}$/.test(cell)) codeLike++;
      if (/[\u0621-\u064A]/.test(cell)) nameLike++;
    }
    if (!total) continue;

    if (phone === -1 && phoneLike >= Math.max(1, Math.ceil(total * 0.6))) { phone = c; continue; }
    if (code === -1 && codeLike === total && nameLike === 0) { code = c; continue; }
    if (name === -1 && nameLike === total) { name = c; continue; }
  }

  return { code, name, phone };
}

/** توقيع يميز قالب الملف — لحفظ الربط مرة واحدة وإعادة استخدامه */
function makeSignature(grid, mapping) {
  if (mapping && mapping.skipHeader && grid[0] && grid[0].some((c) => cleanCell(c))) {
    return "h:" + grid[0].map((c) => cleanCell(c).toLowerCase()).join("\u0001");
  }
  const rows = grid.slice(0, 5).map((r) => (r || []).map((c) => classifySample(cleanCell(c))).join("|"));
  return "d:" + rows.join("\n");
}

function classifySample(cell) {
  if (!cell) return "·";
  const p = normalizePhone(cell);
  if (p.value && !p.note) return "p";
  if (/^[A-Za-z0-9_/-]{2,}$/.test(cell)) return "c";
  if (/[\u0621-\u064A]/.test(cell)) return "n";
  return "?";
}

/* ── حفظ الربط (حتى 50 قالبًا) ── */
function loadMappingCache() {
  try { return JSON.parse(localStorage.getItem(BI_MAP_CACHE_KEY)) || {}; } catch (e) { return {}; }
}

function saveMappingCache(cache) {
  try {
    const keys = Object.keys(cache);
    while (keys.length > 50) delete cache[keys.shift()];
    localStorage.setItem(BI_MAP_CACHE_KEY, JSON.stringify(cache));
  } catch (e) { /* تجاهل — localStorage مش متاح */ }
}

/* ── قراءة الملفات ── */

async function parseFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();

  if (["xlsx", "xls"].includes(ext)) return parseExcel(file);
  if (ext === "docx") return parseWord(file);
  if (["csv", "tsv"].includes(ext)) {
    const text = await file.text();
    return { grid: extractGridFromText(text), text };
  }
  return { grid: [], text: "" };
}

function parseExcel(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        if (typeof XLSX === "undefined") { resolve({ grid: [], text: "" }); return; }
        const wb = XLSX.read(e.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
        const grid = data.map((row) => (row || []).map((v) => v == null ? "" : String(v)));
        const text = grid.map((r) => r.join("\t")).join("\n");
        resolve({ grid, text });
      } catch (err) { console.error("Excel parse error", err); resolve({ grid: [], text: "" }); }
    };
    reader.readAsArrayBuffer(file);
  });
}

function parseWord(file) {
  return new Promise((resolve) => {
    if (typeof mammoth === "undefined") {
      const script = document.createElement("script");
      script.src = appPath("../vendor/mammoth.browser.min.js");
      script.onload = () => parseWordWithMammoth(file).then(resolve);
      script.onerror = () => resolve({ grid: [], text: "" });
      document.head.appendChild(script);
    } else {
      parseWordWithMammoth(file).then(resolve);
    }
  });
}

async function parseWordWithMammoth(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();

    // 1) HTML — بيحافظ على حدود الجداول الحقيقية
    const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
    const html = htmlResult.value;

    // 2) استخراج الجداول عبر DOM (أدق من الـ regex)
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const tables = doc.querySelectorAll("table");
    let grid = [];
    let text = "";

    if (tables.length) {
      tables.forEach((table) => {
        table.querySelectorAll("tr").forEach((tr) => {
          const cells = [];
          tr.querySelectorAll("td, th").forEach((td) => {
            cells.push(td.textContent.trim());
          });
          if (cells.some((c) => c)) grid.push(cells);
        });
      });
      text = grid.map((r) => r.join("\t")).join("\n");
    } else {
      // 3) من غير جداول → نرجع للنص الخام
      const rawResult = await mammoth.extractRawText({ arrayBuffer });
      text = rawResult.value;
      grid = extractGridFromText(text);
    }

    return { grid, text };
  } catch (err) {
    console.error("Word parse error", err);
    return { grid: [], text: "" };
  }
}

function todayISO() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
