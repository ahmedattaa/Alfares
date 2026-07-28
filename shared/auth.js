// =========================================================
// Auth — طبقة المصادقة والصلاحيات
// =========================================================

import { getUsers, saveUsers, writeJSON, readJSON } from "../assets/js/storage.js";

const AUTH_KEY = "center_auth";

function hashPassword(password) {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const chr = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return "h_" + Math.abs(hash).toString(36);
}

/* ── الأدوار ── */

export const ROLES = {
  admin: { label: "مدير", level: 100, permissions: ["*"] },
  teacher: { label: "مدرس", level: 50, permissions: ["attendance", "grades", "reports", "view_students"] },
  assistant: { label: "مساعد", level: 30, permissions: ["attendance", "view_students", "reports"] },
  secretary: { label: "سكرتارية", level: 20, permissions: ["attendance", "payments", "view_students"] },
  parent: { label: "ولي أمر", level: 10, permissions: ["view_child"] },
  student: { label: "طالب", level: 5, permissions: ["view_self", "exams", "assignments"] },
};

/* ── التسجيل ── */

export function registerUser({ name, email, password, role = "assistant", phone = "" }) {
  const users = getUsers();
  if (users.find((u) => u.email === email)) {
    return { ok: false, error: "البريد الإلكتروني مستخدم بالفعل" };
  }

  const user = {
    id: "USR-" + Date.now().toString(36) + Math.floor(Math.random() * 1000),
    name,
    email,
    password: hashPassword(password),
    role,
    phone,
    createdAt: new Date().toISOString(),
    active: true,
  };

  users.push(user);
  saveUsers(users);
  return { ok: true, user: { ...user, password: undefined } };
}

/* ── تسجيل الدخول ── */

export function loginUser(email, password) {
  const users = getUsers();
  const user = users.find((u) => u.email === email && u.password === hashPassword(password));
  if (!user) return { ok: false, error: "البريد أو كلمة السر غير صحيحة" };
  if (!user.active) return { ok: false, error: "الحساب معطّل" };

  const session = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    loginAt: new Date().toISOString(),
  };

  writeJSON(AUTH_KEY, session);
  return { ok: true, user: session };
}

/* ── تسجيل الخروج ── */

export function logoutUser() {
  writeJSON(AUTH_KEY, null);
}

/* ── الجلسة الحالية ── */

export function getCurrentUser() {
  return readJSON(AUTH_KEY, null);
}

export function isLoggedIn() {
  return !!getCurrentUser();
}

/* ── الصلاحيات ── */

export function hasPermission(permission) {
  const user = getCurrentUser();
  if (!user) return false;
  const role = ROLES[user.role];
  if (!role) return false;
  if (role.permissions.includes("*")) return true;
  return role.permissions.includes(permission);
}

export function hasRole(minRole) {
  const user = getCurrentUser();
  if (!user) return false;
  const userLevel = ROLES[user.role]?.level || 0;
  const requiredLevel = ROLES[minRole]?.level || 0;
  return userLevel >= requiredLevel;
}

/* ── إدارة المستخدمين (Admin only) ── */

export function getAllUsers() {
  return getUsers().map((u) => ({ ...u, password: undefined }));
}

export function updateUser(userId, updates) {
  const users = getUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) return false;
  if (updates.password) updates.password = hashPassword(updates.password);
  users[idx] = { ...users[idx], ...updates };
  saveUsers(users);
  return true;
}

export function deleteUser(userId) {
  const users = getUsers().filter((u) => u.id !== userId);
  saveUsers(users);
}

export function toggleUserActive(userId) {
  const users = getUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) return false;
  user.active = !user.active;
  saveUsers(users);
  return user.active;
}

/* ── الحماية ── */

export function requireAuth() {
  if (!isLoggedIn()) {
    window.location.href = "login.html";
    return false;
  }
  return true;
}

export function requireRole(minRole) {
  if (!hasRole(minRole)) {
    window.location.href = "index.html";
    return false;
  }
  return true;
}

/* ── حماية الـ API calls ── */

export function withAuth(fn) {
  return function (...args) {
    if (!isLoggedIn()) throw new Error("يجب تسجيل الدخول أولاً");
    return fn(...args);
  };
}
