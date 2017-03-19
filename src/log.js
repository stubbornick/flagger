"use strict";

import util from "util";
import fs from "fs";
import dateFormat from "dateformat";
import Flag from "./flag";

const loglevels = ["TRACE", "DEBUG", "INFO", "WARNING", "ERROR", "FATAL"];

class Logger
{
    constructor({ debugLogfile, infoLogfile, logfile = "log.log", printDate = true, overrideError = false, consolePrint = true } = {}){
        this.debugLogfile = debugLogfile || logfile;
        this.infoLogfile = infoLogfile || logfile;
        this.printDate = printDate;
        this.consolePrint = consolePrint;
        this.currentDate = "";

        for (let level of loglevels){
            this[level.toLowerCase()] = (...args) => this.print(level, args);
        }

        if (overrideError){
            const oldError = console.error;
            global.console.error = (...args) => {
                this.error(...args);
                oldError(...args);
            }
        }

        if (this.printDate) {
            this.updateDate();
            setInterval(this.updateDate.bind(this), 1000);
        }
    }

    updateDate() {
        this.currentDate = dateFormat(new Date(), "yyyy.mm.dd HH:MM:ss");
    }

    print(level, args){
        // Do not print large flags chunks wholly
        for (let i = 0; i < args.length; ++i){
            if (Array.isArray(args[i])){
                if (args[i][0] instanceof Flag){
                    if (args[i].length <= 50){
                        args[i] = "\n" + args[i].map(f => f.toString()).join("\n");
                    } else {
                        let t = (args[i][0].flag.length-3)/2;
                        args[i] = "\n" + args[i].slice(0,15).map(f => f.toString()).join("\n") +
                            "\n" + " ".repeat(t) + "..." + " ".repeat(t) + "\n" +
                            args[i].slice(-15).map(f => f.toString()).join("\n");
                    }
                }
            }
        }

        let msg = "";
        if (args.length === 1) {
            msg = args[0];
        } else {
            msg = util.format(...args);
        }

        msg = `[${level}] ${msg}`;
        if (this.printDate) {
            msg = this.currentDate + " " + msg;
        }

        if (this.consolePrint) {
            console.log(msg);
        }

        if (loglevels.indexOf(level) > loglevels.indexOf("DEBUG") && this.infoLogfile) {
            fs.appendFile(this.infoLogfile, msg+"\n", (error) => {
                if (error){
                    console.error("Error while appending logfile file:\n", error);
                }
            });
        }

        if (
            this.debugLogfile &&
            (loglevels.indexOf(level) <= loglevels.indexOf("DEBUG") || this.debugLogfile !== this.infoLogfile)
        ) {
            fs.appendFile(this.debugLogfile, msg+"\n", (error) => {
                if (error){
                    console.error("Error while appending logfile file:\n", error);
                }
            });
        }
    }
}

export default Logger;
