// Content rules that can be checked by a script. See style-guide.md.
const BANNED = ['—', 'leverage', 'utilize', 'seamless', 'robust', 'powerful', "it's worth noting", 'simply', 'in today'];
const SOURCE_TYPES = ['standard', 'docs', 'paper', 'engineering', 'official'];

export function checkLesson(l) {
  const out = [];
  for (const k of ['slug', 'title', 'summary', 'sections', 'figures', 'references']) if (!l[k]) out.push(`missing "${k}"`);
  if (out.length) return out;
  const text = [];
  for (const s of l.sections) for (const b of s.blocks) {
    if (b.p) text.push(b.p); if (b.h3) text.push(b.h3); if (b.list) text.push(...b.list); if (b.caption) text.push(b.caption);
    if (b.figure && !l.figures[b.figure]) out.push(`figure "${b.figure}" has no entry in figures`);
    if (b.figure && !b.caption) out.push(`figure "${b.figure}" has no caption`);
  }
  for (const t of text) {
    const low = t.toLowerCase();
    for (const w of BANNED) if (low.includes(w)) out.push(`banned word "${w}" in: ${t.slice(0, 60)}`);
    const words = t.replace(/`[^`]*`/g, 'x').split(/(?<=[.!?])\s+/);
    for (const s of words) if (s.split(/\s+/).length > 34) out.push(`long sentence (${s.split(/\s+/).length} words): ${s.slice(0, 60)}`);
  }
  if (l.references.length < 2) out.push('fewer than 2 references');
  for (const r of l.references) if (!SOURCE_TYPES.includes(r.type)) out.push(`reference needs a type (${SOURCE_TYPES.join(', ')}): ${r.url}`);
  return out;
}
