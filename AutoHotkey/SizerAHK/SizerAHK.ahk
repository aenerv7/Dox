#Requires AutoHotkey v2.0

#!C::
{
    WinGetPos ,, &width, &height, "A"
    WinMove (A_ScreenWidth/2)-(width/2), (A_ScreenHeight/2)-(height/2), , , "A"
}

#!S::
{
    windowWidth := A_ScreenWidth * 2 / 3
    widowHeight := A_ScreenHeight * 2 / 3
    WinMove , , windowWidth, widowHeight, "A"
    WinMove (A_ScreenWidth/2)-(windowWidth/2), (A_ScreenHeight/2)-(widowHeight/2), , , "A"
}