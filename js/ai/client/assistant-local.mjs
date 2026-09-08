// ═══ مساعد سندك الطبي — الطبقة المحلية الحتمية (المرحلتان ١ + ٢) ═══
//
// تعمل بالكامل في متصفّح الزائر:
//   ١) تُضمّن السؤال محلياً عبر transformers.js — **النصّ لا يغادر الجهاز**.
//   ٢) تصنّف النيّة برأس خطّي صغير (intent_head.json).
//   ٣) تستخرج الكيانات (تخصص/مدينة/اسم) حتمياً من المعجم المشترك (المرحلة ٢).
//   ٤) خارج النطاق / ثقة منخفضة بلا كيانات ⇒ ردّ ثابت، بلا أي طلب شبكي.
//   ٥) نيّة «جدول العيادة» + مرفق/طبيب ⇒ خطوتان: حلّ المعرّف عبر الاسترجاع،
//      ثم get-clinic-schedules، ثم جدول Markdown حتمي.
//   ٦) بقيّة نيّات البحث ⇒ الاسترجاع بالمتجه + تلميح المدينة، ثم قوالب.
//   ٧) متابعة قصيرة («الثاني»، «رقمه») ⇒ تُخدَم من النتيجة السابقة بلا استدعاء.
//
// لا توليد. لا يُذكر كيان/رقم/رابط لم يأتِ من نتيجة أداة.

import {
  entityTypesForIntent,
  looksLikeFollowUp,
  normalizeArabic,
  ordinalIndex,
} from './normalize.mjs';
import { FIXED, renderMatches, renderSchedules } from './templates.mjs';
import { extractEntities } from '../nlu/entities.mjs';

const DEFAULTS = {
  retrievePath: '/functions/v1/assistant-retrieve',
  schedulesPath: '/functions/v1/get-clinic-schedules',
  publicStatsPath: '/functions/v1/get-public-stats',
  transformersUrl: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2',
  modelId: 'Xenova/multilingual-e5-small',
  maxInputChars: 500,
  minInputChars: 2,
  linkBaseUrl: 'https://snadk.codeysaa.com',
  matchLimit: 6,
  retrieveTimeoutMs: 8000,
};

const CANNED = {
  greeting: FIXED.greeting,
  booking_help: FIXED.bookingHelp,
  payment_help: FIXED.paymentHelp,
  out_of_scope: FIXED.outOfScope,
};

export function createLocalAssistant(userOptions = {}) {
  const opt = { ...DEFAULTS, ...userOptions };
  if (!opt.supabaseUrl || !opt.supabaseAnonKey || !opt.anonId) {
    throw new Error('createLocalAssistant: supabaseUrl و supabaseAnonKey و anonId مطلوبة');
  }

  let extractorPromise = null;
  let intentHead = null;
  let intentHeadPromise = null;
  let lastResult = null; // { intent, matches, slots } — لخدمة المتابعة القصيرة

  async function loadExtractor() {
    if (!extractorPromise) {
      extractorPromise = (async () => {
        const tf = await import(/* @vite-ignore */ opt.transformersUrl);
        tf.env.allowLocalModels = false;
        return tf.pipeline('feature-extraction', opt.modelId, { quantized: true });
      })();
    }
    return extractorPromise;
  }

  async function loadIntentHead() {
    if (intentHead) return intentHead;
    if (!opt.intentHeadUrl) return null;
    if (!intentHeadPromise) {
      intentHeadPromise = fetch(opt.intentHeadUrl, { cache: 'force-cache' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
    }
    intentHead = await intentHeadPromise;
    return intentHead;
  }

  async function embed(text) {
    const extractor = await loadExtractor();
    const out = await extractor(`query: ${text}`, { pooling: 'mean', normalize: true });
    return Array.from(out.data);
  }

  function classifyIntent(vec) {
    const head = intentHead;
    if (!head || !Array.isArray(head.coef)) return { intent: null, confidence: 0, minConfidence: 0.45 };
    const { coef, intercept, classes } = head;
    const logits = coef.map((row, c) => {
      let s = intercept[c] || 0;
      for (let i = 0; i < row.length; i++) s += row[i] * vec[i];
      return s;
    });
    const max = Math.max(...logits);
    const exps = logits.map((z) => Math.exp(z - max));
    const sum = exps.reduce((a, b) => a + b, 0);
    let bestIdx = 0;
    for (let i = 1; i < exps.length; i++) if (exps[i] > exps[bestIdx]) bestIdx = i;
    return { intent: classes[bestIdx], confidence: exps[bestIdx] / sum, minConfidence: head.min_confidence ?? 0.45 };
  }

  function authHeaders() {
    return {
      'Content-Type': 'application/json',
      apikey: opt.supabaseAnonKey,
      Authorization: `Bearer ${opt.supabaseAnonKey}`,
    };
  }

  async function retrieve(vec, intent, types, slots = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opt.retrieveTimeoutMs);
    try {
      const res = await fetch(`${opt.supabaseUrl}${opt.retrievePath}`, {
        method: 'POST',
        signal: controller.signal,
        headers: authHeaders(),
        body: JSON.stringify({
          anon_id: opt.anonId,
          embedding: vec, // ← المتجه فقط، لا نصّ
          intent: intent || undefined,
          types: types || undefined,
          city: slots.city || undefined,
          specialty: slots.specialty || undefined,
          limit: opt.matchLimit,
        }),
      });
      if (!res.ok) return { ok: false, matches: [] };
      const body = await res.json().catch(() => null);
      return { ok: !!body?.success, matches: body?.data?.matches ?? [] };
    } catch {
      return { ok: false, matches: [] };
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchSchedules({ facilityId, doctorId }) {
    const qs = facilityId ? `facility_id=${encodeURIComponent(facilityId)}` : `doctor_id=${encodeURIComponent(doctorId)}`;
    try {
      const res = await fetch(`${opt.supabaseUrl}${opt.schedulesPath}?${qs}`, { headers: authHeaders() });
      const body = await res.json().catch(() => null);
      return Array.isArray(body?.data) ? body.data : [];
    } catch {
      return [];
    }
  }

  async function publicStats() {
    try {
      const res = await fetch(`${opt.supabaseUrl}${opt.publicStatsPath}`, { headers: authHeaders() });
      const d = (await res.json().catch(() => null))?.data || {};
      const parts = [];
      if (d.doctors != null) parts.push(`الأطباء: ${d.doctors}`);
      if (d.facilities != null) parts.push(`المرافق: ${d.facilities}`);
      if (d.cities != null) parts.push(`المدن: ${d.cities}`);
      return parts.length ? `إحصاءات المنصة — ${parts.join(' · ')}.` : FIXED.retrieveError;
    } catch {
      return FIXED.retrieveError;
    }
  }

  // متعدّد الخطوات: اسم مرفق/طبيب ⇒ حلّ المعرّف بالاسترجاع ⇒ جلب الجدولات.
  async function clinicScheduleFlow(vec, slots) {
    const wantFacility = !!slots.facility_name;
    const types = wantFacility ? ['facility'] : ['doctor'];
    const { ok, matches } = await retrieve(vec, 'clinic_schedule', types, { city: slots.city });
    if (!ok || !matches.length) return null;
    const top = matches[0];
    const rows = await fetchSchedules(
      wantFacility ? { facilityId: top.entity_id } : { doctorId: top.entity_id },
    );
    return renderSchedules(opt.linkBaseUrl, rows);
  }

  async function warmUp() {
    await Promise.all([loadExtractor(), loadIntentHead()]);
  }

  async function ask(rawText) {
    const startedAt = Date.now();
    const text = String(rawText ?? '').trim().slice(0, opt.maxInputChars);
    if (text.length < opt.minInputChars) {
      return { reply: FIXED.ask, intent: null, confidence: 0, matches: [], outcome: 'ask' };
    }

    // متابعة قصيرة تشير لنتيجة سابقة: اختر عنصراً بالترتيب بلا استدعاء جديد.
    if (lastResult?.matches?.length && looksLikeFollowUp(text)) {
      const idx = ordinalIndex(text);
      const pick = idx >= 0 ? lastResult.matches[idx] : lastResult.matches[0];
      if (pick) {
        return {
          reply: renderMatches(opt.linkBaseUrl, [pick]),
          intent: lastResult.intent,
          confidence: 1,
          matches: [pick],
          outcome: 'answered',
          followUp: true,
        };
      }
    }

    await loadIntentHead();
    const slots = await extractEntities(text);
    const vec = await embed(normalizeArabic(text) || text);
    const { intent, confidence, minConfidence } = classifyIntent(vec);

    // «خارج النطاق» يُحسم أوّلاً ولا يتجاوزه سلّم الكيانات: سؤال طبّي فيه اسم
    // مدينة يبقى خارج النطاق. عتبة 0.30 تكفي لتمييزه عن ضجيج التصنيف.
    if (intent === 'out_of_scope' && confidence >= 0.30) {
      return { reply: CANNED.out_of_scope, intent, confidence, matches: [], outcome: 'out_of_scope' };
    }

    // سلّم احتياطي: كيانات واضحة تُبقي الطلب داخل النطاق حتى لو ترنّح المصنِّف.
    let eff = intent;
    const weak = !intent || confidence < minConfidence;
    if (weak && (slots.facility_name || slots.doctor_name)) eff = 'clinic_schedule';
    else if (weak && (slots.specialty || slots.city)) eff = 'search_doctor';
    else if (weak) eff = null;

    if (eff === 'out_of_scope') {
      return { reply: CANNED.out_of_scope, intent, confidence, matches: [], outcome: 'out_of_scope' };
    }
    if (!eff) {
      return { reply: FIXED.lowConfidence, intent, confidence, matches: [], outcome: 'low_confidence' };
    }
    if (eff in CANNED) {
      return { reply: CANNED[eff], intent: eff, confidence, matches: [], outcome: 'answered' };
    }
    if (eff === 'platform_stats') {
      return { reply: await publicStats(), intent: eff, confidence, matches: [], outcome: 'answered' };
    }

    // متعدّد الخطوات لجدول العيادة.
    if (eff === 'clinic_schedule' && (slots.facility_name || slots.doctor_name)) {
      const scheduleReply = await clinicScheduleFlow(vec, slots);
      if (scheduleReply) {
        return { reply: scheduleReply, intent: eff, confidence, matches: [], outcome: 'answered', multiStep: true, latencyMs: Date.now() - startedAt };
      }
      // فشل الحلّ ⇒ استرجاع عاديّ أدناه.
    }

    const types = entityTypesForIntent(eff);
    const { ok, matches } = await retrieve(vec, eff, types, slots);
    if (!ok) return { reply: FIXED.retrieveError, intent: eff, confidence, matches: [], outcome: 'error' };
    if (!matches.length) return { reply: FIXED.noResults, intent: eff, confidence, matches: [], outcome: 'no_match' };

    lastResult = { intent: eff, matches, slots };
    return {
      reply: renderMatches(opt.linkBaseUrl, matches),
      intent: eff,
      confidence,
      matches,
      slots,
      outcome: 'answered',
      latencyMs: Date.now() - startedAt,
    };
  }

  return { warmUp, ask, _internals: { embed, classifyIntent, retrieve, extractEntities } };
}
