window.GAME = window.GAME || {};

(function () {
    'use strict';

    // Fixed base resolution matching the field's natural aspect.
    // Phaser Scale.FIT handles ALL responsive scaling + centering automatically,
    // so the scene never needs to recompute positions on window resize.
    const base = GAME.iso.baseSize();

    const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: 'game-container',
        backgroundColor: 'transparent',
        scale: {
            mode: Phaser.Scale.FIT,
            width: base.w,
            height: base.h,
            parent: 'game-container',
        },
        render: {
            antialias: true,
            pixelArt: false,
            roundPixels: false,
        },
        physics: {
            default: 'arcade',
            arcade: { gravity: { x: 0, y: 0 }, debug: false },
        },
        scene: [GAME.GameScene],
        fps: {
            target: 60,
        },
    });

    GAME.game = game;
})();
