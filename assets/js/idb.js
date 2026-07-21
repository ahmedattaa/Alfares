// =========================================================
// IDB — طبقة تخزين IndexedDB بسيطة (Key-Value) بدون أى Dependency خارجية
// أساس تخزين محلى ضخم بدل LocalStorage المحدود بحوالى 5-10 ميجا بايت فقط
// =========================================================

const DB_NAME = "center_management_db";
const DB_VERSION = 1;
const STORE_NAME = "kv_store";

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("المتصفح ده مش بيدعم IndexedDB"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

/** قراءة قيمة بمفتاحها */
export async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** قراءة كل المفاتيح والقيم دفعة واحدة (تُستخدم عند تحميل التطبيق أول مرة) */
export async function idbGetAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const keysReq = store.getAllKeys();
    const valuesReq = store.getAll();
    let keys, values;

    keysReq.onsuccess = () => { keys = keysReq.result; tryResolve(); };
    valuesReq.onsuccess = () => { values = valuesReq.result; tryResolve(); };
    tx.onerror = () => reject(tx.error);

    function tryResolve() {
      if (keys !== undefined && values !== undefined) {
        const map = {};
        keys.forEach((k, i) => { map[k] = values[i]; });
        resolve(map);
      }
    }
  });
}

/** كتابة قيمة بمفتاحها (Fire-and-forget آمن — الأخطاء بتتسجل فى الـ console بس ملهاش تأثير على الواجهة) */
export async function idbSet(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/** حذف مفتاح واحد */
export async function idbDelete(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/** مسح كل البيانات المخزّنة بالكامل (تُستخدم فى "إعادة ضبط النظام") */
export async function idbClear() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}
