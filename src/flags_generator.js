"use strict";

import net from "net";
import util from "util";
import { RAW_SOCKET_PORT } from "./config";

function int_to_flag(i){
    let s = i.toString();
    while (s.length < 31){
        s = '0' + s;
    }
    return s+"=";
}

let intervalID;
let s = new net.Socket;

s.on("connect", () => {
    console.log("Connected");

    let i = 1;

    intervalID = setInterval(() => {
        let flag = int_to_flag(i)
        s.write(flag+'\n');
        console.log("Send:", flag);
        i++;
    }, 500);
})

s.on("error", () => {
    // console.log("Disconnected with error");
})

function connect(){
    s.connect(RAW_SOCKET_PORT, "127.0.0.1");
};

s.on("close", () => {
    // console.log("Disconnected");
    clearInterval(intervalID);
    setTimeout(connect, 1000);
});

connect();
