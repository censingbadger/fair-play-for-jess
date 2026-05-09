# Fair Play for Jess 💛

A Mother's Day 2026 gift — a personalized Fair Play deck for Mike & Jess, built as a static web app. Pre-filled with Mike's honest read of the current state, with discussion prompts for the gaps. Designed to be opened together Sunday morning and edited card-by-card.

🐧 Jess · 🐱 Mike · ⚾ Asher · 🐈 Cat

---

## What's in here

| File | What it does |
| --- | --- |
| `index.html` | The whole app skeleton + all views |
| `styles.css` | Sunny / penguin / cat / Steelers palette and layout |
| `cards.js`   | The card data — every card with current owner, hours, status, and discussion prompt |
| `app.js`     | State, rendering, walkthrough, dashboard, share/export |

No build step. No frameworks. Just open `index.html`.

---

## How to use it on Sunday

1. **Open `index.html` in a browser** — double-click the file, or drag into Chrome.
2. Edit the cover note (it's contenteditable — just click and type).
3. Hand Jess the laptop. Walk through together.
4. Use **Save & Share → Copy share link** at the end so the agreed plan lives on both phones.

State persists in `localStorage`, so you can close and reopen and pick up where you left off.

---

## Hosting it (so it lives at a real URL)

Pick whichever is easiest:

### Option A — Netlify Drop (easiest, ~30 seconds)
1. Go to <https://app.netlify.com/drop>
2. Drag this whole `Fair Play for Jess` folder onto the page
3. You get a URL like `https://something-something.netlify.app`
4. (Optional) sign in to claim the site and get a custom subdomain

### Option B — Vercel (similar)
1. `npm i -g vercel` if you don't have it
2. From this folder: `vercel` (follow prompts; accept defaults)
3. URL appears in the terminal

### Option C — GitHub Pages
1. Create a repo, push these 4 files
2. Settings → Pages → deploy from `main` branch root
3. URL is `https://<user>.github.io/<repo>/`

---

## What's pre-filled (so you know what Jess is looking at)

Based on Mike's answers — every card flagged as either:
- ✅ **Agreed** — Mike thinks this is settled
- 💬 **Discuss** — high-load or worth examining together
- ❓ **Open** — Mike doesn't actually know the answer

Discussion prompts live on the cards that need them. They're written *to* Jess, in Mike's voice — feel free to soften or rewrite anything that sounds wrong.

---

## Editing the deck

To add or remove cards: edit `cards.js`. Each card looks like:

```js
card({
  id: "unique-id",
  suit: "home" | "cat" | "asher" | "out" | "magic" | "wild",
  title: "Card title",
  icon: "🪄",
  description: "What this is.",
  cpe: { C: "jess"|"mike"|"split"|"open", P: ..., E: ... },
  weeklyHours: 1.5,
  status: "agreed" | "discuss" | "open",
  discussionPrompt: "Optional message to Jess about this card."
})
```

Mental load weights are in `cards.js` too: `WEIGHTS = { C: 0.40, P: 0.35, E: 0.25 }`.

---

## Phase 2 (after Sunday)

Things explicitly *not* built today, listed in the **Save & Share** view of the app:

- Real-time two-phone sync (Firebase / Supabase)
- Push notifications on owned cards (e.g. "🐱 trash night," "🐧 pickup at 4")
- Weekly check-in screen
- Per-card history of who held what, when

The point is: this is the conversation tool. After you've agreed, we build the running system together.

---

## Credits

- **Concept:** *Fair Play* by Eve Rodsky — CPE framework, minimum standard of care, Unicorn Space
- **Built by:** Mike (with help)
- **Mascots:** 🐧 🐱
- **Colors:** Steelers black & gold, sunny cream, soft sky
