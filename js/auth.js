/**
 * 校园RPG - 前端认证模块
 * 管理登录状态、JWT token、用户信息
 */

const Auth = (() => {
    const TOKEN_KEY = 'campus_rpg_token';
    const USER_KEY = 'campus_rpg_user';

    function reqUrl(path) {
        return typeof window.apiUrl === 'function' ? window.apiUrl(path) : path;
    }

    async function readJsonBody(resp) {
        const text = await resp.text();
        const ct = (resp.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('application/json')) {
            try {
                return JSON.parse(text);
            } catch {
                throw new Error('服务器返回了无效的 JSON');
            }
        }
        const t = text.trim();
        if (t.startsWith('<!') || t.startsWith('<')) {
            throw new Error(
                '无法连接后端 API（收到网页而非接口数据）。请先用 start.bat 启动服务，并访问 http://localhost:5000/login.html；若使用 Live Server，请保持后端在 5000 端口运行，或在页面中加入 <meta name="campus-rpg-api-base" content="http://127.0.0.1:5000">'
            );
        }
        try {
            return JSON.parse(text);
        } catch {
            throw new Error(t.slice(0, 120) || '请求失败');
        }
    }

    // ============================================
    // Token 管理
    // ============================================
    function getToken() {
        return localStorage.getItem(TOKEN_KEY);
    }

    function setToken(token) {
        localStorage.setItem(TOKEN_KEY, token);
    }

    function removeToken() {
        localStorage.removeItem(TOKEN_KEY);
    }

    // ============================================
    // 用户信息管理
    // ============================================
    function getUser() {
        try {
            const raw = localStorage.getItem(USER_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }

    function setUser(user) {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    }

    function removeUser() {
        localStorage.removeItem(USER_KEY);
    }

    // ============================================
    // 状态判断
    // ============================================
    function isLoggedIn() {
        return !!getToken() && !!getUser();
    }

    // ============================================
    // API 调用（自动附加 Authorization header）
    // ============================================
    async function apiFetch(url, options = {}) {
        const token = getToken();
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        const resp = await fetch(reqUrl(url), { ...options, headers });
        return resp;
    }

    // ============================================
    // 登录
    // ============================================
    async function login(username, password) {
        const resp = await fetch(reqUrl('/api/auth/login'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await readJsonBody(resp);
        if (!resp.ok) {
            throw new Error(data.error || '登录失败');
        }
        setToken(data.token);
        setUser(data.user);
        return data;
    }

    // ============================================
    // 注册
    // ============================================
    async function register(username, password, nickname) {
        const resp = await fetch(reqUrl('/api/auth/register'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, nickname })
        });
        const data = await readJsonBody(resp);
        if (!resp.ok) {
            throw new Error(data.error || '注册失败');
        }
        setToken(data.token);
        setUser(data.user);
        return data;
    }

    // ============================================
    // 登出
    // ============================================
    async function logout() {
        try {
            await fetch(reqUrl('/api/auth/logout'), {
                method: 'POST',
                headers: { Authorization: `Bearer ${getToken()}` }
            });
        } catch {
            // 忽略网络错误
        }
        removeToken();
        removeUser();
        window.location.href = '/login.html';
    }

    // ============================================
    // 验证 token 有效性（访问 /api/auth/me）
    // ============================================
    async function validateSession() {
        const token = getToken();
        if (!token) return false;
        try {
            const resp = await apiFetch('/api/auth/me');
            if (resp.ok) {
                const user = await readJsonBody(resp);
                setUser(user);
                return true;
            }
            // token 过期
            removeToken();
            removeUser();
            return false;
        } catch {
            return false;
        }
    }

    // ============================================
    // 尝试恢复登录状态
    // ============================================
    async function tryRestoreSession() {
        if (!isLoggedIn()) return false;
        return await validateSession();
    }

    return {
        isLoggedIn,
        getToken,
        getUser,
        login,
        register,
        logout,
        validateSession,
        tryRestoreSession,
        apiFetch
    };
})();

// ============================================
// 全局快捷访问
// ============================================
window.Auth = Auth;
