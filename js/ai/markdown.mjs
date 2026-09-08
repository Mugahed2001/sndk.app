// عارض Markdown صغير وآمن — يكفي ما تُنتجه قوالب المساعد فقط:
// **عريض** · قوائم «- » · جداول «| a | b |» · روابط [نص](رابط) · أسطر.
// كل شيء يُهرَّب (escape) أولاً؛ الروابط تُقبل فقط على نطاق أبيض و https.

const ALLOWED_LINK_HOSTS = new Set(['snadk.codeysaa.com', 'sndk-codey.onrender.com']);

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function inline(text) {
  // الترتيب: هرِّب، ثم روابط، ثم عريض.
  let out = esc(text);
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, label, href) => {
    try {
      const u = new URL(href);
      if (u.protocol === 'https:' && ALLOWED_LINK_HOSTS.has(u.host)) {
        return `<a href="${esc(u.toString())}" target="_blank" rel="noopener noreferrer">${label}</a>`;
      }
    } catch { /* تجاهل */ }
    return label; // نطاق غير مسموح ⇒ نصّ فقط
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return out;
}

export function renderMarkdown(md) {
  const lines = String(md || '').split('\n');
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // جدول: سطر رأس ثم سطر فاصل |---|
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(line);
      const body = [];
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        body.push(cells(lines[i]));
        i++;
      }
      html.push(
        '<table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') +
        '</tr></thead><tbody>' +
        body.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
        '</tbody></table>',
      );
      continue;
    }

    // قائمة نقطية
    if (/^\s*-\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*-\s+/, ''))}</li>`);
        i++;
      }
      html.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (line.trim() === '') { i++; continue; }

    html.push(`<p>${inline(line)}</p>`);
    i++;
  }
  return html.join('');
}
