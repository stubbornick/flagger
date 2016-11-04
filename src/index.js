"use strict";

import net from "net";
import Logger from "./log";
import config from "./config"
import Output from "./output";
import Database from "./database"
import Flag from "./flag"


class Flagger
{
    constructor(options){

        this.output = new Output(Object.assign(options.output, {
            logger: options.logger,
            receiverMessages: options.receiverMessages
        }));

        this.logger = options.logger || new Logger;
        this.database = new Database({
            file: options.databaseFile,
            logger: this.logger,
            acceptedAnswer: options.receiverMessages.accepted,
        });
        this.tcpServer = new net.Server;

        this.database.getUnansweredFlags().then((flags) => {
            if (flags.length > 0){
                this.logger.debug(`Restore ${flags.length} unfinished flags from DB:`, flags);
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
            flag.status = "SENT";
            this.database.updateFlag(flag);
        });

        this.tcpServer.on("connection", (socket) => {
            this.logger.debug(`${socket.remoteAddress}:${socket.remotePort} connected to raw socket`);
            socket.on("data", (data) => {

                let flags = data.toString().match(options.flagRegexp);
                if (flags){
                    for (let flag of flags) {
                        this.logger.info(`Flag from ${socket.remoteAddress}: ${flag}`);
                    }

                    this.processFlags(flags, socket).catch((error) => {
                        this.logger.error("Error while process flags:", error);
                    });
                }

                let lines = data.toString().split("\n");
                if (lines.includes("stats") || lines.includes("status")){
                    socket.write(`Output status: ${this.output.status}\n`);
                    socket.write("Database statistics:\n");
                    this.database.getStatistics().then(dbStats => {
                        if (socket.writable){
                            for (let s in dbStats) {
                                socket.write(`\t${s}: ${dbStats[s]}\n`);
                            }
                        }
                    })
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

        await this.database.addFlags(newFlags);

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
                maxFlagsPerSend: config.MAX_FLAGS_PER_SEND,
            },
            receiverMessages: config.RECEIVER_MESAGES,
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
