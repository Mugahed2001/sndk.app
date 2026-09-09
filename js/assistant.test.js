// اختبارات تصنيف المساعد — منطق نصّي بحت (لا نداءات شبكة)، فتُنسَخ الدوال
// المعنيّة هنا حرفياً من assistant.js بدل استيرادها (الملف الأصلي IIFE
// بلا exports، مصمَّم للمتصفح لا Node). أي تعديل على هذه الدوال هناك يجب
// أن يُنسَخ هنا أيضاً — تذكيرٌ متعمَّد لا سهوٌ، فلا حزمة بناء في هذا المشروع.
//
// التشغيل: node js/assistant.test.js — يخرج بكود ١ عند أي فشل (صالح لـCI).

function normalizeSimple(t) {
  return (t || '')
    .replace(/[ً-ٰ]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase()
    .trim();
}

function stripSimpleWords(normalizedText, words) {
  let out = ` ${normalizedText} `;
  for (const w of words) {
    const nw = normalizeSimple(w);
    if (!nw) continue;
    out = out.split(` ${nw} `).join(' ');
    if (!nw.startsWith('ال')) out = out.split(` ال${nw} `).join(' ');
  }
  return out.replace(/\s+/g, ' ').trim();
}

function stripNoiseWordsKeepOriginal(text, words) {
  const noise = new Set(words.map((w) => normalizeSimple(w)).filter(Boolean));
  return text.split(/\s+/).filter((tok) => tok && !noise.has(normalizeSimple(tok))).join(' ');
}

const FALLBACK_NOISE_WORDS = ['اريد', 'ابحث عن', 'ابغى', 'ابي', 'من فضلك', 'ابحث', 'عن', 'في', 'لي', 'هل يوجد', 'هل', 'يوجد', 'ما هو', 'ما هي', 'يمكن', 'يمكنني', 'الذي', 'التي', 'بها', 'به', 'لماذا', 'ليش', 'كيف', 'متى', 'غير موجود', 'غير موجوده', 'غير', 'موجود', 'موجوده'];
const FALLBACK_SCHEDULE_WORDS = ['موعد', 'مواعيد', 'جدول', 'جداول', 'دوام', 'اوقات', 'اوقات العمل', 'ايام العمل'];
const FALLBACK_DOCTOR_WORDS = ['طبيب', 'أطباء', 'اطباء', 'دكتور', 'دكاترة'];
const FALLBACK_DOCTOR_TITLE_WORDS = ['د', 'د.'];
const FALLBACK_FACILITY_WORDS = ['مستشفى', 'مستشفيات', 'عيادة', 'عيادات', 'مركز طبي', 'مراكز', 'مرفق', 'مرافق', 'مستوصف'];
const FALLBACK_BOOKING_WORDS = ['موعد', 'مواعيد', 'حجز', 'احجز'];
const FALLBACK_AGENDA_WORDS = ['جدول اعمال', 'جدول مواعيد', 'جدول العمل', 'اجندة'];
const FALLBACK_CITY_NOISE_WORDS = ['منطقة', 'مدينة', 'مدينه', 'بمنطقة', 'بمدينة', 'تخصص', 'لتخصص'];
const FALLBACK_PERIOD_MAP = {
  'مساء': 'evening', 'مساءا': 'evening', 'مسائي': 'evening', 'مسائيه': 'evening', 'المسائية': 'evening',
  'صباح': 'morning', 'صباحا': 'morning', 'صباحي': 'morning', 'صباحيه': 'morning', 'الصباحية': 'morning',
  'طوال اليوم': 'fullDay', 'كل اليوم': 'fullDay', 'كامل اليوم': 'fullDay', 'طول اليوم': 'fullDay',
};
const FALLBACK_DAY_LABELS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
const FALLBACK_DAY_MAP = Object.fromEntries(FALLBACK_DAY_LABELS.map((d, i) => [normalizeSimple(d), i]));
const REFERENCE_WORDS = ['هذا', 'هذه', 'ذلك', 'تلك', 'نفسه', 'نفسها'];

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
function findMatchedSpecialty(n, specialties) {
  return specialties.find((s) => {
    const name = normalizeSimple(s.arabic_name || s.name || '');
    const bare = name.startsWith('ال') ? name.slice(2) : name;
    return bare.length >= 3 && n.includes(bare);
  }) || null;
}
function extractCityQuery(n, matchedSpecialty) {
  const words = [
    ...FALLBACK_NOISE_WORDS, ...FALLBACK_AGENDA_WORDS, ...FALLBACK_SCHEDULE_WORDS,
    ...FALLBACK_CITY_NOISE_WORDS, ...FALLBACK_DOCTOR_WORDS, ...FALLBACK_FACILITY_WORDS,
    ...Object.keys(FALLBACK_PERIOD_MAP), ...FALLBACK_DAY_LABELS,
  ];
  if (matchedSpecialty) {
    const name = normalizeSimple(matchedSpecialty.arabic_name || matchedSpecialty.name || '');
    words.push(name.startsWith('ال') ? name.slice(2) : name);
  }
  return stripSimpleWords(n, words);
}
function isPureReference(text) {
  const t = (text || '').trim();
  return t !== '' && stripSimpleWords(t, REFERENCE_WORDS) === '';
}

const FAQ_PHRASES = [
  ['how_to_book', ['كيف احجز', 'كيف أحجز', 'طريقة الحجز', 'كيفية الحجز', 'كيف اقدر احجز']],
  ['booking_cost', ['الحجز مجاني', 'تكلفة الحجز', 'رسوم الحجز', 'فلوس الحجز', 'سعر الحجز']],
  ['about_sndk', ['ما هو سندك', 'ما هي سندك', 'من انتم', 'عن الموقع', 'عن التطبيق', 'ايش سندك']],
  ['cancel_booking', ['الغاء الحجز', 'إلغاء الحجز', 'الغاء الموعد', 'إلغاء الموعد', 'كيف الغي']],
  ['contact_support', ['تواصل معكم', 'الدعم الفني', 'رقم الدعم', 'اتواصل معكم', 'عندي شكوى', 'مشكلة في التطبيق']],
];
function detectFaqTopic(n) {
  for (const [key, phrases] of FAQ_PHRASES) {
    if (phrases.some((p) => n.includes(normalizeSimple(p)))) return key;
  }
  return null;
}

// نسخة مبسَّطة من classifyFallbackRequest تكفي لاختبار قرار التصنيف (لا
// الاستدعاءات الشبكية بعده) — camp/report/greeting غير مُختبَرة هنا عمداً،
// كلمات ثابتة بلا منطق يستحق اختباراً آلياً.
function classify(n, specialties) {
  if (detectFaqTopic(n)) return { type: 'faq' };

  const mentionsDoctorTitle = n.split(' ').some((w) => w === 'د' || w === 'د.');
  const mentionsDoctor = mentionsDoctorTitle || FALLBACK_DOCTOR_WORDS.some((w) => n.includes(normalizeSimple(w)));
  const mentionsFacilityType = FALLBACK_FACILITY_WORDS.some((w) => n.includes(normalizeSimple(w)));
  if (mentionsDoctor && mentionsFacilityType) {
    const facilityQuery = stripSimpleWords(n, [...FALLBACK_NOISE_WORDS, ...FALLBACK_DOCTOR_WORDS, ...FALLBACK_DOCTOR_TITLE_WORDS, ...FALLBACK_FACILITY_WORDS]);
    if (facilityQuery) return { type: 'facility_doctors', facilityQuery };
  }
  const mentionsSchedule = FALLBACK_SCHEDULE_WORDS.some((w) => n.includes(normalizeSimple(w)));
  if (mentionsFacilityType && mentionsSchedule && !mentionsDoctor) {
    const facilityQuery = stripSimpleWords(n, [...FALLBACK_NOISE_WORDS, ...FALLBACK_SCHEDULE_WORDS, ...FALLBACK_FACILITY_WORDS, ...FALLBACK_BOOKING_WORDS]);
    if (facilityQuery) return { type: 'facility_schedules', facilityQuery };
  }
  if (mentionsDoctor && mentionsSchedule && !mentionsFacilityType) {
    const doctorQuery = stripSimpleWords(n, [...FALLBACK_NOISE_WORDS, ...FALLBACK_SCHEDULE_WORDS, ...FALLBACK_DOCTOR_WORDS, ...FALLBACK_DOCTOR_TITLE_WORDS, ...FALLBACK_BOOKING_WORDS]);
    if (doctorQuery) return { type: 'doctor_schedules', doctorQuery };
  }
  const matchedSpecialty = findMatchedSpecialty(n, specialties);
  const period = detectPeriod(n);
  const dayIndex = detectDay(n);
  const mentionsAgenda = FALLBACK_AGENDA_WORDS.some((w) => n.includes(normalizeSimple(w)));
  if (period || dayIndex !== null || mentionsAgenda) {
    return { type: 'schedule_query', matchedSpecialty, period, dayIndex, cityQuery: extractCityQuery(n, matchedSpecialty) };
  }
  if (matchedSpecialty) {
    const cityQuery = extractCityQuery(n, matchedSpecialty);
    if (cityQuery) return { type: 'schedule_query', matchedSpecialty, period: null, dayIndex: null, cityQuery };
    return { type: 'search', matchedSpecialty };
  }
  if (FALLBACK_BOOKING_WORDS.some((w) => n.includes(w))) return { type: 'booking_generic' };
  return { type: 'search', matchedSpecialty: null };
}

// ─────────────────────────────── الاختبارات ───────────────────────────────

const SPECIALTIES = [{ id: 'dental', arabic_name: 'الاسنان', name: 'الاسنان' }];

let failures = 0;
function check(label, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) {
    failures++;
    console.error(`✗ ${label}\n  توقّعت: ${JSON.stringify(expected)}\n  حصل:   ${JSON.stringify(actual)}`);
  } else {
    console.log(`✓ ${label}`);
  }
}

// PBI-0: التخصص يُطابَق بلا "ال" في رسالة المستخدم
check(
  'دكتور اسنان (بلا ال) يطابق تخصص الأسنان',
  classify(normalizeSimple('دكتور اسنان'), SPECIALTIES).type,
  'search',
);
{
  const r = classify(normalizeSimple('دكتور اسنان'), SPECIALTIES);
  check('تخصص مُستخرَج فعلاً رغم غياب ال', !!r.matchedSpecialty, true);
}

// PBI-1: تخصص + مدينة بلا فترة/يوم ⇒ schedule_query لا بحث عام يتجاهل المدينة
{
  const r = classify(normalizeSimple('دكتور اسنان في تريم'), SPECIALTIES);
  check('تخصص+مدينة بلا فترة ⇒ schedule_query', r.type, 'schedule_query');
  check('المدينة المستخرَجة = تريم', r.cityQuery, 'تريم');
}

// جدول عيديد مساءً (السيناريو الحيّ الأصلي)
{
  const r = classify(normalizeSimple('اريد جدول اعمال لتخصص الاسنان في منطقة عيديد مساء'), SPECIALTIES);
  check('جدول تخصص+مدينة+فترة ⇒ schedule_query', r.type, 'schedule_query');
  check('الفترة = مسائية', r.period, 'evening');
  check('المدينة = عيديد', r.cityQuery, 'عيديد');
}

// "المرفق" (بأداة التعريف) يُسقَط عند بناء facilityQuery
{
  const fq = stripSimpleWords(normalizeSimple('مواعيد هذا المرفق'), [...FALLBACK_NOISE_WORDS, ...FALLBACK_SCHEDULE_WORDS, ...FALLBACK_FACILITY_WORDS, ...FALLBACK_BOOKING_WORDS]);
  check('"المرفق" يُسقَط رغم أداة التعريف', fq, 'هذا');
  check('"هذا" وحدها = إشارة صرفة', isPureReference(fq), true);
}

// سلسلة بحث فيها ضجيج غير معروف ("لماذا... غير موجودة") تُختصَر آلياً
// لآخر خطوة (اسم المرفق وحده) — الاختبار هنا على النتيجة النهائية للتقصير
// المطبَّق في resolveFacilityQuery (محاكاة: نفس منطق إسقاط الكلمة الأخيرة).
{
  const fq = stripSimpleWords(normalizeSimple('لماذا مواعيد عيادة الاصيلة غير موجوده'), [...FALLBACK_NOISE_WORDS, ...FALLBACK_SCHEDULE_WORDS, ...FALLBACK_FACILITY_WORDS, ...FALLBACK_BOOKING_WORDS]);
  check('كلمات الضجيج (لماذا/غير/موجوده) تُسقَط', fq, 'الاصيله');
}

// نصّ بحث حرّ يُنظَّف بإملائه الأصلي لا المطبَّع — "هل" و"في" فقط تُسقَطان
check(
  'stripNoiseWordsKeepOriginal يحافظ على إملاء الاسم',
  stripNoiseWordsKeepOriginal('هل عيادة السري في عيديد', FALLBACK_NOISE_WORDS),
  'عيادة السري عيديد',
);

// "مساء الخير" تحيّة لا طلب فترة
check('"مساء الخير" ≠ طلب فترة', detectPeriod(normalizeSimple('مساء الخير')), null);
check('"اريد جدول اسنان مساء" = طلب فترة مسائية', detectPeriod(normalizeSimple('اريد جدول اسنان مساء')), 'evening');

// ─────────────────────────── Sprint 2 ───────────────────────────

// PBI-2: "مواعيد د. فلان" — لقب "د." المفرد يُكتشف بحدود الكلمة لا substring
{
  const r = classify(normalizeSimple('مواعيد د. عبدالرحمن السري'), SPECIALTIES);
  check('"مواعيد د. فلان" ⇒ doctor_schedules', r.type, 'doctor_schedules');
  check('اسم الطبيب مُستخرَج بلا "د."', r.doctorQuery, 'عبدالرحمن السري');
}
{
  const r = classify(normalizeSimple('مواعيد الدكتور عبدالرحمن'), SPECIALTIES);
  check('"مواعيد الدكتور فلان" ⇒ doctor_schedules', r.type, 'doctor_schedules');
}
{
  // "مواعيد د. فلان في مستشفى كذا" (طبيب + مرفق معاً) تبقى facility_doctors
  // — الأسبقية القائمة لم تتغيّر، لقب "د." لا يكسرها.
  const r = classify(normalizeSimple('اطباء د. مستشفى الحاوي'), SPECIALTIES);
  check('طبيب+مرفق معاً يبقى facility_doctors', r.type, 'facility_doctors');
}

// PBI-3: أسئلة إجرائية لا تُخطَف كطلب حجز عام رغم كلمة "حجز"
check('"كيف احجز؟" ⇒ faq لا booking_generic', classify(normalizeSimple('كيف احجز؟'), SPECIALTIES).type, 'faq');
check('"هل الحجز مجاني" ⇒ faq', classify(normalizeSimple('هل الحجز مجاني'), SPECIALTIES).type, 'faq');
check('"ما هي سندك الطبي" ⇒ faq', classify(normalizeSimple('ما هي سندك الطبي'), SPECIALTIES).type, 'faq');
check('سؤال عن مرفقٍ بعينه لا يُخطَف كـfaq رغم "متى"', classify(normalizeSimple('متى مواعيد عيادة السري'), SPECIALTIES).type !== 'faq', true);

if (failures > 0) {
  console.error(`\n${failures} اختباراً فشل.`);
  process.exit(1);
} else {
  console.log('\nكل الاختبارات نجحت.');
}
