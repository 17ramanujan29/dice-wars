import { CONFIG } from './config.js';
import { GameController } from './core/GameController.js';
import { Renderer } from './core/Renderer.js';
import { pixelToHex } from './utils/hexUtils.js';

const game = new GameController();
const renderer = new Renderer('gameCanvas', game);

// UI更新バインディング
game.onStateChange = (state) => {
    if (state.phase === 'gameover') {
        document.getElementById('turn-info').innerHTML = `<span style="color: ${state.winner.color}; font-size: 2rem;">${state.winner.name} Wins!</span><button id="restart-btn" class="ui-panel bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded mt-4">Play Again</button>`;
        document.getElementById('end-turn-btn').style.display = 'none';
        document.getElementById('restart-btn').onclick = () => location.reload();
        return;
    }
    
    const curr = state.players[state.currentPlayerIndex];
    document.getElementById('turn-info').innerHTML = `<span style="color: ${curr.color}; text-shadow: 1px 1px 2px #000;">${curr.name}'s Turn</span>`;
    
    const statsContainer = document.getElementById('player-stats');
    statsContainer.innerHTML = '';
    state.players.forEach(p => {
        const terrs = state.getOwnedTerritories(p.id);
        if (terrs.length === 0) return;
        const maxConn = state.getMaxConnected(p.id);
        const div = document.createElement('div');
        div.className = `flex justify-between items-center gap-4 mb-1 ${p.id === state.currentPlayerIndex ? 'font-bold' : 'opacity-70'}`;
        div.style.color = p.color;
        
        let badges = '';
        if(state.rules.greatPower && maxConn >= CONFIG.greatPowerThreshold) badges += '<span class="bg-red-600 text-white text-xs px-2 py-0.5 rounded ml-2">大国</span>';
        if(state.rules.smallCountryBonus && maxConn <= CONFIG.smallCountryThreshold) badges += '<span class="bg-blue-600 text-white text-xs px-2 py-0.5 rounded ml-2">小国</span>';
        
        div.innerHTML = `<span>${p.name}${badges}</span><span>最大連続: <strong>${maxConn}</strong> <span class="text-xs opacity-80">(${terrs.length}領土)</span></span>`;
        statsContainer.appendChild(div);
    });
};

game.onBattleStart = (src, tgt, atkP, defP) => {
    document.getElementById('atk-player-name').innerText = atkP.name; document.getElementById('atk-player-name').style.color = atkP.color;
    document.getElementById('def-player-name').innerText = defP.name; document.getElementById('def-player-name').style.color = defP.color;
    document.getElementById('atk-dice-count').innerText = src.dice; document.getElementById('def-dice-count').innerText = tgt.dice;
    document.getElementById('atk-score').innerText = '...'; document.getElementById('def-score').innerText = '...';
    document.getElementById('battle-result').innerText = '';
    const modal = document.getElementById('battle-modal');
    modal.style.display = 'block'; modal.classList.add('dice-roll-anim');
    setTimeout(() => modal.classList.remove('dice-roll-anim'), CONFIG.battleAnimationMs);
};

game.onBattleEnd = (atkScore, defScore, type) => {
    document.getElementById('atk-score').innerText = atkScore; document.getElementById('def-score').innerText = defScore;
    const resEl = document.getElementById('battle-result');
    if(type === 'win') { resEl.innerText = "Attacker Wins!"; resEl.style.color = '#2ecc71'; }
    else if(type === 'draw') { resEl.innerText = "Draw!"; resEl.style.color = '#f1c40f'; }
    else { resEl.innerText = "Defender Wins!"; resEl.style.color = '#e74c3c'; }
    setTimeout(() => { document.getElementById('battle-modal').style.display = 'none'; }, CONFIG.battleResultDisplayMs);
};

// 入力イベント設定
let dragStart = {x: 0, y: 0};
const canvas = document.getElementById('gameCanvas');
const getPos = (e) => ({ x: (e.touches ? e.touches[0].clientX : e.clientX), y: (e.touches ? e.touches[0].clientY : e.clientY) });

const onDown = (e) => { if(e.type==='touchstart') e.preventDefault(); if(game.phase === 'playing') dragStart = getPos(e); };
const onUp = (e) => {
    if(e.type==='touchend') e.preventDefault();
    if(game.phase !== 'playing') return;
    const pos = e.changedTouches ? {x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY} : getPos(e);
    if (Math.hypot(pos.x - dragStart.x, pos.y - dragStart.y) < CONFIG.clickTolerance) {
        const hexCoords = pixelToHex(pos.x - renderer.camera.x, pos.y - renderer.camera.y, CONFIG.hexSize);
        if(hexCoords.col >= 0 && hexCoords.col < CONFIG.gridWidth && hexCoords.row >= 0 && hexCoords.row < CONFIG.gridHeight) {
            const hex = game.hexGrid[hexCoords.col][hexCoords.row];
            hex && hex.active ? game.handleTerritoryClick(hex.territoryId) : (game.selectedTerritoryId = null);
        }
    }
};

canvas.addEventListener('mousedown', onDown); window.addEventListener('mouseup', onUp);
canvas.addEventListener('touchstart', onDown, {passive: false}); window.addEventListener('touchend', onUp, {passive: false});

// ボタンイベント設定
document.querySelectorAll('.player-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const rules = {};
        document.querySelectorAll('.rule-toggle').forEach(chk => rules[chk.dataset.rule] = chk.checked);
        game.startGame(parseInt(e.target.dataset.players), rules);
        document.getElementById('start-screen').style.display = 'none';
        document.getElementById('end-turn-btn').classList.remove('hidden');
        document.getElementById('quit-game-btn').classList.remove('hidden');
        renderer.start();
    });
});
document.getElementById('end-turn-btn').addEventListener('click', () => game.endTurn());
document.getElementById('quit-game-btn').addEventListener('click', () => { if(confirm('終了しますか？')) location.reload(); });