# Local additions for Zen 1.23.1b / Gecko 157.0.1.
# @file headers identify the archive and resource to append to.
# Messages already translated upstream are omitted; only real gaps are listed.

# @file omni.ja localization/zh-CN/toolkit/about/aboutAddons.ftl
find-more-addons-promo =
    .heading = 打造适合您的 { -brand-product-name }
    .message = 添加符合您需求和喜好的工具与样式。
find-more-themes-promo =
    .heading = 发现更多新外观
    .message = 选择喜爱的样式，让 { -brand-product-name } 更具个人特色。
mlmodel-speech-recognition = { -brand-short-name } 使用此模型进行端侧语音识别
themes-mode =
    .aria-label = 外观

# @file omni.ja localization/zh-CN/locales-preview/remote-agent.ftl
remote-agent-connection-prompt-title = 允许远程控制？
remote-agent-connection-prompt-message =
    某个应用想要控制此浏览器会话。
    它可以读取您标签页的内容、访问您保存的数据，并导航到任意网站。

    仅当您自己发起了此连接，并且信任该应用和这台计算机时，才允许。
remote-agent-connection-prompt-allow-button = 允许
remote-agent-connection-prompt-deny-button = 拒绝
remote-agent-connection-prompt-remember-checkbox = 在浏览器退出前记住我的选择

# @file omni.ja localization/zh-CN/services/aboutSyncLog.ftl
about-sync-log-title = 同步日志
about-sync-log-page-header =
    .heading = 同步日志
    .description = 同步功能写入的诊断日志。
about-sync-log-filter-type =
    .aria-label = 类型
about-sync-log-filter-type-all =
    .label = 全部
about-sync-log-filter-type-success =
    .label = 成功
about-sync-log-filter-type-error =
    .label = 错误
about-sync-log-filter-date =
    .aria-label = 日期
about-sync-log-filter-date-all =
    .label = 全部时间
about-sync-log-filter-date-today =
    .label = 今天
about-sync-log-download-button =
    .label = 下载当前显示的日志（.zip）
about-sync-log-clear-button =
    .label = 清除日志
about-sync-log-empty = 尚未记录任何同步日志。
about-sync-log-empty-filtered = 没有日志符合当前的筛选条件。
about-sync-log-view-error = 无法读取此日志文件。
about-sync-log-open-raw =
    .label = 打开原始文件
about-sync-log-clear-confirm-title = 清除同步日志？
about-sync-log-clear-confirm-message =
    { $count ->
        [one] 这将永久删除 { $count } 个可见的日志文件。
       *[other] 这将永久删除 { $count } 个可见的日志文件。
    }
about-sync-log-clear-confirm-accept = 删除
about-sync-log-row-success =
    .heading = 成功 — { DATETIME($date, dateStyle: "medium", timeStyle: "medium") }
about-sync-log-row-error =
    .heading = 错误 — { DATETIME($date, dateStyle: "medium", timeStyle: "medium") }

# @file omni.ja localization/zh-CN/toolkit/about/aboutProcesses.ftl
about-processes-utility-actor-hw-inference = 硬件加速推理

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

# @file omni.ja localization/zh-CN/toolkit/about/aboutSupport.ftl
pdfjs-open-attachments-inline = 在页面内打开 PDF 附件

# @file omni.ja localization/zh-CN/toolkit/formautofill/formAutofill.ftl
autofill-card-security-code-label = CVC
autofill-delete-payment-method-os-prompt-macos = 删除已存储的付款方式信息
autofill-delete-payment-method-os-prompt-windows = { -brand-short-name } 正在尝试删除已存储的付款方式信息。请在下方确认访问此 Windows 账户。
autofill-delete-payment-method-os-prompt-other = { -brand-short-name } 正在尝试删除已存储的付款方式信息。

# @file omni.ja localization/zh-CN/toolkit/global/processTypes.ftl
process-type-utility-actor-hw-inference = 实用工具“硬件加速推理”

# @file omni.ja localization/zh-CN/toolkit/global/theme-picker.ftl
theme-picker-mode =
    .aria-label = 外观

# @file omni.ja localization/zh-CN/toolkit/main-window/autocomplete.ftl
autocomplete-more-actions2 = { $entry } 的更多操作
autocomplete-delete-form-history-entry2 = 从表单历史记录中删除 { $entry }
autocomplete-remove-password-title = 要移除密码吗？
autocomplete-remove-address-title = 要移除地址吗？
autocomplete-remove-payment-method-title = 要移除付款方式吗？
autocomplete-remove-record-message = 此操作无法撤销。
autocomplete-remove-record-button = 移除
autocomplete-remove-password-os-auth-dialog-message-win = 要删除密码，请输入您的 Windows 登录凭据。这有助于保护您账户的安全。
autocomplete-remove-password-os-auth-dialog-message-macosx = 删除已保存的密码
autocomplete-remove-password-os-auth-dialog-caption = { -brand-full-name }

# @file omni.ja localization/zh-CN/toolkit/neterror/netError.ftl
neterror-search-cta-title = 无法访问此网站
neterror-search-cta-things-to-try = 请尝试以下步骤：
neterror-search-cta-hint-check-address = 仔细检查网站地址
neterror-search-cta-hint-search = 在网上搜索以找到该站点
neterror-search-cta-hint-search-query = 在网上搜索 <strong>“{ $query }”</strong>
neterror-search-cta-search-button =
    .label = 搜索
    .accesskey = S
    .tooltiptext = 在新标签页中打开搜索结果
neterror-search-cta-reload-button =
    .label = 重新载入
    .accesskey = R
neterror-search-cta-offline = 您似乎处于离线状态。请重新连接后再试。
neterror-search-cta-error-code = 错误代码：{ $error }
neterror-search-cta-learn-more = 详细了解

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

# @file browser/omni.ja localization/zh-CN/browser/featureCallout.ftl
taskbar-tabs-chat-callout-title-v3 = 从任务栏随时保持联系

# @file browser/omni.ja localization/zh-CN/browser/ipProtection.ftl
ipprotection-summer-promo-offramp-generic-description = 使用您的 { $maxUsage } GB 流量和 6 个连接位置获得额外隐私保护，让您的浏览活动更难被追溯。
ipprotection-summer-promo-offramp-generic-description-default-browser-users-no-upgrade = 使用您的 { $maxUsage } GB 流量和超过 20 个连接位置获得额外隐私保护，让您的浏览活动更难被追溯。
unauthenticated-site-rules-message = 控制哪些网站使用 VPN、哪些不使用。
site-rules-manage-rules-link-text = 管理 VPN 规则
site-rules-status-heading = 您的规则
site-rules-description-exclusion = 此网站的 VPN 已关闭
site-rules-description-inclusion = 此网站的 VPN 已开启
ip-protection-site-rules-header =
    .heading = 管理网站规则
ip-protection-site-rules-button =
    .label = 管理网站规则
    .description = 为需要额外隐私保护或关闭 VPN 的网站设置规则。

# @file browser/omni.ja localization/zh-CN/browser/newtab/newtab.ftl
newtab-privacy-message-milestone-week = 本周已拦截 { $count } 个跟踪器。看看 { -brand-short-name } 为您挡住了什么。
newtab-privacy-message-milestone-total = 已拦截 { $count } 个跟踪器。您在掌控个人隐私的道路上又迈进了一大步。
newtab-privacy-etp-off-faster-browsing = 浏览更快速。跟踪器更少。
newtab-wallpaper-firefox-side-kit-dark = 深色背景上位于左侧的狐狸
newtab-wallpaper-firefox-side-kit-light = 浅色背景上位于左侧的狐狸
newtab-wallpaper-firefox-peak-dark = 深色背景上位于左边缘的狐狸脸
newtab-wallpaper-firefox-peak-light = 浅色背景上位于左边缘的狐狸脸
newtab-recent-searches-trending-attribution = 来自 { $engine }

# @file browser/omni.ja localization/zh-CN/browser/newtab/onboarding.ftl
onboarding-refresh-splash-screen-title = { -brand-product-name } 从现在开始为您护航
onboarding-refresh-hero-text = 为保护您而生，而非跟踪您。
onboarding-refresh-tou-default = 使用 { -brand-short-name } 打开所有链接
onboarding-refresh-tou-pin =
    { PLATFORM() ->
        [macos] 将 { -brand-short-name } 保留在 Dock 中
       *[other] 将 { -brand-short-name } 添加到任务栏
    }
onboarding-refresh-tou-default-unchecked = 每次浏览都保持内置保护
onboarding-refresh-tou-pin-unchecked = 让唯一主流独立浏览器触手可及
onboarding-refresh-terms-of-use-with-links = 继续即表示您同意 <a data-l10n-name="terms_of_use">{ -brand-product-name } 使用条款</a>和我们的<a data-l10n-name="privacy_notice">隐私声明</a>。为帮助改进浏览器，{ -brand-product-name } 会向 { -vendor-short-name } 发送诊断和交互数据。
onboarding-refresh-fro-theme-header = 随心定制您的外观
onboarding-refresh-tab-layout-minimal = 极简
onboarding-minimal-tabs-tooltip =
    .title = 浏览器窗口将标签页显示为屏幕侧边的小图标，位于最小化的侧边栏中。
onboarding-minimal-tabs-description =
    .aria-description = 浏览器窗口将标签页显示为屏幕侧边的小图标，位于最小化的侧边栏中。

# @file browser/omni.ja localization/zh-CN/browser/sync.ftl
fxa-menu-signed-out-title = 登录以同步
fxa-menu-signed-out-description = 您已退出登录

# @file browser/omni.ja localization/zh-CN/browser/preferences/preferences.ftl
containers-sites-card-header =
    .label = 站点专用身份
    .description = 为某个网站选择身份后，{ -brand-short-name } 每次打开该网站时都会使用它。

# @file browser/omni.ja localization/zh-CN/browser/preferences/zen-preferences.ftl
zen-settings-workspaces-sync =
    .label = 跨设备同步侧边栏
    .description = 通过您的 Mozilla 账户，在所有设备上同步工作区、固定标签页和文件夹。
zen-settings-normal-tabs-sync =
    .label = 包含未固定的标签页
    .description = 同时同步各工作区中的普通标签页，而不只是固定标签页和文件夹。
zen-library-shortcut-toggle = 切换资料库
zen-local-shortcut-not-set = 未设置

# @file browser/omni.ja localization/en-US/browser/preferences/zen-preferences.ftl
zen-local-shortcut-not-set = Not set

# @file browser/omni.ja localization/zh-CN/browser/zen-command-palette.ftl
zen-action-unsplit-view = 展开当前视图
zen-action-new-space = 新建工作区
zen-action-reopen-closed-tab = 重新打开已关闭的标签页
zen-action-duplicate-tab = 复制当前标签页
zen-action-reset-pinned-tab = 重置固定标签页
zen-action-open = 打开
zen-action-collapse-all-folders = 折叠所有文件夹
zen-action-expand-all-folders = 展开所有文件夹

# @file browser/omni.ja localization/zh-CN/browser/zen-general.ftl
zen-sidebar-drag-collapsed-toast = 侧边栏已隐藏！使用 <span>{ $shortcut }</span> 恢复侧边栏。

# @file browser/omni.ja localization/zh-CN/browser/zen-library.ftl
zen-library-button =
    .label = 资料库
    .tooltiptext = 资料库
library-footer-close-button =
    .tooltiptext = 关闭资料库
library-footer-donate-button =
    .tooltiptext = 捐赠给 Zen
library-history-section-title = 历史记录
library-downloads-section-title = 下载
library-boosts-section-title = Boost
library-media-section-title = 媒体
library-spaces-section-title = 工作区
library-filter-button = 筛选
library-filter-done = 完成
library-history-filter-title = 筛选历史记录…
library-history-filter-when = 访问时间？
library-filter-today = 今天
library-filter-week = 本周
library-filter-month = 本月
library-history-filter-sort = 排序方式
library-history-sort-date = 按日期
library-history-sort-site = 按网站
library-history-sort-most-visited = 按访问频率
library-history-sort-last-visited = 按最近访问
library-history-site-other = 其他
library-history-search-placeholder =
    .placeholder = 搜索历史记录…
library-history-empty = 未找到历史记录
library-media-empty = 未找到媒体
library-media-search-placeholder =
    .placeholder = 搜索媒体…
library-media-loading = 正在查找媒体…
library-media-opt-in-title = 资料库中的媒体
library-media-opt-in-body = 在 Zen 资料库中显示截图、图片和视频，方便快速取用。
library-media-opt-in-button = 显示媒体
library-media-opt-in-note = 媒体不会离开您的计算机，除您之外任何人都无法查看。
library-media-filter-title = 筛选媒体…
library-media-filter-folders = 查找位置
library-media-open-in = 在 { $app } 中打开
library-media-close =
    .title = 关闭
library-media-previous =
    .title = 上一个
library-media-next =
    .title = 下一个
library-media-more =
    .title = 更多选项
library-media-menu-open =
    .label = 打开
library-media-menu-copy =
    .label = 复制
library-history-opened-in-background = 已在新标签页中打开
library-history-forget-button =
    .title = 从历史记录中移除
library-history-reopen-button =
    .title = 重新打开页面
library-history-clear =
    .label = 清除历史记录
library-history-clear-last-hour =
    .label = 最近一小时
library-history-clear-last-12-hours =
    .label = 最近 12 小时
library-history-clear-today =
    .label = 今天
library-history-clear-last-week =
    .label = 最近一周
library-history-clear-last-month =
    .label = 最近一个月
library-history-clear-all =
    .label = 全部
library-history-clear-prompt-title = 清除历史记录？
library-history-clear-prompt-message = 此时间范围内访问过的页面将被遗忘。此操作无法撤销。
library-history-clear-prompt-accept = 清除历史记录
library-history-filter-source = 查看范围
library-history-source-history = 历史记录
library-history-source-closed = 已关闭的标签页
library-history-closed-empty = 没有已关闭的标签页
library-open-legacy =
    .label = 打开旧版资料库窗口
library-archive-section-title = 归档
library-downloads-empty = 未找到下载
library-downloads-more-button =
    .title = 更多选项
library-downloads-menu-open =
    .label = 打开 { $name }
library-downloads-menu-copy =
    .label = 复制 { $name }
library-downloads-menu-hide =
    .label = 从 Zen 中隐藏
library-downloads-menu-delete =
    .label = 删除文件
library-downloads-opening-in =
    { PLATFORM() ->
        [macos] 正在访达中打开…
        [windows] 正在文件资源管理器中打开…
       *[other] 正在文件管理器中打开…
    }
library-downloads-open-when-done = 完成后打开
library-downloads-cancel-button =
    .title = 取消下载
library-downloads-filter-title = 筛选下载…
library-downloads-filter-type = 文件类型
library-downloads-filter-when = 下载时间？
library-downloads-type-images = 图片
library-downloads-type-video = 视频
library-downloads-type-audio = 音频
library-downloads-type-documents = 文档
library-downloads-type-archives = 压缩文件
library-downloads-type-apps = 应用
library-downloads-retry-button =
    .title = 重试下载
library-downloads-clear-all =
    .label = 清除所有下载
library-spaces-theme-button =
    .title = 更改主题
library-spaces-move-button =
    .title = 拖动以重新排序
library-spaces-actions-button =
    .tooltiptext = 更多选项
library-spaces-icon-button =
    .title = 更改图标
library-spaces-name-button =
    .title = 重命名工作区
library-boosts-search-placeholder =
    .placeholder = 搜索 Boost…
library-boosts-empty = 尚无 Boost
library-boosts-toggle =
    .aria-label = 启用 Boost
library-boosts-menu-edit =
    .label = 编辑 Boost

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
inspector-split-orientation-button-title = 面板布局
inspector-split-orientation-auto = 自动
inspector-split-orientation-side-by-side = 并排
inspector-split-orientation-stacked = 堆叠

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
