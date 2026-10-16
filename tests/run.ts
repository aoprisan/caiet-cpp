// Run with: npm test   (or: just test)
import assert from 'node:assert/strict';
import { compile, CppError } from '../src/interp.js';
import { explain } from '../src/explain.js';
import { note, matches, same, verifica, blocuri, type Problema } from '../src/probleme.js';
import { DEMOS, INTREBARI, memorie } from '../src/intro.js';

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
  return compile(H + body + F).run('').trace.at(open ? -2 : -1)!.vars.map(v => [v[0], v[1]]);
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
console.log(n + ' tests passed');
