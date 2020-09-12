// gae = Google App Engine
// 2017
//  $mdThemingProvider.theme('default').primaryPalette('green').accentPalette('yellow');

var cont = angular.module('greenNotesCtrl', ['noteServices', 'nFilters', 'ngAnimate', 'ngMaterial', 'ngMessages', 'ngSanitize'])
.config(function($mdGestureProvider, $mdThemingProvider) {
  $mdThemingProvider.theme('default').primaryPalette('green').accentPalette('yellow').dark();
  $mdThemingProvider.theme('light-green').backgroundPalette('light-green').dark();
  $mdGestureProvider.skipClickHijack();
})
.controller('mainCtrl', function($scope, $mdSidenav, $mdDialog, $http, $timeout, $location, $window, $anchorScroll, nData, nDates, nUtils, nServer, nSpeech, nDB) {
  $scope.editMode       = false;
  $scope.userLoggedIn   = false;
  $scope.lastPageBlur   = 0;    // Used to keep note editable when changing tabs.
  $scope.lastNoteBlur   = 0;    // Used to keep note editable when changing tabs.
  $scope.loaded         = {
    data: false,
    page: false
  }

  // **--  TESTING  --**  
  $scope.addHardDelete = function() {      // TESTING
    for (let note of nData.allNotes) {
      note.deleteHard = false;
    }
  }
  $scope.getTestNote = function() {      // TESTING
    let url   = $window.location.origin + '/getnote',
        data  = {id: 0, modified: 0};
    $http.post(url, data).then ( r => {
      console.log('note:', r.data);
    })
  }
  $scope.getAllNotes = function() {      // TESTING
    let url   = $window.location.origin + '/getnotes';
    $http.post(url).then ( r => {
      console.log('all notes:', r.data);
    })
  }
  $scope.logSelectedNote = function () {
    console.log('id:', nData.selectedNote.id ,' selecteNote:', nData.selectedNote);
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
   
  // **--  NOTES FUNCTIONS  --**
  function focusTextArea() {
    let promise = nUtils.setFocus('noteArea');
    let cursor  = nData.selectedNote.cursorLocation || 0;

    promise.then((r) => {
      r.el.selectionStart = cursor;
      r.el.selectionEnd   = cursor;
    }, (e) => {
      console.log('failed to set focus to element id: ', e.val);
    })
    // quirky, if I left this in edit note, caused complete note to toggle, edit note worked fine.
    // hurts my head to think about why that was.
  }
  function saveTo(db, cancel) {

    function cancelTimeout(db, cancel) {
      // i.e. 'dbSave' or 'serverSave'. Felt nData property name was more clear this way.
      db = db + 'Save';   
      if(cancel){
        $timeout.cancel(nData.timeouts[db]);
      }
      nData.timeouts[db] = '';      
    }

    nData.selectedNote.modified = nDates.getTimestamp();
    
    if (db === 'db' || db === 'both') {
      cancelTimeout('db', cancel);
      nDB._put('allNotes', nData.allNotes);
    } 
    if (db === 'server' || db === 'both') {
      cancelTimeout('server', cancel);
      nData.addToQueue(nData.selectedNote.id);
      nServer.save();
    }
  }
  function saveCursorLocation() {
    let el = $window.document.getElementById('noteArea');
    nData.selectedNote.cursorLocation = el.selectionStart || 0;    
  }
  $scope.newNote = function(){
    let newNote = nData.createNoteObj();
    nData.allNotes.push(newNote);
    nData.setPref('selectedId', newNote.id);
    nData.refreshDisplayNotes();
    
    $scope.editMode = true;     // To display textarea.
    nData.pristineNote = false;
    nUtils.setFocus('noteTitle');
    saveTo('both');  
  }
  $scope.editNote = function() {
    /* Change from view only to edit mode so user can edit the selected note */
    let note = nData.selectedNote;
    nData.pristineNote = true;
    
    
    // Checks for updated note on server.
    nServer.getNote(note);
    
    // Toggle from view only to edit mode on screen.
    $scope.editMode = true; 
    $timeout(focusTextArea);
  }
  $scope.setEditMode = () => {
    $scope.editMode = true;
  }
  $scope.blurNote = function(caller) {
    if (caller === 'title') {
      // leave edit note mode alone...
      nData.alertUserIfDuplicateTitle();
    } else {
      saveCursorLocation();
      $scope.editMode     = false;
      $scope.lastNoteBlur = Date.now();
    }

    if (!nData.pristineNote) {
      saveTo('both', true);
    }
    
  }
  function deleteNote() {
    nData.clearProps(nData.selectedNote);
    nData.selectedNote.deleteHard = true;
    saveTo('both', true);
    nData.refreshDisplayNotes();
  }
  $scope.promptPermanentDelete = function() {
    let confirm = $mdDialog.confirm()
          .title('Permanently Delete Note')
          .textContent(nData.selectedNote.title)
          .ariaLabel('Permanently delete?')
          .ok('Delete')
          .cancel('Keep');

    $mdDialog.show(confirm).then(function() {
      deleteNote();
    }, () => {
      console.log('keeping note:', nData.selectedNote.title);
      angular.noop;
    });
  }
  $scope.noteChg = function() {
    /*Runs anytime there is a change in the note input field in the app. Sets
    timeouts so that we are not saving to db and server on every character change.*/

    nData.pristineNote = false;

    if (!nData.timeouts.dbSave) {
      nData.timeouts.dbSave = $timeout(saveTo, 4000, true, 'db');
    }
    if (!nData.timeouts.serverSave) {
      nData.timeouts.serverSave = $timeout(saveTo, 8000, true, 'server');
    }
  }
  $scope.starNote = function() {
    nData.selectedNote.fav = !nData.selectedNote.fav;
    saveTo('both', true);
    nData.refreshDisplayNotes();
  }
  $scope.removeNote = function() {
    nData.selectedNote.deleted  = nDates.getTimestamp();
    saveTo('both', true);
    nData.refreshDisplayNotes();
  }
  $scope.restoreNote = function() {
    nData.selectedNote.deleted  = 0;
    saveTo('both', true);
    nData.userPrefs.showTrash   = false;
    nData.refreshDisplayNotes();
  }
  
  // Speech to Text
  $scope.talkInput = () => {

    // let recognition = new webkitSpeechRecognition();
    nData.speech.recognition = new webkitSpeechRecognition();
    
    nData.speech.recognition.continuous     = false;
    nData.speech.recognition.interimResults = false;
    nData.speech.recognition.lang           = "en-US";

    nData.speech.recognition.start();
    nData.speech.userTalking = true;

    nSpeech.clearTranslationBox(true);
    nSpeech.startListeningAnimation();

    nData.speech.recognition.onresult = e => {
      nData.speech.userTalking    = false;
      nData.speech.translatedText = e.results[0][0].transcript;
      nData.speech.recognition.stop();
      $timeout($scope.apply);
    };
    nData.speech.recognition.onerror = e => {
      nData.speech.userTalking  = false;
      nData.speech.errorMsg     = 'Did not hear any words, maybe mic is not working?';
      nData.speech.recognition.stop();
      $timeout($scope.apply);
    }
  }
  $scope.acceptTranslation = () => {
    nSpeech.acceptTranslation();
    nSpeech.clearTranslationBox();
  }
  $scope.retryTranslation = () => {
    nSpeech.clearTranslationBox(true);
    $scope.talkInput();
  }
  $scope.closeTranslation = () => {
    nData.speech.recognition.stop();
    nSpeech.clearTranslationBox();
  }

  // **--  KEYBOARD SHORTCUTS  --**
  // This gets out of edit mode if clicking anywhere other than title or notearea, the note input 
  // area, not to be confused with formated note in readonly mode.
  function goToSearch() {
    $location.path('/search');
    $timeout($scope.digest);
  }
  function editNoteShortcut() {
    if ($window.location.pathname === '/notes') {
      $scope.editNote();
    }
  }
  function newNoteShortcut() {
    if ($window.location.pathname === '/notes') {
      $scope.newNote();
    }
  }
  $window.onclick = e => {
    let edits = {
      newNoteButton:  true,
      newNoteIcon:    true,
      noteTitle:      true,
      noteArea:       true,
      doneButton:     true,
      editButton:     true,
      editIcon:       true
    };
    if ( !(e.target.id in edits) ) {
      $scope.editMode = false;
      $timeout($scope.digest)
    }
  }
  $window.document.onkeyup = e => {
    // Using keyup so that escape key will work, could not figure it out on keypress.
    let shortcuts = {
      69: editNoteShortcut,   // e char to edit note
      78: newNoteShortcut,    // n char for new note
      83: goToSearch          // s char for search
    };
    if (e.keyCode in shortcuts && $scope.editMode === false && e.target.id !== 'searchInput') {
      shortcuts[e.keyCode]();
    } else if (e.keyCode === 27 && $scope.editMode === true) {    // Escape key
      $timeout($scope.blurNote());
    }
  }
  function handleVisibilityChange() {
    // console.log('visibility change is running at:', performance.now());
    if (document.hidden) {
      $scope.lastPageBlur = Date.now();
    } else {
      let diff = Math.abs($scope.lastNoteBlur - $scope.lastPageBlur);
      // if (diff < 100) {
      if (diff < 100 && $scope.lastPageBlur > 0) {
        $scope.editMode = true;
        $timeout(focusTextArea, 50);
      }
    }    
  }
  // Leaves note edit mode if in edit mode when switching tabs.
  document.addEventListener('visibilitychange', handleVisibilityChange, false);

  // Note Actions
  $scope.toggleShowTips = function() {
    // Expands / collapses the Tips secion at the bottom of the notes page.
    $scope.showTips = !$scope.showTips;
    ($location.hash() !== 'tips') ? $location.hash('tips') : $anchorScroll();    
  }
  
  // **--  LOADING APP  --**
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
  nServer.getAll('onload');
  nDB.openDB().then(r => {
    $scope.login(true, 'onload');
    $timeout(checkAppReady, 500);
  })

  // **--  SIDENAV and ERROR PAGE FUNCTIONS  --**
  $scope.open = function() {
    $mdSidenav('left').open();
  }
  $scope.reload = function() {
    $window.location.reload();
  }
})
.controller('leftCtrl', function($location, $scope, $mdDialog, $mdSidenav, $window, nData, nDB, nServer, nSpeech) {
  $scope.syncing = false;
  $scope.numShownNotes = 2;
  $scope.sortOptions = [
    {display: "Title", value: "title"}, 
    {display: "Date",  value: "modified"}
  ];
  $scope.showMoreText = 'More';
  
  nDB.waitFor('loaded', 'leftCtrl').then( retries => {
    // for html
    $scope.left = nData;

    // for sort ng-select in LH Nav.
    nData.userPrefs.sortBy  = nData.userPrefs.sortBy || {display: 'Date', value: 'modified'};
    $scope.reverseNotes     = nData.userPrefs.sortBy.value === 'modified';

  }, error => {
    var confirm = $mdDialog.confirm()
          .title('App Loading Failure')
          .textContent('Reload App?')
          .ariaLabel('Reload?')
          .ok('Reload')
          .cancel('No Thanks');

    $mdDialog.show(confirm).then(function() {
      $window.location.reload();
    }, () => {
      angular.noop;
    });
    
  })
  $scope.sync = function() {
    $scope.syncing = true;
    nServer.getAll('sync').then( () => {$scope.syncing = false;});
  }
  $scope.close = function() {
    $mdSidenav('left').close();
  }  
  $scope.setFavsFilter = function() {
    nData.setPref('showFavs', !nData.userPrefs.showFavs);
    nData.refreshDisplayNotes();
  }
  $scope.toggleTrash = function() {
    nData.userPrefs.showTrash = !nData.userPrefs.showTrash;
    nData.refreshDisplayNotes();
  }
  $scope.nSort = option => {
    // Create my own object to avoid possible async issues and keeping angular $$ type properties.
    let obj = {value: option.value, display: option.display}
    nData.setPref('sortBy', obj);
    $scope.reverseNotes = (option.display === 'Date');
  }
  $scope.selectNote = function(note) { 

    /**
     * TODO: Add a check that if we are not in notes page to take us there, 
     * not sure if we are on restore page, though.
    */
    let leavePages = {
      '/search':  true,
      '/restore': true
    };

    nData.setPref('selectedId', note.id);
    nData.selectNote();
    nServer.getNote(note);              // Checks for updated note on server.
    nSpeech.clearTranslationBox();
    $mdSidenav('left').close();
    if ($window.location.pathname in leavePages) {
      $location.path('/notes');
    }
    $window.scrollTo(0, 0);
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
  $scope.logData = function() {      // TESTING
    console.log('nData: ', nData);
    console.log('nDB  : ', nDB);
  }
  $scope.downloadNotes = function() {
    console.log('downloading all notes');
    let storageObj = nData.allNotes;
    let dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(storageObj));
    let dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href",     dataStr     );
    dlAnchorElem.setAttribute("download", "all_notes.json");
    dlAnchorElem.click();    
  }
})
.controller('searchCtrl', function($location, $timeout, $window, nData, nSearch, nUtils) {
  
  this.s = nData;
  this.cbFavs = false;
  this.cbTrash = false;

  this.selectedItemChange = function(x) {
    nData.setPref('selectedId', x.id);
    nData.selectNote();
    $location.path('/notes');
  }
  this.querySearch = function(query) {
    return nSearch.querySearch(query, this.cbFavs, this.cbTrash);
  }

  nData.userPrefs.showTrash = false;
  nData.refreshDisplayNotes();
  nUtils.setFocus('searchInput');  
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
    note.deleted    = 0;
    note.deleteHard = false;
    note.modified   = nDates.getTimestamp();
    nData.updateNote(note);
    nData.addToQueue(note.id);
  }
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
