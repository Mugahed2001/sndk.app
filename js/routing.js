// المسارات الجميلة — مصدرٌ واحد لا نسخٌ متطابقة متفرّقة في كل صفحة.
//
// القاعدة تختلف بين نطاقٍ مخصّص (جذر) وصفحات الاستضافة الافتراضية (تحت
// اسم الريبو `/sndk.app/` على GitHub Pages تحديداً — Render يخدم من الجذر
// دائماً فلا يطابق هذا الشرط أصلاً).
function sndkBasePath() {
  const p = window.location.pathname;
  return (p.indexOf('/sndk.app/') === 0 || p === '/sndk.app') ? '/sndk.app' : '';
}
