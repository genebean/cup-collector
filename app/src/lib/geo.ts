// US state abbreviation → full name, matching the Cup.region field in PocketBase.
const US_STATE_ABBREV: Record<string, string> = {
  AL: "Alabama",    AK: "Alaska",       AZ: "Arizona",      AR: "Arkansas",
  CA: "California", CO: "Colorado",     CT: "Connecticut",  DE: "Delaware",
  FL: "Florida",    GA: "Georgia",      HI: "Hawaii",       ID: "Idaho",
  IL: "Illinois",   IN: "Indiana",      IA: "Iowa",         KS: "Kansas",
  KY: "Kentucky",   LA: "Louisiana",    ME: "Maine",        MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan",  MN: "Minnesota",    MS: "Mississippi",
  MO: "Missouri",   MT: "Montana",      NE: "Nebraska",     NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",  NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio",     OK: "Oklahoma",
  OR: "Oregon",     PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee",  TX: "Texas",        UT: "Utah",
  VT: "Vermont",    VA: "Virginia",     WA: "Washington",   WV: "West Virginia",
  WI: "Wisconsin",  WY: "Wyoming",      DC: "Washington, D.C.",
};

// Country name as it appears in a Google Places formattedAddress → ISO 3166-1 alpha-2.
const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  "USA": "US", "United States": "US",
  "Canada": "CA",
  "United Kingdom": "GB", "UK": "GB",
  "Australia": "AU", "New Zealand": "NZ",
  "Japan": "JP", "China": "CN", "South Korea": "KR",
  "Taiwan": "TW", "Hong Kong": "HK",
  "Singapore": "SG", "Malaysia": "MY", "Thailand": "TH",
  "Indonesia": "ID", "Philippines": "PH", "India": "IN",
  "Mexico": "MX", "Brazil": "BR", "Chile": "CL",
  "Colombia": "CO", "Peru": "PE", "Argentina": "AR",
  "France": "FR", "Germany": "DE", "Spain": "ES", "Italy": "IT",
  "Netherlands": "NL", "Switzerland": "CH", "Austria": "AT",
  "Belgium": "BE", "Denmark": "DK", "Norway": "NO",
  "Sweden": "SE", "Finland": "FI", "Poland": "PL",
  "Czech Republic": "CZ", "Hungary": "HU",
  "Turkey": "TR", "Russia": "RU",
  "United Arab Emirates": "AE", "Saudi Arabia": "SA",
  "South Africa": "ZA",
};

/**
 * Parses a Google Places formattedAddress into region (US state name) and
 * ISO country code. Both fields are empty strings when parsing fails.
 *
 * US:  "123 Main St, Villa Rica, GA 30180, USA"        → { region: "Georgia", countryCode: "US" }
 * CA:  "200 Burrard St, Vancouver, BC V6C 3L6, Canada" → { region: "",        countryCode: "CA" }
 * UK:  "191 Victoria St, London SW1E 5NE, UK"          → { region: "",        countryCode: "GB" }
 */
export function parseAddressComponents(address: string): { region: string; countryCode: string } {
  // US ZIP pattern: ", ST 12345" or ", ST 12345-6789" anywhere in the string.
  // Canadian/Australian postal codes start with a letter so they won't match \d{5}.
  const usMatch = address.match(/,\s*([A-Z]{2})\s+\d{5}/);
  if (usMatch) {
    return { region: US_STATE_ABBREV[usMatch[1]] ?? "", countryCode: "US" };
  }

  // Fallback: use the last comma-separated segment as the country name.
  const lastPart = address.split(",").pop()?.trim() ?? "";
  const countryCode = COUNTRY_NAME_TO_CODE[lastPart] ?? "";
  return { region: "", countryCode };
}

// Approximate great-circle distance between two lat/lng points in miles (Haversine formula).
export function haversineMi(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
