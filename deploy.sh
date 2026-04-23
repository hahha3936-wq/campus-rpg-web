#!/bin/bash
# ============================================
# 校园RPG - VPS 一键部署脚本
# 支持: Ubuntu 20.04+ / Debian 11+
# 使用: bash deploy.sh
# ============================================

set -e

# 颜色定义
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; NC='\033[0m'

echo_step() { echo -e "${BLUE}[步骤]${NC} $1"; }
echo_ok()   { echo -e "${GREEN}[完成]${NC} $1"; }
echo_warn() { echo -e "${YELLOW}[警告]${NC} $1"; }
echo_err()  { echo -e "${RED}[错误]${NC} $1"; }
check_ok()  { if [ $? -eq 0 ]; then echo_ok "$1"; else echo_err "$2"; exit 1; fi; }

# ============================================
# 1. 检测 root 权限
# ============================================
echo_step "检查运行环境..."
if [ "$EUID" -eq 0 ]; then
    SUDO=""
else
    SUDO="sudo"
    echo_warn "需要 sudo 权限，将自动提升"
fi

# ============================================
# 2. 更新系统
# ============================================
echo_step "1/10 更新系统软件包..."
$SUDO apt update -qq
$SUDO apt upgrade -y -qq
check_ok "系统更新完成" "系统更新失败"

# ============================================
# 3. 安装 Python 和 pip
# ============================================
echo_step "2/10 安装 Python 环境..."
$SUDO apt install -y python3 python3-pip python3-venv git curl
check_ok "Python 环境就绪" "Python 安装失败"

# ============================================
# 4. 安装 Node.js (用于前端资源构建，可选)
# ============================================
echo_step "3/10 安装 Node.js (LTS)..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_lts.x | $SUDO bash - > /dev/null 2>&1
    $SUDO apt install -y nodejs
    check_ok "Node.js 安装完成 ($(node --version))" "Node.js 安装失败"
else
    echo_ok "Node.js 已安装 ($(node --version))"
fi

# ============================================
# 5. 创建应用用户
# ============================================
echo_step "4/10 创建应用用户..."
if id -u campusrpg &>/dev/null; then
    echo_ok "用户 campusrpg 已存在"
else
    $SUDO useradd -m -s /bin/bash campusrpg
    echo_ok "用户 campusrpg 创建完成"
fi

APP_DIR="/opt/campus-rpg"
if [ ! -d "$APP_DIR" ]; then
    $SUDO mkdir -p "$APP_DIR"
    $SUDO chown campusrpg:campusrpg "$APP_DIR"
    echo_ok "应用目录 $APP_DIR 创建完成"
fi

# ============================================
# 6. 复制项目文件
# ============================================
echo_step "5/10 复制项目文件到 $APP_DIR ..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
$SUDO cp -r "$SCRIPT_DIR"/* "$APP_DIR/"
$SUDO chown -R campusrpg:campusrpg "$APP_DIR"
check_ok "项目文件复制完成" "文件复制失败"

# ============================================
# 7. 配置 Python 虚拟环境
# ============================================
echo_step "6/10 配置 Python 虚拟环境..."
cd "$APP_DIR/backend"
$SUDO python3 -m venv venv
$SUDO chown -R campusrpg:campusrpg venv
$SUDO -u campusrpg bash -c "source venv/bin/activate && pip install --upgrade pip -q && pip install flask flask-cors flask-jwt-extended gunicorn requests -q"
check_ok "Python 依赖安装完成" "依赖安装失败"

# ============================================
# 8. 安装 Nginx
# ============================================
echo_step "7/10 安装 Nginx..."
if ! command -v nginx &> /dev/null; then
    $SUDO apt install -y nginx
    check_ok "Nginx 安装完成" "Nginx 安装失败"
else
    echo_ok "Nginx 已安装"
fi

# ============================================
# 9. 配置 Nginx (反向代理到 Gunicorn)
# ============================================
echo_step "8/10 配置 Nginx 反向代理..."
$SUDO tee /etc/nginx/sites-available/campus-rpg > /dev/null <<'NGINX_CONF'
server {
    listen 80;
    server_name _;

    # Gzip 压缩
    gzip on;
    gzip_types text/plain application/json application/javascript text/css text/xml;
    gzip_min_length 1000;

    client_max_body_size 10M;

    # API 请求转发到 Flask/Gunicorn
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
    }

    # SSE 流式响应
    location /api/narrative/stream {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
        chunked_transfer_encoding on;
    }

    # 静态文件（前端）
    location / {
        root /opt/campus-rpg;
        try_files $uri $uri/ /index.html;
        expires 1d;
        add_header Cache-Control "public, no-transform";
    }
}
NGINX_CONF

if [ -L /etc/nginx/sites-enabled/campus-rpg ]; then
    $SUDO rm -f /etc/nginx/sites-enabled/campus-rpg
fi
$SUDO ln -sf /etc/nginx/sites-available/campus-rpg /etc/nginx/sites-enabled/
$SUDO nginx -t && $SUDO systemctl reload nginx
check_ok "Nginx 配置完成" "Nginx 配置失败"

# ============================================
# 10. 安装 Cloudflare Tunnel
# ============================================
echo_step "9/10 安装 Cloudflare Tunnel..."
if ! command -v cloudflared &> /dev/null; then
    $SUDO curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
        -o /usr/local/bin/cloudflared
    $SUDO chmod +x /usr/local/bin/cloudflared
    check_ok "Cloudflare Tunnel 安装完成" "Cloudflare Tunnel 安装失败"
else
    echo_ok "Cloudflare Tunnel 已安装"
fi

# ============================================
# 11. 配置 Systemd 服务
# ============================================
echo_step "10/10 配置 Systemd 服务..."
$SUDO tee /etc/systemd/system/campus-rpg.service > /dev/null <<'SYSTEMD_CONF'
[Unit]
Description=校园RPG Flask Application
After=network.target

[Service]
Type=notify
User=campusrpg
WorkingDirectory=/opt/campus-rpg/backend
EnvironmentFile=/opt/campus-rpg/.env
ExecStart=/opt/campus-rpg/backend/venv/bin/gunicorn \
    --bind 127.0.0.1:5000 \
    --workers 2 \
    --timeout 120 \
    --access-logfile /var/log/campus-rpg/access.log \
    --error-logfile /var/log/campus-rpg/error.log \
    server:app
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SYSTEMD_CONF

$SUDO mkdir -p /var/log/campus-rpg
$SUDO chown campusrpg:campusrpg /var/log/campus-rpg

$SUDO systemctl daemon-reload
$SUDO systemctl enable campus-rpg
$SUDO systemctl restart campus-rpg
sleep 2

if $SUDO systemctl is-active --quiet campus-rpg; then
    echo_ok "校园RPG 服务启动成功"
else
    echo_err "服务启动失败，请检查日志: sudo journalctl -u campus-rpg -n 30"
fi

# ============================================
# 完成
# ============================================
echo ""
echo -e "${GREEN}========================================"
echo -e "  校园RPG 部署完成！"
echo -e "========================================${NC}"
echo ""
echo -e "访问地址: http://$(hostname -I | awk '{print $1}'):80"
echo ""
echo -e "${YELLOW}重要: HTTPS 配置（摄像头需要 HTTPS）${NC}"
echo -e "  在你的本地电脑上运行以下命令:"
echo -e "  1. 下载 cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
echo -e "  2. 运行: cloudflared tunnel --url http://localhost"
echo -e "  3. 会得到一个 https://xxx.trycloudflare.com 的地址"
echo -e "  4. 用这个地址访问游戏，摄像头权限就正常了"
echo ""
echo -e "${YELLOW}手动启动/停止服务:${NC}"
echo -e "  sudo systemctl start   campus-rpg  # 启动"
echo -e "  sudo systemctl stop    campus-rpg  # 停止"
echo -e "  sudo systemctl restart campus-rpg  # 重启"
echo -e "  sudo journalctl -u campus-rpg -f   # 查看日志"
echo ""
