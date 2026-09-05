// صفحة «مواعيدي» — نظير get-my-appointments بالحرف: دالة الحافة كانت
// جاهزة بالكامل (طابور اليوم الحيّ + إثراء الدفع المعلَّق) قبل بناء هذه
// الصفحة، فلا كودٌ خلفي جديد هنا لعرض القائمة أو الإلغاء (cancel-appointment
// جاهزة أيضاً). نمط التبويبين من camps.js حرفياً.
// esc/wireImageFallbacks/PERIOD_LABELS من common.js، sndkBasePath من
// routing.js، SndkBooking.openPaymentSheet من booking.js، QRCode من
// js/qrcode.js (مكتبة موَرَّدة محلياً — انظر تعليق رأسها).

const APPT_STATUS_LABELS = {
  pending: 'بانتظار التأكيد',
  confirmed: 'مؤكَّد',
  arrived: 'وصل',
  completed: 'منتهٍ',
  cancelled: 'ملغى',
  no_show: 'لم يحضر',
};

// حروفٌ سداسية حرفية لا `var(--x)` — لاحقة الشفافية (`1F`) تُلصَق بها نصّاً،
// و`var(--warning)1F` سلسلةٌ غير صالحة لا تُفسَّر (نفس القيد الحاكم لـ
// SNDK_HEX في common.js، والقيم هنا مطابِقة له حرفياً).
const APPT_STATUS_COLORS = {
  pending: SNDK_HEX.warning,
  confirmed: SNDK_HEX.success,
  arrived: SNDK_HEX.success,
  completed: SNDK_HEX.textMuted,
  cancelled: SNDK_HEX.error,
  no_show: SNDK_HEX.error,
};

// الحالات التي لا يزال إلغاؤها ممكناً منطقياً — نفس ما يفرضه
// cancel-appointment خادمياً (SNDC2/SNDC3)، مطابقةً هنا للتجربة فقط لا
// للأمان: الخادم يرفض أي محاولة تخالف هذا حتى لو أخفى العميل الزرّ.
const CANCELLABLE_STATUSES = new Set(['pending', 'confirmed', 'arrived']);

// ─────────────────────────── إخفاء محلّي من القائمة ───────────────────────────
//
// «حذف» بمعنى المستخدم هنا ليس حذفاً حقيقياً من سجلّ طبي — ذاك يحتاج ضمانات
// خادمية لا تتوفّر لأي عميل حالياً (لا حتى تطبيق فلاتر). هذا إخفاءٌ محلّي
// بحت (على هذا المتصفّح فقط)، رجعيّ بزرّ «إظهار المخفاة» — يفيد في إخفاء
// المنتهي/الملغى من القائمة بلا لمس القاعدة أو تعريض سجلّات المرفق للخطر.
const HIDDEN_KEY = 'sndk_hidden_appointments';
function hiddenIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]'));
  } catch (_) {
    return new Set();
  }
}
function hideAppointment(id) {
  const ids = hiddenIds();
  ids.add(id);
  localStorage.setItem(HIDDEN_KEY, JSON.stringify([...ids]));
}
function unhideAll() {
  localStorage.removeItem(HIDDEN_KEY);
}

function renderTopbar() {
  document.getElementById('topbarActions').innerHTML = SndkAuth.isLoggedIn()
    ? `<span class="text-muted" style="font-size:13px;">${esc((SndkAuth.currentUser() || {}).full_name || '')}</span>`
    : `<button class="btn btn-sm btn-outline" id="loginBtn">دخول</button>`;
  document.getElementById('loginBtn')?.addEventListener('click', () => {
    SndkAuthUI.openLoginModal(() => { renderTopbar(); main(); });
  });
}

function apptDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long' });
}

function isCancellable(a) {
  if (!CANCELLABLE_STATUSES.has(a.status)) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return new Date(a.booking_date) >= today;
}

function apptCardHtml(a) {
  const doctor = a.doctors || {};
  const facility = a.facilities || {};
  const period = PERIOD_LABELS[a.period] || a.period || '';
  const time = a.appointment_start_time
    ? a.appointment_start_time.slice(0, 5)
    : (a.slot_time ? String(a.slot_time).slice(0, 5) : '');
  const statusLabel = APPT_STATUS_LABELS[a.status] || a.status;
  const statusColor = APPT_STATUS_COLORS[a.status] || SNDK_HEX.textMuted;
  const qp = a.queue_position;
  const qrRef = a.booking_reference || a.booking_code;

  return `
    <div class="card card-pad mb-12" data-appt-id="${esc(a.id)}">
      <div class="row spread" style="align-items:flex-start;">
        <div style="flex:1;min-width:0;">
          <div class="title-md">${esc(doctor.name || 'موعد')}</div>
          <div class="text-muted mt-8" style="font-size:13px;">${esc(facility.name || '')}</div>
        </div>
        <span class="chip" style="background:${statusColor}1F;color:${statusColor};flex-shrink:0;">${esc(statusLabel)}</span>
      </div>

      <div class="row gap-8 mt-12">${SNDK_ICONS.calendar(14)}<span class="text-muted">${esc(apptDate(a.booking_date))}${period ? ` · ${esc(period)}` : ''}${time ? ` · ${esc(time)}` : ''}</span></div>

      ${qp ? `
        <div class="banner banner-info mt-12">
          أمامك <strong>${esc(String(qp.ahead_count))}</strong> · يُخدَم الآن دور <strong>#${esc(String(qp.now_serving))}</strong>
        </div>
      ` : ''}

      ${a.queue_number != null ? `<div class="text-muted mt-8" style="font-size:12px;">رقم دورك: ${esc(String(a.queue_number))}</div>` : ''}

      ${a.payment && a.payment.required === true ? `
        <div class="banner banner-warn mt-12">
          يوجد رسمٌ مستحقّ${a.payment.amount != null ? ` (${esc(Number(a.payment.amount).toFixed(2))} ${esc(a.payment.currency || '')})` : ''} على هذا الحجز.
        </div>
        <button class="btn btn-filled btn-block mt-8 pay-now-btn">ادفع الآن</button>
      ` : ''}

      <div class="row gap-8 wrap mt-12">
        ${qrRef ? `<button class="btn btn-sm btn-outline show-qr-btn" data-ref="${esc(qrRef)}">${SNDK_ICONS.grid(14)} الباركود</button>` : ''}
        ${isCancellable(a) ? `<button class="btn btn-sm btn-outline cancel-appt-btn" style="color:var(--error);">إلغاء الحجز</button>` : ''}
        <button class="btn btn-sm btn-outline hide-appt-btn" style="margin-inline-start:auto;">إخفاء</button>
      </div>
    </div>
  `;
}

function showQrModal(reference) {
  const sheet = sndkOpenModal(`
    <div class="state-box">
      <div class="title-md" style="color:var(--text);">باركود الموعد</div>
      <div id="qrCanvas" style="display:flex;justify-content:center;margin:16px 0;"></div>
      <p class="text-muted">${esc(reference)}</p>
      <button class="btn btn-filled btn-block mt-8" id="qrDoneBtn">تم</button>
    </div>
  `);
  new QRCode(sheet.querySelector('#qrCanvas'), {
    text: reference,
    width: 200,
    height: 200,
    colorDark: '#0A7B93',
    colorLight: '#ffffff',
  });
  sheet.querySelector('#qrDoneBtn').addEventListener('click', sndkCloseModal);
}

function confirmCancel(appointmentId, onDone) {
  const sheet = sndkOpenModal(`
    <div class="state-box">
      <div class="title-md" style="color:var(--text);">إلغاء الحجز</div>
      <p class="text-muted mt-8">هل أنت متأكد من إلغاء هذا الحجز؟ لا يمكن التراجع عن هذا الإجراء.</p>
      <div id="cancelError"></div>
      <button class="btn btn-filled btn-block mt-16" id="cancelConfirmBtn" style="background:var(--error);">تأكيد الإلغاء</button>
      <button class="btn btn-outline btn-block mt-8" id="cancelDismissBtn">تراجع</button>
    </div>
  `);
  sheet.querySelector('#cancelDismissBtn').addEventListener('click', sndkCloseModal);
  sheet.querySelector('#cancelConfirmBtn').addEventListener('click', async () => {
    const btn = sheet.querySelector('#cancelConfirmBtn');
    btn.disabled = true;
    btn.textContent = 'جارٍ الإلغاء…';
    try {
      await SndkApi.postData('cancel-appointment', { appointment_id: appointmentId }, {
        accessToken: await SndkAuth.validAccessToken(),
      });
      sndkCloseModal();
      onDone();
    } catch (err) {
      sheet.querySelector('#cancelError').innerHTML = `<div class="banner banner-error mt-8">${esc(err.message)}</div>`;
      btn.disabled = false;
      btn.textContent = 'تأكيد الإلغاء';
    }
  });
}

async function main() {
  renderTopbar();
  const root = document.getElementById('root');

  if (!SndkAuth.isLoggedIn()) {
    root.innerHTML = `
      <div class="card card-pad" style="text-align:center;margin-top:24px;">
        <div class="title-md">سجّل الدخول لعرض مواعيدك</div>
        <p class="text-muted mt-8">حجوزاتك مرتبطة بحسابك — سجّل الدخول لمتابعتها من الموقع.</p>
        <button class="btn btn-filled btn-block mt-16" id="verifyLoginBtn">تسجيل الدخول</button>
      </div>
    `;
    document.getElementById('verifyLoginBtn').addEventListener('click', () => {
      SndkAuthUI.openLoginModal(() => { renderTopbar(); main(); });
    });
    return;
  }

  const params = new URLSearchParams(window.location.search);
  let scope = params.get('scope') === 'past' ? 'past' : 'upcoming';
  let showHidden = false;

  async function load() {
    root.innerHTML = `
      <div class="tabs" id="scopeTabs" style="margin:0 0 16px;">
        <button class="tab ${scope === 'upcoming' ? 'active' : ''}" data-scope="upcoming">القادمة</button>
        <button class="tab ${scope === 'past' ? 'active' : ''}" data-scope="past">السابقة</button>
      </div>
      <div id="apptsBody">
        <div class="skeleton" style="height:100px;"></div>
        <div class="skeleton" style="height:100px;"></div>
      </div>
    `;
    document.querySelectorAll('#scopeTabs .tab').forEach((tab) => {
      tab.addEventListener('click', () => { scope = tab.dataset.scope; showHidden = false; load(); });
    });

    const body = document.getElementById('apptsBody');
    let rows;
    try {
      rows = await SndkApi.getData('get-my-appointments', {
        query: { scope },
        accessToken: await SndkAuth.validAccessToken(),
      });
    } catch (err) {
      body.innerHTML = `<div class="state-box">تعذّر تحميل مواعيدك.<br>${esc(err.message)}</div>`;
      return;
    }

    const hidden = hiddenIds();
    const visibleRows = showHidden ? (rows || []) : (rows || []).filter((a) => !hidden.has(a.id));
    const hiddenCount = (rows || []).length - visibleRows.length;

    const toggleHtml = hiddenCount > 0
      ? `<button class="btn btn-sm btn-outline mb-12" id="toggleHiddenBtn">${showHidden ? 'إخفاء المخفاة مجدَّداً' : `عرض المخفاة (${hiddenCount})`}</button>`
      : '';

    if (!visibleRows || visibleRows.length === 0) {
      body.innerHTML = toggleHtml + `<div class="state-box">${scope === 'upcoming' ? 'لا مواعيد قادمة.' : 'لا مواعيد سابقة.'}</div>`;
    } else {
      body.innerHTML = toggleHtml + visibleRows.map((a) => apptCardHtml(a)).join('');
    }

    document.getElementById('toggleHiddenBtn')?.addEventListener('click', () => {
      showHidden = !showHidden;
      load();
    });

    body.querySelectorAll('[data-appt-id]').forEach((card) => {
      const id = card.dataset.apptId;
      const row = rows.find((a) => a.id === id);
      if (!row) return;

      card.querySelector('.pay-now-btn')?.addEventListener('click', () => {
        SndkBooking.openPaymentSheet(row);
      });
      card.querySelector('.show-qr-btn')?.addEventListener('click', () => {
        showQrModal(card.querySelector('.show-qr-btn').dataset.ref);
      });
      card.querySelector('.cancel-appt-btn')?.addEventListener('click', () => {
        confirmCancel(id, load);
      });
      card.querySelector('.hide-appt-btn')?.addEventListener('click', () => {
        hideAppointment(id);
        load();
      });
    });
  }

  load();
}

sndkPrettifyUrl('/appointments');
main();
