/* ──────────────────────────────────────────────
   bulk-import.js — إضافة جماعية للطلاب من ملف
   ────────────────────────────────────────────── */
import { icons } from "./icons.js";
import { getStudents, saveStudents, getGrades, getGroups, getSettings } from "./storage.js";
import { escapeHTML, generateId } from "./helpers.js";
import { toast } from "./ui.js";
import { suggestStudentCode, findGroup } from "./lookups.js";

export function openBulkImportModal(preselectedGroupId) {
  if (document.getElementById("bulkImportOverlay")) return;

  const groups = getGroups();
  const grades = getGrades();
  const students = getStudents();

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
  let biGradeId = defaultGradeId;
  let biGroupId = defaultGroup?.id || "";

  function close() { ov.remove(); }

  function render() {
    const hasData = parsedRows.length > 0;
    const pending = parsedRows.filter((r) => !addedIds.has(r._key));
    const done = parsedRows.filter((r) => addedIds.has(r._key));

    ov.innerHTML = `
      <div class="bulk-modal" style="background:var(--surface,#fff);border-radius:16px;margin-bottom:40px;box-shadow:0 24px 60px rgba(0,0,0,.3);animation:ucdSlideUp .25s cubic-bezier(.16,1,.3,1);display:flex;flex-direction:column;max-width:820px;width:100%;">
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
              <textarea id="biTextArea" class="input" rows="4" dir="ltr" style="font-size:12px;font-family:monospace;width:100%;direction:ltr;" placeholder="${"كود الطالب\tاسم الطالب\tتلفون ولي الأمر\nSTU001\tأحمد علي\t01234567890\nSTU002\tمحمد حسن\t01123456789"}"></textarea>
              <div style="display:flex;gap:8px;margin-top:6px;">
                <button class="btn btn-primary btn-sm" id="biParseBtn">🔍 معاينة البيانات</button>
                <span class="text-muted" style="font-size:11px;align-self:center;">افصل بين الأعمدة بـ Tab أو Comma — سطر لكل طالب</span>
              </div>
            </div>
            <div id="biFileInfo" style="display:none;padding:10px;background:var(--bg);border-radius:var(--r-sm);font-size:13px;"></div>
            <div id="biRawPreview" style="display:none;margin-top:8px;">
              <details>
                <summary style="cursor:pointer;font-size:12px;color:var(--muted);">📄 النص المستخرج من الملف</summary>
                <pre id="biRawText" style="font-size:11px;font-family:monospace;direction:ltr;text-align:left;background:var(--bg);padding:10px;border-radius:8px;max-height:200px;overflow:auto;margin-top:6px;white-space:pre-wrap;"></pre>
              </details>
            </div>
          </div>

          <!-- STEP 3: Preview -->
          ${hasData ? `
          <div style="margin-bottom:14px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px;">
              <label style="font-weight:700;font-size:14px;">❸ معاينة — راجع البيانات قبل الإضافة</label>
              <div style="display:flex;gap:8px;align-items:center;">
                <span style="font-size:12px;color:var(--muted);">تم إضافة ${done.length} من ${parsedRows.length}</span>
                ${pending.length ? `<button class="btn btn-success btn-sm" id="biAddAllBtn">${icons.plus} إضافة الكل (${pending.length})</button>` : ""}
              </div>
            </div>
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
                    <td dir="ltr">${escapeHTML(r.phone || "—")}</td>
                    <td>${!isDone && !err ? `<button class="btn btn-outline btn-sm bi-add-one" data-key="${r._key}" title="إضافة هذا الطالب" style="color:var(--success);border-color:var(--success);min-width:36px;">${icons.plus}</button>` : ""}</td>
                  </tr>`;
                  }).join("")}
                </tbody>
              </table>
            </div>
          </div>
          ` : `
          <div style="padding:30px 0;text-align:center;color:var(--muted);">
            <div style="font-size:40px;margin-bottom:10px;">📋</div>
            <div style="font-size:14px;">الصق البيانات أو ارفع ملف Excel/Word لبدء المعاينة</div>
            <div style="font-size:12px;margin-top:4px;">تأكد من وجود 3 أعمدة: كود الطالب، اسم الطالب، تلفون ولي الأمر</div>
          </div>
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
      const rows = parseText(text, students, groups, grades);
      if (!rows.length) { toast("لا توجد بيانات صالحة للمعاينة — تأكد من الصيغة", "warning"); return; }
      parsedRows = rows;
      addedIds = new Set();
      render();
    });

    ov.querySelector("#biUploadBtn")?.addEventListener("click", () => {
      ov.querySelector("#biFileInput")?.click();
    });

    ov.querySelector("#biFileInput")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const rows = await parseFile(file, students, groups, grades);
      if (!rows.length) { toast("لم نتمكن من استخراج بيانات من الملف — جرب اللصق المباشر", "warning"); return; }

      parsedRows = rows;
      addedIds = new Set();

      const info = ov.querySelector("#biFileInfo");
      if (info) {
        info.style.display = "block";
        info.textContent = `📄 ${file.name} — تم استخراج ${rows.length} طالب`;
      }
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
      id: row.code || generateId("STU"),
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

/* ─── Parsing ─── */

function parseText(text, students, groups, grades) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];

  let actualSep = "\t";
  if (lines.some((l) => l.includes("\t"))) actualSep = "\t";
  else if (lines.some((l) => l.includes(";"))) actualSep = ";";
  else if (lines.some((l) => l.match(/\s{2,}/))) actualSep = /\s{2,}/;

  const startIdx = isHeaderLine(lines[0], actualSep) ? 1 : 0;

  const rows = [];
  const usedCodes = new Set(students.map((s) => s.code));
  let autoCode = 1;

  for (let i = startIdx; i < lines.length; i++) {
    let parts;
    if (actualSep instanceof RegExp) {
      parts = lines[i].split(actualSep).map((p) => p.trim());
    } else {
      parts = lines[i].split(actualSep).map((p) => p.trim());
    }

    parts = parts.filter((p) => p.length > 0);
    if (parts.length < 1) continue;

    let code, name, phone;
    const looksLikeCode = /^[A-Za-z0-9_/-]{2,}$/.test(parts[0]);

    const sel = document.getElementById("biGroupSelect");
    const grpId = sel?.value || groups[0]?.id || "";
    const grp = findGroup(groups, grpId);

    if (looksLikeCode && parts.length >= 2) {
      code = parts[0];
      name = parts[1];
      phone = parts.length >= 3 ? parts[2] : "";
    } else if (looksLikeCode && parts.length === 1) {
      code = parts[0];
      name = "";
      phone = "";
    } else {
      name = parts[0];
      const existingCount = getStudents().filter((s) => s.groupId === grpId).length;
      code = grp ? `${grp.code}${existingCount + autoCode}` : generateId("STU") + "_" + autoCode;
      autoCode++;
      phone = parts.length >= 2 ? parts[1] : "";
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
      _error: errors.length ? errors.join("، ") : null,
    });
    if (!errors.length && code) usedCodes.add(code);
  }

  return rows;
}

async function parseFile(file, students, groups, grades) {
  const ext = file.name.split(".").pop().toLowerCase();

  if (["xlsx", "xls"].includes(ext)) {
    return parseExcel(file, students, groups, grades);
  }

  if (ext === "docx") {
    return parseWord(file, students, groups, grades);
  }

  if (["csv", "tsv"].includes(ext)) {
    const text = await file.text();
    return parseText(text, students, groups, grades);
  }

  return [];
}

function parseExcel(file, students, groups, grades) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        if (typeof XLSX === "undefined") { resolve([]); return; }
        const wb = XLSX.read(e.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const text = data.map((row) => row.join("\t")).join("\n");
        resolve(parseText(text, students, groups, grades));
      } catch (err) { console.error("Excel parse error", err); resolve([]); }
    };
    reader.readAsArrayBuffer(file);
  });
}

function parseWord(file, students, groups, grades) {
  return new Promise((resolve) => {
    if (typeof mammoth === "undefined") {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js";
      script.onload = () => parseWordWithMammoth(file, students, groups, grades).then(resolve);
      script.onerror = () => resolve([]);
      document.head.appendChild(script);
    } else {
      parseWordWithMammoth(file, students, groups, grades).then(resolve);
    }
  });
}

async function parseWordWithMammoth(file, students, groups, grades) {
  try {
    const arrayBuffer = await file.arrayBuffer();

    // 1) HTML — preserves table structure with real cell boundaries
    const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
    const html = htmlResult.value;

    // 2) Parse tables via DOM (much more reliable than regex)
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const tables = doc.querySelectorAll("table");
    let tableLines = [];

    if (tables.length) {
      tables.forEach((table) => {
        table.querySelectorAll("tr").forEach((tr) => {
          const cells = [];
          tr.querySelectorAll("td, th").forEach((td) => {
            const text = td.textContent.trim();
            cells.push(text);
          });
          if (cells.length >= 1) tableLines.push(cells.join("\t"));
        });
      });
    }

    // 3) If no tables found, fall back to raw text
    let text;
    if (tableLines.length) {
      text = tableLines.join("\n");
    } else {
      const rawResult = await mammoth.extractRawText({ arrayBuffer });
      text = rawResult.value;
    }

    const rows = parseText(text, students, groups, grades);

    // Show extracted text for debugging
    const rawPreview = document.getElementById("biRawPreview");
    const rawText = document.getElementById("biRawText");
    if (rawPreview && rawText) {
      rawPreview.style.display = "block";
      rawText.textContent = text;
    }

    const info = document.getElementById("biFileInfo");
    if (info) {
      info.style.display = "block";
      info.textContent = `📄 ${file.name} — تم استخراج ${rows.length} طالب`;
    }

    return rows;
  } catch (err) {
    console.error("Word parse error", err);
    return [];
  }
}

function isHeaderLine(line, sep) {
  const lower = line.toLowerCase();
  const keywords = ["كود", "اسم", "تلفون", "code", "name", "phone", "الطالب", "student", "رقم", "تليفون", "الصف", "class", "grade"];
  return keywords.some((kw) => lower.includes(kw));
}

function todayISO() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
