// تتبّع سلوك الزائر على الموقع — يغذّي **نفس** تبويب «الظهور» الذي يقرأه
// مدير المرفق في تطبيق فلاتر: نفس دالة الحافة (track-events)، نفس القاعدة
// (public.facility_events)، نفس التجميع. قبل هذا الملف كانت كل حركة الموقع
// غائبة عن تلك اللوحة تماماً — لا لأنها لم تُرسَل، بل لأن مصدر الدخول 'web'
// لم يكن ضمن القائمة البيضاء (analytics_source_allowed) في القاعدة أصلاً؛
// انظر migration 20260914000002 في مستودع snd_health.
//
// كل حدث من هنا يحمل entry_source: 'web' ثابتاً — تمييز حركة الموقع عن
// التطبيق فقط، لا تفكيك مصادر الدخول الداخلية للموقع (رئيسية/بحث/...)
// كما يفعل التطبيق؛ ليس مطلوباً بعد.
//
// ثلاث قواعد صارمة — نفس قواعد AnalyticsService في التطبيق بالحرف:
// 1) track() لا تُعيد Promise يُنتظَر ولا ترمي أبداً — عطلٌ هنا لا يجوز أن
//    يكسر أي صفحة.
// 2) لا مسار اتصال/واتساب/حجز ينتظر إرسال حدث — الفعل أولاً، التسجيل ثانياً.
// 3) لا تتبّع من localhost أو ملف محلي — حركة اختبار لا تدخل أرقام مرفق حقيقي.
//
// esc غير مُستعمَل هنا عمداً — كل قيمة مُرسَلة معرّفات UUID أو أرقام، لا نصّ
// حرّ يدخل DOM.

const SndkTrack = (() => {
  const ENDPOINT = 'track-events';
  const ANON_ID_KEY = 'sndk_analytics_anon_id';
  const SESSION_KEY = 'sndk_analytics_session';
  const FLUSH_THRESHOLD = 20; // نفس عتبة التطبيق (AnalyticsService._flushThreshold)
  const MAX_BATCH = 50; // سقف الخادم في دالة track-events (MAX_EVENTS)
  const FLUSH_INTERVAL_MS = 30000;
  const SESSION_IDLE_MS = 30 * 60 * 1000;

  const isLocalDev = window.location.protocol === 'file:'
    || ['localhost', '127.0.0.1', ''].includes(window.location.hostname);

  let queue = [];
  let flushTimer = null;
  let flushing = false;

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    // احتياط لمتصفح بلا crypto.randomUUID — المعرّف هنا لمنع العدّ المكرَّر
    // عند إعادة إرسال دُفعة فُقد ردّها، لا لأي غرض أمني.
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
  }

  function getAnonId() {
    try {
      let id = localStorage.getItem(ANON_ID_KEY);
      if (!id) {
        id = uuid();
        localStorage.setItem(ANON_ID_KEY, id);
      }
      return id;
    } catch (_) {
      return uuid(); // تخزين محجوب — جلسة بلا استمرارية أفضل من تعطيل التتبّع كله
    }
  }

  function getSessionId() {
    const now = Date.now();
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.id && now - (parsed.lastActivity || 0) < SESSION_IDLE_MS) {
          parsed.lastActivity = now;
          localStorage.setItem(SESSION_KEY, JSON.stringify(parsed));
          return parsed.id;
        }
      }
    } catch (_) { /* يبدأ جلسة جديدة أدناه */ }
    const id = uuid();
    try { localStorage.setItem(SESSION_KEY, JSON.stringify({ id, lastActivity: now })); } catch (_) { /* تعمل بلا استمرار */ }
    return id;
  }

  function currentActorUserId() {
    try {
      return (typeof SndkAuth !== 'undefined' && SndkAuth.currentUserId) ? SndkAuth.currentUserId() : null;
    } catch (_) {
      return null;
    }
  }

  /// event: اسم من AnalyticsEvents في lib/models/analytics_event.dart (نفس
  /// السلاسل الحرفية — القائمة البيضاء في القاعدة واحدة للتطبيق والموقع).
  function track(event, { facilityId, doctorId, specialtyId, subFacilityId, scheduleId, props } = {}) {
    if (isLocalDev || !event || !facilityId) return;
    try {
      queue.push({
        event_id: uuid(),
        event,
        occurred_at: new Date().toISOString(),
        facility_id: facilityId,
        entry_source: 'web',
        doctor_id: doctorId || undefined,
        specialty_id: specialtyId || undefined,
        sub_facility_id: subFacilityId || undefined,
        schedule_id: scheduleId || undefined,
        props: props || undefined,
        // مفتاحٌ حاضر دائماً ولو بقيمة null — يميّز «زائر بلا حساب» عن دُفعةٍ
        // من نسخة أقدم لا تسم شيئاً. انظر migration self_traffic_per_event.
        actor_user_id: currentActorUserId(),
      });
    } catch (_) { return; }

    if (queue.length >= FLUSH_THRESHOLD) flush();
    else scheduleFlush();
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => { flushTimer = null; flush(); }, FLUSH_INTERVAL_MS);
  }

  async function flush(keepalive) {
    if (flushing || queue.length === 0) return;
    flushing = true;
    const batch = queue.splice(0, MAX_BATCH);
    try {
      const base = window.SNDK_CONFIG.SUPABASE_URL.replace(/\/+$/, '');
      const accessToken = (typeof SndkAuth !== 'undefined' && SndkAuth.currentAccessTokenSync) ? SndkAuth.currentAccessTokenSync() : null;
      await fetch(`${base}/functions/v1/${ENDPOINT}`, {
        method: 'POST',
        keepalive: !!keepalive, // يسمح للطلب بالنجاة من إغلاق الصفحة (pagehide) — حمولة صغيرة فقط
        headers: {
          'Content-Type': 'application/json',
          apikey: window.SNDK_CONFIG.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken || window.SNDK_CONFIG.SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          anon_id: getAnonId(),
          session_id: getSessionId(),
          app_version: window.SNDK_CONFIG.APP_VERSION || 'web',
          events: batch,
        }),
      });
    } catch (_) {
      // فشل الإرسال لا يُعاد للطابور — القياس لا يجوز أن يعقّد تجربة الزائر
      // بمحاولات إعادة إرسال موثوقة داخل صفحة قد تُغلَق أي لحظة. نفس مبدأ
      // «202 دائماً» في الخادم: خسارة عدد قليل من الأحداث أرخص من محرّك طابور.
    } finally {
      flushing = false;
      if (queue.length > 0) scheduleFlush();
    }
  }

  // مغادرة الصفحة (تنقّل، إغلاق تبويب، تصغير على الجوال) — آخر فرصة لإرسال
  // ما تجمَّع؛ بلا هذا يبقى في الذاكرة ويضيع مع الصفحة.
  window.addEventListener('pagehide', () => flush(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true);
  });

  return { track };
})();
