// القائمة الجانبية — نظير app_drawer.dart، بعناصر ما بُني من الموقع حتى
// الآن فقط (لا رابط لصفحة لم تُبنَ بعد). يُضيف نفسه تلقائياً إلى كل صفحة
// تحمّل هذا الملف — لا كودٌ إضافي في كل صفحة سوى وسم <script> واحد.
// sndkOpenModal/sndkCloseModal/esc من common.js.

const PLAY_STORE_URL = SNDK_PLAY_STORE_URL;

function mountNavToggle() {
  const bar = document.querySelector('.topbar-inner');
  if (!bar || document.getElementById('navToggleBtn')) return;

  const btn = document.createElement('button');
  btn.className = 'btn btn-sm btn-outline nav-toggle-btn';
  btn.id = 'navToggleBtn';
  btn.title = 'القائمة';
  btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  btn.addEventListener('click', openNavDrawer);

  // العمود الأول في شبكة topbar-inner ثلاثية الأعمدة — بداية السطر (اليمين
  // في RTL)، والشعار يبقى مُمركَزاً في العمود الأوسط بصرف النظر عمّا هنا
  // وعمّا في topbar-actions (عمود ثالث بعرضٍ مساوٍ لهذا تماماً).
  bar.prepend(btn);
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
    <button class="btn btn-outline btn-block mb-12" id="navFacilitiesBtn" style="justify-content:flex-start;">${SNDK_FALLBACK_ICONS.hospital(17)} المستشفيات والعيادات</button>
    <button class="btn btn-outline btn-block mb-12" id="navDoctorsBtn" style="justify-content:flex-start;">${SNDK_FALLBACK_ICONS.person(17)} الأطباء</button>
    <button class="btn btn-outline btn-block mb-12" id="navSpecialtiesBtn" style="justify-content:flex-start;">${SNDK_ICONS.grid(17)} التخصصات</button>
    <button class="btn btn-outline btn-block mb-12" id="navCampsBtn" style="justify-content:flex-start;">${SNDK_FALLBACK_ICONS.camp(17)} المخيمات الطبية</button>
    <button class="btn btn-outline btn-block mb-12" id="navBookingsBtn" style="justify-content:flex-start;">${SNDK_ICONS.calendar(17)} مواعيدي</button>

    <div class="section-title" style="margin:20px 0 8px;">عن سندك</div>
    <button class="btn btn-outline btn-block mb-12" id="navAboutBtn" style="justify-content:flex-start;">${SNDK_FALLBACK_ICONS.hospital(17)} عن سندك الطبي</button>

    <div class="section-title" style="margin:20px 0 8px;">الحساب</div>
    ${loggedIn
      ? `<button class="btn btn-outline btn-block mb-12" id="navLogoutBtn" style="justify-content:flex-start;">${SNDK_ICONS.logout(17)} تسجيل الخروج</button>`
      : `<button class="btn btn-filled btn-block mb-12" id="navLoginBtn" style="justify-content:flex-start;">${SNDK_ICONS.login(17)} تسجيل الدخول / إنشاء حساب</button>`}

    <a class="btn btn-outline btn-block mt-8" style="justify-content:flex-start;" href="${esc(sndkAppOrStoreUrl())}" target="_blank" rel="noopener">
      ${SNDK_ICONS.download(17)} حمّل تطبيق سندك الطبي
    </a>
  `);

  function goTo(path) {
    sndkCloseModal();
    window.location.href = `${base}${path}`;
  }

  function runSearch() {
    const q = sheet.querySelector('#navSearchInput').value.trim();
    goTo(`/doctors${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  }
  sheet.querySelector('#navSearchBtn').addEventListener('click', runSearch);
  sheet.querySelector('#navSearchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runSearch();
  });

  sheet.querySelector('#navFacilitiesBtn').addEventListener('click', () => goTo('/facilities'));
  sheet.querySelector('#navDoctorsBtn').addEventListener('click', () => goTo('/doctors'));
  sheet.querySelector('#navSpecialtiesBtn').addEventListener('click', () => goTo('/specialties'));
  sheet.querySelector('#navCampsBtn').addEventListener('click', () => goTo('/camps'));
  sheet.querySelector('#navBookingsBtn').addEventListener('click', () => goTo('/appointments'));
  sheet.querySelector('#navAboutBtn').addEventListener('click', () => goTo('/about'));
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

mountNavToggle();
