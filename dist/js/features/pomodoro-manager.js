/**
 * 校园RPG - 番茄钟管理器
 * 从 app.js 剥离的独立番茄钟模块
 */

const PomodoroState = {
    isRunning: false,
    isPaused: false,
    mode: 'work', // 'work' | 'break'
    totalSeconds: 25 * 60,
    remainingSeconds: 25 * 60,
    timerId: null,
    completedSessions: 0
};

function _buildPomodoroBody() {
    const mins = Math.floor(PomodoroState.remainingSeconds / 60);
    const secs = PomodoroState.remainingSeconds % 60;
    const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    const total = PomodoroState.totalSeconds;
    const progress = ((total - PomodoroState.remainingSeconds) / total) * 100;
    const circumference = 2 * Math.PI * 88;
    const dashoffset = circumference * (1 - progress / 100);

    const isWork = PomodoroState.mode === 'work';
    const ringColor = isWork ? '#f5576c' : '#4ade80';

    return `
        <div class="pomodoro-display">
            <svg class="pomodoro-progress-ring" viewBox="0 0 200 200">
                <defs>
                    <linearGradient id="pomodoroGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stop-color="${ringColor}" />
                        <stop offset="100%" stop-color="${isWork ? '#f093fb' : '#4ade80'}" />
                    </linearGradient>
                </defs>
                <circle class="bg" cx="100" cy="100" r="88" />
                <circle class="progress" cx="100" cy="100" r="88"
                    stroke="url(#pomodoroGradient)"
                    stroke-dasharray="${circumference}"
                    stroke-dashoffset="${dashoffset}"
                />
            </svg>
            <div class="pomodoro-timer ${isWork ? '' : 'break-timer'}" id="pomo-timer">${timeStr}</div>
            <div class="pomodoro-mode-label ${isWork ? 'work-mode' : 'break-mode'}" id="pomo-mode-label">
                ${isWork ? '🍅 专注时间' : '☕ 休息时间'}
            </div>
            <div class="pomodoro-presets">
                <button class="pomodoro-preset ${total === 25*60 ? 'active' : ''}" data-minutes="25">25分钟</button>
                <button class="pomodoro-preset ${total === 15*60 ? 'active' : ''}" data-minutes="15">15分钟</button>
                <button class="pomodoro-preset ${total === 5*60 ? 'active' : ''}" data-minutes="5">5分钟</button>
            </div>
            <div class="pomodoro-controls">
                <button class="pomodoro-btn pomodoro-btn-secondary" id="pomo-reset-btn" title="重置">↺</button>
                <button class="pomodoro-btn pomodoro-btn-primary ${PomodoroState.isRunning ? 'running' : ''}" id="pomo-main-btn">
                    ${PomodoroState.isRunning ? '⏸' : '▶'}
                </button>
                <button class="pomodoro-btn pomodoro-btn-secondary" id="pomo-skip-btn" title="跳过">⏭</button>
            </div>
            <div class="pomodoro-stats-mini" id="pomo-stats">
                <div class="pomodoro-stat-mini">
                    <div class="pomodoro-stat-mini-value" id="pomo-session-count">0</div>
                    <div class="pomodoro-stat-mini-label">今日完成</div>
                </div>
                <div class="pomodoro-stat-mini">
                    <div class="pomodoro-stat-mini-value" id="pomo-total-mins">0</div>
                    <div class="pomodoro-stat-mini-label">累计分钟</div>
                </div>
                <div class="pomodoro-stat-mini">
                    <div class="pomodoro-stat-mini-value">${PomodoroState.completedSessions}</div>
                    <div class="pomodoro-stat-mini-label">本轮连击</div>
                </div>
            </div>
        </div>
    `;
}

function _bindPomodoroEvents() {
    const mainBtn = document.getElementById('pomo-main-btn');
    const resetBtn = document.getElementById('pomo-reset-btn');
    const skipBtn = document.getElementById('pomo-skip-btn');

    mainBtn?.addEventListener('click', () => {
        if (PomodoroState.isRunning) {
            _pausePomodoro();
        } else {
            _startPomodoro();
        }
    });

    resetBtn?.addEventListener('click', () => {
        _resetPomodoro();
        _refreshPomodoroUI();
    });

    skipBtn?.addEventListener('click', () => {
        _onPomodoroComplete(false);
    });

    document.querySelectorAll('.pomodoro-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            const m = parseInt(btn.dataset.minutes);
            if (PomodoroState.isRunning) return;
            PomodoroState.totalSeconds = m * 60;
            PomodoroState.remainingSeconds = m * 60;
            _refreshPomodoroUI();
        });
    });
}

function _startPomodoro() {
    PomodoroState.isRunning = true;
    PomodoroState.isPaused = false;
    const btn = document.getElementById('pomo-main-btn');
    if (btn) btn.textContent = '⏸';
    btn?.classList.add('running');
    document.getElementById('pomodoro-btn')?.classList.add('running');

    PomodoroState.timerId = setInterval(() => {
        PomodoroState.remainingSeconds--;
        _refreshPomodoroTimerUI();

        if (PomodoroState.remainingSeconds <= 0) {
            _onPomodoroComplete(true);
        }
    }, 1000);
}

function _pausePomodoro() {
    PomodoroState.isRunning = false;
    PomodoroState.isPaused = true;
    clearInterval(PomodoroState.timerId);
    PomodoroState.timerId = null;
    const btn = document.getElementById('pomo-main-btn');
    if (btn) btn.textContent = '▶';
    btn?.classList.remove('running');
    document.getElementById('pomodoro-btn')?.classList.remove('running');
}

function _resetPomodoro() {
    PomodoroState.isRunning = false;
    PomodoroState.isPaused = false;
    clearInterval(PomodoroState.timerId);
    PomodoroState.timerId = null;
    PomodoroState.remainingSeconds = PomodoroState.totalSeconds;
    PomodoroState.mode = 'work';
    document.getElementById('pomodoro-btn')?.classList.remove('running');
}

function _showPomodoroComplete(completed, minutes) {
    const body = document.getElementById('pomodoro-modal-body');
    if (!body) return;
    body.innerHTML = `
        <div class="pomodoro-complete-banner">
            <div class="complete-icon">🎉</div>
            <div class="complete-title">${completed ? '专注完成！' : '时间到！'}</div>
            <div class="complete-desc">${completed ? `你专注了 ${minutes} 分钟，太棒了！` : '休息一下吧~'}</div>
        </div>
        <div class="pomodoro-complete-rewards">
            <div class="pomodoro-reward-chip">⭐ <span class="chip-value">+10</span> 经验</div>
            <div class="pomodoro-reward-chip">🎯 <span class="chip-value">+15</span> 专注</div>
        </div>
        <div style="text-align:center; margin-top:12px;">
            <div style="font-size:13px; color:#6b7280;">即将进入休息时间...</div>
        </div>
    `;
}

function _refreshPomodoroTimerUI() {
    const mins = Math.floor(PomodoroState.remainingSeconds / 60);
    const secs = PomodoroState.remainingSeconds % 60;
    const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    const timerEl = document.getElementById('pomo-timer');
    if (timerEl) timerEl.textContent = timeStr;

    const total = PomodoroState.totalSeconds;
    const progress = ((total - PomodoroState.remainingSeconds) / total) * 100;
    const circumference = 2 * Math.PI * 88;
    const dashoffset = circumference * (1 - progress / 100);
    const progressCircle = document.querySelector('.pomodoro-progress-ring .progress');
    if (progressCircle) {
        progressCircle.setAttribute('stroke-dashoffset', dashoffset);
    }
}

function _refreshPomodoroUI() {
    const body = document.getElementById('pomodoro-modal-body');
    if (body) body.innerHTML = _buildPomodoroBody();
    _bindPomodoroEvents();
}

function _onPomodoroComplete(completed) {
    clearInterval(PomodoroState.timerId);
    PomodoroState.timerId = null;
    PomodoroState.isRunning = false;
    PomodoroState.isPaused = false;

    const minutes = PomodoroState.totalSeconds / 60;

    if (PomodoroState.mode === 'work') {
        API.recordPomodoroSession?.(minutes, completed, '');
        PomodoroState.completedSessions++;

        PomodoroState.mode = 'break';
        PomodoroState.totalSeconds = 5 * 60;
        PomodoroState.remainingSeconds = 5 * 60;

        _showPomodoroComplete(completed, minutes);
        if (window.SoundManager) SoundManager.play('complete');

        setTimeout(() => {
            _refreshPomodoroUI();
            _startPomodoro();
        }, 3000);
    } else {
        PomodoroState.mode = 'work';
        PomodoroState.totalSeconds = 25 * 60;
        PomodoroState.remainingSeconds = 25 * 60;
        _refreshPomodoroUI();
    }

    if (typeof updateRoleDisplay === 'function') updateRoleDisplay();
    if (typeof updateStatBars === 'function') updateStatBars();
}

/** 显示番茄钟模态框 */
function showPomodoroModal() {
    const modalEl = document.getElementById('pomodoroModal');
    const body = document.getElementById('pomodoro-modal-body');
    const modal = bootstrap?.Modal?.getOrCreateInstance?.(modalEl);

    body.innerHTML = _buildPomodoroBody();
    _bindPomodoroEvents();

    // 模态框关闭时自动停止计时器，防止内存泄漏
    modalEl.addEventListener('hidden.bs.modal', () => {
        clearInterval(PomodoroState.timerId);
        PomodoroState.timerId = null;
        PomodoroState.isRunning = false;
        PomodoroState.isPaused = false;
    }, { once: true });

    modal?.show?.();
}

window.PomodoroState = PomodoroState;
window.PomodoroManager = {
    show: showPomodoroModal,
    getState: () => PomodoroState
};
