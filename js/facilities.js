// قائمة/بحث المرافق — نظير guest_facilities_screen.dart، لكن ببحث خادميّ
// (get-facilities?q=) لا جلب كل المرافق وتصفيتها محلياً كما يفعل التطبيق
// (منطقي هناك بتخزينه المحلي الدائم، مكلفٌ هنا في كل زيارة صفحة). esc/
// wireImageFallbacks/facilityCardHtml/wireFacilityCards/spellingVariants/
// haversineKm من common.js، sndkBasePath من routing.js.

let facilitiesSearchTimer = null;
let cityFilter = '';
// "مستشفى" وحده ليس تأكيداً على وجود قسم طوارئ حقيقي فعّال ٢٤/٧ — لا عمود
// `has_emergency` في القاعدة أصلاً (قرار بيانات/منتج لم يُتّخذ بعد: من يُدخل
// هذه العلامة ومتى تُراجَع). لكنه أدقّ إشارة متاحة *الآن* بلا أي تعديل مخطّط:
// عمود `type` موجود ومُدخَل فعلاً لكل مرفق. زرّ "أقرب طوارئ" في ردّ المساعد
// (js/assistant.js) يفتح هذه الصفحة بـ?type=hospital بدل عرض كل المرافق
// بلا تمييز كما كان — تحسينٌ حقيقي، لا حلٌّ نهائي.
let typeFilter = '';
let userLocation = null; // {lat, lng} | null — بعد نجاح GPS

async function main() {
  renderTopbar();
  const params = new URLSearchParams(window.location.search);
  typeFilter = params.get('type') || '';

  await loadFilterOptions();
  if (typeFilter) document.getElementById('typeFilterSelect').value = typeFilter;
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
  document.getElementById('typeFilterSelect').addEventListener('change', (e) => {
    typeFilter = e.target.value;
    loadFacilities(document.getElementById('facilitySearchInput').value.trim());
  });
  document.getElementById('nearMeBtn').innerHTML = nearMeLabel('idle');
  document.getElementById('nearMeBtn').addEventListener('click', requestNearMe);
}

// أيقونة الدبّوس بلون الهويّة (`currentColor` يرث لون نص الزرّ، وهو
// `var(--primary)` على `.btn-outline`) بدل رمز 📍 التعبيري — ذاك يُعرَض
// بلونه الثابت الخاص بكل نظام تشغيل (أحمر غالباً)، لا بهويّة سندك.
function nearMeLabel(state) {
  if (state === 'loading') return '<div class="spinner spinner-dark" style="width:14px;height:14px;"></div> جارٍ التحديد…';
  if (state === 'done') return `${SNDK_ICONS.pin(15, 'currentColor')} مرتَّب بالأقرب`;
  return `${SNDK_ICONS.pin(15, 'currentColor')} الأقرب مني`;
}

// FACILITY_TYPE_LABELS يحمل مفتاحين لنفس "مركز طبي" (medicalCenter/
// medical_center، توافقاً مع تسميتين تاريخيتين في القاعدة) — تُبنى القائمة
// من قيم فعلية موجودة في السجلات المُحمَّلة لا من كل مفاتيح الثابت، فلا
// يظهر خيارٌ مكرَّر ولا خيارٌ لنوعٍ لا يملكه أي مرفق حالياً.
async function loadTypeOptions(facilities) {
  const select = document.getElementById('typeFilterSelect');
  const seenLabels = new Set(Array.from(select.options).map((o) => o.textContent));
  const types = [...new Set(facilities.map((f) => f.type).filter(Boolean))];
  for (const t of types) {
    const label = FACILITY_TYPE_LABELS[t] || t;
    if (seenLabels.has(label)) continue;
    seenLabels.add(label);
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = label;
    select.appendChild(opt);
  }
}

// قائمتا المدينة والنوع تُبنيان من بيانات حقيقية (٢٠٠ مرفق كحدّ أقصى، طلبٌ
// واحد مشترك بلا فلترة) لا من قائمة ثابتة مكتوبة يدوياً — تبقيان متزامنتين
// مع القاعدة دائماً، وتتجنّبان أي تفاوت إملائي بين ما يُكتَب هنا وما هو
// مخزَّن فعلياً. طلبٌ واحد لا طلبان لتفادي مضاعفة عدد نداءات الصفحة.
async function loadFilterOptions() {
  try {
    const all = await SndkApi.getData('get-facilities', { query: { limit: 200 } });
    const list = Array.isArray(all) ? all : [];
    const cities = [...new Set(list.map((f) => f.city).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'ar'));
    const select = document.getElementById('cityFilterSelect');
    for (const city of cities) {
      const opt = document.createElement('option');
      opt.value = city;
      opt.textContent = city;
      select.appendChild(opt);
    }
    await loadTypeOptions(list);
  } catch (_) { /* فلاتر المدينة/النوع اختيارية — فشل تحميلها لا يمنع تصفّح المرافق */ }
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
  btn.innerHTML = nearMeLabel('loading');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      btn.innerHTML = nearMeLabel('done');
      loadFacilities(document.getElementById('facilitySearchInput').value.trim());
    },
    () => {
      btn.disabled = false;
      btn.innerHTML = nearMeLabel('idle');
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
  const beforeFilters = facilities;
  if (cityFilter) facilities = facilities.filter((f) => f.city === cityFilter);
  if (typeFilter) facilities = facilities.filter((f) => f.type === typeFilter);

  if (facilities.length === 0) {
    if ((cityFilter || typeFilter) && beforeFilters.length > 0) {
      const filterDesc = [cityFilter, typeFilter ? (FACILITY_TYPE_LABELS[typeFilter] || typeFilter) : null].filter(Boolean).join(' / ');
      body.innerHTML = `<div class="state-box">لا مرافق مطابقة لفلتر "${esc(filterDesc)}" لهذا البحث.<br>جرّب <button class="btn btn-sm btn-outline" id="clearFiltersBtn" style="margin-top:8px;">إزالة الفلاتر</button></div>`;
      document.getElementById('clearFiltersBtn')?.addEventListener('click', () => {
        cityFilter = '';
        typeFilter = '';
        document.getElementById('cityFilterSelect').value = '';
        document.getElementById('typeFilterSelect').value = '';
        loadFacilities(q);
      });
      return;
    }
    body.innerHTML = `<div class="state-box">${q || cityFilter || typeFilter ? 'لا نتائج مطابقة — جرّب كلمة أقصر أو تحقّق من الإملاء.' : 'لا مرافق متاحة حالياً.'}</div>`;
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
