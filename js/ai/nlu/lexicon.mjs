// تحميل المعجم المشترك (lexicon.json) في المتصفّح/Node — نظير lexicon.py.
// مصدر وحيد للحقيقة: نفس ملفّ JSON يقرأه الطرفان.

import { normalizeArabic } from '../client/normalize.mjs';

let _raw = null;
let _specIndex = null;
let _cityIndex = null;

async function loadRaw() {
  if (_raw) return _raw;
  try {
    // Node ≥ 20.10 والمتصفّحات الحديثة: import attributes.
    _raw = (await import('./lexicon.json', { with: { type: 'json' } })).default;
  } catch {
    // بديل للمتصفّحات الأقدم: جلب نسبيّ.
    const res = await fetch(new URL('./lexicon.json', import.meta.url));
    _raw = await res.json();
  }
  return _raw;
}

function buildIndex(section) {
  const idx = new Map();
  for (const [canon, aliases] of Object.entries(section)) {
    for (const form of [canon, ...aliases]) {
      const n = normalizeArabic(form);
      if (n && !idx.has(n)) idx.set(n, canon);
    }
  }
  return idx;
}

export async function specialtyIndex() {
  if (!_specIndex) _specIndex = buildIndex((await loadRaw()).specialties);
  return _specIndex;
}

export async function cityIndex() {
  if (!_cityIndex) _cityIndex = buildIndex((await loadRaw()).cities);
  return _cityIndex;
}

// بحث مرن: مباشر ثم بعد نزع سابقة «ال» (نظير _lookup في lexicon.py).
function lookup(index, text) {
  if (!text) return null;
  const n = normalizeArabic(text);
  if (index.has(n)) return index.get(n);
  if (n.startsWith('ال') && n.length > 4 && index.has(n.slice(2))) return index.get(n.slice(2));
  return null;
}

export async function resolveSpecialty(text) {
  return lookup(await specialtyIndex(), text);
}

export async function resolveCity(text) {
  return lookup(await cityIndex(), text);
}

export async function synonymsForSpecialty(canonOrAlias) {
  const raw = await loadRaw();
  const canon = lookup(await specialtyIndex(), canonOrAlias);
  return canon ? [canon, ...raw.specialties[canon]] : [];
}

export async function specialtyWords() {
  const raw = await loadRaw();
  const words = new Set();
  for (const [canon, aliases] of Object.entries(raw.specialties)) {
    for (const form of [canon, ...aliases]) {
      for (const w of normalizeArabic(form).split(' ')) if (w.length > 2) words.add(w);
    }
  }
  return words;
}
