// ودجة «مساعد سندك الطبي» — زرّ عائم + لوحة محادثة.
//
// الطبقة المحلية الحتمية (تضمين + نيّة + كيانات في المتصفّح، النصّ لا يغادر
// الجهاز) هي الأساس؛ عند تعذّرها فقط (`outcome === 'error'`) تسقط إلى دالة
// `ai-assistant` السحابية القائمة (Gemini/Groq).
//
// الاستعمال في أي صفحة:
//   <script type="module" src="js/ai/assistant-widget.mjs"></script>
// التعطيل: window.SNDK_ASSISTANT_DISABLED = true قبل هذا الوسم.

import { createLocalAssistant } from './client/assistant-local.mjs';
import { renderMarkdown } from './markdown.mjs';

const CFG = (typeof window !== 'undefined' && window.SNDK_CONFIG) || {};
const LINK_BASE = 'https://snadk.codeysaa.com';
const ANON_KEY_LS = 'sndk_anon_id';

function anonId() {
  try {
    let v = localStorage.getItem(ANON_KEY_LS);
    if (!v) { v = crypto.randomUUID(); localStorage.setItem(ANON_KEY_LS, v); }
    return v;
  } catch {
    return 'anon-' + Math.random().toString(36).slice(2);
  }
}

const STYLE = `
.sndk-ai-fab{position:fixed;inset-inline-start:18px;inset-block-end:18px;z-index:2147483000;
  width:56px;height:56px;border-radius:50%;border:0;cursor:pointer;font-size:24px;
  background:#0b7285;color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.25)}
.sndk-ai-panel{position:fixed;inset-inline-start:18px;inset-block-end:84px;z-index:2147483000;
  width:min(380px,calc(100vw - 36px));height:min(560px,calc(100vh - 120px));
  display:none;flex-direction:column;background:var(--sndk-ai-bg,#fff);color:var(--sndk-ai-fg,#111);
  border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.28);overflow:hidden;font-size:14px}
.sndk-ai-panel.open{display:flex}
.sndk-ai-head{padding:12px 14px;background:#0b7285;color:#fff;font-weight:700;display:flex;justify-content:space-between;align-items:center}
.sndk-ai-head button{background:transparent;border:0;color:#fff;font-size:18px;cursor:pointer}
.sndk-ai-log{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px}
.sndk-ai-msg{max-width:88%;padding:8px 11px;border-radius:12px;line-height:1.6;word-wrap:break-word}
.sndk-ai-msg.u{align-self:flex-start;background:#0b7285;color:#fff}
.sndk-ai-msg.b{align-self:flex-end;background:#f1f3f5;color:#111}
.sndk-ai-msg table{border-collapse:collapse;width:100%;margin:4px 0;font-size:13px}
.sndk-ai-msg th,.sndk-ai-msg td{border:1px solid #ccc;padding:4px 6px;text-align:start}
.sndk-ai-msg a{color:#0b7285;font-weight:600}
.sndk-ai-msg ul{margin:4px 0;padding-inline-start:18px}
.sndk-ai-foot{display:flex;gap:6px;padding:10px;border-top:1px solid #e9ecef}
.sndk-ai-foot input{flex:1;padding:9px 11px;border:1px solid #ccc;border-radius:10px;font:inherit}
.sndk-ai-foot button{padding:0 14px;border:0;border-radius:10px;background:#0b7285;color:#fff;cursor:pointer}
.sndk-ai-foot button:disabled{opacity:.5;cursor:default}
.sndk-ai-hint{font-size:11px;opacity:.6;padding:0 12px 8px}
@media (prefers-color-scheme:dark){
  .sndk-ai-panel{--sndk-ai-bg:#1a1b1e;--sndk-ai-fg:#e9ecef}
  .sndk-ai-msg.b{background:#2b2d31;color:#e9ecef}
  .sndk-ai-foot{border-color:#2b2d31}
  .sndk-ai-foot input{background:#25262a;color:#e9ecef;border-color:#3a3b3f}
  .sndk-ai-msg th,.sndk-ai-msg td{border-color:#3a3b3f}
}`;

async function cloudFallback(text) {
  try {
    const res = await fetch(`${CFG.SUPABASE_URL}/functions/v1/ai-assistant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: CFG.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${CFG.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ anon_id: anonId(), messages: [{ role: 'user', content: text }] }),
    });
    const body = await res.json().catch(() => null);
    return body?.data?.reply || null;
  } catch {
    return null;
  }
}

function mount() {
  if (document.querySelector('.sndk-ai-fab')) return;
  if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY) {
    console.warn('[sndk-ai] SNDK_CONFIG ناقص — الودجة معطّلة');
    return;
  }

  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const fab = document.createElement('button');
  fab.className = 'sndk-ai-fab';
  fab.type = 'button';
  fab.setAttribute('aria-label', 'مساعد سندك الطبي');
  fab.textContent = '💬';

  const panel = document.createElement('div');
  panel.className = 'sndk-ai-panel';
  panel.innerHTML = `
    <div class="sndk-ai-head"><span>مساعد سندك الطبي</span><button type="button" aria-label="إغلاق">×</button></div>
    <div class="sndk-ai-log"></div>
    <div class="sndk-ai-hint">بحث عن الأطباء والمرافق والتخصّصات والمخيمات — بلا استشارة طبية.</div>
    <form class="sndk-ai-foot"><input type="text" autocomplete="off" placeholder="اكتب سؤالك…" />
      <button type="submit">إرسال</button></form>`;

  document.body.append(fab, panel);

  const log = panel.querySelector('.sndk-ai-log');
  const form = panel.querySelector('.sndk-ai-foot');
  const input = form.querySelector('input');
  const sendBtn = form.querySelector('button');

  const add = (cls, html) => {
    const el = document.createElement('div');
    el.className = `sndk-ai-msg ${cls}`;
    el.innerHTML = html;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  };

  let bot = null;
  let booting = null;
  const ensureBot = () => {
    if (bot) return Promise.resolve(bot);
    if (!booting) {
      booting = (async () => {
        bot = createLocalAssistant({
          supabaseUrl: CFG.SUPABASE_URL,
          supabaseAnonKey: CFG.SUPABASE_ANON_KEY,
          anonId: anonId(),
          intentHeadUrl: new URL('./intent_head.json', import.meta.url).toString(),
          linkBaseUrl: LINK_BASE,
        });
        await bot.warmUp();
        return bot;
      })();
    }
    return booting;
  };

  let greeted = false;
  const openPanel = () => {
    panel.classList.add('open');
    input.focus();
    if (!greeted) {
      greeted = true;
      add('b', renderMarkdown('أهلاً بك 👋 أساعدك في البحث عن طبيب أو مرفق أو تخصّص أو مخيم طبي، وأرشدك لخطوات الحجز.'));
      ensureBot().catch(() => {});
    }
  };
  fab.addEventListener('click', () => (panel.classList.contains('open') ? panel.classList.remove('open') : openPanel()));
  panel.querySelector('.sndk-ai-head button').addEventListener('click', () => panel.classList.remove('open'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    sendBtn.disabled = true;
    add('u', renderMarkdown(text));
    const thinking = add('b', '<span class="sndk-ai-typing">…</span>');
    try {
      const b = await ensureBot();
      let r = await b.ask(text);
      if (r.outcome === 'error') {
        const cloud = await cloudFallback(text);
        thinking.innerHTML = renderMarkdown(cloud || 'تعذّر الوصول للمساعد الآن. حاول لاحقاً.');
      } else {
        thinking.innerHTML = renderMarkdown(r.reply);
      }
    } catch (err) {
      console.error('[sndk-ai]', err);
      const cloud = await cloudFallback(text);
      thinking.innerHTML = renderMarkdown(cloud || 'تعذّر تشغيل المساعد على هذا المتصفّح.');
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  });
}

if (typeof window !== 'undefined' && !window.SNDK_ASSISTANT_DISABLED) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
}

export { mount };
