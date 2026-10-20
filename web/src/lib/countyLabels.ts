// Where a county's name sits on the little map of the country, where the
// average of its outline's points puts it badly: across a border, on top of
// Budapest, or crowding a neighbour's name. Placed by hand on the county
// picker (2026-10) and kept as longitude/latitude, so any box the outlines are
// projected into puts the name in the same place.
export const COUNTY_LABELS: Record<string, [number, number]> = {
  Baranya: [18.1973, 46.0013],
  'Borsod-Abaúj-Zemplén': [21.0626, 48.2402],
  'Bács-Kiskun': [19.414, 46.5552],
  Békés: [21.0022, 46.7169],
  Fejér: [18.552, 47.088],
  'Hajdú-Bihar': [21.4995, 47.4876],
  Heves: [20.149, 47.7728],
  Nógrád: [19.4733, 47.9404],
  Pest: [19.509, 47.2806],
  Somogy: [17.615, 46.3982],
  'Szabolcs-Szatmár-Bereg': [22.0081, 47.9745],
  Vas: [16.8051, 47.1149],
  Veszprém: [17.6909, 47.1055],
  Zala: [16.8708, 46.6336],
};
