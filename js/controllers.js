// gae = Google App Engine
// 2017

var cont = angular.module('greenNotesCtrl', ['noteServices', 'ngMaterial', 'ngMessages', 'ngSanitize'])
.config(function($mdThemingProvider) {
  $mdThemingProvider.theme('default').primaryPalette('green').accentPalette('yellow');
  $mdThemingProvider.theme('light-green').backgroundPalette('light-green').dark();
  
})
.controller('mainCtrl', function($scope, $mdSidenav, $http, $timeout, $location, $window, nData, nDates, nFuncs, nUtils, nServer, nDB) {
  
  $scope.editMode     = false;
  $scope.userLoggedIn = false;
  $scope.loaded       = {
    data: false,
    page: false
  }
    
//  HACK
  document.onclick = function(e) {
    let arr = ['noteArea', 'noteTitle', 'searchInput'],
        clickedId = e.target.id,
        elem;
    
    if(!arr.includes(clickedId)) {
      arr.forEach(testId => {
        elem = document.getElementById(testId);
        if(elem) {
          elem.blur();
        }
      })
    }
  }
  
  function focusTextArea() {
    let el = $window.document.getElementById('noteArea');
    el.focus();
    el.selectionStart = 0;
    el.selectionEnd = 0;
  }
  // SIDENAV //
  $scope.open = function() {
    $mdSidenav('left').open();
  }

// LOADING APP HELPER FUNCTIONS
  let retries = 25;
  function checkAppReady() {
    if ($scope.loaded.data) {
      $scope.loaded.page = true;
    } else if(retries) {
      $timeout(checkAppReady, 200);
      retries--;
    } else if(!retries) {
      $scope.loaded.page = true;
      console.log('ran out of retries, just going to say it is loaded');
    }
  }
  function loadData() {
    let p1 = nDB._get('allNotes').then( r => {
      try {
        nData.allNotes = r.value;
      } catch(e) {
        console.log('no notes yet, should display create a note msg');
      }
    })

    let p2 = nDB._get('userPrefs').then( r => {
      try {
        nData.userPrefs = r.value;
        nData.userPrefs.showTrash = false;
      } catch(e) {
        nData.userPrefs = nData.initUserPrefs();
        nDB._put('userPrefs', nData.userPrefs);
      }
    })

    Promise.all([p1, p2]).then( r => {
      $scope.loaded.data = true;  // stops the spinner in checkappready
      nDB.setLoaded();
      nData.refreshDisplayNotes();
      $scope.n = nData;
    })
  }
  function loadUserFromServer(caller) {
    nServer.getUser().then( r =>{
      if(r){
        $scope.userLoggedIn = true;
        nDB.setUserId(r);
        nDB._put('userId', r, true).then( () => {
          loadData();
        });
      } else {
        if(caller === 'userClick') {
          $window.location.href = $scope.login_url;
        } else {
          $location.path('/login');
          $scope.loaded.data = true;  // Stops spinner so user can log in.
        }
      }
    }, e => { 
      $location.path('/error');
      $scope.loaded.data = true;
    })
  }
    
// **--  NOTES  --**
  function saveTo(db, cancel) {
    function cancelTimeout(db, cancel) {
      if(cancel){
        $timeout.cancel(nData.timeouts[db]);
      }
      nData.timeouts[db] = '';      
    }
    nData.saveNotearea();
    
    if (db === 'db' || db === 'both') {
      cancelTimeout('db', cancel);
      nDB._put('allNotes', nData.allNotes);
    } 
    if (db === 'server' || db === 'both') {
      cancelTimeout('server', cancel);
      nData.addToQueue([nData.selectedNote.id]);
      nServer.save();
    }    
  }
  $scope.newNote = function(){
    let newNote = nData.createNoteObj();
    nData.allNotes.push(newNote);
    nFuncs.setPref('selectedId', newNote.id);
    nData.refreshDisplayNotes();
    
    $scope.editMode = true;     // To display textarea.
    
    saveTo('both');
  }
  
// **--  LOGIN FUNCTIONS  --**
  $scope.googleLoginImg = 'btn_google_signin_dark_normal_web.png';
  $scope.googleImgChg = function(evt) {
    let obj = {
      'enter': 'btn_google_signin_dark_focus_web.png',
      'leave': 'btn_google_signin_dark_normal_web.png',
      'press': 'btn_google_signin_dark_pressed_web.png'
    }
    $scope.googleLoginImg = obj[evt];
  }
  $scope.login = function(login, caller) {
    if (login) {
      nDB._get('userId', true).then( r => {
        if (r && r.value) {
          $scope.userLoggedIn = true;
          nDB.setUserId(r.value);
          $location.path('/notes'); 
//          $location.path('/search');   // TESTING
          loadData();
        } else{
          loadUserFromServer(caller);
        }
      });
    } else {    // logout
      nDB.setUserId(undefined);
      nDB._put('userId', undefined, true).then( () => {
        $window.location.href = $scope.logout_url;
      });
    }
  }
  
// **--  ERROR PAGE FUNCTIONS  --**
  $scope.reload = function() {
    $window.location.reload();
  }
  
// **--  MORE NOTES FUNCTIONS  --**
  $scope.starNote = function() {
    nData.selectedNote.fav = !nData.selectedNote.fav;
    nData.modified = nDates.getTimestamp();
    saveTo('both', true);
  }
  $scope.removeNote = function() {
    nData.removeNote();
    saveTo('both', true);
  }
  $scope.restoreNote = function() {
    nData.restoreNote();
    saveTo('both', true);
  }
  $scope.editNote = function() {
    $scope.editMode = true;
    nData.notearea = nUtils.replaceBRs(nData.selectedNote.content);
    saveTo('server', true);   // Really just checking for an update...
    $timeout(focusTextArea);
  }
  $scope.blurNote = function(caller) {
    
    if (caller === 'title') {
      // leave edit note mode alone...
      nData.alertUserIfDuplicateTitle();
    } else {
      $scope.editMode = false;
    }
    
    saveTo('both', true); 
    nData.sortDisplayNotes();
  }
  $scope.noteChg = function() {
    if (!nData.timeouts.dbSave) {
      nData.timeouts.dbSave = $timeout(saveTo, 4000, true, 'db');
    }
    if (!nData.timeouts.serverSave) {
      nData.timeouts.serverSave = $timeout(saveTo, 8000, true, 'server');
    }
  }  
  
// **--  LOADING APP  --**
  nServer.getAll('onload');
  nDB.openDB().then(r => {
    $scope.login(true, 'onload');
    $timeout(checkAppReady, 500);
  })

})
.controller('leftCtrl', function($location, $scope, $mdDialog, $mdSidenav, $window, nData, nDB, nFuncs, nServer) {
  $scope.syncing = false;
  $scope.numShownNotes = 2;
  $scope.showMoreText = 'More';
  
  nDB.waitFor('loaded').then( () => {
    $scope.s = nData;
    $scope.nDB = nDB;
  })
  $scope.sync = function() {
    $scope.syncing = true;
    nServer.getAll('sync').then( () => {$scope.syncing = false;});
  }
  $scope.close = function() {
    $mdSidenav('left').close();
  }
  
  $scope.setFavsFilter = function() {
    nFuncs.setPref('showFavs', !nData.userPrefs.showFavs);
    nData.refreshDisplayNotes();
  }
  $scope.toggleTrash = function() {
    nData.userPrefs.showTrash = !nData.userPrefs.showTrash;
    nData.refreshDisplayNotes();
  }
  $scope.setSortBy = function(newSort) {
    nFuncs.setPref('sortBy', newSort);
    nData.sortDisplayNotes();
  }

  $scope.selectNote = function(note) { 
    nFuncs.setPref('selectedId', note.id);
    nData.selectNote();
    $mdSidenav('left').close();
  }
  $scope.showMore = () => {
    console.log('running showmore, does not work well at boundary');
    if ($scope.showMoreText === 'More' ) {
      if($scope.numShownNotes < nData.displayNotes.length - 1) {
        $scope.numShownNotes += 1;
      } else {
        console.log('no more notes to show.');
        $scope.showMoreText = 'Less';
      }
    } else {
      if($scope.numShownNotes > 2) {
        $scope.numShownNotes -= 1;
      } else {
        console.log('no less notes to show.');
        $scope.showMoreText = 'More'
      }
    }
  }       // NOT IMPLEMENTED YET 2017 JUNE

// Bottom button controls  
  $scope.reload = function() {
    $window.location.reload();
  }
  $scope.goToRestore = () => {
    $location.path('/restore');
    $mdSidenav('left').close();
  }
  $scope.logout = (ev) => {
    var confirm = $mdDialog.confirm()
          .title('Confirm Logout')
          .textContent('Are you sure you want to logout?')
          .ariaLabel('logout')
          .targetEvent(ev)
          .ok('Logout')
          .cancel('Stay Logged In');

    $mdDialog.show(confirm).then(function() {
      $scope.login(false);
    }, () => {
      angular.noop;
    });  
  }
  
  $scope.logData = function() {
    console.log('nData: ', nData);
    console.log('nDB  : ', nDB);
  }   // TESTING
})
.controller('searchCtrl', function($location, nData, nFuncs, nSearch) {
  
  this.s = nData;
  this.cbFavs = false;
  this.cbTrash = false;
  
  this.selectedItemChange = function(x) {    
    nFuncs.setPref('selectedId', x.id);
    nData.selectNote();
    $location.path('/notes');
  }
  this.querySearch = function(query) {
    return nSearch.querySearch(query, this.cbFavs, this.cbTrash);
  }
})
.controller('restoreCtrl', function(nData, nDB, nServer, nDates) {
  
  this.r = nData;
  
  let INTERVALS = ['Most Recent', 'One Week', 'Six Months', 'One Year'];
  let int_arr = INTERVALS.map(item => {
    let value = item.replace(' ', '_');
    return { display: item, value: value.toLowerCase()};    
  })
  
  this.backupIntervals = int_arr;
  this.backupInterval = int_arr[0];
  
  function init() {
    nServer.getRestore().then( r => {
      nData.restore = r;
    });    
  }
  function updateNote(note) {
    note.deleted = [];
    note.modified = nDates.getTimestamp();
    nData.updateNote(note.id, note);
    nData.addToQueue([note.id])    
  }
  
  this.displayDate = arr => nDates.toDate(arr)
  this.restoreNote = note => {
    updateNote(note);
    nDB._put('allNotes', nData.allNotes);
    nServer.save();
  }
  this.restoreAllNotes = () => {
    let interval = this.backupInterval.value;
    nData.restore[interval].notes.forEach( n => updateNote(n.info))
    nDB._put('allNotes', nData.allNotes);
    nServer.save();    
  } 
  
  init();
});
