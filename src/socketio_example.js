"use strict";

import IOClient from "socket.io-client";
import config from "./config";

const client = new IOClient(`http://127.0.0.1:${config.IO_SERVER_PORT}`);

client.on("connect", () => {
    console.log("Connected!");

    const count = 10;

    client.emit("command", {
        command: "get_last_flags",
        count: count,
    }, (flags) => {
        console.log(`Last ${count} flags:`, flags);
    });
})

client.on("update", (flag) => {
    console.log("flag updated:", flag);
});

process.stdin.on("data", (data) => {
    let flag = data.toString();
    client.emit("command", {
        command: "flags",
        data: data  // String, contain flags
    }, (answer) => {
        console.log("Answer:", answer);
    });
    console.log(`Send: ${data}`);
});

client.on("error", (error) => {
    console.log(error);
});
