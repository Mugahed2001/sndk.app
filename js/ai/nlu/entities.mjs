// استخراج الكيانات — حتمي، قائمي، بلا نموذج. نظير entities.py (نفس المنطق).
// الحقول: specialty · city · doctor_name · facility_name.

import { normalizeArabic } from '../client/normalize.mjs';
import { cityIndex, specialtyIndex, specialtyWords } from './lexicon.mjs';

const DOCTOR_TRIGGERS = ['دكتوره', 'دكتور', 'الدكتوره', 'الدكتور', 'د', 'طبيب', 'طبيبه', 'استشاري', 'اخصائي'];
const FACILITY_STRONG = ['مستشفى', 'مستشفي', 'مشفى', 'مركز', 'مجمع', 'مستوصف'];
const FACILITY_WEAK = ['عياده', 'كلينك'];
const FACILITY_ALL = [...FACILITY_STRONG, ...FACILITY_WEAK];

const STOP = new Set([
  'في', 'من', 'الى', 'على', 'عند', 'قريب', 'قريبه', 'اقرب', 'افضل', 'احسن', 'شاطر', 'ممتاز',
  'كويس', 'زين', 'ابغى', 'ابي', 'اريد', 'عايز', 'ودي', 'محتاج', 'رشحلي', 'رشح', 'لي', 'لو',
  'سمحت', 'بلي', 'يكشف', 'يستقبل', 'حالات', 'يوم', 'الحين', 'الان', 'هنا', 'هذا', 'هذه',
  'منهو', 'منهي', 'وش', 'ايش', 'كم', 'متى', 'وين', 'كيف', 'و', 'او', 'مع', 'بعد', 'قبل',
  'صباحي', 'مسائي', 'الصبح', 'بكره', 'بكرا', 'غدا',
]);

const TOKEN_RE = /[^\s،.؟!/\\|]+/g;
const QUOTED_RE = /["«»“”']([^"«»“”']{2,40})["«»“”']/;
const PREFIXES = '(?:ال|بال|وال|لل|فال|كال)?';

function tokens(text) {
  return (text || '').match(TOKEN_RE) || [];
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function longestLexiconHit(normText, index) {
  let best = null;
  let bestLen = 0;
  for (const [form, canon] of index) {
    if (!form) continue;
    const re = new RegExp(`(?:^|\\s)${PREFIXES}${escapeRe(form)}(?:\\s|$)`);
    if (form.length > bestLen && re.test(normText)) {
      best = canon;
      bestLen = form.length;
    }
  }
  return best;
}

function stripAl(w) {
  return w.startsWith('ال') && w.length > 4 ? w.slice(2) : w;
}

function nameAfterTrigger(toks, ntok, triggers, specIdx, cityIdx, specWords, maxWords = 3) {
  for (let i = 0; i < ntok.length; i++) {
    const t = ntok[i];
    if (!(triggers.includes(t) || (t === 'د' && i + 1 < ntok.length))) continue;
    const picked = [];
    for (let j = i + 1; j < Math.min(i + 1 + maxWords, toks.length); j++) {
      const nj = ntok[j];
      if (!nj || STOP.has(nj) || cityIdx.has(nj) || cityIdx.has(stripAl(nj))) break;
      if (specIdx.has(nj) || specIdx.has(stripAl(nj)) || specWords.has(nj) || specWords.has(stripAl(nj))) break;
      if (DOCTOR_TRIGGERS.includes(nj) || FACILITY_ALL.includes(nj)) break;
      picked.push(toks[j]);
    }
    if (picked.length) return picked.join(' ').trim();
  }
  return null;
}

export async function extractEntities(text) {
  text = (text || '').trim();
  const norm = normalizeArabic(text);
  const toks = tokens(text);
  const ntok = toks.map((t) => normalizeArabic(t));
  const [specIdx, cityIdx, specWords] = await Promise.all([specialtyIndex(), cityIndex(), specialtyWords()]);

  const out = {};

  const sp = longestLexiconHit(norm, specIdx);
  if (sp) out.specialty = sp;

  const ct = longestLexiconHit(norm, cityIdx);
  if (ct) out.city = ct;

  const quoted = QUOTED_RE.exec(text);
  if (quoted) {
    const phrase = quoted[1].trim();
    const pre = normalizeArabic(text.slice(0, quoted.index)).split(' ').slice(-3);
    if (pre.some((w) => DOCTOR_TRIGGERS.includes(w))) out.doctor_name = phrase;
    else if (FACILITY_ALL.some((tr) => norm.includes(tr))) out.facility_name = phrase;
    else out.doctor_name = phrase;
  }

  if (!out.doctor_name) {
    const dn = nameAfterTrigger(toks, ntok, DOCTOR_TRIGGERS, specIdx, cityIdx, specWords);
    if (dn) out.doctor_name = dn;
  }
  if (!out.facility_name) {
    const fn =
      nameAfterTrigger(toks, ntok, FACILITY_STRONG, specIdx, cityIdx, specWords) ||
      nameAfterTrigger(toks, ntok, FACILITY_WEAK, specIdx, cityIdx, specWords);
    if (fn) out.facility_name = fn;
  }

  return out;
}
