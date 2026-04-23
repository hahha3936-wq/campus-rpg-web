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
    campusPOIs: [],      // 从 campus_pois.json 加载的地点数据（原始 WGS-84）
    campusPOIsGCJ: {},   // 地点 GCJ-02 坐标缓存 { id: { lat, lng } }，避免重复转换
    schematicLayer: null,  // 示意图叠图层
    _tileLayer: null,      // 当前底图瓦片层（高德或 OSM）
    _fallbackLayer: null,  // 高德瓦片加载失败时的 OSM 降级图层
    _currentTileSource: null,  // 当前实际使用的瓦片源（与 currentLayer 可能不同）
    currentLayer: 'amap', // 'amap' | 'osm' | 'tianditu' | 'geoq' | 'schematic' | 'hybrid'
    _tileLoadTimer: null,      // 瓦片加载超时计时器
    _tileErrorCount: 0,        // 当前瓦片层的连续错误计数（重置于 _doAddTileLayer 开头）
    _tileErrorWarned: false,   // 是否已提示过瓦片错误
    _consecutiveErrors: 0,     // 跨层级的连续错误（累积，不重置）
    _maxTileErrors: 10,        // 触发降级的连续错误阈值
    _currentNavTarget: null,    // 当前导航目标地点 ID
    _routeLoading: false,        // 路线计算中

    /**
     * 初始化探索地图
     */
    async init() {
        if (this.isInitialized) return;

        try {
            // 立即注册模态生命周期（不依赖 Leaflet，早于异步加载完成）
            this._bindModalLifecycle();

            // 加载 Leaflet + gcoord（等待加载完成后再初始化地图）
            await this._loadLeaflet();

            this._initMap();
            this._renderMarkers();
            this._bindLeafletEvents();
            this.isInitialized = true;
        } catch (err) {
            console.error('[ExplorationMap] 初始化出错:', err.message);
            this.isInitialized = false; // 允许重试
            throw err;
        }
    },

    /**
     * 延迟加载 Leaflet 和 gcoord 坐标转换库
     * 优先使用本地文件（lib/），CDN 作为 fallback
     * gcoord 必须在 Leaflet 之前加载完成，确保 CampusNavigation.toGCJ02 可用
     */
    _loadLeaflet() {
        return new Promise((resolve, reject) => {
            function loadScript(src, onLoad, onError) {
                if (document.querySelector(`script[src="${src}"]`)) {
                    // 已加载，直接回调
                    onLoad();
                    return;
                }
                const script = document.createElement('script');
                script.src = src;
                script.onload = onLoad;
                script.onerror = onError;
                document.head.appendChild(script);
            }
            function loadCSS(href) {
                if (document.querySelector(`link[href="${href}"]`)) return;
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = href;
                document.head.appendChild(link);
            }

            // 本地文件路径（优先）
            const localGcoord = 'lib/gcoord/gcoord.global.prod.js';
            const localLeafletCSS = 'lib/leaflet/leaflet.css';
            const localLeafletJS = 'lib/leaflet/leaflet.js';
            // CDN fallback 路径
            const cdnGcoord = 'https://unpkg.com/gcoord/dist/gcoord.global.prod.js';
            const cdnLeafletCSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            const cdnLeafletJS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

            // 先加载 gcoord，再加载 Leaflet
            loadScript(localGcoord, () => {
                CampusNavigation._gcoord = true;
                console.log('[ExplorationMap] gcoord 加载成功（本地）');
                loadCSS(localLeafletCSS);
                loadScript(localLeafletJS, resolve, () => {
                    // Leaflet 本地失败，尝试 CDN
                    console.warn('[ExplorationMap] Leaflet 本地加载失败，尝试 CDN');
                    loadCSS(cdnLeafletCSS);
                    loadScript(cdnLeafletJS, resolve, () => {
                        console.error('[ExplorationMap] Leaflet CDN 加载也失败');
                        reject(new Error('Leaflet 加载失败'));
                    });
                });
            }, () => {
                // gcoord 本地失败，尝试 CDN
                console.warn('[ExplorationMap] gcoord 本地加载失败，尝试 CDN');
                loadScript(cdnGcoord, () => {
                    CampusNavigation._gcoord = true;
                    console.log('[ExplorationMap] gcoord 加载成功（CDN）');
                    loadCSS(localLeafletCSS);
                    loadScript(localLeafletJS, resolve);
                }, () => {
                    // gcoord 完全失败，坐标不转换但地图继续
                    console.warn('[ExplorationMap] gcoord CDN 也失败，坐标将使用原始 WGS-84');
                    CampusNavigation._gcoord = false;
                    setTimeout(() => {
                        if (typeof window.showNotification === 'function') {
                            window.showNotification('坐标转换库加载失败，地图标记位置可能存在偏移', 'warning');
                        } else if (typeof showNotification === 'function') {
                            showNotification('坐标转换库加载失败，地图标记位置可能存在偏移', 'warning');
                        }
                    }, 1000);
                    loadCSS(localLeafletCSS);
                    loadScript(localLeafletJS, resolve);
                });
            });
        });
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
            if (!resp.ok) {
                console.warn(`[ExplorationMap] 加载 campus_bounds.json 失败，状态码: ${resp.status}，使用默认配置`);
            } else {
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
        // maxBoundsViscosity=0.8：允许轻微拖出边界，橡皮筋效果柔和拉回
        this.map = L.map('exploration-map-container', {
            center: [mapCenterGCJ.lat, mapCenterGCJ.lng],
            zoom: mapConfig.zoom,
            zoomControl: true,
            attributionControl: false
        });

        // 添加底图层（默认高德栅格瓦片，国内访问稳定；坐标统一用 GCJ-02）
        // 必须先初始化导航模块（加载高德 API Key），再设置底图瓦片 URL
        await CampusNavigation.init();
        this._setupTileLayer('amap');
        this.markersLayer = L.layerGroup().addTo(this.map);

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
     * 定位我的位置（由「回到我的位置」按钮调用）
     */
    _locateMe() {
        if (!this.map) return;
        const btn = document.getElementById('locate-me-btn');
        if (btn) btn.disabled = true;

        // 显示正在定位
        const originalText = btn ? btn.textContent : '';
        if (btn) btn.textContent = '定位中...';

        CampusNavigation.getCurrentPosition().then(userPos => {
            const accuracyLevel = CampusNavigation.getAccuracyLevel(userPos.accuracy);
            const accuracyText = userPos.accuracy ? `约 ${Math.round(userPos.accuracy)}m` : '未知';
            const sourceText = { gps: 'GPS', 'gps-low': 'GPS(低精度)', ip: 'IP定位', 'fallback-campus-center': '默认位置' }[userPos._source] || 'GPS';
            const onCampus = CampusNavigation.isOnCampusWithTolerance(userPos.lat, userPos.lng, userPos.accuracy);
            const locationHint = onCampus ? '校园内' : (userPos._city ? `当前位置: ${userPos._city}` : '校园外');

            // 显示通知
            showNotification(`定位成功 | ${sourceText} | 精度: ${accuracyText} (${accuracyLevel.text}) | ${locationHint}`, 'info', 3000);

            // 无论是否在校内都飞向该位置并显示标记
            this.map.flyTo([userPos.lat, userPos.lng], 17, { animate: true, duration: 1 });
            this._showUserMarker(userPos);
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText;
            }
        }).catch(err => {
            showNotification('定位失败：' + (err.message || '请检查定位权限'), 'warning');
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText;
            }
        });
    },

    /**
     * 切换地图瓦片源
     */
    switchTileSource(source) {
        if (!this.map) return;
        console.log('[ExplorationMap] 切换地图源:', source);
        this.currentLayer = source;
        this._setupTileLayer(source);
    },

    /**
     * 获取用户 GPS 位置并飞至该处
     * 即使不在校园内也显示位置标记（便于用户确认当前位置）
     */
    async _locateUser() {
        try {
            const pos = await CampusNavigation.getCurrentPosition();
            if (!pos) return;

            const accuracyLevel = CampusNavigation.getAccuracyLevel(pos.accuracy);
            const accuracyText = pos.accuracy ? `约 ${Math.round(pos.accuracy)}m` : '未知';
            const sourceText = { gps: 'GPS', 'gps-low': 'GPS(低精度)', ip: 'IP定位', 'fallback-campus-center': '默认位置' }[pos._source] || '未知';
            console.log(`[ExplorationMap] 定位成功 | 来源: ${sourceText} | 精度: ${accuracyText} (${accuracyLevel.text}) | 坐标: (${pos.lat?.toFixed(6)}, ${pos.lng?.toFixed(6)})`);

            // 判断是否在校内（使用宽容判断，考虑 GPS 精度误差）
            const onCampus = CampusNavigation.isOnCampusWithTolerance(pos.lat, pos.lng, pos.accuracy);
            if (onCampus) {
                console.log('[ExplorationMap] 用户位于校园内');
                this.map.flyTo([pos.lat, pos.lng], 17, { animate: true, duration: 1 });
            } else {
                // 即使不在校内，也显示位置（用户可能在校园附近）
                console.log('[ExplorationMap] 用户位于校园外或边界附近，仍显示位置标记');
                if (pos._hint) {
                    showNotification(`当前位置: ${pos._hint}`, 'info', 4000);
                }
                this.map.flyTo([pos.lat, pos.lng], 16, { animate: true, duration: 1 });
            }
            this._showUserMarker(pos);
        } catch (err) {
            console.warn('[ExplorationMap] GPS 定位失败:', err.message);
            showNotification('无法获取您的位置，请检查定位权限和GPS设置', 'warning');
        }
    },

    /**
     * 在地图上显示用户位置标记（带精度圈）
     */
    _showUserMarker(pos) {
        // 移除旧标记
        if (this._userMarker) {
            this.map.removeLayer(this._userMarker);
        }
        if (this._accuracyCircle) {
            this.map.removeLayer(this._accuracyCircle);
        }

        // pos 已是 GCJ-02 坐标（navigation.js 已转换）
        const accuracyLevel = CampusNavigation.getAccuracyLevel(pos.accuracy);

        // 添加精度圆圈（颜色根据精度等级）
        this._accuracyCircle = L.circle([pos.lat, pos.lng], {
            radius: pos.accuracy || 100,
            color: accuracyLevel.color,
            fillColor: accuracyLevel.color,
            fillOpacity: 0.15,
            weight: 1,
            dashArray: '4, 4'
        }).addTo(this.map);

        // 精度信息
        let accuracyText = pos.accuracy ? `约 ${Math.round(pos.accuracy)}m` : '未知';

        this._userMarker = L.circleMarker([pos.lat, pos.lng], {
            radius: 8,
            fillColor: accuracyLevel.color,
            fillOpacity: 0.9,
            color: '#fff',
            weight: 2,
            opacity: 1
        }).addTo(this.map);

        let popupContent = `<b>你的位置</b><br>`;
        const sourceText = { gps: 'GPS', 'gps-low': 'GPS(低精度)', ip: 'IP定位', 'fallback-campus-center': '默认位置', watch: '实时追踪' }[pos._source] || 'GPS';
        popupContent += `<small>来源: ${sourceText}</small><br>`;
        if (pos._wgs) {
            popupContent += `<small>GPS精度: ${accuracyText}</small><br>`;
            popupContent += `<small style="color:${accuracyLevel.color}">精度等级: ${accuracyLevel.text}</small>`;
        }
        if (pos._calibrated) {
            popupContent += `<br><small style="color:#22c55e">Wi-Fi校准: ${pos._wifi}</small>`;
        }
        if (pos._city) {
            popupContent += `<br><small>城市: ${pos._city}</small>`;
        }

        this._userMarker.bindPopup(popupContent).openPopup();
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
                userPos.accuracy = pos.coords.accuracy;
                userPos._source = 'watch';

                // 尝试 Wi-Fi 校准
                const calibratedPos = CampusNavigation.calibrateWithWifi(userPos);

                // 使用宽容判断：即使略在校外，也在 GPS 精度范围内显示
                const onCampus = CampusNavigation.isOnCampusWithTolerance(calibratedPos.lat, calibratedPos.lng, calibratedPos.accuracy);

                if (onCampus) {
                    if (this._userMarker) {
                        this._userMarker.setLatLng([calibratedPos.lat, calibratedPos.lng]);
                        // 同时更新精度圈
                        if (this._accuracyCircle) {
                            this._accuracyCircle.setLatLng([calibratedPos.lat, calibratedPos.lng]);
                            this._accuracyCircle.setRadius(calibratedPos.accuracy || 100);
                        }
                    } else {
                        this._showUserMarker(calibratedPos);
                    }
                } else {
                    // 校外在校园边界附近时，仍然显示但不触发通知
                    if (this._userMarker) {
                        this._userMarker.setLatLng([calibratedPos.lat, calibratedPos.lng]);
                        if (this._accuracyCircle) {
                            this._accuracyCircle.setLatLng([calibratedPos.lat, calibratedPos.lng]);
                            this._accuracyCircle.setRadius(calibratedPos.accuracy || 100);
                        }
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
        this._currentTileSource = null;
        if (this.schematicLayer) {
            this.map.removeLayer(this.schematicLayer);
            this.schematicLayer = null;
        }

        if (mode === 'amap') {
            this._setupTileLayer('amap');
        } else if (mode === 'osm') {
            this._setupTileLayer('osm');
        } else if (mode === 'tianditu') {
            this._setupTileLayer('tianditu');
        } else if (mode === 'geoq') {
            this._setupTileLayer('geoq');
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
     * 设置瓦片层（用户/UI 触发入口）
     * @param {'amap'|'osm'} type
     */
    _setupTileLayer(type) {
        // 清理旧底图层
        if (this._tileLayer) {
            this.map.removeLayer(this._tileLayer);
            this._tileLayer = null;
        }
        if (this._fallbackLayer) {
            this.map.removeLayer(this._fallbackLayer);
            this._fallbackLayer = null;
        }
        if (this._tileLoadTimer) {
            clearTimeout(this._tileLoadTimer);
            this._tileLoadTimer = null;
        }

        // 优先探测用户选择的瓦片源，失败后再按降级链切换
        this._autoSelectAndAddTileLayer(type);
    },

    /**
     * 探测瓦片源是否可达（多位置探测，更稳定）
     */
    _probeSource(source) {
        const tileConfigs = {
            tianditu: {
                url: 'https://t{s}.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TileCol={x}&TileRow={y}&TileMatrix={z}&tk=a5a575082271807059c6e581b8eaf937',
                subdomains: '0,1,2,3,4,5,6,7'
            },
            geoq: {
                url: 'https://map.geoq.cn/ArcGIS/rest/services/ChinaOnlineCommunity_Mapping/MapServer/tile/{z}/{y}/{x}',
                subdomains: ''
            },
            amap: {
                // 通过后端代理探测
                url: '/api/tile/amap?x={x}&y={y}&z={z}',
                subdomains: ''
            },
            osm: {
                url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                subdomains: ''
            },
            tencent: {
                url: 'https://p2.map.gtimg.com/maptilesv2/{z}/{x}/{y}.png',
                subdomains: ''
            }
        };
        // 多位置探测，提高稳定性
        const probePositions = [
            { z: 10, x: 500, y: 300 },
            { z: 12, x: 1250, y: 750 }
        ];
        let successCount = 0;
        const requiredSuccess = 1;

        return new Promise((resolve) => {
            const cfg = tileConfigs[source];
            if (!cfg) { resolve(false); return; }

            const checkComplete = () => {
                if (successCount >= requiredSuccess) {
                    resolve(true);
                } else {
                    resolve(false);
                }
            };

            probePositions.forEach((pos, idx) => {
                const testUrl = cfg.url
                    .replace('{x}', pos.x).replace('{y}', pos.y).replace('{z}', pos.z)
                    .replace('{s}', '0');
                const img = new Image();
                const timer = setTimeout(() => {
                    if (idx === probePositions.length - 1) checkComplete();
                }, 3000);
                img.onload = () => {
                    clearTimeout(timer);
                    successCount++;
                    if (successCount >= requiredSuccess) checkComplete();
                };
                img.onerror = () => {
                    clearTimeout(timer);
                    if (idx === probePositions.length - 1) checkComplete();
                };
                img.src = testUrl + '&t=' + Date.now();
            });
        });
    },

    /**
     * 自动选择并添加瓦片图层
     * @param {string} preferredSource - 用户/默认指定的首选源
     */
    async _autoSelectAndAddTileLayer(preferredSource) {
        const container = document.getElementById('exploration-map-container');

        // OSM 直接使用
        if (preferredSource === 'osm') {
            console.log('[ExplorationMap] 使用 OpenStreetMap 瓦片');
            this._currentTileSource = 'osm';
            this._doAddTileLayer('osm', container);
            return;
        }

        // 高优先级探测列表（按可靠性排序，amap 最稳定）
        const probeOrder = ['amap', 'tianditu', 'tencent', 'geoq'];

        for (let i = 0; i < probeOrder.length; i++) {
            const source = probeOrder[i];
            const isAvailable = await this._probeSource(source);
            if (isAvailable) {
                console.log(`[ExplorationMap] 探测成功，使用 ${source} 瓦片`);
                this._currentTileSource = source;
                this._doAddTileLayer(source, container);
                return;
            }
            console.warn(`[ExplorationMap] ${source} 不可用，尝试下一个...`);
        }

        // 所有在线瓦片均失败，降级到 amap（最稳定，直接使用不做探测）
        console.warn('[ExplorationMap] 所有在线瓦片探测均失败，降级到 amap');
        this._currentTileSource = 'amap';
        this._doAddTileLayer('amap', container);
    },

    /**
     * 实际添加瓦片图层（内部方法，由 _autoSelectAndAddTileLayer 调用）
     */
    _doAddTileLayer(source, container) {
        const tileConfigs = {
            tianditu: {
                url: 'https://t{s}.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TileCol={x}&TileRow={y}&TileMatrix={z}&tk=a5a575082271807059c6e581b8eaf937',
                subdomains: '0,1,2,3,4,5,6,7',
                attribution: '© 天地图',
                opacity: 1
            },
            geoq: {
                url: 'https://map.geoq.cn/ArcGIS/rest/services/ChinaOnlineCommunity_Mapping/MapServer/tile/{z}/{y}/{x}',
                subdomains: '',
                attribution: '© GeoQ / Esri China',
                opacity: 1
            },
            amap: {
                // 通过后端代理，解决 CORS 和认证问题
                url: '/api/tile/amap?x={x}&y={y}&z={z}',
                subdomains: '',
                attribution: '© 高德地图',
                opacity: 1
            },
            osm: {
                url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                subdomains: '',
                attribution: '© OpenStreetMap contributors',
                opacity: 1
            },
            tencent: {
                url: 'https://p2.map.gtimg.com/maptilesv2/{z}/{x}/{y}.png',
                subdomains: '',
                attribution: '© 腾讯地图',
                opacity: 1
            }
        };

        // 降级链：按可靠性排序，确保每层都有可用 fallback
        // 重要：OSM 使用 WGS-84 坐标系，与其他底图（GCJ-02）不一致，
        // 不将其加入自动降级链，避免 POI 坐标（GCJ-02）与底图（WGS-84）不匹配导致偏移
        // OSM 仍作为用户手动选择的底图选项保留（用户需注意坐标系差异）
        const fallbackChain = {
            tianditu: ['amap', 'tencent', 'geoq'],
            geoq:     ['amap', 'tencent', 'tianditu'],
            amap:     ['tencent', 'tianditu', 'geoq'],
            osm:      ['amap', 'tencent', 'geoq', 'tianditu'],  // OSM 降级到 GCJ-02 底图
            tencent:  ['amap', 'tianditu', 'geoq']
        };

        const cfg = tileConfigs[source];
        if (!cfg) return;

        this._hideTileLoadError(container);

        // 清理旧的底图层
        if (this._tileLayer) {
            this._tileLayer.remove();
            this._tileLayer = null;
        }
        if (this._tileLoadTimer) {
            clearTimeout(this._tileLoadTimer);
            this._tileLoadTimer = null;
        }

        // 重置当前层的错误计数
        this._tileErrorCount = 0;
        this._tileErrorWarned = false;

        this._tileLayer = L.tileLayer(cfg.url, {
            subdomains: cfg.subdomains,
            maxZoom: 19,
            minZoom: 14,
            attribution: cfg.attribution,
            opacity: cfg.opacity,
            keepBuffer: 5,
            updateWhenIdle: true,
            updateWhenZooming: true,
            keepOnMinZoom: true,
            noWrap: true,
            retry: true,
            zIndex: 1,
            preload: 1
        }).addTo(this.map);

        // 标记加载开始
        this._tileLoadStarted = false;

        // 监听瓦片加载事件
        this._tileLayer.on('loading', () => {
            if (!this._tileLoadStarted) {
                this._tileLoadStarted = true;
                this._showTileLoadingIndicator();
            }
        });
        this._tileLayer.on('load', () => {
            this._tileLoadStarted = false;
            this._hideTileLoadingIndicator();
        });

        // 首块瓦片加载成功后清理背景和错误提示
        this._tileLayer.once('load', () => {
            if (container) {
                container.style.background = '';
                this._hideTileLoadError(container);
            }
        });

        // 降级函数：清理当前层，切换到下一个源
        const doFallback = () => {
            const fallbacks = fallbackChain[source] || [];
            if (fallbacks.length > 0) {
                const next = fallbacks[0];
                console.warn(`[ExplorationMap] ${source} 瓦片加载失败，降级到 ${next}`);
                this._currentTileSource = next;
                this._doAddTileLayer(next, container);
            } else {
                console.warn('[ExplorationMap] 所有在线瓦片加载失败，使用离线示意图');
                if (container) container.style.background = '';
                this._loadSchematicAsBaseLayer();
            }
        };

        // 超时降级：20 秒内瓦片未加载完成则自动切换到下一个源
        this._tileLoadTimer = setTimeout(() => {
            if (this._tileLoadTimer === null) return;
            this._tileLoadTimer = null;
            if (this._tileLayer) {
                this._tileLayer.remove();
                this._tileLayer = null;
            }
            this._preloadSchematic();
            doFallback();
        }, 20000);

        // 监听瓦片加载事件（成功时重置错误计数）
        this._tileLayer.on('tileload', () => {
            // 成功加载一块瓦片，清除错误累积（允许瓦片自我修复，不轻易降级）
            if (this._consecutiveErrors > 0) {
                this._consecutiveErrors = Math.max(0, this._consecutiveErrors - 2);
            }
        });

        // 监听瓦片错误，超过阈值则降级
        this._tileLayer.on('tileerror', (e) => {
            this._tileErrorCount++;
            this._consecutiveErrors++;
            console.warn(`[ExplorationMap] 瓦片错误 #${this._tileErrorCount} (总累计: ${this._consecutiveErrors}): ${e.tile?.src_ || ''}`);

            // 单个瓦片失败时：自动重试（Leaflet retry:true 会自动重试，额外触发一次重绘）
            if (this._tileErrorCount < this._maxTileErrors) {
                setTimeout(() => {
                    if (this._tileLayer) this._tileLayer.redraw();
                }, 1500);
            }

            // 连续错误超过阈值时，降级到备用源（仅在真的持续失败时降级）
            if (this._consecutiveErrors >= this._maxTileErrors) {
                console.warn(`[ExplorationMap] 错误次数超过阈值(${this._maxTileErrors})，降级到备用瓦片`);
                if (this._tileLoadTimer) { clearTimeout(this._tileLoadTimer); this._tileLoadTimer = null; }
                if (this._tileLayer) { this._tileLayer.remove(); this._tileLayer = null; }
                doFallback();
            }
        });
    },

    /**
     * 预加载当前视口周围的瓦片，减少拖动时的空白闪烁
     */
    _preloadViewportTiles() {
        if (!this._tileLayer || !this.map) return;
        // 延迟预加载，让初始瓦片先完成渲染
        // 注意：不要调用 _pruneTiles()，它会强制移除仍在视口内的瓦片导致闪烁
        setTimeout(() => {
            if (this._tileLayer) {
                this._tileLayer._pruneTiles();
            }
        }, 2000);
    },

    _showTileLoadError(container, message) {
        if (!container) return;
        const isOfflineMode = message && message.includes('离线模式');
        let el = container.querySelector('.tile-load-error');
        if (!el) {
            el = document.createElement('div');
            el.className = 'tile-load-error';
            container.appendChild(el);
        }
        // 离线模式使用 info 样式，不遮挡地图
        el.className = isOfflineMode ? 'tile-load-error offline-mode' : 'tile-load-error';
        el.textContent = message;
        // 离线模式 5 秒后自动隐藏提示（地图正常显示，无需持续提示）
        if (isOfflineMode) {
            setTimeout(() => {
                if (el && el.parentNode && el.textContent === message) {
                    el.style.opacity = '0';
                    setTimeout(() => { if (el && el.parentNode) el.remove(); }, 300);
                }
            }, 5000);
        }

        // 添加重试按钮
        if (!el.querySelector('.retry-btn')) {
            const retryBtn = document.createElement('button');
            retryBtn.className = 'retry-btn';
            retryBtn.textContent = '重试加载';
            retryBtn.onclick = () => {
                el.textContent = '正在重新加载...';
                el.classList.add('loading');
                // 移除现有瓦片层，重新尝试加载
                if (this._tileLayer) {
                    this.map.removeLayer(this._tileLayer);
                    this._tileLayer = null;
                }
                this._setupTileLayer('amap');
                setTimeout(() => el.classList.remove('loading'), 500);
            };
            el.appendChild(document.createElement('br'));
            el.appendChild(retryBtn);
        }
    },

    _hideTileLoadError(container) {
        if (!container) return;
        const el = container.querySelector('.tile-load-error');
        if (el) el.remove();
    },

    /**
     * 显示瓦片加载指示器（减少空白闪烁的视觉反馈）
     */
    _showTileLoadingIndicator() {
        const container = document.getElementById('exploration-map-container');
        if (!container) return;
        let el = container.querySelector('.tile-loading-indicator');
        if (!el) {
            el = document.createElement('div');
            el.className = 'tile-loading-indicator';
            el.innerHTML = '<span class="loading-dots"></span>';
            container.appendChild(el);
        }
        el.classList.add('active');
    },

    /**
     * 隐藏瓦片加载指示器
     */
    _hideTileLoadingIndicator() {
        const container = document.getElementById('exploration-map-container');
        if (!container) return;
        const el = container.querySelector('.tile-loading-indicator');
        if (el) el.classList.remove('active');
    },

    _preloadSchematic() {
        if (this._schematicPreloaded) return;
        this._schematicPreloaded = true;
        ['assets/maps/campus_schematic.png', 'assets/maps/campus_schematic.svg'].forEach(url => {
            const img = new Image();
            img.src = url;
        });
    },

    /**
     * 将校园示意图作为独立底图显示（所有在线瓦片失败时的最终降级）
     */
    async _loadSchematicAsBaseLayer() {
        if (this.schematicLayer) {
            this.map.removeLayer(this.schematicLayer);
            this.schematicLayer = null;
        }
        // 优先尝试 PNG，降级 SVG
        const pngOk = await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            img.src = 'assets/maps/campus_schematic.png?t=' + Date.now();
        });
        const url = pngOk ? 'assets/maps/campus_schematic.png' : 'assets/maps/campus_schematic.svg';

        try {
            const resp = await fetch('data/campus_bounds.json');
            if (!resp.ok) throw new Error('加载 bounds 失败');
            const boundsData = await resp.json();
            const pts = boundsData.image_overlay?.gcs_points;
            if (!pts || pts.length < 4) throw new Error('控制点数据不完整');

            // GCS 控制点为 WGS-84，高德底图为 GCJ-02，需转换
            const useGCJ = CampusNavigation._gcoord;
            const toLatLng = (pt) => {
                const gcj = useGCJ ? CampusNavigation.toGCJ02(pt.lng, pt.lat) : [pt.lng, pt.lat];
                return L.latLng(gcj[1], gcj[0]);
            };
            const converted = pts.map(toLatLng);
            const lats = converted.map(p => p.lat);
            const lngs = converted.map(p => p.lng);
            const bounds = L.latLngBounds(
                L.latLng(Math.min(...lats), Math.min(...lngs)),
                L.latLng(Math.max(...lats), Math.max(...lngs))
            );

            this.schematicLayer = L.imageOverlay(url, bounds, { opacity: 1 });
            this.schematicLayer.addTo(this.map);

            const container = document.getElementById('exploration-map-container');
            if (container) {
                this._hideTileLoadError(container);
                this._showTileLoadError(container, '离线模式：显示校园示意图');
            }
            console.log('[ExplorationMap] 离线示意图加载成功:', url);
        } catch (err) {
            console.warn('[ExplorationMap] 离线示意图加载失败:', err.message);
            const container = document.getElementById('exploration-map-container');
            if (container) {
                this._hideTileLoadError(container);
                this._showTileLoadError(container, '地图加载失败，请检查网络连接');
            }
        }
    },

    _showSchematicOverlayOffline() {
        if (this.schemematicLayer) {
            this.map.removeLayer(this.schemematicLayer);
            this.schematicLayer = null;
        }
        const container = document.getElementById('exploration-map-container');
        if (container) {
            this._showTileLoadError(container, '离线模式：显示校园示意图');
        }
        this._loadSchematicOverlay();
    },

    /**
     * 加载校园 POI 数据
     */
    async _loadCampusPOIs() {
        try {
            const resp = await fetch('data/campus_pois.json');
            if (!resp.ok) {
                console.warn(`[ExplorationMap] 加载 campus_pois.json 失败，状态码: ${resp.status}`);
                // 尝试使用 StateManager 中的缓存数据
                const cachedLocations = StateManager.get('locations') || [];
                if (cachedLocations.length > 0) {
                    this.campusPOIs = cachedLocations;
                    this.campusPOIsGCJ = {};
                    cachedLocations.forEach(loc => {
                        if (loc?.position?.lat && loc?.position?.lng) {
                            this.campusPOIsGCJ[loc.id] = CampusNavigation.toGCJ02(
                                loc.position.lng, loc.position.lat
                            );
                        }
                    });
                    console.log(`[ExplorationMap] 使用缓存的 ${this.campusPOIs.length} 个地点数据`);
                }
                return;
            }
            const data = await resp.json();
            this.campusPOIs = data.pois || [];
            // 一次性预转换并缓存 GCJ-02 坐标，避免每次渲染时重复转换
            this.campusPOIsGCJ = {};
            this.campusPOIs.forEach(loc => {
                if (loc?.position?.lat && loc?.position?.lng) {
                    this.campusPOIsGCJ[loc.id] = CampusNavigation.toGCJ02(
                        loc.position.lng, loc.position.lat
                    );
                }
            });
            console.log(`[ExplorationMap] 加载 ${this.campusPOIs.length} 个 POI，坐标已预转换至 GCJ-02`);
            // 始终同步 POI 数据到 StateManager（覆盖旧版 locations.json 数据）
            StateManager.set('locations', this.campusPOIs);
            if (this.campusPOIs.length > 0) {
                console.log(`[ExplorationMap] 已同步 ${this.campusPOIs.length} 个 POI 到 StateManager`);
            }
        } catch (err) {
            console.warn('[ExplorationMap] 加载 campus_pois.json 失败:', err.message);
            // 网络错误时也尝试使用缓存
            const cachedLocations = StateManager.get('locations') || [];
            if (cachedLocations.length > 0) {
                this.campusPOIs = cachedLocations;
                this.campusPOIsGCJ = {};
                cachedLocations.forEach(loc => {
                    if (loc?.position?.lat && loc?.position?.lng) {
                        this.campusPOIsGCJ[loc.id] = CampusNavigation.toGCJ02(
                            loc.position.lng, loc.position.lat
                        );
                    }
                });
                console.log(`[ExplorationMap] 网络错误，使用缓存的 ${this.campusPOIs.length} 个地点数据`);
            }
        }
    },

    /**
     * 渲染所有地点标记
     */
    _renderMarkers() {
        if (!this.map || !this.markersLayer) return;

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
            const lat = loc.position.lat, lng = loc.position.lng;
            if (lat < 31.87 || lat > 31.89 || lng < 117.27 || lng > 117.30) {
                console.warn(`地点坐标超出校园范围 [${loc.id}]: (${lat}, ${lng})`);
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

            // 直接使用预缓存的 GCJ-02 坐标（由 _loadCampusPOIs 一次性转换）
            // 无论哪种底图，所有 POI 均使用 GCJ-02 坐标渲染
            const gcj = this.campusPOIsGCJ[loc.id];
            const markerLatLng = gcj || { lng: loc.position.lng, lat: loc.position.lat };
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
            if (!resp.ok) {
                console.warn(`[ExplorationMap] 加载 campus_bounds.json 失败，状态码: ${resp.status}`);
                return;
            }
            const boundsData = await resp.json();
            const pts = boundsData.image_overlay?.gcs_points;
            if (!pts || pts.length < 4) {
                console.warn('[ExplorationMap] 示意图控制点数据不完整');
                return;
            }

            // GCS 控制点为 WGS-84，但高德底图为 GCJ-02，需转换以正确对齐
            const useGCJ = this.currentLayer === 'amap' || this.currentLayer === 'hybrid';
            const toGCJ = (pt) => {
                if (!useGCJ) return pt;
                return CampusNavigation.toGCJ02(pt.lng, pt.lat);
            };
            const converted = pts.map(toGCJ);
            const lats = converted.map(p => p.lat);
            const lngs = converted.map(p => p.lng);
            const sw = L.latLng(Math.min(...lats), Math.min(...lngs));
            const ne = L.latLng(Math.max(...lats), Math.max(...lngs));
            const bounds = L.latLngBounds(sw, ne);

            // 优先尝试 PNG，不存在则降级到 SVG
            const url = 'assets/maps/campus_schematic.png';
            const opacity = transparent ? 0.45 : 0.9;

            this.schematicLayer = L.imageOverlay(url, bounds, { opacity });
            this.schematicLayer.addTo(this.map);

            // 监听图片加载错误，自动降级到 SVG
            this.schematicLayer.on('error', () => {
                console.warn('[ExplorationMap] PNG 示意图加载失败，尝试 SVG 备选');
                this.map.removeLayer(this.schematicLayer);
                const svgUrl = 'assets/maps/campus_schematic.svg';
                this.schematicLayer = L.imageOverlay(svgUrl, bounds, { opacity });
                this.schematicLayer.addTo(this.map);
                this.schematicLayer.once('load', () => {
                    console.log('[ExplorationMap] SVG 示意图加载成功');
                });
            });
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

        if (!locations || locations.length === 0) {
            console.error('[ExplorationMap] _activateBuff: no locations available');
            if (typeof window.showNotification === 'function') {
                window.showNotification('地图数据未加载，请刷新页面重试', 'warning');
            } else {
                alert('地图数据未加载，请刷新页面重试');
            }
            return;
        }

        const location = locations.find(l => l.id === locationId);

        if (!location) {
            console.error('[ExplorationMap] _activateBuff: location not found:', locationId);
            if (typeof window.showNotification === 'function') {
                window.showNotification('未找到该地点，请重新点击地图标记', 'warning');
            }
            return;
        }

        if (!location.buff) {
            console.warn('[ExplorationMap] _activateBuff: location has no buff:', locationId);
            if (typeof window.showNotification === 'function') {
                window.showNotification('此处暂无可探索的Buff内容', 'info');
            }
            return;
        }

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
            const e6 = parseMatch(raw, '经验', 'exp');
            if (e6) effects.exp = e6.val;
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

        if (typeof window.showNotification === 'function') {
            window.showNotification('获得 Buff：' + location.buff.name + '！', 'success');
        }
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
        // 直接转换坐标（gcoord 已确保在探索地图初始化时加载）
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

    /** XSS 防护：转义 HTML 特殊字符 */
    _escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
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
        if (!modal) {
            console.warn('[ExplorationMap] #explorationModal 元素未找到，模态框功能将不可用');
            return;
        }

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
            // 地图尺寸修正：立即触发一次，再延迟多次重试（防止模态动画期间容器尺寸仍为 0）
            if (this.map) {
                this.map.invalidateSize({ animate: false });
                setTimeout(() => { if (this.map) this.map.invalidateSize({ animate: false }); }, 300);
                setTimeout(() => { if (this.map) this.map.invalidateSize({ animate: false }); }, 600);
                setTimeout(() => { if (this.map) this.map.invalidateSize({ animate: false }); }, 1000);
            }
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
        if (this._accuracyCircle) {
            this.map.removeLayer(this._accuracyCircle);
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
    async open() {
        const modal = document.getElementById('explorationModal');
        if (modal && modal.classList.contains('show')) return;

        // 防止重复初始化时静默卡住
        const initPromise = this.isInitialized ? Promise.resolve() : this.init();
        let initError = null;
        await initPromise.catch(err => { initError = err; });

        if (initError) {
            console.error('[ExplorationMap] 初始化失败:', initError.message);
            showNotification('地图加载失败，请刷新页面重试', 'error');
            return;
        }

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
