"use strict";

import net from "net";
import Logger from "./log";
import config from "./config"
import Output from "./output";
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
        this.tcpServer = new net.Server;
        this.globalQueue = new Array;

        this.output.on("ready", () => {
            this.logger.debug("Output socket is ready");
            if (this.globalQueue.length > 0){
                this.output.putInQueue(this.globalQueue);
                this.globalQueue = new Array;
            }
        });

        this.output.on("fail", (flags) => {
            this.logger.debug(`Return ${flags.length} flags to global queue:\n${flags.join("\n")}`);
            this.globalQueue = this.globalQueue.concat(flags);
        });

        this.output.on("answer", (flag, answer) => {
            this.logger.info(`Answer: ${flag} ${answer}`);

            if (flag.tcpsocket && flag.tcpsocket.writable){
                flag.tcpsocket.write(`Answer: ${flag} ${answer}\n`);
            }
        });

        this.output.on("sent", (flag) => {
            this.logger.debug(`Sent flag ${flag}`);
            flag.markAsSent();
        });

        this.tcpServer.on("connection", (socket) => {
            this.logger.debug(`${socket.localAddress}:${socket.localPort} connected to raw socket`);
            socket.on("data", (data) => {

                let flags = regexpFindAll(data.toString(), options.flagRegexp);
                if (flags.length > 0){
                    for (let flag of flags) {
                        this.logger.info(`New flag from ${socket.localAddress}: ${flag}`);
                    }

                    this.addFlags(flags, socket);
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

    addFlags(flags, socket){
        flags = flags.map((flag) => new Flag({flag: flag, tcpsocket: socket}));

        if (this.output.status == "READY"){
            this.output.putInQueue(flags);
        } else {
            this.globalQueue = this.globalQueue.concat(flags);
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
                receiverGreetings: config.RECEIVER_GREETINGS,
            },
            tcpServer: {
                host: config.TCP_SOCKET_HOST,
                port: config.TCP_SOCKET_PORT,
            },
            logger: new Logger(config.INFO_LOG, config.DEBUG_LOG),
            flagRegexp: config.FLAG_REGEXP,
        });
    }

    main().catch((err) => console.error(err));
}
