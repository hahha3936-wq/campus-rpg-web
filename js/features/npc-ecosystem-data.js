/**
 * 校园RPG - NPC生态数据
 * 
 * 数据结构设计：
 * - 按5大类组织NPC矩阵
 * - 每个NPC包含：基础信息、解锁条件、对话模板、好感度配置
 * - 完全贴合校园学习成长场景，所有功能与学习/成长绑定
 * 
 * NPC分类：
 * - mentor: 导师型NPC（辅导员、班主任、专业课老师）
 * - senior: 学长型NPC（高年级学长学姐、竞赛获奖学长）
 * - campus: 校园生活NPC（图书馆管理员、食堂阿姨等）
 * - club: 兴趣型NPC（社团社长、同好伙伴）
 * - custom: 自定义动漫NPC（可选扩展）
 */

const NPC_ECOSYSTEM_DATA = {

    // ============================================
    // 导师型NPC（初始解锁，无门槛）
    // ============================================
    mentor: {
        category: '导师型',
        category_icon: '🎓',
        category_desc: '学业规划引导、考试节点提醒、专业知识点答疑',
        unlock_hint: '注册后初始解锁',
        color: '#667eea',

        npcs: {
            'mentor_wang': {
                id: 'mentor_wang',
                name: '王辅导员',
                title: '辅导员',
                avatar: '👨‍🏫',
                color: '#667eea',
                bio: '王辅导员是你大学生活的引路人。他熟悉学校的每一个角落，总是能在你需要帮助时给予最贴心的建议。别看他平时严肃认真，内心其实非常关心每一位学生的成长。',
                personality: '温和严谨、循循善诱、亦师亦友',
                expertise: ['学业规划', '心理辅导', '奖助学金', '就业指导'],
                default_greeting: '欢迎来到大学！我是你的辅导员王老师，大学是一个新的起点，让我们一起规划你的成长之路吧！有什么学业上的困惑都可以来找我聊聊。',
                greeting_placeholder: '你好啊，欢迎开启大学生活！有任何学习上的问题尽管来找我。',

                // 解锁配置
                unlock: {
                    type: 'initial',      // initial | task_complete | ar_scan | achievement | level
                    condition: null,
                    related_npc: null,    // 关联解锁的前置NPC
                    story_sequence: 1
                },

                // 好感度配置（0-5级）
                affection: {
                    initial: 30,
                    max: 500,
                    ranks: [
                        { level: 0, label: '陌生', threshold: 0, min_affection: 0, desc: '仅基础打招呼', reward: null },
                        { level: 1, label: '初识', threshold: 50, min_affection: 50, desc: '解锁基础任务', reward: { type: 'task', bonus: 1.0 } },
                        { level: 2, label: '熟悉', threshold: 150, min_affection: 150, desc: '解锁学习攻略', reward: { type: 'task', bonus: 1.2 } },
                        { level: 3, label: '友好', threshold: 280, min_affection: 280, desc: '解锁隐藏剧情', reward: { type: 'title', item: '学业导师' } },
                        { level: 4, label: '信赖', threshold: 400, min_affection: 400, desc: '解锁专属AR场景', reward: { type: 'buff', item: '学业专注' } },
                        { level: 5, label: '挚友', threshold: 500, min_affection: 500, desc: '全量剧情解锁', reward: { type: 'all', item: '学业大师称号' } }
                    ],
                    gain_conditions: [
                        { action: 'complete_task', factor: 10, label: '完成学习任务' },
                        { action: 'daily_signin', factor: 3, label: '每日签到' },
                        { action: 'exam_pass', factor: 25, label: '考试通过' },
                        { action: 'week_streak', factor: 15, label: '连续7天完成任务' },
                        { action: 'npc_chat', factor: 1, label: '对话互动' }
                    ],
                    decay: {
                        enabled: true,
                        days: 7,
                        amount: -5,
                        label: '连续7天未完成任务'
                    }
                },

                // 任务配置
                tasks: {
                    category: 'main',
                    task_templates: [
                        {
                            id: 'mentor_task_1',
                            icon: '📚',
                            name: '制定学期学习计划',
                            desc: '与王辅导员沟通，制定本学期的学习目标与计划',
                            difficulty: 'easy',
                            reward: { exp: 30, gold: 15, affection: 10 }
                        },
                        {
                            id: 'mentor_task_2',
                            icon: '🎯',
                            name: '参加辅导员例会',
                            desc: '参加每月的辅导员见面会，了解校园动态',
                            difficulty: 'medium',
                            reward: { exp: 50, gold: 25, affection: 15 }
                        }
                    ]
                },

                // 对话分支（按好感度和用户属性）
                dialogues: {
                    branches: {
                        low_affection: [
                            '你好啊同学，有什么我可以帮助的吗？',
                            '刚来大学还适应吗？有什么困惑可以来找我聊聊。',
                            '学习上有什么问题，记得及时问老师哦。'
                        ],
                        mid_affection: [
                            '最近学习状态怎么样？保持好节奏很重要。',
                            '考试周快到了，记得提前复习，不要临时抱佛脚。',
                            '听说你最近在探索校园，不错！了解学校很重要。'
                        ],
                        high_affection: [
                            '看到你进步很大，继续保持！有什么需要我帮忙的尽管说。',
                            '你已经成为低年级学生的榜样了，记得帮助一下学弟学妹们。',
                            '对了，我这儿有一个特别的学习机会，想不想了解一下？'
                        ]
                    }
                },

                // 绑定系统
                bindings: {
                    task_system: true,
                    ar_system: false,
                    achievement_system: true,
                    map_location: null,
                    ar_marker_id: null
                },

                // 稀有度
                rarity: 'common',
                exclusive: true
            },

            'mentor_li': {
                id: 'mentor_li',
                name: '李高数老师',
                title: '高数教师',
                avatar: '📐',
                color: '#f59e0b',
                bio: '李老师是全校最受欢迎的高数老师，他的课堂从不枯燥。他擅长用生活中的例子解释抽象的数学概念，让学生发现数学之美。虽然要求严格，但他的严格背后是对学生成长的深深期许。',
                personality: '严谨博学、风趣幽默、耐心细致',
                expertise: ['高等数学', '线性代数', '概率论', '竞赛数学'],
                default_greeting: '数学是思维的体操，欢迎来到高数的世界！别担心，我会用最简单的方式带你走进数学的殿堂。跟着我的节奏，你会发现高数其实很有趣！',
                greeting_placeholder: '数学的世界很精彩，一起来探索吧！',

                unlock: {
                    type: 'initial',
                    condition: null,
                    related_npc: null,
                    story_sequence: 2
                },

                affection: {
                    initial: 20,
                    max: 500,
                    ranks: [
                        { level: 0, label: '陌生', threshold: 0, min_affection: 0, desc: '仅基础打招呼', reward: null },
                        { level: 1, label: '初识', threshold: 50, min_affection: 50, desc: '解锁基础答疑', reward: { type: 'hint', bonus: 1.0 } },
                        { level: 2, label: '熟悉', threshold: 150, min_affection: 150, desc: '解锁竞赛信息', reward: { type: 'task', bonus: 1.2 } },
                        { level: 3, label: '友好', threshold: 280, min_affection: 280, desc: '获得专属笔记', reward: { type: 'item', item: '数学秘籍' } },
                        { level: 4, label: '信赖', threshold: 400, min_affection: 400, desc: '推荐参赛资格', reward: { type: 'contest', item: '数学竞赛' } },
                        { level: 5, label: '挚友', threshold: 500, min_affection: 500, desc: '全量剧情解锁', reward: { type: 'all', item: '数学大师称号' } }
                    ],
                    gain_conditions: [
                        { action: 'complete_task', factor: 10, label: '完成数学任务' },
                        { action: 'exam_pass', factor: 30, label: '数学考试通过' },
                        { action: 'contest_join', factor: 40, label: '参加数学竞赛' },
                        { action: 'npc_chat', factor: 1, label: '对话互动' }
                    ],
                    decay: {
                        enabled: true,
                        days: 7,
                        amount: -5,
                        label: '连续7天未完成数学任务'
                    }
                },

                tasks: {
                    category: 'main',
                    task_templates: [
                        {
                            id: 'mentor_li_task_1',
                            icon: '📖',
                            name: '完成高数第一章',
                            desc: '预习并理解高数第一章的核心知识点',
                            difficulty: 'medium',
                            reward: { exp: 40, gold: 20, affection: 12 }
                        }
                    ]
                },

                dialogues: {
                    branches: {
                        low_affection: [
                            '高数很有趣，关键在于理解而非死记。',
                            '有不懂的地方，随时来问。'
                        ],
                        mid_affection: [
                            '你最近的高数作业完成得不错，继续保持！',
                            '有个数学竞赛，我建议你去试试，会很有收获。'
                        ],
                        high_affection: [
                            '你的数学思维进步很快，已经具备了参加竞赛的实力。',
                            '这是我整理的竞赛资料，拿去看看吧。'
                        ]
                    }
                },

                bindings: {
                    task_system: true,
                    ar_system: false,
                    achievement_system: true,
                    map_location: 'location_teaching',
                    ar_marker_id: null
                },

                rarity: 'common',
                exclusive: true
            },

            'mentor_zhao': {
                id: 'mentor_zhao',
                name: '赵英语老师',
                title: '英语教师',
                avatar: '🔤',
                color: '#3b82f6',
                bio: '赵老师发音地道，擅长激发学生对英语学习的兴趣。她相信，语言是连接世界的桥梁学好英语，就等于打开了一扇通往更广阔天地的窗户。',
                personality: '热情开朗、善于鼓励、国际化视野',
                expertise: ['大学英语', '英语口语', '四级备考', '雅思托福'],
                default_greeting: 'Welcome to the world of English! 英语不只是考试科目，更是通向世界的钥匙。跟着我一起，轻松愉快地学英语吧！',
                greeting_placeholder: 'Hello! 今天想聊点什么英语话题？',

                unlock: {
                    type: 'initial',
                    condition: null,
                    related_npc: null,
                    story_sequence: 3
                },

                affection: {
                    initial: 20,
                    max: 500,
                    ranks: [
                        { level: 0, label: '陌生', threshold: 0, min_affection: 0, desc: '仅基础打招呼', reward: null },
                        { level: 1, label: '初识', threshold: 50, min_affection: 50, desc: '获得英语学习建议', reward: { type: 'resource', bonus: 1.0 } },
                        { level: 2, label: '熟悉', threshold: 150, min_affection: 150, desc: '解锁四级备考计划', reward: { type: 'task', bonus: 1.2 } },
                        { level: 3, label: '友好', threshold: 280, min_affection: 280, desc: '获得外教推荐信资格', reward: { type: 'item', item: '外教口语课' } },
                        { level: 4, label: '信赖', threshold: 400, min_affection: 400, desc: '推荐海外交换项目', reward: { type: 'event', item: '交换生选拔' } },
                        { level: 5, label: '挚友', threshold: 500, min_affection: 500, desc: '全量剧情解锁', reward: { type: 'all', item: '英语达人称号' } }
                    ],
                    gain_conditions: [
                        { action: 'complete_task', factor: 10, label: '完成英语任务' },
                        { action: 'cet4_pass', factor: 40, label: '通过英语四级' },
                        { action: 'daily_word', factor: 3, label: '每日背单词' },
                        { action: 'npc_chat', factor: 1, label: '英语对话' }
                    ],
                    decay: {
                        enabled: true,
                        days: 7,
                        amount: -5,
                        label: '连续7天未学习英语'
                    }
                },

                tasks: {
                    category: 'main',
                    task_templates: [
                        {
                            id: 'mentor_zhao_task_1',
                            icon: '📝',
                            name: '四级词汇冲刺',
                            desc: '每天学习并复习20个四级核心词汇',
                            difficulty: 'medium',
                            reward: { exp: 35, gold: 18, affection: 10 }
                        }
                    ]
                },

                dialogues: {
                    branches: {
                        low_affection: [
                            '英语学习，重在积累。试试每天背10个单词？',
                            '想提高口语？多听多说，勇敢开口最重要！'
                        ],
                        mid_affection: [
                            '你的英语进步很明显，继续保持这个劲头！',
                            '四级考试快到了，要不要我帮你制定一个冲刺计划？'
                        ],
                        high_affection: [
                            '你的英语水平已经可以去参加口语比赛了！',
                            '我这儿有个海外交流项目，很适合你，要不要了解一下？'
                        ]
                    }
                },

                bindings: {
                    task_system: true,
                    ar_system: false,
                    achievement_system: true,
                    map_location: null,
                    ar_marker_id: null
                },

                rarity: 'common',
                exclusive: true
            }
        }
    },

    // ============================================
    // 学长型NPC（AR探索+任务完成解锁）
    // ============================================
    senior: {
        category: '学长型',
        category_icon: '👨‍🎓',
        category_desc: '学习经验分享、竞赛攻略、升本/考研指导、校园避坑指南',
        unlock_hint: 'AR扫描教学楼/图书馆标记解锁，完成10个日常学习任务解锁',
        color: '#10b981',

        npcs: {
            'senior_xiaoming': {
                id: 'senior_xiaoming',
                name: '张考研学长',
                title: '上岸学长',
                avatar: '🎓',
                color: '#10b981',
                bio: '张学长去年成功考取了985高校的研究生，是学院里的风云人物。他走过考研这条路，深知其中的艰辛与乐趣。现在，他愿意把自己的经验毫无保留地分享给学弟学妹们。',
                personality: '热心谦逊、经验丰富、善于倾听',
                expertise: ['考研规划', '专业课复习', '心态调整', '面试技巧'],
                default_greeting: '嘿！我是张考研学长，刚刚拿到985的录取通知书！考研这条路我走通了，现在想把经验分享给你。如果你在为考研纠结，来找我聊聊吧！',
                greeting_placeholder: '有什么考研相关的问题，随时来问我！',

                unlock: {
                    type: 'ar_scan',
                    condition: 'AR扫描教学楼或图书馆标记',
                    ar_marker_id: 'marker_teaching_building',
                    related_npc: 'mentor_wang',
                    task_unlock_threshold: 10,
                    story_sequence: 1
                },

                affection: {
                    initial: 0,
                    max: 500,
                    ranks: [
                        { level: 0, label: '陌生', threshold: 0, min_affection: 0, desc: '仅打招呼', reward: null },
                        { level: 1, label: '初识', threshold: 50, min_affection: 50, desc: '获得考研入门指南', reward: { type: 'resource', bonus: 1.0 } },
                        { level: 2, label: '熟悉', threshold: 150, min_affection: 150, desc: '获得专业课复习计划', reward: { type: 'task', bonus: 1.2 } },
                        { level: 3, label: '友好', threshold: 280, min_affection: 280, desc: '获得真题资料', reward: { type: 'item', item: '历年真题集' } },
                        { level: 4, label: '信赖', threshold: 400, min_affection: 400, desc: '获得一对一指导机会', reward: { type: 'buff', item: '考研加持' } },
                        { level: 5, label: '挚友', threshold: 500, min_affection: 500, desc: '获得面试特训', reward: { type: 'all', item: '考研战友称号' } }
                    ],
                    gain_conditions: [
                        { action: 'complete_task', factor: 8, label: '完成任务' },
                        { action: 'exam_pass', factor: 20, label: '考试通过' },
                        { action: 'senior_chat', factor: 3, label: '与学长对话' },
                        { action: 'referral_share', factor: 10, label: '推荐同学认识学长' }
                    ],
                    decay: {
                        enabled: true,
                        days: 10,
                        amount: -3,
                        label: '连续10天未与学长互动'
                    }
                },

                tasks: {
                    category: 'side',
                    task_templates: [
                        {
                            id: 'senior_task_1',
                            icon: '📋',
                            name: '了解考研基本信息',
                            desc: '向张考研学长了解考研流程和复习规划',
                            difficulty: 'easy',
                            reward: { exp: 25, gold: 12, affection: 8 }
                        },
                        {
                            id: 'senior_task_2',
                            icon: '📚',
                            name: '制定考研复习计划',
                            desc: '根据学长建议，制定个人考研复习时间表',
                            difficulty: 'medium',
                            reward: { exp: 50, gold: 25, affection: 15 }
                        }
                    ]
                },

                dialogues: {
                    branches: {
                        low_affection: [
                            '考研最重要的是早点开始规划，不要等到大三才着急。',
                            '英语和数学要尽早复习，专业课也不能落下。'
                        ],
                        mid_affection: [
                            '你现在的基础不错，如果早点开始，成功率会更高。',
                            '我这儿有些复习资料，回头整理给你。'
                        ],
                        high_affection: [
                            '你的复习进度很好，保持下去，985不是梦！',
                            '来，给你看看我当时是怎么复习的，也许能给你些启发。'
                        ]
                    }
                },

                bindings: {
                    task_system: true,
                    ar_system: true,
                    achievement_system: true,
                    map_location: 'location_library',
                    ar_marker_id: 'marker_library',
                    linked_achievements: ['ach_senior_unlock']
                },

                rarity: 'rare',
                exclusive: false
            },

            'senior_contest': {
                id: 'senior_contest',
                name: '林竞赛学长',
                title: '竞赛达人',
                avatar: '🏆',
                color: '#f97316',
                bio: '林学长是各类学科竞赛的常胜将军，获得过国家级竞赛一等奖。他不仅成绩优异，还非常乐于分享自己的备赛经验。他相信竞赛不仅是能力的证明，更是快速成长的最佳途径。',
                personality: '自信干练、效率至上、倾囊相授',
                expertise: ['竞赛规划', '项目经验', '团队协作', '成果展示'],
                default_greeting: '你好！我是竞赛达人林学长。学科竞赛是大学里最快速提升自己的方式之一，你想参加什么竞赛？我可以给你一些建议！',
                greeting_placeholder: '有什么竞赛问题尽管问！',

                unlock: {
                    type: 'task_complete',
                    condition: '完成20个学习任务',
                    ar_marker_id: null,
                    related_npc: 'senior_xiaoming',
                    task_unlock_threshold: 20,
                    story_sequence: 2
                },

                affection: {
                    initial: 0,
                    max: 500,
                    ranks: [
                        { level: 0, label: '陌生', threshold: 0, min_affection: 0, desc: '仅打招呼', reward: null },
                        { level: 1, label: '初识', threshold: 50, min_affection: 50, desc: '获得竞赛入门指导', reward: { type: 'guide', bonus: 1.0 } },
                        { level: 2, label: '熟悉', threshold: 150, min_affection: 150, desc: '获得组队推荐', reward: { type: 'team', bonus: 1.2 } },
                        { level: 3, label: '友好', threshold: 280, min_affection: 280, desc: '邀请参加项目组', reward: { type: 'project', item: '项目参与资格' } },
                        { level: 4, label: '信赖', threshold: 400, min_affection: 400, desc: '获得国赛推荐名额', reward: { type: 'contest', item: '国赛名额' } },
                        { level: 5, label: '挚友', threshold: 500, min_affection: 500, desc: '全量剧情解锁', reward: { type: 'all', item: '竞赛王者称号' } }
                    ],
                    gain_conditions: [
                        { action: 'complete_task', factor: 8, label: '完成任务' },
                        { action: 'contest_join', factor: 30, label: '参加竞赛' },
                        { action: 'contest_win', factor: 50, label: '竞赛获奖' },
                        { action: 'senior_chat', factor: 2, label: '与学长对话' }
                    ],
                    decay: {
                        enabled: true,
                        days: 10,
                        amount: -3,
                        label: '连续10天未与学长互动'
                    }
                },

                tasks: {
                    category: 'side',
                    task_templates: [
                        {
                            id: 'senior_contest_task_1',
                            icon: '💡',
                            name: '寻找感兴趣的竞赛',
                            desc: '了解各类竞赛信息，找到适合自己的参赛方向',
                            difficulty: 'easy',
                            reward: { exp: 30, gold: 15, affection: 10 }
                        }
                    ]
                },

                dialogues: {
                    branches: {
                        low_affection: [
                            '竞赛重在参与，不要怕失败，经验比结果更重要。',
                            '选择竞赛要结合自己的专业和兴趣。'
                        ],
                        mid_affection: [
                            '我有个项目正在组队，你要不要来试试？',
                            '你挺有潜力的，要不要和我一起参加这个竞赛？'
                        ],
                        high_affection: [
                            '你已经有冲击国奖的实力了，加油！',
                            '我这儿有些内部资料，一般人我不告诉他。'
                        ]
                    }
                },

                bindings: {
                    task_system: true,
                    ar_system: true,
                    achievement_system: true,
                    map_location: 'location_lab',
                    ar_marker_id: null,
                    linked_achievements: ['ach_contest_hero']
                },

                rarity: 'rare',
                exclusive: false
            },

            'senior_upgrade': {
                id: 'senior_upgrade',
                name: '陈升本学姐',
                title: '升本成功学姐',
                avatar: '📚',
                color: '#ec4899',
                bio: '陈学姐通过专升本考试，从专科成功升入本科，现在是学院里励志的代名词。她的经历证明了，只要努力，一切皆有可能。她希望用自己的经历鼓励每一个还在奋斗的同学。',
                personality: '坚韧励志、积极乐观、真诚温暖',
                expertise: ['专升本', '自我驱动', '逆袭经验', '学习方法'],
                default_greeting: '嗨！我是陈学姐，从专科一路走到本科，我想说：只要你想，你就可以！不管是升本、考研还是其他目标，来找我聊聊，我们一起努力！',
                greeting_placeholder: '有什么困惑都可以来聊聊！',

                unlock: {
                    type: 'achievement',
                    condition: '解锁「学业起步」成就',
                    ar_marker_id: null,
                    related_npc: null,
                    achievement_id: 'ach_2',
                    story_sequence: 3
                },

                affection: {
                    initial: 15,
                    max: 500,
                    ranks: [
                        { level: 0, label: '陌生', threshold: 0, min_affection: 0, desc: '仅打招呼', reward: null },
                        { level: 1, label: '初识', threshold: 50, min_affection: 50, desc: '获得逆袭经验分享', reward: { type: 'story', bonus: 1.0 } },
                        { level: 2, label: '熟悉', threshold: 150, min_affection: 150, desc: '获得定制复习方案', reward: { type: 'plan', bonus: 1.2 } },
                        { level: 3, label: '友好', threshold: 280, min_affection: 280, desc: '获得学姐全程辅导', reward: { type: 'mentor', item: '专属辅导' } },
                        { level: 4, label: '信赖', threshold: 400, min_affection: 400, desc: '获得升本成功奖学金线索', reward: { type: 'scholarship', item: '奖学金信息' } },
                        { level: 5, label: '挚友', threshold: 500, min_affection: 500, desc: '全量剧情解锁', reward: { type: 'all', item: '逆袭达人称号' } }
                    ],
                    gain_conditions: [
                        { action: 'complete_task', factor: 8, label: '完成任务' },
                        { action: 'daily_signin', factor: 3, label: '每日签到' },
                        { action: 'exam_pass', factor: 20, label: '考试通过' },
                        { action: 'encourage_other', factor: 5, label: '帮助其他同学' }
                    ],
                    decay: {
                        enabled: true,
                        days: 10,
                        amount: -3,
                        label: '连续10天未完成任务'
                    }
                },

                tasks: {
                    category: 'side',
                    task_templates: [
                        {
                            id: 'senior_upgrade_task_1',
                            icon: '✨',
                            name: '聆听学姐的逆袭故事',
                            desc: '与陈学姐交流，了解她的升本历程和心得',
                            difficulty: 'easy',
                            reward: { exp: 20, gold: 10, affection: 10 }
                        }
                    ]
                },

                dialogues: {
                    branches: {
                        low_affection: [
                            '我曾经也很迷茫，但只要不放弃，就一定有希望。',
                            '学习方法比努力更重要，找到适合自己的方式！'
                        ],
                        mid_affection: [
                            '你现在的状态不错，继续保持！',
                            '我当初也是这样过来的，相信自己，你可以的！'
                        ],
                        high_affection: [
                            '你的进步真的很大，我为你骄傲！',
                            '加油！我相信你一定能实现自己的目标。'
                        ]
                    }
                },

                bindings: {
                    task_system: true,
                    ar_system: false,
                    achievement_system: true,
                    map_location: null,
                    ar_marker_id: null,
                    linked_achievements: ['ach_upgrade_success']
                },

                rarity: 'rare',
                exclusive: false
            }
        }
    },

    // ============================================
    // 校园生活NPC（AR场景解锁）
    // ============================================
    campus: {
        category: '校园生活型',
        category_icon: '🏫',
        category_desc: '校园场景引导、日常互动、趣味冷知识、隐藏彩蛋',
        unlock_hint: 'AR扫描对应校园场景标记解锁、地图角落探索触发',
        color: '#8b5cf6',

        npcs: {
            'campus_librarian': {
                id: 'campus_librarian',
                name: '图书馆刘阿姨',
                title: '图书馆管理员',
                avatar: '👩‍💼',
                color: '#8b5cf6',
                bio: '刘阿姨在图书馆工作已经十五年了，她对馆内每一本书的位置都了如指掌。她常说，图书馆是最适合沉淀心灵的地方。找书有困难？问她就对了！',
                personality: '和蔼可亲、博闻广识、善于发现',
                expertise: ['图书推荐', '图书馆资源', '安静学习环境', '校园冷知识'],
                default_greeting: '哟，来图书馆啦！这里可是学校里最安静、氛围最好的地方。想要找什么书？阿姨帮你推荐，保证让你满意！',
                greeting_placeholder: '来图书馆啦？先找个安静的角落坐下来吧！',

                unlock: {
                    type: 'ar_scan',
                    condition: 'AR扫描图书馆标记',
                    ar_marker_id: 'marker_library',
                    related_npc: null,
                    story_sequence: 1
                },

                affection: {
                    initial: 20,
                    max: 500,
                    ranks: [
                        { level: 0, label: '陌生', threshold: 0, min_affection: 0, desc: '点头之交', reward: null },
                        { level: 1, label: '初识', threshold: 50, min_affection: 50, desc: '获得图书推荐', reward: { type: 'book', bonus: 1.0 } },
                        { level: 2, label: '熟悉', threshold: 150, min_affection: 150, desc: '解锁图书馆隐藏区域', reward: { type: 'area', bonus: 1.2 } },
                        { level: 3, label: '友好', threshold: 280, min_affection: 280, desc: '获得珍藏书籍借阅权', reward: { type: 'item', item: '珍藏书籍借阅' } },
                        { level: 4, label: '信赖', threshold: 400, min_affection: 400, desc: '解锁深夜图书馆特权', reward: { type: 'buff', item: '知识光环' } },
                        { level: 5, label: '挚友', threshold: 500, min_affection: 500, desc: '获得专属阅读角', reward: { type: 'all', item: '图书馆之友称号' } }
                    ],
                    gain_conditions: [
                        { action: 'library_visit', factor: 5, label: '访问图书馆' },
                        { action: 'borrow_book', factor: 8, label: '借阅图书' },
                        { action: 'library_study', factor: 10, label: '在图书馆学习' },
                        { action: 'campus_chat', factor: 2, label: '日常互动' }
                    ],
                    decay: {
                        enabled: false,
                        days: 0,
                        amount: 0,
                        label: null
                    }
                },

                tasks: {
                    category: 'daily',
                    task_templates: [
                        {
                            id: 'campus_lib_task_1',
                            icon: '📖',
                            name: '借阅一本专业书籍',
                            desc: '去图书馆借阅一本与专业相关的书籍',
                            difficulty: 'easy',
                            reward: { exp: 20, gold: 10, affection: 8 }
                        }
                    ]
                },

                dialogues: {
                    branches: {
                        low_affection: [
                            '二楼有个安静的角落，很适合自习。',
                            '三楼的小说区最近进了不少新书，去看看吧。'
                        ],
                        mid_affection: [
                            '你经常来图书馆啊，这种习惯很好！',
                            '对了，三楼有个彩蛋书架，新生一般不知道哦~'
                        ],
                        high_affection: [
                            '你是图书馆的常客了，这个珍藏借阅证给你用！',
                            '深夜图书馆的钥匙我这儿有，需要的时候来找我。'
                        ]
                    }
                },

                bindings: {
                    task_system: true,
                    ar_system: true,
                    achievement_system: true,
                    map_location: 'location_library',
                    ar_marker_id: 'marker_library'
                },

                rarity: 'common',
                exclusive: false,
                easter_egg_chance: 0.3
            },

            'campus_canteen': {
                id: 'campus_canteen',
                name: '食堂王阿姨',
                title: '食堂工作人员',
                avatar: '🍳',
                color: '#f97316',
                bio: '王阿姨负责食堂的某个窗口，她打菜从不手抖，总是最照顾学生的。她烧的一手好菜，很多毕业生念念不忘学校的味道。',
                personality: '热情爽朗、关怀备至、美食达人',
                expertise: ['食堂攻略', '校园美食', '营养搭配', '隐藏窗口'],
                default_greeting: '孩子，来吃饭啦？今天有新品，我给你多打点！吃饱了才有力气学习啊！',
                greeting_placeholder: '来啦？今天想吃什么，阿姨给你留好吃的！',

                unlock: {
                    type: 'ar_scan',
                    condition: 'AR扫描食堂标记',
                    ar_marker_id: 'marker_canteen',
                    related_npc: null,
                    story_sequence: 2
                },

                affection: {
                    initial: 30,
                    max: 500,
                    ranks: [
                        { level: 0, label: '陌生', threshold: 0, min_affection: 0, desc: '点头之交', reward: null },
                        { level: 1, label: '初识', threshold: 50, min_affection: 50, desc: '获得美食攻略', reward: { type: 'guide', bonus: 1.0 } },
                        { level: 2, label: '熟悉', threshold: 150, min_affection: 150, desc: '解锁隐藏窗口', reward: { type: 'secret', bonus: 1.2 } },
                        { level: 3, label: '友好', threshold: 280, min_affection: 280, desc: '获得专属加量特权', reward: { type: 'buff', item: '阿姨疼爱' } },
                        { level: 4, label: '信赖', threshold: 400, min_affection: 400, desc: '获得神秘菜品预告', reward: { type: 'event', item: '限定美食' } },
                        { level: 5, label: '挚友', threshold: 500, min_affection: 500, desc: '获得隐藏食谱', reward: { type: 'all', item: '美食家称号' } }
                    ],
                    gain_conditions: [
                        { action: 'canteen_eat', factor: 3, label: '来食堂吃饭' },
                        { action: 'try_new_dish', factor: 5, label: '尝试新菜品' },
                        { action: 'canteen_help', factor: 8, label: '帮助阿姨' },
                        { action: 'campus_chat', factor: 2, label: '日常互动' }
                    ],
                    decay: {
                        enabled: false,
                        days: 0,
                        amount: 0,
                        label: null
                    }
                },

                tasks: {
                    category: 'daily',
                    task_templates: [
                        {
                            id: 'campus_canteen_task_1',
                            icon: '🍜',
                            name: '探索食堂美食',
                            desc: '去食堂探索不同的窗口，发现隐藏的美味',
                            difficulty: 'easy',
                            reward: { exp: 15, gold: 8, affection: 5 }
                        }
                    ]
                },

                dialogues: {
                    branches: {
                        low_affection: [
                            '孩子，今天的糖醋排骨不错，来一份？',
                            '吃饱了才有力气学习，别亏待自己！'
                        ],
                        mid_affection: [
                            '你又来啦！今天的红烧肉是阿姨的拿手菜。',
                            '后厨有个小秘密窗口，一般人我不告诉他，嘿嘿~'
                        ],
                        high_affection: [
                            '来来来，今天给你留了份私房菜，别声张啊！',
                            '我这儿有个美食群，要不要进来？里面全是学校周边的美食攻略！'
                        ]
                    }
                },

                bindings: {
                    task_system: true,
                    ar_system: true,
                    achievement_system: true,
                    map_location: 'location_canteen',
                    ar_marker_id: 'marker_canteen'
                },

                rarity: 'common',
                exclusive: false,
                easter_egg_chance: 0.4
            },

            'campus_security': {
                id: 'campus_security',
                name: '保安李师傅',
                title: '校园保安',
                avatar: '🛡️',
                color: '#64748b',
                bio: '李师傅是校园的"守护神"，每天巡逻在校园的各个角落。他对学校的安全状况了如指掌，也是校园里消息最灵通的人。深夜有什么紧急情况，找他准没错！',
                personality: '沉稳可靠、见多识广、正义感强',
                expertise: ['校园安全', '路况信息', '校园传说', '失物招领'],
                default_greeting: '站住！...哦，是你啊！校园里注意安全，晚上别太晚回宿舍。有什么需要帮忙的，尽管说！',
                greeting_placeholder: '校园里有什么异常情况，记得第一时间告诉我！',

                unlock: {
                    type: 'ar_scan',
                    condition: 'AR扫描校门标记',
                    ar_marker_id: 'marker_gate',
                    related_npc: null,
                    story_sequence: 3
                },

                affection: {
                    initial: 15,
                    max: 500,
                    ranks: [
                        { level: 0, label: '陌生', threshold: 0, min_affection: 0, desc: '点头之交', reward: null },
                        { level: 1, label: '初识', threshold: 50, min_affection: 50, desc: '获得安全提示', reward: { type: 'safety', bonus: 1.0 } },
                        { level: 2, label: '熟悉', threshold: 150, min_affection: 150, desc: '获得校园情报', reward: { type: 'info', bonus: 1.2 } },
                        { level: 3, label: '友好', threshold: 280, min_affection: 280, desc: '解锁深夜校园通行', reward: { type: 'access', item: '夜间通行卡' } },
                        { level: 4, label: '信赖', threshold: 400, min_affection: 400, desc: '获得校史馆钥匙', reward: { type: 'key', item: '校史馆通行证' } },
                        { level: 5, label: '挚友', threshold: 500, min_affection: 500, desc: '解锁所有校园秘密', reward: { type: 'all', item: '校园守护者称号' } }
                    ],
                    gain_conditions: [
                        { action: 'security_report', factor: 5, label: '报告安全问题' },
                        { action: 'night_explore', factor: 10, label: '深夜探索' },
                        { action: 'lost_found', factor: 8, label: '协助寻找失物' },
                        { action: 'campus_chat', factor: 2, label: '日常互动' }
                    ],
                    decay: {
                        enabled: false,
                        days: 0,
                        amount: 0,
                        label: null
                    }
                },

                tasks: {
                    category: 'daily',
                    task_templates: [
                        {
                            id: 'campus_security_task_1',
                            icon: '🔍',
                            name: '了解校园安全须知',
                            desc: '向李师傅了解校园安全注意事项',
                            difficulty: 'easy',
                            reward: { exp: 15, gold: 8, affection: 5 }
                        }
                    ]
                },

                dialogues: {
                    branches: {
                        low_affection: [
                            '校园里晚上注意安全，别一个人走偏僻的地方。',
                            '有什么异常情况第一时间告诉我！'
                        ],
                        mid_affection: [
                            '你挺机灵的，知道哪些地方要注意安全。',
                            '深夜探险家？小心点，有些地方晚上可不能乱闯。'
                        ],
                        high_affection: [
                            '你已经是我的老朋友了，校史馆的钥匙给你一把。',
                            '有些校园传说，只有我们这些老员工知道，你想知道吗？'
                        ]
                    }
                },

                bindings: {
                    task_system: true,
                    ar_system: true,
                    achievement_system: true,
                    map_location: 'location_gate',
                    ar_marker_id: 'marker_gate'
                },

                rarity: 'common',
                exclusive: false,
                easter_egg_chance: 0.25
            },

            'campus_club': {
                id: 'campus_club',
                name: '社团联合会长小林',
                title: '社团联会长',
                avatar: '🎭',
                color: '#06b6d4',
                bio: '小林是学校社团联合会的会长，组织过上百场校园活动。她精力充沛，人脉广泛，是校园里最活跃的人之一。想要了解社团动态？找她就对了！',
                personality: '活泼热情、组织能力强、人脉广泛',
                expertise: ['社团活动', '校园事件', '人脉资源', '活动策划'],
                default_greeting: '嗨！我是社团联会长小林！校园里有超多精彩的社团活动，一起来玩吧！加入社团是认识朋友、拓展兴趣的最好方式哦！',
                greeting_placeholder: '最近有个很棒的活动，要不要一起来？',

                unlock: {
                    type: 'ar_scan',
                    condition: 'AR扫描操场标记',
                    ar_marker_id: 'marker_playground',
                    related_npc: null,
                    story_sequence: 4
                },

                affection: {
                    initial: 20,
                    max: 500,
                    ranks: [
                        { level: 0, label: '陌生', threshold: 0, min_affection: 0, desc: '点头之交', reward: null },
                        { level: 1, label: '初识', threshold: 50, min_affection: 50, desc: '获得活动邀请', reward: { type: 'event', bonus: 1.0 } },
                        { level: 2, label: '熟悉', threshold: 150, min_affection: 150, desc: '解锁社团推荐', reward: { type: 'club', bonus: 1.2 } },
                        { level: 3, label: '友好', threshold: 280, min_affection: 280, desc: '获得活动策划资格', reward: { type: 'organize', item: '活动组织权' } },
                        { level: 4, label: '信赖', threshold: 400, min_affection: 400, desc: '推荐加入核心社团', reward: { type: 'elite', item: '精英社团推荐' } },
                        { level: 5, label: '挚友', threshold: 500, min_affection: 500, desc: '全量剧情解锁', reward: { type: 'all', item: '社交达人称号' } }
                    ],
                    gain_conditions: [
                        { action: 'join_activity', factor: 10, label: '参加社团活动' },
                        { action: 'organize_activity', factor: 20, label: '组织活动' },
                        { action: 'invite_friend', factor: 5, label: '邀请朋友参加' },
                        { action: 'campus_chat', factor: 2, label: '日常互动' }
                    ],
                    decay: {
                        enabled: false,
                        days: 0,
                        amount: 0,
                        label: null
                    }
                },

                tasks: {
                    category: 'side',
                    task_templates: [
                        {
                            id: 'campus_club_task_1',
                            icon: '🎪',
                            name: '参加社团招新',
                            desc: '去看看社团招新，找一个感兴趣的社团加入',
                            difficulty: 'easy',
                            reward: { exp: 25, gold: 12, affection: 8 }
                        }
                    ]
                },

                dialogues: {
                    branches: {
                        low_affection: [
                            '校园里有几十个社团，总有一个适合你！',
                            '想找什么样的活动？告诉我，我帮你推荐！'
                        ],
                        mid_affection: [
                            '你越来越活跃了！下周有个大型活动，一起参加吧？',
                            '社团联的门永远为你敞开！'
                        ],
                        high_affection: [
                            '你已经是社团的核心成员了，要不要考虑自己组织一场活动？',
                            '我这儿有些内部消息，一般社团成员可不知道哦~'
                        ]
                    }
                },

                bindings: {
                    task_system: true,
                    ar_system: true,
                    achievement_system: true,
                    map_location: 'location_playground',
                    ar_marker_id: 'marker_playground'
                },

                rarity: 'common',
                exclusive: false,
                easter_egg_chance: 0.35
            }
        }
    },

    // ============================================
    // 兴趣型NPC（公会/组队系统解锁）
    // ============================================
    club: {
        category: '兴趣型',
        category_icon: '🎨',
        category_desc: '兴趣拓展引导、社团招募、组队任务发布、社交玩法引导',
        unlock_hint: '完成对应兴趣类成就解锁、加入公会/组队解锁',
        color: '#ec4899',

        npcs: {
            'club_tech': {
                id: 'club_tech',
                name: '技术社社长阿杰',
                title: '技术社社长',
                avatar: '💻',
                color: '#3b82f6',
                bio: '阿杰是学校技术社的创始人，精通编程、硬件和各类新技术。他创办的社团已经孵化出多个成功项目。他相信，技术是改变世界的力量，愿意帮助每一个热爱技术的同学。',
                personality: '极客精神、乐于分享、追求卓越',
                expertise: ['编程技术', '项目开发', '开源协作', '技术分享'],
                default_greeting: 'Hey！我是技术社社长阿杰。代码改变世界，你想学编程吗？从Python到前端，从AI到区块链，我都可以带你入门！来技术社，一起做出酷炫的项目！',
                greeting_placeholder: '有什么技术问题？来技术社一起探讨！',

                unlock: {
                    type: 'guild_join',
                    condition: '加入或创建公会',
                    related_npc: null,
                    guild_required: true,
                    story_sequence: 1
                },

                affection: {
                    initial: 10,
                    max: 500,
                    ranks: [
                        { level: 0, label: '陌生', threshold: 0, min_affection: 0, desc: '点头之交', reward: null },
                        { level: 1, label: '初识', threshold: 50, min_affection: 50, desc: '获得技术学习路线', reward: { type: 'roadmap', bonus: 1.0 } },
                        { level: 2, label: '熟悉', threshold: 150, min_affection: 150, desc: '加入项目组', reward: { type: 'project', bonus: 1.2 } },
                        { level: 3, label: '友好', threshold: 280, min_affection: 280, desc: '获得开源项目参与资格', reward: { type: 'opensource', item: '项目贡献者' } },
                        { level: 4, label: '信赖', threshold: 400, min_affection: 400, desc: '获得实习推荐', reward: { type: 'internship', item: '实习机会' } },
                        { level: 5, label: '挚友', threshold: 500, min_affection: 500, desc: '共同创业支持', reward: { type: 'all', item: '技术大牛称号' } }
                    ],
                    gain_conditions: [
                        { action: 'code_commit', factor: 10, label: '提交代码' },
                        { action: 'project_join', factor: 15, label: '参与项目' },
                        { action: 'tech_share', factor: 8, label: '技术分享' },
                        { action: 'club_chat', factor: 3, label: '技术交流' }
                    ],
                    decay: {
                        enabled: true,
                        days: 14,
                        amount: -2,
                        label: '连续14天未参与技术社群'
                    }
                },

                tasks: {
                    category: 'side',
                    task_templates: [
                        {
                            id: 'club_tech_task_1',
                            icon: '⌨️',
                            name: '完成第一个编程小项目',
                            desc: '跟随技术社学习，完成一个简单的编程作品',
                            difficulty: 'medium',
                            reward: { exp: 60, gold: 30, affection: 20 }
                        }
                    ]
                },

                dialogues: {
                    branches: {
                        low_affection: [
                            '编程入门不难，关键是多动手练习。',
                            'GitHub是个好地方，去逛逛吧！'
                        ],
                        mid_affection: [
                            '你学得很快！要不要一起来做这个项目？',
                            '开源社区有很多学习资源，要我推荐几个吗？'
                        ],
                        high_affection: [
                            '你已经是技术社的核心成员了，这个项目你来主导吧！',
                            '有家科技公司在招实习生，我觉得你很合适，要不要内推？'
                        ]
                    }
                },

                bindings: {
                    task_system: true,
                    ar_system: false,
                    achievement_system: true,
                    map_location: null,
                    ar_marker_id: null,
                    linked_guild: true
                },

                rarity: 'rare',
                exclusive: false,
                easter_egg_chance: 0.2
            },

            'club_art': {
                id: 'club_art',
                name: '美术社社长小雅',
                title: '美术社社长',
                avatar: '🎨',
                color: '#ec4899',
                bio: '小雅是美术学院的学生，也是校园里最会画画的人。她的画作曾在比赛中获奖，更难得的是，她愿意把自己的技巧毫无保留地分享给每一个热爱艺术的同学。',
                personality: '细腻敏感、审美出众、温柔鼓励',
                expertise: ['绘画技巧', '色彩搭配', '设计思维', '艺术鉴赏'],
                default_greeting: 'Hi~我是美术社的小雅！画画是一种表达自我的方式，不需要基础，只要你有热爱！来美术社，一起用画笔记录校园的美好吧~',
                greeting_placeholder: '今天想画点什么吗？',

                unlock: {
                    type: 'achievement',
                    condition: '解锁「兴趣拓展」成就',
                    related_npc: null,
                    achievement_id: 'ach_interest_1',
                    story_sequence: 2
                },

                affection: {
                    initial: 15,
                    max: 500,
                    ranks: [
                        { level: 0, label: '陌生', threshold: 0, min_affection: 0, desc: '点头之交', reward: null },
                        { level: 1, label: '初识', threshold: 50, min_affection: 50, desc: '获得绘画教程', reward: { type: 'tutorial', bonus: 1.0 } },
                        { level: 2, label: '熟悉', threshold: 150, min_affection: 150, desc: '获得专属画具借用权', reward: { type: 'item', bonus: 1.2 } },
                        { level: 3, label: '友好', threshold: 280, min_affection: 280, desc: '参加画展机会', reward: { type: 'exhibition', item: '画展参与' } },
                        { level: 4, label: '信赖', threshold: 400, min_affection: 400, desc: '获得联合创作邀请', reward: { type: 'collab', item: '合作创作' } },
                        { level: 5, label: '挚友', threshold: 500, min_affection: 500, desc: '举办个人画展', reward: { type: 'all', item: '艺术达人称号' } }
                    ],
                    gain_conditions: [
                        { action: 'art_create', factor: 10, label: '创作作品' },
                        { action: 'art_share', factor: 8, label: '分享作品' },
                        { action: 'club_chat', factor: 3, label: '日常交流' }
                    ],
                    decay: {
                        enabled: false,
                        days: 0,
                        amount: 0,
                        label: null
                    }
                },

                tasks: {
                    category: 'side',
                    task_templates: [
                        {
                            id: 'club_art_task_1',
                            icon: '🖼️',
                            name: '创作一幅校园风景画',
                            desc: '用画笔记录校园里最美的一个角落',
                            difficulty: 'easy',
                            reward: { exp: 30, gold: 15, affection: 10 }
                        }
                    ]
                },

                dialogues: {
                    branches: {
                        low_affection: [
                            '画画不需要天赋，只需要观察和练习。',
                            '校园里有很多美丽的角落，值得被记录下来。'
                        ],
                        mid_affection: [
                            '你越来越有感觉了！来参加我们的画展吧。',
                            '我这儿有套专业画具，你想试试吗？'
                        ],
                        high_affection: [
                            '你的作品越来越有个人风格了！',
                            '要不要和我一起创作一幅校园壁画？这会是一个很棒的经历。'
                        ]
                    }
                },

                bindings: {
                    task_system: true,
                    ar_system: false,
                    achievement_system: true,
                    map_location: null,
                    ar_marker_id: null
                },

                rarity: 'rare',
                exclusive: false,
                easter_egg_chance: 0.3
            }
        }
    },

    // ============================================
    // 自定义动漫NPC（稀有成就解锁，可选扩展）
    // ============================================
    custom: {
        category: '自定义型',
        category_icon: '✨',
        category_desc: '个性化陪伴、专属对话、定制化学习提醒',
        unlock_hint: '解锁稀有成就、AR探索100%进度解锁',
        color: '#fbbf24',

        npcs: {
            'custom_pixel_hero': {
                id: 'custom_pixel_hero',
                name: '像素冒险家',
                title: '神秘来客',
                avatar: '🧙',
                color: '#fbbf24',
                bio: '来自像素世界的冒险家，穿越次元壁来到校园。他带来了游戏世界的奇幻与冒险，用独特的视角帮助学生发现学习和成长的乐趣。他相信，每一段校园经历都是一场精彩的冒险。',
                personality: '神秘莫测、充满童趣、游戏化思维',
                expertise: ['游戏化学习', '冒险故事', '次元穿越', '像素艺术'],
                default_greeting: '旅人，你好！我是来自像素世界的冒险家，在这里你可以把学习变成一场冒险，每完成一个任务就像打败一只Boss！准备好开始你的校园冒险了吗？',
                greeting_placeholder: '今日冒险准备好了吗？',

                unlock: {
                    type: 'exploration_complete',
                    condition: 'AR探索达到100%完成度',
                    related_npc: null,
                    exploration_threshold: 100,
                    story_sequence: 1
                },

                affection: {
                    initial: 0,
                    max: 500,
                    ranks: [
                        { level: 0, label: '陌生', threshold: 0, min_affection: 0, desc: '仅初次相遇', reward: null },
                        { level: 1, label: '初识', threshold: 50, min_affection: 50, desc: '解锁冒险任务', reward: { type: 'quest', bonus: 1.0 } },
                        { level: 2, label: '熟悉', threshold: 150, min_affection: 150, desc: '解锁冒险地图', reward: { type: 'map', bonus: 1.2 } },
                        { level: 3, label: '友好', threshold: 280, min_affection: 280, desc: '解锁冒险装备', reward: { type: 'gear', item: '冒险装备' } },
                        { level: 4, label: '信赖', threshold: 400, min_affection: 400, desc: '解锁隐藏关卡', reward: { type: 'dungeon', item: '隐藏副本' } },
                        { level: 5, label: '挚友', threshold: 500, min_affection: 500, desc: '完全解锁冒险世界', reward: { type: 'all', item: '冒险大师称号' } }
                    ],
                    gain_conditions: [
                        { action: 'adventure_task', factor: 15, label: '完成冒险任务' },
                        { action: 'boss_defeat', factor: 30, label: '攻克学业Boss' },
                        { action: 'dungeon_clear', factor: 25, label: '通关学习副本' },
                        { action: 'custom_chat', factor: 2, label: '冒险对话' }
                    ],
                    decay: {
                        enabled: true,
                        days: 7,
                        amount: -3,
                        label: '连续7天未进行冒险'
                    }
                },

                tasks: {
                    category: 'hidden',
                    task_templates: [
                        {
                            id: 'custom_task_1',
                            icon: '⚔️',
                            name: '开启冒险序章',
                            desc: '与像素冒险家对话，开启你的校园冒险之旅',
                            difficulty: 'easy',
                            reward: { exp: 50, gold: 25, affection: 20 }
                        }
                    ]
                },

                dialogues: {
                    branches: {
                        low_affection: [
                            '在这个世界里，每一次学习都是一次冒险，拿起你的剑（笔）吧！',
                            '校园就是你的地图，每一个地点都是一个待探索的关卡！'
                        ],
                        mid_affection: [
                            '你已经解锁了新的冒险地图！继续探索吧！',
                            '听说有个隐藏副本在学习楼里...嘿嘿，要不要去看看？'
                        ],
                        high_affection: [
                            '你是真正的冒险者！我把我最珍贵的冒险装备送给你！',
                            '校园的每一个角落都已经被你探索遍了，现在是时候挑战终极Boss了！'
                        ]
                    }
                },

                bindings: {
                    task_system: true,
                    ar_system: true,
                    achievement_system: true,
                    map_location: null,
                    ar_marker_id: null,
                    linked_achievements: ['ach_explorer_master']
                },

                rarity: 'legendary',
                exclusive: true,
                easter_egg_chance: 0.5
            }
        }
    }
};

// ============================================
// AR标记与NPC解锁点映射
// ============================================
const NPC_AR_MAPPINGS = {
    // AR标记ID -> 可解锁的NPC ID列表
    'marker_teaching_building': ['senior_xiaoming'],
    'marker_library': ['campus_librarian'],
    'marker_canteen': ['campus_canteen'],
    'marker_gate': ['campus_security'],
    'marker_playground': ['campus_club'],
    'marker_dorm': [],
    'marker_sports': [],
    'marker_lab': ['senior_contest'],
    'marker_museum': [],
    'marker_administration': [],
    'marker_garden': [],
    'marker_cafe': []
};

// ============================================
// NPC解锁状态存储键名常量
// ============================================
const NPC_STORAGE_KEYS = {
    unlocked_npcs: 'campus_rpg_npc_unlocked',      // 已解锁NPC列表
    npc_relations: 'campus_rpg_npc_relations',    // NPC好感度关系
    npc_dialogue_history: 'campus_rpg_npc_history', // 对话历史
    npc_daily_interactions: 'campus_rpg_npc_daily', // 每日互动记录
    npc_egg_triggered: 'campus_rpg_npc_eggs',       // 已触发彩蛋记录
    npc_last_active: 'campus_rpg_npc_last_active'  // NPC最后活跃时间
};

// ============================================
// 彩蛋配置
// ============================================
const NPC_EASTER_EGGS = {
    // 角落探索彩蛋
    corner: [
        {
            id: 'egg_corner_1',
            trigger: 'explore_dorm_corner',
            npc: 'campus_security',
            title: '深夜发现',
            message: '李师傅发现你深夜还在校园里徘徊："这么晚还在外面？注意安全啊孩子，有什么事跟叔叔说！"',
            reward: { exp: 15, gold: 8 },
            action: 'night_explore'
        },
        {
            id: 'egg_corner_2',
            trigger: 'explore_roof',
            npc: 'campus_club',
            title: '天台惊喜',
            message: '小林正在天台布置社团活动道具："哟！你怎么找到这里的？这里是我们的秘密基地哦，一般人我不告诉他~"',
            reward: { exp: 20, gold: 10 },
            action: 'secret_found'
        }
    ],

    // 时间专属彩蛋
    time: {
        morning: {
            trigger: { start: 7, end: 8 },
            npc: 'mentor_wang',
            title: '早安鼓励',
            message: '王辅导员：早上好！早起的鸟儿有虫吃，早起的学生有福气！今天有什么计划？记得吃早餐哦！',
            reward: { exp: 10, gold: 5, affection: 2 },
            action: 'morning_signin'
        },
        exam_week: {
            trigger: { condition: 'exam_week' },
            npc: 'mentor_li',
            title: '考试祝福',
            message: '李高数老师：考试周到了！保持冷静，相信自己。你已经做好了充分的准备，一定可以的！加油！',
            reward: { exp: 20, gold: 10, affection: 5 },
            action: 'exam_encourage'
        },
        late_night: {
            trigger: { start: 22, end: 23 },
            npc: 'campus_librarian',
            title: '深夜关怀',
            message: '图书馆刘阿姨通过系统发来消息：孩子，都这么晚了还在学习吗？身体是革命的本钱，早点休息，明天继续加油！',
            reward: { exp: 10, gold: 5, affection: 3 },
            action: 'late_study'
        },
        weekend: {
            trigger: { condition: 'weekend' },
            npc: 'club_tech',
            title: '周末邀请',
            message: '技术社阿杰：周末啦！来参加我们技术社的周末黑客松吧！一群人一起coding，比一个人宅宿舍有意思多了！',
            reward: { exp: 30, gold: 15, affection: 8 },
            action: 'weekend_activity'
        }
    },

    // 成就触发彩蛋
    achievement: [
        {
            id: 'egg_ach_first_task',
            trigger: 'ach_first_task',
            npc: 'mentor_wang',
            title: '首战告捷！',
            message: '王辅导员发来贺电："恭喜你完成了第一个学习任务！这只是开始，相信你会越来越棒的！"',
            reward: { exp: 50, gold: 25, affection: 10 },
            all_npc_blessing: true
        },
        {
            id: 'egg_ach_level_up',
            trigger: 'ach_level_up',
            npc: 'all',
            title: '等级提升！',
            message: '所有NPC联合发来祝福：恭喜你又变强了！继续保持，你的成长让我们都感到骄傲！',
            reward: { exp: 100, gold: 50, title: '成长之星' },
            all_npc_blessing: true
        }
    ],

    // 连续互动彩蛋
    streak: {
        3: {
            npc: 'mentor_wang',
            title: '三日相伴',
            message: '王辅导员：连续三天和我互动了！不错不错，这种坚持的劲儿用在学习上，一定能成功！',
            reward: { affection_bonus: 1.5 }
        },
        7: {
            npc: 'mentor_wang',
            title: '一周知音',
            message: '王辅导员：整整一周了！你已经成为我的常客了，送你一个小礼物作为纪念。',
            reward: { affection: 20, item: '辅导员徽章' }
        },
        15: {
            npc: 'mentor_wang',
            title: '半月挚友',
            message: '王辅导员：半个多月了！我们已经是真正的朋友了，以后有什么困难尽管找我。',
            reward: { affection: 50, title: '导员之友' }
        }
    }
};

// ============================================
// 导出到全局
// ============================================
window.NPC_ECOSYSTEM_DATA = NPC_ECOSYSTEM_DATA;
window.NPC_AR_MAPPINGS = NPC_AR_MAPPINGS;
window.NPC_STORAGE_KEYS = NPC_STORAGE_KEYS;
window.NPC_EASTER_EGGS = NPC_EASTER_EGGS;
