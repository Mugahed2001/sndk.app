// بحث الأطباء — نظير guest_doctor_search_screen.dart، لكن ببحث خادميّ
// (get-doctors?q=&specialty_id=) لا تحميل كل الأطباء وتصفيتهم محلياً.
// يقبل ?q=<اسم> و?specialty_id=<معرّف> من الرابط — تصل من صفحة الرئيسية
// وصفحة التخصصات بحقلٍ مُعبّأً مسبقاً. esc/wireImageFallbacks/doctorCardHtml/
// wireDoctorCards من common.js، sndkBasePath من routing.js.

let doctorsSearchTimer = null;
let specialtiesById = {};

async function main() {
  renderTopbar();

  const params = new URLSearchParams(window.location.search);
  const initialQ = params.get('q') || '';
  const initialSpecialty = params.get('specialty_id') || '';

  document.getElementById('doctorSearchInput').value = initialQ;

  try {
    const specialties = await SndkApi.getData('get-specialties', { query: { limit: 200 } });
    if (Array.isArray(specialties)) {
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
}

async function loadDoctors(q, specialtyId) {
  const body = document.getElementById('doctorsBody');
  body.innerHTML = '<div class="skeleton" style="height:90px;"></div><div class="skeleton" style="height:90px;"></div>';

  const query = { limit: 60 };
  if (q) query.q = q;
  if (specialtyId) query.specialty_id = specialtyId;

  let doctors;
  try {
    doctors = await SndkApi.getData('get-doctors', { query });
  } catch (err) {
    body.innerHTML = `<div class="state-box">تعذّر تحميل الأطباء.<br>${esc(err.message)}</div>`;
    return;
  }

  if (!Array.isArray(doctors) || doctors.length === 0) {
    body.innerHTML = '<div class="state-box">لا نتائج مطابقة.</div>';
    return;
  }

  body.innerHTML = doctors.map((d) => doctorCardHtml(d, specialtiesById)).join('');
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

main();
