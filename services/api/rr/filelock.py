"""Small OS-backed exclusive lock, shared between the API and worker."""
import os,time
class Timeout(TimeoutError):pass
class FileLock:
    def __init__(self,path,timeout=120):self.path=path;self.timeout=timeout;self.file=None
    def __enter__(self):
        self.file=open(self.path,'a+b')
        self.file.seek(0,2)
        if self.file.tell()==0:self.file.write(b'0');self.file.flush()
        start=time.monotonic()
        while True:
            try:
                self.file.seek(0)
                if os.name=='nt':
                    import msvcrt
                    msvcrt.locking(self.file.fileno(),msvcrt.LK_NBLCK,1)
                else:
                    import fcntl
                    fcntl.flock(self.file.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
                return self
            except OSError:
                if time.monotonic()-start>=self.timeout:self.file.close();raise Timeout('Another process holds the connection lock. Try again shortly.')
                time.sleep(.1)
    def __exit__(self,*args):
        if self.file:
            self.file.seek(0)
            if os.name=='nt':
                import msvcrt
                msvcrt.locking(self.file.fileno(),msvcrt.LK_UNLCK,1)
            else:
                import fcntl
                fcntl.flock(self.file.fileno(),fcntl.LOCK_UN)
            self.file.close()
