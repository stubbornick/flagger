"use strict";

import { MongoClient } from "mongodb";
import Flag from "./flag";

class Database
{
    constructor({ logger = null, acceptedAnswer = "Accepted" }){
        this.logger = logger;
        this.acceptedAnswer = acceptedAnswer;
        this.db = null;
        this.connection = false;
    }

    async open(url){
        if (this.db || this.connection) {
            throw new Erorr("Database opened twice");
        }

        this.connection = true;

        this.db = await new Promise((resolve, reject) => {
            new MongoClient.connect(url, (error, db) => {
                if (error){
                    reject(error);
                } else {
                    this.logger.info("DATABASE: Connected to MongoDB");
                    resolve(db);
                }
            });
        });

        this.flagsCollection = this.db.collection("flags");

        await this.addIndex({ flag: 1 }, { unique: true });
        await this.addIndex({ status: 1 });
        await this.addIndex({ expired: 1 });
        await this.addIndex({ answer: 1 });
    }

    addIndex(fields, options=null){
        return this.flagsCollection.createIndex(fields, options);
    }

    findFlags(flags){
        if (!Array.isArray(flags)) {
            flags = [flags];
        }

        return new Promise((resolve) => {
            this.flagsCollection.find({ flag: { $in: flags } }).toArray((error, flags) => {
                if (error){
                    this.logger.error(`DATABASE: Flag search error:\n`, error);
                    resolve(null);
                }

                if (flags){
                    resolve(flags.map(x => new Flag(x)));
                } else {
                    resolve([]);
                }
            });
        });
    }

    addFlags(flags){
        return new Promise((resolve, reject) => {
            if (flags.length === 0){
                resolve();
            }

            let flagsObjects = new Array;
            for (let i=0; i<flags.length; ++i){
                flagsObjects.push(flags[i].toObject());
            }

            this.flagsCollection.insertMany(flagsObjects, { ordered: false }, (error) => {
                if (error) {
                    this.logger.error(`DATABASE: Flag insertion error:\n`, error);
                }
                resolve();
            });
        });
    }

    getUnansweredFlags(){
        return new Promise((resolve) => {
            this.flagsCollection.find({
                status: {
                    $nin: ["ANSWERED"]
                },
                expired: false
            }).toArray((error, flags) => {
                if (error) {
                    this.logger.error(`DATABASE: Unanswered flags search error:\n`, error);
                    resolve([]);
                    return;
                }

                resolve(flags.map((flag) => {
                    return new Flag(flag);
                }));
            });
        });
    }

    updateFlags(flags){
        if (flags.length === 0) {
            this.logger.error("DATABASE: Empty 'flags' array sent to update");
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            const operands = flags.map((x) => {
                return {
                    updateOne: {
                        filter: { flag: x.flag },
                        update: {
                            $set: x.toObject()
                        }
                    }
                }
            });

            this.flagsCollection.bulkWrite(operands, { ordered: false }, (error, r) => {
                // console.log(`UPDATE ${flags.length} FLAGS = DONE`);
                if (error) {
                    this.logger.error(`DATABASE: Flags update error:\n`, error);
                }
                resolve();
            });
        });
    }

    getCount(params){
        return this.flagsCollection.count(params);
    }

    getStatistics(){
        return new Promise((resolve, reject) => {
            Promise.all([
                this.getCount({ }),
                this.getCount({ status: "UNSENT" }),
                this.getCount({ status: "SENT" }),
                this.getCount({ status: "ANSWERED" }),
                this.getCount({ answer: this.acceptedAnswer }),
                this.getCount({ expired: true }),
            ]).then(results => {
                let stats = {};
                stats.total = results[0];
                stats.unsent = results[1];
                stats.sent = results[2];
                stats.answered = results[3];
                stats.accepted = results[4];
                stats.expired = results[5];
                resolve(stats);
            }).catch(reject);
        });
    }

    getLastFlagsRaw(count = 100){
        return new Promise((resolve) => {
            this.flagsCollection.find({ }).sort({ date: -1 }).limit(count).toArray((error, flags) => {
                if (error){
                    this.logger.error(`DATABASE: Last flags fetching error:\n`, error);
                    resolve([]);
                    return;
                }

                resolve(flags);
            });
        });
    }

    async close() {
        await this.db.close();
        this.connection = false;
        this.db = null;
        this.logger.info("DATABASE: Connection to MongoDB closed");
    }
}

export default Database;
