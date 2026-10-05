cmake_minimum_required(VERSION 3.12)
project(llsd_cpp VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(llsd_cpp
    src/llsd.cpp
    src/llsdserialize.cpp
    src/lluuid.cpp
    src/lldate.cpp
    src/lluri.cpp
)

target_include_directories(llsd_cpp PUBLIC
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<INSTALL_INTERFACE:include>
)

enable_testing()

add_executable(test_llsd tests/test_llsd.cpp)
target_link_libraries(test_llsd PRIVATE llsd_cpp)
add_test(NAME test_llsd COMMAND test_llsd)
