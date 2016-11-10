"use strict";

const CONFIG = {
    // Output
    FLAG_SERVICE_HOST: "172.17.0.2",
    FLAG_SERVICE_PORT: 6666,
    RECONNECT_TIMEOUT: 1000,
    SEND_PERIOD: 5000,       // 0 for immediate sending
    // SEND_PERIOD: 0,       // 0 for immediate sending
    MAX_FLAGS_PER_SEND: 15,  // standart internet MTU = 576. So optimal flags in pack: 576/17, null or 0 for unlimited
    // MAX_FLAGS_PER_SEND: 500,

    // Receiver messages
    RECEIVER_MESAGES: {
        greetings: ["Welcome!", "Put you flags here:"],
        accepted: "Accepted"
    },

    // Input
    TCP_SERVER_HOST: "0.0.0.0",
    TCP_SERVER_PORT: 31337,
    FLAG_REGEXP: /[a-zA-Z0-9]{31}=/g,
    IO_SERVER_HOST: "0.0.0.0",
    IO_SERVER_PORT: 31336,
    FLAG_REGEXP: /[a-zA-Z0-9]{31}=/g,

    // Store
    FLAGS_DATABASE: "flags.db",
    MAX_FLAG_LIFETIME: 1000*60*10,  // 1000*60*10 = 5 minutes

    // Logging
    DEBUG_LOG: "/home/storage/logs/flagger/debug.log",
    INFO_LOG: "/home/storage/logs/flagger/info.log",
};


export default CONFIG;
