export const RENDER_CONFIG = {
    // ヘックス描画
    initialHexSize: 16,
    minHexSize: 12,
    yScale: 0.8,
    mapPadding: 20,
    minAvailableWidth: 100,

    // 立体ダイス描画パラメータ
    diceDoubleColumnThreshold: 5, // 5個以上で2列にスタック
    diceColumnMaxCount: 4,        // 1列あたりの最大スタック数
    shadePercentTop: 30,
    shadePercentLeft: -5,
    shadePercentRight: -25,

    // カラーパレット
    colors: ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22'],
    borderColors: ['#c0392b', '#2980b9', '#27ae60', '#f39c12'],
    selectedHighlight: 'rgba(255, 255, 255, 0)',
    targetHighlight: 'rgba(150, 150, 150, 0.5)',
    neutralColor: '#95a5a6'
};