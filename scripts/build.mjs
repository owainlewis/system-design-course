// Builds the site: one static page per lesson file, plus a course home page.
// Usage: node scripts/build.mjs            -> dist/, clean URLs (/dns/)
//        node scripts/build.mjs --flat DIR -> DIR/, flat files (dns.html) with relative links, for previews
import { readFileSync, writeFileSync, mkdirSync, readdirSync, cpSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { checkLesson } from './check.mjs';

const root = new URL('..', import.meta.url).pathname;
const flatAt = process.argv.indexOf('--flat'), flat = flatAt > -1;
const out = flat ? process.argv[flatAt + 1].replace(/\/?$/, '/') : root + 'dist/';
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
const bySlug = Object.fromEntries(lessons.map(l => [l.slug, l]));
const kinds = readdirSync(root + 'src/kinds').filter(f => f.endsWith('.js')).sort();
const scripts = ['sim.js', 'app.js', ...kinds.map(k => 'kinds/' + k)];
const hash = createHash('sha256').update(['src/page.css', ...scripts.map(s => 'src/' + s)].map(read).join('')).digest('hex').slice(0, 10);
const template = read('src/template.html'), body = read('src/body.html');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const json = o => JSON.stringify(o).replace(/</g, '\\u003c');
const assets = flat ? 'assets/' : '/assets/';
const href = slug => flat ? `${slug}.html` : `/${slug}/`;
const page = (o) => template.replaceAll('{{title}}', esc(o.title)).replaceAll('{{summary}}', esc(o.summary)).replaceAll('{{path}}', o.path)
  .replace('{{flat}}', flat ? ' data-flat' : '').replaceAll('{{assets}}', assets)
  .replace('{{scripts}}', o.scripts ? scripts.map(s => `<script src="${assets}${s}?v=${hash}"></script>`).join('\n') : '')
  .replaceAll('{{hash}}', hash).replace('{{body}}', o.body).replace('{{course}}', json(course)).replace('{{lesson}}', json(o.lesson ?? {}));

rmSync(out, { recursive: true, force: true });
mkdirSync(out + 'assets/kinds', { recursive: true });
for (const f of ['page.css', ...scripts]) cpSync(root + 'src/' + f, out + 'assets/' + f);
cpSync(root + 'src/fonts', out + 'assets/fonts', { recursive: true });

for (const l of lessons) {
  const html = page({ title: `${l.title} · ${course.title}`, summary: l.summary, path: `${l.slug}/`, body, lesson: l, scripts: true });
  if (flat) writeFileSync(out + `${l.slug}.html`, html);
  else { mkdirSync(out + l.slug, { recursive: true }); writeFileSync(out + `${l.slug}/index.html`, html); }
}

// Course home page: every part and lesson, with finished lessons linked.
let n = 0;
const total = course.parts.reduce((a, p) => a + p.lessons.length, 0);
const homeBody = `<header class="bar"><a class="brand" href="${flat ? 'index.html' : '/'}">${esc(course.title)}<span>${total} lessons</span></a><span class="sp"></span><a class="sub" href="https://www.skool.com/aiengineer">Learn AI Engineering</a></header>
<main class="home">
  <h1>${esc(course.title)}</h1>
  <p class="dek">A free course on how large systems work. Each lesson explains one idea in plain words, with diagrams you can run and change.</p>
  ${course.parts.map(p => `<h2>${esc(p.title)}</h2><ol>${p.lessons.map(([slug, title]) => { n++; const l = bySlug[slug];
    return `<li><i>${String(n).padStart(2, '0')}</i>${l ? `<div><a href="${href(slug)}">${esc(title)}</a><p>${esc(l.summary)}</p></div><span class="s">${l.minutes} min</span>` : `<span class="t">${esc(title)}</span><span class="s">Soon</span>`}</li>`; }).join('')}</ol>`).join('')}
</main>`;
writeFileSync(out + 'index.html', page({ title: course.title, summary: 'A free course on how large systems work, with interactive diagrams.', path: '', body: homeBody }).replace(`${esc(course.title)} · ${esc(course.title)}`, esc(course.title)));
if (!flat) writeFileSync(out + '_headers', `/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n`);
console.log(`Built ${lessons.length} lesson(s) and the home page into ${out}`);
