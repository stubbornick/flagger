"use strict";

import net from "net";
import http from "http";
import IOServer from "socket.io";
import Logger from "./log";
import config from "./config"
import Output from "./output";
import Database from "./database"
import Flag from "./flag"


export default class Flagger
{
    constructor(options) {
        this.options = options;
        this.logger = options.logger || new Logger();
        this.state = "new";
        this.processings = new Set();
        if (!this.options.flagRegexp.flags.includes("g")) {
            this.options.flagRegexp = RegExp(this.options.flagRegexp, "g");
        }
    }

    async start() {
        if (this.state === "run") {
            this.logger.warning("Flagger already started");
            return;
        }

        this.logger.info("Flagger starting up");

        const options = this.options;

        this.database = new Database({
            logger: this.logger,
            acceptedAnswer: options.receiverMessages.accepted,
        });

        await this.database.open(options.flagsDatabase);

        this.output = new Output(Object.assign(options.output, {
            logger: options.logger,
            receiverMessages: options.receiverMessages,
            resendTimeout: options.resendTimeout,
            flagLifetime: options.flagLifetime
        }));


        this.output.on("answers", (answers, bad) => {
            let updatedFlags = [];

            for (let i = 0; i < answers.length; i++) {
                const [flag, answer] = answers[i];
                if (options.receiverMessages.badAnswers.includes(answer)) {
                    flag.status = "BAD_ANSWERED";
                } else {
                    flag.status = "ANSWERED";
                }
                flag.answer = answer;
                updatedFlags.push(flag);

                flag.returnToSender(`Answer: ${flag} ${flag.answer}`);
                this.logger.info(`Answer: ${flag} ${flag.answer}`);
            }

            const p = this.database.updateFlags(updatedFlags, ["status", "answer"]).then(() => {
                this.logger.trace(`${answers.length} answers writed to DB`);
                this.emitUpdate(updatedFlags);
            }).catch((error) => {
                this.logger.error("Error while write flags answers to DB:\n", error);
            });

            this.processings.add(p);
            p.then(() => this.processings.delete(p));
        });

        this.output.on("sent", (flags) => {
            let updatedFlags = [];

            for (let i = 0; i < flags.length; i++) {
                const flag = flags[i];

                if (flag.status === "UNSENT") {
                    flag.status = "SENT";
                    updatedFlags.push(flag);
                }
            }

            if (updatedFlags.length > 0) {
                const p = this.database.updateFlags(updatedFlags, ["status"]).then(() => {
                    this.emitUpdate(updatedFlags);
                }).catch((error) => {
                    this.logger.error("Error while write sent flags to DB:\n", error);
                });

                this.processings.add(p);
                p.then(() => this.processings.delete(p));
            }
        });

        this.output.on("expired", (flags) => {
            for (let i = 0; i < flags.length; i++) {
                flags[i].expired = true;
                this.logger.info(`OUTPUT: Flag expired: ${flags[i]}`);
            }

            const p = this.database.updateFlags(flags, ["expired"]).then(() => {
                this.emitUpdate(flags);
            }).catch((error) => {
                this.logger.error("Error while write expired flags to DB:\n", error);
            });

            this.processings.add(p);
            p.then(() => this.processings.delete(p));
        });

        this.tcpServer = new net.Server();
        this.tcpClients = new Set();

        this.tcpServer.on("connection", (socket) => {
            this.logger.debug(`TCP: ${socket.remoteAddress}:${socket.remotePort} connected`);
            this.tcpClients.add(socket);
            socket.write("Flagger: You can send flags now.\n");
            socket.write("Flagger: Send flag again to get it's current status.\n");

            let inputBuffer = "";

            socket.on("data", (data) => {

                data = inputBuffer + data.toString();

                let flags = data.match(options.flagRegexp);
                if (flags && flags.length > 0) {
                    for (let i = 0; i < flags.length; i++) {
                        this.logger.info(`TCP: Flag from ${socket.remoteAddress}: ${flags[i]}`);
                    }

                    const p = this.processNewFlags(flags, socket).catch((error) => {
                        this.logger.error("TCP: Error while process flags:\n", error);
                    });

                    this.processings.add(p);
                    p.then(() => this.processings.delete(p));
                } else {
                    socket.write("Flagger: No flags in input!\n");
                }

                let lines = data.split("\n");
                const last = lines.pop();

                if (lines.includes("stats") || lines.includes("status")) {
                    socket.write(`Output status: ${this.output.status}\n`);
                    socket.write("Database statistics:\n");

                    const p = this.database.getStatistics().then(dbStats => {
                        if (socket.writable) {
                            for (let s in dbStats) {
                                socket.write(`\t${s}: ${dbStats[s]}\n`);
                            }
                        }
                    }).catch((error) => {
                        this.logger.error("Error while getting DB stats:\n", error);
                    });

                    this.processings.add(p);
                    p.then(() => this.processings.delete(p));
                } else if (lines.includes("drop")) {
                    socket.write("Drop all flags as expired!\n");
                    this.output.dead();
                    this.output.emit("expired", this.output.waitingQueue);
                    this.output.ready();
                }

                if (last.length > 0) {
                    inputBuffer = last;
                } else {
                    inputBuffer = "";
                }
            });

            socket.on("error", (error) => {
                this.logger.error(`TCP: Error with ${socket.remoteAddress} socket:\n`, error);
            });

            socket.on("close", () => {
                this.tcpClients.delete(socket);
                this.logger.debug(`TCP: ${socket.remoteAddress} disconnected`);
            });
        });


        this.httpServer = http.createServer();
        this.ioServer = new IOServer(this.httpServer);
        this.ioClients = new Set();

        this.ioServer.on("connection", (client) => {
            const address = `${client.request.connection.remoteAddress}:${client.request.connection.remotePort}`;
            this.ioClients.add(client);
            this.logger.debug(`SocketIO: ${address} connected`);

            client.once("disconnect", () => {
                this.ioClients.delete(client);
                this.logger.debug(`SocketIO: ${address} disconnected`);
            });

            client.on("command", async (msg, callback) => {
                if (typeof callback != "function") {
                    callback = () => {};
                }

                if (msg) {
                    if (msg.command === "get_last_flags") {
                        const p = this.database.getLastFlagsRaw(msg.count).catch((error) => {
                            this.logger.error(`Error while fetching ${msg.count} last flags from DB:\n`, error);
                        });

                        this.processings.add(p);
                        p.then(() => this.processings.delete(p));

                        callback(await p);
                    } else if (msg.command === "flags") {
                        let flags = msg.data.toString().match(options.flagRegexp);
                        if (flags && flags.length > 0) {
                            for (let i = 0; i < flags.length; i++) {
                                this.logger.info(`SocketIO: Flag from ${address}: ${flags[i]}`);
                            }

                            const p = this.processNewFlags(flags).catch((error) => {
                                this.logger.error("SocketIO: Error while process flags:\n", error);
                            });

                            this.processings.add(p);
                            p.then(() => this.processings.delete(p));
                        }
                        callback("OK");
                    }
                }
            });
        });

        const unanswered = await this.database.getUnansweredFlags();
        if (unanswered.length > 0) {
            this.logger.debug(`Restore ${unanswered.length} unfinished flags from DB:`, unanswered);
            this.output.putInQueue(unanswered);
        }

        await Promise.all([new Promise((resolve) => {
            this.tcpServer.listen({
                host: options.tcpServer.host,
                port: options.tcpServer.port,
            }, (error) => {
                if (error) {
                    reject(error);
                } else {
                    let addr = this.tcpServer.address();
                    this.logger.info(`TCP: Start listening on ${addr.address} ${addr.port}`);
                    resolve();
                }
            });
        }), new Promise((resolve) => {
            this.httpServer.listen({
                port: options.ioServer.port,
                host: options.ioServer.host
            }, (error) => {
                if (error) {
                    reject(error);
                }
                resolve();
            });
        })]).then(() => {
            this.state = "run";
            this.logger.info("Flagger started");
        });
    }

    emitUpdate(flags) {
        if (!Array.isArray(flags)) {
            flags = [flags];
        }

        this.ioClients.forEach((client) => {
            client.emit("update", flags.map(x => x.toObject()));
        });
    }

    async processNewFlags(flags, socket = undefined) {
        let newFlagsSet = new Set(flags);

        const oldFlags = await this.database.findFlags(flags);
        for (let i = 0; i < oldFlags.length; i++) {
            oldFlags[i].tcpsocket = socket;
            newFlagsSet.delete(oldFlags[i].flag);
        }

        let newFlagsArray = [];
        const now = new Date();
        for (const flagString of newFlagsSet.keys()) {
            newFlagsArray.push(new Flag({
                flag: flagString,
                tcpsocket: socket,
                date: now,
            }));
        }

        await this.database.addFlags(newFlagsArray);

        for (let i = 0; i < oldFlags.length; i++) {
            let message = `Flagger: ${oldFlags[i]} already in DB with status: '${oldFlags[i].status}'`;
            if (oldFlags[i].answer) {
                message += `, answer: '${oldFlags[i].answer}'`;
            } else if (oldFlags[i].expired) {
                message += ", expired";
            }
            oldFlags[i].returnToSender(message);
            this.logger.debug(`Duplicate flag: ${oldFlags[i]}`);
        };

        this.output.putInQueue(newFlagsArray);
        this.emitUpdate(newFlagsArray);
    }

    async stop() {
        if (this.state !== "run") {
            this.logger.warning(`Trying to stop flagger in '${this.state}' state`);
            return;
        }

        this.state = "stopping";
        this.logger.info("Flagger stopping");

        for (let ioClient of this.ioClients) {
            ioClient.disconnect(true);
        }
        this.httpServer.close();
        this.httpServer.removeAllListeners();
        this.ioServer.removeAllListeners();

        for (let tcpClient of this.tcpClients) {
            tcpClient.destroy();
        }
        this.tcpServer.close();
        this.tcpServer.removeAllListeners();

        this.output.stop();
        this.output.removeAllListeners();

        await Promise.all([...this.processings.keys()]);
        await this.database.close();
        this.state = "end";
        this.logger.info("Flagger stopped");
    }
}

if (require.main === module) {
    async function main() {
        const logger = new Logger(config.logging);

        const f = new Flagger({
            output: {
                host: config.FLAG_SERVICE_HOST,
                port: config.FLAG_SERVICE_PORT,
                reconnectTimeout: config.RECONNECT_TIMEOUT,
                sendPeriod: config.SEND_PERIOD,
                maxFlagsPerSend: config.MAX_FLAGS_PER_SEND,
                resendTimeout: config.RESEND_TIMEOUT
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
            logger,
            flagRegexp: config.FLAG_REGEXP,
            flagsDatabase: config.FLAGS_DATABASE,
        });

        const gracefulStop = () => {
            f.stop().then(() => {
                process.exit();
            }).catch((error) => {
                logger.error("Error while gracefull stop:\n", error);
            });
        };

        process.on('SIGINT', () => {
            console.log("Caught SIGINT signal");
            gracefulStop();
        });

        process.on('SIGTERM', () => {
            console.log("Caught SIGTERM signal");
            gracefulStop();
        });

        await f.start();
    }

    main().catch((err) => console.error(err));
}
