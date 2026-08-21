// واجهة الدخول والتسجيل — نظير login_screen.dart/signup_screen.dart، بريد
// وكلمة مرور فقط (نفس ما تقبله `sign-in`/`sign-up`).

const SndkAuthUI = (() => {
  function modal(innerHtml) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-sheet">${innerHtml}</div>`;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function openLoginModal(onSuccess) {
    let mode = 'login'; // 'login' | 'signup'
    const overlay = modal('<div id="authModalBody"></div>');
    const body = overlay.querySelector('#authModalBody');

    function draw() {
      body.innerHTML = mode === 'login' ? `
        <h3 class="title-md">تسجيل الدخول</h3>
        <p class="text-muted mt-8">سجّل الدخول لإتمام الحجز ومتابعته لاحقاً.</p>
        <label class="field-label mt-12">البريد الإلكتروني</label>
        <input class="field" id="authEmail" type="email" placeholder="name@example.com">
        <label class="field-label">كلمة المرور</label>
        <input class="field" id="authPassword" type="password" placeholder="••••••••">
        <div id="authError"></div>
        <button class="btn btn-filled btn-block mt-12" id="authSubmitBtn">دخول</button>
        <p class="text-muted mt-12" style="text-align:center;">
          ليس لديك حساب؟ <a href="#" id="switchToSignup" style="color:var(--primary);font-weight:700;">أنشئ حساباً</a>
        </p>
      ` : `
        <h3 class="title-md">حساب جديد</h3>
        <label class="field-label mt-12">الاسم الكامل</label>
        <input class="field" id="authName" placeholder="الاسم كما يظهر في حجوزاتك">
        <label class="field-label">البريد الإلكتروني</label>
        <input class="field" id="authEmail" type="email" placeholder="name@example.com">
        <label class="field-label">كلمة المرور</label>
        <input class="field" id="authPassword" type="password" placeholder="٦ أحرف على الأقل">
        <div id="authError"></div>
        <button class="btn btn-filled btn-block mt-12" id="authSubmitBtn">إنشاء الحساب</button>
        <p class="text-muted mt-12" style="text-align:center;">
          لديك حساب؟ <a href="#" id="switchToLogin" style="color:var(--primary);font-weight:700;">سجّل الدخول</a>
        </p>
      `;

      body.querySelector('#switchToSignup')?.addEventListener('click', (e) => { e.preventDefault(); mode = 'signup'; draw(); });
      body.querySelector('#switchToLogin')?.addEventListener('click', (e) => { e.preventDefault(); mode = 'login'; draw(); });

      body.querySelector('#authSubmitBtn').addEventListener('click', async () => {
        const btn = body.querySelector('#authSubmitBtn');
        const errorEl = body.querySelector('#authError');
        errorEl.innerHTML = '';
        const email = body.querySelector('#authEmail').value.trim();
        const password = body.querySelector('#authPassword').value;

        btn.disabled = true;
        btn.innerHTML = '<div class="spinner"></div>';
        try {
          if (mode === 'login') {
            await SndkAuth.signIn(email, password);
          } else {
            const name = body.querySelector('#authName').value.trim();
            const result = await SndkAuth.signUp(name, email, password);
            if (result.requiresConfirmation) {
              body.innerHTML = `
                <div class="state-box">
                  <div class="title-md" style="color:var(--text);">تحقّق من بريدك</div>
                  <p class="text-muted mt-8">أرسلنا رابط تأكيد إلى بريدك — افتحه ثم عد وسجّل الدخول.</p>
                  <button class="btn btn-outline btn-block mt-16" id="backToLoginBtn">العودة لتسجيل الدخول</button>
                </div>
              `;
              body.querySelector('#backToLoginBtn').addEventListener('click', () => { mode = 'login'; draw(); });
              return;
            }
          }
          overlay.remove();
          if (onSuccess) onSuccess();
        } catch (err) {
          errorEl.innerHTML = `<div class="banner banner-error mt-8">${esc(err.message || 'تعذّر الدخول.')}</div>`;
          btn.disabled = false;
          btn.textContent = mode === 'login' ? 'دخول' : 'إنشاء الحساب';
        }
      });
    }
    draw();
  }

  return { openLoginModal };
})();
