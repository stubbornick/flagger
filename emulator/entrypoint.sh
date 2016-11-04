#!/bin/bash

cd /emulator

while true
do
	r=$RANDOM
	let "r %= 900" # Every 15 minutes there a reconnect
	timeout -s SIGTERM $r 2>/dev/null node -- ideal_receiver.js
	echo "Crash time!"
	sleep 5
done
