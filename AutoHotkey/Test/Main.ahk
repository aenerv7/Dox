#Requires AutoHotkey v2.0
#SingleInstance

A_IconTip := "Test"

InstallKeybdHook

KeyHistory

+LWin::
{
    MsgBox GetKeyName("sc163")
    ; KeyWait A_ThisHotkey
    ; MsgBox ThisHotkey
    ; Send "#i"
    ; Send "{LWin down}l{LWin up}"
}