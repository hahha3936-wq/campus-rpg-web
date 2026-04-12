/**
 * 校园RPG - 校园导航模块
 * 基于高德地图 Web API（REST API + Web 端导航页双模式）
 * 支持路径规划、路线展示、实时距离计算
 */

function _navApiUrl(path) {
    return typeof window.apiUrl === 'function' ? window.apiUrl(path) : path;
}

const CampusNavigation = {
    // 高德地图 Web API Key（运行时从后端配置注入）
    API_KEY: '',

    // 学校中心点（WGS84）
    SCHOOL_CENTER: { lng: 117.2870, lat: 31.8835 },

    // 校园边界（用于判断是否在校内）
    CAMPUS_BOUNDS: {
        north: 31.8860, south: 31.8815,
        west: 117.2825, east: 117.2910
    },

    // 用户当前位置（GPS）
    _userPosition: null,
    // 缓存的路线对象
    _cachedRoute: null,
    _cachedDestination: null,
    // 路线图层引用
    _routeLayer: null,
    // 高德坐标系转换器（已加载时使用）
    _gcoord: null,

    // ============================================
    // 初始化：从后端加载 API Key
    // ============================================
    async init() {
        if (this.API_KEY) return; // 已有 Key 不重复加载
        try {
            const resp = await fetch(_navApiUrl('/api/config'));
            if (resp.ok) {
                const cfg = await resp.json();
                if (cfg.amap_api_key) {
                    this.API_KEY = cfg.amap_api_key;
                    console.log('[CampusNavigation] 高德 API Key 加载成功');
                }
            }
        } catch {
            console.warn('[CampusNavigation] 无法从后端获取配置，API Key 为空');
        }
    },

    // ============================================
    // 坐标转换：WGS84 → GCJ-02（高德/腾讯地图坐标系）
    // ============================================
    toGCJ02(lng, lat) {
        if (window.gcoord && this._gcoord !== false) {
            try {
                const result = gcoord.transform([lng, lat], gcoord.WGS84, gcoord.GCJ02);
                return { lng: result[0], lat: result[1] };
            } catch {
                this._gcoord = false;
            }
        }
        return { lng, lat };
    },

    // ============================================
    // 打开高德地图 Web 步行导航页（备用：唤起手机端 App）
    // ============================================
    navigateTo(lng, lat, name) {
        if (!this.API_KEY) {
            showNotification('高德地图 API Key 未配置，请在 .env 中设置 AMAP_API_KEY', 'error');
            return;
        }

        // 优先使用用户 GPS 位置作为起点，无则用学校中心点
        const userPos = this._userPosition || this.SCHOOL_CENTER;
        const schoolGCJ = this.toGCJ02(userPos.lng, userPos.lat);
        const destGCJ = this.toGCJ02(lng, lat);

        // 高德地图步行导航 URL（带密钥）
        const url = `https://restapi.amap.com/v5/direction/walking?key=${this.API_KEY}` +
            `&origin=${schoolGCJ.lng},${schoolGCJ.lat}` +
            `&destination=${destGCJ.lng},${destGCJ.lat}` +
            `&show=1`;

        // 同时提供高德 Web 端链接（体验更完整）
        const webUrl = `https://restapi.amap.com/v3/direction/walking?origin=${schoolGCJ.lng},${schoolGCJ.lat}` +
            `&destination=${destGCJ.lng},${destGCJ.lat}` +
            `&key=${this.API_KEY}`;

        // 优先尝试调用高德地图 App 端（移动端）
        const amapAppUrl = `amap://path?sourceApplication=campus-rpg` +
            `&slat=${schoolGCJ.lat}&slon=${schoolGCJ.lng}` +
            `&dlat=${destGCJ.lat}&dlon=${destGCJ.lng}` +
            `&dname=${encodeURIComponent(name || '目的地')}` +
            `&dev=1`;

        // 检测是否为移动端
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

        if (isMobile) {
            // 移动端：尝试打开高德 App，不支持则打开 Web 链接
            const opened = window.open(amapAppUrl, '_blank');
            // 若打开失败（被浏览器拦截），fallback 到 webUrl
            setTimeout(() => {
                if (!opened || opened.closed) {
                    window.open(webUrl, '_blank');
                }
            }, 800);
        } else {
            // 桌面端：打开高德 Web 端步行导航页面
            window.open(webUrl, '_blank');
        }
    },

    // ============================================
    // 计算两点间直线距离（米，Haversine 公式）
    // ============================================
    getDistance(from, to) {
        const R = 6371000;
        const dLat = this._toRad(to.lat - from.lat);
        const dLng = this._toRad(to.lng - from.lng);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this._toRad(from.lat)) * Math.cos(this._toRad(to.lat)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },

    // ============================================
    // 获取到达各地点的距离列表（直线距离，排序）
    // ============================================
    getDistances(locations) {
        return locations.map(loc => ({
            ...loc,
            distance: loc.position
                ? Math.round(this.getDistance(this.SCHOOL_CENTER, { lng: loc.position.lng, lat: loc.position.lat }))
                : null
        })).sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
    },

    // ============================================
    // 高德地图步行路径规划（通过后端代理避免 CORS）
    // ============================================
    async calculateRoute(fromLng, fromLat, toLng, toLat) {
        if (!this.API_KEY) {
            console.warn('[CampusNavigation] API Key 未配置，使用直线距离');
            return null;
        }

        const fromGCJ = this.toGCJ02(fromLng, fromLat);
        const toGCJ = this.toGCJ02(toLng, toLat);

        try {
            const resp = await fetch(_navApiUrl(`/api/navigation/route?from=${fromGCJ.lng},${fromGCJ.lat}&to=${toGCJ.lng},${toGCJ.lat}`));
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            return data;
        } catch (err) {
            console.warn('[CampusNavigation] 路径规划失败:', err.message);
            return null;
        }
    },

    // ============================================
    // 在 Leaflet 地图上绘制路线（叠图层）
    // ============================================
    showRoute(routeData, mapInstance) {
        if (!mapInstance || !routeData) return;

        // 清除旧路线
        this.clearRoute(mapInstance);

        if (!routeData.steps || routeData.steps.length === 0) return;

        // 构建 Polyline 坐标（每步的终点连线）
        const latlngs = [];
        routeData.steps.forEach(step => {
            if (step.polyline) {
                const pts = step.polyline.split(';');
                pts.forEach(pt => {
                    const [ln, la] = pt.split(',').map(Number);
                    if (!isNaN(ln) && !isNaN(la)) latlngs.push([la, ln]);
                });
            }
        });

        if (latlngs.length < 2) return;

        // 高德蓝色路线样式
        this._routeLayer = L.polyline(latlngs, {
            color: '#1E90FF',
            weight: 5,
            opacity: 0.85,
            dashArray: null,
            lineJoin: 'round'
        }).addTo(mapInstance);

        // 添加起点/终点标记
        if (routeData.origin) {
            const [olng, olat] = routeData.origin.split(',').map(Number);
            L.marker([olat, olng], {
                icon: L.divIcon({
                    html: '<div style="width:12px;height:12px;background:#38b764;border-radius:50%;border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,0.4);"></div>',
                    className: '',
                    iconSize: [12, 12],
                    iconAnchor: [6, 6]
                })
            }).addTo(mapInstance);
        }
        if (routeData.destination) {
            const [dlng, dlat] = routeData.destination.split(',').map(Number);
            L.marker([dlat, dlng], {
                icon: L.divIcon({
                    html: '<div style="width:12px;height:12px;background:#ef4444;border-radius:50%;border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,0.4);"></div>',
                    className: '',
                    iconSize: [12, 12],
                    iconAnchor: [6, 6]
                })
            }).addTo(mapInstance);
        }

        // 自动调整视野以显示完整路线
        mapInstance.fitBounds(this._routeLayer.getBounds(), { padding: [60, 60] });

        return this._routeLayer;
    },

    // ============================================
    // 清除地图上的路线图层
    // ============================================
    clearRoute(mapInstance) {
        if (this._routeLayer && mapInstance) {
            mapInstance.removeLayer(this._routeLayer);
            this._routeLayer = null;
        }
    },

    // ============================================
    // 高德步行距离 + 时间查询（通过后端代理）
    // ============================================
    async getWalkingDistance(fromLng, fromLat, toLng, toLat) {
        if (!this.API_KEY) {
            return null;
        }

        const fromGCJ = this.toGCJ02(fromLng, fromLat);
        const toGCJ = this.toGCJ02(toLng, toLat);

        try {
            const resp = await fetch(_navApiUrl(`/api/navigation/distance?from=${fromGCJ.lng},${fromGCJ.lat}&to=${toGCJ.lng},${toGCJ.lat}`));
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            return await resp.json();
        } catch {
            return null;
        }
    },

    // ============================================
    // 判断坐标是否在校园范围内（校内导航优化）
    // ============================================
    isOnCampus(lat, lng) {
        const b = this.CAMPUS_BOUNDS;
        return lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
    },

    // ============================================
    // 用户 GPS 定位（使用 Geolocation API）
    // ============================================
    getCurrentPosition() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('浏览器不支持定位'));
                return;
            }
            navigator.geolocation.getCurrentPosition(
                pos => {
                    // GPS 返回的坐标为 WGS-84，高德底图为 GCJ-02，需转换坐标系
                    const wgsPos = {
                        lng: pos.coords.longitude,
                        lat: pos.coords.latitude,
                        accuracy: pos.coords.accuracy
                    };
                    this._userPosition = this.toGCJ02(wgsPos.lng, wgsPos.lat);
                    this._userPosition.accuracy = wgsPos.accuracy;
                    this._userPosition._wgs = wgsPos; // 保留原始 WGS 坐标，外部使用 GCJ 坐标
                    resolve(this._userPosition);
                },
                err => reject(err),
                { enableHighAccuracy: true, timeout: 10000 }
            );
        });
    },

    // ============================================
    // 格式化距离为可读文本
    // ============================================
    formatDistance(meters) {
        if (meters === null || meters === undefined) return '未知';
        if (meters < 1000) return `${Math.round(meters)}m`;
        return `${(meters / 1000).toFixed(1)}km`;
    },

    // ============================================
    // 格式化时间为可读文本
    // ============================================
    formatDuration(seconds) {
        if (!seconds) return '未知';
        if (seconds < 60) return `${Math.round(seconds)}秒`;
        const m = Math.floor(seconds / 60);
        const h = Math.floor(m / 60);
        if (h > 0) return `${h}小时${m % 60}分钟`;
        return `${m}分钟`;
    },

    // ============================================
    // 更新用户位置（供探索地图调用）
    // ============================================
    setUserPosition(lat, lng) {
        this._userPosition = { lng, lat };
    },

    _toRad(deg) {
        return deg * Math.PI / 180;
    }
};

// 挂载到全局
window.CampusNavigation = CampusNavigation;
