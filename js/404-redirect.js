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

  // نفس صيغة DeepLinkType.doctor في تطبيق فلاتر — معرّفٌ واحد.
  const doctorMatch = rest.match(/^\/doctor\/([a-zA-Z0-9-]+)\/?$/);
  if (doctorMatch) {
    window.location.replace(`${base}/doctor.html?id=${encodeURIComponent(doctorMatch[1])}&pretty=1`);
    return;
  }

  const facilitiesMatch = rest.match(/^\/facilities\/?$/);
  if (facilitiesMatch) {
    window.location.replace(`${base}/facilities.html`);
    return;
  }

  const doctorsMatch = rest.match(/^\/doctors\/?$/);
  if (doctorsMatch) {
    window.location.replace(`${base}/doctors.html`);
    return;
  }

  const specialtiesMatch = rest.match(/^\/specialties\/?$/);
  if (specialtiesMatch) {
    window.location.replace(`${base}/specialties.html`);
    return;
  }

  // معرّف واحد يكفي: get-clinic-schedules تدعم فلترة id مباشرة (أُصلحت في
  // نفس هذا الإصدار)، فلا حاجة إلى facility_id ثانٍ في الرابط — ويطابق هذا
  // بالحرف رابط المشاركة الذي يُنتجه تطبيق فلاتر (DeepLinkType.appointment).
  const apptMatch = rest.match(/^\/appointment\/([a-zA-Z0-9-]+)\/?$/);
  if (apptMatch) {
    window.location.replace(`${base}/appointment.html?schedule_id=${encodeURIComponent(apptMatch[1])}&pretty=1`);
    return;
  }

  const campsMatch = rest.match(/^\/camps\/?$/);
  if (campsMatch) {
    window.location.replace(`${base}/camps.html`);
    return;
  }

  window.location.replace(`${base}/`);
})();
