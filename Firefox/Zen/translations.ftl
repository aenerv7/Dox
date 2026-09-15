# Local additions for Zen 1.22.1b / Gecko 155.0.1.
# @file headers identify the archive and resource to append to.

# @file omni.ja localization/zh-CN/toolkit/about/aboutAddons.ftl
find-more-addons-promo =
    .heading = 打造适合您的 { -brand-product-name }
    .message = 添加符合您需求和喜好的工具与样式。
find-more-themes-promo =
    .heading = 发现更多新外观
    .message = 选择喜爱的样式，让 { -brand-product-name } 更具个人特色。

# @file omni.ja localization/zh-CN/toolkit/about/aboutNetworking.ftl
about-networking-ssl-tokens-summary-count = { $count } 个令牌
about-networking-ssl-tokens-summary-expired = （{ $count } 个已过期）
about-networking-ssl-tokens-summary-compression = { $decompressedLength } → { $compressedLength } B（节省 { $saved }%）
about-networking-ssl-tokens-summary-capacity = { $used } / { $capacity } KB（{ $percent }%）
about-networking-ssl-tokens-partition-key = 分区键
about-networking-ssl-tokens-tokens-column = 令牌
about-networking-ssl-tokens-expires = 过期时间
about-networking-ssl-tokens-certificate = 证书
about-networking-ssl-tokens-token-list = { $count } 个令牌
about-networking-ssl-tokens-restored =
    .alt = 从存储恢复
    .title = 从存储恢复
about-networking-ssl-tokens-new =
    .alt = 本次会话新增
    .title = 本次会话新增
about-networking-ssl-tokens-compression-details =
    .title = 令牌：{ $tokenLength } B。编码大小：{ $decompressedLength } → { $compressedLength } B。
about-networking-ssl-tokens-overridable-error = 可忽略的错误类别
about-networking-ssl-tokens-cert-chain = 证书链（{ $count }）
about-networking-ssl-tokens-handshake-certs = 握手证书（{ $count }）

# @file omni.ja localization/zh-CN/toolkit/about/aboutPDF.ftl
about-pdf-file-picker-title = 打开 PDF

# @file omni.ja localization/zh-CN/toolkit/about/url-classifier.ftl
url-classifier-content-classifier-loading-url-enabled = 启用加载网址
url-classifier-content-classifier-probes = 探测
url-classifier-content-classifier-force-third-party = 强制视为相对于顶层框架的第三方
url-classifier-content-classifier-probe-blocking-btn = 探测拦截
url-classifier-content-classifier-probe-annotate-btn = 探测标注
url-classifier-content-classifier-probe-feature-btn = 探测功能
url-classifier-content-classifier-engine-details = 引擎详情
url-classifier-content-classifier-col-engine-result = 引擎结果
url-classifier-content-classifier-verdict-hit = 命中
url-classifier-content-classifier-verdict-exception = 例外
url-classifier-content-classifier-verdict-miss = 未命中
url-classifier-content-classifier-verdict-error-with-code = 错误（{ $code }）

# @file omni.ja localization/zh-CN/toolkit/pdfviewer/viewer.ftl
pdfjs-digital-signature-properties-banner-verified = 文档已使用有效的数字签名签署
pdfjs-digital-signature-properties-banner-unknown = 文档已签署，但有 { $count } 个数字签名无法验证
pdfjs-digital-signature-properties-banner-untrusted = 文档使用了 { $count } 个不受信任的证书签署
pdfjs-digital-signature-properties-banner-expired = 文档使用了 { $count } 个已过期的证书签署
pdfjs-digital-signature-properties-banner-invalid = 文档有 { $count } 个无效的数字签名
pdfjs-digital-signature-properties-banner-revoked = 文档使用了 { $count } 个已吊销的证书签署
pdfjs-digital-signature-properties-sub-signatures = 子签名（{ $count }）

# @file browser/omni.ja localization/zh-CN/browser/aiWindow.ftl
aiwindow-firstrun-model-personal-body-v2 = 提供跨语言的个性化帮助

# @file browser/omni.ja localization/zh-CN/browser/appExtensionFields.ftl
extension-default-theme-description2 = 均衡、熟悉的灰紫色，呈现经典的 { -brand-product-name } 外观。

# @file browser/omni.ja localization/zh-CN/browser/appmenu.ftl
appmenuitem-share-firefox-description = 邀请他人选择将隐私放在首位的浏览器

# @file browser/omni.ja localization/zh-CN/browser/browser.ftl
identity-description-tls-key-logging-message = 某个应用或服务可能能够查看您与此网站之间的加密流量。

# @file browser/omni.ja localization/zh-CN/browser/featureCallout.ftl
taskbar-tabs-chat-callout-title-v3 = 从任务栏随时保持联系

# @file browser/omni.ja localization/zh-CN/browser/firefoxView.ftl
firefoxview-syncedtabs-adddevice-description-3 = 扫描二维码获取移动版 { -brand-product-name }，开始同步打开的标签页等数据。了解如何<a data-l10n-name="url">连接更多设备</a>。
firefoxview-tabpickup-password-locked-description-2 = 为保护您的隐私，同步的标签页已受保护。请输入 { -brand-short-name } 的主密码，以查看其他设备上的标签页。
firefoxview-history-empty-description-2 = 您访问网页后，浏览历史会显示在此处。可在<a data-l10n-name="history-settings-url">设置</a>中选择要记录的内容。
firefoxview-dont-remember-history-empty-description-2 = { -brand-short-name } 目前不会保存您的历史记录。您可随时在<a data-l10n-name="history-settings-url-two">设置</a>中更改。

# @file browser/omni.ja localization/zh-CN/browser/ipProtection.ftl
ipprotection-summer-promo-offramp-generic-description = 使用您的 { $maxUsage } GB 流量和 6 个连接位置获得额外隐私保护，让您的浏览活动更难被追溯。
ipprotection-summer-promo-offramp-generic-description-default-browser-users-no-upgrade = 使用您的 { $maxUsage } GB 流量和超过 20 个连接位置获得额外隐私保护，让您的浏览活动更难被追溯。
ipprotection-summer-promo-offramp-subscriber-description = 作为 { -mozilla-vpn-brand-name } 订阅者，您现在可享受无限带宽和更多连接位置。
ipprotection-summer-promo-offramp-default-browser-incentive-title = 保留您额外的内置 VPN 连接位置
ipprotection-android-promo-callout-description = 扫描二维码获取 Android 版 { -brand-product-name }，开启内置 VPN，随时随地获得更多隐私保护。即将支持 iOS。
ipprotection-connection-status-blocked-error-description-1 = 当地法律和限制会影响 VPN 的可用地区。<a data-l10n-name="learn-more-link">详细了解</a>

# @file browser/omni.ja localization/zh-CN/browser/newtab/newtab.ftl
newtab-privacy-message-info-1-cta = 查看保护情况
newtab-privacy-message-info-2-cta = 查看保护情况
newtab-privacy-message-info-3-cta = 查看保护情况
newtab-privacy-message-info-4-cta = 查看保护情况
newtab-privacy-message-info-5-cta = 查看保护情况
newtab-privacy-message-info-7-cta = 查看保护情况
newtab-privacy-message-info-12-cta = 查看保护情况
newtab-privacy-message-info-13-cta = 查看保护情况
newtab-privacy-message-milestone-week = 本周已拦截 { $count } 个跟踪器。看看 { -brand-short-name } 为您挡住了什么。
newtab-privacy-message-milestone-week-cta = 查看保护情况
newtab-privacy-message-milestone-month-cta = 查看保护情况
newtab-privacy-message-milestone-year = 今年已拦截 { $count } 个跟踪器。这一年，我们持续守护您的隐私。
newtab-privacy-message-milestone-year-cta = 查看保护情况
newtab-privacy-message-milestone-total = 已拦截 { $count } 个跟踪器。您在掌控个人隐私的道路上又迈进了一大步。
newtab-privacy-message-milestone-total-cta = 查看保护情况
newtab-privacy-message-daily-cap = （今天已拦截超过 100 个跟踪器。）跟踪器越少，隐私保护越多。
newtab-privacy-message-daily-cap-cta = 查看保护情况
newtab-privacy-message-streak = 您已连续受到保护 { $count } 天。
newtab-privacy-message-streak-cta = 查看保护情况
newtab-privacy-message-first-protection-cta = 查看保护情况

# @file browser/omni.ja localization/zh-CN/browser/preferences/formAutofill.ftl
autofill-country-warning-message-2 = 表单自动填写目前仅适用于部分国家或地区

# @file browser/omni.ja localization/zh-CN/browser/preferences/zen-preferences.ftl
zen-settings-workspaces-sync =
    .label = 跨设备同步侧边栏
    .description = 通过您的 Mozilla 账户，在所有设备上同步工作区、固定标签页和文件夹。
zen-settings-normal-tabs-sync =
    .label = 包含未固定的标签页
    .description = 同时同步各工作区中的普通标签页，而不只是固定标签页和文件夹。
zen-local-shortcut-not-set = 未设置

# @file browser/omni.ja localization/en-US/browser/preferences/zen-preferences.ftl
zen-local-shortcut-not-set = Not set

# @file browser/omni.ja localization/zh-CN/browser/sharePanel.ftl
urlbar-share-button =
    .tooltiptext = 分享此页面
    .aria-label = 分享此页面
share-panel-heading = 分享页面
share-panel-copy-link =
    .label = 复制链接
confirmation-hint-link-copied = 已复制链接
share-panel-os-share =
    .label = 分享到…
share-panel-mail =
    .label = 发送电子邮件
share-panel-screenshot =
    .label = 截取屏幕截图
share-panel-qr-code =
    .label = 分享二维码
share-panel-send-to-device =
    .label = 发送到设备
share-panel-send-to-mobile =
    .label = 发送到移动设备
share-panel-device-subview =
    .title = 所有设备
share-panel-os-share-subview =
    .title = 分享到…

# @file browser/omni.ja localization/zh-CN/browser/sidebar.ftl
sidebar-opentabs-preview-heading = 最近的标签页
sidebar-opentabs-preview-close-tab =
    .title = 关闭 { $tabTitle }
sidebar-opentabs-preview-mute-tab =
    .title = 将标签页静音
sidebar-opentabs-preview-unmute-tab =
    .title = 取消标签页静音

# @file browser/omni.ja localization/zh-CN/browser/sync.ftl
fxa-menu-sign-in-promo-message = 随时随地使用您的数据

# @file browser/omni.ja localization/zh-CN/browser/zen-live-folders.ftl
zen-live-folder-options =
    .label = 活动文件夹选项
zen-live-folder-last-fetched =
    .label = 上次获取：{ $time }
zen-live-folder-refresh =
    .label = 刷新
zen-live-folder-github-option-author-self =
    .label = 由我创建
zen-live-folder-github-option-assigned-self =
    .label = 分配给我
zen-live-folder-github-option-review-requested =
    .label = 请求我审查
zen-live-folder-github-option-include-drafts =
    .label = 包含草稿拉取请求
zen-live-folder-type-rss =
    .label = RSS 订阅源
zen-live-folder-option-fetch-interval =
    .label = 获取间隔
zen-live-folder-fetch-interval-mins =
    .label = { $mins } 分钟
zen-live-folder-fetch-interval-hours =
    .label = { $hours } 小时
zen-live-folder-rss-option-time-range =
    .label = 时间范围
zen-live-folder-time-range-hours =
    .label = 最近 { $hours } 小时
zen-live-folder-time-range-all-time =
    .label = 全部时间
zen-live-folder-time-range-days =
    .label = 最近 { $days } 天
zen-live-folder-rss-option-item-limit =
    .label = 条目数量上限
zen-live-folder-rss-option-feed-url =
    .label = 订阅源网址
zen-live-folder-rss-prompt-feed-url = 请输入订阅源网址
zen-live-folder-rss-option-item-limit-num =
    .label = { $limit } 项
zen-live-folder-failed-fetch =
    .label = 更新失败
    .tooltiptext = 更新失败，请重试。
zen-live-folder-github-no-auth =
    .label = 尚未登录 GitHub
    .tooltiptext = 请重新登录 GitHub。
zen-live-folder-github-no-filter =
    .label = 未设置筛选条件
    .tooltiptext = 未设置筛选条件，不会获取任何内容。
zen-live-folder-rss-invalid-url-title = 无法创建活动文件夹
zen-live-folder-rss-invalid-url-description = 订阅源网址无效，请检查地址后重试。
zen-live-folder-github-option-repo-filter =
    .label = 仓库
zen-live-folder-github-option-repo =
    .label = { $repo }
zen-live-folder-github-pull-requests =
    .label = 拉取请求
zen-live-folder-github-issues =
    .label = 议题
zen-live-folder-github-option-repo-list-note =
    .label = 此列表根据您当前活跃的拉取请求生成。
zen-live-folders-promotion-title = 活动文件夹已创建！
zen-live-folders-promotion-description = RSS 订阅源或 GitHub 拉取请求的最新内容会自动显示在这里。

# @file browser/omni.ja localization/zh-CN/browser/zen-share.ftl
zen-share-space =
    .label = 分享工作区…
zen-share-folder =
    .label = 分享文件夹…
zen-share-split-view =
    .label = 分享分屏…
zen-share-link-copied-toast = 已复制分享链接！
zen-share-link-expires-description = 任何获得链接的人都可以在 { $date } 之前打开
zen-share-link-permanent-description = 任何获得链接的人都可以打开
zen-share-error-toast = 无法创建分享链接
zen-share-error-auth-description = 分享服务器拒绝了您的密钥
zen-share-error-too-large-description = 分享内容过大，无法上传
zen-share-error-rate-limited-description = 分享过于频繁，请稍后重试
zen-share-error-network-description = 无法连接到分享服务器
zen-share-error-empty-description = 此处没有可分享的内容
zen-share-error-server-description = 分享服务器返回了错误
zen-share-overlay-loading = 正在加载分享的标签页…
zen-share-overlay-from-space = 来自 { $name } 的工作区
zen-share-overlay-from-folder = 来自 { $name } 的文件夹
zen-share-overlay-shared-with-you = 与您分享的内容
zen-share-overlay-add-space = 将工作区添加到 Zen
zen-share-overlay-add-folder = 将文件夹添加到 Zen
zen-share-imported-toast = 已添加到您的浏览器！
zen-share-import-error-toast = 无法导入此分享
zen-share-import-error-dead-description = 链接已过期或不存在
zen-share-import-error-invalid-description = 分享的数据无效
zen-share-confirm-title = 分享链接
zen-share-confirm-dialog =
    .buttonlabelaccept = 分享
zen-share-confirm-description = Zen 会将这些标签页的副本上传至分享服务器，并复制一个任何人都能打开的链接。链接将在 30 天后过期。
zen-share-confirm-anonymous = 除非填写姓名，否则将匿名分享。
zen-share-confirm-name-input =
    .placeholder = 您的姓名（可选）
zen-share-confirm-dont-ask =
    .label = 不再询问

# @file browser/omni.ja localization/zh-CN/browser/zen-welcome.ftl
zen-welcome-back = 返回
zen-welcome-skip = 暂时跳过
zen-welcome-import-description = 从其他浏览器导入书签、历史记录和密码，无缝接续您的浏览体验。
zen-welcome-import-yes = <strong>是</strong>，从其他浏览器导入。
zen-welcome-import-no = <strong>否</strong>，全新开始。
zen-welcome-default-browser-title = 将 { -brand-short-name } 设为默认浏览器？
zen-welcome-default-browser-description = 其他应用中的链接将使用 { -brand-short-name } 打开。您可随时更改此设置。
zen-welcome-essentials-title = 选择您最常用的应用。
zen-welcome-essentials-description = 选择喜爱的应用，方便从侧边栏随时访问。
zen-welcome-block-ads-title = 拦截广告和跟踪器？
zen-welcome-block-ads-description = { -brand-short-name } 可以为您安装 uBlock Origin，让页面更清爽、加载更快。您可随时移除它。
zen-welcome-block-ads-yes = <strong>是</strong>，帮我拦截广告。
zen-welcome-block-ads-no = <strong>否</strong>，显示所有内容。

# @file browser/omni.ja localization/zh-CN/browser/zen-workspaces.ftl
zen-workspaces-remote-delete-title = 删除已同步的工作区？
zen-workspaces-remote-delete-body = { $name } 已在另一台设备上删除。是否也在此处删除？如果保留，它将恢复到您的其他设备上。

# @file browser/omni.ja localization/zh-CN/devtools/client/application.ftl
session-history-navigate-button-title = 转到第 { $index } 个会话历史记录条目

# @file browser/omni.ja localization/zh-CN/devtools/client/inspector.ftl
inspector-emulation-panel-reduced-motion-reduce = 减少动态效果
    .aria-label = 启用减少动态效果的模拟
inspector-emulation-panel-reduced-motion-no-preference = 无偏好
    .aria-label = 启用对减少动态效果无偏好的模拟
inspector-emulation-panel-reduced-motion-none = 不模拟
    .aria-label = 禁用减少动态效果的模拟

# @file browser/omni.ja localization/zh-CN/devtools/client/toolbox-options.ftl
options-netmonitor-body-limit-label = 请求和响应正文的最大大小（设为 0 表示不限制）：
options-netmonitor-body-limit-tooltip =
    .title = 在网络监视器中显示或下载请求或响应正文时，超出指定大小的部分会被截断。设为 0 表示不限制。
options-netmonitor-body-limit-button =
    .title = 编辑请求和响应正文的最大大小。
options-netmonitor-body-limit-restore-default =
    .title = 将请求和响应正文的最大大小恢复为默认值。
options-netmonitor-body-limit-set =
    .title = 将当前输入值设为请求和响应正文的最大大小。
options-stylesheets-in-the-debugger-label = 在调试器中显示样式表
options-stylesheets-in-the-debugger-tooltip =
    .title = 在调试器中列出和查看样式表
options-local-mode-only-work-locally = 本地模式仅适用于本地环境，调试远程环境时将被禁用
options-local-mode-behavior = 本地模式允许您通过 HTTPS 网址加载本地文件，无需任何外部依赖。这些网址只能在已打开开发者工具的标签页中加载。
options-local-mode-domain-label = 自定义域名：
options-local-mode-origin-input =
    .placeholder = 本地映射的源地址
options-local-mode-origin-conflict = 此源地址与现有的另一条映射冲突
options-local-mode-origin-invalid = 此源地址无效
options-local-mode-choose-folder = 浏览…
    .title = 选择提供此映射内容的本地文件夹
options-local-mode-choose-folder-picker-title = 为 { $url } 选择本地模式文件夹
options-local-mode-toggle =
    .title = 启用或禁用此本地映射
options-local-mode-navigate-to =
    .title = 转到此映射网址
options-local-mode-new-mapping = 添加新的本地映射

# @file browser/omni.ja localization/zh-CN/devtools/client/toolbox.ftl
toolbox-local-mode-notice = 此文档也可通过开发者工具的“本地模式”从“{ $url }”加载。您可在设置面板中启用该模式。
toolbox-local-mode-notice-navigate-to-existing-mapping = 转到现有映射

# @file browser/omni.ja localization/zh-CN/devtools/server/actors/webconsole/commands/experimental-commands.ftl
webconsole-commands-usage-trace3 =
    :trace

    开启或关闭 JavaScript 跟踪器。

    跟踪器会显示页面调用的所有函数。

    支持以下参数：
      --logMethod 设为“console”时将日志输出到 Web 控制台（默认），设为“stdout”时输出到标准输出。

      --return 可选，同时记录函数返回时的信息。

      --values 可选，记录函数调用参数；启用返回帧记录时，也会记录返回值。

      --on-next-interaction 可选，仅在下一次按下鼠标或按键时开始跟踪。

      --dom-mutations 可选，记录所有 DOM 变更。
                      可通过逗号分隔的列表限定变更类型：
                       - “add”仅跟踪新增的 DOM 节点；
                       - “attributes”仅跟踪属性发生变化的 DOM 节点；
                       - “remove”仅跟踪被移除的 DOM 节点。

      --max-depth 可选，将跟踪日志限制在指定深度内。

      --max-records 可选，记录指定数量的顶层帧后自动停止跟踪。

      --prefix 可选，在所有跟踪日志前添加指定字符串。

      --help 或 --usage 显示此帮助信息。
