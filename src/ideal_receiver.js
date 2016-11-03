"use strict"

const net = require("net");
const fs = require("fs");
const util = require("util");

const SERVER_HOST = "0.0.0.0";
const SERVER_PORT = 6666;
const FLAG_REGEXP = /\w{31}=/;
const FLAG_LOGFILE= "flags_received.txt";

const not_a_flag = "Is not a flag";
const already_sent = "Already sent";
const good_answers = ["Accepted", "Denied: It is your flag!", "Denied: Too old"];

class FlagReceiver extends net.Server
{
    constructor(port, host, logfile = null){
        super();

        this.logfile = logfile;
        this.received = new Map;
        this.loadFlags();

        this.on("connection", this.handleConnection);

        this.listen({
            host: host,
            port: port,
        }, () => {
            let addr = this.address();
            this.log(`Start listening on ${addr.address} ${addr.port}`);
        });
    }

    loadFlags(){
        this.received = new Map;
        try{
            fs.readFileSync(FLAG_LOGFILE).toString().split("\n").forEach((line) => {
                if (line.length > 0){
                    let A = line.split(" ");
                    this.received.set(A.shift(), A.join(" "));
                }
            });
        } catch(e){
            if (e.code !== "ENOENT"){
                throw e;
            }
            fs.writeFileSync(FLAG_LOGFILE, "");
        }

        fs.watch(FLAG_LOGFILE, {}, (event) => {
            if (event !== "change"){
                this.log(`Reload flags from '${FLAG_LOGFILE}' due to '${event}'`);
                this.loadFlags();
            }
        });
    }

    handleConnection(socket){
        let address = socket.localAddress;

        this.log(`[${address}] connected`);

        socket.on("close", () => {
            this.log(`[${address}] disconnected`);
        });

        let buffer = "";
        socket.on("data", (data) => {
            for (let char of data.toString()) {
                if (char === '\n'){
                    this.processLine(buffer, socket);
                    buffer = '';
                } else {
                    buffer += char;
                }
            };
        });
    }

    processLine(line, socket){
        if (line.length === 0){
            this.log(`[${socket.localAddress}] Goodbye!`);
            socket.write("Goodbye!\n");
            socket.end();
        } else if (FLAG_REGEXP.test(line)) {
            if (!this.received.has(line)){
                let answer = good_answers[Math.floor(Math.random() * good_answers.length)];
                this.answerOnInput(line, answer, socket);
                this.received.set(line, answer);
                fs.appendFileSync(FLAG_LOGFILE, `${line} ${answer}\n`);
            } else {
                this.answerOnInput(line, already_sent, socket);
            }
        } else {
            this.answerOnInput(line, not_a_flag, socket);
        }
    };

    answerOnInput(input, answer, socket){
        socket.write(answer+'\n');
        this.log(`[${socket.localAddress}] ${input} - ${answer}`);
    }

    log(...args){
        let msg = new Date().toISOString() + ": " + util.format(...args);
        console.log(msg);
        if (this.logfile){
            fs.appendFileSync(this.logfile, msg+"\n");
        }
    }
}

if (require.main === module) {
    new FlagReceiver(SERVER_PORT, SERVER_HOST, "receiver.log");
}
