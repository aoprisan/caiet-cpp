// The pbinfo problem set: types, compatibility notes, search and checking a program on the examples. No DOM.
import { compile, CppError } from './interp.js';

export interface Exemplu { in: string; out: string; ex?: string }
/** One problem from probleme/probleme.json (built by tools/probleme.mjs). `fis` is the file name when it reads from a file. */
export interface Problema {
  id: number; slug: string; nume: string; sub: number; dif: number; fis?: string; autor?: string; sursa?: string;
  cerinta: string; intrare: string; iesire: string; restrictii: string; ex: Exemplu[]; sect?: [title: string, text: string][];
}
export interface Culegere { sursa: string; extras: string; probleme: Problema[] }

export const CAPITOLE = ['Operatori și expresii', 'Structura de decizie', 'Structuri repetitive'];
export const DIFICULTATI = ['ușoară', 'medie', 'dificilă', 'concurs'];
export const url = (p: Problema) => 'https://www.pbinfo.ro/probleme/' + p.id + '/' + p.slug;

const INTMAX = 2147483647, LLMAX = 9223372036854775807n;
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
/** The largest number written in a text, reading 1.000.000 as a million and 10⁹ as a power of ten. */
function biggest(s: string): number {
  let m = 0;
  for (const [w] of s.matchAll(/\d{1,3}(?:\.\d{3})+(?!\d)|\d+/g)) m = Math.max(m, Number(w.replace(/\./g, '')));
  for (const [, b, e] of s.matchAll(/(\d+)\s*\^\s*\(?(\d+)/g)) m = Math.max(m, Number(b) ** Number(e));
  for (const [, b, e] of s.matchAll(/(\d+)([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g)) m = Math.max(m, Number(b) ** Number([...e].map(c => SUP.indexOf(c)).join('')));
  return m;
}

/** Why a problem may not work in the notebook, or needs long long. `stop` is set when the examples themselves cannot be solved here. */
export function note(p: Problema): { text: string[]; stop: boolean } {
  const text: string[] = [];
  let stop = false;
  const ins = p.ex.map(e => e.in).join(' '), outs = p.ex.map(e => e.out).join(' ');
  const nums = [...(ins + ' ' + outs).matchAll(/\d+/g)].map(([w]) => BigInt(w));
  if (ins.split(/\s+/).some(w => w && !/^[+-]?\d+$/.test(w)) || /\d[.,]\d/.test(outs)) {
    text.push('Exemplele folosesc numere cu virgulă sau caractere, pe care caietul nu le are. Problema nu se poate rezolva aici.'); stop = true;
  } else if (nums.some(n => n > LLMAX)) {
    text.push('Exemplele au numere prea mari chiar și pentru long long (peste 9223372036854775807). Problema nu se poate rezolva aici.'); stop = true;
  } else if (nums.some(n => n > INTMAX)) {
    text.push('Exemplele au numere prea mari pentru int (peste 2147483647). Folosește long long pentru ele.');
  } else if (biggest(p.restrictii) > Number(LLMAX)) {
    text.push('Restricțiile permit numere mai mari decât încap chiar și într-un long long. Aici poți verifica doar exemplele.');
  } else if (biggest(p.restrictii) > INTMAX) {
    text.push('Restricțiile permit numere mai mari decât încap într-un int. Folosește long long.');
  }
  if (p.fis) text.push('Pe pbinfo programul citește din fișierul ' + p.fis + '.in și scrie în ' + p.fis + '.out. Aici folosește cin și cout.');
  return { text, stop };
}

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Does the problem match the search text (name, number or statement, diacritics ignored)? */
export function matches(p: Problema, q: string): boolean {
  const w = plain(q).trim();
  if (!w) return true;
  if (/^#?\d+$/.test(w)) return String(p.id) === w.replace('#', '');
  return w.split(/\s+/).every(t => plain(p.nume + ' ' + p.slug + ' ' + p.cerinta).includes(t));
}

/** Outputs are equal when they have the same words and numbers, whatever the spaces and line breaks (like pbinfo). */
export const same = (got: string, want: string) => got.trim().split(/\s+/).join(' ') === want.trim().split(/\s+/).join(' ');

export interface Rezultat { ok: boolean; out: string; want: string; err?: CppError }
/** Runs the program on every example. A compile error throws, since it is the same for all of them. */
export function verifica(src: string, p: Problema): Rezultat[] {
  const prog = compile(src);
  return p.ex.map(e => {
    try { const out = prog.run(e.in).out; return { ok: same(out, e.out), out, want: e.out } }
    catch (x) {
      if (!(x instanceof CppError)) throw x;
      return { ok: false, out: x.out || '', want: e.out, err: x };
    }
  });
}

/** The program as it should be sent to pbinfo.ro. When the problem reads from files, two lines in main make
 * cin and cout the files (they hide the keyboard and screen ones), so the rest of the program stays the same. */
export function pentruPbinfo(src: string, p: Problema): { code: string; fis: boolean } {
  if (!p.fis) return { code: src, fis: false };
  const main = /\bint\s+main\s*\(\s*\)\s*\{/.exec(src);
  if (!main) return { code: src, fis: false };
  const at = main.index + main[0].length;
  const files = '\n    ifstream cin("' + p.fis + '.in");\n    ofstream cout("' + p.fis + '.out");';
  let code = src.slice(0, at) + files + src.slice(at);
  if (!/#include\s*<fstream>/.test(code)) code = code.replace(/(#include\s*<iostream>[^\n]*)/, '$1\n#include <fstream>');
  return { code, fis: true };
}

/** A statement split into blocks: paragraphs (lines kept) and "- " lists. */
export type Bloc = { p: string } | { li: string[] };
export function blocuri(s: string): Bloc[] {
  return s.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean).map(b => {
    const ls = b.split('\n').map(l => l.trim());
    return ls.every(l => /^[-–•]\s/.test(l)) ? { li: ls.map(l => l.replace(/^[-–•]\s+/, '')) } : { p: ls.join('\n') };
  });
}
