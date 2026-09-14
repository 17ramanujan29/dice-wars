import { CONFIG } from './config.js';
import { GameController } from './core/GameController.js';
import { Renderer } from './core/Renderer.js';
import { pixelToHex } from './utils/hexUtils.js';

const game = new GameController();
const renderer = new Renderer('gameCanvas', game);

// UI更新バインディング
game.onStateChange = (state) => {
    if (state.phase === 'gameover') {
        document.getElementById('turn-info').innerHTML = `
            <span style="color: ${state.winner.color}; font-size: 2rem;">${state.winner.name} Wins!</span>
            <button id="restart-btn" class="ui-panel bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded mt-4">Play Again</button>
        `;
        document.getElementById('end-turn-btn').style.display = 'none';
        // 変更: リロードではなくスタート画面に戻す
        document.getElementById('restart-btn').onclick = () => {
            returnToStartScreen();
        };
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

        // --- 開発確認用ログ ---
        // game.onStateChange 内に追加
        console.log("現在のルール設定:", game.rules);
        
        // 追加: プレイヤーの合計ダイス数を計算
        const totalDice = terrs.reduce((sum, t) => sum + t.dice, 0);
        
        const div = document.createElement('div');
        div.className = `flex justify-between items-center gap-4 mb-1 ${p.id === state.currentPlayerIndex ? 'font-bold' : 'opacity-70'}`;
        div.style.color = p.color;
        
        let badges = '';
        // 変更: state.rules ではなく game.rules を参照する
        if(game.rules.greatPower && maxConn >= game.rules.greatPowerThreshold) {
            badges += `<span class="bg-red-600 text-white text-xs px-2 py-0.5 rounded ml-2 shadow-sm border border-red-400">大国</span>`;
        }
        if(game.rules.smallCountryBonus && maxConn <= game.rules.smallCountryThreshold) {
            badges += `<span class="bg-blue-600 text-white text-xs px-2 py-0.5 rounded ml-2 shadow-sm border border-blue-400">小国</span>`;
        }

        // 表示内容に「合計ダイス数」を追記
        div.innerHTML = `
            <span>${p.name}${badges}</span>
            <span>最大連続: <strong>${maxConn}</strong> <span class="text-xs opacity-80">(${terrs.length}領土 / 🎲${totalDice}個)</span></span>
        `;
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
let startPos = {x: 0, y: 0};
let lastPos = {x: 0, y: 0}; // 追加: ドラッグ中の直前の座標
let isDragging = false;     // 追加: ドラッグ中かどうかのフラグ
let lastTouchTime = 0;

const canvas = document.getElementById('gameCanvas');
const getPos = (e) => ({ x: (e.touches ? e.touches[0].clientX : e.clientX), y: (e.touches ? e.touches[0].clientY : e.clientY) });

const handlePointerDown = e => {
    // タッチ直後の擬似マウスイベントを無視 (500ms以内)
    if (e.type === 'touchstart') {
        lastTouchTime = Date.now();
    } else if (e.type === 'mousedown') {
        if (Date.now() - lastTouchTime < 500) return; 
    }
    if (game.phase === 'playing') {
        startPos = getPos(e);
        lastPos = getPos(e); // 追加: 初期位置を記録
        isDragging = true;   // 追加: ドラッグ開始
    }
};

// ドラッグ操作ハンドラ
const handlePointerMove = e => {
    // 【変更】renderer.canDrag が false の場合（全体が表示されている場合）は処理を抜ける
    if (!isDragging || game.phase !== 'playing' || !renderer.canDrag) return;
    
    if (e.type === 'touchmove') e.preventDefault(); // スマホのスクロールを防止

    const currentPos = getPos(e);
    // カメラ位置を更新 (移動量を加算)
    renderer.camera.x += (currentPos.x - lastPos.x);
    renderer.camera.y += (currentPos.y - lastPos.y);
    lastPos = currentPos;
};

const handlePointerUp = (e) => {
    isDragging = false; // 追加: ドラッグ終了
    
    // タッチ直後の擬似マウスイベントを無視
    if (e.type === 'mouseup') {
        if (Date.now() - lastTouchTime < 500) return;
    } else if (e.type === 'touchend') {
        lastTouchTime = Date.now();
    }
    
    if (game.phase !== 'playing') return;

    const pos = e.changedTouches ? {x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY} : getPos(e);
    
    // ドラッグした距離が clickTolerance 未満の場合のみクリック(領土選択)判定とする
    if (Math.hypot(pos.x - startPos.x, pos.y - startPos.y) < CONFIG.clickTolerance) {
        let localX = pos.x - renderer.camera.x;
        let localY = (pos.y - renderer.camera.y) / CONFIG.yScale; // 傾いたY軸座標を補正
        let t_hex = pixelToHex(localX, localY, CONFIG.hexSize);
        if (t_hex.col >= 0 && t_hex.col < CONFIG.gridWidth && t_hex.row >= 0 && t_hex.row < CONFIG.gridHeight) {
            let e_hex = game.hexGrid[t_hex.col][t_hex.row];
            e_hex && e_hex.active ? game.handleTerritoryClick(e_hex.territoryId) : game.selectedTerritoryId = null;
        }
    }
};

// --- 戦績・対戦履歴の保存関数 (localStorage を利用) ---
function saveGameResult(status) {
    // 既存の履歴を取得（なければ空配列）
    const history = JSON.parse(localStorage.getItem('dice_wars_history') || '[]');
    
    // 保存するデータ構造
    const record = {
        timestamp: new Date().toLocaleString(),
        status: status, // 'quit' (途中終了) または 'gameover' (決着)
        playersCount: game.players.length,
        winner: game.winner ? game.winner.name : null,
        rules: { ...game.rules }
    };

    history.push(record);
    // localStorage に JSON 文字列として保存
    localStorage.setItem('dice_wars_history', JSON.stringify(history));
    console.log("戦績を保存しました:", record);
}

// --- リロードせずにスタート画面へ戻る関数 ---
function returnToStartScreen() {
    // 1. ゲームコントローラーのフェーズをリセット
    game.phase = 'start';
    game.selectedTerritoryId = null;

    renderer.clear();

    // 2. モーダル類を非表示
    document.getElementById('quit-modal').classList.add('hidden');
    document.getElementById('battle-modal').style.display = 'none';
    document.getElementById('settings-modal').classList.add('hidden');

    // 3. インゲーム用のUIボタンを非表示
    document.getElementById('end-turn-btn').classList.add('hidden');
    document.getElementById('quit-game-btn').classList.add('hidden');
    document.getElementById('in-game-settings-btn').classList.add('hidden');

    // 4. スタート画面を再表示
    document.getElementById('start-screen').style.display = 'flex';
}

// イベントリスナーの登録（mousemove と touchmove を追加）
canvas.addEventListener('mousedown', handlePointerDown); 
canvas.addEventListener('mousemove', handlePointerMove); 
window.addEventListener('mouseup', handlePointerUp);
canvas.addEventListener('touchstart', handlePointerDown, {passive: false}); 
canvas.addEventListener('touchmove', handlePointerMove, {passive: false}); 
window.addEventListener('touchend', handlePointerUp, {passive: false});

// ボタンイベント設定
document.querySelectorAll('.player-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const rules = {};
        document.querySelectorAll('.rule-toggle').forEach(chk => rules[chk.dataset.rule] = chk.checked);
        
        // 追加: 数値入力欄から閾値を取得してルールに含める
        rules.greatPowerThreshold = parseInt(document.getElementById('great-power-threshold').value, 10);
        rules.smallCountryThreshold = parseInt(document.getElementById('small-country-threshold').value, 10);
        
        game.startGame(parseInt(e.target.dataset.players), rules);
        document.getElementById('start-screen').style.display = 'none';
        document.getElementById('settings-modal').classList.add('hidden'); // 設定を開いたまま開始した場合に閉じる
        document.getElementById('end-turn-btn').classList.remove('hidden');
        document.getElementById('quit-game-btn').classList.remove('hidden');

        document.getElementById(`in-game-settings-btn`).classList.remove(`hidden`);

        renderer.start();
    });
});

document.getElementById('end-turn-btn').addEventListener('click', () => game.endTurn());
// 「ゲーム終了」ボタンを押したときに確認モーダルを表示
document.getElementById(`quit-game-btn`).addEventListener(`click`, () => {
    document.getElementById(`quit-modal`).classList.remove(`hidden`);
});

// モーダル内の「はい」ボタンを押したときの処理
document.getElementById('confirm-quit-btn').addEventListener('click', () => {
    // 1. 戦績を一時保存/保存処理
    saveGameResult('quit');

    // 2. ページリロードではなく、スタート画面へ復帰
    returnToStartScreen();
});


// モーダル内の「いいえ」ボタンを押したらモーダルを閉じる
document.getElementById(`cancel-quit-btn`).addEventListener(`click`, () => {
    document.getElementById(`quit-modal`).classList.add(`hidden`);
});
document.getElementById(`open-settings-btn`).addEventListener(`click`,()=>{
    // ゲーム開始前：クリック無効化（pointer-events-none）を解除して操作可能にする
    document.querySelectorAll(`.rule-toggle, #great-power-threshold, #small-country-threshold, label`).forEach(e=>{
        e.classList.remove(`pointer-events-none`);
    });
    document.querySelectorAll(`.rule-toggle`).forEach(e=>e.disabled=false);
    document.getElementById(`great-power-threshold`).disabled=!document.getElementById(`great-power-rule`).checked;
    document.getElementById(`small-country-threshold`).disabled=!document.getElementById(`small-country-rule`).checked;
    document.getElementById(`settings-modal`).classList.remove(`hidden`);
});

document.getElementById(`close-settings-btn`).addEventListener(`click`,()=>{
    document.getElementById(`settings-modal`).classList.add(`hidden`);
});

document.getElementById(`in-game-settings-btn`).addEventListener(`click`,()=>{
    // ゲーム中確認：disabled を使わない（=グレーアウトさせない）で、見た目はそのままにクリックのみ無効化する
    document.querySelectorAll(`.rule-toggle, #great-power-threshold, #small-country-threshold, label`).forEach(e=>{
        e.disabled = false; // グレーアウトを防ぐため disabled は false に保つ
        e.classList.add(`pointer-events-none`); // label と input の両方へのクリックを遮断
    });
    document.getElementById(`settings-modal`).classList.remove(`hidden`);
});



const greatPowerRuleCb = document.getElementById(`great-power-rule`);
const greatPowerThresholdInput = document.getElementById(`great-power-threshold`);
greatPowerRuleCb.addEventListener(`change`,e=>{
    greatPowerThresholdInput.disabled=!e.target.checked;
    greatPowerThresholdInput.parentElement.style.display=e.target.checked?'flex':'none';
});
const smallCountryRuleCb = document.getElementById(`small-country-rule`);
const smallCountryThresholdInput = document.getElementById(`small-country-threshold`);
smallCountryRuleCb.addEventListener(`change`,e=>{
    smallCountryThresholdInput.disabled=!e.target.checked;
    smallCountryThresholdInput.parentElement.style.display=e.target.checked?'flex':'none';
});

// 初期状態の表示を反映
greatPowerThresholdInput.disabled=!greatPowerRuleCb.checked;
greatPowerThresholdInput.parentElement.style.display=greatPowerRuleCb.checked?'flex':'none';
smallCountryThresholdInput.disabled=!smallCountryRuleCb.checked;
smallCountryThresholdInput.parentElement.style.display=smallCountryRuleCb.checked?'flex':'none';