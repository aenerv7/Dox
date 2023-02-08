#Requires AutoHotkey v2.0

A_IconTip := "SizerAHK"

#!C::
{
    windowMinMax := WinGetMinMax("A")
    if(windowMinMax = 0)
    {
        WinGetPos ,, &width, &height, "A"
        WinMove (A_ScreenWidth / 2) - (width / 2), (A_ScreenHeight / 2) - 48 - (height / 2), , , "A"
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

        windowWidth := A_ScreenWidth * 3 / 4
        widowHeight := A_ScreenHeight * 3 / 4
        WinMove , , windowWidth, widowHeight, "A"
        WinMove (A_ScreenWidth/2) - (windowWidth/2), (A_ScreenHeight/2) - 48 - (widowHeight/2), , , "A"
    }
}