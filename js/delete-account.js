// صفحة «حذف الحساب» — نظير `AccountDeletionService` في تطبيق فلاتر بالحرف:
// تنادي نفس دوال القاعدة المُحصَّنة (`request_account_deletion` /
// `cancel_account_deletion`) عبر PostgREST مباشرة (لا دالة حافة مخصّصة —
// الدوال نفسها SECURITY DEFINER وتقرأ الهوية من auth.uid()، فبوّابة الحافة
// لا تضيف شيئاً هنا). لا `SndkApi` لأنه مبنيّ لمسار `functions/v1/*` وحده.

const SndkAccountDeletion = (() => {
  const restBase = window.SNDK_CONFIG.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1';

  function headers(accessToken) {
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      apikey: window.SNDK_CONFIG.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    };
  }

  /// آخر طلب حذف لهذا المستخدم (إن وُجد) — سياسة RLS `adr_select_own` تحصر
  /// النتيجة بصاحبها تلقائياً، فلا حاجة لفلتر user_id هنا.
  async function myRequest(accessToken) {
    const res = await fetch(
      `${restBase}/account_deletion_requests?select=*&order=requested_at.desc&limit=1`,
      { headers: headers(accessToken) },
    );
    if (!res.ok) throw new Error('تعذّرت قراءة حالة الطلب.');
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  }

  async function callRpc(name, accessToken, body) {
    const res = await fetch(`${restBase}/rpc/${name}`, {
      method: 'POST',
      headers: headers(accessToken),
      body: JSON.stringify(body || {}),
    });
    if (res.ok) return;
    let code = 'unknown';
    try {
      const decoded = await res.json();
      code = String(decoded.message || decoded.code || 'unknown');
    } catch (_) {
      /* استجابة غير JSON — يبقى code = 'unknown' */
    }
    throw new SndkDeletionError(code);
  }

  const request = (accessToken, reason) =>
    callRpc('request_account_deletion', accessToken, { p_reason: reason || null });

  const cancel = (accessToken) => callRpc('cancel_account_deletion', accessToken, {});

  return { myRequest, request, cancel };
})();

class SndkDeletionError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }

  get arabicMessage() {
    const map = {
      ALREADY_REQUESTED: 'لديك طلب حذفٍ قيد المعالجة بالفعل.',
      LAST_SYSTEM_ADMIN: 'لا يمكن حذف حساب مدير النظام الوحيد. عيّن مديراً آخر أولاً من التطبيق.',
      NO_ACTIVE_REQUEST: 'لا يوجد طلب حذفٍ نشط لإلغائه.',
      AUTH_REQUIRED: 'يلزم تسجيل الدخول أولاً.',
    };
    return map[this.code] || 'تعذّر تنفيذ الطلب. حاول لاحقاً أو راسلنا على privacy@sndk-codey.onrender.com.';
  }
}

const STATUS_LABELS = {
  pending: { text: 'طلبك قيد مراجعة فريق سندك.', color: 'var(--warning)' },
  approved: 'موافَق عليه — سيُنفَّذ الحذف خلال المهلة المذكورة أعلاه. يمكنك الإلغاء قبل ذلك.',
  rejected: 'رُفض طلبك السابق. راسلنا إن كان لديك استفسار.',
  cancelled: null, // كأن لا طلب — يُعرض نموذج طلبٍ جديد.
  completed: 'نُفِّذ حذف حسابك بالكامل.',
};

function renderTopbar() {
  const el = document.getElementById('topbarActions');
  el.innerHTML = SndkAuth.isLoggedIn()
    ? `<span class="text-muted" style="font-size:13px;">${esc((SndkAuth.currentUser() || {}).full_name || '')}</span>
       <button class="btn btn-sm btn-outline" id="logoutBtn">خروج</button>`
    : `<button class="btn btn-sm btn-outline" id="loginBtn">دخول</button>`;

  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    SndkAuth.signOut();
    renderTopbar();
    renderDeletionBody();
  });
  document.getElementById('loginBtn')?.addEventListener('click', () =>
    SndkAuthUI.openLoginModal(() => {
      renderTopbar();
      renderDeletionBody();
    }),
  );
}

async function renderDeletionBody() {
  const body = document.getElementById('deletionBody');

  if (!SndkAuth.isLoggedIn()) {
    body.innerHTML = `
      <p class="text-muted" style="margin:0 0 12px;">سجّل الدخول بحساب سندك الطبي لإرسال طلب الحذف.</p>
      <button class="btn btn-filled" id="deletionLoginBtn">تسجيل الدخول</button>
    `;
    document.getElementById('deletionLoginBtn')?.addEventListener('click', () =>
      SndkAuthUI.openLoginModal(() => {
        renderTopbar();
        renderDeletionBody();
      }),
    );
    return;
  }

  body.innerHTML = '<div class="skeleton" style="height:44px;"></div>';

  let token;
  try {
    token = await SndkAuth.validAccessToken();
  } catch (_) {
    body.innerHTML = `<div class="state-box">تعذّر التحقّق من الجلسة. سجّل الدخول مرة أخرى.</div>`;
    return;
  }

  let existing = null;
  try {
    existing = await SndkAccountDeletion.myRequest(token);
  } catch (e) {
    body.innerHTML = `<div class="state-box">${esc(e.message || 'تعذّر تحميل حالة الطلب.')}</div>`;
    return;
  }

  const isActive = existing && (existing.status === 'pending' || existing.status === 'approved');

  if (isActive) {
    const info = STATUS_LABELS[existing.status];
    const purgeLine = existing.status === 'approved' && existing.scheduled_purge_at
      ? `<p class="text-muted" style="margin:8px 0 0;font-size:13px;">موعد التنفيذ: ${esc(new Date(existing.scheduled_purge_at).toLocaleDateString('ar'))}</p>`
      : '';
    body.innerHTML = `
      <p style="margin:0;color:${info.color || 'var(--text)'};">${esc(info.text || info)}</p>
      ${purgeLine}
      <button class="btn btn-outline mt-16" id="cancelDeletionBtn">إلغاء الطلب</button>
      <div id="deletionMsg" class="mt-8"></div>
    `;
    document.getElementById('cancelDeletionBtn')?.addEventListener('click', async () => {
      const msg = document.getElementById('deletionMsg');
      try {
        await SndkAccountDeletion.cancel(token);
        renderDeletionBody();
      } catch (e) {
        msg.innerHTML = `<p style="color:var(--error);margin:0;">${esc(e.arabicMessage || e.message)}</p>`;
      }
    });
    return;
  }

  body.innerHTML = `
    <label style="display:block;font-size:13px;color:var(--text-muted);margin-bottom:6px;">سبب الحذف (اختياري)</label>
    <textarea id="deletionReason" rows="3" style="width:100%;border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;font-family:inherit;font-size:14px;" maxlength="1000"></textarea>
    <button class="btn btn-filled mt-16" id="submitDeletionBtn" style="background:var(--error);">إرسال طلب الحذف</button>
    <div id="deletionMsg" class="mt-8"></div>
  `;
  document.getElementById('submitDeletionBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('submitDeletionBtn');
    const msg = document.getElementById('deletionMsg');
    const reason = document.getElementById('deletionReason').value.trim();
    if (!confirm('هذا الإجراء نهائي بعد انقضاء المهلة. هل تريد المتابعة؟')) return;
    btn.disabled = true;
    try {
      await SndkAccountDeletion.request(token, reason);
      renderDeletionBody();
    } catch (e) {
      msg.innerHTML = `<p style="color:var(--error);margin:0;">${esc(e.arabicMessage || e.message)}</p>`;
      btn.disabled = false;
    }
  });
}

renderTopbar();
renderDeletionBody();
SndkAuth.onChange(() => {
  renderTopbar();
  renderDeletionBody();
});
