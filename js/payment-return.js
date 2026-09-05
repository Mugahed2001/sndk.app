// وجهة عودة Stripe بعد Checkout Session — نظير BookingPaymentSheet's
// `_listen` بالحرف: الثقة من `payment-status` وحده، لا من مجرّد الوصول
// إلى هذه الصفحة (عودةٌ للمتصفّح ليست دليل دفع). كانت هذه الوجهة تُفضي إلى
// دالة `payment-status` الخام (POST فقط) قبل بناء هذه الصفحة — أي ٤٠٥ صريح
// لكل مستخدم يُعاد توجيهه من Stripe. `SndkPayment.watch`/`refreshStatus`
// من payment.js، esc من common.js، sndkBasePath من routing.js.

function renderTopbar() {
  document.getElementById('topbarActions').innerHTML = SndkAuth.isLoggedIn()
    ? `<span class="text-muted" style="font-size:13px;">${esc((SndkAuth.currentUser() || {}).full_name || '')}</span>`
    : '';
}

function render(phase, data) {
  const root = document.getElementById('root');

  if (phase === 'waiting') {
    root.innerHTML = `
      <div class="state-box">
        <div class="row" style="justify-content:center;padding:24px 0;"><div class="spinner spinner-dark"></div></div>
        <div class="title-md" style="color:var(--text);">جارٍ التحقّق من نتيجة الدفع…</div>
        <p class="text-muted mt-8">لحظاتٌ ونعرض لك النتيجة النهائية.</p>
      </div>
    `;
  } else if (phase === 'paid') {
    root.innerHTML = `
      <div class="state-box">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="var(--primary)" stroke-width="2"/><path d="M8 12l3 3 5-6" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <div class="title-md mt-12" style="color:var(--text);">تمّ الدفع وتأكيد الحجز</div>
        <p class="text-muted mt-8">يمكنك متابعة موعدك وباركوده من صفحة مواعيدي.</p>
        <a class="btn btn-filled btn-block mt-16" href="${sndkBasePath()}/appointments">عرض مواعيدي</a>
      </div>
    `;
  } else if (phase === 'failed') {
    root.innerHTML = `
      <div class="state-box">
        <div class="banner banner-error" style="justify-content:center;">لم يكتمل الدفع — يمكنك إعادة المحاولة من صفحة مواعيدك.</div>
        <a class="btn btn-filled btn-block mt-16" href="${sndkBasePath()}/appointments">عرض مواعيدي</a>
      </div>
    `;
  } else if (phase === 'timedOut') {
    root.innerHTML = `
      <div class="state-box">
        <div class="banner banner-warn" style="justify-content:center;">لم تصلنا نتيجة الدفع بعد — قد تكون قد تمّت فعلاً. راجع صفحة مواعيدك للتأكّد.</div>
        <a class="btn btn-filled btn-block mt-16" href="${sndkBasePath()}/appointments">عرض مواعيدي</a>
      </div>
    `;
  } else if (phase === 'error') {
    root.innerHTML = `
      <div class="state-box">
        <div class="banner banner-error" style="justify-content:center;">${esc(data || 'تعذّر التحقّق من نتيجة الدفع.')}</div>
        <a class="btn btn-filled btn-block mt-16" href="${sndkBasePath()}/appointments">عرض مواعيدي</a>
      </div>
    `;
  } else if (phase === 'invalid') {
    root.innerHTML = `<div class="state-box">رابطٌ غير صالح — لا مرجع دفع فيه.</div>`;
  } else if (phase === 'loginRequired') {
    root.innerHTML = `
      <div class="state-box">
        <div class="title-md">سجّل الدخول لعرض نتيجة الدفع</div>
        <button class="btn btn-filled btn-block mt-16" id="returnLoginBtn">تسجيل الدخول</button>
      </div>
    `;
    document.getElementById('returnLoginBtn').addEventListener('click', () => {
      SndkAuthUI.openLoginModal(() => { renderTopbar(); main(); });
    });
  }
}

async function main() {
  renderTopbar();

  const params = new URLSearchParams(window.location.search);
  const reference = params.get('reference');
  if (!reference) {
    render('invalid');
    return;
  }

  if (!SndkAuth.isLoggedIn()) {
    render('loginRequired');
    return;
  }

  render('waiting');

  // نداءٌ فوريّ أولاً — الدفع غالباً استقرّ فعلياً بحلول عودة المستخدم من
  // Stripe، فلا داعي لانتظار التأخير الأول في `watch` (٢ث) قبل أوّل قراءة.
  let fresh;
  try {
    fresh = await SndkPayment.refreshStatus(reference);
  } catch (err) {
    render('error', err.message);
    return;
  }

  if (fresh && !PAYMENT_IN_FLIGHT.has(fresh.status)) {
    render(PAYMENT_SETTLED.has(fresh.status) ? 'paid' : 'failed');
    return;
  }

  SndkPayment.watch(reference, (result) => {
    if (result === null) { render('timedOut'); return; }
    if (PAYMENT_SETTLED.has(result.status)) render('paid');
    else if (!PAYMENT_IN_FLIGHT.has(result.status)) render('failed');
    // جارية: تبقى «waiting» حتى الجولة التالية.
  });
}

main();
