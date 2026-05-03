# Workflow mapped from attached Excel samples

The app was designed around the workflow shown in the uploaded hotel spreadsheets.

## Reservation tracker pattern

Source file: `TAGOSILANGAN NEW RESERVATIONS(1).xlsx`

| Spreadsheet column | App field |
|---|---|
| Reservation Method | `reservations.booking_source` |
| Room Type | `rooms.name` / `rooms.room_type_name` |
| With Breakfast? | `reservations.with_breakfast` |
| Guest Name/s | `guests.full_name` |
| Check-in Date | `reservations.check_in` |
| Check-out Date | `reservations.check_out` |
| # of Nights | generated database field `reservations.nights` |
| # of Pax | `reservations.guest_count` |
| Posted Room Rate | `reservations.posted_room_rate` |
| Addtl Surcharge | `reservations.surcharge_label` |
| Surcharge Amount | `reservations.surcharge_amount` |
| Total Amount | `reservations.total_amount` |
| Downpayment | `reservations.downpayment_required` plus `payments.amount` |
| Status of Payment | `payments.status` and `reservations.status` |
| Outstanding Balance/s | calculated on reservation detail page |
| Mode of Payment | `payments.method` for staff-entered payments |
| Reservation Confirmed By | `payments.confirmed_by` and `audit_logs` |

## Collectibles / follow-up pattern

Source file: `COLLE(CTABLES) NAVARRO(1).xlsx`

The spreadsheet tracks guest, company/source, room, total amount, partial payments, outstanding balance, and status.

The app maps this to:

- `reservations.total_amount`
- `payments.amount`
- `payments.status`
- calculated confirmed payment total
- calculated balance
- `ledger_entries.is_collectible`
- reservation status flow: `tentative` → `payment_submitted` → `secured`

## Daily calculation / front-desk sales pattern

Source file: `NAVARRO Format Calculation(1).xlsx`

The app includes a `/sales` screen for:

- daily ledger entries
- room payments
- add-ons
- deposits
- collectibles/unpaid entries
- cash count by denomination
- cash variance

These records are stored in:

- `ledger_entries`
- `cash_counts`

## Updated business rules implemented

- Multi-hotel architecture with owner-level hotel creation.
- Staff roles limited to owner, manager, and front desk.
- Staff login through Supabase Auth.
- Online booking page per hotel: `/book/[hotelSlug]`.
- Online booking requires payment information and proof upload.
- Public booking does not ask for a payment channel yet.
- Tentative and payment-submitted inquiries do not block dates.
- Secured and checked-in bookings block dates.
- Paid inquiries can overwrite tentative inquiries.
- Payment confirmation changes bookings to secured once the down payment requirement is met.
- Manual email drafts replace email API automation.
- Gantt-style booking board supports mouse dragging across rooms and dates.
- Daily sales/cash-count screen is built.
