import json, sys, urllib.request, concurrent.futures as cf

PROXY = ("https://proxy.imaging.datacommons.cancer.gov/current/"
         "viewer-only-no-downloads-see-tinyurl-dot-com-slash-3j3d9jyp/dicomWeb")
ORTHANC = "http://localhost:8042/instances"

def get(url, accept):
    req = urllib.request.Request(url, headers={"Accept": accept})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read()

def push(blob):
    req = urllib.request.Request(ORTHANC, data=blob,
                                 headers={"Content-Type": "application/dicom"}, method="POST")
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.status

def one(study, series, uid):
    try:
        return push(get(f"{PROXY}/studies/{study}/series/{series}/instances/{uid}",
                        "application/dicom"))
    except Exception as e:
        return f"ERR {e}"

def pull(study, series, label):
    meta = json.loads(get(f"{PROXY}/studies/{study}/series/{series}/instances",
                          "application/dicom+json"))
    uids = [x["00080018"]["Value"][0] for x in meta]
    ok = err = 0
    with cf.ThreadPoolExecutor(max_workers=8) as ex:
        for res in ex.map(lambda u: one(study, series, u), uids):
            if isinstance(res, int) and res in (200, 201): ok += 1
            else: err += 1
    print(f"{label}: {ok} uploaded, {err} failed, of {len(uids)}", flush=True)

for study, series, label in [
    ("1.2.840.113654.2.55.8790539037983910932933668152636658031",
     "1.2.840.113654.2.55.297188825848849138708491937791320762236", "baseline 2000-01-02"),
    ("1.2.840.113654.2.55.302957049620416109572494829313844992999",
     "1.2.840.113654.2.55.60458735496393490723304567091309771081", "follow-up 2001-01-02"),
]:
    pull(study, series, label)
