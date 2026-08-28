# Requirements Document

Feature Name: data-import-mapping
Updated: 2026-08-28

## Introduction

The Data Import module accepts Excel/CSV files whose layout varies unpredictably between vendors: headers sit on different rows, columns carry arbitrary names, data may live in any worksheet, and hidden or duplicate columns exist. This feature inserts a mapping layer between file parsing and validation. After upload, the system extracts worksheet names, detected tables and headers, and presents a two-column mapping interface: the left column lists EOMS target elements, the right column holds the source header mapped against each element. Users confirm or adjust the mapping before any row is validated or committed.

## Glossary

- **EOMS Element**: A named field of the PRL-EOMS data model that an import writes to (e.g. Invoice No, Invoice Date, Amount, Contract No).
- **Source Header**: The literal text of a column heading found in the uploaded worksheet.
- **Header Row**: The worksheet row that contains the Source Headers.
- **Worksheet**: A single sheet inside an uploaded Excel workbook, or the implicit single sheet of a CSV file.
- **Auto-Mapping**: A system-generated suggestion that pairs an EOMS Element with a Source Header, produced by normalizing names and scoring similarity.
- **Sample Values**: Up to three non-empty cell values from the mapped source column, shown for human confirmation.
- **Mapping Template**: A saved association between a header signature and a complete element-to-header mapping, reused for future uploads.
- **Normalized Value**: A source cell converted to the canonical form of its EOMS Element (ISO date, plain decimal number, trimmed text).
- **Unmapped Element**: An EOMS Element with no source header assigned.

## Requirements

### Requirement 1 — File intake and structure extraction

**User Story:** AS an importer, I want the system to read the structure of my uploaded workbook, so that I can map its contents without reformatting my file.

#### Acceptance Criteria

1. WHEN the user uploads an `.xlsx`, `.xls` or `.csv` file, the system SHALL extract every worksheet name and the number of data rows per worksheet before showing any mapping UI.
2. WHEN the uploaded workbook contains more than one worksheet, the system SHALL present a worksheet selector listing each sheet name with its row count, and the mapping UI SHALL operate on the selected worksheet.
3. WHEN a CSV file is uploaded, the system SHALL treat the file as a single worksheet named after the file.
4. IF the workbook has no readable rows, the system SHALL display an error naming the file and the reason, and the system SHALL keep the user on the upload step.

### Requirement 2 — Header row detection

**User Story:** AS an importer, I want the system to find the real header row under report banners, so that merged-cell titles do not become column names.

#### Acceptance Criteria

1. WHEN a worksheet is selected, the system SHALL scan the first ten rows and SHALL score each row by text density and header-alias hits, then SHALL designate the highest-scoring row as the Header Row.
2. WHEN the header detection completes, the system SHALL show the detected Header Row number and a control to select a different row.
3. WHEN the user changes the Header Row selection, the system SHALL rebuild the Source Header list and the Auto-Mapping from the new row.
4. IF two or more source headers in the Header Row share the same text, the system SHALL append a numeric suffix to each duplicate so every Source Header is unique, and the system SHALL flag the duplicates in the header list.

### Requirement 3 — Column inventory

**User Story:** AS an importer, I want a complete inventory of the columns in the selected worksheet, so that hidden or unusual columns are visible before mapping.

#### Acceptance Criteria

1. WHEN the Header Row is set, the system SHALL list every column of the worksheet with its Source Header text, its column letter, and its hidden/visible state.
2. WHILE the mapping UI is open, the system SHALL show up to three Sample Values per source column taken from the rows below the Header Row.

### Requirement 4 — Two-column mapping interface

**User Story:** AS an importer, I want a two-column table that pairs each EOMS Element with the source header that feeds it, so that I control exactly how my file lands in the system.

#### Acceptance Criteria

1. WHEN the mapping step opens, the system SHALL render a table whose left column lists every required and optional EOMS Element for the chosen import type, and whose right column holds, per element, a selector of available Source Headers.
2. WHEN the user opens the selector for an element, the system SHALL offer every Source Header of the selected worksheet, each entry showing the header text and its Sample Values.
3. WHEN an element is mapped to a source header, the system SHALL display the Sample Values of that header beside the element and SHALL mark the element as mapped.
4. WHEN a source header is assigned to an element, the system SHALL exclude that header from the selector of other elements, and the system SHALL offer an explicit "Ignore" entry for headers that import should skip.
5. WHILE any required EOMS Element is an Unmapped Element, the system SHALL disable the continue control and SHALL highlight the missing elements.

### Requirement 5 — Auto-mapping suggestions

**User Story:** AS an importer, I want the system to pre-fill the mapping from header names and value shapes, so that well-formed files need almost no manual work.

#### Acceptance Criteria

1. WHEN the mapping step opens, the system SHALL run Auto-Mapping, which SHALL normalize header text (lowercase, strip punctuation and spacing), match against each element's alias list, and score fuzzy token overlap as a fallback.
2. WHEN Auto-Mapping produces a confident match for an element, the system SHALL pre-select that source header in the element's selector and SHALL mark the suggestion with a confidence badge.
3. WHEN Auto-Mapping maps a header by fuzzy score alone, the system SHALL label the suggestion "Low confidence" and SHALL leave it user-editable.
4. IF two elements contest the same source header, the system SHALL assign the header to the element with the higher confidence and SHALL leave the other element unmapped.

### Requirement 6 — Value preview and normalization

**User Story:** AS an importer, I want to see how mapped values will be converted, so that date and amount mistakes surface before commit.

#### Acceptance Criteria

1. WHEN the mapping table has a mapped element of type date, the system SHALL show the normalized ISO value next to each Sample Value.
2. WHEN the mapping table has a mapped element of type amount, the system SHALL show the normalized decimal value next to each Sample Value.
3. IF a sample value fails normalization, the system SHALL show the failure inline on that element and SHALL mark the element with a warning badge.
4. WHEN the selected worksheet uses an ambiguous day-first or month-first date pattern, the system SHALL normalize using the system default (day-first) and SHALL show an ambiguity notice listing the affected elements.

### Requirement 7 — Mapping templates

**User Story:** AS a recurring importer, I want my mapping remembered per file layout, so that the next upload from the same source maps itself.

#### Acceptance Criteria

1. WHEN the user continues past the mapping step, the system SHALL save the current mapping as a Mapping Template keyed by the import type and the normalized header signature of the worksheet.
2. WHEN a future upload's normalized header signature matches a stored Mapping Template, the system SHALL pre-apply that mapping and SHALL show a notice naming the applied template with an option to edit it.
3. WHEN the user edits an auto-applied mapping, the system SHALL overwrite the stored template on continue.

## Out of Scope (this iteration)

- Import batch rollback and file-hash idempotency (planned next iteration).
- Cell-level in-review fixing UI.
- Scanned-PDF support; PDF imports stay limited to text-extractable documents.
