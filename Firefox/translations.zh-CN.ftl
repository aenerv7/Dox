# Firefox 界面翻译补全文案（zh-CN）。
#
# 本文件由 patch_firefox.py 维护：`build` 发现英文有、zh-CN 没有的消息时，
# 调用本地 magpie 逐条翻译，校验消息 ID、属性和变量引用后追加到对应段落。
# 一个文件对应一种语言（translations.<语言>.ftl），不要在此混放其他语言。
#
# 段落格式（每段对应一个 zh-CN 资源，路径为归档内的完整路径）：
#
#   # @file omni.ja localization/zh-CN/toolkit/about/aboutAddons.ftl
#   some-message-id = 译文
#   another-message-id =
#       .label = 带属性的译文
#
# 段落标题以下的内容全是 Fluent 消息；不要改动或合并段落标题，
# 也不要手工删除已复核的译文。要重译某条，先删除该条再运行 build。

# @file omni.ja localization/zh-CN/toolkit/about/aboutAddons.ftl
mlmodel-speech-recognition = { -brand-short-name } 使用它进行设备端语音识别
find-more-addons-promo =
  .heading = 按你的方式打造 { -brand-product-name }
  .message = 添加工具和样式，满足你的需求和喜好。
find-more-themes-promo =
  .heading = 发现更多新鲜外观
  .message = 选择一种风格，让 { -brand-product-name } 更有你的个性。
themes-mode =
  .aria-label = 外观

# @file omni.ja localization/zh-CN/locales-preview/remote-agent.ftl
remote-agent-connection-prompt-title = 允许远程控制？
remote-agent-connection-prompt-message =
    一个应用想要控制此浏览器会话。
    它可以读取您的标签页内容、访问您保存的数据，并导航到任何网站。

    仅当您自己发起此连接，并且信任该应用和此计算机时，才允许。
remote-agent-connection-prompt-allow-button = 允许
remote-agent-connection-prompt-deny-button = 拒绝
remote-agent-connection-prompt-remember-checkbox = 记住我的决定，直到浏览器退出

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
    .label = 下载可见日志 (.zip)
about-sync-log-clear-button =
    .label = 清除日志
about-sync-log-row-success =
    .heading = 成功 — { DATETIME($date, dateStyle: "medium", timeStyle: "medium") }
about-sync-log-row-error =
    .heading = 错误 — { DATETIME($date, dateStyle: "medium", timeStyle: "medium") }
about-sync-log-empty = 尚未记录任何同步日志。
about-sync-log-empty-filtered = 没有符合当前筛选条件的日志。
about-sync-log-view-error = 无法读取此日志文件。
about-sync-log-open-raw =
    .label = 打开原始文件
about-sync-log-clear-confirm-title = 清除同步日志？
about-sync-log-clear-confirm-message =
    { $count ->
        [one] 这将永久删除 { $count } 个可见日志文件。
       *[other] 这将永久删除 { $count } 个可见日志文件。
    }
about-sync-log-clear-confirm-accept = 删除

# @file omni.ja localization/zh-CN/toolkit/about/aboutGlean.ftl
about-glean-store-submitted-pings-select-label = Ping：
about-glean-store-submitted-pings =
  .label = 存储已提交的 Ping
  .description = 允许在内存中存储已提交的 Ping

# @file omni.ja localization/zh-CN/toolkit/about/aboutLogging.ftl
about-logging-preset-vpn-label = VPN
about-logging-preset-vpn-description = 记录模块日志以诊断 IP Protection (VPN) 问题

# @file omni.ja localization/zh-CN/toolkit/about/aboutNetworking.ftl
about-networking-ssl-tokens-summary-count = { $count ->
    [one] { $count } 个令牌
   *[other] { $count } 个令牌
}
about-networking-ssl-tokens-summary-expired = { $count ->
    [one] （{ $count } 个已过期）
   *[other] （{ $count } 个已过期）
}
about-networking-ssl-tokens-summary-compression = { $decompressedLength } → { $compressedLength } B（已节省 { $saved }%）
about-networking-ssl-tokens-summary-capacity = { $used } / { $capacity } KB ({ $percent }%)
about-networking-ssl-tokens-summary-certs = 已存储证书：{ $references }（{ $totalBytes } B），去重后：{ $distinct }（{ $distinctBytes } B）
about-networking-ssl-tokens-partition-key = 分区键
about-networking-ssl-tokens-tokens-column = 令牌
about-networking-ssl-tokens-expires = 过期时间
about-networking-ssl-tokens-certificate = 证书
about-networking-ssl-tokens-token-list = { $count ->
    [one] { $count } 个令牌
   *[other] { $count } 个令牌
}
about-networking-ssl-tokens-restored =
  .alt = 已从存储恢复
  .title = 已从存储恢复
about-networking-ssl-tokens-new =
  .alt = 本次会话中新建
  .title = 本次会话中新建
about-networking-ssl-tokens-compression-details =
  .title = 令牌：{ $tokenLength } B。编码后：{ $decompressedLength } → { $compressedLength } B。
about-networking-ssl-tokens-overridable-error = 可覆盖的错误类别
about-networking-ssl-tokens-cert-chain = 证书链（{ $count }）
about-networking-ssl-tokens-handshake-certs = 握手证书（{ $count }）

# @file omni.ja localization/zh-CN/toolkit/about/aboutPDF.ftl
about-pdf-features-cta =
  .label = 探索 PDF 工具
about-pdf-features-intro = 直接在您浏览的位置阅读、标注和签署 PDF。简单、免费且私密。
about-pdf-features-back =
  .label = 返回
about-pdf-feature-organize-heading = 整理页面
about-pdf-feature-organize-description = 重新排序、删除、合并和导出页面。
about-pdf-feature-signatures-heading = 保存签名
about-pdf-feature-signatures-description = 创建多个签名并将其添加到表单中。
about-pdf-feature-comments-heading = 添加注释
about-pdf-feature-comments-description = 阅读时留下评论和提醒。
about-pdf-feature-annotate-heading = 标注 PDF
about-pdf-feature-annotate-description = 添加文本、高亮和绘图。
about-pdf-feature-images-heading = 上传无障碍图像
about-pdf-feature-images-description = 添加替代文本，让图像对更多人可用。
about-pdf-feature-view-heading = 选择视图
about-pdf-feature-view-description = 垂直或水平滚动，或切换页面布局。
about-pdf-feature-presentation-heading = 全屏演示 PDF
about-pdf-feature-presentation-description = 在演示模式下共享简洁视图。
about-pdf-feature-details-heading = 更快查找详细信息
about-pdf-feature-details-description = 使用大纲、附件和属性浏览 PDF。

# @file omni.ja localization/zh-CN/toolkit/about/aboutProcesses.ftl
about-processes-unload-tab =
    .title = 卸载标签页
about-processes-go-to-tab =
    .title = 转到标签页
about-processes-column-cpu-total-tab = CPU
    .title = 占所有核心总 CPU 容量的百分比
about-processes-column-memory-resident-tab = RAM
about-processes-utility-actor-hw-inference = 硬件加速推理
about-processes-tab-cpu = { NUMBER($percent, maximumSignificantDigits: 2, style: "percent") }
about-processes-tab-cpu-fully-idle = 空闲
about-processes-tab-cpu-almost-idle = < 0.1%

# @file omni.ja localization/zh-CN/toolkit/about/aboutSupport.ftl
pdfjs-open-attachments-inline = 以内嵌方式打开 PDF 附件

# @file omni.ja localization/zh-CN/toolkit/about/pdfFeaturesNotification.ftl
pdf-features-notification =
  .heading = 在 { -brand-short-name } 中，PDF 更好用了。
  .aria-label = 通知
pdf-features-notification-message = 拆分、合并及更多功能。 <a data-l10n-name="features-link">查看 PDF 功能</a>

# @file omni.ja localization/zh-CN/toolkit/about/url-classifier.ftl
url-classifier-content-classifier-loading-url-enabled = 启用加载 URL
url-classifier-content-classifier-probes = 探测
url-classifier-content-classifier-force-third-party = 强制第三方进入顶层框架
url-classifier-content-classifier-probe-blocking-btn = 探测阻止
url-classifier-content-classifier-probe-annotate-btn = 探测标注
url-classifier-content-classifier-probe-feature-btn = 探测功能
url-classifier-content-classifier-engine-details = 引擎详情
url-classifier-content-classifier-col-engine-result = 引擎结果
url-classifier-content-classifier-verdict-hit = 命中
url-classifier-content-classifier-verdict-exception = 例外
url-classifier-content-classifier-verdict-miss = 未命中
url-classifier-content-classifier-verdict-error-with-code = 错误（{ $code }）

# @file omni.ja localization/zh-CN/toolkit/contentanalysis/contentanalysis.ftl
contentanalysis-slow-agent-dialog-body-clipboard-copy = { $agent } 正在根据您所在组织的数据政策审查您复制的内容。这可能需要一些时间。
contentanalysis-clipboard-copy-blocked-replacement = 您所在的组织已限制复制此内容。
contentanalysis-operationtype-clipboard-copy = 复制的内容
contentanalysis-error-message-clipboard-copy = 复制被拒绝。
contentanalysis-block-dialog-title-clipboard-copy = 您无权复制此内容
contentanalysis-block-dialog-body-clipboard-copy = 根据您所在组织的数据保护政策，您无权复制此内容。如需了解更多信息，请联系您的管理员。

# @file omni.ja localization/zh-CN/toolkit/formautofill/formAutofill.ftl
autofill-delete-payment-method-os-prompt-macos = 删除已存储的支付方式信息
autofill-delete-payment-method-os-prompt-windows = { -brand-short-name } 正尝试删除已存储的支付方式信息。请在下方确认访问此 Windows 帐户。
autofill-delete-payment-method-os-prompt-other = { -brand-short-name } 正尝试删除已存储的支付方式信息。
credit-card-save-doorhanger-description-security-code = { -brand-short-name } 会加密您的卡号和安全码，因此只有您才能使用它们来填写支付表单。
credit-card-doorhanger-save-security-codes-checkbox =
    .label = 始终保存支付方式的安全码
autofill-card-security-code-label = CVC
credit-card-doorhanger-details-name = { $name }
credit-card-doorhanger-details-expiration = { $month }/{ $year }
credit-card-doorhanger-details-cvv = CVV 已保存
credit-card-doorhanger-details-name-expiration = { $name }, { $month }/{ $year }
credit-card-doorhanger-details-name-cvv = { $name } | CVV 已保存
credit-card-doorhanger-details-expiration-cvv = { $month }/{ $year } | CVV 已保存
credit-card-doorhanger-details-name-expiration-cvv = { $name }, { $month }/{ $year } | CVV 已保存

# @file omni.ja localization/zh-CN/toolkit/global/processTypes.ftl
process-type-utility-actor-hw-inference = 实用工具硬件加速推理

# @file omni.ja localization/zh-CN/toolkit/global/theme-picker.ftl
theme-picker-mode =
    .aria-label = 外观
theme-picker-themes =
    .aria-label = 主题

# @file omni.ja localization/zh-CN/toolkit/main-window/autocomplete.ftl
autocomplete-more-options = 更多选项
autocomplete-more-options-for-entry = { $entry } 的更多选项
autocomplete-delete-address-entry = 删除地址 { $entry }
autocomplete-delete-payment-method-entry = 删除付款方式 { $entry }
autocomplete-delete-entry = 删除
autocomplete-delete-form-history-entry2 = 从表单历史记录中删除 { $entry }
autocomplete-delete-password-title = 删除密码？
autocomplete-delete-address-title = 删除地址？
autocomplete-delete-payment-method-title = 删除付款方式？
autocomplete-remove-record-message = 此操作无法撤销。
autocomplete-delete-record-button = 删除
autocomplete-remove-password-os-auth-dialog-message-win = 要删除您的密码，请输入您的 Windows 登录凭据。这有助于保护您账户的安全。
autocomplete-remove-password-os-auth-dialog-message-macosx = 删除已保存的密码
autocomplete-remove-password-os-auth-dialog-caption = { -brand-full-name }

# @file omni.ja localization/zh-CN/toolkit/neterror/netError.ftl
neterror-search-cta-title = 无法访问此网站
neterror-search-cta-things-to-try = 请尝试以下步骤：
neterror-search-cta-hint-check-address = 请仔细检查网站地址
neterror-search-cta-hint-search = 在网上搜索以找到该网站
neterror-search-cta-hint-search-query = 在网上搜索 <strong>“{ $query }”</strong>
neterror-search-cta-search-button =
    .label = 搜索
    .accesskey = c
    .tooltiptext = 在新标签页中打开搜索结果
neterror-search-cta-reload-button =
    .label = 重新载入
    .accesskey = R
neterror-search-cta-offline = 你似乎处于离线状态。请重新连接后再试。
neterror-search-cta-error-code = 错误代码：{ $error }
neterror-search-cta-learn-more = 详细了解

# @file omni.ja localization/zh-CN/toolkit/payments/payments.ftl
credit-card-label-with-security-code = { $label } | 已保存 CVV
    .aria-label = { $ariaLabel }，已保存 CVV

# @file omni.ja localization/zh-CN/toolkit/pdfviewer/viewer.ftl
pdfjs-digital-signature-properties-banner-verified = 文档已使用有效的数字签名签署
pdfjs-digital-signature-properties-banner-unknown =
    { $count ->
        [one] 文档已签署，但有 { $count } 个数字签名无法验证
       *[other] 文档已签署，但有 { $count } 个数字签名无法验证
    }
pdfjs-digital-signature-properties-banner-untrusted =
    { $count ->
        [one] 文档使用 { $count } 个不受信任的证书签署
       *[other] 文档使用 { $count } 个不受信任的证书签署
    }
pdfjs-digital-signature-properties-banner-expired =
    { $count ->
        [one] 文档使用 { $count } 个已过期的证书签署
       *[other] 文档使用 { $count } 个已过期的证书签署
    }
pdfjs-digital-signature-properties-banner-invalid =
    { $count ->
        [one] 文档有 { $count } 个无效的数字签名
       *[other] 文档有 { $count } 个无效的数字签名
    }
pdfjs-digital-signature-properties-banner-revoked =
    { $count ->
        [one] 文档使用 { $count } 个已吊销的证书签署
       *[other] 文档使用 { $count } 个已吊销的证书签署
    }
pdfjs-digital-signature-properties-sub-signatures =
    { $count ->
        [one] 子签名（{ $count }）
       *[other] 子签名（{ $count }）
    }

# @file browser/omni.ja localization/zh-CN/browser/aiWindow.ftl
toolbar-switcher-customizable-label-v2 =
    .label = { -smart-window-brand-name } 切换器
    .tooltiptext = 在智能窗口和经典窗口之间切换

# @file browser/omni.ja localization/zh-CN/browser/browser.ftl
urlbar-addons-shortcut-moved-title = { $searchTabsShortcut } 现在用于搜索标签页
urlbar-addons-shortcut-moved-description = 要打开扩展和主题，请使用 { $addonsShortcut }。
urlbar-addons-shortcut-moved-change-shortcuts = 管理快捷方式
urlbar-addons-shortcut-moved-dismiss = 知道了

# @file browser/omni.ja localization/zh-CN/browser/places.ftl
places-share-folder3 =
  .label = 共享文件夹
  .accesskey = a
  .badge = 新

# @file browser/omni.ja localization/zh-CN/browser/menubar.ftl
menu-file-close =
    .label = 关闭
    .accesskey = C
menu-history-search-tabs =
    .label = 搜索标签页

# @file browser/omni.ja localization/zh-CN/browser/autoTabGrouping.ftl
smartwindow-organize-tabs-button =
    .label = 整理标签页
    .tooltiptext = 整理标签页
smartwindow-group-tabs-panel-heading = 整理标签页
smartwindow-group-tabs-loading = 正在检查标签页以寻找有用的标签组…
smartwindow-group-tabs-empty = 目前没有可建议的标签组。请稍后再检查。
smartwindow-group-tabs-all-sorted = 标签页整理得不错
smartwindow-group-tabs-create-all = 创建所有标签组
smartwindow-group-tabs-suggested-heading = 建议的标签组
smartwindow-group-tabs-flyout-list =
    .aria-label = { $groupLabel } 中的标签页
smartwindow-group-tabs-suggestion =
    .aria-label =
        { $tabCount ->
            [one] 创建标签组 { $groupLabel }，{ $tabCount } 个标签页
           *[other] 创建标签组 { $groupLabel }，{ $tabCount } 个标签页
        }
smartwindow-group-tabs-just-created-heading = 刚刚创建
smartwindow-group-tabs-ungroup = 取消标签页分组
smartwindow-group-tabs-view-tab-groups = 查看标签页组
smartwindow-group-tabs-groups-list =
    .aria-label = 标签页组
smartwindow-group-tabs-close-duplicates =
    { $tabCount ->
        [one] 关闭 { $tabCount } 个重复标签页
       *[other] 关闭 { $tabCount } 个重复标签页
    }
smartwindow-group-tabs-duplicates-list =
    .aria-label = 要关闭的重复标签页

# @file browser/omni.ja localization/zh-CN/browser/ipProtection.ftl
ipprotection-summer-promo-offramp-generic-description = 使用您的 { $maxUsage } GB 和 6 个位置，获得额外隐私保护，让您的浏览活动更难被追踪到您。
ipprotection-summer-promo-offramp-generic-description-default-browser-users-no-upgrade = 使用您的 { $maxUsage } GB 和 20 多个位置，获得额外隐私保护，让您的浏览活动更难被追踪到您。
ipprotection-feature-introduction-title-private-browsing = 使用 { -brand-product-name } 的内置 VPN，最大化隐私保护
ipprotection-feature-introduction-description-private-browsing-1 = 帮助在浏览时隐藏您的位置，获得<a data-l10n-name="learn-more-vpn">额外隐私保护</a>。设置规则，以便在需要额外隐私或基于位置浏览时开启 VPN，在不需要时关闭。
ipprotection-feature-introduction-description-inclusions = 帮助在浏览时隐藏您的位置，获得<a data-l10n-name="learn-more-vpn">额外隐私保护</a>。针对特定网站开启或关闭 VPN。
ipprotection-site-inclusions-callout-title-existing-users = 设置内置 VPN 规则，然后继续浏览
ipprotection-site-inclusions-callout-title-lapsed-users = 试用内置 VPN，现在可按站点设置
ipprotection-site-inclusions-callout-description = 在需要额外隐私或基于位置浏览时开启，在不需要时关闭。
ipprotection-site-inclusions-callout-primary-button = 设置规则
unauthenticated-site-rules-message = 控制哪些网站使用 VPN，哪些不使用。
site-rules-manage-rules-link-text = 管理 VPN 规则
site-rules-status-heading = 您的规则
site-rules-description-exclusion = 此网站的 VPN 已关闭
site-rules-description-inclusion = 此网站的 VPN 已开启
ip-protection-site-rules-header =
  .heading = 管理网站规则
ip-protection-site-rules-button =
  .label = 管理网站规则
  .description = 为需要额外隐私保护或关闭 VPN 的网站设置规则。

# @file browser/omni.ja localization/zh-CN/browser/genai.ftl
genai-prompts-summarize-page = 请使用精确简洁的语言总结 { $url } 处的网页。在总结中使用标题和项目符号列表，以便快速浏览。保持含义和事实准确性。
highlight-to-search-settings-enable =
    .label = 选择文本时显示操作菜单
    .description = 选择内容时可快速访问实用操作。
highlight-to-search-settings-ask-provider =
    .label = 询问 { $provider }
highlight-to-search-settings-ask-generic =
    .label = 询问 AI

# @file browser/omni.ja localization/zh-CN/browser/newtab/asrouter.ftl
lapsed-user-toast-import-title = 全新外观。无需从头开始。
lapsed-user-toast-import-subtitle = 从您当前使用的浏览器导入书签、密码和历史记录。

# @file browser/omni.ja localization/zh-CN/browser/aboutRestartRequired.ftl
restart-required-multiple-instances-question = 为什么在多个配置文件或 { -brand-short-name } 实例中会发生这种情况？
restart-required-multiple-instances-answer = 如果一个配置文件或实例在另一个仍处于打开状态时更新，已打开的那个可能会停留在旧版本。重新启动可使所有内容保持在同一版本。

# @file browser/omni.ja localization/zh-CN/browser/defaultBrowserNotification.ftl
default-browser-guidance-notification-auto-trigger-title = 使用 { -brand-short-name } 打开您的链接
default-browser-guidance-notification-auto-trigger-body = 在设置中选择 { -brand-short-name } 作为您的默认浏览器。

# @file browser/omni.ja localization/zh-CN/browser/featureCallout.ftl
taskbar-tabs-chat-callout-title-v3 = 在任务栏中保持联系

# @file browser/omni.ja localization/zh-CN/browser/migrationWizard.ftl
migration-wizard-migrator-display-name-self = { -brand-product-name }

# @file browser/omni.ja localization/zh-CN/browser/newtab/newtab.ftl
newtab-custom-widget-stocks-toggle2 =
  .label = 财经
newtab-custom-widget-horoscopes-toggle =
  .label = 星座运势
newtab-wallpaper-firefox-side-kit-dark = 深色背景，左侧有一只狐狸
newtab-wallpaper-firefox-side-kit-light = 浅色背景，左侧有一只狐狸
newtab-wallpaper-firefox-peak-dark = 深色背景，狐狸的脸位于左边缘
newtab-wallpaper-firefox-peak-light = 浅色背景，狐狸的脸位于左边缘
home-prefs-stocks-header2 =
    .label = 财经
home-prefs-search-widget-header =
    .label = 搜索
home-prefs-horoscopes-header =
    .label = 星座运势
newtab-privacy-widget-open-menu-button =
    .title = 打开隐私菜单
    .aria-label = 打开隐私菜单
newtab-privacy-etp-off-faster-browsing = 浏览更快，跟踪器更少。
newtab-privacy-message-milestone-week =
    { $count ->
        [one] 本周已拦截 { $count } 个跟踪器。看看 { -brand-short-name } 为你挡住了什么
       *[other] 本周已拦截 { $count } 个跟踪器。看看 { -brand-short-name } 为你挡住了什么
    }
newtab-privacy-message-milestone-total =
    { $count ->
        [one] 已拦截 { $count } 个跟踪器。这是朝着按你的方式保护隐私迈出的重要一步。
       *[other] 已拦截 { $count } 个跟踪器。这是朝着按你的方式保护隐私迈出的重要一步。
    }
newtab-stocks-widget-title2 = 财经
newtab-stocks-widget-open-menu-button2 =
    .title = 打开财经菜单
    .aria-label = 打开财经菜单
newtab-stocks-watchlist-empty = 开始关注对你重要的股票
newtab-stocks-search-hint = 搜索股票代码或公司，将其添加到你的自选列表
newtab-horoscopes-widget-title = 星座运势
newtab-horoscopes-widget-menu-button =
    .aria-label = 星座运势选项
newtab-horoscopes-menu-learn-more = 详细了解

# @file browser/omni.ja localization/zh-CN/browser/newtab/onboarding.ftl
onboarding-refresh-hero-text = 专为保护你而打造，而非跟踪你。
onboarding-refresh-tou-default-unchecked = 每次浏览时都保持内置保护
onboarding-refresh-tou-pin-unchecked = 让唯一的主流独立浏览器触手可及
onboarding-refresh-terms-of-use-with-links = 继续操作，即表示你同意 <a data-l10n-name="terms_of_use">{ -brand-product-name } 使用条款</a> 和我们的 <a data-l10n-name="privacy_notice">隐私声明</a>。为帮助改进浏览器，{ -brand-product-name } 会将诊断和交互数据发送给 { -vendor-short-name }。
onboarding-refresh-tab-layout-minimal = 极简
onboarding-minimal-tabs-tooltip =
    .title = 一个浏览器窗口，在最小化侧边栏中，标签页以小图标形式沿屏幕侧边显示。
onboarding-minimal-tabs-description =
    .aria-description = 一个浏览器窗口，在最小化侧边栏中，标签页以小图标形式沿屏幕侧边显示。
onboarding-carousel-nav =
  .aria-label = 功能亮点
welcome-back-onboarding-title = 旨在帮助你完成更多事情的新功能
welcome-back-onboarding-primary-button-label = 开始浏览
welcome-back-onboarding-secondary-button-label = 查看还有哪些新功能
welcome-back-onboarding-pill-label-tabs = 整理标签页
welcome-back-onboarding-pill-label-vpn = 内置 VPN
welcome-back-onboarding-pill-label-pdf = PDF 工具
welcome-back-onboarding-card-label-tabs = 使用垂直标签页和标签组整理
welcome-back-onboarding-card-label-vpn = 使用内置 VPN 保持隐藏
welcome-back-onboarding-card-label-pdf = 高亮、签名和处理 PDF
welcome-back-onboarding-card-tilebutton-label = 试一试

# @file browser/omni.ja localization/zh-CN/browser/policies/policies-descriptions.ftl
policy-DisablePasswordReveal2 = 不允许在已保存的登录信息或密码字段中显示密码。

# @file browser/omni.ja localization/zh-CN/browser/preferences/browserIcon.ftl
appearance-browser-icon-bonus-group2 =
    .label = 奖励

# @file browser/omni.ja localization/zh-CN/browser/preferences/languages.ftl
browser-languages-update-error =
    .message = { -brand-short-name } 目前无法更新你的语言。请检查你是否已连接到互联网，或重试。

# @file browser/omni.ja localization/zh-CN/browser/preferences/preferences.ftl
settings-keyboard-shortcuts-addressbar-link =
    .label = 在搜索中自定义地址栏设置
addressbar-navigation-group =
    .label = 地址栏导航
addressbar-skip-result-menu-on-tab =
    .label = 使用 Tab 键移动焦点时跳过结果菜单
containers-sites-card-header =
    .label = 网站专属容器
    .description = 为网站选择容器后，{ -brand-short-name } 会在每次打开该网站时使用它。
prefs-syncing-off-3 =
    .label = 同步已关闭
    .description = 开启同步即可在此设备上获取你的书签、密码、历史记录等。
sync-syncing-across-devices-heading-3 = 此设备上的数据同步
sync-syncing-across-devices-empty-state3 =
    .label = 管理同步数据
    .description = 你还没有同步任何内容……请选择要在此设备上同步的内容。
sync-choose-what-to-sync-dialog5 =
    .title = 管理此设备上同步的内容
    .style = min-width: 36em;
    .buttonlabelaccept = 保存
    .buttonaccesskeyaccept = S
    .buttonlabelextra2 = 断开连接…
    .buttonaccesskeyextra2 = D
payment-moz-box-item-with-security-code =
  .label = { $cardNumber }
  .description = { $expDate } | 已保存 CVV
payment-moz-box-item-security-code-only =
  .label = { $cardNumber }
  .description = 已保存 CVV

# @file browser/omni.ja localization/zh-CN/devtools/client/application.ftl
session-history-navigate-button-title = 导航到会话历史记录条目 { $index }

# @file browser/omni.ja localization/zh-CN/devtools/client/inspector.ftl
inspector-split-orientation-button-title = 面板布局
inspector-split-orientation-auto = 自动
inspector-split-orientation-side-by-side = 并排
inspector-split-orientation-stacked = 堆叠
inspector-emulation-panel-reduced-motion-reduce = 减少
  .aria-label = 启用减少动态效果模拟
inspector-emulation-panel-reduced-motion-no-preference = 无偏好
  .aria-label = 启用减少动态效果模拟的“无偏好”
inspector-emulation-panel-reduced-motion-none = 无模拟
  .aria-label = 禁用减少动态效果模拟

# @file browser/omni.ja localization/zh-CN/devtools/client/perftools.ftl
perftools-thread-jxl-img-decode =
  .title = JPEG XL 图像解码线程

# @file browser/omni.ja localization/zh-CN/devtools/client/toolbox-options.ftl
options-netmonitor-body-limit-label = 请求和响应正文大小上限（设置为 0 表示无限制）：
options-netmonitor-body-limit-tooltip =
    .title = 超出指定大小的请求或响应正文在网络监视器中显示或下载时将被截断。设置为 0 则没有限制。
options-netmonitor-body-limit-button =
    .title = 编辑请求/响应正文大小上限。
options-netmonitor-body-limit-restore-default =
    .title = 恢复请求/响应正文大小上限的默认值。
options-netmonitor-body-limit-set =
    .title = 将当前输入值设置为最大请求/响应正文大小。
options-stylesheets-in-the-debugger-label = 在调试器中显示样式表
options-stylesheets-in-the-debugger-tooltip =
    .title = 在调试器中列出并查看样式表
options-local-mode-only-work-locally = 本地模式仅在本地有效，调试远程上下文时会被禁用
options-local-mode-behavior = 本地模式允许您通过 HTTPS URL 加载本地文件，无需任何外部依赖。这些 URL 只能从已打开开发者工具的标签页中加载。
options-local-mode-domain-label = 自定义域名：
options-local-mode-origin-input =
    .placeholder = 本地映射的源
options-local-mode-origin-conflict = 此源与另一个现有映射冲突
options-local-mode-origin-invalid = 此源无效
options-local-mode-choose-folder = 浏览…
    .title = 选择用于提供此映射的本地文件夹
options-local-mode-choose-folder-picker-title = 为以下项选择本地模式文件夹：{ $url }
options-local-mode-toggle =
    .title = 切换此本地映射
options-local-mode-navigate-to =
    .title = 导航到此映射 URL
options-local-mode-new-mapping = 添加新的本地映射

# @file browser/omni.ja localization/zh-CN/devtools/client/toolbox.ftl
toolbox-local-mode-notice = 此文档也可以使用开发者工具“本地模式”从“{ $url }”加载，该模式可在设置面板中启用。
toolbox-local-mode-notice-navigate-to-existing-mapping = 导航到现有映射

# @file browser/omni.ja localization/zh-CN/devtools/server/actors/webconsole/commands/experimental-commands.ftl
webconsole-commands-usage-trace3 =
  :trace

  切换 JavaScript 跟踪器。

  跟踪器将显示页面调用的所有函数。

    它支持以下参数：
      --logMethod 设置为 ‘console’ 以将日志记录到 Web 控制台（默认），或设置为 ‘stdout’ 以将日志记录到标准输出。

      --return 可选标志，传入后还会在函数返回时记录日志。

      --values 可选标志，传入后还会记录函数调用参数以及返回值（当启用返回帧时）。

      --on-next-interaction 可选标志，设置后，跟踪器将仅在下次 mousedown 或 keydown 事件时启动。

      --dom-mutations 可选标志，设置后，跟踪器将记录所有 DOM 变更。
                      传入值时，可以通过逗号分隔的列表限制为特定变更类型：
                       - ‘add’ 将仅跟踪添加的 DOM 节点，
                       - ‘attributes’ 将仅跟踪属性发生变化的 DOM 节点，
                       - ‘remove’ 将仅跟踪移除的 DOM 节点。

      --max-depth 可选标志，会将跟踪日志限制为传入的给定深度。

      --max-records 可选标志，在记录传入数量的顶层帧后自动停止跟踪器。

      --prefix 可选字符串，会记录在所有跟踪日志之前。

      --help 或 --usage 显示此消息。
