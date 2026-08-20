// تدفّق الحجز — نظير appointment_booking_screen.dart + booking_confirmation_sheet.dart
// بالحرف: نفس الأفعال (get-schedule-availability, get-booking-eligibility,
// start-phone-verification, verify-phone-code, create-appointment)، ونفس
// ترتيب الخطوات وأسباب الرفض.

const SndkBooking = (() => {
  const DAY_LABELS_AR = ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'];
  const REASON_MESSAGES = {
    NOT_WORKING_DAY: 'لا دوام في هذا اليوم',
    OUTSIDE_SCHEDULE: 'خارج فترة الجدولة',
    DOCTOR_ABSENT: 'الطبيب في غياب مؤقت',
    FULL: 'اكتمل العدد',
    SCHEDULE_UNAVAILABLE: 'الحجز غير متاح لهذه العيادة',
    DAY_WINDOW_CLOSED: 'انتهى وقت استقبال حجوزات اليوم',
  };

  function appWeekday(date) {
    // ترقيم التطبيق: السبت = 0 … الجمعة = 6.
    return (date.getDay() + 1) % 7;
  }

  function dateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function uid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  let overlayEl = null;

  function closeModal() {
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }
  }

  function openModal(innerHtml) {
    closeModal();
    overlayEl = document.createElement('div');
    overlayEl.className = 'modal-overlay';
    overlayEl.innerHTML = `<div class="modal-sheet"><div class="modal-handle"></div>${innerHtml}</div>`;
    overlayEl.addEventListener('click', (e) => {
      if (e.target === overlayEl) closeModal();
    });
    document.body.appendChild(overlayEl);
    return overlayEl.querySelector('.modal-sheet');
  }

  // ─────────────────────────── لوحة الأيام ───────────────────────────

  async function start(schedule, facility) {
    if (!SndkAuth.isLoggedIn()) {
      SndkAuthUI.openLoginModal(() => start(schedule, facility));
      return;
    }

    const sheet = openModal(`
      <h3 class="title-md">اختر يوم الحجز</h3>
      <p class="text-muted mt-8">${schedule.doctors ? schedule.doctors.name : ''}</p>
      <div id="availBody" class="mt-16"><div class="row" style="justify-content:center;padding:32px 0;"><div class="spinner spinner-dark"></div></div></div>
    `);

    let availability;
    try {
      availability = await SndkApi.getData('get-schedule-availability', {
        query: { schedule_id: schedule.id },
        accessToken: await SndkAuth.validAccessToken(),
      });
    } catch (err) {
      sheet.querySelector('#availBody').innerHTML =
        `<div class="banner banner-error">تعذّر تحميل التوفّر. ${err.message || ''}</div>`;
      return;
    }

    renderCalendar(sheet, availability, schedule, facility);
  }

  function renderCalendar(sheet, availability, schedule, facility) {
    const days = availability.days || [];
    const byKey = {};
    for (const d of days) {
      const dt = new Date(d.date);
      byKey[dateKey(dt)] = { ...d, dateObj: dt };
    }
    if (days.length === 0) {
      sheet.querySelector('#availBody').innerHTML =
        '<div class="state-box">لا مواعيد متاحة لهذه الجدولة حالياً.</div>';
      return;
    }

    const months = [...new Set(days.map((d) => {
      const dt = new Date(d.date);
      return `${dt.getFullYear()}-${dt.getMonth()}`;
    }))];
    let monthIndex = 0;

    function draw() {
      const [year, month] = months[monthIndex].split('-').map(Number);
      const first = new Date(year, month, 1);
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const leading = appWeekday(first);
      let cells = '';
      for (let i = 0; i < leading; i++) cells += '<div class="cal-day empty"></div>';
      const todayKey = dateKey(new Date());
      for (let day = 1; day <= daysInMonth; day++) {
        const dt = new Date(year, month, day);
        const key = dateKey(dt);
        const info = byKey[key];
        if (!info) { cells += '<div class="cal-day empty"></div>'; continue; }
        const classes = ['cal-day'];
        if (!info.is_bookable) classes.push('blocked');
        if (key === todayKey) classes.push('today');
        cells += `<div class="${classes.join(' ')}" data-key="${key}" title="${info.is_bookable ? '' : (REASON_MESSAGES[info.reason] || '')}">${day}</div>`;
      }

      const canPrev = monthIndex > 0;
      const canNext = monthIndex < months.length - 1;
      const monthName = first.toLocaleDateString('ar', { month: 'long', year: 'numeric' });

      sheet.querySelector('#availBody').innerHTML = `
        <div class="row spread">
          <button class="btn btn-sm btn-outline" ${canPrev ? '' : 'disabled'} id="calPrev">›</button>
          <div class="title-md">${monthName}</div>
          <button class="btn btn-sm btn-outline" ${canNext ? '' : 'disabled'} id="calNext">‹</button>
        </div>
        <div class="calendar-grid" style="margin-top:14px;">
          ${DAY_LABELS_AR.map((l) => `<div style="text-align:center;font-size:11px;color:var(--text-muted);font-weight:700;">${l}</div>`).join('')}
          ${cells}
        </div>
        <div id="dayPanel" class="mt-16"></div>
      `;

      sheet.querySelector('#calPrev')?.addEventListener('click', () => { monthIndex--; draw(); });
      sheet.querySelector('#calNext')?.addEventListener('click', () => { monthIndex++; draw(); });
      sheet.querySelectorAll('.cal-day[data-key]').forEach((el) => {
        el.addEventListener('click', () => {
          const info = byKey[el.dataset.key];
          if (!info || !info.is_bookable) return;
          sheet.querySelectorAll('.cal-day').forEach((c) => c.classList.remove('selected'));
          el.classList.add('selected');
          renderDayPanel(sheet, info, schedule, facility);
        });
      });
    }
    draw();
  }

  function renderDayPanel(sheet, day, schedule, facility) {
    const dateLabel = day.dateObj.toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long' });
    const turnLine = day.next_queue_number != null
      ? `دورك المتوقّع: ${day.next_queue_number}${day.next_slot_time ? ' · ' + day.next_slot_time : ''}`
      : 'يُحدَّد دورك عند التأكيد';

    sheet.querySelector('#dayPanel').innerHTML = `
      <div class="card card-pad">
        <div class="title-md">${dateLabel}</div>
        <p class="text-muted mt-8">${turnLine}</p>
        <button class="btn btn-filled btn-block mt-12" id="confirmDayBtn">متابعة الحجز</button>
      </div>
    `;
    sheet.querySelector('#confirmDayBtn').addEventListener('click', () => {
      openConfirmSheet(schedule, facility, day);
    });
  }

  // ─────────────────────────── ورقة التأكيد ───────────────────────────

  async function openConfirmSheet(schedule, facility, day) {
    const idempotencyKey = uid();
    const user = SndkAuth.currentUser() || {};

    const sheet = openModal(`
      <h3 class="title-md">تأكيد الحجز</h3>
      <div class="card card-pad mt-12" style="background:var(--surface-2);">
        <div>${schedule.doctors ? schedule.doctors.name : ''}</div>
        <div class="text-muted mt-8">${day.dateObj.toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      </div>
      <div id="confirmBody" class="mt-16"><div class="row" style="justify-content:center;padding:24px 0;"><div class="spinner spinner-dark"></div></div></div>
    `);

    let eligibility = { max_companions: 0, verified_phone: null };
    try {
      eligibility = await SndkApi.getData('get-booking-eligibility', {
        query: { facility_id: facility.id, schedule_id: schedule.id },
        accessToken: await SndkAuth.validAccessToken(),
      });
    } catch (_) { /* الورقة تكمل بلا مرافقين وبخانة رقم حرّة — كحال التطبيق */ }

    const maxCompanions = Number(eligibility.max_companions || 0);
    const verifiedPhone = eligibility.verified_phone || null;

    sheet.querySelector('#confirmBody').innerHTML = `
      <label class="field-label">اسم المريض</label>
      <input class="field" id="patientName" value="${user.full_name || ''}" placeholder="الاسم الكامل">

      <label class="field-label">رقم الهاتف</label>
      ${verifiedPhone
        ? `<input class="field" id="patientPhone" value="${verifiedPhone}" disabled style="direction:ltr;text-align:right;">`
        : `<input class="field" id="patientPhone" placeholder="7XXXXXXXX" value="${user.phone_number || ''}">`}

      ${maxCompanions > 0 ? `
        <label class="field-label">مرافقون (اختياري، حتى ${maxCompanions})</label>
        <div id="companionsList"></div>
        <button type="button" class="btn btn-sm btn-outline" id="addCompanionBtn">+ إضافة مرافق</button>
      ` : ''}

      <label class="field-label mt-12">ملاحظات (اختياري)</label>
      <textarea class="field" id="bookingNotes" rows="2"></textarea>

      <div id="confirmError"></div>
      <button class="btn btn-filled btn-block mt-12" id="submitBookingBtn">تأكيد الحجز</button>
    `;

    let companionRows = [];
    const companionsListEl = sheet.querySelector('#companionsList');
    function addCompanionRow() {
      if (companionRows.length >= maxCompanions) return;
      const row = document.createElement('div');
      row.className = 'row gap-8 mb-12';
      row.innerHTML = `
        <input class="field" style="margin:0;" placeholder="اسم المرافق">
        <input class="field" style="margin:0;" placeholder="هاتف المرافق">
        <button type="button" class="btn btn-sm btn-outline" style="flex-shrink:0;">حذف</button>
      `;
      const [nameInput, phoneInput, removeBtn] = row.children;
      removeBtn.addEventListener('click', () => {
        companionRows = companionRows.filter((r) => r !== row);
        row.remove();
      });
      companionRows.push(row);
      companionsListEl.appendChild(row);
    }
    sheet.querySelector('#addCompanionBtn')?.addEventListener('click', addCompanionRow);

    async function submit(allowVerificationPrompt = true) {
      const btn = sheet.querySelector('#submitBookingBtn');
      const errorEl = sheet.querySelector('#confirmError');
      errorEl.innerHTML = '';
      const patientName = sheet.querySelector('#patientName').value.trim();
      const patientPhone = verifiedPhone || sheet.querySelector('#patientPhone').value.trim();
      if (patientName.length < 3) {
        errorEl.innerHTML = '<div class="banner banner-error">الاسم قصير جداً.</div>';
        return;
      }
      const companions = companionRows
        .map((row) => ({
          name: row.children[0].value.trim(),
          phone: row.children[1].value.trim(),
        }))
        .filter((c) => c.phone !== '');

      btn.disabled = true;
      btn.innerHTML = '<div class="spinner"></div>';

      try {
        const appointment = await SndkApi.postData('create-appointment', {
          schedule_id: schedule.id,
          booking_date: dateKey(day.dateObj),
          patient_name: patientName,
          patient_phone: patientPhone,
          companions: companions.length ? companions : undefined,
          notes: sheet.querySelector('#bookingNotes').value.trim() || undefined,
          idempotency_key: idempotencyKey,
        }, { accessToken: await SndkAuth.validAccessToken() });

        showSuccess(appointment);
      } catch (err) {
        if (err.code === 'PHONE_VERIFICATION_REQUIRED' && allowVerificationPrompt) {
          openPhoneVerification(patientPhone, async () => {
            await submit(false);
          });
          btn.disabled = false;
          btn.textContent = 'تأكيد الحجز';
          return;
        }
        errorEl.innerHTML = `<div class="banner banner-error">${err.message}</div>`;
        btn.disabled = false;
        btn.textContent = 'تأكيد الحجز';
      }
    }

    sheet.querySelector('#submitBookingBtn').addEventListener('click', () => submit(true));
  }

  // ─────────────────────────── توثيق الهاتف ───────────────────────────

  function openPhoneVerification(phone, onVerified) {
    const sheet = openModal(`
      <h3 class="title-md">توثيق رقم الهاتف</h3>
      <p class="text-muted mt-8">السياسة تشترط رقماً موثَّقاً — أرسلنا رمزاً إلى ${phone}.</p>
      <div id="verifyBody" class="mt-16">
        <button class="btn btn-filled btn-block" id="sendCodeBtn">إرسال رمز التحقق</button>
        <div id="verifyError" class="mt-12"></div>
      </div>
    `);

    async function sendCode() {
      const errorEl = sheet.querySelector('#verifyError');
      errorEl.innerHTML = '';
      try {
        await SndkApi.postData('start-phone-verification', {
          phone, purpose: 'account', locale: 'ar',
        }, { accessToken: await SndkAuth.validAccessToken() });

        sheet.querySelector('#verifyBody').innerHTML = `
          <label class="field-label">رمز التحقق</label>
          <input class="field" id="otpInput" inputmode="numeric" maxlength="6" placeholder="------" style="text-align:center;letter-spacing:4px;font-size:20px;">
          <div id="verifyError2"></div>
          <button class="btn btn-filled btn-block mt-12" id="verifyBtn">تأكيد الرمز</button>
        `;
        sheet.querySelector('#verifyBtn').addEventListener('click', async () => {
          const code = sheet.querySelector('#otpInput').value.trim();
          const err2 = sheet.querySelector('#verifyError2');
          try {
            await SndkApi.postData('verify-phone-code', {
              phone, code, purpose: 'account',
            }, { accessToken: await SndkAuth.validAccessToken() });
            closeModal();
            onVerified();
          } catch (err) {
            err2.innerHTML = `<div class="banner banner-error mt-8">${err.message}</div>`;
          }
        });
      } catch (err) {
        errorEl.innerHTML = `<div class="banner banner-error">${err.message}</div>`;
      }
    }
    sheet.querySelector('#sendCodeBtn').addEventListener('click', sendCode);
  }

  function showSuccess(appointment) {
    const token = appointment && appointment.queue_number;
    openModal(`
      <div class="state-box">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#56AB2F" stroke-width="2"/><path d="M8 12l3 3 5-6" stroke="#56AB2F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <div class="title-md mt-12" style="color:var(--text);">تمّ الحجز بنجاح</div>
        ${token ? `<p class="text-muted mt-8">رقم دورك: <strong>${token}</strong></p>` : ''}
        <p class="text-muted mt-8">يمكنك متابعة حجوزاتك من تطبيق sndk.app.</p>
        <button class="btn btn-filled btn-block mt-16" onclick="SndkBookingClose()">تم</button>
      </div>
    `);
  }

  window.SndkBookingClose = closeModal;

  return { start, closeModal };
})();
