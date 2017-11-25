angular.module('fngAuditModule').run(['$templateCache', function($templateCache) {
  'use strict';

  $templateCache.put('templates/base-history.html',
    "<h1 ng-controller=FngAuditCtrl>History!!</h1>"
  );

}]);
