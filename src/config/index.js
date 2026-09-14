import { GAME_CONFIG } from './gameConfig.js';
import { RENDER_CONFIG } from './renderConfig.js';
import { UI_CONFIG } from './uiConfig.js';

export { GAME_CONFIG, RENDER_CONFIG, UI_CONFIG };

// 互換性維持のための統合CONFIGオブジェクト
export const CONFIG = {
    ...GAME_CONFIG,
    ...RENDER_CONFIG,
    ...UI_CONFIG
};