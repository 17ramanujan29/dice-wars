import { PeerNetwork } from "../network/PeerNetwork.js";

export class OnlineGameSession {
  constructor(game) {
    this.game = game;
    this.network = new PeerNetwork();
    this.role = null;
    this.localPlayerId = null;
    this.roomId = "";
    this.players = [];
    this.rules = {};
    this.gameStarted = false;
    this.ended = true;
    this.hostPeerId = null;
    this.autoReconnect = null;
    this.onLobbyChange = null;
    this.onGameStart = null;
    this.onBattleStart = null;
    this.onBattleEnd = null;
    this.onSessionEnd = null;
    this.onError = null;

    this.network.onMessage = (message, peerId) =>
      this.handleMessage(message, peerId);
    this.network.onConnectionClosed = () => {
      if (this.ended || this.gameStarted) {
        this.end("接続が切断されたため、オンラインゲームを終了しました。");
      } else {
        this.startAutoReconnect();
      }
    };
    this.network.onError = (error) =>
      this.fail(error.message || "PeerJS接続に失敗しました。");
  }

  async createRoom(name) {
    this.ended = false;
    this.gameStarted = false;
    this.role = "host";
    this.players = [{ id: 0, name: name || "Player 1" }];
    this.localPlayerId = 0;
    this.roomId = await this.network.createHost();
    this.players[0].peerId = this.network.peer.id;
    
    // 自動再接続の設定（ホストの場合は部屋コードを使用）
    this.network.getAutoReconnectManager().startReconnect(
      this.roomId,
      true
    );
    
    this.emitLobby();
  }

  async joinRoom(roomId, name) {
    this.ended = false;
    this.gameStarted = false;
    this.role = "guest";
    this.localPlayerId = null;
    this.hostPeerId = null;
    try {
      await this.network.joinHost(roomId.trim());
      this.hostPeerId = this.network.hostConnection.peer;

      this.network
        .send({ type: "join-request", name: name || "Player" })
        .catch((err) => console.warn("Failed to send join-request:", err));

    } catch (error) {
      this.network.close();
      this.ended = true;
      this.role = null;
      throw error;
    }
  }

  setRoomSettings(rules) {
    if (this.role !== "host") return;
    this.rules = { ...rules };
    this.emitLobby();
  }

  async startGame() {
    if (
      this.role !== "host" ||
      this.players.length < 2 ||
      this.players.length > 4
    )
      return;

    this.gameStarted = true;

    // プレイヤーをシャッフルしてIDを再割り当て
    const shuffledPlayers = [...this.players];
    for (let index = shuffledPlayers.length - 1; index > 0; index--) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [shuffledPlayers[index], shuffledPlayers[randomIndex]] = [
        shuffledPlayers[randomIndex],
        shuffledPlayers[index],
      ];
    }
    this.players = shuffledPlayers.map((player, index) => ({
      ...player,
      id: index,
    }));

    this.localPlayerId = this.players.find(
      (player) => player.peerId === this.network.peer.id,
    ).id;

    const playerNames = this.players.map((player) => player.name);
    this.game.startGame(this.players.length, this.rules, playerNames);

    const snapshot = this.game.createSnapshot();
    const playerIds = Object.fromEntries(
      this.players.map((player) => [player.peerId, player.id]),
    );

    try {
      await this.network.send({ type: "game-start", snapshot, playerIds });
      this.onGameStart?.(this.game);
    } catch (error) {
      console.error("Failed to send game-start message:", error);
      this.fail("ゲーム開始メッセージの送信に失敗しました。");
    }
  }

  requestTerritoryClick(territoryId) {
    if (this.role === "host") {
      if (this.game.currentPlayerIndex === this.localPlayerId)
        this.game.handleTerritoryClick(territoryId);
      return;
    }
    this.network.send({
      type: "action-request",
      action: "territory-click",
      territoryId,
    });
  }

  requestEndTurn() {
    if (this.role === "host") {
      if (this.game.currentPlayerIndex === this.localPlayerId)
        this.game.endTurn();
      return;
    }
    this.network.send({ type: "action-request", action: "end-turn" });
  }

  async broadcastState() {
    if (this.role !== "host") return;
    try {
      await this.network.send({
        type: "state-sync",
        snapshot: this.game.createSnapshot(),
      });
    } catch (error) {
      console.error("Failed to broadcast state:", error);
    }
  }

  handleMessage(message, peerId) {
    if (this.role === "host") {
      if (message.type === "join-request") {
        this.acceptPlayer(message.name, peerId);
      } else if (message.type === "action-request") {
        this.handleAction(message, peerId);
      }
      return;
    }

    switch (message.type) {
      case "join-accepted":
        this.localPlayerId = message.playerId;
        this.players = message.players;
        this.emitLobby();
        break;
      case "lobby-state":
        this.players = message.players;
        this.rules = message.rules;
        this.emitLobby();
        break;
      case "game-start":
        // スナップショットを先に適用してからUIを切り替える
        this.game.applySnapshot(message.snapshot);
        this.localPlayerId = message.playerIds[this.network.peer.id];
        this.onGameStart?.(this.game);
        break;
      case "state-sync":
        this.game.applySnapshot(message.snapshot);
        break;
      case "battle-start":
        this.onBattleStart?.(message);
        break;
      case "battle-end":
        this.onBattleEnd?.(message);
        break;
      case "session-ended":
        this.end(message.reason);
        break;
    }
  }

  acceptPlayer(name, peerId) {
    if (this.gameStarted || this.players.length >= 4) return;
    const player = {
      id: this.players.length,
      name: name || `Player ${this.players.length + 1}`,
      peerId,
    };
    this.players.push(player);
    this.network.send(
      {
        type: "join-accepted",
        playerId: player.id,
        players: this.players.map(
          ({ peerId: _, ...publicPlayer }) => publicPlayer,
        ),
      },
      peerId,
    );
    this.emitLobby();
  }

  handleAction(message, peerId) {
    const player = this.players.find(
      (candidate) => candidate.peerId === peerId,
    );
    if (
      !player ||
      this.game.phase !== "playing" ||
      this.game.currentPlayerIndex !== player.id
    )
      return;
    if (message.action === "territory-click")
      this.game.handleTerritoryClick(message.territoryId);
    if (message.action === "end-turn") this.game.endTurn();
  }

  emitLobby() {
    const players = this.players.map(({ peerId: _, ...player }) => player);
    const lobby = {
      type: "lobby-state",
      players,
      rules: this.rules,
    };

    if (this.role === "host") {
      // ゲストがいない状態での放送は送信せず、失敗もさせない
      if (this.network.connections.size > 0) {
        this.network
          .send(lobby)
          .catch((err) => console.warn("Lobby broadcast failed:", err));
      }
    }

    this.onLobbyChange?.({
      roomId: this.roomId,
      role: this.role,
      players,
      rules: this.rules,
    });
  }

  startAutoReconnect() {
    const reconnectManager = this.network.getAutoReconnectManager();
    if (this.role === "host") {
      reconnectManager.startReconnect(this.roomId, true);
    } else if (this.role === "guest" && this.hostPeerId) {
      reconnectManager.startReconnect(this.hostPeerId, false);
    }
  }

  fail(message) {
    this.onError?.(message);
    this.end(message, false);
  }

  end(reason = "オンラインセッションを終了しました。", notify = true) {
    if (this.ended) return;
    this.ended = true;
    if (notify) this.network.send({ type: "session-ended", reason });
    this.network.close();
    this.onSessionEnd?.(reason);
  }
}
