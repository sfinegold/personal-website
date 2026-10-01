/* creatures.js — the drawn companions, one SVG per kind, with mood hooks.
 *
 * The deck registry names a creature kind (owl, fox, cat). The page drops the
 * matching drawing in and sets a mood class on the wrapper: happy, fine,
 * hungry, sick, asleep. Parts carry classes the CSS shows or hides per mood:
 *   .eye   open eyes          .lid   closed-eye lines (asleep, sick)
 *   .smile / .flat / .sad     mouths (happy+fine / hungry+asleep / sick)
 *   .zz    the sleep marks    .prop  the cultural prop (hidden when sick)
 * Add a kind: draw it in the same 120x120 box with these classes.
 */
window.CREATURE_ART = {
  owl: '<svg class="pet-art" viewBox="0 0 120 120" aria-hidden="true">' +
    '<ellipse cx="60" cy="112" rx="34" ry="5" fill="rgba(11,15,20,.12)"/>' +
    '<path d="M30 62 q0-34 30-34 q30 0 30 34 v28 q0 14-30 14 q-30 0-30-14z" fill="#E9DCC3" stroke="#0B0F14" stroke-width="3"/>' +
    '<path d="M32 78 q28 14 56 0 v12 q0 14-28 14 q-28 0-28-14z" fill="#FFFFFF" stroke="#0B0F14" stroke-width="3"/>' +
    '<path class="prop" d="M30 70 q10-8 20 0 v30 q-12 6-20-4z" fill="#FFFFFF" stroke="#0B0F14" stroke-width="3"/>' +
    '<circle cx="48" cy="58" r="10" fill="#fff" stroke="#0B0F14" stroke-width="3"/><circle cx="72" cy="58" r="10" fill="#fff" stroke="#0B0F14" stroke-width="3"/>' +
    '<g class="eye"><circle cx="50" cy="59" r="4.5" fill="#0B0F14"/><circle cx="74" cy="59" r="4.5" fill="#0B0F14"/></g>' +
    '<g class="lid" fill="none" stroke="#0B0F14" stroke-width="3" stroke-linecap="round"><path d="M42 59 q6 4 12 0"/><path d="M66 59 q6 4 12 0"/></g>' +
    '<g class="sad" fill="none" stroke="#0B0F14" stroke-width="3" stroke-linecap="round"><path d="M40 46 l10 4"/><path d="M80 46 l-10 4"/></g>' +
    '<g class="flat" fill="none" stroke="#0B0F14" stroke-width="3" stroke-linecap="round"><path d="M40 44 l10 2"/><path d="M80 44 l-10 2"/></g>' +
    '<path d="M56 68 l4 8 l4-8z" fill="#E8A33D" stroke="#0B0F14" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<g class="prop"><path d="M38 36 q22-10 44 0" fill="none" stroke="#2E6B4F" stroke-width="5" stroke-linecap="round"/>' +
    '<g fill="#2E6B4F"><ellipse cx="40" cy="36" rx="6" ry="3" transform="rotate(-40 40 36)"/><ellipse cx="50" cy="31" rx="6" ry="3" transform="rotate(-20 50 31)"/><ellipse cx="60" cy="29" rx="6" ry="3"/><ellipse cx="70" cy="31" rx="6" ry="3" transform="rotate(20 70 31)"/><ellipse cx="80" cy="36" rx="6" ry="3" transform="rotate(40 80 36)"/></g></g>' +
    '<path d="M40 32 l6-10 l6 8 M68 30 l6-8 l6 10" fill="#E9DCC3" stroke="#0B0F14" stroke-width="3" stroke-linejoin="round"/>' +
    '<path d="M88 96 q8-2 10 6 M32 98 q-8-2-10 6" fill="none" stroke="#0B0F14" stroke-width="3" stroke-linecap="round"/>' +
    '<path d="M50 104 v6 M58 104 v6 M62 104 v6 M70 104 v6" stroke="#E8A33D" stroke-width="3" stroke-linecap="round"/>' +
    '<text class="zz" x="92" y="30" font-family="Helvetica,Arial,sans-serif" font-weight="700" font-size="16" fill="#0B0F14">z<tspan font-size="11" dy="-8">z</tspan></text>' +
    '</svg>',

  fox: '<svg class="pet-art" viewBox="0 0 120 120" aria-hidden="true">' +
    '<ellipse cx="60" cy="112" rx="34" ry="5" fill="rgba(11,15,20,.12)"/>' +
    '<path d="M34 74 q-6 18 0 36 h52 q6-18 0-36z" fill="#C0392B" stroke="#0B0F14" stroke-width="3"/>' +
    '<path d="M52 76 v34 M68 76 v34" stroke="#0B0F14" stroke-width="2"/>' +
    '<path d="M52 76 l8 14 l8-14z" fill="#FFFFFF" stroke="#0B0F14" stroke-width="3" stroke-linejoin="round"/>' +
    '<path d="M30 66 q-2-24 14-34 l4-14 l12 12 q12-2 24 2 l8-12 l4 16 q10 10 8 30 q-2 14-37 14 q-35 0-37-14z" fill="#E8A33D" stroke="#0B0F14" stroke-width="3" stroke-linejoin="round"/>' +
    '<path d="M42 62 q18 18 36 0 q-4 16-18 16 q-14 0-18-16z" fill="#FFFFFF"/>' +
    '<g class="eye"><circle cx="50" cy="52" r="3.5" fill="#0B0F14"/><circle cx="70" cy="52" r="3.5" fill="#0B0F14"/></g>' +
    '<g class="lid" fill="none" stroke="#0B0F14" stroke-width="3" stroke-linecap="round"><path d="M45 52 q5 3 10 0"/><path d="M65 52 q5 3 10 0"/></g>' +
    '<circle cx="60" cy="60" r="3" fill="#0B0F14"/>' +
    '<path class="smile" d="M55 65 q5 5 10 0" fill="none" stroke="#0B0F14" stroke-width="3" stroke-linecap="round"/>' +
    '<path class="flat" d="M55 67 h10" fill="none" stroke="#0B0F14" stroke-width="3" stroke-linecap="round"/>' +
    '<path class="sad" d="M55 69 q5-5 10 0" fill="none" stroke="#0B0F14" stroke-width="3" stroke-linecap="round"/>' +
    '<g class="prop"><path d="M86 84 l20-14 l4 10 l-22 10z" fill="#FFFFFF" stroke="#0B0F14" stroke-width="3" stroke-linejoin="round"/><circle cx="104" cy="76" r="4" fill="#C0392B"/></g>' +
    '<text class="zz" x="92" y="36" font-family="Helvetica,Arial,sans-serif" font-weight="700" font-size="16" fill="#0B0F14">z<tspan font-size="11" dy="-8">z</tspan></text>' +
    '</svg>',

  cat: '<svg class="pet-art" viewBox="0 0 120 120" aria-hidden="true">' +
    '<g class="prop"><rect x="8" y="92" width="104" height="20" rx="3" fill="#C0392B" stroke="#0B0F14" stroke-width="3"/>' +
    '<path d="M14 102 h92 M22 96 l6 6 l-6 6 M38 96 l6 6 l-6 6 M54 96 l6 6 l-6 6 M70 96 l6 6 l-6 6 M86 96 l6 6 l-6 6" fill="none" stroke="#E8A33D" stroke-width="2"/></g>' +
    '<ellipse class="noprop" cx="60" cy="100" rx="34" ry="5" fill="rgba(11,15,20,.12)"/>' +
    '<path d="M30 70 q0-26 30-26 q30 0 30 26 v10 q0 14-30 14 q-30 0-30-14z" fill="#FFFFFF" stroke="#0B0F14" stroke-width="3"/>' +
    '<path d="M36 50 l2-16 l14 10 M84 50 l-2-16 l-14 10" fill="#FFFFFF" stroke="#0B0F14" stroke-width="3" stroke-linejoin="round"/>' +
    '<path d="M26 46 q-14 2-14 14 q0 4 4 4" fill="none" stroke="#0B0F14" stroke-width="3" stroke-linecap="round"/>' +
    '<path d="M30 60 q6 6 12 2 M78 62 q6 4 12-2" fill="none" stroke="rgba(11,15,20,.3)" stroke-width="2"/>' +
    '<g class="eye"><circle cx="50" cy="62" r="3.5" fill="#0B0F14"/><circle cx="70" cy="62" r="3.5" fill="#0B0F14"/></g>' +
    '<g class="lid" fill="none" stroke="#0B0F14" stroke-width="3" stroke-linecap="round"><path d="M45 62 q5 3 10 0"/><path d="M65 62 q5 3 10 0"/></g>' +
    '<path d="M57 69 q3 3 6 0 M60 69 v3" fill="none" stroke="#0B0F14" stroke-width="2.5" stroke-linecap="round"/>' +
    '<path class="smile" d="M54 73 q6 4 12 0" fill="none" stroke="#0B0F14" stroke-width="2.5" stroke-linecap="round"/>' +
    '<path class="flat" d="M55 74 h10" fill="none" stroke="#0B0F14" stroke-width="2.5" stroke-linecap="round"/>' +
    '<path class="sad" d="M54 76 q6-4 12 0" fill="none" stroke="#0B0F14" stroke-width="2.5" stroke-linecap="round"/>' +
    '<g class="prop"><path d="M90 78 h14 l-2 14 h-10z" fill="#E8A33D" stroke="#0B0F14" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<path d="M104 82 q6 0 6 5 q0 5-6 5" fill="none" stroke="#0B0F14" stroke-width="2.5"/>' +
    '<path d="M94 72 q2-4 0-8 M100 72 q2-4 0-8" fill="none" stroke="rgba(11,15,20,.4)" stroke-width="2" stroke-linecap="round"/></g>' +
    '<text class="zz" x="92" y="40" font-family="Helvetica,Arial,sans-serif" font-weight="700" font-size="16" fill="#0B0F14">z<tspan font-size="11" dy="-8">z</tspan></text>' +
    '</svg>',
  plus: '<svg class="pet-art" viewBox="0 0 120 120" aria-hidden="true">' +
    '<ellipse cx="60" cy="112" rx="30" ry="5" fill="rgba(11,15,20,.12)"/>' +
    '<path d="M44 20 h32 v24 h24 v32 h-24 v24 h-32 v-24 h-24 v-32 h24z" fill="#1D5C8A" stroke="#0B0F14" stroke-width="3" stroke-linejoin="round"/>' +
    '<path d="M48 24 h24 v20 h20 v8 h-44z" fill="rgba(255,255,255,.18)"/>' +
    '<g class="eye"><circle cx="52" cy="58" r="5" fill="#fff"/><circle cx="68" cy="58" r="5" fill="#fff"/><circle cx="53" cy="59" r="2.5" fill="#0B0F14"/><circle cx="69" cy="59" r="2.5" fill="#0B0F14"/></g>' +
    '<g class="lid" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M47 58 q5 3 10 0"/><path d="M63 58 q5 3 10 0"/></g>' +
    '<path class="smile" d="M52 70 q8 7 16 0" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>' +
    '<path class="flat" d="M52 72 h16" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>' +
    '<path class="sad" d="M52 74 q8-6 16 0" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>' +
    '<g class="prop"><text x="88" y="30" font-family="Helvetica,Arial,sans-serif" font-weight="700" font-size="16" fill="#0B0F14">×</text><text x="18" y="108" font-family="Helvetica,Arial,sans-serif" font-weight="700" font-size="14" fill="#0B0F14">=</text></g>' +
    '<text class="zz" x="90" y="28" font-family="Helvetica,Arial,sans-serif" font-weight="700" font-size="16" fill="#0B0F14">z<tspan font-size="11" dy="-8">z</tspan></text>' +
    '</svg>',

  zeus: '<svg class="pet-art" viewBox="0 0 120 120" aria-hidden="true">' +
    '<ellipse cx="60" cy="112" rx="34" ry="5" fill="rgba(11,15,20,.12)"/>' +
    '<path d="M30 76 q-6 16 0 34 h60 q6-18 0-34z" fill="#FFFFFF" stroke="#0B0F14" stroke-width="3"/>' +
    '<path d="M30 76 q30-12 60 0" fill="none" stroke="#0B0F14" stroke-width="3"/>' +
    '<path d="M34 80 q14 24 0 30" fill="#1D5C8A" stroke="#0B0F14" stroke-width="3"/>' +
    '<path d="M36 44 q0-22 24-22 q24 0 24 22 v16 q0 14-24 14 q-24 0-24-14z" fill="#F2D9C4" stroke="#0B0F14" stroke-width="3"/>' +
    '<path d="M34 60 q-6 22 26 24 q32-2 26-24 q-8 14-26 12 q-18 2-26-12z" fill="#FFFFFF" stroke="#0B0F14" stroke-width="3" stroke-linejoin="round"/>' +
    '<path d="M36 44 q-4-20 24-24 q28 4 24 24 q-10-10-24-10 q-14 0-24 10z" fill="#FFFFFF" stroke="#0B0F14" stroke-width="3" stroke-linejoin="round"/>' +
    '<g class="prop"><path d="M38 30 q22-10 44 0" fill="none" stroke="#E8A33D" stroke-width="4" stroke-linecap="round"/><g fill="#E8A33D"><ellipse cx="42" cy="30" rx="5" ry="2.5" transform="rotate(-40 42 30)"/><ellipse cx="52" cy="26" rx="5" ry="2.5" transform="rotate(-20 52 26)"/><ellipse cx="60" cy="24" rx="5" ry="2.5"/><ellipse cx="68" cy="26" rx="5" ry="2.5" transform="rotate(20 68 26)"/><ellipse cx="78" cy="30" rx="5" ry="2.5" transform="rotate(40 78 30)"/></g></g>' +
    '<g class="eye"><circle cx="51" cy="48" r="3" fill="#0B0F14"/><circle cx="69" cy="48" r="3" fill="#0B0F14"/></g>' +
    '<g class="lid" fill="none" stroke="#0B0F14" stroke-width="3" stroke-linecap="round"><path d="M46 48 q5 3 10 0"/><path d="M64 48 q5 3 10 0"/></g>' +
    '<g class="flat" fill="none" stroke="#0B0F14" stroke-width="3" stroke-linecap="round"><path d="M44 41 l12 3"/><path d="M76 41 l-12 3"/></g>' +
    '<g class="sad" fill="none" stroke="#0B0F14" stroke-width="3" stroke-linecap="round"><path d="M44 40 l12 5"/><path d="M76 40 l-12 5"/></g>' +
    '<path class="smile" d="M53 58 q7 5 14 0" fill="none" stroke="#0B0F14" stroke-width="2.5" stroke-linecap="round"/>' +
    '<g class="prop"><path d="M96 52 l-10 18 h8 l-8 22 l18-26 h-8 l8-14z" fill="#E8A33D" stroke="#0B0F14" stroke-width="2.5" stroke-linejoin="round"/></g>' +
    '<text class="zz" x="94" y="30" font-family="Helvetica,Arial,sans-serif" font-weight="700" font-size="16" fill="#0B0F14">z<tspan font-size="11" dy="-8">z</tspan></text>' +
    '</svg>',

  eagle: '<svg class="pet-art" viewBox="0 0 120 120" aria-hidden="true">' +
    '<ellipse cx="60" cy="112" rx="34" ry="5" fill="rgba(11,15,20,.12)"/>' +
    '<path d="M30 66 q0-18 30-18 q30 0 30 18 v30 q0 14-30 14 q-30 0-30-14z" fill="#5A4634" stroke="#0B0F14" stroke-width="3"/>' +
    '<path d="M22 60 q-10 20 4 40 q8-14 10-30z M98 60 q10 20-4 40 q-8-14-10-30z" fill="#5A4634" stroke="#0B0F14" stroke-width="3" stroke-linejoin="round"/>' +
    '<path d="M40 40 q0-18 20-18 q20 0 20 18 v10 q0 10-20 10 q-20 0-20-10z" fill="#FFFFFF" stroke="#0B0F14" stroke-width="3"/>' +
    '<path d="M60 48 l12 4 l-12 6z" fill="#E8A33D" stroke="#0B0F14" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<g class="eye"><circle cx="51" cy="40" r="3" fill="#0B0F14"/><circle cx="66" cy="40" r="3" fill="#0B0F14"/></g>' +
    '<g class="lid" fill="none" stroke="#0B0F14" stroke-width="3" stroke-linecap="round"><path d="M46 40 q5 3 10 0"/><path d="M61 40 q5 3 10 0"/></g>' +
    '<g class="flat" fill="none" stroke="#0B0F14" stroke-width="3" stroke-linecap="round"><path d="M44 33 l12 3"/><path d="M74 33 l-12 3"/></g>' +
    '<g class="sad" fill="none" stroke="#0B0F14" stroke-width="3" stroke-linecap="round"><path d="M44 32 l12 5"/><path d="M74 32 l-12 5"/></g>' +
    '<g class="prop"><rect x="44" y="6" width="32" height="18" fill="#0B0F14"/><rect x="38" y="22" width="44" height="5" fill="#0B0F14"/><rect x="44" y="16" width="32" height="5" fill="#C0392B"/><path d="M46 10 h28" stroke="#1D5C8A" stroke-width="3"/></g>' +
    '<path d="M50 110 v6 M56 110 v6 M64 110 v6 M70 110 v6" stroke="#E8A33D" stroke-width="3" stroke-linecap="round"/>' +
    '<text class="zz" x="90" y="30" font-family="Helvetica,Arial,sans-serif" font-weight="700" font-size="16" fill="#0B0F14">z<tspan font-size="11" dy="-8">z</tspan></text>' +
    '</svg>'
};
