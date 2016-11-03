"use strict";

import { FLAG_REGEXP } from "./config";
import log from "./log";

class Flag
{
    constructor(flag){
        if (typeof flag === "string"){
            flag = { flag: flag };
        } else if (typeof(flag) !== 'object'){
            throw new Error(`Unknown flag type: ${typeof(flag)}`);
        }

        this.flag = flag.flag;
        this.tcpsocket = flag.tcpsocket || null;
        this.status = flag.status || "WAITING";
        this.expired = flag.expired || false;
        this.answer = flag.answer || null;
    }

    markAsSent(){
        this.status = "SENT";
    }

    toObject(){
        return {
            flag: this.flag,
            status: this.status,
            expired: this.expired,
            answer: this.answer,
        }
    }

    toString(){
        return this.flag;
    }

    toJSON(flag){
        return JSON.stringify({
            flag: this.flag,
            status: this._status
        });
    }

    static fromJSON(json){
        let f = JSON.parse(json);
        new Flag(f.flag, {
            status: f.status
        });
    }
}

export default Flag;
