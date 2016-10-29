"use strict";

import net from "net";
import log from "./log";
import { FLAG_REGEXP, RAW_SOCKET_HOST, RAW_SOCKET_PORT } from "./config"
import OutputSocket from "./output";
import Flag from "./flag"

function fetch_all_flags(data){
    let flags = []
    let m;

    do {
        m = FLAG_REGEXP.exec(data);
        if (m) {
            flags.push(m[0]);
        }
    } while (m);

    return flags;
}

class Flagger
{
    constructor(){
        this.output = new OutputSocket();
        this.inputRawServer = new net.Server;
        this.globalQueue = new Array;

        this.output.on("ready", () => {
            log.debug("Output socket is ready");
            if (this.globalQueue.length > 0){
                this.output.sendFlags(this.globalQueue);
                this.globalQueue = new Array;
            }
        });

        this.output.on("fail", (flags) => {
            log.debug(`Return flags to global queue: ${flags}`);
            this.globalQueue = this.globalQueue.concat(flags);
        });

        this.output.on("answer", (flag, answer) => {
            log.info(`Answer: ${flag} ${answer}`);

            if (flag.socket && flag.socket.writable){
                flag.socket.write(`Answer: ${flag} ${answer}\n`);
            }
        });

        this.output.on("sent", (flag) => {
            log.debug(`Sent flag ${flag}`);
            flag.setStatus(Flag.statuses.sent);
        });

        this.inputRawServer.on("connection", (socket) => {
            log.debug(`${socket.localAddress}:${socket.localPort} connected to raw socket`);
            socket.on("data", (data) => {

                let flags = fetch_all_flags(data.toString());
                if (flags.length > 0){
                    for (let flag of flags) {
                        log.info(`New flag from ${socket.localAddress}: ${flag}`);
                    }

                    this.newFlags(flags, socket);
                }
            });
        });

        this.inputRawServer.listen({
            host: RAW_SOCKET_HOST,
            port: RAW_SOCKET_PORT,
        }, () => {
            let addr = this.inputRawServer.address();
            log.info(`Start listening on ${addr.address} ${addr.port}`);
        });
    }

    newFlags(flags, socket){
        flags = flags.map((flag) => new Flag(flag, {socket:socket}));

        if (this.output.ready){
            this.output.sendFlags(flags);
        } else {
            this.globalQueue = this.globalQueue.concat(flags);
        }
    }
}

async function main() {
    new Flagger;
}

main().catch((err) => console.error(err));
