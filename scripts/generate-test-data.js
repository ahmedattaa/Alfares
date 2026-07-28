// =========================================================
// Generate test-tuesday.json — يتعمل مرة واحدة فقط
// node scripts/generate-test-data.js > assets/mock/test-tuesday.json
// =========================================================

let _c = 0;
const uid = (p) => `${p}-gen${(++_c)}`;

const firstNames = ["محمد","أحمد","علي","حسن","حسين","عمر","عثمان","إبراهيم","إسماعيل","يوسف","خالد","عبدالله","عبدالرحمن","مصطفى","ياسر","طارق","منصور","كمال","جمال","سعيد","سامي","هاني","وليد","ماجد","ناصر","بلال","رامي","أشرف","هشام","تامر","كريم","شريف","محمود","وائل","باسم","فاطمة","عائشة","مريم","خديجة","نورة","سارة","منى","هدى","رقية","زينب","نادى","ياسمين","سلمى","ريم"];
const lastNames = ["محمد","أحمد","علي","حسن","حسين","عبدالله","عبدالرحمن","Saleh","Hassan","Ibrahim","Youssef","Khaled","Mahmoud","Farouk","Nasser","Rashid","Adel","Fathy","Sayed","Mansour","Gamal","Kamal","Reda","Lotfy","Zaki","Nabil","Taha"];
const rn = () => `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
const rp = () => `01${[1,2,5][Math.floor(Math.random()*3)]}${Math.floor(10000000+Math.random()*90000000)}`;

const DIST = [
  { id: "ST-PAID", n: 14 }, { id: "ST-UNPAID", n: 10 }, { id: "ST-EXCUSED", n: 7 },
  { id: "ST-ABSENT", n: 5 }, { id: "ST-CALL", n: 3 }, { id: "ST-EXPEL", n: 2 },
  { id: "ST-ACA-WARN", n: 2 }, { id: "ST-SUSPEND", n: 2 }, { id: "ST-CONFISCATE", n: 2 },
  { id: "ST-ONLINE", n: 2 },
];

const GROUPS = [
  { gradeId: "GR1", code: "T1", name: "ثلاثاء أوائل 9:00 ص",   time: "09:00", price: 50 },
  { gradeId: "GR1", code: "T2", name: "ثلاثاء أوائل 10:30 ص",  time: "10:30", price: 50 },
  { gradeId: "GR2", code: "T3", name: "ثلاثاء متوسط 12:00 م",  time: "12:00", price: 60 },
  { gradeId: "GR2", code: "T4", name: "ثلاثاء متوسط 1:30 م",   time: "13:30", price: 60 },
  { gradeId: "GR3", code: "T5", name: "ثلاثاء أعدادي 3:00 م",  time: "15:00", price: 70 },
  { gradeId: "GR3", code: "T6", name: "ثلاثاء أعدادي 4:30 م",  time: "16:30", price: 70 },
  { gradeId: "GR3", code: "T7", name: "ثلاثاء أعدادي 6:00 م",  time: "18:00", price: 70 },
];

const groups = [];
const students = [];
const attendance = [];
const payments = [];
const extraCharges = [];

for (const g of GROUPS) {
  const gid = uid("GRP");
  groups.push({ id: gid, code: g.code, gradeId: g.gradeId, name: g.name, days: ["الثلاثاء"], time: g.time, duration: 60, capacity: 55, sessionPrice: g.price });

  let si = 0;
  for (const d of DIST) {
    for (let i = 0; i < d.n; i++) {
      si++;
      const sid = uid("STU");
      const hasDiscount = Math.random() > 0.7;
      const discount = hasDiscount ? [5,10,15][Math.floor(Math.random()*3)] : 0;
      const wallet = Math.random() > 0.8 ? Math.floor(Math.random()*200)+20 : 0;
      const late = d.id === "ST-UNPAID" && Math.random() > 0.4 ? g.price * Math.floor(Math.random()*4+1) : 0;

      students.push({
        id: sid, code: `${g.code}${String(si).padStart(2,"0")}`, name: rn(),
        gradeId: g.gradeId, groupId: gid, phone: rp(), parentPhone: rp(),
        fatherJob: "", school: "", joinDate: "__TODAY__", status: "active",
        discount, lateBalance: late, walletBalance: wallet,
        locked: d.id === "ST-SUSPEND", lockReason: d.id === "ST-SUSPEND" ? "إيقاف مؤقت" : null,
        lockDate: d.id === "ST-SUSPEND" ? "__TODAY__" : null,
      });

      const isAction = ["ST-CALL","ST-EXPEL","ST-ACA-WARN","ST-SUSPEND","ST-CONFISCATE","ST-ONLINE"].includes(d.id);
      attendance.push({
        id: uid("ATT"), studentId: sid, date: "__TODAY__",
        time: isAction ? "-" : "10:00", statusId: d.id,
        category: isAction ? "action" : "attendance", note: "", termId: null, monthId: null,
      });

      if (d.id === "ST-PAID") {
        payments.push({
          id: uid("PAY"), studentId: sid, groupId: gid, attendanceId: uid("ATT"),
          date: "__TODAY__", sessionDate: "__TODAY__", amount: g.price - discount,
          walletUsed: 0, status: "paid", lateBalanceDelta: late > 0 ? -late : 0,
          note: "تست", termId: null, monthId: null,
        });
      }
      if (d.id === "ST-UNPAID") {
        payments.push({
          id: uid("PAY"), studentId: sid, groupId: gid, attendanceId: uid("ATT"),
          date: "__TODAY__", sessionDate: "__TODAY__", amount: g.price,
          walletUsed: 0, status: "unpaid", lateBalanceDelta: g.price,
          note: "تست", termId: null, monthId: null,
        });
      }
      if (Math.random() > 0.85 && ["ST-PAID","ST-UNPAID"].includes(d.id)) {
        extraCharges.push({
          id: uid("CHG"), batchId: uid("B"), studentId: sid,
          name: ["ملزمة امتحان","قلم رصاص","copie","رسوم نشاط"][Math.floor(Math.random()*4)],
          amount: [10,15,20,25,30][Math.floor(Math.random()*5)],
          date: "__TODAY__", status: Math.random() > 0.5 ? "paid" : "unpaid",
        });
      }
    }
  }
}

const result = { groups, students, attendance, payments, extraCharges };
process.stdout.write(JSON.stringify(result, null, 2));
