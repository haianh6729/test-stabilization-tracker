import os
import platform
import socket
from datetime import datetime


def main():
    print("Chay tren self-hosted runner")
    print(f"Hostname: {socket.gethostname()}")
    print(f"He dieu hanh: {platform.platform()}")
    print(f"Thoi gian: {datetime.now().isoformat()}")
    print(f"Thu muc lam viec: {os.getcwd()}")
    print(f"Commit: {os.environ.get('GITHUB_SHA', 'N/A')}")


if __name__ == "__main__":
    main()
