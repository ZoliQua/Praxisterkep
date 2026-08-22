"""Canonical data source registry. Update URLs here only (see CLAUDE.md).

All NEAK files live under the pfile endpoint and are unversioned URLs:
the server always serves the current month. Raw archives under
data/raw/YYYY-MM/ are therefore the only durable record of each month.
Listing page: https://www.neak.gov.hu/letoltheto/altfin_dok/szerzodott_szolgaltatok
"""

NEAK_BASE = "https://www.neak.gov.hu/pfile/file?path=/letoltheto/altfin_dok/szerzodott_szolgaltatok/"

SOURCES = {
    # A — vacant dental services (monthly PDF)
    "dental_vacant": {
        "url": NEAK_BASE + "Betoltetlen_fogorvosi_szolgalatok&inline=true",
        "format": "pdf",
        "kind": "dental",
    },
    # A' — vacant dental services whose contract was terminated (dissolved list)
    "dental_vacant_dissolved": {
        "url": NEAK_BASE + "Betoltetlen_megszunt_fogorvosi_szolgalatok&inline=true",
        "format": "pdf",
        "kind": "dental",
    },
    # C — full contracted dental registry (denominator for vacancy rates)
    "dental_registry": {
        "url": NEAK_BASE + "Fogorvosi_rendelok_xls&inline=true",
        "format": "xls",
        "kind": "dental",
    },
    # B — vacant GP services (monthly PDF) — v1, not parsed in MVP
    "gp_vacant": {
        "url": NEAK_BASE + "Betoltetlen_haziorvosi_szolgalatok&inline=true",
        "format": "pdf",
        "kind": "gp",
    },
    # C-gp — full contracted GP registry — v1, not parsed in MVP
    "gp_registry": {
        "url": NEAK_BASE + "Haziorvosi_szolgalatok_xls&inline=true",
        "format": "xls",
        "kind": "gp",
    },
}
