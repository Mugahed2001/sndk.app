# `js/ai/` — مساعد سندك الطبي على الموقع

طبقة محلية حتمية تعمل بالكامل في متصفّح الزائر:

1. تُضمّن السؤال محلياً (`@huggingface/transformers` + `Xenova/multilingual-e5-small`)
   — **نصّ الزائر لا يغادر جهازه**.
2. تصنّف النيّة برأس خطّي صغير (`intent_head.json`، ~66KB).
3. تستخرج الكيانات (تخصّص/مدينة/اسم طبيب/اسم مرفق) حتمياً من `nlu/lexicon.json`.
4. خارج النطاق / ثقة منخفضة ⇒ ردّ ثابت، **بلا أي طلب شبكي**.
5. نيّات البحث ⇒ تُرسل **المتجه فقط** (لا نصّ) إلى `assistant-retrieve`، ثم قوالب
   Markdown حتمية (روابط على نطاق أبيض فقط عبر `markdown.mjs`).
6. نيّة «جدول العيادة» ⇒ خطوتان: حلّ المعرّف بالاسترجاع ← `get-clinic-schedules`.
7. عند تعذّر الطبقة المحلية (`outcome === 'error'`) فقط ⇒ سقوط إلى دالة
   `ai-assistant` السحابية القائمة (Gemini/Groq).

## البنية

```
js/ai/
├── assistant-widget.mjs   الزرّ العائم + لوحة المحادثة (يُركّب نفسه)
├── markdown.mjs            عارض Markdown صغير آمن (تهريب HTML + نطاق روابط أبيض)
├── intent_head.json        أوزان مصنِّف النيّة (ناتج CI في مستودع snd_health)
├── client/
│   ├── assistant-local.mjs   الواجهة: warmUp() / ask()
│   ├── normalize.mjs         تطبيع عربي + كشف المتابعة
│   └── templates.mjs         قوالب Markdown + حارس الروابط
└── nlu/
    ├── entities.mjs / lexicon.mjs / lexicon.json   استخراج الكيانات + المعجم
```

المصدر الأصلي لهذه الوحدات: `ai/` في مستودع `snd_health`. عند تحديثها هناك
أعِد نسخ `client/`, `nlu/`, و`intent_head.json` هنا.

## التفعيل في صفحة

```html
<script src="js/config.js"></script>
<!-- ... بقيّة سكربتات الصفحة ... -->
<script type="module" src="js/ai/assistant-widget.mjs"></script>
```

مُفعّل حالياً في `index.html`. للإضافة لصفحات أخرى (`doctors.html`,
`facilities.html`, `camps.html`...) أضِف نفس الوسم قبل `</body>`.

**التعطيل:** `window.SNDK_ASSISTANT_DISABLED = true;` قبل وسم الودجة.

## الاختبار

- صفحة معزولة: `assistant-test.html` في جذر الموقع (noindex) — أزرار جُمل جاهزة
  وعرض `intent/confidence/outcome/الزمن`.
- تحقّق في DevTools: لا طلب يحمل نصّ الزائر؛ فقط `POST assistant-retrieve` بجسم
  فيه `embedding` (٣٨٤ رقماً). النموذج من `huggingface.co`، المكتبة من `cdn.jsdelivr.net`.

## المتطلّبات لعمل مسار البحث الكامل

على مشروع Supabase: ترحيل `20260915000000` مُطبَّق + دالة `assistant-retrieve`
منشورة + فهرس التضمين مملوء. حتى ذلك الحين تعمل المسارات بلا شبكة فقط
(تصنيف/كيانات/خارج النطاق/إرشاد)، والبحث يسقط إلى `ai-assistant` السحابية.

## CSP (إن أُضيفت للموقع لاحقاً)

```
script-src  'self' https://cdn.jsdelivr.net ;
connect-src 'self' https://zoveiphxwzckgzavvrlb.supabase.co https://huggingface.co https://*.huggingface.co https://cdn.jsdelivr.net ;
```
