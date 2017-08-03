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


  function formatLine(line) {
    let syntaxes = {
      '.h1 ': 'OK, not doing anything here for now.'
    }
    console.log('formatLinefunction');
    return line;
  }

  function formatBold(line) {

    // let re = /__/g;
    let regs = {
      bold1 : {'regex': /__/g, 'replace': '__', beg: '<b>', end: '</b>' },
      bold2 : {'regex': /\*\*/g, 'replace': '**', beg: '<b>', end: '</b>' },
      strike : {'regex': /~~/g, 'replace': '~~', beg: '<strike>', end: '</strike>' }
    }, 
    count = 0, matches = '', r = {};

    for (style in regs) {
      r = regs[style];
      matches = line.match(r.regex);
      count = matches ? matches.length : 0;
      while (count > 1) {
        line = line.replace(r.replace, r.beg);
        line = line.replace(r.replace, r.end);
        count = count - 2;        
      } 
    }

    return line;
  }

  // Phone Numbers:
  // let regex = /\(?\d{0,3}[-. )] ?\d{3}[-. ]\d{4}/g;
  // let regex = /\+?\d{0,3}?[-. (]?\d{0,3}[-. )] ?\d{3}[-. ]\d{4}/g;
  // regex covers these formats
  // 299-345-5346
  // 299.345.5346
  // (299) 345-5346

  // Proper phone number link, one of these 2:
  // <a href="tel:+15555551212">555-555-1212</a>
  // <a href="tel:+1-555-555-1212">555-555-1212</a>

  function formatPhoneNum(line){


    let regex = /\+?\d{0,3}?[-. (]?\d{0,3}[-. )] ?\d{3}[-. ]\d{4}/g;
    let matches = line.match(regex),
        count, parts, href, anchor, orig, html;

    count = matches ? matches.length : 0;
    while (count > 0) {
      orig = matches[count-1];
      parts = orig.match(/\d+/g);

      // Handle a couple country code quirks for US and match only getting numbers.
      if (parts.length === 3) {
        parts.unshift('+1');
      } else {
        parts[0] = '+' + parts[0];
      }

      href = parts.join('-');
      anchor = parts.join('-');

      // Take off the +1- for the Americans.
      if (anchor.match(/^\+1-/)) {
        anchor = anchor.replace('+1-', '');
      }

      html = '<a href="tel:' + href + '" style="font-size:0.8em;">' + anchor + '</a>';
      line = line.replace(orig, html);
      count--;
    } 

    return line;
  }

  return input => {
    input = input || '';
    let lines = input.split('\n'),
        breakLines = lines.map( line => {
          if (line.indexOf('.h1 ') !== -1) {
            line = '<p class="headerM">' + line.slice(4) + '</p>'
          } else {
            line += '<br>';
          }

          line = formatBold(line);
          line = formatPhoneNum(line);
          
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
