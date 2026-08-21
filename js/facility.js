// شاشة المرفق — نظير guest_facility_profile_screen.dart: نفس البطاقة
// العلوية، ونفس التبويبات الثلاثة (معلومات / أطباء / أقسام ومواعيد).
// esc/cleanPhone/wireImageFallbacks/PERIOD_LABELS من common.js، sndkBasePath من routing.js.

const FACILITY_TYPE_LABELS = {
  hospital: 'مستشفى', clinic: 'عيادة', medicalCenter: 'مركز طبي',
  medical_center: 'مركز طبي', laboratory: 'مختبر', pharmacy: 'صيدلية',
  radiology: 'أشعة', other: 'أخرى',
};

async function main() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  if (params.get('pretty') === '1' && id) {
    // يُعيد شريط العنوان إلى شكله الجميل بعد أن قرأنا المعرّف من الاستعلام —
    // انظر تعليق 404-redirect.js.
    window.history.replaceState(null, '', `${sndkBasePath()}/facility/${id}`);
  }

  if (!id) {
    document.getElementById('root').innerHTML = '<div class="state-box">رابط غير صالح — لا معرّف مرفق.</div>';
    return;
  }

  renderTopbar();

  let facility, schedules;
  try {
    const [facilityRows, scheduleRows] = await Promise.all([
      SndkApi.getData('get-facilities', { query: { id } }),
      SndkApi.getData('get-clinic-schedules', { query: { facility_id: id } }),
    ]);
    facility = Array.isArray(facilityRows) ? facilityRows[0] : null;
    schedules = Array.isArray(scheduleRows) ? scheduleRows : [];
  } catch (err) {
    document.getElementById('root').innerHTML =
      `<div class="state-box">تعذّر تحميل صفحة المرفق.<br>${esc(err.message)}</div>`;
    return;
  }

  if (!facility) {
    document.getElementById('root').innerHTML = '<div class="state-box">هذا المرفق غير متاح حالياً.</div>';
    return;
  }
  if (facility.is_active === false) {
    document.getElementById('root').innerHTML = '<div class="state-box">هذا المرفق موقوف حالياً.</div>';
    return;
  }

  document.title = `${facility.name} — سندك الطبي`;
  render(facility, schedules);

  // بوّابتا الحجز الإلكتروني — نظير BookingEntryButton بالحرف — لا تُنتظران
  // قبل رسم الصفحة: نداء get-visitor-commercial-snapshot ثقيل نسبياً (يجلب
  // لقطة المنصّة كاملة)، وتبويب «الأقسام والمواعيد» ليس الظاهر افتراضاً —
  // فحجب الصفحة عليه يُبطئ أكثر ما يراه الزائر أولاً لأجل تبويبٍ قد لا يفتحه.
  loadBookingGates(facility, schedules);
}

async function loadBookingGates(facility, schedules) {
  const [bookingFacilityIds, facilityDoctorFlags] = await Promise.all([
    fetchBookingFacilityIds(),
    fetchFacilityDoctorFlags(facility.id, schedules.map((s) => s.doctor_id)),
  ]);
  const panel = document.getElementById('panel-schedules');
  if (!panel) return; // غادر الزائر الصفحة قبل أن تصل النتيجة.
  panel.innerHTML = renderSchedulesTab(schedules, facility, bookingFacilityIds, facilityDoctorFlags);
  wireImageFallbacks(panel);
  wireContactFallback(panel);
  wireScheduleButtons(facility, schedules);
}

function renderTopbar() {
  document.getElementById('topbarActions').innerHTML = SndkAuth.isLoggedIn()
    ? `<span class="text-muted" style="font-size:13px;">${esc((SndkAuth.currentUser() || {}).full_name || '')}</span>
       <button class="btn btn-sm btn-outline" id="logoutBtn">خروج</button>`
    : `<button class="btn btn-sm btn-outline" id="loginBtn">دخول</button>`;

  document.getElementById('logoutBtn')?.addEventListener('click', () => { SndkAuth.signOut(); renderTopbar(); });
  document.getElementById('loginBtn')?.addEventListener('click', () => SndkAuthUI.openLoginModal(renderTopbar));
}

function render(facility, schedules) {
  const doctorsMap = {};
  for (const s of schedules) {
    if (s.doctors && s.doctors.is_active !== false) doctorsMap[s.doctors.id] = s.doctors;
  }
  const doctors = Object.values(doctorsMap);

  const phones = facility.phones && facility.phones.length ? facility.phones : (facility.phone ? [facility.phone] : []);
  const whatsapps = facility.whatsapps && facility.whatsapps.length ? facility.whatsapps : (facility.whatsapp ? [facility.whatsapp] : []);
  const primaryPhone = phones[0];
  const primaryWhatsapp = whatsapps[0];

  document.getElementById('root').innerHTML = `
    <div class="card card-pad" style="margin:16px;">
      <div class="row gap-12" style="align-items:flex-start;">
        <div class="avatar" id="facilityAvatar">
          ${facility.image_url
            ? `<img src="${esc(facility.image_url)}" alt="" data-fallback-type="hospital">`
            : SNDK_FALLBACK_ICONS.hospital()}
        </div>
        <div style="flex:1;min-width:0;">
          <div class="row spread">
            <div class="title-lg" style="font-size:18px;">${esc(facility.name)}</div>
            <button class="btn btn-sm btn-outline" id="shareBtn" title="نسخ الرابط">مشاركة</button>
          </div>
          <div class="row wrap gap-8 mt-12">
            ${facility.type ? chip(FACILITY_TYPE_LABELS[facility.type] || facility.type, SNDK_HEX.secondaryTeal) : ''}
            ${locationLabel(facility) ? chip(locationLabel(facility), SNDK_HEX.primary) : ''}
            ${doctors.length ? chip(`${doctors.length} طبيب`, SNDK_HEX.accentPurple) : ''}
          </div>
          <div class="row wrap gap-8 mt-12" id="primaryActions">
            ${primaryPhone ? `<button class="btn btn-sm btn-filled" id="callBtn">اتصال</button>` : ''}
            ${primaryWhatsapp ? `<button class="btn btn-sm btn-outline" id="waBtn">واتساب</button>` : ''}
            ${facility.googl_map ? `<button class="btn btn-sm btn-outline" id="mapBtn">الموقع</button>` : ''}
            ${schedules.length ? `<button class="btn btn-sm btn-outline" id="jumpSchedulesBtn">المواعيد</button>` : ''}
          </div>
        </div>
      </div>
    </div>

    <div class="tabs">
      <button class="tab active" data-tab="info">معلومات</button>
      <button class="tab" data-tab="doctors">الأطباء</button>
      <button class="tab" data-tab="schedules">الأقسام والمواعيد</button>
    </div>

    <div class="container" style="padding-top:0;">
      <div class="tab-panel active" id="panel-info">${renderInfoTab(facility, phones, whatsapps)}</div>
      <div class="tab-panel" id="panel-doctors">${renderDoctorsTab(doctors)}</div>
      <div class="tab-panel" id="panel-schedules">${schedules.length ? '<div class="skeleton"></div><div class="skeleton"></div>' : '<div class="state-box">لا جدولات معلنة لهذا المرفق حالياً.</div>'}</div>
    </div>
    <footer class="site-footer">© سندك الطبي</footer>
  `;

  wireImageFallbacks(document.getElementById('root'));
  wireInteractions(facility, schedules);
}

function chip(label, color) {
  return `<span class="chip" style="background:${color}1F;color:${color};">${esc(label)}</span>`;
}

function locationLabel(facility) {
  return [facility.city, facility.governorate].filter(Boolean).join('، ');
}

function renderInfoTab(facility, phones, whatsapps) {
  let html = '';

  html += sectionTitle('معلومات التواصل');
  if (phones.length === 0) {
    html += `<div class="card card-pad mb-12"><span class="text-muted">لا أرقام هاتف مسجّلة</span></div>`;
  } else {
    for (const p of phones) html += contactCard('phone', p, p);
  }
  for (const w of whatsapps) html += contactCard('whatsapp', w, w);
  if (facility.email) html += contactCard('email', 'البريد الإلكتروني', facility.email);
  if (facility.website) html += contactCard('website', 'الموقع الإلكتروني', facility.website);

  html += sectionTitle('الموقع');
  if (facility.address) html += infoCard('العنوان', facility.address);
  if (facility.city) html += infoCard('المدينة', facility.city);
  if (facility.governorate) html += infoCard('المحافظة', facility.governorate);
  if (facility.district) html += infoCard('الحيّ', facility.district);
  if (facility.nearby_landmark) html += infoCard('أقرب معلَم', facility.nearby_landmark);

  if (facility.specialties && facility.specialties.length) {
    html += sectionTitle('التخصصات المتاحة');
    html += `<div class="row wrap gap-8 mb-12">${facility.specialties.map((s) => chip(s, SNDK_HEX.primary)).join('')}</div>`;
  }

  if (facility.description) {
    html += sectionTitle('نبذة');
    html += `<div class="card card-pad mb-12">${esc(facility.description)}</div>`;
  }

  return html;
}

function sectionTitle(text) {
  return `<div class="section-title">${esc(text)}</div>`;
}

function contactCard(kind, title, value) {
  return `<div class="card card-pad mb-12"><div class="text-muted" style="font-size:11px;">${esc(title === value ? (kind === 'whatsapp' ? 'واتساب' : 'هاتف') : title)}</div><div class="row spread mt-8"><strong style="direction:ltr;text-align:right;display:block;width:100%;">${esc(value)}</strong></div></div>`;
}

function infoCard(title, value) {
  return `<div class="card card-pad mb-12"><div class="text-muted" style="font-size:11px;">${esc(title)}</div><div class="mt-8" style="font-weight:600;">${esc(value)}</div></div>`;
}

function renderDoctorsTab(doctors) {
  if (doctors.length === 0) return '<div class="state-box">لا أطباء مسجّلون في هذا المرفق حالياً.</div>';
  return doctors.map((d) => `
    <div class="card card-pad mb-12">
      <div class="row gap-12">
        <div class="avatar" style="width:48px;height:48px;border-radius:50%;">
          ${d.photo_url
            ? `<img src="${esc(d.photo_url)}" alt="" data-fallback-type="person">`
            : SNDK_FALLBACK_ICONS.person()}
        </div>
        <div style="flex:1;">
          <div style="font-weight:700;">${esc(d.name)}</div>
        </div>
      </div>
    </div>
  `).join('');
}

function scheduleGroupLabel(s) {
  if (s.sub_facility && s.sub_facility.name) return s.sub_facility.name;
  if (s.specialties && s.specialties.arabic_name) return s.specialties.arabic_name;
  return 'غير محدد';
}

function renderSchedulesTab(schedules, facility, bookingFacilityIds, facilityDoctorFlags) {
  if (schedules.length === 0) return '<div class="state-box">لا جدولات معلنة لهذا المرفق حالياً.</div>';

  const groups = {};
  for (const s of schedules) {
    const label = scheduleGroupLabel(s);
    (groups[label] = groups[label] || []).push(s);
  }

  return Object.entries(groups).map(([label, rows]) => `
    <div class="card card-pad mb-12">
      <div class="section-title" style="margin:0 0 12px;">${esc(label)}</div>
      ${rows.map((s) => scheduleRow(s, facility, scheduleAcceptsBooking(s, bookingFacilityIds, facilityDoctorFlags)))
        .join('<div style="height:1px;background:var(--border);margin:12px 0;"></div>')}
    </div>
  `).join('');
}

function scheduleRow(s, facility, canBook) {
  const period = PERIOD_LABELS[s.period] || s.period || '';
  const time = s.start_time && s.end_time ? `${s.start_time.slice(0, 5)} – ${s.end_time.slice(0, 5)}` : '';
  const days = workingDaysLabel(s.working_days) || 'لم يحدد';
  return `
    <div class="row spread" style="align-items:flex-start;">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;">${esc(s.doctors ? s.doctors.name : '')}</div>
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

function wireInteractions(facility, schedules) {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
    });
  });

  document.getElementById('shareBtn')?.addEventListener('click', () => {
    shareLink(`${window.location.origin}${sndkBasePath()}/facility/${facility.id}`, facility.name);
  });

  const phones = facility.phones && facility.phones.length ? facility.phones : (facility.phone ? [facility.phone] : []);
  const whatsapps = facility.whatsapps && facility.whatsapps.length ? facility.whatsapps : (facility.whatsapp ? [facility.whatsapp] : []);
  document.getElementById('callBtn')?.addEventListener('click', () => { window.location.href = `tel:${cleanPhone(phones[0])}`; });
  document.getElementById('waBtn')?.addEventListener('click', () => { window.open(`https://wa.me/${cleanPhone(whatsapps[0])}`, '_blank'); });
  document.getElementById('mapBtn')?.addEventListener('click', () => {
    const q = encodeURIComponent(`${facility.address || ''} ${facility.name}`.trim());
    window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, '_blank');
  });
  document.getElementById('jumpSchedulesBtn')?.addEventListener('click', () => {
    document.querySelector('.tab[data-tab="schedules"]').click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/// أزرار بطاقات الجدولة (احجز/مشاركة) — تُربَط بعد أن يملأ loadBookingGates
/// تبويب المواعيد بمحتواه النهائي، لا مع بقية الصفحة.
function wireScheduleButtons(facility, schedules) {
  document.querySelectorAll('.book-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const schedule = schedules.find((s) => s.id === btn.dataset.scheduleId);
      if (schedule) SndkBooking.start(schedule, facility);
    });
  });

  document.querySelectorAll('.share-schedule-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const schedule = schedules.find((s) => s.id === btn.dataset.scheduleId);
      const url = `${window.location.origin}${sndkBasePath()}/appointment/${btn.dataset.scheduleId}`;
      shareLink(url, schedule && schedule.doctors ? schedule.doctors.name : 'موعد');
    });
  });
}

main();
