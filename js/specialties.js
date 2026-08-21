// التخصصات — نظير الخطوة الأولى من guest_specialty_selector_screen.dart،
// مبسَّطة: كل تخصص يقود مباشرة إلى نتائج الأطباء المصفّاة (doctors.html)
// بدل خطوة اختيار مدينة وسيطة — المدينة مُتاحة أصلاً كفلترة داخل صفحتَي
// المرافق/الأطباء. esc من common.js.

async function main() {
  renderTopbar();

  const body = document.getElementById('specialtiesBody');
  let specialties;
  try {
    specialties = await SndkApi.getData('get-specialties', { query: { limit: 200 } });
  } catch (err) {
    body.innerHTML = `<div class="state-box">تعذّر تحميل التخصصات.<br>${esc(err.message)}</div>`;
    return;
  }

  if (!Array.isArray(specialties) || specialties.length === 0) {
    body.innerHTML = '<div class="state-box">لا تخصصات متاحة حالياً.</div>';
    return;
  }

  const sorted = [...specialties].sort((a, b) =>
    (a.arabic_name || a.name || '').localeCompare(b.arabic_name || b.name || '', 'ar'));

  body.innerHTML = sorted.map((s) => `
    <a class="card card-pad feature-card" href="${sndkBasePath()}/doctors.html?specialty_id=${encodeURIComponent(s.id)}" style="text-decoration:none;color:inherit;">
      <div class="section-icon">${SNDK_ICONS.stethoscope(18)}</div>
      <div><h3>${esc(s.arabic_name || s.name)}</h3></div>
    </a>
  `).join('');
}

function renderTopbar() {
  document.getElementById('topbarActions').innerHTML = SndkAuth.isLoggedIn()
    ? `<span class="text-muted" style="font-size:13px;">${esc((SndkAuth.currentUser() || {}).full_name || '')}</span>
       <button class="btn btn-sm btn-outline" id="logoutBtn">خروج</button>`
    : `<button class="btn btn-sm btn-outline" id="loginBtn">دخول</button>`;

  document.getElementById('logoutBtn')?.addEventListener('click', () => { SndkAuth.signOut(); renderTopbar(); });
  document.getElementById('loginBtn')?.addEventListener('click', () => SndkAuthUI.openLoginModal(renderTopbar));
}

main();
