"use strict";

const chai = require("chai");
const { assert } = chai;
const net = require("net");
const EventEmitter = require("events");
const fs = require("fs");
const defaultsDeep = require("defaults-deep");
const { MongoClient } = require("mongodb");
const SocketIOClient = require("socket.io-client");

const Flagger = require("../lib").default;
const Logger = require("../lib/log").default;
const defaultConfig = require("../lib/config").default;

const MONGODB_URL = defaultConfig.FLAGS_DATABASE + "-test";
const RECEIVER_PORT = 6666;
const FLAG_REGEXP = /[\w]{31}=/;
const LOGFILE = "tests.log";

const logger = new Logger({ logfile: LOGFILE, printDate: true, consolePrint: false });

const DEFAULT_FLAGGER_CONFIG = {
    output: {
        host: "localhost",
        port: RECEIVER_PORT,
        reconnectTimeout: 1000,
        sendPeriod: 500,
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
    logger,
    flagRegexp: FLAG_REGEXP,
    flagsDatabase: MONGODB_URL
};

const delay = (t) => new Promise((resolve) => setTimeout(resolve, t));

const waitWithTimeout = (p, timeout = 0) => {
    if (timeout) {
        return Promise.race([p, new Promise(resolve => setTimeout(() => resolve("TIMEOUT"), timeout))]);
    }
    return p;
}

const getFlags = (() => {
    let i = 1;

    return (count = 1, base = null) => {
        const f = [];

        for(let j = 0; j < count; j++) {
            const istr = i.toString();
            f.push("0".repeat(31 - istr.length) + istr + "=");
            i++;
        }

        return f;
    };
})();


class FlagReceiver extends EventEmitter {
    constructor() {
        super();

        this.socket = new net.Server();
        this.clients = new Set();
        this.flags = new Set();
        this.answer = "Accepted";
        this.linesReceived = 0;
        this.flagRegexp = FLAG_REGEXP;
        // if (!this.flagRegexp.flags.includes("g")) {
        //     this.flagRegexp = RegExp(this.flagRegexp, "g");
        // }
    }

    wipe() {
        this.flags = new Set();
        this.linesReceived = 0;
    }

    start() {
        this.socket.on("connection", (client) => {
            this.clients.add(client);
            // console.log("RECEIVER CONNECT", client.address());

            let inputBuffer = "";

            client.on("data", (data) => {
                // console.log("REC DATA", data.toString());
                data = inputBuffer + data.toString();

                const lines = data.split("\n");
                const last = lines.pop();

                for(let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    this.linesReceived++;

                    if (this.flagRegexp.test(line)) {
                        this.emit("flag", line);

                        if (!this.flags.has(line)) {
                            this.flags.add(line);
                            this.emit("new flag", line);
                            if (typeof this.answer === "string") {
                                client.write(this.answer + "\n");
                            } else if (typeof this.answer === "function") {
                                let res = this.answer(line);
                                if (res) {
                                    client.write(res + "\n");
                                }
                            }
                        } else {
                            client.write("Is already sent\n");
                        }
                    }
                }

                if (last.length > 0) {
                    inputBuffer = last;
                } else {
                    inputBuffer = "";
                }
            });

            client.on("end", () => {
                this.clients.delete(client);
            });
        });

        return new Promise((resolve) => {
            this.socket.listen({ host: "0.0.0.0", port: RECEIVER_PORT }, () => {
                logger.debug("RECEIVER: started");
                resolve();
            });
        });
    }

    stop() {
        for (let client of this.clients.keys()) {
            client.destroy();
        }
        this.clients = new Set();

        this.socket.removeAllListeners();
        return new Promise((resolve) => {
            if (this.socket) {
                this.socket.close(() => {
                    logger.debug("RECEIVER: stopped");
                    resolve();
                });
            }
        });
    }

    waitForFlags(count = 1, timeout) {
        logger.debug("RECEIVER: waitForFlags", count, timeout);

        let c = 0;
        const p = new Promise((resolve) => {
            this.on("flag", () => {
                c++;
                if (c >= count) {
                    resolve();
                }
            });
        });
        return waitWithTimeout(p, timeout);
    }

    waitForNewFlags(count = 1, timeout) {
        logger.debug("RECEIVER: waitForNewFlags", count, timeout);

        let c = 0;
        const p = new Promise((resolve) => {
            this.on("new flag", () => {
                c++;
                if (c >= count) {
                    resolve();
                }
            });
        });
        return waitWithTimeout(p, timeout);
    }

    waitForFlagsTotal(count = 1, timeout) {
        logger.debug("RECEIVER: waitForFlagsTotal", count, timeout);

        if (this.flags.size >= count){
            return Promise.resolve();
        }

        const p = new Promise((resolve) => {
            this.on("new flag", () => {
                if (this.flags.size >= count) {
                    resolve();
                }
            });
        });
        return waitWithTimeout(p, timeout);
    }

    waitForAnyConnection(timeout) {
        logger.debug("RECEIVER: waitForAnyConnection", timeout);

        const p = new Promise((resolve) => {
            if (this.clients.size > 0){
                resolve();
            } else {
                this.socket.on("connection", () => {
                    resolve();
                })
            }
        });

        return waitWithTimeout(p, timeout);
    }
}

class Client extends EventEmitter {
    constructor() {
        super();
        this.answers = new Set();
        this.linesReceived = 0;
    }

    connect({ port = RECEIVER_PORT, host = "localhost" }) {
        if (!this.socket) {
            this.socket = new net.Socket();

            return new Promise((resolve, reject) => {
                this.socket.connect({ host, port }, (error) => {
                    if (error) {
                        reject(error);
                    }

                    this.socket.on("close", () => {
                        this.socket = null;
                    });

                    let inputBuffer = "";

                    this.socket.on("data", (data) => {
                        fs.appendFile("client.log", "RAW: "+data.toString()+"\n", (e) => e && console.error(e));
                        data = inputBuffer + data.toString();

                        const lines = data.split("\n");
                        const last = lines.pop();

                        for (let i = 0; i < lines.length; i++) {
                            const line = lines[i];
                            this.linesReceived++;

                            if (line.includes("Answer:") || line.includes("already in DB")) {
                                this.answers.add(line);
                                this.emit("answer", line);
                                fs.appendFile("client.log", "ANS: "+line+"\n", (e) => e && console.error(e));
                            }
                        }

                        if (last.length > 0) {
                            inputBuffer = last;
                        } else {
                            inputBuffer = "";
                        }
                    });

                    resolve();
                });
            });
        } else {
            throw new Error("Already connected");
        }
    }

    send(what) {
        let countMsg;
        if (Array.isArray(what)) {
            countMsg = `${what.length} flags`;
            what = what.join("\n") + "\n";
        } else {
            countMsg = `${what.length} chars`;
        }

        this.socket.write(what, () => {
            logger.info(`CLIENT: Write ${countMsg} to socket`);
        });
    }

    waitForAnswers(count, timeout) {
        logger.debug("CLIENT: waitForAnswers", count, timeout);

        let c = 0;
        const p = new Promise((resolve) => {
            this.on("answer", () => {
                c++;
                if (c >= count) {
                    resolve();
                }
            });
        });
        return waitWithTimeout(p, timeout);
    }

    waitForAnswersTotal(count = 1, timeout) {
        logger.debug("CLIENT: waitForAnswersTotal", count, timeout);

        if (this.answers.size >= count){
            return Promise.resolve();
        }

        const p = new Promise((resolve) => {
            this.on("answer", () => {
                if (this.answers.size >= count) {
                    resolve();
                }
            });
        });
        return waitWithTimeout(p, timeout);
    }

    disconnect() {
        this.socket.destroy();
    }
}

class IOClient extends EventEmitter {
    constructor() {
        super();
        this.updates = 0;
        this.linesReceived = 0;
    }

    connect({ port = RECEIVER_PORT, host = "localhost" }) {
        if (!this.socket) {
            this.socket = new SocketIOClient.connect(`http://${host}:${port}/`);

            return new Promise((resolve, reject) => {
                this.socket.once("connect", () => {
                    this.socket.on("disconnect", () => {
                        this.socket = null;
                    });

                    this.socket.on("update", (data) => {
                        this.updates++;
                    });

                    resolve();
                });
            });
        } else {
            throw new Error("Already connected");
        }
    }

    send(what, callback=null) {
        let countMsg;
        if (Array.isArray(what)) {
            countMsg = `${what.length} flags`;
            what = {
                command: "flags",
                data: what.join(",") + "\n"
            }
        } else if (typeof what === "object") {
            countMsg = `${Object.keys(what).length} chars`;
        }

        return new Promise((resolve) => {
            this.socket.emit("command", what, (result) => {
                if (what.command === "flags") {
                    if (result === "OK") {
                        logger.info(`IO CLIENT: Emit ${countMsg}`);
                    } else {
                        throw new Error(`Unknown answer from server: '${answer}'`);
                    }
                }
                resolve(result);
            });
        });
    }

    waitForUpdates(count, timeout) {
        logger.debug("IO CLIENT: waitForUpdates", count, timeout);

        let c = 0;
        const p = new Promise((resolve) => {
            this.socket.on("update", () => {
                c++;
                if (c >= count) {
                    resolve();
                }
            });
        });
        return waitWithTimeout(p, timeout);
    }

    waitForUpdatesTotal(count = 1, timeout) {
        logger.debug("IO CLIENT: waitForUpdatesTotal", count, timeout);

        if (this.updates >= count){
            return Promise.resolve();
        }

        const p = new Promise((resolve) => {
            this.socket.on("update", () => {
                if (this.updates >= count) {
                    resolve();
                }
            });
        });
        return waitWithTimeout(p, timeout);
    }

    disconnect() {
        this.socket.disconnect();
    }
}


describe("Flagger", function () {
    let flagger;
    let receiver;
    let client;
    this.timeout(5000);

    const cleanDatabase = async () => {
        const db = await new MongoClient.connect(MONGODB_URL);
        await db.dropDatabase();
        await db.close();
    };

    before(() => {
        try {
            fs.unlinkSync(LOGFILE);
        } catch(e) {
            // swallow
        }
        try {
            fs.unlinkSync("client.log");
        } catch(e) {
            // swallow
        }
    });

    beforeEach(async function() {
        logger.debug(`Next test: '${this.currentTest.title}'`);

        receiver = new FlagReceiver();
        await receiver.start();

        client = new Client();
    });

    afterEach(async function() {
        await receiver.stop();
        if (flagger && flagger.state === "run") {
            await flagger.stop();
        }

        const msg = `Test '${this.currentTest.title}' ${this.currentTest.state}. Stats:\n` +
            `\tRECEIVER: ${receiver.flags.size} flags\n` +
            `\tCLIENT: ${client.answers.size} answers\n` +
            `\tCLIENT: ${client.answers.size} lines`;
        logger.info(msg);
        fs.appendFile("client.log", msg+"\n", (e) => e && console.error(e));
    });

    describe("Unit-tests", () => {
        beforeEach(async () => {
            await cleanDatabase();
        });

        it("basic test for FlagReceiver, Client and getFlags()", async () => {
            await client.connect({ port: RECEIVER_PORT });
            await client.send(getFlags(10));
            await receiver.waitForFlagsTotal(10);
        });

        it("receiver don't count duplicates", async () => {
            await client.connect({ port: RECEIVER_PORT });

            const first = getFlags(10)
            await client.send(first);
            await receiver.waitForFlagsTotal(10);

            const p = receiver.waitForFlags(10);
            await client.send(first);
            await p;
            assert.equal(receiver.flags.size, 10);
        });

        it("start and stop", async () => {
            flagger = new Flagger(DEFAULT_FLAGGER_CONFIG);
            let s = flagger.start();
            await Promise.all([s, receiver.waitForAnyConnection()]);
            await client.connect({ port: DEFAULT_FLAGGER_CONFIG.tcpServer.port });
            await flagger.stop();

            // Should throw if last flagger not free any resource
            flagger = new Flagger(DEFAULT_FLAGGER_CONFIG);
            s = flagger.start();
            await Promise.all([s, receiver.waitForAnyConnection()]);
            await client.connect({ port: DEFAULT_FLAGGER_CONFIG.tcpServer.port });
            await flagger.stop();
        })

        it("simple", async () => {
            flagger = new Flagger(DEFAULT_FLAGGER_CONFIG);
            await flagger.start();
            await client.connect({ port: DEFAULT_FLAGGER_CONFIG.tcpServer.port });
            client.send(getFlags(10));
            await receiver.waitForFlagsTotal(10);
            await client.waitForAnswersTotal(10);
            await flagger.stop();
        });

        it("1K flags", async () => {
            flagger = new Flagger(DEFAULT_FLAGGER_CONFIG);
            await flagger.start();
            await client.connect({ port: DEFAULT_FLAGGER_CONFIG.tcpServer.port });
            client.send(getFlags(1000));
            await receiver.waitForFlagsTotal(1000);
            await client.waitForAnswersTotal(1000);
            await flagger.stop();
        });

        it("get rid of duplicates", async () => {
            flagger = new Flagger(DEFAULT_FLAGGER_CONFIG);
            await flagger.start();
            await client.connect({ port: DEFAULT_FLAGGER_CONFIG.tcpServer.port });

            const flags = getFlags(1000);
            client.send(flags);
            await receiver.waitForFlagsTotal(1000);

            client.send(flags);
            assert.equal(await receiver.waitForFlags(1000, 1000), "TIMEOUT");
            await client.waitForAnswersTotal(2000);
            assert.equal(receiver.flags.size, receiver.linesReceived);
            await flagger.stop();
        });

        describe("unstable receiver", () => {
            it("keep flags until receiver up", async () => {
                flagger = new Flagger(DEFAULT_FLAGGER_CONFIG);
                await flagger.start();
                await client.connect({ port: DEFAULT_FLAGGER_CONFIG.tcpServer.port });

                await receiver.stop();
                await client.send(getFlags(100));
                await delay(500);
                assert.equal(client.answers.size, 0);

                await receiver.start();
                await receiver.waitForFlagsTotal(100);
                await client.waitForAnswersTotal(100);
            });

            it("persistent store flags + stop() wait for flags processing", async () => {
                flagger = new Flagger(DEFAULT_FLAGGER_CONFIG);
                await flagger.start();
                await client.connect({ port: DEFAULT_FLAGGER_CONFIG.tcpServer.port });

                await receiver.stop();
                await client.send(getFlags(100));
                await new Promise((resolve) => [...flagger.tcpClients.keys()][0].once("data", resolve));
                await flagger.stop();

                await receiver.start();
                await flagger.start();

                await receiver.waitForFlagsTotal(100);
            });

            it("resend unanswered flags", async () => {
                flagger = new Flagger(DEFAULT_FLAGGER_CONFIG);
                await flagger.start();
                await client.connect({ port: DEFAULT_FLAGGER_CONFIG.tcpServer.port });

                receiver.answer = null;
                client.send(getFlags(100));
                await receiver.waitForFlagsTotal(100);

                await receiver.stop();
                receiver = new FlagReceiver();
                await receiver.start();

                await receiver.waitForFlagsTotal(100);
                await client.waitForAnswersTotal(100);
            });

            describe("bad answers", () => {
                let accepted;

                const flaggerConfig = defaultsDeep({
                    output: { resendTimeout: 100 },
                    receiverMessages: { badAnswers: ["Bad answer"] }
                }, DEFAULT_FLAGGER_CONFIG);

                function badAnswer(flag) {
                    return "Bad answer";
                }
                function accept(flag) {
                    accepted++;
                    return "Accepted";
                }

                beforeEach(() => {
                    accepted = 0;
                });

                it("simple resend", async () => {
                    flagger = new Flagger(flaggerConfig);
                    await flagger.start();
                    await client.connect({ port: DEFAULT_FLAGGER_CONFIG.tcpServer.port });

                    receiver.answer = badAnswer;
                    client.send(getFlags(50));
                    await receiver.waitForFlagsTotal(50);

                    receiver.answer = accept;
                    receiver.wipe();
                    await receiver.waitForFlagsTotal(50);
                    assert.equal(accepted, 50);
                });

                it("resend after reconnect", async () => {
                    flagger = new Flagger(flaggerConfig);
                    await flagger.start();
                    await client.connect({ port: DEFAULT_FLAGGER_CONFIG.tcpServer.port });

                    receiver.answer = badAnswer;
                    client.send(getFlags(50));
                    await receiver.waitForFlagsTotal(50);
                    await receiver.stop();

                    receiver.answer = accept;
                    receiver.wipe();
                    receiver.start();
                    await receiver.waitForFlagsTotal(50);
                    assert.equal(accepted, 50);
                });
            });
        });

        describe("TCP Commands", () => {
            describe("drop", () => {
                it("drop after send", async () => {
                    flagger = new Flagger(DEFAULT_FLAGGER_CONFIG);
                    await flagger.start();
                    await client.connect({ port: DEFAULT_FLAGGER_CONFIG.tcpServer.port });

                    receiver.answer = null;
                    client.send(getFlags(100));
                    await receiver.waitForFlagsTotal(100);

                    await client.send("drop\n");
                    receiver.answer = "Accepted";
                    receiver.wipe();

                    client.send(getFlags(100));
                    await client.waitForAnswersTotal(100);
                    assert.equal(receiver.flags.size, 100);
                    assert.equal(client.answers.size, 100);
                });

                it("drop when output lost connection", async () => {
                    flagger = new Flagger(DEFAULT_FLAGGER_CONFIG);
                    await flagger.start();
                    await client.connect({ port: DEFAULT_FLAGGER_CONFIG.tcpServer.port });

                    receiver.answer = null;
                    client.send(getFlags(100));
                    await receiver.waitForFlagsTotal(100);

                    await receiver.stop();
                    await client.send("drop\n");

                    receiver = new FlagReceiver();
                    await receiver.start();

                    client.send(getFlags(100));
                    await client.waitForAnswersTotal(100);
                    assert.equal(receiver.flags.size, 100);
                    assert.equal(client.answers.size, 100);
                });
            });
        });

        describe("Socket.IO", () => {
            let ioClient;

            beforeEach(() => {
                ioClient = new IOClient();
            });

            afterEach(async () => {
                await ioClient.disconnect();
            });

            it("flags", async () => {
                flagger = new Flagger(DEFAULT_FLAGGER_CONFIG);
                await flagger.start();
                await ioClient.connect({ port: DEFAULT_FLAGGER_CONFIG.ioServer.port });

                ioClient.send(getFlags(100));
                await receiver.waitForFlagsTotal(100);
            });

            it("get_last_flags", async () => {
                flagger = new Flagger(DEFAULT_FLAGGER_CONFIG);
                await flagger.start();
                await ioClient.connect({ port: DEFAULT_FLAGGER_CONFIG.ioServer.port });

                ioClient.send(getFlags(50));
                await receiver.waitForFlagsTotal(50);

                receiver.answer = null;
                ioClient.send(getFlags(50));
                await receiver.waitForFlagsTotal(100);

                const flags = await ioClient.send({command: "get_last_flags"});
                let [sent, answered] = [0, 0];
                flags.forEach(x => x.status === "SENT" ? sent++ : answered++);
                assert.equal(sent, 50);
                assert.equal(answered, 50);
            });

            it("update", async () => {
                const getUpdate = () => {
                    return new Promise((resolve) => {
                        ioClient.socket.once("update", flags => {
                            resolve(flags[0]);
                        });
                    });
                };

                flagger = new Flagger(DEFAULT_FLAGGER_CONFIG);
                await flagger.start();
                await receiver.stop();
                await client.connect({ port: DEFAULT_FLAGGER_CONFIG.tcpServer.port });
                await ioClient.connect({ port: DEFAULT_FLAGGER_CONFIG.ioServer.port });

                client.send(getFlags(1));
                let f = await getUpdate();
                assert.equal(f.status, "UNSENT");

                receiver.answer = null;
                receiver.start();
                f = await getUpdate();
                assert.equal(f.status, "SENT");
                assert.equal(f.expired, false);
                await receiver.waitForFlagsTotal(1);

                client.send("drop\n");
                f = await getUpdate();
                assert.equal(f.status, "SENT");
                assert.equal(f.expired, true);

                client.send(getFlags(1));
                f = await getUpdate();
                assert.equal(f.status, "UNSENT");
                f = await getUpdate();
                assert.equal(f.status, "SENT");
                [...receiver.clients.keys()][0].write("Cool flag!\n");
                f = await getUpdate();
                assert.equal(f.status, "ANSWERED");
                assert.equal(f.answer, "Cool flag!");
            });
        });
    });

    describe("High-Load", function () {
        this.timeout(60000);
        const logger = new Logger({ logfile: LOGFILE, printDate: true, consolePrint: false });

        const highLoadConfig = defaultsDeep({
            output: {
                sendPeriod: 0,
                maxFlagsPerSend: 0
            },
            logger
        }, DEFAULT_FLAGGER_CONFIG);

        before(async () => {
            await cleanDatabase();
        });

        after(async () => {
            await cleanDatabase();
        });

        for (let i = 1; i <= 3; i++) {
            it(`${i} pack(s) by 10K flags`, async () => {
                flagger = new Flagger(highLoadConfig);
                await flagger.start();
                await client.connect({ port: DEFAULT_FLAGGER_CONFIG.tcpServer.port });

                for(let j = 1; j <= i; j++) {
                    client.send(getFlags(10000));
                    // console.log("FLAGS", j*10000);
                    await receiver.waitForFlagsTotal(j*10000);
                    // console.log("ANSWERS", j*10000);
                    await client.waitForAnswersTotal(j*10000);
                }
            });
        }

        it("20K flags + 20K duplicates", async () => {
            flagger = new Flagger(highLoadConfig);
            await flagger.start();
            await client.connect({ port: DEFAULT_FLAGGER_CONFIG.tcpServer.port });


            const firstFlags = getFlags(10000);
            client.send(firstFlags);
            flagger.logger.debug("First pack sending");
            await receiver.waitForFlagsTotal(10000);

            const secondFlags = getFlags(10000);
            client.send(secondFlags);
            flagger.logger.debug("Second pack sending");
            await receiver.waitForFlagsTotal(20000);
            await client.waitForAnswersTotal(20000);

            const duplicates = firstFlags.concat(secondFlags);

            client.send(duplicates);
            flagger.logger.debug("Duplicates sending");
            await client.waitForAnswers(duplicates.length);
            assert.equal(receiver.flags.size, 20000);
            assert.equal(receiver.linesReceived, 20000);

            await flagger.stop();
        });

        const FLAGS_PER_SECOND = 1000;
        const ROUNDS = 5;

        it(`${FLAGS_PER_SECOND} flags per second`, async () => {
            flagger = new Flagger(highLoadConfig);
            await flagger.start();
            await client.connect({ port: DEFAULT_FLAGGER_CONFIG.tcpServer.port });

            // warming-up
            await client.send(getFlags(1000));
            await client.waitForAnswersTotal(1000);

            for (let i = 0; i < ROUNDS; i++) {
                await client.send(getFlags(FLAGS_PER_SECOND));
                const r = await receiver.waitForFlagsTotal(1000 + (i+1) * FLAGS_PER_SECOND, 1000);
                assert.notEqual(r, "TIMEOUT", `on ${i+1} pack`);
            }

            await client.waitForAnswersTotal(1000 + ROUNDS * FLAGS_PER_SECOND);

            await flagger.stop();
        });
    });
});
