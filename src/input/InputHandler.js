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
    this.isPinching = false;
    this.lastTouchTime = 0;
    this.pinchStartDistance = 0;
    this.pinchStartScale = 1;

    this.initEventListeners();
  }

  initEventListeners() {
    this.canvas.addEventListener("mousedown", (e) => this.handlePointerDown(e));
    this.canvas.addEventListener("mousemove", (e) => this.handlePointerMove(e));
    this.canvas.addEventListener("wheel", (e) => this.handleWheel(e), { passive: false });
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

  getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  handleWheel(e) {
    if (!e.ctrlKey && !e.metaKey) return;
    if (this.game.phase !== "playing") return;

    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const pointerX = e.clientX - rect.left;
    const pointerY = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? RENDER_CONFIG.wheelZoomFactor : 1 / RENDER_CONFIG.wheelZoomFactor;

    this.renderer.setZoom(this.renderer.camera.scale * factor, pointerX, pointerY);
  }

  handlePointerDown(e) {
    if (e.type === "touchstart") {
      if (e.touches.length === 2) {
        this.isPinching = true;
        this.isDragging = false;
        this.pinchStartDistance = this.getTouchDistance(e.touches);
        this.pinchStartScale = this.renderer.camera.scale;
        return;
      }
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
    if (e.type === "touchmove" && e.touches.length === 2) {
      e.preventDefault();
      this.isDragging = false;
      this.isPinching = true;

      const currentDistance = this.getTouchDistance(e.touches);
      if (this.pinchStartDistance === 0) {
        this.pinchStartDistance = currentDistance;
        this.pinchStartScale = this.renderer.camera.scale;
        return;
      }

      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const rect = this.canvas.getBoundingClientRect();
      const anchorX = midX - rect.left;
      const anchorY = midY - rect.top;
      const ratio = currentDistance / this.pinchStartDistance;

      this.renderer.setZoom(this.pinchStartScale * ratio, anchorX, anchorY);
      return;
    }

    if (this.isPinching) return;

    if (!this.isDragging || this.game.phase !== "playing") return;
    if (e.type === "touchmove") e.preventDefault();

    const currentPos = this.getPos(e);
    const dx = currentPos.x - this.lastPos.x;
    const dy = currentPos.y - this.lastPos.y;

    this.renderer.camera.x += dx;
    this.renderer.camera.y += dy;
    this.lastPos = currentPos;
  }

  handlePointerUp(e) {
    if (e.type === "touchend") {
      if (e.touches && e.touches.length >= 2) return;
      this.isPinching = false;
      this.pinchStartDistance = 0;
      this.lastTouchTime = Date.now();
    }

    if (!this.isDragging && !this.isPinching) return;
    this.isDragging = false;

    if (e.type === "mouseup") {
      if (Date.now() - this.lastTouchTime < UI_CONFIG.touchDebounceMs) return;
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
      const localX = (pos.x - this.renderer.camera.x) / this.renderer.camera.scale;
      const localY = (pos.y - this.renderer.camera.y) / (this.renderer.camera.scale * RENDER_CONFIG.yScale);
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
