// مساعد «سندك الطبي» — محرّك بحث محلي حتمي بالكامل، **بلا أي نموذج ذكاء
// اصطناعي** ولا نداء خارجي لأي مزوّد نموذج: كل ردّ يُبنى من مطابقة كلمات
// وفلترة مباشرة على بيانات حقيقية من قاعدة البيانات (لا توليد نصّ حرّ، ولا
// تخمين). أدقّ ما يقدّمه هو استعلام الجدول الصريح — "جدول تخصص الأسنان في
// عيديد مساءً" — الذي يُترجَم إلى فلترة حقيقية على تخصص/مدينة/فترة/يوم معاً،
// لا بحثاً نصياً عاماً.
//
// حدود التصميم:
// - لا بيانات دفع تمرّ من هنا إطلاقاً ولا تُطلَب في أي مرحلة.
// - مهلة صريحة ٢٥ ثانية على كل نداء شبكة — إنترنت ضعيف جداً يحصل على ردّ
//   مفيد سريعاً بدل تعليق صامت.
//
// esc/sndkOpenModal/sndkCloseModal/SNDK_ICONS من common.js.

const SndkAssistant = (() => {
  const REQUEST_TIMEOUT_MS = 25000;

  let messages = []; // {role:'user'|'bot', html, typing?}
  let panelEl = null;
  let sending = false;

  // آخر مرفق تحدَّثت عنه المحادثة — يُحدَّث كلما استقرّ ردٌّ على مرفقٍ واحد
  // بعينه (نتيجة بحث وحيدة، أو "مواعيد/أطباء مرفق X" ناجحة). "مواعيد هذا
  // المرفق" في رسالة تالية تحلّه من هنا بدل البحث عن نصّ "هذا المرفق" حرفياً.
  let lastFacility = null; // {id, name} | null

  function withTimeout(promise) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), REQUEST_TIMEOUT_MS)),
    ]);
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

  // محرّك المطابقة والتصنيف — هذا هو المساعد كلّه، لا طبقة احتياطية. يغطّي
  // ست فئات: مستشفى/عيادة، طبيب، تخصص، جدولات مرفقٍ بعينه، جدول مواعيد عابر
  // للمرافق (تخصص+مدينة+فترة+يوم معاً)، ومخيم طبي — لا بحثاً نصياً عاماً فقط.
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
  // كلمات تدلّ على طلب «جدول/دوام مرفق» تحديداً (لا حجز عامّ). مع كلمة مرفق
  // وبلا كلمة طبيب ⇒ نعرض كل جدولات ذلك المرفق (لا الأطباء فقط).
  const FALLBACK_SCHEDULE_WORDS = ['موعد', 'مواعيد', 'جدول', 'جداول', 'دوام', 'اوقات', 'اوقات العمل', 'ايام العمل'];
  const FALLBACK_DOCTOR_WORDS = ['طبيب', 'أطباء', 'اطباء', 'دكتور', 'دكاترة'];
  const FALLBACK_FACILITY_WORDS = ['مستشفى', 'مستشفيات', 'عيادة', 'عيادات', 'مركز طبي', 'مراكز', 'مرفق', 'مرافق', 'مستوصف'];
  const FALLBACK_REPORT_WORDS = ['تقرير', 'احصائية', 'احصائيات', 'إحصائية', 'إحصائيات', 'ملخص', 'كم عدد', 'كم مرفق', 'كم مستشفى', 'كم طبيب', 'كم مدينة'];
  const FALLBACK_GREETING_WORDS = ['مرحبا', 'اهلا', 'السلام عليكم', 'هاي', 'صباح الخير', 'مساء الخير'];
  const FALLBACK_NOISE_WORDS = ['اريد', 'ابحث عن', 'ابغى', 'ابي', 'من فضلك', 'ابحث', 'عن', 'في', 'لي', 'هل يوجد', 'هل', 'يوجد', 'ما هو', 'ما هي', 'يمكن', 'يمكنني', 'الذي', 'التي', 'بها', 'به'];

  // إزالة كلمة/عبارة ككلمة كاملة محاطة بفراغ فقط — لا كأي مطابقة جزئية داخل
  // كلمة أطول. بلا هذا الحرص: normalize("مستشفى") == "مستشفي"، وحرف "في"
  // (ضمن كلمات الضجيج) هو حرفياً آخر حرفين من "مستشفي" — إزالته كسلسلة فرعية
  // كانت تُبقي "مستش" فقط وتكسر استخراج اسم المرفق (نفس عطل سابق أُصلح في
  // هذا الملف قبل تبسيطه، يُصلَح هنا مجدداً لنفس السبب بالضبط).
  function stripSimpleWords(normalizedText, words) {
    let out = ` ${normalizedText} `;
    for (const w of words) {
      const nw = normalizeSimple(w);
      if (!nw) continue;
      out = out.split(` ${nw} `).join(' ');
      // "المرفق" لا "مرفق" — القوائم كلها بصيغتها المجرَّدة، ورسالة حقيقية
      // كانت تُبقي "هذا المرفق" كاملة في نتيجة الاستخراج لأن "مرفق" وحدها
      // كانت تُزال بينما "المرفق" (بأداة التعريف) تبقى — تُطابَق هنا أيضاً
      // بلا حاجة لتكرار كل كلمة بصيغتين في كل قائمة.
      if (!nw.startsWith('ال')) out = out.split(` ال${nw} `).join(' ');
    }
    return out.replace(/\s+/g, ' ').trim();
  }

  // نفس فكرة `stripSimpleWords` لكن بالنص الأصلي لا المطبَّع — تُبنى منه
  // سلسلة `q` تُرسَل للخادم فعلياً، والتطبيع (ة→ه، أ→ا...) يجعلها لا تطابق
  // أعمدة القاعدة الحقيقية حرفياً (`ilike` مطابقة نصّية لا لغوية). المقارنة
  // بالمطبَّع لتحديد أي كلمة ضجيج، والإخراج بإملاء المستخدم كما كتبه.
  function stripNoiseWordsKeepOriginal(text, words) {
    const noise = new Set(words.map((w) => normalizeSimple(w)).filter(Boolean));
    return text.split(/\s+/).filter((tok) => tok && !noise.has(normalizeSimple(tok))).join(' ');
  }

  // ─────────────── جدول المواعيد العابر للمرافق — تخصص + مدينة + فترة + يوم ───────────────
  //
  // مختلفٌ عن `facility_schedules` أعلاه: ذاك يطلب اسم **مرفقٍ بعينه**
  // ويعرض كل جدولاته. هذا لا يذكر مرفقاً أصلاً — "جدول تخصص الأسنان في
  // عيديد مساءً" — فيفلتر عبر كل المرافق معاً على الأربعة عناصر. أي عنصر
  // غير مذكور يبقى بلا فلترة، لا افتراض قيمة له.
  //
  // عبارات صريحة غير مستعملة أعلاه فقط ("جدول"/"مواعيد"/"دوام" مخصَّصة
  // لـ`facility_schedules` مع اسم مرفق) — الإشارة الأقوى هنا هي فترة أو يوم
  // مذكوران، لا الكلمة وحدها.
  const FALLBACK_AGENDA_WORDS = ['جدول اعمال', 'جدول مواعيد', 'جدول العمل', 'اجندة'];
  const FALLBACK_CITY_NOISE_WORDS = ['منطقة', 'مدينة', 'مدينه', 'بمنطقة', 'بمدينة', 'تخصص', 'لتخصص'];

  // القيمة الفعلية المخزَّنة في عمود `period` (مطابقة تماماً لـ
  // SchedulePeriod.name في تطبيق الجوال: morning/evening/fullDay).
  const FALLBACK_PERIOD_MAP = {
    'مساء': 'evening', 'مساءا': 'evening', 'مسائي': 'evening', 'مسائيه': 'evening', 'المسائية': 'evening',
    'صباح': 'morning', 'صباحا': 'morning', 'صباحي': 'morning', 'صباحيه': 'morning', 'الصباحية': 'morning',
    'طوال اليوم': 'fullDay', 'كل اليوم': 'fullDay', 'كامل اليوم': 'fullDay', 'طول اليوم': 'fullDay',
  };

  // ترتيب ScheduleDay في تطبيق الجوال بالحرف: السبت=0 ... الجمعة=6 — نفس
  // ترتيب `working_days` كما يُخزَّن فعلياً في القاعدة.
  const FALLBACK_DAY_LABELS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
  const FALLBACK_DAY_MAP = Object.fromEntries(FALLBACK_DAY_LABELS.map((d, i) => [normalizeSimple(d), i]));
  const FALLBACK_PERIOD_LABELS = { morning: 'صباحية', evening: 'مسائية', fullDay: 'طوال اليوم' };

  // "صباح الخير"/"مساء الخير" تحيّتان لا طلب فترة — تُستبعدان قبل كشف الفترة
  // فقط، لا من بقية التصنيف (تحيّة حقيقية تبقى تحيّة في مكانها الأصلي أدناه).
  function stripGreetingPhrases(n) {
    return n.replace(normalizeSimple('صباح الخير'), ' ').replace(normalizeSimple('مساء الخير'), ' ');
  }

  function detectPeriod(n) {
    const scanned = stripGreetingPhrases(n);
    for (const [word, value] of Object.entries(FALLBACK_PERIOD_MAP)) {
      if (scanned.includes(normalizeSimple(word))) return value;
    }
    return null;
  }

  function detectDay(n) {
    const scanned = stripGreetingPhrases(n);
    for (const [word, index] of Object.entries(FALLBACK_DAY_MAP)) {
      if (scanned.includes(word)) return index;
    }
    return null;
  }

  // ما تبقّى من الرسالة بعد حذف كل ما فُهم فعلاً (ضجيج، عبارات الجدول،
  // التخصص المطابَق، الفترة، اليوم) هو استعلام المدينة الحرّ — بلا قائمة
  // مدن ثابتة يُقارَن بها: مطابقة جزئية لاحقاً ضد مدينة المرفق الفعلية تكفي.
  function extractCityQuery(n, matchedSpecialty) {
    const words = [
      ...FALLBACK_NOISE_WORDS,
      ...FALLBACK_AGENDA_WORDS,
      ...FALLBACK_SCHEDULE_WORDS,
      ...FALLBACK_CITY_NOISE_WORDS,
      ...Object.keys(FALLBACK_PERIOD_MAP),
      ...FALLBACK_DAY_LABELS,
    ];
    if (matchedSpecialty) words.push(matchedSpecialty.arabic_name || matchedSpecialty.name || '');
    return stripSimpleWords(n, words);
  }

  // working_days أولاً، وإلا day_of_week القديم (ISO: الاثنين=1 ... الأحد=7)
  // محوَّلاً — نفس منطق `_isoDayToScheduleDayIndex` في نموذج الجدولة بتطبيق
  // الجوال بالحرف، كي لا تُستبعد جدولاتٌ قديمة لم تُهاجَر إلى working_days.
  function scheduleDayIndices(s) {
    if (Array.isArray(s.working_days) && s.working_days.length) {
      return s.working_days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    }
    const iso = Number(s.day_of_week);
    if (Number.isInteger(iso) && iso >= 1 && iso <= 7) return [iso === 7 ? 1 : iso + 1];
    return [];
  }

  function arabicCount(n, singular, plural) {
    if (n === 0) return `لا ${plural}`;
    if (n === 1) return `${singular} واحد`;
    if (n === 2) return `${singular}ان`;
    return `${n} ${plural}`;
  }

  // جدول HTML حقيقي — لا نص مفصول بفواصل. الخلايا تصل جاهزة (نصّ مُهرَّب أو
  // رابط <a> مبني عبر linkBtn) لا خاماً — على المستدعي التهريب قبل التمرير.
  function tableHtml(headers, rows) {
    const th = (c) => `<th style="padding:6px 10px;border-bottom:2px solid var(--border);text-align:start;font-size:12.5px;">${esc(c)}</th>`;
    const td = (c) => `<td style="padding:6px 10px;border-bottom:1px solid var(--border);font-size:12.5px;">${c}</td>`;
    return `<div style="overflow-x:auto;margin:8px 0;"><table style="border-collapse:collapse;width:100%;">`
      + `<tr>${headers.map(th).join('')}</tr>`
      + rows.map((r) => `<tr>${r.map(td).join('')}</tr>`).join('')
      + `</table></div>`;
  }

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

  // جدولات مرفق — لعدّ الأطباء الفعليين والمواعيد المعلَنة، ولاستخراج أسماء
  // الأطباء عند طلبها تحديداً. استدعاء واحد يُعاد استعماله في الحالتين.
  async function loadFacilitySchedules(facilityId) {
    try {
      const rows = await withTimeout(SndkApi.getData('get-clinic-schedules', { query: { facility_id: facilityId } }));
      return Array.isArray(rows) ? rows : [];
    } catch (_) {
      return [];
    }
  }
  function distinctDoctorsFromSchedules(schedules) {
    const map = {};
    for (const s of schedules) {
      if (s.doctors && s.doctors.is_active !== false) map[s.doctors.id] = s.doctors;
    }
    return Object.values(map);
  }

  // فقرة واحدة عن مرفق — النوع والموقع، عدد الأطباء الفعليين وعدد المواعيد
  // المعلَنة (من جدولاته الحقيقية لا تخميناً)، وسائل التواصل الحقيقية، وحالة
  // الحجز الإلكتروني الفعلية (لا افتراض أنه متاح لمجرّد وجود مرفق).
  async function describeFacilityParagraph(f, bookingIds) {
    const schedules = await loadFacilitySchedules(f.id);
    const doctors = distinctDoctorsFromSchedules(schedules);

    const type = f.type ? (FACILITY_TYPE_LABELS[f.type] || f.type) : '';
    // المدينة والمحافظة أولاً، ثم المنطقة، ثم المعلم القريب — من الأعمّ إلى
    // الأدقّ، كما يُذكر مكان فعلياً لا يُوصف بالإحداثيات.
    const location = [f.city, f.governorate, f.directorate, f.district].filter(Boolean).join('، ');
    const phones = f.phones && f.phones.length ? f.phones : (f.phone ? [f.phone] : []);
    const whatsapps = f.whatsapps && f.whatsapps.length ? f.whatsapps : (f.whatsapp ? [f.whatsapp] : []);
    const contactParts = [];
    if (phones[0]) contactParts.push(`هاتف ${esc(phones[0])}`);
    if (whatsapps[0]) contactParts.push(`واتساب ${esc(whatsapps[0])}`);
    const bookingText = bookingIds && bookingIds.has(f.id)
      ? 'الحجز الإلكتروني متاح لهذا المرفق عبر الموقع.'
      : 'الحجز الإلكتروني غير مفعَّل لهذا المرفق حالياً — تواصل مباشرة.';

    const sentences = [];
    sentences.push(`${esc(f.name)}${type ? ` — ${esc(type)}` : ''}${location ? ` في ${esc(location)}` : ''}.`);
    if (f.nearby_landmark) sentences.push(`قريب من: ${esc(f.nearby_landmark)}.`);
    sentences.push(`لديه ${arabicCount(doctors.length, 'طبيب', 'أطباء')}، و${arabicCount(schedules.length, 'موعد', 'مواعيد')} معلَنة.`);
    if (doctors.length) sentences.push(`الأطباء: ${doctors.slice(0, 10).map((d) => esc(d.name)).join('، ')}${doctors.length > 10 ? ' وغيرهم' : ''}.`);
    sentences.push(contactParts.length ? `للتواصل: ${contactParts.join('، ')}.` : 'لا وسيلة تواصل مباشرة مسجَّلة.');
    sentences.push(bookingText);
    return sentences.join(' ');
  }

  // ─────────────────────────── تحليل الطلب ───────────────────────────
  // يحدَّد نوع الطلب أولاً بوضوح صريح (لا تخمين مبعثر داخل جسم دالة واحدة
  // ضخمة) قبل أي استعلام — كل نوع له مُعالِج مستقل أدناه.
  async function classifyFallbackRequest(n) {
    if (FALLBACK_CAMP_WORDS.some((w) => n.includes(w))) return { type: 'camp' };
    if (FALLBACK_REPORT_WORDS.some((w) => n.includes(normalizeSimple(w)))) return { type: 'report' };

    const mentionsDoctor = FALLBACK_DOCTOR_WORDS.some((w) => n.includes(normalizeSimple(w)));
    const mentionsFacilityType = FALLBACK_FACILITY_WORDS.some((w) => n.includes(normalizeSimple(w)));
    if (mentionsDoctor && mentionsFacilityType) {
      const facilityQuery = stripSimpleWords(n, [...FALLBACK_NOISE_WORDS, ...FALLBACK_DOCTOR_WORDS, ...FALLBACK_FACILITY_WORDS]);
      if (facilityQuery) return { type: 'facility_doctors', facilityQuery };
    }

    // «مواعيد/جدول/دوام مستشفى كذا» — مرفق محدَّد بلا ذكر طبيب: كل جدولاته
    // (بحجز إلكتروني وبدونه)، لا رسالة حجز عامّة.
    const mentionsSchedule = FALLBACK_SCHEDULE_WORDS.some((w) => n.includes(normalizeSimple(w)));
    if (mentionsFacilityType && mentionsSchedule && !mentionsDoctor) {
      const facilityQuery = stripSimpleWords(n, [...FALLBACK_NOISE_WORDS, ...FALLBACK_SCHEDULE_WORDS, ...FALLBACK_FACILITY_WORDS, ...FALLBACK_BOOKING_WORDS]);
      if (facilityQuery) return { type: 'facility_schedules', facilityQuery };
    }

    const specialties = await loadFallbackSpecialties();
    const matchedSpecialty = specialties.find((s) => {
      const name = normalizeSimple(s.arabic_name || s.name || '');
      return name.length >= 3 && n.includes(name);
    });

    // جدول عابر للمرافق — "جدول تخصص الأسنان في عيديد مساءً": فترة أو يوم
    // مذكوران، أو عبارة جدول صريحة لم تُستهلَك أعلاه (تلك تطلب اسم مرفق ولم
    // تُطابق شيئاً). فلترة تخصص+مدينة+فترة+يوم معاً، لا بحثاً نصياً.
    const period = detectPeriod(n);
    const dayIndex = detectDay(n);
    const mentionsAgenda = FALLBACK_AGENDA_WORDS.some((w) => n.includes(normalizeSimple(w)));
    if (period || dayIndex !== null || mentionsAgenda) {
      const cityQuery = extractCityQuery(n, matchedSpecialty);
      return { type: 'schedule_query', matchedSpecialty, period, dayIndex, cityQuery };
    }

    if (matchedSpecialty) return { type: 'search', specialties, matchedSpecialty };

    if (FALLBACK_BOOKING_WORDS.some((w) => n.includes(w))) return { type: 'booking_generic', specialties };
    if (FALLBACK_GREETING_WORDS.some((w) => n.includes(normalizeSimple(w)))) return { type: 'greeting' };

    return { type: 'search', specialties, matchedSpecialty: null };
  }

  async function handleCampIntent() {
    let camps = [];
    try {
      const rows = await withTimeout(SndkApi.getData('get-camps', { query: { scope: 'active' } }));
      camps = Array.isArray(rows) ? rows : [];
    } catch (_) { /* استمرّ بلا نتائج */ }
    if (camps.length === 0) {
      return `لا مخيمات طبية معلَنة حالياً. تصفّح القائمة الكاملة من ${linkBtn(`${sndkBasePath()}/camps`, 'هنا')}.`;
    }
    camps.sort((a, b) => (a.title || a.name || '').localeCompare(b.title || b.name || '', 'ar'));
    const rows = camps.map((c) => [linkBtn(`${sndkBasePath()}/camp/${encodeURIComponent(c.id)}`, c.title || c.name || 'مخيم')]);
    return `طلبك: المخيمات الطبية المعلَنة حالياً — وجدت ${arabicCount(camps.length, 'مخيماً', 'مخيمات')}:`
      + tableHtml(['المخيم'], rows);
  }

  async function handleReportIntent() {
    let row = null;
    try {
      const rows = await withTimeout(SndkApi.getData('get-public-stats'));
      row = Array.isArray(rows) ? rows[0] : null;
    } catch (_) { /* استمرّ بلا رقم بدل رسالة خطأ ثانية */ }
    if (!row) {
      return `تعذّر جلب إحصائيات المنصة حالياً. تصفّح المرافق والأطباء مباشرة من ${linkBtn(`${sndkBasePath()}/facilities`, 'هنا')}.`;
    }
    return 'طلبك: تقرير أرقام المنصة — هذه أرقام حيّة من قاعدة البيانات مباشرة (لا تقدير):'
      + tableHtml(['البند', 'العدد'], [
        ['مرافق صحية مسجَّلة', esc(String(Number(row.facilities_count) || 0))],
        ['أطباء مسجَّلون', esc(String(Number(row.doctors_count) || 0))],
        ['مدن ومناطق مخدومة', esc(String(Number(row.cities_count) || 0))],
      ]);
  }

  function handleGreetingIntent() {
    return 'أهلاً بك! اسألني عن طبيب حسب التخصص، أو مستشفى، أو مخيم طبي، أو أي سؤال عن الحجز.';
  }

  function handleBookingGenericIntent() {
    return `طلبك: مساعدة بالحجز بلا اسم طبيب أو مرفق محدَّد — اختر أولاً طبيباً أو مرفقاً، ثم اضغط «احجز» من صفحته مباشرة. الحجز الإلكتروني متاح فقط للمرافق المفعَّلة تجارياً؛ غيرها يحتاج تواصلاً مباشراً.`
      + actionsRow(linkBtn(`${sndkBasePath()}/doctors`, 'تصفّح الأطباء') + linkBtn(`${sndkBasePath()}/facilities`, 'تصفّح المرافق'));
  }

  // "أطباء مستشفى بضه" — طلب مشروط بمرفق محدَّد صراحة. get-doctors لا يقبل
  // فلترة بمرفق إطلاقاً؛ الأداة الصحيحة الوحيدة هي جدولات المرفق نفسه
  // (get-clinic-schedules) — نفس الأسلوب المُصحَّح في دالة الحافة
  // ai-assistant لنفس السبب بالضبط.
  // كلمات إشارة صرفة ("هذا"، "هذه"...) لا اسم مرفق — تُستهلَك من `lastFacility`
  // (آخر مرفق استقرّ عليه ردٌّ سابق) بدل بحثٍ نصّي لن يطابق شيئاً أبداً.
  const REFERENCE_WORDS = ['هذا', 'هذه', 'ذلك', 'تلك', 'نفسه', 'نفسها'];
  function isPureReference(text) {
    const t = (text || '').trim();
    return t !== '' && stripSimpleWords(t, REFERENCE_WORDS) === '';
  }

  // يحلّ facilityQuery إلى مرفق واحد — من السياق (`lastFacility`) حين تكون
  // الرسالة إشارة صرفة، وإلا ببحث get-facilities المعتاد. `null` = تعذّر
  // الحلّ، والرسالة المناسبة (لا سياق / لا مطابقة) مبنيّة هنا أيضاً.
  async function resolveFacilityQuery(facilityQuery, verbLabel) {
    if (isPureReference(facilityQuery)) {
      if (lastFacility) return { facility: lastFacility, matchesCount: 1, fromContext: true };
      return {
        facility: null,
        errorHtml: `طلبك: ${verbLabel} «${esc(facilityQuery)}» — لم نتحدّث عن مرفقٍ بعد في هذه المحادثة لأربطه بالإشارة. اذكر اسمه صراحةً.`,
      };
    }
    let matches = [];
    try {
      const rows = await withTimeout(SndkApi.getData('get-facilities', { query: { q: facilityQuery, limit: 5 } }));
      matches = Array.isArray(rows) ? rows : [];
    } catch (_) { /* استمرّ بلا نتائج */ }
    if (matches.length === 0) {
      return {
        facility: null,
        errorHtml: `طلبك: ${verbLabel} «${esc(facilityQuery)}» — لا مرفق مطابق في البحث المبسّط. تصفّح كل المرافق من ${linkBtn(`${sndkBasePath()}/facilities`, 'هنا')}.`,
      };
    }
    return { facility: matches[0], matchesCount: matches.length, fromContext: false };
  }

  async function handleFacilityDoctorsIntent(facilityQuery) {
    const resolved = await resolveFacilityQuery(facilityQuery, 'أطباء مرفق');
    if (!resolved.facility) return resolved.errorHtml;
    const facility = resolved.facility;
    lastFacility = { id: facility.id, name: facility.name };

    const schedules = await loadFacilitySchedules(facility.id);
    const doctors = distinctDoctorsFromSchedules(schedules);
    const ambiguityNote = resolved.matchesCount > 1 ? ` (من بين ${resolved.matchesCount} مرافق مطابقة، الأقرب: ${esc(facility.name)})` : '';
    const askedAs = resolved.fromContext ? esc(facility.name) : `«${esc(facilityQuery)}»`;

    const intro = `طلبك: أطباء مرفق ${askedAs}${ambiguityNote} — ${esc(facility.name)} لديه ${arabicCount(doctors.length, 'طبيب', 'أطباء')}، و${arabicCount(schedules.length, 'موعد', 'مواعيد')} معلَنة.`;
    if (doctors.length === 0) {
      return `${intro} لا أطباء مسجَّلون لهذا المرفق حالياً.` + actionsRow(linkBtn(`${sndkBasePath()}/facility/${encodeURIComponent(facility.id)}`, 'فتح صفحة المرفق'));
    }

    const specialtiesForDoctors = await loadFallbackSpecialties();
    const specialtiesById = Object.fromEntries(specialtiesForDoctors.map((s) => [s.id, s]));
    doctors.sort((a, b) => (b.rating || 0) - (a.rating || 0) || a.name.localeCompare(b.name, 'ar'));
    const rows = doctors.map((d) => {
      const sp = specialtiesById[d.specialty_id];
      return [
        linkBtn(`${sndkBasePath()}/doctor/${encodeURIComponent(d.id)}`, d.name),
        esc(sp ? (sp.arabic_name || sp.name) : '—'),
        d.rating > 0 ? esc(String(d.rating)) : '—',
      ];
    });
    return intro + tableHtml(['الطبيب', 'التخصص', 'التقييم'], rows)
      + actionsRow(linkBtn(`${sndkBasePath()}/facility/${encodeURIComponent(facility.id)}`, 'فتح صفحة المرفق'));
  }

  // "مواعيد مستشفى بضه" — كل جدولات المرفق كما هي: التي فيها حجز إلكتروني
  // والتي بدونه معاً. get-clinic-schedules يُعيد جدولات المرفق كاملةً عند
  // تمرير facility_id صريح (بوّابة الاشتراك تخصّ التصفّح العام فقط). حالة
  // الحجز الإلكتروني تُعرض كعمود لكل صفّ لا كإخفاء.
  function scheduleGroupLabel(s) {
    return (s.sub_facility && s.sub_facility.name)
      || (s.specialties && (s.specialties.arabic_name || s.specialties.name))
      || 'غير محدد';
  }

  async function handleFacilitySchedulesIntent(facilityQuery) {
    const resolved = await resolveFacilityQuery(facilityQuery, 'مواعيد مرفق');
    if (!resolved.facility) return resolved.errorHtml;
    const facility = resolved.facility;
    lastFacility = { id: facility.id, name: facility.name };

    const [schedules, bookingIdsArr] = await Promise.all([
      loadFacilitySchedules(facility.id),
      fetchBookingFacilityIds().catch(() => null),
    ]);
    const facilityBookable = Array.isArray(bookingIdsArr) && new Set(bookingIdsArr).has(facility.id);
    const ambiguityNote = resolved.matchesCount > 1 ? ` (من بين ${resolved.matchesCount} مرافق مطابقة، الأقرب: ${esc(facility.name)})` : '';
    const askedAs = resolved.fromContext ? esc(facility.name) : `«${esc(facilityQuery)}»`;
    const intro = `طلبك: مواعيد مرفق ${askedAs}${ambiguityNote} — ${esc(facility.name)}: كل الجدولات المعلَنة (بحجز إلكتروني وبدونه).`;

    if (schedules.length === 0) {
      return `${intro} لا مواعيد معلَنة لهذا المرفق حالياً.`
        + actionsRow(linkBtn(`${sndkBasePath()}/facility/${encodeURIComponent(facility.id)}`, 'فتح صفحة المرفق'));
    }

    const dayOrder = (s) => (Array.isArray(s.working_days) && s.working_days.length ? Math.min(...s.working_days) : 99);
    schedules.sort((a, b) => dayOrder(a) - dayOrder(b)
      || (a.period || '').localeCompare(b.period || '')
      || ((a.doctors && a.doctors.name) || '').localeCompare((b.doctors && b.doctors.name) || '', 'ar'));

    const rows = schedules.map((s) => {
      const period = PERIOD_LABELS[s.period] || s.period || '—';
      const time = s.start_time && s.end_time ? `${s.start_time.slice(0, 5)} – ${s.end_time.slice(0, 5)}` : '';
      const days = workingDaysLabel(s.working_days) || 'لم يحدد';
      return [
        s.doctors ? linkBtn(`${sndkBasePath()}/doctor/${encodeURIComponent(s.doctors.id)}`, s.doctors.name) : esc('—'),
        esc(scheduleGroupLabel(s)),
        esc(days),
        esc([period, time].filter(Boolean).join(' · ')),
        facilityBookable ? 'متاح' : 'غير متاح',
      ];
    });
    return intro
      + tableHtml(['الطبيب', 'القسم', 'الأيام', 'الفترة والوقت', 'حجز إلكتروني'], rows)
      + (facilityBookable
        ? ''
        : '<div class="text-muted mt-8" style="font-size:12px;">الحجز الإلكتروني غير مفعَّل لهذا المرفق — تواصل معه مباشرة عبر صفحته.</div>')
      + actionsRow(linkBtn(`${sndkBasePath()}/facility/${encodeURIComponent(facility.id)}`, 'فتح صفحة المرفق'));
  }

  // "جدول تخصص الأسنان في عيديد مساءً" — استعلامٌ مركَّب حقيقي عابر
  // للمرافق، لا بحث نصّي: تخصص عبر specialty_id (خادم)، ومدينة/فترة/يوم عبر
  // فلترة محلية (الخادم لا يقبل فلترة الفترة أو اليوم). أي عنصر غير مذكور
  // في الرسالة يبقى بلا فلترة — فتُعرض كل ما يطابق ما تحدَّد فقط.
  function scheduleAskedLabel(matchedSpecialty, cityQuery, period, dayIndex) {
    const parts = [];
    if (matchedSpecialty) parts.push(`تخصص «${esc(matchedSpecialty.arabic_name || matchedSpecialty.name)}»`);
    if (cityQuery) parts.push(`في «${esc(cityQuery)}»`);
    if (period) parts.push(`الفترة ${FALLBACK_PERIOD_LABELS[period]}`);
    if (dayIndex !== null) parts.push(`يوم ${esc(FALLBACK_DAY_LABELS[dayIndex])}`);
    return parts.length ? parts.join('، ') : 'كل الجداول المعلَنة';
  }

  // "عيديد" فشلت كمدينة — لكن زائراً كثيراً ما يذكر منطقته أو معلماً قريباً
  // منه لا اسم مدينته حرفياً ("قرب جامعة حضرموت" مثلاً). المرفق يحمل هذا
  // فعلاً (`district`/`nearby_landmark`)، فمطابقة "المدينة" هنا تفحص الثلاثة
  // معاً — أوسع من city وحدها، لا فلتراً إضافياً منفصلاً.
  function facilityLocationText(f) {
    if (!f) return '';
    return normalizeSimple([f.city, f.district, f.directorate, f.nearby_landmark].filter(Boolean).join(' '));
  }

  function filterSchedules(schedules, cityQuery, period, dayIndex) {
    const cityNorm = cityQuery ? normalizeSimple(cityQuery) : '';
    return schedules.filter((s) => {
      // فترة "طوال اليوم" تُلبّي أي طلب فترة — ليست استثناءً من الفلترة.
      if (period && s.period !== period && s.period !== 'fullDay') return false;
      const days = scheduleDayIndices(s);
      if (dayIndex !== null && days.length && !days.includes(dayIndex)) return false;
      if (cityNorm) {
        const location = facilityLocationText(s.facilities) || normalizeSimple(s.city || '');
        if (!location.includes(cityNorm)) return false;
      }
      return true;
    });
  }

  function scheduleRowsTable(filtered) {
    filtered.sort((a, b) => {
      const ca = (a.facilities && a.facilities.city) || '';
      const cb = (b.facilities && b.facilities.city) || '';
      return ca.localeCompare(cb, 'ar')
        || ((a.facilities && a.facilities.name) || '').localeCompare((b.facilities && b.facilities.name) || '', 'ar');
    });
    const LIMIT = 30;
    const rows = filtered.slice(0, LIMIT).map((s) => {
      const days = scheduleDayIndices(s);
      const daysLabel = days.length ? days.map((d) => FALLBACK_DAY_LABELS[d]).join('، ') : '—';
      const time = s.start_time && s.end_time ? `${esc(s.start_time.slice(0, 5))}–${esc(s.end_time.slice(0, 5))}` : '—';
      // المدينة وحدها لا تقول لماذا طابق الصفّ طلباً بمنطقة أو معلم قريب —
      // المنطقة/المعلم يظهران بجانبها حين يتوفّران، لا استبدالاً لها.
      const f = s.facilities;
      const locationParts = [f && f.city, f && f.district, f && f.directorate, f && f.nearby_landmark].filter(Boolean);
      const locationLabel = locationParts.length ? locationParts.join(' — ') : '—';
      return [
        linkBtn(`${sndkBasePath()}/facility/${encodeURIComponent(s.facility_id)}`, (s.facilities && s.facilities.name) || '—'),
        s.doctors ? linkBtn(`${sndkBasePath()}/doctor/${encodeURIComponent(s.doctor_id)}`, s.doctors.name) : esc('—'),
        esc((s.specialties && (s.specialties.arabic_name || s.specialties.name)) || '—'),
        esc(locationLabel),
        esc(daysLabel),
        esc(FALLBACK_PERIOD_LABELS[s.period] || s.period || '—'),
        time,
      ];
    });
    const truncNote = filtered.length > LIMIT ? ` (تُعرض أول ${LIMIT})` : '';
    return { rows, truncNote };
  }

  // لا مواعيد مطابقة للفلترة الكاملة لا يعني «لا بيانات» — قد تكون المدينة
  // المذكورة غير موجودة أصلاً، أو لا مواعيد مسائية تحديداً في هذا التخصص.
  // بدل جملة تعذّر جافّة (شكوى فعلية: "أريد بيانات وليس تعذراً")، تُخفَّف
  // الفلترة تدريجياً — المدينة أولاً (أكثرها تحديداً وأكثرها عرضة للخطأ
  // الإملائي)، ثم اليوم، ثم الفترة — وتُعرض أوسع نتيجة حقيقية موجودة فعلاً،
  // مع قول أي عنصر أُسقط صراحة. لا نتائج مطلقاً على التخصص وحده هي الحالة
  // الوحيدة التي تستحق فعلاً رسالة «لا بيانات».
  async function handleScheduleQueryIntent(matchedSpecialty, period, dayIndex, cityQuery) {
    let schedules = [];
    try {
      const query = matchedSpecialty ? { specialty_id: matchedSpecialty.id } : {};
      const rows = await withTimeout(SndkApi.getData('get-clinic-schedules', { query }));
      schedules = Array.isArray(rows) ? rows : [];
    } catch (_) { /* استمرّ بلا نتائج */ }

    // كل خطوة تُسقط عنصراً واحداً إضافياً عن سابقتها — المدينة أولاً (أكثر
    // عرضة للخطأ الإملائي)، ثم اليوم، ثم الفترة — و`relaxed` تتراكم بما
    // أُسقط فعلاً حتى هذه الخطوة، لا خطوتها وحدها.
    const attempts = [{ city: cityQuery, period, day: dayIndex, relaxed: [] }];
    const dropped = [];
    if (cityQuery) {
      dropped.push(`المدينة «${esc(cityQuery)}»`);
      attempts.push({ city: '', period, day: dayIndex, relaxed: [...dropped] });
    }
    if (dayIndex !== null) {
      dropped.push(`يوم ${esc(FALLBACK_DAY_LABELS[dayIndex])}`);
      attempts.push({ city: '', period, day: null, relaxed: [...dropped] });
    }
    if (period) {
      dropped.push(`الفترة ${FALLBACK_PERIOD_LABELS[period]}`);
      attempts.push({ city: '', period: null, day: null, relaxed: [...dropped] });
    }

    for (const attempt of attempts) {
      const filtered = filterSchedules(schedules, attempt.city, attempt.period, attempt.day);
      if (filtered.length === 0) continue;

      const askedLabel = scheduleAskedLabel(matchedSpecialty, cityQuery, period, dayIndex);
      const { rows, truncNote } = scheduleRowsTable(filtered);
      const relaxNote = attempt.relaxed.length
        ? ` لا نتائج مطابقة تماماً لـ${attempt.relaxed.join(' و')} — إليك أقرب نتائج حقيقية بتخفيف ذلك:`
        : ' وجدت';
      return `طلبك: جدول ${askedLabel} —${relaxNote} ${arabicCount(filtered.length, 'موعداً', 'مواعيد')}${truncNote}:`
        + tableHtml(['المرفق', 'الطبيب', 'التخصص', 'الموقع', 'الأيام', 'الفترة', 'الوقت'], rows);
    }

    const askedLabel = scheduleAskedLabel(matchedSpecialty, cityQuery, period, dayIndex);
    if (matchedSpecialty) {
      return `طلبك: جدول ${askedLabel} — لا مواعيد معلَنة إطلاقاً لهذا التخصص حالياً في أي مدينة. تصفّح ${linkBtn(`${sndkBasePath()}/doctors`, 'كل الأطباء')}.`;
    }
    return `طلبك: جدول ${askedLabel} — لا مواعيد معلَنة حالياً. تصفّح ${linkBtn(`${sndkBasePath()}/doctors`, 'كل الأطباء')} أو ${linkBtn(`${sndkBasePath()}/facilities`, 'المرافق')}.`;
  }

  // "هل عيادة السري في عيديد" كاملةً كسلسلة `q` لا تطابق شيئاً حتى لو
  // وُجدت عيادة اسمها "السري" فعلاً — الخادم يقارن السلسلة كاملة بعمود
  // واحد (name أو city...)، لا كلمة كلمة. تُنظَّف كلمات الضجيج ("هل"، "في")
  // أولاً، ثم إن فشلت السلسلة كاملة تُسقَط الكلمة الأخيرة تكراراً (غالباً هي
  // القيد الإضافي — منطقة أو وصف — لا جزء الاسم) حتى نتيجة أو كلمة واحدة.
  async function searchDoctorsAndFacilities(cleanedTerm) {
    const words = cleanedTerm.split(' ').filter(Boolean);
    for (let n = words.length; n >= 1; n--) {
      const term = words.slice(0, n).join(' ');
      try {
        const results = await withTimeout(Promise.all([
          SndkApi.getData('get-doctors', { query: { q: term, limit: 6 } }).catch(() => []),
          SndkApi.getData('get-facilities', { query: { q: term, limit: 6 } }).catch(() => []),
        ]));
        const doctors = Array.isArray(results[0]) ? results[0] : [];
        const facilities = Array.isArray(results[1]) ? results[1] : [];
        if (doctors.length || facilities.length || n === 1) return { doctors, facilities, usedTerm: term };
      } catch (_) { /* جرّب سلسلة أقصر */ }
    }
    return { doctors: [], facilities: [], usedTerm: cleanedTerm };
  }

  async function handleSearchIntent(raw, matchedSpecialty, specialties) {
    let doctors = [];
    let facilities = [];
    let bookingIds = null;
    const cleaned = stripNoiseWordsKeepOriginal(raw, FALLBACK_NOISE_WORDS) || raw;
    try {
      if (matchedSpecialty) {
        const results = await withTimeout(Promise.all([
          SndkApi.getData('get-doctors', { query: { specialty_id: matchedSpecialty.id, limit: 8 } }).catch(() => []),
          SndkApi.getData('get-facilities', { query: { q: raw, limit: 6 } }).catch(() => []),
          fetchBookingFacilityIds().catch(() => null),
        ]));
        doctors = Array.isArray(results[0]) ? results[0] : [];
        facilities = Array.isArray(results[1]) ? results[1] : [];
        bookingIds = Array.isArray(results[2]) ? new Set(results[2]) : null;
      } else {
        const [searchResult, bookingIdsArr] = await withTimeout(Promise.all([
          searchDoctorsAndFacilities(cleaned),
          fetchBookingFacilityIds().catch(() => null),
        ]));
        doctors = searchResult.doctors;
        facilities = searchResult.facilities;
        bookingIds = Array.isArray(bookingIdsArr) ? new Set(bookingIdsArr) : null;
      }
    } catch (_) { /* استمرّ بلا نتائج بدل رسالة خطأ ثانية */ }

    if (doctors.length === 0 && facilities.length === 0) {
      const label = matchedSpecialty ? (matchedSpecialty.arabic_name || matchedSpecialty.name) : raw;
      return `طلبك: بحث عن «${esc(label)}» — لا نتائج مطابقة في البحث المبسّط. تصفّح الموقع مباشرة من ${linkBtn(`${sndkBasePath()}/doctors`, 'الأطباء')} أو ${linkBtn(`${sndkBasePath()}/facilities`, 'المرافق')}.`;
    }

    // نتيجة واحدة بالضبط (طبيب أو مرفق، لا كلاهما معاً) — فقرة مفصّلة كاملة
    // بدل سرد مقتضب، بقدر ما هو متوفّر فعلاً من بيانات.
    if (doctors.length === 1 && facilities.length === 0) {
      const specialtiesById = Object.fromEntries(specialties.map((s) => [s.id, s]));
      const label = matchedSpecialty ? `طبيب في تخصص «${esc(matchedSpecialty.arabic_name || matchedSpecialty.name)}»` : `بحث عن «${esc(raw)}»`;
      return `طلبك: ${label} — نتيجة واحدة مطابقة: ${describeDoctorParagraph(doctors[0], specialtiesById)}`
        + actionsRow(linkBtn(`${sndkBasePath()}/doctor/${encodeURIComponent(doctors[0].id)}`, 'فتح صفحة الطبيب'));
    }
    if (facilities.length === 1 && doctors.length === 0) {
      lastFacility = { id: facilities[0].id, name: facilities[0].name };
      return `طلبك: بحث عن «${esc(raw)}» — نتيجة واحدة مطابقة: ${await describeFacilityParagraph(facilities[0], bookingIds)}`
        + actionsRow(linkBtn(`${sndkBasePath()}/facility/${encodeURIComponent(facilities[0].id)}`, 'فتح صفحة المرفق'));
    }

    // عدّة نتائج — جدول مرتَّب لا سرد مفصول بفواصل: الأطباء بترتيب التقييم
    // تنازلياً، المرافق بأولوية الحجز الإلكتروني المفعَّل ثم الاسم.
    const specialtiesById = Object.fromEntries(specialties.map((s) => [s.id, s]));
    const introLabel = matchedSpecialty ? `تخصص «${esc(matchedSpecialty.arabic_name || matchedSpecialty.name)}»` : `«${esc(raw)}»`;
    let html = `طلبك: بحث عن ${introLabel} — `;
    const buttons = [];

    if (doctors.length) {
      doctors.sort((a, b) => (b.rating || 0) - (a.rating || 0) || a.name.localeCompare(b.name, 'ar'));
      html += `وجدت ${arabicCount(doctors.length, 'طبيباً', 'أطباء')}:`;
      html += tableHtml(['الطبيب', 'التخصص', 'التقييم'], doctors.map((d) => {
        const sp = specialtiesById[d.specialty_id];
        return [
          linkBtn(`${sndkBasePath()}/doctor/${encodeURIComponent(d.id)}`, d.name),
          esc(sp ? (sp.arabic_name || sp.name) : '—'),
          d.rating > 0 ? esc(String(d.rating)) : '—',
        ];
      }));
      buttons.push(...doctors.map((d) => linkBtn(`${sndkBasePath()}/doctor/${encodeURIComponent(d.id)}`, d.name)));
    }
    if (facilities.length) {
      facilities.sort((a, b) => {
        const ba = bookingIds && bookingIds.has(a.id) ? 1 : 0;
        const bb = bookingIds && bookingIds.has(b.id) ? 1 : 0;
        return bb - ba || a.name.localeCompare(b.name, 'ar');
      });
      html += `${doctors.length ? ' و' : ''}وجدت ${arabicCount(facilities.length, 'مرفقاً', 'مرافق')}:`;
      html += tableHtml(['المرفق', 'النوع', 'الموقع', 'حجز إلكتروني'], facilities.map((f) => [
        linkBtn(`${sndkBasePath()}/facility/${encodeURIComponent(f.id)}`, f.name),
        esc(f.type ? (FACILITY_TYPE_LABELS[f.type] || f.type) : '—'),
        esc([f.city, f.district, f.directorate, f.nearby_landmark].filter(Boolean).join('، ') || '—'),
        bookingIds && bookingIds.has(f.id) ? 'متاح' : 'غير متاح',
      ]));
      buttons.push(...facilities.map((f) => linkBtn(`${sndkBasePath()}/facility/${encodeURIComponent(f.id)}`, f.name)));
    }
    return html;
  }

  async function fallbackSearch(text) {
    const raw = text.trim().slice(0, 80);
    const n = normalizeSimple(raw);
    if (!n) return 'جرّب كتابة اسم طبيب أو مستشفى أو تخصص تبحث عنه.';

    const intent = await classifyFallbackRequest(n);
    switch (intent.type) {
      case 'camp': return await handleCampIntent();
      case 'report': return await handleReportIntent();
      case 'greeting': return handleGreetingIntent();
      case 'facility_doctors': return await handleFacilityDoctorsIntent(intent.facilityQuery);
      case 'facility_schedules': return await handleFacilitySchedulesIntent(intent.facilityQuery);
      case 'schedule_query': return await handleScheduleQueryIntent(intent.matchedSpecialty, intent.period, intent.dayIndex, intent.cityQuery);
      case 'booking_generic': return handleBookingGenericIntent();
      default: return await handleSearchIntent(raw, intent.matchedSpecialty, intent.specialties);
    }
  }

  async function submit(text) {
    const trimmed = (text || '').trim();
    if (!trimmed || sending) return;
    sending = true;
    pushUser(trimmed);
    pushTyping();

    try {
      const reply = await fallbackSearch(trimmed);
      popTyping();
      pushBot(reply);
    } catch (_) {
      popTyping();
      pushBot('تعذّر إتمام البحث. جرّب صياغة أبسط لسؤالك.');
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
          اسألني عن طبيب أو مستشفى أو تخصص أو مخيم طبي، أو اطلب جدول مواعيد بمدينة وفترة ويوم محدَّدين.
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
