///<reference path="../node_modules/forms-angular/typings/globals/angular/index.d.ts"/>

(function () {
    'use strict';

    let auditModule :any = angular.module('fngAuditModule', ['formsAngular']);

    auditModule.config(['routingServiceProvider', function(routingService: any) {
        routingService.addRoutes(null, [
            {route: '/:model/:id/history', state: 'model::history', templateUrl: 'templates/base-history.html'},
            ]);
    }])
        .controller('FngAuditCtrl', ['$scope','$location','routingService','fngAuditServ',
            function($scope: any, $location: any, routingService: any, fngAuditServ: any) {

            console.log(JSON.stringify(routingService.parsePathFunc()($location.$$path),null,2));
                angular.extend($scope, routingService.parsePathFunc()($location.$$path));
                // fngAuditServ.getHist($location.param)

            }
        ])
        .service('fngAuditServ', function($http : any) {
            return {
                getHist: function(modelName: string, id: string) {
                    return $http.get('/api/' + modelName + '/' + id + '/history');
                }
            }
        });

})();