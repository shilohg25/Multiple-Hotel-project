import type { MessageCatalog } from './types';

/** Machine draft. A Tagalog speaker should review this before staff rely on it. */
export const tl: MessageCatalog = {
  needsReview: true,
  labels: {
    'nav.today': 'Ngayon',
    'nav.sales': 'Benta ngayon',
    'nav.help': 'Paano',
    'nav.helpButton': 'Tulong',
    'today.title': 'Ngayon',
    'today.emptyHint': 'Normal lang ang walang laman. Kung walang darating, tingnan kung sino ang nasa loob at kung sino ang aalis.',
    'today.arrivals': 'Darating',
    'today.inHouse': 'Nasa loob',
    'today.departures': 'Aalis',
    'today.checkIn': 'Check-in',
    'today.charge': 'Magdagdag ng singil',
    'today.payment': 'Irekord ang bayad',
    'today.whichStay': 'Aling stay ang sisingilin o babayaran?',
    'today.chooseStay': 'Pumili muna ng kuwarto o bisita',
    'today.expense': 'Magdagdag ng gastos',
    'today.close': 'Isara ang araw',
    'today.rooms': 'Mga kuwarto',
    'today.noArrivals': 'Walang darating.',
    'today.noInHouse': 'Walang bisita sa loob.',
    'today.noDepartures': 'Walang aalis.',
    'close.title': 'Isara ang araw',
    'close.lead': 'Ang front desk ang magpupuno. Ang manager ang magla-lock.',
    'close.back': 'Bumalik sa Ngayon',
    'close.print': 'I-print',
    'help.title': 'Paano',
    'help.intro': 'Maikling hakbang para sa bagong shift. Kinakalkula ng app ang mga total. Bilangin ninyo ang pera, isulat ang pangalan, at magtanong sa manager kapag kailangan ng approval.',
    'help.questions': 'Mga tanong',
    'help.allGuides': 'Buksan ang lahat ng gabay',
    'lang.review': 'Draft ang saling ito at kailangan pang suriin.'
  },
  guides: {
    today: {
      title: 'Paano gamitin ang Ngayon',
      summary: 'Ito ang unang screen ng shift. Makikita kung sino ang darating, narito, at aalis.',
      steps: [
        'Tingnan ang property at ang petsa sa itaas. Para sa Sotera Café o Tago Resto, piliin ang outlet.',
        'Ang amber na kuwarto ay darating. Buksan ito at pindutin ang Check-in.',
        'Ang berde ay bisitang nasa loob na.',
        'Ang asul ay aalis ngayon. Buksan at pindutin ang Check-out.'
      ]
    },
    close: {
      title: 'Paano isara ang araw',
      summary: 'Kinakalkula na ang mga total. Bilangin ninyo ang pera at isulat kung sino ang responsable.',
      steps: [
        'Basahin ang benta, gastos, at cash on hand. Huwag nang i-type ulit.',
        'Bilangin nang mag-isa ang revolving fund. Dapat bumalik ito sa float, karaniwang ₱10,000.',
        'Sa kabilang kahon, bilangin ang cash na ide-deposit sa bangko.',
        'Kung Short o Excess, isulat kung bakit. Ang manager ang magla-lock.'
      ]
    }
  },
  faqs: [
    { question: 'Paano kung walang darating?', answer: 'Normal iyon. Walang laman ang arrivals. Tingnan ang nasa loob at ang aalis.' },
    { question: 'Sino ang nagla-lock ng araw?', answer: 'Ang front desk ang nagpupuno. Ang manager ang nagla-lock. Kailangan ng dahilan para buksan ulit.' },
    { question: 'Ano ang RVF?', answer: 'Ito ang float na nananatili sa drawer, karaniwang ₱10,000. Ibukod ito sa ide-deposit.' }
  ]
};
