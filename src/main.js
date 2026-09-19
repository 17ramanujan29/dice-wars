import { UI_CONFIG, CONFIG } from "./config/index.js";
import { GameController } from "./core/GameController.js";
import { OnlineGameSession } from "./core/OnlineGameSession.js";
import { Renderer } from "./core/Renderer.js";
import { UIManager } from "./ui/UIManager.js";
import { InputHandler } from "./input/InputHandler.js";

// ゲームインスタンスの初期化
const canvas = document.getElementById("gameCanvas");
const game = new GameController();
const renderer = new Renderer("gameCanvas", game);
const ui = new UIManager();
const inputHandler = new InputHandler(canvas, renderer, game);
const onlineSession = new OnlineGameSession(game);

// ゲームモードの状態管理
let currentMode = "local";

/**
 * 現在のルール設定を読み取る
 * @returns {Object} ルールオブジェクト
 */
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
  rules.eightDiceCountLimitValue = parseInt(
    document.getElementById("eight-dice-count-limit").value,
    10,
  );
  return rules;
}

/**
 * ゲーム結果をローカルストレージに保存
 * @param {string} status - ゲームステータス
 */
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

/**
 * スタート画面に戻る
 */
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

/**
 * ローカルゲームを開始
 * @param {number} playerCount - プレイヤー数
 */
function startLocalGame(playerCount) {
  currentMode = "local";
  game.startGame(playerCount, readRules());
  ui.showInGameUI();
  renderer.start();
}

/**
 * オンラインゲームを開始
 */
function startOnlineGame() {
  currentMode = "online";
  ui.showInGameUI();
  renderer.start();
}

/**
 * ゲームの状態変化ハンドラ
 */
game.onStateChange = (state) => {
  const canEndTurn =
    currentMode === "local" ||
    onlineSession.localPlayerId === state.currentPlayerIndex;
  ui.updateGameState(state, returnToStartScreen, canEndTurn);
  if (currentMode === "online" && onlineSession.role === "host")
    onlineSession.broadcastState();
};

/**
 * 戦闘開始ハンドラ（ローカル）
 */
game.onBattleStart = (source, target, attacker, defender) => {
  ui.setEndTurnAvailability(false);
  ui.showBattleStart(
    source,
    target,
    attacker,
    defender,
    CONFIG.ui.battleAnimationMs,
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

/**
 * 戦闘終了ハンドラ（ローカル）
 */
game.onBattleEnd = (attackerScore, defenderScore, resultType) => {
  ui.showBattleEnd(
    attackerScore,
    defenderScore,
    resultType,
    CONFIG.ui.battleResultDisplayMs,
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

/**
 * オンラインセッションのイベントハンドラ
 */
onlineSession.onLobbyChange = (lobby) => ui.showOnlineLobby(lobby);
onlineSession.onGameStart = startOnlineGame;

/**
 * オンライン戦闘開始ハンドラ
 * ローカルのonBattleStartと処理が重複しているため、共通化できる
 */
onlineSession.onBattleStart = (battle) => {
  ui.setEndTurnAvailability(false);
  ui.showBattleStart(
    battle.source,
    battle.target,
    battle.attacker,
    battle.defender,
    CONFIG.ui.battleAnimationMs,
  );
};

/**
 * オンライン戦闘終了ハンドラ
 * ローカルのonBattleEndと処理が重複しているため、共通化できる
 */
onlineSession.onBattleEnd = (battle) => {
  ui.showBattleEnd(
    battle.attackerScore,
    battle.defenderScore,
    battle.resultType,
    CONFIG.ui.battleResultDisplayMs,
  );
};

onlineSession.onError = (message) => ui.showOnlineError(message);

/**
 * オンラインセッション終了ハンドラ
 */
onlineSession.onSessionEnd = (reason) => {
  game.phase = "start";
  renderer.clear();
  ui.resetToStartScreen();
  ui.showStartMode();
  ui.showOnlineError(reason);
};

/**
 * UIイベントリスナーの設定
 */
function setupEventListeners() {
  // モード選択
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

  // プレイヤー数選択
  document.querySelectorAll(".player-btn").forEach((button) => {
    button.addEventListener("click", (event) =>
      startLocalGame(parseInt(event.currentTarget.dataset.players, 10)),
    );
  });

  // オンラインルーム作成
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

  // オンラインルーム参加フォーム表示
  document.getElementById("join-room-btn").addEventListener("click", () => {
    document.getElementById("join-room-form").classList.remove("hidden");
  });

  // オンラインルーム参加
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

  // ルームエラーモーダル閉じる
  document
    .getElementById("close-room-error-btn")
    .addEventListener("click", () => ui.hideRoomError());

  // オンラインゲーム開始
  document
    .getElementById("start-online-btn")
    .addEventListener("click", () => onlineSession.startGame());

  // オンラインロビー退出
  document
    .getElementById("leave-online-btn")
    .addEventListener("click", () =>
      onlineSession.end("オンラインロビーから退出しました。"),
    );

  // オンライン設定ボタン
  document.getElementById("online-settings-btn").addEventListener("click", () => {
    ui.setRules(onlineSession.rules);
    ui.showSettingsModal(onlineSession.role === "host");
  });

  // ターン終了ボタン
  document.getElementById("end-turn-btn").addEventListener("click", () => {
    if (currentMode === "online") onlineSession.requestEndTurn();
    else game.endTurn();
  });

  // ゲーム終了ボタン
  document
    .getElementById("quit-game-btn")
    .addEventListener("click", () =>
      document.getElementById("quit-modal").classList.remove("hidden"),
    );

  // ゲーム終了確認
  document.getElementById("confirm-quit-btn").addEventListener("click", () => {
    saveGameResult("quit");
    returnToStartScreen();
  });

  // ゲーム終了キャンセル
  document
    .getElementById("cancel-quit-btn")
    .addEventListener("click", () =>
      document.getElementById("quit-modal").classList.add("hidden"),
    );

  // 設定オープン（ローカルスタート時）
  document.getElementById("open-settings-btn").addEventListener("click", () => {
    ui.showSettingsModal(true);
  });

  // 設定クローズ
  document.getElementById("close-settings-btn").addEventListener("click", () => {
    ui.hideSettingsModal(
      true,
      () => {
        if (onlineSession.role === "host") {
          onlineSession.setRoomSettings(readRules());
        }
      },
      { currentMode, game, onlineSession }
    );
  });

  // インゲーム設定ボタン
  document
    .getElementById("in-game-settings-btn")
    .addEventListener("click", () => {
      ui.setRules(game.rules);
      ui.showSettingsModal(false);
    });
}

/**
 * ルールトグルと入力フィールドの同期設定
 */
function setupRuleSync() {
  ui.syncRuleToggleInput(ui.greatPowerRuleCb, ui.greatPowerThresholdInput);
  ui.syncRuleToggleInput(ui.smallCountryRuleCb, ui.smallCountryThresholdInput);
  ui.syncRuleToggleInput(
    ui.eightDiceCountLimitCb,
    ui.eightDiceCountLimitInput,
  );
  
  ui.greatPowerRuleCb.addEventListener("change", (event) =>
    ui.syncRuleToggleInput(event.target, ui.greatPowerThresholdInput),
  );
  ui.smallCountryRuleCb.addEventListener("change", (event) =>
    ui.syncRuleToggleInput(event.target, ui.smallCountryThresholdInput),
  );
  ui.eightDiceCountLimitCb.addEventListener("change", (event) =>
    ui.syncRuleToggleInput(event.target, ui.eightDiceCountLimitInput),
  );
}

/**
 * 領土クリックハンドラの設定
 */
function setupTerritoryClickHandler() {
  inputHandler.onTerritoryClick = (territoryId) => {
    if (currentMode === "online")
      onlineSession.requestTerritoryClick(territoryId);
    else game.handleTerritoryClick(territoryId);
  };
}

// イベントリスナーの設定
setupEventListeners();
setupRuleSync();
setupTerritoryClickHandler();

// 初期表示
ui.showStartMode();
