// زرّ المساعد ثابت وخفيف على كل صفحة (بضع مئات بايت لا أكثر) — لا يُحمَّل
// js/assistant.js (أكبر ملف على الموقع، ~٤٠ك.ب) إلا عند أول ضغطة فعلية على
// الزرّ أو بطاقة الوصول السريع في الرئيسية، لا عند تحميل الصفحة نفسها. على
// إنترنت ضعيف جداً هذا فرقٌ حقيقي: صفر تكلفة شبكة/تفسير إضافية لزائرٍ لم
// يفتح المحادثة أصلاً — وهو الغالبية.
//
// SNDK_ICONS من common.js.

const SndkAssistantLoader = (() => {
  // نفس رقم الإصدار (`?v=N`) المكتوب على وسم <script> لهذا الملف نفسه —
  // مقروء منه مباشرة بدل تكراره هنا يدوياً، فلا يُنسى تحديثه في مكانين عند
  // كل نشرة تُغيّر js/assistant.js.
  const VERSION_QUERY = (document.currentScript && document.currentScript.src.split('?')[1]) || '';

  let loadPromise = null;

  function ensureAssistantLoaded() {
    // لا "window.SndkAssistant": هذا متغيّر top-level بـconst في assistant.js
    // — لا يصير خاصّية على window كما var/function (سلوك JS قياسي)، فالفحص
    // بـwindow. كان دائماً false حتى بعد نجاح التحميل، فيرمي `.open()`
    // التالي خطأً يُبتلَع صامتاً في catch — هذا سبب "لا خطأ في الكونسول
    // لكن المساعد لم يظهر" بالحرف.
    if (typeof SndkAssistant !== 'undefined') return Promise.resolve();
    if (loadPromise) return loadPromise;
    loadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      // مسار مطلق لا نسبي — عمداً: بعد sndkPrettifyUrl() قد يصبح شريط
      // العنوان "/facility/<uuid>" (مقطعان بلا .html)، فيحلّ المتصفح مساراً
      // نسبياً كـ"js/assistant.js" أسفل "/facility/" لا أسفل الجذر —
      // "js/facility/js/assistant.js" (404). نفس الحيلة المستعملة أصلاً في
      // 404.html (`/js/routing.js`) وكل روابط sndkBasePath() في الموقع.
      script.src = `${sndkBasePath()}/js/assistant.js${VERSION_QUERY ? `?${VERSION_QUERY}` : ''}`;
      script.onload = () => resolve();
      script.onerror = () => { loadPromise = null; reject(new Error('تعذّر تحميل المساعد')); };
      document.body.appendChild(script);
    });
    return loadPromise;
  }

  async function open() {
    const btn = document.getElementById('asstTriggerBtn');
    const original = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner" style="border-color:rgba(255,255,255,.4);border-top-color:#fff;width:18px;height:18px;"></div>'; }
    try {
      await ensureAssistantLoaded();
      SndkAssistant.open();
    } catch (_) {
      alert('تعذّر تحميل المساعد — تحقّق من الاتصال وحاول مجدداً.');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = original; }
    }
  }

  function mountTrigger() {
    if (document.getElementById('asstTriggerBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'asstTriggerBtn';
    btn.className = 'asst-trigger';
    btn.title = 'مساعد سندك الطبي';
    btn.innerHTML = SNDK_ICONS.chat(22, '#fff');
    btn.addEventListener('click', open);
    document.body.appendChild(btn);
  }

  mountTrigger();

  return { open };
})();
