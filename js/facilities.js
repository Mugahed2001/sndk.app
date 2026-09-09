// قائمة/بحث المرافق — نظير guest_facilities_screen.dart، لكن ببحث خادميّ
// (get-facilities?q=) لا جلب كل المرافق وتصفيتها محلياً كما يفعل التطبيق
// (منطقي هناك بتخزينه المحلي الدائم، مكلفٌ هنا في كل زيارة صفحة). esc/
// wireImageFallbacks/facilityCardHtml/wireFacilityCards/spellingVariants/
// haversineKm من common.js، sndkBasePath من routing.js.

let facilitiesSearchTimer = null;
let cityFilter = '';
let userLocation = null; // {lat, lng} | null — بعد نجاح GPS

async function main() {
  renderTopbar();
  await loadCityOptions();
  await loadFacilities('');

  document.getElementById('facilitySearchInput').addEventListener('input', (e) => {
    clearTimeout(facilitiesSearchTimer);
    const q = e.target.value.trim();
    facilitiesSearchTimer = setTimeout(() => loadFacilities(q), 350);
  });
  document.getElementById('cityFilterSelect').addEventListener('change', (e) => {
    cityFilter = e.target.value;
    loadFacilities(document.getElementById('facilitySearchInput').value.trim());
  });
  document.getElementById('nearMeBtn').addEventListener('click', requestNearMe);
}

// قائمة المدن تُبنى من بيانات حقيقية (٢٠٠ مرفق كحدّ أقصى، طلبٌ واحد بلا
// فلترة) لا من قائمة ثابتة مكتوبة يدوياً — تبقى متزامنة مع القاعدة دائماً،
// وتتجنّب أي تفاوت إملائي بين ما يُكتَب هنا وما هو مخزَّن فعلياً.
async function loadCityOptions() {
  try {
    const all = await SndkApi.getData('get-facilities', { query: { limit: 200 } });
    const cities = [...new Set((Array.isArray(all) ? all : []).map((f) => f.city).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'ar'));
    const select = document.getElementById('cityFilterSelect');
    for (const city of cities) {
      const opt = document.createElement('option');
      opt.value = city;
      opt.textContent = city;
      select.appendChild(opt);
    }
  } catch (_) { /* فلتر المدينة اختياري — فشل تحميله لا يمنع تصفّح المرافق */ }
}

// "الأقرب مني" — GPS حقيقي بدل الاعتماد الكامل على كتابة اسم مدينة يدوياً
// (نقطة ضعف رئيسية رصدها التدقيق: لا مفهوم "قريب" في الموقع كله). مرافق
// بلا إحداثيات مسجَّلة (كثيرة اليوم فعلياً) تبقى في آخر القائمة بترتيبها
// الأصلي — لا تُستبعَد، فقط لا تُرفَّع لعدم توفّر بيانات المسافة.
function requestNearMe() {
  const btn = document.getElementById('nearMeBtn');
  if (!navigator.geolocation) {
    alert('متصفّحك لا يدعم تحديد الموقع.');
    return;
  }
  btn.disabled = true;
  btn.textContent = '...جارٍ التحديد';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      btn.textContent = '📍 مرتَّب بالأقرب';
      loadFacilities(document.getElementById('facilitySearchInput').value.trim());
    },
    () => {
      btn.disabled = false;
      btn.textContent = '📍 الأقرب مني';
      alert('تعذّر الوصول لموقعك — تحقّق من إذن الموقع في المتصفح.');
    },
    { timeout: 10000 },
  );
}

async function loadFacilities(q) {
  const body = document.getElementById('facilitiesBody');
  body.innerHTML = '<div class="skeleton" style="height:120px;"></div><div class="skeleton" style="height:120px;"></div>';

  let facilities = [];
  try {
    if (q) {
      for (const variant of spellingVariants(q)) {
        facilities = await SndkApi.getData('get-facilities', { query: { q: variant, limit: 60 } });
        if (Array.isArray(facilities) && facilities.length) break;
      }
    } else {
      facilities = await SndkApi.getData('get-facilities', { query: { limit: 60 } });
    }
  } catch (err) {
    body.innerHTML = `<div class="state-box">تعذّر تحميل المرافق.<br>${esc(err.message)}</div>`;
    return;
  }

  if (!Array.isArray(facilities)) facilities = [];
  const beforeCityFilter = facilities;
  if (cityFilter) facilities = facilities.filter((f) => f.city === cityFilter);

  if (facilities.length === 0) {
    if (cityFilter && beforeCityFilter.length > 0) {
      body.innerHTML = `<div class="state-box">لا مرافق في مدينة "${esc(cityFilter)}" لهذا البحث.<br>جرّب <button class="btn btn-sm btn-outline" id="clearCityFilterBtn" style="margin-top:8px;">إزالة فلتر المدينة</button></div>`;
      document.getElementById('clearCityFilterBtn')?.addEventListener('click', () => {
        cityFilter = '';
        document.getElementById('cityFilterSelect').value = '';
        loadFacilities(q);
      });
      return;
    }
    body.innerHTML = `<div class="state-box">${q || cityFilter ? 'لا نتائج مطابقة — جرّب كلمة أقصر أو تحقّق من الإملاء.' : 'لا مرافق متاحة حالياً.'}</div>`;
    return;
  }

  let sorted;
  if (userLocation) {
    // الأقرب فعلياً أولاً (من يملك إحداثيات)، ثم الباقي بترتيبه كما وصل.
    const withDist = facilities.map((f) => ({
      f,
      dist: (typeof f.latitude === 'number' && typeof f.longitude === 'number')
        ? haversineKm(userLocation.lat, userLocation.lng, f.latitude, f.longitude)
        : null,
    }));
    withDist.sort((a, b) => {
      if (a.dist === null && b.dist === null) return 0;
      if (a.dist === null) return 1;
      if (b.dist === null) return -1;
      return a.dist - b.dist;
    });
    sorted = withDist.map((x) => x.f);
  } else {
    // بلا بحث ولا GPS: الأعلى أولوية أولاً (نظير ترتيب «المميّزة» في
    // التطبيق) — البحث النصّي يبقي ترتيب الخادم (تطابق الاسم أهمّ).
    sorted = q ? facilities : [...facilities].sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0));
  }

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
