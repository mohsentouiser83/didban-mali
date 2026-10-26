"""Manage only this repository's ignored local PostgreSQL contract-test cluster."""
import argparse
from pathlib import Path
import shlex
import shutil
import subprocess

ROOT=Path(__file__).resolve().parents[1]


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('action',choices=['start','stop','status'])
    args=parser.parse_args()
    data=ROOT/'.local/postgres';socket=ROOT/'.local/socket';log=ROOT/'.local/postgres.log'
    pg_ctl=shutil.which('pg_ctl');initdb=shutil.which('initdb')
    if not pg_ctl or not initdb: raise SystemExit('Install PostgreSQL tools first; no server is installed by this script.')
    if args.action=='start':
        socket.mkdir(parents=True,exist_ok=True)
        if not data.exists():subprocess.run([initdb,'-D',str(data),'-A','trust','--no-locale','-E','UTF8'],check=True)
        running=subprocess.run([pg_ctl,'-D',str(data),'status'],capture_output=True).returncode==0
        if not running:
            options=f"-k {shlex.quote(str(socket))} -p 55437 -c listen_addresses='' -c unix_socket_permissions=0700"
            subprocess.run([pg_ctl,'-D',str(data),'-l',str(log),'-o',options,'start'],check=True)
        dsn=f'host={socket} port=55437 dbname=postgres'
        print('export DIDBAN_TEST_DSN='+shlex.quote(dsn))
    elif args.action=='stop':
        if data.exists():subprocess.run([pg_ctl,'-D',str(data),'-m','fast','stop'],check=True)
    else:
        raise SystemExit(subprocess.run([pg_ctl,'-D',str(data),'status']).returncode)


if __name__=='__main__':main()
