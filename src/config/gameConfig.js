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

    // プレイヤー人数ごとの初期領土・総ダイス数設定
    playerSetupMap: {
        2: { terr: 28, dice: 42 },
        3: { terr: 27, dice: 30 },
        4: { terr: 28, dice: 22 }
    },

    // プレイヤー人数ごとの後手ボーナスダイス配置
    bonusMap: {
        2: [0, 4],
        3: [0, 3, 6],
        4: [0, 2, 4, 6]
    }
};