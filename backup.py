# Debugging Standard Imports
import logging

# Main Standard Imports
from datetime import datetime, timedelta
import time

# Main Custom Imports
import webapp2
from google.appengine.api import users
import models   # ndb.Model from app engine datastore

INTERVALS = [
    {'key': 'most_recent', 'value': None},
    {'key': 'one_week', 'value': 7*24*60*60*1000},
    {'key': 'six_months', 'value': 26*7*24*60*60*1000},
    {'key': 'one_year', 'value': 52*7*24*60*60*1000}
]

def date_obj_to_int(d):
    epoch = datetime(1970,1,1)
    return int((d - epoch).total_seconds())

def convert_to_dict(note):
    return {
        'email':    note.email,
        'user_id':  note.user_id,
        'info':     note.info,
        'note_id':  note.note_id,
        'date':     date_obj_to_int(note.date)
    }

def process_notes(notes, backup):
    """Organize the notes list within the backup object."""
    # logging.info('\n\nprocessnotes, notes: %s' %notes)
    now = int(time.time()*1000)     # Time since epoch in milliseconds
    logging.info('\n\nprocessnotes, now ******: %s' %now)
    updated = False

    def init_backup_obj():
        backup = {}
        for interval in INTERVALS:
            backup[interval['key']] = {
                'notes': notes, 
                'date_mod': now
                }
        return backup

    if not backup:
        loggin.info('nobackup exists')
        backup = init_backup_obj()
        updated = True
    else:
        logging.info('backup exists, UPDATING...')
        temp = {}
        for k,v in backup.items():
            temp[k] = v
        logging.info('temp: %s' %temp)

        for interval in INTERVALS:
            key     = interval['key']
            limit   = interval['value']

            if key == 'most_recent':
                logging.info('checking mostrecent')
                a = backup['most_recent']['notes'] != notes
                # b = len(backup['most_recent']['notes']) > 0.9*len(notes)
                # a real rough check so that we do not overwrite a lot of notes with zero notes.
                b = len(notes) > 0.9*len(backup['most_recent']['notes'])
                logging.info('checking mostrecent, a: %s, b: %s' %(a,b))
                if a and b:
                    backup['most_recent']['notes']      = notes
                    backup['most_recent']['date_mod']   = now
                    updated = True
            else:
                logging.info('checking other, now: %s' %now)
                logging.info('checking other, checknow: %s' %backup[key]['date_mod'])
                logging.info('checking other, limit: %s' %limit)
                logging.info('checking other, check: %s' %(now - backup[key]['date_mod'] > limit))
                if now - backup[key]['date_mod'] > limit:
                    prev_index  = INTERVALS.index(interval) - 1
                    prev_key    = INTERVALS[prev_index]['key']
                    prev        = temp[prev_key]
                    backup[key]['notes']    = prev['notes']
                    backup[key]['date_mod'] = prev['date_mod']
                    updated = True

    return backup, updated

class Backup(webapp2.RequestHandler):
    """ Update backup object with latest notes from ndb. """
    def get(self):
        """ Update backup object with latest notes from ndb. """
        all_users   = models.UserIds.get_ids()
        logging.info('backup, allusers: %s' %all_users)
        updated     = False

        for user_id in all_users.ids:

            notes = models.Notes.get_notes_backup(user_id)
            # logging.info('\n\nbackup, notes: %s' %notes)
            notes_dict = [convert_to_dict(note) for note in notes]
            logging.info('\n\nbackup, notes_dict: %s' %notes_dict)

            backup_obj                  = models.Backup.get_backup(user_id)
            logging.info('\n\nbackup, backupobs: %s' %backup_obj)
            backup_obj.info, updated    = process_notes(notes_dict, backup_obj.info)

            if updated:
                logging.info('backupobj.put(): %s' %backup_obj)
                backup_obj.put()


                
app = webapp2.WSGIApplication([
    ('/backup', Backup)
  ], debug=False)