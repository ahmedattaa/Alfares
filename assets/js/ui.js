// =========================================================
// UI — الهيكل العام (Sidebar / Header) + Toast + Dialog
// =========================================================

import { icons } from "./icons.js";
import { initials, formatHeaderDate, escapeHTML } from "./helpers.js";
import { getSession, logout, getSettings, flushPendingWrites, getCurrentShift } from "./storage.js";
import { canAccessPage } from "./permissions.js";
import { THEMES, getCurrentTheme, setCurrentTheme, applyCurrentTheme } from "./themes.js";

const NAV_ITEMS = [
  { page: "dashboard", label: "الرئيسية", icon: icons.home, href: "dashboard.html" },
  { page: "session", label: "إدارة الحصة", icon: icons.grid, href: "session.html" },
  { page: "quick-attendance", label: "حضور الطلاب", icon: icons.check, href: "quick-attendance.html" },
  { page: "reception", label: "استقبال الطلاب", icon: icons.inbox, href: "reception.html" },
  { page: "parent-reception", label: "استقبال ولي الأمر", icon: icons.users, href: "parent-reception.html" },
  { page: "students", label: "الطلاب", icon: icons.users, href: "students.html" },
  { page: "followup", label: "المتابعة", icon: icons.clipboard, href: "followup.html" },
  { page: "teacher-insights", label: "لوحة المعلم", icon: icons.shield, href: "teacher-insights.html" },
  { page: "exams", label: "الامتحانات", icon: icons.chart, href: "exams.html" },
  { page: "finance", label: "اليومية المالية", icon: icons.wallet, href: "finance.html" },
  { page: "shift", label: "الصندوق", icon: icons.wallet, href: "shift.html" },
  { page: "rollover", label: "ترحيل الطلاب", icon: icons.calendar, href: "rollover.html" },
  { page: "settings", label: "الإعدادات", icon: icons.settings, href: "settings.html" },
];

const PAGE_TITLES = {
  dashboard: "الرئيسية",
  "quick-attendance": "حضور الطلاب",
  session: "إدارة الحصة",
  reception: "استقبال الطلاب",
  "parent-reception": "استقبال ولي الأمر",
  "attendance-tracker": "متابعة الحضور والغياب",
  students: "الطلاب",
  student: "تفاصيل الطالب",
  followup: "المتابعة",
  "teacher-insights": "لوحة المعلم",
  exams: "الامتحانات",
  finance: "اليومية المالية",
  shift: "الصندوق",
  rollover: "ترحيل الطلاب",
  settings: "الإعدادات",
};

/** يبنى الهيكل العام للصفحة (Sidebar + Topbar) ويعيد مرجع لعنصر المحتوى */
export function renderShell(activePage) {
  applyCurrentTheme();
  const settings = getSettings();
  const session = getSession();
  const centerName = settings.centerName || "سنتر تعليمى";
  const visibleNavItems = NAV_ITEMS.filter((item) => canAccessPage(session, item.page));

  document.body.insertAdjacentHTML(
    "afterbegin",
    `
    <div class="app-shell">
      <div class="sidebar-backdrop" id="sidebarBackdrop"></div>
      <aside class="sidebar" id="sidebar">
        <div class="sidebar__brand">
          <div class="sidebar__brand-mark">${initials(centerName)}</div>
          <div style="min-width:0">
            <div class="sidebar__brand-text">${centerName}</div>
            <div class="sidebar__brand-sub">نظام إدارة متكامل</div>
          </div>
          <button class="sidebar__close" id="sidebarCloseBtn" aria-label="إغلاق القائمة">${icons.x}</button>
        </div>
        <nav class="sidebar__nav">
          <div class="sidebar__section-title">القوائم الرئيسية</div>
          ${visibleNavItems.map(
            (item) => `
            <a class="nav-link ${item.page === activePage ? "is-active" : ""}" href="${item.href}">
              <span class="nav-icon">${item.icon}</span>
              <span>${item.label}</span>
            </a>`
          ).join("")}
        </nav>
        <div class="sidebar__footer">
          <button class="btn btn-logout btn-block" id="sidebarLogoutBtn">
            ${icons.logout}
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      <div class="main">
        <header class="topbar">
          <div class="topbar__left">
            <button class="menu-toggle" id="menuToggle" aria-label="فتح القائمة">${icons.menu}</button>
            <div>
              <div class="topbar__title">${PAGE_TITLES[activePage] || ""}</div>
            </div>
          </div>
          <div class="topbar__right">
            ${(() => {
              const shift = getCurrentShift();
              const shiftMode = getSettings().shiftMode || "mandatory";
              if (shift) {
                const modeTag = shiftMode === "no_custody" ? " (بدون عهدة)" : "";
                return `<span class="shift-indicator shift-indicator--open" title="وردية مفتوحة${modeTag} — فتحها ${escapeHTML(shift.openedBy)}">${icons.wallet} وردية مفتوحة${modeTag}</span>`;
              }
              if (shiftMode === "disabled") {
                return `<span class="shift-indicator shift-indicator--open" title="الوردية معطّلة" style="background:var(--warning); color:#000;">${icons.alert} وردية معطّلة</span>`;
              }
              return `<span class="shift-indicator shift-indicator--closed" title="لا توجد وردية مفتوحة" style="cursor:pointer;" onclick="window.location.href='shift.html'">${icons.alert} افتح صندوق</span>`;
            })()}
            <span class="topbar__date">${formatHeaderDate()}</span>
            <div class="theme-switcher" id="themeSwitcher">
              <button class="theme-switcher__btn" id="themeToggleBtn" title="تغيير المظهر">
                <span class="theme-switcher__swatch" style="background:${THEMES.find((t) => t.id === getCurrentTheme())?.swatch || "#2563EB"};"></span>
                <span class="theme-switcher__label">المظهر</span>
                ${icons.palette}
              </button>
              <div class="theme-menu" id="themeMenu">
                ${THEMES.map(
                  (t) => `
                  <button type="button" class="theme-menu__item ${getCurrentTheme() === t.id ? "is-active" : ""}" data-theme-id="${t.id}">
                    <span class="theme-menu__swatch" style="background:${t.swatch};"></span>
                    <span>${t.name}</span>
                    ${getCurrentTheme() === t.id ? icons.check : ""}
                  </button>`
                ).join("")}
              </div>
            </div>
            <div class="user-chip" id="userChip">
              <div class="user-chip__avatar">${initials(session?.name || "مستخدم")}</div>
              <div>
                <div class="user-chip__name">${session?.name || "مستخدم"}</div>
                <div class="user-chip__role">${session?.role === "admin" ? "مدير" : session?.role === "assistant" ? "مدرس مساعد" : ""}</div>
              </div>
            </div>
            <button class="topbar-logout" id="logoutBtn" title="تسجيل الخروج">
              ${icons.logout}
              <span>خروج</span>
            </button>
          </div>
        </header>
        <main class="page" id="pageContent"></main>
      </div>
    </div>

    <div class="toast-stack" id="toastStack"></div>
    `
  );

  bindShellEvents();
  return document.getElementById("pageContent");
}

function bindShellEvents() {
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  const menuToggle = document.getElementById("menuToggle");

  const openSidebar = () => {
    sidebar.classList.add("is-open");
    backdrop.classList.add("is-open");
  };
  const closeSidebar = () => {
    sidebar.classList.remove("is-open");
    backdrop.classList.remove("is-open");
  };

  menuToggle?.addEventListener("click", openSidebar);
  backdrop?.addEventListener("click", closeSidebar);
  document.getElementById("sidebarCloseBtn")?.addEventListener("click", closeSidebar);

  const doLogout = async () => {
    logout();
    await flushPendingWrites();
    window.location.href = "login.html";
  };
  document.getElementById("logoutBtn")?.addEventListener("click", doLogout);
  document.getElementById("sidebarLogoutBtn")?.addEventListener("click", doLogout);

  const themeSwitcher = document.getElementById("themeSwitcher");
  const themeMenu = document.getElementById("themeMenu");
  document.getElementById("themeToggleBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    themeMenu.classList.toggle("is-open");
  });
  themeMenu?.querySelectorAll(".theme-menu__item").forEach((btn) =>
    btn.addEventListener("click", () => {
      setCurrentTheme(btn.dataset.themeId);
      themeMenu.classList.remove("is-open");
      themeMenu.querySelectorAll(".theme-menu__item").forEach((b) => b.classList.toggle("is-active", b === btn));
      themeMenu.querySelectorAll(".theme-menu__item svg").forEach((s) => s.remove());
      btn.insertAdjacentHTML("beforeend", icons.check);
      // تحديث لون السواتش على الزرار
      const newSwatch = THEMES.find((t) => t.id === btn.dataset.themeId)?.swatch;
      const btnSwatch = document.querySelector(".theme-switcher__btn .theme-switcher__swatch");
      if (btnSwatch && newSwatch) btnSwatch.style.background = newSwatch;
    })
  );
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#themeSwitcher")) themeMenu?.classList.remove("is-open");
  });
}

/* ================= Toast ================= */
export function toast(message, type = "success", duration = 3200) {
  const stack = document.getElementById("toastStack");
  if (!stack) return;

  const iconMap = { success: icons.check, danger: icons.x, warning: icons.alert, info: icons.info };
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-icon">${iconMap[type] || icons.info}</span><span>${message}</span>`;
  stack.appendChild(el);

  setTimeout(() => {
    el.classList.add("is-leaving");
    setTimeout(() => el.remove(), 200);
  }, duration);
}

/* ================= Confirm / Prompt Dialog ================= */
let overlayEl = null;

export function ensureOverlay() {
  if (overlayEl) return overlayEl;
  overlayEl = document.createElement("div");
  overlayEl.className = "modal-overlay";
  overlayEl.id = "modalOverlay";
  document.body.appendChild(overlayEl);
  return overlayEl;
}

/**
 * يعرض نافذة حوارية وينتظر رد المستخدم
 * options: { title, body, confirmText, cancelText, tone }
 * يرجع Promise<boolean>
 */
export function confirmDialog({
  title = "تأكيد",
  body = "",
  confirmText = "تأكيد",
  cancelText = "إلغاء",
  tone = "primary",
} = {}) {
  const overlay = ensureOverlay();
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__head">
        <div class="modal__title">${title}</div>
      </div>
      <div class="modal__body">${body}</div>
      <div class="modal__actions">
        <button class="btn btn-outline" id="modalCancel">${cancelText}</button>
        <button class="btn btn-${tone}" id="modalConfirm">${confirmText}</button>
      </div>
    </div>
  `;
  overlay.classList.add("is-open");

  return new Promise((resolve) => {
    const close = (result) => {
      overlay.classList.remove("is-open");
      resolve(result);
    };
    overlay.querySelector("#modalConfirm").addEventListener("click", () => close(true));
    overlay.querySelector("#modalCancel").addEventListener("click", () => close(false));
    overlay.addEventListener(
      "click",
      (e) => {
        if (e.target === overlay) close(false);
      },
      { once: true }
    );
  });
}

/** حوار بثلاثة خيارات (مثال: هل دفع؟ نعم / لا) - يرجع 'yes' | 'no' | null */
export function choiceDialog({ title, body, yesText = "نعم", noText = "لا" } = {}) {
  const overlay = ensureOverlay();
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__head">
        <div class="modal__title">${title}</div>
      </div>
      <div class="modal__body">${body}</div>
      <div class="modal__actions">
        <button class="btn btn-outline" id="choiceNo">${noText}</button>
        <button class="btn btn-success" id="choiceYes">${yesText}</button>
      </div>
    </div>
  `;
  overlay.classList.add("is-open");

  return new Promise((resolve) => {
    const close = (result) => {
      overlay.classList.remove("is-open");
      resolve(result);
    };
    overlay.querySelector("#choiceYes").addEventListener("click", () => close("yes"));
    overlay.querySelector("#choiceNo").addEventListener("click", () => close("no"));
  });
}

/**
 * نافذة تحتوى على فورم كامل (إضافة/تعديل)
 * bodyHTML يجب أن يحتوى على عناصر <input>/<select> بخصائص name
 * يرجع Promise<Object|null> — كائن ببيانات الفورم أو null عند الإلغاء
 */
export function formModal({ title, bodyHTML, submitText = "حفظ", cancelText = "إلغاء", wide = false } = {}) {
  const overlay = ensureOverlay();
  overlay.innerHTML = `
    <div class="modal" style="${wide ? "max-width:560px;" : ""}">
      <div class="modal__head">
        <div class="modal__title">${title}</div>
      </div>
      <form id="dialogForm">
        <div class="modal__body">${bodyHTML}</div>
        <div class="modal__actions">
          <button type="button" class="btn btn-outline" id="formCancel">${cancelText}</button>
          <button type="submit" class="btn btn-primary" id="formSubmit">${submitText}</button>
        </div>
      </form>
    </div>
  `;
  overlay.classList.add("is-open");

  return new Promise((resolve) => {
    const form = overlay.querySelector("#dialogForm");
    const close = (result) => {
      overlay.classList.remove("is-open");
      resolve(result);
    };
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      close(data);
    });
    overlay.querySelector("#formCancel").addEventListener("click", () => close(null));
  });
}

/**
 * حوار بقائمة أزرار متعددة (مثال: اختيار حالة طالب من عدة خيارات)
 * buttons: [{ id, label, tone }]
 * يرجع Promise<string|null> — معرف الزرار المختار أو null عند الإلغاء
 */
export function menuDialog({ title = "", bodyHTML = "", buttons = [] } = {}) {
  const overlay = ensureOverlay();
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__head">
        <div class="modal__title">${title}</div>
      </div>
      <div class="modal__body">
        ${bodyHTML}
        <div class="status-btn-grid" style="margin-top:${bodyHTML ? "14px" : "0"};">
          ${buttons.map((b) => `<button type="button" class="btn btn-${b.tone || "outline"} menuOptionBtn" data-id="${b.id}">${b.label}</button>`).join("")}
        </div>
      </div>
      <div class="modal__actions">
        <button class="btn btn-outline" id="menuCancel">إلغاء</button>
      </div>
    </div>
  `;
  overlay.classList.add("is-open");

  return new Promise((resolve) => {
    const close = (result) => {
      overlay.classList.remove("is-open");
      resolve(result);
    };
    overlay.querySelectorAll(".menuOptionBtn").forEach((btn) => btn.addEventListener("click", () => close(btn.dataset.id)));
    overlay.querySelector("#menuCancel").addEventListener("click", () => close(null));
  });
}

/**
 * حوار معاينة وتعديل رسالة واتساب قبل الإرسال — يعرض نص افتراضى جاهز وقابل
 * للتعديل الكامل قبل ما يدوس المستخدم "إرسال واتساب" (اللي بيفتح واتساب
 * بالرسالة جاهزة، والإرسال الفعلى بيتم من جوه واتساب نفسه)
 */
export function whatsappPreviewDialog({ title = "إرسال عبر واتساب", recipientLabel = "", defaultMessage = "" } = {}) {
  const overlay = ensureOverlay();
  overlay.innerHTML = `
    <div class="modal" style="max-width:480px;">
      <div class="modal__head">
        <div class="modal__title">${title}</div>
      </div>
      <div class="modal__body">
        ${recipientLabel ? `<div class="field__hint" style="margin-bottom:10px;">سيتم الإرسال إلى: <strong>${recipientLabel}</strong></div>` : ""}
        <div class="field">
          <label class="field__label">نص الرسالة (قابل للتعديل قبل الإرسال)</label>
          <textarea class="input" id="waMessageArea" rows="7" style="resize:vertical; line-height:1.7;">${defaultMessage}</textarea>
        </div>
      </div>
      <div class="modal__actions">
        <button class="btn btn-outline" id="waCancel">إلغاء</button>
        <button class="btn btn-success" id="waSend">${icons.check} فتح واتساب وإرسال</button>
      </div>
    </div>
  `;
  overlay.classList.add("is-open");

  return new Promise((resolve) => {
    const close = (result) => {
      overlay.classList.remove("is-open");
      resolve(result);
    };
    overlay.querySelector("#waCancel").addEventListener("click", () => close(null));
    overlay.querySelector("#waSend").addEventListener("click", () => {
      const message = overlay.querySelector("#waMessageArea").value;
      close(message);
    });
  });
}

/* ================= Empty state helper ================= */
export function emptyStateHTML({ title = "لا توجد بيانات", text = "", icon = icons.info } = {}) {
  return `
    <div class="empty-state">
      <div class="empty-state__icon">${icon}</div>
      <div class="empty-state__title">${title}</div>
      <div class="empty-state__text">${text}</div>
    </div>
  `;
}

/* ================= Skeleton loading helper ================= */
export function skeletonRows(count = 4, height = 44) {
  return Array.from({ length: count })
    .map(() => `<div class="skeleton" style="height:${height}px; border-radius:12px; margin-bottom:10px;"></div>`)
    .join("");
}
