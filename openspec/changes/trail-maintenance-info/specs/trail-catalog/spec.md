# Spec Delta

## MODIFIED Requirements

### Requirement: Entry metadata schema
The metadata file SHALL be validated against a schema. Required fields: `name` (non-empty string), `summary` (string, at most 200 characters), `difficulty` (one of `T`, `E`, `EE`, `EEA`), `municipalities` (non-empty list of strings; MUST include at least one of Piateda or a municipality bordering it), `start` (object with `name` and optionally `lat`/`lon`). Optional fields: `description` (Markdown string), `signage` (string, e.g. a CAI number), `duration_minutes` (positive integer), `loop` (boolean, routes only), `trails` (list of trail identifiers, routes only), `tags` (list of strings), `status` (one of `open`, `closed`, `maintenance`; default `open`), `verified_on` (ISO date), `sources` (list of strings or URLs), `contributors` (list of strings), `photos` (list of objects with `file` (filename inside `photos/`), optional `caption` (string, at most 200 characters), optional `lat`/`lon` (numbers) and optional `author` (string)), `cover` (filename of one of the photos), `maintenance` (object whose contents are specified by the `trail-maintenance` capability). Unknown fields MUST be rejected.

#### Scenario: Missing required field
- **WHEN** a metadata file has no `difficulty`
- **THEN** the build fails and the error names the entry, the field and the accepted values

#### Scenario: Unknown field
- **WHEN** a metadata file contains a field `dificulty`
- **THEN** the build fails and the error names the entry and the unknown field

#### Scenario: Route referencing an unknown trail
- **WHEN** a route metadata lists `trails: [sentiero-inesistente]` and no trail with that identifier exists
- **THEN** the build fails and the error names the route and the missing trail identifier
