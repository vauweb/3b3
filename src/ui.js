window.GAME = window.GAME || {};

(function () {
    'use strict';

    const FONT = "'Courier New', monospace";

    const ui = {
        scene: null,
        sceneSys: null,
        speed: 1,
        paused: false,
        overlayShown: false,
        startShown: false,
        prediction: null, // 'A' | 'B' | null
        _keyBound: false,

        W: 0, H: 0,

        // HUD (no backing panel / line)
        lblA: null, scoreA: null,
        lblB: null, scoreB: null,
        timer: null, status: null,
        timerUrgent: false,

        // Controls (round, icon-only, bottom-left)
        buttons: [],

        // Result overlay
        ovBg: null, ovBgHit: null, ovPanel: null,
        ovTitle: null, ovScore: null, ovChoice: null, ovVerdict: null,
        ovBtn: null, ovBtnTxt: null, ovBtnPos: null, ovBtnHit: null,

        // Start screen
        startBg: null, startBgHit: null,
        startTitle: null, startHint: null,
        startBtnA: null, startBtnAName: null, startBtnASub: null, startBtnAHit: null,
        startBtnB: null, startBtnBName: null, startBtnBSub: null, startBtnBHit: null,
        _startHover: null, _btnA: null, _btnB: null,

        init(scene) {
            this.scene = scene;
            this.sceneSys = scene.scene;
            this.speed = 1;
            this.paused = false;
            this.overlayShown = false;
            this.startShown = false;
            this.prediction = null;
            this.timerUrgent = false;
            this._startHover = null;

            this.W = scene.scale.width;
            this.H = scene.scale.height;

            this.createHUD();
            this.createControls();
            this.createOverlay();
            this.createStartScreen();
            this.layout();

            if (!this._keyBound) {
                this._keyBound = true;
                window.addEventListener('keydown', (e) => this._onKey(e));
            }

            // Fresh scene is ready but idle; show the team-picker start screen.
            this.showStartScreen();
        },

        resize(w, h) {
            this.W = w;
            this.H = h;
            this.layout();
        },

        _onKey(e) {
            if (!this.scene) return;
            if (e.key === ' ') { e.preventDefault(); this.togglePause(); }
            else if (e.key === '1') this.setSpeed(1);
            else if (e.key === '2') this.setSpeed(2);
            else if (e.key === '5') this.setSpeed(5);
            else if (e.key.toLowerCase() === 'r') this.reset();
        },

        // ---------------- Object creation ----------------
        createHUD() {
            const s = this.scene;
            this.lblA = s.add.text(0, 0, 'TEAM NEON', {
                fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#ff2bd6',
            }).setDepth(1001).setShadow(0, 0, '#ff2bd6', 8, true, true).setLetterSpacing(4);

            this.scoreA = s.add.text(0, 0, '0', {
                fontFamily: FONT, fontSize: '44px', fontStyle: 'bold', color: '#ff2bd6',
            }).setDepth(1001).setShadow(0, 0, '#ff2bd6', 16, true, true).setLetterSpacing(2);

            this.lblB = s.add.text(0, 0, 'TEAM ICE', {
                fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#00f0ff',
            }).setOrigin(1, 0).setDepth(1001).setShadow(0, 0, '#00f0ff', 8, true, true).setLetterSpacing(4);

            this.scoreB = s.add.text(0, 0, '0', {
                fontFamily: FONT, fontSize: '44px', fontStyle: 'bold', color: '#00f0ff',
            }).setOrigin(1, 0).setDepth(1001).setShadow(0, 0, '#00f0ff', 16, true, true).setLetterSpacing(2);

            this.timer = s.add.text(0, 0, '3:00', {
                fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: '#e8f8ff',
            }).setOrigin(0.5, 0).setDepth(1001).setShadow(0, 0, '#7afcff', 10, true, true).setLetterSpacing(4);

            this.status = s.add.text(0, 0, 'ИГРА', {
                fontFamily: FONT, fontSize: '12px', fontStyle: 'bold', color: '#6a7a9a',
            }).setOrigin(0.5, 0).setDepth(1001).setLetterSpacing(4);
        },

        createControls() {
            const s = this.scene;
            const defs = [
                { icon: '\u23F8', kind: 'pause', speed: 0 },            // pause
                { icon: '\u25B6', kind: 'speed', speed: 1 },            // play (x1)
                { icon: '\u25B6\u25B6', kind: 'speed', speed: 2 },      // x2
                { icon: '\u25B6\u25B6\u25B6', kind: 'speed', speed: 5 }, // x5
                { icon: '\u21BB', kind: 'reset', speed: -1 },           // reset -> start screen
            ];

            this.buttons = defs.map((d) => {
                const btn = Object.assign({}, d, { cx: 0, cy: 0, r: 24, active: false, hover: false });
                btn.g = s.add.graphics().setDepth(1001);
                btn.txt = s.add.text(0, 0, d.icon, {
                    fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#e8f8ff',
                }).setOrigin(0.5).setDepth(1002);

                btn.hit = new Phaser.Geom.Circle(0, 0, 1);
                btn.g.setInteractive(btn.hit, Phaser.Geom.Circle.Contains);
                btn.g.on('pointerover', () => { btn.hover = true; this.drawButton(btn); });
                btn.g.on('pointerout', () => { btn.hover = false; this.drawButton(btn); });
                btn.g.on('pointerdown', () => this._onButton(d.kind, d.speed));
                return btn;
            });

            this._setActive();
        },

        createOverlay() {
            const s = this.scene;

            this.ovBg = s.add.graphics().setDepth(2000);
            this.ovBgHit = new Phaser.Geom.Rectangle(0, 0, 1, 1);
            this.ovBg.setInteractive(this.ovBgHit, Phaser.Geom.Rectangle.Contains);
            this.ovBg.setVisible(false);

            this.ovPanel = s.add.graphics().setDepth(2001).setVisible(false);

            this.ovTitle = s.add.text(0, 0, '', {
                fontFamily: FONT, fontSize: '42px', fontStyle: 'bold', color: '#00f0ff',
            }).setOrigin(0.5, 0).setDepth(2002).setShadow(0, 0, '#00f0ff', 22, true, true).setLetterSpacing(6).setVisible(false);

            this.ovScore = s.add.text(0, 0, '', {
                fontFamily: FONT, fontSize: '60px', fontStyle: 'bold', color: '#e8f8ff',
            }).setOrigin(0.5, 0).setDepth(2002).setLetterSpacing(8).setVisible(false);

            this.ovChoice = s.add.text(0, 0, '', {
                fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#6a7a9a',
            }).setOrigin(0.5, 0).setDepth(2002).setLetterSpacing(3).setVisible(false);

            this.ovVerdict = s.add.text(0, 0, '', {
                fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#7cffa0',
            }).setOrigin(0.5, 0).setDepth(2002).setShadow(0, 0, '#7cffa0', 14, true, true).setLetterSpacing(4).setVisible(false);

            this.ovBtn = s.add.graphics().setDepth(2002);
            this.ovBtnHit = new Phaser.Geom.Rectangle(0, 0, 1, 1);
            this.ovBtn.setInteractive(this.ovBtnHit, Phaser.Geom.Rectangle.Contains);
            this.ovBtn.on('pointerover', () => { this.ovBtnPos.hover = true; this._drawOvBtn(); });
            this.ovBtn.on('pointerout', () => { this.ovBtnPos.hover = false; this._drawOvBtn(); });
            this.ovBtn.on('pointerdown', () => { if (this.overlayShown) this.reset(); });
            this.ovBtn.setVisible(false);
            this.ovBtnPos = { x: 0, y: 0, w: 260, h: 48, hover: false };

            this.ovBtnTxt = s.add.text(0, 0, '\u21BB СЫГРАТЬ ЕЩЁ', {
                fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: '#00f0ff',
            }).setOrigin(0.5).setDepth(2003).setLetterSpacing(3).setVisible(false);
        },

        createStartScreen() {
            const s = this.scene;

            this.startBg = s.add.graphics().setDepth(3000);
            this.startBgHit = new Phaser.Geom.Rectangle(0, 0, 1, 1);
            this.startBg.setInteractive(this.startBgHit, Phaser.Geom.Rectangle.Contains);
            this.startBg.setVisible(false);

            this.startTitle = s.add.text(0, 0, 'CYBER HOOPS 3v3', {
                fontFamily: FONT, fontSize: '54px', fontStyle: 'bold', color: '#e8f8ff',
            }).setOrigin(0.5, 0.5).setDepth(3001).setShadow(0, 0, '#7afcff', 26, true, true).setLetterSpacing(8).setVisible(false);

            this.startHint = s.add.text(0, 0, 'ВЫБЕРИТЕ КОМАНДУ-ПОБЕДИТЕЛЯ', {
                fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#6a7a9a',
            }).setOrigin(0.5, 0.5).setDepth(3001).setLetterSpacing(4).setVisible(false);

            // Team A (NEON)
            this.startBtnA = s.add.graphics().setDepth(3001).setVisible(false);
            this.startBtnAName = s.add.text(0, 0, 'TEAM NEON', {
                fontFamily: FONT, fontSize: '27px', fontStyle: 'bold', color: '#ff2bd6',
            }).setOrigin(0.5, 0.5).setDepth(3002).setShadow(0, 0, '#ff2bd6', 16, true, true).setLetterSpacing(4).setVisible(false);
            this.startBtnASub = s.add.text(0, 0, 'ВЫБРАТЬ', {
                fontFamily: FONT, fontSize: '12px', fontStyle: 'bold', color: '#e8f8ff',
            }).setOrigin(0.5, 0.5).setDepth(3002).setLetterSpacing(3).setAlpha(0.85).setVisible(false);
            this.startBtnAHit = new Phaser.Geom.Rectangle(0, 0, 1, 1);
            this.startBtnA.setInteractive(this.startBtnAHit, Phaser.Geom.Rectangle.Contains);
            this.startBtnA.on('pointerover', () => { this._startHover = 'A'; this._drawStartBtn('A'); });
            this.startBtnA.on('pointerout', () => { this._startHover = null; this._drawStartBtn('A'); });
            this.startBtnA.on('pointerdown', () => { if (this.startShown) this.startMatch('A'); });

            // Team B (ICE)
            this.startBtnB = s.add.graphics().setDepth(3001).setVisible(false);
            this.startBtnBName = s.add.text(0, 0, 'TEAM ICE', {
                fontFamily: FONT, fontSize: '27px', fontStyle: 'bold', color: '#00f0ff',
            }).setOrigin(0.5, 0.5).setDepth(3002).setShadow(0, 0, '#00f0ff', 16, true, true).setLetterSpacing(4).setVisible(false);
            this.startBtnBSub = s.add.text(0, 0, 'ВЫБРАТЬ', {
                fontFamily: FONT, fontSize: '12px', fontStyle: 'bold', color: '#e8f8ff',
            }).setOrigin(0.5, 0.5).setDepth(3002).setLetterSpacing(3).setAlpha(0.85).setVisible(false);
            this.startBtnBHit = new Phaser.Geom.Rectangle(0, 0, 1, 1);
            this.startBtnB.setInteractive(this.startBtnBHit, Phaser.Geom.Rectangle.Contains);
            this.startBtnB.on('pointerover', () => { this._startHover = 'B'; this._drawStartBtn('B'); });
            this.startBtnB.on('pointerout', () => { this._startHover = null; this._drawStartBtn('B'); });
            this.startBtnB.on('pointerdown', () => { if (this.startShown) this.startMatch('B'); });
        },

        // ---------------- Positioning (re-run on resize) ----------------
        layout() {
            const W = this.W, H = this.H;
            const M = 24;

            // HUD: floating text, top corners + top-center.
            this.lblA.setPosition(M, 12);
            this.scoreA.setPosition(M, 28);
            this.lblB.setPosition(W - M, 12);
            this.scoreB.setPosition(W - M, 28);
            this.timer.setPosition(W / 2, 14);
            this.status.setPosition(W / 2, 52);

            // Controls: round icon buttons, anchored bottom-left.
            const r = 24, gap = 16;
            let cx = M + r;
            const cy = H - M - r;
            for (const b of this.buttons) {
                b.cx = cx; b.cy = cy; b.r = r;
                b.hit.setPosition(cx, cy); b.hit.radius = r;
                this.drawButton(b);
                b.txt.setPosition(cx, cy);
                cx += r * 2 + gap;
            }

            // Result overlay: full-screen backdrop + centered panel.
            this.ovBg.clear();
            this.ovBg.fillStyle(0x05060f, 0.85).fillRect(0, 0, W, H);
            this.ovBgHit.setSize(W, H);

            const pw = 560, ph = 340;
            const px = (W - pw) / 2;
            const py = (H - ph) / 2 - 10;
            this.ovPanel.clear();
            this.ovPanel.fillStyle(0x0a0e1e, 0.74).fillRoundedRect(px, py, pw, ph, 12);
            this.ovPanel.lineStyle(2, 0x7afcff, 0.35).strokeRoundedRect(px, py, pw, ph, 12);

            this.ovTitle.setPosition(W / 2, py + 40);
            this.ovScore.setPosition(W / 2, py + 100);
            this.ovChoice.setPosition(W / 2, py + 182);
            this.ovVerdict.setPosition(W / 2, py + 208);
            const bw = 260, bh = 48, bx = (W - bw) / 2, by = py + ph - 68;
            this.ovBtnPos.x = bx; this.ovBtnPos.y = by; this.ovBtnPos.w = bw; this.ovBtnPos.h = bh;
            this.ovBtnHit.setPosition(bx, by); this.ovBtnHit.setSize(bw, bh);
            this._drawOvBtn();
            this.ovBtnTxt.setPosition(bx + bw / 2, by + bh / 2);

            // Start screen layout.
            this._layoutStart();
        },

        _layoutStart() {
            const W = this.W, H = this.H;
            this.startBg.clear();
            this.startBg.fillStyle(0x05060f, 0.86).fillRect(0, 0, W, H);
            this.startBgHit.setSize(W, H);

            this.startTitle.setPosition(W / 2, H * 0.2);
            this.startHint.setPosition(W / 2, H * 0.31);

            // Two large team buttons, centered, responsive width.
            const gap = 48, margin = 40;
            const bw = Math.max(150, Math.min(260, Math.floor((W - margin * 2 - gap) / 2)));
            const bh = Math.max(110, Math.floor(bw * 0.62));
            const totalW = bw * 2 + gap;
            const startX = (W - totalW) / 2;
            const by = H * 0.45;

            this._btnA = { x: startX, y: by, w: bw, h: bh };
            this._btnB = { x: startX + bw + gap, y: by, w: bw, h: bh };

            this.startBtnAHit.setPosition(this._btnA.x, this._btnA.y);
            this.startBtnAHit.setSize(bw, bh);
            this.startBtnBHit.setPosition(this._btnB.x, this._btnB.y);
            this.startBtnBHit.setSize(bw, bh);

            this._drawStartBtn('A');
            this._drawStartBtn('B');
            this.startBtnAName.setPosition(this._btnA.x + bw / 2, this._btnA.y + bh / 2 - 12);
            this.startBtnASub.setPosition(this._btnA.x + bw / 2, this._btnA.y + bh / 2 + 22);
            this.startBtnBName.setPosition(this._btnB.x + bw / 2, this._btnB.y + bh / 2 - 12);
            this.startBtnBSub.setPosition(this._btnB.x + bw / 2, this._btnB.y + bh / 2 + 22);
        },

        drawButton(btn) {
            const g = btn.g;
            g.clear();
            const danger = btn.kind === 'reset';
            let border = 0x7afcff, fill = 0x0a0e1e, fillA = 0.8, txt = '#e8f8ff';

            if (danger) {
                border = 0xff3860; txt = '#ffaab8';
                if (btn.hover) txt = '#ff3860';
            } else if (btn.active) {
                border = 0x00f0ff; fill = 0x00f0ff; fillA = 0.22; txt = '#00f0ff';
            } else if (btn.hover) {
                border = 0x00f0ff; txt = '#00f0ff';
            }

            g.fillStyle(fill, fillA);
            g.fillCircle(btn.cx, btn.cy, btn.r);
            g.lineStyle(2.5, border, 1);
            g.strokeCircle(btn.cx, btn.cy, btn.r);
            btn.txt.setColor(txt);
        },

        _drawStartBtn(team) {
            const g = team === 'A' ? this.startBtnA : this.startBtnB;
            const pos = team === 'A' ? this._btnA : this._btnB;
            if (!pos) return;
            const color = team === 'A' ? 0xff2bd6 : 0x00f0ff;
            const hover = this._startHover === team;
            g.clear();
            g.fillStyle(0x0a0e1e, hover ? 0.55 : 0.38);
            g.fillRoundedRect(pos.x, pos.y, pos.w, pos.h, 14);
            g.lineStyle(hover ? 4 : 3, color, 1);
            g.strokeRoundedRect(pos.x, pos.y, pos.w, pos.h, 14);
            if (hover) {
                g.lineStyle(2, color, 0.4);
                g.strokeRoundedRect(pos.x + 6, pos.y + 6, pos.w - 12, pos.h - 12, 10);
            }
        },

        _drawOvBtn() {
            const b = this.ovBtnPos;
            const g = this.ovBtn;
            g.clear();
            g.fillStyle(0x00f0ff, b.hover ? 0.28 : 0.18);
            g.fillRoundedRect(b.x, b.y, b.w, b.h, 8);
            g.lineStyle(2, 0x00f0ff, 1);
            g.strokeRoundedRect(b.x, b.y, b.w, b.h, 8);
        },

        _toggleOverlayInput(enable) {
            if (this.ovBtn && this.ovBtn.input) this.ovBtn.input.enabled = enable;
            if (this.ovBg && this.ovBg.input) this.ovBg.input.enabled = enable;
        },

        _toggleStartInput(enable) {
            if (this.startBtnA && this.startBtnA.input) this.startBtnA.input.enabled = enable;
            if (this.startBtnB && this.startBtnB.input) this.startBtnB.input.enabled = enable;
            if (this.startBg && this.startBg.input) this.startBg.input.enabled = enable;
        },

        setHudVisible(v) {
            [this.lblA, this.scoreA, this.lblB, this.scoreB, this.timer, this.status]
                .forEach(o => o && o.setVisible(v));
        },

        setControlsVisible(v) {
            for (const b of this.buttons) {
                b.g.setVisible(v);
                b.txt.setVisible(v);
            }
        },

        _onButton(kind, speed) {
            if (kind === 'pause') this.setPaused(true);
            else if (kind === 'speed') this.setSpeed(speed);
            else if (kind === 'reset') this.reset();
        },

        _setActive() {
            for (const b of this.buttons) {
                let act = false;
                if (b.kind === 'pause') act = this.paused;
                else if (b.kind === 'speed') act = !this.paused && this.speed === b.speed;
                b.active = act;
                this.drawButton(b);
            }
        },

        // ---------------- Start screen / match start ----------------
        showStartScreen() {
            this.startShown = true;
            this.prediction = null;
            this._startHover = null;

            const scene = this.scene;
            if (scene) {
                scene.running = false; // hold simulation while picking
                scene.scoreA = 0; scene.scoreB = 0;
                scene.matchTime = GAME.config.matchDuration;
                this.scene.time.timeScale = 1;
                this.speed = 1;
                this.paused = false;
                this.updateScore(0, 0);
                this.updateTimer(scene.matchTime);
            }
            this.setStatus('ОЖИДАНИЕ');

            this.hideOverlay();
            this.setHudVisible(false);
            this.setControlsVisible(false);

            [this.startBg, this.startTitle, this.startHint,
             this.startBtnA, this.startBtnAName, this.startBtnASub,
             this.startBtnB, this.startBtnBName, this.startBtnBSub]
                .forEach(o => o && o.setVisible(true));
            this._drawStartBtn('A');
            this._drawStartBtn('B');
            this._toggleStartInput(true);
            this._setActive();
        },

        hideStartScreen() {
            this.startShown = false;
            [this.startBg, this.startTitle, this.startHint,
             this.startBtnA, this.startBtnAName, this.startBtnASub,
             this.startBtnB, this.startBtnBName, this.startBtnBSub]
                .forEach(o => o && o.setVisible(false));
            this._toggleStartInput(false);
        },

        startMatch(team) {
            this.prediction = team;
            this.hideStartScreen();
            this.setHudVisible(true);
            this.setControlsVisible(true);

            const scene = this.scene;
            if (scene) {
                scene.running = true; // tip-off!
                this.scene.time.timeScale = 1;
                this.speed = 1;
                this.paused = false;
            }
            this.setStatus('ИГРА');
            this._setActive();
        },

        // ---------------- Actions ----------------
        setSpeed(s) {
            this.speed = s;
            this.paused = false;
            if (this.sceneSys) {
                this.sceneSys.resume('GameScene');
                this.scene.time.timeScale = s;
            }
            this.setStatus(s === 1 ? 'ИГРА' : 'ИГРА x' + s);
            this._setActive();
        },

        setPaused(p) {
            this.paused = p;
            if (this.sceneSys) {
                if (p) {
                    this.sceneSys.pause('GameScene');
                    this.setStatus('ПАУЗА');
                } else {
                    this.sceneSys.resume('GameScene');
                    this.setStatus(this.speed === 1 ? 'ИГРА' : 'ИГРА x' + this.speed);
                }
            }
            this._setActive();
        },

        togglePause() { this.setPaused(!this.paused); },

        // Reset = back to the start screen (fresh match on team pick).
        reset() {
            this.hideOverlay();
            if (this.sceneSys) {
                this.scene.time.timeScale = 1;
                this.speed = 1;
                this.paused = false;
                this.sceneSys.restart('GameScene');
            }
            this._setActive();
        },

        updateScore(a, b) {
            if (this.scoreA) this.scoreA.setText(String(a));
            if (this.scoreB) this.scoreB.setText(String(b));
        },

        updateTimer(seconds) {
            if (!this.timer) return;
            const clamped = Math.max(0, Math.ceil(seconds));
            const m = Math.floor(clamped / 60);
            const s = clamped % 60;
            this.timer.setText(m + ':' + (s < 10 ? '0' : '') + s);
            const urgent = clamped <= 10;
            if (urgent !== this.timerUrgent) {
                this.timerUrgent = urgent;
                if (urgent) {
                    this.timer.setColor('#ff3860').setShadow(0, 0, '#ff3860', 14, true, true);
                } else {
                    this.timer.setColor('#e8f8ff').setShadow(0, 0, '#7afcff', 10, true, true);
                }
            }
            if (urgent) {
                this.timer.setAlpha(0.55 + 0.45 * Math.abs(Math.sin(performance.now() / 220)));
            } else if (this.timer.alpha !== 1) {
                this.timer.setAlpha(1);
            }
        },

        setStatus(text) {
            if (this.status) this.status.setText(text);
        },

        showOverlay(winnerKey, scoreA, scoreB) {
            this.overlayShown = true;
            const title = winnerKey === 'A' ? 'TEAM NEON WINS'
                : (winnerKey === 'B' ? 'TEAM ICE WINS' : 'НИЧЬЯ');
            const tColor = winnerKey === 'A' ? '#ff2bd6'
                : (winnerKey === 'B' ? '#00f0ff' : '#e8f8ff');
            const tShadow = winnerKey === 'A' ? '#ff2bd6'
                : (winnerKey === 'B' ? '#00f0ff' : '#7afcff');
            this.ovTitle.setText(title).setColor(tColor).setShadow(0, 0, tShadow, 22, true, true);
            this.ovScore.setText(scoreA + ' : ' + scoreB);

            const choiceName = this.prediction === 'A' ? 'NEON'
                : (this.prediction === 'B' ? 'ICE' : '—');
            this.ovChoice.setText('ВАШ ВЫБОР: ' + choiceName);

            const correct = (winnerKey !== 'tie') && (this.prediction === winnerKey);
            let vText, vColor;
            if (correct) { vText = 'ВЫ УГАДАЛИ!'; vColor = '#7cffa0'; }
            else { vText = 'ВЫ НЕ УГАДАЛИ'; vColor = '#ff3860'; }
            this.ovVerdict.setText(vText).setColor(vColor).setShadow(0, 0, vColor, 14, true, true);

            [this.ovBg, this.ovPanel, this.ovTitle, this.ovScore, this.ovChoice, this.ovVerdict, this.ovBtn, this.ovBtnTxt]
                .forEach(o => o && o.setVisible(true));
            this._toggleOverlayInput(true);
        },

        hideOverlay() {
            this.overlayShown = false;
            [this.ovBg, this.ovPanel, this.ovTitle, this.ovScore, this.ovChoice, this.ovVerdict, this.ovBtn, this.ovBtnTxt]
                .forEach(o => o && o.setVisible(false));
            this._toggleOverlayInput(false);
        },
    };

    GAME.ui = ui;
})();
