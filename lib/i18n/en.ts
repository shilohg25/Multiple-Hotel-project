import type { MessageCatalog } from './types';

export const en: MessageCatalog = {
  needsReview: false,
  labels: {
    'nav.today': 'Today',
    'nav.sales': 'Daily cash sheet',
    'nav.help': 'How to',
    'nav.helpButton': 'Help',
    'today.title': 'Today',
    'today.emptyHint': 'Empty lists are normal. If nobody is arriving, check who is in house and who is leaving.',
    'today.arrivals': 'Arrivals',
    'today.inHouse': 'In house',
    'today.departures': 'Departures',
    'today.overdue': 'Overdue',
    'today.checkIn': 'Check in guest',
    'today.walkIn': 'Walk-in',
    'today.charge': 'Add charge',
    'today.payment': 'Record payment',
    'today.whichStay': 'Which stay for a charge or payment?',
    'today.chooseStay': 'Choose a room or guest first',
    'today.stayArrival': 'Arrival',
    'today.stayInHouse': 'In house',
    'today.stayDeparture': 'Departure',
    'today.stayOverdue': 'Overdue',
    'today.noStayToCharge': 'No stays to add a charge or payment to today.',
    'today.room': 'Room',
    'today.expense': 'Add expense',
    'today.close': 'Daily cash sheet',
    'today.rooms': 'Rooms',
    'today.noArrivals': 'No one is due to arrive.',
    'today.noInHouse': 'No guests are in house.',
    'today.noDepartures': 'No one is due to leave.',
    'today.noOverdue': 'No overdue stays.',
    'close.title': 'Daily cash sheet',
    'close.lead': 'Room payments fill in by themselves. Type only the rest, then count the cash once. A manager locks it.',
    'close.back': 'Back to today',
    'close.print': 'Print',
    'close.heldQuestion': "An earlier {old} didn't save. Send {old}, or replace it with {new}?",
    'close.heldSend': 'Send {old}',
    'close.heldReplace': 'Replace with {new}',
    'close.heldAlreadySaved': '{old} was already saved. Correct it with an adjustment.',
    'close.heldReplacementExists': '{amount} was already saved as the replacement. Correct it with an adjustment.',
    'close.heldInFlight': 'That entry is being sent from another tab. Check again in a moment.',
    'close.sentElsewhere': '{old} was already sent from another tab.',
    'close.sentElsewhereEdited': '{old} was already sent from another tab. Your edit {new} was not saved. Correct it with an adjustment if needed.',
    'close.saveAsNew': 'Save {new} as a new entry',
    'close.clearForm': 'Clear form',
    'close.heldInFlightStuck': "The other tab hasn't finished sending this entry. If that tab was closed, reload this page.",
    'close.sentHere': '{old} was sent.',
    'close.sentHereEdited': '{old} was sent. Your edit {new} was not saved. Correct it with an adjustment if needed.',
    'close.heldGone': 'This entry was already sent or replaced in another tab. Nothing more was saved.',
    'close.entrySaved': '{amount} saved.',
    'help.title': 'How to',
    'help.intro': 'Short steps for a new shift. The app calculates the totals. You count the cash, name the guest, and ask a manager when a price or a day needs approval.',
    'help.questions': 'Questions',
    'help.allGuides': 'Open all guides',
    'lang.review': 'This translation is a draft and needs review.'
  },
  guides: {
    today: {
      title: 'How to use Today',
      summary: 'Today is the first screen of the shift. It shows who is coming, who is here, who is leaving, and anyone still checked in after checkout.',
      steps: [
        'Check the property and the date at the top. For Sotera Café or Tago Resto, pick that outlet.',
        'Amber rooms are arrivals. Open the room and press Check in.',
        'Green rooms are guests already in the hotel.',
        'Blue rooms leave today. Open the room and press Check out.',
        'Rose rooms are overdue: still checked in after their checkout date. Open the stay, collect any balance, and check them out.'
      ]
    },
    close: {
      title: 'How to fill in the daily cash sheet',
      summary: 'One sheet for the day. Room payments fill in by themselves. You type the rest and count the money once.',
      steps: [
        'Room payments confirmed today are already on the sheet. Do not type them again.',
        'Type only walk-in or restaurant sales, add-ons sold at the desk, expenses, and unpaid amounts.',
        'Count the revolving fund by itself. It should come back to the float, usually ₱10,000.',
        'Count the cash still in the drawer in the other box. This is the only cash count for the day.',
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
