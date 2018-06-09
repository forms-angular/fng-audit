(function () {
    'use strict';

    let auditModule :any = angular.module('fngAuditModule', ['formsAngular']);

    auditModule
        .config(['routingServiceProvider', function(routingService: any) {
            routingService.addRoutes(null, [
                {route: '/:model/:id/history', state: 'model::history', templateUrl: 'templates/base-history.html'},
                {route: '/:model/:id/version/:version', state: 'model::version', templateUrl: 'templates/base-version.html'}
                ]);
            routingService.registerAction('history');
            routingService.registerAction('version');
        }])
        .controller('FngAuditHistCtrl', ['$scope','$location','routingService','fngAuditServ', function($scope: any, $location: any, routingService: any, fngAuditServ: any) {

            $scope.changes = [];
            angular.extend($scope, routingService.parsePathFunc()($location.$$path));

            fngAuditServ.getHist($scope.modelName, $scope.id)
                .then(function(results: any) {
                    $scope.changes = results.data;
                }, function(err: any) {
                    console.log(err);
                });

            $scope.buildHistUrl = function(change: any) {
                return change.oldVersion ? routingService.buildUrl($scope.modelName + '/' + $scope.id + '/version/' + change.oldVersion) : '#';
            };

            $scope.userDesc = function(change: any) {
                return change.user ? ('User:' + change.user) : '';
            };

        }])
        .controller('FngAuditVerCtrl', ['$scope','$location','routingService','fngAuditServ', function($scope: any, $location: any, routingService: any, fngAuditServ: any) {
            $scope.record = [];

            angular.extend($scope, routingService.parsePathFunc()($location.$$path));

            fngAuditServ.getVersion($scope.modelName, $scope.id, $scope.tab)
                .then(function(results: any) {
                    $scope.version = results.data;
                }, function(err: any) {
                    console.log(err);
                });

            $scope.buildHistUrl = function(change: any) {
                return routingService.buildUrl($scope.modelName + '/' + $scope.id + '/version/' + change.oldVersion)
            }

        }])
        .service('fngAuditServ', ['$http', function($http : any) {
            return {
                getHist: function(modelName: string, id: string) {
                    return $http.get('/api/' + modelName + '/' + id + '/history');
                },
                getVersion: function(modelName: string, id: string, version: string) {
                    return $http.get('/api/' + modelName + '/' + id + '/version/' + version);
                }
            }
        }]);

})();


