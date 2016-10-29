"use strict";

import log from "./log";

class Flag
{
    constructor(flag, {socket} = {} ){
        if (typeof(flag) !== 'string'){
            throw new Error(`Unknown flag type: ${typeof(flag)}`);
        }
        this.flag = flag;
        this.socket = socket;
        this._status = Flag.statuses.waiting;
    }

    setStatus(newStatus){
        this._status = newStatus;
    }

    getStatus(){
        return this._status;
    }

    toString(){
        return this.flag;
    }
}

Flag.statuses = {
    waiting: 1,
    expired: 2,
    sent: 2,
    answered: 3
}

export default Flag;
