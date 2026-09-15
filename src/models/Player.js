export class Player {
    /**
     * @param {number} id 
     * @param {string} color 
     * @param {string} name 
     * @param {boolean} isAI CPUプレイヤーフラグ（デフォルト: false）
     */
    constructor(id, color, name, isAI = false) {
        this.id = id;
        this.color = color;
        this.name = name;
        this.isAI = isAI;
    }
}