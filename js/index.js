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

document.getElementById('homeAssistantBtn')?.addEventListener('click', () => SndkAssistantLoader.open());

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
loadHomeFeed();

// ─────────────── خلاصة الإعلانات المحلية والفعاليات (نمط feed) ───────────────
//
// نداء واحد `get-home-feed` يدمج المصدرين مرتّبين بالأحدث نشراً. إن لم تكن
// النقطة منشورة بعد يسقط لنداءين متوازيين (get-local-ads + get-camps) ويدمج
// محلياً. القسم يبقى مخفياً ما لم يرجع عنصر واحد على الأقل — قسم فارغ ظاهر
// يوحي بموقع غير نشط.

const FEED_MAX = 6;
const CAMP_TINT = 'rgba(15,163,189,0.08)';   // نفس خلفية صورة بطاقة المخيم
const ICON_TINT = 'rgba(10,123,147,0.12)';   // نفس خلفية .section-icon

function safeCtaHref(type, value) {
  const v = String(value || '').trim();
  if (!v) return null;
  if (type === 'phone') {
    const digits = v.replace(/[^\d+]/g, '');
    return digits ? `tel:${digits}` : null;
  }
  // https فقط، وبلا أي محرف قد يكسر خاصّية HTML (esc لا يُفلت " ' < >).
  if (/^https:\/\/[^\s"'<>\\]+$/i.test(v)) return v;
  return null;
}

function feedAvatarHtml(item) {
  const logo = item.advertiser && item.advertiser.logo_url;
  if (logo) {
    return `<div style="width:32px;height:32px;border-radius:50%;overflow:hidden;flex-shrink:0;background:${ICON_TINT};">
      <img src="${esc(logo)}" alt="" data-fallback-type="hospital" style="width:100%;height:100%;object-fit:cover;display:block;">
    </div>`;
  }
  const icon = item.feed_type === 'ad' ? SNDK_ICONS.megaphone(16) : SNDK_ICONS.calendar(16);
  return `<div style="width:32px;height:32px;border-radius:50%;flex-shrink:0;background:${ICON_TINT};display:flex;align-items:center;justify-content:center;">${icon}</div>`;
}

function feedHeaderHtml(item, chipLabel) {
  const name = (item.advertiser && item.advertiser.name) || 'سندك الطبي';
  const meta = [item.city, relativeTimeAr(item.created_at)].filter(Boolean).join(' • ');
  return `
    <div class="row gap-8" style="align-items:center;">
      ${feedAvatarHtml(item)}
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(name)}</div>
        ${meta ? `<div class="text-muted" style="font-size:11px;">${esc(meta)}</div>` : ''}
      </div>
      <span class="chip" style="background:${SNDK_HEX.primary}1F;color:${SNDK_HEX.primary};flex-shrink:0;">${esc(chipLabel)}</span>
    </div>`;
}

function feedImageHtml(url, alt) {
  if (!url) return '';
  return `<div style="width:100%;height:160px;overflow:hidden;border-radius:var(--radius-md);background:${CAMP_TINT};margin-top:10px;">
    <img src="${esc(url)}" alt="${esc(alt || '')}" data-fallback-type="camp" style="width:100%;height:100%;object-fit:cover;display:block;">
  </div>`;
}

function adCardHtml(item) {
  const chip = AD_CATEGORY_LABELS[item.category] || AD_CATEGORY_LABELS.general;
  const href = item.cta ? safeCtaHref(item.cta.type, item.cta.value) : null;
  const ctaIcon = item.cta && item.cta.type === 'phone' ? SNDK_ICONS.phone(14)
    : item.cta && item.cta.type === 'whatsapp' ? SNDK_ICONS.chat(14)
    : SNDK_ICONS.share(14, 'currentColor');
  const footer = href
    ? `<div class="row wrap gap-8 mt-12">
         <a class="btn btn-sm btn-outline" href="${esc(href)}"${item.cta.type === 'url' ? ' target="_blank" rel="noopener noreferrer"' : ''}>${ctaIcon} ${esc(item.cta.label || 'معرفة المزيد')}</a>
       </div>`
    : '';
  return `
    <div class="card" style="margin-bottom:12px;overflow:hidden;">
      <div style="padding:14px;">
        ${feedHeaderHtml(item, chip)}
        ${item.text ? `<div class="mt-8" style="font-size:13.5px;line-height:1.7;">${esc(item.text)}</div>` : ''}
        ${feedImageHtml(item.image_url, item.title)}
        ${footer}
      </div>
    </div>`;
}

function eventCardHtml(item) {
  const kindLabel = EVENT_KIND_LABELS[item.kind] || EVENT_KIND_LABELS.camp;
  const dateText = campDateRange({ start_date: item.start_date, end_date: item.end_date });
  const timeText = item.daily_start_time
    ? `${String(item.daily_start_time).slice(0, 5)}${item.daily_end_time ? ` – ${String(item.daily_end_time).slice(0, 5)}` : ''}`
    : '';
  const place = [item.city, item.directorate].filter(Boolean).join(' • ');
  const feeText = item.is_free ? 'مجاني' : (item.fee != null ? String(item.fee) : '');
  const ctaLabel = item.requires_registration ? 'سجّل الآن' : 'التفاصيل';
  return `
    <div class="card feed-event-card" data-camp-id="${esc(item.camp_id)}" style="margin-bottom:12px;overflow:hidden;cursor:pointer;">
      <div style="padding:14px;">
        ${feedHeaderHtml(item, kindLabel)}
        ${item.title ? `<div class="title-md mt-8" style="font-size:15px;">${esc(item.title)}</div>` : ''}
        <div class="row gap-8 mt-8">${SNDK_ICONS.calendar(14)}<span class="text-muted">${esc([dateText, timeText].filter(Boolean).join(' • '))}</span></div>
        ${place ? `<div class="row gap-8 mt-8">${SNDK_ICONS.pin(14)}<span class="text-muted">${esc(place)}</span></div>` : ''}
        ${item.text ? `<div class="text-muted mt-8" style="font-size:13px;line-height:1.7;">${esc(item.text.length > 200 ? item.text.slice(0, 200) + '…' : item.text)}</div>` : ''}
        ${feedImageHtml(item.image_url, item.title)}
        <div class="row spread mt-12" style="align-items:center;">
          ${feeText ? `<span style="font-weight:700;color:${item.is_free ? 'var(--success)' : 'var(--warning)'};">${esc(feeText)}</span>` : '<span></span>'}
          <a class="btn btn-sm btn-outline" href="${sndkBasePath()}/camp/${encodeURIComponent(item.camp_id)}">${SNDK_ICONS.check(14)} ${esc(ctaLabel)}</a>
        </div>
      </div>
    </div>`;
}

function feedCardHtml(item) {
  return item.feed_type === 'event' ? eventCardHtml(item) : adCardHtml(item);
}

function normalizeAd(a) {
  return {
    feed_type: 'ad',
    id: a.id,
    created_at: a.created_at || null,
    category: a.category || 'general',
    city: a.city || null,
    advertiser: { name: (a.facilities && a.facilities.name) || 'سندك الطبي', logo_url: (a.facilities && a.facilities.logo_url) || null },
    text: a.description || a.title || '',
    title: a.title || '',
    image_url: a.image_url || null,
    cta: a.target_type && a.target_type !== 'none' && a.target_url
      ? { type: /^tel:/i.test(a.target_url) ? 'phone' : /wa\.me|whatsapp/i.test(a.target_url) ? 'whatsapp' : 'url',
          value: a.target_url.replace(/^tel:/i, ''), label: 'معرفة المزيد' }
      : null,
  };
}

function normalizeCamp(c) {
  return {
    feed_type: 'event',
    id: c.id,
    camp_id: c.id,
    created_at: c.created_at || null,
    kind: c.kind || 'camp',
    city: campCity(c) || null,
    directorate: null,
    address: c.address || null,
    advertiser: { name: campOrganizer(c) || 'سندك الطبي', logo_url: (c.facilities && c.facilities.logo_url) || null },
    title: c.title || '',
    text: c.description || '',
    image_url: c.image_url || null,
    start_date: c.start_date,
    end_date: c.end_date,
    daily_start_time: c.daily_start_time || null,
    daily_end_time: c.daily_end_time || null,
    is_free: c.is_free !== false,
    fee: c.fee != null ? c.fee : null,
    requires_registration: c.requires_registration !== false,
  };
}

async function fetchHomeFeedItems() {
  try {
    const data = await SndkApi.getData('get-home-feed', { query: { limit: FEED_MAX } });
    if (data && Array.isArray(data.items)) return data.items;
  } catch (_) { /* النقطة غير منشورة بعد — اسقط للمصدرين المنفصلين */ }

  const [ads, camps] = await Promise.all([
    SndkApi.getData('get-local-ads', { query: { screen: 'home', limit: 10 } }).catch(() => []),
    SndkApi.getData('get-camps', { query: { scope: 'active', limit: 10 } }).catch(() => []),
  ]);
  const merged = [
    ...(Array.isArray(ads) ? ads.map(normalizeAd) : []),
    ...(Array.isArray(camps) ? camps.map(normalizeCamp) : []),
  ];
  merged.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  return merged.slice(0, FEED_MAX);
}

async function loadHomeFeed() {
  const section = document.getElementById('homeFeed');
  const body = document.getElementById('homeFeedBody');
  if (!section || !body) return;
  let items = [];
  try {
    items = await fetchHomeFeedItems();
  } catch (_) {
    items = [];
  }
  if (!items.length) { section.hidden = true; return; }

  body.innerHTML = items.map(feedCardHtml).join('');
  wireImageFallbacks(body);
  body.querySelectorAll('.feed-event-card').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('a')) return; // زرّ CTA يتصرّف بنفسه
      window.location.href = `${sndkBasePath()}/camp/${el.dataset.campId}`;
    });
  });
  section.hidden = false;
}

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
