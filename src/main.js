window.GAME = window.GAME || {};

(function () {
    'use strict';

    // Canvas stretches to fill the whole window (Scale.RESIZE). The scene and
    // HUD re-layout on every resize, and the field is re-fit/centered to match.
    const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: 'game-container',
        backgroundColor: 'transparent',
        scale: {
            mode: Phaser.Scale.RESIZE,
            width: window.innerWidth,
            height: window.innerHeight,
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
