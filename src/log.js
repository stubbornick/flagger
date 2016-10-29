"use strict";

import util from "util";
import fs from "fs";
import dateFormat from "dateformat";
import { LOGFILE } from "./config";

const loglevels = {
    debug: 'DEBUG',
    info: 'INFO',
    warning: 'WARNING',
    error: 'ERROR',
    fatal: 'FATAL',
}

function printLog(level, ...args){
    let msg = util.format(...args);
    msg = util.format("%s [%s] %s", dateFormat(new Date(), "yyyy.mm.dd HH:MM:ss"), level, msg);
    console.log(msg);
    fs.appendFileSync(LOGFILE, msg+"\n");
}

const log = {
    debug:   (...args) => printLog(loglevels.debug, ...args),
    info:    (...args) => printLog(loglevels.info, ...args),
    warning: (...args) => printLog(loglevels.warning, ...args),
}

export default log;
