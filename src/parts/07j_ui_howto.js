// ============================================================
// How To — the instructions, built from HOWTO.md at build time
// ============================================================
// The estimators are sheet metal people, not software people. Everything they have
// to do that is not obvious from the screen belongs here, in plain English — above
// all how to get the takeoff export off their own machine, which the old workbook
// never told anyone.
'use strict';

router.routes.howto = {
  title: () => 'How To',
  needsBid: false,
  render(v) {
    v.append(el('div', { class: 'card' },
      el('h2', {}, 'How to use the Arctic Bid Tool',
        el('span', { class: 'spacer' }),
        el('button', { class: 'btn sm sec noprint', onclick: () => window.print() }, 'Print this')),
      el('div', { class: 'pad howto', html: HOWTO_HTML })));
  },
};
