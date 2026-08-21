// إعداد الاتصال بـ Supabase — نفس المشروع الذي يعمل عليه تطبيق سندك الطبي.
//
// المفتاح هنا "publishable" (عام) لا "secret": هو نفسه المضمَّن في حزمة
// التطبيق على متجر جوجل — أي مستخرَجٌ أصلاً بفكّ الحزمة، فوضعه هنا لا يفتح
// شيئاً لم يكن مفتوحاً. الحدود الحقيقية (من يحجز، من يرى ماذا) مفروضة في
// دوال الحافة نفسها (rate limiting, RLS, توثيق الهاتف) لا في سرّية هذا المفتاح.
window.SNDK_CONFIG = {
  SUPABASE_URL: 'https://zoveiphxwzckgzavvrlb.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_-Efj7R45PTsKYMsdLvAZcA_Xuck2nvZ',
  APP_VERSION: 'web-1.0',
};
