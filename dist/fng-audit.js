///<reference path="../node_modules/forms-angular/typings/globals/angular/index.d.ts"/>
(function () {
    'use strict';
    var auditModule = angular.module('fngAuditModule', ['formsAngular']);
    auditModule.config(['routingServiceProvider', function (routingService) {
            routingService.addRoutes(null, [
                { route: '/:model/:id/history', state: 'model::history', templateUrl: 'templates/base-history.html' },
            ]);
        }])
        .controller('FngAuditCtrl', ['$scope', '$location', 'routingService', 'fngAuditServ',
        function ($scope, $location, routingService, fngAuditServ) {
            console.log(JSON.stringify(routingService.parsePathFunc()($location.$$path), null, 2));
            angular.extend($scope, routingService.parsePathFunc()($location.$$path));
            // fngAuditServ.getHist($location.param)
        }
    ])
        .service('fngAuditServ', function ($http) {
        return {
            getHist: function (modelName, id) {
                return $http.get('/api/' + modelName + '/' + id + '/history');
            }
        };
    });
})();

angular.module('fngAuditModule').run(['$templateCache', function($templateCache) {
  'use strict';

  $templateCache.put('templates/base-history.html',
    "<h1 ng-controller=FngAuditCtrl>History!!</h1>"
  );

}]);
