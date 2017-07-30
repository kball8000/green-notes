// I will be adding fliters for the displayed note for hotlinks to phone numbers 
// and some super simple markdown style formatting.
angular.module('nFilters', [])
.filter('newlines', () => {
  return input => {
    input = input || '';
    return input.replace(/\n/g, '<br>');
  }
})
.filter('markdown', () => {
  // let markdownOptions = {
  //   '.h1 ': 'header1',
  //   '.b ': 'bold1'
  // };

  return input => {
    input = input || '';
    let lines = input.split('\n'),
        breakLines = lines.map( line => {
          if (line.indexOf('.h1 ') !== -1) {
            line = '<p class="headerM">' + line.slice(4) + '</p>'
          } else {
            line += '<br>';
          }
          return line;
        });

    return breakLines.join('');
  }
});
/* Example regular expressions*/
  //OUTPUT: <a href='https://gooogle.com>https://gooogle.com<a>
  // let l1 =  '<http://google.com?a=34>'
  // let x = l1.match(/<https?:[a-z./?=0-9]+>/);
  // let xf = x[0].replace(/<|>/g, '');
  // $scope.x = '<a href="' + x3f + '">' + x3f + '</a>';

  //<a href='https://gooogle.com>google.com<a>
  // let l2 = '[google.com](http://google.com?a=34)';
  // let a2 = l2.match(/\[[a-z.]+\]/g);
  // let a2f = a2[0].replace(/\[|\]/g, '');
  // let u2 = l2.match(/\(https?:[a-z./?=0-9]+\)/g);
  // let u2f = u2[0].replace(/\(|\)/g, '');
  // $scope.y = '<a href="' + u2f + '">' + a2f + '</a>';
  
  
  // try ^ for initial characters
