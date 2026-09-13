import { CONFIG } from '../config.js';
import { getHexCenter, getValidNeighbors, getHexMetrics } from '../utils/hexUtils.js';

export class Renderer {
    constructor(canvasId, gameController) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.game = gameController;
        this.camera = { x: 0, y: 0, scale: 1 };
        this.isRunning = false;
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
        requestAnimationFrame(() => this.loop()); // アニメーションループ
    }

    resize() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        this.fitMapToScreen();
    }

    fitMapToScreen() {
        const availableW = this.canvas.width * 0.9;
        const availableH = this.canvas.height * 0.85;
        const maxW = availableW / (CONFIG.gridWidth * 1.5 + 0.5);
        const maxH = availableH / (CONFIG.gridHeight * Math.sqrt(3));
        CONFIG.hexSize = Math.min(maxW, maxH);

        const metrics = getHexMetrics(CONFIG.hexSize);
        const pixelW = CONFIG.gridWidth * metrics.horizDist + CONFIG.hexSize * 0.5;
        const pixelH = CONFIG.gridHeight * metrics.vertDist + metrics.vertDist * 0.5;
        
        this.camera.x = (this.canvas.width - pixelW) / 2;
        this.camera.y = (this.canvas.height - pixelH) / 2 + 20;
    }

    

    fitMapToScreen() {
    // 画面内の各方向の余白（マージン）を設定
    let leftMargin = 20;     // 左端はUIがないので少しだけ空ける
    let rightMargin = 240;   // 右端はPlayers Infoなどを避けるために広く空ける
    let topMargin = 40;      // 上端もUIがないので少しだけ空ける
    let bottomMargin = 120;  // 下端はボタン類を避けるために空ける

    // マップを最大限広げられる「描画可能領域」を計算
    let availableWidth = this.canvas.width - leftMargin - rightMargin;
    let availableHeight = this.canvas.height - topMargin - bottomMargin;
    
    // 画面が極端に狭い場合のフェイルセーフ
    if (availableWidth < 100) availableWidth = 100;
    if (availableHeight < 100) availableHeight = 100;

    // グリッド全体の幅と高さの比率から、最適なHexサイズを算出
    let widthScale = availableWidth / (CONFIG.gridWidth * 1.5 + 0.5);
    let heightScale = availableHeight / (CONFIG.gridHeight * Math.sqrt(3));
    CONFIG.hexSize = Math.min(widthScale, heightScale); // 画面内に収まるように小さい方を採用
    
    // 決定したHexサイズを使って、実際のマップの描画サイズを計算
    let metrics = getHexMetrics(CONFIG.hexSize);
    let mapWidth = CONFIG.gridWidth * metrics.horizDist + CONFIG.hexSize * 0.5;
    let mapHeight = CONFIG.gridHeight * metrics.vertDist + metrics.vertDist * 0.5;
    
    // 指定した余白の範囲内で、マップが中央にくるようにカメラ位置を調整
    this.camera.x = leftMargin + (availableWidth - mapWidth) / 2;
    this.camera.y = topMargin + (availableHeight - mapHeight) / 2;
}


    render() {
        if (this.game.phase === 'start') return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();
        this.ctx.translate(this.camera.x, this.camera.y);

        this.game.territories.forEach(terr => {
            const baseColor = (terr.id === this.game.selectedTerritoryId) ? '#323232' : this.game.players[terr.owner].color;
            terr.hexes.forEach(h => {
                const p = getHexCenter(h.c, h.r, CONFIG.hexSize);
                this.drawHexagon(p.x, p.y, CONFIG.hexSize, baseColor, null, 0);
            });
        });

        this.drawBorders();
        this.drawHighlights();

        this.game.territories.forEach(terr => {
            const pos = getHexCenter(terr.centerHex.c, terr.centerHex.r, CONFIG.hexSize);
            this.drawDiceStack(pos.x, pos.y, terr.dice, this.game.players[terr.owner].color);
        });

        this.ctx.restore();
    }

    drawHexagon(x, y, size, fillStyle, strokeStyle, lineWidth = 1) {
        this.ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const rad = Math.PI / 180 * (60 * i);
            const hx = x + size * Math.cos(rad), hy = y + size * Math.sin(rad);
            i === 0 ? this.ctx.moveTo(hx, hy) : this.ctx.lineTo(hx, hy);
        }
        this.ctx.closePath();
        if (fillStyle) { this.ctx.fillStyle = fillStyle; this.ctx.fill(); }
        if (strokeStyle) { this.ctx.lineWidth = lineWidth; this.ctx.strokeStyle = strokeStyle; this.ctx.stroke(); }
    }

    drawHighlights() {
        const selId = this.game.selectedTerritoryId;
        if (selId === null) return;
        const selTerr = this.game.territories.find(t => t.id === selId);

        selTerr.hexes.forEach(h => {
            const p = getHexCenter(h.c, h.r, CONFIG.hexSize);
            this.drawHexagon(p.x, p.y, CONFIG.hexSize, CONFIG.selectedHighlight, null, 0);
        });

        this.game.territories.filter(t => t.owner !== selTerr.owner && this.game.areAdjacent(selTerr, t)).forEach(targetTerr => {
            targetTerr.hexes.forEach(h => {
                const p = getHexCenter(h.c, h.r, CONFIG.hexSize);
                this.drawHexagon(p.x, p.y, CONFIG.hexSize, CONFIG.targetHighlight, null, 0);
            });
        });
    }

    drawBorders() {
        this.ctx.lineWidth = 3; this.ctx.lineCap = 'round'; this.ctx.lineJoin = 'round';
        const edgeMap = [0, 5, 4, 3, 2, 1];
        const dirs = [ [[+1,0],[+1,-1],[0,-1],[-1,-1],[-1,0],[0,+1]], [[+1,+1],[+1,0],[0,-1],[-1,0],[-1,+1],[0,+1]] ];

        [...this.game.territories.filter(t => t.id !== this.game.selectedTerritoryId), this.game.territories.find(t => t.id === this.game.selectedTerritoryId)]
        .filter(t => t)
        .forEach(t => {
            const isSelected = (t.id === this.game.selectedTerritoryId);
            this.ctx.strokeStyle = isSelected ? '#ffffff' : '#323232';
            this.ctx.lineWidth = isSelected ? 5 : 4;

            t.hexes.forEach(h => {
                const center = getHexCenter(h.c, h.r, CONFIG.hexSize);
                for (let i = 0; i < 6; i++) {
                    const d = dirs[h.c & 1][i], nc = h.c + d[0], nr = h.r + d[1];
                    let isBorder = (nc < 0 || nc >= CONFIG.gridWidth || nr < 0 || nr >= CONFIG.gridHeight) || 
                                   (!this.game.hexGrid[nc][nr].active || this.game.hexGrid[nc][nr].territoryId !== t.id);
                    
                    if (isBorder) {
                        const rad1 = Math.PI / 180 * (60 * edgeMap[i]), rad2 = Math.PI / 180 * (60 * ((edgeMap[i] + 1) % 6));
                        this.ctx.beginPath();
                        this.ctx.moveTo(center.x + CONFIG.hexSize * Math.cos(rad1), center.y + CONFIG.hexSize * Math.sin(rad1));
                        this.ctx.lineTo(center.x + CONFIG.hexSize * Math.cos(rad2), center.y + CONFIG.hexSize * Math.sin(rad2));
                        this.ctx.stroke();
                    }
                }
            });
        });
    }

    drawDiceStack(x, y, count, color) {
        const diceSize = Math.max(CONFIG.hexSize * 0.90, 6);
        const stackOffset = Math.max(CONFIG.hexSize * 0.35, 4);
        const startY = y + (count * stackOffset) / 2 - diceSize;

        for (let i = 0; i < count; i++) {
            const dy = startY - (i * stackOffset);
            this.ctx.fillStyle = this.shadeColor(color, -20);
            this.ctx.fillRect(x - diceSize, dy, diceSize * 2, diceSize * 2);
            this.ctx.fillStyle = this.shadeColor(color, 20);
            this.ctx.beginPath();
            this.ctx.moveTo(x - diceSize, dy); this.ctx.lineTo(x, dy - diceSize/2);
            this.ctx.lineTo(x + diceSize, dy); this.ctx.lineTo(x, dy + diceSize/2);
            this.ctx.fill();
            
            this.ctx.fillStyle = '#fff';
            this.ctx.beginPath(); this.ctx.arc(x, dy + diceSize, Math.max(diceSize*0.15, 1), 0, Math.PI*2); this.ctx.fill();
            if(i === count - 1) { this.ctx.beginPath(); this.ctx.arc(x, dy, Math.max(diceSize*0.15, 1), 0, Math.PI*2); this.ctx.fill(); }
            this.ctx.strokeStyle = 'rgba(0,0,0,0.5)'; this.ctx.lineWidth = 1;
            this.ctx.strokeRect(x - diceSize, dy, diceSize * 2, diceSize * 2);
        }
        this.ctx.fillStyle = '#fff'; this.ctx.font = `bold ${Math.max(Math.floor(diceSize * 1.1), 10)}px sans-serif`;
        this.ctx.textAlign = 'center'; this.ctx.textBaseline = 'middle';
        this.ctx.shadowColor = 'black'; this.ctx.shadowBlur = 4;
        this.ctx.fillText(count, x, startY - ((count - 1) * stackOffset) - (diceSize * 0.8));
        this.ctx.shadowBlur = 0;
    }

    shadeColor(col, pct) {
        let R = parseInt(col.substring(1,3),16), G = parseInt(col.substring(3,5),16), B = parseInt(col.substring(5,7),16);
        R = Math.min(255, parseInt(R * (100 + pct) / 100)); G = Math.min(255, parseInt(G * (100 + pct) / 100)); B = Math.min(255, parseInt(B * (100 + pct) / 100));
        return "#" + (R<16?"0":"")+R.toString(16) + (G<16?"0":"")+G.toString(16) + (B<16?"0":"")+B.toString(16);
    }
}