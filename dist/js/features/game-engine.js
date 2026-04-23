/**
 * 校园农场 - 像素风游戏引擎 v5.0
 * 基于Canvas 2D实现RPG游戏，16x16像素规格，DB32调色板
 * 地图数据从 data/campus_grid.json 动态加载，支持80x60格大地图
 */

const GameEngine = (function() {
    'use strict';

    const _geApi = (p) => (typeof window.apiUrl === 'function' ? window.apiUrl(p) : p);

    // ============ DB32 调色板（Lospec标准） ============
    const PALETTE = {
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
        PEACH:        '#FFCCAA',
        GRASS_DARK:   '#257179',
        GRASS_LIGHT:  '#38B764',
        GRASS_ACCENT: '#6ABE30',
        GRASS_BRIGHT: '#A7F070',
        PATH_DARK:    '#A8A097',
        PATH_LIGHT:   '#C8BEB8',
        PATH_STONE:   '#9DA59A',
        BUILDING_WALL:'#5D275D',
        BUILDING_DARK:'#3D173D',
        BUILDING_WIN: '#FFF8DC',
        BUILDING_WIN_DARK: '#2A1A2E',
        WATER_LIGHT:  '#73EFF7',
        WATER_DARK:   '#3BB3D7',
        TRACK_RED:    '#F97316',
        TRACK_ORANGE: '#EA7700',
        GATE_RED:     '#EF4444',
        GATE_DARK:    '#B91C1C',
        PLAZA_STONE:  '#FBBF24',
        PLAZA_LIGHT:  '#FDE68A',
        DOOR_BROWN:   '#6B4423',
        DOOR_LIGHT:   '#8B5A2B',
        TREE_TRUNK:   '#6B4423',
        TREE_DARK:    '#1A4D2E',
        TREE_LIGHT:   '#50C878',
        TREE_ACCENT:  '#228B22',
        SHADOW:       'rgba(0,0,0,0.25)',
        SHADOW_LIGHT: 'rgba(0,0,0,0.12)',
        BASKETBALL:   '#CD7F32',
        FARM_DIRT:    '#8B4513',
        CONCRETE:     '#9E9E9E',
        COBBLE:       '#8D8D8D',
    };

    // ============ 配置 ============
    let TILE = 16;
    let MOVE_SPEED = 2;

    // ============ 状态 ============
    let canvas, ctx;
    let gameState = {
        player: { x: 224, y: 448, dir: 'down', moving: false, frame: 0 },
        npcs: [],
        inventory: [],
        quests: [],
        gold: 50,
        energy: 100,
        level: 1,
        paused: false,
        currentPanel: null,
        currentMap: 'outdoor',
        indoorData: null,
        mapGrid: null,
        gridMeta: {},
        poiGrid: {},
        indoorZones: [],
        decorations: [],
        farmland: [],
        time: 0,
        fireflies: [],
        petals: [],
        grassSway: [],
        dayPeriod: 'day',
        hoverTile: null,
        nearNPC: null,
        nearEntry: null,
        // 缩放相关
        scale: 1,
    };

    // ============ 初始化 ============
    const keys = {};
    let animationId = null;

    function init() {
        canvas = document.getElementById('game-canvas');
        if (!canvas) return;
        ctx = canvas.getContext('2d');

        disableSmoothing();

        loadGridData().then(() => {
            // 根据地图尺寸设置canvas
            applyCanvasSize();
            window.addEventListener('resize', onResize);
            canvas.addEventListener('mousemove', onMouseMove);
            canvas.addEventListener('click', onClick);
            window.addEventListener('keydown', onKeyDown);
            window.addEventListener('keyup', onKeyUp);

            initParticles();
            loadGameData();
            initFarmland();
            renderLoop();
        });
    }

    function disableSmoothing() {
        ctx.imageSmoothingEnabled = false;
        ctx.webkitImageSmoothingEnabled = false;
        ctx.mozImageSmoothingEnabled = false;
        ctx.msImageSmoothingEnabled = false;
    }

    function applyCanvasSize() {
        const mapGrid = gameState.mapGrid;
        if (!mapGrid) return;
        const MAP_W = mapGrid[0].length;
        const MAP_H = mapGrid.length;
        // canvas 等于地图逻辑尺寸
        canvas.width = MAP_W * TILE;
        canvas.height = MAP_H * TILE;
        disableSmoothing();
        recalcScale();
    }

    function recalcScale() {
        const mapGrid = gameState.mapGrid;
        if (!mapGrid) return;
        const MAP_W = mapGrid[0].length * TILE;
        const MAP_H = mapGrid.length * TILE;
        // 计算填充窗口所需的整数倍缩放
        const scaleX = Math.floor(window.innerWidth / MAP_W);
        const scaleY = Math.floor(window.innerHeight / MAP_H);
        gameState.scale = Math.max(1, Math.min(scaleX, scaleY));
        canvas.style.width = (canvas.width * gameState.scale) + 'px';
        canvas.style.height = (canvas.height * gameState.scale) + 'px';
    }

    function onResize() {
        recalcScale();
    }

    // 初始化粒子系统
    function initParticles() {
        for (let i = 0; i < 15; i++) {
            gameState.fireflies.push({
                x: Math.random() * 2000,
                y: Math.random() * 1500,
                phase: Math.random() * Math.PI * 2,
                speed: 0.3 + Math.random() * 0.5,
                size: 1 + Math.random()
            });
        }
        for (let i = 0; i < 8; i++) {
            gameState.petals.push({
                x: Math.random() * 2000,
                y: Math.random() * 1500,
                phase: Math.random() * Math.PI * 2,
                size: 1.5 + Math.random()
            });
        }
        const mapGrid = gameState.mapGrid;
        if (mapGrid) {
            for (let y = 0; y < mapGrid.length; y++) {
                for (let x = 0; x < mapGrid[y].length; x++) {
                    if (mapGrid[y][x] === 0) {
                        gameState.grassSway.push({
                            x: x * TILE + Math.random() * TILE,
                            y: y * TILE + Math.random() * TILE,
                            phase: Math.random() * Math.PI * 2,
                            speed: 0.5 + Math.random() * 1.5
                        });
                    }
                }
            }
        }
    }

    async function loadGridData() {
        try {
            const resp = await fetch('data/campus_grid.json');
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const data = await resp.json();

            gameState.mapGrid = data.tiles || [];
            gameState.gridMeta = data.meta || {};
            gameState.poiGrid = data.poi_to_grid || {};
            gameState.indoorZones = data.indoor_zones || [];
            gameState.decorations = data.decorations || [];

            const ts = Number(gameState.gridMeta.tile_size);
            if (Number.isFinite(ts) && ts >= 8 && ts <= 32) {
                TILE = ts;
                MOVE_SPEED = Math.max(2, Math.round(TILE / 5));
            }

            const spawn = data.spawnPoints?.player;
            if (spawn) {
                gameState.player.x = spawn.tileX * TILE;
                gameState.player.y = spawn.tileY * TILE;
            }

            await loadNPCs();
            console.info('[GameEngine] 地图加载成功:', data.meta);
        } catch (err) {
            console.warn('[GameEngine] 加载 campus_grid.json 失败:', err.message);
            gameState.mapGrid = null;
        }
    }

    async function loadNPCs() {
        try {
            const resp = await fetch('data/campus_pois.json');
            if (!resp.ok) return;
            const data = await resp.json();
            const npcs = [];
            for (const poi of (data.pois || [])) {
                const poiGrid = gameState.poiGrid[poi.id];
                if (!poiGrid || !poi.npcs?.length) continue;
                for (const npcId of poi.npcs) {
                    npcs.push({
                        id: npcId,
                        name: poi.npc_names?.[npcId] || (npcId === 'naruto' ? '鸣人老师' : '佐助助教'),
                        icon: poi.npc_icons?.[npcId] || (npcId === 'naruto' ? '🍥' : '👤'),
                        x: poiGrid.tileX * TILE + TILE,
                        y: poiGrid.tileY * TILE + TILE,
                        dialogues: npcId === 'naruto'
                            ? ['今天的任务加油哦！', '相信自己，你可以的！', '让我们一起变强吧！']
                            : ['别浪费时间了...', '高效推进才是强大。', '别让我失望。']
                    });
                }
            }
            if (npcs.length > 0) {
                gameState.npcs = npcs;
            }
        } catch {}
    }

    function initFarmland() {
        const farmland = [];
        const mapGrid = gameState.mapGrid;
        if (!mapGrid) return;
        for (let y = 0; y < mapGrid.length; y++) {
            for (let x = 0; x < mapGrid[y].length; x++) {
                if (mapGrid[y][x] === 9 || (mapGrid[y][x] === 0 || mapGrid[y][x] === 7)) {
                    let nearBuilding = false;
                    for (let dy = -3; dy <= 3; dy++) {
                        for (let dx = -3; dx <= 3; dx++) {
                            const ny = y + dy, nx = x + dx;
                            if (mapGrid[ny]?.[nx] === 2) {
                                nearBuilding = true;
                                break;
                            }
                        }
                        if (nearBuilding) break;
                    }
                    if (nearBuilding && farmland.length < 40) {
                        farmland.push({
                            x: x, y: y,
                            state: 0,
                            crop: null,
                            growth: 0,
                            timer: 0
                        });
                    }
                }
            }
        }
        gameState.farmland = farmland;
    }

    // ============ 数据加载 ============
    async function loadGameData() {
        try {
            const resp = await fetch(_geApi('/api/user'));
            if (resp?.ok) {
                const user = await resp.json();
                gameState.gold = user.role?.gold ?? 50;
                gameState.level = user.role?.level ?? 1;
                gameState.inventory = user.inventory ?? [];
                updateHUD();
            }
        } catch {}
    }

    function updateHUD() {
        const goldEl = document.getElementById('game-gold');
        const energyEl = document.getElementById('game-energy');
        const levelEl = document.getElementById('game-level');
        if (goldEl) goldEl.textContent = gameState.gold;
        if (energyEl) energyEl.textContent = gameState.energy;
        if (levelEl) levelEl.textContent = gameState.level;
        updateLocationDisplay();
    }

    function updateLocationDisplay() {
        const el = document.getElementById('game-location');
        if (!el) return;
        if (gameState.currentMap !== 'outdoor' && gameState.indoorData) {
            el.textContent = '📍 ' + gameState.indoorData.name;
        } else {
            el.textContent = '📍 校园室外';
        }
    }

    // ============ 输入处理 ============
    function onKeyDown(e) {
        keys[e.key.toLowerCase()] = true;
        if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key.toLowerCase())) {
            e.preventDefault();
        }
        if (e.key === 'Escape') {
            if (gameState.paused) resume();
            else toggleMenu();
        }
        if (e.key.toLowerCase() === 'e') {
            tryInteract();
        }
    }

    function onKeyUp(e) {
        keys[e.key.toLowerCase()] = false;
    }

    function onMouseMove(e) {
        const rect = canvas.getBoundingClientRect();
        const scale = gameState.scale;
        const mx = (e.clientX - rect.left) / scale;
        const my = (e.clientY - rect.top) / scale;
        const tileX = Math.floor(mx / TILE);
        const tileY = Math.floor(my / TILE);
        gameState.hoverTile = { x: tileX, y: tileY };
    }

    function onClick(e) {
        if (gameState.hoverTile && gameState.currentMap === 'outdoor') {
            const { x, y } = gameState.hoverTile;
            const farmland = gameState.farmland.find(f => f.x === x && f.y === y);
            if (farmland) {
                interactFarmland(farmland);
            }
        }
    }

    function interactFarmland(farm) {
        if (farm.state === 0) {
            farm.state = 1;
            farm.crop = '知识种子';
            farm.growth = 0;
            showNotification('播种了：' + farm.crop, 'success');
        } else if (farm.state === 3) {
            farm.state = 0;
            farm.crop = null;
            farm.growth = 0;
            gameState.gold += 10;
            updateHUD();
            showNotification('收获了！+10金币', 'success');
        }
    }

    // ============ 游戏循环 ============
    let lastTime = 0;
    function renderLoop(timestamp) {
        if (!lastTime) lastTime = timestamp;
        const delta = timestamp - lastTime;
        lastTime = timestamp;

        if (!gameState.paused) {
            gameState.time += delta;
            update(delta);
        }
        draw();
        animationId = requestAnimationFrame(renderLoop);
    }

    function update(delta) {
        const p = gameState.player;
        let dx = 0, dy = 0;

        if (keys['w'] || keys['arrowup'])    { dy = -MOVE_SPEED; p.dir = 'up'; }
        if (keys['s'] || keys['arrowdown'])  { dy = MOVE_SPEED;  p.dir = 'down'; }
        if (keys['a'] || keys['arrowleft'])  { dx = -MOVE_SPEED; p.dir = 'left'; }
        if (keys['d'] || keys['arrowright']) { dx = MOVE_SPEED;  p.dir = 'right'; }

        p.moving = dx !== 0 || dy !== 0;

        const mapGrid = gameState.mapGrid;
        const MAP_W = mapGrid[0].length;
        const MAP_H = mapGrid.length;

        const newX = p.x + dx;
        const newY = p.y + dy;

        // 相机跟随式边界：玩家移动时坐标可到边界，但相机通过跟随保证全屏铺满
        // 玩家坐标本身不 clamp，让相机跟随到边缘即可
        const camW = canvas.width;
        const camH = canvas.height;
        const camMinX = camW / 2;
        const camMaxX = MAP_W * TILE - camW / 2;
        const camMinY = camH / 2;
        const camMaxY = MAP_H * TILE - camH / 2;

        // 只在玩家靠近边界时跟随，不限制玩家本身坐标
        if (!isBlocked(newX, p.y)) p.x = newX;
        if (!isBlocked(p.x, newY)) p.y = newY;

        if (p.moving) {
            p.frame = (p.frame + 0.12) % 4;
        } else {
            p.frame = 0;
        }

        if (p.moving && Math.random() < 0.002) {
            gameState.energy = Math.max(0, gameState.energy - 1);
            updateHUD();
        }

        updateFarmland(delta);
        updateDayPeriod();
        updateInteractionState();
    }

    function updateFarmland(delta) {
        const farmland = gameState.farmland;
        for (const farm of farmland) {
            if (farm.state === 1 || farm.state === 2) {
                farm.timer += delta;
                if (farm.timer > 5000) {
                    farm.timer = 0;
                    farm.growth++;
                    if (farm.growth >= 3) {
                        farm.state = 3;
                    } else {
                        farm.state = 2;
                    }
                }
            }
        }
    }

    function updateDayPeriod() {
        const hour = (gameState.time / 60000) % 24;
        if (hour >= 5 && hour < 7) gameState.dayPeriod = 'dawn';
        else if (hour >= 7 && hour < 11) gameState.dayPeriod = 'morning';
        else if (hour >= 11 && hour < 14) gameState.dayPeriod = 'noon';
        else if (hour >= 14 && hour < 17) gameState.dayPeriod = 'afternoon';
        else if (hour >= 17 && hour < 20) gameState.dayPeriod = 'dusk';
        else gameState.dayPeriod = 'night';
    }

    function updateInteractionState() {
        const px = gameState.player.x + TILE / 2;
        const py = gameState.player.y + TILE / 2;
        gameState.nearNPC = null;
        for (const npc of gameState.npcs) {
            const dist = Math.hypot(px - npc.x, py - npc.y);
            if (dist < TILE * 2.5) {
                gameState.nearNPC = npc;
                break;
            }
        }
        gameState.nearEntry = null;
        if (gameState.currentMap === 'outdoor') {
            gameState.nearEntry = getNearbyEntry();
        }
    }

    function isBlocked(x, y) {
        const tileX = Math.floor(x / TILE);
        const tileY = Math.floor(y / TILE);
        const mapGrid = gameState.mapGrid;
        const MAP_H = mapGrid.length;
        const MAP_W = mapGrid[0].length;
        // 地图边界检查
        if (tileY < 0 || tileY >= MAP_H) return true;
        if (tileX < 0 || tileX >= MAP_W) return true;
        const tile = mapGrid[tileY]?.[tileX];
        if (tile === undefined) return true;
        // 水体完全阻挡
        if (tile === 3) return true;
        // 门格可通行
        if (tile === 8) return false;
        // 树木完全阻挡（边界用）
        if (tile === 4) return true;
        // 建筑检查周边是否有门
        if (tile === 2) {
            const adjacent = [
                mapGrid[tileY - 1]?.[tileX],
                mapGrid[tileY + 1]?.[tileX],
                mapGrid[tileY]?.[tileX - 1],
                mapGrid[tileY]?.[tileX + 1]
            ];
            return !adjacent.includes(8);
        }
        // 农田可行走
        if (tile === 9) return false;
        // 跑道可行走
        if (tile === 5) return false;
        // 篮球场可行走
        if (tile === 10) return false;
        // 灌木丛可行走
        if (tile === 11) return false;
        return false;
    }

    // ============ 渲染 ============
    function draw() {
        const w = canvas.width, h = canvas.height;

        // 清屏：使用草地深绿色背景，不再露出深蓝色
        ctx.fillStyle = PALETTE.GRASS_DARK;
        ctx.fillRect(0, 0, w, h);

        if (gameState.currentMap !== 'outdoor') {
            drawIndoorMap();
        } else {
            drawOutdoorMap();
        }

        applyDayNightOverlay();
        drawInteractionHint();
        drawFarmlandHighlight();
    }

    /**
     * 室外地图渲染
     * 大地图版本：相机固定在canvas左上角(0,0)，canvas尺寸=地图尺寸
     */
    function drawOutdoorMap() {
        const w = canvas.width, h = canvas.height;
        const mapGrid = gameState.mapGrid;
        const decorations = gameState.decorations || [];
        const MAP_H = mapGrid.length;
        const MAP_W = mapGrid[0].length;

        // 全地图绘制（canvas == map，无相机偏移）
        const startTileX = 0;
        const startTileY = 0;
        const endTileX = MAP_W;
        const endTileY = MAP_H;

        // 第一层：地面瓦片
        for (let ty = startTileY; ty < endTileY && ty < MAP_H; ty++) {
            for (let tx = startTileX; tx < endTileX && tx < MAP_W; tx++) {
                const tileType = mapGrid[ty]?.[tx];
                if (tileType !== undefined) {
                    drawTile(tx, ty, tileType);
                }
            }
        }

        // 第二层：阴影
        drawShadowLayer(startTileX, endTileX, startTileY, endTileY, mapGrid);

        // 第三层：装饰物
        for (const dec of decorations) {
            if (dec.tx >= startTileX && dec.tx < endTileX &&
                dec.ty >= startTileY && dec.ty < endTileY) {
                drawDecoration(dec.tx, dec.ty, dec.type);
            }
        }

        // 第四层：农田
        drawFarmlandLayer();

        // 第五层：动态粒子
        drawParticles();

        // 第六层：NPC
        for (const npc of gameState.npcs) {
            drawCharacter(npc.x, npc.y, npc.icon, '#FFCD75', npc.name);
        }

        // 第七层：玩家
        drawPlayer();
    }

    function drawShadowLayer(startX, endX, startY, endY, mapGrid) {
        ctx.fillStyle = PALETTE.SHADOW;
        for (let ty = startY; ty < endY && ty < mapGrid.length; ty++) {
            const row = mapGrid[ty];
            if (!row) continue;
            for (let tx = startX; tx < endX && tx < row.length; tx++) {
                const tile = row[tx];
                const x = tx * TILE, y = ty * TILE;
                if (tile === 4) {
                    ctx.fillRect(x + TILE * 0.2, y + TILE * 0.7, TILE * 0.6, TILE * 0.2);
                } else if (tile === 2) {
                    ctx.fillRect(x + TILE * 0.1, y + TILE * 0.85, TILE * 0.8, TILE * 0.15);
                }
            }
        }
    }

    function drawFarmlandLayer() {
        for (const farm of gameState.farmland) {
            drawFarmTile(farm.x, farm.y, farm.state, farm.growth);
        }
    }

    function drawFarmTile(tx, ty, state, growth) {
        const x = tx * TILE, y = ty * TILE;
        const seed = tx * 31 + ty * 17;

        ctx.fillStyle = PALETTE.FARM_DIRT;
        ctx.fillRect(x, y, TILE, TILE);

        ctx.fillStyle = PALETTE.DOOR_BROWN;
        ctx.fillRect(x + 1, y + TILE * 0.3, TILE - 2, 1);
        ctx.fillRect(x + 1, y + TILE * 0.6, TILE - 2, 1);

        ctx.fillStyle = PALETTE.DOOR_LIGHT;
        if (seed % 3 === 0) ctx.fillRect(x + 3, y + 5, 2, 2);
        if (seed % 5 === 1) ctx.fillRect(x + 10, y + 3, 2, 2);
        if (seed % 7 === 2) ctx.fillRect(x + 7, y + 11, 2, 2);

        if (state === 1) {
            ctx.fillStyle = PALETTE.GRASS_BRIGHT;
            ctx.fillRect(x + TILE * 0.35, y + TILE * 0.5, 2, TILE * 0.35);
            ctx.fillRect(x + TILE * 0.55, y + TILE * 0.4, 2, TILE * 0.45);
        } else if (state === 2) {
            const green = growth === 1 ? PALETTE.GRASS_LIGHT : PALETTE.GRASS_ACCENT;
            ctx.fillStyle = green;
            ctx.fillRect(x + TILE * 0.25, y + TILE * 0.3, 2, TILE * 0.5);
            ctx.fillRect(x + TILE * 0.5, y + TILE * 0.25, 2, TILE * 0.55);
            ctx.fillRect(x + TILE * 0.7, y + TILE * 0.35, 2, TILE * 0.45);
            ctx.fillStyle = PALETTE.GRASS_BRIGHT;
            ctx.fillRect(x + TILE * 0.25, y + TILE * 0.3, 3, 2);
            ctx.fillRect(x + TILE * 0.5, y + TILE * 0.25, 3, 2);
        } else if (state === 3) {
            ctx.fillStyle = PALETTE.YELLOW;
            ctx.fillRect(x + TILE * 0.25, y + TILE * 0.2, TILE * 0.5, TILE * 0.4);
            ctx.fillStyle = PALETTE.ORANGE;
            ctx.fillRect(x + TILE * 0.3, y + TILE * 0.25, TILE * 0.4, TILE * 0.3);
            ctx.fillStyle = PALETTE.YELLOW;
            ctx.fillRect(x + TILE * 0.35, y + TILE * 0.3, TILE * 0.3, TILE * 0.2);
            const pulse = Math.sin(gameState.time / 300) * 0.3 + 0.7;
            ctx.fillStyle = `rgba(255,236,39,${pulse * 0.3})`;
            ctx.fillRect(x - 2, y - 2, TILE + 4, TILE + 4);
        }

        ctx.strokeStyle = PALETTE.SHADOW_LIGHT;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
    }

    function drawFarmlandHighlight() {
        if (!gameState.hoverTile || gameState.currentMap !== 'outdoor') return;
        const { x, y } = gameState.hoverTile;
        const farm = gameState.farmland.find(f => f.x === x && f.y === y);
        if (farm) {
            ctx.strokeStyle = PALETTE.GRASS_ACCENT;
            ctx.lineWidth = 2;
            ctx.strokeRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2);
        }
    }

    function drawParticles() {
        const isNight = gameState.dayPeriod === 'night' || gameState.dayPeriod === 'dusk';

        if (isNight) {
            for (const ff of gameState.fireflies) {
                const alpha = (Math.sin(gameState.time / 500 + ff.phase) + 1) / 2;
                const glow = Math.sin(gameState.time / 300 + ff.phase * 2) + 1;
                ctx.fillStyle = `rgba(255,236,100,${alpha * 0.15 * glow})`;
                ctx.beginPath();
                ctx.arc(ff.x, ff.y, ff.size * 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = `rgba(255,236,100,${alpha * 0.8})`;
                ctx.beginPath();
                ctx.arc(ff.x, ff.y, ff.size, 0, Math.PI * 2);
                ctx.fill();

                ff.x += Math.sin(gameState.time / 2000 + ff.phase) * ff.speed;
                ff.y += Math.cos(gameState.time / 1500 + ff.phase) * ff.speed * 0.7;
                ff.phase += 0.01;
            }
        }

        const windOffset = Math.sin(gameState.time / 3000) * 2;
        for (const petal of gameState.petals) {
            ctx.fillStyle = `rgba(255,180,200,${0.4 + Math.sin(gameState.time / 800 + petal.phase) * 0.2})`;
            ctx.beginPath();
            ctx.ellipse(
                petal.x + Math.sin(gameState.time / 500 + petal.phase) * 3,
                petal.y + (gameState.time / 30 + petal.phase * 50) % 1600,
                petal.size, petal.size * 0.6, petal.phase, 0, Math.PI * 2
            );
            ctx.fill();
        }
    }

    function applyDayNightOverlay() {
        let overlayColor, overlayAlpha;
        switch (gameState.dayPeriod) {
            case 'dawn': overlayColor = '#FFB347'; overlayAlpha = 0.08; break;
            case 'morning': overlayColor = '#87CEEB'; overlayAlpha = 0.05; break;
            case 'noon': overlayColor = '#FFFFFF'; overlayAlpha = 0.03; break;
            case 'afternoon': overlayColor = '#FFB347'; overlayAlpha = 0.06; break;
            case 'dusk': overlayColor = '#FF6B6B'; overlayAlpha = 0.12; break;
            case 'night': overlayColor = '#1a1a3e'; overlayAlpha = 0.35; break;
            default: return;
        }
        ctx.fillStyle = overlayColor;
        ctx.globalAlpha = overlayAlpha;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
    }

    /**
     * 瓦片渲染 — 全部 14 种类型，支持随机变体
     */
    function drawTile(tx, ty, type) {
        const x = tx * TILE, y = ty * TILE;
        const seed = tx * 31 + ty * 17;
        const time = gameState.time;

        switch (type) {
            case 0:  drawGrassTile(x, y, seed, tx, ty); break;
            case 1:  drawPathTile(x, y, seed, tx, ty); break;
            case 2:  drawBuildingTile(x, y, seed, tx, ty); break;
            case 3:  drawWaterTile(x, y, seed, tx, ty, time); break;
            case 4:  drawTreeTile(x, y, seed, tx, ty); break;
            case 5:  drawTrackTile(x, y, seed, tx, ty); break;
            case 6:  drawGateTile(x, y, seed, tx, ty); break;
            case 7:  drawPlazaTile(x, y, seed, tx, ty); break;
            case 8:  drawDoorTile(x, y, seed, tx, ty); break;
            case 9:  drawFarmSeed(x, y, seed, tx, ty); break;
            case 10: drawBasketballTile(x, y, seed, tx, ty); break;
            case 11: drawBushTile(x, y, seed, tx, ty); break;
            case 12: drawConcreteTile(x, y, seed, tx, ty); break;
            case 13: drawCobbleTile(x, y, seed, tx, ty); break;
            default:
                ctx.fillStyle = PALETTE.BLACK;
                ctx.fillRect(x, y, TILE, TILE);
        }

        ctx.fillStyle = PALETTE.SHADOW_LIGHT;
        ctx.fillRect(x, y + TILE - 1, TILE, 1);
        ctx.fillRect(x + TILE - 1, y, 1, TILE);
    }

    // ============ 瓦片绘制函数（全部含变体） ============

    function drawGrassTile(x, y, seed, tx, ty) {
        ctx.fillStyle = PALETTE.GRASS_DARK;
        ctx.fillRect(x, y, TILE, TILE);

        const variant = seed % 7;
        if (variant === 0) {
            ctx.fillStyle = PALETTE.GRASS_ACCENT;
            ctx.fillRect(x + 3, y + 10, 3, 3);
        }
        if (variant === 1) {
            ctx.fillStyle = PALETTE.GRASS_LIGHT;
            ctx.fillRect(x + 11, y + 4, 2, 2);
        }
        if (variant === 2) {
            ctx.fillStyle = PALETTE.GRASS_BRIGHT;
            ctx.fillRect(x + 7, y + 8, 2, 3);
        }
        if (variant === 3) {
            ctx.fillStyle = PALETTE.GRASS_ACCENT;
            ctx.fillRect(x + 4, y + 6, 2, 2);
        }

        const swayPhase = (seed * 0.5 + gameState.time / 800) % (Math.PI * 2);
        const sway = Math.sin(swayPhase) * 1.5;

        ctx.fillStyle = PALETTE.GRASS_ACCENT;
        if (variant % 2 === 0) {
            ctx.fillRect(x + 6 + sway, y + 11, 2, 5);
            ctx.fillRect(x + 10 + sway * 0.7, y + 9, 2, 6);
        }
        if (variant === 4) {
            ctx.fillRect(x + 13 + sway * 0.5, y + 12, 2, 4);
        }

        if (variant === 5) {
            ctx.fillStyle = PALETTE.PEACH;
            ctx.fillRect(x + 4, y + 4, 3, 3);
            ctx.fillStyle = PALETTE.YELLOW;
            ctx.fillRect(x + 5, y + 5, 1, 1);
        }
        if (variant === 6) {
            ctx.fillStyle = PALETTE.PATH_STONE;
            ctx.fillRect(x + 8, y + 6, 2, 2);
        }
    }

    function drawPathTile(x, y, seed, tx, ty) {
        ctx.fillStyle = PALETTE.PATH_DARK;
        ctx.fillRect(x, y, TILE, TILE);

        ctx.fillStyle = PALETTE.PATH_LIGHT;
        ctx.fillRect(x + 1, y + 1, TILE / 2 - 2, TILE / 2 - 2);
        ctx.fillRect(x + TILE / 2 + 1, y + 1, TILE / 2 - 2, TILE / 2 - 2);
        ctx.fillRect(x + 1, y + TILE / 2 + 1, TILE / 2 - 2, TILE / 2 - 2);
        ctx.fillRect(x + TILE / 2 + 1, y + TILE / 2 + 1, TILE / 2 - 2, TILE / 2 - 2);

        ctx.fillStyle = PALETTE.PATH_STONE;
        ctx.fillRect(x + TILE / 2 - 1, y, 2, TILE);
        ctx.fillRect(x, y + TILE / 2 - 1, TILE, 2);

        // 人字纹变体
        if (seed % 4 === 0 && tx % 3 === 0) {
            ctx.fillStyle = PALETTE.PATH_STONE;
            ctx.fillRect(x + 4, y + 4, 2, 1);
            ctx.fillRect(x + 6, y + 6, 2, 1);
        }

        ctx.fillStyle = PALETTE.SHADOW_LIGHT;
        ctx.fillRect(x, y, TILE, 1);
        ctx.fillRect(x, y, 1, TILE);
    }

    function drawBuildingTile(x, y, seed, tx, ty) {
        ctx.fillStyle = PALETTE.BUILDING_WALL;
        ctx.fillRect(x, y, TILE, TILE);

        ctx.fillStyle = PALETTE.BUILDING_DARK;
        ctx.fillRect(x, y + TILE * 0.33, TILE, 1);
        ctx.fillRect(x, y + TILE * 0.66, TILE, 1);

        if (ty % 2 === 0) {
            ctx.fillRect(x + TILE * 0.5, y + 1, 1, TILE * 0.33 - 1);
        } else {
            ctx.fillRect(x + TILE * 0.25, y + 1, 1, TILE * 0.33 - 1);
            ctx.fillRect(x + TILE * 0.75, y + 1, 1, TILE * 0.33 - 1);
        }

        const windowOn = seed % 3 !== 0;
        ctx.fillStyle = windowOn ? PALETTE.BUILDING_WIN : PALETTE.BUILDING_WIN_DARK;
        if (ty % 2 === 0) {
            ctx.fillRect(x + 3, y + 4, 5, 4);
            ctx.fillRect(x + 9, y + 4, 5, 4);
            ctx.fillRect(x + 3, y + 11, 5, 4);
            ctx.fillRect(x + 9, y + 11, 5, 4);
        } else {
            ctx.fillRect(x + 6, y + 7, 5, 4);
        }

        ctx.strokeStyle = PALETTE.BUILDING_DARK;
        ctx.lineWidth = 0.5;
        if (ty % 2 === 0) {
            ctx.strokeRect(x + 3, y + 4, 5, 4);
            ctx.strokeRect(x + 9, y + 4, 5, 4);
            ctx.strokeRect(x + 3, y + 11, 5, 4);
            ctx.strokeRect(x + 9, y + 11, 5, 4);
        }

        ctx.fillStyle = PALETTE.SHADOW;
        ctx.fillRect(x + 1, y + TILE - 3, TILE - 2, 2);
    }

    function drawWaterTile(x, y, seed, tx, ty, time) {
        ctx.fillStyle = PALETTE.CYAN;
        ctx.fillRect(x, y, TILE, TILE);

        ctx.fillStyle = PALETTE.WATER_DARK;
        ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);

        const wave = Math.sin(time / 600 + tx * 0.8 + ty * 0.6);
        const wave2 = Math.cos(time / 500 + tx * 0.5 + ty * 0.9);

        ctx.fillStyle = PALETTE.WATER_LIGHT;
        ctx.fillRect(x + 3 + wave, y + 5, 6, 1);
        ctx.fillRect(x + 7 + wave2 * 2, y + 10, 5, 1);

        if (seed % 3 === 0) {
            ctx.strokeStyle = `rgba(115,239,247,${0.3 + wave * 0.2})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.arc(x + TILE / 2 + wave * 2, y + TILE / 2 + wave2, 3 + wave, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.fillStyle = 'PALETTE.WHITE';
        ctx.fillRect(x + 2 + wave, y + 3, 3, 1);
    }

    function drawTreeTile(x, y, seed, tx, ty) {
        const sizeVariant = seed % 3;
        const scale = 0.7 + sizeVariant * 0.15;

        ctx.fillStyle = PALETTE.TREE_DARK;
        ctx.fillRect(x, y, TILE, TILE);

        ctx.fillStyle = PALETTE.TREE_TRUNK;
        ctx.fillRect(x + TILE * 0.35, y + TILE * 0.55, TILE * 0.3, TILE * 0.4);

        const cx = x + TILE * 0.5;
        const cy = y + TILE * 0.4 * scale;

        ctx.fillStyle = PALETTE.TREE_DARK;
        ctx.beginPath();
        ctx.arc(cx, cy, TILE * 0.38 * scale, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = PALETTE.TREE_LIGHT;
        ctx.beginPath();
        ctx.arc(cx + 1, cy - TILE * 0.05, TILE * 0.28 * scale, 0, Math.PI * 2);
        ctx.fill();

        if (seed % 3 === 0) {
            ctx.fillStyle = PALETTE.TREE_ACCENT;
            ctx.beginPath();
            ctx.arc(cx - TILE * 0.15, cy + TILE * 0.05, TILE * 0.12 * scale, 0, Math.PI * 2);
            ctx.fill();
        }
        if (seed % 5 === 1) {
            ctx.fillStyle = PALETTE.TREE_ACCENT;
            ctx.beginPath();
            ctx.arc(cx + TILE * 0.1, cy - TILE * 0.1, TILE * 0.1 * scale, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawTrackTile(x, y, seed, tx, ty) {
        ctx.fillStyle = PALETTE.TRACK_RED;
        ctx.fillRect(x, y, TILE, TILE);

        ctx.fillStyle = PALETTE.TRACK_ORANGE;
        if (seed % 2 === 0) {
            ctx.fillRect(x + 2, y + 2, 3, 2);
            ctx.fillRect(x + 10, y + 8, 3, 2);
        }
        if (seed % 3 === 1) {
            ctx.fillRect(x + 7, y + 4, 2, 2);
            ctx.fillRect(x + 4, y + 11, 2, 2);
        }

        ctx.fillStyle = 'PALETTE.WHITE';
        ctx.fillRect(x + 1, y + TILE / 2 - 0.5, TILE - 2, 1);

        if (ty % 2 === 0) {
            ctx.fillStyle = 'PALETTE.WHITE';
            ctx.fillRect(x + 1, y + 1, TILE - 2, 1);
            ctx.fillRect(x + 1, y + TILE - 2, TILE - 2, 1);
        }
    }

    function drawGateTile(x, y, seed, tx, ty) {
        ctx.fillStyle = PALETTE.GATE_RED;
        ctx.fillRect(x, y, TILE, TILE);

        ctx.fillStyle = PALETTE.GATE_DARK;
        ctx.fillRect(x + 1, y + 2, 4, TILE - 4);
        ctx.fillRect(x + TILE - 5, y + 2, 4, TILE - 4);

        ctx.fillStyle = PALETTE.GATE_RED;
        ctx.fillRect(x + 2, y + 2, TILE - 4, 5);

        ctx.fillStyle = PALETTE.DARK_GRAY;
        ctx.fillRect(x + 5, y + 7, TILE - 10, TILE - 9);

        ctx.strokeStyle = PALETTE.GATE_DARK;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 3, y + 3, TILE - 6, TILE - 6);

        ctx.fillStyle = PALETTE.YELLOW;
        ctx.fillRect(x + TILE / 2 - 2, y + 4, 4, 3);
    }

    function drawPlazaTile(x, y, seed, tx, ty) {
        ctx.fillStyle = PALETTE.PLAZA_STONE;
        ctx.fillRect(x, y, TILE, TILE);

        ctx.fillStyle = PALETTE.PLAZA_LIGHT;
        ctx.fillRect(x + 1, y + 1, TILE / 2 - 2, TILE / 2 - 2);
        ctx.fillRect(x + TILE / 2 + 1, y + TILE / 2 + 1, TILE / 2 - 2, TILE / 2 - 2);

        ctx.fillStyle = PALETTE.PATH_STONE;
        ctx.fillRect(x + TILE / 2 - 1, y, 2, TILE);
        ctx.fillRect(x, y + TILE / 2 - 1, TILE, 2);

        ctx.fillStyle = PALETTE.SHADOW_LIGHT;
        ctx.fillRect(x, y + TILE - 1, TILE, 1);
        ctx.fillRect(x + TILE - 1, y, 1, TILE);
    }

    function drawDoorTile(x, y, seed, tx, ty) {
        ctx.fillStyle = PALETTE.DOOR_BROWN;
        ctx.fillRect(x, y, TILE, TILE);

        ctx.fillStyle = PALETTE.DOOR_LIGHT;
        ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);

        ctx.fillStyle = PALETTE.YELLOW;
        ctx.fillRect(x + TILE - 5, y + TILE / 2 - 1, 2, 2);

        ctx.fillStyle = 'PALETTE.DOOR_LIGHT';
        ctx.fillRect(x + 2, y + TILE - 4, TILE - 4, 2);

        ctx.fillStyle = PALETTE.BUILDING_WIN;
        ctx.fillRect(x + TILE / 2 - 3, y + 3, 6, 3);
        ctx.strokeStyle = PALETTE.DOOR_BROWN;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x + TILE / 2 - 3, y + 3, 6, 3);
    }

    function drawFarmSeed(x, y, seed, tx, ty) {
        ctx.fillStyle = PALETTE.FARM_DIRT;
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = PALETTE.DOOR_BROWN;
        ctx.fillRect(x + 1, y + TILE * 0.3, TILE - 2, 1);
        ctx.fillRect(x + 1, y + TILE * 0.6, TILE - 2, 1);
        ctx.fillStyle = PALETTE.SHADOW_LIGHT;
        ctx.fillRect(x, y + TILE - 1, TILE, 1);
    }

    function drawBasketballTile(x, y, seed, tx, ty) {
        ctx.fillStyle = PALETTE.BASKETBALL;
        ctx.fillRect(x, y, TILE, TILE);

        ctx.fillStyle = PALETTE.PATH_STONE;
        if (ty % 4 === 0) {
            ctx.fillRect(x, y + TILE / 2 - 1, TILE, 2);
        }
        if (tx % 4 === 0) {
            ctx.fillRect(x + TILE / 2 - 1, y, 2, TILE);
        }

        ctx.fillStyle = 'PALETTE.WHITE';
        ctx.fillRect(x + 1, y + 1, TILE - 2, 1);
        ctx.fillRect(x + 1, y + TILE - 2, TILE - 2, 1);
    }

    function drawBushTile(x, y, seed, tx, ty) {
        ctx.fillStyle = PALETTE.TREE_DARK;
        ctx.beginPath();
        ctx.arc(x + TILE * 0.3, y + TILE * 0.5, TILE * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + TILE * 0.65, y + TILE * 0.45, TILE * 0.28, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PALETTE.TREE_LIGHT;
        ctx.beginPath();
        ctx.arc(x + TILE * 0.5, y + TILE * 0.4, TILE * 0.22, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawConcreteTile(x, y, seed, tx, ty) {
        ctx.fillStyle = PALETTE.CONCRETE;
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = PALETTE.SHADOW_LIGHT;
        ctx.fillRect(x, y, TILE, 1);
        ctx.fillRect(x, y, 1, TILE);
    }

    function drawCobbleTile(x, y, seed, tx, ty) {
        ctx.fillStyle = PALETTE.COBBLE;
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = PALETTE.DARK_GRAY;
        ctx.fillRect(x + 3, y + 3, 4, 4);
        ctx.fillRect(x + 9, y + 9, 4, 4);
        ctx.fillStyle = PALETTE.SHADOW_LIGHT;
        ctx.fillRect(x, y + TILE - 1, TILE, 1);
        ctx.fillRect(x + TILE - 1, y, 1, TILE);
    }

    // ============ 装饰物绘制 ============

    function drawDecoration(tx, ty, type) {
        const x = tx * TILE, y = ty * TILE;
        const seed = tx * 31 + ty * 17;
        const time = gameState.time;

        switch (type) {
            case 'flower':    drawDecoFlower(x, y, seed); break;
            case 'tree_small': drawDecoTreeSmall(x, y, seed); break;
            case 'lamp':       drawDecoLamp(x, y, seed, time); break;
            case 'fountain':   drawDecoFountain(x, y, time); break;
            case 'bench':      drawDecoBench(x, y, seed); break;
            case 'bridge':     drawDecoBridge(x, y); break;
            case 'bush':       drawDecoBush(x, y, seed); break;
            case 'sign':       drawDecoSign(x, y, seed); break;
            case 'rock':       drawDecoRock(x, y, seed); break;
            case 'mushroom':   drawDecoMushroom(x, y, seed); break;
            default: break;
        }
    }

    function drawDecoFlower(x, y, seed) {
        ctx.fillStyle = PALETTE.GRASS_ACCENT;
        ctx.fillRect(x + TILE / 2 - 0.5, y + TILE * 0.5, 1, TILE * 0.4);
        const colors = ['#FFCCAA', '#FFEC27', '#FF77A8', '#73EFF7'];
        ctx.fillStyle = colors[seed % colors.length];
        ctx.fillRect(x + TILE * 0.25, y + TILE * 0.2, 3, 3);
        ctx.fillRect(x + TILE * 0.5, y + TILE * 0.15, 3, 3);
        ctx.fillStyle = PALETTE.YELLOW;
        ctx.fillRect(x + TILE * 0.35, y + TILE * 0.25, 1, 1);
    }

    function drawDecoTreeSmall(x, y, seed) {
        ctx.fillStyle = PALETTE.TREE_TRUNK;
        ctx.fillRect(x + TILE * 0.35, y + TILE * 0.55, TILE * 0.3, TILE * 0.35);
        ctx.fillStyle = PALETTE.TREE_DARK;
        ctx.beginPath();
        ctx.arc(x + TILE * 0.5, y + TILE * 0.4, TILE * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PALETTE.TREE_LIGHT;
        ctx.beginPath();
        ctx.arc(x + TILE * 0.5 + 1, y + TILE * 0.35, TILE * 0.22, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawDecoLamp(x, y, seed, time) {
        const isNight = gameState.dayPeriod === 'night' || gameState.dayPeriod === 'dusk';
        ctx.fillStyle = PALETTE.DARK_GRAY;
        ctx.fillRect(x + TILE * 0.4, y + TILE * 0.3, TILE * 0.2, TILE * 0.6);
        ctx.fillStyle = isNight ? PALETTE.YELLOW : PALETTE.LIGHT_GRAY;
        ctx.fillRect(x + TILE * 0.3, y + TILE * 0.2, TILE * 0.4, TILE * 0.2);
        if (isNight) {
            const pulse = (Math.sin(time / 1000 + seed) + 1) / 2 * 0.3 + 0.1;
            ctx.fillStyle = `rgba(255,230,100,${pulse})`;
            ctx.beginPath();
            ctx.arc(x + TILE * 0.5, y + TILE * 0.3, TILE * 0.8, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawDecoFountain(x, y, time) {
        ctx.fillStyle = PALETTE.CYAN;
        ctx.fillRect(x + TILE * 0.1, y + TILE * 0.5, TILE * 0.8, TILE * 0.4);
        ctx.fillStyle = PALETTE.WATER_DARK;
        ctx.fillRect(x + TILE * 0.15, y + TILE * 0.55, TILE * 0.7, TILE * 0.3);
        const wave = Math.sin(time / 400) * 1;
        ctx.fillStyle = PALETTE.WATER_LIGHT;
        ctx.fillRect(x + TILE * 0.45, y + TILE * 0.2 + wave, TILE * 0.1, TILE * 0.35);
        ctx.fillRect(x + TILE * 0.3 + wave, y + TILE * 0.3, TILE * 0.15, TILE * 0.05);
        ctx.fillRect(x + TILE * 0.55 + wave, y + TILE * 0.3, TILE * 0.15, TILE * 0.05);
    }

    function drawDecoBench(x, y, seed) {
        ctx.fillStyle = PALETTE.DOOR_BROWN;
        ctx.fillRect(x + TILE * 0.1, y + TILE * 0.35, TILE * 0.8, TILE * 0.2);
        ctx.fillStyle = PALETTE.DOOR_LIGHT;
        ctx.fillRect(x + TILE * 0.1, y + TILE * 0.15, TILE * 0.8, TILE * 0.15);
        ctx.fillStyle = PALETTE.DARK_GRAY;
        ctx.fillRect(x + TILE * 0.15, y + TILE * 0.55, TILE * 0.1, TILE * 0.2);
        ctx.fillRect(x + TILE * 0.75, y + TILE * 0.55, TILE * 0.1, TILE * 0.2);
    }

    function drawDecoBridge(x, y) {
        ctx.fillStyle = PALETTE.PATH_STONE;
        ctx.fillRect(x + TILE * 0.05, y + TILE * 0.3, TILE * 0.9, TILE * 0.4);
        ctx.fillStyle = PALETTE.PATH_DARK;
        for (let i = 0; i < 4; i++) {
            ctx.fillRect(x + TILE * 0.1 + i * TILE * 0.2, y + TILE * 0.3, 1, TILE * 0.4);
        }
        ctx.fillStyle = PALETTE.DOOR_BROWN;
        ctx.fillRect(x + TILE * 0.05, y + TILE * 0.2, TILE * 0.9, TILE * 0.1);
        ctx.fillRect(x + TILE * 0.1, y + TILE * 0.1, TILE * 0.1, TILE * 0.2);
        ctx.fillRect(x + TILE * 0.8, y + TILE * 0.1, TILE * 0.1, TILE * 0.2);
    }

    function drawDecoBush(x, y, seed) {
        ctx.fillStyle = PALETTE.TREE_DARK;
        ctx.beginPath();
        ctx.arc(x + TILE * 0.3, y + TILE * 0.5, TILE * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + TILE * 0.65, y + TILE * 0.45, TILE * 0.28, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PALETTE.TREE_LIGHT;
        ctx.beginPath();
        ctx.arc(x + TILE * 0.5, y + TILE * 0.4, TILE * 0.22, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawDecoSign(x, y, seed) {
        ctx.fillStyle = PALETTE.DOOR_BROWN;
        ctx.fillRect(x + TILE * 0.45, y + TILE * 0.3, TILE * 0.1, TILE * 0.65);
        ctx.fillStyle = PALETTE.PLAZA_STONE;
        ctx.fillRect(x + TILE * 0.2, y + TILE * 0.1, TILE * 0.6, TILE * 0.3);
        ctx.strokeStyle = PALETTE.DOOR_BROWN;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + TILE * 0.2, y + TILE * 0.1, TILE * 0.6, TILE * 0.3);
    }

    function drawDecoRock(x, y, seed) {
        ctx.fillStyle = PALETTE.PATH_STONE;
        ctx.fillRect(x + TILE * 0.2, y + TILE * 0.4, TILE * 0.5, TILE * 0.4);
        ctx.fillStyle = PALETTE.PATH_LIGHT;
        ctx.fillRect(x + TILE * 0.25, y + TILE * 0.35, TILE * 0.4, TILE * 0.15);
        ctx.fillStyle = PALETTE.SHADOW_LIGHT;
        ctx.fillRect(x + TILE * 0.2, y + TILE * 0.7, TILE * 0.5, 1);
    }

    function drawDecoMushroom(x, y, seed) {
        ctx.fillStyle = PALETTE.LIGHT_GRAY;
        ctx.fillRect(x + TILE * 0.35, y + TILE * 0.5, TILE * 0.3, TILE * 0.3);
        ctx.fillStyle = PALETTE.RED;
        ctx.beginPath();
        ctx.arc(x + TILE * 0.5, y + TILE * 0.5, TILE * 0.35, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = PALETTE.WHITE;
        ctx.fillRect(x + TILE * 0.35, y + TILE * 0.35, TILE * 0.08, TILE * 0.08);
        ctx.fillRect(x + TILE * 0.55, y + TILE * 0.3, TILE * 0.06, TILE * 0.06);
    }

    // ============ 角色绘制 ============

    function drawCharacter(x, y, icon, nameColor, name) {
        const bounce = Math.floor(gameState.time / 400) % 2;
        const yOffset = bounce * -2;

        ctx.fillStyle = PALETTE.SHADOW;
        ctx.beginPath();
        ctx.ellipse(x + TILE / 2, y + TILE + 1, TILE * 0.4, TILE * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'PALETTE.WHITE';
        ctx.beginPath();
        ctx.arc(x + TILE / 2, y + TILE / 2 + yOffset, TILE / 2 + 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'PALETTE.BLACK';
        ctx.beginPath();
        ctx.arc(x + TILE / 2, y + TILE / 2 + yOffset, TILE / 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = `${TILE * 0.7}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(icon, x + TILE / 2, y + TILE / 2 + yOffset);

        ctx.fillStyle = nameColor;
        ctx.font = `${Math.max(6, TILE * 0.4)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(name, x + TILE / 2, y - 3);

        const p = gameState.player;
        const dist = Math.hypot(p.x - x, p.y - y);
        if (dist < TILE * 2.5) {
            ctx.fillStyle = PALETTE.WHITE;
            ctx.beginPath();
            ctx.arc(x + TILE / 2 + 8, y - 10, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = PALETTE.YELLOW;
            ctx.font = `${TILE * 0.5}px serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('💬', x + TILE / 2 + 8, y - 10);
        }

        ctx.textBaseline = 'alphabetic';
    }

    function drawPlayer() {
        const p = gameState.player;
        const bounce = p.moving ? Math.floor(p.frame) % 2 : 0;
        const yOffset = bounce * -2;

        let drawX = p.x;
        let drawY = p.y;

        // 室内模式：ctx已被translate到室内地图左上角，
        // drawPlayer在translate块内调用，所以使用室内绝对像素坐标
        // 不需要额外偏移（translate已经处理）

        ctx.fillStyle = PALETTE.SHADOW;
        ctx.beginPath();
        ctx.ellipse(drawX + TILE / 2, drawY + TILE + 1, TILE * 0.45, TILE * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'PALETTE.CYAN';
        ctx.beginPath();
        ctx.arc(drawX + TILE / 2, drawY + TILE / 2 + yOffset, TILE / 2 + 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = PALETTE.CYAN;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.font = `${TILE * 0.65}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const playerIcon = p.dir === 'up' ? '😎' : p.dir === 'left' || p.dir === 'right' ? '🧑' : '😊';
        ctx.fillText(playerIcon, drawX + TILE / 2, drawY + TILE / 2 + yOffset);

        if (gameState.energy < 20) {
            const flash = Math.floor(gameState.time / 300) % 2;
            if (flash) {
                ctx.fillStyle = PALETTE.RED;
                ctx.font = `${TILE * 0.4}px monospace`;
                ctx.textAlign = 'center';
                ctx.fillText('低能量!', drawX + TILE / 2, drawY - 6);
            }
        }
    }

    // ============ 交互提示 ============

    function drawInteractionHint() {
        let hint = '';

        if (gameState.currentMap !== 'outdoor') {
            const indoor = gameState.indoorData;
            if (!indoor) return;
            hint = '[ E ] 离开 ' + (indoor.name || '建筑');
        } else {
            if (gameState.nearEntry) {
                hint = '[ E ] 进入 ' + gameState.nearEntry.name_short;
            } else if (gameState.nearNPC) {
                hint = '[ E ] 与 ' + gameState.nearNPC.name + ' 对话';
            }
        }

        if (!hint) return;

        const w = canvas.width;
        const y = canvas.height - 35;
        ctx.fillStyle = 'PALETTE.BLACK';
        const tw = ctx.measureText(hint).width + 40;
        const tx = Math.max(10, (w - tw) / 2);
        ctx.fillRect(tx, y, tw, 26);
        ctx.fillStyle = PALETTE.YELLOW;
        ctx.font = '12px "Noto Sans SC", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(hint, w / 2, y + 18);
    }

    function getNearbyEntry() {
        const mapGrid = gameState.mapGrid;
        if (!mapGrid) return null;

        const tx = Math.floor((gameState.player.x + TILE / 2) / TILE);
        const ty = Math.floor((gameState.player.y + TILE / 2) / TILE);

        const checkTiles = [
            [tx, ty],
            [tx, ty - 1], [tx, ty + 1],
            [tx - 1, ty], [tx + 1, ty],
            [tx - 2, ty], [tx + 2, ty],
            [tx, ty - 2], [tx, ty + 2],
            [tx - 1, ty - 1], [tx + 1, ty - 1],
            [tx - 1, ty + 1], [tx + 1, ty + 1]
        ];

        for (const [cx, cy] of checkTiles) {
            if (mapGrid[cy]?.[cx] === 8) {
                const zone = gameState.indoorZones.find(z =>
                    z.enter_tile?.tx === cx && z.enter_tile?.ty === cy
                );
                if (zone) return zone;
                // 如果没有匹配的 zone，查找 poi_to_grid 中的入口
                for (const [poiId, poi] of Object.entries(gameState.poiGrid)) {
                    if (poi.enter_tile?.tx === cx && poi.enter_tile?.ty === cy) {
                        // 查找已有的 indoorZone 或创建虚拟 zone
                        const existing = gameState.indoorZones.find(z => z.poi_id === poiId);
                        if (existing) return existing;
                        // 返回虚拟 zone（用于显示提示）
                        return {
                            id: poiId + '_indoor',
                            poi_id: poiId,
                            name: poiId.replace(/_/g, '').replace(/([A-Z])/g, ' $1').trim(),
                            name_short: poiId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                            enter_tile: poi.enter_tile,
                            exit_spawn: poiId,
                            _virtual: true
                        };
                    }
                }
            }
        }
        return null;
    }

    function tryInteract() {
        if (gameState.currentMap !== 'outdoor') {
            const exitPt = checkIndoorExit();
            if (exitPt) {
                exitIndoor(exitPt.spawn);
                return;
            }
        } else {
            if (gameState.nearEntry) {
                enterIndoor(gameState.nearEntry.id);
                return;
            }
            if (gameState.nearNPC) {
                interactNPC(gameState.nearNPC);
                return;
            }
        }
        showNotification('这里没有可互动的对象', 'info');
    }

    function checkIndoorExit() {
        const indoor = gameState.indoorData;
        if (!indoor || !indoor.interact_points) return null;
        const px = gameState.player.x;
        const py = gameState.player.y;
        const ITILE = Math.min(Math.floor(canvas.width / indoor.width), Math.floor(canvas.height / indoor.height)) - 4;
        const mapW = indoor.width * ITILE;
        const mapH = indoor.height * ITILE;
        const ox = Math.floor((canvas.width - mapW) / 2);
        const oy = Math.floor((canvas.height - mapH) / 2);

        for (const pt of indoor.interact_points) {
            if (pt.type === 'exit') {
                const ptPx = ox + pt.x * ITILE;
                const ptPy = oy + pt.y * ITILE;
                const dist = Math.hypot(px - ptPx - ITILE / 2, py - ptPy - ITILE / 2);
                if (dist < ITILE * 2.5) {
                    return pt;
                }
            }
        }
        return null;
    }

    async function enterIndoor(zoneId) {
        try {
            const resp = await fetch('data/campus_indoor.json');
            if (!resp.ok) {
                showNotification('无法加载室内地图', 'error');
                return;
            }
            const data = await resp.json();
            const indoor = data[zoneId];
            if (!indoor) {
                // 虚拟 zone 没有室内地图数据，显示友好提示
                const zone = gameState.nearEntry;
                const name = zone?.name || zone?.name_short || '建筑';
                showNotification('"' + name + '"室内地图正在开发中', 'info');
                return;
            }
            gameState.indoorData = indoor;
            gameState.currentMap = zoneId;

            // 记录入口的室外瓦片坐标，用于退出时定位
            const entryTile = gameState.nearEntry?.enter_tile || { tx: 14, ty: 28 };
            gameState._indoorEntryTile = entryTile;

            const ITILE = Math.min(
                Math.floor(canvas.width / indoor.width),
                Math.floor(canvas.height / indoor.height)
            ) - 4;
            const ox = Math.floor((canvas.width - indoor.width * ITILE) / 2);
            const oy = Math.floor((canvas.height - indoor.height * ITILE) / 2);

            if (indoor.npcs && indoor.npcs.length > 0) {
                gameState.npcs = indoor.npcs.map(npc => ({
                    ...npc,
                    x: ox + npc.x * ITILE + ITILE / 2,
                    y: oy + npc.y * ITILE + ITILE / 2
                }));
            } else {
                gameState.npcs = [];
            }

            // 玩家出现在室内地图中央偏下
            gameState.player.x = ox + Math.floor(indoor.width / 2) * ITILE + ITILE / 2;
            gameState.player.y = oy + Math.floor(indoor.height / 2) * ITILE + ITILE / 2;

            updateLocationDisplay();
            showNotification('进入：' + indoor.name, 'info');
        } catch (err) {
            showNotification('加载室内地图失败', 'error');
        }
    }

    function exitIndoor(spawnId) {
        // 优先使用进入时记录的入口瓦片坐标退出
        const entryTile = gameState._indoorEntryTile;
        if (entryTile) {
            gameState.player.x = entryTile.tx * TILE;
            gameState.player.y = (entryTile.ty + 1) * TILE; // 退出门的下一格
        } else {
            const spawn = gameState.poiGrid[spawnId];
            if (spawn) {
                gameState.player.x = spawn.tileX * TILE;
                gameState.player.y = spawn.tileY * TILE;
            } else {
                gameState.player.x = 14 * TILE;
                gameState.player.y = 28 * TILE;
            }
        }
        gameState.currentMap = 'outdoor';
        gameState.indoorData = null;
        gameState._indoorEntryTile = null;

        loadNPCs();
        updateLocationDisplay();
        showNotification('离开建筑，回到校园', 'info');
    }

    async function interactNPC(npc) {
        gameState.paused = true;
        showNotification(`${npc.name}：${npc.dialogues[0]}`, 'success');

        try {
            const resp = await fetch(_geApi('/api/chat'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: '你好！简短打个招呼即可。',
                    history: []
                })
            });
            if (resp?.ok) {
                const text = await resp.text();
                const content = text.split('\n').find(l => l.startsWith('data: '))?.slice(6) || '';
                if (content) {
                    setTimeout(() => {
                        showNotification(`${npc.name}：${content}`, 'ai');
                    }, 1500);
                }
            }
        } catch {}

        gameState.energy = Math.max(0, gameState.energy - 2);
        updateHUD();

        setTimeout(() => { gameState.paused = false; }, 2000);
    }

    // ============ 室内地图渲染 ============

    function drawIndoorMap() {
        const indoor = gameState.indoorData;
        if (!indoor) return;

        const w = canvas.width, h = canvas.height;
        const IW = indoor.width, IH = indoor.height;
        const ITILE = Math.min(Math.floor(w / IW), Math.floor(h / IH)) - 4;

        const mapW = IW * ITILE;
        const mapH = IH * ITILE;
        const offsetX = Math.floor((w - mapW) / 2);
        const offsetY = Math.floor((h - mapH) / 2);

        ctx.save();
        ctx.translate(offsetX, offsetY);

        for (let ty = 0; ty < IH; ty++) {
            for (let tx = 0; tx < IW; tx++) {
                drawIndoorTile(tx, ty, indoor.tiles[ty][tx], ITILE);
            }
        }

        if (indoor.furniture) {
            for (const item of indoor.furniture) {
                drawFurniture(item, ITILE);
            }
        }

        (indoor.npcs || []).forEach(npc => {
            drawCharacter(
                txToPx(npc.x, ITILE) + ITILE / 2,
                tyToPx(npc.y, ITILE) + ITILE / 2,
                npc.icon, '#FFCD75', npc.name
            );
        });

        drawPlayer();

        ctx.restore();

        const vignette = ctx.createRadialGradient(w / 2, h / 2, mapH * 0.3, w / 2, h / 2, mapH * 0.85);
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.35)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, w, h);
    }

    function txToPx(tx, tile) { return tx * tile; }
    function tyToPx(ty, tile) { return ty * tile; }

    function drawIndoorTile(tx, ty, type, tile) {
        const x = tx * tile, y = ty * tile;

        switch (type) {
            case 0:
                ctx.fillStyle = 'PALETTE.DOOR_LIGHT';
                ctx.fillRect(x, y, tile, tile);
                ctx.strokeStyle = 'rgba(160,120,80,0.2)';
                ctx.lineWidth = 0.5;
                for (let i = 0; i < 3; i++) {
                    ctx.beginPath();
                    ctx.moveTo(x, y + (i + 1) * tile / 4);
                    ctx.lineTo(x + tile, y + (i + 1) * tile / 4);
                    ctx.stroke();
                }
                break;
            case 1:
                ctx.fillStyle = 'PALETTE.PATH_LIGHT';
                ctx.fillRect(x, y, tile, tile);
                ctx.strokeStyle = PALETTE.PATH_STONE;
                ctx.lineWidth = 0.5;
                ctx.strokeRect(x + 1, y + 1, tile - 2, tile - 2);
                break;
            case 2:
                ctx.fillStyle = 'PALETTE.DOOR_BROWN';
                ctx.fillRect(x, y, tile, tile);
                ctx.fillStyle = PALETTE.DOOR_LIGHT;
                ctx.fillRect(x + 2, y + 2, tile - 4, tile * 0.25);
                break;
            case 3:
                ctx.fillStyle = 'PALETTE.DARK_GRAY';
                ctx.fillRect(x + 2, y + 2, tile - 4, tile - 4);
                ctx.fillStyle = 'PALETTE.YELLOW';
                ctx.fillRect(x + 4, y + 4, tile - 8, tile - 8);
                break;
            case 4:
                ctx.fillStyle = 'PALETTE.GRASS_DARK';
                ctx.fillRect(x + 2, y + 2, tile - 4, tile - 4);
                ctx.strokeStyle = 'PALETTE.DOOR_BROWN';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(x + 2, y + 2, tile - 4, tile - 4);
                break;
        }

        if (type === 0 || type === 2) {
            ctx.strokeStyle = 'rgba(0,0,0,0.06)';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(x, y, tile, tile);
        }
    }

    function drawFurniture(item, tile) {
        const x = item.x * tile, y = item.y * tile;
        switch (item.type) {
            case 'blackboard':
                ctx.fillStyle = 'PALETTE.GRASS_DARK';
                ctx.fillRect(x + 2, y + 2, tile * item.w - 4, Math.floor(tile * 0.6));
                ctx.strokeStyle = 'PALETTE.DOOR_BROWN';
                ctx.lineWidth = 2;
                ctx.strokeRect(x + 2, y + 2, tile * item.w - 4, Math.floor(tile * 0.6));
                break;
            case 'desk':
                ctx.fillStyle = 'PALETTE.DOOR_BROWN';
                ctx.fillRect(x + 1, y + 1, tile * item.w - 2, tile * item.h - 2);
                break;
            case 'projector':
                ctx.fillStyle = 'PALETTE.DARK_GRAY';
                ctx.fillRect(x + tile * 0.3, y + 2, tile * 0.4, tile * 0.25);
                ctx.fillStyle = 'PALETTE.WHITE';
                ctx.fillRect(x + tile * 0.1, y + tile * 0.4, tile * 0.8, tile * 0.4);
                break;
        }
    }

    // ============ UI 控制 ============

    function toggleMenu() {
        gameState.paused = true;
        const menu = document.getElementById('game-menu');
        if (menu) menu.style.display = 'flex';
    }

    function resume() {
        gameState.paused = false;
        const menu = document.getElementById('game-menu');
        if (menu) menu.style.display = 'none';
        closeAllPanels();
    }

    function closeAllPanels() {
        const panels = ['game-inventory', 'game-questlog', 'game-poi-panel', 'game-menu'];
        for (const id of panels) {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        }
        gameState.paused = false;
    }

    async function navigateToPOI(poiId) {
        try {
            const resp = await fetch('data/campus_pois.json');
            if (!resp.ok) return;
            const data = await resp.json();
            const poi = (data.pois || []).find(p => p.id === poiId);
            if (!poi) return;

            const poiGrid = gameState.poiGrid[poiId];
            if (poiGrid) {
                gameState.player.x = poiGrid.tileX * TILE;
                gameState.player.y = poiGrid.tileY * TILE;
                resume();
                showNotification(`传送到：${poi.short_name || poi.name}`, 'info');
                const locEl = document.getElementById('game-location');
                if (locEl) locEl.textContent = '📍 ' + (poi.short_name || poi.name);
            }
        } catch {}
    }

    async function openPOIPanel() {
        closeAllPanels();
        gameState.paused = true;
        const panel = document.getElementById('game-poi-panel');
        if (panel) panel.style.display = 'flex';

        const grid = document.getElementById('poi-grid');
        if (!grid) return;

        try {
            const resp = await fetch('data/campus_pois.json');
            if (!resp.ok) {
                grid.innerHTML = '<div style="color:#F4F4F4;font-size:8px;padding:1rem">加载失败</div>';
                return;
            }
            const data = await resp.json();
            const pois = data.pois || [];

            const discovered = (window.StateManager?.get?.('exploration.discovered_locations') || []);
            const currentPoi = window.StateManager?.get?.('exploration.current_location');

            grid.innerHTML = pois.map(poi => {
                const isDisc = discovered.includes(poi.id);
                const isCurrent = currentPoi === poi.id;
                const zoneColors = { teaching: '#667eea', living: '#38b764', scenic: '#3b82f6', sports: '#f97316', gate: '#ef4444' };
                const color = zoneColors[poi.zone] || '#667eea';
                return `<button class="poi-nav-btn ${isDisc ? '' : 'poi-locked'}"
                    onclick="GameEngine.navigateToPOI('${poi.id}')"
                    title="${poi.official_name || poi.name}"
                    ${isDisc ? '' : 'disabled'}>
                    <span class="poi-nav-icon">${poi.icon}</span>
                    <span class="poi-nav-name">${poi.short_name || poi.name}</span>
                    <span class="poi-nav-zone" style="color:${color}">${poi.zone || ''}</span>
                    ${isCurrent ? '<span class="poi-nav-here">当前</span>' : ''}
                    ${!isDisc ? '<span class="poi-nav-lock">🔒</span>' : ''}
                </button>`;
            }).join('');
        } catch {
            grid.innerHTML = '<div style="color:#F4F4F4;font-size:8px;padding:1rem">加载失败</div>';
        }
    }

    function openInventory() {
        closeAllPanels();
        const inv = document.getElementById('game-inventory');
        if (inv) inv.style.display = 'flex';
        gameState.paused = true;
        renderInventory();
    }

    function renderInventory() {
        const grid = document.getElementById('inventory-grid');
        if (!grid) return;
        const items = gameState.inventory || [];
        const slots = 15;
        let html = '';
        for (let i = 0; i < slots; i++) {
            if (i < items.length && items[i].quantity > 0) {
                html += `<div class="inv-slot" title="${items[i].name}">
                    ${items[i].icon || '❓'}
                    <span class="qty">x${items[i].quantity}</span>
                </div>`;
            } else {
                html += `<div class="inv-slot empty"></div>`;
            }
        }
        grid.innerHTML = html;
    }

    async function openQuestLog() {
        closeAllPanels();
        const ql = document.getElementById('game-questlog');
        if (ql) ql.style.display = 'flex';
        gameState.paused = true;

        try {
            const resp = await fetch(_geApi('/api/tasks?category=main'));
            if (resp?.ok) {
                const data = await resp.json();
                const list = document.getElementById('questlog-list');
                if (list && data.tasks?.length) {
                    list.innerHTML = data.tasks.map(t => `
                        <div class="quest-item ${t.status === 'completed' ? 'completed' : ''}">
                            <div class="quest-name">${t.category_icon || '🎯'} ${t.name}</div>
                            <div class="quest-desc">${t.category_name || '任务'}</div>
                            <div class="quest-reward">⭐ +${t.reward?.experience || 0} | 💰 +${t.reward?.gold || 0}</div>
                        </div>
                    `).join('');
                }
            }
        } catch {}
    }

    async function syncData() {
        showNotification('正在同步数据...', 'info');
        try {
            await fetch(_geApi('/api/user'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role: { gold: gameState.gold, level: gameState.level }
                })
            });
            showNotification('数据同步成功', 'success');
        } catch {
            showNotification('同步失败', 'error');
        }
    }

    // ============ 通知系统 ============

    function showNotification(text, type = 'info') {
        const container = document.getElementById('game-notifications');
        if (!container) return;
        const notif = document.createElement('div');
        notif.className = 'game-notif';
        if (type === 'success') notif.style.borderColor = PALETTE.GRASS_BRIGHT;
        if (type === 'error') notif.style.borderColor = PALETTE.RED;
        if (type === 'ai') notif.style.borderColor = PALETTE.ORANGE;
        notif.textContent = text;
        container.appendChild(notif);
        setTimeout(() => {
            notif.style.opacity = '0';
            notif.style.transform = 'translateX(20px)';
            setTimeout(() => notif.remove(), 200);
        }, 2500);
    }

    // ============ 公开 API ============

    return {
        init,
        toggleMenu,
        resume,
        closeAllPanels,
        openInventory,
        openQuestLog,
        openPOIPanel,
        navigateToPOI,
        syncData
    };
})();

window.GameEngine = GameEngine;
