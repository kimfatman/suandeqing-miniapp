# GitHub 首次推送记录

| 项目 | 结果 |
|---|---|
| 仓库 | <https://github.com/kimfatman/suandeqing-miniapp> |
| 可见性 | 公开（Public，已核验） |
| 默认分支 | `main` |
| 本次基线提交 | `f347314` |
| 推送内容 | 当前应用代码、测试、项目README、架构/开发/核算/质量/GitHub协作文档 |

## 可见性变更

首次推送后，仓库已按项目需求从私有切换为公开。公开前已执行文档敏感信息扫描；后续提交仍需避免环境变量、访问令牌、Cookie、真实账本导出和可识别的商户经营数据。

## 协作治理配置

仓库已启用 Issues、Discussions 和 `main` 分支保护。GitHub Actions 的 `CI / validate` 工作流会在 Pull Request 与 `main` 推送时执行依赖安装、测试、类型检查和生产构建；`main` 合并要求该检查成功并满足分支保护的审批与讨论解决规则。

首次远端验证运行 [#32221681137](https://github.com/kimfatman/suandeqing-miniapp/actions/runs/32221681137) 已成功完成。`main` 现要求分支与最新主分支同步、`validate` 检查通过、至少一位审批者通过并解决讨论；管理员同样受规则约束，强制推送和删除分支被禁用。

## 后续协作

日常变更请从 `main` 创建功能或修复分支，并在 Pull Request 中附上测试、构建和移动端回归结果。仓库当前同时保留 `origin`（项目发布系统）与 `github`（GitHub 协作仓库）两个远程；推送 GitHub 时使用 `git push github main`。

提交前仍应检查敏感信息，不提交环境变量、访问令牌、Cookie、真实账本导出或可识别的商户经营数据。详细约定见 [GitHub 协作说明](GITHUB_COLLABORATION.md)。
