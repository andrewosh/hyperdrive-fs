#!/bin/bash
if [[ ! -d ./test/libfuse ]]; then
  git clone https://github.com/libfuse/libfuse test/libfuse/
fi
if [[ ! -d .test/libfuse/build ]]; then
  cd test/libfuse && mkdir build && cd build && meson .. && ninja
fi
