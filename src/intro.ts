// The intro: small programs the processor walks through step by step, plus quiz questions about
// variables and assignment. Data only, no DOM; tests check every step against the interpreter.

/** One step of the processor. `decl` takes a new box, `set` puts a number in a box, `read` lists the boxes it looks into. */
export interface Pas { line: number; say: string; cpu?: string; read?: string[]; decl?: string; set?: [string, number] }
export interface Demo { name: string; lines: string[]; steps: Pas[] }
/** What the memory holds after a step: box name -> value (undefined = taken, still empty), in the order the boxes were taken. */
export type Memorie = [name: string, value: number | undefined][];

export const DEMOS: Demo[] = [
  {
    name: 'Cutii și atribuiri',
    lines: ['int a;', 'a = 5;', 'int b = a + 2;', 'a = a + 1;', 'b = a * b;'],
    steps: [
      { line: 0, decl: 'a', say: 'Procesorul ia o cutie liberă din memorie și scrie pe ea „a”. Cutia e încă goală.' },
      { line: 1, cpu: '5', set: ['a', 5], say: 'În dreapta semnului = este 5. Procesorul pune 5 în cutia a.' },
      { line: 2, decl: 'b', cpu: 'a + 2', say: 'Întâi ia o cutie nouă, „b”. Apoi trebuie să calculeze a + 2.' },
      { line: 2, read: ['a'], cpu: '5 + 2 = 7', say: 'Se uită în cutia a și găsește 5. Calculează 5 + 2 = 7.' },
      { line: 2, set: ['b', 7], cpu: '7', say: 'Pune rezultatul, 7, în cutia b.' },
      { line: 3, read: ['a'], cpu: '5 + 1 = 6', say: 'La matematică, a = a + 1 ar fi imposibil. Aici înseamnă: citește a (5) și adună 1.' },
      { line: 3, set: ['a', 6], cpu: '6', say: 'Pune 6 în cutia a. Numărul 5 dispare: o cutie ține un singur număr.' },
      { line: 4, read: ['a', 'b'], cpu: '6 * 7 = 42', say: 'Citește a (6) și b (7). Calculează 6 * 7 = 42.' },
      { line: 4, set: ['b', 42], cpu: '42', say: 'Pune 42 în cutia b. Gata! Valorile de la sfârșit sunt a = 6 și b = 42.' },
    ],
  },
  {
    name: 'Schimbare greșită',
    lines: ['int x = 3, y = 8;', 'x = y;', 'y = x;'],
    steps: [
      { line: 0, decl: 'x', set: ['x', 3], cpu: '3', say: 'Ia cutia x și pune în ea 3.' },
      { line: 0, decl: 'y', set: ['y', 8], cpu: '8', say: 'Ia cutia y și pune în ea 8. Vrem să schimbăm numerele între ele.' },
      { line: 1, read: ['y'], cpu: '8', say: 'x = y: procesorul citește y și găsește 8.' },
      { line: 1, set: ['x', 8], cpu: '8', say: 'Pune 8 în cutia x. Atenție: 3 s-a pierdut pentru totdeauna!' },
      { line: 2, read: ['x'], cpu: '8', say: 'y = x: citește x. Acum în x este 8, nu 3.' },
      { line: 2, set: ['y', 8], cpu: '8', say: 'Pune 8 în y. Ambele cutii au 8. Schimbarea n-a mers — vezi cum se face corect.' },
    ],
  },
  {
    name: 'Schimbare cu aux',
    lines: ['int x = 3, y = 8, aux;', 'aux = x;', 'x = y;', 'y = aux;'],
    steps: [
      { line: 0, decl: 'x', set: ['x', 3], cpu: '3', say: 'Ia cutia x și pune în ea 3.' },
      { line: 0, decl: 'y', set: ['y', 8], cpu: '8', say: 'Ia cutia y și pune în ea 8.' },
      { line: 0, decl: 'aux', say: 'Ia încă o cutie, „aux”, goală. E ca un al treilea pahar când vrei să schimbi sucurile din două pahare.' },
      { line: 1, read: ['x'], set: ['aux', 3], cpu: '3', say: 'aux = x: copiază 3 din x în aux. Acum 3 e păstrat la loc sigur.' },
      { line: 2, read: ['y'], set: ['x', 8], cpu: '8', say: 'x = y: pune 8 în x. Nu-i nimic că 3 dispare din x — îl avem în aux.' },
      { line: 3, read: ['aux'], set: ['y', 3], cpu: '3', say: 'y = aux: pune 3 în y. Gata: x = 8 și y = 3, s-au schimbat!' },
    ],
  },
];

/** The memory after the first `upto` steps of a demo (0 = empty memory). */
export function memorie(d: Demo, upto: number): Memorie {
  const m: Memorie = [];
  for (const s of d.steps.slice(0, upto)) {
    if (s.decl) m.push([s.decl, undefined]);
    if (s.set) { const c = m.find(v => v[0] === s.set![0]); if (c) c[1] = s.set[1] }
  }
  return m;
}

export interface Intrebare { code: string; ask: string; options: number[]; ok: number; why: string }

export const INTREBARI: Intrebare[] = [
  {
    code: 'int x = 3;\nint y = x;\nx = 10;', ask: 'Ce număr este în y la sfârșit?', options: [3, 10, 13], ok: 0,
    why: 'y = x copiază numărul 3 în cutia y. Când x primește mai târziu 10, cutia y nu se schimbă.',
  },
  {
    code: 'int n = 4;\nn = n * 2;\nn = n + 1;', ask: 'Ce număr este în n la sfârșit?', options: [4, 8, 9], ok: 2,
    why: 'Întâi n primește 4 * 2 = 8, apoi 8 + 1 = 9. De fiecare dată, numărul vechi din cutie e înlocuit.',
  },
  {
    code: 'int a = 2, b = 7;\na = b;\nb = a;', ask: 'Ce număr este în b la sfârșit?', options: [2, 7], ok: 1,
    why: 'După a = b, în a este 7. Apoi b = a pune tot 7 în b. Numărul 2 s-a pierdut, de aceea ai nevoie de o a treia cutie.',
  },
];
