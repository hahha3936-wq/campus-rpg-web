/**
 * 校园RPG - 校园探索模块
 * 基于 Leaflet.js 的交互式地图
 */

const ExplorationMap = {
    map: null,
    markers: {},
    markersLayer: null,
    isInitialized: false,
    modalInstance: null,
    campusPOIs: [],   // 从 campus_pois.json 加载的地点数据
    schematicLayer: null,  // 示意图叠图层
    _tileLayer: null,      // 当前底图瓦片层（高德或 OSM）
    currentLayer: 'amap', // 'amap' | 'osm' | 'schematic' | 'hybrid'
    _currentNavTarget: null,    // 当前导航目标地点 ID
    _routeLoading: false,        // 路线计算中

    /**
     * 初始化探索地图
     */
    init() {
        if (this.isInitialized) return;

        // 立即注册模态生命周期（不依赖 Leaflet，早于异步加载完成）
        this._bindModalLifecycle();

        // 加载 Leaflet CSS/JS（延迟加载，仅探索时加载）
        this._loadLeaflet(() => {
            this._initMap();
            this._renderMarkers();
            this._bindLeafletEvents();
            this.isInitialized = true;
        });
    },

    /**
     * 延迟加载 Leaflet CDN
     */
    _loadLeaflet(callback) {
        if (window.L) {
            callback();
            return;
        }

        // 加载 CSS
        if (!document.querySelector('link[href*="leaflet"]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);
        }

        // 加载 JS
        if (!document.querySelector('script[src*="leaflet"]')) {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            script.onload = callback;
            document.head.appendChild(script);
        } else {
            callback();
        }
    },

    /**
     * 初始化地图实例
     */
    async _initMap() {
        const container = document.getElementById('exploration-map-container');
        if (!container) return;

        // 清理旧地图实例
        if (this.map) {
            this.map.remove();
            this.map = null;
        }

        // 加载校园地理配置（bounds、默认中心、缩放范围）
        let mapConfig = {
            center: [31.8843, 117.2870],
            zoom: 16,
            maxBounds: [[31.8800, 117.2800], [31.8880, 117.2950]]
        };
        try {
            const resp = await fetch('data/campus_bounds.json');
            if (resp.ok) {
                const data = await resp.json();
                if (data.leaflet_config) {
                    mapConfig = { ...mapConfig, ...data.leaflet_config };
                }
            }
        } catch (err) {
            console.warn('[ExplorationMap] 加载 campus_bounds.json 失败，使用默认配置:', err.message);
        }

        // POI 数据与 campus_bounds.json 中的坐标均为 WGS-84，高德底图为 GCJ-02，转换地图中心点以对齐
        const mapCenterGCJ = CampusNavigation.toGCJ02(mapConfig.center[1], mapConfig.center[0]);

        // 创建地图
        this.map = L.map('exploration-map-container', {
            center: [mapCenterGCJ.lat, mapCenterGCJ.lng],
            zoom: mapConfig.zoom,
            maxBounds: [
                CampusNavigation.toGCJ02(mapConfig.maxBounds[0][1], mapConfig.maxBounds[0][0]),
                CampusNavigation.toGCJ02(mapConfig.maxBounds[1][1], mapConfig.maxBounds[1][0])
            ],
            zoomControl: true,
            attributionControl: false
        });

        // 添加底图层（默认高德栅格瓦片，国内访问稳定；坐标统一用 GCJ-02）
        this._setupTileLayer('amap');
        this.markersLayer = L.layerGroup().addTo(this.map);

        // 初始化导航模块（异步加载高德 API Key）
        CampusNavigation.init();

        // 加载 campus_pois.json 作为地点数据源
        await this._loadCampusPOIs();

        // 渲染时自动完成 GCJ-02 转换
        this._renderMarkers();

        // 尝试获取用户 GPS 位置并飞至该处
        this._locateUser();

        // 启动持续定位追踪
        this._watchUserPosition();
    },

    /**
     * 获取用户 GPS 位置并飞至该处
     */
    async _locateUser() {
        try {
            const pos = await CampusNavigation.getCurrentPosition();
            if (pos && CampusNavigation.isOnCampus(pos.lat, pos.lng)) {
                // 用户在校内，飞至用户位置
                this.map.flyTo([pos.lat, pos.lng], 17, { animate: true, duration: 1 });
                this._showUserMarker(pos);
            }
        } catch (err) {
            console.warn('[ExplorationMap] GPS 定位失败:', err.message);
            // 定位失败不影响地图使用，静默忽略
        }
    },

    /**
     * 在地图上显示用户位置标记
     */
    _showUserMarker(pos) {
        // 移除旧标记
        if (this._userMarker) {
            this.map.removeLayer(this._userMarker);
        }
        // pos 已是 GCJ-02 坐标（navigation.js 已转换）
        this._userMarker = L.circleMarker([pos.lat, pos.lng], {
            radius: 8,
            fillColor: '#38bdf8',
            fillOpacity: 0.9,
            color: '#fff',
            weight: 2,
            opacity: 1
        }).addTo(this.map);
        this._userMarker.bindPopup('<b>你的位置</b>').openPopup();
    },

    /**
     * 持续追踪用户位置变化
     */
    _watchUserPosition() {
        if (!navigator.geolocation) return;
        // 清理旧的追踪
        if (this._watchId !== undefined) {
            navigator.geolocation.clearWatch(this._watchId);
        }
        this._watchId = navigator.geolocation.watchPosition(
            pos => {
                const userPos = CampusNavigation.toGCJ02(pos.coords.longitude, pos.coords.latitude);
                if (CampusNavigation.isOnCampus(userPos.lat, userPos.lng)) {
                    if (this._userMarker) {
                        this._userMarker.setLatLng([userPos.lat, userPos.lng]);
                    } else {
                        this._showUserMarker(userPos);
                    }
                }
            },
            err => console.warn('[ExplorationMap] 位置追踪失败:', err.message),
            { enableHighAccuracy: true, maximumAge: 5000 }
        );
    },

    /**
     * 切换底图瓦片层
     * @param {'amap'|'osm'|'schematic'|'hybrid'} mode
     */
    switchLayer(mode) {
        if (!this.map) return;
        this.currentLayer = mode;

        if (this._tileLayer) {
            this.map.removeLayer(this._tileLayer);
            this._tileLayer = null;
        }
        if (this.schemematicLayer) {
            this.map.removeLayer(this.schemematicLayer);
            this.schemematicLayer = null;
        }

        if (mode === 'amap') {
            this._setupTileLayer('amap');
        } else if (mode === 'osm') {
            this._setupTileLayer('osm');
        } else if (mode === 'schematic') {
            this._setupTileLayer('amap');
            this._loadSchematicOverlay();
        } else if (mode === 'hybrid') {
            this._setupTileLayer('amap');
            this._loadSchematicOverlay(true);
        }

        // 切换图层后重绘标记（不同底图坐标系不同）
        this._renderMarkers();
    },

    /**
     * 设置瓦片层
     * @param {'amap'|'osm'} type
     */
    _setupTileLayer(type) {
        if (type === 'amap') {
            // 高德栅格瓦片（Web 地图图层，坐标系 GCJ-02）
            // subdomains 用数字域名避免 CDN 被屏蔽
            this._tileLayer = L.tileLayer(
                'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
                {
                    maxZoom: 19,
                    subdomains: ['1', '2', '3', '4'],
                    attribution: '© 高德地图'
                }
            ).addTo(this.map);
        } else {
            // OpenStreetMap（WGS-84）
            this._tileLayer = L.tileLayer(
                'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                { maxZoom: 19, attribution: '© OpenStreetMap' }
            ).addTo(this.map);
        }

        // 瓦片加载失败时降级提示
        this._tileLayer.on('tileerror', (e) => {
            console.warn('[ExplorationMap] 瓦片加载失败:', e.tile.src);
            showNotification('底图瓦片加载失败，请检查网络或尝试切换图层', 'warning');
        });
    },

    /**
     * 加载校园 POI 数据
     */
    async _loadCampusPOIs() {
        try {
            const resp = await fetch('data/campus_pois.json');
            if (resp.ok) {
                const data = await resp.json();
                this.campusPOIs = data.pois || [];
                // 同步到 StateManager（兼容旧逻辑）
                if (this.campusPOIs.length > 0 && !StateManager.get('locations')?.length) {
                    StateManager.set('locations', this.campusPOIs);
                }
            }
        } catch (err) {
            console.warn('[ExplorationMap] 加载 campus_pois.json 失败:', err.message);
        }
    },

    /**
     * 渲染所有地点标记
     */
    _renderMarkers() {
        // 优先使用 campus_pois.json 的数据，回退到 StateManager.locations
        const locations = this.campusPOIs.length > 0
            ? this.campusPOIs
            : (StateManager.get('locations') || []);
        const discovered = StateManager.get('exploration.discovered_locations') || [];

        // 清除旧标记
        this.markersLayer.clearLayers();
        this.markers = {};

        locations.forEach(loc => {
            if (!loc?.position?.lat || !loc?.position?.lng) {
                console.warn('地点缺少坐标信息:', loc);
                return;
            }
            const isDiscovered = discovered.includes(loc.id);

            // 自定义标记图标
            const iconHtml = `
                <div class="exploration-marker ${isDiscovered ? 'discovered' : 'undiscovered'}" title="${this._getLocationLabel(loc)}">
                    <span class="marker-icon">${loc.icon}</span>
                    ${!isDiscovered ? '<span class="marker-lock">?</span>' : ''}
                </div>
            `;

            const icon = L.divIcon({
                html: iconHtml,
                className: 'exploration-marker-wrapper',
                iconSize: [50, 50],
                iconAnchor: [25, 25],
                popupAnchor: [0, -30]
            });

            // POI 数据为 WGS-84，高德底图为 GCJ-02，需要转换；OSM 底图则无需转换
            const useGCJ = this.currentLayer === 'amap' || this.currentLayer === 'hybrid' || this.currentLayer === 'schematic';
            const markerLatLng = useGCJ
                ? CampusNavigation.toGCJ02(loc.position.lng, loc.position.lat)
                : { lng: loc.position.lng, lat: loc.position.lat };
            const marker = L.marker([markerLatLng.lat, markerLatLng.lng], { icon });

            // 绑定点击事件
            marker.on('click', () => this._onMarkerClick(loc));

            marker.addTo(this.markersLayer);
            this.markers[loc.id] = marker;
        });
    },

    /**
     * 标记点击处理
     */
    async _onMarkerClick(location) {
        const user = StateManager.get('user');
        const level = user?.role?.level || 1;

        // 检查解锁条件
        if (location.unlock_requirements?.min_level > level) {
            showNotification(`需要达到 Lv.${location.unlock_requirements.min_level} 才能探索此处`, 'info');
            return;
        }

        // 标记为当前地点
        StateManager.set('exploration.current_location', location.id);

        // 尝试探索该地点
        const result = await this._discoverLocation(location);

        // 显示地点详情面板
        this._showLocationPanel(location, result);
    },

    /**
     * 探索地点 API 调用
     */
    async _discoverLocation(location) {
        try {
            const res = await fetch(typeof window.apiUrl === 'function' ? window.apiUrl('/api/exploration/discover') : '/api/exploration/discover', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ location_id: location.id })
            });
            if (!res.ok) {
                console.warn('探索 API 响应异常:', res.status);
                const isNew = StateManager.discoverLocation(location.id);
                const hidden = this._resolveHiddenEvent(location);
                return { is_new: isNew, location, offline: true, hidden_event: hidden };
            }
            const data = await res.json();
            // 后端若未返回 hidden_event，按本地概率计算
            if (!data.hidden_event && location.hidden_event_chance > 0) {
                data.hidden_event = this._resolveHiddenEvent(location);
            }
            return data;
        } catch {
            const isNew = StateManager.discoverLocation(location.id);
            const hidden = this._resolveHiddenEvent(location);
            return { is_new: isNew, location, offline: true, hidden_event: hidden };
        }
    },

    /**
     * 根据 hidden_event_chance 概率决定是否触发隐藏事件
     */
    _resolveHiddenEvent(location) {
        if (!location.hidden_event_chance || !location.hidden_events?.length) return null;
        if (Math.random() < location.hidden_event_chance) {
            const id = location.hidden_events[Math.floor(Math.random() * location.hidden_events.length)];
            return { id, icon: '?', title: '隐藏事件触发！', desc: '发现了一个隐藏的秘密地点。' };
        }
        return null;
    },

    /**
     * 显示地点详情面板
     */
    async _showLocationPanel(location, result) {
        const panel = document.getElementById('location-panel');
        const panelBody = document.getElementById('location-panel-body');
        const panelTitle = document.getElementById('location-panel-title');
        const guideId = location.guide_id ? `<span class="poi-guide-id">#${location.guide_id}</span>` : '';

        if (!panel || !panelBody) return;

        const discovered = result?.is_new ?? false;
        const currentBuff = this._getActiveBuff(location);
        const hour = new Date().getHours();
        const isNightTime = hour >= 22 || hour < 6;

        panelTitle.innerHTML = `<span>${location.icon}</span> ${this._getLocationLabel(location)}${guideId}`;
        panel.className = `location-panel ${discovered ? 'new-discovery' : ''}`;

        // 隐藏事件检查
        let hiddenEventHtml = '';
        if (result?.hidden_event) {
            hiddenEventHtml = `
                <div class="location-hidden-event animate-bounce">
                    <div class="hidden-event-icon">${result.hidden_event.icon}</div>
                    <div class="hidden-event-text">${result.hidden_event.title}</div>
                </div>
            `;
        }

        // Buff 效果展示
        let buffHtml = '';
        if (currentBuff) {
            buffHtml = `
                <div class="location-buff">
                    <div class="buff-label">当前Buff</div>
                    <div class="buff-name">${currentBuff.buff.name}</div>
                    <div class="buff-desc">${currentBuff.buff.description || currentBuff.buff.effect || currentBuff.buff.effects || ''}</div>
                </div>
            `;
        }

        // 任务列表
        let taskHtml = '';
        if (location.tasks && location.tasks.length > 0) {
            const tasks = StateManager.get('tasks') || [];
            const relevantTasks = tasks.filter(t => location.tasks.includes(t.id));
            if (relevantTasks.length > 0) {
                taskHtml = `
                    <div class="location-tasks">
                        <div class="location-section-title">相关任务</div>
                        ${relevantTasks.map(t => `
                            <div class="location-task-item" onclick="openTaskModal()">
                                <span>${t.category_icon || '🎯'}</span>
                                <span class="task-name">${t.name}</span>
                                <span class="task-progress">${t.progress}%</span>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
        }

        // NPC 展示
        let npcHtml = '';
        if (location.npcs && location.npcs.length > 0) {
            const npcNames = location.npcs.map(id =>
                id === 'naruto' ? '漩涡鸣人老师' : '宇智波佐助助教'
            );
            npcHtml = `
                <div class="location-npcs">
                    <div class="location-section-title">在场NPC</div>
                    <div class="location-npc-list">
                        ${location.npcs.map(id => `
                            <div class="location-npc-chip" onclick="handleNPCInteraction('${id}')">
                                ${id === 'naruto' ? '🍥' : '⚡'} ${id === 'naruto' ? '鸣人老师' : '佐助助教'}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // 探索按钮
        const actionBtn = discovered
            ? `<button class="btn btn-explore-action" onclick="ExplorationMap._activateBuff('${location.id}')">
                📍 在此探索并获取Buff
               </button>`
            : `<button class="btn btn-explore-secondary" onclick="ExplorationMap._requestAIGuidance('${location.id}')">
                💬 询问阿游
               </button>`;

        panelBody.innerHTML = `
            ${discovered ? '<div class="new-badge">NEW!</div>' : ''}
            ${location.official_name && location.official_name !== (location.short_name || location.name)
                ? `<div class="poi-official-name">${location.official_name}</div>` : ''}
            <div class="location-type-badge type-${location.type}" style="border-color:${this._getZoneColor(location.zone)};color:${this._getZoneColor(location.zone)}">${this._getTypeName(location.type)} · ${location.zone ? this._getZoneName(location.zone) : ''}</div>

            <div class="location-description">
                ${discovered ? location.first_discover_text : location.description}
            </div>

            ${location.features && location.features.length > 0
                ? `<div class="location-features">${location.features.map(f => `<span class="feature-tag">${f}</span>`).join('')}</div>` : ''}
            ${hiddenEventHtml}
            ${buffHtml}

            <div class="location-stats">
                <div class="location-stat">
                    <div class="stat-value">${location.tasks?.length || 0}</div>
                    <div class="stat-label">相关任务</div>
                </div>
                <div class="location-stat">
                    <div class="stat-value">${location.npcs?.length || 0}</div>
                    <div class="stat-label">在场NPC</div>
                </div>
                <div class="location-stat">
                    <div class="stat-value">${Math.round((location.hidden_event_chance || 0.1) * 100)}%</div>
                    <div class="stat-label">隐藏事件</div>
                </div>
            </div>

            ${npcHtml}
            ${taskHtml}

            <div class="location-actions">
                <div id="nav-route-info" class="nav-route-info" style="display:none"></div>
                <button class="btn btn-navigate" onclick="ExplorationMap.navigateToAndShowRoute(${location.position.lng}, ${location.position.lat}, '${(this._getLocationLabel(location)).replace(/'/g, "\\'")}')">
                    🧭 导航到此处
                </button>
                ${actionBtn}
                ${isNightTime && discovered ? '<div class="night-hint">🌙 深夜探索可触发特殊成就</div>' : ''}
            </div>
        `;

        // 打开面板
        panel.classList.add('active');

        // 绑定关闭按钮事件
        const closeBtn = document.getElementById('location-panel-close');
        if (closeBtn) {
            closeBtn.onclick = () => panel.classList.remove('active');
        }

        // 如果是新发现，触发AI对话
        if (discovered) {
            setTimeout(() => {
                EventBus.emit(EVENTS.LOCATION_DISCOVERED, location);
            }, 500);
        }
    },

    /**
     * 获取当前激活的Buff
     */
    _getActiveBuff(location) {
        if (!location.buff) return null;
        return { buff: location.buff, location_id: location.id };
    },

    /**
     * 获取地点类型名称
     */
    _getTypeName(type) {
        const names = {
            building: '建筑', field: '运动场', landmark: '地标', gate: '校门',
            living: '居住区', food: '餐饮区', study: '学习区',
            academic: '教学区', sports: '运动区', leisure: '休闲区',
            social: '社交区', shop: '商店', scenic: '景观区'
        };
        return names[type] || type;
    },

    /**
     * 获取 zone 对应的颜色
     */
    _getZoneColor(zone) {
        const colors = {
            teaching: '#667eea',
            living:   '#38b764',
            scenic:   '#3b82f6',
            sports:   '#f97316',
            gate:     '#ef4444'
        };
        return colors[zone] || '#667eea';
    },

    _getZoneName(zone) {
        const names = {
            teaching: '教学区', living: '生活区',
            scenic: '景观区', sports: '运动区', gate: '校门'
        };
        return names[zone] || zone;
    },

    /**
     * 加载校园示意图叠图层
     */
    async _loadSchematicOverlay(transparent = false) {
        try {
            const resp = await fetch('data/campus_bounds.json');
            if (!resp.ok) return;
            const boundsData = await resp.json();
            const pts = boundsData.image_overlay?.gcs_points;
            if (!pts || pts.length < 4) return;

            // 使用 4 个 GCS 控制点计算 bounding box
            const lats = pts.map(p => p.lat);
            const lngs = pts.map(p => p.lng);
            const sw = L.latLng(Math.min(...lats), Math.min(...lngs));
            const ne = L.latLng(Math.max(...lats), Math.max(...lngs));
            const bounds = L.latLngBounds(sw, ne);

            const url = 'assets/maps/campus_schematic.png';
            const opacity = transparent ? 0.45 : 0.9;

            this.schematicLayer = L.imageOverlay(url, bounds, { opacity });
            this.schematicLayer.addTo(this.map);
        } catch (err) {
            console.warn('[ExplorationMap] 示意图加载失败:', err.message);
        }
    },

    /**
     * 激活地点Buff
     */
    async _activateBuff(locationId) {
        const locations = this.campusPOIs.length > 0
            ? this.campusPOIs
            : (StateManager.get('locations') || []);
        const location = locations.find(l => l.id === locationId);
        if (!location?.buff) return;

        const user = StateManager.get('user');
        // effects 可能是对象 { energy: 10, focus: 5 } 也可能是字符串 "任务经验+10%"
        const raw = location.buff.effects || location.buff.effect || null;
        let effects = {};
        if (typeof raw === 'string') {
            // 从字符串中解析数值：匹配 "能量+N"、"专注-N"、"经验+N%" 等模式
            const parseMatch = (str, ...keys) => {
                for (const key of keys) {
                    const m = str.match(new RegExp(`${key}[+]?(-?\\d+)`));
                    if (m) return { key, val: parseInt(m[1], 10) };
                }
                return null;
            };
            const e1 = parseMatch(raw, '能量', 'energy');
            if (e1) effects.energy = e1.val;
            const e2 = parseMatch(raw, '专注', 'focus');
            if (e2) effects.focus = e2.val;
            const e3 = parseMatch(raw, '心情', 'mood');
            if (e3) effects.mood = e3.val;
            const e4 = parseMatch(raw, '压力', 'stress');
            if (e4) effects.stress = -e4.val;
            const e5 = parseMatch(raw, '金币', 'gold');
            if (e5) effects.gold = e5.val;
        } else if (raw && typeof raw === 'object') {
            effects = raw;
        }

        // 应用Buff效果
        if (effects.energy) {
            user.stats.energy = Math.max(0, Math.min(100, user.stats.energy + effects.energy));
        }
        if (effects.focus) {
            user.stats.focus = Math.max(0, Math.min(100, user.stats.focus + effects.focus));
        }
        if (effects.mood) {
            user.stats.mood = Math.max(0, Math.min(100, user.stats.mood + effects.mood));
        }
        if (effects.stress) {
            user.stats.stress = Math.max(0, Math.min(100, user.stats.stress + effects.stress));
        }
        if (effects.gold) {
            user.role.gold = Math.max(0, user.role.gold + effects.gold);
        }

        StateManager.set('user', user);

        // 添加到用户Buff列表
        if (!user.buffs) user.buffs = [];
        user.buffs.push({
            ...location.buff,
            location_id: locationId,
            activated_at: new Date().toISOString()
        });

        // 触发事件
        EventBus.emit(EVENTS.BUFF_ACTIVATED, { location, buff: location.buff });

        showNotification(`获得 Buff：${location.buff.name}！`, 'success');
        updateStatusDisplay('energy', user.stats.energy);
        updateStatusDisplay('focus', user.stats.focus);
        updateStatusDisplay('mood', user.stats.mood);
        updateStatusDisplay('stress', user.stats.stress);

        // 更新标记显示
        this._renderMarkers();
    },

    /**
     * 请求AI引导
     */
    _requestAIGuidance(locationId) {
        const locations = this.campusPOIs.length > 0
            ? this.campusPOIs
            : (StateManager.get('locations') || []);

        let location;
        if (locationId === 'current') {
            const currentId = StateManager.get('exploration.current_location');
            location = locations.find(l => l.id === currentId);
        } else {
            location = locations.find(l => l.id === locationId);
        }

        // 不再强制要求有地点 — 没有地点时也打开聊天窗口，用通用问候语
        const context = {
            type: 'exploration_guidance',
            location: location ? {
                id: location.id,
                name: this._getLocationLabel(location),
                description: location.description,
                icon: location.icon,
                type: location.type
            } : null,
            message: location
                ? `我想了解一下${this._getLocationLabel(location)}的信息，你能给我一些建议吗？`
                : '你好，阿游！我是校园RPG的新冒险者，能给我一些校园生活的建议吗？'
        };

        EventBus.emit(EVENTS.CHAT_READY, { auto: true, context });
    },

    /**
     * 导航到指定地点：高德地图步行路线展示
     * 在探索地图上叠加路线，同时提供外部高德 App 导航
     */
    async navigateToAndShowRoute(lng, lat, name) {
        if (!this.map) return;

        // 取消之前的路线
        this._clearRoute();

        const routeInfoEl = document.getElementById('nav-route-info');
        const navBtn = document.querySelector('.btn-navigate');

        // 显示加载状态
        if (routeInfoEl) {
            routeInfoEl.style.display = 'block';
            routeInfoEl.innerHTML = '<span class="route-loading">🧭 正在计算路线...</span>';
        }
        if (navBtn) {
            navBtn.disabled = true;
            navBtn.textContent = '🧭 计算中...';
        }

        // 1. 清除旧路线 + 标记
        if (this._routeLayer) {
            this.map.removeLayer(this._routeLayer);
            this._routeLayer = null;
        }
        if (this._routeMarkers) {
            this._routeMarkers.forEach(m => this.map.removeLayer(m));
            this._routeMarkers = [];
        }

        // 2. 在地图上添加目标标记
        // POI 坐标是 WGS-84，底图为 amap 时需转 GCJ-02；OSM 底图则无需转换
        const useGCJ = this.currentLayer === 'amap' || this.currentLayer === 'hybrid' || this.currentLayer === 'schematic';
        const destPos = useGCJ
            ? CampusNavigation.toGCJ02(lng, lat)
            : { lng, lat };
        const destMarker = L.marker([destPos.lat, destPos.lng], {
            icon: L.divIcon({
                html: `<div style="width:20px;height:20px;background:#1E90FF;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(30,144,255,0.5);display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;font-weight:bold;">!</div>`,
                className: '',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            })
        }).addTo(this.map);
        destMarker.bindPopup(`<b>📍 ${name}</b>`).openPopup();

        this._routeMarkers = [destMarker];

        // 3. 调用后端路径规划 API（优先使用用户真实位置，无则用学校中心点）
        let routeResult = null;
        const fromPos = CampusNavigation._userPosition || CampusNavigation.SCHOOL_CENTER;
        try {
            routeResult = await CampusNavigation.calculateRoute(
                fromPos.lng,
                fromPos.lat,
                lng, lat
            );
        } catch {
            routeResult = null;
        }

        // 4. 绘制路线
        if (routeResult && routeResult.steps && routeResult.steps.length > 0) {
            const latlngs = [];
            routeResult.steps.forEach(step => {
                if (step.polyline) {
                    const pts = step.polyline.split(';');
                    pts.forEach(pt => {
                        const [ln, la] = pt.split(',').map(Number);
                        if (!isNaN(ln) && !isNaN(la)) latlngs.push([la, ln]);
                    });
                }
            });

            if (latlngs.length >= 2) {
                this._routeLayer = L.polyline(latlngs, {
                    color: '#1E90FF',
                    weight: 5,
                    opacity: 0.85,
                    lineJoin: 'round'
                }).addTo(this.map);

                // 添加起点标记
                const startMarker = L.marker(latlngs[0], {
                    icon: L.divIcon({
                        html: '<div style="width:12px;height:12px;background:#38b764;border-radius:50%;border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,0.3);"></div>',
                        className: '',
                        iconSize: [12, 12],
                        iconAnchor: [6, 6]
                    })
                }).addTo(this.map);

                if (!this._routeMarkers) this._routeMarkers = [];
                this._routeMarkers.push(startMarker);

                // 调整视野
                this.map.fitBounds(this._routeLayer.getBounds(), { padding: [80, 80] });

                // 显示路线信息
                const distText = CampusNavigation.formatDistance(routeResult.total_distance);
                const timeText = CampusNavigation.formatDuration(routeResult.total_duration);
                if (routeInfoEl) {
                    routeInfoEl.innerHTML = `
                        <div class="route-info-box">
                            <span class="route-icon">🚶</span>
                            <span class="route-text">
                                <b>步行 ${distText}</b> · 约 ${timeText}
                            </span>
                            <span class="route-sep">|</span>
                            <a class="route-open-btn" href="#" onclick="CampusNavigation.navigateTo(${lng}, ${lat}, '${name.replace(/'/g, "\\'")}'); return false;">
                                高德导航 ⟶
                            </a>
                        </div>
                    `;
                }
            } else {
                if (routeInfoEl) routeInfoEl.innerHTML = '<span class="route-error">⚠️ 路线数据异常</span>';
            }
        } else {
            // 路线规划失败：显示直线距离
            const straightDist = CampusNavigation.getDistance(
                CampusNavigation._userPosition || CampusNavigation.SCHOOL_CENTER,
                { lng, lat }
            );
            const distText = CampusNavigation.formatDistance(straightDist);
            if (routeInfoEl) {
                routeInfoEl.innerHTML = `
                    <div class="route-info-box">
                        <span class="route-icon">📏</span>
                        <span class="route-text">约 <b>${distText}</b>（直线距离）</span>
                        <span class="route-sep">|</span>
                        <a class="route-open-btn" href="#" onclick="CampusNavigation.navigateTo(${lng}, ${lat}, '${name.replace(/'/g, "\\'")}'); return false;">
                            高德导航 ⟶
                        </a>
                    </div>
                `;
            }
            // 画一条直线表示大致方向（坐标与当前底图坐标系一致）
            const useGCJ = this.currentLayer === 'amap' || this.currentLayer === 'hybrid' || this.currentLayer === 'schematic';
            const startPos = CampusNavigation._userPosition || CampusNavigation.SCHOOL_CENTER;
            const startPt = useGCJ
                ? CampusNavigation.toGCJ02(startPos.lng, startPos.lat)
                : { lng: startPos.lng, lat: startPos.lat };
            const endPt = useGCJ
                ? CampusNavigation.toGCJ02(lng, lat)
                : { lng, lat };
            this._routeLayer = L.polyline([[startPt.lat, startPt.lng], [endPt.lat, endPt.lng]], {
                color: '#FF6B35',
                weight: 3,
                opacity: 0.5,
                dashArray: '8, 8'
            }).addTo(this.map);
            this.map.fitBounds(this._routeLayer.getBounds(), { padding: [80, 80] });
        }

        // 恢复按钮状态
        if (navBtn) {
            navBtn.disabled = false;
            navBtn.textContent = '🧭 导航到此处';
        }
    },

    /**
     * 清除当前路线图层和临时标记
     */
    _clearRoute() {
        if (this._routeLayer && this.map) {
            this.map.removeLayer(this._routeLayer);
            this._routeLayer = null;
        }
        if (this._routeMarkers && this.map) {
            this._routeMarkers.forEach(m => this.map.removeLayer(m));
            this._routeMarkers = [];
        }
        const routeInfoEl = document.getElementById('nav-route-info');
        if (routeInfoEl) {
            routeInfoEl.style.display = 'none';
            routeInfoEl.innerHTML = '';
        }
    },

    _routeLayer: null,
    _routeMarkers: [],

    // ============================================
    // 工具方法：获取地点展示名称（兼容 POI 数据结构）
    // POI 数据无 name 字段，使用 short_name / official_name / id 兜底
    // ============================================
    _getLocationLabel(loc) {
        return loc.short_name || loc.official_name || loc.name || loc.id || '未知地点';
    },

    /**
     * 渲染底部地点快捷列表
     */
    _renderLocationList() {
        const container = document.getElementById('location-list-grid');
        if (!container) return;

        // 优先使用 campus_pois.json，回退到 StateManager
        const locations = this.campusPOIs.length > 0
            ? this.campusPOIs
            : (StateManager.get('locations') || []);
        const discovered = StateManager.get('exploration.discovered_locations') || [];
        const user = StateManager.get('user');
        const level = user?.role?.level || 1;

        // 更新顶部统计
        const exploredCount = document.getElementById('explored-count');
        const totalCount = document.getElementById('total-count');
        const exploredPct = document.getElementById('explored-pct');
        if (exploredCount) exploredCount.textContent = discovered.length;
        if (totalCount) totalCount.textContent = locations.length;
        if (exploredPct) exploredPct.textContent = locations.length > 0
            ? Math.round((discovered.length / locations.length) * 100) : 0;

        container.innerHTML = locations.map(loc => {
            const isDiscovered = discovered.includes(loc.id);
            const isLocked = (loc.unlock_requirements?.min_level || 1) > level;

            let stateClass = '';
            if (isLocked) stateClass = 'locked';
            else if (isDiscovered) stateClass = 'discovered';

            const safeId = String(loc.id).replace(/'/g, "\\'");
            return `
                <div class="location-list-item ${stateClass}"
                     onclick="ExplorationMap._focusLocation('${safeId}')"
                     title="${this._escapeHtml(ExplorationMap._getLocationLabel(loc))}">
                    <span class="item-icon">${loc.icon}</span>
                    <span class="item-name">${ExplorationMap._getLocationLabel(loc)}</span>
                </div>
            `;
        }).join('');
    },

    /**
     * 聚焦到指定地点
     */
    async _focusLocation(locationId) {
        const locations = this.campusPOIs.length > 0
            ? this.campusPOIs
            : (StateManager.get('locations') || []);
        const location = locations.find(l => l.id === locationId);
        if (!location) return;

        // 地图飞至该点（与标记坐标系一致）
        if (this.map) {
            const useGCJ = this.currentLayer === 'amap' || this.currentLayer === 'hybrid' || this.currentLayer === 'schematic';
            const target = useGCJ
                ? CampusNavigation.toGCJ02(location.position.lng, location.position.lat)
                : { lng: location.position.lng, lat: location.position.lat };
            this.map.flyTo([target.lat, target.lng], 17, { animate: true, duration: 1 });
        }

        // 模拟点击标记（等待异步发现逻辑完成）
        await this._onMarkerClick(location);
    },

    _boundModalLifecycle: false,

    /**
     * 绑定全局事件
     */
    _eventUnsubscribers: [],

    /**
     * 绑定 Leaflet 相关事件（必须在 Leaflet 加载完成后调用）
     */
    _bindLeafletEvents() {
        if (!this._boundModalLifecycle) return;

        // 探索成就更新后刷新标记和列表（保存取消函数，防止内存泄漏）
        const unsub = EventBus.on(EVENTS.LOCATION_DISCOVERED, () => {
            this._renderMarkers();
            this._renderLocationList();
        });
        this._eventUnsubscribers.push(unsub);
    },

    /**
     * 绑定模态框生命周期事件（同步执行，早于 Leaflet 加载）
     * 防止首次打开时 shown/hidden 监听缺失导致 backdrop 清理时序错位
     */
    _bindModalLifecycle() {
        if (this._boundModalLifecycle) return;
        this._boundModalLifecycle = true;

        const modal = document.getElementById('explorationModal');
        if (!modal) return;

        // 模态框打开后：渲染列表 + 清理多余的 backdrop + 切换 body class
        modal.addEventListener('shown.bs.modal', () => {
            document.body.classList.add('exploration-modal-open');
            this._renderLocationList();
            // 防御性去重：若存在多个 backdrop，保留最后一个，删除其余
            const backdrops = document.querySelectorAll('.modal-backdrop');
            if (backdrops.length > 1) {
                Array.from(backdrops).slice(0, -1).forEach(bp => bp.remove());
            }
            // 同步 backdrop z-index，确保在探索模态之下
            backdrops.forEach(bp => { bp.style.zIndex = '11999'; });
            // 地图尺寸修正（模态动画完成后调用，确保瓦片请求正确的视图区域）
            if (this.map) this.map.invalidateSize({ animate: false });
        });

        // 模态框关闭后：恢复 chat-widget，移除 body class，若无其它 modal 打开则清理孤儿 backdrop
        modal.addEventListener('hidden.bs.modal', () => {
            document.body.classList.remove('exploration-modal-open');
            this._restoreChatWidget();
            if (!document.querySelector('.modal.show')) {
                this._cleanupBackdrops();
            }
        });
    },

    /**
     * 销毁实例，清理所有事件监听器和定时器
     */
    destroy() {
        this._eventUnsubscribers.forEach(unsub => unsub());
        this._eventUnsubscribers = [];
        // 清理位置追踪
        if (this._watchId !== undefined) {
            navigator.geolocation.clearWatch(this._watchId);
        }
        if (this._userMarker) {
            this.map.removeLayer(this._userMarker);
        }
        if (this.map) {
            this.map.remove();
            this.map = null;
        }
        if (this.modalInstance) {
            this.modalInstance.dispose();
            this.modalInstance = null;
        }
        this.isInitialized = false;
    },

    /**
     * 关闭 chat-widget（降低其 z-index 确保探索全屏模态框不被遮挡）
     */
    _hideChatWidget() {
        const win = document.getElementById('chat-widget-window');
        const toggle = document.getElementById('chat-widget-toggle');
        if (!toggle) return;
        // 记录原始 z-index
        if (!toggle.dataset.originalZIndex) {
            toggle.dataset.originalZIndex = window.getComputedStyle(toggle).zIndex;
        }
        // 收起聊天窗口
        win?.classList.remove('open');
        toggle.classList.remove('active');
        toggle.textContent = '💬';
        // 降低 toggle 层级到探索 modal 之下
        toggle.style.zIndex = '500';
    },

    /**
     * 恢复 chat-widget 的 z-index
     */
    _restoreChatWidget() {
        const win = document.getElementById('chat-widget-window');
        const toggle = document.getElementById('chat-widget-toggle');
        if (win?.dataset.zUnderExploration) {
            win.style.zIndex = '';
            delete win.dataset.zUnderExploration;
        }
        if (toggle?.dataset.zUnderExploration) {
            delete toggle.dataset.zUnderExploration;
        }
        if (toggle) {
            const original = toggle.dataset.originalZIndex || '11001';
            toggle.style.zIndex = original;
        }
    },

    /**
     * 清理残留的 .modal-backdrop，保证单层栈
     */
    _cleanupBackdrops() {
        const backdrops = document.querySelectorAll('.modal-backdrop');
        backdrops.forEach(bp => bp.parentNode && bp.parentNode.removeChild(bp));
        // Bootstrap 用 body { padding-right } 做滚动锁定，手动同步清理
        if (backdrops.length > 0) {
            document.body.classList.remove('modal-open');
            document.body.style.paddingRight = '';
        }
    },

    /**
     * 打开探索地图（由外部调用）
     */
    open() {
        const modal = document.getElementById('explorationModal');
        // 防御：如果模态框已经在显示中，直接返回防止重复打开
        if (modal && modal.classList.contains('show')) return;

        this.init();

        if (modal && window.bootstrap?.Modal) {
            // 防御性清理：移除所有残留 backdrop，保证单层栈
            this._cleanupBackdrops();
            // 强制关闭 chat-widget 并降低层级，防止遮挡探索全屏
            this._hideChatWidget();
            // 使用 getOrCreateInstance 避免多实例问题
            this.modalInstance = bootstrap.Modal.getOrCreateInstance(modal);
            this.modalInstance.show();
        }

        // 地图在模态框打开后渲染列表（invalidateSize 由 shown.bs.modal 处理）
        setTimeout(() => {
            this._renderLocationList();
        }, 300);

        EventBus.emit(EVENTS.EXPLORATION_OPEN);
    },

    /**
     * 关闭探索地图
     */
    close() {
        if (this.modalInstance) {
            this.modalInstance.hide();
        }
        // 恢复 chat-widget 的 z-index
        this._restoreChatWidget();
    },

    /**
     * 获取探索统计
     */
    getStats() {
        const locations = this.campusPOIs.length > 0
            ? this.campusPOIs
            : (StateManager.get('locations') || []);
        const discovered = StateManager.get('exploration.discovered_locations') || [];
        const discoveredCount = discovered.length;
        const total = locations.length;
        const percentage = total > 0 ? Math.round((discoveredCount / total) * 100) : 0;

        return {
            discovered: discoveredCount,
            total,
            percentage,
            undiscovered: total - discoveredCount
        };
    }
};

// 导出到全局
window.ExplorationMap = ExplorationMap;

// ============================================
// 页面加载时清理残留 backdrop
// 防止刷新后残留的 .modal-backdrop 导致整页灰屏
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    const backdrops = document.querySelectorAll('.modal-backdrop');
    backdrops.forEach(bp => bp.parentNode && bp.parentNode.removeChild(bp));
    document.body.classList.remove('modal-open', 'exploration-modal-open');
    document.body.style.paddingRight = '';
});
