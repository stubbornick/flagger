"use strict";

// Output
const FLAG_SERVICE_HOST = "172.17.0.2";
const FLAG_SERVICE_PORT = 6666;
const RECONNECT_TIMEOUT = 1000;
const SEND_INTERVAL     = 5000;     // 0 for immediate sending
// const SEND_INTERVAL     = 0;     // 0 for immediate sending
const RECEIVER_GREETINGS = ["Welcome!", "Put you flags here:"]

// Input
const RAW_SOCKET_HOST   = "0.0.0.0";
const RAW_SOCKET_PORT   = 2222;
const FLAG_REGEXP       = /[a-zA-Z0-9]{31}=/g;

// Logging
const DEBUG_LOG         = "debug.log";
const INFO_LOG          = "info.log";

export {
    FLAG_SERVICE_HOST,
    FLAG_SERVICE_PORT,
    RECONNECT_TIMEOUT,
    SEND_INTERVAL,
    RECEIVER_GREETINGS,
    RAW_SOCKET_HOST,
    RAW_SOCKET_PORT,
    FLAG_REGEXP,
    DEBUG_LOG,
    INFO_LOG
}
