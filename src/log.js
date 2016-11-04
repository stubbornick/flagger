"use strict";

import util from "util";
import fs from "fs";
import dateFormat from "dateformat";
import Flag from "./flag";
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
        for (let i=0; i<args.length; ++i){
            if (Array.isArray(args[i])){
                if (args[i][0] instanceof Flag){
                    if (args[i].length <= 50){
                        args[i] = "\n" + args[i].map(f => f.toString()).join("\n");
                    } else {
                        let t = (args[i][0].flag.length-3)/2;
                        args[i] = "\n" + args[i].slice(0,15).map(f => f.toString()).join("\n") +
                            "\n"+ " ".repeat(t) + "..." + " ".repeat(t) + "\n" +
                            args[i].slice(-15).map(f => f.toString()).join("\n");
                    }
                }
            }
        }
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
