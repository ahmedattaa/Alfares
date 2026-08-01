// =========================================================
// Settings — إعدادات السنتر + الجداول الأساسية (Lookup Tables)
// السنوات الدراسية / المجموعات / حالات الطالب / بيانات الحساب
// =========================================================

import { initPage } from "./app.js";
import { icons } from "./icons.js";
import {
  getSettings,
  saveSettings,
  getSystemSettings,
  resetAllData,
  getSession,
  getGrades,
  saveGrades,
  getGroups,
  saveGroups,
  getStudentStatuses,
  saveStudentStatuses,
  getStudents,
  getAcademicYears,
  saveAcademicYears,
  getTerms,
  saveTerms,
  getAcademicMonths,
  saveAcademicMonths,
  backfillLedger,
  isParentPortalEnabled,
  isStudentPortalEnabled,
  isBookingEnabled,
} from "./storage.js";
import { escapeHTML, generateId } from "./helpers.js";
import { toast, confirmDialog, formModal, emptyStateHTML } from "./ui.js";
import { suggestGroupCode, gradeName } from "./lookups.js";
import { PERMISSION_PAGES, PAGE_ACTIONS, canPerformSensitiveAction, canPerformAction } from "./permissions.js";
import { WEEKDAY_OPTIONS, formatDaysAr, formatTimeAr } from "./schedule.js";
import { TEMPLATE_REGISTRY, CATEGORIES, getTemplateBody, saveTemplateOverride, resetTemplate, resetAllTemplates, getAllOverrides } from "./whatsapp-templates.js";
import { appPath } from "./paths.js";

const TABS = [
  { id: "center", label: "بيانات السنتر", icon: icons.settings },
  { id: "academic", label: "العام الدراسي", icon: icons.calendar },
  { id: "grades", label: "سنوات الدراسة", icon: icons.clipboard },
  { id: "groups", label: "المجموعات", icon: icons.users },
  { id: "statuses", label: "حالات الطالب", icon: icons.check },
  { id: "whatsapp", label: "رسائل الواتساب", icon: icons.whatsapp || "💬" },
  { id: "finance", label: "ماليات", icon: icons.wallet },
  { id: "system", label: "المتابعة", icon: icons.radar },
  { id: "team", label: "حسابات", icon: icons.shield },
  { id: "danger", label: "منطقة خطرة", icon: icons.alert },
];

const content = await initPage("settings");
let activeTab = "center";

if (content) render();

function render() {
  content.innerHTML = `
    <div class="page__header">
      <div>
        <div class="page__title">الإعدادات</div>
        <div class="page__subtitle">البيانات الأساسية للسنتر وكل ما هو قابل للتعديل والتظبيط</div>
      </div>
    </div>

    <div class="tabs" id="settingsTabs">
      ${TABS.map(
        (t) => `<button class="tab-btn ${t.id === activeTab ? "is-active" : ""}" data-tab="${t.id}">${t.icon}<span>${t.label}</span></button>`
      ).join("")}
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
  if (activeTab === "center") return renderCenterTab(box);
  if (activeTab === "grades") return renderGradesTab(box);
  if (activeTab === "groups") return renderGroupsTab(box);
  if (activeTab === "statuses") return renderStatusesTab(box);
  if (activeTab === "academic") return renderAcademicPeriodsTab(box);
  if (activeTab === "finance") return renderFinanceTab(box);
  if (activeTab === "system") return renderSystemTab(box);
  if (activeTab === "team") return renderTeamTab(box);
  if (activeTab === "danger") return renderDangerTab(box);
  if (activeTab === "whatsapp") return renderWhatsAppTemplatesTab(box);
}

/* ================= بيانات السنتر ================= */
function renderCenterTab(box) {
  const settings = getSettings();
  const session = getSession();
  const parentPortalEnabled = isParentPortalEnabled();
  const studentPortalEnabled = isStudentPortalEnabled();
  const bookingEnabled = isBookingEnabled();

  box.innerHTML = `
    <div class="grid-2">
      <div class="card card-pad">
        <div class="card__head"><div class="card__title">بيانات السنتر</div></div>
        <form id="centerForm">
          <div class="field">
            <label class="field__label">اسم السنتر</label>
            <input class="input" name="centerName" value="${escapeHTML(settings.centerName || "")}" required>
          </div>
          <div class="field">
            <label class="field__label">العنوان</label>
            <input class="input" name="address" value="${escapeHTML(settings.address || "")}">
          </div>
          <div class="form-grid">
            <div class="field">
              <label class="field__label">رقم الهاتف</label>
              <input class="input" name="phone" value="${escapeHTML(settings.phone || "")}" placeholder="01xxxxxxxxx">
              <div class="field__hint">يظهر في الصفحة الرئيسية وبيتفتح الاتصال مباشرة عند الضغط.</div>
            </div>
            <div class="field">
              <label class="field__label">رقم الواتساب</label>
              <input class="input" name="whatsapp" value="${escapeHTML(settings.whatsapp || "")}" placeholder="01xxxxxxxxx">
              <div class="field__hint">لو فاضي، هيتحسب تلقائياً من رقم الهاتف.</div>
            </div>
          </div>
          <div class="field">
            <label class="field__label">العملة</label>
            <input class="input" name="currency" value="${escapeHTML(settings.currency || "ج.م")}" style="max-width:200px;">
          </div>
          <button class="btn btn-primary" type="submit">${icons.check} حفظ التغييرات</button>
        </form>
      </div>

      <div>
        <div class="card card-pad" style="margin-bottom:16px;">
          <div class="card__head"><div class="card__title">🔗 روابط السوشيال</div></div>
          <form id="socialForm">
            <div class="form-grid">
              <div class="field">
                <label class="field__label">فيسبوك</label>
                <input class="input" name="facebook" value="${escapeHTML(settings.socialLinks?.facebook || "")}" placeholder="https://facebook.com/...">
              </div>
              <div class="field">
                <label class="field__label">تيك توك</label>
                <input class="input" name="tiktok" value="${escapeHTML(settings.socialLinks?.tiktok || "")}" placeholder="https://tiktok.com/...">
              </div>
              <div class="field">
                <label class="field__label">انستجرام</label>
                <input class="input" name="instagram" value="${escapeHTML(settings.socialLinks?.instagram || "")}" placeholder="https://instagram.com/...">
              </div>
              <div class="field">
                <label class="field__label">يوتيوب</label>
                <input class="input" name="youtube" value="${escapeHTML(settings.socialLinks?.youtube || "")}" placeholder="https://youtube.com/...">
              </div>
              <div class="field">
                <label class="field__label">تيليجرام</label>
                <input class="input" name="telegram" value="${escapeHTML(settings.socialLinks?.telegram || "")}" placeholder="https://t.me/...">
              </div>
              <div class="field">
                <label class="field__label">سناب شات</label>
                <input class="input" name="snapchat" value="${escapeHTML(settings.socialLinks?.snapchat || "")}" placeholder="https://snapchat.com/...">
              </div>
            </div>
            <button class="btn btn-primary" type="submit">${icons.check} حفظ الروابط</button>
            <div class="field__hint" style="margin-top:8px;">الروابط اللي فيها بيانات هي اللي بتظهر في الصفحة الرئيسية ضمن «تابعنا على السوشيال».</div>
          </form>
        </div>
        <div class="card card-pad" style="margin-bottom:16px;">
          <div class="card__head"><div class="card__title">الحساب الحالى</div></div>
          <div class="field">
            <label class="field__label">الاسم</label>
            <input class="input" value="${escapeHTML(session?.name || "")}" disabled>
          </div>
          <div class="field">
            <label class="field__label">اسم المستخدم</label>
            <input class="input" value="${escapeHTML(session?.username || "")}" disabled>
          </div>
          <div class="field">
            <label class="field__label">الصلاحية</label>
            <input class="input" value="${session?.role === "admin" ? "مدير" : "مدرس مساعد"}" disabled>
          </div>
          <div class="field__hint">لتغيير كلمة المرور تواصل مع مدير النظام (سيتم دعم ذلك لاحقًا).</div>
        </div>

        <div class="card card-pad">
          <div class="card__head"><div class="card__title">🔊 المؤثرات الصوتية</div></div>
          <label style="display:flex; align-items:center; gap:8px; font-size:13.5px; font-weight:600; cursor:pointer;">
            <input type="checkbox" id="soundToggle" ${Sounds.enabled() ? "checked" : ""} style="width:16px;height:16px;">
            تفعيل المؤثرات الصوتية للأزرار
          </label>
          <div class="field__hint">صوت نجاح عند الدفع، صوت إرسال للواتساب، وصوت عند الحفظ والحذف.</div>
        </div>

        <div class="card card-pad">
          <div class="card__head"><div class="card__title">🚪 بوابات الدخول</div></div>
          <label style="display:flex; align-items:center; gap:8px; font-size:13.5px; font-weight:600; cursor:pointer; margin-bottom:10px;">
            <input type="checkbox" id="parentPortalToggle" ${parentPortalEnabled ? "checked" : ""} style="width:16px;height:16px;">
            السماح بدخول ولي الأمر للمتابعة
          </label>
          <div class="field__hint" style="margin:-4px 0 12px;">لو مقفول، تبويب «ولي أمر» وزر «متابعة ولي الأمر» مش هيظهروا في تسجيل الدخول والصفحة الرئيسية.</div>
          <label style="display:flex; align-items:center; gap:8px; font-size:13.5px; font-weight:600; cursor:pointer;">
            <input type="checkbox" id="studentPortalToggle" ${studentPortalEnabled ? "checked" : ""} style="width:16px;height:16px;">
            السماح بدخول الطالب لمتابعة درجاته
          </label>
          <div class="field__hint" style="margin:-4px 0 0;">لو مقفول، تبويب «طالب» وزر «بوابة الطالب» مش هيظهروا في تسجيل الدخول والصفحة الرئيسية.</div>
        </div>

        <div class="card card-pad">
          <div class="card__head"><div class="card__title">🗓️ الحجوزات أونلاين</div></div>
          <label style="display:flex; align-items:center; gap:8px; font-size:13.5px; font-weight:600; cursor:pointer;">
            <input type="checkbox" id="bookingToggle" ${bookingEnabled ? "checked" : ""} style="width:16px;height:16px;">
            تفعيل قسم الحجز واستقبال حجوزات جديدة
          </label>
          <div class="field__hint" style="margin:-4px 0 0;">لو مقفول، قسم «احجز مكانك» بيختفي من الصفحة الرئيسية ولا يتم استقبال حجوزات جديدة.</div>
          <div id="bookingRequestsWrap" style="margin-top:14px;"></div>
        </div>

        <div class="card card-pad">
          <div class="card__head"><div class="card__title">${icons.palette} المظهر والسمة</div></div>
          <div class="field">
            <label class="field__label">السمة</label>
            <select class="select" id="themeSelect" style="max-width:200px;">
              <option value="default">افتراضي</option>
              <option value="dark">داكن</option>
              <option value="light">فاتح</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("centerForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    data.whatsapp = (data.whatsapp || "").trim();
    data.phone = (data.phone || "").trim();
    saveSettings({ ...settings, ...data });
    Sounds.save();
    toast("تم حفظ بيانات السنتر بنجاح", "success");
  });

  document.getElementById("socialForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    const socialLinks = {};
    for (const key of Object.keys(data)) {
      const val = (data[key] || "").trim();
      if (val) socialLinks[key] = val;
    }
    saveSettings({ ...settings, ...getSettings(), socialLinks });
    Sounds.save();
    toast("تم حفظ روابط السوشيال بنجاح", "success");
  });

  document.getElementById("soundToggle")?.addEventListener("change", (e) => {
    const on = Sounds.toggle();
    toast(on ? "تم تفعيل المؤثرات الصوتية" : "تم إيقاف المؤثرات الصوتية", on ? "success" : "info");
  });

  document.getElementById("parentPortalToggle")?.addEventListener("change", (e) => {
    const on = e.target.checked;
    saveSettings({ ...getSettings(), parentPortalEnabled: on });
    toast(on ? "تم تفعيل دخول ولي الأمر" : "تم إيقاف دخول ولي الأمر", on ? "success" : "info");
  });

  document.getElementById("studentPortalToggle")?.addEventListener("change", (e) => {
    const on = e.target.checked;
    saveSettings({ ...getSettings(), studentPortalEnabled: on });
    toast(on ? "تم تفعيل دخول الطالب" : "تم إيقاف دخول الطالب", on ? "success" : "info");
  });

  document.getElementById("bookingToggle")?.addEventListener("change", (e) => {
    const on = e.target.checked;
    saveSettings({ ...getSettings(), bookingEnabled: on });
    toast(on ? "تم تفعيل الحجوزات أونلاين" : "تم إيقاف استقبال الحجوزات", on ? "success" : "info");
  });

  renderBookingRequests();

  function getBookingRequests() {
    try {
      const raw = localStorage.getItem("booking_requests");
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function renderBookingRequests() {
    const wrap = document.getElementById("bookingRequestsWrap");
    if (!wrap) return;
    const requests = getBookingRequests();
    const pending = requests.filter(r => r.status === "pending");
    if (!requests.length) {
      wrap.innerHTML = "";
      return;
    }
    wrap.innerHTML = `
      <div class="card__head" style="margin-bottom:8px;"><div class="card__title" style="font-size:13px;">طلبات الحجز <span style="color:var(--danger);">(${pending.length})</span></div></div>
      ${requests.slice().reverse().map(r => `
        <div style="display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:10px; margin-bottom:6px; background:color-mix(in srgb, var(--surface) 55%, transparent); border:1px solid var(--border);">
          <div style="flex:1; min-width:0;">
            <div style="font-weight:700; font-size:13.5px;">${escapeHTML(r.name)} <span style="font-weight:400; color:var(--muted); font-size:12px;">${escapeHTML(r.group)}</span></div>
            <div style="font-size:12px; color:var(--muted);">${escapeHTML(r.phone)} · ${new Date(r.createdAt).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}</div>
          </div>
          <span style="font-size:11px; font-weight:700; padding:3px 9px; border-radius:99px; ${r.status === "pending" ? "color:var(--warning); background:color-mix(in srgb, var(--warning) 15%, transparent);" : "color:var(--success); background:color-mix(in srgb, var(--success) 15%, transparent);"}">${r.status === "pending" ? "قيد الانتظار" : "تم التواصل"}</span>
          ${r.status === "pending" ? `<button class="btn btn-success btn-sm bk-done" data-id="${r.id}">${icons.check} تم</button>` : ""}
          <button class="btn btn-sm" style="color:var(--danger);" data-bk-del="${r.id}">${icons.trash}</button>
        </div>
      `).join("")}
    `;
    wrap.querySelectorAll(".bk-done").forEach(btn => btn.addEventListener("click", () => {
      const list = getBookingRequests();
      const item = list.find(x => x.id === btn.dataset.id);
      if (item) item.status = "accepted";
      try { localStorage.setItem("booking_requests", JSON.stringify(list)); } catch {}
      toast(`تم تأكيد التواصل مع ${item?.name || ""}`, "success");
      renderBookingRequests();
    }));
    wrap.querySelectorAll("[data-bk-del]").forEach(btn => btn.addEventListener("click", () => {
      const list = getBookingRequests().filter(x => x.id !== btn.dataset.bkDel);
      try { localStorage.setItem("booking_requests", JSON.stringify(list)); } catch {}
      toast("تم حذف الطلب", "info");
      renderBookingRequests();
    }));
  }

  document.getElementById("themeSelect")?.addEventListener("change", (e) => {
    const theme = e.target.value;
    try { localStorage.setItem("center_active_theme", theme); document.documentElement.setAttribute("data-theme", theme); } catch {}
    toast("تم تغيير السمة", "success");
  });
}

/* ================= الإدارة المالية ================= */
function renderFinanceTab(box) {
  const settings = getSettings();
  const sys = getSystemSettings();

  box.innerHTML = `
    <div class="grid-2">
      <div class="card card-pad">
        <div class="card__head"><div class="card__title">${icons.wallet} إعدادات المحفظة</div></div>
        <form id="walletForm">
          <div class="field">
            <label style="display:flex; align-items:center; gap:8px; font-size:13.5px; font-weight:600; cursor:pointer;">
              <input type="checkbox" name="autoDeductWallet" ${settings.autoDeductWallet !== false ? "checked" : ""} style="width:16px;height:16px;">
              خصم تلقائي من المحفظة عند تسجيل الحضور
            </label>
            <div class="field__hint">لو مفعّل، النظام بيخصم ثمن الحصة من محفظة الطالب تلقائيًا لما بيتسجل عليه حضور مدفوع.</div>
          </div>
          <div class="field">
            <label style="display:flex; align-items:center; gap:8px; font-size:13.5px; font-weight:600; cursor:pointer;">
              <input type="checkbox" name="autoDeductMaterials" ${settings.autoDeductMaterials ? "checked" : ""} style="width:16px;height:16px;">
              خصم تلقائي من المحفظة للملازم والاستحقاقات
            </label>
            <div class="field__hint">لو مفعّل، أي ملزمة أو استحقاق إضافي هيتخصم من المحفظة لو فيه رصيد كافي.</div>
          </div>
          <div class="field">
            <label class="field__label">حد السحب على المكشوف (ج.م)</label>
            <input type="number" name="overdraftLimit" min="-999" max="0" step="5" value="${sys.overdraftLimit}" style="max-width:100px;">
            <div class="field__hint">صفر = ممنوع السحب على المكشوف. قيم سالبة تسمح بالدخول بالدين حتى هذا الحد.</div>
          </div>
          <div class="field">
            <label class="field__label">أولوية الخصم من المحفظة</label>
            <select name="deductionPriority" style="max-width:200px;">
              <option value="session_first" ${sys.deductionPriority === "session_first" ? "selected" : ""}>حصة اليوم أولاً</option>
              <option value="debt_first" ${sys.deductionPriority === "debt_first" ? "selected" : ""}>الديون القديمة أولاً</option>
            </select>
            <div class="field__hint">عند شحن المحفظة، هل يتم خصم قيمة الحصة أولاً أم سداد الديون القديمة؟</div>
          </div>
          <button class="btn btn-primary btn-sm" type="submit">${icons.check} حفظ إعدادات المحفظة</button>
        </form>
      </div>

      <div>
        <div class="card card-pad">
          <div class="card__head"><div class="card__title">💰 وضع الصندوق (الوردية)</div></div>
          <form id="shiftModeForm">
            <div style="display:flex; flex-direction:column; gap:10px;">
              <label style="display:flex; align-items:flex-start; gap:10px; padding:12px; border:1px solid var(--border); border-radius:var(--r-md); cursor:pointer; background:${(settings.shiftMode || "mandatory") === "mandatory" ? "var(--primary-bg, rgba(59,130,246,0.08))" : "var(--bg)"};">
                <input type="radio" name="shiftMode" value="mandatory" ${(settings.shiftMode || "mandatory") === "mandatory" ? "checked" : ""} style="width:18px; height:18px; accent-color:var(--primary); margin-top:2px;">
                <div>
                  <div style="font-weight:700; font-size:14px;">🔒 وردية إجبارية (الافتراضى)</div>
                  <div class="text-muted" style="font-size:12px; line-height:1.6; margin-top:4px;">المدرس لازم يعدّ فلوس الصندوق بالفئات قبل ما يفتح الوردية. آمن 100% — كل جنيه ليه سجل. التدقيق الأعمى كامل عند التقليل.</div>
                  <span class="badge badge-success" style="margin-top:6px; font-size:10px;">⭐ الأعلى أماناً</span>
                </div>
              </label>

              <label style="display:flex; align-items:flex-start; gap:10px; padding:12px; border:1px solid var(--border); border-radius:var(--r-md); cursor:pointer; background:${settings.shiftMode === "no_custody" ? "var(--primary-bg, rgba(59,130,246,0.08))" : "var(--bg)"};">
                <input type="radio" name="shiftMode" value="no_custody" ${settings.shiftMode === "no_custody" ? "checked" : ""} style="width:18px; height:18px; accent-color:var(--primary); margin-top:2px;">
                <div>
                  <div style="font-weight:700; font-size:14px;">🔓 وردية بدون عهدة</div>
                  <div class="text-muted" style="font-size:12px; line-height:1.6; margin-top:4px;">المدرس يفتح الوردية من غير ما يعدّ فلوس. كل الدفعات بتتسجل والتدقيق شغال — بس مفيش نقطة مرجعية للعهدة الافتتاحية. مناسب للسناتر اللي مش بتحتفظ بفلوس في الصندوق.</div>
                  <span class="badge badge-primary" style="margin-top:6px; font-size:10px;">✅ آمن + مرن</span>
                </div>
              </label>

              <label style="display:flex; align-items:flex-start; gap:10px; padding:12px; border:1px solid var(--border); border-radius:var(--r-md); cursor:pointer; background:${settings.shiftMode === "disabled" ? "var(--primary-bg, rgba(59,130,246,0.08))" : "var(--bg)"};">
                <input type="radio" name="shiftMode" value="disabled" ${settings.shiftMode === "disabled" ? "checked" : ""} style="width:18px; height:18px; accent-color:var(--primary); margin-top:2px;">
                <div>
                  <div style="font-weight:700; font-size:14px;">⚠️ تعطيل الوردية</div>
                  <div class="text-muted" style="font-size:12px; line-height:1.6; margin-top:4px;">المدرس يقدر يشتغل من غير وردية. مفيش تدقيق على الصندوق ومفيش تقرير يومي كامل. استخدمه فقط في حالات استثنائية مؤقتة.</div>
                  <span class="badge badge-danger" style="margin-top:6px; font-size:10px;">⚡ أقل أماناً — للمواقف الطارئة</span>
                </div>
              </label>
            </div>
            <button class="btn btn-primary btn-sm" type="submit" style="margin-top:12px;">${icons.check} حفظ وضع الصندوق</button>
          </form>
        </div>

        <div class="card card-pad" style="margin-top:16px;">
          <div class="card__head"><div class="card__title">${icons.settings} تفعيل الميزات المالية</div></div>
          <form id="featuresForm">
            <div class="field">
              <label style="display:flex; align-items:center; gap:8px; font-size:13.5px; font-weight:600; cursor:pointer;">
                <input type="checkbox" name="enableWallet" ${settings.enableWallet !== false ? "checked" : ""} style="width:16px;height:16px;">
                ${icons.wallet} تفعيل المحفظة (Wallet)
              </label>
              <div class="field__hint">لو مفعّل، هتظهر محفظة الطالب وخصم تلقائي وإيداع. لو أطفته، هتختفي المحفظة من كل حتة في الموقع.</div>
            </div>
            <div class="field">
              <label style="display:flex; align-items:center; gap:8px; font-size:13.5px; font-weight:600; cursor:pointer;">
                <input type="checkbox" name="enableExtraCharges" ${settings.enableExtraCharges !== false ? "checked" : ""} style="width:16px;height:16px;">
                ${icons.money} تفعيل الاستحقاقات المالية
              </label>
              <div class="field__hint">لو مفعّل، تقدر تضيف استحقاقات مالية (ملازم، امتحانات) للطلاب. لو أطفته، مش هيظهر حاجة اسمها استحقاقات في الموقع.</div>
            </div>
            <div class="field">
              <label style="display:flex; align-items:center; gap:8px; font-size:13.5px; font-weight:600; cursor:pointer;">
                <input type="checkbox" name="strictShiftClosing" ${sys.strictShiftClosing ? "checked" : ""} style="width:16px;height:16px;">
                🔒 تقفيل إجباري للوردية
              </label>
              <div class="field__hint">منع السكرتير من تسجيل الخروج أو إغلاق المتصفح إلا بعد جرد الدرج.</div>
            </div>
            <div class="field">
              <label class="field__label">تسعيرة الطالب الزائر (ج.م)</label>
              <input type="number" name="guestStudentFee" min="0" step="5" value="${sys.guestStudentFee}" style="max-width:100px;">
              <div class="field__hint">سعر افتراضي لحصة الطالب الزائر (0 = نفس سعر المجموعة).</div>
            </div>
            <button class="btn btn-primary btn-sm" type="submit">${icons.check} حفظ الإعدادات</button>
          </form>
        </div>
      </div>
    </div>
  `;

  document.getElementById("walletForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    const newSettings = {
      ...settings,
      ...sys,
      autoDeductWallet: fd.has("autoDeductWallet"),
      autoDeductMaterials: fd.has("autoDeductMaterials"),
      overdraftLimit: Number(data.overdraftLimit),
      deductionPriority: data.deductionPriority,
    };
    saveSettings(newSettings);
    Sounds.save();
    toast("تم حفظ إعدادات المحفظة", "success");
  });

  document.getElementById("shiftModeForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    const mode = data.shiftMode || "mandatory";
    saveSettings({ ...settings, shiftMode: mode });
    const labels = { mandatory: "وردية إجبارية", no_custody: "وردية بدون عهدة", disabled: "تعطيل الوردية" };
    Sounds.save();
    toast(`تم حفظ وضع الصندوق: ${labels[mode]}`, "success");
  });

  document.getElementById("featuresForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    const newSettings = {
      ...settings,
      ...sys,
      enableWallet: fd.has("enableWallet"),
      enableExtraCharges: fd.has("enableExtraCharges"),
      strictShiftClosing: fd.has("strictShiftClosing"),
      guestStudentFee: Number(data.guestStudentFee),
    };
    saveSettings(newSettings);
    Sounds.save();
    toast("تم حفظ الإعدادات المالية", "success");
  });
}

/* ================= إدارة المتابعة ================= */
function renderSystemTab(box) {
  const sys = getSystemSettings();

  box.innerHTML = `
    <div class="grid-2">
      <!-- 1. مؤشر الصحة -->
      <div class="card card-pad">
        <div class="card__head"><div class="card__title">📊 مؤشر الصحة والتقييم الأكاديمي</div></div>
        <form id="healthScoreForm">
          <div class="field">
            <label class="field__label">وزن الحضور (%)</label>
            <input type="range" name="healthWeightAttendance" min="0" max="100" value="${sys.healthWeightAttendance}" class="slider" data-target="hwaVal">
            <span id="hwaVal" style="font-weight:700;">${sys.healthWeightAttendance}%</span>
          </div>
          <div class="field">
            <label class="field__label">وزن الامتحانات (%)</label>
            <input type="range" name="healthWeightExams" min="0" max="100" value="${sys.healthWeightExams}" class="slider" data-target="hweVal">
            <span id="hweVal" style="font-weight:700;">${sys.healthWeightExams}%</span>
          </div>
          <div class="field">
            <label class="field__label">وزن السلوك (%)</label>
            <input type="range" name="healthWeightBehavior" min="0" max="100" value="${sys.healthWeightBehavior}" class="slider" data-target="hwbVal">
            <span id="hwbVal" style="font-weight:700;">${sys.healthWeightBehavior}%</span>
          </div>
          <div class="field">
            <label class="field__label">عتبة اللون الأخضر (≥)</label>
            <input type="number" name="healthColorGreen" min="1" max="100" value="${sys.healthColorGreen}" style="max-width:100px;">
          </div>
          <div class="field">
            <label class="field__label">عتبة اللون الأصفر (≥)</label>
            <input type="number" name="healthColorYellow" min="0" max="99" value="${sys.healthColorYellow}" style="max-width:100px;">
          </div>
          <div class="field">
            <label class="field__label">درجة النجاح الافتراضية (%)</label>
            <input type="number" name="defaultPassPercentage" min="1" max="100" value="${sys.defaultPassPercentage}" style="max-width:100px;">
          </div>
          <button class="btn btn-primary btn-sm" type="submit">${icons.check} حفظ أوزان الصحة</button>
        </form>
      </div>

      <!-- 2. محرك التصعيد -->
      <div class="card card-pad">
        <div class="card__head"><div class="card__title">🚨 محرك تصعيد الإنذارات</div></div>
        <form id="escalationForm">
          <div class="field">
            <label class="field__label">حد الإيقاف التلقائي — عدد غيابات متتالية</label>
            <input type="number" name="autoLockThreshold" min="1" max="20" value="${sys.autoLockThreshold}" style="max-width:100px;">
            <div class="field__hint">بعد كام غياب متتالي يتم قفل حساب الطالب تلقائياً.</div>
          </div>
          <div class="field">
            <label class="field__label">فترة السماح بالتعويض (ساعة)</label>
            <input type="number" name="makeupGracePeriod" min="0" max="720" value="${sys.makeupGracePeriod}" style="max-width:100px;">
            <div class="field__hint">السماح للطالب بتعويض الحصة خلال كام ساعة قبل تسجيله غائب نهائياً.</div>
          </div>
          <div class="field">
            <label style="display:flex; align-items:center; gap:8px; font-size:13.5px; font-weight:600; cursor:pointer;">
              <input type="checkbox" name="financialLockEnabled" ${sys.financialLockEnabled ? "checked" : ""} style="width:16px;height:16px;">
              تفعيل الحظر المالي التلقائي
            </label>
            <div class="field__hint">يقفل الطالب تلقائياً إذا تجاوزت ديونه الحد المحدد.</div>
          </div>
          <div class="field">
            <label class="field__label">حد الديون للحظر المالي (ج.م)</label>
            <input type="number" name="financialLockThreshold" min="0" step="10" value="${sys.financialLockThreshold}" style="max-width:120px;">
          </div>
          <button class="btn btn-primary btn-sm" type="submit">${icons.check} حفظ إعدادات التصعيد</button>
        </form>
      </div>

      <!-- 3. البوابات وإدارة الحصة -->
      <div class="card card-pad">
        <div class="card__head"><div class="card__title">🚪 البوابات وإدارة الحصة</div></div>
        <form id="gateForm">
          <div class="field">
            <label class="field__label">تجميد الحصة — إغلاق البوابة بعد (دقيقة)</label>
            <input type="number" name="sessionLockoutMinutes" min="0" max="120" value="${sys.sessionLockoutMinutes}" style="max-width:100px;">
            <div class="field__hint">بعد كام دقيقة من بداية الحصة يُمنع دخول الطلاب المتأخرين (0 = تعطيل).</div>
          </div>
          <div class="field">
            <label class="field__label">السعة القصوى للطوارئ (%)</label>
            <input type="number" name="maxCapacityBufferPercent" min="0" max="50" value="${sys.maxCapacityBufferPercent}" style="max-width:100px;">
            <div class="field__hint">نسبة زيادة مسموحة عن سعة القاعة لطلاب التعويض.</div>
          </div>
          <div class="field">
            <label style="display:flex; align-items:center; gap:8px; font-size:13.5px; font-weight:600; cursor:pointer;">
              <input type="checkbox" name="gateAudioFeedback" ${sys.gateAudioFeedback ? "checked" : ""} style="width:16px;height:16px;">
              🔊 صوت البوابة (Beeps)
            </label>
            <div class="field__hint">تشغيل صوت عند تسجيل الحضور السريع في بوابة الدخول.</div>
          </div>
          <button class="btn btn-primary btn-sm" type="submit">${icons.check} حفظ إعدادات البوابة</button>
        </form>
      </div>

      <!-- 4. التلعيب والمكافآت -->
      <div class="card card-pad">
        <div class="card__head"><div class="card__title">🏆 التلعيب والمكافآت</div></div>
        <form id="gamificationForm">
          <div class="field">
            <label style="display:flex; align-items:center; gap:8px; font-size:13.5px; font-weight:600; cursor:pointer;">
              <input type="checkbox" name="rewardEnabled" ${sys.rewardEnabled !== false ? "checked" : ""} style="width:16px;height:16px;">
              🎁 مكافآت التفوق المالية
            </label>
            <div class="field__hint">إضافة مبلغ لمحفظة الطالب تلقائياً عند حصوله على درجة كاملة في الامتحان الشامل.</div>
          </div>
          <div class="field">
            <label class="field__label">مبلغ المكافأة (ج.م)</label>
            <input type="number" name="rewardAmount" min="0" step="1" value="${sys.rewardAmount}" style="max-width:100px;">
          </div>
          <div class="field">
            <label class="field__label">عتبة شارة النخبة (%)</label>
            <input type="number" name="eliteBadgeThreshold" min="50" max="100" value="${sys.eliteBadgeThreshold}" style="max-width:100px;">
            <div class="field__hint">الحد الأدنى لدرجة الامتحان ليتم اعتباره امتحان نخبة.</div>
          </div>
          <div class="field">
            <label class="field__label">عدد الامتحانات المتتالية للشارة</label>
            <input type="number" name="eliteBadgeConsecutiveExams" min="1" max="20" value="${sys.eliteBadgeConsecutiveExams}" style="max-width:100px;">
            <div class="field__hint">كم امتحان متتالي يجب أن يحصل الطالب فيه على درجة النخبة ليحصل على الشارة.</div>
          </div>
          <button class="btn btn-primary btn-sm" type="submit">${icons.check} حفظ إعدادات التلعيب</button>
        </form>
      </div>
    </div>

    <div style="display:flex; justify-content:center; margin-top:24px;">
      <button class="btn btn-danger-outline" id="resetSystemSettingsBtn" style="font-size:13px;">⚠️ إعادة تعيين إعدادات إدارة المتابعة إلى الوضع الافتراضي</button>
    </div>
  `;

  // ربط السلايدرز
  box.querySelectorAll(".slider").forEach((sl) => {
    sl.addEventListener("input", () => {
      const target = document.getElementById(sl.dataset.target);
      if (target) target.textContent = sl.value + "%";
    });
  });

  // حفظ الصحة
  document.getElementById("healthScoreForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    data.healthWeightAttendance = Number(data.healthWeightAttendance);
    data.healthWeightExams = Number(data.healthWeightExams);
    data.healthWeightBehavior = Number(data.healthWeightBehavior);
    data.healthColorGreen = Number(data.healthColorGreen);
    data.healthColorYellow = Number(data.healthColorYellow);
    data.defaultPassPercentage = Number(data.defaultPassPercentage);
    saveSettings({ ...getSettings(), ...data });
    toast("تم حفظ أوزان مؤشر الصحة", "success");
  });

  // حفظ التصعيد
  document.getElementById("escalationForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    data.autoLockThreshold = Number(data.autoLockThreshold);
    data.makeupGracePeriod = Number(data.makeupGracePeriod);
    data.financialLockEnabled = fd.has("financialLockEnabled");
    data.financialLockThreshold = Number(data.financialLockThreshold);
    saveSettings({ ...getSettings(), ...data });
    toast("تم حفظ إعدادات التصعيد", "success");
  });

  // حفظ البوابة
  document.getElementById("gateForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    data.sessionLockoutMinutes = Number(data.sessionLockoutMinutes);
    data.maxCapacityBufferPercent = Number(data.maxCapacityBufferPercent);
    data.gateAudioFeedback = fd.has("gateAudioFeedback");
    saveSettings({ ...getSettings(), ...data });
    toast("تم حفظ إعدادات البوابة", "success");
  });

  // حفظ التلعيب
  document.getElementById("gamificationForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    data.rewardEnabled = fd.has("rewardEnabled");
    data.rewardAmount = Number(data.rewardAmount);
    data.eliteBadgeThreshold = Number(data.eliteBadgeThreshold);
    data.eliteBadgeConsecutiveExams = Number(data.eliteBadgeConsecutiveExams);
    saveSettings({ ...getSettings(), ...data });
    toast("تم حفظ إعدادات التلعيب", "success");
  });

  // إعادة تعيين إعدادات إدارة المتابعة
  document.getElementById("resetSystemSettingsBtn").addEventListener("click", async () => {
    const ok = await confirmDialog({ title: "إعادة تعيين الإعدادات", body: "هل أنت متأكد؟ سيتم إعادة كل إعدادات إدارة المتابعة إلى القيم الافتراضية.", confirmText: "تأكيد", tone: "danger" });
    if (!ok) return;
    const sysDefaults = { healthWeightAttendance: 40, healthWeightExams: 40, healthWeightBehavior: 20, healthColorGreen: 60, healthColorYellow: 40, defaultPassPercentage: 50, autoLockThreshold: 3, makeupGracePeriod: 48, financialLockEnabled: true, financialLockThreshold: 150, overdraftLimit: 0, deductionPriority: "session_first", guestStudentFee: 0, strictShiftClosing: false, sessionLockoutMinutes: 15, maxCapacityBufferPercent: 10, gateAudioFeedback: true, waSilentMode: false, waAbsenceBatching: false, waAbsenceBatchTime: "22:00", waReceiptToggle: true, rewardEnabled: true, rewardAmount: 10, eliteBadgeThreshold: 95, eliteBadgeConsecutiveExams: 3 };
    saveSettings({ ...getSettings(), ...sysDefaults });
    renderSystemTab(document.getElementById("tabContent"));
    toast("تم إعادة تعيين إعدادات إدارة المتابعة", "success");
  });
}

/* ================= السنوات الدراسية ================= */
function renderGradesTab(box) {
  const grades = getGrades().slice().sort((a, b) => a.order - b.order);

  box.innerHTML = `
    <div class="card card-pad">
      <div class="card__head">
        <div class="card__title">السنوات الدراسية</div>
        <button class="btn btn-primary btn-sm" id="addGradeBtn">${icons.plus} إضافة سنة دراسية</button>
      </div>
      <div id="gradesTable"></div>
    </div>
  `;

  document.getElementById("addGradeBtn").addEventListener("click", () => openGradeForm());
  renderGradesTable();
}

function renderGradesTable() {
  const box = document.getElementById("gradesTable");
  const grades = getGrades().slice().sort((a, b) => a.order - b.order);
  const groups = getGroups();

  if (!grades.length) {
    box.innerHTML = emptyStateHTML({ icon: icons.clipboard, title: "لا توجد سنوات دراسية بعد", text: "أضف أول سنة دراسية لتتمكن من إضافة مجموعات تابعة لها." });
    return;
  }

  box.innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>الترتيب</th><th>اسم السنة الدراسية</th><th>عدد المجموعات التابعة</th><th></th></tr></thead>
        <tbody>
          ${grades
            .map(
              (g) => `
            <tr>
              <td><span class="badge badge-neutral">${g.order}</span></td>
              <td style="font-weight:700;">${escapeHTML(g.name)}</td>
              <td class="text-muted">${groups.filter((gr) => gr.gradeId === g.id).length} مجموعة</td>
              <td>
                <div class="row-actions">
                  <button class="btn btn-outline btn-icon editGradeBtn" data-id="${g.id}" title="تعديل">${icons.edit}</button>
                  <button class="btn btn-outline btn-icon deleteGradeBtn" data-id="${g.id}" title="حذف">${icons.trash}</button>
                </div>
              </td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  box.querySelectorAll(".editGradeBtn").forEach((btn) => btn.addEventListener("click", () => openGradeForm(btn.dataset.id)));
  box.querySelectorAll(".deleteGradeBtn").forEach((btn) => btn.addEventListener("click", () => deleteGrade(btn.dataset.id)));
}

async function openGradeForm(editId = null) {
  const grades = getGrades();
  const editing = editId ? grades.find((g) => g.id === editId) : null;
  const nextOrder = editing ? editing.order : (Math.max(0, ...grades.map((g) => g.order)) + 1);

  const bodyHTML = `
    <div class="field">
      <label class="field__label">اسم السنة الدراسية</label>
      <input class="input" name="name" required value="${editing ? escapeHTML(editing.name) : ""}" placeholder="مثال: الصف الرابع الابتدائي">
    </div>
    <div class="field">
      <label class="field__label">الترتيب</label>
      <input class="input" name="order" type="number" min="1" required value="${nextOrder}">
      <div class="field__hint">الترتيب بيدخل فى تكوين كود المجموعات التابعة لهذه السنة.</div>
    </div>
  `;

  const data = await formModal({ title: editing ? "تعديل السنة الدراسية" : "إضافة سنة دراسية", bodyHTML, submitText: editing ? "حفظ التعديلات" : "إضافة" });
  if (!data) return;
  data.order = Number(data.order) || nextOrder;

  if (editing) {
    Object.assign(editing, data);
    saveGrades(grades);
    toast("تم تحديث السنة الدراسية", "success");
  } else {
    grades.push({ id: generateId("GR"), ...data });
    saveGrades(grades);
    toast("تم إضافة السنة الدراسية بنجاح", "success");
  }
  renderGradesTable();
}

async function deleteGrade(id) {
  const grades = getGrades();
  const g = grades.find((x) => x.id === id);
  const groupsUsingIt = getGroups().filter((gr) => gr.gradeId === id).length;

  if (groupsUsingIt > 0) {
    toast(`لا يمكن حذف السنة الدراسية لأنها مرتبطة بـ ${groupsUsingIt} مجموعة. احذف المجموعات أولًا.`, "danger");
    return;
  }

  const ok = await confirmDialog({
    title: "حذف السنة الدراسية",
    body: `هل أنت متأكد من حذف <strong>${escapeHTML(g?.name || "")}</strong>؟`,
    confirmText: "حذف نهائى",
    tone: "danger",
  });
  if (!ok) return;

  saveGrades(grades.filter((x) => x.id !== id));
  Sounds.delete();
  toast("تم حذف السنة الدراسية", "success");
  renderGradesTable();
}

/* ================= المجموعات ================= */
function renderGroupsTab(box) {
  const grades = getGrades();

  box.innerHTML = `
    <div class="card card-pad">
      <div class="card__head">
        <div class="card__title">المجموعات</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" id="bulkImportGroupsBtn" style="color:var(--success);border-color:var(--success);">🚀 إدخال سريع لطلبة لمجموعة</button>
          <button class="btn btn-primary btn-sm" id="addGroupBtn" ${grades.length ? "" : "disabled"}>${icons.plus} إضافة مجموعة</button>
        </div>
      </div>
      ${!grades.length ? `<div class="field__hint" style="margin-bottom:14px;">أضف سنة دراسية أولًا من تبويب "السنوات الدراسية" قبل إضافة مجموعات.</div>` : ""}
      <div id="groupsTable"></div>
    </div>
  `;

  document.getElementById("addGroupBtn")?.addEventListener("click", () => openGroupForm());
  document.getElementById("bulkImportGroupsBtn")?.addEventListener("click", () => import("./bulk-import.js").then((m) => m.openBulkImportModal()));
  renderGroupsTable();
}

function renderGroupsTable() {
  const box = document.getElementById("groupsTable");
  const groups = getGroups();
  const grades = getGrades();
  const students = getStudents();

  if (!groups.length) {
    box.innerHTML = emptyStateHTML({ icon: icons.users, title: "لا توجد مجموعات بعد" });
    return;
  }

  box.innerHTML = `
    <div class="table-wrap stg-groups-table-wrap">
      <table class="table">
        <thead><tr><th>الكود</th><th>اسم المجموعة</th><th>السنة الدراسية</th><th>المعاد</th><th>سعر الحصة</th><th>عدد الطلاب</th><th></th></tr></thead>
        <tbody>
          ${groups
            .map(
              (g) => `
            <tr>
              <td><span class="code-pill">${escapeHTML(g.code)}</span></td>
              <td style="font-weight:700;">${escapeHTML(g.name)}</td>
              <td class="text-muted">${escapeHTML(gradeName(grades, g.gradeId))}</td>
              <td class="text-muted">${escapeHTML(formatDaysAr(g.days))} — ${escapeHTML(formatTimeAr(g.time))}</td>
              <td>${g.sessionPrice} ج.م</td>
              <td class="text-muted">${students.filter((s) => s.groupId === g.id).length} / ${g.capacity}</td>
              <td>
                <div class="row-actions">
                  <a class="btn btn-outline btn-icon" href="group-students.html?groupId=${g.id}" title="عرض الطلاب">${icons.users}</a>
                  <button class="btn btn-outline btn-icon editGroupBtn" data-id="${g.id}" title="تعديل">${icons.edit}</button>
                  <button class="btn btn-outline btn-icon deleteGroupBtn" data-id="${g.id}" title="حذف">${icons.trash}</button>
                </div>
              </td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>

    <div class="stg-card-view">
      ${groups.map((g) => `
        <div class="stg-card">
          <div class="stg-card__header">
            <span><span class="code-pill">${escapeHTML(g.code)}</span> ${escapeHTML(g.name)}</span>
          </div>
          <div class="stg-card__body">
            <div class="stg-card__row"><span class="text-muted">السنة</span><span>${escapeHTML(gradeName(grades, g.gradeId))}</span></div>
            <div class="stg-card__row"><span class="text-muted">المعاد</span><span>${escapeHTML(formatDaysAr(g.days))} — ${escapeHTML(formatTimeAr(g.time))}</span></div>
            <div class="stg-card__row"><span class="text-muted">سعر الحصة</span><span>${g.sessionPrice} ج.م</span></div>
            <div class="stg-card__row"><span class="text-muted">الطلاب</span><span>${students.filter((s) => s.groupId === g.id).length} / ${g.capacity}</span></div>
          </div>
          <div class="stg-card__actions">
            <a class="btn btn-outline btn-sm" href="group-students.html?groupId=${g.id}">${icons.users} الطلاب</a>
            <button class="btn btn-outline btn-sm editGroupBtn" data-id="${g.id}">📝 تعديل</button>
            <button class="btn btn-outline btn-sm deleteGroupBtn" data-id="${g.id}" style="color:var(--danger);">🗑️ حذف</button>
          </div>
        </div>`).join("")}
    </div>
  `;

  box.querySelectorAll(".editGroupBtn").forEach((btn) => btn.addEventListener("click", () => openGroupForm(btn.dataset.id)));
  box.querySelectorAll(".deleteGroupBtn").forEach((btn) => btn.addEventListener("click", () => deleteGroup(btn.dataset.id)));
}

async function openGroupForm(editId = null) {
  const groups = getGroups();
  const grades = getGrades();
  const editing = editId ? groups.find((g) => g.id === editId) : null;
  const defaultGradeId = editing?.gradeId || grades[0]?.id || "";

  const bodyHTML = `
    <div class="form-grid">
      <div class="field">
        <label class="field__label">السنة الدراسية</label>
        <select class="select" name="gradeId" id="gradeSelectField" required>
          ${grades.map((g) => `<option value="${g.id}" ${defaultGradeId === g.id ? "selected" : ""}>${escapeHTML(g.name)}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label class="field__label">كود المجموعة</label>
        <input class="input" name="code" id="groupCodeField" required value="${editing ? escapeHTML(editing.code) : suggestGroupCode(grades, groups, defaultGradeId)}">
        <div class="field__hint">كود مقترح تلقائيًا — تقدر تعدّله بحرية بما يوافق نظامك الحالى.</div>
      </div>
    </div>
    <div class="field">
      <label class="field__label">اسم المجموعة</label>
      <input class="input" name="name" required value="${editing ? escapeHTML(editing.name) : ""}" placeholder="مثال: مجموعة السبت 5م">
    </div>
    <div class="field">
      <label class="field__label">أيام الحصة (يمكن اختيار أكتر من يوم)</label>
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(90px,1fr)); gap:8px; margin-top:6px;">
        ${WEEKDAY_OPTIONS.map(
          (w) => `
          <label style="display:flex; align-items:center; gap:6px; font-size:13.5px; font-weight:600; cursor:pointer;">
            <input type="checkbox" name="day_${w.key}" ${editing?.days?.includes(w.ar) ? "checked" : ""} style="width:16px;height:16px;">
            ${w.ar}
          </label>`
        ).join("")}
      </div>
    </div>
    <div class="form-grid">
      <div class="field">
        <label class="field__label">وقت بداية الحصة</label>
        <input class="input" type="time" name="time" required value="${editing ? editing.time : "17:00"}">
      </div>
      <div class="field">
        <label class="field__label">مدة الحصة (بالدقائق)</label>
        <input class="input" type="number" name="duration" min="15" step="15" required value="${editing ? editing.duration || 90 : 90}">
      </div>
    </div>
    <div class="form-grid">
      <div class="field">
        <label class="field__label">سعة المجموعة</label>
        <input class="input" name="capacity" type="number" min="1" required value="${editing ? editing.capacity : 20}">
      </div>
      <div class="field">
        <label class="field__label">سعر الحصة (ج.م)</label>
        <input class="input" name="sessionPrice" type="number" min="0" required value="${editing ? editing.sessionPrice : 50}">
      </div>
    </div>
  `;

  const promise = formModal({ title: editing ? "تعديل المجموعة" : "إضافة مجموعة جديدة", bodyHTML, submitText: editing ? "حفظ التعديلات" : "إضافة", wide: true });

  // تحديث اقتراح الكود تلقائيًا عند تغيير السنة الدراسية (يبقى قابل للتعديل اليدوى دائمًا)
  document.getElementById("gradeSelectField")?.addEventListener("change", (e) => {
    if (editing) return; // فى وضع التعديل ما نغيرش الكود تلقائى عشان منكسرش كود موجود فعلاً
    const codeField = document.getElementById("groupCodeField");
    codeField.value = suggestGroupCode(grades, groups, e.target.value);
  });

  const data = await promise;
  if (!data) return;
  data.capacity = Number(data.capacity) || 20;
  data.sessionPrice = Number(data.sessionPrice) || 0;
  data.duration = Number(data.duration) || 90;
  data.days = WEEKDAY_OPTIONS.filter((w) => data[`day_${w.key}`] === "on").map((w) => w.ar);
  WEEKDAY_OPTIONS.forEach((w) => delete data[`day_${w.key}`]);

  if (editing) {
    Object.assign(editing, data);
    saveGroups(groups);
    toast("تم تحديث بيانات المجموعة", "success");
  } else {
    groups.push({ id: generateId("GRP"), ...data });
    saveGroups(groups);
    toast("تم إضافة المجموعة بنجاح", "success");
  }
  renderGroupsTable();
}

async function deleteGroup(id) {
  const groups = getGroups();
  const g = groups.find((x) => x.id === id);
  const studentsUsingIt = getStudents().filter((s) => s.groupId === id).length;

  if (studentsUsingIt > 0) {
    toast(`لا يمكن حذف المجموعة لأنها تحتوى على ${studentsUsingIt} طالب. انقل الطلاب أولًا.`, "danger");
    return;
  }

  const ok = await confirmDialog({
    title: "حذف المجموعة",
    body: `هل أنت متأكد من حذف <strong>${escapeHTML(g?.name || "")}</strong>؟`,
    confirmText: "حذف نهائى",
    tone: "danger",
  });
  if (!ok) return;

  saveGroups(groups.filter((x) => x.id !== id));
  Sounds.delete();
  toast("تم حذف المجموعة", "success");
  renderGroupsTable();
}

/* ================= حالات الطالب ================= */
const TONE_LABELS = { success: "أخضر", info: "أزرق", warning: "برتقالى", danger: "أحمر" };
const CATEGORY_LABELS = { attendance: "حضور يومى", action: "إجراء استثنائى" };
const PRESENCE_LABELS = { present: "حاضر", absent: "غائب", null: "-" };
const PAYMENT_LABELS = { paid: "دفع", unpaid: "لم يدفع", none: "لا ينطبق" };

function renderStatusesTab(box) {
  box.innerHTML = `
    <div class="card card-pad">
      <div class="card__head">
        <div class="card__title">حالات الطالب</div>
        <button class="btn btn-primary btn-sm" id="addStatusBtn">${icons.plus} إضافة حالة</button>
      </div>
      <div class="field__hint" style="margin-bottom:14px;">
        هذه الحالات هى اللى بتظهر كأزرار فى صفحة "استقبال الطلاب" عند تسجيل حضور أى طالب.
      </div>
      <div id="statusesTable"></div>
    </div>
  `;
  document.getElementById("addStatusBtn").addEventListener("click", () => openStatusForm());
  renderStatusesTable();
}

function renderStatusesTable() {
  const box = document.getElementById("statusesTable");
  const statuses = getStudentStatuses();

  if (!statuses.length) {
    box.innerHTML = emptyStateHTML({ title: "لا توجد حالات معرّفة" });
    return;
  }

  box.innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>الحالة</th><th>النوع</th><th>يحسب حضور/غياب</th><th>الدفع</th><th>اللون</th><th></th></tr></thead>
        <tbody>
          ${statuses
            .map(
              (s) => `
            <tr>
              <td><span class="badge badge-${s.tone}"><span class="badge-dot"></span>${escapeHTML(s.name)}</span></td>
              <td class="text-muted">${CATEGORY_LABELS[s.category] || s.category}</td>
              <td class="text-muted">${PRESENCE_LABELS[s.presence]}</td>
              <td class="text-muted">${PAYMENT_LABELS[s.payment]}</td>
              <td class="text-muted">${TONE_LABELS[s.tone] || s.tone}</td>
              <td>
                <div class="row-actions">
                  <button class="btn btn-outline btn-icon editStatusBtn" data-id="${s.id}" title="تعديل">${icons.edit}</button>
                  <button class="btn btn-outline btn-icon deleteStatusBtn" data-id="${s.id}" title="حذف">${icons.trash}</button>
                </div>
              </td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  box.querySelectorAll(".editStatusBtn").forEach((btn) => btn.addEventListener("click", () => openStatusForm(btn.dataset.id)));
  box.querySelectorAll(".deleteStatusBtn").forEach((btn) => btn.addEventListener("click", () => deleteStatus(btn.dataset.id)));
}

async function openStatusForm(editId = null) {
  const statuses = getStudentStatuses();
  const editing = editId ? statuses.find((s) => s.id === editId) : null;

  const bodyHTML = `
    <div class="field">
      <label class="field__label">اسم الحالة</label>
      <input class="input" name="name" required value="${editing ? escapeHTML(editing.name) : ""}" placeholder="مثال: خصم نصف الحصة">
    </div>
    <div class="form-grid">
      <div class="field">
        <label class="field__label">نوع الحالة</label>
        <select class="select" name="category">
          <option value="attendance" ${editing?.category === "attendance" ? "selected" : ""}>حضور يومى (تظهر كزر رئيسى)</option>
          <option value="action" ${editing?.category === "action" ? "selected" : ""}>إجراء استثنائى (تظهر فى قسم منفصل)</option>
        </select>
      </div>
      <div class="field">
        <label class="field__label">لون العرض</label>
        <select class="select" name="tone">
          <option value="success" ${editing?.tone === "success" ? "selected" : ""}>أخضر</option>
          <option value="info" ${editing?.tone === "info" ? "selected" : ""}>أزرق</option>
          <option value="warning" ${editing?.tone === "warning" ? "selected" : ""}>برتقالى</option>
          <option value="danger" ${editing?.tone === "danger" ? "selected" : ""}>أحمر</option>
        </select>
      </div>
    </div>
    <div class="form-grid">
      <div class="field">
        <label class="field__label">هل تحسب حضور أم غياب؟</label>
        <select class="select" name="presence">
          <option value="present" ${editing?.presence === "present" ? "selected" : ""}>حضور</option>
          <option value="absent" ${editing?.presence === "absent" ? "selected" : ""}>غياب</option>
          <option value="null" ${editing?.presence == null ? "selected" : ""}>لا ينطبق</option>
        </select>
      </div>
      <div class="field">
        <label class="field__label">هل ترتبط بدفع؟</label>
        <select class="select" name="payment">
          <option value="paid" ${editing?.payment === "paid" ? "selected" : ""}>يسجل دفع فورى</option>
          <option value="unpaid" ${editing?.payment === "unpaid" ? "selected" : ""}>يسجل مستحق (لم يدفع بعد)</option>
          <option value="none" ${editing?.payment == null || editing?.payment === "none" ? "selected" : ""}>لا ينطبق</option>
        </select>
      </div>
    </div>
    <div class="field">
      <label class="field__label">مكافأة (اختياري)</label>
      <input class="input" name="rewardAmount" type="number" min="0" step="1" value="${editing?.rewardAmount || ""}" placeholder="مبلغ مكافأة يُضاف للمحفظة عند التسجيل (0 أو اتركه فارغ = بدون مكافأة)">
      <div class="field__hint">إذا أدخلت مبلغًا، يُضاف تلقائيًا لمحفظة الطالب عند تسجيل هذه الحالة</div>
    </div>
    </div>
  `;

  const data = await formModal({ title: editing ? "تعديل الحالة" : "إضافة حالة جديدة", bodyHTML, submitText: editing ? "حفظ التعديلات" : "إضافة", wide: true });
  if (!data) return;
  data.presence = data.presence === "null" ? null : data.presence;
  data.rewardAmount = data.rewardAmount ? Number(data.rewardAmount) : 0;

  if (editing) {
    Object.assign(editing, data);
    saveStudentStatuses(statuses);
    toast("تم تحديث الحالة", "success");
  } else {
    statuses.push({ id: generateId("ST"), ...data });
    saveStudentStatuses(statuses);
    toast("تم إضافة الحالة بنجاح", "success");
  }
  renderStatusesTable();
}

async function deleteStatus(id) {
  const statuses = getStudentStatuses();
  const s = statuses.find((x) => x.id === id);

  const ok = await confirmDialog({
    title: "حذف الحالة",
    body: `هل أنت متأكد من حذف حالة <strong>${escapeHTML(s?.name || "")}</strong>؟ السجلات القديمة التى استخدمتها ستظل محفوظة لكنها لن تظهر بشكل صحيح.`,
    confirmText: "حذف نهائى",
    tone: "danger",
  });
  if (!ok) return;

  saveStudentStatuses(statuses.filter((x) => x.id !== id));
  Sounds.delete();
  toast("تم حذف الحالة", "success");
  renderStatusesTable();
}

/* ================= العام الدراسي (Normalized Schema) ================= */
function renderAcademicPeriodsTab(box) {
  box.innerHTML = `
    <div class="card card-pad" style="margin-bottom:18px;">
      <div class="card__head">
        <div class="card__title">العام الدراسي</div>
        <button class="btn btn-primary btn-sm" id="addYearBtn">${icons.plus} إضافة سنة أكاديمية</button>
      </div>
      <p class="field__hint" style="margin-bottom:0;">
        حدد السنة الأكاديمية الحالية ثم الأترام والشهور. كل شهر لازم يكون له تاريخ بداية ونهاية، وده اللى بيساعد النظام يحدد الترم والشهر النشط تلقائيًا.
      </p>
    </div>
    <div id="academicTree"></div>
  `;
  document.getElementById("addYearBtn").addEventListener("click", () => openYearForm());
  renderAcademicTree();
}

function renderAcademicTree() {
  const box = document.getElementById("academicTree");
  const years = getAcademicYears();
  const allTerms = getTerms();
  const allMonths = getAcademicMonths();

  if (!years.length) {
    box.innerHTML = emptyStateHTML({ icon: icons.calendar, title: "لا توجد سنوات أكاديمية بعد", text: "أضف أول سنة أكاديمية لتتمكن من تحديد الأترام والشهور." });
    return;
  }

  box.innerHTML = years.map((year) => {
    const yearTerms = allTerms.filter((t) => t.yearId === year.id).sort((a, b) => a.order - b.order);
    return `
      <div class="ap-year">
        <div class="ap-year__header">
          <div class="ap-year__title">
            ${icons.clipboard}
            <strong>${escapeHTML(year.name)}</strong>
            ${year.isCurrent ? `<span class="badge badge-success" style="font-size:10px;">السنة الحالية</span>` : ""}
          </div>
          <div class="row-actions">
            <button class="btn btn-outline btn-icon addTermBtn" data-year-id="${year.id}" title="إضافة ترم">${icons.plus}</button>
            <button class="btn btn-outline btn-icon editYearBtn" data-year-id="${year.id}" title="تعديل">${icons.edit}</button>
            <button class="btn btn-outline btn-icon deleteYearBtn" data-year-id="${year.id}" title="حذف">${icons.trash}</button>
          </div>
        </div>
        ${yearTerms.length ? yearTerms.map((term) => {
          const termMonths = allMonths.filter((m) => m.termId === term.id);
          return `
            <div class="ap-term">
                <div class="ap-term__header">
                <div class="ap-term__title">
                  ${icons.clipboard}
                  <span>${escapeHTML(term.name)}</span>
                  ${term.isCurrent
                    ? `<span class="badge badge-success" style="font-size:10px;">✓ الترم الحالي</span>`
                    : `<button class="btn btn-sm btn-outline setCurrentTermBtn" data-term-id="${term.id}" style="font-size:10px; padding:1px 6px;">${icons.check} تعيين كترم حالي</button>`}
                  <span class="text-muted" style="font-size:11px; margin-right:auto; margin-left:10px;">${term.startDate} → ${term.endDate}</span>
                </div>
                <div class="row-actions">
                  <button class="btn btn-outline btn-icon btn-xs addMonthBtn" data-term-id="${term.id}" title="إضافة شهر">${icons.plus}</button>
                  <button class="btn btn-outline btn-icon btn-xs editTermBtn" data-term-id="${term.id}" title="تعديل">${icons.edit}</button>
                  <button class="btn btn-outline btn-icon btn-xs deleteTermBtn" data-term-id="${term.id}" title="حذف">${icons.trash}</button>
                </div>
              </div>
              ${termMonths.length ? `
                <div class="ap-months">
                  ${termMonths.map((m) => `
                    <div class="ap-month">
                      <div class="ap-month__info">
                        <strong>${escapeHTML(m.name)}</strong>
                        <span class="text-muted">${m.startDate} → ${m.endDate}</span>
                      </div>
                      <div class="row-actions">
                        <button class="btn btn-outline btn-icon btn-xs editMonthBtn" data-month-id="${m.id}" title="تعديل">${icons.edit}</button>
                        <button class="btn btn-outline btn-icon btn-xs deleteMonthBtn" data-month-id="${m.id}" title="حذف">${icons.trash}</button>
                      </div>
                    </div>
                  `).join("")}
                </div>
              ` : `<div class="ap-empty">لا توجد شهور بعد</div>`}
            </div>`;
        }).join("") : `<div class="ap-empty" style="margin-left:32px;">لا توجد أترام بعد</div>`}
      </div>`;
  }).join("");

  box.querySelectorAll(".addTermBtn").forEach((btn) => btn.addEventListener("click", () => openTermForm(btn.dataset.yearId)));
  box.querySelectorAll(".editYearBtn").forEach((btn) => btn.addEventListener("click", () => openYearForm(btn.dataset.yearId)));
  box.querySelectorAll(".deleteYearBtn").forEach((btn) => btn.addEventListener("click", () => deleteYear(btn.dataset.yearId)));
  box.querySelectorAll(".addMonthBtn").forEach((btn) => btn.addEventListener("click", () => openMonthForm(btn.dataset.termId)));
  box.querySelectorAll(".editTermBtn").forEach((btn) => btn.addEventListener("click", () => openTermForm(null, btn.dataset.termId)));
  box.querySelectorAll(".deleteTermBtn").forEach((btn) => btn.addEventListener("click", () => deleteTerm(btn.dataset.termId)));
  box.querySelectorAll(".setCurrentTermBtn").forEach((btn) => btn.addEventListener("click", () => setCurrentTerm(btn.dataset.termId)));
  box.querySelectorAll(".editMonthBtn").forEach((btn) => btn.addEventListener("click", () => openMonthForm(null, btn.dataset.monthId)));
  box.querySelectorAll(".deleteMonthBtn").forEach((btn) => btn.addEventListener("click", () => deleteMonth(btn.dataset.monthId)));
}

function setCurrentTerm(termId) {
  const terms = getTerms();
  const term = terms.find((t) => t.id === termId);
  if (!term) return;
  terms.forEach((t) => t.isCurrent = t.id === termId);
  saveTerms(terms);
  Sounds.save();
  toast(`تم تعيين "${term.name}" كترم حالي`, "success");
  renderAcademicTree();
}

/* ── السنة الأكاديمية ── */
async function openYearForm(editId = null) {
  const years = getAcademicYears();
  const editing = editId ? years.find((y) => y.id === editId) : null;

  const bodyHTML = `
    <div class="field">
      <label class="field__label">اسم السنة الأكاديمية</label>
      <input class="input" name="name" required value="${editing ? escapeHTML(editing.name) : ""}" placeholder="مثال: 2026 — 2027">
    </div>
    <div class="field">
      <label style="display:flex; align-items:center; gap:8px; font-size:13.5px; font-weight:600; cursor:pointer;">
        <input type="checkbox" name="isCurrent" ${editing?.isCurrent ? "checked" : ""} style="width:16px;height:16px;">
        جعلها السنة الحالية (نشطة)
      </label>
      <div class="field__hint">سنة واحدة بس ممكن تكون "السنة الحالية" — لو حددت سنة جديدة هتتلغى القديمة تلقائيًا.</div>
    </div>
  `;

  const data = await formModal({ title: editing ? "تعديل السنة الأكاديمية" : "إضافة سنة أكاديمية", bodyHTML, submitText: editing ? "حفظ التعديلات" : "إضافة" });
  if (!data) return;

  const isCurrent = data.isCurrent === "on";

  if (editing) {
    editing.name = data.name;
    editing.isCurrent = isCurrent;
  } else {
    years.push({ id: generateId("AY"), name: data.name, isCurrent });
  }

  if (isCurrent) {
    years.forEach((y) => { if (y.id !== (editing?.id || years[years.length - 1]?.id)) y.isCurrent = false; });
  }

  saveAcademicYears(years);
  toast(editing ? "تم تحديث السنة الأكاديمية" : "تم إضافة السنة الأكاديمية بنجاح", "success");
  renderAcademicTree();
}

async function deleteYear(yearId) {
  const years = getAcademicYears();
  const year = years.find((y) => y.id === yearId);
  const termsCount = getTerms().filter((t) => t.yearId === yearId).length;

  const ok = await confirmDialog({
    title: "حذف السنة الأكاديمية",
    body: `هل أنت متأكد من حذف <strong>${escapeHTML(year?.name || "")}</strong>؟${termsCount ? `<br><br><small>ستحذف ${termsCount} ترم(ات) تابعة لها وجميع شهورها.</small>` : ""}`,
    confirmText: "حذف نهائى",
    tone: "danger",
  });
  if (!ok) return;

  const yearTerms = getTerms().filter((t) => t.yearId === yearId);
  const termIds = yearTerms.map((t) => t.id);

  saveAcademicMonths(getAcademicMonths().filter((m) => !termIds.includes(m.termId)));
  saveTerms(getTerms().filter((t) => t.yearId !== yearId));
  saveAcademicYears(years.filter((y) => y.id !== yearId));
  Sounds.delete();
  toast("تم حذف السنة الأكاديمية", "success");
  renderAcademicTree();
}

/* ── الترم ── */
async function openTermForm(yearId, editId = null) {
  const years = getAcademicYears();
  const terms = getTerms();
  const editing = editId ? terms.find((t) => t.id === editId) : null;
  const targetYearId = yearId || editing?.yearId;

  const bodyHTML = `
    <div class="field">
      <label class="field__label">اسم الترم</label>
      <input class="input" name="name" required value="${editing ? escapeHTML(editing.name) : ""}" placeholder="مثال: الترم الأول">
    </div>
    <div class="field">
      <label class="field__label">الترتيب</label>
      <input class="input" name="order" type="number" min="1" required value="${editing ? editing.order : (terms.filter((t) => t.yearId === targetYearId).length + 1)}">
    </div>
    <div class="form-grid">
      <div class="field">
        <label class="field__label">تاريخ البداية</label>
        <input class="input" name="startDate" type="date" required value="${editing?.startDate || ""}">
      </div>
      <div class="field">
        <label class="field__label">تاريخ النهاية</label>
        <input class="input" name="endDate" type="date" required value="${editing?.endDate || ""}">
      </div>
    </div>
    <div class="field">
      <label style="display:flex; align-items:center; gap:8px; font-size:13.5px; font-weight:600; cursor:pointer;">
        <input type="checkbox" name="isCurrent" ${editing?.isCurrent ? "checked" : ""} style="width:16px;height:16px;">
        ترم حالي (نشط)
      </label>
      <div class="field__hint">الترم النشط يُستخدم في تقارير الحضور وبيانات المتابعة.</div>
    </div>
  `;

  const data = await formModal({ title: editing ? "تعديل الترم" : "إضافة ترم جديد", bodyHTML, submitText: editing ? "حفظ التعديلات" : "إضافة" });
  if (!data) return;

  const isCurrent = data.isCurrent === "on";

  if (editing) {
    editing.name = data.name;
    editing.order = Number(data.order) || editing.order;
    editing.startDate = data.startDate;
    editing.endDate = data.endDate;
    editing.isCurrent = isCurrent;
  } else {
    terms.push({ id: generateId("TR"), yearId: targetYearId, name: data.name, order: Number(data.order) || 1, startDate: data.startDate, endDate: data.endDate, isCurrent });
  }

  if (isCurrent) {
    terms.forEach((t) => { if (t.id !== (editing?.id || terms[terms.length - 1]?.id) && t.yearId === targetYearId) t.isCurrent = false; });
  }

  saveTerms(terms);
  toast(editing ? "تم تحديث الترم" : "تم إضافة الترم بنجاح", "success");
  renderAcademicTree();
}

async function deleteTerm(termId) {
  const terms = getTerms();
  const term = terms.find((t) => t.id === termId);
  const monthsCount = getAcademicMonths().filter((m) => m.termId === termId).length;

  const ok = await confirmDialog({
    title: "حذف الترم",
    body: `هل أنت متأكد من حذف <strong>${escapeHTML(term?.name || "")}</strong>؟${monthsCount ? `<br><br><small>ستحذف ${monthsCount} شهر(ات) تابعة له.</small>` : ""}`,
    confirmText: "حذف نهائى",
    tone: "danger",
  });
  if (!ok) return;

  saveAcademicMonths(getAcademicMonths().filter((m) => m.termId !== termId));
  saveTerms(terms.filter((t) => t.id !== termId));
  Sounds.delete();
  toast("تم حذف الترم", "success");
  renderAcademicTree();
}

/* ── الشهر ── */
async function openMonthForm(termId, editId = null) {
  const months = getAcademicMonths();
  const editing = editId ? months.find((m) => m.id === editId) : null;
  const targetTermId = termId || editing?.termId;

  const bodyHTML = `
    <div class="field">
      <label class="field__label">اسم الشهر</label>
      <input class="input" name="name" required value="${editing ? escapeHTML(editing.name) : ""}" placeholder="مثال: أكتوبر">
    </div>
    <div class="form-grid">
      <div class="field">
        <label class="field__label">تاريخ البداية</label>
        <input class="input" name="startDate" type="date" required value="${editing?.startDate || ""}">
      </div>
      <div class="field">
        <label class="field__label">تاريخ النهاية</label>
        <input class="input" name="endDate" type="date" required value="${editing?.endDate || ""}">
      </div>
    </div>
  `;

  const data = await formModal({ title: editing ? "تعديل الشهر" : "إضافة شهر جديد", bodyHTML, submitText: editing ? "حفظ التعديلات" : "إضافة" });
  if (!data) return;

  if (editing) {
    editing.name = data.name;
    editing.startDate = data.startDate;
    editing.endDate = data.endDate;
  } else {
    months.push({ id: generateId("AM"), termId: targetTermId, name: data.name, startDate: data.startDate, endDate: data.endDate });
  }

  saveAcademicMonths(months);
  toast(editing ? "تم تحديث الشهر" : "تم إضافة الشهر بنجاح", "success");
  renderAcademicTree();
}

async function deleteMonth(monthId) {
  const months = getAcademicMonths();
  const month = months.find((m) => m.id === monthId);

  const ok = await confirmDialog({
    title: "حذف الشهر",
    body: `هل أنت متأكد من حذف شهر <strong>${escapeHTML(month?.name || "")}</strong>؟`,
    confirmText: "حذف نهائى",
    tone: "danger",
  });
  if (!ok) return;

  saveAcademicMonths(months.filter((m) => m.id !== monthId));
  Sounds.delete();
  toast("تم حذف الشهر", "success");
  renderAcademicTree();
}

/* ================= إدارة الحسابات (المدرسون المساعدون والصلاحيات) ================= */
function renderTeamTab(box) {
  box.innerHTML = `
    <div class="card card-pad">
      <div class="card__head">
        <div class="card__title">المدرسون المساعدون</div>
        <button class="btn btn-primary btn-sm" id="addAssistantBtn">${icons.plus} إضافة مدرس مساعد</button>
      </div>
      <div class="field__hint" style="margin-bottom:14px;">
        حدد لكل مدرس مساعد الصفحات اللى يقدر يشوفها ويشتغل عليها فقط. صفحة "الرئيسية" متاحة دائمًا، و"الإعدادات" للمدير فقط.
      </div>
      <div id="teamTable"></div>
    </div>
  `;
  document.getElementById("addAssistantBtn").addEventListener("click", () => openAssistantForm());
  renderTeamTable();
}

function renderTeamTable() {
  const box = document.getElementById("teamTable");
  const settings = getSettings();
  const assistants = (settings.users || []).filter((u) => u.role !== "admin");

  if (!assistants.length) {
    box.innerHTML = emptyStateHTML({ icon: icons.shield, title: "لا يوجد مدرسون مساعدون بعد" });
    return;
  }

  box.innerHTML = `
    <div class="table-wrap stg-team-table-wrap">
      <table class="table">
        <thead><tr><th>الاسم</th><th>المستخدم</th><th>الكلمة</th><th>الصلاحيات</th><th></th></tr></thead>
        <tbody>
          ${assistants
            .map(
              (u, idx) => {
                const perms = u.permissions || [];
                const acts = u.actions || {};
                const permBadges = perms.length
                  ? perms.map((p) => {
                      const page = PERMISSION_PAGES.find((pp) => pp.id === p);
                      const pageActs = acts[p];
                      const actsCount = pageActs ? pageActs.length : 0;
                      const totalActs = (PAGE_ACTIONS[p] || []).length;
                      const label = page ? `${page.icon} ${page.label}` : p;
                      const detail = pageActs && actsCount < totalActs ? ` (${actsCount}/${totalActs})` : "";
                      return `<span class="badge badge-primary" style="font-size:11px;">${label}${detail}</span>`;
                    }).join("")
                  : `<span class="badge badge-neutral">بدون صلاحيات</span>`;
                return `
            <tr>
              <td style="font-weight:700;">${escapeHTML(u.name)}</td>
              <td class="text-muted" style="direction:ltr; text-align:left;">${escapeHTML(u.username)}</td>
              <td>
                <span class="text-muted pwMask" data-idx="${idx}" style="direction:ltr;">••••••</span>
                <button type="button" class="btn btn-outline btn-icon btn-sm togglePwBtn" data-idx="${idx}" data-pw="${escapeHTML(u.password)}" title="إظهار/إخفاء" style="width:26px;height:26px;">${icons.info}</button>
              </td>
              <td><div style="display:flex; flex-wrap:wrap; gap:4px;">${permBadges}</div></td>
              <td>
                <div class="row-actions">
                  <button class="btn btn-outline btn-icon editAssistantBtn" data-username="${escapeHTML(u.username)}" title="تعديل">${icons.edit}</button>
                  <button class="btn btn-outline btn-icon deleteAssistantBtn" data-username="${escapeHTML(u.username)}" title="حذف">${icons.trash}</button>
                </div>
              </td>
            </tr>`;
              }
            )
            .join("")}
        </tbody>
      </table>
    </div>

    <div class="stg-card-view">
      ${assistants.map((u, idx) => {
        const perms = u.permissions || [];
        const acts = u.actions || {};
        const permBadges = perms.length
          ? perms.map((p) => {
              const page = PERMISSION_PAGES.find((pp) => pp.id === p);
              const pageActs = acts[p];
              const actsCount = pageActs ? pageActs.length : 0;
              const totalActs = (PAGE_ACTIONS[p] || []).length;
              const label = page ? `${page.icon} ${page.label}` : p;
              const detail = pageActs && actsCount < totalActs ? ` (${actsCount}/${totalActs})` : "";
              return `<span class="badge badge-primary" style="font-size:11px;">${label}${detail}</span>`;
            }).join("")
          : `<span class="badge badge-neutral">بدون صلاحيات</span>`;
        return `
        <div class="stg-card">
          <div class="stg-card__header">
            <span>${escapeHTML(u.name)}</span>
            <span class="text-muted" style="direction:ltr; font-size:12px;">${escapeHTML(u.username)}</span>
          </div>
          <div class="stg-card__body">
            <div class="stg-card__row"><span class="text-muted">الكلمة</span>
              <span>
                <span class="text-muted pwMask" data-idx="${idx}" style="direction:ltr;">••••••</span>
                <button type="button" class="btn btn-outline btn-icon btn-sm togglePwBtn" data-idx="${idx}" data-pw="${escapeHTML(u.password)}" title="إظهار/إخفاء" style="width:22px;height:22px;">${icons.info}</button>
              </span>
            </div>
            <div class="stg-card__row"><span class="text-muted">الصلاحيات</span><div style="display:flex;flex-wrap:wrap;gap:4px;">${permBadges}</div></div>
          </div>
          <div class="stg-card__actions">
            <button class="btn btn-outline btn-sm editAssistantBtn" data-username="${escapeHTML(u.username)}">📝 تعديل</button>
            <button class="btn btn-outline btn-sm deleteAssistantBtn" data-username="${escapeHTML(u.username)}" style="color:var(--danger);">🗑️ حذف</button>
          </div>
        </div>`;
      }).join("")}
    </div>
  `;

  box.querySelectorAll(".togglePwBtn").forEach((btn) =>
    btn.addEventListener("click", () => {
      const span = box.querySelector(`.pwMask[data-idx="${btn.dataset.idx}"]`);
      const isHidden = span.textContent.includes("•");
      span.textContent = isHidden ? btn.dataset.pw : "••••••";
    })
  );
  box.querySelectorAll(".editAssistantBtn").forEach((btn) => btn.addEventListener("click", () => openAssistantForm(btn.dataset.username)));
  box.querySelectorAll(".deleteAssistantBtn").forEach((btn) => btn.addEventListener("click", () => deleteAssistant(btn.dataset.username)));
}

async function openAssistantForm(editUsername = null) {
  const settings = getSettings();
  const users = settings.users || [];
  const editing = editUsername ? users.find((u) => u.username === editUsername) : null;
  const editPerms = editing?.permissions || [];
  const editActions = editing?.actions || {};

  const existing = document.getElementById("permFormOverlay");
  if (existing) existing.remove();

  const ov = document.createElement("div");
  ov.id = "permFormOverlay";
  ov.style.cssText = `position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(15,23,42,0.55);backdrop-filter:blur(6px);animation:ucdFadeIn .2s ease;`;
  document.body.appendChild(ov);

  function render() {
    ov.innerHTML = `
      <div style="background:var(--surface,#fff);border-radius:16px;width:100%;max-width:560px;max-height:88vh;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.3);animation:ucdSlideUp .25s cubic-bezier(.16,1,.3,1);display:flex;flex-direction:column;">
        <!-- HEADER -->
        <div style="flex:0 0 auto;padding:16px 18px;background:linear-gradient(135deg,var(--primary),color-mix(in srgb,var(--primary) 60%,#4338CA));color:#fff;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:20px;">🛡️</span>
            <div style="flex:1;">
              <div style="font-size:16px;font-weight:800;">${editing ? "تعديل مدرس مساعد" : "إضافة مدرس مساعد"}</div>
              <div style="font-size:11px;opacity:.8;">حدد الصفحة ثم الأكشنات المسموحة</div>
            </div>
            <button class="pf-close-x" style="background:rgba(255,255,255,.2);border:none;color:#fff;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:16px;">✕</button>
          </div>
        </div>

        <!-- BODY — scrollable -->
        <div style="flex:1;overflow-y:auto;padding:14px 16px;">
          <!-- معلومات الحساب -->
          <div style="margin-bottom:14px;">
            <div class="field" style="margin-bottom:8px;">
              <label class="field__label">الاسم</label>
              <input class="input pf-name" required value="${editing ? escapeHTML(editing.name) : ""}" placeholder="مثال: أ. أحمد سامي">
            </div>
            <div class="form-grid" style="gap:8px;">
              <div class="field" style="margin-bottom:0;">
                <label class="field__label">المستخدم</label>
                <input class="input pf-username" required value="${editing ? escapeHTML(editing.username) : ""}" ${editing ? "disabled" : ""} style="direction:ltr;">
              </div>
              <div class="field" style="margin-bottom:0;">
                <label class="field__label">كلمة المرور</label>
                <input class="input pf-password" required value="${editing ? escapeHTML(editing.password) : ""}" style="direction:ltr;">
              </div>
            </div>
          </div>

          <div style="height:1px;background:var(--border,#E4E7EC);margin:10px 0;"></div>

          <!-- الصلاحيات -->
          <div style="font-size:13px;font-weight:700;color:var(--text,#1B2333);margin-bottom:10px;">الصلاحيات التفصيلية</div>

          ${PERMISSION_PAGES.map((page) => {
            const pageId = page.id;
            const isChecked = editPerms.includes(pageId);
            const actions = PAGE_ACTIONS[pageId] || [];
            const savedActs = editActions[pageId] || [];
            const allChecked = actions.every((a) => savedActs.includes(a.id));

            return `
            <div class="pf-page-section" data-page="${pageId}" style="margin-bottom:8px;border:1.5px solid ${isChecked ? "var(--primary,#2563EB)" : "var(--border,#E4E7EC)"};border-radius:10px;overflow:hidden;transition:border-color .2s;">
              <!-- Page header -->
              <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:${isChecked ? "var(--primary-light,#EEF2FF)" : "var(--bg,#F8F9FC)"};cursor:pointer;" class="pf-page-toggle" data-page="${pageId}">
                <input type="checkbox" class="pf-page-cb" data-page="${pageId}" ${isChecked ? "checked" : ""} style="width:16px;height:16px;cursor:pointer;">
                <span style="font-size:15px;">${page.icon}</span>
                <span style="flex:1;font-size:13px;font-weight:700;color:var(--text,#1B2333);">${page.label}</span>
                <span style="font-size:10px;color:var(--muted,#6B7280);">${actions.length} صلاحية</span>
                <span class="pf-expand-icon" style="font-size:11px;color:var(--muted,#6B7280);transition:transform .2s;${isChecked ? "transform:rotate(180deg);" : ""}">▼</span>
              </div>
              <!-- Actions list -->
              <div class="pf-actions-list" data-page="${pageId}" style="display:${isChecked ? "block" : "none"};padding:6px 12px 8px;background:var(--surface,#fff);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                  <button type="button" class="pf-select-all" data-page="${pageId}" style="background:none;border:none;color:var(--primary,#2563EB);font-size:11px;font-weight:600;cursor:pointer;padding:2px 0;">تحديد الكل</button>
                </div>
                ${actions.map((action) => {
                  const actChecked = !isChecked ? false : (savedActs.length > 0 ? savedActs.includes(action.id) : true);
                  return `
                  <label style="display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:6px;cursor:pointer;font-size:12.5px;font-weight:600;color:${isChecked ? "var(--text,#1B2333)" : "var(--muted,#6B7280)"};transition:background .15s;${isChecked ? "" : "opacity:.5;pointer-events:none;"}" class="pf-act-label">
                    <input type="checkbox" name="act_${pageId}_${action.id}" class="pf-act-cb" data-page="${pageId}" ${actChecked ? "checked" : ""} ${isChecked ? "" : "disabled"} style="width:14px;height:14px;cursor:pointer;">
                    <span style="flex:1;">${action.label}</span>
                    ${action.sensitive ? '<span style="font-size:10px;background:var(--danger-light,#FEE2E2);color:var(--danger,#E5484D);padding:1px 5px;border-radius:4px;">حساس</span>' : ""}
                  </label>`;
                }).join("")}
              </div>
            </div>`;
          }).join("")}

          <!-- تلميح -->
          <div style="font-size:11px;color:var(--muted,#6B7280);margin-top:8px;text-align:center;">
            📌 الصفحة без تحديد أكشنات = كل الأكشنات مسموحة
          </div>
        </div>

        <!-- FOOTER -->
        <div style="flex:0 0 auto;padding:12px 16px;border-top:1px solid var(--border,#E4E7EC);display:flex;gap:8px;">
          <button class="pf-submit" style="flex:1;padding:10px;border-radius:10px;border:none;background:var(--primary,#2563EB);color:#fff;font-size:14px;font-weight:700;cursor:pointer;">
            ${editing ? "حفظ التعديلات" : "إضافة"}
          </button>
          <button class="pf-close" style="padding:10px 16px;border-radius:10px;border:none;background:var(--surface,#fff);color:var(--muted,#6B7280);border:1.5px solid var(--border,#E4E7EC);font-size:13px;font-weight:600;cursor:pointer;">
            إغلاق
          </button>
        </div>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    ov.querySelector(".pf-close-x")?.addEventListener("click", close);
    ov.querySelector(".pf-close")?.addEventListener("click", close);
    ov.addEventListener("click", (e) => { if (e.target === ov) close(); });

    ov.querySelectorAll(".pf-page-cb").forEach((cb) => {
      cb.addEventListener("change", () => {
        const pageId = cb.dataset.page;
        const section = ov.querySelector(`.pf-page-section[data-page="${pageId}"]`);
        const list = ov.querySelector(`.pf-actions-list[data-page="${pageId}"]`);
        const expandIcon = section.querySelector(".pf-expand-icon");
        const isChecked = cb.checked;

        section.style.borderColor = isChecked ? "var(--primary,#2563EB)" : "var(--border,#E4E7EC)";
        section.querySelector(".pf-page-toggle").style.background = isChecked ? "var(--primary-light,#EEF2FF)" : "var(--bg,#F8F9FC)";
        list.style.display = isChecked ? "block" : "none";
        if (expandIcon) expandIcon.style.transform = isChecked ? "rotate(180deg)" : "";

        list.querySelectorAll(".pf-act-cb").forEach((actCb) => {
          actCb.disabled = !isChecked;
          if (!isChecked) actCb.checked = false;
        });
        list.querySelectorAll(".pf-act-label").forEach((label) => {
          if (isChecked) {
            label.style.opacity = "1";
            label.style.pointerEvents = "";
            label.style.color = "var(--text,#1B2333)";
          } else {
            label.style.opacity = ".5";
            label.style.pointerEvents = "none";
            label.style.color = "var(--muted,#6B7280)";
          }
        });
      });
    });

    ov.querySelectorAll(".pf-page-toggle").forEach((toggle) => {
      toggle.addEventListener("click", (e) => {
        if (e.target.tagName === "INPUT") return;
        const cb = toggle.querySelector(".pf-page-cb");
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event("change"));
      });
    });

    ov.querySelectorAll(".pf-select-all").forEach((btn) => {
      btn.addEventListener("click", () => {
        const pageId = btn.dataset.page;
        const list = ov.querySelector(`.pf-actions-list[data-page="${pageId}"]`);
        const cbs = list.querySelectorAll(".pf-act-cb");
        const allChecked = Array.from(cbs).every((cb) => cb.checked);
        cbs.forEach((cb) => { cb.checked = !allChecked; });
      });
    });

    ov.querySelector(".pf-submit")?.addEventListener("click", submit);
  }

  function submit() {
    const name = ov.querySelector(".pf-name")?.value.trim();
    const username = ov.querySelector(".pf-username")?.value.trim();
    const password = ov.querySelector(".pf-password")?.value;

    if (!name || !username || !password) {
      toast("املأ كل البيانات المطلوبة", "danger");
      return;
    }

    if (!editing && users.some((u) => u.username === username)) {
      toast("اسم المستخدم ده مستخدم بالفعل", "danger");
      return;
    }

    const permissions = [];
    const actions = {};

    PERMISSION_PAGES.forEach((page) => {
      const cb = ov.querySelector(`.pf-page-cb[data-page="${page.id}"]`);
      if (!cb?.checked) return;

      permissions.push(page.id);
      const acts = PAGE_ACTIONS[page.id] || [];
      const checkedActs = acts.filter((a) => {
        const actCb = ov.querySelector(`.pf-act-cb[data-page="${page.id}"]`);
        if (!actCb) return true;
        return ov.querySelector(`input[name="act_${page.id}_${a.id}"]`)?.checked;
      });

      if (checkedActs.length > 0 && checkedActs.length < acts.length) {
        actions[page.id] = checkedActs.map((a) => a.id);
      }
    });

    const record = { username, password, name, role: "assistant", permissions, actions };

    if (editing) {
      Object.assign(editing, record);
    } else {
      users.push(record);
    }
    saveSettings({ ...settings, users });
    toast(editing ? "تم تحديث بيانات المدرس المساعد" : "تم إضافة المدرس المساعد بنجاح", "success");
    close();
    renderTeamTable();
  }

  function close() {
    ov.style.animation = "ucdFadeOut .15s ease forwards";
    setTimeout(() => ov.remove(), 150);
  }

  render();
}

async function deleteAssistant(username) {
  const settings = getSettings();
  const users = settings.users || [];
  const u = users.find((x) => x.username === username);

  const ok = await confirmDialog({
    title: "حذف المدرس المساعد",
    body: `هل أنت متأكد من حذف <strong>${escapeHTML(u?.name || "")}</strong>؟ لن يقدر يسجل الدخول بعد كده.`,
    confirmText: "حذف نهائى",
    tone: "danger",
  });
  if (!ok) return;

  saveSettings({ ...settings, users: users.filter((x) => x.username !== username) });
  Sounds.delete();
  toast("تم حذف المدرس المساعد", "success");
  renderTeamTable();
}

/* ================= منطقة خطرة ================= */
function renderDangerTab(box) {
  box.innerHTML = `
    <div class="card card-pad" style="border-color: var(--warning); margin-bottom:16px;">
      <div class="card__head"><div class="card__title" style="color:var(--warning);">تهيئة دفتر الأستاذ</div></div>
      <p class="text-muted" style="margin-bottom:14px; font-size:13.5px;">
        لو السيرفر محدّث من نسخة قديمة، ده زر بينشأ قيود افتتاحية لكل الطلاب اللي عليهم متأخرات أو رصيد محفظة.
        <strong>اضغطه مرة واحدة بس.</strong>
      </p>
      <button class="btn btn-warning" id="backfillLedgerBtn">${icons.clipboard} تهيئة دفتر الأستاذ</button>
    </div>
    <div class="card card-pad" style="border-color: var(--danger-light);">
      <div class="card__head"><div class="card__title text-danger">منطقة خطرة</div></div>
      <p class="text-muted" style="margin-bottom:14px; font-size:13.5px;">
        إعادة ضبط النظام تحذف كل التعديلات المحفوظة محليًا وتعيد تحميل بيانات العرض التجريبية الأصلية.
      </p>
      <button class="btn btn-danger" id="resetBtn">${icons.trash} إعادة ضبط النظام بالكامل</button>
    </div>
  `;

  document.getElementById("backfillLedgerBtn").addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "تهيئة دفتر الأستاذ",
      body: "هيتم إنشاء قيود افتتاحية لكل الطلاب اللي عليهم متأخرات أو رصيد محفظة. هل أنت متأكد؟",
      confirmText: "تهيئة",
      tone: "warning",
    });
    if (!ok) return;
    const count = backfillLedger();
    toast(`تم تهيئة ${count} قيد في دفتر الأستاذ ✓`, "success");
  });

  document.getElementById("resetBtn").addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "إعادة ضبط النظام",
      body: "سيتم حذف كل البيانات المحفوظة والعودة للبيانات التجريبية الأصلية. هل أنت متأكد؟",
      confirmText: "إعادة الضبط",
      tone: "danger",
    });
    if (!ok) return;
    await resetAllData();
    toast("تم إعادة ضبط النظام، جارٍ إعادة التحميل...", "success");
    setTimeout(() => (window.location.href = appPath("login.html")), 1000);
  });
}

/* ================= رسائل الواتساب ================= */
function renderWhatsAppTemplatesTab(box) {
  const overrides = getAllOverrides();
  const overriddenCount = Object.keys(overrides).length;
  const settings = getSettings();
  const sys = getSystemSettings();
  const waAutoSend = settings.waAutoSend === true;

  box.innerHTML = `
    <div class="card card-pad" style="margin-bottom:16px;">
      <div class="card__head">
        <div class="card__title">${icons.whatsapp || "💬"} إعدادات الواتساب</div>
      </div>
      <form id="waAutoSendForm">
        <label style="display:flex; align-items:center; gap:10px; cursor:pointer; padding:12px; background:var(--bg-secondary, #f5f5f5); border-radius:var(--r-md); border:1px solid var(--border);">
          <input type="checkbox" name="waAutoSend" ${waAutoSend ? "checked" : ""} style="width:18px; height:18px; accent-color:var(--primary);" />
          <div>
            <div style="font-weight:700; font-size:14px;">إرسال تلقائي لرسائل الواتساب</div>
            <div class="text-muted" style="font-size:12px;">لما مفعّل: الرسائل بتتبعت تلقائياً مع كل عملية حضور/غياب/مكافأة. لما مقفول: الرسائل مش بتتبعت — بس تقدر تبعت يدوياً من الأزرار.</div>
          </div>
        </label>
        <button type="submit" class="btn btn-primary btn-sm" style="margin-top:10px;">حفظ</button>
      </form>
    </div>

    <div class="card card-pad" style="margin-bottom:16px;">
      <div class="card__head"><div class="card__title">💬 أتمتة الإرسال</div></div>
      <form id="whatsappAutoForm">
        <div class="field">
          <label style="display:flex; align-items:center; gap:8px; font-size:13.5px; font-weight:600; cursor:pointer;">
            <input type="checkbox" name="waSilentMode" ${sys.waSilentMode ? "checked" : ""} style="width:16px;height:16px;">
            🔇 وضع الصامت — تعطيل الإرسال الآلي
          </label>
          <div class="field__hint">إيقاف إرسال رسائل الواتساب التلقائية مؤقتاً (مفيد عند ضعف الإنترنت).</div>
        </div>
        <div class="field">
          <label style="display:flex; align-items:center; gap:8px; font-size:13.5px; font-weight:600; cursor:pointer;">
            <input type="checkbox" name="waAbsenceBatching" ${sys.waAbsenceBatching ? "checked" : ""} style="width:16px;height:16px;">
            📦 تجميع رسائل الغياب
          </label>
          <div class="field__hint">إرسال رسائل الغياب مجمعة في وقت محدد بدلاً من الإرسال الفوري.</div>
        </div>
        <div class="field">
          <label class="field__label">موعد الإرسال المجمع</label>
          <input type="time" name="waAbsenceBatchTime" value="${sys.waAbsenceBatchTime}" style="max-width:120px;">
        </div>
        <div class="field">
          <label style="display:flex; align-items:center; gap:8px; font-size:13.5px; font-weight:600; cursor:pointer;">
            <input type="checkbox" name="waReceiptToggle" ${sys.waReceiptToggle ? "checked" : ""} style="width:16px;height:16px;">
            🧾 إرسال إيصال الدفع
          </label>
          <div class="field__hint">إرسال إيصال إلكتروني على الواتساب عند كل عملية دفع أو شحن محفظة.</div>
        </div>
        <button class="btn btn-primary btn-sm" type="submit">${icons.check} حفظ إعدادات الأتمتة</button>
      </form>
    </div>

    <div class="card card-pad" style="margin-bottom:16px;">
      <div class="card__head">
        <div class="card__title">قوالب رسائل الواتساب</div>
        <div style="display:flex; gap:8px;">
          ${overriddenCount > 0 ? `<button class="btn btn-outline btn-sm" id="resetAllWaBtn">${icons.trash} إعادة الكل للافتراضى (${overriddenCount} معدّل)</button>` : ""}
        </div>
      </div>
      <p class="text-muted" style="font-size:13.5px; margin-bottom:4px;">
        كل رسائل الواتساب المستخدمة فى النظام. اضغط على أي قالب لتعديله. المتغيرات giữa أقواس { } بتتضاف تلقائياً من بيانات الطالب والحصة.
      </p>
    </div>

    <div id="waTemplatesList"></div>
  `;

  renderWhatsAppTemplatesList();

  const waForm = document.getElementById("waAutoSendForm");
  if (waForm) {
    waForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      saveSettings({ ...settings, waAutoSend: data.waAutoSend === "on" });
      toast(data.waAutoSend === "on" ? "تم تفعيل الإرسال التلقائي" : "تم تعطيل الإرسال التلقائي", "success");
    });
  }

  const resetAllBtn = document.getElementById("resetAllWaBtn");
  if (resetAllBtn) {
    resetAllBtn.addEventListener("click", async () => {
      const ok = await confirmDialog({
        title: "إعادة كل القوالب للافتراضى",
        body: `هل أنت متأكد؟ سيتم مسح ${overriddenCount} قالب معدّل والعودة للنصوص الأصلية.`,
        confirmText: "إعادة الضبط",
        tone: "warning",
      });
      if (!ok) return;
      resetAllTemplates();
      toast("تم إعادة كل القوالب للافتراضى", "success");
      renderWhatsAppTemplatesTab(box);
    });
  }

  const waAutoForm = document.getElementById("whatsappAutoForm");
  if (waAutoForm) {
    waAutoForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());
      data.waSilentMode = fd.has("waSilentMode");
      data.waAbsenceBatching = fd.has("waAbsenceBatching");
      data.waReceiptToggle = fd.has("waReceiptToggle");
      saveSettings({ ...getSettings(), ...data, waAutoSend: data.waSilentMode ? false : getSettings().waAutoSend });
      toast("تم حفظ إعدادات أتمتة الواتساب", "success");
    });
  }
}

function renderWhatsAppTemplatesList() {
  const list = document.getElementById("waTemplatesList");
  if (!list) return;

  const overrides = getAllOverrides();

  let html = "";
  CATEGORIES.forEach((cat) => {
    const templates = TEMPLATE_REGISTRY.filter((t) => t.category === cat.id);
    if (!templates.length) return;

    html += `
      <div class="card card-pad" style="margin-bottom:16px;">
        <div class="card__head">
          <div class="card__title">${cat.icon} ${cat.label}</div>
          <span class="badge badge-neutral">${templates.length}</span>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${templates
            .map((tpl) => {
              const isEdited = !!overrides[tpl.id];
              const preview = (overrides[tpl.id] || tpl.defaultBody).split("\n").slice(0, 3).join("\n");
              return `
              <div class="wa-tpl-card ${isEdited ? "wa-tpl-card--edited" : ""}" data-id="${tpl.id}" style="cursor:pointer;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                  <div style="min-width:0;">
                    <div style="display:flex; align-items:center; gap:6px; margin-bottom:3px;">
                      <span style="font-weight:700; font-size:14px;">${escapeHTML(tpl.name)}</span>
                      ${isEdited ? '<span class="badge badge-warning" style="font-size:10px;">معدّل</span>' : ""}
                      <span class="badge badge-neutral" style="font-size:10px;">${tpl.recipient === "parent" ? "ولي الأمر" : "الطالب"}</span>
                    </div>
                    <div class="text-muted" style="font-size:12px; direction:ltr; text-align:left; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:500px;">${escapeHTML(preview)}</div>
                  </div>
                  <div style="display:flex; gap:4px; flex-shrink:0;">
                    <button class="btn btn-outline btn-icon btn-sm editWaTplBtn" data-id="${tpl.id}" title="تعديل">${icons.edit}</button>
                    ${isEdited ? `<button class="btn btn-outline btn-icon btn-sm resetWaTplBtn" data-id="${tpl.id}" title="إعادة للافتراضى">${icons.trash}</button>` : ""}
                  </div>
                </div>
              </div>`;
            })
            .join("")}
        </div>
      </div>`;
  });

  list.innerHTML = html;

  list.querySelectorAll(".wa-tpl-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".editWaTplBtn") || e.target.closest(".resetWaTplBtn")) return;
      openTemplateEditor(card.dataset.id);
    });
  });

  list.querySelectorAll(".editWaTplBtn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openTemplateEditor(btn.dataset.id);
    });
  });

  list.querySelectorAll(".resetWaTplBtn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const tpl = TEMPLATE_REGISTRY.find((t) => t.id === btn.dataset.id);
      const ok = await confirmDialog({
        title: "إعادة للافتراضى",
        body: `هل أنت متأكد من إعادة قالب "<strong>${escapeHTML(tpl?.name || "")}</strong>" للنص الافتراضى؟`,
        confirmText: "إعادة",
        tone: "warning",
      });
      if (!ok) return;
      resetTemplate(btn.dataset.id);
      toast("تم إعادة القالب للافتراضى", "success");
      renderWhatsAppTemplatesList();
    });
  });
}

function openTemplateEditor(templateId) {
  const tpl = TEMPLATE_REGISTRY.find((t) => t.id === templateId);
  if (!tpl) return;

  const { body, isDefault } = getTemplateBody(templateId);

  const bodyHTML = `
    <div style="margin-bottom:12px;">
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
        <span class="badge badge-neutral">${tpl.recipient === "parent" ? "ولي الأمر" : "الطالب"}</span>
        <span class="badge badge-neutral">المصدر: ${escapeHTML(tpl.source)}</span>
        ${isDefault ? '<span class="badge badge-primary">الافتراضى</span>' : '<span class="badge badge-warning">معدّل</span>'}
      </div>
      ${tpl.placeholders.length ? `
      <div style="background:var(--bg-secondary, #f5f5f5); border-radius:8px; padding:10px 12px; margin-bottom:12px;">
        <div style="font-size:12px; font-weight:700; margin-bottom:6px; color:var(--text-secondary);">المتغيرات المتاحة:</div>
        <div style="display:flex; flex-wrap:wrap; gap:6px;">
          ${tpl.placeholders.map((p) => `<code style="background:var(--bg, #fff); padding:2px 8px; border-radius:4px; font-size:12px; border:1px solid var(--border, #e0e0e0);">{${p.key}}</code> <span style="font-size:11px; color:var(--text-secondary);">${escapeHTML(p.label)}</span>`).join("")}
        </div>
      </div>
      ` : ""}
    </div>
    <div class="field">
      <label class="field__label">نص الرسالة</label>
      <textarea class="input" name="body" rows="12" style="font-family:monospace; font-size:13px; line-height:1.6; resize:vertical; white-space:pre-wrap; direction:rtl;">${escapeHTML(body)}</textarea>
      <div class="field__hint">استخدم {variable} لأى متغير يتضاف تلقائياً من بيانات الطالب.</div>
    </div>
  `;

  formModal({
    title: `تعديل قالب: ${tpl.name}`,
    bodyHTML,
    submitText: "حفظ التعديلات",
    wide: true,
  }).then((data) => {
    if (!data) return;
    const newBody = (data.body || "").trim();
    if (!newBody) {
      toast("نص الرسالة مش فاضى", "danger");
      return;
    }
    saveTemplateOverride(templateId, newBody);
    toast("تم حفظ التعديلات", "success");
    renderWhatsAppTemplatesList();
  });
}

/* ── btn-xs معرّف في style.css ── */
