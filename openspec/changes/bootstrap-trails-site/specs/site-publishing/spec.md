# Spec Delta

## Purpose

Defines how the site is built and published to GitHub Pages, and how contributions are validated before merge so the published site never contains an invalid entry.

## ADDED Requirements

### Requirement: Static build
The site SHALL build to a directory of static files (HTML, JS, CSS, GPX, GeoJSON) with a single command and no runtime server. The build MUST fail with a non-zero exit code when any catalog entry fails validation.

#### Scenario: Successful build
- **WHEN** all entries are valid and the build command runs
- **THEN** it exits 0 and the output directory contains one HTML page per entry, the list page, the map page, the overview geometry and every GPX

#### Scenario: Invalid entry
- **WHEN** any entry fails validation
- **THEN** the build exits non-zero and no output is published

### Requirement: Deployment to GitHub Pages
Every push to `main` SHALL trigger a workflow that builds the site and publishes the output to GitHub Pages. The published site MUST work under the repository sub-path (`https://<owner>.github.io/trails-of-piateda/`) and under a custom domain if one is configured, with all internal links and asset URLs resolving correctly in both cases.

#### Scenario: Publish on merge
- **WHEN** a pull request is merged into `main`
- **THEN** within the workflow run the new site version is live at the Pages URL

#### Scenario: Sub-path links
- **WHEN** the site is served under `/trails-of-piateda/`
- **THEN** navigation links, GPX downloads, GeoJSON requests and map assets all resolve without 404

### Requirement: Pull request validation
Every pull request SHALL run the same build as the deployment workflow as a required status check, without publishing. Pull requests from forks MUST be able to run this check without access to any secret.

#### Scenario: Invalid contribution
- **WHEN** a pull request adds an entry with a missing `difficulty`
- **THEN** the check fails and its log names the entry and the missing field

#### Scenario: Fork PR
- **WHEN** a pull request is opened from a fork
- **THEN** the validation check runs and reports a result

### Requirement: Contribution documentation
The repository SHALL contain a README describing the project and how to run it locally, a CONTRIBUTING document describing how to add or modify an entry (directory layout, metadata fields, GPX requirements, photo requirements: format, size and count limits, geotag or manual position, rights ownership, data license acceptance), a pull request template with a checklist for entry contributions, and an issue template for proposing a trail without opening a PR.

#### Scenario: New contributor
- **WHEN** a person with a GitHub account reads CONTRIBUTING
- **THEN** they can add a valid entry by following the document alone, without reading the source code

### Requirement: Licensing files
The repository SHALL contain a license for the code and a separate, clearly referenced license for the catalog data (metadata and GPX), and CONTRIBUTING MUST state that opening a PR means accepting that contributed data, photos included, is published under the data license and that the contributor holds the rights to the photos they add.

#### Scenario: License presence
- **WHEN** the repository is inspected
- **THEN** it contains `LICENSE` (code) and `LICENSE-DATA` (data), and CONTRIBUTING references both
