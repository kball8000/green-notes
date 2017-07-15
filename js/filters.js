var fapp = angular.module("nFilters", [])
.filter('lineBreaks', function() {
  return function(input) {
    input = input || '';
    return input.replace('\n', '<br>');
  };
})
.filter('phoneNum', function() {
  // (217) 433-8133
  // 217-433-8133
  return function(input) {
    let re2 = /\d+-\d+-\d+/;
    let re3 = /\(\d+\) \d+-\d+/;
    input = input || '';
    let matchInfo2 = input.match(re2);
    let matchInfo3 = input.match(re3);
    if (matchInfo2) {
      console.log('match info2', matchInfo2[0]);
    }
    if (matchInfo3) {
      console.log('match info3', matchInfo3[0]);
    }
    // let execInfo = re1.exec(input);
    // let splitInfo = input.split(re1);

    return input;
    // return input.replace(re1, '<a href="' + re1 + '">' + re1 + '</a>');
    // return input.replace(re, '<b>more re</b>');
  };
})  // phoneNum filter is for TESTING.
.filter('lowerBreaks', function() {
  return function(input) {
    input = input || '';
    return input.toLowerCase();
  };
});  // lowerBreaks filter is for TESTING.