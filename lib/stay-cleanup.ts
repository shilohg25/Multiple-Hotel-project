/**
 * What to tell staff after a failed save tries to undo a stay.
 * "Not held" is used only when the reservation is gone or cancelled.
 */
export function interpretStayCleanup(input: {
  reservationDeleteFailed: boolean;
  reservationCancelFailed: boolean;
  guestDeleteFailed: boolean;
  ledgerDeleteFailed: boolean;
}): { roomHeld: boolean; message: string } {
  const roomHeld = input.reservationDeleteFailed && input.reservationCancelFailed;
  if (roomHeld) {
    return {
      roomHeld: true,
      message: 'The payment could not be saved, and the room is still held. Cancel the stay before using the room.'
    };
  }
  const notes = ['The room is not held.'];
  if (input.guestDeleteFailed) notes.push('The guest record could not be removed.');
  if (input.ledgerDeleteFailed) notes.push('The cash record could not be removed.');
  return { roomHeld: false, message: notes.join(' ') };
}

export function balanceDueLabel(balance: number): { label: string; amount: number } {
  const rounded = Math.round(Number(balance || 0) * 100) / 100;
  if (rounded < 0) return { label: 'Refund due', amount: Math.abs(rounded) };
  return { label: 'Balance due', amount: rounded };
}
