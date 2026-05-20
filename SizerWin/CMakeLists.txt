cmake_minimum_required(VERSION 3.10)
project(SizerWin C)

set(CMAKE_C_STANDARD 11)

add_executable(SizerWin WIN32 SizerWin.c SizerWin.rc)
target_link_libraries(SizerWin user32 shell32 advapi32 gdi32 dwmapi)
target_compile_definitions(SizerWin PRIVATE UNICODE _UNICODE)
