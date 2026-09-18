import { Peer } from "peerjs";

/**
 * シーケンス番号生成ユーティリティ
 */
const createSequenceGenerator = () => {
  let sequence = 0;
  return () => ++sequence;
};

/**
 * 指数バックオフユーティリティ
 */
const createExponentialBackoff = (options = {}) => {
  const {
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    multiplier = 2,
    maxAttempts = 5
  } = options;
  let attempt = 0;
  return {
    nextDelay() {
      const delay = Math.min(
        initialDelayMs * Math.pow(multiplier, attempt),
        maxDelayMs
      );
      attempt++;
      return delay;
    },
    reset() {
      attempt = 0;
    },
    getAttemptCount() {
      return attempt;
    }
  };
};

/**
 * 自動再接続を管理するクラス
 */
class AutoReconnectManager {
  constructor(peerNetwork, options = {}) {
    this.peerNetwork = peerNetwork;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5;
    this.initialDelayMs = options.initialDelayMs ?? 1000;
    this.maxDelayMs = options.maxDelayMs ?? 30000;
    this.multiplier = options.multiplier ?? 2;
    this.onReconnected = null;
    this.onReconnectFailed = null;
    this.onReconnectAttempt = null;
    this.isReconnecting = false;
    this.currentRoomCode = null;
    this.currentHostId = null;
    this.isHost = false;
    this.backoff = createExponentialBackoff({
      initialDelayMs: this.initialDelayMs,
      maxDelayMs: this.maxDelayMs,
      multiplier: this.multiplier,
      maxAttempts: this.maxReconnectAttempts
    });
    this.currentDelayMs = this.initialDelayMs;
  }

  /**
   * 自動再接続を開始
   * @param {string} roomCodeOrHostId - ホストの場合は部屋コード、ゲストの場合はホストID
   * @param {boolean} isHost - ホストかどうか
   */
  startReconnect(roomCodeOrHostId, isHost) {
    if (this.isReconnecting) {
      this.stopReconnect();
    }

    this.currentRoomCode = isHost ? roomCodeOrHostId : null;
    this.currentHostId = !isHost ? roomCodeOrHostId : null;
    this.isHost = isHost;
    this.isReconnecting = true;
    this.backoff.reset();
    this.currentDelayMs = this.initialDelayMs;
    this._scheduleNextReconnect();
  }

  /**
   * 遅延後に再接続を試みる
   */
  _scheduleNextReconnect() {
    if (!this.isReconnecting) return;

    const attempt = this.backoff.getAttemptCount();
    const maxAttempts = this.maxReconnectAttempts;

    if (attempt >= maxAttempts) {
      this.isReconnecting = false;
      if (this.onReconnectFailed) {
        this.onReconnectFailed();
      }
      return;
    }

    this.currentDelayMs = this.backoff.nextDelay();

    if (this.onReconnectAttempt) {
      this.onReconnectAttempt(attempt + 1, maxAttempts, this.currentDelayMs);
    }

    setTimeout(() => {
      this._attemptReconnect();
    }, this.currentDelayMs);
  }

  /**
   * 再接続を試みる
   */
  async _attemptReconnect() {
    if (!this.isReconnecting) return;

    try {
      if (this.isHost) {
        await this.peerNetwork.recreateHost(this.currentRoomCode);
      } else {
        await this.peerNetwork.recreateConnection(this.currentHostId);
      }
      this.isReconnecting = false;
      this.backoff.reset();
      if (this.onReconnected) {
        this.onReconnected();
      }
    } catch (error) {
      console.warn(
        `再接続試行 ${attempt + 1}/${this.maxReconnectAttempts}失敗:`,
        error
      );
      this._scheduleNextReconnect();
    }
  }

  /**
   * 再接続を停止
   */
  stopReconnect() {
    this.isReconnecting = false;
    this.currentRoomCode = null;
    this.currentHostId = null;
    this.backoff.reset();
  }

  /**
   * 再接続中かどうか
   */
  getIsReconnecting() {
    return this.isReconnecting;
  }
}
 /** 自動再接続を管理するクラス
 */


const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class PeerNetwork {
  constructor() {
    this.peer = null;
    this.connections = new Map();
    this.hostConnection = null;
    this.sequenceGenerator = createSequenceGenerator();
    this.autoReconnectManager = new AutoReconnectManager(this);
    this.isReconnecting = false;

    this.onOpen = null;
    this.onMessage = null;
    this.onConnectionClosed = null;
    this.onJoinError = null;
    this.onError = null;

    // メッセージタイプごとの最後のシーケンス番号
    this.lastSequenceByMessageType = new Map();
  }

  createHost(roomCode = null) {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const openPeer = () => {
        const code = roomCode || String(Math.floor(100000 + Math.random() * 900000));
        this.peer = new Peer(code);
        this.peer.on("open", (id) => {
          if (this.onOpen) this.onOpen(id);
          resolve(id);
        });
        this.peer.on("connection", (connection) =>
          this.acceptConnection(connection),
        );
        this.peer.on("error", (error) => {
          if (error.type === "unavailable-id" && attempts < 5) {
            attempts++;
            this.peer.destroy();
            openPeer();
            return;
          }
          if (this.onError) this.onError(error);
          reject(error);
        });
      };
      openPeer();
    });
  }

  reconnectAsHost(roomCode) {
    this.close();
    return this.createHost(roomCode);
  }

  reconnectAsGuest(hostId) {
    this.close();
    return this.joinHost(hostId);
  }

  /**
   * 同じ部屋コードでホストを再作成
   * @param {string} roomCode - 部屋コード
   * @returns {Promise<string>} - ピアID
   */
  async recreateHost(roomCode) {
    this.close();
    return new Promise((resolve, reject) => {
      this.peer = new Peer(roomCode);
      this.peer.on("open", (id) => {
        if (this.onOpen) this.onOpen(id);
        resolve(id);
      });
      this.peer.on("connection", (connection) =>
        this.acceptConnection(connection)
      );
      this.peer.on("error", (error) => {
        if (this.onError) this.onError(error);
        reject(error);
      });
    });
  }

  /**
   * 同じホストに再接続
   * @param {string} hostId - ホストピアID
   * @returns {Promise<string>} - ピアID
   */
  async recreateConnection(hostId) {
    this.close();
    return new Promise((resolve, reject) => {
      this.peer = new Peer();
      this.peer.on("open", () => {
        const connection = this.peer.connect(hostId, { reliable: true });
        this.hostConnection = connection;
        this.bindConnection(
          connection,
          (peerId) => {
            resolve(peerId);
          },
          reject
        );
      });
      this.peer.on("error", (error) => {
        if (this.onError) this.onError(error);
        reject(error);
      });
    });
  }

  acceptConnection(connection) {
    this.bindConnection(connection);
  }

  bindConnection(connection, onOpen, onJoinError = null) {
    connection.on("open", () => {
      this.connections.set(connection.peer, connection);
      if (onOpen) onOpen(connection.peer);
    });
    connection.on("data", (data) => {
      // シーケンス番号付きメッセージの場合は順序チェック
      if (data && data.type && this.shouldProcessMessage(data)) {
        if (this.onMessage) this.onMessage(data, connection.peer);
      } else if (data && data.type) {
        // シーケンス番号なしのメッセージ（後方互換性）
        if (this.onMessage) this.onMessage(data, connection.peer);
      }
    });
    connection.on("close", () => {
      this.connections.delete(connection.peer);
      if (this.onConnectionClosed) this.onConnectionClosed(connection.peer);
    });
    connection.on("error", (error) => {
      if (connection === this.hostConnection && !connection.open) {
        if (onJoinError) onJoinError(error);
        if (this.onJoinError) this.onJoinError(error);
        return;
      }
      if (this.onError) this.onError(error);
    });
  }

  /**
   * AutoReconnectManagerインスタンスを取得
   * @returns {AutoReconnectManager}
   */
  getAutoReconnectManager() {
    if (!this.autoReconnectManager) {
      this.autoReconnectManager = new AutoReconnectManager(this);
    }
    return this.autoReconnectManager;
  }

  close() {
    this.connections.forEach((connection) => connection.close());
    this.connections.clear();
    if (this.hostConnection) this.hostConnection.close();
    if (this.peer) this.peer.destroy();
    this.hostConnection = null;
    this.peer = null;
  }

  broadcast(message, peerId = null) {
    return new Promise((resolve, reject) => {
      if (peerId !== null) {
        const connection = this.connections.get(peerId);
        if (!connection || !connection.open) {
          reject(new Error(`Connection to peer ${peerId} not available`));
          return;
        }
        try {
          connection.send(message);
          resolve();
        } catch (err) {
          reject(err);
        }
        return;
      }

      // 放送: 接続が 0 件でも成功扱いにする
      for (const connection of this.connections.values()) {
        if (connection.open) {
          try {
            connection.send(message);
          } catch (err) {
            // 個別の送信失敗は放送全体としては成功扱いにする
          }
        }
      }
      resolve();
    });
  }

  async recreateHost(roomCode) {
    this.close();
    return new Promise((resolve, reject) => {
      this.peer = new Peer(roomCode);
      this.peer.on('open', (id) => {
        if (this.onOpen) this.onOpen(id);
        resolve(id);
      });
      this.peer.on('connection', (connection) =>
        this.acceptConnection(connection)
      );
      this.peer.on('error', (error) => {
        if (this.onError) this.onError(error);
        reject(error);
      });
    });
  }

  /**
   * 同じホストに再接続
   * @param {string} hostId - ホストピアID
   * @returns {Promise<string>} - ピアID
   */
  async recreateConnection(hostId) {
    this.close();
    return new Promise((resolve, reject) => {
      this.peer = new Peer();
      this.peer.on('open', () => {
        const connection = this.peer.connect(hostId, { reliable: true });
        this.hostConnection = connection;
        this.bindConnection(
          connection,
          (peerId) => {
            resolve(peerId);
          },
          reject
        );
      });
      this.peer.on('error', (error) => {
        if (this.onError) this.onError(error);
        reject(error);
      });
    });
  }
}