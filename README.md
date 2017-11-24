# fng-audit

Plugin for forms angular that comprises:
* Mongoose plugin to record changes to data on audited collections
* Default views of audit trail data and routes to invoke them

## Usage

    npm install fng-audit

On the server side: 

In the call to create the forms-angular object (normally in the main server express start-up module) add a key of 
*AuditPlugin* as follows:
     
    var fngAudit = require('fng-audit');
    var DataFormHandler = new (formsAngular)(app, {plugins:[
        audit: {
            module: fngAudit.controller
            }
        ]});
    
There are currently no other configuration options.

For the client side:

Routes / Listing Screens / Filters etc

strip, hidden options
'updatedAt','__v'
__noAudit 
errorHandler