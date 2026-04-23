/**
 * 校园RPG - DeepSeek Vision 场景识别 AR 模块
 * 替代传统图像标记，通过 AI 视觉识别真实校园场景
 * @version 1.1.0
 */

var VisionAR = (function () {
    'use strict';

    // ============================================
    // 配置
    // ============================================
    var SCAN_INTERVAL_MS = 3000;
    var SCENE_COOLDOWN_S = 3600;
    var CAPTURE_WIDTH = 640;
    var CAPTURE_HEIGHT = 480;

    // 场景配置（与后端 VISION_SYSTEM_PROMPT 的场景ID对应）
    var SCENE_CONFIG = {
        'school_entrance': {
            name: '校门', icon: '🏫',
            greeting: '欢迎回来，冒险者！',
            content: '这是校园冒险的起点！每天第一次签到可获得双倍金币哦~',
            reward: { gold: 100, experience: 50 },
            interaction: 'checkin'
        },
        'teaching_building': {
            name: '教学楼', icon: '📚',
            greeting: '叮铃铃~ 上课啦！',
            content: '快去找一间教室坐下，课堂答题可获得大量经验！',
            reward: { experience: 30 },
            interaction: 'quiz'
        },
        'library': {
            name: '图书馆', icon: '📖',
            greeting: '嘘~ 这里是知识的殿堂',
            content: '安静自习可提升学习效率，有机会发现稀有知识种子！',
            reward: { experience: 80 },
            interaction: 'study'
        },
        'cafeteria': {
            name: '食堂', icon: '🍜',
            greeting: '咕噜噜~ 肚子饿了？',
            content: '好好吃饭才能好好战斗！干饭buff：精力+30，金币+15！',
            reward: { energy: 30, gold: 15 },
            interaction: 'meal'
        },
        'dormitory': {
            name: '宿舍', icon: '🏠',
            greeting: '回到温暖的小窝啦~',
            content: '休息一下吧！睡眠恢复精力+20，心情+10，还有几率触发室友夜谈彩蛋！',
            reward: { energy: 20, mood: 10 },
            interaction: 'rest'
        },
        'playground': {
            name: '操场', icon: '🏃',
            greeting: '生命在于运动！',
            content: '来一场晨跑或打球吧！运动后压力-25，心情+20，有概率触发校队招募彩蛋！',
            reward: { mood: 20, stress: -25 },
            interaction: 'exercise'
        },
        'laboratory': {
            name: '实验楼', icon: '🔬',
            greeting: '科学探索时间~',
            content: '化学实验成功率取决于你的智力属性！成功率=(智力/100)，快来试试吧！',
            reward: { experience: 60 },
            interaction: 'experiment'
        },
        'bookshop': {
            name: '书店', icon: '📕',
            greeting: '欢迎来到知识便利店~',
            content: '用金币购买知识书籍，永久提升属性！每本书随机出现，运气好能买到绝版！',
            reward: { experience: 40 },
            interaction: 'shop'
        },
        'garden': {
            name: '校园花园', icon: '🌸',
            greeting: '花开的季节~',
            content: '在此冥想可驱散压力！有几率发现隐藏的「许愿池」彩蛋，投币许愿！',
            reward: { mood: 25, stress: -30 },
            interaction: 'meditate'
        },
        'admin_building': {
            name: '行政楼', icon: '🏢',
            greeting: '教务处报到处~',
            content: '这里是校园任务中心！每日可领取3个支线任务，完成后获得随机奖励！',
            reward: { gold: 50 },
            interaction: 'daily_quests'
        },
        'sports_field': {
            name: '篮球场', icon: '🏀',
            greeting: '嘿！来一局吗？',
            content: '3v3 篮球赛小游戏！获胜队伍全员获得「运动健将」buff和金币！',
            reward: { mood: 30, gold: 20 },
            interaction: 'basketball'
        },
        'music_room': {
            name: '音乐教室', icon: '🎵',
            greeting: '♪ 哆来咪~',
            content: '这里有钢琴和吉他！演奏一曲可恢复心情，也有几率触发校园歌手大赛彩蛋！',
            reward: { mood: 35 },
            interaction: 'music'
        },
        'computer_lab': {
            name: '机房', icon: '💻',
            greeting: '代码即正义！',
            content: '写代码副本：解决算法题可获得大量经验，有概率触发「极客觉醒」隐藏成就！',
            reward: { experience: 100 },
            interaction: 'coding'
        },
        'swimming_pool': {
            name: '游泳池', icon: '🏊',
            greeting: '扑通！夏日清凉！',
            content: '游泳副本！完赛可获得「水中健将」称号，炎热天气下奖励翻倍！',
            reward: { mood: 25, energy: 15 },
            interaction: 'swimming'
        },
        'unknown': {
            name: '神秘角落', icon: '❓',
            content: '这里有什么特别的东西吗...再仔细看看？',
            reward: {},
            interaction: 'search'
        }
    };

    // ============================================
    // 内部状态
    // ============================================
    var _video = null;
    var _canvas = null;
    var _ctx = null;
    var _timer = null;
    var _isRunning = false;
    var _lastSceneId = null;
    var _lastSceneTime = 0;
    var _pendingRequest = false;

    // ============================================
    // 初始化
    // ============================================
    function init(videoElement) {
        _video = videoElement;
        _canvas = document.createElement('canvas');
        _canvas.width = CAPTURE_WIDTH;
        _canvas.height = CAPTURE_HEIGHT;
        _ctx = _canvas.getContext('2d');
        console.log('[VisionAR] 初始化完成，场景识别就绪');
    }

    // ============================================
    // 截图
    // ============================================
    function captureFrame() {
        if (!_video || !_ctx) return null;
        try {
            _ctx.drawImage(_video, 0, 0, _canvas.width, _canvas.height);
            return _canvas.toDataURL('image/jpeg', 0.7);
        } catch (e) {
            return null;
        }
    }

    // ============================================
    // 发送识别请求
    // ============================================
    function recognizeScene(imageData) {
        if (_pendingRequest) return;
        if (!imageData) return;

        var now = Date.now() / 1000;
        if (now - _lastSceneTime < SCENE_COOLDOWN_S && _lastSceneId) {
            return;
        }

        _pendingRequest = true;

        var token = localStorage.getItem('campus_rpg_token');
        var apiBase = window.CAMPUS_RPG_API_BASE || '';

        fetch(apiBase + '/api/ar/vision', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ image: imageData })
        })
        .then(function (resp) { return resp.json(); })
        .then(function (data) {
            _pendingRequest = false;
            if (data.success && data.result) {
                handleRecognitionResult(data.result);
            }
        })
        .catch(function (err) {
            _pendingRequest = false;
            console.warn('[VisionAR] 识别失败:', err);
        });
    }

    // ============================================
    // 处理识别结果
    // ============================================
    function handleRecognitionResult(result) {
        var sceneId = result.scene_id || 'unknown';
        var sceneName = result.scene_name || '未知区域';
        var narrative = result.narrative || '';

        if (sceneId === _lastSceneId) return;

        console.log('[VisionAR] 识别到场景:', sceneName, sceneId);

        _lastSceneId = sceneId;
        _lastSceneTime = Date.now() / 1000;

        var sceneConfig = SCENE_CONFIG[sceneId] || SCENE_CONFIG['unknown'];

        document.dispatchEvent(new CustomEvent('vision-scene-detected', {
            detail: {
                sceneId: sceneId,
                sceneName: sceneName,
                narrative: narrative,
                config: sceneConfig,
                confidence: result.confidence,
                easterEggHints: result.easter_egg_hints || [],
                timeBonus: result.time_bonus || ''
            }
        }));
    }

    // ============================================
    // 启动识别循环
    // ============================================
    function start() {
        if (_isRunning) return;
        _isRunning = true;
        console.log('[VisionAR] 场景识别已启动');

        function scanLoop() {
            if (!_isRunning) return;
            var frame = captureFrame();
            if (frame) recognizeScene(frame);
            _timer = setTimeout(scanLoop, SCAN_INTERVAL_MS);
        }

        scanLoop();
    }

    // ============================================
    // 停止识别
    // ============================================
    function stop() {
        _isRunning = false;
        if (_timer) { clearTimeout(_timer); _timer = null; }
        _lastSceneId = null;
        console.log('[VisionAR] 场景识别已停止');
    }

    // ============================================
    // 重置冷却（允许重新触发）
    // ============================================
    function resetCooldown() {
        _lastSceneTime = 0;
    }

    return {
        init: init,
        start: start,
        stop: stop,
        resetCooldown: resetCooldown,
        SCENE_CONFIG: SCENE_CONFIG
    };
})();

window.VisionAR = VisionAR;
