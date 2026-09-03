import io
import json
import os
import tempfile
import time
from pathlib import Path

import pydicom
import requests
from idc_index import IDCClient


MANIFEST = json.loads(Path("manifest.json").read_text())
ORTHANC_URL = os.getenv("ORTHANC_URL", "http://orthanc.railway.internal:8042")
ORTHANC_USER = os.environ["ORTHANC_SEED_USER"]
ORTHANC_PASSWORD = os.environ["ORTHANC_SEED_PASSWORD"]


def wait_for_orthanc(session: requests.Session) -> None:
    for attempt in range(60):
        try:
            response = session.get(f"{ORTHANC_URL}/system", timeout=5)
            if response.ok:
                return
        except requests.RequestException:
            pass
        time.sleep(min(1 + attempt / 10, 5))
    raise RuntimeError("Orthanc did not become ready")


def verify_series(client: IDCClient, entry: dict) -> None:
    uid = entry["seriesInstanceUID"].replace("'", "''")
    rows = client.sql_query(
        "SELECT collection_id, StudyInstanceUID, SeriesInstanceUID, "
        "instanceCount, license_short_name FROM index "
        f"WHERE SeriesInstanceUID = '{uid}'"
    ).to_dict("records")
    if len(rows) != 1:
        raise RuntimeError(f"IDC index returned {len(rows)} rows for {uid}")
    row = rows[0]
    expected = {
        "collection_id": entry["collectionId"],
        "StudyInstanceUID": entry["studyInstanceUID"],
        "SeriesInstanceUID": entry["seriesInstanceUID"],
        "instanceCount": entry["instanceCount"],
        "license_short_name": entry["license"],
    }
    for key, value in expected.items():
        if row[key] != value:
            raise RuntimeError(f"IDC verification failed for {uid}: {key}")


def upload_series(client: IDCClient, session: requests.Session, entry: dict) -> None:
    uid = entry["seriesInstanceUID"]
    with tempfile.TemporaryDirectory() as directory:
        client.download_dicom_series(uid, directory, quiet=False, show_progress_bar=False)
        files = [path for path in Path(directory).rglob("*") if path.is_file()]
        if len(files) != entry["instanceCount"]:
            raise RuntimeError(f"Expected {entry['instanceCount']} files for {uid}, found {len(files)}")

        for path in files:
            dataset = pydicom.dcmread(path)
            dataset.PatientName = MANIFEST["patientName"]
            dataset.PatientID = MANIFEST["patientId"]
            body = io.BytesIO()
            pydicom.dcmwrite(body, dataset, enforce_file_format=True)
            response = session.post(
                f"{ORTHANC_URL}/instances",
                data=body.getvalue(),
                headers={"Content-Type": "application/dicom"},
                timeout=180,
            )
            response.raise_for_status()
    print(f"Seeded {entry['role']} series {uid} ({entry['instanceCount']} instances)", flush=True)


def main() -> None:
    client = IDCClient()
    session = requests.Session()
    session.auth = (ORTHANC_USER, ORTHANC_PASSWORD)
    wait_for_orthanc(session)
    for entry in MANIFEST["series"]:
        verify_series(client, entry)
        upload_series(client, session, entry)


if __name__ == "__main__":
    main()
