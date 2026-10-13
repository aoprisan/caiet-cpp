// Turns a pbinfo export (JSON with a `probleme` array) into probleme/probleme.json, the trimmed list the page loads.
// Usage: node tools/probleme.mjs <export.json>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const SUB = ['Operatori și expresii', 'Structura de decizie', 'Structuri repetitive'];
const DIF = ['ușoară', 'medie', 'dificilă', 'concurs'];
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', n: 'ⁿ', b: 'ᵇ', '+': '⁺', '-': '⁻' };
const SUBS = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', m: 'ₘ' };
const map = (s, t) => [...s].every(c => t[c]) ? [...s].map(c => t[c]).join('') : null;

/** The few LaTeX formulas in the statements, as plain text: \( a^b \) -> aᵇ, \frac{a}{b} -> (a)/(b). */
function tex(f) {
  let s = f.replace(/\\cdots/g, '⋯').replace(/\\cdot/g, '·').replace(/\\le\b/g, '≤').replace(/\\ge\b/g, '≥')
    .replace(/\\left\s*/g, '').replace(/\\right\s*/g, '');
  for (let k = 0; k < 20; k++) {
    const t = s
      .replace(/\{\s*([^{}]*?)\s*\\over\s*([^{}]*?)\s*\}/g, '\\frac{$1}{$2}')
      .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a, b) => (/^\w+$/.test(a) ? a : '(' + a + ')') + '/' + (/^\w+$/.test(b) ? b : '(' + b + ')'))
      .replace(/\\sqrt\s*\[\s*(\w+)\s*\]\s*\{([^{}]*)\}/g, (_, n, x) => (map(n, SUP) || n) + '√(' + x + ')')
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)')
      .replace(/\^\{([^{}]*)\}/g, (_, x) => map(x, SUP) || '^(' + x + ')')
      .replace(/_\{([^{}]*)\}/g, (_, x) => map(x, SUBS) || '_' + x);
    // Plain grouping braces go only once nothing else matches, and never the arguments of \frac or \sqrt.
    const u = t !== s ? t : t.replace(/(?<![a-z\]}])\{([^{}\\]*)\}/g, '$1');
    if (u === s) break;
    s = u;
  }
  return s.replace(/\^(\w)/g, (m, x) => map(x, SUP) || m).replace(/_(\w)/g, (m, x) => map(x, SUBS) || m).replace(/\s+/g, ' ').trim();
}
const text = s => (s || '').replace(/\\\((.*?)\\\)/gs, (_, f) => tex(f)).replace(/[\r\u200b]/g, '').trim();

const src = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const list = src.probleme.map(p => {
  const sect = Object.entries(p.sectiuni).map(([h, t]) => [h === '_intro' ? '' : h.replace('Explicaţie', 'Explicație'), text(t)]);
  return {
    id: p.id, slug: p.slug, nume: p.nume, sub: SUB.indexOf(p.subcategorie), dif: DIF.indexOf(p.dificultate),
    ...(p.intrare_iesire !== 'tastatură / ecran' && { fis: p.intrare_iesire.split(' / ')[0].replace(/\.in$/, '') }),
    ...(p.autor && p.autor !== '-' && { autor: p.autor }), ...(p.sursa && { sursa: p.sursa }),
    cerinta: text(p.cerinta), intrare: text(p.date_intrare), iesire: text(p.date_iesire), restrictii: text(p.restrictii),
    ex: p.exemple.map(e => ({ in: e.input.replace(/\r/g, ''), out: e.output.replace(/\r/g, ''), ...(e.explicatie && { ex: text(e.explicatie) }) })),
    ...(sect.length && { sect }),
  };
});
for (const p of list) if (p.sub < 0 || p.dif < 0) throw new Error('unknown category or difficulty: ' + p.slug);
list.sort((a, b) => a.sub - b.sub || a.dif - b.dif || a.nume.localeCompare(b.nume, 'ro'));
mkdirSync('probleme', { recursive: true });
writeFileSync('probleme/probleme.json', JSON.stringify({ sursa: src.sursa, extras: src.extras_la.slice(0, 10), probleme: list }) + '\n');
console.log(list.length + ' probleme -> probleme/probleme.json');
