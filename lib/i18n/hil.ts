import type { MessageCatalog } from './types';

/** Machine draft. A Hiligaynon speaker should review this before staff rely on it. */
export const hil: MessageCatalog = {
  needsReview: true,
  labels: {
    'nav.today': 'Subong',
    'nav.sales': 'Baligya subong',
    'nav.help': 'Paano',
    'nav.helpButton': 'Bulig',
    'today.title': 'Subong',
    'today.emptyHint': 'Normal lang nga wala sang lista. Kon wala sang gaabot, tan-awa ang ara sa sulod kag ang maga-halin.',
    'today.arrivals': 'Mga abot',
    'today.inHouse': 'Ara sa sulod',
    'today.departures': 'Mga halin',
    'today.checkIn': 'Check-in',
    'today.charge': 'Dugangi ang bayad',
    'today.payment': 'Irekord ang bayad',
    'today.whichStay': 'Diin nga stay ang butangan sang charge ukon bayad?',
    'today.chooseStay': 'Pilia anay ang kuwarto ukon ang bisita',
    'today.expense': 'Dugangi ang gasto',
    'today.close': 'Isira ang adlaw',
    'today.rooms': 'Mga kuwarto',
    'today.noArrivals': 'Wala sang gaabot.',
    'today.noInHouse': 'Wala sang bisita sa sulod.',
    'today.noDepartures': 'Wala sang maga-halin.',
    'close.title': 'Isira ang adlaw',
    'close.lead': 'Ang front desk ang magalistahan. Ang manager ang mag-lock.',
    'close.back': 'Balik sa Subong',
    'close.print': 'I-print',
    'help.title': 'Paano',
    'help.intro': 'Malip-ot nga mga tikang para sa bag-o nga shift. Ang app ang mag-kalkula. Kamo ang mag-isip sang kuwarta kag magpangayo sa manager kon kinahanglan sang approval.',
    'help.questions': 'Mga pamangkot',
    'help.allGuides': 'Buksan ang tanan nga giya',
    'lang.review': 'Draft ini nga hubad kag kinahanglan pa sang review.'
  },
  guides: {
    today: {
      title: 'Paano gamiton ang Subong',
      summary: 'Amo ini ang una nga screen. Makita kon sin-o ang gaabot, ara, kag maga-halin.',
      steps: [
        'Tan-awa ang property kag ang petsa. Para sa Sotera Café ukon Tago Resto, pili-a ang outlet.',
        'Ang amber nga kuwarto gaabot. Buksan kag pinduta ang Check-in.',
        'Ang berde ara na sa sulod.',
        'Ang asul maga-halin subong. Buksan kag pinduta ang Check-out.'
      ]
    },
    close: {
      title: 'Paano isira ang adlaw',
      summary: 'Nakalkula na ang mga total. Isipa ang kuwarta kag isulat kon sin-o ang responsable.',
      steps: [
        'Basaha ang baligya, gasto, kag cash on hand. Indi na pag-type liwat.',
        'Isipa nga lang ang revolving fund. Dapat magbalik ini sa float, masami ₱10,000.',
        'Sa pihak nga kahon, isipa ang cash nga i-deposit sa bangko.',
        'Kon Short ukon Excess, isulat kon ngaa. Ang manager ang mag-lock.'
      ]
    }
  },
  faqs: [
    { question: 'Paano kon wala sang gaabot?', answer: 'Normal ina. Wala sang sulod ang arrivals. Tan-awa ang ara sa sulod kag ang maga-halin.' },
    { question: 'Sin-o ang nag-lock sang adlaw?', answer: 'Ang front desk ang nagalistahan. Ang manager ang nag-lock. Kinahanglan sang rason para buksan liwat.' },
    { question: 'Ano ang RVF?', answer: 'Amo ini ang float nga nabilin sa drawer, masami ₱10,000. Ibulag ini sa i-deposit.' }
  ]
};
