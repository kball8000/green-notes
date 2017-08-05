// I will be adding fliters for the displayed note for hotlinks to phone numbers 
// and some super simple markdown style formatting.
angular.module('nFilters', [])
.filter('markdown', () => {

  function formatHeaders(line) {
    /**
     * Line that starts with header markdown will be styled accordingly.
     */
    if (line.indexOf('.h1 ') !== -1) {
       line = '<p class="headerM">' + line.slice(4) + '</p>'
    } else {
      line += '<br>';
    }
    return line;
  }
  function formatLine(line) {
    /**
     * Some simple formatting anywhere within the line, i.e. bold and strikethru.
     */
    let regs = {
      bold1 : {'regex': /__/g, 'replace': '__', beg: '<b>', end: '</b>' },
      bold2 : {'regex': /\*\*/g, 'replace': '**', beg: '<b>', end: '</b>' },
      bold2 : {'regex': /`/g, 'replace': '`', beg: '<code>', end: '</code>' },
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
  function formatPhoneNum(line){
    /**
     * <a href="tel:+1-555-555-1212">555-555-1212</a>
     * Creates a telephone link out of phone numbers with reasonable delimeter between the
     * 'parts', i.e. country code, area code...
     */
    // let fourRe = new RegExp( /[-. ]\d{4}/ );
    // let threeRe = new RegExp( /[-. ) ]?\d{3}/ );
    let regex = /\+?\d{0,3}?[-.(]?\d{0,3}[-. )] ?\d{3}[-. ]\d{4}/g;
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

      html = '<a class="phoneNumber" href="tel:' + href + '">' + anchor + '</a>';
      // html = '<a href="tel:' + href + '>' + anchor + '</a>';
      line = line.replace(orig, html);
      count--;
    } 
    return line;
  }
  function formatUrls(line){
    /**
     * <a href="url">anchorText</a>
     * Creates a link out string, at the moment only 1 per line.
     */

    let anchorRe  = new RegExp( /\([\w.]+\)/ );
    let hrefRe    = new RegExp( /\[http[\w:/.?=&;@$+!*'()_-]+\]/ );
    let regex     = new RegExp(anchorRe.source + hrefRe.source, 'g');
    let matches   = line.match(regex),
        count, href, hrefMatch, anchor, anchorMatch, orig, html;

    count = matches ? matches.length : 0;
    while (count) {
      orig        = matches[count-1];
      anchorMatch = orig.match(anchorRe);
      anchor      = anchorMatch[0].replace(/[()]/g, '');
      hrefMatch   = orig.match(hrefRe);
      href        = hrefMatch[0].replace(/\[?\]?/g, '');
      
      html = '<a class="links" href="' + href + '">' + anchor + '</a>';
      line = line.replace(orig, html);

      count--;
    }
    return line;
  }
  return input => {
    input = input || '';
    let lines = input.split('\n'),
        breakLines = lines.map( line => {
          line = formatHeaders(line);
          line = formatLine(line);
          line = formatPhoneNum(line);
          line = formatUrls(line);
          
          return line;
        });

    return breakLines.join('');
  }
});