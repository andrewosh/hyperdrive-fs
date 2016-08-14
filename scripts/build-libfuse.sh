#!/bin/sh
if [[ ! -d ./libfuse ]]; then
  git clone https://github.com/libfuse/libfuse ../test/libfuse
fi
if [[ ! -f ./libfuse/test/test ]]; then
  cd ../test/libfuse && ./makeconf.sh && ./configure
  cd test && make
fi

