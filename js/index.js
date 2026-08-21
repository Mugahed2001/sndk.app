// الصفحة الرئيسية — فتح صفحة مرفق من رابط أو معرّف يلصقه الزائر.
// sndkBasePath من routing.js.

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
  window.location.href = sndkBasePath() + '/facility.html?id=' + encodeURIComponent(id);
}

document.getElementById('goToFacilityBtn').addEventListener('click', goToFacility);
document.getElementById('facilityLinkInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') goToFacility();
});
