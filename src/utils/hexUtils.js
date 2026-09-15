import { GAME_CONFIG } from '../config/gameConfig.js';

export function getHexMetrics(hexSize) {
    return {
        hexHeight: Math.sqrt(3) * hexSize,
        hexWidth: 2 * hexSize,
        vertDist: Math.sqrt(3) * hexSize,
        horizDist: 2 * hexSize * 0.75
    };
}

export function getHexCenter(col, row, hexSize) {
    const metrics = getHexMetrics(hexSize);
    let x = col * metrics.horizDist;
    let y = row * metrics.vertDist;
    if (col % 2 !== 0) y += metrics.vertDist / 2;
    return { x, y };
}

export function pixelToHex(px, py, hexSize) {
    const q = (2 / 3 * px) / hexSize;
    const r = (-1 / 3 * px + Math.sqrt(3) / 3 * py) / hexSize;
    return hexRound(q, r, -q - r);
}

function hexRound(q, r, s) {
    let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
    const q_diff = Math.abs(rq - q), r_diff = Math.abs(rr - r), s_diff = Math.abs(rs - s);
    if (q_diff > r_diff && q_diff > s_diff) rq = -rr - rs;
    else if (r_diff > s_diff) rr = -rq - rs;
    else rs = -rq - rr;
    return { col: rq, row: rr + (rq - (rq & 1)) / 2 };
}

export function getValidNeighbors(col, row) {
    const neighbors = [];
    const dirs = [
        [[+1,  0], [+1, -1], [ 0, -1], [-1, -1], [-1,  0], [ 0, +1]], 
        [[+1, +1], [+1,  0], [ 0, -1], [-1,  0], [-1, +1], [ 0, +1]]  
    ];
    for (let d of dirs[col & 1]) {
        const nc = col + d[0], nr = row + d[1];
        if (nc >= 0 && nc < GAME_CONFIG.gridWidth && nr >= 0 && nr < GAME_CONFIG.gridHeight) {
            neighbors.push({ col: nc, row: nr });
        }
    }
    return neighbors;
}