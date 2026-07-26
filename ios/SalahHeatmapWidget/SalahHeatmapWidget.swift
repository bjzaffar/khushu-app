import WidgetKit
import SwiftUI

struct SalahHeatmapProvider: TimelineProvider {
    func placeholder(in context: Context) -> SalahHeatmapEntry {
        let placeholderCells = (0..<35).map { _ in
            HeatmapCell(day: "", salah: "", rating: nil)
        }
        return SalahHeatmapEntry(
            date: Date(),
            cells: placeholderCells,
            weekStart: "",
            weekEnd: "",
            isPremium: false
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (SalahHeatmapEntry) -> Void) {
        let entry = loadEntry()
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SalahHeatmapEntry>) -> Void) {
        let entry = loadEntry()

        // Refresh at next Monday 00:00
        let calendar = Calendar.current
        let now = Date()
        let nextMonday: Date
        if let next = calendar.nextDate(after: now, matching: DateComponents(weekday: 2), matchingPolicy: .nextTime) {
            nextMonday = calendar.startOfDay(for: next)
        } else {
            nextMonday = calendar.date(byAdding: .day, value: 7, to: calendar.startOfDay(for: now))!
        }

        let timeline = Timeline(entries: [entry], policy: .after(nextMonday))
        completion(timeline)
    }

    private func loadEntry() -> SalahHeatmapEntry {
        let defaults = UserDefaults(suiteName: "group.com.khushuai.app")
        guard let data = defaults?.data(forKey: "widget_heatmap_data"),
              let decoded = try? JSONDecoder().decode(HeatmapData.self, from: data) else {
            // Return empty entry
            let emptyCells = (0..<35).map { _ in
                HeatmapCell(day: "", salah: "", rating: nil)
            }
            return SalahHeatmapEntry(date: Date(), cells: emptyCells, weekStart: "", weekEnd: "", isPremium: false)
        }

        return SalahHeatmapEntry(
            date: Date(),
            cells: data.cells,
            weekStart: data.weekStart,
            weekEnd: data.weekEnd,
            isPremium: data.isPremium ?? false
        )
    }
}

struct SalahHeatmapWidget: Widget {
    let kind: String = "SalahHeatmapWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SalahHeatmapProvider()) { entry in
            SalahHeatmapWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Prayer Heatmap")
        .description("Weekly prayer focus heatmap")
        .supportedFamilies([.systemMedium])
    }
}

struct SalahHeatmapWidgetEntryView: View {
    let entry: SalahHeatmapEntry

    var body: some View {
        ZStack {
            Color.white
            if entry.isPremium {
                SalahHeatmapView(cells: entry.cells)
                    .padding(8)
            } else {
                Link(destination: URL(string: "khushuai://paywall")!) {
                    VStack(spacing: 8) {
                        Text("Prayer Heatmap")
                            .font(.headline)
                            .foregroundStyle(Color(red: 0.31, green: 0.28, blue: 0.26))
                        Text("Premium feature\nTap to unlock")
                            .font(.subheadline)
                            .multilineTextAlignment(.center)
                            .foregroundStyle(Color(red: 0.44, green: 0.42, blue: 0.42))
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
        }
        .containerBackground(.fill, for: .widget)
    }
}

@main
struct SalahHeatmapWidgetBundle: WidgetBundle {
    var body: some Widget {
        SalahHeatmapWidget()
    }
}
