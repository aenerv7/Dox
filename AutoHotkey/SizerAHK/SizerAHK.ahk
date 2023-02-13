#Requires AutoHotkey v2.0

A_IconTip := "SizerAHK"

windowTitle := ""

return

#!C::
{
    global windowTitle := WinGetTitle("A")

    windowMinMax := WinGetMinMax(windowTitle)
    if(windowMinMax = 0)
    {
        WinGetPos &windowPosX, &windowPosY, &windowWidth, &windowHeight, windowTitle
        ; MsgBox "Window Pos: " windowPosY " | " windowPosX " -- Size: " windowWidth " | " windowHeight
        
        MonitorGetCurrent(windowPosX, windowPosY, windowWidth, windowHeight, &currentWidth, &currentHeight, &currentLeft, &currentTop, &currentRight, &currentBotton)

        WinMove currentLeft + (currentWidth / 2) - (windowWidth / 2), currentTop + (currentHeight / 2) - (windowHeight / 2), , , windowTitle
    }
}

#!A::
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

        WinMove currentLeft + (currentWidth / 2) - (modifiedWindowWidth / 2), currentTop + (currentHeight / 2) - (modifiedWindowHeight / 2), modifiedWindowWidth, modifiedWindowHeight, windowTitle
        ; MsgBox "Monitor Size: " currentWidth " | " currentHeight "`nWindow Size: " windowWidth " | " windowHeight
    }
}

#!S::
{
    global windowTitle := WinGetTitle("A")

    windowMinMax := WinGetMinMax(windowTitle)
    if(windowMinMax != -1)
    {
        if(windowMinMax = 1)
        {
            WinRestore(windowTitle)
        }

        SizerMenu := Menu()
        SizerMenu.Add("1280x720", Adjust_1280_720)
        SizerMenu.Add("1280x720 Centre", Adjust_1280_720_Centre)
        SizerMenu.Add("1920x1080", Adjust_1920_1080)
        SizerMenu.Add("1920x1080 Centre", Adjust_1920_1080_Centre)
        SizerMenu.Show()
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

Adjust_1280_720(Name, Index, Menu)
{
    AdjustWindow(1280, 720, false)
}

Adjust_1280_720_Centre(Name, Index, Menu)
{
    AdjustWindow(1280, 720, true)
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
    if(centre == true)
    {
        WinGetPos &windowPosX, &windowPosY, &windowWidth, &windowHeight, windowTitle
    
        MonitorGetCurrent(windowPosX, windowPosY, windowWidth, windowHeight, &currentWidth, &currentHeight, &currentLeft, &currentTop, &currentRight, &currentBotton)
    
        WinMove currentLeft + (currentWidth / 2) - (width / 2), currentTop + (currentHeight / 2) - (height / 2), width, height, windowTitle
    }
    else
    {
        WinMove , , width, height, windowTitle
    }
}