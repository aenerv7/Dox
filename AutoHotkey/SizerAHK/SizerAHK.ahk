#Requires AutoHotkey v2.0
#SingleInstance
#NoTrayIcon

A_IconTip := "SizerAHK"

windowTitle := ""

taskBarHeight := 48

screenHeightThreshold := 1080

guiWindowResize := ""

if (A_Language == 0804)
{
    guiWindowResizeTitle := "SizerAHK 自定义"
}
else
{
    guiWindowResizeTitle := "SizerAHK Customize"
}

darkModeEnabled := RegRead("HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize", "SystemUsesLightTheme", 1) = 0

; Applying dark theme for Pop-up Menu & Tray Menu. 
; Source: https://www.autohotkey.com/boards/viewtopic.php?p=515002#p515002
Class DarkMode
{   
    ; Mode: Dark = 1, Default (Light) = 0
    Static __New() => (  
        ; MsgBox(darkModeEnabled, "Dark Mode Status")
        DllCall(DllCall("GetProcAddress", "ptr", DllCall("GetModuleHandle", "str", "uxtheme", "ptr"), "ptr", 135, "ptr"), "int", darkModeEnabled)
        DllCall(DllCall("GetProcAddress", "ptr", DllCall("GetModuleHandle", "str", "uxtheme", "ptr"), "ptr", 136, "ptr"))
    )
}

return

; 按需调整窗口
+!Space::
{
    try
    {
        global windowTitle := WinGetTitle("A")
    
        SizerMenu := Menu()
        if (A_Language == 0804)
        {
            SizerMenu.Add("自动(&A)", Adjust_Auto)
            SizerMenu.Add("居中(&C)", Adjust_Centre)
            SizerMenu.Add()
            SizerMenu.Add("640x480", Adjust_MenuHandler)
            SizerMenu.Add("1024x768", Adjust_MenuHandler)
            SizerMenu.Add("1280x720", Adjust_MenuHandler)
            SizerMenu.Add("1280x800", Adjust_MenuHandler)
            SizerMenu.Add("1600x900", Adjust_MenuHandler)
            SizerMenu.Add("1600x1000", Adjust_MenuHandler)
            SizerMenu.Add("1920x1080", Adjust_MenuHandler)
            SizerMenu.Add("1920x1200", Adjust_MenuHandler)
            SizerMenu.Add()
            SizerMenu.Add("480X854", Adjust_MenuHandler)
            SizerMenu.Add("720x1280", Adjust_MenuHandler)
            SizerMenu.Add("800x1280", Adjust_MenuHandler)
            SizerMenu.Add()
            SizerMenu.Add("自定义(&M)", Adjust_Custom)
            SizerMenu.Show()
        }
        else
        {
            SizerMenu := Menu()
            SizerMenu.Add("&Auto", Adjust_Auto)
            SizerMenu.Add("&Centre", Adjust_Centre)
            SizerMenu.Add()
            SizerMenu.Add("640x480", Adjust_MenuHandler)
            SizerMenu.Add("1024x768", Adjust_MenuHandler)
            SizerMenu.Add("1280x720", Adjust_MenuHandler)
            SizerMenu.Add("1280x800", Adjust_MenuHandler)
            SizerMenu.Add("1600x900", Adjust_MenuHandler)
            SizerMenu.Add("1600x1000", Adjust_MenuHandler)
            SizerMenu.Add("1920x1080", Adjust_MenuHandler)
            SizerMenu.Add("1920x1200", Adjust_MenuHandler)
            SizerMenu.Add()
            SizerMenu.Add("480X854", Adjust_MenuHandler)
            SizerMenu.Add("720x1280", Adjust_MenuHandler)
            SizerMenu.Add("800x1280", Adjust_MenuHandler)
            SizerMenu.Add()
            SizerMenu.Add("Custo&m", Adjust_Custom)
            SizerMenu.Show()
        }
    }
    catch Error as err
    {
        if (A_Language == 0804)
        {
            MsgBox err.Message, "错误"
        }
        else
        {
            MsgBox err.Message, "Error"
        }
    }
}

; 获取当前显示器
MonitorGetCurrent(windowPosX, windowPosY, windowWidth, windowHeight, &currentWidth, &currentHeight, &currentLeft, &currentTop, &currentRight, &currentBottom, &currentIndex)
{
    windowCenterX := windowPosX + (windowWidth / 2)
    windowCenterY := windowPosY + (windowHeight / 2)

    moniterCount := MonitorGetCount()
    Loop moniterCount
    {
        currentMonitor := MonitorGet(A_Index, &left, &top, &right, &bottom)
        if(windowCenterX > left AND windowCenterX < right AND windowCenterY > top AND windowCenterY < bottom)
        {
            currentIndex := A_Index

            break
        }
    }

    currentWidth := right - left
    currentHeight := bottom - top
    currentLeft := left
    currentTop := top
    currentRight := right
    currentBottom := bottom
    
    ; MsgBox "Monitor Size: " currentWidth " | " currentHeight
}

; 自动调整窗口大小并居中
; #!A::
Adjust_Auto(Name, Index, Menu)
{
    try
    {
        global windowTitle := WinGetTitle("A")
    
        windowMinMax := WinGetMinMax(windowTitle)
        if(windowMinMax != -1)
        {
            if(windowMinMax = 1)
            {
                WinRestore(windowTitle)
            }
            
            WinGetPos(&windowPosX, &windowPosY, &windowWidth, &windowHeight, windowTitle)
    
            MonitorGetCurrent(windowPosX, windowPosY, windowWidth, windowHeight, &currentWidth, &currentHeight, &currentLeft, &currentTop, &currentRight, &currentBottom, &currentIndex)
    
            modifiedWindowWidth := currentWidth * 3 / 4
            modifiedWindowHeight := currentHeight * 3 / 4
    
            if(currentIndex > 1 or currentHeight < screenHeightThreshold)
            {
                WinMove(currentLeft + (currentWidth / 2) - (modifiedWindowWidth / 2), currentTop + (currentHeight / 2) - (modifiedWindowHeight / 2), modifiedWindowWidth, modifiedWindowHeight, windowTitle)
            }
            else
            {
                WinMove(currentLeft + (currentWidth / 2) - (modifiedWindowWidth / 2), currentTop + (currentHeight / 2) - (modifiedWindowHeight / 2) - (taskBarHeight / 2), modifiedWindowWidth, modifiedWindowHeight, windowTitle)
            }

            ; MsgBox "Monitor Size: " currentWidth " | " currentHeight "`nWindow Size: " windowWidth " | " windowHeight
        }
    }
    catch Error as err
    {
        if (A_Language == 0804)
        {
            MsgBox err.Message, "错误"
        }
        else
        {
            MsgBox err.Message, "Error"
        }
    }
}

; 居中
; #!C::
Adjust_Centre(Name, Index, Menu)
{
    try
    {
        global windowTitle := WinGetTitle("A")
    
        windowMinMax := WinGetMinMax(windowTitle)
        if(windowMinMax = 0)
        {
            WinGetPos(&windowPosX, &windowPosY, &windowWidth, &windowHeight, windowTitle)
            ; MsgBox "Window Pos: " windowPosY " | " windowPosX " -- Size: " windowWidth " | " windowHeight
            
            MonitorGetCurrent(windowPosX, windowPosY, windowWidth, windowHeight, &currentWidth, &currentHeight, &currentLeft, &currentTop, &currentRight, &currentBottom, &currentIndex)
    
            if(currentIndex > 1 or currentHeight < screenHeightThreshold)
            {
                WinMove(currentLeft + (currentWidth / 2) - (windowWidth / 2), currentTop + (currentHeight / 2) - (windowHeight / 2), , , windowTitle)
            }
            else
            {
                WinMove(currentLeft + (currentWidth / 2) - (windowWidth / 2), currentTop + (currentHeight / 2) - (windowHeight / 2) - (taskBarHeight / 2), , , windowTitle)
            }
        }
    }
    catch Error as err
    {
        if (A_Language == 0804)
        {
            MsgBox err.Message, "错误"
        }
        else
        {
            MsgBox err.Message, "Eroor"
        }
    }
}

Adjust_MenuHandler(Name, Index, Menu)
{
    ; Index starts from 1
    switch Index {
        ; 水平 Horizontal
        case 4:
            AdjustWindow(640, 480)
        case 5:
            AdjustWindow(1024, 768)
        case 6:
            AdjustWindow(1280, 720)
        case 7:
            AdjustWindow(1280, 800)
        case 8:
            AdjustWindow(1600, 900)
        case 9:
            AdjustWindow(1600, 1000)
        case 10:
            AdjustWindow(1920, 1080)
        case 11:
            AdjustWindow(1920, 1200)
        ; 垂直 Vertical
        case 13:
            AdjustWindow(480, 854)
        case 14:
            AdjustWindow(720, 1280)
        case 15:
            AdjustWindow(800, 1280)
    }
}

Adjust_Custom(Name, Index, Menu)
{
    WinGetPos(&windowPosX, &windowPosY, &windowWidth, &windowHeight, windowTitle)

    global guiWindowResize := Gui(, guiWindowResizeTitle)
    guiWindowResize.Opt("-Resize")
    guiWindowResize.Opt("-MaximizeBox")
    guiWindowResize.Opt("-MinimizeBox")
    guiWindowResize.Opt("-SysMenu")

    if (A_Language == 0804)
    {
        title_width := guiWindowResize.Add("Text", "w160 h16", "宽")
        title_width.SetFont("s10 q5", "Microsoft YaHei UI")
    }
    else
    {
        title_width := guiWindowResize.Add("Text", "w160 h16", "Width")
        title_width.SetFont("s10 q5", "Segoe UI")
    }

    edit_width := guiWindowResize.Add("Edit", "vEditWidth w160", windowWidth)
    edit_width.SetFont("q5", "Consolas")
    edit_width.Opt("+Number")
    edit_width.OnEvent("Change", CustomResizeEditNumberCheck)

    if (A_Language == 0804)
    {
        title_height := guiWindowResize.Add("Text", "w160 h16", "高")
        title_height.SetFont("s10 q5", "Microsoft YaHei UI")
    }
    else
    {
        title_height := guiWindowResize.Add("Text", "w160 h16", "Height")
        title_height.SetFont("s10 q5", "Segoe UI")
    }

    edit_height := guiWindowResize.Add("Edit", "vEditHeight w160", windowHeight)
    edit_height.SetFont("q5", "Consolas")
    edit_height.Opt("+Number")
    edit_height.OnEvent("Change", CustomResizeEditNumberCheck)

    if (A_Language == 0804)
    {
        button_resize := guiWindowResize.Add("Button", "wp y+20", "调整尺寸")
        button_resize.SetFont("q5", "Microsoft YaHei UI")
    }
    else
    {
        button_resize := guiWindowResize.Add("Button", "wp y+20", "Resize")
        button_resize.SetFont("q5", "Segoe UI")
    }
    button_resize.OnEvent("Click", CustomResizeButtonResize)

    if (A_Language == 0804)
    {
        button_resize_centre := guiWindowResize.Add("Button", "wp", "调整尺寸并居中")
        button_resize_centre.SetFont("q5", "Microsoft YaHei UI")
    }
    else
    {
        button_resize_centre := guiWindowResize.Add("Button", "wp", "Resize and Centre")
        button_resize_centre.SetFont("q5", "Segoe UI")
    }
    button_resize_centre.OnEvent("Click", CustomResizeButtonResizeCentre)

    if (A_Language == 0804)
    {
        button_cancel := guiWindowResize.Add("Button", "wp", "取消")
        button_cancel.SetFont("q5", "Microsoft YaHei UI")
    }
    else
    {
        button_cancel := guiWindowResize.Add("Button", "wp", "Cancel")
        button_cancel.SetFont("q5", "Segoe UI")
    }
    button_cancel.OnEvent("Click", CustomResizeButtonCancel)

    guiWindowResize.OnEvent("Escape", CustomResizeEscape)
    guiWindowResize.Show()
        
    WinGetPos(, , &customizeWidth, &customizeHeight, guiWindowResizeTitle)

    MonitorGetCurrent(windowPosX, windowPosY, customizeWidth, customizeHeight, &currentWidth, &currentHeight, &currentLeft, &currentTop, &currentRight, &currentBottom, &currentIndex)
    
    if(currentIndex > 1 or currentHeight < screenHeightThreshold)
    {
        WinMove(currentLeft + (currentWidth / 2) - (customizeWidth / 2), currentTop + (currentHeight / 2) - (customizeHeight / 2), , , guiWindowResizeTitle)
    }
    else
    {
        WinMove(currentLeft + (currentWidth / 2) - (customizeWidth / 2), currentTop + (currentHeight / 2) - (customizeHeight / 2) - (taskBarHeight / 2), , , guiWindowResizeTitle)
    }
}

CustomResizeEditNumberCheck(guiCtrlObj, info)
{
    local edit_checked := 0
    edit_value := guiCtrlObj.Value
    if(edit_value)
    {
        if(SubStr(edit_value, 1, 1) = '0')
        {
            edit_checked := edit_value + 0
            guiCtrlObj.Value := edit_checked
        }
    }
}

CustomResizeButtonResize(guiCtrlObj, info)
{
    CustomResizeSubmitResize()
}

CustomResizeButtonResizeCentre(guiCtrlObj, info)
{
    CustomResizeSubmitResizeCentre()
}

CustomResizeButtonCancel(guiCtrlObj, info)
{
    guiWindowResize.Destroy()
}

CustomResizeEscape(guiObj)
{
    guiObj.Destroy()
}

#HotIf WinExist(guiWindowResizeTitle) and WinActive(guiWindowResizeTitle)
Enter::
{
    focused_control_name := guiWindowResize.FocusedCtrl.Name
    if(focused_control_name = "EditWidth" or focused_control_name = "EditHeight")
    {
        CustomResizeSubmitResize()
    }
    else
    {
        Send "{Enter}"
    }
}
^Enter::
{
    focused_control_name := guiWindowResize.FocusedCtrl.Name
    if(focused_control_name = "EditWidth" or focused_control_name = "EditHeight")
    {
        CustomResizeSubmitResizeCentre()
    }
    else
    {
        Send "^{Enter}"
    }
}
#HotIf

CustomResizeSubmitResize()
{
    resize_value := guiWindowResize.Submit()

    if(resize_value.EditWidth and resize_value.EditHeight)
    {
        AdjustWindowCentre(resize_value.EditWidth, resize_value.EditHeight, false)
    }

    guiWindowResize.Destroy()
}

CustomResizeSubmitResizeCentre()
{
    resize_value := guiWindowResize.Submit()

    if(resize_value.EditWidth and resize_value.EditHeight)
    {
        AdjustWindowCentre(resize_value.EditWidth, resize_value.EditHeight, true)
    }

    guiWindowResize.Destroy()
}

AdjustWindowCentre(width, height, centre)
{
    try
    {
        windowMinMax := WinGetMinMax(windowTitle)
        if(windowMinMax != -1)
        {
            if(windowMinMax = 1)
            {
                WinRestore(windowTitle)
            }
        }
    
        if(centre == true)
        {
            WinGetPos(&windowPosX, &windowPosY, &windowWidth, &windowHeight, windowTitle)
        
            MonitorGetCurrent(windowPosX, windowPosY, windowWidth, windowHeight, &currentWidth, &currentHeight, &currentLeft, &currentTop, &currentRight, &currentBottom, &currentIndex)
        
            if(currentIndex > 1 or currentHeight < screenHeightThreshold)
            {
                WinMove(currentLeft + (currentWidth / 2) - (width / 2), currentTop + (currentHeight / 2) - (height / 2), width, height, windowTitle)
            }
            else
            {
                WinMove(currentLeft + (currentWidth / 2) - (width / 2), currentTop + (currentHeight / 2) - (height / 2) - (taskBarHeight / 2), width, height, windowTitle)
            }
        }
        else
        {
            WinMove(, , width, height, windowTitle)
        }
    }
    catch Error as err
    {
        if (A_Language == 0804)
        {
            MsgBox err.Message, "错误"
        }
        else
        {
            MsgBox err.Message, "Error"
        }
    }
}

AdjustWindow(width, height)
{
    try
    {
        windowMinMax := WinGetMinMax(windowTitle)
        if(windowMinMax != -1)
        {
            if(windowMinMax = 1)
            {
                WinRestore(windowTitle)
            }
        }

        keyStateControl := GetKeyState("Control")
    
        if(keyStateControl == 1)
        {
            WinGetPos(&windowPosX, &windowPosY, &windowWidth, &windowHeight, windowTitle)
        
            MonitorGetCurrent(windowPosX, windowPosY, windowWidth, windowHeight, &currentWidth, &currentHeight, &currentLeft, &currentTop, &currentRight, &currentBottom, &currentIndex)
        
            if(currentIndex > 1 or currentHeight < screenHeightThreshold)
            {
                WinMove(currentLeft + (currentWidth / 2) - (width / 2), currentTop + (currentHeight / 2) - (height / 2), width, height, windowTitle)
            }
            else
            {
                WinMove(currentLeft + (currentWidth / 2) - (width / 2), currentTop + (currentHeight / 2) - (height / 2) - (taskBarHeight / 2), width, height, windowTitle)
            }
        }
        else
        {
            WinMove(, , width, height, windowTitle)
        }
    }
    catch Error as err
    {
        if (A_Language == 0804)
        {
            MsgBox err.Message, "错误"
        }
        else
        {
            MsgBox err.Message, "Error"
        }
    }
}