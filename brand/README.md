# TableDash brand

**Personality:** fresh, friendly, everyday. Booking a table should feel quick and a little fun.

## Logo

| File | Use |
| --- | --- |
| `mark.svg` | Main logo mark: a lowercase "td" monogram whose "d" is a plate (mint center). Navy tile. Used for the diner app. |
| `mark-restaurant.svg` | Restaurant-side variant: coral tile, navy "d". Used for the restaurant app, and on navy backgrounds (web sidebars). |
| `logo-wordmark.svg` / `.png` | Horizontal logo: mark + "Table" in navy and "Dash" in coral (Nunito Black). |
| `mark-icon.svg`, `mark-foreground.svg` | Full-bleed app icon and Android adaptive-icon foreground (source for the PNGs in each app's `assets/`). |

- Keep clear space around the mark equal to the width of the "t" stem.
- Don't recolor the mark outside the two versions above, stretch it, or put a tile on a background of the same color (navy on navy, coral on coral).
- On dark backgrounds, use "Table" in white with "Dash" in coral.

## Colors

| Role | Name | Hex |
| --- | --- | --- |
| Primary (buttons, time slots, links) | Tomato coral | `#F2522F` (logo tile `#FF5A3C`) |
| Accent (success, "bookable", positive states) | Mint | `#19B394` (text on white: `#0E9F7E`) |
| Ink (text, navigation, restaurant-side backgrounds) | Navy | `#14213D` |
| Secondary text | Slate | `#5B6478` |
| Lines and borders | Mist | `#E1E5EC` |
| App background | Cloud | `#F4F6F9` (diner `#F7F8FA`) |
| Error | Red | `#D64545` |
| Warning | Amber | `#D98200` |

Coral tints: `#FFF0EC` (soft backgrounds), `#FFE6DF` (reserved tables). Mint tint: `#E3F7F1`.

## Type

- **Headings, buttons, badges, navigation:** Nunito (700 Bold, 800 ExtraBold, 900 Black). Rounded and friendly.
- **Body text:** Inter on the web; the platform's system font (SF Pro / Roboto) in the mobile apps.
- Headline sizes: 28 (screen titles), 19 (section titles).

## Shape

- Rounded: cards 16–18 px radius, inputs 12–14 px, buttons and chips fully rounded on the web, 12 px in the apps.
- Bookable time slots are solid coral pills. Bookable restaurants get a mint "Book on TableDash" badge.

## Where it's applied

- Diner app (`apps/diner`): icon, splash, logo on Discover, sign-in and account; coral/mint/navy theme; Nunito headings.
- Restaurant app (`apps/restaurant-app`): navy icon variant, navy sign-in screen, logo on the host stand, branded floor plan colors.
- Web back office and admin console: navy sidebar with logo, coral active states, Nunito + Inter, favicon.
- Web previews: navy backdrop behind the phone and iPad frames.
