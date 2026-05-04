import time
from functools import lru_cache, wraps
from typing import Any, Callable

def timed_lru_cache(seconds: int, maxsize: int = 128):
    """
    Extension of lru_cache with a time-to-live (TTL).
    """
    def wrapper(f: Callable):
        # Apply lru_cache to the function
        f = lru_cache(maxsize=maxsize)(f)
        
        # Track expiration
        f.lifetime = seconds
        f.expiration = time.time() + f.lifetime

        @wraps(f)
        def wrapped(*args, **kwargs):
            # Check if cache has expired
            if time.time() > f.expiration:
                f.cache_clear()
                f.expiration = time.time() + f.lifetime
            return f(*args, **kwargs)

        return wrapped

    return wrapper
