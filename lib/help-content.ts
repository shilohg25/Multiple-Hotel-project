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
      'Amber rooms are arrivals. Open the room and press Check in.',
      'Green rooms are guests already in the hotel.',
      'Blue rooms leave today. Open the room and press Check out.',
      'Grey rooms are empty.',
      'Use the big buttons for a new check-in, a charge, a payment, an expense, or to close the day.'
    ]
  },
  {
    id: 'close',
    title: 'How to close the day',
    screen: 'close',
    summary: 'The totals are calculated. You count the money and name who was responsible.',
    steps: [
      'Read the sales, expenses, and cash on hand. Do not retype those numbers.',
      'Count the revolving fund by itself. It should come back to the float, usually ₱10,000.',
      'Count the cash that will go to the bank in the other box.',
      'Choose the staff member responsible for this shift.',
      'If the result says Short or Excess, write what happened.',
      'Save the draft. A manager locks the day. After that, the day cannot be edited unless a manager unlocks it.'
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
    summary: 'Walk-in and OTA prices are already set. Front desk does not change them.',
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
  { question: 'What is the RVF?', answer: 'It is the cash float that stays in the drawer, usually ₱10,000. Count it separately from the money you will deposit.' },
  { question: 'What if I am short?', answer: 'Write a note before the day can be locked. The shortage is recorded against the staff member named on the shift. A manager can see that charge.' },
  { question: 'Which button do I use for the restaurant?', answer: 'Pick Sotera Café or Tago Resto at the top of Today. The steps are the same as the hotel.' }
];
