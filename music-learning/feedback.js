/* feedback.js — the shared record between Sam and Claude.
 *
 * HOW THE LOOP WORKS
 *   1. Sam rates drills on the page. Ratings live in localStorage (private, survives reloads).
 *   2. Sam presses "Copy for Claude" and pastes the block into a conversation.
 *   3. Claude appends that block to `log` below, writes what changed into `changes`,
 *      edits curriculum.js accordingly, and redeploys.
 *   4. The page shows `changes` back to Sam, so the loop is visible rather than implied.
 *
 * Claude: append to these arrays, never rewrite history.
 */
window.FEEDBACK = {
  version: 1,
  updated: '2026-07-28',

  // Raw feedback Sam has sent, newest last.
  log: [
    // { date:'2026-08-04', drill:'w1-groove', difficulty:'right', kept:true, note:'…' }
  ],

  // What Claude changed as a result. This is the part that proves the loop works.
  changes: [
    {date:'2026-07-28', what:'Curriculum created. Month 1 written in full; Months 2–4 are themes only.',
     why:'Months 2–4 are deliberately unbuilt so they can be shaped by how Month 1 actually goes, rather than guessed at now.'},
    {date:'2026-07-28', what:'All four months shipped — 96 drills across 16 weeks. Months 2–4 written out in full.',
     why:'Sam asked for the whole arc up front rather than waiting on feedback. The drills can still be rewritten from feedback at any point; having them written just means you are never blocked on me.'},
  ],
};
