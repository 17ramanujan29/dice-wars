export class Territory {
    constructor(id, hexes, centerHex) {
        this.id = id;
        this.hexes = hexes;
        this.centerHex = centerHex;
        this.owner = -1;
        this.dice = 0;
    }

    /**
     * 領土オブジェクトをシリアライズ
     * @returns {Object}
     */
    serialize() {
        return {
            id: this.id,
            hexes: this.hexes.map(hex => ({ ...hex })),
            centerHex: { ...this.centerHex },
            owner: this.owner,
            dice: this.dice,
        };
    }

    /**
     * シリアライズされたオブジェクトからTerritoryを復元
     * @param {Object} data - シリアライズデータ
     * @returns {Territory}
     */
    static deserialize(data) {
        const territory = new Territory(
            data.id,
            data.hexes.map(hex => ({ ...hex })),
            { ...data.centerHex }
        );
        territory.owner = data.owner;
        territory.dice = data.dice;
        return territory;
    }
}