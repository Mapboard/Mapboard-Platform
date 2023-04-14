import time
from daemon import DaemonContext

from time import sleep
import socket
from zeroconf import ServiceInfo, Zeroconf
import sys

def start_zeroconf():
    zc = Zeroconf()

    fqdn = socket.gethostname()
    fqdn = "Daven-Quinn.local"
    ip_info = socket.gethostbyname_ex(fqdn)
    print(ip_info, file=sys.stderr)
    ip_addr = ip_info[2][0]
    ip_addr = socket.gethostbyname(fqdn)
    address = socket.inet_aton(ip_addr)
    hostname = fqdn.split(".")[0]
    print(fqdn, ip_addr, hostname, address, file=sys.stderr)

    info = ServiceInfo(
        "_http._tcp.local.",
        "Mapboard Server._http._tcp.local.",
        5353,
        0,
        0,
        {"open": True},
        hostname + ".local.",
        addresses=[address],
    )


    zc.register_service(info)

daemon = DaemonContext(detach_process=True)

# Daemonize the process
with daemon:
    start_zeroconf()
    # Run zeroconf until interrupted
    try:
        while True:
            sleep(0.1)
    except KeyboardInterrupt:
        pass


