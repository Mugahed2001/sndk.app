// مساعد «سندك الطبي» — ذكاء اصطناعي حقيقي (Claude عبر Anthropic API) خلف
// دالة الحافة ai-assistant، لا محرّك مطابقة كلمات محلي بعد الآن. الواجهة
// هنا خفيفة عمداً: تعرض المحادثة وترسل كل رسالة للخادم — كل الفهم والبحث في
// بيانات الأطباء/المرافق يحدث هناك عبر أدوات (tools) تستدعي نفس دوال
// get-doctors/get-facilities/... العامة، لا هنا ولا من ذاكرة النموذج العامة
// (مفروض صراحة في system prompt الخادم — انظر تعليقه).
//
// حدود ما زالت قائمة رغم تغيير المحرّك:
// - لا بيانات دفع تمرّ من هنا إطلاقاً (نفس القاعدة السابقة، مفروضة في
//   system prompt الخادم أيضاً لا هنا فقط).
// - حدّ يومي لكل جهاز/IP على الخادم — قد يصل الزائر لرسالة "تجاوزت الحدّ".
// - مهلة صريحة ٢٥ ثانية على الطلب (ردّ نموذج حقيقي أبطأ من استعلام عادي) —
//   إنترنت ضعيف جداً يحصل على رسالة واضحة بدل تعليق صامت.
//
// esc/sndkOpenModal/sndkCloseModal/SNDK_ICONS من common.js.

const SndkAssistant = (() => {
  const ANON_ID_KEY = 'sndk_ai_anon_id';
  const REQUEST_TIMEOUT_MS = 25000;
  const MAX_HISTORY = 12;

  let messages = []; // {role:'user'|'bot', html, typing?}
  let apiHistory = []; // {role:'user'|'assistant', content} — نصّ خام يُرسَل للخادم
  let panelEl = null;
  let sending = false;

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
  }

  function getAnonId() {
    try {
      let id = localStorage.getItem(ANON_ID_KEY);
      if (!id) { id = uuid(); localStorage.setItem(ANON_ID_KEY, id); }
      return id;
    } catch (_) {
      return uuid(); // تخزين محجوب — جلسة بلا استمرارية أفضل من تعطيل المساعد كله
    }
  }

  function withTimeout(promise) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), REQUEST_TIMEOUT_MS)),
    ]);
  }

  // يحوّل روابط https:// أو مسارات الموقع الجميلة (/facility/<id> إلخ) داخل
  // ردّ مُهرَّب أصلاً (esc) إلى وصلات قابلة للنقر — بأمان: التهريب يسبق هذا
  // دائماً، فلا نصّ خام غير مُهرَّب يدخل innerHTML مهما كتب النموذج.
  function linkify(escapedText) {
    return escapedText
      .replace(/(https:\/\/snadk\.codeysaa\.com[^\s<]*)/g, '<a href="$1" style="color:var(--primary);font-weight:600;">$1</a>')
      .replace(/(?<!href="|>)(\/(?:facility|doctor|camp|appointment)\/[a-zA-Z0-9-]+)/g, `<a href="${sndkBasePath()}$1" style="color:var(--primary);font-weight:600;">$1</a>`);
  }

  function bubble(role, innerHtml) {
    return `<div class="asst-bubble asst-bubble-${role}">${innerHtml}</div>`;
  }

  function renderMessages() {
    if (!panelEl) return;
    const body = panelEl.querySelector('#asstBody');
    body.innerHTML = messages.map((m) => bubble(m.role, m.html)).join('');
    body.scrollTop = body.scrollHeight;
  }

  function pushBot(html) { messages.push({ role: 'bot', html }); renderMessages(); }
  function pushUser(text) { messages.push({ role: 'user', html: esc(text) }); renderMessages(); }
  function pushTyping() { messages.push({ role: 'bot', html: '<span class="asst-typing"><span></span><span></span><span></span></span>', typing: true }); renderMessages(); }
  function popTyping() { if (messages.length && messages[messages.length - 1].typing) messages.pop(); }

  async function submit(text) {
    const trimmed = (text || '').trim();
    if (!trimmed || sending) return;
    sending = true;
    pushUser(trimmed);
    apiHistory.push({ role: 'user', content: trimmed });
    pushTyping();

    try {
      const base = window.SNDK_CONFIG.SUPABASE_URL.replace(/\/+$/, '');
      const res = await withTimeout(fetch(`${base}/functions/v1/ai-assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: window.SNDK_CONFIG.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${window.SNDK_CONFIG.SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ anon_id: getAnonId(), messages: apiHistory.slice(-MAX_HISTORY) }),
      }));
      const decoded = await res.json().catch(() => null);
      popTyping();

      if (!decoded || decoded.success !== true) {
        apiHistory.pop(); // لا نُبقي سؤالاً بلا ردّ في السياق المُرسَل لاحقاً
        const code = decoded && decoded.code;
        if (code === 'RATE_LIMITED') {
          pushBot('وصلت الحدّ الأقصى للأسئلة اليوم — جرّب مرة أخرى غداً، أو تصفّح الموقع مباشرة.');
        } else if (code === 'AI_UNCONFIGURED') {
          pushBot('المساعد غير مُفعَّل بعد على هذا الموقع — جرّب لاحقاً.');
        } else {
          pushBot('تعذّر تنفيذ طلبك حالياً. حاول مرة أخرى بعد قليل.');
        }
        return;
      }

      const reply = (decoded.data && decoded.data.reply) || 'تعذّر توليد ردّ الآن، حاول مرة أخرى.';
      pushBot(linkify(esc(reply)).replace(/\n/g, '<br>'));
      apiHistory.push({ role: 'assistant', content: reply });
    } catch (err) {
      popTyping();
      apiHistory.pop();
      const offline = err && err.message === 'TIMEOUT';
      pushBot(offline
        ? 'يبدو أن الاتصال ضعيف جداً الآن — حاول مرة أخرى بعد قليل.'
        : 'تعذّر تنفيذ طلبك حالياً. حاول مرة أخرى بعد قليل.');
    } finally {
      sending = false;
    }
  }

  // نفس الورقة السفلية المشتركة (sndkOpenModal/sndkCloseModal في common.js)
  // التي تستعملها القائمة الجانبية ومودال الدخول — عنصرٌ واحدٌ مفتوحٌ في كل
  // لحظة على مستوى الموقع كله.
  function open() {
    panelEl = sndkOpenModal(`
      <div class="asst-panel">
        <div class="row gap-8" style="align-items:center;">
          ${SNDK_ICONS.chat(20)}
          <div style="font-weight:700;">مساعد سندك الطبي</div>
        </div>
        <div class="text-muted mt-8" style="font-size:12px;">
          مدعوم بذكاء اصطناعي — اسألني عن طبيب أو مستشفى أو مخيم طبي. لا أطلب أو أحفظ أي بيانات دفع.
        </div>
        <div id="asstBody" class="asst-body mt-16"></div>
        <div class="row gap-8 mt-12">
          <input class="field" id="asstInput" style="margin:0;" placeholder="اكتب سؤالك…">
          <button class="btn btn-filled" id="asstSendBtn">إرسال</button>
        </div>
      </div>
    `);

    if (messages.length === 0) {
      pushBot('أهلاً بك في سندك الطبي! اسألني عن طبيب أو مستشفى أو مخيم طبي، أو أي سؤال عن حجز موعد.');
    } else {
      renderMessages();
    }

    const input = panelEl.querySelector('#asstInput');
    const run = () => {
      const v = input.value.trim();
      if (!v) return;
      input.value = '';
      submit(v);
    };
    panelEl.querySelector('#asstSendBtn').addEventListener('click', run);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
    input.focus();
  }

  function close() {
    sndkCloseModal();
    panelEl = null;
  }

  // زرّ الفتح العائم يملكه js/assistant-loader.js (يحمّل هذا الملف عند أول
  // ضغطة عليه بدل تحميله دائماً) — لا مِثله هنا.

  return { open, close };
})();
