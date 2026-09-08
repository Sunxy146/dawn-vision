# 晓阳叙影 · DawnVision

竖屏漫剧 AI 创作工台：从创意到分镜、成片，由多 Agent 协作完成。

## 功能概览

- **创作工坊**：创意输入 → 导演 / 编剧 / 角色 / 场景 / 分镜 / 视频 / 成片
- **角色锁脸（Cameo）**：上传 1–3 张参考脸，后续出图/视频按角色名匹配注入
- **导演台**：按环节查看进度，支持单环节重跑与续跑
- **资产库**：角色、分镜、镜头视频、成片统一管理

## 环境要求

- Node.js 20+
- npm 10+

## 快速开始

```bash
npm install
npm rebuild better-sqlite3
cp .env.example .env.local   # Windows: copy .env.example .env.local
npm run dev -- -p 3100
```

| 入口 | 地址 |
|---|---|
| 首页 | http://localhost:3100 |
| 控制台 | http://localhost:3100/dashboard |
| 创作工坊 | http://localhost:3100/dashboard/create |

## 常用环境变量

在 `.env.local` 中配置（勿提交密钥）：

| 变量 | 说明 |
|---|---|
| `NEXT_PUBLIC_DAWNVISION_SHELL=1` | 本地壳模式，自动签发开发用 JWT |
| `MOCK_ENGINES=0` | `1` 走本地 mock；`0` 调用真实模型 |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` | 文本 Agent（导演、编剧等） |
| `DASHSCOPE_IMAGE_ENABLED=1` | 开启百炼文生图 |
| `DASHSCOPE_IMAGE_MODEL` | 生图主模型（见 `.env.example`） |
| `DASHSCOPE_VIDEO_ENABLED=1` | 开启百炼图生视频 |
| `DASHSCOPE_VIDEO_MODEL` | 视频主模型 |
| `DASHSCOPE_VIDEO_RESOLUTION` | `720P` / `1080P` |

完整示例见 [.env.example](.env.example)。

## 技术栈

- Next.js（App Router）+ React + TypeScript
- SQLite（本地开发）/ 可选 PostgreSQL
- 百炼 DashScope 等模型服务（生图 / 图生视频 / LLM）

## 提示词位置

创作管线主提示词集中在：

- `lib/mckee-skill.ts` — 导演 / 编剧 / 角色 / 场景 / 分镜
- `lib/slim-prompts.ts`、`lib/master-prompt.ts`、`lib/prompt-templates.ts`
- `skills/` — Skill 文档与示例

## 文档

- [中文说明](README.zh-CN.md)
- [贡献指南](CONTRIBUTING.md)
- [安全说明](SECURITY.md)
- [路线图](ROADMAP.md)

## License

见 [LICENSE](LICENSE)。
