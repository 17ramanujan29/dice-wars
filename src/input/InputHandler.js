import { UI_CONFIG, GAME_CONFIG, RENDER_CONFIG } from "../config/index.js";
import { pixelToHex } from "../utils/hexUtils.js";

export class InputHandler {
  constructor(canvas, renderer, gameController) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.game = gameController;
    this.onTerritoryClick = null;

    this.startPos = { x: 0, y: 0 };
    this.lastPos = { x: 0, y: 0 };
    this.isDragging = false;
    this.lastTouchTime = 0;

    this.initEventListeners();
  }

  initEventListeners() {
    this.canvas.addEventListener("mousedown", (e) => this.handlePointerDown(e));
    this.canvas.addEventListener("mousemove", (e) => this.handlePointerMove(e));
    window.addEventListener("mouseup", (e) => this.handlePointerUp(e));

    this.canvas.addEventListener(
      "touchstart",
      (e) => this.handlePointerDown(e),
      { passive: false },
    );
    this.canvas.addEventListener(
      "touchmove",
      (e) => this.handlePointerMove(e),
      { passive: false },
    );
    window.addEventListener("touchend", (e) => this.handlePointerUp(e), {
      passive: false,
    });
  }

  getPos(e) {
    const touch = e.touches && e.touches.length > 0 ? e.touches[0] : null;
    return {
      x: touch ? touch.clientX : e.clientX,
      y: touch ? touch.clientY : e.clientY,
    };
  }

  handlePointerDown(e) {
    if (e.type === "touchstart") {
      this.lastTouchTime = Date.now();
    } else if (e.type === "mousedown") {
      if (Date.now() - this.lastTouchTime < UI_CONFIG.touchDebounceMs) return;
    }

    if (this.game.phase === "playing") {
      const pos = this.getPos(e);
      this.startPos = pos;
      this.lastPos = pos;
      this.isDragging = true;
    }
  }

  handlePointerMove(e) {
    if (
      !this.isDragging ||
      this.game.phase !== "playing" ||
      !this.renderer.canDrag
    )
      return;
    if (e.type === "touchmove") e.preventDefault();

    const currentPos = this.getPos(e);
    this.renderer.camera.x += currentPos.x - this.lastPos.x;
    this.renderer.camera.y += currentPos.y - this.lastPos.y;
    this.lastPos = currentPos;
  }

  handlePointerUp(e) {
    if (!this.isDragging) return;
    this.isDragging = false;

    if (e.type === "mouseup") {
      if (Date.now() - this.lastTouchTime < UI_CONFIG.touchDebounceMs) return;
    } else if (e.type === "touchend") {
      this.lastTouchTime = Date.now();
    }

    if (this.game.phase !== "playing") return;

    const pos =
      e.changedTouches && e.changedTouches.length > 0
        ? { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY }
        : this.getPos(e);

    if (
      Math.hypot(pos.x - this.startPos.x, pos.y - this.startPos.y) <
      UI_CONFIG.clickTolerance
    ) {
      const localX = pos.x - this.renderer.camera.x;
      const localY = (pos.y - this.renderer.camera.y) / RENDER_CONFIG.yScale;
      const tHex = pixelToHex(localX, localY, this.renderer.hexSize);

      if (
        tHex.col >= 0 &&
        tHex.col < GAME_CONFIG.gridWidth &&
        tHex.row >= 0 &&
        tHex.row < GAME_CONFIG.gridHeight
      ) {
        const eHex = this.game.hexGrid[tHex.col][tHex.row];
        if (eHex && eHex.active) {
          if (this.onTerritoryClick) {
            this.onTerritoryClick(eHex.territoryId);
          } else {
            this.game.handleTerritoryClick(eHex.territoryId);
          }
        } else {
          this.game.selectedTerritoryId = null;
        }
      }
    }
  }
}
