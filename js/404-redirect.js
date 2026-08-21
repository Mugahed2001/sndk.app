// يُستدعى من 404.html وحده. الاستضافة ساكنة بحتة — لا توجيه خادم لمسارٍ
// مثل `/facility/<uuid>`، فأي مسارٍ غير موجود يصل هنا، ونحوّله فوراً إلى
// الصفحة الحقيقية بمعاملات استعلام؛ تلك الصفحة تُعيد المسار الجميل إلى
// شريط العنوان بـ`history.replaceState` بعد أن تقرأ المعاملات — فيرى
// المستخدم النهائي الرابط الجميل كما كان، بقفزة واحدة غير محسوسة.
//
// ملفٌ منفصل عن routing.js عمداً: يُنفَّذ فور تحميله بلا سكربتٍ داخلي في
// 404.html — فتبقى ترويسة `script-src 'self'` صارمة بلا استثناء.
(function () {
  const path = window.location.pathname;
  const base = sndkBasePath();
  const rest = path.slice(base.length);

  const facilityMatch = rest.match(/^\/facility\/([a-zA-Z0-9-]+)\/?$/);
  if (facilityMatch) {
    window.location.replace(`${base}/facility.html?id=${encodeURIComponent(facilityMatch[1])}&pretty=1`);
    return;
  }

  const campMatch = rest.match(/^\/camp\/([a-zA-Z0-9-]+)\/?$/);
  if (campMatch) {
    window.location.replace(`${base}/camp.html?id=${encodeURIComponent(campMatch[1])}&pretty=1`);
    return;
  }

  const apptMatch = rest.match(/^\/appointment\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9-]+)\/?$/);
  if (apptMatch) {
    window.location.replace(
      `${base}/appointment.html?facility_id=${encodeURIComponent(apptMatch[1])}` +
      `&schedule_id=${encodeURIComponent(apptMatch[2])}&pretty=1`,
    );
    return;
  }

  const campsMatch = rest.match(/^\/camps\/?$/);
  if (campsMatch) {
    window.location.replace(`${base}/camps.html`);
    return;
  }

  window.location.replace(`${base}/`);
})();
