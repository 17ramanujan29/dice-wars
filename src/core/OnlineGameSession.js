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
    this.onLobbyChange = null;
    this.onGameStart = null;
    this.onBattleStart = null;
    this.onBattleEnd = null;
    this.onSessionEnd = null;
    this.onError = null;

    this.network.onMessage = (message, peerId) =>
      this.handleMessage(message, peerId);
    this.network.onConnectionClosed = () =>
      this.end("接続が切断されたため、オンラインゲームを終了しました。");
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
    this.emitLobby();
  }

  async joinRoom(roomId, name) {
    this.ended = false;
    this.gameStarted = false;
    this.role = "guest";
    this.localPlayerId = null;
    try {
      await this.network.joinHost(roomId.trim());
      this.network.send({ type: "join-request", name: name || "Player" });
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

  startGame() {
    if (
      this.role !== "host" ||
      this.players.length < 2 ||
      this.players.length > 4
    )
      return;
    this.gameStarted = true;
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
    this.network.send({ type: "game-start", snapshot, playerIds });
    this.onGameStart?.(this.game);
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

  broadcastState() {
    if (this.role === "host")
      this.network.send({
        type: "state-sync",
        snapshot: this.game.createSnapshot(),
      });
  }

  handleMessage(message, peerId) {
    if (this.role === "host") {
      if (message.type === "join-request")
        this.acceptPlayer(message.name, peerId);
      if (message.type === "action-request") this.handleAction(message, peerId);
      return;
    }

    if (message.type === "join-accepted") {
      this.localPlayerId = message.playerId;
      this.players = message.players;
      this.emitLobby();
    } else if (message.type === "lobby-state") {
      this.players = message.players;
      this.rules = message.rules;
      this.emitLobby();
    } else if (message.type === "game-start") {
      if (message.type === "game-start") {
        this.localPlayerId = message.playerIds[this.network.peer.id];
      }
      // UIをゲームモードに切り替えてからスナップショットを適用
      // これによりonStateChangeのコールバック時にUIが正しく表示される
      if (message.type === "game-start") this.onGameStart?.(this.game);
      this.game.applySnapshot(message.snapshot);
    } else if (message.type === "state-sync") {
      this.game.applySnapshot(message.snapshot);
    } else if (message.type === "battle-start") {
      this.onBattleStart?.(message);
    } else if (message.type === "battle-end") {
      this.onBattleEnd?.(message);
    } else if (message.type === "session-ended") {
      this.end(message.reason);
    }
  }

  acceptPlayer(name, peerId) {
    const existingPlayer = this.players.find(
      (player) => player.peerId === peerId,
    );
    if (existingPlayer) {
      this.network.send(
        {
          type: "join-accepted",
          playerId: existingPlayer.id,
          players: this.players.map(
            ({ peerId: _, ...publicPlayer }) => publicPlayer,
          ),
        },
        peerId,
      );
      return;
    }

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
    if (this.role === "host") this.network.send(lobby);
    this.onLobbyChange?.({
      roomId: this.roomId,
      role: this.role,
      players,
      rules: this.rules,
    });
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
