import { CONFIG } from '../config.js';
import { Territory } from '../models/Territory.js';
import { getAdjacentHexes, hexToPixel } from '../utils/hexUtils.js';

// Map Procedural Generator
      class MapGenerator {
        constructor() {
          this.hexGrid = [];
          this.territories = [];
        }

        generate(count) {
          let success = false;
          let attempts = 0;
          while (!success && attempts < 10) {
            attempts++;
            this.initGrid();
            this.territories = [];
            let failed = false;
            for (let i = 0; i < count; i++) {
              if (!this.createTerritory(i)) {
                failed = true;
                break;
              }
            }
            if (!failed) success = true;
          }
          return { grid: this.hexGrid, territories: this.territories };
        }

        initGrid() {
          this.hexGrid = Array.from({ length: CONFIG.gridWidth }, (_, col) =>
            Array.from({ length: CONFIG.gridHeight }, (_, row) => ({
              col,
              row,
              active: false,
              territoryId: null,
            })),
          );
        }

        createTerritory(id) {
          for (let retry = 0; retry < CONFIG.mapGenerationMaxRetries; retry++) {
            let seed = this.findSeed(id);
            if (!seed) return false;

            let hexes = [{ c: seed.col, r: seed.row }];
            this.setHex(seed.col, seed.row, id, true);
            let blocked = false;

            while (hexes.length < CONFIG.targetHexesPerTerritory) {
              let neighbor = this.findNeighbor(hexes);
              if (!neighbor) {
                blocked = true;
                break;
              }
              this.setHex(neighbor.col, neighbor.row, id, true);
              hexes.push({ c: neighbor.col, r: neighbor.row });
            }

            if (!blocked && hexes.length === CONFIG.targetHexesPerTerritory) {
              let center = this.calculateCentroid(hexes);
              this.territories.push(new Territory(id, hexes, center));
              return true;
            }
            hexes.forEach((h) => this.setHex(h.c, h.r, null, false));
          }
          return false;
        }

        findSeed(id) {
          if (id === 0)
            return {
              col: Math.floor(CONFIG.gridWidth / 2),
              row: Math.floor(CONFIG.gridHeight / 2),
            };
          let candidates = [];
          for (let c = 0; c < CONFIG.gridWidth; c++) {
            for (let r = 0; r < CONFIG.gridHeight; r++) {
              if (
                !this.hexGrid[c][r].active &&
                getAdjacentHexes(c, r).some(
                  (n) => this.hexGrid[n.col][n.row].active,
                )
              ) {
                candidates.push({ col: c, row: r });
              }
            }
          }
          return candidates.length
            ? candidates[Math.floor(Math.random() * candidates.length)]
            : null;
        }

        findNeighbor(hexList) {
          let candidates = [];
          for (let hex of hexList) {
            getAdjacentHexes(hex.c, hex.r).forEach((n) => {
              if (
                !this.hexGrid[n.col][n.row].active &&
                !candidates.some((c) => c.col === n.col && c.row === n.row)
              ) {
                candidates.push(n);
              }
            });
          }
          return candidates.length
            ? candidates[Math.floor(Math.random() * candidates.length)]
            : null;
        }

        calculateCentroid(hexList) {
          let sumX = 0,
            sumY = 0;
          hexList.forEach((h) => {
            let pos = hexToPixel(h.c, h.r, CONFIG.hexSize);
            sumX += pos.x;
            sumY += pos.y;
          });
          let avgX = sumX / hexList.length,
            avgY = sumY / hexList.length;
          let closest = hexList[0],
            minDst = Infinity;
          hexList.forEach((h) => {
            let pos = hexToPixel(h.c, h.r, CONFIG.hexSize);
            let dst = Math.hypot(pos.x - avgX, pos.y - avgY);
            if (dst < minDst) {
              minDst = dst;
              closest = h;
            }
          });
          return { c: closest.c, r: closest.r };
        }

        setHex(col, row, terrId, active) {
          this.hexGrid[col][row].active = active;
          this.hexGrid[col][row].territoryId = terrId;
        }
      }
export { MapGenerator };
