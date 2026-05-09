// Fair Play card data — Mike & Jess.
// Built from your custom 50-card Fair Play deck (Dropbox doc) plus 3 cat cards
// and 2 mail/package cards = 55 cards. Minimum Standards of Care are pulled
// directly from the deck. Owner pre-fill is Mike's read; discussion prompts
// flag what's worth examining together. Edit freely.

const PEOPLE = {
  jess:  { id: "jess",  name: "Jess",  emoji: "🐧", color: "#3F4E5F" },
  mike:  { id: "mike",  name: "Mike",  emoji: "🐱", color: "#C77D4F" },
  asher: { id: "asher", name: "Asher", emoji: "⚾", color: "#6BAF92" },
  split: { id: "split", name: "Split", emoji: "🤝", color: "#D4A04A" },
  open:  { id: "open",  name: "Open",  emoji: "❓", color: "#A8A29E" }
};

// Mental load weights — Conception > Planning > Execution.
const WEIGHTS = { C: 0.40, P: 0.35, E: 0.25 };

const SUITS = {
  home:     { id: "home",     name: "Daily Household", emoji: "🏠",  blurb: "Groceries, food, laundry, repairs, the cat — the daily grind." },
  school:   { id: "school",   name: "School & Asher",  emoji: "🎒",  blurb: "School logistics, communication, his social and emotional life." },
  baseball: { id: "baseball", name: "Travel Baseball", emoji: "⚾",  blurb: "10 cards because travel ball is its own world." },
  work:     { id: "work",     name: "Work–Family",     emoji: "🤝",  blurb: "Calendars, meetings, coverage — making two careers fit." },
  health:   { id: "health",   name: "Health, Money, Us", emoji: "💗", blurb: "Bodies, dollars, marriage, the wider family." }
};

function card(o) {
  return {
    id: o.id, suit: o.suit, title: o.title, icon: o.icon || "🪄",
    description: o.description || "",
    cpe: o.cpe,
    weeklyHours: o.weeklyHours || 0,
    status: o.status || "agreed",
    discussionPrompt: o.discussionPrompt || "",
    minimumStandard: o.minimumStandard || ""
  };
}

const CARDS = [

  // ════════ DAILY HOUSEHOLD OPERATIONS ══════════════════════════════════════
  card({
    id: "groceries", suit: "home", title: "Groceries", icon: "🛒",
    description: "Inventory, ordering/shopping, pickup, staples.",
    cpe: { C: "jess", P: "jess", E: "jess" },
    weeklyHours: 1.5, status: "agreed",
    minimumStandard: "House has breakfast, lunchbox food, dinner basics, and baseball snacks.",
    discussionPrompt: "All you. The C alone (knowing what we need) is half the work — anything I can take a slice of?"
  }),
  card({
    id: "weeknight-dinners", suit: "home", title: "Weeknight dinners", icon: "🥘",
    description: "Meal planning and dinner coordination.",
    cpe: { C: "jess", P: "jess", E: "jess" },
    weeklyHours: 5, status: "discuss",
    minimumStandard: "At least 4 realistic dinners planned each week.",
    discussionPrompt: "Big card. Should I take 1–2 nights fully (CPE), or pick up the cleanup-side reliably so you can stop thinking about dinner once it's served?"
  }),
  card({
    id: "baseball-night-food", suit: "home", title: "Baseball-night food", icon: "🥪",
    description: "Pre/post-practice meals, cooler snacks, hydration.",
    cpe: { C: "jess", P: "jess", E: "jess" },
    weeklyHours: 1.25, status: "agreed",
    minimumStandard: "No emergency concession-stand dinners unless planned.",
    discussionPrompt: "25 min × 3 days. I can take execution on practice nights so you only own gameday."
  }),
  card({
    id: "lunchbox", suit: "home", title: "Lunchbox", icon: "🍱",
    description: "Supplies, packing system, prep.",
    cpe: { C: "jess", P: "jess", E: "jess" },
    weeklyHours: 2.5, status: "discuss",
    minimumStandard: "Lunch ready the night before or by a clear morning deadline.",
    discussionPrompt: "Could the *system* be mine (set up the routine, supplies, weekly prep) while you keep daily packing? Or vice-versa?"
  }),
  card({
    id: "breakfast", suit: "home", title: "Breakfast", icon: "🥞",
    description: "Weekday and tournament breakfast planning.",
    cpe: { C: "split", P: "split", E: "split" },
    weeklyHours: 1, status: "agreed",
    minimumStandard: "Quick, filling breakfast options always available."
  }),
  card({
    id: "dishes", suit: "home", title: "Dishes & kitchen reset", icon: "🍽️",
    description: "Dishwasher, counters, sink, lunch containers.",
    cpe: { C: "split", P: "split", E: "split" },
    weeklyHours: 3, status: "agreed",
    minimumStandard: "Kitchen functional before bed."
  }),
  card({
    id: "laundry", suit: "home", title: "Laundry", icon: "🧺",
    description: "Washing, folding, putting away.",
    cpe: { C: "jess", P: "jess", E: "jess" },
    weeklyHours: 4, status: "discuss",
    minimumStandard: "Clothes and uniforms available when needed.",
    discussionPrompt: "Heavy weekly card, all yours. Want me to fully own one load type (towels? his clothes?) so you can drop a piece of the C?"
  }),
  card({
    id: "baseball-laundry", suit: "home", title: "Baseball laundry", icon: "🧦",
    description: "Uniforms, socks, sliding gear, belts.",
    cpe: { C: "jess", P: "jess", E: "jess" },
    weeklyHours: 1, status: "discuss",
    minimumStandard: "Uniform clean and ready 24 hours before games.",
    discussionPrompt: "Honestly — does this fit me better since I'm at every game and feel the consequence directly?"
  }),
  card({
    id: "supplies", suit: "home", title: "Household supplies", icon: "🧻",
    description: "Toilet paper, detergent, paper towels, etc.",
    cpe: { C: "split", P: "split", E: "split" },
    weeklyHours: 0.5, status: "discuss",
    minimumStandard: "No critical household item runs out unexpectedly.",
    discussionPrompt: "Be honest: are you noticing 80% and I'm only executing once told? The C is the heaviest part of this."
  }),
  card({
    id: "trash", suit: "home", title: "Trash & recycling", icon: "🗑️",
    description: "Bins, pickup days, overflow management.",
    cpe: { C: "mike", P: "mike", E: "mike" },
    weeklyHours: 0.5, status: "agreed",
    minimumStandard: "Trash handled before overflow becomes stressful."
  }),
  card({
    id: "home-maintenance", suit: "home", title: "Home maintenance", icon: "🔧",
    description: "Repairs, HVAC, filters, service appointments.",
    cpe: { C: "mike", P: "mike", E: "mike" },
    weeklyHours: 0.75, status: "agreed",
    minimumStandard: "Urgent issues addressed within 48 hours."
  }),
  card({
    id: "car-maintenance", suit: "home", title: "Car maintenance", icon: "🚗",
    description: "Gas/charging, inspections, tires, cleaning.",
    cpe: { C: "mike", P: "mike", E: "mike" },
    weeklyHours: 0.5, status: "discuss",
    minimumStandard: "Vehicles safe and ready for work and baseball travel.",
    discussionPrompt: "Defaulting to me but confirming. Or do you want to own your own car?"
  }),
  card({
    id: "baseball-car-kit", suit: "home", title: "Baseball car kit", icon: "🧴",
    description: "Chairs, sunscreen, towels, bug spray, umbrella.",
    cpe: { C: "open", P: "open", E: "open" },
    weeklyHours: 0.25, status: "open",
    minimumStandard: "Kit stocked and living in the car during season.",
    discussionPrompt: "Genuinely don't know who's holding this. I'd take it — I'm in the car most."
  }),
  card({
    id: "cat-feed", suit: "home", title: "Stripes — feeding & water", icon: "🥣",
    description: "Daily food and fresh water for Stripes.",
    cpe: { C: "jess", P: "jess", E: "jess" },
    weeklyHours: 1, status: "agreed",
    minimumStandard: "Stripes fed twice daily, water fresh."
  }),
  card({
    id: "cat-litter", suit: "home", title: "Stripes — litter", icon: "🪨",
    description: "Scooping daily, full change weekly.",
    cpe: { C: "mike", P: "mike", E: "mike" },
    weeklyHours: 0.75, status: "agreed",
    minimumStandard: "Box scooped daily; full change weekly."
  }),
  card({
    id: "cat-vet", suit: "home", title: "Stripes — vet & health", icon: "🩺",
    description: "Vet visits, meds, noticing when something's off.",
    cpe: { C: "open", P: "open", E: "open" },
    weeklyHours: 0.25, status: "open",
    minimumStandard: "Preventive care current; issues caught early.",
    discussionPrompt: "Probably falling on you by default. Want me to take it?"
  }),
  card({
    id: "mail", suit: "home", title: "Mail", icon: "📬",
    description: "Bringing in, opening, handling, recycling.",
    cpe: { C: "jess", P: "jess", E: "jess" },
    weeklyHours: 0.5, status: "agreed",
    minimumStandard: "Time-sensitive mail acted on within 48 hours."
  }),
  card({
    id: "packages", suit: "home", title: "Packages", icon: "📦",
    description: "Bringing in, opening, breaking down boxes, returns.",
    cpe: { C: "mike", P: "mike", E: "mike" },
    weeklyHours: 0.25, status: "agreed",
    minimumStandard: "No packages sitting outside overnight."
  }),

  // ════════ SCHOOL & CHILD DEVELOPMENT ══════════════════════════════════════
  card({
    id: "school-calendar", suit: "school", title: "School calendar", icon: "📅",
    description: "Track school events and deadlines.",
    cpe: { C: "jess", P: "jess", E: "jess" },
    weeklyHours: 0.5, status: "discuss",
    minimumStandard: "Important dates entered into shared calendar promptly.",
    discussionPrompt: "Should this collapse into the master Shared Calendar card so we don't track two systems?"
  }),
  card({
    id: "homework", suit: "school", title: "Homework monitoring", icon: "📚",
    description: "Assignments, projects, studying.",
    cpe: { C: "open", P: "open", E: "open" },
    weeklyHours: 2, status: "open",
    minimumStandard: "No surprise late-night school emergencies.",
    discussionPrompt: "Genuinely don't know how this is distributing. Open conversation."
  }),
  card({
    id: "reading", suit: "school", title: "Reading & enrichment", icon: "📖",
    description: "Books, library, enrichment activities, bedtime reading.",
    cpe: { C: "split", P: "split", E: "split" },
    weeklyHours: 2.3, status: "agreed",
    minimumStandard: "Reading stays consistent without becoming stressful.",
    discussionPrompt: "10 min each per night ≈ 2.3h/wk total. Confirming this is the rhythm."
  }),
  card({
    id: "school-comms", suit: "school", title: "School communication", icon: "✉️",
    description: "Teacher emails, forms, portals.",
    cpe: { C: "jess", P: "jess", E: "jess" },
    weeklyHours: 1.5, status: "discuss",
    minimumStandard: "School requests answered before deadlines.",
    discussionPrompt: "Heavy mental-load card. At minimum I should be cc'd on teacher emails — should I own a slice (e.g. all signups, all permission slips)?"
  }),
  card({
    id: "school-supplies", suit: "school", title: "School supplies", icon: "✏️",
    description: "Backpack and classroom supply management.",
    cpe: { C: "jess", P: "jess", E: "jess" },
    weeklyHours: 0.25, status: "agreed",
    minimumStandard: "Supplies replaced proactively."
  }),
  card({
    id: "clothes", suit: "school", title: "Clothes & shoes", icon: "👕",
    description: "Seasonal clothes, sizing, replacements.",
    cpe: { C: "jess", P: "jess", E: "jess" },
    weeklyHours: 0.5, status: "agreed",
    minimumStandard: "Asher has appropriate clothes that fit."
  }),
  card({
    id: "friendships", suit: "school", title: "Friendships & social life", icon: "🎈",
    description: "Playdates, birthdays, RSVPs.",
    cpe: { C: "jess", P: "jess", E: "jess" },
    weeklyHours: 1, status: "agreed",
    minimumStandard: "Asher has healthy social opportunities."
  }),
  card({
    id: "screen-time", suit: "school", title: "Screen time & tech", icon: "📱",
    description: "Rules, devices, parental controls.",
    cpe: { C: "open", P: "open", E: "open" },
    weeklyHours: 1, status: "open",
    minimumStandard: "Technology expectations are clear and consistent.",
    discussionPrompt: "Open card. How's this actually going? Is the rule set clear, or are we improvising?"
  }),
  card({
    id: "emotional", suit: "school", title: "Emotional check-ins", icon: "💛",
    description: "Monitor stress, disappointment, worries.",
    cpe: { C: "open", P: "open", E: "open" },
    weeklyHours: 1, status: "discuss",
    minimumStandard: "Regular one-on-one connection time.",
    discussionPrompt: "From the deck — and I want this one. Should we each have a weekly 1:1 with him, or one of us holds it?"
  }),

  // ════════ TRAVEL BASEBALL ═════════════════════════════════════════════════
  card({
    id: "baseball-master-cal", suit: "baseball", title: "Master baseball calendar", icon: "📆",
    description: "Practices, tournaments, rainouts.",
    cpe: { C: "jess", P: "jess", E: "jess" },
    weeklyHours: 0.75, status: "discuss",
    minimumStandard: "Shared calendar always updated.",
    discussionPrompt: "I coach but you carry the calendar. Move it to me — it's where my eyes are anyway?"
  }),
  card({
    id: "baseball-comms", suit: "baseball", title: "Baseball communications", icon: "💬",
    description: "TeamSnap, coach texts, emails.",
    cpe: { C: "jess", P: "jess", E: "jess" },
    weeklyHours: 0.5, status: "discuss",
    minimumStandard: "One parent always knows current plans.",
    discussionPrompt: "Same as above — I am the coach. This should probably be mine."
  }),
  card({
    id: "baseball-weekly", suit: "baseball", title: "Weekly baseball logistics", icon: "🗓️",
    description: "Driving, meals, uniforms, timing for the week.",
    cpe: { C: "split", P: "split", E: "split" },
    weeklyHours: 1, status: "discuss",
    minimumStandard: "Week planned by Sunday evening.",
    discussionPrompt: "Could be the spine of our Sunday meeting — both of us, every week."
  }),
  card({
    id: "tournament-travel", suit: "baseball", title: "Tournament travel planning", icon: "🏨",
    description: "Hotels, driving, meals, logistics for travel weekends.",
    cpe: { C: "open", P: "open", E: "open" },
    weeklyHours: 1, status: "open",
    minimumStandard: "Weekend plans finalized by Wednesday.",
    discussionPrompt: "Open. I should probably own this — I know the schedule and team."
  }),
  card({
    id: "baseball-packing", suit: "baseball", title: "Baseball packing", icon: "🎒",
    description: "Gear checks and prep before each event.",
    cpe: { C: "open", P: "open", E: "open" },
    weeklyHours: 0.5, status: "open",
    minimumStandard: "Bag checked night before every event.",
    discussionPrompt: "Asher card? Could be a 'Cards Asher Holds' candidate."
  }),
  card({
    id: "gear-maintenance", suit: "baseball", title: "Gear maintenance", icon: "🥎",
    description: "Sizing, replacement, legality.",
    cpe: { C: "mike", P: "mike", E: "mike" },
    weeklyHours: 0.5, status: "agreed",
    minimumStandard: "Gear safe and game-ready."
  }),
  card({
    id: "baseball-budget", suit: "baseball", title: "Baseball budget", icon: "💰",
    description: "Fees, lessons, hotels, equipment.",
    cpe: { C: "open", P: "open", E: "open" },
    weeklyHours: 0.25, status: "open",
    minimumStandard: "Costs tracked and discussed proactively.",
    discussionPrompt: "Open. Probably with the bills card-holder for consistency?"
  }),
  card({
    id: "practice-support", suit: "baseball", title: "Practice support (coaching + yard time)", icon: "🏟️",
    description: "Coaching the team, lessons, catch, batting cage. In-season hours.",
    cpe: { C: "mike", P: "mike", E: "mike" },
    weeklyHours: 8, status: "agreed",
    minimumStandard: "Supportive without overloading Asher.",
    discussionPrompt: "8h/wk in season (4 practice + 4 games). Off-season ~0. Showing in-season here."
  }),
  card({
    id: "gameday-parent", suit: "baseball", title: "Game-day parent role", icon: "👨‍👦",
    description: "Emotional tone, post-game approach, the vibe.",
    cpe: { C: "split", P: "split", E: "split" },
    weeklyHours: 0.5, status: "discuss",
    minimumStandard: "Support without excessive pressure.",
    discussionPrompt: "From the deck — worth examining together. As coach + dad, am I leaning too hard on the post-game critique?"
  }),
  card({
    id: "baseball-recovery", suit: "baseball", title: "Baseball recovery", icon: "💧",
    description: "Hydration, soreness, rest, sleep.",
    cpe: { C: "open", P: "open", E: "open" },
    weeklyHours: 0.25, status: "open",
    minimumStandard: "Health prioritized over extra reps.",
    discussionPrompt: "Open. Could be his (water bottle, stretching), with one of us as backup."
  }),

  // ════════ WORK–FAMILY COORDINATION ═══════════════════════════════════════
  card({
    id: "shared-cal", suit: "work", title: "Shared calendar system", icon: "🗓️",
    description: "Unified calendar that both of us run on.",
    cpe: { C: "jess", P: "jess", E: "jess" },
    weeklyHours: 0.5, status: "discuss",
    minimumStandard: "Everyone sees all commitments.",
    discussionPrompt: "Heavy invisible card. Move to a shared system we both maintain — and I add my work too?"
  }),
  card({
    id: "weekly-meeting", suit: "work", title: "Weekly logistics meeting", icon: "🤝",
    description: "Sunday agenda + conflict planning. The 20–30 min check-in.",
    cpe: { C: "open", P: "open", E: "open" },
    weeklyHours: 0.5, status: "open",
    minimumStandard: "20–30 min weekly check-in happens consistently.",
    discussionPrompt: "New cadence — should we adopt this? Sunday evening, after Asher is in bed?"
  }),
  card({
    id: "backup-care", suit: "work", title: "Backup care", icon: "🆘",
    description: "Sitters, emergency contacts, backup plans.",
    cpe: { C: "open", P: "open", E: "open" },
    weeklyHours: 0.25, status: "open",
    minimumStandard: "At least two backup options known.",
    discussionPrompt: "Do we even have two? Open card, worth honest answer."
  }),
  card({
    id: "sick-day", suit: "work", title: "Sick-day coverage", icon: "🤒",
    description: "Coverage and schedule adjustments when Asher is sick.",
    cpe: { C: "open", P: "open", E: "open" },
    weeklyHours: 0.25, status: "open",
    minimumStandard: "No automatic default parent.",
    discussionPrompt: "Be honest — is there a default parent today? (My guess: you.) Should we alternate by month, week, or whoever has lighter day?"
  }),
  card({
    id: "work-travel", suit: "work", title: "Work travel coordination", icon: "✈️",
    description: "Prep + coverage when one of us is gone.",
    cpe: { C: "split", P: "split", E: "split" },
    weeklyHours: 0.25, status: "agreed",
    minimumStandard: "Traveling parent leaves a clear plan."
  }),
  card({
    id: "morning-routine", suit: "work", title: "Morning routine", icon: "🌅",
    description: "Wake-up to school departure. Breakfast, dress, bag, dishes.",
    cpe: { C: "split", P: "split", E: "split" },
    weeklyHours: 5, status: "agreed",
    minimumStandard: "Mornings feel predictable.",
    discussionPrompt: "Updated — even split (you wake him, I do dishes etc). Is the actual feel of mornings 'predictable' or chaotic? MSC check."
  }),
  card({
    id: "evening-routine", suit: "work", title: "Evening routine", icon: "🌙",
    description: "Homework, showers, bedtime, reading, lights out.",
    cpe: { C: "split", P: "split", E: "split" },
    weeklyHours: 5, status: "discuss",
    minimumStandard: "Bedtime protected consistently.",
    discussionPrompt: "Reading split (10 min each). Confirming the rest of bedtime is also split? Or does one of us do more bath/teeth?"
  }),
  card({
    id: "transportation", suit: "work", title: "Family transportation", icon: "🚙",
    description: "School dropoff (Mike, 40 min round trip), pickup (Jess, 60 min), carpools.",
    cpe: { C: "split", P: "split", E: "split" },
    weeklyHours: 8.3, status: "agreed",
    minimumStandard: "Rides assigned ahead of time.",
    discussionPrompt: "Big card — 8.3h/wk between us. I drop (3.3h), you pick up (5h). Want to swap occasionally?"
  }),

  // ════════ HEALTH, MONEY, RELATIONSHIPS ═══════════════════════════════════
  card({
    id: "medical", suit: "health", title: "Medical & dentist", icon: "🩹",
    description: "Appointments, forms, records.",
    cpe: { C: "jess", P: "jess", E: "jess" },
    weeklyHours: 0.4, status: "discuss",
    minimumStandard: "Preventive care stays current.",
    discussionPrompt: "I should at least take dentist (booking + taking him). Yes?"
  }),
  card({
    id: "sports-health", suit: "health", title: "Sports health", icon: "💪",
    description: "Physicals, injuries, recovery.",
    cpe: { C: "mike", P: "mike", E: "mike" },
    weeklyHours: 0.25, status: "agreed",
    minimumStandard: "Pain and fatigue addressed proactively."
  }),
  card({
    id: "bills", suit: "health", title: "Bills & budget", icon: "💳",
    description: "Recurring bills, savings, baseball spending.",
    cpe: { C: "jess", P: "jess", E: "jess" },
    weeklyHours: 1, status: "discuss",
    minimumStandard: "No surprise financial stressors.",
    discussionPrompt: "All you. I should at least own a slice — subscriptions audit? Baseball-specific spend? Tell me which."
  }),
  card({
    id: "taxes", suit: "health", title: "Taxes & documents", icon: "📄",
    description: "Important forms and records.",
    cpe: { C: "jess", P: "jess", E: "jess" },
    weeklyHours: 0.5, status: "discuss",
    minimumStandard: "Documents stored accessibly.",
    discussionPrompt: "Could be mine — I'm fine in spreadsheets. Yes?"
  }),
  card({
    id: "gifts", suit: "health", title: "Gifts", icon: "🎁",
    description: "Birthdays, holidays, teacher and coach gifts.",
    cpe: { C: "jess", P: "jess", E: "jess" },
    weeklyHours: 0.5, status: "discuss",
    minimumStandard: "Celebrations feel thoughtful without panic.",
    discussionPrompt: "I should own MY side of the family at minimum. Plus coach gifts (since I am one)."
  }),
  card({
    id: "marriage", suit: "health", title: "Marriage & couple time", icon: "🌹",
    description: "Date nights and connection.",
    cpe: { C: "open", P: "open", E: "open" },
    weeklyHours: 0.25, status: "discuss",
    minimumStandard: "Intentional connection at least twice monthly.",
    discussionPrompt: "I want this card. Pushing for the MSC — twice monthly minimum."
  }),
  card({
    id: "family-fun", suit: "health", title: "Family fun (non-baseball)", icon: "🌳",
    description: "Activities unrelated to baseball — hikes, museums, just messing around.",
    cpe: { C: "open", P: "open", E: "open" },
    weeklyHours: 0.5, status: "discuss",
    minimumStandard: "Family identity extends beyond sports.",
    discussionPrompt: "From the deck — important one. Are we letting baseball crowd this out? Honest read?"
  }),
  card({
    id: "vacations", suit: "health", title: "Vacations & trips", icon: "🏖️",
    description: "Planning and logistics.",
    cpe: { C: "jess", P: "jess", E: "jess" },
    weeklyHours: 1, status: "discuss",
    minimumStandard: "Trips restorative rather than chaotic.",
    discussionPrompt: "Want to flip — I take the next trip start to finish?"
  }),
  card({
    id: "extended-family", suit: "health", title: "Extended family", icon: "👵",
    description: "Visits, calls, obligations — both sides.",
    cpe: { C: "jess", P: "jess", E: "jess" },
    weeklyHours: 1, status: "discuss",
    minimumStandard: "Family ties maintained without imbalance.",
    discussionPrompt: "I should at minimum own my side of the family. Yes?"
  }),
  card({
    id: "asher-independence", suit: "health", title: "Son's independence", icon: "🌱",
    description: "Teach chores, responsibility, age-appropriate ownership.",
    cpe: { C: "open", P: "open", E: "open" },
    weeklyHours: 0.25, status: "discuss",
    minimumStandard: "Asher gradually owns age-appropriate tasks.",
    discussionPrompt: "From the deck — and at 10, he's ready for some real cards (bag check, lunchbox unpack, room baseline). Want to launch a few this Sunday?"
  }),

  // ════════ ASHER'S CARDS ════════════════════════════════════════════════════
  card({
    id: "asher-homework", suit: "school", title: "Homework (Asher's part)", icon: "📝",
    description: "Doing it when assigned, packing it back in the bag.",
    cpe: { C: "asher", P: "asher", E: "asher" },
    weeklyHours: 4, status: "agreed",
    minimumStandard: "Assignments done before screens or play."
  }),
  card({
    id: "asher-cat-play", suit: "home", title: "Stripes — daily play", icon: "🪀",
    description: "10–15 min of cat playtime — feathers, laser, chase.",
    cpe: { C: "asher", P: "asher", E: "asher" },
    weeklyHours: 1.5, status: "agreed",
    minimumStandard: "Stripes gets active play most days of the week."
  }),
  card({
    id: "asher-clear-dishes", suit: "home", title: "Clearing his dishes", icon: "🧽",
    description: "Plate, cup, utensils to the sink/dishwasher after meals.",
    cpe: { C: "asher", P: "asher", E: "asher" },
    weeklyHours: 0.5, status: "agreed",
    minimumStandard: "His spot at the table is clear before he leaves it."
  })
];

// expose globally for app.js
window.PEOPLE = PEOPLE;
window.SUITS = SUITS;
window.WEIGHTS = WEIGHTS;
window.CARDS = CARDS;

// Asher-ownable cards — for Phase 2 "Asher Mode" (from the docx).
window.ASHER_CARDS = [
  "Baseball Bag Check",
  "Water Bottle",
  "Lunchbox Unpack",
  "Backpack Reset",
  "Laundry to Hamper",
  "Room Baseline",
  "Morning Launch",
  "Thank-You Notes / Coach Appreciation"
];

// Monthly Reset Questions — for Phase 2 "Monthly Reset" screen (from the docx).
window.RESET_QUESTIONS = [
  "Which cards felt heavier than expected?",
  "Which cards created resentment?",
  "Which cards should Asher start helping with?",
  "What can we outsource, automate, simplify, or stop doing?",
  "Is baseball crowding out sleep, marriage, or family fun?",
  "Does each adult have real recovery time?",
  "What is one standard we can lower?"
];
