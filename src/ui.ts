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

const keys = $('keys'), follow = $('follow'), sCode = $('sCode');
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
  tabBtn('cod')?.classList.toggle('bad', !!badLine);
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
// Phones move the caret by long-press and drag, which fires neither keyup nor click.
document.addEventListener('selectionchange', () => { if (document.activeElement === code && !curLine) drawExplain() });

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
  sCode.hidden = !curLine;
  sCode.innerHTML = curLine ? '<span class="ln">' + curLine + '</span>' + paint(code.value.split('\n')[curLine - 1].trim()) : '';
  follow.hidden = n < 2;
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
    const b = document.createElement('button'); b.type = 'button'; b.className = 'goto'; b.textContent = 'Arată linia ' + err.line;
    const line = err.line; b.addEventListener('click', () => goLine(line)); status.append(b);
    badLine = err.line; reveal(err.line);
  } else { status.textContent = 'Program terminat cu succes.'; badLine = 0 }
  showStep(steps.length - 1);
}
$('sFirst').addEventListener('click', () => showStep(0));
$('sPrev').addEventListener('click', () => showStep(cur - 1));
$('sNext').addEventListener('click', () => showStep(cur + 1));
$('sLast').addEventListener('click', () => showStep(steps.length - 1));
range.addEventListener('input', () => showStep(+range.value));

/** Puts the caret at the start of a line and scrolls it into view (from the error message). */
function goLine(line: number) {
  tab('cod');
  const at = code.value.split('\n').slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
  if (!MOBILE.matches) code.focus(); // on a phone focusing would pop up the keyboard over the line
  code.setSelectionRange(at, at); reveal(line); sync(); drawExplain();
}

function insert(text: string) {
  code.focus();
  let ok = false;
  // execCommand keeps the browser's undo history; fall back to setRangeText where it is missing.
  try { ok = document.execCommand('insertText', false, text) } catch { /* unsupported */ }
  if (!ok) { code.setRangeText(text, code.selectionStart, code.selectionEnd, 'end'); code.dispatchEvent(new Event('input')) }
}
/** Inserts a snippet: each \n keeps the current line's indent, | marks where the caret ends up. */
function snippet(s: string) {
  const before = code.value.slice(0, code.selectionStart), ind = /^[ \t]*/.exec(before.slice(before.lastIndexOf('\n') + 1))![0];
  const t = s.replace(/\n/g, '\n' + ind), k = t.indexOf('|'), text = t.replace('|', '');
  insert(text);
  if (k >= 0) { const p = code.selectionStart - (text.length - k); code.setSelectionRange(p, p) }
}
/** Types }, first taking one indent level off a line that is still blank. */
function closeBrace() {
  const at = code.selectionStart, before = code.value.slice(0, at), ln = before.slice(before.lastIndexOf('\n') + 1);
  if (at === code.selectionEnd && /^[ \t]*    $/.test(ln)) code.setSelectionRange(at - 4, at);
  insert('}');
}
code.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); return }
  if (e.key === '}' && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); closeBrace(); return }
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
$('run').addEventListener('click', () => { run(); if (MOBILE.matches) tab('rulare') });

// ---- Phone view: tabs, keyboard-aware height, key row. Keep MOBILE in sync with the media query in css/style.css.
const MOBILE = matchMedia('(max-width:760px), (pointer:coarse) and (max-height:500px)');
const panes = [...document.querySelectorAll<HTMLElement>('[data-pane]')], tabs = [...document.querySelectorAll<HTMLButtonElement>('#tabs button')];
function tabBtn(name: string) { return tabs.find(b => b.dataset.tab === name) }
function tab(name: string) {
  panes.forEach(p => p.classList.toggle('on', p.dataset.pane === name));
  tabs.forEach(b => b.setAttribute('aria-current', String(b.dataset.tab === name)));
  // A pane that was hidden lost its scroll position; bring the interesting line back.
  if (name === 'cod' && (curLine || badLine)) { reveal(curLine || badLine); sync() }
}
tabs.forEach(b => b.addEventListener('click', () => tab(b.dataset.tab!)));
follow.addEventListener('click', () => { tab('pasi'); showStep(0) });

// The page is sized to the visible part of the screen, so the editor ends right above the keyboard.
const vv = window.visualViewport, root = document.documentElement.style;
let tallest = 0, wide = 0;
function fit() {
  const focused = document.activeElement === code;
  document.body.classList.toggle('editing', focused);
  if (!vv) return;
  if (Math.abs(vv.scale - 1) > 0.01) { root.removeProperty('--app-h'); root.removeProperty('--app-top'); return } // pinch-zoomed
  if (vv.width !== wide) { wide = vv.width; tallest = 0 } // rotated: measure again
  tallest = Math.max(tallest, vv.height);
  root.setProperty('--app-h', vv.height + 'px'); root.setProperty('--app-top', vv.offsetTop + 'px');
  document.body.classList.toggle('kb', focused && vv.height < tallest - 120);
}
vv?.addEventListener('resize', fit);
vv?.addEventListener('scroll', fit);
code.addEventListener('focus', fit);
code.addEventListener('blur', fit);

/** Keys that are hard to reach on a phone keyboard. t is typed as a snippet; a is an action. */
const KEYS: { l: string; t?: string; a?: () => void; c?: string; title?: string }[] = [
  { l: '←', c: 'a', title: 'Cursorul la stânga', a: () => { const p = Math.max(0, code.selectionStart - 1); code.setSelectionRange(p, p) } },
  { l: '→', c: 'a', title: 'Cursorul la dreapta', a: () => { const p = code.selectionEnd + 1; code.setSelectionRange(p, p) } },
  { l: '⇥', t: '    ', c: 'a', title: 'Mută linia mai la dreapta' },
  { l: ';', t: ';' }, { l: '{', t: '{' }, { l: '}', a: closeBrace }, { l: '(', t: '(' }, { l: ')', t: ')' },
  { l: '<<', t: ' << ' }, { l: '>>', t: ' >> ' }, { l: '"', t: '"|"' },
  { l: '=', t: '=' }, { l: '==', t: ' == ' }, { l: '!=', t: ' != ' }, { l: '<', t: '<' }, { l: '>', t: '>' },
  { l: '+', t: '+' }, { l: '-', t: '-' }, { l: '*', t: '*' }, { l: '/', t: '/' }, { l: '%', t: '%' },
  { l: '&&', t: ' && ' }, { l: '||', t: ' || ' }, { l: '!', t: '!' },
  { l: 'int', t: 'int |;', c: 'w' }, { l: 'cin', t: 'cin >> |;', c: 'w' }, { l: 'cout', t: 'cout << | << endl;', c: 'w' },
  { l: 'endl', t: 'endl', c: 'w' }, { l: 'if', t: 'if (|) {\n    \n}', c: 'w' }, { l: 'else', t: ' else {\n    |\n}', c: 'w' },
  { l: 'for', t: 'for (int i = 1; i <= |; i++) {\n    \n}', c: 'w' }, { l: 'while', t: 'while (|) {\n    \n}', c: 'w' },
  { l: '↶', c: 'a', title: 'Anulează', a: () => { code.focus(); document.execCommand('undo') } },
];
for (const k of KEYS) {
  const b = document.createElement('button');
  b.type = 'button'; b.tabIndex = -1; b.textContent = k.l;
  if (k.c) b.className = k.c;
  if (k.title) { b.title = k.title; b.setAttribute('aria-label', k.title) }
  // Keep the focus (and the keyboard) in the editor.
  b.addEventListener('pointerdown', e => e.preventDefault());
  b.addEventListener('mousedown', e => e.preventDefault());
  b.addEventListener('click', () => { if (k.a) { code.focus(); k.a() } else snippet(k.t!); drawExplain() });
  keys.append(b);
}
tab('cod'); fit();

ex.value = store.get('caiet.code') ? 'mine' : '0';
load(ex.value); run();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* offline mode unavailable */ });
