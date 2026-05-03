You are working in the repository `shilohg25/Multiple-Hotel-project`.

Goal: implement a ready-to-use Next.js + Supabase hotel booking web app for a multi-hotel business.

Use the attached/generated project files exactly as the source of truth. Do not invent business rules beyond the list below.

Business rules:

1. The app supports multiple hotels. It starts with Navarro Hotel and Tagosilangan, but the owner can add more hotels.
2. Hotel contact fields exist but are optional for now: address, phone, contact email, booking email, website, description, check-in time, check-out time.
3. Staff roles are only `owner`, `manager`, and `front_desk`.
4. Public online booking requires guest name, email, phone, dates, room, payment amount, payer name, payment information/details, and mandatory proof upload.
5. Do not add external payment gateway integration yet.
6. Do not ask public guests to select payment channel yet. Use one required payment-details text box plus mandatory proof upload.
7. Tentative bookings do not block dates.
8. Payment-submitted bookings do not block dates.
9. Only confirmed/down-payment-secured bookings block dates.
10. Tentative and payment-submitted bookings must still appear in the calendar/Gantt board for follow-up.
11. Paid/secured inquiries may overwrite tentative inquiries.
12. Secured and checked-in reservations must not overlap for the same room/date range.
13. No automated email API yet. Use editable manual email drafts with mailto links, copy-to-clipboard, and mark-as-sent tracking.
14. House-rules draft can be used when guest email exists.
15. Booking-confirmation draft must be enabled only after booking status is secured.
16. Build the daily sales/cash-count screen.
17. Use Supabase Auth for login.
18. Use Supabase Storage for private payment proof uploads.

Technical requirements:

- Next.js App Router.
- Supabase server/admin clients.
- Custom drag booking board; avoid paid Gantt/calendar dependencies.
- SQL migration in `supabase/migrations/0001_schema.sql`.
- Seed data in `supabase/seed.sql`.
- Include clear README setup instructions.
- Keep the app runnable with `npm install` and `npm run dev`.

Acceptance checks:

- `/login` works with Supabase Auth.
- `/dashboard` is protected.
- `/hotels` allows owner to add hotels.
- `/rooms` allows room setup.
- `/book/[hotelSlug]` accepts booking request and requires payment proof upload.
- Public booking creates reservation with `payment_submitted` status and payment with `submitted` status.
- `/payments` shows uploaded proofs.
- Reservation detail page allows owner/manager to confirm payments.
- Confirming sufficient payment changes reservation to `secured`.
- Secured reservation blocks room dates through database exclusion constraint.
- Tentative/payment-submitted reservations can overlap secured booking candidates until the payment is confirmed; confirmation fails if a secured conflict already exists.
- `/reservations` shows Gantt-style board and drag-to-move.
- `/sales` supports daily ledger entries and cash count.
