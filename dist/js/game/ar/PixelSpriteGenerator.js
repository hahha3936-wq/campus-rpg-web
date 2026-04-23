/**
 * 校园RPG - 像素精灵生成器
 * 使用 Canvas 2D API 在运行时生成像素精灵，不依赖外部美术资源
 * 严格遵循 DB32 调色板（Lospec标准），16x16 / 32x32 像素规格
 * @version 1.0.0
 */

var PixelSpriteGenerator = (function () {
    'use strict';

    // ============================================
    // DB32 调色板（Lospec标准）
    // ============================================
    var PALETTE = {
        BLACK:        '#000000',
        DARK_BLUE:    '#1D2B53',
        DARK_PURPLE:  '#7E2553',
        DARK_GREEN:   '#008751',
        BROWN:        '#AB5236',
        DARK_GRAY:    '#5F574F',
        LIGHT_GRAY:   '#C2C3C7',
        WHITE:        '#FFF1E8',
        RED:          '#FF004D',
        ORANGE:       '#FFA300',
        YELLOW:       '#FFEC27',
        GREEN:        '#00E436',
        CYAN:         '#29ADFF',
        BLUE:         '#83769C',
        LIGHT_PURPLE: '#FF77A8',
        PEACH:        '#FFCCAA'
    };

    // ============================================
    // 像素精灵数据定义（每像素 [x, y, colorKey]）
    // 基于16x16画布，使用简化的像素表示法
    // ============================================

    /**
     * 校长NPC精灵 - marker_001
     * 穿着礼服的校长形象
     */
    var SPRITE_PRINCIPAL = [
        // 帽子
        [7,1,DARK_BLUE],[8,1,DARK_BLUE],[7,2,DARK_BLUE],[8,2,DARK_BLUE],[9,2,DARK_BLUE],
        // 头部
        [7,3,PEACH],[8,3,PEACH],[9,3,PEACH],[6,4,PEACH],[7,4,PEACH],[8,4,DARK_GRAY],[9,4,PEACH],[10,4,PEACH],
        [6,5,PEACH],[7,5,PEACH],[8,5,DARK_GRAY],[9,5,PEACH],[10,5,PEACH],[6,6,PEACH],[7,6,PEACH],[8,6,DARK_GRAY],[9,6,PEACH],[10,6,PEACH],
        [7,7,RED],[8,7,RED],[9,7,RED],
        // 身体（礼服）
        [6,8,DARK_BLUE],[7,8,DARK_BLUE],[8,8,WHITE],[9,8,DARK_BLUE],[10,8,DARK_BLUE],
        [6,9,DARK_BLUE],[7,9,DARK_BLUE],[8,9,WHITE],[9,9,DARK_BLUE],[10,9,DARK_BLUE],
        [6,10,DARK_BLUE],[7,10,DARK_BLUE],[8,10,WHITE],[9,10,DARK_BLUE],[10,10,DARK_BLUE],
        [5,11,DARK_BLUE],[6,11,DARK_BLUE],[7,11,DARK_BLUE],[8,11,WHITE],[9,11,DARK_BLUE],[10,11,DARK_BLUE],[11,11,DARK_BLUE],
        [5,12,DARK_BLUE],[6,12,DARK_BLUE],[7,12,DARK_BLUE],[8,12,WHITE],[9,12,DARK_BLUE],[10,12,DARK_BLUE],[11,12,DARK_BLUE],
        [6,13,DARK_GRAY],[7,13,DARK_GRAY],[8,13,DARK_GRAY],[9,13,DARK_GRAY],[10,13,DARK_GRAY],
        [6,14,DARK_GRAY],[7,14,DARK_GRAY],[8,14,DARK_GRAY],[9,14,DARK_GRAY],[10,14,DARK_GRAY]
    ];

    /**
     * 教授NPC精灵 - marker_002
     * 手持书本的教授形象
     */
    var SPRITE_PROFESSOR = [
        // 头部
        [7,2,PEACH],[8,2,PEACH],[9,2,PEACH],
        [6,3,PEACH],[7,3,PEACH],[8,3,DARK_GRAY],[9,3,PEACH],[10,3,PEACH],
        [6,4,PEACH],[7,4,PEACH],[8,4,DARK_GRAY],[9,4,PEACH],[10,4,PEACH],
        [7,5,RED],[8,5,RED],[9,5,RED],
        // 身体
        [6,6,BLUE],[7,6,BLUE],[8,6,BLUE],[9,6,BLUE],[10,6,BLUE],
        [6,7,BLUE],[7,7,BLUE],[8,7,WHITE],[9,7,BLUE],[10,7,BLUE],
        [6,8,BLUE],[7,8,BLUE],[8,8,WHITE],[9,8,BLUE],[10,8,BLUE],
        [6,9,BLUE],[7,9,BLUE],[8,9,WHITE],[9,9,BLUE],[10,9,BLUE],
        [6,10,DARK_GRAY],[7,10,DARK_GRAY],[8,10,DARK_GRAY],[9,10,DARK_GRAY],[10,10,DARK_GRAY],
        [6,11,DARK_GRAY],[7,11,DARK_GRAY],[8,11,DARK_GRAY],[9,11,DARK_GRAY],[10,11,DARK_GRAY],
        [6,12,DARK_GRAY],[7,12,DARK_GRAY],[8,12,DARK_GRAY],[9,12,DARK_GRAY],[10,12,DARK_GRAY],
        [6,13,DARK_GRAY],[7,13,DARK_GRAY],[8,13,DARK_GRAY],[9,13,DARK_GRAY],[10,13,DARK_GRAY]
    ];

    /**
     * 知识宝箱精灵 - marker_003 / marker_005
     * 带锁的像素宝箱
     */
    var SPRITE_CHEST = [
        [4,4,DARK_GRAY],[5,4,DARK_GRAY],[6,4,DARK_GRAY],[7,4,DARK_GRAY],[8,4,DARK_GRAY],[9,4,DARK_GRAY],[10,4,DARK_GRAY],[11,4,DARK_GRAY],
        [3,5,BROWN],[4,5,BROWN],[5,5,YELLOW],[6,5,YELLOW],[7,5,YELLOW],[8,5,YELLOW],[9,5,YELLOW],[10,5,YELLOW],[11,5,BROWN],[12,5,BROWN],
        [3,6,BROWN],[4,6,BROWN],[5,6,YELLOW],[6,6,ORANGE],[7,6,ORANGE],[8,6,ORANGE],[9,6,ORANGE],[10,6,YELLOW],[11,6,BROWN],[12,6,BROWN],
        [3,7,BROWN],[4,7,BROWN],[5,7,YELLOW],[6,7,ORANGE],[7,7,YELLOW],[8,7,YELLOW],[9,7,ORANGE],[10,7,YELLOW],[11,7,BROWN],[12,7,BROWN],
        [3,8,BROWN],[4,8,BROWN],[5,8,BROWN],[6,8,BROWN],[7,8,BROWN],[8,8,BROWN],[9,8,BROWN],[10,8,BROWN],[11,8,BROWN],[12,8,BROWN],
        [3,9,BROWN],[4,9,BROWN],[5,9,BROWN],[6,9,DARK_GRAY],[7,9,DARK_GRAY],[8,9,DARK_GRAY],[9,9,DARK_GRAY],[10,9,BROWN],[11,9,BROWN],[12,9,BROWN],
        [4,10,BROWN],[5,10,BROWN],[6,10,BROWN],[7,10,BROWN],[8,10,BROWN],[9,10,BROWN],[10,10,BROWN],[11,10,BROWN],
        [4,11,DARK_GRAY],[5,11,DARK_GRAY],[6,11,DARK_GRAY],[7,11,DARK_GRAY],[8,11,DARK_GRAY],[9,11,DARK_GRAY],[10,11,DARK_GRAY],[11,11,DARK_GRAY]
    ];

    /**
     * 食物精灵 - marker_004
     * 汉堡 + 薯条
     */
    var SPRITE_FOOD = [
        [5,3,ORANGE],[6,3,ORANGE],[7,3,ORANGE],[8,3,ORANGE],[9,3,ORANGE],[10,3,ORANGE],
        [4,4,YELLOW],[5,4,ORANGE],[6,4,ORANGE],[7,4,ORANGE],[8,4,ORANGE],[9,4,ORANGE],[10,4,ORANGE],[11,4,YELLOW],
        [4,5,BROWN],[5,5,ORANGE],[6,5,ORANGE],[7,5,ORANGE],[8,5,ORANGE],[9,5,ORANGE],[10,5,ORANGE],[11,5,BROWN],
        [4,6,YELLOW],[5,6,ORANGE],[6,6,ORANGE],[7,6,ORANGE],[8,6,ORANGE],[9,6,ORANGE],[10,6,ORANGE],[11,6,YELLOW],
        [5,7,YELLOW],[6,7,YELLOW],[7,7,YELLOW],[8,7,YELLOW],[9,7,YELLOW],[10,7,YELLOW],
        [6,8,DARK_GRAY],[7,8,DARK_GRAY],[8,8,DARK_GRAY],[9,8,DARK_GRAY],
        [5,9,DARK_GRAY],[6,9,DARK_GRAY],[7,9,DARK_GRAY],[8,9,DARK_GRAY],[9,9,DARK_GRAY],[10,9,DARK_GRAY],
        [5,10,DARK_GRAY],[6,10,DARK_GRAY],[7,10,DARK_GRAY],[8,10,DARK_GRAY],[9,10,DARK_GRAY],[10,10,DARK_GRAY],
        [5,11,DARK_GRAY],[6,11,DARK_GRAY],[7,11,DARK_GRAY],[8,11,DARK_GRAY],[9,11,DARK_GRAY],[10,11,DARK_GRAY]
    ];

    /**
     * 星星特效精灵（通用）
     * 用于奖励解锁动画
     */
    var SPRITE_STAR = [
        [7,1,YELLOW],[8,1,YELLOW],
        [6,2,YELLOW],[7,2,ORANGE],[8,2,ORANGE],[9,2,YELLOW],
        [5,3,YELLOW],[6,3,ORANGE],[7,3,YELLOW],[8,3,YELLOW],[9,3,ORANGE],[10,3,YELLOW],
        [4,4,ORANGE],[5,4,ORANGE],[6,4,YELLOW],[7,4,YELLOW],[8,4,YELLOW],[9,4,YELLOW],[10,4,ORANGE],[11,4,ORANGE],
        [4,5,ORANGE],[5,5,YELLOW],[6,5,YELLOW],[7,5,YELLOW],[8,5,YELLOW],[9,5,YELLOW],[10,5,YELLOW],[11,5,ORANGE],
        [5,6,ORANGE],[6,6,YELLOW],[7,6,YELLOW],[8,6,YELLOW],[9,6,YELLOW],[10,6,ORANGE],
        [6,7,ORANGE],[7,7,YELLOW],[8,7,YELLOW],[9,7,ORANGE],
        [7,8,ORANGE],[8,8,ORANGE]
    ];

    // ============================================
    // 精灵配置表
    // ============================================
    var SPRITE_CONFIGS = {
        'marker_001': { pixels: SPRITE_PRINCIPAL, label: '校长', w: 16, h: 16 },
        'marker_002': { pixels: SPRITE_PROFESSOR, label: '教授', w: 16, h: 16 },
        'marker_003': { pixels: SPRITE_CHEST, label: '宝箱', w: 16, h: 16 },
        'marker_004': { pixels: SPRITE_FOOD, label: '美食', w: 16, h: 16 },
        'marker_005': { pixels: SPRITE_CHEST, label: '彩蛋宝箱', w: 16, h: 16 }
    };

    // ============================================
    // 生成单个精灵（返回 base64 PNG data URL）
    // ============================================
    function generateSprite(config) {
        var canvas = document.createElement('canvas');
        canvas.width = config.w || 16;
        canvas.height = config.h || 16;
        var ctx = canvas.getContext('2d');

        config.pixels.forEach(function (px) {
            var x = px[0], y = px[1], key = px[2];
            var color = PALETTE[key] || key;
            ctx.fillStyle = color;
            ctx.fillRect(x, y, 1, 1);
        });

        return canvas.toDataURL('image/png');
    }

    // ============================================
    // 生成 GIF 动画帧序列（8FPS）
    // ============================================
    function generateAnimationFrames(spriteData, frameCount, onFrame) {
        var frames = [];
        var canvas = document.createElement('canvas');
        canvas.width = spriteData.w;
        canvas.height = spriteData.h;
        var ctx = canvas.getContext('2d');

        for (var i = 0; i < frameCount; i++) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // 上下浮动动画（bounce/ float）
            var offsetY = Math.sin((i / frameCount) * Math.PI * 2) * 1;

            spriteData.pixels.forEach(function (px) {
                var color = PALETTE[px[2]] || px[2];
                ctx.fillStyle = color;
                ctx.fillRect(px[0], px[1] + offsetY, 1, 1);
            });

            frames.push(canvas.toDataURL('image/png'));
            if (onFrame) onFrame(i, frames[i]);
        }
        return frames;
    }

    // ============================================
    // 公开 API
    // ============================================
    function getSprite(markerId) {
        var config = SPRITE_CONFIGS[markerId];
        if (!config) return null;
        return generateSprite(config);
    }

    function getSpriteConfig(markerId) {
        return SPRITE_CONFIGS[markerId] || null;
    }

    function getAnimationFrames(markerId, frameCount) {
        var config = SPRITE_CONFIGS[markerId];
        if (!config) return [];
        return generateAnimationFrames(config, frameCount || 8);
    }

    function getStarSprite() {
        return generateSprite({ pixels: SPRITE_STAR, w: 16, h: 16 });
    }

    function getAllMarkerIds() {
        return Object.keys(SPRITE_CONFIGS);
    }

    return {
        getSprite: getSprite,
        getSpriteConfig: getSpriteConfig,
        getAnimationFrames: getAnimationFrames,
        getStarSprite: getStarSprite,
        getAllMarkerIds: getAllMarkerIds,
        PALETTE: PALETTE
    };
})();

window.PixelSpriteGenerator = PixelSpriteGenerator;
