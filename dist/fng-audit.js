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
            $scope.userDesc = function (change) {
                return change.user ? ('User:' + change.user) : '';
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
        .service('fngAuditServ', ['$http', function ($http) {
            return {
                getHist: function (modelName, id) {
                    return $http.get('/api/' + modelName + '/' + id + '/history');
                },
                getVersion: function (modelName, id, version) {
                    return $http.get('/api/' + modelName + '/' + id + '/version/' + version);
                }
            };
        }]);
})();

angular.module('fngAuditModule').run(['$templateCache', function($templateCache) {
  'use strict';

  $templateCache.put('templates/base-history.html',
    "<div ng-controller=FngAuditHistCtrl><div ng-class=\"css('rowFluid')\" class=\"page-header list-header\"><div class=header-lhs><h1>History for {{modelName}} {{id}}</h1></div></div><div class=\"page-body list-body\"><error-display></error-display><div ng-class=\"css('rowFluid')\"><a ng-repeat=\"change in changes\" ng-href={{buildHistUrl(change)}}><div class=list-item><div ng-class=\"css('span',12)\">{{ change.comment }} {{ change.op }} {{ change.changedAt }} {{ userDesc(change) }}</div></div></a></div></div></div>"
  );


  $templateCache.put('templates/base-version.html',
    "<div ng-controller=FngAuditVerCtrl><div ng-class=\"css('rowFluid')\" class=\"page-header list-header\"><div class=header-lhs><h1>Version {{ tab }} for {{modelName}} {{id}}</h1></div></div><div class=\"page-body list-body\"><error-display></error-display><div ng-class=\"css('rowFluid')\"><pre>\n" +
    "                {{ version | json }}\n" +
    "            </pre></div></div></div>"
  );

}]);
