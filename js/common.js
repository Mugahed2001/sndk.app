// أدوات مشتركة بين كل صفحات الموقع — تفادياً لنسخٍ متطابقة متفرّقة.

/// إفلاتٌ آمن من HTML — كل نصّ مصدره الخادم (اسم مرفق، ملاحظة مريض، عنوان
/// مخيم…) يمرّ من هنا قبل أن يدخل `innerHTML`. البديل عن نصٍّ حرفي داخل
/// القالب هو استثناءٌ في الحقن (XSS) في اللحظة التي يكتب فيها أحدٌ في حقلٍ
/// حرّ نصّاً يشبه HTML — ولو بلا نيّة.
function esc(s) {
  const div = document.createElement('div');
  div.textContent = s == null ? '' : String(s);
  return div.innerHTML;
}

function cleanPhone(p) {
  return (p || '').replace(/\s+/g, '');
}

/// نظير زر المشاركة في التطبيق — Web Share API حيث تتوفّر (الجوّال غالباً)،
/// ونسخٌ للحافظة كبديل (الحاسوب).
function shareLink(url, title) {
  if (navigator.share) {
    navigator.share({ title, url }).catch(() => {});
  } else {
    navigator.clipboard.writeText(url);
    alert('نُسخ الرابط.');
  }
}

/// أيقونات الاحتياط عند فشل تحميل صورة — بالاسم لا بترميز HTML خام في
/// خاصّية العنصر: تمرير SVG جاهز عبر `data-fallback="<svg ...>"` كان يحتاج
/// إفلاتاً من علامات التنصيص المزدوجة داخل الخاصّية نفسها، وأي إفلاتٍ ناقص
/// هناك يكسر الخاصّية لا يَحقن HTML — لكنه صنفٌ من الأخطاء يُغلَق بابه كلياً
/// بالتحويل إلى مفتاحٍ اسمي يُوسَّط في الشيفرة لا في نصّ الصفحة.
const SNDK_FALLBACK_ICONS = {
  hospital: () =>
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none">' +
    '<path d="M12 2L3 6.5V11.5C3 16.5 6.9 21.2 12 22.5C17.1 21.2 21 16.5 21 11.5V6.5L12 2Z" stroke="#0FA3BD" stroke-width="1.6"/>' +
    '<path d="M12 8V16M8 12H16" stroke="#0FA3BD" stroke-width="1.8" stroke-linecap="round"/></svg>',
  person: () => '<span style="font-size:20px;color:var(--primary);">👤</span>',
  camp: () =>
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none">' +
    '<path d="M3 21l9-15 9 15H3z" stroke="#0FA3BD" stroke-width="1.6" stroke-linejoin="round"/>' +
    '<path d="M12 6l6 15" stroke="#0FA3BD" stroke-width="1.6"/></svg>',
};

/// يُنادى بعد كل `innerHTML` يحمل صوراً بخاصّية `data-fallback-type`. عنصرٌ
/// واحد لا سكربتاً داخلياً في كل صف — يتوافق مع ترويسة `script-src 'self'`
/// الصارمة (`onerror="..."` كخاصّية HTML يُعامَل سكربتاً داخلياً أيضاً).
function wireImageFallbacks(root) {
  (root || document).querySelectorAll('img[data-fallback-type]').forEach((img) => {
    img.addEventListener('error', () => {
      const type = img.getAttribute('data-fallback-type');
      const parent = img.parentElement;
      if (parent && SNDK_FALLBACK_ICONS[type]) parent.innerHTML = SNDK_FALLBACK_ICONS[type]();
    }, { once: true });
  });
}

/// أدوات مشتركة بين camps.js (القائمة) وcamp.js (التفاصيل) — نظير مشتقّات
/// MedicalCamp في lib/models/medical_camp_model.dart بالحرف.

const CAMP_REASON_MESSAGES = {
  NO_REGISTRATION: 'لا حاجة للتسجيل في هذا المخيم',
  ENDED: 'انتهى هذا المخيم',
  FULL: 'اكتمل عدد المقاعد',
};

function dateOnly(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function campIsRunning(camp) {
  const today = dateOnly(new Date());
  return dateOnly(new Date(camp.start_date)) <= today && dateOnly(new Date(camp.end_date)) >= today;
}
function campIsUpcoming(camp) {
  return dateOnly(new Date(camp.start_date)) > dateOnly(new Date());
}
function campIsSingleDay(camp) {
  return dateOnly(new Date(camp.start_date)) === dateOnly(new Date(camp.end_date));
}
function campFullDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long' });
}
function campDateRange(camp) {
  return campIsSingleDay(camp)
    ? campFullDate(camp.start_date)
    : `${campFullDate(camp.start_date)} — ${campFullDate(camp.end_date)}`;
}
function campOrganizer(camp) {
  return (camp.facilities && camp.facilities.name) || camp.organizer_name || '';
}
function campCity(camp) {
  return [camp.city, camp.directorate].filter(Boolean).join(' • ');
}
function campIsFree(camp) { return camp.is_free !== false; }
function campRequiresRegistration(camp) { return camp.requires_registration !== false; }
function campAllowsGuest(camp) { return camp.allow_guest_registration === true; }
function campMaxCompanions(camp) { return Number.isInteger(camp.max_companions) ? camp.max_companions : 4; }
function campSpecialties(camp) {
  return (camp.medical_camp_specialties || [])
    .map((row) => row.specialties)
    .filter((s) => s && (s.arabic_name || s.name));
}

/// فترات الجدولة — نظير `ClinicPeriod` في التطبيق. facility.js وappointment.js
/// كلاهما يعرض بطاقة موعد بنفس التصنيف.
const PERIOD_LABELS = { morning: 'صباحية', evening: 'مسائية', fullDay: 'طوال اليوم' };

/// أسماء أيام العمل الكاملة — نظير `ScheduleDay` في التطبيق حرفياً: نفس
/// ترقيم التطبيق (السبت = 0 … الجمعة = 6)، لا ترقيم JS القياسي (Date.getDay
/// يبدأ بالأحد = 0). `schedule.working_days` يصل بهذا الترقيم من القاعدة.
const DAY_NAMES_AR = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
function workingDaysLabel(workingDays) {
  // الفاصل ' و ' لا فاصلة — نظير l10n.translate('and') المستعمل حرفياً في
  // ScheduleEntryCard.
  return (workingDays || [])
    .filter((d) => d >= 0 && d < DAY_NAMES_AR.length)
    .map((d) => DAY_NAMES_AR[d])
    .join(' و ');
}

/// نظائر Hex لمتغيرات CSS في :root — `var(--x)` لا يقبل لاحقة شفافية هكسا
/// (`var(--x)1F` قيمةٌ غير صالحة فيُسقِطها المتصفّح بصمت)، فحيثما احتجنا دمج
/// شفافية بلاحقة كهذه نستعمل القيمة الحرفية هنا بدل المتغيّر.
const SNDK_HEX = {
  primary: '#0A7B93',
  secondaryTeal: '#0FA3BD',
  accentPurple: '#667EEA',
  success: '#56AB2F',
  warning: '#FF9500',
  error: '#C62828',
  info: '#17A2B8',
  textMuted: '#718096',
};
