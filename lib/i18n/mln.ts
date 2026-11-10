import type { MessageCatalog } from './types';

/** Machine draft. A Malaynon speaker should review this before staff rely on it. */
export const mln: MessageCatalog = {
  needsReview: true,
  labels: {
    'nav.today': 'Makaron',
    'nav.sales': 'Baligya makaron',
    'nav.help': 'Paano-on',
    'nav.helpButton': 'Bulig',
    'today.title': 'Makaron',
    'today.emptyHint': 'Normal nga uwa it listahan. Kung uwa gaabot, tan-awa kon sin-o ro yara sa sueod ag ro magahalin.',
    'today.arrivals': 'Mga abot',
    'today.inHouse': 'Yara sa sueod',
    'today.departures': 'Mga halin',
    'today.checkIn': 'Check-in',
    'today.charge': 'Dugangan ro bayad',
    'today.payment': 'Isulat ro bayad',
    'today.expense': 'Dugangan ro gasto',
    'today.close': 'Isara ro adlaw',
    'today.rooms': 'Mga kwarto',
    'today.noArrivals': 'Uwa gaabot.',
    'today.noInHouse': 'Uwa bisita sa sueod.',
    'today.noDepartures': 'Uwa magahalin.',
    'close.title': 'Isara ro adlaw',
    'close.lead': 'Front desk ro magalista. Manager ro mag-lock.',
    'close.back': 'Balik sa Makaron',
    'close.print': 'I-print',
    'help.title': 'Paano-on',
    'help.intro': 'Malip-ot nga mga tikang para sa bag-ong shift. Ro app ro magkuwenta. Kamo ro mag-isip it kwarta ag magpangutana sa manager kung kinahanglan it approval.',
    'help.questions': 'Mga pamangkot',
    'help.allGuides': 'Buksan tanan nga giya',
    'lang.review': 'Draft nga hubad ini ag kinahanglan pa marebyu.'
  },
  guides: {
    today: {
      title: 'Paano gamiton ro Makaron',
      summary: 'Una nga screen. Makita kon sin-o ro gaabot, yara, ag magahalin.',
      steps: [
        'Tan-awa ro property ag ro petsa. Para sa Sotera Café o Tago Resto, pili-a ro outlet.',
        'Amber nga kwarto ro gaabot. Buksan ag pinduta ro Check-in.',
        'Berde ro yara eon sa sueod.',
        'Asul ro magahalin makaron. Buksan ag pinduta ro Check-out.'
      ]
    },
    close: {
      title: 'Paano isara ro adlaw',
      summary: 'Nakalkula eon ro mga total. Isipa ro kwarta ag isulat kon sin-o ro responsable.',
      steps: [
        'Basaha ro baligya, gasto, ag cash on hand. Uwa eon pag-type liwat.',
        'Isipa nga isaea ro revolving fund. Dapat magbalik sa float, masami ₱10,000.',
        'Sa pihak nga kahon, isipa ro cash nga i-deposit sa bangko.',
        'Kung Short o Excess, isulat kon basihon. Manager ro mag-lock.'
      ]
    }
  },
  faqs: [
    { question: 'Paano kung uwa gaabot?', answer: 'Normal ra. Uwa sa arrivals. Tan-awa ro yara sa sueod ag ro magahalin.' },
    { question: 'Sin-o ro nag-lock it adlaw?', answer: 'Front desk ro nagalista. Manager ro nag-lock. Kinahanglan it rason para mabuksan liwat.' },
    { question: 'Ano ro RVF?', answer: 'Float nga nabilin sa drawer, masami ₱10,000. Ibulag sa i-deposit.' }
  ]
};
