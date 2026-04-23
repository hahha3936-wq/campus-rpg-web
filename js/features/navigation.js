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

    // 学校中心点（WGS84）— 合肥财经职业学院（方兴大道998号）
    SCHOOL_CENTER: { lng: 117.1706, lat: 31.7587 },

    // 校园边界（用于判断是否在校内）
    // 注意：原始坐标为 WGS-84，GPS 返回的 WGS-84 坐标可直接用此判断
    // 若要对 GCJ-02 坐标判断，需先将 bounds 也转换为 GCJ-02
    CAMPUS_BOUNDS: {
        north: 31.7615, south: 31.7555,
        west: 117.1680, east: 117.1740
    },
    // GCJ-02 坐标系下的校园边界（由 WGS-84 bounds 转换而来）
    CAMPUS_BOUNDS_GCJ: null,

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
    // 校园 Wi-Fi 热点位置数据（用于辅助定位校准）
    // ============================================
    CAMPUS_WIFI_HOTSPOTS: [
        { ssid: 'STU', lat: 31.8835, lng: 117.2860, area: '教学楼A区' },
        { ssid: 'TEA', lat: 31.8840, lng: 117.2870, area: '教学楼B区' },
        { ssid: 'LIB', lat: 31.8850, lng: 117.2855, area: '图书馆' },
        { ssid: 'CANTEEN', lat: 31.8825, lng: 117.2880, area: '食堂' },
        { ssid: 'DORM', lat: 31.8818, lng: 117.2900, area: '宿舍区' },
        { ssid: 'SPORT', lat: 31.8845, lng: 117.2830, area: '体育场' },
        { ssid: 'CAMPUS', lat: 31.8835, lng: 117.2870, area: '校园中心' },
        // 可以添加更多 SSID 和对应位置
    ],

    /**
     * 根据 Wi-Fi SSID 辅助定位校准
     * @returns {Object|null} 校准后的位置信息
     */
    getWifiLocation() {
        // 浏览器无法直接获取 Wi-Fi SSID，这是系统级 API
        // 这里提供一个接口，实际使用需要 Native App 或扩展
        // 暂时返回 null，后续可以通过其他方式实现
        return null;
    },

    /**
     * 获取校园 Wi-Fi 热点校准位置
     * @param {string} ssid - Wi-Fi 名称
     * @returns {Object|null} 热点位置
     */
    getHotspotBySSID(ssid) {
        if (!ssid) return null;
        return this.CAMPUS_WIFI_HOTSPOTS.find(h =>
            ssid.includes(h.ssid) || h.ssid.includes(ssid)
        ) || null;
    },

    /**
     * 根据精度返回等级描述
     * @param {number} accuracy - 精度（米）
     * @returns {Object} {level, color, text}
     */
    getAccuracyLevel(accuracy) {
        if (!accuracy || accuracy <= 10) {
            return { level: 'excellent', color: '#22c55e', text: '非常高' };
        } else if (accuracy <= 50) {
            return { level: 'good', color: '#84cc16', text: '高' };
        } else if (accuracy <= 100) {
            return { level: 'medium', color: '#eab308', text: '中等' };
        } else if (accuracy <= 200) {
            return { level: 'low', color: '#f97316', text: '较低' };
        } else {
            return { level: 'poor', color: '#ef4444', text: '差（可能在校外）' };
        }
    },

    /**
     * 计算两点之间的距离（米）
     */
    distanceTo(lat1, lng1, lat2, lng2) {
        const R = 6371000; // 地球半径（米）
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },

    /**
     * 尝试使用 Wi-Fi 热点校准 GPS 位置
     * @param {Object} gpsPos - GPS 位置 {lng, lat, accuracy}
     * @returns {Object} 校准后的位置
     */
    calibrateWithWifi(gpsPos) {
        const wifiInfo = this.getWifiLocation();
        if (!wifiInfo) return gpsPos;

        const hotspot = this.getHotspotBySSID(wifiInfo.ssid);
        if (!hotspot) return gpsPos;

        // 如果 Wi-Fi 信号很强，且与 GPS 位置差异不大，取加权平均
        const dist = this.distanceTo(gpsPos.lat, gpsPos.lng, hotspot.lat, hotspot.lng);
        if (dist < 200) {
            // Wi-Fi 信号权重更高（室内定位通常比 GPS 准）
            const wifiWeight = 0.7;
            const gpsWeight = 0.3;
            return {
                lng: hotspot.lng * wifiWeight + gpsPos.lng * gpsWeight,
                lat: hotspot.lat * wifiWeight + gpsPos.lat * gpsWeight,
                accuracy: Math.min(gpsPos.accuracy, 50),
                _calibrated: true,
                _wifi: hotspot.area
            };
        }
        return gpsPos;
    },

    // ============================================
    // 初始化：从后端加载 API Key，并预计算 GCJ-02 坐标系的校园边界
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
        // 预计算 GCJ-02 坐标系下的校园边界，用于对已转换的 GPS 坐标进行判断
        this._initCampusBoundsGCJ();
    },

    // ============================================
    // 预计算 GCJ-02 校园边界（四个角点转换后取 bounding box）
    // ============================================
    _initCampusBoundsGCJ() {
        const b = this.CAMPUS_BOUNDS;
        // 将四个角点从 WGS-84 转换到 GCJ-02
        const corners = [
            this.toGCJ02(b.west, b.north), // 西北
            this.toGCJ02(b.east, b.north), // 东北
            this.toGCJ02(b.west, b.south), // 西南
            this.toGCJ02(b.east, b.south), // 东南
        ];
        const lats = corners.map(c => c.lat);
        const lngs = corners.map(c => c.lng);
        this.CAMPUS_BOUNDS_GCJ = {
            north: Math.max(...lats),
            south: Math.min(...lats),
            west: Math.min(...lngs),
            east: Math.max(...lngs)
        };
        console.log('[CampusNavigation] GCJ-02 校园边界:', this.CAMPUS_BOUNDS_GCJ);
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
    // 判断坐标是否在校园范围内
    // @param {number|Object} lat - 纬度或包含 lat/lng 的对象（兼容两种调用方式）
    // @param {number} [lng] - 经度（lat 为对象时省略）
    // @param {string} [coordSystem] - 'WGS84' 或 'GCJ02'，默认根据 CampusNavigation._gcoord 判断
    // ============================================
    isOnCampus(lat, lng, coordSystem) {
        // 兼容两种调用方式：isOnCampus(lat, lng) 或 isOnCampus({ lat, lng })
        if (typeof lat === 'object' && lat !== null) {
            lng = lat.lng;
            lat = lat.lat;
        }
        // 如果未指定坐标系，默认使用 GCJ-02（因为地图显示和用户标记都用 GCJ-02）
        // 但 GPS 返回的是 WGS-84，传入的如果是原始 GPS 坐标则应指定 'WGS84'
        if (!coordSystem) {
            coordSystem = this._gcoord ? 'GCJ02' : 'WGS84';
        }
        const b = coordSystem === 'GCJ02' ? this.CAMPUS_BOUNDS_GCJ : this.CAMPUS_BOUNDS;
        if (!b) {
            // bounds 尚未初始化，fallback 到宽松判断（与 WGS-84 bounds 比较）
            const fallback = this.CAMPUS_BOUNDS;
            return lat >= fallback.south && lat <= fallback.north && lng >= fallback.west && lng <= fallback.east;
        }
        return lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
    },

    /**
     * 判断坐标是否在校园范围内（宽松模式，考虑 GPS 精度误差）
     * 当坐标略在校外但距离校园边界在 accuracy 米以内时，仍视为在校内
     * @param {number|Object} lat - 纬度或 { lat, lng } 对象
     * @param {number} [lng] - 经度
     * @param {number} [accuracy] - GPS 精度（米），默认使用配置的精度
     * @returns {boolean}
     */
    isOnCampusWithTolerance(lat, lng, accuracy) {
        if (typeof lat === 'object' && lat !== null) {
            accuracy = lng;
            lng = lat.lng;
            lat = lat.lat;
        }
        // 直接精确判断
        if (this.isOnCampus(lat, lng, 'GCJ02')) return true;
        // 宽松判断：计算到校园边界的距离（简化近似，1度纬度≈111km，1度经度≈111km*cos(lat)）
        const campusCenter = this.CAMPUS_BOUNDS_GCJ || this.CAMPUS_BOUNDS;
        const centerLat = (campusCenter.north + campusCenter.south) / 2;
        const meterPerDegLat = 111000;
        const meterPerDegLng = 111000 * Math.cos(centerLat * Math.PI / 180);
        // 取最保守的容差（精度和50米取较大值）
        const tolerance = Math.max(accuracy || 0, 50);
        // 计算各方向的偏差
        const distNorth = (lat - campusCenter.north) * meterPerDegLat;
        const distSouth = (campusCenter.south - lat) * meterPerDegLat;
        const distEast = (lng - campusCenter.east) * meterPerDegLng;
        const distWest = (campusCenter.west - lng) * meterPerDegLng;
        const maxDist = Math.max(distNorth, distSouth, distEast, distWest);
        return maxDist > 0 && maxDist <= tolerance;
    },

    // ============================================
    // 用户 GPS 定位（使用 Geolocation API）
    // 优先使用 GPS，若失败则降级到 IP 定位
    // ============================================
    getCurrentPosition() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                console.warn('[CampusNavigation] 浏览器不支持定位 API');
                // 降级到 IP 定位
                this._getPositionByIP().then(resolve).catch(reject);
                return;
            }

            // 首次尝试：高精度 GPS 定位（户外优先）
            navigator.geolocation.getCurrentPosition(
                pos => {
                    const wgsPos = {
                        lng: pos.coords.longitude,
                        lat: pos.coords.latitude,
                        accuracy: pos.coords.accuracy,
                        altitude: pos.coords.altitude,
                        heading: pos.coords.heading,
                        timestamp: pos.timestamp
                    };
                    console.log(`[CampusNavigation] GPS 定位成功 | WGS-84: (${wgsPos.lat.toFixed(6)}, ${wgsPos.lng.toFixed(6)}) | 精度: ${Math.round(wgsPos.accuracy)}m`);

                    const gcjPos = this.toGCJ02(wgsPos.lng, wgsPos.lat);
                    gcjPos.accuracy = wgsPos.accuracy;
                    gcjPos._wgs = wgsPos;
                    gcjPos._source = 'gps';
                    // 验证转换后的坐标是否在校内
                    const onCampus = this.isOnCampus(gcjPos.lat, gcjPos.lng, 'GCJ02');
                    console.log(`[CampusNavigation] 坐标转换 | GCJ-02: (${gcjPos.lat.toFixed(6)}, ${gcjPos.lng.toFixed(6)}) | 校内: ${onCampus}`);
                    this._userPosition = gcjPos;
                    resolve(gcjPos);
                },
                err => {
                    console.warn(`[CampusNavigation] GPS 定位失败 (code: ${err.code}): ${err.message}`);
                    // 根据错误类型提供友好的用户提示
                    let userHint = '';
                    switch (err.code) {
                        case err.PERMISSION_DENIED:
                            userHint = '请在浏览器设置中允许定位权限后重试';
                            break;
                        case err.POSITION_UNAVAILABLE:
                            userHint = '无法获取位置信息，请检查网络和 GPS 是否开启';
                            break;
                        case err.TIMEOUT:
                            userHint = '定位超时，请确保在开阔区域重试';
                            break;
                    }

                    // 降级策略 1：低精度 GPS
                    console.log('[CampusNavigation] 尝试低精度 GPS 定位...');
                    navigator.geolocation.getCurrentPosition(
                        pos2 => {
                            console.log('[CampusNavigation] 低精度 GPS 定位成功');
                            const wgsPos = { lng: pos2.coords.longitude, lat: pos2.coords.latitude, accuracy: pos2.coords.accuracy };
                            const gcjPos = this.toGCJ02(wgsPos.lng, wgsPos.lat);
                            gcjPos.accuracy = wgsPos.accuracy;
                            gcjPos._wgs = wgsPos;
                            gcjPos._source = 'gps-low';
                            this._userPosition = gcjPos;
                            resolve(gcjPos);
                        },
                        err2 => {
                            console.warn(`[CampusNavigation] 低精度 GPS 也失败: ${err2.message}`);
                            // 降级策略 2：IP 定位
                            console.log('[CampusNavigation] 降级到 IP 定位...');
                            this._getPositionByIP().then(resolve).catch(err3 => {
                                // 最终降级：使用学校中心点
                                console.warn('[CampusNavigation] IP 定位失败，使用学校默认位置');
                                if (userHint) {
                                    showNotification('定位失败：' + userHint, 'warning');
                                }
                                const fallbackPos = this.toGCJ02(this.SCHOOL_CENTER.lng, this.SCHOOL_CENTER.lat);
                                fallbackPos.accuracy = 1000;
                                fallbackPos._source = 'fallback-campus-center';
                                fallbackPos._hint = userHint;
                                this._userPosition = fallbackPos;
                                resolve(fallbackPos);
                            });
                        },
                        { enableHighAccuracy: false, timeout: 15000 }
                    );
                },
                { enableHighAccuracy: true, timeout: 10000 }
            );
        });
    },

    // ============================================
    // IP 定位（通过后端代理调用高德 IP 定位 API）
    // ============================================
    _getPositionByIP() {
        return new Promise((resolve, reject) => {
            fetch(_navApiUrl('/api/config/ip-location'), { signal: AbortSignal.timeout(5000) })
                .then(resp => {
                    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                    return resp.json();
                })
                .then(data => {
                    if (data.lng && data.lat) {
                        const gcjPos = { lng: parseFloat(data.lng), lat: parseFloat(data.lat), accuracy: data.accuracy || 500 };
                        gcjPos._source = 'ip';
                        gcjPos._city = data.city || '';
                        console.log(`[CampusNavigation] IP 定位成功 | (${gcjPos.lat.toFixed(6)}, ${gcjPos.lng.toFixed(6)}) | 城市: ${gcjPos._city}`);
                        this._userPosition = gcjPos;
                        resolve(gcjPos);
                    } else {
                        throw new Error('IP 定位返回数据无效');
                    }
                })
                .catch(err => {
                    console.warn('[CampusNavigation] IP 定位失败:', err.message);
                    reject(err);
                });
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
