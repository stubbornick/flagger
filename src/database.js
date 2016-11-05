"use strict";

import Datastore from "nedb";
import Flag from "./flag";

class Database
{
    constructor(options = {}){
        this.logger = options.logger || null;

        if (options.file){
            options.filename = options.file,
            options.autoload = true
        }

        this.db = new Datastore(options);
        this.addIndex({ fieldName: "flag", unique: true });
        this.addIndex({ fieldName: "status"});
        this.addIndex({ fieldName: "expired"});
        this.addIndex({ fieldName: "answer"});

        this.nextFlagIndex = undefined;

        this.db.find({}).sort({ _id: -1 }).limit(1).exec((err, flags) => {
            if (flags.length === 1){
                this.nextFlagIndex = flags[0]._id + 1;
            } else {
                this.nextFlagIndex = 1;
            }
        });

        this.acceptedAnswer = options.acceptedAnswer;
    }

    addIndex(options){
        this.db.ensureIndex(options, (err) => {
            if (err){
                this.logger.error(`DATABASE: Error during index creation:\n${err}`);
            }
        });
    }

    findFlag(flagString){
        return new Promise((resolve) => {
            this.db.findOne({ flag: flagString }, (err, flag) => {
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

            let flagsObjects = new Array;
            for (let i=0; i<flags.length; ++i){
                flags[i]._id = this.nextFlagIndex++;
                flagsObjects.push(flags[i].toObject());
            }

            this.db.insert(flagsObjects, (err, insertedFlags) => {
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
            this.db.find({
                $and: [
                    { $not: { status: 'ANSWERED' } },
                    { $not: { status: 'CANCELLED' } },
                    { $not: { expired: true } },
                ]
            }, (err, flags) => {
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
            this.db.update({ flag: flag.flag }, flag.toObject(), (err) => {
                if (err){
                    this.logger.error(`DATABASE: Flag update error:\n${err}`);
                }
                resolve();
            });
        });
    }

    getCount(params){
        return new Promise((resolve,reject) => {
            this.db.count(params, function (err, count) {
                if(err){
                    reject(err);
                }
                resolve(count);
            });
        })
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
        })
    }
}

export default Database;
