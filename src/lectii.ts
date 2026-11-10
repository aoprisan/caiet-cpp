// The lessons on memory („Stiva și heap-ul”): four pages (the stack, why pointers, the heap, both), each with a short text and
// programs to run and replay step by step, some of them with a mistake on purpose. No DOM access.
// Text: paragraphs with `cod` and **bold**; tests run every program and check what it is meant to show.

const H = '#include <iostream>\nusing namespace std;\n\n';

/** A program of a lesson. `asteapta`: it ends fine (`ok`, printing `out`), stops with a run-time error whose message
 * matches `eroare`, or ends with boxes left on the heap (`heap`, their names). `nota` says what to watch. */
export interface ProgramLectie {
  name: string; code: string; inp: string; nota: string;
  asteapta: { ok: string } | { eroare: string } | { heap: string[]; out: string };
}
/** A „Verifică-te” question: a piece of code (the body of main, or a whole program if it has its own main), a
 * question and short answers. Tests run the code: the right answer is its output, „eroare…” for a run-time or
 * compile error matching `asteapta.eroare`, or the number of boxes left on the heap. */
export interface IntrebareLectie {
  code: string; ask: string; options: string[]; ok: number; why: string;
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
  /** Questions to check yourself, at the end of the page. */
  intrebari: IntrebareLectie[];
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
    intrebari: [
      {
        code: 'int a = 5;\n{\n    int b = a + 1;\n    a = b;\n}\ncout << a;', ask: 'Ce afișează?', options: ['5', '6', 'eroare'], ok: 1,
        asteapta: { ok: '6' },
        why: 'b pleacă de pe stivă la }, dar a stă sub ea și rămâne. Înainte de }, a primise numărul din b, adică 6.',
      },
      {
        code: '{\n    int b = 4;\n}\ncout << b;', ask: 'Ce se întâmplă?', options: ['afișează 4', 'eroare'], ok: 1,
        asteapta: { eroare: 'b' },
        why: 'b a plecat de pe stivă la }. După acolada aceea, numele b nu mai înseamnă nimic, iar programul nici nu pornește.',
      },
      {
        code: 'int dublu(int x) {\n    x = x * 2;\n    return x;\n}\n\nint main() {\n    int x = 3;\n    int y = dublu(x);\n    cout << x;\n    return 0;\n}',
        ask: 'Ce afișează?', options: ['3', '6', 'eroare'], ok: 0, asteapta: { ok: '3' },
        why: 'dublu primește un cadru al lui, cu o cutie x a lui, în care se copiază 3. Dublează cutia din cadrul lui, nu x-ul lui main.',
      },
    ],
  },
  {
    id: 'pointeri', titlu: 'De ce pointeri?',
    text: [
      'Ai văzut că o funcție primește pe stivă un cadru al ei. Parametrii ei sunt cutii noi, în care se **copiază** numerele date la apel. Funcția lucrează pe copii, iar cutiile lui main rămân neatinse. De obicei e bine așa.',
      'Dar uneori **vrei** ca funcția să schimbe o cutie din main. De exemplu, o funcție care schimbă între ele două numere: `void schimba(int x, int y)` schimbă doar copiile, iar în main nu se întâmplă nimic.',
      'Gândește-te la un prieten care trebuie să-ți ude florile cât ești plecat. Dacă îi dai o **poză** cu florile, adică o copie, nu folosește la nimic. Îi dai **adresa** casei: așa ajunge la florile adevărate. Pointerul este adresa.',
      'Așa că îi dai funcției **adresele** cutiilor: `schimba(&a, &b)`. Parametrii ei sunt pointeri, `int *x`, iar prin `*x` și `*y` ea lucrează chiar în cutiile lui a și b.',
      'Tot așa, o funcție poate da **mai multe rezultate**. `return` dă unul singur, dar celelalte pot fi puse în cutiile spre care arată pointerii primiți.',
      'Mai e un motiv, pe pagina următoare: cutiile din **heap** nu au nume. Singurul mod de a ajunge la ele este printr-un pointer.',
    ],
    programe: [
      {
        name: 'Greșeală: schimbă copiile', inp: '', asteapta: { ok: '3 8\n' },
        nota: 'schimba primește în cadrul ei cutiile x și y, cu copii ale lui a și b. Le schimbă între ele, dar cadrul pleacă la sfârșit, iar a și b au rămas 3 și 8.',
        code: H + 'void schimba(int x, int y) {\n    int aux = x;\n    x = y;\n    y = aux;\n}\n\nint main() {\n    int a = 3, b = 8;\n    schimba(a, b);\n    cout << a << " " << b << endl;\n    return 0;\n}\n',
      },
      {
        name: 'Schimbă prin pointeri', inp: '', asteapta: { ok: '8 3\n' },
        nota: 'Acum x și y țin adresele lui a și b. *x este chiar cutia a, deci schimbarea se face în cutiile lui main și rămâne după ce cadrul pleacă.',
        code: H + 'void schimba(int *x, int *y) {\n    int aux = *x;\n    *x = *y;\n    *y = aux;\n}\n\nint main() {\n    int a = 3, b = 8;\n    schimba(&a, &b);\n    cout << a << " " << b << endl;\n    return 0;\n}\n',
      },
      {
        name: 'Două rezultate deodată', inp: '9 4', asteapta: { ok: 'Cel mai mic: 4\nCel mai mare: 9\n' },
        nota: 'minmax nu are return. Pune cele două rezultate direct în cutiile mic și mare ale lui main, prin pointerii pmic și pmare.',
        code: H + 'void minmax(int a, int b, int *pmic, int *pmare) {\n    if (a < b) {\n        *pmic = a;\n        *pmare = b;\n    } else {\n        *pmic = b;\n        *pmare = a;\n    }\n}\n\nint main() {\n    int a, b, mic, mare;\n    cin >> a >> b;\n    minmax(a, b, &mic, &mare);\n    cout << "Cel mai mic: " << mic << endl;\n    cout << "Cel mai mare: " << mare << endl;\n    return 0;\n}\n',
      },
    ],
    intrebari: [
      {
        code: 'void pune(int x) {\n    x = 7;\n}\n\nint main() {\n    int a = 1;\n    pune(a);\n    cout << a;\n    return 0;\n}',
        ask: 'Ce afișează?', options: ['1', '7', 'eroare'], ok: 0, asteapta: { ok: '1' },
        why: 'pune primește o copie a lui a, în cutia x a ei. Pune 7 în copie, iar a rămâne 1.',
      },
      {
        code: 'void pune(int *x) {\n    *x = 7;\n}\n\nint main() {\n    int a = 1;\n    pune(&a);\n    cout << a;\n    return 0;\n}',
        ask: 'Ce afișează?', options: ['1', '7', 'eroare'], ok: 1, asteapta: { ok: '7' },
        why: 'Acum pune primește adresa lui a. *x este chiar cutia a, deci 7 ajunge în a.',
      },
      {
        code: 'void creste(int *x) {\n    *x = *x + 1;\n}\n\nint main() {\n    int a = 5;\n    creste(&a);\n    creste(&a);\n    cout << a;\n    return 0;\n}',
        ask: 'Ce afișează?', options: ['5', '6', '7'], ok: 2, asteapta: { ok: '7' },
        why: 'Fiecare apel adună 1 chiar în cutia a: 5, apoi 6, apoi 7.',
      },
    ],
  },
  {
    id: 'heap', titlu: 'Heap-ul',
    text: [
      'Amintește-ți: un **pointer** este o cutie care ține minte **adresa** altei cutii. `int *p = &a;` pune în p adresa lui a, iar `*p` înseamnă „cutia spre care arată p”, adică chiar a.',
      'Uneori vrei o cutie care **să nu plece** la `}`. O ceri din altă parte a memoriei, **heap-ul**, cu `new`: `int *p = new int(5);` face acolo o cutie cu 5 și pune adresa ei în pointerul p.',
      'Cutia din heap **nu are nume**. O folosești doar prin pointer: `*p` este cutia spre care arată p. Aici le numim „heap 1”, „heap 2”, ca să le deosebești.',
      'Cutia rămâne în heap până o eliberezi tu, cu `delete p;`. Abia atunci locul ei poate fi dat altei cutii, la următorul `new`.',
      'Seamănă cu **garderoba** de la teatru. Lași haina și primești un bon cu un număr. Haina este cutia din heap, bonul este pointerul: cu el o găsești. Haina stă acolo cât timp vrei tu, iar `delete` înseamnă să dai bonul înapoi și să-ți iei haina.',
      'Două greșeli des întâlnite: să folosești cutia **după** `delete` (ca și cum ai cere haina cu un bon pe care l-ai dat deja înapoi) și să **uiți** de `delete` (ca o haină uitată la garderobă). O cutie uitată ocupă memoria degeaba până la sfârșitul programului: se numește „scurgere de memorie” (memory leak).',
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
    intrebari: [
      {
        code: 'int *p = nullptr;\n{\n    int *q = new int(8);\n    p = q;\n}\ncout << *p;\ndelete p;', ask: 'q pleacă de pe stivă la }. Ce afișează?',
        options: ['8', 'eroare'], ok: 0, asteapta: { ok: '8' },
        why: 'Pleacă doar pointerul q, adică bonul. Cutia din heap rămâne la locul ei, iar p ține minte adresa ei.',
      },
      {
        code: 'int *p = new int(3);\ndelete p;\ncout << *p;', ask: 'Ce afișează?', options: ['3', 'eroare'], ok: 1,
        asteapta: { eroare: 'eliberată cu delete' },
        why: 'După delete, cutia nu mai e a programului, chiar dacă p ține minte adresa ei. Ai dat bonul înapoi: haina nu mai e a ta.',
      },
      {
        code: 'int *p = new int(1);\nint *q = new int(2);\ndelete p;', ask: 'Câte cutii rămân în heap la sfârșit?', options: ['0', '1', '2'], ok: 1,
        asteapta: { heap: ['heap 2'], out: '' },
        why: 'Două new, un singur delete: cutia spre care arată q rămâne în heap. Ar fi trebuit și delete q;.',
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
      ['Seamănă cu', 'un teanc de farfurii: iei și pui doar sus', 'o garderobă: lași haina, primești un bon'],
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
    intrebari: [
      {
        code: 'void pune(int *x) {\n    *x = 5;\n}\n\nint main() {\n    int *p = new int(0);\n    pune(p);\n    cout << *p;\n    delete p;\n    return 0;\n}',
        ask: 'Cadrul lui pune pleacă la sfârșitul funcției. Ce afișează?', options: ['0', '5', 'eroare'], ok: 1, asteapta: { ok: '5' },
        why: 'x este o copie a bonului, deci arată spre aceeași cutie din heap. Pleacă x, dar 5 rămâne în cutie.',
      },
      {
        code: 'int *p = new int(4);\nint *q = p;\ndelete q;\ncout << *p;', ask: 'p și q arată spre aceeași cutie. Ce afișează?', options: ['4', 'eroare'], ok: 1,
        asteapta: { eroare: 'eliberată cu delete' },
        why: 'q = p copiază doar adresa: e tot o haină, cu două bonuri. delete q o eliberează, așa că nici p nu o mai poate folosi.',
      },
      {
        code: 'for (int i = 1; i <= 3; i++) {\n    int *p = new int(i);\n}', ask: 'Câte cutii rămân în heap la sfârșit?', options: ['0', '1', '3'], ok: 2,
        asteapta: { heap: ['heap 1', 'heap 2', 'heap 3'], out: '' },
        why: 'La fiecare tur, p pleacă de pe stivă la }, dar cutia din heap nu: e un new fără delete. Trei tururi, trei cutii uitate.',
      },
    ],
  },
];

/** A lesson's text as HTML: escapes it, then `cod` and **bold**. */
export function html(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
}
