"use strict";

import fs from "fs";
import net from "net";
import util from "util";
import config from "./config";


const oldlog = console.log;
console.log = function (...args){
    let msg = new Date().toISOString() + ": " + util.format(...args);
    oldlog(msg);
    fs.appendFileSync("generator.log", msg+"\n");
}

function int_to_flag(i){
    let s = i.toString();
    while (s.length < 31){
        s = '0' + s;
    }
    return s+"=";
}

let timeoutID;
let delay = 1000;
let rate = 10000;
let s = new net.Socket;

setInterval(() => {
    delay = (Math.random() * rate);
}, 1000)

s.on("connect", () => {
    console.log("Connected");

    let i = 1;

    function next(){
        let flags = [];
        let to = i+Math.round(Math.random()*10);
        for (; i<to; ++i){
            flags.push(int_to_flag(i));
        }

        s.write(flags.join("\n")+'\n');
        console.log(`Send ${flags.length} flags:\n${flags.join('\n')}`);

        timeoutID = setTimeout(next, delay);
    }

    next();
});

s.on("data", (data) => {
    console.log(data.toString().trim());
});

s.on("error", () => {
    // console.log("Disconnected with error");
});

function connect(){
    s.connect(config.TCP_SOCKET_PORT, "127.0.0.1");
};

s.on("close", () => {
    // console.log("Disconnected");
    clearTimeout(timeoutID);
    setTimeout(connect, 1000);
});

connect();
