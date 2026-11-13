/// <reference path="../node_modules/forms-angular/dist/client/index.d.ts" />

type AuditObj = {
  c?: string; // collection
  cId?: any; // _id
  chg?: any; // changes (shows old value)
  user?: any;
  op?: string; // Operation
  dets?: any; // any details tha don't fit elsewhere
  ver: number;
  xtra?: any;
};

type IChangeRecord = {
  operation: string;
  user?: any;
  userDesc?: string;
  changedAt: Date;
  oldVersion: number;
  comment?: string;
  chg?: any;
  details?: IChangeDetail[]; // chg described field by field, for display
};

// A value as shown in a change detail.  Objects (such as an added array item) are broken down into labelled fields.
type IChangeValue = {
  value?: any;
  type?: string; // the mongoose instance (String, Date, ObjectId...)
  ref?: string; // the model an ObjectId refers to
  fields?: { label: string; value: any; type?: string; ref?: string }[];
};

type IChangeDetail = {
  path: string; // dotted path, with 1-based item numbers for array items
  label: string; // human-readable field name, e.g. "Contact List #2 Relationship"
  kind: "added" | "removed" | "changed" | "text";
  from?: IChangeValue;
  to?: IChangeValue;
  textDiff?: { op: "=" | "-" | "+"; text: string }[]; // for long strings stored as text diffs
};

interface IItemAuditScope extends fng.IFormScope {
  createDate: Date;
  changes: IChangeRecord[];
  inferCreate: boolean; // If we don't have a create op, we make it up from the date in the _id
  buildHistUrl: (lastPart: string) => string;
  recordDesc?: string;
  formatChangeValue: (val?: IChangeValue) => string;
}

interface IAuditedDocMethods {
  saveNoAudit<T>(this: T): Promise<T>;
  deleteNoAudit<T>(this: T): Promise<T>;
}

interface IFngAuditService {
  getHist: (
    modelName: string,
    id: string,
    histAction: string
  ) => Promise<angular.IHttpResponse<IChangeRecord[]>>;
  getVersion: (
    modelName: string,
    id: string,
    version: string
  ) => Promise<angular.IHttpResponse<any>>;
  checkValidItem: (
    modelName: string,
    id: string
  ) => Promise<angular.IHttpResponse<void>>; // <-- think this should be void, but not certain
}

interface IFngAuditServiceRootScope extends angular.IRootScopeService {
  describeUsers?: (users: { [userId: string]: any; }) => angular.IPromise<{ [userId: string]: string }>;
}