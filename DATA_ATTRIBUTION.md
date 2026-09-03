# Bundled imaging data attribution

Substrate's local demo archive contains two de-identified CT series from the
National Lung Screening Trial (NLST), distributed by The Cancer Imaging Archive
and the NCI Imaging Data Commons under **CC BY 4.0**.

## Exact series in the demo

| Role | Study date | Study Instance UID | Series Instance UID | Images | License |
|---|---|---|---|---:|---|
| Current | 2001-01-02 | `1.2.840.113654.2.55.302957049620416109572494829313844992999` | `1.2.840.113654.2.55.60458735496393490723304567091309771081` | 158 | CC BY 4.0 |
| Prior | 2000-01-02 | `1.2.840.113654.2.55.8790539037983910932933668152636658031` | `1.2.840.113654.2.55.297188825848849138708491937791320762236` | 149 | CC BY 4.0 |

Per-series verification was performed on 2026-09-03 with the official
`idc-index` 0.12.5 package and IDC v24 index data. The machine-readable result
is committed at
[`docs/acceptance/data-license-verification.json`](docs/acceptance/data-license-verification.json).
Both rows returned `collection_id = nlst`,
`source_DOI = 10.7937/tcia.hmq8-j677`, and
`license_short_name = CC BY 4.0`.

## Required attribution

National Lung Screening Trial Research Team. *Data from the National Lung
Screening Trial (NLST).* The Cancer Imaging Archive (2013).
<https://doi.org/10.7937/TCIA.HMQ8-J677>

Imaging Data Commons was supported by the National Cancer Institute. Images are
provided for research under the source collection's license; no endorsement by
the data providers is implied.

License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)

Primary collection record: <https://www.cancerimagingarchive.net/collection/nlst/>

Official index client: <https://github.com/ImagingDataCommons/idc-index>
