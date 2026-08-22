// قائمة المخيمات الطبية — نظير camps_list_screen.dart بالحرف: نفس تبويبي
// الجاري/المنقضي، ونفس بطاقة المخيم (شارة الحالة، التواريخ، المدينة،
// التخصصات، الرسوم). esc/wireImageFallbacks/shareLink وأدوات المخيم
// المشتركة (campOrganizer إلخ) من common.js، sndkBasePath من routing.js.

async function main() {
  renderTopbar();

  const params = new URLSearchParams(window.location.search);
  let scope = params.get('scope') === 'past' ? 'past' : 'active';

  const root = document.getElementById('root');

  async function load() {
    root.innerHTML = `
      <div class="tabs" id="scopeTabs" style="margin:0 0 16px;">
        <button class="tab ${scope === 'active' ? 'active' : ''}" data-scope="active">الجاري والقادم</button>
        <button class="tab ${scope === 'past' ? 'active' : ''}" data-scope="past">المنقضي</button>
      </div>
      <div id="campsBody">
        <div class="skeleton" style="height:220px;"></div>
        <div class="skeleton" style="height:220px;"></div>
      </div>
    `;
    document.querySelectorAll('#scopeTabs .tab').forEach((tab) => {
      tab.addEventListener('click', () => { scope = tab.dataset.scope; load(); });
    });

    let camps;
    try {
      camps = await SndkApi.getData('get-camps', { query: { scope } });
    } catch (err) {
      document.getElementById('campsBody').innerHTML =
        `<div class="state-box">تعذّر تحميل المخيمات.<br>${esc(err.message)}</div>`;
      return;
    }

    if (!camps || camps.length === 0) {
      document.getElementById('campsBody').innerHTML =
        '<div class="state-box">لا مخيمات في هذا القسم حالياً.</div>';
      return;
    }

    document.getElementById('campsBody').innerHTML = camps.map((c) => campCard(c)).join('');
    wireImageFallbacks(document.getElementById('campsBody'));
    document.querySelectorAll('.camp-card-link').forEach((el) => {
      el.addEventListener('click', () => {
        window.location.href = `${sndkBasePath()}/camp/${el.dataset.campId}`;
      });
    });
    document.querySelectorAll('.camp-share-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = `${window.location.origin}${sndkBasePath()}/camp/${btn.dataset.campId}`;
        shareLink(url, btn.dataset.campTitle);
      });
    });
  }

  await load();
}

function campBadge(camp) {
  if (campIsRunning(camp)) return { label: 'جارٍ الآن', color: SNDK_HEX.success };
  if (campIsUpcoming(camp)) return { label: 'قادم', color: SNDK_HEX.info };
  return { label: 'منتهٍ', color: SNDK_HEX.textMuted };
}

function campCard(camp) {
  const badge = campBadge(camp);
  const organizer = campOrganizer(camp);
  const city = campCity(camp);
  const specialties = campSpecialties(camp).slice(0, 4);

  return `
    <div class="card camp-card-link" data-camp-id="${esc(camp.id)}" style="margin-bottom:12px;cursor:pointer;overflow:hidden;">
      ${camp.image_url
        ? `<div style="width:100%;height:140px;overflow:hidden;background:rgba(15,163,189,0.08);display:flex;align-items:center;justify-content:center;">
             <img src="${esc(camp.image_url)}" alt="${esc(camp.title || '')}" data-fallback-type="camp" style="width:100%;height:100%;object-fit:cover;display:block;">
           </div>`
        : ''}
      <div style="padding:14px;">
        <div class="row spread" style="align-items:flex-start;">
          <div class="title-md" style="flex:1;">${esc(camp.title)}</div>
          <span class="chip" style="background:${badge.color}1F;color:${badge.color};flex-shrink:0;">${esc(badge.label)}</span>
        </div>
        ${organizer ? `<div class="text-muted mt-8">${esc(organizer)}</div>` : ''}
        <div class="row gap-8 mt-8">${SNDK_ICONS.calendar(14)}<span class="text-muted">${esc(campDateRange(camp))}</span></div>
        ${city ? `<div class="row gap-8 mt-8">${SNDK_ICONS.pin(14)}<span class="text-muted">${esc(city)}</span></div>` : ''}
        ${specialties.length ? `
          <div class="row wrap gap-8 mt-8">
            ${specialties.map((s) => `<span class="chip" style="background:rgba(10,123,147,0.12);color:var(--primary);">${esc(s.arabic_name || s.name)}</span>`).join('')}
          </div>` : ''}
        <div class="row spread mt-12">
          <span style="font-weight:700;color:${campIsFree(camp) ? 'var(--success)' : 'var(--warning)'};">
            ${campIsFree(camp) ? 'مجاني' : esc(String(camp.fee ?? ''))}
          </span>
          <button class="btn btn-sm btn-outline camp-share-btn" data-camp-id="${esc(camp.id)}"
                  data-camp-title="${esc(camp.title)}" title="مشاركة">
            ${SNDK_ICONS.share(15, 'currentColor')}
          </button>
        </div>
      </div>
    </div>
  `;
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
