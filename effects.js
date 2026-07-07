/* =========================================================
   VISUAL EFFECTS ONLY — no game logic, no state, no scoring.
   Purely decorates the DOM that script.js already produces,
   and reads (never writes) localStorage to drive which
   full-screen "phase" is visible.
   ========================================================= */
(function () {
  "use strict";

  var STORAGE_KEY = "trumpGameState_v1";

  var PALETTE = ["#d4af37", "#2e6f9e", "#b4384c", "#3f8f63", "#a06bd6", "#e08a3c", "#58a3d6", "#c9954a"];

  function colorForName(name) {
    var str = (name || "?").trim();
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    var idx = Math.abs(hash) % PALETTE.length;
    return PALETTE[idx];
  }

  function makeAvatar(name, size) {
    var span = document.createElement("span");
    span.className = "avatar-badge" + (size === "lg" ? " lg" : "");
    var color = colorForName(name);
    span.style.background = "linear-gradient(135deg," + color + ",#000)";
    span.style.color = color;
    var initial = (name || "?").trim().charAt(0).toUpperCase() || "?";
    var textNode = document.createElement("span");
    textNode.style.color = "#fff";
    textNode.textContent = initial;
    span.appendChild(textNode);
    return span;
  }

  /* ---------- 1. Avatars on player seat cards ---------- */
  function decoratePlayerTags() {
    var tags = document.querySelectorAll("#playerList .player-tag");
    tags.forEach(function (tag) {
      var nameSpan = tag.querySelector("span");
      if (!nameSpan || nameSpan.dataset.avatarDone) return;
      var name = nameSpan.textContent;
      nameSpan.prepend(makeAvatar(name, "sm"));
      nameSpan.dataset.avatarDone = "1";
    });
  }

  /* ---------- 2. Hero "turn banner" above active-set content ----------
     IMPORTANT: must be idempotent. The app is re-decorated via a
     MutationObserver watching document.body, so if this mutated the
     DOM on every call (even when nothing changed) it would retrigger
     the observer and loop forever, freezing the tab. We only touch
     the DOM when the target player actually differs from what's
     already rendered. */
  function decorateTurnBanner() {
    var area = document.getElementById("activeSetArea");
    if (!area) return;
    var strongs = area.querySelectorAll("strong");
    var playerName = null;
    strongs.forEach(function (s) {
      if (s.textContent.indexOf("Current player") !== -1) {
        var parent = s.parentElement;
        if (parent) {
          var txt = parent.textContent.replace("Current player:", "").trim();
          if (txt) playerName = txt;
        }
      }
    });

    var existing = area.querySelector(".turn-banner");
    var existingName = existing ? existing.dataset.playerName : null;

    if (existingName === (playerName || null)) {
      return; // already correct — do nothing, don't feed the observer
    }

    if (existing) existing.remove();
    if (playerName) {
      var banner = document.createElement("div");
      banner.className = "turn-banner";
      banner.dataset.playerName = playerName;
      banner.appendChild(makeAvatar(playerName, "lg"));
      var textWrap = document.createElement("div");
      textWrap.innerHTML =
        '<span class="turn-label"><i class="fa-solid fa-bullseye"></i> Current Turn</span>' +
        '<span class="turn-name">' + escapeHtml(playerName) + "</span>";
      banner.appendChild(textWrap);
      area.prepend(banner);
    }
  }

  function escapeHtml(str) {
    var d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  /* ---------- 3. Lock icon on forbidden / disabled winner buttons ---------- */
  function decorateLockButtons() {
    document.querySelectorAll(".winner-btn[disabled][data-guess-value]").forEach(function (btn) {
      if (btn.dataset.lockDone) return;
      btn.dataset.lockDone = "1";
      btn.title = "Forbidden — would tie the card count";
      var icon = document.createElement("i");
      icon.className = "fa-solid fa-lock lock-icon";
      btn.appendChild(document.createElement("br"));
      btn.appendChild(icon);
    });
  }

  /* ---------- 4. Ripple effect on any button press ---------- */
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("button");
    if (!btn) return;
    var rect = btn.getBoundingClientRect();
    var ripple = document.createElement("span");
    var size = Math.max(rect.width, rect.height);
    ripple.className = "ripple";
    ripple.style.width = ripple.style.height = size + "px";
    ripple.style.left = (e.clientX - rect.left - size / 2) + "px";
    ripple.style.top = (e.clientY - rect.top - size / 2) + "px";
    btn.appendChild(ripple);
    setTimeout(function () { ripple.remove(); }, 650);
  }, true);

  /* ---------- 5. Confetti burst when the modal opens with a celebration message ---------- */
  var confettiColors = ["#d4af37", "#f3dd8d", "#2e6f9e", "#b4384c", "#3f8f63", "#f4ecd8"];

  function burstConfetti(container) {
    for (var i = 0; i < 60; i++) {
      var piece = document.createElement("span");
      piece.className = "confetti-piece";
      piece.style.left = Math.random() * 100 + "%";
      piece.style.background = confettiColors[i % confettiColors.length];
      piece.style.animationDuration = (1.4 + Math.random() * 1.2) + "s";
      piece.style.animationDelay = (Math.random() * 0.3) + "s";
      piece.style.transform = "rotate(" + Math.floor(Math.random() * 360) + "deg)";
      container.appendChild(piece);
      (function (p) {
        setTimeout(function () { p.remove(); }, 3200);
      })(piece);
    }
  }

  function watchModal() {
    var modal = document.getElementById("popupModal");
    var textEl = document.getElementById("popupText");
    if (!modal || !textEl) return;
    var observer = new MutationObserver(function () {
      var isOpen = !modal.classList.contains("hidden");
      if (isOpen && textEl.textContent.indexOf("🎉") !== -1) {
        burstConfetti(modal);
      }
    });
    observer.observe(modal, { attributes: true, attributeFilter: ["class"] });
  }

  /* ---------- 6. Phase screen toggling ----------
     Reads (never writes) the same localStorage key script.js
     already maintains, purely to decide which full-screen
     "scene" (.screen-lobby vs .screen-game) is visible, and
     to keep the HUD chip label in sync. Game logic itself is
     untouched — script.js renders into #activeSetArea /
     #playerList / etc. regardless of which scene is showing. */
  function currentPhase() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return "lobby";
      var parsed = JSON.parse(raw);
      return parsed && parsed.currentSet ? "playing" : "lobby";
    } catch (e) {
      return "lobby";
    }
  }

  function syncPhase() {
    var phase = currentPhase();
    if (document.body.dataset.phase !== phase) {
      document.body.dataset.phase = phase;
    }
    var label = document.getElementById("hudPhaseText");
    var labelText = phase === "playing" ? "In Play" : "Lobby";
    // guard: only write if the text actually differs, otherwise a
    // same-value textContent write still creates a mutation record
    // and can retrigger the observer that calls this function.
    if (label && label.textContent !== labelText) {
      label.textContent = labelText;
    }
  }

  /* ---------- 7. STANDINGS accordion toggle ----------
     The visible control is the STANDINGS header button; it simply
     forwards a click to the original (now hidden) #showRankingBtn
     so script.js's own toggle/render/popup logic runs completely
     unchanged. The open/close animation itself is pure CSS, keyed
     off the .blurred class script.js already adds and removes. */
  function wireStandingsToggle() {
    var toggle = document.getElementById("standingsToggle");
    var realBtn = document.getElementById("showRankingBtn");
    var rankingArea = document.getElementById("rankingArea");
    if (!toggle || !realBtn || toggle.dataset.wired) return;
    toggle.dataset.wired = "1";
    toggle.addEventListener("click", function () {
      realBtn.click();
      var expanded = rankingArea && !rankingArea.classList.contains("blurred");
      toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
      if (expanded) animateCountUps(document.querySelector(".leaderboard-drawer"));
    });
  }

  /* ---------- 8. Count-up animation for point totals ----------
     Only ever called right after the user opens the standings (a
     single user-initiated event), never from the mutation-driven
     runAll(), so there is no risk of it looping. Each element's
     running animation frame is tracked so re-triggering cancels the
     previous one cleanly instead of stacking timers. */
  var countUpFrames = new WeakMap();
  function animateCountUps(root) {
    if (!root) return;
    var targets = root.querySelectorAll(".podium-box .score, table td:last-child");
    targets.forEach(function (el) {
      var match = el.textContent.match(/-?\d+/);
      if (!match) return;
      var target = parseInt(match[0], 10);
      var prefix = el.textContent.slice(0, match.index);
      var suffix = el.textContent.slice(match.index + match[0].length);

      var existingFrame = countUpFrames.get(el);
      if (existingFrame) cancelAnimationFrame(existingFrame);

      var start = null;
      var duration = 600;
      function step(ts) {
        if (!start) start = ts;
        var progress = Math.min(1, (ts - start) / duration);
        var eased = 1 - Math.pow(1 - progress, 3);
        var value = Math.round(target * eased);
        el.textContent = prefix + value + suffix;
        if (progress < 1) {
          countUpFrames.set(el, requestAnimationFrame(step));
        } else {
          countUpFrames.delete(el);
        }
      }
      el.textContent = prefix + "0" + suffix;
      countUpFrames.set(el, requestAnimationFrame(step));
    });
  }

  /* ---------- 9. Modal close button + ESC + click-outside ----------
     Closing never touches game state — it just hides the modal,
     exactly like clicking OK, but without invoking any callback. */
  function wireModalDismiss() {
    var modal = document.getElementById("popupModal");
    var closeBtn = document.getElementById("modalCloseBtn");
    if (!modal || closeBtn.dataset.wired) return;
    closeBtn.dataset.wired = "1";
    closeBtn.addEventListener("click", function () {
      modal.classList.add("hidden");
    });
    modal.addEventListener("click", function (e) {
      if (e.target === modal) modal.classList.add("hidden");
    });
  }

  /* ---------- 10. Deck shuffle flourish ----------
     Purely cosmetic: briefly disables pointer-events on the deal-size
     cards while a shuffle animation plays, then lets them settle into
     place. Idempotent via a dataset flag so it only plays once per
     time the chooser is populated, and resets when it's cleared. */
  function decorateDeckShuffle() {
    var chooser = document.getElementById("setSizeChooser");
    if (!chooser) return;
    var hasCards = chooser.querySelector("[data-set-size]");
    if (!hasCards) {
      if (chooser.dataset.shuffleDone) delete chooser.dataset.shuffleDone;
      return;
    }
    if (chooser.dataset.shuffleDone) return;
    chooser.dataset.shuffleDone = "1";
    chooser.classList.add("deck-shuffling");
    setTimeout(function () {
      chooser.classList.remove("deck-shuffling");
    }, 700);
  }

  /* ---------- 11. Ledger side drawer ----------
     Purely presentational: slides the #ledgerDrawer element in from
     the right when the vertical "Ledger" tab is clicked. Never reads
     or writes game state — script.js's renderScoreboard() keeps
     populating #scoreboardArea (which now simply lives inside this
     drawer instead of the old always-visible panel) exactly as
     before. State is tracked with a single body dataset flag so it's
     trivial to query from CSS and from the ESC/backdrop handlers. */
  function isLedgerOpen() {
    return document.body.dataset.ledgerOpen === "true";
  }

  function openLedgerDrawer() {
    document.body.dataset.ledgerOpen = "true";
    var tab = document.getElementById("ledgerTabBtn");
    if (tab) tab.setAttribute("aria-expanded", "true");
    var drawer = document.getElementById("ledgerDrawer");
    if (drawer) drawer.setAttribute("aria-hidden", "false");
  }

  function closeLedgerDrawer() {
    document.body.dataset.ledgerOpen = "false";
    var tab = document.getElementById("ledgerTabBtn");
    if (tab) tab.setAttribute("aria-expanded", "false");
    var drawer = document.getElementById("ledgerDrawer");
    if (drawer) drawer.setAttribute("aria-hidden", "true");
  }

  function wireLedgerDrawer() {
    var tab = document.getElementById("ledgerTabBtn");
    var closeBtn = document.getElementById("ledgerDrawerClose");
    var backdrop = document.getElementById("ledgerDrawerBackdrop");
    if (!tab || tab.dataset.wired) return;
    tab.dataset.wired = "1";

    tab.addEventListener("click", function () {
      if (isLedgerOpen()) {
        closeLedgerDrawer();
      } else {
        openLedgerDrawer();
      }
    });

    if (closeBtn && !closeBtn.dataset.wired) {
      closeBtn.dataset.wired = "1";
      closeBtn.addEventListener("click", closeLedgerDrawer);
    }
    if (backdrop && !backdrop.dataset.wired) {
      backdrop.dataset.wired = "1";
      backdrop.addEventListener("click", closeLedgerDrawer);
    }
  }

  /* ---------- 12. Keyboard support ---------- */
  function wireKeyboardSupport() {
    var playerNameInput = document.getElementById("playerName");
    if (playerNameInput && !playerNameInput.dataset.enterWired) {
      playerNameInput.dataset.enterWired = "1";
      playerNameInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          var btn = document.getElementById("addPlayerBtn");
          if (btn) btn.click();
        }
      });
    }

    if (window.__trumpTableKeysWired) return;
    window.__trumpTableKeysWired = true;

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (isLedgerOpen()) {
          closeLedgerDrawer();
          return;
        }
        var modal = document.getElementById("popupModal");
        if (modal && !modal.classList.contains("hidden")) {
          modal.classList.add("hidden");
          return;
        }
        var chooser = document.getElementById("setSizeChooser");
        if (chooser && chooser.querySelector("[data-set-size]")) {
          chooser.innerHTML = ""; // dismiss the deck overlay only — no game state touched
          return;
        }
        var victoryScreen = document.getElementById("victoryScreen");
        if (victoryScreen && !victoryScreen.classList.contains("hidden")) {
          closeVictoryScreen();
        }
        return;
      }

      // Arrow-key navigation across the fanned deal-size cards
      if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && document.activeElement && document.activeElement.hasAttribute("data-set-size")) {
        var cards = Array.prototype.slice.call(document.querySelectorAll("[data-set-size]"));
        var idx = cards.indexOf(document.activeElement);
        if (idx === -1) return;
        var nextIdx = e.key === "ArrowRight" ? Math.min(cards.length - 1, idx + 1) : Math.max(0, idx - 1);
        cards[nextIdx].focus();
        e.preventDefault();
      }
    });

    // click on the deck-chooser backdrop (not on a card) dismisses it
    document.addEventListener("click", function (e) {
      var chooser = document.getElementById("setSizeChooser");
      if (chooser && chooser.querySelector("[data-set-size]") && e.target === chooser) {
        chooser.innerHTML = "";
      }
    });
  }

  /* ---------- 13. Victory / Statistics screen ----------
     Reads the same localStorage state script.js maintains — never
     writes to it. Everything here is derived, display-only data. */
  var STORAGE_KEY_2 = "trumpGameState_v1";

  function readGameState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY_2);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function computeStats(state) {
    var players = state.players || [];
    var sets = state.sets || [];
    var totals = {}, winsTotal = {}, exactCount = {}, guessOpportunities = {};

    players.forEach(function (p) {
      var sum = 0, wins = 0, exact = 0, opportunities = 0;
      sets.forEach(function (s, index) {
        var setIndex = s.setNumber - 1;
        if (setIndex < p.joinedAtSet) return;
        if (typeof s.points[p.id] === "number") sum += s.points[p.id];
        if (typeof s.wins[p.id] === "number") wins += s.wins[p.id];
        if (typeof s.guesses[p.id] === "number") {
          opportunities += 1;
          if ((s.wins[p.id] || 0) === s.guesses[p.id]) exact += 1;
        }
      });
      totals[p.id] = sum;
      winsTotal[p.id] = wins;
      exactCount[p.id] = exact;
      guessOpportunities[p.id] = opportunities;
    });

    var sortedByTotal = players.slice().sort(function (a, b) { return (totals[b.id] || 0) - (totals[a.id] || 0); });
    var champion = sortedByTotal[0] || null;
    var worstLuck = players.slice().sort(function (a, b) { return (totals[a.id] || 0) - (totals[b.id] || 0); })[0] || null;
    var mostWins = players.slice().sort(function (a, b) { return (winsTotal[b.id] || 0) - (winsTotal[a.id] || 0); })[0] || null;
    var mostAccurate = players.slice().sort(function (a, b) { return (exactCount[b.id] || 0) - (exactCount[a.id] || 0); })[0] || null;

    var totalExact = 0, totalOpportunities = 0;
    players.forEach(function (p) {
      totalExact += exactCount[p.id] || 0;
      totalOpportunities += guessOpportunities[p.id] || 0;
    });
    var exactPct = totalOpportunities ? Math.round((totalExact / totalOpportunities) * 100) : 0;
    var totalRounds = sets.reduce(function (sum, s) { return sum + (s.cards || 0); }, 0);

    return {
      players: players, sets: sets, totals: totals, winsTotal: winsTotal, exactCount: exactCount,
      champion: champion, worstLuck: worstLuck, mostWins: mostWins, mostAccurate: mostAccurate,
      exactPct: exactPct, totalRounds: totalRounds
    };
  }

  var fireworkColors = ["#d4af37", "#2e6f9e", "#b4384c", "#3f8f63"];
  function burstFireworks(container) {
    for (var i = 0; i < 6; i++) {
      (function () {
        var fw = document.createElement("div");
        fw.className = "firework";
        fw.style.left = (10 + Math.random() * 80) + "%";
        fw.style.top = (10 + Math.random() * 50) + "%";
        fw.style.color = fireworkColors[Math.floor(Math.random() * fireworkColors.length)];
        fw.style.animationDelay = (Math.random() * 0.6) + "s";
        container.appendChild(fw);
        setTimeout(function () { fw.remove(); }, 1800);
      })();
    }
  }

  function closeVictoryScreen() {
    var el = document.getElementById("victoryScreen");
    if (!el) return;
    el.classList.add("hidden");
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = "";
  }

  function openVictoryScreen() {
    var state = readGameState();
    var el = document.getElementById("victoryScreen");
    if (!el) return;

    if (!state || !state.sets || !state.sets.length || !state.players || !state.players.length) {
      el.innerHTML =
        '<button class="victory-close" id="victoryCloseBtn">✕</button>' +
        '<div class="victory-eyebrow"><i class="fa-solid fa-trophy"></i> Results</div>' +
        '<div class="victory-champion-name" style="font-size:26px;">No results yet</div>' +
        '<div class="victory-champion-score">Play at least one full set to see the champion and statistics.</div>' +
        '<div class="victory-actions"><button class="felt-btn gold-felt" id="victoryPlayAgainBtn"><i class="fa-solid fa-play"></i> Back to the table</button></div>';
    } else {
      var stats = computeStats(state);
      var c = stats.champion;
      var championTotal = c ? (stats.totals[c.id] || 0) : 0;

      function statCard(icon, label, value) {
        return '<div class="victory-stat-card"><div class="victory-stat-icon"><i class="fa-solid ' + icon + '"></i></div>' +
          '<div class="victory-stat-label">' + label + '</div><div class="victory-stat-value">' + value + '</div></div>';
      }

      el.innerHTML =
        '<button class="victory-close" id="victoryCloseBtn">✕</button>' +
        '<div class="victory-eyebrow"><i class="fa-solid fa-crown"></i> Champion</div>' +
        '<div class="victory-champion-name">' + escapeHtml(c ? c.name : "-") + '</div>' +
        '<div class="victory-champion-score">' + championTotal + ' points across ' + stats.sets.length + ' set' + (stats.sets.length === 1 ? "" : "s") + '</div>' +
        '<div class="victory-stats-grid">' +
          statCard("fa-bullseye", "Most Accurate", stats.mostAccurate ? escapeHtml(stats.mostAccurate.name) : "-") +
          statCard("fa-fire", "Most Wins", stats.mostWins ? escapeHtml(stats.mostWins.name) + " (" + (stats.winsTotal[stats.mostWins.id] || 0) + ")" : "-") +
          statCard("fa-star", "Highest Score", championTotal + " pts") +
          statCard("fa-skull", "Worst Luck", stats.worstLuck ? escapeHtml(stats.worstLuck.name) : "-") +
          statCard("fa-dice", "Exact Guess Rate", stats.exactPct + "%") +
          statCard("fa-layer-group", "Sets Played", stats.sets.length) +
          statCard("fa-clone", "Rounds Played", stats.totalRounds) +
        '</div>' +
        '<div class="victory-actions">' +
          '<button class="felt-btn gold-felt" id="victoryPlayAgainBtn"><i class="fa-solid fa-play"></i> Play Again</button>' +
          '<button class="felt-btn danger-felt" id="victoryNewGameBtn"><i class="fa-solid fa-rotate-left"></i> New Game</button>' +
        '</div>';

      burstConfetti(el);
      burstFireworks(el);
      animateCountUps(el);
    }

    el.classList.remove("hidden");
    el.setAttribute("aria-hidden", "false");

    var closeBtn = document.getElementById("victoryCloseBtn");
    if (closeBtn) closeBtn.addEventListener("click", closeVictoryScreen);
    var playAgainBtn = document.getElementById("victoryPlayAgainBtn");
    if (playAgainBtn) playAgainBtn.addEventListener("click", closeVictoryScreen);
    var newGameBtnInVictory = document.getElementById("victoryNewGameBtn");
    if (newGameBtnInVictory) {
      newGameBtnInVictory.addEventListener("click", function () {
        var realNewGameBtn = document.getElementById("newGameBtn");
        if (realNewGameBtn) realNewGameBtn.click();
        closeVictoryScreen();
      });
    }
  }

  function wireVictoryScreen() {
    var trigger = document.getElementById("viewResultsBtn");
    if (!trigger || trigger.dataset.wired) return;
    trigger.dataset.wired = "1";
    trigger.addEventListener("click", openVictoryScreen);
  }

  /* ---------- Observe the whole app and re-run decorations ---------- */
  function runAll() {
    decoratePlayerTags();
    decorateTurnBanner();
    decorateLockButtons();
    decorateDeckShuffle();
    syncPhase();
    wireStandingsToggle();
    wireLedgerDrawer();
    wireModalDismiss();
    wireVictoryScreen();
  }

  document.addEventListener("DOMContentLoaded", function () {
    runAll();
    watchModal();
    wireKeyboardSupport();

    var appRoot = document.body;
    var mo = new MutationObserver(function () {
      runAll();
    });
    mo.observe(appRoot, { childList: true, subtree: true, characterData: true });
  });
})();