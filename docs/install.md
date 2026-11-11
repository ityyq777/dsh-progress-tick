# 安装

三种入口共用同一套安装器：GUI 插件面板的「包名或地址」输入框、`dsh plugin add`、以及插件市场，接受的都是同一批 spec 形式。

## 0. 先看一眼：为什么有的命令装不上

早期 README 给的命令有两个坑，这里一并说明（0.5.8 修正）：

- **不加 `--profile`**：`dsh plugin` 是 profile 级工具，`--profile <name>` 是必填项，裸跑只会报 `required option '--profile <name>' not specified`。
- **手动加 `-w`**：`dsh plugin add` 会把参数原样转发给 pnpm。pnpm 9 及更早在工作区根目录 add 会报 `ERR_PNPM_ADDING_TO_ROOT`，于是有人传 `-w`；但 profile 目录自带 `pnpm-workspace.yaml`（`packages: ["."]`），pnpm 10+ 不再需要 `-w`——**先 `corepack enable` 或升级到 pnpm ≥ 10，就不要也不该再加 `-w`**。DSH 官方安装器与 dshmarket 都已按 profile 是否工作区自动注入 `-w`，无需手工干预。
- **桌面端（Electron）**：不同安装来源的 CLI 可能支持不同的 profile。普通 CLI 可能拒绝 `--profile desktop`；请使用桌面应用自带的 CLI，或在应用内安装，见第 5 节。

## 1. GUI（推荐给使用者）

左上角 **插件 → 安装**（或插件市场卡片上的「安装」按钮），在「包名或地址」里粘贴：

```
github:ityyq777/dsh-progress-tick
```

## 2. 命令行

把 `<profile>` 换成你的 profile 名（默认网页版是 `web`；`dsh plugin --profile web list` 之类的报错提示也认这个名字）。

```sh
# 跟随 main 最新提交
dsh plugin --profile <profile> add github:ityyq777/dsh-progress-tick

# 锁定版本（tag 形式，推荐）
dsh plugin --profile <profile> add github:ityyq777/dsh-progress-tick#v0.5.7

# GitHub Releases 的源码 tarball
dsh plugin --profile <profile> add https://github.com/ityyq777/dsh-progress-tick/archive/refs/tags/v0.5.7.tar.gz
```

若你本机 pnpm 是 9.x 且上面命令报 `ERR_PNPM_ADDING_TO_ROOT`，临时加 `-w` 可用（`add` 后紧跟即可）；更推荐升级 pnpm。

安装器解析到包内 `dsh.bundle.patch` 后，会自动把它写进 profile 的 `dsh.profile.bundles` 并启用，重启 `dsh <profile>` 即生效。

## 3. 本地开发（改源码即生效）

```sh
dsh plugin --profile <profile> add dsh-progress-tick@link:/absolute/path/to/dsh-progress-tick
# 等价于在 profile 的 package.json 里写： "dsh-progress-tick": "link:/absolute/path/to/dsh-progress-tick"
```

改用 `link:` 而不是裸的绝对路径：裸路径在某些 pnpm 配置下会被**拷贝**成真实目录（`file:`），此后改源码不会生效。

**改了源码但界面没变？** 按顺序排查：

1. `grep -c "新版里才有的字符串" <profile>/node_modules/dsh-progress-tick/client/client.js`——命中数 0 说明装的是副本，重跑一次上面的 `link:` 命令（安装器会打印 `Replaced "…(file:…)" with "…@link:…"`）；
2. 浏览器强刷（`Cmd/Ctrl+Shift+R`）：客户端包的 URL 带构建版本号，刷新才会取新包；
3. 改了 `index.js`（Host 侧）则必须重启 `dsh <profile>`。

## 4. npm

插件已发布到 npm，可查询最新版本并按包名安装：

```sh
npm view dsh-progress-tick version --registry=https://registry.npmjs.org
dsh plugin --profile <profile> add dsh-progress-tick
```

安装器使用的 registry 应能获取到该包的正式版本。

## 5. 桌面端（Electron 版 DSH）

可以在桌面应用的 **设置 → 插件** 中安装，也可以使用桌面应用自带的 CLI 管理 `desktop` profile。例如在 macOS 上：

```sh
DSH="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
"$DSH" plugin --profile desktop list
"$DSH" plugin --profile desktop add github:ityyq777/dsh-progress-tick
```

应用安装位置不同或使用其他操作系统时，请以实际的桌面应用 CLI 路径为准。也可把上面 `add` 后面的 GitHub 地址换成 npm 包名 `dsh-progress-tick`。普通全局 CLI 可能不支持管理桌面端的 profile。

## 升级与卸载

```sh
dsh plugin --profile <profile> update dsh-progress-tick   # 升级
dsh plugin --profile <profile> remove dsh-progress-tick   # 卸载
```

> 依赖 GitHub 可达（国内可能需要代理或镜像）；git 安装落盘的是真实副本，源码改动不会热更新，改代码请改用第 3 种 `link:` 方式。
