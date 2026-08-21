// القائمة الجانبية — نظير app_drawer.dart، بعناصر ما بُني من الموقع حتى
// الآن فقط (لا رابط لصفحة لم تُبنَ بعد). يُضيف نفسه تلقائياً إلى كل صفحة
// تحمّل هذا الملف — لا كودٌ إضافي في كل صفحة سوى وسم <script> واحد.
// sndkOpenModal/sndkCloseModal/esc من common.js.

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.code_yemen.snd_health';

function mountNavToggle() {
  const bar = document.querySelector('.topbar-inner');
  if (!bar || document.getElementById('navToggleBtn')) return;

  const btn = document.createElement('button');
  btn.className = 'btn btn-sm btn-outline';
  btn.id = 'navToggleBtn';
  btn.title = 'القائمة';
  btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  btn.addEventListener('click', openNavDrawer);

  // قبل topbarActions — نفس ترتيب app_drawer.dart (يُفتح من أقصى الجهة
  // المقابلة لعنوان الشاشة، لا من وسط أزرار الحساب).
  const actions = document.getElementById('topbarActions');
  if (actions) bar.insertBefore(btn, actions);
  else bar.appendChild(btn);
}

function openNavDrawer() {
  const loggedIn = SndkAuth.isLoggedIn();
  const user = SndkAuth.currentUser() || {};
  const base = sndkBasePath();

  const sheet = sndkOpenModal(`
    <div class="row gap-12" style="align-items:center;">
      <div class="avatar" style="width:44px;height:44px;border-radius:50%;">
        ${SNDK_FALLBACK_ICONS.person()}
      </div>
      <div>
        <div class="title-md">${esc(loggedIn ? (user.full_name || 'مستخدم') : 'زائر')}</div>
        ${loggedIn && user.email ? `<div class="text-muted" style="font-size:12px;">${esc(user.email)}</div>` : ''}
      </div>
    </div>

    <div class="row gap-8 mt-16">
      <input class="field" id="navSearchInput" style="margin:0;" placeholder="ابحث عن طبيب…">
      <button class="btn btn-filled" id="navSearchBtn">بحث</button>
    </div>

    <div class="section-title" style="margin:20px 0 8px;">تصفّح</div>
    <button class="btn btn-outline btn-block mb-12" id="navFacilitiesBtn" style="justify-content:flex-start;">🏥 المرافق الصحية</button>
    <button class="btn btn-outline btn-block mb-12" id="navDoctorsBtn" style="justify-content:flex-start;">👨‍⚕️ الأطباء</button>
    <button class="btn btn-outline btn-block mb-12" id="navSpecialtiesBtn" style="justify-content:flex-start;">🩺 التخصصات</button>
    <button class="btn btn-outline btn-block mb-12" id="navCampsBtn" style="justify-content:flex-start;">🏕️ المخيمات الطبية</button>
    <button class="btn btn-outline btn-block mb-12" id="navBookingsBtn" style="justify-content:flex-start;">📅 مواعيدي</button>

    <div class="section-title" style="margin:20px 0 8px;">الحساب</div>
    ${loggedIn
      ? `<button class="btn btn-outline btn-block mb-12" id="navLogoutBtn" style="justify-content:flex-start;">🚪 تسجيل الخروج</button>`
      : `<button class="btn btn-filled btn-block mb-12" id="navLoginBtn" style="justify-content:flex-start;">🔑 تسجيل الدخول / إنشاء حساب</button>`}

    <a class="btn btn-outline btn-block mt-8" style="justify-content:flex-start;" href="${esc(PLAY_STORE_URL)}" target="_blank" rel="noopener">
      📲 حمّل تطبيق سندك الطبي
    </a>
  `);

  function goTo(path) {
    sndkCloseModal();
    window.location.href = `${base}${path}`;
  }

  function runSearch() {
    const q = sheet.querySelector('#navSearchInput').value.trim();
    goTo(`/doctors.html${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  }
  sheet.querySelector('#navSearchBtn').addEventListener('click', runSearch);
  sheet.querySelector('#navSearchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runSearch();
  });

  sheet.querySelector('#navFacilitiesBtn').addEventListener('click', () => goTo('/facilities.html'));
  sheet.querySelector('#navDoctorsBtn').addEventListener('click', () => goTo('/doctors.html'));
  sheet.querySelector('#navSpecialtiesBtn').addEventListener('click', () => goTo('/specialties.html'));
  sheet.querySelector('#navCampsBtn').addEventListener('click', () => goTo('/camps.html'));
  sheet.querySelector('#navBookingsBtn').addEventListener('click', () => {
    sndkCloseModal();
    showBookingsNudge();
  });
  sheet.querySelector('#navLogoutBtn')?.addEventListener('click', () => {
    SndkAuth.signOut();
    sndkCloseModal();
    if (typeof renderTopbar === 'function') renderTopbar();
  });
  sheet.querySelector('#navLoginBtn')?.addEventListener('click', () => {
    sndkCloseModal();
    SndkAuthUI.openLoginModal(() => { if (typeof renderTopbar === 'function') renderTopbar(); });
  });
}

/// «مواعيدي» بلا حسابٍ متابَع على الموقع (الحجز هنا مقصودٌ زائراً، ومتابعة
/// الحجوزات مهمّة التطبيق) — إشعارٌ صادق بدل شاشة فارغة أو رابطٍ معطوب.
function showBookingsNudge() {
  const sheet = sndkOpenModal(`
    <div class="state-box">
      <div style="font-size:40px;">📱</div>
      <div class="title-md mt-12" style="color:var(--text);">تابع حجوزاتك من التطبيق</div>
      <p class="text-muted mt-8">متابعة المواعيد وقائمة الانتظار وإشعاراتها متاحة في تطبيق سندك الطبي.</p>
      <a class="btn btn-filled btn-block mt-16" href="${esc(PLAY_STORE_URL)}" target="_blank" rel="noopener">حمّله من Google Play</a>
      <button class="btn btn-outline btn-block mt-8" id="navNudgeCloseBtn">إغلاق</button>
    </div>
  `);
  sheet.querySelector('#navNudgeCloseBtn').addEventListener('click', sndkCloseModal);
}

mountNavToggle();
