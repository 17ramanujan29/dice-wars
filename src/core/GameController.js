import { CONFIG } from "../config.js";
import { Player } from "../models/Player.js";
import { MapGenerator } from "./MapGenerator.js";
import { getAdjacentHexes } from "../utils/hexUtils.js";

class GameEngine {
  constructor() {
    this.players = [];
    this.territories = [];
    this.hexGrid = [];
    this.currentPlayerIndex = 0;
    this.selectedTerritoryId = null;
    this.phase = "start"; // 'start', 'playing', 'battling', 'gameover'
    this.rules = {
      greatPower: true,
      latterBonusDice: true,
      smallCountryBonus: true,
      greatPowerThreshold: 16,
      smallCountryThreshold: 5,
    };
    this.winner = null;

    // Callbacks
    this.onStateChange = null;
    this.onBattleStart = null;
    this.onBattleEnd = null;
  }

  startGame(playerCount, rules, playerNames = null) {
    this.rules = { ...this.rules, ...rules };
    const specs = {
      2: { terr: 28, dice: 42 },
      3: { terr: 27, dice: 30 },
      4: { terr: 28, dice: 22 },
    }[playerCount] || { terr: 28, dice: 22 };

    this.players = Array.from(
      { length: playerCount },
      (_, i) =>
        new Player(
          i,
          CONFIG.colors[i],
          playerNames && playerNames[i]
            ? playerNames[i]
            : `プレイヤー ${i + 1}`,
        ),
    );

    const gen = new MapGenerator().generate(specs.terr);
    this.hexGrid = gen.grid;
    this.territories = gen.territories;

    this.distributeTerritories(specs.dice);
    this.phase = "playing";
    this.currentPlayerIndex = 0;
    this.selectedTerritoryId = null;
    this.winner = null;
    this.notifyStateChange();
  }

  distributeTerritories(totalDice) {
    [...this.territories]
      .sort(() => Math.random() - 0.5)
      .forEach((t, i) => {
        t.owner = i % this.players.length;
        t.dice = CONFIG.minDicePerTerritory;
      });

    this.players.forEach((p) => {
      let owned = this.getOwnedTerritories(p.id);
      let remaining =
        totalDice +
        (this.rules.latterBonusDice
          ? CONFIG.bonusMap[this.players.length][p.id]
          : 0) -
        owned.length * CONFIG.minDicePerTerritory;

      while (remaining > 0) {
        let targets = owned.filter((t) => t.dice < CONFIG.initialMaxDice);
        if (!targets.length) break;
        targets[Math.floor(Math.random() * targets.length)].dice++;
        remaining--;
      }
    });
  }

  handleTerritoryClick(territoryId, executingPlayerIndex) {
    if (this.phase !== "playing") return;
    if (executingPlayerIndex !== this.currentPlayerIndex) return;

    let targetTerr = this.territories[territoryId];
    if (!targetTerr) return;
    let isOwn = targetTerr.owner === this.currentPlayerIndex;

    if (this.selectedTerritoryId === null) {
      if (isOwn && targetTerr.dice > 1) {
        this.selectedTerritoryId = targetTerr.id;
      }
    } else {
      let selectedTerr = this.territories[this.selectedTerritoryId];
      if (targetTerr.id === this.selectedTerritoryId) {
        this.selectedTerritoryId = null; // Deselect
      } else if (isOwn && targetTerr.dice > 1) {
        this.selectedTerritoryId = targetTerr.id; // Switch selection
      } else if (!isOwn && this.areAdjacent(selectedTerr, targetTerr)) {
        this.initiateBattle(selectedTerr, targetTerr);
      }
    }
    this.notifyStateChange();
  }

  areAdjacent(t1, t2) {
    if (!this.hexGrid || !this.hexGrid.length) return false;
    return t1.hexes.some((h) =>
      getAdjacentHexes(h.c, h.r).some(
        (n) =>
          this.hexGrid[n.col] &&
          this.hexGrid[n.col][n.row] &&
          this.hexGrid[n.col][n.row].territoryId === t2.id,
      ),
    );
  }

  initiateBattle(atkTerr, defTerr) {
    this.phase = "battling";
    let atkOwner = this.players[atkTerr.owner];
    let defOwner = this.players[defTerr.owner];
    this.selectedTerritoryId = null;

    if (this.onBattleStart) {
      this.onBattleStart(atkTerr, defTerr, atkOwner, defOwner);
    }

    setTimeout(
      () => this.resolveBattle(atkTerr, defTerr),
      CONFIG.battleAnimationMs,
    );
  }

  resolveBattle(atkTerr, defTerr) {
    let atkRoll = this.rollDice(atkTerr.dice);
    let defRoll = this.rollDice(defTerr.dice);
    let result = "";

    if (atkRoll > defRoll) {
      result = "win";
      defTerr.owner = atkTerr.owner;
      defTerr.dice = atkTerr.dice - 1;
      atkTerr.dice = 1;

      // Apply Great Power Cap if active
      if (
        this.rules.greatPower &&
        this.getMaxConnected(atkTerr.owner) >= this.rules.greatPowerThreshold
      ) {
        this.getOwnedTerritories(atkTerr.owner).forEach((t) => {
          if (t.dice > CONFIG.greatPowermaxDicePerTerritory)
            t.dice = CONFIG.greatPowermaxDicePerTerritory;
        });
      }
    } else if (atkRoll === defRoll) {
      result = "draw";
      atkTerr.dice = Math.max(1, Math.floor(atkTerr.dice / 2));
      defTerr.dice = Math.max(1, Math.floor(defTerr.dice / 2));
    } else {
      result = "lose";
      atkTerr.dice = Math.max(1, Math.ceil(atkTerr.dice / 2));
    }

    if (this.onBattleEnd) {
      this.onBattleEnd(atkRoll, defRoll, result);
    }

    setTimeout(() => {
      this.phase = "playing";
      this.checkWinCondition();
      this.notifyStateChange();
    }, CONFIG.battleResultDisplayMs);
  }

  endTurn(executingPlayerIndex) {
    if (this.phase !== "playing") return;
    if (executingPlayerIndex !== this.currentPlayerIndex) return;

    this.distributeReinforcements(this.currentPlayerIndex);

    let nextIndex = (this.currentPlayerIndex + 1) % this.players.length;
    while (this.getOwnedTerritories(nextIndex).length === 0) {
      nextIndex = (nextIndex + 1) % this.players.length;
    }

    this.currentPlayerIndex = nextIndex;
    this.selectedTerritoryId = null;
    this.notifyStateChange();
  }

  distributeReinforcements(pId) {
    let owned = this.getOwnedTerritories(pId);
    if (!owned.length) return;

    let maxConn = this.getMaxConnected(pId);
    let count = Math.ceil((2 / 3) * maxConn);

    if (
      this.rules.smallCountryBonus &&
      maxConn <= this.rules.smallCountryThreshold
    ) {
      count = Math.ceil((2 / 3) * this.rules.smallCountryThreshold);
    }
    if (this.rules.greatPower && maxConn >= this.rules.greatPowerThreshold) {
      count = Math.ceil((2 / 3) * this.rules.greatPowerThreshold);
    }

    let cap =
      this.rules.greatPower && maxConn >= this.rules.greatPowerThreshold
        ? CONFIG.greatPowermaxDicePerTerritory
        : CONFIG.maxDicePerTerritory;

    while (count > 0) {
      let targets = owned.filter((t) => t.dice < cap);
      if (!targets.length) break;
      targets[Math.floor(Math.random() * targets.length)].dice++;
      count--;
    }
  }

  checkWinCondition() {
    let activeOwners = new Set(this.territories.map((t) => t.owner));
    if (activeOwners.size === 1) {
      this.phase = "gameover";
      this.winner = this.players[Array.from(activeOwners)[0]];
    }
  }

  rollDice(count) {
    return Array.from(
      { length: count },
      () => Math.floor(Math.random() * 6) + 1,
    ).reduce((a, b) => a + b, 0);
  }

  getOwnedTerritories(pId) {
    return this.territories.filter((t) => t.owner === pId);
  }

  getMaxConnected(pId) {
    let owned = this.getOwnedTerritories(pId);
    if (!owned.length) return 0;

    let maxCount = 0;
    let visitedGlobal = new Set();

    owned.forEach((startTerr) => {
      if (visitedGlobal.has(startTerr.id)) return;
      let currentConnected = 0;
      let queue = [startTerr];
      let visitedLocal = new Set([startTerr.id]);

      visitedGlobal.add(startTerr.id);

      while (queue.length > 0) {
        let curr = queue.shift();
        currentConnected++;
        owned
          .filter((t) => !visitedLocal.has(t.id) && this.areAdjacent(curr, t))
          .forEach((adj) => {
            visitedLocal.add(adj.id);
            visitedGlobal.add(adj.id);
            queue.push(adj);
          });
      }
      if (currentConnected > maxCount) maxCount = currentConnected;
    });

    return maxCount;
  }

  exportState() {
    return {
      players: this.players,
      territories: this.territories,
      currentPlayerIndex: this.currentPlayerIndex,
      selectedTerritoryId: this.selectedTerritoryId,
      phase: this.phase,
      rules: this.rules,
      winner: this.winner,
    };
  }

  rebuildHexGridFromTerritories() {
    this.hexGrid = Array.from({ length: CONFIG.gridWidth }, (_, col) =>
      Array.from({ length: CONFIG.gridHeight }, (_, row) => ({
        col,
        row,
        active: false,
        territoryId: null,
      })),
    );
    if (this.territories) {
      this.territories.forEach((t) => {
        t.hexes.forEach((h) => {
          if (
            h.c >= 0 &&
            h.c < CONFIG.gridWidth &&
            h.r >= 0 &&
            h.r < CONFIG.gridHeight
          ) {
            this.hexGrid[h.c][h.r].active = true;
            this.hexGrid[h.c][h.r].territoryId = t.id;
          }
        });
      });
    }
  }

  importState(state) {
    this.players = state.players;
    this.territories = state.territories;
    this.currentPlayerIndex = state.currentPlayerIndex;
    this.selectedTerritoryId = state.selectedTerritoryId;
    this.phase = state.phase;
    this.rules = state.rules;
    this.winner = state.winner;
    this.rebuildHexGridFromTerritories();
    this.notifyStateChange();
  }

  notifyStateChange() {
    if (this.onStateChange) this.onStateChange(this);
  }
}
export { GameEngine };
