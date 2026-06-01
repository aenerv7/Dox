cmake_minimum_required(VERSION 3.10)
project(CapsLockOSD CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(CapsLockOSD WIN32
    CapsLockOSD.cpp
    CapsLockOSD.rc
)

target_compile_definitions(CapsLockOSD PRIVATE UNICODE _UNICODE NOMINMAX)
target_compile_options(CapsLockOSD PRIVATE
    "$<$<CXX_COMPILER_ID:MSVC>:/utf-8>"
    "$<$<CXX_COMPILER_ID:MSVC>:/W4>"
    "$<$<CXX_COMPILER_ID:MSVC>:/MT>"
)
target_link_libraries(CapsLockOSD user32 advapi32 gdi32 gdiplus)
