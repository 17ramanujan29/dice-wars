import { UI_CONFIG } from './config/index.js';
import { GameController } from './core/GameController.js';
import { Renderer } from './core/Renderer.js';
import { UIManager } from './ui/UIManager.js';
import { InputHandler } from './input/InputHandler.js';

const canvas = document.getElementById('gameCanvas');
const game = new GameController();
const renderer = new Renderer('gameCanvas', game);
const ui = new UIManager();
const inputHandler = new InputHandler(canvas, renderer, game);

// UI状態更新コールバックの登録
game.onStateChange = (state) => ui.updateGameState(state, returnToStartScreen);
game.onBattleStart = (src, tgt, atkP, defP) => ui.showBattleStart(src, tgt, atkP, defP, UI_CONFIG.battleAnimationMs);
game.onBattleEnd = (atkScore, defScore, type) => ui.showBattleEnd(atkScore, defScore, type, UI_CONFIG.battleResultDisplayMs);

function saveGameResult(status) {
    const history = JSON.parse(localStorage.getItem('dice_wars_history') || '[]');
    const record = {
        timestamp: new Date().toLocaleString(),
        status: status,
        playersCount: game.players.length,
        winner: game.winner ? game.winner.name : null,
        rules: { ...game.rules }
    };
    history.push(record);
    localStorage.setItem('dice_wars_history', JSON.stringify(history));
}

function returnToStartScreen() {
    game.phase = 'start';
    game.selectedTerritoryId = null;
    renderer.clear();
    ui.resetToStartScreen();
}

// プレイヤー人数選択およびゲーム開始
document.querySelectorAll('.player-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const rules = {};
        document.querySelectorAll('.rule-toggle').forEach(chk => rules[chk.dataset.rule] = chk.checked);
        
        rules.greatPowerThreshold = parseInt(document.getElementById('great-power-threshold').value, 10);
        rules.smallCountryThreshold = parseInt(document.getElementById('small-country-threshold').value, 10);

        game.startGame(parseInt(e.target.dataset.players, 10), rules);
        ui.showInGameUI();
        renderer.start();
    });
});

// インゲーム操作ボタン
document.getElementById('end-turn-btn').addEventListener('click', () => game.endTurn());
document.getElementById('quit-game-btn').addEventListener('click', () => {
    document.getElementById('quit-modal').classList.remove('hidden');
});
document.getElementById('confirm-quit-btn').addEventListener('click', () => {
    saveGameResult('quit');
    returnToStartScreen();
});
document.getElementById('cancel-quit-btn').addEventListener('click', () => {
    document.getElementById('quit-modal').classList.add('hidden');
});

// 設定ダイアログ制御
document.getElementById('open-settings-btn').addEventListener('click', () => {
    document.querySelectorAll('.rule-toggle, #great-power-threshold, #small-country-threshold, label').forEach(el => {
        el.classList.remove('pointer-events-none');
    });
    document.querySelectorAll('.rule-toggle').forEach(el => el.disabled = false);
    document.getElementById('great-power-threshold').disabled = !document.getElementById('great-power-rule').checked;
    document.getElementById('small-country-threshold').disabled = !document.getElementById('small-country-rule').checked;
    document.getElementById('settings-modal').classList.remove('hidden');
});

document.getElementById('close-settings-btn').addEventListener('click', () => {
    document.getElementById('settings-modal').classList.add('hidden');
});

document.getElementById('in-game-settings-btn').addEventListener('click', () => {
    document.querySelectorAll('.rule-toggle, #great-power-threshold, #small-country-threshold, label').forEach(el => {
        el.disabled = false;
        el.classList.add('pointer-events-none');
    });
    document.getElementById('settings-modal').classList.remove('hidden');
});

// ルールトグルと数値入力欄の連動制御
const greatPowerRuleCb = document.getElementById('great-power-rule');
const greatPowerThresholdInput = document.getElementById('great-power-threshold');
greatPowerRuleCb.addEventListener('change', e => ui.syncRuleToggleInput(e.target, greatPowerThresholdInput));

const smallCountryRuleCb = document.getElementById('small-country-rule');
const smallCountryThresholdInput = document.getElementById('small-country-threshold');
smallCountryRuleCb.addEventListener('change', e => ui.syncRuleToggleInput(e.target, smallCountryThresholdInput));

// 初期表示制御の設定反映
ui.syncRuleToggleInput(greatPowerRuleCb, greatPowerThresholdInput);
ui.syncRuleToggleInput(smallCountryRuleCb, smallCountryThresholdInput);