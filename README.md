# fng-audit

Plugin for forms angular that comprises:
* Mongoose plugin to record changes to data on audited collections
* Default views of audit trail data and routes to invoke them

## Usage

    npm install fng-audit

### On the server side:

In the call to create the forms-angular object (normally in the main server express start-up module) pass the plugin controller as follows:
     
    var fngAudit = require('fng-audit');

    var DataFormHandler = new (formsAngular)(app,
        {
            plugins:[
                fngAudit: { plugin: fngAudit.controller, options: {} }
            ]
        }
    );
    
Valid options:

**errorHandler** : *function(err: string) : void* - a function to be called in the event of an error occuring within the server side of the audit plugin.

To enable auditing for a schema MySchema:

    var fngAudit = require('fng-audit');
    MySchema.plugin(fngAudit.plugin, {});
    MyModel = mongoose.model('modelName', MySchema);

Valid options

**strip** : *Array<string>* - an array of fields (or nested.fields) that are to be suppressed from the audit changes.  Hidden fields are automatically suppressed, as are updatedAt and __v

Behaviour of the plugin can be modified by adding pseudo fields to the document (in the case of save or remove middleware) or to the query options (in the case of findOneAndUpdate, update or findOneAndRemove middlewares) as follows:

**_noAudit** suppress the audit entry if true

**_user** add the _id property of this value (if present) or the value itself as the user field of the Audit record

**_op** add the value of this property as the op field of the Audit record (for noting the operation that caused the change)

### On the client side:

    <script src="fng-audit/dist/client/fng-audit.js"></script>

Add **fngAuditModule** to your app's list of services.

The following client side routes are added:

`/<model>/<id>/history` displays a screen showing all the audited updates to a document
`/<model>/<id>/version/<version>` recreates the value of the specified version of the item and displays it in JSON format