export function guestCardCharge(baseAmount: number, surchargePercent: number): number {
  return Math.round(Number(baseAmount || 0) * (1 + Number(surchargePercent || 0) / 100) * 100) / 100;
}

/** Bank credit on the guest charge. 2317.50 at 3.5% MDR is about 2236.39 after half-up rounding. */
export function cardSettlementNet(guestCharge: number, mdrPercent: number): number {
  return Math.round(Number(guestCharge || 0) * (1 - Number(mdrPercent || 0) / 100) * 100) / 100;
}
