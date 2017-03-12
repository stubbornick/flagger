"use strict";

import { MongoClient } from "mongodb";
import Flag from "./flag";

class Database
{
    constructor({ logger = null, acceptedAnswer = "Accepted" }){
        this.logger = logger;
        this.acceptedAnswer = acceptedAnswer;
    }

    async open(url){
        this.db = await new Promise((resolve, reject) => {
            new MongoClient.connect(url, (error, db) => {
                if (error){
                    reject(error);
                } else {
                    this.logger.info("Connected to MongoDB");
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

    findFlag(flagString){
        return new Promise((resolve) => {
            this.flagsCollection.findOne({ flag: flagString }, (err, flag) => {
                if (err){
                    this.logger.error(`DATABASE: Flag search error:\n${err}`);
                    resolve(null);
                }
                if (flag){
                    resolve(new Flag(flag));
                } else {
                    resolve(null);
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

            this.flagsCollection.insertMany(flagsObjects, null, (err, insertedFlags) => {
                if (err){
                    this.logger.error(`DATABASE: Flag insertion error:\n${err}`);
                    reject(err);
                }
                resolve();
            });
        });
    }

    getUnansweredFlags(){
        return new Promise((resolve) => {
            this.flagsCollection.find({
                status: {
                    $nin: ["ANSWERED", "CANCELLED"]
                },
                expired: false
            }).toArray((err, flags) => {
                if (err){
                    this.logger.error(`DATABASE: Unanswered flags search error:\n${err}`);
                    resolve([]);
                    return;
                }

                resolve(flags.map((flag) => {
                    return new Flag(flag);
                }));
            });
        });
    }

    updateFlag(flag){
        return new Promise((resolve) => {
            this.flagsCollection.updateOne({ flag: flag.flag }, flag.toObject(), null, (err) => {
                if (err){
                    this.logger.error(`DATABASE: Flag update error:\n${err}`);
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
            this.flagsCollection.find({ }).sort({ date: -1 }).limit(count).toArray((err, flags) => {
                if (err){
                    this.logger.error(`DATABASE: Last flags fetching error:\n${err}`);
                    resolve([]);
                    return;
                }

                resolve(flags);
            });
        });
    }
}

export default Database;
