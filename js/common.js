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
  textMuted: '#718096',
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
                ${phone ? '' : 'disabled title="لا رقم اتصال مسجَّل"'}>📞 اتصال</button>
        <button class="btn btn-sm btn-outline contact-wa-btn" style="flex:1;" data-whatsapp="${esc(whatsapp || '')}"
                ${whatsapp ? '' : 'disabled title="لا رقم واتساب مسجَّل"'}>💬 واتساب</button>
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
        <div class="text-muted mt-8">📅 ${esc(days)}</div>
        ${canBook ? '' : facilityContactFallback(facility)}
      </div>
      <div class="row gap-8" style="flex-shrink:0;">
        <button class="btn btn-sm btn-outline share-schedule-btn" data-schedule-id="${esc(s.id)}"
                title="مشاركة الموعد">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M13.5 6.5L17.5 10.5M4 20l1-4.5L14.5 6l3.5 3.5L9.5 19 5 20H4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
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
            ? `<img src="${esc(f.image_url || f.logo_url)}" alt="" data-fallback-type="hospital">`
            : SNDK_FALLBACK_ICONS.hospital()}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;">${esc(f.name)}</div>
          <div class="row wrap gap-8 mt-8">
            ${f.type ? `<span class="chip" style="background:${SNDK_HEX.secondaryTeal}1F;color:${SNDK_HEX.secondaryTeal};">${esc(FACILITY_TYPE_LABELS[f.type] || f.type)}</span>` : ''}
            ${location ? `<span class="chip" style="background:${SNDK_HEX.primary}1F;color:${SNDK_HEX.primary};">${esc(location)}</span>` : ''}
          </div>
          <div class="row gap-8 mt-8">
            ${phones[0] ? `<button class="btn btn-sm btn-outline facility-call-btn" data-phone="${esc(phones[0])}">📞 اتصال</button>` : ''}
            ${whatsapps[0] ? `<button class="btn btn-sm btn-outline facility-wa-btn" data-whatsapp="${esc(whatsapps[0])}">💬 واتساب</button>` : ''}
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
            ? `<img src="${esc(d.photo_url || d.image_url)}" alt="" data-fallback-type="person">`
            : SNDK_FALLBACK_ICONS.person()}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;">${esc(d.name)}</div>
          ${specialtyName ? `<div class="text-muted mt-8">${esc(specialtyName)}</div>` : ''}
          ${d.rating > 0 ? `<div class="text-muted mt-8">⭐ ${esc(String(d.rating))} (${esc(String(d.reviews_count || 0))})</div>` : ''}
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
