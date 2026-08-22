"""Canonical data source registry. Update URLs here only (see CLAUDE.md)."""

NEAK_BASE = "https://www.neak.gov.hu/pfile/file?path="

SOURCES = {
    # A — vacant dental services (monthly PDF)
    "dental_vacant": {
        "url": NEAK_BASE + "/letoltheto/altfin_dok/szerzodott_szolgaltatok/Betoltetlen_fogorvosi_szolgalatok&inline=true",
        "format": "pdf",
        "kind": "dental",
    },
    # B — vacant GP services (monthly PDF) — v1, not parsed in MVP
    "gp_vacant": {
        "url": NEAK_BASE + "%2Fletoltheto%2Faltfin_dok%2Fszerzodott_szolgaltatok%2FBetoltetlen_haziorvosi_szolgalatok&inline=true",
        "format": "pdf",
        "kind": "gp",
    },
    # C — full contracted-services registry (denominator) — URL to be confirmed
    # "registry_dental": {...},
}
