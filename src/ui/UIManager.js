export class UIManager {
  constructor() {
    this.turnInfoEl = document.getElementById("turn-info");
    this.playerStatsEl = document.getElementById("player-stats");
    this.endTurnBtn = document.getElementById("end-turn-btn");
    this.inGameSettingsBtn = document.getElementById("in-game-settings-btn");
    this.quitGameBtn = document.getElementById("quit-game-btn");
    this.startScreenEl = document.getElementById("start-screen");
    this.battleModalEl = document.getElementById("battle-modal");
    this.settingsModalEl = document.getElementById("settings-modal");
    this.quitModalEl = document.getElementById("quit-modal");
    this.roomErrorModalEl = document.getElementById("room-error-modal");
    this.modeSelectionEl = document.getElementById("mode-selection");
    this.localSetupEl = document.getElementById("local-setup");
    this.onlineSetupEl = document.getElementById("online-setup");
    this.onlineLobbyEl = document.getElementById("online-lobby");
  }

  updateGameState(state, onRestartCallback, canEndTurn = true) {
    if (state.phase === "gameover") {
      this.turnInfoEl.innerHTML = `
                <span style="color: ${state.winner.color}; font-size: 2rem;">${state.winner.name} Wins!</span>
                <button id="restart-btn" class="ui-panel bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded mt-4">Play Again</button>
            `;
      this.endTurnBtn.style.display = "none";
      this.setEndTurnAvailability(false);
      document.getElementById("restart-btn").onclick = onRestartCallback;
      return;
    }

    const curr = state.players[state.currentPlayerIndex];
    this.turnInfoEl.innerHTML = `<span style="color: ${curr.color}; text-shadow: 1px 1px 2px #000;">${curr.name}'s Turn</span>`;
    this.setEndTurnAvailability(state.phase === "playing" && canEndTurn);

    this.playerStatsEl.innerHTML = "";
    state.players.forEach((p) => {
      const terrs = state.getOwnedTerritories(p.id);
      if (terrs.length === 0) return;

      const maxConn = state.getMaxConnected(p.id);
      const totalDice = terrs.reduce((sum, t) => sum + t.dice, 0);

      const div = document.createElement("div");
      div.className = `flex justify-between items-center gap-4 mb-1 ${p.id === state.currentPlayerIndex ? "font-bold" : "opacity-70"}`;
      div.style.color = p.color;

      let badges = "";
      if (
        state.rules.greatPower &&
        maxConn >= state.rules.greatPowerThreshold
      ) {
        badges += `<span class="bg-red-600 text-white text-xs px-2 py-0.5 rounded ml-2 shadow-sm border border-red-400">大国</span>`;
      }
      if (
        state.rules.smallCountryBonus &&
        maxConn <= state.rules.smallCountryThreshold
      ) {
        badges += `<span class="bg-blue-600 text-white text-xs px-2 py-0.5 rounded ml-2 shadow-sm border border-blue-400">小国</span>`;
      }

      div.innerHTML = `
                <span>${p.name}${badges}</span>
                <span>最大連続: <strong>${maxConn}</strong> <span class="text-xs opacity-80">(${terrs.length}領土 / 🎲${totalDice}個)</span></span>
            `;
      this.playerStatsEl.appendChild(div);
    });
  }

  showBattleStart(src, tgt, atkP, defP, animationMs) {
    document.getElementById("atk-player-name").innerText = atkP.name;
    document.getElementById("atk-player-name").style.color = atkP.color;
    document.getElementById("def-player-name").innerText = defP.name;
    document.getElementById("def-player-name").style.color = defP.color;
    document.getElementById("atk-dice-count").innerText = src.dice;
    document.getElementById("def-dice-count").innerText = tgt.dice;
    document.getElementById("atk-score").innerText = "...";
    document.getElementById("def-score").innerText = "...";
    document.getElementById("battle-result").innerText = "";

    this.battleModalEl.style.display = "block";
    this.battleModalEl.classList.add("dice-roll-anim");
    setTimeout(
      () => this.battleModalEl.classList.remove("dice-roll-anim"),
      animationMs,
    );
  }

  showBattleEnd(atkScore, defScore, type, resultDisplayMs) {
    document.getElementById("atk-score").innerText = atkScore;
    document.getElementById("def-score").innerText = defScore;
    const resEl = document.getElementById("battle-result");

    if (type === "win") {
      resEl.innerText = "Attacker Wins!";
      resEl.style.color = "#2ecc71";
    } else if (type === "draw") {
      resEl.innerText = "Draw!";
      resEl.style.color = "#f1c40f";
    } else {
      resEl.innerText = "Defender Wins!";
      resEl.style.color = "#e74c3c";
    }

    setTimeout(() => {
      this.battleModalEl.style.display = "none";
    }, resultDisplayMs);
  }

  showInGameUI() {
    this.startScreenEl.style.display = "none";
    this.settingsModalEl.classList.add("hidden");
    this.endTurnBtn.classList.remove("hidden");
    this.endTurnBtn.style.display = "block";
    this.quitGameBtn.classList.remove("hidden");
    this.inGameSettingsBtn.classList.remove("hidden");
  }

  resetToStartScreen() {
    this.quitModalEl.classList.add("hidden");
    this.battleModalEl.style.display = "none";
    this.settingsModalEl.classList.add("hidden");

    this.endTurnBtn.classList.add("hidden");
    this.setEndTurnAvailability(false);
    this.quitGameBtn.classList.add("hidden");
    this.inGameSettingsBtn.classList.add("hidden");

    this.startScreenEl.style.display = "flex";
  }

  syncRuleToggleInput(checkbox, input) {
    input.disabled = !checkbox.checked;
    input.parentElement.style.display = checkbox.checked ? "flex" : "none";
  }

  setEndTurnAvailability(available) {
    this.endTurnBtn.disabled = !available;
    this.endTurnBtn.classList.toggle("end-turn-disabled", !available);
    this.endTurnBtn.setAttribute("aria-disabled", String(!available));
  }

  showStartMode() {
    this.startScreenEl.style.display = "flex";
    [
      this.modeSelectionEl,
      this.localSetupEl,
      this.onlineSetupEl,
      this.onlineLobbyEl,
    ].forEach((element) => element.classList.add("hidden"));
    this.modeSelectionEl.classList.remove("hidden");
  }

  showLocalSetup() {
    [this.modeSelectionEl, this.onlineSetupEl, this.onlineLobbyEl].forEach(
      (element) => element.classList.add("hidden"),
    );
    this.localSetupEl.classList.remove("hidden");
  }

  showOnlineSetup() {
    [this.modeSelectionEl, this.localSetupEl, this.onlineLobbyEl].forEach(
      (element) => element.classList.add("hidden"),
    );
    this.onlineSetupEl.classList.remove("hidden");
  }

  showOnlineLobby(lobby) {
    [this.modeSelectionEl, this.localSetupEl, this.onlineSetupEl].forEach(
      (element) => element.classList.add("hidden"),
    );
    this.onlineLobbyEl.classList.remove("hidden");

    document.getElementById("room-code").innerText = lobby.roomId || "参加済み";
    document.getElementById("connection-status").innerText =
      lobby.role === "host" ? "ホストとして待機中" : "参加者として待機中";
    const list = document.getElementById("online-player-list");
    list.innerHTML = "";
    lobby.players.forEach((player, index) => {
      const item = document.createElement("li");
      item.innerHTML = `<span>${player.name}</span><span>${index === 0 ? "ホスト" : "参加者"}</span>`;
      list.appendChild(item);
    });

    const isHost = lobby.role === "host";
    document.getElementById("online-player-count").innerText =
      `${lobby.players.length} / 4人`;
    document.getElementById("online-settings-btn").disabled = !isHost;
    document.getElementById("start-online-btn").disabled =
      !isHost || lobby.players.length < 2;
    document.getElementById("start-online-btn").title =
      lobby.players.length >= 2 ? "" : "参加者が2人以上必要です";
  }

  showOnlineError(message) {
    document.getElementById("online-error").innerText = message;
  }

  clearOnlineError() {
    document.getElementById("online-error").innerText = "";
  }

  showRoomError(message = "ルームコードを確認してください。") {
    document.getElementById("room-error-message").innerText = message;
    this.roomErrorModalEl.classList.remove("hidden");
  }

  hideRoomError() {
    this.roomErrorModalEl.classList.add("hidden");
  }
}
