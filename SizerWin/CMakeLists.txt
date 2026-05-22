cmake_minimum_required(VERSION 3.10)
project(SizerWin C)

set(CMAKE_C_STANDARD 11)

add_executable(SizerWin WIN32 SizerWin.c SizerWin.rc)
target_link_libraries(SizerWin user32 shell32 advapi32 gdi32 dwmapi comctl32)
target_compile_definitions(SizerWin PRIVATE UNICODE _UNICODE)
target_compile_options(SizerWin PRIVATE "$<$<C_COMPILER_ID:MSVC>:/utf-8>")
