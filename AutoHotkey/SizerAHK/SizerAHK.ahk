#Requires AutoHotkey v2.0
#SingleInstance
#NoTrayIcon

A_IconTip := "SizerAHK"

windowTitle := ""

taskBarHeight := 48

return

; 居中
#!C::
{
    try
    {
        global windowTitle := WinGetTitle("A")
    
        windowMinMax := WinGetMinMax(windowTitle)
        if(windowMinMax = 0)
        {
            WinGetPos &windowPosX, &windowPosY, &windowWidth, &windowHeight, windowTitle
            ; MsgBox "Window Pos: " windowPosY " | " windowPosX " -- Size: " windowWidth " | " windowHeight
            
            MonitorGetCurrent(windowPosX, windowPosY, windowWidth, windowHeight, &currentWidth, &currentHeight, &currentLeft, &currentTop, &currentRight, &currentBotton)
    
            WinMove currentLeft + (currentWidth / 2) - (windowWidth / 2), currentTop + (currentHeight / 2) - (windowHeight / 2) - (taskBarHeight / 2), , , windowTitle
        }
    }
    catch Error as err
    {
        MsgBox err.Message, "Error"
    }
}

; 自动调整窗口大小并居中
#!A::
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
            
            WinGetPos &windowPosX, &windowPosY, &windowWidth, &windowHeight, windowTitle
    
            MonitorGetCurrent(windowPosX, windowPosY, windowWidth, windowHeight, &currentWidth, &currentHeight, &currentLeft, &currentTop, &currentRight, &currentBotton)
    
            modifiedWindowWidth := currentWidth * 3 / 4
            modifiedWindowHeight := currentHeight * 3 / 4
    
            WinMove currentLeft + (currentWidth / 2) - (modifiedWindowWidth / 2), currentTop + (currentHeight / 2) - (modifiedWindowHeight / 2) - (taskBarHeight / 2), modifiedWindowWidth, modifiedWindowHeight, windowTitle
            ; MsgBox "Monitor Size: " currentWidth " | " currentHeight "`nWindow Size: " windowWidth " | " windowHeight
        }
    }
    catch Error as err
    {
        MsgBox err.Message, "Error"
    }
}

; 按需调整窗口
#!S::
{
    try
    {
        global windowTitle := WinGetTitle("A")
    
        SizerMenu := Menu()
        SizerMenu.Add("720x1280", Adjust_720_1280)
        SizerMenu.Add("720x1280 Centre", Adjust_720_1280_Centre)
        SizerMenu.Add("1280x720", Adjust_1280_720)
        SizerMenu.Add("1280x720 Centre", Adjust_1280_720_Centre)
        SizerMenu.Add("1600x900", Adjust_1600_900)
        SizerMenu.Add("1600x900 Centre", Adjust_1600_900_Centre)
        SizerMenu.Add("1920x1080", Adjust_1920_1080)
        SizerMenu.Add("1920x1080 Centre", Adjust_1920_1080_Centre)
        SizerMenu.Show()
    }
    catch Error as err
    {
        MsgBox err.Message, "Error"
    }
}

MonitorGetCurrent(windowPosX, windowPosY, windowWidth, windowHeight, &currentWidth, &currentHeight, &currentLeft, &currentTop, &currentRight, &currentBottom)
{
    windowCenterX := windowPosX + (windowWidth / 2)
    windowCenterY := windowPosY + (windowHeight / 2)

    moniterCount := MonitorGetCount()
    Loop moniterCount
    {
        currentMonitor := MonitorGet(A_Index, &left, &top, &right, &bottom)
        if(windowCenterX > left AND windowCenterX < right AND windowCenterY > top AND windowCenterY < bottom)
        {
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

Adjust_720_1280(Name, Index, Menu)
{
    AdjustWindow(720, 1280, false)
}

Adjust_720_1280_Centre(Name, Index, Menu)
{
    AdjustWindow(720, 1280, true)
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
            WinGetPos &windowPosX, &windowPosY, &windowWidth, &windowHeight, windowTitle
        
            MonitorGetCurrent(windowPosX, windowPosY, windowWidth, windowHeight, &currentWidth, &currentHeight, &currentLeft, &currentTop, &currentRight, &currentBotton)
        
            WinMove currentLeft + (currentWidth / 2) - (width / 2), currentTop + (currentHeight / 2) - (height / 2) - (taskBarHeight / 2), width, height, windowTitle
        }
        else
        {
            WinMove , , width, height, windowTitle
        }
    }
    catch Error as err
    {
        MsgBox err.Message, "Error"
    }
}