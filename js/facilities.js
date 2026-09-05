// قائمة/بحث المرافق — نظير guest_facilities_screen.dart، لكن ببحث خادميّ
// (get-facilities?q=) لا جلب كل المرافق وتصفيتها محلياً كما يفعل التطبيق
// (منطقي هناك بتخزينه المحلي الدائم، مكلفٌ هنا في كل زيارة صفحة). esc/
// wireImageFallbacks/facilityCardHtml/wireFacilityCards من common.js،
// sndkBasePath من routing.js.

let facilitiesSearchTimer = null;

async function main() {
  renderTopbar();
  await loadFacilities('');

  document.getElementById('facilitySearchInput').addEventListener('input', (e) => {
    clearTimeout(facilitiesSearchTimer);
    const q = e.target.value.trim();
    facilitiesSearchTimer = setTimeout(() => loadFacilities(q), 350);
  });
}

async function loadFacilities(q) {
  const body = document.getElementById('facilitiesBody');
  body.innerHTML = '<div class="skeleton" style="height:120px;"></div><div class="skeleton" style="height:120px;"></div>';

  let facilities;
  try {
    facilities = await SndkApi.getData('get-facilities', { query: q ? { q, limit: 60 } : { limit: 60 } });
  } catch (err) {
    body.innerHTML = `<div class="state-box">تعذّر تحميل المرافق.<br>${esc(err.message)}</div>`;
    return;
  }

  if (!Array.isArray(facilities) || facilities.length === 0) {
    body.innerHTML = `<div class="state-box">${q ? 'لا نتائج مطابقة.' : 'لا مرافق متاحة حالياً.'}</div>`;
    return;
  }

  // بلا بحث: الأعلى أولوية أولاً (نظير ترتيب «المميّزة» في التطبيق) — البحث
  // النصّي يبقي ترتيب الخادم (تطابق الاسم أهمّ من الأولوية عند البحث).
  const sorted = q ? facilities : [...facilities].sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0));

  body.innerHTML = sorted.map((f) => facilityCardHtml(f)).join('');
  wireImageFallbacks(body);
  wireFacilityCards(body);
}

function renderTopbar() {
  document.getElementById('topbarActions').innerHTML = SndkAuth.isLoggedIn()
    ? `<span class="text-muted" style="font-size:13px;">${esc((SndkAuth.currentUser() || {}).full_name || '')}</span>
       <button class="btn btn-sm btn-outline" id="logoutBtn">خروج</button>`
    : `<button class="btn btn-sm btn-outline" id="loginBtn">دخول</button>`;

  document.getElementById('logoutBtn')?.addEventListener('click', () => { SndkAuth.signOut(); renderTopbar(); });
  document.getElementById('loginBtn')?.addEventListener('click', () => SndkAuthUI.openLoginModal(renderTopbar));
}

sndkPrettifyUrl('/facilities');
main();
