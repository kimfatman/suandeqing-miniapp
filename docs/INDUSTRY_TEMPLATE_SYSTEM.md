# 行业模板系统

## 目标与边界

行业模板系统将行业差异集中在 `client/src/lib/industryTemplates.ts`。它只提供行业配置、版本和解析能力；本期**不改变**成本计算、销售结转、现金汇总、退款回滚、库存变动、页面结构或交互流程，也不引入后台和 AI。

## 配置契约

每份官方模板都必须通过 `IndustryTemplateSchema` 校验，并带有稳定 `id`、模板自身 `version` 与 `status`。当前各模板初始版本为 `1`，配置包含行业名称、经营项目名称、默认分类、成本项、能力开关、核心指标、首页指标排序，以及当前页面仍在使用的成本录入文案和快速成本预设。

| 配置层 | 存放位置 | 可变性 | 用途 |
|---|---|---|---|
| 官方模板 | `OFFICIAL_INDUSTRY_TEMPLATES` | 深层冻结、只读 | 产品默认值与未来行业扩展基线 |
| 用户覆盖 | `profile.industryTemplateOverrides` | 每个本地账本独立保存 | 名称、经营项目、附加分类/成本项、能力偏好、指标排序 |
| 页面解析结果 | `resolveIndustryTemplate()` | 每次返回新对象 | 页面与表单的唯一行业差异读取入口 |

> 用户覆盖只会叠加到解析结果，绝不会写回官方模板。旧账本在 `normalizeLedger()` 时补齐当前模板版本；未选择行业时仍使用既有的餐饮默认行为。

## 注册表、ID 与版本

`INDUSTRY_TEMPLATE_REGISTRY` 是官方模板的唯一注册入口。每个注册项包含 `id`、`name`、`version`、`status`、`schema`、`defaultConfig` 与 `capabilities`。稳定注册 ID 不会因显示文案变化而变化；已有账本仍保留原来的 `IndustryKey`，由兼容映射解析至注册 ID。

| 稳定注册 ID | 兼容账本键 | 默认版本 | 状态 |
|---|---|---:|---|
| `restaurant` | `catering` | 1 | `active` |
| `retail` | `retail` | 1 | `active` |
| `ecommerce` | `ecommerce` | 1 | `active` |
| `beauty` | `beauty` | 1 | `active` |
| `vendor` | `stall` | 1 | `active` |
| `handmade` | `handmade` | 1 | `active` |

注册表提供 `listTemplates()`、`getTemplate(id, version?)`、`getDefaultTemplate(id)` 与 `getTemplateCapabilities(id, version?)`。公开查询对未知 ID 或版本返回 `null`，不会静默回退到餐饮；仅旧账本兼容入口 `resolveIndustryTemplate()` 在无效历史键时保留原有餐饮默认行为。

> 新版本必须以相同稳定 ID 和更高版本号并存注册。旧版本不会被新版本覆盖，PR #4 不包含自动迁移或自动升级界面。

## 能力矩阵

全部模板均使用同一份 `IndustryCapabilitiesSchema`。核心矩阵含 `bom`、`monthlyAllocation`、`inventory`、`purchasing`、`sales`、`refunds`、`cash`、`customers`、`suppliers`、`production` 与 `multiStore`；PR #3 已有的损耗、预约、平台费和快照字段继续作为兼容能力字段保留。页面和后续业务接入应读取 `template.capabilities`，不得通过行业名称分支判断能力。

## 首批模板

| 行业键 | 行业名称 | 经营项目 | 重点能力 |
|---|---|---|---|
| `catering` | 餐饮饮品 | 菜品/饮品 | 配方、损耗、包装、平台费 |
| `retail` | 社区零售 | 货品 | 进货、配送、促销、库存 |
| `ecommerce` | 电商经营 | 商品/SPU | 货源、物流、平台费、售后 |
| `beauty` | 美业服务 | 服务项目 | 耗材、技师人工、预约服务 |
| `stall` | 商贸摆摊 | 货品 | 进货、毛利、损耗、库存、现金；默认关闭 BOM 与月度分摊 |

历史兼容保留 `handmade`（手作生产）模板，不改变已存在账本的行业键或默认行为。

## 扩展方式

新增行业时，先补充稳定注册 ID 与兼容账本键，再用 `IndustryTemplateSchema` 创建官方模板并注册到 `INDUSTRY_TEMPLATE_REGISTRY`。随后为版本、能力开关、默认兼容、未知查询和用户覆盖隔离补充一致性测试。页面不得新增 `industry === ...` 的分支；应通过统一解析器的结果读取行业差异。
