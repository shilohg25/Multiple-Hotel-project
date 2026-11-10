import type { MessageCatalog } from './types';

/** Machine draft. An Aklanon speaker should review this before staff rely on it. */
export const akl: MessageCatalog = {
  needsReview: true,
  labels: {
    'nav.today': 'Makaron',
    'nav.sales': 'Baligya makaron',
    'nav.help': 'Paano',
    'nav.helpButton': 'Bulig',
    'today.title': 'Makaron',
    'today.emptyHint': 'Normal nga ueang sa listahan. Kon ueang gaabot, tan-awa kon sin-o ro ara sa sueod ag kon sin-o ro magahalin.',
    'today.arrivals': 'Mga abot',
    'today.inHouse': 'Ara sa sueod',
    'today.departures': 'Mga halin',
    'today.checkIn': 'Check-in',
    'today.charge': 'Dugangi ro bayad',
    'today.payment': 'Irekord ro bayad',
    'today.whichStay': 'Diin nga stay ang butangan it charge o bayad?',
    'today.chooseStay': 'Pili-a anay ro kuwarto o bisita',
    'today.expense': 'Dugangi ro gasto',
    'today.close': 'Isara ro adlaw',
    'today.rooms': 'Mga kuwarto',
    'today.noArrivals': 'Ueang gaabot.',
    'today.noInHouse': 'Ueang bisita sa sueod.',
    'today.noDepartures': 'Ueang magahalin.',
    'close.title': 'Isara ro adlaw',
    'close.lead': 'Front desk ro magalista. Manager ro mag-lock.',
    'close.back': 'Balik sa Makaron',
    'close.print': 'I-print',
    'help.title': 'Paano',
    'help.intro': 'Malip-ot nga mga tikang para sa bag-ong shift. Ro app ro magakuwenta. Kamo ro mag-isip it kuwarta ag magpangayo sa manager kon kinahanglan it approval.',
    'help.questions': 'Mga pamangkot',
    'help.allGuides': 'Buksi tanan nga giya',
    'lang.review': 'Draft nga hubad ini ag kinahanglan pa nga marebyu.'
  },
  guides: {
    today: {
      title: 'Paano gamiton ro Makaron',
      summary: 'Una nga screen it shift. Makita kon sin-o ro gaabot, ara, ag magahalin.',
      steps: [
        'Tan-awa ro property ag ro petsa. Para sa Sotera Café o Tago Resto, pili-a ro outlet.',
        'Amber nga kuwarto ro gaabot. Buksi ag pinduta ro Check-in.',
        'Berde ro ara eon sa sueod.',
        'Asul ro magahalin makaron. Buksi ag pinduta ro Check-out.'
      ]
    },
    close: {
      title: 'Paano isara ro adlaw',
      summary: 'Nakalkula eon ro mga total. Isipa ro kuwarta ag isulat kon sin-o ro responsable.',
      steps: [
        'Basaha ro baligya, gasto, ag cash on hand. Indi eon pag-type liwat.',
        'Isipa nga lang ro revolving fund. Dapat magbalik sa float, masami ₱10,000.',
        'Sa pihak nga kahon, isipa ro cash nga i-deposit sa bangko.',
        'Kon Short o Excess, isulat kon ham-an. Manager ro mag-lock.'
      ]
    }
  },
  faqs: [
    { question: 'Paano kon ueang gaabot?', answer: 'Normal ra. Ueang sa arrivals. Tan-awa ro ara sa sueod ag ro magahalin.' },
    { question: 'Sin-o ro nag-lock it adlaw?', answer: 'Front desk ro nagalista. Manager ro nag-lock. Kinahanglan it rason para mabukas liwat.' },
    { question: 'Ano ro RVF?', answer: 'Float nga nabilin sa drawer, masami ₱10,000. Ibulag sa i-deposit.' }
  ]
};
