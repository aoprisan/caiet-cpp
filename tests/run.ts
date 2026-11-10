// Run with: npm test   (or: just test)
import assert from 'node:assert/strict';
import { compile, CppError } from '../src/interp.js';
import { explain } from '../src/explain.js';
import { note, matches, same, verifica, blocuri, pentruPbinfo, type Problema } from '../src/probleme.js';
import { DEMOS, INTREBARI, memorie } from '../src/intro.js';
import { MASINI, masina } from '../src/masina.js';
import { schimbare, spune } from '../src/stiva.js';
import { LECTII, html } from '../src/lectii.js';

const H = '#include <iostream>\nusing namespace std;\nint main(){\n', F = '\nreturn 0;}';
const out = (body: string, inp?: string) => compile(H + body + F).run(inp || '').out;
function err(src: string, inp?: string): CppError {
  try { compile(src).run(inp || '') } catch (e) { if (e instanceof CppError) return e; throw e }
  assert.fail('expected an error');
}
let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok  ' + name) };

t('arithmetic, cin, cout', () => assert.equal(out('int a,b;cin>>a>>b;cout<<"S "<<a+b*2<<endl<<a/b<<\' \'<<a%b;', '17 -5'), 'S 7\n-3 2'));
t('while + compound assignment', () => assert.equal(out('int n,s=0;cin>>n;while(n>0){s+=n%10;n/=10;}cout<<s;', '2026'), '10'));
t('for, break, continue, logic', () => assert.equal(out('int c=0;for(int i=1;i<=20;i++){if(i%2==0)continue;if(i>15)break;c++;}cout<<c<<" "<<(3<4&&!(2>=5)||0);'), '8 1'));
t('do-while, ++ prefix/postfix', () => assert.equal(out('int i=0;do{i++;}while(i<5);int j=i++ + ++i;cout<<i<<" "<<j;'), '7 12'));
t('if/else and block scope', () => assert.equal(out('int a=5;if(a>3)cout<<"da";else cout<<"nu";{int a=2;cout<<a;}cout<<a;'), 'da25'));
t('uninitialised variable is a runtime error', () => { const e = err(H + 'int a;cout<<a;' + F); assert.equal(e.kind, 'run'); assert.equal(e.line, 4) });
t('missing semicolon reports the line it belongs to', () => { const e = err(H + 'int a;\ncin>>a\ncout<<a;' + F, '1'); assert.equal(e.kind, 'compile'); assert.equal(e.line, 5) });
t('division by zero', () => assert.equal(err(H + 'int a;cin>>a;cout<<10/a;' + F, '0').kind, 'run'));
t('input exhausted', () => assert.equal(err(H + 'int a;cin>>a>>a;' + F, '5').kind, 'run'));
t('infinite loop is stopped', () => assert.equal(err(H + 'while(1){}' + F).kind, 'run'));
t('undeclared variable', () => assert.equal(err(H + 'x=3;' + F).kind, 'compile'));
t('non-int types rejected', () => assert.equal(err(H + 'float x;' + F).kind, 'compile'));
t('cout needs #include <iostream>', () => assert.equal(err('int main(){cout<<1;}').line, 1));
t('errors carry partial output and trace', () => {
  const e = err(H + 'cout<<"a";\nint x;\ncout<<x;' + F);
  assert.equal(e.out, 'a');
  assert.ok(e.trace && e.trace.length > 0);
  assert.equal(e.end?.line, 6);
});
t('trace records variables per step', () => {
  const r = compile(H + 'int s=0;\nfor(int i=1;i<=2;i++){\ns+=i;\n}' + F).run('');
  const last = r.trace[r.trace.length - 1];
  assert.deepEqual(last.vars.map(v => v[0] + '=' + v[1]), ['s=3']);
  assert.ok(r.trace.some(s => s.vars.some(v => v[0] === 'i' && v[1] === 2)));
});
t('pointers: &, *, nullptr, comparison', () => {
  assert.equal(out('int a = 5;\nint *p = &a;\n*p = 6;\ncout << a << " " << *p;'), '6 6');
  assert.equal(out('int a = 1, b = 2;\nint *p = &a, *q = &b;\ncout << (p == q);\nq = p;\n*q = *q + 10;\ncout << (p == q) << a;'), '0111');
  assert.equal(out('int* p = nullptr;\nint a = 3;\nif (p == nullptr) p = &a;\nif (p) cout << *p * 2;'), '6');
  assert.equal(out('int a, b;\nint *p = &a, *q = &b;\ncout << p << " " << q << " " << nullptr;'), '0x1000 0x1004 0');
  assert.equal(out('int x;\nint *p = &x;\ncin >> x;\ncout << *p;', '9'), '9');
});
t('pointers: an address is a place on the stack, taken again after }', () => {
  // d takes the place b had; a pointer to b still prints that address.
  assert.equal(out('int a = 1;\nint *p = &a;\n{\nint b = 2;\np = &b;\ncout << p << " ";\n}\nint d = 3;\ncout << &d << " " << p << " " << &a;'), '0x1008 0x1008 0x1008 0x1000');
  assert.equal(out('int *p;\nfor (int i = 0; i < 2; i++) {\nint t = i;\np = &t;\ncout << p << " ";\n}'), '0x1008 0x1008 ');
});
t('pointers: the stepper shows where they point', () => {
  const r = compile(H + 'int a = 1;\nint *p;\nint *q = nullptr;\np = &a;\n{\nint b = 2;\nq = &b;\n}\ncout << a;' + F).run('');
  const last = r.trace.at(-2)!.vars.map(v => v[0] + ':' + (v[3] ?? v[1]));
  assert.deepEqual(last, ['a:1', 'p:a', 'q:b (nu mai există)']);
  assert.deepEqual(r.trace[3].vars.map(v => v[3] ?? v[1]), [1, undefined, 'nullptr']);
});
t('pointers: run-time errors', () => {
  for (const [body, re] of [
    ['int *p = nullptr;\ncout << *p;', /nullptr/],
    ['int *p;\n{\nint b = 2;\np = &b;\n}\ncout << *p;', /scoasă de pe stivă/],
    ['int a;\nint *p = &a;\ncout << *p;', /înainte să primească o valoare/],
  ] as const) {
    const e = err(H + body + F);
    assert.equal(e.kind, 'run', body); assert.match(e.message, re, body);
  }
});
t('pointers: friendly compile errors', () => {
  for (const [body, re] of [
    ['int a;\nint *p = 5;', /doar adresa unei variabile/],
    ['int a = 1;\nint *p = &a;\nint b = p;', /scrie \*p/],
    ['int a = 1;\nint *p = &a;\np = p + 1;', /calcule/],
    ['int a = 1;\nint *p = &a;\np++;', /calcule/],
    ['int a = 1;\ncout << *a;', /„a” este int/],
    ['int a = 1;\nint *p = &a;\nint **q;', /pointer la pointer/i],
    ['int a = 1;\nint &r = a;', /Referințele/],
    ['int a = 1, b = 3;\ncout << (a & b);', /&&/],
    ['int a = 1;\nint *p = &a;\ncout << (p == a);', /alt pointer sau cu nullptr/],
    ['int *p;\ncin >> p;', /cin/],
    ['int a = 1;\ncout << &5;', /în fața unei variabile/],
  ] as const) {
    const e = err(H + body + F);
    assert.equal(e.kind, 'compile', body); assert.match(e.message, re, body);
  }
});
t('explain: cin, for, modulo note', () => {
  assert.match(explain('cin >> a >> b;')[0], /variabilele a, b/);
  assert.match(explain('for (int d = 1; d <= n; d++) {')[0], /d este cel mult n/);
  assert.equal(explain('s = s + n % 10; // x').length, 3);
});
const P = (o: Partial<Problema>): Problema => ({ id: 939, slug: 'sum00', nume: 'sum00', sub: 0, dif: 0, cerinta: 'Calculați suma numerelor.', intrare: '', iesire: '', restrictii: '', ex: [{ in: '12\n23', out: '35' }], ...o });
t('probleme: output compared by words, not spaces', () => {
  assert.ok(same('1 2\n3\n', '1 2 3'));
  assert.ok(!same('1 23', '1 2 3'));
});
t('probleme: check a program on every example', () => {
  const p = P({ ex: [{ in: '12\n23', out: '35' }, { in: '1 1', out: '3' }, { in: '5', out: '5' }] });
  const r = verifica(H + 'int a,b;cin>>a>>b;cout<<a+b;' + F, p);
  assert.deepEqual(r.map(x => x.ok), [true, false, false]);
  assert.equal(r[1].out, '2');
  assert.equal(r[2].err?.kind, 'run');
  assert.throws(() => verifica(H + 'int a' + F, p), CppError);
});
t('probleme: notes for what int cannot do', () => {
  assert.deepEqual(note(P({})), { text: [], stop: false });
  assert.ok(note(P({ ex: [{ in: '2.5', out: '5' }] })).stop);
  assert.ok(note(P({ ex: [{ in: '4\n*', out: '****' }] })).stop);
  const cnp = note(P({ ex: [{ in: '1870413123455', out: 'Major' }] }));
  assert.ok(!cnp.stop); assert.match(cnp.text[0], /long long/);
  assert.ok(note(P({ ex: [{ in: '99999999999999999999', out: '1' }] })).stop);
  assert.match(note(P({ restrictii: '- 1 ≤ n ≤ 10²⁰' })).text[0], /chiar și într-un long long/);
  const big = note(P({ restrictii: '- 1 ≤ n ≤ 10¹⁰' }));
  assert.ok(!big.stop && big.text.length === 1);
  assert.equal(note(P({ restrictii: '- 1 ≤ n < 1.000.000.000' })).text.length, 0);
  assert.match(note(P({ fis: 'maxim' })).text[0], /maxim\.in/);
});
t('probleme: search ignores diacritics, # finds by number', () => {
  assert.ok(matches(P({}), 'suma'));
  assert.ok(matches(P({ cerinta: 'Câte numere sunt pare?' }), 'cate pare'));
  assert.ok(matches(P({}), '#939'));
  assert.ok(!matches(P({}), '93'));
});
t('probleme: program prepared for pbinfo', () => {
  const src = H + 'int a;cin>>a;cout<<a;' + F;
  assert.deepEqual(pentruPbinfo(src, P({})), { code: src, fis: false });
  const { code, fis } = pentruPbinfo('#include <iostream>\nusing namespace std;\nint main()\n{\n    int a;\n}', P({ fis: 'sum' }));
  assert.ok(fis);
  assert.equal(code, '#include <iostream>\n#include <fstream>\nusing namespace std;\nint main()\n{\n    ifstream cin("sum.in");\n    ofstream cout("sum.out");\n    int a;\n}');
});
t('probleme: statement blocks', () => {
  assert.deepEqual(blocuri('Primul.\nRând nou.\n\n- a\n- b'), [{ p: 'Primul.\nRând nou.' }, { li: ['a', 'b'] }]);
});
// A demo cut inside a block gets a last statement there (its snapshot sees the block's variables), then its closing braces.
function vars(body: string) {
  const open = (body.match(/\{/g) || []).length - (body.match(/\}/g) || []).length;
  if (open) body += '\ncout << "";' + '}'.repeat(open);
  return compile(H + body + F).run('').trace.at(open ? -2 : -1)!.vars.map(v => [v[0], v[3] ?? v[1]]);
}
t('intro: every demo line leaves memory as the interpreter does', () => {
  for (const d of DEMOS) {
    d.steps.forEach((s, i) => {
      assert.ok(s.line >= 0 && s.line < d.lines.length, d.name);
      if (i === 0) assert.equal(s.line, 0, d.name);
      else assert.ok(s.line === d.steps[i - 1].line || s.line === d.steps[i - 1].line + 1, d.name + ': lines in order');
      if (d.steps[i + 1]?.line === s.line) return;
      assert.deepEqual(memorie(d, i + 1), vars(d.lines.slice(0, s.line + 1).join('\n')), d.name + ', line ' + (s.line + 1));
    });
    assert.equal(d.steps.at(-1)!.line, d.lines.length - 1, d.name + ' ends on its last line');
    assert.ok(memorie(d, d.steps.length).length <= 4, d.name + ' fits in the four boxes shown');
  }
});
t('intro: the stack demo frees boxes from the top', () => {
  const d = DEMOS.find(d => d.steps.some(s => s.free))!;
  const i = d.steps.findIndex(s => s.free);
  assert.deepEqual(memorie(d, i).map(v => v[0]), ['a', 'b', 'c']);
  assert.deepEqual(memorie(d, i + 1).map(v => v[0]), ['a']);
  assert.deepEqual(memorie(d, d.steps.length), [['a', 7], ['d', 8]]);
});
t('explain: pointers', () => {
  assert.deepEqual(explain('int *p = &a;'), ['Creează pointerul p (o cutie care ține adresa altei cutii). p pornește cu adresa lui a: arată spre cutia a.',
    'Semnul & în fața unei variabile înseamnă „adresa ei”: &a este numărul cutiei lui a.']);
  assert.match(explain('int a = 5, *q = nullptr;')[0], /variabila a .* pointerul q .* nullptr/);
  assert.match(explain('p = &b;')[0], /^p primește adresa lui b/);
  assert.match(explain('*p = *p * 2;')[0], /cutia spre care arată p \(nu în p\)/);
  assert.match(explain('*p = 6;').join(' '), /Semnul \*/);
  assert.match(explain('cout << *p << &a;')[0], /cutia spre care arată p, apoi adresa lui a/);
  assert.equal(explain('c = a * b;').length, 1);
  assert.equal(explain('if (a && b) {').length, 1);
});
t('explain: braces mention the stack', () => {
  assert.match(explain('{').join(' '), /stivă/);
  assert.match(explain('}').join(' '), /stivă/);
});
t('intro: quiz answers match the interpreter', () => {
  for (const q of INTREBARI) {
    const name = /în (\w+) la sfârșit/.exec(q.ask)![1];
    assert.equal(String(q.options[q.ok]), out(q.code + '\ncout << ' + name + ';'), q.code);
  }
});
t('bus: recording does not change what a program does', () => {
  for (const [src, inp] of [...MASINI.map(m => [m.code, m.inp]), [H + 'int n,s=0;cin>>n;do{s+=n%10;n/=10;}while(n);int x=-s,y=!x;cout<<s<<x<<y<<(s>3&&x<0||0);int*p=&s;--*p;cout<<s<<(p!=nullptr);' + F, '2026']]) {
    const a = compile(src).run(inp), b = compile(src, { bus: true }).run(inp);
    assert.equal(b.out, a.out); assert.equal(b.steps, a.steps);
    assert.equal(a.bus.length, 0); assert.ok(b.bus.length > 0);
  }
});
t('bus: fetch, box, read, calculate, write, cin, cout, free', () => {
  const r = compile(H + 'int a;\ncin >> a;\nint b = a * 2;\nif (b > 3) {\nint c = b;\ncout << c;\n}' + F, { bus: true }).run('5');
  const k = r.bus.map(s => s.e.k === 'fetch' ? 'F' + s.e.line : s.e.k === 'read' || s.e.k === 'write' ? s.e.k + ':' + s.e.slot + '=' + s.e.v
    : s.e.k === 'alu' ? s.e.x + s.e.op + s.e.y + '=' + s.e.r : s.e.k === 'free' ? 'free:' + s.e.slots : s.e.k === 'decl' ? 'decl:' + s.e.slot : s.e.k + ':' + ('v' in s.e ? s.e.v : 's' in s.e ? s.e.s : s.e.k));
  assert.deepEqual(k, ['F4', 'decl:0', 'F5', 'in:5', 'write:0=5', 'F6', 'decl:1', 'read:0=5', '5*2=10', 'write:1=10', 'F7', 'read:1=10', '10>3=1',
    'F8', 'decl:2', 'read:1=10', 'write:2=10', 'F9', 'read:2=10', 'out:10', 'free:2', 'F11', 'free:1,0']);
  // Memory as it is right after each event: the box exists (empty) at its decl, gets its value at the write.
  assert.deepEqual(r.bus[1].mem, [[0, 'a', undefined, false, 0]]);
  assert.deepEqual(r.bus[4].mem, [[0, 'a', 5, false, 0]]);
});
t('bus: a long program is cut, its errors keep the events so far', () => {
  const r = compile(H + 'int s = 0;\nfor (int i = 0; i < 1000; i++) s += i;\ncout << s;' + F, { bus: true }).run('');
  assert.ok(r.busCut); assert.equal(r.bus.length, 1500); assert.equal(r.out, '499500');
  const e = err(H + 'int a = 1;\na = a / (a - 1);' + F);
  assert.equal(e.bus?.length, 0); // only recorded on request
  assert.throws(() => compile(H + 'int a = 1;\na = a / (a - 1);' + F, { bus: true }).run(''), (x: unknown) => x instanceof CppError && x.bus!.some(s => s.e.k === 'alu'));
});
t('masina: frames say what travels on each bus', () => {
  const m = masina(MASINI[0].code, MASINI[0].inp), f = (k: string) => m.cadre.find(c => c.fel === k)!;
  assert.deepEqual([f('fetch').adr, f('fetch').cmd, f('fetch').date, f('fetch').spre], ['linia 5', 'citește', 'int a, b, s;', 'cpu']);
  assert.deepEqual([f('in').io, f('in').ioText, f('in').cin], ['in', '12', 1]);
  assert.deepEqual([f('write').adr, f('write').cmd, f('write').date, f('write').spre], ['0x1000', 'scrie', '12', 'mem']);
  assert.match(f('read').say, /adresa 0x1000 și comanda „citește”/);
  assert.equal(f('alu').ual, '12 + 30 = 42');
  assert.deepEqual([f('out').io, f('out').ioText, f('out').out], ['out', '42', 2]);
  assert.match(m.cadre.at(-1)!.say, /^Gata!/);
  assert.equal(m.cadre.at(-1)!.out, 2);
});
t('masina: pointers, blocks, errors', () => {
  const p = masina(MASINI[3].code, '');
  const w = p.cadre.find(c => c.fel === 'write' && c.cell === 1)!;
  assert.equal(w.date, '0x1000'); assert.match(w.say, /adresa 0x1000 \(a lui a\)/);
  assert.ok(p.cadre.some(c => c.fel === 'read' && c.date === '0x1000' && /adresa cutiei a/.test(c.say)));
  assert.equal(p.out, '6');
  const b = masina(MASINI[2].code, '');
  assert.ok(b.cadre.some(c => c.fel === 'free' && c.freed.map(x => x.name).join() === 'i' && /Cutia lui i este eliberată/.test(c.say)));
  assert.match(b.cadre.at(-2)!.say, /se termină main/);
  // The intro's stack demo: d gets the address b had, as the intro says.
  const st = DEMOS.find(d => d.steps.some(s => s.free))!, sm = masina(H + st.lines.join('\n') + F, '');
  const at = (n: string) => sm.cadre.find(c => c.fel === 'decl' && c.mem.at(-1)!.name === n)!.mem.at(-1)!.adr;
  assert.equal(at('d'), at('b')); assert.equal(at('b'), '0x1004');
  const dangling = masina(H + 'int *p;\n{\nint b = 2;\np = &b;\n}\nint d = 3;\np = p;' + F, '');
  assert.match(dangling.cadre.find(c => c.fel === 'read' && c.cell === 0 && c.line === 10)!.say, /0x1004, adresa cutiei b, care nu mai există/);
  assert.match(dangling.cadre.find(c => c.fel === 'free' && c.freed.length === 1)!.say, /Cutia lui b este eliberată/);
  const e = masina(H + 'int a;\ncout << a;' + F, '');
  assert.equal(e.err?.kind, 'run'); assert.match(e.cadre.at(-1)!.say, /^Eroare la rulare, linia 5/);
  const c = masina(H + 'int a' + F, '');
  assert.equal(c.cadre.length, 0); assert.equal(c.err?.kind, 'compile');
});
const G = '#include <iostream>\nusing namespace std;\n';
const run = (src: string, inp = '') => compile(G + src).run(inp).out;
t('long long: literals, arithmetic, casts, wrap-around', () => {
  assert.equal(out('long long a = 1870413123455;\ncout << a / 1000000000000 << " " << a % 100;'), '1 55');
  assert.equal(out('int a = 100000;\ncout << a * a << " " << (long long)a * a << " " << 1LL * a * a << " " << 2147483648;'), '1410065408 10000000000 10000000000 2147483648');
  assert.equal(out('long long b = 9223372036854775807;\nb++;\ncout << b;'), '-9223372036854775808');
  assert.equal(out('long long a = -7;\nint c = a;\nc += a;\ncout << a / 2 << a % 2 << (a < 3) << !a << c;'), '-3-110-14');
  assert.equal(out('long long a;\ncin >> a;\nif (a) cout << a * 2;', '-4000000000'), '-8000000000');
  assert.equal(out('long long a, b;\nint c;\nlong long *p = &b;\n*p = 3;\ncout << &a << " " << &b << " " << &c << " " << b;'), '0x1000 0x1008 0x1010 3');
});
t('long long: errors', () => {
  assert.match(err(H + 'int a;\ncin >> a;' + F, '1870413123455').message, /nu încape într-un int.*long long/);
  for (const [body, re] of [
    ['long a;', /long long/],
    ['long long x = 5;\nint *p = &x;', /spre o cutie int/],
    ['int x = 99999999999999999999;', /chiar și pentru long long/],
  ] as const) assert.match(err(H + body + F).message, re, body);
});
t('functions: values, recursion, pointers, prototypes', () => {
  assert.equal(run('long long f(int n) {\nif (n <= 1) return 1;\nreturn n * f(n - 1);\n}\nint main() {\ncout << f(20);\n}'), '2432902008176640000');
  assert.equal(run('int fib(int n) { if (n < 2) return n; return fib(n - 1) + fib(n - 2); }\nint main() { cout << fib(15); }'), '610');
  assert.equal(run('void sw(int *a, int *b) { int t = *a; *a = *b; *b = t; }\nint main() { int x = 1, y = 2; sw(&x, &y); cout << x << y; }'), '21');
  assert.equal(run('int s(int n);\nint main() { cout << s(100); }\nint s(int n) { if (n == 0) return 0; return n + s(n - 1); }'), '5050');
  assert.equal(run('int g = 5;\nvoid f() { g++; return; }\nint main() { f(); f(); cout << g; }'), '7');
  assert.equal(run('int f(int x) { x = 9; return x; }\nint main() { int a = 1; cout << f(a) << a; }'), '91');
});
t('functions: run-time errors', () => {
  const e = err(G + 'int f(int n) {\nif (n > 0) return 1;\n}\nint main() { cout << f(0); }');
  assert.equal(e.kind, 'run'); assert.match(e.message, /fără să întoarcă/); assert.equal(e.line, 5);
  assert.match(err(G + 'int s(int n) { return n + s(n - 1); }\nint main() { cout << s(5); }').message, /Prea multe apeluri/);
  assert.match(err(G + 'int *q;\nvoid f() { int a = 3; q = &a; }\nint main() { f(); cout << *q; }').message, /la sfârșitul funcției/);
});
t('functions: friendly compile errors', () => {
  for (const [src, re] of [
    ['int main() { cout << sqrt(4); }', /biblioteca/],
    ['int main() { cout << f(4); }', /nu a fost scrisă mai sus/],
    ['void f() { }\nint main() { int x = f(); }', /void/],
    ['void f() { }\nint main() { cout << f(); }', /void/],
    ['int f(int a, int b) { return a + b; }\nint main() { cout << f(1); }', /are 2 parametri/],
    ['int *g() { return 0; }\nint main() { }', /nu un pointer/],
    ['int f(int &a) { return a; }\nint main() { }', /referință/],
    ['int main() {\nint f(int a);\n}', /în afara lui main/],
    ['int f(int a) { return; }\nint main() { }', /trebuie să întoarcă/],
    ['void f() { return 1; }\nint main() { }', /return;/],
    ['int f(int a);\nint main() { cout << f(1); }', /doar antetul/],
    ['int f(int a);\nlong long f(int a) { return a; }\nint main() { }', /nu se potrivește/],
    ['int f(int a) { int a = 2; return a; }\nint main() { }', /parametru/],
    ['int x;\nint x() { return 1; }\nint main() { }', /variabile globale/],
    ['void f(int *p) { }\nint main() { int a; f(a); }', /adresa/],
  ] as const) {
    const e = err(G + src);
    assert.equal(e.kind, 'compile', src); assert.match(e.message, re, src);
  }
});
t('functions: the stepper shows one frame per call', () => {
  const r = compile(G + 'int sq(int x) {\nint y = x * x;\nreturn y;\n}\nint main() {\nint a = sq(3);\ncout << a;\n}').run('');
  const inside = r.trace.find(s => s.vars.some(v => v[0] === 'y'))!;
  assert.deepEqual(inside.calls, ['main', 'sq']);
  assert.deepEqual(inside.vars.map(v => v[0] + '@' + v[4]), ['a@0', 'x@1', 'y@1']);
  assert.deepEqual(r.trace.at(-1)!.vars.map(v => [v[0], v[1]]), [['a', 9]]);
});
t('masina: a function call', () => {
  const m = masina(MASINI.at(-1)!.code, MASINI.at(-1)!.inp);
  assert.equal(m.out, '10');
  assert.match(m.cadre.find(c => c.fel === 'call')!.say, /sare la funcția dublu/);
  assert.match(m.cadre.find(c => c.fel === 'ret')!.say, /întoarce valoarea 10/);
  assert.match(m.cadre.find(c => c.fel === 'free' && /dublu/.test(c.say))!.say, /cutia lui x este eliberată/);
});
t('explain: functions and long long', () => {
  assert.match(explain('int suma(int a, int b) {')[0], /funcția suma.*parametrii a, b.*int/);
  assert.match(explain('long long fact(int n);')[0], /Anunță funcția fact/);
  assert.match(explain('return n * fact(n - 1);').join(' '), /întoarce.*fact\(\.\.\.\) este un apel/);
  assert.match(explain('schimba(&x, &y);')[0], /^Apelează funcția schimba/);
  assert.match(explain('long long x = 5;')[0], /long long/);
  assert.match(explain('cout << (long long)a * b;').join(' '), /numere mari/);
});
t('probleme: cnp1 can be solved with long long', () => {
  const p = P({ ex: [{ in: '1 \n1 \n2010\n1870413123455', out: 'Major' }] });
  const src = G + 'int main() {\nint z, l, a;\nlong long c;\ncin >> z >> l >> a >> c;\nint s = c / 1000000000000, an = c / 10000000000 % 100, ln = c / 100000000 % 100, zi = c / 1000000 % 100;\n'
    + 'if (s <= 2) an += 1900; else an += 2000;\nint v = a - an;\nif (l < ln || (l == ln && z < zi)) v--;\nif (v >= 18) cout << "Major"; else cout << "Minor";\nreturn 0;\n}';
  assert.ok(verifica(src, p).every(r => r.ok));
});
t('stiva: boxes taken and freed, calls started and ended', () => {
  const r = compile('#include <iostream>\nusing namespace std;\nint dublu(int x) {\n    int y = x * 2;\n    return y;\n}\nint main() {\n    int n = 2, s = 0;\n'
    + '    for (int i = 0; i < n; i++) {\n        int t = dublu(i);\n        s += t;\n    }\n    cout << s;\n    return 0;\n}').run('');
  const st = [...r.trace, r.end], said = st.map((s, k) => spune(schimbare(st[k - 1], s), s)).filter(Boolean);
  assert.deepEqual(said.slice(0, 6), [
    'Se iau cutii noi de pe stivă pentru n și s.',
    'Se ia o cutie nouă de pe stivă pentru i.',
    'Se ia o cutie nouă de pe stivă pentru t. Se cheamă dublu(): pe stivă apare un loc nou pentru cutiile ei (x).',
    'Se ia o cutie nouă de pe stivă pentru y.',
    'Funcția dublu() s-a terminat: cutiile ei sunt eliberate și ies de pe stivă.',
    'Cutia lui t este eliberată: iese de pe stivă la „}”.',
  ]);
  assert.equal(said.at(-1), 'Cutiile lui n și s sunt eliberate: ies de pe stivă la „}”, ultima pusă pleacă prima.');
  // A box declared again in the next turn of the loop is freed at `}` and taken again, not kept.
  const k = st.findIndex((s, j) => j > 0 && schimbare(st[j - 1], s).freed.some(v => v[0] === 't'));
  const d = schimbare(st[k - 1], st[k]);
  assert.deepEqual(d.freed.map(v => v[0]), ['t']); assert.deepEqual(d.taken, []); assert.equal(d.kept, 3);
  // A recursive call is a new frame even though the function has the same name.
  const f = compile('#include <iostream>\nusing namespace std;\nint f(int n) {\n    if (n == 0) return 0;\n    return f(n - 1);\n}\nint main() {\n    cout << f(1);\n    return 0;\n}').run('');
  const fs = [...f.trace, f.end], deeper = fs.findIndex(s => s.calls.length === 3);
  const dd = schimbare(fs[deeper - 1], fs[deeper]);
  assert.deepEqual(dd.started, [2]); assert.deepEqual(dd.taken.map(v => v[0]), ['n']); assert.equal(dd.freed.length, 0);
  assert.equal(spune(schimbare(undefined, fs[0]), fs[0]), '');
});
t('heap: new, delete, addresses and errors', () => {
  assert.equal(out('int *p = new int(5);\n*p += 2;\ncout << *p << " " << p;\ndelete p;'), '7 0x8000');
  assert.equal(out('int *p = new int;\ncin >> *p;\ncout << *p * 2;\ndelete p;', '21'), '42');
  assert.equal(out('long long *q = new long long(3000000000);\nint *z = new int();\ncout << *q + *z;\ndelete q;\ndelete z;'), '3000000000');
  // A place freed by delete is given to the next new (first place big enough); a long long takes two places.
  assert.equal(out('int *a = new int(1);\nlong long *b = new long long(2);\nint *c = new int(3);\ndelete a;\ndelete c;\nint *d = new int(4);\nint *e = new int(5);\ncout << b << " " << d << " " << e;'), '0x8004 0x8000 0x800c');
  assert.equal(out('int *p = nullptr;\ndelete p;\ncout << "ok";'), 'ok');
  // The heap box outlives the block it was made in.
  assert.equal(out('int *p = nullptr;\n{\n    p = new int(9);\n}\ncout << *p;\ndelete p;'), '9');
  const r = compile(H + 'int *p = new int(1);\nint *q = new int(2);\ndelete p;' + F).run('');
  assert.deepEqual(r.end.heap, [['heap 2', 2, '0x8004']]);
  const mid = r.trace.find(s => s.heap.length === 2)!;
  assert.deepEqual(mid.vars.map(v => v[3]), ['heap 1', 'heap 2']);
  const after = compile(H + 'int *p = new int(1);\ndelete p;\ncout << 1;' + F).run('').trace.at(-1)!;
  assert.equal(after.vars[0][3], 'heap 1 (eliberată cu delete)');
  for (const [body, re, kind] of [
    ['int *p = new int;\ncout << *p;', /„heap 1” din heap .* nu are încă o valoare/, 'run'],
    ['int *p = new int(1);\ndelete p;\ncout << *p;', /a fost eliberată cu delete/, 'run'],
    ['int *p = new int(1);\ndelete p;\ndelete p;', /deja eliberată cu delete/, 'run'],
    ['int a = 1;\nint *p = &a;\ndelete p;', /doar cutii luate cu new.*„a”, o cutie de pe stivă/, 'run'],
    ['int a = 1;\ndelete a;', /După delete se scrie un pointer/, 'compile'],
    ['int *p = new int[5];', /Vectorii/, 'compile'],
    ['int x = new int;', /se pun numere, nu adrese/, 'compile'],
    ['long long *p = new int(3);', /poate primi doar adresa unei cutii long long/, 'compile'],
    ['int *p = new void;', /După new scrie felul cutiei/, 'compile'],
    ['int *p = new int*;', /pointer la pointer/, 'compile'],
    ['int new = 3;', /cuvânt rezervat/, 'compile'],
  ] as const) {
    const e = err(H + body + F);
    assert.equal(e.kind, kind, body); assert.match(e.message, re, body);
  }
});
t('heap: explain, machine view and memory sentences', () => {
  assert.match(explain('int *p = new int(5);')[0], /adresa unei cutii noi din heap, în care se pune 5/);
  assert.match(explain('int *p = new int(5);')[1], /^new ia o cutie nouă din heap/);
  assert.match(explain('delete p;')[0], /^Eliberează cutia din heap spre care arată p/);
  assert.match(explain('p = new int;')[0], /^p primește adresa unei cutii noi din heap, încă goală/);
  const m = masina(MASINI.find(x => /heap/.test(x.name))!.code, '');
  assert.equal(m.err, undefined);
  const nw = m.cadre.find(c => c.fel === 'decl' && /^new/.test(c.say))!;
  assert.match(nw.say, /„heap 1”, la adresa 0x8000/);
  assert.ok(nw.mem.some(c => c.heap && c.adr === '0x8000'));
  assert.match(m.cadre.find(c => c.fel === 'free' && /^delete/.test(c.say))!.say, /delete eliberează cutia „heap 1” din heap, de la adresa 0x8000/);
  const leak = masina(H + 'int *p = new int(1);' + F, '');
  assert.match(leak.cadre.filter(c => c.fel === 'free').at(-1)!.say, /În heap au rămas cutii fără delete \(heap 1\)/);
  const r = compile(H + 'int *p = new int(4);\ndelete p;\nint *q = new int(5);' + F).run(''), st = [...r.trace, r.end];
  const said = st.map((s, k) => spune(schimbare(st[k - 1], s), s)).filter(Boolean);
  assert.ok(said.includes('Se ia o cutie nouă de pe stivă pentru p. new ia o cutie nouă din heap, „heap 1”, la adresa 0x8000. Ea rămâne acolo până la delete, chiar și după „}”.'), said.join('\n'));
  assert.ok(said.includes('delete eliberează cutia „heap 1” din heap (adresa 0x8000): locul ei poate fi dat de următorul new.'));
  assert.match(said.at(-1)!, /În heap a rămas cutia „heap 2” fără delete: programul a uitat s-o elibereze\.$/);
});
t('lectii: every program does what its page says', () => {
  assert.deepEqual(LECTII.map(l => l.id), ['stiva', 'heap', 'impreuna']);
  for (const l of LECTII) for (const q of l.programe) {
    const what = l.id + ': ' + q.name, a = q.asteapta;
    let r: ReturnType<ReturnType<typeof compile>['run']> | undefined, e: CppError | undefined;
    try { r = compile(q.code).run(q.inp) } catch (x) { if (!(x instanceof CppError)) throw x; e = x }
    if ('eroare' in a) { assert.ok(e && e.kind === 'run', what); assert.match(e!.message, new RegExp(a.eroare), what); continue }
    assert.ok(r, what + ': ' + e?.message);
    if ('ok' in a) { assert.equal(r!.out, a.ok, what); assert.deepEqual(r!.end.heap, [], what + ': nothing left on the heap') }
    else { assert.equal(r!.out, a.out, what); assert.deepEqual(r!.end.heap.map(h => h[0]), a.heap, what) }
    assert.ok(!r!.cut, what + ': short enough to replay');
    // Every page shows boxes both coming and going.
    const st = [...r!.trace, r!.end];
    assert.ok(st.some((s, k) => k > 0 && spune(schimbare(st[k - 1], s), s)), what);
  }
  // What the notes promise: c takes b's address; heap 3 gets heap 1's place.
  const c = compile(LECTII[0].programe[0].code).run('');
  const adrOf = (name: string) => c.trace.find(s => s.vars.some(v => v[0] === name))!.vars.find(v => v[0] === name)![5];
  assert.equal(adrOf('b'), adrOf('c'));
  const h = compile(LECTII[1].programe[0].code).run('');
  assert.ok(h.trace.some(s => s.heap.some(x => x[0] === 'heap 3' && x[2] === '0x8000')));
  // „Verifică-te”: the right answer is what the code really does.
  for (const l of LECTII) {
    assert.ok(l.intrebari.length >= 2, l.id);
    for (const q of l.intrebari) {
      const what = l.id + ': ' + q.ask + ' ' + q.code.split('\n')[0], a = q.asteapta, right = q.options[q.ok];
      assert.ok(right !== undefined && new Set(q.options).size === q.options.length, what);
      const top = '#include <iostream>\nusing namespace std;\n\n';
      const src = /int main\(\)/.test(q.code) ? top + q.code + '\n'
        : top + 'int main() {\n' + q.code.split('\n').map(x => '    ' + x + '\n').join('') + '    return 0;\n}\n';
      let r: ReturnType<ReturnType<typeof compile>['run']> | undefined, e: CppError | undefined;
      try { r = compile(src).run('') } catch (x) { if (!(x instanceof CppError)) throw x; e = x }
      if ('eroare' in a) { assert.ok(e, what); assert.match(e!.message, new RegExp(a.eroare), what); assert.match(right, /^eroare/, what); continue }
      assert.ok(r, what + ': ' + e?.message);
      if ('ok' in a) { assert.equal(r!.out, a.ok, what); assert.equal(right, a.ok, what); assert.deepEqual(r!.end.heap, [], what) }
      else { assert.equal(r!.out, a.out, what); assert.deepEqual(r!.end.heap.map(h => h[0]), a.heap, what); assert.equal(right, String(a.heap.length), what) }
    }
  }
  assert.equal(html('`int *p` și **heap** <b>'), '<code>int *p</code> și <b>heap</b> &lt;b&gt;');
});
console.log(n + ' tests passed');
