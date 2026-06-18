window.GAME = window.GAME || {};

(function () {
    'use strict';

    const CFG = GAME.config;

    // Isometric projection (classic 2:1 dimetric).
    // World/tile coords: x grows right (length), y grows down (depth), z is height (up = negative screen y).
    // We project with an origin offset computed on resize so the field is centered.
    const iso = {
        // Dynamic projection parameters, recomputed on resize.
        originX: 0,
        originY: 0,
        scale: 1,

        // Field bounding box in screen space (unscaled), used for fit calculation.
        fieldBox: { x: 0, y: 0, w: 0, h: 0 },

        // Compute the unscaled screen projection of a tile coordinate.
        project(x, y, z) {
            z = z || 0;
            const tw = CFG.field.tileW;
            const th = CFG.field.tileH;
            const sx = (x - y) * (tw / 2);
            const sy = (x + y) * (th / 2) - z;
            return { x: sx, y: sy };
        },

        // Convert world (tile) coords to final screen coords using current origin/scale.
        worldToScreen(x, y, z) {
            const p = iso.project(x, y, z);
            return {
                x: p.x * iso.scale + iso.originX,
                y: p.y * iso.scale + iso.originY,
            };
        },

        // Compute the field bounding box in unscaled screen coords.
        computeFieldBox() {
            const corners = [
                iso.project(0, 0),
                iso.project(CFG.field.w, 0),
                iso.project(0, CFG.field.h),
                iso.project(CFG.field.w, CFG.field.h),
            ];
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const c of corners) {
                if (c.x < minX) minX = c.x;
                if (c.x > maxX) maxX = c.x;
                if (c.y < minY) minY = c.y;
                if (c.y > maxY) maxY = c.y;
            }
            iso.fieldBox = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
            return iso.fieldBox;
        },

        // Fit the field into a viewport, centering it. Adds padding.
        fit(viewW, viewH, padX, padY) {
            padX = padX || 0;
            padY = padY || 0;
            const box = iso.computeFieldBox();
            // Add headroom above the field for tall sprites / hoops.
            const headroom = CFG.field.tileH * 4;
            const availW = viewW - padX * 2;
            const availH = viewH - padY * 2;
            const scaleX = availW / box.w;
            const scaleY = availH / (box.h + headroom);
            iso.scale = Math.min(scaleX, scaleY);
            // Center horizontally on the field box center.
            iso.originX = (viewW - box.w * iso.scale) / 2 - box.x * iso.scale;
            // Place vertically: account for headroom (hoops/sprites extend upward).
            iso.originY = padY + headroom * iso.scale - box.y * iso.scale;
        },

        // Depth sort key: larger screenY = closer to camera = drawn later (higher depth).
        depthFor(screenY, bias) {
            bias = bias || 0;
            return screenY + bias;
        },

        // Convert a tile-space height (z) into a screen-space pixel lift (scaled).
        zToScreen(z) {
            return z * (CFG.field.tileH / 2) * iso.scale;
        },

        // Distance helper in tile space.
        dist(ax, ay, bx, by) {
            const dx = ax - bx, dy = ay - by;
            return Math.sqrt(dx * dx + dy * dy);
        },

        // Clamp a point within the field bounds.
        clamp(x, y, margin) {
            margin = margin == null ? 0.5 : margin;
            return {
                x: Math.max(margin, Math.min(CFG.field.w - margin, x)),
                y: Math.max(margin, Math.min(CFG.field.h - margin, y)),
            };
        },

        // Fixed base resolution matching the field's natural aspect (+headroom).
        // Used for Scale.FIT so Phaser handles all responsive scaling/centering.
        pad: 24,
        baseSize() {
            const FW = CFG.field.w, FH = CFG.field.h;
            const tileW = CFG.field.tileW, tileH = CFG.field.tileH;
            const boxW = (FW + FH) * tileW / 2;
            const boxH = (FW + FH) * tileH / 2;
            const headroom = tileH * 4;
            return { w: Math.ceil(boxW + iso.pad * 2), h: Math.ceil(boxH + headroom + iso.pad * 2) };
        },
    };

    GAME.iso = iso;
})();
