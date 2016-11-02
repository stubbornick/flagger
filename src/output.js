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
        this.status = "NONE";
        this.queue = new Array();
        this.sentQueue = new Array();
        this.sendInterval = new Array();
        this.inputBuffer = "";

        this.on("error", (error) => {
            if (error.code){
                this._changeStatus(error.code);
            } else {
                log.warning("OUTPUT: Unknown socket error:\n", error);
            };
        });

        this.on("close", () => {
            log.debug("OUTPUT: Connection closed");

            setTimeout(() => {
                this.connect();
            }, RECONNECT_TIMEOUT);

            if (this.status === "READY"){
                this._changeStatus("DISCONNECTED");
            }
        });

        this.on("connect", () => {
            this._changeStatus("READY");

            if (SEND_INTERVAL > 0){
                this.sendInterval = setInterval(this._sendFlags.bind(this), SEND_INTERVAL);
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

    _changeStatus(newStatus){
        if (newStatus !== this.status){
            this.status = newStatus;
            this.emit("status", newStatus);

            if (newStatus === "READY"){
                this.emit("ready");
            } else {
                this.dead();
            }
        }
    }

    dead(){
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

    _sendFlags(){
        if (this.queue.length > 0){
            this.write(this.queue.map((flag) => flag.toString()).join('\n')+'\n', "utf-8", () => {
                this.queue.forEach((flag) => {
                    this.sentQueue.push(flag);
                    this.emit("sent", flag);
                });
                this.queue = new Array;
            });
        }
    }

    putInQueue(flags){
        if (!Array.isArray(flags)){
            throw new Error;
        }

        this.queue = this.queue.concat(flags);
        // log.debug(`OUTPUT: Add ${flags.length} flags to queue:\n${flags.join("\n")}`);

        if (SEND_INTERVAL === 0){
            this._sendFlags();
        }
    }
}

export default Output;
