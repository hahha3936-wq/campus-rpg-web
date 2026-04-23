# NPC生态系统重构优化 - 修改说明与使用指南

> 校园RPG主脑项目 · NPC系统全面升级  
> 版本：v2.0.0 · 日期：2026-04-19

---

## 一、修改说明

### 1.1 整体架构

本次重构将原有的单一动漫角色NPC（鸣人与佐助）升级为**校园专属NPC生态系统**，包含13位风格各异的校园NPC伙伴，分为5大类别。

```
原有架构：
  npc.html → npc-manager.js → backend API（无独立模块）

新架构：
  index.html/npc.html
      ├── npc-ecosystem-data.js     （NPC数据定义）
      ├── npc-ecosystem.js           （核心业务逻辑）
      ├── npc-ui.js                  （UI交互层）
      ├── npc-ecosystem-bridge.js    （系统集成桥接）
      ├── npc-manager.js             （原有逻辑，100%保留）
      └── backend/npc_api.py         （独立NPC后端API）
```

### 1.2 兼容性保证

- **原有动漫角色**（鸣人与佐助）功能 **100%保留**，通过 `npc-manager.js` 继续提供服务
- **原有 `npc.html` 页面**完全可用，新旧界面并存，用户可自由切换
- **原有 `index.html` NPC展示区**功能不变，新生态入口叠加其上
- 所有全局函数（`switchNPC`、`triggerDialogue`、`sendGift`、`sendUserMessage`）保持向后兼容

### 1.3 新增文件列表

| 文件路径 | 行数 | 功能描述 |
|---------|------|---------|
| `js/features/npc-ecosystem-data.js` | 1410行 | NPC数据结构、配置、彩蛋定义 |
| `js/features/npc-ecosystem.js` | 1299行 | NPC核心管理器（解锁、好感度、对话） |
| `js/features/npc-ui.js` | 1035行 | NPC交互界面（列表、详情、聊天） |
| `js/features/npc-ecosystem-bridge.js` | 396行 | 系统集成桥接与事件绑定 |
| `css/npc-ecosystem.css` | 716行 | 像素风格CSS样式 |
| `backend/npc_api.py` | 797行 | Flask NPC后端API |

### 1.4 修改文件列表

| 文件路径 | 修改内容 |
|---------|---------|
| `npc.html` | 新增NPC生态系统入口卡片、加载新脚本/样式 |
| `index.html` | 新增NPC生态系统入口卡片、加载新脚本/样式 |
| `backend/server.py` | 注册 `npc_bp` 蓝图 |

---

## 二、NPC生态体系详解

### 2.1 NPC分类（5大类，13位NPC）

| 分类 | 图标 | 数量 | NPC列表 |
|------|------|------|---------|
| 导师型 | 🎓 | 3 | 王辅导员（初始解锁）、李学业导师、赵英语老师 |
| 学长型 | 👨‍🎓 | 3 | 张考研学长（初始解锁）、竞赛达人、学长进阶 |
| 校园生活型 | 🏫 | 4 | 图书管理员、食堂阿姨、保安大叔、社团管理员 |
| 兴趣社团型 | 🎨 | 2 | 科技社、计算机社 |
| 自定义型 | ✨ | 1 | 像素世界冒险家 |

### 2.2 NPC解锁方式

| 解锁类型 | 说明 | 触发条件 |
|---------|------|---------|
| `initial` | 初始解锁 | 注册账号即获得（王辅导员、张考研学长） |
| `task_complete` | 任务解锁 | 完成指定数量任务 |
| `ar_scan` | AR扫描解锁 | 扫描AR标记 |
| `achievement` | 成就解锁 | 达成特定成就 |
| `level` | 等级解锁 | 达到指定等级 |
| `guild_join` | 公会解锁 | 加入公会 |
| `exploration_complete` | 探索解锁 | AR探索达到百分比 |

### 2.3 好感度系统

- **好感度范围**：0 ~ 500
- **等级划分**：陌生 → 初识 → 熟悉 → 友好 → 信赖 → 挚友
- **好感度获取**：
  - 完成任务：+10
  - 每日签到：+3
  - 考试通过：+25
  - 对话互动：+1
  - 等级提升：+15
- **好感度衰减**：7天未互动，每日衰减-5

---

## 三、功能使用指南

### 3.1 入口位置

**主页入口**（`index.html`）：
- 页面中下部NPC展示区顶部，新增「校园专属NPC生态」大卡片
- 点击卡片打开完整NPC面板

**NPC专属页面**（`npc.html`）：
- 页面顶部新增「校园专属NPC生态」入口卡片
- 原有动漫角色（鸣人与佐助）保留在下方

### 3.2 NPC面板功能

```
NPC面板（NPCUI）包含：
├── NPC列表页
│   ├── 全部/导师/学长/校园/兴趣/自定义 分类Tab
│   ├── NPC卡片网格（头像、名字、称号、分类、进度条）
│   ├── 已解锁卡片 → 点击进入详情
│   └── 未解锁卡片 → 显示锁定图标和解锁提示
├── NPC详情页
│   ├── 返回按钮、关闭按钮
│   ├── 头像、名字、称号、颜色标识
│   ├── 好感度进度条 + 当前等级标签
│   ├── 对话Tab / 信息Tab / 任务Tab
│   └── 快捷回复按钮 + 消息输入框
└── 弹窗动画
    ├── 好感度等级提升动画
    └── 彩蛋触发通知弹窗
```

### 3.3 系统集成

NPC生态系统与以下系统深度集成：

| 系统 | 集成方式 |
|------|---------|
| StateManager | 用户数据同步（好感度、解锁状态） |
| EventBus | 事件驱动（任务完成、签到、AR扫描等） |
| OfflineStorage | 本地数据持久化 |
| exploration-map.js | AR扫描解锁NPC |
| task-manager.js | 任务完成触发好感度提升和解锁检查 |
| achievement-manager.js | 成就解锁触发NPC解锁 |
| social.js | 公会加入触发解锁 |

### 3.4 彩蛋系统

| 彩蛋类型 | 触发条件 | 效果 |
|---------|---------|------|
| 角落彩蛋 | 探索地图特定角落 | 随机NPC好感度大幅提升+特殊对话 |
| 时间彩蛋 | 特定时段（早7-8点、晚22点后、周末9-12点） | NPC特殊问候+好感度 |
| 成就彩蛋 | 达成特定成就 | 解锁隐藏NPC或获得特殊称号 |
| 连续互动彩蛋 | 连续N天与同一NPC互动 | 解锁特殊剧情对话 |

---

## 四、API接口说明

### 4.1 后端API（`/api/npc/*`）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/npc/list` | 获取所有NPC列表（含解锁状态） |
| GET | `/api/npc/<npc_id>` | 获取单个NPC详情 |
| POST | `/api/npc/<npc_id>/unlock` | 解锁NPC |
| POST | `/api/npc/<npc_id>/affection` | 更新好感度 |
| POST | `/api/npc/<npc_id>/chat` | AI对话 |
| GET | `/api/npc/<npc_id>/tasks` | 获取NPC专属任务 |
| POST | `/api/npc/<npc_id>/task/<task_id>/accept` | 接受NPC任务 |
| GET | `/api/npc/progress` | 获取解锁进度 |

### 4.2 前端JavaScript API

所有API通过 `window.NPCEcosystemBridge` 访问：

```javascript
// 初始化（自动完成）
window.NPCEcosystemBridge.init();

// 打开NPC面板
window.NPCEcosystemBridge.openPanel();

// 打开指定NPC详情
window.NPCEcosystemBridge.openNPC('mentor_wang');

// 获取NPC列表
NPCEcosystemBridge.getAllNPCs();
NPCEcosystemBridge.getUnlockedNPCs();

// 获取好感度
NPCEcosystemBridge.getAffection('mentor_wang');         // 返回数值
NPCEcosystemBridge.getAffectionProgress('mentor_wang'); // 返回百分比

// 增加好感度
NPCEcosystemBridge.addAffection('mentor_wang', 10);

// 获取对话历史
NPCEcosystemBridge.getHistory('mentor_wang');

// AI对话
await NPCEcosystemBridge.chat('mentor_wang', '你好');

// 解锁进度
NPCEcosystemBridge.getUnlockProgress();  // { total, unlocked, percentage }

// 检查时间彩蛋
NPCEcosystemBridge.checkTimeEggs();
```

### 4.3 事件系统

通过 `EventBus` 监听以下事件：

```javascript
// NPC解锁
EventBus.on('npc:unlocked', ({ npcId, npc }) => { });

// 任务完成（自动触发好感度提升）
EventBus.on('task:completed', (task) => { });

// 签到完成（自动触发好感度提升）
EventBus.on('signin:complete', () => { });

// AR扫描（触发解锁检查）
EventBus.on('ar:marker_scanned', ({ markerId }) => { });

// 成就解锁（触发解锁检查）
EventBus.on('achievement:unlocked', (achievement) => { });

// 等级提升（触发好感度提升）
EventBus.on('role:level_up', ({ level }) => { });

// 每日重置（触发好感度衰减检查）
EventBus.on('app:daily_reset', () => { });

// 彩蛋触发
EventBus.on('exploration:easter_egg', (egg) => { });

// 数据加载完成
EventBus.on('data:loaded', () => { });
```

---

## 五、代码规范与约定

### 5.1 文件组织

```
js/features/
├── npc-manager.js           # 原有NPC管理器（保持不动）
├── npc-ecosystem-data.js    # 数据层
├── npc-ecosystem.js         # 业务逻辑层
├── npc-ui.js                # UI展示层
└── npc-ecosystem-bridge.js  # 集成桥接层

css/
├── npc-page.css             # 原有NPC页面样式（保持不动）
└── npc-ecosystem.css        # 新NPC生态系统样式

backend/
└── npc_api.py               # NPC后端API蓝图
```

### 5.2 NPC数据格式

```javascript
// 每个NPC的配置结构
{
    id: 'mentor_wang',
    name: '王辅导员',
    title: '辅导员',
    avatar: '👨‍🏫',
    color: '#667eea',           // 主题色（与分类对应）
    bio: '...',                 // 个人简介
    personality: '...',          // 性格特征
    expertise: ['...'],          // 擅长领域
    default_greeting: '...',     // 默认问候语
    rarity: 'common',            // 稀有度

    unlock: {
        type: 'initial',        // 解锁类型
        condition: '...',        // 解锁条件描述
        // 根据类型不同，可能有：
        // marker_id, achievement_id, level_required,
        // task_unlock_threshold, exploration_threshold
    },

    affection: {
        initial: 30,             // 初始好感度
        max: 500,                // 最大好感度
        ranks: [                 // 等级配置
            { level: 0, label: '陌生', threshold: 0 },
            { level: 1, label: '初识', threshold: 50 },
            // ...
        ],
        gain_conditions: [       // 获取条件
            { action: 'complete_task', factor: 10, label: '完成任务' },
            { action: 'daily_signin', factor: 3, label: '每日签到' },
        ],
        decay: { enabled: true, days: 7, amount: -5 }
    },

    dialogues: {
        branches: {
            '0': [...],    // 好感度0级对话
            '1': [...],    // 好感度1级对话
            // ...
        }
    },

    bindings: {
        ar_marker: 'marker_teaching_building',
        related_achievement: null,
        related_tasks: ['task_xxx']
    }
}
```

### 5.3 数据持久化

| 数据类型 | 存储位置 | key格式 |
|---------|---------|---------|
| 解锁状态 | localStorage | `campus_rpg_npc_unlocked_{userId}` |
| 好感度 | localStorage + StateManager | `campus_rpg_npc_relations_{userId}` |
| 对话历史 | localStorage | `campus_rpg_npc_history_{userId}` |
| 每日互动 | localStorage | `campus_rpg_npc_daily_{userId}` |
| 彩蛋触发 | localStorage | `campus_rpg_npc_egg_{userId}` |

### 5.4 像素风格配色

| 分类 | 主色 | CSS变量 |
|------|------|---------|
| 导师型 | 紫色 | `--npc-mentor: #667eea` |
| 学长型 | 绿色 | `--npc-senior: #10b981` |
| 校园生活型 | 紫色 | `--npc-campus: #8b5cf6` |
| 兴趣社团型 | 粉色 | `--npc-club: #ec4899` |
| 自定义型 | 黄色 | `--npc-custom: #fbbf24` |

---

## 六、测试结果

### 6.1 后端API测试（23项）

| 测试项 | 结果 |
|-------|------|
| NPC列表接口 | ✅ PASS |
| NPC数量验证（13个） | ✅ PASS |
| 初始解锁验证（3个） | ✅ PASS |
| 特定NPC解锁状态 | ✅ PASS |
| NPC详情接口 | ✅ PASS |
| 详情包含NPC信息 | ✅ PASS |
| NPC名称验证 | ✅ PASS |
| NPC对话接口 | ✅ PASS |
| AI回复验证 | ✅ PASS |
| 好感度更新接口 | ✅ PASS |
| 好感度数值验证 | ✅ PASS |
| 等级标签验证 | ✅ PASS |
| NPC任务列表接口 | ✅ PASS |
| 任务数据返回 | ✅ PASS |
| 进度统计接口 | ✅ PASS |
| 分类统计验证 | ✅ PASS |
| 总数验证 | ✅ PASS |
| 无效NPC处理 | ✅ PASS |
| 认证验证 | ✅ PASS |
| 彩蛋配置验证 | ✅ PASS |
| NPC数据完整性 | ✅ PASS |
| API响应格式 | ✅ PASS |

### 6.2 前端JavaScript语法检查

| 文件 | 结果 |
|------|------|
| npc-ecosystem-data.js | ✅ PASS |
| npc-ecosystem.js | ✅ PASS |
| npc-ui.js | ✅ PASS |
| npc-ecosystem-bridge.js | ✅ PASS |
| backend/npc_api.py | ✅ PASS |

---

## 七、已知限制与未来扩展

### 7.1 当前版本限制

1. **对话历史**：后端存储在内存中，VPS重启会丢失。建议生产环境迁移到数据库。
2. **AI对话**：当前为规则匹配回复，尚未接入DeepSeek API。
3. **彩蛋配置**：硬编码在 `npc-ecosystem-data.js`，可通过后端API动态化。

### 7.2 建议扩展方向

1. 接入 DeepSeek API 实现真实AI对话
2. NPC专属任务与 `task-manager.js` 深度集成
3. NPC好感度奖励与成就系统联动
4. 多人互动：NPC之间对话、NPC群聊
5. NPC皮肤/外观自定义
6. 离线支持：NPC对话缓存

---

## 八、快速参考

### 快速添加新NPC

1. 在 `npc-ecosystem-data.js` 的 `NPC_ECOSYSTEM_DATA` 中添加NPC配置
2. 在 `npc_api.py` 的 `NPC_INFO`、`NPC_UNLOCK_CONFIG` 中添加对应数据
3. （可选）在 `NPC_TASKS` 中添加NPC专属任务

### 快速添加新彩蛋

在 `npc-ecosystem-data.js` 的 `NPC_EASTER_EGGS` 中添加：

```javascript
easter_eggs: {
    corner: [
        {
            id: 'egg_new_id',
            npc: 'mentor_wang',
            trigger: 'corner_explore:campus_lake',
            reward: { affection: 20 },
            title: '彩蛋名称',
            message: '触发时显示的文字'
        }
    ],
    // ... time, achievement, streak
}
```

### NPC面板开发

在 `npc-ui.js` 中修改 `_showNPCDetail` 方法来自定义NPC详情页布局。

---

*文档生成时间：2026-04-19*  
*项目版本：校园RPG v2.0.0*
