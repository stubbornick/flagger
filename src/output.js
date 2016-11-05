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
        this.receiverMessages = options.receiverMessages;
        this.logger = options.logger || new Logger;
        this.maxFlagsPerSend = options.maxFlagsPerSend > 0 ? options.maxFlagsPerSend : Number.MAX_SAFE_INTEGER;
        this.lastRound = null;
        this.flagLifetime = options.flagLifetime;

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
            this.logger.debug("OUTPUT: Socket closed");

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
                if (this.receiverMessages.greetings.includes(answer)){
                    this.logger.debug("OUTPUT: Greetings skipped");
                } else if (this.sentQueue.length > 0){
                    this.emit("answer", this.sentQueue.shift(), answer);
                } else {
                    this.logger.warning(`OUTPUT: Received data not related to any flag: ${answer}`);
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
        this.logger.debug(`OUTPUT: Change status from ${this.status} to ${newStatus}`);
        if (newStatus !== this.status){
            this.status = newStatus;
            this.emit("status", newStatus);

            if (this.status === "READY"){
                this.logger.info("OUTPUT: Connected");
            } else if (this.status === "DISCONNECTED"){
                this.logger.info("OUTPUT: Disconnected");
            } else if (this.status === "ECONNREFUSED"){
                this.logger.info("OUTPUT: Connection refused");
            } else if (this.status === "ECONNRESET"){
                this.logger.info("OUTPUT: Connection reset");
            } else if (this.status === "EPIPE"){
                this.logger.info("OUTPUT: Broken pipe");
                this.socket.destroy();
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

            this.logger.debug(`Return ${failed.length} flags to waitingQueue:`, failed);
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
        this.waitingQueue = this.filterExpired(this.waitingQueue);

        if (this.waitingQueue.length > 0){
            let packCount = Math.ceil(this.waitingQueue.length/this.maxFlagsPerSend);
            this.logger.debug(`Trying to send ${this.waitingQueue.length} flags by ${packCount} pack${packCount > 1 ? "s" : ""}:`, this.waitingQueue);
        }

        while (this.waitingQueue.length > 0){

            let currentPack = [];
            while (currentPack.length < this.maxFlagsPerSend && this.waitingQueue.length > 0){
                let f = this.waitingQueue.pop();
                currentPack.push(f);
                this.sendingSet.add(f);
            };

            this.socket.write(currentPack.map((flag) => flag.toString()).join('\n')+'\n', "utf-8", () => {
                for (let flag of currentPack) {
                    if (this.sendingSet.delete(flag)){
                        this.sentQueue.push(flag);
                        this.emit("sent", flag);
                    }
                }
                this.logger.info(`Sent ${currentPack.length} flags:`, currentPack);
            });
        }
    }

    filterExpired(flags){
        let nonExpired = new Array;
        let now = new Date;
        for (let flag of flags) {
            if ((now - flag.date > this.flagLifetime) || (this.lastRound && flag.date < this.lastRound)){
                this.emit("expired", flag);
            } else {
                nonExpired.push(flag);
            }
        }
        return nonExpired;
    }

    putInQueue(flags){
        if (!Array.isArray(flags)){
            throw new Error;
        }

        flags = this.filterExpired(flags);

        this.waitingQueue = this.waitingQueue.concat(flags);
        this.waitingQueue.sort((a,b) => (a.priority-b.priority));

        // this.logger.debug(`OUTPUT: Add ${flags.length} flags to waitingQueue:, flags);

        if (this.sendPeriod === 0 && this.status === "READY"){
            this._sendFlags();
        }
    }
}

export default Output;
