window.GAME = window.GAME || {};

(function () {
    'use strict';

    // Render at device-pixel resolution for crisp HiDPI/retina output. The game
    // runs in device coordinates (gameSize = CSS * devicePixelRatio) so the whole
    // scene renders at full resolution; the canvas is displayed at CSS size via
    // zoom = 1/dpr. Scale.NONE lets us drive gameSize ourselves (RESIZE would lock
    // it to the parent's CSS bounds and cap the render resolution).
    const dpr = window.devicePixelRatio || 1;
    const dev = (v) => Math.round(v * dpr);
    const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: 'game-container',
        backgroundColor: 'transparent',
        scale: {
            mode: Phaser.Scale.NONE,
            width: dev(window.innerWidth),
            height: dev(window.innerHeight),
            zoom: 1 / dpr,
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

    // Keep gameSize in sync with the window (in device pixels) on resize; the
    // scene re-fits the field and the HUD re-layouts off the resize event.
    window.addEventListener('resize', () => {
        game.scale.resize(dev(window.innerWidth), dev(window.innerHeight));
    });

    GAME.game = game;
    GAME.dpr = dpr;
})();
