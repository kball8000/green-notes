"""Custom module for ndb on app engine for Green Notes. Contains
all objects used and their core methods."""

# Debugging Standard Imports
# import logging

# Main Standard Imports
import threading
import time

# Main Custom Imports
from google.appengine.ext import ndb


def create_id(user):
    """ Creates a custom id for notes. """
    return 'note_id-' + user.user_id()

class Backup(ndb.Model):
    """Backup class used for backup up user's notes in an array"""
    user_id = ndb.StringProperty(indexed=True)
    info = ndb.JsonProperty(compressed=True)
    date = ndb.DateTimeProperty(auto_now=True)

    @classmethod
    def get_backup(cls, user_id):
        """ return a users backup object from ndb """
        return Backup.get_or_insert(user_id + '-backup', user_id=user_id)

class UserIds(ndb.Model):
    """ Creates a dictionary of user_ids used by cron backup job."""
    ids = ndb.JsonProperty(default={}, compressed=True)
    date = ndb.DateTimeProperty(auto_now=True)

    @classmethod
    def get_ids(cls):
        """ get ids of all users using the green notes service """
        return UserIds.get_or_insert('user_ids')

    @classmethod
    def save_id(cls, user_id):
        """If new, save user of the green notes service."""
        obj = cls.get_ids()

        if user_id not in obj.ids:
            obj.ids[user_id] = True
            obj.put()

class Error(ndb.Model):
    """ Custom error logging """
    date = ndb.DateTimeProperty(auto_now=True)
    email = ndb.StringProperty()
    error_type = ndb.StringProperty()
    message = ndb.StringProperty(indexed=False)

    @classmethod
    def get_errors(cls):
        """ returns a list of latest errors """
        return cls.query().fetch(100, keys_only=True)

    @classmethod
    def put_error(cls, user, obj):
        """ Add a new error to the list """
        err = Error(
            email=user.email(),
            error_type=obj['error_type'],
            message=obj['message']
        )
        err.put()

class NoteId(ndb.Model):
    """Note object for storing individual notes."""
    next_id = ndb.IntegerProperty(default=0)
    _api_lock = threading.Lock()
    _lock = None

    @classmethod
    def get_id(cls, user):
        """Takes a ndb user object and returns the next_id used for
        creating unique note identifier."""
        obj = cls.get_by_id(create_id(user), use_cache=False, use_memcache=False)
        if not obj:
            return 0
        else:
            return obj.next_id


    @classmethod
    def obtain_next_id(cls, user):
        """Gets the next_id counter used for creating unique
        identifier on the client for the app."""
        obj_id = create_id(user)
        next_obj = cls.get_by_id(obj_id, use_cache=False, use_memcache=False)

        if not next_obj:
            next_obj = cls(id=obj_id)
        next_id = next_obj.next_id

        next_obj.next_id += 1
        next_obj.put()

        return next_id

    @classmethod
    def set_id(cls, user, _id):
        obj_id = create_id(user)

        with cls._api_lock:
            cls._lock = cls.get_by_id(obj_id, use_cache=False, use_memcache=False)

            if not cls._lock:
                cls._lock = cls(id=obj_id)

            cls._lock.next_id = _id
            cls._lock.put()

class Notes(ndb.Model):
    email = ndb.StringProperty(indexed=False)
    user_id = ndb.StringProperty(indexed=True)
    note_id = ndb.IntegerProperty(indexed=True)
    info = ndb.JsonProperty(compressed=True)
    # Consider removing auto_now so that backup can restore proper dates
    date = ndb.DateTimeProperty(auto_now=True)
    _api_lock = threading.Lock()
    _lock = None
    retries = 10

    @classmethod
    def get_note(cls, user, note_id):
        """Get an individual note from ndb based on user object
        and note id."""
        return cls.query(cls.user_id == user.user_id() and
                         cls.note_id == note_id).get(use_cache=False,
                                                     use_memcache=False)

    @classmethod
    def get_notes(cls, user):
        return cls.query(cls.user_id == user.user_id()).fetch(500)

    @classmethod
    def get_notes_backup(cls, user_id):
        return cls.query(cls.user_id == user_id).fetch(500)

    @classmethod
    def save_note(cls, note, info):
        try:
            note.info = info
            note.put()
            return True
        except:
            return False

    @classmethod
    def save_new_note(cls, user, info, get_id=True):
        """For saving note for the first time, locks in the id."""
        def wait_for_note_exist():
            """To keep from saving the same note in the db
            multiple times, it locks until you can retrieve the note that
            was just saved"""
            # logging.info('beginning check func')
            counter = cls.retries
            check = cls.get_note(user, info['id'])
            while counter and not check:
                t = (cls.retries - counter + 1)*0.05
                check = cls.get_note(user, info['id'])
                time.sleep(t)
                counter -= 1
                # TODO: Log error if counter == 0

        def save_note():
            """Saves an individual note to ndb"""

            if get_id:
                info['id'] = NoteId.obtain_next_id(user)

            info['newNote'] = False
            cls._lock = Notes(
                email=user.email(),
                user_id=user.user_id(),
                note_id=info['id'],
                info=info)
            cls._lock.put()

            wait_for_note_exist()

        response = {}

        with cls._api_lock:
            cls._lock = cls.get_note(user, info['id'])
            if not cls._lock:
                try:
                    save_note()
                    response['saved'] = True
                except:
                    response['saved'] = False

            else:
                # less common case when 2 clients are offline and create new note, they
                # are likely to be different and this will allow both to save.
                if info['created'] != cls._lock.info['created']:
                    # logging.info('id existed, saving since new title')
                    cls.save_note()
                else:
                    # Probably a duplicate save request for some reason, do not save,
                    # but get client to remove new_note tag.
                    # logging.info('id existed with same creation date, not saving')
                    response['saved'] = False
                    response['duplicate'] = True
# TODO: CREATE ERROR REPORT

        response['id'] = info['id']

        return response