window.GAME = window.GAME || {};

(function () {
    'use strict';

    const CFG = GAME.config;
    const ISO = GAME.iso;

    function HEX(s) {
        return parseInt(s.replace('#', '').slice(0, 6), 16);
    }
    const C_BASE = HEX('#0f1230');
    const C_BASE2 = HEX('#0a0c22');
    const C_LINE = HEX(CFG.colors.line);
    const C_A = HEX(CFG.colors.teamA);
    const C_B = HEX(CFG.colors.teamB);
    const C_BALL = HEX(CFG.colors.ball);

    class GameScene extends Phaser.Scene {
        constructor() {
            super({ key: 'GameScene' });
        }

        create() {
            this.scoreA = 0;
            this.scoreB = 0;
            this.matchTime = CFG.matchDuration;
            this.running = true;
            this.players = [];
            this.shakeT = 0;
            this.stealLock = 0; // global steal lockout (ms)
            // Anti-stalling bookkeeping
            this.clock = 0;               // play clock, in seconds (monotonic, scaled by timeScale)
            this.possessionTeam = null;   // team currently on offense
            this.possessionStart = 0;     // clock value when this possession began
            this.lastShotAt = 0;          // clock value of the most recent shot attempt

            // Generate textures + animations
            GAME.sprites.generateAll(this);

            // Graphics layers
            this.courtG = this.add.graphics().setDepth(0);
            this.hoopBackG = this.add.graphics().setDepth(1);
            this.fxG = this.add.graphics().setDepth(900);
            this.hoopRimG = this.add.graphics().setDepth(50);

            // Hoops
            this.hoops = {
                left: new GAME.entities.Hoop('left', CFG.hoops.left.x, CFG.hoops.left.y),
                right: new GAME.entities.Hoop('right', CFG.hoops.right.x, CFG.hoops.right.y),
            };

            // Spawn players
            let idx = 0;
            for (const teamKey of ['A', 'B']) {
                const team = CFG.teams[teamKey];
                team.spawn.forEach((sp, i) => {
                    const p = new GAME.entities.Player(this, teamKey, sp.role, sp.x, sp.y);
                    p.spawn = sp;
                    p.spawnIndex = i;
                    this.players.push(p);
                });
            }

            // Ball at center
            this.ball = new GAME.entities.Ball(this, CFG.center.x, CFG.center.y);

            // UI
            GAME.ui.init(this);
            GAME.ui.updateScore(this.scoreA, this.scoreB);
            GAME.ui.updateTimer(this.matchTime);
            GAME.ui.setStatus('ИГРА');
            GAME.ui.hideOverlay();

            // Re-fit the field into the current canvas size and keep it
            // centered whenever the window resizes (Scale.RESIZE mode).
            this.scale.on('resize', this.onResize, this);
            this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));
            this.layoutField(this.scale.width, this.scale.height);

            // score flash tween target
            this.scoreFlash = 0;
        }

        world() {
            return {
                ball: this.ball,
                players: this.players,
                hoops: this.hoops,
                gameTime: this.clock,
                shotClock: this.possessionTeam ? (this.clock - this.possessionStart) : 0,
            };
        }

        // Recompute layout when the canvas (window) size changes.
        onResize() {
            if (!this.scale) return;
            this.layoutField(this.scale.width, this.scale.height);
            if (GAME.ui) GAME.ui.resize(this.scale.width, this.scale.height);
        }

        // -------- Layout (computed once; FIT handles responsive) --------
        layoutField(w, h) {
            ISO.fit(w, h, ISO.pad, ISO.pad);
            this.drawCourt();
            this.drawHoops();
            for (const p of this.players) p.updateVisual();
            if (this.ball) this.ball.updateVisual();
        }

        sizeS(px) { return px * ISO.scale; }

        // -------- Court drawing --------
        drawCourt() {
            const g = this.courtG;
            g.clear();
            const FW = CFG.field.w, FH = CFG.field.h;
            const s = ISO.scale;

            const c0 = ISO.worldToScreen(0, 0);
            const c1 = ISO.worldToScreen(FW, 0);
            const c2 = ISO.worldToScreen(FW, FH);
            const c3 = ISO.worldToScreen(0, FH);

            // Outer glow diamond
            g.fillStyle(C_BASE2, 1);
            this.fillDiamond(g, [
                { x: c0.x, y: c0.y - this.sizeS(10) },
                { x: c1.x, y: c1.y - this.sizeS(10) },
                c2, c3,
            ]);

            // Base court fill
            g.fillStyle(C_BASE, 1);
            this.fillDiamond(g, [c0, c1, c2, c3]);

            // subtle inner gradient via overlaid translucent diamonds
            g.fillStyle(0x161a44, 0.5);
            const m0 = ISO.worldToScreen(FW * 0.18, FH * 0.18);
            const m1 = ISO.worldToScreen(FW * 0.82, FH * 0.18);
            const m2 = ISO.worldToScreen(FW * 0.82, FH * 0.82);
            const m3 = ISO.worldToScreen(FW * 0.18, FH * 0.82);
            this.fillDiamond(g, [m0, m1, m2, m3]);

            // Grid lines
            g.lineStyle(Math.max(1, this.sizeS(1)), C_LINE, 0.10);
            for (let i = 1; i < FW; i++) {
                const a = ISO.worldToScreen(i, 0);
                const b = ISO.worldToScreen(i, FH);
                g.beginPath();
                g.moveTo(a.x, a.y);
                g.lineTo(b.x, b.y);
                g.strokePath();
            }
            for (let j = 1; j < FH; j++) {
                const a = ISO.worldToScreen(0, j);
                const b = ISO.worldToScreen(FW, j);
                g.beginPath();
                g.moveTo(a.x, a.y);
                g.lineTo(b.x, b.y);
                g.strokePath();
            }

            // Neon border
            g.lineStyle(Math.max(2, this.sizeS(2.5)), C_LINE, 0.85);
            g.beginPath();
            g.moveTo(c0.x, c0.y);
            g.lineTo(c1.x, c1.y);
            g.lineTo(c2.x, c2.y);
            g.lineTo(c3.x, c3.y);
            g.lineTo(c0.x, c0.y);
            g.strokePath();

            // Halfway line
            const h0 = ISO.worldToScreen(FW / 2, 0);
            const h1 = ISO.worldToScreen(FW / 2, FH);
            g.lineStyle(Math.max(1.5, this.sizeS(2)), C_LINE, 0.5);
            g.beginPath();
            g.moveTo(h0.x, h0.y);
            g.lineTo(h1.x, h1.y);
            g.strokePath();

            // Center circle
            const ctr = ISO.worldToScreen(CFG.center.x, CFG.center.y);
            g.lineStyle(Math.max(1.5, this.sizeS(2)), C_LINE, 0.7);
            g.strokeEllipse(ctr.x, ctr.y, this.sizeS(64), this.sizeS(32));
            g.lineStyle(Math.max(1, this.sizeS(1)), C_LINE, 0.3);
            g.strokeEllipse(ctr.x, ctr.y, this.sizeS(20), this.sizeS(10));

            // Three-point arcs + paint near each hoop
            this.drawHoopMarkings(g, 'left');
            this.drawHoopMarkings(g, 'right');
        }

        drawHoopMarkings(g, side) {
            const hoop = this.hoops[side];
            const color = side === 'left' ? C_B : C_A;
            const FW = CFG.field.w, FH = CFG.field.h;
            // 3-point arc: sample a circle in tile space and draw only the
            // segments that lie INSIDE the field (so it never draws off-court).
            const r = CFG.scoring.threePointLineDist;
            g.lineStyle(Math.max(1.5, this.sizeS(2)), color, 0.55);
            const N = 56;
            let prevPt = null, prevInside = false;
            for (let i = 0; i <= N; i++) {
                const a = (i / N) * Math.PI * 2;
                const wx = hoop.x + Math.cos(a) * r;
                const wy = hoop.y + Math.sin(a) * r;
                const inside = wx >= 0 && wx <= FW && wy >= 0 && wy <= FH;
                const sp = ISO.worldToScreen(wx, wy);
                if (inside && prevInside && prevPt) {
                    g.beginPath();
                    g.moveTo(prevPt.x, prevPt.y);
                    g.lineTo(sp.x, sp.y);
                    g.strokePath();
                }
                prevPt = sp; prevInside = inside;
            }
            // key (paint) rectangle: a small box near hoop
            g.lineStyle(Math.max(1, this.sizeS(1.5)), color, 0.4);
            const k0 = ISO.worldToScreen(hoop.x, hoop.y - 2.5);
            const k1 = ISO.worldToScreen(hoop.x + (side === 'left' ? 4 : -4), hoop.y - 2.5);
            const k2 = ISO.worldToScreen(hoop.x + (side === 'left' ? 4 : -4), hoop.y + 2.5);
            const k3 = ISO.worldToScreen(hoop.x, hoop.y + 2.5);
            g.beginPath();
            g.moveTo(k0.x, k0.y);
            g.lineTo(k1.x, k1.y);
            g.lineTo(k2.x, k2.y);
            g.lineTo(k3.x, k3.y);
            g.lineTo(k0.x, k0.y);
            g.strokePath();
        }

        drawHoops() {
            const back = this.hoopBackG;
            const rim = this.hoopRimG;
            back.clear();
            rim.clear();
            const H = CFG.hoopHeight;

            for (const side of ['left', 'right']) {
                const hoop = this.hoops[side];
                const color = side === 'left' ? C_B : C_A;
                const dir = side === 'left' ? -1 : 1; // outward direction (off-court)
                const ground = ISO.worldToScreen(hoop.x, hoop.y);
                const rimLift = ISO.zToScreen(H);
                const rimY = ground.y - rimLift;

                // ---- pole (furthest out, off-court) ----
                const poleX = ground.x + dir * this.sizeS(34);
                // base plate on the ground
                back.fillStyle(0x232a4d, 1);
                back.fillEllipse(poleX, ground.y, this.sizeS(24), this.sizeS(9));
                // vertical pole up to above the backboard
                back.lineStyle(Math.max(2, this.sizeS(4)), 0x2b3358, 1);
                back.beginPath();
                back.moveTo(poleX, ground.y);
                back.lineTo(poleX, rimY - this.sizeS(44));
                back.strokePath();

                // ---- backboard (enlarged, clearly BEHIND the rim, off-court) ----
                const bbW = this.sizeS(13);
                const bbH = this.sizeS(48);
                const bbCx = ground.x + dir * this.sizeS(22); // just past the rim's back edge
                const bbBottom = rimY + this.sizeS(8);
                // arm from pole to backboard
                back.lineStyle(Math.max(2, this.sizeS(3.5)), 0x2b3358, 1);
                back.beginPath();
                back.moveTo(poleX, rimY - this.sizeS(20));
                back.lineTo(bbCx, rimY - this.sizeS(20));
                back.strokePath();
                // board
                back.fillStyle(0x0c1030, 0.96);
                back.fillRect(bbCx - bbW / 2, bbBottom - bbH, bbW, bbH);
                back.lineStyle(Math.max(2, this.sizeS(2.5)), color, 0.95);
                back.strokeRect(bbCx - bbW / 2, bbBottom - bbH, bbW, bbH);
                // inner aim square on the board (just above the rim)
                back.lineStyle(Math.max(1.2, this.sizeS(1.8)), color, 0.75);
                const isW = this.sizeS(6), isH = this.sizeS(20);
                back.strokeRect(bbCx - isW / 2, rimY - isH + this.sizeS(2), isW, isH);

                // ---- rim (elevated, on rim layer so players sort around it) ----
                rim.lineStyle(Math.max(2.5, this.sizeS(3.5)), color, 1);
                rim.strokeEllipse(ground.x, rimY, this.sizeS(40), this.sizeS(14));
                rim.lineStyle(Math.max(1, this.sizeS(1.2)), 0xffffff, 0.5);
                rim.strokeEllipse(ground.x, rimY, this.sizeS(40), this.sizeS(14));
                // bracket from backboard to the rim
                rim.lineStyle(Math.max(1.5, this.sizeS(2)), color, 0.8);
                rim.beginPath();
                rim.moveTo(bbCx, rimY);
                rim.lineTo(ground.x, rimY);
                rim.strokePath();
                // net hanging down from the rim
                rim.lineStyle(Math.max(1, this.sizeS(1)), color, 0.35);
                const netH = rimLift * 0.7;
                for (let i = -2; i <= 2; i++) {
                    const sx = ground.x + i * this.sizeS(8);
                    rim.beginPath();
                    rim.moveTo(sx, rimY);
                    rim.lineTo(ground.x + i * this.sizeS(4), rimY + netH);
                    rim.strokePath();
                }
            }
            // Set rim depth so players sort around the hoop (hoops sit at midcourt y).
            const hy = ISO.worldToScreen(CFG.hoops.left.x, CFG.hoops.left.y).y;
            this.hoopRimG.setDepth(hy);
        }

        fillDiamond(g, pts) {
            g.beginPath();
            g.moveTo(pts[0].x, pts[0].y);
            g.lineTo(pts[1].x, pts[1].y);
            g.lineTo(pts[2].x, pts[2].y);
            g.lineTo(pts[3].x, pts[3].y);
            g.closePath();
            g.fillPath();
        }

        // -------- Update loop --------
        update(time, delta) {
            if (!this.running) {
                return;
            }
            const ts = this.time.timeScale || 1;
            const dt = delta * ts; // scaled ms
            const dts = dt / 1000;
            this.clock += dts; // advance the play clock

            // Timer
            this.matchTime -= dts;
            if (this.matchTime <= 0) {
                this.matchTime = 0;
                GAME.ui.updateTimer(0);
                this.endMatch();
                return;
            }
            GAME.ui.updateTimer(this.matchTime);

            // Track possession start (reset when the OTHER team gains control).
            if (this.ball.mode === 'held' && this.ball.holder) {
                if (this.ball.holder.team !== this.possessionTeam) {
                    this.possessionTeam = this.ball.holder.team;
                    this.possessionStart = this.clock;
                }
            }

            // Anti-stalling: if nobody has shot for too long, force a turnover
            // (possession to the other team) to break any endless loop.
            if (this.possessionTeam && (this.clock - this.lastShotAt) > CFG.shotClock.stalemate) {
                const other = this.possessionTeam === 'A' ? 'B' : 'A';
                this.inbound(other, CFG.center.x, CFG.center.y);
            }

            // Player cooldowns + AI decisions
            for (const p of this.players) {
                p.tickTimers(dt);
                if (p.shootCd > 0) p.shootCd -= dt;
                if (p.passCd > 0) p.passCd -= dt;
                p.decideCd -= dt;
                if (p.decideCd <= 0) {
                    p.decideCd = CFG.cooldowns.decision;
                    const act = GAME.ai.decide(p, this.world());
                    this.applyAction(p, act);
                }
            }
            if (this.stealLock > 0) this.stealLock -= dt;

            // Movement
            for (const p of this.players) {
                const shootingLock = p.state === 'shooting' && p.shootCd > CFG.cooldowns.shot - 360;
                if (shootingLock) {
                    p.vx = 0; p.vy = 0;
                    p.setState('idle');
                } else {
                    let sp = CFG.speeds.player;
                    if (p.role === 'guard') sp *= 1.05;
                    else if (p.role === 'center') sp *= 0.92;
                    if (p.hasBall) sp *= 0.93;
                    if (p.isBursting()) sp *= CFG.sprint.speedMult;
                    const reached = p.moveTo(dts, sp);
                    if (!reached) {
                        p.setState('running');
                    } else {
                        p.setState('idle');
                    }
                }
                const c = ISO.clamp(p.x, p.y, 0.5);
                p.x = c.x; p.y = c.y;
            }

            // Soft separation so players don't stack
            this.separate(dts);

            // Ball physics
            this.ball.update(dt);

            // Possession + steals + catch fumbles
            this.handlePossession(dt);

            // Dribble turnover under heavy pressure
            this.handleDribbleTurnover(dts);

            // Out of bounds -> change of possession
            this.checkOutOfBounds();

            // Scoring + rebounds
            this.checkScores();

            // Visual sync
            for (const p of this.players) p.updateVisual();

            // FX overlay decay
            if (this.scoreFlash > 0) {
                this.scoreFlash -= dt;
                this.fxG.clear();
                this.fxG.fillStyle(0xffffff, Math.min(0.25, this.scoreFlash / 600));
                this.fxG.fillRect(0, 0, this.scale.width, this.scale.height);
            } else if (this.fxG) {
                this.fxG.clear();
            }
        }

        applyAction(player, act) {
            if (!act) return;
            if (act.kind === 'move') {
                player.setTarget(act.target.x, act.target.y);
                if (GAME.ai.DEFENSIVE_KEYS.indexOf(act.key) >= 0) player.setState('defending');
            } else if (act.kind === 'shoot') {
                this.executeShoot(player);
            } else if (act.kind === 'pass') {
                this.executePass(player, act.to);
            }
        }

        executeShoot(player) {
            const hoop = this.hoops[player.team === 'A' ? 'right' : 'left'];
            const dist = ISO.dist(player.x, player.y, hoop.x, hoop.y);
            const twoD = CFG.scoring.twoPointDist;
            const threeD = CFG.scoring.threePointLineDist;
            const pts = dist <= twoD ? 2 : 3;
            let prob;
            if (dist < twoD * 0.5) prob = CFG.shotProb.close;
            else if (dist < twoD) prob = CFG.shotProb.mid;
            else if (dist < threeD) prob = CFG.shotProb.far;
            else prob = CFG.shotProb.deep;
            const willScore = Math.random() < prob;
            let tx = hoop.x, ty = hoop.y;
            if (!willScore) {
                tx += (Math.random() - 0.5) * 2.4;
                ty += (Math.random() - 0.5) * 1.8;
            }
            // face the hoop
            player.facing = hoop.x > player.x ? 1 : -1;
            this.setHolder(null);
            player.hasBall = false;
            player.setState('shooting');
            player.shootCd = CFG.cooldowns.shot;
            this.ball.willScore = willScore;
            this.ball.shotValue = pts;
            this.ball.shoot(player, { x: tx, y: ty }, pts, willScore);
            this.lastShotAt = this.clock;
        }

        executePass(player, to) {
            if (!to) return;
            player.passCd = CFG.cooldowns.pass;
            player.facing = to.x > player.x ? 1 : -1;
            // anti-hot-potato: remember who passed to the receiver
            to.lastPasser = player;
            to.lastPassAt = this.clock;
            this.setHolder(null);
            player.hasBall = false;
            this.ball.pass(player, to);
        }

        setHolder(player) {
            const ball = this.ball;
            if (ball.holder) ball.holder.hasBall = false;
            if (player) {
                player.hasBall = true;
                ball.hold(player); // also sets lastTouchTeam
            } else {
                ball.holder = null;
            }
        }

        handlePossession(dt) {
            const ball = this.ball;
            if (ball.grabCd > 0) ball.grabCd -= dt;
            const dts = dt / 1000;

            // --- steal attempt while an opponent holds the ball ---
            if (ball.mode === 'held' && ball.holder && this.stealLock <= 0) {
                const holder = ball.holder;
                const attackHoop = this.hoops[holder.team === 'A' ? 'right' : 'left'];
                const opps = this.players.filter(p => p.team !== holder.team);
                for (const o of opps) {
                    if (o.stealCd > 0) continue;
                    const d = ISO.dist(o.x, o.y, holder.x, holder.y);
                    if (d < CFG.steal.reachDist) {
                        const inFront = GAME.ai.blocksDrive(o, holder, attackHoop);
                        const roleMult = CFG.steal.roleMult[o.role] || 1;
                        // per-second rate, scaled by dt -> frame-rate independent
                        let rate = CFG.steal.baseRate * roleMult + (inFront ? CFG.steal.frontRate : 0);
                        rate *= 1 + (CFG.steal.reachDist - d) * 0.4; // closer = better
                        if (Math.random() < rate * dts) {
                            // successful steal: knock the ball loose toward the stealer
                            this.setHolder(null);
                            ball.lastTouchTeam = o.team;
                            const dx = o.x - holder.x, dy = o.y - holder.y;
                            const dd = Math.hypot(dx, dy) || 1;
                            ball.scatter((dx / dd) * 1.6, (dy / dd) * 1.6);
                            o.stealCd = CFG.steal.stealerCd;
                            this.stealLock = CFG.steal.lockout;
                            return;
                        }
                    }
                }
                return;
            }

            if (ball.mode === 'held') return;

            // can only grab a low ball
            if (ball.z > 1.1) return;
            if (ball.grabCd > 0) return;

            let grabber = null;
            let gd = CFG.grabRadius;
            for (const p of this.players) {
                const d = ISO.dist(p.x, p.y, ball.x, ball.y);
                if (d < gd) { gd = d; grabber = p; }
            }
            if (grabber) {
                // catch success chance (fumble -> ball deflects loose, counts as a touch)
                const isPass = ball.mode === 'pass';
                const chance = isPass ? CFG.handling.passCatch : CFG.handling.looseCatch;
                if (Math.random() < chance) {
                    this.setHolder(grabber);
                } else {
                    ball.lastTouchTeam = grabber.team;
                    ball.scatter((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
                }
            }
        }

        // Unforced-ish dribble turnover when closely pressured (rate-based, dt-scaled).
        handleDribbleTurnover(dts) {
            const ball = this.ball;
            if (ball.mode !== 'held' || !ball.holder || this.stealLock > 0) return;
            const h = ball.holder;
            const opps = this.players.filter(p => p.team !== h.team);
            for (const o of opps) {
                if (ISO.dist(o.x, o.y, h.x, h.y) < 1.0 &&
                    Math.random() < CFG.handling.dribbleTurnoverRate * dts) {
                    this.setHolder(null);
                    ball.lastTouchTeam = h.team;
                    ball.scatter((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
                    this.stealLock = CFG.steal.lockout;
                    return;
                }
            }
        }

        // Out of bounds: ball fully past a boundary line (near the ground) -> turnover.
        checkOutOfBounds() {
            const ball = this.ball;
            if (ball.mode === 'held') return;
            if (ball.z > 0.5) return;
            const FW = CFG.field.w, FH = CFG.field.h, m = CFG.oob.margin;
            if (ball.x < -m || ball.x > FW + m || ball.y < -m || ball.y > FH + m) {
                // possession goes to the team that did NOT last touch the ball
                const last = ball.lastTouchTeam;
                const team = last === 'A' ? 'B' : (last === 'B' ? 'A' : 'A');
                const sx = Math.max(1.2, Math.min(FW - 1.2, ball.x));
                const sy = Math.max(1.2, Math.min(FH - 1.2, ball.y));
                this.inbound(team, sx, sy);
            }
        }

        // Award possession to `team` at the inbound spot (just inside the boundary).
        inbound(team, sx, sy) {
            const teamPlayers = this.players.filter(p => p.team === team);
            let pl = null, bd = Infinity;
            for (const p of teamPlayers) {
                const d = ISO.dist(p.x, p.y, sx, sy);
                if (d < bd) { bd = d; pl = p; }
            }
            if (!pl) pl = teamPlayers[0];
            if (!pl) return;
            // move the inbounder to the spot and hand them the ball
            pl.x = sx; pl.y = sy; pl.vx = 0; pl.vy = 0; pl.target = { x: sx, y: sy };
            pl.hasBall = false; pl.hysteresis = null;
            this.ball.x = sx; this.ball.y = sy; this.ball.z = 0;
            this.ball.vx = 0; this.ball.vy = 0; this.ball.vz = 0;
            this.ball.passTo = null; this.ball.shotBy = null; this.ball.scored = false;
            this.setHolder(pl);
            this.ball.grabCd = 200;
            this.stealLock = CFG.oob.inboundProtect;
            // fresh possession for the awarded team
            this.possessionTeam = team;
            this.possessionStart = this.clock;
            this.lastShotAt = this.clock;
            for (const p of this.players) { p.lastPasser = null; p.lastPassAt = -99; }
        }

        checkScores() {
            const ball = this.ball;
            if (ball.mode !== 'shot' || ball.scored) return;

            if (ball.willScore) {
                for (const side of ['left', 'right']) {
                    if (this.hoops[side].checkScore(ball)) {
                        ball.scored = true;
                        this.onScore(this.hoops[side].attackTeam, ball.shotValue);
                        return;
                    }
                }
            }
            // Misses keep flying (gravity) and land on their own -> become loose (rebound).
        }

        onScore(team, pts) {
            if (team === 'A') this.scoreA += pts;
            else this.scoreB += pts;
            GAME.ui.updateScore(this.scoreA, this.scoreB);
            this.scoreFlash = 500;
            const inboundTeam = team === 'A' ? 'B' : 'A';
            this.kickoff(inboundTeam);
        }

        kickoff(team) {
            for (const p of this.players) {
                const sp = p.spawn;
                p.x = sp.x; p.y = sp.y;
                p.vx = 0; p.vy = 0;
                p.target = { x: sp.x, y: sp.y };
                p.hasBall = false;
                p.setState('idle');
                p.hysteresis = null;
                p.shootCd = 0; p.passCd = 0;
                p.burstTimer = 0; p.burstCd = 0; p.stealCd = 0;
                p.lastPasser = null; p.lastPassAt = -99;
            }
            this.setHolder(null);
            // place ball near center, slight bias toward inbound team side
            const bx = team === 'A' ? CFG.center.x - 3 : CFG.center.x + 3;
            this.ball.x = bx;
            this.ball.y = CFG.center.y;
            this.ball.z = 0;
            this.ball.vx = 0; this.ball.vy = 0; this.ball.vz = 0;
            this.ball.mode = 'loose';
            this.ball.holder = null;
            this.ball.passTo = null;
            this.ball.shotBy = null;
            this.ball.scored = false;
            this.ball.lastTouchTeam = null;
            this.ball.grabCd = 300;
            this.stealLock = CFG.oob.inboundProtect;
            this.possessionTeam = null;
            this.possessionStart = this.clock;
            this.lastShotAt = this.clock;
        }

        separate(dts) {
            const ps = this.players;
            const minDist = CFG.separation;
            for (let i = 0; i < ps.length; i++) {
                for (let j = i + 1; j < ps.length; j++) {
                    const a = ps[i], b = ps[j];
                    const dx = b.x - a.x, dy = b.y - a.y;
                    const d = Math.hypot(dx, dy);
                    if (d < minDist && d > 0.0001) {
                        const overlap = (minDist - d) / 2;
                        const ux = dx / d, uy = dy / d;
                        a.x -= ux * overlap;
                        a.y -= uy * overlap;
                        b.x += ux * overlap;
                        b.y += uy * overlap;
                    }
                }
            }
        }

        endMatch() {
            this.running = false;
            this.time.timeScale = 1;
            const winner = this.scoreA > this.scoreB ? 'A'
                : (this.scoreB > this.scoreA ? 'B' : 'tie');
            GAME.ui.showOverlay(winner, this.scoreA, this.scoreB);
            GAME.ui.setStatus('ФИНАЛ');
        }
    }

    GAME.GameScene = GameScene;
})();
