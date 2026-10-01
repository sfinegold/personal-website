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
    '</svg>'
};
