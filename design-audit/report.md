# Design audit (before): issues by page

Screenshots: `design-audit/before/` (390×844, full page). Checklist numbers refer to the 10-point list.

## Whole app
- **Titles render thin (2)**: page titles and item titles used `var(--fw-600)`, a variable that does not exist (left over from the colour/type conversion), so they fell back to regular weight. Same for one `var(--ink)`.
- **Monospace material codes (2)**: M005, M012… used Consolas/SF Mono.
- **Code sizes outside the scale (2)**: 48 / 22 / 13 px.
- **Big outline pills for secondary actions (7)**: Clear search, Clear filters, Retry, Back to Explore, Share another, Stop camera, Keep it, Keep material, Return material, Preview / Edit, Explore materials (empty Saved), Review materials (multiple items bar).
- **Dates (9)**: "Oct 15, 2026, 8:58 AM" (credits), "10/15/2026, 8:58:40 AM" (reservation), "Oct 15, 2026, 8:58:40 AM GMT+8" (reports), "Due tomorrow, 8:58 AM (24h left)".
- **Status as grey tags (6)**: reservation detail ("Active", "Issue reported"), material detail ("Sample material"), batch review ("Needs: …").
- **Cards without an outline (3)**: Hub card, deposit success material, profile credits card, credit history summary, zone-confirm boxes, reservation code panel.
- **List pages not consistent (10)**: Active tasks, Share "In progress", Profile task and "Choose a material" (drop-off) used a different card from My posts / My reservations (monospace code, trash icon on the right, no footer).
- **Inputs (spec §8)**: 1px line border instead of taupe; labels 16px instead of 14/600.

## Pages
- **login / register**: duplicate titles ("Log in" + "Good to see you again." + "Welcome back"; "Create account" + "A little sharing…" + "Create an account") (5); card has no padding, inputs touch the card edge (3); "Create account" link not a text button.
- **login-error**: same as login.
- **material-not-found**: no top bar, large "Material details" title, Retry as outline pill (5, 7).
- **explore-load-error**: native grey "Retry" button inside the notice (7).
- **explore-filters**: "Clear filters" outline pill (7).
- **explore-no-results**: "Clear search" outline pill (7).
- **material-detail-sample**: "Sample material" grey tag (6); "Back to Explore" outline pill (7).
- **reservation-active / cancel-sheet**: "Active" tag (6); "Keep it" outline pill (7); due line format (9).
- **reservation-collected**: "Collected: 10/15/2026, 8:58:40 AM" and "Return deadline: Oct 16, 2026, 8:58:40 AM GMT+8" (9); "Return material" outline pill (7).
- **reservation-reported**: "Issue reported" tag (6).
- **reservation-returned**: date format (9).
- **pickup-find-area / deposit-find-area / pickup-problem**: camera panel has no outline (3); "Stop camera" outline pill (7).
- **pickup-guide / hub-guide / deposit-go-to-hub / return-start**: Hub card without outline (3).
- **deposit-place**: zone-confirm box without outline (3).
- **deposit-success**: material card without outline (3); "Share another" outline pill (7).
- **drop-off-entry**: different list card (10), monospace code (2).
- **deposit-form / deposit-form-errors / deposit-edit / multiple-editor**: input border and label size (§8); "Review materials" outline pill (7).
- **batch-review**: items separated by lines, not cards (3, 4); "Needs: …" tag (6); Preview / Edit outline pills (7).
- **issue-review**: report time "Oct 15, 2026, 8:58:40 AM GMT+8" (9).
- **my-posts / my-posts-delete-dialog**: report time format inside the card (9); "Keep material" outline pill (7).
- **credits / credits-new**: times with year (9); summary box without outline (3).
- **profile / profile-provider**: credits card without outline (3); task card differs from list card (10).
- **active-tasks / share**: task cards differ from list card (10); monospace codes (2).
- **profile-guest**: "Log in" link not a text button.
- **saved-empty**: "Explore materials" outline pill (7).

No problems found on: explore, explore-guest, explore-category, recently-viewed, saved, my-reservations, my-reservations-empty, my-posts-empty, share-empty, share-add-sheet, scan-ai, multiple-roll, deposit-camera-roll, activity, not-found.

# After (design-audit/after/): re-checked against the 10-point checklist

All 56 pages pass, apart from the open decisions below.

## Fixed
- Titles back to 600 (broken `--fw-600` / `--ink` variables replaced).
- Material codes use the brand font; code sizes 32 / 24 / 12.
- Secondary actions are text buttons (walnut + underline, 44px tap height); primary stays the single walnut button.
- Dates everywhere as "Oct 8, 7:36 PM" (credits, activity, reservations, reports, due line "Due Oct 16, 9:05 AM (24h left)").
- Status shown as plain text (reservation detail, material detail, batch review).
- Info cards are white with a 1px outline: Hub card, success card, profile credits, credit summary, zone boxes, code panel, camera panel, reservation outcome.
- Active tasks, Share "In progress", Profile task and the drop-off chooser use MaterialListCard (same as My posts / My reservations); delete is a small text button in the footer.
- Inputs per spec §8; labels 14/600 with the asterisk on the same line; login / register use the form card (§9), one title each, "Create account" / "Log in" as text buttons.
- Not-found material page uses the normal top bar; load-error Retry is a text button.

## Open decisions (not changed)
1. Explore photo cards still have the light top gradient and the heart's drop-shadow you asked for earlier; the checklist says no shadows or gradients.
2. Credit history shows a "+" icon for every row, including negative ones (content logic, not styling).
3. Unit dropdown placeholder "Choose a category first" is cut off on narrow phones (wording change needed).
4. Native checkbox on the review page ("I have checked this material…") and the dashed photo-upload tiles on placement / review pages have no spec component.
