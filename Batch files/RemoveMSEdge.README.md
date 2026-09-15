# RemoveMSEdge：关联清理与旧权限残留

`RemoveMSEdge.bat` 保留 WebView2 及共享更新组件；`RemoveMSEdgeAll.bat` 连同这些组件一起删除。两个 BAT 都必须与 `EdgeAssociations.ps1` 放在同一目录。缺少辅助脚本时会在提权和卸载之前退出。

## 先检查旧版本残留

在这个目录运行任一 BAT 的审计入口：

```powershell
.\RemoveMSEdge.bat -audit-associations
```

它只读检查当前用户的文件类型和 URL 关联，不卸载、联网或请求 UAC。相同参数也适用于 `RemoveMSEdgeAll.bat`。建议从普通 Windows Terminal/PowerShell 运行；受隔离的宿主可能读取不同的注册表视图。最终应由 Windows 设置和实际文件打开行为确认。

检查包括：

- 关联父项是否匹配本次确认的异常权限：关闭继承、Everyone 只读、SYSTEM/管理员完全控制，缺少当前用户的写权限。
- 指向 Edge 的选择是否仍有可用程序、是否有 Hash 保护、直接与嵌套 ProgId 是否冲突。
- 旧 `RemoveMSEdge*_dbg.log` 是否记录过文件关联 `UserChoice` 的权限修改尝试，且该项现已缺少通常存在的用户 SetValue 拒绝规则。日志只作为证据，不执行其中的文本；URL 关联和 `UserChoiceLatest` 的权限不同，不能用同一规则推断损坏。

## 修复可以确认的旧问题

```powershell
.\RemoveMSEdge.bat -repair-associations
```

此入口仅修复上述严格匹配的父项权限，并要求其父目录有可继承的当前用户完全控制规则、没有拒绝规则。先将原 DACL 写入 `RemoveMSEdge-backups/*.json`，再恢复继承；校验失败时恢复原 DACL。备份写入失败时不修改注册表。

**不会更改 ProgId、Hash 或当前浏览器选择，也不会停用 UCPD。** 修复后重新打开 Windows 设置选择目标浏览器。

旧版曾删除过哪些自定义拒绝规则，无法从“尝试修改权限”的日志还原。`ReviewLegacyChoiceAcl` 和 `ReviewCustomParentAcl` 会保留原状并报告待检查，避免把正常或自定义权限覆盖掉。需要当时的原始 ACL 备份才能精确还原；不能从别的浏览器选择键盲目复制权限。此次 `.html` 父项问题不能据此归因于卸载工具。

## 新的清理行为

```powershell
.\RemoveMSEdge.bat -userchoice
```

完整卸载流程也使用同一份清理实现：

1. 已安装的 Edge 处理程序和其他浏览器的选择均保留。
2. 仅在能够确认 Edge 的 open 命令不存在或可执行文件已不存在，且根/嵌套位置均无 Hash、只有一个 ProgId 时清理。
3. 删除前备份并再次检查选择值；仅原子删除那个 `ProgId` 值，保留可能出现的空壳键及其权限。不会递归删除受保护的选择树。
4. 删除失败直接报告，不移除拒绝规则、不接管所有权、不篡改 Hash。受保护的旧 Edge 选择通过 Windows 默认应用界面重新选择。
5. 无法解析的命令、环境变量路径、DelegateExecute、重复/冲突的选择值均保留并报告。

清理不再有“修改权限成功、删除失败后留下新权限”的分支。`-repair-associations` 独立于卸载，避免正常清理顺便修改历史或自定义权限。

| 退出码 | 含义 |
|---|---|
| `0` | 检查/操作完成，没有待处理项 |
| `1` | 扫描、备份、修改或报告写入失败 |
| `2` | 有受保护、未知或需要人工核对的项目 |

完整 BAT 卸载若任一用户的关联清理返回非零，会显示警告并以 `2` 退出，不再输出无条件成功；详情保留在调试日志中。默认关联清理并不会将不确定的记录视为已成功清除。

可直接调用辅助脚本生成结构化报告：

```powershell
.\EdgeAssociations.ps1 -Mode Audit -ReportPath "$env:USERPROFILE\Desktop\edge-associations.json"
.\EdgeAssociations.ps1 -Mode Repair -BackupDirectory "$env:USERPROFILE\Desktop\edge-association-backups"
```

指定 `-UserSid` 时只检查已经加载的用户 hive；不会自行加载离线配置。旧日志可通过 `-LegacyLog` 指定。JSON 备份记录用户 SID、相对注册表路径、操作及原状态；`RestoreParentInheritance` 的 `Before.AccessSddl` 是回滚父项 DACL 所需的数据。备份不是可以双击导入的 `.reg` 文件，恢复前应核对用户和路径。

## 验证

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\EdgeAssociations.Tests.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\EdgeAssociations.Batch.Tests.ps1
```

注册表测试仅使用随机 `HKCU\Software\Dox.EdgeAssociations.Tests\<GUID>` 子树，并清理测试创建的键。BAT 测试在临时目录用替代辅助脚本验证参数、空格路径、缺少依赖及退出码传播。测试不会运行真正的卸载流程或触碰生产文件关联。
