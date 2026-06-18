window.GAME = window.GAME || {};

(function () {
    'use strict';

    const ui = {
        scene: null,
        el: {},
        speed: 1,
        paused: false,

        init(scene) {
            this.scene = scene;
            this.sceneSys = scene.scene; // ScenePlugin (pause/resume/restart)
            this.el.scoreA = document.getElementById('score-a');
            this.el.scoreB = document.getElementById('score-b');
            this.el.timer = document.getElementById('timer');
            this.el.status = document.getElementById('status');
            this.el.overlay = document.getElementById('overlay');
            this.el.overlayTitle = document.getElementById('overlay-title');
            this.el.overlayScore = document.getElementById('overlay-score');

            const wire = (id, fn) => {
                const b = document.getElementById(id);
                if (b) b.addEventListener('click', fn);
                return b;
            };
            this.btnPause = wire('btn-pause', () => this.setPaused(true));
            this.btnPlay = wire('btn-play', () => this.setSpeed(1));
            this.btnX2 = wire('btn-x2', () => this.setSpeed(2));
            this.btnX5 = wire('btn-x5', () => this.setSpeed(5));
            this.btnReset = wire('btn-reset', () => this.reset());
            this.btnPlayAgain = wire('btn-play-again', () => this.reset());

            // keyboard shortcuts
            window.addEventListener('keydown', (e) => {
                if (e.key === ' ') { e.preventDefault(); this.togglePause(); }
                else if (e.key === '1') this.setSpeed(1);
                else if (e.key === '2') this.setSpeed(2);
                else if (e.key === '5') this.setSpeed(5);
                else if (e.key.toLowerCase() === 'r') this.reset();
            });
        },

        setActiveSpeedBtn() {
            const map = { '1': this.btnPlay, '2': this.btnX2, '5': this.btnX5 };
            [this.btnPlay, this.btnX2, this.btnX5].forEach(b => b && b.classList.remove('active'));
            this.btnPause && this.btnPause.classList.remove('active');
            if (!this.paused && map[String(this.speed)]) {
                map[String(this.speed)].classList.add('active');
            } else if (this.paused) {
                this.btnPause && this.btnPause.classList.add('active');
            }
        },

        setSpeed(s) {
            this.speed = s;
            this.paused = false;
            if (this.sceneSys) {
                this.sceneSys.resume('GameScene');
                this.scene.time.timeScale = s;
            }
            this.setStatus(s === 1 ? 'ИГРА' : 'ИГРА x' + s);
            this.setActiveSpeedBtn();
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
            this.setActiveSpeedBtn();
        },

        togglePause() {
            this.setPaused(!this.paused);
        },

        reset() {
            this.hideOverlay();
            if (this.sceneSys) {
                this.scene.time.timeScale = 1;
                this.speed = 1;
                this.paused = false;
                this.sceneSys.restart('GameScene');
            }
            this.setActiveSpeedBtn();
        },

        updateScore(a, b) {
            if (this.el.scoreA) this.el.scoreA.textContent = a;
            if (this.el.scoreB) this.el.scoreB.textContent = b;
        },

        updateTimer(seconds) {
            if (!this.el.timer) return;
            const clamped = Math.max(0, Math.ceil(seconds));
            const m = Math.floor(clamped / 60);
            const s = clamped % 60;
            this.el.timer.textContent = m + ':' + (s < 10 ? '0' : '') + s;
            if (clamped <= 10) this.el.timer.classList.add('urgent');
            else this.el.timer.classList.remove('urgent');
        },

        setStatus(text) {
            if (this.el.status) this.el.status.textContent = text;
        },

        showOverlay(winnerKey, scoreA, scoreB) {
            if (!this.el.overlay) return;
            this.el.overlayTitle.textContent = winnerKey === 'A'
                ? 'TEAM NEON WINS'
                : (winnerKey === 'B' ? 'TEAM ICE WINS' : 'НИЧЬЯ');
            this.el.overlayTitle.className = 'overlay-title' + (winnerKey === 'A' ? ' a' : '');
            this.el.overlayScore.textContent = scoreA + ' : ' + scoreB;
            this.el.overlay.classList.remove('hidden');
        },

        hideOverlay() {
            if (this.el.overlay) this.el.overlay.classList.add('hidden');
        },
    };

    GAME.ui = ui;
})();
