// =========================================================
// Login — منطق صفحة تسجيل الدخول
// =========================================================

import { seedIfNeeded, login, getSettings, flushPendingWrites } from "./storage.js";
import { redirectIfLoggedIn } from "./app.js";
import { toast } from "./ui.js";
import { initials, fakeDelay } from "./helpers.js";
import { applyCurrentTheme } from "./themes.js";

const form = document.getElementById("loginForm");
const errorBox = document.getElementById("authError");
const loginBtn = document.getElementById("loginBtn");
const loginBtnText = document.getElementById("loginBtnText");

async function bootstrap() {
  await seedIfNeeded();
  await redirectIfLoggedIn();

  const settings = getSettings();
  if (settings.centerName) {
    document.getElementById("authCenterName").textContent = settings.centerName;
    document.getElementById("authLogo").textContent = initials(settings.centerName);
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBox.classList.remove("is-open");
  await seedIfNeeded();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  loginBtn.disabled = true;
  loginBtnText.innerHTML = `<span class="spinner"></span>`;
  await fakeDelay(400);

  const session = login(username, password);

  if (!session) {
    errorBox.classList.add("is-open");
    loginBtn.disabled = false;
    loginBtnText.textContent = "تسجيل الدخول";
    toast("فشل تسجيل الدخول، برجاء التأكد من البيانات", "danger");
    return;
  }

  toast(`مرحبًا بعودتك، ${session.name}`, "success");
  applyCurrentTheme();
  await fakeDelay(300);
  await flushPendingWrites();
  window.location.href = "dashboard.html";
});

bootstrap();
