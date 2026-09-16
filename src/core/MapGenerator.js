import { GAME_CONFIG } from '../config/index.js';
import { getValidNeighbors, getHexCenter } from '../utils/hexUtils.js';
import { Territory } from '../models/Territory.js';

/**
 * マップ生成ユーティリティクラス
 * すべてのメソッドが静的であり、インスタンス化せずに利用可能
 */
export class MapGenerator {
    /**
     * 指定された数の領土を含むマップを生成
     * @param {number} numTerritories - 生成する領土数
     * @returns {{ grid: Array, territories: Territory[] }}
     */
    static generate(numTerritories) {
        let hexGrid = [];
        let territories = [];
        let mapSuccess = false;
        
        while (!mapSuccess) {
            hexGrid = MapGenerator.initGrid();
            territories = [];
            let mapFailed = false;

            for (let tId = 0; tId < numTerritories; tId++) {
                if (!MapGenerator.createSingleTerritory(hexGrid, territories, tId, numTerritories)) {
                    mapFailed = true; 
                    break;
                }
            }
            if (!mapFailed) mapSuccess = true;
        }
        return { grid: hexGrid, territories };
    }

    /**
     * グリッドを初期化
     * @returns {Array} 初期化されたグリッド
     */
    static initGrid() {
        return Array.from({ length: GAME_CONFIG.gridWidth }, (_, c) =>
            Array.from({ length: GAME_CONFIG.gridHeight }, (_, r) => ({ 
                col: c, 
                row: r, 
                active: false, 
                territoryId: null 
            }))
        );
    }

    /**
     * 単一の領土を作成
     * @param {Array} hexGrid - グリッド
     * @param {Territory[]} territories - 領土配列
     * @param {number} tId - 領土ID
     * @param {number} numTerritories - 総領土数（デバッグ用）
     * @returns {boolean} 作成成功かどうか
     */
    static createSingleTerritory(hexGrid, territories, tId) {
        for (let attempt = 0; attempt < GAME_CONFIG.mapGenerationMaxRetries; attempt++) {
            const seed = MapGenerator.findSeed(hexGrid, tId);
            if (!seed) return false;

            let tempHexes = [{ c: seed.col, r: seed.row }];
            MapGenerator.setHexActive(hexGrid, seed.col, seed.row, tId, true);

            let trapped = false;
            while (tempHexes.length < GAME_CONFIG.targetHexesPerTerritory) {
                const next = MapGenerator.findNextNeighbor(hexGrid, tempHexes);
                if (!next) { trapped = true; break; }
                MapGenerator.setHexActive(hexGrid, next.col, next.row, tId, true);
                tempHexes.push({ c: next.col, r: next.row });
            }

            if (!trapped && tempHexes.length === GAME_CONFIG.targetHexesPerTerritory) {
                const centerHex = MapGenerator.calculateCentroid(tempHexes);
                territories.push(new Territory(tId, tempHexes, centerHex));
                return true;
            } else {
                tempHexes.forEach(h => MapGenerator.setHexActive(hexGrid, h.c, h.r, null, false));
            }
        }
        return false;
    }

    /**
     * シード（領土の開始位置）を見つける
     * @param {Array} hexGrid - グリッド
     * @param {number} tId - 領土ID
     * @returns {{col: number, row: number} | null}
     */
    static findSeed(hexGrid, tId) {
        if (tId === 0) {
            return { 
                col: Math.floor(GAME_CONFIG.gridWidth / 2), 
                row: Math.floor(GAME_CONFIG.gridHeight / 2) 
            };
        }
        const available = [];
        for (let c = 0; c < GAME_CONFIG.gridWidth; c++) {
            for (let r = 0; r < GAME_CONFIG.gridHeight; r++) {
                if (!hexGrid[c][r].active && 
                    getValidNeighbors(c, r).some(n => hexGrid[n.col][n.row].active)) {
                    available.push({ col: c, row: r });
                }
            }
        }
        return available.length ? available[Math.floor(Math.random() * available.length)] : null;
    }

    /**
     * 領土の次の neighboring hex を見つける
     * @param {Array} hexGrid - グリッド
     * @param {Array} tempHexes - 現在の一時的な hexes
     * @returns {{col: number, row: number} | null}
     */
    static findNextNeighbor(hexGrid, tempHexes) {
        const potential = [];
        for (let h of tempHexes) {
            getValidNeighbors(h.c, h.r).forEach(n => {
                if (!hexGrid[n.col][n.row].active && 
                    !potential.some(pn => pn.col === n.col && pn.row === n.row)) {
                    potential.push(n);
                }
            });
        }
        return potential.length ? potential[Math.floor(Math.random() * potential.length)] : null;
    }

    /**
     * hexes のセントロイド（中心）を計算
     * @param {Array} hexes - hex の配列
     * @returns {{c: number, r: number}}
     */
    static calculateCentroid(hexes) {
        let sumX = 0, sumY = 0;
        hexes.forEach(h => {
            const p = getHexCenter(h.c, h.r, GAME_CONFIG.targetHexesPerTerritory);
            sumX += p.x; 
            sumY += p.y;
        });
        const cX = sumX / hexes.length, cY = sumY / hexes.length;
        
        let bestHex = hexes[0], minDist = Infinity;
        hexes.forEach(h => {
            const p = getHexCenter(h.c, h.r, GAME_CONFIG.targetHexesPerTerritory);
            const dist = Math.hypot(p.x - cX, p.y - cY);
            if (dist < minDist) { 
                minDist = dist; 
                bestHex = h; 
            }
        });
        return { c: bestHex.c, r: bestHex.r };
    }

    /**
     * hex の active 状態と territoryId を設定
     * @param {Array} hexGrid - グリッド
     * @param {number} col - 列
     * @param {number} row - 行
     * @param {number | null} tId - 領土ID
     * @param {boolean} isActive - アクティブかどうか
     */
    static setHexActive(hexGrid, col, row, tId, isActive) {
        hexGrid[col][row].active = isActive;
        hexGrid[col][row].territoryId = tId;
    }
}