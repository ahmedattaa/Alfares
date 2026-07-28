// =========================================================
// 🧪 Test Data Injection — 7 مجموعات ثلاثاء × 52+ طالب × كل الحالات
// يكتب مباشرة في IndexedDB (اللي التطبيق بيستخدمه)
// الصق في Console ثم اضغط Enter
// =========================================================

(async () => {
  // ── فتح IndexedDB ──
  const DB_NAME = "center_management_db";
  const STORE = "kv_store";

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function idbGetAll(db) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const keysReq = store.getAllKeys();
      const valsReq = store.getAll();
      let keys, vals;
      keysReq.onsuccess = () => { keys = keysReq.result; tryR(); };
      valsReq.onsuccess = () => { vals = valsReq.result; tryR(); };
      tx.onerror = () => reject(tx.error);
      function tryR() { if (keys && vals) { const m = {}; keys.forEach((k, i) => m[k] = vals[i]); resolve(m); } }
    });
  }

  function idbSet(db, key, value) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ── Helpers ──
  let _c = 0;
  const uid = (p) => `${p}-${Date.now().toString(36)}${(++_c).toString(36)}`;

  const today = new Date().toISOString().split("T")[0];
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  // ── Arabic names ──
  const firstNames = ["محمد","أحمد","علي","حسن","حسين","عمر","عثمان","إبراهيم","إسماعيل","يوسف","خالد","عبدالله","عبدالرحمن","مصطفى","ياسر","طارق","منصور","كمال","جمال","سعيد","سامي","هاني","وليد","ماجد","ناصر","بلال","رامي","أشرف","هشام","تامر","كريم","شريف","محمود","وائل","باسم","فاطمة","عائشة","مريم","خديجة","نورة","سارة","منى","هدى","رقية","زينب","نادى","ياسمين","سلمى","ريم"];
  const lastNames = ["محمد","أحمد","علي","حسن","حسين","عبدالله","عبدالرحمن","Saleh","Hassan","Ibrahim","Youssef","Khaled","Mahmoud","Farouk","Nasser","Rashid","Adel","Fathy","Sayed","Mansour","Gamal","Kamal","Reda","Lotfy","Zaki","Nabil","Taha"];
  const randName = () => `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
  const randPhone = () => `01${[1,2,5][Math.floor(Math.random()*3)]}${Math.floor(10000000+Math.random()*90000000)}`;

  // ── Status distribution per group (52 طالب) ──
  const DIST = [
    { id: "ST-PAID",       n: 14 },
    { id: "ST-UNPAID",     n: 10 },
    { id: "ST-EXCUSED",    n: 7  },
    { id: "ST-ABSENT",     n: 5  },
    { id: "ST-CALL",       n: 3  },
    { id: "ST-EXPEL",      n: 2  },
    { id: "ST-ACA-WARN",   n: 2  },
    { id: "ST-SUSPEND",    n: 2  },
    { id: "ST-CONFISCATE", n: 2  },
    { id: "ST-ONLINE",     n: 2  },
  ];

  // ── 7 مجموعات ثلاثاء ──
  const GROUPS = [
    { gradeId: "GR1", code: "T1", name: "ثلاثاء أوائل 9:00 ص",   time: "09:00", price: 50 },
    { gradeId: "GR1", code: "T2", name: "ثلاثاء أوائل 10:30 ص",  time: "10:30", price: 50 },
    { gradeId: "GR2", code: "T3", name: "ثلاثاء متوسط 12:00 م",  time: "12:00", price: 60 },
    { gradeId: "GR2", code: "T4", name: "ثلاثاء متوسط 1:30 م",   time: "13:30", price: 60 },
    { gradeId: "GR3", code: "T5", name: "ثلاثاء أعدادي 3:00 م",  time: "15:00", price: 70 },
    { gradeId: "GR3", code: "T6", name: "ثلاثاء أعدادي 4:30 م",  time: "16:30", price: 70 },
    { gradeId: "GR3", code: "T7", name: "ثلاثاء أعدادي 6:00 م",  time: "18:00", price: 70 },
  ];

  // ── افتح DB واقرأ البيانات الموجودة ──
  const db = await openDB();
  const all = await idbGetAll(db);

  const existingGroups = all.center_groups || [];
  const existingStudents = all.center_students || [];
  const existingAttendance = all.center_attendance || [];
  const existingPayments = all.center_payments || [];
  const existingCharges = all.center_extra_charges || [];

  console.log(`📦 موجود: ${existingGroups.length} مجموعات, ${existingStudents.length} طلاب`);

  // ── تحقق لو فيه بيانات قبل كده اليوم ──
  const alreadyInjected = existingGroups.some((g) => g.days?.includes("الثلاثاء") && g.name?.includes("ثلاثاء أوائل"));
  if (alreadyInjected) {
    console.log("⚠️ البيانات اteinject قبل كده! هحذف القديم وأضيف تاني...");
    // حذف المجموعات القديمة اللي عملناها
    const oldGroupIds = existingGroups.filter((g) => g.days?.includes("الثلاثاء") && g.name?.includes("ثلاثاء")).map((g) => g.id);
    const newGroups = existingGroups.filter((g) => !oldGroupIds.includes(g.id));
    const newStudents = existingStudents.filter((s) => !oldGroupIds.includes(s.groupId));
    const newAtt = existingAttendance.filter((a) => !newStudents.some((s) => s.id === a.studentId) || existingStudents.some((s) => s.id === a.studentId));
    // ببساطة: نحذف كل حاجة قديمة ونعمل جديد
    await idbSet(db, "center_groups", []);
    await idbSet(db, "center_students", []);
    await idbSet(db, "center_attendance", []);
    await idbSet(db, "center_payments", []);
    await idbSet(db, "center_extra_charges", []);
  }

  // ── أعد قراءة بعد المسح ──
  const fresh = await idbGetAll(db);
  const groups = fresh.center_groups || [];
  const students = fresh.center_students || [];
  const attendance = fresh.center_attendance || [];
  const payments = fresh.center_payments || [];
  const charges = fresh.center_extra_charges || [];

  const newGroups = [];
  const newStudents = [];
  const newAttendance = [];
  const newPayments = [];
  const newCharges = [];

  let codeBase = 900;

  for (const gDef of GROUPS) {
    const groupId = uid("GRP");
    newGroups.push({
      id: groupId, code: gDef.code, gradeId: gDef.gradeId, name: gDef.name,
      days: ["الثلاثاء"], time: gDef.time, duration: 60, capacity: 55, sessionPrice: gDef.price,
    });

    let si = 0;
    for (const d of DIST) {
      for (let i = 0; i < d.n; i++) {
        si++;
        const sid = uid("STU");
        const code = `${gDef.code}${String(si).padStart(2, "0")}`;
        const hasDiscount = Math.random() > 0.7;
        const discount = hasDiscount ? [5, 10, 15][Math.floor(Math.random() * 3)] : 0;
        const hasWallet = Math.random() > 0.8;
        const wallet = hasWallet ? Math.floor(Math.random() * 200) + 20 : 0;
        const hasLate = d.id === "ST-UNPAID" && Math.random() > 0.4;
        const late = hasLate ? gDef.price * Math.floor(Math.random() * 4 + 1) : 0;

        newStudents.push({
          id: sid, code, name: randName(), gradeId: gDef.gradeId, groupId,
          phone: randPhone(), parentPhone: randPhone(), fatherJob: "", school: "",
          joinDate: today, status: "active", discount, lateBalance: late, walletBalance: wallet,
          locked: d.id === "ST-SUSPEND", lockReason: d.id === "ST-SUSPEND" ? "إيقاف مؤقت" : null,
          lockDate: d.id === "ST-SUSPEND" ? today : null,
        });

        const isAction = ["ST-CALL","ST-EXPEL","ST-ACA-WARN","ST-SUSPEND","ST-CONFISCATE","ST-ONLINE"].includes(d.id);
        const att = {
          id: uid("ATT"), studentId: sid, date: today,
          time: isAction ? "-" : timeStr, statusId: d.id,
          category: isAction ? "action" : "attendance", note: "", termId: null, monthId: null,
        };
        newAttendance.push(att);

        if (d.id === "ST-PAID") {
          newPayments.push({
            id: uid("PAY"), studentId: sid, groupId, attendanceId: att.id,
            date: today, sessionDate: today, amount: gDef.price - discount,
            walletUsed: 0, status: "paid", lateBalanceDelta: late > 0 ? -late : 0,
            note: "حضور ودفع (تست)", termId: null, monthId: null,
          });
        }
        if (d.id === "ST-UNPAID") {
          newPayments.push({
            id: uid("PAY"), studentId: sid, groupId, attendanceId: att.id,
            date: today, sessionDate: today, amount: gDef.price,
            walletUsed: 0, status: "unpaid", lateBalanceDelta: gDef.price,
            note: "حضور بدون دفع (تست)", termId: null, monthId: null,
          });
        }
        if (Math.random() > 0.85 && (d.id === "ST-PAID" || d.id === "ST-UNPAID")) {
          newCharges.push({
            id: uid("CHG"), batchId: uid("B"), studentId: sid,
            name: ["ملزمة امتحان","قلم رصاص","copie","رسوم نشاط"][Math.floor(Math.random()*4)],
            amount: [10,15,20,25,30][Math.floor(Math.random()*5)],
            date: today, status: Math.random() > 0.5 ? "paid" : "unpaid",
          });
        }
      }
    }
    console.log(`✅ ${gDef.name} — ${si} طالب`);
  }

  // ── ادمج واحفظ في IndexedDB ──
  const allGroups = [...groups, ...newGroups];
  const allStudents = [...students, ...newStudents];
  const allAtt = [...attendance, ...newAttendance];
  const allPay = [...payments, ...newPayments];
  const allChg = [...charges, ...newCharges];

  await idbSet(db, "center_groups", allGroups);
  await idbSet(db, "center_students", allStudents);
  await idbSet(db, "center_attendance", allAtt);
  await idbSet(db, "center_payments", allPay);
  await idbSet(db, "center_extra_charges", allChg);

  console.log("\n═══════════════════════════════════════════");
  console.log("🧪 تم بنجاح!");
  console.log("═══════════════════════════════════════════");
  console.log(`📅 التاريخ: ${today} (الثلاثاء)`);
  console.log(`🏫 مجموعات: ${newGroups.length} جديدة (إجمالى ${allGroups.length})`);
  console.log(`👨‍🎓 طلاب: ${newStudents.length} جديد (إجمالى ${allStudents.length})`);
  console.log(`📝 حضور: ${newAtt.length} سجل`);
  console.log(`💰 مدفوعات: ${newPay.length} سجل`);
  console.log(`📋 مستحقات: ${newChg.length} سجل`);
  console.log("");
  console.log("📊 التوزيع فى كل مجموعة:");
  DIST.forEach((d) => console.log(`   ${d.id}: ${d.n} × 7 = ${d.n * 7}`));
  console.log("");
  console.log("🔄 أعد تحميل الصفحة عشان تشوف البيانات.");
  console.log("═══════════════════════════════════════════");
})();
