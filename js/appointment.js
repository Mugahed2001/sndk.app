// صفحة موعد فردي — وجهة زرّ المشاركة في facility.js، ونظير
// DeepLinkType.appointment في تطبيق فلاتر: نفس الرابط `/appointment/<schedule_id>`
// يعمل من كلا المصدرين. تعرض تفاصيل الموعد وتتيح حجزه مباشرة (SndkBooking.start
// نفسها المستعملة في صفحة المرفق)، وتضيف قسماً مستقلاً لتوثيق رقم الهاتف
// استباقياً — لا رد فعل على خطأ حجز، بل إجراء يبدأه الزائر بنفسه.
// esc/cleanPhone/wireImageFallbacks/PERIOD_LABELS/shareLink من common.js،
// sndkBasePath من routing.js، openPhoneVerification من SndkBooking (booking.js).

async function main() {
  const params = new URLSearchParams(window.location.search);
  const scheduleId = params.get('schedule_id');

  if (params.get('pretty') === '1' && scheduleId) {
    window.history.replaceState(null, '', `${sndkBasePath()}/appointment/${scheduleId}`);
  }

  if (!scheduleId) {
    document.getElementById('root').innerHTML = '<div class="state-box">رابط غير صالح — لا معرّف موعد.</div>';
    return;
  }

  renderTopbar();

  let schedule;
  try {
    const rows = await SndkApi.getData('get-clinic-schedules', { query: { id: scheduleId } });
    schedule = Array.isArray(rows) ? rows[0] : null;
  } catch (err) {
    document.getElementById('root').innerHTML =
      `<div class="state-box">تعذّر تحميل تفاصيل الموعد.<br>${esc(err.message)}</div>`;
    return;
  }

  if (!schedule) {
    document.getElementById('root').innerHTML = '<div class="state-box">هذا الموعد لم يعد متاحاً.</div>';
    return;
  }

  const facility = schedule.facilities;
  if (!facility || facility.is_active === false) {
    document.getElementById('root').innerHTML = '<div class="state-box">هذا المرفق غير متاح حالياً.</div>';
    return;
  }

  document.title = `${schedule.doctors ? schedule.doctors.name : 'موعد'} — سندك الطبي`;
  render(facility, schedule);
}

function renderTopbar() {
  document.getElementById('topbarActions').innerHTML = SndkAuth.isLoggedIn()
    ? `<span class="text-muted" style="font-size:13px;">${esc((SndkAuth.currentUser() || {}).full_name || '')}</span>
       <button class="btn btn-sm btn-outline" id="logoutBtn">خروج</button>`
    : `<button class="btn btn-sm btn-outline" id="loginBtn">دخول</button>`;

  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    SndkAuth.signOut();
    renderTopbar();
    renderVerifySection();
  });
  document.getElementById('loginBtn')?.addEventListener('click', () => SndkAuthUI.openLoginModal(() => {
    renderTopbar();
    renderVerifySection();
  }));
}

function render(facility, schedule) {
  const doctor = schedule.doctors || {};
  const period = PERIOD_LABELS[schedule.period] || schedule.period || '';
  const time = schedule.start_time && schedule.end_time
    ? `${schedule.start_time.slice(0, 5)} – ${schedule.end_time.slice(0, 5)}`
    : '';
  const groupLabel = (schedule.sub_facility && schedule.sub_facility.name)
    || (schedule.specialties && schedule.specialties.arabic_name)
    || '';

  document.getElementById('root').innerHTML = `
    <div class="container" style="padding-top:16px;">
      <div class="card card-pad">
        <div class="row gap-12" style="align-items:flex-start;">
          <div class="avatar" style="width:56px;height:56px;border-radius:50%;">
            ${doctor.photo_url
              ? `<img src="${esc(doctor.photo_url)}" alt="" data-fallback-type="person">`
              : SNDK_FALLBACK_ICONS.person()}
          </div>
          <div style="flex:1;min-width:0;">
            <div class="row spread">
              <div class="title-lg" style="font-size:18px;">${esc(doctor.name || 'طبيب')}</div>
              <button class="btn btn-sm btn-outline" id="apptShareBtn" title="مشاركة">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M13.5 6.5L17.5 10.5M4 20l1-4.5L14.5 6l3.5 3.5L9.5 19 5 20H4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
              </button>
            </div>
            <a class="text-muted mt-8" style="display:block;color:var(--primary);font-weight:600;" href="${sndkBasePath()}/facility/${esc(facility.id)}">
              ${esc(facility.name)}
            </a>
            <div class="row wrap gap-8 mt-12">
              ${groupLabel ? `<span class="chip" style="background:rgba(10,123,147,0.12);color:var(--primary);">${esc(groupLabel)}</span>` : ''}
              ${period ? `<span class="chip" style="background:rgba(15,163,189,0.12);color:var(--secondary-teal);">${esc(period)}</span>` : ''}
              ${time ? `<span class="chip" style="background:rgba(102,126,234,0.12);color:var(--accent-purple);">${esc(time)}</span>` : ''}
            </div>
          </div>
        </div>
        <button class="btn btn-filled btn-block mt-16" id="apptBookBtn">احجز الآن</button>
      </div>

      <div id="verifySection" class="mt-16"></div>
    </div>
  `;

  wireImageFallbacks(document.getElementById('root'));
  document.getElementById('apptShareBtn').addEventListener('click', () => {
    const url = `${window.location.origin}${sndkBasePath()}/appointment/${schedule.id}`;
    shareLink(url, doctor.name || 'موعد');
  });
  document.getElementById('apptBookBtn').addEventListener('click', () => {
    SndkBooking.start(schedule, facility);
  });

  renderVerifySection();
}

// ─────────────────────────── توثيق استباقي ───────────────────────────

function renderVerifySection() {
  const el = document.getElementById('verifySection');
  if (!el) return;

  if (!SndkAuth.isLoggedIn()) {
    el.innerHTML = `
      <div class="card card-pad">
        <div class="section-title" style="margin:0 0 8px;">توثيق رقم الهاتف</div>
        <p class="text-muted">سجّل الدخول لتوثيق رقمك — رقم موثَّق يسرّع كل حجز لاحق.</p>
        <button class="btn btn-outline btn-block mt-8" id="verifyLoginBtn">تسجيل الدخول</button>
      </div>
    `;
    el.querySelector('#verifyLoginBtn').addEventListener('click', () => {
      SndkAuthUI.openLoginModal(() => { renderTopbar(); renderVerifySection(); });
    });
    return;
  }

  const user = SndkAuth.currentUser() || {};
  if (user.phone_verified === true) {
    el.innerHTML = `
      <div class="card card-pad" style="background:rgba(86,171,47,0.08);">
        <div class="row gap-8">
          <span style="color:var(--success);">✓</span>
          <strong>رقمك موثَّق${user.phone_number ? `: ${esc(user.phone_number)}` : ''}</strong>
        </div>
      </div>
    `;
    return;
  }

  el.innerHTML = `
    <div class="card card-pad">
      <div class="section-title" style="margin:0 0 8px;">توثيق رقم الهاتف</div>
      <p class="text-muted">رقمٌ موثَّق يعني حجزاً أسرع بلا انتظار رمز في كل مرة.</p>
      <input class="field mt-8" id="verifyPhoneInput" value="${esc(user.phone_number || '')}" placeholder="7XXXXXXXX" style="direction:ltr;text-align:right;">
      <div id="verifySectionError"></div>
      <button class="btn btn-filled btn-block mt-8" id="verifyStartBtn">توثيق الرقم</button>
    </div>
  `;
  el.querySelector('#verifyStartBtn').addEventListener('click', () => {
    const phone = el.querySelector('#verifyPhoneInput').value.trim();
    const errorEl = el.querySelector('#verifySectionError');
    errorEl.innerHTML = '';
    if (phone.length < 7) {
      errorEl.innerHTML = '<div class="banner banner-error">رقم الهاتف غير صالح.</div>';
      return;
    }
    SndkBooking.openPhoneVerification(phone, () => {
      showVerifiedSuccess();
    }, 'account');
  });
}

function showVerifiedSuccess() {
  const sheet = SndkBooking.openModal(`
    <div class="state-box">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#56AB2F" stroke-width="2"/><path d="M8 12l3 3 5-6" stroke="#56AB2F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <div class="title-md mt-12" style="color:var(--text);">تمّ توثيق رقمك بنجاح</div>
      <p class="text-muted mt-8">سيسرّع هذا كل حجز لاحق — بلا رمز تحقّق في كل مرة.</p>
      <button class="btn btn-filled btn-block mt-16" id="verifyDoneBtn">تم</button>
    </div>
  `);
  sheet.querySelector('#verifyDoneBtn').addEventListener('click', SndkBooking.closeModal);
}

main();
