// صفحة «مواعيدي» — نظير get-my-appointments بالحرف: دالة الحافة كانت
// جاهزة بالكامل (طابور اليوم الحيّ + إثراء الدفع المعلَّق) قبل بناء هذه
// الصفحة، فلا كودٌ خلفي جديد هنا. نمط التبويبين من camps.js حرفياً.
// esc/wireImageFallbacks/PERIOD_LABELS من common.js، sndkBasePath من
// routing.js، SndkBooking.openPaymentSheet من booking.js (مُصدَّرة لهذه
// الصفحة تحديداً — نفس ورقة الدفع المدمجة/التحويل بلا تكرار منطق).

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

  return `
    <div class="card card-pad mb-12">
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
        <button class="btn btn-filled btn-block mt-8 pay-now-btn" data-appt-id="${esc(a.id)}">ادفع الآن</button>
      ` : ''}
    </div>
  `;
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
      tab.addEventListener('click', () => { scope = tab.dataset.scope; load(); });
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

    if (!rows || rows.length === 0) {
      body.innerHTML = `<div class="state-box">${scope === 'upcoming' ? 'لا مواعيد قادمة.' : 'لا مواعيد سابقة.'}</div>`;
      return;
    }

    body.innerHTML = rows.map((a) => apptCardHtml(a)).join('');

    body.querySelectorAll('.pay-now-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = rows.find((a) => a.id === btn.dataset.apptId);
        if (row) SndkBooking.openPaymentSheet(row);
      });
    });
  }

  load();
}

main();
