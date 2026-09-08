// node --test js/ai/markdown.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from './markdown.mjs';

test('escapes HTML in text', () => {
  assert.equal(renderMarkdown('<script>alert(1)</script>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
});

test('bold', () => {
  assert.equal(renderMarkdown('**مهم**'), '<p><strong>مهم</strong></p>');
});

test('link only on whitelisted https host, else plain text', () => {
  assert.match(renderMarkdown('[د. أحمد](https://snadk.codeysaa.com/doctor/x)'),
    /<a href="https:\/\/snadk\.codeysaa\.com\/doctor\/x" target="_blank" rel="noopener noreferrer">د\. أحمد<\/a>/);
  assert.equal(renderMarkdown('[شرير](https://evil.example/x)'), '<p>شرير</p>');
  assert.equal(renderMarkdown('[لا https](http://snadk.codeysaa.com/x)'), '<p>لا https</p>');
});

test('javascript: URL is not linkified', () => {
  assert.doesNotMatch(renderMarkdown('[x](javascript:alert(1))'), /<a /);
});

test('bullet list', () => {
  assert.equal(renderMarkdown('- أ\n- ب'), '<ul><li>أ</li><li>ب</li></ul>');
});

test('table with header separator', () => {
  const html = renderMarkdown('| الطبيب | التقييم |\n|---|---|\n| د. س | 4.5 |');
  assert.match(html, /<table><thead><tr><th>الطبيب<\/th><th>التقييم<\/th><\/tr><\/thead>/);
  assert.match(html, /<tbody><tr><td>د\. س<\/td><td>4\.5<\/td><\/tr><\/tbody><\/table>/);
});

test('table cell with a safe link', () => {
  const html = renderMarkdown('| الطبيب |\n|---|\n| [د. س](https://snadk.codeysaa.com/doctor/1) |');
  assert.match(html, /<td><a href="https:\/\/snadk\.codeysaa\.com\/doctor\/1"/);
});
