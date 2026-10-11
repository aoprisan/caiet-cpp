// Interpreter for the C++ subset: lexer -> closures. No DOM. Exposes compile(src).run(input).

const LIMIT = 20000000, OUTMAX = 200000, INTMAX = 2147483647, TMAX = 2000;

export type ErrorKind = 'compile' | 'run';
/** One variable as seen by the stepper: name, value (undefined = no value yet), is it global. */
export type VarView = [name: string, value: number | undefined, global: boolean];
export interface Snapshot { line: number; vars: VarView[]; out: number }
export interface RunResult { out: string; steps: number; trace: Snapshot[]; end: Snapshot; cut: boolean }
export interface Program { run(input?: string): RunResult }

export class CppError extends Error {
  readonly isCpp = true;
  out?: string;
  trace?: Snapshot[];
  end?: Snapshot;
  cut?: boolean;
  constructor(message: string, readonly line: number, readonly kind: ErrorKind = 'compile') {
    super(message);
    this.name = 'CppError';
  }
}
const E = (msg: string, line: number, kind?: ErrorKind) => new CppError(msg, line, kind);

type TokType = 'num' | 'id' | 'op' | 'str' | 'eof';
/** `v` is the source text (or the decoded string for `str`); `n` is the value of a `num`. */
interface Tok { t: TokType; v: string; line: number; n?: number }

const KEY = new Set(['int', 'if', 'else', 'while', 'for', 'do', 'return', 'break', 'continue', 'cin', 'cout', 'endl', 'using', 'namespace', 'std', 'main']);
const NOTYPE = new Set(['float', 'double', 'char', 'string', 'bool', 'long', 'short', 'unsigned', 'void']);
const OPS = ['<<', '>>', '<=', '>=', '==', '!=', '&&', '||', '++', '--', '+=', '-=', '*=', '/=', '%=', '+', '-', '*', '/', '%', '<', '>', '=', '!', '(', ')', '{', '}', ';', ','];
const ESC: Record<string, string> = { n: '\n', t: '\t', '\\': '\\', '"': '"', "'": "'", '0': '\0' };

function lex(src: string): { toks: Tok[]; inc: boolean } {
  const toks: Tok[] = [], n = src.length;
  let i = 0, line = 1, inc = false;
  const isD = (c: string) => c >= '0' && c <= '9', isA = (c: string) => /[A-Za-z_]/.test(c);
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue }
    if (c === ' ' || c === '\t' || c === '\r' || c === ' ') { i++; continue }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue }
    if (c === '/' && src[i + 1] === '*') {
      const s = line; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++ }
      if (i >= n) throw E('Comentariul început cu /* nu este închis cu */.', s);
      i += 2; continue;
    }
    if (c === '#') {
      let j = i; while (j < n && src[j] !== '\n') j++;
      if (/^#\s*include\s*<\s*(iostream|bits\/stdc\+\+\.h)\s*>/.test(src.slice(i, j))) inc = true;
      i = j; continue;
    }
    if (isD(c)) {
      let j = i; while (j < n && isD(src[j])) j++;
      if (src[j] === '.' && isD(src[j + 1] || '')) throw E('Aici folosim doar numere întregi, fără virgulă.', line);
      if (j < n && isA(src[j])) throw E('Un nume de variabilă nu poate începe cu o cifră.', line);
      const v = src.slice(i, j), num = Number(v);
      if (num > INTMAX) throw E('Numărul este prea mare pentru int (maximum 2147483647).', line);
      toks.push({ t: 'num', v, n: num, line }); i = j; continue;
    }
    if (isA(c)) {
      let j = i; while (j < n && (isA(src[j]) || isD(src[j]))) j++;
      toks.push({ t: 'id', v: src.slice(i, j), line }); i = j; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1, s = '';
      while (j < n && src[j] !== c) {
        if (src[j] === '\n') break;
        if (src[j] === '\\') {
          const e = ESC[src[j + 1]];
          if (e === undefined) throw E('Nu cunosc secvența \\' + (src[j + 1] || '') + '.', line);
          s += e; j += 2;
        } else s += src[j++];
      }
      if (src[j] !== c) throw E(c === '"' ? 'Textul început cu ghilimele nu este închis pe aceeași linie.' : 'Caracterul început cu apostrof nu este închis.', line);
      if (c === "'" && s.length !== 1) throw E("Între apostrofuri trebuie să fie un singur caracter. Pentru text folosește ghilimele: \"...\"", line);
      toks.push({ t: 'str', v: s, line }); i = j + 1; continue;
    }
    const op = OPS.find(o => src.startsWith(o, i));
    if (op) { toks.push({ t: 'op', v: op, line }); i += op.length; continue }
    throw E('Caracterul „' + c + '” nu are ce căuta aici.', line);
  }
  toks.push({ t: 'eof', v: '', line });
  return { toks, inc };
}

/** An expression closure. `slot`/`vname` are set when it is a bare variable (so it can be assigned). */
type Expr = (() => number) & { slot?: number; vname?: string };
/** Statement result: 0 normal, 1 break, 2 continue, 3 return. */
type Flow = 0 | 1 | 2 | 3;
type Stmt = () => Flow;

export function compile(src: string): Program {
  const { toks, inc } = lex(src);
  let p = 0, nslots = 0, loops = 0, usingStd = false, steps = 0, outLen = 0, input = '', ip = 0;
  let mem: (number | undefined)[] = [], out: string[] = [], live: number[] = [], trace: Snapshot[] = [];
  const names: string[] = [], gl: boolean[] = [];
  function snap(line: number): Snapshot {
    const v: VarView[] = [];
    for (const s of live) v.push([names[s], mem[s], !!gl[s]]);
    return { line, vars: v, out: outLen };
  }
  const scopes: Map<string, number>[] = [new Map()];
  const peek = () => toks[p], next = () => toks[p++];
  const isOp = (...v: string[]) => toks[p].t === 'op' && v.includes(toks[p].v);
  const isId = (v: string) => toks[p].t === 'id' && toks[p].v === v;
  const show = (t: Tok) => t.t === 'eof' ? 'sfârșitul programului' : t.t === 'str' ? 'un text' : '„' + t.v + '”';
  function expect(v: string): Tok {
    if (toks[p].t === 'op' && toks[p].v === v) return next();
    const prev = toks[p - 1] || toks[p];
    if (v === ';') throw E('Lipsește „;” la sfârșitul instrucțiunii.', prev.line);
    throw E('Aici trebuia „' + v + '”, dar am găsit ' + show(toks[p]) + '.', toks[p].t === 'eof' ? prev.line : toks[p].line);
  }
  function expectId(v: string): Tok {
    if (isId(v)) return next();
    throw E('Aici trebuia „' + v + '”, dar am găsit ' + show(peek()) + '.', peek().line);
  }
  function tick(line: number) {
    if (++steps > LIMIT) throw E('Programul rulează de prea mult timp. Poate ai o repetiție care nu se termină niciodată?', line, 'run');
    if (trace.length < TMAX) trace.push(snap(line));
  }
  function lookup(name: string): number | undefined {
    for (let i = scopes.length - 1; i >= 0; i--) { const s = scopes[i].get(name); if (s !== undefined) return s }
    return undefined;
  }
  function declare(tok: Tok): number {
    if (tok.t !== 'id') throw E('Aici trebuia un nume de variabilă, dar am găsit ' + show(tok) + '.', tok.line);
    if (KEY.has(tok.v) || NOTYPE.has(tok.v)) throw E('„' + tok.v + '” este un cuvânt rezervat și nu poate fi nume de variabilă.', tok.line);
    const sc = scopes[scopes.length - 1];
    if (sc.has(tok.v)) throw E('Variabila „' + tok.v + '” a fost deja declarată.', tok.line);
    const s = nslots++; sc.set(tok.v, s); names[s] = tok.v; return s;
  }
  function needIO(tok: Tok) {
    if (!inc) throw E('Pentru ' + tok.v + ' trebuie să scrii la început: #include <iostream>', tok.line);
    if (!usingStd) throw E('Pentru ' + tok.v + ' trebuie să scrii la început: using namespace std;', tok.line);
  }

  // ---- expressions ----
  function primary(): Expr {
    const t = next();
    if (t.t === 'num') { const v = t.n!; return () => v }
    if (t.t === 'op' && t.v === '(') { const e = expr(); expect(')'); return () => e() }
    if (t.t === 'id') {
      if (NOTYPE.has(t.v)) throw E('Aici folosim doar numere întregi (int). „' + t.v + '” nu este disponibil.', t.line);
      if (KEY.has(t.v)) throw E('„' + t.v + '” nu poate apărea aici.', t.line);
      if (isOp('(')) throw E('Funcțiile nu sunt disponibile în acest caiet.', t.line);
      const s = lookup(t.v), name = t.v, line = t.line;
      if (s === undefined) throw E('Variabila „' + name + '” nu a fost declarată. Scrie mai întâi: int ' + name + ';', line);
      const f: Expr = () => {
        const x = mem[s];
        if (x === undefined) throw E('Variabila „' + name + '” este folosită înainte să primească o valoare.', line, 'run');
        return x;
      };
      f.slot = s; f.vname = name; return f;
    }
    if (t.t === 'str') throw E('Textul poate fi folosit doar la afișare, după cout <<.', t.line);
    throw E('Aici trebuia un număr sau o variabilă, dar am găsit ' + show(t) + '.', t.t === 'eof' ? (toks[p - 2] || t).line : t.line);
  }
  function needVar(a: Expr, t: Tok): number {
    if (a.slot === undefined) throw E('„' + t.v + '” se poate aplica doar unei variabile.', t.line);
    return a.slot;
  }
  function postfix(): Expr {
    const a = primary();
    if (isOp('++', '--')) {
      const t = next(), s = needVar(a, t), d = t.v === '++' ? 1 : -1;
      return () => { const x = a(); mem[s] = (x + d) | 0; return x };
    }
    return a;
  }
  function unary(): Expr {
    if (isOp('-')) { next(); const a = unary(); return () => (-a()) | 0 }
    if (isOp('+')) { next(); return unary() }
    if (isOp('!')) { next(); const a = unary(); return () => a() === 0 ? 1 : 0 }
    if (isOp('++', '--')) {
      const t = next(), a = unary(), s = needVar(a, t), d = t.v === '++' ? 1 : -1;
      return () => (mem[s] = (a() + d) | 0);
    }
    return postfix();
  }
  function arith(o: string, line: number, x: number, y: number): number {
    switch (o) {
      case '+': return (x + y) | 0;
      case '-': return (x - y) | 0;
      case '*': return Math.imul(x, y);
      case '/': if (y === 0) throw E('Împărțire la zero.', line, 'run'); return (x / y) | 0;
      case '%': if (y === 0) throw E('Împărțire la zero (restul împărțirii la 0 nu există).', line, 'run'); return (x % y) | 0;
    }
    throw new Error('unknown operator ' + o);
  }
  function mk(t: Tok, a: Expr, b: Expr): Expr {
    const o = t.v, line = t.line;
    switch (o) {
      case '||': return () => (a() !== 0 || b() !== 0) ? 1 : 0;
      case '&&': return () => (a() !== 0 && b() !== 0) ? 1 : 0;
      case '==': return () => a() === b() ? 1 : 0;
      case '!=': return () => a() !== b() ? 1 : 0;
      case '<': return () => a() < b() ? 1 : 0;
      case '<=': return () => a() <= b() ? 1 : 0;
      case '>': return () => a() > b() ? 1 : 0;
      case '>=': return () => a() >= b() ? 1 : 0;
      case '+': return () => (a() + b()) | 0;
      case '-': return () => (a() - b()) | 0;
      default: return () => { const x = a(); return arith(o, line, x, b()) };
    }
  }
  const LV = [['||'], ['&&'], ['==', '!='], ['<', '<=', '>', '>='], ['+', '-'], ['*', '/', '%']];
  function bin(l: number): Expr {
    if (l === LV.length) return unary();
    let a = bin(l + 1);
    while (isOp(...LV[l])) { const t = next(); a = mk(t, a, bin(l + 1)) }
    return a;
  }
  function expr(): Expr {
    const a = bin(0);
    if (isOp('=', '+=', '-=', '*=', '/=', '%=')) {
      const t = next();
      if (a.slot === undefined) throw E('În stânga lui „' + t.v + '” trebuie să fie o variabilă.', t.line);
      const b = expr(), s = a.slot, line = t.line;
      if (t.v === '=') return () => (mem[s] = b());
      const o = t.v[0];
      return () => { const x = a(); return (mem[s] = arith(o, line, x, b())) };
    }
    return a;
  }

  // ---- statements ----
  function decl(global: boolean): Stmt {
    const line = next().line, parts: [number, Expr | null][] = [];
    do {
      const t = next(); let init: Expr | null = null;
      if (isOp('[') || peek().t === 'eof') throw E('Declarație neterminată.', t.line);
      if (isOp('=')) { next(); init = expr() }
      const s = declare(t); if (global) gl[s] = true;
      parts.push([s, init]);
    } while (isOp(',') && next());
    if (isOp('(')) throw E('Funcțiile proprii nu sunt disponibile în acest caiet. Scrie tot programul în main.', peek().line);
    expect(';');
    return () => {
      if (!global) tick(line);
      for (const [s, init] of parts) { mem[s] = init ? init() : (global ? 0 : undefined); live.push(s) }
      return 0;
    };
  }
  function block(): Stmt {
    expect('{'); scopes.push(new Map());
    const list: Stmt[] = [];
    while (!isOp('}')) {
      if (peek().t === 'eof') throw E('Lipsește o acoladă de închidere „}”.', toks[p - 1].line);
      list.push(stmt());
    }
    next(); scopes.pop();
    const n = list.length;
    return () => {
      const L = live.length; let r: Flow = 0;
      for (let i = 0; i < n; i++) { r = list[i](); if (r) break }
      live.length = L; return r;
    };
  }
  function body(): Stmt {
    scopes.push(new Map()); const s = stmt(); scopes.pop();
    return () => { const L = live.length, r = s(); live.length = L; return r };
  }
  function cond(): Expr { expect('('); const c = expr(); expect(')'); return c }
  function stmt(): Stmt {
    const t = peek(), line = t.line;
    if (isOp('{')) return block();
    if (isOp(';')) { next(); return () => 0 }
    if (t.t === 'id') {
      if (NOTYPE.has(t.v)) throw E('Aici folosim doar numere întregi (int). „' + t.v + '” nu este disponibil.', line);
      switch (t.v) {
        case 'int': return decl(false);
        case 'if': {
          next(); const c = cond(), a = body(); let b: Stmt | null = null;
          if (isId('else')) { next(); b = body() }
          return () => { tick(line); return c() !== 0 ? a() : (b ? b() : 0) };
        }
        case 'else': throw E('Acest „else” nu are un „if” înaintea lui.', line);
        case 'while': {
          next(); const c = cond(); loops++; const b = body(); loops--;
          return () => {
            while (c() !== 0) { tick(line); const r = b(); if (r === 1) break; if (r === 3) return 3 }
            return 0;
          };
        }
        case 'do': {
          next(); loops++; const b = body(); loops--; expectId('while'); const c = cond(); expect(';');
          return () => {
            do { tick(line); const r = b(); if (r === 1) break; if (r === 3) return 3 } while (c() !== 0);
            return 0;
          };
        }
        case 'for': {
          next(); expect('('); scopes.push(new Map());
          let init: (() => unknown) | null = null, c: Expr | null = null, step: Expr | null = null;
          if (isOp(';')) next();
          else if (isId('int')) init = decl(false);
          else { init = expr(); expect(';') }
          if (!isOp(';')) c = expr(); expect(';');
          if (!isOp(')')) step = expr(); expect(')');
          loops++; const b = body(); loops--; scopes.pop();
          return () => {
            const L = live.length; if (init) init();
            while (!c || c() !== 0) {
              tick(line); const r = b();
              if (r === 1) break;
              if (r === 3) { live.length = L; return 3 }
              if (step) step();
            }
            live.length = L; return 0;
          };
        }
        case 'break': case 'continue': {
          next();
          if (!loops) throw E('„' + t.v + '” se poate folosi doar în interiorul unei repetiții (while, for, do).', line);
          expect(';'); const r: Flow = t.v === 'break' ? 1 : 2;
          return () => r;
        }
        case 'return': {
          next(); let e: Expr | null = null;
          if (!isOp(';')) e = expr(); expect(';');
          return () => { tick(line); if (e) e(); return 3 };
        }
        case 'cin': {
          next(); needIO(t); const slots: number[] = [];
          if (isOp('<<')) throw E('La cin se folosește >> (nu <<).', line);
          if (!isOp('>>')) throw E('După cin trebuie să urmeze >> și o variabilă.', line);
          while (isOp('>>')) {
            next(); const v = next();
            if (v.t !== 'id') throw E('După >> trebuie să urmeze o variabilă.', v.line);
            const s = lookup(v.v);
            if (s === undefined) throw E('Variabila „' + v.v + '” nu a fost declarată. Scrie mai întâi: int ' + v.v + ';', v.line);
            slots.push(s);
          }
          if (isOp('<<')) throw E('La cin se folosește >> (nu <<).', line);
          expect(';');
          return () => { tick(line); for (const s of slots) mem[s] = readInt(line); return 0 };
        }
        case 'cout': {
          next(); needIO(t); const items: (() => string)[] = [];
          if (isOp('>>')) throw E('La cout se folosește << (nu >>).', line);
          if (!isOp('<<')) throw E('După cout trebuie să urmeze << și ce vrei să afișezi.', line);
          while (isOp('<<')) {
            next();
            if (peek().t === 'str') { const s = next().v; items.push(() => s) }
            else if (isId('endl')) { next(); items.push(() => '\n') }
            else { const e = bin(4); items.push(() => String(e())) }
          }
          if (isOp('>>')) throw E('La cout se folosește << (nu >>).', line);
          expect(';');
          return () => {
            tick(line);
            for (const f of items) {
              const s = f(); outLen += s.length;
              if (outLen > OUTMAX) throw E('Programul a afișat prea mult text. Poate ai o repetiție care nu se termină?', line, 'run');
              out.push(s);
            }
            return 0;
          };
        }
      }
    }
    const e = expr(); expect(';');
    return () => { tick(line); e(); return 0 };
  }
  function readInt(line: number): number {
    while (ip < input.length && /\s/.test(input[ip])) ip++;
    if (ip >= input.length) throw E('Programul vrea să citească un număr, dar datele de intrare s-au terminat. Scrie mai multe numere în caseta „Date de intrare”.', line, 'run');
    const m = /^[+-]?\d+/.exec(input.slice(ip, ip + 40));
    if (!m) {
      const w = /^\S+/.exec(input.slice(ip, ip + 40))![0];
      throw E('În datele de intrare am găsit „' + w + '”, dar programul aștepta un număr întreg.', line, 'run');
    }
    ip += m[0].length; return Number(m[0]) | 0;
  }

  // ---- program ----
  const globals: Stmt[] = []; let main: Stmt | null = null;
  while (peek().t !== 'eof') {
    const t = peek();
    if (isId('using')) { next(); expectId('namespace'); expectId('std'); expect(';'); usingStd = true; continue }
    if (isId('int')) {
      if (toks[p + 1].t === 'id' && toks[p + 1].v === 'main') {
        if (main) throw E('Programul are deja un main.', t.line);
        p += 2; expect('('); expect(')'); main = block(); continue;
      }
      globals.push(decl(true)); continue;
    }
    if (t.t === 'id' && NOTYPE.has(t.v)) throw E(t.v === 'void' && toks[p + 1].v === 'main' ? 'Scrie „int main()”, nu „void main()”.' : 'Aici folosim doar numere întregi (int). „' + t.v + '” nu este disponibil.', t.line);
    if (isId('main')) throw E('Înainte de main trebuie scris int: int main()', t.line);
    throw E('Nu înțeleg ' + show(t) + ' aici. Instrucțiunile se scriu în interiorul lui main, între acolade.', t.line);
  }
  if (!main) throw E('Programul nu are „int main()”. De acolo începe rularea.', toks[toks.length - 1].line);
  const entry = main;

  return {
    run(inp?: string): RunResult {
      mem = new Array(nslots); steps = 0; out = []; outLen = 0; input = String(inp || ''); ip = 0; live = []; trace = [];
      try {
        for (const g of globals) g();
        entry();
      } catch (e) {
        if (e instanceof CppError) { e.out = out.join(''); e.trace = trace; e.end = snap(e.line); e.cut = steps > trace.length }
        throw e;
      }
      return { out: out.join(''), steps, trace, end: snap(0), cut: steps > trace.length };
    },
  };
}
