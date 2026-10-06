import { describe, expect, it } from 'vitest';
import { GameController } from './GameController.js';

describe('GameController initial dice assignment', () => {
  it('keeps each territory between 2 and 5 even after latter bonuses are applied', () => {
    const game = new GameController();

    game.startGame(2, {
      greatPower: false,
      latterBonusDice: true,
      latterBonusDice2: true,
      smallCountryBonus: false,
      eightDiceAdjacentLimit: false,
      eightDiceCountLimit: false,
    });

    const diceValues = game.territories.map((territory) => territory.dice);

    expect(diceValues.every((dice) => dice >= 2 && dice <= 5)).toBe(true);
  });
});
