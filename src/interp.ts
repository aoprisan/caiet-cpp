// Interpreter for the C++ subset: lexer -> closures. No DOM. Exposes compile(src).run(input).

const LIMIT = 20000000, OUTMAX = 200000, INTMAX = 2147483647, TMAX = 2000, BMAX = 1500;
const LLMAX = 9223372036854775807n;

/** A value in memory: an int (or a pointer) is a number, a long long is a bigint. */
export type Val = number | bigint;

export type ErrorKind = 'compile' | 'run';
/**
 * One variable as seen by the stepper: name, value (undefined = no value yet), is it global, for a pointer
 * what it points to (the variable's name, „nullptr”, or the name followed by „(nu mai există)” once that box left the stack),
 * and for a local the function call it belongs to (an index in `Snapshot.calls`).
 */
export type VarView = [name: string, value: Val | undefined, global: boolean, to?: string, call?: number];
/** `calls` are the functions running at that moment, main first, the one running now last. */
export interface Snapshot { line: number; vars: VarView[]; out: number; calls: string[] }
/**
 * What the processor does, for the machine view (only recorded by compile(src, { bus: true })). `slot` is a box in memory;
 * a pointer's value is its target slot + 1 (0 = nullptr). `fetch` brings a line of the program from memory, `decl` makes a box,
 * `read`/`write` go to a box over the buses, `alu` is a calculation inside the processor (`y` missing for -x and !x;
 * `ptr` when it compares addresses), `in` takes a number from the keyboard (cin), `out` sends text to the screen (cout),
 * `free` lets go of the boxes of a block at its `}` (or of a function call, `fn`, when it ends), `call` jumps to a function
 * (`n` parameters), `ret` brings back the value it returns.
 */
export type BusEvent =
  | { k: 'fetch'; line: number }
  | { k: 'decl'; slot: number }
  | { k: 'read' | 'write'; slot: number; v: Val }
  | { k: 'alu'; op: string; x: Val; y?: Val; r: Val; ptr?: boolean }
  | { k: 'in'; v: Val }
  | { k: 'out'; s: string }
  | { k: 'free'; slots: number[]; fn?: string }
  | { k: 'call'; name: string; line: number; n: number }
  | { k: 'ret'; name: string; v: Val };
/** A box in memory as the machine view draws it: slot, name, value (undefined = empty), is it a pointer, its place on the stack. */
export type Box = [slot: number, name: string, value: Val | undefined, ptr: boolean, at: number];
/** One bus event with the memory right after it, how much was printed and the line being run. */
export interface BusStep { e: BusEvent; mem: Box[]; out: number; line: number }
export interface RunResult { out: string; steps: number; trace: Snapshot[]; end: Snapshot; cut: boolean; bus: BusStep[]; busCut: boolean }
export interface Program { run(input?: string): RunResult }
export interface Options { /** record what the processor does over the buses (slower; for the machine view) */ bus?: boolean }
/**
 * The made-up address of the box at place `at` on the stack (0 = the bottom): 4 bytes per place, from 0x1000.
 * An int or a pointer takes one place, a long long two (8 bytes).
 * A box freed at `}` leaves its place to the next box declared, which then gets the same address.
 */
export const adresa = (at: number) => '0x' + (0x1000 + 4 * at).toString(16);

export class CppError extends Error {
  readonly isCpp = true;
  out?: string;
  trace?: Snapshot[];
  end?: Snapshot;
  cut?: boolean;
  bus?: BusStep[];
  constructor(message: string, readonly line: number, readonly kind: ErrorKind = 'compile') {
    super(message);
    this.name = 'CppError';
  }
}
const E = (msg: string, line: number, kind?: ErrorKind) => new CppError(msg, line, kind);

type TokType = 'num' | 'id' | 'op' | 'str' | 'eof';
/** `v` is the source text (or the decoded string for `str`); `n` is the value of an int `num`, `big` of a long long one. */
interface Tok { t: TokType; v: string; line: number; n?: number; big?: bigint }

const KEY = new Set(['int', 'long', 'void', 'if', 'else', 'while', 'for', 'do', 'return', 'break', 'continue', 'cin', 'cout', 'endl', 'using', 'namespace', 'std', 'main', 'nullptr']);
const NOTYPE = new Set(['float', 'double', 'char', 'string', 'bool', 'short', 'unsigned']);
/** Library functions students reach for; they get a message saying to write their own. */
const LIB = new Set(['sqrt', 'pow', 'abs', 'max', 'min', 'swap', 'floor', 'ceil', 'round', 'printf', 'scanf']);
const OPS = ['<<', '>>', '<=', '>=', '==', '!=', '&&', '||', '++', '--', '+=', '-=', '*=', '/=', '%=', '+', '-', '*', '/', '%', '<', '>', '=', '!', '(', ')', '{', '}', ';', ',', '&'];
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
      const v = src.slice(i, j), ll = /^(?:ll|LL)(?![\w])/.test(src.slice(j, j + 3));
      if (ll) j += 2;
      else if (j < n && isA(src[j])) throw E('Un nume de variabilă nu poate începe cu o cifră.', line);
      const big = BigInt(v);
      if (big > LLMAX) throw E('Numărul este prea mare chiar și pentru long long (maximum 9223372036854775807).', line);
      // A number too big for int is a long long, as in C++.
      toks.push(ll || big > INTMAX ? { t: 'num', v, big, line } : { t: 'num', v, n: Number(v), line }); i = j; continue;
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

/**
 * An expression closure. `at` is set when it names a box that can be assigned (a variable, or `*p`) and returns
 * that box's slot. `ptr` marks a pointer: its value is the slot it points to plus 1 (0 = nullptr), so the address
 * of a box never changes while the box exists. `ll` marks a long long value (a bigint), or for a pointer, that it
 * points to a long long. `nul` is the literal nullptr; `vd` is a call to a void function (the line of the call).
 */
type Expr = (() => Val) & { at?: () => number; vname?: string; ptr?: boolean; ll?: boolean; nul?: boolean; vd?: number };
/** Statement result: 0 normal, 1 break, 2 continue, 3 return. */
type Flow = 0 | 1 | 2 | 3;
type Stmt = () => Flow;
/** A type as written: int, long long or void. */
interface Ty { ll: boolean; vd: boolean }
/** A variable known at compile time: its place (`o`) in the globals or in its function's frame. */
interface Var { o: number; g: boolean; ptr: boolean; ll: boolean; name: string }
interface Param { name: string; ptr: boolean; ll: boolean }
/** A function: its header and, once its body is read, the body. `n` is how many local variables a call needs. */
interface Fn { name: string; line: number; ret: Ty; params: Param[]; body: Stmt | null; n: number; end: number; used: number }

const typeName = (ll: boolean) => ll ? 'long long' : 'int';
const toInt = (x: bigint) => Number(BigInt.asIntN(32, x));
const step = (x: Val, d: number): Val => typeof x === 'bigint' ? BigInt.asIntN(64, x + BigInt(d)) : (x + d) | 0;

export function compile(src: string, opt: Options = {}): Program {
  const { toks, inc } = lex(src);
  let p = 0, loops = 0, usingStd = false, steps = 0, outLen = 0, input = '', ip = 0, lastLine = 0;
  // Run-time memory. A box gets a slot when it is declared and gives it back at its `}`, unless its address was taken
  // (`&`): then the slot is never used again, so a pointer to a box that left the stack is still caught.
  let mem: (Val | undefined)[] = [], out: string[] = [], live: number[] = [], trace: Snapshot[] = [];
  let names: string[] = [], gl: boolean[] = [], isPtr: boolean[] = [], isLL: boolean[] = [], alive: boolean[] = [], taken: boolean[] = [];
  let callOf: number[] = [], freeSlots: number[] = [], nslots = 0;
  // Where each box sits on the stack (in places of 4 bytes). A freed box keeps its last place,
  // so a pointer to it still prints the address it had.
  let pos: number[] = [];
  // G: the slots of the globals; fr: the slots of the variables of the function call running now.
  let G: number[] = [], fr: number[] = [], calls: string[] = [], retVal: Val = 0;
  // The bus recorder. B is fixed at compile time, so a normal run builds the same closures as before and pays nothing.
  const B = !!opt.bus;
  let bus: BusStep[] = [], busCut = false, busLine = 0;
  function ev(e: BusEvent) {
    if (bus.length >= BMAX) { busCut = true; return }
    bus.push({ e, mem: live.map(s => [s, names[s], mem[s], !!isPtr[s], pos[s]]), out: outLen, line: busLine });
  }
  /** The processor brings a line of the program from memory (once, even if the line has several parts). */
  function fetch(line: number) {
    if (!B) return;
    const l = bus.at(-1)?.e;
    if (l && l.k === 'fetch' && l.line === line) return;
    busLine = line; ev({ k: 'fetch', line });
  }
  /** Puts a new box on top of the stack and returns its slot. */
  function box(name: string, ptr: boolean, ll: boolean, global: boolean): number {
    const s = freeSlots.length ? freeSlots.pop()! : nslots++, t = live.at(-1);
    names[s] = name; isPtr[s] = ptr; isLL[s] = ll && !ptr; gl[s] = global; alive[s] = true; taken[s] = false; callOf[s] = calls.length - 1;
    mem[s] = undefined;
    pos[s] = t === undefined ? 0 : pos[t] + (isLL[t] ? 2 : 1);
    live.push(s); return s;
  }
  /** Takes the boxes above height L off the stack (at a block's `}`, or when the function call `fn` ends). */
  function drop(L: number, fn?: string) {
    if (live.length <= L) return;
    const gone = live.slice(L).reverse();
    live.length = L;
    for (const s of gone) { alive[s] = false; if (!taken[s]) freeSlots.push(s) }
    if (B) ev(fn ? { k: 'free', slots: gone, fn } : { k: 'free', slots: gone });
  }
  function snap(line: number): Snapshot {
    const v: VarView[] = [];
    for (const s of live) {
      const x = mem[s], k = gl[s] ? undefined : callOf[s];
      if (!isPtr[s] || x === undefined) v.push([names[s], x, !!gl[s], undefined, k]);
      else v.push([names[s], x, !!gl[s], x === 0 ? 'nullptr' : names[(x as number) - 1] + (alive[(x as number) - 1] ? '' : ' (nu mai există)'), k]);
    }
    return { line, vars: v, out: outLen, calls: calls.slice() };
  }
  const scopes: Map<string, Var>[] = [new Map()];
  const fns = new Map<string, Fn>();
  let fnc: Fn | null = null, ngl = 0;
  const peek = () => toks[p], next = () => toks[p++];
  const isOp = (...v: string[]) => toks[p].t === 'op' && v.includes(toks[p].v);
  const isId = (v: string) => toks[p].t === 'id' && toks[p].v === v;
  const isType = (k: number) => toks[k].t === 'id' && (toks[k].v === 'int' || toks[k].v === 'long' || toks[k].v === 'void');
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
    lastLine = line;
    if (++steps > LIMIT) throw E('Programul rulează de prea mult timp. Poate ai o repetiție care nu se termină niciodată?', line, 'run');
    if (trace.length < TMAX) trace.push(snap(line));
  }
  function lookup(name: string): Var | undefined {
    for (let i = scopes.length - 1; i >= 0; i--) { const s = scopes[i].get(name); if (s !== undefined) return s }
    return undefined;
  }
  /** int, long long (or long long int) or void. */
  function typeSpec(): Ty {
    const t = next();
    if (t.v === 'int') return { ll: false, vd: false };
    if (t.v === 'void') return { ll: false, vd: true };
    if (!isId('long')) throw E('Scrie „long long” (de două ori long): așa se numește tipul pentru numere întregi mari.', t.line);
    next(); if (isId('int')) next();
    return { ll: true, vd: false };
  }
  function checkName(tok: Tok, what: string) {
    if (tok.t !== 'id') throw E('Aici trebuia un nume de ' + what + ', dar am găsit ' + show(tok) + '.', tok.line);
    if (KEY.has(tok.v) || NOTYPE.has(tok.v)) throw E('„' + tok.v + '” este un cuvânt rezervat și nu poate fi nume de ' + what + '.', tok.line);
  }
  function declare(tok: Tok, ptr: boolean, ll: boolean): Var {
    checkName(tok, 'variabilă');
    const sc = scopes[scopes.length - 1];
    if (sc.has(tok.v)) throw E((fnc && scopes.length === 2 && fnc.params.some(q => q.name === tok.v) ? '„' + tok.v + '” este deja un parametru al funcției.' : 'Variabila „' + tok.v + '” a fost deja declarată.'), tok.line);
    if (fns.has(tok.v)) throw E('„' + tok.v + '” este numele unei funcții. Alege alt nume pentru variabilă.', tok.line);
    const g = scopes.length === 1, v: Var = { o: g ? ngl++ : fnc!.n++, g, ptr, ll, name: tok.v };
    sc.set(tok.v, v); return v;
  }
  function needIO(tok: Tok) {
    if (!inc) throw E('Pentru ' + tok.v + ' trebuie să scrii la început: #include <iostream>', tok.line);
    if (!usingStd) throw E('Pentru ' + tok.v + ' trebuie să scrii la început: using namespace std;', tok.line);
  }

  // ---- expressions ----
  const slotOf = (v: Var) => { const o = v.o; return v.g ? () => G[o] : () => fr[o] };
  /** The same value as long long (`ll` true) or int: an int becomes long long as it is, a long long keeps its last 32 bits. */
  function as(e: Expr, ll: boolean): Expr {
    if (!!e.ll === ll || e.ptr) return e;
    const f: Expr = ll ? () => BigInt(e() as number) : () => toInt(e() as bigint);
    f.ll = ll; return f;
  }
  /** For a condition: 1 or 0 as an int. */
  function truth(e: Expr, t: Tok): Expr {
    noVoid(e, t);
    return e.ll ? () => (e() !== 0n ? 1 : 0) : e;
  }
  function noVoid(e: Expr, t: Tok) {
    if (e.vd) throw E('Funcția „' + e.vname + '” este void: nu întoarce nicio valoare, deci nu poate fi folosită într-un calcul sau la afișare.', e.vd || t.line);
  }
  function call(t: Tok): Expr {
    const name = t.v, line = t.line, fn = fns.get(name);
    if (!fn) {
      if (lookup(name)) throw E('„' + name + '” este o variabilă, nu o funcție.', line);
      if (LIB.has(name)) throw E('Funcția „' + name + '” din biblioteca C++ nu este disponibilă în acest caiet. Poți să îți scrii propria funcție.', line);
      throw E('Funcția „' + name + '” nu a fost scrisă mai sus. O funcție se scrie (sau măcar se anunță cu antetul ei) deasupra locului unde o folosești, de obicei deasupra lui main.', line);
    }
    expect('('); const args: Expr[] = [];
    if (!isOp(')')) do args.push(expr()); while (isOp(',') && next());
    expect(')');
    const k = fn.params.length;
    if (args.length !== k) throw E('Funcția „' + name + '” ' + (k ? 'are ' + (k === 1 ? 'un parametru' : k + ' parametri') : 'nu are parametri') + ', dar aici primește ' + (args.length === 0 ? 'zero valori' : args.length === 1 ? 'o valoare' : args.length + ' valori') + '.', line);
    const vals = args.map((a, i) => { const q = fn.params[i]; fits(q.ptr, q.ll, q.name, a, line); return as(a, q.ll) });
    if (!fn.used) fn.used = line;
    const f: Expr = () => {
      const v: Val[] = vals.map(a => a());
      const saved = fr, L = live.length, bl = busLine;
      calls.push(name); fr = new Array(fn.n);
      if (B) { fetch(fn.line); ev({ k: 'call', name, line: fn.line, n: k }) }
      for (let i = 0; i < k; i++) {
        const q = fn.params[i], s = box(q.name, q.ptr, q.ll, false); fr[i] = s;
        if (B) ev({ k: 'decl', slot: s });
        mem[s] = v[i];
        if (B) ev({ k: 'write', slot: s, v: v[i] });
      }
      tick(fn.line);
      const r = fn.body!();
      if (r !== 3 && !fn.ret.vd) throw E('Funcția „' + name + '” s-a terminat fără să întoarcă o valoare. Lipsește return.', fn.end, 'run');
      const x = retVal;
      if (B && !fn.ret.vd) { busLine = fn.end; ev({ k: 'ret', name, v: x }) }
      if (B && live.length > L) busLine = fn.end;
      drop(L, name); calls.pop(); fr = saved; busLine = bl;
      return fn.ret.vd ? 0 : x;
    };
    f.ll = fn.ret.ll; if (fn.ret.vd) { f.vd = line; f.vname = name }
    return f;
  }
  function primary(): Expr {
    const t = next();
    if (t.t === 'num') {
      if (t.big !== undefined) { const v = t.big, f: Expr = () => v; f.ll = true; return f }
      const v = t.n!; return () => v;
    }
    if (t.t === 'op' && t.v === '(') { const e = expr(); expect(')'); const f: Expr = () => e(); f.ptr = e.ptr; f.ll = e.ll; f.vd = e.vd; f.vname = e.vname; f.nul = e.nul; return f }
    if (t.t === 'id' && t.v === 'nullptr') { const f: Expr = () => 0; f.ptr = true; f.nul = true; return f }
    if (t.t === 'id') {
      if (NOTYPE.has(t.v)) throw E('Aici folosim doar numere întregi (int sau long long). „' + t.v + '” nu este disponibil.', t.line);
      if (KEY.has(t.v)) throw E('„' + t.v + '” nu poate apărea aici.', t.line);
      if (isOp('(')) return call(t);
      const v = lookup(t.v), name = t.v, line = t.line;
      if (v === undefined) throw E('Variabila „' + name + '” nu a fost declarată. Scrie mai întâi: int ' + name + ';', line);
      const at = slotOf(v);
      const f: Expr = B ? () => {
        const s = at(), x = mem[s];
        if (x === undefined) throw E('Variabila „' + name + '” este folosită înainte să primească o valoare.', line, 'run');
        ev({ k: 'read', slot: s, v: x }); return x;
      } : () => {
        const x = mem[at()];
        if (x === undefined) throw E('Variabila „' + name + '” este folosită înainte să primească o valoare.', line, 'run');
        return x;
      };
      f.at = at; f.vname = name; f.ptr = v.ptr; f.ll = v.ll; return f;
    }
    if (t.t === 'str') throw E('Textul poate fi folosit doar la afișare, după cout <<.', t.line);
    throw E('Aici trebuia un număr sau o variabilă, dar am găsit ' + show(t) + '.', t.t === 'eof' ? (toks[p - 2] || t).line : t.line);
  }
  function needVar(a: Expr, t: Tok): () => number {
    if (!a.at) throw E('„' + t.v + '” se poate aplica doar unei variabile.', t.line);
    noPtr(a, t);
    return a.at;
  }
  const PTRCALC = 'Cu pointerii nu facem calcule în acest caiet. Pentru numărul din cutia spre care arată pointerul, scrie *';
  function noPtr(a: Expr, t: Tok) {
    noVoid(a, t);
    if (a.ptr) throw E(PTRCALC + (a.vname || 'p') + '.', t.line);
  }
  /** `*p`: the box p points to. Fails at run time if p is nullptr or its box was taken off the stack. */
  function deref(t: Tok, a: Expr): Expr {
    if (!a.ptr) throw E('„*” în fața unei valori se pune doar la un pointer' + (a.vname && !a.vd ? ', iar „' + a.vname + '” este ' + typeName(!!a.ll) + '.' : '.'), t.line);
    if (a.nul) throw E('Nu poți folosi *nullptr: nullptr nu arată spre nicio cutie.', t.line);
    const line = t.line, who = a.vname ? 'pointerul „' + a.vname + '”' : 'pointerul';
    const at = () => {
      const x = a() as number;
      if (x === 0) throw E('Nu poți folosi *' + (a.vname || 'p') + ': ' + who + ' este nullptr, adică nu arată spre nicio cutie.', line, 'run');
      if (!alive[x - 1]) throw E('Cutia „' + names[x - 1] + '”, spre care arată ' + who + ', nu mai există: a fost scoasă de pe stivă' + (callOf[x - 1] > 0 ? ' la sfârșitul funcției.' : ' la „}”.'), line, 'run');
      return x - 1;
    };
    const f: Expr = () => {
      const s = at(), x = mem[s];
      if (x === undefined) throw E('Variabila „' + names[s] + '” (spre care arată ' + who + ') este folosită înainte să primească o valoare.', line, 'run');
      if (B) ev({ k: 'read', slot: s, v: x });
      return x;
    };
    f.at = at; f.vname = '*' + (a.vname || ''); f.ptr = false; f.ll = a.ll; return f;
  }
  function postfix(): Expr {
    const a = primary();
    if (isOp('++', '--')) {
      const t = next(), at = needVar(a, t), d = t.v === '++' ? 1 : -1;
      const f: Expr = B
        ? () => { const x = a(), r = step(x, d), s = at(); ev({ k: 'alu', op: d > 0 ? '+' : '-', x, y: 1, r }); mem[s] = r; ev({ k: 'write', slot: s, v: r }); return x }
        : () => { const x = a(); mem[at()] = step(x, d); return x };
      f.ll = a.ll; return f;
    }
    if (isOp('&')) throw E('Semnul & se pune în fața unei variabile, ca să îi iei adresa: &a. Pentru „și” folosește &&.', peek().line);
    return a;
  }
  function unary(): Expr {
    if (isOp('-')) {
      const t = next(), a = unary(); noPtr(a, t);
      const neg = (x: Val): Val => typeof x === 'bigint' ? BigInt.asIntN(64, -x) : (-x) | 0;
      const f: Expr = B ? () => { const x = a(), r = neg(x); ev({ k: 'alu', op: '-', x, r }); return r } : () => neg(a());
      f.ll = a.ll; return f;
    }
    if (isOp('+')) { const t = next(), a = unary(); noPtr(a, t); return a }
    if (isOp('!')) { const t = next(), a = truth(unary(), t); return B ? () => { const x = a(), r = x === 0 ? 1 : 0; ev({ k: 'alu', op: '!', x, r }); return r } : () => a() === 0 ? 1 : 0 }
    if (isOp('*')) { const t = next(); return deref(t, unary()) }
    if (isOp('&')) {
      const t = next(), a = unary();
      if (!a.at) throw E('„&” se pune în fața unei variabile, ca să îi iei adresa: &a.', t.line);
      if (a.ptr) throw E('Adresa unui pointer (pointer la pointer) nu este disponibilă în acest caiet.', t.line);
      const at = a.at, f: Expr = () => { const s = at(); taken[s] = true; return s + 1 };
      f.ptr = true; f.ll = a.ll; return f;
    }
    if (isOp('++', '--')) {
      const t = next(), a = unary(), at = needVar(a, t), d = t.v === '++' ? 1 : -1;
      const f: Expr = B
        ? () => { const v = a(), x = step(v, d), s = at(); ev({ k: 'alu', op: d > 0 ? '+' : '-', x: v, y: 1, r: x }); mem[s] = x; ev({ k: 'write', slot: s, v: x }); return x }
        : () => { const x = step(a(), d); return (mem[at()] = x) };
      f.ll = a.ll; return f;
    }
    // A cast: (long long) a or (int) a.
    if (isOp('(') && isType(p + 1)) {
      const t = next(), ty = typeSpec();
      if (ty.vd) throw E('(void) nu are rost aici: void înseamnă „nicio valoare”.', t.line);
      if (isOp('*')) throw E('Schimbarea tipului unui pointer nu este disponibilă în acest caiet.', t.line);
      expect(')');
      const a = unary(); noPtr(a, t);
      const c = as(a, ty.ll), f: Expr = () => c(); f.ll = ty.ll; return f;
    }
    return postfix();
  }
  function arith(o: string, line: number, x: Val, y: Val): Val {
    if (typeof x === 'bigint') {
      const b = y as bigint;
      switch (o) {
        case '+': return BigInt.asIntN(64, x + b);
        case '-': return BigInt.asIntN(64, x - b);
        case '*': return BigInt.asIntN(64, x * b);
        case '/': if (b === 0n) throw E('Împărțire la zero.', line, 'run'); return BigInt.asIntN(64, x / b);
        case '%': if (b === 0n) throw E('Împărțire la zero (restul împărțirii la 0 nu există).', line, 'run'); return x % b;
      }
      throw new Error('unknown operator ' + o);
    }
    const b = y as number;
    switch (o) {
      case '+': return (x + b) | 0;
      case '-': return (x - b) | 0;
      case '*': return Math.imul(x, b);
      case '/': if (b === 0) throw E('Împărțire la zero.', line, 'run'); return (x / b) | 0;
      case '%': if (b === 0) throw E('Împărțire la zero (restul împărțirii la 0 nu există).', line, 'run'); return (x % b) | 0;
    }
    throw new Error('unknown operator ' + o);
  }
  function calc(o: string, line: number, x: Val, y: Val): Val {
    switch (o) {
      case '==': return x === y ? 1 : 0;
      case '!=': return x !== y ? 1 : 0;
      case '<': return x < y ? 1 : 0;
      case '<=': return x <= y ? 1 : 0;
      case '>': return x > y ? 1 : 0;
      case '>=': return x >= y ? 1 : 0;
    }
    return arith(o, line, x, y);
  }
  function mk(t: Tok, a: Expr, b: Expr): Expr {
    const o = t.v, line = t.line;
    if (o === '||' || o === '&&') { a = truth(a, t); b = truth(b, t) }
    else if (o === '==' || o === '!=') {
      noVoid(a, t); noVoid(b, t);
      if (!!a.ptr !== !!b.ptr) throw E('Un pointer se poate compara doar cu alt pointer sau cu nullptr.', line);
      if (a.ptr && !a.nul && !b.nul && !!a.ll !== !!b.ll) throw E('Un pointer spre int și unul spre long long arată spre cutii de feluri diferite și nu se pot compara.', line);
    } else { noPtr(a, t); noPtr(b, t) }
    // An int next to a long long is turned into a long long first, as in C++.
    const L = !a.ptr && (!!a.ll || !!b.ll);
    if (L) { a = as(a, true); b = as(b, true) }
    const f: Expr = mk2(o, line, a, b, L);
    if (L && '+-*/%'.includes(o)) f.ll = true;
    return f;
  }
  function mk2(o: string, line: number, a: Expr, b: Expr, L: boolean): Expr {
    if (B) {
      const ptr = !!a.ptr || undefined;
      if (o === '||' || o === '&&') return () => {
        const x = a();
        // Short circuit: the right side is not even looked at.
        if ((x !== 0) === (o === '||')) { const r = o === '||' ? 1 : 0; ev({ k: 'alu', op: o, x, r }); return r }
        const y = b(), r = y !== 0 ? 1 : 0; ev({ k: 'alu', op: o, x, y, r }); return r;
      };
      return () => { const x = a(), y = b(), r = calc(o, line, x, y); ev({ k: 'alu', op: o, x, y, r, ptr }); return r };
    }
    switch (o) {
      case '||': return () => (a() !== 0 || b() !== 0) ? 1 : 0;
      case '&&': return () => (a() !== 0 && b() !== 0) ? 1 : 0;
      case '==': return () => a() === b() ? 1 : 0;
      case '!=': return () => a() !== b() ? 1 : 0;
      case '<': return () => a() < b() ? 1 : 0;
      case '<=': return () => a() <= b() ? 1 : 0;
      case '>': return () => a() > b() ? 1 : 0;
      case '>=': return () => a() >= b() ? 1 : 0;
    }
    if (!L && o === '+') return () => ((a() as number) + (b() as number)) | 0;
    if (!L && o === '-') return () => ((a() as number) - (b() as number)) | 0;
    return () => { const x = a(); return arith(o, line, x, b()) };
  }
  const LV = [['||'], ['&&'], ['==', '!='], ['<', '<=', '>', '>='], ['+', '-'], ['*', '/', '%']];
  function bin(l: number): Expr {
    if (l === LV.length) return unary();
    let a = bin(l + 1);
    while (isOp(...LV[l])) { const t = next(); a = mk(t, a, bin(l + 1)) }
    return a;
  }
  /** Checks that a value of `b`'s kind may be put in a box named `name` (a pointer if `ptr`, of long long if `ll`). */
  function fits(ptr: boolean, ll: boolean, name: string, b: Expr, line: number) {
    if (b.vd) throw E('Funcția „' + b.vname + '” este void: nu întoarce nicio valoare care să fie pusă în „' + name + '”.', line);
    if (ptr && !b.ptr) throw E('Pointerul „' + name + '” poate primi doar adresa unei variabile (de exemplu &a) sau nullptr, nu un număr.', line);
    if (!ptr && b.ptr) throw E('În „' + name + '” se pun numere, nu adrese. Pentru numărul din cutia spre care arată pointerul, scrie *' + (b.vname || 'p') + '.', line);
    if (ptr && !b.nul && !!b.ll !== ll) throw E('Pointerul „' + name + '” arată spre o cutie ' + typeName(ll) + ', așa că poate primi doar adresa unei variabile ' + typeName(ll) + '.', line);
  }
  function expr(): Expr {
    const a = bin(0);
    if (isOp('=', '+=', '-=', '*=', '/=', '%=')) {
      const t = next();
      if (!a.at) throw E('În stânga lui „' + t.v + '” trebuie să fie o variabilă.', t.line);
      const b0 = expr(), at = a.at, line = t.line;
      if (t.v === '=') {
        fits(!!a.ptr, !!a.ll, a.vname || '', b0, line);
        const b = as(b0, !!a.ll);
        const f: Expr = B ? () => { const v = b(), s = at(); mem[s] = v; ev({ k: 'write', slot: s, v }); return v } : () => { const v = b(); return (mem[at()] = v) };
        f.ptr = a.ptr; f.ll = a.ll; return f;
      }
      noPtr(a, t); noPtr(b0, t);
      const o = t.v[0], L = !!a.ll || !!b0.ll, x0 = as(a, L), b = as(b0, L);
      // a += b is worked out in the larger type, then put back in a's box.
      const back = !a.ll && L ? (r: Val) => toInt(r as bigint) : (r: Val) => r;
      const f: Expr = B
        ? () => { const x = x0(), y = b(), r = arith(o, line, x, y), s = at(), w = back(r); ev({ k: 'alu', op: o, x, y, r }); mem[s] = w; ev({ k: 'write', slot: s, v: w }); return w }
        : () => { const x = x0(); return (mem[at()] = back(arith(o, line, x, b()))) };
      f.ll = a.ll; return f;
    }
    return a;
  }

  // ---- statements ----
  function decl(global: boolean): Stmt {
    const line = peek().line, ty = typeSpec(), parts: [Var, Expr | null][] = [];
    if (ty.vd) throw E('void se folosește doar ca tip al unei funcții care nu întoarce nimic, nu pentru variabile.', line);
    do {
      if (isOp('&')) throw E('Referințele (int &) nu sunt disponibile în acest caiet. Folosește un pointer: int *p = &a;', peek().line);
      const ptr = isOp('*') && !!next();
      if (ptr && isOp('*')) throw E('Pointer la pointer (int **) nu este disponibil în acest caiet.', peek().line);
      const t = next(); let init: Expr | null = null;
      if (isOp('[') || peek().t === 'eof') throw E('Declarație neterminată.', t.line);
      if (!global && isOp('(')) throw E('O funcție nouă se scrie în afara lui main, deasupra lui, nu în interiorul altei funcții.', t.line);
      if (isOp('=')) { next(); init = expr(); fits(ptr, ty.ll, t.v, init, t.line); init = as(init, ty.ll) }
      parts.push([declare(t, ptr, ty.ll), init]);
    } while (isOp(',') && next());
    expect(';');
    const set = (v: Var, s: number) => { if (v.g) G[v.o] = s; else fr[v.o] = s };
    if (B) return () => {
      if (!global) { tick(line); fetch(line) }
      // The box exists first, then it gets its first value.
      for (const [v, init] of parts) {
        const s = box(v.name, v.ptr, v.ll, global); set(v, s);
        if (global && !init) mem[s] = v.ll && !v.ptr ? 0n : 0;
        ev({ k: 'decl', slot: s });
        if (init) { const x = init(); mem[s] = x; ev({ k: 'write', slot: s, v: x }) }
      }
      return 0;
    };
    return () => {
      if (!global) tick(line);
      for (const [v, init] of parts) {
        const s = box(v.name, v.ptr, v.ll, global); set(v, s);
        mem[s] = init ? init() : global ? (v.ll && !v.ptr ? 0n : 0) : undefined;
      }
      return 0;
    };
  }
  /** A block `{ ... }`. `sc` is the scope to use (a function's parameters), else a new one. */
  function block(sc?: Map<string, Var>): Stmt {
    expect('{'); if (!sc) scopes.push(new Map());
    const list: Stmt[] = [];
    while (!isOp('}')) {
      if (peek().t === 'eof') throw E('Lipsește o acoladă de închidere „}”.', toks[p - 1].line);
      list.push(stmt());
    }
    const end = next().line; scopes.pop();
    const n = list.length;
    return () => {
      const L = live.length; let r: Flow = 0;
      for (let i = 0; i < n; i++) { r = list[i](); if (r) break }
      if (B && live.length > L) busLine = end;
      drop(L); return r;
    };
  }
  function body(): Stmt {
    scopes.push(new Map()); const s = stmt(); scopes.pop();
    return () => { const L = live.length, r = s(); drop(L); return r };
  }
  function cond(): Expr { const t = expect('('); const c = truth(expr(), t); expect(')'); return c }
  function stmt(): Stmt {
    const t = peek(), line = t.line;
    if (isOp('{')) return block();
    if (isOp(';')) { next(); return () => 0 }
    if (t.t === 'id') {
      if (NOTYPE.has(t.v)) throw E('Aici folosim doar numere întregi (int sau long long). „' + t.v + '” nu este disponibil.', line);
      switch (t.v) {
        case 'int': case 'long': case 'void': return decl(false);
        case 'if': {
          next(); const c = cond(), a = body(); let b: Stmt | null = null;
          if (isId('else')) { next(); b = body() }
          return () => { tick(line); fetch(line); return c() !== 0 ? a() : (b ? b() : 0) };
        }
        case 'else': throw E('Acest „else” nu are un „if” înaintea lui.', line);
        case 'while': {
          next(); const c = cond(); loops++; const b = body(); loops--;
          return () => {
            while ((fetch(line), c() !== 0)) { tick(line); const r = b(); if (r === 1) break; if (r === 3) return 3 }
            return 0;
          };
        }
        case 'do': {
          next(); loops++; const b = body(); loops--; const wl = expectId('while').line; const c = cond(); expect(';');
          return () => {
            do { tick(line); fetch(line); const r = b(); if (r === 1) break; if (r === 3) return 3 } while ((fetch(wl), c() !== 0));
            return 0;
          };
        }
        case 'for': {
          next(); const ft = expect('('); scopes.push(new Map());
          let init: (() => unknown) | null = null, c: Expr | null = null, step: Expr | null = null;
          if (isOp(';')) next();
          else if (isType(p)) init = decl(false);
          else { init = expr(); expect(';') }
          if (!isOp(';')) c = truth(expr(), ft); expect(';');
          if (!isOp(')')) step = expr(); expect(')');
          loops++; const b = body(); loops--; scopes.pop();
          return () => {
            const L = live.length; fetch(line); if (init) init();
            while ((fetch(line), !c || c() !== 0)) {
              tick(line); const r = b();
              if (r === 1) break;
              if (r === 3) { drop(L); return 3 }
              fetch(line); if (step) step();
            }
            drop(L); return 0;
          };
        }
        case 'break': case 'continue': {
          next();
          if (!loops) throw E('„' + t.v + '” se poate folosi doar în interiorul unei repetiții (while, for, do).', line);
          expect(';'); const r: Flow = t.v === 'break' ? 1 : 2;
          return B ? () => { fetch(line); return r } : () => r;
        }
        case 'return': {
          next(); let e: Expr | null = null; const fn = fnc!;
          if (!isOp(';')) {
            if (fn.ret.vd) throw E('Funcția „' + fn.name + '” este void: nu întoarce nimic, așa că scrie doar „return;”, fără valoare.', line);
            const v = expr(); noVoid(v, t);
            if (v.ptr) throw E('Funcțiile din acest caiet întorc numere, nu adrese.', line);
            e = as(v, fn.ret.ll);
          } else if (!fn.ret.vd && fn.name !== 'main') throw E('Funcția „' + fn.name + '” trebuie să întoarcă o valoare: scrie return și valoarea, de exemplu return 0;', line);
          expect(';');
          return () => { tick(line); fetch(line); if (e) retVal = e(); return 3 };
        }
        case 'cin': {
          next(); needIO(t); const boxes: [() => number, boolean][] = [];
          if (isOp('<<')) throw E('La cin se folosește >> (nu <<).', line);
          if (!isOp('>>')) throw E('După cin trebuie să urmeze >> și o variabilă.', line);
          while (isOp('>>')) {
            next(); const vt = peek();
            if (vt.t !== 'id' && !(vt.t === 'op' && vt.v === '*')) throw E('După >> trebuie să urmeze o variabilă.', vt.line);
            const a = unary();
            if (!a.at) throw E('După >> trebuie să urmeze o variabilă.', vt.line);
            if (a.ptr) throw E('„' + a.vname + '” este un pointer: cu cin se citesc doar numere, în variabile int sau long long.', vt.line);
            boxes.push([a.at, !!a.ll]);
          }
          if (isOp('<<')) throw E('La cin se folosește >> (nu <<).', line);
          expect(';');
          if (B) return () => { tick(line); fetch(line); for (const [at, ll] of boxes) { const v = readNum(line, ll), s = at(); ev({ k: 'in', v }); mem[s] = v; ev({ k: 'write', slot: s, v }) } return 0 };
          return () => { tick(line); for (const [at, ll] of boxes) { const v = readNum(line, ll); mem[at()] = v } return 0 };
        }
        case 'cout': {
          next(); needIO(t); const items: (() => string)[] = [];
          if (isOp('>>')) throw E('La cout se folosește << (nu >>).', line);
          if (!isOp('<<')) throw E('După cout trebuie să urmeze << și ce vrei să afișezi.', line);
          while (isOp('<<')) {
            const lt = next();
            if (peek().t === 'str') { const s = next().v; items.push(() => s) }
            else if (isId('endl')) { next(); items.push(() => '\n') }
            else { const e = bin(4); noVoid(e, lt); items.push(e.ptr ? () => { const x = e() as number; return x === 0 ? '0' : adresa(pos[x - 1]) } : () => String(e())) }
          }
          if (isOp('>>')) throw E('La cout se folosește << (nu >>).', line);
          expect(';');
          return () => {
            tick(line); fetch(line);
            for (const f of items) {
              const s = f(); outLen += s.length;
              if (outLen > OUTMAX) throw E('Programul a afișat prea mult text. Poate ai o repetiție care nu se termină?', line, 'run');
              out.push(s); if (B) ev({ k: 'out', s });
            }
            return 0;
          };
        }
      }
    }
    const e = expr(); expect(';');
    return () => { tick(line); fetch(line); e(); return 0 };
  }
  function readNum(line: number, ll: boolean): Val {
    while (ip < input.length && /\s/.test(input[ip])) ip++;
    if (ip >= input.length) throw E('Programul vrea să citească un număr, dar datele de intrare s-au terminat. Scrie mai multe numere în caseta „Date de intrare”.', line, 'run');
    const m = /^[+-]?\d+/.exec(input.slice(ip, ip + 40));
    if (!m) {
      const w = /^\S+/.exec(input.slice(ip, ip + 40))![0];
      throw E('În datele de intrare am găsit „' + w + '”, dar programul aștepta un număr întreg.', line, 'run');
    }
    ip += m[0].length;
    const v = BigInt(m[0]);
    if (ll) {
      if (v > LLMAX || v < -LLMAX - 1n) throw E('Numărul ' + m[0] + ' din datele de intrare este prea mare chiar și pentru long long.', line, 'run');
      return v;
    }
    if (v > INTMAX || v < -INTMAX - 1) throw E('Numărul ' + m[0] + ' din datele de intrare nu încape într-un int (cel mult 2147483647). Pentru numere mari folosește long long.', line, 'run');
    return Number(v);
  }

  // ---- program ----
  /** A function's header and body, from its name (the type was read already). `main` is one too. */
  function func(ret: Ty, nt: Tok, isMain = false) {
    if (!isMain) checkName(nt, 'funcție');
    const name = nt.v, line = nt.line, params: Param[] = [], ps = new Map<string, Var>();
    if (!isMain && lookup(name)) throw E('„' + name + '” este deja numele unei variabile globale.', line);
    expect('(');
    if (isId('void') && toks[p + 1].v === ')') next();
    else if (!isOp(')')) do {
      if (!isType(p) || isId('void')) throw E('Aici trebuia tipul parametrului (int sau long long), dar am găsit ' + show(peek()) + '.', peek().line);
      const ty = typeSpec();
      if (isOp('&')) throw E('Parametrii prin referință (int &x) nu sunt disponibili în acest caiet. Folosește un pointer, int *x, iar la apel trimite adresa: ' + name + '(&a).', peek().line);
      const ptr = isOp('*') && !!next();
      if (ptr && isOp('*')) throw E('Pointer la pointer (int **) nu este disponibil în acest caiet.', peek().line);
      let pn = '';
      if (peek().t === 'id') { checkName(peek(), 'parametru'); pn = next().v }
      else if (!isOp(',', ')')) throw E('Aici trebuia numele parametrului, dar am găsit ' + show(peek()) + '.', peek().line);
      if (pn && params.some(q => q.name === pn)) throw E('Funcția „' + name + '” are deja un parametru numit „' + pn + '”.', line);
      params.push({ name: pn, ptr, ll: ty.ll });
    } while (isOp(',') && next());
    expect(')');
    const same = (f: Fn) => f.ret.ll === ret.ll && f.ret.vd === ret.vd && f.params.length === params.length && f.params.every((q, i) => q.ptr === params[i].ptr && q.ll === params[i].ll);
    let fn = fns.get(name);
    if (fn && !same(fn)) throw E('Antetul funcției „' + name + '” nu se potrivește cu cel scris mai sus. Aici două funcții nu pot avea același nume.', line);
    if (!fn) { fn = { name, line, ret, params, body: null, n: 0, end: line, used: 0 }; fns.set(name, fn) }
    if (isOp(';')) { next(); return }  // only the header: the body comes later
    if (fn.body) throw E('Funcția „' + name + '” este deja scrisă mai sus.', line);
    if (!isOp('{')) expect('{');
    fn.params = params; fn.line = line; fn.n = 0; fnc = fn; loops = 0;
    scopes.push(ps);
    for (const q of params) {
      if (!q.name) throw E('Fiecare parametru al funcției „' + name + '” are nevoie de un nume.', line);
      declare({ t: 'id', v: q.name, line }, q.ptr, q.ll);
    }
    fn.body = block(ps);
    fn.end = toks[p - 1].line; fnc = null;
  }

  const globals: Stmt[] = [];
  while (peek().t !== 'eof') {
    const t = peek();
    if (isId('using')) { next(); expectId('namespace'); expectId('std'); expect(';'); usingStd = true; continue }
    if (isType(p)) {
      const save = p, ty = typeSpec(), star = isOp('*');
      const nt = toks[p + (star ? 1 : 0)];
      if (nt.t === 'id' && toks[p + (star ? 2 : 1)].v === '(' && toks[p + (star ? 2 : 1)].t === 'op') {
        if (nt.v === 'main') {
          if (ty.vd || ty.ll || star) throw E('Scrie „int main()”.', t.line);
          if (fns.has('main')) throw E('Programul are deja un main.', t.line);
          next(); func(ty, nt, true);
          const m = fns.get('main')!;
          if (m.params.length) throw E('Aici main nu primește parametri: scrie „int main()”.', t.line);
          if (!m.body) throw E('main are nevoie de un corp între acolade.', t.line);
          continue;
        }
        if (star) throw E('O funcție din acest caiet întoarce un număr (int sau long long) sau nimic (void), nu un pointer.', t.line);
        next(); func(ty, nt); continue;
      }
      p = save; globals.push(decl(true)); continue;
    }
    if (t.t === 'id' && NOTYPE.has(t.v)) throw E('Aici folosim doar numere întregi (int sau long long). „' + t.v + '” nu este disponibil.', t.line);
    if (isId('main')) throw E('Înainte de main trebuie scris int: int main()', t.line);
    throw E('Nu înțeleg ' + show(t) + ' aici. Instrucțiunile se scriu în interiorul lui main, între acolade.', t.line);
  }
  const main = fns.get('main');
  if (!main) throw E('Programul nu are „int main()”. De acolo începe rularea.', toks[toks.length - 1].line);
  for (const f of fns.values())
    if (!f.body && f.used) throw E('Funcția „' + f.name + '” are doar antetul (prima linie), fără corpul cu instrucțiunile ei.', f.used);
  const entry = main;

  return {
    run(inp?: string): RunResult {
      mem = []; names = []; gl = []; isPtr = []; isLL = []; alive = []; taken = []; callOf = []; pos = []; freeSlots = []; nslots = 0;
      G = new Array(ngl); fr = []; calls = []; retVal = 0;
      steps = 0; out = []; outLen = 0; input = String(inp || ''); ip = 0; live = []; trace = []; bus = []; busCut = false; busLine = 0; lastLine = 0;
      try {
        for (const g of globals) g();
        calls = ['main']; fr = new Array(entry.n);
        entry.body!();
      } catch (e) {
        // Calls nested too deep fill the browser's own stack (after a few hundred to a few thousand calls).
        const x = e instanceof RangeError ? E('Prea multe apeluri de funcții unul în altul: caietul poate ține pe stivă doar câteva sute de apeluri deodată. Poate funcția se apelează pe ea însăși fără să se oprească?', lastLine, 'run') : e;
        if (x instanceof CppError) { x.out = out.join(''); x.trace = trace; x.end = snap(x.line); x.cut = steps > trace.length; x.bus = bus }
        throw x;
      }
      return { out: out.join(''), steps, trace, end: snap(0), cut: steps > trace.length, bus, busCut };
    },
  };
}
