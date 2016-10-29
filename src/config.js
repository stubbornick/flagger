"use strict";

const FLAG_SERVICE_HOST = "127.0.0.1";
const FLAG_SERVICE_PORT = 6666;
const RAW_SOCKET_HOST   = "0.0.0.0";
const RAW_SOCKET_PORT   = 2222;
const RECONNECT_TIMEOUT = 1000;
const FLAG_REGEXP       = /[a-zA-Z0-9]{31}=/g;
const LOGFILE           = "log.log";
const RECEIVER_GREETINGS = ["Welcome!", "Put you flags here:"]

export {
    FLAG_SERVICE_HOST,
    FLAG_SERVICE_PORT,
    RAW_SOCKET_HOST,
    RAW_SOCKET_PORT,
    RECONNECT_TIMEOUT,
    FLAG_REGEXP,
    LOGFILE,
    RECEIVER_GREETINGS
}
