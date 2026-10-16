// The intro: small programs the processor walks through step by step, plus quiz questions about
// variables, assignment, the stack and pointers. Data only, no DOM; tests check every step against the interpreter.

/**
 * One step of the processor. `decl` takes a new box on top of the stack, `set` puts a number in a box (or, for a
 * pointer, the name of the box it points to),
 * `read` lists the boxes it looks into, `free` takes boxes off the top of the stack (at the `}` of a block).
 */
export interface Pas { line: number; say: string; cpu?: string; read?: string[]; decl?: string; set?: [string, number | string]; free?: string[] }
export interface Demo { name: string; lines: string[]; steps: Pas[] }
/** What the stack holds after a step: box name -> value (undefined = taken, still empty; a string = a pointer to that box), bottom first. */
export type Memorie = [name: string, value: number | string | undefined][];

export const DEMOS: Demo[] = [
  {
    name: 'Cutii și atribuiri',
    lines: ['int a;', 'a = 5;', 'int b = a + 2;', 'a = a + 1;', 'b = a * b;'],
    steps: [
      { line: 0, decl: 'a', say: 'Procesorul pune pe stivă o cutie nouă și scrie pe ea „a”. E prima, așa că stă jos. Cutia e încă goală.' },
      { line: 1, cpu: '5', set: ['a', 5], say: 'a = 5 nu pune o cutie nouă pe stivă. Procesorul găsește cutia a (cutia 1) și pune 5 în ea.' },
      { line: 2, decl: 'b', cpu: 'a + 2', say: 'Întâi pune pe stivă o cutie nouă, „b”, deasupra lui a. Apoi trebuie să calculeze a + 2.' },
      { line: 2, read: ['a'], cpu: '5 + 2 = 7', say: 'Se uită în cutia a și găsește 5. Calculează 5 + 2 = 7.' },
      { line: 2, set: ['b', 7], cpu: '7', say: 'Pune rezultatul, 7, în cutia b.' },
      { line: 3, read: ['a'], cpu: '5 + 1 = 6', say: 'La matematică, a = a + 1 ar fi imposibil. Aici înseamnă: citește a (5) și adună 1.' },
      { line: 3, set: ['a', 6], cpu: '6', say: 'Pune 6 în aceeași cutie a, jos pe stivă: 5 dispare, o cutie ține un singur număr. Stiva nu crește, atribuirea doar schimbă numărul din cutie.' },
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
  {
    name: 'Stiva și blocurile',
    lines: ['int a = 2;', '{', '    int b = a * 3;', '    int c = b + 1;', '    a = c;', '}', 'int d = a + 1;'],
    steps: [
      { line: 0, decl: 'a', set: ['a', 2], cpu: '2', say: 'Ia prima cutie, cea de jos, și pune în ea 2. Cutiile se pun una peste alta, ca farfuriile într-un teanc: asta e stiva.' },
      { line: 1, say: 'Acolada { deschide un bloc. Procesorul ține minte cât de înaltă e stiva acum: o cutie.' },
      { line: 2, decl: 'b', cpu: 'a * 3', say: 'Ia cutia de deasupra lui a și scrie pe ea „b”. Cutia nouă ajunge mereu în vârful stivei.' },
      { line: 2, read: ['a'], set: ['b', 6], cpu: '2 * 3 = 6', say: 'Citește a (2), calculează 2 * 3 = 6 și pune 6 în b.' },
      { line: 3, decl: 'c', read: ['b'], set: ['c', 7], cpu: '6 + 1 = 7', say: 'Pune cutia c deasupra lui b, apoi pune în ea 6 + 1 = 7. Stiva are acum trei cutii.' },
      { line: 4, read: ['c'], set: ['a', 7], cpu: '7', say: 'a = c: pune 7 în a. Din bloc poți folosi și cutiile de dedesubt, cum e a.' },
      { line: 5, free: ['c', 'b'], say: 'Acolada } închide blocul. Cutiile luate în bloc sunt scoase din vârf: întâi c, apoi b. De aici nu mai poți scrie b sau c.' },
      { line: 6, decl: 'd', read: ['a'], set: ['d', 8], cpu: '7 + 1 = 8', say: 'Cutia d se pune deasupra lui a, unde a fost b. Iar a a rămas 7: ce s-a schimbat în bloc se păstrează.' },
    ],
  },
  {
    name: 'Pointerul',
    lines: ['int a = 5;', 'int *p = &a;', '*p = 6;', 'int b = *p + 1;', 'p = &b;', '*p = *p * 2;'],
    steps: [
      { line: 0, decl: 'a', set: ['a', 5], cpu: '5', say: 'Pune pe stivă cutia a, care e cutia 1, și pune 5 în ea.' },
      { line: 1, decl: 'p', set: ['p', 'a'], cpu: '&a = cutia 1', say: 'Pune deasupra cutia p. &a înseamnă adresa lui a: numărul cutiei lui, 1. În p se păstrează adresa, nu 5. Spunem că p arată spre a.' },
      { line: 2, read: ['p'], set: ['a', 6], cpu: '6', say: '*p înseamnă „cutia spre care arată p”. Procesorul se uită în p, vede cutia 1 și pune 6 acolo. Am schimbat a fără să scriem a!' },
      { line: 3, decl: 'b', cpu: '*p + 1', say: 'Pune pe stivă cutia b. Apoi calculează *p + 1.' },
      { line: 3, read: ['p', 'a'], set: ['b', 7], cpu: '6 + 1 = 7', say: 'Se uită în p, merge în cutia a, găsește 6. Pune 6 + 1 = 7 în b.' },
      { line: 4, set: ['p', 'b'], cpu: '&b = cutia 3', say: 'p = &b: acum în p e adresa lui b, cutia 3. a rămâne 6, doar săgeata s-a mutat.' },
      { line: 5, read: ['p', 'b'], set: ['b', 14], cpu: '7 * 2 = 14', say: '*p = *p * 2: citește cutia spre care arată p (b, unde e 7) și pune înapoi 7 * 2 = 14. Gata: a = 6, b = 14.' },
    ],
  },
];

/** The memory after the first `upto` steps of a demo (0 = empty memory). */
export function memorie(d: Demo, upto: number): Memorie {
  const m: Memorie = [];
  for (const s of d.steps.slice(0, upto)) {
    if (s.free) for (const f of s.free) if (m.at(-1)?.[0] === f) m.pop();
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
  {
    code: 'int a = 1;\n{\n    int b = a + 4;\n    a = b;\n}', ask: 'Ce număr este în a la sfârșit?', options: [1, 4, 5], ok: 2,
    why: 'b este scoasă de pe stivă la }, dar a stă sub ea și rămâne. Înainte de }, a primise numărul din b, adică 5.',
  },
  {
    code: 'int a = 3;\nint *p = &a;\n*p = 9;', ask: 'Ce număr este în a la sfârșit?', options: [3, 9], ok: 1,
    why: 'p arată spre a, deci *p este chiar cutia a. *p = 9 pune 9 în a.',
  },
];
