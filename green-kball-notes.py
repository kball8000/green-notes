from google.appengine.api import users
from datetime import datetime, timedelta
import json
import time
import webapp2

# custom modules
import models   # ndb.Model from app engine datastore

# debugging
#import random
# import time
# import logging
# TODO: add a cron job to check and remove duplicate ids.
# additional note.

def verify_next_id(user, _id):
    
    next_id = models.NoteId.get_id(user)
    if next_id <= _id:
        models.NoteId.set_id(user, (_id + 1))
    else:
        msg     = 'not newNote, but, id: %s is below next_id: %s' %(_id, next_id)
        obj     = {'error_type': 'id', 'message': msg}
        
        models.Error.put_error(user, obj)

class Basic(webapp2.RequestHandler):
    def get(self):
        
        login_url   = users.create_login_url('/')
        logout_url  = users.create_logout_url('/')
        page        = ''
        p1          = open('index.html')
        
        for line in p1:
            line = line.replace("login_url=''; logout_url='';",
                                "login_url='" + login_url + "';" + 
                                "logout_url='" + logout_url + "';")
            page += line
                
        self.response.write(page)

class GetUser(webapp2.RequestHandler):
    def post(self):
        
        user        = users.get_current_user()        
        user_id     = user.user_id() if user else None
        
        response    = {'user_id': user_id}
        
        if user_id:
            models.UserIds.save_id(user_id) # Save in dict for running backups
            
        self.response.headers['Content-Type'] = 'text/javascript'
        self.response.write(json.dumps(response))

class DelNote(webapp2.RequestHandler):
    # Have not yet and may note implement this.
    def post(self):
        user        = users.get_current_user()
        request     = json.loads(self.request.body)
        response    = {'val': 'success'}
        
        logging.info('requested note to delete: %s' %request)   # TESTING

        notes = models.Notes.get_notes(user)
        for note in notes:
            if note.info['id'] == 1:
                note.key.delete()
        
        self.response.headers['Content-Type'] = 'text/javascript'
        self.response.write(json.dumps(response))

class GetRestore(webapp2.RequestHandler):
    """ Send user list of notes to restore from different backup
    dates. """
    def post(self):
        """ Update backup object with latest notes from ndb. """
        user = users.get_current_user()

        if user:
            backup_obj = models.Backup.get_backup(user.user_id())
            response = backup_obj.info
        else:
            response = {'status': 'user not logged in!'}

        self.response.headers['Content-Type'] = 'text/javascript'
        self.response.write(json.dumps(response))
class GetNote(webapp2.RequestHandler):
    """Return an individual note, if updated, to app"""
    def post(self):
        """For a given user, return the requested note, if updated."""
        
        user            = users.get_current_user()
        response        = {
            'logged_in': False, 
            'note': {}, 
            'updated': False
            }
        request         = json.loads(self.request.body)
        app_modified    = request['modified']
        note_id         = request['id']

        if user:
            response['logged_in']   = True
            note = models.Notes.get_note(user, note_id)
            if app_modified < note.info['modified']:
                response['updated'] = True
                response['note']    = note.info
        else:
            response['login_url']   = users.create_login_url('/')
        
        self.response.headers['Content-Type'] = 'text/javascript'
        self.response.write(json.dumps(response))
class GetNotes(webapp2.RequestHandler):
    """Return all notes to app"""
    def post(self):
        """For a user, possibly in the cookie, returns all (500 max)
        notes to the app."""
        
        user        = users.get_current_user()
        response    = {'next_id': '', 'notes': []}
        
        if user:
            response['logged_in']   = True
            notes = models.Notes.get_notes(user)
            for note in notes:
                response['notes'].append(note.info)
                
            response['next_id'] = models.NoteId.get_id(user)
            response['time']    = int(time.time()*1000) # time since epoch, 1970, in milliseconds
        else:
            response['logged_in']   = False
            response['login_url']   = users.create_login_url('/')
        
        self.response.headers['Content-Type'] = 'text/javascript'
        self.response.write(json.dumps(response))
class Errors(webapp2.RequestHandler):
    # TODO: Implement this. Would be nice for app to log errors on server so I can check in a centralized place.
    def post(self):
        
        response    = []
        
        errors = models.Error.get_errors()
        for error in errors:
            response.append(error.id())
        
        self.response.headers['Content-Type'] = 'text/javascript'
        self.response.write(json.dumps(response))

class SaveNotes(webapp2.RequestHandler):
    def post(self):
                    
        def create_response(note, new=False):
            return {
                'id':       note['id'],
                'modified': note['modified'],
                'new_note': new,
                'saved':    False
            }
            
        def process_new_note(note, new=True):
            resp                = create_response(note, new=True)
            resp['initial_id']  = resp['id']

            try:
                new_note = models.Notes.save_new_note(user, note, new)
                for k, v in new_note.items():
                    resp[k] = v
            except:
                pass
            
            return resp
        
        def process_note(note):
            note_server = models.Notes.get_note(user, note['id'])

            resp = create_response(note)
            if not note_server:
                # This is an odd case where server issues cause data loss, it will recreate using client data.
                resp = process_new_note(note, new=False)
                verify_next_id(user, note['id'])    # CHECK THIS WORKS
                
            elif note['modified'] > note_server.info['modified']:  # STD
                resp['saved'] = models.Notes.save_note(note_server, note)
                
            elif note['modified'] < note_server.info['modified']:
                resp['old'] = True
                resp['update_from_server'] = note_server.info
                
            return resp
            
        user        = users.get_current_user()
        requests    = json.loads(self.request.body)
        
        response = {'next_id': '', 'notes': []}

        if user:
            response['logged_in']   = True
            for request in requests:
                request['pendingSave'] = 0  # Not using this currently 1/16/2018
                if request['newNote']:
                    response['notes'].append(process_new_note(request))
                else:
                    response['notes'].append(process_note(request))
            response['next_id'] = models.NoteId.get_id(user)
        else:
            response['logged_in']   = False
            response['login_url']   = users.create_login_url('/')

        self.response.headers['Content-Type'] = 'text/javascript'
        self.response.write(json.dumps(response)) 
        
app = webapp2.WSGIApplication([
    ('/', Basic),
    ('/error', Basic),
    ('/login', Basic),
    ('/notes', Basic),
    ('/search', Basic),
    ('/restore', Basic),
    ('/getuser', GetUser),
    ('/errors', Errors),
    ('/savenotes', SaveNotes),
    ('/delnote', DelNote),
    ('/getrestore', GetRestore),
    ('/getnote', GetNote),
    ('/getnotes', GetNotes)
  ], debug=False)