"use strict";

import util from "util";
import fs from "fs";
import dateFormat from "dateformat";
import { DEBUG_LOG, INFO_LOG } from "./config";

const loglevels = {
    debug: 'DEBUG',
    info: 'INFO',
    warning: 'WARNING',
    error: 'ERROR',
    fatal: 'FATAL',
}

class Logger
{
    constructor(infoLogFile = null, debugLogFile = null){
        this.debugLogFile = debugLogFile;
        this.infoLogFile = infoLogFile;

        for (let level in loglevels){
            this[level] = (...args) => this.print(loglevels[level], ...args);
        }
    }

    print(level, ...args){
        let msg = util.format(...args);
        msg = util.format("%s [%s] %s", dateFormat(new Date(), "yyyy.mm.dd HH:MM:ss"), level, msg);
        console.log(msg);
        if (level !== loglevels.debug){
            fs.appendFileSync(this.infoLogFile, msg+"\n");
        }
        fs.appendFileSync(this.debugLogFile, msg+"\n");
    }
}

export default Logger;
