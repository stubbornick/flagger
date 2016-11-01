"use strict";

import { FLAG_REGEXP } from "./config";
import log from "./log";

class Flag
{
    constructor(flag, {socket, status} = {} ){
        if (typeof(flag) !== 'string'){
            throw new Error(`Unknown flag type: ${typeof(flag)}`);
        }

        // if (!FLAG_REGEXP.test(flag)){
        //     throw new Error(`Flag '${flag}' don't match regexp ${FLAG_REGEXP.toString()}`);
        // }

        this.flag = flag;
        this.socket = socket;
        this._status = status || Flag.statuses.waiting;
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
