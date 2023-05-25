/// <reference path="../node_modules/forms-angular/dist/client/index.d.ts" />

type AuditObj = {
    c?: string,    // collection
    cId?: any,     // _id
    chg?: any,     // changes (shows old value)
    user?: any,
    op?: string,   // Operation
    dets?: any,    // any details tha don't fit elsewhere
    ver: number
}

type IChangeRecord = {
    operation: string;
    user?: any;
    userDesc?: string;
    changedAt: Date;
    oldVersion: number;
    comment?: string;
    chg? : any;
}

interface IItemAuditScope extends fng.IFormScope {
    createDate: Date;
    changes: IChangeRecord[];
    inferCreate: boolean;   // If we don't have a create op, we make it up from the date in the _id
    buildHistUrl: (lastPart: string) => string;

}

interface IAuditedDocMethods {
  saveNoAudit<T>(this: T): Promise<T>;
  deleteNoAudit<T>(this: T): Promise<T>;
}