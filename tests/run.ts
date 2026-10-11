// Run with: npm test   (or: just test)
import assert from 'node:assert/strict';
import { compile, CppError } from '../src/interp.js';
import { explain } from '../src/explain.js';

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
console.log(n + ' tests passed');
