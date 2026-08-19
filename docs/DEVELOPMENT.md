# 开发运行说明

## 技术栈

| 层级 | 技术 |
|---|---|
| 前端 | React 19、TypeScript、Vite、Tailwind CSS 4、Lucide、Recharts |
| 服务端 | Express 4、tRPC 11、SuperJSON |
| 数据 | Drizzle ORM、MySQL/TiDB；账本业务数据优先保存在浏览器本地存储 |
| 认证 | Manus OAuth、JWT 会话 |
| 测试 | Vitest、JSDOM、真实 Chromium 移动端回归 |
| 导出 | `xlsx` 生成月度成本报告 |

## 目录结构

```text
client/
  src/pages/Home.tsx              # 移动端应用壳、首页、商品、经营、成本分析与各弹层
  src/lib/ledgerStore.ts           # 账本模型、成本计算、销售快照、退款与分摊算法
  src/lib/validation.ts            # 表单与业务输入校验
  src/lib/*.test.ts(x)             # 核算与组件回归
  src/design-system.css            # 后置设计令牌迁移层
  src/index.css                    # 品牌基础样式和全局令牌
  src/components/                  # 定价、BOM、快速成本、月度分摊等可复用组件
server/
  routers.ts                       # tRPC 路由
  db.ts                            # 数据访问函数
  _core/                           # Express、OAuth、tRPC、Vite 桥接与平台能力
drizzle/
  schema.ts                        # 数据库结构
docs/                              # 产品、设计、架构、核算和发布资料
```

## 本地运行

安装依赖后执行：

```bash
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` 会运行 `server/_core/index.ts`，而非单独启动 Vite。浏览器访问地址由启动日志输出；生产模式使用：

```bash
pnpm build
pnpm start
```

## 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm test` | 运行 Vitest 单元与组件测试 |
| `pnpm build` | 构建客户端与服务端生产产物 |
| `pnpm check` | 执行 TypeScript 类型检查 |
| `pnpm format` | 使用 Prettier 格式化项目文件 |
| `pnpm db:generate` | 依据 Drizzle schema 生成迁移草案 |

## 环境变量与安全

项目模板在运行环境中注入数据库、OAuth、JWT、存储与平台服务变量。开发者应通过环境管理界面或受控密钥系统配置它们，**不得**提交 `.env`、访问令牌、会话 Cookie、数据库连接串或导出的用户账本。

常见变量类别包括：`DATABASE_URL`、`JWT_SECRET`、`VITE_APP_ID`、`OAUTH_SERVER_URL`、`VITE_OAUTH_PORTAL_URL` 与平台服务地址/密钥。变量名称可公开记录，变量值不可写入代码、文档示例或 GitHub Issue。

## 数据库变更

数据库表用于用户、云端账本备份和消息系统。变更遵循以下顺序：

1. 先修改 `drizzle/schema.ts`。
2. 运行 `pnpm db:generate` 生成迁移草案。
3. 审阅 SQL，按依赖顺序通过受控数据库迁移流程应用。
4. 更新服务端数据函数、tRPC 过程、测试和前端状态。

账本计算的主业务数据仍以 `localStorage` 键 `suandeqing-ledger-v1` 为本机编辑源；云端备份不会替代未确认的本机版本。

## UI 开发约定

页面使用 8px 间距、命名圆角、字体、按钮和 44px 触控令牌。新页面优先复用 `client/src/design-system.css` 中的令牌化组合，而不是添加随机像素值。任何影响移动端表单、图表或固定导航的改动都应复核 375、390、414 宽度。
