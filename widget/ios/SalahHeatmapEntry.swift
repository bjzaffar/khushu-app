import WidgetKit

struct SalahHeatmapEntry: TimelineEntry {
    let date: Date
    let cells: [HeatmapCell]
    let weekStart: String
    let weekEnd: String
    let isPremium: Bool
}

struct HeatmapCell: Codable {
    let day: String
    let salah: String
    let rating: Int?
}

struct HeatmapData: Codable {
    let cells: [HeatmapCell]
    let weekStart: String
    let weekEnd: String
    let isPremium: Bool?
}
