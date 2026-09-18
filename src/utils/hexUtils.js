import { GAME_CONFIG } from '../config/index.js';

/**
 * 六角形グリッドの方向テーブル（ルックアップテーブル）
 * 列の奇偶によって隣接する方向が異なるため、2つのパターンを定義
 * 軸方向：NE, E, SE, SW, W, NW の順
 */
export const HEX_DIRS = [
    // 偶数列（col % 2 === 0）の方向
    [
        [+1,  0],  // E
        [+1, -1],  // SE
        [ 0, -1],  // SW
        [-1, -1],  // W
        [-1,  0],  // NW
        [ 0, +1],  // NE
    ],
    // 奇数列（col % 2 === 1）の方向
    [
        [+1, +1],  // E
        [+1,  0],  // SE
        [ 0, -1],  // SW
        [-1,  0],  // W
        [-1, +1],  // NW
        [ 0, +1],  // NE
    ],
];

/**
 * 六角形のサイズに基づくメトリクスを計算
 * @param {number} hexSize - 六角形のサイズ
 * @returns {{ hexHeight: number, hexWidth: number, vertDist: number, horizDist: number }}
 */
export function getHexMetrics(hexSize) {
    return {
        hexHeight: Math.sqrt(3) * hexSize,
        hexWidth: 2 * hexSize,
        vertDist: Math.sqrt(3) * hexSize,
        horizDist: 2 * hexSize * 0.75
    };
}

/**
 * グリッド座標からキャンバス座標の中央点を計算
 * @param {number} col - 列
 * @param {number} row - 行
 * @param {number} hexSize - 六角形のサイズ
 * @returns {{ x: number, y: number }}
 */
export function getHexCenter(col, row, hexSize) {
    const metrics = getHexMetrics(hexSize);
    let x = col * metrics.horizDist;
    let y = row * metrics.vertDist;
    if (col % 2 !== 0) y += metrics.vertDist / 2;
    return { x, y };
}

/**
 * ピクセル座標を六角形グリッド座標に変換
 * @param {number} px - ピクセルX座標
 * @param {number} py - ピクセルY座標
 * @param {number} hexSize - 六角形のサイズ
 * @returns {{ col: number, row: number }}
 */
export function pixelToHex(px, py, hexSize) {
    const q = (2 / 3 * px) / hexSize;
    const r = (-1 / 3 * px + Math.sqrt(3) / 3 * py) / hexSize;
    return hexRound(q, r, -q - r);
}

/**
 * フローティングポイントの六角形座標を整数座標に丸める
 * @param {number} q - q座標
 * @param {number} r - r座標
 * @param {number} s - s座標
 * @returns {{ col: number, row: number }}
 */
function hexRound(q, r, s) {
    let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
    const q_diff = Math.abs(rq - q), r_diff = Math.abs(rr - r), s_diff = Math.abs(rs - s);
    if (q_diff > r_diff && q_diff > s_diff) rq = -rr - rs;
    else if (r_diff > s_diff) rr = -rq - rs;
    else rs = -rq - rr;
    return { col: rq, row: rr + (rq - (rq & 1)) / 2 };
}

/**
 * 指定された座標の有効な隣接セルを取得
 * グリッド境界内の隣接セルのみを返す
 * @param {number} col - 列
 * @param {number} row - 行
 * @returns {{ col: number, row: number }[]}
 */
export function getValidNeighbors(col, row) {
    const neighbors = [];
    const dirs = HEX_DIRS[col & 1];
    for (let d of dirs) {
        const nc = col + d[0], nr = row + d[1];
        if (nc >= 0 && nc < GAME_CONFIG.gridWidth && nr >= 0 && nr < GAME_CONFIG.gridHeight) {
            neighbors.push({ col: nc, row: nr });
        }
    }
    return neighbors;
}