import { GAME_CONFIG } from '../config/index.js';
import { getValidNeighbors, getHexCenter } from '../utils/hexUtils.js';
import { Territory } from '../models/Territory.js';

export class MapGenerator {
    constructor() {
        this.hexGrid = [];
        this.territories = [];
    }

    generate(numTerritories) {
        let mapSuccess = false;
        while (!mapSuccess) {
            this.initGrid();
            this.territories = [];
            let mapFailed = false;

            for (let tId = 0; tId < numTerritories; tId++) {
                if (!this.createSingleTerritory(tId)) {
                    mapFailed = true; 
                    break;
                }
            }
            if (!mapFailed) mapSuccess = true;
        }
        return { grid: this.hexGrid, territories: this.territories };
    }

    initGrid() {
        this.hexGrid = Array.from({ length: GAME_CONFIG.gridWidth }, (_, c) =>
            Array.from({ length: GAME_CONFIG.gridHeight }, (_, r) => ({ col: c, row: r, active: false, territoryId: null }))
        );
    }

    createSingleTerritory(tId) {
        for (let attempt = 0; attempt < GAME_CONFIG.mapGenerationMaxRetries; attempt++) {
            const seed = this.findSeed(tId);
            if (!seed) return false;

            let tempHexes = [{ c: seed.col, r: seed.row }];
            this.setHexActive(seed.col, seed.row, tId, true);

            let trapped = false;
            while (tempHexes.length < GAME_CONFIG.targetHexesPerTerritory) {
                const next = this.findNextNeighbor(tempHexes);
                if (!next) { trapped = true; break; }
                this.setHexActive(next.col, next.row, tId, true);
                tempHexes.push({ c: next.col, r: next.row });
            }

            if (!trapped && tempHexes.length === GAME_CONFIG.targetHexesPerTerritory) {
                const centerHex = this.calculateCentroid(tempHexes);
                this.territories.push(new Territory(tId, tempHexes, centerHex));
                return true;
            } else {
                tempHexes.forEach(h => this.setHexActive(h.c, h.r, null, false));
            }
        }
        return false;
    }

    findSeed(tId) {
        if (tId === 0) return { col: Math.floor(GAME_CONFIG.gridWidth / 2), row: Math.floor(GAME_CONFIG.gridHeight / 2) };
        const available = [];
        for (let c = 0; c < GAME_CONFIG.gridWidth; c++) {
            for (let r = 0; r < GAME_CONFIG.gridHeight; r++) {
                if (!this.hexGrid[c][r].active && getValidNeighbors(c, r).some(n => this.hexGrid[n.col][n.row].active)) {
                    available.push({ col: c, row: r });
                }
            }
        }
        return available.length ? available[Math.floor(Math.random() * available.length)] : null;
    }

    findNextNeighbor(tempHexes) {
        const potential = [];
        for (let h of tempHexes) {
            getValidNeighbors(h.c, h.r).forEach(n => {
                if (!this.hexGrid[n.col][n.row].active && !potential.some(pn => pn.col === n.col && pn.row === n.row)) {
                    potential.push(n);
                }
            });
        }
        return potential.length ? potential[Math.floor(Math.random() * potential.length)] : null;
    }

    calculateCentroid(hexes) {
        let sumX = 0, sumY = 0;
        hexes.forEach(h => {
            const p = getHexCenter(h.c, h.r, GAME_CONFIG.targetHexesPerTerritory);
            sumX += p.x; sumY += p.y;
        });
        const cX = sumX / hexes.length, cY = sumY / hexes.length;
        
        let bestHex = hexes[0], minDist = Infinity;
        hexes.forEach(h => {
            const p = getHexCenter(h.c, h.r, GAME_CONFIG.targetHexesPerTerritory);
            const dist = Math.hypot(p.x - cX, p.y - cY);
            if (dist < minDist) { minDist = dist; bestHex = h; }
        });
        return { c: bestHex.c, r: bestHex.r };
    }

    setHexActive(col, row, tId, isActive) {
        this.hexGrid[col][row].active = isActive;
        this.hexGrid[col][row].territoryId = tId;
    }
}