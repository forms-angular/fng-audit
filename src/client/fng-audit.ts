import angular from "angular";
(function () {
    'use strict';

    let auditModule: any = angular.module('fngAuditModule', ['formsAngular']);

    auditModule
        .config(['RoutingServiceProvider', function (RoutingServiceProvider: fng.IRoutingServiceProvider) {
            RoutingServiceProvider.addRoutes(null, [
                { route: '/:model/:id/history', state: 'model::history', templateUrl: 'templates/base-history.html' },
                { route: '/:model/:form/:id/history', state: 'model::history', templateUrl: 'templates/base-history.html' },
                { route: '/:model/:id/changes', state: 'model::history', templateUrl: 'templates/base-history.html' },
                { route: '/:model/:form/:id/changes', state: 'model::history', templateUrl: 'templates/base-history.html' },
                { route: '/:model/:id/version/:version', state: 'model::version', templateUrl: 'templates/base-version.html' },
                { route: '/:model/:form/:id/version/:version', state: 'model::version', templateUrl: 'templates/base-version.html' }
            ]);
            RoutingServiceProvider.registerAction('history');
            RoutingServiceProvider.registerAction('changes');
            RoutingServiceProvider.registerAction('version');
        }])
        .controller('FngAuditHistCtrl', [
            '$rootScope',
            '$scope',
            '$location',
            '$filter',
            '$http',
            'RoutingService',
            'FngAuditService',
            function (
                $rootScope: IFngAuditServiceRootScope,
                $scope: IItemAuditScope,
                $location: angular.ILocationService,
                $filter: angular.IFilterService,
                $http: angular.IHttpService,
                RoutingService: fng.IRoutingService,
                FngAuditService: IFngAuditService
            ) {
                // Descriptions of referenced records, keyed by "<model>/<id>"
                const refDescs: { [key: string]: string } = {};

                function formatPrimitive(value: any, type?: string, ref?: string): string {
                    if (value === null || value === undefined || value === '') {
                        return '(blank)';
                    }
                    if (Array.isArray(value)) {
                        return value.length === 0 ? '(blank)' : value.map((v) => formatPrimitive(v, undefined, ref)).join(', ');
                    }
                    if (ref && typeof value === 'string') {
                        return refDescs[`${ref}/${value}`] || value;
                    }
                    if (typeof value === 'boolean') {
                        return value ? 'Yes' : 'No';
                    }
                    if (type === 'Date' || (typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/.test(value))) {
                        return $filter('date')(value, 'd MMM yyyy HH:mm');
                    }
                    if (typeof value === 'object') {
                        return JSON.stringify(value);
                    }
                    const str = String(value);
                    if (/<[a-z][\s\S]*>/i.test(str)) {
                        // html field: show the text
                        const div = document.createElement('div');
                        div.innerHTML = str;
                        return (div.textContent || '').replace(/\s+/g, ' ').trim() || '(blank)';
                    }
                    return str;
                }

                $scope.formatChangeValue = function (val?: IChangeValue): string {
                    if (!val) {
                        return '';
                    }
                    if (val.fields) {
                        return val.fields.map((f) => `${f.label}: ${formatPrimitive(f.value, f.type, f.ref)}`).join('; ') || '(blank)';
                    }
                    return formatPrimitive(val.value, val.type, val.ref);
                };

                function resolveRefs(changes: IChangeRecord[]) {
                    const wanted = new Set<string>();
                    const note = (value: any, ref?: string) => {
                        if (ref) {
                            (Array.isArray(value) ? value : [value]).forEach((v) => {
                                if (typeof v === 'string' && /^[0-9a-f]{24}$/i.test(v)) {
                                    wanted.add(`${ref}/${v}`);
                                }
                            });
                        }
                    };
                    const noteVal = (val?: IChangeValue) => {
                        if (val) {
                            note(val.value, val.ref);
                            (val.fields || []).forEach((f) => note(f.value, f.ref));
                        }
                    };
                    changes.forEach((c) => (c.details || []).forEach((d) => { noteVal(d.from); noteVal(d.to); }));
                    wanted.forEach((key) => {
                        $http.get<{ list: string }>(`/api/${key}/list`).then((res) => {
                            if (res.data && res.data.list) {
                                refDescs[key] = res.data.list;
                            }
                        }, () => { /* leave the id showing */ });
                    });
                }

                $scope.changes = [];
                const path = $location.path();
                angular.extend($scope, RoutingService.parsePathFunc()(path));
                const modelAndForm = `${$scope.modelName}${$scope.formName ? `/${$scope.formName}` : ''}`;
                $http.get<{ list: string }>(`/api/${$scope.modelName}/${$scope.id}/list`).then((res) => {
                    if (res.data && res.data.list) {
                        $scope.recordDesc = res.data.list;
                    }
                }, () => { /* keep showing the id */ });
                $scope.createDate = new Date(parseInt($scope.id.toString().substring(0, 8), 16) * 1000);
                FngAuditService.getHist($scope.modelName, $scope.id, path.split('/').slice(-1)[0])
                    .then(function (result: { data: IChangeRecord[]; }) {
                        $scope.changes = result.data;
                        resolveRefs($scope.changes);
                        $scope.$applyAsync();
                        let users: { [userId: string]: null | string } = {};
                        $scope.changes.forEach(c => {
                            if (c.user) {
                                users[c.user] = null;
                            }
                        })

                        $rootScope?.describeUsers(users)?.then((usersDesribed: { [userId: string]: string }) => {
                            $scope.changes.forEach(c2 => {
                                if (c2.user) {
                                    c2.userDesc = usersDesribed[c2.user];
                                }
                            })
                        })

                        if ($scope.changes.length > 0) {
                            if ($scope.changes[$scope.changes.length - 1].operation !== 'create') {
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
                            FngAuditService.checkValidItem($scope.modelName, $scope.id)
                                .then(() => { $scope.inferCreate = true });
                        }
                    }, function (err: any) {
                        $scope.errorVisible = true;
                        $scope.alertTitle = err.statusText;
                        $scope.errorMessage = err.data;
                    });

                $scope.buildHistUrl = function (lastPart: string): string {
                    return RoutingService.buildUrl(`${modelAndForm}/${$scope.id}/${lastPart}`);
                };

            }])
        .controller('FngAuditVerCtrl', [
            '$scope',
            '$location',
            'RoutingService',
            'FngAuditService',
            function (
                $scope: any,
                $location: angular.ILocationService,
                RoutingService: fng.IRoutingService,
                FngAuditService: IFngAuditService
            ) {
                $scope.record = [];

                angular.extend($scope, RoutingService.parsePathFunc()(($location as any).$$path));

                FngAuditService.getVersion($scope.modelName, $scope.id, $scope.tab)
                    .then(function (results: any) {
                        // Check for a generated version 0 of a non existent item
                        if ($scope.tab === '0' && Object.keys(results.data).length === 1) {
                            $scope.errorVisible = true;
                            $scope.alertTitle = 'Error';
                            $scope.errorMessage = `No such ${$scope.modelName} as ${$scope.id}`;
                        } else {
                            $scope.version = results.data;
                        }
                    }, function (err: any) {
                        $scope.errorVisible = true;
                        $scope.alertTitle = err.statusText;
                        $scope.errorMessage = err.data;
                    });

                $scope.buildHistUrl = function (change: any) {
                    return RoutingService.buildUrl($scope.modelName + '/' + $scope.id + '/version/' + change.oldVersion)
                }

            }])
        .service('FngAuditService', ['$http', function ($http: angular.IHttpService) {
            return {
                getHist: async function (modelName: string, id: string, histAction = 'history'): Promise<angular.IHttpResponse<IChangeRecord[]>> {
                    return $http.get(`/api/${modelName}/${id}/${histAction}`);
                },
                getVersion: function (modelName: string, id: string, version: string) {
                    return $http.get(`/api/${modelName}/${id}/version/${version}`);
                },
                checkValidItem: function (modelName: string, id: string) {
                    return $http.get(`/api/${modelName}/${id}`);
                }
            }
        }]);

})();

