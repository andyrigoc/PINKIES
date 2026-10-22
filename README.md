# PINKIES PLAY WELL — Mobile-first website concept

A responsive HTML/CSS/JavaScript prototype based on the supplied Pinkies concept and T-shirt design references.

## Getting started

1. Extract the ZIP.
2. Open `pinkies-website/index.html` in a modern browser. An internet connection is optional (used only to request Google Fonts).
3. For local development, run `python -m http.server 8000` inside `pinkies-website` and visit `http://localhost:8000`.

### Structure
- `index.html` — accessible semantic markup
- `style.css` — responsive styling and frosted-glass booking calendar
- `script.js` — interactive calendar, product filters, favourites, enquiry preview and shopping bag
- `assets/` — optimised local Pinkies imagery

## What works in this design prototype

- Responsive mobile, tablet and desktop layouts; phone layout tested at 360 and 390 CSS pixels
- Month-to-month calendar navigation with sample statuses (booked, limited, available)
- Selected date and inflatable product carried into a booking enquiry form
- Enquiry copied locally to clipboard; **no submission is performed**
- Filter adults / kids T-shirts, select size/quantity, add/remove items from a shopping bag and copy the bag summary
- Mobile menu, local page search and favourites

## Before a commercial launch

**Illustrative data:** The 65% booked indicator, every calendar availability status and all retail T-shirt prices are examples, not real availability/prices.

**Not connected:** No booking backend, data persistence, payment checkout, inventory, account login, or email delivery is provided. Booking forms don't transmit data. Swap `availabilityFor()` in `script.js` for a real availability endpoint, and connect reservations and checkout to suitable back-end services.

The reference imagery comes from supplied design/mock-up materials and must be approved and replaced with final production artwork where appropriate.

## Brand styling

- Pink: `#FF2D8B`
- Blue: `#6EC6FF`
- White: `#FFFFFF`
- Fonts: Outfit + DM Sans (Google Fonts, system fallbacks)
