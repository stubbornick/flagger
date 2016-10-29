"use strict";

import net from "net";
import { FLAG_SERVICE_HOST, FLAG_SERVICE_PORT, RECONNECT_TIMEOUT, RECEIVER_GREETINGS } from "./config";
import log from "./log";
import Flag from "./flag";


class OutputSocket extends net.Socket
{
    constructor() {
        super();
        this.host = FLAG_SERVICE_HOST;
        this.port = FLAG_SERVICE_PORT;
        this.reconnectTimeout = RECONNECT_TIMEOUT;
        this.ready = false;
        this.queue = new Array();

        this.on("error", (error)=>{
            if (error.code === "ECONNREFUSED"){
                log.info("CTF Receiver refused connection");
            } else if (error.code === "ECONNRESET"){
                log.info("CTF Receiver reset connection");
            } else if (error.code === "EPIPE"){
                log.info("CTF Receiver reset connection");
            } else {
                log.warning("Unknown socket error:\n", error);
            };

            this.dead();
        });

        this.on("close", () => {
            log.debug("Connection to CTF Receiver were closed");

            setTimeout(() => {
                this.connect();
            }, this.reconnectTimeout);

            this.dead();
        });

        this.on("connect", () => {
            log.info("Connected to CTF Receiver");
            this.ready = true;
            this.emit("ready");
        });

        this.on("data", (data) => {
            let answers = data.toString().trim().split('\n');

            for (let answer of answers) {
                if (RECEIVER_GREETINGS.indexOf(answer) >= 0){
                    log.debug("Greetings skipped");
                } else if (this.queue.length > 0){
                    if (RECEIVER_GREETINGS.indexOf(answer) < 0){
                        this.emit("answer", this.queue.pop(), answer);
                    }
                } else {
                    log.warning(`Received data from CTF not related to any flag: ${data}`);
                }
            }
        });

        this.connect();
    }

    dead(){
        this.ready = false;

        if (this.queue.length > 0){
            this.emit("fail", this.queue);
            this.queue = new Array;
        }
    }

    connect() {
        log.debug("Try to connect to CTF Receiver...")

        super.connect({
            host: this.host,
            port: this.port
        });
    }

    sendFlags(flags){
        if (!Array.isArray(flags)){
            throw new Error;
        }

        this.queue = this.queue.concat(flags);
        log.debug(`Add flags to output queue: ${flags}`);

        this.write(flags.map((flag) => flag.toString()).join('\n')+'\n', "utf-8", () => {
            flags.forEach((flag) => {
                this.emit("sent", flag);
            });
        });
    }
}

export default OutputSocket;
