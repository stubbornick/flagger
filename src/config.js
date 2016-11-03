"use strict";

const CONFIG = {
    // Output
    FLAG_SERVICE_HOST: "172.17.0.2",
    FLAG_SERVICE_PORT: 6666,
    RECONNECT_TIMEOUT: 1000,
    SEND_PERIOD: 5000,     // 0 for immediate sending
    RECEIVER_GREETINGS: ["Welcome!", "Put you flags here:"],

    // Input
    TCP_SOCKET_HOST: "0.0.0.0",
    TCP_SOCKET_PORT: 2222,
    FLAG_REGEXP: /[a-zA-Z0-9]{31}=/g,

    // Logging
    DEBUG_LOG: "debug.log",
    INFO_LOG: "info.log",
};


export default CONFIG;
