// The lessons on memory („Stiva și heap-ul”): three pages (the stack, the heap, both), each with a short text and
// programs to run and replay step by step, some of them with a mistake on purpose. No DOM access.
// Text: paragraphs with `cod` and **bold**; tests run every program and check what it is meant to show.

const H = '#include <iostream>\nusing namespace std;\n\n';

/** A program of a lesson. `asteapta`: it ends fine (`ok`, printing `out`), stops with a run-time error whose message
 * matches `eroare`, or ends with boxes left on the heap (`heap`, their names). `nota` says what to watch. */
export interface ProgramLectie {
  name: string; code: string; inp: string; nota: string;
  asteapta: { ok: string } | { eroare: string } | { heap: string[]; out: string };
}
export interface Lectie {
  /** Also the address of the page (#stiva). */
  id: string;
  titlu: string;
  /** Paragraphs. */
  text: string[];
  /** An optional comparison table: a header row, then rows. */
  tabel?: string[][];
  programe: ProgramLectie[];
}

export const LECTII: Lectie[] = [
  {
    id: 'stiva', titlu: 'Stiva',
    text: [
      'Când programul ajunge la o declarație ca `int a = 3;`, ia o cutie nouă și o pune **deasupra** celorlalte. Partea memoriei unde stau aceste cutii se numește **stivă**, ca un teanc de farfurii.',
      'La `}` blocul se termină: cutiile luate în el sunt scoase de sus, ultima pusă pleacă prima. Programul nu scrie nimic special pentru asta: **stiva se golește singură**.',
      'Când chemi o funcție, ea primește pe stivă un loc numai al ei, un **cadru**, cu cutii pentru parametri și pentru variabilele ei. Când funcția se termină, pleacă tot cadrul.',
      'Urmărește adresele: o cutie nouă ia adresa de deasupra vârfului. După `}`, următoarea cutie ia **locul** celei plecate, deci aceeași adresă.',
    ],
    programe: [
      {
        name: 'Blocuri și o funcție', inp: '', asteapta: { ok: '7\n9\n' },
        nota: 'b pleacă la prima „}”, iar c ia locul și adresa lui. Funcția patrat primește un cadru deasupra lui main, care pleacă la return.',
        code: H + 'int patrat(int x) {\n    int r = x * x;\n    return r;\n}\n\nint main() {\n    int a = 3;\n    {\n        int b = 4;\n        cout << a + b << endl;\n    }\n    int c = patrat(a);\n    cout << c << endl;\n    return 0;\n}\n',
      },
      {
        name: 'Un cadru peste altul', inp: '', asteapta: { ok: '6\n' },
        nota: 'fact se cheamă pe ea însăși: fiecare apel primește cadrul lui, cu n-ul lui. Stiva crește cu un cadru la fiecare apel și scade la fiecare return.',
        code: H + 'int fact(int n) {\n    if (n <= 1) {\n        return 1;\n    }\n    int r = n * fact(n - 1);\n    return r;\n}\n\nint main() {\n    int x = fact(3);\n    cout << x << endl;\n    return 0;\n}\n',
      },
      {
        name: 'Greșeală: cutia a plecat', inp: '', asteapta: { eroare: 'nu mai există' },
        nota: 'p ține minte adresa lui b, dar b pleacă la „}”, iar c îi ia locul. Caietul oprește programul. Un calculator adevărat ar citi ce găsește la adresa aceea (aici 9), o greșeală greu de găsit.',
        code: H + 'int main() {\n    int *p = nullptr;\n    {\n        int b = 4;\n        p = &b;\n        cout << *p << endl;\n    }\n    int c = 9;\n    cout << *p << endl;   // b nu mai există!\n    return 0;\n}\n',
      },
    ],
  },
  {
    id: 'heap', titlu: 'Heap-ul',
    text: [
      'Uneori vrei o cutie care **să nu plece** la `}`. O ceri din altă parte a memoriei, **heap-ul**, cu `new`: `int *p = new int(5);` face acolo o cutie cu 5 și pune adresa ei în pointerul p.',
      'Cutia din heap **nu are nume**. O folosești doar prin pointer: `*p` este cutia spre care arată p. Aici le numim „heap 1”, „heap 2”, ca să le deosebești.',
      'Cutia rămâne în heap până o eliberezi tu, cu `delete p;`. Abia atunci locul ei poate fi dat altei cutii, la următorul `new`.',
      'Două greșeli des întâlnite: să folosești cutia **după** `delete` și să **uiți** de `delete`. O cutie uitată ocupă memoria degeaba până la sfârșitul programului: se numește „scurgere de memorie” (memory leak).',
    ],
    programe: [
      {
        name: 'new și delete', inp: '', asteapta: { ok: '15\n8\n' },
        nota: 'După delete p, locul lui „heap 1” e liber: următorul new îl dă cutiei „heap 3”, la aceeași adresă 0x8000.',
        code: H + 'int main() {\n    int *p = new int(5);\n    *p = *p + 10;\n    cout << *p << endl;\n    int *q = new int(7);\n    delete p;\n    p = new int(1);   // primește locul eliberat\n    cout << *p + *q << endl;\n    delete p;\n    delete q;\n    return 0;\n}\n',
      },
      {
        name: 'Greșeală: folosită după delete', inp: '', asteapta: { eroare: 'eliberată cu delete' },
        nota: 'După delete, p ține minte adresa, dar cutia nu mai e a programului. Caietul oprește programul când o folosești.',
        code: H + 'int main() {\n    int *p = new int(5);\n    cout << *p << endl;\n    delete p;\n    cout << *p << endl;   // cutia a fost eliberată!\n    return 0;\n}\n',
      },
      {
        name: 'Greșeală: ai uitat delete', inp: '', asteapta: { heap: ['heap 1'], out: '12\n' },
        nota: 'La sfârșit, p pleacă de pe stivă, dar cutia „heap 1” rămâne în heap: nimeni nu mai știe unde e și nimeni n-o mai eliberează.',
        code: H + 'int main() {\n    int *p = new int(3);\n    *p = *p * 4;\n    cout << *p << endl;\n    return 0;   // lipsește delete p;\n}\n',
      },
    ],
  },
  {
    id: 'impreuna', titlu: 'Stiva și heap-ul împreună',
    text: [
      'De obicei un program le folosește pe amândouă. Pointerul p stă pe **stivă**: are nume și pleacă la `}`. Cutia spre care arată stă în **heap**: n-are nume și pleacă doar la `delete`.',
      'Așa poți păstra un număr dincolo de un bloc sau de o funcție: variabilele de pe stivă vin și pleacă, cutia din heap rămâne pe loc.',
    ],
    tabel: [
      ['', 'Stiva', 'Heap-ul'],
      ['Cum iei o cutie', 'o declari: `int a;`', 'o ceri: `new int`'],
      ['Are nume?', 'da: a', 'nu: o găsești prin pointer, `*p`'],
      ['Când pleacă', 'singură, la `}` sau la sfârșitul funcției', 'doar la `delete p;`'],
      ['Adresele (aici)', 'de la 0x1000', 'de la 0x8000'],
    ],
    programe: [
      {
        name: 'O sumă ținută în heap', inp: '3', asteapta: { ok: 'Suma: 60\n' },
        nota: 'i și t pleacă de pe stivă la fiecare „}”, dar cutia din heap ține suma de la un tur la altul, până la delete.',
        code: H + 'int main() {\n    int n;\n    cin >> n;\n    int *s = new int(0);   // suma stă în heap\n    for (int i = 1; i <= n; i++) {\n        int t = i * 10;   // t stă pe stivă\n        *s = *s + t;\n    }\n    cout << "Suma: " << *s << endl;\n    delete s;\n    return 0;\n}\n',
      },
      {
        name: 'O funcție lucrează în heap', inp: '', asteapta: { ok: '14\n' },
        nota: 'dubleaza primește un cadru pe stivă, cu pointerul x și cutia vechi. Cadrul pleacă la sfârșitul funcției, dar schimbarea făcută în heap rămâne.',
        code: H + 'void dubleaza(int *x) {\n    int vechi = *x;\n    *x = vechi * 2;\n}\n\nint main() {\n    int *p = new int(7);\n    dubleaza(p);\n    cout << *p << endl;\n    delete p;\n    return 0;\n}\n',
      },
      {
        name: 'Greșeală: adresa pierdută', inp: '', asteapta: { heap: ['heap 1'], out: '2\n' },
        nota: 'p primește adresa lui „heap 2” și uită adresa lui „heap 1”. Acum nimeni nu mai poate elibera „heap 1”: rămâne în heap până la sfârșit.',
        code: H + 'int main() {\n    int *p = new int(1);\n    p = new int(2);   // adresa lui heap 1 s-a pierdut\n    cout << *p << endl;\n    delete p;\n    return 0;\n}\n',
      },
    ],
  },
];

/** A lesson's text as HTML: escapes it, then `cod` and **bold**. */
export function html(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
}
