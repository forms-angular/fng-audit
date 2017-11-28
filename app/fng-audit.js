///<reference path="../node_modules/forms-angular/typings/globals/angular/index.d.ts"/>
(function () {
    'use strict';
    var auditModule = angular.module('fngAuditModule', ['formsAngular']);
    auditModule
        .config(['routingServiceProvider', function (routingService) {
            routingService.addRoutes(null, [
                { route: '/:model/:id/history', state: 'model::history', templateUrl: 'templates/base-history.html' },
                { route: '/:model/:id/version/:version', state: 'model::version', templateUrl: 'templates/base-version.html' }
            ]);
            routingService.registerAction('history');
            routingService.registerAction('version');
        }])
        .controller('FngAuditHistCtrl', ['$scope', '$location', 'routingService', 'fngAuditServ', function ($scope, $location, routingService, fngAuditServ) {
            $scope.changes = [];
            angular.extend($scope, routingService.parsePathFunc()($location.$$path));
            fngAuditServ.getHist($scope.modelName, $scope.id)
                .then(function (results) {
                $scope.changes = results.data;
            }, function (err) {
                console.log(err);
            });
            $scope.buildHistUrl = function (change) {
                return routingService.buildUrl($scope.modelName + '/' + $scope.id + '/version/' + change.oldVersion);
            };
        }])
        .controller('FngAuditVerCtrl', ['$scope', '$location', 'routingService', 'fngAuditServ', function ($scope, $location, routingService, fngAuditServ) {
            $scope.record = [];
            angular.extend($scope, routingService.parsePathFunc()($location.$$path));
            fngAuditServ.getVersion($scope.modelName, $scope.id, $scope.tab)
                .then(function (results) {
                $scope.version = results.data;
            }, function (err) {
                console.log(err);
            });
            $scope.buildHistUrl = function (change) {
                return routingService.buildUrl($scope.modelName + '/' + $scope.id + '/version/' + change.oldVersion);
            };
        }])
        .service('fngAuditServ', function ($http) {
        return {
            getHist: function (modelName, id) {
                return $http.get('/api/' + modelName + '/' + id + '/history');
            },
            getVersion: function (modelName, id, version) {
                return $http.get('/api/' + modelName + '/' + id + '/version/' + version);
            }
        };
    });
})();
