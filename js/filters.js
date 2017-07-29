// I will be adding fliters for the displayed note for hotlinks to phone numbers 
// and some super simple markdown style formatting.
angular.module('nFilters', [])
.filter('caps', () => {
  return input => {
    input = input || '';
    console.log('capsfilter, input:', input);
    input = input.replace(/\n/g, '<br>');
    return input.toUpperCase();
  }
});