// مساعد «سندك الطبي» — ذكاء اصطناعي حقيقي (Gemini خلف دالة الحافة
// ai-assistant) مع تحوّل تلقائي **صامت** إلى بحث محلي حتمي (fallbackSearch
// أدناه) كلما تعذّر النموذج (رصيد/حصّة منتهية، حدّ يومي، عطل مؤقت، أو
// انقطاع اتصال) — الزائر لا يرى أبداً رسالة "تعذّر الوصول للمساعد" أو ما
// شابهها؛ التحوّل يبدو استمراراً طبيعياً للمحادثة لا إعلان فشل. الفرق الوحيد
// المرئي: بحث محلي يعتمد على مطابقة كلمات مباشرة (لا فهم لغة حرّ)، فرداً قد
// يكون أقل تفصيلاً من ردّ Gemini، لكنه لا يتوقّف أبداً.
//
// حدود ما زالت قائمة بصرف النظر عن أي المحرّكين أجاب:
// - لا بيانات دفع تمرّ من هنا إطلاقاً (مفروضة في system prompt الخادم أيضاً
//   لا هنا فقط، ومحرّك البحث المحلي لا يطلب بيانات دفع أصلاً بالتصميم).
// - مهلة صريحة ٢٥ ثانية على طلب Gemini قبل التحوّل للبحث المحلي — إنترنت
//   ضعيف جداً يحصل على ردّ مفيد سريعاً بدل تعليق صامت.
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

  // Markdown خفيف مقصود لردّ النموذج فقط — رابطان بصيغة [اسم](رابط) وجداول
  // (رأس + |---| + صفوف)، لا أكثر. لا يحلّل أي Markdown آخر (عناوين، تعداد
  // نقطي...) عمداً؛ ليست حاجة النموذج هنا، وأي محلِّل أعمّ خطر تعقيد بلا
  // فائدة. التهريب (esc) يسبق أي إدراج نصّ خام دائماً — لا استثناء.

  // [الاسم](https://snadk.codeysaa.com/doctor|facility|camp/<id>) فقط — نطاق
  // ومسارات الموقع الحقيقية حصراً (مطابق تماماً لما يفرضه system prompt
  // الخادم)، لا أي رابط آخر قد يكتبه النموذج بالخطأ. الاسم وحده يظهر
  // ويُنقَر، لا الرابط الخام أبداً — هذا ما طُلب صراحة.
  const MD_LINK_RE = /\[([^\]]+)\]\(https:\/\/snadk\.codeysaa\.com\/(doctor|facility|camp)\/([a-zA-Z0-9-]+)\)/g;

  function renderInline(rawText) {
    // التهريب مرّة واحدة هنا على النصّ كاملاً قبل المطابقة — label بعد هذا
    // مُهرَّب بالفعل، فلا يُعاد تهريبه في رد الاستبدال (تهريب مزدوج يكسر أي
    // اسم فيه & أو علامة اقتباس: "&amp;" تصير "&amp;amp;" ظاهرة حرفياً).
    return esc(rawText).replace(MD_LINK_RE, (_m, label, kind, id) =>
      `<a href="${sndkBasePath()}/${kind}/${encodeURIComponent(id)}" style="color:var(--primary);font-weight:600;">${label}</a>`);
  }

  function isTableRow(line) {
    return /^\s*\|.*\|\s*$/.test(line);
  }
  function isSeparatorRow(line) {
    return isTableRow(line) && /^[\s|:-]+$/.test(line) && line.includes('-');
  }
  function splitTableRow(line) {
    return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  }

  function renderMarkdownLite(text) {
    const lines = (text || '').split('\n');
    let html = '';
    let i = 0;
    while (i < lines.length) {
      if (isTableRow(lines[i]) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
        const header = splitTableRow(lines[i]);
        i += 2;
        const rows = [];
        while (i < lines.length && isTableRow(lines[i])) { rows.push(splitTableRow(lines[i])); i++; }
        const thCell = (c) => `<th style="padding:6px 10px;border-bottom:2px solid var(--border);text-align:start;font-size:12.5px;">${renderInline(c)}</th>`;
        const tdCell = (c) => `<td style="padding:6px 10px;border-bottom:1px solid var(--border);font-size:12.5px;">${renderInline(c)}</td>`;
        html += `<div style="overflow-x:auto;margin:8px 0;"><table style="border-collapse:collapse;width:100%;">`
          + `<tr>${header.map(thCell).join('')}</tr>`
          + rows.map((r) => `<tr>${r.map(tdCell).join('')}</tr>`).join('')
          + `</table></div>`;
      } else {
        html += renderInline(lines[i]) + (i < lines.length - 1 ? '<br>' : '');
        i++;
      }
    }
    return html;
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

  function linkBtn(href, label) {
    return `<a class="btn btn-sm btn-outline" href="${esc(href)}">${esc(label)}</a>`;
  }
  function actionsRow(html) {
    return `<div class="row wrap gap-8 mt-8">${html}</div>`;
  }

  // بحث مبسّط بلا أي ذكاء اصطناعي — يعمل دائماً بلا تكلفة API، ويُستعمَل
  // بديلاً كلما تعذّر الوصول للمساعد الذكي (رصيد منتهٍ، حدّ يومي، أو عطل
  // مؤقت) بدل توقّف المساعد عن أي فائدة. يغطّي نفس الفئات الأربع التي كان
  // المحرّك الحتمي القديم يغطّيها: مستشفى/طبيب/تخصص/موعد — لا بحث نصّي عام
  // فقط.
  function normalizeSimple(t) {
    return (t || '')
      .replace(/[ً-ٰ]/g, '')
      .replace(/[إأآا]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .toLowerCase()
      .trim();
  }

  const FALLBACK_CAMP_WORDS = ['مخيم', 'مخيمات'];
  const FALLBACK_BOOKING_WORDS = ['موعد', 'مواعيد', 'حجز', 'احجز'];

  let fallbackSpecialtiesCache = null;
  async function loadFallbackSpecialties() {
    if (fallbackSpecialtiesCache) return fallbackSpecialtiesCache;
    try {
      const rows = await withTimeout(SndkApi.getData('get-specialties', { query: { limit: 200 } }));
      fallbackSpecialtiesCache = Array.isArray(rows) ? rows : [];
    } catch (_) {
      fallbackSpecialtiesCache = [];
    }
    return fallbackSpecialtiesCache;
  }

  // فقرة واحدة عن طبيب — بكل ما هو متوفّر فعلاً من بيانات، لا اسم مجرّد:
  // التخصص، التقييم، وسيلة تواصل غير مباشرة عبر صفحته (لا رقم مباشر للطبيب
  // نفسه في هذا الجدول).
  function describeDoctorParagraph(d, specialtiesById) {
    const sp = specialtiesById[d.specialty_id];
    const spName = sp ? (sp.arabic_name || sp.name) : '';
    const ratingText = d.rating > 0 ? `تقييمه ${esc(String(d.rating))} من ${esc(String(d.reviews_count || 0))} تقييم` : 'بلا تقييمات بعد';
    return `${esc(d.name)}${spName ? ` — أخصائي ${esc(spName)}` : ''}. ${ratingText}. لعرض مواعيده والحجز افتح صفحته.`;
  }

  // فقرة واحدة عن مرفق — النوع والموقع ووسائل التواصل الحقيقية وحالة الحجز
  // الإلكتروني الفعلية (لا افتراض أنه متاح لمجرّد وجود مرفق).
  function describeFacilityParagraph(f, bookingIds) {
    const type = f.type ? (FACILITY_TYPE_LABELS[f.type] || f.type) : '';
    const location = [f.city, f.governorate].filter(Boolean).join('، ');
    const phones = f.phones && f.phones.length ? f.phones : (f.phone ? [f.phone] : []);
    const whatsapps = f.whatsapps && f.whatsapps.length ? f.whatsapps : (f.whatsapp ? [f.whatsapp] : []);
    const contactParts = [];
    if (phones[0]) contactParts.push(`هاتف ${esc(phones[0])}`);
    if (whatsapps[0]) contactParts.push(`واتساب ${esc(whatsapps[0])}`);
    const bookingText = bookingIds && bookingIds.has(f.id)
      ? 'الحجز الإلكتروني متاح لهذا المرفق عبر الموقع.'
      : 'الحجز الإلكتروني غير مفعَّل لهذا المرفق حالياً — تواصل مباشرة.';
    return `${esc(f.name)}${type ? ` — ${esc(type)}` : ''}${location ? ` في ${esc(location)}` : ''}.`
      + (contactParts.length ? ` للتواصل: ${contactParts.join('، ')}.` : ' لا وسيلة تواصل مباشرة مسجَّلة.')
      + ` ${bookingText}`;
  }

  async function fallbackSearch(text) {
    const raw = text.trim().slice(0, 80);
    const n = normalizeSimple(raw);
    if (!n) return 'جرّب كتابة اسم طبيب أو مستشفى أو تخصص تبحث عنه.';

    // مخيمات طبية
    if (FALLBACK_CAMP_WORDS.some((w) => n.includes(w))) {
      let camps = [];
      try {
        const rows = await withTimeout(SndkApi.getData('get-camps', { query: { scope: 'active' } }));
        camps = Array.isArray(rows) ? rows : [];
      } catch (_) { /* استمرّ بلا نتائج */ }
      if (camps.length === 0) {
        return `لا مخيمات طبية معلَنة حالياً. تصفّح القائمة الكاملة من ${linkBtn(`${sndkBasePath()}/camps`, 'هنا')}.`;
      }
      const buttons = camps.map((c) => linkBtn(`${sndkBasePath()}/camp/${encodeURIComponent(c.id)}`, c.title || c.name || 'مخيم')).join('');
      const list = camps.map((c) => esc(c.title || c.name || 'مخيم')).join('، ');
      return `يوجد ${camps.length} من المخيمات الطبية المعلَنة حالياً: ${list}. اضغط على أي اسم لعرض تفاصيله والتسجيل فيه.` + actionsRow(buttons);
    }

    // اسم تخصص مذكور صراحة — يوجّه بحث الأطباء بمعرّف التخصص لا بالاسم الحرّ
    const specialties = await loadFallbackSpecialties();
    const matchedSpecialty = specialties.find((s) => {
      const name = normalizeSimple(s.arabic_name || s.name || '');
      return name.length >= 3 && n.includes(name);
    });

    let doctors = [];
    let facilities = [];
    let bookingIds = null;
    try {
      const doctorQuery = matchedSpecialty ? { specialty_id: matchedSpecialty.id, limit: 6 } : { q: raw, limit: 5 };
      const results = await withTimeout(Promise.all([
        SndkApi.getData('get-doctors', { query: doctorQuery }).catch(() => []),
        SndkApi.getData('get-facilities', { query: { q: raw, limit: 5 } }).catch(() => []),
        fetchBookingFacilityIds().catch(() => null),
      ]));
      doctors = Array.isArray(results[0]) ? results[0] : [];
      facilities = Array.isArray(results[1]) ? results[1] : [];
      bookingIds = Array.isArray(results[2]) ? new Set(results[2]) : null;
    } catch (_) { /* استمرّ بلا نتائج بدل رسالة خطأ ثانية */ }

    // "أريد حجز موعد" بلا اسم طبيب/مرفق/تخصص معه — إرشاد عام للحجز، لا بحث فارغ
    if (!matchedSpecialty && doctors.length === 0 && facilities.length === 0 && FALLBACK_BOOKING_WORDS.some((w) => n.includes(w))) {
      return `للحجز اختر أولاً طبيباً أو مرفقاً، ثم اضغط «احجز» من صفحته مباشرة — الحجز الإلكتروني متاح فقط للمرافق المفعَّلة تجارياً؛ غيرها يحتاج تواصلاً مباشراً.`
        + actionsRow(linkBtn(`${sndkBasePath()}/doctors`, 'تصفّح الأطباء') + linkBtn(`${sndkBasePath()}/facilities`, 'تصفّح المرافق'));
    }

    if (doctors.length === 0 && facilities.length === 0) {
      const label = matchedSpecialty ? (matchedSpecialty.arabic_name || matchedSpecialty.name) : raw;
      return `لا نتائج مطابقة لـ«${esc(label)}» في البحث المبسّط. تصفّح الموقع مباشرة من ${linkBtn(`${sndkBasePath()}/doctors`, 'الأطباء')} أو ${linkBtn(`${sndkBasePath()}/facilities`, 'المرافق')}.`;
    }

    // نتيجة واحدة بالضبط (طبيب أو مرفق، لا كلاهما معاً) — فقرة مفصّلة كاملة
    // بدل سرد مقتضب، بقدر ما هو متوفّر فعلاً من بيانات.
    if (doctors.length === 1 && facilities.length === 0) {
      const specialtiesById = Object.fromEntries(specialties.map((s) => [s.id, s]));
      return describeDoctorParagraph(doctors[0], specialtiesById)
        + actionsRow(linkBtn(`${sndkBasePath()}/doctor/${encodeURIComponent(doctors[0].id)}`, 'فتح صفحة الطبيب'));
    }
    if (facilities.length === 1 && doctors.length === 0) {
      return describeFacilityParagraph(facilities[0], bookingIds)
        + actionsRow(linkBtn(`${sndkBasePath()}/facility/${encodeURIComponent(facilities[0].id)}`, 'فتح صفحة المرفق'));
    }

    const specialtiesById = Object.fromEntries(specialties.map((s) => [s.id, s]));
    const parts = [];
    if (doctors.length) {
      const specLabel = matchedSpecialty ? ` في تخصص «${esc(matchedSpecialty.arabic_name || matchedSpecialty.name)}»` : '';
      const items = doctors.map((d) => {
        const sp = specialtiesById[d.specialty_id];
        const spName = sp ? (sp.arabic_name || sp.name) : '';
        const ratingText = d.rating > 0 ? ` (تقييم ${esc(String(d.rating))})` : '';
        return `${esc(d.name)}${!matchedSpecialty && spName ? ` — ${esc(spName)}` : ''}${ratingText}`;
      });
      parts.push(`${doctors.length} من الأطباء${specLabel}: ${items.join('، ')}`);
    }
    if (facilities.length) {
      const items = facilities.map((f) => {
        const type = f.type ? (FACILITY_TYPE_LABELS[f.type] || f.type) : '';
        const location = [f.city, f.governorate].filter(Boolean).join('، ');
        const booking = bookingIds ? (bookingIds.has(f.id) ? 'حجز إلكتروني متاح' : 'حجز إلكتروني غير متاح') : '';
        return `${esc(f.name)}${type ? ` (${esc(type)})` : ''}${location ? ` في ${esc(location)}` : ''}${booking ? ` — ${booking}` : ''}`;
      });
      parts.push(`${facilities.length} من المرافق: ${items.join('، ')}`);
    }
    const buttons = [
      ...doctors.map((d) => linkBtn(`${sndkBasePath()}/doctor/${encodeURIComponent(d.id)}`, d.name)),
      ...facilities.map((f) => linkBtn(`${sndkBasePath()}/facility/${encodeURIComponent(f.id)}`, f.name)),
    ].join('');

    return `${parts.join('. ')}. اضغط على أي اسم أدناه لعرض التفاصيل الكاملة.` + actionsRow(buttons);
  }

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
      const reply = decoded && decoded.success === true && decoded.data && decoded.data.reply;

      if (reply) {
        popTyping();
        pushBot(renderMarkdownLite(reply));
        apiHistory.push({ role: 'assistant', content: reply });
        return;
      }

      // فشل أو ردّ فارغ — تحوّل صامت للبحث المحلّي بلا أي رسالة عطل: يجب أن
      // يبدو استمراراً طبيعياً للمحادثة. apiHistory لا يحمل هذا الردّ (مصدره
      // محلّي لا نموذج) فلا يدخل سياق الرسائل القادمة للخادم.
      apiHistory.pop();
      const fallback = await fallbackSearch(trimmed);
      popTyping();
      pushBot(fallback);
    } catch (err) {
      apiHistory.pop();
      const fallback = await fallbackSearch(trimmed);
      popTyping();
      pushBot(fallback);
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
