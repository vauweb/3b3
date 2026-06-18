// Global namespace
window.GAME = window.GAME || {};

(function () {
    'use strict';

    // Field dimensions in tile units (logical isometric grid)
    const FIELD_W = 26; // tiles along X (left-right length)
    const FIELD_H = 15; // tiles along Y (depth)
    const TILE_W = 64;
    const TILE_H = 32;

    GAME.config = {
        field: {
            w: FIELD_W,
            h: FIELD_H,
            tileW: TILE_W,
            tileH: TILE_H,
        },

        // Palette
        colors: {
            teamA: '#ff2bd6',
            teamASoft: 'rgba(255, 43, 214, 0.55)',
            teamADark: '#7a0d68',
            teamB: '#00f0ff',
            teamBSoft: 'rgba(0, 240, 255, 0.55)',
            teamBDark: '#0a5a66',
            ball: '#ff8a3d',
            ballDark: '#a3441a',
            line: '#7afcff',
            lineSoft: 'rgba(122, 252, 255, 0.4)',
            bg: '#0a0a1a',
            court: '#131230',
            courtBase: '#10122b',
            courtDark: '#080a1a',
            grid: 'rgba(122, 252, 255, 0.08)',
        },

        // Match
        matchDuration: 180, // seconds (3 minutes)

        // Physics / speeds (units per second, in tile space)
        speeds: {
            player: 3.4,
            playerDefend: 2.8,
            ballLoose: 5.0,
            ballShot: 8.0,
            ballPass: 7.0,
        },

        // Scoring
        scoring: {
            twoPointDist: 5.0, // tiles within -> 2 pts
            threePointLineDist: 9.0, // tiles beyond twoPointDist and within this = 3 pts
        },

        // Roles & starting positions (in tile coords, x = 0..FIELD_W, y = 0..FIELD_H)
        // Team A attacks the RIGHT hoop, Team B attacks the LEFT hoop.
        teams: {
            A: {
                key: 'A',
                name: 'NEON',
                color: '#ff2bd6',
                colorSoft: 'rgba(255, 43, 214, 0.55)',
                colorDark: '#7a0d68',
                attackHoop: 'right', // scores on right
                spawn: [
                    { x: 4, y: 4, role: 'guard' },
                    { x: 4, y: 7.5, role: 'forward' },
                    { x: 5, y: 11, role: 'center' },
                ],
            },
            B: {
                key: 'B',
                name: 'ICE',
                color: '#00f0ff',
                colorSoft: 'rgba(0, 240, 255, 0.55)',
                colorDark: '#0a5a66',
                attackHoop: 'left',
                spawn: [
                    { x: 22, y: 4, role: 'guard' },
                    { x: 22, y: 7.5, role: 'forward' },
                    { x: 21, y: 11, role: 'center' },
                ],
            },
        },

        // Hoop positions (tile coords), slightly inset from edges
        hoops: {
            left: { x: 1.2, y: 7.5 },
            right: { x: FIELD_W - 1.2, y: 7.5 },
        },

        // Hoop rim elevation (in tile-height units). The rim is mounted up on the pole.
        hoopHeight: 3.3,
        // Ball vertical gravity (tile-height units / s^2) for shot/pass arcs + rebounds.
        ballGravity: 13,

        // Center circle / tip-off
        center: { x: FIELD_W / 2, y: FIELD_H / 2 },

        // Hoop radius for scoring detection (tiles)
        hoopRadius: 1.1,
        // How close a player must be to grab a loose ball
        grabRadius: 0.9,
        // Shot success probabilities by distance band (closer = much more likely)
        shotProb: {
            close: 0.90,  // within twoPointDist/2  (layup range)
            mid: 0.68,    // within twoPointDist    (mid-range)
            far: 0.48,    // within threePointLineDist (three-point range)
            deep: 0.30,   // beyond
        },
        // Cooldowns (ms)
        cooldowns: {
            shot: 900,
            pass: 600,
            decision: 130, // AI re-decide interval
        },

        // Player soft-separation distance (tiles)
        separation: 0.85,

        // Steal / on-ball pressure (rates are per-second, scaled by dt -> frame-rate independent)
        steal: {
            reachDist: 1.05,                              // tiles within which a steal is possible
            baseRate: 0.35,                               // per-second base chance while in reach
            frontRate: 0.4,                               // extra per-second when defender is goal-side of the dribble
            roleMult: { guard: 1.7, forward: 1.0, center: 0.7 },
            lockout: 450,                                 // ms global lock after any steal
            stealerCd: 1500,                              // ms before the stealer can steal again
        },

        // Sprint burst (short speed boost for intercept / escape)
        sprint: {
            duration: 520,                                // ms of boost
            speedMult: 1.55,
            cooldown: 2400,                               // ms before next burst
        },

        // Ball-handling success chances (every action can fail)
        handling: {
            passAccuracy: 0.84,                           // chance a pass is on-target
            passCatch: 0.93,                              // chance a receiver cleanly catches an on-target pass
            looseCatch: 0.88,                             // chance to cleanly grab a loose / rebound ball
            badPassDrift: 2.6,                            // tiles of drift on an inaccurate pass
            dribbleTurnoverRate: 0.1,                     // per-second chance to lose the handle under close pressure
        },

        // Out of bounds (ball past the boundary -> change of possession)
        oob: {
            margin: 0.35,                                 // how far past the line (tiles) before it counts as out
            inboundProtect: 800,                          // ms steal-lock after an inbound
        },

        // Anti-stalling: possession shot-clock + global stalemate breaker
        shotClock: {
            soft: 10,      // seconds held -> start forcing shots/drives
            hard: 15,      // seconds held -> strongly force a shot attempt
            stalemate: 22, // seconds without ANY shot -> turnover to the other team
            hotPotato: 2.5,// seconds during which a return pass to the last passer is discouraged
        },
    };
})();
