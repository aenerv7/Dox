#Requires AutoHotkey v2.0

A_IconTip := "SizerAHK"

#!C::
{
    windowMinMax := WinGetMinMax("A")
    if(windowMinMax = 0)
    {
        WinGetPos &windowPosX, &windowPosY, &windowWidth, &windowHeight, "A"
        ; MsgBox "Window Pos: " windowPosY " | " windowPosX " -- Size: " windowWidth " | " windowHeight
        
        MonitorGetCurrent(windowPosX, windowPosY, windowWidth, windowHeight, &currentWidth, &currentHeight, &currentLeft, &currentTop, &currentRight, &currentBotton)

        WinMove currentLeft + (currentWidth / 2) - (windowWidth / 2), currentTop + (currentHeight / 2) - (windowHeight / 2), , , "A"
    }
}

#!S::
{
    windowMinMax := WinGetMinMax("A")
    if(windowMinMax != -1)
    {
        if(windowMinMax = 1)
        {
            WinRestore("A")
        }
        
        WinGetPos &windowPosX, &windowPosY, &windowWidth, &windowHeight, "A"

        MonitorGetCurrent(windowPosX, windowPosY, windowWidth, windowHeight, &currentWidth, &currentHeight, &currentLeft, &currentTop, &currentRight, &currentBotton)

        modifiedWindowWidth := currentWidth * 3 / 4
        modifiedWindowHeight := currentHeight * 3 / 4

        WinMove currentLeft + (currentWidth / 2) - (modifiedWindowWidth / 2), currentTop + (currentHeight / 2) - (modifiedWindowHeight / 2), modifiedWindowWidth, modifiedWindowHeight, "A"
        ; MsgBox "Monitor Size: " currentWidth " | " currentHeight "`nWindow Size: " windowWidth " | " windowHeight
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