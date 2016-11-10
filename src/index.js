"use strict";

import net from "net";
import http from "http";
import IOServer from "socket.io";
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
            receiverMessages: options.receiverMessages,
            flagLifetime: options.flagLifetime
        }));

        this.logger = options.logger || new Logger;
        this.database = new Database({
            file: options.databaseFile,
            logger: this.logger,
            acceptedAnswer: options.receiverMessages.accepted,
        });
        this.tcpServer = new net.Server;
        this.httpServer = http.createServer();
        this.ioServer = new IOServer(this.httpServer);
        this.ioClients = new Set;

        this.database.getUnansweredFlags().then((flags) => {
            if (flags.length > 0){
                this.logger.debug(`Restore ${flags.length} unfinished flags from DB:`, flags);
                this.output.putInQueue(flags);
            }
        });

        this.output.on("answer", (flag, answer) => {
            this.logger.info(`Answer: ${flag} ${answer}`);
            flag.status = "ANSWERED";
            flag.answer = answer;
            flag.returnToSender(`Answer: ${flag} ${answer}`);
            this.database.updateFlag(flag);
            this.emitUpdate(flag);
        });

        this.output.on("sent", (flag) => {
            if (flag.status === "UNSENT"){
                flag.status = "SENT";
                this.database.updateFlag(flag);
                this.emitUpdate(flag);
            }
        });

        this.output.on("expired", (flag) => {
            flag.expired = true;
            this.database.updateFlag(flag);
            this.logger.info(`Flag expired: ${flag}`);
            this.emitUpdate(flag);
        });

        this.tcpServer.on("connection", (socket) => {
            this.logger.debug(`TCP: ${socket.remoteAddress}:${socket.remotePort} connected`);
            socket.write("Flagger: You can send flags now.\n");
            socket.write("Flagger: Send flag again to get it's current status.\n");

            socket.on("data", (data) => {

                let flags = data.toString().match(options.flagRegexp);
                if (flags && flags.length > 0){
                    for (let flag of flags) {
                        this.logger.info(`TCP: Flag from ${socket.remoteAddress}: ${flag}`);
                    }

                    this.processFlags(flags, socket).catch((error) => {
                        this.logger.error("Error while process flags:", error);
                    });
                } else {
                    socket.write("Flagger: No flags in input!\n");
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

            socket.on("error", (error) => {
                this.logger.error(`Error with ${socket.remoteAddress} socket:\n${error}`);
            });

            socket.on("close", () => {
                this.logger.debug(`TCP: ${socket.remoteAddress} disconnected`);
            });
        });

        this.tcpServer.listen({
            host: options.tcpServer.host,
            port: options.tcpServer.port,
        }, () => {
            let addr = this.tcpServer.address();
            this.logger.info(`Start listening on ${addr.address} ${addr.port}`);
        });

        this.ioServer.on("connection", (client) => {
            const address = `${client.request.connection.remoteAddress}:${client.request.connection.remotePort}`;
            this.ioClients.add(client);
            this.logger.debug(`SocketIO: ${address} connected`);

            client.once("disconnect", () => {
                this.ioClients.delete(client);
                console.log(`SocketIO: ${address} disconnected`);
            });

            client.on("command", async (msg, callback) => {
                if (msg){
                    if (msg.command === "get_last_flags"){
                        callback(await this.database.getLastFlagsRaw(msg.count));
                    } else if (msg.command === "flags"){
                        let flags = msg.data.toString().match(options.flagRegexp);
                        if (flags && flags.length > 0){
                            for (let flag of flags) {
                                this.logger.info(`SocketIO: Flag from ${address}: ${flag}`);
                            }

                            this.processFlags(flags).catch((error) => {
                                this.logger.error("Error while process flags:", error);
                            });
                        }
                        callback("OK");
                    }
                }
            });
        });

        this.httpServer.listen(options.ioServer.port, options.ioServer.host);
    }

    emitUpdate(flag){
        this.ioClients.forEach((client) => {
            client.emit("update", flag.toObject());
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

        for (let flag of newFlags){
            this.emitUpdate(flag);
        }
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
            flagLifetime: config.MAX_FLAG_LIFETIME,
            receiverMessages: config.RECEIVER_MESAGES,
            tcpServer: {
                host: config.TCP_SERVER_HOST,
                port: config.TCP_SERVER_PORT,
            },
            ioServer: {
                host: config.IO_SERVER_HOST,
                port: config.IO_SERVER_PORT,
            },
            logger: new Logger(config.INFO_LOG, config.DEBUG_LOG, true),
            flagRegexp: config.FLAG_REGEXP,
            databaseFile: config.FLAGS_DATABASE,
        });
    }

    main().catch((err) => console.error(err));
}
