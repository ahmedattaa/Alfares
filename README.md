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

```
/index.html          نقطة الدخول (تحويل تلقائى لتسجيل الدخول أو الرئيسية)
/login.html           تسجيل الدخول
/dashboard.html        الرئيسية (إحصائيات عامة)
/reception.html        استقبال الطلاب (تسجيل حضور/غياب سريع)
/students.html         إدارة الطلاب (بحث/فلترة/إضافة/تعديل/حذف)
/student.html          تفاصيل طالب معين (?id=STU-xxxx)
/followup.html         متابعة أداء الطلاب
/exams.html            الامتحانات ودرجاتها
/finance.html          اليومية المالية
/settings.html         إعدادات السنتر
/404.html              صفحة الخطأ

/assets/css/style.css   Design System موحد لكل الصفحات
/assets/js/             ملفات JS مقسمة (وحدات ES6): storage, ui, icons, helpers, app
                        + ملف منطق خاص بكل صفحة
/assets/mock/*.json     بيانات تجريبية (تُنسخ تلقائيًا إلى LocalStorage عند أول تشغيل)
```

## كيف تعمل البيانات؟

- عند أول فتح للمشروع، يتم نسخ بيانات `assets/mock/*.json` إلى `localStorage`.
- كل التعديلات (إضافة/تعديل/حذف/تسجيل حضور/دفع...) تُحفظ فى `localStorage` مباشرة.
- من صفحة **الإعدادات** يمكنك إعادة ضبط النظام بالكامل والعودة للبيانات التجريبية الأصلية.

## التخصيص السريع

- الألوان والخطوط: فى أعلى `assets/css/style.css` داخل `:root`.
- اسم السنتر: من صفحة الإعدادات، أو مباشرة فى `assets/mock/settings.json`.
- إضافة مستخدمين جدد لتسجيل الدخول: عدّل مصفوفة `users` فى `assets/mock/settings.json`.
