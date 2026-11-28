export type HelpGuide = {
  id: string;
  title: string;
  screen: 'today' | 'close' | 'general';
  summary: string;
  steps: string[];
};

export const helpGuides: HelpGuide[] = [
  {
    id: 'today',
    title: 'How to use Today',
    screen: 'today',
    summary: 'Today is the first screen of the shift. It shows who is coming, who is here, and who is leaving.',
    steps: [
      'Check the property and the date at the top. For Sotera Café or Tago Resto, pick that outlet.',
      'Amber rooms are arrivals. Open the stay and use Check in guest.',
      'Green rooms are guests already in the hotel.',
      'Blue rooms leave today. Open the room and press Check out.',
      'Grey rooms are empty.',
      'Use Walk-in for a new guest who has no booking yet. The other big buttons are for a charge, a payment, an expense, or the Daily cash sheet.'
    ]
  },
  {
    id: 'close',
    title: 'How to fill in the daily cash sheet',
    screen: 'close',
    summary: 'One sheet for the day. Room payments fill in by themselves. You type the rest and count the money once.',
    steps: [
      'Look at "Already in the app". Confirmed room payments are there already. Do not type them again.',
      'Under "Typed today", add only walk-in or restaurant sales, add-ons sold at the desk, expenses, and unpaid amounts.',
      'Count the revolving fund (RVF) by itself. It should come back to the float, usually ₱10,000.',
      'Count the cash still in the drawer in the other box. This is the only cash count for the day.',
      'Choose the staff member responsible for this shift.',
      'If the result says Short or Excess, write what happened.',
      'Press Save cash sheet. A manager locks the day. After that, the day cannot be edited unless a manager unlocks it.'
    ]
  },
  {
    id: 'checkin-hours',
    title: 'Early check-in and late check-out',
    screen: 'general',
    summary: 'Standard times are 2:00 PM in and 12:00 noon out, unless the property changed them.',
    steps: [
      'If a guest comes early or leaves late, request the number of hours on the stay.',
      'Write a short reason, such as the arrival time.',
      'A manager approves it. The charge then appears on the folio.',
      'The hourly price is a setting. Do not do the math yourself.'
    ]
  },
  {
    id: 'rates',
    title: 'When the price is different',
    screen: 'general',
    summary: 'Walk-in and OTA (online travel agency, like Booking.com) prices are already set. Front desk does not change them.',
    steps: [
      'If the guest was promised a different price, request it on the stay and write why.',
      'A manager approves or rejects it.',
      'Card payments show the guest total with the surcharge. You do not add 3% by hand.'
    ]
  }
];

export const helpFaqs = [
  { question: 'What if nobody is arriving?', answer: 'That is normal. The arrivals box stays empty. Check the in-house list and the departures.' },
  { question: 'Who locks the day?', answer: 'Front desk fills in the count. A manager locks it. Only a manager can open it again, and they must write why.' },
  { question: 'What is the RVF (revolving fund)?', answer: 'It is the cash float that stays in the drawer, usually ₱10,000. Count it separately from the money you will deposit.' },
  { question: 'What is an OTA?', answer: 'OTA means online travel agency, like Booking.com, Trip.com, or Expedia. Those stays use a separate OTA price, and the agency usually collects the payment.' },
  { question: 'What is MDR?', answer: "MDR is the bank's card fee (merchant discount rate). The app uses it to estimate what the bank will credit after a card payment. You do not type this fee by hand." },
  { question: 'What if I am short?', answer: 'Write a note before the day can be locked. The shortage is recorded against the staff member named on the shift. A manager can see that charge.' },
  { question: 'Which button do I use for the restaurant?', answer: 'Pick Sotera Café or Tago Resto at the top of Today. The steps are the same as the hotel.' }
];
