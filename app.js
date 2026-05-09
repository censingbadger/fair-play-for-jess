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
    note: DEFAULT_NOTE,
    walkIndex: 0,
    deckFilter: "all",  // all | discuss | open | jess | mike | split
    lastSaved: null
  };

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
        window.fpSync.push(state, getFamilyCode());
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
      if (typeof remote.note === "string" && remote.note.length > 0) {
        state.note = remote.note;
      }
      // Persist to local storage so refreshes keep the synced view
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
      // Re-render whatever's visible
      renderCover();
      if (activeView === "deck")      renderDeck();
      if (activeView === "walk")      renderWalk();
      if (activeView === "dashboard") renderDashboard();
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

  // ---------- COMPUTE ----------
  function timeSplit(card) {
    // Returns { jess, mike, open } — hours per week, fractional.
    const h = card.weeklyHours || 0;
    const out = { jess: 0, mike: 0, open: 0 };
    ["C", "P", "E"].forEach(k => {
      const owner = card.cpe[k];
      const share = (h / 3); // simple: each CPE leg owns 1/3 of execution time
      if (owner === "jess") out.jess += share;
      else if (owner === "mike") out.mike += share;
      else if (owner === "split") { out.jess += share / 2; out.mike += share / 2; }
      else out.open += share;
    });
    return out;
  }

  function mentalLoadSplit(card) {
    // Returns { jess, mike, open } — weighted units. Sum across cards is meaningful.
    const W = window.WEIGHTS;
    const out = { jess: 0, mike: 0, open: 0 };
    [["C", W.C], ["P", W.P], ["E", W.E]].forEach(([k, w]) => {
      const owner = card.cpe[k];
      if (owner === "jess") out.jess += w;
      else if (owner === "mike") out.mike += w;
      else if (owner === "split") { out.jess += w / 2; out.mike += w / 2; }
      else out.open += w;
    });
    return out;
  }

  function totals(cards) {
    const time = { jess: 0, mike: 0, open: 0 };
    const load = { jess: 0, mike: 0, open: 0 };
    cards.forEach(c => {
      const t = timeSplit(c);
      time.jess += t.jess; time.mike += t.mike; time.open += t.open;
      const l = mentalLoadSplit(c);
      load.jess += l.jess; load.mike += l.mike; load.open += l.open;
    });
    return { time, load };
  }

  function pct(part, whole) {
    if (whole <= 0) return 0;
    return Math.round((part / whole) * 100);
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
    if (name === "dashboard") renderDashboard();
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
  function renderSplitBarInner({ jess, mike, split, open }) {
    split = split || 0;
    open = open || 0;
    const segs = [];
    if (jess  > 0) segs.push(`<div class="seg jess"  style="width:${jess}%">${jess  > 8 ? jess  + "%" : ""}</div>`);
    if (mike  > 0) segs.push(`<div class="seg mike"  style="width:${mike}%">${mike  > 8 ? mike  + "%" : ""}</div>`);
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
      const sum = t.load.jess + t.load.mike + t.load.open;
      const totalHours = (t.time.jess + t.time.mike + t.time.open).toFixed(1);
      html += `
        <div class="suit-row">
          <div class="label"><span class="emoji">${suit.emoji}</span>${suit.name}</div>
          <div class="split-bar">${renderSplitBarInner({
            jess: pct(t.load.jess, sum),
            mike: pct(t.load.mike, sum),
            open: pct(t.load.open, sum)
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
    if (filter === "jess")    return primaryOwner(c) === "jess";
    if (filter === "mike")    return primaryOwner(c) === "mike";
    if (filter === "split")   return primaryOwner(c) === "split";
    return true;
  }

  function primaryOwner(c) {
    // Returns the dominant owner across CPE for badge purposes.
    const counts = { jess: 0, mike: 0, split: 0, open: 0 };
    ["C","P","E"].forEach(k => { counts[c.cpe[k]] = (counts[c.cpe[k]] || 0) + 1; });
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
                <option value="jess"  ${c.cpe[k]==="jess"?"selected":""}>🐧 Jess</option>
                <option value="mike"  ${c.cpe[k]==="mike"?"selected":""}>🐱 Mike</option>
                <option value="split" ${c.cpe[k]==="split"?"selected":""}>🤝 Split</option>
                <option value="open"  ${c.cpe[k]==="open"?"selected":""}>❓ Open</option>
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
                <option value="mike">🐱 Mike</option>
                <option value="split">🤝 Split</option>
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
    const loadTotal = t.jess + t.mike + t.open;
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
            jess: pct(t.jess, loadTotal),
            mike: pct(t.mike, loadTotal),
            open: pct(t.open, loadTotal)
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

  // ---------- DASHBOARD ----------
  function renderDashboard() {
    const cards = allCards();
    const { time, load } = totals(cards);

    document.getElementById("dash-jess-hours").textContent = time.jess.toFixed(1);
    document.getElementById("dash-mike-hours").textContent = time.mike.toFixed(1);

    const tT = time.jess + time.mike + time.open;
    document.getElementById("dash-time-bar").innerHTML = renderSplitBarInner({
      jess: pct(time.jess, tT), mike: pct(time.mike, tT), open: pct(time.open, tT)
    });
    const lT = load.jess + load.mike + load.open;
    document.getElementById("dash-load-bar").innerHTML = renderSplitBarInner({
      jess: pct(load.jess, lT), mike: pct(load.mike, lT), open: pct(load.open, lT)
    });

    // Yearly numbers
    document.getElementById("dash-jess-year").textContent = Math.round(time.jess * 52).toLocaleString();
    document.getElementById("dash-mike-year").textContent = Math.round(time.mike * 52).toLocaleString();

    // Suits
    document.getElementById("dash-suits").innerHTML = renderSuitStack(cards);

    // Top 5 carried by each of us
    document.getElementById("dash-top-jess").innerHTML = renderTopList(cards, "jess");
    document.getElementById("dash-top-mike").innerHTML = renderTopList(cards, "mike");

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
    const blob = new Blob([JSON.stringify({ cards: state.cards, customCards: state.customCards || [], note: state.note }, null, 2)], { type: "application/json" });
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
      if (data.note)  state.note  = data.note;
      saveState();
      showToast("Plan loaded ✨");
      renderCover();
      if (activeView === "deck")      renderDeck();
      if (activeView === "dashboard") renderDashboard();
    } catch (e) {
      showToast("Couldn't read that file");
    }
  }

  function resetAll() {
    if (!confirm("Reset all cards AND note to Mike's original pre-fill? Your discussion edits and any cards you've added will be lost.")) return;
    state.cards = {};
    state.customCards = [];
    state.walkIndex = 0;
    state.note = DEFAULT_NOTE;
    saveState();
    renderCover();
    showToast("Reset to pre-fill");
    if (activeView === "deck")      renderDeck();
    if (activeView === "walk")      renderWalk();
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

    // Walk
    document.getElementById("walk-prev").addEventListener("click", walkPrev);
    document.getElementById("walk-next").addEventListener("click", walkNext);

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
