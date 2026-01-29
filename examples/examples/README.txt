# STANAG 4774/4778 Dummy Dataset

This folder contains dummy data objects in multiple file formats with:
- Visible *markings* inside the payload (e.g., page banners, header/footer, first line, slide banners).
- STANAG 4778 *sidecar* bindings (`.bdo`) that carry a STANAG 4774 `originatorConfidentialityLabel`.
- For selected file types, an XMP sidecar (`.xmp`) is also provided.

## Files
- `manifest.json` / `manifest.csv`: index of all payload files and their sidecars.

## Notes
- The labels use `PolicyIdentifier = "NATO"` and classifications: UNCLASSIFIED / RESTRICTED / CONFIDENTIAL.
- Sidecar naming: `<filename>.<ext>.bdo` and XMP sidecar naming: `<filename>.<ext>.xmp`.
