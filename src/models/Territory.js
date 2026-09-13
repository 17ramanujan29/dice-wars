export class Territory {
    constructor(id, hexes, centerHex) {
        this.id = id;
        this.hexes = hexes;
        this.centerHex = centerHex;
        this.owner = -1;
        this.dice = 0;
    }
}