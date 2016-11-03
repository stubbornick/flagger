"use strict";

import net from "net";
import Logger from "./log";


class Output extends net.Socket
{
    constructor(options) {
        super();

        this.host = options.host;
        this.port = options.port;
        this.reconnectTimeout = options.reconnectTimeout || 1000;
        this.sendPeriod = options.sendPeriod || 0;
        this.receiverGreetings = options.receiverGreetings;
        this.logger = options.logger || new Logger;

        this.status = "NONE";
        this.queue = new Array();
        this.sentQueue = new Array();
        this.sendTimer = null;
        this.inputBuffer = "";

        this.on("error", (error) => {
            if (error.code){
                this._changeStatus(error.code);
            } else {
                this.logger.warning("OUTPUT: Unknown socket error:\n", error);
            };
        });

        this.on("close", () => {
            this.logger.debug("OUTPUT: Connection closed");

            setTimeout(() => {
                this.connect();
            }, this.reconnectTimeout);

            if (this.status === "READY"){
                this._changeStatus("DISCONNECTED");
            }
        });

        this.on("connect", () => {
            this._changeStatus("READY");

            if (this.sendPeriod > 0){
                this.sendTimer = setInterval(this._sendFlags.bind(this), this.sendPeriod);
            }
        });

        this.on("data", (data) => {
            let answers = (this.inputBuffer + data.toString()).split('\n');
            let last = answers.pop();

            for (let answer of answers) {
                if (this.receiverGreetings.indexOf(answer) >= 0){
                    this.logger.debug("OUTPUT: Greetings skipped");
                } else if (this.sentQueue.length > 0){
                    if (this.receiverGreetings.indexOf(answer) < 0){
                        this.emit("answer", this.sentQueue.shift(), answer);
                    }
                } else {
                    this.logger.warning(`OUTPUT: Received data not related to any flag: ${data}`);
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

            if (this.status === "READY"){
                this.logger.info("OUTPUT: Connected");
            } else if (this.status === "DISCONNECTED"){
                this.logger.info("OUTPUT: Disconnected");
            } else if (this.status === "ECONNREFUSED"){
                this.logger.info("OUTPUT: Refused");
            } else if (this.status === "ECONNRESET"){
                this.logger.info("OUTPUT: Reset");
            } else if (this.status === "EPIPE"){
                this.logger.info("OUTPUT: Broken pipe");
            } else if (this.status === "ETIMEDOUT"){
                this.logger.info("OUTPUT: Timeout");
            } else if (this.status === "EHOSTUNREACH"){
                this.logger.info(`OUTPUT: Host ${FLAG_SERVICE_HOST} unreachable`);
            } else {
                this.logger.warning(`OUTPUT: Unknown socket status: ${this.status}`);
            };

            if (this.status === "READY"){
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

        if (this.sendTimer){
            clearInterval(this.sendTimer);
            this.sendTimer = null;
        }
    }

    connect() {
        this.logger.debug("OUTPUT: Try to connect")

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
        // this.logger.debug(`OUTPUT: Add ${flags.length} flags to queue:\n${flags.join("\n")}`);

        if (this.sendPeriod === 0){
            this._sendFlags();
        }
    }
}

export default Output;
