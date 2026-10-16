// Run with: npm test   (or: just test)
import assert from 'node:assert/strict';
import { compile, CppError } from '../src/interp.js';
import { explain } from '../src/explain.js';
import { note, matches, same, verifica, blocuri, type Problema } from '../src/probleme.js';
import { DEMOS, INTREBARI, memorie } from '../src/intro.js';
import { MASINI, masina } from '../src/masina.js';

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
  assert.ok(note(P({ ex: [{ in: '1870413123455', out: 'Major' }] })).stop);
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
    : s.e.k === 'alu' ? s.e.x + s.e.op + s.e.y + '=' + s.e.r : s.e.k === 'free' ? 'free:' + s.e.slots : s.e.k === 'decl' ? 'decl:' + s.e.slot : s.e.k + ':' + ('v' in s.e ? s.e.v : s.e.s));
  assert.deepEqual(k, ['F4', 'decl:0', 'F5', 'in:5', 'write:0=5', 'F6', 'decl:1', 'read:0=5', '5*2=10', 'write:1=10', 'F7', 'read:1=10', '10>3=1',
    'F8', 'decl:2', 'read:1=10', 'write:2=10', 'F9', 'read:2=10', 'out:10', 'free:2', 'F11', 'free:1,0']);
  // Memory as it is right after each event: the box exists (empty) at its decl, gets its value at the write.
  assert.deepEqual(r.bus[1].mem, [[0, 'a', undefined, false]]);
  assert.deepEqual(r.bus[4].mem, [[0, 'a', 5, false]]);
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
  const e = masina(H + 'int a;\ncout << a;' + F, '');
  assert.equal(e.err?.kind, 'run'); assert.match(e.cadre.at(-1)!.say, /^Eroare la rulare, linia 5/);
  const c = masina(H + 'int a' + F, '');
  assert.equal(c.cadre.length, 0); assert.equal(c.err?.kind, 'compile');
});
console.log(n + ' tests passed');
