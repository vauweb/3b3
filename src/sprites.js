window.GAME = window.GAME || {};

(function () {
    'use strict';

    const CFG = GAME.config;

    // Frame layout per pose
    const POSES = {
        idle: { frames: 2, w: 36, h: 48 },
        run: { frames: 6, w: 38, h: 48 },
        shoot: { frames: 4, w: 40, h: 52 },
    };

    const sprites = {
        POSES,

        // ---- low-level helpers ----
        neonStroke(ctx, color, blur) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.shadowColor = color;
            ctx.shadowBlur = blur || 6;
        },

        clearShadow(ctx) {
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
        },

        // Draw one chibi frame at (ox, oy) top-left origin for the frame box.
        drawChibi(ctx, ox, oy, team, pose, frameIdx) {
            const w = POSES[pose].w;
            const h = POSES[pose].h;
            const total = POSES[pose].frames;
            const t = total > 1 ? frameIdx / total : 0; // 0..1
            const col = CFG.colors;
            const main = team === 'A' ? col.teamA : col.teamB;
            const dark = team === 'A' ? col.teamADark : col.teamBDark;

            // Anchor: feet at bottom-center of frame.
            const cx = ox + w / 2;
            const baseY = oy + h - 3; // ground line (feet)

            // Body metrics
            const headR = 9;
            const torsoW = 13;
            const torsoH = 13;
            const legH = 9;
            const armLen = 9;

            // Pose params
            let bob = 0, legSwing = 0, armSwing = 0, armRaise = 0, lean = 0;

            if (pose === 'idle') {
                bob = Math.sin(t * Math.PI * 2) * 1.2;
            } else if (pose === 'run') {
                bob = Math.abs(Math.sin(t * Math.PI * 2)) * 2 - 1;
                legSwing = Math.sin(t * Math.PI * 2) * 5;
                armSwing = -Math.sin(t * Math.PI * 2) * 5;
                lean = 3;
            } else if (pose === 'shoot') {
                // wind-up -> release -> follow -> recover
                if (t < 0.25) { armRaise = 0.2; lean = -1; }
                else if (t < 0.55) { armRaise = 0.8; lean = -3; }
                else if (t < 0.8) { armRaise = 1.0; lean = -2; }
                else { armRaise = 0.5; lean = 0; }
            }

            ctx.save();
            ctx.translate(cx, baseY);
            ctx.translate(lean, 0);

            const hipY = -legH + bob;
            const shoulderY = hipY - torsoH + bob;
            const headCY = shoulderY - headR + 2 + bob;

            // ---- LEGS ----
            ctx.lineCap = 'round';
            this.neonStroke(ctx, '#2a2a44', 0);
            ctx.lineWidth = 3.2;
            // back leg
            ctx.beginPath();
            ctx.moveTo(-2, hipY);
            ctx.lineTo(-2 - legSwing, 0);
            ctx.stroke();
            // front leg
            ctx.beginPath();
            ctx.moveTo(3, hipY);
            ctx.lineTo(3 + legSwing, 0);
            ctx.stroke();

            // ---- TORSO (jersey) ----
            ctx.shadowBlur = 0;
            ctx.fillStyle = dark;
            this.roundRect(ctx, -torsoW / 2, shoulderY, torsoW, torsoH + 2, 4);
            ctx.fill();
            // jersey main color overlay
            ctx.fillStyle = main;
            ctx.globalAlpha = 0.85;
            this.roundRect(ctx, -torsoW / 2 + 1, shoulderY + 1, torsoW - 2, torsoH, 3);
            ctx.fill();
            ctx.globalAlpha = 1;
            // neon jersey outline
            this.neonStroke(ctx, main, 4);
            this.roundRect(ctx, -torsoW / 2, shoulderY, torsoW, torsoH + 2, 4);
            ctx.stroke();
            // jersey number stripe
            ctx.fillStyle = '#0a0a1a';
            ctx.font = 'bold 7px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(team === 'A' ? 'A' : 'B', 0, shoulderY + torsoH / 2 + 1);

            // ---- ARMS ----
            this.neonStroke(ctx, '#2a2a44', 0);
            ctx.lineWidth = 3;
            if (pose === 'shoot') {
                // both arms up for the shot
                const upY = -armLen * armRaise;
                ctx.beginPath();
                ctx.moveTo(-torsoW / 2 + 2, shoulderY + 3);
                ctx.lineTo(-torsoW / 2 + 2 + 2, shoulderY + 3 + upY);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(torsoW / 2 - 2, shoulderY + 3);
                ctx.lineTo(torsoW / 2 - 2 + 2, shoulderY + 3 + upY);
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.moveTo(-torsoW / 2 + 2, shoulderY + 3);
                ctx.lineTo(-torsoW / 2 + 2 + armSwing * 0.5, shoulderY + 3 + armLen + armSwing);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(torsoW / 2 - 2, shoulderY + 3);
                ctx.lineTo(torsoW / 2 - 2 - armSwing * 0.5, shoulderY + 3 + armLen - armSwing);
                ctx.stroke();
            }

            // ---- HEAD ----
            // head base
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#f2d6c0';
            ctx.beginPath();
            ctx.arc(0, headCY, headR, 0, Math.PI * 2);
            ctx.fill();
            // cyber visor (team color neon band)
            ctx.fillStyle = '#0a0a1a';
            ctx.fillRect(-headR + 1, headCY - 3, headR * 2 - 2, 4);
            ctx.fillStyle = main;
            ctx.shadowColor = main;
            ctx.shadowBlur = 8;
            ctx.fillRect(-headR + 2, headCY - 2, headR * 2 - 4, 2);
            ctx.shadowBlur = 0;
            // hair / cap top
            ctx.fillStyle = dark;
            ctx.beginPath();
            ctx.arc(0, headCY - 1, headR, Math.PI * 1.05, Math.PI * 1.95);
            ctx.fill();
            // neon head outline
            this.neonStroke(ctx, main, 6);
            ctx.beginPath();
            ctx.arc(0, headCY, headR, 0, Math.PI * 2);
            ctx.stroke();

            ctx.restore();
        },

        roundRect(ctx, x, y, w, h, r) {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x, y + h, r);
            ctx.arcTo(x, y + h, x, y, r);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.closePath();
        },

        // Create a spritesheet texture for a (team, pose).
        createCharSheet(scene, team, pose) {
            const meta = POSES[pose];
            const key = 'char_' + team + '_' + pose;
            if (scene.textures.exists(key)) {
                scene.textures.remove(key);
            }
            const totalW = meta.w * meta.frames;
            const totalH = meta.h;
            const tex = scene.textures.createCanvas(key, totalW, totalH);
            const ctx = tex.getContext();
            ctx.clearRect(0, 0, totalW, totalH);
            for (let i = 0; i < meta.frames; i++) {
                this.drawChibi(ctx, i * meta.w, 0, team, pose, i);
            }
            // register individual frames
            for (let i = 0; i < meta.frames; i++) {
                tex.add(pose + '_' + i, 0, i * meta.w, 0, meta.w, meta.h);
            }
            tex.refresh();
            return key;
        },

        createBall(scene) {
            const key = 'ball';
            if (scene.textures.exists(key)) scene.textures.remove(key);
            const S = 22;
            const tex = scene.textures.createCanvas(key, S, S);
            const ctx = tex.getContext();
            const cx = S / 2, cy = S / 2, r = 8;
            ctx.clearRect(0, 0, S, S);
            // outer glow
            ctx.shadowColor = CFG.colors.ball;
            ctx.shadowBlur = 10;
            ctx.fillStyle = CFG.colors.ball;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            // seam lines
            ctx.strokeStyle = CFG.colors.ballDark;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(cx - r, cy);
            ctx.lineTo(cx + r, cy);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx, cy - 2, r * 0.9, 0.2, Math.PI - 0.2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx, cy + 2, r * 0.9, Math.PI + 0.2, Math.PI * 2 - 0.2);
            ctx.stroke();
            // highlight
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.beginPath();
            ctx.arc(cx - 2.5, cy - 2.5, 2, 0, Math.PI * 2);
            ctx.fill();
            tex.refresh();
            return key;
        },

        createShadow(scene) {
            const key = 'shadow';
            if (scene.textures.exists(key)) scene.textures.remove(key);
            const S = 28;
            const tex = scene.textures.createCanvas(key, S, S);
            const ctx = tex.getContext();
            const cx = S / 2, cy = S / 2;
            ctx.clearRect(0, 0, S, S);
            const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, 12);
            grad.addColorStop(0, 'rgba(0,0,0,0.55)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.ellipse(cx, cy, 12, 5, 0, 0, Math.PI * 2);
            ctx.fill();
            tex.refresh();
            return key;
        },

        // Generate everything + register Phaser animations.
        // Textures & anims are global to the game and survive scene restarts,
        // so we only generate once (guard with sentinel texture).
        generateAll(scene) {
            if (scene.textures.exists('char_A_idle')) {
                return;
            }
            const teams = ['A', 'B'];
            for (const team of teams) {
                for (const pose of ['idle', 'run', 'shoot']) {
                    this.createCharSheet(scene, team, pose);
                }
            }
            this.createBall(scene);
            this.createShadow(scene);

            // Build animation keys (guard against duplicates on scene restart)
            const createAnim = (key, frames, frameRate, repeat) => {
                if (scene.anims.exists(key)) return;
                scene.anims.create({ key, frames, frameRate, repeat });
            };
            for (const team of teams) {
                createAnim('idle_' + team,
                    this.frameList(scene, 'char_' + team + '_idle', 'idle', 2), 3, -1);
                createAnim('run_' + team,
                    this.frameList(scene, 'char_' + team + '_run', 'run', 6), 12, -1);
                createAnim('shoot_' + team,
                    this.frameList(scene, 'char_' + team + '_shoot', 'shoot', 4), 10, 0);
            }
        },

        frameList(scene, sheetKey, prefix, count) {
            const arr = [];
            for (let i = 0; i < count; i++) {
                arr.push({ key: sheetKey, frame: prefix + '_' + i });
            }
            return arr;
        },
    };

    GAME.sprites = sprites;
})();
