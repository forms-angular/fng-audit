/// <reference types="mongoose" />
import * as jsondiffpatch from 'jsondiffpatch';
import * as async from 'async';
import * as Mongoose from "mongoose";
import {DiffPatcher} from "jsondiffpatch";

interface AuditOptions {
    debug?: Boolean;
    errorHandler?: (err: string) => void;
}

interface AuditPluginOptions {
    strip?: Array<string>
    hidden?: Array<string>
}

let mongooseInstance: Mongoose.Mongoose;
let formsAngular: any;
let auditOptions: AuditOptions = {};
export let Audit: any;

export function controller(fng: any, processArgs: (options: any, array: Array<any>) => Array<any>, options: AuditOptions) {
    formsAngular = fng;
    mongooseInstance = formsAngular.mongoose;
    auditOptions = options || {};
    const auditSchema = new Mongoose.Schema({
        c: String,   //collection
        cId: {type: Mongoose.Schema.Types.ObjectId},
        chg: {},
        user: {},  // Taken from _user
        op: String,  // Taken from _op - what operation is being performed?
        ver: Number
    });

    const modelName = 'audit';
    try {
        Audit = mongooseInstance.model(modelName);
    } catch (e) {
        Audit = mongooseInstance.model(modelName, auditSchema);
    }


    fng.app.get.apply(fng.app, processArgs(fng.options, [':model/:id/history', function (req: any, res: any) {
        getAuditTrail(req.params.model, req.params.id, function(err:any, results:any) {
            if (err) {
                res.status(400).send(err);
            } else {
                res.status(200).send(results);
            }
        })
    }]));

    // fng.app.get('/:model/:id/snapshot/:date', function (req: any, res: any) {
    //     res.status(200).send('Hello');
    // });
    //
    fng.app.get.apply(fng.app, processArgs(fng.options, [':model/:id/version/:version', function (req: any, res: any) {
        getVersion(fng.getResource(req.params.model).model, req.params.id, req.params.version, function(err: any, obj: any) {
            if (err) {
                res.status(404).send(err)
            } else {
                res.status(200).send(obj);
            }
        });
    }]));
}

function stripAttribFromObject(attrib: string, object: any) {
    let cur = object;
    let tree = attrib.split('.');
    let last = tree.pop();
    tree.forEach(branch => {if (cur) { cur = cur[branch]}});
    if (cur) {delete cur[last]}
}

export function clean(obj: any, delFunc?: any): any {

    delFunc = delFunc || function(obj: any, key: any) {delete obj[key]};

    for (let key in obj) {
        if (key === '__v') {
            delFunc(obj, key);
        } else {
            if (obj.hasOwnProperty(key) && typeof obj[key] === "object") {
                if (Array.isArray(obj[key])) {
                    if (obj[key].length === 0) {
                        delFunc(obj, key);
                    } else {
                        obj[key].forEach((elm: any, index: number) => {
                            obj[key][index] = clean(obj[key][index], delFunc);
                        });
                    }
                } else {
                    let cleaned = clean(obj[key], delFunc);
                    if (cleaned && Object.keys(cleaned).length > 0) {
                        obj[key] = cleaned;
                    } else {
                        delFunc(obj, key);
                    }
                }
            }
        }
    }
    return obj;
}

export function getAuditTrail(modelName: string, id: string, callback: any) {
    Audit.find({c: modelName, cId: id}).sort({_id: -1}).exec(function (err:any , trail: Array<any>) {
        if (err) { return callback(err);}
        async.map(trail, function (changeRec: any, mapCallback) {
            let changedValues: Array<any> = [];
            let changedFields = [];
            for (let key in changeRec.chg) {
                if (changeRec.chg.hasOwnProperty(key)) {
                    changedFields.push(key);
                }
            }
            let comment: string;
            if (changedFields.length > 0) {
                comment = "modified " + changedFields.concat(changedValues).join(", ");
            } else if (changeRec.op) {
                comment = changeRec.op;
            } else {
                comment = 'Audit entry';
            }
            return mapCallback(null, {
                operation: changeRec.op,
                user: changeRec.user,
                changedAt: formsAngular.extractTimestampFromMongoID(changeRec._id),
                oldVersion: changeRec.ver,
                comment: comment
            })
        }, function (err, output) {
            if (err) {
                console.error(err);
                return callback(err, null);
            }
            return callback(null, output);
        });
    });
}

export function getVersion(model: any, id: any, version: string, callback: any) {
    model.findOne({_id: id}, function (err: any, latest: any) {
        if (err) {
            console.error(err);
            return callback(err, null);
        }
        Audit.find({c: model.modelName, cId: id, ver: {$gte : parseInt(version, 10)}},
            {ver:1, chg: 1}, {sort: "-ver"}, function (err: any, histories: any) {
                if (err) {
                    console.error(err);
                    return callback(err, null);
                }
                let object = latest ? latest.toObject() : {_id: Mongoose.Types.ObjectId(id)};
                async.each(histories, function(history: any, eachCallback){
                    (<any>jsondiffpatch).unpatch(object, history.chg);
                    eachCallback();
                }, function(err){
                    if (err) {
                        console.error(err);
                        return callback(err, null);
                    }
                    callback(null, clean(object));
                });
            })
    });
}

function auditFromObject(doc: any, orig: any, updated:any, options: AuditPluginOptions, next: any) {

    function getPseudoField(name: string): any {
        let retVal;
        if (updated['_' + name]) {
            retVal = updated['_' + name]._id || updated['_' + name];
        } else if (orig['_' + name]) {
            retVal = orig['_' + name]._id || orig['_' + name];
        } else if (orig['__' + name]) {
            retVal = orig['__' + name]._id || orig['__' + name];
            delete orig['__' + name];
        }
        return retVal;
    }

    let user: any = getPseudoField('user');
    let op: any = getPseudoField('op');
    // Remove the stuff you never want to audit
    let stdOrig = clean(JSON.parse(JSON.stringify(orig)));
    let stdUpdated = clean(JSON.parse(JSON.stringify(updated)));
    let suppressedChanges = ['updatedAt','__v'];
    ['strip','hidden'].forEach((prop) => {
        if ((<any>options)[prop] && (<any>options)[prop].length > 0) {
            suppressedChanges = suppressedChanges.concat((<any>options)[prop]);
        }
    });
    suppressedChanges.forEach(attrib => {
        stripAttribFromObject(attrib, stdOrig);
        stripAttribFromObject(attrib, stdUpdated);
    });
    let chg = (<any>jsondiffpatch).diff(stdOrig, stdUpdated);
    if (chg) {
        let c: string = (<any>doc.constructor).modelName;
        let cId = doc._id;
        Audit.findOne({c: c, cId: cId, ver: {$exists: true}}).sort("-ver").exec(function (err:any, prevAudit:any) {
            if (err) {
                return next(err);
            }
            let auditRec: any = {
                c: c,
                cId: cId,
                ver: prevAudit ? prevAudit.ver + 1 : 0,
                chg: chg
            };
            if (user) {auditRec.user = user; }
            if (op) {auditRec.op = op; }
            Audit.create(auditRec, next);
        });
    } else {
        next();
    }
}

function assignPossiblyNested(dest: any, src: any, attrib: string) {
    let tree = attrib.split('.');
    let last = tree.pop();
    let srcVal;
    let cur: any;
    if (typeof src !== "object") {
        // We are assigning a value
        srcVal = src;
    } else {
        // we are copying from an analogous object
        cur = src;
        tree.forEach(branch => {
            if (cur) cur = cur[branch]
        });
        if (cur) {
            srcVal = cur[last]
        }
    }
    if (srcVal) {
        cur = dest;
        tree.forEach(branch => {
            if (!cur[branch]) {
                cur[branch] = {};
            }
            cur = cur[branch];
        });
        cur[last] = srcVal;
    }
}

function auditFromUpdate(docUpdate: any, options: any, next: any) {
    const queryObject = docUpdate;
    const queryOp = queryObject.op;
    queryObject.find(queryObject._conditions, function (err: any, results: any) {
        if (err) {
            return next(err);
        } else {
            let original: any;
            let updated: any;
            async.eachSeries(results, function (currentObject: any, callback) {
                updated = {};
                if (queryOp === 'findOneAndRemove') {
                    original = currentObject;
                } else {
                    original = {};
                    if (queryObject.options && queryObject.options._user) {original.__user = queryObject.options._user;}
                    if (queryObject.options && queryObject.options._op) {original.__op = queryObject.options._op;}
                    Object.keys(queryObject._update).forEach(key => {
                        if (key[0] === '$') {
                            Object.keys(queryObject._update[key]).forEach(attrib => {
                                if (key === '$set') {
                                    assignPossiblyNested(updated, queryObject._update.$set[attrib], attrib)
                                }
                                assignPossiblyNested(original, currentObject, attrib);
                            });
                            switch (key) {
                                case '$set':
                                    // ignore $set - already dealt with
                                    break;
                                case '$push':
                                    Object.keys(queryObject._update[key]).forEach(attrib => {
                                        updated[attrib] = [];
                                        Object.assign(updated[attrib], original[attrib]);
                                        updated[attrib].push(queryObject._update[key][attrib])
                                    });
                                    break;
                                default:
                                    let errMessage = 'No audit trail support for ' + key;
                                    if (auditOptions.errorHandler) {
                                        auditOptions.errorHandler(errMessage);
                                    } else {
                                        console.error(errMessage)
                                    }
                                    break;
                            }
                        } else {
                            // a simple assignment
                            original[key] = currentObject[key];
                            updated[key] = queryObject._update[key];
                        }
                    });
                }
                auditFromObject(currentObject, original, updated, options, function() {
                    callback();
                });
            }, function done() {
                return next();
            });
        }
    });
}

function getHiddenFields(collectionName: string, options: AuditPluginOptions) {
    if (!options.hidden) {
        options.hidden = formsAngular.getResourceFromCollection(collectionName).options.hide;
    }
}

export function plugin(schema: any, options: AuditPluginOptions) {

    options = options || {};
    options.strip = options.strip || [];

    /*
            Document middleware.  "this" is the document
     */
    schema.pre("save", function (next: any) {
        if (this.isNew || this._noAudit) {
            next();
        } else {
            let that = this;
            try {
                getHiddenFields(that.constructor.collection.collectionName, options);
                that.constructor.findOne({_id: that._id}, function(err: any, original: any) {
                    auditFromObject(that, original, that, options, next);
                });
            } catch(e) {
                if (auditOptions.errorHandler) {
                    auditOptions.errorHandler(e.message);
                }
                next();
            }
        }
    });

    schema.pre("remove", function(next: any) {
        if (this._noAudit) {
            next()
        } else {
            try {
                let that = this;
                getHiddenFields(that.constructor.collection.collectionName, options);
                auditFromObject(that, that, {}, options, next);
            } catch(e) {
                if (auditOptions.errorHandler) {
                    auditOptions.errorHandler(e.message);
                }
                next();
            }
        }
    });

    /*
            Query middleware.  "this" is the query
     */

    schema.pre("findOneAndUpdate", function (next: any) {
        if (this.options._noAudit) {
            next();
        } else {
            try {
                getHiddenFields(this.mongooseCollection.collectionName, options);
                auditFromUpdate(this, options, next);
            } catch(e) {
                if (auditOptions.errorHandler) {
                    auditOptions.errorHandler(e.message);
                }
                next();
            }
        }
    });

    schema.pre("update", function (next: any) {
        if (this.options._noAudit) {
            next()
        } else {
            try {
                getHiddenFields(this.mongooseCollection.collectionName, options);
                auditFromUpdate(this, options, next);
            } catch(e) {
                if (auditOptions.errorHandler) {
                    auditOptions.errorHandler(e.message);
                }
                next();
            }

        }
    });

    schema.pre("findOneAndRemove", function (next: any) {
        if (this.options._noAudit) {
            next();
        } else {
            try {
                getHiddenFields(this.mongooseCollection.collectionName, options);
                auditFromUpdate(this, options, next);
            } catch(e) {
                if (auditOptions.errorHandler) {
                    auditOptions.errorHandler(e.message);
                }
                next();
            }
        }
    });

}
