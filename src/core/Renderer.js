import { GAME_CONFIG, RENDER_CONFIG } from '../config/index.js';
import { getHexCenter, getHexMetrics } from '../utils/hexUtils.js';

export class Renderer {
    constructor(canvasId, gameController) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.game = gameController;
        this.camera = { x: 0, y: 0, scale: 1 };
        this.isRunning = false;
        this.hexSize = RENDER_CONFIG.initialHexSize;
        this.canDrag = false;
    }

    start() {
        this.isRunning = true;
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.loop();
    }

    loop() {
        if (!this.isRunning) return;
        this.render();
        requestAnimationFrame(() => this.loop());
    }

    resize() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        this.fitMapToScreen();
    }

    fitMapToScreen() {
        const padding = RENDER_CONFIG.mapPadding;

        let availableWidth = Math.max(this.canvas.width - padding * 2, RENDER_CONFIG.minAvailableWidth);
        let availableHeight = Math.max(this.canvas.height - padding * 2, RENDER_CONFIG.minAvailableWidth);

        const widthScale = availableWidth / (GAME_CONFIG.gridWidth * 1.5 + 0.5);
        const heightScale = availableHeight / (GAME_CONFIG.gridHeight * Math.sqrt(3) * RENDER_CONFIG.yScale);
        
        this.hexSize = Math.max(RENDER_CONFIG.minHexSize, Math.min(widthScale, heightScale));
        
        const metrics = getHexMetrics(this.hexSize);
        const mapWidth = GAME_CONFIG.gridWidth * metrics.horizDist + this.hexSize * 0.5;
        const mapHeight = (GAME_CONFIG.gridHeight * metrics.vertDist + metrics.vertDist * 0.5) * RENDER_CONFIG.yScale;
        
        this.camera.x = (this.canvas.width - mapWidth) / 2 + padding;
        this.camera.y = (this.canvas.height - mapHeight) / 2 + padding;

        this.canDrag = (mapWidth > this.canvas.width) || (mapHeight > this.canvas.height);
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    render() {
        if (this.game.phase === 'start') return;
        this.clear();
        
        // 1. マップ床面描画（Y軸スケーリング）
        this.ctx.save();
        this.ctx.translate(this.camera.x, this.camera.y);
        this.ctx.scale(1, RENDER_CONFIG.yScale);
        
        this.game.territories.forEach(t => {
            const baseColor = t.id === this.game.selectedTerritoryId ? '#323232' : this.game.players[t.owner].color;
            t.hexes.forEach(h => {
                const p = getHexCenter(h.c, h.r, this.hexSize);
                this.drawHexagon(p.x, p.y, this.hexSize, baseColor, null, 0);
            });
        });
        
        this.drawBorders();
        this.drawHighlights();
        this.ctx.restore();
        
        // 2. 立体ダイススタック描画
        this.ctx.save();
        this.ctx.translate(this.camera.x, this.camera.y);
        this.game.territories.forEach(t => {
            const n = getHexCenter(t.centerHex.c, t.centerHex.r, this.hexSize);
            this.drawDiceStack(n.x, n.y * RENDER_CONFIG.yScale, t.dice, this.game.players[t.owner].color);
        });
        this.ctx.restore();
    }

    drawHexagon(x, y, size, fillStyle, strokeStyle, lineWidth = 1) {
        this.ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const rad = (Math.PI / 180) * (60 * i);
            const hx = x + size * Math.cos(rad);
            const hy = y + size * Math.sin(rad);
            i === 0 ? this.ctx.moveTo(hx, hy) : this.ctx.lineTo(hx, hy);
        }
        this.ctx.closePath();
        if (fillStyle) {
            this.ctx.fillStyle = fillStyle;
            this.ctx.fill();
        }
        if (strokeStyle) {
            this.ctx.lineWidth = lineWidth;
            this.ctx.strokeStyle = strokeStyle;
            this.ctx.stroke();
        }
    }

    drawHighlights() {
        const selId = this.game.selectedTerritoryId;
        if (selId === null) return;
        const selTerr = this.game.territories.find(t => t.id === selId);
        if (!selTerr) return;

        selTerr.hexes.forEach(h => {
            const p = getHexCenter(h.c, h.r, this.hexSize);
            this.drawHexagon(p.x, p.y, this.hexSize, RENDER_CONFIG.selectedHighlight, null, 0);
        });

        this.game.territories
            .filter(t => t.owner !== selTerr.owner && this.game.areAdjacent(selTerr, t))
            .forEach(targetTerr => {
                targetTerr.hexes.forEach(h => {
                    const p = getHexCenter(h.c, h.r, this.hexSize);
                    this.drawHexagon(p.x, p.y, this.hexSize, RENDER_CONFIG.targetHighlight, null, 0);
                });
            });
    }

    drawBorders() {
        this.ctx.lineCap = 'round'; 
        this.ctx.lineJoin = 'round';
        const edgeMap = [0, 5, 4, 3, 2, 1];
        const dirs = [ 
            [[+1, 0], [+1, -1], [0, -1], [-1, -1], [-1, 0], [0, +1]], 
            [[+1, +1], [+1, 0], [0, -1], [-1, 0], [-1, +1], [0, +1]] 
        ];

        const selectedTerritory = this.game.territories.find(t => t.id === this.game.selectedTerritoryId);
        
        const sortedTerritories = [
            ...this.game.territories.filter(t => t.id !== this.game.selectedTerritoryId), 
            ...(selectedTerritory ? [selectedTerritory] : [])
        ];

        sortedTerritories.forEach(t => {
            const isSelected = (t.id === this.game.selectedTerritoryId);
            this.ctx.strokeStyle = isSelected ? '#ffffff' : '#323232';
            this.ctx.lineWidth = 4;

            t.hexes.forEach(h => {
                const center = getHexCenter(h.c, h.r, this.hexSize);
                for (let i = 0; i < 6; i++) {
                    const d = dirs[h.c & 1][i];
                    const nc = h.c + d[0];
                    const nr = h.r + d[1];

                    const isBorder = (nc < 0 || nc >= GAME_CONFIG.gridWidth || nr < 0 || nr >= GAME_CONFIG.gridHeight) || 
                                   (!this.game.hexGrid[nc][nr].active || this.game.hexGrid[nc][nr].territoryId !== t.id);
                    
                    if (isBorder) {
                        const rad1 = (Math.PI / 180) * (60 * edgeMap[i]);
                        const rad2 = (Math.PI / 180) * (60 * ((edgeMap[i] + 1) % 6));
                        this.ctx.beginPath();
                        this.ctx.moveTo(center.x + this.hexSize * Math.cos(rad1), center.y + this.hexSize * Math.sin(rad1));
                        this.ctx.lineTo(center.x + this.hexSize * Math.cos(rad2), center.y + this.hexSize * Math.sin(rad2));
                        this.ctx.stroke();
                    }
                }
            });
        });
    }

    drawDiceStack(x, y, count, color) {
        const width = Math.max(this.hexSize * 0.72, 6);
        const height = width * 0.75;
        const stepH = width;
        const stepY = stepH;

        const isDouble = count >= RENDER_CONFIG.diceDoubleColumnThreshold;
        const xOffset = width * 0.5;

        const topColor = this.shadeColor(color, RENDER_CONFIG.shadePercentTop); 
        const leftColor = this.shadeColor(color, RENDER_CONFIG.shadePercentLeft);
        const rightColor = this.shadeColor(color, RENDER_CONFIG.shadePercentRight);

        for (let i = 0; i < count; i++) {
            let tx = x;
            let stackIdx = i;
            let startY = y;

            if (isDouble) {
                if (i < RENDER_CONFIG.diceColumnMaxCount) {
                    tx = x - xOffset;
                    stackIdx = i;
                } else {
                    tx = x + xOffset;
                    stackIdx = i - RENDER_CONFIG.diceColumnMaxCount;
                    startY = y + height;
                }
            }

            const cy = startY - stackIdx * stepY;
            
            this.ctx.lineWidth = 2;
            this.ctx.lineJoin = 'round';
            this.ctx.strokeStyle = 'rgba(0,0,0,0.4)';
            
            // 上面
            this.ctx.fillStyle = topColor;
            this.ctx.beginPath(); 
            this.ctx.moveTo(tx, cy - stepH - height); 
            this.ctx.lineTo(tx + width, cy - stepH); 
            this.ctx.lineTo(tx, cy - stepH + height); 
            this.ctx.lineTo(tx - width, cy - stepH); 
            this.ctx.closePath(); 
            this.ctx.fill(); 
            this.ctx.stroke();
            
            // 左面
            this.ctx.fillStyle = leftColor;
            this.ctx.beginPath(); 
            this.ctx.moveTo(tx - width, cy - stepH); 
            this.ctx.lineTo(tx, cy - stepH + height); 
            this.ctx.lineTo(tx, cy + height); 
            this.ctx.lineTo(tx - width, cy); 
            this.ctx.closePath(); 
            this.ctx.fill(); 
            this.ctx.stroke();
            
            // 右面
            this.ctx.fillStyle = rightColor;
            this.ctx.beginPath(); 
            this.ctx.moveTo(tx, cy - stepH + height); 
            this.ctx.lineTo(tx + width, cy - stepH); 
            this.ctx.lineTo(tx + width, cy); 
            this.ctx.lineTo(tx, cy + height); 
            this.ctx.closePath(); 
            this.ctx.fill(); 
            this.ctx.stroke();
            
            // ダイスの目（Pip）の描画
            const pipNum = i === count - 1 ? Math.min(count, GAME_CONFIG.diceSides) : (i % GAME_CONFIG.diceSides) + 1;
            this.drawDicePips(tx, cy - stepH, pipNum, width, height);
        }
    }

    drawDicePips(tx, topCy, pipNum, width, height) {
        const dotsMap = {
            1: [[0, 0]],
            2: [[-0.4, -0.4], [0.4, 0.4]],
            3: [[-0.4, -0.4], [0, 0], [0.4, 0.4]],
            4: [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]],
            5: [[-0.4, -0.4], [0.4, -0.4], [0, 0], [-0.4, 0.4], [0.4, 0.4]],
            6: [[-0.4, -0.4], [-0.4, 0], [-0.4, 0.4], [0.4, -0.4], [0.4, 0], [0.4, 0.4]]
        };

        const dots = dotsMap[pipNum] || [];
        const pipRadius = pipNum === 1 ? width * 0.32 : width * 0.18;

        dots.forEach(pt => {
            const nx = tx + (pt[0] - pt[1]) * (width * 0.45);
            const ry = topCy + (pt[0] + pt[1]) * (height * 0.45);
            this.ctx.save(); 
            this.ctx.translate(nx, ry); 
            this.ctx.scale(1, 0.5); 
            this.ctx.fillStyle = '#000000'; 
            this.ctx.beginPath(); 
            this.ctx.arc(0, 0, pipRadius, 0, Math.PI * 2); 
            this.ctx.fill(); 
            this.ctx.restore();
        });
    }

    shadeColor(col, pct) {
        let R = parseInt(col.substring(1, 3), 16);
        let G = parseInt(col.substring(3, 5), 16);
        let B = parseInt(col.substring(5, 7), 16);

        R = Math.min(255, Math.floor(R * (100 + pct) / 100)); 
        G = Math.min(255, Math.floor(G * (100 + pct) / 100)); 
        B = Math.min(255, Math.floor(B * (100 + pct) / 100));

        const toHex = (n) => (n < 16 ? "0" : "") + n.toString(16);
        return `#${toHex(R)}${toHex(G)}${toHex(B)}`;
    }
}