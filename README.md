# منصة چيهان البراوي

نسخة نهائية جاهزة للرفع على Netlify. لا تحتوي على بيانات تجريبية، وتعمل بعد ربط Supabase وتشغيل الجداول.

## التشغيل المحلي

لا تفتح الموقع من `file://` عند اختبار الفيديوهات، لأن YouTube قد يرفض التشغيل داخل iframe.

شغل السيرفر المحلي:

```bash
node local-server.js
```

ثم افتح:

```text
http://127.0.0.1:4173
```

## الرفع على Netlify

ارفع محتويات المجلد كما هي. ملف `netlify.toml` مضبوط على:

```toml
publish = "."
```

## إعداد Supabase

1. أنشئ مشروع Supabase.
2. افتح SQL Editor وشغل الملف:

```text
supabase/schema.sql
```

الملف ينشئ الجداول وStorage bucket باسم `course-assets` لصور الكورسات والأقسام والفيديوهات وملفات PDF.

3. افتح `config.js` وضع بيانات مشروعك:

```js
window.APP_CONFIG = {
  supabaseUrl: "YOUR_SUPABASE_URL",
  supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY",
  whatsappNumber: "201000000000"
};
```

## حساب المدرس الأدمن

الإعداد الافتراضي في SQL:

```text
Email: teacher@emad-hamdy.com
Password: Emad@123456
```

من Supabase Dashboard افتح Authentication ثم Users وأنشئ مستخدم جديد بنفس الإيميل والباسورد أعلاه. عند تسجيل الدخول من الموقع سيظهر وضع المدرس تلقائيًا.

يمكن تغيير الإيميل والباسورد الافتراضيين من SQL:

```sql
update public.app_settings
set value = 'new-teacher@email.com'
where key = 'initial_admin_email';

update public.app_settings
set value = 'NewPassword123'
where key = 'initial_admin_password';
```

## ملاحظات مهمة

- الباسورد يظهر للمدرس فقط في صفحة إدارة الطلاب من قيمة `login_password`.
- Supabase Auth لا يسمح باسترجاع كلمة السر الأصلية بعد تشفيرها، لذلك المنصة تحفظ نسخة في `profiles.login_password` عند تسجيل الطالب.
- أدوات الإدارة تظهر للمدرس داخل نفس الموقع: الكورسات، الأقسام، الفيديوهات، الطلاب، المنشورات، والدعم.
- فيديوهات YouTube تعمل داخل الموقع عند التشغيل من `http://localhost` أو بعد الرفع على Netlify، وليس من `file://`.
- الصور والملفات تترفع على Supabase Storage بدل تخزينها داخل الجداول، وهذا يجعل الموقع أسرع.
