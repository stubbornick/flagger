#!/bin/bash

echo `cat /dev/urandom | tr -dc 'a-zA-Z0-9' | head -c 31`=
