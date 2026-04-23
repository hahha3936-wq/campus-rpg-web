/**
 * 校园RPG - 语音AI助手模块
 * Web Speech API 语音输入 + TTS输出 + DeepSeek 对话
 * @version 1.1.0
 */

var VoiceNPC = (function () {
    'use strict';

    // ============================================
    // 配置
    // ============================================
    var RECOGNITION_LANG = 'zh-CN';
    var TTS_RATE = 1.0;
    var TTS_PITCH = 1.1;
    var TTS_VOICE = null;
    var SILENCE_TIMEOUT_MS = 5000;

    // ============================================
    // 内部状态
    // ============================================
    var _recognition = null;
    var _isListening = false;
    var _conversationHistory = [];
    var _isSpeaking = false;
    var _ui = null;
    var _silenceTimer = null;
    var _panel = null;
    var _messagesEl = null;

    // ============================================
    // 初始化
    // ============================================
    function init() {
        var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn('[VoiceNPC] 浏览器不支持语音识别，将使用文字模式');
            createTextOnlyMode();
            return false;
        }

        _recognition = new SpeechRecognition();
        _recognition.lang = RECOGNITION_LANG;
        _recognition.continuous = true;
        _recognition.interimResults = false;

        _recognition.onresult = function (event) {
            var transcript = '';
            for (var i = event.resultIndex; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
            }
            if (transcript.trim()) {
                console.log('[VoiceNPC] 识别:', transcript);
                resetSilenceTimer();
                onTranscript(transcript.trim());
            }
        };

        _recognition.onerror = function (e) {
            console.warn('[VoiceNPC] 识别错误:', e.error);
            if (e.error === 'no-speech') return;
            if (_isListening) restartListening();
        };

        _recognition.onend = function () {
            if (_isListening) restartListening();
        };

        initTTS();
        createUI();

        console.log('[VoiceNPC] 初始化完成');
        document.dispatchEvent(new CustomEvent('voicenpc-ready'));
        return true;
    }

    // ============================================
    // TTS 初始化
    // ============================================
    function initTTS() {
        var synth = window.speechSynthesis;
        var voices = synth.getVoices();

        for (var i = 0; i < voices.length; i++) {
            var v = voices[i];
            if (v.lang.indexOf('zh') !== -1 && v.name.indexOf('Female') !== -1) {
                TTS_VOICE = v;
                break;
            }
        }
        if (!TTS_VOICE) {
            for (var i = 0; i < voices.length; i++) {
                if (voices[i].lang.indexOf('zh') !== -1) { TTS_VOICE = voices[i]; break; }
            }
        }

        synth.onvoiceschanged = function () {
            var vlist = synth.getVoices();
            for (var i = 0; i < vlist.length; i++) {
                if (vlist[i].lang.indexOf('zh') !== -1 && vlist[i].name.indexOf('Female') !== -1) {
                    TTS_VOICE = vlist[i]; break;
                }
            }
        };
    }

    // ============================================
    // 语音合成播报
    // ============================================
    function speak(text) {
        var synth = window.speechSynthesis;
        if (_isSpeaking) synth.cancel();

        var utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN';
        utterance.rate = TTS_RATE;
        utterance.pitch = TTS_PITCH;
        if (TTS_VOICE) utterance.voice = TTS_VOICE;

        utterance.onstart = function () { _isSpeaking = true; };
        utterance.onend = function () { _isSpeaking = false; };
        utterance.onerror = function () { _isSpeaking = false; };

        synth.speak(utterance);
        appendMessage('assistant', text);
    }

    // ============================================
    // 监听控制
    // ============================================
    function startListening() {
        if (_isListening) return;
        _isListening = true;

        try {
            _recognition.start();
            updateMicUI(true);
            resetSilenceTimer();
            console.log('[VoiceNPC] 开始监听...');
        } catch (e) {
            _isListening = false;
        }
    }

    function stopListening() {
        _isListening = false;
        try { _recognition.stop(); } catch (e) {}
        clearSilenceTimer();
        updateMicUI(false);
        console.log('[VoiceNPC] 停止监听');
    }

    function restartListening() {
        stopListening();
        setTimeout(startListening, 200);
    }

    function resetSilenceTimer() {
        clearSilenceTimer();
        _silenceTimer = setTimeout(function () {
            if (_isListening) {
                stopListening();
                appendMessage('assistant', '你好像没在说话，小灵先休息一下~点击麦克风再叫我吧！');
            }
        }, SILENCE_TIMEOUT_MS);
    }

    function clearSilenceTimer() {
        if (_silenceTimer) { clearTimeout(_silenceTimer); _silenceTimer = null; }
    }

    // ============================================
    // 处理识别到的文字
    // ============================================
    function onTranscript(text) {
        appendMessage('user', text);
        sendToAI(text);
    }

    function sendToAI(text) {
        var token = localStorage.getItem('campus_rpg_token');
        var apiBase = window.CAMPUS_RPG_API_BASE || '';

        fetch(apiBase + '/api/chat/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({
                message: text,
                history: _conversationHistory
            })
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.success && data.reply) {
                _conversationHistory.push(['user', text]);
                _conversationHistory.push(['assistant', data.reply]);

                if (data.action) {
                    executeAction(data.action, data.action_data || {});
                }

                speak(data.reply);
            } else if (data.error) {
                appendMessage('assistant', '小灵刚才走神了...' + data.error);
                speak('网络好像有点问题，稍后再试试吧~');
            }
        })
        .catch(function (err) {
            appendMessage('assistant', '小灵连接失败了...');
            speak('网络好像有点问题，稍后再试试吧~');
        });
    }

    // ============================================
    // 执行游戏动作
    // ============================================
    function executeAction(action, data) {
        console.log('[VoiceNPC] 执行动作:', action);
        switch (action) {
            case 'open_tasks':
                document.dispatchEvent(new CustomEvent('voice-open', { detail: { panel: 'tasks' } }));
                break;
            case 'open_bag':
                document.dispatchEvent(new CustomEvent('voice-open', { detail: { panel: 'bag' } }));
                break;
            case 'open_map':
                document.dispatchEvent(new CustomEvent('voice-open', { detail: { panel: 'map' } }));
                break;
            case 'start_ar':
                document.dispatchEvent(new CustomEvent('voice-open', { detail: { panel: 'ar' } }));
                break;
            case 'claim_reward':
                document.dispatchEvent(new CustomEvent('voice-claim', { detail: data }));
                break;
            case 'show_status':
                document.dispatchEvent(new CustomEvent('voice-open', { detail: { panel: 'status' } }));
                break;
            case 'show_help':
                showHelpPanel();
                break;
            case 'daily_checkin':
                document.dispatchEvent(new CustomEvent('voice-action', { detail: { action: 'checkin' } }));
                break;
            case 'close_panel':
                document.dispatchEvent(new CustomEvent('voice-close', { detail: {} }));
                break;
        }
    }

    // ============================================
    // UI 创建
    // ============================================
    function createUI() {
        // 浮动麦克风按钮
        var btn = document.createElement('div');
        btn.id = 'voice-npc-btn';
        btn.style.cssText = [
            'position:fixed',
            'bottom:110px', 'right:24px',
            'width:56px', 'height:56px',
            'background:linear-gradient(135deg,#667eea,#764ba2)',
            'border-radius:50%',
            'box-shadow:0 4px 20px rgba(102,126,234,0.5)',
            'cursor:pointer',
            'z-index:9998',
            'display:flex', 'align-items:center', 'justify-content:center',
            'transition:transform 0.2s,box-shadow 0.2s'
        ].join(';');
        btn.innerHTML = [
            '<svg id="mic-icon" width="24" height="24" viewBox="0 0 24 24" fill="white">',
            '<path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>',
            '<path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" opacity=".8"/>',
            '</svg>'
        ].join('');

        btn.addEventListener('click', function () {
            if (_isListening) { stopListening(); }
            else { startListening(); }
        });

        document.body.appendChild(btn);
        _ui = btn;

        // 动画样式
        var animStyle = document.createElement('style');
        animStyle.textContent = [
            '@keyframes mic-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }',
            '@keyframes mic-pulse { 0%{box-shadow:0 0 0 0 rgba(245,87,108,.7)} 70%{box-shadow:0 0 0 16px rgba(245,87,108,0)} 100%{box-shadow:0 0 0 0 rgba(245,87,108,0)} }',
            '#voice-npc-btn{animation:mic-float 2s ease-in-out infinite}',
            '#voice-npc-btn.active{animation:mic-pulse 1.5s infinite, none!important}',
            '#voice-npc-btn:hover{transform:scale(1.1);box-shadow:0 6px 28px rgba(102,126,234,.7)}'
        ].join('');
        document.head.appendChild(animStyle);

        // 聊天面板
        createChatPanel();
    }

    function createChatPanel() {
        _panel = document.createElement('div');
        _panel.id = 'voice-npc-panel';
        _panel.style.cssText = [
            'position:fixed',
            'bottom:180px', 'right:24px',
            'width:320px', 'max-height:400px',
            'background:linear-gradient(135deg,rgba(20,20,50,.97),rgba(40,20,70,.97))',
            'border-radius:16px',
            'border:1px solid rgba(255,255,255,.12)',
            'box-shadow:0 8px 32px rgba(0,0,0,.5)',
            'z-index:9997',
            'display:none',
            'flex-direction:column',
            'overflow:hidden',
            'backdrop-filter:blur(12px)'
        ].join(';');

        var header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.1);cursor:pointer';
        header.innerHTML = [
            '<span style="font-size:20px;margin-right:8px">🌟</span>',
            '<span style="color:#fff;font-weight:bold;font-size:14px">小灵 AI助手</span>',
            '<span id="voice-npc-status" style="margin-left:auto;font-size:11px;color:#aaa;background:rgba(255,255,255,.1);padding:2px 8px;border-radius:10px">在线</span>',
            '<span id="voice-npc-close" style="margin-left:8px;color:#888;cursor:pointer;font-size:18px;line-height:1">&times;</span>'
        ].join('');
        header.querySelector('#voice-npc-close').addEventListener('click', function (e) {
            e.stopPropagation();
            _panel.style.display = 'none';
        });
        header.addEventListener('click', function () {
            _panel.style.display = _panel.style.display === 'none' ? 'flex' : 'none';
        });

        _messagesEl = document.createElement('div');
        _messagesEl.style.cssText = 'flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;max-height:280px';
        _messagesEl.id = 'voice-npc-messages';

        var inputArea = document.createElement('div');
        inputArea.style.cssText = 'display:flex;gap:8px;padding:10px 12px;border-top:1px solid rgba(255,255,255,.08)';
        inputArea.innerHTML = [
            '<input id="voice-npc-input" type="text" placeholder="输入文字和小灵聊天..." style="',
            'flex:1;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);',
            'border-radius:20px;padding:8px 14px;color:#fff;font-size:13px;outline:none" />',
            '<button id="voice-npc-send" style="',
            'background:linear-gradient(135deg,#667eea,#764ba2);border:none;border-radius:50%;',
            'width:36px;height:36px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px">➤</button>'
        ].join('');

        var input = inputArea.querySelector('#voice-npc-input');
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && input.value.trim()) {
                onTranscript(input.value.trim());
                input.value = '';
            }
        });
        inputArea.querySelector('#voice-npc-send').addEventListener('click', function () {
            if (input.value.trim()) {
                onTranscript(input.value.trim());
                input.value = '';
            }
        });

        _panel.appendChild(header);
        _panel.appendChild(_messagesEl);
        _panel.appendChild(inputArea);
        document.body.appendChild(_panel);

        // 点击麦克风打开面板
        _ui.addEventListener('dblclick', function () {
            _panel.style.display = _panel.style.display === 'none' ? 'flex' : 'none';
            if (_panel.style.display === 'flex') {
                _messagesEl.scrollTop = _messagesEl.scrollHeight;
            }
        });
    }

    function appendMessage(role, text) {
        if (!_messagesEl) return;

        var msg = document.createElement('div');
        var isUser = role === 'user';
        var avatar = isUser ? '🧑' : '🌟';
        var bg = isUser
            ? 'background:linear-gradient(135deg,#667eea,#764ba2)'
            : 'background:rgba(255,255,255,.08)';
        var align = isUser ? 'align-self:flex-end' : 'align-self:flex-start';
        var radius = isUser
            ? 'border-radius:16px 16px 4px 16px'
            : 'border-radius:16px 16px 16px 4px';
        var name = isUser ? '你' : '小灵';

        msg.style.cssText = [
            'display:flex', 'align-items:flex-start', 'gap:6px', align
        ].join(';');

        msg.innerHTML = [
            '<span style="font-size:14px;flex-shrink:0;padding-top:4px">' + avatar + '</span>',
            '<div>',
            '<div style="font-size:10px;color:#888;margin-bottom:2px;padding-left:4px">' + name + '</div>',
            '<div style="' + bg + ';' + radius + ';padding:8px 12px;color:#fff;font-size:13px;line-height:1.4;max-width:220px;word-break:break-all">',
            text + '</div></div>'
        ].join('');

        _messagesEl.appendChild(msg);
        _messagesEl.scrollTop = _messagesEl.scrollHeight;
    }

    function updateMicUI(active) {
        if (!_ui) return;
        var icon = document.getElementById('mic-icon');
        var status = document.getElementById('voice-npc-status');
        if (active) {
            _ui.classList.add('active');
            if (icon) icon.innerHTML = [
                '<path d="M6 6h12v12H6z" stroke="white" stroke-width="2" fill="none"/>',
                '<line x1="6" y1="6" x2="18" y2="18" stroke="white" stroke-width="2"/>'
            ].join('');
            if (status) { status.textContent = '录音中'; status.style.color = '#f5576c'; }
        } else {
            _ui.classList.remove('active');
            if (icon) icon.innerHTML = [
                '<path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>',
                '<path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" opacity=".8"/>'
            ].join('');
            if (status) { status.textContent = '在线'; status.style.color = '#aaa'; }
        }
    }

    function showHelpPanel() {
        var helpText = '我是小灵，你的校园冒险助手！可以说：打开任务、查看背包、开始AR扫描、每日签到等~也可以和我聊天哦！';
        speak(helpText);
    }

    // ============================================
    // 文字模式（无语音识别时）
    // ============================================
    function createTextOnlyMode() {
        initTTS();
        createUI();
        console.log('[VoiceNPC] 文字模式启动');
    }

    // ============================================
    // 对外接口
    // ============================================
    return {
        init: init,
        start: startListening,
        stop: stopListening,
        speak: speak,
        clearHistory: function () { _conversationHistory = []; },
        showPanel: function () { if (_panel) _panel.style.display = 'flex'; }
    };
})();

window.VoiceNPC = VoiceNPC;
