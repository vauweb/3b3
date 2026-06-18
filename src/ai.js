window.GAME = window.GAME || {};

(function () {
    'use strict';

    const CFG = GAME.config;
    const ISO = GAME.iso;

    const DEFENSIVE_KEYS = ['defend', 'post', 'pressure', 'mark', 'lane'];

    const ai = {
        // Role-based weights
        ROLE: {
            guard:   { chase: 1.30, attack: 1.00, defend: 1.25, shoot: 1.15, pass: 1.25, dribble: 1.05 },
            forward: { chase: 1.00, attack: 1.40, defend: 0.90, shoot: 1.35, pass: 1.10, dribble: 1.20 },
            center:  { chase: 0.70, attack: 0.55, defend: 1.40, shoot: 0.80, pass: 1.00, dribble: 0.85 },
        },

        clamp(v, a, b) { return Math.max(a, Math.min(b, v)); },
        clampPt(p) { const c = ISO.clamp(p.x, p.y, 0.8); return { x: c.x, y: c.y }; },

        // Decide an action for the player given the world state.
        decide(player, world) {
            return player.hasBall ? this.decideWithBall(player, world) : this.decideOffBall(player, world);
        },

        // ===================== OFF BALL =====================
        decideOffBall(player, world) {
            const ball = world.ball;
            const role = this.ROLE[player.role];
            const teammates = world.players.filter(p => p.team === player.team && p !== player);
            const opponents = world.players.filter(p => p.team !== player.team);
            const ownHoop = world.hoops[player.team === 'A' ? 'left' : 'right'];
            const attackHoop = world.hoops[player.team === 'A' ? 'right' : 'left'];

            const ballHolder = ball.mode === 'held' ? ball.holder : null;
            const teammateHasBall = ballHolder && ballHolder.team === player.team;
            const opponentHasBall = ballHolder && ballHolder.team !== player.team;

            const actions = [];

            // --- intercept a pass in flight ---
            if (ball.mode === 'pass') {
                const distBall = ISO.dist(player.x, player.y, ball.x, ball.y);
                const amClosest = this.amClosest(player, teammates, ball);
                let intUtil = (1 - this.clamp(distBall / 10, 0, 1)) * (amClosest ? 2.4 : 0.7) * role.defend;
                if (ball.passTo && ball.passTo.team === player.team && ball.passTo !== player) intUtil *= 0.4;
                if (intUtil > 0.5 && distBall > 2.5) player.tryBurst();
                actions.push({ key: 'chase', util: intUtil, kind: 'move', target: this.leadBall(ball) });
            }

            // --- chase a loose ball ---
            if (ball.mode === 'loose') {
                const distBall = ISO.dist(player.x, player.y, ball.x, ball.y);
                const isClosest = this.amClosestTeammate(player, teammates, ball);
                let chaseUtil = (teammateHasBall ? 0.25 : 1.0)
                    * (1 - this.clamp(distBall / 14, 0, 1))
                    * (isClosest ? 2.0 : 0.5) * role.chase;
                if (isClosest && distBall > 3.0) player.tryBurst();
                actions.push({ key: 'chase', util: chaseUtil, kind: 'move', target: this.leadBall(ball) });
            }

            // --- receive a pass meant for me ---
            if (ball.mode === 'pass' && ball.passTo === player) {
                player.tryBurst();
                actions.push({ key: 'chase', util: 3.3, kind: 'move', target: this.leadBall(ball) });
            }

            // --- defense (opponent has the ball) ---
            if (opponentHasBall) {
                if (this.amClosestDefender(player, teammates, ballHolder)) {
                    // pressure the ball handler, stay goal-side to deny the drive
                    actions.push({ key: 'pressure', util: 1.7, kind: 'move',
                        target: this.containTarget(player, ballHolder, ownHoop) });
                } else {
                    // man-marking: guard an assigned opponent, goal-side + ball-side
                    const mark = this.assignMark(player, teammates, opponents);
                    actions.push({ key: 'mark', util: 1.25 * role.defend, kind: 'move',
                        target: this.markTarget(mark, ownHoop, ballHolder) });
                    // jump the passing lane to the most dangerous attacker
                    const lane = this.laneInterceptTarget(ballHolder, opponents, ownHoop, player);
                    if (lane) actions.push({ key: 'lane', util: 0.85 * role.defend, kind: 'move', target: lane });
                }
            } else if (!teammateHasBall) {
                // proactive half-court defense: mark + stay between man and hoop
                const mark = this.assignMark(player, teammates, opponents);
                actions.push({ key: 'mark', util: 0.6 * role.defend, kind: 'move',
                    target: this.markTarget(mark, ownHoop, ball) });
            }

            // --- attack / get open / provide outlet ---
            const atkTarget = this.openAttackSpot(player, attackHoop, opponents, teammateHasBall);
            let atkUtil = (teammateHasBall ? 1.2 : 0.35) * role.attack;
            actions.push({ key: 'attack', util: atkUtil, kind: 'move', target: atkTarget });

            // --- center rim protection ---
            if (player.role === 'center' && !teammateHasBall) {
                const postTarget = this.pointBetween(ownHoop, { x: CFG.center.x, y: CFG.center.y }, 0.3);
                actions.push({ key: 'post', util: 0.65 * role.defend, kind: 'move', target: postTarget });
            }

            return this.pickBest(player, actions);
        },

        // ===================== WITH BALL =====================
        // Priority: shoot when in range & open; otherwise DRIVE toward the hoop;
        // pass when pressured or when a teammate is clearly better positioned.
        decideWithBall(player, world) {
            const role = this.ROLE[player.role];
            const attackHoop = world.hoops[player.team === 'A' ? 'right' : 'left'];
            const opponents = world.players.filter(p => p.team !== player.team);
            const teammates = world.players.filter(p => p.team === player.team && p !== player);

            const distHoop = ISO.dist(player.x, player.y, attackHoop.x, attackHoop.y);
            const open = this.openness(player, opponents);
            const nearest = this.nearestOpponent(player, opponents);
            const pressured = open < 1.7;
            const driveBlocked = nearest ? this.blocksDrive(nearest, player, attackHoop) : false;
            // how urgently we want to get rid of the ball (avoid being stripped)
            const dump = pressured ? (driveBlocked ? 1.0 : 0.6) : 0.15;
            // Shot-clock urgency: the longer the possession runs, the more we must shoot / drive.
            const sc = world.shotClock || 0;
            const scSoft = CFG.shotClock.soft, scHard = CFG.shotClock.hard;
            const urgency = sc > scSoft ? Math.min((sc - scSoft) * 0.2, 1.6) : 0; // 0..1.6
            const forceShot = sc > scHard;

            const actions = [];

            // --- shoot (primary when in range & open; forced as the clock winds down) ---
            if (player.shootCd <= 0) {
                let shootUtil = this.shootDesire(distHoop, open, role.shoot);
                if (open < 1.2) shootUtil *= 0.65; // contested
                shootUtil *= 1 + urgency;          // clock pressure -> shoot more
                if (forceShot) shootUtil += 1.6;   // hard cap -> force a shot attempt
                actions.push({ key: 'shoot', util: shootUtil, kind: 'shoot',
                    target: { x: attackHoop.x, y: attackHoop.y } });
            }

            // --- drive toward the hoop (default offense) ---
            let dribbleUtil = this.dribbleDesire(distHoop, open, role.dribble);
            if (open > 2.0) dribbleUtil *= 1.15;  // clear lane -> drive a bit harder
            if (open < 1.0) dribbleUtil *= 0.5;   // smothered -> don't drive into them
            dribbleUtil *= 1 + urgency * 0.5;     // clock pressure -> push toward the hoop
            if (forceShot) dribbleUtil += 0.9;    // out of range + clock dying -> drive in for a look
            const dribbleTarget = this.dribbleTarget(player, attackHoop, opponents);
            actions.push({ key: 'dribble', util: dribbleUtil, kind: 'move', target: dribbleTarget });

            // --- pass (worth it under pressure or when a teammate is clearly better;
            //         discouraged as the shot clock runs down so we don't kill the clock) ---
            if (player.passCd <= 0 && teammates.length) {
                const best = this.bestPassTarget(player, teammates, opponents, attackHoop, world.gameTime);
                let passUtil = best ? best.util * role.pass : 0;
                passUtil += dump * 0.7;                  // pressure makes passing attractive
                passUtil *= 1 - urgency * 0.5;           // less passing as the clock winds down
                if (forceShot) passUtil *= 0.3;
                if (passUtil > 0.5) {
                    actions.push({ key: 'pass', util: passUtil, kind: 'pass', to: best.player });
                }
                // bailout outlet when heavily pressured (but not under a dying clock)
                if (dump > 0.6 && !forceShot) {
                    const outlet = this.outletTarget(teammates, opponents, attackHoop);
                    if (outlet && (!best || outlet !== best.player)) {
                        actions.push({ key: 'pass', util: 0.4 * role.pass + dump * 0.7,
                            kind: 'pass', to: outlet });
                    }
                }
            }

            // --- escape burst when pressured (especially if the drive is cut off) ---
            if (pressured) {
                if (driveBlocked) player.tryBurst();
                actions.push({ key: 'escape', util: 0.35 + dump * 0.7, kind: 'move',
                    target: this.escapeTarget(player, opponents, attackHoop) });
            }

            // --- protect ---
            if (open < 1.0) {
                actions.push({ key: 'hold', util: 0.32, kind: 'move', target: { x: player.x, y: player.y } });
            }

            return this.pickBest(player, actions);
        },

        // ===================== desire formulas =====================
        shootDesire(distHoop, open, roleW) {
            const twoD = CFG.scoring.twoPointDist;
            const threeD = CFG.scoring.threePointLineDist;
            let base;
            if (distHoop < twoD * 0.5) base = 1.6;       // layup range
            else if (distHoop < twoD) base = 1.2;         // mid-range
            else if (distHoop < threeD) base = 0.85;      // three-point range
            else base = 0.3;                              // deep
            const openBonus = this.clamp(open / 3.0, 0, 1) * 0.8;
            return (base + openBonus) * roleW;
        },

        dribbleDesire(distHoop, open, roleW) {
            const twoD = CFG.scoring.twoPointDist;
            let base;
            if (distHoop < 2.5) base = 0.4;               // close -> prefer to shoot
            else if (distHoop < twoD) base = 1.0;         // mid -> drive in
            else base = 1.15;                             // far -> push up the floor
            return base * roleW;
        },

        dribbleTarget(player, attackHoop, opponents) {
            const dx = attackHoop.x - player.x;
            const dy = attackHoop.y - player.y;
            const d = Math.hypot(dx, dy) || 1;
            let ux = dx / d, uy = dy / d;
            let ax = 0, ay = 0;
            for (const o of opponents) {
                const ox = player.x - o.x, oy = player.y - o.y;
                const od = Math.hypot(ox, oy);
                if (od < 2.5 && od > 0.01) {
                    const w = (2.5 - od) / 2.5;
                    ax += (ox / od) * w; ay += (oy / od) * w;
                }
            }
            ux += ax * 0.9; uy += ay * 0.9;
            const m = Math.hypot(ux, uy) || 1;
            const step = 3.5;
            return this.clampPt({ x: player.x + (ux / m) * step, y: player.y + (uy / m) * step });
        },

        escapeTarget(player, opponents, attackHoop) {
            let ax = 0, ay = 0;
            for (const o of opponents) {
                const ox = player.x - o.x, oy = player.y - o.y;
                const od = Math.hypot(ox, oy);
                if (od < 3 && od > 0.01) {
                    const w = (3 - od) / 3;
                    ax += (ox / od) * w; ay += (oy / od) * w;
                }
            }
            const dx = attackHoop.x - player.x, dy = attackHoop.y - player.y;
            const d = Math.hypot(dx, dy) || 1;
            ax += (dx / d) * 0.4; ay += (dy / d) * 0.4;
            const m = Math.hypot(ax, ay) || 1;
            const step = 3.2;
            return this.clampPt({ x: player.x + (ax / m) * step, y: player.y + (ay / m) * step });
        },

        bestPassTarget(player, teammates, opponents, attackHoop, gameTime) {
            let best = null, bestUtil = 0;
            const myDist = ISO.dist(player.x, player.y, attackHoop.x, attackHoop.y);
            for (const t of teammates) {
                const tDist = ISO.dist(t.x, t.y, attackHoop.x, attackHoop.y);
                const tOpen = this.openness(t, opponents);
                const passDist = ISO.dist(player.x, player.y, t.x, t.y);
                if (passDist > 13 || passDist < 0.8) continue;
                let util = 0.15;
                if (tDist < myDist - 0.5) util += 0.4;            // teammate is closer to the hoop
                util += this.clamp(tOpen / 3.0, 0, 1) * 0.5;       // openness
                util += this.clamp((myDist - tDist) / 6, -0.3, 0.5);
                if (tDist > myDist + 0.5) util *= 0.6;             // discourage backward/lateral passes
                if (tOpen < 1.0) util *= 0.55;                     // skip covered men
                // anti-hot-potato: don't immediately pass back to whoever just passed to me
                if (t === player.lastPasser && gameTime != null &&
                    (gameTime - player.lastPassAt) < CFG.shotClock.hotPotato) {
                    util *= 0.3;
                }
                if (util > bestUtil) { bestUtil = util; best = t; }
            }
            return best ? { player: best, util: bestUtil } : null;
        },

        outletTarget(teammates, opponents, attackHoop) {
            let best = null, bu = -Infinity;
            for (const t of teammates) {
                const open = this.openness(t, opponents);
                const up = -ISO.dist(t.x, t.y, attackHoop.x, attackHoop.y);
                const score = open * 0.4 + up * 0.2;
                if (score > bu) { bu = score; best = t; }
            }
            return best;
        },

        // ===================== defense helpers =====================
        // Goal-side contain position: between the ball handler and our hoop, pressing up.
        containTarget(player, holder, ownHoop) {
            const t = this.pointBetween(ownHoop, holder, 0.68);
            // step slightly toward the handler to apply pressure, but stay goal-side
            const dx = holder.x - t.x, dy = holder.y - t.y;
            const d = Math.hypot(dx, dy) || 1;
            return this.clampPt({ x: t.x + (dx / d) * 0.3, y: t.y + (dy / d) * 0.3 });
        },

        // Stable man-assignment: each defender (by role) gets the nearest unmarked opponent.
        assignMark(player, teammates, opponents) {
            if (!opponents.length) return null;
            const defenders = [player].concat(teammates).slice().sort((a, b) => a.role.localeCompare(b.role));
            const taken = {};
            const map = {};
            for (const d of defenders) {
                let best = null, bd = Infinity;
                for (const o of opponents) {
                    if (taken[o.role]) continue;
                    const dist = ISO.dist(d.x, d.y, o.x, o.y);
                    if (dist < bd) { bd = dist; best = o; }
                }
                if (best) { taken[best.role] = true; map[d.role] = best; }
            }
            return map[player.role] || opponents[0];
        },

        // Mark position: goal-side of the mark, shaded toward the ball (ball-side defense).
        markTarget(mark, ownHoop, ballRef) {
            if (!mark) return this.clampPt(this.pointBetween(ownHoop, ballRef, 0.5));
            const goalSide = this.pointBetween(ownHoop, mark, 0.55);
            return this.clampPt(this.pointBetween(goalSide, ballRef, 0.2));
        },

        // Position in the passing lane between the holder and the most dangerous receiver.
        laneInterceptTarget(holder, opponents, ownHoop, defender) {
            if (!holder) return null;
            let danger = null, bd = Infinity;
            for (const o of opponents) {
                if (o === holder) continue;
                const d = ISO.dist(o.x, o.y, ownHoop.x, ownHoop.y);
                if (d < bd) { bd = d; danger = o; }
            }
            if (!danger) return null;
            // only bother if this defender is reasonably close to that lane
            const mid = this.pointBetween(holder, danger, 0.5);
            if (ISO.dist(defender.x, defender.y, mid.x, mid.y) > 6) return null;
            return this.clampPt(mid);
        },

        // Is `opp` positioned between `holder` and `hoop` (blocking the drive)?
        blocksDrive(opp, holder, hoop) {
            const ax = hoop.x - holder.x, ay = hoop.y - holder.y;
            const len2 = ax * ax + ay * ay || 1;
            const t = ((opp.x - holder.x) * ax + (opp.y - holder.y) * ay) / len2;
            if (t < 0.05 || t > 1) return false;
            const px = holder.x + ax * t, py = holder.y + ay * t;
            return ISO.dist(opp.x, opp.y, px, py) < 1.2;
        },

        // ===================== generic helpers =====================
        leadBall(ball) {
            const lead = 0.18;
            return { x: ball.x + ball.vx * lead, y: ball.y + ball.vy * lead };
        },

        amClosest(player, teammates, pt) {
            const my = ISO.dist(player.x, player.y, pt.x, pt.y);
            for (const t of teammates) {
                if (ISO.dist(t.x, t.y, pt.x, pt.y) < my - 0.1) return false;
            }
            return true;
        },

        amClosestTeammate(player, teammates, ball) {
            const myD = ISO.dist(player.x, player.y, ball.x, ball.y);
            for (const t of teammates) {
                if (ISO.dist(t.x, t.y, ball.x, ball.y) < myD - 0.15) return false;
            }
            return true;
        },

        amClosestDefender(player, teammates, ballHolder) {
            const myD = ISO.dist(player.x, player.y, ballHolder.x, ballHolder.y);
            for (const t of teammates) {
                if (ISO.dist(t.x, t.y, ballHolder.x, ballHolder.y) < myD - 0.2) return false;
            }
            return true;
        },

        nearestOpponent(player, opponents) {
            let best = null, bd = Infinity;
            for (const o of opponents) {
                const d = ISO.dist(player.x, player.y, o.x, o.y);
                if (d < bd) { bd = d; best = o; }
            }
            return best;
        },

        openness(player, opponents) {
            let min = Infinity;
            for (const o of opponents) {
                const d = ISO.dist(player.x, player.y, o.x, o.y);
                if (d < min) min = d;
            }
            return min === Infinity ? 99 : min;
        },

        pointBetween(a, b, ratio) {
            return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
        },

        openAttackSpot(player, attackHoop, opponents, teammateHasBall) {
            const dx = attackHoop.x - player.x;
            const dy = attackHoop.y - player.y;
            const d = Math.hypot(dx, dy) || 1;
            const ux = dx / d, uy = dy / d;
            const px = -uy, py = ux;
            const spread = (player.role === 'forward') ? 3.0 : (player.role === 'guard' ? -3.0 : 0);
            const advance = teammateHasBall ? Math.min(d * 0.6, 5) : Math.min(d * 0.35, 3);
            let tx = player.x + ux * advance + px * spread;
            let ty = player.y + uy * advance + py * spread;
            let nearest = null, nd = Infinity;
            for (const o of opponents) {
                const dd = ISO.dist(tx, ty, o.x, o.y);
                if (dd < nd) { nd = dd; nearest = o; }
            }
            if (nearest && nd < 2.0) {
                const ox = tx - nearest.x, oy = ty - nearest.y;
                const od = Math.hypot(ox, oy) || 1;
                const push = (2.0 - nd);
                tx += (ox / od) * push; ty += (oy / od) * push;
            }
            return this.clampPt({ x: tx, y: ty });
        },

        // pick best action with hysteresis (loyalty to current)
        pickBest(player, actions) {
            let best = null;
            for (const a of actions) {
                let util = a.util;
                if (player.hysteresis && player.hysteresis.key === a.key) util += 0.18;
                a._eff = util;
                if (!best || util > best._eff) best = a;
            }
            if (best) player.hysteresis = { key: best.key, util: best.util };
            return best;
        },
    };

    function threeLine() { return CFG.scoring.threePointLineDist; }

    ai.DEFENSIVE_KEYS = DEFENSIVE_KEYS;
    GAME.ai = ai;
})();
