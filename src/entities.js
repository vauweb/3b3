window.GAME = window.GAME || {};

(function () {
    'use strict';

    const CFG = GAME.config;
    const ISO = GAME.iso;

    // -------- PLAYER --------
    class Player {
        constructor(scene, team, role, x, y) {
            this.scene = scene;
            this.team = team;       // 'A' | 'B'
            this.role = role;       // 'guard' | 'forward' | 'center'
            this.x = x;
            this.y = y;
            this.vx = 0;
            this.vy = 0;
            this.target = { x, y };
            this.hasBall = false;
            this.state = 'idle';    // idle | running | shooting | defending
            this.facing = team === 'A' ? 1 : -1;
            this.shootCd = 0;
            this.passCd = 0;
            this.decideCd = 0;
            this.burstTimer = 0;   // active sprint burst remaining (ms)
            this.burstCd = 0;      // cooldown before next burst (ms)
            this.stealCd = 0;      // cooldown before this player can steal again (ms)
            this.mark = null;      // assigned opponent to guard (set by AI)
            this.lastPasser = null;      // teammate who last passed to this player
            this.lastPassAt = -99;       // game-clock time of that pass (s)
            this.action = null;     // last AI action object
            this.hysteresis = null; // last chosen action key + time, for stability

            const sheet = 'char_' + team + '_idle';
            this.shadow = scene.add.image(0, 0, 'shadow').setOrigin(0.5, 0.5).setDepth(0);
            this.sprite = scene.add.sprite(0, 0, sheet, 'idle_0')
                .setOrigin(0.5, 0.94)
                .setDepth(10);
            this.playAnim('idle');
        }

        // Trigger a sprint burst if available.
        tryBurst() {
            if (this.burstCd <= 0 && this.burstTimer <= 0) {
                this.burstTimer = CFG.sprint.duration;
                this.burstCd = CFG.sprint.cooldown;
                return true;
            }
            return false;
        }

        isBursting() {
            return this.burstTimer > 0;
        }

        tickTimers(dt) {
            if (this.burstTimer > 0) this.burstTimer -= dt;
            if (this.burstCd > 0) this.burstCd -= dt;
            if (this.stealCd > 0) this.stealCd -= dt;
        }

        playAnim(name) {
            const key = name + '_' + this.team;
            const cur = this.sprite.anims.currentAnim;
            if (!cur || cur.key !== key) {
                this.sprite.play(key);
            }
        }

        setTarget(x, y) {
            this.target = { x, y };
        }

        // Move toward target at given speed; returns true if reached (within eps).
        moveTo(dt, speed, eps) {
            eps = eps == null ? 0.15 : eps;
            const dx = this.target.x - this.x;
            const dy = this.target.y - this.y;
            const d = Math.hypot(dx, dy);
            if (d < eps) {
                this.vx = 0; this.vy = 0;
                return true;
            }
            const ux = dx / d, uy = dy / d;
            const step = Math.min(speed * dt, d);
            this.x += ux * step;
            this.y += uy * step;
            this.vx = ux * speed;
            this.vy = uy * speed;
            // facing based on horizontal movement
            if (Math.abs(ux) > 0.08) this.facing = ux > 0 ? 1 : -1;
            return false;
        }

        updateVisual() {
            const p = ISO.worldToScreen(this.x, this.y, 0);
            this.sprite.setPosition(p.x, p.y);
            this.sprite.setFlipX(this.facing < 0);
            // depth: closer (larger screenY) draws on top; tiny bias per team to avoid z-fight.
            this.sprite.setDepth(p.y + 0.1);
            // shadow slightly offset
            const sh = ISO.worldToScreen(this.x, this.y + 0.18, 0);
            this.shadow.setPosition(sh.x, sh.y);
            this.shadow.setDepth(p.y - 0.5);
        }

        setState(newState) {
            if (this.state === newState) return;
            this.state = newState;
            if (newState === 'running') this.playAnim('run');
            else if (newState === 'shooting') this.playAnim('shoot');
            else if (newState === 'defending') this.playAnim('run');
            else this.playAnim('idle');
        }

        destroy() {
            this.sprite.destroy();
            this.shadow.destroy();
        }
    }

    // -------- BALL --------
    class Ball {
        constructor(scene, x, y) {
            this.scene = scene;
            this.x = x;
            this.y = y;
            this.z = 0; // height
            this.vx = 0; this.vy = 0; this.vz = 0;
            this.mode = 'loose'; // loose | held | shot | pass
            this.holder = null;
            this.shotBy = null;
            this.shotValue = 0;
            this.shotTarget = null; // {x,y} hoop
            this.passTo = null;
            this.willScore = false;
            this.scored = false;
            this.lastTouchTeam = null; // team of the last player to touch the ball (for OOB)
            this.grabCd = 0;

            this.shadow = scene.add.image(0, 0, 'shadow').setOrigin(0.5, 0.5).setDepth(0);
            this.sprite = scene.add.image(0, 0, 'ball').setOrigin(0.5, 0.5).setDepth(50);
        }

        // Attach to a holder for dribbling.
        hold(player) {
            this.mode = 'held';
            this.holder = player;
            this.lastTouchTeam = player.team;
            this.z = 0;
            this.vx = 0; this.vy = 0; this.vz = 0;
        }

        release() {
            this.holder = null;
            this.mode = 'loose';
            this.grabCd = 350; // ms before anyone can re-grab
        }

        shoot(player, target, value, willScore) {
            this.mode = 'shot';
            this.shotBy = player;
            this.shotTarget = target;
            this.shotValue = value;
            this.willScore = willScore;
            this.scored = false;
            this.lastTouchTeam = player.team;
            this.holder = null;
            this.passTo = null;
            // Horizontal velocity so the ball reaches the hoop in flightTime.
            const dx = target.x - this.x;
            const dy = target.y - this.y;
            const horiz = Math.hypot(dx, dy);
            const T = Math.max(0.5, horiz / CFG.speeds.ballShot);
            this.vx = dx / T;
            this.vy = dy / T;
            // Vertical: arc that starts at current height and arrives at rim height at t=T.
            const G = CFG.ballGravity;
            const startZ = this.z;
            this.vz = (CFG.hoopHeight - startZ + 0.5 * G * T * T) / T;
            this.shotFlight = T;
            this.grabCd = 600;
        }

        pass(fromPlayer, toPlayer) {
            this.mode = 'pass';
            this.passTo = toPlayer;
            this.holder = null;
            this.shotBy = null;
            this.lastTouchTeam = fromPlayer.team;
            let target = { x: toPlayer.x, y: toPlayer.y };
            // Accuracy: an inaccurate pass drifts and risks a turnover (no guaranteed receiver).
            if (Math.random() > CFG.handling.passAccuracy) {
                target = {
                    x: target.x + (Math.random() - 0.5) * 2 * CFG.handling.badPassDrift,
                    y: target.y + (Math.random() - 0.5) * 2 * CFG.handling.badPassDrift,
                };
                this.passTo = null;
            }
            const dx = target.x - this.x;
            const dy = target.y - this.y;
            const horiz = Math.hypot(dx, dy);
            const T = Math.max(0.3, horiz / CFG.speeds.ballPass);
            this.vx = dx / T;
            this.vy = dy / T;
            // Low pass arriving near receiver's hands (~0.4 height).
            const G = CFG.ballGravity;
            const startZ = this.z;
            this.vz = (0.4 - startZ + 0.5 * G * T * T) / T;
            this.shotFlight = T;
            this.grabCd = 250;
        }

        // Detach into loose state with some velocity (rebound / tipped).
        scatter(vx, vy) {
            this.mode = 'loose';
            this.holder = null;
            this.shotBy = null;
            this.passTo = null;
            this.vx = vx; this.vy = vy;
            this.vz = 2.2; // pop up a little on a rebound
            this.grabCd = 350;
        }

        update(dt) {
            const dts = dt / 1000;
            if (this.grabCd > 0) this.grabCd -= dt;

            if (this.mode === 'held' && this.holder) {
                // dribble offset: place ball slightly ahead & beside holder
                const h = this.holder;
                this.x = h.x + h.facing * 0.32;
                this.y = h.y + 0.12;
                this.z = Math.abs(Math.sin(performance.now() / 90)) * 0.5;
                this.vx = 0; this.vy = 0; this.vz = 0;
            } else {
                // Horizontal integration
                this.x += this.vx * dts;
                this.y += this.vy * dts;
                // Vertical integration with gravity
                const G = CFG.ballGravity;
                this.vz -= G * dts;
                this.z += this.vz * dts;

                if (this.z <= 0) {
                    // Hit the ground -> becomes a loose, rolling ball.
                    this.z = 0;
                    if (this.vz < -1.5) {
                        // small bounce
                        this.vz = -this.vz * 0.35;
                    } else {
                        this.vz = 0;
                    }
                    if (this.mode === 'shot' || this.mode === 'pass') {
                        this.mode = 'loose';
                        this.passTo = null;
                    }
                }

                if (this.mode === 'loose') {
                    // friction on horizontal motion
                    const fr = Math.pow(0.06, dts);
                    this.vx *= fr;
                    this.vy *= fr;
                    if (Math.hypot(this.vx, this.vy) < 0.05) { this.vx = 0; this.vy = 0; }
                    // NOTE: no clamp here — a loose ball can roll out of bounds;
                    // the scene detects OOB and awards possession per basketball rules.
                }
            }
            this.updateVisual();
        }

        updateVisual() {
            const lift = ISO.zToScreen(this.z);
            const p = ISO.worldToScreen(this.x, this.y, 0);
            this.sprite.setPosition(p.x, p.y - lift);
            this.sprite.setDepth(p.y - lift + 60);
            // shadow at ground
            const sh = ISO.worldToScreen(this.x, this.y + 0.12, 0);
            const sc = Math.max(0.4, 1 - this.z * 0.12);
            this.shadow.setPosition(sh.x, sh.y);
            this.shadow.setScale(sc, sc * 0.7);
            this.shadow.setDepth(p.y - 0.4);
        }

        destroy() {
            this.sprite.destroy();
            this.shadow.destroy();
        }
    }

    // -------- HOOP --------
    class Hoop {
        constructor(side, x, y) {
            this.side = side; // 'left' | 'right'
            this.x = x;
            this.y = y;
            // Which team attacks this hoop (scores on it)
            // Team A attacks 'right', Team B attacks 'left'.
            this.attackTeam = side === 'right' ? 'A' : 'B';
            this.defendTeam = side === 'right' ? 'B' : 'A';
        }

        // Detect if a ball passing through scores.
        // The rim is elevated at hoopHeight; a score happens when the ball
        // is near the rim's ground position AND at the rim's height (descending).
        checkScore(ball) {
            if (ball.mode !== 'shot' || ball.scored) return false;
            const d = ISO.dist(ball.x, ball.y, this.x, this.y);
            const h = CFG.hoopHeight;
            if (d < CFG.hoopRadius * 1.1 &&
                ball.z > h - 1.0 && ball.z < h + 1.2 &&
                ball.vz < 0) {
                return true;
            }
            return false;
        }
    }

    GAME.entities = { Player, Ball, Hoop };
})();
