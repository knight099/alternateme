# AlternateMe implementation plan

Someone moving to a new city can search for a home, find a person to rent with, or do both. Someone with a spare room can publish it and answer enquiries in the same app. Use FlatX as the reference for housing discovery and a mutual-like interaction for flatmate discovery. The first release targets mobile web.

## Three entry points

- **Find a flat.** Choose a city, set a monthly budget, compare results, open a listing and send the poster a question. Keep filters in the URL so returning from a detail page restores the search.
- **Find a flatmate.** Publish a flatmate profile with target areas, budget per person, move dates and household habits. People can join even when neither person has a flat. Each card shows shared preferences and relevant differences, with accessible Like and Pass buttons alongside swipe gestures.
- **Post a flat or room.** Choose the offer type, enter terms, upload photos, preview the public card and publish. The poster can edit, pause, mark a place filled or reopen it. Only published, available offers appear in search.

## Build a profile

Seekers and posters use the same editable profile. Save each step as a draft and let people preview their discovery card before publishing.

1. **Introduce yourself.** Add a display name, current city, optional hometown, languages and a short About me. Offer prompts such as “Where did you grow up?”, “What brings you here?” and “What would a typical Tuesday at home look like?” Let people choose which optional answers appear publicly.
2. **Choose photos.** Upload a cover portrait and optional gallery, preview the crop on mobile, reorder photos, replace the cover or remove any image. Keep profile photos separate from property photos. Show a placeholder when someone skips this step.
3. **Describe life at home.** Record your own habits separately from what you want in a flatmate. For example, “I work nights” describes you, while “I need quiet mornings” describes a household condition. Cover sleep and work schedules, cleaning, guests, shared meals, pets and indoor smoking.
4. **Set your conditions.** For each criterion choose required, important, flexible or no preference. A poster with several rooms sets rent, occupancy, pet rules and availability separately for each listing. Show the applicable household conditions before someone enquires.
5. **Preview and publish.** Show the photo gallery, introduction, visible background details, living habits, housing intentions and conditions. Link a live-in poster’s card from their room listing. Label a nonresident poster’s role and show the household’s supplied answers where available.

### Get to know me

Add an optional step before preview where people can select interest tags such as hiking, gaming, cooking, reading or live music, and write in a hobby of their own. Give each interest room for a detail. “I make fresh pasta on Sundays and usually cook too much” gives a potential flatmate more to ask about than “Cooking” alone.

Let seekers and posters answer up to three prompts, such as “What are you into lately?”, “What would you invite a flatmate to join?” or “How do you recharge after a long week?” Let them feature one answer on their discovery card. The full profile shows the other published answers and hobbies beside their introduction. Each item can be edited or hidden independently.

When both people publish the same interest tag, highlight it as a conversation starter. In an available chat, tapping the shared interest opens an editable draft such as “What have you been cooking lately?” The user chooses whether to send it. Keep hobbies and prompt answers optional and outside the housing compatibility calculation.

**Acceptance check.** Two people publish cooking as a hobby. Each sees the shared interest and can read the other's featured answer. Hiding the hobby removes the shared-interest highlight from both views and preserves both fit scores. A profile with no hobbies or prompts can still publish and match.

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

First require compatible search intentions, a shared area, overlapping budget and date ranges, and satisfaction of both people's deal-breakers. Exclude self, blocked accounts, inactive profiles and previously decided cards. Rank eligible profiles using the viewer’s directional score below. Show profiles with insufficient answers after scored profiles. Break ties by recent activity and stable profile ID.

For example, two people seeking a place in the same area with budgets of 700–900 and 850–1000 can appear to each other if their dates overlap. A required pet-friendly household rules out a candidate who explicitly cannot live with pets. An unanswered deal-breaker stays ineligible until answered.

## Compatibility from each side

Calculate two directional scores for each eligible pairing. On a room listing, **Fits your search** compares the seeker's wishes with the room and household. **Fits the household’s preferences** compares the household’s wishes with the seeker’s answers. Show the same labelled results to the poster on the enquiry. For two people looking together, apply the same calculation in each direction using their profiles. A nonresident poster supplies only conditions they know about the household.

Check required conditions first. Label a known conflict with the specific condition and an unanswered requirement as “Needs confirmation.” Neither qualifies for a recommended match. For optional criteria, use weight 2 for important and 1 for flexible. Award the weight when the other side’s answer falls within the accepted choices or range. Divide earned weight by the total weight of answered, applicable preferences and round to a percentage. Skip “no preference.” Alongside the score show answered criteria out of applicable preferences. With fewer than two answered criteria show “More answers needed.”

For example, a seeker values quiet evenings (2), weekly shared cleaning (1) and shared meals (1). A household meeting the first two earns **75% fit for the seeker**. If the seeker meets both of the household’s two answered preferences, the same enquiry shows **100% fit for the household**. Tapping either number reveals the agreements, differences and unknowns. Recalculate after either profile or the listing changes. Photos, hometown, name and biography are for introductions and carry zero ranking weight.

## Chat and permissions

A listing enquiry opens one thread per listing and seeker. The first message includes listing context and arrives as a request the poster can accept or decline. Flatmate chat opens after reciprocal likes. Concurrent likes must create exactly one match and one thread for the pair. A shared inbox labels each conversation with the listing or flatmate match that started it.

Authenticate senders and check membership on every read, send and realtime subscription. Persist messages before broadcasting them, deduplicate retries by sender and client message ID, and fetch missed messages on reconnect. Closing a listing stops new enquiries and labels existing threads as closed to new enquiries. Blocking stops contact in both directions. Unmatching closes the match chat. Include reporting from listings, profiles and messages.

## Build sequence

Proposed stack for the empty repository is Next.js, TypeScript and PostgreSQL, with Supabase Auth, Storage and Realtime. Choose the launch city and currency before seeding examples.

| Milestone | Implementation | Acceptance check |
| --- | --- | --- |
| 1. Accounts and intentions | Set up the web app, database migrations and sign-in. Add profile editing and independent discovery toggles. | A user can resume a draft, change the cover photo, hide their hometown, choose flatmate discovery alone and return to their saved profile after sign-in. |
| 2. Flat posting and discovery | Build the shared field schema, listing editor, photo storage, search query and detail page. Enforce owner-only edits. | Publish a private room, find it using combined filters at the exact maximum rent, then mark it filled and verify it disappears. |
| 3. Flatmate matching | Add preference records, eligibility query, ranked card feed, decisions and transactional mutual-match creation. | Two compatible users with no listing can match. Conflicting deal-breakers exclude a card. Simultaneous likes produce one match. Verify the 75% and 100% example in both views, the insufficient-answer state and recalculation after an edit. Changing a portrait or hometown must preserve both scores. |
| 4. Messaging | Implement thread creation, request handling, inbox, paginated history and realtime delivery. | A seeker can enquire without a like. Matched flatmates can chat. Retrying a send produces one message and a third account cannot read it. |
| 5. Pilot readiness | Add blocking and reporting, review queue, account deletion, mobile keyboard and touch checks. Seed representative listings and profiles. | Run both journeys on mobile, including empty search, unavailable listing, interrupted send, unmatch and block. Verify blocked users cannot reconnect through a listing. |

Organize routes under `app/flats`, `app/flatmates` and `app/inbox`. Keep filter definitions and matching rules under `lib/discovery` so the UI and server use the same semantics. Store migrations and access policies under `supabase/migrations`. Index published listings by city, availability and rent. Enforce unique directed decisions, canonical match pairs and thread origins in the database. Test filtering and ranking with fixed fixtures, then exercise permissions and concurrent creation against a real test database.
