// قوالب الردّ الحتمية لمساعد سندك الطبي المحلي.
//
// كل ردّ نصّ Markdown. عند تعدّد الخصائص لكل عنصر ⇒ جدول Markdown (القاعدة ٥
// في SYSTEM_PROMPT). الروابط دائماً [الاسم](الرابط) عبر safeLink فقط — لا
// رابط خام ولا نطاق غير مسموح.

const ALLOWED_LINK_HOSTS = new Set(['snadk.codeysaa.com']);

// يبني رابطاً موثوقاً أو يعيد null (فيُعرض الاسم بلا رابط بدل كتابة نطاق مشبوه).
export function safeLink(baseUrl, path) {
  try {
    const u = new URL(path, baseUrl);
    if (u.protocol !== 'https:' || !ALLOWED_LINK_HOSTS.has(u.host)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function nameCell(baseUrl, path, name) {
  const safeName = String(name || '').replace(/[|\]\[]/g, ' ').trim() || '—';
  const href = safeLink(baseUrl, path);
  return href ? `[${safeName}](${href})` : safeName;
}

const yes = (b) => (b ? 'متاح' : 'غير متاح');

export const FIXED = {
  ask: 'اكتب سؤالك — أقدر أساعدك في البحث عن طبيب أو مرفق أو تخصص أو مخيم طبي، وفي إرشادك لخطوات الحجز.',
  outOfScope:
    'هذا خارج نطاق مساعد سندك الطبي. أقدر أساعدك فقط في: البحث عن طبيب أو مرفق صحّي أو تخصّص، ومعرفة المخيمات الطبية، وإرشادك لخطوات الحجز عبر الموقع.',
  lowConfidence:
    'ما وضح لي طلبك تماماً. جرّب صياغة أخرى — مثلاً «دكتور أطفال في صنعاء» أو «مستشفيات في عدن» أو «التخصصات المتاحة».',
  greeting:
    'أهلاً بك في مساعد سندك الطبي. أساعدك في البحث عن الأطباء والمرافق الصحّية والتخصّصات والمخيمات الطبية على المنصة، وأرشدك لخطوات الحجز. بماذا تبدأ؟',
  bookingHelp:
    'الحجز يتم عبر الموقع لا عبري: افتح صفحة الطبيب أو المرفق، ثم اختر الجدول والتاريخ وأكمل الحجز. أخبرني عن التخصص أو المدينة لأدلّك على الطبيب المناسب.',
  paymentHelp:
    'الدفع الفعلي يمرّ فقط عبر صفحة الموعد بعد إنشائه في الموقع. إن لم تظهر لك صفحة الدفع، تأكّد أنك أنشأت الموعد أولاً ثم افتحه من «مواعيدي».',
  noResults:
    'لا توجد نتائج مطابقة حالياً على المنصة. جرّب اسماً أعمّ (التخصص وحده، أو المدينة وحدها).',
  noSchedules:
    'لم أجد جدول دوام منشوراً لهذا المرفق/الطبيب حالياً. تواصل معه مباشرة إن توفّر رقمه في صفحته.',
  retrieveError:
    'تعذّر البحث الآن. حاول بعد لحظات.',
};

export function renderDoctors(baseUrl, doctors) {
  if (!doctors.length) return '';
  const rows = doctors.map((m) => {
    const f = m.fields || {};
    const rating = typeof f.rating === 'number' ? f.rating.toFixed(1) : '—';
    return `| ${nameCell(baseUrl, `/doctor/${m.entity_id}`, f.name)} | ${rating} | ${yes(m.booking_enabled)} |`;
  });
  return ['**أطباء مطابقون:**', '', '| الطبيب | التقييم | الحجز الإلكتروني |', '|---|---|---|', ...rows].join('\n');
}

export function renderFacilities(baseUrl, facilities) {
  if (!facilities.length) return '';
  const rows = facilities.map((m) => {
    const f = m.fields || {};
    const loc = [f.city, f.directorate].filter(Boolean).join(' - ') || '—';
    return `| ${nameCell(baseUrl, `/facility/${m.entity_id}`, f.name)} | ${f.type || '—'} | ${loc} | ${yes(m.booking_enabled)} |`;
  });
  return ['**مرافق مطابقة:**', '', '| المرفق | النوع | الموقع | الحجز الإلكتروني |', '|---|---|---|---|', ...rows].join('\n');
}

export function renderSpecialties(specialties) {
  if (!specialties.length) return '';
  const items = specialties.map((m) => {
    const f = m.fields || {};
    return `- ${f.arabic_name || f.name || (m.snapshot || '').split(' | ')[0] || '—'}`;
  });
  return ['**تخصّصات مطابقة:**', '', ...items].join('\n');
}

export function renderCamps(baseUrl, camps) {
  if (!camps.length) return '';
  const rows = camps.map((m) => {
    const f = m.fields || {};
    const when = [f.start_date, f.end_date].filter(Boolean).join(' ← ') || '—';
    return `| ${nameCell(baseUrl, `/camp/${m.entity_id}`, f.title)} | ${f.city || '—'} | ${when} | ${f.is_free ? 'مجاني' : '—'} |`;
  });
  return ['**مخيمات طبية:**', '', '| المخيم | المدينة | التاريخ | التكلفة |', '|---|---|---|---|', ...rows].join('\n');
}

// جدولات العيادة (متعدّد الخطوات — القاعدة ٥): طبيب/مرفق/أيام/فترة.
export function renderSchedules(baseUrl, rows) {
  if (!Array.isArray(rows) || !rows.length) return FIXED.noSchedules;
  const dayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const seen = new Set();
  const lines = [];
  for (const r of rows) {
    const doc = r.doctors || r.doctor || {};
    const fac = r.facilities || r.facility || {};
    const docId = r.doctor_id || doc.id || '';
    const key = `${docId}|${r.period || ''}|${(r.working_days || []).join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const days = Array.isArray(r.working_days)
      ? r.working_days.map((d) => dayNames[d] ?? d).join('، ')
      : '—';
    const period = r.period === 'evening' ? 'مسائي' : r.period === 'morning' ? 'صباحي' : (r.period || '—');
    const time = r.start_time ? String(r.start_time).slice(0, 5) : '';
    const docCell = docId
      ? nameCell(baseUrl, `/doctor/${docId}`, doc.name || 'طبيب')
      : (doc.name || 'طبيب');
    lines.push(`| ${docCell} | ${fac.name || '—'} | ${days}${time ? ' ' + time : ''} | ${period} | ${yes(r.booking_enabled)} |`);
  }
  if (!lines.length) return FIXED.noSchedules;
  return ['**جدول الدوام:**', '', '| الطبيب | المرفق | الأيام | الفترة | الحجز الإلكتروني |', '|---|---|---|---|---|', ...lines].join('\n');
}

// يجمّع مطابقات الاسترجاع في ردّ واحد حسب النوع.
export function renderMatches(baseUrl, matches) {
  const byType = { doctor: [], facility: [], specialty: [], camp: [] };
  for (const m of matches) (byType[m.entity_type] || (byType[m.entity_type] = [])).push(m);

  const sections = [
    renderDoctors(baseUrl, byType.doctor),
    renderFacilities(baseUrl, byType.facility),
    renderSpecialties(byType.specialty),
    renderCamps(baseUrl, byType.camp),
  ].filter(Boolean);

  if (!sections.length) return FIXED.noResults;
  return sections.join('\n\n');
}
