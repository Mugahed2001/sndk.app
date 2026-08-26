// صفحة «عنّا» — مميزات سندك الطبي وأرقامه الحقيقية. لا ذكر لباقات أو أسعار
// هنا عمداً؛ تُقرأ القدرات حيّة من get-public-feature-catalog والأرقام من
// get-public-stats (نفس دالتَي الحافة اللتين تغذّيان GuestFacilityPartnershipScreen
// في تطبيق فلاتر). esc/SNDK_ICONS من common.js.

function statItem(value, label) {
  const n = Number(value) || 0;
  return `
    <div style="min-width:120px;">
      <div style="font-size:22px;font-weight:800;color:var(--primary);">${n > 0 ? esc(`${n}+`) : '—'}</div>
      <div class="text-muted">${esc(label)}</div>
    </div>
  `;
}

function renderStats(row) {
  const el = document.getElementById('statsRow');
  if (!row) { el.innerHTML = ''; return; }
  el.innerHTML = [
    statItem(row.facilities_count, 'مرفق صحي نشط'),
    statItem(row.doctors_count, 'طبيب مسجَّل'),
    statItem(row.cities_count, 'مدينة مغطاة'),
  ].join('');
}

function benefitGroupHtml(title, features) {
  if (!features.length) return '';
  const rows = features.map((f) => `
    <div class="row gap-8" style="align-items:flex-start;margin-bottom:10px;">
      ${SNDK_ICONS.check(16)}
      <div>
        <div style="font-weight:600;">${esc(f.name_ar || f.name_en || f.code)}</div>
        ${f.description_ar ? `<div class="text-muted">${esc(f.description_ar)}</div>` : ''}
      </div>
    </div>
  `).join('');
  return `<div class="title-md" style="margin:16px 0 10px;">${esc(title)}</div>${rows}`;
}

function renderBenefits(catalog) {
  const el = document.getElementById('benefitsBody');
  if (!catalog.length) {
    el.innerHTML = '<div class="state-box">تعذّر تحميل مميزات المنصة.</div>';
    return;
  }
  const sorted = [...catalog].sort((a, b) => (a.sort_order || 100) - (b.sort_order || 100));
  const caps = sorted.filter((f) => f.family === 'cap');
  const mkt = sorted.filter((f) => f.family !== 'cap');
  el.innerHTML = benefitGroupHtml('إدارة المرفق والحجوزات', caps)
    + benefitGroupHtml('الظهور والتسويق', mkt);
}

function wireStaticIcons() {
  document.getElementById('needSectionIcon').innerHTML = SNDK_ICONS.blocked(18);
  document.getElementById('needIconLocation').innerHTML = SNDK_ICONS.pin(18);
  document.getElementById('needIconPayment').innerHTML = SNDK_ICONS.card(18);
  document.getElementById('needIconBooking').innerHTML = SNDK_ICONS.phone(18);
  document.getElementById('benefitsIcon').innerHTML = SNDK_ICONS.check(18);
  document.getElementById('stepsIcon').innerHTML = SNDK_ICONS.grid(18);
}

function renderTopbar() {
  document.getElementById('topbarActions').innerHTML = SndkAuth.isLoggedIn()
    ? `<span class="text-muted" style="font-size:13px;">${esc((SndkAuth.currentUser() || {}).full_name || '')}</span>
       <button class="btn btn-sm btn-outline" id="logoutBtn">خروج</button>`
    : `<button class="btn btn-sm btn-outline" id="loginBtn">دخول</button>`;

  document.getElementById('logoutBtn')?.addEventListener('click', () => { SndkAuth.signOut(); renderTopbar(); });
  document.getElementById('loginBtn')?.addEventListener('click', () => SndkAuthUI.openLoginModal(renderTopbar));
}

async function main() {
  renderTopbar();
  wireStaticIcons();

  const [statsResult, catalogResult] = await Promise.allSettled([
    SndkApi.getData('get-public-stats'),
    SndkApi.getData('get-public-feature-catalog'),
  ]);

  const statsRows = statsResult.status === 'fulfilled' && Array.isArray(statsResult.value) ? statsResult.value : [];
  renderStats(statsRows[0] || null);

  const catalog = catalogResult.status === 'fulfilled' && Array.isArray(catalogResult.value) ? catalogResult.value : [];
  renderBenefits(catalog);
}

main();
