#!/usr/bin/env bash
#
# 服务器一次性初始化。在阿里云 Debian 13 上以 root 运行：
#
#   # 先把整个项目传到服务器，或者只传 deploy/ 目录
#   scp -r deploy root@你的IP:/tmp/
#   ssh root@你的IP 'bash /tmp/deploy/install-server.sh'
#
# 做完这些事后，以后每次更新只需要在本机跑 `npm run deploy`。
#
# 这个脚本是幂等的，重复运行不会出问题。

set -euo pipefail

BASE="/opt/myblog"
SERVICE_USER="myblog"
NODE_MAJOR=22

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[!] %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m[x] %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "请用 root 运行（sudo bash install-server.sh）"

# ---------------------------------------------------------------------------
log "检查系统"
# ---------------------------------------------------------------------------
. /etc/os-release 2>/dev/null || true
echo "发行版：${PRETTY_NAME:-未知}"
echo "内存：$(free -h | awk '/^Mem:/{print $2}')  磁盘可用：$(df -h /opt 2>/dev/null | awk 'NR==2{print $4}')"

if [[ "${VERSION_ID:-}" == "13" ]]; then
  echo "检测到 Debian 13，自带的 nodejs 是 20.x，满足 Next 16 的最低要求（20.9+）。"
  echo "不过下面还是装 Node ${NODE_MAJOR} LTS —— 更新的运行时，且生命周期更长。"
fi

# ---------------------------------------------------------------------------
log "安装 Node.js ${NODE_MAJOR}"
# ---------------------------------------------------------------------------
if command -v node >/dev/null && [[ "$(node -v | cut -d. -f1 | tr -d v)" -ge 20 ]]; then
  echo "已装 node $(node -v)，跳过。"
else
  apt-get update -qq
  apt-get install -y -qq curl ca-certificates gnupg
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y -qq nodejs
  echo "已安装 node $(node -v)"
fi

# ---------------------------------------------------------------------------
log "创建服务账号与目录"
# ---------------------------------------------------------------------------
if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  # --system：系统账号，不建家目录、不能登录
  useradd --system --shell /usr/sbin/nologin --home-dir "$BASE" "$SERVICE_USER"
  echo "已创建系统用户 $SERVICE_USER"
else
  echo "用户 $SERVICE_USER 已存在"
fi

mkdir -p "$BASE"/{releases,content/posts,content/moments,content/uploads,shared,backup}
chown -R "$SERVICE_USER:$SERVICE_USER" "$BASE"

if [[ ! -f "$BASE/shared/blog.env" ]]; then
  if [[ -f /tmp/deploy/blog.env.example ]]; then
    cp /tmp/deploy/blog.env.example "$BASE/shared/blog.env"
  else
    touch "$BASE/shared/blog.env"
  fi
  chown "$SERVICE_USER:$SERVICE_USER" "$BASE/shared/blog.env"
  chmod 600 "$BASE/shared/blog.env"
  warn "已生成 $BASE/shared/blog.env —— 部署前必须填好 ADMIN_PASSWORD_HASH 和 SESSION_SECRET！"
fi

# ---------------------------------------------------------------------------
log "配置 2GB swap"
# ---------------------------------------------------------------------------
# 2GB 内存跑 Next 运行时是够的，但系统更新、日志轮转、偶发的内存尖峰都可能触发 OOM。
# 有块 swap 兜底，比事后登不上机器强。
if swapon --show | grep -q .; then
  echo "已有 swap，跳过。"
  echo "$(swapon --show)"
else
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  # 降低 swap 倾向：只在真的吃紧时才用，日常别拿它当内存使
  sysctl -qw vm.swappiness=10
  grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
  echo "已启用 2GB swap"
fi

# ---------------------------------------------------------------------------
log "安装 systemd 服务"
# ---------------------------------------------------------------------------
if [[ -f /tmp/deploy/myblog.service ]]; then
  cp /tmp/deploy/myblog.service /etc/systemd/system/myblog.service
  systemctl daemon-reload
  systemctl enable myblog >/dev/null 2>&1 || true
  echo "已安装（还没启动 —— 等第一次 npm run deploy）"
else
  warn "找不到 /tmp/deploy/myblog.service，跳过。请手动拷贝后再 systemctl daemon-reload"
fi

# ---------------------------------------------------------------------------
log "配置防火墙"
# ---------------------------------------------------------------------------
if command -v ufw >/dev/null; then
  ufw allow 22/tcp >/dev/null 2>&1 || true
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  echo "ufw 已放行 22 / 80 / 443"
else
  echo "未安装 ufw，跳过。"
fi
warn "别忘了在【阿里云控制台的安全组】里也放行这些端口 —— 那层和系统防火墙是独立的。"

# ---------------------------------------------------------------------------
log "SSH 加固建议"
# ---------------------------------------------------------------------------
cat <<'EOF'
以下几条能大幅降低公网机器被爆破的概率，请手动确认后执行（本脚本不自动改，
以免把你自己锁在外面）：

  # 1. 把本机公钥传上去（在你自己的电脑上执行）
  ssh-copy-id -i ~/.ssh/id_ed25519.pub root@你的IP

  # 2. 确认能用密钥登录后，再关掉密码登录
  sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
  systemctl restart ssh

  # 3. 装 fail2ban 自动封禁反复失败的 IP
  apt-get install -y fail2ban && systemctl enable --now fail2ban
EOF

# ---------------------------------------------------------------------------
log "完成"
# ---------------------------------------------------------------------------
cat <<EOF

服务器已就绪。接下来：

  1. 编辑密钥文件，填入两个必填项：
       nano $BASE/shared/blog.env

     ADMIN_PASSWORD_HASH  → 在本机跑 \`npm run set-password\` 生成
     SESSION_SECRET       → \`openssl rand -base64 48\`

  2. 回到本机，填好 deploy.config.json，然后发布：
       npm run build && npm run pack && npm run deploy

  3. 装反向代理（可选，域名已备案的话推荐）：
       apt-get install -y caddy
       cp /tmp/deploy/Caddyfile /etc/caddy/Caddyfile   # 记得改域名
       systemctl reload caddy

     没备案就先别装 Caddy，改用高位端口直连（见 deploy/Caddyfile 顶部说明）。

EOF
