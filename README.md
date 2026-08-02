# نظام إدارة السنتر التعليمي — MVP

نظام إدارة كامل (Frontend فقط) مبنى بـ HTML/CSS/JavaScript (Vanilla) بدون أى Frameworks، جاهز للرفع مباشرة على **Cloudflare Pages**.

## التشغيل محليًا

المشروع يستخدم `fetch()` لتحميل بيانات Mock، لذلك **لا يعمل بفتح الملف مباشرة (`file://`)** — يجب تشغيله عبر خادم محلى بسيط:

```bash
# داخل مجلد المشروع
python3 -m http.server 8080
# ثم افتح المتصفح على:
http://localhost:8080
```

أو باستخدام إضافة **Live Server** فى VS Code.

## بيانات الدخول التجريبية

- اسم المستخدم: `admin`
- كلمة المرور: `1234`

## الرفع على Cloudflare Pages

1. ارفع المجلد كاملًا إلى مستودع GitHub.
2. من Cloudflare Pages: New Project → Connect to Git.
3. Build command: (اتركه فارغًا)
4. Build output directory: `/` (جذر المشروع)
5. Deploy 🚀

## هيكل المشروع

المشروع مقسم لـ **4 مناطق** (كل منطقة بتكبر لوحدها)، مع أصول مشتركة ثابتة في الجذر:

```
/                    نقطة الدخول + الصفحات المشتركة
  index.html           توجيه تلقائي حسب الدور (موظف / ولي أمر / طالب)
  login.html           تسجيل الدخول المشترك
  404.html             صفحة الخطأ
  assets/              الأصول المشتركة (ثابتة في الجذر)
    css/style.css        Design System موحد لكل الصفحات
    js/                  وحدات ES6: storage, ui, icons, helpers, app, ...
    mock/*.json          بيانات تجريبية (تُنسخ تلقائيًا إلى LocalStorage)
                         — تشمل subjects/topics/questions/examAnswers لمنهج الطالب

/staff/              منطقة المتابعة والإدارة (داخل السنتر)
  dashboard.html         الرئيسية (إحصائيات عامة)
  quick-attendance.html  حضور الطلاب (سريع)
  session.html           إدارة الحصة
  visit.html             لوحة ولي الأمر (داخل السنتر)
  students.html          إدارة الطلاب
  student.html           تفاصيل طالب (?id=STU-xxxx)
  student-form.html      إضافة/تعديل طالب
  group-students.html    طلاب مجموعة
  followup.html          متابعة أداء الطلاب
  teacher-insights.html  لوحة المعلم
  exams.html             الامتحانات ودرجاتها
  finance.html           اليومية المالية
  shift.html             الصندوق (تقفيل الوردية)
  rollover.html          ترحيل الطلاب
  settings.html          إعدادات السنتر
  attendance-tracker.html متابعة الحضور والغياب

/parent/             منطقة ولي الأمر — بوابة العائلة (Family Portal، عرض فقط)
  index.html           فحص الدقيقة الواحدة (نظرة عامة) + الخط الزمني + ملف الطالب +
                      الحضور + المالية (عرض) + الدرجات والترتيب + المتابعة + التواصل
                      (parent-portal.js + parent.css)

/site/               منطقة الويب سايت (المنصة العامة + نقطة الدخول)
  index.html           الصفحة التسويقية + أزرار الدخول للجميع (تظهر حسب إعدادات البوابات)

/student/            منطقة منصة الطالب — مركز قيادة الطالب (Student Command Center)
  index.html           نظام تشغيل مصغر: مركز تعلم يومي، منهج (مواد ← مواضيع ← أسئلة MCQ للتدريب)،
                      مركز أخطاء، إحصاءات تقدم، تقويم، محفوظات، إشعارات (student-portal.js)

/scripts/tests/      أدوات واختبارات (test-scenarios, test-output, inject-test-data)
```

للرؤية الكاملة للمشروع و خطة النمو على المدى البعيد: شوف **`ARCHITECTURE.md`**.


## كيف تعمل البيانات؟

- عند أول فتح للمشروع، يتم نسخ بيانات `assets/mock/*.json` إلى `localStorage`.
- كل التعديلات (إضافة/تعديل/حذف/تسجيل حضور/دفع...) تُحفظ فى `localStorage` مباشرة.
- من صفحة **الإعدادات** يمكنك إعادة ضبط النظام بالكامل والعودة للبيانات التجريبية الأصلية.

## التخصيص السريع

- الألوان والخطوط: فى أعلى `assets/css/style.css` داخل `:root`.
- اسم السنتر: من صفحة الإعدادات، أو مباشرة فى `assets/mock/settings.json`.
- إضافة مستخدمين جدد لتسجيل الدخول: عدّل مصفوفة `users` فى `assets/mock/settings.json`.
