// المساعد الذكي «سندك الطبي» — أداة مطابقة أنماط حتمية بلا نموذج ذكاء
// اصطناعي حقيقي ولا اتصال بأي API خارجي: لا تكلفة، لا مفاتيح، لا شيء
// "يتعلّم" فعلياً (استحال ذلك بلا خادم تدريب) — فقط تفسير نص عربي بسيط إلى
// إحدى نوايا معدودة، ثم استدعاء نفس دوال الحافة العامة التي تستعملها بقية
// الموقع (get-doctors/get-facilities/get-specialties/get-camps/
// get-clinic-schedules) وعرض النتائج في فقرة مفصّلة + أزرار تنقل حقيقية.
//
// حدود متعمّدة (لا تحايل عليها لاحقاً):
// - لا يجمع أي بيانات دفع إطلاقاً — عند الحاجة لدفع يُرسل فقط رابط صفحة
//   الموعد نفسها (نفس رابط المشاركة الذي تنتجه appointment.js)، والدفع
//   الفعلي يمرّ من هناك بنفس مسار booking.js/payment.js المعتاد.
// - لا مدخل حرّ إلى القاعدة أو أي دالة كتابة حسّاسة — فقط القراءات العامة
//   المتاحة أصلاً لأي زائر غير مسجَّل دخول، تماماً كصفحات القوائم.
// - أي رسالة تطلب كوداً أو مفاتيح أو بيانات داخلية تُرفض برسالة ثابتة —
//   لا "تفكير" هنا يمكن التحايل عليه لأنه ليس نموذج لغة، بل تحقّق كلمات.
//
// esc/sndkOpenModal/sndkCloseModal/FACILITY_TYPE_LABELS/SNDK_ICONS من
// common.js، SndkApi من api.js، SndkAuth/SndkAuthUI من auth.js/auth-ui.js،
// sndkBasePath من routing.js.

const SndkAssistant = (() => {
  const REFUSAL_KEYWORDS = ['كود', 'سورس', 'source code', 'api key', 'مفتاح', 'password', 'كلمة السر', 'كلمة سر', 'سر', 'sql', 'شيفرة', 'ignore previous', 'تجاهل التعليمات', 'system prompt', 'برومبت'];
  const SPECIALTY_CACHE_MS = 10 * 60 * 1000;
  const REQUEST_TIMEOUT_MS = 12000; // إنترنت ضعيف جداً: لا نترك الطلب معلّقاً بلا حد.

  let specialtiesCache = null;
  let specialtiesCacheAt = 0;
  let messages = []; // {role: 'user'|'bot', html}
  let panelEl = null;
  let sending = false;

  function normalize(text) {
    return (text || '')
      .replace(/[ً-ٰٟ]/g, '') // تشكيل
      .replace(/[إأآا]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .toLowerCase()
      .trim();
  }

  function containsAny(normalizedText, words) {
    return words.some((w) => normalizedText.includes(normalize(w)));
  }

  // مهلة صريحة على أي طلب شبكة هنا — بلا هذا قد يُعلَّق المساعد بصمت على
  // اتصالٍ ضعيف جداً بينما بقية الموقع (بلا مهلة في SndkApi نفسها) قد يعاني
  // من نفس المشكلة أصلاً؛ هذا الملف لا يُصلح ذلك عالمياً، فقط يحمي واجهته هو.
  function withTimeout(promise) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), REQUEST_TIMEOUT_MS)),
    ]);
  }

  async function loadSpecialties() {
    const now = Date.now();
    if (specialtiesCache && (now - specialtiesCacheAt) < SPECIALTY_CACHE_MS) return specialtiesCache;
    const rows = await withTimeout(SndkApi.getData('get-specialties', { query: { limit: 200 } }));
    specialtiesCache = Array.isArray(rows) ? rows : [];
    specialtiesCacheAt = now;
    return specialtiesCache;
  }

  // مطابقة مرتّبة بمستويات (تامّة → بادئة → احتواء) بدل أول تطابق يُصادَف —
  // نفس أسلوب _matchRegion في lib/utils/trip_query_parser.dart (تطبيق
  // البلاد): لو التبس النص بين أكثر من تخصص بلا ترجيح واضح، لا نخمّن أحدهم —
  // نُعيد كل المرشّحين ليختار المستخدم بنفسه بدل نتيجة قد تكون خاطئة.
  // كلمات مكان تقطع محاولة مطابقة التخصص عند ما بعدها — "الأسنان في تريم"
  // يجب ألا تُختبر "تريم" كاسم تخصص محتمل.
  const LOCATION_MARKERS = ['في', 'داخل', 'قرب', 'بجانب', 'حوالي'];

  function matchSpecialties(normalizedText, specialties) {
    const exact = [];
    const prefix = [];
    const contains = [];
    const matchedIds = new Set();

    // تخصصات كثيرة اسمها "طب X" أو "جراحة X" — من يكتب "الأسنان" وحدها
    // يقصد "طب الأسنان" بالضبط، فمطابقة النص الكامل فقط (كما كانت) تفوّت
    // هذه الحالة الشائعة. نبني مرشّحين: النص كاملاً، وكل كلمة/كلمتين
    // متتاليتين قبل أول كلمة مكان (إن وُجدت).
    const words = normalizedText.split(' ').filter(Boolean);
    const candidateTokens = new Set([normalizedText]);
    for (let i = 0; i < words.length; i++) {
      if (LOCATION_MARKERS.includes(words[i])) break;
      candidateTokens.add(words[i]);
      if (i + 1 < words.length && !LOCATION_MARKERS.includes(words[i + 1])) {
        candidateTokens.add(`${words[i]} ${words[i + 1]}`);
      }
    }

    for (const s of specialties) {
      const name = normalize(s.arabic_name || s.name || '');
      if (name.length < 3 || matchedIds.has(s.id)) continue;
      for (const token of candidateTokens) {
        if (token.length < 3) continue;
        if (token === name) { exact.push(s); matchedIds.add(s.id); break; }
        if (token.startsWith(name) || name.startsWith(token)) { prefix.push(s); matchedIds.add(s.id); break; }
        if (token.includes(name) || name.includes(token)) { contains.push(s); matchedIds.add(s.id); break; }
      }
    }

    const ranked = [...exact, ...prefix, ...contains];
    if (ranked.length === 0) return { best: null, candidates: [] };
    if (exact.length === 1) return { best: exact[0], candidates: [] };
    if (ranked.length === 1) return { best: ranked[0], candidates: [] };
    if (exact.length === 0 && prefix.length === 1) return { best: prefix[0], candidates: [] };
    // أكثر من مرشّح بلا ترجيح واضح — يُطلَب من المستخدم التحديد.
    return { best: null, candidates: ranked.slice(0, 5) };
  }

  // إزالة كلمة/عبارة معروفة ككلمة كاملة محاطة بفراغ فقط — لا كأي مطابقة
  // جزئية داخل كلمة أطول. بلا هذا الحرص: normalize("مستشفى") == "مستشفي"،
  // وحرف "في" (حرف جر ضمن NOISE_WORDS) هو حرفياً آخر حرفين من "مستشفي" —
  // فإزالته كسلسلة فرعية تُبقي "مستش" فقط وتكسر البحث عن اسم المستشفى.
  function stripKnownWords(normalizedText, words) {
    let out = ` ${normalizedText} `;
    for (const w of words) {
      const nw = normalize(w);
      if (!nw) continue;
      out = out.split(` ${nw} `).join(' ');
    }
    return out.replace(/\s+/g, ' ').trim();
  }

  function arabicCount(n, singular, plural) {
    if (n === 0) return `لا ${plural}`;
    if (n === 1) return `${singular} واحد`;
    if (n === 2) return `${singular}ان`;
    return `${n} ${plural}`;
  }

  // ─────────────────────────── العرض ───────────────────────────

  function bubble(role, innerHtml) {
    return `<div class="asst-bubble asst-bubble-${role}">${innerHtml}</div>`;
  }

  function renderMessages() {
    if (!panelEl) return;
    const body = panelEl.querySelector('#asstBody');
    body.innerHTML = messages.map((m) => bubble(m.role, m.html)).join('');
    body.scrollTop = body.scrollHeight;
  }

  function pushBot(html) {
    messages.push({ role: 'bot', html });
    renderMessages();
  }

  function pushUser(text) {
    messages.push({ role: 'user', html: esc(text) });
    renderMessages();
  }

  function pushTyping() {
    messages.push({ role: 'bot', html: '<span class="asst-typing"><span></span><span></span><span></span></span>', typing: true });
    renderMessages();
  }

  function popTyping() {
    if (messages.length && messages[messages.length - 1].typing) messages.pop();
  }

  function actionsRow(buttonsHtml) {
    return `<div class="row wrap gap-8 mt-8">${buttonsHtml}</div>`;
  }

  function linkBtn(href, label) {
    return `<a class="btn btn-sm btn-outline" href="${esc(href)}">${esc(label)}</a>`;
  }

  function actionBtn(id, label) {
    return `<button class="btn btn-sm btn-outline asst-action" data-action-id="${esc(id)}">${esc(label)}</button>`;
  }

  // ─────────────────────────── النوايا ───────────────────────────

  const GREETING_WORDS = ['مرحبا', 'اهلا', 'السلام عليكم', 'هاي', 'صباح الخير', 'مساء الخير'];
  const DOCTOR_WORDS = ['طبيب', 'دكتور', 'أطباء', 'اطباء', 'دكاترة', 'اخصائي', 'أخصائي'];
  const FACILITY_WORDS = ['مستشفى', 'مستشفيات', 'عيادة', 'عيادات', 'مركز طبي', 'مراكز', 'مرفق', 'مرافق', 'مستوصف'];
  const CAMP_WORDS = ['مخيم', 'مخيمات', 'حملة طبية', 'حملات طبية'];
  const MY_APPOINTMENTS_WORDS = ['مواعيدي', 'حجوزاتي', 'حجزي'];
  const BOOKING_WORDS = ['احجز', 'حجز', 'موعد', 'مواعيد'];
  const ACCOUNT_WORDS = ['دخول', 'تسجيل الدخول', 'انشاء حساب', 'إنشاء حساب', 'سجل دخول', 'حسابي', 'تسجيل حساب'];
  const PAYMENT_WORDS = ['دفع', 'فيزا', 'بطاقة', 'ادفع', 'الدفع'];
  const ABOUT_WORDS = ['ما هو سندك', 'عن سندك', 'ما هي المنصة', 'ايش هذا الموقع', 'شنو سندك'];
  const REPORT_WORDS = ['تقرير', 'احصائية', 'احصائيات', 'إحصائية', 'إحصائيات', 'ملخص', 'كم عدد', 'كم مرفق', 'كم مستشفى', 'كم طبيب', 'كم مدينة'];

  const NOISE_WORDS = ['اريد', 'ابحث عن', 'ابغى', 'ابي', 'من فضلك', 'ابحث', 'عن', 'في', 'لي', 'تخصص', 'دكتور', 'طبيب', 'اطباء', 'أطباء'];

  async function handleMessage(rawText) {
    const text = rawText.trim();
    if (!text) return;
    pushUser(text);
    const n = normalize(text);

    if (containsAny(n, REFUSAL_KEYWORDS)) {
      pushBot('أنا مساعد سندك الطبي، ومهمتي محصورة في البحث عن الأطباء والمرافق الصحية والمخيمات الطبية والمساعدة بالحجز والحساب — لا أستطيع مساعدتك بهذا الطلب ولا أملك أي كودٍ أو بيانات داخلية لأشاركها.');
      return;
    }

    pushTyping();
    try {
      if (containsAny(n, CAMP_WORDS)) return void await intentCamps();
      if (containsAny(n, MY_APPOINTMENTS_WORDS)) return void intentMyAppointments();
      if (containsAny(n, ACCOUNT_WORDS)) return void intentAccount();
      if (containsAny(n, PAYMENT_WORDS)) return void intentPayment();
      // قبل فحص "مرافق/أطباء" — "تقرير كامل للمرافق" يحمل كلمة "مرافق" أيضاً
      // وسيُفهَم كبحث عن مرفق اسمه هذا بلا هذا الترتيب.
      if (containsAny(n, REPORT_WORDS)) return void await intentReport();
      if (containsAny(n, DOCTOR_WORDS)) return void await intentDoctors(n);
      if (containsAny(n, FACILITY_WORDS)) return void await intentFacilities(n);
      if (containsAny(n, BOOKING_WORDS)) return void intentBookingGeneric();
      if (containsAny(n, ABOUT_WORDS) || containsAny(n, GREETING_WORDS)) return void intentAboutOrGreeting(n);

      // بلا أي كلمة مفتاحية صريحة — قد يكون المستخدم كتب اسم تخصص فقط
      // («الأسنان في تريم») بلا كلمة «طبيب» معه. جرّب مطابقة تخصص قبل
      // الاستسلام لرسالة «لم أفهم».
      const specialties = await loadSpecialties();
      const match = matchSpecialties(n, specialties);
      if (match.best || match.candidates.length > 0) return void await resolveDoctorsFromMatch(match, n, specialties);

      return void intentFallback();
    } catch (err) {
      popTyping();
      const offline = err && (err.code === 'OFFLINE' || err.message === 'TIMEOUT');
      pushBot(offline
        ? 'يبدو أن الاتصال ضعيف جداً الآن — حاول مرة أخرى بعد قليل، أو تصفّح مباشرة من ' + linkBtn(`${sndkBasePath()}/doctors`, 'صفحة الأطباء') + '.'
        : 'تعذّر تنفيذ طلبك حالياً. حاول مرة أخرى بعد قليل.');
    } finally {
      renderMessages();
    }
  }

  // فقرة مفصّلة عن طبيب واحد مطابَق بدقّة: تخصصه وتقييمه ونبذته، مرافقه
  // وجدولاته (من get-clinic-schedules — نفس ما تعرضه صفحة الطبيب)، وأقرب
  // وسيلة تواصل فعلية (هاتف/واتساب المرفق الأول، إذ لا رقم مباشر للطبيب
  // نفسه). فشل هذا الاستدعاء الإضافي لا يمنع عرض ما هو متوفر أصلاً.
  async function describeDoctorDetail(doctor, specialtyGuess, specialtiesById) {
    let schedules = [];
    try {
      schedules = await withTimeout(SndkApi.getData('get-clinic-schedules', { query: { doctor_id: doctor.id } }));
    } catch (_) { /* التفاصيل الإضافية اختيارية */ }
    if (!Array.isArray(schedules)) schedules = [];

    const sp = specialtyGuess || (specialtiesById && specialtiesById[doctor.specialty_id]) || null;
    const specialtyName = sp ? (sp.arabic_name || sp.name) : '';

    const facilitiesMap = {};
    for (const s of schedules) if (s.facilities) facilitiesMap[s.facilities.id] = s.facilities;
    const facilities = Object.values(facilitiesMap);

    const sentences = [];
    sentences.push(`${esc(doctor.name)}${specialtyName ? ` أخصائي ${esc(specialtyName)}` : ''}.`);
    if (doctor.rating > 0) sentences.push(`تقييمه ${esc(String(doctor.rating))} من 5 بناءً على ${esc(String(doctor.reviews_count || 0))} تقييم.`);
    if (doctor.bio) sentences.push(esc(doctor.bio));
    sentences.push(`يعمل في ${arabicCount(facilities.length, 'مرفق', 'مرافق')}، وله ${arabicCount(schedules.length, 'موعد', 'مواعيد')} معلَنة.`);
    if (facilities.length) {
      sentences.push(`المرافق: ${facilities.slice(0, 6).map((f) => esc(f.name)).join('، ')}${facilities.length > 6 ? ' وغيرها' : ''}.`);
    }

    const primaryFacility = facilities[0];
    if (primaryFacility) {
      const fPhones = primaryFacility.phones && primaryFacility.phones.length ? primaryFacility.phones : (primaryFacility.phone ? [primaryFacility.phone] : []);
      const fWhatsapps = primaryFacility.whatsapps && primaryFacility.whatsapps.length ? primaryFacility.whatsapps : (primaryFacility.whatsapp ? [primaryFacility.whatsapp] : []);
      const contactParts = [];
      if (fPhones[0]) contactParts.push(`هاتف ${esc(fPhones[0])}`);
      if (fWhatsapps[0]) contactParts.push(`واتساب ${esc(fWhatsapps[0])}`);
      if (contactParts.length) sentences.push(`للتواصل عبر ${esc(primaryFacility.name)}: ${contactParts.join('، ')}.`);
    }

    const actions = [linkBtn(`${sndkBasePath()}/doctor/${encodeURIComponent(doctor.id)}`, 'فتح صفحة الطبيب والحجز')];
    if (primaryFacility) {
      const fWhatsapps = primaryFacility.whatsapps && primaryFacility.whatsapps.length ? primaryFacility.whatsapps : (primaryFacility.whatsapp ? [primaryFacility.whatsapp] : []);
      if (fWhatsapps[0]) actions.push(`<a class="btn btn-sm btn-outline" href="https://wa.me/${esc(cleanPhone(fWhatsapps[0]))}" target="_blank" rel="noopener">واتساب المرفق</a>`);
    }

    return sentences.join(' ') + actionsRow(actions.join(''));
  }

  // فقرة مفصّلة عن مرفق واحد مطابَق بدقّة: نوعه وموقعه ووصفه، أطباؤه
  // وعددهم (من نفس الجدولات)، ووسائل التواصل الفعلية كلها — لا سرد بطاقات
  // مختصرة كما في نتائج البحث المتعدّدة.
  async function describeFacilityDetail(facility) {
    let schedules = [];
    try {
      schedules = await withTimeout(SndkApi.getData('get-clinic-schedules', { query: { facility_id: facility.id } }));
    } catch (_) { /* التفاصيل الإضافية اختيارية */ }
    if (!Array.isArray(schedules)) schedules = [];

    const doctorsMap = {};
    for (const s of schedules) {
      if (s.doctors && s.doctors.is_active !== false) doctorsMap[s.doctors.id] = s.doctors;
    }
    const doctors = Object.values(doctorsMap);

    const phones = facility.phones && facility.phones.length ? facility.phones : (facility.phone ? [facility.phone] : []);
    const whatsapps = facility.whatsapps && facility.whatsapps.length ? facility.whatsapps : (facility.whatsapp ? [facility.whatsapp] : []);
    const type = facility.type ? (FACILITY_TYPE_LABELS[facility.type] || facility.type) : '';
    const location = [facility.district, facility.city, facility.governorate].filter(Boolean).join('، ');

    const sentences = [];
    sentences.push(`${esc(facility.name)}${type ? ` هو ${esc(type)}` : ''}${location ? ` في ${esc(location)}` : ''}.`);
    if (facility.nearby_landmark) sentences.push(`أقرب معلَم إليه: ${esc(facility.nearby_landmark)}.`);
    if (facility.description) sentences.push(esc(facility.description));
    sentences.push(`لديه ${arabicCount(doctors.length, 'طبيب', 'أطباء')}، و${arabicCount(schedules.length, 'موعد', 'مواعيد')} معلَنة.`);
    if (doctors.length) {
      sentences.push(`من الأطباء: ${doctors.slice(0, 6).map((d) => esc(d.name)).join('، ')}${doctors.length > 6 ? ' وغيرهم' : ''}.`);
    }

    const contactParts = [];
    if (phones[0]) contactParts.push(`هاتف ${esc(phones[0])}`);
    if (whatsapps[0]) contactParts.push(`واتساب ${esc(whatsapps[0])}`);
    if (facility.email) contactParts.push(`بريد ${esc(facility.email)}`);
    if (facility.website) contactParts.push(`موقع ${esc(facility.website)}`);
    sentences.push(contactParts.length ? `للتواصل: ${contactParts.join('، ')}.` : 'لا وسيلة تواصل مباشرة مسجَّلة لهذا المرفق حالياً.');

    const actions = [linkBtn(`${sndkBasePath()}/facility/${encodeURIComponent(facility.id)}`, 'فتح صفحة المرفق')];
    if (whatsapps[0]) actions.push(`<a class="btn btn-sm btn-filled" href="https://wa.me/${esc(cleanPhone(whatsapps[0]))}" target="_blank" rel="noopener">واتساب</a>`);
    if (phones[0]) actions.push(`<a class="btn btn-sm btn-outline" href="tel:${esc(cleanPhone(phones[0]))}">اتصال</a>`);

    return sentences.join(' ') + actionsRow(actions.join(''));
  }

  async function intentDoctors(n) {
    const specialties = await loadSpecialties();
    const match = matchSpecialties(n, specialties);
    await resolveDoctorsFromMatch(match, n, specialties);
  }

  // مشتركة بين "طبيب/دكتور..." الصريحة ومسار اكتشاف اسم تخصص وحده بلا كلمة
  // مفتاحية (انظر معالج الرسائل) — القرار نفسه في الحالتين.
  async function resolveDoctorsFromMatch(match, n, specialties) {
    if (match.candidates.length > 1) {
      popTyping();
      pushBot(
        'أكثر من تخصص يطابق كلامك — أيّهم تقصد؟'
        + actionsRow(match.candidates.map((s) => actionBtn(`specialty:${s.id}`, s.arabic_name || s.name)).join('')),
      );
      return;
    }

    const q = match.best ? '' : stripKnownWords(n, [...NOISE_WORDS, ...DOCTOR_WORDS]);
    // بيانات الطبيب لا تحمل مدينة (المدينة خاصّية المرفق لا الطبيب) — لا
    // تصفية فعلية حسب المكان ممكنة هنا. لو ذكر المستخدم مكاناً («في تريم»)
    // نصدُقه بذلك بدل تجاهله بصمت، لا أن نتظاهر بأن النتائج مصفّاة.
    const locationHint = extractLocationHint(n);
    await runDoctorsQuery({ specialty: match.best, q, specialties, locationHint });
  }

  function extractLocationHint(normalizedText) {
    const words = normalizedText.split(' ').filter(Boolean);
    const idx = words.findIndex((w) => LOCATION_MARKERS.includes(w));
    if (idx === -1 || idx + 1 >= words.length) return null;
    const rest = words.slice(idx + 1).join(' ').trim();
    return rest || null;
  }

  async function runDoctorsQuery({ specialty, q, specialties, locationHint = null }) {
    const query = { limit: 8 };
    if (specialty) query.specialty_id = specialty.id;
    else if (q) query.q = q;

    const doctors = await withTimeout(SndkApi.getData('get-doctors', { query }));

    if (!Array.isArray(doctors) || doctors.length === 0) {
      popTyping();
      const specLabel = specialty ? (specialty.arabic_name || specialty.name) : (q || '');
      pushBot(`لا يوجد حالياً أطباء متاحون${specLabel ? ` في «${esc(specLabel)}»` : ''}. جرّب تخصصاً آخر، أو تصفّح كل الأطباء من ${linkBtn(`${sndkBasePath()}/doctors`, 'هنا')}.`);
      return;
    }

    const specialtiesById = Object.fromEntries(specialties.map((s) => [s.id, s]));

    // نتيجة واحدة بالضبط — فقرة مفصّلة عنه بدل سرد قصير، هذا ما سُئل عنه
    // تحديداً (اسم طبيب/تخصص محدَّد يحصر النتيجة في واحد). يبقى مؤشّر
    // الكتابة ظاهراً خلال نداء التفاصيل الإضافي (جدولاته) لا يختفي ثم يعود.
    if (doctors.length === 1) {
      const detail = await describeDoctorDetail(doctors[0], specialty, specialtiesById);
      popTyping();
      pushBot(detail);
      return;
    }

    popTyping();
    const specLabel = specialty ? (specialty.arabic_name || specialty.name) : '';
    const parts = doctors.map((d) => {
      const sp = specialtiesById[d.specialty_id];
      const spName = sp ? (sp.arabic_name || sp.name) : '';
      const ratingText = d.rating > 0 ? `، بتقييم ${esc(String(d.rating))} من ${esc(String(d.reviews_count || 0))} تقييم` : '';
      return `${esc(d.name)}${spName ? ` (${esc(spName)})` : ''}${ratingText}`;
    });

    const intro = specLabel
      ? `وجدت ${doctors.length} من الأطباء في تخصص «${esc(specLabel)}»: `
      : `وجدت ${doctors.length} من الأطباء المطابقين: `;
    const locationCaveat = locationHint
      ? ` (ملاحظة: لا أقدر أُصفّي حسب المدينة بعد — هذه من كل المدن، ابحث عن اسم مدينتك ضمن أسماء المرافق أدناه بعد فتح كل طبيب.)`
      : '';
    pushBot(
      intro + parts.join('؛ ') + '. اضغط على اسم أي طبيب أدناه لعرض صفحته الكاملة والحجز منها مباشرة.' + locationCaveat
      + actionsRow(doctors.map((d) => linkBtn(`${sndkBasePath()}/doctor/${encodeURIComponent(d.id)}`, d.name)).join('')),
    );
  }

  // اختيار المستخدم تخصصاً من رقاقات التوضيح — يُعيد الاستعلام مباشرة بمعرّف
  // التخصص المحدَّد بلا حاجة لإعادة تفسير نصّ حرّ قد يلتبس مرة أخرى.
  async function chooseSpecialty(specialtyId) {
    const specialties = await loadSpecialties();
    const specialty = specialties.find((s) => s.id === specialtyId) || null;
    pushTyping();
    try {
      await runDoctorsQuery({ specialty, q: '', specialties });
    } catch (err) {
      popTyping();
      pushBot('تعذّر تنفيذ طلبك حالياً. حاول مرة أخرى بعد قليل.');
    } finally {
      renderMessages();
    }
  }

  async function intentFacilities(n) {
    const q = stripKnownWords(n, [...NOISE_WORDS, ...FACILITY_WORDS]);
    const facilities = await withTimeout(SndkApi.getData('get-facilities', { query: q ? { q, limit: 8 } : { limit: 8 } }));

    if (!Array.isArray(facilities) || facilities.length === 0) {
      popTyping();
      pushBot(`لا توجد مرافق مطابقة${q ? ` لـ«${esc(q)}»` : ''} حالياً. تصفّح كل المرافق من ${linkBtn(`${sndkBasePath()}/facilities`, 'هنا')}.`);
      return;
    }

    // نتيجة واحدة بالضبط — فقرة مفصّلة عنه بدل سرد قصير (نفس أسلوب الأطباء
    // أعلاه). مؤشّر الكتابة يبقى ظاهراً خلال نداء التفاصيل الإضافي.
    if (facilities.length === 1) {
      const detail = await describeFacilityDetail(facilities[0]);
      popTyping();
      pushBot(detail);
      return;
    }

    popTyping();
    const parts = facilities.map((f) => {
      const type = f.type ? (FACILITY_TYPE_LABELS[f.type] || f.type) : '';
      const location = [f.city, f.governorate].filter(Boolean).join('، ');
      return `${esc(f.name)}${type ? ` (${esc(type)})` : ''}${location ? ` في ${esc(location)}` : ''}`;
    });

    pushBot(
      `وجدت ${facilities.length} من المرافق الصحية: ${parts.join('؛ ')}. اضغط على اسم أي مرفق لعرض جدولاته وأطبائه وحجز موعد.`
      + actionsRow(facilities.map((f) => linkBtn(`${sndkBasePath()}/facility/${encodeURIComponent(f.id)}`, f.name)).join('')),
    );
  }

  async function intentCamps() {
    const camps = await withTimeout(SndkApi.getData('get-camps', { query: { scope: 'active' } }));
    popTyping();

    if (!Array.isArray(camps) || camps.length === 0) {
      pushBot(`لا توجد مخيمات طبية قادمة معلَنة حالياً. تابع القائمة الكاملة من ${linkBtn(`${sndkBasePath()}/camps`, 'هنا')}.`);
      return;
    }

    const parts = camps.map((c) => esc(c.title || c.name || 'مخيم طبي'));
    pushBot(
      `يوجد ${camps.length} من المخيمات الطبية القادمة: ${parts.join('؛ ')}. اضغط لعرض التفاصيل والتسجيل.`
      + actionsRow(camps.map((c) => linkBtn(`${sndkBasePath()}/camp/${encodeURIComponent(c.id)}`, c.title || c.name || 'مخيم')).join('')),
    );
  }

  // "تقرير/إحصائيات" — أرقام حقيقية من get-public-stats (نفس ما تعرضه صفحة
  // «عن سندك») لا أكثر: لا نُخمّن توزيعاً حسب النوع أو المدينة لأن هذه
  // الدالة العامة لا تُعيده — القاعدة فقط، ولا رقم لا تصرّح به.
  async function intentReport() {
    const rows = await withTimeout(SndkApi.getData('get-public-stats'));
    popTyping();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) {
      pushBot(`تعذّر جلب إحصائيات المنصة حالياً. تصفّح المرافق والأطباء مباشرة من ${linkBtn(`${sndkBasePath()}/facilities`, 'هنا')}.`);
      return;
    }

    const facilitiesCount = Number(row.facilities_count) || 0;
    const doctorsCount = Number(row.doctors_count) || 0;
    const citiesCount = Number(row.cities_count) || 0;

    pushBot(
      `هذه أرقام حيّة من قاعدة بيانات سندك الطبي مباشرة (لا تقدير): `
      + `${esc(String(facilitiesCount))} مرفق صحي مسجَّل، `
      + `${esc(String(doctorsCount))} طبيب مسجَّل، `
      + `موزّعين على ${esc(String(citiesCount))} مدينة ومنطقة.`
      + actionsRow(linkBtn(`${sndkBasePath()}/facilities`, 'تصفّح المرافق') + linkBtn(`${sndkBasePath()}/doctors`, 'تصفّح الأطباء')),
    );
  }

  function intentMyAppointments() {
    popTyping();
    if (!SndkAuth.isLoggedIn()) {
      pushBot('مواعيدك تحتاج تسجيل دخول أولاً حتى نعرف صاحب الحجز.' + actionsRow(actionBtn('login', 'تسجيل الدخول')));
      return;
    }
    pushBot('هذه مواعيدك:' + actionsRow(linkBtn(`${sndkBasePath()}/appointments`, 'عرض مواعيدي')));
  }

  function intentAccount() {
    popTyping();
    pushBot('تقدر تسجّل الدخول أو تنشئ حساباً جديداً مباشرة من هنا.' + actionsRow(actionBtn('login', 'تسجيل الدخول / إنشاء حساب')));
  }

  function intentPayment() {
    popTyping();
    pushBot(
      'لا آخذ أي بيانات دفع هنا إطلاقاً — بطاقتك ورقمها لا يمرّان من هذه المحادثة أبداً. '
      + 'إذا كان حجزك يتطلّب رسماً، فرابط الدفع الرسمي يظهر داخل صفحة الموعد نفسه بعد إنشائه، وتدفع من هناك مباشرة عبر بوابة الدفع المعتمدة.'
      + actionsRow(linkBtn(`${sndkBasePath()}/doctors`, 'ابحث عن طبيب لتحجز عنده')),
    );
  }

  function intentBookingGeneric() {
    popTyping();
    pushBot(
      'للحجز، اختر أولاً طبيباً أو مرفقاً — اكتب مثلاً «أريد طبيب أسنان» أو اسم المستشفى، وسأعرض لك النتائج بأزرار تفتح صفحة كل واحد منها؛ من صفحة الطبيب/المرفق تقدر ترى الجدولات المتاحة وتحجز مباشرة.'
      + actionsRow(linkBtn(`${sndkBasePath()}/doctors`, 'تصفّح الأطباء') + linkBtn(`${sndkBasePath()}/facilities`, 'تصفّح المرافق')),
    );
  }

  function intentAboutOrGreeting(n) {
    popTyping();
    if (containsAny(n, GREETING_WORDS) && !containsAny(n, ABOUT_WORDS)) {
      pushBot('أهلاً بك! أقدر أساعدك في البحث عن طبيب حسب التخصص، أو مستشفى/عيادة، أو مخيم طبي، أو حجز موعد، أو حسابك. جرّب مثلاً: «أريد طبيب عيون».');
      return;
    }
    pushBot('سندك الطبي منصة حجز مواعيد طبية في اليمن — تصفّح كل التفاصيل من صفحة «عن سندك».' + actionsRow(linkBtn(`${sndkBasePath()}/about`, 'عن سندك الطبي')));
  }

  function intentFallback() {
    popTyping();
    pushBot(
      'لم أفهم طلبك تماماً. أقدر أساعدك في: البحث عن طبيب حسب التخصص، البحث عن مستشفى أو عيادة، تصفّح المخيمات الطبية، الحجز، أو الحساب. جرّب مثلاً «أريد طبيب أسنان» أو «مستشفيات في المكلا».'
      + actionsRow(
        actionBtn('suggest:doctor', 'ابحث عن طبيب')
        + actionBtn('suggest:facility', 'ابحث عن مستشفى')
        + actionBtn('suggest:camps', 'المخيمات الطبية'),
      ),
    );
  }

  // ─────────────────────────── الأزرار التفاعلية داخل الفقاعات ───────────────────────────

  // مراقب واحد على مستوى اللوحة كلها (event delegation) بدل ربط كل فقاعة
  // جديدة يدوياً — أبسط وأخف من إعادة الربط بعد كل renderMessages().
  function mountBubbleDelegation() {
    panelEl.querySelector('#asstBody').addEventListener('click', (e) => {
      const btn = e.target.closest('.asst-action');
      if (!btn) return;
      const id = btn.dataset.actionId;
      if (id === 'login') SndkAuthUI.openLoginModal(() => pushBot('تم تسجيل الدخول. كيف أقدر أساعدك الآن؟'));
      else if (id === 'suggest:doctor') submit('أريد طبيب');
      else if (id === 'suggest:facility') submit('ابحث عن مستشفى');
      else if (id === 'suggest:camps') submit('المخيمات الطبية');
      else if (id.startsWith('specialty:')) {
        if (sending) return;
        sending = true;
        pushUser(btn.textContent.trim());
        chooseSpecialty(id.slice('specialty:'.length)).finally(() => { sending = false; });
      }
    });
  }

  async function submit(text) {
    if (sending) return;
    sending = true;
    try {
      await handleMessage(text);
    } finally {
      sending = false;
    }
  }

  // ─────────────────────────── فتح/إغلاق اللوحة ───────────────────────────

  // نفس الورقة السفلية المشتركة (sndkOpenModal/sndkCloseModal في common.js)
  // التي تستعملها القائمة الجانبية ومودال الدخول — عنصرٌ واحدٌ مفتوحٌ في كل
  // لحظة على مستوى الموقع كله، لا نظام منبثقات منفصل خاص بالمساعد.
  function open() {
    panelEl = sndkOpenModal(`
      <div class="asst-panel">
        <div class="row gap-8" style="align-items:center;">
          ${SNDK_ICONS.chat(20)}
          <div style="font-weight:700;">مساعد سندك الطبي</div>
        </div>
        <div class="text-muted mt-8" style="font-size:12px;">
          أساعدك في البحث عن طبيب أو مستشفى أو مخيم طبي، والحجز والحساب — لا أطلب أو أحفظ أي بيانات دفع.
        </div>
        <div id="asstBody" class="asst-body mt-16"></div>
        <div class="row gap-8 mt-12">
          <input class="field" id="asstInput" style="margin:0;" placeholder="اكتب سؤالك… مثلاً: أريد طبيب عيون">
          <button class="btn btn-filled" id="asstSendBtn">إرسال</button>
        </div>
      </div>
    `);

    mountBubbleDelegation();

    if (messages.length === 0) {
      pushBot('أهلاً بك في سندك الطبي! اسألني عن طبيب أو مستشفى أو مخيم طبي، أو اطلب مساعدة بالحجز أو حسابك.');
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

  return { open, close };
})();
