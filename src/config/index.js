/**
 * ゲーム設定 - 単一の設定ソース
 * 
 * すべての設定はここからエクスポートされる名前空間付きオブジェクトを通じてアクセスします。
 * 従来の個別エクスポートも後方互換性のために維持しています。
 */

// ゲームプレイ関連の設定
export const GAME_CONFIG = {
  // グリッド・マップ生成パラメータ
  gridWidth: 40,
  gridHeight: 30,
  targetHexesPerTerritory: 18,
  mapGenerationMaxRetries: 50,

  // ダイス・ルール数値
  diceSides: 6,
  minDicePerTerritory: 1,
  maxDicePerTerritory: 8,
  initialMaxDice: 6,
  minDiceToAttack: 1, // 攻撃を行うために最低限必要なダイス数
  reinforcementRatio: 2 / 3, // 増援計算比率 (2/3)

  // 特殊ルール閾値デフォルト
  greatPowerMaxDicePerTerritory: 8,
  greatPowerThreshold: 16,
  smallCountryThreshold: 5,
  eightDiceAdjacentLimit: 7,

  // プレイヤー人数ごとの初期領土・総ダイス数設定
  playerSetupMap: {
    2: { terr: 28, dice: 42 },
    3: { terr: 27, dice: 30 },
    4: { terr: 28, dice: 22 },
  },

  // プレイヤー人数ごとの後手ボーナスダイス配置
  bonusMap: {
    2: [0, 4],
    3: [0, 3, 6],
    4: [0, 2, 4, 6],
  },
};

// レンダリング関連の設定
export const RENDER_CONFIG = {
  // ヘックス描画
  initialHexSize: 16,
  minHexSize: 12,
  yScale: 0.8,
  mapPadding: 20,
  minAvailableWidth: 100,

  // 立体ダイス描画パラメータ
  diceDoubleColumnThreshold: 5, // 5個以上で2列にスタック
  diceColumnMaxCount: 4, // 1列あたりの最大スタック数
  shadePercentTop: 30,
  shadePercentLeft: -5,
  shadePercentRight: -25,

  // カラーパレット
  colors: ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22'],
  borderColors: ['#c0392b', '#2980b9', '#27ae60', '#f39c12'],
  selectedHighlight: 'rgba(255, 255, 255, 0)',
  targetHighlight: 'rgba(150, 150, 150, 0.5)',
  neutralColor: '#95a5a6',
};

// UI関連の設定
export const UI_CONFIG = {
  clickTolerance: 5, // ドラッグと判定しないピクセル距離
  touchDebounceMs: 500, // タッチ後の擬似マウスイベント無視時間
  battleAnimationMs: 800, // 戦闘演出のシェイク時間
  battleResultDisplayMs: 1500, // 戦闘結果表示時間
};

// 統合CONFIGオブジェクト（名前空間アクセス用）
// 例: CONFIG.game.gridWidth, CONFIG.render.colors, CONFIG.ui.clickTolerance
export const CONFIG = {
  game: GAME_CONFIG,
  render: RENDER_CONFIG,
  ui: UI_CONFIG,
};

// 後方互換性のためのエイリアス
// 従来のimport { GAME_CONFIG }からのアクセスを維持