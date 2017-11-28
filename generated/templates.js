angular.module('fngAuditModule').run(['$templateCache', function($templateCache) {
  'use strict';

  $templateCache.put('templates/base-history.html',
    "<div ng-controller=FngAuditHistCtrl><div ng-class=\"css('rowFluid')\" class=\"page-header list-header\"><div class=header-lhs><h1>History for {{modelName}} {{id}}</h1></div></div><div class=\"page-body list-body\"><error-display></error-display><div ng-class=\"css('rowFluid')\"><a ng-repeat=\"change in changes\" ng-href={{buildHistUrl(change)}}><div class=list-item><div ng-class=\"css('span',12)\">{{ change.comment }} {{ change.changedAt }}</div></div></a></div></div></div>"
  );


  $templateCache.put('templates/base-version.html',
    "<div ng-controller=FngAuditVerCtrl><div ng-class=\"css('rowFluid')\" class=\"page-header list-header\"><div class=header-lhs><h1>Version {{ tab }} for {{modelName}} {{id}}</h1></div></div><div class=\"page-body list-body\"><error-display></error-display><div ng-class=\"css('rowFluid')\"><pre>\n" +
    "                {{ version | json }}\n" +
    "            </pre></div></div></div>"
  );

}]);
