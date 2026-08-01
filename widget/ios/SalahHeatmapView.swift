import SwiftUI

struct SalahHeatmapView: View {
    let cells: [HeatmapCell]

    private let salahNames = ["fajr", "dhuhr", "asr", "maghrib", "isha"]
    private let dayLabels = ["M", "T", "W", "T", "F", "S", "S"]

    // Proportions shared with the Android 4x2 widget artwork.
    private let rowLabelWidthRatio: CGFloat = 0.19
    private let columnHeaderHeightRatio: CGFloat = 0.20
    private let horizontalGapRatio: CGFloat = 2.5
    private let verticalGapRatio: CGFloat = 0.9
    private let cornerRadiusRatio: CGFloat = 0.2
    private let underlineHeightRatio: CGFloat = 0.15
    private let underlineGapRatio: CGFloat = 0.12

    private let unloggedColor = Color(red: 0.773, green: 0.725, blue: 0.659) // #C5B9A8
    private let textColor = Color(red: 0.102, green: 0.098, blue: 0.090) // #1A1917
    private let jumuahGold = Color(red: 0.788, green: 0.659, blue: 0.298) // #C9A84C

    private let greenScale = [
        Color(red: 0.898, green: 0.929, blue: 0.898), // #E5EDE5
        Color(red: 0.753, green: 0.847, blue: 0.753), // #C0D8C0
        Color(red: 0.608, green: 0.761, blue: 0.608), // #9BC29B
        Color(red: 0.459, green: 0.675, blue: 0.459), // #75AC75
        Color(red: 0.353, green: 0.478, blue: 0.353), // #5A7A5A
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
                ForEach(0..<7, id: \.self) { col in
                    Text(dayLabels[col])
                        .font(.system(size: cellSize * 0.75, weight: .semibold))
                        .foregroundColor(textColor)
                        .frame(width: cellSize, height: colHeaderH)
                        .position(
                            x: gridOrigin.x + CGFloat(col) * (cellSize + hGap) + cellSize / 2,
                            y: colHeaderH / 2
                        )
                }

                ForEach(0..<5, id: \.self) { row in
                    Text(salahNames[row].capitalized)
                        .font(.system(size: cellSize * 0.80, weight: .semibold))
                        .foregroundColor(textColor)
                        .frame(width: rowLabelW, height: cellSize)
                        .position(
                            x: rowLabelW / 2,
                            y: gridOrigin.y + CGFloat(row) * (cellSize + vGap) + cellSize / 2
                        )
                }

                ForEach(0..<35, id: \.self) { index in
                    let row = index / 7
                    let col = index % 7
                    let cell = cells.indices.contains(col * 5 + row)
                        ? cells[col * 5 + row]
                        : HeatmapCell(day: "", salah: "", rating: nil)
                    let x = gridOrigin.x + CGFloat(col) * (cellSize + hGap)
                    let y = gridOrigin.y + CGFloat(row) * (cellSize + vGap)
                    let isFridayDhuhr = col == 4 && row == 1
                    let markerHeight = isFridayDhuhr
                        ? cellSize * (underlineGapRatio + underlineHeightRatio)
                        : 0

                    cellView(cell: cell, size: cellSize, isFridayDhuhr: isFridayDhuhr)
                        .position(x: x + cellSize / 2, y: y + (cellSize + markerHeight) / 2)
                }
            }
        }
    }

    private func computeCellSize(in size: CGSize) -> CGFloat {
        let gridW = size.width - (size.width * rowLabelWidthRatio)
        let gridH = size.height - (size.height * columnHeaderHeightRatio)
        let cellFromWidth = gridW / (7 + 6 * horizontalGapRatio)
        let cellFromHeight = gridH / (5 + 4 * verticalGapRatio)
        return min(cellFromWidth, cellFromHeight)
    }

    @ViewBuilder
    private func cellView(cell: HeatmapCell, size: CGFloat, isFridayDhuhr: Bool) -> some View {
        VStack(spacing: isFridayDhuhr ? size * underlineGapRatio : 0) {
            RoundedRectangle(cornerRadius: size * cornerRadiusRatio)
                .fill(cellColor(for: cell))
                .frame(width: size, height: size)

            if isFridayDhuhr {
                Rectangle()
                    .fill(jumuahGold)
                    .frame(width: size, height: size * underlineHeightRatio)
            }
        }
        .frame(
            width: size,
            height: size + (isFridayDhuhr ? size * (underlineGapRatio + underlineHeightRatio) : 0)
        )
    }

    private func cellColor(for cell: HeatmapCell) -> Color {
        guard let rating = cell.rating, rating >= 1, rating <= 5 else {
            return unloggedColor
        }
        return greenScale[rating - 1]
    }
}
