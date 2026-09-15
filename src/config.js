// Global Engine Constants
      const CONFIG = {
        hexSize: 16,
        gridWidth: 38,
        gridHeight: 28,
        targetHexesPerTerritory: 18,
        mapGenerationMaxRetries: 60,
        maxDicePerTerritory: 8,
        minDicePerTerritory: 1,
        initialMaxDice: 6,
        greatPowermaxDicePerTerritory: 8,
        colors: ["#ef4444", "#3b82f6", "#10b981", "#f59e0b"], // Red, Blue, Green, Amber
        borderColors: ["#dc2626", "#2563eb", "#059669", "#d97706"],
        clickTolerance: 8,
        battleAnimationMs: 800,
        battleResultDisplayMs: 1400,
        bonusMap: { 2: [0, 4], 3: [0, 3, 6], 4: [0, 2, 4, 6] },
        selectedHighlight: "rgba(255, 255, 255, 0.25)",
        targetHighlight: "rgba(239, 68, 68, 0.45)",
        yScale: 0.8,
      };
export { CONFIG };
