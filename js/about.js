// صفحة «عنّا» — مميزات سندك الطبي وأرقامه الحقيقية، بصياغة تناسب السوق
// اليمني/الحضرمي تحديدًا: لا دفع إلكتروني كميزة أساسية، واتساب في الصدارة،
// والمصطلحات التقنية الداخلية (جدولات، نيّة دفع، لوحة العائد…) لا تصل هنا.
// القدرات تُقرأ حيّة من get-public-feature-catalog والأرقام من
// get-public-stats. esc/SNDK_ICONS من common.js.

/// أسماء الكتالوج الداخلية بعضها مكتوب للوحة مدير النظام لا لزائر الموقع
/// («لوحة العائد» لـcap.insights.view، «إدارة الجدولات» لـcap.schedules.manage،
/// «أولوية الظهور» بصياغة تُقرأ كـ«بيع ترتيب» لا كفائدة للمريض). هذا التراكب
/// طبقة عرض عامة فقط — لا يغيّر شيئاً في القاعدة ولا في لوحة الإدارة.
const PUBLIC_LABEL_OVERRIDES = {
  'cap.schedules.manage': 'تنظيم مواعيدك',
  'cap.insights.view': 'لوحة الأداء والإيرادات',
  'mkt.priority_listing': 'ظهور أوضح لمرضاك',
};

function publicLabel(f) {
  return PUBLIC_LABEL_OVERRIDES[f.code] || f.name_ar || f.name_en || f.code;
}

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
    statItem(row.facilities_count, 'مرفق صحي مسجَّل'),
    statItem(row.doctors_count, 'طبيب'),
    statItem(row.cities_count, 'مدينة ومنطقة'),
  ].join('');
}

/// بلا وصف تحت اسم القدرة عمداً: `description_ar` في الكتالوج مكتوب للوحة
/// الإدارة وقد يحمل مصطلحاً داخلياً («نيّة دفع» لقدرة الدفع مثلاً) — عرضه هنا
/// حرفياً يسرّب لغة تقنية داخلية إلى صفحة تسويقية. الاسم وحده (مُعدَّلاً عند
/// الحاجة عبر PUBLIC_LABEL_OVERRIDES) كافٍ وواضح.
function benefitGroupHtml(title, features) {
  if (!features.length) return '';
  const rows = features.map((f) => `
    <div class="row gap-8" style="align-items:flex-start;margin-bottom:10px;">
      ${SNDK_ICONS.check(16)}
      <div style="font-weight:600;">${esc(publicLabel(f))}</div>
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
  el.innerHTML = benefitGroupHtml('تنظيم مرفقك ومواعيدك', caps)
    + benefitGroupHtml('الظهور أمام مرضاك', mkt);
}

function wireStaticIcons() {
  document.getElementById('audienceIcon').innerHTML = SNDK_ICONS.grid(18);
  document.getElementById('audienceIconPatient').innerHTML = SNDK_FALLBACK_ICONS.person(20);
  document.getElementById('audienceIconFacility').innerHTML = SNDK_FALLBACK_ICONS.hospital(20);
  document.getElementById('audienceIconDoctor').innerHTML = SNDK_ICONS.stethoscope(18);
  document.getElementById('audienceIconCamp').innerHTML = SNDK_FALLBACK_ICONS.camp(20);

  document.getElementById('needSectionIcon').innerHTML = SNDK_ICONS.phone(18);
  document.getElementById('needIconLocation').innerHTML = SNDK_ICONS.pin(18);
  document.getElementById('needIconWhatsapp').innerHTML = SNDK_ICONS.chat(18);
  document.getElementById('needIconBooking').innerHTML = SNDK_ICONS.calendar(18);
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

sndkPrettifyUrl('/about');
main();
