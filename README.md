# Affylo

Affylo is a standalone macOS desktop app for building group structure charts (companies + ownership links).

## Introduction

Built by a legal-tech enthusiast for his learned friends. Our work is never easy, so I believe we deserve better tools.

I built Affylo because, as an in-house counsel, I need to update company group charts from time to time. Most flowchart tools are not designed for this use case, and even when similar features exist, they are often locked behind subscription plans. Given the infrequent nature of this work, that cost is hard to justify from a budget perspective.

Hope you enjoy using Affylo. For any feedback or questions about using Affylo, please reach out to me at `eljhwng@gmail.com`.

## Install (DMG)

1. Open the DMG.
2. Drag `Affylo.app` into `Applications`.
3. Launch Affylo from Applications.

If macOS warns about an unidentified developer, right-click `Affylo.app` and choose **Open** once.

## Core Features

- Multiple charts in one workspace (create, switch, rename, delete).
- Card details editing (jurisdiction, directors, shareholders, remark, etc.).
- Relationship lines with editable labels.
- Selection mode with marquee select.
- Export current chart to PDF.
- Import/export chart data as portable JSON.

## Navigation and Shortcuts

- **View -> Center Chart** or **Cmd+H**: fit and center the full chart.
- Background drag: pan the canvas.
- Mouse wheel / trackpad: zoom.
- Edit mode toolbar: add company, add/delete connection, select.

## File Menu (macOS native)

- **File -> Export JSON...**  
  Export current chart to `.affylo.json` for transfer/backups.

- **File -> Import JSON...**  
  Import a previously exported `.affylo.json` chart file.

## Data Storage

Local app data is stored at:

`~/Library/Application Support/Affylo/data/chart.json`

This file contains your workspace charts and active chart state.

## Export PDF

- Toolbar button: **Export PDF**
- Captures chart bounds with padding
- Places output centered on A4 with margins

## Build from Source (for maintainers)

```bash
npm install
npm run electron:build
```

Generated installer:

`dist-electron/Affylo-1.0.0-arm64.dmg`

## Troubleshooting

- **Sidebar cannot be reopened:** use the edge arrow on the left side of the window.
