// What changed on the stack between two steps of a run: which boxes stayed, which were taken (put on top) and which were
// freed (taken off the top at a block's `}` or when a function call ends), and a Romanian sentence saying so.
// Used by the caiet's memory animations; no DOM access.
import type { Snapshot, VarView } from './interp.js';

export interface Schimbare {
  /** How many boxes at the bottom of the stack are the same in both steps. */
  kept: number;
  /** Boxes that were on top before and are gone now (bottom first). */
  freed: VarView[];
  /** Boxes put on the stack since (bottom first), from index `kept` of the new step's `vars`. */
  taken: VarView[];
  /** Function calls that ended (names) and that started (index in the new step's `calls`). */
  ended: string[];
  started: number[];
  /** How many function calls (from main) are the same in both steps. */
  same: number;
}

const calls = (s: Snapshot | undefined) => s && s.calls.length ? s.calls : ['main'];
const same = (a: VarView, b: VarView) => a[0] === b[0] && a[2] === b[2] && (a[4] ?? 0) === (b[4] ?? 0);

/** The stack is a stack: the boxes that stayed are a common bottom part, the rest left from the top or came on top. */
export function schimbare(a: Snapshot | undefined, b: Snapshot): Schimbare {
  const va = a ? a.vars : [], vb = b.vars, ca = a ? calls(a) : [], cb = calls(b);
  let f = 0; // function calls that are the same in both steps
  while (f < ca.length && f < cb.length && ca[f] === cb[f]) f++;
  let kept = 0;
  while (kept < va.length && kept < vb.length && same(va[kept], vb[kept]) && (va[kept][2] || (va[kept][4] ?? 0) < f)) kept++;
  return {
    kept, freed: va.slice(kept), taken: vb.slice(kept),
    ended: a ? ca.slice(f).reverse() : [], started: a ? cb.map((_, k) => k).slice(f) : [], same: f,
  };
}

const list = (xs: string[]) => xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' și ' + xs[xs.length - 1];

/** One or two short sentences about what happened in memory, or '' when no box came or went. */
export function spune(d: Schimbare, now: Snapshot): string {
  const out: string[] = [], cb = calls(now), inCall = (v: VarView) => !v[2] && (v[4] ?? 0) >= d.same;
  // Boxes of a call that ended are told with the call; the others left at a `}`.
  const block = d.freed.filter(v => !inCall(v)).map(v => v[0]);
  if (block.length) out.push(block.length === 1 ? 'Cutia lui ' + block[0] + ' este eliberată: iese de pe stivă la „}”.'
    : 'Cutiile lui ' + list(block) + ' sunt eliberate: ies de pe stivă la „}”, ultima pusă pleacă prima.');
  for (const fn of d.ended) out.push('Funcția ' + fn + '() s-a terminat: cutiile ei sunt eliberate și ies de pe stivă.');
  const fresh = d.taken.filter(v => !inCall(v)).map(v => v[0]);
  if (fresh.length) out.push(fresh.length === 1 ? 'Se ia o cutie nouă de pe stivă pentru ' + fresh[0] + '.'
    : 'Se iau cutii noi de pe stivă pentru ' + list(fresh) + '.');
  for (const k of d.started) {
    const ps = d.taken.filter(v => !v[2] && (v[4] ?? 0) === k).map(v => v[0]);
    out.push('Se cheamă ' + cb[k] + '(): pe stivă apare un loc nou pentru cutiile ei' + (ps.length ? ' (' + list(ps) + ')' : '') + '.');
  }
  return out.join(' ');
}
