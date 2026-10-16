// explain(line) -> array of Romanian sentences describing one source line. No DOM.

const W: Record<string, string> = {
  '==': ' este egal cu ', '!=': ' este diferit de ', '<=': ' este cel mult ', '>=': ' este cel puțin ',
  '<': ' este mai mic decât ', '>': ' este mai mare decât ', '&&': ' și ', '||': ' sau ', '!': ' nu ',
};
const cond = (c: string) => c.replace(/==|!=|<=|>=|&&|\|\||<|>|!/g, m => W[m]).replace(/\s+/g, ' ').trim();

/** Drops a trailing // comment, leaving string and char literals alone. */
function strip(s: string): string {
  let q = '', o = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { o += c; if (c === '\\') o += s[++i] || ''; else if (c === q) q = ''; continue }
    if (c === '"' || c === "'") { q = c; o += c; continue }
    if (c === '/' && s[i + 1] === '/') break;
    o += c;
  }
  return o;
}
/** Splits on `sep` outside literals and parentheses. */
function split(s: string, sep: string): string[] {
  const out: string[] = []; let q = '', d = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { cur += c; if (c === '\\') cur += s[++i] || ''; else if (c === q) q = ''; continue }
    if (c === '"' || c === "'") { q = c; cur += c; continue }
    if (c === '(') d++;
    if (c === ')') d--;
    if (d === 0 && s.startsWith(sep, i)) { out.push(cur); cur = ''; i += sep.length - 1; continue }
    cur += c;
  }
  out.push(cur); return out;
}
/** Given a string starting with "(", returns [inside, rest after the matching ")"]. */
function paren(s: string): [string, string] {
  let d = 0, q = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = ''; continue }
    if (c === '"' || c === "'") { q = c; continue }
    if (c === '(') d++;
    if (c === ')' && --d === 0) return [s.slice(1, i), s.slice(i + 1)];
  }
  return [s.slice(1), ''];
}
function simple(st: string): string {
  st = st.trim(); let m: RegExpExecArray | null;
  if (!st) return '';
  if (/^using\s+namespace\s+std$/.test(st)) return 'Ne lasă să scriem cin, cout și endl pe scurt, fără „std::” în față.';
  if (/^int\s+main\s*\(/.test(st)) return 'De aici începe programul. Instrucțiunile dintre acoladele lui main se execută pe rând, de sus în jos.';
  if (/^return\b/.test(st)) return 'Programul se încheie aici. Valoarea 0 înseamnă „totul a mers bine”.';
  if ((m = /^int\s+(.+)$/.exec(st))) {
    const names: string[] = [], inits: string[] = [];
    for (const d of split(m[1], ',')) {
      const k = /^\s*(\w+)\s*(?:=\s*(.+))?$/.exec(d);
      if (!k) continue;
      names.push(k[1]);
      if (k[2]) inits.push(k[1] + ' pornește cu valoarea ' + k[2].trim());
    }
    if (!names.length) return 'Creează variabile pentru numere întregi.';
    return (names.length > 1
      ? 'Creează variabilele ' + names.join(', ') + ' (cutii în memorie, fiecare pentru un număr întreg).'
      : 'Creează variabila ' + names[0] + ' (o cutie în memorie pentru un număr întreg).')
      + (inits.length ? ' ' + inits.join('; ') + '.' : '');
  }
  if (/^cin\b/.test(st)) {
    const v = split(st, '>>').slice(1).map(x => x.trim());
    return v.length > 1
      ? 'Citește pe rând câte un număr din datele de intrare și le pune în variabilele ' + v.join(', ') + '.'
      : 'Citește un număr din datele de intrare și îl pune în variabila ' + (v[0] || '') + '.';
  }
  if (/^cout\b/.test(st)) {
    const parts = split(st, '<<').slice(1).map(x => {
      x = x.trim();
      if (x[0] === '"') return 'textul „' + x.slice(1, -1) + '”';
      if (x[0] === "'") return x === "'\\n'" ? 'trece pe linie nouă' : x === "' '" ? 'un spațiu' : 'caracterul ' + x;
      if (x === 'endl') return 'trece pe linie nouă';
      if (/^\w+$/.test(x)) return /^\d+$/.test(x) ? 'numărul ' + x : 'valoarea lui ' + x;
      return 'rezultatul calculului ' + x;
    });
    return 'Afișează pe ecran: ' + parts.join(', apoi ') + '.';
  }
  if (st === 'break') return 'Iese imediat din repetiție și continuă cu ce urmează după ea.';
  if (st === 'continue') return 'Sare peste restul turului și trece la turul următor al repetiției.';
  if ((m = /^(?:(\+\+|--)\s*(\w+)|(\w+)\s*(\+\+|--))$/.exec(st))) return (m[2] || m[3]) + ((m[1] || m[4]) === '++' ? ' crește cu 1.' : ' scade cu 1.');
  if ((m = /^(\w+)\s*(\+=|-=|\*=|\/=|%=)\s*(.+)$/.exec(st))) {
    const n = m[1], e = m[3];
    const says: Record<string, string> = {
      '+=': n + ' crește cu ' + e + '.',
      '-=': n + ' scade cu ' + e + '.',
      '*=': n + ' se înmulțește cu ' + e + '.',
      '/=': n + ' se împarte la ' + e + ' (rămâne câtul).',
      '%=': n + ' devine restul împărțirii lui ' + n + ' la ' + e + '.',
    };
    return says[m[2]];
  }
  if ((m = /^(\w+)\s*=(?!=)\s*(.+)$/.exec(st))) return 'Calculează ' + m[2] + ' și pune rezultatul în ' + m[1] + '. Semnul = înseamnă „primește”, nu „este egal”.';
  return 'Calculează expresia ' + st + '.';
}
function parts(s: string): string[] {
  s = s.trim(); let m: RegExpExecArray | null;
  if (!s) return [];
  if ((m = /^\}\s*while\s*(\(.*)$/.exec(s))) return ['Sfârșitul repetiției „do”. Dacă ' + cond(paren(m[1])[0]) + ', se repetă din nou de la „do”; altfel programul merge mai departe.'];
  if (s[0] === '}') return ['Aici se închide blocul deschis mai sus cu „{”. Variabilele declarate în el sunt scoase de pe stivă.'].concat(parts(s.slice(1)));
  if (s[0] === '{') return parts(s.slice(1));
  if ((m = /^(if|while|for)\s*(\(.*)$/.exec(s))) {
    const [c, rest] = paren(m[2]); let t: string;
    if (m[1] === 'if') t = 'Verifică dacă ' + cond(c) + '. Dacă da, se execută instrucțiunile care urmează; dacă nu, sunt sărite.';
    else if (m[1] === 'while') t = 'Cât timp ' + cond(c) + ', repetă instrucțiunile care urmează. Condiția se verifică înaintea fiecărui tur.';
    else {
      const f = split(c, ';');
      t = 'Repetiție cu contor. La început: ' + (simple(f[0] || '') || 'nimic.') + ' Se repetă cât timp ' + (cond(f[1] || '') || 'nu e oprită cu break') + '. După fiecare tur: ' + (simple(f[2] || '') || 'nimic.');
    }
    return [t].concat(parts(rest));
  }
  if (/^else\b/.test(s)) return ['Altfel (dacă la „if” răspunsul a fost „nu”), se execută instrucțiunile care urmează.'].concat(parts(s.slice(4)));
  if (/^do\b/.test(s)) return ['Începe o repetiție „do”: instrucțiunile se execută o dată, apoi se repetă cât timp condiția de la sfârșit este adevărată.'].concat(parts(s.slice(2)));
  const a = split(s, ';'), t = simple(a[0].replace(/\{\s*$/, ''));
  return (t ? [t] : []).concat(parts(a.slice(1).join(';')));
}

export function explain(raw: string): string[] {
  const t = raw.trim();
  if (!t) return ['Linie goală. Nu face nimic, doar aerisește programul.'];
  if (t.startsWith('//')) return ['Comentariu: o notiță pentru oameni. Calculatorul o ignoră.'];
  if (/^#\s*include/.test(t)) return ['Aduce în program uneltele de citire și afișare: cin și cout.'];
  if (t === '{') return ['Începe un bloc: un grup de instrucțiuni care merg împreună. Variabilele declarate în el se pun pe stivă și dispar la „}”.'];
  const code = strip(raw), list = parts(code), bare = code.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
  if (!list.length) list.push('Nu știu să explic linia aceasta.');
  if (bare.includes('%')) list.push('Semnul % dă restul împărțirii: 17 % 5 este 2.');
  if (bare.includes('/')) list.push('Semnul / dă câtul împărțirii întregi, fără rest: 17 / 5 este 3.');
  if (code.length < raw.trimEnd().length) list.push('Textul de după // este un comentariu, pe care calculatorul îl ignoră.');
  return list;
}
