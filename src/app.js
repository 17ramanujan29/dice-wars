import { CONFIG } from "./config.js";
import { GameEngine } from "./core/GameController.js";
import { CanvasRenderer } from "./core/Renderer.js";
import { getAdjacentHexes, pixelToHex } from "./utils/hexUtils.js";
// Error Suppression Guard for Sandboxed Iframes
window.addEventListener("error", (e) => {
  if (
    e.message &&
    (e.message.includes("WebSocket") || e.message.includes("SecurityError"))
  ) {
    console.warn("Sandbox restriction message captured:", e.message);
    e.preventDefault();
  }
});

class P2PNetworkManager {
  constructor() {
    this.peer = null;
    this.bc = null;
    this.isBroadcastMode = false;
    this.connections = []; // For Host: list of client connections
    this.hostConn = null; // For Client: connection to host
    this.isHost = false;
    this.roomId = null;
    this.myClientId = null;
    this.myPlayerIndex = -1; // -1 for local, 0..3 for online
    this.playersList = []; // Array of { name, peerId, index }
    this.mode = "local";
    this.connected = false;
    this.clientToken =
      sessionStorage.getItem("dicewars-client-token") ||
      `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem("dicewars-client-token", this.clientToken);
    this.clientName = "ゲスト";
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;

    // Handlers
    this.onLobbyUpdated = null;
    this.onGameStartReceived = null;
    this.onStateSyncReceived = null;
    this.onActionReceived = null;
    this.onPeerDisconnected = null;
  }

  generateRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "DW-";
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  getPeerIdFromRoomCode(code) {
    return `dicewars-online-v1-${code.toUpperCase().trim().replace("-", "")}`;
  }

  createRoom(hostName, callback) {
    this.clientName = hostName || "ホスト";
    this.roomId = this.generateRoomCode();
    const fullPeerId = this.getPeerIdFromRoomCode(this.roomId);

    let handled = false;

    try {
      if (typeof Peer === "undefined") throw new Error("PeerJS not available");
      this.peer = new Peer(fullPeerId);
      this.isHost = true;
      this.mode = "online";
      this.connected = true;
      this.myPlayerIndex = 0;
      this.playersList = [
        { name: hostName || "ホスト", peerId: fullPeerId, index: 0 },
      ];

      this.peer.on("open", (id) => {
        if (handled) return;
        handled = true;
        this.isBroadcastMode = false;
        callback(true, this.roomId);
      });

      this.peer.on("connection", (conn) => {
        this.handleIncomingConnection(conn);
      });
      this.peer.on("disconnected", () => {
        if (this.peer && !this.peer.destroyed) this.peer.reconnect();
      });

      this.peer.on("error", (err) => {
        console.warn(
          "PeerJS error encountered, switching to local broadcast:",
          err,
        );
        if (!handled) {
          handled = true;
          this.fallbackToBroadcastChannelHost(hostName, callback);
        } else {
          showToast(`P2P通知: ${err.message || err.type}`, "warning");
        }
      });
    } catch (err) {
      console.warn(
        "PeerJS initialization failed, using BroadcastChannel fallback:",
        err,
      );
      if (!handled) {
        handled = true;
        this.fallbackToBroadcastChannelHost(hostName, callback);
      }
    }
  }

  fallbackToBroadcastChannelHost(hostName, callback) {
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch (e) {}
      this.peer = null;
    }
    this.isBroadcastMode = true;
    this.isHost = true;
    this.myClientId = "host_" + Math.random().toString(36).substring(2, 8);
    this.myPlayerIndex = 0;
    this.playersList = [
      { name: hostName || "ホスト", peerId: this.myClientId, index: 0 },
    ];

    try {
      this.bc = new BroadcastChannel("dicewars_room_" + this.roomId);
      this.bc.onmessage = (event) =>
        this.handleBroadcastMessageHost(event.data);
      showToast(
        "外部接続制限のため、同一ブラウザ・タブ間同期モードで起動しました！",
        "info",
      );
      callback(true, this.roomId);
    } catch (e) {
      showToast("お使いのブラウザはローカル通信に対応していません。", "error");
      callback(false, null);
    }
  }

  handleIncomingConnection(conn) {
    conn.on("open", () => {
      this.connections.push(conn);
      conn.on("data", (data) => this.handleHostReceivedData(conn, data));
      conn.on("close", () => this.handleClientDisconnect(conn.peer));
      conn.on("error", () => this.handleClientDisconnect(conn.peer));
    });
  }

  handleHostReceivedData(conn, data) {
    if (data.type === "JOIN_REQUEST") {
      if (data.clientToken)
        this.handleClientDisconnect(null, data.clientToken, false);
      if (this.playersList.length >= 4) {
        conn.send({ type: "ROOM_FULL" });
        return;
      }
      let assignedIndex = this.playersList.length;
      this.playersList.push({
        name: data.playerName || `ゲスト${assignedIndex + 1}`,
        peerId: conn.peer,
        index: assignedIndex,
        clientToken: data.clientToken,
      });
      conn.send({ type: "JOIN_ACK", assignedIndex, roomId: this.roomId });
      this.broadcastLobbyState();
    } else if (data.type === "LEAVE_REQUEST") {
      this.handleClientDisconnect(conn.peer, data.clientToken);
    } else if (data.type === "PLAYER_ACTION") {
      if (this.onActionReceived) {
        this.onActionReceived(data.action, data.playerIndex);
      }
    }
  }

  handleBroadcastMessageHost(data) {
    if (!data || (data.targetId !== "host" && data.targetId !== "all")) return;

    if (data.type === "JOIN_REQUEST") {
      if (data.clientToken) {
        this.handleClientDisconnect(null, data.clientToken, false);
      }
      if (this.playersList.length >= 4) {
        if (this.bc)
          this.bc.postMessage({
            senderId: this.myClientId,
            targetId: data.senderId,
            type: "ROOM_FULL",
          });
        return;
      }
      let assignedIndex = this.playersList.length;
      this.playersList.push({
        name: data.playerName || `ゲスト${assignedIndex + 1}`,
        peerId: data.senderId,
        index: assignedIndex,
        clientToken: data.clientToken,
      });
      if (this.bc) {
        this.bc.postMessage({
          senderId: this.myClientId,
          targetId: data.senderId,
          type: "JOIN_ACK",
          assignedIndex,
          roomId: this.roomId,
        });
      }
      this.broadcastLobbyState();
    } else if (data.type === "LEAVE_REQUEST") {
      this.handleClientDisconnect(data.senderId, data.clientToken);
    } else if (data.type === "PLAYER_ACTION") {
      if (this.onActionReceived) {
        this.onActionReceived(data.action, data.playerIndex);
      }
    }
  }

  handleClientDisconnect(peerId, clientToken = null, notify = true) {
    const player = this.playersList.find(
      (p) =>
        p.peerId === peerId || (clientToken && p.clientToken === clientToken),
    );
    if (!player) return;
    this.connections = this.connections.filter((c) => c.peer !== player.peerId);
    this.playersList = this.playersList.filter((p) => p !== player);
    this.playersList.forEach((p, idx) => (p.index = idx));

    if (notify) showToast("プレイヤーが退出しました", "warning");
    this.broadcastLobbyState();
    if (this.onPeerDisconnected) this.onPeerDisconnected();
  }

  joinRoom(roomCode, clientName, callback) {
    const cleanCode = roomCode.toUpperCase().trim();
    this.roomId = cleanCode;
    this.clientName = clientName || "ゲスト";
    const targetPeerId = this.getPeerIdFromRoomCode(cleanCode);

    let handled = false;

    try {
      if (typeof Peer === "undefined") throw new Error("PeerJS not available");
      this.peer = new Peer();
      this.isHost = false;
      this.mode = "online";
      this.connected = true;

      this.peer.on("open", (id) => {
        this.myClientId = id;
        this.hostConn = this.peer.connect(targetPeerId);

        this.hostConn.on("open", () => {
          if (handled) return;
          handled = true;
          this.hostConn.send({
            type: "JOIN_REQUEST",
            playerName: clientName || "ゲスト",
            clientToken: this.clientToken,
          });
        });

        this.hostConn.on("data", (data) =>
          this.handleClientReceivedData(data, callback),
        );

        this.hostConn.on("close", () => {
          this.connected = false;
          showToast("ホストから切断されました", "error");
          if (this.onPeerDisconnected) this.onPeerDisconnected();
          this.scheduleReconnect();
        });

        this.hostConn.on("error", (err) => {
          this.connected = false;
          console.error("Host connection error:", err);
          if (!handled) {
            handled = true;
            this.fallbackToBroadcastChannelClient(clientName, callback);
          } else {
            this.scheduleReconnect();
          }
        });
      });

      this.peer.on("error", (err) => {
        console.warn("PeerJS client error, using fallback:", err);
        if (!handled) {
          handled = true;
          this.fallbackToBroadcastChannelClient(clientName, callback);
        }
      });
      this.peer.on("disconnected", () => {
        this.connected = false;
        this.scheduleReconnect();
      });
    } catch (err) {
      console.warn("PeerJS client init error, using fallback:", err);
      if (!handled) {
        handled = true;
        this.fallbackToBroadcastChannelClient(clientName, callback);
      }
    }
  }

  fallbackToBroadcastChannelClient(clientName, callback) {
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch (e) {}
      this.peer = null;
    }
    this.isBroadcastMode = true;
    this.isHost = false;
    this.mode = "online";
    this.connected = true;
    this.myClientId = "client_" + Math.random().toString(36).substring(2, 8);

    try {
      this.bc = new BroadcastChannel("dicewars_room_" + this.roomId);
      let joined = false;

      this.bc.onmessage = (event) => {
        const data = event.data;
        if (
          !data ||
          (data.targetId !== "all" && data.targetId !== this.myClientId)
        )
          return;

        if (data.type === "JOIN_ACK") {
          if (!joined) {
            joined = true;
            this.myPlayerIndex = data.assignedIndex;
            showToast("ローカル同期通信でルームに接続しました！", "info");
            if (callback) callback(true, this.roomId);
          }
        } else if (data.type === "ROOM_FULL") {
          if (!joined) {
            joined = true;
            if (callback) callback(false, "ルームが満員です");
            showToast("ルームが満員です (最大4人)", "error");
          }
        } else {
          this.handleClientReceivedData(data, null);
        }
      };

      let retries = 0;
      const tryJoin = () => {
        if (joined) return;
        this.bc.postMessage({
          senderId: this.myClientId,
          targetId: "host",
          type: "JOIN_REQUEST",
          playerName: clientName,
          clientToken: this.clientToken,
        });
        retries++;
        if (retries < 6 && !joined) {
          setTimeout(tryJoin, 500);
        } else if (!joined && retries >= 6) {
          if (callback)
            callback(
              false,
              "ルームが見つかりません。コードを確認するか、ホスト画面を同一ブラウザで開いてください。",
            );
        }
      };
      tryJoin();
    } catch (e) {
      showToast("ローカル通信の開始に失敗しました", "error");
      if (callback) callback(false, "ローカル通信エラー");
    }
  }

  handleClientReceivedData(data, joinCallback) {
    if (data.type === "JOIN_ACK") {
      this.myPlayerIndex = data.assignedIndex;
      if (joinCallback) joinCallback(true, this.roomId);
    } else if (data.type === "ROOM_FULL") {
      if (joinCallback) joinCallback(false, "ルームが満員です");
      showToast("ルームが満員です (最大4人)", "error");
    } else if (data.type === "LOBBY_UPDATE") {
      this.playersList = data.players;
      if (this.onLobbyUpdated) this.onLobbyUpdated(data);
    } else if (data.type === "START_GAME") {
      if (this.onGameStartReceived) this.onGameStartReceived(data);
    } else if (data.type === "STATE_SYNC") {
      if (this.onStateSyncReceived) this.onStateSyncReceived(data.gameState);
    } else if (data.type === "BATTLE_START") {
      if (gameEngine.onBattleStart)
        gameEngine.onBattleStart(
          data.atk,
          data.def,
          data.atkOwner,
          data.defOwner,
        );
    } else if (data.type === "BATTLE_END") {
      if (gameEngine.onBattleEnd)
        gameEngine.onBattleEnd(data.atkRoll, data.defRoll, data.result);
    }
  }

  broadcastLobbyState(rules = null) {
    const payload = {
      type: "LOBBY_UPDATE",
      players: this.playersList,
      rules: rules || gameEngine.rules,
    };
    if (this.isBroadcastMode) {
      if (this.bc)
        this.bc.postMessage({
          senderId: this.myClientId,
          targetId: "all",
          ...payload,
        });
    } else {
      this.connections.forEach((c) => c.send(payload));
    }
    if (this.onLobbyUpdated) this.onLobbyUpdated(payload);
  }

  broadcastStartGame(rules) {
    const payload = {
      type: "START_GAME",
      playersCount: this.playersList.length,
      playerNames: this.playersList.map((p) => p.name),
      rules: rules,
    };
    if (this.isBroadcastMode) {
      if (this.bc)
        this.bc.postMessage({
          senderId: this.myClientId,
          targetId: "all",
          ...payload,
        });
    } else {
      this.connections.forEach((c) => c.send(payload));
    }
  }

  broadcastStateSync(gameState) {
    if (!this.isHost) return;
    const payload = { type: "STATE_SYNC", gameState: gameState };
    if (this.isBroadcastMode) {
      if (this.bc)
        this.bc.postMessage({
          senderId: this.myClientId,
          targetId: "all",
          ...payload,
        });
    } else {
      this.connections.forEach((c) => c.send(payload));
    }
  }

  broadcastBattleStart(atk, def, atkOwner, defOwner) {
    if (!this.isHost) return;
    const payload = {
      type: "BATTLE_START",
      atk,
      def,
      atkOwner,
      defOwner,
    };
    if (this.isBroadcastMode) {
      if (this.bc)
        this.bc.postMessage({
          senderId: this.myClientId,
          targetId: "all",
          ...payload,
        });
    } else {
      this.connections.forEach((c) => c.send(payload));
    }
  }

  broadcastBattleEnd(atkRoll, defRoll, result) {
    if (!this.isHost) return;
    const payload = { type: "BATTLE_END", atkRoll, defRoll, result };
    if (this.isBroadcastMode) {
      if (this.bc)
        this.bc.postMessage({
          senderId: this.myClientId,
          targetId: "all",
          ...payload,
        });
    } else {
      this.connections.forEach((c) => c.send(payload));
    }
  }

  sendActionToHost(action) {
    if (this.isHost) {
      if (this.onActionReceived)
        this.onActionReceived(action, this.myPlayerIndex);
    } else if (this.isBroadcastMode) {
      if (!this.connected) {
        showToast("接続が切断されています", "error");
        return;
      }
      if (this.bc) {
        this.bc.postMessage({
          senderId: this.myClientId,
          targetId: "host",
          type: "PLAYER_ACTION",
          action: action,
          playerIndex: this.myPlayerIndex,
        });
      }
    } else if (this.hostConn) {
      if (!this.connected || this.hostConn.open === false) {
        showToast("接続が切断されています", "error");
        return;
      }
      try {
        this.hostConn.send({
          type: "PLAYER_ACTION",
          action: action,
          playerIndex: this.myPlayerIndex,
        });
      } catch (error) {
        this.connected = false;
        showToast("接続が切断されています", "error");
      }
    }
  }

  disconnect() {
    if (
      this.mode === "online" &&
      !this.isHost &&
      this.hostConn &&
      this.hostConn.open
    ) {
      try {
        this.hostConn.send({
          type: "LEAVE_REQUEST",
          clientToken: this.clientToken,
        });
      } catch (e) {}
    }
    if (
      this.mode === "online" &&
      !this.isHost &&
      this.isBroadcastMode &&
      this.bc
    ) {
      try {
        this.bc.postMessage({
          senderId: this.myClientId,
          targetId: "host",
          type: "LEAVE_REQUEST",
          clientToken: this.clientToken,
        });
      } catch (e) {}
    }
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch (e) {}
      this.peer = null;
    }
    if (this.bc) {
      try {
        this.bc.close();
      } catch (e) {}
      this.bc = null;
    }
    this.connections = [];
    this.hostConn = null;
    this.isHost = false;
    this.isBroadcastMode = false;
    this.myClientId = null;
    this.myPlayerIndex = -1;
    this.playersList = [];
    this.mode = "local";
    this.connected = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
  }

  scheduleReconnect() {
    if (this.reconnectTimer || this.isHost || this.mode !== "online") return;
    if (this.reconnectAttempts >= 5) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.connected || this.mode !== "online") return;
      this.reconnectAttempts++;
      if (this.peer) {
        try {
          this.peer.destroy();
        } catch (e) {}
        this.peer = null;
      }
      this.joinRoom(this.roomId, this.clientName, (success, result) => {
        if (success) {
          this.reconnectAttempts = 0;
          showToast("ルームへ再接続しました", "info");
        } else {
          showToast(result || "再接続に失敗しました", "error");
          this.scheduleReconnect();
        }
      });
    }, 1000);
  }
}

const gameEngine = new GameEngine();
const canvasRenderer = new CanvasRenderer("gameCanvas", gameEngine);
const netManager = new P2PNetworkManager();

// Non-blocking Toast Banner Alert Helper
function showToast(msg, type = "info") {
  const banner = document.getElementById("toast-banner");
  const msgEl = document.getElementById("toast-message");
  const iconEl = document.getElementById("toast-icon");

  msgEl.innerText = msg;
  if (type === "error") {
    iconEl.className = "fa-solid fa-circle-xmark text-red-400 text-lg";
  } else if (type === "warning") {
    iconEl.className =
      "fa-solid fa-triangle-exclamation text-amber-400 text-lg";
  } else {
    iconEl.className = "fa-solid fa-circle-info text-blue-400 text-lg";
  }

  banner.classList.remove("hidden");
  setTimeout(() => banner.classList.add("hidden"), 3500);
}

// Game Engine State Change Hooks
gameEngine.onStateChange = (game) => {
  updateUIHeader(game);
  updatePlayerLeaderboard(game);

  if (
    netManager.isHost &&
    (netManager.connections.length > 0 || netManager.isBroadcastMode)
  ) {
    netManager.broadcastStateSync(game.exportState());
  }
};

gameEngine.onBattleStart = (atk, def, atkOwner, defOwner) => {
  if (netManager.isHost) {
    netManager.broadcastBattleStart(atk, def, atkOwner, defOwner);
  }

  document.getElementById("atk-player-name").innerText = atkOwner.name;
  document.getElementById("atk-player-name").style.color = atkOwner.color;
  document.getElementById("def-player-name").innerText = defOwner.name;
  document.getElementById("def-player-name").style.color = defOwner.color;

  document.getElementById("atk-dice-count").innerText = atk.dice;
  document.getElementById("def-dice-count").innerText = def.dice;
  document.getElementById("atk-score").innerText = "...";
  document.getElementById("def-score").innerText = "...";
  document.getElementById("battle-result").innerText = "";

  const modal = document.getElementById("battle-modal");
  modal.classList.remove("hidden");
  modal.classList.add("dice-roll-anim");
  setTimeout(
    () => modal.classList.remove("dice-roll-anim"),
    CONFIG.battleAnimationMs,
  );
};

gameEngine.onBattleEnd = (atkRoll, defRoll, result) => {
  if (netManager.isHost) {
    netManager.broadcastBattleEnd(atkRoll, defRoll, result);
  }

  document.getElementById("atk-score").innerText = atkRoll;
  document.getElementById("def-score").innerText = defRoll;
  const resEl = document.getElementById("battle-result");

  if (result === "win") {
    resEl.innerText = "攻撃側の勝利！";
    resEl.className = "mt-4 text-xl sm:text-2xl font-black text-emerald-400";
  } else if (result === "draw") {
    resEl.innerText = "引き分け！";
    resEl.className = "mt-4 text-xl sm:text-2xl font-black text-amber-400";
  } else {
    resEl.innerText = "防衛側の勝利！";
    resEl.className = "mt-4 text-xl sm:text-2xl font-black text-red-400";
  }

  setTimeout(() => {
    document.getElementById("battle-modal").classList.add("hidden");
  }, CONFIG.battleResultDisplayMs);
};

// UI Element Dynamic Updates
function updateUIHeader(game) {
  const statusText = document.getElementById("turn-status-text");
  const badge = document.getElementById("p2p-badge");
  const endTurnBtn = document.getElementById("end-turn-btn");

  if (game.phase === "gameover") {
    statusText.innerHTML = `<span style="color: ${game.winner.color}">${game.winner.name} の全滅勝利！</span>`;
    endTurnBtn.classList.add("hidden");
    return;
  }

  const currPlayer = game.players[game.currentPlayerIndex];
  const isMyTurn =
    netManager.mode === "local" ||
    (netManager.connected &&
      netManager.myPlayerIndex === game.currentPlayerIndex);

  statusText.innerHTML = `<span style="color: ${currPlayer.color}">${currPlayer.name} のターン</span>`;

  if (netManager.myPlayerIndex !== -1) {
    badge.classList.remove("hidden");
    let modeType = netManager.isBroadcastMode ? "タブ同期" : "P2P";
    let roleStr = netManager.isHost
      ? `${modeType} ホスト`
      : `${modeType} (P${netManager.myPlayerIndex + 1})`;
    document.getElementById("p2p-role-text").innerText = roleStr;
  } else {
    badge.classList.add("hidden");
  }

  if (isMyTurn && game.phase === "playing") {
    endTurnBtn.classList.remove("hidden");
    endTurnBtn.disabled = false;
    endTurnBtn.classList.add("pulse-glow");
  } else {
    endTurnBtn.classList.add("hidden");
    endTurnBtn.disabled = true;
    endTurnBtn.classList.remove("pulse-glow");
  }
}

function updatePlayerLeaderboard(game) {
  const statsContainer = document.getElementById("player-stats");
  statsContainer.innerHTML = "";

  game.players.forEach((p) => {
    const owned = game.getOwnedTerritories(p.id);
    if (!owned.length) return;

    const maxConn = game.getMaxConnected(p.id);
    const totalDice = owned.reduce((acc, t) => acc + t.dice, 0);
    const isCurrent = p.id === game.currentPlayerIndex;
    const isMe = netManager.myPlayerIndex === p.id;

    const row = document.createElement("div");
    row.className = `flex justify-between items-center gap-2 p-2 rounded-xl border transition ${isCurrent ? "bg-slate-800/90 border-amber-400/60 shadow-md" : "bg-slate-950/40 border-slate-800 opacity-80"}`;

    let badges = "";
    if (isMe) {
      badges += `<span class="bg-amber-400 text-slate-950 text-[10px] font-black px-1.5 py-0.5 rounded ml-1">You</span>`;
    }
    if (game.rules.greatPower && maxConn >= game.rules.greatPowerThreshold) {
      badges += `<span class="bg-red-900/80 text-red-200 text-[10px] px-1.5 py-0.5 rounded border border-red-700 ml-1">大国</span>`;
    }
    if (
      game.rules.smallCountryBonus &&
      maxConn <= game.rules.smallCountryThreshold
    ) {
      badges += `<span class="bg-blue-900/80 text-blue-200 text-[10px] px-1.5 py-0.5 rounded border border-blue-700 ml-1">小国</span>`;
    }

    row.innerHTML = `
            <div class="flex items-center gap-1.5 truncate">
                <span class="w-3 h-3 rounded-full shrink-0 shadow-sm" style="background-color: ${p.color}"></span>
                <span class="truncate font-bold text-xs" style="color: ${p.color}">${p.name}</span>
                ${badges}
            </div>
            <div class="text-right shrink-0">
                <span class="text-xs text-slate-200 font-bold">最大接続: <strong>${maxConn}</strong></span>
                <span class="text-[10px] text-slate-400 block">(${owned.length} 領土 / 🎲${totalDice})</span>
            </div>
        `;
    statsContainer.appendChild(row);
  });
}

let dragStart = { x: 0, y: 0 },
  lastTouch = { x: 0, y: 0 },
  isDragging = false,
  touchTime = 0;
const canvas = document.getElementById("gameCanvas");

const getPointerPos = (e) => ({
  x: e.touches ? e.touches[0].clientX : e.clientX,
  y: e.touches ? e.touches[0].clientY : e.clientY,
});

const onPointerDown = (e) => {
  if (e.type === "touchstart") touchTime = Date.now();
  else if (e.type === "mousedown" && Date.now() - touchTime < 500) return;

  if (gameEngine.phase === "playing") {
    dragStart = getPointerPos(e);
    lastTouch = getPointerPos(e);
    isDragging = true;
  }
};

const onPointerMove = (e) => {
  if (!isDragging || gameEngine.phase !== "playing" || !canvasRenderer.canDrag)
    return;
  if (e.type === "touchmove") e.preventDefault();

  let pos = getPointerPos(e);
  canvasRenderer.camera.x += pos.x - lastTouch.x;
  canvasRenderer.camera.y += pos.y - lastTouch.y;
  lastTouch = pos;
};

const onPointerUp = (e) => {
  if (!isDragging) return;
  isDragging = false;
  if (gameEngine.phase !== "playing") return;

  let pos = e.changedTouches
    ? { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY }
    : getPointerPos(e);
  if (
    Math.hypot(pos.x - dragStart.x, pos.y - dragStart.y) < CONFIG.clickTolerance
  ) {
    let hex = pixelToHex(
      pos.x - canvasRenderer.camera.x,
      (pos.y - canvasRenderer.camera.y) / CONFIG.yScale,
      CONFIG.hexSize,
    );
    if (
      hex.col >= 0 &&
      hex.col < CONFIG.gridWidth &&
      hex.row >= 0 &&
      hex.row < CONFIG.gridHeight &&
      gameEngine.hexGrid[hex.col]
    ) {
      let activeHex = gameEngine.hexGrid[hex.col][hex.row];
      if (activeHex && activeHex.active) {
        if (
          netManager.myPlayerIndex === -1 ||
          netManager.myPlayerIndex === gameEngine.currentPlayerIndex
        ) {
          dispatchAction({
            type: "CLICK_HEX",
            territoryId: activeHex.territoryId,
          });
        } else {
          showToast("相手のターンです", "warning");
        }
      }
    }
  }
};

canvas.addEventListener("mousedown", onPointerDown);
canvas.addEventListener("mousemove", onPointerMove);
window.addEventListener("mouseup", onPointerUp);
canvas.addEventListener("touchstart", onPointerDown, { passive: false });
canvas.addEventListener("touchmove", onPointerMove, { passive: false });
window.addEventListener("touchend", onPointerUp, { passive: false });

netManager.onActionReceived = (action, playerIndex) => {
  if (action.type === "CLICK_HEX") {
    gameEngine.handleTerritoryClick(action.territoryId, playerIndex);
  } else if (action.type === "END_TURN") {
    gameEngine.endTurn(playerIndex);
  }
};

netManager.onStateSyncReceived = (state) => {
  gameEngine.importState(state);
};

function dispatchAction(action) {
  if (netManager.mode === "local") {
    netManager.onActionReceived(action, gameEngine.currentPlayerIndex);
    return;
  }
  if (!netManager.connected) {
    showToast("接続が切断されています。再接続を待っています", "warning");
    return;
  }
  netManager.sendActionToHost(action);
}

// Mode Selection Event Listeners
document.getElementById("start-local-btn").addEventListener("click", () => {
  document.getElementById("local-player-modal").classList.remove("hidden");
});

document.getElementById("cancel-local-btn").addEventListener("click", () => {
  document.getElementById("local-player-modal").classList.add("hidden");
});

document.querySelectorAll(".local-player-select-btn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    let count = parseInt(e.target.dataset.players, 10);
    let rules = getSelectedRulesFromUI();

    netManager.disconnect();
    gameEngine.startGame(count, rules);

    document.getElementById("mode-select-screen").classList.add("hidden");
    document.getElementById("local-player-modal").classList.add("hidden");
    showGameUI();
    canvasRenderer.start();
  });
});

document.getElementById("start-online-btn").addEventListener("click", () => {
  document.getElementById("mode-select-screen").classList.add("hidden");
  document.getElementById("online-lobby-screen").classList.remove("hidden");
});

document.getElementById("back-to-mode-btn").addEventListener("click", () => {
  netManager.disconnect();
  document.getElementById("online-lobby-screen").classList.add("hidden");
  document.getElementById("mode-select-screen").classList.remove("hidden");
});

document.getElementById("create-room-btn").addEventListener("click", () => {
  const nickName =
    document.getElementById("player-nickname-input").value.trim() || "ホスト";
  netManager.createRoom(nickName, (success, code) => {
    if (success) {
      document.getElementById("lobby-connect-section").classList.add("hidden");
      document
        .getElementById("lobby-active-section")
        .classList.remove("hidden");
      document.getElementById("room-code-display").innerText = code;
      document.getElementById("host-lobby-controls").classList.remove("hidden");
      document.getElementById("client-lobby-controls").classList.add("hidden");
      document.getElementById("lobby-role-badge").innerText = "ホスト";

      updateLobbyPlayerList(netManager.playersList);
      showToast(`ルーム ${code} を作成しました`);
    }
  });
});

document.getElementById("join-room-btn").addEventListener("click", () => {
  const code = document.getElementById("room-code-input").value.trim();
  const nickName =
    document.getElementById("player-nickname-input").value.trim() || "ゲスト";
  if (!code || code.length < 4) {
    showToast("有効なルームコードを入力してください", "warning");
    return;
  }

  netManager.joinRoom(code, nickName, (success, resCode) => {
    if (success) {
      document.getElementById("lobby-connect-section").classList.add("hidden");
      document
        .getElementById("lobby-active-section")
        .classList.remove("hidden");
      document.getElementById("room-code-display").innerText = resCode;
      document.getElementById("host-lobby-controls").classList.add("hidden");
      document
        .getElementById("client-lobby-controls")
        .classList.remove("hidden");
      document.getElementById("lobby-role-badge").innerText =
        `ゲスト (P${netManager.myPlayerIndex + 1})`;
    } else {
      showToast(resCode || "ルーム接続に失敗しました", "error");
    }
  });
});

document.getElementById("copy-room-code-btn").addEventListener("click", () => {
  const code = document.getElementById("room-code-display").innerText;
  const tempInput = document.createElement("input");
  tempInput.value = code;
  document.body.appendChild(tempInput);
  tempInput.select();
  document.execCommand("copy");
  document.body.removeChild(tempInput);
  showToast("ルームコードをクリップボードにコピーしました！");
});

document.getElementById("leave-lobby-btn").addEventListener("click", () => {
  netManager.disconnect();
  document.getElementById("lobby-active-section").classList.add("hidden");
  document.getElementById("lobby-connect-section").classList.remove("hidden");
});

netManager.onLobbyUpdated = (data) => {
  updateLobbyPlayerList(data.players);
};

netManager.onGameStartReceived = (data) => {
  document.getElementById("online-lobby-screen").classList.add("hidden");
  showGameUI();
  canvasRenderer.resize();
  canvasRenderer.start();
};

netManager.onStateSyncReceived = (state) => {
  gameEngine.importState(state);
  canvasRenderer.resize();
};

function updateLobbyPlayerList(players) {
  const listEl = document.getElementById("lobby-player-list");
  listEl.innerHTML = "";
  document.getElementById("connected-count").innerText = players.length;

  players.forEach((p, idx) => {
    const item = document.createElement("div");
    item.className =
      "flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800";
    item.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="w-4 h-4 rounded-full shadow-sm" style="background-color: ${CONFIG.colors[idx]}"></span>
                <span class="text-sm font-bold text-white">${p.name} ${idx === 0 ? "(ホスト)" : ""}</span>
            </div>
            <span class="text-xs bg-slate-800 text-slate-300 px-2.5 py-1 rounded-md font-mono font-bold">P${idx + 1}</span>
        `;
    listEl.appendChild(item);
  });

  const startBtn = document.getElementById("start-online-game-btn");
  if (startBtn) {
    startBtn.disabled = players.length < 2;
  }
}

// Host Online Game Start Event
document
  .getElementById("start-online-game-btn")
  .addEventListener("click", () => {
    if (netManager.playersList.length < 2) {
      showToast("対戦開始には最低2名の参加が必要です", "warning");
      return;
    }

    let rules = getSelectedRulesFromUI();
    netManager.broadcastStartGame(rules);
    gameEngine.startGame(
      netManager.playersList.length,
      rules,
      netManager.playersList.map((p) => p.name),
    );

    document.getElementById("online-lobby-screen").classList.add("hidden");
    showGameUI();
    canvasRenderer.start();
  });

document.getElementById("end-turn-btn").addEventListener("click", () => {
  dispatchAction({ type: "END_TURN" });
});

document.getElementById("quit-game-btn").addEventListener("click", () => {
  document.getElementById("quit-modal").classList.remove("hidden");
});

document.getElementById("confirm-quit-btn").addEventListener("click", () => {
  netManager.disconnect();
  document.getElementById("quit-modal").classList.add("hidden");
  hideGameUI();
  document.getElementById("mode-select-screen").classList.remove("hidden");
});

document.getElementById("cancel-quit-btn").addEventListener("click", () => {
  document.getElementById("quit-modal").classList.add("hidden");
});

// Rules Settings Helper Functions
function getSelectedRulesFromUI() {
  let rules = {};
  document
    .querySelectorAll(".rule-toggle")
    .forEach((el) => (rules[el.dataset.rule] = el.checked));
  rules.greatPowerThreshold =
    parseInt(document.getElementById("great-power-threshold").value, 10) || 16;
  rules.smallCountryThreshold =
    parseInt(document.getElementById("small-country-threshold").value, 10) || 5;
  return rules;
}

function syncRulesToUI(rules) {
  if (!rules) return;
  document.querySelectorAll(".rule-toggle").forEach((el) => {
    const key = el.dataset.rule;
    if (key in rules) el.checked = rules[key];
  });
  if (rules.greatPowerThreshold !== undefined) {
    document.getElementById("great-power-threshold").value =
      rules.greatPowerThreshold;
  }
  if (rules.smallCountryThreshold !== undefined) {
    document.getElementById("small-country-threshold").value =
      rules.smallCountryThreshold;
  }
}

function openSettingsModal(readOnly = false) {
  // Sync UI controls with current engine rules
  syncRulesToUI(gameEngine.rules);

  const noticeEl = document.getElementById("settings-readonly-notice");
  const titleText = document.getElementById("settings-title-text");

  if (readOnly) {
    noticeEl.classList.remove("hidden");
    titleText.innerText = "ルール確認";
  } else {
    noticeEl.classList.add("hidden");
    titleText.innerText = "ローカルルール設定";
  }

  // Toggle disabled state for form elements
  document
    .querySelectorAll(
      ".rule-toggle, #great-power-threshold, #small-country-threshold",
    )
    .forEach((input) => {
      input.disabled = readOnly;
      if (readOnly) {
        input.classList.add("opacity-60", "cursor-not-allowed");
      } else {
        input.classList.remove("opacity-60", "cursor-not-allowed");
      }
    });

  document.getElementById("settings-modal").classList.remove("hidden");
}

document
  .getElementById("open-local-settings-btn")
  .addEventListener("click", () => {
    openSettingsModal(false);
  });
document
  .getElementById("open-lobby-rules-btn")
  .addEventListener("click", () => {
    // Only Host can modify rules in online lobby
    openSettingsModal(!netManager.isHost);
  });
document
  .getElementById("in-game-settings-btn")
  .addEventListener("click", () => {
    // Game in progress -> Always Read-Only
    openSettingsModal(true);
  });
document.getElementById("close-settings-btn").addEventListener("click", () => {
  // Save updated rules only if editable and before game starts
  const thresholdInput = document.getElementById("great-power-threshold");
  if (!thresholdInput.disabled) {
    gameEngine.rules = {
      ...gameEngine.rules,
      ...getSelectedRulesFromUI(),
    };
    if (netManager.isHost && netManager.playersList.length > 0) {
      netManager.broadcastLobbyState();
    }
  }
  document.getElementById("settings-modal").classList.add("hidden");
});

function showGameUI() {
  document.getElementById("in-game-settings-btn").classList.remove("hidden");
  document.getElementById("quit-game-btn").classList.remove("hidden");
}

function hideGameUI() {
  document.getElementById("in-game-settings-btn").classList.add("hidden");
  document.getElementById("quit-game-btn").classList.add("hidden");
  document.getElementById("end-turn-btn").classList.add("hidden");
}
