(function() {
  const STORAGE_KEY = "trumpGameState_v1";

  let gameState = {
    players: [],           // {id, name, joinedAtSet}
    sets: [],              // completed sets
    currentSet: null,      // active set data
    nextPlayerId: 1
  };

  const $ = (id) => document.getElementById(id);

  const playerNameInput = $("playerName");
  const addPlayerBtn = $("addPlayerBtn");
  const playerListDiv = $("playerList");

  const addSetBtn = $("addSetBtn");
  const currentSetInfoDiv = $("currentSetInfo");
  const activeSetArea = $("activeSetArea");
  const newGameBtn = $("newGameBtn");

  const scoreboardArea = $("scoreboardArea");
  const rankingArea = $("rankingArea");
  const showRankingBtn = $("showRankingBtn");
  let rankingHidden = true;  // start blurred

function applyRankingBlur() {
  if (!rankingArea) return;
  if (rankingHidden) {
    rankingArea.classList.add("blurred");
  } else {
    rankingArea.classList.remove("blurred");
  }
}

function startNewSet(cards) {
  const setIndex = gameState.sets.length;
  const totalPlayers = gameState.players.length;
  const defaultStartIndex = setIndex % totalPlayers;
  const defaultStartPlayerId = gameState.players[defaultStartIndex].id;

  gameState.currentSet = {
    setNumber: setIndex + 1,
    cards,
    startingPlayerId: defaultStartPlayerId,
    guessOrder: [],
    guesses: {},
    wins: {},
    points: {},
    stage: "chooseStart",
    guessIndex: 0,
    currentRound: 1
  };

  // clear chooser after selection
  const chooser = document.getElementById("setSizeChooser");
  if (chooser) chooser.innerHTML = "";

  saveState();
  renderCurrentSetInfo();
  renderActiveSet();
}
    newGameBtn.addEventListener("click", () => {
  if (!confirm("Are you sure? This will clear the entire game!")) return;

  localStorage.removeItem(STORAGE_KEY);

  gameState = {
    players: [],
    sets: [],
    currentSet: null,
    nextPlayerId: 1
  };

  saveState();
  renderPlayers();
  renderCurrentSetInfo();
  renderActiveSet();
  renderScoreboard();
  renderRanking();
});



  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object") {
          gameState = parsed;
        }
      }
    } catch (e) {
      console.warn("Failed to load state:", e);
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState));
    } catch (e) {
      console.warn("Failed to save state:", e);
    }
  }

  function renderPlayers() {
    if (!gameState.players.length) {
      playerListDiv.innerHTML = "<span class='info'>No players yet. Add some!</span>";
      return;
    }

    const html = gameState.players.map(p => `
      <div class="player-tag">
        <span>${p.name}</span>
        <button class="small-btn danger" data-del-player="${p.id}">x</button>
      </div>
    `).join("");

    playerListDiv.innerHTML = html;

    const canDelete = !gameState.currentSet;
    playerListDiv.querySelectorAll("[data-del-player]").forEach(btn => {
      btn.disabled = !canDelete;
      btn.addEventListener("click", () => {
        if (!canDelete) return;
        const id = parseInt(btn.getAttribute("data-del-player"), 10);
        deletePlayer(id);
      });
    });
  }

  function deletePlayer(id) {
    gameState.players = gameState.players.filter(p => p.id !== id);
    saveState();
    renderPlayers();
    renderScoreboard();
    renderRanking();
  }

  addPlayerBtn.addEventListener("click", () => {
    const name = playerNameInput.value.trim();
    if (!name) {
      alert("Enter a player name.");
      return;
    }
    if (gameState.currentSet) {
      alert("You can only add players between sets, not during an active set.");
      return;
    }
    const newPlayer = {
      id: gameState.nextPlayerId++,
      name,
      joinedAtSet: gameState.sets.length
    };
    gameState.players.push(newPlayer);
    playerNameInput.value = "";
    saveState();
    renderPlayers();
    renderScoreboard();
    renderRanking();
  });

  addSetBtn.addEventListener("click", () => {
  if (!gameState.players.length) {
    alert("Add at least one player before starting a set.");
    return;
  }
  if (gameState.currentSet) {
    alert("A set is already in progress.");
    return;
  }

  const chooser = document.getElementById("setSizeChooser");
  if (!chooser) return;

  // you can change this array if you want different card counts
  const sizes = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

  let html = `<div class="info">Select number of cards (rounds) for this set:</div><div class="flex" style="margin-top:4px;">`;
  sizes.forEach(n => {
    html += `<button class="small-btn" data-set-size="${n}">${n}</button>`;
  });
  html += `</div>`;

  chooser.innerHTML = html;

  chooser.querySelectorAll("[data-set-size]").forEach(btn => {
    btn.addEventListener("click", () => {
      const n = parseInt(btn.getAttribute("data-set-size"), 10);
      if (!n || n <= 0) return;
      startNewSet(n);
    });
  });
});

  function renderCurrentSetInfo() {
    if (!gameState.currentSet) {
      currentSetInfoDiv.innerHTML = "<span class='info'>No active set.</span>";
      addPlayerBtn.disabled = false;
      return;
    }
    const cs = gameState.currentSet;
    addPlayerBtn.disabled = true;

    const startingName = (gameState.players.find(p => p.id === cs.startingPlayerId) || {}).name || "Unknown";

    currentSetInfoDiv.innerHTML = `
      <div class="pill">Set #${cs.setNumber}</div>
      <div class="pill">Cards/Rounds: ${cs.cards}</div>
      <div class="pill">Default starting: ${startingName}</div>
      <div class="info">Stage: ${cs.stage}</div>
    `;
  }

  function renderActiveSet() {
    if (!gameState.currentSet) {
      activeSetArea.innerHTML = "<div class='info'>No active set. Click \"Add Set\" to start.</div>";
      return;
    }

    const cs = gameState.currentSet;

    if (cs.stage === "chooseStart") {
      renderChooseStartUI();
    } else if (cs.stage === "guessing") {
      renderGuessingUI();
    } else if (cs.stage === "rounds") {
      renderRoundsUI();
    }
  }

  function renderChooseStartUI() {
    const cs = gameState.currentSet;

    const options = gameState.players.map(p => `
      <option value="${p.id}" ${p.id === cs.startingPlayerId ? "selected" : ""}>
        ${p.name}
      </option>
    `).join("");

    activeSetArea.innerHTML = `
      <div>
        <div class="info">
          Choose starting player for Set #${cs.setNumber}.<br>
          Last player will be automatically decided based on order.
        </div>
        <label>Starting Player:</label>
        <select id="startingPlayerSelect">${options}</select>
        <button id="confirmStartBtn">Confirm & Start Guessing</button>
      </div>
    `;

    $("confirmStartBtn").addEventListener("click", () => {
      const select = $("startingPlayerSelect");
      const startId = parseInt(select.value, 10);
      cs.startingPlayerId = startId;

      const players = gameState.players.slice();
      const startIndex = players.findIndex(p => p.id === startId);
      const rotated = players.slice(startIndex).concat(players.slice(0, startIndex));
      cs.guessOrder = rotated.map(p => p.id);

      cs.stage = "guessing";
      cs.guessIndex = 0;
      cs.guesses = {};
      cs.wins = {};
      cs.points = {};

      saveState();
      renderCurrentSetInfo();
      renderActiveSet();
    });
  }

function renderGuessingUI() {
  const cs = gameState.currentSet;
  const currentPlayerId = cs.guessOrder[cs.guessIndex];
  const currentPlayer = gameState.players.find(p => p.id === currentPlayerId);

  const lastPlayerId = cs.guessOrder[cs.guessOrder.length - 1];
  const lastPlayer = gameState.players.find(p => p.id === lastPlayerId);

  const orderNames = cs.guessOrder
    .map(id => gameState.players.find(p => p.id === id)?.name || "?")
    .join(" → ");

  const isLast = cs.guessIndex === cs.guessOrder.length - 1;

  // figure out which guess value is forbidden for last player
  let forbiddenValue = null;
  if (isLast) {
    const sumWithoutCurrent = cs.guessOrder.reduce((sum, id, idx) => {
      if (idx === cs.guessIndex) return sum;
      return sum + (cs.guesses[id] || 0);
    }, 0);
    const neededToEqualSet = cs.cards - sumWithoutCurrent;
    if (neededToEqualSet >= 0 && neededToEqualSet <= cs.cards) {
      forbiddenValue = neededToEqualSet;
    }
  }

  // build guess buttons 0..cards
  let guessButtonsHtml = `<div class="flex" style="margin-top:6px;">`;
  for (let g = 0; g <= cs.cards; g++) {
    const disabled = isLast && g === forbiddenValue;
    guessButtonsHtml += `
      <button class="winner-btn" data-guess-value="${g}" ${disabled ? "disabled" : ""}>
        ${g}
      </button>
    `;
  }
  guessButtonsHtml += `</div>`;

  activeSetArea.innerHTML = `
    <div>
      <div class="info">
        Set #${cs.setNumber}, Cards: ${cs.cards}<br>
        Guess order: ${orderNames}<br>
        Last guess must NOT make total guesses = ${cs.cards}.
      </div>
      <div style="margin-top:8px;">
        <strong>Current player:</strong> ${currentPlayer ? currentPlayer.name : "?"}
      </div>
      <div class="info" style="margin-top:4px;">
        Click a number to set the guess (0 to ${cs.cards}).<br>
        Last player: <strong>${lastPlayer ? lastPlayer.name : "?"}</strong>${forbiddenValue !== null ? ` (cannot choose ${forbiddenValue})` : ""}.
      </div>
      ${guessButtonsHtml}
      <div style="margin-top:8px;">
        <strong>Current guesses:</strong><br>
        ${cs.guessOrder.map(id => {
          const p = gameState.players.find(pl => pl.id === id);
          const g = cs.guesses[id];
          return `<span class="pill">${p ? p.name : "?"}: ${g !== undefined ? g : "-"}</span>`;
        }).join("")}
      </div>
    </div>
  `;

  activeSetArea.querySelectorAll("[data-guess-value]").forEach(btn => {
    btn.addEventListener("click", () => {
      const val = parseInt(btn.getAttribute("data-guess-value"), 10);
      handleGuessSelection(val);
    });
  });

  function handleGuessSelection(val) {
    if (isNaN(val) || val < 0 || val > cs.cards) return;

    const currentPlayerId = cs.guessOrder[cs.guessIndex];
    const currentPlayer = gameState.players.find(p => p.id === currentPlayerId);

    let confirmed = false;
    let timerId = null;
    const guessValue = val;

    // show confirm card with Yes / No, auto-YES in 3 sec if no choice
    activeSetArea.innerHTML = `
      <div class="card">
        <div class="info">
          <strong>${currentPlayer ? currentPlayer.name : "Player"}</strong> guessed <strong>${guessValue}</strong>.
        </div>
        <div class="info" style="margin-top:4px;">
          Confirm this guess?
        </div>
        <div style="margin-top:8px;">
          <button id="confirmGuessYes">Yes</button>
          <button id="confirmGuessNo" class="danger">No</button>
        </div>
        <div class="info" style="margin-top:4px;">
          If no option is selected, guess will be confirmed automatically in 3 seconds.
        </div>
      </div>
    `;

    const yesBtn = document.getElementById("confirmGuessYes");
    const noBtn = document.getElementById("confirmGuessNo");

    function proceed(accepted) {
      if (confirmed) return;
      confirmed = true;
      if (timerId) clearTimeout(timerId);

      if (!accepted) {
        // NO → go back to the same player's guessing UI
        saveState(); // nothing actually changed yet
        renderActiveSet();
        return;
      }

      // YES (or auto-YES) → commit guess and move on
      cs.guesses[currentPlayerId] = guessValue;
      saveState();

      const isLastNow = cs.guessIndex === cs.guessOrder.length - 1;

      if (isLastNow) {
        const totalGuesses = cs.guessOrder.reduce((sum, id) => sum + (cs.guesses[id] || 0), 0);

        // Safety check (should not happen due to forbidden button, but just in case)
        if (totalGuesses === cs.cards) {
          alert(`Total guesses = ${totalGuesses}, cannot equal number of cards (${cs.cards}). Please guess again.`);
          delete cs.guesses[currentPlayerId];
          saveState();
          renderActiveSet();
          return;
        }

        cs.stage = "rounds";
        cs.currentRound = 1;
        cs.wins = {};
        saveState();
        renderCurrentSetInfo();
        renderActiveSet();
      } else {
        cs.guessIndex += 1;
        saveState();
        renderActiveSet();
      }
    }

    yesBtn.addEventListener("click", () => proceed(true));
    noBtn.addEventListener("click", () => proceed(false));

    // auto-confirm as YES in 3 sec if user doesn't press anything
      let countdown = 3;
      
      const confirmBox = activeSetArea.querySelector("#countdownAutoConfirm");
      if (confirmBox) confirmBox.innerHTML = `Auto confirm in ${countdown}`;
      
      timerId = setInterval(() => {
        countdown--;
        if (confirmBox) confirmBox.innerHTML = `Auto confirm in ${countdown}`;
        if (countdown === 0) {
          clearInterval(timerId);
          proceed(true);
        }
      }, 1000);
  }
}


function renderRoundsUI() {
  const cs = gameState.currentSet;
  const round = cs.currentRound;
  const totalRounds = cs.cards;

  if (round > totalRounds) {
    finishCurrentSet();
    return;
  }

  activeSetArea.innerHTML = `
    <div>
      <div class="info">
        Set #${cs.setNumber} — Round ${round} of ${totalRounds}<br>
        Click the winner for this round (exactly one winner).
      </div>
      <div class="flex" style="margin-top:8px;">
        ${gameState.players.map(p => {
          return `<button class="winner-btn" data-win-player="${p.id}">${p.name}</button>`;
        }).join("")}
      </div>

      <div style="margin-top:8px;">
        <strong>Wins so far:</strong><br>
        ${gameState.players.map(p => {
          const w = cs.wins[p.id] || 0;
          return `<span class="pill">${p.name}: ${w}</span>`;
        }).join("")}
      </div>

      <div style="margin-top:8px;">
        <strong>Guesses:</strong><br>
        ${gameState.players.map(p => {
          const g = cs.guesses[p.id];
          return `<span class="pill">${p.name}: ${g}</span>`;
        }).join("")}
      </div>
    </div>
  `;

  activeSetArea.querySelectorAll("[data-win-player]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = parseInt(btn.getAttribute("data-win-player"), 10);
      const player = gameState.players.find(p => p.id === id);

      // Count win now
      cs.wins[id] = (cs.wins[id] || 0) + 1;
      saveState();

      // Show confirmation card and delay next round
let countdown = 3;

activeSetArea.innerHTML = `
  <div class="card">
    <div class="info">
      Round ${round} winner: <strong>${player ? player.name : "Player"}</strong>.
    </div>
    <div class="info" id="countdownDisplay">
      Next round in: ${countdown}
    </div>
  </div>
`;

let cdTimer = setInterval(() => {
  countdown--;
  if ($("countdownDisplay")) $("countdownDisplay").innerHTML = `Next round in: ${countdown}`;
  if (countdown === 0) {
    clearInterval(cdTimer);
    cs.currentRound += 1;
    saveState();
    renderActiveSet();
  }
}, 1000);
    });
  });
}

  function finishCurrentSet() {
    const cs = gameState.currentSet;

    const totalWins = Object.values(cs.wins).reduce((sum, w) => sum + w, 0);
    if (totalWins !== cs.cards) {
      alert(`Warning: total wins counted (${totalWins}) do not match card count (${cs.cards}).`);
    }

    gameState.players.forEach(p => {
      const id = p.id;
      const g = cs.guesses[id] || 0;
      const w = cs.wins[id] || 0;
      let pts = 0;

      if (w === g) {
        pts = w + 10;
      } else if (w < g) {
        pts = w - g;
      } else {
        pts = w;
      }
      cs.points[id] = pts;
    });

    gameState.sets.push(cs);
    gameState.currentSet = null;
    saveState();

    renderCurrentSetInfo();
    renderActiveSet();
    renderScoreboard();
    renderRanking();
    alert(`Set #${cs.setNumber} completed!`);
  }

function renderScoreboard() {
  const sets = gameState.sets;
  const players = gameState.players;

  if (!sets.length || !players.length) {
    scoreboardArea.innerHTML = "<span class='info'>No sets played yet.</span>";
    return;
  }

  let html = "<table>";

  // Header row: empty cell + one column per player
  html += "<tr><th></th>";
  players.forEach(p => {
    html += `<th>${p.name}</th>`;
  });
  html += "</tr>";

  // One row per set
  sets.forEach((s, setIndex) => {
    html += `<tr><td><strong>Set ${s.setNumber}</strong></td>`;

    players.forEach(p => {
      if (setIndex < p.joinedAtSet) {
        // Player joined after this set
        html += "<td>-</td>";
      } else {
        const g = s.guesses[p.id];
        const pts = s.points[p.id];

        if (g === undefined || pts === undefined) {
          html += "<td>-</td>";
        } else {
          html += `<td>${g}).${pts}</td>`;
        }
      }
    });

    html += "</tr>";
  });

  html += "</table>";
  scoreboardArea.innerHTML = html;
}


  function computeTotals() {
    const totals = {};
    gameState.players.forEach(p => {
      let sum = 0;
      gameState.sets.forEach((s, index) => {
        if (index >= p.joinedAtSet) {
          if (typeof s.points[p.id] === "number") {
            sum += s.points[p.id];
          }
        }
      });
      totals[p.id] = sum;
    });
    return totals;
  }

  function renderRanking() {
    const players = gameState.players;
    if (!players.length) {
      rankingArea.innerHTML = "<span class='info'>No players.</span>";
      return;
    }

    const totals = computeTotals();
    const sorted = players.slice().sort((a, b) => {
      const ta = totals[a.id] || 0;
      const tb = totals[b.id] || 0;
      if (tb !== ta) return tb - ta;
      return a.name.localeCompare(b.name);
    });

    let html = "<table><tr><th>Rank</th><th>Player</th><th>Total Points</th></tr>";
    let lastScore = null;
    let lastRank = 0;
    let index = 0;

    sorted.forEach(p => {
      index++;
      const score = totals[p.id] || 0;
      let rank;
      if (score === lastScore) {
        rank = lastRank;
      } else {
        rank = index;
        lastRank = rank;
        lastScore = score;
      }
      html += `<tr><td>${rank}</td><td>${p.name}</td><td>${score}</td></tr>`;
    });

    html += "</table>";
    rankingArea.innerHTML = html;
    applyRankingBlur();
  }

showRankingBtn.addEventListener("click", () => {
  // always refresh ranking when button is clicked
  renderRanking();

  // then toggle blur state
  rankingHidden = !rankingHidden;
  applyRankingBlur();

  // update button text
  showRankingBtn.textContent = rankingHidden ? "Reveal Ranking" : "Hide Ranking";
});

  loadState();
  renderPlayers();
  renderCurrentSetInfo();
  renderActiveSet();
  renderScoreboard();
  renderRanking();
})();


