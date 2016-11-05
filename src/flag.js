"use strict";

import log from "./log";

class Flag
{
    constructor(flagObj){
        if (typeof(flagObj) !== 'object'){
            throw new Error(`Unknown flag type: ${typeof(flag)}`);
        }

        this._id = flagObj._id || undefined;
        this.flag = flagObj.flag;
        this.tcpsocket = flagObj.tcpsocket || null;
        this.status = flagObj.status || "UNSENT";
        this.expired = flagObj.expired || false;
        this.answer = flagObj.answer || null;
        this.date = flagObj.date || new Date();

        this.calculatePriority();
    }

    calculatePriority(){
        if (this.status === "UNSENT"){
            this.priority = 2
        } else if (this.status === "SENT"){
            this.priority = 1
        } else {
            this.priority = 0
        }

        this.priority = this.priority * this.date;
    }

    returnToSender(msg){
        if (this.tcpsocket && this.tcpsocket.writable){
            this.tcpsocket.write(msg+"\n");
        }
    }

    toObject(){
        return {
            _id: this._id,
            flag: this.flag,
            status: this.status,
            expired: this.expired,
            answer: this.answer,
            date: this.date,
        }
    }

    toString(){
        return this.flag;
    }
}

export default Flag;
