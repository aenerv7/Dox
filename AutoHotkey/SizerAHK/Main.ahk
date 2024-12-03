#Requires AutoHotkey v2.0
#SingleInstance
#NoTrayIcon

A_IconTip := "SizerAHK"

windowTitle := ""

taskBarHeight := 48

screenHeightThreshold := 1080

guiWindowResize := ""

guiWindowResizeTitle := "SizerAHK Customize"

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
        SizerMenu.Add("&Auto", Adjust_Auto)
        SizerMenu.Add("&Centre", Adjust_Centre)
        SizerMenu.Add()
        SizerMenu.Add("640x480", Adjust_640_480)
        SizerMenu.Add("640x480 Centre", Adjust_640_480_Centre)
        SizerMenu.Add("854x480", Adjust_854_480)
        SizerMenu.Add("854x480 Centre", Adjust_854_480_Centre)
        SizerMenu.Add("1024x768", Adjust_1024_768)
        SizerMenu.Add("1024x768 Centre", Adjust_1024_768_Centre)
        SizerMenu.Add("1280x720", Adjust_1280_720)
        SizerMenu.Add("1280x720 Centre", Adjust_1280_720_Centre)
        SizerMenu.Add("1600x900", Adjust_1600_900)
        SizerMenu.Add("1600x900 Centre", Adjust_1600_900_Centre)
        SizerMenu.Add("1920x1080", Adjust_1920_1080)
        SizerMenu.Add("1920x1080 Centre", Adjust_1920_1080_Centre)
        SizerMenu.Add()
        SizerMenu.Add("480X854", Adjust_480_854)
        SizerMenu.Add("480X854 Centre", Adjust_480_854_Centre)
        SizerMenu.Add("720x1280", Adjust_720_1280)
        SizerMenu.Add("720x1280 Centre", Adjust_720_1280_Centre)
        SizerMenu.Add("720x1280", Adjust_720_1280)
        SizerMenu.Add("720x1280 Centre", Adjust_720_1280_Centre)
        SizerMenu.Add()
        SizerMenu.Add("Custom", Adjust_Custom)
        SizerMenu.Show()
    }
    catch Error as err
    {
        MsgBox err.Message, "Error"
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

Adjust_640_480(Name, Index, Menu)
{
    AdjustWindow(640, 480, false)
}

Adjust_640_480_Centre(Name, Index, Menu)
{
    AdjustWindow(640, 480, true)
}

Adjust_854_480(Name, Index, Menu)
{
    AdjustWindow(854, 480, false)
}

Adjust_854_480_Centre(Name, Index, Menu)
{
    AdjustWindow(854, 480, true)
}

Adjust_1024_768(Name, Index, Menu)
{
    AdjustWindow(1024, 768, false)
}

Adjust_1024_768_Centre(Name, Index, Menu)
{
    AdjustWindow(1024, 768, true)
}

Adjust_1280_720(Name, Index, Menu)
{
    AdjustWindow(1280, 720, false)
}

Adjust_1280_720_Centre(Name, Index, Menu)
{
    AdjustWindow(1280, 720, true)
}

Adjust_1600_900(Name, Index, Menu)
{
    AdjustWindow(1600, 900, false)
}

Adjust_1600_900_Centre(Name, Index, Menu)
{
    AdjustWindow(1600, 900, true)
}

Adjust_1920_1080(Name, Index, Menu)
{
    AdjustWindow(1920, 1080, false)
}

Adjust_1920_1080_Centre(Name, Index, Menu)
{
    AdjustWindow(1920, 1080, true)
}

Adjust_480_854(Name, Index, Menu)
{
    AdjustWindow(480, 854, false)
}

Adjust_480_854_Centre(Name, Index, Menu)
{
    AdjustWindow(480, 854, true)
}

Adjust_720_1280(Name, Index, Menu)
{
    AdjustWindow(720, 1280, false)
}

Adjust_720_1280_Centre(Name, Index, Menu)
{
    AdjustWindow(720, 1280, true)
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
        MsgBox err.Message, "Error"
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
        MsgBox err.Message, "Error"
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
    guiWindowResize.Add("Text", , "Width")
    edit_width := guiWindowResize.Add("Edit", "vEditWidth w160", windowWidth)
    edit_width.Opt("+Number")
    edit_width.OnEvent("Change", CustomResizeEditNumberCheck)
    guiWindowResize.Add("Text", , "Height")
    edit_height := guiWindowResize.Add("Edit", "vEditHeight w160", windowHeight)
    edit_height.Opt("+Number")
    edit_height.OnEvent("Change", CustomResizeEditNumberCheck)
    button_resize := guiWindowResize.Add("Button", "wp y+20", "Resize")
    button_resize.OnEvent("Click", CustomResizeButtonResize)
    button_resize_centre := guiWindowResize.Add("Button", "wp", "Resize and Centre")
    button_resize_centre.OnEvent("Click", CustomResizeButtonResizeCentre)
    button_cancel := guiWindowResize.Add("Button", "wp", "Cancel")
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
        AdjustWindow(resize_value.EditWidth, resize_value.EditHeight, false)
    }

    guiWindowResize.Destroy()
}

CustomResizeSubmitResizeCentre()
{
    resize_value := guiWindowResize.Submit()

    if(resize_value.EditWidth and resize_value.EditHeight)
    {
        AdjustWindow(resize_value.EditWidth, resize_value.EditHeight, true)
    }

    guiWindowResize.Destroy()
}

AdjustWindow(width, height, centre)
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
        MsgBox err.Message, "Error"
    }
}