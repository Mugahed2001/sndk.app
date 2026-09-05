// الصفحة الرئيسية — نظير guest_home_screen.dart، لكن بجلبٍ محدود لا جلب كل
// المرافق/الأطباء ثم الترشيح محلياً (منطقي هناك بتخزينه المحلي الدائم،
// ثقيلٌ هنا في كل زيارة صفحة): مرافق مميّزة ٦ (مرتّبة بـpriority_score)،
// أطباء ٦ — كلٌّ مجرّد بطاقة تقود إلى القائمة الكاملة. esc/facilityCardHtml/
// doctorCardHtml/wireFacilityCards/wireDoctorCards/wireImageFallbacks من
// common.js، sndkBasePath من routing.js.

function renderTopbar() {
  document.getElementById('topbarActions').innerHTML = SndkAuth.isLoggedIn()
    ? `<span class="text-muted" style="font-size:13px;">${esc((SndkAuth.currentUser() || {}).full_name || '')}</span>`
    : '';
}
renderTopbar();

const homeDownloadBtn = document.getElementById('homeDownloadBtn');
if (homeDownloadBtn) homeDownloadBtn.href = sndkAppOrStoreUrl();

document.getElementById('homeAssistantBtn')?.addEventListener('click', () => SndkAssistant.open());

async function loadFeaturedFacilities() {
  const body = document.getElementById('featuredFacilities');
  try {
    const facilities = await SndkApi.getData('get-facilities', { query: { limit: 30 } });
    const top = Array.isArray(facilities)
      ? [...facilities].sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0)).slice(0, 6)
      : [];
    if (top.length === 0) {
      body.innerHTML = '<div class="state-box">لا مرافق متاحة حالياً.</div>';
      return;
    }
    body.innerHTML = top.map((f) => facilityCardHtml(f)).join('');
    wireImageFallbacks(body);
    wireFacilityCards(body);
  } catch (_) {
    body.innerHTML = '<div class="state-box">تعذّر تحميل المرافق.</div>';
  }
}

async function loadFeaturedDoctors() {
  const body = document.getElementById('featuredDoctors');
  try {
    const doctors = await SndkApi.getData('get-doctors', { query: { limit: 6 } });
    if (!Array.isArray(doctors) || doctors.length === 0) {
      body.innerHTML = '<div class="state-box">لا أطباء متاحون حالياً.</div>';
      return;
    }
    body.innerHTML = doctors.map((d) => doctorCardHtml(d, {})).join('');
    wireImageFallbacks(body);
    wireDoctorCards(body);
  } catch (_) {
    body.innerHTML = '<div class="state-box">تعذّر تحميل الأطباء.</div>';
  }
}

function runHomeSearch() {
  const q = document.getElementById('homeSearchInput').value.trim();
  window.location.href = `${sndkBasePath()}/doctors${q ? `?q=${encodeURIComponent(q)}` : ''}`;
}
document.getElementById('homeSearchBtn').addEventListener('click', runHomeSearch);
document.getElementById('homeSearchInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') runHomeSearch();
});

loadFeaturedFacilities();
loadFeaturedDoctors();

function extractFacilityId(input) {
  const trimmed = input.trim();
  const match = trimmed.match(/facility\/([a-zA-Z0-9-]+)/);
  if (match) return match[1];
  // معرّف عارٍ بلا رابط كامل
  if (/^[a-zA-Z0-9-]{8,}$/.test(trimmed)) return trimmed;
  return null;
}

function goToFacility() {
  const value = document.getElementById('facilityLinkInput').value;
  const id = extractFacilityId(value || '');
  if (!id) {
    alert('لم أتعرّف على رابط أو معرّف مرفق صالح.');
    return;
  }
  window.location.href = sndkBasePath() + '/facility/' + encodeURIComponent(id);
}

document.getElementById('goToFacilityBtn').addEventListener('click', goToFacility);
document.getElementById('facilityLinkInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') goToFacility();
});
