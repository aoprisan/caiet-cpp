// Page wiring: editor, highlighting, run, step-through stack view, examples.
import { compile, CppError, type RunResult, type Snapshot } from './interp.js';
import { explain } from './explain.js';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const code = $<HTMLTextAreaElement>('code'), inp = $<HTMLTextAreaElement>('inp'), gutter = $('gutter'), outEl = $('out');
const status = $('status'), ex = $<HTMLSelectElement>('ex');

const H = '#include <iostream>\nusing namespace std;\n\nint main() {\n', F = '    return 0;\n}\n';
const EX: { name: string; inp: string; code: string }[] = [
  { name: 'Suma a două numere', inp: '12 30', code: H + '    int a, b;\n    cin >> a >> b;\n    cout << "Suma este " << a + b << endl;\n' + F },
  { name: 'Maximul dintre trei numere', inp: '7 19 4', code: H + '    int a, b, c, maxim;\n    cin >> a >> b >> c;\n    maxim = a;\n    if (b > maxim) {\n        maxim = b;\n    }\n    if (c > maxim) {\n        maxim = c;\n    }\n    cout << "Cel mai mare: " << maxim << endl;\n' + F },
  { name: 'Suma cifrelor', inp: '2026', code: H + '    int n, suma = 0;\n    cin >> n;\n    while (n > 0) {\n        suma = suma + n % 10;   // ultima cifră\n        n = n / 10;             // tăiem ultima cifră\n    }\n    cout << suma << endl;\n' + F },
  { name: 'Este număr prim?', inp: '97', code: H + '    int n, divizori = 0;\n    cin >> n;\n    for (int d = 1; d <= n; d++) {\n        if (n % d == 0) {\n            divizori++;\n        }\n    }\n    if (divizori == 2) {\n        cout << n << " este prim" << endl;\n    } else {\n        cout << n << " nu este prim" << endl;\n    }\n' + F },
  { name: 'Cel mai mare divizor comun', inp: '84 36', code: H + '    int a, b, r;\n    cin >> a >> b;\n    while (b != 0) {\n        r = a % b;\n        a = b;\n        b = r;\n    }\n    cout << "cmmdc = " << a << endl;\n' + F },
  { name: 'Tabla înmulțirii', inp: '7', code: H + '    int n;\n    cin >> n;\n    for (int i = 1; i <= 10; i++) {\n        cout << n << " x " << i << " = " << n * i << endl;\n    }\n' + F },
];
const store = {
  get(k: string): string | null { try { return localStorage.getItem(k) } catch { return null } },
  set(k: string, v: string) { try { localStorage.setItem(k, v) } catch { /* storage unavailable */ } },
};

ex.add(new Option('Programul meu', 'mine'));
EX.forEach((e, i) => ex.add(new Option('Exemplu: ' + e.name, String(i))));

const hl = $('hl'), band = $('band'), layer = $('layer'), range = $<HTMLInputElement>('sRange'), sLabel = $('sLabel'), stackEl = $('stack');
let badLine = 0, curLine = 0, lines = 0, steps: Snapshot[] = [], cur = 0, fullOut = '', lastErr: CppError | null = null, cut = false;

const RE = /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|(?![\s\S])))|("(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)|(^[ \t]*#[^\n]*)|(\b\d+\b)|(\b(?:int|if|else|while|for|do|return|break|continue|using|namespace)\b)|(\b(?:cin|cout|endl|std|main)\b)/gm;
const CLS = ['com', 'str', 'pre', 'num', 'kw', 'io'];
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
function paint(src: string): string {
  let h = '', last = 0, m: RegExpExecArray | null;
  RE.lastIndex = 0;
  while ((m = RE.exec(src))) {
    if (!m[0]) { RE.lastIndex++; continue }
    h += esc(src.slice(last, m.index));
    const k = CLS[m.slice(1).findIndex(x => x !== undefined)];
    h += '<span class="' + k + '">' + esc(m[0]) + '</span>';
    last = m.index + m[0].length;
  }
  return h + esc(src.slice(last));
}
// The 24 (line height) and 12 (padding) below must match css/style.css.
function sync() {
  gutter.scrollTop = code.scrollTop;
  layer.style.transform = 'translate(' + (-code.scrollLeft) + 'px,' + (-code.scrollTop) + 'px)';
}
function reveal(line: number) {
  const y = (line - 1) * 24;
  if (y < code.scrollTop || y > code.scrollTop + code.clientHeight - 48) code.scrollTop = Math.max(0, y - 96);
}
function drawGutter() {
  const n = code.value.split('\n').length;
  if (n !== lines) { lines = n; let h = ''; for (let i = 1; i <= n; i++) h += '<div>' + i + '</div>'; gutter.innerHTML = h }
  [...gutter.children].forEach((d, i) => { d.classList.toggle('bad', i + 1 === badLine); d.classList.toggle('cur', i + 1 === curLine) });
  hl.innerHTML = paint(code.value) + '\n';
  band.hidden = !curLine; band.style.top = (12 + (curLine - 1) * 24) + 'px';
  sync(); drawExplain();
}
function drawExplain() {
  const ln = curLine || code.value.slice(0, code.selectionStart).split('\n').length, ul = $('exL');
  $('exT').textContent = 'Ce înseamnă linia ' + ln; ul.innerHTML = '';
  for (const t of explain(code.value.split('\n')[ln - 1] || '')) { const li = document.createElement('li'); li.textContent = t; ul.append(li) }
}
code.addEventListener('keyup', drawExplain);
code.addEventListener('click', drawExplain);

/** A variable cell: name, value, is it global, index in the snapshot (to diff against the previous step). */
type Cell = [name: string, value: number | undefined, global: boolean, idx: number];
function frame(title: string, vars: Cell[], prev: Snapshot | undefined, from: boolean): HTMLElement {
  const f = document.createElement('div'); f.className = 'frame';
  const h = document.createElement('h3'); h.textContent = title; f.append(h);
  if (!vars.length) { const p = document.createElement('p'); p.className = 'none'; p.textContent = 'Nicio variabilă încă.'; f.append(p) }
  for (let i = vars.length - 1; i >= 0; i--) {
    const [name, val, , idx] = vars[i], c = document.createElement('div'); c.className = 'cell';
    const b = document.createElement('b'); b.textContent = name;
    const v = document.createElement('span'); v.textContent = val === undefined ? '?' : String(val);
    if (val === undefined) v.className = 'q';
    const o = prev && prev.vars[idx];
    if (from && (!o || o[0] !== name || o[1] !== val)) c.classList.add('chg');
    c.append(b, v); f.append(c);
  }
  return f;
}
function showStep(i: number) {
  const n = steps.length; cur = Math.max(0, Math.min(i, n - 1));
  const s = steps[cur] as Snapshot | undefined, last = cur >= n - 1, prev = steps[cur - 1] as Snapshot | undefined;
  const text = !s || last ? fullOut : fullOut.slice(0, s.out);
  outEl.classList.toggle('empty', !text);
  outEl.textContent = text || (lastErr || !last ? '' : 'Programul nu a afișat nimic.');
  curLine = !s || last ? 0 : s.line;
  range.max = String(Math.max(0, n - 1)); range.value = String(cur); range.disabled = n < 2;
  $<HTMLButtonElement>('sFirst').disabled = $<HTMLButtonElement>('sPrev').disabled = cur <= 0;
  $<HTMLButtonElement>('sNext').disabled = $<HTMLButtonElement>('sLast').disabled = last;
  sLabel.textContent = (!s ? 'Repară greșeala și rulează din nou ca să vezi variabilele.'
    : last ? (lastErr ? 'Oprit la linia ' + lastErr.line + '.' : 'Program terminat.') + ' Apasă |◀ ca să îl urmărești pas cu pas.'
      : 'Pasul ' + (cur + 1) + ' din ' + (n - 1) + ': urmează linia ' + s.line + '.')
    + (cut ? ' Programul are mulți pași, se pot urmări doar primii 2000.' : '');
  stackEl.innerHTML = '';
  if (s) {
    const all: Cell[] = s.vars.map((v, k) => [v[0], v[1], v[2], k]);
    stackEl.append(frame('main()', all.filter(v => !v[2]), prev, cur > 0));
    const g = all.filter(v => v[2]);
    if (g.length) stackEl.append(frame('variabile globale', g, prev, cur > 0));
  }
  if (curLine) reveal(curLine);
  drawGutter();
}
function load(v: string) {
  if (v === 'mine') { code.value = store.get('caiet.code') || H + '    \n' + F; inp.value = store.get('caiet.inp') || '' }
  else { code.value = EX[+v].code; inp.value = EX[+v].inp }
  badLine = 0; drawGutter();
}
function saveMine() { ex.value = 'mine'; store.set('caiet.code', code.value); store.set('caiet.inp', inp.value) }

function run() {
  let r: Pick<RunResult, 'out' | 'trace' | 'cut'> & { end?: Snapshot }, err: CppError | null = null;
  try { r = compile(code.value).run(inp.value) }
  catch (e) {
    if (!(e instanceof CppError)) throw e;
    err = e; r = { out: e.out || '', trace: e.trace || [], end: e.end, cut: !!e.cut };
  }
  lastErr = err; fullOut = r.out; steps = r.trace.slice(); if (r.end) steps.push(r.end); cut = r.cut;
  status.hidden = false; status.className = err ? 'err' : 'ok';
  if (err) {
    status.innerHTML = '';
    status.append((err.kind === 'run' ? 'Eroare la rulare, linia ' : 'Greșeală în program, linia ') + err.line);
    const s = document.createElement('small'); s.textContent = err.message; status.append(s);
    badLine = err.line; reveal(err.line);
  } else { status.textContent = 'Program terminat cu succes.'; badLine = 0 }
  showStep(steps.length - 1);
}
$('sFirst').addEventListener('click', () => showStep(0));
$('sPrev').addEventListener('click', () => showStep(cur - 1));
$('sNext').addEventListener('click', () => showStep(cur + 1));
$('sLast').addEventListener('click', () => showStep(steps.length - 1));
range.addEventListener('input', () => showStep(+range.value));

function insert(text: string) {
  code.focus();
  let ok = false;
  // execCommand keeps the browser's undo history; fall back to setRangeText where it is missing.
  try { ok = document.execCommand('insertText', false, text) } catch { /* unsupported */ }
  if (!ok) { code.setRangeText(text, code.selectionStart, code.selectionEnd, 'end'); code.dispatchEvent(new Event('input')) }
}
code.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); return }
  if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); insert('    '); return }
  if (e.key === 'Enter') {
    const before = code.value.slice(0, code.selectionStart), ln = before.slice(before.lastIndexOf('\n') + 1);
    let ind = /^[ \t]*/.exec(ln)![0];
    if (/\{\s*$/.test(ln)) ind += '    ';
    e.preventDefault(); insert('\n' + ind);
  }
});
inp.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run() } });
code.addEventListener('input', () => { badLine = 0; curLine = 0; drawGutter(); saveMine() });
inp.addEventListener('input', () => { if (ex.value === 'mine') saveMine() });
code.addEventListener('scroll', sync);
ex.addEventListener('change', () => { load(ex.value); run() });
$('run').addEventListener('click', run);

ex.value = store.get('caiet.code') ? 'mine' : '0';
load(ex.value); run();
