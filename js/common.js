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

const SNDK_PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.code_yemen.snd_health';

/// رابط زرّ «حمّل التطبيق»: على أندرويد يُحوَّل عبر `intent://` إلى فتح
/// التطبيق نفسه إن كان مثبَّتاً — `/facility/` مسارٌ مُتحقَّقٌ فعلياً في
/// `AndroidManifest.xml` (autoVerify) فيكفي وحده لإطلاق الالتقاط، وبلا
/// معرّف بعده يرفضه محلّل الروابط العميقة بصمتٍ فيبقى التطبيق على شاشته
/// المعتادة — لا حاجة لمسارٍ جديد تحديداً لهذا الزر. غير أندرويد
/// (iOS/سطح مكتب) لا يفهم `intent://` أصلاً فيبقى الرابط رابط المتجر مباشرة،
/// و`browser_fallback_url` يتكفّل بالمتجر إن لم يكن التطبيق مثبتاً على أندرويد.
function sndkAppOrStoreUrl() {
  if (!/Android/i.test(navigator.userAgent)) return SNDK_PLAY_STORE_URL;
  const fallback = encodeURIComponent(SNDK_PLAY_STORE_URL);
  return `intent://sndk-codey.onrender.com/facility/#Intent;scheme=https;package=com.code_yemen.snd_health;S.browser_fallback_url=${fallback};end`;
}

/// ورقة سفلية مشتركة — نظير openModal/closeModal الخاصّتين سابقاً بـ
/// SndkBooking وحدها. صارتا هنا كي تستعملهما صفحاتٌ لا تحمّل booking.js
/// أصلاً (القائمة الجانبية مثلاً) بلا تكرار نفس المنطق. عنصرٌ واحدٌ مفتوحٌ
/// في كل لحظة — فتح ثانٍ يُغلق الأول، كنافذة نظام حقيقية.
let sndkOverlayEl = null;
function sndkCloseModal() {
  if (sndkOverlayEl) {
    sndkOverlayEl.remove();
    sndkOverlayEl = null;
  }
}
function sndkOpenModal(innerHtml) {
  sndkCloseModal();
  sndkOverlayEl = document.createElement('div');
  sndkOverlayEl.className = 'modal-overlay';
  sndkOverlayEl.innerHTML = `<div class="modal-sheet"><div class="modal-handle"></div>${innerHtml}</div>`;
  sndkOverlayEl.addEventListener('click', (e) => {
    if (e.target === sndkOverlayEl) sndkCloseModal();
  });
  document.body.appendChild(sndkOverlayEl);
  return sndkOverlayEl.querySelector('.modal-sheet');
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
  hospital: (size = 26) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">` +
    '<path d="M12 2L3 6.5V11.5C3 16.5 6.9 21.2 12 22.5C17.1 21.2 21 16.5 21 11.5V6.5L12 2Z" stroke="var(--primary)" stroke-width="1.6"/>' +
    '<path d="M12 8V16M8 12H16" stroke="var(--primary)" stroke-width="1.8" stroke-linecap="round"/></svg>',
  person: (size = 24) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">` +
    '<circle cx="12" cy="8" r="4" stroke="var(--primary)" stroke-width="1.6"/>' +
    '<path d="M4.5 20c0-4.1 3.4-7 7.5-7s7.5 2.9 7.5 7" stroke="var(--primary)" stroke-width="1.6" stroke-linecap="round"/></svg>',
  camp: (size = 26) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">` +
    '<path d="M3 21l9-15 9 15H3z" stroke="var(--primary)" stroke-width="1.6" stroke-linejoin="round"/>' +
    '<path d="M12 6l6 15" stroke="var(--primary)" stroke-width="1.6"/></svg>',
};

/// أيقونات عامّة — بديل الرموز التعبيرية (emoji) في كل أنحاء الموقع: خطٌّ
/// واحدٌ متّسق (24×24، stroke لا fill) نظير أسلوب أيقونات Material المُخطَّطة
/// المستعملة في التطبيق (`_outlined`)، لا رموزٌ تختلف رسمتها بين نظام وآخر
/// وتبدو ارتجالية. `size` بالبكسل، و`color` افتراضياً `var(--primary)` —
/// لون واحد لهوية الموقع لا ترميز دلالي بالألوان (أحمر للخطأ، أخضر للنجاح…)؛
/// السياق (نصّ التنبيه، خلفية البطاقة) هو ما يحمل الدلالة، لا الأيقونة.
/// يُمرَّر `currentColor` صراحةً فقط حين يجلس أيقونٌ على خلفية زرٍّ مصمَّت
/// (نصّها أبيض) — التبايُن هناك ضرورة قراءة لا خيار تصميم.
const SNDK_ICONS = {
  calendar: (size = 16, color = 'var(--primary)') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="17" rx="2" stroke="${color}" stroke-width="1.8"/><path d="M3 9h18M8 2v4M16 2v4" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  clock: (size = 16, color = 'var(--primary)') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="${color}" stroke-width="1.8"/><path d="M12 7v5l3.5 2" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  pin: (size = 16, color = 'var(--primary)') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"><path d="M12 21s-7-7.1-7-12a7 7 0 1114 0c0 4.9-7 12-7 12z" stroke="${color}" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="9" r="2.4" stroke="${color}" stroke-width="1.8"/></svg>`,
  building: (size = 16, color = 'var(--primary)') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"><rect x="5" y="3" width="14" height="18" rx="1" stroke="${color}" stroke-width="1.7"/><path d="M9 8h1.5M13.5 8H15M9 12h1.5M13.5 12H15M9 16h1.5M13.5 16H15" stroke="${color}" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  phone: (size = 16, color = 'var(--primary)') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"><path d="M6.6 10.8c1.3 2.6 3.6 4.9 6.6 6.6l2-2c.3-.3.7-.4 1.1-.3 1.1.4 2.3.5 3.5.5.7 0 1.2.5 1.2 1.2V20c0 .7-.5 1.2-1.2 1.2C10.4 21.2 2.8 13.6 2.8 4.8 2.8 4.1 3.3 3.6 4 3.6h3.3c.7 0 1.2.5 1.2 1.2 0 1.2.2 2.4.5 3.5.1.4 0 .8-.3 1.1l-2.4 2.4z" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  chat: (size = 16, color = 'var(--primary)') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"><path d="M21 11.5a8.5 8.5 0 01-12.4 7.6L4 20l1.1-4.2A8.5 8.5 0 1121 11.5z" stroke="${color}" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
  star: (size = 16, color = 'var(--primary)') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"><path d="M12 3l2.7 5.6 6.1.6-4.6 4.1 1.4 6-5.6-3.3-5.6 3.3 1.4-6-4.6-4.1 6.1-.6L12 3z" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  lock: (size = 16, color = 'var(--primary)') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="${color}" stroke-width="1.7"/><path d="M8 11V8a4 4 0 118 0v3" stroke="${color}" stroke-width="1.7"/></svg>`,
  blocked: (size = 16, color = 'var(--primary)') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="${color}" stroke-width="1.7"/><path d="M5.8 5.8l12.4 12.4" stroke="${color}" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  offline: (size = 16, color = 'var(--primary)') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"><path d="M3 3l18 18M8.5 16.3a5 5 0 017 0M5.3 12.9a10 10 0 013-2.3M19 12.9a10 10 0 00-2.4-1.8M12 20h.01" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  card: (size = 16, color = 'var(--primary)') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="13" rx="2" stroke="${color}" stroke-width="1.7"/><path d="M3 10h18" stroke="${color}" stroke-width="1.7"/></svg>`,
  gift: (size = 16, color = 'var(--primary)') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"><path d="M12 21s-7-4.35-9.5-8.5C.5 8.5 2.5 5 6 5c2 0 3.5 1.2 4 2.2C10.5 6.2 12 5 14 5c3.5 0 5.5 3.5 3.5 7.5C15 16.65 12 21 12 21z" stroke="${color}" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
  stethoscope: (size = 16, color = 'var(--primary)') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"><path d="M6 4v5a3 3 0 006 0V4M9 12v2.5a5 5 0 0010 0V11.5" stroke="${color}" stroke-width="1.7" stroke-linecap="round"/><circle cx="19" cy="9.5" r="2" stroke="${color}" stroke-width="1.7"/></svg>`,
  grid: (size = 16, color = 'var(--primary)') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7.5" height="7.5" rx="1.2" stroke="${color}" stroke-width="1.7"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.2" stroke="${color}" stroke-width="1.7"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.2" stroke="${color}" stroke-width="1.7"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.2" stroke="${color}" stroke-width="1.7"/></svg>`,
  tent: (size = 16, color = 'var(--primary)') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"><path d="M3 21l9-15 9 15H3z" stroke="${color}" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 6l6 15" stroke="${color}" stroke-width="1.7"/></svg>`,
  smartphone: (size = 16, color = 'var(--primary)') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"><rect x="7" y="2" width="10" height="20" rx="2" stroke="${color}" stroke-width="1.7"/><path d="M11 18h2" stroke="${color}" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  logout: (size = 16, color = 'var(--primary)') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 17l5-5-5-5M21 12H9" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  login: (size = 16, color = 'var(--primary)') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"><path d="M15 21h4a2 2 0 002-2V5a2 2 0 00-2-2h-4" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 17l5-5-5-5M15 12H3" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  download: (size = 16, color = 'var(--primary)') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"><path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  check: (size = 16, color = 'var(--primary)') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="${color}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  /// سهمٌ منحنٍ للأمام (نظير أيقونة المشاركة الكلاسيكية في فيسبوك/Gmail
  /// «forward») — لا سهم خارجٍ من صندوق (قُرئ «رفع» لا «مشاركة») ولا قلم
  /// (الخطأ الأصلي قبل هذا الإصلاح).
  share: (size = 16, color = 'var(--primary)') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"><path d="M15 14l5-5-5-5" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 20v-7a4 4 0 014-4h12" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  infinity: (size = 16, color = 'var(--primary)') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"><path d="M7 9a3.5 3.5 0 000 7c2 0 3.2-1.6 5-4.5S15 5 17 5a3.5 3.5 0 010 7c-2 0-3.2-1.6-5-4.5S9.5 9 7 9z" stroke="${color}" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
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

const FACILITY_TYPE_LABELS = {
  hospital: 'مستشفى', clinic: 'عيادة', medicalCenter: 'مركز طبي',
  medical_center: 'مركز طبي', laboratory: 'مختبر', pharmacy: 'صيدلية',
  radiology: 'أشعة', other: 'أخرى',
};

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
  textMuted: '#5D6B82', // مطابقٌ لـ--text-muted في app.css — انظر تعليقها لسبب القيمة.
};

/// هل يقبل هذا الحجز الإلكتروني — نظير BookingEntryButton في التطبيق بالحرف
/// (بوّابتاه الأوليان؛ الثالثة والرابعة — نشاط الجدولة وغياب الطبيب المؤقت —
/// مفروضتان أصلاً داخل استعلام get-clinic-schedules نفسه، فلا جدولة معطَّلة
/// تصل الواجهة أصلاً).
///
/// `bookingFacilityIds` من get-visitor-commercial-snapshot — `null`/`undefined`
/// يعني «الخادم بلا رأي»، فيُسمَح افتراضياً (نفس تساهل acceptsBooking في
/// visitor_commercial_service.dart). `facilityDoctorFlags` خريطة
/// doctor_id → booking_enabled من facility_doctors — غياب الصفّ يعني مسموحاً
/// أيضاً (نفس `row?['booking_enabled'] != false`).
function scheduleAcceptsBooking(schedule, bookingFacilityIds, facilityDoctorFlags) {
  if (bookingFacilityIds && !bookingFacilityIds.includes(schedule.facility_id)) return false;
  if (schedule.sub_facility && schedule.sub_facility.booking_enabled === false) return false;
  const flag = facilityDoctorFlags ? facilityDoctorFlags[schedule.doctor_id] : undefined;
  if (flag === false) return false;
  return true;
}

/// لقطة الاستحقاق التجاري — عامّة بلا توكن (verify_jwt=false)، نظير
/// VisitorCommercialService.cachedSnapshot. فشلٌ هنا لا يوقف الصفحة: يُعامَل
/// كـ«لا رأي» (null) فتبقى بوّابة facility_doctors وحدها فاعلة.
async function fetchBookingFacilityIds() {
  try {
    const data = await SndkApi.getData('get-visitor-commercial-snapshot');
    return Array.isArray(data && data.booking_facilities) ? data.booking_facilities : null;
  } catch (_) {
    return null;
  }
}

/// facility_doctors مقروءةٌ مباشرةً بمفتاح anon — لا عبر دالة حافة (الجدول
/// الوحيد بين ما تحتاجه هذه الصفحة المسموح بقراءته مباشرة؛ الباقي محجوبٌ
/// عمداً عن anon وله دوالّ get-* مخصّصة). استعلامٌ دفعي واحد لكل أطباء
/// المرفق بدل نداء لكل جدولة.
async function fetchFacilityDoctorFlags(facilityId, doctorIds) {
  const ids = [...new Set((doctorIds || []).filter(Boolean))];
  if (ids.length === 0) return {};
  try {
    const base = window.SNDK_CONFIG.SUPABASE_URL.replace(/\/+$/, '');
    const url = `${base}/rest/v1/facility_doctors`
      + `?facility_id=eq.${encodeURIComponent(facilityId)}`
      + `&doctor_id=in.(${ids.map(encodeURIComponent).join(',')})`
      + `&select=doctor_id,booking_enabled`;
    const response = await fetch(url, {
      headers: {
        apikey: window.SNDK_CONFIG.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${window.SNDK_CONFIG.SUPABASE_ANON_KEY}`,
      },
    });
    if (!response.ok) return {};
    const rows = await response.json();
    const flags = {};
    for (const row of rows) flags[row.doctor_id] = row.booking_enabled !== false;
    return flags;
  } catch (_) {
    return {};
  }
}

/// نظير fetchFacilityDoctorFlags بالطرفين معكوسين — طبيبٌ واحد عبر عدّة
/// مرافق (صفحة ملف الطبيب)، بدل مرفقٍ واحد عبر عدّة أطباء (صفحة المرفق).
/// المفتاح المُعاد facility_id لا doctor_id.
async function fetchDoctorFacilityFlags(doctorId, facilityIds) {
  const ids = [...new Set((facilityIds || []).filter(Boolean))];
  if (ids.length === 0) return {};
  try {
    const base = window.SNDK_CONFIG.SUPABASE_URL.replace(/\/+$/, '');
    const url = `${base}/rest/v1/facility_doctors`
      + `?doctor_id=eq.${encodeURIComponent(doctorId)}`
      + `&facility_id=in.(${ids.map(encodeURIComponent).join(',')})`
      + `&select=facility_id,booking_enabled`;
    const response = await fetch(url, {
      headers: {
        apikey: window.SNDK_CONFIG.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${window.SNDK_CONFIG.SUPABASE_ANON_KEY}`,
      },
    });
    if (!response.ok) return {};
    const rows = await response.json();
    const flags = {};
    for (const row of rows) flags[row.facility_id] = row.booking_enabled !== false;
    return flags;
  } catch (_) {
    return {};
  }
}

/// بديل زرّ الحجز حين يتعطّل — نظير FacilityContactActions بالحرف: زرّا
/// اتصال/واتساب يُرسَمان دوماً، مقفلَين بتلميحٍ حين يغيب رقمهما لا مختفيَين.
function facilityContactFallback(facility) {
  const phones = facility.phones && facility.phones.length ? facility.phones : (facility.phone ? [facility.phone] : []);
  const whatsapps = facility.whatsapps && facility.whatsapps.length ? facility.whatsapps : (facility.whatsapp ? [facility.whatsapp] : []);
  const phone = phones[0] || null;
  const whatsapp = whatsapps[0] || null;
  if (!phone && !whatsapp) return '';

  return `
    <div class="mt-8">
      <p class="text-muted" style="font-size:12px;margin:0 0 8px;">الحجز الإلكتروني غير متاح لهذا الموعد — تواصل مع المرفق مباشرة.</p>
      <div class="row gap-8">
        <button class="btn btn-sm btn-filled contact-call-btn" style="flex:1;" data-phone="${esc(phone || '')}"
                ${phone ? '' : 'disabled title="لا رقم اتصال مسجَّل"'}>${SNDK_ICONS.phone(15, 'currentColor')} اتصال</button>
        <button class="btn btn-sm btn-outline contact-wa-btn" style="flex:1;" data-whatsapp="${esc(whatsapp || '')}"
                ${whatsapp ? '' : 'disabled title="لا رقم واتساب مسجَّل"'}>${SNDK_ICONS.chat(15)} واتساب</button>
      </div>
    </div>
  `;
}

/// بطاقة جدولة واحدة — نظير ScheduleEntryCard بمرونته نفسها: showDoctor/
/// showFacility بمعنى doctorName/facilityLabel هناك (null يعني «السياق
/// يعرفها فلا تُعرض»). مشتركة بين facility.js وdoctor.js — أول موضعين
/// يعرضان نفس البطاقة، فاستُخرجت هنا قبل أن يصير موضعاً ثالثاً.
function scheduleCardHtml(s, facility, canBook, { showDoctor = true, showFacility = false, showSubFacility = false } = {}) {
  const period = PERIOD_LABELS[s.period] || s.period || '';
  const time = s.start_time && s.end_time ? `${s.start_time.slice(0, 5)} – ${s.end_time.slice(0, 5)}` : '';
  const days = workingDaysLabel(s.working_days) || 'لم يحدد';
  const subFacilityLabel = (s.sub_facility && s.sub_facility.name) || (s.specialties && s.specialties.arabic_name) || '';

  return `
    <div class="row spread" style="align-items:flex-start;">
      <div style="flex:1;min-width:0;">
        ${showDoctor && s.doctors ? `<div style="font-weight:700;">${esc(s.doctors.name)}</div>` : ''}
        ${showFacility && facility ? `<a href="${sndkBasePath()}/facility/${esc(facility.id)}" class="text-muted mt-8" style="display:block;font-weight:600;color:var(--primary);">${esc(facility.name)}</a>` : ''}
        ${showSubFacility && subFacilityLabel ? `<div class="text-muted mt-8">${esc(subFacilityLabel)}</div>` : ''}
        <div class="text-muted mt-8">${esc([period, time].filter(Boolean).join(' · '))}</div>
        <div class="row gap-8 mt-8">${SNDK_ICONS.calendar(14)}<span class="text-muted">${esc(days)}</span></div>
        ${canBook ? '' : facilityContactFallback(facility)}
      </div>
      <div class="row gap-8" style="flex-shrink:0;">
        <button class="btn btn-sm btn-outline share-schedule-btn" data-schedule-id="${esc(s.id)}"
                title="مشاركة الموعد">
          ${SNDK_ICONS.share(15, 'currentColor')}
        </button>
        ${canBook ? `<button class="btn btn-sm btn-filled book-btn" data-schedule-id="${esc(s.id)}">احجز</button>` : ''}
      </div>
    </div>
  `;
}

/// بطاقة مرفق — مشتركة بين facilities.js وindex.js (أول موضعين يعرضانها).
function facilityCardHtml(f) {
  const phones = f.phones && f.phones.length ? f.phones : (f.phone ? [f.phone] : []);
  const whatsapps = f.whatsapps && f.whatsapps.length ? f.whatsapps : (f.whatsapp ? [f.whatsapp] : []);
  const location = [f.city, f.governorate].filter(Boolean).join('، ');

  return `
    <div class="card card-pad mb-12 facility-card-link" data-facility-id="${esc(f.id)}" style="cursor:pointer;">
      <div class="row gap-12" style="align-items:flex-start;">
        <div class="avatar">
          ${f.image_url || f.logo_url
            ? `<img src="${esc(f.image_url || f.logo_url)}" alt="${esc(f.name || '')}" data-fallback-type="hospital">`
            : SNDK_FALLBACK_ICONS.hospital()}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;">${esc(f.name)}</div>
          <div class="row wrap gap-8 mt-8">
            ${f.type ? `<span class="chip" style="background:${SNDK_HEX.secondaryTeal}1F;color:${SNDK_HEX.secondaryTeal};">${esc(FACILITY_TYPE_LABELS[f.type] || f.type)}</span>` : ''}
            ${location ? `<span class="chip" style="background:${SNDK_HEX.primary}1F;color:${SNDK_HEX.primary};">${esc(location)}</span>` : ''}
          </div>
          <div class="row gap-8 mt-8">
            ${phones[0] ? `<button class="btn btn-sm btn-outline facility-call-btn" data-phone="${esc(phones[0])}">${SNDK_ICONS.phone(14)} اتصال</button>` : ''}
            ${whatsapps[0] ? `<button class="btn btn-sm btn-outline facility-wa-btn" data-whatsapp="${esc(whatsapps[0])}">${SNDK_ICONS.chat(14)} واتساب</button>` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

function wireFacilityCards(root) {
  root.querySelectorAll('.facility-card-link').forEach((card) => {
    card.addEventListener('click', () => {
      window.location.href = `${sndkBasePath()}/facility/${card.dataset.facilityId}`;
    });
  });
  root.querySelectorAll('.facility-call-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.location.href = `tel:${cleanPhone(btn.dataset.phone)}`;
    });
  });
  root.querySelectorAll('.facility-wa-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.open(`https://wa.me/${cleanPhone(btn.dataset.whatsapp)}`, '_blank');
    });
  });
}

/// بطاقة طبيب — مشتركة بين doctors.js وindex.js. specialtiesById خريطة
/// اختيارية id→صفّ تخصص (لعرض اسمه دون نداءٍ إضافي لكل بطاقة).
function doctorCardHtml(d, specialtiesById) {
  const specialty = specialtiesById ? specialtiesById[d.specialty_id] : null;
  const specialtyName = specialty ? (specialty.arabic_name || specialty.name) : '';
  return `
    <div class="card card-pad mb-12 doctor-card-link" data-doctor-id="${esc(d.id)}" style="cursor:pointer;">
      <div class="row gap-12">
        <div class="avatar" style="width:52px;height:52px;border-radius:50%;">
          ${d.photo_url || d.image_url
            ? `<img src="${esc(d.photo_url || d.image_url)}" alt="${esc(d.name || '')}" data-fallback-type="person">`
            : SNDK_FALLBACK_ICONS.person()}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;">${esc(d.name)}</div>
          ${specialtyName ? `<div class="text-muted mt-8">${esc(specialtyName)}</div>` : ''}
          ${d.rating > 0 ? `<div class="row gap-8 mt-8">${SNDK_ICONS.star(14)}<span class="text-muted">${esc(String(d.rating))} (${esc(String(d.reviews_count || 0))})</span></div>` : ''}
        </div>
      </div>
    </div>
  `;
}

function wireDoctorCards(root) {
  root.querySelectorAll('.doctor-card-link').forEach((card) => {
    card.addEventListener('click', () => {
      window.location.href = `${sndkBasePath()}/doctor.html?id=${encodeURIComponent(card.dataset.doctorId)}`;
    });
  });
}

/// يُنادى بعد أي `innerHTML` يحمل `.contact-call-btn`/`.contact-wa-btn`.
function wireContactFallback(root) {
  (root || document).querySelectorAll('.contact-call-btn[data-phone]:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', () => { window.location.href = `tel:${cleanPhone(btn.dataset.phone)}`; });
  });
  (root || document).querySelectorAll('.contact-wa-btn[data-whatsapp]:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', () => { window.open(`https://wa.me/${cleanPhone(btn.dataset.whatsapp)}`, '_blank'); });
  });
}
