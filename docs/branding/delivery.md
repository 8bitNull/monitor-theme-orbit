# Orbit 交付记录

- 名称：Orbit；安装标识：orbit；版本：1.1.8。
- 作者：monitor-theme-orbit。
- 简介：让每个节点，尽在视野。极简探针主题：实时状态、全球节点、网络质量与亮暗外观。
- 预览图：根目录 preview.png，1600 × 900。
- 设计源文件：docs/branding/preview.html。
- 安装包：artifacts/release/theme.tar.gz；配套 SHA256。
- 构建、74 项单元测试及 18 项外观浏览器测试通过；预览生成时确认 orbit 配置接口成功、页面无运行错误。
- 远程仓库名：monitor-theme-orbit。当前无 GitHub 账号信息及授权，尚未创建或推送；theme.json 的 url 暂为空，账号确认后填写真实仓库地址并重新构建打包。

## 发布准备

收到 GitHub 所属用户或组织并完成环境授权后：

1. 将 theme.json 的 url 填为实际仓库地址，author 按用户希望的署名填写。
2. npm run build 后重新打包并校验。
3. 创建 monitor-theme-orbit 远程仓库，提交并推送 main。

仓库包含标签构建工作流，可在推送版本标签时发布 theme.tar.gz，用于极简探针后台安装及更新。
