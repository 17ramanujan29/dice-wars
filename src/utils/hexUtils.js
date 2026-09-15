import { CONFIG } from "../config.js";

function getHexMetrics(size) {
  return {
    hexHeight: Math.sqrt(3) * size,
    hexWidth: 2 * size,
    vertDist: Math.sqrt(3) * size,
    horizDist: 2 * size * 0.75,
  };
}

function hexToPixel(col, row, size) {
  const metrics = getHexMetrics(size);
  let x = col * metrics.horizDist;
  let y = row * metrics.vertDist;
  if (col % 2 !== 0) {
    y += metrics.vertDist / 2;
  }
  return { x, y };
}

function pixelToHex(x, y, size) {
  const q = ((2 / 3) * x) / size;
  const r = ((-1 / 3) * x + (Math.sqrt(3) / 3) * y) / size;
  return cubeToAxial(q, r, -q - r);
}

function cubeToAxial(x, y, z) {
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);
  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);

  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }
  return { col: rx, row: ry + (rx - (rx & 1)) / 2 };
}

function getAdjacentHexes(col, row) {
  const neighbors = [];
  const directions = [
    [
      [1, 0],
      [1, -1],
      [0, -1],
      [-1, -1],
      [-1, 0],
      [0, 1],
    ],
    [
      [1, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
      [-1, 1],
      [0, 1],
    ],
  ];
  for (let d of directions[col & 1]) {
    let nc = col + d[0];
    let nr = row + d[1];
    if (nc >= 0 && nc < CONFIG.gridWidth && nr >= 0 && nr < CONFIG.gridHeight) {
      neighbors.push({ col: nc, row: nr });
    }
  }
  return neighbors;
}
export { getHexMetrics, hexToPixel, pixelToHex, cubeToAxial, getAdjacentHexes };
