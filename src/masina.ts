// The machine view: what goes through the processor, the memory and the buses between them while a program runs.
// Turns the interpreter's bus events into frames with Romanian sentences. Data only, no DOM.
import { adresa, compile, CppError, type Box, type BusStep } from './interp.js';

const H = '#include <iostream>\nusing namespace std;\n\nint main() {\n', F = '    return 0;\n}\n';
const prog = (lines: string[]) => H + lines.map(l => '    ' + l + '\n').join('') + F;

/** Short programs to watch in the machine view. */
export const MASINI: { name: string; code: string; inp: string }[] = [
  { name: 'Suma a două numere', inp: '12 30', code: prog(['int a, b, s;', 'cin >> a >> b;', 's = a + b;', 'cout << s;']) },
  { name: 'Atribuiri', inp: '', code: prog(['int a = 5;', 'int b = a + 2;', 'a = a * b;', 'cout << a;']) },
  { name: 'O repetiție', inp: '', code: prog(['int s = 0;', 'for (int i = 1; i <= 3; i++) {', '    s = s + i;', '}', 'cout << s;']) },
  { name: 'Pointerul', inp: '', code: prog(['int a = 5;', 'int *p = &a;', '*p = *p + 1;', 'cout << a;']) },
];

/** A box of memory as drawn: its address, name, value as text (a pointer shows an address). */
export interface Celula { slot: number; adr: string; name: string; val: string; gol: boolean; ptr: boolean }
/**
 * One frame of the machine view. `adr`, `cmd` and `date` are what the address, control and data buses carry
 * (`spre` says where the data goes); `io` is a trip between the processor and the keyboard (`in`) or the screen (`out`).
 * `cell` is the box the step touches; `freed` are the boxes let go at a `}`. `reg` is the last number that went through
 * the processor, `ual` the calculation it just did. `out` is how much was printed, `cin` how many numbers were read.
 */
export interface Cadru {
  fel: BusStep['e']['k'] | 'end';
  say: string; line: number; instr: string;
  adr?: string; cmd?: 'citește' | 'scrie'; date?: string; spre?: 'cpu' | 'mem';
  io?: 'in' | 'out'; ioText?: string;
  ual?: string; reg: string;
  mem: Celula[]; cell?: number; freed: Celula[];
  out: number; cin: number;
}
export interface Masina { cadre: Cadru[]; lines: string[]; out: string; err?: CppError; cut: boolean }

/** The address of box `slot` (the same made-up address cout shows for a pointer to it). */
export const adr = (slot: number) => adresa(slot + 1);
const val = (v: number | undefined, ptr: boolean) => v === undefined ? 'goală' : ptr ? (v === 0 ? 'nullptr' : adresa(v)) : String(v);
const celula = ([slot, name, v, ptr]: Box): Celula => ({ slot, adr: adr(slot), name, val: val(v, ptr), gol: v === undefined, ptr });
const text = (s: string) => s === '\n' ? 'rând nou (endl)' : '„' + s + '”';
const OP: Record<string, string> = { '/': ' (câtul)', '%': ' (restul)' };

/** Runs `src` on `input` and turns what the processor did into frames. A compile error gives no frames, only `err`. */
export function masina(src: string, input: string): Masina {
  const lines = src.split('\n');
  let steps: BusStep[], out: string, err: CppError | undefined, cut = false;
  try {
    const r = compile(src, { bus: true }).run(input);
    steps = r.bus; out = r.out; cut = r.busCut;
  } catch (e) {
    if (!(e instanceof CppError)) throw e;
    err = e; steps = e.bus || []; out = e.out || '';
    if (e.kind === 'compile') return { cadre: [], lines, out, err, cut };
  }
  const cadre: Cadru[] = [];
  let reg = '', cin = 0, prev: Box[] = [];
  steps.forEach((st, i) => {
    const e = st.e, mem = st.mem.map(celula), box = (s: number) => st.mem.find(b => b[0] === s) || prev.find(b => b[0] === s);
    const name = (s: number) => box(s)?.[1] || '?';
    const instr = (lines[st.line - 1] || '').trim();
    const c: Cadru = { fel: e.k, say: '', line: st.line, instr, reg, mem, freed: [], out: st.out, cin };
    switch (e.k) {
      case 'fetch':
        c.adr = 'linia ' + e.line; c.cmd = 'citește'; c.date = instr; c.spre = 'cpu';
        c.say = 'Procesorul aduce din memorie linia ' + e.line + ' a programului: pe magistrala de adrese trimite „linia ' + e.line
          + '”, pe cea de comandă „citește”. Memoria îi trimite înapoi, pe magistrala de date, instrucțiunea.';
        break;
      case 'decl': {
        const b = box(e.slot)!;
        c.cell = e.slot;
        c.say = 'În memorie se pregătește o cutie pentru ' + (b[3] ? 'pointerul ' : '') + b[1] + ', la adresa ' + adr(e.slot) + '. '
          + (b[2] === undefined ? 'Deocamdată e goală.' : 'E o variabilă globală, așa că primește 0.');
        break;
      }
      case 'read': {
        const b = box(e.slot)!, v = val(e.v, b[3]);
        c.adr = adr(e.slot); c.cmd = 'citește'; c.date = v; c.spre = 'cpu'; c.cell = e.slot; c.reg = reg = v;
        c.say = 'Procesorul are nevoie de ' + b[1] + '. Trimite adresa ' + adr(e.slot) + ' și comanda „citește”. Memoria îi răspunde cu '
          + v + (b[3] && e.v ? ', adresa cutiei ' + name(e.v - 1) : '') + '.';
        break;
      }
      case 'write': {
        const b = box(e.slot)!, v = val(e.v, b[3]), old = prev.find(x => x[0] === e.slot)?.[2];
        c.adr = adr(e.slot); c.cmd = 'scrie'; c.date = v; c.spre = 'mem'; c.cell = e.slot; c.reg = reg = v;
        c.say = 'Procesorul pune ' + v + ' în ' + b[1] + ': trimite adresa ' + adr(e.slot) + ', comanda „scrie” și, pe magistrala de date, '
          + (b[3] ? 'adresa ' + v + (e.v ? ' (a lui ' + name(e.v - 1) + ')' : '') : 'numărul ' + v) + '.'
          + (old !== undefined && old !== e.v ? ' Ce era înainte în cutie, ' + val(old, b[3]) + ', se pierde.' : '');
        break;
      }
      case 'alu': {
        const f = (x: number) => e.ptr ? adresa(x) : String(x);
        c.reg = reg = String(e.r);
        if (e.op === '-' && e.y === undefined) { c.ual = '-(' + e.x + ') = ' + e.r; c.say = 'Unitatea de calcul (UAL) din procesor schimbă semnul: ' + c.ual + '.'; break }
        if (e.op === '!') { c.ual = '!' + e.x + ' = ' + e.r; c.say = 'UAL face „nu” (!): ' + c.ual + '. Ce era adevărat devine fals și invers.'; break }
        if (e.y === undefined) {
          c.ual = e.x + ' ' + e.op + ' … = ' + e.r;
          c.say = 'Partea din stânga lui ' + e.op + ' este ' + (e.r ? 'adevărată' : 'falsă') + ', așa că UAL știe deja rezultatul, ' + e.r + ', fără să se mai uite la partea din dreapta.';
          break;
        }
        c.ual = f(e.x) + ' ' + e.op + ' ' + f(e.y) + ' = ' + e.r;
        if (['==', '!=', '<', '<=', '>', '>='].includes(e.op))
          c.say = 'UAL compară: ' + f(e.x) + ' ' + e.op + ' ' + f(e.y) + ' este ' + (e.r ? 'adevărat' : 'fals') + ', deci rezultatul e ' + e.r + '.';
        else if (e.op === '&&' || e.op === '||')
          c.say = 'UAL face „' + (e.op === '&&' ? 'și' : 'sau') + '” (' + e.op + '): ' + (e.op === '&&' ? 'ambele părți trebuie să fie adevărate' : 'ajunge ca una să fie adevărată') + '. Rezultatul e ' + e.r + '.';
        else c.say = 'Unitatea de calcul (UAL) din procesor face ' + c.ual + (OP[e.op] || '') + '. Calculul se face în procesor, fără drum la memorie.';
        break;
      }
      case 'in':
        c.io = 'in'; c.ioText = String(e.v); c.reg = reg = String(e.v); c.cin = ++cin;
        c.say = 'cin: procesorul ia de la tastatură următorul număr din datele de intrare: ' + e.v + '. Acum trebuie să-l pună în memorie.';
        break;
      case 'out':
        c.io = 'out'; c.ioText = e.s === '\n' ? '↵' : e.s;
        c.say = 'cout: procesorul trimite la ecran ' + text(e.s) + '.' + (e.s === '\n' ? ' Ce se afișează de acum apare pe rândul următor.' : '');
        break;
      case 'free':
        c.freed = e.slots.map(s => celula(box(s)!));
        c.say = !st.mem.length && i === steps.length - 1
          ? 'La „}” se termină main, deci și programul: toate cutiile sunt eliberate.'
          : 'La „}” se termină blocul. ' + (e.slots.length > 1 ? 'Cutiile ' + e.slots.map(name).join(', ') + ' sunt eliberate' : 'Cutia lui ' + name(e.slots[0]) + ' este eliberată')
            + ': nu mai pot fi folosite, iar locul lor poate fi refolosit.';
        break;
    }
    prev = st.mem; cadre.push(c);
  });
  const last = steps.at(-1);
  cadre.push({
    fel: 'end', line: err ? err.line : 0, instr: err ? (lines[err.line - 1] || '').trim() : '', reg, cin, freed: [],
    mem: (last?.mem || []).map(celula), out: out.length,
    say: err ? 'Eroare la rulare, linia ' + err.line + ': ' + err.message
      : cut ? 'Programul are mulți pași: aici se pot urmări doar primii ' + steps.length + '. Pe ecran vezi tot ce a afișat.'
        : 'Gata! Programul s-a terminat. Pe ecran a rămas ce a afișat.',
  });
  return { cadre, lines, out, err, cut };
}
