var app = angular.module("green-note", ["ngRoute", "greenNotesCtrl"]);

app.config(function($routeProvider, $locationProvider, $httpProvider) {

  $httpProvider.defaults.useXDomain = true;
  
  $routeProvider
  .when("/notes", {
    templateUrl: "partials/notes.html"
  })
  .when("/error", {
    templateUrl: "partials/error.html"
  })
  .when("/login", {
    templateUrl: "partials/login.html"
  })
  .when("/search", {
    templateUrl: "partials/search.html"
  })
  .when("/restore", {
    templateUrl: "partials/restore.html"
  })
  .otherwise({
    redirectTo: "/notes"
  });

  $locationProvider.html5Mode(true);

});