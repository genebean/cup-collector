export interface SeriesOption {
  value: string;
  label: string;
}

// Builds the series dropdown options for the Browse page.
//
// When a series has both mugs and ornaments, two entries are emitted:
//   { value: "Been There|mug",      label: "Been There" }
//   { value: "Been There|ornament", label: "Been There Ornaments" }
// mirroring how starbucks-mugs.com treats them as separate sub-catalogs.
//
// When a series has only one type, a single entry is emitted with no type
// suffix in the value:
//   { value: "You Are Here", label: "You Are Here" }   // mugs only
//   { value: "Foo|ornament", label: "Foo Ornaments" }  // ornaments only
//
// The caller is responsible for pre-filtering cups (e.g. applying collection
// prefs that exclude ornaments) before passing them in.
export function buildSeriesOptions(
  cups: Array<{ series: string; item_type?: string | null }>
): SeriesOption[] {
  const names = [...new Set(cups.map((c) => c.series))].sort();
  const opts: SeriesOption[] = [];

  for (const name of names) {
    const hasMugs     = cups.some((c) => c.series === name && (c.item_type || "mug") === "mug");
    const hasOrnaments = cups.some((c) => c.series === name && c.item_type === "ornament");

    if (hasMugs && hasOrnaments) {
      opts.push({ value: `${name}|mug`,      label: name });
      opts.push({ value: `${name}|ornament`, label: `${name} Ornaments` });
    } else if (hasOrnaments) {
      opts.push({ value: `${name}|ornament`, label: `${name} Ornaments` });
    } else {
      opts.push({ value: name, label: name });
    }
  }

  return opts;
}
