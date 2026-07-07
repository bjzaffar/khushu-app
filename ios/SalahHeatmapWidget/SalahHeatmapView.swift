import SwiftUI

struct SalahHeatmapView: View {
    let cells: [HeatmapCell]

    private let salahNames = ["fajr", "dhuhr", "asr", "maghrib", "isha"]
    private let dayLabels = ["M", "T", "W", "T", "F", "S", "S"]

    // Figma proportions (637×259 canvas)
    private let rowLabelWidthRatio: CGFloat = 0.18
    private let columnHeaderHeightRatio: CGFloat = 0.10
    private let cellAspectRatio: CGFloat = 1.0
    private let horizontalGapRatio: CGFloat = 3.3   // gap / cell width
    private let verticalGapRatio: CGFloat = 0.9     // gap / cell height
    private let cornerRadiusRatio: CGFloat = 0.2    // radius / cell size
    private let underlineHeightRatio: CGFloat = 0.15 // underline / cell height

    // Colors
    private let unloggedColor = Color(red: 0.773, green: 0.725, blue: 0.659) // #C5B9A8
    private let textColor = Color(red: 0.102, green: 0.098, blue: 0.090)     // #1A1917
    private let jumuahGold = Color(red: 0.788, green: 0.659, blue: 0.298)    // #C9A84C

    private let greenScale = [
        Color(red: 0.898, green: 0.929, blue: 0.898), // #E5EDE5  rating 1
        Color(red: 0.753, green: 0.847, blue: 0.753), // #C0D8C0  rating 2
        Color(red: 0.608, green: 0.761, blue: 0.608), // #9BC29B  rating 3
        Color(red: 0.459, green: 0.675, blue: 0.459), // #75AC75  rating 4
        Color(red: 0.353, green: 0.478, blue: 0.353), // #5A7A5A  rating 5
    ]

    var body: some View {
        GeometryReader { geo in
            let cellSize = computeCellSize(in: geo.size)
            let hGap = cellSize * horizontalGapRatio
            let vGap = cellSize * verticalGapRatio
            let rowLabelW = geo.size.width * rowLabelWidthRatio
            let colHeaderH = geo.size.height * columnHeaderHeightRatio
            let gridOrigin = CGPoint(x: rowLabelW, y: colHeaderH)

            ZStack(alignment: .topLeading) {
                // Column headers
                ForEach(0..<7, id: \.self) { col in
                    Text(dayLabels[col])
                        .font(.system(size: cellSize * 1.0, weight: .semibold))
                        .foregroundColor(textColor)
                        .frame(width: cellSize, height: colHeaderH)
                        .position(
                            x: gridOrigin.x + CGFloat(col) * (cellSize + hGap) + cellSize / 2,
                            y: colHeaderH / 2
                        )
                }

                // Row labels
                ForEach(0..<5, id: \.self) { row in
                    Text(salahNames[row].capitalized)
                        .font(.system(size: cellSize * 1.0, weight: .semibold))
                        .foregroundColor(textColor)
                        .frame(width: rowLabelW, height: cellSize)
                        .position(
                            x: rowLabelW / 2,
                            y: gridOrigin.y + CGFloat(row) * (cellSize + vGap) + cellSize / 2
                        )
                }

                // Cells
                ForEach(0..<35, id: \.self) { idx in
                    let row = idx / 7
                    let col = idx % 7
                    let cell = cells[idx]
                    let x = gridOrigin.x + CGFloat(col) * (cellSize + hGap)
                    let y = gridOrigin.y + CGFloat(row) * (cellSize + vGap)

                    cellView(cell: cell, size: cellSize)
                        .position(x: x + cellSize / 2, y: y + cellSize / 2)
                }
            }
        }
    }

    private func computeCellSize(in size: CGSize) -> CGFloat {
        let rowLabelW = size.width * rowLabelWidthRatio
        let gridW = size.width - rowLabelW
        let colHeaderH = size.height * columnHeaderHeightRatio
        let gridH = size.height - colHeaderH

        let cellFromWidth = gridW / (7 + 6 * horizontalGapRatio)
        let cellFromHeight = gridH / (5 + 4 * verticalGapRatio)

        return min(cellFromWidth, cellFromHeight)
    }

    @ViewBuilder
    private func cellView(cell: HeatmapCell, size: CGFloat) -> some View {
        let radius = size * cornerRadiusRatio
        let isFridayDhuhr = cell.day == "F" && cell.salah == "dhuhr"

        ZStack(alignment: .bottom) {
            RoundedRectangle(cornerRadius: radius)
                .fill(cellColor(for: cell))
                .frame(width: size, height: size)

            if isFridayDhuhr {
                RoundedRectangle(cornerRadius: 1)
                    .fill(jumuahGold)
                    .frame(width: size, height: size * underlineHeightRatio)
                    .offset(y: 0)
            }
        }
        .frame(width: size, height: size + (isFridayDhuhr ? size * underlineHeightRatio : 0))
    }

    private func cellColor(for cell: HeatmapCell) -> Color {
        guard let rating = cell.rating, rating >= 1, rating <= 5 else {
            return unloggedColor
        }
        return greenScale[rating - 1]
    }
}
