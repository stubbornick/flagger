"use strict";

import net from "net";
import { FLAG_SERVICE_HOST, FLAG_SERVICE_PORT, RECONNECT_TIMEOUT, RECEIVER_GREETINGS, SEND_INTERVAL } from "./config";
import log from "./log";
import Flag from "./flag";


class Output extends net.Socket
{
    constructor() {
        super();
        this.host = FLAG_SERVICE_HOST;
        this.port = FLAG_SERVICE_PORT;
        this.reconnectTimeout = RECONNECT_TIMEOUT;
        this.ready = false;
        this.queue = new Array();
        this.sentQueue = new Array();
        this.sendInterval = new Array();
        this.inputBuffer = "";

        this.on("error", (error) => {
            if (error.code === "ECONNREFUSED"){
                log.info("OUTPUT: Refused");
            } else if (error.code === "ECONNRESET"){
                log.info("OUTPUT: Reset");
            } else if (error.code === "EPIPE"){
                log.info("OUTPUT: Broken pipe");
            } else if (error.code === "ETIMEDOUT"){
                log.info("OUTPUT: Timeout");
            } else if (error.code === "EHOSTUNREACH"){
                log.info(`OUTPUT: Host ${FLAG_SERVICE_HOST} unreachable`);
            } else {
                log.warning("OUTPUT: Unknown socket error:\n", error);
            };

            this.dead();
        });

        this.on("close", () => {
            log.debug("OUTPUT: Connection closed");

            setTimeout(() => {
                this.connect();
            }, this.reconnectTimeout);

            this.dead();
        });

        this.on("connect", () => {
            log.info("OUTPUT: Connected");
            this.ready = true;
            this.emit("ready");

            if (SEND_INTERVAL > 0){
                this.sendInterval = setInterval(this.sendFlags.bind(this), SEND_INTERVAL);
            }
        });

        this.on("data", (data) => {
            let answers = (this.inputBuffer + data.toString()).split('\n');
            let last = answers.pop();

            for (let answer of answers) {
                if (RECEIVER_GREETINGS.indexOf(answer) >= 0){
                    log.debug("OUTPUT: Greetings skipped");
                } else if (this.sentQueue.length > 0){
                    if (RECEIVER_GREETINGS.indexOf(answer) < 0){
                        this.emit("answer", this.sentQueue.shift(), answer);
                    }
                } else {
                    log.warning(`OUTPUT: Received data not related to any flag: ${data}`);
                }
            }

            if (last.length > 0){
                this.inputBuffer += last;
            } else {
                this.inputBuffer = "";
            }
        });

        this.connect();
    }

    dead(){
        this.ready = false;

        if (this.queue.length + this.sentQueue.length > 0){
            this.emit("fail", this.queue.concat(this.sentQueue));
            this.queue = new Array;
            this.sentQueue = new Array;
        }

        if (this.sendInterval){
            clearInterval(this.sendInterval);
            this.sendInterval = null;
        }
    }

    connect() {
        log.debug("OUTPUT: Try to connect")

        super.connect({
            host: this.host,
            port: this.port
        });
    }

    sendFlags(){
        if (this.queue.length > 0){
            this.write(this.queue.map((flag) => flag.toString()).join('\n')+'\n', "utf-8", () => {
                this.queue.forEach((flag) => {
                    this.sentQueue.push(flag);
                    this.emit("sent", flag);
                });
            });
        }
    }

    putInQueue(flags){
        if (!Array.isArray(flags)){
            throw new Error;
        }

        this.queue = this.queue.concat(flags);
        // log.debug(`OUTPUT: Add ${flags.length} flags to queue:\n${flags.join("\n")}`);

        if (SEND_INTERVAL == 0){
            this.sendFlags();
        }
    }
}

export default Output;
