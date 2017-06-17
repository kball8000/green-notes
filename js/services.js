/* In general syncing is not perfect, could be better if time was synced with server and server then throws away old requests.
The way it works is send once, then put in a 'pending queue' for 1 minute. If no response from server, send another response. By not sending too many, it helps keep the server from getting duplicates.
*/

var app = angular.module('noteServices', [])
.service('nDates', function(){
  this.getTimestamp = function(d) {
    d = d || new Date();
    d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
    
    return [d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()];
  }
  this.toDate = function(arr) {
    let d = new Date(arr[0], arr[1], arr[2], arr[3], arr[4], arr[5]); 
    return d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  }
  this.stale = function(timestamp, duration) {
    timestamp = timestamp || [1900,0,1,0,0,0];
    return new Date() - this.toDate(timestamp) > duration;
  }
})
.service('nFuncs', function(nData, nDB) {
  // TODO: Move to nData
  this.setPref = function(key, value) {
    nData.userPrefs[key] = value;
    nDB._put('userPrefs', nData.userPrefs);
  }
})
.service('nUtils', function() {
  this.replaceBRs = function(text) {
    return text.replace(/(<br>)/g, '\n');
  }
  this.replElemString = function(text, elem, newElem) {
    let idx = text.indexOf(elem);
    while(idx !== -1){
      text = text.replace(elem, newElem);
      idx = text.indexOf(elem);
    }
    return text;
  }
  this.replaceBreaks = function(text) {
    return text.replace(/\n/g, '<br>');
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
  var data = {
    allNotes:       [],
    displayNotes:   [],
    notearea:       '',
    notesHashTable: {},   // only in create note, need to adjust if server changes id
    selectedNote:   {},
    timeouts:       {db: '', server: ''},
    // pending is saves sent to server and awaiting responses.
    pendingQueue:   [],
    retries:        0,
    serverQueue:    [],
    serverOffset:   0,
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
      return (data.userPrefs.showTrash) ? note.deleted.length : !note.deleted.length;  
    });
  }
  function filterFavs() {
    if (data.userPrefs.showFavs){
      data.displayNotes = data.displayNotes.filter((n) => { return n.fav });
    } 
  }
  function sortDisplayNotes() {
    function sortByTitle(a, b) {
      a = angular.lowercase(a.title);
      b = angular.lowercase(b.title);
      if(a < b) {
        return -1;
      }
      return 1;
    }
    function sortByDate(a, b) {
      let x   = a.modified, 
          y   = b.modified,
          d1  = new Date(x[0], x[1], x[2], x[3], x[4], x[5]),
          d2  = new Date(y[0], y[1], y[2], y[3], y[4], y[5]);
  
      if (d1<d2) {
          return 1;
      }
      return -1;
    }
    
    if (data.userPrefs.sortBy === 'title') {
      data.displayNotes.sort(sortByTitle);
    } else {
      data.displayNotes.sort(sortByDate);
    }
    
  }
  function isListEmpty() {
    data.userPrefs.noNote = (data.displayNotes.length === 0) ;
  }
  function setSelectedNote() {
    let id = data.userPrefs.selectedId,
        note = nUtils.getById(data.displayNotes, id)
    if (note) {
      data.selectedNote = note;
      data.notearea = nUtils.replaceBRs(note.content);
    } else {
      if (data.displayNotes.length) {
        note = data.displayNotes[0];
        data.selectedNote = note;
        data.userPrefs.selectedId = note.id;
        nDB._put('userPrefs', data.userPrefs);
        data.notearea = nUtils.replaceBRs(note.content);
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
  data.createNoteObj = function(id) {
    let timestamp = nDates.getTimestamp(),
        obj = {
          id:           (id === 0 || id) ? id : getNextId(),
          title:        '',
          content:      '',
          fav:          false,
          created:      timestamp,
          modified:     timestamp,
          deleted:      [],
          // newNote is used by server: create note or modify existing.
          newNote:      true,
          pendingSave:  [],
          tags:         []
        }
    
    // Adds to hash table for easy access to notes.
    this.notesHashTable[obj.id] = obj;
    
    return obj
  }
  data.refreshDisplayNotes = function() {
    data.displayNotes = data.allNotes;
    hideDeletedNotes();
    filterFavs();
    sortDisplayNotes();
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
    data.selectedNote.deleted  = [];
    data.refreshDisplayNotes();        
  }
  data.saveNotearea = function() {
    data.selectedNote.content = nUtils.replaceBreaks(data.notearea);
    data.selectedNote.modified = nDates.getTimestamp();
  }
  data.selectNote = function() {
    setSelectedNote();
  }
  data.sortDisplayNotes = function() {
    sortDisplayNotes();
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
    // Sum of 1+2+..n = n*(n+1)/2, 50 retries => 1275
    caller = caller || 'no caller specified';
    let wait_defer  = $q.defer(),
        retries     = 18,
        retries_i   = retries,  // TESTING
        max_timeout = retries + 1;
    var t0 = 0, t1 = 0; // TESTING

    function timeStep() {
//      With retries of 18, this is minimum 30 s
      return Math.pow((max_timeout - retries),3) + 50;
    }
    
    function check(){
      if(checks[val]){
        wait_defer.resolve(retries);
      } else if(retries){
        t1 = timeStep();
        console.log(caller + ', retries: ' + retries + ', waitFor time-other: ' + (performance.now()-t0) + 'timeout: ' + t1);
        $timeout(check, t1);
        retries--;
      } else{
        wait_defer.reject('Did not load within time limit');
      }
    }
    
    if(checks[val]){
      console.log(caller + ' resolved on first try: ' + checks[val]);
      wait_defer.resolve(0);
    } else{
      t0 = performance.now();
      t1 = timeStep();
      console.log(caller + ', retries: ' + retries + ' waitFor: ' + t0 + ', t1: ' + t1);
      $timeout(check, t1);
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
      this.waitFor('open', 'nDB._put-open').then(() => put_val());
//      this.waitFor('open').then(() => put_val());
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
    
    this.waitFor('open', 'nDB._get-open').then(r => get_val())
//    this.waitFor('open').then(r => get_val())

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
        return inTrash ? note.deleted.length : !note.deleted.length;
      })
    }
    function filterFn(elem) {
      let lowercaseQuery = angular.lowercase(query);
      return elem.value.indexOf(lowercaseQuery) !== -1;
    }
    
    let arr = (inFavs) ? filterFavs(nData.allNotes) : nData.allNotes;
    arr = filterTrash(arr, inTrash);
    arr = arr.map( note => {
      let title   = note.title.toUpperCase(),
          content = nUtils.replElemString(note.content, '<br>', ' '),
          value   = (title + '' + content).toLowerCase();  // for search filter.
      
      return {id: note.id, value: value, title: title, content: content};
    })
    
    return arr.filter(filterFn);  
  }
})
.service('nServer', function($http, $mdDialog, $q, $window, nData, nDates, nDB, nFuncs, nUtils){
  function httpReq(_typ, data){
    var url = $window.location.origin;
    if(_typ === 'getAll') {
      url += '/getnotes';
      return $http.get(url);
    } else if(_typ === 'saveNotes') {
      url += '/savenotes';
      return $http.post(url, data);
    } else if(_typ === 'getrestore') {
      url += '/getrestore';
      return $http.get(url);
    } else if(_typ === 'getUser') {
      url += '/getuser';
      return $http.get(url);
    }
  }
  function userLogin(url) {
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
      nFuncs.setPref('lastCloudIgnoreDate', nDates.getTimestamp());
    });
  }
  function saveNotes() {
    nData.checkPending();

    if (nData.serverQueue.length) {
      httpReq('saveNotes', nData.serverQueue).then( r => {
        if(r.data.logged_in) {
          processNextId(r.data.next_id);
          angular.forEach(r.data.notes, note => {
              processNoteResponse(note);
          });
        // Not using next 2 lines currently in syncing solution 2017 May 16.
          r.data.timestamp[1]--; // convert month to javascript;
          processTimeSync(r.data.timestamp);          
        } else {
          userLogin(r.data.login_url);
        }
      }, function(r) {
        let x = r.data || 'request failed';
      })

      nData.requestToSave();
    }
  }
  function removeFromServerQueue(note, modified_serv) {
    
    nUtils.removeById(nData.pendingQueue, note.id);
    
    if (!angular.equals(note.modified, modified_serv)) {
      nData.addToQueue([note.id]);
      saveNotes();
    }
  }
  // DEPRECATED verify_NextId 2017 May 28 ... why would the counter go down, that is what this is checking for.
  function verify_NextId(nextIdServer) {
    let maxId = 0, response;
    
    angular.forEach(nData.allNotes, note => {
      maxId = (note.id > maxId) ? note.id : maxId;
    })
    
    if(isNaN(nextIdServer)) {
      response = maxId + 1;
    } else if(nextIdServer > maxId) {
      response = nextIdServer;
    } else {
      response = maxId + 1;
    }
    
    return response;
  }
  function processNewNote(serverData) {
    let id = serverData.initial_id || serverData.id;
    let note = nUtils.getById(nData.allNotes, id);
    
    if(serverData.saved || serverData.duplicate) {
      note.id       = serverData.id;
      note.newNote  = false;
    }
    
    if (serverData.initial_id === nData.userPrefs.selectedId) {
      nFuncs.setPref('selectedId', serverData.id);
    }
    
    // Update allNotes hash table
    if (serverData.initial_id !== serverData.id) {
      delete nData.notesHashTable[serverData.initial_id];
      nData.notesHashTable[serverData.id] = note;
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
      nFuncs.setPref('nextId', id);
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
  this.getAll = function(evt) {
    var defer = $q.defer();
    
    httpReq('getAll').then( r => {
      /* Better name is sync. It can be ignored for the day if user wants to be in an 'offline' mode in case connectivity is slow or intermittent. */
//      nDB.waitFor('loaded').then( () => {
      nDB.waitFor('loaded', 'httpReq-getall-loaded').then( () => {
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
              nData.notesHashTable[localNote.id] = localNote;
              nData.updateNote(serverNote.id, serverNote);
              updated = true;
              
            } else if (localNote.newNote) {
              let newLocalNote = nData.createNoteObj();
              nData.allNotes.push(newLocalNote);
              nData.updateNote(newLocalNote.id, localNote);
              nData.updateNote(localNote.id, serverNote);
            
              if(nData.userPrefs.selectedId === localNote.id) {
                nFuncs.setPref('selectedId', newLocalNote.id);
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
          console.log('logged in and going to process notes');
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
            console.log('server-getall, will update display');
            nData.refreshDisplayNotes();
          }
        } else {
          console.log('getall, user not logged in');
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
    
    httpReq('getUser').then( r => {
//      nDB.waitFor('open').then( () => {
      nDB.waitFor('open', 'getUser-open').then( () => {
        deferred.resolve(r.data.user_id);
      });
    }, () => {
        deferred.reject();
    })
      
    return deferred.promise;
  }
  this.getRestore = function() {
    var deferred = $q.defer();
    
    httpReq('getrestore').then( r => {
//      nDB.waitFor('open').then( () => {
      nDB.waitFor('open', 'getrestore-open').then( () => {
        deferred.resolve(r.data);
      });
    }, () => {
        deferred.reject();
    })
      
    return deferred.promise;    
  }
});