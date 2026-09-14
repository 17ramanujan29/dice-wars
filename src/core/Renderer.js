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

    fitMapToScreen(){
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

        let Y_SCALE=0.75; // 斜め視点の潰し具合（0.6倍）
        let widthScale=availableWidth/(CONFIG.gridWidth*1.5+.5);
        let heightScale=availableHeight/(CONFIG.gridHeight*Math.sqrt(3)*Y_SCALE);
        CONFIG.hexSize=Math.min(widthScale,heightScale);
        let metrics=getHexMetrics(CONFIG.hexSize);
        let mapWidth=CONFIG.gridWidth * metrics.horizDist+CONFIG.hexSize*.5;
        let mapHeight=(CONFIG.gridHeight * metrics.vertDist + metrics.vertDist*.5)*Y_SCALE;
        this.camera.x=20+(availableWidth-mapWidth)/2; 
        this.camera.y=40+(availableHeight-mapHeight)/2;
    }
    render(){
        if(this.game.phase===`start`)return;
        let Y_SCALE=0.75;
        this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
        
        // 1. マップ床面を斜めに倒して描画
        this.ctx.save();
        this.ctx.translate(this.camera.x,this.camera.y);
        this.ctx.scale(1,Y_SCALE);
        this.game.territories.forEach(t=>{
            let baseColor=t.id===this.game.selectedTerritoryId?`#323232`:this.game.players[t.owner].color;
            t.hexes.forEach(h=>{
                let i=getHexCenter(h.c,h.r,CONFIG.hexSize);
                this.drawHexagon(i.x,i.y,CONFIG.hexSize,baseColor,null,0);
            });
        });
        this.drawBorders();
        this.drawHighlights();
        this.ctx.restore();
        
        // 2. 立体サイコロを真上に立ち上げて描画
        this.ctx.save();
        this.ctx.translate(this.camera.x,this.camera.y);
        this.game.territories.forEach(t=>{
            let n=getHexCenter(t.centerHex.c,t.centerHex.r,CONFIG.hexSize);
            this.drawDiceStack(n.x, n.y * Y_SCALE, t.dice, this.game.players[t.owner].color);
        });
        this.ctx.restore();
    }

    /*
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
*/
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
            this.ctx.lineWidth = isSelected ? 4 : 4;

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
    
/*
    drawDiceStack(x, y, count, color) {
        let width = Math.max(CONFIG.hexSize * .68, 6);
        let height = width * .75;
        let sideH = width * 1.05;
        let stepY = sideH * 1;

        let isDouble = count >= 5; // 5個以上なら2列にするフラグ
        let xOffset = width * 1.1; // 左右にずらす幅

        for (let i = 0; i < count; i++) {
            // 何段目に積むかを計算（2列の場合はインデックスを半分にする）
            let stackIdx = isDouble ? Math.floor(i / 2) : i;
            let cy = y - stackIdx * stepY;
            
            // 2列の場合は偶数・奇数でX座標を左右にずらす
            let tx = isDouble ? (x + (i % 2 === 0 ? -xOffset : xOffset)) : x;

            let topColor = this.shadeColor(color, 30);
            let leftColor = this.shadeColor(color, -5);
            let rightColor = this.shadeColor(color, -25);
            this.ctx.lineWidth = 1, this.ctx.lineJoin = `round`, this.ctx.strokeStyle = `rgba(0,0,0,0.4)`;
            
            this.ctx.fillStyle = topColor;
            this.ctx.beginPath();
            this.ctx.moveTo(tx, cy - sideH - height);
            this.ctx.lineTo(tx + width, cy - sideH);
            this.ctx.lineTo(tx, cy - sideH + height);
            this.ctx.lineTo(tx - width, cy - sideH);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();

            this.ctx.fillStyle = leftColor;
            this.ctx.beginPath();
            this.ctx.moveTo(tx - width, cy - sideH);
            this.ctx.lineTo(tx, cy - sideH + height);
            this.ctx.lineTo(tx, cy + height);
            this.ctx.lineTo(tx - width, cy);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
            
            this.ctx.fillStyle = rightColor;
            this.ctx.beginPath();
            this.ctx.moveTo(tx, cy - sideH + height);
            this.ctx.lineTo(tx + width, cy - sideH);
            this.ctx.lineTo(tx + width, cy);
            this.ctx.lineTo(tx, cy + height);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
            
            let pipNum = i === count - 1 ? Math.min(count, 6) : i % 6 + 1;
            let topCy = cy - sideH;
            let dots = [];
            pipNum === 1 ? dots = [[0, 0]] : pipNum === 2 ? dots = [[-.4, -.4], [.4, .4]] : pipNum === 3 ? dots = [[-.4, -.4], [0, 0], [.4, .4]] : pipNum === 4 ? dots = [[-.4, -.4], [.4, -.4], [-.4, .4], [.4, .4]] : pipNum === 5 ? dots = [[-.4, -.4], [.4, -.4], [0, 0], [-.4, .4], [.4, .4]] : pipNum === 6 && (dots = [[-.4, -.4], [-.4, 0], [-.4, .4], [.4, -.4], [.4, 0], [.4, .4]]);
            
            let pipRadius = pipNum === 1 ? width * .22 : width * .12
            let dotColor = pipNum === 1 ? `#ff3333` : `#ffffff`;
            dots.forEach(pt => {
                let n_x = tx + (pt[0] - pt[1]) * (width * .45);
                let r_y = topCy + (pt[0] + pt[1]) * (dots * .45);
                this.ctx.save();
                this.ctx.translate(n_x, r_y);
                this.ctx.scale(1, .5);
                this.ctx.fillStyle = dotColor;
                this.ctx.beginPath();
                this.ctx.arc(0, 0, pipRadius, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.restore()
            })
        }
        
        // 上部のテキストの高さも2列の場合に合わせて調整
        let topStackIdx = isDouble ? Math.floor((count - 1) / 2) : count - 1;
        let textL = y - topStackIdx * stepY - sideH - height - 4;
        this.ctx.fillStyle = `#ffffff`, this.ctx.font = `bold ${Math.max(Math.floor(width * 1.3), 11)}px sans-serif`, this.ctx.textAlign = `center`, this.ctx.textBaseline = `bottom`, this.ctx.shadowColor = `black`, this.ctx.shadowBlur = 4, this.ctx.fillText(count, x, textL), this.ctx.shadowBlur = 0
    }
*/
    drawDiceStack(x, y, count, color) {
        let width = Math.max(CONFIG.hexSize * .68, 6);
        let height = width * .75;
        let stepH = width * 1;
        let stepY = stepH * 1;

        let isDouble = count >= 5;
        let xOffset = width * 0.5; // 左右のずれ幅

        let startY = y;

        for (let i = 0; i < count; i++) {
            let tx = x;
            let stackIdx = i;

            if (isDouble) {
                if (i < 4) {
                    // 4個目までは左側の列に積む
                    tx = x - xOffset;
                    stackIdx = i;
                } else {
                    // 5個目以降は右側の列に積む
                    tx = x + xOffset;
                    stackIdx = i - 4;
                    startY = y+ height;
                }
            }

            let cy = startY - stackIdx * stepY;
            let topColor = this.shadeColor(color, 30); 
            let leftColor = this.shadeColor(color, -5);
            let rightColor = this.shadeColor(color, -25);
            
            this.ctx.lineWidth = 1;
            this.ctx.lineJoin = `round`;
            this.ctx.strokeStyle = `rgba(0,0,0,0.4)`;
            
            // ダイス本体の描画
            this.ctx.fillStyle = topColor;
            this.ctx.beginPath(); 
            this.ctx.moveTo(tx, cy - stepH - height); 
            this.ctx.lineTo(tx + width, cy - stepH); 
            this.ctx.lineTo(tx, cy - stepH + height); 
            this.ctx.lineTo(tx - width, cy - stepH); 
            this.ctx.closePath(); 
            this.ctx.fill(); 
            this.ctx.stroke();
            
            this.ctx.fillStyle = leftColor;
            this.ctx.beginPath(); 
            this.ctx.moveTo(tx - width, cy - stepH); 
            this.ctx.lineTo(tx, cy - stepH + height); 
            this.ctx.lineTo(tx, cy + height); 
            this.ctx.lineTo(tx - width, cy); 
            this.ctx.closePath(); 
            this.ctx.fill(); 
            this.ctx.stroke();
            
            this.ctx.fillStyle = rightColor;
            this.ctx.beginPath(); 
            this.ctx.moveTo(tx, cy - stepH + height); 
            this.ctx.lineTo(tx + width, cy - stepH); 
            this.ctx.lineTo(tx + width, cy); 
            this.ctx.lineTo(tx, cy + height); 
            this.ctx.closePath(); 
            this.ctx.fill(); 
            this.ctx.stroke();
            
            // ダイスの目の描画
            let pipNum = i === count - 1 ? Math.min(count, 6) : i % 6 + 1;
            let topCy = cy - stepH;
            let dots = [];
            pipNum === 1 ? dots = [[0, 0]] : pipNum === 2 ? dots = [[-.4, -.4], [.4, .4]] : pipNum === 3 ? dots = [[-.4, -.4], [0, 0], [.4, .4]] : pipNum === 4 ? dots = [[-.4, -.4], [.4, -.4], [-.4, .4], [.4, .4]] : pipNum === 5 ? dots = [[-.4, -.4], [.4, -.4], [0, 0], [-.4, .4], [.4, .4]] : pipNum === 6 && (dots = [[-.4, -.4], [-.4, 0], [-.4, .4], [.4, -.4], [.4, 0], [.4, .4]]);
            
            let pipRadius = pipNum === 1 ? width * .22 : width * .12;
            let dotColor = pipNum === 1 ? `#000000` : `#000000`;
            dots.forEach(pt => {
                let n_x = tx + (pt[0] - pt[1]) * (width * .45), r_y = topCy + (pt[0] + pt[1]) * (height * .45);
                this.ctx.save(); 
                this.ctx.translate(n_x, r_y); 
                this.ctx.scale(1, .5); 
                this.ctx.fillStyle = dotColor; 
                this.ctx.beginPath(); 
                this.ctx.arc(0, 0, pipRadius, 0, Math.PI * 2); 
                this.ctx.fill(); 
                this.ctx.restore();
            });
        }
        
        // 合計数のテキスト位置を、一番高い列に合わせて調整
        let maxStackIdx = isDouble ? Math.max(3, count - 5) : count - 1;
        let textL = startY - maxStackIdx * stepY - stepH - height - 4;
        this.ctx.fillStyle = `#ffffff`; 
        this.ctx.font = `bold ${Math.max(Math.floor(width * 1.3), 11)}px sans-serif`; 
        this.ctx.textAlign = `center`; 
        this.ctx.textBaseline = `bottom`; 
        this.ctx.shadowColor = `black`; 
        this.ctx.shadowBlur = 4; 
        this.ctx.fillText(count, x, textL); 
        this.ctx.shadowBlur = 0;
    }

    shadeColor(col, pct) {
        let R = parseInt(col.substring(1,3),16), G = parseInt(col.substring(3,5),16), B = parseInt(col.substring(5,7),16);
        R = Math.min(255, parseInt(R * (100 + pct) / 100)); G = Math.min(255, parseInt(G * (100 + pct) / 100)); B = Math.min(255, parseInt(B * (100 + pct) / 100));
        return "#" + (R<16?"0":"")+R.toString(16) + (G<16?"0":"")+G.toString(16) + (B<16?"0":"")+B.toString(16);
    }
}