// المسارات الجميلة — مصدرٌ واحد لا نسخٌ متطابقة متفرّقة في كل صفحة.
//
// القاعدة تختلف بين نطاقٍ مخصّص (جذر) وصفحات الاستضافة الافتراضية (تحت
// اسم الريبو `/sndk.app/` على GitHub Pages تحديداً — Render يخدم من الجذر
// دائماً فلا يطابق هذا الشرط أصلاً).
function sndkBasePath() {
  const p = window.location.pathname;
  return (p.indexOf('/sndk.app/') === 0 || p === '/sndk.app') ? '/sndk.app' : '';
}

// تصل الزيارة هنا إمّا مباشرةً على الرابط الجميل (عبر تحويلة 404.html التي
// تُبقي الاستعلام كما هو)، أو مباشرةً على ملف .html (رابط قديم/مفهرَس). في
// الحالة الثانية فقط نُصلح شريط العنوان، بلا إعادة تحميل.
function sndkPrettifyUrl(prettyPath) {
  if (window.location.pathname.endsWith('.html')) {
    window.history.replaceState(null, '', sndkBasePath() + prettyPath + window.location.search + window.location.hash);
  }
}
