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
        [7,1,'#1D2B53'],[8,1,'#1D2B53'],[7,2,'#1D2B53'],[8,2,'#1D2B53'],[9,2,'#1D2B53'],
        // 头部
        [7,3,'#FFCCAA'],[8,3,'#FFCCAA'],[9,3,'#FFCCAA'],[6,4,'#FFCCAA'],[7,4,'#FFCCAA'],[8,4,'#5F574F'],[9,4,'#FFCCAA'],[10,4,'#FFCCAA'],
        [6,5,'#FFCCAA'],[7,5,'#FFCCAA'],[8,5,'#5F574F'],[9,5,'#FFCCAA'],[10,5,'#FFCCAA'],[6,6,'#FFCCAA'],[7,6,'#FFCCAA'],[8,6,'#5F574F'],[9,6,'#FFCCAA'],[10,6,'#FFCCAA'],
        [7,7,'#FF004D'],[8,7,'#FF004D'],[9,7,'#FF004D'],
        // 身体（礼服）
        [6,8,'#1D2B53'],[7,8,'#1D2B53'],[8,8,'#FFF1E8'],[9,8,'#1D2B53'],[10,8,'#1D2B53'],
        [6,9,'#1D2B53'],[7,9,'#1D2B53'],[8,9,'#FFF1E8'],[9,9,'#1D2B53'],[10,9,'#1D2B53'],
        [6,10,'#1D2B53'],[7,10,'#1D2B53'],[8,10,'#FFF1E8'],[9,10,'#1D2B53'],[10,10,'#1D2B53'],
        [5,11,'#1D2B53'],[6,11,'#1D2B53'],[7,11,'#1D2B53'],[8,11,'#FFF1E8'],[9,11,'#1D2B53'],[10,11,'#1D2B53'],[11,11,'#1D2B53'],
        [5,12,'#1D2B53'],[6,12,'#1D2B53'],[7,12,'#1D2B53'],[8,12,'#FFF1E8'],[9,12,'#1D2B53'],[10,12,'#1D2B53'],[11,12,'#1D2B53'],
        [6,13,'#5F574F'],[7,13,'#5F574F'],[8,13,'#5F574F'],[9,13,'#5F574F'],[10,13,'#5F574F'],
        [6,14,'#5F574F'],[7,14,'#5F574F'],[8,14,'#5F574F'],[9,14,'#5F574F'],[10,14,'#5F574F']
    ];

    /**
     * 教授NPC精灵 - marker_002
     * 手持书本的教授形象
     */
    var SPRITE_PROFESSOR = [
        // 头部
        [7,2,'#FFCCAA'],[8,2,'#FFCCAA'],[9,2,'#FFCCAA'],
        [6,3,'#FFCCAA'],[7,3,'#FFCCAA'],[8,3,'#5F574F'],[9,3,'#FFCCAA'],[10,3,'#FFCCAA'],
        [6,4,'#FFCCAA'],[7,4,'#FFCCAA'],[8,4,'#5F574F'],[9,4,'#FFCCAA'],[10,4,'#FFCCAA'],
        [7,5,'#FF004D'],[8,5,'#FF004D'],[9,5,'#FF004D'],
        // 身体
        [6,6,'#83769C'],[7,6,'#83769C'],[8,6,'#83769C'],[9,6,'#83769C'],[10,6,'#83769C'],
        [6,7,'#83769C'],[7,7,'#83769C'],[8,7,'#FFF1E8'],[9,7,'#83769C'],[10,7,'#83769C'],
        [6,8,'#83769C'],[7,8,'#83769C'],[8,8,'#FFF1E8'],[9,8,'#83769C'],[10,8,'#83769C'],
        [6,9,'#83769C'],[7,9,'#83769C'],[8,9,'#FFF1E8'],[9,9,'#83769C'],[10,9,'#83769C'],
        [6,10,'#5F574F'],[7,10,'#5F574F'],[8,10,'#5F574F'],[9,10,'#5F574F'],[10,10,'#5F574F'],
        [6,11,'#5F574F'],[7,11,'#5F574F'],[8,11,'#5F574F'],[9,11,'#5F574F'],[10,11,'#5F574F'],
        [6,12,'#5F574F'],[7,12,'#5F574F'],[8,12,'#5F574F'],[9,12,'#5F574F'],[10,12,'#5F574F'],
        [6,13,'#5F574F'],[7,13,'#5F574F'],[8,13,'#5F574F'],[9,13,'#5F574F'],[10,13,'#5F574F']
    ];

    /**
     * 知识宝箱精灵 - marker_003 / marker_005
     * 带锁的像素宝箱
     */
    var SPRITE_CHEST = [
        [4,4,'#5F574F'],[5,4,'#5F574F'],[6,4,'#5F574F'],[7,4,'#5F574F'],[8,4,'#5F574F'],[9,4,'#5F574F'],[10,4,'#5F574F'],[11,4,'#5F574F'],
        [3,5,'#AB5236'],[4,5,'#AB5236'],[5,5,'#FFEC27'],[6,5,'#FFEC27'],[7,5,'#FFEC27'],[8,5,'#FFEC27'],[9,5,'#FFEC27'],[10,5,'#FFEC27'],[11,5,'#AB5236'],[12,5,'#AB5236'],
        [3,6,'#AB5236'],[4,6,'#AB5236'],[5,6,'#FFEC27'],[6,6,'#FFA300'],[7,6,'#FFA300'],[8,6,'#FFA300'],[9,6,'#FFA300'],[10,6,'#FFEC27'],[11,6,'#AB5236'],[12,6,'#AB5236'],
        [3,7,'#AB5236'],[4,7,'#AB5236'],[5,7,'#FFEC27'],[6,7,'#FFA300'],[7,7,'#FFEC27'],[8,7,'#FFEC27'],[9,7,'#FFA300'],[10,7,'#FFEC27'],[11,7,'#AB5236'],[12,7,'#AB5236'],
        [3,8,'#AB5236'],[4,8,'#AB5236'],[5,8,'#AB5236'],[6,8,'#AB5236'],[7,8,'#AB5236'],[8,8,'#AB5236'],[9,8,'#AB5236'],[10,8,'#AB5236'],[11,8,'#AB5236'],[12,8,'#AB5236'],
        [3,9,'#AB5236'],[4,9,'#AB5236'],[5,9,'#AB5236'],[6,9,'#5F574F'],[7,9,'#5F574F'],[8,9,'#5F574F'],[9,9,'#5F574F'],[10,9,'#AB5236'],[11,9,'#AB5236'],[12,9,'#AB5236'],
        [4,10,'#AB5236'],[5,10,'#AB5236'],[6,10,'#AB5236'],[7,10,'#AB5236'],[8,10,'#AB5236'],[9,10,'#AB5236'],[10,10,'#AB5236'],[11,10,'#AB5236'],
        [4,11,'#5F574F'],[5,11,'#5F574F'],[6,11,'#5F574F'],[7,11,'#5F574F'],[8,11,'#5F574F'],[9,11,'#5F574F'],[10,11,'#5F574F'],[11,11,'#5F574F']
    ];

    /**
     * 食物精灵 - marker_004
     * 汉堡 + 薯条
     */
    var SPRITE_FOOD = [
        [5,3,'#FFA300'],[6,3,'#FFA300'],[7,3,'#FFA300'],[8,3,'#FFA300'],[9,3,'#FFA300'],[10,3,'#FFA300'],
        [4,4,'#FFEC27'],[5,4,'#FFA300'],[6,4,'#FFA300'],[7,4,'#FFA300'],[8,4,'#FFA300'],[9,4,'#FFA300'],[10,4,'#FFA300'],[11,4,'#FFEC27'],
        [4,5,'#AB5236'],[5,5,'#FFA300'],[6,5,'#FFA300'],[7,5,'#FFA300'],[8,5,'#FFA300'],[9,5,'#FFA300'],[10,5,'#FFA300'],[11,5,'#AB5236'],
        [4,6,'#FFEC27'],[5,6,'#FFA300'],[6,6,'#FFA300'],[7,6,'#FFA300'],[8,6,'#FFA300'],[9,6,'#FFA300'],[10,6,'#FFA300'],[11,6,'#FFEC27'],
        [5,7,'#FFEC27'],[6,7,'#FFEC27'],[7,7,'#FFEC27'],[8,7,'#FFEC27'],[9,7,'#FFEC27'],[10,7,'#FFEC27'],
        [6,8,'#5F574F'],[7,8,'#5F574F'],[8,8,'#5F574F'],[9,8,'#5F574F'],
        [5,9,'#5F574F'],[6,9,'#5F574F'],[7,9,'#5F574F'],[8,9,'#5F574F'],[9,9,'#5F574F'],[10,9,'#5F574F'],
        [5,10,'#5F574F'],[6,10,'#5F574F'],[7,10,'#5F574F'],[8,10,'#5F574F'],[9,10,'#5F574F'],[10,10,'#5F574F'],
        [5,11,'#5F574F'],[6,11,'#5F574F'],[7,11,'#5F574F'],[8,11,'#5F574F'],[9,11,'#5F574F'],[10,11,'#5F574F']
    ];

    /**
     * 星星特效精灵（通用）
     * 用于奖励解锁动画
     */
    var SPRITE_STAR = [
        [7,1,'#FFEC27'],[8,1,'#FFEC27'],
        [6,2,'#FFEC27'],[7,2,'#FFA300'],[8,2,'#FFA300'],[9,2,'#FFEC27'],
        [5,3,'#FFEC27'],[6,3,'#FFA300'],[7,3,'#FFEC27'],[8,3,'#FFEC27'],[9,3,'#FFA300'],[10,3,'#FFEC27'],
        [4,4,'#FFA300'],[5,4,'#FFA300'],[6,4,'#FFEC27'],[7,4,'#FFEC27'],[8,4,'#FFEC27'],[9,4,'#FFEC27'],[10,4,'#FFA300'],[11,4,'#FFA300'],
        [4,5,'#FFA300'],[5,5,'#FFEC27'],[6,5,'#FFEC27'],[7,5,'#FFEC27'],[8,5,'#FFEC27'],[9,5,'#FFEC27'],[10,5,'#FFEC27'],[11,5,'#FFA300'],
        [5,6,'#FFA300'],[6,6,'#FFEC27'],[7,6,'#FFEC27'],[8,6,'#FFEC27'],[9,6,'#FFEC27'],[10,6,'#FFA300'],
        [6,7,'#FFA300'],[7,7,'#FFEC27'],[8,7,'#FFEC27'],[9,7,'#FFA300'],
        [7,8,'#FFA300'],[8,8,'#FFA300']
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
