import { GAME_CONFIG, RENDER_CONFIG, UI_CONFIG } from '../config/index.js';
import { Player } from '../models/Player.js';
import { MapGenerator } from './MapGenerator.js';
import { getValidNeighbors } from '../utils/hexUtils.js';

export class GameController {
    constructor() {
        this.players = [];
        this.territories = [];
        this.hexGrid = [];
        this.currentPlayerIndex = 0;
        this.selectedTerritoryId = null;
        this.phase = 'start'; // 'start', 'playing', 'battling', 'gameover'
        this.rules = { 
            greatPower: false, 
            latterBonusDice: false, 
            smallCountryBonus: false 
        };
        this.onStateChange = null;
        this.onBattleStart = null;
        this.onBattleEnd = null;
    }

    startGame(numPlayers, rules) {
        this.rules = rules;
        const setup = GAME_CONFIG.playerSetupMap[numPlayers];
        
        this.players = Array.from(
            { length: numPlayers }, 
            (_, i) => new Player(i, RENDER_CONFIG.colors[i], `Player ${i + 1}`)
        );
        
        const generator = new MapGenerator();
        const mapData = generator.generate(setup.terr);
        this.hexGrid = mapData.grid;
        this.territories = mapData.territories;
        
        this.distributeTerritoriesAndDice(setup.dice);
        this.phase = 'playing';
        this.currentPlayerIndex = 0;
        this.selectedTerritoryId = null;
        this.notifyStateChange();
    }

    distributeTerritoriesAndDice(dicePerPlayer) {
        const unassigned = [...this.territories].sort(() => Math.random() - 0.5);
        unassigned.forEach((t, i) => {
            t.owner = i % this.players.length;
            t.dice = GAME_CONFIG.minDicePerTerritory;
        });

        this.players.forEach(p => {
            const owned = this.getOwnedTerritories(p.id);
            const bonus = this.rules.latterBonusDice ? GAME_CONFIG.bonusMap[this.players.length][p.id] : 0;
            let pool = (dicePerPlayer + bonus) - (owned.length * GAME_CONFIG.minDicePerTerritory);
            
            while (pool > 0) {
                const valid = owned.filter(t => t.dice < GAME_CONFIG.initialMaxDice);
                if (valid.length === 0) break;
                valid[Math.floor(Math.random() * valid.length)].dice++;
                pool--;
            }
        });
    }

    handleTerritoryClick(territoryId) {
        if (this.phase !== 'playing') return;
        const clicked = this.territories[territoryId];
        const isOwn = clicked.owner === this.currentPlayerIndex;

        if (this.selectedTerritoryId === null) {
            if (isOwn && clicked.dice > GAME_CONFIG.minDiceToAttack) {
                this.selectedTerritoryId = clicked.id;
            }
        } else {
            const source = this.territories[this.selectedTerritoryId];
            if (clicked.id === this.selectedTerritoryId) {
                this.selectedTerritoryId = null;
            } else if (isOwn && clicked.dice > GAME_CONFIG.minDiceToAttack) {
                this.selectedTerritoryId = clicked.id;
            } else if (!isOwn && this.areAdjacent(source, clicked)) {
                this.initiateBattle(source, clicked);
            }
        }
        this.notifyStateChange();
    }

    areAdjacent(t1, t2) {
        return t1.hexes.some(h1 => 
            getValidNeighbors(h1.c, h1.r).some(nc => this.hexGrid[nc.col][nc.row].territoryId === t2.id)
        );
    }

    initiateBattle(source, target) {
        this.phase = 'battling';
        this.selectedTerritoryId = null;
        if (this.onBattleStart) {
            this.onBattleStart(source, target, this.players[source.owner], this.players[target.owner]);
        }

        setTimeout(() => this.resolveBattle(source, target), UI_CONFIG.battleAnimationMs);
    }

    resolveBattle(source, target) {
        const atkRoll = this.rollDice(source.dice);
        const defRoll = this.rollDice(target.dice);
        
        let resultType = '';
        if (atkRoll > defRoll) {
            resultType = 'win';
            target.owner = source.owner;
            target.dice = source.dice - 1;
            source.dice = 1;
            if (this.rules.greatPower && this.getMaxConnected(source.owner) >= this.rules.greatPowerThreshold) {
                this.getOwnedTerritories(source.owner).forEach(t => {
                    if (t.dice > GAME_CONFIG.greatPowerMaxDicePerTerritory) {
                        t.dice = GAME_CONFIG.greatPowerMaxDicePerTerritory;
                    }
                });
            }
        } else if (atkRoll === defRoll) {
            resultType = 'draw';
            source.dice = Math.max(1, Math.floor(source.dice / 2));
            target.dice = Math.max(1, Math.floor(target.dice / 2));
        } else {
            resultType = 'lose';
            source.dice = Math.max(1, Math.ceil(source.dice / 2));
        }

        if (this.onBattleEnd) this.onBattleEnd(atkRoll, defRoll, resultType);

        setTimeout(() => {
            this.phase = 'playing';
            this.checkWinCondition();
            this.notifyStateChange();
        }, UI_CONFIG.battleResultDisplayMs);
    }

    endTurn() {
        if (this.phase !== 'playing') return;
        this.distributeReinforcements(this.currentPlayerIndex);
        
        let next = (this.currentPlayerIndex + 1) % this.players.length;
        while (this.getOwnedTerritories(next).length === 0) {
            next = (next + 1) % this.players.length;
        }
        this.currentPlayerIndex = next;
        this.selectedTerritoryId = null;
        this.notifyStateChange();
    }

    distributeReinforcements(pId) {
        const owned = this.getOwnedTerritories(pId);
        if (owned.length === 0) return;
        
        const maxConnected = this.getMaxConnected(pId);
        let count = Math.ceil(maxConnected * GAME_CONFIG.reinforcementRatio);

        if (this.rules.smallCountryBonus && maxConnected <= this.rules.smallCountryThreshold) {
            count = Math.ceil(GAME_CONFIG.reinforcementRatio * this.rules.smallCountryThreshold);
        }
        if (this.rules.greatPower && maxConnected >= this.rules.greatPowerThreshold) {
            count = Math.ceil(GAME_CONFIG.reinforcementRatio * this.rules.greatPowerThreshold);
        }

        const maxDice = (this.rules.greatPower && maxConnected >= this.rules.greatPowerThreshold)
            ? GAME_CONFIG.greatPowerMaxDicePerTerritory
            : GAME_CONFIG.maxDicePerTerritory;
        
        while (count > 0) {
            const valid = owned.filter(t => t.dice < maxDice);
            if (valid.length === 0) break;
            valid[Math.floor(Math.random() * valid.length)].dice++;
            count--;
        }
    }

    checkWinCondition() {
        const active = new Set(this.territories.map(t => t.owner));
        if (active.size === 1) {
            this.phase = 'gameover';
            this.winner = this.players[Array.from(active)[0]];
        }
    }

    rollDice(count) {
        return Array.from({ length: count }, () => Math.floor(Math.random() * GAME_CONFIG.diceSides) + 1)
                    .reduce((a, b) => a + b, 0);
    }

    getOwnedTerritories(pId) {
        return this.territories.filter(t => t.owner === pId);
    }

    getMaxConnected(pId) {
        const terrs = this.getOwnedTerritories(pId);
        if (terrs.length === 0) return 0;
        let maxConnected = 0;
        const visited = new Set();
        
        terrs.forEach(t => {
            if (visited.has(t.id)) return;
            let count = 0;
            const queue = [t];
            const localVisited = new Set([t.id]);
            visited.add(t.id);

            while (queue.length > 0) {
                const curr = queue.shift();
                count++;
                terrs.filter(other => !localVisited.has(other.id) && this.areAdjacent(curr, other)).forEach(other => {
                    localVisited.add(other.id); 
                    visited.add(other.id); 
                    queue.push(other);
                });
            }
            if (count > maxConnected) maxConnected = count;
        });
        return maxConnected;
    }

    notifyStateChange() {
        if (this.onStateChange) this.onStateChange(this);
    }
}