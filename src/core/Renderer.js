import { CONFIG } from "../config.js";
import { getHexMetrics, hexToPixel } from "../utils/hexUtils.js";

class CanvasRenderer {
  constructor(canvasId, gameEngine) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    this.game = gameEngine;
    this.camera = { x: 0, y: 0 };
    this.isRunning = false;
    this.canDrag = false;
  }

  start() {
    this.isRunning = true;
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.loop();
  }

  loop() {
    if (this.isRunning) {
      this.render();
      requestAnimationFrame(() => this.loop());
    }
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    this.canvas.width = parent.clientWidth;
    this.canvas.height = parent.clientHeight;
    this.fitMapToScreen();
  }

  fitMapToScreen() {
    let availW = Math.max(100, this.canvas.width - 40);
    let availH = Math.max(100, this.canvas.height - 40);

    let scaleX = availW / (CONFIG.gridWidth * 1.5 + 0.5);
    let scaleY = availH / (CONFIG.gridHeight * Math.sqrt(3) * CONFIG.yScale);
    CONFIG.hexSize = Math.max(12, Math.min(scaleX, scaleY));

    let metrics = getHexMetrics(CONFIG.hexSize);
    let totalW = CONFIG.gridWidth * metrics.horizDist + CONFIG.hexSize * 0.5;
    let totalH =
      (CONFIG.gridHeight * metrics.vertDist + metrics.vertDist * 0.5) *
      CONFIG.yScale;

    this.camera.x = (this.canvas.width - totalW) / 2 + 10;
    this.camera.y = (this.canvas.height - totalH) / 2 + 10;
    this.canDrag = totalW > this.canvas.width || totalH > this.canvas.height;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  render() {
    if (this.game.phase === "start") return;

    this.clear();
    this.ctx.save();
    this.ctx.translate(this.camera.x, this.camera.y);

    // Draw Base Hex Surface
    this.ctx.save();
    this.ctx.scale(1, CONFIG.yScale);
    this.game.territories.forEach((t) => {
      let color =
        t.id === this.game.selectedTerritoryId
          ? "#475569"
          : this.game.players[t.owner].color;
      t.hexes.forEach((h) => {
        let pos = hexToPixel(h.c, h.r, CONFIG.hexSize);
        this.drawHexagon(pos.x, pos.y, CONFIG.hexSize, color, null, 0);
      });
    });

    this.drawBorders();
    this.drawHighlights();
    this.ctx.restore();

    // Draw Isometric 3D Dice Stacks
    this.game.territories.forEach((t) => {
      let pos = hexToPixel(t.centerHex.c, t.centerHex.r, CONFIG.hexSize);
      this.drawDiceStack(
        pos.x,
        pos.y * CONFIG.yScale,
        t.dice,
        this.game.players[t.owner].color,
      );
    });

    this.ctx.restore();
  }

  drawHexagon(x, y, size, fillColor, strokeColor, strokeWidth = 1) {
    this.ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      let angle = (Math.PI / 180) * (60 * i);
      let px = x + size * Math.cos(angle);
      let py = y + size * Math.sin(angle);
      if (i === 0) this.ctx.moveTo(px, py);
      else this.ctx.lineTo(px, py);
    }
    this.ctx.closePath();
    if (fillColor) {
      this.ctx.fillStyle = fillColor;
      this.ctx.fill();
    }
    if (strokeColor) {
      this.ctx.lineWidth = strokeWidth;
      this.ctx.strokeStyle = strokeColor;
      this.ctx.stroke();
    }
  }

  drawHighlights() {
    let selId = this.game.selectedTerritoryId;
    if (selId === null) return;

    let selTerr = this.game.territories.find((t) => t.id === selId);
    if (!selTerr) return;

    // Highlight Selected Territory
    selTerr.hexes.forEach((h) => {
      let pos = hexToPixel(h.c, h.r, CONFIG.hexSize);
      this.drawHexagon(
        pos.x,
        pos.y,
        CONFIG.hexSize,
        CONFIG.selectedHighlight,
        "#ffffff",
        2,
      );
    });

    // Highlight Attack Targets
    this.game.territories
      .filter(
        (t) => t.owner !== selTerr.owner && this.game.areAdjacent(selTerr, t),
      )
      .forEach((t) => {
        t.hexes.forEach((h) => {
          let pos = hexToPixel(h.c, h.r, CONFIG.hexSize);
          this.drawHexagon(
            pos.x,
            pos.y,
            CONFIG.hexSize,
            CONFIG.targetHighlight,
            null,
            0,
          );
        });
      });
  }

  drawBorders() {
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
    const vertexAngles = [0, 5, 4, 3, 2, 1];
    const dirOffset = [
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

    this.game.territories.forEach((terr) => {
      let isSel = terr.id === this.game.selectedTerritoryId;
      this.ctx.strokeStyle = isSel ? "#ffffff" : "rgba(15, 23, 42, 0.9)";
      this.ctx.lineWidth = isSel ? 3.5 : 2;

      terr.hexes.forEach((h) => {
        let pos = hexToPixel(h.c, h.r, CONFIG.hexSize);
        for (let i = 0; i < 6; i++) {
          let off = dirOffset[h.c & 1][i];
          let nc = h.c + off[0],
            nr = h.r + off[1];
          let isSameTerritory =
            nc >= 0 &&
            nc < CONFIG.gridWidth &&
            nr >= 0 &&
            nr < CONFIG.gridHeight &&
            this.game.hexGrid &&
            this.game.hexGrid[nc] &&
            this.game.hexGrid[nc][nr] &&
            this.game.hexGrid[nc][nr].active &&
            this.game.hexGrid[nc][nr].territoryId === terr.id;

          if (!isSameTerritory) {
            let a1 = (Math.PI / 180) * (60 * vertexAngles[i]);
            let a2 = (Math.PI / 180) * (60 * ((vertexAngles[i] + 1) % 6));
            this.ctx.beginPath();
            this.ctx.moveTo(
              pos.x + CONFIG.hexSize * Math.cos(a1),
              pos.y + CONFIG.hexSize * Math.sin(a1),
            );
            this.ctx.lineTo(
              pos.x + CONFIG.hexSize * Math.cos(a2),
              pos.y + CONFIG.hexSize * Math.sin(a2),
            );
            this.ctx.stroke();
          }
        }
      });
    });
  }

  drawDiceStack(x, y, count, baseColor) {
    let size = Math.max(CONFIG.hexSize * 0.65, 6);
    let rh = size * 0.75,
      dy = size * 0.85;
    let isSplit = count >= 5;
    let offset = size * 0.5;
    let startY = y;

    for (let i = 0; i < count; i++) {
      let dx = x,
        layer = i;
      if (isSplit) {
        if (i < 4) {
          dx = x - offset;
          layer = i;
        } else {
          dx = x + offset;
          layer = i - 4;
          startY = y + rh;
        }
      }
      let my = startY - layer * dy;
      let topC = this.adjustColor(baseColor, 35);
      let leftC = this.adjustColor(baseColor, -5);
      let rightC = this.adjustColor(baseColor, -25);

      this.ctx.lineWidth = 1.2;
      this.ctx.strokeStyle = "rgba(0,0,0,0.6)";

      // Top Face
      this.ctx.fillStyle = topC;
      this.ctx.beginPath();
      this.ctx.moveTo(dx, my - size - rh);
      this.ctx.lineTo(dx + size, my - size);
      this.ctx.lineTo(dx, my - size + rh);
      this.ctx.lineTo(dx - size, my - size);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.stroke();

      // Left Face
      this.ctx.fillStyle = leftC;
      this.ctx.beginPath();
      this.ctx.moveTo(dx - size, my - size);
      this.ctx.lineTo(dx, my - size + rh);
      this.ctx.lineTo(dx, my + rh);
      this.ctx.lineTo(dx - size, my);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.stroke();

      // Right Face
      this.ctx.fillStyle = rightC;
      this.ctx.beginPath();
      this.ctx.moveTo(dx, my - size + rh);
      this.ctx.lineTo(dx + size, my - size);
      this.ctx.lineTo(dx + size, my);
      this.ctx.lineTo(dx, my + rh);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.stroke();

      // Pip Dots
      let val = i === count - 1 ? Math.min(count, 6) : (i % 6) + 1;
      let pY = my - size;
      let dots = [];
      if (val === 1) dots = [[0, 0]];
      else if (val === 2)
        dots = [
          [-0.4, -0.4],
          [0.4, 0.4],
        ];
      else if (val === 3)
        dots = [
          [-0.4, -0.4],
          [0, 0],
          [0.4, 0.4],
        ];
      else if (val === 4)
        dots = [
          [-0.4, -0.4],
          [0.4, -0.4],
          [-0.4, 0.4],
          [0.4, 0.4],
        ];
      else if (val === 5)
        dots = [
          [-0.4, -0.4],
          [0.4, -0.4],
          [0, 0],
          [-0.4, 0.4],
          [0.4, 0.4],
        ];
      else
        dots = [
          [-0.4, -0.4],
          [-0.4, 0],
          [-0.4, 0.4],
          [0.4, -0.4],
          [0.4, 0],
          [0.4, 0.4],
        ];

      let dotRadius = val === 1 ? size * 0.28 : size * 0.15;
      dots.forEach((d) => {
        let dotX = dx + (d[0] - d[1]) * (size * 0.4);
        let dotY = pY + (d[0] + d[1]) * (rh * 0.4);
        this.ctx.save();
        this.ctx.translate(dotX, dotY);
        this.ctx.scale(1, 0.5);
        this.ctx.fillStyle = "#0f172a";
        this.ctx.beginPath();
        this.ctx.arc(0, 0, dotRadius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
      });
    }
  }

  adjustColor(hex, percent) {
    let num = parseInt(hex.replace("#", ""), 16);
    let amt = Math.round(2.55 * percent);
    let R = (num >> 16) + amt;
    let G = ((num >> 8) & 0x00ff) + amt;
    let B = (num & 0x0000ff) + amt;
    return (
      "#" +
      (
        0x1000000 +
        (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
        (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
        (B < 255 ? (B < 1 ? 0 : B) : 255)
      )
        .toString(16)
        .slice(1)
    );
  }
}
export { CanvasRenderer };
