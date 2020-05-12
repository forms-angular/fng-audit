(function () {
    'use strict';

    let auditModule :any = angular.module('fngAuditModule', ['formsAngular']);

    auditModule
        .config(['routingServiceProvider', function(routingService: any) {
            routingService.addRoutes(null, [
                { route: '/:model/:id/history', state: 'model::history', templateUrl: 'templates/base-history.html' },
                { route: '/:model/:form/:id/history', state: 'model::history', templateUrl: 'templates/base-history.html' },
                { route: '/:model/:id/changes', state: 'model::history', templateUrl: 'templates/base-history.html' },
                { route: '/:model/:form/:id/changes', state: 'model::history', templateUrl: 'templates/base-history.html' },
                { route: '/:model/:id/version/:version', state: 'model::version', templateUrl: 'templates/base-version.html' },
                { route: '/:model/:form/:id/version/:version', state: 'model::version', templateUrl: 'templates/base-version.html' }
                ]);
            routingService.registerAction('history');
            routingService.registerAction('changes');
            routingService.registerAction('version');
        }])
        .controller('FngAuditHistCtrl', ['$scope','$location','routingService','fngAuditServ', function($scope: any, $location: any, routingService: any, fngAuditServ: any) {
            $scope.changes = [];
            const path = $location.path();
            angular.extend($scope, routingService.parsePathFunc()(path));
            const modelAndForm = `${$scope.modelName}${$scope.formName ? `/${$scope.formName}` : ''}`;
            $scope.createDate = new Date( parseInt( $scope.id.toString().substring(0,8), 16 ) * 1000 ).toISOString();
            fngAuditServ.getHist($scope.modelName, $scope.id, path.split('/').slice(-1)[0])
                .then(function(results: any) {
                    $scope.changes = results.data;
                    if ($scope.changes.length > 0) {
                        if ($scope.changes[$scope.changes.length-1].operation !== 'create') {
                            $scope.inferCreate = true;
                        }
                        let lastURL = 'view';
                        $scope.changes.forEach((c: any) => {
                            c.url = lastURL;
                            if (typeof c.oldVersion !== "undefined") {
                                lastURL = 'version/' + c.oldVersion;
                            }
                        })
                    } else {
                        fngAuditServ.checkValidItem($scope.modelName, $scope.id)
                            .then(() => {$scope.inferCreate = true});
                    }
                }, function(err: any) {
                    $scope.errorVisible = true;
                    $scope.alertTitle = err.statusText;
                    $scope.errorMessage = err.data;
                });
            $scope.lastURL = '';

            $scope.buildHistUrl = function(lastPart: string) {
                return routingService.buildUrl(`${modelAndForm}/${$scope.id}/${lastPart}`);
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
                    // Check for a generated version 0 of a non existent item
                    if ($scope.tab === '0' && Object.keys(results.data).length === 1) {
                        $scope.errorVisible = true;
                        $scope.alertTitle = 'Error';
                        $scope.errorMessage = `No such ${$scope.modelName} as ${$scope.id}`;
                    } else {
                        $scope.version = results.data;
                    }
                }, function(err: any) {
                    $scope.errorVisible = true;
                    $scope.alertTitle = err.statusText;
                    $scope.errorMessage = err.data;
                });

            $scope.buildHistUrl = function(change: any) {
                return routingService.buildUrl($scope.modelName + '/' + $scope.id + '/version/' + change.oldVersion)
            }

        }])
        .service('fngAuditServ', ['$http', function($http : any) {
            return {
                getHist: function(modelName: string, id: string, histAction = 'history') {
                    return $http.get(`/api/${modelName}/${id}/${histAction}`);
                },
                getVersion: function(modelName: string, id: string, version: string) {
                    return $http.get(`/api/${modelName}/${id}/version/${version}`);
                },
                checkValidItem: function(modelName: string, id: string) {
                    return $http.get(`/api/${modelName}/${id}`);
                }
            }
        }]);

})();

