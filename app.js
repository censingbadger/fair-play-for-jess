// Fair Play for Jess — app.js
// Single-file SPA. Renders cover → primer → dashboard → walkthrough → deck → settings.

(function () {
  "use strict";

  const STORAGE_KEY      = "fairplay-jess-v1";
  const SHARE_PARAM      = "plan";
  const FAMILY_CODE_KEY  = "fairplay-jess-family-code";
  const DEFAULT_FAMILY_CODE = "mike-jess-2026";

  function getFamilyCode() {
    return (localStorage.getItem(FAMILY_CODE_KEY) || DEFAULT_FAMILY_CODE).trim();
  }
  function setFamilyCode(code) {
    code = (code || "").trim() || DEFAULT_FAMILY_CODE;
    localStorage.setItem(FAMILY_CODE_KEY, code);
    return code;
  }

  // Set true while applying a remote update so saveState() doesn't push it back.
  let applyingRemote = false;
  let pushTimer = null;

  // ---------- DEFAULT NOTE FROM MIKE (editable in the app) ----------
  const DEFAULT_NOTE = `Deer —

Happy Mother's Day. I wanted to give you something better than "thank you for everything you do." I wanted us to sit down together and actually look. So I built this. I'm sure I got things wrong, missed things entirely, and underweighted the parts I don't see.

I love you. Asher does too. And Stripes loves us all, and bunlers.

— Mike`;

  // ---------- STATE ----------
  const initialState = {
    cards: {},          // overrides keyed by card id
    customCards: [],    // user-added cards (full card objects), id starts with "custom-"
    trips: null,        // null = use DEFAULT_TRIPS; array = user-edited list
    icsUrls: { jess: "", mike: "" }, // Outlook calendar feed URLs
    calFilters: {
      include: "school, Asher, Glenwood, crushers, WC, Practice, Tournament, Boat, Zoo, field trip, drive, game, playdate, pick, dinner, parents, party, banquet, award, presentation day",
      exclude: "grade, prep, teams, MBA, UBP, Undergraduate, Business, Lead, class, meeting, due, deadline, draft, review, sync, recap, planning, strategy, faculty",
      strictMode: true,
      showWeekends: true,
      showAllDay: true,
      workStartHour: 9,
      workEndHour: 16
    },
    currentMeeting: { step: 1, notes: { worked: "", didnt: "", forNextWeek: "" } },
    weeklyChoreNotes: {},  // { [cardId]: { jess: "", mike: "", asher: "" } } — per-person notes
    note: DEFAULT_NOTE,
    walkIndex: 0,
    deckFilter: "all",  // all | discuss | open | jess | mike | split
    lastSaved: null
  };

  // Calendar fetch cache lives outside Firestore — per-device, with TTL.
  const ICS_CACHE_KEY = "fairplay-jess-ics-cache";
  const ICS_TTL_MS    = 30 * 60 * 1000;
  const ICS_PROXY     = "https://api.codetabs.com/v1/proxy?quest=";

  let state = loadState();
  let activeView = "cover";
  let openCardId = null;

  // Unicode-safe base64 (handles emojis in state.note)
  function b64encode(str) {
    return btoa(String.fromCharCode(...new TextEncoder().encode(str)));
  }
  function b64decode(str) {
    const bytes = Uint8Array.from(atob(str), c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function loadState() {
    // 1) Try URL share param
    try {
      const url = new URL(window.location.href);
      const param = url.searchParams.get(SHARE_PARAM);
      if (param) {
        const decoded = JSON.parse(b64decode(decodeURIComponent(param)));
        if (decoded && decoded.cards) {
          // Once loaded, persist and clean URL
          localStorage.setItem(STORAGE_KEY, JSON.stringify(decoded));
          url.searchParams.delete(SHARE_PARAM);
          window.history.replaceState({}, "", url.toString());
          showToast("Shared plan loaded ✨");
          return Object.assign({}, initialState, decoded);
        }
      }
    } catch (e) { /* fall through */ }

    // 2) localStorage
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return Object.assign({}, initialState, JSON.parse(raw));
    } catch (e) { /* fall through */ }

    return Object.assign({}, initialState);
  }

  function saveState() {
    state.lastSaved = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Failed to persist state", e);
    }
    // Push to Firestore (debounced 500 ms). Skip if we're applying a remote update
    // — otherwise we'd ping-pong forever.
    if (!applyingRemote && window.fpSync) {
      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = setTimeout(() => {
        // Materialize trips (null → defaults) so remote devices see seeds.
        const payload = Object.assign({}, state, { trips: getTrips() });
        window.fpSync.push(payload, getFamilyCode());
        pushTimer = null;
      }, 500);
    }
  }

  // Apply a state coming from Firestore (the other device made an edit).
  function applyRemoteState(remote, isInitial) {
    applyingRemote = true;
    try {
      if (remote.cards) state.cards = remote.cards;
      if (Array.isArray(remote.customCards)) state.customCards = remote.customCards;
      if (Array.isArray(remote.trips)) state.trips = remote.trips;
      if (remote.icsUrls && typeof remote.icsUrls === "object") state.icsUrls = remote.icsUrls;
      // Only override local filters if remote has actually populated keywords —
      // otherwise an empty Firestore doc would wipe out our preset defaults.
      if (remote.calFilters && typeof remote.calFilters === "object"
          && (remote.calFilters.include || remote.calFilters.exclude)) {
        state.calFilters = remote.calFilters;
      }
      if (remote.currentMeeting && typeof remote.currentMeeting === "object") state.currentMeeting = remote.currentMeeting;
      if (remote.weeklyChoreNotes && typeof remote.weeklyChoreNotes === "object") state.weeklyChoreNotes = remote.weeklyChoreNotes;
      if (typeof remote.note === "string" && remote.note.length > 0) {
        state.note = remote.note;
      }
      // Persist to local storage so refreshes keep the synced view
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
      // Re-render whatever's visible
      renderCover();
      if (activeView === "deck")      renderDeck();
      if (activeView === "walk")      renderWalk();
      if (activeView === "trips")     renderTrips();
      if (activeView === "dashboard") renderDashboard();
      if (activeView === "chores")    renderChores();
      if (!isInitial) showToast("Updated by Jess ✨");
    } finally {
      applyingRemote = false;
    }
  }

  // Merge a default card with the current state override.
  function isCustomCard(id) {
    return typeof id === "string" && id.indexOf("custom-") === 0;
  }
  function getCardDef(id) {
    return window.CARDS.find(c => c.id === id)
        || (state.customCards || []).find(c => c.id === id)
        || null;
  }
  function getCard(id) {
    const def = getCardDef(id);
    if (!def) return null;
    const override = state.cards[id] || {};
    return Object.assign({}, def, override, {
      cpe: Object.assign({}, def.cpe, override.cpe || {})
    });
  }

  function allCards() {
    const ids = window.CARDS.map(c => c.id)
      .concat((state.customCards || []).map(c => c.id));
    return ids.map(id => getCard(id)).filter(Boolean);
  }

  function updateCard(id, patch) {
    const existing = state.cards[id] || {};
    state.cards[id] = Object.assign({}, existing, patch);
    if (patch.cpe) {
      state.cards[id].cpe = Object.assign({}, existing.cpe || {}, patch.cpe);
    }
    saveState();
  }

  function addCustomCard(data) {
    const id = "custom-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
    const card = {
      id,
      suit: data.suit,
      title: data.title,
      icon: data.icon || "🪄",
      description: data.description || "",
      cpe: data.cpe,
      weeklyHours: data.weeklyHours || 0,
      status: data.status || "discuss",
      discussionPrompt: "",
      minimumStandard: data.minimumStandard || ""
    };
    state.customCards = (state.customCards || []).concat([card]);
    saveState();
    return id;
  }

  function deleteCustomCard(id) {
    state.customCards = (state.customCards || []).filter(c => c.id !== id);
    delete state.cards[id];
    saveState();
  }

  // ---------- TRIPS ----------
  function getTrips() {
    // null = first run, fall back to defaults; explicit [] respects "user cleared all"
    if (state.trips === null || state.trips === undefined) {
      return (window.DEFAULT_TRIPS || []).map(t => Object.assign({}, t));
    }
    return state.trips.slice();
  }

  function saveTrips(list) {
    state.trips = list;
    saveState();
  }

  function upsertTrip(trip) {
    const list = getTrips();
    const i = list.findIndex(t => t.id === trip.id);
    if (i >= 0) list[i] = trip; else list.push(trip);
    saveTrips(list);
  }

  function deleteTrip(id) {
    saveTrips(getTrips().filter(t => t.id !== id));
  }

  // Sort: active (planning/booked) by soonest date, then done at the bottom.
  function sortedTrips() {
    return getTrips().slice().sort((a, b) => {
      const aDone = a.status === "done", bDone = b.status === "done";
      if (aDone !== bDone) return aDone ? 1 : -1;
      return (a.targetDate || "").localeCompare(b.targetDate || "");
    });
  }

  function tripDateLabel(isoDate) {
    if (!isoDate) return "No date set";
    const d = new Date(isoDate + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }

  function tripTimeAway(isoDate) {
    if (!isoDate) return "";
    const target = new Date(isoDate + "T00:00:00");
    const days = Math.round((target - new Date()) / 86400000);
    if (days === 0) return "today";
    if (days < 0) {
      const ago = Math.abs(days);
      if (ago < 30)  return `${ago} day${ago === 1 ? "" : "s"} ago`;
      if (ago < 365) { const m = Math.round(ago / 30); return `${m} month${m === 1 ? "" : "s"} ago`; }
      const y = Math.round(ago / 365); return `${y} year${y === 1 ? "" : "s"} ago`;
    }
    if (days < 7)   return `in ${days} day${days === 1 ? "" : "s"}`;
    if (days < 30)  { const w = Math.round(days / 7);  return `in ${w} week${w === 1 ? "" : "s"}`; }
    if (days < 365) { const m = Math.round(days / 30); return `in ${m} month${m === 1 ? "" : "s"}`; }
    const y = Math.round(days / 365); return `in ${y} year${y === 1 ? "" : "s"}`;
  }

  // ---------- ICS EXPORT ----------
  // Generate a downloadable .ics file. iOS Safari will hand it to the Calendar
  // app, which lets the user pick which calendar to add it to (Outlook included
  // when the Exchange account is configured on the device).
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function icsEscape(s) {
    return String(s || "")
      .replace(/\\/g, "\\\\")
      .replace(/\r?\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }
  function icsDateOnly(isoDate) { return (isoDate || "").replace(/-/g, ""); }
  function icsDateOnlyPlusOne(isoDate) {
    const d = new Date(isoDate + "T00:00:00");
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}`;
  }
  function icsLocalDateTime(isoDate, hh, mm) {
    return `${icsDateOnly(isoDate)}T${pad2(hh)}${pad2(mm)}00`;
  }
  function icsNowUtc() {
    const d = new Date();
    return `${d.getUTCFullYear()}${pad2(d.getUTCMonth()+1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
  }
  function buildIcsFile({ uid, title, start, end, allDay, description, location }) {
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Fair Play for Jess, Mike & Asher//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${icsNowUtc()}`,
      allDay ? `DTSTART;VALUE=DATE:${start}` : `DTSTART:${start}`,
      end ? (allDay ? `DTEND;VALUE=DATE:${end}` : `DTEND:${end}`) : null,
      `SUMMARY:${icsEscape(title)}`,
      description ? `DESCRIPTION:${icsEscape(description)}` : null,
      location ? `LOCATION:${icsEscape(location)}` : null,
      "END:VEVENT",
      "END:VCALENDAR"
    ].filter(Boolean);
    return lines.join("\r\n") + "\r\n";
  }
  function downloadIcs(filename, content) {
    // iOS Safari treats blob downloads (with a `download` attr) as
    // Save-to-Files and never offers the calendar handler. Navigating to a
    // data: URL with text/calendar mime makes iOS show the "Add to Calendar"
    // sheet so the event lands on Outlook/iCloud directly.
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent || "") && !window.MSStream;
    if (isIOS) {
      const dataUrl = "data:text/calendar;charset=utf-8," + encodeURIComponent(content);
      window.location.href = dataUrl;
      return;
    }
    const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "event.ics";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
  }
  function slugify(s) {
    return String(s || "event").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
      .slice(0, 40) || "event";
  }

  // ---------- COMPUTE ----------
  function timeSplit(card) {
    // Returns { jess, mike, asher, open } — hours per week, fractional.
    const h = card.weeklyHours || 0;
    const out = { jess: 0, mike: 0, asher: 0, open: 0 };
    ["C", "P", "E"].forEach(k => {
      const owner = card.cpe[k];
      const share = (h / 3);
      if (owner === "jess")       out.jess  += share;
      else if (owner === "mike")  out.mike  += share;
      else if (owner === "asher") out.asher += share;
      else if (owner === "split") { out.jess += share / 2; out.mike += share / 2; }
      else if (owner === "mostly-jess") { out.jess += share * 0.8; out.mike += share * 0.2; }
      else if (owner === "mostly-mike") { out.mike += share * 0.8; out.jess += share * 0.2; }
      else if (owner === "jess-asher")  { out.jess  += share / 2; out.asher += share / 2; }
      else if (owner === "mike-asher")  { out.mike  += share / 2; out.asher += share / 2; }
      else out.open += share;
    });
    return out;
  }

  function mentalLoadSplit(card) {
    // Returns { jess, mike, asher, open } — weighted units. Sum across cards is meaningful.
    const W = window.WEIGHTS;
    const out = { jess: 0, mike: 0, asher: 0, open: 0 };
    [["C", W.C], ["P", W.P], ["E", W.E]].forEach(([k, w]) => {
      const owner = card.cpe[k];
      if (owner === "jess")       out.jess  += w;
      else if (owner === "mike")  out.mike  += w;
      else if (owner === "asher") out.asher += w;
      else if (owner === "split") { out.jess += w / 2; out.mike += w / 2; }
      else if (owner === "mostly-jess") { out.jess += w * 0.8; out.mike += w * 0.2; }
      else if (owner === "mostly-mike") { out.mike += w * 0.8; out.jess += w * 0.2; }
      else if (owner === "jess-asher")  { out.jess  += w / 2; out.asher += w / 2; }
      else if (owner === "mike-asher")  { out.mike  += w / 2; out.asher += w / 2; }
      else out.open += w;
    });
    return out;
  }

  function totals(cards) {
    const time = { jess: 0, mike: 0, asher: 0, open: 0 };
    const load = { jess: 0, mike: 0, asher: 0, open: 0 };
    cards.forEach(c => {
      const t = timeSplit(c);
      time.jess += t.jess; time.mike += t.mike; time.asher += t.asher; time.open += t.open;
      const l = mentalLoadSplit(c);
      load.jess += l.jess; load.mike += l.mike; load.asher += l.asher; load.open += l.open;
    });
    return { time, load };
  }

  function pct(part, whole) {
    if (whole <= 0) return 0;
    return Math.round((part / whole) * 100);
  }

  // ---------- CALENDAR FEEDS (Outlook .ics over CORS proxy) ----------
  function getIcsUrls() {
    return Object.assign({ jess: "", mike: "" }, state.icsUrls || {});
  }
  function setIcsUrls(urls) {
    state.icsUrls = { jess: (urls.jess || "").trim(), mike: (urls.mike || "").trim() };
    saveState();
  }

  function getCalFilters() {
    return Object.assign({
      include: "school, Asher, Glenwood, crushers, WC, Practice, Tournament, Boat, Zoo, field trip, drive, game, playdate, pick, dinner, parents, party, banquet, award, presentation day",
      exclude: "grade, prep, teams, MBA, UBP, Undergraduate, Business, Lead, class, meeting, due, deadline, draft, review, sync, recap, planning, strategy, faculty",
      strictMode: true,          // when true: hide everything not whitelisted by a rule below
      showWeekends: true,        // strict mode only: always show Sat/Sun events
      showAllDay: true,          // strict mode only: always show all-day events
      workStartHour: 9,          // strict mode only: events before this hour are always shown
      workEndHour: 16            // strict mode only: events at/after this hour are always shown (4pm = 16)
    }, state.calFilters || {});
  }
  function setCalFilters(f) {
    state.calFilters = Object.assign(getCalFilters(), {
      include: (f.include || "").trim(),
      exclude: (f.exclude || "").trim(),
      strictMode: !!f.strictMode,
      showWeekends: f.showWeekends !== false,
      showAllDay: f.showAllDay !== false,
      workStartHour: Math.max(0, Math.min(23, parseInt(f.workStartHour, 10) || 9)),
      workEndHour:   Math.max(0, Math.min(24, parseInt(f.workEndHour, 10)   || 16))
    });
    saveState();
  }
  function parseFilterList(s) {
    return (s || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
  }
  // Returns { keep, hidden } after applying include/exclude + strict-mode rules.
  function applyCalFilters(events) {
    const f = getCalFilters();
    const inc = parseFilterList(f.include);
    const exc = parseFilterList(f.exclude);
    let hidden = 0;
    const keep = events.filter(e => {
      const t = (e.summary || "").toLowerCase();
      const matchInc = inc.length > 0 && inc.some(k => t.includes(k));
      const matchExc = exc.length > 0 && exc.some(k => t.includes(k));

      // Always-hide wins everything. (If you don't want this event, you don't want it.)
      if (matchExc) { hidden++; return false; }

      // Always-show forces events through strict-mode hiding.
      if (matchInc) return true;

      if (f.strictMode) {
        // Whitelist: only weekend / all-day / outside-hours events show (since no include match).
        const d = e.start && e.start.iso ? new Date(e.start.iso) : null;
        if (d) {
          const dow  = d.getDay(); // 0 = Sun, 6 = Sat
          const hour = d.getHours();
          if (f.showWeekends && (dow === 0 || dow === 6)) return true;
          if (f.showAllDay && e.start.allDay)             return true;
          if (hour <  f.workStartHour)                    return true;
          if (hour >= f.workEndHour)                      return true;
        }
        hidden++;
        return false;
      }

      // Loose mode: nothing else hides.
      return true;
    });
    return { keep, hidden };
  }

  // Tiny ICS parser. Handles VEVENT blocks: SUMMARY, LOCATION, DTSTART, DTEND, RRULE.
  // Recurring events are kept; thisWeekEvents() expands them into instances.
  function parseIcs(text) {
    if (!text) return [];
    const unfolded = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
    const lines = unfolded.split(/\r?\n/);
    const events = [];
    let cur = null;
    for (const raw of lines) {
      const line = raw.trim();
      if (line === "BEGIN:VEVENT") { cur = {}; continue; }
      if (line === "END:VEVENT") {
        if (cur && cur.summary && cur.start) events.push(cur);
        cur = null;
        continue;
      }
      if (!cur) continue;
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const semi = line.indexOf(";");
      const propEnd = (semi > 0 && semi < colon) ? semi : colon;
      const key = line.slice(0, propEnd).toUpperCase();
      const value = line.slice(colon + 1);
      if      (key === "SUMMARY")  cur.summary  = decodeIcsText(value);
      else if (key === "LOCATION") cur.location = decodeIcsText(value);
      else if (key === "DTSTART")  cur.start    = parseIcsDate(value);
      else if (key === "DTEND")    cur.end      = parseIcsDate(value);
      else if (key === "RRULE")    cur.rrule    = value;
    }
    return events;
  }

  function parseRrule(rrule) {
    const out = {};
    (rrule || "").split(";").forEach(part => {
      const [k, v] = part.split("=");
      if (k && v !== undefined) out[k.toUpperCase()] = v;
    });
    return out;
  }

  // Expand a recurring event into individual instances within the [windowStart, windowEnd] window.
  // Handles DAILY and WEEKLY (with optional BYDAY). Other freqs return an empty list for now.
  function expandRrule(event, windowStart, windowEnd) {
    if (!event.rrule || !event.start || !event.start.iso) return [event];
    const rules = parseRrule(event.rrule);
    if (!rules.FREQ) return [event];

    const startDate = new Date(event.start.iso);
    const startMs   = startDate.getTime();
    const winStart  = windowStart.getTime();
    const winEnd    = windowEnd.getTime();

    const until = rules.UNTIL ? parseIcsDate(rules.UNTIL) : null;
    const untilMs = until ? new Date(until.iso).getTime() : Infinity;
    const count = rules.COUNT ? parseInt(rules.COUNT, 10) : Infinity;
    const interval = Math.max(1, parseInt(rules.INTERVAL || "1", 10));

    const make = (ms) => Object.assign({}, event, {
      start: { iso: new Date(ms).toISOString(), allDay: event.start.allDay }
    });

    const out = [];
    let occ = 0;

    if (rules.FREQ === "DAILY") {
      const stepMs = interval * 86400000;
      let cursor = startMs;
      while (cursor <= winEnd && occ < count && cursor <= untilMs) {
        if (cursor >= winStart) out.push(make(cursor));
        cursor += stepMs;
        occ++;
      }
    } else if (rules.FREQ === "WEEKLY") {
      const dayMap = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
      const byday = rules.BYDAY
        ? rules.BYDAY.split(",").map(d => dayMap[d]).filter(d => d !== undefined)
        : [startDate.getDay()];

      // Anchor at the Sunday of startDate's week
      const weekAnchor = new Date(startDate);
      weekAnchor.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0);
      weekAnchor.setDate(weekAnchor.getDate() - weekAnchor.getDay());

      const stepWeekMs = interval * 7 * 86400000;
      let weekMs = weekAnchor.getTime();
      while (weekMs <= winEnd && occ < count) {
        for (const day of byday) {
          const inst = weekMs + day * 86400000;
          if (inst >= startMs && inst >= winStart && inst <= winEnd && inst <= untilMs) {
            out.push(make(inst));
            occ++;
            if (occ >= count) break;
          }
        }
        weekMs += stepWeekMs;
      }
    }
    // MONTHLY / YEARLY — skipped for v1
    return out;
  }
  function decodeIcsText(s) {
    return s.replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
  }
  function parseIcsDate(value) {
    if (/^\d{8}$/.test(value)) {
      const y = +value.slice(0, 4), m = +value.slice(4, 6) - 1, d = +value.slice(6, 8);
      return { iso: new Date(y, m, d).toISOString(), allDay: true };
    }
    const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
    if (!m) return null;
    const [, y, mo, d, h, mi, s, z] = m;
    const date = z === "Z"
      ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s))
      : new Date(+y, +mo - 1, +d, +h, +mi, +s);
    return { iso: date.toISOString(), allDay: false };
  }

  async function fetchIcs(url) {
    if (!url) return [];
    const fullUrl = ICS_PROXY + encodeURIComponent(url);
    console.log("[ics] fetching", url);
    try {
      const res = await fetch(fullUrl);
      if (!res.ok) {
        console.warn("[ics] HTTP", res.status, "for", url);
        throw new Error("HTTP " + res.status);
      }
      const text = await res.text();
      const parsed = parseIcs(text);
      console.log("[ics] parsed", parsed.length, "events from", url, "(text bytes:", text.length, ")");
      return parsed;
    } catch (e) {
      console.warn("[ics] fetch failed", url, e);
      return [];
    }
  }

  async function fetchAllCalendars(force) {
    const urls = getIcsUrls();
    if (!force) {
      try {
        const raw = localStorage.getItem(ICS_CACHE_KEY);
        if (raw) {
          const cached = JSON.parse(raw);
          if (cached.fetchedAt && (Date.now() - cached.fetchedAt) < ICS_TTL_MS) return cached;
        }
      } catch (e) {}
    }
    const [jess, mike] = await Promise.all([fetchIcs(urls.jess), fetchIcs(urls.mike)]);
    const fresh = { jess, mike, fetchedAt: Date.now() };
    try { localStorage.setItem(ICS_CACHE_KEY, JSON.stringify(fresh)); } catch (e) {}
    return fresh;
  }

  function thisWeekEvents(cache) {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end   = new Date(start.getTime() + 7 * 86400000);
    const raw = [];
    ["jess", "mike"].forEach(owner => {
      (cache[owner] || []).forEach(e => {
        if (!e.start || !e.start.iso) return;
        const instances = e.rrule ? expandRrule(e, start, end) : [e];
        instances.forEach(inst => {
          if (!inst.start || !inst.start.iso) return;
          const t = new Date(inst.start.iso).getTime();
          if (t >= start.getTime() && t < end.getTime()) {
            raw.push(Object.assign({}, inst, { owner }));
          }
        });
      });
    });
    // Dedupe shared events (same title + same start minute) → owner = "both".
    const byKey = new Map();
    const order = [];
    raw.forEach(e => {
      const key = (e.summary || "").toLowerCase().trim() + "|" + e.start.iso.slice(0, 16);
      if (byKey.has(key)) {
        byKey.get(key).owner = "both";
      } else {
        byKey.set(key, e);
        order.push(e);
      }
    });
    console.log("[ics] thisWeekEvents", {
      jessCount: (cache.jess || []).length,
      mikeCount: (cache.mike || []).length,
      raw: raw.length,
      deduped: order.length
    });
    return order.sort((a, b) => new Date(a.start.iso) - new Date(b.start.iso));
  }

  // Find time-conflicts: same start minute, different non-"both" owners.
  function findConflicts(events) {
    const flagged = new Set();
    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const a = events[i], b = events[j];
        if (a.owner === "both" || b.owner === "both") continue;
        if (a.owner === b.owner) continue;
        if (!a.start || !b.start) continue;
        const ta = new Date(a.start.iso).getTime();
        const tb = new Date(b.start.iso).getTime();
        if (Math.abs(ta - tb) < 30 * 60000) {
          flagged.add(a); flagged.add(b);
        }
      }
    }
    return flagged;
  }

  function renderThisWeek() {
    const el = document.getElementById("dash-thisweek");
    if (!el) return;
    const urls = getIcsUrls();
    const hasUrls = !!(urls.jess || urls.mike);
    if (!hasUrls) {
      el.innerHTML = `<div class="upcoming-empty">No calendar feeds yet — <a href="#" id="thisweek-setup">add Outlook URLs in Settings →</a></div>`;
      const link = el.querySelector("#thisweek-setup");
      if (link) link.addEventListener("click", e => { e.preventDefault(); setView("about"); });
      return;
    }
    el.innerHTML = `<div class="upcoming-empty">Loading calendar events…</div>`;
    fetchAllCalendars().then(cache => {
      const allEvents = thisWeekEvents(cache);
      const filtered = applyCalFilters(allEvents);
      const events = filtered.keep;
      if (events.length === 0) {
        const reason = allEvents.length > 0
          ? `All ${allEvents.length} event${allEvents.length === 1 ? "" : "s"} this week were hidden by your filters. <a href="#" id="thisweek-tweak">Adjust filters →</a>`
          : `No events in the next 7 days.`;
        el.innerHTML = `<div class="upcoming-empty">${reason} <button class="btn btn-ghost btn-sm" id="thisweek-refresh" type="button" style="margin-left:0.5rem">↻ Refresh</button></div>`;
        const r = el.querySelector("#thisweek-refresh");
        if (r) r.addEventListener("click", () => fetchAllCalendars(true).then(renderThisWeek));
        const tweak = el.querySelector("#thisweek-tweak");
        if (tweak) tweak.addEventListener("click", e => { e.preventDefault(); setView("about"); });
        return;
      }
      const today = new Date(); today.setHours(0,0,0,0);
      const tomorrow = new Date(today.getTime() + 86400000);
      const conflicts = findConflicts(events);
      const both = events.filter(e => e.owner === "both");
      const conflictEvents = events.filter(e => conflicts.has(e));

      const ownerEmoji = (key) => {
        if (key === "both") {
          const j = (window.PEOPLE.jess && window.PEOPLE.jess.emoji) || "🐧";
          const m = (window.PEOPLE.mike && window.PEOPLE.mike.emoji) || "🐱";
          return `${j}${m}`;
        }
        const o = window.PEOPLE[key];
        return o ? o.emoji : "❓";
      };

      // Compact one-line summary
      const summaryLine = `
        <div class="cal-summary-line">
          <span><strong>${events.length}</strong> events</span>
          <span class="dot-sep">·</span>
          <span><strong>${both.length}</strong> 🤝 both</span>
          <span class="dot-sep">·</span>
          <span class="${conflicts.size > 0 ? "conflict" : ""}">
            <strong>${conflicts.size}</strong> ⚠ conflict${conflicts.size === 1 ? "" : "s"}
          </span>
        </div>
      `;

      const dayLabel = (d) => {
        const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        if (dd.getTime() === today.getTime())    return "Today";
        if (dd.getTime() === tomorrow.getTime()) return "Tomorrow";
        return dd.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
      };

      const formatTime = (e) => e.start.allDay
        ? "All day"
        : new Date(e.start.iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

      const renderRow = (e, isConflict) => `
        <div class="cal-row ${isConflict ? "conflict" : ""}">
          <span class="cal-row-time">${formatTime(e)}</span>
          <span class="cal-row-owner ${e.owner}">${ownerEmoji(e.owner)}</span>
          <span class="cal-row-title">${isConflict ? "⚠ " : ""}${escapeHTML(e.summary)}</span>
        </div>
      `;

      // 🤝 Both block — pulled to the top, compact list with day + time
      const bothHtml = both.length === 0 ? "" : `
        <div class="cal-both">
          <div class="cal-block-head both">🤝 You're both at</div>
          ${both.map(e => `
            <div class="cal-row both-row">
              <span class="cal-row-time">${dayLabel(new Date(e.start.iso))} ${formatTime(e)}</span>
              <span class="cal-row-owner both">${ownerEmoji("both")}</span>
              <span class="cal-row-title">${escapeHTML(e.summary)}</span>
            </div>
          `).join("")}
        </div>
      `;

      // Conflicts block — also at top, red, full attention
      const conflictsHtml = conflictEvents.length === 0 ? "" : `
        <div class="cal-conflicts">
          <div class="cal-block-head">⚠ Conflicts</div>
          ${conflictEvents.map(e => `
            <div class="cal-conflict-row">
              <span class="cal-row-time">${dayLabel(new Date(e.start.iso))} ${formatTime(e)}</span>
              <span class="cal-row-owner ${e.owner}">${ownerEmoji(e.owner)}</span>
              <span class="cal-row-title">${escapeHTML(e.summary)}</span>
            </div>
          `).join("")}
        </div>
      `;

      // Day-grouped single-owner non-conflict events (the "calendar" itself)
      const dayEvents = events.filter(e => e.owner !== "both" && !conflicts.has(e));
      const byDay = new Map();
      dayEvents.forEach(e => {
        const d = new Date(e.start.iso); d.setHours(0,0,0,0);
        const key = d.toISOString();
        if (!byDay.has(key)) byDay.set(key, []);
        byDay.get(key).push(e);
      });
      const dayBlocksHtml = Array.from(byDay.entries()).map(([key, evs]) => {
        const d = new Date(key);
        return `
          <div class="cal-daygroup">
            <div class="cal-day-label">${dayLabel(d)}</div>
            ${evs.map(e => renderRow(e, false)).join("")}
          </div>
        `;
      }).join("");

      const hiddenNote = filtered.hidden > 0
        ? `<small>${filtered.hidden} hidden · <a href="#" id="thisweek-tweak">tweak →</a></small>`
        : "";

      el.innerHTML = summaryLine + bothHtml + conflictsHtml + dayBlocksHtml + `
        <div class="cal-foot">
          <button class="btn btn-ghost btn-sm" id="thisweek-refresh" type="button">↻ Refresh</button>
          ${hiddenNote}
          <small>Updated ${new Date(cache.fetchedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</small>
        </div>
      `;
      const tweak = el.querySelector("#thisweek-tweak");
      if (tweak) tweak.addEventListener("click", e => { e.preventDefault(); setView("about"); });
      const r = el.querySelector("#thisweek-refresh");
      if (r) r.addEventListener("click", () => fetchAllCalendars(true).then(renderThisWeek));
    });
  }

  // ---------- SUNDAY MEETING WIZARD ----------
  function getMeeting() {
    return Object.assign(
      { step: 1, notes: { worked: "", didnt: "", forNextWeek: "" } },
      state.currentMeeting || {}
    );
  }
  function setMeetingStep(step) {
    const m = getMeeting();
    m.step = Math.max(1, Math.min(4, step));
    state.currentMeeting = m;
    saveState();
  }
  function setMeetingNote(field, value) {
    const m = getMeeting();
    m.notes = Object.assign({}, m.notes, { [field]: value });
    state.currentMeeting = m;
    saveState();
  }

  function renderMeeting() {
    const m = getMeeting();
    const titleEl = document.getElementById("meeting-step-title");
    const subEl   = document.getElementById("meeting-step-sub");
    const content = document.getElementById("meeting-content");
    if (!content) return;

    // Step indicator
    document.querySelectorAll(".step-pill").forEach(p => {
      const n = parseInt(p.dataset.step, 10);
      p.classList.toggle("active", n === m.step);
      p.classList.toggle("done",   n < m.step);
    });
    document.querySelectorAll(".step-line").forEach((l, i) => {
      l.classList.toggle("done", (i + 1) < m.step);
    });

    const titles = {
      1: { t: "Step 1 · Recap", s: "How did last week go? Two minutes each." },
      2: { t: "Step 2 · Week ahead", s: "Calendar + trips. Who's covering what?" },
      3: { t: "Step 3 · Cards to discuss", s: "Anything to swap, agree on, or open up?" },
      4: { t: "Step 4 · Wrap", s: "Anything for next week? Then end the meeting." }
    };
    if (titleEl) titleEl.textContent = titles[m.step].t;
    if (subEl)   subEl.textContent   = titles[m.step].s;

    if (m.step === 1) renderMeetingStep1(content, m);
    else if (m.step === 2) renderMeetingStep2(content, m);
    else if (m.step === 3) renderMeetingStep3(content, m);
    else if (m.step === 4) renderMeetingStep4(content, m);

    const prev = document.getElementById("meeting-prev");
    const next = document.getElementById("meeting-next");
    if (prev) prev.disabled = m.step === 1;
    if (next) next.textContent = m.step === 4 ? "End meeting ✓" : "Next step →";
  }

  function renderMeetingStep1(el, m) {
    const cards = allCards();
    const { time, load } = totals(cards);
    const tT = time.jess + time.mike + (time.asher || 0) + time.open;
    const lT = load.jess + load.mike + (load.asher || 0) + load.open;
    el.innerHTML = `
      <div class="meeting-step">
        <h3>How did last week go?</h3>
        <p class="step-prompt">Quick check-in. No wrong answers — this becomes data over time.</p>
        <div class="stat-quick">
          <div><span class="num jess" style="color: var(--penguin)">${pct(load.jess, lT)}%</span><span class="lbl">🐧 Jess load</span></div>
          <div><span class="num mike" style="color: var(--kitty)">${pct(load.mike, lT)}%</span><span class="lbl">🐱 Mike load</span></div>
          ${(load.asher||0) > 0 ? `<div><span class="num" style="color: var(--asher)">${pct(load.asher, lT)}%</span><span class="lbl">🌱 Asher load</span></div>` : ""}
          <div><span class="num" style="color: var(--ink-900)">${time.jess.toFixed(1) + " / " + time.mike.toFixed(1)}</span><span class="lbl">Hours/wk · J / M</span></div>
        </div>
        <div class="field-stack">
          <div>
            <label style="font-weight: 600; font-size: 0.9rem; color: var(--ink-700); display: block; margin-bottom: 0.4rem;">✅ What worked?</label>
            <textarea id="m-worked" placeholder="One thing you appreciated. Tiny is fine.">${escapeHTML(m.notes.worked || "")}</textarea>
          </div>
          <div>
            <label style="font-weight: 600; font-size: 0.9rem; color: var(--ink-700); display: block; margin-bottom: 0.4rem;">⚠️ What didn't?</label>
            <textarea id="m-didnt" placeholder="What dropped, what felt heavy. Be honest, not harsh.">${escapeHTML(m.notes.didnt || "")}</textarea>
          </div>
        </div>
      </div>
    `;
    el.querySelector("#m-worked").addEventListener("input", e => setMeetingNote("worked", e.target.value));
    el.querySelector("#m-didnt").addEventListener("input", e => setMeetingNote("didnt", e.target.value));
  }

  function renderMeetingStep2(el, m) {
    const trips = sortedTrips().filter(t => t.status !== "done").slice(0, 3);
    el.innerHTML = `
      <div class="meeting-step">
        <h3>What's coming up?</h3>
        <p class="step-prompt">Look at the week, talk about who's covering what. Tap any event or trip to discuss.</p>
        <div class="embed-panel">
          <h4>📅 This week's calendar</h4>
          <div id="meeting-calendar" class="cal-list"></div>
        </div>
        <div class="embed-panel">
          <h4>🗓️ Trips & milestones</h4>
          <div id="meeting-trips" class="upcoming-list"></div>
        </div>
      </div>
    `;
    // Reuse existing renderers, retargeted at the meeting view's containers
    const calBox = document.getElementById("meeting-calendar");
    const tripsBox = document.getElementById("meeting-trips");
    if (calBox) {
      // Borrow the dashboard's render but write to this container
      const orig = document.getElementById("dash-thisweek");
      if (orig) {
        // Temporarily swap the id so renderThisWeek targets the meeting one
        orig.id = "dash-thisweek-was";
        calBox.id = "dash-thisweek";
        renderThisWeek();
        // Restore ids after a tick
        setTimeout(() => {
          if (calBox.id === "dash-thisweek") calBox.id = "meeting-calendar";
          if (orig.id === "dash-thisweek-was") orig.id = "dash-thisweek";
        }, 50);
      } else {
        calBox.innerHTML = `<div class="upcoming-empty">No calendar feeds yet. <a href="#" id="meeting-cal-setup">Add in Settings →</a></div>`;
        const link = calBox.querySelector("#meeting-cal-setup");
        if (link) link.addEventListener("click", e => { e.preventDefault(); setView("about"); });
      }
    }
    if (tripsBox) {
      if (trips.length === 0) {
        tripsBox.innerHTML = `<div class="upcoming-empty" style="font-style: italic;">No active trips on the horizon.</div>`;
      } else {
        tripsBox.innerHTML = trips.map(t => {
          const owner = window.PEOPLE[t.owner] || window.PEOPLE.open;
          return `
            <div class="upcoming-row" data-trip-id="${t.id}" role="button" tabindex="0">
              <span class="upcoming-icon">${t.icon || "🗓️"}</span>
              <div class="upcoming-body">
                <div class="upcoming-title">${escapeHTML(t.title)}</div>
                <div class="upcoming-sub">${escapeHTML(tripDateLabel(t.targetDate))} · ${escapeHTML(tripTimeAway(t.targetDate))}</div>
              </div>
              <span class="owner-badge ${t.owner}">${owner.emoji} ${owner.name}</span>
            </div>
          `;
        }).join("");
        tripsBox.querySelectorAll("[data-trip-id]").forEach(row => {
          row.addEventListener("click", () => openTripModal(row.dataset.tripId));
        });
      }
    }
  }

  function renderMeetingStep3(el, m) {
    const cards = allCards().filter(c => c.status === "discuss" || c.status === "open");
    el.innerHTML = `
      <div class="meeting-step">
        <h3>Cards flagged for us</h3>
        <p class="step-prompt">${cards.length} card${cards.length === 1 ? "" : "s"} marked 💬 Discuss or ❓ Open. Tap to edit ownership, agree, or rebalance.</p>
        ${cards.length === 0
          ? `<div style="background: rgba(127, 160, 104, 0.08); padding: 1rem 1.25rem; border-radius: var(--r-md); color: var(--sage-500); font-weight: 600;">🎉 No cards flagged. You're aligned.</div>`
          : cards.map(c => {
              const owner = window.PEOPLE[primaryOwner(c)] || window.PEOPLE.open;
              const flag = c.status === "open" ? "❓" : "💬";
              return `
                <div class="meeting-card-row" data-card-id="${c.id}">
                  <span class="icon">${c.icon || "🪄"}</span>
                  <div>
                    <div class="title">${flag} ${escapeHTML(c.title)}</div>
                    <div class="sub">${escapeHTML(window.SUITS[c.suit].name)} · ${c.weeklyHours}h/wk</div>
                  </div>
                  <span class="owner-badge ${primaryOwner(c)}">${owner.emoji} ${owner.name}</span>
                </div>
              `;
            }).join("")
        }
      </div>
    `;
    el.querySelectorAll("[data-card-id]").forEach(row => {
      row.addEventListener("click", () => openCard(row.dataset.cardId));
    });
  }

  function renderMeetingStep4(el, m) {
    const cards = allCards();
    const { time, load } = totals(cards);
    const lT = load.jess + load.mike + (load.asher || 0) + load.open;
    el.innerHTML = `
      <div class="meeting-step">
        <h3>Wrap up</h3>
        <p class="step-prompt">One last thing — anything to remember for next week?</p>
        <div class="stat-quick">
          <div><span class="num" style="color: var(--penguin)">${pct(load.jess, lT)}%</span><span class="lbl">🐧 Jess</span></div>
          <div><span class="num" style="color: var(--kitty)">${pct(load.mike, lT)}%</span><span class="lbl">🐱 Mike</span></div>
          ${(load.asher||0) > 0 ? `<div><span class="num" style="color: var(--asher)">${pct(load.asher, lT)}%</span><span class="lbl">🌱 Asher</span></div>` : ""}
        </div>
        <div class="field-stack">
          <div>
            <label style="font-weight: 600; font-size: 0.9rem; color: var(--ink-700); display: block; margin-bottom: 0.4rem;">📝 Notes for next week</label>
            <textarea id="m-next" placeholder="One reminder, one ask, one win to repeat.">${escapeHTML(m.notes.forNextWeek || "")}</textarea>
          </div>
        </div>
        <div style="margin-top: 1.5rem; padding: 1rem 1.25rem; background: var(--cream-100); border-radius: var(--r-md); font-size: 0.9rem; color: var(--ink-700);">
          <strong>This week's snapshot</strong> (auto-saved):<br>
          <small style="color: var(--ink-500);">Jess ${time.jess.toFixed(1)}h · Mike ${time.mike.toFixed(1)}h${(time.asher||0) > 0 ? ` · Asher ${time.asher.toFixed(1)}h` : ""}</small>
        </div>
      </div>
    `;
    el.querySelector("#m-next").addEventListener("input", e => setMeetingNote("forNextWeek", e.target.value));
  }

  function endMeeting() {
    // Reset for next week — keep nothing in current; next meeting starts fresh.
    state.currentMeeting = { step: 1, notes: { worked: "", didnt: "", forNextWeek: "" } };
    saveState();
    showToast("Meeting wrapped — see you next Sunday ✨");
    setView("dashboard");
  }

  function meetingNext() {
    const m = getMeeting();
    if (m.step >= 4) { endMeeting(); return; }
    setMeetingStep(m.step + 1);
    renderMeeting();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function meetingPrev() {
    const m = getMeeting();
    if (m.step <= 1) return;
    setMeetingStep(m.step - 1);
    renderMeeting();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------- VIEW ROUTING ----------
  function setView(name) {
    activeView = name;
    document.querySelectorAll(".view").forEach(el => {
      el.classList.toggle("active", el.dataset.view === name);
    });
    document.querySelectorAll(".nav-tabs button").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.view === name);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });

    // Re-render dynamic views on entry.
    if (name === "deck")      renderDeck();
    if (name === "walk")      renderWalk();
    if (name === "trips")      renderTrips();
    if (name === "dashboard")  renderDashboard();
    if (name === "meeting")    renderMeeting();
    if (name === "coordinate") renderThisWeek();
    if (name === "chores")     renderChores();
  }

  // ---------- RENDER: COVER ----------
  function renderCover() {
    const noteEl = document.getElementById("note-body");
    if (!noteEl) return;
    // Render as static text — paragraphs, with "— Mike" sign-off styled
    noteEl.innerHTML = state.note.split("\n\n").map(p => {
      const text = escapeHTML(p).replace(/\n/g, "<br>");
      if (p.trim().startsWith("—")) return `<span class="signoff">${text}</span>`;
      return `<span style="display:block; margin-bottom: 0.85rem;">${text}</span>`;
    }).join("");
  }

  function openNoteEditor() {
    const m = document.getElementById("modal");
    m.innerHTML = `
      <button class="close" aria-label="Close" type="button">×</button>
      <h2>✎ Edit your note to Jess</h2>
      <div class="desc">This appears on the cover. Be honest, be you. She'll know.</div>
      <div class="field">
        <textarea class="note-edit" id="note-input">${escapeHTML(state.note)}</textarea>
        <div class="hint">Lines beginning with — get italic styling.</div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" id="note-reset" type="button">Reset to default</button>
        <div class="spacer"></div>
        <button class="btn btn-primary" id="note-save" type="button">Save note</button>
      </div>
    `;
    document.getElementById("modal-backdrop").classList.add("active");
    m.querySelector(".close").addEventListener("click", closeModal);
    m.querySelector("#note-save").addEventListener("click", () => {
      const txt = m.querySelector("#note-input").value.trim();
      state.note = txt || DEFAULT_NOTE;
      saveState();
      renderCover();
      closeModal();
      showToast("Note saved");
    });
    m.querySelector("#note-reset").addEventListener("click", () => {
      m.querySelector("#note-input").value = DEFAULT_NOTE;
    });
  }

  // Renders an <ol> of the top-N cards by mental-load weight to `who`
  // ("jess" | "mike"). Returns innerHTML for the <ol>.
  function renderTopList(cards, who) {
    const ranked = cards
      .map(c => ({ c, l: mentalLoadSplit(c) }))
      .filter(x => x.l[who] > 0)
      .sort((a, b) => b.l[who] - a.l[who])
      .slice(0, 5);
    if (ranked.length === 0) {
      return `<li class="empty">No cards yet — open ones will land here as we assign them.</li>`;
    }
    return ranked
      .map(x => `<li>${x.c.icon} <strong>${escapeHTML(x.c.title)}</strong> <small>(${x.c.weeklyHours}h/wk)</small></li>`)
      .join("");
  }

  // Renders the *inner* segments of a split bar — caller provides the wrapper.
  function renderSplitBarInner({ jess, mike, asher, split, open }) {
    asher = asher || 0;
    split = split || 0;
    open  = open  || 0;
    const segs = [];
    if (jess  > 0) segs.push(`<div class="seg jess"  style="width:${jess}%">${jess  > 8 ? jess  + "%" : ""}</div>`);
    if (mike  > 0) segs.push(`<div class="seg mike"  style="width:${mike}%">${mike  > 8 ? mike  + "%" : ""}</div>`);
    if (asher > 0) segs.push(`<div class="seg asher" style="width:${asher}%">${asher > 8 ? asher + "%" : ""}</div>`);
    if (split > 0) segs.push(`<div class="seg split" style="width:${split}%">${split > 8 ? split + "%" : ""}</div>`);
    if (open  > 0) segs.push(`<div class="seg open"  style="width:${open}%">${open  > 8 ? open  + "%" : ""}</div>`);
    return segs.join("");
  }
  // Wraps the inner with a thick split bar.
  function renderSplitBar(parts) {
    return `<div class="split-bar thick">${renderSplitBarInner(parts)}</div>`;
  }

  // Renders the per-suit stack used on Snapshot + Dashboard.
  function renderSuitStack(cards) {
    let html = "";
    Object.values(window.SUITS).forEach(suit => {
      const inSuit = cards.filter(c => c.suit === suit.id);
      if (inSuit.length === 0) return;
      const t = totals(inSuit);
      const sum = t.load.jess + t.load.mike + t.load.asher + t.load.open;
      const totalHours = (t.time.jess + t.time.mike + t.time.asher + t.time.open).toFixed(1);
      html += `
        <div class="suit-row">
          <div class="label"><span class="emoji">${suit.emoji}</span>${suit.name}</div>
          <div class="split-bar">${renderSplitBarInner({
            jess:  pct(t.load.jess,  sum),
            mike:  pct(t.load.mike,  sum),
            asher: pct(t.load.asher, sum),
            open:  pct(t.load.open,  sum)
          })}</div>
          <div class="total">${totalHours}h/wk</div>
        </div>
      `;
    });
    return html;
  }

  // ---------- RENDER: DECK ----------
  function renderDeck() {
    const filter = state.deckFilter;
    document.querySelectorAll("#deck-filters button").forEach(b => {
      b.classList.toggle("active", b.dataset.filter === filter);
    });

    const container = document.getElementById("deck-grid");
    container.innerHTML = "";

    Object.values(window.SUITS).forEach(suit => {
      const cardsInSuit = allCards().filter(c => c.suit === suit.id).filter(c => filterCard(c, filter));
      if (cardsInSuit.length === 0) return;

      const sec = document.createElement("section");
      sec.className = "suit-section";
      sec.innerHTML = `
        <div class="suit-head">
          <h3>${suit.emoji} ${suit.name}</h3>
          <span class="blurb">${suit.blurb}</span>
        </div>
        <div class="cards-grid"></div>
      `;
      const grid = sec.querySelector(".cards-grid");
      cardsInSuit.forEach(c => grid.appendChild(renderCardTile(c)));
      container.appendChild(sec);
    });
  }

  function filterCard(c, filter) {
    if (filter === "all") return true;
    if (filter === "discuss") return c.status === "discuss";
    if (filter === "open")    return c.status === "open";
    // Each person's filter surfaces a card if that person is involved in ANY
    // CPE slot — including 50/50 splits and 80/20 leans. So a Jess & Mike
    // split card shows up under both Jess and Mike.
    if (filter === "jess" || filter === "mike" || filter === "asher") {
      return ["C","P","E"].some(k => {
        const o = c.cpe[k];
        if (filter === "jess")  return o === "jess"  || o === "mostly-jess" || o === "split" || o === "jess-asher";
        if (filter === "mike")  return o === "mike"  || o === "mostly-mike" || o === "split" || o === "mike-asher";
        if (filter === "asher") return o === "asher" || o === "jess-asher"  || o === "mike-asher";
        return false;
      });
    }
    // Split filter still narrows to cards whose dominant owner is the 50/50 split.
    if (filter === "split") return primaryOwner(c) === "split";
    return true;
  }

  function primaryOwner(c) {
    // Returns the dominant owner across CPE for badge purposes.
    const counts = {};
    ["C","P","E"].forEach(k => {
      const o = c.cpe[k] || "open";
      counts[o] = (counts[o] || 0) + 1;
    });
    let best = "open", n = -1;
    Object.entries(counts).forEach(([k, v]) => { if (v > n) { best = k; n = v; } });
    return best;
  }

  function renderCardTile(c) {
    const tile = document.createElement("div");
    tile.className = `card status-${c.status}`;
    tile.dataset.cardId = c.id;
    const owner = primaryOwner(c);
    const ownerInfo = window.PEOPLE[owner];
    const flag = c.status === "discuss" ? "💬" : (c.status === "open" ? "❓" : "");
    tile.innerHTML = `
      <div class="icon-row">
        <span class="icon">${c.icon}</span>
        ${flag ? `<span class="status-flag" title="${c.status}">${flag}</span>` : ""}
      </div>
      <div class="title">${escapeHTML(c.title)}</div>
      <div class="desc">${escapeHTML(c.description)}</div>
      <div class="meta">
        <span class="hours">${c.weeklyHours}h/wk</span>
        <span class="cpe-mini">${cpeShort(c)}</span>
      </div>
      <div style="margin-top: 0.5rem">
        <span class="owner-badge ${owner}">${ownerInfo.emoji} ${ownerInfo.name}</span>
      </div>
    `;
    tile.addEventListener("click", () => openCard(c.id));
    return tile;
  }

  function cpeShort(c) {
    return ["C","P","E"].map(k => {
      const o = c.cpe[k];
      const e = window.PEOPLE[o] ? window.PEOPLE[o].emoji : "❓";
      return `<span title="${k}: ${window.PEOPLE[o]?.name || "Open"}">${k}·${e}</span>`;
    }).join("");
  }

  // ---------- MODAL: CARD DETAIL ----------
  function openCard(id) {
    openCardId = id;
    const c = getCard(id);
    if (!c) return;

    const m = document.getElementById("modal");
    m.innerHTML = `
      <button class="close" aria-label="Close">×</button>
      <h2>${c.icon} ${escapeHTML(c.title)}</h2>
      <div class="desc">${escapeHTML(c.description)}</div>

      ${c.discussionPrompt ? `
        <div class="discussion-block">
          <div class="lbl">💬 To discuss</div>
          ${escapeHTML(c.discussionPrompt)}
        </div>` : ""}

      <div class="field">
        <label>Who owns Conception · Planning · Execution?</label>
        <div class="cpe-row">
          ${["C","P","E"].map(k => `
            <div class="cpe-pick">
              <div class="lbl"><span class="letter">${k}</span>${k === "C" ? "Notice" : k === "P" ? "Plan" : "Do"}</div>
              <select data-cpe="${k}">
                <option value="jess"          ${c.cpe[k]==="jess"?"selected":""}>🐧 Jess</option>
                <option value="mostly-jess"   ${c.cpe[k]==="mostly-jess"?"selected":""}>🐧⁺ Mostly Jess (80/20)</option>
                <option value="jess-asher"    ${c.cpe[k]==="jess-asher"?"selected":""}>🐧⚾ Jess & Asher (50/50)</option>
                <option value="split"         ${c.cpe[k]==="split"?"selected":""}>🤝 Jess & Mike (50/50)</option>
                <option value="mike-asher"    ${c.cpe[k]==="mike-asher"?"selected":""}>🐱⚾ Mike & Asher (50/50)</option>
                <option value="mostly-mike"   ${c.cpe[k]==="mostly-mike"?"selected":""}>🐱⁺ Mostly Mike (80/20)</option>
                <option value="mike"          ${c.cpe[k]==="mike"?"selected":""}>🐱 Mike</option>
                <option value="asher"         ${c.cpe[k]==="asher"?"selected":""}>⚾ Asher</option>
                <option value="open"          ${c.cpe[k]==="open"?"selected":""}>❓ Open</option>
              </select>
            </div>
          `).join("")}
        </div>
      </div>

      <div class="field">
        <label>Estimated hours per week</label>
        <input type="number" step="0.25" min="0" id="modal-hours" value="${c.weeklyHours}">
        <div class="hint">Honest guess. We can refine over time.</div>
      </div>

      <div class="field">
        <label>Minimum standard of care</label>
        <textarea id="modal-msc" placeholder="What 'good enough' looks like for this card. e.g. 'Lights out by 8:15, story read, water on nightstand.'">${escapeHTML(c.minimumStandard || "")}</textarea>
        <div class="hint">From Fair Play — set the bar so the holder is trusted to do it their way.</div>
      </div>

      <div class="field">
        <label>Status</label>
        <div class="status-pills">
          <button data-status="agreed"  class="${c.status==="agreed"?"active agreed":""}">✅ We agree</button>
          <button data-status="discuss" class="${c.status==="discuss"?"active discuss":""}">💬 Let's discuss</button>
          <button data-status="open"    class="${c.status==="open"?"active open":""}">❓ Still open</button>
        </div>
      </div>

      <div class="modal-foot">
        ${isCustomCard(id)
          ? `<button class="btn btn-ghost" id="modal-delete" style="color: var(--rose-400);">🗑 Delete this card</button>`
          : `<button class="btn btn-ghost" id="modal-reset">Reset to Mike's pre-fill</button>`}
        <div class="spacer"></div>
        <button class="btn btn-primary" id="modal-done">Done</button>
      </div>
    `;
    document.getElementById("modal-backdrop").classList.add("active");

    // Wire it up
    m.querySelector(".close").addEventListener("click", closeModal);
    m.querySelectorAll("select[data-cpe]").forEach(sel => {
      sel.addEventListener("change", e => {
        const k = e.target.dataset.cpe;
        const patch = { cpe: {} };
        patch.cpe[k] = e.target.value;
        updateCard(id, patch);
      });
    });
    m.querySelector("#modal-hours").addEventListener("change", e => {
      updateCard(id, { weeklyHours: parseFloat(e.target.value) || 0 });
    });
    m.querySelector("#modal-msc").addEventListener("change", e => {
      updateCard(id, { minimumStandard: e.target.value });
    });
    m.querySelectorAll(".status-pills button").forEach(btn => {
      btn.addEventListener("click", () => {
        updateCard(id, { status: btn.dataset.status });
        m.querySelectorAll(".status-pills button").forEach(b => {
          b.classList.toggle("active", b === btn);
          b.classList.toggle("agreed",  btn.dataset.status === "agreed"  && b === btn);
          b.classList.toggle("discuss", btn.dataset.status === "discuss" && b === btn);
          b.classList.toggle("open",    btn.dataset.status === "open"    && b === btn);
        });
      });
    });
    if (isCustomCard(id)) {
      m.querySelector("#modal-delete").addEventListener("click", () => {
        if (!confirm("Delete this card? This can't be undone.")) return;
        deleteCustomCard(id);
        closeModal();
        showToast("Card deleted");
        if (activeView === "deck")      renderDeck();
        if (activeView === "walk")      { state.walkIndex = 0; saveState(); renderWalk(); }
        if (activeView === "dashboard") renderDashboard();
      });
    } else {
      m.querySelector("#modal-reset").addEventListener("click", () => {
        delete state.cards[id];
        saveState();
        openCard(id); // re-render
      });
    }
    m.querySelector("#modal-done").addEventListener("click", () => {
      closeModal();
      if (activeView === "deck")      renderDeck();
      if (activeView === "walk")      renderWalk();
      if (activeView === "dashboard") renderDashboard();
    });
  }

  // ---------- RENDER: TRIPS ----------
  function renderTrips() {
    const wrap = document.getElementById("trips-list");
    if (!wrap) return;
    const list = sortedTrips();
    if (list.length === 0) {
      wrap.innerHTML = `<div class="surface" style="text-align:center; color: var(--ink-500);">No trips yet — tap "Add trip" to add one.</div>`;
      return;
    }
    wrap.innerHTML = list.map(t => renderTripCard(t)).join("");
    wrap.querySelectorAll("[data-trip-id]").forEach(el => {
      el.addEventListener("click", () => openTripModal(el.dataset.tripId));
    });
  }

  function renderTripCard(t) {
    const owner = window.PEOPLE[t.owner] || window.PEOPLE.open;
    const statusLabel = t.status === "booked" ? "Booked" : t.status === "done" ? "Done" : "Planning";
    return `
      <div class="surface trip-card trip-${t.status}" data-trip-id="${t.id}" role="button" tabindex="0">
        <div class="trip-head">
          <span class="trip-icon">${t.icon || "🗓️"}</span>
          <div class="trip-title-block">
            <h3>${escapeHTML(t.title)}</h3>
            <div class="trip-meta">
              <span class="owner-badge ${t.owner}">${owner.emoji} ${owner.name}</span>
              <span class="trip-status-pill trip-${t.status}">${statusLabel}</span>
            </div>
          </div>
          <div class="trip-when">
            <div class="trip-date">${escapeHTML(tripDateLabel(t.targetDate))}</div>
            <div class="trip-away">${escapeHTML(tripTimeAway(t.targetDate))}</div>
          </div>
        </div>
        ${t.notes ? `<p class="trip-notes">${escapeHTML(t.notes)}</p>` : ""}
      </div>
    `;
  }

  // The "Coming up" surface on the Dashboard — next 3 active trips.
  function renderUpcomingTrips() {
    const el = document.getElementById("dash-upcoming");
    if (!el) return;
    const list = sortedTrips().filter(t => t.status !== "done").slice(0, 3);
    if (list.length === 0) {
      el.innerHTML = `<div class="upcoming-empty">No trips on the horizon. <a href="#" id="upcoming-add">Add one →</a></div>`;
      const add = el.querySelector("#upcoming-add");
      if (add) add.addEventListener("click", e => { e.preventDefault(); openTripModal(); });
      return;
    }
    el.innerHTML = list.map(t => {
      const owner = window.PEOPLE[t.owner] || window.PEOPLE.open;
      return `
        <div class="upcoming-row" data-trip-id="${t.id}" role="button" tabindex="0">
          <span class="upcoming-icon">${t.icon || "🗓️"}</span>
          <div class="upcoming-body">
            <div class="upcoming-title">${escapeHTML(t.title)}</div>
            <div class="upcoming-sub">${escapeHTML(tripDateLabel(t.targetDate))} · ${escapeHTML(tripTimeAway(t.targetDate))}</div>
          </div>
          <span class="owner-badge ${t.owner}">${owner.emoji} ${owner.name}</span>
        </div>
      `;
    }).join("");
    el.querySelectorAll("[data-trip-id]").forEach(row => {
      row.addEventListener("click", () => openTripModal(row.dataset.tripId));
    });
  }

  // ---------- MODAL: TRIP DETAIL ----------
  function openTripModal(id) {
    const isNew = !id;
    const list = getTrips();
    const t = isNew
      ? { id: "trip-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6),
          title: "", icon: "🗓️", owner: "open", targetDate: "", status: "planning", notes: "" }
      : (list.find(x => x.id === id) || null);
    if (!t) return;

    const m = document.getElementById("modal");
    m.innerHTML = `
      <button class="close" aria-label="Close" type="button">×</button>
      <h2>${isNew ? "＋ Add a trip" : `${t.icon || "🗓️"} ${escapeHTML(t.title) || "Trip"}`}</h2>
      <div class="desc">${isNew ? "Long-term things on the horizon — flights, lodging, the works." : "Edit anything below. Saves automatically."}</div>

      <div class="field">
        <label>Title <span style="color: var(--rose-400)">*</span></label>
        <input type="text" id="trip-title" placeholder="e.g. China · Boone skiing" autocomplete="off" value="${escapeHTML(t.title || "")}" />
      </div>

      <div class="field">
        <label>Icon (emoji)</label>
        <input type="text" id="trip-icon" maxlength="4" style="width: 6rem;" value="${escapeHTML(t.icon || "🗓️")}" />
      </div>

      <div class="field">
        <label>Who's planning</label>
        <select id="trip-owner">
          <option value="jess"  ${t.owner==="jess"?"selected":""}>🐧 Jess</option>
          <option value="mike"  ${t.owner==="mike"?"selected":""}>🐱 Mike</option>
          <option value="asher" ${t.owner==="asher"?"selected":""}>⚾ Asher</option>
          <option value="split" ${t.owner==="split"?"selected":""}>🤝 Split</option>
          <option value="open"  ${t.owner==="open"?"selected":""}>❓ Open</option>
        </select>
      </div>

      <div class="field">
        <label>Target date</label>
        <input type="date" id="trip-date" value="${escapeHTML(t.targetDate || "")}" />
        <div class="hint">Approximate is fine — the dashboard shows month + year.</div>
      </div>

      <div class="field">
        <label>Status</label>
        <div class="status-pills" id="trip-status-pills">
          <button data-status="planning" type="button" class="${t.status==="planning"?"active planning":""}">📋 Planning</button>
          <button data-status="booked"   type="button" class="${t.status==="booked"  ?"active booked"  :""}">✅ Booked</button>
          <button data-status="done"     type="button" class="${t.status==="done"    ?"active done"    :""}">🏁 Done</button>
        </div>
      </div>

      <div class="field">
        <label>Notes</label>
        <textarea id="trip-notes" placeholder="Itinerary thoughts, links, who's doing what.">${escapeHTML(t.notes || "")}</textarea>
      </div>

      <div class="modal-foot">
        ${isNew
          ? `<button class="btn btn-ghost" id="trip-cancel" type="button">Cancel</button>`
          : `<button class="btn btn-ghost" id="trip-delete" type="button" style="color: var(--rose-400);">🗑 Delete</button>`}
        <div class="spacer"></div>
        ${isNew ? "" : `<button class="btn btn-secondary" id="trip-ics" type="button">📅 Add to calendar</button>`}
        <button class="btn btn-primary" id="trip-save" type="button">${isNew ? "Add trip" : "Save"}</button>
      </div>
    `;
    document.getElementById("modal-backdrop").classList.add("active");
    setTimeout(() => { const el = m.querySelector("#trip-title"); if (el && isNew) el.focus(); }, 50);

    let pickedStatus = t.status;
    m.querySelectorAll("#trip-status-pills button").forEach(btn => {
      btn.addEventListener("click", () => {
        pickedStatus = btn.dataset.status;
        m.querySelectorAll("#trip-status-pills button").forEach(b => {
          b.classList.toggle("active", b === btn);
          b.classList.remove("planning", "booked", "done");
          if (b === btn) b.classList.add(pickedStatus);
        });
      });
    });

    m.querySelector(".close").addEventListener("click", closeModal);
    if (isNew) m.querySelector("#trip-cancel").addEventListener("click", closeModal);
    else m.querySelector("#trip-delete").addEventListener("click", () => {
      if (!confirm("Delete this trip? This can't be undone.")) return;
      deleteTrip(t.id);
      closeModal();
      showToast("Trip deleted");
      if (activeView === "trips")     renderTrips();
      if (activeView === "dashboard") renderDashboard();
    });
    const tripIcsBtn = m.querySelector("#trip-ics");
    if (tripIcsBtn) tripIcsBtn.addEventListener("click", () => {
      const date = m.querySelector("#trip-date").value || t.targetDate;
      if (!date) { showToast("Set a target date first"); return; }
      const title = (m.querySelector("#trip-title").value.trim() || t.title || "Trip");
      const notes = m.querySelector("#trip-notes").value;
      const ics = buildIcsFile({
        uid: `${t.id}@fairplay-jess.app`,
        title,
        start: icsDateOnly(date),
        end: icsDateOnlyPlusOne(date),
        allDay: true,
        description: notes
      });
      downloadIcs(`${slugify(title)}.ics`, ics);
      showToast("Tap the file to add to a calendar");
    });
    m.querySelector("#trip-save").addEventListener("click", () => {
      const title = m.querySelector("#trip-title").value.trim();
      if (!title) {
        showToast("Trip needs a title");
        m.querySelector("#trip-title").focus();
        return;
      }
      const updated = {
        id: t.id,
        title,
        icon: m.querySelector("#trip-icon").value.trim() || "🗓️",
        owner: m.querySelector("#trip-owner").value,
        targetDate: m.querySelector("#trip-date").value,
        status: pickedStatus,
        notes: m.querySelector("#trip-notes").value.trim()
      };
      upsertTrip(updated);
      closeModal();
      showToast(isNew ? "Trip added ✨" : "Trip saved");
      if (activeView === "trips")     renderTrips();
      if (activeView === "dashboard") renderDashboard();
    });
  }

  // ---------- MODAL: ADD CARD ----------
  function openAddCardModal() {
    const m = document.getElementById("modal");
    const suitOptions = Object.values(window.SUITS)
      .map(s => `<option value="${s.id}">${s.emoji} ${escapeHTML(s.name)}</option>`).join("");
    m.innerHTML = `
      <button class="close" aria-label="Close" type="button">×</button>
      <h2>＋ Add a new card</h2>
      <div class="desc">Anything we missed. Either of us can add cards anytime — they'll sync to both devices.</div>

      <div class="field">
        <label>Title <span style="color: var(--rose-400)">*</span></label>
        <input type="text" id="add-title" placeholder="e.g. Plant care" autocomplete="off" />
      </div>

      <div class="field">
        <label>Category (suit)</label>
        <select id="add-suit">${suitOptions}</select>
      </div>

      <div class="field">
        <label>Icon (emoji)</label>
        <input type="text" id="add-icon" placeholder="🪄" maxlength="4" style="width: 6rem;" />
      </div>

      <div class="field">
        <label>Description</label>
        <textarea id="add-desc" placeholder="What this card covers in a sentence."></textarea>
      </div>

      <div class="field">
        <label>Who owns Conception · Planning · Execution?</label>
        <div class="cpe-row">
          ${["C","P","E"].map(k => `
            <div class="cpe-pick">
              <div class="lbl"><span class="letter">${k}</span>${k === "C" ? "Notice" : k === "P" ? "Plan" : "Do"}</div>
              <select data-add-cpe="${k}">
                <option value="open" selected>❓ Open</option>
                <option value="jess">🐧 Jess</option>
                <option value="mostly-jess">🐧⁺ Mostly Jess (80/20)</option>
                <option value="jess-asher">🐧⚾ Jess & Asher (50/50)</option>
                <option value="split">🤝 Jess & Mike (50/50)</option>
                <option value="mike-asher">🐱⚾ Mike & Asher (50/50)</option>
                <option value="mostly-mike">🐱⁺ Mostly Mike (80/20)</option>
                <option value="mike">🐱 Mike</option>
                <option value="asher">⚾ Asher</option>
              </select>
            </div>
          `).join("")}
        </div>
      </div>

      <div class="field">
        <label>Estimated hours per week</label>
        <input type="number" step="0.25" min="0" id="add-hours" value="0" />
      </div>

      <div class="field">
        <label>Minimum standard of care</label>
        <textarea id="add-msc" placeholder="What 'good enough' looks like."></textarea>
      </div>

      <div class="field">
        <label>Status</label>
        <div class="status-pills" id="add-status-pills">
          <button data-status="agreed" type="button">✅ We agree</button>
          <button data-status="discuss" type="button" class="active discuss">💬 Let's discuss</button>
          <button data-status="open" type="button">❓ Still open</button>
        </div>
      </div>

      <div class="modal-foot">
        <button class="btn btn-ghost" id="add-cancel" type="button">Cancel</button>
        <div class="spacer"></div>
        <button class="btn btn-primary" id="add-save" type="button">Add card</button>
      </div>
    `;
    document.getElementById("modal-backdrop").classList.add("active");
    setTimeout(() => { const el = m.querySelector("#add-title"); if (el) el.focus(); }, 50);

    let pickedStatus = "discuss";
    m.querySelectorAll("#add-status-pills button").forEach(btn => {
      btn.addEventListener("click", () => {
        pickedStatus = btn.dataset.status;
        m.querySelectorAll("#add-status-pills button").forEach(b => {
          b.classList.toggle("active", b === btn);
          b.classList.remove("agreed", "discuss", "open");
          if (b === btn) b.classList.add(pickedStatus);
        });
      });
    });

    m.querySelector(".close").addEventListener("click", closeModal);
    m.querySelector("#add-cancel").addEventListener("click", closeModal);
    m.querySelector("#add-save").addEventListener("click", () => {
      const title = m.querySelector("#add-title").value.trim();
      if (!title) {
        showToast("Card needs a title");
        m.querySelector("#add-title").focus();
        return;
      }
      const cpe = {};
      ["C","P","E"].forEach(k => {
        cpe[k] = m.querySelector(`[data-add-cpe="${k}"]`).value;
      });
      addCustomCard({
        title,
        suit: m.querySelector("#add-suit").value,
        icon: m.querySelector("#add-icon").value.trim() || "🪄",
        description: m.querySelector("#add-desc").value.trim(),
        cpe,
        weeklyHours: parseFloat(m.querySelector("#add-hours").value) || 0,
        minimumStandard: m.querySelector("#add-msc").value.trim(),
        status: pickedStatus
      });
      closeModal();
      showToast("Card added ✨");
      if (activeView === "deck")      renderDeck();
      if (activeView === "dashboard") renderDashboard();
    });
  }

  // ---------- MODAL: ADD CALENDAR EVENT (Coordinate) ----------
  function openAddEventModal() {
    const m = document.getElementById("modal");
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${pad2(today.getMonth()+1)}-${pad2(today.getDate())}`;
    m.innerHTML = `
      <button class="close" aria-label="Close" type="button">×</button>
      <h2>＋ Add an event</h2>
      <div class="desc">Generates a calendar invite (.ics). Tap the downloaded file on your phone — iOS opens "Add to Calendar" and lets you pick which calendar (Outlook included if your work account is on the device).</div>

      <div class="field">
        <label>Title <span style="color: var(--rose-400)">*</span></label>
        <input type="text" id="event-title" placeholder="e.g. Sunday logistics meeting" autocomplete="off" />
      </div>

      <div class="field">
        <label>Date</label>
        <input type="date" id="event-date" value="${todayIso}" />
      </div>

      <div class="field">
        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
          <input type="checkbox" id="event-allday" style="width: auto; margin: 0;" />
          <span>All day</span>
        </label>
      </div>

      <div class="field" id="event-times-field">
        <label>Time</label>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
          <input type="time" id="event-start" value="20:00" />
          <input type="time" id="event-end" value="20:30" />
        </div>
        <div class="hint">Start · End</div>
      </div>

      <div class="field">
        <label>Location (optional)</label>
        <input type="text" id="event-location" placeholder="" autocomplete="off" />
      </div>

      <div class="field">
        <label>Notes (optional)</label>
        <textarea id="event-notes" placeholder="Anything to remember."></textarea>
      </div>

      <div class="modal-foot">
        <button class="btn btn-ghost" id="event-cancel" type="button">Cancel</button>
        <div class="spacer"></div>
        <button class="btn btn-primary" id="event-save" type="button">📅 Download .ics</button>
      </div>
    `;
    document.getElementById("modal-backdrop").classList.add("active");
    setTimeout(() => { const el = m.querySelector("#event-title"); if (el) el.focus(); }, 50);

    const allday = m.querySelector("#event-allday");
    const timesField = m.querySelector("#event-times-field");
    allday.addEventListener("change", () => {
      timesField.style.display = allday.checked ? "none" : "";
    });

    m.querySelector(".close").addEventListener("click", closeModal);
    m.querySelector("#event-cancel").addEventListener("click", closeModal);
    m.querySelector("#event-save").addEventListener("click", () => {
      const title = m.querySelector("#event-title").value.trim();
      if (!title) {
        showToast("Event needs a title");
        m.querySelector("#event-title").focus();
        return;
      }
      const date = m.querySelector("#event-date").value;
      if (!date) { showToast("Event needs a date"); return; }
      const isAllDay = allday.checked;
      const location = m.querySelector("#event-location").value.trim();
      const notes = m.querySelector("#event-notes").value.trim();
      const uid = `event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}@fairplay-jess.app`;

      let start, end;
      if (isAllDay) {
        start = icsDateOnly(date);
        end = icsDateOnlyPlusOne(date);
      } else {
        const sParts = (m.querySelector("#event-start").value || "20:00").split(":");
        const eParts = (m.querySelector("#event-end").value   || "20:30").split(":");
        const sh = parseInt(sParts[0], 10) || 0;
        const sm = parseInt(sParts[1], 10) || 0;
        const eh = parseInt(eParts[0], 10) || sh;
        const em = parseInt(eParts[1], 10) || sm;
        start = icsLocalDateTime(date, sh, sm);
        end   = icsLocalDateTime(date, eh, em);
      }

      const ics = buildIcsFile({
        uid, title, start, end,
        allDay: isAllDay,
        description: notes,
        location
      });
      downloadIcs(`${slugify(title)}.ics`, ics);
      closeModal();
      showToast("Tap the file to add to a calendar");
    });
  }

  function closeModal() {
    document.getElementById("modal-backdrop").classList.remove("active");
    openCardId = null;
  }

  // ---------- WALKTHROUGH ----------
  function walkOrder() {
    // Group by suit, prioritize discuss/open within each suit.
    const order = [];
    Object.values(window.SUITS).forEach(s => {
      const inSuit = allCards().filter(c => c.suit === s.id);
      const priority = inSuit.filter(c => c.status !== "agreed");
      const rest     = inSuit.filter(c => c.status === "agreed");
      order.push(...priority, ...rest);
    });
    return order;
  }

  function renderWalk() {
    const order = walkOrder();
    const idx = Math.min(state.walkIndex, order.length - 1);
    const c = order[idx];
    if (!c) return;

    const wrap = document.getElementById("walk-card");
    const owner = primaryOwner(c);
    const ownerInfo = window.PEOPLE[owner];
    const t = mentalLoadSplit(c);
    const loadTotal = t.jess + t.mike + t.asher + t.open;
    const suit = window.SUITS[c.suit];

    wrap.innerHTML = `
      <div class="walk-card">
        <div class="title-row">
          <span class="icon-large">${c.icon}</span>
          <span class="owner-badge ${owner}">${ownerInfo.emoji} ${ownerInfo.name}</span>
        </div>
        <div class="breadcrumb">${suit.emoji} ${suit.name} · ${c.weeklyHours}h/wk</div>
        <h3>${escapeHTML(c.title)}</h3>
        <p class="desc">${escapeHTML(c.description)}</p>
        <div class="load-block">
          <span class="lbl">Mental load on this card</span>
          ${renderSplitBar({
            jess:  pct(t.jess,  loadTotal),
            mike:  pct(t.mike,  loadTotal),
            asher: pct(t.asher, loadTotal),
            open:  pct(t.open,  loadTotal)
          })}
        </div>
        ${c.discussionPrompt ? `
          <div class="discussion-block">
            <div class="lbl">To discuss together</div>
            ${escapeHTML(c.discussionPrompt)}
          </div>` : ""}
        <div style="margin-top: 1.25rem;">
          <button class="btn btn-secondary" id="walk-edit" type="button">Edit this card →</button>
        </div>
      </div>
    `;

    document.getElementById("walk-edit").addEventListener("click", () => openCard(c.id));

    document.getElementById("walk-progress-fill").style.width = `${((idx+1)/order.length)*100}%`;
    document.getElementById("walk-progress-text").textContent = `Card ${idx+1} of ${order.length} · ${suit.name}`;

    const prev = document.getElementById("walk-prev");
    const next = document.getElementById("walk-next");
    prev.disabled = idx === 0;
    next.textContent = idx === order.length - 1 ? "See where we landed →" : "Next card →";
  }

  function walkPrev() {
    state.walkIndex = Math.max(0, state.walkIndex - 1);
    saveState();
    renderWalk();
  }
  function walkNext() {
    const order = walkOrder();
    if (state.walkIndex >= order.length - 1) {
      state.walkIndex = 0;
      saveState();
      setView("dashboard");
      return;
    }
    state.walkIndex++;
    saveState();
    renderWalk();
  }

  // ---------- CHORES (per-person weekly list) ----------
  function getChoreNote(cardId, person) {
    const notes = state.weeklyChoreNotes || {};
    return (notes[cardId] && notes[cardId][person]) || "";
  }
  function setChoreNote(cardId, person, text) {
    const notes = Object.assign({}, state.weeklyChoreNotes || {});
    notes[cardId] = Object.assign({}, notes[cardId] || {});
    notes[cardId][person] = text;
    state.weeklyChoreNotes = notes;
    saveState();
  }

  // Returns CPE keys ("C","P","E") where this person has primary or split share.
  // Skips 20% leans (a "Mostly Mike" slot doesn't put it on Jess's chore list).
  function personSlotsOnCard(c, who) {
    return ["C","P","E"].filter(k => {
      const o = c.cpe[k];
      if (who === "jess")  return o === "jess"  || o === "mostly-jess" || o === "split" || o === "jess-asher";
      if (who === "mike")  return o === "mike"  || o === "mostly-mike" || o === "split" || o === "mike-asher";
      if (who === "asher") return o === "asher" || o === "jess-asher"  || o === "mike-asher";
      return false;
    });
  }
  function describeShare(o, who) {
    if (o === who) return "";
    if (o === "mostly-" + who) return "mostly you";
    if (o === "split") return who === "jess" ? "with Mike" : "with Jess";
    if (o === "jess-asher") return who === "jess" ? "with Asher" : "with Jess";
    if (o === "mike-asher") return who === "mike" ? "with Asher" : "with Mike";
    return "";
  }

  function renderChores() {
    const container = document.getElementById("chores-container");
    if (!container) return;
    const cards = allCards();
    const slotLabel = { C: "Notice", P: "Plan", E: "Do" };
    const people = [
      { id: "jess",  name: "Jess",  emoji: "🐧" },
      { id: "mike",  name: "Mike",  emoji: "🐱" },
      { id: "asher", name: "Asher", emoji: "⚾" }
    ];

    let html = "";
    people.forEach(person => {
      const myCards = cards
        .map(c => ({ c, slots: personSlotsOnCard(c, person.id) }))
        .filter(x => x.slots.length > 0)
        .sort((a, b) => (b.c.weeklyHours || 0) - (a.c.weeklyHours || 0));

      const cardsHtml = myCards.length === 0
        ? `<div class="chores-empty">No chores assigned to ${person.name}.</div>`
        : myCards.map(({ c, slots }) => {
            // Slot pills: "Notice", "Plan", "Do" — each annotated if it's a split or lean.
            const slotsHtml = slots.map(k => {
              const o = c.cpe[k];
              const share = describeShare(o, person.id);
              return `<span class="chore-slot">${slotLabel[k]}${share ? ` <small>${share}</small>` : ""}</span>`;
            }).join("");
            // "All three" shorthand
            const allThree = slots.length === 3 ? `<span class="chore-allthree">All three (Notice · Plan · Do)</span>` : "";
            const note = escapeHTML(getChoreNote(c.id, person.id));
            return `
              <div class="chore-card" data-card-id="${c.id}">
                <div class="chore-head">
                  <span class="chore-icon">${c.icon}</span>
                  <div class="chore-title-block">
                    <div class="chore-title">${escapeHTML(c.title)}</div>
                    <div class="chore-slots">${allThree || slotsHtml}</div>
                  </div>
                  <div class="chore-hours">${c.weeklyHours}h/wk</div>
                </div>
                <textarea class="chore-note" placeholder="What needs doing this week? (notes save automatically)" rows="2" data-card-id="${c.id}" data-person="${person.id}">${note}</textarea>
              </div>
            `;
          }).join("");

      html += `
        <section class="chores-section chores-${person.id}" data-person="${person.id}">
          <div class="chores-head">
            <h3>${person.emoji} ${person.name}'s chores this week</h3>
            <button class="btn btn-secondary btn-sm chores-print" data-person="${person.id}" type="button">🖨 Print ${person.name}'s list</button>
          </div>
          <div class="chores-list">${cardsHtml}</div>
        </section>
      `;
    });
    container.innerHTML = html;

    // Save notes as you type (debounced via input event + saveState debouncing).
    container.querySelectorAll(".chore-note").forEach(t => {
      t.addEventListener("input", e => {
        setChoreNote(e.target.dataset.cardId, e.target.dataset.person, e.target.value);
      });
    });

    // Print buttons: temporarily mark body so @media print can isolate one person.
    container.querySelectorAll(".chores-print").forEach(btn => {
      btn.addEventListener("click", e => {
        const person = e.currentTarget.dataset.person;
        document.body.classList.add("printing", "printing-" + person);
        const cleanup = () => {
          document.body.classList.remove("printing", "printing-jess", "printing-mike", "printing-asher");
          window.removeEventListener("afterprint", cleanup);
        };
        window.addEventListener("afterprint", cleanup);
        // Brief defer so the print stylesheet applies before the dialog opens.
        setTimeout(() => window.print(), 50);
      });
    });
  }

  // ---------- DASHBOARD ----------
  function renderDashboard() {
    const cards = allCards();
    const { time, load } = totals(cards);

    document.getElementById("dash-jess-hours").textContent  = time.jess.toFixed(1);
    document.getElementById("dash-mike-hours").textContent  = time.mike.toFixed(1);
    document.getElementById("dash-asher-hours").textContent = time.asher.toFixed(1);

    const tT = time.jess + time.mike + time.asher + time.open;
    document.getElementById("dash-time-bar").innerHTML = renderSplitBarInner({
      jess:  pct(time.jess,  tT),
      mike:  pct(time.mike,  tT),
      asher: pct(time.asher, tT),
      open:  pct(time.open,  tT)
    });
    const lT = load.jess + load.mike + load.asher + load.open;
    document.getElementById("dash-load-bar").innerHTML = renderSplitBarInner({
      jess:  pct(load.jess,  lT),
      mike:  pct(load.mike,  lT),
      asher: pct(load.asher, lT),
      open:  pct(load.open,  lT)
    });

    // Yearly numbers
    document.getElementById("dash-jess-year").textContent  = Math.round(time.jess  * 52).toLocaleString();
    document.getElementById("dash-mike-year").textContent  = Math.round(time.mike  * 52).toLocaleString();
    document.getElementById("dash-asher-year").textContent = Math.round(time.asher * 52).toLocaleString();

    // Coming up — next active trips (calendar lives in its own Coordinate tab now)
    renderUpcomingTrips();

    // Suits
    document.getElementById("dash-suits").innerHTML = renderSuitStack(cards);

    // Top 5 carried by each of us
    document.getElementById("dash-top-jess").innerHTML  = renderTopList(cards, "jess");
    document.getElementById("dash-top-mike").innerHTML  = renderTopList(cards, "mike");
    const asherList = document.getElementById("dash-top-asher");
    if (asherList) asherList.innerHTML = renderTopList(cards, "asher");

    // Status counts
    const counts = { agreed: 0, discuss: 0, open: 0 };
    cards.forEach(c => counts[c.status]++);
    document.getElementById("dash-agreed").textContent  = counts.agreed;
    document.getElementById("dash-discuss").textContent = counts.discuss;
    document.getElementById("dash-open").textContent    = counts.open;
  }

  // ---------- SHARING / EXPORT ----------
  function shareLink() {
    const payload = {
      cards: state.cards,
      customCards: state.customCards || [],
      trips: getTrips(),
      note: state.note,
      walkIndex: 0,
      lastSaved: state.lastSaved
    };
    const enc = encodeURIComponent(b64encode(JSON.stringify(payload)));
    const url = new URL(window.location.href);
    url.searchParams.set(SHARE_PARAM, enc);
    return url.toString();
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify({ cards: state.cards, customCards: state.customCards || [], trips: getTrips(), note: state.note }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fair-play-jess-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
  }

  function importJSON(text) {
    try {
      const data = JSON.parse(text);
      if (data.cards) state.cards = data.cards;
      if (Array.isArray(data.customCards)) state.customCards = data.customCards;
      if (Array.isArray(data.trips)) state.trips = data.trips;
      if (data.note)  state.note  = data.note;
      saveState();
      showToast("Plan loaded ✨");
      renderCover();
      if (activeView === "deck")      renderDeck();
      if (activeView === "trips")     renderTrips();
      if (activeView === "dashboard") renderDashboard();
    } catch (e) {
      showToast("Couldn't read that file");
    }
  }

  function resetAll() {
    if (!confirm("Reset all cards AND note to Mike's original pre-fill? Your discussion edits, any cards you've added, and any trip edits will be lost.")) return;
    state.cards = {};
    state.customCards = [];
    state.trips = null; // fall back to DEFAULT_TRIPS
    state.walkIndex = 0;
    state.note = DEFAULT_NOTE;
    saveState();
    renderCover();
    showToast("Reset to pre-fill");
    if (activeView === "deck")      renderDeck();
    if (activeView === "walk")      renderWalk();
    if (activeView === "trips")     renderTrips();
    if (activeView === "dashboard") renderDashboard();
  }

  // ---------- UTIL ----------
  function escapeHTML(s) {
    return String(s || "").replace(/[&<>"']/g, c =>
      ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  }

  let toastTimer = null;
  function showToast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  // ---------- WIRE UP ----------
  function init() {
    console.log("[Fair Play] init", { cards: window.CARDS.length });
    renderCover();

    // Top-nav tabs
    document.querySelectorAll(".nav-tabs button[data-view]").forEach(b => {
      b.addEventListener("click", () => setView(b.dataset.view));
    });

    // Brand → cover
    const brand = document.getElementById("brand-link");
    if (brand) brand.addEventListener("click", e => { e.preventDefault(); setView("cover"); });

    // Cover CTAs
    document.getElementById("cover-begin").addEventListener("click", () => setView("primer"));
    document.getElementById("edit-note-btn").addEventListener("click", openNoteEditor);
    document.getElementById("primer-continue").addEventListener("click", () => setView("dashboard"));
    const dashWalk = document.getElementById("dash-walk");
    if (dashWalk) dashWalk.addEventListener("click", () => {
      state.walkIndex = 0;
      saveState();
      setView("walk");
    });

    // Deck filters
    document.querySelectorAll("#deck-filters button").forEach(b => {
      b.addEventListener("click", () => {
        state.deckFilter = b.dataset.filter;
        saveState();
        renderDeck();
      });
    });

    // Add-card button (deck view)
    const addBtn = document.getElementById("add-card-btn");
    if (addBtn) addBtn.addEventListener("click", openAddCardModal);

    // Add-trip button (trips view)
    const addTripBtn = document.getElementById("add-trip-btn");
    if (addTripBtn) addTripBtn.addEventListener("click", () => openTripModal());
    const addEventBtn = document.getElementById("add-event-btn");
    if (addEventBtn) addEventBtn.addEventListener("click", () => openAddEventModal());
    const dashTripsLink = document.getElementById("dash-trips-link");
    if (dashTripsLink) dashTripsLink.addEventListener("click", e => { e.preventDefault(); setView("trips"); });

    // Walk
    document.getElementById("walk-prev").addEventListener("click", walkPrev);
    document.getElementById("walk-next").addEventListener("click", walkNext);

    // Meeting wizard
    const mPrev = document.getElementById("meeting-prev");
    const mNext = document.getElementById("meeting-next");
    if (mPrev) mPrev.addEventListener("click", meetingPrev);
    if (mNext) mNext.addEventListener("click", meetingNext);
    // Step pills are clickable shortcuts
    document.querySelectorAll(".step-pill").forEach(p => {
      p.addEventListener("click", () => {
        const n = parseInt(p.dataset.step, 10);
        if (n >= 1 && n <= 4) { setMeetingStep(n); renderMeeting(); }
      });
    });
    // Dashboard "Start meeting" button
    const dashMeeting = document.getElementById("dash-meeting-link");
    if (dashMeeting) dashMeeting.addEventListener("click", () => {
      setMeetingStep(1);
      setView("meeting");
    });

    // Modal close on backdrop
    document.getElementById("modal-backdrop").addEventListener("click", e => {
      if (e.target.id === "modal-backdrop") closeModal();
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") closeModal();
    });

    // Share / export / import / reset
    document.getElementById("reset-btn").addEventListener("click", resetAll);

    // Family code editor
    const fcInput = document.getElementById("family-code-input");
    const fcSave  = document.getElementById("family-code-save");
    if (fcInput && fcSave) {
      fcInput.value = getFamilyCode();
      fcSave.addEventListener("click", () => {
        const newCode = setFamilyCode(fcInput.value);
        fcInput.value = newCode;
        showToast(`Family code set: ${newCode}`);
        // Re-init Firestore subscription on the new code
        if (window.fpSync) window.fpSync.init(newCode, applyRemoteState);
      });
    }

    // Calendar feeds (.ics URLs)
    const icsJessIn = document.getElementById("ics-jess");
    const icsMikeIn = document.getElementById("ics-mike");
    const icsSave   = document.getElementById("ics-save");
    if (icsJessIn && icsMikeIn && icsSave) {
      const cur = getIcsUrls();
      icsJessIn.value = cur.jess;
      icsMikeIn.value = cur.mike;
      icsSave.addEventListener("click", async () => {
        setIcsUrls({ jess: icsJessIn.value, mike: icsMikeIn.value });
        showToast("Saved. Fetching events…");
        // Wipe stale cache from any previous failed proxy
        try { localStorage.removeItem(ICS_CACHE_KEY); } catch (e) {}
        await fetchAllCalendars(true);
        showToast("Calendar events loaded ✨");
        setView("coordinate"); // jump to where the events appear
      });
    }

    // Calendar filter keywords + strict-mode rules
    const calIncIn   = document.getElementById("cal-include");
    const calExcIn   = document.getElementById("cal-exclude");
    const calStrict  = document.getElementById("cal-strict");
    const calWeekend = document.getElementById("cal-weekends");
    const calAllDay  = document.getElementById("cal-allday");
    const calStart   = document.getElementById("cal-start");
    const calEnd     = document.getElementById("cal-end");
    const calPreset  = document.getElementById("cal-preset");
    const calFiltersSave = document.getElementById("cal-filters-save");

    if (calPreset) {
      calPreset.addEventListener("click", () => {
        if (calIncIn)   calIncIn.value   = "school, Asher, Glenwood, crushers, WC, Practice, Tournament, Boat, Zoo, field trip, drive, game, playdate, pick, dinner, parents, party, banquet, award, presentation day";
        if (calExcIn)   calExcIn.value   = "grade, prep, teams, MBA, UBP, Undergraduate, Business, Lead, class, meeting, due, deadline, draft, review, sync, recap, planning, strategy, faculty";
        if (calStrict)  calStrict.checked = true;
        if (calWeekend) calWeekend.checked = true;
        if (calAllDay)  calAllDay.checked = true;
        if (calStart)   calStart.value = 9;
        if (calEnd)     calEnd.value   = 16;
        showToast("Preset loaded — click Save filters to apply");
      });
    }
    if (calIncIn && calExcIn && calFiltersSave) {
      const f = getCalFilters();
      calIncIn.value   = f.include;
      calExcIn.value   = f.exclude;
      if (calStrict)  calStrict.checked  = !!f.strictMode;
      if (calWeekend) calWeekend.checked = !!f.showWeekends;
      if (calAllDay)  calAllDay.checked  = !!f.showAllDay;
      if (calStart)   calStart.value     = f.workStartHour;
      if (calEnd)     calEnd.value       = f.workEndHour;
      calFiltersSave.addEventListener("click", () => {
        setCalFilters({
          include: calIncIn.value,
          exclude: calExcIn.value,
          strictMode:    calStrict  ? calStrict.checked  : false,
          showWeekends:  calWeekend ? calWeekend.checked : true,
          showAllDay:    calAllDay  ? calAllDay.checked  : true,
          workStartHour: calStart   ? calStart.value     : 9,
          workEndHour:   calEnd     ? calEnd.value       : 16
        });
        showToast("Filters saved");
        setView("coordinate");
      });
    }

    // Sync — wait for Firebase module to publish window.fpSync
    function startSync() {
      if (!window.fpSync) return;
      const pill = document.getElementById("sync-pill");
      const txt  = pill ? pill.querySelector(".sync-text") : null;
      window.fpSync.onStatus(s => {
        if (!pill) return;
        pill.className = "sync-pill " + s;
        const labels = { init: "starting", connecting: "connecting", online: "live", offline: "offline", error: "sync error" };
        if (txt) txt.textContent = labels[s] || s;
      });
      window.fpSync.init(getFamilyCode(), applyRemoteState);
    }
    if (window.fpSync) startSync();
    else window.addEventListener("fp-sync-ready", startSync);

    // Default view
    setView("cover");
  }

  function safeInit() {
    try { init(); }
    catch (e) {
      console.error("[Fair Play] init failed", e);
      showToast("Something broke loading the app — check the console.");
    }
  }

  // Run immediately if DOM is already ready (e.g. script loaded after parse).
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", safeInit);
  } else {
    safeInit();
  }
})();
