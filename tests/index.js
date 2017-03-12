"use strict";

const MongoClient = require("mongodb").MongoClient;
const chai = require("chai");
const net = require("net");
const { assert } = chai;
const EventEmitter = require("events");
const randomstring = require("randomstring");
const defaultsDeep = require("defaults-deep");

const Flagger = require("../lib").default;
const defaultConfig = require("../lib/config").default;
const Logger = require("../lib/log").default;


const RECEIVER_PORT = 6666;

const MONGODB_URL = `mongodb://172.17.0.2:27017/flagger`;
const FLAG_REGEXP = /[\w]{31}=/g;

const DEFAULT_FLAGGER_CONFIG = {
    output: {
        host: "localhost",
        port: RECEIVER_PORT,
        reconnectTimeout: 1000,
        sendPeriod: 1000,
        maxFlagsPerSend: defaultConfig.MAX_FLAGS_PER_SEND,
    },
    flagLifetime: defaultConfig.MAX_FLAG_LIFETIME,
    receiverMessages: defaultConfig.RECEIVER_MESAGES,
    tcpServer: {
        host: defaultConfig.TCP_SERVER_HOST,
        port: defaultConfig.TCP_SERVER_PORT,
    },
    ioServer: {
        host: defaultConfig.IO_SERVER_HOST,
        port: defaultConfig.IO_SERVER_PORT,
    },
    logger: new Logger({ logfile: "tests.log", printDate: "true", consolePrint: false }),
    flagRegexp: defaultConfig.FLAG_REGEXP,
    flagsDatabase: MONGODB_URL,
};


class FlagReceiver extends EventEmitter {
    constructor() {
        super();

        this.socket = new net.Server();
        this.clients = new Set;
        this.flags = new Set;
        this.answer = "Accepted";
    }

    start() {
        this.socket.on("connection", (client) => {
            this.clients.add(client);
            // console.log("RECEIVER CONNECT", client.address());

            client.on("data", (data) => {
                // console.log("REC DATA", data.toString());
                const flags = data.toString().match(FLAG_REGEXP);
                for(let i = 0; i < flags.length; i++) {
                    if (!this.flags.has(flags[i])) {
                        this.flags.add(flags[i]);
                        this.emit("new flag", flags[i]);
                        client.write(this.answer + "\n");
                    }
                }
            });

            client.on("end", () => {
                this.clients.delete(client);
            });
        });

        return new Promise((resolve) => {
            this.socket.listen({ host: "0.0.0.0", port: RECEIVER_PORT }, resolve);
        });
    }

    stop() {
        for (let client of this.clients.keys()) {
            client.destroy();
        }
        return new Promise((resolve) => {
            if (this.socket) {
                this.socket.close(resolve);
            }
        });
    }

    waitForFlags(count = 1) {
        let c = 0;
        return new Promise((resolve) => {
            this.on("new flag", () => {
                c++;
                if (c >= count) {
                    resolve();
                }
            });
        });
    }

    waitForFlagsTotal(count = 1) {
        if (this.flags.size >= count){
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            this.on("new flag", () => {
                if (this.flags.size >= count) {
                    resolve();
                }
            });
        });
    }
}

class Client extends EventEmitter {
    connect({ port = RECEIVER_PORT, host = "localhost" }) {
        if (!this.socket) {
            this.socket = new net.Socket();

            return new Promise((resolve, reject) => {
                this.socket.connect({ host, port }, (error) => {
                    if (error) {
                        reject(error);
                    }
                    resolve();
                });
            });
        } else {
            throw new Error("Already connected");
        }
    }

    send(what) {
        if (Array.isArray(what)) {
            what = what.join("\n") + "\n";
        }

        this.socket.write(what);
    }

    disconnect() {
        this.socket.destroy();
    }
}

function getFlags(count = 1) {
    const f = [];
    for (let i = 0; i < count; i++) {
        f.push(`${randomstring.generate(31)}=`);
    }
    return f;
}

describe("Flagger", () => {
    let flagger;
    let receiver;
    let client;

    before(async () => {
        const db = await new MongoClient.connect(MONGODB_URL);
        await db.dropDatabase();
        await db.close();
    });

    beforeEach(async () => {
        receiver = new FlagReceiver();
        await receiver.start();

        client = new Client();
    });

    afterEach(async () => {
        await receiver.stop();
    });

    it("test FlagReceiver, Client and getFlags()", async () => {
        await client.connect({ port: RECEIVER_PORT });
        await client.send(getFlags(10));
        await receiver.waitForFlagsTotal(10);
    });

    it("simple", async () => {
        flagger = new Flagger(DEFAULT_FLAGGER_CONFIG);
        await flagger.start();
        await client.connect({ port: defaultConfig.TCP_SERVER_PORT });
        client.send(getFlags(100));
        await receiver.waitForFlagsTotal(100);
    }).timeout(10000);
});
