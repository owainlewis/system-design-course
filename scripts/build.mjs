// Builds dist/: one static page per lesson file, plus a course home page.
// Usage: node scripts/build.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync, cpSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { checkLesson } from './check.mjs';

const root = new URL('..', import.meta.url).pathname;
const read = p => readFileSync(root + p, 'utf8');
const course = JSON.parse(read('course.json'));
const known = new Set(course.parts.flatMap(p => p.lessons.map(l => l[0])));
const slugs = readdirSync(root + 'lessons').filter(f => f.endsWith('.json')).map(f => f.slice(0, -5));

const errors = [];
const lessons = slugs.map(slug => {
  const lesson = JSON.parse(read(`lessons/${slug}.json`));
  if (lesson.slug !== slug) errors.push(`${slug}: slug field is "${lesson.slug}"`);
  if (!known.has(slug)) errors.push(`${slug}: not listed in course.json`);
  errors.push(...checkLesson(lesson).map(e => `${slug}: ${e}`));
  return lesson;
}).filter(l => !l.draft);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }

course.ready = lessons.map(l => l.slug);
const kinds = readdirSync(root + 'src/kinds').filter(f => f.endsWith('.js')).sort();
const scripts = ['sim.js', 'app.js', ...kinds.map(k => 'kinds/' + k)];
const assets = ['src/page.css', ...scripts.map(s => 'src/' + s)].map(read).join('');
const hash = createHash('sha256').update(assets).digest('hex').slice(0, 10);
const template = read('src/template.html'), body = read('src/body.html');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const json = o => JSON.stringify(o).replace(/</g, '\\u003c');

rmSync(root + 'dist', { recursive: true, force: true });
mkdirSync(root + 'dist/assets', { recursive: true });
mkdirSync(root + 'dist/assets/kinds', { recursive: true });
for (const f of ['page.css', ...scripts]) cpSync(root + 'src/' + f, root + 'dist/assets/' + f);
cpSync(root + 'src/fonts', root + 'dist/assets/fonts', { recursive: true });

for (const l of lessons) {
  const html = template.replaceAll('{{title}}', esc(l.title)).replaceAll('{{summary}}', esc(l.summary)).replaceAll('{{slug}}', l.slug)
    .replace('{{scripts}}', scripts.map(s => `<script src="/assets/${s}?v={{hash}}"></script>`).join('\n')).replaceAll('{{hash}}', hash).replace('{{body}}', body).replace('{{course}}', json(course)).replace('{{lesson}}', json(l));
  mkdirSync(root + `dist/${l.slug}`, { recursive: true });
  writeFileSync(root + `dist/${l.slug}/index.html`, html);
}
// Until the course has a home page, send / to the first ready lesson.
const first = course.parts.flatMap(p => p.lessons.map(x => x[0])).find(s => course.ready.includes(s));
writeFileSync(root + 'dist/_redirects', `/ /${first}/ 302\n`);
writeFileSync(root + 'dist/_headers', `/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n`);
console.log(`Built ${lessons.length} lesson(s) into dist/`);
