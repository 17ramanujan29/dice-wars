import { Peer } from "peerjs";

export class PeerNetwork {
  constructor() {
    this.peer = null;
    this.connections = new Map();
    this.hostConnection = null;
    this.onOpen = null;
    this.onMessage = null;
    this.onConnectionClosed = null;
    this.onJoinError = null;
    this.onError = null;
  }

  createHost() {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const openPeer = () => {
        const roomCode = String(Math.floor(100000 + Math.random() * 900000));
        this.peer = new Peer(roomCode);
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

  joinHost(hostId) {
    return new Promise((resolve, reject) => {
      let connectionEstablished = false;
      this.peer = new Peer();
      this.peer.on("open", () => {
        const connection = this.peer.connect(hostId, { reliable: true });
        this.hostConnection = connection;
        this.bindConnection(
          connection,
          (peerId) => {
            connectionEstablished = true;
            resolve(peerId);
          },
          reject,
        );
      });
      this.peer.on("error", (error) => {
        if (!connectionEstablished) {
          reject(error);
          return;
        }
        if (this.onError) this.onError(error);
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
      if (this.onMessage) this.onMessage(data, connection.peer);
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

  send(message, peerId = null) {
    if (peerId) {
      const connection = this.connections.get(peerId);
      if (connection && connection.open) connection.send(message);
      return;
    }

    this.connections.forEach((connection) => {
      if (connection.open) connection.send(message);
    });
  }

  close() {
    this.connections.forEach((connection) => connection.close());
    this.connections.clear();
    if (this.hostConnection) this.hostConnection.close();
    if (this.peer) this.peer.destroy();
    this.hostConnection = null;
    this.peer = null;
  }
}
