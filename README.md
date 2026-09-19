# SIWES Data Science Project Dashboard

A browser-based CSV analytics dashboard. It reads the data only on the visitor's device and creates a summary, missing-value analysis, statistics, interactive chart, filters, and correlation matrix.

## Run it locally

Open `index.html` in Chrome or Microsoft Edge, then upload a CSV file with a header row.

## Project files

- `index.html` — page structure and dashboard sections
- `styles.css` — dark modern visual design
- `app.js` — CSV reading, calculations, filters, chart, and CSV export

## Suggested feature roadmap

1. Add drag-and-drop upload and a sample CSV.
2. Add more visualizations: histogram, scatter plot, line chart, and box plot.
3. Let users select sum, average, median, count, or minimum/maximum for a chart.
4. Support Excel files with the SheetJS library.
5. Rebuild with React when the interface starts growing into multiple screens.
6. Add a server, login, and cloud storage only when users need saved and shared dashboards.

## Important beginner rule

Make one feature at a time, test it with a small CSV, and save your working version before beginning the next feature.
