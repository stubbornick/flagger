"use strict";

export default {
    // Output
    FLAG_SERVICE_HOST: "10.60.200.1",
    FLAG_SERVICE_PORT: 31337,
    RECONNECT_TIMEOUT: 1000,
    SEND_PERIOD: 5000,       // 0 for immediate sending
    // SEND_PERIOD: 0,       // 0 for immediate sending
    MAX_FLAGS_PER_SEND: 15,  // standart internet MTU = 576. So optimal flags in pack: 576/32; null or 0 for unlimited
    // MAX_FLAGS_PER_SEND: 500,
    RESEND_TIMEOUT: 1000,

    // Receiver messages
    RECEIVER_MESAGES: {
        greetings: ["Enter your flags, finished with newline (or empty line to exit)"],
        accepted: /Accepted[\w\W]*/,
        badAnswers: ["Please try again later", "No such flag"]
    },

    // Input
    TCP_SERVER_HOST: "0.0.0.0",
    TCP_SERVER_PORT: 31337,
    FLAG_REGEXP: /[a-zA-Z0-9]{31}=/,
    IO_SERVER_HOST: "0.0.0.0",
    IO_SERVER_PORT: 31336,

    // Store
    MONGODB_URL: "mongodb://127.0.0.1:27017/",
    MONGODB_DATABASE: "flagger",
    MAX_FLAG_LIFETIME: 1000*60*10,  // 1000*60*10 = 5 minutes

    // Logging
    logging: {
        logfile: "logs/flagger.log",
        printDate: true,
        overrideError: true,
    }
};
