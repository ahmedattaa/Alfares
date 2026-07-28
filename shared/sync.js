// =========================================================
// Sync — طبقة المزامنة (Dexie ↔ Supabase)
// Offline-first: كل شيء يكتب محليًا أولًا ثم يُزامَن
// =========================================================

import { readJSON, writeJSON } from "../assets/js/storage.js";

/* ── الإعدادات ── */

const SYNC_CONFIG_KEY = "center_sync_config";
const SYNC_LOG_KEY = "center_sync_log";
const SYNC_STATUS_KEY = "center_sync_status";

let _supabaseClient = null;
let _syncInterval = null;
let _pendingOps = [];

/* ── إعداد Supabase ── */

export function configureSync({ supabaseUrl, supabaseAnonKey }) {
  writeJSON(SYNC_CONFIG_KEY, { supabaseUrl, supabaseAnonKey, configured: true });
}

export function getSyncConfig() {
  return readJSON(SYNC_CONFIG_KEY, { supabaseUrl: "", supabaseAnonKey: "", configured: false });
}

export function isSyncConfigured() {
  const config = getSyncConfig();
  return config.configured && config.supabaseUrl && config.supabaseAnonKey;
}

/* ── تهيئة العميل ── */

async function getClient() {
  if (_supabaseClient) return _supabaseClient;

  const config = getSyncConfig();
  if (!config.configured) return null;

  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    _supabaseClient = createClient(config.supabaseUrl, config.supabaseAnonKey);
    return _supabaseClient;
  } catch (e) {
    console.error("فشل تهيئة Supabase client:", e);
    return null;
  }
}

/* ── حالة المزامنة ── */

export function getSyncStatus() {
  return readJSON(SYNC_STATUS_KEY, {
    lastSync: null,
    pendingCount: 0,
    errorCount: 0,
    lastError: null,
    isOnline: navigator.onLine,
  });
}

function updateSyncStatus(updates) {
  const current = getSyncStatus();
  writeJSON(SYNC_STATUS_KEY, { ...current, ...updates });
}

/* ── سجل المزامنة ── */

function logSync(action, key, status, details = "") {
  const logs = readJSON(SYNC_LOG_KEY, []);
  logs.push({
    id: Date.now(),
    action,
    key,
    status,
    details,
    timestamp: new Date().toISOString(),
  });
  if (logs.length > 200) logs.splice(0, logs.length - 200);
  writeJSON(SYNC_LOG_KEY, logs);
}

export function getSyncLog() {
  return readJSON(SYNC_LOG_KEY, []);
}

/* ── Queue مؤقتة للعمليات ── */

function queueOperation(op) {
  _pendingOps.push(op);
  updateSyncStatus({ pendingCount: _pendingOps.length });
}

/* ── جلب بيانات من Supabase ── */

export async function pullFromCloud(table, key) {
  const client = await getClient();
  if (!client) return { ok: false, error: "Supabase غير متصل" };

  try {
    const { data, error } = await client.from(table).select("*");
    if (error) throw error;

    if (data && data.length > 0) {
      writeJSON(key, data);
      logSync("pull", table, "success", `${data.length} سجل`);
    }

    return { ok: true, count: data?.length || 0 };
  } catch (e) {
    logSync("pull", table, "error", e.message);
    updateSyncStatus({ errorCount: getSyncStatus().errorCount + 1, lastError: e.message });
    return { ok: false, error: e.message };
  }
}

/* ── رفع بيانات إلى Supabase ── */

export async function pushToCloud(table, data) {
  const client = await getClient();
  if (!client) return { ok: false, error: "Supabase غير متصل" };

  try {
    const { error } = await client.from(table).upsert(data, { onConflict: "id" });
    if (error) throw error;

    logSync("push", table, "success", `${data.length} سجل`);
    return { ok: true };
  } catch (e) {
    logSync("push", table, "error", e.message);
    queueOperation({ type: "push", table, data, timestamp: Date.now() });
    updateSyncStatus({ errorCount: getSyncStatus().errorCount + 1, lastError: e.message });
    return { ok: false, error: e.message };
  }
}

/* ── مزامنة كيان واحد ── */

export async function syncEntity(table, key) {
  const localData = readJSON(key, []);
  const pullResult = await pullFromCloud(table, key);

  if (pullResult.ok && localData.length > 0) {
    await pushToCloud(table, localData);
  }

  return pullResult;
}

/* ── مزامنة شاملة ── */

const ENTITY_MAP = {
  students: { table: "students", key: "center_students" },
  groups: { table: "groups", key: "center_groups" },
  grades: { table: "grades", key: "center_grades" },
  attendance: { table: "attendance", key: "center_attendance" },
  payments: { table: "payments", key: "center_payments" },
  exams: { table: "exams", key: "center_exams" },
  subjects: { table: "subjects", key: "center_subjects" },
  topics: { table: "topics", key: "center_topics" },
  questions: { table: "questions", key: "center_questions" },
  settings: { table: "settings", key: "center_settings" },
  followupLogs: { table: "followup_logs", key: "center_followup_logs" },
  achievements: { table: "achievements", key: "center_achievements" },
};

export async function syncAll() {
  if (!isSyncConfigured()) return { ok: false, error: "المزامنة غير مُعدّة" };
  if (!navigator.onLine) return { ok: false, error: "لا يوجد اتصال بالإنترنت" };

  updateSyncStatus({ isOnline: true });
  const results = {};

  for (const [name, { table, key }] of Object.entries(ENTITY_MAP)) {
    results[name] = await syncEntity(table, key);
  }

  updateSyncStatus({ lastSync: new Date().toISOString(), pendingCount: 0 });
  return { ok: true, results };
}

/* ── مزامنة تلقائية ── */

export function startAutoSync(intervalMs = 30000) {
  stopAutoSync();
  _syncInterval = setInterval(async () => {
    if (navigator.onLine && isSyncConfigured()) {
      await syncAll();
    }
  }, intervalMs);
  updateSyncStatus({ isOnline: navigator.onLine });
}

export function stopAutoSync() {
  if (_syncInterval) {
    clearInterval(_syncInterval);
    _syncInterval = null;
  }
}

/* ── مراقبة الاتصال ── */

export function watchConnectivity() {
  window.addEventListener("online", () => {
    updateSyncStatus({ isOnline: true });
    if (isSyncConfigured()) syncAll();
  });
  window.addEventListener("offline", () => {
    updateSyncStatus({ isOnline: false });
  });
}

/* ── معالجة العمليات المؤجلة ── */

export async function processPendingOps() {
  if (!isSyncConfigured() || !navigator.onLine) return;

  const ops = [..._pendingOps];
  _pendingOps = [];

  for (const op of ops) {
    if (op.type === "push") {
      await pushToCloud(op.table, op.data);
    }
  }

  updateSyncStatus({ pendingCount: _pendingOps.length });
}

/* ── Auth مع Supabase ── */

export async function cloudLogin(email, password) {
  const client = await getClient();
  if (!client) return { ok: false, error: "Supabase غير متصل" };

  try {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return { ok: true, user: data.user };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function cloudRegister(email, password, metadata = {}) {
  const client = await getClient();
  if (!client) return { ok: false, error: "Supabase غير متصل" };

  try {
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { data: metadata },
    });
    if (error) throw error;
    return { ok: true, user: data.user };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function cloudLogout() {
  const client = await getClient();
  if (client) await client.auth.signOut();
}

/* ── حفظ/جلب ملفات Supabase Storage ── */

export async function uploadFile(bucket, path, file) {
  const client = await getClient();
  if (!client) return { ok: false, error: "Supabase غير متصل" };

  try {
    const { error } = await client.storage.from(bucket).upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });
    if (error) throw error;

    const { data: urlData } = client.storage.from(bucket).getPublicUrl(path);
    return { ok: true, url: urlData.publicUrl };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function getFileUrl(bucket, path) {
  const client = await getClient();
  if (!client) return null;

  const { data } = client.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || null;
}

export async function deleteFile(bucket, path) {
  const client = await getClient();
  if (!client) return { ok: false, error: "Supabase غير متصل" };

  try {
    const { error } = await client.storage.from(bucket).remove([path]);
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
