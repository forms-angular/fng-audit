/// <reference path="../index.d.ts" />

import * as jsondiffpatch from 'jsondiffpatch';
import * as async from 'async';
import * as Mongoose from "mongoose";
import {AsyncResultCallback} from "async";
import {fngServer} from "forms-angular/dist/server";
var cloneDeep = require('lodash.clonedeep');

interface AuditOptions {
    debug?: Boolean;
    errorHandler?: (err: string) => void;
    userRef?: string;   // the collection that the "user" field links to
}

interface AuditPluginOptions {
    strip?: Array<string>
    hidden?: Array<string>
}

let mongooseInstance: Mongoose.Mongoose;
let formsAngular: any;
let auditOptions: AuditOptions = {};
export let Audit: any;

export function controller(fng: any, processArgs: (options: any, array: Array<any>) => Array<any>, options: AuditOptions): Partial<fngServer.IFngPlugin> {
    formsAngular = fng;
    mongooseInstance = formsAngular.mongoose;
    auditOptions = options || {};

    const auditSchema = new Mongoose.Schema({
        c: String,   //collection
        cId: {type: Mongoose.Schema.Types.ObjectId},
        chg: {},
        user: {},  // Taken from _user or __usr
        op: String,  // Taken from _op - what operation is being performed?
        dets: {},
        ver: Number
    });

    const modelName = 'audit';
    try {
        Audit = mongooseInstance.model(modelName);
    } catch (e) {
        Audit = mongooseInstance.model(modelName, auditSchema);
    }

    function getCallback(res: any) {
        return function (err: Error, results: any) {
            if (err) {
                res.status(400).send(err.message);
            } else {
                res.status(200).send(results);
            }
        };
    }

    fng.app.get.apply(fng.app, processArgs(fng.options, [':model/:id/history', function (req: any, res: any) {
        getAuditTrail(fng, req.params.model, req.params.id, {}, getCallback(res))
    }]));

    fng.app.get.apply(fng.app, processArgs(fng.options, [':model/:id/changes', function (req: any, res: any) {
        getAuditTrail(fng, req.params.model, req.params.id,  {chg: {$exists: true}}, getCallback(res))
    }]));

    // Maybe add fng.app.get('/:model/:id/snapshot/:date'...);

    fng.app.get.apply(fng.app, processArgs(fng.options, [':model/:id/version/:version', function (req: any, res: any) {
        const resource = fng.getResource(req.params.model);
        if (resource) {
            getVersion(resource.model, req.params.id, req.params.version, true, getCallback(res));
        } else {
            res.status(404).send(`No such resource as ${req.params.model}`);
        }
    }]));

    let retVal: Partial<fngServer.IFngPlugin> = {};
    if (options.userRef) {
        retVal.dependencyChecks = {
            [options.userRef] : [{
                resource: {
                    resourceName: 'audit',
                    resourceNameLower: 'audit',
                    model: Audit
                },
                keys: ['user']
            }]
        }
    }
    return retVal;
}

function extractPossiblyNestedPath(tree: string[], obj: any): any {
    tree.forEach(branch => {
        if (obj) {
            obj = obj[branch]
        }
    });
    return obj;
}

function stripAttribFromObject(attrib: string, obj: any) {
    let tree = attrib.split('.');
    let last = tree.pop();
    obj = extractPossiblyNestedPath(tree, obj);
    if (obj) {
        delete obj[last]
    }
}

export function clean(obj: any, delFunc?: any): any {

    delFunc = delFunc || function(obj: any, key: any) {delete obj[key]};

    for (let key in obj) {
        if (obj.hasOwnProperty(key)) {
            if (key === '__v') {
                delFunc(obj, key);
            } else {
                if (typeof obj[key] === "object" && !(obj[key] instanceof Date)) {
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
    }
    return obj;
}

export function getAuditTrail(fng: any, modelName: string, id: string, qry: any, callback: any) {
    if (Audit) {
        if (fng.getResource(modelName)) {
            Audit
                .find(Object.assign(qry || {}, { c: modelName, cId: id }))
                .sort({ _id: -1 })
                .exec()
                .then((trail: any[]) => {
                    async.map(trail, function (changeRec: any, mapCallback: AsyncResultCallback<IChangeRecord>) {
                        let retVal: IChangeRecord = {
                            operation: changeRec.op,
                            user: changeRec.user,
                            changedAt: fng.extractTimestampFromMongoID(changeRec._id),
                            oldVersion: changeRec.ver,
                        }
                        let changedValues: Array<any> = [];
                        let changedFields = [];
                        for (let key in changeRec.chg) {
                            if (changeRec.chg.hasOwnProperty(key)) {
                                changedFields.push(key);
                            }
                        }
                        if (changedFields.length > 0) {
                            retVal.comment = "modified " + changedFields.concat(changedValues).join(", ");
                            retVal.chg = changeRec.chg;
                        } else if (changeRec.op) {
                            retVal.comment = changeRec.op;
                        } else {
                            retVal.comment = 'Audit entry';
                        }
                        mapCallback(null, retVal);
                    }, callback);
                })
                .catch((err: Error) => {
                    callback(err);
                });
        } else {
            callback(new Error(`No such resource as ${modelName}`));
        }
    } else {
        // Probably a test
        callback();
    }
}

function getRevision(model: any, id: any, revisionCrit: any, doCleaning: boolean, callback: any) {
    if (Audit) {
        model.findOne({_id: id})
            .then((latest: any) => {
                const criteria = { $and: [ { c: model.modelName }, { cId: id }, { chg: { $exists: true } }, revisionCrit ] };
                const projection = { ver: 1, chg: 1 };
                Audit.find(criteria, projection)
                    .sort("-ver")
                    .then((histories: any) => {
                        let object = latest ? latest.toObject() : { _id: new Mongoose.Types.ObjectId(id) };
                        async.each(histories, function (history: any, eachCallback: () => void) {
                            try {
                                (<any>jsondiffpatch).unpatch(object, history.chg);
                                eachCallback();
                            } catch (e) {
                                callback(new Error(`While unpatching ${model.modelName} ${id} version ${history.ver}: ${e.message}`), null);
                            }
                        }, function (err) {
                            if (err) {
                                console.error(err);
                                return callback(err, null);
                            }
                            callback(null, doCleaning ? clean(object) : object);
                        });
                    })
                    .catch((err: Error) => {
                        console.error(err);
                        return callback(err, null);
                    });
            })
            .catch((err: Error) => {
                return callback(err, null);
            });
    } else {
        callback(null);
    }    
}

export function getVersion(model: any, id: any, version: string, doCleaning: boolean, callback: any) {
    getRevision(model, id, {ver: {$gte: parseInt(version, 10)}}, doCleaning, callback);
}

export function getSnapshot(model: any, id: any, snapshotDt: Date, doCleaning: boolean, callback: any) {
    const dateAsObjectId = new Mongoose.Types.ObjectId(Math.floor(snapshotDt.getTime() / 1000).toString(16) + "0000000000000000");
    getRevision(model, id, { _id: { $gte: dateAsObjectId }}, doCleaning, callback);
}

export function auditAdHocEvent(user: string, description: string, details: any) {
    function cleanKeys( obj: any) {
        if (typeof obj === "object") {
            Object.keys(obj).forEach(k => {
                cleanKeys(obj[k]);
                let safeKey = k.replace(/\./g,'-').replace(/^\$/, '#')
                if (safeKey !== k) {
                    obj[safeKey] = obj[k];
                    delete obj[k];
                }
            })
        }
    }

    const copyDets = cloneDeep(details);
    cleanKeys(copyDets);    // Make sure mongoose doesn't barf on composite keys by putting quotes round them
    return Audit.create({user, op: description, dets: copyDets})
}

function getPseudoField(name: string, updated: any, orig?: any) {
    let retVal;
    if (updated['_' + name]) {
        retVal = updated['_' + name]._id || updated['_' + name];
    } else if (orig && orig['_' + name]) {
        retVal = orig['_' + name]._id || orig['_' + name];
    } else if (orig && orig['__' + name]) {
        retVal = orig['__' + name]._id || orig['__' + name];
        delete orig['__' + name];
    }
    return retVal;
}

function auditFromObject(doc: any, orig: any, updated:any, options: AuditPluginOptions, next: any) {
    if (Audit) {
        let user: any = getPseudoField('user', updated, orig) || getPseudoField('_usr', updated, orig);
        let op: any = getPseudoField('op', updated, orig) || orig.$op;
        // Remove the stuff you never want to audit
        let stdOrig = clean(JSON.parse(JSON.stringify(orig)));
        let stdUpdated = clean(JSON.parse(JSON.stringify(updated)));
        let suppressedChanges = ['updatedAt', '__v'];
        ['strip', 'hidden'].forEach((prop) => {
            if ((<any>options)[prop] && (<any>options)[prop].length > 0) {
                suppressedChanges = suppressedChanges.concat((<any>options)[prop]);
            }
        });
        suppressedChanges.forEach(attrib => {
            stripAttribFromObject(attrib, stdOrig);
            stripAttribFromObject(attrib, stdUpdated);
        });
        /* check for changes in subdocuments where the original appears to be empty */
        for (const key of Object.keys(stdUpdated)) {
            if (stdUpdated[key] && stdOrig[key] === undefined && typeof stdUpdated[key] === 'object') {
                if (Array.isArray(stdUpdated[key])) {
                    stdOrig[key] = [];
                } else {
                    stdOrig[key] = {};
                }
            } 
        }

        let chg = (<any>jsondiffpatch).diff(stdOrig, stdUpdated);
        if (chg) {
            let c: string = (<any>doc.constructor).modelName;
            let cId = doc._id;
            const criteria = {
                c: c,
                cId: cId,
                ver: {$exists: true}
            }
            Audit.findOne(criteria)
                .sort("-ver")
                .exec()
                .then((prevAudit: { ver: number }) => {
                    let auditRec: any = {
                        c: c,
                        cId: cId,
                        ver: prevAudit ? prevAudit.ver + 1 : 0,
                        chg: chg
                    };
                    if (user) {
                        auditRec.user = user;
                    }
                    if (op) {
                        auditRec.op = op;
                    }
                    Audit.create(auditRec)
                        .then(() => {
                            // nothing to do
                        })
                        .catch((err: Error) => {
                            if (err) {
                                console.log(`Error creating audit object: ${err.message}`)
                            }
                        })
                        .finally(() => {
                            next()
                        })
                })
                .catch((err: Error) => {
                    return next(err);    
                });
        } else {
            next();
        }
    } else {
        next();
    }
}

function assignPossiblyNested(dest: any, src: any, attrib: string) {
    let srcVal;
    let cur: any;
    let tree = attrib.split('.');
    let last = tree.pop();
    if (typeof src !== "object") {
        // We are assigning a value
        srcVal = src;
    } else {
        // we are copying from an analogous object
        cur = extractPossiblyNestedPath(tree, src);
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
    if (!Audit) {
        return next();
    } else {
        const queryObject = typeof docUpdate.clone === "function" ? docUpdate.clone() : docUpdate;
        const queryOp = queryObject.op;
        queryObject.find(queryObject._conditions)
            .then((results: any[]) => {
                let original: any;
                let updated: any;
                async.eachSeries(results, function (currentObject: any, callback) {
                    updated = {};
                    if (['findOneAndRemove', 'deleteOne', 'findOneAndDelete'].includes(queryOp)) {
                        original = currentObject;
                    } else {
                        original = {};
                        if (queryObject.options && queryObject.options._user || queryObject.options.__usr) {
                            original.__user = queryObject.options._user || queryObject.options.__usr;
                        }
                        if (queryObject.options && queryObject.options._op) {
                            original.__op = queryObject.options._op;
                        }
                        if (queryObject._update) {
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
                                        case '$unset':
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
                                    // an assignment
                                    assignPossiblyNested(original, currentObject, key);
                                }
                            });
                        }
                    }
                    auditFromObject(currentObject, original, updated, options, function () {
                        callback();
                    });
                }, function done() {
                    return next();
                });
            })
            .catch((err: Error) => {
                return next(err);
            });
    }
}

function getHiddenFields(collectionName: string, options: AuditPluginOptions) {
    if (!options.hidden) {
        // TODO: there is a problem here when doUpdateHandling has the collection name rather than the fng entity name
        // Just using optional chaining for now
        options.hidden = formsAngular?.getResourceFromCollection(collectionName)?.options?.hide;
    }
}

export function plugin(schema: any, options: AuditPluginOptions) {

    options = options || {};
    options.strip = options.strip || [];

    /*
            Document middleware.  "this" is the document
     */
    schema.pre("save", function (next: any) {
        if (this._noAudit || !Audit) {
            next();
        } else if (this.isNew) {
            // No point in auditing if we don't have a user, as the document itself does the job
            let user = getPseudoField('user', this) || getPseudoField('_usr', this);
            if (user) {
                let auditRec: any = {
                    c: (<any>this.constructor).modelName,
                    cId: this._id,
                    op: 'create',
                    user
                };
                Audit.create(auditRec)
                    .then(() => {
                        // nothing to do
                    })
                    .catch((err: Error) => {
                        console.log(`Error creating audit object: ${err.message}`)
                    })
                    .finally(() => {
                        next()
                    });
            } else {
                next();
            }
        } else {
            let that = this;
            try {
                getHiddenFields(that.constructor.collection.collectionName, options);
                that.constructor.findOne({_id: that._id})
                    .then((original: any) => {
                        auditFromObject(that, original, that, options, next);
                    })
                    .catch((err: Error) => {
                        if (auditOptions.errorHandler) {
                            auditOptions.errorHandler(err.message);
                        }
                        next();
                    })
            } catch(e) {
                if (auditOptions.errorHandler) {
                    auditOptions.errorHandler(e.message);
                }
                next();
            }
        }
    });

    schema.pre("remove", function(next: any) {
        if (this._noAudit || !Audit) {
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
    function doUpdateHandling() {
        return function (next: any) {
            if (this.options._noAudit || !Audit) {
                next()
            } else {
                try {
                    getHiddenFields(this.mongooseCollection.collectionName, options);
                    auditFromUpdate(this, options, next);
                } catch (e) {
                    if (auditOptions.errorHandler) {
                        auditOptions.errorHandler(e.message);
                    }
                    next();
                }

            }
        };
    }

    schema.methods.saveNoAudit = function<T extends Mongoose.Document & { _noAudit?: boolean }>(this: T, options?: Mongoose.SaveOptions): Promise<T> {
        this._noAudit = true;
        return this.save(options).then(() => {
          this._noAudit = false;
          return this;
        });
    };

    schema.methods.deleteNoAudit = function<T extends Mongoose.Document & { _noAudit?: boolean }>(this: T): Promise<T> {
        this._noAudit = true;
        if (this.deleteOne) {
            return this.deleteOne();
        } else if ((this as any).remove) {
            return (this as any).remove();
        } else {
            throw new Error("Don't know how to delete a document with this version of Mongoose");
        }
    };

    schema.pre("findOneAndUpdate", doUpdateHandling());

    schema.pre("update", doUpdateHandling());

    schema.pre("updateOne", doUpdateHandling());

    schema.pre("updateMany", doUpdateHandling());

    schema.pre("findOneAndRemove", doUpdateHandling());

    schema.pre("deleteOne", doUpdateHandling());

    schema.pre("findOneAndDelete", doUpdateHandling());

}
