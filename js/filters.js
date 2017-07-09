var fapp = angular.module("nFilters", [])
.filter('lineBreaks', function() {
  return function(input) {
    input = input || '';
    return input.replace('\n', '<br>');
  };
})
.filter('lowerBreaks', function() {
  return function(input) {
    input = input || '';
    return input.toLowerCase();
  };
});  // lowerBreaks filter is for TESTING.