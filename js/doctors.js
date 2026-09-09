// بحث الأطباء — نظير guest_doctor_search_screen.dart، لكن ببحث خادميّ
// (get-doctors?q=&specialty_id=) لا تحميل كل الأطباء وتصفيتهم محلياً.
// يقبل ?q=<اسم> و?specialty_id=<معرّف> من الرابط — تصل من صفحة الرئيسية
// وصفحة التخصصات بحقلٍ مُعبّأً مسبقاً. esc/wireImageFallbacks/doctorCardHtml/
// wireDoctorCards من common.js، sndkBasePath من routing.js.

let doctorsSearchTimer = null;
let specialtiesById = {};
let specialtiesList = [];
let doctorCityFilter = '';
// كل صفحة أطباء مُحمَّلة سابقاً — نُبقيها لتصفية المدينة محلياً بلا إعادة
// طلب من الخادم (city ليست فلتر get-doctors، بل مُشتقّة من facility_doctors
// المُضمَّن أصلاً في كل استجابة).
let lastLoadedDoctors = [];

// "دكتور أطفال" في صندوق بحث نصّه يقول "ابحث عن طبيب أو تخصص" كان يُرسَل
// حرفياً كاسمٍ (get-doctors.q يطابق العمود name فقط) فيعود بلا نتائج مطلقاً
// — أكبر فجوة كشفها تقييم مستخدم حيّ (السيناريو الأول بالكامل). كلمات
// الطبيب/التخصيص العامة تُسقَط أولاً، وما تبقّى يُقارَن بأسماء التخصصات
// الحقيقية؛ تطابقٌ يُحوَّل تلقائياً لفلتر تخصص بدل نص اسمٍ لن يجد شيئاً.
const DOCTOR_FILLER_WORDS = ['دكتور', 'دكاترة', 'طبيب', 'أطباء', 'اطباء', 'طيب', 'اطبا', 'دختر', 'حكيم', 'في', 'من'];

function normalizeSimple(t) {
  return (t || '')
    .replace(/[ً-ٰ]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase()
    .trim();
}

const DOCTOR_FILLER_WORDS_NORM = new Set(DOCTOR_FILLER_WORDS.map(normalizeSimple));

// مطابقة كلمة-بكلمة لا سلسلة كاملة: تخصصات كثيرة أسماؤها متعدّدة الكلمات
// ("الاطفال وحديثي الولادة") — طلبٌ بكلمة واحدة فقط ("أطفال") لن يكون أبداً
// سلسلة فرعية من الاسم الكامل، فمقارنة `n.includes(fullName)` تفشل دائماً
// في هذه الحالة رغم صحّة المطابقة منطقياً (نفس عطل حقيقي رُصد أثناء الكتابة).
function findMatchedSpecialty(rawQuery) {
  const words = normalizeSimple(rawQuery).split(' ').filter((w) => w && !DOCTOR_FILLER_WORDS_NORM.has(w));
  if (!words.length) return null;
  return specialtiesList.find((s) => {
    const name = normalizeSimple(s.arabic_name || s.name || '');
    const specialtyWords = name.split(' ')
      .map((w) => (w.startsWith('ال') ? w.slice(2) : w))
      .filter((w) => w.length >= 3);
    return words.some((w) => specialtyWords.some((sw) => sw === w || sw.includes(w) || w.includes(sw)));
  }) || null;
}

async function main() {
  renderTopbar();

  const params = new URLSearchParams(window.location.search);
  const initialQ = params.get('q') || '';
  const initialSpecialty = params.get('specialty_id') || '';

  document.getElementById('doctorSearchInput').value = initialQ;

  try {
    const specialties = await SndkApi.getData('get-specialties', { query: { limit: 200 } });
    if (Array.isArray(specialties)) {
      specialtiesList = specialties;
      specialtiesById = Object.fromEntries(specialties.map((s) => [s.id, s]));
      const select = document.getElementById('specialtyFilterSelect');
      for (const s of specialties.sort((a, b) => (a.arabic_name || a.name || '').localeCompare(b.arabic_name || b.name || '', 'ar'))) {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.arabic_name || s.name;
        if (s.id === initialSpecialty) opt.selected = true;
        select.appendChild(opt);
      }
    }
  } catch (_) { /* فلتر التخصص اختياري — فشل تحميله لا يمنع تصفّح الأطباء */ }

  await loadDoctors(initialQ, initialSpecialty);

  document.getElementById('doctorSearchInput').addEventListener('input', (e) => {
    clearTimeout(doctorsSearchTimer);
    const q = e.target.value.trim();
    doctorsSearchTimer = setTimeout(() => loadDoctors(q, document.getElementById('specialtyFilterSelect').value), 350);
  });
  document.getElementById('specialtyFilterSelect').addEventListener('change', (e) => {
    loadDoctors(document.getElementById('doctorSearchInput').value.trim(), e.target.value);
  });
  document.getElementById('cityFilterSelect').addEventListener('change', (e) => {
    doctorCityFilter = e.target.value;
    renderDoctorsList(lastLoadedDoctors);
  });
}

// خيارات المدينة تُبنى من دفعة الأطباء المُحمَّلة فعلياً (لا طلب إضافي)
// عبر doctorPrimaryFacility المُشترَكة من common.js — نفس المصدر الذي
// يُبنى منه شريط الموقع على كل بطاقة طبيب.
function rebuildCityOptions(doctors) {
  const select = document.getElementById('cityFilterSelect');
  const current = select.value;
  const cities = [...new Set(doctors.map((d) => {
    const f = doctorPrimaryFacility(d);
    return f && f.city;
  }).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));

  select.innerHTML = '<option value="">كل المدن</option>' +
    cities.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  if (cities.includes(current)) select.value = current;
  else doctorCityFilter = '';
}

async function loadDoctors(q, specialtyId) {
  const body = document.getElementById('doctorsBody');
  body.innerHTML = '<div class="skeleton" style="height:90px;"></div><div class="skeleton" style="height:90px;"></div>';

  // النصّ يطابق تخصصاً معروفاً ولا تخصص مُختار صراحةً من القائمة ⇒ فلترة
  // بالتخصص لا بالاسم. القائمة المنسدلة تُحدَّث بصرياً لتوضيح لماذا تغيّرت
  // النتائج بدل تخصيصٍ صامت لا يفهم المستخدم سببه.
  let effectiveSpecialtyId = specialtyId;
  let effectiveQ = q;
  if (!specialtyId && q) {
    const matched = findMatchedSpecialty(q);
    if (matched) {
      effectiveSpecialtyId = matched.id;
      effectiveQ = '';
      const select = document.getElementById('specialtyFilterSelect');
      if (select) select.value = matched.id;
    }
  }

  let doctors = [];
  try {
    if (effectiveQ) {
      for (const variant of spellingVariants(effectiveQ)) {
        const query = { limit: 60, q: variant };
        if (effectiveSpecialtyId) query.specialty_id = effectiveSpecialtyId;
        doctors = await SndkApi.getData('get-doctors', { query });
        if (Array.isArray(doctors) && doctors.length) break;
      }
    } else {
      const query = { limit: 60 };
      if (effectiveSpecialtyId) query.specialty_id = effectiveSpecialtyId;
      doctors = await SndkApi.getData('get-doctors', { query });
    }
  } catch (err) {
    body.innerHTML = `<div class="state-box">تعذّر تحميل الأطباء.<br>${esc(err.message)}</div>`;
    return;
  }

  if (!Array.isArray(doctors)) doctors = [];
  lastLoadedDoctors = doctors;
  rebuildCityOptions(doctors);
  renderDoctorsList(doctors);
}

function renderDoctorsList(doctors) {
  const body = document.getElementById('doctorsBody');
  const filtered = doctorCityFilter
    ? doctors.filter((d) => (doctorPrimaryFacility(d) || {}).city === doctorCityFilter)
    : doctors;

  if (filtered.length === 0) {
    body.innerHTML = '<div class="state-box">لا نتائج مطابقة.</div>';
    return;
  }

  body.innerHTML = filtered.map((d) => doctorCardHtml(d, specialtiesById)).join('');
  wireImageFallbacks(body);
  wireDoctorCards(body);
}

function renderTopbar() {
  document.getElementById('topbarActions').innerHTML = SndkAuth.isLoggedIn()
    ? `<span class="text-muted" style="font-size:13px;">${esc((SndkAuth.currentUser() || {}).full_name || '')}</span>
       <button class="btn btn-sm btn-outline" id="logoutBtn">خروج</button>`
    : `<button class="btn btn-sm btn-outline" id="loginBtn">دخول</button>`;

  document.getElementById('logoutBtn')?.addEventListener('click', () => { SndkAuth.signOut(); renderTopbar(); });
  document.getElementById('loginBtn')?.addEventListener('click', () => SndkAuthUI.openLoginModal(renderTopbar));
}

sndkPrettifyUrl('/doctors');
main();
