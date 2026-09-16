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

    /**
     * プレイヤーオブジェクトをシリアライズ
     * @returns {Object}
     */
    serialize() {
        return {
            id: this.id,
            color: this.color,
            name: this.name,
            isAI: this.isAI,
        };
    }

    /**
     * シリアライズされたオブジェクトからPlayerを復元
     * @param {Object} data - シリアライズデータ
     * @returns {Player}
     */
    static deserialize(data) {
        return new Player(
            data.id,
            data.color,
            data.name,
            data.isAI || false
        );
    }
}