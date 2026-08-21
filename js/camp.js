// صفحة مخيم — نظير camp_detail_screen.dart + camp_registration_sheet.dart
// بالحرف: لوحة المقاعد، ثم زر التسجيل الذي يتفرّع بحسب حالة الإتاحة
// (بلا حاجة تسجيل / مغلق / يلزم حساب / فورم). esc/cleanPhone/wireImageFallbacks
// /shareLink وأدوات المخيم المشتركة من common.js، sndkBasePath من routing.js،
// openModal/closeModal/openPhoneVerification من SndkBooking (booking.js).

function campMaxCompanionsAllowed(camp, availability) {
  const campLimit = campMaxCompanions(camp);
  const remaining = availability ? availability.seats_remaining : null;
  if (remaining == null) return campLimit;
  return remaining <= 1 ? 0 : Math.min(campLimit, remaining - 1);
}

let currentCamp = null;
let currentAvailability = null;
let currentAvailabilityFailed = false;

async function main() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  if (params.get('pretty') === '1' && id) {
    window.history.replaceState(null, '', `${sndkBasePath()}/camp/${id}`);
  }

  if (!id) {
    document.getElementById('root').innerHTML = '<div class="state-box">رابط غير صالح — لا معرّف مخيم.</div>';
    return;
  }

  renderTopbar();

  let camp;
  try {
    const rows = await SndkApi.getData('get-camps', { query: { id } });
    camp = Array.isArray(rows) ? rows[0] : null;
  } catch (err) {
    document.getElementById('root').innerHTML =
      `<div class="state-box">تعذّر تحميل صفحة المخيم.<br>${esc(err.message)}</div>`;
    return;
  }

  if (!camp) {
    document.getElementById('root').innerHTML = '<div class="state-box">هذا المخيم غير متاح حالياً.</div>';
    return;
  }

  document.title = `${camp.title} — سندك الطبي`;
  render(camp);
}

function renderTopbar() {
  document.getElementById('topbarActions').innerHTML = SndkAuth.isLoggedIn()
    ? `<span class="text-muted" style="font-size:13px;">${esc((SndkAuth.currentUser() || {}).full_name || '')}</span>
       <button class="btn btn-sm btn-outline" id="logoutBtn">خروج</button>`
    : `<button class="btn btn-sm btn-outline" id="loginBtn">دخول</button>`;

  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    SndkAuth.signOut();
    renderTopbar();
    if (currentCamp) renderRegisterArea(currentCamp, currentAvailability, currentAvailabilityFailed);
  });
  document.getElementById('loginBtn')?.addEventListener('click', () => SndkAuthUI.openLoginModal(() => {
    renderTopbar();
    if (currentCamp) renderRegisterArea(currentCamp, currentAvailability, currentAvailabilityFailed);
  }));
}

async function render(camp) {
  currentCamp = camp;
  const specialties = campSpecialties(camp);

  document.getElementById('root').innerHTML = `
    ${camp.image_url
      ? `<div style="width:100%;height:180px;overflow:hidden;background:rgba(15,163,189,0.08);display:flex;align-items:center;justify-content:center;">
           <img src="${esc(camp.image_url)}" alt="" data-fallback-type="camp" style="width:100%;height:100%;object-fit:cover;display:block;">
         </div>`
      : ''}
    <div class="container">
      <div class="row spread" style="align-items:flex-start;">
        <div class="title-lg">${esc(camp.title)}</div>
        <button class="btn btn-sm btn-outline" id="campShareBtn" title="مشاركة">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M13.5 6.5L17.5 10.5M4 20l1-4.5L14.5 6l3.5 3.5L9.5 19 5 20H4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
        </button>
      </div>
      ${campOrganizer(camp) ? `<div class="text-muted mt-8" style="color:var(--primary);">${esc(campOrganizer(camp))}</div>` : ''}

      <div id="seatsPanel" class="mt-16"><div class="skeleton" style="height:90px;"></div></div>

      ${detailTile(SNDK_ICONS.calendar(16), 'التواريخ', campDateRange(camp))}
      ${camp.daily_start_time ? detailTile(SNDK_ICONS.clock(16), 'أوقات الدوام اليومي', `${camp.daily_start_time}${camp.daily_end_time ? ' — ' + camp.daily_end_time : ''}`) : ''}
      ${campCity(camp) ? detailTile(SNDK_ICONS.building(16), 'المدينة', campCity(camp)) : ''}
      ${camp.address ? detailTile(SNDK_ICONS.pin(16), 'العنوان', camp.address) : ''}
      ${detailTile(campIsFree(camp) ? SNDK_ICONS.gift(16) : SNDK_ICONS.card(16), 'الرسوم', campIsFree(camp) ? 'مجاني' : String(camp.fee ?? ''))}

      ${specialties.length ? `
        <div class="section-title">التخصصات</div>
        <div class="row wrap gap-8 mb-12">
          ${specialties.map((s) => `<span class="chip" style="background:rgba(10,123,147,0.12);color:var(--primary);">${esc(s.arabic_name || s.name)}</span>`).join('')}
        </div>` : ''}

      ${camp.description ? `
        <div class="section-title">نبذة</div>
        <div class="card card-pad mb-12">${esc(camp.description)}</div>` : ''}

      ${camp.phones && camp.phones.length ? `
        <div class="section-title">للتواصل</div>
        <div class="row wrap gap-8 mb-12">
          ${camp.phones.map((p) => `<a class="chip" style="background:rgba(10,123,147,0.12);color:var(--primary);" href="tel:${esc(cleanPhone(p))}">${SNDK_ICONS.phone(13)} ${esc(p)}</a>`).join('')}
        </div>` : ''}

      <div id="registerArea" class="mt-16"></div>
    </div>
  `;

  wireImageFallbacks(document.getElementById('root'));
  document.getElementById('campShareBtn').addEventListener('click', () => {
    shareLink(`${window.location.origin}${sndkBasePath()}/camp/${camp.id}`, camp.title);
  });

  loadAvailability(camp);
}

function detailTile(icon, label, value) {
  return `
    <div class="card card-pad mb-12">
      <div class="row gap-8"><span>${icon}</span><span class="text-muted" style="font-size:11px;">${esc(label)}</span></div>
      <div class="mt-8" style="font-weight:600;white-space:pre-line;">${esc(value)}</div>
    </div>
  `;
}

async function loadAvailability(camp) {
  let availability = null;
  let failed = false;
  try {
    availability = await SndkApi.getData('get-camp-availability', { query: { camp_id: camp.id } });
  } catch (_) {
    failed = true;
  }
  currentAvailability = availability;
  currentAvailabilityFailed = failed;
  renderSeatsPanel(availability, failed);
  renderRegisterArea(camp, availability, failed);
}

function renderSeatsPanel(availability, failed) {
  const el = document.getElementById('seatsPanel');
  if (!availability) {
    el.innerHTML = failed
      ? `<div class="banner banner-error">تعذّر تحميل بيانات المقاعد.</div>`
      : '';
    return;
  }

  if (!availability.capacity_total) {
    el.innerHTML = `
      <div class="card card-pad" style="background:rgba(86,171,47,0.08);">
        <div class="row gap-8">${SNDK_ICONS.infinity(16)}<strong>سعة مفتوحة</strong></div>
        <div class="text-muted mt-8">عدد المسجَّلين حتى الآن: ${esc(String(availability.registrations_count))}</div>
      </div>
    `;
    return;
  }

  const remaining = availability.seats_remaining || 0;
  const capacity = availability.capacity_total || 1;
  const ratio = Math.min(1, availability.seats_used / capacity);
  const color = !availability.is_open ? SNDK_HEX.error : (ratio >= 0.85 ? SNDK_HEX.warning : SNDK_HEX.success);
  const statusText = availability.is_open
    ? `متبقٍّ ${remaining} مقعد`
    : (CAMP_REASON_MESSAGES[availability.reason] || 'غير متاح للتسجيل حالياً');

  el.innerHTML = `
    <div class="card card-pad">
      <div class="row spread">
        <div class="title-md">المقاعد</div>
        <div class="title-md" style="color:${color};">${esc(String(availability.seats_used))} / ${esc(String(capacity))}</div>
      </div>
      <div style="height:8px;border-radius:6px;background:${color}26;margin-top:10px;overflow:hidden;">
        <div style="height:100%;width:${Math.round(ratio * 100)}%;background:${color};"></div>
      </div>
      <div class="mt-8" style="font-weight:700;color:${color};">${esc(statusText)}</div>
    </div>
  `;
}

function renderRegisterArea(camp, availability, failed) {
  const el = document.getElementById('registerArea');

  if (!campRequiresRegistration(camp)) {
    el.innerHTML = notice(SNDK_ICONS.check(15), 'لا حاجة للتسجيل المسبق في هذا المخيم.');
    return;
  }

  if (!availability || !availability.is_open) {
    const text = availability
      ? (CAMP_REASON_MESSAGES[availability.reason] || 'التسجيل غير متاح حالياً.')
      : (failed ? 'تعذّر التحقق من إتاحة المقاعد.' : 'جارٍ التحقق من الإتاحة…');
    el.innerHTML = notice(failed ? SNDK_ICONS.offline(15) : SNDK_ICONS.blocked(15), text);
    return;
  }

  if (!campAllowsGuest(camp) && !SndkAuth.isLoggedIn()) {
    el.innerHTML = `
      ${notice(SNDK_ICONS.lock(15), 'هذا المخيم يتطلّب حساباً للتسجيل.')}
      <button class="btn btn-filled btn-block mt-12" id="campLoginBtn">تسجيل الدخول</button>
    `;
    document.getElementById('campLoginBtn').addEventListener('click', () => {
      SndkAuthUI.openLoginModal(() => loadAvailability(camp));
    });
    return;
  }

  el.innerHTML = `<button class="btn btn-filled btn-block" id="campRegisterBtn">سجّل الآن</button>`;
  document.getElementById('campRegisterBtn').addEventListener('click', () => {
    openRegisterForm(camp, availability);
  });
}

// لونٌ واحد — هوية الموقع، لا ترميز دلالي (خطأ/تحذير/معلومة بألوان مختلفة).
// النصّ نفسه هو ما يحمل الفرق بين حالة وأخرى، لا لون البطاقة.
function notice(icon, text) {
  return `
    <div class="card card-pad" style="background:${SNDK_HEX.primary}14;">
      <div class="row gap-8"><span>${icon}</span><span style="color:${SNDK_HEX.primary};font-weight:700;">${esc(text)}</span></div>
    </div>
  `;
}

// ─────────────────────────── فورم التسجيل ───────────────────────────

function openRegisterForm(camp, availability, initial) {
  const state = initial || {
    idempotencyKey: uidCamp(),
    name: (SndkAuth.currentUser() || {}).full_name || '',
    phone: (SndkAuth.currentUser() || {}).phone_number || '',
    gender: null,
    age: '',
    companions: 0,
    notes: '',
    grantToken: null,
  };

  const maxCompanions = campMaxCompanionsAllowed(camp, availability);
  state.companions = Math.min(state.companions, maxCompanions);

  const sheet = SndkBooking.openModal(`
    <h3 class="title-md">التسجيل في المخيم</h3>
    <p class="text-muted mt-8">${esc(camp.title)}</p>

    <label class="field-label mt-12">الاسم الكامل</label>
    <input class="field" id="campName" value="${esc(state.name)}" placeholder="الاسم الكامل">

    <label class="field-label">رقم الهاتف</label>
    <input class="field" id="campPhone" value="${esc(state.phone)}" placeholder="7XXXXXXXX"
           style="direction:ltr;text-align:right;" ${state.grantToken ? 'disabled' : ''}>
    ${state.grantToken ? `<p class="text-muted mt-8" style="margin-top:-8px;">${SNDK_ICONS.check(13)} رقمٌ موثَّق لهذا التسجيل</p>` : ''}

    <div class="row gap-8">
      <div style="flex:1;">
        <label class="field-label">الجنس (اختياري)</label>
        <select class="field" id="campGender">
          <option value="">—</option>
          <option value="male" ${state.gender === 'male' ? 'selected' : ''}>ذكر</option>
          <option value="female" ${state.gender === 'female' ? 'selected' : ''}>أنثى</option>
        </select>
      </div>
      <div style="flex:1;">
        <label class="field-label">العمر (اختياري)</label>
        <input class="field" id="campAge" type="number" min="0" max="130" value="${esc(state.age)}">
      </div>
    </div>

    <label class="field-label">مرافقون ${maxCompanions === 0 ? '(لا يوجد مقعد إضافي متاح)' : `(حتى ${maxCompanions})`}</label>
    <div class="row gap-12">
      <button type="button" class="btn btn-sm btn-outline" id="campCompanionsMinus" ${state.companions === 0 ? 'disabled' : ''}>−</button>
      <div id="campCompanionsValue" style="min-width:24px;text-align:center;font-weight:700;">${state.companions}</div>
      <button type="button" class="btn btn-sm btn-outline" id="campCompanionsPlus" ${state.companions >= maxCompanions ? 'disabled' : ''}>+</button>
    </div>

    <label class="field-label mt-12">ملاحظات (اختياري)</label>
    <textarea class="field" id="campNotes" rows="2">${esc(state.notes)}</textarea>

    <div id="campRegError"></div>
    <button class="btn btn-filled btn-block mt-12" id="campSubmitBtn">
      تسجيل ${state.companions + 1 > 1 ? `(${state.companions + 1} أشخاص)` : ''}
    </button>
  `);

  let companions = state.companions;
  const valueEl = sheet.querySelector('#campCompanionsValue');
  const submitBtn = sheet.querySelector('#campSubmitBtn');
  const minusBtn = sheet.querySelector('#campCompanionsMinus');
  const plusBtn = sheet.querySelector('#campCompanionsPlus');
  function refreshCompanionsLabel() {
    valueEl.textContent = String(companions);
    submitBtn.textContent = companions + 1 > 1 ? `تسجيل (${companions + 1} أشخاص)` : 'تسجيل';
    minusBtn.disabled = companions === 0;
    plusBtn.disabled = companions >= maxCompanions;
  }
  minusBtn.addEventListener('click', () => {
    if (companions > 0) { companions--; refreshCompanionsLabel(); }
  });
  plusBtn.addEventListener('click', () => {
    if (companions < maxCompanions) { companions++; refreshCompanionsLabel(); }
  });

  submitBtn.addEventListener('click', () => {
    state.name = sheet.querySelector('#campName').value.trim();
    state.phone = sheet.querySelector('#campPhone').value.trim();
    state.gender = sheet.querySelector('#campGender').value || null;
    state.age = sheet.querySelector('#campAge').value.trim();
    state.companions = companions;
    state.notes = sheet.querySelector('#campNotes').value.trim();
    submitRegistration(sheet, camp, availability, state, true);
  });

  return sheet;
}

function uidCamp() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function submitRegistration(sheet, camp, availability, state, allowVerificationPrompt) {
  const btn = sheet.querySelector('#campSubmitBtn');
  const errorEl = sheet.querySelector('#campRegError');
  errorEl.innerHTML = '';

  if (state.name.length < 3) {
    errorEl.innerHTML = '<div class="banner banner-error">الاسم قصير جداً.</div>';
    return;
  }
  if (state.phone.length < 7) {
    errorEl.innerHTML = '<div class="banner banner-error">رقم الهاتف غير صالح.</div>';
    return;
  }
  const parsedAge = state.age === '' ? null : Number(state.age);
  if (parsedAge !== null && (!Number.isInteger(parsedAge) || parsedAge < 0 || parsedAge > 130)) {
    errorEl.innerHTML = '<div class="banner banner-error">العمر غير صالح.</div>';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div>';

  try {
    const registration = await SndkApi.postData('register-camp', {
      camp_id: camp.id,
      full_name: state.name,
      phone: state.phone,
      gender: state.gender,
      age: parsedAge === null ? undefined : parsedAge,
      companions_count: state.companions,
      notes: state.notes || undefined,
      idempotency_key: state.idempotencyKey,
      grant_token: state.grantToken || undefined,
    }, { accessToken: await SndkAuth.validAccessToken() });

    showCampSuccess(registration);
    loadAvailability(camp);
  } catch (err) {
    if (err.code === 'PHONE_VERIFICATION_REQUIRED' && allowVerificationPrompt) {
      // يُعاد فتح الفورم بعد التوثيق بنفس القيم — لا يفقد المستخدم ما أدخله،
      // ولا تُكتب رسالة الخطأ التالية في ورقةٍ أُزيلت من الصفحة بالفعل.
      SndkBooking.openPhoneVerification(state.phone, (grantToken) => {
        state.grantToken = grantToken;
        const newSheet = openRegisterForm(camp, availability, state);
        submitRegistration(newSheet, camp, availability, state, false);
      }, 'camp');
      return;
    }
    errorEl.innerHTML = `<div class="banner banner-error">${esc(err.message)}</div>`;
    btn.disabled = false;
    btn.textContent = 'إعادة المحاولة';
  }
}

function showCampSuccess(registration) {
  const sheet = SndkBooking.openModal(`
    <div class="state-box">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="var(--primary)" stroke-width="2"/><path d="M8 12l3 3 5-6" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <div class="title-md mt-12" style="color:var(--text);">تمّ التسجيل بنجاح</div>
      ${registration && registration.serial_number != null ? `<p class="text-muted mt-8">رقم التسلسل: <strong>#${esc(String(registration.serial_number))}</strong></p>` : ''}
      ${registration && registration.registration_code ? `<p class="text-muted mt-8">رمز التسجيل: <strong>${esc(registration.registration_code)}</strong></p>` : ''}
      <button class="btn btn-filled btn-block mt-16" id="campDoneBtn">تم</button>
    </div>
  `);
  sheet.querySelector('#campDoneBtn').addEventListener('click', SndkBooking.closeModal);
}

main();
