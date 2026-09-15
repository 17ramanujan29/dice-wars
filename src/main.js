import { UI_CONFIG } from "./config/index.js";
import { GameController } from "./core/GameController.js";
import { OnlineGameSession } from "./core/OnlineGameSession.js";
import { Renderer } from "./core/Renderer.js";
import { UIManager } from "./ui/UIManager.js";
import { InputHandler } from "./input/InputHandler.js";

const canvas = document.getElementById("gameCanvas");
const game = new GameController();
const renderer = new Renderer("gameCanvas", game);
const ui = new UIManager();
const inputHandler = new InputHandler(canvas, renderer, game);
const onlineSession = new OnlineGameSession(game);
let currentMode = "local";

function readRules() {
  const rules = {};
  document.querySelectorAll(".rule-toggle").forEach((checkbox) => {
    rules[checkbox.dataset.rule] = checkbox.checked;
  });
  rules.greatPowerThreshold = parseInt(
    document.getElementById("great-power-threshold").value,
    10,
  );
  rules.smallCountryThreshold = parseInt(
    document.getElementById("small-country-threshold").value,
    10,
  );
  return rules;
}

function saveGameResult(status) {
  const history = JSON.parse(localStorage.getItem("dice_wars_history") || "[]");
  history.push({
    timestamp: new Date().toLocaleString(),
    status,
    playersCount: game.players.length,
    winner: game.winner ? game.winner.name : null,
    rules: { ...game.rules },
  });
  localStorage.setItem("dice_wars_history", JSON.stringify(history));
}

function returnToStartScreen() {
  if (currentMode === "online")
    onlineSession.end("オンラインセッションを終了しました。");
  currentMode = "local";
  game.phase = "start";
  game.selectedTerritoryId = null;
  renderer.clear();
  ui.resetToStartScreen();
  ui.showStartMode();
}

function startLocalGame(playerCount) {
  currentMode = "local";
  game.startGame(playerCount, readRules());
  ui.showInGameUI();
  renderer.start();
}

function startOnlineGame() {
  currentMode = "online";
  ui.showInGameUI();
  renderer.start();
}

function setSettingsEditable(editable) {
  document
    .querySelectorAll(
      ".rule-toggle, #great-power-threshold, #small-country-threshold, label",
    )
    .forEach((element) => {
      element.classList.toggle("pointer-events-none", !editable);
    });
  document.querySelectorAll(".rule-toggle").forEach((element) => {
    element.disabled = !editable;
  });
  document.getElementById("great-power-threshold").disabled =
    !editable || !document.getElementById("great-power-rule").checked;
  document.getElementById("small-country-threshold").disabled =
    !editable || !document.getElementById("small-country-rule").checked;
}

game.onStateChange = (state) => {
  const canEndTurn =
    currentMode === "local" ||
    onlineSession.localPlayerId === state.currentPlayerIndex;
  ui.updateGameState(state, returnToStartScreen, canEndTurn);
  if (currentMode === "online" && onlineSession.role === "host")
    onlineSession.broadcastState();
};

game.onBattleStart = (source, target, attacker, defender) => {
  ui.setEndTurnAvailability(false);
  ui.showBattleStart(
    source,
    target,
    attacker,
    defender,
    UI_CONFIG.battleAnimationMs,
  );
  if (currentMode === "online" && onlineSession.role === "host") {
    onlineSession.network.send({
      type: "battle-start",
      source,
      target,
      attacker,
      defender,
    });
  }
};
game.onBattleEnd = (attackerScore, defenderScore, resultType) => {
  ui.showBattleEnd(
    attackerScore,
    defenderScore,
    resultType,
    UI_CONFIG.battleResultDisplayMs,
  );
  if (currentMode === "online" && onlineSession.role === "host") {
    onlineSession.network.send({
      type: "battle-end",
      attackerScore,
      defenderScore,
      resultType,
    });
  }
};

onlineSession.onLobbyChange = (lobby) => ui.showOnlineLobby(lobby);
onlineSession.onGameStart = startOnlineGame;
onlineSession.onBattleStart = (battle) => {
  ui.setEndTurnAvailability(false);
  ui.showBattleStart(
    battle.source,
    battle.target,
    battle.attacker,
    battle.defender,
    UI_CONFIG.battleAnimationMs,
  );
};
onlineSession.onBattleEnd = (battle) => {
  ui.showBattleEnd(
    battle.attackerScore,
    battle.defenderScore,
    battle.resultType,
    UI_CONFIG.battleResultDisplayMs,
  );
};
onlineSession.onError = (message) => ui.showOnlineError(message);
onlineSession.onSessionEnd = (reason) => {
  game.phase = "start";
  renderer.clear();
  ui.resetToStartScreen();
  ui.showStartMode();
  ui.showOnlineError(reason);
};

document
  .getElementById("local-mode-btn")
  .addEventListener("click", () => ui.showLocalSetup());
document
  .getElementById("online-mode-btn")
  .addEventListener("click", () => ui.showOnlineSetup());
document
  .querySelectorAll(".back-to-mode")
  .forEach((button) =>
    button.addEventListener("click", () => ui.showStartMode()),
  );

document.querySelectorAll(".player-btn").forEach((button) => {
  button.addEventListener("click", (event) =>
    startLocalGame(parseInt(event.currentTarget.dataset.players, 10)),
  );
});

document
  .getElementById("create-room-btn")
  .addEventListener("click", async () => {
    ui.clearOnlineError();
    currentMode = "online";
    try {
      await onlineSession.createRoom(
        document.getElementById("online-player-name").value.trim(),
      );
    } catch (error) {
      ui.showOnlineError(error.message || "ルームを作成できませんでした。");
    }
  });

document.getElementById("join-room-btn").addEventListener("click", () => {
  document.getElementById("join-room-form").classList.remove("hidden");
});

document
  .getElementById("connect-room-btn")
  .addEventListener("click", async () => {
    ui.clearOnlineError();
    currentMode = "online";
    const roomCode = document.getElementById("room-code-input").value.trim();
    if (!/^\d{6}$/.test(roomCode)) {
      ui.showOnlineError("ルームコードは6桁の数字で入力してください。");
      return;
    }
    try {
      await onlineSession.joinRoom(
        roomCode,
        document.getElementById("online-player-name").value.trim(),
      );
    } catch (error) {
      if (error.type === "peer-unavailable") {
        ui.showRoomError();
      } else {
        ui.showOnlineError(error.message || "ルームに参加できませんでした。");
      }
    }
  });

document
  .getElementById("close-room-error-btn")
  .addEventListener("click", () => ui.hideRoomError());

document
  .getElementById("start-online-btn")
  .addEventListener("click", () => onlineSession.startGame());
document
  .getElementById("leave-online-btn")
  .addEventListener("click", () =>
    onlineSession.end("オンラインロビーから退出しました。"),
  );

document.getElementById("online-settings-btn").addEventListener("click", () => {
  setSettingsEditable(onlineSession.role === "host");
  document.getElementById("settings-modal").classList.remove("hidden");
});

document.getElementById("end-turn-btn").addEventListener("click", () => {
  if (currentMode === "online") onlineSession.requestEndTurn();
  else game.endTurn();
});
document
  .getElementById("quit-game-btn")
  .addEventListener("click", () =>
    document.getElementById("quit-modal").classList.remove("hidden"),
  );
document.getElementById("confirm-quit-btn").addEventListener("click", () => {
  saveGameResult("quit");
  returnToStartScreen();
});
document
  .getElementById("cancel-quit-btn")
  .addEventListener("click", () =>
    document.getElementById("quit-modal").classList.add("hidden"),
  );

document.getElementById("open-settings-btn").addEventListener("click", () => {
  setSettingsEditable(true);
  document.getElementById("settings-modal").classList.remove("hidden");
});
document.getElementById("close-settings-btn").addEventListener("click", () => {
  document.getElementById("settings-modal").classList.add("hidden");
  if (currentMode === "local" && game.phase === "start") return;
  if (onlineSession.role === "host") onlineSession.setRoomSettings(readRules());
});
document
  .getElementById("in-game-settings-btn")
  .addEventListener("click", () => {
    setSettingsEditable(false);
    document.getElementById("settings-modal").classList.remove("hidden");
  });

const greatPowerRuleCb = document.getElementById("great-power-rule");
const greatPowerThresholdInput = document.getElementById(
  "great-power-threshold",
);
greatPowerRuleCb.addEventListener("change", (event) =>
  ui.syncRuleToggleInput(event.target, greatPowerThresholdInput),
);
const smallCountryRuleCb = document.getElementById("small-country-rule");
const smallCountryThresholdInput = document.getElementById(
  "small-country-threshold",
);
smallCountryRuleCb.addEventListener("change", (event) =>
  ui.syncRuleToggleInput(event.target, smallCountryThresholdInput),
);
ui.syncRuleToggleInput(greatPowerRuleCb, greatPowerThresholdInput);
ui.syncRuleToggleInput(smallCountryRuleCb, smallCountryThresholdInput);

inputHandler.onTerritoryClick = (territoryId) => {
  if (currentMode === "online")
    onlineSession.requestTerritoryClick(territoryId);
  else game.handleTerritoryClick(territoryId);
};

ui.showStartMode();
