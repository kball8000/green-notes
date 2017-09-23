/* In general syncing is not perfect, could be better if time was synced with server and server then throws away old requests.
The way it works is send once, then put in a 'pending queue' for 1 minute. If no response from server, send another response. By not sending too many, it helps keep the server from getting duplicates.
*/

var app = angular.module('noteServices', [])
.service('nDates', function(){
  this.getTimestamp = () => Date.now();
  this.stale = function(timestamp, duration) {
    timestamp = timestamp || 0;
    return Date.now() - timestamp > duration;
  }
})
.service('nUtils', function() {
  this.replElemString = function(text, elem, newElem) {
    let idx = text.indexOf(elem);
    while(idx !== -1){
      text = text.replace(elem, newElem);
      idx = text.indexOf(elem);
    }
    return text;
  }
  this.getById = function(list, id) {
    return list.filter( r => {return r.id === id;})[0]
  }
  this.removeElem = function(list, elem) {
    list.splice(list.indexOf(elem), 1);
  }
  this.removeById = function(list, id) {
    let index;
    
    angular.forEach(list, (note, idx) => {
      if (note.id === id) {
        index = idx;
      }
    })
    
    list.splice(index, 1);
    
  }
  this.idInList = function(arr, id) {    
    return arr.findIndex( note => { return id === note.id; }) !== -1;
  }
})
.service('nData', function($mdDialog, nDates, nUtils, nDB) {
 /* This object is the main object displayed. It is common / reused among the different pages, i.e. current / hourly... data object contains all weather info per zip code. */

  //  Shared Object
  let speech = {
    recognition:    {}, 
    translationBox: false, 
    userTalking:    false, 
    errorMsg:       '',
    listeningMsg:   '',
    translatedText: ''
  };
  var data = {
    allNotes:       [],
    displayNotes:   [],
    selectedNote:   {},
    timeouts:       {db: '', server: ''},
    // pending is saves sent to server and awaiting responses.
    pendingQueue:   [],
    retries:        0,    // TESTING
    serverQueue:    [],
    cursorLocation: 0,
    recognition:    {},
    serverOffset:   0,
    speech:         speech,
    timeDifference: 0,    // TESTING
    userPrefs:      {}
  };

//  Initialization Stuff
  function getNextId() {
    let id = data.userPrefs.nextId++;
    nDB._put('userPrefs', data.userPrefs);
    return id;
  }
  data.initUserPrefs = function() {
    return {
      nextId:     0,
      selectedId: 0,
      showFavs:   false,
      showTrash:  false,
      noNote:     false,
      sortBy:     'date',
      lastCloudIgnoreDate: []
    }
  }

//  Local functions 
  function hideDeletedNotes() {
    data.displayNotes = data.allNotes.filter((note) => {
      return (data.userPrefs.showTrash) ? note.deleted : !note.deleted;
    });
  }
  function filterFavs() {
    if (data.userPrefs.showFavs){
      data.displayNotes = data.displayNotes.filter((n) => { return n.fav });
    } 
  }
  function isListEmpty() {
    data.userPrefs.noNote = (data.displayNotes.length === 0) ;
  }
  function setSelectedNote() {
    // In case because of selection, i.e. favorites button selected, the current selected note is 
    // no longer in the list of displayed notes, fallback to something else.
    let id = data.userPrefs.selectedId,
        note = nUtils.getById(data.displayNotes, id)
    if (note) {
      data.selectedNote = note;
    } else {
      if (data.displayNotes.length) {
        note = data.displayNotes[0];
        data.selectedNote = note;
        data.userPrefs.selectedId = note.id;
        nDB._put('userPrefs', data.userPrefs);
      } else {
        data.selectedNote = {title: '', content: ''};
      }
    }
  }
  function checkStalePendingNote(note) {
    if(nDates.stale(note.pendingSave, 60*1000)) {
      nUtils.removeElem(data.pendingQueue, note);
      data.serverQueue.push(note);
    }
  }
  
//  Shared functions to controllers
  data.setPref = (key, value) => {
    data.userPrefs[key] = value;
    nDB._put('userPrefs', data.userPrefs);
  }
  data.createNoteObj = function(id) {
    let timestamp = nDates.getTimestamp();
    return {
          id:           (id === 0 || id) ? id : getNextId(),
          title:        '',
          content:      '',
          fav:          false,
          created:      timestamp,
          modified:     timestamp,
          deleted:      0,
          // newNote is used by server: create note or modify existing.
          newNote:      true,
          pendingSave:  [],
          tags:         []
        }
  }
  data.refreshDisplayNotes = function() {
    data.displayNotes = data.allNotes;
    hideDeletedNotes();
    filterFavs();
    setSelectedNote();
    isListEmpty();
  }
  data.removeNote = function() {
    let ts = nDates.getTimestamp();
    data.selectedNote.modified = ts;
    data.selectedNote.deleted  = ts;
    data.refreshDisplayNotes();    
  }
  data.restoreNote = function() {
    data.selectedNote.modified = nDates.getTimestamp();
    data.selectedNote.deleted  = 0;
    data.refreshDisplayNotes();        
  }
  data.selectNote = function() {
    setSelectedNote();
  }
  data.updateNote = function(id, newData) {    
    let note = nUtils.getById(data.allNotes, id);
    angular.forEach(newData, (value, key) => note[key] = value);    
    return note;
  }
  data.alertUserIfDuplicateTitle = () => {
    function duplicateTitle() {        
      let count = 0,
          title = data.selectedNote.title;

      data.allNotes.forEach( note => {
        (note.title.toLowerCase() === title.toLowerCase()) ? count++ : 0;
      })

      return count > 1;
      }

    function showDuplicateTitleAlert() {
      $mdDialog.show(
        $mdDialog.alert()
          .parent(angular.element(document.querySelector('#mainNotePage')))
          .clickOutsideToClose(true)
          .title('Duplicate Note Title')
          .textContent('There is another note with the same title')
          .ariaLabel('Duplicate Note Title Alert Dialog')
          .ok('Got it!')
      );  
    }

    if(duplicateTitle()) {
      showDuplicateTitleAlert();
    }
  }
  data.checkPending = function() {
    data.pendingQueue.forEach( note => {
      checkStalePendingNote(note);
    })    
  }
  data.addToQueue = function(_ids) {
    let ids = (Array.isArray(_ids)) ? _ids : [_ids];
    let inPendingQueue, inServerQueue, note;
    
    ids.forEach( id => {
      inPendingQueue  = nUtils.idInList(data.pendingQueue, id);
      inServerQueue   = nUtils.idInList(data.serverQueue, id);
      note            = nUtils.getById(data.allNotes, id);
      if(!inPendingQueue && !inServerQueue){
        data.serverQueue.push(note);      
      } else if(inPendingQueue){
        checkStalePendingNote(note);
      }
    })
  }
  data.requestToSave = function() {
    angular.forEach(data.serverQueue, note => {
      note.pendingSave = nDates.getTimestamp();
      if (!nUtils.idInList(data.pendingQueue, note.id)) {
        data.pendingQueue.push(note);
      }
    })
    data.serverQueue = [];
  }
  
  return data;
})
.service('nDB', function($q, $timeout, nDates){
  const DB_NAME     = 'greenNotesDB';
  const DB_VERSION  = 1.0;
  
  var db = {};
  var checks = {open: false, loaded: false};
  var userId;
  
  function getUserKey(key) {
    return userId + '-' + key;
  }

  this.setUserId = function(newUserId) {
    if (newUserId) {
      userId = newUserId;
    }
    return userId;
  }
  this.openDB = function() {
    var defer = $q.defer();
    var request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = function(e){
      db = this.result;
      checks.open = true;
      defer.resolve();
    }
    request.onerror = function(e){
      defer.reject();
    }
    
    request.onupgradeneeded = function(e){
      var db = e.target.result;
      var wStore = db.createObjectStore('green-notes', {keyPath: 'id'});
    }
    return defer.promise;
  }
  this.waitFor = function(val, caller) {
    caller = caller || 'no caller specified';
    let wait_defer  = $q.defer(),
        retries     = 18,
        max_timeout = retries + 1;

    function timeStep() {
      // With retries of 18, this is minimum 30s
      return Math.pow((max_timeout - retries),3) + 50;
    }
    
    function check(){
      if(checks[val]){
        wait_defer.resolve(retries);
      } else if(retries){
        $timeout(check, timeStep());
        retries--;
      } else{
        wait_defer.reject('Did not load: ' + caller + ' within time limit');
      }
    }
    
    if(checks[val]){
      wait_defer.resolve(0);
    } else{
      $timeout(check, timeStep());
    }

    return wait_defer.promise;
  }
  this.setLoaded = function() {
    checks.loaded = true;
  }
  this._put = function(key, value, nowrap) {
    var deferred = $q.defer();
    
    function put_val(){
      let _key = nowrap ? key : getUserKey(key);
      var request = db.transaction(['green-notes'], 'readwrite')
      .objectStore('green-notes')
      .put({id: _key, value: value});
      
      request.onsuccess = function(r){
        deferred.resolve(r.target.result);
      }
    }
    
    if (userId) {
      this.waitFor('open').then(() => put_val());
    }
    
    return deferred.promise;
  }
  this._get = function(key, nowrap) {
    var deferred = $q.defer();
    
    function get_val(){
      let _key = nowrap ? key : getUserKey(key);
      var request = db.transaction(['green-notes'], 'readonly')
      .objectStore('green-notes')
      .get(_key);
      
      request.onsuccess = function(r){
        deferred.resolve(r.target.result);
      }
      request.onerror = function(e){
        deferred.reject('could not retrieve entry from DB');
      }
    }
    
    this.waitFor('open').then(r => get_val())

    return deferred.promise;
  }
})
.service('nSearch', function(nData, nUtils) {
  this.querySearch = function(query, inFavs, inTrash) {
    function filterFavs(arr) {
      return arr.filter(note => { return note.fav; })
    }
    function filterTrash(arr, inTrash) {
      return arr.filter(note => {
        return inTrash ? note.deleted : !note.deleted;
      })
    }
    function filterFn(elem) {
      let lowercaseQuery = angular.lowercase(query);
      return elem.value.indexOf(lowercaseQuery) !== -1;
    }
    function removeFormatElements(str) {
      let arr = ['<br>', '.h1', '---', '--', '__', '**', '~~'];
      for (x in arr) {
        str = nUtils.replElemString(str, arr[x], '');
      }
      return str;
    }
    function trimContent(str) {
      let numKeepChars = 20,
          idx           = str.indexOf(query);
      idx = (idx < numKeepChars) ? 0 : idx - numKeepChars;
      return str.slice(idx);
    }
    
    let arr = (inFavs) ? filterFavs(nData.allNotes) : nData.allNotes;
    arr = filterTrash(arr, inTrash);
    arr = arr.map( note => {
      let title   = note.title.toUpperCase(),
          content = removeFormatElements(note.content),
          value   = (title + ' ' + content).toLowerCase();  // for search filter.
      
      return {id: note.id, value: value, title: title, content: trimContent(content)};
    })
    
    return arr.filter(filterFn);  
  }
})
.service('nSpeech', function($timeout, nData, nDates, nDB, nServer) {
  function replaceNumbers(str) {
    let arr = [, /one/gi, /two/gi, /three/gi];
    str = str || '';

    for (let n in arr){
      str = str.replace(arr[n], parseInt(n));
    }

    return str;    
  }
  function addLeadOrTrailSpaces(str0, str1, newStr) {
    str0    = str0    || '';
    str1    = str1    || '';
    newStr  = newStr  || '';
    
    let endOfSentence     = /[.!?] *$/,
        endsWithNewline   = /\n$/,
        endsWithSpace     = / $/,
        startsWithCapital = /^ *[A-Z]/,
        startsWithNewline = /^\n/,
        startsWithSpace   = /^ /,
        capNewStr         = newStr[0].toUpperCase() + newStr.slice(1);

      // Three options for previous string::
      //   newline or nothing before newString > no space + cap
      //   . > space and cap  
      //   !. > space
    if (str0.match(endsWithNewline) || str0.match(endOfSentence) || str0.length === 0) {
      newStr = capNewStr;
    }
    newStr = str0.match(endsWithSpace) ? newStr : ' ' + newStr;      

      // Two options, starts with: 
      //   newline nothing after newString > append .
      //   _ > space
    if (str1.match(startsWithNewline) || str1.match(startsWithCapital) || str1.length === 0) {
      newStr = newStr + '.';
    }
    newStr = str1.match(startsWithSpace) ? newStr : newStr + ' ';      
          
    return newStr;
  }
  function processGrocery(newStr) {
    // since voice recognition gets and, at and 'add' confused.
    let idx, arr = ['add ', 'and ', 'at '];

    for (let x in arr) {
      idx = newStr.indexOf(arr[x]);
      
      while (idx !== -1) {
        newStr = newStr.replace(arr[x], '\n');
        newStr = newStr.slice(0, idx+1) + newStr[idx+1].toUpperCase() + newStr.slice(idx+2);
        idx = newStr.indexOf(arr[x]);
      }            
    }
    newStr = replaceNumbers(newStr);
    return newStr;
  }

  this.startListeningAnimation = () => {
    // function startListeningAnimation() {
    let ticks     = 0, 
      initMsg   = 'Listening'
      _interval = 400;

    nData.speech.listeningMsg = initMsg;

    function tick() {
      if (nData.speech.userTalking) {
        if (ticks < 3) {
          nData.speech.listeningMsg += ' .';
          ticks++;
        } else {
          nData.speech.listeningMsg = initMsg;
          ticks = 0;
        }
        $timeout(tick, _interval);
      } else {
        nData.speech.listeningMsg = '';
      }
    }

    tick();
  }
  this.clearTranslationBox = (keepDisplayed) => {
    nData.speech.errorMsg       = '';
    nData.speech.listeningMsg   = '';
    nData.speech.translatedText = ''; 
    nData.speech.translationBox = keepDisplayed;
  }
  this.acceptTranslation = () => {
    let newChunk    = nData.speech.translatedText,
        cursor      = nData.selectedNote.cursorLocation,
        content     = nData.selectedNote.content,
        chunk_1     = content.slice(0, cursor),
        chunk_2     = content.slice(cursor);

    // add spaces and capitalization if needed.
    if(nData.selectedNote.title.match(/grocery/i)) {
      newChunk = processGrocery(newChunk)
    } else {
      newChunk = addLeadOrTrailSpaces(chunk_1, chunk_2, newChunk);  
    }
    
    // WORKING HERE. NEED TO GET LENGTH FROM GROCERY FILTER
    // WORKING HERE. NEED TO GET LENGTH BACK FROM addLEADorTRAILspaces
    // NEED TO GO BACK TO NOT MODIFYING STR0 OR STR1 IN REMOVE LEAD/TRAIL SPACES.


    // Update Params
    nData.selectedNote.content        = chunk_1 + newChunk + chunk_2;
    nData.selectedNote.cursorLocation = (newChunk) ? cursor + newChunk.length : cursor;
    nData.selectedNote.modified       = nDates.getTimestamp();

    // Save Selected Note
    nDB._put('allNotes', nData.allNotes);
    nData.addToQueue([nData.selectedNote.id]);
    nServer.save();
  }
})


.service('nServer', function($http, $mdDialog, $q, $window, nData, nDates, nDB, nUtils){
  function httpReq(_typ, url, data){
    url = $window.location.origin + '/' + url;
    return $http[_typ](url, data);
  }    
  function userLogin(url, evt) {
    let expiredUserPref = nDates.stale(nData.userPrefs.lastCloudIgnoreDate, 24*60*60*1000);
    
    if(evt !== 'onload' && expiredUserPref) {
      serverLoginDialog(url);
    } 
  }
  function serverLoginDialog(loginUrl){
    var confirm = $mdDialog.confirm()
          .title('Log in to cloud?')
          .textContent('(Decision lasts 1 day)')
          .ariaLabel('note conflict')
          .ok('Log In')
          .cancel('No Thanks');

    $mdDialog.show(confirm).then(function() {
      $window.location.href = loginUrl;
    }, function() {
      nData.setPref('lastCloudIgnoreDate', nDates.getTimestamp());
    });
  }
  function saveNotes() {
    nData.checkPending();

    if (nData.serverQueue.length) {
      httpReq('post', 'savenotes', nData.serverQueue).then( r => {
        if(r.data.logged_in) {
          processNextId(r.data.next_id);
          nData.timeDifference = Date.now() - r.data.time;
          angular.forEach(r.data.notes, note => {
              processNoteResponse(note);
          });
        } else {
          userLogin(r.data.login_url, 'savenote');
        }
      }, function(r) {
        let x = r.data || 'request failed';
      })

      nData.requestToSave();
    }
  }
  function removeFromServerQueue(note, modified_serv) {
    
    nUtils.removeById(nData.pendingQueue, note.id);
    
    if (note.modified !== modified_serv) {
      nData.addToQueue([note.id]);
      saveNotes();
    }
  }
  function processNewNote(serverData) {
    let id = serverData.initial_id || serverData.id;
    let note = nUtils.getById(nData.allNotes, id);
    
    if(serverData.saved || serverData.duplicate) {
      note.id       = serverData.id;
      note.newNote  = false;
    }
    
    if (serverData.initial_id === nData.userPrefs.selectedId) {
      nData.setPref('selectedId', serverData.id);
    }
    
    return note
  }
  function processNoteResponse(data) {
    var note, saveNotesToDb = true;
    if (data.new_note) {  // newNote
      note  = processNewNote(data);
    } else if (data.old){ // conflict, server had latest note
      note = nData.updateNote(data.id, data.update_from_server);
    } else {              // STD
      note = nUtils.getById(nData.allNotes, data.id);
      saveNotesToDb = false;
    }
    
    if(saveNotesToDb) {
      nDB._put('allNotes', nData.allNotes);
    }
    
    // important to use data.modified as it is the timestamp of the note sent to server
    // for save and note.modified could've been updated locally by user editing note.
    removeFromServerQueue(note, data.modified);

  }
  function processNextId(id) {    
    if(id > nData.userPrefs.nextId){
      nData.setPref('nextId', id);
    }
  }
  function processTimeSync(serverTs) {
    // Not using this currently in syncing solution 2017 May 16.
    nData.serverOffset = new Date() - nDates.toDate(serverTs);
  }
  function removeDuplicates() {
    
    let ids = {}, toRemove = [], toAdd = [];
    
    nData.allNotes.forEach( (note, idx) => {
      let key = note.id;
      ids[key] = (key in ids) ? (toRemove.push(idx)) : true;
    })

    while(toRemove.length) {
      let newNote = nData.createNoteObj();
      newNote.title = 'New ' + newNote.title;
      toAdd.push(newNote);
      nData.allNotes.splice(toRemove.pop(), 1);
    }
    
    while(toAdd.length) {
      nData.allNotes.push(toAdd.pop());
    }
    
    nDB._put('allNotes', nData.allNotes);
  }
  function findNotesToSync(serverIds) {
    /* Input is obj of server ids, val=true. This determines if there are any local notes that need to be synced. */
    nData.allNotes.forEach( n => {
      if( !(n.id in serverIds) ) {
        nData.addToQueue(n.id);
      }
    })
  } 
  this.save = function() {
    saveNotes();
  }
  this.getNote = function(note) {
    
    let data = {
      id:       note.id, 
      modified: note.modified
    };
    
    httpReq('post', 'getnote', data).then( r => {
      if (r.data.logged_in) {
        if (r.data.updated){
          nData.updateNote(r.data.note.id, r.data.note);
          nData.refreshDisplayNotes();
          nDB._put('allNotes', nData.allNotes);
        }
      } else {
        userLogin(r.data.login_url, evt);
      }
    })
  }
  this.getAll = function(evt) {
    var defer = $q.defer();
    
    httpReq('get', 'getnotes').then( r => {
      /* Better name is sync. It can be ignored for the day if user wants to be in an 'offline' mode in case connectivity is slow or intermittent. */
      nDB.waitFor('loaded').then( () => {
        let localNote,
            updated   = false,
            serverIds = {};

        function processNotes(notes) {
          angular.forEach(notes, serverNote => {
            serverIds[serverNote.id] = true;
            localNote = nUtils.getById(nData.allNotes, serverNote.id);
            
            if (!localNote) {
              localNote = nData.createNoteObj(serverNote.id);
              nData.allNotes.push(localNote);
              nData.updateNote(serverNote.id, serverNote);
              updated = true;
              
            } else if (localNote.newNote) {
              let newLocalNote = nData.createNoteObj();
              nData.allNotes.push(newLocalNote);
              nData.updateNote(newLocalNote.id, localNote);
              nData.updateNote(localNote.id, serverNote);
            
              if(nData.userPrefs.selectedId === localNote.id) {
                // data.setPref
                nData.setPref('selectedId', newLocalNote.id);
              }
              updated = true;
              
            } else if (serverNote.modified > localNote.modified) {
              nData.updateNote(serverNote.id, serverNote);
              updated = true;
              
            } else if (serverNote.modified < localNote.modified) {
              nData.addToQueue([serverNote.id]);
            }
          })
        }
        
        if (r.data.logged_in) {
          processNextId(r.data.next_id);
          processNotes(r.data.notes);
          nData.timeDifference = Date.now() - r.data.time;
          findNotesToSync(serverIds);
          this.save();
          // TODO add some functionality to server to delete so that I can run
          // run the remove dups first. this.save can do all three, update notes,
          // create notes and delete notes from server, not just the soft delete from 
          // user interaction.
          removeDuplicates();

          if (updated) {
            nDB._put('allNotes', nData.allNotes);
            nData.refreshDisplayNotes();
          }
        } else {
          userLogin(r.data.login_url, evt);
        }
        
        defer.resolve();
        
      })
      
    }, function(r) {
      defer.resolve();
    })
    
    return defer.promise;
  }
  this.getUser = function() {
    var deferred = $q.defer();
    
    httpReq('get', 'getuser').then( r => {
      nDB.waitFor('open').then( () => {
        deferred.resolve(r.data.user_id);
      });
    }, () => {
        deferred.reject();
    })
      
    return deferred.promise;
  }
  this.getRestore = function() {
    var deferred = $q.defer();
    
    httpReq('get', 'getrestore').then( r => {
      nDB.waitFor('open').then( () => {
        deferred.resolve(r.data);
      });
    }, () => {
        deferred.reject();
    })
      
    return deferred.promise;    
  }
});