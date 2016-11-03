"use strict";

import net from "net";
import EventEmitter from "events";
import Logger from "./log";


class Output extends EventEmitter
{
    constructor(options) {
        super();

        this.host = options.host;
        this.port = options.port;
        this.reconnectTimeout = options.reconnectTimeout || 1000;
        this.sendPeriod = options.sendPeriod || 0;
        this.receiverGreetings = options.receiverGreetings;
        this.logger = options.logger || new Logger;

        this.socket = new net.Socket;
        this.status = "NONE";
        this.waitingQueue = new Array();
        this.sendingSet = new Set();
        this.sentQueue = new Array();
        this.sendTimer = null;
        this.inputBuffer = "";

        this.socket.on("error", (error) => {
            if (error.code){
                this._changeStatus(error.code);
            } else {
                this.logger.warning("OUTPUT: Unknown socket error:\n", error);
            };
        });

        this.socket.on("close", () => {
            this.logger.debug("OUTPUT: Connection closed");

            setTimeout(() => {
                this.connect();
            }, this.reconnectTimeout);

            if (this.status === "READY"){
                this._changeStatus("DISCONNECTED");
            }
        });

        this.socket.on("connect", () => {
            this._changeStatus("READY");
        });

        this.socket.on("data", (data) => {
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
                this.logger.info(`OUTPUT: Host ${this.host} unreachable`);
            } else {
                this.logger.warning(`OUTPUT: Unknown socket status: ${this.status}`);
            };

            if (this.status === "READY"){
                this.ready();
            } else {
                this.dead();
            }
        }
    }

    ready(){
        this._sendFlags();
        if (this.sendPeriod > 0){
            this.sendTimer = setInterval(this._sendFlags.bind(this), this.sendPeriod);
        }
    }

    dead(){
        if (this.sendingSet.size + this.sentQueue.length > 0){
            let failed = this.sentQueue.concat(Array.from(this.sendingSet));

            this.sendingSet = new Set;
            this.sentQueue = new Array;

            this.logger.debug(`Return ${failed.length} flags to waitingQueue:\n${failed.join("\n")}`);
            this.putInQueue(failed);
        }

        if (this.sendTimer){
            clearInterval(this.sendTimer);
            this.sendTimer = null;
        }
    }

    connect() {
        this.logger.debug("OUTPUT: Try to connect")

        this.socket.connect({
            host: this.host,
            port: this.port
        });
    }

    _sendFlags(){
        if (this.waitingQueue.length > 0){

            let currentPack = [];
            this.waitingQueue = this.waitingQueue.filter((flag) => {
                currentPack.push(flag);
                this.sendingSet.add(flag);
                return false;
            });

            this.socket.write(currentPack.map((flag) => flag.toString()).join('\n')+'\n', "utf-8", () => {
                currentPack.forEach((flag) => {
                    this.sentQueue.push(flag);
                    this.sendingSet.delete(flag);
                    this.emit("sent", flag);
                });
            });
        }
    }

    putInQueue(flags){
        if (!Array.isArray(flags)){
            throw new Error;
        }

        this.waitingQueue = this.waitingQueue.concat(flags);
        // this.logger.debug(`OUTPUT: Add ${flags.length} flags to waitingQueue:\n${flags.join("\n")}`);

        if (this.sendPeriod === 0 && this.status === "READY"){
            this._sendFlags();
        }
    }
}

export default Output;
