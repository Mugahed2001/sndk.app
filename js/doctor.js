// ملف طبيب — نظير guest_doctor_profile_screen.dart (جزؤه الجوهري: الجدولات
// عبر كل مرافق الطبيب + الحجز). رابط المشاركة `/doctor/<id>` يطابق
// DeepLinkType.doctor في تطبيق فلاتر حرفياً. esc/wireImageFallbacks/
// wireContactFallback/scheduleCardHtml/scheduleAcceptsBooking/shareLink من
// common.js، sndkBasePath من routing.js، openModal إلخ من SndkBooking
// (booking.js — لا تُستعمل مباشرة هنا لكن الجدولات تحتاج SndkBooking.start).

async function main() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  if (params.get('pretty') === '1' && id) {
    window.history.replaceState(null, '', `${sndkBasePath()}/doctor/${id}`);
  }

  if (!id) {
    document.getElementById('root').innerHTML = '<div class="state-box">رابط غير صالح — لا معرّف طبيب.</div>';
    return;
  }

  renderTopbar();

  let doctor, schedules, specialty;
  try {
    const [doctorRows, scheduleRows] = await Promise.all([
      SndkApi.getData('get-doctors', { query: { id } }),
      SndkApi.getData('get-clinic-schedules', { query: { doctor_id: id } }),
    ]);
    doctor = Array.isArray(doctorRows) ? doctorRows[0] : null;
    schedules = Array.isArray(scheduleRows) ? scheduleRows : [];
  } catch (err) {
    document.getElementById('root').innerHTML =
      `<div class="state-box">تعذّر تحميل ملف الطبيب.<br>${esc(err.message)}</div>`;
    return;
  }

  if (!doctor || doctor.is_active === false) {
    document.getElementById('root').innerHTML = '<div class="state-box">هذا الطبيب غير متاح حالياً.</div>';
    return;
  }

  if (doctor.specialty_id) {
    try {
      const rows = await SndkApi.getData('get-specialties', { query: { id: doctor.specialty_id } });
      specialty = Array.isArray(rows) ? rows[0] : null;
    } catch (_) { /* اسم التخصص تجميليّ — فشله لا يمنع عرض الملف */ }
  }

  document.title = `${doctor.name} — سندك الطبي`;
  render(doctor, schedules, specialty);
}

function renderTopbar() {
  document.getElementById('topbarActions').innerHTML = SndkAuth.isLoggedIn()
    ? `<span class="text-muted" style="font-size:13px;">${esc((SndkAuth.currentUser() || {}).full_name || '')}</span>
       <button class="btn btn-sm btn-outline" id="logoutBtn">خروج</button>`
    : `<button class="btn btn-sm btn-outline" id="loginBtn">دخول</button>`;

  document.getElementById('logoutBtn')?.addEventListener('click', () => { SndkAuth.signOut(); renderTopbar(); });
  document.getElementById('loginBtn')?.addEventListener('click', () => SndkAuthUI.openLoginModal(renderTopbar));
}

function render(doctor, schedules, specialty) {
  const specialtyName = specialty ? (specialty.arabic_name || specialty.name) : '';

  document.getElementById('root').innerHTML = `
    <div class="container" style="padding-top:16px;">
      <div class="card card-pad">
        <div class="row gap-12" style="align-items:flex-start;">
          <div class="avatar" style="width:64px;height:64px;border-radius:50%;">
            ${doctor.photo_url || doctor.image_url
              ? `<img src="${esc(doctor.photo_url || doctor.image_url)}" alt="${esc(doctor.name || '')}" data-fallback-type="person">`
              : SNDK_FALLBACK_ICONS.person()}
          </div>
          <div style="flex:1;min-width:0;">
            <div class="row spread">
              <div class="title-lg" style="font-size:18px;">${esc(doctor.name)}</div>
              <button class="btn btn-sm btn-outline" id="doctorShareBtn" title="مشاركة">
                ${SNDK_ICONS.share(15, 'currentColor')}
              </button>
            </div>
            ${specialtyName ? `<div class="text-muted mt-8">${esc(specialtyName)}</div>` : ''}
            ${doctor.rating > 0 ? `<div class="row gap-8 mt-8">${SNDK_ICONS.star(15)}<span class="text-muted">${esc(String(doctor.rating))} (${esc(String(doctor.reviews_count || 0))})</span></div>` : ''}
          </div>
        </div>
        ${doctor.bio ? `<p class="text-muted mt-12">${esc(doctor.bio)}</p>` : ''}
      </div>

      <div class="section-title" style="margin:20px 0 8px;">مواعيد الطبيب</div>
      <div id="doctorSchedulesBody">
        <div class="skeleton" style="height:100px;"></div>
      </div>
    </div>
  `;

  wireImageFallbacks(document.getElementById('root'));
  document.getElementById('doctorShareBtn').addEventListener('click', () => {
    shareLink(`${window.location.origin}${sndkBasePath()}/doctor/${doctor.id}`, doctor.name);
  });

  loadDoctorSchedules(doctor, schedules);
}

async function loadDoctorSchedules(doctor, schedules) {
  const body = document.getElementById('doctorSchedulesBody');
  if (schedules.length === 0) {
    body.innerHTML = '<div class="state-box">لا مواعيد معلنة لهذا الطبيب حالياً.</div>';
    return;
  }

  // بلا رسمٍ متفائل: القائمة كلها هي المحتوى الرئيسي للصفحة (لا تبويب مخفيّ
  // يُؤجَّل إليه كما في facility.js) — رسمٌ ثم استبدال جماعي بعد ٣ث كان
  // سيومض بصرياً على كل الصفوف معاً. هيكلٌ عظمي حتى يصل القرار النهائي.
  const facilityIds = [...new Set(schedules.map((s) => s.facility_id).filter(Boolean))];
  const [bookingFacilityIds, doctorFacilityFlags] = await Promise.all([
    fetchBookingFacilityIds(),
    fetchDoctorFacilityFlags(doctor.id, facilityIds),
  ]);

  const stillThere = document.getElementById('doctorSchedulesBody');
  if (!stillThere) return; // غادر الزائر الصفحة قبل أن تصل النتيجة.

  body.innerHTML = schedules.map((s) => {
    const canBook = scheduleAcceptsBooking(s, bookingFacilityIds, { [s.doctor_id]: doctorFacilityFlags[s.facility_id] });
    return `<div class="card card-pad mb-12">${scheduleCardHtml(s, s.facilities, canBook, { showDoctor: false, showFacility: true, showSubFacility: true })}</div>`;
  }).join('');
  wireImageFallbacks(body);
  wireContactFallback(body);
  wireDoctorScheduleButtons(schedules);
}

function wireDoctorScheduleButtons(schedules) {
  const body = document.getElementById('doctorSchedulesBody');
  body.querySelectorAll('.book-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const schedule = schedules.find((s) => s.id === btn.dataset.scheduleId);
      if (schedule) SndkBooking.start(schedule, schedule.facilities);
    });
  });
  body.querySelectorAll('.share-schedule-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const schedule = schedules.find((s) => s.id === btn.dataset.scheduleId);
      const url = `${window.location.origin}${sndkBasePath()}/appointment/${btn.dataset.scheduleId}`;
      shareLink(url, schedule && schedule.doctors ? schedule.doctors.name : 'موعد');
    });
  });
}

main();
