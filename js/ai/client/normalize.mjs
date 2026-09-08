// تطبيع عربي — **نسخة طبق الأصل** من normalizeArabic في
// supabase/functions/ai-assistant/index.ts ومن normalize_ar في
// ai/embeddings/text_builders.py. أي تعديل هنا يجب أن يُنسخ للثلاثة معاً.

export function normalizeArabic(text) {
  if (!text) return '';
  return String(text)
    .normalize('NFKC')
    .replace(/[ً-ٰ]/g, '') // تشكيل
    .replace(/[إأآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// ── متابعة المحادثة (follow-up) ──
// كشف إشارة ترتيبية («الثاني»، «الأول»...) لاختيار عنصر من نتيجة سابقة.
const ORDINALS = {
  'الاول': 0, 'الاولى': 0, 'اول': 0, 'الاولي': 0,
  'الثاني': 1, 'الثانيه': 1, 'ثاني': 1,
  'الثالث': 2, 'الثالثه': 2, 'ثالث': 2,
  'الرابع': 3, 'رابع': 3,
  'الخامس': 4, 'خامس': 4,
};

export function ordinalIndex(text) {
  const n = normalizeArabic(text);
  for (const [k, v] of Object.entries(ORDINALS)) {
    if (new RegExp(`(?:^|\\s)${k}(?:\\s|$)`).test(n)) return v;
  }
  return -1;
}

// جملة قصيرة تشير لنتيجة سابقة أكثر من كونها طلباً جديداً.
export function looksLikeFollowUp(text) {
  const n = normalizeArabic(text);
  const words = n.split(' ').filter(Boolean);
  if (words.length > 7) return false;
  return /(?:^|\s)(نفس|وهو|وهي|والدكتور|والمستشفى|كمان|غيره|الثاني|الثالث|الرابع|الاول|رقمه|جواله|وين يقع|متى يداوم)(?:\s|$)/.test(n);
}

// تسمية النيّة ← أنواع الكيانات (مطابق entityTypesForIntent في دالة الحافة).
export function entityTypesForIntent(intent) {
  switch (intent) {
    case 'search_doctor':
    case 'clinic_schedule':
      return ['doctor', 'facility'];
    case 'search_facility':
      return ['facility'];
    case 'list_specialties':
      return ['specialty'];
    case 'list_camps':
      return ['camp'];
    default:
      return null;
  }
}
