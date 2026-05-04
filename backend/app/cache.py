import time
from functools import lru_cache, wraps
from typing import Any, Callable, Dict, Optional

def timed_lru_cache(seconds: int, maxsize: int = 128):
    """
    Extension of lru_cache with a time-to-live (TTL).
    """
    def wrapper(f: Callable):
        f = lru_cache(maxsize=maxsize)(f)
        f.lifetime = seconds
        f.expiration = time.time() + f.lifetime

        @wraps(f)
        def wrapped(*args, **kwargs):
            if time.time() > f.expiration:
                f.cache_clear()
                f.expiration = time.time() + f.lifetime
            return f(*args, **kwargs)

        wrapped.cache_clear = f.cache_clear
        return wrapped

    return wrapper

class UserCache:
    """
    Simple in-memory store for user-specific data with manual invalidation.
    """
    def __init__(self, ttl: int = 30):
        self.ttl = ttl
        self.store: Dict[str, Dict[str, Any]] = {}

    def get(self, user_id: int, key: str) -> Optional[Any]:
        user_key = f"{user_id}:{key}"
        entry = self.store.get(user_key)
        if entry and time.time() < entry["expires"]:
            return entry["data"]
        return None

    def set(self, user_id: int, key: str, data: Any):
        user_key = f"{user_id}:{key}"
        self.store[user_key] = {
            "data": data,
            "expires": time.time() + self.ttl
        }

    def invalidate(self, user_id: int, key: Optional[str] = None):
        if key:
            user_key = f"{user_id}:{key}"
            self.store.pop(user_key, None)
        else:
            # Invalidate all keys for this user
            prefix = f"{user_id}:"
            to_delete = [k for k in self.store if k.startswith(prefix)]
            for k in to_delete:
                self.store.pop(k, None)

# Global user cache instance
user_cache = UserCache(ttl=30)
