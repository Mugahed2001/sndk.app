// صفحة إعادة تعيين كلمة المرور — موضوعة داخل هوية الموقع نفسه، مع تواصل
// آمن مع Supabase Auth، ثم تفرّغ تجربة استعادة صحيحة داخل الموقع الرسمي.
const SndkRest = (() => {
  function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function emailError(message) {
    const error = document.getElementById('resetError');
    if (!error) return;
    error.innerHTML = `<div class="banner banner-error mt-8">${esc(message)}</div>`;
  }

  function parseQuery() {
    const params = new URLSearchParams(window.location.search);
    return {
      type: params.get('type'),
      token: params.get('token'),
      code: params.get('code'),
      redirectTo: params.get('redirect_to') || params.get('redirect') || 'https://snadk.codeysaa.com/rest',
    };
  }

  function parseHash() {
    const raw = (window.location.hash || '').replace(/^#/, '');
    const params = new URLSearchParams(raw);
    return {
      access_token: params.get('access_token'),
      refresh_token: params.get('refresh_token'),
      expires_in: params.get('expires_in'),
      token_type: params.get('token_type'),
      type: params.get('type'),
      token: params.get('token'),
      redirectTo: params.get('redirect_to') || 'https://snadk.codeysaa.com/rest',
    };
  }

  async function sendReset(email) {
    const base = window.SNDK_CONFIG.SUPABASE_URL.replace(/\/+$/, '');
    const url = `${base}/auth/v1/recover`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        apikey: window.SNDK_CONFIG.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        email,
        redirect_to: 'https://snadk.codeysaa.com/rest',
      }),
    });

    if (!response.ok) {
      let payload = {};
      try { payload = await response.json(); } catch (_) {}
      const message = payload.message || payload.error_description || 'تعذّر إرسال رابط إعادة التعيين.';
      throw new Error(message);
    }

    return true;
  }

  async function updatePassword(password, token, type, redirectTo) {
    const base = window.SNDK_CONFIG.SUPABASE_URL.replace(/\/+$/, '');
    const url = `${base}/auth/v1/verify?token=${encodeURIComponent(token)}&type=${encodeURIComponent(type)}&redirect_to=${encodeURIComponent(redirectTo)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        apikey: window.SNDK_CONFIG.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ password }),
    });

    if (!response.ok) {
      let payload = {};
      try { payload = await response.json(); } catch (_) {}
      const message = payload.message || payload.error_description || 'تعذّر تحديث كلمة المرور.';
      throw new Error(message);
    }

    return true;
  }

  function renderRecoveryForm(token, type, redirectTo) {
    const panel = document.getElementById('resetPanel');
    const success = document.getElementById('resetSuccess');
    const error = document.getElementById('resetError');

    if (!panel || !success || !error) return;

    panel.innerHTML = `
      <div class="title-md" style="margin-bottom:12px;text-align:center;">إدخال كلمة مرور جديدة</div>
      <p class="text-muted" style="text-align:center;line-height:1.8;margin:0 0 16px;">
        اختر كلمة مرور قوية لحسابك في سندك الطبي.
      </p>
      <div id="newPasswordFormWrap">
        <label class="field-label" for="newPassword">كلمة المرور الجديدة</label>
        <input class="field" id="newPassword" type="password" placeholder="••••••••" autocomplete="new-password" minlength="6">
        <label class="field-label mt-12" for="newPasswordRepeat">تأكيد كلمة المرور</label>
        <input class="field" id="newPasswordRepeat" type="password" placeholder="••••••••" autocomplete="new-password" minlength="6">
        <div id="resetError" class="mt-8"></div>
        <button class="btn btn-filled btn-block mt-12" id="newPasswordSubmit">تحديث كلمة المرور</button>
      </div>
    `;

    const pw = document.getElementById('newPassword');
    const pwRepeat = document.getElementById('newPasswordRepeat');
    const submit = document.getElementById('newPasswordSubmit');
    const newError = document.getElementById('resetError');

    submit.addEventListener('click', async () => {
      const password = String(pw.value || '').trim();
      const repeated = String(pwRepeat.value || '').trim();
      if (password.length < 6) {
        newError.innerHTML = '<div class="banner banner-error mt-8">كلمة المرور يجب أن تكون ٦ أحرف على الأقل.</div>';
        return;
      }
      if (password !== repeated) {
        newError.innerHTML = '<div class="banner banner-error mt-8">كلمتا المرور غير متطابقتين.</div>';
        return;
      }

      submit.disabled = true;
      submit.textContent = 'جارٍ التحديث...';
      newError.innerHTML = '';

      try {
        await updatePassword(password, token, type, redirectTo);
        panel.innerHTML = '';
        success.hidden = false;
        success.innerHTML = `<div class="banner banner-info">تم تحديث كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.</div>`;
      } catch (err) {
        newError.innerHTML = `<div class="banner banner-error mt-8">${esc(err.message || 'تعذّر تحديث كلمة المرور.')}</div>`;
      } finally {
        submit.disabled = false;
        submit.textContent = 'تحديث كلمة المرور';
      }
    });
  }

  function init() {
    const form = document.getElementById('resetForm');
    if (!form) return;

    const email = document.getElementById('resetEmail');
    const submit = document.getElementById('resetSubmitBtn');
    const error = document.getElementById('resetError');
    const panel = document.getElementById('resetPanel');
    const success = document.getElementById('resetSuccess');

    const query = parseQuery();
    const hash = parseHash();
    const token = query.token || query.code || hash.token || null;
    const type = query.type || hash.type || 'recovery';
    const redirectTo = query.redirectTo || hash.redirectTo || 'https://snadk.codeysaa.com/rest';

    if (type === 'recovery' && token) {
      renderRecoveryForm(token, type, redirectTo);
      return;
    }

    form.addEventListener('submit', async (evt) => {
      evt.preventDefault();

      const value = normalizeEmail(email.value);
      if (!value || !value.includes('@')) {
        emailError('يرجى إدخال بريد إلكتروني صحيح.');
        return;
      }

      submit.disabled = true;
      submit.textContent = 'جارٍ الإرسال...';
      error.innerHTML = '';

      try {
        await sendReset(value);
        panel.hidden = true;
        success.hidden = false;
      } catch (err) {
        emailError(err.message || 'تعذّر إرسال رابط الإعادة.');
      } finally {
        submit.disabled = false;
        submit.textContent = 'إرسال رابط إعادة التعيين';
      }
    });
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  if (window.SNDK_CONFIG && window.SNDK_CONFIG.SUPABASE_URL) {
    SndkRest.init();
  }
});
