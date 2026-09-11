#!/bin/sh
set -eu
host_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
umask 077
exec 2>>"$host_dir/startup-error.log"
cd "$host_dir"
exec /usr/bin/python3 -I -u "$host_dir/nex_b_native_host.py"
