# AlternateMe implementation plan

Someone moving to a new city can search for a home, find a person to rent with, or do both. Someone with a spare room can publish it and answer enquiries in the same app. Use FlatX as the reference for housing discovery and a mutual-like interaction for flatmate discovery. The first release targets mobile web.

## Three entry points

- **Find a flat.** Choose a city, set a monthly budget, compare results, open a listing and send the poster a question. Keep filters in the URL so returning from a detail page restores the search.
- **Find a flatmate.** Publish a flatmate profile with target areas, budget per person, move dates and household habits. People can join even when neither person has a flat. Each card shows shared preferences and relevant differences, with accessible Like and Pass buttons alongside swipe gestures.
- **Post a flat or room.** Choose the offer type, enter terms, upload photos, preview the public card and publish. The poster can edit, pause, mark a place filled or reopen it. Only published, available offers appear in search.

## Listing form and search contract

Use one definition for each field across posting, validation, filters and listing details. Label costs per month and distinguish the whole-flat price from the price of one room. Record currency on every amount.

| Group | Poster enters | Seeker filters |
| --- | --- | --- |
| Location | City, neighbourhood and approximate map location | City, selected areas or radius |
| Cost | Monthly rent, deposit, maintenance, utilities and brokerage | Rent range, maximum deposit, no brokerage, utilities included |
| Space | Whole flat, private room or shared room, bedroom and bathroom counts, occupancy | Offer type, bedrooms, private bathroom, occupants |
| Timing | Available date, minimum stay and lease type | Move-in date, intended stay and lease type |
| Features | Furnishing, parking, lift, step-free access, laundry, air conditioning and internet | Furnishing level and required amenities |
| Household | Pet and smoking policies, existing household size | Pet-friendly, smoking policy and household size |

Required fields include location, offer type, rent, currency and availability. Show optional missing details as unknown. Combine filter groups with AND, accept any selected neighbourhood, and require every selected amenity. Sort by newest or monthly rent within the selected currency. Show active filters and offer individual removal when results are empty. Keep the precise address private.

## Flatmate eligibility and ranking

Ask whether someone has a place or wants to team up. Capture neighbourhoods, monthly budget range, acceptable move-in window, stay length, smoking and pet requirements. Let users mark household preferences such as quiet hours, cleaning, guests and work schedule as important or flexible.

First require compatible search intentions, a shared area, overlapping budget and date ranges, and satisfaction of both people's deal-breakers. Exclude self, blocked accounts, inactive profiles and previously decided cards. Rank eligible profiles by the share of answered preferences they agree on, weighting important preferences twice. Show the actual reasons on the card, such as “Both prefer quiet after 10 pm.” Show profiles with insufficient answers after scored profiles. Break ties by recent activity and stable profile ID.

For example, two people seeking a place in the same area with budgets of 700–900 and 850–1000 can appear to each other if their dates overlap. A required pet-friendly household rules out a candidate who explicitly cannot live with pets. An unanswered deal-breaker stays ineligible until answered.

## Chat and permissions

A listing enquiry opens one thread per listing and seeker. The first message includes listing context and arrives as a request the poster can accept or decline. Flatmate chat opens after reciprocal likes. Concurrent likes must create exactly one match and one thread for the pair. A shared inbox labels each conversation with the listing or flatmate match that started it.

Authenticate senders and check membership on every read, send and realtime subscription. Persist messages before broadcasting them, deduplicate retries by sender and client message ID, and fetch missed messages on reconnect. Closing a listing stops new enquiries and labels existing threads as closed to new enquiries. Blocking stops contact in both directions. Unmatching closes the match chat. Include reporting from listings, profiles and messages.

## Build sequence

Proposed stack for the empty repository is Next.js, TypeScript and PostgreSQL, with Supabase Auth, Storage and Realtime. Choose the launch city and currency before seeding examples.

| Milestone | Implementation | Acceptance check |
| --- | --- | --- |
| 1. Accounts and intentions | Set up the web app, database migrations and sign-in. Add profile editing and independent discovery toggles. | A user can choose flatmate discovery alone and return to their saved profile after sign-in. |
| 2. Flat posting and discovery | Build the shared field schema, listing editor, photo storage, search query and detail page. Enforce owner-only edits. | Publish a private room, find it using combined filters at the exact maximum rent, then mark it filled and verify it disappears. |
| 3. Flatmate matching | Add preference records, eligibility query, ranked card feed, decisions and transactional mutual-match creation. | Two compatible users with no listing can match. Conflicting deal-breakers exclude a card. Simultaneous likes produce one match. |
| 4. Messaging | Implement thread creation, request handling, inbox, paginated history and realtime delivery. | A seeker can enquire without a like. Matched flatmates can chat. Retrying a send produces one message and a third account cannot read it. |
| 5. Pilot readiness | Add blocking and reporting, review queue, account deletion, mobile keyboard and touch checks. Seed representative listings and profiles. | Run both journeys on mobile, including empty search, unavailable listing, interrupted send, unmatch and block. Verify blocked users cannot reconnect through a listing. |

Organize routes under `app/flats`, `app/flatmates` and `app/inbox`. Keep filter definitions and matching rules under `lib/discovery` so the UI and server use the same semantics. Store migrations and access policies under `supabase/migrations`. Index published listings by city, availability and rent. Enforce unique directed decisions, canonical match pairs and thread origins in the database. Test filtering and ranking with fixed fixtures, then exercise permissions and concurrent creation against a real test database.
