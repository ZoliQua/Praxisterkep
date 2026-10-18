"""Hungary's primary care against the rest of Europe (sources Q and R).

Every other analysis on the site looks inside the country. This one looks
out: the same questions the site asks of a járás — is there a doctor, does
the patient get to one, what does care achieve, what does it cost — asked of
the 27 member states and the United Kingdom, from the two publishers that
collect them on one questionnaire (the joint OECD–Eurostat–WHO data
collection), plus Eurostat's NUTS 2 regional tables for the regions on
either side of Hungary's borders.

  Q  Eurostat dissemination API (JSON-stat), datasets hlth_* and two
     regional tables (demo_r_mlifexp, nama_10r_2gdp):
         https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/<code>
     Region shapes: GISCO NUTS 2024, 1:20 million — non-commercial use with
     the notice "© EuroGeographics for the administrative boundaries" on the
     map itself.
  R  OECD Health Statistics, SDMX (CSV), CC BY 4.0 since July 2024:
         https://sdmx.oecd.org/public/rest/data/OECD.ELS.HD,<flow>/all
     Used for what Eurostat does not carry: avoidable hospital admissions
     (the OECD's primary-care quality indicators), what doctors earn, and the
     United Kingdom after 2019, when it left the Eurostat collection.

Rules this module keeps, and the page says:

  * One source per country per indicator. Where Eurostat has a country, its
    whole series comes from Eurostat; the UK's workforce series come whole
    from the OECD. Before that is allowed, the two must agree on the years
    both publish (they are the same questionnaire) — or the build fails.
  * Concepts are never mixed: "practising" dentists are not filled in from
    "professionally active" ones, and a country that reports only the other
    concept is left empty.
  * Derived shares are exact identities of published counts (physicians aged
    55+ = the three older bands, or the total less the three younger ones);
    nothing is estimated.
  * Every value carries its own year. Nine or twenty-eight countries are too
    few for a correlation worth printing; the page compares, it does not fit.

Raw answers are archived under data/raw/eurostat/europe/ and data/raw/oecd/
with their date; a copy younger than MAX_AGE_DAYS is reused.

Usage:
  python etl/eu_compare.py [--refresh]
"""
from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import sys
import urllib.parse
from datetime import date
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from parse_dental import ParseError

ROOT = Path(__file__).resolve().parent.parent
RAW_ES = ROOT / "data" / "raw" / "eurostat" / "europe"
RAW_OECD = ROOT / "data" / "raw" / "oecd"
RAW_GEO = ROOT / "data" / "raw" / "gisco"
OUT = ROOT / "data" / "europe.json"
GEO_OUT = ROOT / "data" / "geo" / "europe.json"
SCHEMA_VERSION = 1
MAX_AGE_DAYS = 30
SINCE = 2005

ES_API = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/"
ES_PAGE = "https://ec.europa.eu/eurostat/databrowser/view/{code}/default/table"
OECD_API = "https://sdmx.oecd.org/public/rest/data/OECD.ELS.HD,{flow}/all"
OECD_PAGE = "https://data-explorer.oecd.org/"
GISCO = ("https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/"
         "NUTS_RG_20M_2024_4326_LEVL_{level}.geojson")
GISCO_CNTR = ("https://gisco-services.ec.europa.eu/distribution/v2/countries/geojson/"
              "CNTR_RG_20M_2024_4326.geojson")
HEADERS = {"User-Agent": "Praxisterkep/1.0 (+https://github.com/ZoliQua/Praxisterkep)"}

EU27 = ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES", "FI", "FR", "HR",
        "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"]
COUNTRIES = EU27 + ["UK"]
# the reader's two narrower views: the region the owner asked about, with
# Germany and the UK as benchmarks, and the Visegrád four
GROUPS = {
    "all": COUNTRIES,
    "cee": ["HU", "AT", "SK", "CZ", "PL", "RO", "BG", "DE", "UK"],
    "v4": ["HU", "CZ", "PL", "SK"],
}
EU_AGG = "EU27_2020"
# OECD writes ISO alpha-3; Eurostat writes EL for Greece and UK for Britain
ISO3 = {"AUT": "AT", "BEL": "BE", "BGR": "BG", "CYP": "CY", "CZE": "CZ", "DEU": "DE",
        "DNK": "DK", "EST": "EE", "GRC": "EL", "ESP": "ES", "FIN": "FI", "FRA": "FR",
        "HRV": "HR", "HUN": "HU", "IRL": "IE", "ITA": "IT", "LTU": "LT", "LUX": "LU",
        "LVA": "LV", "MLT": "MT", "NLD": "NL", "POL": "PL", "PRT": "PT", "ROU": "RO",
        "SWE": "SE", "SVN": "SI", "SVK": "SK", "GBR": "UK"}

# Hungary's NUTS 2 regions against the regions across the border, in the
# order the border runs (north, then clockwise)
BORDER_PAIRS = [
    ("HU31", "SK04"), ("HU31", "SK03"), ("HU12", "SK02"), ("HU21", "SK02"),
    ("HU22", "AT11"), ("HU22", "SI03"), ("HU23", "HR02"), ("HU33", "RO42"),
    ("HU32", "RO11"),
]

R = "TXP_TFAR_WLIST"  # too expensive, too far or a waiting list: Eurostat's headline

# id: section, branch, dataset, filters, and what "better" means. lo/hi are
# the bounds outside which a value is a parse error, not a fact.
ES_INDICATORS: dict[str, dict] = {
    # who needs care: how old, how healthy, how long people live
    "share65": dict(section="needs", branch="both", code="demo_pjanind",
                    flt={"indic_de": "PC_Y65_MAX"}, better="neutral", unit="pct", lo=5, hi=40),
    "lifeExpectancy": dict(section="needs", branch="both", code="demo_mlexpec",
                           flt={"sex": "T", "age": "Y_LT1", "unit": "YR"}, better="higher",
                           unit="years", lo=65, hi=90),
    "healthyYears65": dict(section="needs", branch="both", code="hlth_hlye",
                           flt={"sex": "T", "unit": "YR", "hlth_hle": "HLY_Y65"}, better="higher",
                           unit="years", lo=1, hi=20),
    "goodHealth": dict(section="needs", branch="both", code="hlth_silc_01",
                       flt={"sex": "T", "age": "Y_GE16", "wstatus": "POP", "unit": "PC",
                            "levels": "VG_G"}, better="higher", unit="pct", lo=20, hi=95),
    "longIllness": dict(section="needs", branch="both", code="hlth_silc_04",
                        flt={"sex": "T", "age": "Y_GE16", "wstatus": "POP", "unit": "PC"},
                        better="lower", unit="pct", lo=5, hi=70),
    # who is in the surgery
    "gpDensity": dict(section="workforce", branch="gp", code="hlth_rs_physcat",
                      flt={"unit": "P_HTHAB", "med_spec": "GEN_PRAC"}, better="higher",
                      unit="per100k", lo=5, hi=400),
    "generalistDensity": dict(section="workforce", branch="gp", code="hlth_rs_physcat",
                              flt={"unit": "P_HTHAB", "med_spec": "GEN"}, better="higher",
                              unit="per100k", lo=5, hi=400),
    "dentistDensity": dict(section="workforce", branch="dental", code="hlth_rs_prs2",
                           flt={"unit": "P_HTHAB", "med_spec": "DENT", "wstatus": "PRACT"},
                           better="higher", unit="per100k", lo=10, hi=250),
    "physicianDensity": dict(section="workforce", branch="both", code="hlth_rs_prs2",
                             flt={"unit": "P_HTHAB", "med_spec": "PHYS", "wstatus": "PRACT"},
                             better="higher", unit="per100k", lo=150, hi=900),
    "nurseDensity": dict(section="workforce", branch="both", code="hlth_rs_prs2",
                         flt={"unit": "P_HTHAB", "med_spec": "NRS", "wstatus": "PRACT"},
                         better="higher", unit="per100k", lo=1, hi=2000),
    "medGraduates": dict(section="workforce", branch="gp", code="hlth_rs_grd2",
                         flt={"unit": "P_HTHAB", "med_spec": "PHYS"}, better="higher",
                         unit="per100k", lo=1, hi=60),
    "dentGraduates": dict(section="workforce", branch="dental", code="hlth_rs_grd2",
                          flt={"unit": "P_HTHAB", "med_spec": "DENT"}, better="higher",
                          unit="per100k", lo=0, hi=20),
    # does the patient get there
    "gpVisit": dict(section="access", branch="gp", code="hlth_ehis_am1u",
                    flt={"sex": "T", "age": "TOTAL", "unit": "PC", "isco08": "OC2211",
                         "duration": "Y_LT1", "deg_urb": "TOTAL"},
                    better="higher", unit="pct", lo=20, hi=100),
    "gpVisitCity": dict(section="access", branch="gp", code="hlth_ehis_am1u",
                        flt={"sex": "T", "age": "TOTAL", "unit": "PC", "isco08": "OC2211",
                             "duration": "Y_LT1", "deg_urb": "DEG1"},
                        better="higher", unit="pct", lo=20, hi=100, part="gpVisit"),
    "gpVisitRural": dict(section="access", branch="gp", code="hlth_ehis_am1u",
                         flt={"sex": "T", "age": "TOTAL", "unit": "PC", "isco08": "OC2211",
                              "duration": "Y_LT1", "deg_urb": "DEG3"},
                         better="higher", unit="pct", lo=20, hi=100, part="gpVisit"),
    "dentVisit": dict(section="access", branch="dental", code="hlth_ehis_am1u",
                      flt={"sex": "T", "age": "TOTAL", "unit": "PC", "isco08": "OC2261",
                           "duration": "Y_LT1", "deg_urb": "TOTAL"},
                      better="higher", unit="pct", lo=5, hi=100),
    "dentVisitCity": dict(section="access", branch="dental", code="hlth_ehis_am1u",
                          flt={"sex": "T", "age": "TOTAL", "unit": "PC", "isco08": "OC2261",
                               "duration": "Y_LT1", "deg_urb": "DEG1"},
                          better="higher", unit="pct", lo=5, hi=100, part="dentVisit"),
    "dentVisitRural": dict(section="access", branch="dental", code="hlth_ehis_am1u",
                           flt={"sex": "T", "age": "TOTAL", "unit": "PC", "isco08": "OC2261",
                                "duration": "Y_LT1", "deg_urb": "DEG3"},
                           better="higher", unit="pct", lo=5, hi=100, part="dentVisit"),
    "consultations": dict(section="access", branch="gp", code="hlth_hc_phys2",
                          flt={"hlthcare": "CONSULT", "unit": "NR_HAB"}, better="neutral",
                          unit="perCapita", lo=1, hi=25),
    "dentConsultations": dict(section="access", branch="dental", code="hlth_hc_dent",
                              flt={"unit": "NR_HAB"}, better="neutral", unit="perCapita",
                              lo=0.01, hi=5),
    "unmetMed": dict(section="access", branch="gp", code="hlth_silc_08",
                     flt={"sex": "T", "age": "Y_GE16", "quant_inc": "TOTAL", "unit": "PC",
                          "reason": R}, better="lower", unit="pct", lo=0, hi=40),
    "unmetMedPoor": dict(section="access", branch="gp", code="hlth_silc_08",
                         flt={"sex": "T", "age": "Y_GE16", "quant_inc": "QU1", "unit": "PC",
                              "reason": R}, better="lower", unit="pct", lo=0, hi=50,
                         part="unmetMedIncome"),
    "unmetMedRich": dict(section="access", branch="gp", code="hlth_silc_08",
                         flt={"sex": "T", "age": "Y_GE16", "quant_inc": "QU5", "unit": "PC",
                              "reason": R}, better="lower", unit="pct", lo=0, hi=50,
                         part="unmetMedIncome"),
    "unmetDent": dict(section="access", branch="dental", code="hlth_silc_09",
                      flt={"sex": "T", "age": "Y_GE16", "quant_inc": "TOTAL", "unit": "PC",
                           "reason": R}, better="lower", unit="pct", lo=0, hi=40),
    "unmetDentPoor": dict(section="access", branch="dental", code="hlth_silc_09",
                          flt={"sex": "T", "age": "Y_GE16", "quant_inc": "QU1", "unit": "PC",
                               "reason": R}, better="lower", unit="pct", lo=0, hi=50,
                          part="unmetDentIncome"),
    "unmetDentRich": dict(section="access", branch="dental", code="hlth_silc_09",
                          flt={"sex": "T", "age": "Y_GE16", "quant_inc": "QU5", "unit": "PC",
                               "reason": R}, better="lower", unit="pct", lo=0, hi=50,
                          part="unmetDentIncome"),
    # what care achieves
    "avoidable": dict(section="outcomes", branch="both", code="hlth_cd_apr",
                      flt={"sex": "T", "icd10": "TOTAL", "unit": "RT", "mortalit": "TOTAL"},
                      better="lower", unit="per100k", lo=100, hi=1500),
    "treatable": dict(section="outcomes", branch="both", code="hlth_cd_apr",
                      flt={"sex": "T", "icd10": "TOTAL", "unit": "RT", "mortalit": "TRT"},
                      better="lower", unit="per100k", lo=30, hi=700),
    "preventable": dict(section="outcomes", branch="both", code="hlth_cd_apr",
                        flt={"sex": "T", "icd10": "TOTAL", "unit": "RT", "mortalit": "PRVT"},
                        better="lower", unit="per100k", lo=50, hi=1000),
    "screenBreast": dict(section="outcomes", branch="gp", code="hlth_ps_prev",
                         flt={"sex": "F", "icd10": "C50", "unit": "PC"}, better="higher",
                         unit="pct", lo=0, hi=100),
    "screenCervical": dict(section="outcomes", branch="gp", code="hlth_ps_prev",
                           flt={"sex": "F", "icd10": "C53", "unit": "PC"}, better="higher",
                           unit="pct", lo=0, hi=100),
    "screenColorectal": dict(section="outcomes", branch="gp", code="hlth_ps_prev",
                             flt={"sex": "T", "icd10": "C18-C21", "unit": "PC"},
                             better="higher", unit="pct", lo=0, hi=100),
    "flu65": dict(section="outcomes", branch="gp", code="hlth_ps_immu",
                  flt={"unit": "PC"}, better="higher", unit="pct", lo=0, hi=100),
    # what it costs
    "spendingPps": dict(section="spending", branch="both", code="hlth_sha11_hf",
                        flt={"unit": "PPS_HAB", "icha11_hf": "TOT_HF"}, better="neutral",
                        unit="pps", lo=300, hi=12000),
    "outOfPocket": dict(section="spending", branch="both", code="hlth_sha11_hf",
                        flt={"unit": "PC_CHE", "icha11_hf": "HF3"}, better="lower",
                        unit="pct", lo=1, hi=70),
    "medicalPractices": dict(section="spending", branch="gp", code="hlth_sha11_hp",
                             flt={"unit": "PC_CHE", "icha11_hp": "HP31"}, better="neutral",
                             unit="pct", lo=0.1, hi=40),
    "dentalPractices": dict(section="spending", branch="dental", code="hlth_sha11_hp",
                            flt={"unit": "PC_CHE", "icha11_hp": "HP32"}, better="neutral",
                            unit="pct", lo=0.3, hi=20),
    "prevention": dict(section="spending", branch="both", code="hlth_sha11_hc",
                       flt={"unit": "PC_CHE", "icha11_hc": "HC6"}, better="higher",
                       unit="pct", lo=0.1, hi=15),
}

# physicians aged 55+: computed from the age bands, see older_share()
AGE_CODE = "hlth_rs_phys"
OLD_BANDS = ["Y55-64", "Y65-74", "Y_GE75"]
YOUNG_BANDS = ["Y_LT35", "Y35-44", "Y45-54"]

# OECD flows and the series taken from each: (flow, {column: value}, id)
OECD_FLOWS = {
    "pc": "DSD_HCQO@DF_PC,2.1",
    "remun": "DSD_HEALTH_REAC_EMP@DF_REMUN,",
    "physcat": "DSD_HEALTH_EMP_REAC@DF_PHYS_CAT,",
    "dnst": "DSD_HEALTH_REAC_EMP@DF_DNST,",
    "phys": "DSD_HEALTH_EMP_REAC@DF_PHYS,1.1",
    "immun": "DSD_HEALTH_PROC@DF_IMMUN,",
    "wfmi": "DSD_HEALTH_WFMI@DF_HEALTH_WFMI,",
}
_ADM = {"UNIT_MEASURE": "10P5HB", "AGE": "Y_GE15", "SEX": "_T", "STATISTICAL_OPERATION": "OBS",
        "METHODOLOGY": "AGE_SEX_STANDARD"}
_PAY = {"UNIT_MEASURE": "FCTR_WG_A_SAL_A", "SEX": "_T"}
OECD_INDICATORS: dict[str, dict] = {
    "admAsthmaCopd": dict(section="outcomes", branch="gp", flow="pc",
                          match={**_ADM, "MEASURE": "ASCOCOMP"}, better="lower",
                          unit="per100k", lo=1, hi=1500),
    "admHeartFailure": dict(section="outcomes", branch="gp", flow="pc",
                            match={**_ADM, "MEASURE": "ADMRCHFL"}, better="lower",
                            unit="per100k", lo=1, hi=1500),
    "admDiabetes": dict(section="outcomes", branch="gp", flow="pc",
                        match={**_ADM, "MEASURE": "ADMRDBUC"}, better="lower",
                        unit="per100k", lo=1, hi=1000),
    "vaccDtp": dict(section="outcomes", branch="gp", flow="immun",
                    match={"UNIT_MEASURE": "PT_CH_ELG_IM", "DISEASE": "DIPTETPERT"},
                    better="higher", unit="pct", lo=30, hi=100),
    "vaccMeasles": dict(section="outcomes", branch="gp", flow="immun",
                        match={"UNIT_MEASURE": "PT_CH_ELG_IM", "DISEASE": "MEAS"},
                        better="higher", unit="pct", lo=30, hi=100),
    "foreignTrained": dict(section="workforce", branch="both", flow="wfmi",
                           match={"MEASURE": "HW", "UNIT_MEASURE": "PT_WR_PRF_HLTH", "ORIGIN": "W",
                                  "TRAINING_PLACE": "FOREIGN", "HEALTH_PROF": "PHYS"},
                           better="neutral", unit="pct", lo=0, hi=100),
    "payGpSalaried": dict(section="pay", branch="gp", flow="remun",
                          match={**_PAY, "HEALTH_PROF": "EMPLGENP", "WORKER_STATUS": "ICSE93_1"},
                          better="neutral", unit="ratio", lo=0.5, hi=10),
    "payGpSelf": dict(section="pay", branch="gp", flow="remun",
                      match={**_PAY, "HEALTH_PROF": "EMPLGENP", "WORKER_STATUS": "ICSE93_2T5"},
                      better="neutral", unit="ratio", lo=0.5, hi=10),
    "paySpecSalaried": dict(section="pay", branch="gp", flow="remun",
                            match={**_PAY, "HEALTH_PROF": "EMPLSPMP", "WORKER_STATUS": "ICSE93_1"},
                            better="neutral", unit="ratio", lo=0.5, hi=10),
    "payNurse": dict(section="pay", branch="both", flow="remun",
                     match={**_PAY, "HEALTH_PROF": "RINF", "WORKER_STATUS": "ICSE93_1"},
                     better="neutral", unit="ratio", lo=0.3, hi=5),
}
# the UK after 2019: the same questionnaire through the OECD, whole series.
# The OECD writes per 1 000; the site, like Eurostat, per 100 000.
OECD_UK = {
    "gpDensity": ("physcat", {"UNIT_MEASURE": "10P3HB", "HEALTH_PROF": "EMPLGENP"}),
    "generalistDensity": ("physcat", {"UNIT_MEASURE": "10P3HB", "HEALTH_PROF": "EMPLGENE"}),
    "dentistDensity": ("dnst", {"UNIT_MEASURE": "10P3HB", "HEALTH_PROF": "DNST",
                                "HEALTH_PROF_ACTIVITY_STATUS": "P"}),
    "physicianDensity": ("phys", {"UNIT_MEASURE": "10P3HB", "HEALTH_PROF": "PHYS",
                                  "HEALTH_PROF_ACTIVITY_STATUS": "P"}),
}
UK_AGREE = 0.05  # the two publishers may differ by rounding and revisions, not more

REGIONAL: dict[str, dict] = {
    "physicians": dict(code="hlth_rs_physreg", flt={"unit": "P_HTHAB"}, better="higher",
                       unit="per100k", lo=50, hi=1500),
    "deathRate": dict(code="hlth_cd_asdr2", flt={"sex": "T", "age": "TOTAL", "unit": "RT",
                                                  "icd10": "A-R_V-Y"},
                      better="lower", unit="per100k", lo=400, hi=3000),
    "lifeExpectancy": dict(code="demo_r_mlifexp", flt={"sex": "T", "age": "Y_LT1"},
                           better="higher", unit="years", lo=65, hi=90),
    "gdpPps": dict(code="nama_10r_2gdp", flt={"unit": "PPS_HAB_EU27_2020"}, better="neutral",
                   unit="pctEu", lo=10, hi=400),
}


# ---------------------------------------------------------------- fetching

def _archived(folder: Path, stem: str, refresh: bool) -> Path | None:
    found = sorted(folder.glob(f"{stem}_????-??-??.*"))
    if not found or refresh:
        return None
    path = found[-1]
    when = date.fromisoformat(path.name[len(stem) + 1:len(stem) + 11])
    return path if (date.today() - when).days <= MAX_AGE_DAYS else None


def _latest(folder: Path, stem: str) -> Path | None:
    found = sorted(folder.glob(f"{stem}_????-??-??.*"))
    return found[-1] if found else None


def _get(url: str, folder: Path, stem: str, ext: str, refresh: bool) -> tuple[bytes, str]:
    """The body of url, archived under folder as <stem>_<date>.<ext>.gz."""
    folder.mkdir(parents=True, exist_ok=True)
    keep = _archived(folder, stem, refresh)
    if keep:
        return gzip.decompress(keep.read_bytes()), keep.name[len(stem) + 1:len(stem) + 11]
    try:
        resp = requests.get(url, timeout=300, headers=HEADERS)
        resp.raise_for_status()
    except requests.RequestException as exc:
        old = _latest(folder, stem)
        if not old:
            raise ParseError(f"{stem}: no answer and no archived copy ({exc})") from exc
        # an archived answer is still a published fact: use it, and say how old
        print(f"      WARNING: {stem} did not answer ({exc}); keeping {old.name}")
        return gzip.decompress(old.read_bytes()), old.name[len(stem) + 1:len(stem) + 11]
    today = date.today().isoformat()
    for stale in folder.glob(f"{stem}_????-??-??.*"):
        stale.unlink()  # git keeps the history; the folder keeps the current answer
    (folder / f"{stem}_{today}.{ext}.gz").write_bytes(gzip.compress(resp.content, 9))
    return resp.content, today


def eurostat(code: str, flt: dict, refresh: bool, tag: str | None = None) -> tuple[dict, str]:
    query = [(k, v) for k, v in flt.items()] + [("sinceTimePeriod", str(SINCE))]
    url = ES_API + code + "?" + urllib.parse.urlencode(query) + "&format=JSON&lang=EN"
    stem = f"{code}__{tag}" if tag else code
    body, when = _get(url, RAW_ES, stem, "json", refresh)
    data = json.loads(body)
    if "error" in data:
        raise ParseError(f"Eurostat {code} answered with an error: {data['error']}")
    return data, when


def oecd(flow_key: str, refresh: bool) -> tuple[list[dict], str]:
    url = OECD_API.format(flow=OECD_FLOWS[flow_key]) + \
        f"?startPeriod={SINCE}&dimensionAtObservation=AllDimensions"
    folder = RAW_OECD
    folder.mkdir(parents=True, exist_ok=True)
    keep = _archived(folder, flow_key, refresh)
    if keep:
        body, when = gzip.decompress(keep.read_bytes()), keep.name[len(flow_key) + 1:][:10]
    else:
        try:
            resp = requests.get(url, timeout=300,
                                headers={**HEADERS, "Accept": "application/vnd.sdmx.data+csv"})
            resp.raise_for_status()
            body, when = resp.content, date.today().isoformat()
            for stale in folder.glob(f"{flow_key}_????-??-??.*"):
                stale.unlink()
            (folder / f"{flow_key}_{when}.csv.gz").write_bytes(gzip.compress(body, 9))
        except requests.RequestException as exc:
            old = _latest(folder, flow_key)
            if not old:
                raise ParseError(f"OECD {flow_key}: no answer and no archived copy ({exc})") from exc
            print(f"      WARNING: OECD {flow_key} did not answer ({exc}); keeping {old.name}")
            body, when = gzip.decompress(old.read_bytes()), old.name[len(flow_key) + 1:][:10]
    rows = list(csv.DictReader(io.StringIO(body.decode("utf-8-sig"))))
    if not rows or "REF_AREA" not in rows[0]:
        raise ParseError(f"OECD {flow_key}: not the CSV expected")
    return rows, when


# ---------------------------------------------------------------- parsing

def cube(data: dict, fixed: dict | None = None) -> dict[str, dict[str, float]]:
    """{geo: {year: value}} from a JSON-stat answer whose other dimensions
    are fixed (one category each, or picked by `fixed`)."""
    ids, sizes = data["id"], data["size"]
    index = {d: data["dimension"][d]["category"]["index"] for d in ids}
    fixed = fixed or {}
    for d in ids:
        if d in ("geo", "time") or d in fixed:
            continue
        if len(index[d]) != 1:
            raise ParseError(f"{d}: expected one category, got {list(index[d])[:6]}")
    out: dict[str, dict[str, float]] = {}
    for geo, gi in index["geo"].items():
        for year, ti in index["time"].items():
            flat = 0
            for d, size in zip(ids, sizes, strict=True):
                pos = gi if d == "geo" else ti if d == "time" else \
                    index[d][fixed[d]] if d in fixed else 0
                flat = flat * size + pos
            v = data["value"].get(str(flat))
            if v is not None:
                out.setdefault(geo, {})[year] = round(float(v), 3)
    return out


def labels(data: dict) -> dict[str, str]:
    return dict(data["dimension"]["geo"]["category"]["label"])


def oecd_series(rows: list[dict], match: dict) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    for r in rows:
        geo = ISO3.get(r["REF_AREA"])
        if not geo or r.get("OBS_VALUE") in ("", None):
            continue
        if any(r.get(k) != v for k, v in match.items()):
            continue
        year = r["TIME_PERIOD"][:4]
        if year in out.get(geo, {}):
            raise ParseError(f"OECD {match}: two values for {geo} {year} — the match is too loose")
        out.setdefault(geo, {})[year] = round(float(r["OBS_VALUE"]), 3)
    return out


def older_share(counts: dict[str, dict[str, dict[str, float]]]) -> dict[str, dict[str, float]]:
    """Share of physicians aged 55+, per geo and year, by an exact identity:
    the three older bands over the total, or — where an older band is not
    published — one minus the three younger bands. Neither -> no value."""
    out: dict[str, dict[str, float]] = {}
    total = counts["TOTAL"]
    for geo, years in total.items():
        for year, tot in years.items():
            if not tot:
                continue
            old = [counts[b].get(geo, {}).get(year) for b in OLD_BANDS]
            young = [counts[b].get(geo, {}).get(year) for b in YOUNG_BANDS]
            if None not in old:
                share = sum(old) / tot
            elif None not in young:
                share = 1 - sum(young) / tot
            else:
                continue
            out.setdefault(geo, {})[year] = round(100 * share, 2)
    return out


def last_value(series: dict[str, float]) -> tuple[str, float] | None:
    if not series:
        return None
    year = max(series)
    return year, series[year]


# ---------------------------------------------------------------- building

def _pack(meta: dict, values: dict[str, dict[str, float]], source: str, dataset: str,
          url: str, fetched: str, by_geo: dict[str, str] | None = None) -> dict:
    years = sorted({y for g in COUNTRIES for y in values.get(g, {})})
    return {
        "section": meta["section"], "branch": meta["branch"], "better": meta["better"],
        "unit": meta["unit"], "source": source, "dataset": dataset, "url": url,
        "fetched": fetched, "years": years,
        "values": {g: values[g] for g in COUNTRIES if values.get(g)},
        "eu": values.get(EU_AGG, {}),
        # a country whose series comes from the other publisher, whole
        "sourceByGeo": by_geo or {},
        **({"part": meta["part"]} if "part" in meta else {}),
    }


def build_countries(refresh: bool) -> tuple[dict, dict]:
    indicators: dict[str, dict] = {}
    fetched: dict[str, str] = {}
    cache: dict[tuple, tuple] = {}
    for key, m in ES_INDICATORS.items():
        sig = (m["code"], json.dumps(m["flt"], sort_keys=True))
        if sig not in cache:
            tag = key if m["code"] in ("hlth_rs_physcat", "hlth_rs_prs2", "hlth_rs_grd2",
                                       "hlth_ehis_am1u", "hlth_silc_08", "hlth_silc_09",
                                       "hlth_cd_apr", "hlth_ps_prev", "hlth_sha11_hf",
                                       "hlth_sha11_hp", "hlth_sha11_hc") else None
            cache[sig] = eurostat(m["code"], m["flt"], refresh, tag)
        data, when = cache[sig]
        fetched[m["code"]] = when
        indicators[key] = _pack(m, cube(data), "eurostat", m["code"],
                                ES_PAGE.format(code=m["code"]), when)

    # physicians aged 55+, from the age bands
    bands: dict[str, dict] = {}
    for band in ["TOTAL", *OLD_BANDS, *YOUNG_BANDS]:
        data, when = eurostat(AGE_CODE, {"sex": "T", "unit": "NR", "age": band}, refresh,
                              tag=band.replace("-", "_"))
        bands[band] = cube(data)
    fetched[AGE_CODE] = when
    indicators["physicians55"] = _pack(
        dict(section="workforce", branch="both", better="lower", unit="pct"),
        older_share(bands), "eurostat", AGE_CODE, ES_PAGE.format(code=AGE_CODE), when)

    oecd_rows: dict[str, tuple[list[dict], str]] = {}
    for key, m in OECD_INDICATORS.items():
        if m["flow"] not in oecd_rows:
            oecd_rows[m["flow"]] = oecd(m["flow"], refresh)
        rows, when = oecd_rows[m["flow"]]
        fetched[f"oecd:{m['flow']}"] = when
        indicators[key] = _pack(m, oecd_series(rows, m["match"]), "oecd",
                                OECD_FLOWS[m["flow"]].split(",")[0], OECD_PAGE, when)

    # the United Kingdom after Eurostat: one publisher for the whole series,
    # and only after the two have been shown to agree where they overlap
    for key, (flow, match) in OECD_UK.items():
        if flow not in oecd_rows:
            oecd_rows[flow] = oecd(flow, refresh)
        rows, when = oecd_rows[flow]
        fetched[f"oecd:{flow}"] = when
        uk = {y: round(v * 100, 2) for y, v in oecd_series(rows, match).get("UK", {}).items()}
        es = indicators[key]["values"].get("UK", {})
        both = sorted(set(uk) & set(es))
        if not both:
            raise ParseError(f"{key}: Eurostat and OECD share no UK year to check against")
        worst = max(abs(uk[y] - es[y]) / es[y] for y in both)
        if worst > UK_AGREE:
            raise ParseError(f"{key}: OECD and Eurostat disagree on the UK by {worst:.0%} "
                             f"({both[0]}–{both[-1]}); not taking the OECD series")
        if max(uk) > max(es):
            indicators[key]["values"]["UK"] = uk
            indicators[key]["sourceByGeo"]["UK"] = "oecd"
            indicators[key]["years"] = sorted(set(indicators[key]["years"]) | set(uk))
    return indicators, fetched


# ---------------------------------------------------------------- migration

TOP_ORIGINS = 10


def _alpha2(iso3: str) -> str | None:
    """OECD's alpha-3 as the page writes a country: Eurostat's code for the
    countries it carries (EL, UK), ISO alpha-2 for the rest, None for the
    aggregates ("W" = all, "W_O_X" = unknown)."""
    if iso3 in ISO3:
        return ISO3[iso3]
    import pycountry
    c = pycountry.countries.get(alpha_3=iso3)
    return c.alpha_2 if c else None


def build_migration(rows: list[dict]) -> dict:
    """Where each country's doctors were trained, and where the doctors a
    country trained now work — as far as the destination reports it.

    The OECD counts by place of training, not by nationality: a country that
    teaches many foreign students "sends" them home on paper. The page says
    so; nothing here tries to tell the two apart."""
    doctors = [r for r in rows if r["MEASURE"] == "HW" and r["UNIT_MEASURE"] == "PS"
               and r["HEALTH_PROF"] == "PHYS" and r.get("OBS_VALUE") not in ("", None)]
    latest: dict[tuple[str, str, str], tuple[str, float]] = {}
    for r in doctors:
        key = (r["REF_AREA"], r["ORIGIN"], r["TRAINING_PLACE"])
        if key not in latest or r["TIME_PERIOD"] > latest[key][0]:
            latest[key] = (r["TIME_PERIOD"], float(r["OBS_VALUE"]))

    inflow: dict[str, dict] = {}
    outflow: dict[str, dict] = {}
    for iso3, geo in ISO3.items():
        total = latest.get((iso3, "W", "FOREIGN"))
        home = latest.get((iso3, "W", "DOMESTIC"))
        if total:
            year = total[0]
            # the origins of the same year as the total, so the parts and the
            # whole describe one count
            parts = []
            for (ref, origin, place), (y, n) in latest.items():
                if ref != iso3 or place != "FOREIGN" or y != year or origin in ("W", "W_O_X"):
                    continue
                code = _alpha2(origin)
                if code and n > 0:
                    parts.append([code, int(n)])
            parts.sort(key=lambda x: -x[1])
            listed = sum(n for _, n in parts)
            if listed > total[1] * 1.01 + 1:
                raise ParseError(f"migration {geo} {year}: origins add up to {listed}, "
                                 f"more than the {total[1]:.0f} foreign-trained doctors")
            inflow[geo] = {"year": year, "foreign": int(total[1]),
                           "domestic": int(home[1]) if home and home[0] == year else None,
                           "origins": parts[:TOP_ORIGINS],
                           "other": int(total[1]) - sum(n for _, n in parts[:TOP_ORIGINS])}
        dests = []
        for (ref, origin, place), (y, n) in latest.items():
            if origin != iso3 or place != "FOREIGN" or ref == iso3:
                continue
            code = _alpha2(ref)
            if code and n > 0:
                dests.append([code, y, int(n)])
        dests.sort(key=lambda x: -x[2])
        if dests:
            outflow[geo] = {"destinations": dests, "total": sum(d[2] for d in dests),
                            "home": int(home[1]) if home else None,
                            "homeYear": home[0] if home else None}
    return {"inflow": inflow, "outflow": outflow,
            "dataset": OECD_FLOWS["wfmi"].split(",")[0]}


def build_regions(refresh: bool) -> tuple[dict, dict, dict]:
    regions: dict[str, dict] = {}
    names: dict[str, str] = {}
    fetched: dict[str, str] = {}
    for key, m in REGIONAL.items():
        data, when = eurostat(m["code"], m["flt"], refresh, tag="nuts2")
        fetched[m["code"]] = when
        names.update({g: n for g, n in labels(data).items() if len(g) == 4})
        for geo, years in cube(data).items():
            # the UK left the regional tables with the union; its old codes
            # have no outline in NUTS 2024
            if len(geo) != 4 or geo[:2] not in EU27:
                continue
            regions.setdefault(geo, {})[key] = years
    meta = {k: {"better": m["better"], "unit": m["unit"], "dataset": m["code"],
                "url": ES_PAGE.format(code=m["code"])} for k, m in REGIONAL.items()}
    return regions, names, {"indicators": meta, "fetched": fetched}


def build_geometry(refresh: bool, keep_regions: set[str]) -> dict:
    """Country and NUTS 2 outlines, cut to what the page draws: Europe's
    mainland frame, coordinates rounded to ~1 km. Countries come from GISCO's
    country file — NUTS 2024 no longer has the UK — and include the
    neighbours the page carries no figures for, drawn as grey context."""
    out = {"attribution": "© EuroGeographics for the administrative boundaries",
           "source": [GISCO_CNTR, GISCO.format(level=2)], "countries": [], "regions": []}
    body, _ = _get(GISCO_CNTR, RAW_GEO, "cntr2024", "geojson", refresh)
    for f in json.loads(body)["features"]:
        p = f["properties"]
        geom = _clip(f["geometry"])
        if geom:
            out["countries"].append({"id": p["CNTR_ID"], "name": p.get("NAME_ENGL") or p["CNTR_ID"],
                                     "carried": p["CNTR_ID"] in COUNTRIES, "geometry": geom})
    body, _ = _get(GISCO.format(level=2), RAW_GEO, "nuts2024_l2", "geojson", refresh)
    for f in json.loads(body)["features"]:
        p = f["properties"]
        if p["NUTS_ID"] not in keep_regions:
            continue
        geom = _clip(f["geometry"])
        if geom:
            out["regions"].append({"id": p["NUTS_ID"], "name": p.get("NAME_LATN") or p["NUTS_ID"],
                                   "geometry": geom})
    return out


# the frame the map draws: mainland Europe with the islands near it — the
# outermost regions (the Canaries, Madeira, the Azores, the French overseas
# departments) would shrink the continent to a corner
FRAME = (-25.0, 34.0, 45.0, 71.5)


def _clip(geom: dict) -> dict | None:
    def inside(ring):
        return any(FRAME[0] <= x <= FRAME[2] and FRAME[1] <= y <= FRAME[3] for x, y in ring)

    def rnd(ring):
        pts = [[round(x, 2), round(y, 2)] for x, y in ring]
        slim = [pts[0]] + [p for i, p in enumerate(pts[1:], 1) if p != pts[i - 1]]
        return slim if len(slim) >= 4 else None

    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    kept = []
    for poly in polys:
        if not inside(poly[0]):
            continue
        rings = [r for r in (rnd(ring) for ring in poly) if r]
        if rings:
            kept.append(rings)
    if not kept:
        return None
    return {"type": "MultiPolygon", "coordinates": kept}


def build(refresh: bool = False) -> tuple[dict, dict]:
    indicators, fetched = build_countries(refresh)
    migration = build_migration(oecd("wfmi", refresh)[0])
    regions, region_names, regional = build_regions(refresh)
    geometry = build_geometry(refresh, set(regions))
    drawn = {r["id"] for r in geometry["regions"]}
    # a region with figures but no outline (an old NUTS code) is listed, not lost
    unmapped = sorted(set(regions) - drawn)
    out = {
        "schemaVersion": SCHEMA_VERSION,
        "built": date.today().isoformat(),
        "countries": COUNTRIES,
        "eu27": EU27,
        "groups": GROUPS,
        "fetched": {**fetched, **{f"regional:{k}": v for k, v in regional["fetched"].items()}},
        "indicators": indicators,
        "migration": migration,
        "regional": {
            "indicators": regional["indicators"],
            "names": {g: region_names.get(g, g) for g in sorted(regions)},
            "values": {g: regions[g] for g in sorted(regions)},
            "borderPairs": [list(p) for p in BORDER_PAIRS],
            "unmapped": unmapped,
        },
    }
    guard(out, geometry)
    return out, geometry


SUMMARY_OUT = ROOT / "data" / "europe_summary.json"
# the landing page's two European facts: one per branch, each a measure on
# which Hungary stands in the bottom of the region it is compared with
HEADLINES = {"gp": "gpDensity", "dental": "dentVisit"}


def summary_facts(out: dict) -> dict:
    """Hungary's latest value, the region's ranking and the yardstick, for
    the two headline measures — computed, never typed."""
    facts = {}
    members = GROUPS["cee"]
    for kind, key in HEADLINES.items():
        ind = out["indicators"][key]
        rows = []
        for g in members:
            lv = last_value(ind["values"].get(g, {}))
            if lv:
                rows.append((g, lv[0], lv[1]))
        newest = max(r[1] for r in rows)
        live = [r for r in rows if int(newest) - int(r[1]) <= 5]
        live.sort(key=lambda r: -r[2] if ind["better"] == "higher" else r[2])
        hu = next(r for r in live if r[0] == "HU")
        vals = sorted(r[2] for r in live)
        mid = len(vals) / 2
        median = vals[int(mid)] if len(vals) % 2 else (vals[int(mid) - 1] + vals[int(mid)]) / 2
        eu = last_value(ind["eu"])
        facts[kind] = {"key": key, "unit": ind["unit"], "year": hu[1], "value": hu[2],
                       "rank": [r[0] for r in live].index("HU") + 1, "of": len(live),
                       "median": round(median, 2),
                       "eu": {"year": eu[0], "value": eu[1]} if eu else None,
                       "best": {"geo": live[0][0], "value": live[0][2], "year": live[0][1]}}
        if key == "dentVisit":
            rural = last_value(out["indicators"]["dentVisitRural"]["values"].get("HU", {}))
            if rural:
                facts[kind]["rural"] = {"year": rural[0], "value": rural[1]}
    return {"schemaVersion": 1, "built": out["built"], "group": "cee", "facts": facts}


def guard(out: dict, geometry: dict) -> None:
    bounds = {**ES_INDICATORS, **OECD_INDICATORS,
              "physicians55": {"lo": 5, "hi": 80}}
    for key, ind in out["indicators"].items():
        lo, hi = bounds[key]["lo"], bounds[key]["hi"]
        for geo, years in [*ind["values"].items(), (EU_AGG, ind["eu"])]:
            for year, v in years.items():
                if not lo <= v <= hi:
                    raise ParseError(f"{key} {geo} {year}: {v} outside [{lo}, {hi}]")
        if ind["source"] == "eurostat":
            # Hungary is the point of the page, and Eurostat covers the EU
            if "HU" not in ind["values"]:
                raise ParseError(f"{key}: no value for Hungary")
            if len(ind["values"]) < 15:
                raise ParseError(f"{key}: only {len(ind['values'])} countries")
        elif len(ind["values"]) < 5:
            raise ParseError(f"{key}: only {len(ind['values'])} countries from the OECD")
    ind = out["indicators"]
    for geo, years in ind["avoidable"]["values"].items():
        for year, total in years.items():
            t = ind["treatable"]["values"].get(geo, {}).get(year)
            p = ind["preventable"]["values"].get(geo, {}).get(year)
            if t is not None and p is not None and abs(t + p - total) > 1.0:
                raise ParseError(f"avoidable {geo} {year}: {t} + {p} != {total}")
    mig = out["migration"]
    if "HU" not in mig["inflow"] or "HU" not in mig["outflow"]:
        raise ParseError("migration: no figures for Hungary")
    reg = out["regional"]
    bounds_r = REGIONAL
    for geo, vals in reg["values"].items():
        for key, years in vals.items():
            for year, v in years.items():
                if not bounds_r[key]["lo"] <= v <= bounds_r[key]["hi"]:
                    raise ParseError(f"regional {key} {geo} {year}: {v} out of bounds")
    hu = [g for g in reg["values"] if g.startswith("HU")]
    if len(hu) != 8:
        raise ParseError(f"expected Hungary's 8 NUTS 2 regions, got {sorted(hu)}")
    for a, b in BORDER_PAIRS:
        for g in (a, b):
            if g not in reg["values"]:
                raise ParseError(f"border pair {a}–{b}: no figures for {g}")
    drawn = {r["id"] for r in geometry["regions"]}
    carried = {c["id"] for c in geometry["countries"] if c["carried"]}
    if not set(hu) <= drawn or carried != set(COUNTRIES):
        raise ParseError("the map lost Hungary's regions or a country outline")
    for g, members in GROUPS.items():
        if not set(members) <= set(COUNTRIES):
            raise ParseError(f"group {g} names a country the page does not carry")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--refresh", action="store_true")
    out, geometry = build(parser.parse_args().refresh)
    write(out, geometry)
    print(summary(out))


def write(out: dict, geometry: dict) -> None:
    SUMMARY_OUT.write_text(json.dumps(summary_facts(out), ensure_ascii=False) + "\n",
                           encoding="utf-8")
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    GEO_OUT.parent.mkdir(parents=True, exist_ok=True)
    GEO_OUT.write_text(json.dumps(geometry, ensure_ascii=False, separators=(",", ":")) + "\n",
                       encoding="utf-8")


def summary(out: dict) -> str:
    hu = []
    for key in ("gpDensity", "dentistDensity", "dentVisit", "avoidable"):
        v = last_value(out["indicators"][key]["values"]["HU"])
        hu.append(f"{key} {v[1]:g} ({v[0]})")
    return (f"wrote {OUT}: {len(out['indicators'])} indicators, "
            f"{len(out['regional']['values'])} regions; HU " + ", ".join(hu))


if __name__ == "__main__":
    main()
