"use strict";

import net from "net";
import Logger from "./log";
import config from "./config"
import Output from "./output";
import Database from "./database"
import Flag from "./flag"

function regexpFindAll(data, regexp){
    let flags = []
    let m;

    do {
        m = regexp.exec(data);
        if (m) {
            flags.push(m[0]);
        }
    } while (m);

    return flags;
}

class Flagger
{
    constructor(options){

        this.output = new Output(Object.assign(options.output, {
            logger: options.logger
        }));

        this.logger = options.logger || new Logger;
        this.database = new Database(options.databaseFile, this.logger);
        this.tcpServer = new net.Server;

        this.database.getUnansweredFlags().then((flags) => {
            if (flags.length > 0){
                this.logger.debug(`Restore ${flags.length} flags from DB:\n${flags.map(flag => flag.toString()).join("\n")}`);
                this.output.putInQueue(flags);
            }
        });

        this.output.on("ready", () => {
            this.logger.debug("Output socket is ready");
            if (this.globalQueue.length > 0){
                this.output.putInQueue(this.globalQueue);
                this.globalQueue = new Array;
            }
        });

        this.output.on("fail", (flags) => {
            this.globalQueue = this.globalQueue.concat(flags);
        });

        this.output.on("answer", (flag, answer) => {
            this.logger.info(`Answer: ${flag} ${answer}`);
            flag.status = "ANSWERED";
            flag.answer = answer;
            flag.returnToSender(`Answer: ${flag} ${answer}`);
            this.database.updateFlag(flag);
        });

        this.output.on("sent", (flag) => {
            this.logger.debug(`Sent flag ${flag.toString()}`);
            flag.status = "SENT";
            this.database.updateFlag(flag);
        });

        this.tcpServer.on("connection", async (socket) => {
            this.logger.debug(`${socket.remoteAddress}:${socket.remotePort} connected to raw socket`);
            socket.on("data", (data) => {

                let flags = regexpFindAll(data.toString(), options.flagRegexp);
                if (flags.length > 0){
                    for (let flag of flags) {
                        this.logger.info(`Flag from ${socket.remoteAddress}: ${flag}`);
                    }

                    this.processFlags(flags, socket).catch((error) => {
                        this.logger.error("Error in processFlags():", error);
                    });
                }
            });
        });

        this.tcpServer.listen({
            host: options.tcpServer.host,
            port: options.tcpServer.port,
        }, () => {
            let addr = this.tcpServer.address();
            this.logger.info(`Start listening on ${addr.address} ${addr.port}`);
        });
    }

    async processFlags(flags, socket = undefined){
        let newFlags = new Array;
        let oldFlags = new Array;

        for (let flag of flags){
            if (typeof flag === "string"){
                const flagString = flag;
                flag = await this.database.findFlag(flagString);
                if (flag){
                    flag.tcpsocket = socket;
                    oldFlags.push(flag);
                } else {
                    newFlags.push(new Flag({
                        flag: flagString,
                        tcpsocket: socket,
                    }));
                }
            }
        };

        for (let flag of oldFlags){
            let message = `Flagger: ${flag} already in DB with status: '${flag.status}'`;
            if (flag.answer){
                message += `, answer: '${flag.answer}'`;
            } else if (flag.expired){
                message += ", expired";
            }
            flag.returnToSender(message);
            this.logger.debug(`Duplicate flag: ${flag}`);
        };

        for (let flag of newFlags){
            await this.database.addFlag(flag);
        };
        this.output.putInQueue(newFlags);
    }
}

if (require.main === module) {
    async function main() {
        new Flagger({
            output: {
                host: config.FLAG_SERVICE_HOST,
                port: config.FLAG_SERVICE_PORT,
                reconnectTimeout: config.RECONNECT_TIMEOUT,
                sendPeriod: config.SEND_PERIOD,
                receiverGreetings: config.RECEIVER_GREETINGS,
            },
            tcpServer: {
                host: config.TCP_SOCKET_HOST,
                port: config.TCP_SOCKET_PORT,
            },
            logger: new Logger(config.INFO_LOG, config.DEBUG_LOG),
            flagRegexp: config.FLAG_REGEXP,
            databaseFile: config.FLAGS_DATABASE,
        });
    }

    main().catch((err) => console.error(err));
}
