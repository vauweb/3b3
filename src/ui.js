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
        _keyBound: false,

        W: 0, H: 0,

        // HUD (no backing panel / line)
        lblA: null, scoreA: null,
        lblB: null, scoreB: null,
        timer: null, status: null,
        timerUrgent: false,

        // Controls (round, icon-only, bottom-left)
        buttons: [],

        // Overlay
        ovBg: null, ovBgHit: null, ovPanel: null,
        ovTitle: null, ovScore: null, ovHint: null,
        ovBtn: null, ovBtnTxt: null, ovBtnPos: null, ovBtnHit: null,

        init(scene) {
            this.scene = scene;
            this.sceneSys = scene.scene;
            this.speed = 1;
            this.paused = false;
            this.overlayShown = false;
            this.timerUrgent = false;

            this.W = scene.scale.width;
            this.H = scene.scale.height;

            this.createHUD();
            this.createControls();
            this.createOverlay();
            this.layout();

            if (!this._keyBound) {
                this._keyBound = true;
                window.addEventListener('keydown', (e) => this._onKey(e));
            }

            this.setStatus('ИГРА');
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
            // Round, icon-only buttons (glyph count conveys speed).
            const defs = [
                { icon: '\u23F8', kind: 'pause', speed: 0 },            // pause
                { icon: '\u25B6', kind: 'speed', speed: 1 },            // play (x1)
                { icon: '\u25B6\u25B6', kind: 'speed', speed: 2 },      // x2
                { icon: '\u25B6\u25B6\u25B6', kind: 'speed', speed: 5 }, // x5
                { icon: '\u21BB', kind: 'reset', speed: -1 },           // reset
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
                fontFamily: FONT, fontSize: '62px', fontStyle: 'bold', color: '#e8f8ff',
            }).setOrigin(0.5, 0).setDepth(2002).setLetterSpacing(8).setVisible(false);

            this.ovHint = s.add.text(0, 0, 'МАТЧ ОКОНЧЕН', {
                fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#6a7a9a',
            }).setOrigin(0.5, 0).setDepth(2002).setLetterSpacing(3).setVisible(false);

            this.ovBtn = s.add.graphics().setDepth(2002);
            this.ovBtnHit = new Phaser.Geom.Rectangle(0, 0, 1, 1);
            this.ovBtn.setInteractive(this.ovBtnHit, Phaser.Geom.Rectangle.Contains);
            this.ovBtn.on('pointerover', () => { this.ovBtnPos.hover = true; this._drawOvBtn(); });
            this.ovBtn.on('pointerout', () => { this.ovBtnPos.hover = false; this._drawOvBtn(); });
            this.ovBtn.on('pointerdown', () => { if (this.overlayShown) this.reset(); });
            this.ovBtn.setVisible(false);
            this.ovBtnPos = { x: 0, y: 0, w: 250, h: 46, hover: false };

            this.ovBtnTxt = s.add.text(0, 0, '\u21BB СЫГРАТЬ ЕЩЁ', {
                fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: '#00f0ff',
            }).setOrigin(0.5).setDepth(2003).setLetterSpacing(3).setVisible(false);
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

            // Overlay: full-screen backdrop + centered panel.
            this.ovBg.clear();
            this.ovBg.fillStyle(0x05060f, 0.82).fillRect(0, 0, W, H);
            this.ovBgHit.setSize(W, H);

            const pw = 540, ph = 290;
            const px = (W - pw) / 2;
            const py = (H - ph) / 2 - 20;
            this.ovPanel.clear();
            this.ovPanel.fillStyle(0x0a0e1e, 0.72).fillRoundedRect(px, py, pw, ph, 10);
            this.ovPanel.lineStyle(2, 0x7afcff, 0.35).strokeRoundedRect(px, py, pw, ph, 10);

            this.ovTitle.setPosition(W / 2, py + 44);
            this.ovScore.setPosition(W / 2, py + 118);
            this.ovHint.setPosition(W / 2, py + 200);

            const bw = 250, bh = 46, bx = (W - bw) / 2, by = py + ph - 66;
            this.ovBtnPos.x = bx; this.ovBtnPos.y = by; this.ovBtnPos.w = bw; this.ovBtnPos.h = bh;
            this.ovBtnHit.setPosition(bx, by); this.ovBtnHit.setSize(bw, bh);
            this._drawOvBtn();
            this.ovBtnTxt.setPosition(bx + bw / 2, by + bh / 2);
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

        _drawOvBtn() {
            const b = this.ovBtnPos;
            const g = this.ovBtn;
            g.clear();
            g.fillStyle(0x00f0ff, b.hover ? 0.28 : 0.18);
            g.fillRoundedRect(b.x, b.y, b.w, b.h, 6);
            g.lineStyle(2, 0x00f0ff, 1);
            g.strokeRoundedRect(b.x, b.y, b.w, b.h, 6);
        },

        _toggleOverlayInput(enable) {
            if (this.ovBtn && this.ovBtn.input) this.ovBtn.input.enabled = enable;
            if (this.ovBg && this.ovBg.input) this.ovBg.input.enabled = enable;
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
            [this.ovBg, this.ovPanel, this.ovTitle, this.ovScore, this.ovHint, this.ovBtn, this.ovBtnTxt]
                .forEach(o => o && o.setVisible(true));
            this._toggleOverlayInput(true);
        },

        hideOverlay() {
            this.overlayShown = false;
            [this.ovBg, this.ovPanel, this.ovTitle, this.ovScore, this.ovHint, this.ovBtn, this.ovBtnTxt]
                .forEach(o => o && o.setVisible(false));
            this._toggleOverlayInput(false);
        },
    };

    GAME.ui = ui;
})();
