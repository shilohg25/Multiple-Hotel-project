import type { MessageCatalog } from './types';

export const en: MessageCatalog = {
  needsReview: false,
  labels: {
    'nav.today': 'Today',
    'nav.sales': 'Daily sales',
    'nav.help': 'How to',
    'nav.helpButton': 'Help',
    'today.title': 'Today',
    'today.emptyHint': 'Empty lists are normal. If nobody is arriving, check who is in house and who is leaving.',
    'today.arrivals': 'Arrivals',
    'today.inHouse': 'In house',
    'today.departures': 'Departures',
    'today.checkIn': 'Check in',
    'today.charge': 'Add charge',
    'today.payment': 'Record payment',
    'today.expense': 'Add expense',
    'today.close': 'Close the day',
    'today.rooms': 'Rooms',
    'today.noArrivals': 'No one is due to arrive.',
    'today.noInHouse': 'No guests are in house.',
    'today.noDepartures': 'No one is due to leave.',
    'close.title': 'Close the day',
    'close.lead': 'Front desk fills this in. A manager locks it.',
    'close.back': 'Back to today',
    'close.print': 'Print',
    'help.title': 'How to',
    'help.intro': 'Short steps for a new shift. The app calculates the totals. You count the cash, name the guest, and ask a manager when a price or a day needs approval.',
    'help.questions': 'Questions',
    'help.allGuides': 'Open all guides',
    'lang.review': 'This translation is a draft and needs review.'
  },
  guides: {
    today: {
      title: 'How to use Today',
      summary: 'Today is the first screen of the shift. It shows who is coming, who is here, and who is leaving.',
      steps: [
        'Check the property and the date at the top. For Sotera Café or Tago Resto, pick that outlet.',
        'Amber rooms are arrivals. Open the room and press Check in.',
        'Green rooms are guests already in the hotel.',
        'Blue rooms leave today. Open the room and press Check out.'
      ]
    },
    close: {
      title: 'How to close the day',
      summary: 'The totals are calculated. You count the money and name who was responsible.',
      steps: [
        'Read the sales, expenses, and cash on hand. Do not retype those numbers.',
        'Count the revolving fund by itself. It should come back to the float, usually ₱10,000.',
        'Count the cash that will go to the bank in the other box.',
        'If the result says Short or Excess, write what happened. A manager locks the day.'
      ]
    }
  },
  faqs: [
    { question: 'What if nobody is arriving?', answer: 'That is normal. The arrivals box stays empty. Check the in-house list and the departures.' },
    { question: 'Who locks the day?', answer: 'Front desk fills in the count. A manager locks it. Only a manager can open it again, and they must write why.' },
    { question: 'What is the RVF?', answer: 'It is the cash float that stays in the drawer, usually ₱10,000. Count it separately from the money you will deposit.' }
  ]
};
