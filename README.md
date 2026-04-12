# 校园RPG - 游戏化学习系统

一款将大学生活游戏化的网页应用，帮助你更有趣地管理学习和日常任务。

## 功能特点

- **角色系统**：等级、经验值、金币、能量值等属性
- **任务系统**：主线、支线、日常、隐藏任务分类管理
- **成就系统**：学业、探索、社交、隐藏成就
- **NPC互动**：与漩涡鸣人老师和宇智波佐助助教互动
- **随机事件**：触发各种游戏化事件获得奖励
- **游戏化UI**：按钮交互、动画特效、等级提升等

## 快速开始

### 方式一：直接打开HTML文件（推荐）

```bash
# 直接在浏览器中打开 index.html
# Windows
start index.html

# 或者使用 Python 简单服务器
python -m http.server 8080
# 然后访问 http://localhost:8080
```

### 方式二：使用Flask后端

```bash
# 1. 安装依赖
cd backend
pip install -r requirements.txt

# 2. 启动服务器
python server.py

# 3. 访问 http://localhost:5000
```

## 项目结构

```
campus-rpg-web/
├── index.html          # 主页面
├── css/
│   ├── main.css        # 主样式
│   ├── components.css  # 组件样式
│   └── animations.css  # 动画样式
├── js/
│   └── app.js          # 主逻辑
├── backend/
│   ├── server.py        # Flask服务器
│   └── requirements.txt # Python依赖
└── data/               # 数据文件
    ├── user_data.json
    ├── task_data.json
    └── achievement_data.json
```

## 使用说明

### 主功能按钮

| 按钮 | 功能 |
|------|------|
| 📊 我的角色 | 查看角色详细属性面板 |
| 🎯 我的任务 | 任务列表和进度管理 |
| 🏆 成就中心 | 查看成就进度 |
| 🎒 背包 | 使用道具 |

### 快速操作

| 按钮 | 功能 |
|------|------|
| ⚡ 快速行动 | 随机完成一个任务获得奖励 |
| 🎲 随机事件 | 触发随机事件获得增益 |
| 📈 今日总结 | 查看今日学习统计 |

### 任务操作

1. 点击任务卡片查看详情
2. 点击子任务复选框完成任务
3. 完成任务可获得经验和金币奖励
4. 经验值满后自动升级

### NPC互动

- 点击NPC角色卡片获取随机对话
- 与NPC互动可增加好感度
- 好感度达到一定值可触发特殊奖励

## 技术栈

- **前端**: HTML5, CSS3, JavaScript (ES6+)
- **UI框架**: Bootstrap 5
- **图表**: Chart.js
- **后端**: Flask (可选)
- **数据存储**: JSON文件

## 自定义

### 修改用户信息

编辑 `data/user_data.json` 中的 `user` 部分：

```json
{
  "user": {
    "name": "你的名字",
    "school": "你的学校",
    "grade": "年级"
  }
}
```

### 添加新任务

在 `data/task_data.json` 的 `tasks` 数组中添加新任务：

```json
{
  "id": "custom_task",
  "name": "自定义任务",
  "category": "main",
  "category_name": "主线任务",
  "description": "任务描述",
  "status": "in_progress",
  "progress": 0,
  "reward": {
    "experience": 50,
    "gold": 20
  },
  "subtasks": []
}
```

### 添加新成就

在 `data/achievement_data.json` 的相应分类中添加新成就。

## 浏览器兼容性

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## License

MIT License

---

💪 祝你学习愉快!
