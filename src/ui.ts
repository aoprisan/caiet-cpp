// Page wiring: intro (processor and memory), editor, highlighting, run, step-through stack view, examples, pbinfo problems.
import { compile, CppError, type RunResult, type Snapshot } from './interp.js';
import { explain } from './explain.js';
import { DEMOS, INTREBARI, memorie } from './intro.js';
import { CAPITOLE, DIFICULTATI, blocuri, matches, note, url, verifica, type Culegere, type Problema, type Rezultat } from './probleme.js';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const code = $<HTMLTextAreaElement>('code'), inp = $<HTMLTextAreaElement>('inp'), gutter = $('gutter'), outEl = $('out');
const status = $('status'), ex = $<HTMLSelectElement>('ex');

const H = '#include <iostream>\nusing namespace std;\n\nint main() {\n', F = '    return 0;\n}\n';
const EX: { name: string; inp: string; code: string }[] = [
  // The intro's programs come first, with a cout at the end so they show something.
  ...DEMOS.map(d => ({
    name: d.name, inp: '',
    code: H + d.lines.map(l => '    ' + l + '\n').join('')
      + '    cout << ' + memorie(d, d.steps.length).map(v => '"' + v[0] + ' = " << ' + v[0]).join(' << ", " << ') + ' << endl;\n' + F,
  })),
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
/** The editor holds "mine" (the free draft), an example (its index) or a problem ("p" + id, its own draft). */
const isProb = (v: string) => v[0] === 'p';
function load(v: string) {
  if (v === 'mine') { code.value = store.get('caiet.code') || H + '    \n' + F; inp.value = store.get('caiet.inp') || '' }
  else if (isProb(v)) { code.value = store.get('caiet.' + v) || H + '    \n' + F; inp.value = store.get('caiet.' + v + '.in') ?? probOf(v)?.ex[0].in ?? '' }
  else { code.value = EX[+v].code; inp.value = EX[+v].inp }
  if (v === 'mine' || isProb(v)) store.set('caiet.doc', v);
  badLine = 0; pRes.innerHTML = ''; drawGutter(); drawBar();
}
function saveMine() {
  if (isProb(ex.value)) { store.set('caiet.' + ex.value, code.value); store.set('caiet.' + ex.value + '.in', inp.value); return }
  ex.value = 'mine'; store.set('caiet.doc', 'mine'); store.set('caiet.code', code.value); store.set('caiet.inp', inp.value);
  drawBar();
}

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
inp.addEventListener('input', () => { if (ex.value === 'mine' || isProb(ex.value)) saveMine() });
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
// ---- Intro: what the processor and the memory are, a step-by-step demo of boxes and assignments, a short quiz.
const intro = $('intro'), iShow = $('iShow'), dCode = $('dCode'), dCpu = $('dCpu'), dMem = $('dMem'), dSay = $('dSay'), dNum = $('dNum');
let demo = 0, dStep = 0;
/** On a computer the intro sits above the editor until it is hidden; on a phone it is the first tab. */
function drawIntro() {
  const off = !!store.get('caiet.intro');
  intro.hidden = off && !MOBILE.matches; iShow.hidden = !off;
}
function showDemo(i: number) {
  const d = DEMOS[demo], n = d.steps.length;
  dStep = Math.max(0, Math.min(n, i));
  const s = d.steps[dStep - 1], mem = memorie(d, dStep), was = memorie(d, dStep - 1);
  dCode.innerHTML = d.lines.map((l, k) => '<div' + (s?.line === k ? ' class="cur"' : '') + '>' + paint(l) + '</div>').join('');
  dCpu.textContent = s?.cpu ?? '';
  dMem.innerHTML = '';
  // A stack: box 1 at the bottom, the last box taken (the top) drawn highest.
  for (let k = 3; k >= 0; k--) {
    const v = mem[k], box = el('div', 'dbox');
    box.append(el('small', '', 'cutia ' + (k + 1)));
    if (!v) {
      const gone = s?.free && was[k];
      box.classList.add('free'); box.append(el('span', '', gone ? 'scoasă de pe stivă (era ' + gone[0] + ')' : 'liberă'));
      if (gone) box.classList.add('w');
    } else {
      box.append(el('span', 'dname', v[0]), el('b', '', v[1] === undefined ? 'goală' : String(v[1])));
      if (k === mem.length - 1) box.append(el('em', '', '← vârf'));
      if (v[1] === undefined) box.classList.add('empty');
      if (s?.read?.includes(v[0])) box.classList.add('r');
      if (s?.decl === v[0] || s?.set?.[0] === v[0]) box.classList.add('w');
    }
    dMem.append(box);
  }
  dSay.textContent = s ? s.say : 'Memoria e goală. Apasă ▶ ca procesorul să citească prima linie.';
  dNum.textContent = 'Pasul ' + dStep + ' din ' + n;
  $<HTMLButtonElement>('dFirst').disabled = $<HTMLButtonElement>('dPrev').disabled = dStep === 0;
  $<HTMLButtonElement>('dNext').disabled = dStep === n;
  dPick.forEach((b, k) => b.setAttribute('aria-pressed', String(k === demo)));
}
const dPick = DEMOS.map((d, k) => {
  const b = el('button', 'pbtn', d.name); b.type = 'button';
  b.addEventListener('click', () => { demo = k; showDemo(0) });
  $('dPick').append(b); return b;
});
$('dFirst').addEventListener('click', () => showDemo(0));
$('dPrev').addEventListener('click', () => showDemo(dStep - 1));
$('dNext').addEventListener('click', () => showDemo(dStep + 1));
$('dOpen').addEventListener('click', () => {
  ex.value = String(demo); load(ex.value); run(); showStep(0);
  if (MOBILE.matches) tab('pasi'); else $('code').closest('.grid')!.scrollIntoView({ behavior: 'smooth' });
});
INTREBARI.forEach((q, k) => {
  const box = el('div', 'qitem'), pre = el('pre'), row = el('div', 'qopts'), why = el('p', 'qwhy');
  pre.innerHTML = paint(q.code); why.hidden = true;
  box.append(el('p', 'qask', (k + 1) + '. ' + q.ask), pre, row, why);
  q.options.forEach((o, j) => {
    const b = el('button', 'pbtn', String(o)); b.type = 'button';
    b.addEventListener('click', () => {
      row.querySelectorAll('button').forEach(x => x.classList.remove('yes', 'no'));
      b.classList.add(j === q.ok ? 'yes' : 'no');
      why.hidden = false; why.className = 'qwhy ' + (j === q.ok ? 'yes' : 'no');
      why.textContent = j === q.ok ? 'Corect! ' + q.why : 'Nu chiar. Urmărește cutiile linie cu linie și încearcă din nou.';
    });
    row.append(b);
  });
  $('quiz').append(box);
});
function closeIntro() {
  store.set('caiet.intro', 'citit'); drawIntro();
  if (MOBILE.matches) tab('cod'); else window.scrollTo({ top: 0, behavior: 'smooth' });
}
$('iHide').addEventListener('click', closeIntro);
$('iGo').addEventListener('click', closeIntro);
iShow.addEventListener('click', () => { store.set('caiet.intro', ''); drawIntro(); intro.scrollIntoView({ behavior: 'smooth' }) });
MOBILE.addEventListener('change', drawIntro);
drawIntro(); showDemo(0);
tab(store.get('caiet.intro') ? 'cod' : 'start'); fit();

// ---- Problems from pbinfo (probleme/probleme.json, built by tools/probleme.mjs): list, statement, check on the examples.
let probs: Problema[] = [], sel: Problema | undefined;
const notes = new Map<Problema, ReturnType<typeof note>>();
const probsEl = $('probs'), pUl = $('pUl'), pView = $('pView'), pRes = $('pRes'), pCount = $('pCount');
const pQ = $<HTMLInputElement>('pQ'), pSub = $<HTMLSelectElement>('pSub'), pDif = $<HTMLSelectElement>('pDif'), pOk = $<HTMLInputElement>('pOk');
const solved = new Set((store.get('caiet.rezolvate') || '').split(',').filter(Boolean).map(Number));
function probOf(v: string) { return probs.find(p => 'p' + p.id === v) }
const noteOf = (p: Problema) => { let n = notes.get(p); if (!n) notes.set(p, n = note(p)); return n };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
/** Statement text: paragraphs keep their line breaks, "- " lines become a list, [imagine: url] becomes the picture. */
function prose(parent: HTMLElement, s: string) {
  const fill = (e: HTMLElement, t: string) => t.split(/\[imagine: (https:\/\/[^\s\]]+)\]/).forEach((x, i) => {
    if (i % 2 === 0) { if (x) e.append(x); return }
    const img = el('img'), link = el('a', '', 'Vezi desenul');
    link.href = x; link.target = '_blank'; link.rel = 'noopener';
    img.src = x; img.alt = 'Desen din enunț'; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => img.replaceWith(link)); // offline, or the picture moved
    e.append(img);
  });
  for (const b of blocuri(s)) {
    if ('p' in b) { const p = el('p'); fill(p, b.p); parent.append(p) }
    else { const ul = el('ul'); for (const t of b.li) { const li = el('li'); fill(li, t); ul.append(li) } parent.append(ul) }
  }
}
function count(n: number) { return n === 0 ? 'Nicio problemă nu se potrivește.' : n === 1 ? 'O problemă' : n + (n % 100 >= 20 || n % 100 === 0 ? ' de probleme' : ' probleme') }
function list() {
  const hits = probs.filter(p => (!pSub.value || p.sub === +pSub.value) && (!pDif.value || p.dif === +pDif.value) && (!pOk.checked || !noteOf(p).stop) && matches(p, pQ.value));
  pCount.textContent = count(hits.length);
  pUl.innerHTML = '';
  for (const p of hits) {
    const li = el('li'), b = el('button'), name = el('b', '', p.nume);
    b.type = 'button'; b.dataset.id = String(p.id); if (p === sel) b.className = 'on';
    if (noteOf(p).stop) b.classList.add('stop');
    const meta = el('small', '', DIFICULTATI[p.dif] + ' · ' + CAPITOLE[p.sub].toLowerCase());
    const left = el('span'); left.append(name, meta);
    b.append(left);
    if (solved.has(p.id)) { const ok = el('span', 'ok', '✓'); ok.title = 'Rezolvată'; b.append(ok) }
    b.addEventListener('click', () => show(p, true));
    li.append(b); pUl.append(li);
  }
}
/** Shows a problem's statement; `open` also brings it up on a phone (instead of the list). */
function show(p: Problema, open: boolean) {
  sel = p; store.set('caiet.psel', String(p.id));
  pView.innerHTML = '';
  const back = el('button', 'mob pback', '← Înapoi la listă'); back.type = 'button';
  back.addEventListener('click', () => { probsEl.classList.remove('open'); pUl.querySelector<HTMLElement>('.on')?.focus() });
  const h = el('h3', '', p.nume), meta = el('p', 'pmeta', CAPITOLE[p.sub] + ' · dificultate ' + DIFICULTATI[p.dif] + ' · ');
  const a = el('a', '', 'problema #' + p.id + ' pe pbinfo.ro'); a.href = url(p); a.target = '_blank'; a.rel = 'noopener';
  meta.append(a); pView.append(back, h, meta);
  const n = noteOf(p);
  for (const t of n.text) pView.append(el('p', n.stop && t === n.text[0] ? 'pwarn stop' : 'pwarn', t));
  const go = el('button', 'run', ex.value === 'p' + p.id ? '✎ Continuă în caiet' : '✎ Rezolvă în caiet'); go.type = 'button';
  go.addEventListener('click', () => start(p));
  pView.append(go);
  const part = (title: string, s: string) => { if (!s) return; pView.append(el('h4', '', title)); prose(pView, s) };
  for (const [t, s] of p.sect || []) if (!t) prose(pView, s);
  part('Cerința', p.cerinta); part('Date de intrare', p.intrare); part('Date de ieșire', p.iesire); part('Restricții și precizări', p.restrictii);
  p.ex.forEach((e, i) => {
    pView.append(el('h4', '', p.ex.length > 1 ? 'Exemplul ' + (i + 1) : 'Exemplu'));
    const box = el('div', 'pex'), use = el('button', 'pbtn', 'Pune în „Date de intrare”');
    for (const [t, v] of [['Intrare', e.in], ['Ieșire', e.out]]) { const d = el('div'); d.append(el('small', '', t), el('pre', '', v)); box.append(d) }
    if (e.ex) { const d = el('div', 'pexp'); prose(d, e.ex); box.append(d) }
    use.type = 'button';
    use.addEventListener('click', () => { if (ex.value !== 'p' + p.id) start(p); inp.value = e.in; saveMine(); run(); if (MOBILE.matches) tab('rulare') });
    box.append(use); pView.append(box);
  });
  for (const [t, s] of p.sect || []) if (t) part(t, s);
  const who = [p.autor && 'Autor: ' + p.autor, p.sursa && 'Sursa: ' + p.sursa].filter(Boolean).join(' · ');
  if (who) pView.append(el('p', 'pfoot', who));
  pView.scrollTop = 0;
  if (open) probsEl.classList.add('open');
  pUl.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.id === String(p.id)));
}
/** Opens a problem in the editor (with its own saved draft) and goes to the editor. */
function start(p: Problema) {
  const v = 'p' + p.id;
  probOption(v, p.nume); ex.value = v; load(v); run();
  if (sel === p) show(p, probsEl.classList.contains('open'));
  if (MOBILE.matches) tab('cod');
  else { document.querySelector('.grid')!.scrollIntoView({ behavior: 'smooth' }); code.focus({ preventScroll: true }) }
}
/** The problem being solved gets its own entry in the menu, right after "Programul meu". */
function probOption(v: string, name: string) {
  [...ex.options].filter(o => isProb(o.value) && o.value !== v).forEach(o => o.remove());
  if (![...ex.options].some(o => o.value === v)) ex.add(new Option('Problema: ' + name, v), 1);
  store.set('caiet.docName', name);
}
function drawBar() {
  const v = ex.value, on = isProb(v), p = probOf(v);
  $('pBar').hidden = !on;
  if (!on) return;
  $('pName').textContent = p ? p.nume : (ex.selectedOptions[0]?.text || '').replace('Problema: ', '');
  $<HTMLButtonElement>('pCheck').disabled = $<HTMLButtonElement>('pShow').disabled = !p;
}
function check() {
  const p = probOf(ex.value);
  if (!p) return;
  pRes.innerHTML = '';
  run(); // so the output and the stack match the program being checked
  let rs: Rezultat[];
  try { rs = verifica(code.value, p) } catch (e) {
    if (!(e instanceof CppError)) throw e;
    pRes.append(el('li', 'bad', 'Programul are o greșeală la linia ' + e.line + '. Repar-o, apoi verifică din nou.'));
    return;
  }
  rs.forEach((r, i) => {
    const name = rs.length > 1 ? 'Exemplul ' + (i + 1) : 'Exemplul', li = el('li', r.ok ? '' : 'bad', (r.ok ? '✔ ' : '✘ ') + name + (r.ok ? ': corect' : ''));
    if (!r.ok) {
      if (r.err) li.append(el('small', '', (r.err.kind === 'run' ? 'Eroare la rulare, linia ' : 'Linia ') + r.err.line + ': ' + r.err.message));
      const cmp = el('div', 'cmp'), want = el('div'), got = el('div');
      want.append(el('small', '', 'Trebuia să afișeze'), el('pre', '', r.want));
      got.append(el('small', '', 'Programul a afișat'), el('pre', r.out.trim() ? '' : 'q', r.out.trim() ? r.out : '(nimic)'));
      cmp.append(want, got); li.append(cmp);
      const b = el('button', 'pbtn', 'Rulează-l pas cu pas'); b.type = 'button';
      b.addEventListener('click', () => { inp.value = p.ex[i].in; saveMine(); run(); tab(MOBILE.matches ? 'pasi' : 'cod'); showStep(0) });
      li.append(b);
    }
    pRes.append(li);
  });
  if (rs.every(r => r.ok)) {
    solved.add(p.id); store.set('caiet.rezolvate', [...solved].join(','));
    const li = el('li', 'win', 'Bravo! Toate exemplele sunt corecte. Pe pbinfo.ro problema are și alte teste: ');
    const a = el('a', '', 'trimite-o acolo'); a.href = url(p); a.target = '_blank'; a.rel = 'noopener';
    li.append(a, '.'); pRes.append(li); list();
  }
}
$('pCheck').addEventListener('click', check);
$('pShow').addEventListener('click', () => {
  const p = probOf(ex.value); if (!p) return;
  show(p, true);
  if (MOBILE.matches) tab('probleme'); else probsEl.scrollIntoView({ behavior: 'smooth' });
});
for (const e of [pQ, pSub, pDif, pOk]) e.addEventListener('input', list);
CAPITOLE.forEach((c, i) => pSub.add(new Option(c, String(i))));
DIFICULTATI.forEach((d, i) => pDif.add(new Option(d[0].toUpperCase() + d.slice(1), String(i))));

const doc = store.get('caiet.doc') || '', docName = store.get('caiet.docName');
if (isProb(doc) && docName) probOption(doc, docName);
ex.value = isProb(doc) && docName ? doc : store.get('caiet.code') ? 'mine' : '0';
load(ex.value); run();

pCount.textContent = 'Se încarcă problemele…';
fetch('probleme/probleme.json').then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<Culegere> }).then(d => {
  probs = d.probleme;
  const s = probs.find(p => p.id === +(store.get('caiet.psel') || 0));
  list();
  if (s) show(s, false);
  drawBar();
}).catch(() => { pCount.textContent = 'Problemele nu s-au putut încărca. Verifică legătura la internet și reîncarcă pagina.' });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* offline mode unavailable */ });
