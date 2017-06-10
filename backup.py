# Debugging Standard Imports
# import time
# import logging

# Main Standard Imports
from datetime import datetime, timedelta
import webapp2

# Main Custom Imports
from google.appengine.api import users
import models   # ndb.Model from app engine datastore

INTERVALS = [
    {'key': 'most_recent', 'value': None},
    {'key': 'one_week', 'value': timedelta(weeks=1)},
    {'key': 'six_months', 'value': timedelta(weeks=26)},
    {'key': 'one_year', 'value': timedelta(weeks=52)}
]

def date_obj_to_list(d):
    return [d.year, d.month, d.day, d.hour, d.minute, d.second]

def date_list_to_obj(d):
    return datetime(d[0], d[1], d[2], d[3], d[4], d[5])

def convert_to_dict(note):
    return {
        'email':    note.email,
        'user_id':  note.user_id,
        'info':     note.info,
        'note_id':  note.note_id,
        'date':     date_obj_to_list(note.date)
    }

def process_notes(notes, backup):
    """Organize the notes list within the backup object."""
    now_obj = datetime.utcnow()
    now_li  = date_obj_to_list(now_obj)
    updated = False

    def init_backup_obj():
        backup = {}
        for interval in INTERVALS:
            backup[interval['key']] = {
                'notes': notes, 
                'date_mod': now_li
                }
        return backup

    if not backup:
        backup = init_backup_obj()
        updated = True
    else:
        temp = {}
        for k,v in backup.items():
            temp[k] = v

        for interval in INTERVALS:
            key     = interval['key']
            limit   = interval['value']

            if key == 'most_recent':
                a = backup['most_recent']['notes'] != notes
                b = len(backup['most_recent']['notes']) > 0.9*len(notes)
                if a and b:
                    backup['most_recent']['notes']      = notes
                    backup['most_recent']['date_mod']   = now_li
                    updated = True
            else:
                bu_mod = date_list_to_obj(backup[key]['date_mod'])
                if now_obj - bu_mod > limit:
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
        # notes_dict  = []
        updated     = False

        for user_id in all_users.ids:

            notes = models.Notes.get_notes_backup(user_id)
            notes_dict = [convert_to_dict(note) for note in notes]

            backup_obj                  = models.Backup.get_backup(user_id)
            backup_obj.info, updated    = process_notes(notes_dict, backup_obj.info)

            if updated:
                backup_obj.put()


                
app = webapp2.WSGIApplication([
    ('/backup', Backup),
    ('/restore', Restore)
  ], debug=False)