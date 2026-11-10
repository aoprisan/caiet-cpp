// Page wiring: section menu, intro (processor and memory), editor, highlighting, run, step-through stack view,
// machine view (CPU, memory, buses), examples, pbinfo problems (with the statement beside the editor while solving one).
import { compile, CppError, type HeapView, type RunResult, type Snapshot, type Val, type VarView } from './interp.js';
import { explain } from './explain.js';
import { DEMOS, INTREBARI, memorie } from './intro.js';
import { MASINI, masina, type Cadru, type Masina } from './masina.js';
import { schimbare, spune, type Schimbare } from './stiva.js';
import { LECTII, html } from './lectii.js';
import { CAPITOLE, DIFICULTATI, blocuri, matches, note, pentruPbinfo, url, verifica, type Culegere, type Problema, type Rezultat } from './probleme.js';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const code = $<HTMLTextAreaElement>('code'), inp = $<HTMLTextAreaElement>('inp'), gutter = $('gutter'), outEl = $('out');
const status = $('status'), ex = $<HTMLSelectElement>('ex');

const H = '#include <iostream>\nusing namespace std;\n\nint main() {\n', F = '    return 0;\n}\n';
const EX: { name: string; inp: string; code: string }[] = [
  // The intro's programs come first, with a cout at the end so they show something.
  ...DEMOS.map(d => ({
    name: d.name, inp: '',
    code: H + d.lines.map(l => '    ' + l + '\n').join('')
      // A pointer prints the number it points to (*p), not its address.
      + '    cout << ' + memorie(d, d.steps.length).map(v => (typeof v[1] === 'string' ? '"*' + v[0] + ' = " << *' : '"' + v[0] + ' = " << ') + v[0]).join(' << ", " << ') + ' << endl;\n' + F,
  })),
  { name: 'Suma a două numere', inp: '12 30', code: H + '    int a, b;\n    cin >> a >> b;\n    cout << "Suma este " << a + b << endl;\n' + F },
  { name: 'Maximul dintre trei numere', inp: '7 19 4', code: H + '    int a, b, c, maxim;\n    cin >> a >> b >> c;\n    maxim = a;\n    if (b > maxim) {\n        maxim = b;\n    }\n    if (c > maxim) {\n        maxim = c;\n    }\n    cout << "Cel mai mare: " << maxim << endl;\n' + F },
  { name: 'Suma cifrelor', inp: '2026', code: H + '    int n, suma = 0;\n    cin >> n;\n    while (n > 0) {\n        suma = suma + n % 10;   // ultima cifră\n        n = n / 10;             // tăiem ultima cifră\n    }\n    cout << suma << endl;\n' + F },
  { name: 'Este număr prim?', inp: '97', code: H + '    int n, divizori = 0;\n    cin >> n;\n    for (int d = 1; d <= n; d++) {\n        if (n % d == 0) {\n            divizori++;\n        }\n    }\n    if (divizori == 2) {\n        cout << n << " este prim" << endl;\n    } else {\n        cout << n << " nu este prim" << endl;\n    }\n' + F },
  { name: 'Cel mai mare divizor comun', inp: '84 36', code: H + '    int a, b, r;\n    cin >> a >> b;\n    while (b != 0) {\n        r = a % b;\n        a = b;\n        b = r;\n    }\n    cout << "cmmdc = " << a << endl;\n' + F },
  { name: 'O funcție: este prim?', inp: '97', code: '#include <iostream>\nusing namespace std;\n\nint prim(int n) {\n    if (n < 2) {\n        return 0;\n    }\n    for (int d = 2; d * d <= n; d++) {\n        if (n % d == 0) {\n            return 0;\n        }\n    }\n    return 1;\n}\n\nint main() {\n    int n;\n    cin >> n;\n    if (prim(n)) {\n        cout << n << " este prim" << endl;\n    } else {\n        cout << n << " nu este prim" << endl;\n    }\n' + F },
  { name: 'Factorial cu long long', inp: '20', code: '#include <iostream>\nusing namespace std;\n\nlong long factorial(int n) {\n    if (n <= 1) {\n        return 1;\n    }\n    return n * factorial(n - 1);   // funcția se apelează pe ea însăși\n}\n\nint main() {\n    int n;\n    cin >> n;\n    cout << n << "! = " << factorial(n) << endl;\n' + F },
  { name: 'Stiva și heap-ul', inp: '5', code: H + '    int n;\n    cin >> n;\n    int *p = new int(0);   // o cutie din heap, cu 0 în ea\n    for (int i = 1; i <= n; i++) {\n        int patrat = i * i;   // pleacă de pe stivă la }\n        *p = *p + patrat;\n    }\n    cout << "Suma pătratelor: " << *p << endl;\n    cout << "Cutia din heap e la adresa " << p << endl;\n    delete p;   // eliberăm cutia din heap\n' + F },
  // The programs of the memory lessons, so „Schimbă-l în caiet” can open them like any example.
  ...LECTII.flatMap(l => l.programe.map(q => ({ name: l.titlu + ': ' + q.name, inp: q.inp, code: q.code }))),
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

const RE = /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|(?![\s\S])))|("(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)|(^[ \t]*#[^\n]*)|(\b\d+\b)|(\b(?:int|long|void|if|else|while|for|do|return|break|continue|using|namespace|nullptr|new|delete)\b)|(\b(?:cin|cout|endl|std|main)\b)/gm;
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

/** A variable cell: name, value, is it global, index in the snapshot (to diff against the previous step), what a pointer points to,
 * the function call it belongs to, its address. */
type Cell = [name: string, value: Val | undefined, global: boolean, idx: number, to: string | undefined, call: number | undefined, adr: string | undefined];
/** One frame of the stack. With the memory animations on (`d`), the boxes taken at this step slide in on top and the
 * boxes freed (`gone`, drawn above the others since they were on top) fade away. */
function frame(title: string, vars: Cell[], prev: Snapshot | undefined, from: boolean, d?: Schimbare, gone: VarView[] = []): HTMLElement {
  const f = document.createElement('div'); f.className = 'frame';
  const h = document.createElement('h3'); h.textContent = title; f.append(h);
  if (!vars.length && !gone.length) { const p = document.createElement('p'); p.className = 'none'; p.textContent = 'Nicio variabilă încă.'; f.append(p) }
  const box = (name: string, val: Val | undefined, to: string | undefined, adr: string | undefined) => {
    const c = document.createElement('div'); c.className = 'cell';
    const b = document.createElement('b'); b.textContent = name;
    const v = document.createElement('span'); v.textContent = to ? (to === 'nullptr' ? to : '→ ' + to) : val === undefined ? '?' : String(val);
    if (val === undefined) v.className = 'q';
    c.append(b);
    if (adr) c.append(el('small', 'adr', adr));
    c.append(v); return c;
  };
  for (let i = gone.length - 1; i >= 0; i--) {
    const [name, val, , to, , adr] = gone[i], c = box(name, val, to, adr);
    c.classList.add('plec'); c.lastElementChild!.before(el('small', 'tag', 'eliberată'));
    c.addEventListener('animationend', () => c.remove());
    f.append(c);
  }
  for (let i = vars.length - 1; i >= 0; i--) {
    const [name, val, , idx, to, , adr] = vars[i], c = box(name, val, to, adr);
    const o = prev && prev.vars[idx];
    if (d && idx >= d.kept) { c.classList.add('nou'); c.lastElementChild!.before(el('small', 'tag', 'nouă')) }
    else if (from && (!o || o[0] !== name || o[1] !== val)) c.classList.add('chg');
    f.append(c);
  }
  return f;
}
/** Draws the memory at step `s` into `into`: the stack (one frame per function call, the one running now on top) and the
 * heap, side by side. With `d` (what changed since `prev`), the boxes taken slide in and the freed ones fade away;
 * `from` marks the values changed since `prev`. Used by the caiet and the memory lessons. */
function drawMem(into: HTMLElement, s: Snapshot, prev: Snapshot | undefined, d: Schimbare | undefined, from: boolean) {
  const stCol = el('div', 'mcol'), hpCol = el('div', 'mcol hp');
  stCol.append(el('h4', '', 'Stiva'));
  hpCol.append(el('h4', '', 'Heap'), el('small', 'mnote', 'cutiile luate cu new, până la delete'));
  const all: Cell[] = s.vars.map((v, k) => [v[0], v[1], v[2], k, v[3], v[4], v[5]]);
  const inCall = (v: VarView) => !v[2] && (v[4] ?? 0) >= (d?.same ?? 0);
  // Function calls that just ended: their frame, all boxes freed, fades away above the others.
  if (d) for (let k = (prev!.calls.length || 1) - 1; k >= d.same; k--) {
    const f = frame((prev!.calls[k] || 'main') + '()', [], prev, false, d, d.freed.filter(v => inCall(v) && (v[4] ?? 0) === k));
    f.classList.add('plec'); f.addEventListener('animationend', e => { if (e.target === f) f.remove() });
    stCol.append(f);
  }
  const calls = s.calls.length ? s.calls : ['main'];
  for (let k = calls.length - 1; k >= 0; k--) {
    const f = frame(calls[k] + '()', all.filter(v => !v[2] && (v[5] ?? 0) === k), prev, from, d, d?.freed.filter(v => !inCall(v) && !v[2] && (v[4] ?? 0) === k));
    if (d?.started.includes(k)) f.classList.add('nou');
    stCol.append(f);
  }
  const g = all.filter(v => v[2]), gg = d?.freed.filter(v => v[2]) ?? [];
  if (g.length || gg.length) stCol.append(frame('variabile globale', g, prev, from, d, gg));
  // The heap: boxes without a name, reached only through a pointer; they stay until delete, whatever `}` comes.
  const hp = el('div', 'frame heap'), fresh = new Set(d?.heapTaken.map(h => h[0]));
  const hbox = ([name, val, adr]: HeapView, cls: string, tag?: string) => {
    const c = el('div', ('cell ' + cls).trim()), v = el('span', val === undefined ? 'q' : '', val === undefined ? '?' : String(val));
    c.append(el('b', '', name), el('small', 'adr', adr));
    if (tag) c.append(el('small', 'tag', tag));
    c.append(v); return c;
  };
  for (const h of d?.heapFreed ?? []) {
    const c = hbox(h, 'plec', 'eliberată'); c.addEventListener('animationend', () => c.remove()); hp.append(c);
  }
  for (const h of s.heap) {
    const o = prev?.heap.find(x => x[0] === h[0]);
    hp.append(hbox(h, fresh.has(h[0]) ? 'nou' : from && (!o || o[1] !== h[1]) ? 'chg' : '', fresh.has(h[0]) ? 'nouă' : undefined));
  }
  if (!hp.children.length) hp.append(el('p', 'none', 'Nicio cutie în heap.'));
  hpCol.append(hp);
  into.append(stCol, hpCol);
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
    : last ? (lastErr ? 'Oprit la linia ' + lastErr.line + '.' : 'Program terminat.')
      + (!lastErr && s.heap.length ? ' Atenție: în heap au rămas cutii fără delete.' : '') + ' Apasă |◀ ca să îl urmărești pas cu pas.'
      : 'Pasul ' + (cur + 1) + ' din ' + (n - 1) + ': urmează linia ' + s.line + '.')
    + (cut ? ' Programul are mulți pași, se pot urmări doar primii 2000.' : '');
  const on = animOn(), d = on && s && prev ? schimbare(prev, s) : undefined, say = d && s ? spune(d, s) : '';
  sMem.hidden = !on || !s;
  sMem.textContent = say || (!s ? '' : cur === 0 ? 'Memoria e goală. Apasă ▶ sau ⏵ Redă ca să vezi cum se iau cutiile.' : 'Nicio cutie nu vine și nu pleacă la pasul acesta.');
  sMem.classList.toggle('now', !!say);
  stackEl.innerHTML = '';
  if (s) drawMem(stackEl, s, prev, d, cur > 0);
  $<HTMLButtonElement>('sPlay').hidden = !on;
  if (last) stopPlay();
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
  badLine = 0; pRes.innerHTML = ''; pSent.hidden = true; drawGutter(); drawBar();
}
function saveMine() {
  if (isProb(ex.value)) { store.set('caiet.' + ex.value, code.value); store.set('caiet.' + ex.value + '.in', inp.value); return }
  ex.value = 'mine'; store.set('caiet.doc', 'mine'); store.set('caiet.code', code.value); store.set('caiet.inp', inp.value);
  drawBar();
}

/** The memory animations (the option in the problem bar, caiet.anim): only while a problem is in the editor. */
const sMem = $('sMem'), sPlay = $<HTMLButtonElement>('sPlay'), pAnim = $<HTMLInputElement>('pAnim');
const animOn = () => isProb(ex.value) && store.get('caiet.anim') === 'da';
let playing = 0;
/** Plays the steps one after another, from the start if the stepper is at the end. */
function play() {
  stopPlay();
  if (cur >= steps.length - 1) showStep(0);
  if (steps.length < 2) return;
  playing = window.setInterval(() => showStep(cur + 1), 1100);
  sPlay.textContent = '⏸ Pauză'; sPlay.setAttribute('aria-pressed', 'true');
}
function stopPlay() {
  if (playing) clearInterval(playing);
  playing = 0; sPlay.textContent = '⏵ Redă'; sPlay.setAttribute('aria-pressed', 'false');
}
sPlay.addEventListener('click', () => playing ? stopPlay() : play());
pAnim.addEventListener('change', () => {
  store.set('caiet.anim', pAnim.checked ? 'da' : '');
  stopPlay(); showStep(cur);
});

function run() {
  stopPlay();
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
  if (mSrc === CAIET) mLoad(CAIET);
}
$('sFirst').addEventListener('click', () => { stopPlay(); showStep(0) });
$('sPrev').addEventListener('click', () => { stopPlay(); showStep(cur - 1) });
$('sNext').addEventListener('click', () => { stopPlay(); showStep(cur + 1) });
$('sLast').addEventListener('click', () => { stopPlay(); showStep(steps.length - 1) });
range.addEventListener('input', () => { stopPlay(); showStep(+range.value) });

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
$('run').addEventListener('click', () => {
  run();
  // With the memory animations on, Run also plays the steps from the start so the boxes come and go.
  if (animOn() && steps.length > 1) { play(); if (MOBILE.matches) tab('pasi') }
  else if (MOBILE.matches) tab('rulare');
});

// ---- Sections (the menu) and, on a phone, the parts of the caiet (bottom tabs). Keep MOBILE in sync with the media query in css/style.css.
const MOBILE = matchMedia('(max-width:760px), (pointer:coarse) and (max-height:500px)');
type Sec = 'start' | 'caiet' | 'probleme' | 'memorie' | 'masina' | 'ajutor';
const SECS: Sec[] = ['start', 'caiet', 'probleme', 'memorie', 'masina', 'ajutor'];
const secs = [...document.querySelectorAll<HTMLElement>('[data-sec]')], links = [...document.querySelectorAll<HTMLAnchorElement>('#menu a')];
const panes = [...document.querySelectorAll<HTMLElement>('[data-pane]')], tabs = [...document.querySelectorAll<HTMLButtonElement>('#tabs button')];
const menuBtn = $('menuBtn');
let secNow: Sec | '' = '', booted = false;
/** Shows one section of the page; the address gets #name, so the browser's Back button goes to the previous one. */
function sec(name: Sec) {
  menu(false);
  if (name !== secNow) {
    secNow = name;
    secs.forEach(s => s.classList.toggle('on', s.dataset.sec === name));
    links.forEach(a => { if (a.dataset.go === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current') });
    document.body.dataset.at = name;
    if (name !== 'masina') mStop();
    if (name !== 'memorie') lStop();
    if (name !== 'start') store.set('caiet.sec', name);
    if (!MOBILE.matches) window.scrollTo(0, 0);
    if (name === 'caiet') paneTabs();
  }
  // The memory lessons have an address per page (#stiva, #heap, #impreuna).
  const h = name === 'memorie' ? LECTII[lec].id : name;
  if (location.hash.slice(1) !== h) history[booted ? 'pushState' : 'replaceState'](null, '', '#' + h);
}
const lecOf = (h: string) => LECTII.findIndex(l => l.id === h);
const fromHash = () => {
  const h = location.hash.slice(1), k = lecOf(h);
  if (k >= 0) { if (k !== lec || secNow !== 'memorie') lectie(k) }
  else if (SECS.includes(h as Sec)) sec(h as Sec);
};
addEventListener('hashchange', fromHash);
addEventListener('popstate', fromHash);
/** The menu is a drop-down on a phone (☰), a bar on a computer. */
function menu(open: boolean) {
  document.body.classList.toggle('menu-open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
}
menuBtn.addEventListener('click', e => { e.stopPropagation(); menu(!document.body.classList.contains('menu-open')) });
document.addEventListener('click', e => { if (!(e.target as Element).closest('#menu')) menu(false) });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('menu-open')) { menu(false); menuBtn.focus() } });
links.forEach(a => a.addEventListener('click', e => { e.preventDefault(); sec(a.dataset.go as Sec) }));
// The editor and the statement column are sized to the screen below the sticky top bar (--top-h in css/style.css).
new ResizeObserver(() => document.documentElement.style.setProperty('--top-h', $('top').offsetHeight + 'px')).observe($('top'));

let paneNow = 'cod';
function tabBtn(name: string) { return tabs.find(b => b.dataset.tab === name) }
function paneTabs() { tabs.forEach(b => b.setAttribute('aria-current', String(secNow === 'caiet' && b.dataset.tab === paneNow))) }
/** On a phone the caiet shows one part at a time: the statement, the code, the run, the steps. */
function tab(name: string) {
  paneNow = name;
  panes.forEach(p => p.classList.toggle('on', p.dataset.pane === name));
  sec('caiet'); paneTabs();
  // A pane that was hidden lost its scroll position; bring the interesting line back.
  if (name === 'cod' && (curLine || badLine)) { reveal(curLine || badLine); sync() }
}
tabs.forEach(b => b.addEventListener('click', () => tab(b.dataset.tab!)));
// On a phone a swipe left or right moves to the next or previous part (like the tabs), unless the finger was
// scrolling something sideways (a long line of code, the stack) or the keyboard is open.
let sw: { x: number, y: number, t: number, left: boolean, right: boolean } | null = null;
const caietSec = document.querySelector<HTMLElement>('[data-sec="caiet"]')!;
caietSec.addEventListener('touchstart', e => {
  sw = null;
  if (!MOBILE.matches || e.touches.length !== 1 || document.body.classList.contains('kb')) return;
  const t = e.touches[0];
  let left = false, right = false; // can something under the finger still scroll that way?
  for (let el = e.target as HTMLElement | null; el && el !== caietSec; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(el).overflowX)) {
      if (el.scrollLeft > 1) left = true;
      if (el.scrollLeft + el.clientWidth < el.scrollWidth - 1) right = true;
    }
  }
  sw = { x: t.clientX, y: t.clientY, t: e.timeStamp, left, right };
}, { passive: true });
caietSec.addEventListener('touchend', e => {
  const s = sw; sw = null;
  if (!s || e.changedTouches.length !== 1 || e.timeStamp - s.t > 700) return;
  const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y;
  if (Math.abs(dx) < 60 || Math.abs(dx) < 2 * Math.abs(dy)) return;
  if (dx < 0 ? s.right : s.left) return;
  const shown = tabs.filter(b => !b.hidden).map(b => b.dataset.tab!), i = shown.indexOf(paneNow) + (dx < 0 ? 1 : -1);
  if (i < 0 || i >= shown.length) return;
  tab(shown[i]);
  const p = panes.find(p => p.dataset.pane === shown[i]);
  if (p) { p.classList.remove('slideL', 'slideR'); void p.offsetWidth; p.classList.add(dx < 0 ? 'slideL' : 'slideR') }
}, { passive: true });
caietSec.addEventListener('touchcancel', () => { sw = null });
panes.forEach(p => p.addEventListener('animationend', () => p.classList.remove('slideL', 'slideR')));
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
  { l: '&&', t: ' && ' }, { l: '||', t: ' || ' }, { l: '!', t: '!' }, { l: '&', t: '&' },
  { l: 'int', t: 'int |;', c: 'w' }, { l: 'long long', t: 'long long |;', c: 'w' }, { l: 'cin', t: 'cin >> |;', c: 'w' }, { l: 'cout', t: 'cout << | << endl;', c: 'w' },
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
// ---- Machine view: keyboard and screen, the processor, the buses and the memory, one bus trip at a time (src/masina.ts).
const CAIET = -1; // the program in the editor, instead of one of MASINI
const mProg = $('mProg'), mData = $('mData'), mKeys = $('mKeys'), mScreen = $('mScreen'), mSay = $('mSay'), mCpu = $('mCpu');
const mRange = $<HTMLInputElement>('mRange'), mPlay = $<HTMLButtonElement>('mPlay');
const lanes = { adr: $('lAdr'), cmd: $('lCmd'), dat: $('lDat'), io: $('lIo') };
let mSrc = 0, mm: Masina = masina(MASINI[0].code, MASINI[0].inp), mCur = 0, mInp: string[] = [], mTimer = 0;
const mPicks = [...MASINI.map(m => m.name), 'Programul din caiet'].map((name, k) => {
  const b = el('button', 'pbtn', name); b.type = 'button';
  b.addEventListener('click', () => mLoad(k < MASINI.length ? k : CAIET));
  $('mPick').append(b); return b;
});
function mLoad(k: number) {
  mStop(); mSrc = k;
  const p = k === CAIET ? { code: code.value, inp: inp.value } : MASINI[k];
  mm = masina(p.code, p.inp); mInp = p.inp.split(/\s+/).filter(Boolean);
  mPicks.forEach((b, i) => b.setAttribute('aria-pressed', String(i === (k === CAIET ? MASINI.length : k))));
  mProg.innerHTML = '';
  mm.lines.forEach((l, i) => { if (i < mm.lines.length - 1 || l) { const d = el('div'); d.innerHTML = '<i>' + (i + 1) + '</i><span>' + paint(l) + '</span>'; mProg.append(d) } });
  mShow(0);
}
/** Sends a packet along a bus: `back` = towards the left (to the processor, or from it to the screen), `late` = after the request. */
function packet(lane: HTMLElement, text: string | undefined, back = false, late = false) {
  const pk = lane.querySelector<HTMLElement>('.pk')!;
  lane.classList.toggle('on', text !== undefined);
  pk.className = 'pk';
  if (text === undefined) return;
  pk.textContent = text; pk.title = text;
  void pk.offsetWidth; // restart the animation
  pk.classList.add('go'); if (back) pk.classList.add('back'); if (late) pk.classList.add('late');
}
function cell(c: Cadru, m: Cadru['mem'][number], freed: boolean): HTMLElement {
  const d = el('div', 'mcell');
  d.append(el('small', '', m.adr), el('span', 'dname', m.name), el('b', '', freed ? 'eliberată' : m.val));
  if (freed) d.classList.add('free', 'w');
  else {
    if (m.gol) d.classList.add('gol');
    if (c.cell === m.slot) d.classList.add(c.fel === 'read' ? 'r' : 'w');
  }
  return d;
}
function mShow(i: number) {
  const n = mm.cadre.length;
  mCur = Math.max(0, Math.min(i, n - 1));
  const c = mm.cadre[mCur] as Cadru | undefined;
  mRange.max = String(Math.max(0, n - 1)); mRange.value = String(mCur); mRange.disabled = n < 2;
  $<HTMLButtonElement>('mFirst').disabled = $<HTMLButtonElement>('mPrev').disabled = mCur <= 0;
  $<HTMLButtonElement>('mNext').disabled = $<HTMLButtonElement>('mLast').disabled = mPlay.disabled = mCur >= n - 1;
  $('mNum').textContent = n ? 'Pasul ' + (mCur + 1) + ' din ' + n : '';
  packet(lanes.adr, c?.adr); packet(lanes.cmd, c?.cmd);
  packet(lanes.dat, c?.date, c?.spre === 'cpu', c?.spre === 'cpu' && c.fel !== 'write');
  packet(lanes.io, c?.ioText, c?.io === 'out');
  if (!c) {
    const e = mm.err!;
    mSay.textContent = 'Programul are o greșeală la linia ' + e.line + ': ' + e.message + ' Repar-o în caiet, apoi rulează din nou.';
    for (const id of ['mLine', 'mInstr', 'mReg', 'mUal']) $(id).textContent = '';
    mData.innerHTML = ''; mScreen.textContent = ''; mKeys.innerHTML = ''; return;
  }
  // The processor
  $('mLine').textContent = c.line ? String(c.line) : '—';
  $('mInstr').textContent = c.instr; $('mInstr').title = c.instr;
  $('mReg').textContent = c.reg;
  let ual = ''; for (let j = mCur; j >= 0 && !ual; j--) ual = mm.cadre[j].ual || '';
  $('mUal').textContent = ual;
  mCpu.classList.toggle('alu', c.fel === 'alu');
  $('mRegBox').classList.toggle('on', mCur > 0 && c.reg !== mm.cadre[mCur - 1].reg);
  // The memory: the program, then the boxes by address
  [...mProg.children].forEach((d, k) => { d.classList.toggle('cur', k + 1 === c.line); d.classList.toggle('r', k + 1 === c.line && c.fel === 'fetch') });
  const at = mProg.children[c.line - 1] as HTMLElement | undefined;
  if (at && (at.offsetTop < mProg.scrollTop || at.offsetTop + at.offsetHeight > mProg.scrollTop + mProg.clientHeight)) mProg.scrollTop = at.offsetTop - mProg.clientHeight / 2;
  mData.innerHTML = '';
  // The stack first, then the heap (boxes taken with new), each by address.
  const all = [...c.mem.map(m => [m, false] as const), ...c.freed.map(m => [m, true] as const)]
    .sort((a, b) => (a[0].heap ? 1e6 : 0) + a[0].at - (b[0].heap ? 1e6 : 0) - b[0].at);
  let hp = false;
  for (const [m, f] of all) {
    if (m.heap && !hp) { hp = true; mData.append(el('p', 'mheap', 'Heap: cutiile luate cu new')) }
    mData.append(cell(c, m, f));
  }
  if (!all.length) mData.append(el('p', 'none', 'Nicio cutie folosită încă.'));
  // Keyboard and screen
  mKeys.innerHTML = '';
  mInp.forEach((t, k) => mKeys.append(el('i', k === c.cin - 1 && c.fel === 'in' ? 'now' : k < c.cin ? 'used' : '', t)));
  if (!mInp.length) mKeys.append(el('em', '', 'Nimic de citit.'));
  mScreen.textContent = mm.out.slice(0, c.out); mScreen.scrollTop = mScreen.scrollHeight;
  mSay.textContent = c.say;
  mSay.classList.toggle('bad', c.fel === 'end' && !!mm.err);
}
function mStop() {
  if (!mTimer) return;
  clearInterval(mTimer); mTimer = 0; mPlay.textContent = '⏵'; mPlay.title = 'Pornește'; mPlay.setAttribute('aria-label', 'Pornește');
}
mPlay.addEventListener('click', () => {
  if (mTimer) { mStop(); return }
  mPlay.textContent = '⏸'; mPlay.title = 'Oprește'; mPlay.setAttribute('aria-label', 'Oprește');
  mTimer = setInterval(() => { mShow(mCur + 1); if (mCur >= mm.cadre.length - 1) mStop() }, 1700);
  mShow(mCur + 1);
});
$('mFirst').addEventListener('click', () => { mStop(); mShow(0) });
$('mPrev').addEventListener('click', () => { mStop(); mShow(mCur - 1) });
$('mNext').addEventListener('click', () => { mStop(); mShow(mCur + 1) });
$('mLast').addEventListener('click', () => { mStop(); mShow(mm.cadre.length - 1) });
mRange.addEventListener('input', () => { mStop(); mShow(+mRange.value) });
/** Opens the machine view on a program and brings it into sight. */
function toMachine(k: number) {
  mLoad(k);
  sec('masina');
}
$('sMach').addEventListener('click', () => toMachine(CAIET));
$('iMach').addEventListener('click', () => toMachine(0));
mLoad(0);

// ---- Intro: what the processor and the memory are, a step-by-step demo of boxes and assignments, a short quiz.
const dCode = $('dCode'), dCpu = $('dCpu'), dMem = $('dMem'), dSay = $('dSay'), dNum = $('dNum');
let demo = 0, dStep = 0;
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
      const to = typeof v[1] === 'string' ? mem.findIndex(w => w[0] === v[1]) : -1;
      box.append(el('span', 'dname', v[0]), el('b', to < 0 ? '' : 'ptr', v[1] === undefined ? 'goală' : to < 0 ? String(v[1]) : '→ ' + v[1] + ' (cutia ' + (to + 1) + ')'));
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
  if (MOBILE.matches) tab('pasi'); else sec('caiet');
});
/** One quiz question: code, short answers to click, and why the right one is right. */
function quizItem(q: { code: string; ask: string; options: (number | string)[]; ok: number; why: string }, k: number): HTMLElement {
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
  return box;
}
INTREBARI.forEach((q, k) => $('quiz').append(quizItem(q, k)));
$('iGo').addEventListener('click', () => { store.set('caiet.intro', 'citit'); if (MOBILE.matches) tab('cod'); else sec('caiet') });
showDemo(0);

// ---- Lessons on memory (src/lectii.ts): the stack, the heap, both. Each program runs here and replays step by step,
// with the stack and the heap drawn by drawMem() and a sentence for what came and went.
let lec = Math.max(0, lecOf(store.get('caiet.lectie') || '')), lProg = 0, lCur = 0, lTimer = 0;
let lSteps: Snapshot[] = [], lOutAll = '', lErr: CppError | null = null;
const lText = $('lText'), lProgEl = $('lProg'), lCode = $('lCode'), lMem = $('lMem'), lSay = $('lSay'), lOut = $('lOut'), lStatus = $('lStatus');
const lRange = $<HTMLInputElement>('lRange'), lLabel = $('lLabel'), lPlay = $<HTMLButtonElement>('lPlay');
const lPicks = LECTII.map((l, k) => {
  const b = el('button', '', (k + 1) + '. ' + l.titlu); b.type = 'button';
  b.addEventListener('click', () => lectie(k)); $('lPick').append(b); return b;
});
/** Opens lesson page `k` (and its program `j`); `go` also brings the section into view. */
function lectie(k: number, j = 0, go = true) {
  lec = k; store.set('caiet.lectie', LECTII[k].id);
  const L = LECTII[k];
  lPicks.forEach((b, i) => { if (i === k) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current') });
  $('lTitlu').textContent = (k + 1) + '. ' + L.titlu;
  lText.innerHTML = L.text.map(t => '<p>' + html(t) + '</p>').join('');
  if (L.tabel) {
    const [head, ...rows] = L.tabel;
    lText.insertAdjacentHTML('beforeend', '<table class="ltable"><thead><tr>' + head.map(c => '<th>' + html(c) + '</th>').join('') + '</tr></thead><tbody>'
      + rows.map(r => '<tr>' + r.map((c, i) => (i ? '<td>' : '<th>') + html(c) + (i ? '</td>' : '</th>')).join('') + '</tr>').join('') + '</tbody></table>');
  }
  $('lQuiz').replaceChildren(...L.intrebari.map(quizItem));
  lProgEl.innerHTML = '';
  L.programe.forEach((q, i) => {
    const b = el('button', 'pbtn', q.name); b.type = 'button';
    b.addEventListener('click', () => lProgram(i)); lProgEl.append(b);
  });
  const back = $<HTMLButtonElement>('lBack'), fwd = $<HTMLButtonElement>('lFwd');
  back.hidden = k === 0; back.textContent = k > 0 ? '← ' + LECTII[k - 1].titlu : '';
  fwd.hidden = k === LECTII.length - 1; fwd.textContent = k < LECTII.length - 1 ? LECTII[k + 1].titlu + ' →' : '';
  lProgram(j);
  if (go) sec('memorie');
}
/** Runs program `j` of the current lesson and shows its first step (memory still empty). */
function lProgram(j: number) {
  lStop(); lProg = j;
  const q = LECTII[lec].programe[j];
  [...lProgEl.children].forEach((b, i) => b.setAttribute('aria-pressed', String(i === j)));
  $('lNota').textContent = q.nota;
  $('lInL').hidden = !q.inp; $('lIn').textContent = q.inp;
  lErr = null;
  try { const r = compile(q.code).run(q.inp); lSteps = [...r.trace, r.end]; lOutAll = r.out }
  catch (e) {
    if (!(e instanceof CppError)) throw e;
    lErr = e; lSteps = [...e.trace || [], ...e.end ? [e.end] : []]; lOutAll = e.out || '';
  }
  lShow(0);
}
function lShow(i: number) {
  const n = lSteps.length; lCur = Math.max(0, Math.min(i, n - 1));
  const s = lSteps[lCur] as Snapshot | undefined, prev = lSteps[lCur - 1] as Snapshot | undefined, last = lCur >= n - 1;
  const q = LECTII[lec].programe[lProg], line = s && !last ? s.line : 0, bad = last && lErr ? lErr.line : 0;
  lCode.innerHTML = q.code.replace(/\n$/, '').split('\n').map((l, k) => '<div' + (k + 1 === line ? ' class="cur"' : k + 1 === bad ? ' class="bad"' : '') + '><span class="ln">' + (k + 1) + '</span>' + paint(l) + '</div>').join('');
  const lLine = $('lLine'), shown = line || bad; // on a phone the code is far above: the line again, beside the memory
  lLine.hidden = !shown;
  lLine.innerHTML = shown ? '<span class="ln">' + shown + '</span>' + paint(q.code.split('\n')[shown - 1].trim()) : '';
  const mark = lCode.querySelector<HTMLElement>('.cur, .bad'), box = lCode.parentElement!;
  if (mark && (mark.offsetTop < box.scrollTop || mark.offsetTop + mark.offsetHeight > box.scrollTop + box.clientHeight)) box.scrollTop = mark.offsetTop - box.clientHeight / 2;
  const text = !s ? '' : last ? lOutAll : lOutAll.slice(0, s.out);
  lOut.textContent = text || (last && !lErr ? 'Programul nu a afișat nimic.' : '');
  lOut.classList.toggle('empty', !text);
  lStatus.hidden = !last;
  lStatus.className = lErr ? 'err' : 'ok';
  lStatus.textContent = !last ? '' : lErr ? 'Eroare la rulare, linia ' + lErr.line + ': ' + lErr.message
    : 'Program terminat cu succes.' + (s?.heap.length ? ' Dar în heap au rămas cutii fără delete.' : '');
  const d = s && prev ? schimbare(prev, s) : undefined, say = d && s ? spune(d, s) : '';
  lSay.textContent = lCur === 0 ? 'Memoria e goală. Apasă ▶ (un pas) sau ⏵ Redă pas cu pas și urmărește cum se iau cutiile.'
    : last && lErr ? (say ? say + ' ' : '') + 'Aici programul se oprește, la linia ' + lErr.line + '.'
      : say || 'Nicio cutie nu vine și nu pleacă la pasul acesta.';
  lSay.classList.toggle('now', !!say || (last && !!lErr));
  lLabel.textContent = last ? (lErr ? 'Oprit la linia ' + lErr.line + '.' : 'Program terminat.') + ' Apasă |◀ ca să îl urmărești de la început.'
    : 'Pasul ' + (lCur + 1) + ' din ' + (n - 1) + ': urmează linia ' + line + '.';
  lMem.innerHTML = '';
  if (s) drawMem(lMem, s, prev, d, lCur > 0);
  lRange.max = String(Math.max(0, n - 1)); lRange.value = String(lCur);
  $<HTMLButtonElement>('lFirst').disabled = $<HTMLButtonElement>('lPrev').disabled = lCur <= 0;
  $<HTMLButtonElement>('lNext').disabled = $<HTMLButtonElement>('lLast').disabled = last;
  if (last) lStop();
}
function lStop() {
  if (lTimer) clearInterval(lTimer);
  lTimer = 0; lPlay.textContent = '⏵ Redă pas cu pas'; lPlay.setAttribute('aria-pressed', 'false');
}
lPlay.addEventListener('click', () => {
  if (lTimer) { lStop(); return }
  if (lCur >= lSteps.length - 1) lShow(0);
  lPlay.textContent = '⏸ Pauză'; lPlay.setAttribute('aria-pressed', 'true');
  lTimer = window.setInterval(() => lShow(lCur + 1), 1300);
});
$('lRun').addEventListener('click', () => { lStop(); lShow(lSteps.length - 1) });
$('lFirst').addEventListener('click', () => { lStop(); lShow(0) });
$('lPrev').addEventListener('click', () => { lStop(); lShow(lCur - 1) });
$('lNext').addEventListener('click', () => { lStop(); lShow(lCur + 1) });
$('lLast').addEventListener('click', () => { lStop(); lShow(lSteps.length - 1) });
lRange.addEventListener('input', () => { lStop(); lShow(+lRange.value) });
$('lBack').addEventListener('click', () => lectie(lec - 1));
$('lFwd').addEventListener('click', () => lectie(lec + 1));
$('lOpen').addEventListener('click', () => {
  const q = LECTII[lec].programe[lProg], k = EX.findIndex(e => e.code === q.code);
  ex.value = String(k); load(ex.value); run(); showStep(0);
  if (MOBILE.matches) tab('cod'); else sec('caiet');
});
lectie(lec, 0, false);

// ---- Problems from pbinfo (probleme/probleme.json, built by tools/probleme.mjs): list, statement, check on the examples.
let probs: Problema[] = [], sel: Problema | undefined;
const notes = new Map<Problema, ReturnType<typeof note>>();
const probsEl = $('probs'), pUl = $('pUl'), pView = $('pView'), pRes = $('pRes'), pCount = $('pCount'), pSent = $('pSent');
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
/** Writes a problem's statement into `into`: title, notes, the parts of the text and the examples.
 * `here` = it sits beside the editor while the problem is being solved (no "solve" button, no authors). */
function statement(into: HTMLElement, p: Problema, here: boolean) {
  const h = el('h3', '', p.nume), meta = el('p', 'pmeta', here ? '' : CAPITOLE[p.sub] + ' · dificultate ' + DIFICULTATI[p.dif] + ' · ');
  const a = el('a', '', 'problema #' + p.id + ' pe pbinfo.ro'); a.href = url(p); a.target = '_blank'; a.rel = 'noopener';
  meta.append(a); into.append(h, meta);
  const n = noteOf(p);
  for (const t of n.text) if (!here || n.stop) into.append(el('p', n.stop && t === n.text[0] ? 'pwarn stop' : 'pwarn', t));
  if (!here) {
    const go = el('button', 'run', ex.value === 'p' + p.id ? '✎ Continuă în caiet' : '✎ Rezolvă în caiet'); go.type = 'button';
    go.addEventListener('click', () => start(p));
    into.append(go);
  }
  const part = (title: string, s: string) => { if (!s) return; into.append(el('h4', '', title)); prose(into, s) };
  for (const [t, s] of p.sect || []) if (!t) prose(into, s);
  part('Cerința', p.cerinta); part('Date de intrare', p.intrare); part('Date de ieșire', p.iesire); part('Restricții și precizări', p.restrictii);
  p.ex.forEach((e, i) => {
    into.append(el('h4', '', p.ex.length > 1 ? 'Exemplul ' + (i + 1) : 'Exemplu'));
    const box = el('div', 'pex'), use = el('button', 'pbtn', 'Pune în „Date de intrare”');
    for (const [t, v] of [['Intrare', e.in], ['Ieșire', e.out]]) { const d = el('div'); d.append(el('small', '', t), el('pre', '', v)); box.append(d) }
    if (e.ex) { const d = el('div', 'pexp'); prose(d, e.ex); box.append(d) }
    use.type = 'button';
    use.addEventListener('click', () => { if (ex.value !== 'p' + p.id) start(p); inp.value = e.in; saveMine(); run(); if (MOBILE.matches) tab('rulare') });
    box.append(use); into.append(box);
  });
  for (const [t, s] of p.sect || []) if (t) part(t, s);
  if (here) {
    const other = el('a', 'pother', 'Alege altă problemă'); other.href = '#probleme';
    other.addEventListener('click', e => { e.preventDefault(); show(p, false); sec('probleme') });
    into.append(other);
    return;
  }
  const who = [p.autor && 'Autor: ' + p.autor, p.sursa && 'Sursa: ' + p.sursa].filter(Boolean).join(' · ');
  if (who) into.append(el('p', 'pfoot', who));
}
/** Shows a problem's statement in the problems section; `open` also brings it up on a phone (instead of the list). */
function show(p: Problema, open: boolean) {
  sel = p; store.set('caiet.psel', String(p.id));
  pView.innerHTML = '';
  const back = el('button', 'mob pback', '← Înapoi la listă'); back.type = 'button';
  back.addEventListener('click', () => { probsEl.classList.remove('open'); pUl.querySelector<HTMLElement>('.on')?.focus() });
  pView.append(back);
  statement(pView, p, false);
  pView.scrollTop = 0;
  if (open) probsEl.classList.add('open');
  pUl.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.id === String(p.id)));
}
/** Opens a problem in the editor (with its own saved draft), with its statement beside it. */
function start(p: Problema) {
  const v = 'p' + p.id;
  store.set('caiet.enunt', '');
  probOption(v, p.nume); ex.value = v; load(v); run();
  if (sel === p) show(p, probsEl.classList.contains('open'));
  if (MOBILE.matches) tab('cod');
  else { sec('caiet'); code.focus({ preventScroll: true }) }
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
  drawEnunt();
  if (!on) return;
  $('pName').textContent = p ? p.nume : (ex.selectedOptions[0]?.text || '').replace('Problema: ', '');
  $<HTMLButtonElement>('pCheck').disabled = $<HTMLButtonElement>('pSend').disabled = !p;
  pAnim.checked = store.get('caiet.anim') === 'da';
}
/** While a problem is in the editor its statement stays at hand: a column beside the code on a computer
 * (it can be hidden with „Enunțul”, remembered in caiet.enunt), the „Enunț” tab on a phone. */
const enunt = $('enunt'), eTog = $('eTog'), grid = $('grid');
function drawEnunt() {
  const p = probOf(ex.value), shown = !!p && (MOBILE.matches || store.get('caiet.enunt') !== 'ascuns');
  tabBtn('enunt')!.hidden = eTog.hidden = !p;
  eTog.setAttribute('aria-pressed', String(shown));
  eTog.title = shown ? 'Ascunde enunțul problemei' : 'Arată enunțul problemei lângă program';
  enunt.hidden = !shown; grid.classList.toggle('wp', shown);
  if (p && enunt.dataset.id !== String(p.id)) { enunt.dataset.id = String(p.id); enunt.innerHTML = ''; statement(enunt, p, true); enunt.scrollTop = 0 }
  if (!p && paneNow === 'enunt') tab('cod');
}
eTog.addEventListener('click', () => { store.set('caiet.enunt', eTog.getAttribute('aria-pressed') === 'true' ? 'ascuns' : ''); drawEnunt() });
MOBILE.addEventListener('change', drawEnunt);
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
    const b = el('button', 'link', 'trimite-o acolo'); b.type = 'button'; b.addEventListener('click', send);
    li.append(b, '.'); pRes.append(li); list();
  }
}
$('pCheck').addEventListener('click', check);

/** Sending to pbinfo.ro: the page cannot submit for the student (pbinfo has no way for another site to do it and
 * the login stays on pbinfo), so it copies the program, adapted for pbinfo, and opens the problem there to paste it. */
function send() {
  const p = probOf(ex.value);
  if (!p) return;
  pSent.innerHTML = ''; pSent.hidden = false;
  let rs: Rezultat[];
  try { rs = verifica(code.value, p) } catch (e) {
    if (!(e instanceof CppError)) throw e;
    pSent.append(el('p', 'pwarn', 'Programul are o greșeală la linia ' + e.line + '. Repar-o înainte să-l trimiți: pbinfo nu l-ar putea compila.'));
    return;
  }
  const { code: text, fis } = pentruPbinfo(code.value, p);
  const shown = () => { // the clipboard is not allowed: the program to copy by hand
    const ta = el('textarea'); ta.readOnly = true; ta.value = text; ta.setAttribute('aria-label', 'Programul pentru pbinfo');
    ta.addEventListener('focus', () => ta.select());
    const msg = pSent.querySelector('.pcopy')!;
    msg.textContent = 'Am deschis problema pe pbinfo.ro, dar nu am putut copia singur programul. Selectează-l de aici și copiază-l (Ctrl+C):';
    msg.after(ta);
  };
  // Runs after the message below is written (a promise, or a microtask when there is no clipboard at all).
  if (navigator.clipboard) navigator.clipboard.writeText(text).catch(shown); else queueMicrotask(shown);
  window.open(url(p), '_blank', 'noopener');
  const bad = rs.filter(r => !r.ok).length;
  if (bad) pSent.append(el('p', 'pwarn', bad === rs.length ? 'Atenție: programul nu trece încă niciun exemplu. Pe pbinfo va lua probabil 0 puncte.' : 'Atenție: programul nu trece încă toate exemplele.'));
  pSent.append(el('p', 'pcopy', 'Am copiat programul și am deschis problema pe pbinfo.ro. Acolo:'));
  const ol = el('ol');
  for (const s of ['Intră în contul tău de pbinfo, dacă nu ești deja.', 'Coboară sub enunț, unde se trimite soluția, și alege limbajul C++.',
    'Lipește programul în căsuța de cod (Ctrl+V; pe telefon ține apăsat și alege „Lipire”).', 'Apasă butonul de trimis și așteaptă punctajul.']) ol.append(el('li', '', s));
  pSent.append(ol);
  if (fis) pSent.append(el('p', '', 'Pe pbinfo programul citește din ' + p.fis + '.in și scrie în ' + p.fis + '.out, așa că am adăugat două rânduri la începutul lui main: ifstream cin(…) și ofstream cout(…). Restul programului e la fel.'));
}
$('pSend').addEventListener('click', send);
for (const e of [pQ, pSub, pDif, pOk]) e.addEventListener('input', list);
CAPITOLE.forEach((c, i) => pSub.add(new Option(c, String(i))));
DIFICULTATI.forEach((d, i) => pDif.add(new Option(d[0].toUpperCase() + d.slice(1), String(i))));

const doc = store.get('caiet.doc') || '', docName = store.get('caiet.docName');
if (isProb(doc) && docName) probOption(doc, docName);
ex.value = isProb(doc) && docName ? doc : store.get('caiet.code') ? 'mine' : '0';
load(ex.value); run();
{ // First section: the address (#probleme), else the last one used, else the intro until it was read.
  const h = location.hash.slice(1) as Sec, last = store.get('caiet.sec') as Sec | null;
  if (lecOf(h) >= 0 && lecOf(h) !== lec) lectie(lecOf(h), 0, false);
  const first: Sec = lecOf(h) >= 0 ? 'memorie' : SECS.includes(h) ? h : last && SECS.includes(last) ? last : store.get('caiet.intro') ? 'caiet' : 'start';
  if (first === 'caiet') tab('cod'); else { panes.forEach(p => p.classList.toggle('on', p.dataset.pane === 'cod')); sec(first) }
  booted = true;
}
fit();

pCount.textContent = 'Se încarcă problemele…';
fetch('probleme/probleme.json').then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<Culegere> }).then(d => {
  probs = d.probleme;
  const s = probs.find(p => p.id === +(store.get('caiet.psel') || 0));
  list();
  if (s) show(s, false);
  drawBar();
}).catch(() => { pCount.textContent = 'Problemele nu s-au putut încărca. Verifică legătura la internet și reîncarcă pagina.' });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* offline mode unavailable */ });
