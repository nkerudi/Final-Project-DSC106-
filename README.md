# Storm Futures: How Do Human Climate Choices Reshape the Storms of Our Future?

**Live site:** https://nkerudi.github.io/Final-Project-DSC106-/storm_futures/

An interactive data story exploring how tropical storms and hurricanes have evolved from the 1970s to today, and how they are projected to change under different greenhouse gas emissions scenarios through the end of the century.

**Authors:** Sweekrit Bhatnagar, Nikitha Kerudi, Wanhan Sun, Nicholas Chan  
**Course:** DSC 106 — Data Visualization, UC San Diego (Spring 2026)

---

## Overview

This project uses climate model data from the CMIP6 ensemble — the same models used by the IPCC — alongside historical storm records and satellite observations to tell a five-chapter data story about the relationship between human emissions choices and the future severity of tropical storms.

---

## Chapters

### 1 · The Past and Present of Storms
An animated timeline of over 300 Atlantic storms from 1970 to 2024. Each storm is represented as a hurricane glyph sized by tropical storm–force diameter and colored by peak wind speed. Key findings:
- Average tropical storm–force diameter grew 42% (105.7 → 150.0 nautical miles) from the 1970s to the 2020s.
- 2024 recorded the highest average wind speeds of any year in the dataset.
- Notable storms: Sam (2021, 93.2 kt), Milton (2024, 89.9 kt), Wilma (2005, 88.5 kt).

### 2 · 170 Years of Rising Greenhouse Gases
A multi-line chart showing historical and projected concentrations of CO₂, CH₄, and N₂O across five SSP emissions scenarios:
- **Historical baseline**
- **SSP1-2.6** — aggressive mitigation
- **SSP2-4.5** — moderate action
- **SSP3-7.0** — current policy trajectory
- **SSP5-8.5** — high emissions / fossil-fuel intensive

### 3 · Climate Projections for Our Stormy Future
An interactive globe showing gridded CMIP6 anomaly maps for four variables across all SSP scenarios and selectable time periods:
- Global surface temperature (ts)
- Sea surface temperature (tos)
- Sea level (zos)
- TC Heat Potential proxy (TCHP), computed from SST and sea level

A regional bar chart breaks down basin-level changes across the North Atlantic, Northwest Pacific, and North Indian Ocean.

### 4 · The Tipping Point Is Behind Us, but The Future Is Still Ours To Shape
A scrollytelling section with a 3-D globe illustrating TCHP evolution under different scenarios, delivering the project's central message: the future is not fixed, but the emissions choices made now determine how extreme it becomes.

### 5 · Behind The Storm: The Human Cost of Climate Change
44 years (1980–2024) of U.S. billion-dollar tropical cyclone disasters from NOAA's Billion-Dollar Weather and Climate Disasters database, CPI-adjusted. Includes a toggle to compare tropical cyclone damage against total U.S. disaster costs across all categories.

---

## Data Sources

| Dataset | Source | Use |
|---|---|---|
| Storm tracks & intensity | NOAA IBTrACS / aggregated CSV | Chapters 1, 5 |
| Greenhouse gas concentrations | SSP scenario data | Chapter 2 |
| CMIP6 climate projections | Coupled Model Intercomparison Project Phase 6 | Chapter 3, 4 |
| GOES satellite SST | NOAA GOES-East | Supplementary analysis |
| Billion-dollar disaster costs | NOAA Billion-Dollar Weather & Climate Disasters | Chapter 5 |

---

## Tech Stack

- **D3.js v7** — all charts, maps, and animations
- **Vanilla HTML / CSS / JavaScript** — no framework dependencies
- **iframe-based tab architecture** — each chapter loads independently and resizes via `postMessage`
- **Python (Jupyter)** — data processing notebooks in `notebooks/` and `storm_futures/data/goes/`

---

## Project Structure

```
storm_futures/
├── index.html              # Main shell: navigation, chapter routing
├── style.css               # Global styles
├── main.js / ghg.js        # Shared utilities
├── tabs/
│   ├── storm/              # Chapter 1 — storm timeline
│   ├── ghg/                # Chapter 2 — GHG projections
│   ├── map/                # Chapter 3 — climate anomaly globe
│   ├── scrolly/            # Chapter 4 — scrollytelling / TCHP
│   └── impact/             # Chapter 5 — human cost
└── data/
    ├── storm/              # Aggregated storm CSVs
    ├── ghg/                # GHG scenario CSV
    └── goes/               # GOES SST grids, CMIP6 SST scenarios
notebooks/
├── process_storms.ipynb    # Storm data cleaning and aggregation
└── process_cimp.ipynb      # CMIP6 data processing
```
