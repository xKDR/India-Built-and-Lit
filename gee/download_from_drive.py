"""
Download CSVs that GEE exported to a Google Drive folder into data/raw/.

Uses the OAuth credentials already produced by `earthengine authenticate` —
Drive scope is granted by that flow.

Usage:
  python gee/download_from_drive.py \
      --folder Districts-Of-India-Buildings \
      --dest data/raw \
      --pattern 'buildings_.*\\.csv'

  # for VIIRS rasters
  python gee/download_from_drive.py \
      --folder Districts-Of-India-VIIRS \
      --dest data/raw/viirs \
      --pattern 'viirs_.*\\.tif'
"""

import argparse
import io
import json
import re
from pathlib import Path

import ee.oauth
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload


CRED_PATH = Path.home() / ".config" / "earthengine" / "credentials"


def load_credentials():
    with open(CRED_PATH) as f:
        c = json.load(f)
    return Credentials(
        token=None,
        refresh_token=c["refresh_token"],
        token_uri="https://oauth2.googleapis.com/token",
        client_id=ee.oauth.CLIENT_ID,
        client_secret=ee.oauth.CLIENT_SECRET,
        scopes=c.get("scopes"),
    )


def find_folder_id(drive, name):
    q = (f"name='{name}' and mimeType='application/vnd.google-apps.folder' "
         f"and trashed=false")
    res = drive.files().list(q=q, fields="files(id, name)").execute()
    files = res.get("files", [])
    if not files:
        raise SystemExit(f"Drive folder not found: {name}")
    return files[0]["id"]


def list_files(drive, folder_id, pattern):
    rx = re.compile(pattern)
    q = f"'{folder_id}' in parents and trashed=false"
    page_token = None
    out = []
    while True:
        res = drive.files().list(q=q, fields="nextPageToken, files(id, name, size)",
                                 pageToken=page_token, pageSize=200).execute()
        for f in res.get("files", []):
            if rx.fullmatch(f["name"]):
                out.append(f)
        page_token = res.get("nextPageToken")
        if not page_token:
            return out


def download(drive, file_id, dest_path):
    req = drive.files().get_media(fileId=file_id)
    fh = io.FileIO(dest_path, "wb")
    dl = MediaIoBaseDownload(fh, req, chunksize=8 * 1024 * 1024)
    done = False
    while not done:
        _, done = dl.next_chunk()
    fh.close()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--folder", required=True, help="Drive folder name")
    p.add_argument("--dest", required=True, help="Local destination directory")
    p.add_argument("--pattern", required=True, help="Regex for filenames")
    p.add_argument("--force", action="store_true",
                   help="Re-download even if destination already exists")
    args = p.parse_args()

    dest = Path(args.dest)
    dest.mkdir(parents=True, exist_ok=True)

    drive = build("drive", "v3", credentials=load_credentials(),
                  cache_discovery=False)
    folder_id = find_folder_id(drive, args.folder)
    files = list_files(drive, folder_id, args.pattern)
    print(f"{len(files)} matching file(s) in {args.folder!r}")

    for f in files:
        target = dest / f["name"]
        if target.exists() and not args.force:
            print(f"  skip (exists): {f['name']}")
            continue
        print(f"  download {f['name']} ({int(f.get('size', 0)) / 1024:.0f} KB)")
        download(drive, f["id"], target)


if __name__ == "__main__":
    main()
